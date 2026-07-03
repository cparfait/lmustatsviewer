/**
 * Auto-calibration du niveau pilote (COACH-LIVE-SPEC.md §7, P3.2) — module **pur**.
 *
 * Le niveau pilote n'est **jamais déclaré** : il se déduit du rythme réel du joueur
 * comparé au tour *alien* du combo (benchmarks ohne_speed, §2.1). Le pourcentage
 * `temps / alien` situe le pilote sur trois paliers (§7) qui gouvernent le gating
 * (pas de trail à un débutant) et la largeur des seuils (planchers dans `diagnostics.ts`) :
 *
 *  - **Débutant** (> 107 %) : fondamentaux seuls, seuils larges, repères visuels.
 *  - **Intermédiaire** (102–107 %) : nominal.
 *  - **Rapide** (< 102 %) : seuils fins, chiffres bruts, vocabulaire technique.
 *
 * La résolution du benchmark (réseau, mapping circuit/classe) vit dans le service ;
 * ce module ne fait que l'arithmétique des seuils → rejouable et testable (§14).
 */

import type { DriverLevel } from "./diagnostics";

/** Seuil bas (%) du palier *intermédiaire* : sous ce %, le pilote est *rapide* (§7). */
export const FAST_PCT = 102;
/** Seuil haut (%) du palier *intermédiaire* : au-delà, le pilote est *débutant* (§7). */
export const BEGINNER_PCT = 107;

/**
 * Palier pilote pour un pourcentage `temps / alien × 100` (§7). Sur les bornes,
 * le palier le plus favorable prime (exactement 102 % = intermédiaire, pas rapide).
 */
export function driverLevelFromPercent(percent: number): DriverLevel {
  if (!Number.isFinite(percent) || percent <= 0) return "intermediate";
  if (percent < FAST_PCT) return "fast";
  if (percent > BEGINNER_PCT) return "beginner";
  return "intermediate";
}

/**
 * Niveau pilote depuis un meilleur tour propre et le tour alien du combo (ms).
 * Renvoie `null` si l'un des deux manque (pas de calibration → le service garde
 * le défaut). On calibre sur le **meilleur** tour propre (représente le vrai
 * potentiel du pilote, pas sa moyenne), monotone décroissant → pas de va-et-vient
 * de palier au fil de la session.
 */
export function calibrateDriverLevel(
  bestCleanLapMs: number,
  alienMs: number,
): DriverLevel | null {
  if (!(bestCleanLapMs > 0) || !(alienMs > 0)) return null;
  return driverLevelFromPercent((bestCleanLapMs / alienMs) * 100);
}
