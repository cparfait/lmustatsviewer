//! Reconnaissance vocale **hors-ligne** par commandes (grammaire fermée) via Vosk.
//!
//! Le frontend capture le micro pendant un push-to-talk, downsample en PCM 16 kHz
//! mono Int16, l'encode en base64 et appelle `stt_recognize` avec la **grammaire**
//! (liste fermée de phrases) de la langue courante. Vosk contraint la sortie à ce
//! vocabulaire → précision maximale, déterministe, sans réseau.
//!
//! La lib native `libvosk` et les modèles sont bundlés en ressources (comme Piper,
//! cf. `tts.rs`). Si la lib ou le modèle manque, les commandes renvoient une erreur /
//! `false` et le frontend bascule sur un repli (touche = Statut).

use crate::error::{AppError, AppResult};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use tauri::Manager;
use vosk::{Model, Recognizer};

/// Dossiers `stt` candidats : ressources bundlées (prod) puis dossier source (dev).
fn stt_bases(app: &tauri::AppHandle) -> Vec<std::path::PathBuf> {
    let mut v = Vec::new();
    if let Ok(res) = app.path().resource_dir() {
        v.push(res.join("stt"));
    }
    v.push(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("stt"),
    );
    v
}

/// Dossier du modèle Vosk pour une langue (`<base>/models/<code>`), repli 1er dispo.
fn model_dir(app: &tauri::AppHandle, lang: &str) -> Option<std::path::PathBuf> {
    let code = lang.get(0..2).unwrap_or("en").to_lowercase();
    for base in stt_bases(app) {
        let models = base.join("models");
        // 1) Modèle exact `<code>` (contient un fichier `mfcc.conf` / dossier `am`).
        let exact = models.join(&code);
        if exact.join("am").exists() || exact.join("conf").exists() {
            return Some(exact);
        }
    }
    // 2) Repli : premier modèle présent quel qu'il soit.
    for base in stt_bases(app) {
        if let Ok(rd) = std::fs::read_dir(base.join("models")) {
            for e in rd.flatten() {
                let p = e.path();
                if p.is_dir() && (p.join("am").exists() || p.join("conf").exists()) {
                    return Some(p);
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
const LIB_NAME: &str = "libvosk.dll";
#[cfg(not(target_os = "windows"))]
const LIB_NAME: &str = "libvosk.so";

/// Dossier `resources/stt/lib` contenant `libvosk` (présent en dev / build folder).
fn lib_dir(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    stt_bases(app)
        .into_iter()
        .map(|b| b.join("lib"))
        .find(|d| d.join(LIB_NAME).exists())
}

/// Vrai si la lib native est présente : soit dans `resources/stt/lib` (dev), soit
/// à côté de l'exécutable (prod — bundlée à la racine pour le chargement implicite).
fn lib_available(app: &tauri::AppHandle) -> bool {
    if lib_dir(app).is_some() {
        return true;
    }
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|d| d.join(LIB_NAME).exists()))
        .unwrap_or(false)
}

/// Ajoute le dossier de `libvosk` au chemin de recherche des DLL (une seule fois).
/// Sans cela, le chargement paresseux de la lib native échoue en dev / portable.
#[cfg(target_os = "windows")]
fn ensure_dll_path(app: &tauri::AppHandle) {
    static DONE: OnceLock<()> = OnceLock::new();
    DONE.get_or_init(|| {
        if let Some(dir) = lib_dir(app) {
            use windows::core::PCWSTR;
            use windows::Win32::System::LibraryLoader::SetDllDirectoryW;
            let wide: Vec<u16> = dir
                .as_os_str()
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            unsafe {
                let _ = SetDllDirectoryW(PCWSTR(wide.as_ptr()));
            }
        }
    });
}

#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStrExt;

#[cfg(not(target_os = "windows"))]
fn ensure_dll_path(_app: &tauri::AppHandle) {}

/// Cache des modèles chargés (clé = code langue) — un modèle pèse ~40 Mo, on évite
/// de le recharger à chaque push-to-talk.
fn model_cache() -> &'static Mutex<HashMap<String, &'static Model>> {
    static CACHE: OnceLock<Mutex<HashMap<String, &'static Model>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Charge (ou récupère du cache) le modèle Vosk de la langue. Le `Model` est
/// volontairement « fuité » (`Box::leak`) pour obtenir un `&'static` partageable
/// sans coût : il vit toute la durée de l'application, comme prévu pour un cache.
fn get_model(app: &tauri::AppHandle, lang: &str) -> AppResult<&'static Model> {
    let code = lang.get(0..2).unwrap_or("en").to_lowercase();
    let mut cache = model_cache().lock().unwrap();
    if let Some(m) = cache.get(&code) {
        return Ok(*m);
    }
    ensure_dll_path(app);
    let dir = model_dir(app, &code)
        .ok_or_else(|| AppError::NotFound("Modèle Vosk introuvable".into()))?;
    let path = dir.to_string_lossy().to_string();
    let model = Model::new(&path)
        .ok_or_else(|| AppError::Internal("Échec du chargement du modèle Vosk".into()))?;
    let leaked: &'static Model = Box::leak(Box::new(model));
    cache.insert(code, leaked);
    Ok(leaked)
}

/// Vrai si la lib native et un modèle pour la langue sont présents (indicateur Config).
#[tauri::command]
pub fn stt_available(app: tauri::AppHandle, lang: String) -> bool {
    lib_available(&app) && model_dir(&app, &lang).is_some()
}

/// Reconnaît une commande dans `pcm_base64` (PCM 16 kHz mono Int16, little-endian)
/// en contraignant la sortie à `grammar` (liste fermée de phrases). Renvoie le texte
/// reconnu (vide si rien / hors grammaire).
#[tauri::command]
pub fn stt_recognize(
    app: tauri::AppHandle,
    pcm_base64: String,
    lang: String,
    grammar: Vec<String>,
) -> AppResult<String> {
    let bytes = base64_decode(&pcm_base64)
        .ok_or_else(|| AppError::Parse("PCM base64 invalide".into()))?;
    // Octets little-endian → échantillons i16.
    let samples: Vec<i16> = bytes
        .chunks_exact(2)
        .map(|c| i16::from_le_bytes([c[0], c[1]]))
        .collect();
    if samples.is_empty() {
        return Ok(String::new());
    }

    let model = get_model(&app, &lang)?;
    let grammar_refs: Vec<&str> = grammar.iter().map(|s| s.as_str()).collect();
    let mut rec = Recognizer::new_with_grammar(model, 16_000.0, &grammar_refs)
        .ok_or_else(|| AppError::Internal("Échec d'init du Recognizer Vosk".into()))?;
    rec.set_words(false);
    let _ = rec.accept_waveform(&samples);
    let text = rec
        .final_result()
        .single()
        .map(|r| r.text.to_string())
        .unwrap_or_default();
    Ok(text.trim().to_string())
}

/// Reconnaissance **libre** (dictée, sans grammaire) pour les questions au Coach IA.
/// Moins fiable que la grammaire fermée du spotter, mais permet de parler librement.
#[tauri::command]
pub fn stt_recognize_free(
    app: tauri::AppHandle,
    pcm_base64: String,
    lang: String,
) -> AppResult<String> {
    let bytes = base64_decode(&pcm_base64)
        .ok_or_else(|| AppError::Parse("PCM base64 invalide".into()))?;
    let samples: Vec<i16> = bytes
        .chunks_exact(2)
        .map(|c| i16::from_le_bytes([c[0], c[1]]))
        .collect();
    if samples.is_empty() {
        return Ok(String::new());
    }
    let model = get_model(&app, &lang)?;
    let mut rec = Recognizer::new(model, 16_000.0)
        .ok_or_else(|| AppError::Internal("Échec d'init du Recognizer Vosk".into()))?;
    rec.set_words(false);
    let _ = rec.accept_waveform(&samples);
    let text = rec
        .final_result()
        .single()
        .map(|r| r.text.to_string())
        .unwrap_or_default();
    Ok(text.trim().to_string())
}

/// Décodage base64 standard (sans dépendance externe ; pendant de `tts::base64_encode`).
fn base64_decode(s: &str) -> Option<Vec<u8>> {
    fn val(c: u8) -> Option<u8> {
        match c {
            b'A'..=b'Z' => Some(c - b'A'),
            b'a'..=b'z' => Some(c - b'a' + 26),
            b'0'..=b'9' => Some(c - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let clean: Vec<u8> = s.bytes().filter(|&c| c != b'=' && !c.is_ascii_whitespace()).collect();
    let mut out = Vec::with_capacity(clean.len() / 4 * 3);
    for chunk in clean.chunks(4) {
        let mut n = 0u32;
        let mut bits = 0;
        for &c in chunk {
            n = (n << 6) | val(c)? as u32;
            bits += 6;
        }
        // Aligne sur les octets pleins disponibles.
        n <<= 24 - bits;
        let nbytes = bits / 8;
        for i in 0..nbytes {
            out.push((n >> (16 - i * 8)) as u8);
        }
    }
    Some(out)
}
