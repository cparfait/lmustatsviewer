/**
 * Objectifs de la semaine (module pur + clés de configuration) : courses disputées,
 * podiums en classe et tours valides depuis lundi 0 h (heure locale). Les cibles sont
 * réglables ; une cible à 0 masque l'objectif.
 */

export const GOAL_KEYS = {
  races: "weekly_goal_races",
  podiums: "weekly_goal_podiums",
  laps: "weekly_goal_laps",
} as const;

export type GoalKind = keyof typeof GOAL_KEYS;

export const GOAL_DEFAULTS: Record<GoalKind, number> = { races: 3, podiums: 1, laps: 100 };

/** Bornes de saisie d'une cible. */
export const GOAL_MAX: Record<GoalKind, number> = { races: 50, podiums: 50, laps: 5000 };

/** Début de la semaine en cours (lundi 0 h, heure locale), en epoch secondes. */
export function weekStart(now: Date = new Date()): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (d.getDay() + 6) % 7; // lundi = 0
  d.setDate(d.getDate() - dow);
  return Math.floor(d.getTime() / 1000);
}

/** Cible lue en configuration (texte) : entier borné, défaut sinon. */
export function parseGoal(kind: GoalKind, raw: string | null | undefined): number {
  const n = raw == null || raw.trim() === "" ? NaN : Number(raw);
  if (!Number.isFinite(n)) return GOAL_DEFAULTS[kind];
  return Math.max(0, Math.min(GOAL_MAX[kind], Math.round(n)));
}

/** Avancement 0 → 1 (borné), 1 si atteint. */
export function goalRatio(done: number, target: number): number {
  if (target <= 0) return 1;
  return Math.max(0, Math.min(1, done / target));
}
