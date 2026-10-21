/**
 * Setup mixte (page Comparaison) : on part de A et on reprend de B les seuls
 * réglages choisis par le pilote. Module pur : il ne fait que construire les
 * sections à écrire dans la copie de A (l'original n'est jamais modifié).
 */

import type { SetupDiffSection } from "@/lib/api";
import type { SectionPatch } from "@/lib/setupAssistant";

/** Identifiant d'un réglage dans la comparaison. */
export function pickId(section: string, key: string): string {
  return `${section}|${key}`;
}

/** Réglages qui diffèrent dans une section (ceux qu'on peut prendre de B). */
export function diffIds(section: SetupDiffSection): string[] {
  return section.params.filter((p) => p.is_diff).map((p) => pickId(section.name, p.key));
}

/** Sections à écrire dans la copie de A : valeur ET texte du garage de B pour chaque réglage choisi. */
export function mixPatches(diffs: SetupDiffSection[], picked: ReadonlySet<string>): SectionPatch[] {
  const out: SectionPatch[] = [];
  for (const s of diffs) {
    const params = s.params
      .filter((p) => p.is_diff && picked.has(pickId(s.name, p.key)))
      .map((p) => ({ key: p.key, value: p.value_b, comment: p.comment_b }));
    if (params.length) out.push({ name: s.name, params });
  }
  return out;
}
