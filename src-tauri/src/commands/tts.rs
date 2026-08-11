//! Synthèse vocale neuronale **hors-ligne** via Piper (binaire + modèles `.onnx`
//! bundlés en ressources). Renvoie un WAV encodé base64 au frontend, qui le
//! décode dans Web Audio (ce qui permet aussi d'appliquer un vrai filtre radio).
//!
//! Aucune dépendance externe : lancement par `std::process::Command`, encodage
//! base64 maison. Si le binaire ou le modèle est absent, le frontend bascule sur
//! la synthèse vocale du navigateur (repli).

use crate::error::{AppError, AppResult};
use std::io::Write;
use std::process::{Command, Stdio};
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

/// Synthétise `text` dans `lang` (voix `voice_id` optionnelle) → WAV base64.
/// `rate` (> 0) ajuste la vitesse : Piper `length_scale = 1/rate`.
#[tauri::command]
pub fn tts_synthesize(
    app: tauri::AppHandle,
    text: String,
    lang: String,
    voice_id: Option<String>,
    rate: Option<f32>,
    speaker_id: Option<u32>,
) -> AppResult<String> {
    let exe = piper_exe(&app)
        .ok_or_else(|| AppError::NotFound("Binaire Piper introuvable".into()))?;
    let model = resolve_model(&app, &lang, voice_id.as_deref())
        .ok_or_else(|| AppError::NotFound("Modèle de voix Piper introuvable".into()))?;

    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    std::fs::create_dir_all(&cache)?;
    // Nom unique (évite toute collision entre deux synthèses rapprochées).
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let out = cache.join(format!("tts_{stamp}.wav"));

    let length_scale = rate.filter(|r| *r > 0.0).map(|r| 1.0 / r).unwrap_or(1.0);
    let work_dir = exe.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| cache.clone());

    let mut cmd = Command::new(&exe);
    cmd.arg("--model")
        .arg(&model)
        .arg("--output_file")
        .arg(&out)
        .arg("--length_scale")
        .arg(format!("{length_scale:.3}"));
    // Sélection du locuteur — UNIQUEMENT pour un modèle multi-locuteur (ex. MLS).
    // Sur un modèle mono-locuteur, passer `--speaker N` ferait échouer Piper, donc
    // on ignore tout réglage résiduel (robuste si l'utilisateur change de voix).
    let num_speakers = read_meta(&model, "").2;
    if num_speakers > 1 {
        if let Some(sid) = speaker_id {
            let clamped = sid.min(num_speakers - 1);
            cmd.arg("--speaker").arg(clamped.to_string());
        }
    }
    // Pas de fenêtre console + priorité basse (cf. constantes plus haut).
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS);
    }

    let mut child = cmd
        .current_dir(&work_dir) // pour trouver espeak-ng-data + onnxruntime.dll
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
    Ok(base64_encode(&bytes))
}

/// Encodage base64 standard (sans dépendance externe).
fn base64_encode(data: &[u8]) -> String {
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
