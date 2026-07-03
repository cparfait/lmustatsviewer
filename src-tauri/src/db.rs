//! Couche d'accès SQLite — connexion et schéma.
//!
//! Schéma calqué sur la V1 (PHP) mais mono-profil et étendu pour stocker
//! TOUS les pilotes de chaque session (la V1 ne stockait que le joueur et
//! re-parsait le XML pour les détails de course). Les agrégats par pilote
//! (best_lap, secteurs, optimal, vmax, progression…) sont pré-calculés à
//! l'indexation, exactement selon les règles de `indexer.php` de la V1.

use std::sync::{Mutex, MutexGuard};

use rusqlite::{params, Connection, OptionalExtension};
use tauri::Manager;

use crate::error::AppError;

pub struct DbState {
    conn: Mutex<Connection>,
}

/// Schéma complet — base créée from scratch (V3 ne migre pas d'ancienne base).
const SCHEMA: &str = "
-- Configuration applicative (mono-profil) : player_name, lmu_path,
-- results_dir, language, theme, timezone, default_since_version,
-- ohne_speed_enabled, etc.
CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Une ligne par fichier XML indexé (métadonnées d'événement).
CREATE TABLE IF NOT EXISTS xml_index (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    filename         TEXT    UNIQUE NOT NULL,
    file_path        TEXT    NOT NULL,
    mtime            INTEGER NOT NULL,
    timestamp        INTEGER NOT NULL DEFAULT 0,
    time_string      TEXT    NOT NULL DEFAULT '',
    track            TEXT    NOT NULL DEFAULT '',
    track_course     TEXT    NOT NULL DEFAULT '',
    track_event      TEXT    NOT NULL DEFAULT '',
    setting          TEXT    NOT NULL DEFAULT '',
    game_version     TEXT    NOT NULL DEFAULT '',
    race_laps        INTEGER NOT NULL DEFAULT 0,
    race_time        REAL    NOT NULL DEFAULT 0,
    track_length     REAL    NOT NULL DEFAULT 0,
    mech_fail_rate   INTEGER NOT NULL DEFAULT 0,
    damage_mult      INTEGER NOT NULL DEFAULT 0,
    fuel_mult        REAL    NOT NULL DEFAULT 0,
    tire_mult        REAL    NOT NULL DEFAULT 0,
    vehicles_allowed TEXT    NOT NULL DEFAULT '',
    has_any_laps     INTEGER NOT NULL DEFAULT 0,
    event_id         INTEGER NOT NULL DEFAULT 0,
    indexed_at       INTEGER NOT NULL DEFAULT 0
);

-- Une ligne par session (Practice1 / Qualify / Race) d'un fichier XML.
CREATE TABLE IF NOT EXISTS sessions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    xml_id           INTEGER NOT NULL REFERENCES xml_index(id) ON DELETE CASCADE,
    session_type     TEXT    NOT NULL,             -- Practice1 | Qualify | Race
    event_id         INTEGER NOT NULL DEFAULT 0,
    timestamp        INTEGER NOT NULL DEFAULT 0,
    track            TEXT    NOT NULL DEFAULT '',
    track_course     TEXT    NOT NULL DEFAULT '',
    setting          TEXT    NOT NULL DEFAULT '',
    game_version     TEXT    NOT NULL DEFAULT '',
    participants     INTEGER NOT NULL DEFAULT 0,
    session_laps     INTEGER NOT NULL DEFAULT 0,   -- <Laps> de la session
    session_minutes  INTEGER NOT NULL DEFAULT 0    -- <Minutes> de la session
);

-- Une ligne par pilote par session (TOUS les pilotes, pas seulement le joueur).
-- Les agrégats sont pré-calculés à l'indexation (règles V1 indexer.php).
CREATE TABLE IF NOT EXISTS results (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id       INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    driver_name      TEXT    NOT NULL,
    driver_id        INTEGER NOT NULL DEFAULT 0,
    is_player        INTEGER NOT NULL DEFAULT 0,
    veh_file         TEXT    NOT NULL DEFAULT '',
    veh_name         TEXT    NOT NULL DEFAULT '',   -- livrée
    category         TEXT    NOT NULL DEFAULT '',
    car_type         TEXT    NOT NULL DEFAULT '',
    car_class        TEXT    NOT NULL DEFAULT '',   -- normalisée (Hyper, LMP2 ELMS…)
    unique_car_name  TEXT    NOT NULL DEFAULT '',   -- ex. 'Peugeot 9x8 (2024/25)'
    car_number       INTEGER NOT NULL DEFAULT 0,
    team_name        TEXT    NOT NULL DEFAULT '',
    control_aids     TEXT    NOT NULL DEFAULT '',
    position         INTEGER NOT NULL DEFAULT 0,
    class_position   INTEGER NOT NULL DEFAULT 0,
    grid_pos         INTEGER NOT NULL DEFAULT 0,
    class_grid_pos   INTEGER NOT NULL DEFAULT 0,
    laps_count       INTEGER NOT NULL DEFAULT 0,
    laps_led         INTEGER NOT NULL DEFAULT 0,
    finish_time      REAL,
    finish_status    TEXT    NOT NULL DEFAULT '',
    pitstops         INTEGER NOT NULL DEFAULT 0,
    -- Meilleur tour complet (s1+s2+s3 tous > 0)
    best_lap         REAL,
    best_lap_s1      REAL,
    best_lap_s2      REAL,
    best_lap_s3      REAL,
    -- Meilleurs secteurs absolus (tous tours confondus)
    abs_best_s1      REAL,
    abs_best_s2      REAL,
    abs_best_s3      REAL,
    optimal_lap      REAL,
    vmax             REAL,
    progression      INTEGER,
    total_laps_valid INTEGER NOT NULL DEFAULT 0,
    total_lap_time   REAL    NOT NULL DEFAULT 0,
    -- Stratégie carburant
    start_fuel       REAL,
    finish_fuel      REAL,
    -- Statistiques comparateur de pilotes
    median_lap       REAL,
    std_dev          REAL,
    avg_best_5       REAL
);

-- Une ligne par tour par pilote.
CREATE TABLE IF NOT EXISTS laps (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id    INTEGER NOT NULL REFERENCES results(id) ON DELETE CASCADE,
    session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    driver_name  TEXT    NOT NULL,
    lap_num      INTEGER NOT NULL DEFAULT 0,
    position     INTEGER NOT NULL DEFAULT 0,   -- attribut 'p'
    lap_time     REAL,
    s1           REAL,
    s2           REAL,
    s3           REAL,
    top_speed    REAL,
    fuel         REAL,
    fuel_used    REAL,
    twfl         REAL,
    twfr         REAL,
    twrl         REAL,
    twrr         REAL,
    fcompound    TEXT    NOT NULL DEFAULT '',
    rcompound    TEXT    NOT NULL DEFAULT '',
    is_pit       INTEGER NOT NULL DEFAULT 0,
    is_valid     INTEGER NOT NULL DEFAULT 1
);

-- Événements de flux par session : chat, pénalités, incidents (détails de course).
CREATE TABLE IF NOT EXISTS stream_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    event_type   TEXT    NOT NULL,             -- ChatMessage | Penalty | Incident | Sector | Sent
    et           REAL    NOT NULL DEFAULT 0,
    text         TEXT    NOT NULL DEFAULT ''
);

-- Garage : configurations de voiture (.svm). Repris de la V2 (sans profile_id).
CREATE TABLE IF NOT EXISTS setups (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    car                 TEXT    NOT NULL,
    circuit             TEXT    NOT NULL,
    name                TEXT    NOT NULL,
    svm_path            TEXT    NOT NULL,
    content_json        TEXT,
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    setup_type          TEXT    NOT NULL DEFAULT 'Autres',
    -- Session de référence liée au setup (V1 `best_lap_session_id`).
    -- NULL si aucun tour lié. Pas de FK : le rescan d'index peut recréer les
    -- sessions avec de nouveaux id, on tolère donc des id obsolètes (la
    -- session est juste cachée côté front et l'utilisateur peut re-lier).
    linked_session_id   INTEGER,
    -- Origine du setup :
    --   'game' → trouvé sur disque (créé in-game ou importé manuellement).
    --           Lecture seule depuis V3 pour éviter de corrompre un fichier
    --           du jeu — l'utilisateur duplique d'abord s'il veut modifier.
    --   'app'  → créé via la modale « Nouveau setup » de V3. Éditable.
    source              TEXT    NOT NULL DEFAULT 'game'
);

-- Fichiers XML purgés volontairement par l'utilisateur (« purger sessions vides »).
-- La sync delta saute ces fichiers tant que leur `mtime` est inchangé : sans cela,
-- le scan filesystem les détecterait comme « nouveaux » et les réindexerait à
-- chaque démarrage. Si le fichier est modifié (mtime > purged.mtime), on le
-- réindexe quand même (le joueur a peut-être rejoué la session).
CREATE TABLE IF NOT EXISTS purged_files (
    filename   TEXT PRIMARY KEY,
    mtime      INTEGER NOT NULL,
    purged_at  INTEGER NOT NULL DEFAULT 0
);

-- Objectifs de coaching épinglés par le pilote (mémoire longitudinale du
-- Coach IA). Une note = un conseil/objectif retenu après une analyse, attaché
-- à un combo circuit/voiture. Réinjectée dans le contexte IA à la prochaine
-- session sur le même combo pour fermer la boucle conseil → pratique → vérif.
CREATE TABLE IF NOT EXISTS coach_notes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at   INTEGER NOT NULL DEFAULT 0,
    track        TEXT    NOT NULL,
    track_course TEXT    NOT NULL DEFAULT '',
    car          TEXT    NOT NULL DEFAULT '',   -- unique_car_name (clé combo)
    car_class    TEXT    NOT NULL DEFAULT '',
    note         TEXT    NOT NULL
);

-- Cache des temps de référence communautaires ohne_speed.
CREATE TABLE IF NOT EXISTS ohne_speed_cache (
    track      TEXT NOT NULL,
    layout     TEXT NOT NULL,
    class      TEXT NOT NULL,
    tier       TEXT NOT NULL,
    lap_time   REAL NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (track, layout, class, tier)
);

-- ── Coach par virage : références denses v2 (cf. COACH-LIVE-SPEC.md §3) ─────
-- Un tour de référence par combo circuit × voiture (clé par VOITURE, pas par
-- classe : une 499P et une 963 n'ont pas les mêmes freinages). Canaux
-- rééchantillonnés à pas constant (step_m, 4 m par défaut) et sérialisés en
-- BLOB Float32 little-endian : 8 canaux concaténés dans l'ordre
-- time,speed,brake,throttle,steer,g_lat,g_long,gear (n_points chacun).
-- kind : 'best' (tour du joueur), 'ghost' (importé), 'stale' (périmé —
-- lisible mais deltas relatifs uniquement).
CREATE TABLE IF NOT EXISTS coach_ref (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    track       TEXT    NOT NULL,
    car_model   TEXT    NOT NULL,
    car_class   TEXT    NOT NULL DEFAULT '',
    kind        TEXT    NOT NULL DEFAULT 'best',
    created_at  INTEGER NOT NULL DEFAULT 0,
    game_build  TEXT    NOT NULL DEFAULT '',
    lap_time    REAL    NOT NULL,
    step_m      REAL    NOT NULL DEFAULT 4.0,
    n_points    INTEGER NOT NULL,
    meta_json   TEXT    NOT NULL DEFAULT '{}',
    channels    BLOB    NOT NULL
);

-- Fenêtres de virage de la réf (bornes curvilignes + métriques cibles).
-- corner_uid = identité STABLE du virage, conservée entre re-détections par
-- appariement d'apex_dist (< 40 m) — la mémoire longitudinale s'indexe dessus.
CREATE TABLE IF NOT EXISTS coach_corner (
    ref_id             INTEGER NOT NULL REFERENCES coach_ref(id) ON DELETE CASCADE,
    corner_uid         TEXT    NOT NULL,
    n                  INTEGER NOT NULL,
    entry_dist         REAL    NOT NULL,
    brake_dist         REAL    NOT NULL,
    apex_dist          REAL    NOT NULL,
    exit_dist          REAL    NOT NULL,
    vmin               REAL    NOT NULL,
    ventry             REAL    NOT NULL,
    vexit              REAL    NOT NULL,
    full_throttle_dist REAL    NOT NULL,
    PRIMARY KEY (ref_id, corner_uid)
);

-- Dispersion du pilote par virage (seuils adaptatifs 2σ, EWMA sur tours
-- propres). Clé stable combo+virage, indépendante de ref_id.
CREATE TABLE IF NOT EXISTS coach_stats (
    track        TEXT    NOT NULL,
    car_model    TEXT    NOT NULL,
    corner_uid   TEXT    NOT NULL,
    sigma_brake  REAL    NOT NULL DEFAULT 0,
    sigma_vmin   REAL    NOT NULL DEFAULT 0,
    sigma_dt     REAL    NOT NULL DEFAULT 0,
    n_samples    INTEGER NOT NULL DEFAULT 0,
    updated_at   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (track, car_model, corner_uid)
);

-- Progression par virage inter-sessions (boucle d'apprentissage §11, P4.1). Une
-- ligne = résumé d'UN virage sur UNE session de roulage, écrit au débrief (retour
-- stand / fin de session). Sert la tendance (pente sur les N dernières sessions),
-- le taux de réussite et le rappel du chantier au prochain roulage sur le combo.
-- corner_uid = identité stable (comme coach_corner). session_at = horodatage
-- commun à toutes les lignes d'un même débrief (regroupe la session).
CREATE TABLE IF NOT EXISTS corner_history (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    track        TEXT    NOT NULL,
    car_model    TEXT    NOT NULL,
    corner_uid   TEXT    NOT NULL,
    n            INTEGER NOT NULL,
    session_at   INTEGER NOT NULL,          -- epoch s, commun aux lignes d'un débrief
    passes       INTEGER NOT NULL DEFAULT 0,-- passages propres mesurés (non muets)
    median_dt    REAL    NOT NULL DEFAULT 0,-- pace : Δt médian vs réf (s)
    iqr_dt       REAL    NOT NULL DEFAULT 0,-- constance : IQR des Δt (s)
    success_rate REAL    NOT NULL DEFAULT 0,-- % passages sous seuil [0,1]
    best_dt      REAL    NOT NULL DEFAULT 0 -- meilleur (min) Δt de la session (s)
);

CREATE INDEX IF NOT EXISTS idx_xi_filename    ON xml_index(filename);
CREATE INDEX IF NOT EXISTS idx_xi_event       ON xml_index(event_id);
CREATE INDEX IF NOT EXISTS idx_sessions_xml   ON sessions(xml_id);
CREATE INDEX IF NOT EXISTS idx_sessions_ts    ON sessions(timestamp);
CREATE INDEX IF NOT EXISTS idx_sessions_type  ON sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_results_sess   ON results(session_id);
CREATE INDEX IF NOT EXISTS idx_results_player ON results(is_player);
CREATE INDEX IF NOT EXISTS idx_results_track  ON results(car_class, unique_car_name);
CREATE INDEX IF NOT EXISTS idx_laps_result    ON laps(result_id);
CREATE INDEX IF NOT EXISTS idx_laps_session   ON laps(session_id);
CREATE INDEX IF NOT EXISTS idx_stream_session ON stream_events(session_id);
CREATE INDEX IF NOT EXISTS idx_coach_notes_combo ON coach_notes(track, car);
CREATE INDEX IF NOT EXISTS idx_coach_ref_combo   ON coach_ref(track, car_model);
CREATE INDEX IF NOT EXISTS idx_corner_hist_combo ON corner_history(track, car_model);
";

pub fn init_db(app_handle: &tauri::AppHandle) -> Result<DbState, AppError> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Internal(format!("app data dir: {e}")))?;

    std::fs::create_dir_all(&app_data_dir).map_err(AppError::Io)?;

    let db_path = app_data_dir.join("lmu_cache.db");
    let conn = Connection::open(&db_path)
        .map_err(|e| AppError::Database(format!("open {}: {e}", db_path.display())))?;

    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         PRAGMA foreign_keys=ON;
         PRAGMA cache_size=-8000;",
    )
    .map_err(|e| AppError::Database(format!("pragmas: {e}")))?;

    conn.execute_batch(SCHEMA)
        .map_err(|e| AppError::Database(format!("schema: {e}")))?;

    // Migrations légères : colonnes ajoutées après coup sur une base existante.
    // L'erreur « duplicate column » est ignorée si la colonne existe déjà.
    let _ = conn.execute(
        "ALTER TABLE setups ADD COLUMN setup_type TEXT NOT NULL DEFAULT 'Autres'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE setups ADD COLUMN linked_session_id INTEGER",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE setups ADD COLUMN source TEXT NOT NULL DEFAULT 'game'",
        [],
    );
    // Migration : création de la table `purged_files` si elle manque (base existante).
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS purged_files (
            filename   TEXT PRIMARY KEY,
            mtime      INTEGER NOT NULL,
            purged_at  INTEGER NOT NULL DEFAULT 0
        );",
    );

    Ok(DbState {
        conn: Mutex::new(conn),
    })
}

pub fn get_conn(db: &DbState) -> Result<MutexGuard<'_, Connection>, AppError> {
    db.conn
        .lock()
        .map_err(|e| AppError::Database(format!("lock: {e}")))
}

pub fn config_get(db: &DbState, key: &str) -> Result<Option<String>, AppError> {
    let conn = get_conn(db)?;
    let mut stmt = conn
        .prepare("SELECT value FROM config WHERE key = ?1")
        .map_err(|e| AppError::Database(format!("config_get prepare: {e}")))?;
    let result = stmt
        .query_row(params![key], |row| row.get(0))
        .optional()
        .map_err(|e| AppError::Database(format!("config_get query: {e}")))?;
    Ok(result)
}

pub fn config_set(db: &DbState, key: &str, value: &str) -> Result<(), AppError> {
    let conn = get_conn(db)?;
    conn.execute(
        "INSERT INTO config (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| AppError::Database(format!("config_set: {e}")))?;
    Ok(())
}

/// Connexion SQLite en mémoire avec le schéma — pour les tests uniquement.
#[cfg(test)]
pub fn open_test_db() -> Connection {
    let conn = Connection::open_in_memory().expect("in-memory db");
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    conn.execute_batch(SCHEMA).expect("schema");
    conn
}

/// Vide entièrement les données indexées (mais conserve la config).
///
/// La table `purged_files` est également vidée : une réindexation complète part
/// d'une feuille blanche, l'utilisateur peut re-purger ce qu'il veut ensuite.
pub fn reset_index(db: &DbState) -> Result<(), AppError> {
    let conn = get_conn(db)?;
    conn.execute_batch(
        "DELETE FROM stream_events;
         DELETE FROM laps;
         DELETE FROM results;
         DELETE FROM sessions;
         DELETE FROM xml_index;
         DELETE FROM purged_files;",
    )
    .map_err(|e| AppError::Database(format!("reset_index: {e}")))?;
    Ok(())
}
