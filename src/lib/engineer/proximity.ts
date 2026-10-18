/**
 * Spotter de proximité (module pur, rejouable) : « voiture à gauche », « à
 * droite », « trois de front », « libre ».
 *
 * Entrée : les voitures proches dans le repère du joueur (`LiveData.nearby`,
 * calculé côté Rust à chaque trame : `lat` + = droite, `lon` + = devant, en
 * mètres entre centres). Une voiture est **à côté** quand elle chevauche le
 * joueur dans le sens de la longueur (moins d'une longueur de voiture devant ou
 * derrière) et qu'elle est décalée latéralement d'au moins une demi-largeur.
 *
 * Règles (géométrie classique des spotters de simulation) :
 *  - entrée : 4,5 m devant / 4,9 m derrière ; sortie (hystérésis) à 5,4 m ;
 *  - décalage latéral entre 1,2 m et 7 m (au-delà : autre ligne, voie des stands) ;
 *  - muet sous 10 m/s (stands, tête-à-queue) et pour une voiture dont l'écart
 *    de vitesse dépasse 12 m/s (elle passe en un éclair, l'annonce arriverait
 *    après elle) ;
 *  - un changement d'état doit tenir 2 trames (~100 ms) avant d'être dit ;
 *  - « toujours là » toutes les 5 s tant que le chevauchement dure.
 */

import type { NearbyCar } from "@/lib/api";

export const OVERLAP_FRONT_M = 4.5;
export const OVERLAP_REAR_M = 4.9;
export const OVERLAP_EXIT_M = 5.4;
export const LAT_MIN_M = 1.2;
export const LAT_MAX_M = 7;
export const MIN_SPEED_MS = 10;
export const MAX_DV_MS = 12;
export const STILL_EVERY_S = 5;
/** Trames consécutives pour valider un changement d'état. */
const STABLE_FRAMES = 2;

/**
 * Réglages exposés en Configuration (valeurs par défaut = constantes ci-dessus).
 * `carLength` décale les deux seuils de chevauchement (voiture plus longue ou
 * plus courte que la référence de 4,5 m) ; `clearFrames` retarde le « libre ».
 */
export interface SpotterTuning {
  carLength: number;
  clearFrames: number;
  stillEveryS: number;
  minSpeedKmh: number;
}

export const DEFAULT_SPOTTER: SpotterTuning = {
  carLength: OVERLAP_FRONT_M,
  clearFrames: STABLE_FRAMES,
  stillEveryS: STILL_EVERY_S,
  minSpeedKmh: MIN_SPEED_MS * 3.6,
};

/** Réglages bornés à des valeurs sûres (saisie utilisateur). */
export function sanitizeTuning(t: Partial<SpotterTuning> | null | undefined): SpotterTuning {
  const n = (v: unknown, d: number, lo: number, hi: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  return {
    carLength: n(t?.carLength, DEFAULT_SPOTTER.carLength, 3.5, 6),
    clearFrames: Math.round(n(t?.clearFrames, DEFAULT_SPOTTER.clearFrames, 1, 10)),
    stillEveryS: n(t?.stillEveryS, DEFAULT_SPOTTER.stillEveryS, 2, 30),
    minSpeedKmh: n(t?.minSpeedKmh, DEFAULT_SPOTTER.minSpeedKmh, 10, 120),
  };
}

export type SpotCall = "left" | "right" | "three" | "clear" | "clearLeft" | "clearRight" | "still";

interface Side {
  left: boolean;
  right: boolean;
}

/** Côtés occupés pour cette trame, avec hystérésis sur l'état précédent. */
export function occupiedSides(cars: NearbyCar[], prev: Side, carLength = OVERLAP_FRONT_M): Side {
  const out: Side = { left: false, right: false };
  const d = carLength - OVERLAP_FRONT_M;
  const front = OVERLAP_FRONT_M + d;
  const rear = OVERLAP_REAR_M + d;
  const exit = OVERLAP_EXIT_M + d;
  for (const c of cars) {
    if (Math.abs(c.dv) > MAX_DV_MS) continue;
    const a = Math.abs(c.lat);
    if (a < LAT_MIN_M || a > LAT_MAX_M) continue;
    const side = c.lat < 0 ? "left" : "right";
    const held = prev[side];
    const inside = held ? c.lon > -exit && c.lon < exit : c.lon > -rear && c.lon < front;
    if (inside) out[side] = true;
  }
  return out;
}

export class ProximitySpotter {
  private state: Side = { left: false, right: false };
  private candidate: Side = { left: false, right: false };
  private stable = 0;
  private lastCallS = -Infinity;

  constructor(private tuning: SpotterTuning = DEFAULT_SPOTTER) {}

  setTuning(t: SpotterTuning): void {
    this.tuning = t;
  }

  reset(): void {
    this.state = { left: false, right: false };
    this.candidate = { left: false, right: false };
    this.stable = 0;
    this.lastCallS = -Infinity;
  }

  /**
   * Une trame. Renvoie l'annonce à faire (ou `null`). `calibrated` faux : le
   * côté n'est pas fiable → on se tait.
   */
  update(cars: NearbyCar[], speedMs: number, calibrated: boolean, nowS: number): SpotCall | null {
    if (!calibrated || speedMs < this.tuning.minSpeedKmh / 3.6) {
      this.reset();
      return null;
    }
    const seen = occupiedSides(cars, this.state, this.tuning.carLength);
    if (seen.left === this.candidate.left && seen.right === this.candidate.right) this.stable++;
    else {
      this.candidate = seen;
      this.stable = 1;
    }
    const prev = this.state;
    // « Libre » (côté qui se vide) validé sur `clearFrames`, l'arrivée d'une
    // voiture toujours sur 2 trames : on n'annonce jamais une voiture en retard.
    const clearing = (prev.left && !seen.left) || (prev.right && !seen.right);
    const need = clearing ? this.tuning.clearFrames : STABLE_FRAMES;
    if (this.stable >= need && (seen.left !== prev.left || seen.right !== prev.right)) {
      this.state = seen;
      this.lastCallS = nowS;
      return transition(prev, seen);
    }
    if ((prev.left || prev.right) && nowS - this.lastCallS >= this.tuning.stillEveryS) {
      this.lastCallS = nowS;
      return "still";
    }
    return null;
  }
}

function transition(prev: Side, next: Side): SpotCall | null {
  if (next.left && next.right) return "three";
  if (!next.left && !next.right) return "clear";
  if (prev.left && prev.right) return next.left ? "clearRight" : "clearLeft";
  return next.left ? "left" : "right";
}
