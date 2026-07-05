/**
 * Analyse du rival le plus proche (T13 #148 attack/defend + #149 multiclasse).
 *
 * À partir des standings live : trouve la voiture la plus proche (devant ou
 * derrière), dit si elle est de **ta classe ou d'une autre** (#149, plus rapide /
 * plus lente si l'ordre est connu), et compare tes **secteurs** aux siens pour
 * dire **où tu es plus fort / plus faible** (#148) — sans télémétrie du rival,
 * juste ses temps par secteur.
 *
 * Module **pur** (aucune dépendance React/Tauri) → testable (§14).
 */

import type { LiveData, LiveStanding } from "@/lib/api";
import { classOrder } from "@/lib/utils";

export type RivalSide = "ahead" | "behind";
export type ClassRel = "same" | "faster" | "slower" | "other";

export interface RivalInfo {
  side: RivalSide;
  /** Écart au rival (s). */
  gap: number;
  /** Relation de classe (#149). */
  classRel: ClassRel;
  /** Secteur (1-3) où tu es le plus fort vs le rival, ou `null` (#148). */
  strongSector: number | null;
  /** Secteur (1-3) où tu es le plus faible vs le rival, ou `null` (#148). */
  weakSector: number | null;
}

/** Écart de secteur mini pour être « significatif » (s) — anti-bruit. */
const SECTOR_EPS = 0.05;

/** Voiture la plus proche (devant/derrière) dans `maxGapSec`, ou `null`. */
export function nearestRival(
  data: LiveData,
  maxGapSec: number,
): { standing: LiveStanding; side: RivalSide; gap: number } | null {
  const me = data.standings.find((s) => s.is_player);
  if (!me) return null;
  const ahead = data.standings.find((s) => s.position === me.position - 1);
  const behind = data.standings.find((s) => s.position === me.position + 1);
  const gapAhead = ahead && me.time_behind_next > 0 ? me.time_behind_next : Infinity;
  const gapBehind = behind && behind.time_behind_next > 0 ? behind.time_behind_next : Infinity;

  const cands: { standing: LiveStanding; side: RivalSide; gap: number }[] = [];
  if (ahead && gapAhead <= maxGapSec) cands.push({ standing: ahead, side: "ahead", gap: gapAhead });
  if (behind && gapBehind <= maxGapSec) cands.push({ standing: behind, side: "behind", gap: gapBehind });
  if (!cands.length) return null;
  cands.sort((a, b) => a.gap - b.gap);
  return cands[0];
}

/** Relation de classe entre toi et le rival (#149). */
export function classRelation(myClass: string, rivalClass: string): ClassRel {
  if (myClass && myClass === rivalClass) return "same";
  const a = classOrder(myClass);
  const b = classOrder(rivalClass);
  if (a === 99 || b === 99) return "other";
  return b < a ? "faster" : "slower"; // rang plus petit = catégorie plus rapide
}

/** Secteurs où tu es le plus fort / faible vs le rival (#148). */
export function sectorEdge(
  mine: readonly number[],
  rival: readonly [number, number, number],
): { strong: number | null; weak: number | null } {
  let strong: number | null = null;
  let weak: number | null = null;
  let best = Infinity;
  let worst = -Infinity;
  for (let i = 0; i < 3; i++) {
    const my = mine[i] ?? 0;
    const rv = rival[i] ?? 0;
    if (my <= 0 || rv <= 0) continue;
    const d = my - rv; // < 0 = tu es plus rapide (fort) ; > 0 = plus lent (faible)
    if (d < best) {
      best = d;
      strong = i + 1;
    }
    if (d > worst) {
      worst = d;
      weak = i + 1;
    }
  }
  return {
    strong: best < -SECTOR_EPS ? strong : null,
    weak: worst > SECTOR_EPS ? weak : null,
  };
}

/**
 * Synthèse du rival le plus proche (classe + forces/faiblesses par secteur), ou
 * `null` si aucun rival à portée.
 */
export function buildRivalInfo(data: LiveData, maxGapSec: number): RivalInfo | null {
  const me = data.standings.find((s) => s.is_player);
  const near = nearestRival(data, maxGapSec);
  if (!me || !near) return null;
  const classRel = classRelation(me.vehicle_class, near.standing.vehicle_class);
  const myS = data.player?.last_sectors ?? [0, 0, 0];
  const rvS: [number, number, number] = [
    near.standing.last_s1,
    near.standing.last_s2,
    near.standing.last_s3,
  ];
  const edge = sectorEdge(myS, rvS);
  return {
    side: near.side,
    gap: near.gap,
    classRel,
    strongSector: edge.strong,
    weakSector: edge.weak,
  };
}
