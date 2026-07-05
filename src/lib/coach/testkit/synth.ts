/**
 * Fixtures synthétiques pour les tests du coach (COACH-LIVE-SPEC.md §14.3).
 *
 * Deux générateurs déterministes (aucun aléa non contrôlé) :
 *  - `synthMeasurement` : une `CornerMeasurement` propre, non muette, **alignée sur
 *    sa réf** (aucun diagnostic) — les tests la mutent champ par champ pour asserter
 *    un diagnostic précis (freinage tardif, sur-ralentissement…).
 *  - `synthSession` : une suite de `CoachFrame` (20 Hz) simulant N tours sur un
 *    circuit à virages (profil de vitesse trapézoïdal, rampes de frein), pour le
 *    harnais de rejeu moteur.
 */

import type { CornerMeasurement, CornerContext } from "../engine";
import type { CoachFrame } from "../frame";

/** Contexte d'inhibiteurs neutre (aucun ne mute). */
export function neutralCtx(over: Partial<CornerContext> = {}): CornerContext {
  return {
    gapAheadEntry: 999,
    gapBehindMin: 999,
    yellow: false,
    trackLimits: false,
    wheelFlat: false,
    minWear: 100,
    spin: false,
    impact: 0,
    tcMap: 1,
    absMap: 1,
    ...over,
  };
}

/**
 * Une mesure de virage **propre et alignée sur sa réf** (vmin/brakeDist/… = cibles) :
 * `diagnoseCorner` renvoie `none` tant qu'aucun champ n'est décalé. Les tests
 * surchargent la mesure (ex. `brakeDist` + 20 m) pour provoquer un diagnostic.
 */
export function synthMeasurement(over: Partial<CornerMeasurement> = {}): CornerMeasurement {
  const refBrakeDist = 300;
  const refVmin = 100;
  const refVexit = 160;
  const refFullThrottleDist = 360;
  const refGLatMax = 1.4;
  const refBrakeReleaseDist = 320;
  const base: CornerMeasurement = {
    corner_uid: "c500",
    n: 3,
    lapNum: 1,
    entryDist: 150,
    brakeDist: refBrakeDist,
    apexDist: 340,
    exitDist: 380,
    vmin: refVmin,
    ventry: 220,
    vexit: refVexit,
    gLatMax: refGLatMax,
    fullThrottleDist: refFullThrottleDist,
    brakeReleaseDist: refBrakeReleaseDist,
    lockupProxy: false,
    wheelspinProxy: false,
    dtVsRef: 0,
    tainted: false,
    hasRef: true,
    refBrakeDist,
    refVmin,
    refVentry: 220,
    refVexit,
    refFullThrottleDist,
    refGLatMax,
    refBrakeReleaseDist,
    refCornerTime: 4,
    ctx: neutralCtx(),
  };
  return { ...base, ...over };
}

// ── Générateur de tours (frames) ─────────────────────────────────────────────

export interface SynthCorner {
  /** Distance de l'apex (m). */
  dist: number;
  /** Vitesse mini au virage (km/h). */
  vmin: number;
}

export interface SynthOpts {
  trackLen: number;
  straightSpeed: number;
  corners: SynthCorner[];
  /** Longueur de la zone de freinage avant l'apex (m). */
  brakeLen: number;
  /** Longueur de la ré-accélération après l'apex (m). */
  accLen: number;
  hz: number;
  track: string;
  carModel: string;
  carClass: string;
}

export const DEFAULT_SYNTH: SynthOpts = {
  trackLen: 2000,
  straightSpeed: 250,
  corners: [
    { dist: 400, vmin: 80 },
    { dist: 950, vmin: 110 },
    { dist: 1500, vmin: 95 },
  ],
  brakeLen: 160,
  accLen: 220,
  hz: 20,
  track: "TestTrack",
  carModel: "TestCar",
  carClass: "Hyper",
};

/** Profil de vitesse (km/h) en fonction de la distance : creux triangulaire par virage. */
function speedAt(x: number, o: SynthOpts): number {
  let v = o.straightSpeed;
  for (const c of o.corners) {
    if (x >= c.dist - o.brakeLen && x <= c.dist) {
      const f = (c.dist - x) / o.brakeLen; // 1 au début du freinage → 0 à l'apex
      v = Math.min(v, c.vmin + (o.straightSpeed - c.vmin) * f);
    } else if (x > c.dist && x <= c.dist + o.accLen) {
      const f = (x - c.dist) / o.accLen; // 0 à l'apex → 1 en fin de ré-accél
      v = Math.min(v, c.vmin + (o.straightSpeed - c.vmin) * f);
    }
  }
  return v;
}

/** Gear grossier dérivé de la vitesse. */
function gearAt(v: number): number {
  return Math.max(1, Math.min(8, Math.round(v / 35)));
}

/**
 * Simule `nLaps` tours consécutifs (lapNum incrémenté par tour). Le dernier tour
 * n'est **pas** clôturé par le moteur (pas de tour suivant) → pour K tours
 * clôturés, générer K+1 tours.
 */
export function synthSession(nLaps: number, opts: Partial<SynthOpts> = {}): CoachFrame[] {
  const o = { ...DEFAULT_SYNTH, ...opts };
  const dt = 1 / o.hz;
  const frames: CoachFrame[] = [];
  let elapsed = 0;
  let lastLapTime = 0;

  for (let lap = 0; lap < nLaps; lap++) {
    let dist = 0;
    let t = 0;
    let prevV = speedAt(0, o);
    let guard = 0;
    while (dist < o.trackLen && guard < 100000) {
      guard++;
      const v = speedAt(dist, o);
      const dv = v - prevV;
      const braking = dv < -0.05;
      const accel = dv > 0.05;
      // Proximité d'un virage (pour gLat + volant).
      let nearCorner = false;
      for (const c of o.corners) {
        if (Math.abs(dist - c.dist) < o.brakeLen) nearCorner = true;
      }
      frames.push({
        track: o.track,
        carModel: o.carModel,
        carClass: o.carClass,
        gameBuild: "1.0",
        sessionNum: 3, // Practice
        lapNum: lap + 1,
        lapTime: t,
        lastLapTime,
        dist,
        elapsed,
        speed: v,
        brake: braking ? 60 : 0,
        throttle: accel || (!braking && !nearCorner) ? 100 : 0,
        steer: nearCorner ? 0.5 : 0,
        gLat: nearCorner ? 1.4 : 0,
        gLong: braking ? -1.2 : accel ? 0.6 : 0,
        gear: gearAt(v),
        connected: true,
        paused: false,
        inPits: false,
        gapAhead: 999,
        gapBehind: 999,
        yellow: false,
        tiresReady: true,
        trackLimits: 0,
        wheelFlat: false,
        minWear: 100,
        tcMap: 1,
        absMap: 1,
        antiStall: false,
        impact: 0,
      });
      const step = (v / 3.6) * dt;
      dist += step > 0 ? step : 0.5;
      t += dt;
      elapsed += dt;
      prevV = v;
    }
    lastLapTime = t;
  }
  return frames;
}

// ── Mutations (property tests §14.4) ─────────────────────────────────────────

/** Décale toutes les distances/temps d'un cran (shift ±1 frame). */
export function shiftByOne(frames: CoachFrame[]): CoachFrame[] {
  return frames.slice(1);
}

/** Duplique une frame sur deux (frames dupliquées §14.4). */
export function duplicateFrames(frames: CoachFrame[]): CoachFrame[] {
  const out: CoachFrame[] = [];
  for (let i = 0; i < frames.length; i++) {
    out.push(frames[i]);
    if (i % 2 === 0) out.push(frames[i]);
  }
  return out;
}

/** Bruit gaussien-ish déterministe sur la vitesse (σ km/h) — sans `Math.random`. */
export function noiseSpeed(frames: CoachFrame[], sigma: number): CoachFrame[] {
  return frames.map((f, i) => ({
    ...f,
    speed: f.speed + Math.sin(i * 12.9898) * sigma,
  }));
}
