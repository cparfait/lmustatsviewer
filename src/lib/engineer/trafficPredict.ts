/**
 * Préavis de trafic **prédit** (module pur, rejouable) : dans combien de temps, et
 * où, une voiture de classe plus rapide va rattraper le joueur.
 *
 * L'ancien préavis (`traffic.ts`, `fasterBehind`) dit un **écart de piste** à mon
 * rythme (« Hypercar à 11 secondes derrière ») : ce n'est pas un temps avant le
 * contact. Une voiture qui reprend 0,1 s par seconde met deux minutes à combler
 * 11 s ; le préavis tombait donc bien trop tôt, et le drapeau bleu arrivait
 * longtemps après.
 *
 * Ici on **simule** les deux voitures vers l'avant :
 *  - chaque classe a un **profil de vitesse** appris en roulant, par tranche de
 *    `BIN_M` mètres du tour, sur toutes les voitures en piste de cette classe
 *    (moyenne glissante) ; les virages ralentissent la rapide autant que la lente,
 *    ce que « écart ÷ rapprochement » ne voit pas ;
 *  - chaque voiture garde un **facteur de rythme** (sa vitesse réelle rapportée au
 *    profil de sa classe, sur les dernières secondes) : un pilote lent de la classe
 *    rapide arrive plus tard ;
 *  - le premier instant où la rapide rejoint la lente donne le **temps avant le
 *    contact** et l'**endroit du tour**.
 *
 * Tant qu'un profil n'est pas prêt (assez de tranches vues), `ready` est faux et
 * l'appelant garde l'ancien préavis.
 */

import type { OnTrackCar } from "./traffic";

/** Largeur d'une tranche du profil (m). */
export const BIN_M = 50;
/** Part des tranches du tour qu'une classe doit avoir vues pour être prête. */
export const READY_COVERAGE = 0.8;
/** Horizon de la simulation (s). */
export const HORIZON_S = 180;
/** Pas de la simulation (s). */
export const STEP_S = 0.25;
/** Lissage du profil (poids de la nouvelle mesure). */
const PROFILE_ALPHA = 0.15;
/** Lissage du facteur de rythme d'une voiture (poids de la nouvelle mesure). */
const PACE_ALPHA = 0.08;
/** Bornes du facteur de rythme. */
const PACE_MIN = 0.85;
const PACE_MAX = 1.15;
/** Mesure de vitesse admise : intervalle entre deux trames (s) et vitesse (m/s). */
const DT_MIN = 0.05;
const DT_MAX = 2;
const V_MIN = 8;
const V_MAX = 120;

export interface CarSample {
  /** Identifiant stable de la voiture (id du jeu, sinon nom). */
  key: string;
  cls: string;
  /** Distance dans le tour (m). */
  dist: number;
  inPits: boolean;
}

interface CarMemo {
  dist: number;
  t: number;
  pace: number;
}

export interface ContactForecast {
  /** Temps avant que la rapide rattrape le joueur (s). */
  inS: number;
  /** Distance dans le tour du joueur où le contact a lieu (m). */
  atDist: number;
}

export class TrafficPredictor {
  private lapLen = 0;
  private bins = 0;
  private profiles = new Map<string, Float64Array>();
  private seen = new Map<string, Uint8Array>();
  private seenCount = new Map<string, number>();
  private cars = new Map<string, CarMemo>();

  reset(lapLen = 0) {
    this.lapLen = lapLen > 0 ? lapLen : 0;
    this.bins = this.lapLen > 0 ? Math.max(1, Math.ceil(this.lapLen / BIN_M)) : 0;
    this.profiles.clear();
    this.seen.clear();
    this.seenCount.clear();
    this.cars.clear();
  }

  private bin(dist: number): number {
    const L = this.lapLen;
    const d = ((dist % L) + L) % L;
    return Math.min(this.bins - 1, Math.floor(d / BIN_M));
  }

  private profile(cls: string): Float64Array {
    let p = this.profiles.get(cls);
    if (!p) {
      p = new Float64Array(this.bins);
      this.profiles.set(cls, p);
      this.seen.set(cls, new Uint8Array(this.bins));
      this.seenCount.set(cls, 0);
    }
    return p;
  }

  /** Vitesse du profil à une distance (m/s) ; une tranche jamais vue prend la plus proche vue. */
  speedAt(cls: string, dist: number): number {
    const p = this.profiles.get(cls);
    const s = this.seen.get(cls);
    if (!p || !s || this.bins === 0) return 0;
    const b = this.bin(dist);
    if (s[b]) return p[b];
    for (let k = 1; k < this.bins; k++) {
      const a = (b + k) % this.bins;
      const z = (b - k + this.bins) % this.bins;
      if (s[a] && s[z]) return (p[a] + p[z]) / 2;
      if (s[a]) return p[a];
      if (s[z]) return p[z];
    }
    return 0;
  }

  /** Part des tranches vues pour une classe (0-1). */
  coverage(cls: string): number {
    return this.bins ? (this.seenCount.get(cls) ?? 0) / this.bins : 0;
  }

  ready(cls: string): boolean {
    return this.coverage(cls) >= READY_COVERAGE;
  }

  /** Facteur de rythme d'une voiture (1 = la moyenne de sa classe). */
  pace(key: string): number {
    return this.cars.get(key)?.pace ?? 1;
  }

  /** Une trame : apprend la vitesse de chaque voiture en piste. `t` = horloge de session (s). */
  push(t: number, lapLen: number, cars: CarSample[]) {
    if (!(lapLen > 0)) return;
    if (Math.abs(lapLen - this.lapLen) > 1) this.reset(lapLen);
    const L = this.lapLen;
    for (const c of cars) {
      if (!(c.dist >= 0)) continue;
      const prev = this.cars.get(c.key);
      if (c.inPits) {
        this.cars.delete(c.key);
        continue;
      }
      if (!prev) {
        this.cars.set(c.key, { dist: c.dist, t, pace: 1 });
        continue;
      }
      const dt = t - prev.t;
      if (dt < DT_MIN) continue;
      let dd = c.dist - prev.dist;
      if (dd < -L / 2) dd += L;
      const v = dd / dt;
      if (dt > DT_MAX || !(v >= V_MIN && v <= V_MAX)) {
        this.cars.set(c.key, { dist: c.dist, t, pace: prev.pace });
        continue;
      }
      const prof = this.profile(c.cls);
      const seen = this.seen.get(c.cls)!;
      const b = this.bin(prev.dist + dd / 2);
      const ref = seen[b] ? prof[b] : 0;
      if (!seen[b]) {
        prof[b] = v;
        seen[b] = 1;
        this.seenCount.set(c.cls, (this.seenCount.get(c.cls) ?? 0) + 1);
      } else {
        prof[b] += PROFILE_ALPHA * (v - prof[b]);
      }
      let pace = prev.pace;
      if (ref > 0) {
        const r = Math.min(PACE_MAX, Math.max(PACE_MIN, v / ref));
        pace += PACE_ALPHA * (r - pace);
      }
      this.cars.set(c.key, { dist: c.dist, t, pace });
    }
  }

  /**
   * Simule la rapide (`chaser`, derrière de `gapM` mètres de piste) et le joueur
   * (`me`) jusqu'au contact. Null si une classe n'est pas prête, si la rapide ne
   * rattrape pas dans l'horizon, ou si rien n'est calculable.
   */
  contact(
    me: { key: string; cls: string; dist: number },
    chaser: { key: string; cls: string },
    gapM: number,
    horizonS = HORIZON_S,
  ): ContactForecast | null {
    if (!this.bins || !(gapM > 0) || !this.ready(me.cls) || !this.ready(chaser.cls)) return null;
    const pm = this.pace(me.key);
    const pc = this.pace(chaser.key);
    let mine = me.dist;
    let theirs = me.dist - gapM;
    for (let t = STEP_S; t <= horizonS + 1e-9; t += STEP_S) {
      const vm = this.speedAt(me.cls, mine) * pm;
      const vc = this.speedAt(chaser.cls, theirs) * pc;
      if (!(vm > 0) || !(vc > 0)) return null;
      mine += vm * STEP_S;
      theirs += vc * STEP_S;
      if (theirs >= mine) {
        const L = this.lapLen;
        return { inS: t, atDist: ((mine % L) + L) % L };
      }
    }
    return null;
  }
}

/** Clé stable d'une voiture (id du jeu, sinon nom du pilote). */
export function carKey(s: { id?: number; driver: string }): string {
  return s.id != null && s.id >= 0 ? `#${s.id}` : s.driver;
}

export type FasterForecast =
  | { state: "learning" }
  | { state: "none" }
  | { state: "contact"; car: OnTrackCar; inS: number; atDist: number };

/**
 * La voiture de classe plus rapide qui rattrapera le joueur la première, parmi celles
 * derrière à moins de `scanS` d'écart de piste. `learning` = un profil manque encore
 * (l'appelant garde l'ancien préavis) ; `none` = aucune ne rattrape dans l'horizon.
 */
export function fasterContact(
  pred: TrafficPredictor,
  cars: OnTrackCar[],
  me: { id?: number; driver: string; vehicle_class: string; lap_dist: number },
  myRefLapS: number,
  lapLen: number,
  scanS = 90,
): FasterForecast {
  if (!(lapLen > 0) || !(myRefLapS > 0)) return { state: "learning" };
  if (!pred.ready(me.vehicle_class)) return { state: "learning" };
  let best: FasterForecast = { state: "none" };
  let learning = false;
  for (const c of cars) {
    if (c.rel !== "faster" || !(c.behindS > 0) || c.behindS > scanS) continue;
    if (!pred.ready(c.standing.vehicle_class)) {
      learning = true;
      continue;
    }
    const gapM = (c.behindS / myRefLapS) * lapLen;
    const f = pred.contact(
      { key: carKey(me), cls: me.vehicle_class, dist: me.lap_dist },
      { key: carKey(c.standing), cls: c.standing.vehicle_class },
      gapM,
    );
    if (f && (best.state !== "contact" || f.inS < best.inS)) best = { state: "contact", car: c, ...f };
  }
  return best.state === "none" && learning ? { state: "learning" } : best;
}
