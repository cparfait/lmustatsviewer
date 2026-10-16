//! Moteur d'écoute de l'ingénieur : micro **prêt en permanence**, capturé en natif
//! (WASAPI via `cpal`), indépendant de la fenêtre (app réduite pendant la course).
//!
//! Trois usages, un seul flux micro :
//!  - **Push-to-talk** (touche ou bouton de volant) : la capture commence par les
//!    0,5 s qui précèdent l'appui (pré-enregistrement) → le premier mot n'est
//!    jamais coupé. En mode bascule, l'envoi part seul après 1,5 s de silence.
//!  - **Mot déclencheur** (option bêta) : une reconnaissance Vosk **restreinte au
//!    seul mot** (grammaire `[mot, "[unk]"]`) écoute en continu ; rien d'autre n'est
//!    transcrit. Mot entendu (2 lectures partielles consécutives) → événement
//!    `wake-word`, puis la phrase est captée jusqu'au silence et dictée en entier ;
//!    « Ingénieur » seul → on attend la question (6 s max).
//!  - **Silence pendant que l'ingénieur parle** (`voice_input_set_muted`) : le mot
//!    n'est pas cherché dans sa propre voix.
//!
//! Rien n'est enregistré ni envoyé : hors appui et hors mot déclencheur, l'audio ne
//! fait que traverser un tampon circulaire de 1,5 s en mémoire.

use crate::commands::stt::{get_model, recognize_free_samples, recognize_grammar_samples};
use crate::error::{AppError, AppResult};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::JoinHandle;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use vosk::Recognizer;

/// Fréquence de travail (Vosk).
pub(crate) const SR: usize = 16_000;
/// Tampon circulaire (s) : couvre le mot déclencheur entier quand il est reconnu.
const RING_S: f32 = 1.5;
/// Pré-enregistrement d'un push-to-talk (s).
const PREROLL_S: f32 = 0.5;
/// Capture maximale (s) : filet si la touche reste enfoncée ou si le bruit ne cesse pas.
const MAX_CAPTURE_S: f32 = 20.0;
/// Bascule : silence (s) après la parole qui déclenche l'envoi.
const AUTO_SEND_SILENCE_S: f32 = 1.5;
/// Bascule : aucun mot pendant ce délai (s) → envoi (rien) pour fermer le micro.
const AUTO_SEND_IDLE_S: f32 = 8.0;
/// Mot déclencheur : silence (s) qui termine la phrase.
const WAKE_END_SILENCE_S: f32 = 1.0;
/// Mot déclencheur : durée maximale de la phrase (s).
const WAKE_MAX_S: f32 = 8.0;
/// « Ingénieur » seul : délai (s) pour commencer la question.
const WAKE_AWAIT_S: f32 = 6.0;
/// Lectures partielles consécutives contenant le mot avant de déclencher.
const WAKE_CONFIRM: u32 = 2;

// ── Briques pures (testées) ──────────────────────────────────────────────────

/// Rééchantillonneur mono vers 16 kHz : moyenne des échantillons d'entrée entre
/// deux points de sortie (filtre « boîte », suffisant pour la voix).
pub(crate) struct Resampler {
    ratio: f64,
    pos: f64,
    buf: Vec<f32>,
}

impl Resampler {
    pub(crate) fn new(in_rate: u32) -> Self {
        Self { ratio: in_rate.max(1) as f64 / SR as f64, pos: 0.0, buf: Vec::new() }
    }

    pub(crate) fn process(&mut self, input: &[f32], out: &mut Vec<i16>) {
        self.buf.extend_from_slice(input);
        while self.pos + self.ratio <= self.buf.len() as f64 {
            let a = self.pos.floor() as usize;
            let b = ((self.pos + self.ratio).floor() as usize).max(a + 1).min(self.buf.len());
            let m = self.buf[a..b].iter().sum::<f32>() / (b - a) as f32;
            out.push((m.clamp(-1.0, 1.0) * 32767.0) as i16);
            self.pos += self.ratio;
        }
        let used = (self.pos.floor() as usize).min(self.buf.len());
        self.buf.drain(..used);
        self.pos -= used as f64;
    }
}

/// Détecteur de parole par énergie, avec plancher de bruit adaptatif.
pub(crate) struct Vad {
    floor: f32,
    frame: Vec<i16>,
    total: usize,
    last_speech: Option<usize>,
}

/// Trame d'analyse : 20 ms.
const VAD_FRAME: usize = SR / 50;
/// Seuil absolu minimal (RMS en unités i16).
const VAD_MIN_RMS: f32 = 450.0;

impl Vad {
    pub(crate) fn new() -> Self {
        Self { floor: 300.0, frame: Vec::with_capacity(VAD_FRAME), total: 0, last_speech: None }
    }

    pub(crate) fn feed(&mut self, samples: &[i16]) {
        for &s in samples {
            self.frame.push(s);
            self.total += 1;
            if self.frame.len() == VAD_FRAME {
                let e = self.frame.iter().map(|&x| (x as f32) * (x as f32)).sum::<f32>() / VAD_FRAME as f32;
                let rms = e.sqrt();
                if rms > (self.floor * 3.0).max(VAD_MIN_RMS) {
                    self.last_speech = Some(self.total);
                    self.floor = 0.999 * self.floor + 0.001 * rms;
                } else if rms < self.floor {
                    self.floor = 0.9 * self.floor + 0.1 * rms;
                } else {
                    self.floor = 0.995 * self.floor + 0.005 * rms;
                }
                self.floor = self.floor.max(50.0);
                self.frame.clear();
            }
        }
    }

    pub(crate) fn heard_speech(&self) -> bool {
        self.last_speech.is_some()
    }

    /// Silence depuis la dernière parole (s) ; `None` si aucune parole vue.
    pub(crate) fn silence_s(&self) -> Option<f32> {
        self.last_speech.map(|at| (self.total - at) as f32 / SR as f32)
    }
}

/// Minuscules, sans accents ni ponctuation (comparaison du mot déclencheur).
pub(crate) fn norm_words(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.to_lowercase().chars() {
        let c = match c {
            'à' | 'â' | 'ä' | 'á' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'î' | 'ï' | 'í' => 'i',
            'ô' | 'ö' | 'ó' => 'o',
            'ù' | 'û' | 'ü' | 'ú' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
            'ß' => 's',
            c if c.is_alphanumeric() => c,
            _ => ' ',
        };
        out.push(c);
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Le texte contient-il le mot (ou la locution) déclencheur ?
pub(crate) fn has_wake(text: &str, word: &str) -> bool {
    let (t, w) = (norm_words(text), norm_words(word));
    !w.is_empty() && format!(" {t} ").contains(&format!(" {w} "))
}

/// Ce qui suit le mot déclencheur dans une dictée (« ingénieur juste l'essentiel »
/// → « juste l'essentiel »). Sans mot reconnu, la dictée entière.
pub(crate) fn after_wake(text: &str, word: &str) -> String {
    let w = norm_words(word);
    let words: Vec<&str> = text.split_whitespace().collect();
    let n = w.split(' ').count();
    for i in 0..words.len() {
        if i + n <= words.len() && norm_words(&words[i..i + n].join(" ")) == w {
            return words[i + n..].join(" ");
        }
    }
    text.trim().to_string()
}

// ── Moteur ───────────────────────────────────────────────────────────────────

/// Capture push-to-talk en cours.
struct PttCapture {
    buf: Vec<i16>,
    auto_send: bool,
    vad: Vad,
    sent: bool,
    started_at: usize,
}

/// État partagé entre le fil audio et les commandes.
struct Control {
    ring: VecDeque<i16>,
    muted: bool,
    ptt: Option<PttCapture>,
    /// Échantillons vus depuis le démarrage (horloge du moteur).
    clock: usize,
}

struct Engine {
    stop: Arc<AtomicBool>,
    ctl: Arc<Mutex<Control>>,
    key: String,
    join: Option<JoinHandle<()>>,
}

impl Drop for Engine {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(j) = self.join.take() {
            let _ = j.join();
        }
    }
}

fn engine() -> &'static Mutex<Option<Engine>> {
    static E: OnceLock<Mutex<Option<Engine>>> = OnceLock::new();
    E.get_or_init(|| Mutex::new(None))
}

#[derive(Clone, Serialize)]
struct UtterancePayload {
    text: String,
}

#[derive(Clone, Serialize)]
struct ErrorPayload {
    message: String,
}

/// Ouvre le micro par défaut et pousse des blocs mono f32 dans `tx`.
fn open_stream(tx: mpsc::Sender<Vec<f32>>) -> Result<(cpal::Stream, u32), String> {
    let host = cpal::default_host();
    let device = host.default_input_device().ok_or("aucun micro")?;
    let cfg = device.default_input_config().map_err(|e| e.to_string())?;
    let channels = cfg.channels().max(1) as usize;
    let rate = cfg.sample_rate().0;
    let format = cfg.sample_format();
    let sc: cpal::StreamConfig = cfg.into();
    let err = |e: cpal::StreamError| eprintln!("[voice_input] flux micro : {e}");
    fn mono<T: Copy>(data: &[T], ch: usize, f: impl Fn(T) -> f32) -> Vec<f32> {
        data.chunks(ch).map(|c| c.iter().map(|&x| f(x)).sum::<f32>() / c.len() as f32).collect()
    }
    let stream = match format {
        cpal::SampleFormat::F32 => device.build_input_stream(
            &sc,
            move |d: &[f32], _: &cpal::InputCallbackInfo| {
                let _ = tx.send(mono(d, channels, |x| x));
            },
            err,
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            &sc,
            move |d: &[i16], _: &cpal::InputCallbackInfo| {
                let _ = tx.send(mono(d, channels, |x| x as f32 / 32768.0));
            },
            err,
            None,
        ),
        cpal::SampleFormat::U16 => device.build_input_stream(
            &sc,
            move |d: &[u16], _: &cpal::InputCallbackInfo| {
                let _ = tx.send(mono(d, channels, |x| (x as f32 - 32768.0) / 32768.0));
            },
            err,
            None,
        ),
        f => return Err(format!("format micro non géré : {f:?}")),
    }
    .map_err(|e| e.to_string())?;
    stream.play().map_err(|e| e.to_string())?;
    Ok((stream, rate))
}

/// État du mot déclencheur (dans le fil audio).
enum Wake {
    Idle { hits: u32 },
    /// Mot entendu : la phrase continue jusqu'au silence.
    Armed { buf: Vec<i16>, vad: Vad },
    /// « Ingénieur » seul : on attend la question.
    Awaiting { since: usize, buf: Vec<i16>, vad: Vad },
}

#[allow(clippy::too_many_arguments)]
fn run(
    app: AppHandle,
    lang: String,
    wake_word: Option<String>,
    stop: Arc<AtomicBool>,
    ctl: Arc<Mutex<Control>>,
    ready: mpsc::Sender<Result<(), String>>,
) {
    let (tx, rx) = mpsc::channel::<Vec<f32>>();
    let (_stream, rate) = match open_stream(tx) {
        Ok(v) => {
            let _ = ready.send(Ok(()));
            v
        }
        Err(e) => {
            let _ = ready.send(Err(e));
            return;
        }
    };
    let mut rs = Resampler::new(rate);
    let ring_cap = (RING_S * SR as f32) as usize;
    let preroll = (PREROLL_S * SR as f32) as usize;
    let max_cap = (MAX_CAPTURE_S * SR as f32) as usize;

    // Reconnaissance restreinte au mot (rien d'autre n'est transcrit).
    let word = wake_word.map(|w| w.trim().to_lowercase()).filter(|w| !w.is_empty());
    let mut rec = match &word {
        Some(w) => match get_model(&app, &lang) {
            Ok(model) => Recognizer::new_with_grammar(model, SR as f32, &[w.as_str(), "[unk]"]),
            Err(e) => {
                let _ = app.emit("voice-input-error", ErrorPayload { message: e.to_string() });
                None
            }
        },
        None => None,
    };
    let mut wake = Wake::Idle { hits: 0 };
    let mut was_muted = false;
    let mut chunk: Vec<i16> = Vec::with_capacity(4096);

    while !stop.load(Ordering::SeqCst) {
        let Ok(block) = rx.recv_timeout(Duration::from_millis(200)) else {
            continue;
        };
        chunk.clear();
        rs.process(&block, &mut chunk);
        if chunk.is_empty() {
            continue;
        }

        // Tampon circulaire + capture push-to-talk.
        let (muted, now, ptt_event) = {
            let mut c = ctl.lock().unwrap();
            c.clock += chunk.len();
            c.ring.extend(chunk.iter().copied());
            while c.ring.len() > ring_cap {
                c.ring.pop_front();
            }
            let clock = c.clock;
            let mut ev = false;
            if let Some(p) = c.ptt.as_mut() {
                if p.buf.len() < max_cap {
                    p.buf.extend_from_slice(&chunk);
                }
                p.vad.feed(&chunk);
                if p.auto_send && !p.sent {
                    let idle = (clock - p.started_at) as f32 / SR as f32;
                    let done = match p.vad.silence_s() {
                        Some(s) => s >= AUTO_SEND_SILENCE_S,
                        None => idle >= AUTO_SEND_IDLE_S,
                    };
                    if done || p.buf.len() >= max_cap {
                        p.sent = true;
                        ev = true;
                    }
                }
            }
            (c.muted, clock, ev)
        };
        if ptt_event {
            let _ = app.emit("ptt-silence", ());
        }

        // Mot déclencheur.
        let Some(r) = rec.as_mut() else { continue };
        if muted {
            if !was_muted {
                r.reset();
                wake = Wake::Idle { hits: 0 };
            }
            was_muted = true;
            continue;
        }
        was_muted = false;
        let w = word.as_deref().unwrap_or("");
        // Copie du tampon circulaire, seulement quand on en a besoin.
        let ring_now = || ctl.lock().unwrap().ring.iter().copied().collect::<Vec<i16>>();
        wake = match std::mem::replace(&mut wake, Wake::Idle { hits: 0 }) {
            Wake::Idle { hits } => {
                let _ = r.accept_waveform(&chunk);
                let heard = has_wake(r.partial_result().partial, w);
                let hits = if heard { hits + 1 } else { 0 };
                if hits >= WAKE_CONFIRM {
                    let _ = app.emit("wake-word", ());
                    r.reset();
                    let buf = ring_now();
                    let mut vad = Vad::new();
                    vad.feed(&buf);
                    Wake::Armed { buf, vad }
                } else {
                    Wake::Idle { hits }
                }
            }
            Wake::Armed { mut buf, mut vad } => {
                buf.extend_from_slice(&chunk);
                vad.feed(&chunk);
                let long = buf.len() as f32 / SR as f32 >= WAKE_MAX_S + RING_S;
                if vad.silence_s().is_some_and(|s| s >= WAKE_END_SILENCE_S) || long {
                    let text = recognize_free_samples(&app, &lang, &buf).unwrap_or_default();
                    let rest = after_wake(&text, w);
                    if rest.is_empty() {
                        Wake::Awaiting { since: now, buf: Vec::new(), vad: Vad::new() }
                    } else {
                        let _ = app.emit("wake-utterance", UtterancePayload { text: rest });
                        Wake::Idle { hits: 0 }
                    }
                } else {
                    Wake::Armed { buf, vad }
                }
            }
            Wake::Awaiting { since, mut buf, mut vad } => {
                vad.feed(&chunk);
                if vad.heard_speech() {
                    if buf.is_empty() {
                        let ring = ring_now();
                        buf.extend_from_slice(&ring[ring.len().saturating_sub(preroll)..]);
                    } else {
                        buf.extend_from_slice(&chunk);
                    }
                    let long = buf.len() as f32 / SR as f32 >= WAKE_MAX_S;
                    if vad.silence_s().is_some_and(|s| s >= WAKE_END_SILENCE_S) || long {
                        let text = recognize_free_samples(&app, &lang, &buf).unwrap_or_default();
                        let _ = app.emit("wake-utterance", UtterancePayload { text });
                        Wake::Idle { hits: 0 }
                    } else {
                        Wake::Awaiting { since, buf, vad }
                    }
                } else if (now - since) as f32 / SR as f32 >= WAKE_AWAIT_S {
                    let _ = app.emit("wake-timeout", ());
                    Wake::Idle { hits: 0 }
                } else {
                    Wake::Awaiting { since, buf, vad }
                }
            }
        };
    }
}

/// Démarre (ou reconfigure) le moteur. `wake_word` = `None` : push-to-talk seul.
#[tauri::command(async)]
pub fn voice_input_start(app: AppHandle, lang: String, wake_word: Option<String>) -> AppResult<()> {
    let key = format!("{}|{}", lang, wake_word.clone().unwrap_or_default());
    let mut slot = engine().lock().unwrap();
    if slot.as_ref().is_some_and(|e| e.key == key) {
        return Ok(());
    }
    *slot = None; // arrête l'ancien (Drop)
    let stop = Arc::new(AtomicBool::new(false));
    let ctl = Arc::new(Mutex::new(Control { ring: VecDeque::new(), muted: false, ptt: None, clock: 0 }));
    let (ready_tx, ready_rx) = mpsc::channel();
    let (s2, c2) = (stop.clone(), ctl.clone());
    let join = std::thread::Builder::new()
        .name("voice-input".into())
        .spawn(move || run(app, lang, wake_word, s2, c2, ready_tx))
        .map_err(|e| AppError::Internal(e.to_string()))?;
    match ready_rx.recv_timeout(Duration::from_secs(5)) {
        Ok(Ok(())) => {
            *slot = Some(Engine { stop, ctl, key, join: Some(join) });
            Ok(())
        }
        Ok(Err(e)) => Err(AppError::Internal(format!("micro indisponible : {e}"))),
        Err(_) => {
            stop.store(true, Ordering::SeqCst);
            Err(AppError::Internal("micro : délai d'ouverture dépassé".into()))
        }
    }
}

/// Arrête le moteur (micro fermé).
#[tauri::command]
pub fn voice_input_stop() {
    *engine().lock().unwrap() = None;
}

/// Le moteur tourne-t-il ?
#[tauri::command]
pub fn voice_input_running() -> bool {
    engine().lock().unwrap().is_some()
}

/// L'ingénieur parle : le mot déclencheur n'est pas cherché dans sa voix.
#[tauri::command]
pub fn voice_input_set_muted(muted: bool) {
    if let Some(e) = engine().lock().unwrap().as_ref() {
        e.ctl.lock().unwrap().muted = muted;
    }
}

/// Début de push-to-talk : capture amorcée avec les 0,5 s qui précèdent l'appui.
/// `auto_send` (mode bascule) : événement `ptt-silence` quand la phrase est finie.
/// Renvoie `false` si le moteur ne tourne pas (l'appelant capte alors lui-même).
#[tauri::command]
pub fn ptt_begin(auto_send: bool) -> bool {
    let slot = engine().lock().unwrap();
    let Some(e) = slot.as_ref() else { return false };
    let mut c = e.ctl.lock().unwrap();
    let n = c.ring.len();
    let pre = (PREROLL_S * SR as f32) as usize;
    let buf: Vec<i16> = c.ring.iter().skip(n.saturating_sub(pre)).copied().collect();
    let started_at = c.clock;
    c.ptt = Some(PttCapture { buf, auto_send, vad: Vad::new(), sent: false, started_at });
    true
}

/// Fin de push-to-talk : dictée de la capture. `None` si aucune capture en cours.
#[tauri::command(async)]
pub fn ptt_end(app: AppHandle, lang: String) -> AppResult<Option<String>> {
    let buf = {
        let slot = engine().lock().unwrap();
        let Some(e) = slot.as_ref() else { return Ok(None) };
        let mut c = e.ctl.lock().unwrap();
        match c.ptt.take() {
            Some(p) => p.buf,
            None => return Ok(None),
        }
    };
    recognize_free_samples(&app, &lang, &buf).map(Some)
}

/// Les deux lectures d'une même prise de parole.
#[derive(serde::Serialize)]
pub struct PttTexts {
    /// Dictée libre (questions, phrases naturelles).
    free: String,
    /// Reconnaissance stricte sur la liste des commandes (plus sûre dans le bruit) ;
    /// vide si aucune grammaire n'est fournie.
    strict: String,
}

/// Fin de push-to-talk, **double lecture** : la même capture passe à la dictée
/// libre et à la grammaire fermée des commandes (`grammar`). L'appelant choisit
/// (libre d'abord, stricte en secours). `None` si aucune capture en cours.
#[tauri::command(async)]
pub fn ptt_end_dual(app: AppHandle, lang: String, grammar: Vec<String>) -> AppResult<Option<PttTexts>> {
    let buf = {
        let slot = engine().lock().unwrap();
        let Some(e) = slot.as_ref() else { return Ok(None) };
        let mut c = e.ctl.lock().unwrap();
        match c.ptt.take() {
            Some(p) => p.buf,
            None => return Ok(None),
        }
    };
    let free = recognize_free_samples(&app, &lang, &buf)?;
    // Une grammaire en échec ne doit pas faire perdre la dictée libre.
    let strict = recognize_grammar_samples(&app, &lang, &buf, &grammar).unwrap_or_default();
    Ok(Some(PttTexts { free, strict }))
}

/// Abandonne la capture push-to-talk en cours (rien n'est dicté).
#[tauri::command]
pub fn ptt_cancel() {
    if let Some(e) = engine().lock().unwrap().as_ref() {
        e.ctl.lock().unwrap().ptt = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resampler_48k_to_16k() {
        let mut r = Resampler::new(48_000);
        let mut out = Vec::new();
        r.process(&vec![0.5; 4800], &mut out);
        assert_eq!(out.len(), 1600);
        assert!(out.iter().all(|&s| (s - 16383).abs() <= 1));
        // Blocs successifs : aucun échantillon perdu.
        let mut r = Resampler::new(44_100);
        let mut n = 0;
        for _ in 0..10 {
            let mut o = Vec::new();
            r.process(&vec![0.0; 441], &mut o);
            n += o.len();
        }
        assert!((1599..=1601).contains(&n), "{n}");
    }

    #[test]
    fn vad_detects_speech_then_silence() {
        let mut v = Vad::new();
        v.feed(&vec![10i16; SR]); // 1 s de bruit faible
        assert!(!v.heard_speech());
        let tone: Vec<i16> = (0..SR / 2).map(|i| if i % 2 == 0 { 6000 } else { -6000 }).collect();
        v.feed(&tone);
        assert!(v.heard_speech());
        v.feed(&vec![10i16; SR]);
        let s = v.silence_s().unwrap();
        assert!((0.95..=1.05).contains(&s), "{s}");
    }

    #[test]
    fn wake_word_matching() {
        assert!(has_wake("[unk] ingénieur", "Ingénieur"));
        assert!(has_wake("ingenieur", "ingénieur"));
        assert!(!has_wake("ingénieurs", "ingénieur"));
        assert!(!has_wake("", "ingénieur"));
        assert!(has_wake("radio check", "radio check"));
        assert_eq!(after_wake("ingénieur juste l'essentiel", "ingénieur"), "juste l'essentiel");
        assert_eq!(after_wake("euh ingénieur on se bat", "Ingénieur"), "on se bat");
        assert_eq!(after_wake("ingénieur", "ingénieur"), "");
        assert_eq!(after_wake("on se bat", "ingénieur"), "on se bat");
    }
}
