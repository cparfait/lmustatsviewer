/**
 * Position du joueur **dans sa classe** (live), partagée par la page Live, les
 * overlays et le coach IA. En multiclasse, la position générale mélange des
 * voitures qui ne se battent pas entre elles : la classe passe en premier, la
 * générale reste affichée à côté.
 *
 * `class_position` est calculé côté Rust en regroupant par `vehicle_class` brut ;
 * on regroupe ici de la même façon pour rester cohérent.
 */

import type { LiveStanding } from "./api";

export interface PlayerClassPosition {
  /** Position dans la classe (1 = leader de classe). */
  classPos: number;
  /** Nombre de voitures de la classe. */
  classCount: number;
  /** Position générale. */
  overall: number;
  /** Nombre total de voitures. */
  total: number;
  /** Plusieurs classes en piste. */
  multiclass: boolean;
  /** Leader de la classe (null si c'est le joueur ou introuvable). */
  classLeader: LiveStanding | null;
  /** Voiture de la classe juste devant (null si leader de classe). */
  classAhead: LiveStanding | null;
}

/** Plusieurs classes présentes dans le classement live. */
export function isMulticlass(standings: LiveStanding[]): boolean {
  const first = standings[0]?.vehicle_class;
  return standings.some((s) => s.vehicle_class !== first);
}

export function playerClassPosition(standings: LiveStanding[]): PlayerClassPosition | null {
  const me = standings.find((s) => s.is_player);
  if (!me || me.position <= 0) return null;
  const mates = standings.filter((s) => s.vehicle_class === me.vehicle_class);
  const classPos = me.class_position > 0 ? me.class_position : me.position;
  return {
    classPos,
    classCount: mates.length,
    overall: me.position,
    total: standings.length,
    multiclass: isMulticlass(standings),
    classLeader: classPos > 1 ? (mates.find((s) => s.class_position === 1) ?? null) : null,
    classAhead: classPos > 1 ? (mates.find((s) => s.class_position === classPos - 1) ?? null) : null,
  };
}

/**
 * Écart (s) entre deux voitures, d'après leur retard sur le leader général.
 * Null si l'une est à un tour ou plus d'écart (le temps n'a alors plus de sens).
 */
export function gapBetween(ahead: LiveStanding, behind: LiveStanding): number | null {
  if (ahead.laps_behind_leader !== behind.laps_behind_leader) return null;
  const g = behind.time_behind_leader - ahead.time_behind_leader;
  return Number.isFinite(g) && g >= 0 ? g : null;
}
