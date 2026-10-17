/**
 * Pressions des pneus (module pur, horloge en paramètre).
 *
 * Deux usages :
 *  1. **Perte de pression** (crevaison lente) : une roue nettement plus basse que
 *     sa voisine d'essieu, de façon tenue, en roulant. Ne dépend d'aucune cible :
 *     c'est un écart entre deux roues soumises aux mêmes conditions.
 *  2. **Fenêtre de pression** : seulement si le pilote a renseigné une fenêtre
 *     (pression à chaud, par classe) — l'app ne connaît pas les pressions idéales
 *     de chaque voiture et n'en invente pas. Bilan donné une fois par relais, sur
 *     la moyenne du tour, après la chauffe.
 */

import type { LiveWheel } from "@/lib/api";

/** Écart avec la roue voisine qui signale une perte (kPa). */
export const LOSS_KPA = 20;
/** Écart sous lequel l'alerte se réarme (kPa). */
const LOSS_REARM_KPA = 8;
/** Durée pendant laquelle l'écart doit tenir (s). */
const LOSS_HOLD_S = 5;
/** Vitesse minimale pour juger (km/h) : à l'arrêt les pressions retombent. */
const MIN_SPEED_KMH = 60;
/** Tours de relais avant le bilan de fenêtre (chauffe). */
export const WINDOW_AFTER_LAPS = 2;

export type PressureUnit = "kPa" | "bar" | "psi";

/** Fenêtre de pression à chaud (kPa). */
export interface PressureWindow {
  min: number;
  max: number;
}

export function convertPressure(kpa: number, unit: PressureUnit): number {
  if (unit === "bar") return kpa / 100;
  if (unit === "psi") return kpa * 0.145038;
  return kpa;
}

/** Valeur arrondie pour la voix, dans l'unité choisie. */
export function formatPressure(kpa: number, unit: PressureUnit): string {
  const v = convertPressure(kpa, unit);
  return unit === "kPa" ? String(Math.round(v)) : v.toFixed(unit === "bar" ? 2 : 1);
}

/** Voisine d'essieu de chaque roue (FL, FR, RL, RR). */
const PARTNER = [1, 0, 3, 2];

export interface PressureVerdict {
  wheel: number;
  /** Écart à la fenêtre (kPa) : + trop haute, − trop basse. */
  off: number;
}

/** Roues hors fenêtre (écart signé à la borne dépassée). */
export function outOfWindow(avg: number[], w: PressureWindow): PressureVerdict[] {
  const out: PressureVerdict[] = [];
  avg.forEach((p, i) => {
    if (!(p > 0)) return;
    if (p > w.max) out.push({ wheel: i, off: p - w.max });
    else if (p < w.min) out.push({ wheel: i, off: p - w.min });
  });
  return out;
}

export class PressureWatcher {
  private lossSince: (number | null)[] = [null, null, null, null];
  private lossSaid = [false, false, false, false];
  private sum = [0, 0, 0, 0];
  private n = 0;
  private stintLaps = 0;
  private windowSaid = false;

  reset() {
    this.lossSince = [null, null, null, null];
    this.lossSaid = [false, false, false, false];
    this.resetStint();
  }

  /** Nouveau relais (sortie des stands) : bilan de fenêtre réarmé. */
  resetStint() {
    this.sum = [0, 0, 0, 0];
    this.n = 0;
    this.stintLaps = 0;
    this.windowSaid = false;
    this.lossSaid = [false, false, false, false];
    this.lossSince = [null, null, null, null];
  }

  /**
   * Trame : renvoie les roues dont la perte de pression vient d'être confirmée.
   * Une crevaison franche (`flat`) est déjà annoncée ailleurs : ignorée ici.
   */
  frame(nowS: number, wheels: LiveWheel[] | undefined, speedKmh: number): number[] {
    if (!wheels || wheels.length !== 4) return [];
    const rolling = speedKmh >= MIN_SPEED_KMH;
    if (rolling) {
      wheels.forEach((w, i) => (this.sum[i] += w.pressure));
      this.n++;
    }
    const out: number[] = [];
    for (let i = 0; i < 4; i++) {
      const p = wheels[i].pressure;
      const q = wheels[PARTNER[i]].pressure;
      if (!(p > 0 && q > 0) || wheels[i].flat || wheels[i].detached) {
        this.lossSince[i] = null;
        continue;
      }
      const gap = q - p;
      if (gap < LOSS_REARM_KPA) {
        this.lossSince[i] = null;
        this.lossSaid[i] = false;
        continue;
      }
      if (!rolling || gap < LOSS_KPA) continue;
      if (this.lossSince[i] == null) this.lossSince[i] = nowS;
      if (!this.lossSaid[i] && nowS - this.lossSince[i]! >= LOSS_HOLD_S) {
        this.lossSaid[i] = true;
        out.push(i);
      }
    }
    return out;
  }

  /**
   * Passage de ligne : après la chauffe, bilan de fenêtre (une fois par relais).
   * Renvoie les roues hors fenêtre (liste vide = toutes dedans), ou `null` si
   * rien n'est à dire maintenant.
   */
  lap(win: PressureWindow | null): PressureVerdict[] | null {
    this.stintLaps++;
    const avg = this.average();
    this.sum = [0, 0, 0, 0];
    this.n = 0;
    if (!win || this.windowSaid || this.stintLaps < WINDOW_AFTER_LAPS || !avg) return null;
    this.windowSaid = true;
    return outOfWindow(avg, win);
  }

  /** Moyenne du tour en cours (kPa), ou `null` sans échantillon. */
  average(): number[] | null {
    if (this.n < 10) return null;
    return this.sum.map((s) => s / this.n);
  }
}
