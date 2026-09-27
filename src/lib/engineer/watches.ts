/**
 * Alertes « préviens-moi quand… » posées à la voix (module pur).
 *
 * Le pilote pose une condition au push-to-talk ; elle est évaluée à chaque
 * trame et annoncée **une seule fois** quand elle devient vraie, puis retirée.
 * La cible d'une alerte de rival est résolue **à la pose** (nom du pilote) :
 * « quand la voiture devant s'arrête » vise celle qui est devant maintenant.
 */

import type { LiveData } from "@/lib/api";

export type WatchCond =
  | { kind: "timeLeft"; minutes: number }
  | { kind: "lapsLeft"; laps: number }
  | { kind: "fuelLaps"; laps: number }
  | { kind: "rivalPit"; driver: string }
  | { kind: "gapAhead"; seconds: number }
  | { kind: "gapBehind"; seconds: number }
  | { kind: "rain" };

export interface Watch {
  id: number;
  cond: WatchCond;
}

/** Seuils par défaut quand le pilote n'en donne pas. */
export const DEFAULTS = { timeLeftMin: 10, lapsLeft: 5, fuelLaps: 3, gapS: 1 };
/** Nombre max d'alertes simultanées (au-delà, la plus ancienne saute). */
export const MAX_WATCHES = 8;

export class WatchList {
  private list: Watch[] = [];
  private nextId = 1;
  private pitSeen = new Map<string, { inPits: boolean; stops: number }>();

  get size(): number {
    return this.list.length;
  }

  all(): readonly Watch[] {
    return this.list;
  }

  add(cond: WatchCond): Watch {
    const w = { id: this.nextId++, cond };
    this.list.push(w);
    if (this.list.length > MAX_WATCHES) this.list.shift();
    return w;
  }

  /** Efface tout ; renvoie le nombre d'alertes annulées. */
  clear(): number {
    const n = this.list.length;
    this.list = [];
    return n;
  }

  /** Évalue les alertes ; renvoie celles qui se déclenchent (retirées de la liste). */
  evaluate(data: LiveData, fuelLaps: number | null): Watch[] {
    const sc = data.session;
    const p = data.player;
    const me = data.standings.find((s) => s.is_player);
    // Arrêts des rivaux : front montant (entrée aux stands ou arrêt compté).
    const pitted = new Set<string>();
    for (const s of data.standings) {
      const prev = this.pitSeen.get(s.driver);
      if (prev && ((!prev.inPits && s.in_pits) || s.num_pitstops > prev.stops)) pitted.add(s.driver);
      this.pitSeen.set(s.driver, { inPits: s.in_pits, stops: s.num_pitstops });
    }
    if (!this.list.length || !sc || !p) return [];

    const fired: Watch[] = [];
    const keep: Watch[] = [];
    for (const w of this.list) {
      const c = w.cond;
      let hit = false;
      switch (c.kind) {
        case "timeLeft":
          hit = sc.end_et > 0 && sc.end_et > sc.session_time && sc.end_et - sc.session_time <= c.minutes * 60;
          break;
        case "lapsLeft":
          hit = sc.max_laps > 0 && sc.max_laps < 1000 && sc.max_laps - p.total_laps <= c.laps;
          break;
        case "fuelLaps":
          hit = fuelLaps != null && fuelLaps > 0 && fuelLaps <= c.laps;
          break;
        case "rivalPit":
          hit = pitted.has(c.driver);
          break;
        case "gapAhead":
          hit = !!me && !me.in_pits && p.position > 1 && me.time_behind_next > 0 && me.time_behind_next <= c.seconds;
          break;
        case "gapBehind": {
          const b = data.standings.find((s) => s.position === p.position + 1);
          hit = !!b && !b.in_pits && b.time_behind_next > 0 && b.time_behind_next <= c.seconds;
          break;
        }
        case "rain":
          hit = !!data.weather && data.weather.rain > 0.1;
          break;
      }
      (hit ? fired : keep).push(w);
    }
    this.list = keep;
    return fired;
  }
}
