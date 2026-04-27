<?php
/**
 * Couche d'accès SQLite — connexion et schéma.
 * Base de données : %APPDATA%\LMU_Stats_Viewer\lmu_cache.db
 */

function get_db_path(): string {
    $appDataPath = getenv('APPDATA');
    if (!$appDataPath) {
        $appDataPath = __DIR__ . '/../data';
    }
    return $appDataPath . DIRECTORY_SEPARATOR . 'LMU_Stats_Viewer' . DIRECTORY_SEPARATOR . 'lmu_cache.db';
}

function get_db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $dbPath = get_db_path();
    try {
        $pdo = new PDO('sqlite:' . $dbPath);
    } catch (\Exception $e) {
        error_log('[LMU Stats] Impossible d\'ouvrir la base SQLite (' . $dbPath . ') : ' . $e->getMessage());
        throw $e;
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA synchronous = NORMAL');
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA cache_size = -8000'); // 8 MB cache

    init_db_schema($pdo);
    return $pdo;
}

function init_db_schema(PDO $pdo): void {
    $pdo->exec("
        -- Suivi des fichiers XML indexés (métadonnées de session)
        CREATE TABLE IF NOT EXISTS xml_index (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            filename     TEXT    UNIQUE NOT NULL,
            mtime        INTEGER NOT NULL,
            timestamp    INTEGER NOT NULL DEFAULT 0,
            track        TEXT    NOT NULL DEFAULT '',
            track_course TEXT    NOT NULL DEFAULT '',
            setting      TEXT    NOT NULL DEFAULT '',
            game_version TEXT    NOT NULL DEFAULT '',
            has_any_laps INTEGER NOT NULL DEFAULT 0,
            indexed_at   INTEGER NOT NULL
        );

        -- Classes de voitures présentes dans chaque session (pour les filtres)
        CREATE TABLE IF NOT EXISTS session_classes (
            xml_id       INTEGER NOT NULL,
            session_type TEXT    NOT NULL,
            car_class    TEXT    NOT NULL,
            PRIMARY KEY (xml_id, session_type, car_class),
            FOREIGN KEY (xml_id) REFERENCES xml_index(id) ON DELETE CASCADE
        );

        -- Sessions du joueur avec statistiques agrégées
        CREATE TABLE IF NOT EXISTS player_sessions (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            xml_id           INTEGER NOT NULL,
            event_id         INTEGER NOT NULL,   -- timestamp du 1er fichier du groupe d'événement
            session_type     TEXT    NOT NULL,   -- Practice1 | Qualify | Race
            timestamp        INTEGER NOT NULL,
            track            TEXT    NOT NULL DEFAULT '',
            track_course     TEXT    NOT NULL DEFAULT '',
            setting          TEXT    NOT NULL DEFAULT '',
            game_version     TEXT    NOT NULL DEFAULT '',
            car_type         TEXT,
            car_class        TEXT,
            car_name         TEXT,               -- VehName (livrée)
            unique_car_name  TEXT,               -- ex. 'Peugeot 9x8 (2024/25)'
            class_position   INTEGER,
            grid_pos         INTEGER,
            laps_count       INTEGER,
            finish_time      REAL,
            finish_status    TEXT,
            pitstops         INTEGER,
            participants     INTEGER DEFAULT 0,
            -- Meilleur tour complet (s1+s2+s3 tous > 0)
            best_lap         REAL,
            best_lap_s1      REAL,
            best_lap_s2      REAL,
            best_lap_s3      REAL,
            -- Meilleurs secteurs absolus (tous tours confondus)
            abs_best_s1      REAL,
            abs_best_s2      REAL,
            abs_best_s3      REAL,
            abs_best_s1_date INTEGER,
            abs_best_s2_date INTEGER,
            abs_best_s3_date INTEGER,
            optimal_lap      REAL,
            vmax             REAL,
            progression      INTEGER,
            total_laps_valid INTEGER DEFAULT 0,  -- tours avec 4 chronos valides
            total_lap_time   REAL    DEFAULT 0.0,-- somme des temps (pour temps de conduite)
            FOREIGN KEY (xml_id) REFERENCES xml_index(id) ON DELETE CASCADE
        );

        -- Tours du joueur (pour les graphiques)
        CREATE TABLE IF NOT EXISTS player_laps (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            lap_num    INTEGER,
            lap_time   REAL,
            s1 REAL, s2 REAL, s3 REAL,
            top_speed  REAL,
            is_pit     INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (session_id) REFERENCES player_sessions(id) ON DELETE CASCADE
        );

        -- Métadonnées de la base (ex. joueur indexé)
        CREATE TABLE IF NOT EXISTS db_meta (
            key   TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_ps_track    ON player_sessions(track, track_course, car_class, unique_car_name);
        CREATE INDEX IF NOT EXISTS idx_ps_ts       ON player_sessions(timestamp);
        CREATE INDEX IF NOT EXISTS idx_ps_xml      ON player_sessions(xml_id);
        CREATE INDEX IF NOT EXISTS idx_pl_session  ON player_laps(session_id);
        CREATE INDEX IF NOT EXISTS idx_xi_filename ON xml_index(filename);
    ");

    // Migration : ajoute event_id à xml_index si absent (bases existantes).
    // event_id = timestamp du 1er fichier du groupe d'événement (même valeur que player_sessions.event_id).
    try {
        $pdo->exec("ALTER TABLE xml_index ADD COLUMN event_id INTEGER NOT NULL DEFAULT 0");
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_xi_event ON xml_index(event_id)");
    } catch (\Exception $e) {
        // Colonne déjà présente — rien à faire.
    }

    // Migration : ajoute has_any_laps à xml_index si absent (bases existantes).
    // Valeur conservative = 1 pour les anciennes lignes : elles seront réindexées
    // au prochain sync si leur mtime a changé ; les sessions sans tours seront
    // correctement marquées à 0 dès le prochain passage de l'indexeur.
    try {
        $pdo->exec("ALTER TABLE xml_index ADD COLUMN has_any_laps INTEGER NOT NULL DEFAULT 0");
        // Lignes existantes : on suppose qu'elles ont des tours pour éviter de les
        // proposer à tort comme candidates à la purge avant la prochaine réindexation.
        $pdo->exec("UPDATE xml_index SET has_any_laps = 1 WHERE has_any_laps = 0");
    } catch (\Exception $e) {
        // Colonne déjà présente — rien à faire.
    }
}
