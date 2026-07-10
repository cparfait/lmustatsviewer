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
  type DiagCode,
  type CoachDiagnostic,
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
import {
  buildPredictiveTargets,
  createPredictiveState,
  setPredictiveTargets,
  stepPredictive,
  windowsFromDetected,
  type PredictiveState,
  type PredictiveMsg,
  type PredictiveTarget,
} from "./predictive";
import {
  createDrillState,
  setDrillTargets,
  buildDrillPredictTargets,
  recordDrillPass,
  type DrillState,
  type DrillVerdictMsg,
} from "./drill";
import {
  createStintState,
  resetStint,
  recordStintCorner,
  fuelAdvice,
  takeOutLapAdvice,
  type StintState,
  type StintAdvisory,
} from "./stint";
import {
  createRiskState,
  resetRisk,
  noteCorner as noteRiskCorner,
  recordTrackLimit,
  classTargetAdvice,
  type RiskState,
  type RiskAdvisory,
} from "./risk";
import { computeStrategy } from "@/lib/strategy";
import {
  buildPhraseBank,
  resolvePhrase,
  isDiagCode,
  phrasebankRefKey,
  type PhraseBank,
  type PhraseEntry,
} from "./phrasebank";
import { calibrateDriverLevel } from "./calibration";
import {
  createShortRefState,
  shortRefTargets,
  updateShortRef,
  type ShortRefState,
} from "./shortref";
import { refFreshness, type RefConditions, type RefMode } from "./staleness";
import {
  createSessionHistory,
  passFromResult,
  recordPass,
  summarizeSession,
  toHistoryRows,
  totalPasses,
  buildProgression,
  type SessionHistoryState,
  type CornerProgress,
} from "./history";
import {
  buildSessionReport,
  buildRecall,
  pickObjectives,
  nextCapMs,
  type SessionReport,
  type ReportLine,
  type CoachObjective,
} from "./report";
import {
  fetchBenchmarks,
  findBenchmark,
  liveClassToOhne,
  type PaceBenchmark,
} from "@/lib/ohne_speed";
import { formatTime } from "@/lib/utils";
import type { CoachFrame } from "./frame";

type Listener = (event: CoachEvent, state: CoachEngineState) => void;
type RefListener = (lapTime: number, refId: number) => void;
type DiagListener = (result: DiagResult, state: CoachEngineState) => void;
type SpeakListener = (msg: CoachVoiceMsg, state: CoachEngineState) => void;
type PredictListener = (msg: PredictiveMsg) => void;
type PredictTargetsListener = (targets: PredictiveTarget[]) => void;
type ReportListener = (report: SessionReport) => void;
type RecallListener = (line: ReportLine) => void;
type DrillVerdictListener = (msg: DrillVerdictMsg) => void;
type StintListener = (adv: StintAdvisory) => void;
type RiskListener = (adv: RiskAdvisory) => void;

let state: CoachEngineState = createCoachState();
let unlisten: (() => void) | null = null;
let started = false;
const listeners = new Set<Listener>();
const refListeners = new Set<RefListener>();
const diagListeners = new Set<DiagListener>();
const speakListeners = new Set<SpeakListener>();
const predictListeners = new Set<PredictListener>();
const predictTargetsListeners = new Set<PredictTargetsListener>();
const reportListeners = new Set<ReportListener>();
const recallListeners = new Set<RecallListener>();
const drillVerdictListeners = new Set<DrillVerdictListener>();
const stintListeners = new Set<StintListener>();
const riskListeners = new Set<RiskListener>();
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

/** État des callouts prédictifs Découverte (cibles + fade, §8, P3.3). */
let predict: PredictiveState = createPredictiveState();

// ── Mode Drill (§8/§11, P4.2) ─────────────────────────────────────────────────
/** Drill actif ? (activé par la Config via le hook — corners = objectifs auto). */
let drillActive = false;
/** Compteurs par virage travaillé (§8). */
let drill: DrillState = createDrillState();
/** Ordonnanceur des callouts « ton virage » (réutilise `stepPredictive`, sans fade). */
let drillPredict: PredictiveState = createPredictiveState();

// ── Coaching de stint (§12 P2, P5.3) ──────────────────────────────────────────
/** Coaching de stint actif ? (interrupteur Config via le hook). */
let stintActive = false;
/** État du relais courant (dérive `vmin`/virage + cooldown lift & coast). */
let stint: StintState = createStintState();

// ── Coaching du risque + cible de classe (§12 P3, P5.4) ───────────────────────
/** Coaching du risque actif ? (interrupteur Config via le hook). */
let riskActive = false;
/** État risque (coupures/virage + cooldown cible de classe). */
let risk: RiskState = createRiskState();

// ── Boucle d'apprentissage (§11, P4.1) ────────────────────────────────────────
/** Modèle de voiture du combo courant (clé combo avec `comboTrack`, pour l'historique). */
let comboCarModel = "";
/** Passages propres accumulés sur la session (résumés au débrief → `corner_history`). */
let hist: SessionHistoryState = createSessionHistory();
/** Progression chargée du combo (sessions **passées**) — base du rapport/rappel. */
let progression: CornerProgress[] = [];
/** Objectifs structurés déduits des faiblesses chroniques (§11) — lecture UI. */
let objectives: CoachObjective[] = [];
/** Rappel inter-sessions en attente (chargé) — délivré au 1ᵉʳ virage du combo. */
let recallLine: ReportLine | null = null;
/** Rappel déjà délivré sur ce combo (une fois par combo, §11). */
let recallDone = false;
/** État `inPits` de la trame précédente (détection du front d'entrée aux stands). */
let lastInPits = false;
/** Passages minimaux accumulés pour déclencher un débrief au retour stand. */
const MIN_REPORT_PASSES = 6;

// ── Banque de phrases LLM à slots (§10, P4.3) ─────────────────────────────────
/** Banque de formulation du combo × langue (injectée par le hook), ou `null`. */
let phraseBank: PhraseBank | null = null;
/** Classe (brute live) du combo courant — sert la clé d'invalidation (§10). */
let comboCarClass = "";
/** `corner_uid` → n° de virage **macro** (ApexPoints) — cible des variantes par virage. */
let uidToMacroN = new Map<string, number>();

// ── « Pourquoi ? » vocal (§12, P4.3) ──────────────────────────────────────────
/** Un diagnostic récent (matière du « pourquoi ? » — les N derniers corner-passed). */
export interface RecentDiag {
  n: number;
  code: DiagCode;
  magnitude: number;
  unit: CoachDiagnostic["unit"];
  sign: number;
  lapNum: number;
}
/** Anneau des derniers diagnostics émis (injectés au contexte du « pourquoi ? »). */
let recentDiags: RecentDiag[] = [];
/** Taille de l'anneau des diagnostics récents (§12). */
const RECENT_DIAG_MAX = 6;

/** (Re)construit la table `corner_uid → n° macro` depuis le mapping ApexPoints (§4.2). */
function rebuildUidToMacroN(): void {
  const next = new Map<string, number>();
  for (const m of mappedMacro) {
    if (m.corner_uid) next.set(m.corner_uid, m.corner.parsed.start);
  }
  uidToMacroN = next;
}

function dispatch(events: CoachEvent[], frame: CoachFrame): void {
  for (const ev of events) {
    if (ev.type === "combo-changed") {
      // On quitte l'ancien combo → persiste sa session (sans débrief vocal, on
      // n'est plus dessus) avant de tout réinitialiser (§11, P4.1).
      flushSession(comboTrack, comboCarModel, false);
      diag = createDiagState(); // nouvel combo → nouveaux anneaux σ
      voice = createCoachVoiceState(); // …et nouvelle file de délivrance
      shortRef = createShortRefState(); // …et nouvelle réf courte (conditions du combo)
      predict = createPredictiveState(); // …et nouvelles cibles prédictives (§8)
      drill = createDrillState(); // …et nouveaux compteurs de drill (§8, P4.2)
      drillPredict = createPredictiveState(); // …et nouvelles cibles « ton virage »
      resetStint(stint); // …et nouveau relais (dérive `vmin`/virage, §12, P5.3)
      resetRisk(risk); // …et remise à zéro du risque/cible de classe (§12, P5.4)
      // Nouveau combo → nouvelle cible alien : on repart sur le défaut et on
      // re-calibrera dès le premier tour propre (§7, P3.2).
      comboTrack = ev.track;
      comboCarModel = ev.carModel;
      comboCarClass = frame.carClass;
      comboOhneClass = liveClassToOhne(frame.carClass);
      comboAlienMs = 0;
      // Banque de phrases (§10) + diagnostics récents (§12) : neufs par combo. Le
      // hook (I/O) rechargera/régénérera la banque du nouveau combo si le mode est actif.
      phraseBank = null;
      recentDiags = [];
      bestCleanLapMs = Infinity;
      if (!driverLevelPinned) driverLevel = "intermediate";
      // Apprentissage (§11) : session neuve + charge de l'historique du combo
      // (progression/objectifs/rappel) — le rappel attend le 1ᵉʳ virage.
      progression = [];
      objectives = [];
      recallLine = null;
      recallDone = false;
      loadHistoryFor(ev.track, ev.carModel);
      // Réf macro ApexPoints (§4.2) : résolue dès le combo (indépendante de la
      // réf dense). Le mapping sur les fenêtres est (re)fait à la charge de réf.
      macro = macroForCombo({ track: ev.track, carClass: frame.carClass });
      mappedMacro = mapMacroToWindows(macro, state.windows);
      rebuildUidToMacroN();
      loadRefFor(ev.track, ev.carModel);
    } else if (ev.type === "lap-completed") {
      maybeCaptureRef(ev.lap);
      calibrateFromLap(ev.lap);
      refreshPredictiveTargets(ev.lap);
      // Cible de classe (§12, P5.4) : à la clôture d'un tour, compare tes meilleurs
      // secteurs au meilleur de ta classe présent en session (standings).
      if (riskActive) {
        const me = lastData?.player;
        if (me) {
          const adv = classTargetAdvice(risk, {
            playerBest: me.best_sectors,
            classBest: classBestSectors(),
            lapNum: frame.lapNum,
          });
          if (adv) for (const l of riskListeners) l(adv);
        }
      }
      maybeEmitRecall();
    } else if (ev.type === "corner-passed") {
      runDiagnostic(ev.measurement, frame);
      // Coaching de stint (§12, P5.3) : dérive de la vitesse de passage au fil du
      // relais (une alerte par virage et par stint). Canal indépendant du nominal.
      if (stintActive) {
        const adv = recordStintCorner(stint, ev.measurement);
        if (adv) for (const l of stintListeners) l(adv);
      }
      // Risque (§12, P5.4) : mémorise le dernier virage franchi pour attribuer les
      // coupures de piste suivantes (elles surviennent en sortie de virage).
      if (riskActive) noteRiskCorner(risk, ev.measurement);
      maybeEmitRecall();
    }
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
  // « Pourquoi ? » (§12) : mémorise les derniers diagnostics chiffrés pour les
  // injecter au contexte live si le pilote demande une explication vocale (Alt+C).
  if (result.kind === "diagnostic") {
    const d = result.diag;
    recentDiags.push({
      n: d.n,
      code: d.code,
      magnitude: d.magnitude,
      unit: d.unit,
      sign: d.sign,
      lapNum: d.lapNum,
    });
    if (recentDiags.length > RECENT_DIAG_MAX) recentDiags.shift();
  }
  if (drillActive) {
    // Mode Drill (§8) : verdict à **chaque** passage sur un virage travaillé,
    // silence ailleurs. Court-circuite la pédagogie nominale (focus/dégressif) —
    // le drill a sa propre cadence (feedback systématique + compteur).
    const verdict = recordDrillPass(drill, measurement, result);
    if (verdict) for (const l of drillVerdictListeners) l(verdict);
  } else {
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
  }
  // Progression inter-sessions (§11, P4.1) : accumule les passages propres mesurés
  // (réf présente, non muet) pour le résumé de session au débrief.
  const pass = passFromResult(measurement, result);
  if (pass) recordPass(hist, pass);
  for (const l of diagListeners) l(result, state);
}

/**
 * (Re)construit les cibles prédictives Découverte (§8, P3.3) à la clôture d'un
 * tour. Réservé à la **Découverte pure** (pas de réf dense → mode `discovery`) :
 * les fenêtres viennent des virages **auto-détectés** du tour (pas de coordonnée
 * piste dans ApexPoints §3.3). On ne remplace que par une géométrie **plus
 * complète** (plus de virages détectés) pour éviter qu'un tour partiel dégrade des
 * cibles déjà bonnes. À chaque (re)construction, on notifie les abonnés pour la
 * **pré-synthèse TTS** (le hook localise puis `prewarmSpeech`).
 */
function refreshPredictiveTargets(lap: CompletedLap): void {
  if (state.ref !== null) return; // réf présente → pas de mode Découverte (§8)
  if (macro.length === 0) return; // circuit non couvert par ApexPoints
  const corners = lap.corners;
  if (corners.length === 0 || corners.length <= predict.builtFromCount) return;
  const windows = windowsFromDetected(corners, state.knownApex);
  const mapped = mapMacroToWindows(macro, windows);
  const targets = buildPredictiveTargets(mapped, windows);
  if (targets.length === 0) return;
  setPredictiveTargets(predict, targets, corners.length);
  for (const l of predictTargetsListeners) l(targets);
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

// ── Boucle d'apprentissage (§11, P4.1) ────────────────────────────────────────

/**
 * Charge l'historique par virage du combo (best-effort) et en tire la progression,
 * les objectifs structurés et le rappel inter-sessions. Le rappel n'est **pas**
 * délivré ici (on peut être en garage) mais mémorisé pour le 1ᵉʳ virage roulé.
 */
async function loadHistoryFor(track: string, carModel: string): Promise<void> {
  const combo = `${track}::${carModel}`;
  try {
    const rows = await coachRef.historyLoad(track, carModel);
    if (state.combo !== combo) return; // combo changé pendant la charge → périmé
    progression = buildProgression(rows);
    objectives = pickObjectives(progression);
    recallLine = buildRecall(progression);
    if (drillActive) applyDrillTargets(); // Drill = objectifs auto (§11)
  } catch {
    /* pas d'historique → rien à rappeler (nouveau combo) */
  }
}

// ── Mode Drill (§8/§11, P4.2) ─────────────────────────────────────────────────

/**
 * Fixe les virages travaillés depuis les **objectifs** chroniques du combo (§11 :
 * « le coach propose ») — les 1-2 faiblesses les plus fortes déjà calculées à la
 * charge de l'historique. Recalcule ensuite les cibles prédictives « ton virage ».
 */
function applyDrillTargets(): void {
  setDrillTargets(
    drill,
    objectives.map((o) => ({ corner_uid: o.corner_uid, n: o.n })),
  );
  refreshDrillPredict();
}

/**
 * (Re)pose les cibles prédictives « ton virage » (§8) : chaque virage travaillé
 * apparié à sa fenêtre dense. Sans fade (feedback à chaque tour). Notifie les
 * abonnés pour la **pré-synthèse TTS** (réutilise le canal Découverte).
 */
function refreshDrillPredict(): void {
  if (!drillActive) return;
  const targets = buildDrillPredictTargets(drill.targets, state.windows);
  setPredictiveTargets(drillPredict, targets, drill.targets.length);
  if (targets.length) for (const l of predictTargetsListeners) l(targets);
}

/** Délivre le rappel inter-sessions une seule fois, au 1ᵉʳ virage/tour du combo. */
function maybeEmitRecall(): void {
  if (recallDone || !recallLine) return;
  recallDone = true;
  const line = recallLine;
  for (const l of recallListeners) l(line);
}

/** Benchmark ohne_speed du combo courant (best-effort) — cap chiffré du rapport. */
function comboBenchmark(): PaceBenchmark | null {
  if (!benchmarks || !comboTrack || !comboOhneClass) return null;
  return findBenchmark(benchmarks, comboTrack, comboOhneClass) ?? null;
}

/** Prochain cap ohne_speed (formaté `m:ss.mmm`) sous le meilleur tour, ou `null`. */
function computeCapTime(): string | null {
  if (bestCleanLapMs === Infinity) return null;
  const bm = comboBenchmark();
  if (!bm) return null;
  const r = bm.racePaceMs;
  const tiers = [
    r.alien,
    r.competitive,
    r.good,
    r.pct103,
    r.midpack,
    r.pct105,
    r.tailEnder,
    r.offline,
  ];
  const capMs = nextCapMs(bestCleanLapMs, tiers);
  return capMs ? formatTime(capMs / 1000) : null;
}

/**
 * Débrief de session (§11) : résume les passages accumulés, les **persiste** dans
 * `corner_history` (best-effort), et — si `speak` — émet le rapport « 1+1+1 »
 * (progrès / chantier / cap). L'accumulateur est **toujours** vidé (une session =
 * un débrief), même si rien n'est persisté (session trop courte).
 */
function flushSession(track: string, carModel: string, speak: boolean): void {
  const stats = summarizeSession(hist);
  hist = createSessionHistory();
  if (stats.length === 0 || !track || !carModel) return;
  void coachRef.historyUpsert(track, carModel, toHistoryRows(stats)).catch(() => {
    /* écriture best-effort ; l'absence d'historique dégrade juste le rappel suivant */
  });
  if (!speak) return;
  const report = buildSessionReport(stats, progression, computeCapTime());
  if (report.lines.length) for (const l of reportListeners) l(report);
}

/**
 * Meilleurs secteurs (s) des **rivaux de la même classe** présents en session
 * (§12, P5.4) : minimum positif de `last_sN` parmi les standings de la classe du
 * joueur (hors joueur). `null` par secteur si aucun rival n'a de temps.
 */
function classBestSectors(): (number | null)[] {
  const data = lastData;
  const out: (number | null)[] = [null, null, null];
  if (!data) return out;
  const myClass = data.standings.find((s) => s.is_player)?.vehicle_class ?? "";
  for (const s of data.standings) {
    if (s.is_player || s.vehicle_class !== myClass) continue;
    const secs = [s.last_s1, s.last_s2, s.last_s3];
    for (let i = 0; i < 3; i++) {
      if (secs[i] > 0 && (out[i] == null || secs[i] < (out[i] as number))) out[i] = secs[i];
    }
  }
  return out;
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
      rebuildUidToMacroN(); // les variantes par virage (§10) suivent le nouveau mapping
      // Drill (§8, P4.2) : les cibles « ton virage » s'ancrent aux nouvelles fenêtres.
      refreshDrillPredict();
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

  // Débrief de relais (§11, P4.1) : sur le **front** d'entrée aux stands, si assez
  // de passages ont été accumulés, résume + persiste + délivre le rapport « 1+1+1 ».
  if (frame.inPits && !lastInPits && totalPasses(hist) >= MIN_REPORT_PASSES) {
    flushSession(comboTrack, comboCarModel, true);
  }
  // Nouveau relais au **front de sortie** des stands (§12, P5.3) : la dérive `vmin`
  // se juge par rapport au début de ce relais, et un conseil out-lap est armé.
  if (stintActive && lastInPits && !frame.inPits) {
    resetStint(stint, { outLap: true });
  }
  lastInPits = frame.inPits;

  // Coaching de stint (§12, P5.3) : prudence out-lap (pneus froids) puis lift & coast
  // si le carburant est juste, délivré sur une fenêtre haute charge (fin de ligne
  // droite). Hors chemin critique — canal `coach` distinct du diagnostic par virage.
  if (stintActive && !frame.inPits) {
    const out = takeOutLapAdvice(stint);
    if (out) for (const l of stintListeners) l(out);
    const strat = lastData
      ? computeStrategy(lastData.session, lastData.player, lastData.telemetry)
      : null;
    const fuelShort = !!strat && strat.fuelToAdd != null && strat.fuelToAdd > 0.05;
    const fuel = fuelAdvice(stint, {
      fuelShort,
      lapNum: frame.lapNum,
      onThrottle: frame.throttle > 90,
    });
    if (fuel) for (const l of stintListeners) l(fuel);
  }

  // Coaching du risque (§12, P5.4) : coupures de piste répétées sur un même virage
  // → « pas rentable ». Compteur cumulé lu à chaque trame, attribué au dernier virage.
  if (riskActive) {
    const adv = recordTrackLimit(risk, frame.trackLimits);
    if (adv) for (const l of riskListeners) l(adv);
  }
  // Fenêtre de délivrance (§1) : évaluée **après** le pas moteur, `state.nextWin`
  // pointe alors le prochain virage à venir (borne de la fenêtre calme).
  const msg = stepCoachVoice(voice, frame, state.windows, state.nextWin);
  if (msg) for (const l of speakListeners) l(msg, state);

  // Callouts prédictifs Découverte (§8, P3.3) : uniquement sans réf joueur **et**
  // hors Drill. Jamais de prédictif permanent quand une réf existe (dépendance §8)
  // → gate `ref === null` (= mode `discovery`, seul mode qui porte `predictive`).
  if (!drillActive && state.ref === null && policyFor(modeFromSession(frame.sessionNum, false)).predictive) {
    const pmsg = stepPredictive(predict, frame);
    if (pmsg) for (const l of predictListeners) l(pmsg);
  }

  // Callouts prédictifs Drill (§8, P4.2) : « ton virage » avant chaque virage
  // travaillé, à **chaque** tour (sans fade). Fonctionne avec réf présente.
  if (drillActive && drillPredict.targets.length) {
    const dmsg = stepPredictive(drillPredict, frame, Infinity);
    if (dmsg) for (const l of predictListeners) l(dmsg);
  }
}

/** Démarre le service (idempotent). */
export async function startCoachService(): Promise<void> {
  if (started) return;
  started = true;
  state = createCoachState();
  diag = createDiagState();
  voice = createCoachVoiceState();
  shortRef = createShortRefState();
  predict = createPredictiveState();
  drill = createDrillState();
  drillPredict = createPredictiveState();
  stint = createStintState();
  risk = createRiskState();
  hist = createSessionHistory();
  progression = [];
  objectives = [];
  recallLine = null;
  recallDone = false;
  lastInPits = false;
  sessionBestSaved = Infinity;
  lastData = null;
  macro = [];
  mappedMacro = [];
  comboTrack = "";
  comboCarModel = "";
  comboCarClass = "";
  comboOhneClass = null;
  comboAlienMs = 0;
  bestCleanLapMs = Infinity;
  phraseBank = null;
  recentDiags = [];
  uidToMacroN = new Map();
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
  // Persiste la session en cours (sans débrief vocal — on ferme) pour ne pas
  // perdre la progression accumulée (§11, P4.1).
  flushSession(comboTrack, comboCarModel, false);
  state = createCoachState();
  diag = createDiagState();
  voice = createCoachVoiceState();
  shortRef = createShortRefState();
  predict = createPredictiveState();
  drill = createDrillState();
  drillPredict = createPredictiveState();
  stint = createStintState();
  risk = createRiskState();
  hist = createSessionHistory();
  progression = [];
  objectives = [];
  recallLine = null;
  recallDone = false;
  lastInPits = false;
  loadingCombo = "";
  lastData = null;
  sessionBestSaved = Infinity;
  macro = [];
  mappedMacro = [];
  comboTrack = "";
  comboCarModel = "";
  comboCarClass = "";
  comboOhneClass = null;
  comboAlienMs = 0;
  bestCleanLapMs = Infinity;
  phraseBank = null;
  recentDiags = [];
  uidToMacroN = new Map();
}

/** Abonne un auditeur aux événements du coach ; renvoie le désabonnement. */
export function onCoachEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
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
 * Abonne un auditeur aux **callouts prédictifs** (§8, P3.3) : un repère ApexPoints
 * déclenché avant le point de freinage (mode Découverte). L'appelant formate via
 * `t(live.<suffix>, vars)` et prononce (`speak`, priorité `coach`). Renvoie le
 * désabonnement.
 */
export function onCoachPredict(listener: PredictListener): () => void {
  predictListeners.add(listener);
  return () => predictListeners.delete(listener);
}

/**
 * Abonne un auditeur au (re)calcul des **cibles prédictives** d'un combo (§8,
 * P3.3) : l'appelant localise les textes fixes et les **pré-synthétise**
 * (`prewarmSpeech`) pour une lecture sans latence. Renvoie le désabonnement.
 */
export function onPredictTargets(listener: PredictTargetsListener): () => void {
  predictTargetsListeners.add(listener);
  return () => predictTargetsListeners.delete(listener);
}

/**
 * Abonne un auditeur au **rapport de fin de session « 1+1+1 »** (§11, P4.1) émis au
 * débrief de relais (retour aux stands). L'appelant localise chaque ligne
 * (`t(live.<suffix>, vars)`), les prononce (priorité `coach`) et miroir widget.
 */
export function onCoachReport(listener: ReportListener): () => void {
  reportListeners.add(listener);
  return () => reportListeners.delete(listener);
}

/**
 * Abonne un auditeur au **rappel inter-sessions** (§11, P4.1) : le chantier du
 * dernier passage sur le combo, délivré une fois au 1ᵉʳ virage roulé.
 */
export function onCoachRecall(listener: RecallListener): () => void {
  recallListeners.add(listener);
  return () => recallListeners.delete(listener);
}

/**
 * Abonne un auditeur aux **verdicts de drill** (§8, P4.2) : le retour à chaque
 * passage sur un virage travaillé (propre / série / diagnostic chiffré). L'appelant
 * localise (`t(live.<suffix>, vars)`), prononce (priorité `coach`) et miroir widget.
 */
export function onCoachDrillVerdict(listener: DrillVerdictListener): () => void {
  drillVerdictListeners.add(listener);
  return () => drillVerdictListeners.delete(listener);
}

/**
 * Abonne un auditeur aux **conseils de stint** (§12, P5.3) : dérive de la vitesse
 * de passage (pneus qui fatiguent), lift & coast (carburant juste), prudence
 * out-lap. L'appelant localise (`t(live.<suffix>, vars)`), prononce (priorité
 * `coach`) et miroir widget. Renvoie le désabonnement.
 */
export function onCoachStint(listener: StintListener): () => void {
  stintListeners.add(listener);
  return () => stintListeners.delete(listener);
}

/**
 * Abonne un auditeur au **coaching du risque / cible de classe** (§12, P5.4) :
 * coupures de piste répétées (« pas rentable ») et écart de secteur vs le meilleur
 * de ta classe présent en session. L'appelant localise (`t(live.<suffix>, vars)`),
 * prononce (priorité `coach`) et miroir widget. Renvoie le désabonnement.
 */
export function onCoachRisk(listener: RiskListener): () => void {
  riskListeners.add(listener);
  return () => riskListeners.delete(listener);
}

/**
 * Active/désactive le **mode Drill** (§8/§11, P4.2). Les virages travaillés sont
 * les **objectifs** chroniques du combo (§11 « le coach propose ») : à l'activation,
 * on (re)pose les cibles depuis les objectifs déjà chargés ; à la désactivation, on
 * vide les cibles prédictives. Le service reprend alors sa restitution nominale.
 */
export function setDrillMode(active: boolean): void {
  if (drillActive === active) return;
  drillActive = active;
  if (active) {
    applyDrillTargets();
  } else {
    drill = createDrillState();
    drillPredict = createPredictiveState();
  }
}

/**
 * Active/désactive le **coaching de stint** (§12, P5.3). À la désactivation, le
 * relais courant est oublié (aucune alerte de dérive en attente). Canal indépendant
 * du diagnostic par virage et du mode Drill.
 */
export function setStintMode(active: boolean): void {
  if (stintActive === active) return;
  stintActive = active;
  if (!active) stint = createStintState();
}

/**
 * Active/désactive le **coaching du risque / cible de classe** (§12, P5.4). À la
 * désactivation, l'état (coupures/virage, cooldown cible) est remis à zéro.
 */
export function setRiskMode(active: boolean): void {
  if (riskActive === active) return;
  riskActive = active;
  if (!active) risk = createRiskState();
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

// ── Banque de phrases LLM à slots (§10, P4.3) ─────────────────────────────────

/**
 * Combo courant + virages macro (pour le hook qui charge/génère la banque, §10) :
 * clé combo, classe, langue-agnostique. `refKey` sert l'invalidation (§10).
 */
export function coachComboInfo(): {
  track: string;
  carModel: string;
  carClass: string;
  macro: MacroCorner[];
  refKey: string;
} {
  return {
    track: comboTrack,
    carModel: comboCarModel,
    carClass: comboCarClass,
    macro,
    refKey: phrasebankRefKey(comboCarClass, macro.map((c) => c.parsed.start)),
  };
}

/**
 * Injecte la banque de phrases du combo courant (§10) : le hook la charge (SQLite)
 * ou la génère (LLM) puis la pose ici. `null`/`[]` désactive le mode (repli i18n).
 */
export function setCoachPhraseBank(entries: PhraseEntry[] | null): void {
  phraseBank = entries && entries.length ? buildPhraseBank(entries) : null;
}

/**
 * Résout un message coach vers une variante de la banque LLM (§10), slots remplis
 * **en code** (les chiffres ne passent jamais par le modèle). Renvoie `null` si le
 * mode est inactif, si le message n'est pas un diagnostic, ou si aucune variante ne
 * convient → l'appelant retombe sur le gabarit déterministe i18n.
 */
export function resolveCoachPhrase(msg: {
  kind: string;
  corner_uid: string;
  sign: number;
  vars: Record<string, string | number>;
}): string | null {
  if (!phraseBank || !isDiagCode(msg.kind)) return null;
  return resolvePhrase(phraseBank, {
    code: msg.kind,
    sign: msg.sign,
    macroN: uidToMacroN.get(msg.corner_uid) ?? null,
    vars: msg.vars,
  });
}

// ── « Pourquoi ? » vocal (§12, P4.3) ──────────────────────────────────────────

/** Les N derniers diagnostics chiffrés émis (matière du « pourquoi ? », §12). */
export function coachRecentDiagnostics(): RecentDiag[] {
  return recentDiags;
}
