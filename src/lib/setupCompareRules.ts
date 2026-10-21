/**
 * Comparaison de deux setups par règles de dynamique du véhicule (module pur,
 * sans IA). Chaque écart est reconnu par une règle (réglage, essieu), son sens
 * est mesuré sur la valeur affichée par le garage quand elle est chiffrée (kPa,
 * degrés, cm, Nm…), sinon sur l'index, et la règle porte l'effet connu de ce
 * sens sur des axes de comportement. Le bilan additionne ces effets (B par
 * rapport à A), garde les réglages responsables et en tire « A pour… / B pour… ».
 *
 * Conventions LMU : l'index monte avec la raideur, l'angle d'aileron, le
 * blocage, la hauteur, l'aide ; `RearBrakeSetting` monte vers l'ARRIÈRE (le
 * texte affiché « 52.5:47.5 » est avant:arrière).
 */

import type { SetupDiffParam, SetupDiffSection } from "@/lib/api";

export type Theme =
  | "aero"
  | "chassis"
  | "balance"
  | "springs"
  | "dampers"
  | "ride"
  | "tyres"
  | "brakes"
  | "diff"
  | "electronics"
  | "engine"
  | "gearing"
  | "fuel"
  | "cooling"
  | "other";

export const THEMES: Theme[] = ["aero", "chassis", "balance", "springs", "dampers", "ride", "tyres", "brakes", "diff", "electronics", "engine", "gearing", "fuel", "cooling", "other"];

/** Axes de comportement ; + = plus de la qualité nommée. `u*` = tendance au sous-virage. */
export type Axis =
  | "brakeStab"
  | "brakePower"
  | "uEntry"
  | "uMid"
  | "uExit"
  | "uFast"
  | "traction"
  | "topSpeed"
  | "response"
  | "bumps"
  | "tyreTemp"
  | "range";

export const AXES: Axis[] = ["brakeStab", "brakePower", "uEntry", "uMid", "uExit", "uFast", "traction", "topSpeed", "response", "bumps", "tyreTemp", "range"];

/** Phase du tour où un axe se ressent (pastilles du détail). */
export const AXIS_PHASE: Record<Axis, "braking" | "entry" | "mid" | "exit" | "fast" | "straight" | null> = {
  brakeStab: "braking",
  brakePower: "braking",
  uEntry: "entry",
  uMid: "mid",
  uExit: "exit",
  uFast: "fast",
  traction: "exit",
  topSpeed: "straight",
  response: "entry",
  bumps: null,
  tyreTemp: null,
  range: null,
};

/** Grandeur comparée : nombre affiché (index en secours), index, ou valeur absolue affichée. */
type Measure = "number" | "index" | "abs" | "frontShare";

interface Rule {
  id: string;
  theme: Theme;
  section: RegExp;
  key: RegExp;
  measure: Measure;
  /** Effet d'une hausse de la grandeur ; vide = réglage décrit sans sens (« modifié »). */
  axes: Partial<Record<Axis, number>>;
}

const ANY = /.*/;
const FRONT = /^FRONT(LEFT|RIGHT)$/i;
const REAR = /^REAR(LEFT|RIGHT)$/i;

export const RULES: Rule[] = [
  // Châssis et géométrie
  { id: "caster", theme: "chassis", section: ANY, key: /^(Left|Right)?CasterSetting$/, measure: "number", axes: { uMid: -0.3, response: 0.2 } },
  { id: "toeOffset", theme: "chassis", section: ANY, key: /^(Front|Rear)ToeOffsetSetting$/, measure: "number", axes: {} },
  { id: "frontTrack", theme: "chassis", section: ANY, key: /^FrontWheelTrackSetting$/, measure: "number", axes: { uMid: -0.3 } },
  { id: "rearTrack", theme: "chassis", section: ANY, key: /^RearWheelTrackSetting$/, measure: "number", axes: { uMid: 0.3, traction: 0.2 } },
  { id: "trackBar", theme: "chassis", section: ANY, key: /^(Left|Right)?TrackBarSetting$/, measure: "number", axes: {} },
  { id: "cgHeight", theme: "chassis", section: ANY, key: /^CGHeightSetting$/, measure: "number", axes: { response: -0.3, uMid: 0.2 } },
  { id: "cgRear", theme: "chassis", section: ANY, key: /^CGRearSetting$/, measure: "number", axes: { traction: 0.3, uMid: -0.3 } },
  { id: "cgRight", theme: "chassis", section: ANY, key: /^CGRightSetting$/, measure: "number", axes: {} },
  { id: "wedge", theme: "chassis", section: ANY, key: /^WedgeSetting$/, measure: "number", axes: {} },
  { id: "chassisAdj", theme: "chassis", section: ANY, key: /^ChassisAdj\d+Setting$/, measure: "number", axes: {} },
  { id: "fenderFlare", theme: "aero", section: ANY, key: /^FenderFlareSetting$/, measure: "number", axes: {} },
  // Aéro
  { id: "rearWing", theme: "aero", section: ANY, key: /^(RW|RearWing)Setting$/, measure: "number", axes: { uFast: 1, topSpeed: -1 } },
  { id: "frontWing", theme: "aero", section: ANY, key: /^(FW|FrontWing)Setting$/, measure: "number", axes: { uFast: -1, topSpeed: -0.5 } },
  // Barres
  { id: "frontArb", theme: "balance", section: ANY, key: /^FrontAntiSwaySetting$/, measure: "index", axes: { uMid: 1, uEntry: 0.5, response: 0.5, bumps: -0.5 } },
  { id: "rearArb", theme: "balance", section: ANY, key: /^RearAntiSwaySetting$/, measure: "index", axes: { uMid: -1, uExit: -0.5, traction: -0.5, bumps: -0.5 } },
  // Ressorts, 3ᵉ éléments, butées
  { id: "frontSprings", theme: "springs", section: FRONT, key: /^SpringSetting$/, measure: "number", axes: { uEntry: 0.5, uMid: 0.5, response: 0.5, bumps: -1 } },
  { id: "rearSprings", theme: "springs", section: REAR, key: /^SpringSetting$/, measure: "number", axes: { uMid: -0.5, uExit: -0.5, traction: -0.5, bumps: -1 } },
  { id: "front3rd", theme: "springs", section: ANY, key: /^Front3rdSpringSetting$/, measure: "number", axes: { uFast: -0.5, bumps: -0.5 } },
  { id: "rear3rd", theme: "springs", section: ANY, key: /^Rear3rdSpringSetting$/, measure: "number", axes: { uFast: 0.5, bumps: -0.5 } },
  { id: "frontPacker", theme: "springs", section: FRONT, key: /^PackerSetting$/, measure: "number", axes: { bumps: -0.5 } },
  { id: "frontPacker", theme: "springs", section: ANY, key: /^Front3rdPackerSetting$/, measure: "number", axes: { bumps: -0.5 } },
  { id: "rearPacker", theme: "springs", section: REAR, key: /^PackerSetting$/, measure: "number", axes: { bumps: -0.5 } },
  { id: "rearPacker", theme: "springs", section: ANY, key: /^Rear3rdPackerSetting$/, measure: "number", axes: { bumps: -0.5 } },
  { id: "tenderSpring", theme: "springs", section: ANY, key: /^(Front3rd|Rear3rd)?TenderSpringSetting$/, measure: "number", axes: {} },
  { id: "tenderTravel", theme: "springs", section: ANY, key: /^(Front3rd|Rear3rd)?TenderTravelSetting$/, measure: "number", axes: {} },
  { id: "springRubber", theme: "springs", section: ANY, key: /^SpringRubberSetting$/, measure: "number", axes: {} },
  { id: "bumpStop", theme: "springs", section: ANY, key: /^BumpStop\w*Setting$/, measure: "number", axes: {} },
  // Amortisseurs (roues et 3ᵉ éléments)
  { id: "frontBump", theme: "dampers", section: FRONT, key: /^(Slow|Fast)BumpSetting$/, measure: "number", axes: { uEntry: 0.3, response: 0.3, bumps: -0.5 } },
  { id: "frontBump", theme: "dampers", section: ANY, key: /^Front3rd(Slow|Fast)BumpSetting$/, measure: "number", axes: { uEntry: 0.3, response: 0.3, bumps: -0.5 } },
  { id: "frontRebound", theme: "dampers", section: FRONT, key: /^(Slow|Fast)ReboundSetting$/, measure: "number", axes: { uExit: -0.3, bumps: -0.3 } },
  { id: "frontRebound", theme: "dampers", section: ANY, key: /^Front3rd(Slow|Fast)ReboundSetting$/, measure: "number", axes: { uExit: -0.3, bumps: -0.3 } },
  { id: "rearBump", theme: "dampers", section: REAR, key: /^(Slow|Fast)BumpSetting$/, measure: "number", axes: { traction: -0.3, uExit: -0.3, bumps: -0.5 } },
  { id: "rearBump", theme: "dampers", section: ANY, key: /^Rear3rd(Slow|Fast)BumpSetting$/, measure: "number", axes: { traction: -0.3, uExit: -0.3, bumps: -0.5 } },
  { id: "rearRebound", theme: "dampers", section: REAR, key: /^(Slow|Fast)ReboundSetting$/, measure: "number", axes: { uEntry: -0.3, brakeStab: -0.3, bumps: -0.3 } },
  { id: "rearRebound", theme: "dampers", section: ANY, key: /^Rear3rd(Slow|Fast)ReboundSetting$/, measure: "number", axes: { uEntry: -0.3, brakeStab: -0.3, bumps: -0.3 } },
  // Hauteurs
  { id: "frontRide", theme: "ride", section: FRONT, key: /^RideHeightSetting$/, measure: "number", axes: { uFast: 0.5, bumps: 0.5 } },
  { id: "rearRide", theme: "ride", section: REAR, key: /^RideHeightSetting$/, measure: "number", axes: { uFast: -0.5, uEntry: -0.3, bumps: 0.5 } },
  // Pneus
  { id: "frontPressure", theme: "tyres", section: FRONT, key: /^PressureSetting$/, measure: "number", axes: { response: 0.5, uMid: 0.5, tyreTemp: 0.5 } },
  { id: "rearPressure", theme: "tyres", section: REAR, key: /^PressureSetting$/, measure: "number", axes: { uMid: -0.5, traction: -0.5, tyreTemp: 0.5 } },
  { id: "frontCamber", theme: "tyres", section: FRONT, key: /^CamberSetting$/, measure: "abs", axes: { uMid: -0.5, brakeStab: -0.2, tyreTemp: 0.3 } },
  { id: "rearCamber", theme: "tyres", section: REAR, key: /^CamberSetting$/, measure: "abs", axes: { uMid: 0.3, traction: -0.3 } },
  { id: "frontToe", theme: "tyres", section: ANY, key: /^FrontToeInSetting$/, measure: "number", axes: { response: -0.5, uEntry: 0.3 } },
  { id: "rearToe", theme: "tyres", section: ANY, key: /^RearToeInSetting$/, measure: "number", axes: { traction: 0.3, uExit: 0.3, topSpeed: -0.2 } },
  { id: "compound", theme: "tyres", section: ANY, key: /^CompoundSetting$/, measure: "number", axes: {} },
  // Freins
  { id: "rearBrake", theme: "brakes", section: ANY, key: /^RearBrakeSetting$/, measure: "frontShare", axes: { brakeStab: -1, uEntry: -0.5 } },
  { id: "brakePressure", theme: "brakes", section: ANY, key: /^BrakePressureSetting$/, measure: "number", axes: { brakePower: 1, brakeStab: -0.3 } },
  { id: "brakeMigration", theme: "brakes", section: ANY, key: /^BrakeMigrationSetting$/, measure: "number", axes: {} },
  { id: "brakeDuct", theme: "brakes", section: ANY, key: /^BrakeDuct(Rear)?Setting$/, measure: "number", axes: { topSpeed: -0.2 } },
  { id: "handbrake", theme: "brakes", section: ANY, key: /^Hand(front)?brakePressSetting$/, measure: "number", axes: {} },
  { id: "brakeHw", theme: "brakes", section: ANY, key: /^Brake(Disc|Pad)Setting$/, measure: "number", axes: {} },
  // Différentiel
  { id: "diffPower", theme: "diff", section: ANY, key: /^Diff(erential)?PowerSetting$/, measure: "number", axes: { traction: 1, uExit: 1 } },
  { id: "diffCoast", theme: "diff", section: ANY, key: /^Diff(erential)?CoastSetting$/, measure: "number", axes: { brakeStab: 1, uEntry: 1 } },
  { id: "diffPreload", theme: "diff", section: ANY, key: /^Diff(erential)?PreloadSetting$/, measure: "number", axes: { uEntry: 0.3, uMid: 0.3, uExit: 0.3, brakeStab: 0.3, traction: 0.3 } },
  { id: "diffPump", theme: "diff", section: ANY, key: /^DiffPumpSetting$/, measure: "number", axes: { traction: 0.5, uExit: 0.5 } },
  { id: "frontDiffPower", theme: "diff", section: ANY, key: /^FrontDiffPowerSetting$/, measure: "number", axes: { uExit: 0.5, traction: 0.3 } },
  { id: "frontDiffCoast", theme: "diff", section: ANY, key: /^FrontDiffCoastSetting$/, measure: "number", axes: { uEntry: 0.5, brakeStab: 0.3 } },
  { id: "frontDiffPreload", theme: "diff", section: ANY, key: /^FrontDiffPreloadSetting$/, measure: "number", axes: { uMid: 0.3 } },
  { id: "frontDiffPump", theme: "diff", section: ANY, key: /^FrontDiffPumpSetting$/, measure: "number", axes: { uExit: 0.3 } },
  { id: "torqueSplit", theme: "diff", section: ANY, key: /^RearSplitSetting$/, measure: "frontShare", axes: { uExit: -0.5, traction: -0.3 } },
  // Électronique
  { id: "tc", theme: "electronics", section: ANY, key: /^TractionControl(Map)?Setting$/, measure: "index", axes: { traction: 1, uExit: 0.3, response: -0.2 } },
  { id: "tcCut", theme: "electronics", section: ANY, key: /^TCPowerCutMapSetting$/, measure: "index", axes: { traction: 0.5 } },
  { id: "tcSlip", theme: "electronics", section: ANY, key: /^TCSlipAngleMapSetting$/, measure: "index", axes: {} },
  { id: "aidSwitch", theme: "electronics", section: ANY, key: /^(TC|ABS)Setting$/, measure: "number", axes: {} },
  { id: "abs", theme: "electronics", section: ANY, key: /^AntilockBrakeSystemMapSetting$/, measure: "index", axes: {} },
  // Moteur et hybride
  { id: "regen", theme: "engine", section: ANY, key: /^RegenerationMapSetting$/, measure: "number", axes: { range: 0.5, brakeStab: -0.3 } },
  { id: "motorMap", theme: "engine", section: ANY, key: /^ElectricMotorMapSetting$/, measure: "number", axes: { range: -0.5 } },
  { id: "engineMixture", theme: "engine", section: ANY, key: /^EngineMixtureSetting$/, measure: "index", axes: {} },
  { id: "engineBoost", theme: "engine", section: ANY, key: /^(Engine)?BoostSetting$/, measure: "number", axes: {} },
  { id: "engineBraking", theme: "engine", section: ANY, key: /^EngineBrakingMapSetting$/, measure: "number", axes: {} },
  { id: "revLimit", theme: "engine", section: ANY, key: /^RevLimitSetting$/, measure: "number", axes: {} },
  // Boîte
  { id: "gearing", theme: "gearing", section: ANY, key: /^(FinalDrive|Gear\dSetting|RatioSet|Reverse)(Setting)?$/, measure: "number", axes: {} },
  { id: "gearAuto", theme: "gearing", section: ANY, key: /^GearAuto(Up|Down)ShiftSetting$/, measure: "number", axes: {} },
  // Carburant / énergie
  { id: "fuel", theme: "fuel", section: ANY, key: /^FuelSetting$/, measure: "number", axes: { range: 1 } },
  { id: "fuelCapacity", theme: "fuel", section: ANY, key: /^FuelCapacitySetting$/, measure: "number", axes: {} },
  { id: "pitStrategy", theme: "fuel", section: ANY, key: /^(NumPitstops|Pitstop\d)Setting$/, measure: "number", axes: {} },
  { id: "energy", theme: "fuel", section: ANY, key: /^VirtualEnergySetting$/, measure: "number", axes: { range: 1 } },
  // Refroidissement, direction
  { id: "cooling", theme: "cooling", section: ANY, key: /^(Water|Oil)RadiatorSetting$/, measure: "number", axes: {} },
  { id: "basic", theme: "other", section: /^BASIC$/i, key: /^(Downforce|Balance|Ride|Gearing|Custom)$/, measure: "number", axes: {} },
  { id: "steerLock", theme: "other", section: ANY, key: /^SteerLockSetting$/, measure: "number", axes: { response: -0.3 } },
];

/** Règle descriptive (aucun effet de sens connu) : son texte est « modifié ». */
export function isNeutralRule(id: string): boolean {
  return RULES.filter((r) => r.id === id).every((r) => Object.keys(r.axes).length === 0);
}

/** Réglages sans intérêt pour le pilotage (notes, stratégie d'arrêts, réglages figés). */
const SKIP = /^(Notes|Symmetric)$/i;
const FIXED = /^(n\/a|non-adjustable|fixed|nicht einstellbar|non r[ée]glable|detached|d[ée]tach[ée])$/i;

const NUM = /-?\d+(?:[.,]\d+)?/;

function num(s: string | null): number | null {
  const m = NUM.exec(s ?? "");
  return m ? Number(m[0].replace(",", ".")) : null;
}

function unit(s: string | null): string {
  return (s ?? "").replace(/-?\d+(?:[.,]\d+)?/g, "#").replace(/\s+/g, "").toLowerCase();
}

function idx(v: string): number | null {
  return /^-?\d+$/.test(v.trim()) ? Number(v.trim()) : null;
}

/** Valeur lisible (texte du garage, sinon brut). */
export function shown(value: string, comment: string | null): string {
  const c = (comment ?? "").trim();
  return c || value.trim() || "—";
}

/** Écart mesuré de B par rapport à A : signe et nombre de crans (si connus). `dir` 0 = non mesurable. */
export function measure(p: Pick<SetupDiffParam, "value_a" | "value_b" | "comment_a" | "comment_b">, how: Measure): { dir: -1 | 0 | 1; steps: number | null } {
  const ia = idx(p.value_a);
  const ib = idx(p.value_b);
  const steps = ia != null && ib != null ? ib - ia : null;
  const na = num(p.comment_a);
  const nb = num(p.comment_b);
  const sameUnit = na != null && nb != null && unit(p.comment_a) === unit(p.comment_b);
  let d: number | null = null;
  if (how === "frontShare") {
    // « 52.5:47.5 » = part avant ; l'index monte vers l'arrière.
    d = sameUnit ? -(nb! - na!) : steps;
  } else if (how === "abs") {
    d = sameUnit ? Math.abs(nb!) - Math.abs(na!) : null;
  } else if (how === "number") {
    d = sameUnit ? nb! - na! : steps;
  } else {
    d = steps ?? (sameUnit ? nb! - na! : null);
  }
  const dir = d == null || Math.abs(d) < 1e-9 ? 0 : d > 0 ? 1 : -1;
  return { dir, steps: steps != null ? Math.abs(steps) : null };
}

/** « slow », « fast », « third-slow », « gear3 »… pour distinguer deux écarts d'une même règle. */
export function variantOf(key: string, section = ""): string | null {
  if (/^Tender|^SpringRubber|^BumpStop/.test(key) || /^(Front|Rear)3rdTender/.test(key)) {
    if (/^Front3rd/.test(key)) return "third-front";
    if (/^Rear3rd/.test(key)) return "third-rear";
    return /^FRONT/i.test(section) ? "front" : /^REAR/i.test(section) ? "rear" : null;
  }
  if (/^Left/.test(key)) return "left";
  if (/^Right/.test(key)) return "right";
  if (/^(Front|Rear)ToeOffset/.test(key)) return /^Front/.test(key) ? "front" : "rear";
  if (/^GearAutoUp/.test(key)) return "shiftUp";
  if (/^GearAutoDown/.test(key)) return "shiftDown";
  if (/^TCSetting$/.test(key)) return "tc";
  if (/^ABSSetting$/.test(key)) return "absOn";
  if (/^NumPitstops/.test(key)) return "stops";
  const stop = /^Pitstop(\d)Setting$/.exec(key);
  if (stop) return `stop${stop[1]}`;
  if (/^Handfront/.test(key)) return "front";
  const third = /^(Front|Rear)3rd/.test(key) ? "third-" : "";
  const sp = /Slow/.test(key) ? "slow" : /Fast/.test(key) ? "fast" : "";
  if (sp) return third + sp;
  if (third) return "third";
  const g = /^Gear(\d)Setting$/.exec(key);
  if (g) return `gear${g[1]}`;
  if (/^FinalDrive/.test(key)) return "final";
  if (/^BrakeDuctRear/.test(key)) return "rear";
  if (/^BrakeDuct/.test(key)) return "front";
  if (/^Oil/.test(key)) return "oil";
  if (/^Water/.test(key)) return "water";
  if (/^BrakeDisc/.test(key)) return "disc";
  if (/^BrakePad/.test(key)) return "pad";
  return null;
}

/** Règle d'un réglage (section + clé), `undefined` si aucune ; les notes ne sont pas des réglages. */
export function ruleFor(section: string, key: string): Rule | undefined {
  return RULES.find((r) => r.section.test(section) && r.key.test(key));
}

export function isSetting(key: string): boolean {
  return !SKIP.test(key);
}

export interface RuleChange {
  id: string;
  theme: Theme;
  /** Clé du jeu (pour l'infobulle) et section. */
  key: string;
  sections: string[];
  a: string;
  b: string;
  dir: -1 | 0 | 1;
  steps: number | null;
  /** Précision du libellé : amortisseur lent / rapide, 3ᵉ élément, rapport de boîte. */
  variant: string | null;
  /** Effets de cet écart (B vs A), déjà signés. */
  effects: Partial<Record<Axis, number>>;
}

export interface AxisTrend {
  axis: Axis;
  score: number;
  /** Règles responsables, de la plus forte à la plus faible. */
  by: string[];
}

export interface RulesReport {
  changes: RuleChange[];
  /** Réglages différents sans règle (clé brute + valeurs). */
  others: { section: string; key: string; a: string; b: string }[];
  trends: AxisTrend[];
  /** Traits pour « Choisis A / B » : axe et signe vu de B. */
  preferB: { axis: Axis; sign: 1 | -1 }[];
}

/** Seuil d'une tendance « nette » dans le bilan. */
export const TREND_MIN = 0.5;
export const TREND_STRONG = 1.5;

export function compareByRules(diffs: SetupDiffSection[]): RulesReport {
  // Regroupe par règle + valeurs : gauche et droite d'un même essieu ne font qu'un écart.
  const groups = new Map<string, RuleChange>();
  const others: RulesReport["others"] = [];
  for (const s of diffs)
    for (const p of s.params) {
      if (!p.is_diff || SKIP.test(p.key)) continue;
      // Même index : seul le texte diffère (langue du jeu) — pas un écart.
      if (p.value_a.trim() !== "" && p.value_a.trim() === p.value_b.trim()) continue;
      const a = shown(p.value_a, p.comment_a);
      const b = shown(p.value_b, p.comment_b);
      if (FIXED.test(a) && FIXED.test(b)) continue;
      const rule = ruleFor(s.name, p.key);
      if (!rule) {
        others.push({ section: s.name, key: p.key, a, b });
        continue;
      }
      const { dir, steps } = measure(p, rule.measure);
      const effects: Partial<Record<Axis, number>> = {};
      if (dir !== 0) for (const [ax, w] of Object.entries(rule.axes) as [Axis, number][]) effects[ax] = w * dir;
      const gk = `${rule.id}|${p.key}|${a}|${b}`;
      const g = groups.get(gk);
      if (g) g.sections.push(s.name);
      else groups.set(gk, { id: rule.id, theme: rule.theme, key: p.key, sections: [s.name], a, b, dir, steps, variant: variantOf(p.key, s.name), effects });
    }
  const changes = [...groups.values()].sort((x, y) => THEMES.indexOf(x.theme) - THEMES.indexOf(y.theme));

  const trends: AxisTrend[] = [];
  for (const axis of AXES) {
    const contrib = changes
      .map((c) => ({ id: c.id, w: c.effects[axis] ?? 0 }))
      .filter((x) => x.w !== 0);
    const score = Math.round(contrib.reduce((n, x) => n + x.w, 0) * 10) / 10;
    if (Math.abs(score) < TREND_MIN) continue;
    const sign = Math.sign(score);
    const by = [...new Set(contrib.filter((x) => Math.sign(x.w) === sign).sort((p, q) => Math.abs(q.w) - Math.abs(p.w)).map((x) => x.id))];
    trends.push({ axis, score, by });
  }
  const preferB = [...trends]
    .sort((p, q) => Math.abs(q.score) - Math.abs(p.score))
    .slice(0, 4)
    .map((t) => ({ axis: t.axis, sign: (t.score > 0 ? 1 : -1) as 1 | -1 }));
  return { changes, others, trends, preferB };
}
