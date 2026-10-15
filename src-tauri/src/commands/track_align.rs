//! Recalage du tracé fourni par le jeu (`watch/trackmap`) sur la distance-tour.
//!
//! Le jeu donne la boucle de course en points x/z, sans distance ni point de
//! départ. Le tracé de l'app est indexé par `lap_dist` (buckets de 20 m). On
//! recale donc la polyligne du jeu à partir d'échantillons (position, lap_dist)
//! de voitures en piste : sens de parcours, décalage du départ et échelle (axe
//! de la piste vs longueur officielle du tour). Module pur, testé.

/// Boucle fermée avec abscisse curviligne cumulée.
#[derive(Debug, Clone)]
pub struct Polyline {
    pts: Vec<[f64; 2]>,
    /// `cum[i]` = distance du point 0 au point i ; `cum[n]` = longueur totale.
    cum: Vec<f64>,
}

fn dist(a: [f64; 2], b: [f64; 2]) -> f64 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2)).sqrt()
}

impl Polyline {
    /// `None` si moins de 10 points ou longueur nulle.
    pub fn closed(pts: Vec<[f64; 2]>) -> Option<Self> {
        if pts.len() < 10 {
            return None;
        }
        let n = pts.len();
        let mut cum = Vec::with_capacity(n + 1);
        cum.push(0.0);
        for i in 0..n {
            let next = pts[(i + 1) % n];
            cum.push(cum[i] + dist(pts[i], next));
        }
        (cum[n] > 0.0).then_some(Polyline { pts, cum })
    }

    pub fn length(&self) -> f64 {
        self.cum[self.pts.len()]
    }

    /// Projection orthogonale : (abscisse du point le plus proche, distance).
    pub fn project(&self, p: [f64; 2]) -> (f64, f64) {
        let n = self.pts.len();
        let mut best = (0.0, f64::INFINITY);
        for i in 0..n {
            let a = self.pts[i];
            let b = self.pts[(i + 1) % n];
            let (dx, dz) = (b[0] - a[0], b[1] - a[1]);
            let len2 = dx * dx + dz * dz;
            let t = if len2 > 0.0 {
                (((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2).clamp(0.0, 1.0)
            } else {
                0.0
            };
            let q = [a[0] + t * dx, a[1] + t * dz];
            let d = dist(p, q);
            if d < best.1 {
                best = (self.cum[i] + t * (self.cum[i + 1] - self.cum[i]), d);
            }
        }
        best
    }

    /// Point à l'abscisse `s` (modulo la longueur).
    pub fn at(&self, s: f64) -> [f64; 2] {
        let total = self.length();
        let s = s.rem_euclid(total);
        let i = match self.cum.binary_search_by(|c| c.total_cmp(&s)) {
            Ok(i) => i.min(self.pts.len() - 1),
            Err(i) => i.saturating_sub(1).min(self.pts.len() - 1),
        };
        let seg = self.cum[i + 1] - self.cum[i];
        let t = if seg > 0.0 { (s - self.cum[i]) / seg } else { 0.0 };
        let a = self.pts[i];
        let b = self.pts[(i + 1) % self.pts.len()];
        [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
    }
}

/// abscisse_jeu = offset + dir × lap_dist × scale (modulo la longueur).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Alignment {
    pub offset: f64,
    /// +1 si la polyligne suit le sens de course, −1 sinon.
    pub dir: f64,
    /// Longueur de la polyligne ÷ longueur officielle du tour.
    pub scale: f64,
}

impl Alignment {
    pub fn abscissa(&self, lap_dist: f64) -> f64 {
        self.offset + self.dir * lap_dist * self.scale
    }
}

/// Écart toléré (m) entre une position échantillonnée et la polyligne.
const MAX_SAMPLE_DIST: f64 = 25.0;
/// Dispersion max (m) des décalages pour accepter un recalage.
const MAX_SPREAD: f64 = 30.0;

fn wrap(x: f64, total: f64) -> f64 {
    let r = x.rem_euclid(total);
    if r > total / 2.0 {
        r - total
    } else {
        r
    }
}

fn median(mut xs: Vec<f64>) -> f64 {
    xs.sort_by(|a, b| a.total_cmp(b));
    xs[xs.len() / 2]
}

/// Recale la polyligne sur la distance-tour. Exige ≥ 4 échantillons proches de
/// la piste et couvrant ≥ 300 m (ou un dixième du tour) ; `None` sinon, ou si
/// les échantillons ne s'accordent pas (autre circuit, autre tracé).
pub fn align(poly: &Polyline, samples: &[([f64; 2], f64)], lap_len: f64) -> Option<Alignment> {
    if lap_len <= 0.0 {
        return None;
    }
    let total = poly.length();
    let scale = total / lap_len;
    if !(0.85..=1.15).contains(&scale) {
        return None;
    }
    let proj: Vec<(f64, f64)> = samples
        .iter()
        .filter(|(_, d)| *d > 0.0 && *d < lap_len)
        .filter_map(|(p, d)| {
            let (s, e) = poly.project(*p);
            (e <= MAX_SAMPLE_DIST).then_some((s, *d))
        })
        .collect();
    if proj.len() < 4 {
        return None;
    }
    let (lo, hi) = proj.iter().fold((f64::INFINITY, 0.0f64), |(lo, hi), (_, d)| (lo.min(*d), hi.max(*d)));
    if hi - lo < (lap_len / 10.0).min(300.0) {
        return None;
    }
    let mut best: Option<(f64, Alignment)> = None;
    for dir in [1.0, -1.0] {
        let raw: Vec<f64> = proj.iter().map(|(s, d)| s - dir * d * scale).collect();
        // Décalages ramenés autour du premier (sans saut au passage de la ligne).
        let base = raw[0];
        let rel: Vec<f64> = raw.iter().map(|o| wrap(o - base, total)).collect();
        let mid = median(rel.clone());
        let spread = median(rel.iter().map(|r| (r - mid).abs()).collect());
        if spread <= MAX_SPREAD && best.map(|(b, _)| spread < b).unwrap_or(true) {
            best = Some((spread, Alignment { offset: (base + mid).rem_euclid(total), dir, scale }));
        }
    }
    best.map(|(_, a)| a)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Cercle de rayon r, `n` points, parcouru dans le sens trigo.
    fn circle(r: f64, n: usize) -> Vec<[f64; 2]> {
        (0..n)
            .map(|i| {
                let a = i as f64 / n as f64 * std::f64::consts::TAU;
                [r * a.cos(), r * a.sin()]
            })
            .collect()
    }

    #[test]
    fn project_and_at_round_trip() {
        let p = Polyline::closed(circle(100.0, 400)).unwrap();
        assert!((p.length() - std::f64::consts::TAU * 100.0).abs() < 1.0);
        let q = p.at(123.0);
        let (s, d) = p.project(q);
        assert!((s - 123.0).abs() < 0.5 && d < 0.01);
        // Modulo la longueur.
        let r = p.at(p.length() + 10.0);
        assert!(dist(r, p.at(10.0)) < 1e-6);
    }

    /// Voitures simulées : départ à l'abscisse `start` du tracé, sens `dir`.
    fn samples(p: &Polyline, start: f64, dir: f64, lap_len: f64) -> Vec<([f64; 2], f64)> {
        let scale = p.length() / lap_len;
        [50.0, 400.0, 900.0, 1500.0, 2100.0]
            .iter()
            .map(|&d| (p.at(start + dir * d * scale), d))
            .collect()
    }

    #[test]
    fn align_finds_offset_direction_and_scale() {
        let p = Polyline::closed(circle(400.0, 600)).unwrap();
        let lap_len = p.length() * 1.02; // tour officiel 2 % plus long que l'axe
        for (start, dir) in [(300.0, 1.0), (1700.0, -1.0)] {
            let a = align(&p, &samples(&p, start, dir, lap_len), lap_len).unwrap();
            assert_eq!(a.dir, dir);
            assert!((a.scale - 1.0 / 1.02).abs() < 1e-9);
            assert!(wrap(a.offset - start, p.length()).abs() < 1.0, "{a:?}");
            // Un bucket à 1000 m tombe là où roulerait la voiture.
            let expect = p.at(start + dir * 1000.0 * a.scale);
            assert!(dist(p.at(a.abscissa(1000.0)), expect) < 1.0);
        }
    }

    /// Données réelles (oct. 2026) : tracé `watch/trackmap` du jeu à Road
    /// Atlanta (allégé : 1 point sur 3) recalé sur le tracé appris en roulant
    /// et embarqué dans l'app. Chaque bucket doit retomber près du point appris.
    #[test]
    fn align_real_road_atlanta() {
        use std::collections::HashMap;
        let game: Vec<serde_json::Value> =
            serde_json::from_str(include_str!("testdata/road_atlanta_trackmap.json")).unwrap();
        let racing: Vec<[f64; 2]> = game
            .iter()
            .filter(|p| p["type"] == 0)
            .map(|p| [p["x"].as_f64().unwrap(), p["z"].as_f64().unwrap()])
            .collect();
        let poly = Polyline::closed(racing).unwrap();
        let learned: HashMap<String, [f64; 2]> =
            serde_json::from_str(include_str!("../data/tracks/michelin_raceway_road_atlanta.json")).unwrap();
        let learned: Vec<(f64, [f64; 2])> = learned
            .iter()
            .map(|(k, p)| (k.parse::<f64>().unwrap() * 20.0 + 10.0, *p))
            .collect();
        // `sessionInfo.lapDistance` relevé sur cette séance.
        let lap_len = 4083.45;
        let samples: Vec<([f64; 2], f64)> = learned.iter().step_by(17).map(|(d, p)| (*p, *d)).collect();
        let a = align(&poly, &samples, lap_len).expect("recalage");
        assert_eq!(a.dir, 1.0);
        let mut errs: Vec<f64> = learned.iter().map(|(d, p)| dist(poly.at(a.abscissa(*d)), *p)).collect();
        errs.sort_by(|x, y| x.total_cmp(y));
        let med = errs[errs.len() / 2];
        let p90 = errs[errs.len() * 9 / 10];
        assert!(med < 8.0 && p90 < 15.0, "médiane {med:.1} m, p90 {p90:.1} m");
    }

    #[test]
    fn align_refuses_poor_or_foreign_samples() {
        let p = Polyline::closed(circle(400.0, 600)).unwrap();
        let lap_len = p.length();
        // Trop peu d'étendue.
        let near: Vec<_> = [10.0, 20.0, 30.0, 40.0].iter().map(|&d| (p.at(d), d)).collect();
        assert!(align(&p, &near, lap_len).is_none());
        // Positions loin de la piste (autre circuit).
        let far: Vec<_> = samples(&p, 0.0, 1.0, lap_len).into_iter().map(|(q, d)| ([q[0] + 500.0, q[1]], d)).collect();
        assert!(align(&p, &far, lap_len).is_none());
        // Longueur de tour incompatible.
        assert!(align(&p, &samples(&p, 0.0, 1.0, lap_len), lap_len * 2.0).is_none());
    }
}
