/**
 * Moteur de diagnostic par virage (COACH-LIVE-SPEC.md §5/§6/§7, P2.1) — module
 * **pur** `(measurement, state, config) → diagnostic | muted | null`, sans React
 * ni voix (la restitution est P2.2/P2.3).
 *
 * Consomme les `CornerMeasurement` du moteur (événement `corner-passed`) et rend
 * **une cause dominante** par passage, en respectant :
 *  - la **priorité** §5 (l'événement binaire — blocage/patinage — prime sur
 *    l'écart continu ; « constance avant pace » quand la variance domine) ;
 *  - les **inhibiteurs** §6 (taint par fenêtre : trafic, jaune, crevaison,
 *    tête-à-queue, impact…) → verdict `muted` avec raison ;
 *  - les **seuils adaptatifs** §7 : plancher relatif + `2σ` du pilote (armement),
 *    `1σ` (extinction, hystérésis), **confirmation sur 2 passages** (sauf binaire),
 *    élargissement sur pneus usés, calibration ≥ 3 tours.
 *
 * L'état (`DiagState`) porte, par `corner_uid`, un anneau des mesures propres
 * (pour σ) et la machine hystérésis/confirmation. Déterministe → rejouable (§14).
 */

import type { CornerMeasurement } from "./engine";
import type { ShortRefTargets } from "./shortref";
import type { RefMode } from "./staleness";

/** Les 9 diagnostics (§5), dans l'ordre de priorité de sélection. */
export type DiagCode =
  | "lockup"
  | "wheelspin"
  | "consistency"
  | "brake-timing"
  | "over-slow"
  | "entry-too-fast"
  | "late-throttle"
  | "grip-unused"
  | "no-trail";

/** Ordre de priorité : binaire → constance → pace (§5). */
const PRIORITY: DiagCode[] = [
  "lockup",
  "wheelspin",
  "consistency",
  "brake-timing",
  "over-slow",
  "entry-too-fast",
  "late-throttle",
  "grip-unused",
  "no-trail",
];

/** Niveau pilote (§7) — gating et largeur de seuils. */
export type DriverLevel = "beginner" | "intermediate" | "fast";

/** Raison de mise sous silence (§6). */
export type MuteReason =
  | "tainted"
  | "no-ref"
  | "calibrating"
  | "traffic-ahead"
  | "traffic-behind"
  | "yellow"
  | "wheel-flat"
  | "spin"
  | "impact";

/** Verdict d'un virage : un diagnostic, un silence motivé, ou rien (sous seuil). */
export type DiagResult =
  | { kind: "diagnostic"; diag: CoachDiagnostic }
  | { kind: "muted"; reason: MuteReason }
  | { kind: "none" };

/** Diagnostic structuré (la formulation voix/widget est P2.2/P2.3). */
export interface CoachDiagnostic {
  code: DiagCode;
  corner_uid: string;
  n: number;
  lapNum: number;
  /** Écart mesuré vs réf, dans l'unité du diagnostic (valeur absolue). */
  magnitude: number;
  unit: "m" | "km/h" | "s" | "g" | "";
  /** +1 = trop tard / trop haut / trop fort ; -1 = trop tôt / trop bas ; 0 = neutre. */
  sign: number;
  /**
   * Cible = **réf courte** (médiane des derniers passages, §3.3) plutôt que la réf
   * dense : l'écart est « que d'habitude », pas « vs référence ». Vrai en mode
   * indicatif (réf dense périmée). La voix choisit alors un gabarit relatif (P3.2).
   */
  relative: boolean;
}

/** État par virage : anneau de mesures propres (σ) + machine hystérésis. */
interface CornerDiagState {
  brakeHist: number[];
  dtHist: number[];
  vminHist: number[];
  active: DiagCode | null;
  pending: DiagCode | null;
  pendingCount: number;
}

export interface DiagState {
  corners: Map<string, CornerDiagState>;
}

export function createDiagState(): DiagState {
  return { corners: new Map() };
}

/** Configuration d'un passage (le service la fournit à chaque `corner-passed`). */
export interface DiagConfig {
  level: DriverLevel;
  /** Tours propres bouclés (moteur `validLaps`) — calibration ≥ 3 avant de parler. */
  calibrationLaps: number;
  /** Maps TC/ABS de la réf (méta) — si fournies, les verdicts blocage/patinage exigent l'égalité. */
  refTcMap?: number;
  refAbsMap?: number;
  /**
   * Mode de la réf dense (§3.3) — défaut `fresh`. `fresh` : cible dense (best/ghost),
   * mais un écart n'est retenu que s'il est **aussi** confirmé sur la réf courte
   * (« sur les deux réfs »). `indicative` : réf dense périmée → cible **courte**
   * uniquement, deltas relatifs (« que d'habitude »), jamais de chiffre absolu.
   */
  refMode?: RefMode;
  /** Réf courte du virage (médianes des derniers passages propres, §3.3), si dispo. */
  shortRef?: ShortRefTargets;
}

// ── Planchers de seuils par niveau (§7) ──────────────────────────────────────
const DIST_FLOOR: Record<DriverLevel, number> = { beginner: 15, intermediate: 8, fast: 5 };
const DT_FLOOR: Record<DriverLevel, number> = { beginner: 0.4, intermediate: 0.15, fast: 0.1 };
const V_FLOOR: Record<DriverLevel, number> = { beginner: 8, intermediate: 5, fast: 4 };
const G_FLOOR: Record<DriverLevel, number> = { beginner: 0.25, intermediate: 0.15, fast: 0.1 };

/** Taille de l'anneau de mesures propres par virage. */
const HIST_MAX = 8;
/** Écart de relâché du frein (m) au-delà duquel on parle de trail perdu. */
const TRAIL_M = 20;
/** Impact magnitude au-delà duquel la fenêtre est mutée (unité brute LMU, à calibrer). */
const IMPACT_MUTE = 100;
/** Gomme restante (%) sous laquelle les seuils s'élargissent (diagnostic « usure »). */
const WEAR_WIDEN_PCT = 30;
/** Facteur d'élargissement des seuils sur pneus usés. */
const WEAR_WIDEN_FACTOR = 1.5;
/** Passages consécutifs requis avant de parler (hors événement binaire). */
const CONFIRM = 2;
/** Passages mini pour évaluer la constance. */
const CONSISTENCY_MIN_N = 3;

function std(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(v);
}

function meanAbs(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + Math.abs(b), 0) / xs.length;
}

function getCorner(st: DiagState, uid: string): CornerDiagState {
  let cs = st.corners.get(uid);
  if (!cs) {
    cs = { brakeHist: [], dtHist: [], vminHist: [], active: null, pending: null, pendingCount: 0 };
    st.corners.set(uid, cs);
  }
  return cs;
}

function push(hist: number[], v: number): void {
  hist.push(v);
  if (hist.length > HIST_MAX) hist.shift();
}

/** Inhibiteur applicable (§6) → raison, sinon `null`. */
function muteReason(m: CornerMeasurement): MuteReason | null {
  if (m.tainted) return "tainted";
  const c = m.ctx;
  if (c.wheelFlat) return "wheel-flat";
  if (c.spin) return "spin";
  if (c.impact > IMPACT_MUTE) return "impact";
  if (c.yellow) return "yellow";
  if (c.gapAheadEntry < 1.5) return "traffic-ahead";
  if (c.gapBehindMin < 1.0) return "traffic-behind";
  return null;
}

/** Diagnostics de *pace* : ceux qui comparent la mesure à une **cible** de réf. */
type PaceCode =
  | "brake-timing"
  | "over-slow"
  | "entry-too-fast"
  | "late-throttle"
  | "grip-unused"
  | "no-trail";
const PACE_CODES: readonly PaceCode[] = [
  "brake-timing",
  "over-slow",
  "entry-too-fast",
  "late-throttle",
  "grip-unused",
  "no-trail",
];
const PACE_SET: ReadonlySet<DiagCode> = new Set(PACE_CODES);

/** Seuils de déclenchement pour un multiplicateur σ donné (échelle = réf dense). */
interface Thresholds {
  distThr: number;
  vThr: number;
  gThr: number;
  dtFloor: number;
  mapsOk: boolean;
}

/**
 * Seuils relatifs (§7) pour `mult` (2 = armement, 1 = extinction/hystérésis). Leur
 * **échelle** (4 % de Vmin, 8 % du temps de virage…) vient de la réf **dense** : même
 * périmée, la géométrie du virage (épingle vs kink) reste valide pour dimensionner
 * les seuils — seule la *cible* comparée bascule vers la réf courte (§3.3).
 */
function thresholds(
  m: CornerMeasurement,
  cs: CornerDiagState,
  cfg: DiagConfig,
  mult: number,
): Thresholds {
  const wear = m.ctx.minWear < WEAR_WIDEN_PCT ? WEAR_WIDEN_FACTOR : 1;
  const sigmaBrake = std(cs.brakeHist);
  const sigmaVmin = std(cs.vminHist);
  return {
    distThr: Math.max(DIST_FLOOR[cfg.level], mult * sigmaBrake) * wear,
    vThr: Math.max(V_FLOOR[cfg.level], 0.04 * m.refVmin, mult * sigmaVmin) * wear,
    gThr: Math.max(G_FLOOR[cfg.level], 0.08 * m.refGLatMax) * wear,
    dtFloor: Math.max(DT_FLOOR[cfg.level], 0.08 * m.refCornerTime) * wear,
    mapsOk:
      (cfg.refTcMap === undefined || cfg.refTcMap === m.ctx.tcMap) &&
      (cfg.refAbsMap === undefined || cfg.refAbsMap === m.ctx.absMap),
  };
}

/** Cibles d'un virage (réf dense ou réf courte) — même forme pour comparer. */
interface PaceTargets {
  brakeDist: number;
  vmin: number;
  vexit: number;
  fullThrottleDist: number;
  gLatMax: number;
  brakeReleaseDist: number;
}

/** Cibles de la réf **dense** projetées dans la fenêtre. */
function denseTargets(m: CornerMeasurement): PaceTargets {
  return {
    brakeDist: m.refBrakeDist,
    vmin: m.refVmin,
    vexit: m.refVexit,
    fullThrottleDist: m.refFullThrottleDist,
    gLatMax: m.refGLatMax,
    brakeReleaseDist: m.refBrakeReleaseDist,
  };
}

/** Cibles de la réf **courte** (médianes des passages propres, §3.3). */
function shortTargets(sr: ShortRefTargets): PaceTargets {
  return {
    brakeDist: sr.brakeDist,
    vmin: sr.vmin,
    vexit: sr.vexit,
    fullThrottleDist: sr.fullThrottleDist,
    gLatMax: sr.gLatMax,
    brakeReleaseDist: sr.brakeReleaseDist,
  };
}

/** Dépassements binaires (blocage/patinage) + constance — indépendants de la cible. */
function baseHits(
  m: CornerMeasurement,
  cs: CornerDiagState,
  thr: Thresholds,
): Partial<Record<DiagCode, boolean>> {
  const sigmaDt = std(cs.dtHist);
  const meanAbsDt = meanAbs(cs.dtHist);
  return {
    // Binaire (prime) — proxies conservateurs, maps identiques à la réf.
    lockup: m.lockupProxy && thr.mapsOk,
    wheelspin: m.wheelspinProxy && thr.mapsOk,
    // Constance avant pace : la variance de Δt domine sa moyenne (§5 règle transverse).
    consistency:
      cs.dtHist.length >= CONSISTENCY_MIN_N && sigmaDt > Math.max(meanAbsDt, thr.dtFloor),
  };
}

/** Dépassements de *pace* de la mesure `m` vs les cibles `tg`, aux seuils `thr`. */
function paceHits(
  m: CornerMeasurement,
  cfg: DiagConfig,
  thr: Thresholds,
  tg: PaceTargets,
): Partial<Record<PaceCode, boolean>> {
  const hit: Partial<Record<PaceCode, boolean>> = {};
  hit["brake-timing"] = Math.abs(m.brakeDist - tg.brakeDist) > thr.distThr;
  hit["over-slow"] = tg.vmin - m.vmin > thr.vThr && !m.lockupProxy;
  hit["entry-too-fast"] = m.vmin > tg.vmin + thr.vThr && m.vexit < tg.vexit - thr.vThr;
  hit["late-throttle"] = m.fullThrottleDist - tg.fullThrottleDist > thr.distThr;
  hit["grip-unused"] = tg.gLatMax > 0 && tg.gLatMax - m.gLatMax > thr.gThr;
  if (cfg.level !== "beginner" && tg.brakeReleaseDist > 0) {
    const measGap = m.apexDist - m.brakeReleaseDist;
    const refGap = m.apexDist - tg.brakeReleaseDist;
    hit["no-trail"] = measGap - refGap > TRAIL_M;
  }
  return hit;
}

/**
 * Carte complète des dépassements pour `mult`, en appliquant la politique de réf
 * (§3.3) :
 *  - **`fresh`** : cible = réf dense, mais un écart de pace n'est retenu que s'il est
 *    **aussi** confirmé sur la réf courte quand elle existe (« sur les deux réfs ») —
 *    tue le bruit et les trajectoires ponctuelles. Sans réf courte encore : dense seule.
 *  - **`indicative`** : réf dense périmée → cible = réf **courte** seule (deltas
 *    relatifs). Sans réf courte : aucun verdict de pace (on préfère se taire, §15).
 * Le binaire et la constance sont indépendants de la cible.
 */
function combinedHits(
  m: CornerMeasurement,
  cs: CornerDiagState,
  cfg: DiagConfig,
  mult: number,
): Partial<Record<DiagCode, boolean>> {
  const thr = thresholds(m, cs, cfg, mult);
  const hit: Partial<Record<DiagCode, boolean>> = baseHits(m, cs, thr);
  if (!m.hasRef) return hit;

  const short = cfg.shortRef ? shortTargets(cfg.shortRef) : null;
  let pace: Partial<Record<PaceCode, boolean>>;
  if ((cfg.refMode ?? "fresh") === "fresh") {
    const dense = paceHits(m, cfg, thr, denseTargets(m));
    if (short) {
      const s = paceHits(m, cfg, thr, short);
      pace = {};
      for (const k of PACE_CODES) pace[k] = !!dense[k] && !!s[k];
    } else {
      pace = dense;
    }
  } else {
    pace = short ? paceHits(m, cfg, thr, short) : {};
  }
  return { ...hit, ...pace };
}

/** Première cause dominante (ordre §5) d'une carte de dépassements. */
function firstHit(hit: Partial<Record<DiagCode, boolean>>): DiagCode | null {
  for (const code of PRIORITY) if (hit[code]) return code;
  return null;
}

/** Construit le diagnostic structuré (magnitude/unité/sens) pour le code retenu. */
function build(
  m: CornerMeasurement,
  code: DiagCode,
  tg: PaceTargets,
  relative: boolean,
): CoachDiagnostic {
  const base = { code, corner_uid: m.corner_uid, n: m.n, lapNum: m.lapNum };
  switch (code) {
    case "lockup":
    case "wheelspin":
      return { ...base, magnitude: 0, unit: "", sign: 0, relative: false };
    case "consistency":
      return { ...base, magnitude: 0, unit: "s", sign: 0, relative: false }; // magnitude via `emit`

    case "brake-timing": {
      const d = m.brakeDist - tg.brakeDist;
      return { ...base, magnitude: Math.abs(d), unit: "m", sign: d > 0 ? 1 : -1, relative };
    }
    case "over-slow":
      return { ...base, magnitude: tg.vmin - m.vmin, unit: "km/h", sign: -1, relative };
    case "entry-too-fast":
      return { ...base, magnitude: m.vmin - tg.vmin, unit: "km/h", sign: 1, relative };
    case "late-throttle":
      return { ...base, magnitude: m.fullThrottleDist - tg.fullThrottleDist, unit: "m", sign: 1, relative };
    case "grip-unused":
      return { ...base, magnitude: tg.gLatMax - m.gLatMax, unit: "g", sign: -1, relative };
    case "no-trail": {
      const measGap = m.apexDist - m.brakeReleaseDist;
      const refGap = m.apexDist - tg.brakeReleaseDist;
      return { ...base, magnitude: measGap - refGap, unit: "m", sign: 1, relative };
    }
  }
}

/**
 * Diagnostique un virage à la clôture de sa fenêtre. Met à jour l'état
 * (historique σ + hystérésis/confirmation) et renvoie le verdict.
 */
export function diagnoseCorner(
  m: CornerMeasurement,
  st: DiagState,
  cfg: DiagConfig,
): DiagResult {
  const cs = getCorner(st, m.corner_uid);

  // 1) Inhibiteurs (§6) — silence motivé, sans polluer l'historique (mesure douteuse).
  const reason = muteReason(m);
  if (reason) {
    cs.pending = null;
    cs.pendingCount = 0;
    cs.active = null;
    return { kind: "muted", reason };
  }
  if (!m.hasRef) return { kind: "muted", reason: "no-ref" };

  // Cible effective des verdicts de pace (§3.3) : réf **courte** en mode indicatif
  // (réf dense périmée) — l'écart est alors « que d'habitude » (`relative`) ; réf
  // **dense** en mode frais (la réf courte n'y sert que de confirmation).
  const usingShort = (cfg.refMode ?? "fresh") === "indicative" && cfg.shortRef != null;
  const effTargets = usingShort && cfg.shortRef ? shortTargets(cfg.shortRef) : denseTargets(m);

  // 2) Candidats hystérésis (armement 2σ / extinction 1σ), sur l'historique passé.
  const hits2 = combinedHits(m, cs, cfg, 2);
  const hits1 = combinedHits(m, cs, cfg, 1);
  const arm = firstHit(hits2);
  const sustain = firstHit(hits1);

  // 3) Ce passage alimente la base σ de pace **uniquement s'il est dans le seuil** :
  //    un écart armé ne doit pas gonfler sa propre dispersion (sinon la confirmation
  //    au 2ᵉ passage retombe sous 2σ). `dtHist` reste complet → nourrit la constance.
  if (!hits2["brake-timing"]) push(cs.brakeHist, m.brakeDist);
  if (!hits2["over-slow"] && !hits2["entry-too-fast"]) push(cs.vminHist, m.vmin);
  if (m.dtVsRef !== null) push(cs.dtHist, m.dtVsRef);

  // 4) Calibration : au moins 3 tours valides avant tout message (§7).
  if (cfg.calibrationLaps < 3) return { kind: "none" };

  const binary = arm === "lockup" || arm === "wheelspin";

  // 5) Diagnostic déjà actif → hystérésis : maintenu tant que ≥ 1σ (sustain).
  if (cs.active) {
    if (sustain === cs.active) return emit(m, cs, cs.active, effTargets, usingShort);
    cs.active = null; // extinction sous 1σ
  }

  // 6) Événement binaire : pas de confirmation (blocage/patinage = fait ponctuel).
  if (binary && arm) {
    cs.active = arm;
    cs.pending = null;
    cs.pendingCount = 0;
    return emit(m, cs, arm, effTargets, usingShort);
  }

  // 7) Continu : confirmation sur 2 passages consécutifs (§7).
  if (arm) {
    if (cs.pending === arm) cs.pendingCount++;
    else {
      cs.pending = arm;
      cs.pendingCount = 1;
    }
    if (cs.pendingCount >= CONFIRM) {
      cs.active = arm;
      cs.pending = null;
      cs.pendingCount = 0;
      return emit(m, cs, arm, effTargets, usingShort);
    }
    return { kind: "none" };
  }

  cs.pending = null;
  cs.pendingCount = 0;
  return { kind: "none" };
}

/**
 * Emballe un diagnostic : cibles effectives `tg` (dense ou courte) pour la magnitude,
 * `relative` (mode indicatif → « que d'habitude ») appliqué aux seuls diags de pace.
 * La magnitude de constance est renseignée depuis l'anneau Δt.
 */
function emit(
  m: CornerMeasurement,
  cs: CornerDiagState,
  code: DiagCode,
  tg: PaceTargets,
  relative: boolean,
): DiagResult {
  const diag = build(m, code, tg, relative && PACE_SET.has(code));
  if (code === "consistency") diag.magnitude = std(cs.dtHist);
  return { kind: "diagnostic", diag };
}
