export type CarClass = "Hypercar" | "LMP2_WEC" | "LMP2_ELMS" | "LMP3" | "GT3" | "GTE";

export const CAR_CLASS_LABELS: Record<CarClass, string> = {
  Hypercar: "Hypercar",
  LMP2_WEC: "LMP2 WEC",
  LMP2_ELMS: "LMP2 ELMS",
  LMP3: "LMP3",
  GT3: "GT3",
  GTE: "GTE",
};

export type Tier = "Alien" | "Pro" | "Semi-Pro" | "Amateur" | "Offline";
export type SessionType = "Race" | "Qualifying" | "Practice";
export type ConnectionType = "Online" | "Offline";

export interface GameVersion {
  id: string;
  label: string;
  build: string;
  releasedAt: string;
  isCurrent?: boolean;
  isLatest?: boolean;
}

export const gameVersions: GameVersion[] = [
  { id: "0.9200", label: "0.9200", build: "22030", releasedAt: "2025-11-15" },
  { id: "1.0110", label: "1.0110", build: "25400", releasedAt: "2026-02-20", isCurrent: true },
  { id: "1.5000", label: "1.5000", build: "28500", releasedAt: "2026-05-05", isLatest: true },
];

export const CURRENT_VERSION_ID = "1.0110";
export const LATEST_VERSION_ID = "1.5000";

// ─── Circuits & flags ────────────────────────────────────────────────────────
export interface CircuitInfo {
  name: string;
  country: string; // ISO 3166-1 alpha-2 (lowercase)
  flag: string;    // emoji
}

export const circuitInfo: Record<string, CircuitInfo> = {
  "Algarve International Circuit": { name: "Algarve International Circuit", country: "pt", flag: "🇵🇹" },
  "Autodromo Nazionale Monza":     { name: "Autodromo Nazionale Monza",     country: "it", flag: "🇮🇹" },
  "Monza":                          { name: "Monza",                          country: "it", flag: "🇮🇹" },
  "Le Mans":                        { name: "Le Mans",                        country: "fr", flag: "🇫🇷" },
  "Spa-Francorchamps":              { name: "Spa-Francorchamps",              country: "be", flag: "🇧🇪" },
  "Fuji":                           { name: "Fuji",                           country: "jp", flag: "🇯🇵" },
  "Bahrain":                        { name: "Bahrain",                        country: "bh", flag: "🇧🇭" },
  "Sebring":                        { name: "Sebring",                        country: "us", flag: "🇺🇸" },
  "Imola":                          { name: "Imola",                          country: "it", flag: "🇮🇹" },
  "Portimão":                      { name: "Portimão",                       country: "pt", flag: "🇵🇹" },
};

export function getCircuitInfo(track: string): CircuitInfo {
  return circuitInfo[track] ?? { name: track, country: "xx", flag: "🏁" };
}

// ─── Best laps (enriched) ────────────────────────────────────────────────────
export interface BestLap {
  id: string;
  track: string;
  layout: string;
  class: CarClass;
  car: string;
  livery: string;
  type: ConnectionType;
  sessionType: SessionType;
  sessionId: string;       // → /sessions/:id
  lapMs: number;
  s1Ms: number;
  s2Ms: number;
  s3Ms: number;
  optimalMs: number;       // somme des meilleurs secteurs
  vMaxKmh: number;
  finishPosition: string;  // "P10", "P3/23", "N/A" (quali/practice)
  progression: number | null; // positions gained (race only), null = N/A
  tier: Tier;
  vsAlienMs: number;
  date: string;            // YYYY-MM-DD
  dateTime: string;        // human readable
  versionId: string;
}

export const bestLaps: BestLap[] = [
  { id: "bl1", track: "Algarve International Circuit", layout: "Algarve International Circuit", class: "GT3", car: "Mercedes-AMG LMGT3", livery: "Iron Lynx 2025 #60:LM", type: "Online", sessionType: "Race", sessionId: "s8", lapMs: 111_382, s1Ms: 23_957, s2Ms: 39_434, s3Ms: 47_990, optimalMs: 110_898, vMaxKmh: 263, finishPosition: "P10/18", progression: 4, tier: "Semi-Pro", vsAlienMs: 3567, date: "2026-04-31", dateTime: "31/04/2026 21:31", versionId: "1.0110" },
  { id: "bl2", track: "Autodromo Nazionale Monza", layout: "Autodromo Nazionale Monza", class: "LMP2_ELMS", car: "Oreca 07", livery: "AO by TF 2024 #14:LM", type: "Online", sessionType: "Qualifying", sessionId: "s9", lapMs: 109_735, s1Ms: 36_169, s2Ms: 37_416, s3Ms: 36_148, optimalMs: 109_733, vMaxKmh: 287, finishPosition: "N/A", progression: null, tier: "Pro", vsAlienMs: 1234, date: "2026-04-06", dateTime: "06/04/2026 18:20", versionId: "0.9200" },
  { id: "bl3", track: "Autodromo Nazionale Monza", layout: "Autodromo Nazionale Monza", class: "GT3", car: "Porsche 911 GT3 R LMGT3", livery: "Manthey Ema 2024 #91:LM", type: "Online", sessionType: "Race", sessionId: "s10", lapMs: 115_002, s1Ms: 37_745, s2Ms: 39_073, s3Ms: 38_182, optimalMs: 114_748, vMaxKmh: 264, finishPosition: "P11/22", progression: 9, tier: "Amateur", vsAlienMs: 4500, date: "2026-04-21", dateTime: "21/04/2026 12:11", versionId: "0.9200" },
  { id: "bl4", track: "Le Mans", layout: "24h Circuit", class: "Hypercar", car: "Toyota GR010 Hybrid", livery: "Toyota Gazoo Racing #7", type: "Online", sessionType: "Race", sessionId: "s1", lapMs: 204_567, s1Ms: 68_234, s2Ms: 72_123, s3Ms: 64_210, optimalMs: 204_212, vMaxKmh: 332, finishPosition: "P3/23", progression: 2, tier: "Alien", vsAlienMs: 0, date: "2026-05-08", dateTime: "08/05/2026 14:00", versionId: "1.5000" },
  { id: "bl5", track: "Le Mans", layout: "24h Circuit", class: "Hypercar", car: "Ferrari 499P", livery: "AF Corse #50", type: "Offline", sessionType: "Practice", sessionId: "s4", lapMs: 205_120, s1Ms: 68_512, s2Ms: 72_356, s3Ms: 64_252, optimalMs: 205_001, vMaxKmh: 329, finishPosition: "N/A", progression: null, tier: "Pro", vsAlienMs: 553, date: "2026-04-12", dateTime: "12/04/2026 19:45", versionId: "1.0110" },
  { id: "bl6", track: "Le Mans", layout: "24h Circuit", class: "Hypercar", car: "Porsche 963", livery: "Porsche Penske #5", type: "Online", sessionType: "Race", sessionId: "s11", lapMs: 207_988, s1Ms: 69_001, s2Ms: 73_587, s3Ms: 65_400, optimalMs: 207_788, vMaxKmh: 330, finishPosition: "P5/22", progression: -1, tier: "Pro", vsAlienMs: 3421, date: "2025-12-02", dateTime: "02/12/2025 21:10", versionId: "0.9200" },
  { id: "bl7", track: "Le Mans", layout: "24h Circuit", class: "LMP2_WEC", car: "Oreca 07", livery: "Inter Europol #34", type: "Online", sessionType: "Race", sessionId: "s12", lapMs: 210_123, s1Ms: 70_445, s2Ms: 74_222, s3Ms: 65_456, optimalMs: 209_876, vMaxKmh: 321, finishPosition: "P2/19", progression: 3, tier: "Pro", vsAlienMs: 1234, date: "2026-05-05", dateTime: "05/05/2026 16:20", versionId: "1.5000" },
  { id: "bl8", track: "Le Mans", layout: "24h Circuit", class: "LMP2_ELMS", car: "Oreca 07", livery: "Algarve Pro #25", type: "Online", sessionType: "Qualifying", sessionId: "s13", lapMs: 212_456, s1Ms: 71_023, s2Ms: 74_998, s3Ms: 66_435, optimalMs: 212_222, vMaxKmh: 318, finishPosition: "N/A", progression: null, tier: "Pro", vsAlienMs: 2890, date: "2026-04-29", dateTime: "29/04/2026 20:45", versionId: "1.0110" },
  { id: "bl9", track: "Spa-Francorchamps", layout: "GP", class: "Hypercar", car: "Ferrari 499P", livery: "AF Corse #51", type: "Online", sessionType: "Qualifying", sessionId: "s2", lapMs: 122_345, s1Ms: 36_123, s2Ms: 48_789, s3Ms: 37_433, optimalMs: 122_022, vMaxKmh: 308, finishPosition: "N/A", progression: null, tier: "Pro", vsAlienMs: 1567, date: "2026-05-09", dateTime: "09/05/2026 19:00", versionId: "1.5000" },
  { id: "bl10", track: "Spa-Francorchamps", layout: "GP", class: "GT3", car: "Ferrari 296 GT3", livery: "Iron Lynx #51", type: "Online", sessionType: "Race", sessionId: "s3", lapMs: 138_234, s1Ms: 42_123, s2Ms: 54_111, s3Ms: 42_000, optimalMs: 138_022, vMaxKmh: 286, finishPosition: "P2/19", progression: 1, tier: "Semi-Pro", vsAlienMs: 3400, date: "2026-05-07", dateTime: "07/05/2026 20:15", versionId: "1.5000" },
  { id: "bl11", track: "Spa-Francorchamps", layout: "GP", class: "GT3", car: "Porsche 911 GT3 R", livery: "Manthey EMA #91", type: "Online", sessionType: "Race", sessionId: "s14", lapMs: 139_512, s1Ms: 42_678, s2Ms: 54_667, s3Ms: 42_167, optimalMs: 139_223, vMaxKmh: 285, finishPosition: "P4/19", progression: 0, tier: "Semi-Pro", vsAlienMs: 4678, date: "2026-04-22", dateTime: "22/04/2026 21:00", versionId: "1.0110" },
  { id: "bl12", track: "Fuji", layout: "GP", class: "Hypercar", car: "Cadillac V-Series.R", livery: "Cadillac Racing #2", type: "Offline", sessionType: "Practice", sessionId: "s4", lapMs: 96_876, s1Ms: 28_345, s2Ms: 36_543, s3Ms: 31_988, optimalMs: 96_750, vMaxKmh: 295, finishPosition: "N/A", progression: null, tier: "Pro", vsAlienMs: 2123, date: "2026-04-22", dateTime: "22/04/2026 14:00", versionId: "1.0110" },
  { id: "bl13", track: "Fuji", layout: "GP", class: "LMP2_WEC", car: "Oreca 07", livery: "WRT #31", type: "Online", sessionType: "Race", sessionId: "s15", lapMs: 102_345, s1Ms: 30_122, s2Ms: 38_456, s3Ms: 33_767, optimalMs: 102_212, vMaxKmh: 312, finishPosition: "P6/18", progression: 1, tier: "Pro", vsAlienMs: 1890, date: "2026-03-15", dateTime: "15/03/2026 16:00", versionId: "1.0110" },
  { id: "bl14", track: "Bahrain", layout: "GP", class: "GT3", car: "Porsche 911 GT3 R", livery: "Pure Rxcing #91", type: "Online", sessionType: "Race", sessionId: "s5", lapMs: 117_234, s1Ms: 35_999, s2Ms: 41_345, s3Ms: 39_890, optimalMs: 116_950, vMaxKmh: 268, finishPosition: "P7/24", progression: -2, tier: "Amateur", vsAlienMs: 5670, date: "2026-04-18", dateTime: "18/04/2026 22:00", versionId: "1.0110" },
  { id: "bl15", track: "Sebring", layout: "International", class: "LMP2_ELMS", car: "Oreca 07", livery: "Era Motorsport #18", type: "Online", sessionType: "Qualifying", sessionId: "s16", lapMs: 110_456, s1Ms: 34_222, s2Ms: 39_345, s3Ms: 36_889, optimalMs: 110_322, vMaxKmh: 294, finishPosition: "N/A", progression: null, tier: "Semi-Pro", vsAlienMs: 4200, date: "2026-04-12", dateTime: "12/04/2026 17:30", versionId: "1.0110" },
  { id: "bl16", track: "Imola", layout: "GP", class: "GT3", car: "BMW M4 GT3", livery: "ROWE Racing #98", type: "Online", sessionType: "Race", sessionId: "s6", lapMs: 105_678, s1Ms: 31_456, s2Ms: 38_223, s3Ms: 36_000, optimalMs: 105_456, vMaxKmh: 272, finishPosition: "P1/18", progression: 2, tier: "Pro", vsAlienMs: 1980, date: "2026-04-05", dateTime: "05/04/2026 18:45", versionId: "1.0110" },
  { id: "bl17", track: "Imola", layout: "GP", class: "GT3", car: "Ferrari 296 GT3", livery: "Vista AF Corse #71", type: "Online", sessionType: "Race", sessionId: "s17", lapMs: 106_223, s1Ms: 31_656, s2Ms: 38_456, s3Ms: 36_111, optimalMs: 105_999, vMaxKmh: 270, finishPosition: "P3/18", progression: 4, tier: "Pro", vsAlienMs: 2525, date: "2026-03-08", dateTime: "08/03/2026 19:00", versionId: "1.0110" },
  { id: "bl18", track: "Monza", layout: "GP", class: "Hypercar", car: "Porsche 963", livery: "Hertz Team Jota #38", type: "Online", sessionType: "Race", sessionId: "s7", lapMs: 99_234, s1Ms: 25_456, s2Ms: 41_223, s3Ms: 32_555, optimalMs: 99_122, vMaxKmh: 339, finishPosition: "P4/22", progression: 3, tier: "Alien", vsAlienMs: 234, date: "2026-03-28", dateTime: "28/03/2026 20:00", versionId: "1.0110" },
  { id: "bl19", track: "Monza", layout: "GP", class: "GT3", car: "Ferrari 296 GT3", livery: "Spirit of Race #55", type: "Online", sessionType: "Qualifying", sessionId: "s18", lapMs: 109_445, s1Ms: 28_345, s2Ms: 44_567, s3Ms: 36_533, optimalMs: 109_212, vMaxKmh: 281, finishPosition: "N/A", progression: null, tier: "Pro", vsAlienMs: 2890, date: "2026-02-14", dateTime: "14/02/2026 17:00", versionId: "1.0110" },
];

// ─── Sessions ────────────────────────────────────────────────────────────────
export interface Session {
  id: string;
  type: SessionType;
  connectionType: ConnectionType;
  track: string;
  layout: string;
  class: CarClass;
  car: string;
  laps: number;
  bestLapMs: number;
  position: string;
  date: string;
  versionId: string;
  durationMin: number;
}

export const sessions: Session[] = [
  { id: "s1", type: "Race", connectionType: "Online", track: "Le Mans", layout: "24h Circuit", class: "Hypercar", car: "Toyota GR010 Hybrid", laps: 376, bestLapMs: 204_567, position: "3/23", date: "2026-05-08", versionId: "1.5000", durationMin: 1440 },
  { id: "s2", type: "Qualifying", connectionType: "Online", track: "Spa-Francorchamps", layout: "GP", class: "Hypercar", car: "Ferrari 499P", laps: 8, bestLapMs: 122_345, position: "5/22", date: "2026-05-09", versionId: "1.5000", durationMin: 20 },
  { id: "s3", type: "Race", connectionType: "Online", track: "Spa-Francorchamps", layout: "GP", class: "GT3", car: "Ferrari 296 GT3", laps: 42, bestLapMs: 138_234, position: "2/19", date: "2026-05-07", versionId: "1.5000", durationMin: 105 },
  { id: "s4", type: "Practice", connectionType: "Offline", track: "Fuji", layout: "GP", class: "Hypercar", car: "Cadillac V-Series.R", laps: 24, bestLapMs: 96_876, position: "—", date: "2026-04-22", versionId: "1.0110", durationMin: 60 },
  { id: "s5", type: "Race", connectionType: "Online", track: "Bahrain", layout: "GP", class: "GT3", car: "Porsche 911 GT3 R", laps: 35, bestLapMs: 117_234, position: "7/24", date: "2026-04-18", versionId: "1.0110", durationMin: 90 },
  { id: "s6", type: "Race", connectionType: "Online", track: "Imola", layout: "GP", class: "GT3", car: "BMW M4 GT3", laps: 28, bestLapMs: 105_678, position: "1/18", date: "2026-04-05", versionId: "1.0110", durationMin: 65 },
  { id: "s7", type: "Race", connectionType: "Online", track: "Monza", layout: "GP", class: "Hypercar", car: "Porsche 963", laps: 52, bestLapMs: 99_234, position: "4/22", date: "2026-03-28", versionId: "1.0110", durationMin: 110 },
  { id: "s8", type: "Race", connectionType: "Online", track: "Algarve International Circuit", layout: "Algarve International Circuit", class: "GT3", car: "Mercedes-AMG LMGT3", laps: 11, bestLapMs: 111_382, position: "10/18", date: "2026-04-31", versionId: "1.0110", durationMin: 20 },
];

export interface Stat { label: string; value: string; hint?: string; }

export const globalStats: Stat[] = [
  { label: "Temps total", value: "142h 23m", hint: "+4h cette semaine" },
  { label: "Tours complétés", value: "8 421", hint: "+127 cette semaine" },
  { label: "Distance", value: "38 240 km", hint: "≈ tour du monde" },
  { label: "Sessions", value: "127", hint: "12 ce mois-ci" },
];

export interface ProgressionPoint { session: number; lapMs: number; date: string; }
export const progressionLeMans: ProgressionPoint[] = Array.from({ length: 30 }).map((_, i) => {
  const base = 209_000;
  const trend = -i * 110;
  const noise = (Math.sin(i * 1.7) + Math.cos(i * 0.9)) * 800;
  return { session: i + 1, lapMs: Math.max(204_500, base + trend + noise), date: `2026-04-${String((i % 28) + 1).padStart(2, "0")}` };
});

export const tierLines = { Alien: 204_567, Pro: 207_000, "Semi-Pro": 210_000, Amateur: 214_000, Offline: 220_000 };

export const lapsByClass = [
  { class: "Hypercar", laps: 2840, color: "var(--color-tier-alien)" },
  { class: "LMP2 WEC", laps: 1620, color: "var(--color-tier-pro)" },
  { class: "LMP2 ELMS", laps: 980, color: "var(--color-tier-pro)" },
  { class: "GT3", laps: 2410, color: "var(--color-tier-semi)" },
  { class: "GT3 LM", laps: 320, color: "var(--color-tier-semi)" },
  { class: "GTE", laps: 251, color: "var(--color-tier-amateur)" },
];

export const weeklyActivity = Array.from({ length: 12 }).map((_, i) => ({
  week: `S${i + 1}`,
  laps: Math.round(40 + Math.random() * 180),
  hours: +(2 + Math.random() * 7).toFixed(1),
}));

export interface SetupGroup {
  car: string;
  class: CarClass;
  tracks: { name: string; setups: { id: string; name: string; modifiedAgo: string; }[]; }[];
}

export const setups: SetupGroup[] = [
  { car: "Toyota GR010 Hybrid", class: "Hypercar", tracks: [
    { name: "Le Mans", setups: [
      { id: "set1", name: "race_dry_v3.svm", modifiedAgo: "2 jours" },
      { id: "set2", name: "quali_dry.svm", modifiedAgo: "5 jours" },
      { id: "set3", name: "race_wet_v1.svm", modifiedAgo: "1 sem." },
    ] },
    { name: "Spa-Francorchamps", setups: [
      { id: "set4", name: "race_balanced.svm", modifiedAgo: "3 jours" },
      { id: "set5", name: "quali_low_fuel.svm", modifiedAgo: "1 sem." },
    ] },
  ] },
  { car: "Oreca 07 Gibson", class: "LMP2_WEC", tracks: [
    { name: "Le Mans", setups: [{ id: "set6", name: "race_v2.svm", modifiedAgo: "1 jour" }, { id: "set7", name: "quali.svm", modifiedAgo: "6 jours" }] },
    { name: "Spa-Francorchamps", setups: [{ id: "set8", name: "wet_race.svm", modifiedAgo: "4 jours" }] },
    { name: "Fuji", setups: [{ id: "set9", name: "race.svm", modifiedAgo: "2 sem." }] },
  ] },
  { car: "Oreca 07 Gibson", class: "LMP2_ELMS", tracks: [
    { name: "Sebring", setups: [{ id: "set10", name: "race_dry.svm", modifiedAgo: "5 jours" }, { id: "set11", name: "quali_dry.svm", modifiedAgo: "5 jours" }] },
    { name: "Imola", setups: [{ id: "set12", name: "race.svm", modifiedAgo: "1 sem." }] },
  ] },
  { car: "Ferrari 296 GT3", class: "GT3", tracks: [
    { name: "Spa-Francorchamps", setups: [{ id: "set13", name: "endurance_race.svm", modifiedAgo: "1 jour" }, { id: "set14", name: "sprint_quali.svm", modifiedAgo: "3 jours" }] },
    { name: "Imola", setups: [{ id: "set15", name: "race_dry.svm", modifiedAgo: "1 sem." }] },
    { name: "Monza", setups: [{ id: "set16", name: "race_low_df.svm", modifiedAgo: "2 sem." }] },
  ] },
];

export interface SetupSection {
  name: string;
  params: { label: string; value: number; unit?: string; min: number; max: number; step: number; valueB?: number }[];
}

export const setupDetail: SetupSection[] = [
  { name: "Suspension", params: [
    { label: "Front spring rate", value: 85.0, unit: "N/mm", min: 50, max: 150, step: 0.5, valueB: 72.0 },
    { label: "Rear spring rate", value: 78.0, unit: "N/mm", min: 50, max: 150, step: 0.5, valueB: 78.0 },
    { label: "Front anti-roll bar", value: 4, min: 1, max: 10, step: 1, valueB: 2 },
    { label: "Rear anti-roll bar", value: 3, min: 1, max: 10, step: 1, valueB: 1 },
    { label: "Front ride height", value: 55, unit: "mm", min: 40, max: 80, step: 1, valueB: 60 },
    { label: "Rear ride height", value: 70, unit: "mm", min: 50, max: 90, step: 1, valueB: 75 },
  ] },
  { name: "Aerodynamics", params: [
    { label: "Front wing angle", value: 6, min: 1, max: 12, step: 1, valueB: 4 },
    { label: "Rear wing angle", value: 8, min: 1, max: 12, step: 1, valueB: 5 },
    { label: "Brake duct opening", value: 50, unit: "%", min: 0, max: 100, step: 10, valueB: 70 },
  ] },
  { name: "Transmission", params: [
    { label: "Final drive ratio", value: 3.45, min: 2.5, max: 4.5, step: 0.05, valueB: 3.45 },
    { label: "1st gear ratio", value: 2.85, min: 2.0, max: 3.5, step: 0.05, valueB: 2.85 },
    { label: "Top gear ratio", value: 0.82, min: 0.6, max: 1.2, step: 0.01, valueB: 0.82 },
  ] },
  { name: "Tyres", params: [
    { label: "FL pressure", value: 1.78, unit: "bar", min: 1.5, max: 2.2, step: 0.01, valueB: 1.78 },
    { label: "FR pressure", value: 1.78, unit: "bar", min: 1.5, max: 2.2, step: 0.01, valueB: 1.78 },
    { label: "RL pressure", value: 1.72, unit: "bar", min: 1.5, max: 2.2, step: 0.01, valueB: 1.72 },
    { label: "RR pressure", value: 1.72, unit: "bar", min: 1.5, max: 2.2, step: 0.01, valueB: 1.74 },
  ] },
  { name: "Differential", params: [
    { label: "Preload", value: 60, unit: "Nm", min: 20, max: 120, step: 5, valueB: 80 },
    { label: "Power lockup", value: 40, unit: "%", min: 0, max: 100, step: 5, valueB: 40 },
    { label: "Coast lockup", value: 20, unit: "%", min: 0, max: 100, step: 5, valueB: 20 },
  ] },
  { name: "Fuel & Brakes", params: [
    { label: "Fuel load", value: 92, unit: "L", min: 30, max: 130, step: 1, valueB: 130 },
    { label: "Brake pressure", value: 85, unit: "%", min: 60, max: 100, step: 1, valueB: 92 },
    { label: "Brake bias", value: 56.5, unit: "%", min: 45, max: 70, step: 0.5, valueB: 54 },
  ] },
];

export const tierColorMap: Record<Tier, "alien" | "pro" | "semi" | "amateur" | "offline"> = {
  Alien: "alien",
  Pro: "pro",
  "Semi-Pro": "semi",
  Amateur: "amateur",
  Offline: "offline",
};

// ─── Race detail (enriched pour matcher v1) ─────────────────────────────────
export interface RaceDriver {
  name: string;
  car: string;
  class: CarClass;
  startPosition: number;
  finishPosition: number;
  bestLapMs: number;
  totalLaps: number;
  lapsLed: number;          // tours en tête
  gapToLeaderMs: number;
  totalRaceTime: string;    // "20:14:497"
  fuelStartPct: number;     // %
  fuelEndPct: number;       // %
  pitStops: number;
  incidents: number;
  penalties: number;
  status: "Terminé Normalement" | "DNF Mécanique" | "DNF Accident" | "DSQ" | "Abandonné";
  vMaxKmh: number;
  isPlayer?: boolean;
}

export interface RaceLapPoint { lap: number; [driver: string]: number; }
export interface RaceIncident { lap: number; driver: string; type: "Contact" | "Spin" | "Off-track" | "Damage" | "Penalty"; description: string; }
export interface RacePenalty { lap: number; driver: string; type: "Drive-Through" | "Stop & Go" | "Time +5s" | "Time +10s" | "DSQ" | "Avertissement"; reason: string; }
export interface ChatMessage { time: string; author: string; text: string; system?: boolean; }
export interface StintBlock { driver: string; startLap: number; endLap: number; compound: "Slick Soft" | "Slick Medium" | "Slick Hard" | "Wet"; }
export interface DriverLap {
  lap: number;
  position: number;
  time: number;
  s1: number;
  s2: number;
  s3: number;
  valid: boolean;
}
export interface DriverLapRow { driver: string; laps: DriverLap[]; }

const RACE_DRIVERS = [
  "Hugo Lebrun",
  "Cédric (vous)",
  "Marco Rossi",
  "Anna Müller",
  "James Carter",
  "Tomás Silva",
  "Yuki Tanaka",
  "Liam Walsh",
];

function generateLapsForDriver(
  name: string,
  totalLaps: number,
  baseMs: number,
  pitLaps: number[],
  startPos: number,
  finishPos: number,
  invalidLaps: number[] = []
): DriverLapRow {
  return {
    driver: name,
    laps: Array.from({ length: totalLaps }, (_, i) => {
      const lap = i + 1;
      const seed = (s: number) => Math.sin(s * 12.9898 + i * 78.233) * 43758.5453 % 1;
      const time = baseMs + Math.sin(i * 0.3) * 600 + (seed(name.length) - 0.5) * 700 + (pitLaps.includes(lap) ? 28_000 : 0);
      const s1 = Math.round(time * 0.255 + (seed(1) - 0.5) * 300);
      const s2 = Math.round(time * 0.415 + (seed(2) - 0.5) * 300);
      const s3 = Math.round(time) - s1 - s2;
      // position drift de start vers finish
      const progress = totalLaps > 1 ? i / (totalLaps - 1) : 0;
      const noise = (seed(3) - 0.5) * 1.8;
      const position = Math.max(1, Math.round(startPos + (finishPos - startPos) * progress + noise));
      return { lap, position, time: Math.round(time), s1, s2, s3, valid: !invalidLaps.includes(lap) };
    }),
  };
}

export const raceDetailMock = {
  sessionId: "s3",
  type: "Race" as const,
  connectionType: "Online" as ConnectionType,
  track: "Spa-Francorchamps",
  layout: "GP",
  class: "GT3" as CarClass,
  date: "2026-05-07",
  dateTime: "07/05/2026 20:15",
  fileName: "2026_05_07_20_15_22-84R1.xml",
  versionId: "1.5000",
  durationMin: 105,
  minutesMax: 60,
  laps: 42,
  lapsCompleted: 42,
  vehiclesAllowed: "GT3" as CarClass,
  otherParams: "MechFailRate=1 | DamageMult=100 | FuelMult=1 | TireMult=1",
  winner: "Hugo Lebrun",
  fastestLapDriver: "Hugo Lebrun",
  fastestLapMs: 137_445,
  weather: { air: 21, track: 28, condition: "Sec → Pluie L23" },
  finalPosition: 2,
  fieldSize: 19,
  drivers: [
    { name: "Hugo Lebrun", car: "Porsche 911 GT3 R", class: "GT3", startPosition: 1, finishPosition: 1, bestLapMs: 137_445, totalLaps: 42, lapsLed: 28, gapToLeaderMs: 0, totalRaceTime: "1:45:14.567", fuelStartPct: 78.0, fuelEndPct: 8.5, pitStops: 2, incidents: 0, penalties: 0, status: "Terminé Normalement", vMaxKmh: 287 },
    { name: "Cédric (vous)", car: "Ferrari 296 GT3", class: "GT3", startPosition: 3, finishPosition: 2, bestLapMs: 138_234, totalLaps: 42, lapsLed: 4, gapToLeaderMs: 8_456, totalRaceTime: "+8.456", fuelStartPct: 79.1, fuelEndPct: 9.0, pitStops: 2, incidents: 0, penalties: 0, status: "Terminé Normalement", vMaxKmh: 286, isPlayer: true },
    { name: "Marco Rossi", car: "BMW M4 GT3", class: "GT3", startPosition: 2, finishPosition: 3, bestLapMs: 138_812, totalLaps: 42, lapsLed: 5, gapToLeaderMs: 12_980, totalRaceTime: "+12.980", fuelStartPct: 73.4, fuelEndPct: 6.7, pitStops: 2, incidents: 1, penalties: 0, status: "Terminé Normalement", vMaxKmh: 284 },
    { name: "Anna Müller", car: "Mercedes-AMG GT3", class: "GT3", startPosition: 5, finishPosition: 4, bestLapMs: 139_123, totalLaps: 42, lapsLed: 1, gapToLeaderMs: 19_456, totalRaceTime: "+19.456", fuelStartPct: 70.8, fuelEndPct: 16.1, pitStops: 2, incidents: 0, penalties: 0, status: "Terminé Normalement", vMaxKmh: 281 },
    { name: "James Carter", car: "Lamborghini Huracán GT3", class: "GT3", startPosition: 4, finishPosition: 5, bestLapMs: 139_567, totalLaps: 42, lapsLed: 4, gapToLeaderMs: 24_890, totalRaceTime: "+24.890", fuelStartPct: 79.1, fuelEndPct: 23.1, pitStops: 2, incidents: 2, penalties: 1, status: "Terminé Normalement", vMaxKmh: 285 },
    { name: "Tomás Silva", car: "Audi R8 LMS GT3", class: "GT3", startPosition: 7, finishPosition: 6, bestLapMs: 140_223, totalLaps: 42, lapsLed: 0, gapToLeaderMs: 32_456, totalRaceTime: "+32.456", fuelStartPct: 75.2, fuelEndPct: 11.4, pitStops: 2, incidents: 0, penalties: 0, status: "Terminé Normalement", vMaxKmh: 280 },
    { name: "Yuki Tanaka", car: "Aston Martin Vantage GT3", class: "GT3", startPosition: 6, finishPosition: 7, bestLapMs: 140_888, totalLaps: 42, lapsLed: 0, gapToLeaderMs: 38_223, totalRaceTime: "+38.223", fuelStartPct: 78.4, fuelEndPct: 5.2, pitStops: 3, incidents: 1, penalties: 0, status: "Terminé Normalement", vMaxKmh: 278 },
    { name: "Liam Walsh", car: "Porsche 911 GT3 R", class: "GT3", startPosition: 8, finishPosition: 8, bestLapMs: 141_345, totalLaps: 42, lapsLed: 0, gapToLeaderMs: 45_678, totalRaceTime: "+45.678", fuelStartPct: 73.9, fuelEndPct: 13.6, pitStops: 2, incidents: 0, penalties: 0, status: "Terminé Normalement", vMaxKmh: 283 },
  ] as RaceDriver[],
  laptimes: Array.from({ length: 42 }).map((_, i) => {
    const lap = i + 1;
    const wave = (base: number, amp: number, offset: number) =>
      base + Math.sin(i * 0.3 + offset) * amp + (Math.random() - 0.5) * 400;
    const pitBump = (l: number, pits: number[]) => pits.includes(l) ? 28_000 : 0;
    return {
      lap,
      "Hugo Lebrun": wave(137_500, 800, 0) + pitBump(lap, [13, 27]),
      "Cédric (vous)": wave(138_300, 700, 1) + pitBump(lap, [14, 28]),
      "Marco Rossi": wave(138_900, 750, 2) + pitBump(lap, [14, 29]),
      "Anna Müller": wave(139_300, 700, 0.5) + pitBump(lap, [15, 30]),
      "James Carter": wave(139_700, 900, 1.5) + pitBump(lap, [13, 27]) + (lap === 9 ? 8000 : 0),
    } as RaceLapPoint;
  }),
  gapToLeader: Array.from({ length: 42 }).map((_, i) => {
    const lap = i + 1;
    return {
      lap,
      "Cédric (vous)": Math.max(0, 2000 + i * 200 + (Math.random() - 0.5) * 1500 + (lap > 14 && lap < 28 ? -2000 : 0)),
      "Marco Rossi": Math.max(0, 1500 + i * 280 + (Math.random() - 0.5) * 1500),
      "Anna Müller": Math.max(0, 4000 + i * 380 + (Math.random() - 0.5) * 1500),
      "James Carter": Math.max(0, 6000 + i * 480 + (Math.random() - 0.5) * 1500),
    };
  }),
  driverLaps: RACE_DRIVERS.map((name) => {
    const bases: Record<string, number> = {
      "Hugo Lebrun": 137_500,
      "Cédric (vous)": 138_300,
      "Marco Rossi": 138_900,
      "Anna Müller": 139_300,
      "James Carter": 139_700,
      "Tomás Silva": 140_200,
      "Yuki Tanaka": 140_900,
      "Liam Walsh": 141_400,
    };
    const pits: Record<string, number[]> = {
      "Hugo Lebrun": [13, 27],
      "Cédric (vous)": [14, 28],
      "Marco Rossi": [14, 29],
      "Anna Müller": [15, 30],
      "James Carter": [13, 27],
      "Tomás Silva": [14, 28],
      "Yuki Tanaka": [12, 22, 31],
      "Liam Walsh": [15, 30],
    };
    const positions: Record<string, [number, number]> = {
      "Hugo Lebrun": [1, 1],
      "Cédric (vous)": [3, 2],
      "Marco Rossi": [2, 3],
      "Anna Müller": [5, 4],
      "James Carter": [4, 5],
      "Tomás Silva": [7, 6],
      "Yuki Tanaka": [6, 7],
      "Liam Walsh": [8, 8],
    };
    const invalid: Record<string, number[]> = {
      "Hugo Lebrun": [],
      "Cédric (vous)": [],
      "Marco Rossi": [17],
      "Anna Müller": [],
      "James Carter": [9],
      "Tomás Silva": [],
      "Yuki Tanaka": [22, 31],
      "Liam Walsh": [],
    };
    const [startP, finishP] = positions[name];
    return generateLapsForDriver(name, 42, bases[name], pits[name], startP, finishP, invalid[name]);
  }) as DriverLapRow[],
  stints: [
    { driver: "Cédric (vous)", startLap: 1, endLap: 14, compound: "Slick Medium" },
    { driver: "Cédric (vous)", startLap: 15, endLap: 28, compound: "Slick Medium" },
    { driver: "Cédric (vous)", startLap: 29, endLap: 42, compound: "Wet" },
    { driver: "Hugo Lebrun", startLap: 1, endLap: 13, compound: "Slick Soft" },
    { driver: "Hugo Lebrun", startLap: 14, endLap: 27, compound: "Slick Medium" },
    { driver: "Hugo Lebrun", startLap: 28, endLap: 42, compound: "Wet" },
    { driver: "Marco Rossi", startLap: 1, endLap: 14, compound: "Slick Medium" },
    { driver: "Marco Rossi", startLap: 15, endLap: 29, compound: "Slick Medium" },
    { driver: "Marco Rossi", startLap: 30, endLap: 42, compound: "Wet" },
  ] as StintBlock[],
  incidents: [
    { lap: 4, driver: "James Carter", type: "Contact", description: "Contact léger T1 avec Anna Müller" },
    { lap: 9, driver: "James Carter", type: "Spin", description: "Tête-à-queue à Pouhon, perd 4 positions" },
    { lap: 17, driver: "Marco Rossi", type: "Off-track", description: "Wide à Eau Rouge, drapeau jaune secteur 1" },
    { lap: 22, driver: "Yuki Tanaka", type: "Damage", description: "Casse mécanique, retour stand" },
    { lap: 23, driver: "—", type: "Penalty", description: "Safety Car déployée — pluie sur S2" },
    { lap: 31, driver: "Yuki Tanaka", type: "Off-track", description: "Aquaplanage à Pif-Paf" },
  ] as RaceIncident[],
  penalties: [
    { lap: 4, driver: "James Carter", type: "Avertissement", reason: "Contact avec Anna Müller — pas de gain conservé" },
    { lap: 25, driver: "Yuki Tanaka", type: "Time +5s", reason: "Vitesse pit-lane > 60 km/h" },
  ] as RacePenalty[],
  chat: [
    { time: "20:14:12", author: "—", text: "Race start — green flag", system: true },
    { time: "20:18:34", author: "James Carter", text: "Sorry mate, lock-up T1" },
    { time: "20:22:01", author: "Cédric (vous)", text: "np" },
    { time: "20:35:18", author: "Anna Müller", text: "Pace is good in S2" },
    { time: "20:42:55", author: "—", text: "Yellow flag — sector 1", system: true },
    { time: "20:48:21", author: "—", text: "Rain detected in S2", system: true },
    { time: "20:51:08", author: "Hugo Lebrun", text: "Pitting for wets" },
    { time: "20:51:44", author: "Cédric (vous)", text: "same, pit lap 28" },
    { time: "21:05:32", author: "Marco Rossi", text: "Treacherous out there" },
    { time: "21:18:45", author: "—", text: "Checkered flag", system: true },
  ] as ChatMessage[],
};
