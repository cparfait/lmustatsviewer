//! Indexeur delta XML → SQLite.
//!
//! Réécriture des règles de `includes/indexer.php` (V1) :
//! - sync delta par `mtime` (seuls les fichiers nouveaux/modifiés sont parsés) ;
//! - changement de joueur → réindexation complète ;
//! - pré-calcul des agrégats par pilote (best lap, secteurs, optimal, vmax,
//!   progression, carburant, médiane/écart-type/moyenne 5) ;
//! - regroupement d'événements (`compute_event_groups`, seuil 7200 s).

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use rusqlite::{params, Connection};
use tauri::State;

use crate::db::{self, get_conn, DbState};
use crate::error::AppError;
use crate::models::{
    compute_optimal_lap, compute_unique_car_name, format_game_version, normalize_car_class,
    IndexReport,
};
use crate::xml_parser::{parse_xml_file, ParsedDriver};

// ===========================================================================
// Commandes Tauri
// ===========================================================================

/// Sync delta à partir du dossier Results enregistré en config.
#[tauri::command]
pub fn sync_index(db: State<'_, DbState>) -> Result<IndexReport, AppError> {
    let results_dir = db::config_get(&db, "results_dir")?
        .ok_or_else(|| AppError::Config("results_dir non configuré".into()))?;
    let player_name = db::config_get(&db, "player_name")?.unwrap_or_default();
    let mut conn = get_conn(&db)?;
    sync_results(&mut conn, Path::new(&results_dir), &player_name)
}

/// Réindexation complète (vide la base puis réindexe tout).
#[tauri::command]
pub fn reindex_all(db: State<'_, DbState>) -> Result<IndexReport, AppError> {
    db::reset_index(&db)?;
    sync_index(db)
}

/// Vide le cache d'indexation (la prochaine sync relira tous les fichiers).
#[tauri::command]
pub fn clear_index_cache(db: State<'_, DbState>) -> Result<(), AppError> {
    db::reset_index(&db)
}

/// Clause SQL identifiant les fichiers à purger selon le mode V1.
///
/// - `"global"` : fichiers dont aucun pilote n'a tourné (`has_any_laps = 0`).
/// - `"player"` : fichiers où le joueur n'a fait aucun tour (aucun `results`
///   avec `is_player = 1 AND laps_count > 0` rattaché). Reproduit la requête
///   PHP `_scan_empty_sessions` (V1, `functions.php:246`).
fn purge_filter_sql(purge_type: &str) -> &'static str {
    match purge_type {
        "player" => "id NOT IN (
            SELECT DISTINCT s.xml_id
            FROM sessions s
            JOIN results r ON r.session_id = s.id
            WHERE r.is_player = 1 AND r.laps_count > 0
        )",
        // "global" + valeur inconnue → fallback global (comportement V1).
        _ => "has_any_laps = 0",
    }
}

/// Purge les sessions sans aucun tour.
///
/// `purge_type` = `"global"` (défaut) ou `"player"`. Supprime les lignes
/// `xml_index` concernées ; la cascade des clés étrangères nettoie
/// `sessions` / `results` / `laps` / `stream_events`. Les `event_id`
/// sont recalculés ensuite. Renvoie le nombre de fichiers XML purgés.
/// (Reproduit `purgeEmptySessions` de la V1.)
#[tauri::command]
pub fn purge_empty_sessions(
    purge_type: Option<String>,
    db: State<'_, DbState>,
) -> Result<u32, AppError> {
    let mode = purge_type.as_deref().unwrap_or("global");
    let filter = purge_filter_sql(mode);

    // Dossier des fichiers XML (pour la suppression physique, règle V1).
    let results_dir = db::config_get(&db, "results_dir")?.unwrap_or_default();
    let results_dir = PathBuf::from(&results_dir);

    let mut conn = get_conn(&db)?;
    let tx = conn
        .transaction()
        .map_err(|e| AppError::Database(format!("purge tx: {e}")))?;

    // 1. Récupérer la liste des (filename, mtime) à purger.
    let list_sql = format!("SELECT filename, mtime FROM xml_index WHERE {filter}");
    let to_purge: Vec<(String, i64)> = {
        let mut stmt = tx
            .prepare(&list_sql)
            .map_err(|e| AppError::Database(format!("purge list prepare: {e}")))?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
            .map_err(|e| AppError::Database(format!("purge list query: {e}")))?;
        rows.filter_map(|r| r.ok()).collect()
    };

    // 2. Supprimer physiquement les fichiers XML (règle V1 `_scan_empty_sessions`
    //    avec `unlink`). En cas d'échec (permissions, fichier verrouillé…), on
    //    laisse l'entrée dans `purged_files` comme filet de sécurité pour éviter
    //    la réindexation au prochain lancement.
    let mut files_removed: u32 = 0;
    for (filename, _) in &to_purge {
        let path = results_dir.join(filename);
        if path.is_file() {
            if std::fs::remove_file(&path).is_ok() {
                files_removed += 1;
            }
        }
    }
    let _ = files_removed; // (compteur exposé via log éventuel — non renvoyé)

    // 3. Mémoriser dans `purged_files` (filet de sécurité).
    let now = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO purged_files (filename, mtime, purged_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(filename) DO UPDATE SET
                    mtime     = excluded.mtime,
                    purged_at = excluded.purged_at",
            )
            .map_err(|e| AppError::Database(format!("purge remember prepare: {e}")))?;
        for (filename, mtime) in &to_purge {
            stmt.execute(params![filename, mtime, now])
                .map_err(|e| AppError::Database(format!("purge remember: {e}")))?;
        }
    }

    // 4. Supprimer de `xml_index` (cascade vers sessions/results/laps/stream).
    let delete_sql = format!("DELETE FROM xml_index WHERE {filter}");
    let removed = tx
        .execute(&delete_sql, [])
        .map_err(|e| AppError::Database(format!("purge delete: {e}")))?;
    recompute_event_ids(&tx)?;
    tx.commit()
        .map_err(|e| AppError::Database(format!("purge commit: {e}")))?;
    Ok(removed as u32)
}

#[tauri::command]
pub fn count_empty_sessions(
    purge_type: Option<String>,
    db: State<'_, DbState>,
) -> Result<u32, AppError> {
    let mode = purge_type.as_deref().unwrap_or("global");
    let sql = format!("SELECT COUNT(*) FROM xml_index WHERE {}", purge_filter_sql(mode));
    let conn = get_conn(&db)?;
    let count: u32 = conn
        .query_row(&sql, [], |row| row.get(0))
        .map_err(|e| AppError::Database(format!("count empty: {e}")))?;
    Ok(count)
}

/// Configure le chemin du jeu + joueur, puis indexe.
///
/// `results_dir` et `telemetry_dir` sont des **surcharges optionnelles** : si
/// vides/absentes, elles sont dérivées de `lmu_path` (`UserData/Log/Results` et
/// `UserData/Telemetry`). Cela permet aux joueurs qui ont relocalisé ces
/// dossiers de les pointer explicitement.
#[tauri::command]
pub fn run_setup(
    lmu_path: String,
    player_name: String,
    results_dir: Option<String>,
    telemetry_dir: Option<String>,
    db: State<'_, DbState>,
) -> Result<IndexReport, AppError> {
    // Dossier des résultats : surcharge si fournie, sinon dérivé du chemin du jeu.
    let results_dir = results_dir
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(&lmu_path)
                .join("UserData")
                .join("Log")
                .join("Results")
        });
    if !results_dir.is_dir() {
        return Err(AppError::NotFound(format!(
            "Dossier Results introuvable : {}",
            results_dir.display()
        )));
    }

    // Dossier télémétrie : surcharge si fournie, sinon dérivé. Pas de validation
    // d'existence (l'enregistrement peut n'avoir jamais été activé).
    let telemetry_dir = telemetry_dir
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(&lmu_path).join("UserData").join("Telemetry"));

    db::config_set(&db, "lmu_path", &lmu_path)?;
    db::config_set(&db, "results_dir", &results_dir.to_string_lossy())?;
    db::config_set(&db, "telemetry_dir", &telemetry_dir.to_string_lossy())?;
    db::config_set(&db, "player_name", &player_name)?;

    let mut conn = get_conn(&db)?;
    sync_results(&mut conn, &results_dir, &player_name)
}

// ===========================================================================
// Moteur d'indexation
// ===========================================================================

/// Sync delta complet. Renvoie le bilan (ajouts / mises à jour / suppressions).
pub fn sync_results(
    conn: &mut Connection,
    results_dir: &Path,
    player_name: &str,
) -> Result<IndexReport, AppError> {
    let mut report = IndexReport::default();

    if !results_dir.is_dir() {
        return Err(AppError::NotFound(format!(
            "Dossier introuvable : {}",
            results_dir.display()
        )));
    }

    // --- Détection changement de joueur → réindexation complète ---
    let indexed_player: Option<String> = conn
        .query_row(
            "SELECT value FROM config WHERE key = 'indexed_player'",
            [],
            |r| r.get(0),
        )
        .ok();
    if let Some(prev) = &indexed_player {
        if prev != player_name {
            conn.execute_batch(
                "DELETE FROM stream_events; DELETE FROM laps; DELETE FROM results;
                 DELETE FROM sessions; DELETE FROM xml_index;",
            )
            .map_err(|e| AppError::Database(format!("reset on player change: {e}")))?;
        }
    }
    conn.execute(
        "INSERT INTO config (key, value) VALUES ('indexed_player', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![player_name],
    )
    .map_err(|e| AppError::Database(format!("set indexed_player: {e}")))?;

    // --- 1. Scanner le filesystem ---
    let mut fs_files: Vec<(String, PathBuf, i64)> = Vec::new();
    for entry in std::fs::read_dir(results_dir).map_err(AppError::Io)? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_file()
            || !path
                .extension()
                .map(|e| e.eq_ignore_ascii_case("xml"))
                .unwrap_or(false)
        {
            continue;
        }
        let filename = path.file_name().unwrap().to_string_lossy().to_string();
        let mtime = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        fs_files.push((filename, path, mtime));
    }
    report.files_scanned = fs_files.len();

    // --- 2. Index DB existant ---
    let mut indexed: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    {
        let mut stmt = conn
            .prepare("SELECT filename, mtime FROM xml_index")
            .map_err(|e| AppError::Database(format!("read index: {e}")))?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
            .map_err(|e| AppError::Database(format!("read index rows: {e}")))?;
        for row in rows.flatten() {
            indexed.insert(row.0, row.1);
        }
    }

    // --- 2bis. Fichiers purgés volontairement (à ignorer tant que mtime inchangé) ---
    let mut purged: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    {
        let mut stmt = conn
            .prepare("SELECT filename, mtime FROM purged_files")
            .map_err(|e| AppError::Database(format!("read purged: {e}")))?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
            .map_err(|e| AppError::Database(format!("read purged rows: {e}")))?;
        for row in rows.flatten() {
            purged.insert(row.0, row.1);
        }
    }

    // --- 3. Fichiers à traiter / supprimer ---
    // On saute les fichiers purgés dont le mtime n'a pas bougé depuis la purge.
    // Si le fichier a été modifié (rejoué) → on le réindexe et on retire l'entrée
    // de `purged_files`.
    let to_process: Vec<(String, PathBuf, i64)> = fs_files
        .iter()
        .filter(|(name, _, mtime)| {
            if let Some(pm) = purged.get(name) {
                if pm == mtime {
                    return false; // toujours purgé → on ignore
                }
            }
            indexed.get(name).map_or(true, |m| m != mtime)
        })
        .cloned()
        .collect();
    let fs_names: std::collections::HashSet<&String> =
        fs_files.iter().map(|(n, _, _)| n).collect();
    let to_remove: Vec<String> = indexed
        .keys()
        .filter(|n| !fs_names.contains(n))
        .cloned()
        .collect();

    let tx = conn
        .transaction()
        .map_err(|e| AppError::Database(format!("begin tx: {e}")))?;

    // --- 4. Supprimer les fichiers disparus du disque (xml_index + purged_files) ---
    for filename in &to_remove {
        tx.execute("DELETE FROM xml_index WHERE filename = ?1", params![filename])
            .map_err(|e| AppError::Database(format!("delete removed: {e}")))?;
    }
    // Nettoyage : un fichier purgé qui a disparu du disque n'a plus à être mémorisé.
    let purged_names: Vec<String> = purged.keys().cloned().collect();
    for filename in &purged_names {
        if !fs_names.contains(filename) {
            tx.execute("DELETE FROM purged_files WHERE filename = ?1", params![filename])
                .map_err(|e| AppError::Database(format!("cleanup purged: {e}")))?;
        }
    }
    // Pour chaque fichier qui va être réindexé : retirer son entrée `purged_files`
    // (si présente) car il a été modifié depuis la purge.
    for (filename, _, _) in &to_process {
        if purged.contains_key(filename) {
            tx.execute("DELETE FROM purged_files WHERE filename = ?1", params![filename])
                .map_err(|e| AppError::Database(format!("unpurge: {e}")))?;
        }
    }
    report.removed = to_remove.len();

    // --- 5. Indexer les fichiers nouveaux/modifiés ---
    for (filename, path, mtime) in &to_process {
        let existed = indexed.contains_key(filename);
        match index_one_file(&tx, filename, path, *mtime, player_name) {
            Ok(sessions_created) => {
                report.sessions_created += sessions_created;
                if existed {
                    report.updated += 1;
                } else {
                    report.added += 1;
                }
            }
            Err(e) => report.errors.push(format!("{filename}: {e}")),
        }
    }

    // --- 6. Recalculer les event_id ---
    recompute_event_ids(&tx)?;

    tx.commit()
        .map_err(|e| AppError::Database(format!("commit: {e}")))?;

    Ok(report)
}

/// Parse un fichier XML et insère xml_index + sessions + results + laps + stream.
/// Renvoie le nombre de sessions créées.
fn index_one_file(
    tx: &Connection,
    filename: &str,
    path: &Path,
    mtime: i64,
    player_name: &str,
) -> Result<usize, AppError> {
    // Supprimer l'éventuelle ancienne entrée (cascade).
    tx.execute("DELETE FROM xml_index WHERE filename = ?1", params![filename])
        .map_err(|e| AppError::Database(format!("pre-delete: {e}")))?;

    let parsed = parse_xml_file(path).map_err(AppError::Parse)?;
    let h = &parsed.header;
    let game_version = format_game_version(&h.game_version);

    // has_any_laps : au moins un pilote, toute session, a un tour.
    let has_any_laps = parsed
        .sessions
        .iter()
        .any(|s| s.drivers.iter().any(|d| !d.laps.is_empty()));

    let now = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    tx.execute(
        "INSERT INTO xml_index
            (filename, file_path, mtime, timestamp, time_string, track, track_course,
             track_event, setting, game_version, race_laps, race_time, track_length,
             mech_fail_rate, damage_mult, fuel_mult, tire_mult, vehicles_allowed,
             has_any_laps, event_id, indexed_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21)",
        params![
            filename,
            path.to_string_lossy(),
            mtime,
            h.timestamp,
            h.time_string,
            h.track_venue,
            h.track_course,
            h.track_event,
            h.setting,
            game_version,
            h.race_laps,
            h.race_time,
            h.track_length,
            h.mech_fail_rate,
            h.damage_mult,
            h.fuel_mult,
            h.tire_mult,
            h.vehicles_allowed,
            has_any_laps as i32,
            h.timestamp, // event_id provisoire = timestamp, recalculé ensuite
            now,
        ],
    )
    .map_err(|e| AppError::Database(format!("insert xml_index: {e}")))?;
    let xml_id = tx.last_insert_rowid();

    let mut sessions_created = 0usize;
    for session in &parsed.sessions {
        tx.execute(
            "INSERT INTO sessions
                (xml_id, session_type, event_id, timestamp, track, track_course,
                 setting, game_version, participants, session_laps, session_minutes)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![
                xml_id,
                session.session_type,
                h.timestamp,
                session.timestamp,
                session.track,
                session.track_course,
                session.setting,
                game_version,
                session.drivers.len() as i32,
                session.session_laps,
                session.session_minutes,
            ],
        )
        .map_err(|e| AppError::Database(format!("insert session: {e}")))?;
        let session_id = tx.last_insert_rowid();
        sessions_created += 1;

        for driver in &session.drivers {
            insert_driver(tx, session_id, &session.session_type, driver, player_name)?;
        }

        for ev in &session.stream_events {
            tx.execute(
                "INSERT INTO stream_events (session_id, event_type, et, text)
                 VALUES (?1,?2,?3,?4)",
                params![session_id, ev.event_type, ev.et, ev.text],
            )
            .map_err(|e| AppError::Database(format!("insert stream: {e}")))?;
        }
    }

    Ok(sessions_created)
}

/// Calcule les agrégats d'un pilote et insère `results` + ses `laps`.
fn insert_driver(
    tx: &Connection,
    session_id: i64,
    session_type: &str,
    d: &ParsedDriver,
    player_name: &str,
) -> Result<(), AppError> {
    let agg = compute_aggregates(d, session_type);
    let car_class = normalize_car_class(&d.car_class, &d.category);
    let unique_car_name = compute_unique_car_name(&d.car_type, &d.category);
    // Le joueur est identifié STRICTEMENT par son nom (règle V1 `indexer.php` :
    // `Name === PLAYER_NAME`). Le flag XML `isPlayer` n'est PAS fiable (il marque
    // de nombreux pilotes en multijoueur) — on ne l'utilise jamais.
    let is_player = !player_name.is_empty() && d.name == player_name;

    tx.execute(
        "INSERT INTO results
            (session_id, driver_name, is_player, veh_file, veh_name, category,
             car_type, car_class, unique_car_name, car_number, team_name, control_aids,
             position, class_position, grid_pos, class_grid_pos, laps_count, laps_led,
             finish_time, finish_status, pitstops,
             best_lap, best_lap_s1, best_lap_s2, best_lap_s3,
             abs_best_s1, abs_best_s2, abs_best_s3, optimal_lap, vmax, progression,
             total_laps_valid, total_lap_time, start_fuel, finish_fuel,
             median_lap, std_dev, avg_best_5)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,
                 ?21,?22,?23,?24,?25,?26,?27,?28,?29,?30,?31,?32,?33,?34,?35,?36,?37,?38)",
        params![
            session_id,
            d.name,
            is_player as i32,
            d.veh_file,
            d.veh_name,
            d.category,
            d.car_type,
            car_class,
            unique_car_name,
            d.car_number,
            d.team_name,
            d.control_aids,
            d.position,
            d.class_position,
            d.grid_pos,
            d.class_grid_pos,
            d.total_laps,
            agg.laps_led,
            if d.finish_time > 0.0 { Some(d.finish_time) } else { None },
            d.finish_status,
            d.pitstops,
            agg.best_lap,
            agg.best_lap_s1,
            agg.best_lap_s2,
            agg.best_lap_s3,
            agg.abs_best_s1,
            agg.abs_best_s2,
            agg.abs_best_s3,
            agg.optimal_lap,
            agg.vmax,
            agg.progression,
            agg.total_laps_valid,
            agg.total_lap_time,
            agg.start_fuel,
            agg.finish_fuel,
            agg.median_lap,
            agg.std_dev,
            agg.avg_best_5,
        ],
    )
    .map_err(|e| AppError::Database(format!("insert result: {e}")))?;
    let result_id = tx.last_insert_rowid();

    for lap in &d.laps {
        tx.execute(
            "INSERT INTO laps
                (result_id, session_id, driver_name, lap_num, position, lap_time,
                 s1, s2, s3, top_speed, fuel, fuel_used, twfl, twfr, twrl, twrr,
                 fcompound, rcompound, is_pit, is_valid)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)",
            params![
                result_id,
                session_id,
                d.name,
                lap.lap_num,
                lap.position,
                if lap.lap_time > 0.0 { Some(lap.lap_time) } else { None },
                lap.s1,
                lap.s2,
                lap.s3,
                if lap.top_speed > 0.0 { Some(lap.top_speed) } else { None },
                lap.fuel,
                lap.fuel_used,
                lap.twfl,
                lap.twfr,
                lap.twrl,
                lap.twrr,
                lap.fcompound,
                lap.rcompound,
                lap.is_pit as i32,
                lap.is_valid as i32,
            ],
        )
        .map_err(|e| AppError::Database(format!("insert lap: {e}")))?;
    }

    Ok(())
}

/// Agrégats d'un pilote — règles V1 (`indexer.php` + `process_session_data`).
struct Aggregates {
    best_lap: Option<f64>,
    best_lap_s1: Option<f64>,
    best_lap_s2: Option<f64>,
    best_lap_s3: Option<f64>,
    abs_best_s1: Option<f64>,
    abs_best_s2: Option<f64>,
    abs_best_s3: Option<f64>,
    optimal_lap: Option<f64>,
    vmax: Option<f64>,
    progression: Option<i32>,
    total_laps_valid: i32,
    total_lap_time: f64,
    laps_led: i32,
    start_fuel: Option<f64>,
    finish_fuel: Option<f64>,
    median_lap: Option<f64>,
    std_dev: Option<f64>,
    avg_best_5: Option<f64>,
}

fn compute_aggregates(d: &ParsedDriver, session_type: &str) -> Aggregates {
    let mut best_lap: Option<f64> = None;
    let (mut bl_s1, mut bl_s2, mut bl_s3) = (None, None, None);
    let (mut abs_s1, mut abs_s2, mut abs_s3): (Option<f64>, Option<f64>, Option<f64>) =
        (None, None, None);
    let mut vmax: Option<f64> = None;
    let mut total_laps_valid = 0i32;
    let mut total_lap_time = 0.0f64;
    let mut laps_led = 0i32;
    let mut start_fuel: Option<f64> = None;
    let mut finish_fuel: Option<f64> = None;
    let mut valid_times: Vec<f64> = Vec::new();

    for lap in &d.laps {
        if lap.position == 1 {
            laps_led += 1;
        }

        // Meilleur tour : 4 chronos valides (temps + 3 secteurs > 0).
        if lap.lap_time > 0.0 && lap.s1.is_some() && lap.s2.is_some() && lap.s3.is_some() {
            total_laps_valid += 1;
            total_lap_time += lap.lap_time;
            if best_lap.map_or(true, |b| lap.lap_time < b) {
                best_lap = Some(lap.lap_time);
                bl_s1 = lap.s1;
                bl_s2 = lap.s2;
                bl_s3 = lap.s3;
            }
        }

        // Meilleurs secteurs absolus.
        if let Some(s) = lap.s1 {
            if abs_s1.map_or(true, |a| s < a) {
                abs_s1 = Some(s);
            }
        }
        if let Some(s) = lap.s2 {
            if abs_s2.map_or(true, |a| s < a) {
                abs_s2 = Some(s);
            }
        }
        if let Some(s) = lap.s3 {
            if abs_s3.map_or(true, |a| s < a) {
                abs_s3 = Some(s);
            }
        }

        if lap.top_speed > 0.0 && vmax.map_or(true, |v| lap.top_speed > v) {
            vmax = Some(lap.top_speed);
        }

        // Carburant départ / arrivée (V1 : bloc dans `if lapTime > 0`).
        if lap.lap_time > 0.0 {
            if start_fuel.is_none() {
                if let (Some(f), Some(fu)) = (lap.fuel, lap.fuel_used) {
                    start_fuel = Some((f + fu) * 100.0);
                }
            }
            if let Some(f) = lap.fuel {
                finish_fuel = Some(f * 100.0);
            }
            valid_times.push(lap.lap_time);
        }
    }

    let optimal_lap = compute_optimal_lap(abs_s1, abs_s2, abs_s3);

    let progression = if session_type == "Race"
        && d.class_grid_pos > 0
        && d.finish_status == "Finished Normally"
    {
        Some(d.class_grid_pos - d.class_position)
    } else {
        None
    };

    // Statistiques comparateur (sur les tours avec temps > 0, triés croissant).
    valid_times.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = valid_times.len();
    let median_lap = if n > 0 {
        let mid = (n - 1) / 2;
        Some(if n % 2 == 1 {
            valid_times[mid]
        } else {
            (valid_times[mid] + valid_times[mid + 1]) / 2.0
        })
    } else {
        None
    };
    // Écart-type de régularité : variance de POPULATION (÷ n), volontaire — on
    // dispose de TOUS les tours de la session, pas d'un échantillon ; ce n'est donc
    // pas un estimateur sample (÷ n−1). Cohérent avec la V1 et stocké tel quel.
    let std_dev = if n > 1 {
        let mean = valid_times.iter().sum::<f64>() / n as f64;
        let variance =
            valid_times.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n as f64;
        Some(variance.sqrt())
    } else {
        None
    };
    let avg_best_5 = if n > 0 {
        let k = n.min(5);
        Some(valid_times[..k].iter().sum::<f64>() / k as f64)
    } else {
        None
    };

    Aggregates {
        best_lap,
        best_lap_s1: bl_s1,
        best_lap_s2: bl_s2,
        best_lap_s3: bl_s3,
        abs_best_s1: abs_s1,
        abs_best_s2: abs_s2,
        abs_best_s3: abs_s3,
        optimal_lap,
        vmax,
        progression,
        total_laps_valid,
        total_lap_time,
        laps_led,
        start_fuel,
        finish_fuel,
        median_lap,
        std_dev,
        avg_best_5,
    }
}

/// Recalcule les `event_id` (`compute_event_groups` V1, seuil 7200 s).
fn recompute_event_ids(tx: &Connection) -> Result<(), AppError> {
    let rows: Vec<(i64, i64, String, String)> = {
        let mut stmt = tx
            .prepare(
                "SELECT id, timestamp, track, setting FROM xml_index ORDER BY timestamp ASC",
            )
            .map_err(|e| AppError::Database(format!("event groups read: {e}")))?;
        let mapped = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                ))
            })
            .map_err(|e| AppError::Database(format!("event groups map: {e}")))?;
        mapped.flatten().collect()
    };

    const THRESHOLD: i64 = 7200;
    let mut group_first_ts: i64 = 0;
    let mut group_track = String::new();
    let mut current_event_id: i64 = 0;

    for (id, timestamp, track, setting) in rows {
        let is_multiplayer = setting == "Multiplayer";
        let can_join = current_event_id != 0
            && track == group_track
            && ((is_multiplayer && (timestamp - group_first_ts).abs() < THRESHOLD)
                || timestamp == group_first_ts);

        let event_id = if can_join {
            current_event_id
        } else {
            current_event_id = timestamp;
            group_first_ts = timestamp;
            group_track = track.clone();
            timestamp
        };

        tx.execute(
            "UPDATE xml_index SET event_id = ?1 WHERE id = ?2",
            params![event_id, id],
        )
        .map_err(|e| AppError::Database(format!("update xml event_id: {e}")))?;
        tx.execute(
            "UPDATE sessions SET event_id = ?1 WHERE xml_id = ?2",
            params![event_id, id],
        )
        .map_err(|e| AppError::Database(format!("update session event_id: {e}")))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Smoke-test : indexe les vrais fichiers XML du jeu installé.
    /// `cargo test smoke_index_real_data -- --nocapture`
    #[test]
    fn smoke_index_real_data() {
        let dir = Path::new(
            r"D:\SteamLibrary\steamapps\common\Le Mans Ultimate\UserData\Log\Results",
        );
        if !dir.is_dir() {
            eprintln!("[skip] dossier Results introuvable : {}", dir.display());
            return;
        }
        // Détermine le joueur = nom de pilote le plus fréquent (règle V1).
        let mut counts: std::collections::HashMap<String, usize> =
            std::collections::HashMap::new();
        for entry in std::fs::read_dir(dir).unwrap().flatten() {
            let p = entry.path();
            if p.extension().map(|e| e == "xml").unwrap_or(false) {
                if let Ok(parsed) = parse_xml_file(&p) {
                    for s in &parsed.sessions {
                        for d in &s.drivers {
                            if !d.name.is_empty() {
                                *counts.entry(d.name.clone()).or_insert(0) += 1;
                            }
                        }
                    }
                }
            }
        }
        let player = counts
            .into_iter()
            .max_by_key(|(_, c)| *c)
            .map(|(n, _)| n)
            .unwrap_or_default();
        println!("joueur détecté : {player:?}");

        let mut conn = crate::db::open_test_db();
        let report = sync_results(&mut conn, dir, &player).expect("sync_results");
        println!(
            "scannés={} ajoutés={} maj={} sessions={} erreurs={}",
            report.files_scanned,
            report.added,
            report.updated,
            report.sessions_created,
            report.errors.len()
        );
        for e in report.errors.iter().take(8) {
            println!("  ERREUR: {e}");
        }

        let n_sessions: i64 = conn
            .query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0))
            .unwrap();
        let n_results: i64 = conn
            .query_row("SELECT COUNT(*) FROM results", [], |r| r.get(0))
            .unwrap();
        let n_player: i64 = conn
            .query_row("SELECT COUNT(*) FROM results WHERE is_player=1", [], |r| r.get(0))
            .unwrap();
        let n_laps: i64 = conn
            .query_row("SELECT COUNT(*) FROM laps", [], |r| r.get(0))
            .unwrap();
        let n_best: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM results WHERE is_player=1 AND best_lap IS NOT NULL",
                [],
                |r| r.get(0),
            )
            .unwrap();
        println!(
            "DB : sessions={n_sessions} results={n_results} player_results={n_player} \
             laps={n_laps} player_best_laps={n_best}"
        );

        // Quelques meilleurs tours du joueur.
        let mut stmt = conn
            .prepare(
                "SELECT s.track, r.car_class, r.unique_car_name, r.best_lap, r.optimal_lap, r.vmax
                 FROM results r JOIN sessions s ON s.id=r.session_id
                 WHERE r.is_player=1 AND r.best_lap IS NOT NULL
                 ORDER BY r.best_lap ASC LIMIT 8",
            )
            .unwrap();
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, f64>(3)?,
                    r.get::<_, Option<f64>>(4)?,
                    r.get::<_, Option<f64>>(5)?,
                ))
            })
            .unwrap();
        for row in rows.flatten() {
            println!(
                "  {} | {} | {} | best={:.3} optimal={:?} vmax={:?}",
                row.0, row.1, row.2, row.3, row.4, row.5
            );
        }

        assert!(report.files_scanned > 0, "aucun fichier scanné");
        assert!(report.errors.is_empty(), "des fichiers ont échoué au parsing");
        // Le joueur ne peut apparaître qu'une fois par session.
        assert!(n_player > 0, "aucune session joueur détectée");
        assert!(
            n_player <= n_sessions,
            "trop de lignes joueur ({n_player}) — l'identification par nom a échoué"
        );
    }
}
