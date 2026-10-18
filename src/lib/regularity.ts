/**
 * Régularité d'un pilote sur une séance (module pur) : à quel point ses tours valides
 * restent proches de son meilleur, et quel secteur varie le plus.
 */
import type { ResultRow, SessionInfo } from "@/lib/api";

export interface RegularityLap {
  lap_time: number | null;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  is_pit: boolean | number;
  is_valid: boolean | number;
}

export interface Regularity {
  laps: number;
  best: number;
  mean: number;
  median: number;
  /** Écart-type des tours (s). */
  stdDev: number;
  /** Part des tours à moins de 0,3 / 0,5 / 1 s du meilleur (0 → 1). */
  within: { "0.3": number; "0.5": number; "1.0": number };
  /** Écart-type par secteur (null si les secteurs manquent). */
  sectorStd: [number | null, number | null, number | null];
  /** Secteur le plus stable / le moins stable (1, 2 ou 3), si connus. */
  stableSector: number | null;
  unstableSector: number | null;
}

/** Bornes d'un tour exploitable (exclut les tours ralentis : drapeau, incident). */
const SLOW_FACTOR = 1.07;

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/**
 * `null` sous 3 tours valides. Les tours plus lents que 107 % du meilleur (drapeau
 * jaune, incident, trafic) sont écartés : ils ne disent rien de la régularité.
 */
export function computeRegularity(laps: RegularityLap[]): Regularity | null {
  const valid = laps.filter((l) => !!l.is_valid && !l.is_pit && l.lap_time != null && l.lap_time > 0) as (RegularityLap & { lap_time: number })[];
  if (valid.length < 3) return null;
  const best = Math.min(...valid.map((l) => l.lap_time));
  const kept = valid.filter((l) => l.lap_time <= best * SLOW_FACTOR);
  if (kept.length < 3) return null;
  const times = kept.map((l) => l.lap_time).sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const mid = Math.floor(times.length / 2);
  const median = times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2;
  const share = (d: number) => times.filter((t) => t - best < d).length / times.length;
  const sectorStd = ([1, 2, 3] as const).map((n) => {
    const xs = kept.map((l) => l[`s${n}`]).filter((v): v is number => v != null && v > 0);
    return xs.length >= 3 ? std(xs) : null;
  }) as [number | null, number | null, number | null];
  const known = sectorStd.map((v, i) => ({ v, n: i + 1 })).filter((x): x is { v: number; n: number } => x.v != null);
  const sorted = [...known].sort((a, b) => a.v - b.v);
  return {
    laps: kept.length,
    best,
    mean,
    median,
    stdDev: std(times),
    within: { "0.3": share(0.3), "0.5": share(0.5), "1.0": share(1.0) },
    sectorStd,
    stableSector: sorted.length >= 2 ? sorted[0].n : null,
    unstableSector: sorted.length >= 2 ? sorted[sorted.length - 1].n : null,
  };
}

/** Aides d'un pilote (texte brut `ControlAndAids` du XML). */
export function parseAids(raw: string): { brakeHelp: boolean; steerHelp: boolean; autoShift: boolean; tc: number | null } {
  const lower = (raw || "").toLowerCase().replace(/\s+/g, "");
  const tc = lower
    .split(",")
    .map((p) => (p.startsWith("tc=") ? Number(p.slice(3)) : NaN))
    .find((v) => Number.isFinite(v));
  return {
    brakeHelp: lower.includes("brakinghelp") || lower.includes("brakehelp"),
    steerHelp: lower.includes("steeringhelp") || lower.includes("steerhelp"),
    autoShift: lower.includes("autoshift"),
    tc: tc ?? null,
  };
}

/** Critères d'une séance « comparable » (tours confrontables à ceux des autres). */
export function comparability(session: Pick<SessionInfo, "setting" | "dedicated">, player: Pick<ResultRow, "control_aids"> | null) {
  const aids = parseAids(player?.control_aids ?? "");
  const online = session.setting === "Multiplayer";
  const dedicated = session.dedicated === 1 ? true : session.dedicated === 0 ? false : null;
  const cleanAids = !aids.brakeHelp && !aids.steerHelp;
  return { online, dedicated, cleanAids, ok: online && dedicated !== false && cleanAids };
}
