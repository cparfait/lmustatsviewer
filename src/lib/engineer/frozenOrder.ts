/**
 * Neutralisations — voiture de sécurité, tour de formation, ordre figé
 * (module pur, horloge en paramètre).
 *
 * Source : la zone « Rules » du plugin (`LiveRules`). Le jeu y attribue à chaque
 * voiture une place (`position_assignment`, 0 = tête) et, en formation, une
 * colonne. On en déduit qui le joueur doit suivre :
 *  - **neutralisation** (`stage` 3/4) : file unique → la voiture de la place
 *    précédente, quelle que soit sa colonne ; en tête → la voiture de sécurité ;
 *  - **formation** (`stage` 0/1) : la voiture de la place précédente **dans la
 *    même colonne** ; en première ligne → la voiture de sécurité (si elle roule).
 * Puis on compare les distances parcourues : derrière la voiture à suivre de plus
 * de `CATCH_UP_M` → « recolle » ; devant elle → « laisse-la passer ».
 *
 * L'état de la neutralisation vient de `yellow_flag_state` (rF2) : 2 stands
 * fermés, 4 stands ouverts, 5 dernier tour de la voiture de sécurité, 6 relance.
 * Colonnes au format LMU : 0 gauche, 1 milieu, 2 droite.
 */

import type { LiveRules, LiveStanding } from "@/lib/api";

/** Écart au-delà duquel le joueur doit recoller (m). */
export const CATCH_UP_M = 70;
/** Une consigne doit tenir ce délai avant d'être dite (s) — évite les à-coups. */
const STABLE_S = 2;
/** Délai minimal entre deux rappels « recolle » / « laisse passer » (s). */
const NAG_S = 20;

export type Column = "left" | "middle" | "right" | null;

export function columnOf(c: number): Column {
  return c === 0 ? "left" : c === 1 ? "middle" : c === 2 ? "right" : null;
}

export type FoTarget = { kind: "sc" } | { kind: "car"; id: number; name: string };

export type FrozenEvent =
  | { kind: "scOut" }
  | { kind: "scIn" }
  | { kind: "restart" }
  | { kind: "pitsClosed" }
  | { kind: "pitsOpen" }
  | { kind: "slot"; pos: number; column: Column }
  | { kind: "follow"; target: FoTarget; column: Column }
  | { kind: "catchUp"; target: FoTarget }
  | { kind: "allowPass"; target: FoTarget };

export interface FoInput {
  rules: LiveRules | null | undefined;
  standings: LiveStanding[];
  trackLength: number;
  /** `flags.yellow_flag_state` du scoring. */
  yellowState: number;
}

const formation = (stage: number) => stage === 0 || stage === 1;
const caution = (stage: number) => stage === 3 || stage === 4;

/** Distance totale parcourue (m) par une voiture du classement. */
function totalDist(s: LiveStanding, len: number): number {
  return s.total_laps * len + s.lap_dist;
}

export interface FoState {
  target: FoTarget | null;
  column: Column;
  /** Place attribuée (1 = tête). */
  slot: number | null;
  /** Écart à la cible (m) : + elle est devant, − le joueur est devant. */
  gapM: number | null;
}

/** Consigne courante (sans mémoire) — testable isolément. */
export function frozenState(inp: FoInput): FoState | null {
  const r = inp.rules;
  if (!r || !(formation(r.stage) || caution(r.stage))) return null;
  const me = inp.standings.find((s) => s.is_player);
  if (!me || me.id == null) return null;
  const mine = r.participants.find((p) => p.id === me.id);
  if (!mine || mine.position_assignment < 0) return null;
  const single = caution(r.stage);
  const column = single ? null : columnOf(mine.column);
  const slot = mine.position_assignment + 1;
  let target: FoTarget | null = null;
  let gapM: number | null = null;
  const len = inp.trackLength > 0 ? inp.trackLength : 0;
  if (mine.position_assignment === 0) {
    if (r.safety_car_exists && r.safety_car_active && len > 0) {
      target = { kind: "sc" };
      const scDist = (me.total_laps - mine.relative_laps) * len + r.safety_car_lap_dist;
      gapM = scDist - totalDist(me, len);
    }
  } else {
    const ahead = r.participants.find(
      (p) => p.position_assignment === mine.position_assignment - 1 && (single || p.column === mine.column),
    );
    const st = ahead ? inp.standings.find((s) => s.id === ahead.id) : undefined;
    if (ahead && st) {
      target = { kind: "car", id: ahead.id, name: st.driver };
      if (len > 0) gapM = totalDist(st, len) - totalDist(me, len);
    }
  }
  return { target, column, slot, gapM };
}

const sameTarget = (a: FoTarget | null, b: FoTarget | null) =>
  a?.kind === b?.kind && (a?.kind !== "car" || (b?.kind === "car" && a.id === b.id));

export class FrozenOrderTracker {
  private scActive = false;
  private yellow = -1;
  private wasFrozen = false;
  private slotSaid = false;
  private said: FoTarget | null = null;
  private candidate: { target: FoTarget | null; since: number } | null = null;
  private behindSince: number | null = null;
  private aheadSince: number | null = null;
  private lastNag = -Infinity;

  reset() {
    this.scActive = false;
    this.yellow = -1;
    this.wasFrozen = false;
    this.slotSaid = false;
    this.said = null;
    this.candidate = null;
    this.behindSince = null;
    this.aheadSince = null;
    this.lastNag = -Infinity;
  }

  update(nowS: number, inp: FoInput): FrozenEvent[] {
    const out: FrozenEvent[] = [];
    const r = inp.rules;
    // Voiture de sécurité qui entre en piste.
    const sc = !!r && r.safety_car_exists && r.safety_car_active;
    if (sc && !this.scActive) out.push({ kind: "scOut" });
    this.scActive = sc;
    // États de la neutralisation (scoring).
    if (inp.yellowState !== this.yellow) {
      if (this.yellow >= 0) {
        if (inp.yellowState === 2) out.push({ kind: "pitsClosed" });
        else if (inp.yellowState === 4) out.push({ kind: "pitsOpen" });
        else if (inp.yellowState === 5) out.push({ kind: "scIn" });
        else if (inp.yellowState === 6) out.push({ kind: "restart" });
      }
      this.yellow = inp.yellowState;
    }

    const st = frozenState(inp);
    if (!st) {
      if (this.wasFrozen) {
        this.slotSaid = false;
        this.said = null;
        this.candidate = null;
      }
      this.wasFrozen = false;
      this.behindSince = this.aheadSince = null;
      return out;
    }
    this.wasFrozen = true;
    if (!this.slotSaid && st.slot != null && r && formation(r.stage)) {
      this.slotSaid = true;
      out.push({ kind: "slot", pos: st.slot, column: st.column });
    }
    // Nouvelle cible : dite quand elle a tenu `STABLE_S`.
    if (!sameTarget(st.target, this.said)) {
      if (!this.candidate || !sameTarget(this.candidate.target, st.target)) {
        this.candidate = { target: st.target, since: nowS };
      } else if (nowS - this.candidate.since >= STABLE_S) {
        this.said = st.target;
        this.candidate = null;
        if (st.target) out.push({ kind: "follow", target: st.target, column: st.column });
      }
    } else {
      this.candidate = null;
    }
    // Recolle / laisse passer (seulement pour la cible déjà annoncée).
    const target = this.said;
    if (target && st.gapM != null && sameTarget(target, st.target)) {
      const behind = st.gapM > CATCH_UP_M;
      const ahead = st.gapM < -5;
      this.behindSince = behind ? (this.behindSince ?? nowS) : null;
      this.aheadSince = ahead ? (this.aheadSince ?? nowS) : null;
      if (nowS - this.lastNag >= NAG_S) {
        if (this.aheadSince != null && nowS - this.aheadSince >= STABLE_S) {
          this.lastNag = nowS;
          out.push({ kind: "allowPass", target });
        } else if (this.behindSince != null && nowS - this.behindSince >= 2 * STABLE_S) {
          this.lastNag = nowS;
          out.push({ kind: "catchUp", target });
        }
      }
    }
    return out;
  }
}
