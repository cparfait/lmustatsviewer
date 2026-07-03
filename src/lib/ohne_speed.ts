import type { CarClass } from "./staticData";

export type OhneSpeedTier = "Alien" | "Competitive" | "Good" | "Midpack" | "Tail-ender" | "Offline";

export interface PaceBenchmark {
  track: string;
  carClass: CarClass;
  /** Patch du jeu de la mesure (ex. "1.3 +"). */
  patch: string;
  hotlapTimeMs: number;
  racePaceMs: {
    alien: number; // 100%
    competitive: number; // 101%
    good: number; // 102%
    pct103: number; // 103%
    midpack: number; // 104%
    pct105: number; // 105%
    tailEnder: number; // 106%
    offline: number; // 107%
  };
  fastestCar: string;
  fastestLapTimeMs: number;
  weightedAvgMs: number;
}

/** Colonnes de tiers, dans l'ordre d'affichage (100 % → 107 %), avec couleur. */
export interface TierColumn {
  pct: number;
  key: keyof PaceBenchmark["racePaceMs"];
  color: string;
}
export const TIER_COLUMNS: TierColumn[] = [
  { pct: 100, key: "alien", color: "#34d399" },
  { pct: 101, key: "competitive", color: "#4ade80" },
  { pct: 102, key: "good", color: "#a3e635" },
  { pct: 103, key: "pct103", color: "#eab308" },
  { pct: 104, key: "midpack", color: "#f59e0b" },
  { pct: 105, key: "pct105", color: "#fb923c" },
  { pct: 106, key: "tailEnder", color: "#f87171" },
  { pct: 107, key: "offline", color: "#ef4444" },
];

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


function parseLapTimeToMs(raw: string): number | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || s.startsWith("calculated") || s.startsWith("--")) return null;
  const m = s.match(/^(\d+):(\d{1,2})\.(\d{1,3})$/);
  if (!m) return null;
  const min = parseInt(m[1], 10);
  const sec = parseInt(m[2], 10);
  let ms = parseInt(m[3], 10);
  if (m[3].length === 1) ms *= 100;
  else if (m[3].length === 2) ms *= 10;
  const total = min * 60_000 + sec * 1_000 + ms;
  return total > 0 ? total : null;
}

/** Parse une ligne CSV en gérant les champs entre guillemets. */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
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
  // Structure du CSV ohne_speed (d'après lmu-analyzer / arminreiter) :
  // col[0] = clé combinée  ex. "Bahrain (wec)LMGT3"  → identifie les lignes de données
  // col[1] = nom du circuit
  // col[2] = patch (ignoré)
  // col[3] = hotlap
  // col[4] = alien (100%)
  // col[5] = competitive (101%)
  // col[6] = good (102%)
  // col[7] = 103% (ignoré)
  // col[8] = midpack (104%)
  // col[9] = 105% (ignoré)
  // col[10] = tail-ender (106%)
  // col[11] = offline (107%)
  // col[12] = voiture la plus rapide
  // col[13] = meilleur temps

  const lines = text.split(/\r?\n/);
  const benchmarks: PaceBenchmark[] = [];
  let currentClass: string | null = null;

  for (const line of lines) {
    // Détection des en-têtes de section (lettres espacées ex. "L M G T 3")
    if (line.includes('L M G T 3')) { currentClass = 'LMGT3'; continue; }
    if (line.includes('L M H') && !line.includes('L M G')) { currentClass = 'LMH'; continue; }
    if (line.includes('L M P 3')) { currentClass = 'LMP3'; continue; }
    if (line.includes('L M P 2   E L M S')) { currentClass = 'LMP2elms'; continue; }
    if (line.includes('L M P 2   W E C')) { currentClass = 'LMP2wec'; continue; }
    if (line.includes('G T E') && !line.includes('LMGT')) { currentClass = 'GTE'; continue; }

    if (!currentClass) continue;

    const cols = parseCSVLine(line);
    if (cols.length < 12) continue;

    // Ligne de données : col[0] contient la classe en suffixe (ex. "Spa-FrancorchampsLMGT3")
    if (!cols[0]?.includes(currentClass)) continue;

    const track = cols[1]?.trim();
    if (!track || track === 'Track') continue;

    const hotlapMs    = parseLapTimeToMs(cols[3]);
    const alien       = parseLapTimeToMs(cols[4]);
    const competitive = parseLapTimeToMs(cols[5]);
    const good        = parseLapTimeToMs(cols[6]);
    const p103        = parseLapTimeToMs(cols[7]);   // 103%
    const midpack     = parseLapTimeToMs(cols[8]);   // 104%
    const p105        = parseLapTimeToMs(cols[9]);   // 105%
    const tailEnder   = parseLapTimeToMs(cols[10]);  // 106%
    const offline     = parseLapTimeToMs(cols[11]);  // 107%

    if (!hotlapMs || !alien || !competitive || !good || !midpack || !tailEnder || !offline) continue;

    const mappedClass = CLASS_MAP[currentClass];
    if (!mappedClass) continue;

    benchmarks.push({
      track,
      carClass: mappedClass,
      patch: cols[2]?.trim() ?? "",
      hotlapTimeMs: hotlapMs,
      racePaceMs: {
        alien,
        competitive,
        good,
        pct103: p103 ?? 0,
        midpack,
        pct105: p105 ?? 0,
        tailEnder,
        offline,
      },
      fastestCar: cols[12]?.trim() ?? "",
      fastestLapTimeMs: parseLapTimeToMs(cols[13] ?? "") ?? 0,
      weightedAvgMs: 0,
    });
  }

  return benchmarks;
}

let cachedBenchmarks: PaceBenchmark[] | null = null;

export async function fetchBenchmarks(): Promise<PaceBenchmark[]> {
  // Ne pas servir un cache vide : si la précédente tentative avait échoué
  // (réseau hors-ligne, bug de parsing) l'appel suivant re-tente le fetch.
  if (cachedBenchmarks && cachedBenchmarks.length > 0) {
    return cachedBenchmarks;
  }

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

/** Mapping classe interne (DB) → classe ohne_speed. */
export const OHNE_CLASS: Record<string, string> = {
  Hyper: "Hypercar",
  Hypercar: "Hypercar",
  "LMP2 ELMS": "LMP2_ELMS",
  LMP2: "LMP2_WEC",
  "LMP2 WEC": "LMP2_WEC",
  LMP3: "LMP3",
  GT3: "GT3",
  GTE: "GTE",
};

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
