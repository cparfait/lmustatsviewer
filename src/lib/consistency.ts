/**
 * Constance d'une session en un coup d'œil (module pur) : une pastille par tour
 * chronométré selon son écart au meilleur, et la phrase de progression
 * (« meilleur tour au tour N, X s de mieux que le premier tour lancé »).
 *
 * Tours retenus : valides, hors stands, chronométrés. Le tour 1 (départ arrêté ou
 * sortie des stands) n'est jamais le « premier tour lancé ».
 *
 * Meilleur tour de référence = même règle que le reste de l'appli (§3) : le plus
 * rapide des tours dont les 3 secteurs sont connus (sinon le plus rapide tout court).
 * Un tour plus rapide mais sans secteur complet compte comme « proche du meilleur ».
 */

export interface ConsistencyLap {
  lap_num: number;
  lap_time: number | null;
  is_pit: boolean | number;
  is_valid: boolean | number;
  s1?: number | null;
  s2?: number | null;
  s3?: number | null;
}

export type DotColor = "green" | "yellow" | "red";

/** Écart au meilleur (s) : vert jusqu'à `GREEN_S`, jaune jusqu'à `YELLOW_S`, rouge au-delà. */
export const GREEN_S = 0.8;
export const YELLOW_S = 1.6;

export interface ConsistencyDots {
  dots: { lap: number; gap: number; color: DotColor }[];
  green: number;
  total: number;
  best: number;
}

function timed(laps: ConsistencyLap[]): (ConsistencyLap & { lap_time: number })[] {
  return laps
    .filter((l): l is ConsistencyLap & { lap_time: number } => !!l.is_valid && !l.is_pit && l.lap_time != null && l.lap_time > 0)
    .sort((a, b) => a.lap_num - b.lap_num);
}

const complete = (l: ConsistencyLap) =>
  [l.s1, l.s2, l.s3].every((v) => v === undefined) || [l.s1, l.s2, l.s3].every((v) => v != null && v > 0);

/** Meilleur tour de référence (3 secteurs connus, sinon le plus rapide). */
function referenceBest<T extends ConsistencyLap & { lap_time: number }>(laps: T[]): T {
  const pool = laps.some(complete) ? laps.filter(complete) : laps;
  return pool.reduce((a, b) => (b.lap_time < a.lap_time ? b : a));
}

/** Pastilles par tour lancé (le tour 1 est écarté) ; null sous 2 tours. */
export function consistencyDots(laps: ConsistencyLap[]): ConsistencyDots | null {
  const ok = timed(laps).filter((l) => l.lap_num > 1);
  if (ok.length < 2) return null;
  const best = referenceBest(timed(laps)).lap_time;
  const dots = ok.map((l) => {
    const gap = l.lap_time - best;
    return { lap: l.lap_num, gap, color: (gap <= GREEN_S ? "green" : gap <= YELLOW_S ? "yellow" : "red") as DotColor };
  });
  return { dots, green: dots.filter((d) => d.color === "green").length, total: dots.length, best };
}

export interface Progression {
  bestLap: number;
  bestTime: number;
  /** Premier tour lancé (après le tour 1) et son chrono ; null si c'est déjà le meilleur. */
  firstLap: number | null;
  /** Gain du premier tour lancé au meilleur (s, > 0). */
  gain: number | null;
}

/** Où et de combien le pilote a progressé dans la session ; null sans tour lancé. */
export function progression(laps: ConsistencyLap[]): Progression | null {
  const ok = timed(laps);
  if (ok.length === 0) return null;
  const best = referenceBest(ok);
  const first = ok.find((l) => l.lap_num > 1);
  if (!first || first.lap_num >= best.lap_num) {
    return { bestLap: best.lap_num, bestTime: best.lap_time, firstLap: null, gain: null };
  }
  const gain = first.lap_time - best.lap_time;
  return { bestLap: best.lap_num, bestTime: best.lap_time, firstLap: first.lap_num, gain: gain > 0 ? gain : null };
}
