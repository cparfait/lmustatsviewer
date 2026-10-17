//! Serveur de widgets : chaque widget d'overlay servi **seul** sur une URL
//! locale, pour l'afficher ailleurs que dans la fenêtre overlay :
//! - dans le casque VR via OpenKneeboard (onglet « Web Dashboard ») ;
//! - dans OBS (source « Navigateur ») ;
//! - dans un navigateur sur un 2ᵉ écran du même PC.
//!
//! **Désactivé par défaut**, démarré à la demande (page Overlays). Écoute
//! **uniquement sur 127.0.0.1** :
//! - `GET /?w=<widget>` et les fichiers du bundle : l'interface de l'app
//!   (assets embarqués), qui rend le widget demandé sur fond transparent ;
//! - `GET /ws` : WebSocket **en lecture seule**. Le serveur pousse les trames
//!   live (`live-data`, sans les champs lourds), le tracé quand il change, la
//!   config des overlays et quelques évènements (coach vocal). Les messages
//!   du navigateur sont ignorés : aucune commande n'est acceptée.
//!
//! Garde-fous : boucle locale seule, en-tête `Host` limité à une adresse IP ou
//! `localhost` (anti DNS rebinding), `Origin` du WebSocket = cette origine
//! (une page web d'un autre site ne peut pas s'y connecter), 32 clients max,
//! trames reçues ≤ 64 Ko, chemins `..` refusés.

use std::io::{self, Read, Write};
use std::net::{IpAddr, Ipv4Addr, Shutdown, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, SyncSender, TrySendError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, EventId, Listener, Manager};

use super::live;
use super::regie::{host_ok, read_request, respond};
use crate::db::{self, DbState};
use crate::error::AppError;

/// Port par défaut (l'activation et le port choisi sont en config, gérés côté
/// interface : `widget_server_enabled`, `widget_server_port`).
pub const DEFAULT_PORT: u16 = 8791;
/// Libellé de consommateur du flux live (garde le thread de lecture actif).
const CONSUMER: &str = "widgets";
const MAX_CLIENTS: usize = 32;
/// Taille max d'une trame envoyée par le navigateur (il n'envoie que ping/close).
const MAX_CLIENT_FRAME: u64 = 64 * 1024;
/// Trames en attente par client : au-delà, un client lent perd des trames live
/// (remplacées par les suivantes) au lieu de ralentir les autres.
const CLIENT_QUEUE: usize = 64;
/// Cadence de diffusion (le flux live tourne à 20 Hz en piste).
const TICK: Duration = Duration::from_millis(50);
/// Champs quasi statiques envoyés à part, seulement quand ils changent.
const TRACK_KEYS: [&str; 4] = ["track_points", "track_dists", "pit_lane_points", "sector_dists"];
/// Réglages de l'app transmis aux widgets (lecture seule).
const SETTING_KEYS: [&str; 2] = ["spotter_key_coach", "map_north_up"];
/// Évènements de l'app relayés tels quels aux widgets.
const RELAYED_EVENTS: [&str; 2] = ["coach-voice", "coach-corner"];
const WS_GUID: &str = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

#[derive(Debug, Clone, Serialize)]
pub struct WidgetServerStatus {
    pub running: bool,
    pub port: u16,
    /// Adresse de base (ex. `http://127.0.0.1:8791`).
    pub url: String,
    /// Pages de widget connectées.
    pub clients: usize,
}

/// Langue de l'interface, poussée par la fenêtre principale (les pages servies
/// ont leur propre stockage local et ne la connaissent pas).
static LANG: Mutex<String> = Mutex::new(String::new());
/// Nom de chaque widget dans la langue de l'app (id → « Classement »…), envoyé par
/// l'interface : écrit dans le `<title>` de la page servie, que OpenKneeboard et OBS
/// reprennent comme nom d'onglet / de source avant même que la page ne démarre.
static TITLES: Mutex<Option<std::collections::HashMap<String, String>>> = Mutex::new(None);

/// Page de widget (`?w=<id>`) : titre « <nom> · LMU » à la place du titre générique.
fn titled_page(html: &[u8], query: &str) -> Option<Vec<u8>> {
    let id = query.split('&').find_map(|kv| kv.strip_prefix("w="))?;
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return None;
    }
    let name = TITLES.lock().ok()?.as_ref()?.get(id)?.clone();
    // Échappement HTML minimal (le nom vient de nos propres traductions).
    let name = name.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
    let text = std::str::from_utf8(html).ok()?;
    let start = text.find("<title>")?;
    let end = text[start..].find("</title>")? + start;
    Some(format!("{}<title>{name} · LMU{}", &text[..start], &text[end..]).into_bytes())
}

// ── WebSocket minimal (RFC 6455) ────────────────────────────────────────────

fn b64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for c in data.chunks(3) {
        let n = (u32::from(c[0]) << 16)
            | (u32::from(*c.get(1).unwrap_or(&0)) << 8)
            | u32::from(*c.get(2).unwrap_or(&0));
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if c.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if c.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

/// Valeur de `Sec-WebSocket-Accept` pour une clé de poignée de main.
fn accept_key(key: &str) -> String {
    let d = ring::digest::digest(
        &ring::digest::SHA1_FOR_LEGACY_USE_ONLY,
        format!("{}{WS_GUID}", key.trim()).as_bytes(),
    );
    b64(d.as_ref())
}

const OP_TEXT: u8 = 0x1;
const OP_CLOSE: u8 = 0x8;
const OP_PING: u8 = 0x9;
const OP_PONG: u8 = 0xA;

/// Trame serveur → navigateur (jamais masquée, toujours finale).
fn encode_frame(opcode: u8, payload: &[u8]) -> Vec<u8> {
    let len = payload.len();
    let mut f = Vec::with_capacity(len + 10);
    f.push(0x80 | opcode);
    if len < 126 {
        f.push(len as u8);
    } else if len <= u16::MAX as usize {
        f.push(126);
        f.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        f.push(127);
        f.extend_from_slice(&(len as u64).to_be_bytes());
    }
    f.extend_from_slice(payload);
    f
}

/// Lit une trame du navigateur. Les trames non masquées ou trop grosses sont
/// une erreur de protocole (la connexion est alors fermée).
fn read_frame(r: &mut impl Read) -> io::Result<(u8, Vec<u8>)> {
    let mut h = [0u8; 2];
    r.read_exact(&mut h)?;
    let opcode = h[0] & 0x0f;
    if h[1] & 0x80 == 0 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "unmasked client frame"));
    }
    let len = match h[1] & 0x7f {
        126 => {
            let mut b = [0u8; 2];
            r.read_exact(&mut b)?;
            u64::from(u16::from_be_bytes(b))
        }
        127 => {
            let mut b = [0u8; 8];
            r.read_exact(&mut b)?;
            u64::from_be_bytes(b)
        }
        n => u64::from(n),
    };
    if len > MAX_CLIENT_FRAME {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "frame too large"));
    }
    let mut mask = [0u8; 4];
    r.read_exact(&mut mask)?;
    let mut payload = vec![0u8; len as usize];
    r.read_exact(&mut payload)?;
    for (i, b) in payload.iter_mut().enumerate() {
        *b ^= mask[i % 4];
    }
    Ok((opcode, payload))
}

/// `Origin` accepté pour le WebSocket : absent (client hors navigateur) ou
/// strictement l'origine de ce serveur.
fn origin_ok(origin: Option<&str>, port: u16) -> bool {
    let Some(o) = origin else { return true };
    let o = o.trim().to_ascii_lowercase();
    ["127.0.0.1", "localhost", "[::1]"]
        .iter()
        .any(|h| o == format!("http://{h}:{port}"))
}

// ── Diffusion ───────────────────────────────────────────────────────────────

enum Msg {
    Text(Arc<str>),
    Raw(Vec<u8>),
    Close,
}

struct Client {
    id: u64,
    tx: SyncSender<Msg>,
}

type AssetFn = dyn Fn(&str) -> Option<(Vec<u8>, String)> + Send + Sync;
type SnapshotFn = dyn Fn() -> Value + Send + Sync;
type HookFn = dyn Fn() + Send + Sync;

struct Hub {
    port: u16,
    clients: Mutex<Vec<Client>>,
    next_id: AtomicU64,
    /// Dernier message de tracé, renvoyé à chaque nouveau client.
    track: Mutex<Option<Arc<str>>>,
    /// Fichiers du bundle (`index.html`, `assets/…`) : octets + type MIME.
    assets: Box<AssetFn>,
    /// `{ cfg, settings }` lus à la connexion d'un client.
    snapshot: Box<SnapshotFn>,
    /// Premier client connecté / dernier client parti (flux live).
    on_first: Box<HookFn>,
    on_last: Box<HookFn>,
}

impl Hub {
    fn count(&self) -> usize {
        self.clients.lock().map(|c| c.len()).unwrap_or(0)
    }

    /// Envoie un message à tous les clients. File pleine → trame perdue pour ce
    /// client seulement ; client parti → retiré.
    fn broadcast(&self, text: Arc<str>) {
        let gone = {
            let Ok(mut cs) = self.clients.lock() else { return };
            let before = cs.len();
            cs.retain(|c| !matches!(c.tx.try_send(Msg::Text(text.clone())), Err(TrySendError::Disconnected(_))));
            before > 0 && cs.is_empty()
        };
        if gone {
            (self.on_last)();
        }
    }

    fn hello(&self) -> String {
        let snap = (self.snapshot)();
        let lang = LANG.lock().map(|l| l.clone()).unwrap_or_default();
        json!({
            "t": "hello",
            "v": 1,
            "lang": lang,
            "cfg": snap.get("cfg").cloned().unwrap_or(Value::Null),
            "settings": snap.get("settings").cloned().unwrap_or(Value::Null),
        })
        .to_string()
    }

    fn add(&self, tx: SyncSender<Msg>) -> Option<u64> {
        let first = {
            let mut cs = self.clients.lock().ok()?;
            if cs.len() >= MAX_CLIENTS {
                return None;
            }
            let id = self.next_id.fetch_add(1, Ordering::SeqCst);
            cs.push(Client { id, tx });
            (cs.len() == 1, id)
        };
        if first.0 {
            (self.on_first)();
        }
        Some(first.1)
    }

    fn remove(&self, id: u64) {
        let last = {
            let Ok(mut cs) = self.clients.lock() else { return };
            let before = cs.len();
            cs.retain(|c| c.id != id);
            before > 0 && cs.is_empty() && before != cs.len()
        };
        if last {
            (self.on_last)();
        }
    }

    fn close_all(&self) {
        if let Ok(cs) = self.clients.lock() {
            for c in cs.iter() {
                let _ = c.tx.try_send(Msg::Close);
            }
        }
    }
}

/// Sépare une trame live en partie légère (chaque tick) et tracé (rare).
fn split_frame(mut v: Value) -> (Value, Value) {
    let mut track = serde_json::Map::new();
    if let Some(o) = v.as_object_mut() {
        for k in TRACK_KEYS {
            if let Some(x) = o.remove(k) {
                track.insert(k.to_string(), x);
            }
        }
    }
    (v, Value::Object(track))
}

/// Signature bon marché du tracé : longueurs + premier et dernier point.
fn track_signature(track: &Value) -> String {
    TRACK_KEYS
        .iter()
        .map(|k| {
            let a = track.get(*k).and_then(Value::as_array);
            match a {
                Some(a) => format!(
                    "{}:{}:{}",
                    a.len(),
                    a.first().map(Value::to_string).unwrap_or_default(),
                    a.last().map(Value::to_string).unwrap_or_default()
                ),
                None => "-".into(),
            }
        })
        .collect::<Vec<_>>()
        .join("|")
}

/// Boucle de diffusion des trames live (thread dédié, tant que le serveur tourne).
fn broadcast_loop(hub: Arc<Hub>, stop: Arc<AtomicBool>) {
    let mut last_at: Option<Instant> = None;
    let mut last_sig = String::new();
    while !stop.load(Ordering::SeqCst) {
        std::thread::sleep(TICK);
        if hub.count() == 0 {
            continue;
        }
        match live::last_frame_stamped() {
            Some((at, data)) if Some(at) != last_at => {
                last_at = Some(at);
                let Ok(v) = serde_json::to_value(&data) else { continue };
                let (light, track) = split_frame(v);
                let sig = track_signature(&track);
                if sig != last_sig {
                    last_sig = sig;
                    let msg: Arc<str> = json!({"t": "track", "d": track}).to_string().into();
                    if let Ok(mut t) = hub.track.lock() {
                        *t = Some(msg.clone());
                    }
                    hub.broadcast(msg);
                }
                hub.broadcast(json!({"t": "live", "d": light}).to_string().into());
            }
            // Plus de trame récente (jeu fermé, flux arrêté) : on le dit une
            // fois, pour que les widgets repassent sur leurs placeholders.
            None if last_at.is_some() => {
                last_at = None;
                hub.broadcast(json!({"t": "live", "d": Value::Null}).to_string().into());
            }
            _ => {}
        }
    }
}

// ── Connexions ──────────────────────────────────────────────────────────────

const CSP: &str = "Content-Security-Policy: default-src 'self'; script-src 'self'; \
style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; \
connect-src 'self' ws: https:\r\n";

fn serve_asset(stream: &TcpStream, hub: &Hub, path: &str, query: &str) {
    if path.contains("..") || path.contains('\\') {
        respond(stream, "400 Bad Request", "text/plain", b"bad path", "");
        return;
    }
    let name = path.trim_start_matches('/');
    let name = if name.is_empty() { "index.html" } else { name };
    // Chemin sans extension → page de l'app (le widget est choisi par `?w=`).
    let found = (hub.assets)(name).or_else(|| {
        let last = name.rsplit('/').next().unwrap_or(name);
        (!last.contains('.')).then(|| (hub.assets)("index.html")).flatten()
    });
    match found {
        Some((bytes, mime)) => {
            let html = mime.starts_with("text/html");
            let extra = if html { CSP } else { "" };
            let bytes = if html { titled_page(&bytes, query).unwrap_or(bytes) } else { bytes };
            respond(stream, "200 OK", &mime, &bytes, extra);
        }
        None => respond(stream, "404 Not Found", "text/plain", b"not found", ""),
    }
}

fn upgrade(stream: TcpStream, hub: Arc<Hub>, key: &str) {
    let (tx, rx): (SyncSender<Msg>, Receiver<Msg>) = mpsc::sync_channel(CLIENT_QUEUE);
    // Messages d'accueil mis en file AVANT l'inscription : ils passent avant
    // la première trame live diffusée.
    let _ = tx.try_send(Msg::Text(hub.hello().into()));
    if let Some(t) = hub.track.lock().ok().and_then(|t| t.clone()) {
        let _ = tx.try_send(Msg::Text(t));
    }
    let Some(id) = hub.add(tx.clone()) else {
        respond(&stream, "503 Service Unavailable", "text/plain", b"too many clients", "");
        return;
    };
    let head = format!(
        "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\
         Sec-WebSocket-Accept: {}\r\n\r\n",
        accept_key(key)
    );
    let mut w = &stream;
    if w.write_all(head.as_bytes()).is_err() {
        hub.remove(id);
        return;
    }
    let _ = stream.set_read_timeout(None);
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
    let Ok(writer) = stream.try_clone() else {
        hub.remove(id);
        return;
    };
    let writer_thread = std::thread::spawn(move || {
        let mut w = &writer;
        while let Ok(m) = rx.recv() {
            let res = match &m {
                Msg::Text(t) => w.write_all(&encode_frame(OP_TEXT, t.as_bytes())),
                Msg::Raw(b) => w.write_all(b),
                Msg::Close => {
                    let _ = w.write_all(&encode_frame(OP_CLOSE, &[]));
                    break;
                }
            };
            if res.is_err() {
                break;
            }
        }
        // Débloque la lecture côté connexion (client mort ou serveur arrêté).
        let _ = writer.shutdown(Shutdown::Both);
    });
    let mut r = &stream;
    loop {
        match read_frame(&mut r) {
            Ok((OP_CLOSE, _)) => {
                let _ = tx.try_send(Msg::Close);
                break;
            }
            Ok((OP_PING, p)) => {
                let _ = tx.try_send(Msg::Raw(encode_frame(OP_PONG, &p)));
            }
            Ok(_) => {} // texte / binaire / pong : ignorés (lecture seule)
            Err(_) => break,
        }
    }
    hub.remove(id);
    drop(tx);
    let _ = stream.shutdown(Shutdown::Both);
    let _ = writer_thread.join();
}

fn handle(stream: TcpStream, hub: Arc<Hub>) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
    let Ok(reader) = stream.try_clone() else { return };
    let Some(req) = read_request(reader) else {
        respond(&stream, "400 Bad Request", "text/plain", b"bad request", "");
        return;
    };
    if !req.headers.get("host").map(|h| host_ok(h)).unwrap_or(false) {
        respond(&stream, "421 Misdirected Request", "text/plain", b"bad host", "");
        return;
    }
    if req.method != "GET" {
        respond(&stream, "405 Method Not Allowed", "text/plain", b"read only", "");
        return;
    }
    let path = req.path.split('?').next().unwrap_or("/");
    let query = req.path.split_once('?').map(|(_, q)| q).unwrap_or("");
    if path == "/ws" {
        let h = |k: &str| req.headers.get(k).map(String::as_str);
        let is_ws = h("upgrade").is_some_and(|u| u.eq_ignore_ascii_case("websocket"));
        let key = h("sec-websocket-key").unwrap_or("").to_string();
        if !is_ws || key.is_empty() || h("sec-websocket-version") != Some("13") {
            respond(&stream, "400 Bad Request", "text/plain", b"websocket expected", "");
            return;
        }
        if !origin_ok(h("origin"), hub.port) {
            respond(&stream, "403 Forbidden", "text/plain", b"bad origin", "");
            return;
        }
        upgrade(stream, hub, &key);
        return;
    }
    serve_asset(&stream, &hub, path, query);
}

fn accept_loop(listener: TcpListener, hub: Arc<Hub>, stop: Arc<AtomicBool>) {
    while !stop.load(Ordering::SeqCst) {
        match listener.accept() {
            Ok((s, _)) => {
                let _ = s.set_nonblocking(false);
                let hub = hub.clone();
                std::thread::spawn(move || handle(s, hub));
            }
            Err(e) if e.kind() == io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => std::thread::sleep(Duration::from_millis(200)),
        }
    }
}

// ── Commandes ───────────────────────────────────────────────────────────────

struct Running {
    stop: Arc<AtomicBool>,
    hub: Arc<Hub>,
    listeners: Vec<EventId>,
}

static SERVER: Mutex<Option<Running>> = Mutex::new(None);

fn url_of(port: u16) -> String {
    format!("http://127.0.0.1:{port}")
}

fn status_of(r: &Running) -> WidgetServerStatus {
    WidgetServerStatus { running: true, port: r.hub.port, url: url_of(r.hub.port), clients: r.hub.count() }
}

fn stopped() -> WidgetServerStatus {
    WidgetServerStatus { running: false, port: 0, url: String::new(), clients: 0 }
}

/// `{ cfg, settings }` lus en base au moment de la connexion d'un widget.
fn read_snapshot(app: &AppHandle) -> Value {
    let state = app.state::<DbState>();
    let get = |k: &str| db::config_get(state.inner(), k).ok().flatten();
    let cfg = get("overlays_config")
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .unwrap_or(Value::Null);
    let settings: serde_json::Map<String, Value> = SETTING_KEYS
        .iter()
        .filter_map(|k| get(k).map(|v| (k.to_string(), Value::String(v))))
        .collect();
    json!({ "cfg": cfg, "settings": settings })
}

/// Démarre le serveur (idempotent : renvoie l'état courant s'il tourne).
#[tauri::command]
pub fn widget_server_start(app: AppHandle, port: Option<u16>) -> Result<WidgetServerStatus, AppError> {
    let mut g = SERVER.lock().map_err(|e| AppError::Internal(format!("widget server lock: {e}")))?;
    if let Some(r) = g.as_ref() {
        return Ok(status_of(r));
    }
    let port = port.filter(|p| *p >= 1024).unwrap_or(DEFAULT_PORT);
    let listener =
        TcpListener::bind(SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port)).map_err(AppError::Io)?;
    listener.set_nonblocking(true).map_err(AppError::Io)?;

    let (a1, a2, a3) = (app.clone(), app.clone(), app.clone());
    let hub = Arc::new(Hub {
        port,
        clients: Mutex::new(Vec::new()),
        next_id: AtomicU64::new(1),
        track: Mutex::new(None),
        assets: Box::new(move |p: &str| a1.asset_resolver().get(p.to_string()).map(|a| (a.bytes, a.mime_type))),
        snapshot: Box::new(move || read_snapshot(&a2)),
        on_first: Box::new(move || {
            let _ = live::acquire(&a3, CONSUMER);
        }),
        on_last: Box::new(|| live::release_window(CONSUMER)),
    });

    // Évènements de l'app relayés aux widgets.
    let mut listeners = Vec::new();
    {
        let h = hub.clone();
        listeners.push(app.listen_any("overlays-config", move |e| {
            if let Ok(v) = serde_json::from_str::<Value>(e.payload()) {
                if let Some(cfg) = v.get("cfg") {
                    h.broadcast(json!({"t": "cfg", "cfg": cfg}).to_string().into());
                }
            }
        }));
    }
    for name in RELAYED_EVENTS {
        let h = hub.clone();
        listeners.push(app.listen_any(name, move |e| {
            let payload = serde_json::from_str::<Value>(e.payload()).unwrap_or(Value::Null);
            h.broadcast(json!({"t": "evt", "name": name, "payload": payload}).to_string().into());
        }));
    }

    let stop = Arc::new(AtomicBool::new(false));
    {
        let (hub, stop) = (hub.clone(), stop.clone());
        std::thread::spawn(move || accept_loop(listener, hub, stop));
    }
    {
        let (hub, stop) = (hub.clone(), stop.clone());
        std::thread::spawn(move || broadcast_loop(hub, stop));
    }
    let running = Running { stop, hub, listeners };
    let st = status_of(&running);
    *g = Some(running);
    Ok(st)
}

#[tauri::command]
pub fn widget_server_stop(app: AppHandle) -> Result<WidgetServerStatus, AppError> {
    let mut g = SERVER.lock().map_err(|e| AppError::Internal(format!("widget server lock: {e}")))?;
    if let Some(r) = g.take() {
        r.stop.store(true, Ordering::SeqCst);
        for id in r.listeners {
            app.unlisten(id);
        }
        r.hub.close_all();
        live::release_window(CONSUMER);
    }
    Ok(stopped())
}

#[tauri::command]
pub fn widget_server_status() -> Result<WidgetServerStatus, AppError> {
    let g = SERVER.lock().map_err(|e| AppError::Internal(format!("widget server lock: {e}")))?;
    Ok(g.as_ref().map(status_of).unwrap_or_else(stopped))
}

/// Langue de l'interface (fenêtre principale) → widgets connectés et futurs.
#[tauri::command]
pub fn widget_server_set_titles(titles: std::collections::HashMap<String, String>) -> Result<(), AppError> {
    let clean = titles
        .into_iter()
        .filter(|(k, v)| k.len() <= 32 && k.chars().all(|c| c.is_ascii_alphanumeric()) && v.chars().count() <= 60)
        .collect();
    if let Ok(mut t) = TITLES.lock() {
        *t = Some(clean);
    }
    Ok(())
}

#[tauri::command]
pub fn widget_server_set_language(lang: String) -> Result<(), AppError> {
    let lang: String = lang.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(12).collect();
    if let Ok(mut l) = LANG.lock() {
        if *l == lang {
            return Ok(());
        }
        *l = lang.clone();
    }
    if let Ok(g) = SERVER.lock() {
        if let Some(r) = g.as_ref() {
            r.hub.broadcast(json!({"t": "lang", "lang": lang}).to_string().into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn widget_page_title_uses_widget_name() {
        *TITLES.lock().unwrap() = Some([("standings".to_string(), "Classement".to_string())].into_iter().collect());
        let html = b"<html><head><title>LMU Stats Viewer</title></head></html>";
        let out = String::from_utf8(titled_page(html, "w=standings&bg=opaque").unwrap()).unwrap();
        assert!(out.contains("<title>Classement · LMU</title>"));
        assert!(titled_page(html, "w=unknown").is_none());
        assert!(titled_page(html, "w=../x").is_none());
        assert!(titled_page(html, "").is_none());
    }

    use super::*;
    use std::io::{BufRead, BufReader};
    use std::sync::atomic::AtomicUsize;

    #[test]
    fn accept_key_matches_rfc_example() {
        assert_eq!(accept_key("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
        assert_eq!(b64(b"f"), "Zg==");
        assert_eq!(b64(b"fo"), "Zm8=");
        assert_eq!(b64(b"foo"), "Zm9v");
    }

    #[test]
    fn frame_lengths_are_encoded() {
        assert_eq!(&encode_frame(OP_TEXT, b"hi")[..2], &[0x81, 2]);
        let mid = encode_frame(OP_TEXT, &[0u8; 300]);
        assert_eq!(&mid[..4], &[0x81, 126, 1, 44]);
        let big = encode_frame(OP_TEXT, &vec![0u8; 70_000]);
        assert_eq!(big[1], 127);
        assert_eq!(u64::from_be_bytes(big[2..10].try_into().unwrap()), 70_000);
    }

    fn masked(opcode: u8, payload: &[u8]) -> Vec<u8> {
        let mask = [1u8, 2, 3, 4];
        let mut f = vec![0x80 | opcode, 0x80 | payload.len() as u8];
        f.extend_from_slice(&mask);
        f.extend(payload.iter().enumerate().map(|(i, b)| b ^ mask[i % 4]));
        f
    }

    #[test]
    fn reads_masked_client_frames_and_rejects_unmasked() {
        let raw = masked(OP_PING, b"abc");
        assert_eq!(read_frame(&mut &raw[..]).unwrap(), (OP_PING, b"abc".to_vec()));
        let unmasked = encode_frame(OP_TEXT, b"x");
        assert!(read_frame(&mut &unmasked[..]).is_err());
    }

    #[test]
    fn origin_guard() {
        assert!(origin_ok(None, 8791));
        assert!(origin_ok(Some("http://127.0.0.1:8791"), 8791));
        assert!(origin_ok(Some("http://localhost:8791"), 8791));
        assert!(!origin_ok(Some("http://127.0.0.1:9999"), 8791));
        assert!(!origin_ok(Some("https://evil.example"), 8791));
        assert!(!origin_ok(Some("null"), 8791));
    }

    #[test]
    fn split_keeps_light_fields_and_signature_tracks_changes() {
        let v = json!({"connected": true, "nearby": [1], "track_points": [[0.0, 0.0], [1.0, 2.0]], "sector_dists": [10.0]});
        let (light, track) = split_frame(v);
        assert!(light.get("track_points").is_none() && light.get("nearby").is_some());
        assert_eq!(track["track_points"].as_array().unwrap().len(), 2);
        let other = json!({"track_points": [[0.0, 0.0], [1.0, 3.0]], "sector_dists": [10.0]});
        assert_ne!(track_signature(&track), track_signature(&other));
        assert_eq!(track_signature(&track), track_signature(&track.clone()));
    }

    fn test_hub(port: u16, firsts: Arc<AtomicUsize>, lasts: Arc<AtomicUsize>) -> Arc<Hub> {
        Arc::new(Hub {
            port,
            clients: Mutex::new(Vec::new()),
            next_id: AtomicU64::new(1),
            track: Mutex::new(None),
            assets: Box::new(|p: &str| match p {
                "index.html" => Some((b"<html>app</html>".to_vec(), "text/html".into())),
                "assets/app.js" => Some((b"console.log(1)".to_vec(), "text/javascript".into())),
                _ => None,
            }),
            snapshot: Box::new(|| json!({"cfg": {"highFps": true}, "settings": {}})),
            on_first: Box::new(move || {
                firsts.fetch_add(1, Ordering::SeqCst);
            }),
            on_last: Box::new(move || {
                lasts.fetch_add(1, Ordering::SeqCst);
            }),
        })
    }

    fn http(port: u16, raw: &str) -> String {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.write_all(raw.as_bytes()).unwrap();
        let mut out = String::new();
        let _ = s.read_to_string(&mut out);
        out
    }

    /// Bout en bout sur la boucle locale : pages, garde-fous, poignée de main
    /// WebSocket, message d'accueil, diffusion, fermeture et compteurs.
    #[test]
    fn end_to_end_on_loopback() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        listener.set_nonblocking(true).unwrap();
        let (firsts, lasts) = (Arc::new(AtomicUsize::new(0)), Arc::new(AtomicUsize::new(0)));
        let hub = test_hub(port, firsts.clone(), lasts.clone());
        let stop = Arc::new(AtomicBool::new(false));
        {
            let (hub, stop) = (hub.clone(), stop.clone());
            std::thread::spawn(move || accept_loop(listener, hub, stop));
        }
        let host = format!("127.0.0.1:{port}");

        let page = http(port, &format!("GET /?w=standings HTTP/1.1\r\nHost: {host}\r\n\r\n"));
        assert!(page.starts_with("HTTP/1.1 200") && page.contains("<html>app"), "{page}");
        assert!(page.contains("Content-Security-Policy"));
        let js = http(port, &format!("GET /assets/app.js HTTP/1.1\r\nHost: {host}\r\n\r\n"));
        assert!(js.starts_with("HTTP/1.1 200") && js.contains("text/javascript"));
        assert!(http(port, &format!("GET /assets/missing.js HTTP/1.1\r\nHost: {host}\r\n\r\n")).starts_with("HTTP/1.1 404"));
        assert!(http(port, &format!("GET /../secret HTTP/1.1\r\nHost: {host}\r\n\r\n")).starts_with("HTTP/1.1 400"));
        assert!(http(port, &format!("GET / HTTP/1.1\r\nHost: evil.example:{port}\r\n\r\n")).starts_with("HTTP/1.1 421"));
        assert!(http(port, &format!("POST / HTTP/1.1\r\nHost: {host}\r\n\r\n")).starts_with("HTTP/1.1 405"));
        let bad_origin = http(
            port,
            &format!(
                "GET /ws HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\
                 Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nOrigin: https://evil.example\r\n\r\n"
            ),
        );
        assert!(bad_origin.starts_with("HTTP/1.1 403"), "{bad_origin}");

        // Poignée de main valide.
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        s.write_all(
            format!(
                "GET /ws HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\
                 Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nOrigin: http://{host}\r\n\r\n"
            )
            .as_bytes(),
        )
        .unwrap();
        let mut br = BufReader::new(s.try_clone().unwrap());
        let mut line = String::new();
        br.read_line(&mut line).unwrap();
        assert!(line.starts_with("HTTP/1.1 101"), "{line}");
        let mut accept = String::new();
        loop {
            let mut h = String::new();
            br.read_line(&mut h).unwrap();
            if h.trim().is_empty() {
                break;
            }
            if h.to_ascii_lowercase().starts_with("sec-websocket-accept:") {
                accept = h.split(':').nth(1).unwrap().trim().to_string();
            }
        }
        assert_eq!(accept, "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");

        // Trames serveur (non masquées) : accueil puis diffusion.
        let read_text = |br: &mut BufReader<TcpStream>| -> String {
            let mut h = [0u8; 2];
            br.read_exact(&mut h).unwrap();
            assert_eq!(h[0], 0x81);
            let len = match h[1] {
                126 => {
                    let mut b = [0u8; 2];
                    br.read_exact(&mut b).unwrap();
                    u16::from_be_bytes(b) as usize
                }
                n => n as usize,
            };
            let mut p = vec![0u8; len];
            br.read_exact(&mut p).unwrap();
            String::from_utf8(p).unwrap()
        };
        let hello: Value = serde_json::from_str(&read_text(&mut br)).unwrap();
        assert_eq!(hello["t"], "hello");
        assert_eq!(hello["cfg"]["highFps"], true);
        assert_eq!(hub.count(), 1);
        assert_eq!(firsts.load(Ordering::SeqCst), 1);

        hub.broadcast(r#"{"t":"live","d":{"connected":true}}"#.into());
        let live: Value = serde_json::from_str(&read_text(&mut br)).unwrap();
        assert_eq!(live["d"]["connected"], true);

        // Ping → pong ; texte ignoré ; close → fermeture et compteur libéré.
        s.write_all(&masked(OP_TEXT, b"commande ignoree")).unwrap();
        s.write_all(&masked(OP_PING, b"p")).unwrap();
        let mut h = [0u8; 3];
        br.read_exact(&mut h).unwrap();
        assert_eq!(h, [0x80 | OP_PONG, 1, b'p']);
        s.write_all(&masked(OP_CLOSE, &[])).unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while hub.count() > 0 && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(hub.count(), 0);
        assert_eq!(lasts.load(Ordering::SeqCst), 1);
        stop.store(true, Ordering::SeqCst);
    }
}
