//! Coach par virage — persistance des références denses v2 et des stats de
//! dispersion par virage (cf. COACH-LIVE-SPEC.md §3 et §7).
//!
//! Les canaux d'une référence transitent par l'IPC en `Vec<f32>` à plat
//! (8 canaux × n_points concaténés) et sont stockés en BLOB Float32
//! little-endian. Chargement une fois par changement de combo : le volume
//! (~110 Ko au Mans) est sans enjeu.

use crate::db::{self, DbState};
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Nombre de canaux d'une référence (ordre fixe, documenté dans db.rs).
pub const REF_CHANNELS: usize = 8;
/// Nombre de références conservées par combo (les plus récentes).
const KEEP_REFS_PER_COMBO: i64 = 3;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoachCornerRow {
    pub corner_uid: String,
    pub n: i32,
    pub entry_dist: f64,
    pub brake_dist: f64,
    pub apex_dist: f64,
    pub exit_dist: f64,
    pub vmin: f64,
    pub ventry: f64,
    pub vexit: f64,
    pub full_throttle_dist: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoachRef {
    pub id: i64,
    pub track: String,
    pub car_model: String,
    pub car_class: String,
    pub kind: String,
    pub created_at: i64,
    pub game_build: String,
    pub lap_time: f64,
    pub step_m: f64,
    pub n_points: i64,
    /// Métadonnées JSON libres (températures, météo, compound, fuel, maps…).
    pub meta_json: String,
    /// 8 canaux × n_points, à plat (time,speed,brake,throttle,steer,gLat,gLong,gear).
    pub channels: Vec<f32>,
    pub corners: Vec<CoachCornerRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoachRefSavePayload {
    pub track: String,
    pub car_model: String,
    pub car_class: String,
    pub kind: String,
    pub game_build: String,
    pub lap_time: f64,
    pub step_m: f64,
    pub n_points: i64,
    pub meta_json: String,
    pub channels: Vec<f32>,
    pub corners: Vec<CoachCornerRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoachCornerStats {
    pub corner_uid: String,
    pub sigma_brake: f64,
    pub sigma_vmin: f64,
    pub sigma_dt: f64,
    pub n_samples: i64,
}

/// Résumé d'un virage sur une session (boucle d'apprentissage §11, P4.1).
/// Écrit au débrief ; `session_at` est renseigné côté backend (horloge mur), commun
/// à toutes les lignes d'un même appel `coach_history_upsert`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CornerHistoryRow {
    pub corner_uid: String,
    pub n: i32,
    #[serde(default)]
    pub session_at: i64,
    pub passes: i64,
    pub median_dt: f64,
    pub iqr_dt: f64,
    pub success_rate: f64,
    pub best_dt: f64,
}

/// Nombre de sessions conservées par combo dans `corner_history` (tendance §11).
const KEEP_SESSIONS_PER_COMBO: i64 = 30;

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn channels_to_blob(channels: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(channels.len() * 4);
    for v in channels {
        out.extend_from_slice(&v.to_le_bytes());
    }
    out
}

fn blob_to_channels(blob: &[u8]) -> Vec<f32> {
    blob.chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

/// Enregistre une référence dense pour un combo et purge au-delà de
/// `KEEP_REFS_PER_COMBO` (les plus anciennes ; cascade sur coach_corner).
/// Renvoie l'id de la référence créée.
#[tauri::command]
pub fn coach_ref_save(
    payload: CoachRefSavePayload,
    db: State<'_, DbState>,
) -> Result<i64, AppError> {
    if payload.channels.len() as i64 != payload.n_points * REF_CHANNELS as i64 {
        return Err(AppError::Internal(format!(
            "coach_ref_save: {} valeurs pour {} points × {} canaux",
            payload.channels.len(),
            payload.n_points,
            REF_CHANNELS
        )));
    }
    let mut conn = db::get_conn(&db)?;
    let tx = conn
        .transaction()
        .map_err(|e| AppError::Database(format!("coach_ref tx: {e}")))?;

    tx.execute(
        "INSERT INTO coach_ref (track, car_model, car_class, kind, created_at,
                                game_build, lap_time, step_m, n_points, meta_json, channels)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![
            payload.track,
            payload.car_model,
            payload.car_class,
            payload.kind,
            now_secs(),
            payload.game_build,
            payload.lap_time,
            payload.step_m,
            payload.n_points,
            payload.meta_json,
            channels_to_blob(&payload.channels),
        ],
    )
    .map_err(|e| AppError::Database(format!("coach_ref insert: {e}")))?;
    let ref_id = tx.last_insert_rowid();

    for c in &payload.corners {
        tx.execute(
            "INSERT INTO coach_corner (ref_id, corner_uid, n, entry_dist, brake_dist,
                                       apex_dist, exit_dist, vmin, ventry, vexit,
                                       full_throttle_dist)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                ref_id,
                c.corner_uid,
                c.n,
                c.entry_dist,
                c.brake_dist,
                c.apex_dist,
                c.exit_dist,
                c.vmin,
                c.ventry,
                c.vexit,
                c.full_throttle_dist,
            ],
        )
        .map_err(|e| AppError::Database(format!("coach_corner insert: {e}")))?;
    }

    // Purge : garde les KEEP_REFS_PER_COMBO plus récentes du combo.
    tx.execute(
        "DELETE FROM coach_ref
         WHERE track = ?1 AND car_model = ?2
           AND id NOT IN (SELECT id FROM coach_ref
                          WHERE track = ?1 AND car_model = ?2
                          ORDER BY created_at DESC, id DESC LIMIT ?3)",
        rusqlite::params![payload.track, payload.car_model, KEEP_REFS_PER_COMBO],
    )
    .map_err(|e| AppError::Database(format!("coach_ref prune: {e}")))?;

    tx.commit()
        .map_err(|e| AppError::Database(format!("coach_ref commit: {e}")))?;
    Ok(ref_id)
}

/// Charge la meilleure référence utilisable d'un combo : le tour `best`/`ghost`
/// le plus rapide, à défaut la plus récente `stale`. `None` si aucune.
#[tauri::command]
pub fn coach_ref_load(
    track: String,
    car_model: String,
    db: State<'_, DbState>,
) -> Result<Option<CoachRef>, AppError> {
    let conn = db::get_conn(&db)?;
    let row = conn
        .query_row(
            "SELECT id, track, car_model, car_class, kind, created_at, game_build,
                    lap_time, step_m, n_points, meta_json, channels
             FROM coach_ref
             WHERE track = ?1 AND car_model = ?2
             ORDER BY CASE kind WHEN 'stale' THEN 1 ELSE 0 END, lap_time ASC
             LIMIT 1",
            rusqlite::params![track, car_model],
            |r| {
                Ok(CoachRef {
                    id: r.get(0)?,
                    track: r.get(1)?,
                    car_model: r.get(2)?,
                    car_class: r.get(3)?,
                    kind: r.get(4)?,
                    created_at: r.get(5)?,
                    game_build: r.get(6)?,
                    lap_time: r.get(7)?,
                    step_m: r.get(8)?,
                    n_points: r.get(9)?,
                    meta_json: r.get(10)?,
                    channels: blob_to_channels(&r.get::<_, Vec<u8>>(11)?),
                    corners: Vec::new(),
                })
            },
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(AppError::Database(format!("coach_ref load: {other}"))),
        })?;

    let Some(mut re) = row else { return Ok(None) };

    let mut stmt = conn
        .prepare(
            "SELECT corner_uid, n, entry_dist, brake_dist, apex_dist, exit_dist,
                    vmin, ventry, vexit, full_throttle_dist
             FROM coach_corner WHERE ref_id = ?1 ORDER BY n ASC",
        )
        .map_err(|e| AppError::Database(format!("coach_corner prepare: {e}")))?;
    let corners = stmt
        .query_map([re.id], |r| {
            Ok(CoachCornerRow {
                corner_uid: r.get(0)?,
                n: r.get(1)?,
                entry_dist: r.get(2)?,
                brake_dist: r.get(3)?,
                apex_dist: r.get(4)?,
                exit_dist: r.get(5)?,
                vmin: r.get(6)?,
                ventry: r.get(7)?,
                vexit: r.get(8)?,
                full_throttle_dist: r.get(9)?,
            })
        })
        .map_err(|e| AppError::Database(format!("coach_corner query: {e}")))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::Database(format!("coach_corner rows: {e}")))?;
    re.corners = corners;
    Ok(Some(re))
}

/// Marque périmées (`stale`) les références d'un combo dont le build diffère.
/// Renvoie le nombre de références rétrogradées.
#[tauri::command]
pub fn coach_ref_mark_stale(
    track: String,
    car_model: String,
    current_build: String,
    db: State<'_, DbState>,
) -> Result<usize, AppError> {
    let conn = db::get_conn(&db)?;
    conn.execute(
        "UPDATE coach_ref SET kind = 'stale'
         WHERE track = ?1 AND car_model = ?2
           AND kind != 'stale' AND game_build != '' AND game_build != ?3",
        rusqlite::params![track, car_model, current_build],
    )
    .map_err(|e| AppError::Database(format!("coach_ref stale: {e}")))
}

/// Stats de dispersion par virage d'un combo (seuils adaptatifs 2σ).
#[tauri::command]
pub fn coach_stats_for_combo(
    track: String,
    car_model: String,
    db: State<'_, DbState>,
) -> Result<Vec<CoachCornerStats>, AppError> {
    let conn = db::get_conn(&db)?;
    let mut stmt = conn
        .prepare(
            "SELECT corner_uid, sigma_brake, sigma_vmin, sigma_dt, n_samples
             FROM coach_stats WHERE track = ?1 AND car_model = ?2",
        )
        .map_err(|e| AppError::Database(format!("coach_stats prepare: {e}")))?;
    let rows = stmt
        .query_map(rusqlite::params![track, car_model], |r| {
            Ok(CoachCornerStats {
                corner_uid: r.get(0)?,
                sigma_brake: r.get(1)?,
                sigma_vmin: r.get(2)?,
                sigma_dt: r.get(3)?,
                n_samples: r.get(4)?,
            })
        })
        .map_err(|e| AppError::Database(format!("coach_stats query: {e}")))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::Database(format!("coach_stats rows: {e}")))?;
    Ok(rows)
}

/// Écrit le résumé d'une session (une ligne par virage travaillé) dans
/// `corner_history` (§11, P4.1) et purge au-delà de `KEEP_SESSIONS_PER_COMBO`
/// sessions du combo (les plus anciennes). Toutes les lignes du batch partagent le
/// même `session_at` (horloge mur, ici) → un débrief = une session.
#[tauri::command]
pub fn coach_history_upsert(
    track: String,
    car_model: String,
    rows: Vec<CornerHistoryRow>,
    db: State<'_, DbState>,
) -> Result<(), AppError> {
    if rows.is_empty() {
        return Ok(());
    }
    let mut conn = db::get_conn(&db)?;
    let tx = conn
        .transaction()
        .map_err(|e| AppError::Database(format!("corner_history tx: {e}")))?;
    let now = now_secs();
    for r in &rows {
        tx.execute(
            "INSERT INTO corner_history (track, car_model, corner_uid, n, session_at,
                                         passes, median_dt, iqr_dt, success_rate, best_dt)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                track,
                car_model,
                r.corner_uid,
                r.n,
                now,
                r.passes,
                r.median_dt,
                r.iqr_dt,
                r.success_rate,
                r.best_dt,
            ],
        )
        .map_err(|e| AppError::Database(format!("corner_history insert: {e}")))?;
    }

    // Purge : garde les KEEP_SESSIONS_PER_COMBO sessions (session_at distincts) les
    // plus récentes du combo.
    tx.execute(
        "DELETE FROM corner_history
         WHERE track = ?1 AND car_model = ?2
           AND session_at NOT IN (
             SELECT session_at FROM corner_history
             WHERE track = ?1 AND car_model = ?2
             GROUP BY session_at
             ORDER BY session_at DESC LIMIT ?3
           )",
        rusqlite::params![track, car_model, KEEP_SESSIONS_PER_COMBO],
    )
    .map_err(|e| AppError::Database(format!("corner_history prune: {e}")))?;

    tx.commit()
        .map_err(|e| AppError::Database(format!("corner_history commit: {e}")))?;
    Ok(())
}

/// Historique par virage d'un combo (§11, P4.1), trié chronologiquement
/// (`session_at` croissant) pour le calcul de tendance côté front.
#[tauri::command]
pub fn coach_history_load(
    track: String,
    car_model: String,
    db: State<'_, DbState>,
) -> Result<Vec<CornerHistoryRow>, AppError> {
    let conn = db::get_conn(&db)?;
    let mut stmt = conn
        .prepare(
            "SELECT corner_uid, n, session_at, passes, median_dt, iqr_dt,
                    success_rate, best_dt
             FROM corner_history
             WHERE track = ?1 AND car_model = ?2
             ORDER BY session_at ASC, n ASC",
        )
        .map_err(|e| AppError::Database(format!("corner_history prepare: {e}")))?;
    let rows = stmt
        .query_map(rusqlite::params![track, car_model], |r| {
            Ok(CornerHistoryRow {
                corner_uid: r.get(0)?,
                n: r.get(1)?,
                session_at: r.get(2)?,
                passes: r.get(3)?,
                median_dt: r.get(4)?,
                iqr_dt: r.get(5)?,
                success_rate: r.get(6)?,
                best_dt: r.get(7)?,
            })
        })
        .map_err(|e| AppError::Database(format!("corner_history query: {e}")))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::Database(format!("corner_history rows: {e}")))?;
    Ok(rows)
}

/// Upsert des stats de dispersion (le moteur envoie les σ mis à jour en EWMA).
#[tauri::command]
pub fn coach_stats_upsert(
    track: String,
    car_model: String,
    stats: Vec<CoachCornerStats>,
    db: State<'_, DbState>,
) -> Result<(), AppError> {
    let mut conn = db::get_conn(&db)?;
    let tx = conn
        .transaction()
        .map_err(|e| AppError::Database(format!("coach_stats tx: {e}")))?;
    let now = now_secs();
    for s in &stats {
        tx.execute(
            "INSERT INTO coach_stats (track, car_model, corner_uid, sigma_brake,
                                      sigma_vmin, sigma_dt, n_samples, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(track, car_model, corner_uid) DO UPDATE SET
               sigma_brake = excluded.sigma_brake,
               sigma_vmin  = excluded.sigma_vmin,
               sigma_dt    = excluded.sigma_dt,
               n_samples   = excluded.n_samples,
               updated_at  = excluded.updated_at",
            rusqlite::params![
                track,
                car_model,
                s.corner_uid,
                s.sigma_brake,
                s.sigma_vmin,
                s.sigma_dt,
                s.n_samples,
                now,
            ],
        )
        .map_err(|e| AppError::Database(format!("coach_stats upsert: {e}")))?;
    }
    tx.commit()
        .map_err(|e| AppError::Database(format!("coach_stats commit: {e}")))?;
    Ok(())
}
