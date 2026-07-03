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

import { live, coachRef, type LiveData } from "@/lib/api";
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
/** Niveau pilote (surchargeable ; auto-calibration = P3.2). */
let driverLevel: DriverLevel = "intermediate";
/** Réf *macro* ApexPoints du combo (corrigée/enrichie, §4.2) — [] si non couvert. */
let macro: MacroCorner[] = [];
/** Mapping macro → fenêtres de la réf dense (matière des callouts prédictifs P3.3). */
let mappedMacro: MappedMacro[] = [];

function dispatch(events: CoachEvent[], frame: CoachFrame): void {
  for (const ev of events) {
    if (ev.type === "combo-changed") {
      diag = createDiagState(); // nouvel combo → nouveaux anneaux σ
      voice = createCoachVoiceState(); // …et nouvelle file de délivrance
      // Réf macro ApexPoints (§4.2) : résolue dès le combo (indépendante de la
      // réf dense). Le mapping sur les fenêtres est (re)fait à la charge de réf.
      macro = macroForCombo({ track: ev.track, carClass: frame.carClass });
      mappedMacro = mapMacroToWindows(macro, state.windows);
      loadRefFor(ev.track, ev.carModel);
    } else if (ev.type === "lap-completed") maybeCaptureRef(ev.lap);
    else if (ev.type === "corner-passed") runDiagnostic(ev.measurement, frame);
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
  const result = diagnoseCorner(measurement, diag, {
    level: driverLevel,
    calibrationLaps: state.validLaps,
    refTcMap: refMaps.tc,
    refAbsMap: refMaps.abs,
  });
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
  sessionBestSaved = Infinity;
  lastData = null;
  macro = [];
  mappedMacro = [];
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
  loadingCombo = "";
  lastData = null;
  sessionBestSaved = Infinity;
  macro = [];
  mappedMacro = [];
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

/** Fixe le niveau pilote (défaut `intermediate` ; auto-calibration P3.2). */
export function setDriverLevel(level: DriverLevel): void {
  driverLevel = level;
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
