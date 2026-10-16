/**
 * Assistant setup guidé (module pur).
 *
 * Le pilote décrit un symptôme (sous-virage, survirage, instabilité au freinage,
 * talonnage, vibreurs, vitesse de pointe, manque d'appui), la phase du virage
 * (entrée / milieu / sortie) et le type de virage (lent = mécanique, rapide =
 * aéro). L'assistant propose une **chaîne ordonnée** de réglages, du plus
 * probable au moins probable — règles générales de dynamique du véhicule —,
 * filtrée sur les réglages présents dans le `.svm`, avec le sens du changement.
 * Un seul réglage à la fois, d'un cran : c'est la seule façon de savoir ce qui
 * a marché.
 *
 * Sens des crans : dans les `.svm` LMU, l'index monte avec la raideur (barres,
 * ressorts), l'incidence (ailes), le blocage (différentiel), la hauteur et le
 * niveau d'aide (TC) ; `RearBrakeSetting` monte vers l'**arrière**. Le texte
 * affiché par le jeu à côté de l'index permet de le vérifier.
 */

import type { RestSettingBound, SvmFile } from "@/lib/api";

export type Symptom = "understeer" | "oversteer" | "brakeInstability" | "bottoming" | "kerbs" | "topSpeed" | "lowGrip";
export type Phase = "entry" | "mid" | "exit";
export type Regime = "slow" | "fast";

export type LeverId =
  | "frontArb"
  | "rearArb"
  | "frontWing"
  | "rearWing"
  | "rearBrake"
  | "diffPower"
  | "diffCoast"
  | "diffPreload"
  | "tc"
  | "frontSprings"
  | "rearSprings"
  | "frontRide"
  | "rearRide";

interface LeverSpec {
  /** Section du `.svm` (regex) et clé (regex) ; plusieurs = toutes changées (roues). */
  match: { section: RegExp; key: RegExp }[];
  /** Fragments de la clé REST correspondante (`getPlayerGarageData`). */
  rest: string[];
}

const FRONT = /^FRONT(LEFT|RIGHT)$/i;
const REAR = /^REAR(LEFT|RIGHT)$/i;
const ANY = /.*/;

export const LEVERS: Record<LeverId, LeverSpec> = {
  frontArb: { match: [{ section: ANY, key: /^FrontAntiSwaySetting$/ }], rest: ["FRONT_ANTISWAY", "FRONT_ANTI_SWAY", "FRONT_ARB"] },
  rearArb: { match: [{ section: ANY, key: /^RearAntiSwaySetting$/ }], rest: ["REAR_ANTISWAY", "REAR_ANTI_SWAY", "REAR_ARB"] },
  frontWing: { match: [{ section: ANY, key: /^FrontWingSetting$/ }], rest: ["FRONT_WING"] },
  rearWing: { match: [{ section: ANY, key: /^RearWingSetting$/ }], rest: ["REAR_WING"] },
  rearBrake: { match: [{ section: ANY, key: /^RearBrakeSetting$/ }], rest: ["BRAKE_BALANCE", "BRAKE_BIAS"] },
  diffPower: { match: [{ section: ANY, key: /^Diff(erential)?PowerSetting$/ }], rest: ["DIFF_POWER"] },
  diffCoast: { match: [{ section: ANY, key: /^Diff(erential)?CoastSetting$/ }], rest: ["DIFF_COAST"] },
  diffPreload: { match: [{ section: ANY, key: /^Diff(erential)?PreloadSetting$/ }], rest: ["DIFF_PRELOAD"] },
  tc: { match: [{ section: ANY, key: /^TractionControl(Map)?Setting$/ }], rest: ["TRACTION", "TC_"] },
  frontSprings: { match: [{ section: FRONT, key: /^SpringSetting$/ }], rest: ["FRONT_SPRING"] },
  rearSprings: { match: [{ section: REAR, key: /^SpringSetting$/ }], rest: ["REAR_SPRING"] },
  frontRide: { match: [{ section: FRONT, key: /^RideHeightSetting$/ }], rest: ["FRONT_RIDE", "FRONT_HEIGHT"] },
  rearRide: { match: [{ section: REAR, key: /^RideHeightSetting$/ }], rest: ["REAR_RIDE", "REAR_HEIGHT"] },
};

/** Chaîne ordonnée : [réglage, sens (+1 = monter l'index)]. */
type Chain = [LeverId, 1 | -1][];

const TABLE: Record<Symptom, Partial<Record<Phase, Record<Regime, Chain>>> & { any?: Record<Regime, Chain> }> = {
  understeer: {
    entry: {
      slow: [["frontArb", -1], ["diffCoast", -1], ["rearBrake", 1], ["frontSprings", -1]],
      fast: [["frontWing", 1], ["rearWing", -1], ["frontArb", -1], ["frontRide", -1]],
    },
    mid: {
      slow: [["frontArb", -1], ["rearArb", 1], ["frontSprings", -1], ["diffPreload", -1]],
      fast: [["frontWing", 1], ["rearWing", -1], ["frontArb", -1], ["rearArb", 1]],
    },
    exit: {
      slow: [["diffPower", -1], ["frontArb", -1], ["rearArb", 1], ["diffPreload", -1]],
      fast: [["frontWing", 1], ["diffPower", -1], ["frontArb", -1]],
    },
  },
  oversteer: {
    entry: {
      slow: [["rearBrake", -1], ["diffCoast", 1], ["rearArb", -1], ["diffPreload", 1]],
      fast: [["rearWing", 1], ["frontWing", -1], ["rearArb", -1], ["rearRide", -1]],
    },
    mid: {
      slow: [["rearArb", -1], ["frontArb", 1], ["rearSprings", -1]],
      fast: [["rearWing", 1], ["frontWing", -1], ["rearArb", -1]],
    },
    exit: {
      slow: [["tc", 1], ["rearArb", -1], ["rearSprings", -1], ["diffPreload", 1]],
      fast: [["rearWing", 1], ["tc", 1], ["rearArb", -1]],
    },
  },
  brakeInstability: { any: { slow: [["rearBrake", -1], ["diffCoast", 1], ["rearArb", -1]], fast: [["rearBrake", -1], ["rearWing", 1], ["diffCoast", 1]] } },
  bottoming: { any: { slow: [["frontRide", 1], ["rearRide", 1], ["frontSprings", 1], ["rearSprings", 1]], fast: [["frontRide", 1], ["rearRide", 1], ["frontSprings", 1], ["rearSprings", 1]] } },
  kerbs: { any: { slow: [["frontArb", -1], ["rearArb", -1], ["frontSprings", -1], ["frontRide", 1]], fast: [["frontArb", -1], ["rearArb", -1], ["rearSprings", -1]] } },
  topSpeed: { any: { slow: [["rearWing", -1], ["frontWing", -1]], fast: [["rearWing", -1], ["frontWing", -1]] } },
  lowGrip: { any: { slow: [["frontArb", -1], ["rearArb", -1], ["diffPreload", -1]], fast: [["rearWing", 1], ["frontWing", 1]] } },
};

/** Les symptômes qui dépendent de la phase du virage. */
export const PHASED: Symptom[] = ["understeer", "oversteer"];

export interface LeverValue {
  section: string;
  key: string;
  index: number;
  /** Texte affiché par le jeu (après `//`), peut être vide. */
  display: string;
}

export interface Recommendation {
  lever: LeverId;
  dir: 1 | -1;
  values: LeverValue[];
  /** Déjà en butée dans ce sens : proposé quand même mais signalé. */
  atLimit: boolean;
  /** Index maximal connu (pont REST), sinon null. */
  max: number | null;
}

function leverValues(svm: SvmFile, spec: LeverSpec): LeverValue[] {
  const out: LeverValue[] = [];
  for (const sec of svm.sections) {
    for (const p of sec.params) {
      if (!spec.match.some((m) => m.section.test(sec.name) && m.key.test(p.key))) continue;
      const index = Number.parseInt(p.value.trim(), 10);
      if (!Number.isFinite(index)) continue;
      out.push({ section: sec.name, key: p.key, index, display: (p.comment ?? "").trim() });
    }
  }
  return out;
}

/** Réglage figé sur cette voiture (« Detached » = barre déconnectée : réglable, c'est le cran 0). */
const N_A = /^(n\/a|non-adjustable|fixed)$/i;

function restMax(bounds: RestSettingBound[] | null | undefined, spec: LeverSpec): number | null {
  if (!bounds) return null;
  const b = bounds.find((x) => spec.rest.some((r) => x.key.toUpperCase().includes(r)));
  return b && b.max > b.min ? b.max : null;
}

/** Recommandations pour un symptôme, sur un `.svm` donné (3 au plus). */
export function recommend(
  svm: SvmFile,
  symptom: Symptom,
  phase: Phase,
  regime: Regime,
  bounds?: RestSettingBound[] | null,
  max = 3,
): Recommendation[] {
  const t = TABLE[symptom];
  const chain = (PHASED.includes(symptom) ? t[phase] : t.any)?.[regime] ?? [];
  const out: Recommendation[] = [];
  for (const [lever, dir] of chain) {
    const values = leverValues(svm, LEVERS[lever]);
    // Réglage absent ou figé (« N/A ») sur cette voiture : on passe au suivant.
    if (!values.length || values.every((v) => N_A.test(v.display))) continue;
    const top = restMax(bounds, LEVERS[lever]);
    const atLimit = dir < 0 ? values.every((v) => v.index <= 0) : top != null && values.every((v) => v.index >= top);
    out.push({ lever, dir, values, atLimit, max: top });
    if (out.length >= max) break;
  }
  // Les réglages encore libres d'abord ; une butée reste visible mais en dernier.
  return out.sort((a, b) => Number(a.atLimit) - Number(b.atLimit));
}

/** Sections modifiées pour appliquer un cran (`setups.update`). */
export function applyStep(svm: SvmFile, rec: Recommendation): { name: string; params: { key: string; value: string; comment: string | null }[] }[] {
  const bySection = new Map<string, { key: string; value: string; comment: string | null }[]>();
  for (const v of rec.values) {
    const next = Math.max(0, v.index + rec.dir);
    const list = bySection.get(v.section) ?? [];
    // Le texte du jeu n'est plus juste pour le nouvel index : on le retire, le
    // jeu le recalcule au chargement.
    list.push({ key: v.key, value: String(next), comment: null });
    bySection.set(v.section, list);
  }
  return [...bySection.entries()].map(([name, params]) => ({ name, params }));
}

/** « Mon setup V3 » → « Mon setup V4 » ; sans numéro → « … V2 ». */
export function nextVersionName(name: string): string {
  const m = /^(.*?)[ _-]?V(\d+)$/i.exec(name.trim());
  return m ? `${m[1]} V${Number(m[2]) + 1}` : `${name.trim()} V2`;
}
