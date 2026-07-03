/**
 * Digest des records personnels pour le Coach IA **live**.
 *
 * Le contexte live (`live-context.ts`) ne contient que la session en cours : le
 * coach ne pouvait donc pas répondre à « mon meilleur temps à Spa en Mercedes ? »
 * On joint ici un résumé compact de **tous** les combos circuit/voiture présents
 * en base (réutilise `records::get_records_overview`, comme la page Records) :
 * le coach a ainsi accès à l'historique complet, pas seulement au tour en cours.
 *
 * Étiquettes EN compactes (cohérent avec les autres contextes). 1 ligne/combo,
 * trié par classe puis circuit. Renvoie "" si aucun record.
 */

import { records } from "../../api";
import { buildLiveContext } from "./live-context";
import { formatTime } from "../../utils";
import type { LiveData } from "../../api";

/** Ordre d'affichage des classes (mêmes priorités que le reste de l'app). */
const CLASS_ORDER: Record<string, number> = {
  Hyper: 1,
  Hypercar: 1,
  "LMP2 WEC": 2,
  "LMP2 ELMS": 3,
  LMP2: 3,
  LMP3: 4,
  GT3: 5,
  GTE: 6,
};

// Cache module : les records ne changent pas pendant une session de pilotage.
// On évite ainsi un appel SQLite par question vocale. `resetRecordsDigestCache`
// l'invalide (à appeler après une (re)synchronisation des données).
let _digestCache: string | null = null;
export function resetRecordsDigestCache() {
  _digestCache = null;
}

/**
 * Détecte si une question porte sur l'**historique** (records, PB, comparaison)
 * → seul cas où l'on joint le digest complet au contexte live/vocal. Multilingue,
 * insensible aux accents/casse. (Les questions « dois-je pit ? », « mes pneus ? »
 * n'ont pas besoin de l'historique → contexte plus léger et plus rapide.)
 */
const HISTORY_KEYWORDS = [
  // fr
  "meilleur", "record", "deja", "plus rapide", "historique", "progression", "pb",
  // en
  "best", "fastest", "history", "ever", "all-time", "all time", "previous", "before", "personal best",
  // es
  "mejor", "mas rapido", "historial", "antes", "record",
  // de
  "bestzeit", "rekord", "schnellste", "bisher", "verlauf",
];
export function isHistoricalQuestion(q: string): boolean {
  const norm = q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return HISTORY_KEYWORDS.some((k) => norm.includes(k));
}

export async function buildRecordsDigest(maxRows = 120): Promise<string> {
  if (_digestCache !== null) return _digestCache;
  let rows;
  try {
    rows = await records.getOverview();
  } catch {
    return "";
  }
  if (!rows.length) {
    _digestCache = "";
    return "";
  }

  rows.sort((a, b) => {
    const ca = CLASS_ORDER[a.car_class] ?? 99;
    const cb = CLASS_ORDER[b.car_class] ?? 99;
    if (ca !== cb) return ca - cb;
    if (a.track !== b.track) return a.track.localeCompare(b.track);
    return a.best_lap - b.best_lap;
  });

  const lines: string[] = [];
  lines.push("## Personal records — all tracks/cars in your local database");
  lines.push("(your all-time best lap per track + car combo; use this for any history question)");
  for (const r of rows.slice(0, maxRows)) {
    const layout =
      r.track_course && r.track_course !== r.track ? ` (${r.track_course})` : "";
    const vmax = r.vmax && r.vmax > 0 ? ` · vmax ${Math.round(r.vmax)} km/h` : "";
    lines.push(
      `${r.track}${layout} · ${r.car_class} · ${r.car}: ${formatTime(r.best_lap)}${vmax} · ${r.sessions_count} sessions`,
    );
  }
  if (rows.length > maxRows) {
    lines.push(`… and ${rows.length - maxRows} more combos.`);
  }
  _digestCache = lines.join("\n");
  return _digestCache;
}

/**
 * Contexte du coach **live/vocal** = snapshot session courante (+ digest records
 * UNIQUEMENT si la question porte sur l'historique). Garde le contexte léger et
 * rapide pour les questions courantes (« dois-je pit ? », « mes pneus ? »).
 *
 * NB : l'analyse **post-course** et la **comparaison** n'utilisent pas cette
 * fonction — elles ont leur propre contexte qui inclut TOUJOURS l'historique
 * (`buildPostRaceContext` + `buildDriverHistoryText`).
 */
export async function buildLiveCoachContext(
  data: LiveData,
  question?: string,
): Promise<string> {
  const base = buildLiveContext(data);
  if (!question || !isHistoricalQuestion(question)) return base;
  const digest = await buildRecordsDigest();
  return digest ? `${base}\n\n${digest}` : base;
}
