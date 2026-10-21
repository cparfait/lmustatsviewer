/**
 * Lecture d'un `.svm` pour l'affichage : la VALEUR que montre le garage (le
 * texte après `//` : « 52.5:47.5 », « 131 kPa ») passe avant l'index brut, et
 * les réglages figés sur la voiture (« N/A », « Fixed », « Non-adjustable »)
 * se reconnaissent pour être repliés. Module pur.
 */

import type { SvmFile, SvmParam } from "@/lib/api";

const FIXED_RX = /^(n\/a|non-adjustable|fixed|nicht einstellbar|non r[ée]glable)$/i;
const INT_RX = /^-?\d+$/;

/** Réglage que la voiture n'expose pas (rien à régler). */
export function isFixedParam(p: Pick<SvmParam, "value" | "comment">): boolean {
  return FIXED_RX.test((p.comment ?? "").trim());
}

/** Paramètres d'en-tête / de texte, hors réglage (notes, symétrie…). */
export function isMetaParam(key: string): boolean {
  return /^(notes|symmetric)$/i.test(key);
}

/** Index écrit dans le fichier (`null` si le réglage est resté « par défaut »). */
export function indexOf(p: Pick<SvmParam, "value">): number | null {
  const v = p.value.trim();
  return INT_RX.test(v) ? Number(v) : null;
}

/** Valeur lisible : le texte du garage, sinon la valeur brute. */
export function displayOf(p: Pick<SvmParam, "value" | "comment">): string {
  const c = (p.comment ?? "").trim();
  return c || p.value.trim();
}

function find(svm: SvmFile, section: RegExp, key: RegExp): SvmParam | null {
  for (const s of svm.sections) {
    if (!section.test(s.name)) continue;
    const p = s.params.find((x) => key.test(x.key));
    if (p) return p;
  }
  return null;
}

/** Valeur lisible d'un réglage s'il est réglable sur cette voiture, sinon `null`. */
function val(svm: SvmFile, section: RegExp, key: RegExp): string | null {
  const p = find(svm, section, key);
  if (!p || isFixedParam(p)) return null;
  const d = displayOf(p);
  return d && !/^detached$/i.test(d) ? d : null;
}

const ANY = /.*/;

export interface KeyFigure {
  /** Clé i18n du libellé (`setups.key.*`). */
  id: string;
  value: string;
}

/**
 * Les chiffres qui résument un setup (électronique, freins, aéro, énergie),
 * dans un ordre fixe ; seuls ceux que la voiture règle sont rendus.
 */
export function keyFigures(svm: SvmFile): KeyFigure[] {
  const rows: [string, string | null][] = [
    ["brakeBias", val(svm, ANY, /^RearBrakeSetting$/)],
    ["brakePressure", val(svm, ANY, /^BrakePressureSetting$/)],
    ["tc", val(svm, ANY, /^TractionControlMapSetting$/)],
    ["tcCut", val(svm, ANY, /^TCPowerCutMapSetting$/)],
    ["tcSlip", val(svm, ANY, /^TCSlipAngleMapSetting$/)],
    ["abs", val(svm, ANY, /^AntilockBrakeSystemMapSetting$/)],
    ["engineMap", val(svm, ANY, /^EngineMixtureSetting$/)],
    ["regen", val(svm, ANY, /^RegenerationMapSetting$/)],
    ["motorMap", val(svm, ANY, /^ElectricMotorMapSetting$/)],
    ["frontWing", val(svm, ANY, /^(FW|FrontWing)Setting$/)],
    ["rearWing", val(svm, ANY, /^(RW|RearWing)Setting$/)],
    ["frontArb", val(svm, ANY, /^FrontAntiSwaySetting$/)],
    ["rearArb", val(svm, ANY, /^RearAntiSwaySetting$/)],
    ["diffPreload", val(svm, ANY, /^DiffPreloadSetting$/)],
    ["energy", val(svm, ANY, /^VirtualEnergySetting$/) ?? val(svm, ANY, /^FuelSetting$/)],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]).map(([id, value]) => ({ id, value }));
}

export type Corner = "FL" | "FR" | "RL" | "RR";
const CORNER_SECTION: Record<Corner, RegExp> = {
  FL: /^FRONTLEFT$/i,
  FR: /^FRONTRIGHT$/i,
  RL: /^REARLEFT$/i,
  RR: /^REARRIGHT$/i,
};

/** Une valeur par roue (pression, carrossage, hauteur…), `null` si absente. */
export function perCorner(svm: SvmFile, key: RegExp): Record<Corner, string | null> {
  return {
    FL: val(svm, CORNER_SECTION.FL, key),
    FR: val(svm, CORNER_SECTION.FR, key),
    RL: val(svm, CORNER_SECTION.RL, key),
    RR: val(svm, CORNER_SECTION.RR, key),
  };
}

/** Notes du pilote (sans guillemets), ou `null`. */
export function notesOf(svm: SvmFile): string | null {
  const p = find(svm, /^GENERAL$/i, /^Notes$/i);
  const v = p?.value.replace(/^"(.*)"$/s, "$1").trim();
  return v || null;
}

/** Nombre de réglages figés (repliés par défaut). */
export function countFixed(svm: SvmFile): number {
  return svm.sections.reduce((n, s) => n + s.params.filter((p) => isFixedParam(p)).length, 0);
}
