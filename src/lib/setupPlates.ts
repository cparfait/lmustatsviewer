/**
 * Planche des réglages (opt-in, Config › Atelier) : la voiture vue de dessus,
 * découpée en pièces. Chaque pièce dit son rôle, une astuce, les phases du
 * virage où elle agit, et les réglages du `.svm` qui la commandent (avec la
 * valeur du setup ouvert). Données maison ; les textes sont dans `lab.plates`.
 */

import type { SvmFile } from "@/lib/api";
import { displayOf, isFixedParam } from "@/lib/setupView";

export type Phase = "braking" | "entry" | "mid" | "exit" | "straight";

export interface PlatePart {
  id: string;
  /** Réglages qui commandent la pièce : (section, clé), expressions régulières. */
  keys: { section: RegExp; key: RegExp }[];
  phases: Phase[];
}

const ANY = /.*/;
const FRONT = /^FRONT(LEFT|RIGHT)$/i;
const REAR = /^REAR(LEFT|RIGHT)$/i;

export const PARTS: PlatePart[] = [
  { id: "frontWing", keys: [{ section: ANY, key: /^(FW|FrontWing)Setting$/ }], phases: ["entry", "mid"] },
  { id: "rearWing", keys: [{ section: ANY, key: /^(RW|RearWing)Setting$/ }], phases: ["mid", "exit", "straight"] },
  {
    id: "floor",
    keys: [
      { section: FRONT, key: /^RideHeightSetting$/ },
      { section: REAR, key: /^RideHeightSetting$/ },
    ],
    phases: ["mid", "straight"],
  },
  {
    id: "frontSuspension",
    keys: [
      { section: FRONT, key: /^SpringSetting$/ },
      { section: ANY, key: /^FrontAntiSwaySetting$/ },
      { section: FRONT, key: /^(Slow|Fast)(Bump|Rebound)Setting$/ },
      { section: ANY, key: /^Front3rd(Spring|Packer)Setting$/ },
    ],
    phases: ["braking", "entry", "mid"],
  },
  {
    id: "rearSuspension",
    keys: [
      { section: REAR, key: /^SpringSetting$/ },
      { section: ANY, key: /^RearAntiSwaySetting$/ },
      { section: REAR, key: /^(Slow|Fast)(Bump|Rebound)Setting$/ },
      { section: ANY, key: /^Rear3rd(Spring|Packer)Setting$/ },
    ],
    phases: ["mid", "exit"],
  },
  {
    id: "frontTyres",
    keys: [
      { section: FRONT, key: /^(Pressure|Camber)Setting$/ },
      { section: ANY, key: /^FrontToeInSetting$/ },
    ],
    phases: ["entry", "mid"],
  },
  {
    id: "rearTyres",
    keys: [
      { section: REAR, key: /^(Pressure|Camber)Setting$/ },
      { section: ANY, key: /^RearToeInSetting$/ },
    ],
    phases: ["mid", "exit"],
  },
  {
    id: "brakes",
    keys: [
      { section: ANY, key: /^RearBrakeSetting$/ },
      { section: ANY, key: /^BrakePressureSetting$/ },
      { section: ANY, key: /^BrakeMigrationSetting$/ },
      { section: ANY, key: /^BrakeDuct(Rear)?Setting$/ },
    ],
    phases: ["braking", "entry"],
  },
  {
    id: "differential",
    keys: [{ section: ANY, key: /^Diff(Power|Coast|Preload)Setting$/ }],
    phases: ["entry", "exit"],
  },
  {
    id: "gearbox",
    keys: [
      { section: ANY, key: /^FinalDriveSetting$/ },
      { section: ANY, key: /^RatioSetSetting$/ },
    ],
    phases: ["exit", "straight"],
  },
  {
    id: "electronics",
    keys: [
      { section: ANY, key: /^TractionControlMapSetting$/ },
      { section: ANY, key: /^TC(PowerCut|SlipAngle)MapSetting$/ },
      { section: ANY, key: /^AntilockBrakeSystemMapSetting$/ },
    ],
    phases: ["braking", "exit"],
  },
  {
    id: "engine",
    keys: [
      { section: ANY, key: /^EngineMixtureSetting$/ },
      { section: ANY, key: /^(Regeneration|ElectricMotor)MapSetting$/ },
      { section: ANY, key: /^(Water|Oil)RadiatorSetting$/ },
    ],
    phases: ["exit", "straight"],
  },
];

export interface PartValue {
  section: string;
  key: string;
  value: string;
}

/** Réglages présents et réglables de la pièce sur ce fichier. */
export function partValues(svm: SvmFile, part: PlatePart): PartValue[] {
  const out: PartValue[] = [];
  for (const s of svm.sections)
    for (const p of s.params) {
      if (isFixedParam(p)) continue;
      if (!part.keys.some((k) => k.section.test(s.name) && k.key.test(p.key))) continue;
      out.push({ section: s.name, key: p.key, value: displayOf(p) });
    }
  return out;
}
