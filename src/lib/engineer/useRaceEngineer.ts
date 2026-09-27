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
import { live as liveApi, type LiveData } from "@/lib/api";
import type { Tr } from "@/i18n";
import { speak as rawSpeak, cancelSpeech, type VoicePriority } from "@/lib/voice";
import { inCriticalZone } from "@/lib/driving";
import { computeStrategy } from "@/lib/strategy";
import { useAppStore } from "@/stores/app";
import { RadioArbiter, type Candidate } from "./arbiter";
import { ToneArbiter, setSharedTone, BATTLE_GAP_S } from "./tone";
import { decideLapCallout, SectorTracker, LEADER_GAP_EVERY } from "./lapPolicy";
import { onTrack, slowerPackAhead, fasterBehind } from "./traffic";
import { RivalPitWatcher } from "./rivalPits";
import { BatteryWatcher, CRITICAL_PCT } from "./battery";
import { VigieTracker } from "./vigie";
import { BOX_CRITICAL_LAPS } from "./pitWindow";
import { consistentWithLive, parseWet, pickWetFile, wetSession } from "./forecast";
import { engineer } from "./state";
import { radioClass, radioName } from "./text";
import {
  currentForecast,
  currentPitWindow,
  rankGap,
  watchText,
  whenLaps,
  whenMinutes,
} from "./answers";

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
 *  prononçait « un minute » au masculin. */
function fmtLapVoice(s: number, t: Tr): string {
  if (!s || s <= 0 || !isFinite(s)) return "";
  const m = Math.floor(s / 60);
  const sec = (s - m * 60).toFixed(3);
  return m > 0
    ? t("live.vLapTime", { min: m === 1 ? t("live.vMinOne") : m, sec })
    : t("live.vLapTimeShort", { sec });
}

/** Délai de stabilisation de la télémétrie après un (re)démarrage de session. */
const WARMUP_MS = 6000;
/** Valeur rF2 du drapeau bleu (mFlag) — À CONFIRMER en piste si faux positifs. */
const BLUE_FLAG = 6;
/** Préavis « plus rapide derrière » déjà donné pour cette voiture : pas de bleu redondant (s). */
const BLUE_AFTER_PREVIEW_S = 30;

/**
 * Alerte « seuil tenu » : ne déclenche qu'après `sustainMs` continus au-dessus
 * du seuil, puis se tait pendant `cooldownMs`. Évite le spam sur les pics
 * transitoires (ex. freins chauds à chaque gros freinage).
 */
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

export function useVoiceCallouts(data: LiveData | null, enabled: boolean, lang: string, t: Tr) {
  const prevFlag = useRef<FlagKind>("none");
  const fuelBucket = useRef<number>(99);
  const tyreWarned = useRef(false);
  const tyreSeenFresh = useRef(false);
  const coldWarned = useRef(false);
  const prevPos = useRef<number>(0);
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
  const punctureWarned = useRef(false);
  const detachedWarned = useRef(false);
  // Surchauffes : état « seuil tenu » (since = début au-dessus du seuil, last = dernière annonce).
  const tyreHot = useRef({ since: 0, last: 0 });
  const brakeHot = useRef({ since: 0, last: 0 });
  // Usure : état « sous le seuil tenu » (filtre les frames de télémétrie
  // corrompues au lancement → fausse « usure pneus critique »).
  const tyreLow = useRef({ since: 0, last: 0 });
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
  const deferred = useRef<{ text: string; prio: VoicePriority; ttl?: number; at: number }[]>([]);

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

  // Prévision `.wet` : rechargée au changement de circuit (lecture disque).
  const track = data?.session?.track ?? "";
  const lmuPath = useAppStore((s) => s.lmuPath);
  // Débit « complet » : chaque annonce historique garde sa fréquence d'avant.
  const full = useAppStore((s) => s.radioMode) === "full";
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
    const say = (key: string, text: string, prio: VoicePriority, opts: Partial<Candidate> = {}) => {
      if (text && clockRunning.current) cands.push({ key, text, prio, ...opts });
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
      punctureWarned.current = false;
      detachedWarned.current = false;
      tyreHot.current = { since: 0, last: 0 };
      brakeHot.current = { since: 0, last: 0 };
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
      battery.current.reset();
      vigie.current.reset();
      engineer.resetSession();
      lastAnnouncedPb.current = 0;
      lapsSinceLapCallout.current = 99;
      formationSaid.current = false;
      postureSaid.current = false;
      forecastSaid.current = { first: false, soon: false };
    }
    if (sessionReset) clockRunning.current = false;
    else if (sc.session_time > prevSessionTime.current + 1e-3) clockRunning.current = true;
    prevSessionTime.current = sc.session_time;
    // Télémétrie stabilisée ? (seuils suspendus pendant le warm-up)
    const warmedUp = now - warmupStart.current > WARMUP_MS;

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

    const inPits = playerStanding?.in_pits ?? false;

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
        prevLeader.current = player.position === 1;
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
        prevPos.current = player.position;
      }

      const leader = player.position === 1;
      // Course réellement lancée (drapeau vert ou ≥ 1 tour) : avant cela, la
      // grille / le tour de formation réordonnent les positions → ce ne sont
      // pas de vrais dépassements à annoncer.
      const racing = flag === "green" || player.total_laps >= 1;
      const lapDone = prevLaps.current >= 0 && player.total_laps > prevLaps.current;

      // ── Positions — place gagnée / perdue ────────────────────────────────
      // Aux stands : positions, écarts et chronos sont distordus → silence ;
      // les baselines continuent de se mettre à jour.
      const pos = player.position;
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
        say("pos:lead", t("live.vTakeLead"), "normal", { score: 60 });
      }
      prevLeader.current = leader;

      // ── Entrée en position de podium (P2 / P3) ───────────────────────────
      if (racing && !inPits && pos >= 2 && pos <= 3 && !podiumWarned.current) {
        say("pos:podium", t("live.vPodium", { p: pos }), "normal", { score: 45 });
        podiumWarned.current = true;
      } else if (pos > 3 || pos === 1) {
        podiumWarned.current = false;
      }

      // ── Rivaux — écart au pilote devant / sous attaque ───────────────────
      // Les écarts < 1 s ne sont annoncés qu'après **au moins 1 tour bouclé** :
      // sur la grille ET pendant tout le 1er tour, le peloton est collé.
      const gapsReady = warmedUp && player.total_laps >= 1;
      if (inPits) {
        gapAheadWarned.current = false;
        underAttackWarned.current = false;
      } else {
        if (gapsReady && playerStanding && !leader) {
          const gAhead = playerStanding.time_behind_next;
          if (gAhead > 0 && gAhead < 1 && !gapAheadWarned.current) {
            say("gap:ahead", t("live.vGapAhead"), "chatty", { score: 25 });
            gapAheadWarned.current = true;
          } else if (gAhead <= 0 || gAhead > 1.6) {
            gapAheadWarned.current = false;
          }
        }
        const behind = gapsReady
          ? data.standings.find((s) => s.position === pos + 1)
          : undefined;
        if (behind) {
          const gBehind = behind.time_behind_next; // écart de la voiture derrière = à nous
          if (gBehind > 0 && gBehind < 1 && !underAttackWarned.current) {
            say("gap:behind", t("live.vUnderAttack"), "normal", { score: 50 });
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

      // ── Passage de la ligne : point de tour, secteurs, rapprochement ─────
      if (lapDone) {
        lapsSinceLapCallout.current++;
        engineer.energy.push(data.extended?.virtual_energy ?? 0);
      }
      if (!inPits && lapDone && player.last_lap_time > 0) {
        const best = player.best_lap_time;
        const isPb = best > 0 && (prevBest.current <= 0 || best < prevBest.current - 0.001);
        const lapVoice = fmtLapVoice(player.last_lap_time, t);
        const decision = full ? (isPb ? "pb" : "last") : decideLapCallout({
          isRace,
          lapTime: player.last_lap_time,
          prevBest: prevBest.current,
          isPb,
          lastAnnouncedPb: lastAnnouncedPb.current,
          lapsSinceLapCallout: lapsSinceLapCallout.current,
        });
        if (decision && lapVoice) {
          say(
            "lap:time",
            `${t(decision === "pb" ? "live.vBestLap" : "live.vLastLap")} ${lapVoice}`,
            "chatty",
            { group: "lap", order: 0, score: decision === "pb" ? 35 : 20 },
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

        // Écart au leader — en course seulement, un tour sur LEADER_GAP_EVERY.
        if ((full || isRace) && playerStanding && !leader && playerStanding.time_behind_leader > 0) {
          say(
            "gap:leader",
            t("live.vGapLeader", { time: fmtLapVoice(playerStanding.time_behind_leader, t) }),
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

      // ── Pénalité reçue ───────────────────────────────────────────────────
      if (player.num_penalties > prevPenalties.current) {
        say("penalty", t("live.vPenalty"), "critical");
      }
      prevPenalties.current = player.num_penalties;

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
        const loss = useAppStore.getState().pitLossSeconds;
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

      // ── Dernier tour / mi-course (courses au nombre de tours) ────────────
      if (sc.max_laps > 0 && sc.max_laps < 1000) {
        if (!announcedFinal.current && player.total_laps === sc.max_laps - 1) {
          say("race:final", t("live.vFinalLap"), "normal", { score: 75 });
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
          say(`vigie:${ev}`, t(ev === "pitLaneNoLimiter" ? "live.vPitLaneLimiter" : "live.vLimiterForgotten"), "critical");
        }
      }

      // ── Tour de formation : briefing ─────────────────────────────────────
      if (isRace && sc.game_phase === 3 && clockRunning.current && !formationSaid.current && tel && tel.fuel > 0) {
        formationSaid.current = true;
        say("formation", t("live.vFormation", { fuel: Math.round(tel.fuel) }), "normal", { score: 50 });
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
          battle: racing && !inPits && Math.min(neighborGap(-1), neighborGap(1)) <= BATTLE_GAP_S,
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
    if (warmedUp && dmg - prevDamage.current > 10) {
      say("mech:damage", t("live.vDamage"), "critical");
      lastDamageAt.current = now;
    }
    prevDamage.current = dmg;

    // ── Alertes pneus / freins / moteur (télémétrie) ─────────────────────────
    // Suspendues pendant le warm-up (valeurs non stabilisées au départ).
    if (tel && warmedUp) {
      // Crevaison.
      const flat = tel.wheels.some((w) => w.flat);
      if (flat && !punctureWarned.current) {
        say("mech:puncture", t("live.vPuncture"), "critical");
        punctureWarned.current = true;
      } else if (!flat) {
        punctureWarned.current = false;
      }
      // Roue arrachée.
      const detached = tel.wheels.some((w) => w.detached);
      if (detached && !detachedWarned.current) {
        say("mech:detached", t("live.vWheelDetached"), "critical");
        detachedWarned.current = true;
      } else if (!detached) {
        detachedWarned.current = false;
      }
      // Pneus en surchauffe : seuil tenu ≥ 10 s, puis silence 2 min (anti-spam).
      const tyreTemps = tel.wheels.map((w) => w.temp).filter((x) => x > 0 && x < 250);
      const maxTyre = tyreTemps.length ? Math.max(...tyreTemps) : 0;
      if (sustainedAlert(tyreHot.current, maxTyre > 115, now, 10000, 120000)) {
        say("tyres:hot", t("live.vTyreOverheat"), "normal", { score: 55 });
      }
      // Freins en surchauffe : seuil tenu ≥ 6 s (ignore les pics de freinage), silence 2 min.
      const brakeTemps = tel.wheels.map((w) => w.brake_temp).filter((x) => x > 0);
      const maxBrake = brakeTemps.length ? Math.max(...brakeTemps) : 0;
      if (sustainedAlert(brakeHot.current, maxBrake > 750, now, 6000, 120000)) {
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

      // Prévision `.wet` : validée une fois contre la température d'air mesurée,
      // puis annoncée à ≤ 20 min de la pluie probable et rappelée à ≤ 5 min.
      const f = engineer.forecast;
      const key = wetSession(sc.session);
      if (f && key && f.data[key] && sc.end_et > 0 && warmedUp) {
        if (!engineer.forecastValid) {
          const frac = Math.min(1, sc.session_time / sc.end_et);
          engineer.forecastValid = consistentWithLive(f.data[key]!, frac, weather.air_temp);
        }
        const fc = engineer.forecastValid ? currentForecast(data) : null;
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
        const tv = fmtLapVoice(fastest, t);
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

    // ── Arbitrage + diffusion ────────────────────────────────────────────────
    // Silence en zone de freinage/virage (§150, T13) : les annonces **non
    // critiques** sont différées tant que le pilote freine fort ou braque ; la
    // sécurité passe toujours. Les différées sont rejouées à la sortie de zone
    // (péremption 4 s).
    const critical = inCriticalZone(tel?.brake ?? 0, tel?.steering ?? 0);
    const DEFER_MAX_MS = 4000;
    if (!critical && deferred.current.length) {
      for (const d of deferred.current) {
        if (now - d.at < DEFER_MAX_MS) rawSpeak(d.text, lang, d.prio, d.ttl);
      }
      deferred.current = [];
    }
    const { spoken } = arbiter.current.decide(cands, nowS, lapNow, full);
    for (const c of spoken) {
      if (c.prio === "critical" || !critical) rawSpeak(c.text, lang, c.prio, c.ttlMs);
      else deferred.current.push({ text: c.text, prio: c.prio, ttl: c.ttlMs, at: now });
    }
  }, [data, enabled, lang, t, full]);
}
