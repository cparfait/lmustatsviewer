/**
 * Arrêts des rivaux directs (module pur).
 *
 * On surveille les voisins immédiats **dans la classe** (P-1 et P+1). Quand l'un
 * d'eux entre aux stands :
 *  - devant : il perd environ la perte au stand mesurée (`pitLossS`) ; selon
 *    l'écart, il ressortira derrière toi, devant, ou ce sera serré (zone floue de
 *    `FUZZY_S` secondes où l'on ne tranche pas) ;
 *  - derrière : menace d'undercut (pneus neufs) — seulement s'il est assez près
 *    pour que ça compte (`UNDERCUT_RANGE_S` au-delà de la perte au stand).
 * Même tour uniquement (un tour d'écart ne se joue pas en secondes). Rien n'est
 * dit si le joueur est lui-même aux stands.
 */

import type { LiveData } from "@/lib/api";

export const FUZZY_S = 2;
export const UNDERCUT_RANGE_S = 10;

export interface RivalPitEvent {
  driver: string;
  side: "ahead" | "behind";
  /** Rival devant : où il devrait ressortir par rapport à toi. */
  outcome: "behind" | "front" | "close" | null;
  /** Écart avant l'arrêt (s). */
  gap: number;
  /** Nombre d'arrêts du rival (clé d'anti-radotage). */
  stops: number;
}

export class RivalPitWatcher {
  private prev = new Map<string, boolean>();

  reset(): void {
    this.prev.clear();
  }

  push(data: LiveData, pitLossS: number): RivalPitEvent[] {
    const me = data.standings.find((s) => s.is_player);
    const out: RivalPitEvent[] = [];
    for (const s of data.standings) {
      if (s.is_player) continue;
      const was = this.prev.get(s.driver);
      this.prev.set(s.driver, s.in_pits);
      if (was !== false || !s.in_pits) continue; // front montant uniquement (1re vue exclue)
      if (!me || me.in_pits || s.vehicle_class !== me.vehicle_class) continue;
      if (s.laps_behind_leader !== me.laps_behind_leader) continue;
      if (s.class_position === me.class_position - 1) {
        const gap = me.time_behind_leader - s.time_behind_leader;
        if (!(gap > 0)) continue;
        const margin = pitLossS - gap;
        const outcome = pitLossS > 0 ? (margin > FUZZY_S ? "behind" : margin < -FUZZY_S ? "front" : "close") : null;
        out.push({ driver: s.driver, side: "ahead", outcome, gap, stops: s.num_pitstops });
      } else if (s.class_position === me.class_position + 1) {
        const gap = s.time_behind_leader - me.time_behind_leader;
        if (!(gap > 0) || gap > pitLossS + UNDERCUT_RANGE_S) continue;
        out.push({ driver: s.driver, side: "behind", outcome: null, gap, stops: s.num_pitstops });
      }
    }
    return out;
  }
}
