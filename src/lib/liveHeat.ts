/**
 * Heatmap live du tracé (module pur).
 *
 * Trace du tour en cours du joueur par bucket de 20 m (comme le tracé) :
 * vitesse et temps écoulé depuis la ligne. Au passage de la ligne, le tour
 * terminé devient la référence s'il est le meilleur (tour valide). Deux vues :
 * - `speed` : vitesse du dernier tour complet (lent → rapide) ;
 * - `delta` : temps gagné / perdu sur chaque bucket face au meilleur tour.
 * Le duel par mini-secteurs (`miniDuel`) compare le joueur à une autre voiture.
 */

export const BUCKET_M = 20;

export interface LapTrace {
  speed: number[];
  time: number[];
  lapTime: number;
}

export class LiveHeat {
  private cur: { speed: number[]; time: number[] } = { speed: [], time: [] };
  last: LapTrace | null = null;
  best: LapTrace | null = null;
  private lap = -1;
  private key = "";

  /** Nouveau circuit / nouvelle séance : tout oublier. */
  reset(key: string): void {
    if (key === this.key) return;
    this.key = key;
    this.cur = { speed: [], time: [] };
    this.last = null;
    this.best = null;
    this.lap = -1;
  }

  /**
   * Une trame du joueur. `lapsDone` = tours bouclés ; `lastLapTime` = temps du
   * dernier tour (0 si invalide) ; `inPits` coupe la trace (tour de sortie).
   */
  push(lapDist: number, speedKmh: number, lapTime: number, lapsDone: number, lastLapTime: number, inPits: boolean): void {
    if (this.lap >= 0 && lapsDone > this.lap) {
      const done: LapTrace = { speed: this.cur.speed, time: this.cur.time, lapTime: lastLapTime };
      const complete = done.time.filter((x) => x > 0).length;
      if (complete > 10) {
        this.last = done;
        if (lastLapTime > 0 && (!this.best || lastLapTime < this.best.lapTime)) this.best = done;
      }
      this.cur = { speed: [], time: [] };
    }
    this.lap = lapsDone;
    if (inPits) {
      this.cur = { speed: [], time: [] };
      return;
    }
    if (!(lapDist >= 0) || !(lapTime > 0)) return;
    const k = Math.floor(lapDist / BUCKET_M);
    if (this.cur.time[k] === undefined) {
      this.cur.time[k] = lapTime;
      this.cur.speed[k] = speedKmh;
    }
  }

  /** Vitesse par bucket du dernier tour complet (km/h), ou null. */
  speedMap(): number[] | null {
    return this.last ? this.last.speed : null;
  }

  /**
   * Écart par bucket (s, > 0 = plus lent) du dernier tour face au meilleur,
   * sur le temps passé dans chaque bucket. Null sans les deux tours.
   */
  deltaMap(): number[] | null {
    const a = this.last;
    const b = this.best;
    if (!a || !b || a === b) return null;
    const out: number[] = [];
    for (let k = 0; k + 1 < Math.max(a.time.length, b.time.length); k++) {
      const da = a.time[k + 1] - a.time[k];
      const db = b.time[k + 1] - b.time[k];
      out[k] = isFinite(da) && isFinite(db) && da > 0 && db > 0 ? da - db : NaN;
    }
    return out;
  }
}

/**
 * Duel par mini-secteurs : écart (s) joueur − adversaire par zone (> 0 = le
 * joueur est plus lent), NaN si l'une des deux voitures n'a pas de temps.
 */
export function miniDuel(me: number[] | undefined, other: number[] | undefined): number[] {
  if (!me || !other) return [];
  return me.map((x, i) => (x > 0 && other[i] > 0 ? x - other[i] : NaN));
}

/** Couleur d'une vitesse (rouge lent → vert rapide) selon l'étendue observée. */
export function speedColor(v: number, min: number, max: number): string {
  const f = max > min ? Math.min(1, Math.max(0, (v - min) / (max - min))) : 0.5;
  return `hsl(${Math.round(f * 120)}, 85%, 50%)`;
}

/** Couleur d'un écart (vert = gagné, rouge = perdu), saturée à ±`full` s. */
export function deltaColor(dt: number, full: number): { color: string; opacity: number } {
  const f = Math.min(1, Math.abs(dt) / full);
  return { color: dt <= 0 ? "#22c55e" : "#ef4444", opacity: 0.25 + 0.75 * f };
}
