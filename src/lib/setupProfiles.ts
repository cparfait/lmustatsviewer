/**
 * Setups complets par profil (opt-in, Config › Atelier).
 *
 * Doctrine maison : un profil ne s'invente pas ex nihilo, il part du setup du
 * pilote (le gabarit porte la voiture, ses réglages présents et ses unités) et
 * déplace un ensemble cohérent de réglages d'un nombre de crans borné, dans le
 * sens qui donne le comportement voulu :
 * - Débutant : la voiture la plus tolérante (arrière planté, aide maximale) ;
 * - Stable : un peu plus de sous-virage et d'aide ;
 * - Course : vive à l'entrée, stable à l'accélération, ménage les pneus ;
 * - Qualif : la plus pointue (rotation, moins de traînée, moins d'aide).
 * L'option Pluie s'ajoute à n'importe quel profil (appui, souplesse, hauteur,
 * aide, freinage vers l'avant). Chaque changement porte sa raison ; aucun
 * réglage n'est écrit au-delà des butées connues.
 */

import type { RestSettingBound, SvmFile } from "@/lib/api";
import { applyChanges, leverState, type LeverId, type LeverValue, type SectionPatch } from "@/lib/setupAssistant";
import type { NotchTable } from "@/lib/setupNotches";
import type { DriverStyle } from "@/lib/driverStyle";

export type SetupProfile = "beginner" | "stable" | "race" | "qualif";
export const PROFILES: SetupProfile[] = ["beginner", "stable", "race", "qualif"];

type Moves = Partial<Record<LeverId, number>>;

/** Crans par profil (+ = index qui monte, convention de `LEVER_SEMANTICS`). */
export const DOCTRINE: Record<SetupProfile, Moves> = {
  beginner: { tc: 3, rearBrake: -2, rearArb: -2, frontArb: 1, rearWing: 2, diffCoast: 2, diffPreload: 2, diffPower: -1 },
  stable: { tc: 1, rearBrake: -1, rearArb: -1, rearWing: 1, diffCoast: 1, diffPreload: 1 },
  race: { frontArb: -1, diffPreload: 1, tc: 1 },
  qualif: { frontArb: -1, rearArb: 1, tc: -1, rearBrake: 1, diffCoast: -1, rearWing: -1 },
};

export const WET: Moves = {
  rearWing: 3,
  frontWing: 2,
  frontArb: -2,
  rearArb: -2,
  frontSprings: -2,
  rearSprings: -2,
  frontRide: 2,
  rearRide: 2,
  tc: 3,
  rearBrake: -2,
};

/** Profil proposé par défaut selon le style déclaré. */
export function profileForStyle(s: DriverStyle): SetupProfile {
  if (s === "stable") return "stable";
  if (s === "aggressive") return "qualif";
  return "race";
}

export interface PlannedChange {
  lever: LeverId;
  /** Crans demandés par la doctrine (signés). */
  wanted: number;
  /** Crans réellement appliqués après les butées (signés, peut être 0). */
  applied: number;
  values: LeverValue[];
  top: number | null;
  inferred: boolean;
}

/**
 * Plan du profil sur ce fichier : les réglages absents ou figés sont écartés,
 * les crans bornés à 0 et à l'index le plus haut connu (sans borne haute
 * connue, une montée est gardée mais limitée à 2 crans).
 */
export function planProfile(
  svm: SvmFile,
  profile: SetupProfile,
  wet: boolean,
  bounds?: RestSettingBound[] | null,
  table?: NotchTable,
): PlannedChange[] {
  const moves: Moves = { ...DOCTRINE[profile] };
  if (wet) for (const [k, v] of Object.entries(WET) as [LeverId, number][]) moves[k] = (moves[k] ?? 0) + v;
  const out: PlannedChange[] = [];
  for (const [lever, wanted] of Object.entries(moves) as [LeverId, number][]) {
    if (!wanted) continue;
    const { values, top, inferred } = leverState(svm, lever, bounds, table);
    if (!values.length || values.every((v) => /^(n\/a|non-adjustable|fixed)$/i.test(v.display))) continue;
    const cur = Math.min(...values.map((v) => v.index));
    let applied = wanted;
    if (wanted < 0) applied = Math.max(wanted, -cur);
    else applied = top != null ? Math.min(wanted, Math.max(0, top - Math.max(...values.map((v) => v.index)))) : Math.min(wanted, 2);
    out.push({ lever, wanted, applied, values, top, inferred });
  }
  return out;
}

/** Sections à écrire pour un plan (seulement les crans réellement appliqués). */
export function profilePatches(plan: PlannedChange[]): SectionPatch[] {
  return applyChanges(plan.filter((c) => c.applied !== 0).map((c) => ({ values: c.values, delta: c.applied, max: c.top })));
}
