//! Partage communautaire des meilleurs tours (COMMUNITY-SPEC.md, lot 2).
//!
//! - Opt-in : RIEN ne part tant que `community_enabled` n'est pas activé par l'utilisateur.
//! - Seuls les tours du joueur (`results.is_player = 1`), jamais ceux des autres pilotes.
//! - Échanges sûrs (§4 bis) : HTTPS obligatoire, empreinte `Content-Digest` SHA-256 de
//!   chaque envoi, une session n'est `sent` que si l'accusé `received` du serveur la cite,
//!   renvoi idempotent par `session_key` en cas de coupure, reprise avec backoff.
//! - Jeton d'installation chiffré localement (AES-GCM, même mécanisme que les clés IA) ;
//!   les appels partent du Rust, le jeton ne transite jamais par la WebView.
//! - Copie du jeton dans le Gestionnaire d'identifications Windows (`community_vault`) :
//!   une réinstallation reprend la même installation au lieu d'en créer une nouvelle.
//! - « Se connecter avec Steam » : lier l'installation, la retrouver sur un autre PC.

use std::sync::atomic::{AtomicBool, Ordering};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;

use crate::commands::ai::{decrypt_key, encrypt_key};
use crate::commands::community_vault::{self as vault, VaultEntry};
use crate::db::{self, DbState};
use crate::error::AppError;

const DEFAULT_URL: &str = "https://lmu.cparfait.ovh";
const K_ENABLED: &str = "community_enabled";
const K_ENABLED_AT: &str = "community_enabled_at";
const K_HISTORY: &str = "community_history";
const K_INSTALL: &str = "community_install_id";
const K_TAG: &str = "community_tag";
const K_TOKEN: &str = "community_token_enc";
const K_ANON: &str = "community_anonymous";
const K_URL: &str = "community_url";
const K_LAST_SENT: &str = "community_last_sent_at";
const K_LAST_ERROR: &str = "community_last_error";
/// Anonymisation à confirmer côté serveur (désactivation hors connexion).
const K_ANON_PENDING: &str = "community_anon_pending";
/// Installation liée à un compte Steam (retrouvable sur un autre PC).
const K_STEAM: &str = "community_steam";
/// Page de connexion Steam : la seule adresse que l'app accepte d'ouvrir pour Steam.
const STEAM_LOGIN: &str = "https://steamcommunity.com/openid/login?";

/// Lot maximal accepté par le serveur.
const BATCH: usize = 50;
/// Délai maximal entre deux tentatives d'une session en échec transitoire.
const MAX_BACKOFF_SECS: i64 = 6 * 3600;

/// Une seule synchronisation à la fois (déclencheurs multiples : indexation, minuterie).
static SYNCING: AtomicBool = AtomicBool::new(false);

// ── Utilitaires ──────────────────────────────────────────────────────────────

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

fn sha256(data: &[u8]) -> Vec<u8> {
    ring::digest::digest(&ring::digest::SHA256, data).as_ref().to_vec()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Base64 standard avec remplissage (RFC 4648), pour `Content-Digest`.
fn b64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(T[(n >> 18 & 63) as usize] as char);
        out.push(T[(n >> 12 & 63) as usize] as char);
        out.push(if chunk.len() > 1 { T[(n >> 6 & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[(n & 63) as usize] as char } else { '=' });
    }
    out
}

/// En-tête `Content-Digest` (RFC 9530) du corps exact envoyé.
fn content_digest(body: &[u8]) -> String {
    format!("sha-256=:{}:", b64(&sha256(body)))
}

fn cfg(db: &DbState, key: &str) -> Result<Option<String>, AppError> {
    Ok(db::config_get(db, key)?.filter(|v| !v.is_empty()))
}

fn cfg_bool(db: &DbState, key: &str) -> Result<bool, AppError> {
    Ok(cfg(db, key)?.as_deref() == Some("1"))
}

/// URL de l'API. HTTPS obligatoire ; HTTP toléré uniquement vers la machine locale
/// (tests du service en développement, via la clé `community_url`).
fn api_base(db: &DbState) -> Result<String, AppError> {
    let url = cfg(db, K_URL)?.unwrap_or_else(|| DEFAULT_URL.to_string());
    let url = url.trim().trim_end_matches('/').to_string();
    let local = url.starts_with("http://127.0.0.1") || url.starts_with("http://localhost");
    if !url.starts_with("https://") && !local {
        return Err(AppError::Config("community_url : HTTPS obligatoire".into()));
    }
    Ok(format!("{url}/api/v1"))
}

fn client(base: &str) -> Result<reqwest::Client, AppError> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        // Certificat vérifié par rustls ; en HTTPS, aucune redirection vers HTTP.
        .https_only(base.starts_with("https://"))
        .user_agent(concat!("LMU-Stats-Viewer/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| AppError::Internal(format!("client HTTP : {e}")))
}

fn token(db: &DbState) -> Result<Option<String>, AppError> {
    match cfg(db, K_TOKEN)? {
        // Base copiée d'une autre machine : déchiffrement impossible → pas de jeton.
        Some(enc) => Ok(decrypt_key(&enc).ok().filter(|t| !t.is_empty())),
        None => Ok(None),
    }
}

fn net_err(e: reqwest::Error) -> AppError {
    AppError::Internal(format!("réseau : {e}"))
}

// ── Construction des résumés (données de la base locale) ─────────────────────

struct Candidate {
    timestamp: i64,
    session_type: String,
    setting: String,
    track: String,
    course: String,
    game_version: String,
    filename: String,
    result_id: i64,
    driver_name: String,
    car_class: String,
    car_model: String,
    aids: String,
}

struct Lap {
    lap_num: i64,
    time: f64,
    s: [Option<f64>; 3],
    top_speed: Option<f64>,
    fuel: Option<f64>,
    compound_f: String,
    compound_r: String,
}

fn truncate(s: &str, max: usize) -> String {
    s.trim().chars().take(max).collect()
}

/// « 0,Soft » → « Soft ».
fn compound_name(raw: &str) -> Option<String> {
    let name = raw.split_once(',').map_or(raw, |(_, n)| n).trim();
    (!name.is_empty()).then(|| truncate(name, 40))
}

fn is_wet(compound: &str) -> bool {
    let c = compound.to_lowercase();
    c.contains("wet") || c.contains("rain")
}

/// `control_aids` du XML (ex. « PlayerControl,TC=2,Clutch,AutoBlip ») → aides structurées.
fn parse_aids(raw: &str) -> Value {
    let lower = raw.to_lowercase().replace(' ', "");
    let tc = lower.split(',').find_map(|p| p.strip_prefix("tc=").and_then(|v| v.parse::<i64>().ok()));
    json!({
        "raw": truncate(raw, 200),
        "tc": tc.filter(|v| (0..=20).contains(v)),
        "brake_help": lower.contains("brakinghelp") || lower.contains("brakehelp"),
        "steer_help": lower.contains("steeringhelp") || lower.contains("steerhelp"),
        "auto_shift": lower.contains("autoshift"),
    })
}

fn valid_game_version(v: &str) -> bool {
    match v.split_once('.') {
        Some((a, b)) => {
            (1..=2).contains(&a.len())
                && (1..=4).contains(&b.len())
                && a.chars().all(|c| c.is_ascii_digit())
                && b.chars().all(|c| c.is_ascii_digit())
        }
        None => false,
    }
}

fn r3(v: f64) -> f64 {
    (v * 1000.0).round() / 1000.0
}

fn median(sorted: &[f64]) -> f64 {
    let n = sorted.len();
    if n % 2 == 1 {
        sorted[n / 2]
    } else {
        (sorted[n / 2 - 1] + sorted[n / 2]) / 2.0
    }
}

/// Sessions du joueur depuis `since` (horodatage Unix), les plus anciennes d'abord.
fn candidates(conn: &Connection, since: i64) -> rusqlite::Result<Vec<Candidate>> {
    let mut stmt = conn.prepare(
        "SELECT s.timestamp, s.session_type, s.setting, s.track, s.track_course, s.game_version,
                x.filename, r.id, r.driver_name, r.car_class, r.unique_car_name, r.control_aids
         FROM sessions s
         JOIN xml_index x ON x.id = s.xml_id
         JOIN results r ON r.session_id = s.id AND r.is_player = 1
         WHERE s.timestamp >= ?1
         ORDER BY s.timestamp, s.id",
    )?;
    let rows = stmt.query_map(params![since], |r| {
        Ok(Candidate {
            timestamp: r.get(0)?,
            session_type: r.get(1)?,
            setting: r.get(2)?,
            track: r.get(3)?,
            course: r.get(4)?,
            game_version: r.get(5)?,
            filename: r.get(6)?,
            result_id: r.get(7)?,
            driver_name: r.get(8)?,
            car_class: r.get(9)?,
            car_model: r.get(10)?,
            aids: r.get(11)?,
        })
    })?;
    rows.collect()
}

fn valid_laps(conn: &Connection, result_id: i64) -> rusqlite::Result<Vec<Lap>> {
    let mut stmt = conn.prepare(
        "SELECT lap_num, lap_time, s1, s2, s3, top_speed, fuel, fcompound, rcompound
         FROM laps
         WHERE result_id = ?1 AND is_valid = 1 AND is_pit = 0 AND lap_time > 0
         ORDER BY lap_num",
    )?;
    let rows = stmt.query_map(params![result_id], |r| {
        Ok(Lap {
            lap_num: r.get(0)?,
            time: r.get(1)?,
            s: [r.get(2)?, r.get(3)?, r.get(4)?],
            top_speed: r.get(5)?,
            fuel: r.get(6)?,
            compound_f: r.get(7)?,
            compound_r: r.get(8)?,
        })
    })?;
    rows.collect()
}

/// Clé d'idempotence : stable pour une installation et un fichier de session, même
/// après réindexation ; non réversible (le nom du fichier ne part jamais en clair).
fn session_key(install_id: &str, filename: &str) -> String {
    hex(&sha256(format!("{install_id}|{filename}").as_bytes()))
}

/// Résumé d'une session au format du serveur (`community/shared/src/session.ts`).
/// `None` si la session n'a rien d'envoyable (aucun tour valide, données hors bornes).
fn build_summary(conn: &Connection, c: &Candidate, key: &str) -> rusqlite::Result<Option<Value>> {
    if !valid_game_version(&c.game_version)
        || c.car_class.trim().is_empty()
        || c.car_model.trim().is_empty()
        || c.driver_name.trim().is_empty()
        || c.track.trim().is_empty()
    {
        return Ok(None);
    }
    let laps: Vec<Lap> = valid_laps(conn, c.result_id)?
        .into_iter()
        .filter(|l| l.time > 20.0 && l.time < 1200.0)
        .collect();
    let Some(best) = laps.iter().min_by(|a, b| a.time.total_cmp(&b.time)) else {
        return Ok(None);
    };
    let mut times: Vec<f64> = laps.iter().map(|l| l.time).collect();
    times.sort_by(f64::total_cmp);

    // Secteurs du meilleur tour : envoyés seulement s'ils sont complets et cohérents.
    let sectors = match best.s {
        [Some(a), Some(b), Some(c3)] if a > 0.0 && b > 0.0 && c3 > 0.0 && (a + b + c3 - best.time).abs() <= 0.05 => {
            [Some(r3(a)), Some(r3(b)), Some(r3(c3))]
        }
        _ => [None, None, None],
    };
    let best_sector = |i: usize| {
        laps.iter()
            .filter_map(|l| l.s[i])
            .filter(|v| *v > 0.0 && *v < 900.0)
            .min_by(f64::total_cmp)
            .map(r3)
    };
    let played_on = chrono::DateTime::from_timestamp(c.timestamp, 0)
        .map(|d| d.date_naive().format("%Y-%m-%d").to_string())
        .unwrap_or_default();
    let compound_f = compound_name(&best.compound_f);
    let compound_r = compound_name(&best.compound_r);
    let wet = compound_f.as_deref().is_some_and(is_wet) || compound_r.as_deref().is_some_and(is_wet);

    Ok(Some(json!({
        "schema": 1,
        "session_key": key,
        "app_version": env!("CARGO_PKG_VERSION"),
        "game_version": c.game_version,
        "played_on": played_on,
        "session_type": truncate(&c.session_type, 32),
        "setting": truncate(&c.setting, 32),
        "track": truncate(&c.track, 120),
        "track_course": truncate(if c.course.trim().is_empty() { &c.track } else { &c.course }, 120),
        "car_class": truncate(&c.car_class, 32),
        "car_model": truncate(&c.car_model, 120),
        "driver_name": truncate(&c.driver_name, 64),
        "aids": parse_aids(&c.aids),
        "best_lap": {
            "time": r3(best.time),
            "s1": sectors[0], "s2": sectors[1], "s3": sectors[2],
            "lap_num": best.lap_num.clamp(0, 10000),
            "top_speed": best.top_speed.filter(|v| (0.0..=500.0).contains(v)),
            "fuel": best.fuel.filter(|v| (0.0..=1000.0).contains(v)),
            "compound_f": compound_f,
            "compound_r": compound_r,
        },
        "best_sectors": { "s1": best_sector(0), "s2": best_sector(1), "s3": best_sector(2) },
        "valid_laps": laps.len().min(10000),
        "median_lap": r3(median(&times)),
        "wet": wet,
        "has_telemetry": false,
    })))
}

/// Point de départ des sessions à partager : tout l'historique si demandé, sinon
/// seulement celles jouées après l'activation.
fn since(db: &DbState) -> Result<i64, AppError> {
    if cfg_bool(db, K_HISTORY)? {
        return Ok(0);
    }
    Ok(cfg(db, K_ENABLED_AT)?.and_then(|v| v.parse().ok()).unwrap_or(i64::MAX))
}

/// Résumés à envoyer maintenant : ni déjà confirmés, ni refusés définitivement, et dont
/// le délai de nouvelle tentative est écoulé.
fn pending_payloads(db: &DbState, install_id: &str, limit: usize) -> Result<(Vec<Value>, usize), AppError> {
    let from = since(db)?;
    let conn = db::get_conn(db)?;
    let t = now();
    let mut out = Vec::new();
    let mut total = 0usize;
    for c in candidates(&conn, from).map_err(|e| AppError::Database(e.to_string()))? {
        let key = session_key(install_id, &c.filename);
        let row: Option<(String, i64)> = conn
            .query_row(
                "SELECT state, next_try_at FROM community_outbox WHERE session_key = ?1",
                params![key],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(|e| AppError::Database(e.to_string()))?;
        match &row {
            Some((state, _)) if state == "sent" || state == "rejected" => continue,
            _ => {}
        }
        let Some(summary) = build_summary(&conn, &c, &key).map_err(|e| AppError::Database(e.to_string()))? else {
            continue;
        };
        total += 1;
        let due = row.map_or(true, |(_, next)| next <= t);
        if due && out.len() < limit {
            out.push(summary);
        }
    }
    Ok((out, total))
}

fn mark(conn: &Connection, key: &str, state: &str, reason: Option<&str>, retry_in: Option<i64>) -> rusqlite::Result<()> {
    let t = now();
    conn.execute(
        "INSERT INTO community_outbox (session_key, state, reason, attempts, next_try_at, updated_at)
         VALUES (?1, ?2, ?3, CASE WHEN ?4 IS NULL THEN 0 ELSE 1 END, ?5, ?6)
         ON CONFLICT(session_key) DO UPDATE SET
           state = excluded.state, reason = excluded.reason, updated_at = excluded.updated_at,
           attempts = CASE WHEN ?4 IS NULL THEN community_outbox.attempts ELSE community_outbox.attempts + 1 END,
           next_try_at = CASE WHEN ?4 IS NULL THEN 0
                              ELSE ?6 + MIN(?7, ?4 * (1 << MIN(community_outbox.attempts, 12))) END",
        params![key, state, reason, retry_in, retry_in.map(|r| t + r).unwrap_or(0), t, MAX_BACKOFF_SECS],
    )?;
    Ok(())
}

// ── Statut ───────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct CommunityStatus {
    pub enabled: bool,
    pub registered: bool,
    pub tag: Option<String>,
    pub anonymous: bool,
    pub history: bool,
    pub sent: i64,
    pub rejected: i64,
    pub pending: usize,
    /// Sessions déjà jouées envoyables (case « envoyer aussi mes sessions passées »).
    pub history_available: usize,
    pub last_sent_at: Option<i64>,
    pub last_error: Option<String>,
    pub server: String,
    /// Installation liée à Steam.
    pub steam_linked: bool,
    /// Non inscrit ici, mais une installation de ce PC est dans le coffre Windows :
    /// son repère (reprise à l'activation, ou suppression de ses données).
    pub vault_tag: Option<String>,
}

fn status(db: &DbState) -> Result<CommunityStatus, AppError> {
    let install = cfg(db, K_INSTALL)?;
    let enabled = cfg_bool(db, K_ENABLED)?;
    let (sent, rejected, history_available) = {
        let conn = db::get_conn(db)?;
        let count = |state: &str| -> Result<i64, AppError> {
            conn.query_row("SELECT COUNT(*) FROM community_outbox WHERE state = ?1", params![state], |r| r.get(0))
                .map_err(|e| AppError::Database(e.to_string()))
        };
        let mut available = 0usize;
        for c in candidates(&conn, 0).map_err(|e| AppError::Database(e.to_string()))? {
            if build_summary(&conn, &c, "").map_err(|e| AppError::Database(e.to_string()))?.is_some() {
                available += 1;
            }
        }
        (count("sent")?, count("rejected")?, available)
    };
    let pending = match (&install, enabled) {
        (Some(id), true) => pending_payloads(db, id, 0)?.1,
        _ => 0,
    };
    let registered = install.is_some() && token(db)?.is_some();
    let vault_tag = if registered { None } else { vault_for(db)?.map(|e| e.tag) };
    Ok(CommunityStatus {
        enabled,
        registered,
        tag: cfg(db, K_TAG)?,
        anonymous: cfg_bool(db, K_ANON)?,
        history: cfg_bool(db, K_HISTORY)?,
        sent,
        rejected,
        pending,
        history_available,
        last_sent_at: cfg(db, K_LAST_SENT)?.and_then(|v| v.parse().ok()),
        last_error: cfg(db, K_LAST_ERROR)?,
        server: cfg(db, K_URL)?.unwrap_or_else(|| DEFAULT_URL.to_string()),
        steam_linked: cfg_bool(db, K_STEAM)?,
        vault_tag,
    })
}

// ── Identité : base locale + coffre Windows ──────────────────────────────────

/// Entrée du coffre valable pour le serveur courant.
fn vault_for(db: &DbState) -> Result<Option<VaultEntry>, AppError> {
    let base = api_base(db)?;
    Ok(vault::load().filter(|e| e.server == base))
}

/// Enregistre l'identité (base chiffrée + coffre Windows).
fn store_identity(db: &DbState, install_id: &str, tag: &str, token: &str) -> Result<(), AppError> {
    db::config_set(db, K_INSTALL, install_id)?;
    db::config_set(db, K_TAG, tag)?;
    db::config_set(db, K_TOKEN, &encrypt_key(token)?)?;
    vault::save(&VaultEntry {
        server: api_base(db)?,
        install_id: install_id.to_string(),
        tag: tag.to_string(),
        token: token.to_string(),
    });
    Ok(())
}

/// Base locale sans jeton (réinstallation, données effacées) : reprend l'identité du
/// coffre Windows. `true` si une identité a été reprise.
fn restore_from_vault(db: &DbState) -> Result<bool, AppError> {
    if token(db)?.is_some() {
        return Ok(false);
    }
    let Some(e) = vault_for(db)? else { return Ok(false) };
    db::config_set(db, K_INSTALL, &e.install_id)?;
    db::config_set(db, K_TAG, &e.tag)?;
    db::config_set(db, K_TOKEN, &encrypt_key(&e.token)?)?;
    Ok(true)
}

/// Oublie l'identité (base + coffre).
fn forget_identity(db: &DbState) -> Result<(), AppError> {
    for k in [K_INSTALL, K_TAG, K_TOKEN, K_STEAM] {
        db::config_set(db, k, "")?;
    }
    vault::clear();
    Ok(())
}

async fn register_install(db: &DbState) -> Result<(), AppError> {
    let base = api_base(db)?;
    let resp = client(&base)?.post(format!("{base}/register")).send().await.map_err(net_err)?;
    if resp.status().as_u16() != 201 {
        return Err(AppError::Internal(format!("serveur : HTTP {}", resp.status().as_u16())));
    }
    let v: Value = resp.json().await.map_err(net_err)?;
    let (Some(id), Some(tok), Some(tag)) = (v["install_id"].as_str(), v["token"].as_str(), v["tag"].as_str()) else {
        return Err(AppError::Internal("serveur : réponse d'enregistrement invalide".into()));
    };
    store_identity(db, id, tag, tok)
}

#[tauri::command]
pub fn community_status(db: State<'_, DbState>) -> Result<CommunityStatus, AppError> {
    status(&db)
}

/// Aperçu lisible de ce qui partirait pour la session la plus récente (transparence :
/// consultable AVANT d'activer le partage).
#[tauri::command]
pub fn community_preview(db: State<'_, DbState>) -> Result<String, AppError> {
    let conn = db::get_conn(&db)?;
    let all = candidates(&conn, 0).map_err(|e| AppError::Database(e.to_string()))?;
    for c in all.iter().rev() {
        if let Some(v) = build_summary(&conn, c, "(empreinte calculée à l'envoi)").map_err(|e| AppError::Database(e.to_string()))? {
            return serde_json::to_string_pretty(&v).map_err(|e| AppError::Internal(e.to_string()));
        }
    }
    Ok(String::new())
}

// ── Activation, anonymat, suppression ────────────────────────────────────────

async fn patch_anonymous(db: &DbState, anonymous: bool) -> Result<(), AppError> {
    match patch_anonymous_code(db, anonymous).await? {
        c if (200..300).contains(&c) => Ok(()),
        c => Err(AppError::Internal(format!("serveur : HTTP {c}"))),
    }
}

/// Code HTTP de `PATCH /me` (204 si pas de jeton : rien à faire).
async fn patch_anonymous_code(db: &DbState, anonymous: bool) -> Result<u16, AppError> {
    let Some(tok) = token(db)? else { return Ok(204) };
    let base = api_base(db)?;
    let resp = client(&base)?
        .patch(format!("{base}/me"))
        .bearer_auth(tok)
        .json(&json!({ "anonymous": anonymous }))
        .send()
        .await
        .map_err(net_err)?;
    Ok(resp.status().as_u16())
}

/// Active le partage (enregistre l'installation au premier usage). `history` : envoyer
/// aussi les sessions déjà jouées ; sinon seulement celles jouées à partir de maintenant.
#[tauri::command]
pub async fn community_enable(
    history: bool,
    anonymous: bool,
    db: State<'_, DbState>,
) -> Result<CommunityStatus, AppError> {
    enable_inner(&db, history, anonymous).await
}

async fn enable_inner(db: &DbState, history: bool, anonymous: bool) -> Result<CommunityStatus, AppError> {
    // Même PC après réinstallation : on reprend l'installation du coffre Windows.
    restore_from_vault(db)?;
    if token(db)?.is_none() {
        register_install(db).await?;
    } else if let (Some(id), Some(tag), Some(tok)) = (cfg(db, K_INSTALL)?, cfg(db, K_TAG)?, token(db)?) {
        // Installation créée avant le coffre (ou coffre effacé) : on l'y range.
        if vault_for(db)?.map(|e| e.install_id) != Some(id.clone()) {
            store_identity(db, &id, &tag, &tok)?;
        }
    }
    db::config_set(db, K_ANON, if anonymous { "1" } else { "0" })?;
    if patch_anonymous_code(db, anonymous).await? == 401 {
        // Installation effacée côté serveur entre-temps : on repart d'une nouvelle.
        forget_identity(db)?;
        db::get_conn(db)?
            .execute("DELETE FROM community_outbox", [])
            .map_err(|e| AppError::Database(e.to_string()))?;
        register_install(db).await?;
    }
    patch_anonymous(db, anonymous).await?;
    db::config_set(db, K_HISTORY, if history { "1" } else { "0" })?;
    db::config_set(db, K_ENABLED_AT, &now().to_string())?;
    db::config_set(db, K_ENABLED, "1")?;
    db::config_set(db, K_LAST_ERROR, "")?;
    status(db)
}

/// Arrête l'envoi. Les données déjà partagées restent sur le serveur (voir
/// `community_delete` pour les effacer).
#[tauri::command]
pub async fn community_disable(db: State<'_, DbState>) -> Result<CommunityStatus, AppError> {
    disable_inner(&db).await
}

/// Désactiver le partage : plus rien ne part, et les temps déjà partagés sont
/// ANONYMISÉS sur le serveur (ils restent dans les statistiques, sans nom). Hors
/// connexion, l'anonymisation est retentée par la synchronisation jusqu'à confirmation.
async fn disable_inner(db: &DbState) -> Result<CommunityStatus, AppError> {
    db::config_set(db, K_ENABLED, "0")?;
    db::config_set(db, K_ANON, "1")?;
    if token(db)?.is_some() {
        let ok = patch_anonymous(db, true).await.is_ok();
        db::config_set(db, K_ANON_PENDING, if ok { "" } else { "1" })?;
    }
    status(db)
}

#[tauri::command]
pub async fn community_set_anonymous(anonymous: bool, db: State<'_, DbState>) -> Result<CommunityStatus, AppError> {
    set_anonymous_inner(&db, anonymous).await
}

async fn set_anonymous_inner(db: &DbState, anonymous: bool) -> Result<CommunityStatus, AppError> {
    patch_anonymous(db, anonymous).await?;
    db::config_set(db, K_ANON, if anonymous { "1" } else { "0" })?;
    status(db)
}

/// Efface TOUTES les données de ce joueur sur le serveur, puis l'état local. En cas
/// d'échec réseau, rien n'est effacé localement : sinon le jeton serait perdu et les
/// données du serveur ne pourraient plus jamais être supprimées.
#[tauri::command]
pub async fn community_delete(db: State<'_, DbState>) -> Result<CommunityStatus, AppError> {
    delete_inner(&db).await
}

async fn delete_inner(db: &DbState) -> Result<CommunityStatus, AppError> {
    // Base locale sans jeton : celui du coffre Windows permet encore d'effacer le serveur.
    restore_from_vault(db)?;
    if let Some(tok) = token(db)? {
        let base = api_base(db)?;
        let resp = client(&base)?
            .delete(format!("{base}/me"))
            .bearer_auth(tok)
            .send()
            .await
            .map_err(net_err)?;
        let code = resp.status().as_u16();
        // 401 : l'installation n'existe déjà plus côté serveur.
        if code != 204 && code != 401 {
            return Err(AppError::Internal(format!("serveur : HTTP {code}")));
        }
    }
    for k in [K_ENABLED, K_ENABLED_AT, K_HISTORY, K_ANON, K_LAST_SENT, K_LAST_ERROR, K_ANON_PENDING] {
        db::config_set(db, k, "")?;
    }
    forget_identity(db)?;
    db::get_conn(db)?
        .execute("DELETE FROM community_outbox", [])
        .map_err(|e| AppError::Database(e.to_string()))?;
    status(db)
}

// ── Se connecter avec Steam ──────────────────────────────────────────────────

#[derive(Serialize)]
pub struct SteamStart {
    /// Page de connexion officielle de Steam, à ouvrir dans le navigateur.
    pub url: String,
    /// Identifiant secret à interroger (`community_steam_poll`).
    pub poll_id: String,
}

/// Commence une connexion Steam. `link` : lier l'installation de ce PC (jeton requis) ;
/// `recover` : retrouver une installation liée depuis un autre PC.
#[tauri::command]
pub async fn community_steam_start(mode: String, db: State<'_, DbState>) -> Result<SteamStart, AppError> {
    if mode != "link" && mode != "recover" {
        return Err(AppError::Internal("mode Steam inconnu".into()));
    }
    let base = api_base(&db)?;
    let mut req = client(&base)?.post(format!("{base}/steam/start")).json(&json!({ "mode": mode }));
    if mode == "link" {
        let Some(tok) = token(&db)? else {
            return Err(AppError::Internal("partage non activé".into()));
        };
        req = req.bearer_auth(tok);
    }
    let resp = req.send().await.map_err(net_err)?;
    if !resp.status().is_success() {
        return Err(AppError::Internal(format!("serveur : HTTP {}", resp.status().as_u16())));
    }
    let v: Value = resp.json().await.map_err(net_err)?;
    let (Some(url), Some(poll_id)) = (v["url"].as_str(), v["poll_id"].as_str()) else {
        return Err(AppError::Internal("serveur : réponse Steam invalide".into()));
    };
    // Jamais d'autre adresse que la page de connexion de Steam.
    if !url.starts_with(STEAM_LOGIN) {
        return Err(AppError::Internal("serveur : adresse Steam inattendue".into()));
    }
    Ok(SteamStart { url: url.to_string(), poll_id: poll_id.to_string() })
}

#[derive(Serialize, Default)]
pub struct SteamPoll {
    /// pending | ok | not_found | taken | invalid | expired
    pub status: String,
    /// Installation retrouvée (mode `recover`).
    pub tag: Option<String>,
    pub anonymous: Option<bool>,
}

/// Interroge le serveur. `recover` réussi : l'identité retrouvée remplace celle de ce
/// PC (jeton neuf, l'ancien est révoqué) ; le partage reste à réactiver par le joueur.
#[tauri::command]
pub async fn community_steam_poll(poll_id: String, db: State<'_, DbState>) -> Result<SteamPoll, AppError> {
    let base = api_base(&db)?;
    let resp = client(&base)?
        .get(format!("{base}/steam/poll"))
        .query(&[("id", poll_id.as_str())])
        .send()
        .await
        .map_err(net_err)?;
    if !resp.status().is_success() {
        return Err(AppError::Internal(format!("serveur : HTTP {}", resp.status().as_u16())));
    }
    let v: Value = resp.json().await.map_err(net_err)?;
    let status = v["status"].as_str().unwrap_or("invalid").to_string();
    if status != "ok" {
        return Ok(SteamPoll { status, ..Default::default() });
    }
    if v["mode"].as_str() == Some("link") {
        db::config_set(&db, K_STEAM, "1")?;
        return Ok(SteamPoll { status, ..Default::default() });
    }
    let (Some(id), Some(tag), Some(tok)) = (v["install_id"].as_str(), v["tag"].as_str(), v["token"].as_str()) else {
        return Err(AppError::Internal("serveur : réponse Steam invalide".into()));
    };
    let anonymous = v["anonymous"].as_bool().unwrap_or(false);
    // Nouvelle identité : les accusés locaux concernaient une autre installation.
    db::get_conn(&db)?
        .execute("DELETE FROM community_outbox", [])
        .map_err(|e| AppError::Database(e.to_string()))?;
    store_identity(&db, id, tag, tok)?;
    db::config_set(&db, K_STEAM, "1")?;
    db::config_set(&db, K_ANON, if anonymous { "1" } else { "0" })?;
    db::config_set(&db, K_LAST_ERROR, "")?;
    Ok(SteamPoll { status, tag: Some(tag.to_string()), anonymous: Some(anonymous) })
}

/// Délie l'installation de Steam (elle ne sera plus retrouvable par Steam).
#[tauri::command]
pub async fn community_steam_unlink(db: State<'_, DbState>) -> Result<CommunityStatus, AppError> {
    if let Some(tok) = token(&db)? {
        let base = api_base(&db)?;
        let resp = client(&base)?
            .delete(format!("{base}/steam/link"))
            .bearer_auth(tok)
            .send()
            .await
            .map_err(net_err)?;
        let code = resp.status().as_u16();
        if code != 204 && code != 401 {
            return Err(AppError::Internal(format!("serveur : HTTP {code}")));
        }
    }
    db::config_set(&db, K_STEAM, "")?;
    status(&db)
}

// ── Synchronisation ──────────────────────────────────────────────────────────

#[derive(Serialize, Default)]
pub struct SyncReport {
    pub sent: usize,
    pub duplicates: usize,
    pub rejected: usize,
    pub pending: usize,
    pub error: Option<String>,
}

/// Refus définitifs (jamais renvoyés) vs transitoires (retentés plus tard).
fn is_transient(reason: &str) -> bool {
    reason == "daily_quota"
}

/// Envoie les sessions en attente par lots. Sans effet si le partage est désactivé.
#[tauri::command]
pub async fn community_sync(db: State<'_, DbState>) -> Result<SyncReport, AppError> {
    sync(&db).await
}

async fn sync(db: &DbState) -> Result<SyncReport, AppError> {
    // Anonymisation en attente (partage désactivé hors connexion) : prioritaire.
    if cfg_bool(db, K_ANON_PENDING)? && patch_anonymous(db, true).await.is_ok() {
        db::config_set(db, K_ANON_PENDING, "")?;
    }
    if !cfg_bool(db, K_ENABLED)? {
        return Ok(SyncReport::default());
    }
    if SYNCING.swap(true, Ordering::SeqCst) {
        return Ok(SyncReport::default());
    }
    let out = sync_inner(db).await;
    SYNCING.store(false, Ordering::SeqCst);
    let report = out?;
    db::config_set(db, K_LAST_ERROR, report.error.as_deref().unwrap_or(""))?;
    Ok(report)
}

/// Applique l'accusé du serveur à la file (synchrone : aucun verrou pendant un appel
/// réseau). Renvoie le nombre de sessions du lot tranchées (reçues ou refusées).
fn apply_ack(db: &DbState, keys: &[String], ack: &Value, report: &mut SyncReport) -> Result<usize, AppError> {
    let conn = db::get_conn(db)?;
    let dbe = |e: rusqlite::Error| AppError::Database(e.to_string());
    let mut settled = std::collections::HashSet::new();
    for k in ack["received"].as_array().into_iter().flatten().filter_map(Value::as_str) {
        if keys.iter().any(|x| x == k) {
            mark(&conn, k, "sent", None, None).map_err(dbe)?;
            settled.insert(k.to_string());
        }
    }
    for rj in ack["rejected"].as_array().into_iter().flatten() {
        let (Some(k), Some(reason)) = (rj["session_key"].as_str(), rj["reason"].as_str()) else { continue };
        if !keys.iter().any(|x| x == k) || settled.contains(k) {
            continue;
        }
        if is_transient(reason) {
            mark(&conn, k, "pending", Some(reason), Some(6 * 3600)).map_err(dbe)?;
            report.error = Some(reason.to_string());
        } else {
            mark(&conn, k, "rejected", Some(reason), None).map_err(dbe)?;
            report.rejected += 1;
        }
        settled.insert(k.to_string());
    }
    // Ni confirmée ni refusée (ne devrait pas arriver) : on retentera.
    for k in keys.iter().filter(|k| !settled.contains(*k)) {
        mark(&conn, k, "pending", Some("unacknowledged"), Some(60)).map_err(dbe)?;
    }
    report.sent += ack["accepted"].as_u64().unwrap_or(0) as usize;
    report.duplicates += ack["duplicates"].as_u64().unwrap_or(0) as usize;
    Ok(settled.len())
}

async fn sync_inner(db: &DbState) -> Result<SyncReport, AppError> {
    let mut report = SyncReport::default();
    let (Some(install), Some(tok)) = (cfg(db, K_INSTALL)?, token(db)?) else {
        report.error = Some("not_registered".into());
        return Ok(report);
    };
    let base = api_base(db)?;
    let http = client(&base)?;

    loop {
        let (batch, _) = pending_payloads(db, &install, BATCH)?;
        if batch.is_empty() {
            break;
        }
        let keys: Vec<String> = batch.iter().filter_map(|v| v["session_key"].as_str().map(String::from)).collect();
        let body = json!({ "sessions": batch }).to_string();
        let sent = http
            .post(format!("{base}/sessions"))
            .bearer_auth(&tok)
            .header("content-type", "application/json")
            .header("content-digest", content_digest(body.as_bytes()))
            .body(body)
            .send()
            .await;

        // Coupure, serveur injoignable, surcharge : tout le lot reste en attente.
        let fail = |report: &mut SyncReport, msg: String, retry: i64| -> Result<(), AppError> {
            let conn = db::get_conn(db)?;
            for k in &keys {
                mark(&conn, k, "pending", Some("transient"), Some(retry)).map_err(|e| AppError::Database(e.to_string()))?;
            }
            report.error = Some(msg);
            Ok(())
        };
        let resp = match sent {
            Ok(r) => r,
            Err(e) => {
                fail(&mut report, format!("network: {e}"), 60)?;
                break;
            }
        };
        let code = resp.status().as_u16();
        if code != 200 {
            let retry = resp
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or(60);
            fail(&mut report, format!("http_{code}"), retry.max(60))?;
            break;
        }
        // Accusé illisible (réponse tronquée) : rien n'est considéré comme reçu, le lot
        // repartira ; le serveur le reconnaîtra (idempotence) sans doublon.
        let ack: Value = match resp.json().await {
            Ok(v) => v,
            Err(e) => {
                fail(&mut report, format!("bad_ack: {e}"), 60)?;
                break;
            }
        };
        let settled = apply_ack(db, &keys, &ack, &mut report)?;
        if settled > 0 && ack["received"].as_array().is_some_and(|a| !a.is_empty()) {
            db::config_set(db, K_LAST_SENT, &now().to_string())?;
        }
        // Un lot entièrement reporté (quota) : inutile d'insister maintenant.
        if settled == 0 || report.error.is_some() {
            break;
        }
    }
    report.pending = pending_payloads(db, &install, 0)?.1;
    Ok(report)
}

// ── Lectures publiques (page « Classement », lot 4) ──────────────────────────

/// Routes publiques autorisées (agrégats seulement ; aucune donnée personnelle).
const PUBLIC_ROUTES: [&str; 5] = ["stats", "combos", "combos/detail", "combos/leaderboard", "combos/position"];

/// Lecture publique du service (sans jeton). `null` si le combo n'existe pas (404).
#[tauri::command]
pub async fn community_public(
    route: String,
    query: Vec<(String, String)>,
    db: State<'_, DbState>,
) -> Result<Value, AppError> {
    public_inner(&db, &route, &query).await
}

async fn public_inner(db: &DbState, route: &str, query: &[(String, String)]) -> Result<Value, AppError> {
    if !PUBLIC_ROUTES.contains(&route) {
        return Err(AppError::Unsupported(format!("route : {route}")));
    }
    let base = api_base(db)?;
    let resp = client(&base)?
        .get(format!("{base}/{route}"))
        .query(query)
        .send()
        .await
        .map_err(net_err)?;
    match resp.status().as_u16() {
        200 => resp.json().await.map_err(net_err),
        404 => Ok(Value::Null),
        code => Err(AppError::Internal(format!("serveur : HTTP {code}"))),
    }
}

#[derive(Serialize)]
pub struct MyCombo {
    pub track: String,
    pub track_course: String,
    pub car_class: String,
    pub car_model: String,
    pub best: f64,
    pub last_played: i64,
}

/// Filtres de la page Classements (mêmes règles que le serveur : `session`, `mode`) et
/// version du jeu comme la page Sessions (`>=` ou `=` si `version_exact`).
#[derive(Debug, Default, Deserialize)]
pub struct MyCombosFilter {
    pub session: Option<String>,
    pub mode: Option<String>,
    pub version: Option<String>,
    pub version_exact: Option<bool>,
}

/// Meilleur tour du joueur par combo circuit × tracé × classe (base locale, tours
/// valides hors stands, sur le sec) : sert à le placer dans les classements.
#[tauri::command]
pub fn community_my_combos(
    db: State<'_, DbState>,
    filters: Option<MyCombosFilter>,
) -> Result<Vec<MyCombo>, AppError> {
    my_combos_inner(&db, &filters.unwrap_or_default())
}

fn my_combos_inner(db: &DbState, f: &MyCombosFilter) -> Result<Vec<MyCombo>, AppError> {
    let conn = db::get_conn(db)?;
    let dbe = |e: rusqlite::Error| AppError::Database(e.to_string());
    let mut extra = String::new();
    match f.session.as_deref() {
        Some("race") => extra.push_str(" AND s.session_type = 'Race'"),
        Some("qualify") => extra.push_str(" AND s.session_type LIKE 'Qual%'"),
        Some("practice") => extra.push_str(" AND (s.session_type LIKE 'Practice%' OR s.session_type LIKE 'Warmup%')"),
        _ => {}
    }
    match f.mode.as_deref() {
        Some("online") => extra.push_str(" AND s.setting = 'Multiplayer'"),
        Some("offline") => extra.push_str(" AND s.setting <> 'Multiplayer'"),
        _ => {}
    }
    let mut params: Vec<String> = Vec::new();
    if let Some(v) = f.version.as_deref().filter(|v| !v.is_empty() && *v != "all") {
        params.push(v.to_string());
        let op = if f.version_exact.unwrap_or(false) { "=" } else { ">=" };
        extra.push_str(&format!(" AND s.game_version {op} ?1"));
    }
    let sql = format!(
        "SELECT s.track, CASE WHEN s.track_course = '' THEN s.track ELSE s.track_course END,
                r.car_class, r.unique_car_name, l.lap_time, s.timestamp, l.fcompound, l.rcompound
         FROM laps l
         JOIN results r ON r.id = l.result_id AND r.is_player = 1
         JOIN sessions s ON s.id = l.session_id
         WHERE l.is_valid = 1 AND l.is_pit = 0 AND l.lap_time > 20 AND l.lap_time < 1200
           AND r.car_class <> '' AND r.unique_car_name <> ''{extra}"
    );
    let mut stmt = conn.prepare(&sql).map_err(dbe)?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(params.iter()), |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, f64>(4)?,
                r.get::<_, i64>(5)?,
                r.get::<_, String>(6)?,
                r.get::<_, String>(7)?,
            ))
        })
        .map_err(dbe)?;
    let mut map: std::collections::HashMap<(String, String, String), MyCombo> = std::collections::HashMap::new();
    for row in rows {
        let (track, course, class, car, time, ts, cf, cr) = row.map_err(dbe)?;
        if is_wet(&cf) || is_wet(&cr) {
            continue;
        }
        let e = map.entry((track.clone(), course.clone(), class.clone())).or_insert(MyCombo {
            track,
            track_course: course,
            car_class: class,
            car_model: car.clone(),
            best: f64::MAX,
            last_played: 0,
        });
        if time < e.best {
            e.best = r3(time);
            e.car_model = car;
        }
        e.last_played = e.last_played.max(ts);
    }
    let mut out: Vec<MyCombo> = map.into_values().collect();
    out.sort_by(|a, b| b.last_played.cmp(&a.last_played));
    Ok(out)
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_rfc4648_vectors() {
        for (i, o) in [("", ""), ("f", "Zg=="), ("fo", "Zm8="), ("foo", "Zm9v"), ("foob", "Zm9vYg=="), ("foobar", "Zm9vYmFy")] {
            assert_eq!(b64(i.as_bytes()), o);
        }
    }

    #[test]
    fn content_digest_matches_server_format() {
        // sha256("abc") en base64 — même calcul que `digestMatches` côté serveur.
        assert_eq!(content_digest(b"abc"), "sha-256=:ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=:");
    }

    #[test]
    fn aids_and_compounds() {
        let a = parse_aids("PlayerControl,TC=2,Clutch,AutoBlip");
        assert_eq!(a["tc"], 2);
        assert_eq!(a["brake_help"], false);
        let b = parse_aids("PlayerControl,BrakingHelp=2,SteeringHelp=1,AutoShift=3");
        assert_eq!(b["brake_help"], true);
        assert_eq!(b["steer_help"], true);
        assert_eq!(b["auto_shift"], true);
        assert_eq!(compound_name("0,Soft").as_deref(), Some("Soft"));
        assert_eq!(compound_name("").as_deref(), None);
        assert!(is_wet("Wet"));
        assert!(!is_wet("Medium"));
        assert!(valid_game_version("1.4200"));
        assert!(!valid_game_version(""));
        assert!(!valid_game_version("1.42.1"));
    }

    fn seed(conn: &Connection) -> i64 {
        conn.execute(
            "INSERT INTO xml_index (filename, file_path, mtime) VALUES ('2026_09_22_21_35_23-99R1.xml', 'x', 0)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sessions (xml_id, session_type, timestamp, track, track_course, setting, game_version)
             VALUES (1, 'Race', 1790105416, 'Michelin Raceway Road Atlanta', 'Michelin Raceway Road Atlanta', 'Multiplayer', '1.4200')",
            [],
        )
        .unwrap();
        // Le joueur + un autre pilote (dont les tours ne doivent JAMAIS partir).
        conn.execute(
            "INSERT INTO results (session_id, driver_name, is_player, car_class, unique_car_name, control_aids)
             VALUES (1, 'Cris Tof', 1, 'GT3', 'Lamborghini Huracan LMGT3 Evo2', 'PlayerControl,TC=2'),
                    (1, 'Autre Pilote', 0, 'GT3', 'BMW M4 LMGT3', '')",
            [],
        )
        .unwrap();
        let lap = |rid: i64, n: i64, t: Option<f64>, s: [f64; 3], valid: i64, pit: i64| {
            conn.execute(
                "INSERT INTO laps (result_id, session_id, driver_name, lap_num, lap_time, s1, s2, s3, fcompound, rcompound, is_valid, is_pit)
                 VALUES (?1, 1, 'x', ?2, ?3, ?4, ?5, ?6, '0,Medium', '0,Medium', ?7, ?8)",
                params![rid, n, t, s[0], s[1], s[2], valid, pit],
            )
            .unwrap();
        };
        lap(1, 1, None, [0.0, 0.0, 0.0], 0, 0);
        lap(1, 2, Some(82.0), [26.0, 32.5, 23.5], 1, 0);
        lap(1, 3, Some(81.48), [25.788, 32.266, 23.426], 1, 0);
        lap(1, 4, Some(79.0), [25.0, 31.0, 23.0], 1, 1); // passage aux stands : exclu
        lap(1, 5, Some(83.0), [25.5, 34.0, 23.5], 1, 0);
        lap(2, 2, Some(70.0), [22.0, 26.0, 22.0], 1, 0); // autre pilote : exclu
        1
    }

    #[test]
    fn summary_uses_only_player_valid_non_pit_laps() {
        let conn = db::open_test_db();
        seed(&conn);
        let cands = candidates(&conn, 0).unwrap();
        assert_eq!(cands.len(), 1, "une seule ligne : le joueur");
        let key = session_key("install", &cands[0].filename);
        let s = build_summary(&conn, &cands[0], &key).unwrap().unwrap();
        assert_eq!(s["driver_name"], "Cris Tof");
        assert_eq!(s["best_lap"]["time"], 81.48);
        assert_eq!(s["best_lap"]["lap_num"], 3);
        assert_eq!(s["valid_laps"], 3);
        assert_eq!(s["median_lap"], 82.0);
        assert_eq!(s["best_sectors"]["s1"], 25.5);
        assert_eq!(s["best_lap"]["compound_f"], "Medium");
        assert_eq!(s["played_on"], "2026-09-22");
        assert_eq!(s["session_key"].as_str().unwrap().len(), 64);
        assert_eq!(s["aids"]["tc"], 2);
        assert_eq!(s["wet"], false);
    }

    #[test]
    fn my_combos_filters_match_server_rules() {
        let conn = db::open_test_db();
        seed(&conn);
        let st = db::state_from(conn);
        let count = |session: Option<&str>, mode: Option<&str>, version: Option<&str>, exact: bool| {
            let f = MyCombosFilter {
                session: session.map(String::from),
                mode: mode.map(String::from),
                version: version.map(String::from),
                version_exact: Some(exact),
            };
            my_combos_inner(&st, &f).unwrap().len()
        };
        assert_eq!(count(None, None, None, false), 1);
        assert_eq!(count(Some("race"), Some("online"), None, false), 1);
        assert_eq!(count(Some("practice"), None, None, false), 0);
        assert_eq!(count(None, Some("offline"), None, false), 0);
        assert_eq!(count(None, None, Some("1.4100"), false), 1); // ≥ 1.41
        assert_eq!(count(None, None, Some("1.4100"), true), 0); // = 1.41 uniquement
        assert_eq!(count(None, None, Some("1.5000"), false), 0);
        // Meilleur tour valide hors stands (79.0 aux stands est exclu).
        assert_eq!(my_combos_inner(&st, &MyCombosFilter::default()).unwrap()[0].best, 81.48);
    }

    #[test]
    fn inconsistent_sectors_are_dropped_not_sent() {
        let conn = db::open_test_db();
        seed(&conn);
        conn.execute("UPDATE laps SET s1 = 10.0 WHERE lap_num = 3 AND result_id = 1", []).unwrap();
        let c = &candidates(&conn, 0).unwrap()[0];
        let s = build_summary(&conn, c, "k").unwrap().unwrap();
        assert!(s["best_lap"]["s1"].is_null());
        assert_eq!(s["best_lap"]["time"], 81.48);
    }

    #[test]
    fn session_without_valid_lap_is_not_sent() {
        let conn = db::open_test_db();
        seed(&conn);
        conn.execute("UPDATE laps SET is_valid = 0 WHERE result_id = 1", []).unwrap();
        let c = &candidates(&conn, 0).unwrap()[0];
        assert!(build_summary(&conn, c, "k").unwrap().is_none());
    }

    #[test]
    fn session_key_is_stable_and_install_specific() {
        assert_eq!(session_key("a", "f.xml"), session_key("a", "f.xml"));
        assert_ne!(session_key("a", "f.xml"), session_key("b", "f.xml"));
    }

    /// Outil de contrôle du contrat app ↔ serveur sur une base réelle (non lancé par
    /// défaut) : exporte les résumés de toutes les sessions d'une COPIE de lmu_cache.db,
    /// à valider ensuite avec le schéma du serveur (`community/shared`).
    ///   LMU_DB_COPY=<copie.db> LMU_OUT=<sortie.json> cargo test --lib export_real_summaries -- --ignored
    #[test]
    #[ignore = "outil manuel : nécessite LMU_DB_COPY et LMU_OUT"]
    fn export_real_summaries() {
        let conn = Connection::open(std::env::var("LMU_DB_COPY").unwrap()).unwrap();
        let mut all = Vec::new();
        for c in candidates(&conn, 0).unwrap() {
            if let Some(v) = build_summary(&conn, &c, &session_key("contract-test", &c.filename)).unwrap() {
                all.push(v);
            }
        }
        std::fs::write(std::env::var("LMU_OUT").unwrap(), serde_json::to_string(&all).unwrap()).unwrap();
    }

    /// Bout en bout contre un VRAI serveur (non lancé par défaut) : le code Rust de
    /// l'app (activation, envoi, coupure, renvoi, anonymat, suppression) sur une COPIE
    /// de base réelle.
    ///   LMU_DB_COPY=<copie.db> LMU_SERVER=http://127.0.0.1:3080 cargo test --lib community_e2e -- --ignored --nocapture
    #[test]
    #[ignore = "outil manuel : nécessite LMU_DB_COPY et un serveur (LMU_SERVER)"]
    fn community_e2e() {
        let conn = Connection::open(std::env::var("LMU_DB_COPY").unwrap()).unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS community_outbox (session_key TEXT PRIMARY KEY, state TEXT NOT NULL, reason TEXT,
             attempts INTEGER NOT NULL DEFAULT 0, next_try_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0);",
        )
        .unwrap();
        let st = db::state_from(conn);
        db::config_set(&st, K_URL, &std::env::var("LMU_SERVER").unwrap()).unwrap();
        tauri::async_runtime::block_on(async {
            let s0 = status(&st).unwrap();
            println!("avant activation : envoyables={} enabled={}", s0.history_available, s0.enabled);
            assert!(!s0.enabled, "désactivé par défaut");
            assert_eq!(sync(&st).await.unwrap().sent, 0, "rien ne part sans activation");

            let s1 = enable_inner(&st, true, false).await.unwrap();
            println!("activé : tag={:?} en attente={}", s1.tag, s1.pending);
            assert!(s1.registered);

            let r = sync(&st).await.unwrap();
            println!("1er envoi : {:?} envoyées, {} refusées, {} en attente, erreur={:?}", r.sent, r.rejected, r.pending, r.error);
            let s2 = status(&st).unwrap();
            assert_eq!(s2.sent as usize, r.sent + r.duplicates);

            // Coupure simulée : l'accusé n'est pas arrivé → on oublie l'état « sent »
            // de 10 sessions ; le renvoi doit être confirmé SANS doublon côté serveur.
            db::get_conn(&st).unwrap().execute(
                "UPDATE community_outbox SET state='pending', next_try_at=0 WHERE session_key IN
                 (SELECT session_key FROM community_outbox WHERE state='sent' LIMIT 10)", []).unwrap();
            let r2 = sync(&st).await.unwrap();
            println!("renvoi après coupure : nouvelles={} déjà reçues={}", r2.sent, r2.duplicates);
            assert_eq!(r2.sent, 0);
            assert_eq!(r2.duplicates, 10);

            // Page « Classement » : mes combos locaux placés dans les classements.
            let mine = my_combos_inner(&st, &MyCombosFilter::default()).unwrap();
            let c = &mine[0];
            let q = vec![
                ("track".to_string(), c.track.clone()),
                ("course".to_string(), c.track_course.clone()),
                ("class".to_string(), c.car_class.clone()),
                ("version".to_string(), "all".to_string()),
                ("time".to_string(), c.best.to_string()),
            ];
            let pos = public_inner(&st, "combos/position", &q).await.unwrap();
            println!("classement : {} combos locaux ; {} {} → rang {} / {}", mine.len(), c.track, c.car_class, pos["rank"], pos["drivers"]);
            let (rank, n) = (pos["rank"].as_i64().unwrap(), pos["drivers"].as_i64().unwrap());
            assert!(rank >= 1 && rank <= n, "rang cohérent");
            let stats = public_inner(&st, "stats", &[]).await.unwrap();
            assert!(stats["drivers"].as_i64().unwrap() >= 1);
            assert!(public_inner(&st, "../me", &[]).await.is_err(), "route hors liste blanche refusée");

            // Désactiver le partage : les temps restent, le nom disparaît.
            let s3 = disable_inner(&st).await.unwrap();
            assert!(!s3.enabled && s3.anonymous);
            let mut lq = q[..4].to_vec();
            lq.push(("offset".to_string(), (rank - 1).to_string()));
            lq.push(("limit".to_string(), "10".to_string()));
            let lb = public_inner(&st, "combos/leaderboard", &lq).await.unwrap();
            let me_row = lb["rows"].as_array().unwrap().iter().find(|r| r["driver"]["tag"] == s1.tag.clone().unwrap().as_str()).cloned().unwrap();
            assert!(me_row["driver"]["name"].is_null(), "nom retiré, temps conservé");
            println!("désactivé : temps conservé ({}), nom anonymisé", me_row["time"]);

            // Réinstallation (dossier de l'app effacé) : le coffre Windows garde l'identité.
            let wipe = |st: &DbState| {
                for k in [K_INSTALL, K_TAG, K_TOKEN, K_ENABLED] {
                    db::config_set(st, k, "").unwrap();
                }
                db::get_conn(st).unwrap().execute("DELETE FROM community_outbox", []).unwrap();
            };
            wipe(&st);
            let s5 = status(&st).unwrap();
            assert!(!s5.registered);
            assert_eq!(s5.vault_tag, s1.tag, "installation retrouvée dans le coffre");
            let s6 = enable_inner(&st, true, true).await.unwrap();
            assert_eq!(s6.tag, s1.tag, "même installation reprise, pas de nouvelle");
            let r3 = sync(&st).await.unwrap();
            println!("après réinstallation : nouvelles={} déjà reçues={}", r3.sent, r3.duplicates);
            assert_eq!(r3.sent, 0, "aucun doublon côté serveur");
            assert!(r3.duplicates > 0);

            // Nouvelle réinstallation puis « Supprimer mes données » : le jeton du coffre
            // atteint encore le serveur.
            wipe(&st);
            let s4 = delete_inner(&st).await.unwrap();
            assert!(!s4.registered && !s4.enabled && s4.sent == 0);
            assert_eq!(s4.vault_tag, None, "coffre vidé");
            let lb2 = public_inner(&st, "combos/leaderboard", &lq).await;
            let still = lb2.ok().map(|v| v["rows"].as_array().unwrap().iter().any(|r| r["driver"]["tag"] == s1.tag.clone().unwrap().as_str()));
            assert_ne!(still, Some(true), "données effacées du serveur");
            println!("supprimé (jeton du coffre) : OK");
        });
    }

    #[test]
    fn outbox_backoff_and_states() {
        let conn = db::open_test_db();
        mark(&conn, "k", "pending", Some("transient"), Some(60)).unwrap();
        mark(&conn, "k", "pending", Some("transient"), Some(60)).unwrap();
        let (attempts, next): (i64, i64) = conn
            .query_row("SELECT attempts, next_try_at FROM community_outbox WHERE session_key='k'", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!(attempts, 2);
        assert!(next > now() + 60, "le délai grandit à chaque échec");
        mark(&conn, "k", "sent", None, None).unwrap();
        let state: String = conn.query_row("SELECT state FROM community_outbox WHERE session_key='k'", [], |r| r.get(0)).unwrap();
        assert_eq!(state, "sent");
    }
}
