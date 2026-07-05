//! Commandes de requête pour le Dashboard et la liste des Sessions.
//!
//! Réécriture des règles de `includes/queries.php`, `index.php` et
//! `sessions.php` de la V1. « Sessions du joueur » = lignes `results` où
//! `is_player = 1`, jointes à `sessions`.

use rusqlite::{params_from_iter, types::Value, Connection};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::{get_conn, DbState};
use crate::error::AppError;
use crate::models::{class_order, compute_optimal_lap};

// ===========================================================================
// Dashboard — statistiques globales
// ===========================================================================

#[derive(Debug, Default, Serialize)]
pub struct DashboardStats {
    /// Tous les tours (valides + invalides) depuis la table `laps`.
    pub total_laps: i64,
    /// Tours avec `is_valid = 1` (lap_time > 0).
    pub total_laps_valid: i64,
    /// Tours avec `is_valid = 0` (tours partiels, sorties des stands…).
    pub total_laps_invalid: i64,
    pub total_driving_hours: f64,
    /// Distance en km sur les tours valides (tours valides × longueur du circuit).
    pub total_distance_km: f64,
    /// Distance en km sur tous les tours (valides + invalides × longueur du circuit).
    pub total_distance_all_km: f64,
    pub total_sessions: i64,
    pub best_finish: Option<i64>,
    pub best_progression: Option<i64>,
    pub podiums: i64,
    pub wins: i64,
    pub top10: i64,
    /// Résultats sur les courses EN LIGNE (setting = Multiplayer) uniquement.
    pub online_wins: i64,
    pub online_podiums: i64,
    pub online_top5: i64,
    pub online_top10: i64,
    /// Bilan des courses en ligne : total, finies « normalement », abandons.
    pub online_races_total: i64,
    pub online_races_finished: i64,
    pub online_dnf: i64,
    /// Progression moyenne (places gagnées/perdues) sur les courses en ligne finies.
    pub online_avg_progression: Option<f64>,
    /// Résultats sur les courses HORS LIGNE (setting != Multiplayer) uniquement.
    pub offline_wins: i64,
    pub offline_podiums: i64,
    pub offline_top5: i64,
    pub offline_top10: i64,
    pub offline_races_total: i64,
    pub offline_races_finished: i64,
    pub offline_dnf: i64,
    pub offline_avg_progression: Option<f64>,
    pub offline_best_finish: Option<i64>,
    /// Nombre de courses (session_type = Race).
    pub races_total: i64,
    /// Courses terminées « Finished Normally ».
    pub races_finished: i64,
    /// Abandons (finish_status = DNF).
    pub dnf: i64,
    /// Courses où le joueur a signé le meilleur tour de SA classe.
    pub fastest_laps: i64,
    /// Moyenne de progression (places gagnées/perdues) sur les courses finies.
    pub avg_progression: Option<f64>,
    pub favorite_track: Option<String>,
    pub favorite_car: Option<String>,
    pub best_finish_track: Option<String>,
    pub best_finish_car: Option<String>,
    pub best_progression_track: Option<String>,
    pub best_progression_car: Option<String>,
}

#[tauri::command]
pub fn get_dashboard_stats(db: State<'_, DbState>) -> Result<DashboardStats, AppError> {
    let conn = get_conn(&db)?;
    let mut stats = DashboardStats::default();

    conn.query_row(
        "SELECT
            COUNT(*),
            MIN(CASE WHEN s.session_type = 'Race' AND s.setting = 'Multiplayer'
                      AND r.finish_status = 'Finished Normally' THEN r.class_position END),
            MAX(r.progression),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race'
                      AND r.finish_status = 'Finished Normally'
                      AND r.class_position <= 3 THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race'
                      AND r.finish_status = 'Finished Normally'
                      AND r.class_position = 1 THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race'
                      AND r.finish_status = 'Finished Normally'
                      AND r.class_position <= 10 THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race'
                      AND r.finish_status = 'Finished Normally' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race'
                      AND r.finish_status = 'DNF' THEN 1 ELSE 0 END), 0),
            AVG(CASE WHEN s.session_type = 'Race'
                      AND r.finish_status = 'Finished Normally'
                      THEN r.progression END),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race' AND s.setting = 'Multiplayer'
                      AND r.finish_status = 'Finished Normally'
                      AND r.class_position = 1 THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race' AND s.setting = 'Multiplayer'
                      AND r.finish_status = 'Finished Normally'
                      AND r.class_position <= 3 THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race' AND s.setting = 'Multiplayer'
                      AND r.finish_status = 'Finished Normally'
                      AND r.class_position <= 5 THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race' AND s.setting = 'Multiplayer'
                      AND r.finish_status = 'Finished Normally'
                      AND r.class_position <= 10 THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race' AND s.setting = 'Multiplayer'
                      THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race' AND s.setting = 'Multiplayer'
                      AND r.finish_status = 'Finished Normally' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race' AND s.setting = 'Multiplayer'
                      AND r.finish_status = 'DNF' THEN 1 ELSE 0 END), 0),
            AVG(CASE WHEN s.session_type = 'Race' AND s.setting = 'Multiplayer'
                      AND r.finish_status = 'Finished Normally'
                      THEN r.progression END),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race' AND s.setting <> 'Multiplayer'
                      AND r.finish_status = 'Finished Normally'
                      AND r.class_position = 1 THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race' AND s.setting <> 'Multiplayer'
                      AND r.finish_status = 'Finished Normally'
                      AND r.class_position <= 3 THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race' AND s.setting <> 'Multiplayer'
                      AND r.finish_status = 'Finished Normally'
                      AND r.class_position <= 5 THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race' AND s.setting <> 'Multiplayer'
                      AND r.finish_status = 'Finished Normally'
                      AND r.class_position <= 10 THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race' AND s.setting <> 'Multiplayer'
                      THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race' AND s.setting <> 'Multiplayer'
                      AND r.finish_status = 'Finished Normally' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race' AND s.setting <> 'Multiplayer'
                      AND r.finish_status = 'DNF' THEN 1 ELSE 0 END), 0),
            AVG(CASE WHEN s.session_type = 'Race' AND s.setting <> 'Multiplayer'
                      AND r.finish_status = 'Finished Normally'
                      THEN r.progression END),
            MIN(CASE WHEN s.session_type = 'Race' AND s.setting <> 'Multiplayer'
                      AND r.finish_status = 'Finished Normally' THEN r.class_position END)
         FROM results r JOIN sessions s ON s.id = r.session_id
         WHERE r.is_player = 1",
        [],
        |row| {
            stats.total_sessions = row.get(0)?;
            stats.best_finish = row.get(1)?;
            stats.best_progression = row.get(2)?;
            stats.podiums = row.get(3)?;
            stats.wins = row.get(4)?;
            stats.top10 = row.get(5)?;
            stats.races_total = row.get(6)?;
            stats.races_finished = row.get(7)?;
            stats.dnf = row.get(8)?;
            stats.avg_progression = row.get(9)?;
            stats.online_wins = row.get(10)?;
            stats.online_podiums = row.get(11)?;
            stats.online_top5 = row.get(12)?;
            stats.online_top10 = row.get(13)?;
            stats.online_races_total = row.get(14)?;
            stats.online_races_finished = row.get(15)?;
            stats.online_dnf = row.get(16)?;
            stats.online_avg_progression = row.get(17)?;
            stats.offline_wins = row.get(18)?;
            stats.offline_podiums = row.get(19)?;
            stats.offline_top5 = row.get(20)?;
            stats.offline_top10 = row.get(21)?;
            stats.offline_races_total = row.get(22)?;
            stats.offline_races_finished = row.get(23)?;
            stats.offline_dnf = row.get(24)?;
            stats.offline_avg_progression = row.get(25)?;
            stats.offline_best_finish = row.get(26)?;
            Ok(())
        },
    )
    .map_err(|e| AppError::Database(format!("dashboard stats: {e}")))?;

    // Meilleurs tours : nombre de courses où le joueur a signé le meilleur tour
    // de SA classe (comparaison intra-session, classe par classe).
    stats.fastest_laps = conn
        .query_row(
            "SELECT COUNT(*) FROM results r JOIN sessions s ON s.id = r.session_id
             WHERE r.is_player = 1 AND s.session_type = 'Race'
               AND r.best_lap IS NOT NULL AND r.best_lap > 0
               AND r.best_lap = (
                 SELECT MIN(r2.best_lap) FROM results r2
                 WHERE r2.session_id = r.session_id
                   AND r2.car_class = r.car_class
                   AND r2.best_lap > 0)",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // Statistiques depuis la table `laps` : tours valides/invalides, temps et distance.
    // - is_valid = 1 → lap_time > 0 (tour chronométré, partiel ou non)
    // - is_valid = 0 → lap_time = 0 (tour sans temps : sortie des stands, 1er/dernier tour)
    // - track_length en mètres → distance en km
    // Approximation assumée : un tour valide = 1 longueur de circuit. Un tour
    // chronométré mais partiel (rare) est compté plein → surcompte négligeable, et
    // aucune donnée de distance par tour n'est stockée pour faire mieux.
    let laps_stats: (i64, i64, f64, f64, f64) = conn
        .query_row(
            "SELECT
                COALESCE(SUM(CASE WHEN l.is_valid = 1 THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN l.is_valid = 0 THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN l.is_valid = 1 THEN l.lap_time ELSE 0.0 END), 0.0),
                COALESCE(SUM(CASE WHEN l.is_valid = 1 THEN x.track_length ELSE 0.0 END), 0.0),
                COALESCE(SUM(x.track_length), 0.0)
             FROM laps l
             JOIN results r ON r.id = l.result_id
             JOIN sessions s ON s.id = r.session_id
             JOIN xml_index x ON x.id = s.xml_id
             WHERE r.is_player = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .unwrap_or((0, 0, 0.0, 0.0, 0.0));

    stats.total_laps_valid   = laps_stats.0;
    stats.total_laps_invalid = laps_stats.1;
    stats.total_laps         = laps_stats.0 + laps_stats.1;
    stats.total_driving_hours = (laps_stats.2 / 3600.0 * 10.0).round() / 10.0;
    stats.total_distance_km   = (laps_stats.3 / 1000.0 * 10.0).round() / 10.0;
    stats.total_distance_all_km = (laps_stats.4 / 1000.0 * 10.0).round() / 10.0;

    // Circuit / voiture favoris (max de tours valides cumulés).
    stats.favorite_track = conn
        .query_row(
            "SELECT s.track FROM results r JOIN sessions s ON s.id = r.session_id
             WHERE r.is_player = 1 GROUP BY s.track
             ORDER BY SUM(r.total_laps_valid) DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok();
    stats.favorite_car = conn
        .query_row(
            "SELECT r.unique_car_name FROM results r WHERE r.is_player = 1
             GROUP BY r.unique_car_name ORDER BY SUM(r.total_laps_valid) DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok();

    // Session du meilleur résultat en ligne.
    if let Ok((t, c)) = conn.query_row(
        "SELECT s.track, r.unique_car_name
         FROM results r JOIN sessions s ON s.id = r.session_id
         WHERE r.is_player = 1 AND s.session_type = 'Race' AND s.setting = 'Multiplayer'
           AND r.finish_status = 'Finished Normally'
         ORDER BY r.class_position ASC LIMIT 1",
        [],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    ) {
        stats.best_finish_track = Some(t);
        stats.best_finish_car = Some(c);
    }

    // Session de la meilleure progression.
    if let Ok((t, c)) = conn.query_row(
        "SELECT s.track, r.unique_car_name
         FROM results r JOIN sessions s ON s.id = r.session_id
         WHERE r.is_player = 1 AND s.session_type = 'Race' AND r.progression IS NOT NULL
         ORDER BY r.progression DESC LIMIT 1",
        [],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    ) {
        stats.best_progression_track = Some(t);
        stats.best_progression_car = Some(c);
    }

    Ok(stats)
}

// ===========================================================================
// Dashboard / Records — meilleurs tours groupés par circuit/voiture
// ===========================================================================

#[derive(Debug, Serialize)]
pub struct BestLapRow {
    pub session_id: i64, // id de la meilleure session (navigation vers le détail)
    pub track: String,
    pub track_course: String,
    pub car_class: String,
    pub car: String,    // unique_car_name
    pub livery: String, // veh_name
    pub session_type: String,
    pub setting: String,
    pub connection_type: String, // Online | Offline
    pub best_lap: f64,
    pub best_lap_s1: Option<f64>,
    pub best_lap_s2: Option<f64>,
    pub best_lap_s3: Option<f64>,
    pub abs_best_s1: Option<f64>,
    pub abs_best_s2: Option<f64>,
    pub abs_best_s3: Option<f64>,
    pub optimal_lap: Option<f64>,
    pub vmax: Option<f64>,
    pub class_position: i64,
    pub class_grid_pos: i64,
    pub progression: Option<i64>,
    pub finish_status: String,
    pub timestamp: i64,
    pub game_version: String,
}

/// Meilleurs tours du joueur, groupés par (circuit, tracé, classe, voiture).
/// Règle V1 `index.php` : meilleur tour de la meilleure session du groupe ;
/// secteurs absolus et vmax agrégés sur tout le groupe.
#[tauri::command]
pub fn get_best_laps(db: State<'_, DbState>) -> Result<Vec<BestLapRow>, AppError> {
    let conn = get_conn(&db)?;

    struct Raw {
        track: String,
        track_course: String,
        car_class: String,
        unique_car_name: String,
        veh_name: String,
        session_type: String,
        setting: String,
        best_lap: f64,
        best_lap_s1: Option<f64>,
        best_lap_s2: Option<f64>,
        best_lap_s3: Option<f64>,
        abs_best_s1: Option<f64>,
        abs_best_s2: Option<f64>,
        abs_best_s3: Option<f64>,
        vmax: Option<f64>,
        class_position: i64,
        class_grid_pos: i64,
        progression: Option<i64>,
        finish_status: String,
        timestamp: i64,
        game_version: String,
        id: i64,
    }

    let mut stmt = conn
        .prepare(
            "SELECT s.track, s.track_course, r.car_class, r.unique_car_name, r.veh_name,
                    s.session_type, s.setting, r.best_lap, r.best_lap_s1, r.best_lap_s2,
                    r.best_lap_s3, r.abs_best_s1, r.abs_best_s2, r.abs_best_s3, r.vmax,
                    r.class_position, r.class_grid_pos, r.progression, r.finish_status,
                    s.timestamp, s.game_version, s.id
             FROM results r JOIN sessions s ON s.id = r.session_id
             WHERE r.is_player = 1 AND r.best_lap IS NOT NULL
             ORDER BY s.track, s.track_course, r.car_class, r.unique_car_name, r.best_lap ASC",
        )
        .map_err(|e| AppError::Database(format!("best_laps prepare: {e}")))?;

    let raws: Vec<Raw> = stmt
        .query_map([], |row| {
            Ok(Raw {
                track: row.get(0)?,
                track_course: row.get(1)?,
                car_class: row.get(2)?,
                unique_car_name: row.get(3)?,
                veh_name: row.get(4)?,
                session_type: row.get(5)?,
                setting: row.get(6)?,
                best_lap: row.get(7)?,
                best_lap_s1: row.get(8)?,
                best_lap_s2: row.get(9)?,
                best_lap_s3: row.get(10)?,
                abs_best_s1: row.get(11)?,
                abs_best_s2: row.get(12)?,
                abs_best_s3: row.get(13)?,
                vmax: row.get(14)?,
                class_position: row.get(15)?,
                class_grid_pos: row.get(16)?,
                progression: row.get(17)?,
                finish_status: row.get(18)?,
                timestamp: row.get(19)?,
                game_version: row.get(20)?,
                id: row.get(21)?,
            })
        })
        .map_err(|e| AppError::Database(format!("best_laps query: {e}")))?
        .collect::<Result<_, _>>()
        .map_err(|e| AppError::Database(format!("best_laps collect: {e}")))?;

    // Groupage par clé (track|course|class|car).
    let mut out: Vec<BestLapRow> = Vec::new();
    let mut i = 0;
    while i < raws.len() {
        let key = (
            &raws[i].track,
            &raws[i].track_course,
            &raws[i].car_class,
            &raws[i].unique_car_name,
        );
        let mut j = i;
        // Les lignes sont triées : le 1er du groupe a le meilleur tour.
        let mut min_abs_s1 = raws[i].abs_best_s1;
        let mut min_abs_s2 = raws[i].abs_best_s2;
        let mut min_abs_s3 = raws[i].abs_best_s3;
        let mut max_vmax = raws[i].vmax;
        while j < raws.len()
            && (
                &raws[j].track,
                &raws[j].track_course,
                &raws[j].car_class,
                &raws[j].unique_car_name,
            ) == key
        {
            min_abs_s1 = min_opt(min_abs_s1, raws[j].abs_best_s1);
            min_abs_s2 = min_opt(min_abs_s2, raws[j].abs_best_s2);
            min_abs_s3 = min_opt(min_abs_s3, raws[j].abs_best_s3);
            max_vmax = max_opt(max_vmax, raws[j].vmax);
            j += 1;
        }
        let best = &raws[i]; // meilleur tour du groupe
        out.push(BestLapRow {
            session_id: best.id,
            track: best.track.clone(),
            track_course: best.track_course.clone(),
            car_class: best.car_class.clone(),
            car: best.unique_car_name.clone(),
            livery: best.veh_name.clone(),
            session_type: best.session_type.clone(),
            setting: best.setting.clone(),
            connection_type: if best.setting == "Multiplayer" {
                "Online".into()
            } else {
                "Offline".into()
            },
            best_lap: best.best_lap,
            best_lap_s1: best.best_lap_s1,
            best_lap_s2: best.best_lap_s2,
            best_lap_s3: best.best_lap_s3,
            abs_best_s1: min_abs_s1,
            abs_best_s2: min_abs_s2,
            abs_best_s3: min_abs_s3,
            optimal_lap: compute_optimal_lap(min_abs_s1, min_abs_s2, min_abs_s3),
            vmax: max_vmax,
            class_position: best.class_position,
            class_grid_pos: best.class_grid_pos,
            progression: best.progression,
            finish_status: best.finish_status.clone(),
            timestamp: best.timestamp,
            game_version: best.game_version.clone(),
        });
        i = j;
    }

    // Tri final : circuit → tracé → classe → meilleur tour (règle V1).
    out.sort_by(|a, b| {
        a.track
            .cmp(&b.track)
            .then(a.track_course.cmp(&b.track_course))
            .then(class_order(&a.car_class).cmp(&class_order(&b.car_class)))
            .then(
                a.best_lap
                    .partial_cmp(&b.best_lap)
                    .unwrap_or(std::cmp::Ordering::Equal),
            )
    });

    Ok(out)
}

fn min_opt(a: Option<f64>, b: Option<f64>) -> Option<f64> {
    match (a, b) {
        (Some(x), Some(y)) => Some(x.min(y)),
        (Some(x), None) => Some(x),
        (None, y) => y,
    }
}

fn max_opt(a: Option<f64>, b: Option<f64>) -> Option<f64> {
    match (a, b) {
        (Some(x), Some(y)) => Some(x.max(y)),
        (Some(x), None) => Some(x),
        (None, y) => y,
    }
}

// ===========================================================================
// Options de filtres
// ===========================================================================

#[derive(Debug, Default, Serialize)]
pub struct FilterOptions {
    pub tracks: Vec<String>,
    pub layouts: Vec<LayoutOption>,
    pub classes: Vec<String>,
    pub cars: Vec<CarOption>,
    pub session_types: Vec<String>,
    pub settings: Vec<String>,
    pub versions: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct LayoutOption {
    pub track: String,
    pub layout: String,
}

#[derive(Debug, Serialize)]
pub struct CarOption {
    pub car: String,
    pub car_class: String,
}

#[tauri::command]
pub fn get_filter_options(db: State<'_, DbState>) -> Result<FilterOptions, AppError> {
    let conn = get_conn(&db)?;
    let mut opts = FilterOptions::default();

    opts.tracks = collect_strings(
        &conn,
        "SELECT DISTINCT track FROM xml_index WHERE track != '' ORDER BY track",
    )?;

    {
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT track, track_course FROM xml_index
                 WHERE track_course != '' AND track_course != track
                 ORDER BY track, track_course",
            )
            .map_err(|e| AppError::Database(format!("layouts: {e}")))?;
        opts.layouts = stmt
            .query_map([], |r| {
                Ok(LayoutOption {
                    track: r.get(0)?,
                    layout: r.get(1)?,
                })
            })
            .map_err(|e| AppError::Database(format!("layouts map: {e}")))?
            .collect::<Result<_, _>>()
            .map_err(|e| AppError::Database(format!("layouts collect: {e}")))?;
    }

    // Filtres = uniquement ce que le JOUEUR a réellement piloté.
    // La table `results` contient TOUS les pilotes ; on restreint via `is_player = 1`.
    opts.classes = collect_strings(
        &conn,
        "SELECT DISTINCT car_class FROM results
         WHERE is_player = 1 AND car_class != ''
         ORDER BY car_class",
    )?;
    opts.classes
        .sort_by(|a, b| class_order(a).cmp(&class_order(b)));

    {
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT unique_car_name, car_class FROM results
                 WHERE is_player = 1
                   AND unique_car_name != '' AND car_class != ''
                 ORDER BY unique_car_name",
            )
            .map_err(|e| AppError::Database(format!("cars: {e}")))?;
        opts.cars = stmt
            .query_map([], |r| {
                Ok(CarOption {
                    car: r.get(0)?,
                    car_class: r.get(1)?,
                })
            })
            .map_err(|e| AppError::Database(format!("cars map: {e}")))?
            .collect::<Result<_, _>>()
            .map_err(|e| AppError::Database(format!("cars collect: {e}")))?;
    }

    opts.session_types = collect_strings(
        &conn,
        "SELECT DISTINCT session_type FROM sessions ORDER BY session_type",
    )?;
    opts.settings = collect_strings(
        &conn,
        "SELECT DISTINCT setting FROM xml_index WHERE setting != '' ORDER BY setting",
    )?;
    opts.versions = game_versions(&conn)?;

    Ok(opts)
}

#[tauri::command]
pub fn get_game_versions(db: State<'_, DbState>) -> Result<Vec<String>, AppError> {
    let conn = get_conn(&db)?;
    game_versions(&conn)
}

fn game_versions(conn: &Connection) -> Result<Vec<String>, AppError> {
    let mut versions = collect_strings(
        conn,
        "SELECT DISTINCT game_version FROM xml_index
         WHERE game_version NOT IN ('0.0','0.0000','') ORDER BY game_version",
    )?;
    versions.sort_by(|a, b| compare_versions(b, a)); // décroissant
    Ok(versions)
}

fn collect_strings(conn: &Connection, sql: &str) -> Result<Vec<String>, AppError> {
    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| AppError::Database(format!("collect prepare: {e}")))?;
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| AppError::Database(format!("collect query: {e}")))?;
    rows.collect::<Result<_, _>>()
        .map_err(|e| AppError::Database(format!("collect: {e}")))
}

/// Compare deux versions de jeu segment par segment (`1.0110` > `0.9200`).
pub fn compare_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let pa: Vec<i64> = a.split('.').map(|x| x.parse().unwrap_or(0)).collect();
    let pb: Vec<i64> = b.split('.').map(|x| x.parse().unwrap_or(0)).collect();
    for i in 0..pa.len().max(pb.len()) {
        let x = pa.get(i).copied().unwrap_or(0);
        let y = pb.get(i).copied().unwrap_or(0);
        match x.cmp(&y) {
            std::cmp::Ordering::Equal => continue,
            other => return other,
        }
    }
    std::cmp::Ordering::Equal
}

// ===========================================================================
// Liste des sessions (paginée + filtrée)
// ===========================================================================

#[derive(Debug, Default, Deserialize)]
pub struct SessionFilters {
    pub track: Option<String>,
    pub track_course: Option<String>,
    pub car_class: Option<String>,
    pub car: Option<String>,
    pub session_type: Option<String>,
    pub setting: Option<String>,
    pub version: Option<String>,
    #[serde(default)]
    pub version_exact: bool,
}

#[derive(Debug, Serialize)]
pub struct SessionListRow {
    pub session_id: i64, // s.id (pour navigation vers le détail)
    pub event_id: i64,
    pub session_type: String,
    pub timestamp: i64,
    pub track: String,
    pub track_course: String,
    pub car: String,
    pub livery: String,
    pub car_class: String,
    pub grid_pos: i64,
    pub class_position: i64,
    pub progression: Option<i64>,
    pub participants: i64,
    pub pitstops: i64,
    pub finish_status: String,
    pub best_lap: Option<f64>,
    pub setting: String,
    pub game_version: String,
}

#[derive(Debug, Serialize)]
pub struct SessionsPage {
    pub rows: Vec<SessionListRow>,
    pub total: i64,
    pub page: i64,
    pub per_page: i64,
    pub total_pages: i64,
}

#[tauri::command]
pub fn get_sessions_list(
    filters: SessionFilters,
    sort_by: Option<String>,
    sort_dir: Option<String>,
    page: Option<i64>,
    per_page: Option<i64>,
    db: State<'_, DbState>,
) -> Result<SessionsPage, AppError> {
    let conn = get_conn(&db)?;

    // --- WHERE dynamique ---
    let mut conditions: Vec<String> = vec!["r.is_player = 1".into()];
    let mut sql_params: Vec<Value> = Vec::new();

    let add = |col: &str, val: &Option<String>, conditions: &mut Vec<String>, p: &mut Vec<Value>| {
        if let Some(v) = val {
            if v != "all" && !v.is_empty() {
                p.push(Value::Text(v.clone()));
                conditions.push(format!("{col} = ?{}", p.len()));
            }
        }
    };
    add("s.track", &filters.track, &mut conditions, &mut sql_params);
    add("s.track_course", &filters.track_course, &mut conditions, &mut sql_params);
    add("r.car_class", &filters.car_class, &mut conditions, &mut sql_params);
    add("r.unique_car_name", &filters.car, &mut conditions, &mut sql_params);
    add("s.session_type", &filters.session_type, &mut conditions, &mut sql_params);
    add("s.setting", &filters.setting, &mut conditions, &mut sql_params);
    if let Some(v) = &filters.version {
        if v != "all" && !v.is_empty() {
            sql_params.push(Value::Text(v.clone()));
            let op = if filters.version_exact { "=" } else { ">=" };
            conditions.push(format!("s.game_version {op} ?{}", sql_params.len()));
        }
    }
    let where_sql = format!("WHERE {}", conditions.join(" AND "));

    // --- ORDER BY ---
    let sort_by = sort_by.unwrap_or_else(|| "Date".into());
    let dir = if sort_dir.as_deref() == Some("asc") { "ASC" } else { "DESC" };
    // Colonnes triables — toutes celles de `sessions.php` V1 (columnMap).
    let order_sql = match sort_by.as_str() {
        "Date" => format!(
            "ORDER BY s.event_id {dir}, CASE s.session_type WHEN 'Race' THEN 0 \
             WHEN 'Qualify' THEN 1 ELSE 2 END ASC"
        ),
        "BestLap" => format!(
            "ORDER BY CASE WHEN r.best_lap IS NULL THEN 1 ELSE 0 END ASC, r.best_lap {dir}"
        ),
        "Track" => format!("ORDER BY s.track {dir}"),
        "TrackCourse" => format!("ORDER BY s.track_course {dir}"),
        "Setting" => format!("ORDER BY s.setting {dir}"),
        "SessionType" => format!("ORDER BY s.session_type {dir}"),
        "Car" => format!("ORDER BY r.unique_car_name {dir}"),
        "Livery" => format!("ORDER BY r.veh_name {dir}"),
        "GridPos" => format!("ORDER BY r.grid_pos {dir}"),
        "Position" => format!("ORDER BY r.class_position {dir}"),
        "Progression" => format!(
            "ORDER BY CASE WHEN r.progression IS NULL THEN 1 ELSE 0 END ASC, \
             r.progression {dir}"
        ),
        "Pitstops" => format!("ORDER BY r.pitstops {dir}"),
        "GameVersion" => format!("ORDER BY s.game_version {dir}"),
        "Class" => format!(
            "ORDER BY CASE r.car_class WHEN 'Hyper' THEN 1 WHEN 'LMP2 WEC' THEN 2 \
             WHEN 'LMP2 ELMS' THEN 3 WHEN 'LMP3' THEN 4 WHEN 'GT3' THEN 5 \
             WHEN 'GTE' THEN 6 ELSE 99 END {dir}"
        ),
        _ => format!("ORDER BY s.event_id {dir}"),
    };

    let from = "FROM results r JOIN sessions s ON s.id = r.session_id";

    // --- Total ---
    let total: i64 = conn
        .query_row(
            &format!("SELECT COUNT(*) {from} {where_sql}"),
            params_from_iter(sql_params.iter()),
            |row| row.get(0),
        )
        .map_err(|e| AppError::Database(format!("sessions count: {e}")))?;

    // --- Pagination ---
    let per_page = per_page.filter(|p| [15, 25, 50, 100, 200].contains(p)).unwrap_or(25);
    let total_pages = if per_page > 0 {
        ((total as f64) / (per_page as f64)).ceil() as i64
    } else {
        1
    }
    .max(1);
    let page = page.unwrap_or(1).clamp(1, total_pages);
    let offset = (page - 1) * per_page;

    let sql = format!(
        "SELECT s.id, s.event_id, s.session_type, s.timestamp, s.track, s.track_course,
                r.unique_car_name, r.veh_name, r.car_class, r.grid_pos, r.class_position,
                r.progression, s.participants, r.pitstops, r.finish_status, r.best_lap,
                s.setting, s.game_version
         {from} {where_sql} {order_sql} LIMIT {per_page} OFFSET {offset}"
    );
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| AppError::Database(format!("sessions prepare: {e}")))?;
    let rows: Vec<SessionListRow> = stmt
        .query_map(params_from_iter(sql_params.iter()), |row| {
            Ok(SessionListRow {
                session_id: row.get(0)?,
                event_id: row.get(1)?,
                session_type: row.get(2)?,
                timestamp: row.get(3)?,
                track: row.get(4)?,
                track_course: row.get(5)?,
                car: row.get(6)?,
                livery: row.get(7)?,
                car_class: row.get(8)?,
                grid_pos: row.get(9)?,
                class_position: row.get(10)?,
                progression: row.get(11)?,
                participants: row.get(12)?,
                pitstops: row.get(13)?,
                finish_status: row.get(14)?,
                best_lap: row.get(15)?,
                setting: row.get(16)?,
                game_version: row.get(17)?,
            })
        })
        .map_err(|e| AppError::Database(format!("sessions query: {e}")))?
        .collect::<Result<_, _>>()
        .map_err(|e| AppError::Database(format!("sessions collect: {e}")))?;

    Ok(SessionsPage {
        rows,
        total,
        page,
        per_page,
        total_pages,
    })
}

/// Compteurs en-tête de la page Sessions (hero card V1 `sessions.php`).
#[derive(Debug, Default, Serialize)]
pub struct SessionsOverview {
    pub total: i64,
    pub races: i64,
    pub qualifs: i64,
    pub practices: i64,
    pub cars: i64,
    pub tracks: i64,
    pub layouts: i64,
}

#[tauri::command]
pub fn get_sessions_overview(db: State<'_, DbState>) -> Result<SessionsOverview, AppError> {
    let conn = get_conn(&db)?;
    let mut o = SessionsOverview::default();
    conn.query_row(
        "SELECT
            COUNT(*),
            COALESCE(SUM(CASE WHEN s.session_type = 'Race' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.session_type = 'Qualify' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.session_type LIKE 'Practice%' THEN 1 ELSE 0 END), 0),
            COUNT(DISTINCT r.unique_car_name),
            COUNT(DISTINCT s.track),
            COUNT(DISTINCT s.track || '|' || s.track_course)
         FROM results r JOIN sessions s ON s.id = r.session_id
         WHERE r.is_player = 1",
        [],
        |row| {
            o.total = row.get(0)?;
            o.races = row.get(1)?;
            o.qualifs = row.get(2)?;
            o.practices = row.get(3)?;
            o.cars = row.get(4)?;
            o.tracks = row.get(5)?;
            o.layouts = row.get(6)?;
            Ok(())
        },
    )
    .map_err(|e| AppError::Database(format!("sessions overview: {e}")))?;
    Ok(o)
}

// ===========================================================================
// Activité — calendrier des courses (page Profil)
// ===========================================================================

/// Une course du joueur réduite à l'horodatage et au mode (en ligne / hors ligne).
/// Sert à construire la heatmap d'activité et les stats de régularité du Profil.
#[derive(Debug, Serialize)]
pub struct RaceActivityRow {
    pub timestamp: i64,
    pub online: bool,
}

/// Toutes les sessions jouées (Practice / Qualify / Race, une ligne par session),
/// triées par date. Le front en dérive la heatmap (sessions/jour) et les séries
/// de régularité (jours pendant lesquels le joueur a joué, quel que soit le type).
#[tauri::command]
pub fn get_race_activity(db: State<'_, DbState>) -> Result<Vec<RaceActivityRow>, AppError> {
    let conn = get_conn(&db)?;
    let mut stmt = conn
        .prepare(
            "SELECT s.timestamp, s.setting
             FROM sessions s JOIN results r ON r.session_id = s.id
             WHERE r.is_player = 1 AND s.timestamp > 0
             ORDER BY s.timestamp ASC",
        )
        .map_err(|e| AppError::Database(format!("race_activity prepare: {e}")))?;
    let rows = stmt
        .query_map([], |row| {
            let setting: String = row.get(1)?;
            Ok(RaceActivityRow {
                timestamp: row.get(0)?,
                online: setting == "Multiplayer",
            })
        })
        .map_err(|e| AppError::Database(format!("race_activity query: {e}")))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::Database(format!("race_activity collect: {e}")))?;
    Ok(rows)
}
