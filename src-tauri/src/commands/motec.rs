//! Parseur MoTeC `.ld` (COACH-LIVE-SPEC.md §2.2, P5.5) — source **secondaire**
//! d'import d'un tour « ghost » (la voie principale étant le `.duckdb` natif de
//! l'app, cf. `src/lib/coach/ghost.ts`). Utile pour ceux qui ont des tours de
//! référence exportés depuis MoTeC i2.
//!
//! Le `.ld` est un format binaire MoTeC little-endian : un en-tête de fichier
//! pointe vers une **liste chaînée** de métadonnées de canaux ; chaque canal
//! porte un pointeur vers ses échantillons (int16/int32 mis à l'échelle, ou
//! float16/float32) et sa fréquence. On extrait ici les **canaux bruts** (nom,
//! unité, fréquence, valeurs physiques) ; le mapping vers le format de réf dense
//! v2 est fait côté TypeScript (partagé avec la voie `.duckdb`).
//!
//! Layout d'après le format documenté (réf. communautaire « ldparser ») :
//!  - en-tête fichier : `u32` @0x08 = pointeur du 1ᵉʳ canal (`meta_ptr`) ;
//!  - en-tête canal (≥ 0x7C octets) :
//!      0x00 prev · 0x04 next · 0x08 data_ptr · 0x0C n_samples
//!      0x12 datatype_a (0x07 = flottant) · 0x14 datatype (2/4 octets)
//!      0x16 freq (Hz) · 0x18 shift · 0x1A mul · 0x1C scale · 0x1E dec_shift
//!      0x20 name[32] · 0x48 unit[12].
//!  - valeur physique (entiers) : `raw / scale · 10^(-dec) + shift`.
//!
//! ⚠️ Parsing binaire **à valider sur un vrai fichier `.ld`** (offsets/mise à
//! l'échelle) : implémenté d'après la spec, non vérifié contre des données réelles.

use crate::error::AppError;
use serde::Serialize;

/// En-tête d'un canal MoTeC (taille minimale avant les données/le canal suivant).
const CHAN_HDR_LEN: usize = 0x7C;
/// Offset du pointeur vers le premier canal, dans l'en-tête de fichier.
const META_PTR_OFF: usize = 0x08;
/// Garde-fou sur le nombre de canaux (anti-boucle sur une liste corrompue).
const MAX_CHANNELS: usize = 2000;

/// Un canal brut extrait d'un `.ld` (valeurs déjà mises à l'échelle physique).
#[derive(Debug, Clone, Serialize)]
pub struct LdChannel {
    pub name: String,
    pub unit: String,
    pub freq: u32,
    pub data: Vec<f32>,
}

fn u16le(b: &[u8], o: usize) -> Option<u16> {
    b.get(o..o + 2).map(|s| u16::from_le_bytes([s[0], s[1]]))
}
fn i16le(b: &[u8], o: usize) -> Option<i16> {
    u16le(b, o).map(|v| v as i16)
}
fn i32le(b: &[u8], o: usize) -> Option<i32> {
    b.get(o..o + 4)
        .map(|s| i32::from_le_bytes([s[0], s[1], s[2], s[3]]))
}
fn u32le(b: &[u8], o: usize) -> Option<u32> {
    b.get(o..o + 4)
        .map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
}
fn f32le(b: &[u8], o: usize) -> Option<f32> {
    b.get(o..o + 4)
        .map(|s| f32::from_le_bytes([s[0], s[1], s[2], s[3]]))
}

/// Décode un IEEE-754 half (float16) little-endian en `f64`.
fn half_to_f64(bits: u16) -> f64 {
    let sign = (bits >> 15) & 1;
    let exp = (bits >> 10) & 0x1f;
    let frac = (bits & 0x3ff) as f64;
    let s = if sign == 1 { -1.0 } else { 1.0 };
    let val = if exp == 0 {
        frac / 1024.0 * 2f64.powi(-14)
    } else if exp == 0x1f {
        // Inf/NaN → 0 (les canaux télémétrie n'en contiennent pas normalement).
        0.0
    } else {
        (1.0 + frac / 1024.0) * 2f64.powi(exp as i32 - 15)
    };
    s * val
}

/// Chaîne C bornée (tronquée au premier octet nul), désencombrée des espaces.
fn cstr(b: &[u8], o: usize, len: usize) -> String {
    let s = b.get(o..o + len).unwrap_or(&[]);
    let end = s.iter().position(|&c| c == 0).unwrap_or(s.len());
    String::from_utf8_lossy(&s[..end]).trim().to_string()
}

/// Parse les canaux d'un fichier `.ld` en mémoire. Erreur si l'en-tête est
/// illisible ou si aucun canal exploitable n'est trouvé.
pub fn parse_ld(bytes: &[u8]) -> Result<Vec<LdChannel>, String> {
    if bytes.len() < CHAN_HDR_LEN {
        return Err("fichier .ld trop court".into());
    }
    let mut meta_ptr = u32le(bytes, META_PTR_OFF).ok_or("en-tête .ld illisible")? as usize;
    let mut out: Vec<LdChannel> = Vec::new();

    let mut guard = 0;
    while meta_ptr != 0 && meta_ptr + CHAN_HDR_LEN <= bytes.len() && guard < MAX_CHANNELS {
        guard += 1;
        let next = u32le(bytes, meta_ptr + 0x04).unwrap_or(0) as usize;
        let data_ptr = u32le(bytes, meta_ptr + 0x08).unwrap_or(0) as usize;
        let n = u32le(bytes, meta_ptr + 0x0C).unwrap_or(0) as usize;
        let dtype_a = u16le(bytes, meta_ptr + 0x12).unwrap_or(0);
        let dtype = u16le(bytes, meta_ptr + 0x14).unwrap_or(0) as usize;
        let freq = u16le(bytes, meta_ptr + 0x16).unwrap_or(0) as u32;
        let shift = i16le(bytes, meta_ptr + 0x18).unwrap_or(0) as f64;
        let scale = i16le(bytes, meta_ptr + 0x1C).unwrap_or(1) as f64;
        let dec = i16le(bytes, meta_ptr + 0x1E).unwrap_or(0) as i32;
        let name = cstr(bytes, meta_ptr + 0x20, 32);
        let unit = cstr(bytes, meta_ptr + 0x48, 12);

        // Décodage des échantillons (int16/int32 mis à l'échelle, ou float16/32).
        let is_float = dtype_a == 0x07;
        let elem = dtype; // taille d'un échantillon (2 ou 4 octets)
        if (elem == 2 || elem == 4) && n > 0 && n < 10_000_000 {
            let scl = if scale == 0.0 { 1.0 } else { scale };
            let pow = 10f64.powi(-dec);
            let mut data = Vec::with_capacity(n);
            for i in 0..n {
                let off = data_ptr + i * elem;
                if off + elem > bytes.len() {
                    break;
                }
                let raw: f64 = if is_float {
                    if elem == 4 {
                        f32le(bytes, off).unwrap_or(0.0) as f64
                    } else {
                        half_to_f64(u16le(bytes, off).unwrap_or(0))
                    }
                } else if elem == 2 {
                    i16le(bytes, off).unwrap_or(0) as f64
                } else {
                    i32le(bytes, off).unwrap_or(0) as f64
                };
                let v = if is_float { raw } else { raw / scl * pow + shift };
                data.push(v as f32);
            }
            if !data.is_empty() && !name.is_empty() {
                out.push(LdChannel { name, unit, freq, data });
            }
        }

        if next <= meta_ptr {
            break; // pointeur non progressif → liste corrompue, on arrête
        }
        meta_ptr = next;
    }

    if out.is_empty() {
        return Err("aucun canal exploitable dans le .ld".into());
    }
    Ok(out)
}

/// Lit et parse un fichier `.ld` (chemin absolu) en canaux bruts (P5.5).
#[tauri::command]
pub fn coach_parse_ld(path: String) -> Result<Vec<LdChannel>, AppError> {
    let bytes = std::fs::read(&path)?;
    parse_ld(&bytes).map_err(AppError::Parse)
}
