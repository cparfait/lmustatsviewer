/**
 * Résumé compact d'un setup `.svm` lié à une session, pour le contexte du coach.
 *
 * Format `.svm` (LMU/rFactor2) : chaque ligne `CléSetting=val//commentaire`. La
 * **valeur lisible** est dans le commentaire (ex. `RWSetting=//7.0 deg`,
 * `TractionControlMapSetting=//7`). On préfère donc le `comment` ; on ignore les
 * paramètres non pertinents (`N/A`, `Non-adjustable`, `Fixed`, `Detached`, vide).
 *
 * But : le coach raisonne sur le **vrai réglage** (aéro, suspension, freins,
 * électronique, différentiel, 4 coins) au lieu de deviner.
 */

import type { SvmFile, SvmSection } from "../../api";

const SKIP = /^(n\/a|non-adjustable|fixed|detached|standard|—|-)?$/i;

/** Valeur lisible d'un paramètre (comment prioritaire), ou null si non pertinent. */
function val(section: SvmSection | undefined, key: string): string | null {
  const p = section?.params.find((x) => x.key === key);
  if (!p) return null;
  const v = (p.comment ?? "").trim() || p.value.trim();
  if (!v || SKIP.test(v)) return null;
  return v;
}

/** Assemble « label v » en omettant les parties nulles. */
function join(parts: (string | null)[]): string {
  return parts.filter(Boolean).join(", ");
}

export function buildSetupSummary(svm: SvmFile, name?: string): string {
  const sec = (n: string) => svm.sections.find((s) => s.name.toUpperCase() === n);
  const general = sec("GENERAL");
  const fw = sec("FRONTWING");
  const rw = sec("REARWING");
  const aero = sec("BODYAERO");
  const susp = sec("SUSPENSION");
  const ctrl = sec("CONTROLS");
  const eng = sec("ENGINE");
  const drv = sec("DRIVELINE");

  const lines: string[] = [];
  lines.push(`## Car setup (.svm${name ? `: ${name}` : ""})`);

  const fuel = join([
    val(general, "FuelSetting") && `fuel ${val(general, "FuelSetting")}`,
    val(general, "VirtualEnergySetting") && `virtual energy ${val(general, "VirtualEnergySetting")}`,
  ]);
  if (fuel) lines.push(`Energy: ${fuel}`);

  const aeroLine = join([
    val(fw, "FWSetting") && `front wing ${val(fw, "FWSetting")}`,
    val(rw, "RWSetting") && `rear wing ${val(rw, "RWSetting")}`,
    val(aero, "BrakeDuctSetting") && `front brake duct ${val(aero, "BrakeDuctSetting")}`,
    val(aero, "BrakeDuctRearSetting") && `rear brake duct ${val(aero, "BrakeDuctRearSetting")}`,
  ]);
  if (aeroLine) lines.push(`Aero: ${aeroLine}`);

  const suspLine = join([
    val(susp, "FrontAntiSwaySetting") && `front ARB ${val(susp, "FrontAntiSwaySetting")}`,
    val(susp, "RearAntiSwaySetting") && `rear ARB ${val(susp, "RearAntiSwaySetting")}`,
    val(susp, "FrontToeInSetting") && `front toe ${val(susp, "FrontToeInSetting")}`,
    val(susp, "RearToeInSetting") && `rear toe ${val(susp, "RearToeInSetting")}`,
    val(susp, "LeftCasterSetting") && `caster ${val(susp, "LeftCasterSetting")}`,
  ]);
  if (suspLine) lines.push(`Suspension: ${suspLine}`);

  const brakeLine = join([
    val(ctrl, "RearBrakeSetting") && `bias ${val(ctrl, "RearBrakeSetting")}`,
    val(ctrl, "BrakeMigrationSetting") && `migration ${val(ctrl, "BrakeMigrationSetting")}`,
    val(ctrl, "BrakePressureSetting") && `pressure ${val(ctrl, "BrakePressureSetting")}`,
  ]);
  if (brakeLine) lines.push(`Brakes: ${brakeLine}`);

  const elecLine = join([
    val(ctrl, "TractionControlMapSetting") && `TC map ${val(ctrl, "TractionControlMapSetting")}`,
    val(ctrl, "TCPowerCutMapSetting") && `TC power cut ${val(ctrl, "TCPowerCutMapSetting")}`,
    val(ctrl, "TCSlipAngleMapSetting") && `TC slip ${val(ctrl, "TCSlipAngleMapSetting")}`,
    val(ctrl, "AntilockBrakeSystemMapSetting") && `ABS map ${val(ctrl, "AntilockBrakeSystemMapSetting")}`,
    val(eng, "RegenerationMapSetting") && `regen ${val(eng, "RegenerationMapSetting")}`,
    val(eng, "ElectricMotorMapSetting") && `motor map ${val(eng, "ElectricMotorMapSetting")}`,
    val(eng, "EngineMixtureSetting") && `mixture ${val(eng, "EngineMixtureSetting")}`,
    val(eng, "EngineBrakingMapSetting") && `engine braking ${val(eng, "EngineBrakingMapSetting")}`,
  ]);
  if (elecLine) lines.push(`Electronics: ${elecLine}`);

  const diffLine = join([
    val(drv, "DiffPreloadSetting") && `preload ${val(drv, "DiffPreloadSetting")}`,
    val(drv, "DiffPowerSetting") && `power ${val(drv, "DiffPowerSetting")}`,
    val(drv, "DiffCoastSetting") && `coast ${val(drv, "DiffCoastSetting")}`,
  ]);
  if (diffLine) lines.push(`Differential: ${diffLine}`);

  // 4 coins : camber / pression / ressort / hauteur / amortisseurs / compound.
  const corners: [string, string][] = [
    ["FL", "FRONTLEFT"],
    ["FR", "FRONTRIGHT"],
    ["RL", "REARLEFT"],
    ["RR", "REARRIGHT"],
  ];
  const cornerLines: string[] = [];
  for (const [label, secName] of corners) {
    const s = sec(secName);
    const line = join([
      val(s, "CamberSetting") && `camber ${val(s, "CamberSetting")}`,
      val(s, "PressureSetting") && `${val(s, "PressureSetting")}`,
      val(s, "SpringSetting") && `spring ${val(s, "SpringSetting")}`,
      val(s, "RideHeightSetting") && `ride ${val(s, "RideHeightSetting")}`,
      (val(s, "SlowBumpSetting") || val(s, "FastBumpSetting")) &&
        `bump ${val(s, "SlowBumpSetting") ?? "?"}/${val(s, "FastBumpSetting") ?? "?"}`,
      (val(s, "SlowReboundSetting") || val(s, "FastReboundSetting")) &&
        `rebound ${val(s, "SlowReboundSetting") ?? "?"}/${val(s, "FastReboundSetting") ?? "?"}`,
      val(s, "CompoundSetting") && `${val(s, "CompoundSetting")}`,
    ]);
    if (line) cornerLines.push(`  ${label}: ${line}`);
  }
  if (cornerLines.length) {
    lines.push("Corners (camber / pressure / spring / ride / bump slow-fast / rebound slow-fast / compound):");
    lines.push(...cornerLines);
  }

  return lines.join("\n");
}
