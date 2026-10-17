//! Journal applicatif sur disque + export d'un rapport de bug.
//!
//! Pourquoi : jusqu'ici le backend n'écrivait qu'avec `eprintln!`, invisible dans
//! l'application installée (pas de console). Quand un utilisateur signale un
//! problème, il n'y avait rien à joindre. Ce module garde un fichier
//! `logs/app.log` (rotation par taille, 3 archives), consigne aussi les paniques
//! (le profil release fait `panic = "abort"` : le hook s'exécute quand même avant
//! l'arrêt), et assemble à la demande une archive zip prête à envoyer.
//!
//! Le rapport ne contient que des fichiers du dossier de données de l'app, et la
//! configuration y est **expurgée** : toute clé qui ressemble à un secret est
//! retirée, les valeurs longues (jetons, blobs) sont remplacées par leur taille.
//!
//! Tant que `init` n'a pas été appelé, `write` ne fait rien (et ne panique
//! jamais) : les macros peuvent être utilisées partout sans précaution.

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use crate::db::{get_conn, DbState};
use crate::error::{AppError, AppResult};

/// Taille à partir de laquelle `app.log` est archivé.
const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;
/// Archives conservées : `app.log.1` (la plus récente) … `app.log.3`.
const KEEP_ROTATED: usize = 3;
const LOG_DIR: &str = "logs";
const LOG_FILE: &str = "app.log";
/// Longueur maximale d'un message venu du frontend (caractères).
const FRONT_MSG_MAX: usize = 2000;
/// Longueur maximale de la source d'un message venu du frontend.
const FRONT_SRC_MAX: usize = 64;
/// Valeur de config plus longue que ça → remplacée par sa taille dans le rapport.
const CONFIG_VALUE_MAX: usize = 200;
/// Fragments de nom de clé qui signalent un secret (comparaison en minuscules).
const SECRET_KEY_PARTS: &[&str] =
    &["key", "token", "secret", "password", "passwd", "api", "vault", "steam", "hmac"];

/// Gravité d'une ligne du journal.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Level {
    Debug,
    Info,
    Warn,
    Error,
}

impl Level {
    pub fn as_str(self) -> &'static str {
        match self {
            Level::Debug => "DEBUG",
            Level::Info => "INFO",
            Level::Warn => "WARN",
            Level::Error => "ERROR",
        }
    }

    /// Niveau envoyé par le frontend ; inconnu → `Info`.
    pub fn parse(s: &str) -> Level {
        match s.trim().to_ascii_lowercase().as_str() {
            "debug" | "trace" => Level::Debug,
            "warn" | "warning" => Level::Warn,
            "error" | "err" | "fatal" => Level::Error,
            _ => Level::Info,
        }
    }
}

// ── Fichier journal avec rotation ────────────────────────────────────────────

struct Logger {
    dir: PathBuf,
    file: File,
    size: u64,
    max_bytes: u64,
}

impl Logger {
    fn open(dir: &Path, max_bytes: u64) -> std::io::Result<Logger> {
        fs::create_dir_all(dir)?;
        let file = OpenOptions::new().create(true).append(true).open(dir.join(LOG_FILE))?;
        let size = file.metadata().map(|m| m.len()).unwrap_or(0);
        Ok(Logger { dir: dir.to_path_buf(), file, size, max_bytes })
    }

    /// Écrit une ligne complète ; archive d'abord si elle ferait dépasser la taille.
    fn append(&mut self, line: &str) {
        let len = line.len() as u64;
        if self.size > 0 && self.size + len > self.max_bytes {
            self.rotate();
        }
        if self.file.write_all(line.as_bytes()).is_ok() {
            self.size += len;
        }
    }

    fn rotate(&mut self) {
        rotate_files(&self.dir, LOG_FILE, KEEP_ROTATED);
        // Le handle ouvert pointe toujours sur l'ancien fichier (renommé) :
        // on repart sur un `app.log` neuf.
        match OpenOptions::new().create(true).append(true).open(self.dir.join(LOG_FILE)) {
            Ok(f) => {
                self.size = f.metadata().map(|m| m.len()).unwrap_or(0);
                self.file = f;
            }
            Err(_) => {
                // Renommage impossible (fichier verrouillé par un tiers) : on
                // continue dans le même fichier plutôt que de perdre des lignes.
                self.size = 0;
            }
        }
    }
}

/// Décale les archives : `base.(keep-1)` → `base.keep` (l'ancienne est écrasée),
/// …, `base` → `base.1`. Les erreurs (fichier absent) sont ignorées.
fn rotate_files(dir: &Path, base: &str, keep: usize) {
    if keep == 0 {
        let _ = fs::remove_file(dir.join(base));
        return;
    }
    let _ = fs::remove_file(dir.join(format!("{base}.{keep}")));
    for i in (1..keep).rev() {
        let _ = fs::rename(dir.join(format!("{base}.{i}")), dir.join(format!("{base}.{}", i + 1)));
    }
    let _ = fs::rename(dir.join(base), dir.join(format!("{base}.1")));
}

static LOGGER: Mutex<Option<Logger>> = Mutex::new(None);

/// Ouvre (en ajout) `<app_data>/logs/app.log`. Peut être rappelé sans risque.
pub fn init(app_data_dir: &Path) {
    let dir = app_data_dir.join(LOG_DIR);
    match Logger::open(&dir, MAX_LOG_BYTES) {
        Ok(l) => {
            let mut g = LOGGER.lock().unwrap_or_else(|e| e.into_inner());
            *g = Some(l);
        }
        Err(e) => eprintln!("[applog] impossible d'ouvrir {}: {e}", dir.display()),
    }
}

/// Une ligne : horodatage local ISO, niveau, source, message. Les lignes de
/// continuation d'un message multi-ligne sont indentées (un `grep` sur le
/// début de ligne reste fiable).
fn format_line(level: Level, source: &str, msg: &str) -> String {
    let ts = chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3f%:z");
    let source = source.strip_prefix("lmustatsviewer_lib::").unwrap_or(source);
    let body = msg.trim_end().replace("\r\n", "\n").replace('\n', "\n    ");
    format!("{ts} {:<5} [{source}] {body}\n", level.as_str())
}

/// Écrit une ligne dans le journal. Sans `init` préalable : ne fait rien.
pub fn write(level: Level, source: &str, msg: &str) {
    write_impl(level, source, msg, false);
}

/// `try_only` : n'attend pas le verrou (hook de panique — la panique a pu
/// survenir pendant une écriture, un `lock` bloquerait alors indéfiniment).
fn write_impl(level: Level, source: &str, msg: &str, try_only: bool) {
    let line = format_line(level, source, msg);
    if cfg!(debug_assertions) {
        eprint!("{line}");
    }
    let guard = if try_only {
        match LOGGER.try_lock() {
            Ok(g) => g,
            Err(std::sync::TryLockError::Poisoned(e)) => e.into_inner(),
            Err(std::sync::TryLockError::WouldBlock) => return,
        }
    } else {
        LOGGER.lock().unwrap_or_else(|e| e.into_inner())
    };
    let mut guard = guard;
    if let Some(l) = guard.as_mut() {
        l.append(&line);
    }
}

/// `app_info!("texte {}", x)` : ligne `INFO`, source = module appelant.
#[macro_export]
macro_rules! app_info {
    ($($arg:tt)*) => {
        $crate::commands::applog::write(
            $crate::commands::applog::Level::Info,
            module_path!(),
            &format!($($arg)*),
        )
    };
}

/// `app_warn!("texte {}", x)` : ligne `WARN`, source = module appelant.
#[macro_export]
macro_rules! app_warn {
    ($($arg:tt)*) => {
        $crate::commands::applog::write(
            $crate::commands::applog::Level::Warn,
            module_path!(),
            &format!($($arg)*),
        )
    };
}

/// `app_error!("texte {}", x)` : ligne `ERROR`, source = module appelant.
#[macro_export]
macro_rules! app_error {
    ($($arg:tt)*) => {
        $crate::commands::applog::write(
            $crate::commands::applog::Level::Error,
            module_path!(),
            &format!($($arg)*),
        )
    };
}

/// Consigne chaque panique (message, emplacement, thread) puis laisse le hook
/// précédent faire son travail (affichage standard).
pub fn install_panic_hook() {
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let payload = info.payload();
        let msg = payload
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| payload.downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "<panique sans message>".to_string());
        let loc = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "?".to_string());
        let thread = std::thread::current().name().unwrap_or("<sans nom>").to_string();
        write_impl(Level::Error, "panic", &format!("thread '{thread}' a paniqué à {loc} : {msg}"), true);
        prev(info);
    }));
}

// ── Messages du frontend ─────────────────────────────────────────────────────

/// Retire les caractères de contrôle (sauf tabulation ; retours à la ligne →
/// espace) et borne la longueur en caractères.
fn sanitize(s: &str, max_chars: usize) -> String {
    s.chars()
        .filter_map(|c| match c {
            '\t' => Some('\t'),
            '\n' | '\r' => Some(' '),
            c if c.is_control() => None,
            c => Some(c),
        })
        .take(max_chars)
        .collect()
}

/// Ligne de journal envoyée par le frontend.
#[tauri::command]
pub fn log_write(level: String, source: String, message: String) {
    let source = sanitize(&source, FRONT_SRC_MAX);
    let source = if source.trim().is_empty() { "front".to_string() } else { format!("front:{}", source.trim()) };
    write(Level::parse(&level), &source, &sanitize(&message, FRONT_MSG_MAX));
}

// ── Rapport de bug ───────────────────────────────────────────────────────────

/// La clé de config ressemble-t-elle à un secret ?
fn is_secret_key(key: &str) -> bool {
    let k = key.to_ascii_lowercase();
    SECRET_KEY_PARTS.iter().any(|p| k.contains(p))
}

/// Configuration expurgée : clés sensibles retirées, valeurs longues résumées.
fn redact_config(rows: Vec<(String, String)>) -> std::collections::BTreeMap<String, String> {
    rows.into_iter()
        .filter(|(k, _)| !is_secret_key(k))
        .map(|(k, v)| {
            let n = v.chars().count();
            let v = if n > CONFIG_VALUE_MAX { format!("<omitted {n} chars>") } else { v };
            (k, v)
        })
        .collect()
}

fn config_json(app: &AppHandle) -> String {
    let rows: Result<Vec<(String, String)>, String> = (|| {
        let db = app.try_state::<DbState>().ok_or("base non initialisée")?;
        let conn = get_conn(&db).map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare("SELECT key, value FROM config").map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?
            .flatten()
            .collect();
        Ok(rows)
    })();
    match rows {
        Ok(rows) => serde_json::to_string_pretty(&redact_config(rows)).unwrap_or_default(),
        Err(e) => serde_json::json!({ "error": e }).to_string(),
    }
}

#[cfg(target_os = "windows")]
fn os_version() -> String {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};

    fn reg(value: &str) -> Option<String> {
        let sub: Vec<u16> = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion"
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let val: Vec<u16> = value.encode_utf16().chain(std::iter::once(0)).collect();
        let mut buf = [0u16; 256];
        let mut size = std::mem::size_of_val(&buf) as u32;
        let rc = unsafe {
            RegGetValueW(
                HKEY_LOCAL_MACHINE,
                PCWSTR(sub.as_ptr()),
                PCWSTR(val.as_ptr()),
                RRF_RT_REG_SZ,
                None,
                Some(buf.as_mut_ptr().cast()),
                Some(&mut size),
            )
        };
        if rc.is_err() {
            return None;
        }
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        let s = String::from_utf16_lossy(&buf[..end]).trim().to_string();
        (!s.is_empty()).then_some(s)
    }

    // `ProductName` dit encore « Windows 10 » sur Windows 11 : le numéro de build
    // (≥ 22000 = Windows 11) est l'information fiable.
    let parts: Vec<String> = [
        reg("ProductName"),
        reg("DisplayVersion"),
        reg("CurrentBuild").map(|b| format!("build {b}")),
    ]
    .into_iter()
    .flatten()
    .collect();
    if parts.is_empty() {
        "Windows (version inconnue)".to_string()
    } else {
        parts.join(" ")
    }
}

#[cfg(not(target_os = "windows"))]
fn os_version() -> String {
    std::env::consts::OS.to_string()
}

fn system_txt(app: &AppHandle) -> String {
    format!(
        "app: {} {}\nos: {} ({})\nlocal_time: {}\n",
        app.package_info().name,
        app.package_info().version,
        os_version(),
        std::env::consts::ARCH,
        chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%:z"),
    )
}

/// Fichier ordinaire (pas un lien) situé sous `root` une fois résolu.
fn is_inside(path: &Path, root: &Path) -> bool {
    let Ok(meta) = fs::symlink_metadata(path) else { return false };
    if !meta.is_file() {
        return false;
    }
    match (path.canonicalize(), root.canonicalize()) {
        (Ok(p), Ok(r)) => p.starts_with(r),
        _ => false,
    }
}

/// Fichier le plus récemment modifié d'un dossier (non récursif).
fn newest_file(dir: &Path) -> Option<PathBuf> {
    fs::read_dir(dir)
        .ok()?
        .flatten()
        .filter_map(|e| {
            let meta = fs::symlink_metadata(e.path()).ok()?;
            meta.is_file().then(|| (meta.modified().ok(), e.path()))
        })
        .max_by_key(|(t, _)| *t)
        .map(|(_, p)| p)
}

fn add_file<W: Write + std::io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    name: &str,
    path: &Path,
) -> AppResult<()> {
    let mut f = File::open(path)?;
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    let opts = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .large_file(len >= u32::MAX as u64);
    zip.start_file(name, opts).map_err(|e| AppError::Internal(format!("zip: {e}")))?;
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        zip.write_all(&buf[..n])?;
    }
    Ok(())
}

fn add_bytes<W: Write + std::io::Seek>(zip: &mut zip::ZipWriter<W>, name: &str, data: &[u8]) -> AppResult<()> {
    let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file(name, opts).map_err(|e| AppError::Internal(format!("zip: {e}")))?;
    zip.write_all(data)?;
    Ok(())
}

/// Assemble `reports/lmu-report-AAAAMMJJ-HHMMSS.zip` (journaux, config
/// expurgée, infos système, et en option le dernier enregistrement brut) et
/// renvoie son chemin absolu.
#[tauri::command(async)]
pub fn export_report(app: AppHandle, include_replay: bool) -> AppResult<String> {
    let data = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Internal(format!("app_data_dir: {e}")))?;
    let reports = data.join("reports");
    fs::create_dir_all(&reports)?;
    let out = reports.join(format!("lmu-report-{}.zip", chrono::Local::now().format("%Y%m%d-%H%M%S")));
    crate::app_info!("export du rapport de bug (replay: {include_replay})");

    let mut zip = zip::ZipWriter::new(File::create(&out)?);

    let logs = data.join(LOG_DIR);
    if let Ok(entries) = fs::read_dir(&logs) {
        let mut files: Vec<PathBuf> = entries.flatten().map(|e| e.path()).filter(|p| is_inside(p, &data)).collect();
        files.sort();
        for p in files {
            let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            add_file(&mut zip, &format!("logs/{name}"), &p)?;
        }
    }

    add_bytes(&mut zip, "config.json", config_json(&app).as_bytes())?;
    add_bytes(&mut zip, "system.txt", system_txt(&app).as_bytes())?;

    if include_replay {
        if let Some(p) = newest_file(&data.join("replays")).filter(|p| is_inside(p, &data)) {
            let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            add_file(&mut zip, &format!("replays/{name}"), &p)?;
        }
    }

    zip.finish().map_err(|e| AppError::Internal(format!("zip: {e}")))?;
    let abs = out.canonicalize().unwrap_or(out);
    // `canonicalize` sous Windows préfixe `\\?\` : inutile (et déroutant) pour l'UI.
    let s = abs.to_string_lossy().into_owned();
    Ok(s.strip_prefix(r"\\?\").map(str::to_string).unwrap_or(s))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "lmu-applog-{tag}-{}-{}",
            std::process::id(),
            chrono::Local::now().timestamp_nanos_opt().unwrap_or(0)
        ));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn rotation_keeps_three_archives() {
        let dir = temp_dir("rot");
        let mut l = Logger::open(&dir, 100).unwrap();
        let line = format!("{}\n", "x".repeat(59)); // 60 octets : une rotation par ligne après la 1re
        for _ in 0..6 {
            l.append(&line);
        }
        let len = |n: &str| fs::metadata(dir.join(n)).map(|m| m.len()).ok();
        assert_eq!(len("app.log"), Some(60));
        assert_eq!(len("app.log.1"), Some(60));
        assert_eq!(len("app.log.2"), Some(60));
        assert_eq!(len("app.log.3"), Some(60));
        assert_eq!(len("app.log.4"), None);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rotation_resumes_existing_size() {
        let dir = temp_dir("resume");
        fs::write(dir.join("app.log"), "y".repeat(90)).unwrap();
        let mut l = Logger::open(&dir, 100).unwrap();
        assert_eq!(l.size, 90);
        l.append("0123456789ab\n");
        assert_eq!(fs::metadata(dir.join("app.log.1")).unwrap().len(), 90);
        assert_eq!(fs::read_to_string(dir.join("app.log")).unwrap(), "0123456789ab\n");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn line_format() {
        let l = format_line(Level::Warn, "lmustatsviewer_lib::commands::live", "a\nb\n");
        assert!(l.contains(" WARN  [commands::live] a\n    b\n"), "{l}");
        assert!(l.ends_with('\n'));
        assert_eq!(l.matches('\n').count(), 2);
    }

    #[test]
    fn write_without_init_is_noop() {
        // Ne doit ni paniquer ni bloquer (le logger global peut ne pas être ouvert).
        write(Level::Info, "test", "rien");
        crate::app_error!("rien non plus {}", 1);
    }

    #[test]
    fn secret_keys_filtered() {
        for k in ["ai_api_key", "OPENAI_KEY", "community_token", "vault_x", "steam_id", "hmac_salt", "user_Password", "passwd", "client_secret"] {
            assert!(is_secret_key(k), "{k}");
        }
        for k in ["player_name", "lmu_path", "system_tray", "voice_input_device"] {
            assert!(!is_secret_key(k), "{k}");
        }
        let long = "z".repeat(201);
        let m = redact_config(vec![
            ("api_url".into(), "http://x".into()),
            ("player_name".into(), "Bob".into()),
            ("blob".into(), long),
            ("edge".into(), "e".repeat(200)),
        ]);
        assert!(!m.contains_key("api_url"));
        assert_eq!(m["player_name"], "Bob");
        assert_eq!(m["blob"], "<omitted 201 chars>");
        assert_eq!(m["edge"].len(), 200);
    }

    #[test]
    fn sanitize_strips_controls() {
        assert_eq!(sanitize("a\tb\nc\r\u{0}d\u{1b}[31m", 100), "a\tb c d[31m");
        assert_eq!(sanitize(&"é".repeat(3000), FRONT_MSG_MAX).chars().count(), 2000);
        assert_eq!(Level::parse("WARNING"), Level::Warn);
        assert_eq!(Level::parse("bogus"), Level::Info);
    }

    #[test]
    fn newest_and_inside() {
        let root = temp_dir("newest");
        let rep = root.join("replays");
        fs::create_dir_all(&rep).unwrap();
        fs::write(rep.join("a.bin"), b"a").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        fs::write(rep.join("b.bin"), b"b").unwrap();
        let n = newest_file(&rep).unwrap();
        assert_eq!(n.file_name().unwrap(), "b.bin");
        assert!(is_inside(&n, &root));
        assert!(!is_inside(&std::env::temp_dir().join("nope-does-not-exist"), &root));
        assert!(newest_file(&root.join("absent")).is_none());
        let _ = fs::remove_dir_all(&root);
    }
}
