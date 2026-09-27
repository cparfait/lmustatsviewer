/**
 * Prévision météo à partir des fichiers scénarisés `.wet` (module pur).
 *
 * La mémoire partagée n'expose aucune prévision. LMU écrit en revanche, pour
 * les sessions à météo scénarisée, un `.wet` JSON dans
 * `UserData/player/Settings/<Circuit>/` : par séance (`Practice`, `Qualifying`,
 * `Race`), ~5 nœuds `{Humidity, RainChance, Sky, Temperature, Wind…}` répartis
 * **linéairement** sur la durée de la séance.
 *
 * Règle d'or : la prévision anticipe le FUTUR et ne contredit jamais le live.
 * Comme rien ne garantit que le fichier trouvé est celui de la session courante
 * (il n'est pas réécrit à chaque session), on ne s'en sert que s'il est
 * **cohérent avec la mesure** : température annoncée pour l'instant présent à
 * ± `TEMP_TOLERANCE_C` de la température d'air relevée. Sinon : silence.
 */

import type { WetFile } from "@/lib/api";

export interface WetNode {
  Humidity: number;
  RainChance: number;
  Sky: number;
  Temperature: number;
}

export type WetSession = "Practice" | "Qualifying" | "Race";
export type WetData = Partial<Record<WetSession, WetNode[]>>;

/** Chance de pluie (%) à partir de laquelle on parle de pluie probable. */
export const RAIN_THRESHOLD = 40;
export const TEMP_TOLERANCE_C = 2.5;

/** Type de session rF2 → séance du `.wet`. */
export function wetSession(rf2Session: number): WetSession | null {
  if (rf2Session >= 1 && rf2Session <= 4) return "Practice";
  if (rf2Session >= 5 && rf2Session <= 8) return "Qualifying";
  if (rf2Session === 9) return "Practice"; // warm-up
  if (rf2Session >= 10) return "Race";
  return null;
}

export function parseWet(content: string): WetData | null {
  try {
    const j = JSON.parse(content) as Record<string, { Weather?: unknown }>;
    const out: WetData = {};
    for (const k of ["Practice", "Qualifying", "Race"] as WetSession[]) {
      const w = j?.[k]?.Weather;
      if (!Array.isArray(w) || w.length === 0) continue;
      const nodes = w
        .map((n) => n as Partial<WetNode>)
        .filter((n) => typeof n.RainChance === "number" && typeof n.Temperature === "number")
        .map((n) => ({
          Humidity: Number(n.Humidity ?? 0),
          RainChance: Number(n.RainChance),
          Sky: Number(n.Sky ?? 0),
          Temperature: Number(n.Temperature),
        }));
      if (nodes.length) out[k] = nodes;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

const norm = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Dossier Settings (normalisé) → sous-chaînes du nom de circuit live qui le désignent. */
const FOLDER_ALIASES: Record<string, string[]> = {
  lemans: ["sarthe", "lemans"],
  qatar: ["lusail", "losail", "qatar"],
  portimao: ["algarve", "portim"],
  imola: ["imola", "enzoedino"],
  interlagos: ["interlagos", "carlospace"],
  cota: ["americas", "cota"],
  circuitoftheamericas: ["americas"],
  longbeach: ["longbeach"],
  paulricard: ["ricard"],
  lagunaseca: ["laguna"],
  daytonarc: ["daytona"],
  circuitdebarcelona: ["barcelona", "catalunya"],
  bahrain: ["bahrain", "sakhir"],
  spa: ["spa", "francorchamps"],
};

/** Vrai si le dossier de circuit correspond au nom de circuit live. */
export function folderMatchesTrack(folder: string, track: string): boolean {
  const f = norm(folder);
  const t = norm(track);
  if (!f || !t) return false;
  if (t.includes(f)) return true;
  const aliases = FOLDER_ALIASES[f] ?? (f.startsWith("silverstone") ? ["silverstone"] : []);
  return aliases.some((a) => t.includes(a));
}

/** Le `.wet` le plus récent du circuit, ou null. */
export function pickWetFile(files: WetFile[], track: string): WetFile | null {
  const cands = files.filter((f) => f.content && folderMatchesTrack(f.folder, track));
  cands.sort((a, b) => b.mtime - a.mtime);
  return cands[0] ?? null;
}

/** Nœud interpolé à la fraction `frac` (0-1) de la séance. */
export function interp(nodes: WetNode[], frac: number): WetNode {
  if (nodes.length === 1) return nodes[0];
  const x = Math.min(1, Math.max(0, frac)) * (nodes.length - 1);
  const i = Math.min(nodes.length - 2, Math.floor(x));
  const k = x - i;
  const a = nodes[i];
  const b = nodes[i + 1];
  const mix = (p: number, q: number) => p + (q - p) * k;
  return {
    Humidity: mix(a.Humidity, b.Humidity),
    RainChance: mix(a.RainChance, b.RainChance),
    Sky: mix(a.Sky, b.Sky),
    Temperature: mix(a.Temperature, b.Temperature),
  };
}

/** La prévision colle-t-elle à la mesure d'air du moment ? */
export function consistentWithLive(nodes: WetNode[], frac: number, airTempC: number): boolean {
  if (!isFinite(airTempC)) return false;
  return Math.abs(interp(nodes, frac).Temperature - airTempC) <= TEMP_TOLERANCE_C;
}

/**
 * Prochaine arrivée de pluie probable (chance ≥ seuil) APRÈS maintenant, en
 * secondes, ou null (rien d'annoncé, ou il « pleut » déjà selon le script —
 * le présent appartient au live).
 */
export function nextRain(
  nodes: WetNode[],
  fracNow: number,
  durationS: number,
  threshold = RAIN_THRESHOLD,
): { inS: number; chance: number } | null {
  if (durationS <= 0 || interp(nodes, fracNow).RainChance >= threshold) return null;
  for (let f = fracNow; f <= 1.0001; f += 0.005) {
    const n = interp(nodes, f);
    if (n.RainChance >= threshold) return { inS: (f - fracNow) * durationS, chance: Math.round(n.RainChance) };
  }
  return null;
}
