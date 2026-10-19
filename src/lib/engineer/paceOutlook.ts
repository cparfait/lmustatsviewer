/**
 * Tendance de rythme en course (module pur) : « ton rythme te fait remonter » ou « ton
 * rythme te garde à ta place ». Jamais une place promise : on ne dit que la place
 * actuelle et le sens, et on se tait quand la projection recule.
 *
 * Rythme = médiane des 3 derniers tours propres de chaque voiture de la classe (un tour
 * aux stands, au-delà de 107 % du meilleur, ou nul est écarté). Projection sur la voiture
 * de classe juste devant : écart − (son rythme − le mien) × tours restants ≤ 0 → je la
 * rattrape d'ici l'arrivée. Sinon, si la voiture derrière ne me rattrape pas → je tiens.
 *
 * Conditions (bornées) : à partir du tour `FROM_LAP`, au moins `MIN_LAPS_LEFT` tours
 * restants, au moins `MIN_RIVALS` voitures de la classe mesurées, ni aux stands ni sous la
 * pluie. Redit seulement si le cas s'améliore (tenir → remonter), `REPEAT_LAPS` plus tard.
 */

import type { LiveStanding } from "@/lib/api";
import { gapBetween } from "@/lib/livePosition";

export const FROM_LAP = 8;
export const MIN_LAPS_LEFT = 5;
export const MIN_RIVALS = 3;
export const REPEAT_LAPS = 8;
/** Pluie au-delà de laquelle le rythme ne dit plus rien (0..1). */
export const RAIN_MAX = 0.1;

export type PaceCall = { kind: "climbing"; perLap: number; driver: string } | { kind: "holding" };

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export class PaceOutlook {
  private laps = new Map<string, number[]>();
  private seenLap = new Map<string, number>();
  private lastSaid: { kind: PaceCall["kind"]; lap: number } | null = null;

  reset(): void {
    this.laps.clear();
    this.seenLap.clear();
    this.lastSaid = null;
  }

  /** Mémorise le tour bouclé de chaque voiture (à appeler à chaque trame). */
  push(standings: LiveStanding[]): void {
    for (const s of standings) {
      const prev = this.seenLap.get(s.driver);
      if (prev === s.total_laps) continue;
      this.seenLap.set(s.driver, s.total_laps);
      if (prev == null || s.in_pits || !(s.last_lap_time > 0)) continue;
      const best = s.best_lap_time > 0 ? s.best_lap_time : s.last_lap_time;
      if (s.last_lap_time > best * 1.07) continue;
      const arr = this.laps.get(s.driver) ?? [];
      arr.push(s.last_lap_time);
      if (arr.length > 3) arr.shift();
      this.laps.set(s.driver, arr);
    }
  }

  /** Rythme récent (s/tour), null sous 3 tours propres. */
  pace(driver: string): number | null {
    const arr = this.laps.get(driver);
    return arr && arr.length >= 3 ? median(arr) : null;
  }

  /** Lecture du moment (sans mémoire d'annonce). */
  evaluate(standings: LiveStanding[], lap: number, lapsLeft: number | null, rain: number): PaceCall | null {
    if (lap < FROM_LAP || lapsLeft == null || lapsLeft < MIN_LAPS_LEFT || rain > RAIN_MAX) return null;
    const me = standings.find((s) => s.is_player);
    if (!me || me.in_pits || me.class_position <= 0) return null;
    const cls = standings.filter((s) => s.vehicle_class === me.vehicle_class && s.finish_status === 0);
    const measured = cls.filter((s) => !s.is_player && this.pace(s.driver) != null);
    const mine = this.pace(me.driver);
    if (mine == null || measured.length < MIN_RIVALS) return null;
    const ahead = cls.find((s) => s.class_position === me.class_position - 1) ?? null;
    if (ahead && !ahead.in_pits) {
      const gap = gapBetween(ahead, me);
      const theirs = this.pace(ahead.driver);
      if (gap != null && theirs != null) {
        const perLap = theirs - mine; // + = je suis plus rapide
        if (perLap > 0.05 && gap - perLap * lapsLeft <= 0) return { kind: "climbing", perLap, driver: ahead.driver };
      }
    }
    const behind = cls.find((s) => s.class_position === me.class_position + 1) ?? null;
    if (behind) {
      const gap = gapBetween(me, behind);
      const theirs = this.pace(behind.driver);
      if (gap == null || theirs == null) return null;
      const perLap = mine - theirs; // + = il est plus rapide
      return gap - perLap * lapsLeft > 0 ? { kind: "holding" } : null;
    }
    return me.class_position === 1 ? { kind: "holding" } : null;
  }

  /** L'annonce à faire maintenant, ou null (une fois, puis seulement si mieux et assez tard). */
  call(standings: LiveStanding[], lap: number, lapsLeft: number | null, rain: number): PaceCall | null {
    const c = this.evaluate(standings, lap, lapsLeft, rain);
    if (!c) return null;
    const last = this.lastSaid;
    if (last) {
      const better = last.kind === "holding" && c.kind === "climbing";
      if (!better || lap - last.lap < REPEAT_LAPS) return null;
    }
    this.lastSaid = { kind: c.kind, lap };
    return c;
  }
}
