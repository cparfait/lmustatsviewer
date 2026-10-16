//! Pont REST LMU — **lecture seule**.
//!
//! Le jeu sert une API HTTP locale (`127.0.0.1:6397`, celle de son interface
//! web) qui expose des données absentes de la mémoire partagée : prévision
//! météo de la séance, table « N % → M tours » du menu des stands, durée
//! prévue de l'arrêt, usure des plaquettes, durée de séance dès la formation,
//! bornes des réglages du setup.
//!
//! Règles :
//! - **GET uniquement**, boucle locale uniquement (`127.0.0.1`), redirections
//!   refusées, délai 1,2 s, corps ≤ 512 Ko, recul exponentiel jusqu'à 60 s
//!   quand le jeu ne répond pas.
//! - Un thread dédié interroge l'API ; la boucle live (`live.rs`) **ne fait
//!   jamais de réseau** : elle copie le dernier instantané (`live_view`).
//! - Chaque valeur porte un état de fraîcheur : absent / vide / invalide /
//!   périmé (> 8 s) / frais. Le front ne se sert que des valeurs fraîches et
//!   retombe sinon sur son comportement d'avant (mémoire partagée, `.wet`…).
//!
//! Les formes JSON viennent de la documentation publique des routes (schéma
//! Swagger du jeu, relevés communautaires). Le parsing est volontairement
//! tolérant (`serde_json::Value`) : un champ manquant donne `None`, jamais une
//! erreur de toute la route.

use std::io::Read;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;

use crate::error::AppError;

/// Port de l'API locale du jeu.
pub const LMU_REST_PORT: u16 = 6397;
/// Délai max d'une requête (connexion + réponse).
const REQUEST_TIMEOUT: Duration = Duration::from_millis(1200);
/// Taille max d'un corps de réponse (RepairAndRefuel, le plus gros, fait ~100 Ko).
pub const MAX_BODY_BYTES: usize = 512 * 1024;
/// Au-delà, une valeur est « périmée ».
pub const STALE_AFTER: Duration = Duration::from_secs(8);
/// Recul initial puis plafond quand le jeu ne répond pas.
const BACKOFF_START: Duration = Duration::from_secs(2);
const BACKOFF_MAX: Duration = Duration::from_secs(60);

/// Cadences de lecture par route.
const EVERY_FAST: Duration = Duration::from_secs(2);
const EVERY_GARAGE: Duration = Duration::from_secs(5);
const EVERY_WEATHER: Duration = Duration::from_secs(60);
/// Tracé du circuit : une lecture réussie par circuit, nouvel essai sinon.
const EVERY_TRACKMAP: Duration = Duration::from_secs(30);

pub const ROUTE_VEHICLE: &str = "/rest/garage/getVehicleCondition";
pub const ROUTE_PIT: &str = "/rest/garage/UIScreen/RepairAndRefuel";
pub const ROUTE_SESSION: &str = "/rest/watch/sessionInfo";
pub const ROUTE_WEATHER: &str = "/rest/sessions/weather";
pub const ROUTE_GARAGE: &str = "/rest/garage/getPlayerGarageData";
pub const ROUTE_TRACKMAP: &str = "/rest/watch/trackmap";

// ═══════════════════════════════════════════════════════════════════════════
// Fraîcheur
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Freshness {
    /// Jamais reçu (jeu muet, route inconnue).
    Absent,
    /// Le jeu a répondu sans contenu exploitable (hors séance…).
    Empty,
    /// Réponse illisible : code HTTP ≠ 2xx, redirection, corps trop gros, JSON faux.
    Invalid,
    /// Dernière valeur valide plus vieille que `STALE_AFTER`.
    Stale,
    Fresh,
}

/// Valeur d'une route + horodatage de la dernière lecture valide.
struct Slot<T> {
    value: Option<T>,
    last_ok: Option<Instant>,
    /// Échec de contenu (vide / invalide) de la **dernière** tentative.
    last_error: Option<Freshness>,
}

impl<T> Default for Slot<T> {
    fn default() -> Self {
        Slot { value: None, last_ok: None, last_error: None }
    }
}

impl<T: Clone> Slot<T> {
    fn set_ok(&mut self, v: T, now: Instant) {
        self.value = Some(v);
        self.last_ok = Some(now);
        self.last_error = None;
    }

    fn set_error(&mut self, kind: Freshness) {
        self.last_error = Some(kind);
    }

    /// Plus fraîche du tout (hors séance) ; la dernière valeur reste lisible.
    fn forget(&mut self) {
        self.last_ok = None;
        self.last_error = Some(Freshness::Absent);
    }

    /// État à l'instant `now`. Une valeur récente reste « fraîche » même si
    /// une tentative isolée a échoué ; au-delà de 8 s, l'échec prend le pas.
    fn freshness(&self, now: Instant) -> Freshness {
        match self.last_ok {
            None => self.last_error.unwrap_or(Freshness::Absent),
            Some(t) if now.saturating_duration_since(t) <= STALE_AFTER => Freshness::Fresh,
            Some(_) => self.last_error.unwrap_or(Freshness::Stale),
        }
    }

    fn view(&self, now: Instant) -> RestField<T> {
        RestField {
            state: self.freshness(now),
            age_ms: self
                .last_ok
                .map(|t| now.saturating_duration_since(t).as_millis() as u64),
            data: self.value.clone(),
        }
    }
}

/// Une valeur exposée au front avec son état.
#[derive(Debug, Clone, Serialize)]
pub struct RestField<T> {
    pub state: Freshness,
    /// Âge de la dernière lecture valide (ms) ; `None` si jamais reçue.
    pub age_ms: Option<u64>,
    pub data: Option<T>,
}

// ═══════════════════════════════════════════════════════════════════════════
// Données exposées
// ═══════════════════════════════════════════════════════════════════════════

/// `getVehicleCondition` : état mécanique (ordre des roues FL, FR, RL, RR).
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct VehicleCondition {
    pub fuel: Option<f64>,
    pub fuel_capacity: Option<f64>,
    /// État des plaquettes (1 = neuves, 0 = usées). Absent de la mémoire partagée.
    pub brake_condition: Vec<f64>,
    pub tire_condition: Vec<f64>,
    pub suspension_damage: Vec<f64>,
    pub vehicle_damage: Option<f64>,
}

/// Un nœud de prévision (START, 25 %, 50 %, 75 %, FINISH de la séance).
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ForecastNode {
    /// Chance de pluie (%).
    pub rain_chance: f64,
    /// Température d'air (°C).
    pub temperature: f64,
    /// Ciel (indice 0 = clair … orage).
    pub sky: f64,
    /// Humidité (%).
    pub humidity: f64,
}

/// Unité d'une ligne de la table du menu des stands.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TableUnit {
    Percent,
    Liters,
    Gallons,
}

/// Une ligne « N % → M tours » (ou « N L → M tours ») du menu des stands.
#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
pub struct TableEntry {
    pub value: f64,
    pub unit: TableUnit,
    pub laps: f64,
}

/// Réglage actuellement choisi dans le menu des stands (nom → texte affiché).
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PitMenuChoice {
    pub name: String,
    pub text: String,
}

/// `UIScreen/RepairAndRefuel` : écran « réparations et ravitaillement ».
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PitScreen {
    /// Table du jeu pour l'énergie virtuelle (voitures concernées).
    pub energy_table: Vec<TableEntry>,
    /// Table du jeu pour le carburant (voitures sans énergie virtuelle).
    pub fuel_table: Vec<TableEntry>,
    /// Conso officielle d'énergie virtuelle (fraction du plein par tour, 0-1).
    pub energy_per_lap: Option<f64>,
    /// Conso officielle de carburant (L/tour).
    pub fuel_per_lap: Option<f64>,
    /// Durée prévue de l'arrêt avec le menu actuel (s).
    pub pit_stop_length_s: Option<f64>,
    pub current_fuel: Option<f64>,
    pub max_fuel: Option<f64>,
    /// Énergie virtuelle restante (fraction 0-1), si la voiture en a.
    pub energy_fraction: Option<f64>,
    /// Prévision météo de la séance en cours (5 nœuds).
    pub forecast: Vec<ForecastNode>,
    pub place_in_class: Option<i32>,
    pub place_overall: Option<i32>,
    pub gap_to_class_leader_s: Option<f64>,
    pub gap_to_class_leader_laps: Option<i32>,
    /// Dégâts aéro (0 = intact).
    pub aero_damage: Option<f64>,
    /// Freins vus par l'écran (FL, FR, RL, RR) : grandeur brute (≈ 0,038 sur
    /// des disques neufs, probablement une épaisseur en m), PAS une fraction.
    pub brake_wear: Vec<f64>,
    /// Suspension et pneus vus par l'écran (FL, FR, RL, RR ; pneus 1 = neufs).
    pub suspension_wear: Vec<f64>,
    pub tire_wear: Vec<f64>,
    /// Choix courants du menu des stands (sans la liste des options).
    pub pit_menu: Vec<PitMenuChoice>,
}

/// `watch/sessionInfo` : méta de séance, renseignées dès la formation.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct SessionInfo {
    pub session: String,
    pub game_phase: Option<i32>,
    pub current_event_time: Option<f64>,
    pub start_event_time: Option<f64>,
    pub end_event_time: Option<f64>,
    pub max_time: Option<f64>,
    pub maximum_laps: Option<f64>,
    pub time_remaining_in_phase: Option<f64>,
    /// Part de la course écoulée (0-1) selon le jeu.
    pub race_completion: Option<f64>,
    pub track_name: String,
}

/// `sessions/weather` : prévision des trois séances du week-end.
#[derive(Debug, Clone, Serialize, PartialEq, Default)]
pub struct WeekendWeather {
    pub practice: Vec<ForecastNode>,
    pub qualify: Vec<ForecastNode>,
    pub race: Vec<ForecastNode>,
}

/// Une ligne de `getPlayerGarageData` : bornes d'un réglage.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct SettingBound {
    pub key: String,
    pub value: f64,
    pub min: f64,
    pub max: f64,
    pub text: String,
}

/// Tracé du circuit fourni par le jeu (`watch/trackmap`), dans le même repère
/// monde que `mPos` de la mémoire partagée (vérifié à Road Atlanta : 2,4 m
/// d'écart médian avec le tracé appris en roulant, ligne de course vs axe).
#[derive(Debug, Clone, PartialEq)]
pub struct GameTrackMap {
    /// Nom du circuit (`sessionInfo.trackName`) au moment de la lecture.
    pub track: String,
    /// Boucle de course (points de type 0, dans l'ordre), x/z.
    pub racing: Vec<[f64; 2]>,
    /// Voie des stands (type 1), x/z.
    pub pit_lane: Vec<[f64; 2]>,
}

/// Instantané envoyé avec chaque trame `live-data` (compact : pas de garage).
#[derive(Debug, Clone, Serialize)]
pub struct LmuRestLive {
    /// Le jeu a répondu (n'importe quel code HTTP) à la dernière tentative.
    pub reachable: bool,
    /// Recul en cours (s) quand le jeu ne répond pas, sinon 0.
    pub backoff_s: u64,
    pub vehicle: RestField<VehicleCondition>,
    pub pit: RestField<PitScreen>,
    pub session: RestField<SessionInfo>,
    pub weather: RestField<WeekendWeather>,
    /// État seul des bornes de setup (données via `get_lmu_garage_bounds`).
    pub garage_state: Freshness,
}

// ═══════════════════════════════════════════════════════════════════════════
// Parsing (tolérant)
// ═══════════════════════════════════════════════════════════════════════════

fn num(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(Value::as_f64).filter(|x| x.is_finite())
}

fn int(v: &Value, key: &str) -> Option<i32> {
    num(v, key).map(|x| x.round() as i32)
}

fn text(v: &Value, key: &str) -> String {
    v.get(key).and_then(Value::as_str).unwrap_or_default().to_string()
}

fn nums(v: &Value, key: &str) -> Vec<f64> {
    v.get(key)
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_f64).collect())
        .unwrap_or_default()
}

/// Résultat d'un parsing de route : données, ou réponse sans contenu.
#[derive(Debug, PartialEq)]
pub enum Parsed<T> {
    Data(T),
    Empty,
}

fn as_object(v: &Value) -> Option<&serde_json::Map<String, Value>> {
    v.as_object().filter(|o| !o.is_empty())
}

pub fn parse_vehicle(v: &Value) -> Result<Parsed<VehicleCondition>, ()> {
    let Some(_) = as_object(v) else {
        return if v.is_null() || v.is_object() { Ok(Parsed::Empty) } else { Err(()) };
    };
    let c = VehicleCondition {
        fuel: num(v, "fuel"),
        fuel_capacity: num(v, "fuelCapacity"),
        brake_condition: nums(v, "brakeCondition"),
        tire_condition: nums(v, "tireCondition"),
        suspension_damage: nums(v, "suspensionDamage"),
        vehicle_damage: num(v, "vehicleDamage"),
    };
    let useful = c.fuel.is_some() || !c.brake_condition.is_empty() || !c.tire_condition.is_empty();
    Ok(if useful { Parsed::Data(c) } else { Parsed::Empty })
}

/// Lit un nombre décimal (point ou virgule) au début de `s`.
fn leading_number(s: &str) -> Option<(f64, &str)> {
    let s = s.trim_start();
    let end = s
        .char_indices()
        .find(|&(i, c)| !(c.is_ascii_digit() || ((c == '.' || c == ',') && i > 0)))
        .map(|(i, _)| i)
        .unwrap_or(s.len());
    if end == 0 {
        return None;
    }
    let raw = s[..end].trim_end_matches(['.', ',']);
    let n: f64 = raw.replace(',', ".").parse().ok()?;
    Some((n, &s[raw.len()..]))
}

/// Une option du menu des stands. Relevé sur le jeu (oct. 2026) : « 99% 39 laps »,
/// « 3% 1 tour » (mot de la langue du jeu, tours **entiers**) ; d'autres écrans
/// affichent « 100% (39.8 laps) ». On ne lit que les nombres : valeur + unité,
/// puis le premier nombre qui suit (tours). Toute autre forme (« Aucun
/// changement », « 1.02 », « P3 (-15) »…) est ignorée.
pub fn parse_table_text(s: &str) -> Option<TableEntry> {
    let (value, rest) = leading_number(s)?;
    let rest_t = rest.trim_start();
    let lower = rest_t.to_ascii_lowercase();
    let (unit, after) = if let Some(r) = rest_t.strip_prefix('%') {
        (TableUnit::Percent, r)
    } else if lower.starts_with("gal") {
        (TableUnit::Gallons, &rest_t[3..])
    } else if lower.starts_with('l')
        && !lower[1..].starts_with(|c: char| c.is_ascii_alphabetic())
    {
        (TableUnit::Liters, &rest_t[1..])
    } else {
        return None;
    };
    // Les tours : premier nombre après l'unité (séparateurs « ( », « / », espaces).
    let start = after.find(|c: char| c.is_ascii_digit())?;
    let between = &after[..start];
    if !between.chars().all(|c| c.is_whitespace() || c == '(' || c == '/' || c == '~') {
        return None;
    }
    let (laps, _) = leading_number(&after[start..])?;
    let value_ok = match unit {
        TableUnit::Percent => (0.0..=110.0).contains(&value),
        TableUnit::Liters | TableUnit::Gallons => (0.0..=500.0).contains(&value),
    };
    if !value_ok || !(0.0..1000.0).contains(&laps) {
        return None;
    }
    Some(TableEntry { value, unit, laps })
}

/// Conso par tour déduite d'une table : pente (moindres carrés passant par
/// l'origine) de la quantité en fonction des tours. Le jeu affiche des tours
/// **tronqués** (« 100% 39 laps » pour 39,8) : quand toutes les lignes sont
/// entières, on compte un demi-tour de plus. Pour une table en %, résultat en
/// fraction du plein.
pub fn per_lap_from_table(table: &[TableEntry], unit: TableUnit, capacity: Option<f64>) -> Option<f64> {
    let rows: Vec<(f64, f64)> = table
        .iter()
        .filter(|e| e.laps >= 3.0)
        .filter_map(|e| {
            let q = match (e.unit, unit) {
                (a, b) if a == b => match a {
                    TableUnit::Percent => e.value / 100.0,
                    TableUnit::Liters => e.value,
                    TableUnit::Gallons => e.value * 3.785_411_784,
                },
                // Table en % d'un réservoir de carburant : convertie en litres.
                (TableUnit::Percent, TableUnit::Liters) => e.value / 100.0 * capacity.filter(|c| *c > 0.0)?,
                _ => return None,
            };
            Some((e.laps, q))
        })
        .collect();
    if rows.is_empty() {
        return None;
    }
    let truncated = rows.iter().all(|(l, _)| l.fract() == 0.0);
    let adj = if truncated { 0.5 } else { 0.0 };
    let (num, den) = rows.iter().fold((0.0, 0.0), |(n, d), (l, q)| {
        let l = l + adj;
        (n + l * q, d + l * l)
    });
    let per = num / den;
    (per.is_finite() && per > 0.0).then_some(per)
}

fn forecast_from_columns(nodes: &Value) -> Vec<ForecastNode> {
    let rain = nums(nodes, "RainChance");
    let temp = nums(nodes, "Temperature");
    let sky = nums(nodes, "Sky");
    let hum = nums(nodes, "Humidity");
    let n = rain.len().min(temp.len());
    (0..n)
        .map(|i| ForecastNode {
            rain_chance: rain[i],
            temperature: temp[i],
            sky: sky.get(i).copied().unwrap_or(0.0),
            humidity: hum.get(i).copied().unwrap_or(0.0),
        })
        .collect()
}

pub fn parse_pit_screen(v: &Value) -> Result<Parsed<PitScreen>, ()> {
    let Some(_) = as_object(v) else {
        return if v.is_null() || v.is_object() { Ok(Parsed::Empty) } else { Err(()) };
    };
    let fuel_info = v.get("fuelInfo").cloned().unwrap_or(Value::Null);
    let max_fuel = num(&fuel_info, "maxFuel").filter(|x| *x > 0.0);
    let energy_fraction = match (
        num(&fuel_info, "currentVirtualEnergy"),
        num(&fuel_info, "maxVirtualEnergy"),
    ) {
        (Some(c), Some(m)) if m > 0.0 => Some((c / m).clamp(0.0, 1.0)),
        _ => None,
    };

    let mut energy_table = Vec::new();
    let mut fuel_table = Vec::new();
    let mut pit_menu = Vec::new();
    let items = v
        .pointer("/pitMenu/pitMenu")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for item in &items {
        let name = text(item, "name");
        let upper = name.to_ascii_uppercase();
        let options = item.get("settings").and_then(Value::as_array);
        let texts: Vec<String> = options
            .map(|a| a.iter().map(|o| text(o, "text")).collect())
            .unwrap_or_default();
        if let Some(cur) = num(item, "currentSetting") {
            if let Some(t) = texts.get(cur.max(0.0) as usize) {
                pit_menu.push(PitMenuChoice { name: name.trim().to_string(), text: t.trim().to_string() });
            }
        }
        let target = if upper.contains("ENERGY") {
            Some(&mut energy_table)
        } else if upper.contains("FUEL") && !upper.contains("RATIO") {
            Some(&mut fuel_table)
        } else {
            None
        };
        if let Some(table) = target {
            table.extend(texts.iter().filter_map(|t| parse_table_text(t)));
        }
    }
    // Garde-fou : bornée (un menu exotique ne gonfle pas chaque trame live).
    energy_table.truncate(128);
    fuel_table.truncate(128);

    let energy_per_lap = per_lap_from_table(&energy_table, TableUnit::Percent, None);
    let fuel_per_lap = per_lap_from_table(&fuel_table, TableUnit::Liters, max_fuel);
    let wear = v.get("wearables").cloned().unwrap_or(Value::Null);
    let pos = v.get("racePosition").cloned().unwrap_or(Value::Null);
    let forecast = v
        .pointer("/weatherForecast/nodes")
        .map(forecast_from_columns)
        .unwrap_or_default();

    let screen = PitScreen {
        energy_per_lap,
        fuel_per_lap,
        energy_table,
        fuel_table,
        pit_stop_length_s: v
            .pointer("/pitStopLength/timeInSeconds")
            .and_then(Value::as_f64)
            .filter(|x| x.is_finite() && *x >= 0.0),
        current_fuel: num(&fuel_info, "currentFuel"),
        max_fuel,
        energy_fraction,
        forecast,
        place_in_class: int(&pos, "placeInClass").filter(|p| *p > 0),
        place_overall: int(&pos, "placeOverall").filter(|p| *p > 0),
        gap_to_class_leader_s: num(&pos, "gapToFirstInClassTime"),
        gap_to_class_leader_laps: int(&pos, "gapToFirstInClassLaps"),
        aero_damage: wear.pointer("/body/aero").and_then(Value::as_f64),
        brake_wear: nums(&wear, "brakes"),
        suspension_wear: nums(&wear, "suspension"),
        tire_wear: nums(&wear, "tires"),
        pit_menu,
    };
    let useful = screen.max_fuel.is_some()
        || !screen.forecast.is_empty()
        || screen.pit_stop_length_s.is_some()
        || !screen.pit_menu.is_empty();
    Ok(if useful { Parsed::Data(screen) } else { Parsed::Empty })
}

pub fn parse_session(v: &Value) -> Result<Parsed<SessionInfo>, ()> {
    let Some(_) = as_object(v) else {
        return if v.is_null() || v.is_object() { Ok(Parsed::Empty) } else { Err(()) };
    };
    let s = SessionInfo {
        session: text(v, "session"),
        game_phase: int(v, "gamePhase"),
        current_event_time: num(v, "currentEventTime"),
        start_event_time: num(v, "startEventTime"),
        end_event_time: num(v, "endEventTime"),
        max_time: num(v, "maxTime"),
        maximum_laps: num(v, "maximumLaps"),
        time_remaining_in_phase: num(v, "timeRemainingInGamePhase"),
        race_completion: v
            .pointer("/raceCompletion/timeCompletion")
            .and_then(Value::as_f64)
            .filter(|x| x.is_finite()),
        track_name: text(v, "trackName"),
    };
    let useful = !s.session.is_empty() || s.current_event_time.is_some();
    Ok(if useful { Parsed::Data(s) } else { Parsed::Empty })
}

/// Séance de `sessions/weather` : nœuds START, NODE_25, NODE_50, NODE_75,
/// FINISH, chaque champ sous la forme `{currentValue, stringValue}`.
fn weekend_nodes(session: &Value) -> Vec<ForecastNode> {
    const ORDER: [&str; 5] = ["START", "NODE_25", "NODE_50", "NODE_75", "FINISH"];
    let field = |node: &Value, key: &str| node.pointer(&format!("/{key}/currentValue")).and_then(Value::as_f64);
    ORDER
        .iter()
        .filter_map(|k| session.get(*k))
        .filter_map(|node| {
            Some(ForecastNode {
                rain_chance: field(node, "WNV_RAIN_CHANCE")?,
                temperature: field(node, "WNV_TEMPERATURE")?,
                sky: field(node, "WNV_SKY").unwrap_or(0.0),
                humidity: field(node, "WNV_HUMIDITY").unwrap_or(0.0),
            })
        })
        .collect()
}

pub fn parse_weather(v: &Value) -> Result<Parsed<WeekendWeather>, ()> {
    let Some(_) = as_object(v) else {
        return if v.is_null() || v.is_object() { Ok(Parsed::Empty) } else { Err(()) };
    };
    let pick = |k: &str| v.get(k).map(weekend_nodes).unwrap_or_default();
    let w = WeekendWeather { practice: pick("PRACTICE"), qualify: pick("QUALIFY"), race: pick("RACE") };
    let useful = !(w.practice.is_empty() && w.qualify.is_empty() && w.race.is_empty());
    Ok(if useful { Parsed::Data(w) } else { Parsed::Empty })
}

/// `watch/trackmap` : tableau de points `{type, x, y, z}`. Relevé : type 0 =
/// boucle de course, 1 = voie des stands, au-delà = paires de points des box.
pub fn parse_trackmap(v: &Value) -> Result<Parsed<GameTrackMap>, ()> {
    let Some(arr) = v.as_array() else {
        return if v.is_null() || v.is_object() { Ok(Parsed::Empty) } else { Err(()) };
    };
    let mut racing = Vec::new();
    let mut pit_lane = Vec::new();
    for p in arr {
        let (Some(t), Some(x), Some(z)) = (num(p, "type"), num(p, "x"), num(p, "z")) else {
            continue;
        };
        match t as i64 {
            0 => racing.push([x, z]),
            1 => pit_lane.push([x, z]),
            _ => {}
        }
    }
    if racing.len() < 50 {
        return Ok(Parsed::Empty);
    }
    Ok(Parsed::Data(GameTrackMap { track: String::new(), racing, pit_lane }))
}

pub fn parse_garage(v: &Value) -> Result<Parsed<Vec<SettingBound>>, ()> {
    let Some(obj) = as_object(v) else {
        return if v.is_null() || v.is_object() { Ok(Parsed::Empty) } else { Err(()) };
    };
    let mut out: Vec<SettingBound> = obj
        .iter()
        .filter(|(_, s)| s.get("available").and_then(Value::as_bool).unwrap_or(true))
        .filter_map(|(k, s)| {
            let min = num(s, "minValue")?;
            let max = num(s, "maxValue")?;
            (max >= min).then(|| SettingBound {
                key: k.clone(),
                value: num(s, "value").unwrap_or(min),
                min,
                max,
                text: text(s, "stringValue"),
            })
        })
        .collect();
    out.sort_by(|a, b| a.key.cmp(&b.key));
    out.truncate(400);
    Ok(if out.is_empty() { Parsed::Empty } else { Parsed::Data(out) })
}

// ═══════════════════════════════════════════════════════════════════════════
// Client HTTP (GET, boucle locale)
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Debug, PartialEq)]
pub enum FetchError {
    /// Pas de réponse (connexion refusée, délai dépassé) : le jeu est muet.
    Unreachable,
    /// Le jeu a répondu sans contenu.
    Empty,
    /// Réponse inexploitable (code HTTP, redirection, taille, encodage).
    Invalid,
}

/// Base d'URL **forcée** sur la boucle locale : aucun hôte n'est paramétrable.
pub fn loopback_base(port: u16) -> String {
    format!("http://127.0.0.1:{port}")
}

pub fn build_client() -> Option<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .connect_timeout(REQUEST_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        // Un proxy système ne doit jamais voir passer la boucle locale.
        .no_proxy()
        .build()
        .ok()
}

/// Corps → texte. Le jeu répond en `text/plain` sans charset, et l'encodage
/// varie selon la route (relevé : `sessions/weather` en UTF-8, le menu des
/// stands en Windows-1252 — « Mouillé ») : UTF-8 strict, sinon Latin-1.
pub fn decode_body(body: &[u8]) -> String {
    match std::str::from_utf8(body) {
        Ok(s) => s.to_string(),
        Err(_) => body.iter().map(|&b| b as char).collect(),
    }
}

/// GET `base + path`, corps borné à `MAX_BODY_BYTES`, décodé puis lu en JSON.
pub fn fetch_json(client: &reqwest::blocking::Client, base: &str, path: &str) -> Result<Value, FetchError> {
    debug_assert!(base.starts_with("http://127.0.0.1:"));
    let resp = client
        .get(format!("{base}{path}"))
        .send()
        .map_err(|e| if e.is_timeout() || e.is_connect() { FetchError::Unreachable } else { FetchError::Invalid })?;
    if !resp.status().is_success() {
        // 3xx compris : les redirections sont refusées.
        return Err(FetchError::Invalid);
    }
    if resp.content_length().is_some_and(|n| n as usize > MAX_BODY_BYTES) {
        return Err(FetchError::Invalid);
    }
    let mut body = Vec::new();
    resp.take(MAX_BODY_BYTES as u64 + 1)
        .read_to_end(&mut body)
        .map_err(|_| FetchError::Unreachable)?;
    if body.len() > MAX_BODY_BYTES {
        return Err(FetchError::Invalid);
    }
    let txt = decode_body(&body);
    let txt = txt.trim();
    if txt.is_empty() {
        return Err(FetchError::Empty);
    }
    serde_json::from_str(txt).map_err(|_| FetchError::Invalid)
}

// ═══════════════════════════════════════════════════════════════════════════
// État partagé + interrogateur
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Default)]
struct Store {
    vehicle: Slot<VehicleCondition>,
    pit: Slot<PitScreen>,
    session: Slot<SessionInfo>,
    weather: Slot<WeekendWeather>,
    garage: Slot<Vec<SettingBound>>,
    track_map: Slot<GameTrackMap>,
    reachable: bool,
    backoff: Duration,
}

impl Store {
    fn live(&self, now: Instant) -> LmuRestLive {
        LmuRestLive {
            reachable: self.reachable,
            backoff_s: self.backoff.as_secs(),
            vehicle: self.vehicle.view(now),
            pit: self.pit.view(now),
            session: self.session.view(now),
            weather: self.weather.view(now),
            garage_state: self.garage.freshness(now),
        }
    }
}

static STORE: Mutex<Option<Store>> = Mutex::new(None);
static WORKER: AtomicBool = AtomicBool::new(false);
/// Une séance est **chargée** dans le jeu (pas seulement la mémoire partagée
/// présente) : rien n'est interrogé sinon. Cf. `set_sim_present`.
static SIM_PRESENT: AtomicBool = AtomicBool::new(false);
/// Incrémenté à chaque nouveau tracé de circuit lu (évite de copier le tracé à
/// chaque trame : la boucle live ne le relit que quand ce numéro change).
static TRACK_MAP_GEN: AtomicU64 = AtomicU64::new(0);

fn with_store<R>(f: impl FnOnce(&mut Store) -> R) -> Option<R> {
    let mut g = STORE.lock().ok()?;
    Some(f(g.get_or_insert_with(Store::default)))
}

/// Copie du dernier instantané (appelé par la boucle live : verrou bref, aucun réseau).
pub fn live_view() -> Option<LmuRestLive> {
    with_store(|s| s.live(Instant::now()))
}

/// Numéro du dernier tracé de circuit lu (0 = aucun).
pub fn track_map_generation() -> u64 {
    TRACK_MAP_GEN.load(Ordering::Relaxed)
}

/// Copie du dernier tracé de circuit lu dans le jeu.
pub fn track_map() -> Option<GameTrackMap> {
    with_store(|s| s.track_map.value.clone()).flatten()
}

/// Signalé par la boucle live à chaque trame : vrai seulement quand une séance
/// est chargée (horloge démarrée, voitures présentes ; une pause ne l'éteint pas).
///
/// ⚠️ Relevé réel (2026-10-16, deux plantages de suite) : LMU **plante au
/// lancement** si on interroge `garage/getVehicleCondition` juste après
/// l'ouverture de son serveur REST (13,7 s), pendant `Game::Setup` : `sessionInfo`
/// répond vide, la requête garage reste pendante, le jeu meurt 1,2 s plus tard.
/// La mémoire partagée existe dès 9,4 s : ce n'est donc pas un signal suffisant.
pub fn set_sim_present(present: bool) {
    SIM_PRESENT.store(present, Ordering::Relaxed);
}

/// Prochaine échéance de chaque route.
struct Schedule {
    due: [Instant; 6],
}

/// `sessionInfo` d'abord : les autres routes en dépendent (`session_ready`).
const ROUTES: [(&str, Duration); 6] = [
    (ROUTE_SESSION, EVERY_FAST),
    (ROUTE_VEHICLE, EVERY_FAST),
    (ROUTE_PIT, EVERY_FAST),
    (ROUTE_WEATHER, EVERY_WEATHER),
    (ROUTE_GARAGE, EVERY_GARAGE),
    (ROUTE_TRACKMAP, EVERY_TRACKMAP),
];

/// Recul suivant : 2 s, 4 s, 8 s… plafonné à 60 s.
pub fn next_backoff(current: Duration) -> Duration {
    if current.is_zero() {
        BACKOFF_START
    } else {
        (current * 2).min(BACKOFF_MAX)
    }
}

/// Range un résultat dans le bon emplacement. Renvoie `false` si le jeu est muet.
fn record(store: &mut Store, route: &str, res: Result<Value, FetchError>, now: Instant) -> bool {
    fn apply<T: Clone>(
        slot: &mut Slot<T>,
        res: Result<Value, FetchError>,
        parse: fn(&Value) -> Result<Parsed<T>, ()>,
        now: Instant,
    ) -> bool {
        match res {
            Err(FetchError::Unreachable) => return false,
            Err(FetchError::Empty) => slot.set_error(Freshness::Empty),
            Err(FetchError::Invalid) => slot.set_error(Freshness::Invalid),
            Ok(v) => match parse(&v) {
                Ok(Parsed::Data(d)) => slot.set_ok(d, now),
                Ok(Parsed::Empty) => slot.set_error(Freshness::Empty),
                Err(()) => slot.set_error(Freshness::Invalid),
            },
        }
        true
    }
    match route {
        ROUTE_VEHICLE => apply(&mut store.vehicle, res, parse_vehicle, now),
        ROUTE_PIT => apply(&mut store.pit, res, parse_pit_screen, now),
        ROUTE_SESSION => apply(&mut store.session, res, parse_session, now),
        ROUTE_WEATHER => apply(&mut store.weather, res, parse_weather, now),
        ROUTE_GARAGE => apply(&mut store.garage, res, parse_garage, now),
        ROUTE_TRACKMAP => {
            let track = store.session.value.as_ref().map(|s| s.track_name.clone()).unwrap_or_default();
            let before = store.track_map.last_ok;
            let ok = apply(&mut store.track_map, res, parse_trackmap, now);
            if store.track_map.last_ok != before {
                if let Some(m) = store.track_map.value.as_mut() {
                    m.track = track;
                }
                TRACK_MAP_GEN.fetch_add(1, Ordering::Relaxed);
            }
            ok
        }
        _ => true,
    }
}

/// Le tracé n'est lu qu'une fois par circuit : quand la séance (fraîche) est
/// sur un autre circuit que le dernier tracé lu.
fn track_map_wanted() -> bool {
    with_store(|s| {
        let Some(session) = s.session.value.as_ref() else { return false };
        if s.session.freshness(Instant::now()) != Freshness::Fresh || session.track_name.is_empty() {
            return false;
        }
        s.track_map.value.as_ref().map(|m| m.track != session.track_name).unwrap_or(true)
    })
    .unwrap_or(false)
}

/// Délai après l'entrée en séance avant la première requête (le jeu finit de
/// charger le circuit ; son serveur ne répond de toute façon pas pendant le chargement).
pub const SETTLE_AFTER_SESSION: Duration = Duration::from_secs(5);

/// `sessionInfo` vient de décrire une vraie séance (fraîche, avec un circuit).
/// Condition pour toucher aux routes `garage/*` et `watch/trackmap`.
pub fn session_ready() -> bool {
    with_store(|s| {
        s.session.freshness(Instant::now()) == Freshness::Fresh
            && s.session.value.as_ref().is_some_and(|v| !v.track_name.is_empty())
    })
    .unwrap_or(false)
}

/// Route autorisée sans séance confirmée par le jeu (seulement `sessionInfo`).
pub fn needs_session(route: &str) -> bool {
    route != ROUTE_SESSION
}

/// Un passage : interroge les routes échues. Le réseau se fait **hors verrou** ;
/// le verrou n'est pris que pour ranger chaque résultat.
fn poll_due(client: &reqwest::blocking::Client, base: &str, sched: &mut Schedule) {
    let now = Instant::now();
    for (i, (route, every)) in ROUTES.iter().enumerate() {
        if now < sched.due[i] {
            continue;
        }
        if needs_session(route) && !session_ready() {
            // Pas de séance confirmée : on ne touche pas au garage (risque de
            // plantage du jeu en cours d'initialisation), on réessaie bientôt.
            sched.due[i] = now + EVERY_FAST;
            continue;
        }
        if *route == ROUTE_TRACKMAP && !track_map_wanted() {
            sched.due[i] = now + *every;
            continue;
        }
        let res = fetch_json(client, base, route);
        let done = Instant::now();
        let answered = with_store(|s| {
            let ok = record(s, route, res, done);
            s.reachable = ok;
            if ok {
                s.backoff = Duration::ZERO;
            } else {
                s.backoff = next_backoff(s.backoff);
            }
            (ok, s.backoff)
        });
        match answered {
            Some((true, _)) => sched.due[i] = done + *every,
            Some((false, backoff)) => {
                // Jeu muet : toutes les routes attendent la fin du recul.
                for d in sched.due.iter_mut() {
                    *d = (*d).max(done + backoff);
                }
                return;
            }
            None => return,
        }
    }
}

/// Démarre le thread s'il ne tourne pas. Il s'arrête quand `keep_running`
/// renvoie faux (plus aucune fenêtre n'écoute le flux live).
pub fn ensure_worker(keep_running: fn() -> bool) {
    if WORKER.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || {
        let Some(client) = build_client() else {
            WORKER.store(false, Ordering::SeqCst);
            return;
        };
        let base = loopback_base(LMU_REST_PORT);
        let now = Instant::now();
        let mut sched = Schedule { due: [now; 6] };
        let mut was_present = false;
        loop {
            if !keep_running() {
                WORKER.store(false, Ordering::SeqCst);
                // Course stop → start : si quelqu'un a relancé entre-temps sans
                // pouvoir démarrer de thread (drapeau encore levé), on reprend.
                if keep_running() && !WORKER.swap(true, Ordering::SeqCst) {
                    continue;
                }
                return;
            }
            let present = SIM_PRESENT.load(Ordering::Relaxed);
            if present && !was_present {
                // Séance tout juste chargée : on oublie le recul accumulé et on
                // laisse le jeu se poser avant la première requête.
                let start = Instant::now() + SETTLE_AFTER_SESSION;
                sched.due = [start; 6];
                with_store(|s| s.backoff = Duration::ZERO);
            }
            if !present {
                // Hors séance : on oublie aussi la dernière séance vue, pour que
                // les routes garage attendent une nouvelle confirmation du jeu.
                with_store(|s| {
                    s.reachable = false;
                    s.session.forget();
                });
            }
            was_present = present;
            if present {
                poll_due(&client, &base, &mut sched);
            }
            std::thread::sleep(Duration::from_millis(250));
        }
    });
}

/// Bornes des réglages du setup (`getPlayerGarageData`, lu toutes les ~5 s).
/// Valeurs figées par le jeu au chargement de la voiture : pas des valeurs live.
#[tauri::command]
pub fn get_lmu_garage_bounds() -> Result<RestField<Vec<SettingBound>>, AppError> {
    with_store(|s| s.garage.view(Instant::now()))
        .ok_or_else(|| AppError::Internal("lmu rest store lock".into()))
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::Write;
    use std::net::TcpListener;

    #[test]
    fn table_text_variants() {
        let e = parse_table_text("55% (12.3 laps)").unwrap();
        assert_eq!((e.value, e.unit, e.laps), (55.0, TableUnit::Percent, 12.3));
        let e = parse_table_text("100% (28.7 ラップ)").unwrap();
        assert_eq!((e.value, e.laps), (100.0, 28.7));
        let e = parse_table_text("45.0L (12,5 tours)").unwrap();
        assert_eq!((e.value, e.unit, e.laps), (45.0, TableUnit::Liters, 12.5));
        let e = parse_table_text("12 gal / 7.1 laps").unwrap();
        assert_eq!(e.unit, TableUnit::Gallons);
        // Formes relevées sur le jeu réel (oct. 2026).
        let e = parse_table_text("99% 39 laps").unwrap();
        assert_eq!((e.value, e.unit, e.laps), (99.0, TableUnit::Percent, 39.0));
        let e = parse_table_text("3% 1 tour").unwrap();
        assert_eq!((e.value, e.laps), (3.0, 1.0));
        assert!(parse_table_text("Aucun changement").is_none());
        assert!(parse_table_text("1.02").is_none());
        assert!(parse_table_text("P3 (-15)").is_none());
        assert!(parse_table_text("132 (+1)").is_none());
        assert!(parse_table_text("50% Medium 3").is_none());
        assert!(parse_table_text("No Change").is_none());
        assert!(parse_table_text("+2").is_none());
        assert!(parse_table_text("55%").is_none());
        assert!(parse_table_text("55 Laps (3)").is_none());
        assert!(parse_table_text("900% (2 laps)").is_none());
    }

    fn pct(v: f64, l: f64) -> TableEntry {
        TableEntry { value: v, unit: TableUnit::Percent, laps: l }
    }

    #[test]
    fn per_lap_slope_with_decimal_laps() {
        let t = vec![pct(0.0, 0.0), pct(2.0, 0.4), pct(50.0, 10.5), pct(60.0, 12.0), pct(70.0, 14.0)];
        let f = per_lap_from_table(&t, TableUnit::Percent, None).unwrap();
        assert!((f - 0.05).abs() < 0.001, "{f}");
        // Table en % d'un réservoir → litres via la capacité.
        let l = per_lap_from_table(&t, TableUnit::Liters, Some(100.0)).unwrap();
        assert!((l - 5.0).abs() < 0.1);
        assert!(per_lap_from_table(&t, TableUnit::Liters, None).is_none());
    }

    #[test]
    fn per_lap_from_truncated_game_table() {
        // Hypercar à Road Atlanta (relevé réel) : 100 % = 39,8 tours, le menu
        // affiche des tours tronqués (k % → floor(k × 0,398)).
        let t: Vec<TableEntry> = (0..=100).map(|k| pct(k as f64, (k as f64 * 0.398).floor())).collect();
        let f = per_lap_from_table(&t, TableUnit::Percent, None).unwrap();
        let truth = 1.0 / 39.8;
        assert!((f - truth).abs() / truth < 0.01, "{f} vs {truth}");
    }

    #[test]
    fn decode_body_falls_back_to_latin1() {
        assert_eq!(decode_body("Mouillé".as_bytes()), "Mouillé");
        assert_eq!(decode_body(&[b'M', b'o', b'u', b'i', b'l', b'l', 0xE9]), "Mouillé");
    }

    fn pit_fixture() -> Value {
        json!({
            "fuelInfo": {"currentFuel": 60.5, "maxFuel": 110.0,
                         "currentVirtualEnergy": 425500000.0, "maxVirtualEnergy": 851000000.0},
            "pitMenu": {"pitMenu": [
                {"name": "VIRTUAL ENERGY:", "currentSetting": 2,
                 "settings": [{"text": "No Change"}, {"text": "40% 8.1 laps"}, {"text": "50% 10.1 tours"}, {"text": "60% (12.1 laps)"}]},
                {"name": "FUEL RATIO:", "currentSetting": 0, "settings": [{"text": "1.02"}]},
                {"name": "TIRES:", "currentSetting": 1, "settings": [{"text": "No Change"}, {"text": "Medium"}]}
            ]},
            "pitStopLength": {"timeInSeconds": 31.4},
            "racePosition": {"placeInClass": 3, "placeOverall": 9, "gapToFirstInClassTime": 12.5, "gapToFirstInClassLaps": 0},
            "wearables": {"body": {"aero": 0.1}, "brakes": [0.9, 0.9, 0.95, 0.95], "suspension": [0,0,0,0], "tires": [0.8,0.8,0.85,0.85]},
            "weatherForecast": {"nodes": {"RainChance": [0, 10, 60, 80, 20], "Temperature": [18, 19, 17, 16, 18],
                                          "Sky": [1, 2, 5, 6, 3], "Humidity": [70, 72, 90, 95, 80]}}
        })
    }

    #[test]
    fn pit_screen_parses_tables_menu_and_forecast() {
        let Parsed::Data(p) = parse_pit_screen(&pit_fixture()).unwrap() else { panic!() };
        assert_eq!(p.energy_table.len(), 3);
        assert!((p.energy_per_lap.unwrap() - 0.0495).abs() < 0.001, "{:?}", p.energy_per_lap);
        assert_eq!(p.fuel_table.len(), 0, "FUEL RATIO n'est pas une table de carburant");
        assert_eq!(p.pit_stop_length_s, Some(31.4));
        assert_eq!(p.energy_fraction, Some(0.5));
        assert_eq!(p.forecast.len(), 5);
        assert_eq!(p.forecast[3].rain_chance, 80.0);
        assert_eq!(p.place_in_class, Some(3));
        assert_eq!(p.aero_damage, Some(0.1));
        assert_eq!(p.pit_menu[0], PitMenuChoice { name: "VIRTUAL ENERGY:".into(), text: "50% 10.1 tours".into() });
        assert_eq!(p.pit_menu.len(), 3);
    }

    #[test]
    fn empty_and_invalid_shapes() {
        assert_eq!(parse_pit_screen(&json!({})).unwrap(), Parsed::Empty);
        assert_eq!(parse_vehicle(&Value::Null).unwrap(), Parsed::Empty);
        assert!(parse_session(&json!([1, 2])).is_err());
        assert!(parse_weather(&json!("x")).is_err());
        assert_eq!(parse_vehicle(&json!({"foo": 1})).unwrap(), Parsed::Empty);
    }

    #[test]
    fn session_and_weekend_weather() {
        let Parsed::Data(s) = parse_session(&json!({
            "session": "RACE1", "gamePhase": 3, "currentEventTime": 12.0, "endEventTime": 3600.0,
            "maxTime": 3600.0, "raceCompletion": {"timeCompletion": 0.0}, "trackName": "Spa"
        })).unwrap() else { panic!() };
        assert_eq!(s.game_phase, Some(3));
        assert_eq!(s.end_event_time, Some(3600.0));
        let node = |r: f64, t: f64| json!({"WNV_RAIN_CHANCE": {"currentValue": r, "stringValue": ""},
                                           "WNV_TEMPERATURE": {"currentValue": t}, "WNV_SKY": {"currentValue": 1}});
        let Parsed::Data(w) = parse_weather(&json!({
            "RACE": {"START": node(0.0, 20.0), "NODE_25": node(10.0, 21.0), "NODE_50": node(50.0, 19.0),
                     "NODE_75": node(70.0, 18.0), "FINISH": node(30.0, 18.0)}
        })).unwrap() else { panic!() };
        assert_eq!(w.race.len(), 5);
        assert_eq!(w.race[2].rain_chance, 50.0);
        assert!(w.practice.is_empty());
    }

    #[test]
    fn garage_bounds_keep_available_settings() {
        let Parsed::Data(g) = parse_garage(&json!({
            "VM_BRAKE_BALANCE": {"available": true, "minValue": 0, "maxValue": 40, "value": 22, "stringValue": "54.0:46.0"},
            "VM_FRONT_WING": {"available": false, "minValue": 0, "maxValue": 5, "value": 1},
            "VM_BROKEN": {"available": true, "minValue": 5, "maxValue": 1}
        })).unwrap() else { panic!() };
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].key, "VM_BRAKE_BALANCE");
        assert_eq!(g[0].max, 40.0);
    }

    #[test]
    fn trackmap_splits_racing_loop_and_pit_lane() {
        let mut pts: Vec<Value> = (0..60).map(|i| json!({"type": 0, "x": i as f64, "y": 0.0, "z": 0.0})).collect();
        pts.extend((0..5).map(|i| json!({"type": 1, "x": i as f64, "y": 0.0, "z": 5.0})));
        pts.push(json!({"type": 7, "x": 1.0, "y": 0.0, "z": 9.0}));
        let Parsed::Data(m) = parse_trackmap(&Value::Array(pts)).unwrap() else { panic!() };
        assert_eq!(m.racing.len(), 60);
        assert_eq!(m.pit_lane.len(), 5);
        assert_eq!(parse_trackmap(&json!([{"type": 0, "x": 1, "z": 2}])).unwrap(), Parsed::Empty);
        assert!(parse_trackmap(&json!(3)).is_err());
    }

    #[test]
    fn freshness_states() {
        let t0 = Instant::now();
        let mut s: Slot<i32> = Slot::default();
        assert_eq!(s.freshness(t0), Freshness::Absent);
        s.set_error(Freshness::Invalid);
        assert_eq!(s.freshness(t0), Freshness::Invalid);
        s.set_ok(1, t0);
        assert_eq!(s.freshness(t0 + Duration::from_secs(3)), Freshness::Fresh);
        assert_eq!(s.freshness(t0 + Duration::from_secs(9)), Freshness::Stale);
        s.set_error(Freshness::Empty);
        // Récent : une tentative ratée ne gâche pas une valeur fraîche.
        assert_eq!(s.freshness(t0 + Duration::from_secs(3)), Freshness::Fresh);
        assert_eq!(s.freshness(t0 + Duration::from_secs(9)), Freshness::Empty);
        assert_eq!(s.view(t0 + Duration::from_secs(9)).data, Some(1));
    }

    #[test]
    fn only_session_info_before_a_confirmed_session() {
        // Plantage relevé au lancement du jeu : aucune route garage/watch sans
        // séance confirmée par `sessionInfo`.
        assert!(!needs_session(ROUTE_SESSION));
        for r in [ROUTE_VEHICLE, ROUTE_PIT, ROUTE_WEATHER, ROUTE_GARAGE, ROUTE_TRACKMAP] {
            assert!(needs_session(r), "{r}");
        }
        assert_eq!(ROUTES[0].0, ROUTE_SESSION, "sessionInfo interrogé en premier");
        let t0 = Instant::now();
        let mut slot: Slot<u8> = Slot::default();
        slot.set_ok(1, t0);
        assert_eq!(slot.freshness(t0), Freshness::Fresh);
        slot.forget();
        assert_eq!(slot.freshness(t0), Freshness::Absent, "hors séance : plus fraîche");
        assert_eq!(slot.value, Some(1));
    }

    #[test]
    fn backoff_doubles_up_to_60s() {
        let mut d = Duration::ZERO;
        let mut seen = vec![];
        for _ in 0..8 {
            d = next_backoff(d);
            seen.push(d.as_secs());
        }
        assert_eq!(seen, vec![2, 4, 8, 16, 32, 60, 60, 60]);
    }

    #[test]
    fn base_is_always_loopback() {
        assert_eq!(loopback_base(6397), "http://127.0.0.1:6397");
    }

    /// Mini serveur HTTP : répond `responses[i]` à la i-ème connexion.
    fn serve(responses: Vec<Vec<u8>>) -> u16 {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for r in responses {
                let Ok((mut s, _)) = l.accept() else { return };
                let mut buf = [0u8; 4096];
                let _ = std::io::Read::read(&mut s, &mut buf);
                let _ = s.write_all(&r);
            }
        });
        port
    }

    fn http(status: &str, extra: &str, body: &[u8]) -> Vec<u8> {
        let mut v = format!(
            "HTTP/1.1 {status}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n{extra}\r\n",
            body.len()
        )
        .into_bytes();
        v.extend_from_slice(body);
        v
    }

    #[test]
    fn client_reads_json_refuses_redirects_and_big_bodies() {
        let big = vec![b' '; MAX_BODY_BYTES + 10];
        let port = serve(vec![
            http("200 OK", "", "{\"fuel\": 12.5, \"brakeCondition\": [0.9,0.9,0.9,0.9]}".as_bytes()),
            http("302 Found", "Location: http://example.com/\r\n", b""),
            http("200 OK", "", &big),
            http("200 OK", "", b""),
            http("200 OK", "", b"not json"),
            http("404 Not Found", "", b""),
        ]);
        let client = build_client().unwrap();
        let base = loopback_base(port);
        let v = fetch_json(&client, &base, ROUTE_VEHICLE).unwrap();
        assert_eq!(v["fuel"], 12.5);
        assert_eq!(fetch_json(&client, &base, ROUTE_VEHICLE), Err(FetchError::Invalid));
        assert_eq!(fetch_json(&client, &base, ROUTE_VEHICLE), Err(FetchError::Invalid));
        assert_eq!(fetch_json(&client, &base, ROUTE_VEHICLE), Err(FetchError::Empty));
        assert_eq!(fetch_json(&client, &base, ROUTE_VEHICLE), Err(FetchError::Invalid));
        assert_eq!(fetch_json(&client, &base, ROUTE_VEHICLE), Err(FetchError::Invalid));
    }

    #[test]
    fn client_times_out_when_game_hangs() {
        // Accepte la connexion mais ne répond jamais.
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let _keep = l.accept();
            std::thread::sleep(Duration::from_secs(5));
        });
        let client = build_client().unwrap();
        let t = Instant::now();
        let r = fetch_json(&client, &loopback_base(port), ROUTE_SESSION);
        assert_eq!(r, Err(FetchError::Unreachable));
        assert!(t.elapsed() < Duration::from_millis(2500), "{:?}", t.elapsed());
    }

    #[test]
    fn closed_port_is_unreachable() {
        let port = {
            let l = TcpListener::bind("127.0.0.1:0").unwrap();
            l.local_addr().unwrap().port()
        };
        let client = build_client().unwrap();
        assert_eq!(fetch_json(&client, &loopback_base(port), ROUTE_SESSION), Err(FetchError::Unreachable));
    }

    #[test]
    fn record_classifies_results() {
        let mut st = Store::default();
        let now = Instant::now();
        assert!(!record(&mut st, ROUTE_PIT, Err(FetchError::Unreachable), now));
        assert!(record(&mut st, ROUTE_PIT, Ok(json!({})), now));
        assert_eq!(st.pit.freshness(now), Freshness::Empty);
        assert!(record(&mut st, ROUTE_PIT, Ok(pit_fixture()), now));
        assert_eq!(st.pit.freshness(now), Freshness::Fresh);
        let live = st.live(now + Duration::from_secs(10));
        assert_eq!(live.pit.state, Freshness::Stale);
        assert!(live.pit.data.is_some());
        assert_eq!(live.garage_state, Freshness::Absent);
    }
}
