/**
 * Programme d'essais coché tout seul (module pur).
 *
 * Avant une course, il faut avoir mesuré : le rythme, la conso, l'usure des
 * pneus, le rythme réservoir plein et la perte au stand ; en option un relais
 * long (dégradation), la chauffe des pneus et la pluie. Chaque tour bouclé fait
 * avancer les compteurs, par circuit × voiture, d'une séance à l'autre.
 * « Tour propre » = hors stands, pas le tour de sortie, ≤ 102 % du meilleur tour.
 */

import type { LiveData } from "@/lib/api";

export type PrepTask = "pace" | "fuel" | "wear" | "fullTank" | "pitLoss" | "longRun" | "warmup" | "wet";

export const REQUIRED: PrepTask[] = ["pace", "fuel", "wear", "fullTank", "pitLoss"];
export const OPTIONAL: PrepTask[] = ["longRun", "warmup", "wet"];

/** Objectif de chaque tâche (tours, ou 1 pour une mesure faite/pas faite). */
export const GOALS: Record<PrepTask, number> = { pace: 3, fuel: 3, wear: 1, fullTank: 3, pitLoss: 1, longRun: 8, warmup: 1, wet: 3 };

/** Réservoir « plein » au départ d'un relais (fraction de la capacité). */
export const FULL_TANK_FRAC = 0.55;
/** Tour propre : au plus ce facteur du meilleur tour. */
export const CLEAN_FACTOR = 1.02;
/** Humidité de trajectoire à partir de laquelle un tour compte « pluie ». */
export const WET_MIN = 0.12;

export interface PrepState {
  pace: number;
  fuel: number;
  wear: number;
  fullTank: number;
  pitLoss: number;
  /** Plus long relais de tours propres d'affilée. */
  longRun: number;
  warmup: number;
  wet: number;
}

export const emptyPrep = (): PrepState => ({ pace: 0, fuel: 0, wear: 0, fullTank: 0, pitLoss: 0, longRun: 0, warmup: 0, wet: 0 });

export function isDone(s: PrepState, task: PrepTask): boolean {
  return s[task] >= GOALS[task];
}

/** Toutes les tâches obligatoires sont faites. */
export function ready(s: PrepState): boolean {
  return REQUIRED.every((k) => isDone(s, k));
}

export interface PrepExtras {
  /** La perte au stand est connue pour ce circuit × voiture. */
  pitLossKnown: boolean;
  /** Le coût de chauffe est connu pour ce circuit × classe. */
  warmupKnown: boolean;
  /** L'usure par tour des pneus est mesurée. */
  wearKnown: boolean;
}

/** Suit les tours du joueur et fait avancer un `PrepState` (fusion par max). */
export class PrepTracker {
  private laps = -1;
  private stops = -1;
  /** Tours bouclés depuis la sortie des stands (0 = tour de sortie en cours). */
  private stintLap = 0;
  private run = 0;
  private fullTankStint = false;
  private fullTankLaps = 0;
  private wasInPits = true;

  reset(): void {
    this.laps = -1;
    this.stops = -1;
    this.stintLap = 0;
    this.run = 0;
    this.fullTankStint = false;
    this.fullTankLaps = 0;
    this.wasInPits = true;
  }

  /** Renvoie l'état mis à jour, ou null si rien n'a changé. */
  push(d: LiveData, state: PrepState, x: PrepExtras): PrepState | null {
    const me = d.standings.find((s) => s.is_player);
    const p = d.player;
    const tel = d.telemetry;
    if (!me || !p) return null;
    let next: PrepState | null = null;
    const bump = (k: keyof PrepState, v: number) => {
      const cur = (next ?? state)[k];
      if (v > cur) next = { ...(next ?? state), [k]: v };
    };
    if (x.pitLossKnown) bump("pitLoss", 1);
    if (x.warmupKnown) bump("warmup", 1);
    if (x.wearKnown) bump("wear", 1);

    // Sortie des stands : nouveau relais, réservoir lu au départ.
    if (this.wasInPits && !me.in_pits) {
      this.stintLap = 0;
      this.run = 0;
      this.fullTankLaps = 0;
      this.fullTankStint = !!tel && tel.fuel_capacity > 0 && tel.fuel / tel.fuel_capacity >= FULL_TANK_FRAC;
    }
    this.wasInPits = me.in_pits;
    if (this.stops >= 0 && p.num_pitstops > this.stops) {
      this.stintLap = 0;
      this.run = 0;
    }
    this.stops = p.num_pitstops;

    if (this.laps >= 0 && p.total_laps > this.laps && !me.in_pits) {
      const lap = p.last_lap_time;
      const clean = this.stintLap >= 1 && lap > 0 && p.best_lap_time > 0 && lap <= p.best_lap_time * CLEAN_FACTOR;
      this.stintLap++;
      if (clean) {
        bump("pace", state.pace + 1);
        if (tel && tel.fuel_consumption > 0) bump("fuel", state.fuel + 1);
        this.run++;
        bump("longRun", this.run);
        if (this.fullTankStint) {
          this.fullTankLaps++;
          bump("fullTank", this.fullTankLaps);
        }
        if ((d.weather?.path_wetness_avg ?? 0) >= WET_MIN) bump("wet", state.wet + 1);
      } else if (this.stintLap > 1) {
        this.run = 0; // erreur, trafic : le relais long repart
      }
    }
    this.laps = p.total_laps;
    return next;
  }
}
