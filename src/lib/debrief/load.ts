/**
 * Chargement des débriefs des dernières courses (défaut récurrent, rappel du circuit).
 *
 * Chaque course est relue une fois (`getSessionDetail`) puis gardée en mémoire : le
 * débrief d'une session indexée ne change pas.
 */

import { queries, type CareerRace } from "@/lib/api";
import { computeDebrief, type Debrief } from "./compute";
import { recurringDefect, WINDOW, type RaceFamilies, type RecurringDefect } from "./recurring";

const cache = new Map<number, Debrief | null>();

/** Débrief d'une session (mis en cache). */
export async function debriefOf(sessionId: number): Promise<Debrief | null> {
  if (cache.has(sessionId)) return cache.get(sessionId)!;
  const detail = await queries.getSessionDetail(sessionId).catch(() => null);
  const d = detail ? computeDebrief(detail) : null;
  cache.set(sessionId, d);
  return d;
}

/** Dernières courses du joueur (plus récente en dernier). */
export async function recentRaces(limit = 2 * WINDOW): Promise<CareerRace[]> {
  const races = await queries.getCareerRaces().catch(() => [] as CareerRace[]);
  return [...races].sort((a, b) => a.timestamp - b.timestamp).slice(-limit);
}

/** Familles de défaut des dernières courses, et le défaut qui revient. */
export async function loadRecurring(): Promise<{ races: number; defect: RecurringDefect | null }> {
  const races = await recentRaces();
  const rows: RaceFamilies[] = [];
  for (const r of races) {
    const d = await debriefOf(r.session_id);
    if (d) rows.push({ sessionId: r.session_id, timestamp: r.timestamp, track: r.track_course || r.track, families: d.families });
  }
  return { races: rows.length, defect: recurringDefect(rows) };
}
