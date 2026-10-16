//! Mini-secteurs chronométrés pour **tout le plateau**.
//!
//! Le tour est découpé en zones égales d'environ 350 m (8 à 24 zones). Pour
//! chaque voiture (identifiant `mID`), on date le franchissement de chaque
//! frontière de zone par interpolation linéaire entre deux mesures de scoring
//! (~5 Hz : à 300 km/h, ~17 m entre deux mesures), puis on garde le dernier
//! temps de chaque zone. Sert à la comparaison « moi contre une voiture » sur
//! la carte. Module pur, testé.

use std::collections::HashMap;

/// Longueur visée d'une zone (m).
pub const TARGET_ZONE_M: f64 = 350.0;
/// Saut de distance au-delà duquel la mesure est jugée discontinue (m).
const MAX_STEP_M: f64 = 300.0;

#[derive(Debug, Clone, Default)]
struct Car {
    /// Dernière mesure (distance déroulée, temps).
    last: Option<(f64, f64)>,
    /// Zone en cours et heure d'entrée.
    entry: Option<(usize, f64)>,
    /// Dernier temps complet de chaque zone (s), 0 = inconnu.
    times: Vec<f32>,
}

#[derive(Debug, Clone)]
pub struct MiniSectors {
    lap_len: f64,
    zones: usize,
    cars: HashMap<i32, Car>,
}

impl MiniSectors {
    /// `None` si la longueur du tour est inconnue ou trop courte.
    pub fn new(lap_len: f64) -> Option<Self> {
        if !(lap_len > 1000.0) {
            return None;
        }
        let zones = ((lap_len / TARGET_ZONE_M).round() as usize).clamp(8, 24);
        Some(MiniSectors { lap_len, zones, cars: HashMap::new() })
    }

    pub fn zones(&self) -> usize {
        self.zones
    }

    pub fn zone_len(&self) -> f64 {
        self.lap_len / self.zones as f64
    }

    pub fn lap_len(&self) -> f64 {
        self.lap_len
    }

    /// Une mesure de scoring. `valid` = en piste (hors stands) et séance active ;
    /// sinon la mesure en cours est abandonnée (pas de zone à cheval sur un arrêt).
    pub fn push(&mut self, id: i32, lap_dist: f64, t: f64, valid: bool) {
        let zones = self.zones;
        let zl = self.zone_len();
        let lap = self.lap_len;
        let car = self.cars.entry(id).or_insert_with(|| Car { times: vec![0.0; zones], ..Default::default() });
        if !valid || !(0.0..=lap).contains(&lap_dist) {
            car.last = None;
            car.entry = None;
            return;
        }
        let Some((d0, t0)) = car.last else {
            car.last = Some((lap_dist, t));
            return;
        };
        // Passage de la ligne : on déroule la distance.
        let d1 = if lap_dist < d0 - lap / 2.0 { lap_dist + lap } else { lap_dist };
        let step = d1 - d0;
        if step.abs() < 0.01 {
            return; // même mesure de scoring
        }
        if step < 0.0 || step > MAX_STEP_M || t <= t0 {
            car.last = Some((lap_dist, t));
            car.entry = None;
            return;
        }
        let first = (d0 / zl).floor() as i64 + 1;
        let last = (d1 / zl).floor() as i64;
        for k in first..=last {
            let b = k as f64 * zl;
            let tc = t0 + (b - d0) / step * (t - t0);
            let z = (k as usize) % zones;
            let prev = (z + zones - 1) % zones;
            if let Some((ez, te)) = car.entry {
                if ez == prev {
                    car.times[prev] = (tc - te) as f32;
                }
            }
            car.entry = Some((z, tc));
        }
        car.last = Some((lap_dist, t));
    }

    /// Derniers temps de zone d'une voiture (vide si inconnue).
    pub fn times(&self, id: i32) -> Vec<f32> {
        self.cars.get(&id).map(|c| c.times.clone()).unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Voiture à vitesse constante `v` (m/s), mesures toutes les 0,2 s.
    fn drive(m: &mut MiniSectors, id: i32, v: f64, laps: f64) {
        let lap = m.lap_len();
        let mut t = 0.0;
        let mut d = 0.0;
        while d < laps * lap {
            m.push(id, d % lap, t, true);
            t += 0.2;
            d += v * 0.2;
        }
    }

    #[test]
    fn zone_count_and_length() {
        let m = MiniSectors::new(4083.0).unwrap();
        assert_eq!(m.zones(), 12);
        assert!((m.zone_len() - 340.25).abs() < 0.01);
        assert_eq!(MiniSectors::new(13626.0).unwrap().zones(), 24, "Le Mans plafonné à 24 zones");
        assert!(MiniSectors::new(0.0).is_none());
    }

    #[test]
    fn constant_speed_gives_equal_zone_times() {
        let mut m = MiniSectors::new(4000.0).unwrap();
        drive(&mut m, 7, 50.0, 2.2);
        let times = m.times(7);
        let zl = m.zone_len();
        for (i, &x) in times.iter().enumerate() {
            assert!((x as f64 - zl / 50.0).abs() < 0.01, "zone {i} : {x}");
        }
    }

    #[test]
    fn faster_car_has_shorter_zones_and_pits_cut_timing() {
        let mut m = MiniSectors::new(4000.0).unwrap();
        drive(&mut m, 1, 50.0, 1.5);
        drive(&mut m, 2, 55.0, 1.5);
        assert!(m.times(2)[3] < m.times(1)[3]);
        // Passage aux stands : la zone en cours n'est pas chronométrée.
        let before = m.times(1)[0];
        m.push(1, 100.0, 1000.0, false);
        m.push(1, 600.0, 1010.0, true);
        m.push(1, 650.0, 1011.0, true);
        assert_eq!(m.times(1)[0], before);
        assert!(m.times(99).is_empty());
    }
}
