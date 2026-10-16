//! Voix **en ligne** avec la clé de l'utilisateur (option, désactivée par défaut).
//!
//! Comme pour l'IA (`ai.rs`), le backend ne connaît pas les fournisseurs : le
//! frontend construit la requête (URL + en-têtes + corps JSON) et Rust la relaie,
//! puis renvoie l'audio brut (WAV ou MP3) encodé en base64, que Web Audio décode.
//!
//! Garde-fous propres à la voix :
//! - **Liste blanche d'hôtes** (HTTPS uniquement) : ce relais ne doit pas devenir
//!   un proxy vers n'importe quelle URL.
//! - **Délai court** borné (1 à 15 s) : au-delà, le frontend repasse sur Piper.
//! - **Cache disque** des phrases fixes (drapeaux, « box », conseils sans
//!   chiffre…) : une phrase déjà payée n'est plus jamais redemandée, d'une séance
//!   à l'autre. Le frontend fournit la clé (empreinte du fournisseur, du modèle,
//!   de la voix, de la vitesse et du texte) ; aucune clé API n'est écrite sur disque.

use crate::error::{AppError, AppResult};
use std::path::PathBuf;
use tauri::Manager;

/// Hôtes autorisés (API de synthèse vocale des fournisseurs proposés).
const ALLOWED_HOSTS: &[&str] = &[
    "api.openai.com",
    "api.elevenlabs.io",
    "api.cartesia.ai",
    "texttospeech.googleapis.com",
];

/// Plafond d'une réponse audio (une annonce radio fait quelques centaines de Ko).
const MAX_AUDIO_BYTES: usize = 8 * 1024 * 1024;

fn check_url(url: &str) -> AppResult<()> {
    let u = reqwest::Url::parse(url).map_err(|e| AppError::Internal(format!("URL invalide: {e}")))?;
    let host_ok = u.host_str().is_some_and(|h| ALLOWED_HOSTS.contains(&h));
    if u.scheme() != "https" || !host_ok {
        return Err(AppError::Internal("hôte de synthèse vocale non autorisé".into()));
    }
    Ok(())
}

/// Clé de cache : empreinte hexadécimale calculée par le frontend.
fn valid_cache_key(key: &str) -> bool {
    (16..=128).contains(&key.len()) && key.chars().all(|c| c.is_ascii_hexdigit())
}

fn cache_dir(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::Internal(e.to_string()))?
        .join("tts_cloud");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Audio renvoyé au frontend.
#[derive(serde::Serialize)]
pub struct CloudAudio {
    /// Fichier audio (WAV ou MP3 selon le fournisseur), base64.
    audio: String,
    /// Vrai si servi par le cache disque (aucune requête, rien de facturé).
    cached: bool,
}

/// Synthèse en ligne. `cache_key` (facultatif) : lecture/écriture dans le cache
/// disque. `timeout_ms` : délai total de la requête (borné à 1-15 s).
#[tauri::command]
pub async fn tts_cloud_synthesize(
    app: tauri::AppHandle,
    url: String,
    headers: Vec<(String, String)>,
    body: serde_json::Value,
    cache_key: Option<String>,
    timeout_ms: Option<u64>,
) -> AppResult<CloudAudio> {
    let cached = match cache_key.as_deref().filter(|k| valid_cache_key(k)) {
        Some(k) => Some(cache_dir(&app)?.join(format!("{k}.audio"))),
        None => None,
    };
    if let Some(path) = &cached {
        if let Ok(bytes) = std::fs::read(path) {
            if !bytes.is_empty() {
                return Ok(CloudAudio { audio: super::tts::base64_encode(&bytes), cached: true });
            }
        }
    }

    check_url(&url)?;
    let timeout = std::time::Duration::from_millis(timeout_ms.unwrap_or(4000).clamp(1000, 15000));
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| AppError::Internal(format!("client HTTP voix: {e}")))?;
    let resp = client
        .post(&url)
        .headers(super::ai::header_map(headers)?)
        .json(&body)
        .send()
        .await
        // `without_url` : rien de la requête ne doit finir dans un message affiché.
        .map_err(|e| AppError::Internal(format!("voix en ligne: {}", e.without_url())))?;
    let status = resp.status();
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| AppError::Internal(format!("voix en ligne: {}", e.without_url())))?;
    if !status.is_success() {
        let text = String::from_utf8_lossy(&bytes);
        return Err(AppError::Internal(format!(
            "HTTP {}: {}",
            status.as_u16(),
            super::ai::truncate_body(&text)
        )));
    }
    if bytes.is_empty() || bytes.len() > MAX_AUDIO_BYTES {
        return Err(AppError::Internal("réponse audio vide ou trop volumineuse".into()));
    }
    if let Some(path) = &cached {
        // Best-effort : un cache non écrit coûte juste une requête la prochaine fois.
        let part = path.with_extension("part");
        if std::fs::write(&part, &bytes).is_ok() {
            let _ = std::fs::rename(&part, path);
        }
    }
    Ok(CloudAudio { audio: super::tts::base64_encode(&bytes), cached: false })
}

/// Lecture JSON (GET) chez un fournisseur de la liste blanche : sert à lister les
/// voix disponibles. Rien n'est mis en cache ; erreurs sans URL ni en-têtes.
#[tauri::command]
pub async fn tts_cloud_get_json(url: String, headers: Vec<(String, String)>) -> AppResult<serde_json::Value> {
    check_url(&url)?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| AppError::Internal(format!("client HTTP voix: {e}")))?;
    let resp = client
        .get(&url)
        .headers(super::ai::header_map(headers)?)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("voix en ligne: {}", e.without_url())))?;
    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| AppError::Internal(format!("voix en ligne: {}", e.without_url())))?;
    if !status.is_success() {
        return Err(AppError::Internal(format!(
            "HTTP {}: {}",
            status.as_u16(),
            super::ai::truncate_body(&text)
        )));
    }
    serde_json::from_str(&text).map_err(|e| AppError::Parse(format!("liste des voix illisible: {e}")))
}

/// Clés absentes du cache disque (« Préparer la voix » : devis avant tout envoi).
/// Une clé invalide est renvoyée comme absente (elle ne sera de toute façon
/// jamais mise en cache).
#[tauri::command]
pub fn tts_cloud_cache_missing(app: tauri::AppHandle, keys: Vec<String>) -> AppResult<Vec<String>> {
    let dir = cache_dir(&app)?;
    Ok(missing_keys(&dir, keys))
}

fn missing_keys(dir: &std::path::Path, keys: Vec<String>) -> Vec<String> {
    keys.into_iter()
        .filter(|k| {
            !valid_cache_key(k)
                || std::fs::metadata(dir.join(format!("{k}.audio"))).map_or(true, |m| m.len() == 0)
        })
        .collect()
}

/// Vide le cache disque de la voix en ligne (changement de voix, place disque).
/// Renvoie le nombre de fichiers supprimés.
#[tauri::command]
pub fn tts_cloud_cache_clear(app: tauri::AppHandle) -> AppResult<u32> {
    let mut n = 0;
    if let Ok(rd) = std::fs::read_dir(cache_dir(&app)?) {
        for e in rd.flatten() {
            if std::fs::remove_file(e.path()).is_ok() {
                n += 1;
            }
        }
    }
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_whitelisted_https_hosts() {
        assert!(check_url("https://api.openai.com/v1/audio/speech").is_ok());
        assert!(check_url("https://api.elevenlabs.io/v1/text-to-speech/abc?output_format=mp3_44100_128").is_ok());
        assert!(check_url("https://api.cartesia.ai/tts/bytes").is_ok());
        assert!(check_url("https://texttospeech.googleapis.com/v1/voices?languageCode=fr").is_ok());
        assert!(check_url("http://api.openai.com/v1/audio/speech").is_err());
        assert!(check_url("https://api.openai.com.evil.example/x").is_err());
        assert!(check_url("https://example.com/").is_err());
        assert!(check_url("not a url").is_err());
    }

    #[test]
    fn missing_keys_lists_absent_empty_and_invalid() {
        let dir = std::env::temp_dir().join(format!("tts_cloud_test_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let (full, empty, absent) = ("a".repeat(64), "b".repeat(64), "c".repeat(64));
        std::fs::write(dir.join(format!("{full}.audio")), b"RIFF").unwrap();
        std::fs::write(dir.join(format!("{empty}.audio")), b"").unwrap();
        let keys = vec![full.clone(), empty.clone(), absent.clone(), "../x".to_string()];
        assert_eq!(missing_keys(&dir, keys), vec![empty, absent, "../x".to_string()]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cache_keys_are_plain_hex() {
        assert!(valid_cache_key(&"a1".repeat(32)));
        assert!(!valid_cache_key("../../etc/passwd"));
        assert!(!valid_cache_key("abc"));
        assert!(!valid_cache_key(&"z".repeat(64)));
    }
}
