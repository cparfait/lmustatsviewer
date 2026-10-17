//! Notes vocales du pilote, attachées à un virage d'un couple circuit/voiture.
//!
//! Pourquoi : un rappel dit avec sa propre voix (« freine au panneau 100 »,
//! « reste à l'intérieur ») se retient mieux qu'un texte, et se dit plus vite en
//! roulant qu'il ne se tape. Le pilote parle au push-to-talk habituel ; le
//! frontend demande ensuite de conserver cette prise (`voice_note_save_last`),
//! puis la rejoue à l'approche du virage (lecture WebAudio des octets WAV).
//!
//! Stockage : `<app_data>/voice_notes/<circuit>/<voiture>/corner_<n>.wav`, PCM
//! 16 bits mono 16 kHz (le format de capture du moteur d'écoute). Les noms de
//! dossiers sont des « slugs » ASCII : aucun chemin fourni par l'appelant ne peut
//! sortir du dossier des notes.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::commands::voice_input::{take_last_utterance, SR};
use crate::error::{AppError, AppResult};

const NOTES_DIR: &str = "voice_notes";
/// Durée minimale d'une note après retrait des silences (s).
const MIN_NOTE_S: f32 = 0.3;
/// Trame d'analyse du retrait des silences : 10 ms.
const TRIM_FRAME: usize = SR / 100;
/// Amplitude moyenne (unités i16) au-dessus de laquelle une trame est « parlée ».
const TRIM_THRESHOLD: f32 = 400.0;
/// Marge conservée autour de la parole (s) : ne pas couper attaques et finales.
const TRIM_MARGIN_S: f32 = 0.15;
/// Longueur maximale d'un slug (noms de chemin raisonnables).
const SLUG_MAX: usize = 80;
const WAV_HEADER_LEN: usize = 44;

// ── Briques pures (testées) ──────────────────────────────────────────────────

/// Slug de dossier : minuscules ASCII alphanumériques séparées par `_` (même
/// convention que les tracés de circuits). Vide → erreur.
fn slug(name: &str) -> AppResult<String> {
    let s: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    let s = s.split('_').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("_");
    let s: String = s.chars().take(SLUG_MAX).collect();
    let s = s.trim_end_matches('_').to_string();
    if s.is_empty() {
        return Err(AppError::Config(format!("nom invalide pour une note vocale : {name:?}")));
    }
    Ok(s)
}

/// WAV PCM 16 bits mono (en-tête RIFF de 44 octets + données little-endian).
fn encode_wav(samples: &[i16], sample_rate: u32) -> Vec<u8> {
    let data_len = (samples.len() * 2) as u32;
    let mut out = Vec::with_capacity(WAV_HEADER_LEN + data_len as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes()); // taille du bloc fmt
    out.extend_from_slice(&1u16.to_le_bytes()); // PCM
    out.extend_from_slice(&1u16.to_le_bytes()); // mono
    out.extend_from_slice(&sample_rate.to_le_bytes());
    out.extend_from_slice(&(sample_rate * 2).to_le_bytes()); // octets/s
    out.extend_from_slice(&2u16.to_le_bytes()); // alignement de bloc
    out.extend_from_slice(&16u16.to_le_bytes()); // bits/échantillon
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    for s in samples {
        out.extend_from_slice(&s.to_le_bytes());
    }
    out
}

/// Description d'un WAV PCM lue dans son en-tête.
#[derive(Debug, Clone, Copy, PartialEq)]
struct WavInfo {
    sample_rate: u32,
    channels: u16,
    bits: u16,
    data_len: u32,
}

impl WavInfo {
    fn duration_s(&self) -> f32 {
        let bytes_per_s = self.sample_rate as f32 * self.channels as f32 * (self.bits as f32 / 8.0);
        if bytes_per_s > 0.0 {
            self.data_len as f32 / bytes_per_s
        } else {
            0.0
        }
    }
}

/// Parcourt les blocs RIFF jusqu'à `fmt ` et `data`.
fn parse_wav_header(b: &[u8]) -> Option<WavInfo> {
    if b.len() < 12 || &b[0..4] != b"RIFF" || &b[8..12] != b"WAVE" {
        return None;
    }
    let u16_at = |o: usize| Some(u16::from_le_bytes(b.get(o..o + 2)?.try_into().ok()?));
    let u32_at = |o: usize| Some(u32::from_le_bytes(b.get(o..o + 4)?.try_into().ok()?));
    let mut pos = 12;
    let mut fmt: Option<(u16, u32, u16)> = None;
    while pos + 8 <= b.len() {
        let id = &b[pos..pos + 4];
        let len = u32_at(pos + 4)?;
        let body = pos + 8;
        if id == b"fmt " {
            if u16_at(body)? != 1 {
                return None; // pas du PCM
            }
            fmt = Some((u16_at(body + 2)?, u32_at(body + 4)?, u16_at(body + 14)?));
        } else if id == b"data" {
            let (channels, sample_rate, bits) = fmt?;
            return Some(WavInfo { sample_rate, channels, bits, data_len: len });
        }
        pos = body + len as usize + (len as usize & 1);
    }
    None
}

/// Retire les silences de début et de fin (amplitude moyenne par trame de
/// 10 ms sous le seuil), en gardant une petite marge autour de la parole.
fn trim_silence(samples: &[i16]) -> &[i16] {
    let loud = |c: &[i16]| c.iter().map(|&s| (s as f32).abs()).sum::<f32>() / c.len() as f32 > TRIM_THRESHOLD;
    let frames: Vec<bool> = samples.chunks(TRIM_FRAME).map(loud).collect();
    let (Some(first), Some(last)) = (frames.iter().position(|&l| l), frames.iter().rposition(|&l| l)) else {
        return &samples[..0];
    };
    let margin = (TRIM_MARGIN_S * SR as f32) as usize;
    let start = (first * TRIM_FRAME).saturating_sub(margin);
    let end = ((last + 1) * TRIM_FRAME + margin).min(samples.len());
    &samples[start..end]
}

fn note_file_name(corner: u32) -> String {
    format!("corner_{corner}.wav")
}

/// `corner_<n>.wav` → `n`.
fn parse_note_file_name(name: &str) -> Option<u32> {
    let n = name.strip_prefix("corner_")?.strip_suffix(".wav")?;
    if n.is_empty() || !n.bytes().all(|c| c.is_ascii_digit()) {
        return None;
    }
    n.parse().ok()
}

// ── Accès disque ─────────────────────────────────────────────────────────────

fn notes_root(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Internal(format!("app_data_dir: {e}")))?
        .join(NOTES_DIR))
}

fn notes_dir(app: &AppHandle, track: &str, car: &str) -> AppResult<PathBuf> {
    Ok(notes_root(app)?.join(slug(track)?).join(slug(car)?))
}

/// Une note enregistrée.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct VoiceNoteInfo {
    pub corner: u32,
    pub duration_s: f32,
    /// Dernière modification, en millisecondes depuis l'époque Unix (`new Date(modified)`).
    pub modified: u64,
}

fn list_dir(dir: &Path) -> Vec<VoiceNoteInfo> {
    let Ok(entries) = fs::read_dir(dir) else { return Vec::new() };
    let mut out: Vec<VoiceNoteInfo> = entries
        .flatten()
        .filter_map(|e| {
            let corner = parse_note_file_name(&e.file_name().to_string_lossy())?;
            let meta = e.metadata().ok().filter(|m| m.is_file())?;
            let head = read_head(&e.path())?;
            let info = parse_wav_header(&head)?;
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            Some(VoiceNoteInfo { corner, duration_s: info.duration_s(), modified })
        })
        .collect();
    out.sort_by_key(|n| n.corner);
    out
}

/// Premiers octets d'un fichier (assez pour l'en-tête WAV).
fn read_head(path: &Path) -> Option<Vec<u8>> {
    use std::io::Read;
    let mut buf = Vec::with_capacity(256);
    fs::File::open(path).ok()?.take(256).read_to_end(&mut buf).ok()?;
    Some(buf)
}

/// Écrit la note (fichier temporaire puis renommage : jamais de WAV tronqué).
fn save_note(dir: &Path, corner: u32, samples: &[i16]) -> AppResult<f32> {
    let trimmed = trim_silence(samples);
    let duration = trimmed.len() as f32 / SR as f32;
    if duration < MIN_NOTE_S {
        return Err(AppError::Config(format!(
            "note vocale trop courte ({duration:.2} s, minimum {MIN_NOTE_S} s)"
        )));
    }
    fs::create_dir_all(dir)?;
    let path = dir.join(note_file_name(corner));
    let tmp = dir.join(format!("{}.tmp", note_file_name(corner)));
    fs::write(&tmp, encode_wav(trimmed, SR as u32))?;
    if let Err(e) = fs::rename(&tmp, &path) {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(duration)
}

fn clear_dir(dir: &Path) -> u32 {
    let Ok(entries) = fs::read_dir(dir) else { return 0 };
    let mut n = 0;
    for e in entries.flatten() {
        if parse_note_file_name(&e.file_name().to_string_lossy()).is_some()
            && e.file_type().map(|t| t.is_file()).unwrap_or(false)
            && fs::remove_file(e.path()).is_ok()
        {
            n += 1;
        }
    }
    // Dossiers vides retirés (voiture, puis circuit) ; échoue sans bruit sinon.
    let _ = fs::remove_dir(dir);
    if let Some(parent) = dir.parent() {
        let _ = fs::remove_dir(parent);
    }
    n
}

// ── Commandes ────────────────────────────────────────────────────────────────

/// Conserve la dernière prise de parole push-to-talk comme note du virage
/// `corner`. Renvoie sa durée (s) après retrait des silences.
#[tauri::command]
pub fn voice_note_save_last(app: AppHandle, track: String, car: String, corner: u32) -> AppResult<f32> {
    let dir = notes_dir(&app, &track, &car)?;
    let samples = take_last_utterance()
        .ok_or_else(|| AppError::NotFound("aucune prise de parole récente à enregistrer".into()))?;
    let d = save_note(&dir, corner, &samples)?;
    crate::app_info!("note vocale enregistrée : virage {corner}, {d:.1} s");
    Ok(d)
}

/// Notes du couple circuit/voiture, triées par virage.
#[tauri::command]
pub fn voice_note_list(app: AppHandle, track: String, car: String) -> AppResult<Vec<VoiceNoteInfo>> {
    Ok(list_dir(&notes_dir(&app, &track, &car)?))
}

/// Octets WAV d'une note (pour `decodeAudioData`).
#[tauri::command]
pub fn voice_note_read(app: AppHandle, track: String, car: String, corner: u32) -> AppResult<Vec<u8>> {
    let path = notes_dir(&app, &track, &car)?.join(note_file_name(corner));
    match fs::read(&path) {
        Ok(b) => Ok(b),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Err(AppError::NotFound(format!("note vocale du virage {corner}")))
        }
        Err(e) => Err(e.into()),
    }
}

/// Supprime une note ; `false` si elle n'existait pas.
#[tauri::command]
pub fn voice_note_delete(app: AppHandle, track: String, car: String, corner: u32) -> AppResult<bool> {
    let path = notes_dir(&app, &track, &car)?.join(note_file_name(corner));
    match fs::remove_file(&path) {
        Ok(()) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e.into()),
    }
}

/// Supprime toutes les notes du couple circuit/voiture ; renvoie leur nombre.
#[tauri::command]
pub fn voice_note_clear(app: AppHandle, track: String, car: String) -> AppResult<u32> {
    Ok(clear_dir(&notes_dir(&app, &track, &car)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(n: usize, amp: i16) -> Vec<i16> {
        (0..n).map(|i| if (i / 8) % 2 == 0 { amp } else { -amp }).collect()
    }

    #[test]
    fn wav_header_roundtrip() {
        let samples: Vec<i16> = vec![0, 1, -1, i16::MAX, i16::MIN];
        let w = encode_wav(&samples, 16_000);
        assert_eq!(w.len(), 44 + 10);
        assert_eq!(&w[0..4], b"RIFF");
        assert_eq!(u32::from_le_bytes(w[4..8].try_into().unwrap()), w.len() as u32 - 8);
        assert_eq!(u32::from_le_bytes(w[28..32].try_into().unwrap()), 32_000);
        let info = parse_wav_header(&w).unwrap();
        assert_eq!(info, WavInfo { sample_rate: 16_000, channels: 1, bits: 16, data_len: 10 });
        assert_eq!(i16::from_le_bytes([w[50], w[51]]), i16::MAX);
        let one_s = encode_wav(&vec![0; 16_000], 16_000);
        assert!((parse_wav_header(&one_s).unwrap().duration_s() - 1.0).abs() < 1e-6);
        assert!(parse_wav_header(b"RIFF\0\0\0\0WAVX").is_none());
        assert!(parse_wav_header(&w[..30]).is_none());
    }

    #[test]
    fn slug_rules() {
        assert_eq!(slug("Circuit de la Sarthe").unwrap(), "circuit_de_la_sarthe");
        assert_eq!(slug("  Porsche 963 #6 ").unwrap(), "porsche_963_6");
        assert_eq!(slug("../../etc").unwrap(), "etc");
        assert_eq!(slug("Spa-Francorchamps").unwrap(), "spa_francorchamps");
        assert!(slug("").is_err());
        assert!(slug("—/..").is_err());
        assert!(slug(&"a".repeat(200)).unwrap().len() <= SLUG_MAX);
        assert_eq!(parse_note_file_name("corner_12.wav"), Some(12));
        assert_eq!(parse_note_file_name("corner_.wav"), None);
        assert_eq!(parse_note_file_name("corner_+1.wav"), None);
        assert_eq!(parse_note_file_name("corner_3.wav.tmp"), None);
    }

    #[test]
    fn silence_trimming() {
        let sr = SR;
        let mut s = vec![0i16; sr]; // 1 s de silence
        s.extend(tone(sr / 2, 3000)); // 0,5 s de voix
        s.extend(vec![50i16; sr]); // 1 s de bruit faible
        let t = trim_silence(&s);
        let margin = (TRIM_MARGIN_S * sr as f32) as usize;
        assert_eq!(t.len(), sr / 2 + 2 * margin);
        // Tout silencieux → vide.
        assert!(trim_silence(&vec![100i16; sr]).is_empty());
        assert!(trim_silence(&[]).is_empty());
        // Voix collée aux bords : aucune marge hors du tampon.
        let v = tone(sr / 4, 3000);
        assert_eq!(trim_silence(&v).len(), v.len());
    }

    #[test]
    fn save_list_clear() {
        let root = std::env::temp_dir().join(format!("lmu-voice-notes-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let dir = root.join("track").join("car");
        assert!(save_note(&dir, 3, &tone(SR / 10, 3000)).is_err()); // 0,1 s + marges < 0,3 s
        let d = save_note(&dir, 5, &tone(SR, 3000)).unwrap();
        assert!((d - 1.0).abs() < 1e-3);
        save_note(&dir, 2, &tone(SR / 2, 3000)).unwrap();
        fs::write(dir.join("notes.txt"), b"x").unwrap();
        let l = list_dir(&dir);
        assert_eq!(l.iter().map(|n| n.corner).collect::<Vec<_>>(), vec![2, 5]);
        assert!((l[1].duration_s - 1.0).abs() < 1e-3);
        assert!(l[0].modified > 0);
        assert_eq!(clear_dir(&dir), 2);
        assert!(dir.join("notes.txt").exists());
        assert!(list_dir(&dir).is_empty());
        assert!(list_dir(&root.join("absent")).is_empty());
        let _ = fs::remove_dir_all(&root);
    }
}
