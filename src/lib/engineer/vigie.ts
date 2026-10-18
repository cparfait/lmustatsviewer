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
 * Et deux rappels au passage des lignes, sans attendre la faute :
 *  - **entrée des stands** : on vient d'entrer dans la voie et le limiteur n'est
 *    toujours pas mis après `ENTRY_GRACE_S` → « mets le limiteur » ;
 *  - **sortie des stands** : on vient de repasser en piste avec le limiteur encore
 *    actif après `EXIT_GRACE_S` → « enlève le limiteur ».
 * Rien au départ du garage (pas de passage de ligne), une fois par passage.
 * Tout est sur front d'état tenu : pas un mot tant que la situation ne change pas.
 */

export const SUSTAIN_S = 3;
/** Marge au-dessus de la limite des stands (km/h). */
export const LANE_MARGIN_KMH = 5;
/** Limite supposée si le jeu ne la donne pas (km/h). */
export const DEFAULT_PIT_LIMIT_KMH = 60;
/** En dessous : un limiteur actif en piste est suspect (km/h). */
export const FORGOTTEN_MAX_KMH = 110;
/** Délai laissé pour mettre le limiteur après la ligne d'entrée des stands (s). */
export const ENTRY_GRACE_S = 1.5;
/** Délai laissé pour couper le limiteur après la ligne de sortie des stands (s). */
export const EXIT_GRACE_S = 1;

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

export type VigieEvent = "pitLaneNoLimiter" | "limiterForgotten" | "pitEntryNoLimiter" | "pitExitLimiterOn";

export class VigieTracker {
  private laneSince = -1;
  private laneWarned = false;
  private forgotSince = -1;
  private forgotWarned = false;
  /** Dernier état « dans la voie des stands » vu (null = pas encore d'échantillon). */
  private wasInPits: boolean | null = null;
  private entrySince = -1;
  private exitSince = -1;

  reset(): void {
    this.laneSince = -1;
    this.laneWarned = false;
    this.forgotSince = -1;
    this.forgotWarned = false;
    this.wasInPits = null;
    this.entrySince = -1;
    this.exitSince = -1;
  }

  update(i: VigieInput, nowS: number): VigieEvent[] {
    const out: VigieEvent[] = [];
    const limit = (i.pitLimitKmh && i.pitLimitKmh > 0 ? i.pitLimitKmh : DEFAULT_PIT_LIMIT_KMH) + LANE_MARGIN_KMH;

    // Passages de ligne (entrée / sortie de la voie des stands).
    if (this.wasInPits === false && i.inPits) {
      this.entrySince = nowS;
      this.exitSince = -1;
    } else if (this.wasInPits === true && !i.inPits) {
      this.exitSince = nowS;
      this.entrySince = -1;
    }
    this.wasInPits = i.inPits;

    if (this.entrySince >= 0) {
      if (!i.inPits || i.limiter || i.pitState === 3) this.entrySince = -1;
      else if (nowS - this.entrySince >= ENTRY_GRACE_S) {
        this.entrySince = -1;
        this.laneWarned = true; // un seul rappel limiteur pour ce passage
        out.push("pitEntryNoLimiter");
      }
    }
    if (this.exitSince >= 0) {
      if (i.inPits || !i.limiter) this.exitSince = -1;
      else if (nowS - this.exitSince >= EXIT_GRACE_S) {
        this.exitSince = -1;
        this.forgotWarned = true; // l'alerte « limiteur oublié » ne répète pas
        out.push("pitExitLimiterOn");
      }
    }

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
