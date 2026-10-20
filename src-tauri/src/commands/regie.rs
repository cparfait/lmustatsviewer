//! Régie : le live consultable depuis une tablette du réseau local.
//!
//! **Désactivée par défaut**, démarrée uniquement à la demande (Config). Petit
//! serveur HTTP/1.1 sur un thread dédié, en **lecture seule** :
//! - `GET /` : page autonome (`data/regie.html`, sans dépendance, plusieurs
//!   gabarits au choix sur la tablette) ;
//! - `POST /api/login` : code à 6 chiffres → jeton de session (mémoire seule) ;
//! - `GET /api/live` : dernière trame live allégée (sans tracé) ;
//! - `GET /api/track` : tracé, voie des stands, bornes de secteurs ;
//! - `GET /api/inputs` : pédales, volant, rapport, régime (écran Pédales, ~15 Hz).
//!
//! Garde-fous : écoute sur l'adresse du réseau local (pas `0.0.0.0`), code
//! comparé en temps constant, 5 essais ratés par adresse → 60 s de blocage,
//! en-tête `Host` limité à une adresse IP ou `localhost` (anti DNS rebinding),
//! corps de requête ≤ 4 Ko, aucune route d'écriture (ni menu des stands, ni
//! setup). Le code et les jetons changent à chaque démarrage.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use super::live;
use crate::error::AppError;

const PAGE: &str = include_str!("../data/regie.html");
/// Icône d'écran d'accueil (180 px, celle de l'app iOS).
const ICON: &[u8] = include_bytes!("../../icons/ios/AppIcon-60x60@3x.png");
/// Manifeste « ajout à l'écran d'accueil » : ouverture en plein écran, sans barre.
const MANIFEST: &str = r##"{"name":"LMU Stats Viewer","short_name":"LMU SV","start_url":"/","scope":"/","display":"fullscreen","background_color":"#0a0e1a","theme_color":"#0a0e1a","icons":[{"src":"/icon.png","sizes":"180x180","type":"image/png","purpose":"any"}]}"##;
/// CSP de la page : `media-src data:` pour la vidéo muette qui garde l'écran
/// allumé quand l'API Wake Lock est absente (page servie en HTTP simple).
const PAGE_CSP: &str = "Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; media-src data:; manifest-src 'self'; font-src 'self'\r\n";
/// Police des chiffres de la tablette : Barlow Condensed (SIL OFL 1.1, licence
/// dans `data/fonts/OFL-BarlowCondensed.txt`), sous-ensemble latin en woff2.
const FONTS: [(&str, &[u8]); 3] = [
    ("/fonts/barlow-condensed-500.woff2", include_bytes!("../data/fonts/BarlowCondensed-500.woff2")),
    ("/fonts/barlow-condensed-600.woff2", include_bytes!("../data/fonts/BarlowCondensed-600.woff2")),
    ("/fonts/barlow-condensed-700.woff2", include_bytes!("../data/fonts/BarlowCondensed-700.woff2")),
];
pub const DEFAULT_PORT: u16 = 8790;
/// Libellé de consommateur du flux live (garde le thread de lecture actif).
const CONSUMER: &str = "regie";
const MAX_BODY: usize = 4096;
const MAX_FAILS: u32 = 5;
const LOCKOUT: Duration = Duration::from_secs(60);
/// Champs lourds retirés de `/api/live` (servis une fois par `/api/track`).
const HEAVY: [&str; 4] = ["track_points", "track_dists", "pit_lane_points", "nearby"];

#[derive(Debug, Clone, Serialize)]
pub struct RegieStatus {
    pub running: bool,
    /// Adresse à ouvrir sur la tablette (ex. `http://192.168.1.20:8790`).
    pub url: String,
    pub code: String,
    /// QR code de l'adresse, en SVG.
    pub qr_svg: String,
    /// Tablettes connectées (jetons délivrés).
    pub clients: usize,
}

struct Shared {
    code: String,
    tokens: Mutex<HashMap<String, Instant>>,
    fails: Mutex<HashMap<IpAddr, (u32, Instant)>>,
}

struct Running {
    stop: Arc<AtomicBool>,
    shared: Arc<Shared>,
    url: String,
    qr_svg: String,
}

static SERVER: Mutex<Option<Running>> = Mutex::new(None);
/// Écrans de la tablette que l'app peut imposer (mêmes clés que `regie.html`).
pub const SCREENS: [&str; 10] = ["timing", "relative", "engineer", "flags", "inputs", "gear", "tyres", "map", "duel", "tv"];
/// Dernier écran imposé depuis l'app : (horodatage ms de l'envoi, écran). Chaque tablette
/// l'applique une fois par envoi (l'horodatage distingue les envois, même après redémarrage).
static PUSH: Mutex<Option<(u64, String)>> = Mutex::new(None);

fn push_json() -> Value {
    match PUSH.lock().ok().and_then(|g| g.clone()) {
        Some((rev, tpl)) => serde_json::json!({ "rev": rev, "tpl": tpl }),
        None => Value::Null,
    }
}

/// Affiche cet écran sur toutes les tablettes connectées (elles peuvent ensuite en changer).
#[tauri::command]
pub fn regie_push_screen(screen: String) -> Result<(), AppError> {
    if !SCREENS.contains(&screen.as_str()) {
        return Err(AppError::Internal(format!("unknown screen {screen}")));
    }
    let rev = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(1);
    if let Ok(mut g) = PUSH.lock() {
        *g = Some((rev, screen));
    }
    Ok(())
}

/// Thème de l'app (clair par défaut, comme l'app) : la tablette prend le même.
static DARK: AtomicBool = AtomicBool::new(false);

fn theme_name() -> &'static str {
    if DARK.load(Ordering::Relaxed) {
        "dark"
    } else {
        "light"
    }
}
static GENERATION: AtomicU64 = AtomicU64::new(0);

fn random_bytes<const N: usize>() -> [u8; N] {
    use ring::rand::SecureRandom;
    let mut b = [0u8; N];
    let _ = ring::rand::SystemRandom::new().fill(&mut b);
    b
}

/// Code à 6 chiffres, uniforme (rejet des valeurs biaisées).
pub fn new_code() -> String {
    loop {
        let v = u32::from_le_bytes(random_bytes::<4>());
        if v < 4_294_000_000 {
            return format!("{:06}", v % 1_000_000);
        }
    }
}

fn new_token() -> String {
    random_bytes::<24>().iter().map(|b| format!("{b:02x}")).collect()
}

/// Adresse IPv4 du réseau local (interface de la route par défaut). Aucun
/// paquet n'est envoyé : `connect` sur UDP ne fait que choisir l'interface.
pub fn lan_ipv4() -> Option<Ipv4Addr> {
    let s = UdpSocket::bind("0.0.0.0:0").ok()?;
    s.connect("192.0.2.1:9").ok()?;
    match s.local_addr().ok()?.ip() {
        IpAddr::V4(ip) if !ip.is_loopback() && !ip.is_unspecified() => Some(ip),
        _ => None,
    }
}

/// `Host` accepté : une adresse IP littérale (avec port) ou `localhost`.
pub fn host_ok(host: &str) -> bool {
    let h = host.trim();
    let name = if let Some(rest) = h.strip_prefix('[') {
        rest.split(']').next().unwrap_or("")
    } else {
        h.rsplit_once(':').map(|(a, _)| a).unwrap_or(h)
    };
    name.eq_ignore_ascii_case("localhost") || name.parse::<IpAddr>().is_ok()
}

/// Adresse du QR code : le code d'accès est dans le fragment (`#code=…`), jamais envoyé au
/// serveur dans une requête ; la page l'utilise pour se connecter puis l'efface de l'adresse.
pub fn login_url(url: &str, code: &str) -> String {
    format!("{url}/#code={code}")
}

fn qr_svg(text: &str) -> String {
    use qrcode::render::svg;
    qrcode::QrCode::new(text.as_bytes())
        .map(|c| {
            c.render::<svg::Color>()
                .min_dimensions(180, 180)
                .dark_color(svg::Color("#000000"))
                .light_color(svg::Color("#ffffff"))
                .build()
        })
        .unwrap_or_default()
}

// ── HTTP minimal ────────────────────────────────────────────────────────────

pub struct Request {
    pub method: String,
    pub path: String,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
}

/// Lit une requête (ligne, en-têtes, corps borné). `None` si illisible.
pub fn read_request<R: Read>(stream: R) -> Option<Request> {
    let mut r = BufReader::new(stream.take(16 * 1024));
    let mut line = String::new();
    r.read_line(&mut line).ok()?;
    let mut parts = line.split_whitespace();
    let method = parts.next()?.to_string();
    let path = parts.next()?.to_string();
    let mut headers = HashMap::new();
    loop {
        let mut h = String::new();
        if r.read_line(&mut h).ok()? == 0 {
            break;
        }
        let h = h.trim_end();
        if h.is_empty() {
            break;
        }
        if let Some((k, v)) = h.split_once(':') {
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }
    let len: usize = headers.get("content-length").and_then(|v| v.parse().ok()).unwrap_or(0);
    if len > MAX_BODY {
        return None;
    }
    let mut body = vec![0u8; len];
    r.read_exact(&mut body).ok()?;
    Some(Request { method, path, headers, body })
}

pub(crate) fn respond(mut s: impl Write, status: &str, ctype: &str, body: &[u8], extra: &str) {
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\nCache-Control: no-store\r\n\
         X-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n{extra}\r\n",
        body.len()
    );
    let _ = s.write_all(head.as_bytes());
    let _ = s.write_all(body);
}

fn json(s: impl Write, status: &str, v: &Value) {
    respond(s, status, "application/json; charset=utf-8", v.to_string().as_bytes(), "");
}

/// Trame live allégée pour la tablette.
pub fn light_frame(v: Value) -> Value {
    let mut v = v;
    if let Some(o) = v.as_object_mut() {
        for k in HEAVY {
            o.remove(k);
        }
    }
    v
}

/// Trame minimale de l'écran Pédales : interrogée ~15 fois par seconde, elle ne
/// porte que la télémétrie de la voiture (sans les roues) et les aides.
pub fn inputs_frame(v: &Value) -> Value {
    let mut tel = v.get("telemetry").cloned().unwrap_or(Value::Null);
    if let Some(o) = tel.as_object_mut() {
        o.remove("wheels");
        o.remove("damage_zones");
    }
    let x = |k: &str| v.pointer(&format!("/extended/{k}")).cloned().unwrap_or(Value::Null);
    serde_json::json!({
        "connected": v.get("connected").cloned().unwrap_or(Value::Bool(false)),
        "telemetry": tel,
        "tc": x("tc"), "tc_max": x("tc_max"), "abs": x("abs"), "abs_max": x("abs_max"),
        "motor_map": x("motor_map"),
        "lap_delta": v.pointer("/player/lap_delta").cloned().unwrap_or(Value::Null),
    })
}

fn bearer(req: &Request) -> Option<&str> {
    req.headers.get("authorization").and_then(|v| v.strip_prefix("Bearer ")).map(str::trim)
}

fn authorized(sh: &Shared, req: &Request) -> bool {
    let Some(tok) = bearer(req) else { return false };
    let Ok(mut t) = sh.tokens.lock() else { return false };
    match t.get_mut(tok) {
        Some(seen) => {
            *seen = Instant::now();
            true
        }
        None => false,
    }
}

/// Égalité en temps constant (la durée ne dépend pas de l'endroit du 1er écart).
fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Vérifie le code ; gère le blocage par adresse. `Err(())` = bloquée.
fn check_code(sh: &Shared, ip: IpAddr, code: &str) -> Result<bool, ()> {
    let mut fails = sh.fails.lock().map_err(|_| ())?;
    if let Some((n, since)) = fails.get(&ip) {
        if *n >= MAX_FAILS && since.elapsed() < LOCKOUT {
            return Err(());
        }
    }
    let ok = ct_eq(code.as_bytes(), sh.code.as_bytes());
    if ok {
        fails.remove(&ip);
    } else {
        let e = fails.entry(ip).or_insert((0, Instant::now()));
        if e.1.elapsed() >= LOCKOUT {
            *e = (0, Instant::now());
        }
        e.0 += 1;
        e.1 = Instant::now();
    }
    Ok(ok)
}

fn handle(stream: TcpStream, peer: IpAddr, sh: &Shared) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(3)));
    let Ok(reader) = stream.try_clone() else { return };
    let Some(req) = read_request(reader) else {
        respond(&stream, "400 Bad Request", "text/plain", b"bad request", "");
        return;
    };
    if !req.headers.get("host").map(|h| host_ok(h)).unwrap_or(false) {
        respond(&stream, "421 Misdirected Request", "text/plain", b"bad host", "");
        return;
    }
    let path = req.path.split('?').next().unwrap_or("/");
    match (req.method.as_str(), path) {
        ("GET", "/") | ("GET", "/index.html") => {
            // Thème posé dès le premier affichage (écran de connexion compris).
            let page = PAGE.replacen("__THEME__", theme_name(), 1);
            respond(&stream, "200 OK", "text/html; charset=utf-8", page.as_bytes(), PAGE_CSP)
        }
        // Ressources publiques de l'écran d'accueil (aucune donnée live).
        ("GET", "/manifest.webmanifest") => {
            respond(&stream, "200 OK", "application/manifest+json", MANIFEST.as_bytes(), "")
        }
        ("GET", "/icon.png") => respond(&stream, "200 OK", "image/png", ICON, ""),
        ("GET", f) if FONTS.iter().any(|(p, _)| *p == f) => {
            let data = FONTS.iter().find(|(p, _)| *p == f).map(|(_, d)| *d).unwrap_or_default();
            respond(&stream, "200 OK", "font/woff2", data, "")
        }
        ("POST", "/api/login") => {
            let code: String = serde_json::from_slice::<Value>(&req.body)
                .ok()
                .and_then(|v| v.get("code").and_then(Value::as_str).map(str::to_string))
                .unwrap_or_default();
            match check_code(sh, peer, code.trim()) {
                Err(()) => json(&stream, "429 Too Many Requests", &serde_json::json!({"error": "locked"})),
                Ok(false) => json(&stream, "401 Unauthorized", &serde_json::json!({"error": "code"})),
                Ok(true) => {
                    let tok = new_token();
                    if let Ok(mut t) = sh.tokens.lock() {
                        t.insert(tok.clone(), Instant::now());
                    }
                    json(&stream, "200 OK", &serde_json::json!({"token": tok}));
                }
            }
        }
        ("GET", "/api/live") | ("GET", "/api/track") | ("GET", "/api/inputs") => {
            if !authorized(sh, &req) {
                json(&stream, "401 Unauthorized", &serde_json::json!({"error": "auth"}));
                return;
            }
            let frame = live::last_frame().and_then(|d| serde_json::to_value(d).ok());
            let Some(frame) = frame else {
                json(&stream, "200 OK", &serde_json::json!({"connected": false, "ui_theme": theme_name(), "ui_push": push_json()}));
                return;
            };
            let out = if path == "/api/live" {
                let mut v = light_frame(frame);
                if let Some(o) = v.as_object_mut() {
                    o.insert("ui_theme".into(), Value::from(theme_name()));
                    o.insert("ui_push".into(), push_json());
                }
                v
            } else if path == "/api/inputs" {
                inputs_frame(&frame)
            } else {
                let pick = |k: &str| frame.get(k).cloned().unwrap_or(Value::Null);
                serde_json::json!({
                    "track": frame.pointer("/session/track").cloned().unwrap_or(Value::Null),
                    "track_points": pick("track_points"),
                    "track_dists": pick("track_dists"),
                    "pit_lane_points": pick("pit_lane_points"),
                    "sector_dists": pick("sector_dists"),
                })
            };
            json(&stream, "200 OK", &out);
        }
        _ => respond(&stream, "404 Not Found", "text/plain", b"not found", ""),
    }
}

fn status_of(r: &Running) -> RegieStatus {
    RegieStatus {
        running: true,
        url: r.url.clone(),
        code: r.shared.code.clone(),
        qr_svg: r.qr_svg.clone(),
        clients: r.shared.tokens.lock().map(|t| t.len()).unwrap_or(0),
    }
}

fn stopped() -> RegieStatus {
    RegieStatus { running: false, url: String::new(), code: String::new(), qr_svg: String::new(), clients: 0 }
}

/// Démarre la régie (idempotent : renvoie l'état courant si elle tourne).
#[tauri::command]
pub fn regie_start(app: AppHandle, port: Option<u16>) -> Result<RegieStatus, AppError> {
    let mut g = SERVER.lock().map_err(|e| AppError::Internal(format!("regie lock: {e}")))?;
    if let Some(r) = g.as_ref() {
        return Ok(status_of(r));
    }
    let ip = lan_ipv4().ok_or_else(|| AppError::Unsupported("no local network address".into()))?;
    let port = port.filter(|p| *p >= 1024).unwrap_or(DEFAULT_PORT);
    let listener = TcpListener::bind(SocketAddr::new(IpAddr::V4(ip), port)).map_err(AppError::Io)?;
    listener.set_nonblocking(true).map_err(AppError::Io)?;
    let url = format!("http://{ip}:{port}");
    let shared = Arc::new(Shared {
        code: new_code(),
        tokens: Mutex::new(HashMap::new()),
        fails: Mutex::new(HashMap::new()),
    });
    let stop = Arc::new(AtomicBool::new(false));
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    live::acquire(&app, CONSUMER)?;
    {
        let (stop, shared) = (stop.clone(), shared.clone());
        std::thread::spawn(move || {
            while !stop.load(Ordering::SeqCst) && GENERATION.load(Ordering::SeqCst) == generation {
                match listener.accept() {
                    Ok((s, peer)) => {
                        let _ = s.set_nonblocking(false);
                        let sh = shared.clone();
                        // Une connexion = un thread court (tablettes peu nombreuses).
                        std::thread::spawn(move || handle(s, peer.ip(), &sh));
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(50));
                    }
                    Err(_) => std::thread::sleep(Duration::from_millis(200)),
                }
            }
        });
    }
    let running = Running { stop, qr_svg: qr_svg(&login_url(&url, &shared.code)), shared, url };
    let st = status_of(&running);
    *g = Some(running);
    Ok(st)
}

#[tauri::command]
pub fn regie_stop() -> Result<RegieStatus, AppError> {
    let mut g = SERVER.lock().map_err(|e| AppError::Internal(format!("regie lock: {e}")))?;
    if let Some(r) = g.take() {
        r.stop.store(true, Ordering::SeqCst);
        live::release_window(CONSUMER);
    }
    Ok(stopped())
}

/// Thème courant de l'app (`dark` / `light`), suivi en direct par la tablette.
#[tauri::command]
pub fn regie_set_theme(theme: String) {
    DARK.store(theme == "dark", Ordering::Relaxed);
}

#[tauri::command]
pub fn regie_status() -> Result<RegieStatus, AppError> {
    let g = SERVER.lock().map_err(|e| AppError::Internal(format!("regie lock: {e}")))?;
    Ok(g.as_ref().map(status_of).unwrap_or_else(stopped))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code_is_six_digits() {
        for _ in 0..50 {
            let c = new_code();
            assert_eq!(c.len(), 6);
            assert!(c.chars().all(|ch| ch.is_ascii_digit()));
        }
        assert_ne!(new_token(), new_token());
    }

    #[test]
    fn host_header_guard() {
        assert!(host_ok("192.168.1.20:8790"));
        assert!(host_ok("localhost:8790"));
        assert!(host_ok("[::1]:8790"));
        assert!(!host_ok("evil.example.com:8790"));
        assert!(!host_ok("attacker.test"));
    }

    #[test]
    fn parses_request_with_bounded_body() {
        let raw = b"POST /api/login HTTP/1.1\r\nHost: 10.0.0.2:8790\r\nContent-Length: 17\r\n\r\n{\"code\":\"123456\"}";
        let r = read_request(&raw[..]).unwrap();
        assert_eq!((r.method.as_str(), r.path.as_str()), ("POST", "/api/login"));
        assert_eq!(r.headers["host"], "10.0.0.2:8790");
        assert_eq!(r.body.len(), 17);
        let big = format!("POST / HTTP/1.1\r\nContent-Length: {}\r\n\r\n", MAX_BODY + 1);
        assert!(read_request(big.as_bytes()).is_none());
    }

    #[test]
    fn lockout_after_five_wrong_codes() {
        let sh = Shared { code: "424242".into(), tokens: Mutex::new(HashMap::new()), fails: Mutex::new(HashMap::new()) };
        let ip: IpAddr = "10.0.0.9".parse().unwrap();
        for _ in 0..MAX_FAILS {
            assert_eq!(check_code(&sh, ip, "000000"), Ok(false));
        }
        assert_eq!(check_code(&sh, ip, "424242"), Err(()), "bloquée même avec le bon code");
        let other: IpAddr = "10.0.0.10".parse().unwrap();
        assert_eq!(check_code(&sh, other, "424242"), Ok(true), "une autre tablette n'est pas bloquée");
    }

    #[test]
    fn light_frame_drops_heavy_fields() {
        let v = serde_json::json!({"connected": true, "track_points": [[0,0]], "nearby": [], "standings": []});
        let l = light_frame(v);
        assert!(l.get("track_points").is_none() && l.get("nearby").is_none());
        assert!(l.get("standings").is_some());
    }

    /// Bout en bout sur la boucle locale : page, refus sans jeton, connexion,
    /// API protégée, `Host` étranger refusé.
    #[test]
    fn end_to_end_on_loopback() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let sh = Arc::new(Shared { code: "135790".into(), tokens: Mutex::new(HashMap::new()), fails: Mutex::new(HashMap::new()) });
        {
            let sh = sh.clone();
            std::thread::spawn(move || {
                for s in listener.incoming().take(8).flatten() {
                    let peer = s.peer_addr().unwrap().ip();
                    handle(s, peer, &sh);
                }
            });
        }
        let req = |raw: String| -> String {
            let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
            s.write_all(raw.as_bytes()).unwrap();
            // Octets bruts (l'icône n'est pas de l'UTF-8).
            let mut out = Vec::new();
            let _ = s.read_to_end(&mut out);
            String::from_utf8_lossy(&out).into_owned()
        };
        let host = format!("127.0.0.1:{port}");
        let page = req(format!("GET / HTTP/1.1\r\nHost: {host}\r\n\r\n"));
        assert!(page.starts_with("HTTP/1.1 200") && page.contains("<html"));
        assert!(page.contains("media-src data:") && page.contains("manifest-src 'self'"));
        assert!(page.contains("data-theme=\"light\"") && !page.contains("__THEME__"));
        let manifest = req(format!("GET /manifest.webmanifest HTTP/1.1\r\nHost: {host}\r\n\r\n"));
        let mbody = manifest.split("\r\n\r\n").nth(1).unwrap();
        let m: Value = serde_json::from_str(mbody).unwrap();
        assert_eq!(m["display"], "fullscreen");
        assert!(page.contains("font-src 'self'"));
        let font = req(format!("GET /fonts/barlow-condensed-700.woff2 HTTP/1.1\r\nHost: {host}\r\n\r\n"));
        assert!(font.starts_with("HTTP/1.1 200") && font.contains("font/woff2") && font.contains("wOF2"));
        let icon = req(format!("GET /icon.png HTTP/1.1\r\nHost: {host}\r\n\r\n"));
        assert!(icon.starts_with("HTTP/1.1 200") && icon.contains("image/png"));
        let denied = req(format!("GET /api/live HTTP/1.1\r\nHost: {host}\r\n\r\n"));
        assert!(denied.starts_with("HTTP/1.1 401"));
        let body = "{\"code\":\"135790\"}";
        let login = req(format!("POST /api/login HTTP/1.1\r\nHost: {host}\r\nContent-Length: {}\r\n\r\n{body}", body.len()));
        assert!(login.starts_with("HTTP/1.1 200"), "{login}");
        let tok = login.split("\"token\":\"").nth(1).unwrap().split('"').next().unwrap().to_string();
        let ok = req(format!("GET /api/live HTTP/1.1\r\nHost: {host}\r\nAuthorization: Bearer {tok}\r\n\r\n"));
        assert!(ok.starts_with("HTTP/1.1 200"), "{ok}");
        let rebound = req(format!("GET / HTTP/1.1\r\nHost: evil.example:{port}\r\n\r\n"));
        assert!(rebound.starts_with("HTTP/1.1 421"));
    }

    #[test]
    fn inputs_frame_is_minimal() {
        let v = serde_json::json!({"connected": true, "standings": [1, 2],
            "telemetry": {"throttle": 0.8, "brake": 0.1, "wheels": [1, 2, 3, 4], "damage_zones": [0]},
            "extended": {"tc": 3, "abs": 2, "status_message": "x"}});
        let i = inputs_frame(&v);
        assert_eq!(i["telemetry"]["throttle"], 0.8);
        assert!(i["telemetry"].get("wheels").is_none() && i.get("standings").is_none());
        assert_eq!((i["tc"].as_i64(), i["abs"].as_i64()), (Some(3), Some(2)));
    }

    #[test]
    fn constant_time_compare() {
        assert!(ct_eq(b"123456", b"123456"));
        assert!(!ct_eq(b"123456", b"123457"));
        assert!(!ct_eq(b"12345", b"123456"));
    }

    #[test]
    fn login_url_carries_code_in_fragment() {
        assert_eq!(login_url("http://192.168.1.20:8790", "042137"), "http://192.168.1.20:8790/#code=042137");
    }

    #[test]
    fn push_screen_validates_and_is_served() {
        assert!(regie_push_screen("nope".into()).is_err());
        regie_push_screen("gear".into()).unwrap();
        let p = push_json();
        assert_eq!(p["tpl"], "gear");
        assert!(p["rev"].as_u64().unwrap() > 0);
        let v = serde_json::json!({"player": {"lap_delta": -0.42}, "telemetry": {}});
        assert_eq!(inputs_frame(&v)["lap_delta"], -0.42);
    }

    #[test]
    fn qr_is_svg() {
        assert!(qr_svg("http://192.168.1.20:8790").contains("<svg"));
    }
}
