/**
 * Concentration du pilote : quand la radio ne doit pas **entamer** une phrase
 * (module pur, rejouable).
 *
 * L'ancienne garde (`inCriticalZone` : frein > 0,5 ou braquage > 0,4) réagissait
 * trop tard : une phrase pouvait partir 50 m avant un gros freinage et se
 * terminer dedans. On anticipe désormais :
 *  - **freinages appris** : les points où le pilote attaque la pédale reviennent
 *    au même endroit d'un tour à l'autre. Un point vu sur au moins 2 tours
 *    distincts devient un « freinage connu » ; à moins de 200 m de l'un d'eux,
 *    on se tait ;
 *  - **seuils bas** : frein > 0,15 ou volant > 0,30 (pas seulement les gros
 *    appuis) ;
 *  - **télémétrie figée** (> 1 s) : on ne bâillonne pas la radio sur une donnée
 *    périmée (pause, alt-tab).
 *
 * La garde est revérifiée par la file vocale **juste avant** chaque prise de
 * parole non critique (`setSpeechGate`), pas seulement au moment de la décision.
 */

/** Silence avant un freinage connu (m). */
export const QUIET_BEFORE_BRAKE_M = 200;
/** Pédale de frein au-delà de laquelle on se tait. */
export const QUIET_BRAKE = 0.15;
/** Braquage (|volant|) au-delà duquel on se tait. */
export const QUIET_STEER = 0.3;
/** Télémétrie plus vieille que ce délai : la garde est levée (ms). */
export const QUIET_STALE_MS = 1000;

/** Seuil de pédale qui marque l'attaque d'un freinage. */
const BRAKE_ON = 0.2;
/** Vitesse minimale pour qu'un appui compte comme freinage de virage (km/h). */
const BRAKE_MIN_KMH = 60;
/** Deux attaques à moins de cette distance = le même freinage (m). */
const MERGE_M = 40;
/** Tours distincts requis pour qu'un freinage soit « connu ». */
const MIN_LAPS = 2;
/** Plafond de points mémorisés (un circuit en compte ~15-25). */
const MAX_POINTS = 60;

interface BrakePoint {
  dist: number;
  laps: number;
  lastLap: number;
}

/** Freinages appris sur la session (distance-tour de l'attaque de pédale). */
export class BrakeMap {
  private points: BrakePoint[] = [];
  private prevBrake = 0;
  private track = "";

  reset(): void {
    this.points = [];
    this.prevBrake = 0;
  }

  /** Change de circuit → repart de zéro. */
  setTrack(track: string): void {
    if (track === this.track) return;
    this.track = track;
    this.reset();
  }

  /** Une trame : détecte le front montant de la pédale et l'enregistre. */
  push(dist: number, brake: number, lap: number, speedKmh: number, trackLen: number): void {
    const rising = brake >= BRAKE_ON && this.prevBrake < BRAKE_ON;
    this.prevBrake = brake;
    if (!rising || speedKmh < BRAKE_MIN_KMH || !(dist >= 0)) return;
    const p = this.points.find((x) => gap(x.dist, dist, trackLen) < MERGE_M);
    if (p) {
      if (p.lastLap !== lap) {
        // Moyenne glissante : le point se recale sur l'habitude du pilote.
        p.dist = blend(p.dist, dist, trackLen, 1 / (p.laps + 1));
        p.laps++;
        p.lastLap = lap;
      }
      return;
    }
    if (this.points.length >= MAX_POINTS) return;
    this.points.push({ dist, laps: 1, lastLap: lap });
  }

  /** Freinages confirmés (vus sur au moins 2 tours). */
  known(): number[] {
    return this.points.filter((p) => p.laps >= MIN_LAPS).map((p) => p.dist);
  }

  /** Distance (m) jusqu'au prochain freinage connu, ou `Infinity`. */
  distToNext(dist: number, trackLen: number): number {
    let best = Infinity;
    for (const b of this.known()) {
      let d = b - dist;
      if (trackLen > 0) d = ((d % trackLen) + trackLen) % trackLen;
      if (d >= 0 && d < best) best = d;
    }
    return best;
  }
}

/** Écart absolu entre deux distances-tour, circuit bouclé. */
function gap(a: number, b: number, trackLen: number): number {
  const d = Math.abs(a - b);
  return trackLen > 0 ? Math.min(d, trackLen - d) : d;
}

/** Interpole `a` vers `b` (poids `w`), en tenant compte du bouclage. */
function blend(a: number, b: number, trackLen: number, w: number): number {
  let d = b - a;
  if (trackLen > 0) {
    if (d > trackLen / 2) d -= trackLen;
    else if (d < -trackLen / 2) d += trackLen;
  }
  const v = a + d * w;
  return trackLen > 0 ? ((v % trackLen) + trackLen) % trackLen : v;
}

/** Dernier état de pilotage vu (alimenté à chaque trame). */
export interface DriverSnapshot {
  brake: number;
  steer: number;
  /** Distance jusqu'au prochain freinage connu (m). */
  distToBrake: number;
  /** Horodatage de la trame (ms). */
  at: number;
}

/** Le pilote est-il trop occupé pour qu'on entame une phrase non critique ? */
export function driverBusy(s: DriverSnapshot | null, nowMs: number): boolean {
  if (!s || nowMs - s.at > QUIET_STALE_MS) return false;
  return s.brake > QUIET_BRAKE || Math.abs(s.steer) > QUIET_STEER || s.distToBrake < QUIET_BEFORE_BRAKE_M;
}
