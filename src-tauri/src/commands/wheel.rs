//! Push-to-talk sur un bouton de volant (lu en arrière-plan, le jeu ayant le focus).
//!
//! Deux backends :
//! 1. **winmm** (`joyGetPosEx`) : API joystick historique de Windows, lisible hors
//!    focus, limitée à 16 périphériques × 32 boutons.
//! 2. **HID brut** (`hidapi`) en repli, pour les volants dont les boutons échappent
//!    à winmm (> 32 boutons, ex. Simagic). Pas d'analyse du descripteur de rapport :
//!    on **apprend le bit** — ligne de base de ~300 ms (les bits qui bougent = axes
//!    analogiques, ignorés), puis le premier bit stable qui passe de 0 à 1 quand
//!    l'utilisateur appuie = le bouton (id de rapport, octet, masque, état appuyé).
//!
//! Commandes :
//! - `wheel_capture(timeout_ms)` : attend le premier appui, renvoie la liaison ou `None`.
//! - `wheel_watch(binding)` : (re)démarre l'unique thread de surveillance (~100 Hz) qui
//!   émet `"ptt-wheel"` `{ "pressed": bool }` à chaque front (anti-rebond 20 ms) ;
//!   `None` l'arrête. Volant débranché → nouvelle tentative silencieuse toutes les 2 s.

use std::collections::HashMap;
use std::ffi::CString;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::error::{AppError, AppResult};

/// Événement émis à chaque front du bouton surveillé.
pub const PTT_WHEEL_EVENT: &str = "ptt-wheel";

/// Durée de la ligne de base HID (détection des bits « bruyants » = axes).
const BASELINE_MS: u64 = 300;
/// Durée minimale pendant laquelle un bit candidat doit rester appuyé pour être retenu.
const STABLE_MS: u64 = 40;
/// Anti-rebond des fronts émis par `wheel_watch`.
const DEBOUNCE_MS: u64 = 20;
const CAPTURE_TICK: Duration = Duration::from_millis(5);
const WATCH_TICK: Duration = Duration::from_millis(10);
const RETRY_EVERY: Duration = Duration::from_secs(2);
const CAPTURE_MIN_MS: u32 = 500;
const CAPTURE_MAX_MS: u32 = 60_000;
const MAX_JOYSTICKS: u32 = 16;
const HID_BUF_LEN: usize = 1024;
const MAX_READS_PER_TICK: usize = 64;
const MAX_BUFFERED_BASELINE: usize = 2048;

/// Liaison d'un bouton de volant, persistée côté frontend.
///
/// - `Winmm.button` : numéro 1-based (comme le panneau « Contrôleurs de jeu » de
///   Windows) ; bit testé = `1 << (button - 1)`.
/// - `Hid.reportId` : 0 = périphérique sans rapports numérotés (pas de filtre sur le
///   1er octet) ; `byte` = index dans le rapport tel que lu par hidapi (id inclus).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum WheelBinding {
    Winmm {
        joy: u32,
        button: u32,
        label: String,
    },
    Hid {
        path: String,
        vid: u16,
        pid: u16,
        product: String,
        report_id: u8,
        byte: u32,
        mask: u8,
        pressed_set: bool,
        label: String,
    },
}

#[derive(Debug, Clone, Copy, Serialize)]
struct PttWheelPayload {
    pressed: bool,
}

// ─────────────────────────────────────────────────────────────────────────────
// Logique pure (testée) : apprentissage de bit HID + anti-rebond
// ─────────────────────────────────────────────────────────────────────────────

/// Bit appris sur un rapport HID.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LearnedBit {
    pub report_id: u8,
    pub byte: u32,
    pub mask: u8,
    pub pressed_set: bool,
}

/// État d'un type de rapport (clé = id de rapport, ou 0 si non numéroté).
#[derive(Debug, Clone)]
struct ReportTrack {
    baseline: Vec<u8>,
    noisy: Vec<u8>,
    last: Vec<u8>,
}

impl ReportTrack {
    fn fresh(report: &[u8]) -> Self {
        Self {
            baseline: report.to_vec(),
            noisy: vec![0; report.len()],
            last: report.to_vec(),
        }
    }

    /// Aligne les tampons sur `len` ; les octets qui n'existaient pas sont bruyants.
    fn grow_to(&mut self, len: usize) {
        if len > self.baseline.len() {
            self.baseline.resize(len, 0);
            self.last.resize(len, 0);
            self.noisy.resize(len, 0xFF);
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct Candidate {
    key: u8,
    byte: usize,
    mask: u8,
    since_ms: u64,
}

/// Apprentissage du bit d'un bouton sur les rapports d'entrée d'UN périphérique HID.
///
/// Règles :
/// - ligne de base : tout bit qui change = bruyant ; un octet avec ≥ 2 bits bruyants
///   est un octet d'axe → entièrement ignoré ;
/// - détection : seule une transition 0 → 1 d'un bit non bruyant compte (les boutons
///   HID sont actifs à 1 ; un bouton déjà tenu au départ est ignoré jusqu'à son
///   relâchement) ; il doit rester à 1 pendant `STABLE_MS` ;
/// - apprentissage continu du bruit : changement simultané de ≥ 2 bits dans un octet,
///   retenue d'un octet d'axe voisin (bit 7 de l'octet précédent), ou retour à 0 avant
///   `STABLE_MS` → bit/octet marqué bruyant.
#[derive(Debug, Clone)]
pub struct BitLearner {
    /// `Some(true)` : 1er octet = id de rapport. `None` : à déduire (repli heuristique).
    numbered: Option<bool>,
    in_baseline: bool,
    buffered: Vec<Vec<u8>>,
    tracks: HashMap<u8, ReportTrack>,
    candidate: Option<Candidate>,
}

impl BitLearner {
    pub fn new(numbered: Option<bool>) -> Self {
        Self {
            numbered,
            in_baseline: true,
            buffered: Vec::new(),
            tracks: HashMap::new(),
            candidate: None,
        }
    }

    fn is_numbered(&self) -> bool {
        self.numbered.unwrap_or(true)
    }

    /// Clé du rapport et premier octet de données.
    fn key_and_start(&self, report: &[u8]) -> (u8, usize) {
        if self.is_numbered() {
            (report[0], 1)
        } else {
            (0, 0)
        }
    }

    /// Repli quand le descripteur est illisible : hidapi (Windows) retire l'octet 0
    /// des rapports non numérotés, et un id de rapport n'est jamais 0 → un 1er octet
    /// nul trahit un périphérique non numéroté.
    fn guess_numbered(reports: &[Vec<u8>]) -> Option<bool> {
        if reports.is_empty() {
            None
        } else {
            Some(!reports.iter().any(|r| r[0] == 0))
        }
    }

    pub fn feed_baseline(&mut self, report: &[u8]) {
        if report.is_empty() || !self.in_baseline {
            return;
        }
        if self.numbered.is_none() {
            if self.buffered.len() < MAX_BUFFERED_BASELINE {
                self.buffered.push(report.to_vec());
            }
            return;
        }
        self.absorb_baseline(report);
    }

    fn absorb_baseline(&mut self, report: &[u8]) {
        let (key, _) = self.key_and_start(report);
        match self.tracks.get_mut(&key) {
            None => {
                self.tracks.insert(key, ReportTrack::fresh(report));
            }
            Some(t) => {
                let old_len = t.baseline.len();
                t.grow_to(report.len());
                for i in 0..t.baseline.len() {
                    if i >= old_len || i >= report.len() {
                        t.noisy[i] = 0xFF;
                    } else {
                        t.noisy[i] |= t.baseline[i] ^ report[i];
                    }
                }
                let n = report.len();
                t.last[..n].copy_from_slice(report);
            }
        }
    }

    pub fn end_baseline(&mut self) {
        if !self.in_baseline {
            return;
        }
        if self.numbered.is_none() {
            self.numbered = Self::guess_numbered(&self.buffered);
        }
        for report in std::mem::take(&mut self.buffered) {
            self.absorb_baseline(&report);
        }
        for t in self.tracks.values_mut() {
            for n in t.noisy.iter_mut() {
                if n.count_ones() >= 2 {
                    *n = 0xFF;
                }
            }
        }
        self.in_baseline = false;
    }

    /// Masque de bruit d'un rapport (tests/diagnostic).
    #[cfg(test)]
    fn noisy_mask(&self, key: u8) -> Option<&[u8]> {
        self.tracks.get(&key).map(|t| t.noisy.as_slice())
    }

    /// Traite un rapport après la ligne de base ; renvoie le bit dès qu'il est confirmé.
    pub fn feed(&mut self, report: &[u8], now_ms: u64) -> Option<LearnedBit> {
        if self.in_baseline {
            self.feed_baseline(report);
            return None;
        }
        if report.is_empty() {
            return self.poll(now_ms);
        }
        if self.numbered.is_none() {
            self.numbered = Some(report[0] != 0);
        }
        let (key, start) = self.key_and_start(report);
        let Some(t) = self.tracks.get_mut(&key) else {
            // Rapport jamais vu pendant la ligne de base (périphérique qui n'émet qu'au
            // changement) : il devient sa propre référence.
            self.tracks.insert(key, ReportTrack::fresh(report));
            return self.poll(now_ms);
        };
        t.grow_to(report.len());
        let mut cur = t.last.clone();
        cur[..report.len()].copy_from_slice(report);

        for i in start..cur.len() {
            let changed = (cur[i] ^ t.last[i]) & !t.noisy[i];
            if changed == 0 {
                continue;
            }
            let carry = i > start
                && t.noisy[i - 1] == 0xFF
                && ((cur[i - 1] ^ t.last[i - 1]) & 0x80) != 0;
            if changed.count_ones() >= 2 || carry {
                t.noisy[i] = 0xFF;
                continue;
            }
            let bit = changed;
            if cur[i] & bit != 0 {
                if t.baseline[i] & bit == 0 && self.candidate.is_none() {
                    self.candidate = Some(Candidate { key, byte: i, mask: bit, since_ms: now_ms });
                }
            } else {
                if let Some(c) = self.candidate {
                    if c.key == key && c.byte == i && c.mask == bit {
                        if now_ms.saturating_sub(c.since_ms) < STABLE_MS {
                            t.noisy[i] |= bit;
                        }
                        self.candidate = None;
                    }
                }
                // Bouton tenu au départ puis relâché : un nouvel appui comptera.
                t.baseline[i] &= !bit;
            }
        }
        if let Some(c) = self.candidate {
            if c.key == key && t.noisy[c.byte] & c.mask != 0 {
                self.candidate = None;
            }
        }
        t.last = cur;
        self.poll(now_ms)
    }

    /// Confirme le candidat s'il est resté appuyé assez longtemps (même sans
    /// nouveau rapport : beaucoup de périphériques n'émettent qu'au changement).
    pub fn poll(&self, now_ms: u64) -> Option<LearnedBit> {
        let c = self.candidate?;
        (now_ms.saturating_sub(c.since_ms) >= STABLE_MS).then(|| LearnedBit {
            report_id: if self.is_numbered() { c.key } else { 0 },
            byte: c.byte as u32,
            mask: c.mask,
            pressed_set: true,
        })
    }
}

/// État du bouton dans un rapport, ou `None` si le rapport ne le concerne pas.
pub fn report_pressed(report: &[u8], report_id: u8, byte: u32, mask: u8, pressed_set: bool) -> Option<bool> {
    if report_id != 0 && report.first() != Some(&report_id) {
        return None;
    }
    let b = *report.get(byte as usize)?;
    Some(((b & mask) != 0) == pressed_set)
}

/// Le descripteur déclare-t-il des rapports numérotés (item global « Report ID ») ?
/// Simple parcours des items, sans interpréter la disposition des rapports.
pub fn descriptor_has_report_ids(desc: &[u8]) -> bool {
    let mut i = 0;
    while i < desc.len() {
        let prefix = desc[i];
        if prefix == 0xFE {
            // Item long : taille dans l'octet suivant.
            let size = desc.get(i + 1).copied().unwrap_or(0) as usize;
            i += 3 + size;
            continue;
        }
        if prefix & 0xFC == 0x84 {
            return true;
        }
        let size = [0usize, 1, 2, 4][(prefix & 0x03) as usize];
        i += 1 + size;
    }
    false
}

/// Anti-rebond : un nouvel état n'est validé qu'après `delay_ms` de stabilité.
#[derive(Debug, Clone)]
pub struct Debouncer {
    stable: bool,
    raw: bool,
    raw_since_ms: u64,
    delay_ms: u64,
}

impl Debouncer {
    pub fn new(delay_ms: u64) -> Self {
        Self { stable: false, raw: false, raw_since_ms: 0, delay_ms }
    }

    /// Renvoie `Some(état)` sur un front validé.
    pub fn update(&mut self, raw: bool, now_ms: u64) -> Option<bool> {
        if raw != self.raw {
            self.raw = raw;
            self.raw_since_ms = now_ms;
        }
        if self.raw != self.stable && now_ms.saturating_sub(self.raw_since_ms) >= self.delay_ms {
            self.stable = self.raw;
            return Some(self.stable);
        }
        None
    }

    pub fn is_pressed(&self) -> bool {
        self.stable
    }

    pub fn reset(&mut self) {
        self.stable = false;
        self.raw = false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend winmm
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(windows)]
mod winmm {
    use windows::core::PCWSTR;
    use windows::Win32::Media::Multimedia::{
        joyGetDevCapsW, joyGetNumDevs, joyGetPosEx, JOYCAPSW, JOYERR_NOERROR, JOYINFOEX,
        JOY_RETURNBUTTONS,
    };
    use windows::Win32::System::Registry::{
        RegGetValueW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ,
    };

    /// Masque des boutons (bit 0 = bouton 1), `None` si le joystick est absent.
    pub fn buttons(joy: u32) -> Option<u32> {
        let mut info = JOYINFOEX {
            dwSize: std::mem::size_of::<JOYINFOEX>() as u32,
            dwFlags: JOY_RETURNBUTTONS as u32,
            ..Default::default()
        };
        let rc = unsafe { joyGetPosEx(joy, &mut info) };
        (rc == JOYERR_NOERROR).then_some(info.dwButtons)
    }

    pub fn count() -> u32 {
        unsafe { joyGetNumDevs() }.min(super::MAX_JOYSTICKS)
    }

    fn wide_to_string(w: &[u16]) -> String {
        let end = w.iter().position(|&c| c == 0).unwrap_or(w.len());
        String::from_utf16_lossy(&w[..end]).trim().to_string()
    }

    fn reg_string(root: HKEY, subkey: &str, value: &str) -> Option<String> {
        let sub: Vec<u16> = subkey.encode_utf16().chain(std::iter::once(0)).collect();
        let val: Vec<u16> = value.encode_utf16().chain(std::iter::once(0)).collect();
        let mut buf = [0u16; 260];
        let mut size = std::mem::size_of_val(&buf) as u32;
        let rc = unsafe {
            RegGetValueW(
                root,
                PCWSTR(sub.as_ptr()),
                PCWSTR(val.as_ptr()),
                RRF_RT_REG_SZ,
                None,
                Some(buf.as_mut_ptr().cast()),
                Some(&mut size),
            )
        };
        if rc.is_err() {
            return None;
        }
        let s = wide_to_string(&buf);
        (!s.is_empty()).then_some(s)
    }

    /// Nom lisible : `OEMName` du registre (par VID/PID), sinon `szPname`.
    pub fn name(joy: u32) -> Option<String> {
        let mut caps = JOYCAPSW::default();
        let rc = unsafe {
            joyGetDevCapsW(joy as usize, &mut caps, std::mem::size_of::<JOYCAPSW>() as u32)
        };
        if rc != JOYERR_NOERROR {
            return None;
        }
        let (vid, pid) = (caps.wMid, caps.wPid);
        let key = format!(
            "System\\CurrentControlSet\\Control\\MediaProperties\\PrivateProperties\\Joystick\\OEM\\VID_{vid:04X}&PID_{pid:04X}"
        );
        if let Some(n) = reg_string(HKEY_CURRENT_USER, &key, "OEMName")
            .or_else(|| reg_string(HKEY_LOCAL_MACHINE, &key, "OEMName"))
        {
            return Some(n);
        }
        let pname = caps.szPname;
        let n = wide_to_string(&pname);
        (!n.is_empty()).then_some(n)
    }
}

#[cfg(not(windows))]
mod winmm {
    pub fn buttons(_joy: u32) -> Option<u32> {
        None
    }
    pub fn count() -> u32 {
        0
    }
    pub fn name(_joy: u32) -> Option<String> {
        None
    }
}

fn winmm_display_name(joy: u32) -> String {
    winmm::name(joy).unwrap_or_else(|| format!("Joystick {}", joy + 1))
}

fn winmm_label(name: &str, button: u32) -> String {
    format!("{name} — bouton {button}")
}

/// Retrouve le joystick d'une liaison : index d'origine si son nom colle au libellé,
/// sinon recherche par nom (ordre des périphériques changé), sinon l'index brut.
fn resolve_winmm(joy: u32, label: &str) -> Option<u32> {
    let matches = |j: u32| {
        winmm::name(j).is_some_and(|n| label.starts_with(&format!("{n} — ")))
    };
    let index_alive = winmm::buttons(joy).is_some();
    if index_alive && matches(joy) {
        return Some(joy);
    }
    (0..winmm::count())
        .filter(|&j| j != joy)
        .find(|&j| winmm::buttons(j).is_some() && matches(j))
        .or(index_alive.then_some(joy))
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend HID
// ─────────────────────────────────────────────────────────────────────────────

const USAGE_PAGE_GENERIC_DESKTOP: u16 = 0x01;
const USAGE_PAGE_SIMULATION: u16 = 0x02;
const USAGE_PAGE_GAME: u16 = 0x05;

fn is_game_controller(info: &hidapi::DeviceInfo) -> bool {
    match info.usage_page() {
        USAGE_PAGE_GENERIC_DESKTOP => matches!(info.usage(), 0x04 | 0x05 | 0x08),
        USAGE_PAGE_SIMULATION | USAGE_PAGE_GAME => true,
        _ => false,
    }
}

/// Collections candidates : contrôleurs de jeu, plus les collections « vendeur »
/// (0xFF00+) des seuls VID/PID qui exposent aussi un contrôleur de jeu. Claviers,
/// souris et autres périphériques sont écartés.
fn hid_candidates(api: &hidapi::HidApi) -> Vec<hidapi::DeviceInfo> {
    let games: Vec<(u16, u16)> = api
        .device_list()
        .filter(|d| is_game_controller(d))
        .map(|d| (d.vendor_id(), d.product_id()))
        .collect();
    api.device_list()
        .filter(|d| {
            is_game_controller(d)
                || (d.usage_page() >= 0xFF00 && games.contains(&(d.vendor_id(), d.product_id())))
        })
        .cloned()
        .collect()
}

fn hid_product(info: &hidapi::DeviceInfo) -> String {
    info.product_string()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("HID {:04X}:{:04X}", info.vendor_id(), info.product_id()))
}

/// `Some(bool)` si le descripteur est lisible, `None` sinon (repli heuristique).
fn hid_numbered(dev: &hidapi::HidDevice) -> Option<bool> {
    let mut desc = vec![0u8; 4096];
    match dev.get_report_descriptor(&mut desc) {
        Ok(n) if n > 0 => Some(descriptor_has_report_ids(&desc[..n])),
        _ => None,
    }
}

fn hid_label(product: &str, bit: &LearnedBit) -> String {
    format!(
        "{product} — bouton (octet {}, bit {})",
        bit.byte,
        bit.mask.trailing_zeros()
    )
}

struct HidCaptureDevice {
    info: hidapi::DeviceInfo,
    dev: hidapi::HidDevice,
    learner: BitLearner,
}

fn open_hid_capture() -> Vec<HidCaptureDevice> {
    let api = match hidapi::HidApi::new() {
        Ok(api) => api,
        Err(e) => {
            eprintln!("[wheel] hidapi indisponible : {e}");
            return Vec::new();
        }
    };
    hid_candidates(&api)
        .into_iter()
        .filter_map(|info| {
            let dev = info.open_device(&api).ok()?;
            dev.set_blocking_mode(false).ok()?;
            let numbered = hid_numbered(&dev);
            Some(HidCaptureDevice { info, dev, learner: BitLearner::new(numbered) })
        })
        .collect()
}

// ─────────────────────────────────────────────────────────────────────────────
// Capture
// ─────────────────────────────────────────────────────────────────────────────

fn capture_blocking(timeout_ms: u32) -> Option<WheelBinding> {
    let timeout = Duration::from_millis(timeout_ms.clamp(CAPTURE_MIN_MS, CAPTURE_MAX_MS) as u64);
    let start = Instant::now();

    // winmm : état initial → seuls les fronts montants comptent (boutons déjà tenus ignorés).
    let mut joys: Vec<(u32, u32)> = (0..winmm::count())
        .filter_map(|j| winmm::buttons(j).map(|b| (j, b)))
        .collect();
    let mut last_rescan = start;

    let mut hid = open_hid_capture();
    let mut baseline_done = false;
    let mut buf = vec![0u8; HID_BUF_LEN];

    loop {
        let now = Instant::now();
        let now_ms = now.duration_since(start).as_millis() as u64;

        for (joy, prev) in joys.iter_mut() {
            let Some(b) = winmm::buttons(*joy) else { continue };
            let rising = b & !*prev;
            *prev = b;
            if rising != 0 {
                let button = rising.trailing_zeros() + 1;
                let label = winmm_label(&winmm_display_name(*joy), button);
                return Some(WheelBinding::Winmm { joy: *joy, button, label });
            }
        }

        if !baseline_done && now_ms >= BASELINE_MS {
            for d in hid.iter_mut() {
                d.learner.end_baseline();
            }
            baseline_done = true;
        }

        let mut found: Option<(usize, LearnedBit)> = None;
        let mut dead: Vec<usize> = Vec::new();
        'devices: for (idx, d) in hid.iter_mut().enumerate() {
            for _ in 0..MAX_READS_PER_TICK {
                match d.dev.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if let Some(bit) = d.learner.feed(&buf[..n], now_ms) {
                            found = Some((idx, bit));
                            break 'devices;
                        }
                    }
                    Err(_) => {
                        dead.push(idx);
                        break;
                    }
                }
            }
            if baseline_done {
                if let Some(bit) = d.learner.poll(now_ms) {
                    found = Some((idx, bit));
                    break;
                }
            }
        }
        if let Some((idx, bit)) = found {
            let info = &hid[idx].info;
            let product = hid_product(info);
            return Some(WheelBinding::Hid {
                path: info.path().to_string_lossy().into_owned(),
                vid: info.vendor_id(),
                pid: info.product_id(),
                label: hid_label(&product, &bit),
                product,
                report_id: bit.report_id,
                byte: bit.byte,
                mask: bit.mask,
                pressed_set: bit.pressed_set,
            });
        }
        for idx in dead.into_iter().rev() {
            hid.remove(idx);
        }

        // Joystick branché pendant la capture : pris en compte toutes les 2 s.
        if now.duration_since(last_rescan) >= RETRY_EVERY {
            last_rescan = now;
            for j in 0..winmm::count() {
                if !joys.iter().any(|(k, _)| *k == j) {
                    if let Some(b) = winmm::buttons(j) {
                        joys.push((j, b));
                    }
                }
            }
        }

        if now.duration_since(start) >= timeout {
            return None;
        }
        std::thread::sleep(CAPTURE_TICK);
    }
}

/// Attend le premier appui d'un bouton sur n'importe quel volant/périphérique de jeu.
/// Renvoie `None` à l'expiration du délai.
#[tauri::command(async)]
pub async fn wheel_capture(timeout_ms: u32) -> AppResult<Option<WheelBinding>> {
    tauri::async_runtime::spawn_blocking(move || capture_blocking(timeout_ms))
        .await
        .map_err(|e| AppError::Internal(format!("wheel_capture: {e}")))
}

// ─────────────────────────────────────────────────────────────────────────────
// Surveillance en arrière-plan
// ─────────────────────────────────────────────────────────────────────────────

/// Génération du thread de surveillance : tout thread dont la génération n'est plus
/// la courante s'arrête (un seul thread actif à la fois).
static WATCH_GEN: AtomicU64 = AtomicU64::new(0);
/// Idem pour le bouton « repère de revue » : surveillé par son propre thread, sans
/// toucher au push-to-talk.
static MARK_WATCH_GEN: AtomicU64 = AtomicU64::new(0);
/// Évènement émis à l'appui / au relâchement du bouton « repère de revue ».
pub const MARK_WHEEL_EVENT: &str = "wheel-mark";

enum WatchSource {
    Winmm { joy: u32, mask: u32 },
    Hid { devices: Vec<hidapi::HidDevice>, locked: Option<usize>, last: bool },
}

struct HidMatch {
    report_id: u8,
    byte: u32,
    mask: u8,
    pressed_set: bool,
}

impl WatchSource {
    fn open(binding: &WheelBinding) -> Option<Self> {
        match binding {
            WheelBinding::Winmm { joy, button, label } => {
                if *button == 0 || *button > 32 {
                    return None;
                }
                let joy = resolve_winmm(*joy, label)?;
                Some(WatchSource::Winmm { joy, mask: 1u32 << (button - 1) })
            }
            WheelBinding::Hid { path, vid, pid, .. } => {
                let api = hidapi::HidApi::new().ok()?;
                let by_path = CString::new(path.as_str())
                    .ok()
                    .and_then(|p| api.open_path(&p).ok());
                let devices: Vec<hidapi::HidDevice> = match by_path {
                    Some(d) => vec![d],
                    // Chemin changé (autre port USB) : toutes les collections candidates
                    // du même VID/PID ; on se cale sur la première qui émet le bon rapport.
                    None => hid_candidates(&api)
                        .iter()
                        .filter(|d| d.vendor_id() == *vid && d.product_id() == *pid)
                        .filter_map(|d| d.open_device(&api).ok())
                        .collect(),
                };
                let devices: Vec<_> = devices
                    .into_iter()
                    .filter(|d| d.set_blocking_mode(false).is_ok())
                    .collect();
                if devices.is_empty() {
                    return None;
                }
                let locked = (devices.len() == 1).then_some(0);
                Some(WatchSource::Hid { devices, locked, last: false })
            }
        }
    }

    /// État brut courant, `Err(())` si le périphérique a disparu.
    fn read(&mut self, m: Option<&HidMatch>, buf: &mut [u8]) -> Result<bool, ()> {
        match self {
            WatchSource::Winmm { joy, mask } => winmm::buttons(*joy).map(|b| b & *mask != 0).ok_or(()),
            WatchSource::Hid { devices, locked, last } => {
                let m = m.ok_or(())?;
                let mut alive = false;
                for (idx, dev) in devices.iter().enumerate() {
                    if locked.is_some_and(|l| l != idx) {
                        continue;
                    }
                    let mut ok = true;
                    for _ in 0..MAX_READS_PER_TICK {
                        match dev.read(buf) {
                            Ok(0) => break,
                            Ok(n) => {
                                if let Some(p) = report_pressed(&buf[..n], m.report_id, m.byte, m.mask, m.pressed_set) {
                                    *last = p;
                                    if locked.is_none() {
                                        *locked = Some(idx);
                                    }
                                }
                            }
                            Err(_) => {
                                ok = false;
                                break;
                            }
                        }
                    }
                    alive |= ok;
                }
                if alive {
                    Ok(*last)
                } else {
                    Err(())
                }
            }
        }
    }
}

fn emit_ptt(app: &AppHandle, event: &str, pressed: bool) {
    let _ = app.emit(event, PttWheelPayload { pressed });
}

fn watch_loop(app: AppHandle, binding: WheelBinding, gen: u64, gens: &'static AtomicU64, event: &'static str) {
    let hid_match = match &binding {
        WheelBinding::Hid { report_id, byte, mask, pressed_set, .. } => Some(HidMatch {
            report_id: *report_id,
            byte: *byte,
            mask: *mask,
            pressed_set: *pressed_set,
        }),
        WheelBinding::Winmm { .. } => None,
    };
    let start = Instant::now();
    let mut debouncer = Debouncer::new(DEBOUNCE_MS);
    let mut source: Option<WatchSource> = None;
    let mut last_attempt: Option<Instant> = None;
    let mut buf = vec![0u8; HID_BUF_LEN];

    while gens.load(Ordering::SeqCst) == gen {
        if source.is_none() && last_attempt.is_none_or(|t| t.elapsed() >= RETRY_EVERY) {
            last_attempt = Some(Instant::now());
            source = WatchSource::open(&binding);
        }
        if let Some(src) = source.as_mut() {
            let now_ms = start.elapsed().as_millis() as u64;
            match src.read(hid_match.as_ref(), &mut buf) {
                Ok(raw) => {
                    if let Some(pressed) = debouncer.update(raw, now_ms) {
                        emit_ptt(&app, event, pressed);
                    }
                }
                Err(()) => {
                    // Débranché : on relâche proprement et on retente plus tard.
                    source = None;
                    last_attempt = Some(Instant::now());
                    if debouncer.is_pressed() {
                        emit_ptt(&app, event, false);
                    }
                    debouncer.reset();
                }
            }
        }
        std::thread::sleep(WATCH_TICK);
    }
    if debouncer.is_pressed() {
        emit_ptt(&app, event, false);
    }
}

/// (Re)démarre la surveillance du bouton lié ; `None` l'arrête.
#[tauri::command(async)]
pub fn wheel_watch(app: AppHandle, binding: Option<WheelBinding>) -> AppResult<()> {
    let gen = WATCH_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    if let Some(binding) = binding {
        std::thread::Builder::new()
            .name("wheel-ptt".into())
            .spawn(move || watch_loop(app, binding, gen, &WATCH_GEN, PTT_WHEEL_EVENT))
            .map_err(|e| AppError::Internal(format!("wheel_watch: {e}")))?;
    }
    Ok(())
}

/// (Re)démarre la surveillance du bouton « repère de revue » (évènement
/// `wheel-mark`) ; `None` l'arrête. Indépendant du push-to-talk.
#[tauri::command(async)]
pub fn wheel_watch_mark(app: AppHandle, binding: Option<WheelBinding>) -> AppResult<()> {
    let gen = MARK_WATCH_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    if let Some(binding) = binding {
        std::thread::Builder::new()
            .name("wheel-mark".into())
            .spawn(move || watch_loop(app, binding, gen, &MARK_WATCH_GEN, MARK_WHEEL_EVENT))
            .map_err(|e| AppError::Internal(format!("wheel_watch_mark: {e}")))?;
    }
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Rapport numéroté : [id, axe_lo, axe_hi, boutons0, boutons1].
    fn rep(id: u8, axis_lo: u8, axis_hi: u8, b0: u8, b1: u8) -> Vec<u8> {
        vec![id, axis_lo, axis_hi, b0, b1]
    }

    fn learner_after_baseline(reports: &[Vec<u8>], numbered: Option<bool>) -> BitLearner {
        let mut l = BitLearner::new(numbered);
        for r in reports {
            l.feed_baseline(r);
        }
        l.end_baseline();
        l
    }

    #[test]
    fn baseline_marks_flickering_bits_and_widens_axis_bytes() {
        let l = learner_after_baseline(
            &[rep(1, 0x10, 0x80, 0, 0), rep(1, 0x11, 0x80, 0, 0), rep(1, 0x12, 0x80, 0, 0)],
            Some(true),
        );
        // 0x10/0x11/0x12 → bits 0 et 1 bruyants → octet entier = axe.
        assert_eq!(l.noisy_mask(1).unwrap(), &[0, 0xFF, 0, 0, 0]);

        let l = learner_after_baseline(&[rep(1, 0x10, 0x80, 0, 0), rep(1, 0x11, 0x80, 0, 0)], Some(true));
        // Un seul bit bruyant : seul ce bit est ignoré.
        assert_eq!(l.noisy_mask(1).unwrap(), &[0, 0x01, 0, 0, 0]);
    }

    #[test]
    fn detects_stable_rising_bit_after_stable_delay() {
        let mut l = learner_after_baseline(&[rep(1, 0x10, 0x80, 0, 0), rep(1, 0x13, 0x80, 0, 0)], Some(true));
        assert_eq!(l.feed(&rep(1, 0x12, 0x80, 0, 0x08), 1000), None);
        assert_eq!(l.poll(1000 + STABLE_MS - 1), None);
        let bit = l.poll(1000 + STABLE_MS).expect("bit confirmé");
        assert_eq!(bit, LearnedBit { report_id: 1, byte: 4, mask: 0x08, pressed_set: true });
    }

    #[test]
    fn noisy_bits_never_detected() {
        let mut l = learner_after_baseline(&[rep(1, 0, 0, 0, 0), rep(1, 0, 0, 0x01, 0)], Some(true));
        assert_eq!(l.feed(&rep(1, 0, 0, 0x01, 0), 1000), None);
        assert_eq!(l.poll(2000), None);
    }

    #[test]
    fn short_glitch_is_marked_noisy() {
        let mut l = learner_after_baseline(&[rep(1, 0, 0, 0, 0)], Some(true));
        assert_eq!(l.feed(&rep(1, 0, 0, 0x04, 0), 1000), None);
        assert_eq!(l.feed(&rep(1, 0, 0, 0, 0), 1010), None);
        assert_eq!(l.feed(&rep(1, 0, 0, 0x04, 0), 1020), None);
        assert_eq!(l.poll(2000), None, "bit qui a clignoté → ignoré");
    }

    #[test]
    fn button_held_at_start_is_ignored_until_released() {
        let mut l = learner_after_baseline(&[rep(1, 0, 0, 0x02, 0)], Some(true));
        assert_eq!(l.feed(&rep(1, 0, 0, 0, 0), 1000), None); // relâché
        assert_eq!(l.poll(2000), None);
        assert_eq!(l.feed(&rep(1, 0, 0, 0x02, 0), 3000), None); // nouvel appui
        assert_eq!(l.poll(3000 + STABLE_MS).map(|b| (b.byte, b.mask)), Some((3, 0x02)));
    }

    #[test]
    fn multi_bit_jump_marks_byte_noisy() {
        let mut l = learner_after_baseline(&[rep(1, 0, 0, 0, 0)], Some(true));
        // Axe qui bouge pendant la capture : saut 0x00 → 0x03 → octet d'axe.
        assert_eq!(l.feed(&rep(1, 0x03, 0, 0, 0), 1000), None);
        assert_eq!(l.feed(&rep(1, 0x07, 0, 0, 0), 1010), None);
        assert_eq!(l.poll(2000), None);
    }

    #[test]
    fn carry_from_axis_byte_is_not_a_button() {
        // Octet 1 = axe (bruyant), octet 2 = poids fort de l'axe.
        let mut l = learner_after_baseline(&[rep(1, 0xFE, 0x00, 0, 0), rep(1, 0x01, 0x00, 0, 0)], Some(true));
        assert_eq!(l.noisy_mask(1).unwrap()[1], 0xFF);
        // 0x00FF → 0x0100 : bit 7 de l'octet 1 bascule en même temps que l'octet 2.
        assert_eq!(l.feed(&rep(1, 0xFF, 0x00, 0, 0), 1000), None);
        assert_eq!(l.feed(&rep(1, 0x00, 0x01, 0, 0), 1010), None);
        assert_eq!(l.poll(2000), None);
    }

    #[test]
    fn report_ids_are_tracked_separately() {
        let mut l = learner_after_baseline(&[vec![1, 0xAA, 0], vec![2, 0x00, 0x00]], Some(true));
        // Le rapport 2 ne doit pas être comparé à la base du rapport 1.
        assert_eq!(l.feed(&[2, 0x00, 0x10], 1000), None);
        let bit = l.poll(1000 + STABLE_MS).unwrap();
        assert_eq!((bit.report_id, bit.byte, bit.mask), (2, 2, 0x10));
    }

    #[test]
    fn unnumbered_device_guessed_from_zero_first_byte() {
        // Descripteur illisible, 1er octet nul → non numéroté → octet 0 utilisable.
        let mut l = learner_after_baseline(&[vec![0x00, 0x00, 0x7F]], None);
        assert_eq!(l.feed(&[0x01, 0x00, 0x7F], 1000), None);
        let bit = l.poll(1000 + STABLE_MS).unwrap();
        assert_eq!(bit, LearnedBit { report_id: 0, byte: 0, mask: 0x01, pressed_set: true });
    }

    #[test]
    fn unseen_report_becomes_its_own_baseline() {
        let mut l = learner_after_baseline(&[], Some(true));
        // 1er rapport après la base (bouton déjà appuyé) : pas de détection…
        assert_eq!(l.feed(&[3, 0x01], 1000), None);
        assert_eq!(l.poll(2000), None);
        // …relâché puis ré-appuyé : détecté.
        assert_eq!(l.feed(&[3, 0x00], 2100), None);
        assert_eq!(l.feed(&[3, 0x01], 2200), None);
        assert_eq!(l.poll(2200 + STABLE_MS).map(|b| (b.report_id, b.byte)), Some((3, 1)));
    }

    #[test]
    fn report_pressed_checks_id_byte_and_polarity() {
        assert_eq!(report_pressed(&[1, 0, 0x08], 1, 2, 0x08, true), Some(true));
        assert_eq!(report_pressed(&[1, 0, 0x00], 1, 2, 0x08, true), Some(false));
        assert_eq!(report_pressed(&[2, 0, 0x08], 1, 2, 0x08, true), None);
        assert_eq!(report_pressed(&[1, 0], 1, 2, 0x08, true), None);
        assert_eq!(report_pressed(&[1, 0, 0x00], 1, 2, 0x08, false), Some(true));
        // report_id 0 = non numéroté : pas de filtre sur le 1er octet.
        assert_eq!(report_pressed(&[0x08], 0, 0, 0x08, true), Some(true));
    }

    #[test]
    fn descriptor_report_id_detection() {
        // Usage Page (Generic Desktop), Usage (Joystick), Collection, Report ID 1, End.
        assert!(descriptor_has_report_ids(&[0x05, 0x01, 0x09, 0x04, 0xA1, 0x01, 0x85, 0x01, 0xC0]));
        assert!(!descriptor_has_report_ids(&[0x05, 0x01, 0x09, 0x04, 0xA1, 0x01, 0x75, 0x08, 0xC0]));
        // 0x85 en tant que donnée d'un item (Logical Max 0x85) ne compte pas.
        assert!(!descriptor_has_report_ids(&[0x25, 0x85, 0xC0]));
    }

    #[test]
    fn debouncer_filters_bounces_and_emits_edges() {
        let mut d = Debouncer::new(DEBOUNCE_MS);
        assert_eq!(d.update(true, 0), None);
        assert_eq!(d.update(false, 5), None); // rebond
        assert_eq!(d.update(true, 10), None);
        assert_eq!(d.update(true, 29), None);
        assert_eq!(d.update(true, 30), Some(true));
        assert_eq!(d.update(true, 100), None);
        assert_eq!(d.update(false, 200), None);
        assert_eq!(d.update(false, 220), Some(false));
        assert!(!d.is_pressed());
    }

    /// Essai manuel avec un volant branché :
    /// `cargo test --lib live_capture -- --ignored --nocapture` puis appuyer sur un bouton.
    #[test]
    #[ignore]
    fn live_capture() {
        let joys: Vec<_> = (0..winmm::count()).filter(|&j| winmm::buttons(j).is_some()).collect();
        println!("winmm : {joys:?}");
        let hid = open_hid_capture();
        for d in &hid {
            println!("HID : {} ({:04X}:{:04X})", hid_product(&d.info), d.info.vendor_id(), d.info.product_id());
        }
        drop(hid);
        println!("capture : {:?}", capture_blocking(10_000));
    }

    #[test]
    fn binding_json_shape() {
        let w = WheelBinding::Winmm { joy: 0, button: 7, label: "Fanatec CSL DD — bouton 7".into() };
        assert_eq!(
            serde_json::to_value(&w).unwrap(),
            serde_json::json!({ "kind": "winmm", "joy": 0, "button": 7, "label": "Fanatec CSL DD — bouton 7" })
        );
        let h = WheelBinding::Hid {
            path: "\\\\?\\hid#vid_3670".into(),
            vid: 0x3670,
            pid: 0x0905,
            product: "Simagic".into(),
            report_id: 1,
            byte: 12,
            mask: 4,
            pressed_set: true,
            label: "Simagic — bouton (octet 12, bit 2)".into(),
        };
        let v = serde_json::to_value(&h).unwrap();
        assert_eq!(v["kind"], "hid");
        assert_eq!(v["reportId"], 1);
        assert_eq!(v["pressedSet"], true);
        let back: WheelBinding = serde_json::from_value(v).unwrap();
        assert_eq!(back, h);
    }
}
