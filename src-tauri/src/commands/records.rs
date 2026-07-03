//! Records personnels — vue d'ensemble + progression d'un couple circuit/voiture.
//!
//! Réinterprétation de `records.php` (V1) en deux niveaux :
//! - `get_records_overview` : tous les records (1 ligne par combo) ;
//! - `get_record_progression` : l'historique d'un combo (is_pb, gain, classe).

use rusqlite::{params_from_iter, types::Value};
use serde::Serialize;
use tauri::State;

use crate::db::{get_conn, DbState};
use crate::error::AppError;

// ─── Vue d'ensemble ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct RecordOverviewRow {
    pub track: String,
    pub track_course: String,
    pub car: String, // unique_car_name
    pub car_type: String,
    pub car_class: String,
    pub best_lap: f64,
    pub best_lap_s1: Option<f64>,
    pub best_lap_s2: Option<f64>,
    pub best_lap_s3: Option<f64>,
    pub optimal_lap: Option<f64>,
    pub vmax: Option<f64>,
    pub record_date: i64,
    pub game_version: String,
    pub sessions_count: i32,
    pub improvements: i32,
    pub record_session_id: i64,
}

/// Ligne brute (1 session-record du joueur) servie aux deux commandes.
struct Row {
    session_id: i64,
    track: String,
    track_course: String,
    timestamp: i64,
    session_type: String,
    setting: String,
    game_version: String,
    car_class: String,
    car: String,
    car_type: String,
    best_lap: f64,
    s1: Option<f64>,
    s2: Option<f64>,
    s3: Option<f64>,
    optimal_lap: Option<f64>,
    vmax: Option<f64>,
    total_lap_time: f64,
}

fn fetch_player_rows(
    db: &State<'_, DbState>,
    where_extra: &str,
    extra_params: Vec<Value>,
) -> Result<Vec<Row>, AppError> {
    let conn = get_conn(db)?;
    let sql = format!(
        "SELECT s.id, s.track, s.track_course, s.timestamp, s.session_type, s.setting,
                s.game_version, r.car_class, r.unique_car_name, r.car_type,
                r.best_lap, r.best_lap_s1, r.best_lap_s2, r.best_lap_s3,
                r.optimal_lap, r.vmax, r.total_lap_time
         FROM results r JOIN sessions s ON s.id = r.session_id
         WHERE r.is_player = 1 AND r.best_lap IS NOT NULL {where_extra}
         ORDER BY s.track, s.track_course, r.car_class, r.unique_car_name, s.timestamp ASC"
    );
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| AppError::Database(format!("records prepare: {e}")))?;
    let rows = stmt
        .query_map(params_from_iter(extra_params), |r| {
            Ok(Row {
                session_id: r.get(0)?,
                track: r.get(1)?,
                track_course: r.get(2)?,
                timestamp: r.get(3)?,
                session_type: r.get(4)?,
                setting: r.get(5)?,
                game_version: r.get(6)?,
                car_class: r.get(7)?,
                car: r.get(8)?,
                car_type: r.get(9)?,
                best_lap: r.get(10)?,
                s1: r.get(11)?,
                s2: r.get(12)?,
                s3: r.get(13)?,
                optimal_lap: r.get(14)?,
                vmax: r.get(15)?,
                total_lap_time: r.get(16)?,
            })
        })
        .map_err(|e| AppError::Database(format!("records query: {e}")))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::Database(format!("records collect: {e}")))
}

#[tauri::command]
pub fn get_records_overview(
    min_version: Option<String>,
    db: State<'_, DbState>,
) -> Result<Vec<RecordOverviewRow>, AppError> {
    // Filtre version : sessions dont game_version >= min_version (ordre lexicographique
    // LMU "0.9200" < "1.0" → ordre correct car le jeu utilise des chaînes dotted comparables).
    let (where_clause, params) = match min_version.as_deref().filter(|v| !v.is_empty()) {
        Some(v) => (
            " AND s.game_version >= ?".to_string(),
            vec![Value::Text(v.to_string())],
        ),
        None => (String::new(), Vec::new()),
    };
    let rows = fetch_player_rows(&db, &where_clause, params)?;

    let mut out: Vec<RecordOverviewRow> = Vec::new();
    let mut i = 0;
    while i < rows.len() {
        let key = (
            &rows[i].track,
            &rows[i].track_course,
            &rows[i].car_class,
            &rows[i].car,
        );
        let mut j = i;
        // Sessions du combo, déjà triées ASC par timestamp.
        let mut record: &Row = &rows[i];
        let mut running_pb = f64::INFINITY;
        let mut improvements = 0;
        let mut optimal: Option<f64> = None;
        let mut vmax: Option<f64> = None;
        let mut count = 0;
        while j < rows.len()
            && (&rows[j].track, &rows[j].track_course, &rows[j].car_class, &rows[j].car) == key
        {
            let r = &rows[j];
            count += 1;
            if r.best_lap < running_pb {
                // Ne compte pas la 1ʳᵉ session (rien à battre) : `improvements` =
                // nombre de fois où un meilleur tour ANTÉRIEUR a réellement été battu.
                if running_pb.is_finite() {
                    improvements += 1;
                }
                running_pb = r.best_lap;
            }
            // `<` (et non `<=`) : en cas d'égalité du meilleur tour, on conserve la
            // PREMIÈRE session qui l'a réalisé (les lignes sont triées par date ASC) —
            // la « date du record » correspond donc à sa première occurrence.
            if r.best_lap < record.best_lap {
                record = r;
            }
            if let Some(o) = r.optimal_lap {
                optimal = Some(optimal.map_or(o, |m: f64| m.min(o)));
            }
            if let Some(v) = r.vmax {
                vmax = Some(vmax.map_or(v, |m: f64| m.max(v)));
            }
            j += 1;
        }
        out.push(RecordOverviewRow {
            track: record.track.clone(),
            track_course: record.track_course.clone(),
            car: record.car.clone(),
            car_type: record.car_type.clone(),
            car_class: record.car_class.clone(),
            best_lap: record.best_lap,
            best_lap_s1: record.s1,
            best_lap_s2: record.s2,
            best_lap_s3: record.s3,
            optimal_lap: optimal,
            vmax,
            record_date: record.timestamp,
            game_version: record.game_version.clone(),
            sessions_count: count,
            improvements,
            record_session_id: record.session_id,
        });
        i = j;
    }
    // Tri : circuit puis meilleur temps.
    out.sort_by(|a, b| {
        a.track
            .cmp(&b.track)
            .then(a.best_lap.partial_cmp(&b.best_lap).unwrap_or(std::cmp::Ordering::Equal))
    });
    Ok(out)
}

// ─── Progression d'un combo ──────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ProgressionPoint {
    pub session_id: i64,
    pub timestamp: i64,
    pub session_type: String,
    pub setting: String,
    pub game_version: String,
    pub track_course: String,
    pub car_type: String,
    pub best_lap: f64,
    pub s1: Option<f64>,
    pub s2: Option<f64>,
    pub s3: Option<f64>,
    pub optimal_lap: Option<f64>,
    pub vmax: Option<f64>,
    pub is_pb: bool,
    pub pb_at_point: f64,
    pub gain: Option<f64>,
    pub class_best: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct ProgressionStats {
    pub sessions_count: i32,
    pub all_time_pb: f64,
    pub total_gain: Option<f64>,
    pub nb_pb: i32,
    pub optimal: Option<f64>,
    pub vmax: Option<f64>,
    pub days_since_pb: Option<i64>,
    pub total_driving_time: f64,
}

#[derive(Debug, Serialize)]
pub struct RecordProgression {
    pub points: Vec<ProgressionPoint>,
    pub stats: ProgressionStats,
}

#[derive(Debug, serde::Deserialize)]
pub struct ProgressionFilters {
    pub track: String,
    pub car: String,
    pub track_course: Option<String>,
    pub car_class: Option<String>,
    pub session_type: Option<String>,
    pub setting: Option<String>,
    pub version: Option<String>,
    pub version_exact: Option<bool>,
}

#[tauri::command]
pub fn get_record_progression(
    filters: ProgressionFilters,
    db: State<'_, DbState>,
) -> Result<RecordProgression, AppError> {
    // ── Sessions du combo ────────────────────────────────────────────────────
    let mut clauses = String::from(" AND s.track = ? AND r.unique_car_name = ?");
    let mut p: Vec<Value> = vec![
        Value::Text(filters.track.clone()),
        Value::Text(filters.car.clone()),
    ];
    if let Some(tc) = filters.track_course.as_ref().filter(|v| !v.is_empty()) {
        clauses.push_str(" AND s.track_course = ?");
        p.push(Value::Text(tc.clone()));
    }
    if let Some(c) = filters.car_class.as_ref().filter(|v| !v.is_empty()) {
        clauses.push_str(" AND r.car_class = ?");
        p.push(Value::Text(c.clone()));
    }
    if let Some(st) = filters.session_type.as_ref().filter(|v| !v.is_empty()) {
        clauses.push_str(" AND s.session_type = ?");
        p.push(Value::Text(st.clone()));
    }
    if let Some(set) = filters.setting.as_ref().filter(|v| !v.is_empty()) {
        clauses.push_str(" AND s.setting = ?");
        p.push(Value::Text(set.clone()));
    }
    if let Some(v) = filters.version.as_ref().filter(|v| !v.is_empty() && *v != "all") {
        clauses.push_str(if filters.version_exact.unwrap_or(false) {
            " AND s.game_version = ?"
        } else {
            " AND s.game_version >= ?"
        });
        p.push(Value::Text(v.clone()));
    }
    let rows = fetch_player_rows(&db, &clauses, p)?;

    // ── Meilleur temps de la classe (course min, alignée sur le circuit) ─────
    // Pour la courbe de référence « meilleur de la classe » du graphique.
    let class_rows: Vec<(i64, f64)> = {
        // On déduit la classe : celle fournie, sinon celle de la 1ʳᵉ ligne.
        let class = filters
            .car_class
            .clone()
            .filter(|v| !v.is_empty())
            .or_else(|| rows.first().map(|r| r.car_class.clone()));
        match class {
            None => Vec::new(),
            Some(class) => {
                let conn = get_conn(&db)?;
                let mut sql = String::from(
                    "SELECT s.timestamp, r.best_lap FROM results r
                     JOIN sessions s ON s.id = r.session_id
                     WHERE r.is_player = 1 AND r.best_lap IS NOT NULL
                       AND s.track = ? AND r.car_class = ?",
                );
                let mut cp: Vec<Value> = vec![
                    Value::Text(filters.track.clone()),
                    Value::Text(class),
                ];
                if let Some(tc) = filters.track_course.as_ref().filter(|v| !v.is_empty()) {
                    sql.push_str(" AND s.track_course = ?");
                    cp.push(Value::Text(tc.clone()));
                }
                sql.push_str(" ORDER BY s.timestamp ASC");
                let mut stmt = conn
                    .prepare(&sql)
                    .map_err(|e| AppError::Database(format!("class prepare: {e}")))?;
                let it = stmt
                    .query_map(params_from_iter(cp), |r| {
                        Ok((r.get::<_, i64>(0)?, r.get::<_, f64>(1)?))
                    })
                    .map_err(|e| AppError::Database(format!("class query: {e}")))?;
                it.collect::<Result<Vec<_>, _>>()
                    .map_err(|e| AppError::Database(format!("class collect: {e}")))?
            }
        }
    };

    // ── Construction des points de progression ───────────────────────────────
    let mut points: Vec<ProgressionPoint> = Vec::new();
    let mut running_pb = f64::INFINITY;
    let mut first_pb: Option<f64> = None;
    let mut nb_pb = 0;
    let mut optimal: Option<f64> = None;
    let mut vmax: Option<f64> = None;
    let mut total_driving_time = 0.0;
    let mut last_pb_ts: Option<i64> = None;

    for r in &rows {
        let prev_pb = running_pb;
        let is_pb = r.best_lap < running_pb;
        // Gain de cette session = temps grappillé sur le record précédent.
        let gain = if is_pb && prev_pb.is_finite() {
            Some(prev_pb - r.best_lap)
        } else {
            None
        };
        if is_pb {
            running_pb = r.best_lap;
            // `nb_pb` (stat « Records battus ») ne compte pas la 1ʳᵉ pose de temps :
            // il n'y avait aucun record antérieur à battre. Le marqueur `is_pb` du
            // point, lui, reste vrai (c'était bien le meilleur à cet instant).
            if prev_pb.is_finite() {
                nb_pb += 1;
            }
            if first_pb.is_none() {
                first_pb = Some(r.best_lap);
            }
            last_pb_ts = Some(r.timestamp);
        }
        // Meilleur de la classe à cet instant (running min jusqu'au timestamp).
        let class_best = class_rows
            .iter()
            .filter(|(ts, _)| *ts <= r.timestamp)
            .map(|(_, lap)| *lap)
            .fold(None, |acc: Option<f64>, lap| {
                Some(acc.map_or(lap, |m| m.min(lap)))
            });
        if let Some(o) = r.optimal_lap {
            optimal = Some(optimal.map_or(o, |m: f64| m.min(o)));
        }
        if let Some(v) = r.vmax {
            vmax = Some(vmax.map_or(v, |m: f64| m.max(v)));
        }
        total_driving_time += r.total_lap_time;

        points.push(ProgressionPoint {
            session_id: r.session_id,
            timestamp: r.timestamp,
            session_type: r.session_type.clone(),
            setting: r.setting.clone(),
            game_version: r.game_version.clone(),
            track_course: r.track_course.clone(),
            car_type: r.car_type.clone(),
            best_lap: r.best_lap,
            s1: r.s1,
            s2: r.s2,
            s3: r.s3,
            optimal_lap: r.optimal_lap,
            vmax: r.vmax,
            is_pb,
            pb_at_point: running_pb,
            gain,
            class_best,
        });
    }

    let all_time_pb = running_pb;
    let total_gain = first_pb.map(|f| f - all_time_pb).filter(|g| *g > 0.0001);
    let days_since_pb = last_pb_ts.map(|ts| {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        (now - ts).max(0) / 86_400
    });

    Ok(RecordProgression {
        stats: ProgressionStats {
            sessions_count: points.len() as i32,
            all_time_pb: if all_time_pb.is_finite() { all_time_pb } else { 0.0 },
            total_gain,
            nb_pb,
            optimal,
            vmax,
            days_since_pb,
            total_driving_time,
        },
        points,
    })
}
