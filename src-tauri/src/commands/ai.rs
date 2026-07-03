//! Proxy HTTP pour l'AI Coach.
//!
//! Tous les appels aux fournisseurs d'IA (Google, Ollama, etc.) passent par le
//! backend Rust plutôt que par `fetch` dans la WebView. Deux raisons :
//!   1. **CORS** : plusieurs fournisseurs refusent les requêtes navigateur
//!      (Anthropic notamment). Côté process Rust, pas de politique CORS.
//!   2. **Clé API** : elle ne transite jamais par les logs réseau de la WebView.
//!
//! Le backend ne connaît **pas** les fournisseurs : il relaie une requête
//! générique (URL + en-têtes + corps JSON) entièrement construite côté frontend
//! (`src/lib/ai/providers/*`). Ajouter un fournisseur = du TypeScript, jamais du
//! Rust.

use crate::db::{self, DbState};
use crate::error::AppError;
use tauri::State;

// ===========================================================================
// Chiffrement local de la clé API (obfuscation : clé dérivée de la machine).
// ⚠️ Protège contre la copie « brute » du fichier de base vers une autre
// machine, PAS contre un attaquant local. À ne pas considérer comme un coffre.
// ===========================================================================

const KEY_ENC: &str = "ai_api_key_enc";
const KEY_LEGACY: &str = "ai_api_key"; // ancien stockage en clair (migration douce)
// Clé du coach VOCAL quand il utilise un fournisseur DIFFÉRENT de l'analyse.
const VOICE_KEY_ENC: &str = "ai_voice_api_key_enc";

fn machine_key() -> [u8; 32] {
    use ring::digest;
    let host = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_default();
    let user = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_default();
    let mut ctx = digest::Context::new(&digest::SHA256);
    ctx.update(b"lmu-stats-viewer-v3-ai-key-salt");
    ctx.update(host.as_bytes());
    ctx.update(user.as_bytes());
    let d = ctx.finish();
    let mut k = [0u8; 32];
    k.copy_from_slice(d.as_ref());
    k
}

fn to_hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

fn from_hex(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok())
        .collect()
}

fn encrypt_key(plain: &str) -> Result<String, AppError> {
    use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM, NONCE_LEN};
    use ring::rand::{SecureRandom, SystemRandom};
    let unbound = UnboundKey::new(&AES_256_GCM, &machine_key())
        .map_err(|_| AppError::Internal("aead key".into()))?;
    let lk = LessSafeKey::new(unbound);
    let mut nonce_bytes = [0u8; NONCE_LEN];
    SystemRandom::new()
        .fill(&mut nonce_bytes)
        .map_err(|_| AppError::Internal("rng".into()))?;
    let mut in_out = plain.as_bytes().to_vec();
    lk.seal_in_place_append_tag(
        Nonce::assume_unique_for_key(nonce_bytes),
        Aad::empty(),
        &mut in_out,
    )
    .map_err(|_| AppError::Internal("seal".into()))?;
    let mut out = nonce_bytes.to_vec();
    out.extend_from_slice(&in_out);
    Ok(to_hex(&out))
}

fn decrypt_key(hex: &str) -> Result<String, AppError> {
    use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM, NONCE_LEN};
    let bytes = from_hex(hex).ok_or_else(|| AppError::Internal("hex".into()))?;
    if bytes.len() <= NONCE_LEN {
        return Err(AppError::Internal("ciphertext trop court".into()));
    }
    let (nb, ct) = bytes.split_at(NONCE_LEN);
    let mut nonce_arr = [0u8; NONCE_LEN];
    nonce_arr.copy_from_slice(nb);
    let unbound = UnboundKey::new(&AES_256_GCM, &machine_key())
        .map_err(|_| AppError::Internal("aead key".into()))?;
    let lk = LessSafeKey::new(unbound);
    let mut buf = ct.to_vec();
    let plain = lk
        .open_in_place(Nonce::assume_unique_for_key(nonce_arr), Aad::empty(), &mut buf)
        .map_err(|_| AppError::Internal("decrypt".into()))?;
    Ok(String::from_utf8_lossy(plain).to_string())
}

/// Stocke la clé API chiffrée (vide = on efface l'entrée).
#[tauri::command]
pub fn ai_set_key(value: String, db: State<'_, DbState>) -> Result<(), AppError> {
    let stored = if value.is_empty() {
        String::new()
    } else {
        encrypt_key(&value)?
    };
    db::config_set(&db, KEY_ENC, &stored)?;
    Ok(())
}

/// Lit la clé API déchiffrée. Migration douce : si seul l'ancien stockage en
/// clair existe, on le renvoie (l'UI le ré-enregistrera chiffré au prochain set).
#[tauri::command]
pub fn ai_get_key(db: State<'_, DbState>) -> Result<String, AppError> {
    if let Some(enc) = db::config_get(&db, KEY_ENC)? {
        if !enc.is_empty() {
            // Échec de déchiffrement (base copiée d'une autre machine) → clé vide.
            return Ok(decrypt_key(&enc).unwrap_or_default());
        }
    }
    Ok(db::config_get(&db, KEY_LEGACY)?.unwrap_or_default())
}

/// Stocke la clé API du coach vocal (fournisseur distinct). Vide = efface.
#[tauri::command]
pub fn ai_set_voice_key(value: String, db: State<'_, DbState>) -> Result<(), AppError> {
    let stored = if value.is_empty() {
        String::new()
    } else {
        encrypt_key(&value)?
    };
    db::config_set(&db, VOICE_KEY_ENC, &stored)?;
    Ok(())
}

/// Lit la clé API déchiffrée du coach vocal ("" si absente).
#[tauri::command]
pub fn ai_get_voice_key(db: State<'_, DbState>) -> Result<String, AppError> {
    if let Some(enc) = db::config_get(&db, VOICE_KEY_ENC)? {
        if !enc.is_empty() {
            return Ok(decrypt_key(&enc).unwrap_or_default());
        }
    }
    Ok(String::new())
}

fn build_client() -> Result<reqwest::Client, AppError> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| AppError::Internal(format!("client HTTP IA: {e}")))
}

fn header_map(headers: Vec<(String, String)>) -> Result<reqwest::header::HeaderMap, AppError> {
    use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
    let mut map = HeaderMap::new();
    for (k, v) in headers {
        let name = HeaderName::from_bytes(k.as_bytes())
            .map_err(|e| AppError::Internal(format!("en-tête invalide '{k}': {e}")))?;
        let value = HeaderValue::from_str(&v)
            .map_err(|e| AppError::Internal(format!("valeur d'en-tête invalide pour '{k}': {e}")))?;
        map.insert(name, value);
    }
    Ok(map)
}

/// Lit la réponse en distinguant les erreurs HTTP. En cas d'échec, le message
/// commence par `HTTP <code>:` pour que le frontend reconnaisse 401/402/429/5xx.
async fn read_json(resp: reqwest::Response) -> Result<serde_json::Value, AppError> {
    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| AppError::Internal(format!("lecture réponse IA: {e}")))?;
    if !status.is_success() {
        return Err(AppError::Internal(format!("HTTP {}: {text}", status.as_u16())));
    }
    serde_json::from_str(&text)
        .map_err(|e| AppError::Parse(format!("JSON réponse IA invalide: {e} — corps: {text}")))
}

/// Appel chat (POST JSON) vers un fournisseur d'IA. Non-streaming (Phase 1) ;
/// le streaming SSE/NDJSON arrivera avec le mode Live (Phase 3).
#[tauri::command]
pub async fn ai_chat(
    url: String,
    headers: Vec<(String, String)>,
    body: serde_json::Value,
) -> Result<serde_json::Value, AppError> {
    let resp = build_client()?
        .post(&url)
        .headers(header_map(headers)?)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("requête chat IA: {e}")))?;
    read_json(resp).await
}

/// Appel chat en **streaming** : relaie chaque ligne du flux (SSE ou NDJSON)
/// au frontend via l'événement `ai-stream-<streamId>`. Le frontend parse chaque
/// ligne selon le fournisseur (`provider.parseStreamChunk`). La résolution de la
/// commande = fin du flux ; une erreur HTTP est renvoyée comme `Err`.
#[tauri::command]
pub async fn ai_chat_stream(
    stream_id: String,
    url: String,
    headers: Vec<(String, String)>,
    body: serde_json::Value,
    app: tauri::AppHandle,
) -> Result<(), AppError> {
    use futures_util::StreamExt;
    use tauri::Emitter;

    let resp = build_client()?
        .post(&url)
        .headers(header_map(headers)?)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("requête stream IA: {e}")))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!("HTTP {}: {text}", status.as_u16())));
    }

    let event = format!("ai-stream-{stream_id}");
    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| AppError::Internal(format!("lecture flux IA: {e}")))?;
        buf.push_str(&String::from_utf8_lossy(&bytes));
        // Émet ligne par ligne (SSE et NDJSON sont tous deux délimités par '\n').
        while let Some(pos) = buf.find('\n') {
            let line: String = buf.drain(..=pos).collect();
            let line = line.trim_end_matches(['\r', '\n']).to_string();
            if !line.is_empty() {
                app.emit(&event, line)
                    .map_err(|e| AppError::Internal(format!("emit flux IA: {e}")))?;
            }
        }
    }
    // Reste éventuel sans '\n' final.
    let tail = buf.trim();
    if !tail.is_empty() {
        let _ = app.emit(&event, tail.to_string());
    }
    Ok(())
}

// ===========================================================================
// Notes de coaching (mémoire longitudinale) : objectifs épinglés par le pilote
// après une analyse, par combo circuit/voiture. Réinjectés dans le contexte IA
// à la session suivante sur le même combo.
// ===========================================================================

/// Note épinglée (objectif de coaching) attachée à un combo circuit/voiture.
#[derive(serde::Serialize)]
pub struct CoachNote {
    pub id: i64,
    pub created_at: i64,
    pub track: String,
    pub track_course: String,
    pub car: String,
    pub car_class: String,
    pub note: String,
}

/// Notes conservées par combo (les plus récentes) — borne la taille du contexte IA.
const MAX_NOTES_PER_COMBO: i64 = 5;

/// Épingle une note pour un combo. Au-delà de `MAX_NOTES_PER_COMBO`, les plus
/// anciennes notes du combo sont supprimées.
#[tauri::command]
pub fn coach_note_add(
    track: String,
    track_course: String,
    car: String,
    car_class: String,
    note: String,
    db: State<'_, DbState>,
) -> Result<(), AppError> {
    if note.trim().is_empty() {
        return Ok(());
    }
    let conn = db::get_conn(&db)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    conn.execute(
        "INSERT INTO coach_notes (created_at, track, track_course, car, car_class, note)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![now, track, track_course, car, car_class, note],
    )
    .map_err(|e| AppError::Database(format!("coach_note_add: {e}")))?;
    conn.execute(
        "DELETE FROM coach_notes WHERE track = ?1 AND car = ?2 AND id NOT IN (
             SELECT id FROM coach_notes WHERE track = ?1 AND car = ?2
             ORDER BY created_at DESC, id DESC LIMIT ?3)",
        rusqlite::params![track, car, MAX_NOTES_PER_COMBO],
    )
    .map_err(|e| AppError::Database(format!("coach_note_add prune: {e}")))?;
    Ok(())
}

/// Notes d'un combo, la plus récente en premier.
#[tauri::command]
pub fn coach_notes_for_combo(
    track: String,
    car: String,
    db: State<'_, DbState>,
) -> Result<Vec<CoachNote>, AppError> {
    let conn = db::get_conn(&db)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, created_at, track, track_course, car, car_class, note
             FROM coach_notes WHERE track = ?1 AND car = ?2
             ORDER BY created_at DESC, id DESC",
        )
        .map_err(|e| AppError::Database(format!("coach_notes prepare: {e}")))?;
    let rows = stmt
        .query_map(rusqlite::params![track, car], |r| {
            Ok(CoachNote {
                id: r.get(0)?,
                created_at: r.get(1)?,
                track: r.get(2)?,
                track_course: r.get(3)?,
                car: r.get(4)?,
                car_class: r.get(5)?,
                note: r.get(6)?,
            })
        })
        .map_err(|e| AppError::Database(format!("coach_notes query: {e}")))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::Database(format!("coach_notes rows: {e}")))?;
    Ok(rows)
}

/// Supprime une note épinglée.
#[tauri::command]
pub fn coach_note_delete(id: i64, db: State<'_, DbState>) -> Result<(), AppError> {
    let conn = db::get_conn(&db)?;
    conn.execute("DELETE FROM coach_notes WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| AppError::Database(format!("coach_note_delete: {e}")))?;
    Ok(())
}

/// Liste les modèles disponibles (GET) chez un fournisseur. Le frontend
/// normalise la réponse (`provider.parseModels`) en `ModelInfo[]`.
#[tauri::command]
pub async fn ai_list_models(
    url: String,
    headers: Vec<(String, String)>,
) -> Result<serde_json::Value, AppError> {
    let resp = build_client()?
        .get(&url)
        .headers(header_map(headers)?)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("requête list-models IA: {e}")))?;
    read_json(resp).await
}
