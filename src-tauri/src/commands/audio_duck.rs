//! Atténuation du son **du jeu** pendant que l'ingénieur parle (« ducking »).
//!
//! Pourquoi : en course, le moteur couvre la voix de synthèse. Monter la voix ne
//! suffit pas (saturation) ; baisser le volume système couperait aussi la voix.
//! On agit donc sur la seule **session audio** du jeu (mixeur de volume Windows,
//! API WASAPI) : sur chaque sortie active, les sessions dont le processus est
//! `Le Mans Ultimate.exe` sont baissées puis rétablies.
//!
//! Tout le travail COM tourne sur **un seul thread dédié** (MTA), nourri par un
//! canal : les commandes Tauri ne touchent jamais à COM et rendent la main tout
//! de suite (le statut attend au plus ~100 ms, sinon renvoie la dernière valeur
//! connue).
//!
//! Garde-fous :
//!  - les volumes d'origine sont mémorisés au **premier** duck ; les appels
//!    suivants réappliquent le niveau à ces originaux (jamais d'effet cumulé) ;
//!  - Windows **retient** le volume d'une application d'un lancement à l'autre :
//!    un crash pendant le duck laisserait le jeu durablement bas. Un marqueur
//!    `duck_restore.json` (volumes d'origine par exécutable) est donc écrit au
//!    début du duck et effacé à la restauration ; `restore_after_crash`
//!    l'applique au démarrage suivant. Jeu absent à ce moment → la restauration
//!    reste en attente et s'applique dès que ses sessions réapparaissent.

use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// Exécutables dont la session audio est atténuée (comparaison en minuscules).
const GAME_PROCESSES: &[&str] = &["le mans ultimate.exe"];
/// Atténuation maximale : on ne coupe jamais complètement le jeu.
const MAX_LEVEL: f32 = 0.95;
const MARKER_FILE: &str = "duck_restore.json";

// ── Briques pures (testées) ──────────────────────────────────────────────────

/// Fraction de volume à retirer, bornée à `0..=MAX_LEVEL` (NaN → 0).
fn clamp_level(level: f32) -> f32 {
    if level.is_nan() {
        0.0
    } else {
        level.clamp(0.0, MAX_LEVEL)
    }
}

/// Volume d'un scalaire WASAPI (0..=1), NaN → 1.
fn clamp_volume(v: f32) -> f32 {
    if v.is_nan() {
        1.0
    } else {
        v.clamp(0.0, 1.0)
    }
}

/// Volume atténué à partir du volume d'origine.
fn ducked_volume(original: f32, level: f32) -> f32 {
    clamp_volume(original) * (1.0 - clamp_level(level))
}

/// Mémoire des volumes d'origine, par identifiant de session.
#[derive(Default)]
struct Ducker {
    originals: HashMap<String, f32>,
}

impl Ducker {
    fn is_ducked(&self) -> bool {
        !self.originals.is_empty()
    }

    /// Volumes cibles des sessions `(id, volume actuel)`. Une session déjà connue
    /// garde son original ; une nouvelle (jeu relancé, nouvelle sortie) prend son
    /// volume actuel comme original. Renvoie aussi si de nouveaux originaux ont
    /// été mémorisés (→ marqueur à réécrire).
    fn plan_duck(&mut self, sessions: &[(String, f32)], level: f32) -> (Vec<(String, f32)>, bool) {
        let mut added = false;
        let targets = sessions
            .iter()
            .map(|(id, current)| {
                let orig = *self.originals.entry(id.clone()).or_insert_with(|| {
                    added = true;
                    clamp_volume(*current)
                });
                (id.clone(), ducked_volume(orig, level))
            })
            .collect();
        (targets, added)
    }

    /// Volumes à rétablir ; la mémoire est vidée.
    fn plan_unduck(&mut self) -> HashMap<String, f32> {
        std::mem::take(&mut self.originals)
    }
}

/// Contenu de `duck_restore.json`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
struct DuckMarker {
    /// Volume d'origine par nom d'exécutable (minuscules).
    volumes: BTreeMap<String, f32>,
}

impl DuckMarker {
    /// Plusieurs sessions d'un même exécutable : on retient le plus fort (mieux
    /// vaut rétablir un peu trop haut que laisser le jeu trop bas).
    fn insert(&mut self, process: &str, volume: f32) {
        let v = clamp_volume(volume);
        let e = self.volumes.entry(process.to_ascii_lowercase()).or_insert(v);
        *e = e.max(v);
    }

    fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_default()
    }

    /// Lecture tolérante : valeurs hors bornes ramenées dans 0..=1.
    fn from_json(s: &str) -> Option<DuckMarker> {
        let mut m: DuckMarker = serde_json::from_str(s).ok()?;
        m.volumes = m
            .volumes
            .into_iter()
            .map(|(k, v)| (k.to_ascii_lowercase(), clamp_volume(v)))
            .collect();
        Some(m)
    }
}

fn is_game_process(image_name: &str) -> bool {
    let n = image_name.to_ascii_lowercase();
    GAME_PROCESSES.iter().any(|g| *g == n)
}

/// État exposé à l'écran de réglages.
#[derive(Debug, Clone, Copy, Serialize, Default, PartialEq)]
pub struct DuckStatus {
    /// L'API audio de Windows répond.
    pub available: bool,
    /// Sessions audio du jeu trouvées au dernier passage.
    pub game_sessions: u32,
    /// Le jeu est actuellement atténué.
    pub ducked: bool,
}

fn marker_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(MARKER_FILE))
}

// ── Thread COM ───────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
mod worker {
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
    use std::sync::mpsc::{self, Receiver, Sender};
    use std::sync::OnceLock;
    use std::time::Duration;

    use windows::core::{Interface, PWSTR};
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::Media::Audio::{
        eRender, AudioSessionStateExpired, IAudioSessionControl2, IAudioSessionManager2,
        IMMDeviceEnumerator, ISimpleAudioVolume, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_MULTITHREADED,
    };
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };

    pub(super) enum Cmd {
        Duck { level: f32, marker: Option<PathBuf> },
        Unduck { marker: Option<PathBuf>, ack: Option<Sender<()>> },
        RestoreCrash { marker: PathBuf },
        Status { reply: Sender<DuckStatus> },
    }

    static AVAILABLE: AtomicBool = AtomicBool::new(false);
    static GAME_SESSIONS: AtomicU32 = AtomicU32::new(0);
    static DUCKED: AtomicBool = AtomicBool::new(false);

    /// Dernier état connu, sans attendre le thread.
    pub(super) fn cached_status() -> DuckStatus {
        DuckStatus {
            available: AVAILABLE.load(Ordering::Relaxed),
            game_sessions: GAME_SESSIONS.load(Ordering::Relaxed),
            ducked: DUCKED.load(Ordering::Relaxed),
        }
    }

    /// Envoie au thread (démarré au premier usage). Thread mort → ignoré.
    pub(super) fn send(cmd: Cmd) {
        static TX: OnceLock<Sender<Cmd>> = OnceLock::new();
        let tx = TX.get_or_init(|| {
            let (tx, rx) = mpsc::channel();
            if let Err(e) = std::thread::Builder::new().name("audio-duck".into()).spawn(move || run(rx)) {
                crate::app_error!("thread audio-duck : {e}");
            }
            tx
        });
        let _ = tx.send(cmd);
    }

    pub(super) fn wait<T>(rx: &Receiver<T>, ms: u64) -> Option<T> {
        rx.recv_timeout(Duration::from_millis(ms)).ok()
    }

    /// Une session audio du jeu, vivante le temps d'un passage.
    struct GameSession {
        id: String,
        process: String,
        volume: ISimpleAudioVolume,
    }

    /// Restauration de crash pas encore appliquée (jeu absent au démarrage).
    struct Pending {
        marker: PathBuf,
        volumes: BTreeMap<String, f32>,
    }

    fn run(rx: Receiver<Cmd>) {
        // MTA : aucune pompe de messages requise sur ce thread.
        let com_ok = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok();
        let enumerator: Option<IMMDeviceEnumerator> = if com_ok {
            unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }
                .map_err(|e| crate::app_warn!("WASAPI indisponible : {e}"))
                .ok()
        } else {
            crate::app_warn!("CoInitializeEx a échoué : ducking désactivé");
            None
        };
        AVAILABLE.store(enumerator.is_some(), Ordering::Relaxed);

        let mut ducker = Ducker::default();
        let mut pending: Option<Pending> = None;

        while let Ok(cmd) = rx.recv() {
            let sessions = enumerator.as_ref().map(game_sessions).unwrap_or_default();
            GAME_SESSIONS.store(sessions.len() as u32, Ordering::Relaxed);

            // Une restauration de crash en attente passe avant tout le reste :
            // sinon le volume encore bas serait pris pour l'original.
            if let Some(p) = pending.as_ref() {
                if apply_marker(&sessions, &p.volumes) > 0 {
                    let _ = std::fs::remove_file(&p.marker);
                    pending = None;
                }
            }

            match cmd {
                Cmd::Duck { level, marker } => {
                    let current: Vec<(String, f32)> = sessions
                        .iter()
                        .map(|s| (s.id.clone(), unsafe { s.volume.GetMasterVolume() }.unwrap_or(1.0)))
                        .collect();
                    let (targets, added) = ducker.plan_duck(&current, level);
                    for (id, v) in &targets {
                        if let Some(s) = sessions.iter().find(|s| &s.id == id) {
                            let _ = unsafe { s.volume.SetMasterVolume(*v, std::ptr::null()) };
                        }
                    }
                    // Le marqueur d'une restauration en attente n'est pas écrasé :
                    // il porte les vrais originaux d'avant le crash.
                    if added && pending.is_none() {
                        if let Some(path) = marker {
                            let mut m = DuckMarker::default();
                            for s in &sessions {
                                if let Some(v) = ducker.originals.get(&s.id) {
                                    m.insert(&s.process, *v);
                                }
                            }
                            if let Some(dir) = path.parent() {
                                let _ = std::fs::create_dir_all(dir);
                            }
                            if let Err(e) = std::fs::write(&path, m.to_json()) {
                                crate::app_warn!("marqueur {MARKER_FILE} : {e}");
                            }
                        }
                    }
                }
                Cmd::Unduck { marker, ack } => {
                    let originals = ducker.plan_unduck();
                    let mut restored = 0;
                    for s in &sessions {
                        if let Some(v) = originals.get(&s.id) {
                            let _ = unsafe { s.volume.SetMasterVolume(*v, std::ptr::null()) };
                            restored += 1;
                        }
                    }
                    if let (None, Some(path)) = (pending.as_ref(), marker) {
                        // Session disparue pendant le duck (jeu quitté) : Windows a
                        // retenu le volume bas → le marqueur devient une restauration
                        // en attente, appliquée quand le jeu revient.
                        let keep = (restored < originals.len())
                            .then(|| std::fs::read_to_string(&path).ok())
                            .flatten()
                            .and_then(|t| DuckMarker::from_json(&t));
                        match keep {
                            Some(m) if !m.volumes.is_empty() => {
                                pending = Some(Pending { marker: path, volumes: m.volumes })
                            }
                            _ => {
                                let _ = std::fs::remove_file(path);
                            }
                        }
                    }
                    if let Some(ack) = ack {
                        let _ = ack.send(());
                    }
                }
                Cmd::RestoreCrash { marker } => {
                    let Ok(text) = std::fs::read_to_string(&marker) else { continue };
                    let Some(m) = DuckMarker::from_json(&text) else {
                        let _ = std::fs::remove_file(&marker);
                        continue;
                    };
                    let n = apply_marker(&sessions, &m.volumes);
                    if n > 0 || m.volumes.is_empty() {
                        crate::app_info!("volume du jeu rétabli après un arrêt brutal ({n} session(s))");
                        let _ = std::fs::remove_file(&marker);
                    } else {
                        crate::app_info!("restauration du volume du jeu en attente (jeu non lancé)");
                        pending = Some(Pending { marker, volumes: m.volumes });
                    }
                }
                Cmd::Status { reply } => {
                    let _ = reply.send(DuckStatus {
                        available: enumerator.is_some(),
                        game_sessions: sessions.len() as u32,
                        ducked: ducker.is_ducked(),
                    });
                }
            }
            DUCKED.store(ducker.is_ducked(), Ordering::Relaxed);
        }
    }

    /// Applique les volumes du marqueur ; renvoie le nombre de sessions touchées.
    fn apply_marker(sessions: &[GameSession], volumes: &BTreeMap<String, f32>) -> usize {
        let mut n = 0;
        for s in sessions {
            if let Some(v) = volumes.get(&s.process) {
                if unsafe { s.volume.SetMasterVolume(*v, std::ptr::null()) }.is_ok() {
                    n += 1;
                }
            }
        }
        n
    }

    /// Sessions (non expirées) du jeu sur toutes les sorties actives.
    fn game_sessions(enumerator: &IMMDeviceEnumerator) -> Vec<GameSession> {
        let mut out = Vec::new();
        let mut names: HashMap<u32, Option<String>> = HashMap::new();
        unsafe {
            let Ok(devices) = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) else {
                return out;
            };
            let count = devices.GetCount().unwrap_or(0);
            for i in 0..count {
                let Ok(device) = devices.Item(i) else { continue };
                let Ok(manager) = device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) else {
                    continue;
                };
                let Ok(list) = manager.GetSessionEnumerator() else { continue };
                for j in 0..list.GetCount().unwrap_or(0) {
                    let Ok(ctl) = list.GetSession(j) else { continue };
                    if ctl.GetState().map(|s| s == AudioSessionStateExpired).unwrap_or(true) {
                        continue;
                    }
                    let Ok(ctl2) = ctl.cast::<IAudioSessionControl2>() else { continue };
                    let pid = ctl2.GetProcessId().unwrap_or(0);
                    if pid == 0 {
                        continue; // sons système
                    }
                    let name = names.entry(pid).or_insert_with(|| process_image_name(pid));
                    let Some(name) = name.as_ref().filter(|n| is_game_process(n)) else { continue };
                    let Ok(volume) = ctl.cast::<ISimpleAudioVolume>() else { continue };
                    let id = match ctl2.GetSessionInstanceIdentifier() {
                        Ok(p) => {
                            let s = p.to_string().unwrap_or_default();
                            CoTaskMemFree(Some(p.0 as *const _));
                            s
                        }
                        Err(_) => String::new(),
                    };
                    // Identifiant absent (rare) : repli sur sortie + pid + rang.
                    let id = if id.is_empty() { format!("{i}:{pid}:{j}") } else { id };
                    out.push(GameSession { id, process: name.to_ascii_lowercase(), volume });
                }
            }
        }
        out
    }

    /// Nom de l'exécutable d'un processus (`Le Mans Ultimate.exe`).
    fn process_image_name(pid: u32) -> Option<String> {
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 1024];
            let mut len = buf.len() as u32;
            let r = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
            let _ = CloseHandle(h);
            r.ok()?;
            let full = String::from_utf16_lossy(&buf[..len as usize]);
            full.rsplit(['\\', '/']).next().map(str::to_string)
        }
    }
}

// ── Commandes ────────────────────────────────────────────────────────────────

/// Baisse le son du jeu : `level` = fraction retirée (0..=0.95).
#[tauri::command]
pub fn duck_game_audio(app: AppHandle, level: f32) {
    #[cfg(target_os = "windows")]
    worker::send(worker::Cmd::Duck { level, marker: marker_path(&app) });
    #[cfg(not(target_os = "windows"))]
    let _ = (app, level);
}

/// Rétablit le volume d'origine du jeu.
#[tauri::command]
pub fn unduck_game_audio(app: AppHandle) {
    #[cfg(target_os = "windows")]
    worker::send(worker::Cmd::Unduck { marker: marker_path(&app), ack: None });
    #[cfg(not(target_os = "windows"))]
    let _ = app;
}

/// API audio disponible ? Sessions du jeu trouvées ? Jeu atténué ?
#[tauri::command]
pub fn duck_status() -> DuckStatus {
    #[cfg(target_os = "windows")]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        worker::send(worker::Cmd::Status { reply: tx });
        worker::wait(&rx, 100).unwrap_or_else(worker::cached_status)
    }
    #[cfg(not(target_os = "windows"))]
    DuckStatus::default()
}

/// À appeler une fois au démarrage : rétablit le volume du jeu si l'app s'est
/// arrêtée pendant un duck (marqueur présent). Ne bloque pas.
pub fn restore_after_crash(app: &AppHandle) {
    #[cfg(target_os = "windows")]
    if let Some(marker) = marker_path(app).filter(|p| p.exists()) {
        worker::send(worker::Cmd::RestoreCrash { marker });
    }
    #[cfg(not(target_os = "windows"))]
    let _ = app;
}

/// À appeler à la fermeture de l'app : rétablit le volume du jeu et attend la
/// confirmation au plus 500 ms (le marqueur couvre le cas où ça n'aboutit pas).
pub fn restore_on_exit(app: &AppHandle) {
    #[cfg(target_os = "windows")]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        worker::send(worker::Cmd::Unduck { marker: marker_path(app), ack: Some(tx) });
        let _ = worker::wait(&rx, 500);
    }
    #[cfg(not(target_os = "windows"))]
    let _ = app;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn level_clamping() {
        assert_eq!(clamp_level(-1.0), 0.0);
        assert_eq!(clamp_level(0.5), 0.5);
        assert_eq!(clamp_level(1.0), MAX_LEVEL);
        assert_eq!(clamp_level(f32::NAN), 0.0);
        assert!((ducked_volume(0.8, 0.5) - 0.4).abs() < 1e-6);
        assert!((ducked_volume(1.0, 2.0) - 0.05).abs() < 1e-6);
        assert_eq!(ducked_volume(1.5, 0.0), 1.0);
        assert_eq!(ducked_volume(f32::NAN, 0.0), 1.0);
    }

    #[test]
    fn repeated_duck_never_compounds() {
        let mut d = Ducker::default();
        let (t, added) = d.plan_duck(&[("a".into(), 0.8)], 0.5);
        assert!(added);
        assert!((t[0].1 - 0.4).abs() < 1e-6);
        // Le volume actuel (0.4, déjà baissé) est ignoré : l'original reste 0.8.
        let (t, added) = d.plan_duck(&[("a".into(), 0.4)], 0.5);
        assert!(!added);
        assert!((t[0].1 - 0.4).abs() < 1e-6);
        // Nouveau niveau → réappliqué à l'original.
        let (t, _) = d.plan_duck(&[("a".into(), 0.4)], 0.25);
        assert!((t[0].1 - 0.6).abs() < 1e-6);
        // Session apparue pendant le duck : son volume actuel devient son original.
        let (t, added) = d.plan_duck(&[("a".into(), 0.6), ("b".into(), 1.0)], 0.5);
        assert!(added);
        assert!((t[1].1 - 0.5).abs() < 1e-6);
        assert!(d.is_ducked());
        let back = d.plan_unduck();
        assert_eq!(back.get("a"), Some(&0.8));
        assert_eq!(back.get("b"), Some(&1.0));
        assert!(!d.is_ducked());
        assert!(d.plan_unduck().is_empty());
    }

    #[test]
    fn marker_roundtrip() {
        let mut m = DuckMarker::default();
        m.insert("Le Mans Ultimate.exe", 0.6);
        m.insert("le mans ultimate.exe", 0.9);
        m.insert("other.exe", 3.0);
        assert_eq!(m.volumes.get("le mans ultimate.exe"), Some(&0.9));
        assert_eq!(m.volumes.get("other.exe"), Some(&1.0));
        let back = DuckMarker::from_json(&m.to_json()).unwrap();
        assert_eq!(back, m);
        let loose = DuckMarker::from_json(r#"{"volumes":{"Le Mans Ultimate.exe":-2}}"#).unwrap();
        assert_eq!(loose.volumes.get("le mans ultimate.exe"), Some(&0.0));
        assert!(DuckMarker::from_json("pas du json").is_none());
    }

    /// Contrôle manuel sur une vraie machine (jeu lancé ou non) :
    /// `cargo test --lib audio_duck::tests::live_status -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn live_status() {
        let first = duck_status();
        std::thread::sleep(std::time::Duration::from_millis(500));
        let s = duck_status();
        println!("{first:?} / {s:?}");
        assert!(!s.ducked);
    }

    #[test]
    fn game_process_match() {
        assert!(is_game_process("Le Mans Ultimate.exe"));
        assert!(is_game_process("LE MANS ULTIMATE.EXE"));
        assert!(!is_game_process("Le Mans Ultimate Launcher.exe"));
    }
}
