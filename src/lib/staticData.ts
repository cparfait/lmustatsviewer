/**
 * Données statiques LMU — voitures, circuits, classes, logos, drapeaux.
 *
 * Les catalogues (voitures, circuits, logos, drapeaux) sont chargés depuis
 * les fichiers JSON externes `public/data/cars.json` et `public/data/circuits.json`.
 * Pour ajouter une voiture ou un circuit, éditer ces JSON (cf. MAINTENANCE.md).
 *
 * Les couleurs de classes et les mappings backends → libellés restent en dur
 * car ils dépendent du schéma de la base (backend Rust).
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type CarClass = "Hypercar" | "LMP2_WEC" | "LMP2_ELMS" | "LMP3" | "GT3" | "GTE";

export type LmuCarCategory = "hyper" | "lmp2" | "lmp3" | "gt3" | "gte";

export interface LmuCar {
  model: string;
  category: LmuCarCategory;
}

export type Tier = "Alien" | "Pro" | "Semi-Pro" | "Amateur" | "Offline";

// ─── Classes — en dur (dépend du backend Rust `models.rs`) ──────────────────

export const CAR_CLASS_LABELS: Record<string, string> = {
  Hypercar: "Hyper",
  Hyper: "Hyper",
  LMP2_WEC: "LMP2 WEC",
  "LMP2 WEC": "LMP2 WEC",
  LMP2_ELMS: "LMP2 ELMS",
  "LMP2 ELMS": "LMP2 ELMS",
  LMP2: "LMP2",
  LMP3: "LMP3",
  GT3: "GT3",
  GTE: "GTE",
};

export const CAR_CLASS_COLORS: Record<string, { color: string; background: string; border?: string }> = {
  Hypercar:    { color: "#f87171", background: "rgba(239,68,68,0.15)" },
  Hyper:       { color: "#f87171", background: "rgba(239,68,68,0.15)" },
  LMP2_WEC:    { color: "#60a5fa", background: "rgba(96,165,250,0.15)" },
  "LMP2 WEC":  { color: "#60a5fa", background: "rgba(96,165,250,0.15)" },
  LMP2_ELMS:   { color: "#60a5fa", background: "rgba(96,165,250,0.15)", border: "1px solid rgba(251,146,60,0.6)" },
  "LMP2 ELMS": { color: "#60a5fa", background: "rgba(96,165,250,0.15)", border: "1px solid rgba(251,146,60,0.6)" },
  LMP2:        { color: "#60a5fa", background: "rgba(96,165,250,0.15)" },
  LMP3:        { color: "#c084fc", background: "rgba(192,132,252,0.15)" },
  GT3:         { color: "#4ade80", background: "rgba(74,222,128,0.15)" },
  GTE:         { color: "#fb923c", background: "rgba(251,146,60,0.15)" },
};

export const CAR_CLASS_SOLID_COLORS: Record<string, { color: string; background: string; border?: string }> = {
  Hypercar:    { color: "#ffffff", background: "#ef4444" },
  Hyper:       { color: "#ffffff", background: "#ef4444" },
  LMP2_WEC:    { color: "#ffffff", background: "#3b82f6" },
  "LMP2 WEC":  { color: "#ffffff", background: "#3b82f6" },
  LMP2_ELMS:   { color: "#ffffff", background: "#3b82f6", border: "1px solid #fb923c" },
  "LMP2 ELMS": { color: "#ffffff", background: "#3b82f6", border: "1px solid #fb923c" },
  LMP2:        { color: "#ffffff", background: "#3b82f6" },
  LMP3:        { color: "#ffffff", background: "#a855f7" },
  GT3:         { color: "#ffffff", background: "#22c55e" },
  GTE:         { color: "#ffffff", background: "#f97316" },
};

/**
 * Couleur de remplissage pleine pour les graphiques (recharts `fill`/`stroke`).
 * Source unique : `CAR_CLASS_SOLID_COLORS`. Remplace les anciennes copies
 * `CLASS_COLORS` dupliquées dans Dashboard / Profile.
 *
 * @param carClass Clé de classe (brute backend ou libellé).
 * @param fallback Couleur de repli si la classe est inconnue.
 */
export function classChartColor(
  carClass: string,
  fallback = "var(--color-primary)"
): string {
  return CAR_CLASS_SOLID_COLORS[carClass]?.background ?? fallback;
}

export const LMU_CAR_CATEGORY_LABELS: Record<LmuCarCategory, string> = {
  hyper: "Hypercar",
  lmp2: "LMP2",
  lmp3: "LMP3",
  gt3: "GT3",
  gte: "GTE",
};

// ─── JSON loaders + préchargement ────────────────────────────────────────────

interface CarsJson {
  cars: { modelName: string; category: LmuCarCategory; keywords: string[] }[];
  classes: Record<string, { col: string; bg: string }>;
  brands: Record<string, string>;
}

interface CircuitsJson {
  circuits: string[];
  flags: Record<string, string>;
  aliases: Record<string, string>;
}

let _carsData: CarsJson | null = null;
let _circuitsData: CircuitsJson | null = null;

async function loadCarsData(): Promise<CarsJson> {
  if (_carsData) return _carsData;
  const resp = await fetch("/data/cars.json");
  if (!resp.ok) throw new Error(`cars.json: ${resp.status}`);
  _carsData = await resp.json();
  return _carsData!;
}

async function loadCircuitsData(): Promise<CircuitsJson> {
  if (_circuitsData) return _circuitsData;
  const resp = await fetch("/data/circuits.json");
  if (!resp.ok) throw new Error(`circuits.json: ${resp.status}`);
  _circuitsData = await resp.json();
  return _circuitsData!;
}

/** Précharge les deux JSON en parallèle. Appeler une seule fois au démarrage. */
export async function preloadStaticData(): Promise<void> {
  await Promise.all([loadCarsData(), loadCircuitsData()]);
  // Renseigne aussi les caches **synchrones** (`getCachedLmuCars/Circuits`),
  // utilisés par des composants non-async comme `NewSetupDialog` (menu voiture).
  // Les données brutes sont déjà en cache → pas de second fetch.
  await Promise.all([getLmuCars(), getLmuCircuits()]);
}

// ─── Catalogue voitures ─────────────────────────────────────────────────────

let _cachedLmuCars: LmuCar[] | null = null;

export async function getLmuCars(): Promise<LmuCar[]> {
  if (_cachedLmuCars) return _cachedLmuCars;
  const data = await loadCarsData();
  _cachedLmuCars = data.cars.map((c) => ({
    model: c.modelName,
    category: c.category,
  }));
  return _cachedLmuCars;
}

/** Sync getter — retourne le cache s'il est déjà chargé, sinon un tableau vide. */
export function getCachedLmuCars(): LmuCar[] {
  return _cachedLmuCars ?? [];
}

// ─── Catalogue circuits ─────────────────────────────────────────────────────

let _cachedLmuCircuits: string[] | null = null;

export async function getLmuCircuits(): Promise<string[]> {
  if (_cachedLmuCircuits) return _cachedLmuCircuits;
  const data = await loadCircuitsData();
  _cachedLmuCircuits = data.circuits;
  return _cachedLmuCircuits;
}

export function getCachedLmuCircuits(): string[] {
  return _cachedLmuCircuits ?? [];
}

// ─── Logos de marque ────────────────────────────────────────────────────────

let _cachedBrandMap: [string, string][] | null = null;

async function getBrandMap(): Promise<[string, string][]> {
  if (_cachedBrandMap) return _cachedBrandMap;
  const data = await loadCarsData();
  _cachedBrandMap = Object.entries(data.brands);
  return _cachedBrandMap;
}

function matchBrand(carName: string, brands: [string, string][]): string | null {
  if (!carName) return null;
  const lower = carName.toLowerCase().replace(/[\s_-]/g, "");
  for (const [keyword, file] of brands) {
    if (lower.includes(keyword.replace(/[\s_-]/g, ""))) return `/logos/${file}`;
  }
  return null;
}

/** Sync — utilise le cache si disponible, sinon retourne null. */
export function getCarLogoUrlSync(carName: string): string | null {
  if (!_cachedBrandMap) return null;
  return matchBrand(carName, _cachedBrandMap);
}

export async function getCarLogoUrl(carName: string): Promise<string | null> {
  const brands = await getBrandMap();
  return matchBrand(carName, brands);
}

// ─── Images de voiture (rendu) ──────────────────────────────────────────────

/** Slug stable pour un nom (sans accents, espaces → tirets). */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Slug de l'image voiture pour un nom donné. Si le nom correspond à un modèle
 * connu (via ses `keywords` dans cars.json), on prend le slug du `modelName`
 * canonique ; sinon on slugifie le nom tel quel. → image attendue dans
 * `public/cars/<slug>.webp` (ou `.png`). Renvoie null si data pas chargée.
 */
export function getCarImageSlugSync(carName: string): string | null {
  if (!carName) return null;
  if (_carsData) {
    const lower = carName.toLowerCase();
    for (const c of _carsData.cars) {
      if (c.keywords.some((k) => lower.includes(k.toLowerCase()))) {
        return slugify(c.modelName);
      }
    }
  }
  return slugify(carName) || null;
}

// ─── Drapeaux de circuit ────────────────────────────────────────────────────

let _cachedFlagKeywords: [string, string][] | null = null;

async function getFlagKeywords(): Promise<[string, string][]> {
  if (_cachedFlagKeywords) return _cachedFlagKeywords;
  const data = await loadCircuitsData();
  _cachedFlagKeywords = Object.entries(data.flags);
  return _cachedFlagKeywords;
}

export async function getCircuitCountry(track: string): Promise<string | null> {
  const keywords = await getFlagKeywords();
  return matchCountry(track, keywords);
}

function matchCountry(track: string, keywords: [string, string][]): string | null {
  const lower = track.toLowerCase();
  for (const [keyword, code] of keywords) {
    if (lower.includes(keyword)) return code;
  }
  return null;
}

/** Sync — utilise le cache si disponible, sinon retourne null. */
export function getCircuitFlagUrlSync(track: string): string | null {
  if (!_cachedFlagKeywords) return null;
  const code = matchCountry(track, _cachedFlagKeywords);
  return code ? `/flags/${code}.png` : null;
}

export async function getCircuitFlagUrl(track: string): Promise<string | null> {
  const code = await getCircuitCountry(track);
  return code ? `/flags/${code}.png` : null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function vehicleClassForCar(car: LmuCar): string {
  return `${car.model} ${LMU_CAR_CATEGORY_LABELS[car.category]}`;
}
