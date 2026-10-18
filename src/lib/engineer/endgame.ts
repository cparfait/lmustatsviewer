/**
 * Fin de course : « attaque » / « tiens ta place », et position finale estimée
 * (module pur).
 *
 * - **Attaque / défense** : dans les derniers tours (selon la longueur du
 *   circuit), on compare l'écart avec les voisins de classe à ce que le rythme
 *   récent permet de reprendre (ou de perdre) d'ici l'arrivée. Une annonce de
 *   chaque, une fois par course.
 * - **Position finale estimée** : chaque voiture de la classe est projetée à
 *   l'arrivée avec son rythme (dernier tour valable, sinon meilleur tour), à
 *   partir de la distance qu'elle a déjà parcourue.
 */

import type { LiveStanding } from "@/lib/api";

/** Tours restants à partir desquels on lance l'appel, selon la longueur du tour (m). */
export function pushWindowLaps(trackLength: number): number {
  if (trackLength > 9000) return 1; // Le Mans
  if (trackLength > 5500) return 2;
  return 4;
}

/** Rythme d'une voiture (s/tour) : dernier tour plausible, sinon meilleur tour. */
export function paceOf(s: LiveStanding): number | null {
  const best = s.best_lap_time > 0 ? s.best_lap_time : 0;
  const last = s.last_lap_time > 0 ? s.last_lap_time : 0;
  if (last > 0 && (!best || last < best * 1.07)) return last;
  return best || null;
}

export type EndgameCall =
  | { kind: "attack"; driver: string; gap: number; perLap: number }
  | { kind: "defend"; driver: string; gap: number; perLap: number };

/** Voisin de classe direct (devant `-1`, derrière `+1`), dans le même tour. */
function neighbour(standings: LiveStanding[], me: LiveStanding, dir: -1 | 1): LiveStanding | null {
  const nb = standings.find(
    (s) => s.vehicle_class === me.vehicle_class && s.class_position === me.class_position + dir,
  );
  if (!nb || nb.in_pits || nb.laps_behind_leader !== me.laps_behind_leader) return null;
  return nb;
}

export class EndgameWatcher {
  private attackSaid = false;
  private defendSaid = false;

  reset() {
    this.attackSaid = false;
    this.defendSaid = false;
  }

  update(standings: LiveStanding[], lapsLeft: number | null, trackLength: number): EndgameCall[] {
    const out: EndgameCall[] = [];
    if (lapsLeft == null || lapsLeft < 1 || lapsLeft > pushWindowLaps(trackLength)) return out;
    const me = standings.find((s) => s.is_player);
    if (!me || me.in_pits) return out;
    const myPace = paceOf(me);
    if (!myPace) return out;
    const ahead = neighbour(standings, me, -1);
    if (ahead && !this.attackSaid) {
      const gap = Math.abs(me.time_behind_leader - ahead.time_behind_leader);
      const theirs = paceOf(ahead);
      const perLap = theirs ? theirs - myPace : 0; // + = je suis plus rapide
      // Atteignable : l'écart fond avant l'arrivée (avec 0,2 s de marge pour le dépassement).
      if (perLap > 0.05 && gap - perLap * lapsLeft < 0.2 && gap < 6) {
        this.attackSaid = true;
        out.push({ kind: "attack", driver: ahead.driver, gap, perLap });
      }
    }
    const behind = neighbour(standings, me, 1);
    if (behind && !this.defendSaid) {
      const gap = Math.abs(behind.time_behind_leader - me.time_behind_leader);
      const theirs = paceOf(behind);
      const perLap = theirs ? myPace - theirs : 0; // + = il est plus rapide
      if (perLap > 0.05 && gap - perLap * lapsLeft < 0.4 && gap < 6) {
        this.defendSaid = true;
        out.push({ kind: "defend", driver: behind.driver, gap, perLap });
      }
    }
    return out;
  }
}

/**
 * Position finale estimée dans la classe (1 = victoire de classe), ou `null` si
 * le temps / les tours restants ou les rythmes manquent.
 * `remainingS` : temps restant (courses au temps) ; sinon `lapsLeft` du leader.
 */
export function expectedFinish(
  standings: LiveStanding[],
  trackLength: number,
  remaining: { remainingS?: number | null; lapsLeft?: number | null },
): { pos: number; of: number } | null {
  const me = standings.find((s) => s.is_player);
  if (!me || !(trackLength > 0)) return null;
  const cls = standings.filter((s) => s.vehicle_class === me.vehicle_class && s.finish_status === 0);
  const leaderPace = paceOf(cls.find((s) => s.class_position === 1) ?? me);
  let horizon = remaining.remainingS ?? null;
  if (horizon == null && remaining.lapsLeft != null && leaderPace) horizon = remaining.lapsLeft * leaderPace;
  if (horizon == null || !(horizon > 0)) return null;
  const projected = cls
    .map((s) => {
      const pace = paceOf(s);
      if (!pace) return null;
      const done = s.total_laps * trackLength + s.lap_dist;
      return { s, end: done + (horizon! / pace) * trackLength };
    })
    .filter((x): x is { s: LiveStanding; end: number } => x != null)
    .sort((a, b) => b.end - a.end);
  const idx = projected.findIndex((x) => x.s.is_player);
  return idx < 0 ? null : { pos: idx + 1, of: projected.length };
}
