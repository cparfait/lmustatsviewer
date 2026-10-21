/** Texte lisible à voix haute à partir d'une réponse Markdown du Coach IA. */

/** Termine un titre par un point s'il n'a pas déjà une ponctuation forte —
 *  c'est ce qui fait marquer une pause au TTS entre le titre et le paragraphe
 *  (sans ça, « Point fort principal » et la phrase suivante s'enchaînent). */
function punctuateTitle(t: string): string {
  const clean = t.trim().replace(/:$/, "");
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

/** Retire le markdown pour la synthèse vocale (gras, titres, listes, code).
 *  Un bloc ``` non refermé (stream en cours) est aussi retiré : le JSON
 *  d'objectifs ne doit jamais être lu à voix haute. */
export function stripMarkdown(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, "")
    .replace(/```[\s\S]*$/, "")
    .replace(/`([^`]+)`/g, "$1")
    // Titres : `### Titre` et lignes en gras seules (`**Titre**`) → « Titre. »
    .replace(/^#{1,6}\s*(.+?)\s*$/gm, (_, t: string) => punctuateTitle(t))
    .replace(/^\s*\*\*([^*\n]+)\*\*\s*:?\s*$/gm, (_, t: string) => punctuateTitle(t))
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
