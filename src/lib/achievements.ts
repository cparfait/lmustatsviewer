/**
 * Succès du pilote (Atelier, opt-in) — module pur. Tout est calculé depuis la
 * base locale déjà chargée par le Profil (statistiques, records par combo,
 * activité de course) : rien n'est envoyé ni stocké. Chaque succès a trois
 * paliers (bronze, argent, or) ; la valeur courante dit le palier atteint et
 * la marche suivante.
 */

import type { RaceActivityRow, RecordOverviewRow } from "@/lib/api";

export type AchievementGroup = "explore" | "drive" | "results" | "records" | "habits";
export type Tier = 0 | 1 | 2 | 3;

export interface AchievementDef {
  id: string;
  group: AchievementGroup;
  /** Seuils bronze, argent, or (croissants). */
  tiers: [number, number, number];
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "tracks", group: "explore", tiers: [5, 10, 20] },
  { id: "cars", group: "explore", tiers: [5, 15, 30] },
  { id: "classes", group: "explore", tiers: [2, 3, 4] },
  { id: "laps", group: "drive", tiers: [100, 1000, 5000] },
  { id: "hours", group: "drive", tiers: [10, 50, 200] },
  { id: "distance", group: "drive", tiers: [1000, 5000, 25000] },
  { id: "races", group: "results", tiers: [10, 50, 200] },
  { id: "podiums", group: "results", tiers: [1, 10, 50] },
  { id: "wins", group: "results", tiers: [1, 10, 50] },
  { id: "onlineWins", group: "results", tiers: [1, 5, 20] },
  { id: "improvements", group: "records", tiers: [10, 50, 200] },
  { id: "specialist", group: "records", tiers: [1, 3, 10] },
  { id: "cleanRate", group: "habits", tiers: [80, 90, 95] },
  { id: "weekStreak", group: "habits", tiers: [2, 4, 12] },
];

export interface AchievementInput {
  totalLaps: number;
  totalLapsValid: number;
  drivingHours: number;
  distanceKm: number;
  races: number;
  podiums: number;
  wins: number;
  onlineWins: number;
  records: RecordOverviewRow[];
  activity: RaceActivityRow[];
}

export interface AchievementState {
  def: AchievementDef;
  value: number;
  tier: Tier;
  /** Seuil suivant, `null` = or atteint. */
  next: number | null;
  /** Avancement vers le seuil suivant (0..1). */
  progress: number;
}

/** Laps minimum pour juger du taux de tours valides. */
export const CLEAN_RATE_MIN_LAPS = 300;
/** Sessions minimum sur un combo pour en être « spécialiste ». */
export const SPECIALIST_SESSIONS = 10;

const WEEK_S = 7 * 24 * 3600;

/** Plus longue série de semaines consécutives avec au moins une course. */
export function longestWeekStreak(activity: RaceActivityRow[]): number {
  // Semaines comptées depuis un lundi de référence (1970-01-05).
  const weeks = [...new Set(activity.map((a) => Math.floor((a.timestamp - 345600) / WEEK_S)))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < weeks.length; i++) {
    run = i > 0 && weeks[i] === weeks[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

function valueOf(id: string, x: AchievementInput): number {
  switch (id) {
    case "tracks":
      return new Set(x.records.map((r) => r.track)).size;
    case "cars":
      return new Set(x.records.map((r) => r.car)).size;
    case "classes":
      return new Set(x.records.map((r) => r.car_class).filter(Boolean)).size;
    case "laps":
      return x.totalLaps;
    case "hours":
      return Math.floor(x.drivingHours);
    case "distance":
      return Math.floor(x.distanceKm);
    case "races":
      return x.races;
    case "podiums":
      return x.podiums;
    case "wins":
      return x.wins;
    case "onlineWins":
      return x.onlineWins;
    case "improvements":
      return x.records.reduce((n, r) => n + (r.improvements || 0), 0);
    case "specialist":
      return x.records.filter((r) => r.sessions_count >= SPECIALIST_SESSIONS).length;
    case "cleanRate":
      return x.totalLaps >= CLEAN_RATE_MIN_LAPS ? Math.floor((x.totalLapsValid / x.totalLaps) * 100) : 0;
    case "weekStreak":
      return longestWeekStreak(x.activity);
    default:
      return 0;
  }
}

export function evaluateAchievements(x: AchievementInput): AchievementState[] {
  return ACHIEVEMENTS.map((def) => {
    const value = valueOf(def.id, x);
    const tier = def.tiers.filter((s) => value >= s).length as Tier;
    const next = tier < 3 ? def.tiers[tier as 0 | 1 | 2] : null;
    const prev = tier > 0 ? def.tiers[(tier - 1) as 0 | 1 | 2] : 0;
    const progress = next == null ? 1 : Math.max(0, Math.min(1, (value - prev) / (next - prev)));
    return { def, value, tier, next, progress };
  });
}
