/**
 * Cohabitation avec un autre ingénieur radio (module pur).
 *
 * Quand un autre logiciel d'annonces vocales tourne en même temps (détecté par
 * `other_engineer_running`), deux voix disent la même chose. Le mode
 * « cohabitation » (réglage, désactivé par défaut) coupe ici le spotter et les
 * annonces qu'un ingénieur radio classique fait déjà (drapeaux, positions,
 * écarts, chronos, pénalités, limiteur, temps restant…) et garde ce qui fait la
 * valeur propre de l'app : stratégie (fenêtre d'arrêt, arrêts des rivaux,
 * trafic multiclasse), météo et prévision, pneus pluie / slicks, batterie
 * hybride, alertes « préviens-moi », coach.
 */

import type { Candidate } from "./arbiter";

/** Préfixes de clés d'annonces en doublon avec un ingénieur radio classique. */
const OVERLAP = [
  "flag:",
  "fuel:laps",
  "fuel:refuel",
  "pos:",
  "gap:",
  "blue",
  "lap:",
  "delta",
  "sector:",
  "penalty",
  "pen:",
  "limits:",
  "pit:request",
  "pit:exit",
  "pit:done",
  "vigie:",
  "time:",
  "race:",
  "fastest",
  "mech:",
  "tyres:cold",
  "tyres:wear",
  "tyres:hot",
  "closing:",
  "opening:",
  "sc:",
  "fo:",
  "msg:",
  "pressure:",
  "dirt",
  "lock:",
  "crash:",
  "push:",
  "pitx:",
];

export function overlapsOtherEngineer(key: string): boolean {
  return OVERLAP.some((p) => key.startsWith(p));
}

/** Retire les annonces en doublon quand la cohabitation est active. */
export function coexistFilter(cands: Candidate[], active: boolean): Candidate[] {
  return active ? cands.filter((c) => !overlapsOtherEngineer(c.key)) : cands;
}
