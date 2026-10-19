//! Dictée libre **Parakeet** (NVIDIA Parakeet TDT 0.6B v3, int8, 25 langues dont nos 5)
//! via sherpa-onnx — alternative à la dictée Vosk pour les phrases libres.
//!
//! Banc du 2026-10-19 (`stt-eval/README.md`) : sur la voix de l'utilisateur, 12,1 %
//! d'erreurs par mot contre 17,8 % pour Vosk small, 62 % de phrases exactes contre 42 %,
//! et 0,27 s de décodage contre 1,46 s ; au moins aussi juste que Vosk en EN/ES/DE/IT.
//! Vosk garde la **liste fermée des commandes** (grammaire), où il reste le plus sûr.
//!
//! - Modèle téléchargé à la demande (`assets.rs`, ~640 Mo) dans
//!   `app_data_dir/stt/parakeet-v3/` ; reconnaissance de la langue automatique.
//! - Chargé une seule fois (≈ 3 s, ≈ 700 Mo de mémoire), à l'activation ou au premier
//!   usage ; libéré à la suppression du modèle.
//! - Moteur choisi par le frontend (`stt_set_free_engine`). Modèle absent ou échec :
//!   la dictée retombe sur Vosk (jamais de question perdue).
//! - Aucun score de confiance (contrairement à Vosk).

use crate::error::{AppError, AppResult};
use sherpa_onnx::{OfflineRecognizer, OfflineRecognizerConfig, OfflineTransducerModelConfig};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::Manager;

/// Sous-dossier du modèle dans `app_data_dir/stt`.
pub(crate) const MODEL_DIR: &str = "parakeet-v3";
/// Fichiers du modèle (noms de l'archive sherpa-onnx).
pub(crate) const MODEL_FILES: [&str; 4] = ["encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"];
/// Fils de calcul : comme le banc (0,26 s de CPU par seconde d'audio), le jeu garde le reste.
const THREADS: i32 = 2;

/// Moteur de dictée libre choisi : `true` = Parakeet (si installé), `false` = Vosk.
static PARAKEET_ON: AtomicBool = AtomicBool::new(false);

fn recognizer() -> &'static Mutex<Option<Arc<OfflineRecognizer>>> {
    static R: OnceLock<Mutex<Option<Arc<OfflineRecognizer>>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(None))
}

/// Dossier du modèle téléchargé (qu'il soit complet ou non).
pub(crate) fn model_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Internal(e.to_string()))?
        .join("stt")
        .join(MODEL_DIR))
}

/// Vrai si les quatre fichiers du modèle sont présents.
pub(crate) fn installed(app: &tauri::AppHandle) -> bool {
    model_path(app).is_ok_and(|d| MODEL_FILES.iter().all(|f| d.join(f).is_file()))
}

/// Parakeet doit-il servir la dictée libre ? (choisi ET installé)
pub(crate) fn active(app: &tauri::AppHandle) -> bool {
    PARAKEET_ON.load(Ordering::Relaxed) && installed(app)
}

/// Crée le reconnaisseur depuis le dossier du modèle (≈ 3 s).
fn create(dir: &std::path::Path) -> AppResult<OfflineRecognizer> {
    let file = |f: &str| Some(dir.join(f).to_string_lossy().to_string());
    let mut config = OfflineRecognizerConfig::default();
    config.model_config.transducer = OfflineTransducerModelConfig {
        encoder: file("encoder.int8.onnx"),
        decoder: file("decoder.int8.onnx"),
        joiner: file("joiner.int8.onnx"),
    };
    config.model_config.tokens = file("tokens.txt");
    config.model_config.model_type = Some("nemo_transducer".into());
    config.model_config.num_threads = THREADS;
    config.model_config.provider = Some("cpu".into());
    config.decoding_method = Some("greedy_search".into());
    OfflineRecognizer::create(&config)
        .ok_or_else(|| AppError::Internal("Échec du chargement du modèle Parakeet".into()))
}

/// Charge le modèle (une fois) et le rend.
fn load(app: &tauri::AppHandle) -> AppResult<Arc<OfflineRecognizer>> {
    let mut slot = recognizer().lock().unwrap();
    if let Some(r) = slot.as_ref() {
        return Ok(r.clone());
    }
    let r = Arc::new(create(&model_path(app)?)?);
    *slot = Some(r.clone());
    Ok(r)
}

/// Libère le modèle chargé (avant suppression des fichiers : Windows les garde ouverts).
pub(crate) fn unload() {
    *recognizer().lock().unwrap() = None;
}

/// Dictée libre d'échantillons 16 kHz mono (texte brut, ponctué).
pub(crate) fn recognize(app: &tauri::AppHandle, samples: &[i16]) -> AppResult<String> {
    if samples.is_empty() {
        return Ok(String::new());
    }
    let r = load(app)?;
    Ok(decode(&r, samples))
}

fn decode(r: &OfflineRecognizer, samples: &[i16]) -> String {
    let audio: Vec<f32> = samples.iter().map(|&s| s as f32 / 32768.0).collect();
    let stream = r.create_stream();
    stream.accept_waveform(16_000, &audio);
    r.decode(&stream);
    stream.get_result().map(|res| res.text.trim().to_string()).unwrap_or_default()
}

/// Choix du moteur de dictée libre : `"parakeet"` ou `"vosk"`. Charge Parakeet en
/// arrière-plan quand il est choisi et installé, pour que la première question ne
/// paie pas les ~3 s de chargement.
#[tauri::command]
pub fn stt_set_free_engine(app: tauri::AppHandle, engine: String) {
    let on = engine == "parakeet";
    PARAKEET_ON.store(on, Ordering::Relaxed);
    if on && installed(&app) {
        std::thread::spawn(move || {
            if let Err(e) = load(&app) {
                crate::app_warn!("Parakeet : préchargement impossible ({e})");
            }
        });
    } else if !on {
        unload();
    }
}

/// État de la dictée Parakeet pour l'écran des réglages.
#[derive(serde::Serialize)]
pub struct ParakeetStatus {
    installed: bool,
    loaded: bool,
    selected: bool,
}

#[tauri::command]
pub fn stt_parakeet_status(app: tauri::AppHandle) -> ParakeetStatus {
    ParakeetStatus {
        installed: installed(&app),
        loaded: recognizer().lock().unwrap().is_some(),
        selected: PARAKEET_ON.load(Ordering::Relaxed),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Charge le vrai modèle et transcrit une phrase du banc (`stt-eval`). Ignoré par
    /// défaut : il faut le modèle (~640 Mo) et l'audio du banc.
    /// `PARAKEET_MODEL_DIR=<dossier> cargo test parakeet -- --ignored`
    ///
    /// ⚠ Windows fournit son propre `System32\onnxruntime.dll` (1.17, Windows ML), trouvé
    /// AVANT le PATH : copier `resources/stt/sherpa/*.dll` et `resources/stt/lib/*.dll`
    /// à côté de l'exécutable de test (`target/debug/deps`), sinon plantage « API
    /// version 28 not available ». L'app n'est pas concernée : ses DLL sont à côté de son exe.
    #[test]
    #[ignore]
    fn parakeet_transcribes_a_bench_phrase() {
        let dir = std::env::var("PARAKEET_MODEL_DIR").expect("PARAKEET_MODEL_DIR");
        let wav = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../stt-eval/wav/synth/propre/tom/02.wav");
        let bytes = std::fs::read(&wav).expect("audio du banc");
        // WAV 16 bits mono 16 kHz du banc : en-tête de 44 octets.
        let samples: Vec<i16> = bytes[44..].chunks_exact(2).map(|c| i16::from_le_bytes([c[0], c[1]])).collect();
        let r = create(std::path::Path::new(&dir)).expect("modèle");
        let text = decode(&r, &samples).to_lowercase();
        assert!(text.contains("essence"), "transcription : {text}");
    }
}
