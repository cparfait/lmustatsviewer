//! Outils & diagnostic (catégorie Configuration, désactivée par défaut).
//!
//! 1. **Lanceur d'outils** : programmes choisis par l'utilisateur (SimHub, Crew
//!    Chief, OpenKneeboard…) lancés quand LMU démarre, et — option par outil —
//!    fermés quand LMU s'arrête. Un thread de surveillance regarde toutes les
//!    3 s si « Le Mans Ultimate.exe » tourne (instantané ToolHelp32, aucun
//!    processus lancé pour ça) et réagit aux seuls **fronts** démarré / arrêté.
//!    Garde-fous : lancement sans élévation de droits (un outil qui exige
//!    l'administrateur échoue proprement), pas de relance d'un outil déjà
//!    ouvert (même nom d'exe), fermeture **douce** (`taskkill` sans `/F` =
//!    demande de fermeture) et uniquement des processus lancés par l'app
//!    (handle conservé : pas de confusion de PID recyclé).
//! 2. **Diagnostic PC** : **lecture seule**, aucun fichier modifié. Chaque point
//!    renvoie `id` + `status` ; les textes sont traduits côté front, `detail`
//!    ne porte que des valeurs brutes (chemins, numéros, clés lues).

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::db::{self, DbState};
use crate::error::AppError;

/// Nom du processus du jeu surveillé.
pub const LMU_PROCESS: &str = "Le Mans Ultimate.exe";
/// Identifiant Steam de Le Mans Ultimate (`appmanifest_2399420.acf`).
pub const LMU_STEAM_APPID: u32 = 2399420;
/// Cadence de la surveillance.
const WATCH_EVERY: Duration = Duration::from_secs(3);
/// Pas de fenêtre console (outils console, `reg`, `taskkill`).
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// `ERROR_ELEVATION_REQUIRED` : l'exe exige les droits administrateur.
const ERROR_ELEVATION_REQUIRED: i32 = 740;
/// Sous-système PE « console » (`IMAGE_SUBSYSTEM_WINDOWS_CUI`).
const PE_SUBSYSTEM_CONSOLE: u16 = 3;
/// Nom du plugin de mémoire partagée attendu par l'app.
const PLUGIN_DLL: &str = "rFactor2SharedMemoryMapPlugin64.dll";

// ═══════════════════════════════════════════════════════════════════════════
// Configuration du lanceur (clé de config `tools_launcher`, JSON écrit par le front)
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ToolEntry {
    pub path: String,
    /// Fermer l'outil quand LMU s'arrête (défaut : non).
    #[serde(default)]
    pub close_with_lmu: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct LauncherConfig {
    /// Interrupteur global (défaut : désactivé).
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub tools: Vec<ToolEntry>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LaunchedTool {
    pub path: String,
    pub pid: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct LauncherStatus {
    /// Le thread de surveillance tourne.
    pub active: bool,
    /// LMU vu en cours d'exécution au dernier passage.
    pub lmu_running: bool,
    /// Outils lancés par l'app et encore ouverts.
    pub launched: Vec<LaunchedTool>,
    /// Dernière erreur brute (`chemin : raison`), pour affichage.
    pub last_error: Option<String>,
}

struct Launched {
    path: String,
    child: Child,
}

struct State {
    config: LauncherConfig,
    watcher_alive: bool,
    lmu_running: bool,
    launched: Vec<Launched>,
    last_error: Option<String>,
}

static STATE: Mutex<State> = Mutex::new(State {
    config: LauncherConfig { enabled: false, tools: Vec::new() },
    watcher_alive: false,
    lmu_running: false,
    launched: Vec::new(),
    last_error: None,
});

fn state() -> MutexGuard<'static, State> {
    // Un panic sous verrou ne doit pas condamner le lanceur.
    STATE.lock().unwrap_or_else(|e| e.into_inner())
}

// ═══════════════════════════════════════════════════════════════════════════
// Logique pure (testée)
// ═══════════════════════════════════════════════════════════════════════════

/// Front de l'état « LMU tourne » entre deux passages.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Edge {
    None,
    Started,
    Stopped,
}

pub fn edge(was_running: bool, now_running: bool) -> Edge {
    match (was_running, now_running) {
        (false, true) => Edge::Started,
        (true, false) => Edge::Stopped,
        _ => Edge::None,
    }
}

/// Nom de fichier de l'exe (`C:\x\SimHubWPF.exe` → `SimHubWPF.exe`).
pub fn exe_name(path: &str) -> String {
    path.rsplit(['\\', '/']).next().unwrap_or("").trim().to_string()
}

/// Un processus de ce nom (insensible à la casse) figure-t-il dans la liste ?
pub fn is_process_running(names: &[String], exe: &str) -> bool {
    !exe.is_empty() && names.iter().any(|n| n.eq_ignore_ascii_case(exe))
}

/// Sous-système PE d'un exécutable (2 = fenêtré, 3 = console), lu dans l'en-tête.
pub fn pe_subsystem(bytes: &[u8]) -> Option<u16> {
    if bytes.get(0..2)? != b"MZ" {
        return None;
    }
    let lfanew = u32::from_le_bytes(bytes.get(0x3C..0x40)?.try_into().ok()?) as usize;
    if bytes.get(lfanew..lfanew.checked_add(4)?)? != b"PE\0\0" {
        return None;
    }
    // Signature (4) + en-tête COFF (20) + champ Subsystem à l'offset 68 de
    // l'en-tête optionnel (identique en PE32 et PE32+).
    let off = lfanew + 4 + 20 + 68;
    let s = bytes.get(off..off + 2)?;
    Some(u16::from_le_bytes([s[0], s[1]]))
}

/// Lignes de clés renvoyées par `reg query … /s /f …` (celles qui commencent par `HKEY_`).
pub fn parse_reg_keys(out: &str) -> Vec<String> {
    out.lines()
        .map(str::trim)
        .filter(|l| l.starts_with("HKEY_"))
        .map(str::to_string)
        .collect()
}

/// Valeur `REG_SZ` / `REG_EXPAND_SZ` d'une sortie `reg query <clé> /v <nom>`.
pub fn parse_reg_value(out: &str, name: &str) -> Option<String> {
    for line in out.lines() {
        let l = line.trim_start();
        if !l.to_ascii_lowercase().starts_with(&name.to_ascii_lowercase()) {
            continue;
        }
        for kind in ["REG_EXPAND_SZ", "REG_SZ"] {
            if let Some(idx) = l.find(kind) {
                let v = l[idx + kind.len()..].trim();
                if !v.is_empty() {
                    return Some(v.to_string());
                }
            }
        }
    }
    None
}

/// `DisplayIcon` d'une entrée de désinstallation → chemin d'exe (`"C:\a.exe",0` → `C:\a.exe`).
pub fn clean_display_icon(v: &str) -> String {
    let v = v.trim();
    let v = match v.rfind(',') {
        Some(i) if v[i + 1..].trim().parse::<i32>().is_ok() => &v[..i],
        _ => v,
    };
    v.trim().trim_matches('"').trim().to_string()
}

/// État du plugin dans `CustomPluginVariables.JSON`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PluginState {
    Enabled,
    Disabled,
    /// Pas d'entrée pour ce plugin (le jeu ne l'a pas encore vu).
    Missing,
}

fn truthy(v: &Value) -> Option<bool> {
    match v {
        Value::Bool(b) => Some(*b),
        Value::Number(n) => n.as_f64().map(|x| x != 0.0),
        Value::String(s) => s.trim().parse::<f64>().ok().map(|x| x != 0.0),
        _ => None,
    }
}

/// Lecture tolérante de `" Enabled"` (avec l'espace que le jeu met devant) pour
/// le plugin `dll`. JSON d'abord ; repli texte si le fichier n'est pas strict.
pub fn parse_plugin_enabled(text: &str, dll: &str) -> PluginState {
    let text = text.trim_start_matches('\u{feff}');
    if let Ok(Value::Object(root)) = serde_json::from_str::<Value>(text) {
        let Some(entry) = root.iter().find(|(k, _)| k.trim().eq_ignore_ascii_case(dll)).map(|(_, v)| v)
        else {
            return PluginState::Missing;
        };
        let enabled = entry
            .as_object()
            .and_then(|o| o.iter().find(|(k, _)| k.trim().eq_ignore_ascii_case("enabled")))
            .and_then(|(_, v)| truthy(v));
        return if enabled == Some(true) { PluginState::Enabled } else { PluginState::Disabled };
    }
    // Repli : recherche textuelle (fichier édité à la main, virgule en trop…).
    let lower = text.to_ascii_lowercase();
    let Some(start) = lower.find(&format!("\"{}\"", dll.to_ascii_lowercase())) else {
        return PluginState::Missing;
    };
    let rest = &lower[start..];
    let block = &rest[..rest.find('}').unwrap_or(rest.len())];
    let Some(k) = block.find("enabled\"") else { return PluginState::Disabled };
    let after = &block[k + "enabled\"".len()..];
    let value: String = after
        .trim_start()
        .trim_start_matches(':')
        .trim_start()
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '.')
        .collect();
    let on = value == "true" || value.parse::<f64>().map(|x| x != 0.0).unwrap_or(false);
    if on { PluginState::Enabled } else { PluginState::Disabled }
}

/// Valeur entière d'une clé `Clé=valeur` d'un .ini du jeu (insensible à la
/// casse ; commentaires `//` ignorés). Première occurrence.
pub fn ini_int(text: &str, key: &str) -> Option<i64> {
    for line in text.lines() {
        let Some((k, v)) = line.split_once('=') else { continue };
        if !k.trim().eq_ignore_ascii_case(key) {
            continue;
        }
        let v = v.split("//").next().unwrap_or("").trim();
        let num: String = v.chars().take_while(|c| c.is_ascii_digit() || *c == '-').collect();
        if let Ok(n) = num.parse() {
            return Some(n);
        }
    }
    None
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DisplayMode {
    /// Plein écran exclusif : les overlays de bureau ne s'affichent pas par-dessus.
    Fullscreen,
    /// Fenêtre sans bordure (conseillé pour les overlays).
    Borderless,
    /// Fenêtré classique.
    Windowed,
}

/// Mode d'affichage d'après `WindowedMode` / `Borderless` de `Config_DX11.ini`.
pub fn classify_display(windowed: Option<i64>, borderless: Option<i64>) -> Option<DisplayMode> {
    if borderless.is_some_and(|b| b != 0) {
        return Some(DisplayMode::Borderless);
    }
    match windowed? {
        0 => Some(DisplayMode::Fullscreen),
        _ => Some(DisplayMode::Windowed),
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Processus (Windows)
// ═══════════════════════════════════════════════════════════════════════════

/// Noms des exécutables en cours (instantané ToolHelp32). `None` si l'instantané échoue.
#[cfg(windows)]
pub fn process_names() -> Option<Vec<String>> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    // SAFETY : appels Win32 sur un handle local, fermé avant de sortir ; la
    // structure est initialisée avec sa taille comme l'exige l'API.
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let mut names = Vec::new();
        if Process32FirstW(snap, &mut entry).is_ok() {
            loop {
                let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                names.push(String::from_utf16_lossy(&entry.szExeFile[..len]));
                if Process32NextW(snap, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snap);
        Some(names)
    }
}

#[cfg(not(windows))]
pub fn process_names() -> Option<Vec<String>> {
    None
}

/// LMU tourne-t-il ? (`false` si l'instantané échoue.)
pub fn lmu_running() -> bool {
    process_names().is_some_and(|n| is_process_running(&n, LMU_PROCESS))
}

fn is_console_exe(path: &Path) -> bool {
    use std::io::Read;
    let Ok(f) = std::fs::File::open(path) else { return false };
    let mut head = Vec::with_capacity(8192);
    if f.take(8192).read_to_end(&mut head).is_err() {
        return false;
    }
    pe_subsystem(&head) == Some(PE_SUBSYSTEM_CONSOLE)
}

/// Lance un outil, sans élévation (`CreateProcess` simple), dossier de travail
/// = dossier de l'exe. Erreurs brutes : `not_found`, `not_exe`,
/// `elevation_required`, ou le message système.
fn spawn_tool(path: &str) -> Result<Child, String> {
    let p = Path::new(path.trim());
    let is_exe = p.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe"));
    if !is_exe {
        return Err("not_exe".into());
    }
    if !p.is_file() {
        return Err("not_found".into());
    }
    let mut cmd = Command::new(p);
    if let Some(dir) = p.parent() {
        cmd.current_dir(dir);
    }
    cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    if is_console_exe(p) {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = is_console_exe;
    cmd.spawn().map_err(|e| {
        if e.raw_os_error() == Some(ERROR_ELEVATION_REQUIRED) {
            "elevation_required".to_string()
        } else {
            e.to_string()
        }
    })
}

/// Demande de fermeture douce (`taskkill /PID` sans `/F` : message de fermeture
/// envoyé aux fenêtres du processus, qui peut enregistrer ses réglages).
#[cfg(windows)]
fn close_gently(pid: u32) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let out = Command::new("taskkill")
        .args(["/PID", &pid.to_string()])
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(format!("taskkill {}", out.status.code().unwrap_or(-1)))
    }
}

#[cfg(not(windows))]
fn close_gently(_pid: u32) -> Result<(), String> {
    Err("unsupported".into())
}

// ═══════════════════════════════════════════════════════════════════════════
// Surveillance
// ═══════════════════════════════════════════════════════════════════════════

/// Retire de la liste les outils lancés qui se sont fermés depuis.
fn reap(st: &mut State) {
    st.launched.retain_mut(|l| matches!(l.child.try_wait(), Ok(None)));
}

fn launch_all(tools: &[ToolEntry], running: &[String]) {
    for tool in tools {
        let path = tool.path.trim();
        if path.is_empty() || is_process_running(running, &exe_name(path)) {
            continue;
        }
        match spawn_tool(path) {
            Ok(child) => state().launched.push(Launched { path: path.to_string(), child }),
            Err(e) => state().last_error = Some(format!("{path} : {e}")),
        }
    }
}

fn close_launched() {
    let to_close: Vec<Launched> = {
        let mut st = state();
        reap(&mut st);
        let tools = st.config.tools.clone();
        let wants_close = |path: &str| {
            tools.iter().any(|t| t.close_with_lmu && t.path.trim().eq_ignore_ascii_case(path))
        };
        let (close, keep): (Vec<_>, Vec<_>) = st.launched.drain(..).partition(|l| wants_close(&l.path));
        st.launched = keep;
        close
    };
    for l in to_close {
        if let Err(e) = close_gently(l.child.id()) {
            state().last_error = Some(format!("{} : {e}", l.path));
        }
        // Le `Child` est relâché sans tuer le processus (comportement de std).
    }
}

fn watch_loop() {
    loop {
        let names = process_names();
        let (todo, tools) = {
            let mut st = state();
            if !st.config.enabled {
                st.watcher_alive = false;
                return;
            }
            reap(&mut st);
            match &names {
                Some(n) => {
                    let now = is_process_running(n, LMU_PROCESS);
                    let e = edge(st.lmu_running, now);
                    st.lmu_running = now;
                    (e, st.config.tools.clone())
                }
                // Instantané raté : on garde l'état précédent (pas de faux front).
                None => (Edge::None, Vec::new()),
            }
        };
        match todo {
            Edge::Started => launch_all(&tools, names.as_deref().unwrap_or(&[])),
            Edge::Stopped => close_launched(),
            Edge::None => {}
        }
        std::thread::sleep(WATCH_EVERY);
    }
}

fn status_of(st: &mut State) -> LauncherStatus {
    reap(st);
    LauncherStatus {
        active: st.watcher_alive,
        lmu_running: st.lmu_running,
        launched: st
            .launched
            .iter()
            .map(|l| LaunchedTool { path: l.path.clone(), pid: l.child.id() })
            .collect(),
        last_error: st.last_error.clone(),
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Commandes du lanceur
// ═══════════════════════════════════════════════════════════════════════════

/// Applique la configuration du lanceur (la persistance `tools_launcher` est
/// faite par le front). Démarre la surveillance si activée, l'arrête sinon
/// (au passage suivant). Les outils déjà ouverts ne sont pas touchés.
/// Si LMU tourne déjà au moment de l'activation, ses outils sont lancés.
#[tauri::command]
pub fn tools_set_launcher(config: LauncherConfig) -> LauncherStatus {
    let mut st = state();
    let enable = config.enabled && config.tools.iter().any(|t| !t.path.trim().is_empty());
    st.config = LauncherConfig { enabled: enable, tools: config.tools };
    if enable && !st.watcher_alive {
        st.watcher_alive = true;
        st.lmu_running = false;
        st.last_error = None;
        if std::thread::Builder::new()
            .name("tools-launcher".into())
            .spawn(watch_loop)
            .is_err()
        {
            st.watcher_alive = false;
            st.last_error = Some("thread".into());
        }
    }
    status_of(&mut st)
}

#[tauri::command]
pub fn tools_launcher_status() -> LauncherStatus {
    status_of(&mut state())
}

/// LMU est-il lancé ? (bouton « Jouer » de l'en-tête).
#[tauri::command]
pub fn lmu_is_running() -> bool {
    lmu_running()
}

/// Un autre ingénieur radio tourne-t-il ? Sert au mode « cohabitation » : l'app
/// coupe alors son spotter et ses annonces en doublon, et garde le reste.
#[tauri::command]
pub fn other_engineer_running() -> bool {
    let Some(names) = process_names() else {
        return false;
    };
    KNOWN
        .iter()
        .filter(|k| k.radio_engineer)
        .any(|k| is_process_running(&names, k.exe))
}

/// Bouton « Jouer » : lance LMU par Steam (`steam://rungameid/…` : Steam gère les mises à
/// jour, l'anti-triche et les options de lancement), comme depuis la bibliothèque. Si
/// Steam ne prend pas la main, lance l'exe du dossier détecté. Rien si LMU tourne déjà.
/// Renvoie `running`, `steam` ou `exe`.
#[tauri::command(async)]
pub async fn launch_lmu(lmu_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if lmu_running() {
            return Ok("running".to_string());
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let url = format!("steam://rungameid/{LMU_STEAM_APPID}");
            let ok = Command::new("cmd")
                .args(["/C", "start", "", &url])
                .creation_flags(CREATE_NO_WINDOW)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map(|s| s.success())
                .unwrap_or(false);
            if ok {
                return Ok("steam".to_string());
            }
        }
        let exe = Path::new(lmu_path.trim()).join(LMU_PROCESS);
        spawn_tool(&exe.to_string_lossy()).map(|_| "exe".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Bouton « Tester » : lance l'outil tout de suite. `false` = déjà ouvert
/// (rien n'est relancé). L'outil n'est pas rattaché au cycle de LMU.
#[tauri::command(async)]
pub async fn tools_launch_now(path: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let names = process_names().unwrap_or_default();
        if is_process_running(&names, &exe_name(&path)) {
            return Ok(false);
        }
        spawn_tool(&path).map(|_| true)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ═══════════════════════════════════════════════════════════════════════════
// Détection des outils connus
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize)]
pub struct KnownTool {
    pub id: &'static str,
    pub name: &'static str,
    pub path: String,
}

struct KnownSpec {
    id: &'static str,
    name: &'static str,
    exe: &'static str,
    /// Chemins relatifs aux dossiers Program Files / Programs.
    rel: &'static [&'static str],
    /// Texte cherché dans les entrées de désinstallation du registre.
    needle: &'static str,
    /// L'outil est lui-même un ingénieur radio (annonces vocales) : mode cohabitation.
    radio_engineer: bool,
}

const KNOWN: [KnownSpec; 3] = [
    KnownSpec {
        id: "openkneeboard",
        name: "OpenKneeboard",
        exe: "OpenKneeboardApp.exe",
        rel: &[r"OpenKneeboard\bin\OpenKneeboardApp.exe"],
        needle: "OpenKneeboard",
        radio_engineer: false,
    },
    KnownSpec {
        id: "simhub",
        name: "SimHub",
        exe: "SimHubWPF.exe",
        rel: &[r"SimHub\SimHubWPF.exe"],
        needle: "SimHub",
        radio_engineer: false,
    },
    KnownSpec {
        id: "crewchief",
        name: "Crew Chief",
        exe: "CrewChiefV4.exe",
        rel: &[r"Britton IT Ltd\CrewChiefV4\CrewChiefV4.exe"],
        needle: "CrewChief",
        radio_engineer: true,
    },
];

fn program_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    for var in ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"] {
        if let Some(v) = std::env::var_os(var) {
            dirs.push(PathBuf::from(v));
        }
    }
    if let Some(v) = std::env::var_os("LOCALAPPDATA") {
        dirs.push(PathBuf::from(v).join("Programs"));
    }
    for fb in [r"C:\Program Files", r"C:\Program Files (x86)"] {
        dirs.push(PathBuf::from(fb));
    }
    let mut seen = Vec::new();
    dirs.retain(|d| {
        let k = d.to_string_lossy().to_ascii_lowercase();
        let fresh = !seen.contains(&k);
        seen.push(k);
        fresh
    });
    dirs
}

#[cfg(windows)]
fn reg_query(args: &[&str]) -> String {
    use std::os::windows::process::CommandExt;
    Command::new("reg")
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default()
}

/// Repli registre : entrées de désinstallation qui mentionnent `needle` →
/// `InstallLocation` (+ `bin\`) ou `DisplayIcon` pointant vers l'exe attendu.
#[cfg(windows)]
fn find_in_uninstall(spec: &KnownSpec) -> Option<PathBuf> {
    const ROOTS: [&str; 3] = [
        r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        r"HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
    ];
    for root in ROOTS {
        for key in parse_reg_keys(&reg_query(&["query", root, "/s", "/f", spec.needle, "/d"])) {
            if let Some(loc) = parse_reg_value(&reg_query(&["query", &key, "/v", "InstallLocation"]), "InstallLocation") {
                let loc = PathBuf::from(loc.trim_matches('"'));
                for cand in [loc.join(spec.exe), loc.join("bin").join(spec.exe)] {
                    if cand.is_file() {
                        return Some(cand);
                    }
                }
            }
            if let Some(icon) = parse_reg_value(&reg_query(&["query", &key, "/v", "DisplayIcon"]), "DisplayIcon") {
                let cand = PathBuf::from(clean_display_icon(&icon));
                if exe_name(&cand.to_string_lossy()).eq_ignore_ascii_case(spec.exe) && cand.is_file() {
                    return Some(cand);
                }
            }
        }
    }
    None
}

#[cfg(not(windows))]
fn find_in_uninstall(_spec: &KnownSpec) -> Option<PathBuf> {
    None
}

fn detect_known() -> Vec<KnownTool> {
    let dirs = program_dirs();
    KNOWN
        .iter()
        .filter_map(|spec| {
            let found = dirs
                .iter()
                .flat_map(|d| spec.rel.iter().map(move |r| d.join(r)))
                .find(|p| p.is_file())
                .or_else(|| find_in_uninstall(spec))?;
            Some(KnownTool { id: spec.id, name: spec.name, path: found.to_string_lossy().to_string() })
        })
        .collect()
}

/// Outils connus trouvés sur le disque (seulement ceux qui existent).
#[tauri::command(async)]
pub async fn tools_detect_known() -> Result<Vec<KnownTool>, String> {
    tauri::async_runtime::spawn_blocking(detect_known).await.map_err(|e| e.to_string())
}

// ═══════════════════════════════════════════════════════════════════════════
// Diagnostic PC (lecture seule)
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize)]
pub struct DiagItem {
    pub id: &'static str,
    /// `ok` | `warn` | `error` | `info`.
    pub status: &'static str,
    /// Valeurs brutes seulement (chemins, numéros, clés lues).
    pub detail: String,
}

fn item(id: &'static str, status: &'static str, detail: impl Into<String>) -> DiagItem {
    DiagItem { id, status, detail: detail.into() }
}

fn configured_lmu_path(app: &AppHandle) -> Option<String> {
    let db = app.try_state::<DbState>()?;
    db::config_get(&db, "lmu_path").ok().flatten().filter(|p| !p.trim().is_empty())
}

fn last_game_version(app: &AppHandle) -> Option<String> {
    let db = app.try_state::<DbState>()?;
    let conn = db::get_conn(&db).ok()?;
    conn.query_row(
        "SELECT game_version FROM sessions WHERE game_version <> '' ORDER BY timestamp DESC LIMIT 1",
        [],
        |r| r.get::<_, String>(0),
    )
    .ok()
}

fn run_diagnostic(app: &AppHandle) -> Vec<DiagItem> {
    let mut items = Vec::new();

    // ── Dossier du jeu ──
    let configured = configured_lmu_path(app);
    let lmu = configured
        .clone()
        .filter(|p| Path::new(p).is_dir())
        .or_else(|| crate::commands::config::detect_lmu().ok().map(|d| d.lmu_path));
    match &lmu {
        Some(p) => items.push(item("lmu_folder", "ok", p.clone())),
        None => items.push(item("lmu_folder", "error", configured.unwrap_or_default())),
    }

    if let Some(lmu) = &lmu {
        let root = PathBuf::from(lmu);
        let results = root.join("UserData").join("Log").join("Results");
        let st = if results.is_dir() { "ok" } else { "error" };
        items.push(item("results_folder", st, results.to_string_lossy()));

        // ── Plugin de mémoire partagée ──
        let dll = root.join("Plugins").join(PLUGIN_DLL);
        let st = if crate::commands::system::check_plugin_installed(lmu.clone()) { "ok" } else { "error" };
        items.push(item("plugin_file", st, dll.to_string_lossy()));

        let json = root.join("UserData").join("player").join("CustomPluginVariables.JSON");
        let state = std::fs::read(&json)
            .map(|b| parse_plugin_enabled(&String::from_utf8_lossy(&b), PLUGIN_DLL))
            .unwrap_or(PluginState::Missing);
        let st = match state {
            PluginState::Enabled => "ok",
            PluginState::Disabled => "warn",
            PluginState::Missing => "error",
        };
        items.push(item("plugin_enabled", st, json.to_string_lossy()));

        // ── Mode d'affichage + VSync (UserData/Config_DX11.ini, écran ; la VR
        //    a son propre Config_DX11_VR.ini, sans effet sur les overlays) ──
        let ini = root.join("UserData").join("Config_DX11.ini");
        match std::fs::read(&ini) {
            Ok(b) => {
                let text = String::from_utf8_lossy(&b);
                let windowed = ini_int(&text, "WindowedMode");
                let borderless = ini_int(&text, "Borderless");
                let show = |v: Option<i64>| v.map(|n| n.to_string()).unwrap_or_else(|| "?".into());
                let detail = format!(
                    "{} · WindowedMode={} · Borderless={}",
                    ini.to_string_lossy(),
                    show(windowed),
                    show(borderless)
                );
                let st = match classify_display(windowed, borderless) {
                    Some(DisplayMode::Fullscreen) => "warn",
                    Some(DisplayMode::Borderless) => "ok",
                    Some(DisplayMode::Windowed) => "info",
                    None => "error",
                };
                items.push(item("display_mode", st, detail));
                if let Some(v) = ini_int(&text, "VSyncMode") {
                    items.push(item("vsync", if v == 0 { "ok" } else { "info" }, format!("VSyncMode={v}")));
                }
            }
            Err(_) => items.push(item("display_mode", "error", ini.to_string_lossy())),
        }
    }

    // ── API REST du jeu : seulement si LMU tourne, route réputée sûre ──
    if lmu_running() {
        use crate::commands::lmu_rest::{self, FetchError};
        let base = lmu_rest::loopback_base(lmu_rest::LMU_REST_PORT);
        let st = match lmu_rest::build_client().map(|c| lmu_rest::fetch_json(&c, &base, lmu_rest::ROUTE_SESSION)) {
            Some(Ok(_)) | Some(Err(FetchError::Empty)) => "ok",
            _ => "warn",
        };
        items.push(item("rest_api", st, base));
    }

    // ── OpenKneeboard (VR) ──
    match detect_known().into_iter().find(|t| t.id == "openkneeboard") {
        Some(t) => items.push(item("openkneeboard", "ok", t.path)),
        None => items.push(item("openkneeboard", "info", "")),
    }

    // ── Versions ──
    items.push(item("app_version", "info", env!("APP_VERSION")));
    if let Some(v) = last_game_version(app) {
        items.push(item("game_version", "info", v));
    }
    items
}

/// Diagnostic du PC : lecture seule, aucun fichier modifié.
#[tauri::command(async)]
pub async fn pc_diagnostic(app: AppHandle) -> Result<Vec<DiagItem>, AppError> {
    tauri::async_runtime::spawn_blocking(move || run_diagnostic(&app))
        .await
        .map_err(|e| AppError::Internal(format!("pc_diagnostic: {e}")))
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tools_edges() {
        assert_eq!(edge(false, true), Edge::Started);
        assert_eq!(edge(true, false), Edge::Stopped);
        assert_eq!(edge(true, true), Edge::None);
        assert_eq!(edge(false, false), Edge::None);
    }

    #[test]
    fn tools_exe_name_and_running() {
        assert_eq!(exe_name(r"C:\Program Files (x86)\SimHub\SimHubWPF.exe"), "SimHubWPF.exe");
        assert_eq!(exe_name("C:/a/b.exe"), "b.exe");
        let names = vec!["System".to_string(), "le mans ultimate.EXE".to_string()];
        assert!(is_process_running(&names, LMU_PROCESS));
        assert!(!is_process_running(&names, "SimHubWPF.exe"));
        assert!(!is_process_running(&names, ""));
    }

    fn pe(subsystem: u16) -> Vec<u8> {
        let mut b = vec![0u8; 0x200];
        b[0..2].copy_from_slice(b"MZ");
        b[0x3C..0x40].copy_from_slice(&0x80u32.to_le_bytes());
        b[0x80..0x84].copy_from_slice(b"PE\0\0");
        let off = 0x80 + 4 + 20 + 68;
        b[off..off + 2].copy_from_slice(&subsystem.to_le_bytes());
        b
    }

    #[test]
    fn tools_pe_subsystem() {
        assert_eq!(pe_subsystem(&pe(3)), Some(PE_SUBSYSTEM_CONSOLE));
        assert_eq!(pe_subsystem(&pe(2)), Some(2));
        assert_eq!(pe_subsystem(b"not a pe"), None);
        let mut broken = pe(3);
        broken[0x3C..0x40].copy_from_slice(&0xFFFF_FF00u32.to_le_bytes());
        assert_eq!(pe_subsystem(&broken), None);
    }

    #[test]
    fn tools_reg_parsing() {
        let search = "\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{019253FE}_is1\r\n    InstallLocation    REG_SZ    C:\\Program Files (x86)\\SimHub\\\r\n\r\nFin de la recherche : 1 correspondance(s) trouvée(s).\r\n";
        let keys = parse_reg_keys(search);
        assert_eq!(keys.len(), 1);
        assert!(keys[0].ends_with("{019253FE}_is1"));
        assert_eq!(
            parse_reg_value(search, "InstallLocation").as_deref(),
            Some("C:\\Program Files (x86)\\SimHub\\")
        );
        let icon = "    DisplayIcon    REG_EXPAND_SZ    \"C:\\Apps\\Tool.exe\",0\r\n";
        assert_eq!(parse_reg_value(icon, "DisplayIcon").as_deref(), Some("\"C:\\Apps\\Tool.exe\",0"));
        assert_eq!(clean_display_icon("\"C:\\Apps\\Tool.exe\",0"), "C:\\Apps\\Tool.exe");
        assert_eq!(clean_display_icon("C:\\Apps,x\\Tool.exe"), "C:\\Apps,x\\Tool.exe");
        assert_eq!(parse_reg_value("ERREUR : clé introuvable", "InstallLocation"), None);
    }

    #[test]
    fn tools_plugin_enabled_json() {
        let on = r#"{ "ChatTransceiver.dll": { " Enabled": 0 },
            "rFactor2SharedMemoryMapPlugin64.dll": { " Enabled": 1, "DebugOutputLevel": 0 } }"#;
        assert_eq!(parse_plugin_enabled(on, PLUGIN_DLL), PluginState::Enabled);
        let off = r#"{ "rFactor2SharedMemoryMapPlugin64.dll": { " Enabled": 0 } }"#;
        assert_eq!(parse_plugin_enabled(off, PLUGIN_DLL), PluginState::Disabled);
        let other = r#"{ "ChatTransceiver.dll": { " Enabled": 1 } }"#;
        assert_eq!(parse_plugin_enabled(other, PLUGIN_DLL), PluginState::Missing);
        let bom = "\u{feff}{ \"rFactor2SharedMemoryMapPlugin64.dll\": { \" Enabled\": true } }";
        assert_eq!(parse_plugin_enabled(bom, PLUGIN_DLL), PluginState::Enabled);
    }

    #[test]
    fn tools_plugin_enabled_tolerant() {
        // Virgule en trop : JSON invalide → repli textuel.
        let on = "{ \"rFactor2SharedMemoryMapPlugin64.dll\": { \" Enabled\": 1, }, }";
        assert_eq!(parse_plugin_enabled(on, PLUGIN_DLL), PluginState::Enabled);
        let off = "{ \"rFactor2SharedMemoryMapPlugin64.dll\": { \" Enabled\" : 0, }, \"x.dll\": { \" Enabled\": 1 } }";
        assert_eq!(parse_plugin_enabled(off, PLUGIN_DLL), PluginState::Disabled);
        assert_eq!(parse_plugin_enabled("{ broken", PLUGIN_DLL), PluginState::Missing);
    }

    #[test]
    fn tools_ini_and_display() {
        let ini = "//[[gMa1.002f (c)2016    ]]\n[COMPONENTS]\nVideoRefreshRate=240\nWindowedMode=1\nBorderless=0\nVSyncMode=0 // off\n";
        assert_eq!(ini_int(ini, "windowedmode"), Some(1));
        assert_eq!(ini_int(ini, "Borderless"), Some(0));
        assert_eq!(ini_int(ini, "VSyncMode"), Some(0));
        assert_eq!(ini_int(ini, "Missing"), None);
        assert_eq!(classify_display(Some(0), Some(0)), Some(DisplayMode::Fullscreen));
        assert_eq!(classify_display(Some(1), Some(1)), Some(DisplayMode::Borderless));
        assert_eq!(classify_display(Some(0), Some(1)), Some(DisplayMode::Borderless));
        assert_eq!(classify_display(Some(1), Some(0)), Some(DisplayMode::Windowed));
        assert_eq!(classify_display(None, None), None);
    }

    #[cfg(windows)]
    #[test]
    fn tools_process_snapshot_sees_itself() {
        let me = std::env::current_exe().unwrap();
        let me = exe_name(&me.to_string_lossy());
        let names = process_names().expect("instantané ToolHelp32");
        assert!(is_process_running(&names, &me), "{me} absent de l'instantané");
    }

    #[test]
    fn tools_config_defaults() {
        let c: LauncherConfig = serde_json::from_str(r#"{"tools":[{"path":"C:\\a.exe"}]}"#).unwrap();
        assert!(!c.enabled);
        assert!(!c.tools[0].close_with_lmu);
    }
}
