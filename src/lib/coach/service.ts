/**
 * Service coach autonome (COACH-LIVE-SPEC.md §0.5, §4).
 *
 * Abonne le moteur pur au flux **`live-data` brut** (pas le flux d'affichage
 * lissé High FPS, qui contamine le tampon) et pilote le cycle de vie async que
 * le moteur, pur, ne peut pas faire lui-même :
 *  - au `combo-changed`, il charge la réf du combo (`coachRef.load`) et l'injecte
 *    via `setCoachRef` ;
 *  - au `lap-completed` **éligible** (§3.2), il construit une réf dense (`buildRefPayload`)
 *    et l'enregistre via `coachRef.save` si elle bat la meilleure de la session (P1.3).
 *
 * Le moteur reste pur : toute I/O (charge/sauvegarde de réf) vit ici.
 */

import { live, coachRef, type LiveData, type CoachRef } from "@/lib/api";
import { frameFromLive } from "./frame";
import {
  createCoachState,
  setCoachRef,
  stepCoach,
  type CoachEngineState,
  type CoachEvent,
  type CompletedLap,
  type CornerMeasurement,
} from "./engine";
import { buildRefPayload, captureMetaFromLive } from "./capture";
import {
  createDiagState,
  diagnoseCorner,
  type DiagState,
  type DiagResult,
  type DriverLevel,
} from "./diagnostics";
import {
  createCoachVoiceState,
  observeCorner,
  stepCoachVoice,
  type CoachVoiceState,
  type CoachVoiceMsg,
} from "./voice";
import { modeFromSession, policyFor } from "./mode";
import {
  macroForCombo,
  mapMacroToWindows,
  type MacroCorner,
  type MappedMacro,
} from "./apex";
import { calibrateDriverLevel } from "./calibration";
import {
  createShortRefState,
  shortRefTargets,
  updateShortRef,
  type ShortRefState,
} from "./shortref";
import { refFreshness, type RefConditions, type RefMode } from "./staleness";
import {
  fetchBenchmarks,
  findBenchmark,
  liveClassToOhne,
  type PaceBenchmark,
} from "@/lib/ohne_speed";
import type { CoachFrame } from "./frame";

type Listener = (event: CoachEvent, state: CoachEngineState) => void;
type RefListener = (lapTime: number, refId: number) => void;
type DiagListener = (result: DiagResult, state: CoachEngineState) => void;
type SpeakListener = (msg: CoachVoiceMsg, state: CoachEngineState) => void;

let state: CoachEngineState = createCoachState();
let unlisten: (() => void) | null = null;
let started = false;
const listeners = new Set<Listener>();
const refListeners = new Set<RefListener>();
const diagListeners = new Set<DiagListener>();
const speakListeners = new Set<SpeakListener>();
/** Combo pour lequel une charge de réf est en vol (évite les doublons). */
let loadingCombo = "";
/** Dernier instantané live (pour bâtir les métadonnées de réf à la clôture). */
let lastData: LiveData | null = null;
/** Meilleur temps déjà enregistré comme réf sur la session (anti-doublon). */
let sessionBestSaved = Infinity;
/** État du moteur de diagnostic (anneaux σ + hystérésis par virage, §7). */
let diag: DiagState = createDiagState();
/** État de restitution vocale (fenêtre de délivrance + anti-spam, §1/§9). */
let voice: CoachVoiceState = createCoachVoiceState();
/** Niveau pilote — auto-calibré par ohne_speed (§7, P3.2) sauf override manuel. */
let driverLevel: DriverLevel = "intermediate";
/** Niveau épinglé par `setDriverLevel` → l'auto-calibration ne le touche plus. */
let driverLevelPinned = false;
/** Réf *macro* ApexPoints du combo (corrigée/enrichie, §4.2) — [] si non couvert. */
let macro: MacroCorner[] = [];
/** Mapping macro → fenêtres de la réf dense (matière des callouts prédictifs P3.3). */
let mappedMacro: MappedMacro[] = [];

// ── Auto-calibration niveau pilote (ohne_speed, §7, P3.2) ─────────────────────
/** Benchmarks ohne_speed (best-effort, cache module) — tours alien par combo. */
let benchmarks: PaceBenchmark[] | null = null;
/** Circuit courant (nom brut live) pour résoudre le benchmark. */
let comboTrack = "";
/** Classe ohne_speed du combo courant, ou `null` si non mappable. */
let comboOhneClass: string | null = null;
/** Tour alien (ms) du combo, résolu paresseusement ; 0 tant qu'indisponible. */
let comboAlienMs = 0;
/** Meilleur tour **propre** (ms) vu sur le combo — base de calibration (§7). */
let bestCleanLapMs = Infinity;

/** Réf **courte** : médiane glissante par virage des passages propres (§3.3, P3.2). */
let shortRef: ShortRefState = createShortRefState();

function dispatch(events: CoachEvent[], frame: CoachFrame): void {
  for (const ev of events) {
    if (ev.type === "combo-changed") {
      diag = createDiagState(); // nouvel combo → nouveaux anneaux σ
      voice = createCoachVoiceState(); // …et nouvelle file de délivrance
      shortRef = createShortRefState(); // …et nouvelle réf courte (conditions du combo)
      // Nouveau combo → nouvelle cible alien : on repart sur le défaut et on
      // re-calibrera dès le premier tour propre (§7, P3.2).
      comboTrack = ev.track;
      comboOhneClass = liveClassToOhne(frame.carClass);
      comboAlienMs = 0;
      bestCleanLapMs = Infinity;
      if (!driverLevelPinned) driverLevel = "intermediate";
      // Réf macro ApexPoints (§4.2) : résolue dès le combo (indépendante de la
      // réf dense). Le mapping sur les fenêtres est (re)fait à la charge de réf.
      macro = macroForCombo({ track: ev.track, carClass: frame.carClass });
      mappedMacro = mapMacroToWindows(macro, state.windows);
      loadRefFor(ev.track, ev.carModel);
    } else if (ev.type === "lap-completed") {
      maybeCaptureRef(ev.lap);
      calibrateFromLap(ev.lap);
    } else if (ev.type === "corner-passed") runDiagnostic(ev.measurement, frame);
    for (const l of listeners) l(ev, state);
  }
}

/**
 * Applique le moteur de diagnostic (§5/§6/§7), relaie le verdict et pilote la
 * pédagogie (§1.3-1.5) + les modes (§8) via `observeCorner` : **chaque** clôture de
 * virage (fautive, propre ou muette) alimente le focus collant / le dégressif / le
 * renforcement positif. Le message éventuel attend ensuite sa fenêtre (§1/§9).
 */
function runDiagnostic(measurement: CornerMeasurement, frame: CoachFrame): void {
  const refMaps = parseRefMaps(state.ref?.meta_json);
  // Péremption de la réf dense (§3.3) : conditions courantes vs conditions de la réf.
  // Périmée → cible = réf courte (deltas relatifs « que d'habitude »).
  const refMode = currentRefMode(frame);
  // Réf courte du virage (médiane des passages **antérieurs** : on la lit avant de
  // pousser le passage courant, pour comparer à l'habitude et non à soi-même).
  const short = shortRefTargets(shortRef, measurement.corner_uid) ?? undefined;
  const result = diagnoseCorner(measurement, diag, {
    level: driverLevel,
    calibrationLaps: state.validLaps,
    refTcMap: refMaps.tc,
    refAbsMap: refMaps.abs,
    refMode,
    shortRef: short,
  });
  // Le passage courant nourrit l'habitude pour les virages suivants (§3.3).
  updateShortRef(shortRef, measurement);
  const policy = policyFor(modeFromSession(frame.sessionNum, state.ref !== null));
  observeCorner(
    voice,
    {
      corner_uid: measurement.corner_uid,
      n: measurement.n,
      lapNum: measurement.lapNum,
      dtVsRef: measurement.dtVsRef,
    },
    result,
    frame.elapsed,
    policy,
  );
  for (const l of diagListeners) l(result, state);
}

/** Conditions comparables d'une réf dense (méta + build + kind) pour la péremption. */
function refConditions(ref: CoachRef): RefConditions {
  let m: {
    trackTemp?: number;
    wetness?: number;
    compoundF?: string;
    compoundR?: string;
  } = {};
  try {
    m = JSON.parse(ref.meta_json) as typeof m;
  } catch {
    /* méta illisible → conditions neutres (pas de fausse péremption) */
  }
  return {
    gameBuild: ref.game_build ?? "",
    trackTemp: typeof m.trackTemp === "number" ? m.trackTemp : 0,
    wetness: typeof m.wetness === "number" ? m.wetness : 0,
    compoundF: typeof m.compoundF === "string" ? m.compoundF : "",
    compoundR: typeof m.compoundR === "string" ? m.compoundR : "",
  };
}

/** Conditions courantes (dernier instantané live) pour la comparaison de péremption. */
function liveConditions(frame: CoachFrame): RefConditions {
  const meta = lastData ? captureMetaFromLive(lastData, frame) : null;
  return {
    gameBuild: frame.gameBuild,
    trackTemp: meta?.trackTemp ?? 0,
    wetness: meta?.wetness ?? 0,
    compoundF: meta?.compoundF ?? "",
    compoundR: meta?.compoundR ?? "",
  };
}

/** Mode de la réf dense courante (§3.3) : `fresh` par défaut, `indicative` si périmée. */
function currentRefMode(frame: CoachFrame): RefMode {
  const ref = state.ref;
  if (!ref) return "fresh"; // sans réf, le diag renvoie déjà `muted: no-ref`
  return refFreshness(refConditions(ref), liveConditions(frame), ref.kind).mode;
}

/**
 * Auto-calibration du niveau pilote (§7, P3.2) à la clôture d'un tour **éligible** :
 * met à jour le meilleur tour propre puis re-situe le pilote vs le tour alien.
 */
function calibrateFromLap(lap: CompletedLap): void {
  if (driverLevelPinned) return;
  if (!lap.eligibility.eligible || lap.lapTime <= 0) return;
  const ms = lap.lapTime * 1000; // `lapTime` en secondes → ms (échelle ohne_speed)
  if (ms >= bestCleanLapMs) return;
  bestCleanLapMs = ms;
  recalibrateLevel();
}

/** Résout le tour alien (paresseux) puis fixe le niveau pilote depuis le best propre. */
function recalibrateLevel(): void {
  if (driverLevelPinned || bestCleanLapMs === Infinity) return;
  if (comboAlienMs <= 0) {
    if (!benchmarks || !comboTrack || !comboOhneClass) return;
    const bm = findBenchmark(benchmarks, comboTrack, comboOhneClass);
    comboAlienMs = bm?.racePaceMs.alien ?? 0;
    if (comboAlienMs <= 0) return;
  }
  const lvl = calibrateDriverLevel(bestCleanLapMs, comboAlienMs);
  if (lvl) driverLevel = lvl;
}

/** Extrait les maps TC/ABS des métadonnées de réf (péremption des verdicts §6). */
function parseRefMaps(metaJson: string | undefined): { tc?: number; abs?: number } {
  if (!metaJson) return {};
  try {
    const m = JSON.parse(metaJson) as { tcMap?: number; absMap?: number };
    return { tc: m.tcMap, abs: m.absMap };
  } catch {
    return {};
  }
}

async function loadRefFor(track: string, carModel: string): Promise<void> {
  const combo = `${track}::${carModel}`;
  loadingCombo = combo;
  try {
    const ref = await coachRef.load(track, carModel);
    // Le combo peut avoir changé pendant la charge → on ignore les réponses périmées.
    if (state.combo === combo && loadingCombo === combo) {
      setCoachRef(state, ref);
      // Réaligne la réf macro sur les fenêtres fraîchement projetées (§4.2).
      mappedMacro = mapMacroToWindows(macro, state.windows);
    }
  } catch {
    /* pas de réf → mode sans référence (découverte) */
  }
}

/**
 * Enregistre le tour comme réf s'il est éligible (§3.2) et bat la meilleure réf
 * connue. Purge côté backend (3/combo). Recharge ensuite la réf pour aligner les
 * fenêtres du moteur sur la nouvelle capture.
 */
async function maybeCaptureRef(lap: CompletedLap): Promise<void> {
  if (!lap.eligibility.eligible || lap.lapTime <= 0) return;
  if (lap.lapTime >= sessionBestSaved) return;
  // Ne remplace une réf existante que si on est plus rapide (ou si elle est périmée).
  const ref = state.ref;
  if (ref && ref.kind !== "stale" && lap.lapTime >= ref.lap_time) return;
  const data = lastData;
  if (!data) return;
  const frame = frameFromLive(data);
  if (!frame) return;

  const payload = buildRefPayload(lap, captureMetaFromLive(data, frame));
  if (!payload) return;

  sessionBestSaved = lap.lapTime;
  const combo = state.combo;
  try {
    const id = await coachRef.save(payload);
    // Recharge pour réaligner les fenêtres, sauf si le combo a changé entre-temps.
    if (state.combo === combo) {
      loadRefFor(payload.track, payload.car_model);
      for (const l of refListeners) l(lap.lapTime, id);
    }
  } catch {
    // Échec d'enregistrement → on autorise une nouvelle tentative au prochain best.
    sessionBestSaved = Infinity;
  }
}

function onLive(data: LiveData): void {
  lastData = data;
  const frame = frameFromLive(data);
  if (!frame) return;
  const { events } = stepCoach(state, frame);
  if (events.length) dispatch(events, frame);
  // Fenêtre de délivrance (§1) : évaluée **après** le pas moteur, `state.nextWin`
  // pointe alors le prochain virage à venir (borne de la fenêtre calme).
  const msg = stepCoachVoice(voice, frame, state.windows, state.nextWin);
  if (msg) for (const l of speakListeners) l(msg, state);
}

/** Démarre le service (idempotent). */
export async function startCoachService(): Promise<void> {
  if (started) return;
  started = true;
  state = createCoachState();
  diag = createDiagState();
  voice = createCoachVoiceState();
  shortRef = createShortRefState();
  sessionBestSaved = Infinity;
  lastData = null;
  macro = [];
  mappedMacro = [];
  comboTrack = "";
  comboOhneClass = null;
  comboAlienMs = 0;
  bestCleanLapMs = Infinity;
  if (!driverLevelPinned) driverLevel = "intermediate";
  // Benchmarks ohne_speed (best-effort) pour l'auto-calibration §7 — sans bloquer.
  void fetchBenchmarks()
    .then((b) => {
      benchmarks = b;
      recalibrateLevel(); // au cas où un best propre serait déjà arrivé
    })
    .catch(() => {
      /* hors-ligne / parsing → on garde le niveau par défaut */
    });
  unlisten = await live.onData(onLive);
}

/** Arrête le service et libère l'abonnement. */
export function stopCoachService(): void {
  started = false;
  if (unlisten) {
    unlisten();
    unlisten = null;
  }
  state = createCoachState();
  diag = createDiagState();
  voice = createCoachVoiceState();
  shortRef = createShortRefState();
  loadingCombo = "";
  lastData = null;
  sessionBestSaved = Infinity;
  macro = [];
  mappedMacro = [];
  comboTrack = "";
  comboOhneClass = null;
  comboAlienMs = 0;
  bestCleanLapMs = Infinity;
}

/** Abonne un auditeur aux événements du coach ; renvoie le désabonnement. */
export function onCoachEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Abonne un auditeur aux réfs capturées (P1.3) ; renvoie le désabonnement. */
export function onRefCaptured(listener: RefListener): () => void {
  refListeners.add(listener);
  return () => refListeners.delete(listener);
}

/** Abonne un auditeur aux diagnostics par virage (P2.1) ; renvoie le désabonnement. */
export function onDiagnostic(listener: DiagListener): () => void {
  diagListeners.add(listener);
  return () => diagListeners.delete(listener);
}

/**
 * Abonne un auditeur aux **messages vocaux prêts à délivrer** (P2.2) : un
 * diagnostic qui a franchi sa fenêtre de délivrance (§1) et l'anti-spam (§9).
 * L'appelant formate via `t(live.<suffix>, vars)` et prononce (`speak`, priorité
 * `coach`). Renvoie le désabonnement.
 */
export function onCoachSpeak(listener: SpeakListener): () => void {
  speakListeners.add(listener);
  return () => speakListeners.delete(listener);
}

/**
 * Fixe le niveau pilote **manuellement** et **épingle** le réglage : l'auto-calibration
 * ohne_speed (§7) ne le modifie plus jusqu'au prochain `start`/`stop`. Défaut : niveau
 * auto-calibré (`intermediate` tant qu'aucun tour propre n'a été mesuré).
 */
export function setDriverLevel(level: DriverLevel): void {
  driverLevel = level;
  driverLevelPinned = true;
}

/** Niveau pilote courant (auto-calibré ou épinglé) — lecture seule (debug/UI). */
export function coachDriverLevel(): DriverLevel {
  return driverLevel;
}

/** Réf *macro* ApexPoints du combo courant (corrigée/enrichie, §4.2) ; [] si non couvert. */
export function coachMacro(): MacroCorner[] {
  return macro;
}

/** Mapping macro → fenêtres de la réf dense (matière des callouts prédictifs, P3.3). */
export function coachMappedMacro(): MappedMacro[] {
  return mappedMacro;
}

/** État courant du moteur (lecture seule ; pour debug/inspection). */
export function coachState(): CoachEngineState {
  return state;
}
