import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  live as liveApi,
  system as systemApi,
  type LiveData,
  type LiveStanding,
  type LiveWheel,
} from "@/lib/api";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  ArrowLeft,
  Flag,
  Fuel,
  Cloud,
  Thermometer,
  Wind,
  Droplets,
  Maximize,
  WifiOff,
  Loader2,
  Gauge as GaugeIcon,
  AlertTriangle,
  Download,
  FolderOpen,
  CheckCircle2,
  Copy,
  Check,
  Moon,
  Sun,
  PauseCircle,
  Settings2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useAppStore } from "@/stores/app";
import { LiveCoachPanel } from "@/components/AICoachPanel";
import { useTheme } from "@/stores/theme";
import { ClassBadge } from "@/components/ClassBadge";
import { TrackFlag } from "@/components/TrackFlag";
import { CAR_CLASS_COLORS } from "@/lib/staticData";
import { speak, cancelSpeech, type VoicePriority } from "@/lib/voice";
import { computeStrategy, type StrategySnapshot } from "@/lib/strategy";
import type { Tr } from "@/i18n";

/**
 * Estimation « carburant pour finir » :
 *  - tours restants : `max_laps - tours du joueur` (course au nombre de tours),
 *    sinon estimés depuis le temps restant (`end_et - session_time`) / temps au tour
 *    pour les courses au temps (endurance), + 1 tour entamé au drapeau.
 *  - carburant nécessaire = tours restants × conso moyenne.
 *  - à ajouter = nécessaire − réservoir actuel (négatif ⇒ surplus).
 * Renvoie `null` si non calculable (pas de conso, ou tours restants inconnus).
 */
/**
 * Normalise le nom de classe brut rF2/LMU (ex. « LMGT3 », « P2 », « Hypercar »)
 * vers la clé interne de l'app (Hypercar / LMP2_WEC / LMP3 / GT3 / GTE) pour
 * réutiliser la palette de couleurs commune (`CAR_CLASS_COLORS`, `ClassBadge`).
 */
function liveClassKey(vehicleClass: string): string {
  const c = vehicleClass.toLowerCase();
  if (c.includes("hyper") || c.includes("lmh") || c.includes("lmdh")) return "Hypercar";
  if (c.includes("gt3") || c.includes("lmgt3")) return "GT3";
  if (c.includes("gte")) return "GTE";
  if (c.includes("p3")) return "LMP3";
  if (c.includes("p2")) return "LMP2_WEC";
  return vehicleClass;
}

/** Couleur d'accent (texte) de la classe — pour liserés et pastilles. */
function liveClassColor(vehicleClass: string): string | null {
  return CAR_CLASS_COLORS[liveClassKey(vehicleClass)]?.color ?? null;
}

/** Couleur de la position au général : or / argent / bronze sur le podium. */
function podiumColor(position: number): string {
  if (position === 1) return "text-yellow-400";
  if (position === 2) return "text-slate-300";
  if (position === 3) return "text-amber-600";
  return "text-foreground";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtLap(s: number): string {
  if (!s || s <= 0 || !isFinite(s)) return "—:——.———";
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(3).padStart(6, "0")}`;
}
function fmtSec(s: number): string {
  if (!s || s <= 0 || !isFinite(s)) return "——.———";
  return s.toFixed(3);
}
function fmtGap(behind: number, lapsBehind: number, t: Tr): string {
  if (lapsBehind > 0) return t("live.gapLaps", { count: lapsBehind });
  if (behind > 0) return `+${behind.toFixed(3)}`;
  return "—";
}

/** Libellé localisé du type de session rF2 (0 test, 1-4 essais, …). */
function sessionLabel(s: number, t: Tr): string {
  if (s === 0) return t("live.sessTest");
  if (s >= 1 && s <= 4) return t("live.sessPractice");
  if (s >= 5 && s <= 8) return t("live.sessQualifying");
  if (s === 9) return t("live.sessWarmup");
  if (s >= 10) return t("live.sessRace");
  return t("live.sessSession");
}

type FlagKind = "green" | "yellow" | "fcy" | "stopped" | "over" | "none";

function flagFromPhase(phase: number, yellow: number): FlagKind {
  if (phase === 6) return "fcy";
  if (phase === 7) return "stopped";
  if (phase === 8) return "over";
  if (yellow > 0 && yellow !== 6) return "yellow";
  if (phase === 5) return "green";
  return "none";
}

function fmtClock(sec: number): string {
  if (sec <= 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const p = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

function pct(v: number, signed = false): string {
  return signed
    ? `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`
    : `${Math.round(v * 100)}%`;
}

// ── Annonces vocales (Web Speech API) ─────────────────────────────────────────
// La sélection de voix (voix neuronale + masculine), la file à priorité et le
// `speak()` vivent désormais dans `@/lib/voice` (partagé avec la page Config).

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

/**
 * Annonces vocales en course (activables en config — doublon CrewChief sinon).
 * N'énonce qu'aux *transitions* pour ne pas spammer. Tout est localisé via `t`.
 * Couvre : drapeaux · carburant · usure pneus · positions · chronos (dernier
 * tour / meilleur perso) · pénalités · surchauffe · dégâts · dernier tour /
 * mi-course · pluie / piste sèche.
 */
/** Délai de stabilisation de la télémétrie après un (re)démarrage de session. */
const WARMUP_MS = 6000;

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

function useVoiceCallouts(
  data: LiveData | null,
  enabled: boolean,
  lang: string,
  t: Tr,
) {
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

  useEffect(() => {
    if (!enabled) {
      cancelSpeech();
      return;
    }
    if (!data || !data.connected || data.paused || !data.session) return;
    const { telemetry: tel, player, session: sc, weather } = data;
    const playerStanding = data.standings.find((s) => s.is_player) ?? null;
    // Valeur rF2 du drapeau bleu (mFlag) — À CONFIRMER en piste si faux positifs.
    const BLUE_FLAG = 6;

    // ── (Re)démarrage de session + warm-up ───────────────────────────────────
    // Au tout début d'une course (grille / formation), la télémétrie n'est pas
    // stabilisée → de fausses alertes de seuil (usure, surchauffe, dégâts…).
    // 1) On détecte un (re)démarrage : 1er passage, chute du nombre de tours,
    //    ou chute du temps de session (mCurrentET repart à ~0).
    // 2) On réinitialise TOUT l'état des alertes (les refs ne doivent pas fuir
    //    d'une course à l'autre) et on relance une temporisation `WARMUP_MS`
    //    pendant laquelle les alertes de seuil sont suspendues.
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
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
      refuelWarned.current = false;
      gapAheadWarned.current = false;
      underAttackWarned.current = false;
    }
    prevSessionTime.current = sc.session_time;
    // Télémétrie stabilisée ? (seuils suspendus pendant le warm-up)
    const warmedUp = now - warmupStart.current > WARMUP_MS;

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
      if (p) speak(p.text, lang, p.prio);
      prevFlag.current = flag;
    }

    // ── Carburant — autonomie descendant à 3, 2 puis 1 tour ──────────────────
    const laps =
      tel && tel.fuel_laps_remaining > 0 ? Math.floor(tel.fuel_laps_remaining) : 99;
    if (warmedUp && laps >= 1 && laps <= 3 && laps < fuelBucket.current) {
      speak(t("live.vFuelLaps", { n: laps }), lang, "critical");
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
        speak(t("live.vColdTyres"), lang, "normal");
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
    // Une frame parasite isolée (m_wear corrompu au lancement) ne s'accumule
    // jamais 4 s → plus de fausse alerte. `tyreWarned` interdit la répétition
    // jusqu'au prochain relais (cooldown inutile ici → 0).
    const wearLow =
      warmedUp && tyreSeenFresh.current && minWear > 0 && minWear < 20;
    if (sustainedAlert(tyreLow.current, wearLow, now, 4000, 0) && !tyreWarned.current) {
      speak(t("live.vTyreWear"), lang, "normal");
      tyreWarned.current = true;
    }

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
      // Aux stands (ou voie des stands) : positions, écarts et chronos sont
      // distordus (voiture ralentie / à l'arrêt, perte de places attendue) → on
      // n'annonce ni place gagnée/perdue, ni prise de tête / podium, ni écarts,
      // ni chronos de tour, ni delta. Les baselines (prevPos, prevSector…)
      // continuent de se mettre à jour pour repartir proprement à la sortie.
      const inPits = playerStanding?.in_pits ?? false;

      // ── Positions — place gagnée / perdue ────────────────────────────────
      const pos = player.position;
      if (
        warmedUp &&
        racing &&
        !inPits &&
        pos > 0 &&
        prevPos.current > 0 &&
        pos !== prevPos.current
      ) {
        speak(
          pos < prevPos.current
            ? t("live.vPosGain", { p: pos })
            : t("live.vPosLoss", { p: pos }),
          lang,
          "chatty",
        );
      }
      if (pos > 0) prevPos.current = pos;

      // ── Prise de tête de la course ───────────────────────────────────────
      if (!inPits && leader && !prevLeader.current) {
        speak(t("live.vTakeLead"), lang, "normal");
      }
      prevLeader.current = leader;

      // ── Entrée en position de podium (P2 / P3) ───────────────────────────
      // Conditionnée à la course lancée : démarrer P2 sur la grille n'est pas
      // une « entrée en position de podium ».
      if (racing && !inPits && pos >= 2 && pos <= 3 && !podiumWarned.current) {
        speak(t("live.vPodium", { p: pos }), lang, "normal");
        podiumWarned.current = true;
      } else if (pos > 3 || pos === 1) {
        podiumWarned.current = false;
      }

      // ── Rivaux — écart au pilote devant / sous attaque ───────────────────
      // Les écarts < 1 s ne sont annoncés qu'après **au moins 1 tour bouclé** : sur
      // la grille ET pendant tout le 1er tour, le peloton est collé (< 1 s) même
      // après le warm-up et même au vert → faux « moins d'une seconde devant ». Une
      // fois le peloton étiré, un écart serré redevient un vrai événement.
      // Aux stands : réarme les drapeaux pour repartir proprement à la sortie.
      const gapsReady = warmedUp && player.total_laps >= 1;
      if (inPits) {
        gapAheadWarned.current = false;
        underAttackWarned.current = false;
      } else {
        if (gapsReady && playerStanding && !leader) {
          const gAhead = playerStanding.time_behind_next;
          if (gAhead > 0 && gAhead < 1 && !gapAheadWarned.current) {
            speak(t("live.vGapAhead"), lang, "chatty");
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
            speak(t("live.vUnderAttack"), lang, "normal");
            underAttackWarned.current = true;
          } else if (gBehind <= 0 || gBehind > 1.6) {
            underAttackWarned.current = false;
          }
        }
      }

      // ── Drapeau bleu — laisse passer ─────────────────────────────────────
      if (player.flag === BLUE_FLAG && !blueWarned.current) {
        speak(t("live.vBlueFlag"), lang, "normal");
        blueWarned.current = true;
      } else if (player.flag !== BLUE_FLAG) {
        blueWarned.current = false;
      }

      // ── Chronos — à chaque tour bouclé : meilleur perso ou dernier tour ──
      // Ignoré aux stands : l'in-lap / out-lap donne des temps parasites et un
      // écart au leader gonflé (le PB ne peut de toute façon pas tomber là).
      if (
        !inPits &&
        prevLaps.current >= 0 &&
        player.total_laps > prevLaps.current &&
        player.last_lap_time > 0
      ) {
        const best = player.best_lap_time;
        const isPb = best > 0 && (prevBest.current <= 0 || best < prevBest.current - 0.001);
        const lapVoice = fmtLapVoice(player.last_lap_time, t);
        if (isPb) {
          speak(`${t("live.vBestLap")} ${lapVoice}`, lang, "chatty");
        } else if (lapVoice) {
          speak(`${t("live.vLastLap")} ${lapVoice}`, lang, "chatty");
        }

        // Meilleur secteur personnel — secteur amélioré sur ce tour.
        for (let i = 0; i < 3; i++) {
          const s = player.last_sectors[i];
          const prevB = prevBestSectors.current[i];
          if (s > 0 && (prevB <= 0 || s < prevB - 0.001)) {
            speak(t("live.vBestSector", { sector: `S${i + 1}` }), lang, "chatty");
            break; // un seul rappel par tour
          }
        }

        // ── Débrief de tour — pire secteur vs tes meilleurs secteurs ─────────
        // L'app dit déjà CE QUE vaut le tour ; ceci dit OÙ il s'est perdu.
        // Silencieux : sur PB (rien à redire), sur l'out-lap après un arrêt,
        // sous 0.3 s (bruit) et au-delà de 5 s (trafic / tête-à-queue — pas un
        // conseil de secteur). Une seule annonce : le pire secteur.
        if (!isPb && !debriefSkip.current) {
          let worstIdx = -1;
          let worstLoss = 0.3;
          for (let i = 0; i < 3; i++) {
            const sec = player.last_sectors[i];
            const ref = prevBestSectors.current[i];
            const loss = sec > 0 && ref > 0 ? sec - ref : 0;
            if (loss >= worstLoss && loss < 5) {
              worstLoss = loss;
              worstIdx = i;
            }
          }
          if (worstIdx >= 0) {
            speak(
              t("live.vSectorLost", { s: worstIdx + 1, d: worstLoss.toFixed(1) }),
              lang,
              "chatty",
            );
          }
        }
        debriefSkip.current = false;

        prevBestSectors.current = [...player.best_sectors];

        // Secteur violet — le joueur détient un meilleur secteur de la catégorie.
        const purple =
          !!playerStanding &&
          (playerStanding.is_class_best_s1 ||
            playerStanding.is_class_best_s2 ||
            playerStanding.is_class_best_s3);
        if (purple && !prevPurple.current) {
          speak(t("live.vPurpleSector"), lang, "chatty");
        }
        prevPurple.current = purple;

        // Écart au leader — une fois par tour si le joueur n'est pas en tête.
        if (playerStanding && !leader && playerStanding.time_behind_leader > 0) {
          speak(
            t("live.vGapLeader", {
              time: fmtLapVoice(playerStanding.time_behind_leader, t),
            }),
            lang,
            "chatty",
          );
        }
      }
      if (player.best_lap_time > 0) prevBest.current = player.best_lap_time;
      prevLaps.current = player.total_laps;

      // ── Delta prédictif — échantillonné au changement de secteur ──────────
      if (playerStanding && playerStanding.current_sector !== prevSector.current) {
        if (!inPits && prevSector.current >= 0 && Math.abs(player.lap_delta) >= 0.1) {
          const d = Math.abs(player.lap_delta).toFixed(1);
          speak(
            player.lap_delta < 0
              ? t("live.vDeltaGain", { d })
              : t("live.vDeltaLoss", { d }),
            lang,
            "chatty",
          );
        }
        prevSector.current = playerStanding.current_sector;
      }

      // ── Pénalité reçue ───────────────────────────────────────────────────
      if (player.num_penalties > prevPenalties.current) {
        speak(t("live.vPenalty"), lang, "critical");
      }
      prevPenalties.current = player.num_penalties;

      // ── Demande d'arrêt aux stands (pit_state 1 = REQUEST) ───────────────
      if (player.pit_state === 1 && prevPitState.current !== 1) {
        speak(t("live.vPitRequest"), lang, "normal");
      }
      // ── Sortie des stands — rappel limiteur (pit_state 4 = sortie pit lane) ─
      if (player.pit_state === 4 && prevPitState.current !== 4) {
        speak(t("live.vPitExitLimiter"), lang, "normal");
        debriefSkip.current = true; // out-lap : secteurs non représentatifs
      }
      prevPitState.current = player.pit_state;

      // ── Arrêt au stand effectué (nombre d'arrêts en hausse) ──────────────
      if (player.num_pitstops > prevPitstops.current) {
        speak(t("live.vPitDone"), lang, "normal");
        refuelWarned.current = false; // réarme l'alerte ravitaillement après l'arrêt
        debriefSkip.current = true; // pas de débrief de secteur sur l'out-lap
      }
      prevPitstops.current = player.num_pitstops;

      // ── Dernier tour / mi-course (courses au nombre de tours) ────────────
      if (sc.max_laps > 0 && sc.max_laps < 1000) {
        if (!announcedFinal.current && player.total_laps === sc.max_laps - 1) {
          speak(t("live.vFinalLap"), lang, "normal");
          announcedFinal.current = true;
        }
        const half = Math.floor(sc.max_laps / 2);
        if (!announcedHalf.current && half > 0 && player.total_laps === half) {
          speak(t("live.vHalfway"), lang, "chatty");
          announcedHalf.current = true;
        }
      }
    }

    // ── Surchauffe moteur — front montant ────────────────────────────────────
    if (warmedUp && tel?.overheating && !overheatWarned.current) {
      speak(t("live.vOverheat"), lang, "critical");
      overheatWarned.current = true;
    } else if (tel && !tel.overheating) {
      overheatWarned.current = false;
    }

    // ── Dégâts importants — bond soudain (> 10 points) ───────────────────────
    const dmg = tel?.damage_total ?? 0;
    if (warmedUp && dmg - prevDamage.current > 10) {
      speak(t("live.vDamage"), lang, "critical");
    }
    prevDamage.current = dmg;

    // ── Alertes pneus / freins / moteur (télémétrie) ─────────────────────────
    // Suspendues pendant le warm-up (valeurs non stabilisées au départ).
    if (tel && warmedUp) {
      // Crevaison.
      const flat = tel.wheels.some((w) => w.flat);
      if (flat && !punctureWarned.current) {
        speak(t("live.vPuncture"), lang, "critical");
        punctureWarned.current = true;
      } else if (!flat) {
        punctureWarned.current = false;
      }
      // Roue arrachée.
      const detached = tel.wheels.some((w) => w.detached);
      if (detached && !detachedWarned.current) {
        speak(t("live.vWheelDetached"), lang, "critical");
        detachedWarned.current = true;
      } else if (!detached) {
        detachedWarned.current = false;
      }
      // Pneus en surchauffe : seuil tenu ≥ 10 s, puis silence 2 min (anti-spam).
      const tyreTemps = tel.wheels.map((w) => w.temp).filter((x) => x > 0 && x < 250);
      const maxTyre = tyreTemps.length ? Math.max(...tyreTemps) : 0;
      if (sustainedAlert(tyreHot.current, maxTyre > 115, now, 10000, 120000)) {
        speak(t("live.vTyreOverheat"), lang, "normal");
      }
      // Freins en surchauffe : seuil tenu ≥ 6 s (ignore les pics de freinage), silence 2 min.
      const brakeTemps = tel.wheels.map((w) => w.brake_temp).filter((x) => x > 0);
      const maxBrake = brakeTemps.length ? Math.max(...brakeTemps) : 0;
      if (sustainedAlert(brakeHot.current, maxBrake > 750, now, 6000, 120000)) {
        speak(t("live.vBrakeOverheat"), lang, "critical");
      }
      // Température d'eau / d'huile élevée.
      const engineHot = tel.water_temp > 110 || tel.oil_temp > 140;
      if (engineHot && !engineTempWarned.current) {
        speak(t("live.vEngineTemp"), lang, "normal");
        engineTempWarned.current = true;
      } else if (tel.water_temp > 0 && tel.water_temp < 105 && tel.oil_temp < 130) {
        engineTempWarned.current = false;
      }
    }

    // ── Météo — début de pluie / piste qui sèche / pluie qui s'intensifie ────
    if (weather) {
      const wet = weather.rain > 0.1;
      if (rainWet.current !== null && wet !== rainWet.current) {
        speak(wet ? t("live.vRainStart") : t("live.vRainStop"), lang, "normal");
      }
      rainWet.current = wet;
      if (weather.rain > 0.5 && !rainHeavy.current) {
        speak(t("live.vRainHeavier"), lang, "normal");
        rainHeavy.current = true;
      } else if (weather.rain < 0.3) {
        rainHeavy.current = false;
      }
    }

    // ── Meilleur temps de la session — détenteur annoncé à chaque amélioration ─
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
        speak(
          isPlayer
            ? t("live.vFastestYou", { time: tv })
            : t("live.vFastest", { driver: fastestDriver, time: tv }),
          lang,
          "chatty",
        );
      }
      prevFastest.current = fastest;
    }

    // ── Temps restant (courses au temps : mEndET défini) ─────────────────────
    // Annoncé seulement après **1 tour bouclé** : au tout début, `session_time`/
    // `end_et` peuvent rester sur des valeurs résiduelles de la session précédente
    // (le warm-up de 6 s ne suffit pas toujours) → `remaining` ≤ 60 fugace → faux
    // « dernière minute ». Les vraies annonces de fin arrivent bien après le 1er tour.
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
          speak(t("live.vLastMinute"), lang, "normal");
          timeBucket.current = 60;
        } else if (remaining <= 300 && timeBucket.current > 300) {
          speak(t("live.vTimeRemaining", { min: 5 }), lang, "normal");
          timeBucket.current = 300;
        } else if (remaining <= 600 && timeBucket.current > 600) {
          speak(t("live.vTimeRemaining", { min: 10 }), lang, "normal");
          timeBucket.current = 600;
        }
      }
    }

    // ── Ravitaillement nécessaire pour finir ─────────────────────────────────
    if (player && player.total_laps >= 1) {
      const ff = computeStrategy(sc, player, tel);
      if (ff && ff.fuelToAdd != null && ff.fuelToAdd > 0.5 && !refuelWarned.current) {
        speak(t("live.vRefuelNeeded"), lang, "normal");
        refuelWarned.current = true;
      }
    }
  }, [data, enabled, lang, t]);
}

// ── Composant racine ─────────────────────────────────────────────────────────

export function Live() {
  const [data, setData] = useState<LiveData | null>(null);
  const lastGood = useRef<LiveData | null>(null);
  const [starting, setStarting] = useState(true);
  // null = vérification en cours, true/false = résultat
  const [pluginInstalled, setPluginInstalled] = useState<boolean | null>(null);
  const lmuPath = useAppStore((s) => s.lmuPath);
  const voiceAnnouncements = useAppStore((s) => s.voiceAnnouncements);
  const { t, i18n } = useTranslation();

  // Annonces vocales (activables en config) — drapeaux, carburant, pneus.
  useVoiceCallouts(data, voiceAnnouncements, i18n.language, t);

  // Vérification de la présence du plugin au montage
  useEffect(() => {
    systemApi
      .checkPluginInstalled(lmuPath)
      .then(setPluginInstalled)
      .catch(() => setPluginInstalled(null));
  }, [lmuPath]);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    (async () => {
      try {
        unlisten = await liveApi.onData((d) => {
          if (!cancelled) setData(d);
        });
        await liveApi.startPolling();
      } catch {
        /* hors Tauri */
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
      liveApi.stopPolling().catch(() => {});
    };
  }, []);

  const connected = data?.connected ?? false;
  const paused = data?.paused ?? false;
  const session = data?.session ?? null;
  // session != null ⟺ begin != 0 (session active) ET n_vehicles > 0 (garanti par le Rust).
  // On n'exige plus session_time > 0 : m_current_et peut être 0 en phase de grille/formation.
  const inSession = connected && !!session;

  // Dernier instantané « en session » : on le garde pour continuer d'afficher le
  // tableau de bord (figé, sous un filigrane d'état) pendant les pauses / fins de
  // course — sinon un écran d'info masquerait toutes les infos.
  if (inSession && data) lastGood.current = data;
  const frozen = lastGood.current;

  if (!data && starting)
    return <InfoScreen kind="connecting" pluginInstalled={pluginInstalled} lmuPath={lmuPath} />;

  if (inSession) return <Dashboard data={data!} />;

  // Hors session mais on a déjà eu des données → dashboard figé + filigrane.
  if (frozen) {
    const overlay: OverlayKind = !connected ? "no-game" : paused ? "paused" : "no-session";
    return <Dashboard data={frozen} overlay={overlay} />;
  }

  // Jamais eu de session dans cette visite → écrans d'information classiques.
  if (!connected) return <InfoScreen kind="no-game" pluginInstalled={pluginInstalled} lmuPath={lmuPath} />;
  if (paused) return <InfoScreen kind="paused" pluginInstalled={pluginInstalled} lmuPath={lmuPath} />;
  return <InfoScreen kind="no-session" pluginInstalled={pluginInstalled} lmuPath={lmuPath} />;
}

type OverlayKind = "paused" | "no-session" | "no-game";

// ── Écran d'information (jeu non lancé / pas de session) ─────────────────────

function InfoScreen({
  kind,
  pluginInstalled,
  lmuPath,
}: {
  kind: "connecting" | "no-game" | "no-session" | "paused";
  pluginInstalled: boolean | null;
  lmuPath: string;
}) {
  const { t } = useTranslation();
  // Tutoriel d'installation : auto-déployé si plugin absent, sinon accessible
  // à la demande (lien) sur tous les écrans d'information.
  const [showTuto, setShowTuto] = useState(false);
  const cfg = {
    connecting: {
      icon: <Loader2 className="h-12 w-12 animate-spin text-primary" />,
      title: t("live.connecting"),
      text: t("live.infoConnectingText"),
    },
    "no-game": {
      icon: pluginInstalled === false
        ? <AlertTriangle className="h-12 w-12 text-amber-400" />
        : <WifiOff className="h-12 w-12 text-muted-foreground" />,
      title: pluginInstalled === false
        ? t("live.pluginMissingTitle")
        : t("live.infoNoGameTitle"),
      text: pluginInstalled === false
        ? t("live.pluginMissingText")
        : t("live.noSimHint"),
    },
    "no-session": {
      icon: <Flag className="h-12 w-12 text-yellow-500" />,
      title: t("live.infoNoSessionTitle"),
      text: t("live.infoNoSessionText"),
    },
    paused: {
      icon: <PauseCircle className="h-12 w-12 text-primary" />,
      title: t("live.infoPausedTitle"),
      text: t("live.infoPausedText"),
    },
  }[kind];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center text-foreground gap-6 select-none px-4">
      {cfg.icon}
      <div className="text-center max-w-md">
        <p className="text-lg font-semibold">{cfg.title}</p>
        <p className="text-sm text-muted-foreground mt-1">{cfg.text}</p>
      </div>

      {/* Guide d'installation — auto-déployé si plugin absent, sinon sur demande */}
      {kind !== "connecting" && (pluginInstalled === false || showTuto) && (
        <PluginInstallGuide lmuPath={lmuPath} t={t} />
      )}
      {kind !== "connecting" && pluginInstalled !== false && !showTuto && (
        <button
          type="button"
          onClick={() => setShowTuto(true)}
          className="text-xs text-primary hover:underline"
        >
          {t("live.pluginTutoShow")}
        </button>
      )}

      <Link
        to="/"
        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {t("live.quit")}
      </Link>
    </div>
  );
}

// ── Guide d'installation du plugin ───────────────────────────────────────────

const PLUGIN_DLL = "rFactor2SharedMemoryMapPlugin64.dll";
// Page de release : l'utilisateur télécharge la DLL depuis les assets de release
const PLUGIN_URL =
  "https://github.com/cparfait/lmustatsviewer/releases";

function PluginInstallGuide({
  lmuPath,
  t,
}: {
  lmuPath: string;
  t: Tr;
}) {
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedVars, setCopiedVars] = useState(false);

  const pluginsDir = lmuPath
    ? `${lmuPath.replace(/\\/g, "\\")}\\Plugins`
    : t("live.pluginInstallDefaultDir");
  // Fichier d'activation des plugins (créé/complété par le jeu au lancement).
  const pluginVarsFile = lmuPath
    ? `${lmuPath.replace(/\\/g, "\\")}\\UserData\\player\\CustomPluginVariables.JSON`
    : "...\\UserData\\player\\CustomPluginVariables.JSON";

  function copyToClipboard(text: string, setter: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => {
      setter(true);
      setTimeout(() => setter(false), 2000);
    });
  }

  const steps: { icon: React.ReactNode; label: string; desc?: React.ReactNode }[] = [
    {
      icon: <Download className="h-4 w-4 text-primary" />,
      label: t("live.pluginInstallStep1"),
      desc: (
        <a
          href={PLUGIN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline font-mono text-micro mt-0.5"
        >
          {PLUGIN_DLL}
        </a>
      ),
    },
    {
      icon: <FolderOpen className="h-4 w-4 text-amber-400" />,
      label: t("live.pluginInstallStep2"),
      desc: (
        <div className="flex items-center gap-1.5 mt-1">
          <code className="font-mono text-micro bg-muted/60 px-1.5 py-0.5 rounded text-foreground/80 max-w-[260px] truncate">
            {pluginsDir}
          </code>
          <button
            onClick={() => copyToClipboard(pluginsDir, setCopiedPath)}
            className="shrink-0 p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            title={t("live.pluginInstallCopyPath")}
          >
            {copiedPath ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      ),
    },
    {
      icon: <Settings2 className="h-4 w-4 text-sky-400" />,
      label: t("live.pluginInstallStep3"),
      desc: (
        <div className="mt-0.5 space-y-1">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("live.pluginInstallStep3Desc")}
          </p>
          <div className="flex items-center gap-1.5">
            <code className="font-mono text-micro bg-muted/60 px-1.5 py-0.5 rounded text-foreground/80 max-w-[260px] truncate">
              {pluginVarsFile}
            </code>
            <button
              onClick={() => copyToClipboard(pluginVarsFile, setCopiedVars)}
              className="shrink-0 p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
              title={t("live.pluginInstallCopyPath")}
            >
              {copiedVars ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
          <code className="block font-mono text-micro bg-muted/60 px-1.5 py-0.5 rounded text-foreground/80">
            {'"rFactor2SharedMemoryMapPlugin64.dll": { " Enabled": 1 }'}
          </code>
        </div>
      ),
    },
    {
      icon: <CheckCircle2 className="h-4 w-4 text-success" />,
      label: t("live.pluginInstallStep4"),
    },
  ];

  return (
    <div className="w-full max-w-md rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 space-y-3">
      <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
        {t("live.pluginInstallGuideTitle")}
      </p>

      {/* Explication : pourquoi le plugin est nécessaire */}
      <div className="rounded-lg bg-muted/40 border border-border/60 px-3 py-2.5 space-y-1">
        <p className="text-xs font-semibold text-foreground/90">
          {t("live.pluginInstallWhyTitle")}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t("live.pluginInstallWhyDesc")}
        </p>
      </div>

      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted/60 text-xs font-bold text-muted-foreground">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                {step.icon}
                {step.label}
              </div>
              {step.desc && (
                <div className="text-muted-foreground text-xs">{step.desc}</div>
              )}
            </div>
          </li>
        ))}
      </ol>

      <a
        href={PLUGIN_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full rounded-lg bg-primary/90 hover:bg-primary text-primary-foreground text-xs font-medium py-2 transition-colors"
      >
        <Download className="h-3.5 w-3.5" />
        {t("live.pluginInstallDownload")}
      </a>
    </div>
  );
}

// ── Tableau de bord ──────────────────────────────────────────────────────────

function Dashboard({ data, overlay }: { data: LiveData; overlay?: OverlayKind }) {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  const voiceAnnouncements = useAppStore((s) => s.voiceAnnouncements);
  const aiCoachEnabled = useAppStore((s) => s.aiCoachEnabled);
  const [tab, setTab] = useState<
    "overview" | "telemetry" | "standings" | "map" | "coach"
  >("overview");
  const tel = data.telemetry;
  const player = data.player;
  const sc = data.session;
  const flags = data.flags;
  const ext = data.extended;
  const weather = data.weather;

  const flag = flags
    ? flagFromPhase(flags.game_phase, flags.yellow_flag_state)
    : "none";
  const delta = player ? player.lap_delta : 0;
  const fuelToFinish = computeStrategy(sc, player, tel);

  const overlayLabel =
    overlay === "paused"
      ? t("live.infoPausedTitle")
      : overlay === "no-game"
        ? t("live.infoNoGameTitle")
        : overlay === "no-session"
          ? t("live.infoNoSessionTitle")
          : "";

  return (
    <div className="relative h-screen overflow-hidden bg-background flex flex-col text-foreground select-none">
      {/* Halo « drapeau » clignotant sur les bords (tous onglets) */}
      <FlagOverlay flag={flag} />

      {/* Filigrane d'état (pause / fin de course) — les infos restent visibles dessous */}
      {overlay && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
          <div className="rounded-2xl bg-background/35 px-8 py-4 backdrop-blur-[1px]">
            <div className="text-center text-4xl font-bold uppercase tracking-widest text-foreground/30">
              {overlayLabel}
            </div>
          </div>
        </div>
      )}

      {/* Bandeau supérieur */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border gap-4 flex-wrap">
        <div className="flex items-center gap-8">
          <Stat label={t("live.statPosition")}>
            <span className="text-primary">P{player?.position ?? "–"}</span>
            <span className="text-muted-foreground text-xl">
              /{sc?.num_vehicles ?? "–"}
            </span>
          </Stat>
          <Stat label={t("live.statLap")}>
            {player?.total_laps ?? "–"}
            {sc && sc.max_laps > 0 && sc.max_laps < 1000 && (
              <span className="text-muted-foreground text-xl">
                /{sc.max_laps}
              </span>
            )}
            <PitIndicator
              pitState={player?.pit_state ?? 0}
              numPitstops={player?.num_pitstops ?? 0}
            />
          </Stat>
          <Stat label={sessionLabel(sc?.session ?? -1, t)}>
            <span className="text-2xl">
              {sc ? fmtClock(sc.session_time) : "—"}
            </span>
          </Stat>
        </div>

        {sc?.track && (
          <div className="flex flex-col items-center text-center">
            <span className="text-micro uppercase tracking-widest text-muted-foreground">
              {t("live.statTrack")}
            </span>
            <span className="flex items-center gap-2 font-bold text-2xl leading-none">
              <TrackFlag track={sc.track} className="h-5 w-auto rounded-[2px]" />
              {sc.track}
            </span>
          </div>
        )}

        <div className="flex items-center gap-5 flex-wrap">
          <FlagPill flag={flag} />
          {weather && (
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5" title={t("live.wAir")}>
                <Cloud className="h-4 w-4 text-muted-foreground" />
                {weather.air_temp.toFixed(0)}°
              </span>
              <span
                className="flex items-center gap-1.5"
                title={t("live.wTrack")}
              >
                <Thermometer className="h-4 w-4 text-primary" />
                {weather.track_temp.toFixed(0)}°
              </span>
              <span
                className="flex items-center gap-1.5"
                title={t("live.wWind")}
              >
                <Wind className="h-4 w-4 text-muted-foreground" />
                {weather.wind_speed.toFixed(0)}
              </span>
              <span
                className="flex items-center gap-1.5"
                title={t("live.wRain")}
              >
                <Droplets
                  className={cn(
                    "h-4 w-4",
                    weather.rain > 0.05
                      ? "text-sky-400"
                      : "text-muted-foreground"
                  )}
                />
                {(weather.rain * 100).toFixed(0)}%
              </span>
            </div>
          )}
          <button
            onClick={() =>
              useAppStore
                .getState()
                .setVoiceAnnouncements(!voiceAnnouncements)
            }
            aria-label={t("config.voiceAnnounce")}
            title={
              voiceAnnouncements ? t("live.voiceOn") : t("live.voiceOff")
            }
            className={cn(
              "flex items-center justify-center p-1.5 rounded-md border border-border hover:bg-accent/60",
              voiceAnnouncements
                ? "text-primary border-primary/40"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {voiceAnnouncements ? (
              <Volume2 className="h-3.5 w-3.5" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="flex items-center justify-center p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/60"
          >
            {theme === "dark" ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={() => document.documentElement.requestFullscreen?.()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60"
          >
            <Maximize className="h-3 w-3" /> {t("live.fullscreen")}
          </button>
          <Link
            to="/"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {t("live.quit")}
          </Link>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 px-4 pt-3 border-b border-border">
        {(
          [
            ["overview", t("live.tabOverview")],
            ["telemetry", t("live.tabTelemetry")],
            ["standings", t("live.tabStandings")],
            ["map", t("live.tabMap")],
            ...(aiCoachEnabled ? [["coach", t("live.tabCoach")] as const] : []),
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() =>
              setTab(id as "overview" | "telemetry" | "standings" | "map" | "coach")
            }
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-t-md transition-colors",
              tab === id
                ? "bg-card text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Onglet Vue d'ensemble — version V2 du tableau de bord */}
      {tab === "overview" && <OverviewView data={data} />}

      {/* Onglet Télémétrie */}
      {tab === "telemetry" && (
        <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 xl:grid-cols-2 gap-4 p-4">
          {/* Colonne gauche — pilotage */}
          <div className="flex flex-col gap-4">
            <Panel title={t("live.pPiloting")}>
              <div className="flex items-center justify-around">
                <div className="text-center">
                  <div className="text-micro uppercase tracking-widest text-muted-foreground">
                    {t("live.lSpeed")}
                  </div>
                  <div className="font-mono text-6xl font-bold tabular-nums">
                    {tel ? Math.round(tel.speed_kmh) : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">km/h</div>
                </div>
                <div className="text-center">
                  <div className="text-micro uppercase tracking-widest text-muted-foreground">
                    {t("live.lGear")}
                  </div>
                  <div
                    className={cn(
                      "font-mono text-7xl font-bold leading-none",
                      tel && tel.rpm / Math.max(tel.max_rpm, 1) > 0.95
                        ? "text-destructive"
                        : tel && tel.rpm / Math.max(tel.max_rpm, 1) > 0.8
                          ? "text-yellow-500"
                          : "text-primary"
                    )}
                  >
                    {tel
                      ? tel.gear === 0
                        ? "N"
                        : tel.gear === -1
                          ? "R"
                          : tel.gear
                      : "—"}
                  </div>
                </div>
              </div>
              <RpmBar rpm={tel?.rpm ?? 0} maxRpm={tel?.max_rpm ?? 0} />
              <div className="flex gap-3 mt-1">
                <PedalBar
                  label={t("live.lBrake")}
                  value={tel?.brake ?? 0}
                  color="bg-destructive"
                />
                <PedalBar
                  label={t("live.lThrottle")}
                  value={tel?.throttle ?? 0}
                  color="bg-success"
                />
                <div className="flex-1 flex flex-col justify-end gap-1">
                  <Mini
                    label={t("live.lSteering")}
                    value={pct(tel?.steering ?? 0, true)}
                  />
                  <Mini
                    label={t("live.lClutch")}
                    value={pct(tel?.clutch ?? 0)}
                  />
                </div>
              </div>
            </Panel>

            <Panel title={t("live.pFuel")}>
              {tel && (
                <div className="flex items-center gap-5">
                  <Fuel className="h-9 w-9 text-primary shrink-0" />
                  <div className="grid grid-cols-4 gap-4 flex-1">
                    <KV
                      label={t("live.lTank")}
                      v={`${tel.fuel.toFixed(1)} L`}
                      big
                    />
                    <KV
                      label={t("live.lConsumption")}
                      v={
                        tel.fuel_consumption > 0
                          ? `${tel.fuel_consumption.toFixed(2)} L`
                          : "—"
                      }
                    />
                    <KV
                      label={t("live.lLapsRemaining")}
                      v={
                        tel.fuel_laps_remaining > 0
                          ? `~${Math.floor(tel.fuel_laps_remaining)}`
                          : "—"
                      }
                    />
                    <FuelToFinishKV info={fuelToFinish} />
                  </div>
                </div>
              )}
            </Panel>

            <Panel title={t("live.pEngine")}>
              {tel && (
                <div className="grid grid-cols-3 gap-3">
                  <KV
                    label={t("live.lWater")}
                    v={`${tel.water_temp.toFixed(0)}°C`}
                  />
                  <KV
                    label={t("live.lOil")}
                    v={`${tel.oil_temp.toFixed(0)}°C`}
                  />
                  <KV
                    label={t("live.lTorque")}
                    v={`${Math.round(tel.engine_torque)} Nm`}
                  />
                  <KV
                    label={t("live.lTurbo")}
                    v={`${(tel.turbo_boost / 1000).toFixed(0)} kPa`}
                  />
                  <KV
                    label={t("live.lBrakeBias")}
                    v={`${(tel.rear_brake_bias * 100).toFixed(0)}%`}
                  />
                  <KV
                    label={t("live.lTcAbs")}
                    v={ext ? `${ext.tc} / ${ext.abs}` : "—"}
                  />
                  <KV
                    label={t("live.lFrontTyres")}
                    v={tel.front_compound || "—"}
                  />
                  <KV
                    label={t("live.lRearTyres")}
                    v={tel.rear_compound || "—"}
                  />
                  <KV
                    label={t("live.lPitLimit")}
                    v={
                      ext && ext.pit_speed_limit > 0
                        ? `${Math.round(ext.pit_speed_limit * 3.6)} km/h`
                        : "—"
                    }
                  />
                </div>
              )}
              {tel && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <Tag on={tel.speed_limiter} label={t("live.tagLimiter")} />
                  <Tag on={tel.headlights} label={t("live.tagLights")} />
                  <Tag
                    on={tel.overheating}
                    label={t("live.tagOverheat")}
                    warn
                  />
                  <Tag on={tel.anti_stall} label={t("live.tagAntiStall")} />
                  <Tag on={tel.front_flap} label={t("live.tagFrontFlap")} />
                  <Tag on={tel.rear_flap} label={t("live.tagDrs")} />
                </div>
              )}
            </Panel>
          </div>

          {/* Colonne centrale — chrono + pneus */}
          <div className="flex flex-col gap-4">
            <Panel title={t("live.pTiming")}>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-micro uppercase tracking-widest text-muted-foreground">
                    {t("live.lLastLap")}
                  </div>
                  <div className="font-mono text-3xl font-bold tabular-nums">
                    {fmtLap(player?.last_lap_time ?? 0)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-micro uppercase tracking-widest text-muted-foreground">
                    {t("live.lBestLap")}
                  </div>
                  <div className="font-mono text-3xl font-bold tabular-nums text-primary">
                    {fmtLap(player?.best_lap_time ?? 0)}
                  </div>
                </div>
              </div>
              {delta !== 0 && (
                <div
                  className={cn(
                    "text-center font-mono text-2xl font-bold mt-1",
                    delta < 0 ? "text-success" : "text-destructive"
                  )}
                >
                  {delta < 0 ? "▼" : "▲"} {Math.abs(delta).toFixed(3)} s
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 mt-2">
                {[0, 1, 2].map((i) => {
                  const last = player?.last_sectors[i] ?? 0;
                  const best = player?.best_sectors[i] ?? 0;
                  const isBest = last > 0 && best > 0 && last <= best + 0.001;
                  return (
                    <div
                      key={i}
                      className="rounded-md bg-card border border-border px-2 py-1.5 text-center"
                    >
                      <div className="text-micro uppercase tracking-wide text-muted-foreground">
                        S{i + 1}
                      </div>
                      <div
                        className={cn(
                          "font-mono text-lg font-bold tabular-nums",
                          isBest && "text-purple"
                        )}
                      >
                        {fmtSec(last)}
                      </div>
                      <div className="font-mono text-micro text-muted-foreground">
                        {t("live.best")} {fmtSec(best)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel title={t("live.pTyres")}>
              {tel && (
                <div className="grid grid-cols-2 gap-3">
                  <TireBox label={t("live.tireFL")} w={tel.wheels[0]} />
                  <TireBox label={t("live.tireFR")} w={tel.wheels[1]} />
                  <TireBox label={t("live.tireRL")} w={tel.wheels[2]} />
                  <TireBox label={t("live.tireRR")} w={tel.wheels[3]} />
                </div>
              )}
            </Panel>

            <Panel title={t("live.pDamage")}>
              {tel && (
                <div className="grid grid-cols-3 gap-3">
                  <KV
                    label={t("live.lDamage")}
                    v={`${tel.damage_total.toFixed(0)}%`}
                    danger={tel.damage_total > 20}
                  />
                  <KV
                    label={t("live.lMaxImpact")}
                    v={
                      ext && ext.damage_max_impact > 0
                        ? ext.damage_max_impact.toFixed(0)
                        : "—"
                    }
                  />
                  <KV
                    label={t("live.lAccumImpact")}
                    v={
                      ext && ext.damage_accum_impact > 0
                        ? ext.damage_accum_impact.toFixed(0)
                        : "—"
                    }
                  />
                  <KV
                    label={t("live.lStops")}
                    v={String(player?.num_pitstops ?? 0)}
                  />
                  <KV
                    label={t("live.lPenalties")}
                    v={String(player?.num_penalties ?? 0)}
                    danger={(player?.num_penalties ?? 0) > 0}
                  />
                  <KV
                    label={t("live.lGForces")}
                    v={`${tel.g_long.toFixed(1)} / ${tel.g_lat.toFixed(1)}`}
                  />
                </div>
              )}
              {ext?.status_message && (
                <p className="text-xs text-muted-foreground mt-2 truncate">
                  {ext.status_message}
                </p>
              )}
            </Panel>
          </div>
        </div>
      )}

      {/* Onglet Carte 2D — plein écran */}
      {tab === "map" && (
        <div className="flex-1 min-h-0 p-4">
          <div className="h-full rounded-lg border border-border bg-card/40 p-3">
            <TrackMap data={data} />
          </div>
        </div>
      )}

      {/* Onglet Classement */}
      {tab === "standings" && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <Panel
            title={`${t("live.tabStandings")} (${data.standings.length})`}
          >
            <StandingsTable standings={data.standings} />
          </Panel>
        </div>
      )}

      {/* Onglet Coach IA — question/analyse sur un snapshot live */}
      {tab === "coach" && aiCoachEnabled && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <Panel title={t("live.tabCoach")}>
            <LiveCoachPanel />
          </Panel>
        </div>
      )}
    </div>
  );
}

// ── Onglet Vue d'ensemble (style V2) ─────────────────────────────────────────

/**
 * Tableau de bord « plein-écran » repris de la V2 : grand chrono central
 * (dernier tour + delta + meilleur tour), tuiles SPD / GEA / RPM, et bandeau
 * inférieur Carburant + Écarts + 4 pneus. Pensé pour être lisible à distance.
 */
function OverviewView({ data }: { data: LiveData }) {
  const { t } = useTranslation();
  const tel = data.telemetry;
  const player = data.player;
  const standings = data.standings;

  const last = player?.last_lap_time ?? 0;
  const best = player?.best_lap_time ?? 0;
  const delta = player?.lap_delta ?? 0;

  // Écarts : déduits du classement (le V3 ne fournit pas gap_ahead direct).
  // `time_behind_next` sur la ligne du joueur = écart au pilote devant.
  // L'écart au pilote derrière = `time_behind_next` du pilote en position+1.
  const playerStanding = standings.find((s) => s.is_player);
  const gapAhead = playerStanding?.time_behind_next ?? 0;
  const gapBehind =
    playerStanding != null
      ? (standings.find((s) => s.position === playerStanding.position + 1)
          ?.time_behind_next ?? 0)
      : 0;

  // Tours restants estimés (carburant restant / conso au tour).
  const fuelLaps =
    tel && tel.fuel_laps_remaining > 0 ? Math.floor(tel.fuel_laps_remaining) : 0;
  const fuelToFinish = computeStrategy(data.session, player, tel);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
      {/* Centre — grand chrono */}
      <div className="flex-1 flex items-center justify-center px-10 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 w-full max-w-6xl">
          {/* Tour en cours + dernier tour + delta + meilleur tour */}
          <div className="flex flex-col items-center justify-center text-center">
            <span className="text-sm uppercase tracking-[0.3em] text-muted-foreground mb-2">
              {t("live.lCurrentLap")}
            </span>
            <span
              className={cn(
                "font-mono text-6xl font-bold tracking-tighter tabular-nums",
                (player?.current_lap_time ?? 0) > 0
                  ? "text-primary"
                  : "text-muted-foreground/40"
              )}
            >
              {fmtLap(player?.current_lap_time ?? 0)}
            </span>

            <span className="mt-8 text-sm uppercase tracking-[0.3em] text-muted-foreground mb-2">
              {t("live.lLastLap")}
            </span>
            <span className="font-mono text-8xl font-bold tracking-tighter tabular-nums">
              {fmtLap(last)}
            </span>
            <span
              className={cn(
                "mt-2 font-mono text-3xl font-bold",
                delta < 0 ? "text-success" : "text-destructive"
              )}
            >
              {delta !== 0 && last > 0 ? (
                <>
                  {delta < 0 ? "▼" : "▲"} {Math.abs(delta).toFixed(3)}
                </>
              ) : null}
            </span>

            <div className="mt-12 flex flex-col items-center">
              <span className="text-sm uppercase tracking-[0.3em] text-muted-foreground mb-2">
                {t("live.lBestLap")}
              </span>
              <span className="font-mono text-5xl font-bold tracking-tight tabular-nums text-primary">
                {fmtLap(best)}
              </span>
            </div>
          </div>

          {/* SPD / GEA / RPM */}
          <div className="flex flex-col justify-center gap-5">
            <div className="flex items-center justify-between gap-6 px-5 py-3 rounded-lg bg-card border border-border">
              <div className="flex items-center gap-4">
                <span className="font-mono text-3xl font-bold text-muted-foreground w-12">
                  SPD
                </span>
                <span className="h-3 w-3 rounded-full bg-success" />
              </div>
              <span className="font-mono text-4xl font-bold tabular-nums">
                {tel ? tel.speed_kmh.toFixed(0) : "———"}{" "}
                <span className="text-lg text-muted-foreground">km/h</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-6 px-5 py-3 rounded-lg bg-card border border-border">
              <div className="flex items-center gap-4">
                <span className="font-mono text-3xl font-bold text-muted-foreground w-12">
                  GEA
                </span>
                <span className="h-3 w-3 rounded-full bg-primary" />
              </div>
              <span className="font-mono text-4xl font-bold tabular-nums">
                {tel
                  ? tel.gear === 0
                    ? "N"
                    : tel.gear === -1
                      ? "R"
                      : `${tel.gear}`
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-6 px-5 py-3 rounded-lg bg-card border border-border">
              <div className="flex items-center gap-4">
                <span className="font-mono text-3xl font-bold text-muted-foreground w-12">
                  RPM
                </span>
                <span
                  className={cn(
                    "h-3 w-3 rounded-full",
                    tel && tel.max_rpm > 0 && tel.rpm / tel.max_rpm > 0.95
                      ? "bg-destructive"
                      : tel && tel.max_rpm > 0 && tel.rpm / tel.max_rpm > 0.8
                        ? "bg-yellow-500"
                        : "bg-success"
                  )}
                />
              </div>
              <span className="font-mono text-4xl font-bold tabular-nums">
                {tel ? tel.rpm.toFixed(0) : "————"}{" "}
                <span className="text-lg text-muted-foreground">
                  / {tel ? tel.max_rpm.toFixed(0) : "———"}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bandeau inférieur — carburant + écarts + pneus */}
      <div className="border-t border-border px-10 py-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Carburant */}
        <div className="flex items-center gap-5">
          <Fuel className="h-9 w-9 text-primary" />
          <div className="flex flex-col">
            <span className="text-micro uppercase tracking-widest text-muted-foreground">
              {t("live.fuel")}
            </span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-4xl font-bold tabular-nums">
                {tel ? tel.fuel.toFixed(1) : "——.—"}
              </span>
              <span className="font-mono text-lg text-muted-foreground">L</span>
              {fuelLaps > 0 && (
                <span className="ml-3 font-mono text-base text-muted-foreground">
                  → ~{fuelLaps} {t("live.laps")}
                </span>
              )}
            </div>
            {fuelToFinish && fuelToFinish.fuelToAdd != null && (
              <span
                className={cn(
                  "mt-1 font-mono text-sm font-bold tabular-nums",
                  fuelToFinish.fuelToAdd > 0.05
                    ? "text-destructive"
                    : "text-success"
                )}
                title={t("live.fuelNeededFor", {
                  laps: fuelToFinish.sessionLapsLeft,
                  total: fuelToFinish.fuelNeeded!.toFixed(1),
                })}
              >
                {t("live.lFuelToFinish")} :{" "}
                {fuelToFinish.fuelToAdd > 0.05
                  ? `+${fuelToFinish.fuelToAdd.toFixed(1)} L`
                  : `✓ ${Math.abs(fuelToFinish.fuelToAdd).toFixed(1)} L`}
              </span>
            )}
          </div>
        </div>

        {/* Écarts devant / derrière */}
        <div className="flex items-center justify-center gap-8">
          <div className="flex flex-col items-end">
            <span className="text-micro uppercase tracking-widest text-muted-foreground">
              {t("live.ahead")}
            </span>
            <span
              className={cn(
                "font-mono text-3xl font-bold tabular-nums",
                gapAhead > 0 ? "text-success" : "text-muted-foreground"
              )}
            >
              {gapAhead > 0 ? `-${gapAhead.toFixed(3)}` : "—.———"}
            </span>
          </div>
          <div className="h-12 w-px bg-border" />
          <div className="flex flex-col items-start">
            <span className="text-micro uppercase tracking-widest text-muted-foreground">
              {t("live.behind")}
            </span>
            <span className="font-mono text-3xl font-bold tabular-nums text-muted-foreground">
              {gapBehind > 0 ? `+${gapBehind.toFixed(3)}` : "—.———"}
            </span>
          </div>
        </div>

        {/* 4 pneus */}
        <div className="grid grid-cols-2 gap-3">
          <TireMini pos="FL" w={tel?.wheels[0]} />
          <TireMini pos="FR" w={tel?.wheels[1]} />
          <TireMini pos="RL" w={tel?.wheels[2]} />
          <TireMini pos="RR" w={tel?.wheels[3]} />
        </div>
      </div>
    </div>
  );
}

/** Pneu compact pour la vue d'ensemble : température + usure. */
function TireMini({ pos, w }: { pos: string; w?: LiveWheel }) {
  const temp = w?.temp ?? 0;
  const wear = w?.wear ?? 0;
  return (
    <div className="flex flex-col gap-0.5 px-3 py-1.5 rounded-md bg-card border border-border">
      <span className="text-micro uppercase tracking-widest text-muted-foreground">
        {pos}
      </span>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-mono text-xl font-bold tabular-nums",
            temp > 0 ? tempColor(temp) : ""
          )}
        >
          {temp > 0 ? `${temp.toFixed(0)}°` : "——°"}
        </span>
        <span
          className={cn(
            "font-mono text-sm tabular-nums",
            wear > 0 ? wearColor(wear) : ""
          )}
        >
          {wear > 0 ? `${Math.round(wear)}%` : "——%"}
        </span>
      </div>
    </div>
  );
}

// ── Sous-composants ──────────────────────────────────────────────────────────

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-micro uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-4xl font-bold leading-none tabular-nums">
        {children}
      </span>
    </div>
  );
}

/**
 * Indicateur d'arrêt au stand affiché à côté du compteur de tours :
 *  - Badge animé quand le pilote est dans la voie des stands (entrée/stand/sortie).
 *  - Compteur d'arrêts effectués (×N) toujours visible si > 0.
 *
 * Valeurs `pit_state` (rF2) :
 *  0 = aucun · 1 = demandé · 2 = entrée pit lane · 3 = à l'arrêt
 *  4 = sortie pit lane.
 */
function PitIndicator({
  pitState,
  numPitstops,
}: {
  pitState: number;
  numPitstops: number;
}) {
  const { t } = useTranslation();

  // Configuration visuelle par état (libellé + couleur + pulsation).
  const live = (() => {
    switch (pitState) {
      case 1:
        return {
          label: t("live.pitRequest"),
          cls: "bg-yellow-500/15 text-yellow-500",
          pulse: false,
        };
      case 2:
        return {
          label: t("live.pitIn"),
          cls: "bg-primary/25 text-yellow-300",
          pulse: true,
        };
      case 3:
        return {
          label: t("live.pitStop"),
          cls: "bg-destructive/25 text-destructive",
          pulse: true,
        };
      case 4:
        return {
          label: t("live.pitOut"),
          cls: "bg-success/20 text-success",
          pulse: true,
        };
      default:
        return null;
    }
  })();

  if (!live && numPitstops <= 0) return null;

  return (
    <span className="inline-flex items-center gap-1.5 ml-2 align-middle">
      {live && (
        <span
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold tracking-widest text-micro",
            live.cls,
            live.pulse && "animate-pulse"
          )}
          title={live.label}
        >
          {live.label}
        </span>
      )}
      {numPitstops > 0 && (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-micro font-bold tabular-nums"
          title={t("live.pitstopsTotal", { count: numPitstops })}
        >
          ×{numPitstops}
        </span>
      )}
    </span>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/40">
      <div className="px-3 py-1.5 border-b border-border/60 text-mini font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        <GaugeIcon className="h-3 w-3" />
        {title}
      </div>
      <div className="p-3 flex flex-col gap-2">{children}</div>
    </div>
  );
}

function RpmBar({ rpm, maxRpm }: { rpm: number; maxRpm: number }) {
  const r = maxRpm > 0 ? Math.min(rpm / maxRpm, 1) : 0;
  return (
    <div className="h-2.5 rounded-full bg-muted overflow-hidden">
      <div
        className={cn(
          "h-full transition-all",
          r > 0.95 ? "bg-destructive" : r > 0.8 ? "bg-yellow-500" : "bg-success"
        )}
        style={{ width: `${r * 100}%` }}
      />
    </div>
  );
}

function PedalBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 w-14">
      <div className="h-20 w-7 rounded bg-muted overflow-hidden flex flex-col-reverse">
        <div
          className={cn("w-full transition-all", color)}
          style={{ height: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        />
      </div>
      <span className="text-micro text-muted-foreground">{label}</span>
      <span className="font-mono text-xs font-bold">
        {Math.round(Math.max(0, Math.min(1, value)) * 100)}%
      </span>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded bg-card border border-border px-2 py-1">
      <span className="text-micro text-muted-foreground">{label}</span>
      <span className="font-mono text-xs font-bold">{value}</span>
    </div>
  );
}

function KV({
  label,
  v,
  big,
  danger,
}: {
  label: string;
  v: string;
  big?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-micro uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "font-mono font-bold tabular-nums",
          big ? "text-xl" : "text-sm",
          danger && "text-destructive"
        )}
      >
        {v}
      </span>
    </div>
  );
}

/**
 * Métrique « carburant pour finir » : carburant à ajouter pour terminer.
 *  - manque → `+X.X L` en rouge (il faut ravitailler).
 *  - suffisant → `✓ X.X L` en vert (surplus restant).
 */
function FuelToFinishKV({ info }: { info: StrategySnapshot | null }) {
  const { t } = useTranslation();
  if (!info || info.fuelToAdd == null || info.fuelNeeded == null) {
    return <KV label={t("live.lFuelToFinish")} v="—" />;
  }
  const need = info.fuelToAdd > 0.05;
  return (
    <div className="flex flex-col" title={t("live.fuelNeededFor", { laps: info.sessionLapsLeft, total: info.fuelNeeded.toFixed(1) })}>
      <span className="text-micro uppercase tracking-wide text-muted-foreground">
        {t("live.lFuelToFinish")}
      </span>
      <span
        className={cn(
          "font-mono font-bold tabular-nums text-sm",
          need ? "text-destructive" : "text-success"
        )}
      >
        {need
          ? `+${info.fuelToAdd.toFixed(1)} L`
          : `✓ ${Math.abs(info.fuelToAdd).toFixed(1)} L`}
      </span>
    </div>
  );
}

function Tag({
  on,
  label,
  warn,
}: {
  on: boolean;
  label: string;
  warn?: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-micro font-medium border",
        on
          ? warn
            ? "bg-destructive/20 text-destructive border-destructive/40"
            : "bg-success/15 text-success border-success/30"
          : "bg-muted text-muted-foreground border-border"
      )}
    >
      {label}
    </span>
  );
}

function FlagPill({ flag }: { flag: FlagKind }) {
  const { t } = useTranslation();
  const cfg: Record<FlagKind, { label: string; cls: string }> = {
    green: { label: t("live.flagGreen"), cls: "bg-success/20 text-success" },
    yellow: {
      label: t("live.flagYellow"),
      cls: "bg-yellow-500/20 text-yellow-500 animate-pulse",
    },
    fcy: {
      label: t("live.flagFcy"),
      cls: "bg-yellow-500/30 text-yellow-500 animate-pulse",
    },
    stopped: {
      label: t("live.flagStopped"),
      cls: "bg-destructive/20 text-destructive",
    },
    over: { label: t("live.flagOver"), cls: "bg-muted text-muted-foreground" },
    none: { label: "—", cls: "bg-muted text-muted-foreground" },
  };
  const c = cfg[flag];
  // Format harmonisé sur ClassBadge/SessionBadge (rounded-full, text-micro).
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0 text-micro font-semibold uppercase tracking-wide whitespace-nowrap",
        c.cls
      )}
    >
      <Flag className="h-3 w-3" />
      <span>
        {c.label}
      </span>
    </div>
  );
}

/** Durée d'affichage du halo vert après le passage au drapeau vert (ms). */
const GREEN_HALO_MS = 5000;

/**
 * Halo coloré sur les bords de l'écran, selon le drapeau en cours. Couvre toute
 * la page Live (tous les onglets). `pointer-events-none` → n'interfère pas avec
 * les clics. Drapeaux de prudence (jaune / FCY / rouge) → halo clignotant tant
 * qu'ils sont actifs ; vert → halo bref (apparaît au passage au vert puis
 * s'estompe après quelques secondes, c'est un simple « top départ ») ; aucun /
 * damier → rien.
 */
function FlagOverlay({ flag }: { flag: FlagKind }) {
  const [greenVisible, setGreenVisible] = useState(false);

  // Le halo vert n'est qu'un signal de (re)départ : on le montre au passage au
  // vert puis on le masque après GREEN_HALO_MS (le drapeau, lui, reste « green »
  // toute la phase verte). Tout autre drapeau le réinitialise.
  useEffect(() => {
    if (flag !== "green") {
      setGreenVisible(false);
      return;
    }
    setGreenVisible(true);
    const id = setTimeout(() => setGreenVisible(false), GREEN_HALO_MS);
    return () => clearTimeout(id);
  }, [flag]);

  if (flag === "none" || flag === "over") return null;

  if (flag === "green") {
    // Fondu sortant (1 s) une fois le délai écoulé.
    return (
      <div
        className="pointer-events-none fixed inset-0 z-50 transition-opacity duration-1000"
        style={{
          boxShadow: "inset 0 0 70px 10px #22c55e",
          opacity: greenVisible ? 0.4 : 0,
        }}
      />
    );
  }

  const color: Record<"yellow" | "fcy" | "stopped", string> = {
    yellow: "#eab308",
    fcy: "#eab308",
    stopped: "#ef4444",
  };
  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 animate-flag-blink"
      style={{ boxShadow: `inset 0 0 70px 10px ${color[flag]}` }}
    />
  );
}

function tempColor(t: number): string {
  if (t <= 0) return "text-muted-foreground";
  if (t > 110) return "text-destructive";
  if (t > 95) return "text-yellow-500";
  if (t < 70) return "text-sky-400";
  return "text-success";
}
function wearColor(w: number): string {
  if (w < 30) return "text-destructive";
  if (w < 60) return "text-yellow-500";
  return "text-foreground";
}

function TireBox({ label, w }: { label: string; w: LiveWheel }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md bg-card border border-border p-2 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-micro uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {(w.flat || w.detached) && (
          <AlertTriangle className="h-3 w-3 text-destructive" />
        )}
      </div>
      <div className="flex items-baseline justify-between">
        <span className={cn("font-mono text-xl font-bold", tempColor(w.temp))}>
          {w.temp > 0 ? `${w.temp.toFixed(0)}°` : "—"}
        </span>
        <span className={cn("font-mono text-sm font-bold", wearColor(w.wear))}>
          {w.wear.toFixed(0)}%
        </span>
      </div>
      <div className="flex gap-0.5">
        {w.temp3.map((temp, i) => (
          <div
            key={i}
            className={cn(
              "flex-1 h-1.5 rounded-sm",
              temp > 110
                ? "bg-destructive"
                : temp > 95
                  ? "bg-yellow-500"
                  : temp < 70
                    ? "bg-sky-400"
                    : "bg-success"
            )}
            title={`${temp.toFixed(0)}°C`}
          />
        ))}
      </div>
      <div className="flex justify-between text-micro text-muted-foreground font-mono">
        <span>{w.pressure.toFixed(0)} kPa</span>
        <span>
          {t("live.tireBrake")}{" "}
          {w.brake_temp >= 0 ? `${w.brake_temp.toFixed(0)}°` : "—"}
        </span>
      </div>
    </div>
  );
}

// ── Carte 2D du circuit ──────────────────────────────────────────────────────

function TrackMap({ data }: { data: LiveData }) {
  const { t } = useTranslation();
  const pts = data.track_points;
  if (pts.length < 8) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-1 text-muted-foreground">
        <p className="text-sm">{t("live.mapAcquiring")}</p>
        <p className="text-xs">{t("live.mapPersist")}</p>
      </div>
    );
  }

  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[1]);
    maxZ = Math.max(maxZ, p[1]);
  }
  for (const s of data.standings) {
    if (s.pos_x === 0 && s.pos_z === 0) continue;
    minX = Math.min(minX, s.pos_x);
    maxX = Math.max(maxX, s.pos_x);
    minZ = Math.min(minZ, s.pos_z);
    maxZ = Math.max(maxZ, s.pos_z);
  }
  const w = maxX - minX || 1;
  const h = maxZ - minZ || 1;
  const pad = 0.08;
  const mapX = (x: number) =>
    ((x - minX) / w) * (1 - 2 * pad) * 1000 + pad * 1000;
  const mapY = (z: number) =>
    (1 - (z - minZ) / h) * (1 - 2 * pad) * 1000 + pad * 1000;

  const path = pts
    .map((p) => `${mapX(p[0]).toFixed(1)},${mapY(p[1]).toFixed(1)}`)
    .join(" ");

  return (
    <div className="w-full h-full flex items-center justify-center">
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
      >
        <polygon
          points={path}
          fill="none"
          stroke="#1c2533"
          strokeWidth={30}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polygon
          points={path}
          fill="none"
          stroke="#46597a"
          strokeWidth={3}
          strokeDasharray="3 14"
          strokeLinejoin="round"
        />
        {data.standings.map((s) => {
          if (s.pos_x === 0 && s.pos_z === 0) return null;
          return (
            <g key={s.position}>
              <circle
                cx={mapX(s.pos_x)}
                cy={mapY(s.pos_z)}
                r={s.is_player ? 20 : 13}
                fill={
                  s.is_player ? "#FFB400" : s.in_pits ? "#6b7280" : "#60a5fa"
                }
                stroke="#0A0E1A"
                strokeWidth={3}
              >
                <title>
                  P{s.position} {s.driver}
                </title>
              </circle>
              <text
                x={mapX(s.pos_x)}
                y={mapY(s.pos_z) + (s.is_player ? 7 : 5)}
                textAnchor="middle"
                fontSize={s.is_player ? 22 : 15}
                fontWeight="bold"
                fill="#0A0E1A"
              >
                {s.position}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Classement ───────────────────────────────────────────────────────────────

function StandingsTable({ standings }: { standings: LiveStanding[] }) {
  const { t } = useTranslation();
  const sectorOf = (s: LiveStanding, i: number) =>
    i === 0 ? s.last_s1 : i === 1 ? s.last_s2 : s.last_s3;
  const sectorBest = (s: LiveStanding, i: number) =>
    i === 0
      ? s.is_class_best_s1
      : i === 1
        ? s.is_class_best_s2
        : s.is_class_best_s3;
  return (
    <Table className="w-full text-xs">
        {/* En-tête ambre propre au Live : on neutralise les défauts dorés des
            primitives (tint primary, texte jaune) via des overrides `[&_tr]`/`[&_th]`. */}
        <TableHeader className="[&_tr]:bg-amber-500/15 dark:[&_tr]:bg-amber-500/15 [&_tr]:border-y [&_tr]:border-amber-500/40 [&_tr]:hover:bg-amber-500/15 [&_th]:text-amber-700 dark:[&_th]:text-amber-200 [&_th]:font-medium">
          <TableRow>
            <TableHead className="text-center px-2 py-1">{t("live.stPos")}</TableHead>
            <TableHead className="text-center px-1 py-1">{t("live.stCls")}</TableHead>
            <TableHead className="text-left px-2 py-1">{t("live.stDriver")}</TableHead>
            <TableHead className="text-left px-2 py-1">{t("live.stCar")}</TableHead>
            <TableHead className="text-left px-2 py-1">{t("live.stClass")}</TableHead>
            <TableHead className="text-right px-2 py-1">{t("live.stLast")}</TableHead>
            <TableHead className="text-right px-2 py-1">{t("live.stBest")}</TableHead>
            <TableHead className="text-right px-1.5 py-1">S1</TableHead>
            <TableHead className="text-right px-1.5 py-1">S2</TableHead>
            <TableHead className="text-right px-1.5 py-1">S3</TableHead>
            <TableHead className="text-right px-2 py-1">{t("live.stGap")}</TableHead>
            <TableHead className="text-center px-1.5 py-1">{t("live.stStops")}</TableHead>
            <TableHead className="text-center px-1.5 py-1">{t("live.stPen")}</TableHead>
            <TableHead className="text-left px-2 py-1">{t("live.stState")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {standings.map((s) => {
            const classColor = liveClassColor(s.vehicle_class);
            return (
            <TableRow
              key={s.position}
              className={cn(
                "border-b border-border/40",
                s.is_player && "bg-primary/10",
                s.in_pits && "opacity-60"
              )}
              style={
                classColor
                  ? { boxShadow: `inset 3px 0 0 ${classColor}` }
                  : undefined
              }
            >
              <TableCell className={cn("text-center px-2 py-1 font-bold", podiumColor(s.position))}>
                {s.position}
              </TableCell>
              <TableCell className="text-center px-1 py-1 text-muted-foreground">
                {s.class_position}
              </TableCell>
              <TableCell
                className={cn(
                  "px-2 py-1 font-medium whitespace-nowrap",
                  s.is_player && "text-primary"
                )}
              >
                {s.driver}
              </TableCell>
              <TableCell className="px-2 py-1 whitespace-nowrap text-muted-foreground">
                {s.vehicle_name}
              </TableCell>
              <TableCell className="px-2 py-1 whitespace-nowrap">
                <ClassBadge carClass={liveClassKey(s.vehicle_class)} />
              </TableCell>
              <TableCell className="text-right px-2 py-1 font-mono">
                {fmtLap(s.last_lap_time)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right px-2 py-1 font-mono",
                  s.is_class_best_lap && "text-purple font-semibold"
                )}
              >
                {fmtLap(s.best_lap_time)}
              </TableCell>
              {[0, 1, 2].map((i) => (
                <TableCell
                  key={i}
                  className={cn(
                    "text-right px-1.5 py-1 font-mono",
                    sectorBest(s, i) && "text-purple font-semibold"
                  )}
                >
                  {fmtSec(sectorOf(s, i))}
                </TableCell>
              ))}
              <TableCell className="text-right px-2 py-1 font-mono">
                {s.position === 1
                  ? "—"
                  : fmtGap(s.time_behind_leader, s.laps_behind_leader, t)}
              </TableCell>
              <TableCell className="text-center px-1.5 py-1">{s.num_pitstops}</TableCell>
              <TableCell
                className={cn(
                  "text-center px-1.5 py-1",
                  s.num_penalties > 0 && "text-destructive font-bold"
                )}
              >
                {s.num_penalties}
              </TableCell>
              <TableCell className="px-2 py-1 whitespace-nowrap text-muted-foreground">
                {s.in_pits
                  ? t("live.statePit")
                  : s.finish_status === 2
                    ? "DNF"
                    : s.finish_status === 3
                      ? "DQ"
                      : s.finish_status === 1
                        ? t("live.stateFinished")
                        : t("live.stateRunning")}
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
  );
}
