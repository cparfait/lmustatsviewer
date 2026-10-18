//! Synthèse vocale neuronale **hors-ligne** via Piper (binaire + modèles `.onnx`
//! bundlés en ressources). Renvoie un WAV encodé base64 au frontend, qui le
//! décode dans Web Audio (ce qui permet aussi d'appliquer un vrai filtre radio).
//!
//! Aucune dépendance externe : lancement par `std::process::Command`, encodage
//! base64 maison. Si le binaire ou le modèle est absent, le frontend bascule sur
//! la synthèse vocale du navigateur (repli).
//!
//! **Worker persistant** : relancer `piper.exe` à chaque phrase recharge le modèle
//! ONNX (~0,5 s). On garde donc UN processus Piper vivant en mode `--json-input`
//! (une requête = une ligne JSON sur stdin, Piper répond par le chemin du WAV
//! écrit sur stdout), ce qui ramène une phrase à ~0,15-0,2 s. En cas de souci
//! (délai dépassé, tube cassé, processus mort), le worker est tué et la requête
//! repasse par le lancement ponctuel historique (`synthesize_one_shot`).

use crate::error::{AppError, AppResult};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::Manager;

#[cfg(target_os = "windows")]
const PIPER_EXE: &str = "piper.exe";
#[cfg(not(target_os = "windows"))]
const PIPER_EXE: &str = "piper";

/// `CREATE_NO_WINDOW` : Piper est une application **console**. Sans ce drapeau,
/// Windows ouvre une fenêtre noire à chaque synthèse — invisible sur le bureau,
/// mais désastreuse en jeu : elle prend le focus et fait saccader LMU en plein
/// écran. `BELOW_NORMAL_PRIORITY_CLASS` garde en plus le CPU pour le simulateur
/// (la synthèse prend ~200 ms, quelques ms de retard n'ont aucune importance).
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
#[cfg(target_os = "windows")]
const BELOW_NORMAL_PRIORITY_CLASS: u32 = 0x0000_4000;

/// Cœurs logiques laissés à Piper (au-delà de 4 cœurs sur la machine) : la
/// synthèse d'une phrase n'en a pas besoin de plus, et onnxruntime en prend
/// sinon autant qu'il y a de cœurs — en concurrence directe avec le jeu.
const PIPER_CORES: u32 = 2;

/// Masque d'affinité à donner à Piper : les `n` cœurs les plus hauts du masque
/// du processus (les jeux chargent d'abord les premiers). Petite machine
/// (≤ 2 × n cœurs) : masque inchangé.
fn capped_affinity(system: usize, n: u32) -> usize {
    if system.count_ones() <= 2 * n {
        return system;
    }
    let mut out = 0usize;
    let mut left = n;
    for bit in (0..usize::BITS).rev() {
        if left == 0 {
            break;
        }
        if system & (1usize << bit) != 0 {
            out |= 1usize << bit;
            left -= 1;
        }
    }
    out
}

/// Réglages du processus Piper (Windows) : cœurs bornés, priorité adaptée.
#[cfg(target_os = "windows")]
mod proc_ctl {
    use std::os::windows::io::AsRawHandle;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::Threading::{
        GetCurrentProcess, GetProcessAffinityMask, SetPriorityClass, SetProcessAffinityMask,
        BELOW_NORMAL_PRIORITY_CLASS, NORMAL_PRIORITY_CLASS,
    };

    fn handle(child: &std::process::Child) -> HANDLE {
        HANDLE(child.as_raw_handle())
    }

    /// Phrase urgente (sécurité, spotter) : priorité normale le temps de la
    /// synthèse — en priorité basse, sous forte charge, une phrase prenait 1 à 5 s.
    pub fn set_urgent(child: &std::process::Child, urgent: bool) {
        let class = if urgent { NORMAL_PRIORITY_CLASS } else { BELOW_NORMAL_PRIORITY_CLASS };
        unsafe {
            let _ = SetPriorityClass(handle(child), class);
        }
    }

    pub fn cap_cores(child: &std::process::Child, n: u32) {
        unsafe {
            let (mut proc_mask, mut sys_mask) = (0usize, 0usize);
            if GetProcessAffinityMask(GetCurrentProcess(), &mut proc_mask, &mut sys_mask).is_ok() {
                let mask = super::capped_affinity(proc_mask, n);
                if mask != 0 && mask != proc_mask {
                    let _ = SetProcessAffinityMask(handle(child), mask);
                }
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod proc_ctl {
    pub fn set_urgent(_child: &std::process::Child, _urgent: bool) {}
    pub fn cap_cores(_child: &std::process::Child, _n: u32) {}
}

/// Voix Piper installée (exposée au frontend pour le sélecteur).
#[derive(serde::Serialize)]
pub struct PiperVoice {
    /// Identifiant = nom de fichier sans extension (ex. « fr », « fr_FR-siwis-medium »).
    pub id: String,
    /// Code langue 2 lettres (depuis les métadonnées `.onnx.json`).
    pub lang: String,
    /// Libellé lisible (dataset + qualité).
    pub label: String,
    /// Nombre de locuteurs du modèle (1 = mono ; > 1 = multi-locuteur, ex. UPMC).
    pub num_speakers: u32,
    /// Noms des locuteurs ordonnés par id (vide si mono ou si non nommés).
    pub speakers: Vec<String>,
}

/// Dossiers `tts` candidats : voix téléchargées à la demande (app data,
/// prioritaires), puis ressources bundlées (prod), puis dossier source (dev).
fn tts_bases(app: &tauri::AppHandle) -> Vec<std::path::PathBuf> {
    let mut v = Vec::new();
    if let Ok(data) = app.path().app_data_dir() {
        v.push(data.join("tts"));
    }
    if let Ok(res) = app.path().resource_dir() {
        v.push(res.join("tts"));
    }
    v.push(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("tts"),
    );
    v
}

/// Binaire Piper (premier dossier qui le contient).
fn piper_exe(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    tts_bases(app)
        .into_iter()
        .map(|b| b.join("piper").join(PIPER_EXE))
        .find(|p| p.exists())
}

fn stem(p: &std::path::Path) -> String {
    p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()
}

/// Tous les modèles `.onnx` installés (dédupliqués par nom de fichier).
/// `pub(crate)` : réutilisé par `assets.rs` pour l'état « installée » du catalogue.
pub(crate) fn voice_files(app: &tauri::AppHandle) -> Vec<std::path::PathBuf> {
    let mut out: Vec<std::path::PathBuf> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    for base in tts_bases(app) {
        if let Ok(rd) = std::fs::read_dir(base.join("voices")) {
            for e in rd.flatten() {
                let p = e.path();
                if p.extension().and_then(|x| x.to_str()) == Some("onnx") {
                    let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                    if seen.insert(name) {
                        out.push(p);
                    }
                }
            }
        }
    }
    out
}

/// (langue 2 lettres, libellé, nb de locuteurs, noms des locuteurs) depuis
/// `<model>.onnx.json` si lisible.
fn read_meta(onnx: &std::path::Path, id: &str) -> (String, String, u32, Vec<String>) {
    let json = std::path::PathBuf::from(format!("{}.json", onnx.to_string_lossy()));
    let fallback = id.get(0..2).unwrap_or("en").to_lowercase();
    if let Ok(txt) = std::fs::read_to_string(&json) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&txt) {
            let lang = v["language"]["code"]
                .as_str()
                .and_then(|c| c.get(0..2))
                .map(|c| c.to_lowercase())
                .unwrap_or_else(|| fallback.clone());
            // Libellé = nom du dataset seul (la qualité « medium/low » n'apporte rien
            // à l'utilisateur ; l'`id` distingue déjà les voix d'une même langue).
            let label = v["dataset"].as_str().unwrap_or(id).to_string();
            let num_speakers = v["num_speakers"].as_u64().unwrap_or(1).max(1) as u32;
            // `speaker_id_map` : { "jessica": 0, "pierre": 1 } → vec ordonné par id.
            let mut speakers = vec![String::new(); num_speakers as usize];
            if let Some(map) = v["speaker_id_map"].as_object() {
                for (name, id_val) in map {
                    if let Some(idx) = id_val.as_u64() {
                        if (idx as usize) < speakers.len() {
                            speakers[idx as usize] = name.clone();
                        }
                    }
                }
            }
            // Si aucun nom n'a été trouvé, on renvoie une liste vide (mono / non nommé).
            if speakers.iter().all(|s| s.is_empty()) {
                speakers.clear();
            }
            return (lang, label, num_speakers, speakers);
        }
    }
    (fallback, id.to_string(), 1, Vec::new())
}

/// Résout le modèle `.onnx` pour (langue, voix optionnelle).
fn resolve_model(
    app: &tauri::AppHandle,
    lang: &str,
    voice_id: Option<&str>,
) -> Option<std::path::PathBuf> {
    let code = lang.get(0..2).unwrap_or("en").to_lowercase();
    let files = voice_files(app);
    // 1) Voix explicitement choisie.
    if let Some(id) = voice_id {
        if let Some(p) = files.iter().find(|p| stem(p) == id) {
            return Some(p.clone());
        }
    }
    // 2) Défaut par langue : `<code>.onnx`.
    if let Some(p) = files.iter().find(|p| stem(p) == code) {
        return Some(p.clone());
    }
    // 3) Première voix de la langue (via métadonnées).
    files.iter().find(|p| read_meta(p, &stem(p)).0 == code).cloned()
}

/// Liste les voix Piper installées (pour le sélecteur de la Config).
#[tauri::command]
pub fn tts_list_voices(app: tauri::AppHandle) -> Vec<PiperVoice> {
    voice_files(&app)
        .iter()
        .map(|p| {
            let id = stem(p);
            let (lang, label, num_speakers, speakers) = read_meta(p, &id);
            PiperVoice { id, lang, label, num_speakers, speakers }
        })
        .collect()
}

/// Vrai si Piper + un modèle pour la langue sont disponibles (repli/UI).
#[tauri::command]
pub fn tts_available(app: tauri::AppHandle, lang: String) -> bool {
    piper_exe(&app).is_some() && resolve_model(&app, &lang, None).is_some()
}

/// Paramètres résolus d'une synthèse (communs au worker et au lancement ponctuel).
struct SynthParams {
    exe: PathBuf,
    model: PathBuf,
    /// `length_scale` déjà formaté (`{:.3}`) : sert d'argument ET de clé du worker.
    length_scale: String,
    /// Locuteur effectif — `Some` UNIQUEMENT pour un modèle multi-locuteur.
    speaker: Option<u32>,
    /// Dossier de travail de Piper (espeak-ng-data + onnxruntime.dll).
    work_dir: PathBuf,
    /// Cache applicatif (WAV temporaires).
    cache: PathBuf,
}

/// Résout binaire, modèle, vitesse et locuteur pour une requête du frontend.
fn prepare(
    app: &tauri::AppHandle,
    lang: &str,
    voice_id: Option<&str>,
    rate: Option<f32>,
    speaker_id: Option<u32>,
) -> AppResult<SynthParams> {
    let exe = piper_exe(app)
        .ok_or_else(|| AppError::NotFound("Binaire Piper introuvable".into()))?;
    let model = resolve_model(app, lang, voice_id)
        .ok_or_else(|| AppError::NotFound("Modèle de voix Piper introuvable".into()))?;

    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    std::fs::create_dir_all(&cache)?;

    let length_scale = rate.filter(|r| *r > 0.0).map(|r| 1.0 / r).unwrap_or(1.0);
    let work_dir = exe.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| cache.clone());

    // Sélection du locuteur — UNIQUEMENT pour un modèle multi-locuteur (ex. MLS).
    // Sur un modèle mono-locuteur, passer un locuteur ferait échouer Piper (vérifié :
    // en mode JSON, le processus meurt sans répondre), donc on ignore tout réglage
    // résiduel (robuste si l'utilisateur change de voix).
    // Multi-locuteur : on envoie TOUJOURS un locuteur explicite (0 = défaut Piper) —
    // le frontend omet `speakerId` pour 0, et un worker persistant ne doit pas
    // conserver le locuteur de la requête précédente.
    let num_speakers = read_meta(&model, "").2;
    let speaker = if num_speakers > 1 {
        Some(speaker_id.unwrap_or(0).min(num_speakers - 1))
    } else {
        None
    };

    Ok(SynthParams {
        exe,
        model,
        length_scale: format!("{length_scale:.3}"),
        speaker,
        work_dir,
        cache,
    })
}

/// Commande Piper de base : modèle, vitesse, dossier de travail, pas de fenêtre
/// console + priorité basse (cf. constantes plus haut).
fn piper_command(p: &SynthParams) -> Command {
    let mut cmd = Command::new(&p.exe);
    cmd.arg("--model")
        .arg(&p.model)
        .arg("--length_scale")
        .arg(&p.length_scale)
        .current_dir(&p.work_dir); // pour trouver espeak-ng-data + onnxruntime.dll
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS);
    }
    cmd
}

/// Lancement **ponctuel** historique : un processus Piper par phrase (recharge le
/// modèle à chaque fois). Conservé comme repli si le worker persistant échoue.
fn synthesize_one_shot(p: &SynthParams, text: &str) -> AppResult<Vec<u8>> {
    // Nom unique (évite toute collision entre deux synthèses rapprochées).
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let out = p.cache.join(format!("tts_{stamp}.wav"));

    let mut cmd = piper_command(p);
    cmd.arg("--output_file").arg(&out);
    if let Some(sid) = p.speaker {
        cmd.arg("--speaker").arg(sid.to_string());
    }

    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(text.as_bytes())?;
    } // drop → ferme stdin → Piper démarre la synthèse

    let status = child.wait()?;
    if !status.success() {
        let _ = std::fs::remove_file(&out);
        return Err(AppError::Internal("échec de la synthèse Piper".into()));
    }

    let bytes = std::fs::read(&out)?;
    let _ = std::fs::remove_file(&out);
    Ok(bytes)
}

// ── Worker Piper persistant ──────────────────────────────────────────────────

/// Processus Piper vivant en mode `--json-input`. Un seul à la fois (cf. `WORKER`) :
/// il est remplacé dès que la clé (binaire, modèle, vitesse) change. Le locuteur,
/// lui, passe dans chaque ligne JSON (`speaker_id`) → pas besoin de relancer.
struct PiperWorker {
    exe: PathBuf,
    model: PathBuf,
    length_scale: String,
    child: Child,
    stdin: ChildStdin,
    /// Lignes de stdout (chemins des WAV), relayées par le thread lecteur.
    /// Déconnecté = stdout fermé = processus mort.
    lines: Receiver<String>,
    /// `--output_dir` du worker (`<app_cache_dir>/tts_worker`).
    out_dir: PathBuf,
}

impl PiperWorker {
    fn matches(&self, p: &SynthParams) -> bool {
        self.exe == p.exe && self.model == p.model && self.length_scale == p.length_scale
    }

    fn is_alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }
}

impl Drop for PiperWorker {
    fn drop(&mut self) {
        // Tuer explicitement : fermer stdin suffirait à terminer Piper proprement,
        // mais pas s'il est bloqué en pleine synthèse.
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Worker unique, protégé par un `Mutex` qui sérialise aussi les requêtes (Piper
/// traite les lignes une par une ; deux appels simultanés mélangeraient les réponses).
/// Note : un `static` n'est jamais détruit à la fermeture de l'app, mais l'extrémité
/// écriture de stdin disparaît avec notre processus → Piper lit EOF et s'arrête seul.
static WORKER: OnceLock<Mutex<Option<PiperWorker>>> = OnceLock::new();

fn worker_slot() -> &'static Mutex<Option<PiperWorker>> {
    WORKER.get_or_init(|| Mutex::new(None))
}

/// Démarre un worker Piper pour `p` (chargement du modèle en arrière-plan côté Piper).
fn spawn_worker(p: &SynthParams) -> std::io::Result<PiperWorker> {
    let out_dir = p.cache.join("tts_worker");
    std::fs::create_dir_all(&out_dir)?;
    // Nettoyage des WAV orphelins (worker tué en cours de route, suppression ratée…).
    if let Ok(rd) = std::fs::read_dir(&out_dir) {
        for e in rd.flatten() {
            if e.path().extension().and_then(|x| x.to_str()) == Some("wav") {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }

    let mut cmd = piper_command(p);
    cmd.arg("--json-input").arg("--output_dir").arg(&out_dir);
    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()?;
    proc_ctl::cap_cores(&child, PIPER_CORES);

    let (stdin, stdout) = match (child.stdin.take(), child.stdout.take()) {
        (Some(i), Some(o)) => (i, o),
        _ => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(std::io::Error::other("tubes Piper indisponibles"));
        }
    };

    // Thread lecteur dédié : relaie chaque ligne de stdout dans le canal. Il se
    // termine tout seul quand Piper meurt (EOF) ou que le worker est abandonné.
    let (tx, rx) = mpsc::channel::<String>();
    std::thread::Builder::new()
        .name("piper-stdout".into())
        .spawn(move || {
            let mut reader = BufReader::new(stdout);
            let mut buf = Vec::new();
            loop {
                buf.clear();
                match reader.read_until(b'\n', &mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        // Lossy : sous Windows, Piper écrit le chemin dans la page de
                        // code ANSI (cf. `resolve_output` pour les chemins accentués).
                        let line = String::from_utf8_lossy(&buf).trim().to_string();
                        if !line.is_empty() && tx.send(line).is_err() {
                            break;
                        }
                    }
                }
            }
        })?;

    Ok(PiperWorker {
        exe: p.exe.clone(),
        model: p.model.clone(),
        length_scale: p.length_scale.clone(),
        child,
        stdin,
        lines: rx,
        out_dir,
    })
}

/// Délai max d'une requête : max(8 s, min(30 s, 3 s + 0,08 s × caractères)).
fn request_timeout(text: &str) -> Duration {
    let secs = (3.0 + 0.08 * text.chars().count() as f64).clamp(8.0, 30.0);
    Duration::from_secs_f64(secs)
}

/// Chemin du WAV annoncé par Piper. Si la ligne est illisible (chemin non-ASCII
/// réencodé en ANSI par Piper), on retombe sur `out_dir` + nom de fichier
/// (horodatage numérique, donc toujours ASCII).
fn resolve_output(line: &str, out_dir: &Path) -> Option<PathBuf> {
    let p = PathBuf::from(line);
    if p.extension().and_then(|x| x.to_str()) != Some("wav") {
        return None;
    }
    if p.is_file() {
        return Some(p);
    }
    let alt = out_dir.join(p.file_name()?);
    alt.is_file().then_some(alt)
}

/// Vrai si `bytes` est un WAV complet : Piper écrit l'en-tête RIFF avec la taille
/// finale, et annonce le chemin juste avant de fermer le fichier — on vérifie donc
/// que tout le contenu est bien sur disque avant de le lire.
fn wav_complete(bytes: &[u8]) -> bool {
    if bytes.len() < 44 || &bytes[0..4] != b"RIFF" {
        return false;
    }
    let riff = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) as usize;
    riff + 8 == bytes.len()
}

/// Lit le WAV (en attendant brièvement qu'il soit complet), puis le supprime.
fn read_and_remove_wav(path: &Path) -> Option<Vec<u8>> {
    let deadline = Instant::now() + Duration::from_millis(500);
    let bytes = loop {
        if let Ok(b) = std::fs::read(path) {
            if wav_complete(&b) {
                break b;
            }
        }
        if Instant::now() >= deadline {
            let _ = std::fs::remove_file(path);
            return None;
        }
        std::thread::sleep(Duration::from_millis(5));
    };
    // Sous Windows, la suppression peut échouer si Piper n'a pas encore fermé le
    // fichier : quelques essais, sinon le nettoyage au prochain démarrage s'en charge.
    for _ in 0..10 {
        if std::fs::remove_file(path).is_ok() {
            break;
        }
        std::thread::sleep(Duration::from_millis(5));
    }
    Some(bytes)
}

/// Envoie une requête au worker et attend le WAV. `Err` = worker à jeter.
fn worker_request(w: &mut PiperWorker, text: &str, speaker: Option<u32>) -> Result<Vec<u8>, String> {
    // Une requête = une ligne : les sauts de ligne deviennent des espaces.
    let one_line: String = text
        .chars()
        .map(|c| if c == '\n' || c == '\r' { ' ' } else { c })
        .collect();
    let mut req = serde_json::json!({ "text": one_line });
    if let Some(sid) = speaker {
        req["speaker_id"] = serde_json::json!(sid);
    }
    let mut line = serde_json::to_string(&req).map_err(|e| e.to_string())?;
    line.push('\n');
    w.stdin
        .write_all(line.as_bytes())
        .and_then(|_| w.stdin.flush())
        .map_err(|e| format!("écriture stdin : {e}"))?;

    let deadline = Instant::now() + request_timeout(text);
    loop {
        let left = deadline.saturating_duration_since(Instant::now());
        match w.lines.recv_timeout(left) {
            Ok(l) => {
                // Toute ligne qui n'est pas un chemin de WAV existant est ignorée.
                if let Some(path) = resolve_output(&l, &w.out_dir) {
                    return read_and_remove_wav(&path).ok_or_else(|| "WAV incomplet".to_string());
                }
            }
            Err(RecvTimeoutError::Timeout) => return Err("délai dépassé".into()),
            Err(RecvTimeoutError::Disconnected) => return Err("processus Piper terminé".into()),
        }
    }
}

/// Synthèse via le worker persistant (démarré/remplacé si besoin). `None` = échec :
/// le worker a été tué et l'appelant doit repasser par `synthesize_one_shot`.
fn synthesize_with_worker(p: &SynthParams, text: &str, urgent: bool) -> Option<Vec<u8>> {
    let mut slot = worker_slot().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(w) = slot.as_mut() {
        if !w.matches(p) || !w.is_alive() {
            *slot = None; // drop → kill
        }
    }
    if slot.is_none() {
        *slot = Some(spawn_worker(p).ok()?);
    }
    let w = slot.as_mut()?;
    if urgent {
        proc_ctl::set_urgent(&w.child, true);
    }
    let res = worker_request(w, text, p.speaker);
    if urgent {
        proc_ctl::set_urgent(&w.child, false);
    }
    match res {
        Ok(bytes) => Some(bytes),
        Err(_) => {
            *slot = None; // drop → kill
            None
        }
    }
}

/// Synthétise `text` dans `lang` (voix `voice_id` optionnelle) → WAV base64.
/// `rate` (> 0) ajuste la vitesse : Piper `length_scale = 1/rate`.
/// `async` : exécutée hors du thread principal (la synthèse ne fige plus l'UI).
#[tauri::command(async)]
pub fn tts_synthesize(
    app: tauri::AppHandle,
    text: String,
    lang: String,
    voice_id: Option<String>,
    rate: Option<f32>,
    speaker_id: Option<u32>,
    urgent: Option<bool>,
) -> AppResult<String> {
    let p = prepare(&app, &lang, voice_id.as_deref(), rate, speaker_id)?;
    // Texte vide : comportement historique (pas de requête JSON vide au worker).
    let bytes = if text.trim().is_empty() {
        synthesize_one_shot(&p, &text)?
    } else {
        match synthesize_with_worker(&p, &text, urgent.unwrap_or(false)) {
            Some(b) => b,
            None => synthesize_one_shot(&p, &text)?,
        }
    };
    Ok(base64_encode(&bytes))
}

/// Pré-démarre le worker Piper pour cette voix (chargement du modèle + une
/// micro-synthèse jetée), afin que la première vraie phrase sorte sans délai.
/// Best-effort : un échec ici n'empêche pas `tts_synthesize` (qui a son repli).
#[tauri::command(async)]
pub fn tts_warmup(
    app: tauri::AppHandle,
    lang: String,
    voice_id: Option<String>,
    rate: Option<f32>,
    speaker_id: Option<u32>,
) -> AppResult<()> {
    let p = prepare(&app, &lang, voice_id.as_deref(), rate, speaker_id)?;
    synthesize_with_worker(&p, "ok", false)
        .map(|_| ())
        .ok_or_else(|| AppError::Internal("démarrage du worker Piper impossible".into()))
}

/// Encodage base64 standard (sans dépendance externe).
pub(crate) fn base64_encode(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            T[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            T[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn piper_affinity_keeps_the_highest_cores() {
        assert_eq!(capped_affinity(0b1111, 2), 0b1111, "4 cœurs : inchangé");
        assert_eq!(capped_affinity(0xFFF, 2), 0xC00, "12 cœurs : les 2 plus hauts");
        assert_eq!(capped_affinity(0b1010_1010_1010, 2), 0b1010_0000_0000, "masque troué");
    }
}
