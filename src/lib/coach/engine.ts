/**
 * Moteur du coach par virage — module **pur** `(state, frame) → (state, events)`
 * (COACH-LIVE-SPEC.md §4, P1.2). Aucune dépendance React ni Tauri : il consomme
 * des `CoachFrame` normalisées et émet des événements. C'est le composant
 * central testable par rejeu (§14) : même séquence de trames → mêmes événements.
 *
 * Rôle en P1.2 : **mesure** seule. Il bufferise les 8 canaux du tour courant,
 * projette les fenêtres curvilignes de la réf, et à la **clôture de chaque
 * fenêtre** (sortie franchie) émet un `corner-passed` avec les métriques
 * mesurées vs réf. À la ligne, il émet un `lap-completed` portant le tour
 * complet et les virages auto-détectés (matière première de la réf, P1.3).
 * Aucun diagnostic, inhibiteur ni voix ici (P2).
 *
 * L'état est **muté en place** puis renvoyé (mêmes réf.) : à 20 Hz sur un tour
 * de plusieurs minutes, recréer les tampons à chaque trame serait O(n²). Le
 * déterminisme (seul critère des tests) est préservé.
 */

import type { CoachRef } from "@/lib/api";
import type { CoachFrame } from "./frame";
import {
  windowsFromRef,
  detectAllCorners,
  assignUid,
  refValueAt,
  type CoachWindow,
  type DetectedCorner,
  type LapBuffer,
  type KnownApex,
} from "./windows";

/** Seuil d'appui frein « significatif » (%). */
const BRAKE_ON_PCT = 5;
/** Seuil « plein gaz » pour la mesure de réaccélération (%). */
const FULL_THROTTLE_PCT = 95;
/** Nombre d'échantillons minimum pour considérer un tour exploitable. */
const MIN_LAP_SAMPLES = 50;
/** Écart minimal à la voiture devant, tenu sur tout le tour, pour être éligible réf (s, §3.2). */
const GAP_MIN_S = 2.0;
/** Seuil de relâché du frein pour la mesure du trail (%). */
const BRAKE_RELEASE_PCT = 8;
/** Vitesse (km/h) sous laquelle on suspecte un tête-à-queue. */
const SPIN_KMH = 30;
/** Proxy blocage : frein ≥ ce seuil (%) avec décélération anormalement faible. */
const LOCKUP_BRAKE_PCT = 70;
/** Proxy blocage : |gLong| (g) sous lequel le freinage fort ne « mord » plus. */
const LOCKUP_DECEL_G = 0.6;
/** Proxy patinage : plein gaz ≥ ce seuil (%) avec accélération quasi nulle. */
const WHEELSPIN_THROTTLE_PCT = 85;
/** Proxy patinage : gLong (g) sous lequel le plein gaz ne pousse pas. */
const WHEELSPIN_ACCEL_G = 0.12;

/** Tampon de contexte parallèle au tampon 8 canaux (inhibiteurs §6, non persisté). */
interface CtxBuffer {
  gapAhead: number[];
  gapBehind: number[];
  trackLimits: number[];
  wheelFlat: number[]; // 0/1
  minWear: number[];
  antiStall: number[]; // 0/1
  impact: number[];
  yellow: number[]; // 0/1
  tcMap: number[];
  absMap: number[];
}

function emptyCtx(): CtxBuffer {
  return {
    gapAhead: [],
    gapBehind: [],
    trackLimits: [],
    wheelFlat: [],
    minWear: [],
    antiStall: [],
    impact: [],
    yellow: [],
    tcMap: [],
    absMap: [],
  };
}

/**
 * Verdict d'éligibilité d'un tour comme référence coach (§3.2) : tour propre,
 * sans aspiration, sans jaune et pneus en fenêtre. Chaque critère est exposé
 * pour permettre un message de diagnostic (« non retenu : trafic »).
 */
export interface LapEligibility {
  eligible: boolean;
  /** Tour non taint (ni pit, ni reset, ni recul de distance). */
  clean: boolean;
  /** `gap_ahead > 2 s` sur tout le tour (pas d'aspiration). */
  gapOk: boolean;
  /** Aucun drapeau jaune vu sur le tour. */
  noYellow: boolean;
  /** Pneus dans la fenêtre sur tout le tour. */
  tiresOk: boolean;
  /** Écart mini à la voiture devant observé sur le tour (s). */
  minGapAhead: number;
}

/**
 * Contexte d'inhibiteurs agrégé sur la fenêtre du virage (§6). Le taint est **par
 * fenêtre**, pas par tour : un dépassement en T1 ne mute pas T9.
 */
export interface CornerContext {
  /** Écart à la voiture devant à l'entrée de la fenêtre (s). */
  gapAheadEntry: number;
  /** Écart mini à la voiture derrière sur la fenêtre (s). */
  gapBehindMin: number;
  /** Un jaune a été vu dans la fenêtre. */
  yellow: boolean;
  /** Coupure(s) de piste dans la fenêtre (delta du compteur). */
  trackLimits: boolean;
  /** Roue à plat/détachée dans la fenêtre. */
  wheelFlat: boolean;
  /** Gomme restante mini sur la fenêtre (%). */
  minWear: number;
  /** Anti-calage/tête-à-queue (anti-stall ou Vmin < 30 km/h). */
  spin: boolean;
  /** Impact max sur la fenêtre. */
  impact: number;
  /** Maps TC/ABS courantes (comparées aux maps de la réf pour les verdicts). */
  tcMap: number;
  absMap: number;
}

/** Mesure d'un virage à la clôture de sa fenêtre. */
export interface CornerMeasurement {
  corner_uid: string;
  n: number;
  lapNum: number;
  entryDist: number;
  /** Point de freinage mesuré (interpolé sous-trame), m. */
  brakeDist: number;
  apexDist: number;
  exitDist: number;
  vmin: number;
  ventry: number;
  vexit: number;
  gLatMax: number;
  fullThrottleDist: number;
  /** Distance de relâché du frein (dernier appui avant l'apex), m — trail-braking. */
  brakeReleaseDist: number;
  /** Proxy de blocage au freinage (frein fort + décélération faible), sans slip exporté. */
  lockupProxy: boolean;
  /** Proxy de patinage en sortie (plein gaz + accélération faible). */
  wheelspinProxy: boolean;
  /** Δt sur la fenêtre vs réf (s, + = plus lent) ; `null` sans réf temps. */
  dtVsRef: number | null;
  /** Fenêtre partiellement/non fiable (pit, reset, hors couverture tampon). */
  tainted: boolean;

  // ── Cibles de réf projetées dans la fenêtre (0/false si pas de réf) ──
  hasRef: boolean;
  refBrakeDist: number;
  refVmin: number;
  refVentry: number;
  refVexit: number;
  refFullThrottleDist: number;
  refGLatMax: number;
  refBrakeReleaseDist: number;
  /** Temps de réf passé dans la fenêtre (s) — base des seuils relatifs (§7). */
  refCornerTime: number;

  /** Contexte d'inhibiteurs agrégé sur la fenêtre (§6). */
  ctx: CornerContext;
}

/** Tour bouclé : tampon complet + virages auto-détectés (pour bâtir une réf). */
export interface CompletedLap {
  lapNum: number;
  lapTime: number;
  tainted: boolean;
  buf: LapBuffer;
  corners: DetectedCorner[];
  /** Éligibilité comme réf coach (§3.2) — décidée par le service (capture P1.3). */
  eligibility: LapEligibility;
}

export type CoachEvent =
  | { type: "corner-passed"; measurement: CornerMeasurement }
  | { type: "lap-completed"; lap: CompletedLap }
  | { type: "lap-reset" }
  | { type: "combo-changed"; track: string; carModel: string };

export interface CoachEngineState {
  /** Combo courant `track::carModel` ("" tant qu'inconnu). */
  combo: string;
  ref: CoachRef | null;
  windows: CoachWindow[];
  lapNum: number;
  lastDist: number;
  tainted: boolean;
  buf: LapBuffer;
  /** Contexte d'inhibiteurs aligné sur `buf` (non persisté). */
  ctx: CtxBuffer;
  /** Prochaine fenêtre à clôturer (indice dans `windows`). */
  nextWin: number;
  /** UIDs émis sur le tour courant (anti-doublon). */
  passed: Set<string>;
  /** Tours propres bouclés (calibration §7). */
  validLaps: number;
  /** Apex connus pour la stabilité des `corner_uid` (§4.2). */
  knownApex: KnownApex[];
  /** Éligibilité du tour courant (accumulée trame par trame, §3.2). */
  lapMinGap: number;
  lapYellow: boolean;
  lapTiresOk: boolean;
}

function emptyBuffer(): LapBuffer {
  return {
    dist: [],
    time: [],
    speed: [],
    brake: [],
    throttle: [],
    steer: [],
    gLat: [],
    gLong: [],
    gear: [],
  };
}

/** État initial du moteur. */
export function createCoachState(): CoachEngineState {
  return {
    combo: "",
    ref: null,
    windows: [],
    lapNum: -1,
    lastDist: 0,
    tainted: false,
    buf: emptyBuffer(),
    ctx: emptyCtx(),
    nextWin: 0,
    passed: new Set(),
    validLaps: 0,
    knownApex: [],
    lapMinGap: Infinity,
    lapYellow: false,
    lapTiresOk: true,
  };
}

/**
 * Injecte la réf du combo (chargée hors moteur, car async). Recalcule les
 * fenêtres et alimente les apex connus (stabilité des UID).
 */
export function setCoachRef(state: CoachEngineState, ref: CoachRef | null): void {
  state.ref = ref;
  state.windows = ref ? windowsFromRef(ref) : [];
  if (ref) {
    for (const w of state.windows) {
      if (!state.knownApex.some((k) => k.corner_uid === w.corner_uid)) {
        state.knownApex.push({ corner_uid: w.corner_uid, apexDist: w.apexDist });
      }
    }
  }
  // Réaligne le pointeur de fenêtre sur la position courante.
  state.nextWin = firstWindowAtOrAfter(state.windows, state.lastDist);
}

/** Indice de la première fenêtre dont la sortie est ≥ `d`. */
function firstWindowAtOrAfter(windows: CoachWindow[], d: number): number {
  let i = 0;
  while (i < windows.length && windows[i].endDist < d) i++;
  return i;
}

/** Premier indice du tampon dont la distance est ≥ `d` (dist monotone ↑). */
function idxAtDist(dist: number[], d: number): number {
  // Recherche linéaire depuis la fin (les fenêtres se clôturent près du bord).
  let lo = 0;
  let hi = dist.length - 1;
  if (hi < 0) return 0;
  if (dist[hi] < d) return hi;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dist[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function resetLap(state: CoachEngineState, inPits: boolean): void {
  state.buf = emptyBuffer();
  state.ctx = emptyCtx();
  state.tainted = inPits;
  state.passed = new Set();
  state.nextWin = firstWindowAtOrAfter(state.windows, 0);
  state.lapMinGap = Infinity;
  state.lapYellow = false;
  state.lapTiresOk = true;
}

/**
 * Mesure une fenêtre `[i0, i1]` du tampon vs réf. `i0/i1` bornés au tampon.
 * `covered` = la fenêtre est entièrement couverte par le tampon (sinon tainted).
 */
function measureWindow(
  state: CoachEngineState,
  w: CoachWindow,
  lapNum: number,
): CornerMeasurement | null {
  const buf = state.buf;
  const N = buf.dist.length;
  if (N < 5) return null;
  const i0 = idxAtDist(buf.dist, w.startDist);
  const i1 = Math.min(N - 1, idxAtDist(buf.dist, w.endDist));
  if (i1 <= i0) return null;

  // Apex = vitesse minimale dans la fenêtre.
  let apexIdx = i0;
  let vmin = Infinity;
  let gLatMax = 0;
  for (let k = i0; k <= i1; k++) {
    if (buf.speed[k] < vmin) {
      vmin = buf.speed[k];
      apexIdx = k;
    }
    const m = Math.abs(buf.gLat[k] ?? 0);
    if (m > gLatMax) gLatMax = m;
  }

  // Point de freinage : 1er franchissement du seuil, interpolé sous-trame.
  let brakeDist = buf.dist[i0];
  let ventry = buf.speed[i0];
  for (let k = i0 + 1; k <= apexIdx; k++) {
    if (buf.brake[k] >= BRAKE_ON_PCT) {
      const b0 = buf.brake[k - 1];
      const b1 = buf.brake[k];
      const f = b1 > b0 ? (BRAKE_ON_PCT - b0) / (b1 - b0) : 0;
      const ff = Math.max(0, Math.min(1, f));
      brakeDist = buf.dist[k - 1] + (buf.dist[k] - buf.dist[k - 1]) * ff;
      ventry = buf.speed[k - 1] + (buf.speed[k] - buf.speed[k - 1]) * ff;
      break;
    }
  }

  // Réaccélération : 1re distance à plein gaz soutenu après l'apex.
  let fullThrottleDist = buf.dist[i1];
  for (let k = apexIdx; k <= i1; k++) {
    if (buf.throttle[k] >= FULL_THROTTLE_PCT) {
      fullThrottleDist = buf.dist[k];
      break;
    }
  }

  // Relâché du frein : dernier appui significatif avant l'apex (trail-braking §5.8).
  let brakeReleaseDist = brakeDist;
  for (let k = apexIdx; k >= i0; k--) {
    if (buf.brake[k] >= BRAKE_RELEASE_PCT) {
      brakeReleaseDist = buf.dist[k];
      break;
    }
  }

  // Proxies blocage/patinage (sans slip exporté au tampon) — requièrent 2 trames.
  const lockupProxy = sustained(
    i0,
    apexIdx,
    (k) =>
      buf.brake[k] >= LOCKUP_BRAKE_PCT &&
      Math.abs(buf.gLong[k]) < LOCKUP_DECEL_G &&
      buf.speed[k] > 60,
  );
  const wheelspinProxy = sustained(
    apexIdx,
    i1,
    (k) =>
      buf.throttle[k] >= WHEELSPIN_THROTTLE_PCT &&
      buf.gLong[k] < WHEELSPIN_ACCEL_G &&
      buf.speed[k] > 40,
  );

  // ── Cibles de réf projetées dans la fenêtre ──
  const ref = state.ref;
  const hasRef = !!ref && ref.n_points >= 2;
  let dtVsRef: number | null = null;
  let refCornerTime = 0;
  let refGLatMax = 0;
  let refBrakeReleaseDist = 0;
  if (ref && hasRef) {
    refCornerTime = refTimeAt(ref, w.endDist) - refTimeAt(ref, w.startDist);
    const curDelta = buf.time[i1] - buf.time[i0];
    if (refCornerTime > 0) dtVsRef = curDelta - refCornerTime;
    refGLatMax = refMaxAbsGLat(ref, w.startDist, w.endDist);
    refBrakeReleaseDist = refLastBrakeRelease(ref, w.startDist, w.apexDist);
  }

  // ── Contexte d'inhibiteurs agrégé sur la fenêtre (§6) ──
  const ctxBuf = state.ctx;
  let gapBehindMin = Infinity;
  let yellow = false;
  let wheelFlat = false;
  let minWear = Infinity;
  let spin = vmin < SPIN_KMH;
  let impact = 0;
  for (let k = i0; k <= i1; k++) {
    if (ctxBuf.gapBehind[k] < gapBehindMin) gapBehindMin = ctxBuf.gapBehind[k];
    if (ctxBuf.yellow[k]) yellow = true;
    if (ctxBuf.wheelFlat[k]) wheelFlat = true;
    if (ctxBuf.minWear[k] < minWear) minWear = ctxBuf.minWear[k];
    if (ctxBuf.antiStall[k]) spin = true;
    if (ctxBuf.impact[k] > impact) impact = ctxBuf.impact[k];
  }
  const ctx: CornerContext = {
    gapAheadEntry: ctxBuf.gapAhead[i0] ?? 999,
    gapBehindMin: gapBehindMin === Infinity ? 999 : gapBehindMin,
    yellow,
    trackLimits: (ctxBuf.trackLimits[i1] ?? 0) > (ctxBuf.trackLimits[i0] ?? 0),
    wheelFlat,
    minWear: minWear === Infinity ? 100 : minWear,
    spin,
    impact,
    // Maps TC/ABS : réglage ~constant, on prend la valeur à la sortie de fenêtre.
    tcMap: ctxBuf.tcMap[i1] ?? 0,
    absMap: ctxBuf.absMap[i1] ?? 0,
  };

  const covered = buf.dist[i0] <= w.startDist + 8;
  return {
    corner_uid: w.corner_uid,
    n: w.n,
    lapNum,
    entryDist: w.startDist,
    brakeDist,
    apexDist: buf.dist[apexIdx],
    exitDist: buf.dist[i1],
    vmin: vmin === Infinity ? buf.speed[i0] : vmin,
    ventry,
    vexit: buf.speed[i1],
    gLatMax,
    fullThrottleDist,
    brakeReleaseDist,
    lockupProxy,
    wheelspinProxy,
    dtVsRef,
    tainted: state.tainted || !covered,
    hasRef,
    refBrakeDist: w.brakeDist,
    refVmin: w.refVmin,
    refVentry: w.refVentry,
    refVexit: w.refVexit,
    refFullThrottleDist: w.refFullThrottleDist,
    refGLatMax,
    refBrakeReleaseDist,
    refCornerTime,
    ctx,
  };
}

/** Vrai si `pred` est satisfait sur ≥ 2 indices consécutifs de `[a, b]`. */
function sustained(a: number, b: number, pred: (k: number) => boolean): boolean {
  let run = 0;
  for (let k = a; k <= b; k++) {
    if (pred(k)) {
      if (++run >= 2) return true;
    } else run = 0;
  }
  return false;
}

/** Max |gLat| de la réf échantillonné sur `[d0, d1]` (grille dense). */
function refMaxAbsGLat(ref: CoachRef, d0: number, d1: number): number {
  let m = 0;
  for (let d = d0; d <= d1; d += ref.step_m) {
    const v = Math.abs(refValueAt(ref, "gLat", d));
    if (v > m) m = v;
  }
  return m;
}

/** Dernière distance de réf < `apexDist` où le frein est encore appuyé (trail). */
function refLastBrakeRelease(ref: CoachRef, d0: number, apexDist: number): number {
  let rel = d0;
  for (let d = d0; d <= apexDist; d += ref.step_m) {
    if (refValueAt(ref, "brake", d) >= BRAKE_RELEASE_PCT) rel = d;
  }
  return rel;
}

/** Temps de réf interpolé à la distance `d` (canal 0 de la grille). */
function refTimeAt(ref: CoachRef, d: number): number {
  const step = ref.step_m;
  if (step <= 0 || ref.n_points < 2) return 0;
  const g = d / step;
  const i = Math.max(0, Math.min(ref.n_points - 2, Math.floor(g)));
  const f = Math.max(0, Math.min(1, g - i));
  const t0 = ref.channels[i] ?? 0; // canal time = index 0
  const t1 = ref.channels[i + 1] ?? t0;
  return t0 + (t1 - t0) * f;
}

/** Clôture le tour courant : détecte les virages, stabilise les UID, émet. */
function finalizeLap(
  state: CoachEngineState,
  lapNum: number,
  lapTime: number,
  events: CoachEvent[],
): void {
  const buf = state.buf;
  if (buf.dist.length >= MIN_LAP_SAMPLES && lapTime > 0) {
    const corners = detectAllCorners(buf);
    // Stabilise/enrichit les apex connus (indexe la mémoire chronique §4.2).
    for (const c of corners) {
      const uid = assignUid(c.apexDist, state.knownApex);
      if (!state.knownApex.some((k) => k.corner_uid === uid)) {
        state.knownApex.push({ corner_uid: uid, apexDist: c.apexDist });
      }
    }
    if (!state.tainted) state.validLaps++;
    const clean = !state.tainted;
    const gapOk = state.lapMinGap > GAP_MIN_S;
    const noYellow = !state.lapYellow;
    const tiresOk = state.lapTiresOk;
    const eligibility: LapEligibility = {
      eligible: clean && gapOk && noYellow && tiresOk,
      clean,
      gapOk,
      noYellow,
      tiresOk,
      minGapAhead: state.lapMinGap === Infinity ? 999 : state.lapMinGap,
    };
    events.push({
      type: "lap-completed",
      lap: { lapNum, lapTime, tainted: state.tainted, buf, corners, eligibility },
    });
  }
}

/**
 * Avance le moteur d'une trame. Renvoie l'état (muté) et les événements émis.
 */
export function stepCoach(
  state: CoachEngineState,
  frame: CoachFrame,
): { state: CoachEngineState; events: CoachEvent[] } {
  const events: CoachEvent[] = [];

  // ── Changement de combo → reset ; le host rechargera la réf (async) ──
  if (frame.track && frame.carModel) {
    const combo = `${frame.track}::${frame.carModel}`;
    if (combo !== state.combo) {
      state.combo = combo;
      state.ref = null;
      state.windows = [];
      state.knownApex = [];
      state.lapNum = frame.lapNum;
      state.lastDist = 0;
      resetLap(state, frame.inPits);
      events.push({ type: "combo-changed", track: frame.track, carModel: frame.carModel });
      return { state, events };
    }
  }

  const d = frame.dist;
  const t = frame.lapTime;

  // ── Franchissement de ligne / reset ──
  if (state.lapNum < 0) {
    state.lapNum = frame.lapNum;
  } else if (frame.lapNum > state.lapNum) {
    finalizeLap(state, state.lapNum, frame.lastLapTime, events);
    state.lapNum = frame.lapNum;
    resetLap(state, frame.inPits);
  } else if (state.lastDist > 0 && d + 5 < state.lastDist) {
    // Recul de distance franc (pit/téléport/reset session) → tour avorté.
    resetLap(state, frame.inPits);
    events.push({ type: "lap-reset" });
  }
  state.lastDist = d;
  if (frame.inPits) state.tainted = true;

  // ── Accumulation de l'éligibilité du tour (§3.2), sur les trames en piste ──
  if (d > 0 && t > 0) {
    if (frame.gapAhead < state.lapMinGap) state.lapMinGap = frame.gapAhead;
    if (frame.yellow) state.lapYellow = true;
    if (!frame.tiresReady) state.lapTiresOk = false;
  }

  // ── Accumulation du tour courant (distance strictement croissante) ──
  const buf = state.buf;
  const last = buf.dist.length - 1;
  if (d > 0 && t > 0 && (last < 0 || d > buf.dist[last])) {
    buf.dist.push(d);
    buf.time.push(t);
    buf.speed.push(frame.speed);
    buf.brake.push(frame.brake);
    buf.throttle.push(frame.throttle);
    buf.steer.push(frame.steer);
    buf.gLat.push(frame.gLat);
    buf.gLong.push(frame.gLong);
    buf.gear.push(frame.gear);
    const c = state.ctx;
    c.gapAhead.push(frame.gapAhead);
    c.gapBehind.push(frame.gapBehind);
    c.trackLimits.push(frame.trackLimits);
    c.wheelFlat.push(frame.wheelFlat ? 1 : 0);
    c.minWear.push(frame.minWear);
    c.antiStall.push(frame.antiStall ? 1 : 0);
    c.impact.push(frame.impact);
    c.yellow.push(frame.yellow ? 1 : 0);
    c.tcMap.push(frame.tcMap);
    c.absMap.push(frame.absMap);
  }

  // ── Clôture des fenêtres franchies (sortie ≤ distance courante) ──
  while (
    state.nextWin < state.windows.length &&
    d >= state.windows[state.nextWin].endDist
  ) {
    const w = state.windows[state.nextWin];
    state.nextWin++;
    if (state.passed.has(w.corner_uid)) continue;
    const m = measureWindow(state, w, state.lapNum);
    if (m) {
      state.passed.add(w.corner_uid);
      events.push({ type: "corner-passed", measurement: m });
    }
  }

  return { state, events };
}
