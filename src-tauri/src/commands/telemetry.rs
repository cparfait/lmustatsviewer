//! Lecture de la télémétrie post-session LMU (fichiers `.duckdb`).
//!
//! Le jeu écrit nativement un fichier DuckDB par session dans
//! `<lmu_path>/UserData/Telemetry/` quand « Telemetry Recording » est activé
//! (Settings → Controls → Gameplay). Aucun parsing binaire `.bt` n'est requis :
//! la crate `duckdb` lit ces fichiers directement.
//!
//! Structure interne d'un fichier (cf. analyse LMU Telemetry Lab) :
//! - table `metadata` (key/value) — pilote, circuit, voiture, type de session…
//! - table `channelsList` (channelName / frequency / unit) — canaux **continus**
//! - table `eventsList` (eventName / unit) — canaux **événementiels**
//! - 1 table par canal continu : colonne `value` (ou `value1..value4` par roue),
//!   échantillonnée à sa fréquence propre, horloge maître = `GPS Time` (100 Hz)
//! - 1 table par canal événementiel : `ts` (temps GPS, s) + `value` (sparse)
//!
//! Conventions d'alignement temporel retenues : pour un canal continu à `f` Hz,
//! l'échantillon `i` correspond au temps `t0 + i / f` (avec `t0` = première
//! valeur de `GPS Time`). Les canaux événementiels sont interpolés en escalier
//! (dernière valeur dont `ts <= t`).

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use duckdb::{AccessMode, Config, Connection};
use serde::Serialize;
use tauri::State;

use crate::db::{self, DbState};
use crate::error::AppError;

// ===========================================================================
// Structures sérialisées vers le frontend
// ===========================================================================

/// Résumé d'un fichier télémétrie (vue liste).
#[derive(Debug, Clone, Serialize)]
pub struct TelemetryFileInfo {
    /// Chemin absolu (clé pour les commandes de détail).
    pub path: String,
    pub filename: String,
    pub track: String,
    pub track_layout: String,
    /// Nom brut écrit par LMU dans la télémétrie : en pratique l'**équipe/livrée**
    /// (ex. `Team WRT 2026 #32:WEC`), pas le modèle de voiture.
    pub car_name: String,
    /// Vrai modèle de voiture (ex. `BMW M4 LMGT3`), récupéré en reliant `car_name`
    /// au `veh_name` des sessions indexées. Vide si aucune correspondance.
    pub car_model: String,
    pub car_class: String,
    pub session_type: String,
    pub driver: String,
    pub weather: String,
    /// Date d'enregistrement telle que stockée (`RecordingTime`, ISO-ish).
    pub recording_time: String,
    pub size_bytes: u64,
    /// Date de modification du fichier (epoch secondes).
    pub mtime: i64,
    /// Meilleur temps au tour (s) calculé depuis les tours segmentés. `None` si
    /// le fichier ne contient aucun tour complet (un seul segment / session brute).
    pub best_lap: Option<f64>,
}

/// Description d'un canal continu.
#[derive(Debug, Clone, Serialize)]
pub struct ChannelInfo {
    pub name: String,
    pub frequency: i64,
    pub unit: String,
    /// Nombre de composantes (1 = scalaire, 4 = par roue FL/FR/RL/RR).
    pub dims: usize,
    /// `true` si le canal est événementiel (table `ts`/`value`), `false` si continu.
    pub is_event: bool,
}

/// Un tour segmenté à partir du compteur de tour du jeu.
#[derive(Debug, Clone, Serialize)]
pub struct LapInfo {
    /// Numéro de tour rapporté par le jeu (peut démarrer à 0 = out-lap).
    pub lap: i64,
    /// Temps GPS de début (s).
    pub start_time: f64,
    /// Temps GPS de fin (s).
    pub end_time: f64,
    /// Durée du segment (s) = `end_time - start_time`.
    pub duration: f64,
}

/// Métadonnées complètes d'un fichier (vue détail).
#[derive(Debug, Clone, Serialize)]
pub struct TelemetryMeta {
    pub info: TelemetryFileInfo,
    /// Toutes les paires clé/valeur de la table `metadata`.
    pub metadata: HashMap<String, String>,
    pub channels: Vec<ChannelInfo>,
    pub laps: Vec<LapInfo>,
    /// Première valeur de `GPS Time` (origine de l'horloge, s).
    pub t0: f64,
    /// Durée totale enregistrée (s).
    pub duration: f64,
}

/// Une série de canal rééchantillonnée sur la grille `x`.
#[derive(Debug, Clone, Serialize)]
pub struct ChannelSeries {
    pub name: String,
    pub unit: String,
    pub dims: usize,
    /// `dims` tableaux, chacun de longueur `time.len()`.
    pub values: Vec<Vec<f32>>,
}

/// Données prêtes pour le tracé : axe X commun + séries alignées.
#[derive(Debug, Clone, Serialize)]
pub struct ChannelData {
    /// Temps relatif au début de la plage (lap ou session), en secondes.
    pub time: Vec<f32>,
    /// Distance au tour (m) à chaque point — vide si `Lap Dist` indisponible.
    pub dist: Vec<f32>,
    pub channels: Vec<ChannelSeries>,
}

// ===========================================================================
// Ouverture / introspection DuckDB
// ===========================================================================

fn open_ro(path: &str) -> Result<Connection, AppError> {
    let cfg = Config::default()
        .access_mode(AccessMode::ReadOnly)
        .map_err(|e| AppError::Database(format!("duckdb config: {e}")))?;
    Connection::open_with_flags(path, cfg)
        .map_err(|e| AppError::Database(format!("duckdb open {path}: {e}")))
}

/// Ensemble des noms de tables présentes dans le fichier.
fn table_names(conn: &Connection) -> Result<HashSet<String>, AppError> {
    let mut stmt = conn
        .prepare("SELECT table_name FROM information_schema.tables")
        .map_err(|e| AppError::Database(format!("table_names prepare: {e}")))?;
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| AppError::Database(format!("table_names query: {e}")))?;
    Ok(rows.flatten().collect())
}

/// Lit la table `metadata` (key/value) en dictionnaire.
fn read_metadata(conn: &Connection) -> Result<HashMap<String, String>, AppError> {
    let mut map = HashMap::new();
    let mut stmt = conn
        .prepare("SELECT key, value FROM metadata")
        .map_err(|e| AppError::Database(format!("metadata prepare: {e}")))?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| AppError::Database(format!("metadata query: {e}")))?;
    for row in rows.flatten() {
        map.insert(row.0, row.1);
    }
    Ok(map)
}

/// Colonnes `value*` d'une table de canal (détecte aussi la colonne `ts`).
/// Renvoie `(is_event, value_columns)`.
fn channel_columns(conn: &Connection, table: &str) -> Result<(bool, Vec<String>), AppError> {
    let sql = format!("PRAGMA table_info(\"{}\")", escape_ident(table));
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| AppError::Database(format!("table_info prepare: {e}")))?;
    // PRAGMA table_info → (cid, name, type, notnull, dflt_value, pk)
    let cols: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(1))
        .map_err(|e| AppError::Database(format!("table_info query: {e}")))?
        .flatten()
        .collect();
    let is_event = cols.iter().any(|c| c == "ts");
    let value_cols: Vec<String> = cols.into_iter().filter(|c| c.starts_with("value")).collect();
    Ok((is_event, value_cols))
}

/// Échappe les guillemets doubles d'un identifiant SQL (noms de table/colonne).
fn escape_ident(ident: &str) -> String {
    ident.replace('"', "\"\"")
}

// ===========================================================================
// Lecture brute d'un canal
// ===========================================================================

struct ChannelRaw {
    is_event: bool,
    dims: usize,
    /// Pour les canaux événementiels uniquement : horodatages GPS.
    ts: Vec<f64>,
    /// `dims` colonnes, chacune contenant tous les échantillons (DOUBLE).
    data: Vec<Vec<f64>>,
}

/// Charge intégralement un canal en mémoire (quelques centaines de Ko au plus).
fn read_channel(conn: &Connection, table: &str) -> Result<ChannelRaw, AppError> {
    let (is_event, value_cols) = channel_columns(conn, table)?;
    if value_cols.is_empty() {
        return Err(AppError::NotFound(format!(
            "Canal sans colonne value : {table}"
        )));
    }
    let dims = value_cols.len();
    let esc = escape_ident(table);

    // On normalise tout en DOUBLE pour éviter les erreurs de type (FLOAT vs
    // DOUBLE vs entiers) à la lecture.
    let select: Vec<String> = value_cols
        .iter()
        .map(|c| format!("CAST(\"{}\" AS DOUBLE)", escape_ident(c)))
        .collect();

    let mut data: Vec<Vec<f64>> = vec![Vec::new(); dims];
    let mut ts: Vec<f64> = Vec::new();

    if is_event {
        let sql = format!(
            "SELECT CAST(ts AS DOUBLE), {} FROM \"{}\" ORDER BY ts",
            select.join(", "),
            esc
        );
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| AppError::Database(format!("read_channel prepare {table}: {e}")))?;
        let mut rows = stmt
            .query([])
            .map_err(|e| AppError::Database(format!("read_channel query {table}: {e}")))?;
        while let Some(row) = rows
            .next()
            .map_err(|e| AppError::Database(format!("read_channel next {table}: {e}")))?
        {
            ts.push(row.get::<_, f64>(0).unwrap_or(0.0));
            for d in 0..dims {
                data[d].push(row.get::<_, f64>(d + 1).unwrap_or(f64::NAN));
            }
        }
    } else {
        let sql = format!("SELECT {} FROM \"{}\"", select.join(", "), esc);
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| AppError::Database(format!("read_channel prepare {table}: {e}")))?;
        let mut rows = stmt
            .query([])
            .map_err(|e| AppError::Database(format!("read_channel query {table}: {e}")))?;
        while let Some(row) = rows
            .next()
            .map_err(|e| AppError::Database(format!("read_channel next {table}: {e}")))?
        {
            for d in 0..dims {
                data[d].push(row.get::<_, f64>(d).unwrap_or(f64::NAN));
            }
        }
    }

    Ok(ChannelRaw {
        is_event,
        dims,
        ts,
        data,
    })
}

// ===========================================================================
// Segmentation des tours + bornes temporelles
// ===========================================================================

/// `t0` (première valeur GPS Time) et durée totale enregistrée.
fn gps_time_bounds(conn: &Connection) -> Result<(f64, f64), AppError> {
    let (min, max): (f64, f64) = conn
        .query_row(
            "SELECT CAST(MIN(value) AS DOUBLE), CAST(MAX(value) AS DOUBLE) FROM \"GPS Time\"",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| AppError::Database(format!("gps_time_bounds: {e}")))?;
    Ok((min, max - min))
}

/// Segmente les tours à partir du compteur `Lap` du jeu (source autoritaire) :
/// chaque ligne `(ts, lap)` ouvre un tour qui court jusqu'au `ts` suivant.
/// En l'absence de table `Lap` exploitable, retourne un unique segment couvrant
/// toute la session.
fn segment_laps(conn: &Connection, tables: &HashSet<String>, t0: f64, t_end: f64) -> Vec<LapInfo> {
    let mut laps: Vec<LapInfo> = Vec::new();

    if tables.contains("Lap") {
        if let Ok(raw) = read_channel(conn, "Lap") {
            if raw.is_event && !raw.ts.is_empty() {
                let n = raw.ts.len();
                for i in 0..n {
                    let start = raw.ts[i];
                    let end = if i + 1 < n { raw.ts[i + 1] } else { t_end };
                    laps.push(LapInfo {
                        lap: raw.data[0].get(i).copied().unwrap_or(0.0) as i64,
                        start_time: start,
                        end_time: end,
                        duration: (end - start).max(0.0),
                    });
                }
            }
        }
    }

    if laps.is_empty() {
        laps.push(LapInfo {
            lap: 0,
            start_time: t0,
            end_time: t_end,
            duration: (t_end - t0).max(0.0),
        });
    }
    laps
}

// ===========================================================================
// Construction des fiches fichier
// ===========================================================================

fn meta_get<'a>(m: &'a HashMap<String, String>, key: &str) -> &'a str {
    m.get(key).map(|s| s.as_str()).unwrap_or("")
}

fn build_file_info(path: &PathBuf, meta: &HashMap<String, String>) -> TelemetryFileInfo {
    let (size_bytes, mtime) = std::fs::metadata(path)
        .map(|m| {
            let size = m.len();
            let mtime = m
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            (size, mtime)
        })
        .unwrap_or((0, 0));

    TelemetryFileInfo {
        path: path.to_string_lossy().to_string(),
        filename: path
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_default(),
        track: meta_get(meta, "TrackName").to_string(),
        track_layout: meta_get(meta, "TrackLayout").to_string(),
        car_name: meta_get(meta, "CarName").to_string(),
        car_model: String::new(),
        car_class: meta_get(meta, "CarClass").to_string(),
        session_type: meta_get(meta, "SessionType").to_string(),
        driver: meta_get(meta, "DriverName").to_string(),
        weather: meta_get(meta, "WeatherConditions").to_string(),
        recording_time: meta_get(meta, "RecordingTime").to_string(),
        size_bytes,
        mtime,
        // Renseigné par l'appelant qui dispose de la connexion (segmentation des tours).
        best_lap: None,
    }
}

/// Meilleur temps au tour à partir des tours segmentés : minimum des durées en
/// excluant le **dernier** segment (toujours partiel : il s'arrête à `t_end`, pas
/// à un passage sur la ligne). Un plancher écarte le bruit (double événement de
/// tour). `None` s'il n'y a pas de tour complet exploitable.
fn best_lap_time(laps: &[LapInfo]) -> Option<f64> {
    if laps.len() < 2 {
        return None;
    }
    laps[..laps.len() - 1]
        .iter()
        .map(|l| l.duration)
        .filter(|&d| d > 20.0)
        .fold(None, |acc, d| Some(acc.map_or(d, |a: f64| a.min(d))))
}

/// Relie le `CarName` brut de la télémétrie (= équipe/livrée) au vrai modèle de
/// voiture des sessions indexées. LMU écrit le même `veh_name` dans les XML de
/// résultats et dans la métadonnée `CarName` → correspondance exacte, sans flou.
///
/// Carte `veh_name` → `unique_car_name`, construite en une requête (pour la liste).
fn car_model_map(db: &DbState) -> HashMap<String, String> {
    let conn = match db::get_conn(db) {
        Ok(c) => c,
        Err(_) => return HashMap::new(),
    };
    let mut stmt = match conn
        .prepare("SELECT DISTINCT veh_name, unique_car_name FROM results WHERE veh_name <> ''")
    {
        Ok(s) => s,
        Err(_) => return HashMap::new(),
    };
    let rows = match stmt.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    }) {
        Ok(r) => r,
        Err(_) => return HashMap::new(),
    };
    let mut map = HashMap::new();
    for (veh, model) in rows.flatten() {
        if !model.is_empty() {
            map.insert(veh, model);
        }
    }
    map
}

/// Lookup d'un seul modèle (pour la vue détail).
fn lookup_car_model(db: &DbState, veh_name: &str) -> Option<String> {
    if veh_name.is_empty() {
        return None;
    }
    let conn = db::get_conn(db).ok()?;
    conn.query_row(
        "SELECT unique_car_name FROM results WHERE veh_name = ?1 AND unique_car_name <> '' LIMIT 1",
        [veh_name],
        |r| r.get::<_, String>(0),
    )
    .ok()
}

fn telemetry_dir(db: &DbState) -> Result<PathBuf, AppError> {
    // Surcharge explicite (dossier relocalisé) prioritaire sur la dérivation.
    if let Some(dir) = db::config_get(db, "telemetry_dir")? {
        if !dir.trim().is_empty() {
            return Ok(PathBuf::from(dir));
        }
    }
    let lmu_path = db::config_get(db, "lmu_path")?
        .ok_or_else(|| AppError::Config("lmu_path non configuré".into()))?;
    Ok(PathBuf::from(lmu_path)
        .join("UserData")
        .join("Telemetry"))
}

// ===========================================================================
// Commandes Tauri
// ===========================================================================

/// Liste les fichiers de télémétrie (`*.duckdb`) du dossier `UserData/Telemetry`,
/// les plus récents en premier. Lit uniquement la table `metadata` de chaque
/// fichier (rapide).
#[tauri::command]
pub fn list_telemetry_files(db: State<'_, DbState>) -> Result<Vec<TelemetryFileInfo>, AppError> {
    let dir = telemetry_dir(&db)?;
    if !dir.is_dir() {
        // Pas de dossier = l'utilisateur n'a jamais activé l'enregistrement.
        return Ok(Vec::new());
    }

    // Carte équipe/livrée → vrai modèle, construite une fois pour toute la liste.
    let model_map = car_model_map(&db);

    let mut out: Vec<TelemetryFileInfo> = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(AppError::Io)?.flatten() {
        let path = entry.path();
        if !path.is_file()
            || !path
                .extension()
                .map(|x| x.eq_ignore_ascii_case("duckdb"))
                .unwrap_or(false)
        {
            continue;
        }
        let path_str = path.to_string_lossy().to_string();
        // Un fichier corrompu / en cours d'écriture ne doit pas casser la liste.
        let conn = match open_ro(&path_str) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let meta = match read_metadata(&conn) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let mut info = build_file_info(&path, &meta);
        if let Some(model) = model_map.get(&info.car_name) {
            info.car_model = model.clone();
        }
        // Meilleur tour : segmentation légère (table `Lap` + bornes GPS). Silencieux
        // si indisponible → la liste reste affichée sans le temps.
        if let (Ok(tables), Ok((t0, dur))) = (table_names(&conn), gps_time_bounds(&conn)) {
            let laps = segment_laps(&conn, &tables, t0, t0 + dur);
            info.best_lap = best_lap_time(&laps);
        }
        out.push(info);
    }

    out.sort_by(|a, b| b.mtime.cmp(&a.mtime));
    Ok(out)
}

/// Métadonnées complètes d'un fichier : infos, canaux, tours segmentés, bornes.
#[tauri::command]
pub fn get_telemetry_meta(
    path: String,
    db: State<'_, DbState>,
) -> Result<TelemetryMeta, AppError> {
    let conn = open_ro(&path)?;
    let meta = read_metadata(&conn)?;
    let mut info = build_file_info(&PathBuf::from(&path), &meta);
    if let Some(model) = lookup_car_model(&db, &info.car_name) {
        info.car_model = model;
    }
    let tables = table_names(&conn)?;
    let (t0, duration) = gps_time_bounds(&conn)?;
    let t_end = t0 + duration;

    // Canaux continus (channelsList) + événementiels (eventsList).
    let mut channels: Vec<ChannelInfo> = Vec::new();

    if tables.contains("channelsList") {
        let mut stmt = conn
            .prepare("SELECT channelName, CAST(frequency AS BIGINT), unit FROM channelsList")
            .map_err(|e| AppError::Database(format!("channelsList prepare: {e}")))?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| AppError::Database(format!("channelsList query: {e}")))?;
        for (name, freq, unit) in rows.flatten() {
            if !tables.contains(&name) {
                continue;
            }
            let (is_event, value_cols) = channel_columns(&conn, &name)?;
            channels.push(ChannelInfo {
                name,
                frequency: freq,
                unit,
                dims: value_cols.len().max(1),
                is_event,
            });
        }
    }

    if tables.contains("eventsList") {
        let mut stmt = conn
            .prepare("SELECT eventName, unit FROM eventsList")
            .map_err(|e| AppError::Database(format!("eventsList prepare: {e}")))?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| AppError::Database(format!("eventsList query: {e}")))?;
        for (name, unit) in rows.flatten() {
            if !tables.contains(&name) {
                continue;
            }
            let (is_event, value_cols) = channel_columns(&conn, &name)?;
            channels.push(ChannelInfo {
                name,
                frequency: 0,
                unit,
                dims: value_cols.len().max(1),
                is_event,
            });
        }
    }

    let laps = segment_laps(&conn, &tables, t0, t_end);
    info.best_lap = best_lap_time(&laps);

    Ok(TelemetryMeta {
        info,
        metadata: meta,
        channels,
        laps,
        t0,
        duration,
    })
}

/// Charge et rééchantillonne un ensemble de canaux sur une grille temporelle
/// commune. `lap` (optionnel) restreint à un tour (par numéro de tour du jeu) ;
/// sinon toute la session. `max_points` borne la résolution (défaut 4000).
#[tauri::command]
pub fn get_telemetry_channels(
    path: String,
    channels: Vec<String>,
    lap: Option<i64>,
    max_points: Option<usize>,
) -> Result<ChannelData, AppError> {
    let conn = open_ro(&path)?;
    let tables = table_names(&conn)?;
    let (t0, duration) = gps_time_bounds(&conn)?;
    let t_end_all = t0 + duration;

    // Plage temporelle : tour sélectionné ou session entière.
    let (t_start, t_end) = if let Some(lap_num) = lap {
        let laps = segment_laps(&conn, &tables, t0, t_end_all);
        laps.iter()
            .find(|l| l.lap == lap_num)
            .map(|l| (l.start_time, l.end_time))
            .unwrap_or((t0, t_end_all))
    } else {
        (t0, t_end_all)
    };
    let span = (t_end - t_start).max(1e-6);

    // Charge les canaux demandés (validés contre les tables réelles).
    let mut raws: Vec<(String, ChannelInfo, ChannelRaw)> = Vec::new();
    let mut max_freq: f64 = 1.0;
    for name in &channels {
        if !tables.contains(name) {
            continue;
        }
        let raw = read_channel(&conn, name)?;
        let freq = if raw.is_event {
            // Fréquence inconnue → on se cale sur la grille générale.
            0.0
        } else {
            // freq = nb d'échantillons / durée totale (robuste aux diviseurs non
            // entiers de 100 Hz, ex. 7 Hz).
            let n = raw.data.first().map(|c| c.len()).unwrap_or(0);
            if duration > 0.0 {
                n as f64 / duration
            } else {
                0.0
            }
        };
        if freq > max_freq {
            max_freq = freq;
        }
        let info = ChannelInfo {
            name: name.clone(),
            frequency: freq.round() as i64,
            unit: String::new(),
            dims: raw.dims,
            is_event: raw.is_event,
        };
        raws.push((name.clone(), info, raw));
    }

    // Nombre de points de la grille.
    let max_points = max_points.unwrap_or(4000).clamp(2, 20000);
    let native = (span * max_freq).round() as usize + 1;
    let npts = native.clamp(2, max_points);
    let dt = span / (npts as f64 - 1.0);

    // Axe X : temps relatif + distance au tour (si dispo).
    let mut time: Vec<f32> = Vec::with_capacity(npts);
    for k in 0..npts {
        time.push((dt * k as f64) as f32);
    }

    // Distance : on échantillonne le canal "Lap Dist" (continu) sur la grille.
    let dist: Vec<f32> = if tables.contains("Lap Dist") {
        match read_channel(&conn, "Lap Dist") {
            Ok(ld) if !ld.is_event && !ld.data.is_empty() => {
                let col = &ld.data[0];
                let n = col.len();
                let f = if duration > 0.0 { n as f64 / duration } else { 0.0 };
                (0..npts)
                    .map(|k| {
                        let t = t_start + dt * k as f64;
                        let idx = (((t - t0) * f).round() as isize).clamp(0, n as isize - 1) as usize;
                        col[idx] as f32
                    })
                    .collect()
            }
            _ => Vec::new(),
        }
    } else {
        Vec::new()
    };

    // Rééchantillonnage de chaque canal sur la grille.
    let mut out_channels: Vec<ChannelSeries> = Vec::with_capacity(raws.len());
    for (name, info, raw) in &raws {
        let mut values: Vec<Vec<f32>> = Vec::with_capacity(raw.dims);
        for d in 0..raw.dims {
            let col = &raw.data[d];
            let n = col.len();
            let mut series: Vec<f32> = Vec::with_capacity(npts);
            if n == 0 {
                series.resize(npts, f32::NAN);
            } else if raw.is_event {
                // Interpolation en escalier : dernière valeur dont ts <= t.
                for k in 0..npts {
                    let t = t_start + dt * k as f64;
                    let idx = match raw.ts.binary_search_by(|probe| {
                        probe.partial_cmp(&t).unwrap_or(std::cmp::Ordering::Less)
                    }) {
                        Ok(i) => i,
                        Err(0) => 0,
                        Err(i) => i - 1,
                    };
                    series.push(col[idx.min(n - 1)] as f32);
                }
            } else {
                // Canal continu : index = (t - t0) * freq.
                let f = if duration > 0.0 { n as f64 / duration } else { 0.0 };
                for k in 0..npts {
                    let t = t_start + dt * k as f64;
                    let idx = (((t - t0) * f).round() as isize).clamp(0, n as isize - 1) as usize;
                    series.push(col[idx] as f32);
                }
            }
            values.push(series);
        }
        out_channels.push(ChannelSeries {
            name: name.clone(),
            unit: info.unit.clone(),
            dims: raw.dims,
            values,
        });
    }

    Ok(ChannelData {
        time,
        dist,
        channels: out_channels,
    })
}
