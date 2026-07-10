//! Commande de détail d'une session (page Race Details).
//!
//! Renvoie toutes les données d'une session : infos, classement (tous les
//! pilotes), tours, événements de flux. Le frontend en dérive les 8 onglets V1
//! (`race_details.php`).

use rusqlite::{OptionalExtension, Row};
use serde::Serialize;
use tauri::State;

use crate::db::{get_conn, DbState};
use crate::error::AppError;

#[derive(Debug, Serialize)]
pub struct SessionInfo {
    pub id: i64,
    pub event_id: i64,
    pub session_type: String,
    pub timestamp: i64,
    pub track: String,
    pub track_course: String,
    pub track_event: String,
    pub setting: String,
    pub game_version: String,
    pub participants: i64,
    pub session_laps: i64,
    pub session_minutes: i64,
    pub track_length: f64,
    pub race_time: f64,
    pub mech_fail_rate: i64,
    pub damage_mult: i64,
    pub fuel_mult: f64,
    pub tire_mult: f64,
    pub vehicles_allowed: String,
    pub filename: String,
}

#[derive(Debug, Serialize)]
pub struct ResultRow {
    pub id: i64,
    pub driver_name: String,
    pub is_player: bool,
    pub veh_name: String,
    pub car_type: String,
    pub car_class: String,
    pub unique_car_name: String,
    pub car_number: i64,
    pub team_name: String,
    pub control_aids: String,
    pub position: i64,
    pub class_position: i64,
    pub grid_pos: i64,
    pub class_grid_pos: i64,
    pub laps_count: i64,
    pub laps_led: i64,
    pub finish_time: Option<f64>,
    pub finish_status: String,
    pub pitstops: i64,
    pub best_lap: Option<f64>,
    pub best_lap_s1: Option<f64>,
    pub best_lap_s2: Option<f64>,
    pub best_lap_s3: Option<f64>,
    pub abs_best_s1: Option<f64>,
    pub abs_best_s2: Option<f64>,
    pub abs_best_s3: Option<f64>,
    pub optimal_lap: Option<f64>,
    pub vmax: Option<f64>,
    pub progression: Option<i64>,
    pub total_laps_valid: i64,
    pub start_fuel: Option<f64>,
    pub finish_fuel: Option<f64>,
    pub median_lap: Option<f64>,
    pub std_dev: Option<f64>,
    pub avg_best_5: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct LapRow {
    pub driver_name: String,
    pub lap_num: i64,
    pub position: i64,
    pub lap_time: Option<f64>,
    pub s1: Option<f64>,
    pub s2: Option<f64>,
    pub s3: Option<f64>,
    pub top_speed: Option<f64>,
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

#[derive(Debug, Serialize)]
pub struct StreamEventRow {
    pub event_type: String,
    pub et: f64,
    pub text: String,
}

#[derive(Debug, Serialize)]
pub struct SiblingSession {
    pub id: i64,
    pub session_type: String,
}

#[derive(Debug, Serialize)]
pub struct SessionDetail {
    pub session: SessionInfo,
    /// Autres sessions du même événement (sélecteur Essais/Qualif/Course).
    pub siblings: Vec<SiblingSession>,
    pub results: Vec<ResultRow>,
    pub laps: Vec<LapRow>,
    pub stream: Vec<StreamEventRow>,
}

fn map_result(row: &Row) -> rusqlite::Result<ResultRow> {
    Ok(ResultRow {
        id: row.get("id")?,
        driver_name: row.get("driver_name")?,
        is_player: row.get::<_, i64>("is_player")? != 0,
        veh_name: row.get("veh_name")?,
        car_type: row.get("car_type")?,
        car_class: row.get("car_class")?,
        unique_car_name: row.get("unique_car_name")?,
        car_number: row.get("car_number")?,
        team_name: row.get("team_name")?,
        control_aids: row.get("control_aids")?,
        position: row.get("position")?,
        class_position: row.get("class_position")?,
        grid_pos: row.get("grid_pos")?,
        class_grid_pos: row.get("class_grid_pos")?,
        laps_count: row.get("laps_count")?,
        laps_led: row.get("laps_led")?,
        finish_time: row.get("finish_time")?,
        finish_status: row.get("finish_status")?,
        pitstops: row.get("pitstops")?,
        best_lap: row.get("best_lap")?,
        best_lap_s1: row.get("best_lap_s1")?,
        best_lap_s2: row.get("best_lap_s2")?,
        best_lap_s3: row.get("best_lap_s3")?,
        abs_best_s1: row.get("abs_best_s1")?,
        abs_best_s2: row.get("abs_best_s2")?,
        abs_best_s3: row.get("abs_best_s3")?,
        optimal_lap: row.get("optimal_lap")?,
        vmax: row.get("vmax")?,
        progression: row.get("progression")?,
        total_laps_valid: row.get("total_laps_valid")?,
        start_fuel: row.get("start_fuel")?,
        finish_fuel: row.get("finish_fuel")?,
        median_lap: row.get("median_lap")?,
        std_dev: row.get("std_dev")?,
        avg_best_5: row.get("avg_best_5")?,
    })
}

#[tauri::command]
pub fn get_session_detail(
    session_id: i64,
    db: State<'_, DbState>,
) -> Result<SessionDetail, AppError> {
    let conn = get_conn(&db)?;

    // --- Session + infos XML ---
    let session = conn
        .query_row(
            "SELECT s.id, s.event_id, s.session_type, s.timestamp, s.track,
                    s.track_course, s.setting, s.game_version, s.participants,
                    s.session_laps, s.session_minutes, x.track_event, x.track_length,
                    x.race_time, x.mech_fail_rate, x.damage_mult, x.fuel_mult,
                    x.tire_mult, x.vehicles_allowed, x.filename
             FROM sessions s JOIN xml_index x ON x.id = s.xml_id
             WHERE s.id = ?1",
            [session_id],
            |row| {
                Ok(SessionInfo {
                    id: row.get(0)?,
                    event_id: row.get(1)?,
                    session_type: row.get(2)?,
                    timestamp: row.get(3)?,
                    track: row.get(4)?,
                    track_course: row.get(5)?,
                    setting: row.get(6)?,
                    game_version: row.get(7)?,
                    participants: row.get(8)?,
                    session_laps: row.get(9)?,
                    session_minutes: row.get(10)?,
                    track_event: row.get(11)?,
                    track_length: row.get(12)?,
                    race_time: row.get(13)?,
                    mech_fail_rate: row.get(14)?,
                    damage_mult: row.get(15)?,
                    fuel_mult: row.get(16)?,
                    tire_mult: row.get(17)?,
                    vehicles_allowed: row.get(18)?,
                    filename: row.get(19)?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound(format!("session {session_id} introuvable"))
            }
            other => AppError::Database(format!("session detail: {other}")),
        })?;

    // --- Sessions sœurs du même événement ---
    // On filtre aussi sur le circuit : deux événements de circuits différents
    // partageant par accident le même timestamp (donc le même event_id, cf.
    // `recompute_event_ids`) ne doivent jamais mélanger leurs sessions.
    let mut stmt_sib = conn
        .prepare(
            "SELECT id, session_type FROM sessions WHERE event_id = ?1 AND track = ?2
             ORDER BY CASE session_type WHEN 'Race' THEN 0 WHEN 'Qualify' THEN 1
                      ELSE 2 END, timestamp",
        )
        .map_err(|e| AppError::Database(format!("siblings: {e}")))?;
    let siblings: Vec<SiblingSession> = stmt_sib
        .query_map(rusqlite::params![session.event_id, session.track], |row| {
            Ok(SiblingSession {
                id: row.get(0)?,
                session_type: row.get(1)?,
            })
        })
        .map_err(|e| AppError::Database(format!("siblings map: {e}")))?
        .collect::<Result<_, _>>()
        .map_err(|e| AppError::Database(format!("siblings collect: {e}")))?;

    // --- Classement (tous les pilotes) ---
    let mut stmt_res = conn
        .prepare("SELECT * FROM results WHERE session_id = ?1 ORDER BY position ASC")
        .map_err(|e| AppError::Database(format!("results: {e}")))?;
    let results: Vec<ResultRow> = stmt_res
        .query_map([session_id], map_result)
        .map_err(|e| AppError::Database(format!("results map: {e}")))?
        .collect::<Result<_, _>>()
        .map_err(|e| AppError::Database(format!("results collect: {e}")))?;

    // --- Tours (tous les pilotes) ---
    let mut stmt_laps = conn
        .prepare(
            "SELECT driver_name, lap_num, position, lap_time, s1, s2, s3,
                    top_speed, fuel, fuel_used, twfl, twfr, twrl, twrr,
                    fcompound, rcompound, is_pit, is_valid
             FROM laps WHERE session_id = ?1 ORDER BY driver_name, lap_num",
        )
        .map_err(|e| AppError::Database(format!("laps: {e}")))?;
    let laps: Vec<LapRow> = stmt_laps
        .query_map([session_id], |row| {
            Ok(LapRow {
                driver_name: row.get(0)?,
                lap_num: row.get(1)?,
                position: row.get(2)?,
                lap_time: row.get(3)?,
                s1: row.get(4)?,
                s2: row.get(5)?,
                s3: row.get(6)?,
                top_speed: row.get(7)?,
                fuel: row.get(8)?,
                fuel_used: row.get(9)?,
                twfl: row.get(10)?,
                twfr: row.get(11)?,
                twrl: row.get(12)?,
                twrr: row.get(13)?,
                fcompound: row.get(14)?,
                rcompound: row.get(15)?,
                is_pit: row.get::<_, i64>(16)? != 0,
                is_valid: row.get::<_, i64>(17)? != 0,
            })
        })
        .map_err(|e| AppError::Database(format!("laps map: {e}")))?
        .collect::<Result<_, _>>()
        .map_err(|e| AppError::Database(format!("laps collect: {e}")))?;

    // --- Événements de flux (chat, pénalités, incidents…) ---
    let mut stmt_stream = conn
        .prepare(
            "SELECT event_type, et, text FROM stream_events
             WHERE session_id = ?1 ORDER BY et",
        )
        .map_err(|e| AppError::Database(format!("stream: {e}")))?;
    let stream: Vec<StreamEventRow> = stmt_stream
        .query_map([session_id], |row| {
            Ok(StreamEventRow {
                event_type: row.get(0)?,
                et: row.get(1)?,
                text: row.get(2)?,
            })
        })
        .map_err(|e| AppError::Database(format!("stream map: {e}")))?
        .collect::<Result<_, _>>()
        .map_err(|e| AppError::Database(format!("stream collect: {e}")))?;

    Ok(SessionDetail {
        session,
        siblings,
        results,
        laps,
        stream,
    })
}

// ── Graphe de tours ────────────────────────────────────────────────────────────

/// Tour allégé pour le graphe (frontend `LapChartModal`).
#[derive(Debug, Serialize)]
pub struct ChartLapRow {
    pub lap_num: i64,
    pub position: i64,
    pub lap_time: Option<f64>,
    pub s1: Option<f64>,
    pub s2: Option<f64>,
    pub s3: Option<f64>,
    pub fuel: Option<f64>,
    pub fuel_used: Option<f64>,
    pub fcompound: String,
    pub is_pit: bool,
    pub is_valid: bool,
}

/// Payload complet pour le graphe d'une session.
#[derive(Debug, Serialize)]
pub struct LapChartData {
    pub session_id: i64,
    pub track: String,
    pub track_course: String,
    pub session_type: String,
    pub timestamp: i64,
    pub car_type: String,
    pub unique_car_name: String,
    pub car_class: String,
    /// Tours du joueur, ordonnés par lap_num.
    pub laps: Vec<ChartLapRow>,
    /// Meilleur tour perso sur ce circuit + voiture (toutes sessions).
    pub personal_record: Option<f64>,
    /// Meilleur tour de la classe dans cette session.
    pub class_best: Option<f64>,
}

/// Session candidate pour la comparaison dans le graphe.
#[derive(Debug, Serialize)]
pub struct ChartCompareSession {
    pub session_id: i64,
    pub session_type: String,
    pub timestamp: i64,
    pub best_lap: Option<f64>,
    pub laps_count: i64,
}

/// Renvoie les données nécessaires au graphe de tours d'une session :
/// tours du joueur + record perso + meilleur de classe.
#[tauri::command]
pub fn get_lap_chart_data(
    session_id: i64,
    db: State<'_, DbState>,
) -> Result<LapChartData, AppError> {
    let conn = get_conn(&db)?;

    // Infos session + résultat joueur
    let (session_type, timestamp, track, track_course, car_type, unique_car_name, car_class, result_id) =
        conn.query_row(
            "SELECT s.session_type, s.timestamp, s.track, s.track_course,
                    r.car_type, r.unique_car_name, r.car_class, r.id
             FROM sessions s
             JOIN results r ON r.session_id = s.id AND r.is_player = 1
             WHERE s.id = ?1
             LIMIT 1",
            [session_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, i64>(7)?,
                ))
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound(format!("session {session_id} : aucun résultat joueur"))
            }
            other => AppError::Database(format!("lap chart info: {other}")),
        })?;

    // Tours du joueur
    let mut stmt = conn
        .prepare(
            "SELECT lap_num, position, lap_time, s1, s2, s3, fuel, fuel_used,
                    fcompound, is_pit, is_valid
             FROM laps WHERE result_id = ?1 ORDER BY lap_num",
        )
        .map_err(|e| AppError::Database(format!("lap chart laps prepare: {e}")))?;

    let laps: Vec<ChartLapRow> = stmt
        .query_map([result_id], |row| {
            Ok(ChartLapRow {
                lap_num: row.get(0)?,
                position: row.get(1)?,
                lap_time: row.get(2)?,
                s1: row.get(3)?,
                s2: row.get(4)?,
                s3: row.get(5)?,
                fuel: row.get(6)?,
                fuel_used: row.get(7)?,
                fcompound: row.get(8)?,
                is_pit: row.get::<_, i64>(9)? != 0,
                is_valid: row.get::<_, i64>(10)? != 0,
            })
        })
        .map_err(|e| AppError::Database(format!("lap chart laps map: {e}")))?
        .collect::<Result<_, _>>()
        .map_err(|e| AppError::Database(format!("lap chart laps collect: {e}")))?;

    // Record personnel toutes sessions (même circuit + voiture)
    let personal_record: Option<f64> = conn
        .query_row(
            "SELECT MIN(r.best_lap)
             FROM results r
             JOIN sessions s ON s.id = r.session_id
             WHERE r.is_player = 1
               AND s.track = ?1
               AND s.track_course = ?2
               AND r.unique_car_name = ?3
               AND r.best_lap > 0",
            rusqlite::params![track, track_course, unique_car_name],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| AppError::Database(format!("personal record: {e}")))?
        .flatten();

    // Meilleur tour de la classe dans cette session
    let class_best: Option<f64> = conn
        .query_row(
            "SELECT MIN(best_lap) FROM results
             WHERE session_id = ?1 AND car_class = ?2 AND best_lap > 0",
            rusqlite::params![session_id, car_class],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| AppError::Database(format!("class best: {e}")))?
        .flatten();

    Ok(LapChartData {
        session_id,
        track,
        track_course,
        session_type,
        timestamp,
        car_type,
        unique_car_name,
        car_class,
        laps,
        personal_record,
        class_best,
    })
}

/// Renvoie la liste des sessions du joueur sur le même circuit + voiture,
/// pour la fonctionnalité « Comparer avec une autre session ».
#[tauri::command]
pub fn get_chart_compare_sessions(
    session_id: i64,
    db: State<'_, DbState>,
) -> Result<Vec<ChartCompareSession>, AppError> {
    let conn = get_conn(&db)?;

    // Circuit + voiture de la session de référence
    let (track, track_course, unique_car_name): (String, String, String) = conn
        .query_row(
            "SELECT s.track, s.track_course, r.unique_car_name
             FROM sessions s
             JOIN results r ON r.session_id = s.id AND r.is_player = 1
             WHERE s.id = ?1 LIMIT 1",
            [session_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| AppError::Database(format!("compare sessions base: {e}")))?;

    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.session_type, s.timestamp, r.best_lap, r.total_laps_valid
             FROM sessions s
             JOIN results r ON r.session_id = s.id AND r.is_player = 1
             WHERE s.track = ?1
               AND s.track_course = ?2
               AND r.unique_car_name = ?3
               AND r.total_laps_valid > 0
               AND s.id != ?4
             ORDER BY r.best_lap ASC NULLS LAST
             LIMIT 30",
        )
        .map_err(|e| AppError::Database(format!("compare sessions prepare: {e}")))?;

    let sessions: Vec<ChartCompareSession> = stmt
        .query_map(
            rusqlite::params![track, track_course, unique_car_name, session_id],
            |row| {
                Ok(ChartCompareSession {
                    session_id: row.get(0)?,
                    session_type: row.get(1)?,
                    timestamp: row.get(2)?,
                    best_lap: row.get(3)?,
                    laps_count: row.get(4)?,
                })
            },
        )
        .map_err(|e| AppError::Database(format!("compare sessions map: {e}")))?
        .collect::<Result<_, _>>()
        .map_err(|e| AppError::Database(format!("compare sessions collect: {e}")))?;

    Ok(sessions)
}
