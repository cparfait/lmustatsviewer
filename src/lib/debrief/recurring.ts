/**
 * Défaut **récurrent** sur les dernières courses (module pur).
 *
 * Lit les familles de défaut de chaque course (`compute.ts`) et retient celle qui revient
 * le plus : au moins `MIN_RACES` courses débriefées, au moins `MIN_OCCURRENCES` fois et
 * `MIN_SHARE` des courses. Égalité : ordre fixe de la liste fermée (deux calculs sur les
 * mêmes courses nomment le même défaut). La **tendance** ne se dit qu'avec deux fenêtres
 * pleines de `WINDOW` courses (comparer 5 courses à 2 n'est pas une comparaison).
 */

import { DEFECT_FAMILIES, type DefectFact, type DefectFamily } from "./compute";

export const MIN_RACES = 5;
export const MIN_OCCURRENCES = 3;
export const MIN_SHARE = 0.3;
export const WINDOW = 5;
/** Écart de part (points) en dessous duquel on parle de stagnation. */
export const TREND_DELTA = 0.2;

export interface RaceFamilies {
  sessionId: number;
  timestamp: number;
  track: string;
  families: DefectFact[];
}

export interface RecurringDefect {
  family: DefectFamily;
  occurrences: number;
  races: number;
  share: number;
  trend: "improving" | "stable" | "worsening" | null;
  /** Courses où il a été vu (les plus récentes), pour relire le constat. */
  evidence: { sessionId: number; timestamp: number; track: string; facts: DefectFact["facts"] }[];
}

const has = (r: RaceFamilies, f: DefectFamily) => r.families.some((x) => x.family === f);

/** Défaut récurrent sur les `2 × WINDOW` dernières courses (ordre chronologique attendu). */
export function recurringDefect(races: RaceFamilies[]): RecurringDefect | null {
  const recent = [...races].sort((a, b) => a.timestamp - b.timestamp).slice(-2 * WINDOW);
  const n = recent.length;
  if (n < MIN_RACES) return null;
  let best: { f: DefectFamily; occ: number } | null = null;
  for (const f of DEFECT_FAMILIES) {
    const occ = recent.filter((r) => has(r, f)).length;
    if (!best || occ > best.occ) best = { f, occ };
  }
  if (!best || best.occ < MIN_OCCURRENCES || best.occ / n < MIN_SHARE) return null;
  let trend: RecurringDefect["trend"] = null;
  if (n >= 2 * WINDOW) {
    const before = recent.slice(0, WINDOW).filter((r) => has(r, best!.f)).length / WINDOW;
    const after = recent.slice(-WINDOW).filter((r) => has(r, best!.f)).length / WINDOW;
    const d = after - before;
    trend = d <= -TREND_DELTA ? "improving" : d >= TREND_DELTA ? "worsening" : "stable";
  }
  const evidence = recent
    .filter((r) => has(r, best!.f))
    .slice(-WINDOW)
    .map((r) => ({
      sessionId: r.sessionId,
      timestamp: r.timestamp,
      track: r.track,
      facts: r.families.find((x) => x.family === best!.f)!.facts,
    }));
  return { family: best.f, occurrences: best.occ, races: n, share: best.occ / n, trend, evidence };
}

/** Texte compact pour l'analyse IA. */
export function recurringContextText(r: RecurringDefect | null): string {
  if (!r) return "";
  return [
    "## Recurring weakness across recent races (computed by the app)",
    `${r.family}: seen in ${r.occurrences} of the last ${r.races} debriefed races (${Math.round(r.share * 100)}%)` +
      (r.trend ? ` · trend over two windows of ${WINDOW} races: ${r.trend}` : ""),
  ].join("\n");
}
