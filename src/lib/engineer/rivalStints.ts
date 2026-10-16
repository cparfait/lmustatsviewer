/**
 * Registre des arrêts de tout le plateau (module pur).
 *
 * Pour chaque voiture, on note le tour de chaque arrêt (compteur `num_pitstops`
 * du jeu, seule source fiable) et on en déduit la longueur de ses relais. De là :
 *  - relais type = médiane des relais complets de la voiture, sinon médiane de
 *    sa classe (les voitures d'une classe ont des autonomies proches) ;
 *  - prochain arrêt = tour du dernier arrêt + relais type ;
 *  - arrêts restants = relais nécessaires pour couvrir les tours restants au-delà
 *    du prochain arrêt.
 * Le premier relais ne compte que si la voiture a été vue dès le début de la
 * course (sinon sa longueur est inconnue).
 *
 * Événement « le leader rentre » : front montant de `in_pits` du leader de la
 * classe du joueur. L'état de stand 1 (`pit_state`, simple demande) ne suffit
 * pas : le jeu publie des demandes qui ne sont pas toujours suivies.
 */

import type { LiveData, LiveStanding } from "@/lib/api";

/** Relais plus courts ignorés (arrêt pour dégâts, pénalité, splash) : tours. */
export const MIN_STINT_LAPS = 3;
/** Au-delà de ce tour, la voiture n'a pas été vue dès le départ. */
const START_LAP_MAX = 1;

export interface CarStints {
  driver: string;
  cls: string;
  /** Tours bouclés au moment de chaque arrêt compté. */
  stopLaps: number[];
  /** Vu dès le début de course : le premier relais est mesurable. */
  fromStart: boolean;
}

export interface StintEstimate {
  driver: string;
  stops: number;
  /** Relais type (tours) ; null si aucune mesure (ni voiture ni classe). */
  stintLaps: number | null;
  /** Le relais type vient de la classe, pas de la voiture elle-même. */
  fromClass: boolean;
  /** Tours avant le prochain arrêt estimé (peut être ≤ 0 : arrêt dû). */
  lapsToNext: number | null;
  /** Arrêts encore nécessaires pour finir ; null si la fin de course est inconnue. */
  stopsLeft: number | null;
}

export interface LeaderPitEvent {
  driver: string;
  /** Numéro de l'arrêt en cours (1 = premier). */
  stop: number;
  /** Tours depuis l'arrêt précédent (ou depuis le départ) ; null si inconnu. */
  stintLaps: number | null;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Relais complets d'une voiture (tours), relais trop courts exclus. */
export function stintsOf(c: CarStints): number[] {
  const out: number[] = [];
  for (let i = 0; i < c.stopLaps.length; i++) {
    if (i === 0 && !c.fromStart) continue;
    const len = c.stopLaps[i] - (i === 0 ? 0 : c.stopLaps[i - 1]);
    if (len >= MIN_STINT_LAPS) out.push(len);
  }
  return out;
}

/**
 * Tours restants pour une voiture : course aux tours → tours restants ; course
 * au temps → temps restant / tour de référence de la voiture (+1 tour en cours).
 */
export function lapsLeftFor(d: LiveData, s: LiveStanding): number | null {
  const sc = d.session;
  if (!sc) return null;
  if (sc.max_laps > 0 && sc.max_laps < 1000) return Math.max(0, sc.max_laps - s.total_laps);
  const ref = s.best_lap_time > 0 ? s.best_lap_time : s.last_lap_time;
  if (!(sc.end_et > 0) || !(ref > 0)) return null;
  const left = sc.end_et - sc.session_time;
  return left > 0 ? Math.ceil(left / ref) + 1 : 0;
}

export class StintRegistry {
  private cars = new Map<string, CarStints>();
  private prev = new Map<string, { inPits: boolean; stops: number }>();

  reset(): void {
    this.cars.clear();
    this.prev.clear();
  }

  get(driver: string): CarStints | undefined {
    return this.cars.get(driver);
  }

  /** Met à jour le registre ; renvoie l'événement « le leader rentre » éventuel. */
  push(d: LiveData): LeaderPitEvent | null {
    const me = d.standings.find((s) => s.is_player);
    let ev: LeaderPitEvent | null = null;
    for (const s of d.standings) {
      let c = this.cars.get(s.driver);
      if (!c) {
        c = { driver: s.driver, cls: s.vehicle_class, stopLaps: [], fromStart: s.total_laps <= START_LAP_MAX && s.num_pitstops === 0 };
        this.cars.set(s.driver, c);
      }
      c.cls = s.vehicle_class;
      const prev = this.prev.get(s.driver);
      // Événement calculé AVANT d'enregistrer l'arrêt de cette trame : le jeu
      // peut incrémenter le compteur dès l'entrée dans la voie.
      const entering = !!prev && !prev.inPits && s.in_pits;
      if (
        entering &&
        me &&
        !s.is_player &&
        !me.in_pits &&
        s.vehicle_class === me.vehicle_class &&
        s.class_position === 1 &&
        s.pit_state !== 1
      ) {
        const last = c.stopLaps.length ? c.stopLaps[c.stopLaps.length - 1] : c.fromStart ? 0 : null;
        ev = { driver: s.driver, stop: prev.stops + 1, stintLaps: last != null ? s.total_laps - last : null };
      }
      // Arrêt compté : le compteur du jeu monte (un saut de plusieurs = arrêts manqués).
      if (prev && s.num_pitstops > prev.stops) {
        for (let k = prev.stops; k < s.num_pitstops; k++) c.stopLaps.push(s.total_laps);
      } else if (!prev && s.num_pitstops > 0) {
        c.fromStart = false; // vu en cours de course : historique inconnu
      }
      this.prev.set(s.driver, { inPits: s.in_pits, stops: s.num_pitstops });
    }
    return ev;
  }

  /** Relais type d'une classe (médiane de tous les relais complets mesurés). */
  classStint(cls: string): number | null {
    const all: number[] = [];
    for (const c of this.cars.values()) if (c.cls === cls) all.push(...stintsOf(c));
    return median(all);
  }

  /**
   * Lignes de contexte pour le Coach IA : arrêts observés des voitures de la
   * classe du joueur (6 au plus, dans l'ordre de classe). Vide hors course.
   */
  contextLines(d: LiveData, max = 6): string[] {
    const me = d.standings.find((s) => s.is_player);
    if (!me || !d.session || d.session.session < 10) return [];
    const out: string[] = [];
    const cars = d.standings
      .filter((s) => !s.is_player && s.vehicle_class === me.vehicle_class)
      .sort((a, b) => a.class_position - b.class_position)
      .slice(0, max);
    for (const s of cars) {
      const e = this.estimate(d, s);
      const bits = [`P${s.class_position} ${s.driver}: ${s.num_pitstops} stop(s)`];
      if (e.stintLaps != null) bits.push(`stint ~${Math.round(e.stintLaps)} laps${e.fromClass ? " (class typical)" : ""}`);
      if (e.lapsToNext != null) bits.push(e.lapsToNext <= 0 ? "stop due" : `next stop in ~${e.lapsToNext} laps`);
      if (e.stopsLeft != null) bits.push(`${e.stopsLeft} stop(s) left`);
      if (s.in_pits) bits.push("in pits now");
      out.push("- " + bits.join(", "));
    }
    return out;
  }

  estimate(d: LiveData, s: LiveStanding): StintEstimate {
    const c = this.cars.get(s.driver);
    const own = c ? median(stintsOf(c)) : null;
    const cls = own == null ? this.classStint(s.vehicle_class) : null;
    const stint = own ?? cls;
    const base: StintEstimate = { driver: s.driver, stops: s.num_pitstops, stintLaps: stint, fromClass: own == null && cls != null, lapsToNext: null, stopsLeft: null };
    if (stint == null || !c) return base;
    const lastStop = c.stopLaps.length ? c.stopLaps[c.stopLaps.length - 1] : c.fromStart ? 0 : null;
    if (lastStop == null) return base;
    const lapsToNext = Math.round(lastStop + stint - s.total_laps);
    const left = lapsLeftFor(d, s);
    const stopsLeft = left == null ? null : left <= lapsToNext ? 0 : Math.ceil((left - Math.max(0, lapsToNext)) / stint);
    return { ...base, lapsToNext, stopsLeft };
  }
}
