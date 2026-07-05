/**
 * Coaching du risque + cible de classe (COACH-LIVE-SPEC.md §12 P3, P5.4) — module
 * **pur** (types + arithmétique seuls, aucune dépendance React/i18n/Tauri),
 * rejouable (§14).
 *
 * Deux signaux « compétitifs », distincts du diagnostic de pilotage :
 *  1. **Risque (coupures de piste)** — si un même virage accumule des coupures
 *     (`track_limits`) au fil du relais, le coach signale que forcer là **n'est pas
 *     rentable** (le gain au chrono ne vaut pas le risque de pénalité). Une alerte
 *     par virage.
 *  2. **Cible de classe du jour** — compare tes **meilleurs secteurs** aux
 *     **meilleurs de ta classe présents en session** (standings) : « au secteur 2,
 *     le meilleur de ta classe reprend 0,20 s, vise là. » Plus motivant qu'un CSV.
 *
 * Les coupures sont attribuées au **dernier virage franchi** (`noteCorner`) : elles
 * se produisent en général en sortie de virage, juste après la clôture de fenêtre.
 */

import type { CornerMeasurement } from "./engine";

/** Un conseil de risque / cible de classe prêt à formater (voix + widget). */
export interface RiskAdvisory {
  kind: "risk-limits" | "class-target";
  /** Suffixe i18n sous `live.`. */
  suffix: string;
  vars: Record<string, string | number>;
  /** Numéro de virage (0 si le conseil n'est pas lié à un virage). */
  corner: number;
  corner_uid: string;
  /** Écart chiffré exact (écart secteur en s pour la cible ; 0 pour le risque). */
  magnitude: number;
  unit: "s" | "";
}

/** Compteur de coupures d'un virage sur le relais courant. */
interface RiskCornerAcc {
  n: number;
  hits: number;
  alerted: boolean;
}

export interface RiskState {
  /** `corner_uid` → coupures accumulées. */
  corners: Map<string, RiskCornerAcc>;
  /** Dernier virage franchi (contexte d'attribution des coupures). */
  lastCorner: { uid: string; n: number } | null;
  /** Compteur cumulé `track_limits` de la trame précédente (−1 = jamais observé). */
  lastTrackLimits: number;
  /** Dernier tour où une cible de classe a été donnée (−1 = jamais). */
  lastClassTargetLap: number;
}

export function createRiskState(): RiskState {
  return { corners: new Map(), lastCorner: null, lastTrackLimits: -1, lastClassTargetLap: -1 };
}

export function resetRisk(st: RiskState): void {
  st.corners.clear();
  st.lastCorner = null;
  st.lastTrackLimits = -1;
  st.lastClassTargetLap = -1;
}

/** Coupures répétées sur un même virage avant d'alerter (« pas rentable »). */
const RISK_HITS = 3;
/** Écart secteur minimal (s) vs le meilleur de classe pour proposer une cible. */
const MIN_GAP_S = 0.15;
/** Cooldown (tours) entre deux cibles de classe. */
const CLASS_COOLDOWN_LAPS = 5;

/** Mémorise le dernier virage franchi (attribution des coupures suivantes). */
export function noteCorner(st: RiskState, m: CornerMeasurement): void {
  if (m.tainted) return;
  st.lastCorner = { uid: m.corner_uid, n: m.n };
}

/**
 * Enregistre le compteur cumulé de coupures et signale un virage **risqué** (≥ 3
 * coupures accumulées, une fois par virage). Le premier appel ne fait qu'amorcer le
 * compteur (la valeur peut déjà être non nulle). Une baisse du compteur (reset au
 * stand / nouvelle session) est ignorée.
 */
export function recordTrackLimit(st: RiskState, current: number): RiskAdvisory | null {
  if (st.lastTrackLimits < 0) {
    st.lastTrackLimits = current;
    return null;
  }
  const delta = current - st.lastTrackLimits;
  st.lastTrackLimits = current;
  if (delta <= 0 || !st.lastCorner) return null;

  let acc = st.corners.get(st.lastCorner.uid);
  if (!acc) {
    acc = { n: st.lastCorner.n, hits: 0, alerted: false };
    st.corners.set(st.lastCorner.uid, acc);
  }
  acc.n = st.lastCorner.n;
  acc.hits += delta;
  if (!acc.alerted && acc.hits >= RISK_HITS) {
    acc.alerted = true;
    return {
      kind: "risk-limits",
      suffix: "vRiskLimits",
      vars: { n: acc.n, c: acc.hits },
      corner: acc.n,
      corner_uid: st.lastCorner.uid,
      magnitude: 0,
      unit: "",
    };
  }
  return null;
}

/**
 * Cible de classe (§12) : compare tes meilleurs secteurs à ceux du meilleur de ta
 * classe présent en session ; renvoie le secteur où tu perds **le plus** (au-delà
 * du seuil), une fois par cooldown. `null` si aucun secteur exploitable / sous le
 * seuil / cooldown non écoulé.
 */
export function classTargetAdvice(
  st: RiskState,
  o: {
    playerBest: readonly number[];
    classBest: readonly (number | null)[];
    lapNum: number;
  },
): RiskAdvisory | null {
  if (st.lastClassTargetLap >= 0 && o.lapNum - st.lastClassTargetLap < CLASS_COOLDOWN_LAPS) {
    return null;
  }
  let bestSector = -1;
  let bestGap = 0;
  for (let i = 0; i < 3; i++) {
    const mine = o.playerBest[i];
    const rival = o.classBest[i];
    if (mine == null || rival == null || mine <= 0 || rival <= 0) continue;
    const gap = mine - rival;
    if (gap >= MIN_GAP_S && gap > bestGap) {
      bestGap = gap;
      bestSector = i;
    }
  }
  if (bestSector < 0) return null;
  st.lastClassTargetLap = o.lapNum;
  return {
    kind: "class-target",
    suffix: "vClassTarget",
    vars: { s: bestSector + 1, d: bestGap.toFixed(2) },
    corner: 0,
    corner_uid: "",
    magnitude: bestGap,
    unit: "s",
  };
}
