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

/**
 * Position « annoncée » du joueur et ses voisins directs, pour l'ingénieur
 * vocal (annonces, statut, réponses parlées). En multiclasse avec
 * `classScope`, tout est ramené à la classe du joueur : place dans la classe,
 * voiture de la classe devant/derrière, écarts entre elles. Sinon (monoclasse,
 * ou réglage désactivé) : classement général, comme historiquement.
 */
export interface ScopedPosition {
  /** Place annoncée (classe ou générale). */
  pos: number;
  /** Nom brut de la classe si la position est ramenée à la classe, sinon null. */
  cls: string | null;
  /** Voiture juste devant / derrière dans ce classement. */
  ahead: LiveStanding | null;
  behind: LiveStanding | null;
  /** Écarts (s) ; null si inconnus ou à un tour d'écart. */
  gapAhead: number | null;
  gapBehind: number | null;
  gapLeader: number | null;
}

export function scopedPosition(standings: LiveStanding[], classScope: boolean): ScopedPosition | null {
  const me = standings.find((s) => s.is_player);
  if (!me || me.position <= 0) return null;
  const pos0 = (x: number | undefined | null) => (x != null && x > 0 ? x : null);

  if (classScope && isMulticlass(standings) && me.class_position > 0) {
    const pos = me.class_position;
    const mate = (p: number) =>
      standings.find((s) => s.vehicle_class === me.vehicle_class && s.class_position === p) ?? null;
    const ahead = pos > 1 ? mate(pos - 1) : null;
    const behind = mate(pos + 1);
    const leader = pos > 1 ? mate(1) : null;
    return {
      pos,
      cls: me.vehicle_class,
      ahead,
      behind,
      gapAhead: ahead ? pos0(gapBetween(ahead, me)) : null,
      gapBehind: behind ? pos0(gapBetween(me, behind)) : null,
      gapLeader: leader ? pos0(gapBetween(leader, me)) : null,
    };
  }

  const pos = me.position;
  const ahead = pos > 1 ? (standings.find((s) => s.position === pos - 1) ?? null) : null;
  const behind = standings.find((s) => s.position === pos + 1) ?? null;
  return {
    pos,
    cls: null,
    ahead,
    behind,
    // Général : écarts fournis par le jeu (au précédent / au leader).
    gapAhead: pos > 1 ? pos0(me.time_behind_next) : null,
    gapBehind: behind ? pos0(behind.time_behind_next) : null,
    gapLeader: pos > 1 ? pos0(me.time_behind_leader) : null,
  };
}
