//! Téléchargement **à la demande** des modèles vocaux — voix TTS Piper et
//! modèles STT Vosk — sortis de l'installeur pour l'alléger (~550 Mo de voix
//! pour 5 langues alors qu'un utilisateur n'en emploie qu'une).
//!
//! Les fichiers sont écrits dans `app_data_dir/tts/voices` et
//! `app_data_dir/stt/models/<code>`, dossiers scannés en priorité par
//! `tts.rs`/`stt.rs`. Tant qu'une voix n'est pas téléchargée, le frontend
//! bascule sur la synthèse du navigateur (repli existant).
//!
//! Intégrité : les `.onnx` Piper sont vérifiés par SHA-256 (URLs figées sur un
//! commit HuggingFace). Les archives Vosk ne publient pas de checksum stable ;
//! l'extraction valide la structure (dossier `am`/`conf`).

use crate::error::{AppError, AppResult};
use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::{Emitter, Manager};

/// Dépôt des voix Piper, figé sur un commit pour des URLs immuables.
const HF_BASE: &str = "https://huggingface.co/rhasspy/piper-voices/resolve";
const HF_COMMIT: &str = "e21c7de8d4eab79b902f0d61e662b3f21664b8d2";
/// Commit plus récent du même dépôt (2026-09) : voix ajoutées après le premier
/// catalogue (Serena, Sharvard). Les anciennes voix restent sur `HF_COMMIT`.
const HF_COMMIT_2026: &str = "c10ece1aade47bb51c153c893d14e5bf8e5b7117";
/// Modèles Vosk « small » (archives zip avec un dossier racine à aplatir).
const VOSK_BASE: &str = "https://alphacephei.com/vosk/models";

struct TtsVoice {
    /// Identifiant = nom de fichier sans extension (contrat de `tts.rs`).
    id: &'static str,
    lang: &'static str,
    label: &'static str,
    hf_path: &'static str,
    /// Commit HuggingFace des fichiers (URLs immuables).
    commit: &'static str,
    size: u64,
    sha256: &'static str,
}

/// Même catalogue que l'ancien bundle (cf. `scripts/fetch-piper.ps1`) :
/// `<langue>.onnx` = voix par défaut de la langue, le reste = alternatives.
const TTS_VOICES: &[TtsVoice] = &[
    TtsVoice { id: "fr", lang: "fr", label: "Tom", hf_path: "fr/fr_FR/tom/medium/fr_FR-tom-medium", commit: HF_COMMIT, size: 63_511_038, sha256: "bf65074ccdeeeeaa832e75edb1c0a513c01c9a972bdf085ff8a6e71ea234fd41" },
    TtsVoice { id: "fr_FR-siwis-medium", lang: "fr", label: "Siwis", hf_path: "fr/fr_FR/siwis/medium/fr_FR-siwis-medium", commit: HF_COMMIT, size: 63_201_294, sha256: "641d1ab097da2b81128c076810edb052b385decc8be3381814802a64a73baf99" },
    TtsVoice { id: "fr_FR-upmc-medium", lang: "fr", label: "UPMC", hf_path: "fr/fr_FR/upmc/medium/fr_FR-upmc-medium", commit: HF_COMMIT, size: 76_733_615, sha256: "9abb3800c199148897a9ed64e100d224f3de83579f100044174ad19418f1786f" },
    TtsVoice { id: "en", lang: "en", label: "Ryan", hf_path: "en/en_US/ryan/medium/en_US-ryan-medium", commit: HF_COMMIT, size: 63_201_294, sha256: "abf4c274862564ed647ba0d2c47f8ee7c9b717d27bdad9219100eb310db4047a" },
    TtsVoice { id: "en_GB-alan-medium", lang: "en", label: "Alan", hf_path: "en/en_GB/alan/medium/en_GB-alan-medium", commit: HF_COMMIT, size: 63_201_294, sha256: "0a309668932205e762801f1efc2736cd4b0120329622adf62be09e56339d3330" },
    TtsVoice { id: "es", lang: "es", label: "DaveFX", hf_path: "es/es_ES/davefx/medium/es_ES-davefx-medium", commit: HF_COMMIT, size: 63_201_294, sha256: "6658b03b1a6c316ee4c265a9896abc1393353c2d9e1bca7d66c2c442e222a917" },
    TtsVoice { id: "es_MX-claude-high", lang: "es", label: "Claude", hf_path: "es/es_MX/claude/high/es_MX-claude-high", commit: HF_COMMIT, size: 63_122_309, sha256: "3ef40a71ea63852cd8ab7e6fa7d2ecdcfa67a0b47c9c48e3f10e02ee02083ea0" },
    TtsVoice { id: "de", lang: "de", label: "Thorsten", hf_path: "de/de_DE/thorsten/medium/de_DE-thorsten-medium", commit: HF_COMMIT, size: 63_201_294, sha256: "7e64762d8e5118bb578f2eea6207e1a35a8e0c30595010b666f983fc87bb7819" },
    TtsVoice { id: "de_DE-eva_k-x_low", lang: "de", label: "Eva K", hf_path: "de/de_DE/eva_k/x_low/de_DE-eva_k-x_low", commit: HF_COMMIT, size: 20_628_813, sha256: "e88cf290fbfb768bf111330d2e8a46e376b0d85e3423a28bfebbc863a260dad8" },
    TtsVoice { id: "it", lang: "it", label: "Paola", hf_path: "it/it_IT/paola/medium/it_IT-paola-medium", commit: HF_COMMIT, size: 63_511_038, sha256: "6fc918b5a0ea6137382833dddfa567bffbe6a5060c02043c87192ee59c04210c" },
    // Évaluation 2026-10-15 (voice-eval/) : erreurs de transcription 2,0 % (Sharvard)
    // contre 11,1 % pour DaveFX ; 0,4 % (Serena) contre 4,4 % pour Paola, même latence.
    TtsVoice { id: "es_ES-sharvard-medium", lang: "es", label: "Sharvard", hf_path: "es/es_ES/sharvard/medium/es_ES-sharvard-medium", commit: HF_COMMIT_2026, size: 76_733_615, sha256: "40febfb1679c69a4505ff311dc136e121e3419a13a290ef264fdf43ddedd0fb1" },
    TtsVoice { id: "it_IT-serena-medium", lang: "it", label: "Serena", hf_path: "it/it_IT/serena/medium/it_IT-serena-medium", commit: HF_COMMIT_2026, size: 63_516_051, sha256: "fe4e26b2c1236e2a44d2e295cad564d94a0d8b0a9fca1ccdfd70dd4af3116eb5" },
    TtsVoice { id: "it_IT-riccardo-x_low", lang: "it", label: "Riccardo", hf_path: "it/it_IT/riccardo/x_low/it_IT-riccardo-x_low", commit: HF_COMMIT, size: 28_130_791, sha256: "1368de15f123275a7ef951c9e5e30be0f58a032daa14a0da44037443c1d1d21b" },
];

struct SttModel {
    lang: &'static str,
    name: &'static str,
    size: u64,
}

const STT_MODELS: &[SttModel] = &[
    SttModel { lang: "en", name: "vosk-model-small-en-us-0.15", size: 41_205_931 },
    SttModel { lang: "fr", name: "vosk-model-small-fr-0.22", size: 42_233_323 },
    SttModel { lang: "es", name: "vosk-model-small-es-0.42", size: 39_817_833 },
    SttModel { lang: "de", name: "vosk-model-small-de-0.15", size: 46_499_967 },
    SttModel { lang: "it", name: "vosk-model-small-it-0.22", size: 49_665_141 },
];

/// Élément du catalogue exposé au frontend (Config → Audio / Voix).
#[derive(serde::Serialize)]
pub struct AssetInfo {
    /// `"tts"` (voix Piper) ou `"stt"` (modèle Vosk).
    pub kind: String,
    /// Voix : id de fichier (« fr », « fr_FR-siwis-medium ») ; STT : code langue.
    pub id: String,
    pub lang: String,
    pub label: String,
    pub size_mb: u32,
    pub installed: bool,
    /// Vrai pour la voix par défaut de la langue (`<code>.onnx`).
    pub is_default: bool,
}

/// Progression poussée au frontend pendant `asset_download`.
#[derive(serde::Serialize, Clone)]
struct AssetProgress {
    kind: String,
    id: String,
    downloaded: u64,
    total: u64,
}

/// Dossier des voix téléchargées (créé au besoin).
fn tts_download_dir(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Internal(e.to_string()))?
        .join("tts")
        .join("voices");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Dossier des modèles STT téléchargés (créé au besoin).
fn stt_download_dir(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Internal(e.to_string()))?
        .join("stt")
        .join("models");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Vrai si un modèle Vosk pour `code` existe dans une des bases connues
/// (même logique d'implantation que `stt.rs::model_dir`, sans le repli).
fn stt_model_installed(app: &tauri::AppHandle, code: &str) -> bool {
    let mut bases: Vec<PathBuf> = Vec::new();
    if let Ok(data) = app.path().app_data_dir() {
        bases.push(data.join("stt"));
    }
    if let Ok(res) = app.path().resource_dir() {
        bases.push(res.join("stt"));
    }
    bases.push(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("stt"),
    );
    bases.iter().any(|b| {
        let m = b.join("models").join(code);
        m.join("am").exists() || m.join("conf").exists()
    })
}

/// Catalogue des modèles téléchargeables + leur état d'installation.
#[tauri::command]
pub fn assets_catalog(app: tauri::AppHandle) -> Vec<AssetInfo> {
    let installed_voices: HashSet<String> = super::tts::voice_files(&app)
        .iter()
        .filter_map(|p| p.file_stem().map(|s| s.to_string_lossy().to_string()))
        .collect();
    let mut out: Vec<AssetInfo> = TTS_VOICES
        .iter()
        .map(|v| AssetInfo {
            kind: "tts".into(),
            id: v.id.into(),
            lang: v.lang.into(),
            label: v.label.into(),
            size_mb: (v.size / 1_048_576) as u32 + 1,
            installed: installed_voices.contains(v.id),
            is_default: v.id == v.lang,
        })
        .collect();
    out.extend(STT_MODELS.iter().map(|m| AssetInfo {
        kind: "stt".into(),
        id: m.lang.into(),
        lang: m.lang.into(),
        label: m.name.into(),
        size_mb: (m.size / 1_048_576) as u32 + 1,
        installed: stt_model_installed(&app, m.lang),
        is_default: true,
    }));
    out
}

/// Ids de téléchargement en cours (anti double-clic, toutes fenêtres confondues).
fn inflight() -> &'static Mutex<HashSet<String>> {
    static SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SET.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Retire l'id du registre en fin de téléchargement (même en cas d'erreur).
struct InflightGuard(String);
impl Drop for InflightGuard {
    fn drop(&mut self) {
        inflight().lock().unwrap().remove(&self.0);
    }
}

/// Télécharge `url` vers `dest` (via `<dest>.part` puis rename), en vérifiant
/// le SHA-256 attendu le cas échéant et en poussant la progression via
/// l'événement `asset-progress` (throttlée par pas de 512 Ko).
async fn download_file(
    app: &tauri::AppHandle,
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    expected_sha256: Option<&str>,
    progress: &AssetProgress,
) -> AppResult<()> {
    use futures_util::StreamExt;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("téléchargement {url}: {e}")))?;
    if !resp.status().is_success() {
        return Err(AppError::Internal(format!(
            "téléchargement {url}: HTTP {}",
            resp.status().as_u16()
        )));
    }

    let part = dest.with_extension("part");
    let mut file = std::fs::File::create(&part)?;
    let mut ctx = ring::digest::Context::new(&ring::digest::SHA256);
    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_emit: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| {
            let _ = std::fs::remove_file(&part);
            AppError::Internal(format!("lecture flux {url}: {e}"))
        })?;
        if let Err(e) = file.write_all(&bytes) {
            let _ = std::fs::remove_file(&part);
            return Err(e.into());
        }
        ctx.update(&bytes);
        downloaded += bytes.len() as u64;
        if downloaded - last_emit >= 512 * 1024 {
            last_emit = downloaded;
            let _ = app.emit(
                "asset-progress",
                AssetProgress { downloaded: progress.downloaded + downloaded, ..progress.clone() },
            );
        }
    }
    drop(file);

    if let Some(expected) = expected_sha256 {
        let got: String = ctx
            .finish()
            .as_ref()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        if got != expected {
            let _ = std::fs::remove_file(&part);
            return Err(AppError::Internal(format!(
                "checksum SHA-256 invalide pour {url} (obtenu {got})"
            )));
        }
    }
    let _ = std::fs::remove_file(dest); // rename n'écrase pas toujours sous Windows
    std::fs::rename(&part, dest)?;
    Ok(())
}

/// Retire de `phoneme_id_map` les entrées de plus d'un caractère.
///
/// Les voix entraînées avec Piper ≥ 1.5 (ex. Serena) y déclarent des diphtongues
/// (`"aɪ"`, `"oʊ"`…) que notre `piper.exe` (2023) refuse : il s'arrête sur
/// « is not a single codepoint » sans rien synthétiser. Ces diphtongues ne sortent
/// pas de la phonétisation espeak-ng de nos langues ; les retirer rend la voix
/// utilisable (vérifié à l'écoute et par transcription, cf. `voice-eval/`).
/// Sans effet sur les voix plus anciennes (aucune entrée concernée).
fn sanitize_voice_json(path: &Path) -> AppResult<()> {
    let txt = std::fs::read_to_string(path)?;
    if let Some(fixed) = strip_multi_codepoint_phonemes(&txt)? {
        std::fs::write(path, fixed)?;
    }
    Ok(())
}

/// `Some(json corrigé)` si des entrées ont été retirées, `None` sinon.
fn strip_multi_codepoint_phonemes(txt: &str) -> AppResult<Option<String>> {
    let mut v: serde_json::Value = serde_json::from_str(txt)
        .map_err(|e| AppError::Parse(format!("métadonnées de voix invalides: {e}")))?;
    let Some(map) = v.get_mut("phoneme_id_map").and_then(|m| m.as_object_mut()) else {
        return Ok(None);
    };
    let before = map.len();
    map.retain(|k, _| k.chars().count() == 1);
    if map.len() == before {
        return Ok(None);
    }
    Ok(Some(serde_json::to_string_pretty(&v).map_err(|e| AppError::Internal(e.to_string()))?))
}

/// Extrait une archive zip dans `dest` en **aplatissant le dossier racine**
/// (les archives Vosk contiennent un unique dossier `vosk-model-…/`).
/// `enclosed_name()` neutralise toute tentative de path traversal.
fn extract_zip_strip_root(zip_path: &Path, dest: &Path) -> AppResult<()> {
    let file = std::fs::File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| AppError::Internal(format!("archive zip invalide: {e}")))?;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| AppError::Internal(format!("entrée zip {i}: {e}")))?;
        let Some(name) = entry.enclosed_name() else { continue };
        let mut comps = name.components();
        comps.next(); // saute le dossier racine de l'archive
        let rel = comps.as_path();
        if rel.as_os_str().is_empty() {
            continue;
        }
        let out = dest.join(rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out)?;
        } else {
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut f = std::fs::File::create(&out)?;
            std::io::copy(&mut entry, &mut f)?;
        }
    }
    Ok(())
}

/// Télécharge un modèle du catalogue (`kind` = « tts »/« stt », `id` = cf.
/// `assets_catalog`). Progression via l'événement `asset-progress` ; la fin
/// (succès ou échec) = résolution de la commande.
#[tauri::command]
pub async fn asset_download(
    app: tauri::AppHandle,
    kind: String,
    id: String,
) -> AppResult<()> {
    let key = format!("{kind}:{id}");
    if !inflight().lock().unwrap().insert(key.clone()) {
        return Err(AppError::Internal("téléchargement déjà en cours".into()));
    }
    let _guard = InflightGuard(key);

    let client = reqwest::Client::builder()
        .user_agent(format!("lmustatsviewer/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))?;

    match kind.as_str() {
        "tts" => {
            let voice = TTS_VOICES
                .iter()
                .find(|v| v.id == id)
                .ok_or_else(|| AppError::NotFound(format!("voix inconnue: {id}")))?;
            let dir = tts_download_dir(&app)?;
            let progress = AssetProgress {
                kind,
                id: id.clone(),
                downloaded: 0,
                total: voice.size,
            };
            // Métadonnées d'abord (8 Ko) : le `.onnx` seul serait ignoré par
            // `tts.rs::read_meta` en cas d'interruption entre les deux fichiers.
            let json_url = format!("{HF_BASE}/{}/{}.onnx.json", voice.commit, voice.hf_path);
            let json_path = dir.join(format!("{id}.onnx.json"));
            download_file(&app, &client, &json_url, &json_path, None, &progress).await?;
            sanitize_voice_json(&json_path)?;
            let onnx_url = format!("{HF_BASE}/{}/{}.onnx", voice.commit, voice.hf_path);
            download_file(&app, &client, &onnx_url, &dir.join(format!("{id}.onnx")), Some(voice.sha256), &progress).await?;
            let _ = app.emit("asset-progress", AssetProgress { downloaded: voice.size, ..progress });
        }
        "stt" => {
            let model = STT_MODELS
                .iter()
                .find(|m| m.lang == id)
                .ok_or_else(|| AppError::NotFound(format!("modèle STT inconnu: {id}")))?;
            let dir = stt_download_dir(&app)?;
            let progress = AssetProgress {
                kind,
                id: id.clone(),
                downloaded: 0,
                total: model.size,
            };
            let url = format!("{VOSK_BASE}/{}.zip", model.name);
            let zip_path = dir.join(format!("{}.zip", model.name));
            download_file(&app, &client, &url, &zip_path, None, &progress).await?;
            let dest = dir.join(&model.lang);
            if dest.exists() {
                std::fs::remove_dir_all(&dest)?;
            }
            let extracted = extract_zip_strip_root(&zip_path, &dest);
            let _ = std::fs::remove_file(&zip_path);
            extracted?;
            if !dest.join("am").exists() && !dest.join("conf").exists() {
                let _ = std::fs::remove_dir_all(&dest);
                return Err(AppError::Internal(
                    "archive Vosk inattendue (dossier am/conf absent)".into(),
                ));
            }
            let _ = app.emit("asset-progress", AssetProgress { downloaded: model.size, ..progress });
        }
        other => {
            return Err(AppError::Internal(format!("type de modèle inconnu: {other}")));
        }
    }
    Ok(())
}

/// Efface un fichier ou un dossier téléchargé. `Ok(false)` s'il n'existe pas ;
/// `in_use` si Windows le garde ouvert (voix en cours d'utilisation).
fn remove_path(p: &Path) -> AppResult<bool> {
    if !p.exists() {
        return Ok(false);
    }
    let r = if p.is_dir() { std::fs::remove_dir_all(p) } else { std::fs::remove_file(p) };
    match r {
        Ok(()) => Ok(true),
        // 32 = ERROR_SHARING_VIOLATION (fichier ouvert par un autre processus).
        Err(e) if e.raw_os_error() == Some(32) || e.kind() == std::io::ErrorKind::PermissionDenied => {
            Err(AppError::Internal("in_use".into()))
        }
        Err(e) => Err(e.into()),
    }
}

/// Supprime un modèle **téléchargé** (voix Piper ou modèle Vosk) du dossier de données
/// de l'app. L'identifiant doit appartenir au catalogue (aucun chemin arbitraire) et les
/// fichiers fournis avec l'app (ressources) ne sont jamais touchés. Erreurs :
/// `not_downloaded` (rien dans le dossier des téléchargements), `in_use`, `unknown`.
#[tauri::command]
pub fn asset_delete(app: tauri::AppHandle, kind: String, id: String) -> AppResult<()> {
    match kind.as_str() {
        "tts" => {
            let v = TTS_VOICES
                .iter()
                .find(|v| v.id == id)
                .ok_or_else(|| AppError::Internal("unknown".into()))?;
            let dir = tts_download_dir(&app)?;
            // Le modèle d'abord : s'il est ouvert, rien n'est effacé.
            let onnx = remove_path(&dir.join(format!("{}.onnx", v.id)))?;
            let json = remove_path(&dir.join(format!("{}.onnx.json", v.id)))?;
            if !onnx && !json {
                return Err(AppError::Internal("not_downloaded".into()));
            }
            Ok(())
        }
        "stt" => {
            let m = STT_MODELS
                .iter()
                .find(|m| m.lang == id)
                .ok_or_else(|| AppError::Internal("unknown".into()))?;
            if !remove_path(&stt_download_dir(&app)?.join(m.lang))? {
                return Err(AppError::Internal("not_downloaded".into()));
            }
            Ok(())
        }
        _ => Err(AppError::Internal("unknown".into())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_only_multi_codepoint_phonemes() {
        let src = r#"{"phoneme_id_map":{"a":[14],"ɪ":[74],"aɪ":[161],"oʊ":[165]},"num_speakers":1}"#;
        let out = strip_multi_codepoint_phonemes(src).unwrap().expect("corrigé");
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        let map = v["phoneme_id_map"].as_object().unwrap();
        assert_eq!(map.len(), 2);
        assert!(map.contains_key("a") && map.contains_key("ɪ"));
        assert_eq!(v["num_speakers"], 1);
    }

    #[test]
    fn leaves_classic_voices_untouched() {
        let src = r#"{"phoneme_id_map":{"a":[14],"ɪ":[74]}}"#;
        assert!(strip_multi_codepoint_phonemes(src).unwrap().is_none());
    }

    #[test]
    fn catalog_has_one_default_per_language() {
        for lang in ["fr", "en", "es", "de", "it"] {
            assert_eq!(TTS_VOICES.iter().filter(|v| v.lang == lang && v.id == lang).count(), 1, "{lang}");
        }
        let ids: HashSet<_> = TTS_VOICES.iter().map(|v| v.id).collect();
        assert_eq!(ids.len(), TTS_VOICES.len(), "ids uniques");
    }
}
