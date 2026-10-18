/**
 * État partagé de l'ingénieur de course (singleton de module).
 *
 * Alimenté par la boucle des annonces live (page Live) et lu par le
 * push-to-talk (monté au niveau de l'app) : les deux doivent voir la même
 * fenêtre d'arrêt, les mêmes tendances d'écart, les mêmes alertes posées.
 */

import { ClosingTracker } from "./closing";
import { EnergyTracker, PitWindowTracker } from "./pitWindow";
import { WatchList } from "./watches";
import { RadioPolicy } from "./policy";
import { BrakeMap, type DriverSnapshot } from "./focus";
import type { WetData } from "./forecast";
import { PadWearTracker } from "@/lib/lmuRest";
import { StintRegistry } from "./rivalStints";
import { TyreWearTracker, WarmupTracker, WetnessTrend } from "./tyres";
import type { LapPref, LapPrefs, SessionKind } from "./prefs";
import { PenaltyTracker } from "./penalties";
import { PressureWatcher } from "./pressures";
import { PitTrafficWatcher } from "./pitTraffic";
import { AlarmClock } from "./alarm";

export interface ForecastState {
  data: WetData;
  file: string;
}

class EngineerState {
  closing = new ClosingTracker();
  energy = new EnergyTracker();
  /** Usure des plaquettes par tour (donnée du jeu via le pont REST). */
  pads = new PadWearTracker();
  pit = new PitWindowTracker();
  /** Arrêts et relais de tout le plateau (registre des arrêts adverses). */
  stints = new StintRegistry();
  /** Usure des pneus du joueur par roue et par tour. */
  tyreWear = new TyreWearTracker();
  /** Humidité de la trajectoire (tendance) : pluie ou slicks. */
  wetness = new WetnessTrend();
  /** Coût de chauffe des pneus mesuré sur tout le plateau. */
  warmup = new WarmupTracker();
  /** Coûts de chauffe mémorisés (`circuit::classe` → s), chargés au démarrage. */
  warmupPrior: Record<string, number> = {};
  /** Préférences radio apprises (chronos par type de séance), persistées. */
  lapPrefs: LapPrefs = { prefs: {}, asked: [] };
  /** Branché par la boucle de l'ingénieur : persiste `lapPrefs` après un changement. */
  onPrefsChanged: (() => void) | null = null;

  setLapPref(kind: SessionKind, pref: LapPref): void {
    this.lapPrefs = { ...this.lapPrefs, prefs: { ...this.lapPrefs.prefs, [kind]: pref } };
    this.onPrefsChanged?.();
  }

  markAsked(kind: SessionKind): void {
    if (this.lapPrefs.asked.includes(kind)) return;
    this.lapPrefs = { ...this.lapPrefs, asked: [...this.lapPrefs.asked, kind] };
    this.onPrefsChanged?.();
  }
  watches = new WatchList();
  /** Fichier `.wet` retenu pour le circuit courant (non validé). */
  forecast: ForecastState | null = null;
  /** La prévision a été confrontée à la mesure live de cette session et colle. */
  forecastValid = false;
  /** Dernier tour où un message de fenêtre d'arrêt / box a été dit. */
  lastPitCallLap = -99;
  /** Tours bouclés du joueur (dernière valeur vue). */
  lap = 0;
  /** Arrêts aux stands du joueur (dernière valeur vue). */
  pitstops = 0;
  /** Régimes radio posés à la voix, phases de course, budgets. */
  policy = new RadioPolicy();
  /** Freinages appris (silence anticipé avant les zones de freinage). */
  brakes = new BrakeMap();
  /** Dernier état de pilotage vu (garde « pilote occupé » de la file vocale). */
  driver: DriverSnapshot | null = null;
  /** Pénalités (compteur + centre de messages du jeu) — réponses « ai-je une pénalité ? ». */
  penalties = new PenaltyTracker();
  /** Pressions des pneus (perte de pression, fenêtre). */
  pressures = new PressureWatcher();
  /** Box partagé et trafic à la sortie des stands. */
  pitTraffic = new PitTrafficWatcher();
  /** Réveil radio (heure du PC) : survit aux changements de session. */
  alarms = new AlarmClock();
  /** Un autre ingénieur radio tourne (mode cohabitation actif). */
  otherEngineer = false;

  /** Nouvelle session : repart de zéro (les alertes posées sont effacées). */
  resetSession(): void {
    this.closing.reset();
    this.energy.reset();
    this.pads.reset();
    this.pit.reset();
    this.stints.reset();
    this.tyreWear.reset();
    this.wetness.reset();
    this.warmup.reset();
    this.watches.clear();
    this.forecastValid = false;
    this.lastPitCallLap = -99;
    this.lap = 0;
    this.pitstops = 0;
    this.policy.reset();
    this.penalties.reset();
    this.pressures.reset();
    this.pitTraffic.reset();
    // Les freinages appris restent : ils appartiennent au circuit, pas à la
    // session (essais → qualif → course). `brakes.setTrack` repart de zéro au
    // changement de circuit.
    this.driver = null;
  }
}

export const engineer = new EngineerState();
