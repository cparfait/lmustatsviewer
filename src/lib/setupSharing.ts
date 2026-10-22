/**
 * Partage des setups avec la communauté (Config › Atelier, désactivé par défaut ;
 * exige aussi le partage communautaire, connexion Steam comprise).
 *
 *  - Tables de crans : ce que le garage affiche pour chaque index d'un réglage. Donnée
 *    du jeu, pas un réglage du pilote : déclarée quand elle change, et la table de
 *    consensus de la communauté complète la nôtre (la nôtre l'emporte toujours) — une
 *    voiture jamais conduite a ses bornes tout de suite.
 *  - Setups : jamais envoyés sans le bouton « Publier » de la fiche ; téléchargés comme
 *    un NOUVEAU fichier du jeu (jamais d'écrasement).
 */

import { community, type CommunityNotchTable, type CommunitySharedSetup } from "@/lib/api";
import { FLAG_SETUP_SHARING, readConfigFlag } from "@/lib/configFlag";
import { mergeTables, type NotchTable } from "@/lib/setupNotches";
import { freeName } from "@/lib/setupVersion";

/** Même règle que le serveur : `<dossier du véhicule>/<version>`. */
const SHAREABLE_KEY = /^[A-Za-z0-9][A-Za-z0-9_. -]{0,79}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,19}$/;
const PARAM_ID = /^[A-Z0-9_]{1,40}\.[A-Za-z0-9_]{1,60}$/;
// eslint-disable-next-line no-control-regex
const DISPLAY = /^[^\u0000-\u001f\u007f]{1,40}$/;

export function isShareableCarKey(key: string): boolean {
  return SHAREABLE_KEY.test(key);
}

/** « Mercedes_AMGGT3Evo_2025 » depuis « Mercedes_AMGGT3Evo_2025/1.11 ». */
export function carFolderOf(key: string): string {
  const i = key.lastIndexOf("/");
  return i > 0 ? key.slice(0, i) : key;
}

/**
 * Table telle qu'on l'envoie (ou qu'on l'accepte du serveur) : réglages et textes
 * valides seulement, au plus 300 réglages et 300 crans par réglage.
 */
export function cleanTable(t: NotchTable | null | undefined): NotchTable {
  const out: NotchTable = {};
  if (!t || typeof t !== "object") return out;
  for (const [id, e] of Object.entries(t).slice(0, 300)) {
    if (!PARAM_ID.test(id) || !e || typeof e !== "object") continue;
    const displays: Record<string, string> = {};
    for (const [i, d] of Object.entries(e.displays ?? {}).slice(0, 300)) {
      if (/^\d{1,3}$/.test(i) && typeof d === "string" && DISPLAY.test(d.trim())) displays[i] = d.trim();
    }
    const count = Number.isInteger(e.count) && (e.count as number) >= 1 && (e.count as number) <= 1000 ? e.count : undefined;
    if (Object.keys(displays).length || count != null) out[id] = count != null ? { displays, count } : { displays };
  }
  return out;
}

/** Empreinte stable d'une table (ordre des clés indifférent) : on ne renvoie que ce qui change. */
export function tableFingerprint(t: NotchTable): string {
  const parts: string[] = [];
  for (const id of Object.keys(t).sort()) {
    const e = t[id];
    const d = Object.keys(e.displays)
      .sort((a, b) => Number(a) - Number(b))
      .map((i) => `${i}=${e.displays[i]}`)
      .join(",");
    parts.push(`${id}:${e.count ?? ""}:${d}`);
  }
  let h = 0x811c9dc5; // FNV-1a 32 bits
  for (const ch of parts.join("|")) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

/** Notre table complétée par celle de la communauté (la nôtre l'emporte). */
export function withCommunity(local: NotchTable, shared: NotchTable | null | undefined): NotchTable {
  return shared ? mergeTables(local, cleanTable(shared)) : local;
}

// ── Échanges (option active seulement) ───────────────────────────────────────

const pushed = new Map<string, string>();
const fetched = new Map<string, { at: number; table: NotchTable | null }>();
const FETCH_TTL_MS = 10 * 60_000;

/**
 * Appelé par `learnForCar` : déclare notre table si elle a changé, puis rend notre table
 * complétée par le consensus. Sans l'option, ou hors ligne : notre table telle quelle.
 */
export async function shareNotches(carKey: string, table: NotchTable): Promise<NotchTable> {
  if (!isShareableCarKey(carKey) || !(await readConfigFlag(FLAG_SETUP_SHARING))) return table;
  const clean = cleanTable(table);
  const fp = tableFingerprint(clean);
  if (Object.keys(clean).length && pushed.get(carKey) !== fp) {
    // Envoi en arrière-plan : la fiche ne doit pas attendre le réseau.
    void community
      .notchesPush(carKey, clean)
      .then((sent) => sent && pushed.set(carKey, fp))
      .catch(() => {});
  }
  const hit = fetched.get(carKey);
  let shared = hit && Date.now() - hit.at < FETCH_TTL_MS ? hit.table : undefined;
  if (shared === undefined) {
    const r = await community.get<CommunityNotchTable>("notches", { car: carKey }).catch(() => null);
    shared = r?.table ?? null;
    fetched.set(carKey, { at: Date.now(), table: shared });
  }
  return withCommunity(table, shared);
}

/** Première version de l'app qui publie des setups (même règle que le serveur). */
export const SETUPS_SINCE = "1.0.10";

/**
 * App de développement ou bêta (version antérieure à `SETUPS_SINCE` ou préliminaire) :
 * ses publications sont des essais, invisibles du public ; elle seule les liste.
 */
export function isTestBuild(version: string, since = SETUPS_SINCE): boolean {
  const num = (v: string) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split(".").map(Number) : null);
  const v = num(version);
  const min = num(since)!;
  if (!v) return true;
  for (let i = 0; i < 3; i++) if (v[i] !== min[i]) return v[i] < min[i];
  return false;
}

/** Nom du fichier créé au téléchargement : « <nom> (<auteur>) », puis V2, V3… si pris. */
export function importName(s: Pick<CommunitySharedSetup, "name" | "author">, taken: string[]): string {
  const who = s.author.name ?? s.author.tag.replace("#", "");
  return freeName(`${s.name} (${who})`, taken);
}
