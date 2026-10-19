/**
 * Annonces vocales en course — l'ingénieur de course (page Live).
 *
 * N'énonce qu'aux *transitions* pour ne pas spammer ; tout est localisé via `t`
 * (gabarits `live.v*`, personnalisables en Config). Chaque émetteur ne parle
 * plus directement : il dépose un **candidat** ; à la fin de chaque trame,
 * l'**arbitre** (`arbiter.ts`) décide ce qui est dit — sécurité toujours, une
 * seule radio dominante sinon, fragments du passage de ligne fusionnés en un
 * « point de tour », anti-radotage par clé, débit borné.
 *
 * Couvre : drapeaux · carburant / fenêtre d'arrêt · pneus · mécanique ·
 * positions · rapprochement chiffré · trafic multiclasse · arrêts des rivaux ·
 * chronos et secteurs · pénalités · stands et limiteur · batterie hybride ·
 * météo (et prévision `.wet` validée) · tour de formation · alertes
 * « préviens-moi » posées au push-to-talk. Publie aussi le ton « pousse /
 * gère » lu par le coach par virage.
 */

import { useEffect, useRef } from "react";
import { config, live as liveApi, type LiveData } from "@/lib/api";
import type { Tr } from "@/i18n";
import {
  speak as rawSpeak,
  cancelSpeech,
  setSpeechGate,
  prewarmSpeech,
  warmupVoice,
  type SpeakOpts,
  type VoicePriority,
} from "@/lib/voice";
import { inCriticalZone } from "@/lib/driving";
import { computeStrategy } from "@/lib/strategy";
import { adjust as adjustRated, radioLog } from "./radioFeedback";
import { aeroDamage, brakePads, damagedSuspensionsOrNull, effectivePitLoss, WHEELS } from "@/lib/lmuRest";
import { AlertLatch } from "./alertLatch";
import { useAppStore } from "@/stores/app";
import { RadioArbiter, TEXT_REPEAT_LAPS, type Candidate } from "./arbiter";
import { classOf, type PolicyCtx } from "./policy";
import { driverBusy } from "./focus";
import { NameDoser, VariantPicker, splitVariants } from "./variants";
import { ProximitySpotter, type SpotCall } from "./proximity";
import { ToneArbiter, setSharedTone, BATTLE_GAP_S } from "./tone";
import { decideLapCallout, SectorTracker, LEADER_GAP_EVERY, FLYING_FACTOR } from "./lapPolicy";
import { applyLapPref, parseLapPrefs, questionDue, sessionKind } from "./prefs";
import { onTrack, slowerPackAhead, fasterBehind } from "./traffic";
import { RivalPitWatcher } from "./rivalPits";
import { BatteryWatcher, CRITICAL_PCT } from "./battery";
import { VigieTracker, type VigieEvent } from "./vigie";
import { BOX_CRITICAL_LAPS } from "./pitWindow";
import { consistentWithLive, parseWet, pickWetFile, wetSession } from "./forecast";
import { engineer } from "./state";
import { brakeAvgLimits } from "./brakes";
import { isWetCompound, wheelWear } from "./tyres";
import { radioClass, radioName } from "./text";
import { scopedPosition } from "@/lib/livePosition";
import {
  currentForecast,
  currentPitWindow,
  rankGap,
  watchText,
  whenLaps,
  whenMinutes,
} from "./answers";
import { GameMessageTracker, type GameMsg, type GameWarning } from "./gameMessages";
import { FrozenOrderTracker, type Column, type FoTarget } from "./frozenOrder";
import { EndgameWatcher } from "./endgame";
import { PaceOutlook } from "./paceOutlook";
import { chequeredPhrase } from "./debriefRadio";
import { loadTrackHistory, recallPhrase } from "./trackRecall";
import { TyreEventWatcher } from "./tyreEvents";
import { formatPressure } from "./pressures";
import { cornerNamer } from "./cornerVoice";
import { coexistFilter } from "./coexist";

export type FlagKind = "green" | "yellow" | "fcy" | "stopped" | "over" | "none";

export function flagFromPhase(phase: number, yellow: number): FlagKind {
  if (phase === 6) return "fcy";
  if (phase === 7) return "stopped";
  if (phase === 8) return "over";
  if (yellow > 0 && yellow !== 6) return "yellow";
  if (phase === 5) return "green";
  return "none";
}

/** Temps au tour en forme parlée : « une minute 23.456 » (ou « 23.456 » si
 *  < 1 min). « 1 » → forme parlée localisée (`vMinOne`) : en français le TTS
 *  prononçait « un minute » au masculin. `tenth` : arrondi au dixième
 *  (« une minute 23.5 ») — un muret ne lit pas les millièmes à la radio. */
export function fmtLapVoice(s: number, t: Tr, tenth = false): string {
  if (!s || s <= 0 || !isFinite(s)) return "";
  if (tenth) s = Math.round(s * 10) / 10;
  const m = Math.floor(s / 60);
  const sec = (s - m * 60).toFixed(tenth ? 1 : 3);
  return m > 0
    ? t("live.vLapTime", { min: m === 1 ? t("live.vMinOne") : m, sec })
    : t("live.vLapTimeShort", { sec });
}

/** Délai de stabilisation de la télémétrie après un (re)démarrage de session. */
const WARMUP_MS = 6000;
/**
 * Durée de vie d'une annonce non critique quand la radio attend une zone calme
 * (ms) : en enchaînement de virages, la voie peut rester fermée plusieurs
 * secondes ; au-delà, l'info est périmée et abandonnée.
 */
const QUIET_TTL_MS = 10000;
/** Valeur rF2 du drapeau bleu (mFlag) — À CONFIRMER en piste si faux positifs. */
const BLUE_FLAG = 6;
/** Préavis « plus rapide derrière » déjà donné pour cette voiture : pas de bleu redondant (s). */
const BLUE_AFTER_PREVIEW_S = 30;

/**
 * Alerte « seuil tenu » : ne déclenche qu'après `sustainMs` continus au-dessus
 * du seuil, puis se tait pendant `cooldownMs`. Évite le spam sur les pics
 * transitoires (ex. freins chauds à chaque gros freinage).
 */
/**
 * Coût de chauffe mesuré : mémorisé par circuit × classe (`tyre_warmup_map`)
 * pour servir dès la séance suivante (réponses « quels pneus changer »).
 */
function saveWarmup(track: string, cls: string, seconds: number): void {
  if (!track || !cls) return;
  void (async () => {
    try {
      const raw = (await config.get("tyre_warmup_map")) || "{}";
      const map = JSON.parse(raw) as Record<string, number>;
      map[`${track}::${cls}`] = Math.round(seconds * 10) / 10;
      engineer.warmupPrior = map;
      await config.set("tyre_warmup_map", JSON.stringify(map));
    } catch {
      /* persistance best-effort */
    }
  })();
}

function sustainedAlert(
  s: { since: number; last: number },
  over: boolean,
  now: number,
  sustainMs: number,
  cooldownMs: number,
): boolean {
  if (!over) {
    s.since = 0;
    return false;
  }
  if (s.since === 0) s.since = now;
  if (now - s.since < sustainMs) return false;
  if (now - s.last < cooldownMs) return false;
  s.last = now;
  return true;
}

/** Annonces du spotter de proximité (gabarits `live.vSpot*`). */
const SPOT_KEYS: Record<SpotCall, string> = {
  left: "live.vSpotLeft",
  right: "live.vSpotRight",
  three: "live.vSpotThree",
  clear: "live.vSpotClear",
  clearLeft: "live.vSpotClearLeft",
  clearRight: "live.vSpotClearRight",
  still: "live.vSpotStill",
};
/** Le spotter tient le canal : pas d'annonce non critique pendant ce délai (ms). */
const SPOT_HOLD_MS = 4000;
/** Phrases fixes préparées d'avance (aucune latence de synthèse au moment critique). */
const PREWARM_KEYS = [
  "live.vFlagYellow",
  "live.vFlagFcy",
  "live.vFlagStopped",
  "live.vBoxBox",
  "live.vPuncture",
  "live.vPitLaneLimiter",
  "live.vLimiterForgotten",
  "live.vPitEntryLimiter",
  "live.vPitExitLimiterOn",
  "live.vWrongWay",
  "live.vScOut",
  "live.vScIn",
  "live.vRestart",
  "live.vBlueWarning",
  "live.vExitTraffic",
];

/** Roues dans l'ordre FL, FR, RL, RR (clés `live.wheelVoice.*`). */
const WHEEL_KEYS = ["fl", "fr", "rl", "rr"];

/** En dessous, pas d'annonce d'écart devant / derrière (voiture arrêtée ou au ralenti) (km/h). */
const GAP_MIN_SPEED_KMH = 60;

/** Phrase de l'ingénieur pour chaque alerte de la vigie (limiteur). */
const VIGIE_PHRASE: Record<VigieEvent, string> = {
  pitLaneNoLimiter: "live.vPitLaneLimiter",
  limiterForgotten: "live.vLimiterForgotten",
  pitEntryNoLimiter: "live.vPitEntryLimiter",
  pitExitLimiterOn: "live.vPitExitLimiterOn",
};

/** Seuil de surchauffe historique (pic instantané, débit Complet) (°C). */
const BRAKE_HOT_C = 750;

export { brakeAvgLimits } from "./brakes";

/** Constante de temps de la moyenne glissante (ms) — environ 2 à 4 freinages. */
const BRAKE_TAU_MS = 30000;

interface BrakeAvgState {
  avg: number;
  /** Début des échantillons valides (0 = aucun) / dernier échantillon. */
  start: number;
  at: number;
  /** Alerte déjà donnée pour le dépassement en cours. */
  warned: boolean;
  lastSaid: number;
}

function newBrakeAvg(): BrakeAvgState {
  return { avg: 0, start: 0, at: 0, warned: false, lastSaid: -Infinity };
}

/**
 * Met à jour la moyenne glissante (exponentielle, pondérée par le temps) de la
 * température du frein le plus chaud. Renvoie `true` quand la moyenne franchit
 * le seuil : au moins une constante de temps d'échantillons, une seule annonce
 * par dépassement, 2 min minimum entre deux annonces.
 */
function updateBrakeAvg(
  s: BrakeAvgState,
  temp: number,
  now: number,
  limits: { hot: number; rearm: number },
): boolean {
  if (!(temp > 0)) return false; // non significatif (arrêt, garage)
  if (s.start === 0) {
    s.start = now;
    s.at = now;
    s.avg = temp;
    return false;
  }
  const dt = Math.max(0, now - s.at);
  s.at = now;
  s.avg += (temp - s.avg) * (1 - Math.exp(-dt / BRAKE_TAU_MS));
  if (s.avg < limits.rearm) s.warned = false;
  if (
    !s.warned &&
    now - s.start >= BRAKE_TAU_MS &&
    s.avg > limits.hot &&
    now - s.lastSaid >= 120000
  ) {
    s.warned = true;
    s.lastSaid = now;
    return true;
  }
  return false;
}

/** Avertissement du centre de messages du jeu → phrase et priorité. */
function warningCall(w: GameWarning, t: Tr): [string, VoicePriority] | null {
  switch (w) {
    case "oneLapDriveThrough":
    case "oneLapStopGo":
      return [t("live.vPenOneLap"), "critical"];
    case "enterPitsToServe":
      return [t("live.vPenEnterPits"), "critical"];
    case "wrongWay":
      return [t("live.vWrongWay"), "critical"];
    case "blueWarning":
      return [t("live.vBlueWarning"), "critical"];
    case "enterPitsLapAllowance":
      return [t("live.vLapAllowance"), "normal"];
    case "drivingTooSlow":
      return [t("live.vTooSlow"), "normal"];
    case "unsportsmanlike":
      return [t("live.vUnsportsmanlike"), "normal"];
    case "headlights":
      return [t("live.vHeadlights"), "normal"];
    case "crewReady":
      return [t("live.vCrewReady"), "normal"];
  }
  return null;
}

export function useVoiceCallouts(data: LiveData | null, enabled: boolean, lang: string, t: Tr) {
  const prevFlag = useRef<FlagKind>("none");
  const fuelBucket = useRef<number>(99);
  const tyreWarned = useRef(false);
  /** Plaquettes : 0 = rien dit, 1 = alerte 25 % dite, 2 = alerte 10 % dite. */
  const padsLevel = useRef(0);
  // Alertes de dégâts : annoncées une fois, réarmées après un vrai retour à la
  // normale (cf. alertLatch.ts — rafales sur le bas-côté, 2026-10-16).
  const dmgLatch = useRef({
    damage: new AlertLatch(),
    puncture: new AlertLatch(),
    detached: new AlertLatch(),
    aero: new AlertLatch(),
    susp: [0, 1, 2, 3].map(() => new AlertLatch()),
  });
  const tyreSeenFresh = useRef(false);
  const coldWarned = useRef(false);
  const prevPos = useRef<number>(0);
  /** Périmètre de `prevPos` (classe brute, ou "" = général). */
  const prevScope = useRef<string>("");
  const prevLaps = useRef<number>(-1);
  const prevBest = useRef<number>(0);
  const prevPenalties = useRef<number>(0);
  const overheatWarned = useRef(false);
  const prevDamage = useRef<number>(0);
  const lastDamageAt = useRef(0);
  const rainWet = useRef<boolean | null>(null);
  const announcedFinal = useRef(false);
  const announcedHalf = useRef(false);
  const prevFastest = useRef<number>(0);
  const prevPitState = useRef<number>(0);
  const prevLeader = useRef(false);
  const podiumWarned = useRef(false);
  const gapAheadWarned = useRef(false);
  const underAttackWarned = useRef(false);
  const prevPitstops = useRef(0);
  // Surchauffes : état « seuil tenu » (since = début au-dessus du seuil, last = dernière annonce).
  const tyreHot = useRef({ since: 0, last: 0 });
  const brakeHot = useRef({ since: 0, last: 0 });
  // Freins (débit Ingénieur) : moyenne glissante de la température du frein le
  // plus chaud, pour juger la tendance et non chaque pic de freinage.
  const brakeAvg = useRef<BrakeAvgState>(newBrakeAvg());
  // Usure : état « sous le seuil tenu » (filtre les frames de télémétrie
  // corrompues au lancement → fausse « usure pneus critique »).
  const tyreLow = useRef({ since: 0, last: 0 });
  const crossoverHold = useRef({ since: 0, last: 0 });
  const crossoverSaid = useRef<"toWets" | "toSlicks" | null>(null);
  /** Tour de sortie des stands en cours (qualif : ce n'est pas un tour lancé). */
  const outLap = useRef(true);
  const outLapPrevPits = useRef(false);
  const engineTempWarned = useRef(false);
  const rainHeavy = useRef(false);
  const blueWarned = useRef(false);
  const timeBucket = useRef(99999);
  const refuelWarned = useRef(false);
  const prevSector = useRef(-1);
  const prevBestSectors = useRef<[number, number, number]>([0, 0, 0]);
  const prevPurple = useRef(false);
  // Débrief de secteur suspendu pour le tour en cours (out-lap après un arrêt /
  // passage par la voie des stands : secteurs non représentatifs).
  const debriefSkip = useRef(false);
  const warmupStart = useRef(0);
  const prevSessionTime = useRef(0);
  // Callouts non-critiques différés en zone de freinage/virage (§150, T13).
  const deferred = useRef<{ text: string; prio: VoicePriority; ttl?: number; at: number; opts?: SpeakOpts }[]>([]);

  // ── Ingénieur : arbitre, ton, suivis ──────────────────────────────────────
  const arbiter = useRef(new RadioArbiter());
  const tone = useRef(new ToneArbiter());
  const sectors = useRef(new SectorTracker());
  const rivalPits = useRef(new RivalPitWatcher());
  const battery = useRef(new BatteryWatcher());
  const vigie = useRef(new VigieTracker());
  const lastAnnouncedPb = useRef(0);
  const lapsSinceLapCallout = useRef(99);
  const formationSaid = useRef(false);
  // Horloge de session vue en marche depuis le (re)démarrage : LMU FIGE le buffer
  // Scoring en quittant une session ; au lancement de l'app (annonces sur toutes les
  // pages), ces données figées ressemblent à une course en cours pendant ~2 s, le
  // temps que la détection de pause les reconnaisse. Rien n'est annoncé avant.
  const clockRunning = useRef(false);
  const postureSaid = useRef(false);
  const forecastSaid = useRef({ first: false, soon: false });
  const forecastTrack = useRef("");
  const variants = useRef(new VariantPicker());
  const names = useRef(new NameDoser());

  // Prévision `.wet` : rechargée au changement de circuit (lecture disque).
  const track = data?.session?.track ?? "";
  const lmuPath = useAppStore((s) => s.lmuPath);
  // Débit « complet » : chaque annonce historique garde sa fréquence d'avant.
  const full = useAppStore((s) => s.radioMode) === "full";
  // Multiclasse : positions/écarts annoncés dans la classe (réglage, défaut oui).
  const classPositions = useAppStore((s) => s.classPositions);
  // Réglages de diffusion (chacun garde l'ancien comportement accessible).
  const quietZones = useAppStore((s) => s.radioQuietZones);
  const phases = useAppStore((s) => s.radioPhases);
  const askPrefs = useAppStore((s) => s.radioAskPrefs);
  const budgets = useAppStore((s) => s.radioBudgets);
  const replay = useAppStore((s) => s.radioReplay);
  const tenth = useAppStore((s) => s.voiceLapPrecision) === "tenth";
  const driverName = useAppStore((s) => s.radioDriverName);
  const proximity = useAppStore((s) => s.proximitySpotter);
  const spotterTuning = useAppStore((s) => s.spotterTuning);
  const coexistMode = useAppStore((s) => s.coexistMode);
  const extras = useAppStore((s) => s.radioExtras);
  const lockAlertMode = useAppStore((s) => s.lockAlertMode);
  const pressureUnit = useAppStore((s) => s.pressureUnit);
  const pressureWindows = useAppStore((s) => s.pressureWindows);
  const spot = useRef(new ProximitySpotter());
  const gameMsgs = useRef(new GameMessageTracker());
  const frozen = useRef(new FrozenOrderTracker());
  const endgame = useRef(new EndgameWatcher());
  const tyreEv = useRef(new TyreEventWatcher());
  const lastTrack = useRef("");
  // Bilan au damier, rappel du circuit, tendance de rythme (réglages, défaut oui).
  const debriefRadio = useAppStore((s) => s.debriefRadio);
  const trackRecallRadio = useAppStore((s) => s.trackRecallRadio);
  const paceOutlookRadio = useAppStore((s) => s.paceOutlookRadio);
  const pace = useRef(new PaceOutlook());
  /** Place en classe vue sur la grille (tour 0), null si le départ n'a pas été vu. */
  const startClassPos = useRef<number | null>(null);
  const debriefSaid = useRef(false);
  /** La course a été vue rouler (tour ≥ 1 sans arrivée) : condition du bilan au damier. */
  const raceSeen = useRef(false);
  /** Dernier tour où la tendance de rythme a été évaluée. */
  const paceLap = useRef(-1);
  /** Tracé + classe déjà rappelés (une réplique par combo et par lancement). */
  const recallKey = useRef("");
  /** Réplique d'arrivée prête (chargée en arrière-plan), dite à la trame suivante. */
  const recallText = useRef<string | null>(null);

  // Voix prête avant la première annonce : moteur Piper démarré, alertes fixes
  // (et phrases du spotter) synthétisées d'avance.
  useEffect(() => {
    if (!enabled) return;
    warmupVoice(lang);
    const keys = proximity ? [...PREWARM_KEYS, ...Object.values(SPOT_KEYS)] : PREWARM_KEYS;
    // Chaque variante « A | B » : l'alerte dira l'une ou l'autre.
    // Crevaison / roue arrachée nommées : leurs 4 roues aussi.
    const wheels = ["live.vPunctureWheel", "live.vWheelDetachedWheel"].flatMap((k) =>
      WHEEL_KEYS.flatMap((w) => splitVariants(t(k, { wheel: t(`live.wheelVoice.${w}`) }))),
    );
    void prewarmSpeech([...keys.flatMap((k) => splitVariants(t(k))), ...wheels], lang);
  }, [enabled, proximity, lang, t]);

  // Coûts de chauffe et préférences radio mémorisés : chargés une fois ; les
  // préférences changées à la voix sont réécrites aussitôt.
  useEffect(() => {
    if (!enabled) return;
    void config
      .get("tyre_warmup_map")
      .then((raw) => {
        engineer.warmupPrior = JSON.parse(raw || "{}") as Record<string, number>;
      })
      .catch(() => {});
    void config
      .get("radio_lap_prefs")
      .then((raw) => {
        engineer.lapPrefs = parseLapPrefs(raw);
      })
      .catch(() => {});
    engineer.onPrefsChanged = () => void config.set("radio_lap_prefs", JSON.stringify(engineer.lapPrefs)).catch(() => {});
    return () => {
      engineer.onPrefsChanged = null;
    };
  }, [enabled]);

  // Spotter de proximité : à chaque trame, hors arbitre (sa priorité passe avant
  // tout et tient le canal quelques secondes).
  useEffect(() => {
    spot.current.setTuning(spotterTuning);
  }, [spotterTuning]);
  useEffect(() => {
    // Cohabitation : un autre ingénieur radio fait déjà le spotter.
    if (!enabled || !proximity || (coexistMode && engineer.otherEngineer)) {
      spot.current.reset();
      return;
    }
    const tel = data?.telemetry;
    if (!data || !data.connected || data.paused || !tel) return;
    const nowS = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
    const call = spot.current.update(data.nearby ?? [], tel.speed_kmh / 3.6, !!data.spotter_calibrated, nowS);
    if (!call) return;
    const ttl = call === "left" || call === "right" || call === "three" ? 1200 : 3000;
    rawSpeak(t(SPOT_KEYS[call]), lang, "spotter", ttl, { holdChannelMs: SPOT_HOLD_MS });
  }, [data, enabled, proximity, coexistMode, lang, t]);

  // Garde « pilote occupé » de la file vocale : revérifiée juste avant chaque
  // prise de parole non critique (ingénieur ET coach : fenêtres coordonnées).
  useEffect(() => {
    if (!enabled || !quietZones) {
      setSpeechGate(null);
      return;
    }
    const clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    setSpeechGate(() => driverBusy(engineer.driver, clock()));
    return () => setSpeechGate(null);
  }, [enabled, quietZones]);
  useEffect(() => {
    if (!enabled || !track || !lmuPath || forecastTrack.current === track) return;
    forecastTrack.current = track;
    let cancelled = false;
    liveApi
      .weatherFiles(lmuPath)
      .then((files) => {
        if (cancelled) return;
        const f = pickWetFile(files, track);
        const parsed = f ? parseWet(f.content) : null;
        engineer.forecast = f && parsed ? { data: parsed, file: `${f.folder}/${f.file_name}` } : null;
        engineer.forecastValid = false;
      })
      .catch(() => {
        engineer.forecast = null;
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, track, lmuPath]);

  useEffect(() => {
    if (!enabled) {
      cancelSpeech();
      return;
    }
    if (!data || !data.connected || data.paused || !data.session) return;
    const { telemetry: tel, player, session: sc, weather } = data;
    const playerStanding = data.standings.find((s) => s.is_player) ?? null;
    const isRace = sc.session >= 10;

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const nowS = now / 1000;
    const lapNow = player?.total_laps ?? 0;

    // ── Candidats de la trame (arbitrés en fin d'effet) ──────────────────────
    const cands: Candidate[] = [];
    // Variante tirée dès le dépôt (chaque fragment d'une phrase fusionnée a la
    // sienne) ; le gabarit complet reste pour l'anti-redite.
    const say = (key: string, text: string, prio: VoicePriority, opts: Partial<Candidate> = {}) => {
      if (!text || !clockRunning.current) return;
      const picked = variants.current.pick(key, text);
      cands.push({ key, text: picked, prio, ...opts, canon: picked !== text ? text : undefined });
    };

    // ── (Re)démarrage de session + warm-up ───────────────────────────────────
    // Au tout début d'une course (grille / formation), la télémétrie n'est pas
    // stabilisée → de fausses alertes de seuil (usure, surchauffe, dégâts…).
    // 1) On détecte un (re)démarrage : 1er passage, chute du nombre de tours,
    //    ou chute du temps de session (mCurrentET repart à ~0).
    // 2) On réinitialise TOUT l'état des alertes (les refs ne doivent pas fuir
    //    d'une course à l'autre) et on relance une temporisation `WARMUP_MS`
    //    pendant laquelle les alertes de seuil sont suspendues.
    const sessionReset =
      prevLaps.current < 0 ||
      (player != null && player.total_laps < prevLaps.current) ||
      sc.session_time + 1 < prevSessionTime.current;
    if (sessionReset) {
      warmupStart.current = now;
      tyreSeenFresh.current = false;
      tyreWarned.current = false;
      coldWarned.current = false;
      {
        const l = dmgLatch.current;
        [l.damage, l.puncture, l.detached, l.aero, ...l.susp].forEach((x) => x.rearm());
      }
      tyreHot.current = { since: 0, last: 0 };
      brakeHot.current = { since: 0, last: 0 };
      brakeAvg.current = newBrakeAvg();
      tyreLow.current = { since: 0, last: 0 };
      engineTempWarned.current = false;
      overheatWarned.current = false;
      rainHeavy.current = false;
      rainWet.current = null;
      fuelBucket.current = 99;
      prevDamage.current = 0;
      lastDamageAt.current = 0;
      refuelWarned.current = false;
      gapAheadWarned.current = false;
      underAttackWarned.current = false;
      arbiter.current.reset();
      tone.current.reset();
      sectors.current.reset();
      rivalPits.current.reset();
      crossoverSaid.current = null;
      outLap.current = true;
      battery.current.reset();
      vigie.current.reset();
      engineer.resetSession();
      lastAnnouncedPb.current = 0;
      lapsSinceLapCallout.current = 99;
      formationSaid.current = false;
      postureSaid.current = false;
      forecastSaid.current = { first: false, soon: false };
      variants.current.reset();
      names.current.reset();
      gameMsgs.current.reset();
      frozen.current.reset();
      endgame.current.reset();
      tyreEv.current.reset();
      pace.current.reset();
      paceLap.current = -1;
      startClassPos.current = null;
      raceSeen.current = false;
      debriefSaid.current = false;
    }
    if (sc.track !== lastTrack.current) {
      lastTrack.current = sc.track;
      engineer.pitTraffic.resetTrack();
    }
    if (sessionReset) clockRunning.current = false;
    else if (sc.session_time > prevSessionTime.current + 1e-3) clockRunning.current = true;
    prevSessionTime.current = sc.session_time;
    // Télémétrie stabilisée ? (seuils suspendus pendant le warm-up)
    const warmedUp = now - warmupStart.current > WARMUP_MS;

    // Repères officiels des virages (coach : « virage 1, La Source »).
    if (extras.cornerNames) cornerNamer.update(sc.track, data.track_points, data.track_dists, sc.track_length);
    else cornerNamer.update("", [], [], 0);

    // ── Concentration : freinages appris + état de pilotage pour la file vocale ─
    if (tel) {
      engineer.brakes.setTrack(sc.track);
      const dist = tel.lap_dist_est > 0 ? tel.lap_dist_est : tel.lap_dist;
      engineer.brakes.push(dist, tel.brake, lapNow, tel.speed_kmh, sc.track_length);
      engineer.driver = {
        brake: tel.brake,
        steer: tel.steering,
        distToBrake: engineer.brakes.distToNext(dist, sc.track_length),
        at: now,
      };
    }
    let nearestGap = Infinity;

    // Stratégie commune (carburant, énergie virtuelle, tours restants).
    const strat = player ? computeStrategy(sc, player, tel) : null;
    const pw = player ? currentPitWindow(data).info : null;
    const effRange = pw?.rangeLaps ?? null;

    // ── Drapeaux — au changement ─────────────────────────────────────────────
    const flag = data.flags
      ? flagFromPhase(data.flags.game_phase, data.flags.yellow_flag_state)
      : "none";
    if (flag !== prevFlag.current) {
      // Vert = simple info (normal) ; jaune / FCY / rouge = sécurité (critique).
      const phrase: Partial<Record<FlagKind, { text: string; prio: VoicePriority }>> = {
        green: { text: t("live.vFlagGreen"), prio: "normal" },
        yellow: { text: t("live.vFlagYellow"), prio: "critical" },
        fcy: { text: t("live.vFlagFcy"), prio: "critical" },
        stopped: { text: t("live.vFlagStopped"), prio: "critical" },
      };
      const p = phrase[flag];
      if (p) say(`flag:${flag}`, p.text, p.prio, { score: 90 });
      prevFlag.current = flag;
    }

    // ── Carburant — autonomie descendant à 3, 2 puis 1 tour ──────────────────
    // Seulement quand on ne sait pas si l'autonomie suffit : si un arrêt est
    // requis, la fenêtre d'arrêt (plus bas) prend le relais ; si elle suffit pour
    // finir, « 2 tours d'essence » à 2 tours de l'arrivée n'est que du bruit.
    const laps =
      tel && tel.fuel_laps_remaining > 0 ? Math.floor(tel.fuel_laps_remaining) : 99;
    const enoughToFinish =
      strat?.sessionLapsLeft != null && !!tel && tel.fuel_laps_remaining >= strat.sessionLapsLeft;
    const windowHandles = isRace && !!pw?.required;
    if (warmedUp && laps >= 1 && laps <= 3 && laps < fuelBucket.current && (full || (!enoughToFinish && !windowHandles))) {
      say("fuel:laps", t("live.vFuelLaps", { n: laps }), "critical");
    }
    fuelBucket.current = laps;

    // ── Pneus froids — au départ / sortie de stands (gomme neuve froide) ─────
    // Températures plausibles seulement (exclut les valeurs non initialisées).
    const temps = tel
      ? tel.wheels.map((w) => w.temp).filter((x) => x > 0 && x < 250)
      : [];
    if (temps.length === 4) {
      const minTemp = Math.min(...temps);
      if (minTemp < 50 && !coldWarned.current) {
        say("tyres:cold", t("live.vColdTyres"), "normal", { score: 40 });
        coldWarned.current = true;
      } else if (minTemp >= 65) {
        coldWarned.current = false; // réarme pour le prochain relais
      }
    }

    // ── Usure pneus — alerte sous 20 % de gomme restante, mais SEULEMENT après
    // avoir vu des pneus neufs (≥ 50 %, évite la fausse alerte au démarrage).
    // Réarmement UNIQUEMENT quand les pneus redeviennent frais (≥ 50 % = passage
    // aux stands) — pas à 30 % : un pneu en fin de relais oscille dans la zone
    // 20-30 % (bruit télémétrie) et faisait répéter l'alerte en boucle.
    const minWear = tel ? Math.min(...tel.wheels.map((w) => w.wear)) : 100;
    if (minWear >= 50) {
      tyreSeenFresh.current = true;
      tyreWarned.current = false; // pneus (re)frais → on pourra ré-alerter au prochain relais
    }
    // Debounce : l'usure doit rester sous 20 % pendant ≥ 4 s avant l'annonce.
    const wearLow =
      warmedUp && tyreSeenFresh.current && minWear > 0 && minWear < 20;
    if (sustainedAlert(tyreLow.current, wearLow, now, 4000, 0) && !tyreWarned.current) {
      say("tyres:wear", t("live.vTyreWear"), "normal", { score: 55, retryS: 20 });
      tyreWarned.current = true;
    }

    // ── Plaquettes (donnée du jeu, absente de la mémoire partagée) — alerte à
    // 25 % puis 10 % de la plus usée ; réarmée quand elles sont changées.
    const pads = brakePads(data.rest);
    if (pads) {
      const minPad = Math.min(...pads);
      if (minPad >= 0.6) padsLevel.current = 0;
      const level = minPad < 0.1 ? 2 : minPad < 0.25 ? 1 : 0;
      if (warmedUp && level > padsLevel.current) {
        say(`brakes:pads${level}`, t("live.vBrakePads", { pct: Math.round(minPad * 100) }), "normal", {
          score: level === 2 ? 65 : 50,
          retryS: 30,
        });
        padsLevel.current = level;
      }
    }

    // ── Dégâts détaillés (donnée du jeu) : quelle suspension, aéro ────────────
    // Donnée inconnue (REST muet un instant) : ne réarme rien.
    const susp = damagedSuspensionsOrNull(data.rest);
    const newSusp = [0, 1, 2, 3].filter((i) =>
      dmgLatch.current.susp[i].update(susp == null ? null : susp.includes(i), now),
    );
    if (warmedUp && newSusp.length) {
      const wheels = newSusp.map((i) => t(`live.wheelVoice.${WHEELS[i].toLowerCase()}`)).join(", ");
      say("mech:suspension", t("live.vSuspensionDamage", { wheels }), "normal", { score: 60, retryS: 20 });
    }
    const aero = aeroDamage(data.rest);
    // Hystérésis : annonce ≥ 10 %, réarmement < 2 %, entre les deux inchangé.
    const aeroActive = aero == null ? null : aero >= 0.1 ? true : aero < 0.02 ? false : null;
    if (dmgLatch.current.aero.update(aeroActive, now) && warmedUp && aero != null) {
      say("mech:aero", t("live.vAeroDamage", { pct: Math.round(aero * 100) }), "normal", { score: 50, retryS: 20 });
    }

    const inPits = playerStanding?.in_pits ?? false;
    // Tour de sortie : de la sortie des stands jusqu'à la ligne suivante.
    if (outLapPrevPits.current && !inPits) outLap.current = true;
    outLapPrevPits.current = inPits;

    if (player) {
      // Réinitialisation des suivis joueur/positions sur (re)démarrage de
      // session (les alertes télémétrie sont déjà réinitialisées plus haut).
      if (sessionReset) {
        prevBest.current = 0;
        prevPenalties.current = player.num_penalties;
        announcedFinal.current = false;
        announcedHalf.current = false;
        prevFastest.current = 0;
        coldWarned.current = false;
        prevPitstops.current = player.num_pitstops;
        prevLeader.current = (scopedPosition(data.standings, classPositions)?.pos ?? player.position) === 1;
        podiumWarned.current = false;
        refuelWarned.current = false;
        timeBucket.current = 99999;
        blueWarned.current = false;
        prevBestSectors.current = [...player.best_sectors];
        prevPurple.current = false;
        prevSector.current = -1;
        debriefSkip.current = false;
        // Baseline de position = position de grille courante (évite un faux
        // « place gagnée/perdue » dû au saut depuis la position de la session
        // précédente — prevPos fuyait d'une session à l'autre).
        prevPos.current = scopedPosition(data.standings, classPositions)?.pos ?? player.position;
      }

      // Position annoncée : dans la classe en multiclasse (réglage), sinon au
      // général. Changement de périmètre (réglage basculé, classes qui
      // apparaissent) → nouvelle base, pas de fausse « place gagnée/perdue ».
      const sp = scopedPosition(data.standings, classPositions);
      const scopeKey = sp?.cls ?? "";
      if (scopeKey !== prevScope.current) {
        prevScope.current = scopeKey;
        prevPos.current = sp?.pos ?? player.position;
        prevLeader.current = (sp?.pos ?? player.position) === 1;
      }
      const leader = (sp?.pos ?? player.position) === 1;
      // Course réellement lancée (drapeau vert ou ≥ 1 tour) : avant cela, la
      // grille / le tour de formation réordonnent les positions → ce ne sont
      // pas de vrais dépassements à annoncer.
      const racing = flag === "green" || player.total_laps >= 1;
      const lapDone = prevLaps.current >= 0 && player.total_laps > prevLaps.current;

      // ── Positions — place gagnée / perdue ────────────────────────────────
      // Aux stands : positions, écarts et chronos sont distordus → silence ;
      // les baselines continuent de se mettre à jour.
      const pos = sp?.pos ?? player.position;
      if (
        warmedUp &&
        racing &&
        !inPits &&
        pos > 0 &&
        prevPos.current > 0 &&
        pos !== prevPos.current
      ) {
        say(
          "pos:change",
          pos < prevPos.current
            ? t("live.vPosGain", { p: pos })
            : t("live.vPosLoss", { p: pos }),
          "chatty",
          full ? { score: 30 } : { score: 30, cooldownS: 8 },
        );
      }
      if (pos > 0) prevPos.current = pos;

      // ── Prise de tête de la course ───────────────────────────────────────
      if (!inPits && leader && !prevLeader.current) {
        say(
          "pos:lead",
          sp?.cls ? t("live.vTakeClassLead", { cls: radioClass(sp.cls) }) : t("live.vTakeLead"),
          "normal",
          { score: 60, moment: "pos:lead" },
        );
      }
      prevLeader.current = leader;

      // ── Entrée en position de podium (P2 / P3) ───────────────────────────
      if (racing && !inPits && pos >= 2 && pos <= 3 && !podiumWarned.current) {
        say("pos:podium", t("live.vPodium", { p: pos }), "normal", { score: 45, moment: "pos:podium" });
        podiumWarned.current = true;
      } else if (pos > 3 || pos === 1) {
        podiumWarned.current = false;
      }

      // ── Rivaux — écart au pilote devant / sous attaque ───────────────────
      // Les écarts < 1 s ne sont annoncés qu'après **au moins 1 tour bouclé** :
      // sur la grille ET pendant tout le 1er tour, le peloton est collé.
      // Ni à l'arrêt ni au ralenti (accident, tête-à-queue, retour lent) : les voitures
      // qui passent ne sont pas un écart à annoncer.
      const rolling = (tel?.speed_kmh ?? 0) >= GAP_MIN_SPEED_KMH;
      const gapsReady = warmedUp && player.total_laps >= 1 && rolling;
      if (inPits) {
        gapAheadWarned.current = false;
        underAttackWarned.current = false;
      } else {
        if (gapsReady && playerStanding && !leader) {
          const gAhead = sp?.gapAhead ?? 0;
          if (gAhead > 0 && gAhead < 1 && !gapAheadWarned.current) {
            // Nom du pilote devant (même classement) si le réglage le demande.
            const nb = extras.rivalNames
              ? data.standings.find(
                  (s) =>
                    !s.is_player &&
                    (sp?.cls ? s.vehicle_class === playerStanding.vehicle_class : true) &&
                    (sp?.cls ? s.class_position : s.position) === pos - 1,
                )
              : undefined;
            say("gap:ahead", nb ? t("live.vGapAheadName", { name: radioName(nb.driver) }) : t("live.vGapAhead"), "chatty", {
              score: 25,
            });
            gapAheadWarned.current = true;
          } else if (gAhead <= 0 || gAhead > 1.6) {
            gapAheadWarned.current = false;
          }
        }
        // Voiture derrière dans le même classement (classe ou général).
        const behind = gapsReady ? sp?.behind : undefined;
        if (behind) {
          const gBehind = sp?.gapBehind ?? 0;
          if (gBehind > 0 && gBehind < 1 && !underAttackWarned.current) {
            say(
              "gap:behind",
              extras.rivalNames ? t("live.vUnderAttackName", { name: radioName(behind.driver) }) : t("live.vUnderAttack"),
              "normal",
              { score: 50 },
            );
            underAttackWarned.current = true;
          } else if (gBehind <= 0 || gBehind > 1.6) {
            underAttackWarned.current = false;
          }
        }
      }

      // ── Trafic multiclasse (distance-tour physique) ──────────────────────
      const myRef = player.best_lap_time > 0 ? player.best_lap_time : player.last_lap_time;
      const cars = playerStanding && !inPits && warmedUp ? onTrack(data, myRef) : [];
      if (cars.length && racing) {
        const pack = slowerPackAhead(cars, myRef, rankGap(playerStanding!.vehicle_class));
        if (pack) {
          say(
            "traffic:pack",
            t("live.vTrafficPack", { n: pack.count, cls: radioClass(pack.cls), when: whenLaps(t, pack.laps) }),
            "normal",
            { score: 40, cooldownLaps: 3, retryS: 10 },
          );
        }
        const fb = fasterBehind(cars);
        if (fb) {
          say(
            `faster:${fb.standing.driver}`,
            t("live.vFasterBehind", { cls: radioClass(fb.standing.vehicle_class), s: Math.round(fb.behindS) }),
            "normal",
            { score: 45, cooldownLaps: 10 },
          );
        }
      }

      // ── Drapeau bleu — laisse passer ─────────────────────────────────────
      // Mémoire par voiture (la plus rapide juste derrière) : on ne redit pas le
      // bleu pour une voiture déjà signalée (préavis récent, ou bleu il y a moins
      // de 25 tours — le temps qu'elle te reprenne un tour de plus).
      if (player.flag === BLUE_FLAG && !blueWarned.current) {
        blueWarned.current = true;
        const culprit = cars
          .filter((c) => c.rel === "faster")
          .sort((a, b) => a.behindS - b.behindS)[0];
        const who = culprit?.standing.driver;
        if (full) say("blue", t("live.vBlueFlag"), "normal", { score: 65 });
        else if (!who || !arbiter.current.saidWithin(`faster:${who}`, nowS, BLUE_AFTER_PREVIEW_S)) {
          say(who ? `blue:${who}` : "blue", t("live.vBlueFlag"), "normal", {
            score: 65,
            ...(who ? { cooldownLaps: 25 } : { cooldownS: 60 }),
          });
        }
      } else if (player.flag !== BLUE_FLAG) {
        blueWarned.current = false;
      }

      // ── Pressions : perte de pression (en roulant), fenêtre (au passage) ─
      if (tel && extras.pressure && warmedUp && !inPits) {
        for (const i of engineer.pressures.frame(nowS, tel.wheels, tel.speed_kmh)) {
          say(`pressure:loss:${i}`, t("live.vPressureLoss", { wheel: t(`live.wheelVoice.${WHEEL_KEYS[i]}`) }), "normal", {
            score: 75,
          });
        }
      }
      if (lapDone && extras.pressure) {
        const win = playerStanding ? pressureWindows[playerStanding.vehicle_class] ?? null : null;
        const verdict = engineer.pressures.lap(win);
        if (verdict) {
          if (!verdict.length) say("pressure:window", t("live.vPressureOk"), "chatty", { score: 20 });
          else {
            const list = verdict
              .map((v) => `${t(`live.wheelVoice.${WHEEL_KEYS[v.wheel]}`)} ${v.off > 0 ? "+" : "-"}${formatPressure(Math.abs(v.off), pressureUnit)}`)
              .join(", ");
            say("pressure:window", t("live.vPressureOut", { list }), "normal", { score: 45 });
          }
        }
      }
      if (lapDone && extras.endgame && isRace) {
        for (const ev of endgame.current.update(data.standings, strat?.sessionLapsLeft ?? null, sc.track_length)) {
          const vars = { name: radioName(ev.driver), gap: ev.gap.toFixed(1), d: ev.perLap.toFixed(1) };
          if (ev.kind === "attack") say("push:attack", t("live.vPushAttack", vars), "normal", { score: 55 });
          else say("push:defend", t("live.vPushDefend", vars), "normal", { score: 60 });
        }
      }

      // ── Passage de la ligne : point de tour, secteurs, rapprochement ─────
      if (lapDone) {
        lapsSinceLapCallout.current++;
        outLap.current = false;
        engineer.energy.push(data.extended?.virtual_energy ?? 0);
        const pads = brakePads(data.rest);
        engineer.pads.push(pads ? Math.min(...pads) : null);
        const wear = wheelWear(tel?.wheels);
        if (wear) engineer.tyreWear.push(wear);
      }

      // ── Pneus : chauffe mesurée sur tout le plateau, pluie ou slicks ─────
      const green = sc.game_phase === 5;
      for (const m of engineer.warmup.push(data, green)) {
        if (m.cls === playerStanding?.vehicle_class) saveWarmup(sc.track, m.cls, engineer.warmup.median(m.cls) ?? m.seconds);
      }
      if (data.weather) engineer.wetness.push(sc.session_time, data.weather.path_wetness_avg);
      const onWets = isWetCompound(tel?.front_compound) || isWetCompound(tel?.rear_compound);
      const call = tel && warmedUp && !inPits ? engineer.wetness.call(onWets, data.weather?.rain ?? 0) : null;
      if (sustainedAlert(crossoverHold.current, call != null, now, 30000, 0) && call && crossoverSaid.current !== call) {
        crossoverSaid.current = call;
        say(`tyres:crossover:${call}`, t(call === "toWets" ? "live.vTyresToWets" : "live.vTyresToSlicks"), "normal", { score: 60, retryS: 30 });
      }
      if (!call) crossoverSaid.current = null;
      if (!inPits && lapDone && player.last_lap_time > 0) {
        const best = player.best_lap_time;
        const isPb = best > 0 && (prevBest.current <= 0 || best < prevBest.current - 0.001);
        const lapVoice = fmtLapVoice(player.last_lap_time, t, tenth);
        const autoDecision = full ? (isPb ? "pb" : "last") : decideLapCallout({
          isRace,
          lapTime: player.last_lap_time,
          prevBest: prevBest.current,
          isPb,
          lastAnnouncedPb: lastAnnouncedPb.current,
          lapsSinceLapCallout: lapsSinceLapCallout.current,
        });
        // Préférence posée à la voix pour ce type de séance (sinon : politique habituelle).
        const flyingLap = isPb || (prevBest.current > 0 && player.last_lap_time <= prevBest.current * FLYING_FACTOR);
        const decision = applyLapPref(engineer.lapPrefs.prefs[sessionKind(sc.session)], autoDecision, isPb, flyingLap);
        if (decision && lapVoice) {
          say(
            "lap:time",
            `${t(decision === "pb" ? "live.vBestLap" : "live.vLastLap")} ${lapVoice}`,
            "chatty",
            { group: "lap", order: 0, score: decision === "pb" ? 35 : 20, moment: decision === "pb" ? "lap:pb" : undefined },
          );
          lapsSinceLapCallout.current = 0;
          if (decision === "pb") lastAnnouncedPb.current = player.last_lap_time;
        }

        // Secteur violet (record de la catégorie) sinon meilleur secteur perso.
        const purple =
          !!playerStanding &&
          (playerStanding.is_class_best_s1 ||
            playerStanding.is_class_best_s2 ||
            playerStanding.is_class_best_s3);
        const newPurple = purple && !prevPurple.current;
        if (newPurple) {
          say("lap:purple", t("live.vPurpleSector"), "chatty", { group: "lap", order: 1, score: 25 });
        }
        // Mode ingénieur : le meilleur secteur perso est implicite sur un nouveau
        // meilleur tour ou un secteur violet tout juste pris ; sinon il est dit.
        if (full || (!newPurple && !isPb)) {
          for (let i = 0; i < 3; i++) {
            const s = player.last_sectors[i];
            const prevB = prevBestSectors.current[i];
            if (s > 0 && (prevB <= 0 || s < prevB - 0.001)) {
              say("lap:bestsector", t("live.vBestSector", { sector: `S${i + 1}` }), "chatty", {
                group: "lap",
                order: 1,
                score: 10,
              });
              break; // un seul rappel par tour
            }
          }
        }
        prevPurple.current = purple;

        // Question unique par type de séance : comment le pilote veut ses chronos.
        const kind = sessionKind(sc.session);
        if (askPrefs && !full && warmedUp && player.total_laps >= 2 && questionDue(engineer.lapPrefs, kind)) {
          say("prefs:ask", t("live.vAskLapPref"), "chatty", { score: 15, retryS: 60 });
          engineer.markAsked(kind);
        }

        // Débrief de secteur : secteur chroniquement faible (moyenne 4 tours
        // propres) de préférence, sinon le pire secteur du tour. Silencieux sur
        // PB et sur l'out-lap.
        const verdict = sectors.current.push(player.last_sectors, prevBestSectors.current);
        if (!isPb && !debriefSkip.current && full) {
          // Complet : le pire secteur à chaque tour (comme avant) + le secteur faible.
          if (verdict.worst)
            say(
              `sector:worst:${verdict.worst.s}`,
              t("live.vSectorLost", { s: verdict.worst.s, d: verdict.worst.d.toFixed(1) }),
              "chatty",
              { score: 12 },
            );
          if (verdict.weak)
            say("sector:weak", t("live.vWeakSector", { s: verdict.weak.s, d: verdict.weak.d.toFixed(1) }), "chatty", {
              score: 15,
              cooldownLaps: 8,
            });
        } else if (!isPb && !debriefSkip.current) {
          if (verdict.weak) {
            say(
              "sector:weak",
              t("live.vWeakSector", { s: verdict.weak.s, d: verdict.weak.d.toFixed(1) }),
              "chatty",
              { group: "lap", order: 2, score: 15, cooldownLaps: 8 },
            );
          } else if (verdict.worst) {
            say(
              `sector:worst:${verdict.worst.s}`,
              t("live.vSectorLost", { s: verdict.worst.s, d: verdict.worst.d.toFixed(1) }),
              "chatty",
              { group: "lap", order: 2, score: 12, cooldownLaps: 3 },
            );
          }
        }
        debriefSkip.current = false;
        prevBestSectors.current = [...player.best_sectors];

        // Écart au leader (de la classe en multiclasse) — en course seulement,
        // un tour sur LEADER_GAP_EVERY.
        const gapLeader = sp?.gapLeader ?? 0;
        if ((full || isRace) && playerStanding && !leader && gapLeader > 0) {
          say(
            "gap:leader",
            t("live.vGapLeader", { time: fmtLapVoice(gapLeader, t, tenth) }),
            "chatty",
            full ? { score: 5 } : { score: 5, cooldownLaps: LEADER_GAP_EVERY },
          );
        }

        // Rapprochement chiffré avec les voisins de classe (course, même tour).
        if (isRace && playerStanding) {
          for (const dir of [-1, 1] as const) {
            const side = dir === -1 ? "ahead" : "behind";
            const nb = data.standings.find(
              (s) =>
                s.vehicle_class === playerStanding.vehicle_class &&
                s.class_position === playerStanding.class_position + dir,
            );
            if (!nb || nb.in_pits || nb.laps_behind_leader !== playerStanding.laps_behind_leader) {
              engineer.closing.invalidate(side);
              continue;
            }
            const gap = Math.abs(nb.time_behind_leader - playerStanding.time_behind_leader);
            const est = engineer.closing.push(side, nb.driver, gap);
            if (!est || (est.trend !== "closing" && est.trend !== "opening")) continue;
            const name = radioName(nb.driver);
            const dd = Math.abs(est.rate).toFixed(1);
            if (side === "ahead" && est.trend === "closing" && est.lapsToCatch != null) {
              say(`closing:ahead:${nb.driver}`, t("live.vClosingAhead", { name, d: dd, n: est.lapsToCatch }), "normal", {
                score: 30,
                cooldownLaps: 5,
              });
            } else if (side === "ahead" && est.trend === "opening" && gap < 10) {
              say(`opening:ahead:${nb.driver}`, t("live.vPullingAway", { name, d: dd }), "chatty", {
                score: 15,
                cooldownLaps: 5,
              });
            } else if (side === "behind" && est.trend === "closing" && est.lapsToCatch != null && est.lapsToCatch <= 10) {
              say(`closing:behind:${nb.driver}`, t("live.vClosingBehind", { name, d: dd, n: est.lapsToCatch }), "normal", {
                score: 35,
                cooldownLaps: 5,
              });
            } else if (side === "behind" && est.trend === "opening" && gap < 5) {
              say(`opening:behind:${nb.driver}`, t("live.vDroppingBehind", { name, d: dd }), "chatty", {
                score: 10,
                cooldownLaps: 5,
              });
            }
          }
        }
      } else if (inPits) {
        engineer.closing.invalidate("ahead");
        engineer.closing.invalidate("behind");
      }
      if (player.best_lap_time > 0) prevBest.current = player.best_lap_time;
      prevLaps.current = player.total_laps;
      engineer.lap = player.total_laps;

      // ── Delta prédictif — au changement de secteur (hors passage de ligne) ─
      // Le passage de ligne est couvert par le point de tour ; en cours de tour,
      // un delta n'est dit que s'il est net (≥ 0,2 s) et pas plus d'une fois par 20 s.
      if (playerStanding && playerStanding.current_sector !== prevSector.current) {
        const atLine = playerStanding.current_sector === 1;
        const minDelta = full ? 0.1 : 0.2;
        if (!inPits && (full || !atLine) && prevSector.current >= 0 && Math.abs(player.lap_delta) >= minDelta) {
          const d = Math.abs(player.lap_delta).toFixed(1);
          say(
            "delta",
            player.lap_delta < 0 ? t("live.vDeltaGain", { d }) : t("live.vDeltaLoss", { d }),
            "chatty",
            full ? { score: 8 } : { score: 8, cooldownS: 20 },
          );
        }
        prevSector.current = playerStanding.current_sector;
      }

      // ── Pénalités : compteur du scoring + centre de messages du jeu ──────
      // Le message du jeu donne le type et la cause ; sans lui (ou réglage
      // coupé), l'annonce générique « pénalité reçue » d'avant.
      const gm: GameMsg | null = gameMsgs.current.push(data.extended?.history_message, data.extended?.history_ticks);
      for (const ev of engineer.penalties.update(nowS, player.num_penalties, gm)) {
        if (ev.kind === "penalty") {
          if (ev.type && extras.penaltyDetail) {
            say("penalty", t(`live.vPen_${ev.type}`, { cause: t(`live.penCause.${ev.cause ?? "other"}`) }), "critical");
          } else {
            say("penalty", t("live.vPenalty"), "critical");
          }
        } else if (ev.kind === "served" && extras.penaltyDetail) {
          say("pen:served", t("live.vPenaltyServed"), "normal", { score: 60 });
        }
      }
      prevPenalties.current = player.num_penalties;
      if (gm && extras.gameWarnings) {
        if (gm.kind === "warning") {
          const w = warningCall(gm.warning, t);
          if (w) say(`msg:${gm.warning}`, w[0], w[1], { score: 70, cooldownS: 20 });
        } else if (gm.kind === "dq") {
          say("msg:dq", t("live.vDisqualified", { cause: t(`live.dqCause.${gm.cause}`) }), "critical");
        }
      }
      if (extras.trackLimits && warmedUp) {
        const tl = engineer.penalties.trackLimits(data.extended?.track_limits, data.extended?.track_limits_per_penalty);
        if (tl?.kind === "trackLimits") {
          say(
            `limits:${tl.count}`,
            t(tl.last ? "live.vTrackLimitsLast" : "live.vTrackLimits", { n: tl.count, max: tl.max }),
            tl.last ? "critical" : "normal",
            { score: 65 },
          );
        }
      }

      // ── Neutralisations : voiture de sécurité, ordre figé ────────────────
      if (extras.safetyCar) {
        const foName = (tg: FoTarget) => (tg.kind === "sc" ? null : radioName(tg.name));
        const colTxt = (c: Column) => (c ? t(`live.col.${c}`) : "");
        for (const ev of frozen.current.update(nowS, {
          rules: data.rules,
          standings: data.standings,
          trackLength: sc.track_length,
          yellowState: data.flags?.yellow_flag_state ?? 0,
        })) {
          switch (ev.kind) {
            case "scOut":
              say("sc:out", t("live.vScOut"), "critical");
              break;
            case "scIn":
              say("sc:in", t("live.vScIn"), "critical");
              break;
            case "restart":
              say("sc:restart", t("live.vRestart"), "critical");
              break;
            case "pitsClosed":
              say("sc:pits", t("live.vPitsClosed"), "normal", { score: 70 });
              break;
            case "pitsOpen":
              say("sc:pits", t("live.vPitsOpen"), "normal", { score: 70 });
              break;
            case "slot":
              say(
                "fo:slot",
                ev.column ? t("live.vFoSlotCol", { p: ev.pos, col: colTxt(ev.column) }) : t("live.vFoSlot", { p: ev.pos }),
                "normal",
                { score: 75 },
              );
              break;
            case "follow": {
              const name = foName(ev.target);
              const text = name
                ? ev.column
                  ? t("live.vFoFollowCol", { name, col: colTxt(ev.column) })
                  : t("live.vFoFollow", { name })
                : t("live.vFoFollowSc");
              say("fo:follow", text, "normal", { score: 80 });
              break;
            }
            case "catchUp": {
              const name = foName(ev.target);
              say("fo:catchup", name ? t("live.vFoCatchUp", { name }) : t("live.vFoCatchUpSc"), "normal", { score: 75 });
              break;
            }
            case "allowPass": {
              const name = foName(ev.target);
              say("fo:pass", name ? t("live.vFoAllowPass", { name }) : t("live.vFoNoPassSc"), "critical");
              break;
            }
          }
        }
      }

      // ── Stands : box partagé, trafic à la sortie ─────────────────────────
      const pitEvents = engineer.pitTraffic.update(nowS, data.standings, sc.track_length);
      if (extras.pitTraffic && warmedUp) {
        for (const ev of pitEvents) {
          const name = radioName(ev.driver);
          if (ev.kind === "boxOccupied") say(`pitx:box:${ev.driver}`, t("live.vBoxOccupied", { name }), "critical");
          else if (ev.kind === "exitTraffic") say(`pitx:exit:${ev.driver}`, t("live.vExitTraffic"), "critical", { ttlMs: 4000 });
          else say(`pitx:rival:${ev.driver}`, t("live.vRivalExiting", { name }), "normal", { score: 70 });
        }
      }

      // ── Demande d'arrêt aux stands (pit_state 1 = REQUEST) ───────────────
      if (player.pit_state === 1 && prevPitState.current !== 1) {
        say("pit:request", t("live.vPitRequest"), "normal", { score: 50 });
      }
      // ── Sortie des stands — rappel limiteur (pit_state 4 = sortie pit lane) ─
      if (player.pit_state === 4 && prevPitState.current !== 4) {
        say("pit:exit", t("live.vPitExitLimiter"), "normal", { score: 60 });
        debriefSkip.current = true; // out-lap : secteurs non représentatifs
      }
      prevPitState.current = player.pit_state;

      // ── Arrêt au stand effectué (nombre d'arrêts en hausse) ──────────────
      if (player.num_pitstops > prevPitstops.current) {
        engineer.pressures.resetStint();
        say("pit:done", t("live.vPitDone"), "normal", { score: 40 });
        refuelWarned.current = false; // réarme l'alerte ravitaillement après l'arrêt
        debriefSkip.current = true; // pas de débrief de secteur sur l'out-lap
      }
      prevPitstops.current = player.num_pitstops;

      // ── Fenêtre d'arrêt (carburant / énergie virtuelle) ──────────────────
      if (warmedUp && isRace) {
        for (const ev of engineer.pit.update(pw, player.total_laps, player.num_pitstops, inPits)) {
          if (ev === "box") say("pit:box", t("live.vBoxBox"), "critical");
          else if (ev === "closing")
            say("pit:closing", t("live.vPitWindowClosing", { when: whenLaps(t, Math.floor(pw!.rangeLaps)) }), "normal", {
              score: 70,
              retryS: 20,
            });
          else say("pit:open", t("live.vPitWindowOpen", { lap: pw!.lastLap }), "normal", { score: 50, retryS: 20 });
          engineer.lastPitCallLap = player.total_laps;
        }
      }

      // ── Arrêts des rivaux directs (classe) ───────────────────────────────
      if (warmedUp && isRace) {
        const st = useAppStore.getState();
        const loss = effectivePitLoss(data, st.pitLossSeconds, st.pitLaneLoss);
        for (const ev of rivalPits.current.push(data, loss)) {
          const name = radioName(ev.driver);
          const key =
            ev.side === "behind"
              ? "live.vRivalPitBehind"
              : ev.outcome === "behind"
                ? "live.vRivalPitAheadBehind"
                : ev.outcome === "front"
                  ? "live.vRivalPitAheadFront"
                  : "live.vRivalPitAheadClose";
          say(`rivalpit:${ev.driver}:${ev.stops}`, t(key, { name }), "normal", { score: 55, retryS: 15 });
        }
      } else rivalPits.current.push(data, 0); // garde le suivi à jour

      // ── Le leader de la classe rentre (registre des arrêts du plateau) ───
      // Tenu à jour à chaque trame ; annonce en course seulement. Si le leader
      // est la voiture juste devant (je suis P2), l'annonce de rival direct
      // ci-dessus en dit déjà plus : on ne double pas.
      const leaderPit = engineer.stints.push(data);
      if (leaderPit && warmedUp && isRace && playerStanding && playerStanding.class_position > 2) {
        const name = radioName(leaderPit.driver);
        const text =
          leaderPit.stintLaps != null && leaderPit.stintLaps >= 3
            ? t("live.vLeaderPitStint", { name, n: leaderPit.stintLaps })
            : t("live.vLeaderPit", { name });
        say(`leaderpit:${leaderPit.driver}:${leaderPit.stop}`, text, "normal", { score: 45, retryS: 15 });
      }

      // ── Dernier tour / mi-course (courses au nombre de tours) ────────────
      if (sc.max_laps > 0 && sc.max_laps < 1000) {
        if (!announcedFinal.current && player.total_laps === sc.max_laps - 1) {
          say("race:final", t("live.vFinalLap"), "normal", { score: 75, moment: "race:final" });
          announcedFinal.current = true;
        }
        const half = Math.floor(sc.max_laps / 2);
        if (!announcedHalf.current && half > 0 && player.total_laps === half) {
          say("race:half", t("live.vHalfway"), "chatty", { score: 10 });
          announcedHalf.current = true;
        }
      }

      // ── Batterie hybride ─────────────────────────────────────────────────
      const x = data.extended;
      if (x && x.boost_state > 0 && warmedUp && !inPits) {
        battery.current.tick(x.state_of_charge);
        if (lapDone) {
          for (const ev of battery.current.lap(x.state_of_charge)) {
            if (ev.kind === "critical")
              say("battery:critical", t("live.vBatteryCritical", { soc: Math.round(ev.soc) }), "normal", {
                score: 60,
                cooldownLaps: 15,
              });
            else if (ev.kind === "deficit")
              say("battery:deficit", t("live.vBatteryDeficit", { d: Math.round(ev.perLap) }), "normal", { score: 45 });
            else say("battery:saturated", t("live.vBatterySaturated"), "chatty", { score: 20 });
          }
        }
      }

      // ── Vigie : limiteur ─────────────────────────────────────────────────
      if (tel && warmedUp) {
        const limit = x && x.pit_speed_limit > 0 ? x.pit_speed_limit * 3.6 : null;
        for (const ev of vigie.current.update(
          {
            inPits,
            pitState: player.pit_state,
            limiter: tel.speed_limiter,
            speedKmh: tel.speed_kmh,
            brake: tel.brake,
            throttle: tel.throttle,
            pitLimitKmh: limit,
          },
          nowS,
        )) {
          say(`vigie:${ev}`, t(VIGIE_PHRASE[ev]), "critical");
        }
      }

      // ── Tour de formation : briefing ─────────────────────────────────────
      if (isRace && sc.game_phase === 3 && clockRunning.current && !formationSaid.current && tel && tel.fuel > 0) {
        formationSaid.current = true;
        say("formation", t("live.vFormation", { fuel: Math.round(tel.fuel) }), "normal", { score: 50, moment: "formation" });
      }

      // ── Ton « pousse / gère » + posture de fin de course ─────────────────
      const raceFraction = !isRace
        ? null
        : sc.end_et > 0
          ? Math.min(1, sc.session_time / sc.end_et)
          : sc.max_laps > 0 && sc.max_laps < 1000
            ? Math.min(1, player.total_laps / sc.max_laps)
            : null;
      const neighborGap = (dir: -1 | 1) => {
        if (!playerStanding) return Infinity;
        const nb = data.standings.find(
          (s) => s.vehicle_class === playerStanding.vehicle_class && s.class_position === playerStanding.class_position + dir,
        );
        if (!nb || nb.laps_behind_leader !== playerStanding.laps_behind_leader) return Infinity;
        return Math.abs(nb.time_behind_leader - playerStanding.time_behind_leader);
      };
      nearestGap = Math.min(neighborGap(-1), neighborGap(1));
      const level = tone.current.update(
        {
          mech:
            !!tel &&
            (tel.overheating ||
              tel.wheels.some((w) => w.flat || w.detached) ||
              (lastDamageAt.current > 0 && now - lastDamageAt.current < 60000)),
          fuelCritical: !!pw?.required && pw.rangeLaps <= BOX_CRITICAL_LAPS,
          batteryCritical: !!x && x.boost_state > 0 && x.state_of_charge < CRITICAL_PCT,
          tyreOverheat: tyreHot.current.since > 0 && now - tyreHot.current.since >= 10000,
          pathWetness: weather?.path_wetness_avg ?? 0,
          minWear: minWear > 0 ? minWear : 100,
          battle: racing && !inPits && nearestGap <= BATTLE_GAP_S,
          raceFraction,
          isRace,
        },
        nowS,
      );
      setSharedTone(full ? "normal" : level);
      if (level === "attaque" && raceFraction != null && raceFraction >= 0.8 && !postureSaid.current && !inPits) {
        postureSaid.current = true;
        say("posture:attack", t("live.vPostureAttack"), "chatty", { score: 25 });
      }

      // ── Alertes « préviens-moi » posées au push-to-talk ──────────────────
      for (const w of engineer.watches.evaluate(data, effRange)) {
        say(`watch:${w.id}`, t("live.vWatchFired", { what: watchText(t, w.cond, "fire") }), "normal", {
          score: 80,
          retryS: 15,
        });
      }
    }

    // ── Surchauffe moteur — front montant ────────────────────────────────────
    if (warmedUp && tel?.overheating && !overheatWarned.current) {
      say("mech:overheat", t("live.vOverheat"), "critical");
      overheatWarned.current = true;
    } else if (tel && !tel.overheating) {
      overheatWarned.current = false;
    }

    // ── Dégâts importants — bond soudain (> 10 points) ───────────────────────
    const dmg = tel?.damage_total ?? 0;
    if (dmgLatch.current.damage.update(dmg - prevDamage.current > 10, now) && warmedUp) {
      say("mech:damage", t("live.vDamage"), "critical");
      lastDamageAt.current = now;
      engineer.policy.noteCrash(nowS); // calme de sécurité après le choc
      tyreEv.current.noteCrash(nowS);
    }
    prevDamage.current = dmg;

    // ── Pneus sales, gros blocage, nouvelles du pilote après un choc ─────────
    if (tel && warmedUp) {
      const inPitsNow = playerStanding?.in_pits ?? false;
      tyreEv.current.setLockMode(lockAlertMode);
      for (const ev of tyreEv.current.update(nowS, tel.wheels, tel.speed_kmh, inPitsNow)) {
        if (ev.kind === "dirty" && extras.tyreEvents) say("dirt", t("live.vTyresDirty"), "normal", { score: 55, ttlMs: 5000 });
        else if (ev.kind === "lockFlatSpot" && extras.tyreEvents)
          say(`lock:${ev.wheel}`, t("live.vLockFlatSpot", { wheel: t(`live.wheelVoice.${WHEEL_KEYS[ev.wheel]}`) }), "normal", {
            score: 45,
          });
        else if (ev.kind === "crashCheck" && extras.crashCheck) say("crash:check", t("live.vCrashCheck"), "normal", { score: 85 });
        else if (ev.kind === "crashResume" && extras.crashCheck) say("crash:resume", t("live.vCrashResume"), "chatty", { score: 30 });
      }
    }

    // ── Réveil radio (heure du PC) ───────────────────────────────────────────
    for (const a of engineer.alarms.due(Date.now())) {
      say(`alarm:${a.at}`, t("live.vAlarm", { label: a.label }), "normal", { score: 95, retryS: 30 });
    }

    // ── Alertes pneus / freins / moteur (télémétrie) ─────────────────────────
    // Suspendues pendant le warm-up (valeurs non stabilisées au départ).
    if (tel && warmedUp) {
      // Crevaison / roue arrachée : la roue est nommée quand une seule est touchée
      // (le jeu le donne roue par roue), sinon la phrase générale.
      const oneWheel = (hit: boolean[]) => (hit.filter(Boolean).length === 1 ? hit.indexOf(true) : -1);
      const flats = tel.wheels.map((w) => w.flat);
      if (dmgLatch.current.puncture.update(flats.some(Boolean), now)) {
        const i = oneWheel(flats);
        say(
          "mech:puncture",
          i >= 0 ? t("live.vPunctureWheel", { wheel: t(`live.wheelVoice.${WHEEL_KEYS[i]}`) }) : t("live.vPuncture"),
          "critical",
        );
      }
      const gone = tel.wheels.map((w) => w.detached);
      if (dmgLatch.current.detached.update(gone.some(Boolean), now)) {
        const i = oneWheel(gone);
        say(
          "mech:detached",
          i >= 0 ? t("live.vWheelDetachedWheel", { wheel: t(`live.wheelVoice.${WHEEL_KEYS[i]}`) }) : t("live.vWheelDetached"),
          "critical",
        );
      }
      // Pneus en surchauffe : seuil tenu ≥ 10 s, puis silence 2 min (anti-spam).
      const tyreTemps = tel.wheels.map((w) => w.temp).filter((x) => x > 0 && x < 250);
      const maxTyre = tyreTemps.length ? Math.max(...tyreTemps) : 0;
      if (sustainedAlert(tyreHot.current, maxTyre > 115, now, 10000, 120000)) {
        say("tyres:hot", t("live.vTyreOverheat"), "normal", { score: 55 });
      }
      const brakeTemps = tel.wheels.map((w) => w.brake_temp).filter((x) => x > 0);
      const maxBrake = brakeTemps.length ? Math.max(...brakeTemps) : 0;
      if (full) {
        // Débit Complet (historique) : seuil instantané tenu ≥ 6 s, silence 2 min.
        if (sustainedAlert(brakeHot.current, maxBrake > BRAKE_HOT_C, now, 6000, 120000)) {
          say("mech:brakes", t("live.vBrakeOverheat"), "critical");
        }
      } else if (inPits) {
        // Arrêt aux stands : les freins refroidissent, la moyenne repart de zéro.
        brakeAvg.current = newBrakeAvg();
      } else if (
        updateBrakeAvg(brakeAvg.current, maxBrake, now, brakeAvgLimits(playerStanding?.vehicle_class ?? ""))
      ) {
        // Débit Ingénieur : une annonce quand la MOYENNE dépasse le seuil ;
        // réarmée seulement une fois la moyenne redescendue (hystérésis).
        say("mech:brakes", t("live.vBrakeOverheat"), "critical");
      }
      // Température d'eau / d'huile élevée.
      const engineHot = tel.water_temp > 110 || tel.oil_temp > 140;
      if (engineHot && !engineTempWarned.current) {
        say("mech:engine", t("live.vEngineTemp"), "normal", { score: 60 });
        engineTempWarned.current = true;
      } else if (tel.water_temp > 0 && tel.water_temp < 105 && tel.oil_temp < 130) {
        engineTempWarned.current = false;
      }
    }

    // ── Météo — début de pluie / piste qui sèche / pluie qui s'intensifie ────
    if (weather) {
      const wet = weather.rain > 0.1;
      if (rainWet.current !== null && wet !== rainWet.current) {
        say("weather:rain", wet ? t("live.vRainStart") : t("live.vRainStop"), "normal", { score: 60 });
      }
      rainWet.current = wet;
      if (weather.rain > 0.5 && !rainHeavy.current) {
        say("weather:heavy", t("live.vRainHeavier"), "normal", { score: 55 });
        rainHeavy.current = true;
      } else if (weather.rain < 0.3) {
        rainHeavy.current = false;
      }

      // Prévision : celle du jeu (pont REST) si fraîche et cohérente avec l'air
      // mesuré, sinon le `.wet` validé une fois contre la mesure. Annoncée à
      // ≤ 20 min de la pluie probable et rappelée à ≤ 5 min.
      const f = engineer.forecast;
      const key = wetSession(sc.session);
      if (sc.end_et > 0 && warmedUp) {
        if (f && key && f.data[key] && !engineer.forecastValid) {
          const frac = Math.min(1, sc.session_time / sc.end_et);
          engineer.forecastValid = consistentWithLive(f.data[key]!, frac, weather.air_temp);
        }
        const fc = currentForecast(data);
        if (fc?.rain) {
          const { inS, chance } = fc.rain;
          const txt = t("live.vRainForecast", { pct: chance, when: whenMinutes(t, inS) });
          if (inS <= 300 && !forecastSaid.current.soon) {
            forecastSaid.current = { first: true, soon: true };
            say("forecast:soon", txt, "normal", { score: 60, retryS: 30 });
          } else if (inS <= 1200 && !forecastSaid.current.first) {
            forecastSaid.current.first = true;
            say("forecast:first", txt, "normal", { score: 50, retryS: 30 });
          }
        }
      }
    }

    // ── Meilleur temps de la session — détenteur annoncé à chaque amélioration ─
    // (un autre pilote : au plus une fois par minute — en essais, le record tombe
    // sans arrêt ; le tien est toujours dit).
    let fastest = 0;
    let fastestDriver = "";
    for (const s of data.standings) {
      if (s.best_lap_time > 0 && (fastest === 0 || s.best_lap_time < fastest)) {
        fastest = s.best_lap_time;
        fastestDriver = s.driver;
      }
    }
    if (fastest > 0) {
      const improved =
        prevFastest.current <= 0 || fastest < prevFastest.current - 0.001;
      if (improved) {
        const tv = fmtLapVoice(fastest, t, tenth);
        const isPlayer = !!player && fastestDriver === player.driver;
        if (isPlayer) say("fastest:me", t("live.vFastestYou", { time: tv }), "chatty", { score: 30 });
        else
          say(
            "fastest",
            t("live.vFastest", { driver: radioName(fastestDriver), time: tv }),
            "chatty",
            full ? { score: 12 } : { score: 12, cooldownS: 60 },
          );
      }
      prevFastest.current = fastest;
    }

    // ── Temps restant (courses au temps : mEndET défini) ─────────────────────
    // Annoncé seulement après **1 tour bouclé** (valeurs résiduelles au départ).
    if (
      warmedUp &&
      player &&
      player.total_laps >= 1 &&
      sc.end_et > 0 &&
      sc.end_et > sc.session_time
    ) {
      const remaining = sc.end_et - sc.session_time;
      if (remaining > 0) {
        if (remaining <= 60 && timeBucket.current > 60) {
          say("time:1", t("live.vLastMinute"), "normal", { score: 70 });
          timeBucket.current = 60;
        } else if (remaining <= 300 && timeBucket.current > 300) {
          say("time:5", t("live.vTimeRemaining", { min: 5 }), "normal", { score: 50, retryS: 20 });
          timeBucket.current = 300;
        } else if (remaining <= 600 && timeBucket.current > 600) {
          say("time:10", t("live.vTimeRemaining", { min: 10 }), "normal", { score: 45, retryS: 20 });
          timeBucket.current = 600;
        }
      }
    }

    // ── Ravitaillement nécessaire pour finir ─────────────────────────────────
    if (player && player.total_laps >= 1) {
      if (strat && strat.fuelToAdd != null && strat.fuelToAdd > 0.5 && !refuelWarned.current) {
        say("fuel:refuel", t("live.vRefuelNeeded"), "normal", { score: 50, retryS: 20 });
        refuelWarned.current = true;
      }
    }

    // ── Grille, tendance de rythme, bilan au damier, mémoire du circuit ─────
    const lapVoice = (s: number) => fmtLapVoice(s, t, true);
    const pickPart = (k: string, x: string) => variants.current.pick(k, x);
    const finishStatus = playerStanding?.finish_status ?? player?.finish_status ?? 0;
    // Place de départ en classe : seulement si la grille a été vue (tour 0).
    if (isRace && playerStanding && lapNow === 0 && finishStatus === 0 && playerStanding.class_position > 0)
      startClassPos.current = playerStanding.class_position;
    if (isRace && lapNow >= 1 && finishStatus === 0) raceSeen.current = true;
    pace.current.push(data.standings);
    if (paceOutlookRadio && isRace && warmedUp && !inPits && lapNow !== paceLap.current) {
      paceLap.current = lapNow;
      const c = pace.current.call(data.standings, lapNow, strat?.sessionLapsLeft ?? null, weather?.rain ?? 0);
      if (c?.kind === "climbing")
        say("pos:pace", t("live.vPaceClimbing", { d: c.perLap.toFixed(1), name: radioName(c.driver) }), "chatty", { score: 25 });
      else if (c?.kind === "holding") say("pos:pace", t("live.vPaceHolding"), "chatty", { score: 20 });
    }
    // Bilan au damier : une fois, et seulement si la course a été vue rouler (pas en
    // ouvrant l'app sur une course déjà finie).
    if (debriefRadio && isRace && finishStatus > 0 && raceSeen.current && !debriefSaid.current && player) {
      debriefSaid.current = true;
      const me = playerStanding;
      const text = chequeredPhrase(
        {
          status: finishStatus,
          classPos: me && me.class_position > 0 ? me.class_position : null,
          classCount: me ? data.standings.filter((s) => s.vehicle_class === me.vehicle_class).length : null,
          startClassPos: startClassPos.current,
          bestLap: player.best_lap_time > 0 ? player.best_lap_time : null,
          stops: player.num_pitstops,
        },
        t,
        lapVoice,
        pickPart,
      );
      say("race:debrief", text, "normal", { score: 90, moment: "race:final" });
    }
    // Mémoire du circuit : chargée au changement de tracé ou de classe (aussi en course,
    // pour le coach vocal) ; la réplique n'est dite qu'hors course, au garage ou au tour 0.
    const myClass = playerStanding?.vehicle_class ?? "";
    if (sc.track && myClass) {
      const key = `${sc.track}|${radioClass(myClass)}`;
      if (recallKey.current !== key) {
        recallKey.current = key;
        recallText.current = null;
        const speak = trackRecallRadio && !isRace;
        void loadTrackHistory(sc.track, myClass)
          .then((h) => {
            if (h && speak && recallKey.current === key) recallText.current = recallPhrase(h, t, lapVoice, pickPart);
          })
          .catch(() => {});
      } else if (recallText.current && !isRace && (inPits || lapNow === 0)) {
        say("recall:track", recallText.current, "chatty", { score: 30 });
        recallText.current = null;
      }
    }

    // ── Politique de parole : régime choisi à la voix, phases, budgets ───────
    // Le régime (« on se bat », « tais-toi jusqu'au tour 12 »…) vaut dans les deux
    // débits ; phases et budgets seulement en débit Ingénieur (Complet = historique).
    const finished = flag === "over" || (player?.finish_status ?? 0) > 0;
    engineer.pitstops = player?.num_pitstops ?? engineer.pitstops;
    const policyCtx: PolicyCtx = {
      nowS,
      lap: lapNow,
      isRace,
      racing: flag === "green" || lapNow >= 1,
      inPits,
      finished,
      remainingS: sc.end_et > 0 ? Math.max(0, sc.end_et - sc.session_time) : null,
      lapsLeft: sc.max_laps > 0 && sc.max_laps < 1000 && player ? sc.max_laps - player.total_laps : null,
      pitstops: engineer.pitstops,
      nearestGapS: nearestGap,
      phases: !full && phases,
      budgets: !full && budgets,
      // Qualif : tour lancé (ni stands, ni tour de sortie, la ligne passée de 400 m).
      qualiFlying: sc.session >= 5 && sc.session <= 8 && !inPits && !outLap.current && (playerStanding?.lap_dist ?? 0) > 400,
    };
    // Notes du pilote : une famille jugée surtout inutile ou fausse se fait plus rare.
    const own = coexistFilter(cands, coexistMode && engineer.otherEngineer);
    const allowed = engineer.policy.filter(adjustRated(own, radioLog.stats), policyCtx);

    // ── Arbitrage + diffusion ────────────────────────────────────────────────
    arbiter.current.textRepeatLaps = !full && replay ? TEXT_REPEAT_LAPS : 0;
    const { spoken } = arbiter.current.decide(allowed, nowS, lapNow, full);
    engineer.policy.commit(spoken, policyCtx);
    radioLog.record(spoken, `${sc.track}|${sc.session}`);
    const repeatPrefix = t("live.vRepeatPrefix");
    const voiceOf = (c: Candidate) => names.current.apply(driverName, c.moment ?? null, c.text, nowS);
    const optsOf = (c: Candidate): SpeakOpts | undefined =>
      replay ? { replayPrefix: repeatPrefix, retryIfLost: c.prio === "critical" || classOf(c) === "decision" } : undefined;

    if (quietZones) {
      // Silence anticipé : la file vocale retient elle-même les annonces non
      // critiques tant que le pilote est occupé (freinage connu à < 200 m, frein,
      // volant, push-to-talk) et revérifie juste avant de parler.
      for (const c of spoken) {
        const ttl = c.prio === "critical" ? c.ttlMs : Math.max(c.ttlMs ?? 0, QUIET_TTL_MS);
        rawSpeak(voiceOf(c), lang, c.prio, ttl, optsOf(c));
      }
      deferred.current = [];
      return;
    }
    // Comportement historique (réglage coupé) : silence en zone de freinage/virage
    // (§150, T13) — annonces **non critiques** différées tant que le pilote freine
    // fort ou braque, rejouées à la sortie de zone (péremption 4 s).
    const critical = inCriticalZone(tel?.brake ?? 0, tel?.steering ?? 0);
    const DEFER_MAX_MS = 4000;
    if (!critical && deferred.current.length) {
      for (const d of deferred.current) {
        if (now - d.at < DEFER_MAX_MS) rawSpeak(d.text, lang, d.prio, d.ttl, d.opts);
      }
      deferred.current = [];
    }
    for (const c of spoken) {
      const text = voiceOf(c);
      if (c.prio === "critical" || !critical) rawSpeak(text, lang, c.prio, c.ttlMs, optsOf(c));
      else deferred.current.push({ text, prio: c.prio, ttl: c.ttlMs, at: now, opts: optsOf(c) });
    }
  }, [
    data,
    enabled,
    lang,
    t,
    full,
    classPositions,
    quietZones,
    phases,
    budgets,
    replay,
    tenth,
    driverName,
    askPrefs,
    coexistMode,
    extras,
    lockAlertMode,
    pressureUnit,
    pressureWindows,
    debriefRadio,
    trackRecallRadio,
    paceOutlookRadio,
  ]);
}
