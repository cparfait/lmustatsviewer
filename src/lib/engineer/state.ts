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

  /** Nouvelle session : repart de zéro (les alertes posées sont effacées). */
  resetSession(): void {
    this.closing.reset();
    this.energy.reset();
    this.pads.reset();
    this.pit.reset();
    this.watches.clear();
    this.forecastValid = false;
    this.lastPitCallLap = -99;
    this.lap = 0;
    this.pitstops = 0;
    this.policy.reset();
    // Les freinages appris restent : ils appartiennent au circuit, pas à la
    // session (essais → qualif → course). `brakes.setTrack` repart de zéro au
    // changement de circuit.
    this.driver = null;
  }
}

export const engineer = new EngineerState();
