/**
 * Géométrie des cartes de circuit (module pur, partagé page Live + overlay).
 *
 * Le tracé arrive en points indexés par la distance-tour (`track_dists`,
 * buckets de 20 m). Un tracé encore incomplet a des trous : on ne les relie
 * plus par une corde (fausse ligne droite à travers l'infield), on découpe en
 * tronçons. Les bornes de secteurs (`sector_dists`) découpent le tour en
 * S1 / S2 / S3 pour les repères et la coloration des secteurs sous jaune.
 */

export type Pt = [number, number];

/** Écart de distance (m) au-delà duquel deux buckets voisins ne sont pas reliés. */
export const GAP_M = 45;

/**
 * Tronçons continus d'indices `[début, fin]` (inclus). `closed` : le tracé
 * fait le tour complet (premier et dernier buckets jointifs par la ligne).
 * Un tronçon qui passe la ligne est rendu d'un seul tenant (fin → début).
 */
export function splitRuns(dists: number[], lapLen: number, gap = GAP_M): { runs: [number, number][]; closed: boolean } {
  const n = dists.length;
  if (n === 0) return { runs: [], closed: false };
  const runs: [number, number][] = [];
  let start = 0;
  for (let i = 1; i < n; i++) {
    if (dists[i] - dists[i - 1] > gap) {
      runs.push([start, i - 1]);
      start = i;
    }
  }
  runs.push([start, n - 1]);
  const wraps = lapLen > 0 && dists[0] + (lapLen - dists[n - 1]) <= gap;
  if (wraps && runs.length === 1) return { runs, closed: true };
  if (wraps && runs.length > 1) {
    // Le dernier tronçon se prolonge dans le premier : on les fusionne.
    const last = runs.pop()!;
    const first = runs.shift()!;
    runs.push([last[0], first[1] + n]); // indice > n = retour au début
  }
  return { runs, closed: false };
}

/** Indices d'un tronçon (gère le passage de la ligne : indices modulo n). */
export function runIndices(run: [number, number], n: number): number[] {
  const out: number[] = [];
  for (let i = run[0]; i <= run[1]; i++) out.push(i % n);
  return out;
}

/** Chemins SVG du tracé, tronçon par tronçon (fermé par Z si tour complet). */
export function trackPaths(pts: Pt[], dists: number[], lapLen: number, project: (p: Pt) => Pt): string[] {
  if (pts.length < 2 || dists.length !== pts.length) {
    // Sans distances (ancien format) : un seul polygone, comme avant.
    return pts.length >= 2 ? [pathOf(pts.map(project), true)] : [];
  }
  const { runs, closed } = splitRuns(dists, lapLen);
  return runs
    .map((r) => runIndices(r, pts.length))
    .filter((idx) => idx.length >= 2)
    .map((idx) => pathOf(idx.map((i) => project(pts[i])), closed));
}

export function pathOf(screen: Pt[], close: boolean): string {
  return screen.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + (close ? " Z" : "");
}

/** Saut (m, coordonnées du monde) au-delà duquel une polyligne ouverte est coupée. */
export const OPEN_GAP_M = 60;

/**
 * Chemin SVG d'une polyligne ouverte coupée à chaque saut > `gap` (un « M » par
 * tronçon). Relevé réel (Road Atlanta, 2026-10-16) : la voie des stands du jeu
 * arrive en deux tronçons séparés de 540 m, impossibles à recoller (bouts les
 * plus proches à 261 m) ; reliés, ils dessinaient une corde en travers du circuit.
 */
export function pathOfRuns(world: Pt[], project: (p: Pt) => Pt, gap = OPEN_GAP_M): string {
  return world
    .map((p, i) => {
      const q = world[i - 1];
      const jump = i === 0 || Math.hypot(p[0] - q[0], p[1] - q[1]) > gap;
      const [x, y] = project(p);
      return `${jump ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Secteur (0 = S1, 1 = S2, 2 = S3) d'une distance-tour selon les bornes connues. */
export function sectorOf(d: number, bounds: number[]): 0 | 1 | 2 {
  if (bounds.length >= 1 && d < bounds[0]) return 0;
  if (bounds.length >= 2 && d < bounds[1]) return 1;
  return bounds.length >= 2 ? 2 : bounds.length === 1 ? 1 : 0;
}

/** Indice du point le plus proche d'une distance-tour. */
export function nearestIndex(dists: number[], d: number): number {
  let best = -1;
  let bestErr = Infinity;
  for (let i = 0; i < dists.length; i++) {
    const e = Math.abs(dists[i] - d);
    if (e < bestErr) {
      bestErr = e;
      best = i;
    }
  }
  return bestErr <= GAP_M ? best : -1;
}

/**
 * Points de chaque secteur (pour colorer un secteur sous drapeau jaune).
 * Exige les deux bornes (sinon les secteurs ne sont pas connus) et un tracé
 * complet ; renvoie trois listes de points dans l'ordre de course.
 */
export function sectorPolylines(pts: Pt[], dists: number[], bounds: number[]): [Pt[], Pt[], Pt[]] | null {
  if (bounds.length < 2 || pts.length !== dists.length || pts.length < 10) return null;
  const out: [Pt[], Pt[], Pt[]] = [[], [], []];
  for (let i = 0; i < pts.length; i++) out[sectorOf(dists[i], bounds)].push(pts[i]);
  // Raccord : chaque secteur se prolonge jusqu'au premier point du suivant.
  for (let s = 0; s < 3; s++) {
    const next = out[(s + 1) % 3][0];
    if (next) out[s].push(next);
  }
  return out;
}

/** Part du tour couverte par le tracé (0-1), d'après les buckets de 20 m. */
export function coverage(dists: number[], lapLen: number): number {
  if (!(lapLen > 0)) return 0;
  return Math.min(1, (dists.length * 20) / lapLen);
}

/** Le tracé est assez complet pour être figé (overlay) : ≥ 95 % et sans trou. */
export function mapComplete(dists: number[], lapLen: number): boolean {
  if (coverage(dists, lapLen) < 0.95) return false;
  return splitRuns(dists, lapLen).closed;
}
