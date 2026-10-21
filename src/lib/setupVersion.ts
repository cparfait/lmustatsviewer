/**
 * Nouvelle version d'un setup : copie du fichier (jamais d'écrasement), réglages
 * modifiés, lignée notée dans les notes (« <nom> ← #id : … »). Partagé par
 * l'assistant, l'audit IA, les profils et le bilan au box.
 */

import { setups as setupsApi, type SetupEntry } from "@/lib/api";
import { nextVersionName, type SectionPatch } from "@/lib/setupAssistant";

/** Nom de fichier sans extension. */
export function baseName(entry: Pick<SetupEntry, "name">): string {
  return entry.name.replace(/\.svm$/i, "");
}

/** Nom libre pour Windows et pour le jeu (pas de point, pas de caractère interdit). */
export function safeSetupName(name: string): string {
  // Caractères de contrôle (code < 32) retirés aussi : interdits dans un nom de fichier.
  const clean = [...name].map((c) => (c.charCodeAt(0) < 32 ? " " : c)).join("");
  return clean.replace(/[<>:"/\\|?*.]/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 80) || "Setup";
}

/**
 * Crée la version et rend la nouvelle entrée. `name` imposé (profil), sinon la
 * version suivante (« … V3 » → « … V4 »). `lines` s'ajoutent aux notes, après
 * la ligne de lignée.
 */
export async function createSetupVersion(args: {
  entry: SetupEntry;
  patches: SectionPatch[];
  label: string;
  notes: string | null;
  name?: string;
  lines?: string[];
  /** Autre dossier circuit (absent = celui de l'original). */
  circuit?: string;
  /** Type Course / Qualif / Autres (absent = celui de l'original). */
  setupType?: string;
}): Promise<SetupEntry> {
  const { entry, patches, label, notes } = args;
  const name = safeSetupName(args.name ?? nextVersionName(baseName(entry)));
  const copy = await setupsApi.duplicate(entry.id, name, args.circuit);
  if (args.setupType && args.setupType !== copy.setup_type) {
    await setupsApi.setType(copy.id, args.setupType);
    copy.setup_type = args.setupType;
  }
  if (patches.length) await setupsApi.update({ id: copy.id, sections: patches });
  const lineage = `${name} ← #${entry.id} : ${label}`;
  const all = [notes?.trim() || "", lineage, ...(args.lines ?? [])].filter(Boolean).join("\n");
  await setupsApi.setNotes(copy.id, all);
  return copy;
}

/** Premier nom libre « <base> » puis « <base> V2 »… parmi des noms déjà pris. */
export function freeName(base: string, taken: string[]): string {
  const set = new Set(taken.map((n) => n.replace(/\.svm$/i, "").toLowerCase()));
  const b = safeSetupName(base);
  if (!set.has(b.toLowerCase())) return b;
  for (let n = 2; n < 100; n++) {
    const c = `${b} V${n}`;
    if (!set.has(c.toLowerCase())) return c;
  }
  return `${b} ${Date.now()}`;
}
