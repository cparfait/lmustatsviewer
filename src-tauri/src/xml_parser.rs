//! Parser XML rFactor (résultats LMU).
//!
//! Lit un fichier `*.xml` de `UserData/Log/Results/` et en extrait :
//! - le header d'événement (`<RaceResults>`),
//! - chaque session (`<Practice1>`, `<Qualify>`, `<Race>`),
//! - tous les pilotes et leurs tours,
//! - les événements de flux (`<Stream>` : chat, pénalités, incidents…).
//!
//! Le parser reste « brut » : la normalisation des classes, le calcul des
//! agrégats et le groupement d'événements sont faits par `indexer.rs`.

use quick_xml::events::attributes::Attributes;
use quick_xml::events::Event;
use quick_xml::Reader;
use std::io::BufReader;

/// Header `<RaceResults>` — partagé par toutes les sessions du fichier.
#[derive(Default, Clone)]
pub struct HeaderInfo {
    pub setting: String,
    pub timestamp: i64, // <DateTime> racine — sert de timestamp d'événement
    pub time_string: String,
    pub track_venue: String,
    pub track_course: String,
    pub track_event: String,
    pub track_length: f64,
    pub game_version: String,
    pub race_laps: i32,
    pub race_time: f64,
    pub mech_fail_rate: i32,
    pub damage_mult: i32,
    pub fuel_mult: f64,
    pub tire_mult: f64,
    pub vehicles_allowed: String,
}

pub struct ParsedSession {
    pub session_type: String, // Practice1 | Qualify | Race (tag XML verbatim)
    pub timestamp: i64,
    pub time_string: String,
    pub track: String,
    pub track_course: String,
    pub track_event: String,
    pub setting: String,
    pub game_version: String,
    pub race_laps: i32,
    pub race_time: f64,
    pub track_length: f64,
    pub mech_fail_rate: i32,
    pub damage_mult: i32,
    pub fuel_mult: f64,
    pub tire_mult: f64,
    pub vehicles_allowed: String,
    pub session_laps: i64,    // <Laps> de la session
    pub session_minutes: i32, // <Minutes> de la session
    pub drivers: Vec<ParsedDriver>,
    pub stream_events: Vec<StreamEvent>,
}

pub struct ParsedDriver {
    pub name: String,
    pub veh_file: String,
    pub veh_name: String,
    pub category: String,
    pub car_type: String,
    pub car_class: String, // brut, non normalisé
    pub car_number: i32,
    pub team_name: String,
    pub is_player: bool,
    pub position: i32,
    pub grid_pos: i32,
    pub class_position: i32,
    pub class_grid_pos: i32,
    pub best_lap_time: f64,
    pub total_laps: i32,
    pub finish_time: f64,
    pub finish_status: String,
    pub dnf_reason: String,
    pub pitstops: i32,
    pub control_aids: String,
    pub laps: Vec<ParsedLap>,
}

pub struct ParsedLap {
    pub lap_num: i32,
    pub position: i32, // attribut 'p'
    pub lap_time: f64, // 0.0 si tour invalide (`--.----`)
    pub s1: Option<f64>,
    pub s2: Option<f64>,
    pub s3: Option<f64>,
    pub top_speed: f64,
    pub fuel: Option<f64>,
    pub fuel_used: Option<f64>,
    pub twfl: Option<f64>,
    pub twfr: Option<f64>,
    pub twrl: Option<f64>,
    pub twrr: Option<f64>,
    pub fcompound: String,
    pub rcompound: String,
    pub is_pit: bool,
    pub is_valid: bool,
}

pub struct StreamEvent {
    pub event_type: String, // ChatMessage | Penalty | Incident | Sector | Sent | Score…
    pub et: f64,
    pub text: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn attr_str(attrs: Attributes, key: &[u8]) -> Option<String> {
    for attr in attrs.flatten() {
        if attr.key.local_name().as_ref() == key {
            return Some(String::from_utf8_lossy(&attr.value).to_string());
        }
    }
    None
}

/// Collecte tous les attributs XML sous forme de paires (clé, valeur).
/// Nécessaire pour les events de flux qui requièrent plusieurs attributs
/// (ex. `TrackLimits` : Lap, WarningPoints, CurrentPoints, Driver).
fn attrs_to_pairs(attrs: Attributes) -> Vec<(String, String)> {
    attrs
        .flatten()
        .map(|a| {
            (
                String::from_utf8_lossy(a.key.local_name().as_ref()).to_string(),
                String::from_utf8_lossy(&a.value).to_string(),
            )
        })
        .collect()
}

/// Construit le préfixe structuré pour un événement `TrackLimits`.
/// Format : `{Lap}|{WarningPoints}|{CurrentPoints}|{Driver}|`
/// Le texte résolution (contenu de l'élément) est ensuite concaténé à la fin.
fn track_limits_extra(pairs: &[(String, String)]) -> String {
    let get = |key: &str| -> &str {
        pairs
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.as_str())
            .unwrap_or("")
    };
    format!(
        "{}|{}|{}|{}|",
        get("Lap"),
        get("WarningPoints"),
        get("CurrentPoints"),
        get("Driver"),
    )
}

fn attr_f64(attrs: Attributes, key: &[u8]) -> Option<f64> {
    attr_str(attrs, key).and_then(|v| v.trim().parse().ok())
}

fn attr_i32(attrs: Attributes, key: &[u8]) -> i32 {
    attr_str(attrs, key)
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or(0)
}

fn parse_f64(s: &str) -> f64 {
    s.trim().parse().unwrap_or(0.0)
}

fn parse_i32(s: &str) -> i32 {
    s.trim().parse().unwrap_or(0)
}

/// Décode le texte d'un nœud (entités XML résolues : `&quot;` → `"`).
fn decoded_text(e: &quick_xml::events::BytesText) -> String {
    match e.unescape() {
        Ok(cow) => cow.trim().to_string(),
        Err(_) => String::from_utf8_lossy(e.as_ref()).trim().to_string(),
    }
}

/// Renvoie le nom de tag verbatim si c'est une section de session reconnue.
fn classify_session_tag(tag: &[u8]) -> Option<String> {
    let s = String::from_utf8_lossy(tag);
    let lower = s.to_lowercase();
    if lower.starts_with("practice") || lower.starts_with("qualify") || lower == "race" {
        return Some(s.to_string());
    }
    None
}

/// Devine le type de session depuis le suffixe du nom de fichier (`…-90R1.xml`).
pub fn detect_session_type_from_filename(filename: &str) -> String {
    let base = filename
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(filename)
        .trim_end_matches(".xml")
        .trim_end_matches(".XML");
    let code = base.rsplit('-').next().unwrap_or(base).to_uppercase();
    if code.contains('Q') {
        "Qualify".to_string()
    } else if code.contains('R') {
        "Race".to_string()
    } else if code.contains('P') {
        "Practice1".to_string()
    } else {
        "Unknown".to_string()
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Section {
    Header,
    Session,
    Stream,
    Driver,
}

// ---------------------------------------------------------------------------
// Parse principal
// ---------------------------------------------------------------------------

pub struct ParsedFile {
    pub header: HeaderInfo,
    pub sessions: Vec<ParsedSession>,
}

pub fn parse_xml_file(path: &std::path::Path) -> Result<ParsedFile, String> {
    let file = std::fs::File::open(path)
        .map_err(|e| format!("Impossible d'ouvrir {:?}: {}", path, e))?;
    let mut reader = Reader::from_reader(BufReader::new(file));
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    let mut header = HeaderInfo::default();
    let mut sessions: Vec<ParsedSession> = Vec::new();
    let mut section = Section::Header;

    let mut current_session: Option<ParsedSession> = None;
    let mut current_driver: Option<ParsedDriver> = None;
    let mut current_tag: Vec<u8> = Vec::new();

    // État courant du tour en cours de lecture (le temps est dans le contenu texte).
    let mut in_lap = false;
    let mut lap_text: String = String::new();

    // État courant d'un événement de flux.
    let mut stream_tag: String = String::new();
    let mut stream_et: f64 = 0.0;
    let mut stream_text: String = String::new();
    // Préfixe structuré pour TrackLimits : "{Lap}|{WP}|{CP}|{Driver}|"
    let mut stream_extra: String = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let tag = e.local_name().as_ref().to_vec();

                // Section de flux : chaque élément est un événement.
                if section == Section::Stream {
                    if tag != b"Stream" {
                        stream_tag = String::from_utf8_lossy(&tag).to_string();
                        let pairs = attrs_to_pairs(e.attributes());
                        stream_et = pairs
                            .iter()
                            .find(|(k, _)| k == "et")
                            .and_then(|(_, v)| v.parse().ok())
                            .unwrap_or(0.0);
                        stream_extra = if stream_tag == "TrackLimits" {
                            track_limits_extra(&pairs)
                        } else {
                            String::new()
                        };
                        stream_text.clear();
                        current_tag = tag;
                    }
                    buf.clear();
                    continue;
                }

                if let Some(session_type) = classify_session_tag(&tag) {
                    section = Section::Session;
                    current_session = Some(new_session(&header, session_type));
                    current_tag.clear();
                    buf.clear();
                    continue;
                }

                if tag == b"Stream" {
                    section = Section::Stream;
                    current_tag.clear();
                    buf.clear();
                    continue;
                }

                if tag == b"Driver" {
                    section = Section::Driver;
                    current_driver = Some(new_driver());
                    current_tag.clear();
                    buf.clear();
                    continue;
                }

                if tag == b"Lap" && current_driver.is_some() {
                    let lap = build_lap(e.attributes());
                    if let Some(ref mut d) = current_driver {
                        d.laps.push(lap);
                    }
                    in_lap = true;
                    lap_text.clear();
                    current_tag = tag;
                    buf.clear();
                    continue;
                }

                current_tag = tag;
            }

            Ok(Event::Empty(ref e)) => {
                let tag = e.local_name().as_ref().to_vec();
                if section == Section::Stream && tag != b"Stream" {
                    let ev_type = String::from_utf8_lossy(&tag).to_string();
                    let pairs = attrs_to_pairs(e.attributes());
                    let et = pairs
                        .iter()
                        .find(|(k, _)| k == "et")
                        .and_then(|(_, v)| v.parse().ok())
                        .unwrap_or(0.0);
                    let text = if ev_type == "TrackLimits" {
                        track_limits_extra(&pairs)
                    } else {
                        String::new()
                    };
                    if let Some(ref mut s) = current_session {
                        s.stream_events.push(StreamEvent { event_type: ev_type, et, text });
                    }
                } else if tag == b"Lap" {
                    if let Some(ref mut d) = current_driver {
                        d.laps.push(build_lap(e.attributes()));
                    }
                }
                buf.clear();
                continue;
            }

            Ok(Event::Text(ref e)) => {
                if in_lap && current_tag == b"Lap" {
                    lap_text.push_str(&decoded_text(e));
                    buf.clear();
                    continue;
                }
                if section == Section::Stream {
                    stream_text.push_str(&decoded_text(e));
                    buf.clear();
                    continue;
                }

                let val = decoded_text(e);
                if val.is_empty() {
                    buf.clear();
                    continue;
                }

                match section {
                    Section::Header => apply_header_field(&mut header, &current_tag, &val),
                    Section::Session => {
                        if let Some(ref mut s) = current_session {
                            match current_tag.as_slice() {
                                b"Laps" => s.session_laps = val.trim().parse().unwrap_or(0),
                                b"Minutes" => s.session_minutes = parse_i32(&val),
                                _ => {}
                            }
                        }
                    }
                    Section::Driver => {
                        if let Some(ref mut d) = current_driver {
                            apply_driver_field(d, &current_tag, &val);
                        }
                    }
                    Section::Stream => {}
                }
            }

            Ok(Event::End(ref e)) => {
                let tag = e.local_name().as_ref().to_vec();

                if in_lap && tag == b"Lap" {
                    finalize_lap(&mut current_driver, &lap_text);
                    in_lap = false;
                    lap_text.clear();
                    current_tag.clear();
                    buf.clear();
                    continue;
                }

                if section == Section::Stream {
                    if tag == b"Stream" {
                        section = Section::Session;
                    } else if !stream_tag.is_empty() {
                        if let Some(ref mut s) = current_session {
                            // Pour TrackLimits : "Lap|WP|CP|Driver|Resolution text"
                            let text = if stream_extra.is_empty() {
                                std::mem::take(&mut stream_text)
                            } else {
                                let extra = std::mem::take(&mut stream_extra);
                                let content = std::mem::take(&mut stream_text);
                                format!("{}{}", extra, content)
                            };
                            s.stream_events.push(StreamEvent {
                                event_type: std::mem::take(&mut stream_tag),
                                et: stream_et,
                                text,
                            });
                        }
                        stream_tag.clear();
                        stream_extra.clear();
                    }
                    current_tag.clear();
                    buf.clear();
                    continue;
                }

                if tag == b"Driver" {
                    if let Some(mut d) = current_driver.take() {
                        // Détection relais pilote (coop/endurance) : le jeu marque DNF
                        // quand un pilote rend le volant mais son dernier tour est un
                        // pit valide. Même règle que l'indexer V1.
                        if let Some(ref s) = current_session {
                            if s.session_type == "Race"
                                && d.finish_status == "DNF"
                                && d.laps
                                    .last()
                                    .map_or(false, |l| l.is_pit && l.lap_time > 0.0)
                            {
                                d.finish_status = "Driver Swap".to_string();
                            }
                        }
                        if let Some(ref mut s) = current_session {
                            s.drivers.push(d);
                        }
                    }
                    section = Section::Session;
                } else if classify_session_tag(&tag).is_some() {
                    if let Some(s) = current_session.take() {
                        sessions.push(s);
                    }
                    section = Section::Header;
                }

                current_tag.clear();
            }

            Ok(Event::Eof) => break,

            Err(e) => {
                return Err(format!(
                    "Erreur XML à la position {}: {:?}",
                    reader.error_position(),
                    e
                ));
            }

            _ => {}
        }
        buf.clear();
    }

    Ok(ParsedFile { header, sessions })
}

// ---------------------------------------------------------------------------
// Constructeurs / application de champs
// ---------------------------------------------------------------------------

fn new_session(h: &HeaderInfo, session_type: String) -> ParsedSession {
    ParsedSession {
        session_type,
        timestamp: h.timestamp,
        time_string: h.time_string.clone(),
        track: h.track_venue.clone(),
        track_course: h.track_course.clone(),
        track_event: h.track_event.clone(),
        setting: h.setting.clone(),
        game_version: h.game_version.clone(),
        race_laps: h.race_laps,
        race_time: h.race_time,
        track_length: h.track_length,
        mech_fail_rate: h.mech_fail_rate,
        damage_mult: h.damage_mult,
        fuel_mult: h.fuel_mult,
        tire_mult: h.tire_mult,
        vehicles_allowed: h.vehicles_allowed.clone(),
        session_laps: 0,
        session_minutes: 0,
        drivers: Vec::new(),
        stream_events: Vec::new(),
    }
}

fn new_driver() -> ParsedDriver {
    ParsedDriver {
        name: String::new(),
        veh_file: String::new(),
        veh_name: String::new(),
        category: String::new(),
        car_type: String::new(),
        car_class: String::new(),
        car_number: 0,
        team_name: String::new(),
        is_player: false,
        position: 0,
        grid_pos: 0,
        class_position: 0,
        class_grid_pos: 0,
        best_lap_time: 0.0,
        total_laps: 0,
        finish_time: 0.0,
        finish_status: String::new(),
        dnf_reason: String::new(),
        pitstops: 0,
        control_aids: String::new(),
        laps: Vec::new(),
    }
}

fn apply_header_field(h: &mut HeaderInfo, tag: &[u8], val: &str) {
    match tag {
        b"Setting" => h.setting = val.to_string(),
        b"DateTime" => h.timestamp = val.trim().parse().unwrap_or(0),
        b"TimeString" => h.time_string = val.to_string(),
        b"TrackVenue" => h.track_venue = val.to_string(),
        b"TrackCourse" => h.track_course = val.to_string(),
        b"TrackEvent" => h.track_event = val.to_string(),
        b"TrackLength" => h.track_length = parse_f64(val),
        b"GameVersion" => h.game_version = val.to_string(),
        b"RaceLaps" => h.race_laps = parse_i32(val),
        b"RaceTime" => h.race_time = parse_f64(val),
        b"MechFailRate" => h.mech_fail_rate = parse_i32(val),
        b"DamageMult" => h.damage_mult = parse_i32(val),
        b"FuelMult" => h.fuel_mult = parse_f64(val),
        b"TireMult" => h.tire_mult = parse_f64(val),
        b"VehiclesAllowed" => h.vehicles_allowed = val.to_string(),
        _ => {}
    }
}

fn apply_driver_field(d: &mut ParsedDriver, tag: &[u8], val: &str) {
    match tag {
        b"Name" => d.name = val.to_string(),
        b"VehFile" => d.veh_file = val.to_string(),
        b"VehName" => d.veh_name = val.to_string(),
        b"Category" => d.category = val.to_string(),
        b"CarType" => d.car_type = val.to_string(),
        b"CarClass" => d.car_class = val.to_string(),
        b"CarNumber" => d.car_number = parse_i32(val),
        b"TeamName" => d.team_name = val.to_string(),
        b"isPlayer" => d.is_player = val.trim() == "1",
        b"Position" => d.position = parse_i32(val),
        b"GridPos" => d.grid_pos = parse_i32(val),
        b"ClassPosition" => d.class_position = parse_i32(val),
        b"ClassGridPos" => d.class_grid_pos = parse_i32(val),
        b"BestLapTime" => d.best_lap_time = parse_f64(val),
        b"Laps" => d.total_laps = parse_i32(val),
        b"FinishTime" => d.finish_time = parse_f64(val),
        b"FinishStatus" => d.finish_status = val.to_string(),
        b"DNFReason" => d.dnf_reason = val.to_string(),
        b"Pitstops" => d.pitstops = parse_i32(val),
        b"ControlAndAids" => d.control_aids = val.to_string(),
        _ => {}
    }
}

fn build_lap(attrs: Attributes) -> ParsedLap {
    ParsedLap {
        lap_num: attr_i32(attrs.clone(), b"num"),
        position: attr_i32(attrs.clone(), b"p"),
        lap_time: 0.0,
        s1: attr_f64(attrs.clone(), b"s1").filter(|&v| v > 0.0),
        s2: attr_f64(attrs.clone(), b"s2").filter(|&v| v > 0.0),
        s3: attr_f64(attrs.clone(), b"s3").filter(|&v| v > 0.0),
        top_speed: attr_f64(attrs.clone(), b"topspeed").unwrap_or(0.0),
        fuel: attr_f64(attrs.clone(), b"fuel"),
        fuel_used: attr_f64(attrs.clone(), b"fuelUsed"),
        twfl: attr_f64(attrs.clone(), b"twfl"),
        twfr: attr_f64(attrs.clone(), b"twfr"),
        twrl: attr_f64(attrs.clone(), b"twrl"),
        twrr: attr_f64(attrs.clone(), b"twrr"),
        fcompound: attr_str(attrs.clone(), b"fcompound").unwrap_or_default(),
        rcompound: attr_str(attrs.clone(), b"rcompound").unwrap_or_default(),
        is_pit: attr_str(attrs, b"pit").as_deref() == Some("1"),
        is_valid: true,
    }
}

/// Applique le contenu texte d'un `<Lap>` : le temps, ou `--.----` = invalide.
fn finalize_lap(driver: &mut Option<ParsedDriver>, text: &str) {
    if let Some(d) = driver {
        if let Some(lap) = d.laps.last_mut() {
            let t = text.trim();
            if t.starts_with("--") || t.is_empty() {
                lap.lap_time = 0.0;
                lap.is_valid = false;
            } else {
                lap.lap_time = parse_f64(t);
                lap.is_valid = lap.lap_time > 0.0;
            }
        }
    }
}
