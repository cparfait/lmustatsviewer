/**
 * Niveau de présence du coach en roulant (module pur).
 *
 * Le pilote choisit combien le coach parle : « présent », « normal » (le comportement
 * d'avant, par défaut), « discret », ou « auto », où le coach décide selon l'écart à
 * son prochain objectif de chrono et la régularité de ses derniers tours :
 *  - **présent** à plus d'une seconde de l'objectif, ou quand les derniers tours
 *    varient de plus d'une demi-seconde ;
 *  - **discret** à moins d'une demi-seconde de l'objectif (il parle encore, au plus un
 *    conseil tous les `DISCREET_GAP_LAPS` tours : jamais muet près du but) ;
 *  - **normal** sinon, et quand l'écart n'est pas connu (jamais un cran inventé).
 * Le niveau ne change pas la Qualif (silence en tour lancé) ni le mode Drill.
 */

import type { ModePolicy } from "./mode";

export type CoachPresence = "normal" | "present" | "discreet" | "auto";
export type PresenceLevel = Exclude<CoachPresence, "auto">;

export const COACH_PRESENCES: readonly CoachPresence[] = ["normal", "present", "discreet", "auto"];
/** Discret : tours minimaux entre deux conseils. */
export const DISCREET_GAP_LAPS = 4;
/** Auto : au-delà de cet écart à l'objectif (s), présent. */
export const AUTO_FAR_S = 1;
/** Auto : en deçà de cet écart à l'objectif (s), discret. */
export const AUTO_NEAR_S = 0.5;
/** Auto : dispersion des derniers tours (max − min, s) au-delà de laquelle on est présent. */
export const AUTO_SPREAD_S = 0.5;

export function parsePresence(raw: string | null | undefined): CoachPresence {
  return raw === "present" || raw === "discreet" || raw === "auto" ? raw : "normal";
}

/**
 * Niveau effectif. `gapS` = meilleur tour propre − objectif (s, > 0 = plus lent),
 * `null` si inconnu ; `recentLapsS` = derniers tours propres (s).
 */
export function effectivePresence(choice: CoachPresence, gapS: number | null, recentLapsS: number[]): PresenceLevel {
  if (choice !== "auto") return choice;
  if (recentLapsS.length >= 3) {
    const spread = Math.max(...recentLapsS) - Math.min(...recentLapsS);
    if (spread > AUTO_SPREAD_S) return "present";
  }
  if (gapS == null || !isFinite(gapS)) return "normal";
  if (gapS > AUTO_FAR_S) return "present";
  if (gapS < AUTO_NEAR_S) return "discreet";
  return "normal";
}

/** Politique du mode ajustée au niveau de présence (`normal` = inchangée). */
export function applyPresence(policy: ModePolicy, level: PresenceLevel): ModePolicy {
  if (level === "normal" || !policy.live) return policy;
  if (level === "present") {
    return policy.escalationOnly
      ? { ...policy, budgetPerLap: policy.budgetPerLap + 1 }
      : { ...policy, budgetPerLap: policy.budgetPerLap + 1, degressive: false };
  }
  // discret : un conseil par tour au plus, et pas plus d'un tous les N tours.
  return { ...policy, budgetPerLap: Math.min(1, policy.budgetPerLap), minLapsBetween: DISCREET_GAP_LAPS };
}
