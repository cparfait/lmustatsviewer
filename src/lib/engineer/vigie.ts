/**
 * La vigie — les basiques du muret (module pur).
 *
 * Deux fautes de limiteur qu'un ingénieur voit sans réfléchir, alors que les
 * canaux sont déjà lus :
 *  - **voie des stands sans limiteur** : dans la voie, limiteur coupé, vitesse
 *    au-dessus de la limite et pas en train de freiner, tenu `SUSTAIN_S` — la
 *    pénalité tombe (une fois par passage) ;
 *  - **limiteur oublié** : ressorti en piste, limiteur encore actif, plein gaz
 *    et vitesse plafonnée, tenu `SUSTAIN_S` — on se fait manger sans comprendre
 *    (une fois par sortie).
 * Tout est sur front d'état tenu : pas un mot tant que la situation ne change pas.
 */

export const SUSTAIN_S = 3;
/** Marge au-dessus de la limite des stands (km/h). */
export const LANE_MARGIN_KMH = 5;
/** Limite supposée si le jeu ne la donne pas (km/h). */
export const DEFAULT_PIT_LIMIT_KMH = 60;
/** En dessous : un limiteur actif en piste est suspect (km/h). */
export const FORGOTTEN_MAX_KMH = 110;

export interface VigieInput {
  inPits: boolean;
  /** rF2 `mPitState` : 0 aucun, 1 demande, 2 entrée, 3 arrêté, 4 sortie. */
  pitState: number;
  limiter: boolean;
  speedKmh: number;
  brake: number;
  throttle: number;
  /** Limite de la voie des stands (km/h), null si inconnue. */
  pitLimitKmh: number | null;
}

export type VigieEvent = "pitLaneNoLimiter" | "limiterForgotten";

export class VigieTracker {
  private laneSince = -1;
  private laneWarned = false;
  private forgotSince = -1;
  private forgotWarned = false;

  reset(): void {
    this.laneSince = -1;
    this.laneWarned = false;
    this.forgotSince = -1;
    this.forgotWarned = false;
  }

  update(i: VigieInput, nowS: number): VigieEvent[] {
    const out: VigieEvent[] = [];
    const limit = (i.pitLimitKmh && i.pitLimitKmh > 0 ? i.pitLimitKmh : DEFAULT_PIT_LIMIT_KMH) + LANE_MARGIN_KMH;

    if (!i.inPits) {
      this.laneSince = -1;
      this.laneWarned = false;
    } else {
      const bad = !i.limiter && i.speedKmh > limit && i.brake < 0.1 && i.pitState !== 3;
      if (!bad) this.laneSince = -1;
      else {
        if (this.laneSince < 0) this.laneSince = nowS;
        if (!this.laneWarned && nowS - this.laneSince >= SUSTAIN_S) {
          this.laneWarned = true;
          out.push("pitLaneNoLimiter");
        }
      }
    }

    if (!i.limiter) {
      this.forgotSince = -1;
      this.forgotWarned = false;
    } else {
      const bad = !i.inPits && i.pitState === 0 && i.throttle > 0.9 && i.speedKmh < FORGOTTEN_MAX_KMH;
      if (!bad) this.forgotSince = -1;
      else {
        if (this.forgotSince < 0) this.forgotSince = nowS;
        if (!this.forgotWarned && nowS - this.forgotSince >= SUSTAIN_S) {
          this.forgotWarned = true;
          out.push("limiterForgotten");
        }
      }
    }
    return out;
  }
}
