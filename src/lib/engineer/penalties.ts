/**
 * Pénalités et limites de piste (module pur, horloge en paramètre).
 *
 * Trois sources, croisées :
 *  - le compteur de pénalités du scoring (`num_penalties`) : une de plus = une
 *    pénalité reçue, une de moins = une pénalité **purgée** ;
 *  - le centre de messages du jeu (`gameMessages.ts`) : type et cause exacts ;
 *  - le compteur de limites de piste de la mémoire native LMU (`track_limits`,
 *    `track_limits_per_penalty`).
 *
 * Le message du jeu et la hausse du compteur n'arrivent pas toujours dans la même
 * trame : la hausse attend `TYPE_WAIT_S` un message typé avant de se rabattre sur
 * l'annonce générique « pénalité reçue ».
 */

import type { GameMsg, PenaltyCause, PenaltyType } from "./gameMessages";

/** Délai d'attente d'un message typé après une hausse du compteur (s). */
export const TYPE_WAIT_S = 1.5;
/** Un message typé arrivé jusqu'à ce délai avant la hausse s'y rattache (s). */
const TYPE_BEFORE_S = 3;

export type PenaltyEvent =
  | { kind: "penalty"; type: PenaltyType | null; cause: PenaltyCause | null }
  | { kind: "served" }
  | { kind: "trackLimits"; count: number; max: number; last: boolean };

export class PenaltyTracker {
  private count = -1;
  /** Hausse du compteur en attente d'un message typé (date de la hausse). */
  private pendingSince: number | null = null;
  /** Dernier message de pénalité reçu (pour rattacher une hausse qui suit). */
  private typed: { type: PenaltyType; cause: PenaltyCause; at: number; used: boolean } | null = null;
  private limits = -1;

  reset() {
    this.count = -1;
    this.pendingSince = null;
    this.typed = null;
    this.limits = -1;
  }

  /** Pénalités en cours selon le scoring (dernière valeur vue). */
  get outstanding(): number {
    return Math.max(0, this.count);
  }

  /** Dernière pénalité typée connue (réponse « quelle pénalité ? »). */
  get lastTyped(): { type: PenaltyType; cause: PenaltyCause } | null {
    return this.typed ? { type: this.typed.type, cause: this.typed.cause } : null;
  }

  update(nowS: number, numPenalties: number, msg: GameMsg | null): PenaltyEvent[] {
    const out: PenaltyEvent[] = [];
    if (msg?.kind === "penalty") {
      this.typed = { type: msg.type, cause: msg.cause, at: nowS, used: false };
      // Hausse déjà vue et en attente : elle devient typée tout de suite.
      if (this.pendingSince != null) {
        this.pendingSince = null;
        this.typed.used = true;
        out.push({ kind: "penalty", type: msg.type, cause: msg.cause });
      }
    }
    if (this.count < 0) {
      this.count = numPenalties;
    } else if (numPenalties > this.count) {
      const t = this.typed;
      if (t && !t.used && nowS - t.at <= TYPE_BEFORE_S) {
        t.used = true;
        out.push({ kind: "penalty", type: t.type, cause: t.cause });
      } else {
        this.pendingSince = nowS;
      }
      this.count = numPenalties;
    } else if (numPenalties < this.count) {
      this.count = numPenalties;
      this.pendingSince = null;
      out.push({ kind: "served" });
    }
    if (this.pendingSince != null && nowS - this.pendingSince >= TYPE_WAIT_S) {
      this.pendingSince = null;
      out.push({ kind: "penalty", type: null, cause: null });
    }
    return out;
  }

  /**
   * Limites de piste (mémoire native LMU) : une annonce à chaque nouvelle
   * coupure comptée, si le seuil de pénalité est connu. `last` = la prochaine
   * coupure coûte une pénalité.
   */
  trackLimits(count: number | undefined, max: number | undefined): PenaltyEvent | null {
    if (count == null || max == null || !(max > 0)) return null;
    const prev = this.limits;
    this.limits = count;
    // Première valeur vue, ou remise à zéro (pénalité donnée, nouvelle séance).
    if (prev < 0 || count <= prev) return null;
    return { kind: "trackLimits", count, max, last: count === max - 1 };
  }
}
