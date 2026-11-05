//! Écritures dans le jeu via son API locale — **opt-in, action explicite**.
//!
//! Le pont `lmu_rest.rs` reste en lecture seule. Ici, une seule écriture : un
//! élément du menu des stands (`PitMenu/loadPitMenu`), toujours précédée d'une
//! lecture du menu courant et suivie d'une **relecture** qui confirme que le jeu
//! a pris la valeur. Rien n'est écrit tout seul côté Rust : c'est le front qui
//! appelle, seulement si l'utilisateur a activé les écritures dans la Config.
//!
//! Mêmes garde-fous que la lecture : boucle locale, sans proxy ni redirection,
//! délai court, corps borné.

use serde::Serialize;
use serde_json::Value;

use super::lmu_rest::{build_client, fetch_json, loopback_base, route_allowed_now, session_ready, FetchError, LMU_REST_PORT};
use crate::error::AppError;

const ROUTE_MENU_GET: &str = "/rest/garage/PitMenu/receivePitMenu";
const ROUTE_MENU_SET: &str = "/rest/garage/PitMenu/loadPitMenu";

/// Un élément du menu des stands, tel que le jeu le décrit.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PitMenuItem {
    pub name: String,
    /// Index de l'option choisie.
    pub current: i64,
    /// Libellés des options, dans l'ordre du jeu.
    pub options: Vec<String>,
}

/// Le menu peut arriver en tableau nu ou sous `pitMenu` (une ou deux fois).
fn menu_array(v: &Value) -> Option<&Vec<Value>> {
    v.as_array()
        .or_else(|| v.pointer("/pitMenu").and_then(Value::as_array))
        .or_else(|| v.pointer("/pitMenu/pitMenu").and_then(Value::as_array))
}

pub fn parse_menu(v: &Value) -> Vec<PitMenuItem> {
    menu_array(v)
        .map(|items| {
            items
                .iter()
                .filter_map(|it| {
                    let name = it.get("name")?.as_str()?.trim().to_string();
                    let current = it.get("currentSetting")?.as_i64()?;
                    let options = it
                        .get("settings")
                        .and_then(Value::as_array)
                        .map(|a| a.iter().map(|o| o.get("text").and_then(Value::as_str).unwrap_or("").trim().to_string()).collect())
                        .unwrap_or_default();
                    Some(PitMenuItem { name, current, options })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Copie du menu reçu avec `currentSetting` changé pour l'élément `name`.
/// `None` si l'élément est absent ou l'index hors des options.
pub fn with_setting(v: &Value, name: &str, index: i64) -> Option<Value> {
    let mut out = v.clone();
    let arr = if out.is_array() {
        out.as_array_mut()?
    } else if out.pointer("/pitMenu/pitMenu").is_some_and(Value::is_array) {
        out.pointer_mut("/pitMenu/pitMenu")?.as_array_mut()?
    } else {
        out.pointer_mut("/pitMenu")?.as_array_mut()?
    };
    let item = arr.iter_mut().find(|it| it.get("name").and_then(Value::as_str).map(str::trim) == Some(name.trim()))?;
    let n = item.get("settings").and_then(Value::as_array).map(Vec::len).unwrap_or(0) as i64;
    if index < 0 || index >= n {
        return None;
    }
    item["currentSetting"] = Value::from(index);
    Some(out)
}

/// Même garde que le pont (`route_allowed`) : jamais de requête `garage/*` sans
/// séance confirmée, ni hors piste (LMU peut planter si on l'interroge pendant son
/// initialisation, au garage ou sur ses écrans). Le réglage « Interroger le jeu
/// hors piste » lève la seconde condition.
fn require_allowed(route: &str) -> Result<(), AppError> {
    if !session_ready() {
        return Err(code("no_session"));
    }
    if !route_allowed_now(route) {
        return Err(code("off_track"));
    }
    Ok(())
}

/// Erreur renvoyée à l'interface : un code stable, traduit côté front
/// (`pitMenuErrorKey`, `lib/lmuRest.ts`), jamais une phrase dans une langue.
fn code(c: &str) -> AppError {
    AppError::Unsupported(format!("pit_menu:{c}"))
}

fn err(e: FetchError) -> AppError {
    match e {
        FetchError::Unreachable => code("no_response"),
        _ => code("bad_response"),
    }
}

/// Lit le menu des stands du jeu.
#[tauri::command]
pub async fn get_pit_menu() -> Result<Vec<PitMenuItem>, AppError> {
    require_allowed(ROUTE_MENU_GET)?;
    tauri::async_runtime::spawn_blocking(|| {
        let client = build_client().ok_or_else(|| AppError::Internal("client HTTP".to_string()))?;
        let v = fetch_json(&client, &loopback_base(LMU_REST_PORT), ROUTE_MENU_GET).map_err(err)?;
        Ok(parse_menu(&v))
    })
    .await
    .map_err(|e| AppError::Internal(format!("pit menu: {e}")))?
}

/// Règle un élément du menu des stands puis relit le menu : `true` si le jeu
/// affiche bien la nouvelle valeur.
#[tauri::command]
pub async fn set_pit_menu_item(name: String, index: i64) -> Result<bool, AppError> {
    require_allowed(ROUTE_MENU_SET)?;
    tauri::async_runtime::spawn_blocking(move || {
        let client = build_client().ok_or_else(|| AppError::Internal("client HTTP".to_string()))?;
        let base = loopback_base(LMU_REST_PORT);
        let current = fetch_json(&client, &base, ROUTE_MENU_GET).map_err(err)?;
        let body = with_setting(&current, &name, index).ok_or_else(|| {
            crate::app_warn!("Menu des stands : élément « {name} » ou option {index} absent");
            code("no_item")
        })?;
        let payload = menu_array(&body).map(|a| Value::Array(a.clone())).unwrap_or(body);
        let resp = client
            .post(format!("{base}{ROUTE_MENU_SET}"))
            .json(&payload)
            .send()
            .map_err(|_| err(FetchError::Unreachable))?;
        if !resp.status().is_success() {
            crate::app_warn!("Menu des stands : réglage refusé par le jeu (HTTP {})", resp.status().as_u16());
            return Err(code("refused"));
        }
        let after = fetch_json(&client, &base, ROUTE_MENU_GET).map_err(err)?;
        Ok(parse_menu(&after).iter().any(|it| it.name == name.trim() && it.current == index))
    })
    .await
    .map_err(|e| AppError::Internal(format!("pit menu: {e}")))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn menu() -> Value {
        json!([
            {"name": "VIRTUAL ENERGY:", "currentSetting": 2, "settings": [{"text": "No Change"}, {"text": "40% 8.1 laps"}, {"text": "50% 10.1 laps"}]},
            {"name": "TIRES:", "currentSetting": 0, "settings": [{"text": "No Change"}, {"text": "Medium"}]}
        ])
    }

    #[test]
    fn pit_menu_routes_follow_the_on_track_rule() {
        use super::super::lmu_rest::{route_allowed, PlayerSpot::*};
        for route in [ROUTE_MENU_GET, ROUTE_MENU_SET] {
            assert!(route_allowed(route, true, Driving, false), "{route} en piste");
            for spot in [GarageStall, Frozen, Absent] {
                assert!(!route_allowed(route, true, spot, false), "{route} {spot:?}");
                assert!(route_allowed(route, true, spot, true), "{route} {spot:?} réglage hors piste");
            }
            assert!(!route_allowed(route, false, Driving, true), "{route} sans séance");
        }
    }

    #[test]
    fn parses_bare_and_wrapped_menus() {
        let m = parse_menu(&menu());
        assert_eq!(m.len(), 2);
        assert_eq!(m[0], PitMenuItem { name: "VIRTUAL ENERGY:".into(), current: 2, options: vec!["No Change".into(), "40% 8.1 laps".into(), "50% 10.1 laps".into()] });
        assert_eq!(parse_menu(&json!({"pitMenu": menu()})).len(), 2);
        assert_eq!(parse_menu(&json!({"pitMenu": {"pitMenu": menu()}})).len(), 2);
        assert!(parse_menu(&json!({"x": 1})).is_empty());
    }

    #[test]
    fn changes_only_the_named_item_within_bounds() {
        let v = with_setting(&menu(), "VIRTUAL ENERGY:", 1).unwrap();
        let m = parse_menu(&v);
        assert_eq!(m[0].current, 1);
        assert_eq!(m[1].current, 0, "les autres éléments ne bougent pas");
        assert!(with_setting(&menu(), "VIRTUAL ENERGY:", 3).is_none(), "index hors options");
        assert!(with_setting(&menu(), "FUEL:", 0).is_none(), "élément absent");
        let wrapped = with_setting(&json!({"pitMenu": {"pitMenu": menu()}}), "TIRES:", 1).unwrap();
        assert_eq!(parse_menu(&wrapped)[1].current, 1);
    }
}
