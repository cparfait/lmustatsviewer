/**
 * Boucle d'apprentissage — rapport, rappel, objectifs (COACH-LIVE-SPEC.md §11,
 * P4.1) — module **pur** (types + arithmétique seuls), rejouable (§14).
 *
 * Produit des **lignes localisables** (suffixe i18n `live.*` + variables, comme
 * `voice.ts`) — la formulation finale et la voix restent à l'appelant :
 *  - `buildSessionReport` : le **rapport « 1+1+1 »** de fin de session (§11) —
 *    (1) un progrès ancré sur les données, (2) le prochain chantier, (3) un cap
 *    chiffré calibré ohne_speed ;
 *  - `buildRecall` : le **rappel inter-sessions** (« la dernière fois, ton chantier
 *    était le virage N ») au premier tour d'un combo connu ;
 *  - `pickObjectives` : 1-2 **objectifs structurés** déduits des faiblesses
 *    chroniques (matière du briefing / futures notes).
 *  - `nextCapMs` : le prochain palier de temps ohne_speed sous le meilleur tour.
 *
 * Les scores de faiblesse ignorent un Δt médian négatif (plus rapide que la réf —
 * réf courte/périmée §3.3) : ce n'est pas un chantier.
 */

import type { CornerSessionStat, CornerProgress } from "./history";

/** Type d'une ligne de rapport (icône / typage côté widget). */
export type ReportKind = "progress" | "chantier" | "cap" | "recall";

/** Une ligne de rapport prête à localiser (suffixe i18n `live.*` + variables). */
export interface ReportLine {
  suffix: string;
  vars: Record<string, string | number>;
  /** Numéro de virage concerné (0 = aucun, ex. le cap chiffré). */
  corner: number;
  kind: ReportKind;
}

/** Le rapport « 1+1+1 » : 0 à 3 lignes ordonnées progrès → chantier → cap. */
export interface SessionReport {
  lines: ReportLine[];
}

/** Gain de temps minimal (s) pour évoquer un progrès (sinon = bruit). */
const MIN_GAIN_S = 0.05;
/** Score de faiblesse minimal pour retenir un chantier / objectif / rappel. */
const WEAKNESS_MIN = 0.05;

/**
 * Score de faiblesse d'un virage (session ou progression) : perte de rythme
 * (Δt médian positif) + dispersion (IQR, demi-poids) + pénalité de non-réussite.
 * Un Δt négatif (plus rapide que la réf) ne compte pas comme une faiblesse.
 */
function weaknessStat(s: CornerSessionStat): number {
  return (
    Math.max(s.medianDt, 0) +
    0.5 * s.iqrDt +
    (1 - s.successRate) * 0.2
  );
}
function weaknessProgress(p: CornerProgress): number {
  return (
    Math.max(p.latestMedianDt, 0) +
    0.5 * p.latestIqrDt +
    (1 - p.latestSuccessRate) * 0.2
  );
}

/** La variance domine-t-elle la perte de rythme ? → chantier « constance » (§11). */
function isConsistencyIssue(medianDt: number, iqrDt: number): boolean {
  return iqrDt > Math.max(medianDt, 0);
}

/**
 * Rapport « 1+1+1 » (§11). `capTime` est le prochain palier ohne_speed déjà
 * formaté (`m:ss.mmm`) ou `null` si indisponible — l'arithmétique de palier est
 * `nextCapMs`, le formatage vit dans le service (accès à `formatTime`).
 */
export function buildSessionReport(
  stats: CornerSessionStat[],
  progress: CornerProgress[],
  capTime: string | null,
): SessionReport {
  const byUid = new Map(progress.map((p) => [p.corner_uid, p] as const));
  const lines: ReportLine[] = [];

  // 1) Progrès : virage de cette session au plus grand gain vs la **dernière
  //    session persistée** (`latestMedianDt`, la progression ne contient que le
  //    passé), au-delà d'un gain net.
  let best: { s: CornerSessionStat; gain: number } | null = null;
  for (const s of stats) {
    const p = byUid.get(s.corner_uid);
    if (!p) continue; // virage jamais vu auparavant → pas de « progrès » à mesurer
    const gain = p.latestMedianDt - s.medianDt; // > 0 = plus rapide qu'avant
    if (gain > MIN_GAIN_S && (!best || gain > best.gain)) best = { s, gain };
  }
  const progressUid = best?.s.corner_uid ?? null;
  if (best) {
    const tenths = Math.round(best.gain * 10);
    const made = Math.round(best.s.successRate * best.s.passes);
    lines.push({
      suffix: "vReportProgress",
      vars: { n: best.s.n, d: tenths, made, total: best.s.passes },
      corner: best.s.n,
      kind: "progress",
    });
  }

  // 2) Chantier : le pire virage restant (hors progrès). Constance si la variance
  //    domine, sinon pace.
  let worst: CornerSessionStat | null = null;
  for (const s of stats) {
    if (s.corner_uid === progressUid) continue;
    if (weaknessStat(s) <= WEAKNESS_MIN) continue;
    if (!worst || weaknessStat(s) > weaknessStat(worst)) worst = s;
  }
  if (worst) {
    const consistency = isConsistencyIssue(worst.medianDt, worst.iqrDt);
    lines.push({
      suffix: consistency ? "vReportChantierConsistency" : "vReportChantierPace",
      vars: { n: worst.n },
      corner: worst.n,
      kind: "chantier",
    });
  }

  // 3) Cap chiffré ohne_speed (§11) — prochain objectif de temps.
  if (capTime) {
    lines.push({
      suffix: "vReportCap",
      vars: { time: capTime },
      corner: 0,
      kind: "cap",
    });
  }

  return { lines };
}

/**
 * Rappel inter-sessions (§11) : le chantier du dernier passage sur le combo.
 * `null` si l'historique n'expose aucune faiblesse notable (rien à reprendre).
 */
export function buildRecall(progress: CornerProgress[]): ReportLine | null {
  let worst: CornerProgress | null = null;
  for (const p of progress) {
    if (weaknessProgress(p) <= WEAKNESS_MIN) continue;
    if (!worst || weaknessProgress(p) > weaknessProgress(worst)) worst = p;
  }
  if (!worst) return null;
  return {
    suffix: "vRecallChantier",
    vars: { n: worst.n },
    corner: worst.n,
    kind: "recall",
  };
}

/** Objectif structuré déduit d'une faiblesse chronique (§11). */
export interface CoachObjective {
  corner_uid: string;
  n: number;
  /** Métrique visée : rythme ou régularité. */
  metric: "pace" | "consistency";
  /** Δt médian actuel (s) — base de l'objectif. */
  currentDt: number;
  /**
   * Cible (s) : pour la pace, la **moitié** du chemin vers la réf (réaliste, §11) ;
   * pour la constance, viser le Δt médian courant à IQR réduit (on ne pousse pas
   * la vitesse quand la variance domine).
   */
  targetDt: number;
}

/**
 * 1-2 objectifs structurés (§11), les faiblesses chroniques les plus fortes.
 * Servent le briefing (« on reprend là ») et de futures notes ; le rappel vocal
 * délivré en P4.1 est `buildRecall`.
 */
export function pickObjectives(
  progress: CornerProgress[],
  max = 2,
): CoachObjective[] {
  return progress
    .map((p) => ({ p, w: weaknessProgress(p) }))
    .filter((x) => x.w > WEAKNESS_MIN)
    .sort((a, b) => b.w - a.w)
    .slice(0, max)
    .map(({ p }) => {
      const consistency = isConsistencyIssue(p.latestMedianDt, p.latestIqrDt);
      return {
        corner_uid: p.corner_uid,
        n: p.n,
        metric: consistency ? "consistency" : "pace",
        currentDt: p.latestMedianDt,
        targetDt: consistency
          ? p.latestMedianDt
          : Math.max(0, p.latestMedianDt / 2),
      };
    });
}

/**
 * Prochain palier de temps (ms) strictement sous le meilleur tour (`bestMs`),
 * parmi les temps de tiers ohne_speed fournis (n'importe quel ordre). Renvoie le
 * **plus grand** temps de tier encore inférieur au best (le pas juste devant), ou
 * le plus rapide des tiers si le pilote est déjà sous tous (viser l'alien).
 * `null` si aucune donnée exploitable.
 */
export function nextCapMs(bestMs: number, tierTimesMs: number[]): number | null {
  const tiers = tierTimesMs.filter((t) => t > 0).sort((a, b) => a - b);
  if (!tiers.length || bestMs <= 0) return null;
  // Plus grand palier encore sous le best (le prochain objectif atteignable).
  let target: number | null = null;
  for (const t of tiers) {
    if (t < bestMs) target = t;
  }
  // Déjà plus rapide que tous les paliers → viser le plus rapide (alien).
  return target ?? tiers[0];
}
