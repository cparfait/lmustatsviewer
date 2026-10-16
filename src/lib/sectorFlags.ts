/**
 * Lecture de `mSectorFlag[3]` (mémoire partagée rF2/LMU, `flags.sector_flags`).
 *
 * Relevés réels (Road Atlanta, 2026-10-16) : la valeur courante est **11**
 * (aucun jaune), avec des 1, 2 et 3 par moments (`[1, 11, 3]`, `[1, 2, 2]` en
 * fin de course, `yellow_flag_state` = 0). L'ancien test `> 0` allumait donc
 * tous les secteurs en jaune en permanence. Seul 1 est lu comme « jaune local »
 * (les autres valeurs restent à identifier, cf. SUIVI §7).
 *
 * Ordre des index : encore à confirmer sous un jaune local connu ; on garde
 * `sector_flags[i]` = S(i+1) en attendant.
 */
export const SECTOR_YELLOW = 1;

export function isSectorYellow(v: number | null | undefined): boolean {
  return v === SECTOR_YELLOW;
}
