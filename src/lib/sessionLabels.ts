/**
 * Libellé localisé d'un type de session (Course / Qualif / Essais).
 *
 * Extrait de `SessionBadge.tsx` pour que ce dernier n'exporte qu'un composant
 * (compatibilité React Fast Refresh). Partagé par Sessions, Dashboard, Records.
 */

/** Type de session brut → libellé traduit (repli : le type tel quel). */
export function sessionTypeLabel(
  type: string,
  t: (k: string) => string,
): string {
  if (type === "Race") return t("records.sessionRace");
  if (type.startsWith("Qualif")) return t("records.sessionQualifying");
  if (type.startsWith("Practice")) return t("records.sessionPractice");
  return type;
}
