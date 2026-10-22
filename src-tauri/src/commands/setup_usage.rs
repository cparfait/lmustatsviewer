//! Setup réellement roulé — quel `.svm` était chargé dans la voiture à chaque tour.
//!
//! En piste, le pont REST lit `garage/summary` (`activeSetup`, `unsavedChanges`).
//! À chaque tour bouclé par le joueur, on note **le tour** (numéro, chrono) et **le
//! setup chargé** dans `setup_laps`. Les sessions arrivent plus tard (XML des
//! résultats) : leurs tours sont reconnus par **empreinte**, comme le lien
//! télémétrie — même chrono à 2 ms près, numéro de tour à ±1, dans la fenêtre de
//! temps de la session. Une session sans aucun chrono reconnu n'est jamais
//! rattachée « au plus proche ».
//!
//! Les ids de `setups` et de `sessions` changent à chaque rescan : rien n'est
//! clé sur eux. Un setup se reconnaît par son chemin (`<dossier>\<fichier>.svm`
//! sous `Settings`), une session par ses tours.
//!
//! Le lien de référence `setups.linked_session_id` n'est **rempli que s'il est
//! vide** (meilleure session roulée avec ce setup) : un choix du pilote n'est
//! jamais remplacé.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use super::live::{self, LiveData};
use super::lmu_rest::{self, Freshness, LoadedSetup};
use crate::db::{get_conn, DbState};
use crate::error::AppError;

/// Écart toléré entre deux chronos identiques (XML au 1/10 000 s, flottant 32 bits).
const SAME_TIME_S: f64 = 0.002;
/// Fenêtre autour du `timestamp` de la session (début de l'évènement).
const BEFORE_S: i64 = 10 * 60;
const AFTER_S: i64 = 8 * 3600;
/// Délai avant de lire le chrono d'un tour qui vient de se terminer (le jeu met à
/// jour le compteur de tours et le dernier chrono dans la même trame, en principe).
const LAP_SETTLE: Duration = Duration::from_millis(1200);
/// Âge max d'un setup lu dans le jeu pour l'attribuer à un tour (lu toutes les 5 s
/// en piste ; un setup ne change qu'au garage).
const MAX_SETUP_AGE_MS: u64 = 20_000;

/// Consommateur Rust du flux live : garde la lecture active quand aucune page
/// ne l'écoute (le setup est reconnu même page Live fermée).
pub const CONSUMER: &str = "setup-watch";
static HELD: AtomicBool = AtomicBool::new(false);

/// Applique le réglage « Reconnaître le setup chargé » (démarrage et bascule).
pub fn apply_tracking(app: &AppHandle, on: bool) {
    lmu_rest::set_setup_tracking(on);
    if on {
        if !HELD.swap(true, Ordering::SeqCst) && live::acquire(app, CONSUMER).is_err() {
            HELD.store(false, Ordering::SeqCst);
        }
    } else if HELD.swap(false, Ordering::SeqCst) {
        live::release_window(CONSUMER);
    }
}

// ─── Enregistrement (boucle live) ────────────────────────────────────────────

/// Tour en attente de son chrono.
struct PendingLap {
    lap_num: i32,
    at: Instant,
    setup: LoadedSetup,
}

/// Suit le compteur de tours du joueur dans la boucle live.
#[derive(Default)]
pub struct LapRecorder {
    session_key: String,
    last_laps: Option<i32>,
    pending: Option<PendingLap>,
}

/// Setup chargé, s'il vient d'être lu dans le jeu.
fn recent_setup(d: &LiveData) -> Option<LoadedSetup> {
    let f = &d.rest.as_ref()?.setup;
    let recent = matches!(f.state, Freshness::Fresh)
        || (matches!(f.state, Freshness::Stale) && f.age_ms.is_some_and(|a| a <= MAX_SETUP_AGE_MS));
    if recent {
        f.data.clone()
    } else {
        None
    }
}

impl LapRecorder {
    /// Appelé à chaque trame : note un tour quand le compteur du joueur avance.
    pub fn observe(&mut self, app: &AppHandle, d: &LiveData) {
        if !lmu_rest::setup_tracking() || d.diag.replay || d.paused {
            return;
        }
        let (Some(s), Some(p)) = (d.session.as_ref(), d.player.as_ref()) else {
            return;
        };
        let key = format!("{}|{}", s.track, s.session);
        if key != self.session_key {
            self.session_key = key;
            self.last_laps = None;
            self.pending = None;
        }
        if let Some(pl) = &self.pending {
            if pl.at.elapsed() >= LAP_SETTLE {
                let pl = self.pending.take().expect("pending");
                let time = (p.last_lap_time > 0.0).then_some(p.last_lap_time as f64);
                let _ = insert_lap(app, &s.track, s.session, pl.lap_num, time, &pl.setup);
            }
        }
        let laps = p.total_laps;
        match self.last_laps {
            Some(prev) if laps > prev => {
                // Un tour vient de se terminer (le numéro du tour bouclé = compteur).
                if let Some(setup) = recent_setup(d) {
                    self.pending = Some(PendingLap { lap_num: laps, at: Instant::now(), setup });
                }
            }
            Some(prev) if laps < prev => self.pending = None, // nouvelle séance, retour garage
            _ => {}
        }
        self.last_laps = Some(laps);
    }
}

fn now_epoch() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

fn insert_lap(
    app: &AppHandle,
    track: &str,
    session: i32,
    lap_num: i32,
    lap_time: Option<f64>,
    setup: &LoadedSetup,
) -> Result<(), AppError> {
    let db = app.state::<DbState>();
    let conn = get_conn(&db)?;
    conn.execute(
        "INSERT INTO setup_laps (recorded_at, track, session_kind, lap_num, lap_time, setup_name, setup_folder, setup_file, unsaved, car)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            now_epoch(),
            track,
            session,
            lap_num,
            lap_time,
            setup.name,
            setup.folder,
            setup.file,
            setup.unsaved.map(i32::from),
            setup.car,
        ],
    )
    .map_err(|e| AppError::Database(format!("setup_laps insert: {e}")))?;
    Ok(())
}

// ─── Reconnaissance des tours (pur) ──────────────────────────────────────────

/// Un tour noté en piste.
#[derive(Debug, Clone, PartialEq)]
pub struct LapUse {
    pub lap_num: i64,
    pub lap_time: Option<f64>,
    /// Clé du setup : `dossier\fichier` en minuscules (`fichier` seul sans dossier).
    pub key: String,
    pub folder: Option<String>,
    pub file: String,
    pub unsaved: Option<bool>,
}

/// Clé normalisée d'un setup (dossier + fichier, sans `.svm`, minuscules).
pub fn setup_key(folder: Option<&str>, file: &str) -> String {
    let f = file.trim().trim_end_matches(".svm").trim_end_matches(".SVM").to_lowercase();
    match folder.map(str::trim).filter(|x| !x.is_empty()) {
        Some(d) => format!("{}\\{}", d.to_lowercase(), f),
        None => f,
    }
}

/// Clé d'un setup en base depuis son chemin : les deux derniers segments sous
/// `Settings` (`…\Settings\Spa\Base.svm` → `spa\base`), un seul s'il est à la racine.
pub fn key_of_path(svm_path: &str) -> Option<String> {
    let norm = svm_path.replace('/', "\\");
    let parts: Vec<&str> = norm.split('\\').filter(|p| !p.is_empty()).collect();
    let i = parts.iter().rposition(|p| p.eq_ignore_ascii_case("settings"))?;
    match &parts[i + 1..] {
        [file] => Some(setup_key(None, file)),
        [folder, file] => Some(setup_key(Some(folder), file)),
        _ => None,
    }
}

/// Tours du joueur (numéro XML, chrono ou `None` si annulé) → index du tour noté
/// qui lui correspond. Vide si aucun chrono n'est reconnu à l'identique : la session
/// n'est pas celle de ces tours.
pub fn match_laps(xml: &[(i64, Option<f64>)], uses: &[LapUse]) -> HashMap<i64, usize> {
    let mut out = HashMap::new();
    let mut taken = vec![false; uses.len()];
    let mut offsets: HashMap<i64, usize> = HashMap::new();
    // 1. Chronos identiques (numéro à ±1 : le premier tour n'est pas compté pareil partout).
    for (xi, (num, time)) in xml.iter().enumerate() {
        let Some(t) = time else { continue };
        let hit = uses.iter().enumerate().find(|(ui, u)| {
            !taken[*ui] && (u.lap_num - num).abs() <= 1 && u.lap_time.is_some_and(|ut| (ut - t).abs() <= SAME_TIME_S)
        });
        if let Some((ui, u)) = hit {
            taken[ui] = true;
            out.insert(xml[xi].0, ui);
            *offsets.entry(num - u.lap_num).or_insert(0) += 1;
        }
    }
    let Some((&offset, _)) = offsets.iter().max_by_key(|(o, n)| (**n, -(o.abs()))) else {
        return HashMap::new();
    };
    // 2. Tours sans chrono commun (annulés, chrono absent) : même numéro décalé.
    for (num, time) in xml {
        if out.contains_key(num) {
            continue;
        }
        let hit = uses.iter().enumerate().find(|(ui, u)| {
            !taken[*ui]
                && u.lap_num + offset == *num
                && match (time, u.lap_time) {
                    (Some(t), Some(ut)) => (ut - t).abs() <= SAME_TIME_S,
                    _ => true,
                }
        });
        if let Some((ui, _)) = hit {
            taken[ui] = true;
            out.insert(*num, ui);
        }
    }
    out
}

// ─── Lecture en base ─────────────────────────────────────────────────────────

fn uses_between(conn: &Connection, from: i64, to: i64) -> Result<Vec<LapUse>, AppError> {
    let mut stmt = conn
        .prepare(
            "SELECT lap_num, lap_time, setup_folder, setup_file, unsaved
             FROM setup_laps WHERE recorded_at BETWEEN ?1 AND ?2 ORDER BY recorded_at, id",
        )
        .map_err(|e| AppError::Database(format!("setup_laps prepare: {e}")))?;
    let rows = stmt
        .query_map(params![from, to], |r| {
            let folder: Option<String> = r.get(2)?;
            let file: String = r.get(3)?;
            Ok(LapUse {
                lap_num: r.get(0)?,
                lap_time: r.get(1)?,
                key: setup_key(folder.as_deref(), &file),
                folder,
                file,
                unsaved: r.get::<_, Option<i32>>(4)?.map(|v| v != 0),
            })
        })
        .map_err(|e| AppError::Database(format!("setup_laps query: {e}")))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::Database(format!("setup_laps collect: {e}")))
}

/// Tours du joueur : (numéro XML, chrono ou `None` si annulé).
type XmlLaps = Vec<(i64, Option<f64>)>;
/// Setup en base : (id, nom, voiture, circuit, session liée).
type KnownSetup = (i64, String, String, String, Option<i64>);

/// Tours du joueur d'une session et son horodatage.
fn player_laps(conn: &Connection, session_id: i64) -> Result<(i64, XmlLaps), AppError> {
    let ts: i64 = conn
        .query_row("SELECT timestamp FROM sessions WHERE id = ?1", params![session_id], |r| r.get(0))
        .map_err(|e| AppError::Database(format!("setup usage session: {e}")))?;
    let mut stmt = conn
        .prepare(
            "SELECT l.lap_num, l.lap_time FROM laps l JOIN results r ON r.id = l.result_id
             WHERE l.session_id = ?1 AND r.is_player = 1 ORDER BY l.lap_num",
        )
        .map_err(|e| AppError::Database(format!("setup usage laps prepare: {e}")))?;
    let laps = stmt
        .query_map(params![session_id], |r| {
            let t: Option<f64> = r.get(1)?;
            Ok((r.get::<_, i64>(0)?, t.filter(|x| *x > 0.0)))
        })
        .map_err(|e| AppError::Database(format!("setup usage laps: {e}")))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::Database(format!("setup usage laps collect: {e}")))?;
    Ok((ts, laps))
}

/// Setups en base : clé → (id, nom, voiture, circuit, session liée).
fn setups_by_key(conn: &Connection) -> Result<HashMap<String, KnownSetup>, AppError> {
    let mut stmt = conn
        .prepare("SELECT id, svm_path, name, car, circuit, linked_session_id FROM setups")
        .map_err(|e| AppError::Database(format!("setups by key prepare: {e}")))?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, Option<i64>>(5)?,
            ))
        })
        .map_err(|e| AppError::Database(format!("setups by key: {e}")))?;
    let mut out = HashMap::new();
    for row in rows.flatten() {
        if let Some(k) = key_of_path(&row.1) {
            out.insert(k, (row.0, row.2, row.3, row.4, row.5));
        }
    }
    Ok(out)
}

/// Un setup roulé pendant une session.
#[derive(Debug, Clone, Serialize)]
pub struct SessionSetupUse {
    /// `activeSetup` du jeu : dossier du circuit (absent pour un setup intégré au jeu).
    pub folder: Option<String>,
    pub file: String,
    /// Setup en base correspondant (son fichier existe encore), sinon `None`.
    pub setup_id: Option<i64>,
    pub car: Option<String>,
    pub circuit: Option<String>,
    /// Ce setup est déjà la session de référence d'un autre lien (`linked_session_id`).
    pub linked_session_id: Option<i64>,
    /// Tours de la session (numéros XML) roulés avec ce setup.
    pub laps: Vec<i64>,
    pub best_lap: Option<f64>,
    /// Au moins un tour roulé avec des réglages non enregistrés dans le fichier.
    pub unsaved: bool,
}

/// Setups roulés pendant une session (tours reconnus), le plus utilisé d'abord.
pub fn usage_for_session(conn: &Connection, session_id: i64) -> Result<Vec<SessionSetupUse>, AppError> {
    let (ts, xml) = player_laps(conn, session_id)?;
    if xml.is_empty() {
        return Ok(vec![]);
    }
    let uses = uses_between(conn, ts - BEFORE_S, ts + AFTER_S)?;
    let matched = match_laps(&xml, &uses);
    if matched.is_empty() {
        return Ok(vec![]);
    }
    let times: HashMap<i64, Option<f64>> = xml.iter().copied().collect();
    let known = setups_by_key(conn)?;
    let mut by_key: HashMap<String, SessionSetupUse> = HashMap::new();
    let mut nums: Vec<(&i64, &usize)> = matched.iter().collect();
    nums.sort();
    for (num, ui) in nums {
        let u = &uses[*ui];
        let e = by_key.entry(u.key.clone()).or_insert_with(|| {
            let s = known.get(&u.key);
            SessionSetupUse {
                folder: u.folder.clone(),
                file: u.file.clone(),
                setup_id: s.map(|x| x.0),
                car: s.map(|x| x.2.clone()),
                circuit: s.map(|x| x.3.clone()),
                linked_session_id: s.and_then(|x| x.4),
                laps: vec![],
                best_lap: None,
                unsaved: false,
            }
        });
        e.laps.push(*num);
        e.unsaved |= u.unsaved == Some(true);
        if let Some(Some(t)) = times.get(num) {
            e.best_lap = Some(e.best_lap.map_or(*t, |b: f64| b.min(*t)));
        }
    }
    let mut out: Vec<SessionSetupUse> = by_key.into_values().collect();
    out.sort_by(|a, b| b.laps.len().cmp(&a.laps.len()).then(a.file.cmp(&b.file)));
    Ok(out)
}

/// Une session roulée avec un setup.
#[derive(Debug, Clone, Serialize)]
pub struct SetupSessionUse {
    pub session_id: i64,
    pub session_type: String,
    pub track: String,
    pub timestamp: i64,
    /// Tours roulés avec ce setup dans la session.
    pub laps: usize,
    pub best_lap: Option<f64>,
    pub unsaved: bool,
}

/// Sessions où ce setup (clé) a roulé, la plus récente d'abord.
pub fn sessions_for_key(conn: &Connection, key: &str) -> Result<Vec<SetupSessionUse>, AppError> {
    let mut stmt = conn
        .prepare("SELECT recorded_at, setup_folder, setup_file FROM setup_laps ORDER BY recorded_at")
        .map_err(|e| AppError::Database(format!("setup sessions prepare: {e}")))?;
    let stamps: Vec<i64> = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, String>(2)?)))
        .map_err(|e| AppError::Database(format!("setup sessions: {e}")))?
        .flatten()
        .filter(|(_, d, f)| setup_key(d.as_deref(), f) == key)
        .map(|(t, _, _)| t)
        .collect();
    let (Some(first), Some(last)) = (stamps.first(), stamps.last()) else {
        return Ok(vec![]);
    };
    let mut stmt = conn
        .prepare(
            "SELECT id, session_type, track, timestamp FROM sessions
             WHERE timestamp BETWEEN ?1 AND ?2 ORDER BY timestamp DESC",
        )
        .map_err(|e| AppError::Database(format!("setup sessions list prepare: {e}")))?;
    let sessions: Vec<(i64, String, String, i64)> = stmt
        .query_map(params![first - AFTER_S, last + BEFORE_S], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
        .map_err(|e| AppError::Database(format!("setup sessions list: {e}")))?
        .flatten()
        .collect();
    let mut out = vec![];
    for (id, session_type, track, timestamp) in sessions {
        // Seulement les sessions où l'on a un tour noté dans la fenêtre.
        if !stamps.iter().any(|t| (timestamp - BEFORE_S..=timestamp + AFTER_S).contains(t)) {
            continue;
        }
        for u in usage_for_session(conn, id)? {
            if setup_key(u.folder.as_deref(), &u.file) == key {
                out.push(SetupSessionUse {
                    session_id: id,
                    session_type: session_type.clone(),
                    track: track.clone(),
                    timestamp,
                    laps: u.laps.len(),
                    best_lap: u.best_lap,
                    unsaved: u.unsaved,
                });
            }
        }
    }
    Ok(out)
}

/// Remplit le lien de référence des setups qui n'en ont pas : la session roulée
/// avec ce setup qui a son meilleur tour (sinon le plus de tours). Ne remplace
/// jamais un lien posé.
pub fn autolink(conn: &Connection) -> Result<usize, AppError> {
    let mut stmt = conn
        .prepare("SELECT DISTINCT setup_folder, setup_file FROM setup_laps")
        .map_err(|e| AppError::Database(format!("autolink prepare: {e}")))?;
    let keys: Vec<String> = stmt
        .query_map([], |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| AppError::Database(format!("autolink keys: {e}")))?
        .flatten()
        .map(|(d, f)| setup_key(d.as_deref(), &f))
        .collect();
    if keys.is_empty() {
        return Ok(0);
    }
    let known = setups_by_key(conn)?;
    let mut n = 0;
    for key in keys {
        let Some((id, ..)) = known.get(&key).filter(|s| s.4.is_none()) else { continue };
        let sessions = sessions_for_key(conn, &key)?;
        let best = sessions.iter().min_by(|a, b| match (a.best_lap, b.best_lap) {
            (Some(x), Some(y)) => x.total_cmp(&y),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => b.laps.cmp(&a.laps),
        });
        if let Some(s) = best {
            conn.execute(
                "UPDATE setups SET linked_session_id = ?1 WHERE id = ?2 AND linked_session_id IS NULL",
                params![s.session_id, id],
            )
            .map_err(|e| AppError::Database(format!("autolink update: {e}")))?;
            n += 1;
        }
    }
    Ok(n)
}

// ─── Commandes ───────────────────────────────────────────────────────────────

/// Setups roulés pendant une session (reconnus en piste), avec leurs tours.
#[tauri::command]
pub async fn get_session_setup_usage(session_id: i64, db: State<'_, DbState>) -> Result<Vec<SessionSetupUse>, AppError> {
    let conn = get_conn(&db)?;
    usage_for_session(&conn, session_id)
}

/// Sessions roulées avec un setup (reconnues en piste).
#[tauri::command]
pub async fn get_setup_session_usage(setup_id: i64, db: State<'_, DbState>) -> Result<Vec<SetupSessionUse>, AppError> {
    let conn = get_conn(&db)?;
    let path: Option<String> = conn
        .query_row("SELECT svm_path FROM setups WHERE id = ?1", params![setup_id], |r| r.get(0))
        .ok();
    let Some(key) = path.as_deref().and_then(key_of_path) else {
        return Ok(vec![]);
    };
    sessions_for_key(&conn, &key)
}

/// Réglage « Reconnaître le setup chargé » appliqué à chaud.
#[tauri::command]
pub fn set_loaded_setup_tracking(app: AppHandle, enabled: bool, db: State<'_, DbState>) -> Result<(), AppError> {
    crate::db::config_set(&db, lmu_rest::CONFIG_SETUP_TRACKING, if enabled { "1" } else { "0" })?;
    apply_tracking(&app, enabled);
    Ok(())
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn u(num: i64, time: Option<f64>, key: &str) -> LapUse {
        LapUse { lap_num: num, lap_time: time, key: key.into(), folder: None, file: key.into(), unsaved: None }
    }

    #[test]
    fn keys_from_game_name_and_path() {
        assert_eq!(setup_key(Some("Spa"), "Ma Base V3"), "spa\\ma base v3");
        assert_eq!(setup_key(None, "GT3_Balanced.svm"), "gt3_balanced");
        assert_eq!(
            key_of_path(r"C:\Steam\steamapps\common\Le Mans Ultimate\UserData\player\Settings\Spa\Ma Base V3.svm").as_deref(),
            Some("spa\\ma base v3")
        );
        assert_eq!(key_of_path("D:/LMU/UserData/player/Settings/Racine.svm").as_deref(), Some("racine"));
        assert_eq!(key_of_path(r"C:\x\Base.svm"), None);
    }

    #[test]
    fn laps_matched_by_time_then_number() {
        let xml = vec![(1, Some(130.512)), (2, Some(101.250)), (3, None), (4, Some(100.900)), (5, Some(99.0))];
        let uses = vec![
            u(1, Some(130.5121), "a"),
            u(2, Some(101.2502), "a"),
            u(3, Some(140.0), "a"), // annulé dans le XML : reconnu par son numéro
            u(4, Some(100.9), "b"),
        ];
        let m = match_laps(&xml, &uses);
        assert_eq!(m.get(&1), Some(&0));
        assert_eq!(m.get(&2), Some(&1));
        assert_eq!(m.get(&3), Some(&2));
        assert_eq!(m.get(&4), Some(&3));
        assert_eq!(m.get(&5), None); // pas noté en piste (page fermée, réglage coupé…)
    }

    #[test]
    fn no_time_in_common_means_another_session() {
        let xml = vec![(1, Some(100.0)), (2, Some(101.0)), (3, None)];
        let uses = vec![u(1, Some(98.0), "a"), u(2, Some(99.5), "a"), u(3, None, "a")];
        assert!(match_laps(&xml, &uses).is_empty());
    }

    #[test]
    fn lap_numbers_shifted_by_one() {
        // Le jeu compte le tour de sortie différemment : décalage d'un tour partout.
        let xml = vec![(2, Some(105.0)), (3, None), (4, Some(103.0))];
        let uses = vec![u(1, Some(105.0), "a"), u(2, None, "a"), u(3, Some(103.0), "a")];
        let m = match_laps(&xml, &uses);
        assert_eq!((m.get(&2), m.get(&3), m.get(&4)), (Some(&0), Some(&1), Some(&2)));
    }

    #[test]
    fn usage_and_autolink_from_db() {
        let conn = crate::db::open_test_db();
        conn.execute_batch(
            "INSERT INTO xml_index (id, filename, file_path, mtime, timestamp) VALUES (1, 'a.xml', 'a.xml', 0, 1000);
             INSERT INTO sessions (id, xml_id, session_type, timestamp, track) VALUES (7, 1, 'Practice1', 1000, 'Spa');
             INSERT INTO results (id, session_id, driver_name, is_player) VALUES (1, 7, 'Moi', 1), (2, 7, 'IA', 0);
             INSERT INTO laps (result_id, session_id, driver_name, lap_num, lap_time) VALUES
               (1, 7, 'Moi', 1, 140.0), (1, 7, 'Moi', 2, 138.25), (1, 7, 'Moi', 3, 137.5), (2, 7, 'IA', 2, 138.25);
             INSERT INTO setups (id, car, circuit, name, svm_path) VALUES
               (3, 'Lexus', 'Spa', 'Base.svm', 'C:\\LMU\\UserData\\player\\Settings\\Spa\\Base.svm'),
               (4, 'Lexus', 'Spa', 'Pluie.svm', 'C:\\LMU\\UserData\\player\\Settings\\Spa\\Pluie.svm');
             INSERT INTO setup_laps (recorded_at, track, session_kind, lap_num, lap_time, setup_name, setup_folder, setup_file, unsaved) VALUES
               (1200, 'Spa', 0, 1, 140.0, 'Spa\\Base', 'Spa', 'Base', 0),
               (1340, 'Spa', 0, 2, 138.25, 'Spa\\Base', 'Spa', 'Base', 1),
               (1600, 'Spa', 0, 3, 137.5, 'Spa\\Pluie', 'Spa', 'Pluie', 0);",
        )
        .unwrap();
        let u = usage_for_session(&conn, 7).unwrap();
        assert_eq!(u.len(), 2);
        assert_eq!((u[0].setup_id, u[0].laps.clone(), u[0].best_lap, u[0].unsaved), (Some(3), vec![1, 2], Some(138.25), true));
        assert_eq!((u[1].setup_id, u[1].laps.clone()), (Some(4), vec![3]));
        let s = sessions_for_key(&conn, "spa\\base").unwrap();
        assert_eq!((s.len(), s[0].session_id, s[0].laps), (1, 7, 2));
        // Un lien posé par le pilote n'est jamais remplacé.
        conn.execute("UPDATE setups SET linked_session_id = 99 WHERE id = 4", []).unwrap();
        assert_eq!(autolink(&conn).unwrap(), 1);
        let linked: Vec<Option<i64>> = conn
            .prepare("SELECT linked_session_id FROM setups ORDER BY id")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .flatten()
            .collect();
        assert_eq!(linked, vec![Some(7), Some(99)]);
    }
}
