/**
 * Politique du « point de tour » (module pur).
 *
 * Au passage de la ligne, on ne dit plus systématiquement le dernier tour : en
 * course, un pilote n'a pas besoin qu'on lui lise chaque chrono. Règles :
 *  - un tour qui n'est pas « lancé » (> meilleur × `FLYING_FACTOR` : out-lap,
 *    in-lap, trafic, tête-à-queue) ne s'annonce pas ;
 *  - essais / qualif : chaque tour lancé est annoncé (c'est le retour attendu) ;
 *  - course : un nouveau meilleur tour n'est redit que s'il bat de
 *    `PB_REDITE_S` le dernier meilleur **annoncé** (un dixième grappillé ne vaut
 *    pas une phrase) ; le chrono ordinaire, un tour sur `RACE_LAP_EVERY`.
 *
 * Et pour les secteurs : le pire secteur du tour (≥ 0,3 s, anti-bruit) comme
 * avant, plus un **secteur chroniquement faible** — perte moyenne ≥ `WEAK_MEAN_S`
 * sur les `WEAK_WINDOW` derniers tours propres — qui vaut un vrai « travaille là ».
 */

export const PB_REDITE_S = 0.5;
export const FLYING_FACTOR = 1.05;
export const RACE_LAP_EVERY = 3;
/** Écart au leader annoncé au plus un tour sur N (course seulement). */
export const LEADER_GAP_EVERY = 5;

export interface LapCalloutIn {
  isRace: boolean;
  lapTime: number;
  /** Meilleur tour AVANT ce tour (0 si aucun). */
  prevBest: number;
  isPb: boolean;
  /** Dernier meilleur tour effectivement annoncé (0 si aucun). */
  lastAnnouncedPb: number;
  /** Tours bouclés depuis la dernière annonce de chrono. */
  lapsSinceLapCallout: number;
}

export function decideLapCallout(i: LapCalloutIn): "pb" | "last" | null {
  if (i.lapTime <= 0 || !isFinite(i.lapTime)) return null;
  if (i.isPb) {
    if (!i.isRace) return "pb";
    if (i.lastAnnouncedPb <= 0 || i.lastAnnouncedPb - i.lapTime >= PB_REDITE_S) return "pb";
  }
  const flying = i.isPb || (i.prevBest > 0 && i.lapTime <= i.prevBest * FLYING_FACTOR);
  if (!flying) return null;
  if (!i.isRace) return "last";
  return i.lapsSinceLapCallout >= RACE_LAP_EVERY ? "last" : null;
}

export const SECTOR_LOSS_MIN_S = 0.3;
/** Au-delà : trafic / erreur, pas un conseil de secteur (tour écarté). */
export const SECTOR_LOSS_MAX_S = 5;
export const WEAK_WINDOW = 4;
export const WEAK_MEAN_S = 0.12;

export interface SectorVerdict {
  /** Pire secteur du tour (1-3) et sa perte (s). */
  worst: { s: number; d: number } | null;
  /** Secteur chroniquement faible (1-3) et sa perte moyenne (s). */
  weak: { s: number; d: number } | null;
}

export class SectorTracker {
  private hist: [number, number, number][] = [];

  reset(): void {
    this.hist = [];
  }

  /**
   * Tour bouclé : secteurs du tour vs meilleurs secteurs d'AVANT ce tour.
   * Un secteur manquant ou une perte aberrante écarte le tour (non « propre »).
   */
  push(last: readonly number[], best: readonly number[]): SectorVerdict {
    // Pire secteur : parmi les secteurs mesurables et non aberrants (comme le
    // débrief historique — un tête-à-queue en S2 n'empêche pas de parler du S1).
    const loss: [number, number, number] = [0, 0, 0];
    let clean = true;
    let worst: SectorVerdict["worst"] = null;
    for (let i = 0; i < 3; i++) {
      const l = last[i] ?? 0;
      const b = best[i] ?? 0;
      if (l <= 0 || b <= 0) {
        clean = false;
        continue;
      }
      loss[i] = l - b;
      if (loss[i] >= SECTOR_LOSS_MAX_S) {
        clean = false;
        continue;
      }
      if (loss[i] >= SECTOR_LOSS_MIN_S && (!worst || loss[i] > worst.d)) worst = { s: i + 1, d: loss[i] };
    }
    // Secteur chroniquement faible : seuls les tours entièrement propres comptent.
    if (!clean) return { worst, weak: null };
    this.hist.push(loss);
    if (this.hist.length > WEAK_WINDOW) this.hist.shift();
    let weak: SectorVerdict["weak"] = null;
    if (this.hist.length >= WEAK_WINDOW) {
      for (let i = 0; i < 3; i++) {
        const mean = this.hist.reduce((a, h) => a + h[i], 0) / this.hist.length;
        if (mean >= WEAK_MEAN_S && (!weak || mean > weak.d)) weak = { s: i + 1, d: mean };
      }
    }
    return { worst, weak };
  }
}
