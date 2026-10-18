/**
 * Présentation partagée du journal des versions (page Notes de version et fenêtre
 * « Mise à jour installée ») : icône et couleur par type de section, et découpe
 * « Titre : description » d'une nouveauté mise en avant.
 */

import type { ChangelogSectionKind } from "@/lib/changelog";

export const SECTION_META: Record<ChangelogSectionKind, { icon: string; color: string }> = {
  added: { icon: "✅", color: "text-success" },
  improved: { icon: "⬆️", color: "text-sky-400" },
  fixed: { icon: "🐛", color: "text-yellow-500" },
  changed: { icon: "♻️", color: "text-purple" },
  removed: { icon: "🗑️", color: "text-destructive" },
};

/** Ponctuation après le titre en gras : espace avant les deux-points en français seulement. */
export function leadSep(lang: string): string {
  return lang.slice(0, 2).toLowerCase() === "fr" ? " : " : ": ";
}

/** Sépare un libellé « Titre : description » pour mettre le titre en gras. */
export function splitLead(text: string): { lead: string | null; rest: string } {
  const idx = text.search(/[:：]/);
  if (idx <= 0 || idx > 40) return { lead: null, rest: text };
  return { lead: text.slice(0, idx).trimEnd(), rest: text.slice(idx + 1).trim() };
}
