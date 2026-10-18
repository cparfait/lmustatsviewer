//! Accès à la mémoire partagée du jeu — vues gardées ouvertes, copies partielles,
//! enregistrement et rejeu de captures brutes.
//!
//! Avant ce module, `live.rs` ouvrait, mappait, copiait **en entier** puis
//! refermait chaque zone à chaque trame (20 fois par seconde) : les 3 zones du
//! plugin plus `LMU_Data` (324 Ko), soit plusieurs centaines de Ko copiés par
//! trame alors que l'essentiel est vide (128 emplacements de voitures pour une
//! vingtaine en piste). Ici :
//!
//! - **Vues gardées ouvertes** : chaque zone est ouverte une fois et réutilisée.
//!   Elles sont toutes refermées toutes les `REFRESH` (1 s) puis rouvertes à la
//!   demande : tenir une poignée garderait la zone en vie après la fermeture du
//!   jeu, et l'app afficherait une session figée au lieu de « jeu non lancé ».
//! - **Copies partielles** : en-tête + voitures réellement présentes (compteur lu
//!   dans la zone), ou une plage précise pour `LMU_Data`.
//! - **Lecture déchirée** : le plugin encadre chaque écriture de deux compteurs
//!   (début / fin). S'ils diffèrent après la copie, on recopie **une** fois au lieu
//!   de perdre la trame.
//! - **Capture et rejeu** : chaque lecture peut être enregistrée (fichier compressé
//!   `.lmurec`, trame par trame) puis rejouée à la place du jeu — pour tester le
//!   spotter, les drapeaux ou l'ordre figé sans lancer LMU.

use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use flate2::read::DeflateDecoder;
use flate2::write::DeflateEncoder;
use flate2::Compression;

/// Durée de vie des vues ouvertes avant fermeture / réouverture.
const REFRESH: Duration = Duration::from_secs(1);
/// En-tête d'un fichier de capture (non compressé), suivi du flux compressé.
const MAGIC: &[u8; 8] = b"LMUREC1\n";
/// Plafond d'une capture : au-delà, l'enregistrement s'arrête tout seul.
pub const RECORD_MAX: Duration = Duration::from_secs(10 * 60);
/// Plafond d'une trame lue dans un fichier (garde-fou contre un fichier corrompu).
const MAX_FRAME_BYTES: usize = 8 * 1024 * 1024;

// ═══════════════════════════════════════════════════════════════════════════
// Vue d'une zone de mémoire partagée (Windows)
// ═══════════════════════════════════════════════════════════════════════════

#[cfg(target_os = "windows")]
mod view {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::System::Memory::{
        MapViewOfFile, OpenFileMappingW, UnmapViewOfFile, VirtualQuery, FILE_MAP_READ,
        MEMORY_BASIC_INFORMATION, MEMORY_MAPPED_VIEW_ADDRESS,
    };

    /// Zone ouverte en lecture : poignée + vue + taille réelle de la région.
    pub struct View {
        handle: HANDLE,
        addr: MEMORY_MAPPED_VIEW_ADDRESS,
        pub len: usize,
    }

    // La vue n'est lue que par le thread qui possède le lecteur (sous mutex).
    unsafe impl Send for View {}

    impl View {
        pub fn open(name: &str) -> Option<View> {
            let wide: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
            unsafe {
                let handle = OpenFileMappingW(FILE_MAP_READ.0, false, PCWSTR(wide.as_ptr())).ok()?;
                let addr = MapViewOfFile(handle, FILE_MAP_READ, 0, 0, 0);
                if addr.Value.is_null() {
                    let _ = CloseHandle(handle);
                    return None;
                }
                let mut mbi = MEMORY_BASIC_INFORMATION::default();
                let got = VirtualQuery(
                    Some(addr.Value as *const _),
                    &mut mbi,
                    std::mem::size_of::<MEMORY_BASIC_INFORMATION>(),
                );
                let len = if got == 0 { 0 } else { mbi.RegionSize };
                Some(View { handle, addr, len })
            }
        }

        /// Copie `len` octets à partir de `off` (bornés à la région).
        pub fn copy(&self, off: usize, len: usize) -> Option<Vec<u8>> {
            if off >= self.len {
                return None;
            }
            let len = len.min(self.len - off);
            let mut buf = vec![0u8; len];
            unsafe {
                std::ptr::copy_nonoverlapping(
                    (self.addr.Value as *const u8).add(off),
                    buf.as_mut_ptr(),
                    len,
                );
            }
            Some(buf)
        }
    }

    impl Drop for View {
        fn drop(&mut self) {
            unsafe {
                let _ = UnmapViewOfFile(self.addr);
                let _ = CloseHandle(self.handle);
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod view {
    pub struct View {
        pub len: usize,
    }
    impl View {
        pub fn open(_name: &str) -> Option<View> {
            None
        }
        pub fn copy(&self, _off: usize, _len: usize) -> Option<Vec<u8>> {
            None
        }
    }
}

use view::View;

// ═══════════════════════════════════════════════════════════════════════════
// Capture : écriture et lecture des trames
// ═══════════════════════════════════════════════════════════════════════════

/// Une trame : lectures de la trame, par clé (« nom de zone » ou « zone@offset »).
pub type Frame = Vec<(String, Vec<u8>)>;

/// Encode une trame (sans le préfixe de longueur).
fn encode_frame(t_ms: f64, items: &Frame) -> Vec<u8> {
    let mut out = Vec::with_capacity(16 + items.iter().map(|(k, v)| k.len() + v.len() + 6).sum::<usize>());
    out.extend_from_slice(&t_ms.to_le_bytes());
    out.extend_from_slice(&(items.len() as u16).to_le_bytes());
    for (k, v) in items {
        out.extend_from_slice(&(k.len() as u16).to_le_bytes());
        out.extend_from_slice(k.as_bytes());
        out.extend_from_slice(&(v.len() as u32).to_le_bytes());
        out.extend_from_slice(v);
    }
    out
}

/// Décode une trame ; `None` si elle est tronquée ou incohérente.
fn decode_frame(b: &[u8]) -> Option<(f64, Frame)> {
    let mut i = 0usize;
    let take = |i: &mut usize, n: usize| -> Option<&[u8]> {
        let s = b.get(*i..*i + n)?;
        *i += n;
        Some(s)
    };
    let t = f64::from_le_bytes(take(&mut i, 8)?.try_into().ok()?);
    let n = u16::from_le_bytes(take(&mut i, 2)?.try_into().ok()?);
    let mut items = Vec::with_capacity(n as usize);
    for _ in 0..n {
        let kl = u16::from_le_bytes(take(&mut i, 2)?.try_into().ok()?) as usize;
        let k = String::from_utf8(take(&mut i, kl)?.to_vec()).ok()?;
        let vl = u32::from_le_bytes(take(&mut i, 4)?.try_into().ok()?) as usize;
        let v = take(&mut i, vl)?.to_vec();
        items.push((k, v));
    }
    Some((t, items))
}

/// Enregistreur : une trame par appel à `push_frame`.
pub struct Recorder {
    enc: DeflateEncoder<BufWriter<File>>,
    pub path: PathBuf,
    started: Instant,
    pub frames: u64,
}

impl Recorder {
    pub fn create(path: &Path) -> std::io::Result<Recorder> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let mut w = BufWriter::new(File::create(path)?);
        w.write_all(MAGIC)?;
        Ok(Recorder {
            enc: DeflateEncoder::new(w, Compression::fast()),
            path: path.to_path_buf(),
            started: Instant::now(),
            frames: 0,
        })
    }

    pub fn push_frame(&mut self, items: &Frame) -> std::io::Result<()> {
        let body = encode_frame(self.started.elapsed().as_secs_f64() * 1000.0, items);
        self.enc.write_all(&(body.len() as u32).to_le_bytes())?;
        self.enc.write_all(&body)?;
        self.frames += 1;
        Ok(())
    }

    pub fn elapsed(&self) -> Duration {
        self.started.elapsed()
    }

    /// Termine le flux compressé (sans quoi la fin du fichier est illisible).
    pub fn finish(self) -> std::io::Result<PathBuf> {
        let path = self.path.clone();
        let mut w = self.enc.finish()?;
        w.flush()?;
        Ok(path)
    }
}

/// Lecteur de capture : trame après trame, sans tout charger en mémoire.
pub struct Replay {
    dec: DeflateDecoder<BufReader<File>>,
    pub path: PathBuf,
    current: HashMap<String, Vec<u8>>,
    pub frames: u64,
}

impl Replay {
    pub fn open(path: &Path) -> std::io::Result<Replay> {
        let mut r = BufReader::new(File::open(path)?);
        let mut magic = [0u8; 8];
        r.read_exact(&mut magic)?;
        if &magic != MAGIC {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "capture inconnue"));
        }
        Ok(Replay { dec: DeflateDecoder::new(r), path: path.to_path_buf(), current: HashMap::new(), frames: 0 })
    }

    /// Passe à la trame suivante ; `false` en fin de fichier (ou fichier abîmé).
    pub fn advance(&mut self) -> bool {
        let mut len = [0u8; 4];
        if self.dec.read_exact(&mut len).is_err() {
            return false;
        }
        let len = u32::from_le_bytes(len) as usize;
        if len > MAX_FRAME_BYTES {
            return false;
        }
        let mut body = vec![0u8; len];
        if self.dec.read_exact(&mut body).is_err() {
            return false;
        }
        match decode_frame(&body) {
            Some((_, items)) => {
                self.current = items.into_iter().collect();
                self.frames += 1;
                true
            }
            None => false,
        }
    }

    fn get(&self, key: &str) -> Option<Vec<u8>> {
        self.current.get(key).cloned()
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Lecteur : jeu en direct ou capture rejouée
// ═══════════════════════════════════════════════════════════════════════════

/// Les compteurs début / fin (octets 0..8) sont égaux : écriture terminée.
pub fn counters_equal(buf: &[u8]) -> bool {
    if buf.len() < 8 {
        return false;
    }
    buf[0..4] == buf[4..8]
}

/// Source unique des lectures de `live.rs`.
pub struct ShmReader {
    views: HashMap<&'static str, View>,
    opened_at: Instant,
    replay: Option<Replay>,
    recorder: Option<Recorder>,
    /// Lectures de la trame en cours (enregistrement).
    frame: Frame,
}

impl Default for ShmReader {
    fn default() -> Self {
        Self::new()
    }
}

impl ShmReader {
    pub fn new() -> Self {
        ShmReader { views: HashMap::new(), opened_at: Instant::now(), replay: None, recorder: None, frame: Vec::new() }
    }

    /// Lecteur alimenté par une capture (tests).
    #[cfg(test)]
    pub fn from_replay(replay: Replay) -> Self {
        ShmReader { replay: Some(replay), ..Self::new() }
    }

    pub fn replaying(&self) -> bool {
        self.replay.is_some()
    }

    pub fn replay_path(&self) -> Option<&Path> {
        self.replay.as_ref().map(|r| r.path.as_path())
    }

    pub fn recording(&self) -> Option<(&Path, Duration)> {
        self.recorder.as_ref().map(|r| (r.path.as_path(), r.elapsed()))
    }

    pub fn start_replay(&mut self, replay: Replay) {
        self.replay = Some(replay);
    }

    pub fn stop_replay(&mut self) {
        self.replay = None;
    }

    pub fn start_recording(&mut self, rec: Recorder) {
        self.recorder = Some(rec);
    }

    /// Arrête l'enregistrement et renvoie le chemin du fichier.
    pub fn stop_recording(&mut self) -> Option<PathBuf> {
        self.recorder.take().and_then(|r| r.finish().ok())
    }

    /// Début de trame : rejeu → trame suivante (`false` = fin de capture) ;
    /// direct → vues refermées si elles ont vécu plus de `REFRESH`.
    pub fn begin_frame(&mut self) -> bool {
        self.frame.clear();
        if let Some(r) = self.replay.as_mut() {
            return r.advance();
        }
        if self.opened_at.elapsed() >= REFRESH {
            self.views.clear();
            self.opened_at = Instant::now();
        }
        true
    }

    /// Fin de trame : écrit les lectures de la trame dans la capture en cours.
    /// Plafond de durée atteint ou disque en erreur → enregistrement arrêté.
    pub fn end_frame(&mut self) {
        let Some(rec) = self.recorder.as_mut() else {
            return;
        };
        let frame = std::mem::take(&mut self.frame);
        if frame.is_empty() {
            return;
        }
        if rec.push_frame(&frame).is_err() || rec.elapsed() >= RECORD_MAX {
            let _ = self.stop_recording();
        }
    }

    fn note(&mut self, key: String, buf: &Option<Vec<u8>>) {
        if self.recorder.is_some() {
            if let Some(b) = buf {
                self.frame.push((key, b.clone()));
            }
        }
    }

    fn view(&mut self, name: &'static str) -> Option<&View> {
        if !self.views.contains_key(name) {
            let v = View::open(name)?;
            self.views.insert(name, v);
        }
        self.views.get(name)
    }

    /// La zone existe (jeu lancé, plugin chargé) et sa taille réelle.
    pub fn region_len(&mut self, name: &'static str) -> Option<usize> {
        if let Some(r) = self.replay.as_ref() {
            return r.get(&format!("{name}#len")).and_then(|b| b.get(0..8).map(|s| u64::from_le_bytes(s.try_into().unwrap_or([0; 8])) as usize));
        }
        let len = self.view(name).map(|v| v.len);
        if self.recorder.is_some() {
            if let Some(l) = len {
                self.frame.push((format!("{name}#len"), (l as u64).to_le_bytes().to_vec()));
            }
        }
        len
    }

    /// Copie complète d'une structure de `size` octets.
    pub fn read_full(&mut self, name: &'static str, size: usize) -> Option<Vec<u8>> {
        if let Some(r) = self.replay.as_ref() {
            return r.get(name);
        }
        let mut buf = self.view(name)?.copy(0, size);
        if buf.as_ref().is_some_and(|b| b.len() >= 8 && !counters_equal(b)) {
            // Écriture en cours : une seconde copie (la suivante arrive en < 1 ms).
            buf = self.view(name)?.copy(0, size);
        }
        self.note(name.to_string(), &buf);
        buf
    }

    /// Copie partielle : `header` octets + `count × stride`, le compteur (i32)
    /// étant lu à `count_off`. Borné à `max` éléments.
    pub fn read_counted(
        &mut self,
        name: &'static str,
        header: usize,
        count_off: usize,
        stride: usize,
        max: usize,
    ) -> Option<Vec<u8>> {
        if let Some(r) = self.replay.as_ref() {
            return r.get(name);
        }
        let copy = |v: &View| -> Option<Vec<u8>> {
            let head = v.copy(0, header)?;
            let n = head
                .get(count_off..count_off + 4)
                .map(|s| i32::from_le_bytes(s.try_into().unwrap_or([0; 4])))
                .unwrap_or(0)
                .clamp(0, max as i32) as usize;
            v.copy(0, header + n * stride)
        };
        let mut buf = copy(self.view(name)?);
        if buf.as_ref().is_some_and(|b| b.len() >= 8 && !counters_equal(b)) {
            buf = copy(self.view(name)?);
        }
        self.note(name.to_string(), &buf);
        buf
    }

    /// Plage `off..off+len` (ex. bloc du joueur dans `LMU_Data`).
    pub fn read_range(&mut self, name: &'static str, off: usize, len: usize) -> Option<Vec<u8>> {
        let key = format!("{name}@{off}");
        if let Some(r) = self.replay.as_ref() {
            return r.get(&key);
        }
        let buf = self.view(name)?.copy(off, len).filter(|b| b.len() == len);
        self.note(key, &buf);
        buf
    }
}

/// Nom de fichier d'une nouvelle capture (horodaté).
pub fn new_capture_path(dir: &Path) -> PathBuf {
    dir.join(format!("capture-{}.lmurec", chrono::Local::now().format("%Y%m%d-%H%M%S")))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join("lmusv-shm-tests");
        let _ = std::fs::create_dir_all(&d);
        d.join(name)
    }

    #[test]
    fn frame_roundtrip() {
        let items: Frame = vec![("a".into(), vec![1, 2, 3]), ("LMU_Data@128464".into(), vec![9; 1888])];
        let (t, back) = decode_frame(&encode_frame(42.5, &items)).unwrap();
        assert_eq!(t, 42.5);
        assert_eq!(back, items);
        assert!(decode_frame(&encode_frame(1.0, &items)[..12]).is_none(), "trame tronquée");
    }

    #[test]
    fn record_then_replay_in_order() {
        let p = tmp("roundtrip.lmurec");
        let mut rec = Recorder::create(&p).unwrap();
        for i in 0..5u8 {
            rec.push_frame(&vec![("$scoring$".into(), vec![i; 100])]).unwrap();
        }
        rec.finish().unwrap();
        let mut r = ShmReader::from_replay(Replay::open(&p).unwrap());
        for i in 0..5u8 {
            assert!(r.begin_frame());
            assert_eq!(r.read_full("$scoring$", 999).unwrap(), vec![i; 100]);
            assert!(r.read_full("$absent$", 8).is_none());
        }
        assert!(!r.begin_frame(), "fin de capture");
    }

    #[test]
    fn reader_records_its_reads() {
        // Sans jeu, les lectures directes échouent : seule la mécanique d'écriture
        // est vérifiée via `note` (lecture rejouée → réenregistrée).
        let src = tmp("src.lmurec");
        let mut rec = Recorder::create(&src).unwrap();
        rec.push_frame(&vec![("$tele$".into(), vec![7; 64]), ("$tele$#len".into(), 64u64.to_le_bytes().to_vec())])
            .unwrap();
        rec.finish().unwrap();
        let mut r = ShmReader::from_replay(Replay::open(&src).unwrap());
        assert!(r.begin_frame());
        assert_eq!(r.region_len("$tele$"), Some(64));
        assert_eq!(r.read_counted("$tele$", 16, 12, 8, 4).unwrap().len(), 64);
    }

    #[test]
    fn rejects_foreign_files() {
        let p = tmp("foreign.lmurec");
        std::fs::write(&p, b"not a capture").unwrap();
        assert!(Replay::open(&p).is_err());
    }

    #[test]
    fn counters() {
        assert!(counters_equal(&[1, 0, 0, 0, 1, 0, 0, 0]));
        assert!(!counters_equal(&[2, 0, 0, 0, 1, 0, 0, 0]));
        assert!(!counters_equal(&[1, 0]));
    }
}
