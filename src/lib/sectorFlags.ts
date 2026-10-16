/**
 * Lecture de `mSectorFlag[3]` (mémoire partagée rF2/LMU, `flags.sector_flags`).
 *
 * ⚠️ **Désactivé** : dans LMU, cette donnée n'indique pas les jaunes locaux de
 * façon exploitable. Relevés réels (Road Atlanta, 2026-10-16) :
 * - essais sans aucun incident : `[1, 11, 1]` constant pendant toute la séance ;
 * - course : `[11, 1, 11]`, `[11, 11, 1]`, `[1, 11, 11]` (plus de 3 min en vert),
 *   puis `[1, 11, 3]` et `[1, 2, 2]` en fin de course, `yellow_flag_state` = 0.
 * Ni « > 0 » (tout en jaune en permanence) ni « === 1 » (deux secteurs jaunes
 * en essais) ne correspondent à un vrai jaune. Le `sectorFlag` de l'API REST
 * (`UNKNOWN` / `YELLOW` sur les trois secteurs à la fois) ne colle pas non plus.
 *
 * Tant qu'aucune source fiable n'est trouvée (SUIVI §7), aucun secteur n'est
 * signalé sous jaune : carte Live, widget Drapeaux et coach (tours de référence).
 * Les appelants passent tous par cette fonction : la réactiver ici suffit.
 */
export function isSectorYellow(_v: number | null | undefined): boolean {
  return false;
}
