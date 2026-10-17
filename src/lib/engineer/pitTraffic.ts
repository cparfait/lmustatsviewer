/**
 * Stands : box partagé et trafic à la sortie (module pur, horloge en paramètre).
 *
 * - **Box partagé** : en endurance, deux voitures d'une même équipe se partagent
 *   parfois le box. On apprend la position du box du joueur (distance-tour à
 *   l'arrêt, `pit_state` 3) ; toute autre voiture arrêtée à moins de `BOX_M` est
 *   notée comme « partage le box ». Si l'une d'elles y est quand le joueur rentre,
 *   on le prévient.
 * - **Sortie des stands** : la position de la sortie est apprise sur les sorties
 *   observées (joueur et adversaires). Quand le joueur ressort, on prévient si une
 *   voiture arrive en piste juste derrière la sortie ; quand il approche de la
 *   sortie en piste, on prévient si un adversaire en sort devant lui.
 */

import type { LiveStanding } from "@/lib/api";

/** Écart de distance-tour pour considérer deux arrêts au même box (m). */
export const BOX_M = 3;
/** Fenêtre « voiture qui arrive » derrière la sortie (m). */
const EXIT_BEHIND_M = 250;
/** Fenêtre d'approche du joueur vers la sortie, en piste (m avant la sortie). */
const APPROACH_FROM_M = 450;
const APPROACH_TO_M = 60;
/** Anti-radotage par voiture (s). */
const CAR_COOLDOWN_S = 60;

/** Distance « en avant » de `from` vers `to` sur un tour bouclé (m). */
export function aheadDist(from: number, to: number, len: number): number {
  if (!(len > 0)) return to - from;
  return (((to - from) % len) + len) % len;
}

export type PitTrafficEvent =
  | { kind: "boxOccupied"; driver: string }
  | { kind: "exitTraffic"; driver: string }
  | { kind: "rivalExiting"; driver: string };

interface Sample {
  dist: number;
  t: number;
}

export class PitTrafficWatcher {
  private boxSamples: number[] = [];
  private sharers = new Set<string>();
  private exits: number[] = [];
  private prevInPits = new Map<string, boolean>();
  private prevPitState = new Map<string, number>();
  private lastPos = new Map<string, Sample>();
  private speeds = new Map<string, number>();
  private said = new Map<string, number>();
  private playerWasExiting = false;

  reset() {
    this.boxSamples = [];
    this.sharers.clear();
    this.prevInPits.clear();
    this.prevPitState.clear();
    this.lastPos.clear();
    this.speeds.clear();
    this.said.clear();
    this.playerWasExiting = false;
    // La sortie des stands est propre au circuit : gardée tant qu'on ne change pas.
  }

  /** Nouveau circuit : la sortie apprise ne vaut plus. */
  resetTrack() {
    this.reset();
    this.exits = [];
  }

  /** Position du box du joueur (médiane des arrêts), ou null. */
  get box(): number | null {
    return median(this.boxSamples);
  }

  /** Position de la sortie des stands (médiane des sorties vues), ou null. */
  get exit(): number | null {
    return median(this.exits);
  }

  /** Voitures qui partagent le box du joueur. */
  get boxSharers(): string[] {
    return [...this.sharers];
  }

  /** Une voiture qui partage le box y est-elle en ce moment ? */
  occupant(standings: LiveStanding[]): string | null {
    const s = standings.find((x) => !x.is_player && this.sharers.has(x.driver) && x.in_pits && (x.pit_state ?? 0) >= 2);
    return s?.driver ?? null;
  }

  private cool(key: string, nowS: number): boolean {
    const last = this.said.get(key) ?? -Infinity;
    if (nowS - last < CAR_COOLDOWN_S) return false;
    this.said.set(key, nowS);
    return true;
  }

  update(nowS: number, standings: LiveStanding[], trackLength: number): PitTrafficEvent[] {
    const out: PitTrafficEvent[] = [];
    const len = trackLength > 0 ? trackLength : 0;
    const me = standings.find((s) => s.is_player);
    // Vitesses estimées (m/s) par voiture, à partir de la distance-tour.
    for (const s of standings) {
      const prev = this.lastPos.get(s.driver);
      if (prev && nowS > prev.t) {
        const d = aheadDist(prev.dist, s.lap_dist, len);
        const v = d / (nowS - prev.t);
        if (v >= 0 && v < 120) this.speeds.set(s.driver, v);
      }
      this.lastPos.set(s.driver, { dist: s.lap_dist, t: nowS });
    }
    for (const s of standings) {
      const ps = s.pit_state ?? 0;
      // Arrêt au box : apprentissage (joueur) ou repérage d'un partage (autres).
      if (ps === 3 && this.prevPitState.get(s.driver) !== 3) {
        if (s.is_player) this.boxSamples.push(s.lap_dist);
        else if (this.box != null && Math.abs(s.lap_dist - this.box) < BOX_M) this.sharers.add(s.driver);
      }
      // Sortie de la voie des stands : position de la sortie.
      if (this.prevInPits.get(s.driver) === true && !s.in_pits && s.lap_dist > 0) {
        this.exits.push(s.lap_dist);
        if (this.exits.length > 25) this.exits.shift();
      }
      this.prevPitState.set(s.driver, ps);
      this.prevInPits.set(s.driver, s.in_pits);
    }
    if (!me) return out;

    // Le joueur rentre (demande d'arrêt ou entrée dans la voie) : box occupé ?
    const myState = me.pit_state ?? 0;
    if (myState === 1 || myState === 2) {
      const who = this.occupant(standings);
      if (who && this.cool(`box:${who}`, nowS)) out.push({ kind: "boxOccupied", driver: who });
    }

    const exit = this.exit;
    if (exit == null) return out;
    // Le joueur ressort : voiture qui arrive juste derrière la sortie ?
    const exiting = me.in_pits && myState === 4;
    if (exiting && !this.playerWasExiting) {
      const coming = standings
        .filter((s) => !s.is_player && !s.in_pits)
        .map((s) => ({ s, d: aheadDist(s.lap_dist, exit, len) }))
        .filter(({ s, d }) => d > 0 && d < EXIT_BEHIND_M && (this.speeds.get(s.driver) ?? 0) > 25)
        .sort((a, b) => a.d - b.d)[0];
      if (coming && this.cool(`exit:${coming.s.driver}`, nowS)) out.push({ kind: "exitTraffic", driver: coming.s.driver });
    }
    this.playerWasExiting = exiting;

    // Le joueur approche de la sortie en piste : un adversaire en sort devant lui ?
    if (!me.in_pits) {
      const toExit = aheadDist(me.lap_dist, exit, len);
      if (toExit > APPROACH_TO_M && toExit < APPROACH_FROM_M) {
        const rival = standings.find(
          (s) => !s.is_player && s.in_pits && (s.pit_state ?? 0) === 4 && (this.speeds.get(s.driver) ?? 0) > 8,
        );
        if (rival && this.cool(`rival:${rival.driver}`, nowS)) out.push({ kind: "rivalExiting", driver: rival.driver });
      }
    }
    return out;
  }
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
