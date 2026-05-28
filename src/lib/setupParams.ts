/**
 * Mapping des clés brutes `.svm` (rF2 / LMU) vers des libellés lisibles.
 * Les termes restent en anglais — convention « racing parlance » respectée
 * par la V1 PHP (qui affichait « Engine Map », « Brake Bias », « Camber »…
 * même dans l'UI française).
 *
 * Pour les clés inconnues, on retombe sur `humanize` qui retire le suffixe
 * « Setting » et casse le camelCase / les chiffres.
 */

const PARAM_LABEL: Record<string, string> = {
  // ── Engine ────────────────────────────────────────────────────────────
  RevLimit: "Rev Limit",
  EngineMixture: "Engine Map",
  EngineBoost: "Boost",
  Fuel: "Fuel",
  Notes: "Notes",

  // ── Driveline / gearbox ──────────────────────────────────────────────
  Reverse: "Reverse",
  FinalDrive: "Final Drive",
  Gear1: "1st Gear",
  Gear2: "2nd Gear",
  Gear3: "3rd Gear",
  Gear4: "4th Gear",
  Gear5: "5th Gear",
  Gear6: "6th Gear",
  Gear7: "7th Gear",
  Gear8: "8th Gear",
  Gear9: "9th Gear",
  DifferentialPreload: "Diff Preload",
  DifferentialPower: "Diff Power",
  DifferentialCoast: "Diff Coast",
  DiffPreload: "Diff Preload",
  DiffPower: "Diff Power",
  DiffCoast: "Diff Coast",
  DiffPump: "Diff Pump",
  DiffPumpTaper: "Diff Pump Taper",
  CenterDiffPreload: "Center Diff Preload",
  CenterDiffPower: "Center Diff Power",
  CenterDiffCoast: "Center Diff Coast",
  TorqueSplit: "Torque Split",

  // ── Controls ──────────────────────────────────────────────────────────
  BrakeBias: "Brake Bias",
  RearBrake: "Brake Bias (rear)",
  TractionControl: "TC Level",
  TC: "TC",
  TC1: "TC Slip",
  TC2: "TC Cut",
  AntiLockBrakes: "ABS",
  ABS: "ABS",
  SteerLock: "Steering Lock",
  SteerRatio: "Steering Ratio",
  StartingMap: "Starting Map",

  // ── Wheels — communs FRONTLEFT/FRONTRIGHT/REARLEFT/REARRIGHT ────────
  Camber: "Camber",
  Toe: "Toe",
  ToeIn: "Toe-In",
  Pressure: "Pressure",
  Compound: "Tyre Compound",
  TyreCompound: "Tyre Compound",
  TireCompound: "Tyre Compound",
  BrakeDisc: "Brake Disc",
  BrakeDuct: "Brake Duct",
  BrakePad: "Brake Pad",
  BrakePressure: "Brake Pressure",

  // ── Suspension ───────────────────────────────────────────────────────
  Spring: "Spring Rate",
  SpringRate: "Spring Rate",
  SpringRubber: "Spring Rubber",
  RideHeight: "Ride Height",
  BumpRubber: "Bump Rubber",
  Packer: "Packer",
  PackerRate: "Packer",
  SlowBump: "Slow Bump",
  FastBump: "Fast Bump",
  SlowRebound: "Slow Rebound",
  FastRebound: "Fast Rebound",
  TenderSpring: "Tender Spring",
  TenderTransition: "Tender Transition",
  CamberLink: "Camber Link",
  ToeLink: "Toe Link",

  // ── Chassis ──────────────────────────────────────────────────────────
  AntiSway: "Anti-Roll Bar",
  AntiSwayBar: "Anti-Roll Bar",
  ARB: "Anti-Roll Bar",
  ThirdSpring: "Third Spring",
  ThirdSlowBump: "Third Slow Bump",
  ThirdFastBump: "Third Fast Bump",
  ThirdSlowRebound: "Third Slow Rebound",
  ThirdFastRebound: "Third Fast Rebound",
  ThirdPacker: "Third Packer",
  ThirdSpringRubber: "Third Spring Rubber",
  Wedge: "Wedge",
  WeightDistribFront: "Weight Distribution",
  CrossWeight: "Cross Weight",

  // ── Aero ─────────────────────────────────────────────────────────────
  FrontWing: "Front Wing",
  RearWing: "Rear Wing",
  FW: "Front Wing",
  RW: "Rear Wing",
  RWMain: "Rear Wing",
  Diveplane: "Diveplane",
  Splitter: "Splitter",
  Radiator: "Radiator",
  BrakeDuctOpen: "Brake Duct Opening",

  // ── Fender / divers ──────────────────────────────────────────────────
  FenderFlare: "Fender Flare",
  GrilleOpening: "Grille",
  Mirror: "Mirror",
  WindshieldTear: "Windshield Tear-Off",

  // ── General / Basic ──────────────────────────────────────────────────
  Symmetric: "Symmetric",
  NoCommentInPit: "Skip Pit Stop",
  AdjustablePedals: "Pedal Position",
  FuelLoad: "Fuel Load",
  FuelCapacity: "Fuel Capacity",
  Headlights: "Headlights",
  DRS: "DRS",
};

/**
 * Convertit une clé en libellé lisible quand elle n'est pas dans le mapping :
 *  - retire le suffixe « Setting » (insensible à la casse)
 *  - sépare le camelCase (« RevLimit » → « Rev Limit »)
 *  - sépare les transitions lettre→chiffre (« Gear2 » → « Gear 2 »)
 *  - normalise les underscores en espaces
 */
function humanize(key: string): string {
  return key
    .replace(/Setting$/i, "")
    .replace(/_+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Renvoie un libellé affichable pour un paramètre `.svm`. Stratégie :
 *  1. Match exact dans `PARAM_LABEL`.
 *  2. Strip du suffixe « Setting » puis re-match.
 *  3. Fallback `humanize`.
 */
export function paramLabel(key: string): string {
  if (PARAM_LABEL[key]) return PARAM_LABEL[key];
  const stripped = key.replace(/Setting$/i, "");
  if (PARAM_LABEL[stripped]) return PARAM_LABEL[stripped];
  return humanize(key);
}
