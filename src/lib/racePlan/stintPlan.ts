/**
 * Feuille de relais d'une course d'endurance (module pur).
 *
 * Découpe la course en relais à autonomie pleine (le dernier, plus court, va
 * jusqu'au damier), compte la perte au stand dans le temps de course, place les
 * changements de pneus (tous les N relais) et répartit les pilotes :
 *  - `rotate`  : rotation stricte, `perDriver` relais d'affilée (doubles par défaut) ;
 *  - `balance` : le pilote le moins chargé prend le bloc suivant.
 * Un relais peut être épinglé à un pilote (`pins`). Le temps de volant maximal
 * est signalé, jamais corrigé tout seul (c'est au pilote de décider).
 */

import { isNight } from "./sun";

export interface PlanInput {
  /** Durée de course (s). */
  raceS: number;
  /** Heure locale du départ (heures décimales, ex. 15.5). */
  startHour: number;
  /** Tour de référence (s). */
  lapS: number;
  /** Tours par relais à autonomie pleine. */
  stintLaps: number;
  /** Perte d'un arrêt (s), comptée dans le temps de course. */
  pitLossS: number;
  drivers: string[];
  mode: "rotate" | "balance";
  /** Relais d'affilée par pilote (rotation) ou au plus (équilibrage). */
  perDriver: number;
  /** Pneus changés tous les N relais (1 = à chaque arrêt). */
  tyreEvery: number;
  /** Temps de volant maximal par pilote (s), null = sans limite. */
  maxDriveS: number | null;
  sun: { rise: number; set: number } | null;
  /** Relais épinglés : index → pilote. */
  pins?: Record<number, string>;
}

export interface Stint {
  index: number;
  driver: string;
  startS: number;
  endS: number;
  laps: number;
  /** Pneus neufs au début de ce relais (l'arrêt qui le précède). */
  newTyres: boolean;
  /** Plus de la moitié du relais se court de nuit. */
  night: boolean;
  /** Dernier relais (plein partiel jusqu'au damier). */
  last: boolean;
}

export interface Plan {
  stints: Stint[];
  stops: number;
  /** Temps de volant par pilote (s). */
  driveS: Record<string, number>;
  /** Pilotes au-delà du temps de volant maximal. */
  overLimit: string[];
}

/** Garde-fou : jamais plus de relais que ça (saisie absurde). */
const MAX_STINTS = 200;

function nightShare(startS: number, endS: number, startHour: number, sun: { rise: number; set: number }): number {
  const step = 60;
  let n = 0;
  let tot = 0;
  for (let t = startS; t < endS; t += step) {
    tot++;
    if (isNight(startHour + t / 3600, sun)) n++;
  }
  return tot ? n / tot : 0;
}

export function planStints(i: PlanInput): Plan | null {
  if (!(i.raceS > 0 && i.lapS > 0 && i.stintLaps >= 1) || !i.drivers.length) return null;
  const stintS = i.stintLaps * i.lapS;
  const per = Math.max(1, Math.round(i.perDriver));
  const stints: Stint[] = [];
  const driveS: Record<string, number> = Object.fromEntries(i.drivers.map((d) => [d, 0]));
  let t = 0;
  let streak = 0;
  let prev = "";
  while (t < i.raceS && stints.length < MAX_STINTS) {
    const idx = stints.length;
    const end = Math.min(t + stintS, i.raceS);
    const last = end >= i.raceS;
    // Le dernier relais finit au premier passage de ligne après le temps écoulé.
    const laps = last ? Math.ceil((end - t) / i.lapS) : i.stintLaps;
    let driver: string;
    if (i.pins?.[idx]) driver = i.pins[idx];
    else if (i.mode === "rotate") driver = i.drivers[Math.floor(idx / per) % i.drivers.length];
    else {
      const ok = i.drivers.filter((d) => !(d === prev && streak >= per));
      const pool = ok.length ? ok : i.drivers;
      driver = pool.reduce((a, b) => (driveS[b] < driveS[a] ? b : a));
    }
    streak = driver === prev ? streak + 1 : 1;
    prev = driver;
    driveS[driver] = (driveS[driver] ?? 0) + (end - t);
    const night = i.sun ? nightShare(t, end, i.startHour, i.sun) > 0.5 : false;
    const newTyres = idx > 0 && idx % Math.max(1, i.tyreEvery) === 0;
    stints.push({ index: idx, driver, startS: t, endS: end, laps, newTyres, night, last });
    t = end + i.pitLossS;
  }
  const overLimit = i.maxDriveS != null ? Object.keys(driveS).filter((d) => driveS[d] > i.maxDriveS!) : [];
  return { stints, stops: Math.max(0, stints.length - 1), driveS, overLimit };
}

/** « 15:30 » (heure locale) depuis l'heure de départ et un temps de course. */
export function clock(startHour: number, s: number): string {
  const h = (((startHour + s / 3600) % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60 + 1e-6);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** « 2:05 » (h:mm) d'une durée. */
export function hm(s: number): string {
  const m = Math.round(s / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}
