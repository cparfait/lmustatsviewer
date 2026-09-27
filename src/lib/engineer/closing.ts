/**
 * Rapprochement / décrochage chiffré avec la voiture devant et derrière
 * (module pur).
 *
 * Un « moins d'une seconde » binaire ne dit pas si l'écart se referme. Ici on
 * échantillonne l'écart à chaque tour bouclé du joueur, par voiture (identité =
 * nom du pilote), et on n'affirme une tendance que si elle est **sûre** :
 *  - au moins `MIN_DIFFS` variations tour à tour, sur `WINDOW` tours au plus ;
 *  - moyenne ≥ `MIN_RATE_S` ET supérieure à 2 écarts-types de la moyenne
 *    (on n'annonce pas du bruit) ;
 *  - moyenne < `MAX_RATE_S` (au-delà, c'est une donnée sale : arrêt, sortie).
 * Un changement de voiture, un passage au stand (d'un côté ou de l'autre) ou un
 * tour non chronométré repart de zéro.
 */

export const WINDOW = 5;
export const MIN_DIFFS = 3;
export const MIN_RATE_S = 0.1;
export const MAX_RATE_S = 3;
/** Horizon max (tours) pour annoncer « sur lui dans ~N tours ». */
export const CATCH_HORIZON_LAPS = 20;

export type Side = "ahead" | "behind";

export interface ClosingEstimate {
  side: Side;
  driver: string;
  gap: number;
  /** s/tour : > 0 = l'écart se referme (je reviens / il revient). */
  rate: number;
  /** Tours avant la jonction si l'écart se referme et reste dans l'horizon. */
  lapsToCatch: number | null;
  /** Tendance affirmée (sinon : écart stable / pas assez de tours). */
  trend: "closing" | "opening" | "stable" | "unknown";
}

interface Track {
  driver: string;
  gaps: number[];
}

export function estimate(side: Side, driver: string, gaps: number[]): ClosingEstimate {
  const gap = gaps[gaps.length - 1] ?? 0;
  const base: ClosingEstimate = { side, driver, gap, rate: 0, lapsToCatch: null, trend: "unknown" };
  const diffs: number[] = [];
  for (let i = 1; i < gaps.length; i++) diffs.push(gaps[i - 1] - gaps[i]);
  if (diffs.length < MIN_DIFFS) return base;
  const n = diffs.length;
  const mean = diffs.reduce((a, b) => a + b, 0) / n;
  const variance = diffs.reduce((a, d) => a + (d - mean) ** 2, 0) / Math.max(1, n - 1);
  const stdErr = Math.sqrt(variance / n);
  const sure = Math.abs(mean) >= MIN_RATE_S && Math.abs(mean) > 2 * stdErr && Math.abs(mean) < MAX_RATE_S;
  if (!sure) return { ...base, rate: mean, trend: Math.abs(mean) < MAX_RATE_S ? "stable" : "unknown" };
  const lapsToCatch = mean > 0 && gap / mean <= CATCH_HORIZON_LAPS ? Math.max(1, Math.round(gap / mean)) : null;
  return { ...base, rate: mean, lapsToCatch, trend: mean > 0 ? "closing" : "opening" };
}

export class ClosingTracker {
  private tracks: Record<Side, Track | null> = { ahead: null, behind: null };

  reset(): void {
    this.tracks = { ahead: null, behind: null };
  }

  /** Invalide un côté (arrêt au stand, voiture perdue de vue). */
  invalidate(side: Side): void {
    this.tracks[side] = null;
  }

  /**
   * Tour bouclé du joueur : écart courant à la voiture de ce côté (même tour,
   * `gap > 0`), ou `driver` vide si personne. Renvoie l'estimation mise à jour.
   */
  push(side: Side, driver: string, gap: number): ClosingEstimate | null {
    if (!driver || !(gap > 0)) {
      this.tracks[side] = null;
      return null;
    }
    let t = this.tracks[side];
    if (!t || t.driver !== driver) {
      t = { driver, gaps: [] };
      this.tracks[side] = t;
    }
    t.gaps.push(gap);
    if (t.gaps.length > WINDOW + 1) t.gaps.shift();
    return estimate(side, driver, t.gaps);
  }

  /** Dernière estimation connue (sans nouvel échantillon). */
  current(side: Side): ClosingEstimate | null {
    const t = this.tracks[side];
    return t ? estimate(side, t.driver, t.gaps) : null;
  }
}
