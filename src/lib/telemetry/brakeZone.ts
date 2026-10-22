/**
 * Preuves d'une zone de freinage face au tour de référence (module pur) : où l'on
 * commence à freiner, vitesse mini, vitesse en sortie, et temps de la zone. Tout
 * vient des traces des deux tours, chacune sur son propre axe de distance.
 */

/** Seuil d'appui sur la pédale de frein (%) qui marque le début du freinage. */
export const BRAKE_ON_PCT = 5;
/** Mètres avant le point de freinage où l'on cherche celui de la référence. */
export const SEARCH_BEFORE_M = 150;
/** Mètres après l'apex où l'on lit la vitesse de sortie. */
export const EXIT_AFTER_M = 100;

export interface LapTrace {
  dist: number[];
  speed: number[];
  brake: number[];
}

export interface BrakeZoneEvidence {
  brakeDist: number;
  refBrakeDist: number | null;
  minSpeed: number;
  refMinSpeed: number | null;
  exitSpeed: number | null;
  refExitSpeed: number | null;
  /** Temps perdu (+) ou gagné (−) sur la zone (s). */
  zoneDelta: number | null;
}

/** Index du premier point à la distance `d` ou au-delà (distance croissante). */
function indexAt(dist: number[], d: number): number {
  let lo = 0;
  let hi = dist.length - 1;
  if (hi < 0) return -1;
  if (d > dist[hi]) return -1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dist[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function speedAt(t: LapTrace, d: number): number | null {
  const i = indexAt(t.dist, d);
  return i >= 0 && Number.isFinite(t.speed[i]) ? t.speed[i] : null;
}

/** Début du freinage de la référence dans la fenêtre [`from`, `to`] ; null s'il n'y en a pas. */
function brakeOnset(t: LapTrace, from: number, to: number): number | null {
  const a = indexAt(t.dist, Math.max(from, t.dist[0] ?? 0));
  if (a < 0) return null;
  for (let i = Math.max(a, 1); i < t.dist.length && t.dist[i] <= to; i++) {
    if (t.brake[i] >= BRAKE_ON_PCT && t.brake[i - 1] < BRAKE_ON_PCT) return t.dist[i];
  }
  return null;
}

/** Preuves d'un virage (`brakeDist`, `apexDist`, `minSpeed` du tour courant). */
export function brakeZoneEvidence(
  corner: { brakeDist: number; apexDist: number; minSpeed: number; refMinSpeed: number | null; timeLost: number | null },
  cur: LapTrace,
  ref: LapTrace | null,
): BrakeZoneEvidence {
  const exitAt = corner.apexDist + EXIT_AFTER_M;
  return {
    brakeDist: corner.brakeDist,
    refBrakeDist: ref ? brakeOnset(ref, corner.brakeDist - SEARCH_BEFORE_M, corner.apexDist) : null,
    minSpeed: corner.minSpeed,
    refMinSpeed: corner.refMinSpeed,
    exitSpeed: speedAt(cur, exitAt),
    refExitSpeed: ref ? speedAt(ref, exitAt) : null,
    zoneDelta: corner.timeLost,
  };
}
