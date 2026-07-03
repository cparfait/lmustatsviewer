/**
 * Taille/forme commune à TOUTES les pastilles des tableaux (ClassBadge,
 * SessionBadge, TierBadge). Source unique pour garantir une hauteur identique.
 *
 * `leading-none` est essentiel : `text-micro` ne fixe que la taille de police,
 * pas la hauteur de ligne — sans lui, la hauteur de la pastille dépendrait du
 * contexte de la cellule et varierait d'une colonne à l'autre.
 */
export const BADGE_BASE =
  "inline-flex items-center rounded-full border px-1.5 py-0.5 text-micro font-semibold uppercase leading-none tracking-wide whitespace-nowrap";
