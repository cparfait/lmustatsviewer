/**
 * Carrière et saison (module pur) : bilan d'une période, temps forts, défaut
 * récurrent, championnats (manches rattachées par circuit et date, barème,
 * « ce qu'il me faut pour le titre »).
 */

import type { CareerRace, ClassResult } from "@/lib/api";

export type OnlineFilter = "all" | "online" | "offline";

export interface CareerFilter {
  online: OnlineFilter;
  /** Classe (vide = toutes). */
  cls: string;
  /** Bornes en epoch secondes (incluses), null = sans borne. */
  from: number | null;
  to: number | null;
}

export const isFinished = (r: CareerRace) => /finished/i.test(r.finish_status);

export function filterRaces(races: CareerRace[], f: CareerFilter): CareerRace[] {
  return races.filter(
    (r) =>
      (f.online === "all" || (f.online === "online") === r.online) &&
      (!f.cls || r.car_class === f.cls) &&
      (f.from == null || r.timestamp >= f.from) &&
      (f.to == null || r.timestamp <= f.to),
  );
}

export interface Summary {
  races: number;
  tracks: number;
  wins: number;
  podiums: number;
  /** Meilleur résultat en classe (le plus récent à égalité). */
  best: CareerRace | null;
  /** Courses terminées / courses (0-1). */
  finishRate: number;
  /** Places gagnées en classe par course terminée (grille − arrivée), null sans grille. */
  gainedPerRace: number | null;
  /** Progression : position relative dans la classe (0 = 1er), début vs fin de période. */
  progress: { before: number; after: number } | null;
}

/** Position relative en classe : 0 = vainqueur, 1 = dernier. */
const rel = (r: CareerRace) => (r.class_size > 1 ? (r.class_position - 1) / (r.class_size - 1) : 0);

/** Fenêtre de comparaison de la progression (courses). */
export const PROGRESS_WINDOW = 5;

export function summarize(races: CareerRace[]): Summary {
  const fin = races.filter(isFinished);
  let best: CareerRace | null = null;
  for (const r of fin) if (r.class_position > 0 && (!best || r.class_position <= best.class_position)) best = r;
  const withGrid = fin.filter((r) => r.class_grid_pos > 0 && r.class_position > 0);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const ranked = fin.filter((r) => r.class_position > 0);
  const progress =
    ranked.length >= PROGRESS_WINDOW * 2
      ? { before: avg(ranked.slice(0, PROGRESS_WINDOW).map(rel)), after: avg(ranked.slice(-PROGRESS_WINDOW).map(rel)) }
      : null;
  return {
    races: races.length,
    tracks: new Set(races.map((r) => r.track)).size,
    wins: fin.filter((r) => r.class_position === 1).length,
    podiums: fin.filter((r) => r.class_position >= 1 && r.class_position <= 3).length,
    best,
    finishRate: races.length ? fin.length / races.length : 0,
    gainedPerRace: withGrid.length ? avg(withGrid.map((r) => r.class_grid_pos - r.class_position)) : null,
    progress,
  };
}

export type Highlight =
  | { kind: "bestFinish"; race: CareerRace }
  | { kind: "mostGained"; race: CareerRace; places: number }
  | { kind: "longest"; race: CareerRace }
  | { kind: "win"; race: CareerRace };

/** 3 ou 4 faits marquants de la période (pas de chiffre inventé : tout vient des courses). */
export function highlights(races: CareerRace[]): Highlight[] {
  const fin = races.filter(isFinished);
  const out: Highlight[] = [];
  const lastWin = [...fin].reverse().find((r) => r.class_position === 1);
  if (lastWin) out.push({ kind: "win", race: lastWin });
  const s = summarize(races);
  if (s.best && s.best.class_position > 1) out.push({ kind: "bestFinish", race: s.best });
  let gained: { race: CareerRace; places: number } | null = null;
  for (const r of fin) {
    const g = r.class_grid_pos > 0 && r.class_position > 0 ? r.class_grid_pos - r.class_position : 0;
    if (g > 0 && (!gained || g >= gained.places)) gained = { race: r, places: g };
  }
  if (gained && gained.places >= 2) out.push({ kind: "mostGained", ...gained });
  const longest = fin.reduce<CareerRace | null>((a, r) => (!a || r.laps > a.laps ? r : a), null);
  if (longest && longest.laps > 0) out.push({ kind: "longest", race: longest });
  return out.slice(0, 4);
}

/** Défaut récurrent : assez de courses, et le défaut revient souvent. */
export const RECURRING_MIN_RACES = 5;
export const RECURRING_SHARE = 0.3;

export type Recurring = { kind: "dnf"; share: number } | { kind: "lostPlaces"; share: number };

export function recurring(races: CareerRace[]): Recurring | null {
  if (races.length < RECURRING_MIN_RACES) return null;
  const dnf = races.filter((r) => !isFinished(r)).length / races.length;
  if (dnf >= RECURRING_SHARE) return { kind: "dnf", share: dnf };
  const fin = races.filter((r) => isFinished(r) && r.class_grid_pos > 0 && r.class_position > 0);
  if (fin.length >= RECURRING_MIN_RACES) {
    const lost = fin.filter((r) => r.class_position - r.class_grid_pos >= 2).length / fin.length;
    if (lost >= RECURRING_SHARE) return { kind: "lostPlaces", share: lost };
  }
  return null;
}

// ── Championnats ─────────────────────────────────────────────────────────────

export type Scoring = "wec" | "top10";

/** Points par place (index 0 = 1er). */
export const SCORING: Record<Scoring, number[]> = {
  wec: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
  top10: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
};

export interface Round {
  track: string;
  /** AAAA-MM-JJ */
  date: string;
}

export interface Championship {
  id: string;
  name: string;
  cls: string;
  scoring: Scoring;
  rounds: Round[];
}

/** Écart toléré entre la date d'une manche et la course jouée (jours). */
export const ROUND_TOLERANCE_DAYS = 7;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Course du joueur rattachée à chaque manche (ou null). */
export function matchRounds(c: Championship, races: CareerRace[]): (CareerRace | null)[] {
  const used = new Set<number>();
  return c.rounds.map((round) => {
    const day = Date.parse(`${round.date}T12:00:00Z`) / 1000;
    if (!isFinite(day)) return null;
    let best: CareerRace | null = null;
    for (const r of races) {
      if (used.has(r.session_id) || r.car_class !== c.cls) continue;
      if (!norm(r.track).includes(norm(round.track)) && !norm(round.track).includes(norm(r.track))) continue;
      const d = Math.abs(r.timestamp - day) / 86400;
      if (d > ROUND_TOLERANCE_DAYS) continue;
      if (!best || Math.abs(r.timestamp - day) < Math.abs(best.timestamp - day)) best = r;
    }
    if (best) used.add(best.session_id);
    return best;
  });
}

export interface StandingRow {
  driver: string;
  points: number;
  isPlayer: boolean;
  wins: number;
}

export function points(scoring: Scoring, classPos: number, finished: boolean): number {
  return finished && classPos >= 1 ? (SCORING[scoring][classPos - 1] ?? 0) : 0;
}

export function standings(c: Championship, results: ClassResult[]): StandingRow[] {
  const map = new Map<string, StandingRow>();
  for (const r of results) {
    const row = map.get(r.driver_name) ?? { driver: r.driver_name, points: 0, isPlayer: false, wins: 0 };
    const fin = /finished/i.test(r.finish_status);
    row.points += points(c.scoring, r.class_position, fin);
    if (fin && r.class_position === 1) row.wins++;
    row.isPlayer ||= r.is_player;
    map.set(r.driver_name, row);
  }
  return [...map.values()].sort((a, b) => b.points - a.points || b.wins - a.wins);
}

export type TitleMath =
  | { kind: "leading"; margin: number; secured: boolean }
  | { kind: "chasing"; leader: string; gap: number; remaining: number }
  | { kind: "out"; leader: string; gap: number }
  | null;

/** « Ce qu'il me faut pour le titre », d'après le classement et les manches restantes. */
export function titleMath(rows: StandingRow[], remaining: number, scoring: Scoring): TitleMath {
  const me = rows.find((r) => r.isPlayer);
  if (!me || !rows.length) return null;
  const max = SCORING[scoring][0] * remaining;
  const leader = rows[0];
  if (leader === me) {
    const second = rows[1];
    const margin = second ? me.points - second.points : me.points;
    return { kind: "leading", margin, secured: margin > max };
  }
  const gap = leader.points - me.points;
  return gap > max ? { kind: "out", leader: leader.driver, gap } : { kind: "chasing", leader: leader.driver, gap, remaining };
}
