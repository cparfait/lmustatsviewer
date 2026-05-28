import type { CarClass } from "./staticData";

export type OhneSpeedTier = "Alien" | "Competitive" | "Good" | "Midpack" | "Tail-ender" | "Offline";

export interface PaceBenchmark {
  track: string;
  carClass: CarClass;
  hotlapTimeMs: number;
  racePaceMs: {
    alien: number;
    competitive: number;
    good: number;
    midpack: number;
    tailEnder: number;
    offline: number;
  };
  fastestCar: string;
  fastestLapTimeMs: number;
  weightedAvgMs: number;
}

const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTN03UvJDm99byA6vQPZHKOCYVvfxLu1zkJAzdaKyROykzEKY2-Xl1rl1q5znZEf36m88dxMKsY2eaO/pub?gid=1766901750&single=true&output=csv";

const CLASS_MAP: Record<string, CarClass> = {
  LMGT3: "GT3",
  LMH: "Hypercar",
  GTE: "GTE",
  LMP3: "LMP3",
  LMP2elms: "LMP2_ELMS",
  LMP2wec: "LMP2_WEC",
};

const CLASS_HEADERS: [RegExp, string][] = [
  [/L\s*M\s*G\s*T\s*3/, "LMGT3"],
  [/L\s*M\s*H(?!\s*\w)/, "LMH"],
  [/L\s*M\s*P\s*3/, "LMP3"],
  [/L\s*M\s*P\s*2\s*E\s*L\s*M\s*S/, "LMP2elms"],
  [/L\s*M\s*P\s*2\s*W\s*E\s*C/, "LMP2wec"],
  [/G\s*T\s*E/, "GTE"],
];

function detectClassHeader(cells: string[]): string | null {
  const joined = cells.join(" ");
  for (const [re, key] of CLASS_HEADERS) {
    if (re.test(joined)) return key;
  }
  return null;
}

function parseLapTimeToMs(raw: string): number | null {
  if (!raw || raw.startsWith("calculated")) return null;
  const s = raw.trim();
  const m = s.match(/^(\d+):(\d{1,2})\.(\d{1,3})$/);
  if (!m) return null;
  const min = parseInt(m[1], 10);
  const sec = parseInt(m[2], 10);
  let ms = parseInt(m[3], 10);
  if (m[3].length === 1) ms *= 100;
  else if (m[3].length === 2) ms *= 10;
  return min * 60_000 + sec * 1_000 + ms;
}

const TRACK_MAP: Record<string, string> = {
  "Autodromo Nazionale Monza": "Monza",
  "Monza (curvagrande)": "Monza (curvagrande)",
  "Circuit de Spa-Francorchamps": "Spa",
  "Spa-Francorchamps": "Spa",
  "Circuit de la Sarthe": "Circuit de la Sarthe",
  "Le Mans": "Circuit de la Sarthe",
  "Circuit of the Americas": "COTA",
  "Algarve International Circuit": "Portimao",
  "Portimão": "Portimao",
  "Fuji Speedway": "Fuji (chicane)",
  "Fuji": "Fuji (chicane)",
  "Bahrain International Circuit": "Bahrain (wec)",
  "Bahrain": "Bahrain (wec)",
  "Sebring International Raceway": "Sebring",
  "Sebring": "Sebring",
  "Autodromo Enzo e Dino Ferrari": "Imola",
  "Imola": "Imola",
  "Circuit de Barcelona": "Barcelona",
  "Barcelona": "Barcelona",
  "Lusail International Circuit": "Qatar",
  "Qatar": "Qatar",
  "Silverstone Grand Prix Circuit": "Silverstone (GP)",
  "Silverstone": "Silverstone (GP)",
  "Paul Ricard": "Paul Ricard",
};

export function mapTrackName(trackFromDb: string, layoutFromDb?: string): string | null {
  if (TRACK_MAP[trackFromDb]) return TRACK_MAP[trackFromDb];

  const layoutMap: Record<string, string> = {
    "Grand Prix": "Silverstone (GP)",
    "National": "Silverstone (National)",
    "International": "Silverstone (International)",
    "Chicane": "Fuji (chicane)",
    "Classic": "Fuji (classic)",
    "Curva Grande": "Monza (curvagrande)",
    "Endurance": "Bahrain (endurance)",
    "Outer": "Bahrain (outer)",
    "Paddock": "Bahrain (paddock)",
    "Short": "Qatar (short)",
    "School": "Sebring (school)",
    "1A": "Paul Ricard (1A)",
    "1A v2": "Paul Ricard (1A v2)",
    "1A v2 short": "Paul Ricard (1A v2 short)",
    "3A": "Paul Ricard (3A)",
    "straight": "Circuit de la Sarthe (straight)",
  };

  if (layoutFromDb && layoutMap[layoutFromDb]) {
    const base = TRACK_MAP[trackFromDb];
    if (base) {
      return base;
    }
  }

  return null;
}

function parseCSV(text: string): PaceBenchmark[] {
  const lines = text.split(/\r?\n/);
  const benchmarks: PaceBenchmark[] = [];
  let currentClass: string | null = null;

  for (const line of lines) {
    const cells = line.split(",").map((c) => c.trim());

    const headerKey = detectClassHeader(cells);
    if (headerKey) {
      currentClass = headerKey;
      continue;
    }

    if (!currentClass) continue;

    const trackKey = cells[0];
    if (!trackKey || trackKey.startsWith("Track") || trackKey.startsWith("Hotlap") || trackKey.startsWith("Alien") || cells.length < 14) continue;

    const classInRow = cells[15] || "";
    if (!classInRow || !(classInRow in CLASS_MAP)) continue;

    const hotlapRaw = cells[3];
    if (!hotlapRaw || hotlapRaw.startsWith("calculated")) continue;

    const hotlapMs = parseLapTimeToMs(hotlapRaw);
    if (!hotlapMs) continue;

    const alien = parseLapTimeToMs(cells[3]);
    const competitive = parseLapTimeToMs(cells[4]);
    const good = parseLapTimeToMs(cells[5]);
    const midpack = parseLapTimeToMs(cells[7]);
    const tailEnder = parseLapTimeToMs(cells[9]);
    const offline = parseLapTimeToMs(cells[10]);

    if (!alien || !competitive || !good || !midpack || !tailEnder || !offline) continue;

    const fastestCar = cells[11] || "";
    const fastestLapRaw = cells[12] || "";
    const fastestLapMs = parseLapTimeToMs(fastestLapRaw);
    const wAvgRaw = cells[14] || "";
    const wAvgMs = parseLapTimeToMs(wAvgRaw);

    const trackName = cells[1] || trackKey.replace(classInRow, "");
    const mappedClass = CLASS_MAP[classInRow];
    if (!mappedClass) continue;

    benchmarks.push({
      track: trackName,
      carClass: mappedClass,
      hotlapTimeMs: hotlapMs,
      racePaceMs: {
        alien: alien!,
        competitive: competitive!,
        good: good!,
        midpack: midpack!,
        tailEnder: tailEnder!,
        offline: offline!,
      },
      fastestCar,
      fastestLapTimeMs: fastestLapMs ?? 0,
      weightedAvgMs: wAvgMs ?? 0,
    });
  }

  return benchmarks;
}

let cachedBenchmarks: PaceBenchmark[] | null = null;

export async function fetchBenchmarks(): Promise<PaceBenchmark[]> {
  if (cachedBenchmarks) return cachedBenchmarks;

  const res = await fetch(SHEET_CSV_URL);
  if (!res.ok) throw new Error(`ohne_speed fetch failed: ${res.status}`);
  const text = await res.text();
  cachedBenchmarks = parseCSV(text);
  return cachedBenchmarks;
}

export function clearBenchmarkCache(): void {
  cachedBenchmarks = null;
}

export function findBenchmark(
  benchmarks: PaceBenchmark[],
  trackFromDb: string,
  carClass: string,
  layoutFromDb?: string,
): PaceBenchmark | null {
  const mappedTrack = mapTrackName(trackFromDb, layoutFromDb);
  if (!mappedTrack) return null;

  const mappedClass = carClass as CarClass;
  return (
    benchmarks.find(
      (b) => b.track === mappedTrack && b.carClass === mappedClass,
    ) ?? null
  );
}

export function computeTier(lapTimeMs: number, benchmark: PaceBenchmark): {
  tier: OhneSpeedTier;
  percent: number;
  deltaMs: number;
} {
  const alienMs = benchmark.racePaceMs.alien;
  const percent = (lapTimeMs / alienMs) * 100;
  const deltaMs = lapTimeMs - alienMs;

  let tier: OhneSpeedTier;
  const rounded = Math.round(percent * 10) / 10;

  if (rounded < 101) tier = "Alien";
  else if (rounded < 102) tier = "Competitive";
  else if (rounded < 104) tier = "Good";
  else if (rounded < 106) tier = "Midpack";
  else if (rounded < 107) tier = "Tail-ender";
  else tier = "Offline";

  return { tier, percent, deltaMs };
}

export const TIER_LABELS: Record<OhneSpeedTier, string> = {
  Alien: "Alien",
  Competitive: "Compétitif",
  Good: "Bon",
  "Midpack": "Peloton",
  "Tail-ender": "Fin de peloton",
  Offline: "Hors rythme",
};

export const TIER_COLORS: Record<OhneSpeedTier, string> = {
  Alien: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  Competitive: "bg-green-500/20 text-green-300 border-green-500/40",
  Good: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  "Midpack": "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  "Tail-ender": "bg-yellow-700/20 text-yellow-600 border-yellow-700/40",
  Offline: "bg-red-500/20 text-red-300 border-red-500/40",
};
