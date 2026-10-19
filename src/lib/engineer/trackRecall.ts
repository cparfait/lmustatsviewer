/**
 * Mémoire du circuit (sans IA) : à l'arrivée sur un tracé déjà roulé avec cette classe,
 * une réplique courte — la dernière course ici et ton record, puis LA chose la plus
 * utile (le secteur qui coûtait le plus, sinon le chrono des premiers). Rien de connu →
 * silence (on ne meuble pas).
 *
 * Rangé par **tracé** (`track_course` : Bahrain Outer ≠ Bahrain International) et par
 * classe. Les courses quittées en route (≥ 2 tours) comptent : le fichier de résultats du
 * jeu les garde. Les mêmes faits (temps perdu par arrêt mesuré, chrono des premiers,
 * record) sont joints au coach vocal (`trackHistoryBlock`).
 */

import { queries, type BestLapRow, type CareerRace } from "@/lib/api";
import { debriefOf } from "@/lib/debrief/load";
import { radioClass } from "./text";
import type { Pick } from "./debriefRadio";
import type { Tr } from "@/i18n";

/** Tours minimum pour qu'une course quittée compte. */
export const MIN_LAPS = 2;
/** Courses relues pour la perte au stand mesurée. */
const PIT_SAMPLES = 5;

function plain(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Le tracé du direct est-il celui de la ligne de la base ? (tracé, sinon lieu) */
export function sameCourse(live: string, row: { track: string; track_course: string }): boolean {
  const l = plain(live);
  if (!l) return false;
  return l === plain(row.track_course) || (!row.track_course && l === plain(row.track));
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface TrackHistory {
  track: string;
  carClass: string;
  lastRace: { classPos: number | null; classCount: number | null; laps: number; finished: boolean; timestamp: number } | null;
  record: number | null;
  /** Meilleur tour de la classe lors de la dernière course ici. */
  frontLap: number | null;
  /** Secteur qui coûtait le plus lors de la dernière course ici (famille `weakSector`). */
  weakSector: number | null;
  /** Temps perdu par arrêt, médiane mesurée sur les dernières courses ici (s). */
  pitLossS: number | null;
  /** Usure des pneus par tour au dernier relais, médiane des dernières courses ici (%). */
  wearPctPerLap: number | null;
}

let last: TrackHistory | null = null;

/** Historique du tracé pour cette classe (null si rien n'est connu). */
export async function loadTrackHistory(track: string, carClass: string): Promise<TrackHistory | null> {
  const cls = radioClass(carClass);
  const [races, bests] = await Promise.all([
    queries.getCareerRaces().catch(() => [] as CareerRace[]),
    queries.getBestLaps().catch(() => [] as BestLapRow[]),
  ]);
  const here = races
    .filter((r) => sameCourse(track, r) && radioClass(r.car_class) === cls && r.laps >= MIN_LAPS)
    .sort((a, b) => a.timestamp - b.timestamp);
  const recs = bests.filter((b) => sameCourse(track, b) && radioClass(b.car_class) === cls && b.best_lap > 0);
  const record = recs.length ? Math.min(...recs.map((b) => b.best_lap)) : null;
  const lastRow = here[here.length - 1] ?? null;
  const d = lastRow ? await debriefOf(lastRow.session_id) : null;
  const losses: number[] = [];
  const wears: number[] = [];
  for (const r of here.slice(-PIT_SAMPLES)) {
    const x = r.session_id === lastRow?.session_id ? d : await debriefOf(r.session_id);
    if (x?.pitLossS != null) losses.push(x.pitLossS);
    if (x?.lastStintWearPct != null) wears.push(x.lastStintWearPct);
  }
  const weak = d?.families.find((f) => f.family === "weakSector");
  const h: TrackHistory = {
    track,
    carClass: cls,
    lastRace: lastRow
      ? {
          classPos: lastRow.class_position > 0 ? lastRow.class_position : null,
          classCount: lastRow.class_size > 0 ? lastRow.class_size : null,
          laps: lastRow.laps,
          finished: /finished/i.test(lastRow.finish_status),
          timestamp: lastRow.timestamp,
        }
      : null,
    record,
    frontLap: d?.classBestLap ?? null,
    weakSector: weak ? Number(weak.facts.sector) : null,
    pitLossS: median(losses),
    wearPctPerLap: median(wears),
  };
  if (!h.lastRace && h.record == null) return null;
  last = h;
  return h;
}

/** Dernier historique chargé (pour le contexte du coach vocal). */
export function lastTrackHistory(): TrackHistory | null {
  return last;
}

/** La réplique d'arrivée (une à deux phrases), ou null si rien de connu. */
export function recallPhrase(h: TrackHistory, t: Tr, lapVoice: (s: number) => string, pick: Pick): string | null {
  const say = (key: string, vars?: Record<string, unknown>) => pick(key, t(key, vars));
  const first: string[] = [];
  const lr = h.lastRace;
  if (lr && !lr.finished) first.push(say("live.vRecallQuit", { lap: lr.laps }));
  else if (lr && lr.classPos != null && lr.classCount != null)
    first.push(say("live.vRecallLast", { p: lr.classPos, n: lr.classCount }));
  if (h.record != null) first.push(say("live.vRecallRecord", { time: lapVoice(h.record) }));
  if (!first.length) return null;
  const out = [`${say("live.vRecallIntro")} ${first.join(", ")}.`];
  if (h.weakSector != null) out.push(say("live.vRecallSector", { s: h.weakSector }));
  else if (h.frontLap != null && (h.record == null || h.frontLap < h.record - 0.05))
    out.push(say("live.vRecallFront", { time: lapVoice(h.frontLap) }));
  return out.join(" ");
}

/** Bloc joint au coach vocal : ce que l'app sait de ce tracé (chiffres mesurés). */
export function trackHistoryBlock(h: TrackHistory | null, track: string): string {
  if (!h || plain(h.track) !== plain(track)) return "";
  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, "0")}`;
  const L = [`## History on this track (${h.carClass}, measured by the app)`];
  if (h.record != null) L.push(`Personal record here: ${fmt(h.record)}`);
  if (h.lastRace)
    L.push(
      `Last race here: ${h.lastRace.finished ? `P${h.lastRace.classPos ?? "?"}/${h.lastRace.classCount ?? "?"} in class` : `left after ${h.lastRace.laps} laps`}`,
    );
  if (h.frontLap != null) L.push(`Class best lap in that race: ${fmt(h.frontLap)}`);
  if (h.weakSector != null) L.push(`Sector that cost the most then: S${h.weakSector}`);
  if (h.pitLossS != null) L.push(`Measured time lost per pit stop here: about ${h.pitLossS.toFixed(1)} s`);
  if (h.wearPctPerLap != null) L.push(`Measured tyre wear per lap here (last stints): about ${h.wearPctPerLap.toFixed(2)}% of rubber`);
  return L.length > 1 ? L.join("\n") : "";
}
