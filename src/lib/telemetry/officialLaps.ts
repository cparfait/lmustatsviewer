/**
 * Tours d'un enregistrement télémétrie vus avec les chronos **officiels** du jeu
 * (module pur). Le découpage par le compteur `Lap` donne des segments dont la durée
 * n'est pas le chrono : le tour de sortie inclut l'attente sur la grille ou au stand,
 * le dernier segment s'arrête avant la ligne. Le jeu, lui, pose le chrono exact de
 * chaque tour bouclé (0 = tour annulé), le même que dans le fichier de résultats.
 *
 * Tours de pause : un tour beaucoup plus long que les autres (pause, menu, retour au
 * garage) fausse les moyennes. Règle : médiane des tours (hors premier), moyenne des
 * tours ≤ 2 × médiane, et tout tour > 3 × cette moyenne est écarté.
 */
import type { TelemetryLapInfo } from "@/lib/api";

/** Au-delà de ce multiple de la moyenne des tours normaux, le tour est une pause. */
export const PAUSE_FACTOR = 3;
/** Tours retenus pour la moyenne de référence : ≤ ce multiple de la médiane. */
export const PAUSE_TIGHT_FACTOR = 2;
/** Sous ce nombre de tours, pas assez de recul pour parler de pause. */
export const PAUSE_MIN_LAPS = 3;

export type OfficialLapStatus = "valid" | "invalid" | "pause" | "partial";

/** Temps de référence d'un tour : chrono officiel, sinon durée du segment. */
export function lapSeconds(l: TelemetryLapInfo): number {
  return l.game_time != null && l.game_time > 0 ? l.game_time : l.duration;
}

/** Numéros des tours de pause (règle médiane / 2× / 3×), sur les tours bouclés. */
export function pauseLaps(laps: TelemetryLapInfo[]): Set<number> {
  const closed = laps.filter((l) => l.valid != null);
  const pool = closed.slice(1).map(lapSeconds).filter((s) => s > 0);
  const out = new Set<number>();
  if (pool.length < PAUSE_MIN_LAPS) return out;
  const sorted = [...pool].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const tight = pool.filter((s) => s <= median * PAUSE_TIGHT_FACTOR);
  const mean = tight.length ? tight.reduce((a, b) => a + b, 0) / tight.length : median;
  for (const l of closed) if (lapSeconds(l) > mean * PAUSE_FACTOR) out.add(l.lap);
  return out;
}

/** Statut de chaque tour : valide, annulé par le jeu, pause, ou partiel (non bouclé). */
export function lapStatuses(laps: TelemetryLapInfo[]): Map<number, OfficialLapStatus> {
  const pauses = pauseLaps(laps);
  const out = new Map<number, OfficialLapStatus>();
  for (const l of laps) {
    out.set(l.lap, l.valid == null ? "partial" : pauses.has(l.lap) ? "pause" : l.valid ? "valid" : "invalid");
  }
  return out;
}

/**
 * Meilleur tour au chrono officiel, parmi les tours valides hors pause : même règle que
 * les résultats (§3), les tours aux 3 secteurs connus d'abord ; à défaut (fichier sans
 * secteurs), le plus rapide des tours valides. null sinon.
 */
export function fastestOfficialLap(laps: TelemetryLapInfo[]): TelemetryLapInfo | null {
  const st = lapStatuses(laps);
  const ok = laps.filter((l) => st.get(l.lap) === "valid" && l.game_time != null);
  const complete = ok.filter((l) => l.s1 != null && l.s2 != null && l.s3 != null);
  const pool = complete.length ? complete : ok;
  return pool.reduce<TelemetryLapInfo | null>((b, l) => (!b || (l.game_time ?? Infinity) < (b.game_time ?? Infinity) ? l : b), null);
}

/** Vrai si l'enregistrement porte des chronos officiels (fichiers du jeu récents). */
export function hasOfficialTimes(laps: TelemetryLapInfo[]): boolean {
  return laps.some((l) => l.valid != null);
}
