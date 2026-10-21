/**
 * Sonde d'équilibre par virage (module pur) — base du bilan au box (Atelier, opt-in).
 *
 * Mesure : dérive moyenne des roues avant − dérive moyenne des roues arrière
 * (`LiveWheel.slip_angle`, degrés). Positif = l'avant glisse plus = sous-virage,
 * négatif = survirage. Chaque voiture a un équilibre « normal » qui lui est
 * propre : on compare chaque virage et chaque phase à la **médiane du pilote**
 * sur le relais, jamais à un absolu.
 *
 * Virages : zones où la voiture dérive (dérive moyenne ≥ 1°, > 50 km/h), sans
 * géométrie du tracé ; les zones voisines (< 25 m) sont fusionnées, les zones
 * trop courtes (< 25 m) ignorées. Repère du virage = point le plus lent (apex),
 * rapproché d'un tour à l'autre à ± 60 m. Phases : avant l'apex sur les freins =
 * entrée, après l'apex sur les gaz (≥ 50 %) = sortie, le reste = milieu.
 *
 * Un défaut n'est retenu que s'il est vu sur au moins 2 tours, dans le même
 * sens sur au moins deux tiers d'entre eux, et à plus de `MIN_DEV_DEG` de la
 * médiane. Le plus marqué l'emporte.
 */

import type { Phase, Regime } from "@/lib/setupAssistant";

export interface ProbeSample {
  /** Distance-tour (m). */
  dist: number;
  /** km/h */
  speed: number;
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  /** Dérive moyenne des roues avant (°). */
  front: number;
  /** Dérive moyenne des roues arrière (°). */
  rear: number;
}

export interface ProbeLap {
  samples: ProbeSample[];
}

export interface BalanceFinding {
  symptom: "understeer" | "oversteer";
  phase: Phase;
  regime: Regime;
  /** Distance-tour de l'apex (m). */
  dist: number;
  /** Vitesse à l'apex (km/h, médiane des tours). */
  apexSpeed: number;
  /** Tours où ce virage a été mesuré. */
  laps: number;
  /** Écart à la médiane du pilote (°, signé : + = sous-virage). */
  deviation: number;
}

export interface BalanceReport {
  /** Tours exploités. */
  laps: number;
  /** Couples virage × phase mesurés sur ≥ 2 tours. */
  measured: number;
  /** Équilibre de référence du pilote (°). */
  baseline: number;
  /** Pire défaut, `null` = voiture équilibrée. */
  worst: BalanceFinding | null;
}

export const CORNER_SLIP_DEG = 1;
const MIN_SPEED_KMH = 50;
const MERGE_M = 25;
const MIN_LEN_M = 25;
const MATCH_M = 60;
export const MIN_DEV_DEG = 1;
/** Sous cette vitesse d'apex : virage lent (mécanique), au-dessus : rapide (aéro). */
export const SLOW_FAST_KMH = 140;
export const MIN_LAPS = 2;

interface Segment {
  from: number;
  to: number; // indices inclus
}

function cornerSegments(s: ProbeSample[]): Segment[] {
  const raw: Segment[] = [];
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    const x = s[i];
    const turning = x.speed > MIN_SPEED_KMH && (x.front + x.rear) / 2 >= CORNER_SLIP_DEG;
    if (turning && start < 0) start = i;
    if (!turning && start >= 0) {
      raw.push({ from: start, to: i - 1 });
      start = -1;
    }
  }
  if (start >= 0) raw.push({ from: start, to: s.length - 1 });
  const merged: Segment[] = [];
  for (const g of raw) {
    const last = merged[merged.length - 1];
    if (last && s[g.from].dist - s[last.to].dist < MERGE_M) last.to = g.to;
    else merged.push({ ...g });
  }
  return merged.filter((g) => s[g.to].dist - s[g.from].dist >= MIN_LEN_M);
}

function median(v: number[]): number {
  if (!v.length) return 0;
  const a = [...v].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function mean(v: number[]): number {
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/** Phase d'un échantillon d'après sa place autour de l'apex. */
export function phaseOf(x: ProbeSample, beforeApex: boolean): Phase {
  if (beforeApex) return x.brake > 0.05 ? "entry" : "mid";
  return x.throttle >= 0.5 ? "exit" : "mid";
}

interface CornerAcc {
  dist: number;
  speeds: number[];
  /** Phase → équilibre moyen de chaque tour. */
  byPhase: Record<Phase, number[]>;
}

/** Bilan d'équilibre sur des tours mesurés (déjà filtrés : sans stands). */
export function analyzeBalance(laps: ProbeLap[]): BalanceReport {
  const corners: CornerAcc[] = [];
  let used = 0;
  for (const lap of laps) {
    const s = lap.samples;
    if (s.length < 50) continue;
    used++;
    for (const g of cornerSegments(s)) {
      let apex = g.from;
      for (let i = g.from; i <= g.to; i++) if (s[i].speed < s[apex].speed) apex = i;
      const acc: Record<Phase, number[]> = { entry: [], mid: [], exit: [] };
      for (let i = g.from; i <= g.to; i++) {
        const x = s[i];
        acc[phaseOf(x, i < apex)].push(x.front - x.rear);
      }
      const d = s[apex].dist;
      let c = corners.find((k) => Math.abs(k.dist - d) <= MATCH_M);
      if (!c) {
        c = { dist: d, speeds: [], byPhase: { entry: [], mid: [], exit: [] } };
        corners.push(c);
      }
      c.speeds.push(s[apex].speed);
      for (const ph of ["entry", "mid", "exit"] as Phase[]) if (acc[ph].length >= 3) c.byPhase[ph].push(mean(acc[ph]));
    }
  }

  const cells: { c: CornerAcc; phase: Phase; values: number[]; value: number }[] = [];
  for (const c of corners)
    for (const phase of ["entry", "mid", "exit"] as Phase[]) {
      const values = c.byPhase[phase];
      if (values.length >= MIN_LAPS) cells.push({ c, phase, values, value: mean(values) });
    }
  const baseline = median(cells.map((x) => x.value));
  let worst: BalanceFinding | null = null;
  for (const cell of cells) {
    const dev = cell.value - baseline;
    if (Math.abs(dev) < MIN_DEV_DEG) continue;
    const same = cell.values.filter((v) => Math.sign(v - baseline) === Math.sign(dev)).length;
    if (same * 3 < cell.values.length * 2) continue;
    if (worst && Math.abs(worst.deviation) >= Math.abs(dev)) continue;
    const apexSpeed = median(cell.c.speeds);
    worst = {
      symptom: dev > 0 ? "understeer" : "oversteer",
      phase: cell.phase,
      regime: apexSpeed < SLOW_FAST_KMH ? "slow" : "fast",
      dist: Math.round(cell.c.dist),
      apexSpeed: Math.round(apexSpeed),
      laps: cell.values.length,
      deviation: Math.round(dev * 10) / 10,
    };
  }
  return { laps: used, measured: cells.length, baseline: Math.round(baseline * 100) / 100, worst };
}

/** Normalisation « contient » sans espaces ni séparateurs (comme la recherche des setups). */
export function loose(s: string): string {
  return s.toLowerCase().replace(/[\s_\-.]/g, "");
}

/** Le dossier circuit d'un setup correspond-il au circuit en cours ? (contient, dans les deux sens) */
export function circuitMatches(folder: string, track: string): boolean {
  const a = loose(folder);
  const b = loose(track);
  return !!a && !!b && (a.includes(b) || b.includes(a));
}

/**
 * La voiture d'un setup (« Ferrari 499P ») correspond-elle à la voiture en piste
 * (nom de la livrée, classe) ? Contient dans les deux sens, sinon un repère de
 * modèle (jeton avec un chiffre : « 499P », « 963 », « GR010 ») présent des deux côtés.
 */
export function carMatches(setupCar: string, liveNames: string[]): boolean {
  const a = loose(setupCar);
  if (!a) return false;
  const models = setupCar
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter((tk) => /\d/.test(tk) && tk.length >= 3);
  return liveNames.some((n) => {
    const b = loose(n);
    if (!b) return false;
    if (a.includes(b) || b.includes(a)) return true;
    return models.some((m) => b.includes(m));
  });
}
