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
    indexed_at       INTEGER NOT NULL DEFAULT 0,
    -- Serveur de la séance (`<ServerName>`, `<Dedicated>` : 1 dédié, 0 joueur, -1 inconnu).
    server_name      TEXT    NOT NULL DEFAULT '',
    dedicated        INTEGER NOT NULL DEFAULT -1
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
    is_valid     INTEGER NOT NULL DEFAULT 1,
    et           REAL                          -- heure de session au début du tour
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

-- Setup réellement roulé : un tour bouclé en piste + le setup chargé dans la
-- voiture à ce moment (`garage/summary` du jeu). Les sessions (XML) sont
-- reconnues plus tard par leurs chronos (`setup_usage.rs`) : aucune clé vers
-- `sessions` ni `setups`, dont les id changent au rescan. Pas vidé par une
-- réindexation : c'est une donnée captée en piste, impossible à reconstruire.
CREATE TABLE IF NOT EXISTS setup_laps (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_at   INTEGER NOT NULL,              -- epoch s
    track         TEXT    NOT NULL DEFAULT '',   -- mémoire partagée (mTrackName)
    session_kind  INTEGER NOT NULL DEFAULT -1,   -- mSession
    lap_num       INTEGER NOT NULL,              -- compteur de tours du joueur
    lap_time      REAL,                          -- NULL : chrono absent
    setup_name    TEXT    NOT NULL,              -- activeSetup tel quel
    setup_folder  TEXT,                          -- dossier sous Settings (NULL : setup intégré)
    setup_file    TEXT    NOT NULL,              -- fichier, sans .svm
    unsaved       INTEGER,                       -- 1 : réglages non enregistrés
    car           TEXT,
    wet           REAL                           -- humidité moyenne de la trajectoire (0-1)
);
CREATE INDEX IF NOT EXISTS idx_setup_laps_time ON setup_laps(recorded_at);

-- Setups dont le pilote a retiré le lien de référence : le lien automatique ne le
-- repose pas. Clé = chemin sous `Settings` (`setup_usage::key_of_path`), car les
-- id de `setups` changent au rescan. Comme `setup_laps`, survit à une réindexation.
CREATE TABLE IF NOT EXISTS setup_link_cleared (
    setup_key  TEXT PRIMARY KEY
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

-- Banque de phrases LLM à slots (COACH-LIVE-SPEC.md §10, P4.3). Un seul appel
-- batch par combo × langue génère des variantes de formulation par (virage,
-- diagnostic) ; les chiffres (delta, vmin…) restent des slots remplis EN CODE au
-- moment du virage → zéro appel LLM sur le chemin critique, fonctionne hors-ligne
-- après génération. `ref_key` invalide la banque quand la réf du combo change ;
-- `variants` = JSON PhraseEntry[] (voir src/lib/coach/phrasebank.ts).
CREATE TABLE IF NOT EXISTS coach_phrasebank (
    track       TEXT    NOT NULL,
    car_model   TEXT    NOT NULL,
    lang        TEXT    NOT NULL,          -- code 2 lettres (fr/en/es/de)
    class_id    TEXT    NOT NULL DEFAULT '',
    ref_key     TEXT    NOT NULL DEFAULT '',
    variants    TEXT    NOT NULL DEFAULT '[]',
    created_at  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (track, car_model, lang)
);

-- File d'envoi du partage communautaire (COMMUNITY-SPEC.md §4 bis, §9). Indexée par
-- la clé d'idempotence (sha256(install_id|fichier XML)) et NON par sessions.id : une
-- réindexation complète ne perd rien et ne renvoie rien en double. Une session n'est
-- `sent` que si l'accusé du serveur (`received`) la cite ; `rejected` = refus définitif
-- (jamais renvoyée) ; `pending` = à retenter après `next_try_at`.
CREATE TABLE IF NOT EXISTS community_outbox (
    session_key  TEXT    PRIMARY KEY,
    state        TEXT    NOT NULL,
    reason       TEXT,
    attempts     INTEGER NOT NULL DEFAULT 0,
    next_try_at  INTEGER NOT NULL DEFAULT 0,
    updated_at   INTEGER NOT NULL DEFAULT 0
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
CREATE INDEX IF NOT EXISTS idx_phrasebank_combo   ON coach_phrasebank(track, car_model);
";

/// Échec d'ouverture de la base. La base contient aussi des données qu'une réindexation ne
/// rend pas (`config`, `coach_notes`) : seule une vraie corruption autorise la mise de côté.
#[derive(Debug)]
pub enum DbOpenError {
    /// Fichier abîmé (`SQLITE_CORRUPT`, `SQLITE_NOTADB`, `quick_check` en échec).
    Corrupt(String),
    /// Tout le reste (droits, disque plein, fichier verrouillé…) : le fichier n'est pas en cause.
    Other(AppError),
}

impl std::fmt::Display for DbOpenError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DbOpenError::Corrupt(e) => write!(f, "{e}"),
            DbOpenError::Other(e) => write!(f, "{e}"),
        }
    }
}

/// Classe une erreur SQLite : corruption du fichier, ou autre cause.
fn classify_db_error(step: &str, e: rusqlite::Error) -> DbOpenError {
    let corrupt = matches!(
        &e,
        rusqlite::Error::SqliteFailure(f, _)
            if matches!(f.code, rusqlite::ErrorCode::DatabaseCorrupt | rusqlite::ErrorCode::NotADatabase)
    );
    if corrupt {
        DbOpenError::Corrupt(format!("{step}: {e}"))
    } else {
        DbOpenError::Other(AppError::Database(format!("{step}: {e}")))
    }
}

/// Résultat de `quick_check` : `ok`, ou des lignes de problèmes. Une contrainte non respectée
/// (NULL, CHECK, type STRICT) est une incohérence des données, pas un fichier abîmé.
fn quick_check_damage(rows: &[String]) -> Option<String> {
    let logical = |r: &str| r.starts_with("NULL value in") || r.starts_with("CHECK constraint failed") || r.contains(" value in ");
    rows.iter().find(|r| r.as_str() != "ok" && !logical(r)).cloned()
}

/// Contrôle du fichier à l'ouverture. Parcourt toute la base sans comparer les index aux tables
/// (seul l'`integrity_check` le fait, bien plus lent). Mesuré à 0,53 s pour 76 Mo sans
/// optimisation (`quick_check_cost` dans les tests), soit ~0,15 s pour une base réelle de ~20 Mo.
fn check_file(conn: &Connection) -> Result<(), DbOpenError> {
    let rows = conn
        .prepare("PRAGMA quick_check")
        .and_then(|mut st| st.query_map([], |r| r.get::<_, String>(0))?.collect::<Result<Vec<_>, _>>())
        .map_err(|e| classify_db_error("quick_check", e))?;
    if let Some(damage) = quick_check_damage(&rows) {
        return Err(DbOpenError::Corrupt(format!("quick_check: {damage}")));
    }
    if rows.iter().any(|r| r != "ok") {
        crate::app_warn!("base locale : données incohérentes signalées par quick_check : {}", rows[0]);
    }
    Ok(())
}

/// Fichier mis de côté à ce démarrage (l'app le signale à l'utilisateur).
static QUARANTINED: Mutex<Option<String>> = Mutex::new(None);

/// Met de côté une base abîmée (`lmu_cache.db` → `lmu_cache.db.corrupt-<date>`,
/// avec ses fichiers WAL/SHM) pour que `init_db` reparte d'une base neuve. Rien
/// n'est effacé : le fichier reste disponible pour un rapport de bug.
pub fn quarantine_db(app_handle: &tauri::AppHandle) {
    let Ok(dir) = app_handle.path().app_data_dir() else {
        return;
    };
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let kept = quarantine_in(&dir, &stamp.to_string());
    if let (Some(kept), Ok(mut q)) = (kept, QUARANTINED.lock()) {
        *q = Some(kept);
    }
}

/// Renomme les fichiers de la base dans `dir` ; renvoie le nouveau nom du fichier principal.
fn quarantine_in(dir: &std::path::Path, stamp: &str) -> Option<String> {
    let kept = format!("lmu_cache.db.corrupt-{stamp}");
    // Fichier principal d'abord : s'il ne bouge pas, son journal doit rester avec lui.
    std::fs::rename(dir.join("lmu_cache.db"), dir.join(&kept)).ok()?;
    for name in ["lmu_cache.db-wal", "lmu_cache.db-shm"] {
        let from = dir.join(name);
        if from.exists() {
            let _ = std::fs::rename(&from, dir.join(format!("{name}.corrupt-{stamp}")));
        }
    }
    Some(kept)
}

/// Identité communautaire : sans ces trois clés, rien n'est repris.
const IDENTITY_REQUIRED: [&str; 3] = ["community_install_id", "community_tag", "community_token_enc"];
/// Choix du joueur liés à cette identité. Le mode anonyme surtout : le perdre publierait
/// son nom. `community_enabled` n'en fait pas partie : pas d'envoi sans nouveau clic.
const IDENTITY_OPTIONAL: [&str; 4] = [
    "community_anonymous",
    "community_steam",
    "community_avatar_off",
    "community_avatar_ready",
];

/// Identité reprise du fichier mis de côté à ce démarrage (écran d'accueil).
static IDENTITY_KEPT: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Lit l'identité dans le fichier abîmé (en lecture seule) et la recopie dans la base
/// neuve. Tout ou rien : un fichier illisible ou une clé obligatoire absente ne laisse
/// aucune trace, et le joueur se reconnecte avec Steam comme avant.
fn copy_identity(from: &std::path::Path, to: &Connection) -> bool {
    let read = || -> Option<Vec<(&str, String)>> {
        let src = Connection::open_with_flags(from, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).ok()?;
        let get = |key: &str| -> Option<String> {
            src.query_row("SELECT value FROM config WHERE key = ?1", params![key], |r| r.get::<_, String>(0))
                .ok()
                .filter(|v| !v.is_empty())
        };
        let mut out = Vec::new();
        for key in IDENTITY_REQUIRED {
            out.push((key, get(key)?));
        }
        for key in IDENTITY_OPTIONAL {
            if let Some(v) = get(key) {
                out.push((key, v));
            }
        }
        Some(out)
    };
    let Some(rows) = read() else { return false };
    let write = || -> rusqlite::Result<()> {
        let tx = to.unchecked_transaction()?;
        for (key, value) in &rows {
            tx.execute(
                "INSERT INTO config (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![key, value],
            )?;
        }
        tx.commit()
    };
    write().is_ok()
}

/// Après une mise de côté : tente de reprendre l'identité communautaire dans la base neuve.
pub fn recover_identity(app_handle: &tauri::AppHandle, db: &DbState) {
    let name = QUARANTINED.lock().ok().and_then(|q| q.clone());
    let (Some(name), Ok(dir), Ok(conn)) = (name, app_handle.path().app_data_dir(), get_conn(db)) else {
        return;
    };
    let kept = copy_identity(&dir.join(name), &conn);
    IDENTITY_KEPT.store(kept, std::sync::atomic::Ordering::Relaxed);
    crate::app_info!("base mise de côté : identité communautaire reprise = {kept}");
}

/// L'identité communautaire a-t-elle été reprise du fichier mis de côté ?
#[tauri::command]
pub fn db_quarantine_identity_kept() -> bool {
    IDENTITY_KEPT.load(std::sync::atomic::Ordering::Relaxed)
}

/// Nom du fichier mis de côté à ce démarrage (écran d'accueil : réglages à refaire).
#[tauri::command]
pub fn db_quarantine_notice() -> Option<String> {
    QUARANTINED.lock().ok().and_then(|q| q.clone())
}

pub fn init_db(app_handle: &tauri::AppHandle) -> Result<DbState, DbOpenError> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| DbOpenError::Other(AppError::Internal(format!("app data dir: {e}"))))?;

    std::fs::create_dir_all(&app_data_dir).map_err(|e| DbOpenError::Other(AppError::Io(e)))?;

    let conn = open_db_file(&app_data_dir.join("lmu_cache.db"))?;
    Ok(DbState {
        conn: Mutex::new(conn),
    })
}

/// Ouvre la base, vérifie le fichier et met le schéma à jour.
fn open_db_file(db_path: &std::path::Path) -> Result<Connection, DbOpenError> {
    let conn = Connection::open(db_path).map_err(|e| classify_db_error(&format!("open {}", db_path.display()), e))?;

    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         PRAGMA foreign_keys=ON;
         PRAGMA cache_size=-8000;",
    )
    .map_err(|e| classify_db_error("pragmas", e))?;

    check_file(&conn)?;

    conn.execute_batch(SCHEMA).map_err(|e| classify_db_error("schema", e))?;

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
    // Serveur de la séance (`<ServerName>`, `<Dedicated>`) : tours « comparables ».
    // -1 = inconnu (fichier indexé avant l'ajout : une réindexation le complète).
    let _ = conn.execute("ALTER TABLE xml_index ADD COLUMN server_name TEXT NOT NULL DEFAULT ''", []);
    let _ = conn.execute("ALTER TABLE xml_index ADD COLUMN dedicated INTEGER NOT NULL DEFAULT -1", []);
    // Heure de session au début de chaque tour : situe un événement (limite de piste)
    // dans le tour. NULL pour une base existante : complété à la lecture du détail.
    let _ = conn.execute("ALTER TABLE laps ADD COLUMN et REAL", []);
    // Humidité de la trajectoire à la fin du tour (setup roulé sur le sec ou la pluie).
    let _ = conn.execute("ALTER TABLE setup_laps ADD COLUMN wet REAL", []);
    // Migration : création de la table `purged_files` si elle manque (base existante).
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS purged_files (
            filename   TEXT PRIMARY KEY,
            mtime      INTEGER NOT NULL,
            purged_at  INTEGER NOT NULL DEFAULT 0
        );",
    );

    Ok(conn)
}

/// État de base autour d'une connexion donnée (tests uniquement).
#[cfg(test)]
pub fn state_from(conn: Connection) -> DbState {
    DbState { conn: Mutex::new(conn) }
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

#[cfg(test)]
mod open_tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("lmu_db_{name}_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn identity_is_copied_all_or_nothing() {
        let dir = temp_dir("identity");
        let from = dir.join("old.db");
        let to = open_db_file(&dir.join("new.db")).unwrap();
        let count = |c: &Connection, like: &str| -> i64 {
            c.query_row("SELECT COUNT(*) FROM config WHERE key LIKE ?1", params![like], |r| r.get(0)).unwrap()
        };
        let set = |c: &Connection, k: &str, v: &str| {
            c.execute("INSERT INTO config (key, value) VALUES (?1, ?2)", params![k, v]).unwrap();
        };
        {
            let src = open_db_file(&from).unwrap();
            set(&src, "community_install_id", "i");
            set(&src, "community_tag", "t");
            set(&src, "lmu_path", "D:/jeu");
            set(&src, "community_enabled", "true");
        }
        assert!(!copy_identity(&from, &to), "jeton absent : rien");
        assert_eq!(count(&to, "community_%"), 0, "tout ou rien");
        {
            let src = Connection::open(&from).unwrap();
            set(&src, "community_token_enc", "x");
            set(&src, "community_anonymous", "true");
        }
        assert!(copy_identity(&from, &to));
        let value = |k: &str| -> Option<String> {
            to.query_row("SELECT value FROM config WHERE key = ?1", params![k], |r| r.get(0)).optional().unwrap()
        };
        assert_eq!(value("community_token_enc").as_deref(), Some("x"));
        assert_eq!(value("community_anonymous").as_deref(), Some("true"), "le mode anonyme suit");
        assert_eq!(value("community_enabled"), None, "le partage reste à réactiver");
        assert_eq!(value("lmu_path"), None, "seule l'identité est reprise");

        let junk = dir.join("junk.db");
        std::fs::write(&junk, b"pas une base").unwrap();
        assert!(!copy_identity(&junk, &to), "fichier illisible : rien, sans plantage");
        assert!(!copy_identity(&dir.join("absent.db"), &to), "fichier absent : rien");
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn is_corrupt(r: Result<Connection, DbOpenError>) -> bool {
        matches!(r, Err(DbOpenError::Corrupt(_)))
    }

    #[test]
    fn healthy_file_opens_and_keeps_its_data() {
        let dir = temp_dir("healthy");
        let path = dir.join("lmu_cache.db");
        {
            let c = open_db_file(&path).unwrap();
            c.execute("INSERT INTO config (key, value) VALUES ('lmu_path', 'C:/LMU')", []).unwrap();
        }
        let c = open_db_file(&path).unwrap();
        let v: String = c.query_row("SELECT value FROM config WHERE key = 'lmu_path'", [], |r| r.get(0)).unwrap();
        assert_eq!(v, "C:/LMU");
        drop(c);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn garbage_file_is_corruption() {
        let dir = temp_dir("garbage");
        let path = dir.join("lmu_cache.db");
        std::fs::write(&path, vec![0x5Au8; 8192]).unwrap();
        assert!(is_corrupt(open_db_file(&path)), "SQLITE_NOTADB");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Base abîmée au milieu du fichier : en-tête et schéma se lisent, `init_db` passait sans
    /// voir le problème ; `quick_check` le trouve.
    #[test]
    fn damaged_page_is_found_by_quick_check() {
        let dir = temp_dir("page");
        let path = dir.join("lmu_cache.db");
        {
            let c = open_db_file(&path).unwrap();
            c.execute_batch("PRAGMA journal_mode=DELETE; BEGIN;").unwrap();
            for i in 0..4000 {
                c.execute("INSERT INTO config (key, value) VALUES (?1, ?2)", params![format!("k{i}"), "x".repeat(200)]).unwrap();
            }
            c.execute_batch("COMMIT; PRAGMA wal_checkpoint(TRUNCATE);").unwrap();
        }
        let mut bytes = std::fs::read(&path).unwrap();
        assert!(bytes.len() > 200_000, "base assez grande pour l'essai");
        // Quelques pages en plein milieu, hors de l'en-tête et du schéma.
        let mid = bytes.len() / 2;
        bytes[mid..mid + 16384].fill(0xA5);
        std::fs::write(&path, &bytes).unwrap();
        assert!(is_corrupt(open_db_file(&path)));
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Une erreur qui n'est pas une corruption ne doit jamais faire mettre la base de côté.
    #[test]
    fn other_errors_are_not_corruption() {
        let dir = temp_dir("other");
        // Le chemin est un dossier : SQLITE_CANTOPEN.
        assert!(matches!(open_db_file(&dir), Err(DbOpenError::Other(_))));
        let _ = std::fs::remove_dir_all(&dir);
        let code = |c| rusqlite::Error::SqliteFailure(rusqlite::ffi::Error::new(c), None);
        for c in [rusqlite::ffi::SQLITE_BUSY, rusqlite::ffi::SQLITE_FULL, rusqlite::ffi::SQLITE_READONLY, rusqlite::ffi::SQLITE_IOERR, rusqlite::ffi::SQLITE_CANTOPEN] {
            assert!(matches!(classify_db_error("t", code(c)), DbOpenError::Other(_)), "code {c}");
        }
        for c in [rusqlite::ffi::SQLITE_CORRUPT, rusqlite::ffi::SQLITE_NOTADB] {
            assert!(matches!(classify_db_error("t", code(c)), DbOpenError::Corrupt(_)), "code {c}");
        }
    }

    #[test]
    fn quick_check_lines_are_sorted_out() {
        let rows = |l: &[&str]| l.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(quick_check_damage(&rows(&["ok"])), None);
        assert_eq!(quick_check_damage(&rows(&["NULL value in laps.time"])), None, "contrainte, pas fichier");
        assert_eq!(quick_check_damage(&rows(&["CHECK constraint failed in laps"])), None);
        let bad = "*** in database main ***\nPage 12: btreeInitPage() returns error code 11";
        assert_eq!(quick_check_damage(&rows(&["NULL value in laps.time", bad])).as_deref(), Some(bad));
    }

    #[test]
    fn quarantine_moves_the_files_and_stops_if_the_main_one_stays() {
        let dir = temp_dir("quarantine");
        assert_eq!(quarantine_in(&dir, "s"), None, "pas de fichier : rien à signaler");
        std::fs::write(dir.join("lmu_cache.db-wal"), b"w").unwrap();
        assert_eq!(quarantine_in(&dir, "s"), None);
        assert!(dir.join("lmu_cache.db-wal").exists(), "le journal reste avec son fichier");
        std::fs::write(dir.join("lmu_cache.db"), b"d").unwrap();
        assert_eq!(quarantine_in(&dir, "s").as_deref(), Some("lmu_cache.db.corrupt-s"));
        assert!(!dir.join("lmu_cache.db").exists() && !dir.join("lmu_cache.db-wal").exists());
        assert!(dir.join("lmu_cache.db.corrupt-s").exists() && dir.join("lmu_cache.db-wal.corrupt-s").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Mesure du coût de `quick_check` sur une grosse base (à lancer à la main, en release) :
    /// `cargo test --release --lib quick_check_cost -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn quick_check_cost() {
        let dir = temp_dir("cost");
        let path = dir.join("lmu_cache.db");
        let c = open_db_file(&path).unwrap();
        c.execute_batch("CREATE TABLE big (id INTEGER PRIMARY KEY, a TEXT, b REAL, c INTEGER); CREATE INDEX big_a ON big(a); BEGIN;").unwrap();
        for i in 0..1_500_000i64 {
            c.execute("INSERT INTO big (a, b, c) VALUES (?1, ?2, ?3)", params![format!("value-{}", i * 7919 % 100_000), i as f64 / 3.0, i]).unwrap();
        }
        c.execute_batch("COMMIT; PRAGMA wal_checkpoint(TRUNCATE);").unwrap();
        drop(c);
        let mb = std::fs::metadata(&path).unwrap().len() as f64 / 1_048_576.0;
        for _ in 0..3 {
            let c = Connection::open(&path).unwrap();
            c.execute_batch("PRAGMA cache_size=-8000;").unwrap();
            let t = std::time::Instant::now();
            check_file(&c).unwrap();
            println!("quick_check : {mb:.0} Mo en {:.0} ms", t.elapsed().as_secs_f64() * 1000.0);
        }
        let _ = std::fs::remove_dir_all(&dir);
    }
}
