//! Atelier (opt-in) — lecture d'un fichier télémétrie `.duckdb` pour :
//! - **S7, zones ABS / TC** : où les aides travaillent (cases de 50 m vues sur
//!   au moins 2 tours), temps actif par tour, et l'effet mesuré du dernier
//!   changement de niveau (2 tours complets avant / après : deux nombres, aucun
//!   verdict) ;
//! - **S8, vigie de la plateforme** : par tour, enfoncement maxi des 3ᵉ
//!   éléments, hauteur mini par roue, effort de frein maxi AV/AR, G latéral
//!   maxi. La comparaison au meilleur tour se fait côté interface.
//!
//! Canaux lus (vérifiés sur de vrais fichiers) : événements `ABS`, `TC`
//! (booléens), `ABSLevel`, `TCLevel`, `Lap`, `In Pits` (`ts` sur l'horloge GPS) ;
//! continus `Lap Dist` (10 Hz), `Rear3rdDeflection`, `Front3rdDeflection`,
//! `RideHeights` (4), `Brakes Force` (4), `G Force Lat`. Un canal absent laisse
//! sa mesure vide. Le cœur (`analyze`) est pur et testé.

use std::collections::{BTreeMap, BTreeSet};

use serde::Serialize;

use super::telemetry::{gps_time_bounds, open_ro, read_channel, segment_laps, table_names, ChannelRaw, LapInfo};
use crate::error::AppError;

/// Largeur d'une case de zone (m).
const ZONE_M: f64 = 50.0;
/// Tours distincts minimum pour retenir une zone.
const ZONE_MIN_LAPS: usize = 2;
/// Zones rendues au plus, par aide.
const ZONES_MAX: usize = 8;
/// Tours de chaque côté d'un changement de niveau.
const EFFECT_LAPS: usize = 2;
/// Au-delà, un pic de G latéral est un choc, pas un appui en virage.
const MAX_LAT_G: f64 = 6.0;

/// Canal continu : échantillon `i` au temps `t0 + i / f`.
pub(crate) struct Series {
    pub t0: f64,
    pub f: f64,
    pub data: Vec<f64>,
}

impl Series {
    fn from_raw(raw: &ChannelRaw, dim: usize, t0: f64, duration: f64) -> Option<Self> {
        let data = raw.data.get(dim)?.clone();
        if raw.is_event || data.is_empty() || duration <= 0.0 {
            return None;
        }
        let f = data.len() as f64 / duration;
        Some(Self { t0, f, data })
    }

    fn at(&self, t: f64) -> Option<f64> {
        let n = self.data.len() as isize;
        if n == 0 {
            return None;
        }
        let i = (((t - self.t0) * self.f).round() as isize).clamp(0, n - 1) as usize;
        let v = self.data[i];
        v.is_finite().then_some(v)
    }

    /// Valeurs finies sur `[a, b)`.
    fn window(&self, a: f64, b: f64) -> impl Iterator<Item = f64> + '_ {
        let n = self.data.len();
        let i0 = (((a - self.t0) * self.f).ceil().max(0.0) as usize).min(n);
        let i1 = (((b - self.t0) * self.f).ceil().max(0.0) as usize).min(n);
        self.data[i0..i1.max(i0)].iter().copied().filter(|v| v.is_finite())
    }
}

/// Canal événementiel (valeur tenue jusqu'à l'événement suivant).
pub(crate) struct Events {
    pub ts: Vec<f64>,
    pub v: Vec<f64>,
}

impl Events {
    fn from_raw(raw: &ChannelRaw) -> Option<Self> {
        if !raw.is_event || raw.ts.is_empty() {
            return None;
        }
        Some(Self { ts: raw.ts.clone(), v: raw.data.first()?.clone() })
    }

    /// Intervalles où la valeur est vraie (> 0,5), bornés à `t_end`.
    fn active(&self, t_end: f64) -> Vec<(f64, f64)> {
        let mut out = Vec::new();
        for i in 0..self.ts.len() {
            if self.v.get(i).copied().unwrap_or(0.0) > 0.5 {
                let end = self.ts.get(i + 1).copied().unwrap_or(t_end);
                if end > self.ts[i] {
                    out.push((self.ts[i], end));
                }
            }
        }
        out
    }
}

fn overlap(iv: &[(f64, f64)], a: f64, b: f64) -> f64 {
    iv.iter().map(|&(x, y)| (y.min(b) - x.max(a)).max(0.0)).sum()
}

fn max_of(it: impl Iterator<Item = f64>) -> Option<f64> {
    it.fold(None, |m: Option<f64>, v| Some(m.map_or(v, |m| m.max(v))))
}

fn min_of(it: impl Iterator<Item = f64>) -> Option<f64> {
    it.fold(None, |m: Option<f64>, v| Some(m.map_or(v, |m| m.min(v))))
}

fn round3(v: f64) -> f64 {
    (v * 1000.0).round() / 1000.0
}

#[derive(Debug, Clone, Serialize)]
pub struct LabLap {
    pub lap: i64,
    pub start: f64,
    pub duration: f64,
    /// Bouclé (un tour suivant existe) et sans passage aux stands.
    pub clean: bool,
    pub in_pits: bool,
    pub abs_s: Option<f64>,
    pub tc_s: Option<f64>,
    /// Enfoncement maxi du 3ᵉ élément (m).
    pub front_3rd_max: Option<f64>,
    pub rear_3rd_max: Option<f64>,
    /// Hauteur de caisse mini par roue FL, FR, RL, RR (m).
    pub ride_min: [Option<f64>; 4],
    /// Effort de frein maxi, essieu avant / arrière (unité du jeu).
    pub brake_front_max: Option<f64>,
    pub brake_rear_max: Option<f64>,
    /// |G latéral| maxi.
    pub lat_g_max: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AidZone {
    /// "abs" | "tc"
    pub aid: String,
    /// Début de la case (m).
    pub from_m: f64,
    pub to_m: f64,
    /// Tours propres où l'aide a travaillé dans la case.
    pub laps: usize,
    /// Temps actif cumulé dans la case (s).
    pub seconds: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct AidEffect {
    /// Tours propres retenus (≤ 2).
    pub laps: usize,
    pub avg_lap: Option<f64>,
    /// Temps actif moyen de l'aide par tour (s).
    pub avg_active_s: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LevelChange {
    pub aid: String,
    pub at: f64,
    pub lap: i64,
    pub from: f64,
    pub to: f64,
    pub before: AidEffect,
    pub after: AidEffect,
}

#[derive(Debug, Clone, Serialize)]
pub struct LabTelemetryReport {
    pub laps: Vec<LabLap>,
    pub zones: Vec<AidZone>,
    /// Dernier changement de niveau de chaque aide (s'il y en a eu un).
    pub changes: Vec<LevelChange>,
    pub has_abs: bool,
    pub has_tc: bool,
}

#[derive(Default)]
pub(crate) struct LabInput {
    pub t_end: f64,
    pub laps: Vec<LapInfo>,
    pub abs: Option<Events>,
    pub tc: Option<Events>,
    pub abs_level: Option<Events>,
    pub tc_level: Option<Events>,
    pub in_pits: Option<Events>,
    pub lap_dist: Option<Series>,
    pub front_3rd: Option<Series>,
    pub rear_3rd: Option<Series>,
    pub ride: Vec<Series>,
    pub brake: Vec<Series>,
    pub lat_g: Option<Series>,
}

fn effect(laps: &[&LabLap], aid: &str) -> AidEffect {
    let n = laps.len();
    let avg = |f: &dyn Fn(&LabLap) -> Option<f64>| {
        let v: Vec<f64> = laps.iter().filter_map(|l| f(l)).collect();
        (!v.is_empty()).then(|| round3(v.iter().sum::<f64>() / v.len() as f64))
    };
    AidEffect {
        laps: n,
        avg_lap: avg(&|l| Some(l.duration)),
        avg_active_s: avg(&|l| if aid == "abs" { l.abs_s } else { l.tc_s }),
    }
}

/// Analyse pure (aucun accès fichier).
pub(crate) fn analyze(input: &LabInput) -> LabTelemetryReport {
    let pits = input.in_pits.as_ref().map(|e| e.active(input.t_end)).unwrap_or_default();
    let abs_iv = input.abs.as_ref().map(|e| e.active(input.t_end));
    let tc_iv = input.tc.as_ref().map(|e| e.active(input.t_end));
    let n = input.laps.len();

    let laps: Vec<LabLap> = input
        .laps
        .iter()
        .enumerate()
        .map(|(i, l)| {
            let (a, b) = (l.start_time, l.end_time);
            let in_pits = overlap(&pits, a, b) > 0.0;
            let win = |s: &Option<Series>| s.as_ref().and_then(|s| max_of(s.window(a, b)));
            let ride_min = [0, 1, 2, 3].map(|k| input.ride.get(k).and_then(|s| min_of(s.window(a, b))).map(round3));
            let axle = |k: [usize; 2]| max_of(k.iter().filter_map(|&j| input.brake.get(j)).filter_map(|s| max_of(s.window(a, b))));
            LabLap {
                lap: l.lap,
                start: a,
                duration: round3(l.duration),
                clean: i + 1 < n && !in_pits,
                in_pits,
                abs_s: abs_iv.as_ref().map(|iv| round3(overlap(iv, a, b))),
                tc_s: tc_iv.as_ref().map(|iv| round3(overlap(iv, a, b))),
                front_3rd_max: win(&input.front_3rd).map(round3),
                rear_3rd_max: win(&input.rear_3rd).map(round3),
                ride_min,
                brake_front_max: axle([0, 1]).map(round3),
                brake_rear_max: axle([2, 3]).map(round3),
                lat_g_max: input.lat_g.as_ref().and_then(|s| max_of(s.window(a, b).map(f64::abs).filter(|g| *g <= MAX_LAT_G))).map(round3),
            }
        })
        .collect();

    // Zones : chaque intervalle actif est placé à la distance-tour de son début.
    let mut zones: Vec<AidZone> = Vec::new();
    if let Some(ld) = &input.lap_dist {
        for (aid, iv) in [("abs", &abs_iv), ("tc", &tc_iv)] {
            let Some(iv) = iv else { continue };
            let mut cells: BTreeMap<i64, (BTreeSet<i64>, f64)> = BTreeMap::new();
            for &(x, y) in iv {
                let Some(lap) = laps.iter().find(|l| x >= l.start && x < l.start + l.duration) else { continue };
                if !lap.clean {
                    continue;
                }
                let Some(d) = ld.at(x) else { continue };
                let cell = (d / ZONE_M).floor() as i64;
                let e = cells.entry(cell).or_default();
                e.0.insert(lap.lap);
                e.1 += y - x;
            }
            // Cases retenues, puis cases voisines fusionnées en une zone.
            let mut merged: Vec<(i64, i64, BTreeSet<i64>, f64)> = Vec::new();
            for (c, (l, s)) in cells.into_iter().filter(|(_, (l, _))| l.len() >= ZONE_MIN_LAPS) {
                match merged.last_mut() {
                    Some(m) if m.1 + 1 == c => {
                        m.1 = c;
                        m.2.extend(l);
                        m.3 += s;
                    }
                    _ => merged.push((c, c, l, s)),
                }
            }
            let mut z: Vec<AidZone> = merged
                .into_iter()
                .map(|(a, b, l, s)| AidZone {
                    aid: aid.to_string(),
                    from_m: a as f64 * ZONE_M,
                    to_m: (b + 1) as f64 * ZONE_M,
                    laps: l.len(),
                    seconds: round3(s),
                })
                .collect();
            z.sort_by(|a, b| b.seconds.partial_cmp(&a.seconds).unwrap_or(std::cmp::Ordering::Equal));
            z.truncate(ZONES_MAX);
            zones.extend(z);
        }
    }

    // Dernier changement de niveau de chaque aide : 2 tours propres avant / après.
    let mut changes = Vec::new();
    for (aid, lv) in [("abs", &input.abs_level), ("tc", &input.tc_level)] {
        let Some(lv) = lv else { continue };
        let Some(i) = (1..lv.ts.len()).rev().find(|&i| (lv.v[i] - lv.v[i - 1]).abs() > 1e-9) else { continue };
        let at = lv.ts[i];
        let clean: Vec<&LabLap> = laps.iter().filter(|l| l.clean).collect();
        let before: Vec<&LabLap> = clean.iter().copied().filter(|l| l.start + l.duration <= at).collect();
        let after: Vec<&LabLap> = clean.iter().copied().filter(|l| l.start >= at).take(EFFECT_LAPS).collect();
        let before = &before[before.len().saturating_sub(EFFECT_LAPS)..];
        let lap = laps.iter().find(|l| at >= l.start && at < l.start + l.duration).map(|l| l.lap).unwrap_or(-1);
        changes.push(LevelChange {
            aid: aid.to_string(),
            at: round3(at),
            lap,
            from: lv.v[i - 1],
            to: lv.v[i],
            before: effect(before, aid),
            after: effect(&after, aid),
        });
    }

    LabTelemetryReport {
        laps,
        zones,
        changes,
        has_abs: input.abs.is_some(),
        has_tc: input.tc.is_some(),
    }
}

/// Zones ABS/TC et vigie de la plateforme d'un fichier `.duckdb` (Atelier).
#[tauri::command]
pub async fn analyze_telemetry_lab(path: String) -> Result<LabTelemetryReport, AppError> {
    let conn = open_ro(&path)?;
    let tables = table_names(&conn)?;
    let (t0, duration) = gps_time_bounds(&conn)?;
    let t_end = t0 + duration;
    let raw = |name: &str| if tables.contains(name) { read_channel(&conn, name).ok() } else { None };
    let events = |name: &str| raw(name).as_ref().and_then(Events::from_raw);
    let series = |name: &str| raw(name).as_ref().and_then(|r| Series::from_raw(r, 0, t0, duration));
    let wheels = |name: &str| -> Vec<Series> {
        raw(name)
            .map(|r| (0..r.dims.min(4)).filter_map(|d| Series::from_raw(&r, d, t0, duration)).collect())
            .unwrap_or_default()
    };
    let input = LabInput {
        t_end,
        laps: segment_laps(&conn, &tables, t0, t_end),
        abs: events("ABS"),
        tc: events("TC"),
        abs_level: events("ABSLevel"),
        tc_level: events("TCLevel"),
        in_pits: events("In Pits"),
        lap_dist: series("Lap Dist"),
        front_3rd: series("Front3rdDeflection"),
        rear_3rd: series("Rear3rdDeflection"),
        ride: wheels("RideHeights"),
        brake: wheels("Brakes Force"),
        lat_g: series("G Force Lat"),
    };
    Ok(analyze(&input))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lap(n: i64, a: f64, b: f64) -> LapInfo {
        LapInfo { lap: n, start_time: a, end_time: b, duration: b - a, ..Default::default() }
    }

    fn ev(pairs: &[(f64, f64)]) -> Events {
        Events { ts: pairs.iter().map(|p| p.0).collect(), v: pairs.iter().map(|p| p.1).collect() }
    }

    /// 4 tours de 100 s ; tour 1 = 0..100 m/s ; distance = (t mod 100) × 10 m.
    fn base() -> LabInput {
        let t0 = 0.0;
        let f = 10.0;
        let dist: Vec<f64> = (0..4000).map(|i| ((i as f64 / f) % 100.0) * 10.0).collect();
        LabInput {
            t_end: 400.0,
            laps: vec![lap(0, 0.0, 100.0), lap(1, 100.0, 200.0), lap(2, 200.0, 300.0), lap(3, 300.0, 400.0)],
            lap_dist: Some(Series { t0, f, data: dist }),
            ..Default::default()
        }
    }

    #[test]
    fn aid_time_per_lap_and_zones_need_two_laps() {
        let mut i = base();
        // ABS actif 1 s à 20 s (200 m) des tours 0, 1 et 2 ; une fois à 60 s du tour 1.
        i.abs = Some(ev(&[
            (0.0, 0.0),
            (20.0, 1.0),
            (21.0, 0.0),
            (120.0, 1.0),
            (121.0, 0.0),
            (160.0, 1.0),
            (160.5, 0.0),
            (220.0, 1.0),
            (221.0, 0.0),
        ]));
        let r = analyze(&i);
        assert_eq!(r.laps[1].abs_s, Some(1.5));
        assert!(!r.laps[3].clean, "dernier tour non bouclé");
        let z: Vec<&AidZone> = r.zones.iter().filter(|z| z.aid == "abs").collect();
        assert_eq!(z.len(), 1, "la case vue une seule fois est écartée");
        assert_eq!(z[0].from_m, 200.0);
        assert_eq!(z[0].laps, 3);
        assert!((z[0].seconds - 3.0).abs() < 1e-9);
    }

    #[test]
    fn pit_laps_are_not_clean_and_skip_zones() {
        let mut i = base();
        i.in_pits = Some(ev(&[(0.0, 1.0), (30.0, 0.0)]));
        i.tc = Some(ev(&[(0.0, 0.0), (10.0, 1.0), (11.0, 0.0), (110.0, 1.0), (111.0, 0.0)]));
        let r = analyze(&i);
        assert!(r.laps[0].in_pits && !r.laps[0].clean);
        assert!(r.zones.is_empty(), "un seul tour propre dans la case");
    }

    #[test]
    fn level_change_effect_uses_clean_laps_each_side() {
        let mut i = base();
        i.tc_level = Some(ev(&[(0.0, 6.0), (200.0, 4.0)]));
        i.tc = Some(ev(&[(0.0, 0.0), (10.0, 1.0), (14.0, 0.0), (110.0, 1.0), (112.0, 0.0), (210.0, 1.0), (211.0, 0.0)]));
        let r = analyze(&i);
        let c = &r.changes[0];
        assert_eq!((c.aid.as_str(), c.from, c.to, c.lap), ("tc", 6.0, 4.0, 2));
        assert_eq!(c.before.laps, 2);
        assert_eq!(c.before.avg_active_s, Some(3.0));
        assert_eq!(c.after.laps, 1, "le tour 3 n'est pas bouclé");
        assert_eq!(c.after.avg_active_s, Some(1.0));
    }

    /// Smoke-test sur un vrai fichier du jeu (ignoré s'il est absent).
    /// `cargo test smoke_lab_real_file -- --nocapture`
    #[test]
    fn smoke_lab_real_file() {
        let dir = std::path::Path::new(r"D:\SteamLibrary\steamapps\common\Le Mans Ultimate\UserData\Telemetry");
        // `LAB_FILE` = un fichier précis, sinon le plus gros du dossier.
        let pick = std::env::var("LAB_FILE").ok().map(std::path::PathBuf::from);
        let Some(f) = pick.or_else(|| std::fs::read_dir(dir).ok().and_then(|r| {
            r.flatten().map(|e| e.path()).filter(|p| p.extension().map_or(false, |e| e == "duckdb")).max_by_key(|p| std::fs::metadata(p).map(|m| m.len()).unwrap_or(0))
        })) else {
            return;
        };
        let r = tauri::async_runtime::block_on(analyze_telemetry_lab(f.to_string_lossy().to_string())).expect("analyse");
        println!("{} : {} tours, {} zones, {} changements", f.display(), r.laps.len(), r.zones.len(), r.changes.len());
        for l in &r.laps {
            println!("  {l:?}");
        }
        for z in &r.zones {
            println!("  {z:?}");
        }
        assert!(!r.laps.is_empty());
    }

    #[test]
    fn platform_maxima_per_lap() {
        let mut i = base();
        let f = 10.0;
        let mut rear: Vec<f64> = vec![0.05; 4000];
        rear[1500] = 0.09; // tour 1
        i.rear_3rd = Some(Series { t0: 0.0, f, data: rear });
        i.ride = (0..4).map(|k| Series { t0: 0.0, f, data: vec![0.05 + k as f64 * 0.001; 4000] }).collect();
        i.brake = (0..4).map(|k| Series { t0: 0.0, f, data: vec![if k < 2 { 2.0 } else { 1.0 }; 4000] }).collect();
        i.lat_g = Some(Series { t0: 0.0, f, data: vec![-2.5; 4000] });
        let r = analyze(&i);
        assert_eq!(r.laps[1].rear_3rd_max, Some(0.09));
        assert_eq!(r.laps[0].rear_3rd_max, Some(0.05));
        assert_eq!(r.laps[0].ride_min[3], Some(0.053));
        assert_eq!((r.laps[0].brake_front_max, r.laps[0].brake_rear_max), (Some(2.0), Some(1.0)));
        assert_eq!(r.laps[0].lat_g_max, Some(2.5));
    }
}
