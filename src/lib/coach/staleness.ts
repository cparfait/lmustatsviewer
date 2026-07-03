/**
 * Péremption / dégradation d'une réf dense (COACH-LIVE-SPEC.md §3.3, §3.4, P3.2) —
 * module **pur**.
 *
 * Une réf capturée dans d'autres conditions ne peut plus servir de cible absolue :
 * un autre build de jeu, une piste plus chaude/froide, une trajectoire mouillée ou
 * un autre composé de pneu déplacent tous les repères. La réf devient alors
 * **indicative** : le coach ne délivre plus que des deltas **relatifs** (via la réf
 * courte, §3.3) et jamais un chiffre absolu de point de freinage.
 *
 * Ce module ne décide que du **mode** (`fresh` | `indicative`) à partir d'un
 * instantané de conditions ; la bascule de cible (dense ↔ courte) est appliquée
 * dans `diagnostics.ts`. Déterministe → rejouable/testable (§14).
 */

/** Conditions comparables d'une réf ou de l'instant courant (§3.1 méta). */
export interface RefConditions {
  /** Build du jeu (`Extended.m_version`) — "" si inconnu. */
  gameBuild: string;
  /** Température de piste (°C). */
  trackTemp: number;
  /** Humidité moyenne de la trajectoire (0–1). */
  wetness: number;
  /** Composé pneu avant / arrière — "" si inconnu. */
  compoundF: string;
  compoundR: string;
}

/** Mode d'exploitation de la réf dense (§3.3). */
export type RefMode = "fresh" | "indicative";

/** Cause de péremption (traçabilité / debug). */
export type StaleReason = "build" | "track-temp" | "wetness" | "compound" | "kind";

export interface FreshnessVerdict {
  mode: RefMode;
  reasons: StaleReason[];
}

/** Écart de température de piste (°C) au-delà duquel la réf devient indicative (§3.3). */
export const TEMP_TOL_C = 8;
/** Écart d'humidité de trajectoire au-delà duquel la réf devient indicative (§3.3/§6). */
export const WETNESS_TOL = 0.1;

/**
 * Verdict de fraîcheur d'une réf face aux conditions courantes. `fresh` autorise
 * la cible dense (chiffres vs best/ghost) ; `indicative` force le mode relatif.
 * Une réf déjà marquée `stale` (autre build côté backend) est indicative d'office.
 *
 * Robustesse : les comparaisons ne se déclenchent que sur des données présentes
 * (build/composé non vides, température > 0) — une donnée manquante ne doit pas
 * fabriquer une fausse péremption.
 */
export function refFreshness(
  ref: RefConditions,
  current: RefConditions,
  refKind: string,
): FreshnessVerdict {
  const reasons: StaleReason[] = [];

  if (refKind === "stale") reasons.push("kind");

  if (ref.gameBuild && current.gameBuild && ref.gameBuild !== current.gameBuild) {
    reasons.push("build");
  }
  if (ref.trackTemp > 0 && current.trackTemp > 0 &&
      Math.abs(ref.trackTemp - current.trackTemp) > TEMP_TOL_C) {
    reasons.push("track-temp");
  }
  if (Math.abs(ref.wetness - current.wetness) > WETNESS_TOL) {
    reasons.push("wetness");
  }
  const compoundChanged =
    (ref.compoundF && current.compoundF && ref.compoundF !== current.compoundF) ||
    (ref.compoundR && current.compoundR && ref.compoundR !== current.compoundR);
  if (compoundChanged) reasons.push("compound");

  return { mode: reasons.length ? "indicative" : "fresh", reasons };
}
