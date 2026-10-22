/**
 * Setup chargé dans la voiture, lu dans le jeu en piste (`garage/summary`,
 * `lmu_rest.rs`) : module pur. Retrouve le fichier en base par son chemin
 * (`…\Settings\<dossier>\<fichier>.svm`), comme `setup_usage.rs` côté Rust —
 * jamais par l'id, qui change à chaque rescan.
 */

import type { LmuRestLive, RestLoadedSetup, SetupEntry } from "@/lib/api";

/** Clé normalisée d'un setup : `dossier\fichier` en minuscules, sans `.svm`. */
export function setupKey(folder: string | null | undefined, file: string): string {
  const f = file.trim().replace(/\.svm$/i, "").toLowerCase();
  const d = (folder ?? "").trim().toLowerCase();
  return d ? `${d}\\${f}` : f;
}

/** Clé d'un setup en base depuis son chemin (les segments sous `Settings`), sinon null. */
export function keyOfPath(svmPath: string): string | null {
  const parts = svmPath.replace(/\//g, "\\").split("\\").filter(Boolean);
  let i = -1;
  parts.forEach((p, k) => {
    if (p.toLowerCase() === "settings") i = k;
  });
  if (i < 0) return null;
  const rest = parts.slice(i + 1);
  if (rest.length === 1) return setupKey(null, rest[0]);
  if (rest.length === 2) return setupKey(rest[0], rest[1]);
  return null;
}

/**
 * Setup chargé connu : `fresh` = lu à l'instant (en piste) ; sinon dernière
 * lecture (le jeu n'est pas interrogé au garage : un changement n'y est vu
 * qu'au retour en piste).
 */
export function loadedSetup(rest: LmuRestLive | null | undefined): { setup: RestLoadedSetup; fresh: boolean } | null {
  const f = rest?.setup;
  if (!f?.data || (f.state !== "fresh" && f.state !== "stale")) return null;
  return { setup: f.data, fresh: f.state === "fresh" };
}

/** Le setup en base qui correspond au setup chargé (même dossier et même fichier). */
export function findLoadedEntry(entries: SetupEntry[], setup: RestLoadedSetup | null | undefined): SetupEntry | null {
  if (!setup?.folder) return null; // setup intégré au jeu : aucun fichier
  const key = setupKey(setup.folder, setup.file);
  return entries.find((e) => keyOfPath(e.svm_path) === key) ?? null;
}
