//! Course sauvegardée de LMU : distinguer une **sauvegarde** d'un **abandon**.
//!
//! Sauvegarder une course en plein milieu (au stand, en week-end ou en coop) puis
//! quitter, ou recharger cette sauvegarde, fait passer `mFinishStatus` à 2 : sans
//! garde, l'ingénieur annonçait un abandon. LMU écrit alors la course dans
//! `UserData/Saves/` (copie dans `Saves/Backup Saves/`) : un `<id>.json` de la forme
//! `{"compressedData": base64(zlib(json)), ...}sig:<signature>`. Le JSON décompressé
//! porte la voiture du joueur (`vehicleName`), `retired` et `sessionFinished`. `retired`
//! n'est lu que pour la voiture du joueur : dans `playerVehicle` ou à côté de lui, jamais
//! dans une liste de voitures (celui d'un adversaire n'est pas celui du pilote).
//!
//! Ici on ne fait que **lire** : le fichier le plus récent (dans une fenêtre de
//! fraîcheur) qui correspond à la voiture du joueur. Format inattendu, dossier
//! absent, fichier illisible : `None` ou un résultat partiel, jamais une erreur.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::Serialize;

/// Taille max d'un fichier de sauvegarde lu (les vrais font quelques centaines de Ko).
const SAVE_MAX_BYTES: u64 = 16 * 1024 * 1024;
/// Taille max du JSON décompressé.
const INFLATE_MAX_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct RaceSave {
    pub file_name: String,
    /// Âge du fichier (s) au moment de la lecture.
    pub age_s: i64,
    /// Contenu décodé (sinon seuls le nom et l'âge sont fiables).
    pub decoded: bool,
    pub vehicle_name: Option<String>,
    pub retired: Option<bool>,
    pub session_finished: Option<bool>,
}

/// Décodage base64 standard (alphabet `+/`, remplissage `=` facultatif, blancs ignorés).
fn b64_decode(s: &str) -> Option<Vec<u8>> {
    let val = |c: u8| -> Option<u32> {
        Some(match c {
            b'A'..=b'Z' => (c - b'A') as u32,
            b'a'..=b'z' => (c - b'a' + 26) as u32,
            b'0'..=b'9' => (c - b'0' + 52) as u32,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            _ => return None,
        })
    };
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let (mut acc, mut bits) = (0u32, 0u32);
    for &c in s.as_bytes() {
        if c == b'=' || c.is_ascii_whitespace() {
            continue;
        }
        acc = (acc << 6) | val(c)?;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Some(out)
}

/// Décompresse zlib, sinon gzip, sinon deflate brut.
fn inflate(bytes: &[u8]) -> Option<String> {
    fn read_all(mut r: impl Read) -> Option<String> {
        let mut s = String::new();
        r.by_ref().take(INFLATE_MAX_BYTES).read_to_string(&mut s).ok()?;
        Some(s)
    }
    read_all(flate2::read::ZlibDecoder::new(bytes))
        .or_else(|| read_all(flate2::read::GzDecoder::new(bytes)))
        .or_else(|| read_all(flate2::read::DeflateDecoder::new(bytes)))
}

/// Premier objet JSON du texte (la signature `sig:…` suit l'accolade fermante).
fn leading_json(text: &str) -> Option<serde_json::Value> {
    let mut stream = serde_json::Deserializer::from_str(text.trim_start()).into_iter::<serde_json::Value>();
    stream.next()?.ok()
}

/// Cherche une clé (insensible à la casse) n'importe où dans l'arbre, en largeur.
fn find_key<'a>(v: &'a serde_json::Value, key: &str) -> Option<&'a serde_json::Value> {
    find_key_from(v, key, true)
}

/// Comme `find_key` ; `arrays: false` ne descend pas dans les listes.
fn find_key_from<'a>(v: &'a serde_json::Value, key: &str, arrays: bool) -> Option<&'a serde_json::Value> {
    let mut queue = std::collections::VecDeque::from([v]);
    while let Some(n) = queue.pop_front() {
        match n {
            serde_json::Value::Object(m) => {
                if let Some(x) = key_of(m, key) {
                    return Some(x);
                }
                queue.extend(m.values());
            }
            serde_json::Value::Array(a) if arrays => queue.extend(a.iter()),
            _ => {}
        }
    }
    None
}

/// Clé directe d'un objet, sans casse.
fn key_of<'a>(m: &'a serde_json::Map<String, serde_json::Value>, key: &str) -> Option<&'a serde_json::Value> {
    m.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)).map(|(_, x)| x)
}

/// Objet qui porte directement `key`, hors listes (en largeur).
fn holder_of<'a>(v: &'a serde_json::Value, key: &str) -> Option<&'a serde_json::Map<String, serde_json::Value>> {
    let mut queue = std::collections::VecDeque::from([v]);
    while let Some(n) = queue.pop_front() {
        if let serde_json::Value::Object(m) = n {
            if key_of(m, key).is_some() {
                return Some(m);
            }
            queue.extend(m.values());
        }
    }
    None
}

/// `retired` de la voiture du joueur : dans `playerVehicle`, sinon à côté de lui. Sans
/// `playerVehicle`, seulement hors listes. Introuvable : `None` (rien n'est supposé).
fn player_retired(inner: &serde_json::Value) -> Option<bool> {
    match holder_of(inner, "playerVehicle") {
        Some(h) => key_of(h, "playerVehicle")
            .and_then(|p| find_key_from(p, "retired", false))
            .or_else(|| key_of(h, "retired"))
            .and_then(|v| as_bool(Some(v))),
        None => as_bool(find_key_from(inner, "retired", false)),
    }
}

fn as_bool(v: Option<&serde_json::Value>) -> Option<bool> {
    match v? {
        serde_json::Value::Bool(b) => Some(*b),
        serde_json::Value::Number(n) => n.as_i64().map(|i| i != 0),
        serde_json::Value::String(s) => match s.to_ascii_lowercase().as_str() {
            "true" | "1" => Some(true),
            "false" | "0" => Some(false),
            _ => None,
        },
        _ => None,
    }
}

/// Lit le contenu d'une sauvegarde (texte du fichier) → (voiture, retired, sessionFinished).
fn parse_save(text: &str) -> Option<(Option<String>, Option<bool>, Option<bool>)> {
    let outer = leading_json(text)?;
    let inner = match outer.get("compressedData").and_then(|v| v.as_str()) {
        Some(b64) => leading_json(&inflate(&b64_decode(b64)?)?)?,
        None => outer,
    };
    let vehicle = find_key(&inner, "playerVehicle")
        .and_then(|p| find_key(p, "vehicleName"))
        .or_else(|| find_key(&inner, "vehicleName"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    Some((vehicle, player_retired(&inner), as_bool(find_key(&inner, "sessionFinished"))))
}

/// Même voiture : égalité ou inclusion, sans casse ni espaces de bord.
fn same_vehicle(a: &str, b: &str) -> bool {
    let (a, b) = (a.trim().to_lowercase(), b.trim().to_lowercase());
    !a.is_empty() && !b.is_empty() && (a == b || a.contains(&b) || b.contains(&a))
}

fn save_files(lmu_path: &Path) -> Vec<(PathBuf, SystemTime)> {
    let saves = lmu_path.join("UserData").join("Saves");
    let mut out = Vec::new();
    for dir in [saves.clone(), saves.join("Backup Saves")] {
        let Ok(rd) = fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            let is_json = p.extension().map(|x| x.eq_ignore_ascii_case("json")).unwrap_or(false);
            let Ok(meta) = e.metadata() else { continue };
            if !is_json || !meta.is_file() || meta.len() > SAVE_MAX_BYTES {
                continue;
            }
            if let Ok(m) = meta.modified() {
                out.push((p, m));
            }
        }
    }
    out
}

/// Sauvegarde de course récente (≤ `max_age_s`) pour la voiture `vehicle`, la plus
/// fraîche d'abord. Une sauvegarde d'une autre voiture est ignorée ; une sauvegarde
/// illisible compte quand même (`decoded: false`) : sa seule présence, à l'instant où
/// le jeu passe en « abandon », est l'indice d'une sauvegarde.
pub fn find_recent_save(lmu_path: &Path, vehicle: &str, max_age_s: u64, now: SystemTime) -> Option<RaceSave> {
    let mut files = save_files(lmu_path);
    files.sort_by(|a, b| b.1.cmp(&a.1));
    for (path, mtime) in files {
        let age = now.duration_since(mtime).map(|d| d.as_secs()).unwrap_or(0);
        if age > max_age_s {
            break;
        }
        let file_name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let parsed = fs::read(&path).ok().and_then(|b| parse_save(&String::from_utf8_lossy(&b)));
        match parsed {
            Some((veh, retired, finished)) => {
                if let Some(v) = &veh {
                    if !vehicle.trim().is_empty() && !same_vehicle(v, vehicle) {
                        continue;
                    }
                }
                return Some(RaceSave {
                    file_name,
                    age_s: age as i64,
                    decoded: true,
                    vehicle_name: veh,
                    retired,
                    session_finished: finished,
                });
            }
            None => {
                return Some(RaceSave {
                    file_name,
                    age_s: age as i64,
                    decoded: false,
                    vehicle_name: None,
                    retired: None,
                    session_finished: None,
                })
            }
        }
    }
    None
}

/// Commande : sauvegarde de course récente pour la voiture du joueur, ou `None`.
#[tauri::command]
pub fn recent_race_save(lmu_path: String, vehicle: String, max_age_s: Option<u64>) -> Option<RaceSave> {
    if lmu_path.trim().is_empty() {
        return None;
    }
    find_recent_save(Path::new(&lmu_path), &vehicle, max_age_s.unwrap_or(600), SystemTime::now())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn zlib_b64(json: &str) -> String {
        let mut e = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
        e.write_all(json.as_bytes()).unwrap();
        let bytes = e.finish().unwrap();
        const A: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut s = String::new();
        for c in bytes.chunks(3) {
            let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
            for i in 0..4 {
                if i <= c.len() {
                    s.push(A[((n >> (18 - 6 * i)) & 63) as usize] as char);
                } else {
                    s.push('=');
                }
            }
        }
        s
    }

    #[test]
    fn decodes_compressed_save_with_signature() {
        let inner = r#"{"playerVehicle":{"vehicleName":"Ferrari 296 GT3 #21"},"totalLaps":12,"sessionFinished":false,"retired":false}"#;
        let text = format!(r#"{{"compressedData":"{}","version":3}}sig:ABCDEF=="#, zlib_b64(inner));
        let (veh, retired, finished) = parse_save(&text).unwrap();
        assert_eq!(veh.as_deref(), Some("Ferrari 296 GT3 #21"));
        assert_eq!(retired, Some(false));
        assert_eq!(finished, Some(false));
    }

    #[test]
    fn reads_plain_json_and_numeric_flags() {
        let text = r#"{"race":{"PlayerVehicle":{"VehicleName":"Porsche 963"},"Retired":1}}sig:x"#;
        let (veh, retired, finished) = parse_save(text).unwrap();
        assert_eq!(veh.as_deref(), Some("Porsche 963"));
        assert_eq!(retired, Some(true));
        assert_eq!(finished, None);
    }

    #[test]
    fn retired_of_another_car_is_ignored() {
        // Une liste de voitures (format supposé) : l'abandon d'un adversaire ne compte pas.
        let text = r#"{"playerVehicle":{"vehicleName":"BMW M4 GT3"},"retired":false,"vehicles":[{"vehicleName":"Toyota GR010","retired":true}]}"#;
        assert_eq!(parse_save(text).unwrap().1, Some(false));
        let inside = r#"{"grid":[{"retired":true}],"playerVehicle":{"vehicleName":"BMW M4 GT3","retired":true}}"#;
        assert_eq!(parse_save(inside).unwrap().1, Some(true));
        let no_flag = r#"{"playerVehicle":{"vehicleName":"BMW M4 GT3"},"vehicles":[{"retired":true}]}"#;
        assert_eq!(parse_save(no_flag).unwrap().1, None);
        let no_player = r#"{"vehicles":[{"retired":true}]}"#;
        assert_eq!(parse_save(no_player).unwrap().1, None);
    }

    #[test]
    fn garbage_is_none() {
        assert!(parse_save("pas du json").is_none());
        assert!(parse_save(r#"{"compressedData":"%%%"}"#).is_none());
    }

    #[test]
    fn finds_fresh_save_for_player_vehicle_only() {
        let dir = std::env::temp_dir().join(format!("lmu_save_test_{}", std::process::id()));
        let saves = dir.join("UserData").join("Saves");
        fs::create_dir_all(saves.join("Backup Saves")).unwrap();
        let mine = format!(
            r#"{{"compressedData":"{}"}}sig:z"#,
            zlib_b64(r#"{"playerVehicle":{"vehicleName":"BMW M4 GT3"},"retired":false}"#)
        );
        let other = format!(
            r#"{{"compressedData":"{}"}}sig:z"#,
            zlib_b64(r#"{"playerVehicle":{"vehicleName":"Toyota GR010"},"retired":false}"#)
        );
        fs::write(saves.join("a.json"), mine).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(30));
        fs::write(saves.join("Backup Saves").join("b.json"), other).unwrap();
        let now = SystemTime::now();
        let s = find_recent_save(&dir, "BMW M4 GT3", 600, now).unwrap();
        assert_eq!(s.file_name, "a.json");
        assert_eq!(s.retired, Some(false));
        assert!(find_recent_save(&dir, "Cadillac V-Series.R", 600, now).is_none());
        // trop vieux : la fenêtre de fraîcheur exclut tout
        let later = now + std::time::Duration::from_secs(3600);
        assert!(find_recent_save(&dir, "BMW M4 GT3", 600, later).is_none());
        let _ = fs::remove_dir_all(&dir);
    }
}
