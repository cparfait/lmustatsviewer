//! Lien entre un enregistrement télémétrie (`.duckdb`) et sa session de résultats (XML).
//!
//! Le jeu écrit le même chrono au tour dans les deux fichiers (événement `Lap Time`
//! d'un côté, `<Lap>` du joueur de l'autre, `--.----` = 0 pour un tour annulé). La
//! suite ordonnée de ces chronos est donc une **empreinte** : on la cherche dans les
//! tours du joueur des sessions proches dans le temps, à 2 ms près, sans aucun écart
//! toléré. Un lien n'est posé que s'il désigne **une seule** session ; sinon rien
//! (jamais de rattachement « au plus proche »).
//!
//! Plus le diagnostic du dossier de télémétrie (page Télémétrie vide).

use std::path::PathBuf;

use chrono::NaiveDateTime;
use serde::Serialize;
use tauri::State;

use super::telemetry::{gps_time_bounds, official_lap_times, open_ro, read_metadata, segment_laps, table_names, telemetry_dir};
use crate::db::{self, DbState};
use crate::error::AppError;

/// Écart toléré entre deux chronos identiques (arrondi du XML au 1/10 000 s, flottant 32 bits).
const SAME_TIME_S: f64 = 0.002;
/// Fenêtre autour du `timestamp` de la session (début de l'évènement) où commence l'enregistrement.
const BEFORE_S: i64 = 10 * 60;
const AFTER_S: i64 = 8 * 3600;
/// Tours chronométrés concordants exigés (1 seul accepté si l'enregistrement n'en a qu'un).
const MIN_MATCHED: usize = 2;

/// Correspondance d'un tour : numéro dans les résultats ↔ numéro dans la télémétrie.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LapPair {
    pub xml_lap: i64,
    pub tele_lap: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct TelemetrySessionLink {
    pub session_id: i64,
    /// Tours chronométrés trouvés à l'identique des deux côtés.
    pub matched: usize,
    pub laps: Vec<LapPair>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionTelemetryLink {
    pub path: String,
    pub filename: String,
    pub matched: usize,
    pub laps: Vec<LapPair>,
}

/// Alignement de l'empreinte télémétrie (`tele`, 0.0 = annulé) sur les tours du joueur
/// (`xml` : numéro, chrono ou `None` si annulé). Renvoie `(décalage, tours concordants)`
/// du seul décalage où **tous** les tours de l'enregistrement concordent ; `None` si
/// aucun, ou si deux décalages concordent autant (ambigu).
pub fn align(tele: &[f64], xml: &[(i64, Option<f64>)]) -> Option<(usize, usize)> {
    if tele.is_empty() || tele.len() > xml.len() {
        return None;
    }
    let mut best: Option<(usize, usize)> = None;
    let mut tie = false;
    for off in 0..=(xml.len() - tele.len()) {
        let mut matched = 0;
        let mut ok = true;
        for (k, &t) in tele.iter().enumerate() {
            match (t > 0.0, xml[off + k].1) {
                (true, Some(x)) if (x - t).abs() <= SAME_TIME_S => matched += 1,
                (false, None) => {}
                _ => {
                    ok = false;
                    break;
                }
            }
        }
        if !ok || matched == 0 {
            continue;
        }
        match best {
            Some((_, m)) if m == matched => tie = true,
            Some((_, m)) if m > matched => {}
            _ => {
                best = Some((off, matched));
                tie = false;
            }
        }
    }
    if tie {
        return None;
    }
    let timed = tele.iter().filter(|&&t| t > 0.0).count();
    best.filter(|&(_, m)| m >= MIN_MATCHED || (timed == 1 && m == 1))
}

/// Début d'enregistrement (epoch s, UTC) : `RecordingTime`, sinon l'horodatage du nom de fichier.
fn recording_epoch(recording_time: &str, filename: &str) -> Option<i64> {
    let parse = |s: &str| NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H_%M_%SZ").ok().map(|d| d.and_utc().timestamp());
    if let Some(t) = parse(recording_time.trim()) {
        return Some(t);
    }
    // `<circuit>_R_2026-06-08T20_30_01Z.duckdb` : l'horodatage = 20 derniers caractères.
    let stem = filename.trim_end_matches(".duckdb");
    let n = stem.len();
    if n < 20 || !stem.is_char_boundary(n - 20) {
        return None;
    }
    parse(&stem[n - 20..])
}

/// Empreinte d'un fichier : chronos officiels, numéros de tour télémétrie, début d'enregistrement.
struct Fingerprint {
    times: Vec<f64>,
    tele_laps: Vec<i64>,
    start: Option<i64>,
}

fn fingerprint(path: &str) -> Option<Fingerprint> {
    let conn = open_ro(path).ok()?;
    let meta = read_metadata(&conn).ok()?;
    let tables = table_names(&conn).ok()?;
    let (t0, dur) = gps_time_bounds(&conn).ok()?;
    let laps = segment_laps(&conn, &tables, t0, t0 + dur);
    let (times, _) = official_lap_times(&laps);
    let tele_laps = laps.iter().filter(|l| l.valid.is_some()).map(|l| l.lap).collect();
    let filename = PathBuf::from(path).file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default();
    let start = recording_epoch(meta.get("RecordingTime").map(|s| s.as_str()).unwrap_or(""), &filename);
    Some(Fingerprint { times, tele_laps, start })
}

/// Tours du joueur d'une session (numéro, chrono ; `None` = annulé).
fn player_laps(conn: &rusqlite::Connection, session_id: i64) -> Vec<(i64, Option<f64>)> {
    let mut stmt = match conn.prepare(
        "SELECT l.lap_num, l.lap_time FROM laps l JOIN results r ON r.id = l.result_id
         WHERE l.session_id = ?1 AND r.is_player = 1 ORDER BY l.lap_num",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    stmt.query_map([session_id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, Option<f64>>(1)?)))
        .map(|rows| rows.flatten().map(|(n, t)| (n, t.filter(|&v| v > 0.0))).collect())
        .unwrap_or_default()
}

/// La session (unique) dont les tours du joueur contiennent l'empreinte du fichier.
fn link_for(db: &DbState, fp: &Fingerprint) -> Option<TelemetrySessionLink> {
    let start = fp.start?;
    if fp.times.iter().all(|&t| t <= 0.0) {
        return None;
    }
    let conn = db::get_conn(db).ok()?;
    let ids: Vec<i64> = {
        let mut stmt = conn
            .prepare("SELECT id FROM sessions WHERE timestamp BETWEEN ?1 AND ?2")
            .ok()?;
        let rows = stmt
            .query_map([start - AFTER_S, start + BEFORE_S], |r| r.get::<_, i64>(0))
            .ok()?;
        rows.flatten().collect()
    };
    let mut found: Vec<TelemetrySessionLink> = Vec::new();
    for sid in ids {
        let xml = player_laps(&conn, sid);
        if let Some((off, matched)) = align(&fp.times, &xml) {
            let laps = fp
                .tele_laps
                .iter()
                .enumerate()
                .map(|(k, &tele_lap)| LapPair { xml_lap: xml[off + k].0, tele_lap })
                .collect();
            found.push(TelemetrySessionLink { session_id: sid, matched, laps });
        }
    }
    let best = found.iter().map(|f| f.matched).max()?;
    let mut top = found.into_iter().filter(|f| f.matched == best);
    let first = top.next()?;
    // Deux sessions aussi plausibles (fichier de résultats dupliqué…) : pas de lien.
    top.next().is_none().then_some(first)
}

/// Session de résultats d'un enregistrement télémétrie, si une seule correspond.
#[tauri::command]
pub async fn telemetry_link_for_file(path: String, db: State<'_, DbState>) -> Result<Option<TelemetrySessionLink>, AppError> {
    Ok(fingerprint(&path).and_then(|fp| link_for(&db, &fp)))
}

/// Enregistrements télémétrie rattachés à une session (plusieurs si le jeu a coupé l'enregistrement).
#[tauri::command]
pub async fn telemetry_links_for_session(session_id: i64, db: State<'_, DbState>) -> Result<Vec<SessionTelemetryLink>, AppError> {
    let ts: i64 = {
        let conn = db::get_conn(&db)?;
        conn.query_row("SELECT timestamp FROM sessions WHERE id = ?1", [session_id], |r| r.get(0))
            .map_err(|e| AppError::Database(format!("telemetry_links_for_session: {e}")))?
    };
    let dir = match telemetry_dir(&db) {
        Ok(d) if d.is_dir() => d,
        _ => return Ok(Vec::new()),
    };
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(AppError::Io)?.flatten() {
        let path = entry.path();
        let filename = path.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default();
        if !filename.to_ascii_lowercase().ends_with(".duckdb") {
            continue;
        }
        // Tri rapide par le nom (horodatage) avant d'ouvrir le fichier.
        if let Some(t) = recording_epoch("", &filename) {
            if t < ts - BEFORE_S || t > ts + AFTER_S {
                continue;
            }
        }
        let p = path.to_string_lossy().to_string();
        let Some(fp) = fingerprint(&p) else { continue };
        if let Some(link) = link_for(&db, &fp) {
            if link.session_id == session_id {
                out.push(SessionTelemetryLink { path: p, filename, matched: link.matched, laps: link.laps });
            }
        }
    }
    out.sort_by(|a, b| b.matched.cmp(&a.matched).then(a.filename.cmp(&b.filename)));
    Ok(out)
}

/// État du dossier de télémétrie (diagnostic quand la liste est vide).
#[derive(Debug, Clone, Serialize)]
pub struct TelemetryFolderStatus {
    /// Dossier lu (surcharge de la Configuration, sinon dérivé du dossier du jeu) ; vide si inconnu.
    pub dir: String,
    /// `true` si le dossier vient de la surcharge « telemetry_dir ».
    pub overridden: bool,
    pub lmu_path_set: bool,
    pub exists: bool,
    pub duckdb_count: usize,
    /// Fichiers `.wal` : enregistrement en cours (le jeu écrit encore).
    pub wal_count: usize,
}

#[tauri::command]
pub async fn telemetry_folder_status(db: State<'_, DbState>) -> Result<TelemetryFolderStatus, AppError> {
    let overridden = db::config_get(&db, "telemetry_dir")?.map_or(false, |d| !d.trim().is_empty());
    let lmu_path_set = db::config_get(&db, "lmu_path")?.map_or(false, |d| !d.trim().is_empty());
    let dir = telemetry_dir(&db).ok();
    let (mut duckdb_count, mut wal_count) = (0, 0);
    let exists = dir.as_ref().map_or(false, |d| d.is_dir());
    if let (true, Some(d)) = (exists, dir.as_ref()) {
        for e in std::fs::read_dir(d).map_err(AppError::Io)?.flatten() {
            let name = e.file_name().to_string_lossy().to_ascii_lowercase();
            if name.ends_with(".duckdb") {
                duckdb_count += 1;
            } else if name.ends_with(".duckdb.wal") {
                wal_count += 1;
            }
        }
    }
    Ok(TelemetryFolderStatus {
        dir: dir.map(|d| d.to_string_lossy().to_string()).unwrap_or_default(),
        overridden,
        lmu_path_set,
        exists,
        duckdb_count,
        wal_count,
    })
}

#[cfg(test)]
mod tests {
    use super::{align, recording_epoch};

    // Course de Spa : chronos du `.duckdb` et du fichier de résultats (`--.----` au tour 3).
    const TELE: [f64; 5] = [180.15859985, 151.36027527, 0.0, 162.37658691, 148.88604736];
    fn xml() -> Vec<(i64, Option<f64>)> {
        vec![(1, Some(180.1586)), (2, Some(151.3603)), (3, None), (4, Some(162.3766)), (5, Some(148.8860))]
    }

    #[test]
    fn whole_session_matches() {
        assert_eq!(align(&TELE, &xml()), Some((0, 4)));
    }

    #[test]
    fn fragment_matches_with_offset() {
        assert_eq!(align(&TELE[3..], &xml()), Some((3, 2)));
    }

    #[test]
    fn one_different_lap_breaks_the_match() {
        let mut t = TELE;
        t[1] += 0.01;
        assert_eq!(align(&t, &xml()), None);
    }

    #[test]
    fn invalid_lap_must_be_invalid_on_both_sides() {
        let mut x = xml();
        x[2].1 = Some(167.5);
        assert_eq!(align(&TELE, &x), None);
    }

    #[test]
    fn a_single_lap_needs_a_single_timed_lap() {
        assert_eq!(align(&[151.3603], &xml()), Some((1, 1)));
        assert_eq!(align(&[0.0], &xml()), None);
    }

    #[test]
    fn ambiguous_offsets_give_nothing() {
        let x = vec![(1, Some(90.0)), (2, Some(90.0)), (3, Some(90.0))];
        assert_eq!(align(&[90.0, 90.0], &x), None);
    }

    #[test]
    fn recording_time_from_metadata_or_filename() {
        assert_eq!(recording_epoch("2026-06-08T20_30_01Z", ""), Some(1_780_950_601));
        assert_eq!(
            recording_epoch("", "Circuit de Spa-Francorchamps_R_2026-06-08T20_30_01Z.duckdb"),
            Some(1_780_950_601)
        );
        assert_eq!(recording_epoch("", "x.duckdb"), None);
    }
}
