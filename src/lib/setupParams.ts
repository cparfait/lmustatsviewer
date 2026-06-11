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
  EngineBrakingMap: "Engine Braking Map",
  ElectricMotorMap: "Electric Motor Map",
  RegenerationMap: "Regen Map",
  VirtualEnergy: "Virtual Energy",
  OilRadiator: "Oil Radiator",
  WaterRadiator: "Water Radiator",
  Fuel: "Fuel",
  NumPitstops: "Pit Stops",
  Pitstop1: "Pit Stop 1 (fuel)",
  Pitstop2: "Pit Stop 2 (fuel)",
  Pitstop3: "Pit Stop 3 (fuel)",
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
  FrontDiffPreload: "Front Diff Preload",
  FrontDiffPower: "Front Diff Power",
  FrontDiffCoast: "Front Diff Coast",
  FrontDiffPump: "Front Diff Pump",
  TorqueSplit: "Torque Split",
  RatioSet: "Gear Ratio Set",
  GearAutoUpShift: "Auto Upshift",
  GearAutoDownShift: "Auto Downshift",
  RearSplit: "Rear Split",

  // ── Controls ──────────────────────────────────────────────────────────
  BrakeBias: "Brake Bias",
  RearBrake: "Brake Bias (rear)",
  TractionControl: "TC Level",
  TractionControlMap: "TC Map",
  TCPowerCutMap: "TC Power Cut",
  TCSlipAngleMap: "TC Slip Angle",
  TC: "TC",
  TC1: "TC Slip",
  TC2: "TC Cut",
  AntiLockBrakes: "ABS",
  AntilockBrakeSystemMap: "ABS Map",
  ABS: "ABS",
  BrakeMigration: "Brake Migration",
  HandbrakePress: "Handbrake Pressure",
  HandfrontbrakePress: "Front Handbrake Pressure",
  SteerLock: "Steering Lock",
  SteerRatio: "Steering Ratio",
  StartingMap: "Starting Map",

  // ── Wheels — communs FRONTLEFT/FRONTRIGHT/REARLEFT/REARRIGHT ────────
  Camber: "Camber",
  Toe: "Toe",
  ToeIn: "Toe-In",
  FrontToeIn: "Front Toe-In",
  RearToeIn: "Rear Toe-In",
  FrontToeOffset: "Front Toe Offset",
  RearToeOffset: "Rear Toe Offset",
  LeftCaster: "Caster (left)",
  RightCaster: "Caster (right)",
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
  TenderTravel: "Tender Travel",
  CamberLink: "Camber Link",
  ToeLink: "Toe Link",
  LeftTrackBar: "Track Bar (left)",
  RightTrackBar: "Track Bar (right)",

  // ── Chassis ──────────────────────────────────────────────────────────
  AntiSway: "Anti-Roll Bar",
  AntiSwayBar: "Anti-Roll Bar",
  ARB: "Anti-Roll Bar",
  FrontAntiSway: "Front Anti-Roll Bar",
  RearAntiSway: "Rear Anti-Roll Bar",
  ThirdSpring: "Third Spring",
  ThirdSlowBump: "Third Slow Bump",
  ThirdFastBump: "Third Fast Bump",
  ThirdSlowRebound: "Third Slow Rebound",
  ThirdFastRebound: "Third Fast Rebound",
  ThirdPacker: "Third Packer",
  ThirdSpringRubber: "Third Spring Rubber",
  Front3rdSpring: "Front Third Spring",
  Front3rdSlowBump: "Front Third Slow Bump",
  Front3rdFastBump: "Front Third Fast Bump",
  Front3rdSlowRebound: "Front Third Slow Rebound",
  Front3rdFastRebound: "Front Third Fast Rebound",
  Front3rdPacker: "Front Third Packer",
  Front3rdTenderSpring: "Front Third Tender Spring",
  Front3rdTenderTravel: "Front Third Tender Travel",
  Rear3rdSpring: "Rear Third Spring",
  Rear3rdSlowBump: "Rear Third Slow Bump",
  Rear3rdFastBump: "Rear Third Fast Bump",
  Rear3rdSlowRebound: "Rear Third Slow Rebound",
  Rear3rdFastRebound: "Rear Third Fast Rebound",
  Rear3rdPacker: "Rear Third Packer",
  Rear3rdTenderSpring: "Rear Third Tender Spring",
  Rear3rdTenderTravel: "Rear Third Tender Travel",
  FrontWheelTrack: "Front Wheel Track",
  RearWheelTrack: "Rear Wheel Track",
  CGHeight: "CG Height",
  CGRear: "CG Rear",
  CGRight: "CG Right",
  Wedge: "Wedge",
  WeightDistribFront: "Weight Distribution",
  CrossWeight: "Cross Weight",
  VehicleClass: "Vehicle Class",
  Upgrade: "Upgrade",

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
  BrakeDuctRear: "Rear Brake Duct",

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
 *  - sépare les acronymes (« TCPowerCutMap » → « TC Power Cut Map »)
 *  - sépare les transitions lettre→chiffre (« Gear2 » → « Gear 2 »)
 *  - normalise les underscores en espaces
 */
function humanize(key: string): string {
  return key
    .replace(/Setting$/i, "")
    .replace(/_+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
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
