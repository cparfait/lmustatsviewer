//! Repères de progression calculés sur la base locale (aucune lecture du jeu) :
//! - la meilleure session du joueur sur le même circuit, même tracé, même voiture ;
//! - le bilan de la semaine en cours pour les objectifs hebdomadaires.
//!
//! Mêmes définitions que le tableau de bord (§3.4) : course = `session_type = 'Race'`,
//! podium = arrivée normale et place en classe 1 à 3, tours = `total_laps_valid`.

use serde::Serialize;
use tauri::State;

use crate::db::{self, DbState};
use crate::error::AppError;

#[derive(Debug, Clone, Serialize)]
pub struct BestSession {
    pub session_id: i64,
    pub timestamp: i64,
    pub session_type: String,
    pub best_lap: Option<f64>,
    pub median_lap: Option<f64>,
}

/// Meilleure AUTRE session du joueur sur le même circuit + tracé + voiture (celle du
/// meilleur tour, quelle que soit sa date ou son type) ; `None` s'il n'y en a pas. Les
/// sessions au même horodatage (même épreuve : course relancée, fichiers multiples)
/// sont écartées : on compare à une autre sortie.
#[tauri::command]
pub async fn best_session(session_id: i64, db: State<'_, DbState>) -> Result<Option<BestSession>, AppError> {
    let conn = db::get_conn(&db)?;
    let cur = conn.query_row(
        "SELECT s.track, s.track_course, s.timestamp, r.unique_car_name
         FROM sessions s JOIN results r ON r.session_id = s.id AND r.is_player = 1
         WHERE s.id = ?1 LIMIT 1",
        [session_id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?, r.get::<_, String>(3)?)),
    );
    let Ok((track, course, ts, car)) = cur else { return Ok(None) };
    if car.is_empty() {
        return Ok(None);
    }
    let prev = conn.query_row(
        "SELECT s.id, s.timestamp, s.session_type, r.best_lap, r.median_lap
         FROM sessions s JOIN results r ON r.session_id = s.id AND r.is_player = 1
         WHERE s.track = ?1 AND s.track_course = ?2 AND r.unique_car_name = ?3
           AND s.timestamp <> ?4
           AND r.best_lap > 0
         ORDER BY r.best_lap ASC, s.timestamp DESC LIMIT 1",
        rusqlite::params![track, course, car, ts],
        |r| {
            Ok(BestSession {
                session_id: r.get(0)?,
                timestamp: r.get(1)?,
                session_type: r.get(2)?,
                best_lap: r.get::<_, Option<f64>>(3)?.filter(|v| *v > 0.0),
                median_lap: r.get::<_, Option<f64>>(4)?.filter(|v| *v > 0.0),
            })
        },
    );
    Ok(prev.ok())
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct WeeklyProgress {
    /// Courses disputées (sessions de course où le joueur figure).
    pub races: i64,
    /// Podiums en classe (arrivée normale, place 1 à 3).
    pub podiums: i64,
    /// Tours valides, toutes sessions confondues.
    pub laps: i64,
}

/// Bilan depuis `since` (epoch s, début de semaine choisi par l'interface).
#[tauri::command]
pub async fn weekly_progress(since: i64, db: State<'_, DbState>) -> Result<WeeklyProgress, AppError> {
    let conn = db::get_conn(&db)?;
    conn.query_row(
        "SELECT
            COALESCE(SUM(CASE WHEN s.session_type = 'Race' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race' AND r.finish_status = 'Finished Normally'
                      AND r.class_position BETWEEN 1 AND 3 THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(r.total_laps_valid), 0)
         FROM results r JOIN sessions s ON s.id = r.session_id
         WHERE r.is_player = 1 AND s.timestamp >= ?1",
        [since],
        |r| Ok(WeeklyProgress { races: r.get(0)?, podiums: r.get(1)?, laps: r.get(2)? }),
    )
    .map_err(|e| AppError::Database(format!("weekly_progress: {e}")))
}
