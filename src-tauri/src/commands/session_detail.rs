//! Commande de détail d'une session (page Race Details).
//!
//! Renvoie toutes les données d'une session : infos, classement (tous les
//! pilotes), tours, événements de flux. Le frontend en dérive les 8 onglets V1
//! (`race_details.php`).

use rusqlite::Row;
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
    let mut stmt_sib = conn
        .prepare(
            "SELECT id, session_type FROM sessions WHERE event_id = ?1
             ORDER BY CASE session_type WHEN 'Race' THEN 0 WHEN 'Qualify' THEN 1
                      ELSE 2 END, timestamp",
        )
        .map_err(|e| AppError::Database(format!("siblings: {e}")))?;
    let siblings: Vec<SiblingSession> = stmt_sib
        .query_map([session.event_id], |row| {
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
