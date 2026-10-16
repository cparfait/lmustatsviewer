/**
 * Politique de parole de l'ingénieur (module pur, rejouable) : **qui a le droit
 * de parler maintenant**, en amont de l'arbitre.
 *
 * Trois couches, appliquées aux candidats d'une trame :
 *
 *  1. **Régime radio** choisi à la voix par le pilote :
 *     - `battle` (« on se bat ») : sécurité seule ; se lève seul quand les deux
 *       voisins sont à plus de 3 s pendant 8 s, ou au bout de 12 tours ;
 *     - `home` (« on ramène la voiture ») : sécurité + décisions ;
 *     - `essential` (« juste l'essentiel ») : budgets serrés ;
 *     - `quiet` (« tais-toi [jusqu'au tour N] ») : sécurité seule, jusqu'au tour N
 *       ou jusqu'à la fin de la session.
 *     `home` et `essential` se lèvent au prochain arrêt aux stands.
 *  2. **Phases de course** (réglage) : départ (jusqu'à 20 s après le tour 1),
 *     voie des stands, gel de la stratégie dans les 20 dernières minutes (ou les
 *     2 derniers tours), drapeau à damier, calme après un gros choc (30 s) et
 *     après un appel au box (20 s).
 *  3. **Budgets par tour** (réglage, course) : la « situation » (positions,
 *     écarts, duels) une fois par tour, le « confort » (chronos, secteurs,
 *     records) une fois tous les 3 tours, et au plus 2 messages par rival et par
 *     tour.
 *
 * La **sécurité** (`critical`, drapeaux, mécanique, trafic) passe toujours.
 * Horloge et tours = paramètres → déterministe et testable.
 */

import type { Candidate } from "./arbiter";

export type RadioRegime = "normal" | "battle" | "home" | "essential" | "quiet";

/** Famille éditoriale d'un message (pilote les régimes et les budgets). */
export type MsgClass = "safety" | "decision" | "situation" | "comfort";

export interface RegimeState {
  kind: RadioRegime;
  /** Tour du joueur à la pose du régime. */
  sinceLap: number;
  /** `quiet` borné : se lève à ce tour. */
  untilLap?: number;
  /** Arrêts aux stands à la pose (`home` / `essential` se lèvent au suivant). */
  stopsAtSet: number;
}

/** Contexte de la trame, fourni par la boucle de l'ingénieur. */
export interface PolicyCtx {
  nowS: number;
  lap: number;
  isRace: boolean;
  /** Course réellement lancée (vert ou ≥ 1 tour). */
  racing: boolean;
  inPits: boolean;
  /** Drapeau à damier / session terminée pour le joueur. */
  finished: boolean;
  /** Temps restant (s), `null` si course aux tours. */
  remainingS: number | null;
  /** Tours restants, `null` si inconnu. */
  lapsLeft: number | null;
  pitstops: number;
  /** Écart au plus proche voisin de classe (s), `Infinity` si aucun. */
  nearestGapS: number;
  /** Couche « phases de course » active. */
  phases: boolean;
  /** Couche « budgets par tour » active. */
  budgets: boolean;
}

/** Préfixes de clé → famille. Toute clé inconnue est une « décision » (jamais bridée). */
const SAFETY = ["flag:", "mech:", "vigie:", "traffic:", "faster:", "blue", "fuel:laps", "pit:box", "penalty"];
const SITUATION = ["pos:", "gap:", "closing:", "opening:", "leaderpit:"];
const COMFORT = ["lap:", "group:lap", "sector:", "fastest", "delta", "race:half", "battery:saturated"];
/** Stratégie gelée en fin de course (le box critique, lui, reste). */
const STRATEGY = ["pit:open", "pit:closing", "rivalpit:", "leaderpit:", "posture:", "fuel:refuel"];
/** Messages de piste tolérés dans la voie des stands. */
const PIT_LANE_OK = ["pit:", "vigie:", "watch:"];

const starts = (key: string, list: string[]) => list.some((p) => key.startsWith(p));

export function classOf(c: Candidate): MsgClass {
  if (c.prio === "critical" || starts(c.key, SAFETY)) return "safety";
  if (starts(c.key, SITUATION)) return "situation";
  if (starts(c.key, COMFORT)) return "comfort";
  return "decision";
}

/** Pilote visé par une clé (`closing:ahead:<nom>`, `faster:<nom>`…), ou `null`. */
export function rivalOf(key: string): string | null {
  const m = /^(?:closing:(?:ahead|behind)|opening:(?:ahead|behind)|faster|blue|rivalpit|leaderpit):([^:]+)/.exec(key);
  return m ? m[1] : null;
}

/** Départ : silence (hors sécurité) jusqu'à ce délai après la fin du tour 1 (s). */
export const START_CALM_S = 20;
/** Gel de la stratégie dans les N dernières secondes (20 min). */
export const END_FREEZE_S = 20 * 60;
/** … ou dans les N derniers tours (courses aux tours). */
export const END_FREEZE_LAPS = 2;
/** Calme après un gros choc (s) : sécurité seule. */
export const CRASH_CALM_S = 30;
/** Calme après un appel au box (s) : décisions et sécurité seules. */
export const BOX_CALM_S = 20;
/** Bagarre : se lève quand les voisins sont à plus de N s… */
export const BATTLE_CLEAR_GAP_S = 3;
/** … pendant au moins ce délai (s). */
export const BATTLE_CLEAR_HOLD_S = 8;
/** Bagarre : durée maximale (tours). */
export const BATTLE_MAX_LAPS = 12;

/** Budgets par famille (en tours entre deux messages) selon le régime. */
const BUDGET_LAPS: Record<"normal" | "essential", Partial<Record<MsgClass, number>>> = {
  normal: { situation: 1, comfort: 3 },
  essential: { situation: 3, comfort: Infinity },
};
/** Messages au plus par rival et par tour. */
export const PER_RIVAL_PER_LAP = 2;

export class RadioPolicy {
  regime: RegimeState = { kind: "normal", sinceLap: 0, stopsAtSet: 0 };
  private lap1DoneAt: number | null = null;
  private crashAt = -Infinity;
  private boxAt = -Infinity;
  private battleClearSince: number | null = null;
  /** Dernier tour où une famille a parlé. */
  private lastByClass = new Map<MsgClass, number>();
  /** Messages par rival sur le tour courant. */
  private rivalLap = -1;
  private rivalCount = new Map<string, number>();

  /** Nouvelle session : tout repart de zéro (le régime aussi). */
  reset(): void {
    this.regime = { kind: "normal", sinceLap: 0, stopsAtSet: 0 };
    this.lap1DoneAt = null;
    this.crashAt = -Infinity;
    this.boxAt = -Infinity;
    this.battleClearSince = null;
    this.lastByClass.clear();
    this.rivalLap = -1;
    this.rivalCount.clear();
  }

  /** Pose un régime (commande vocale du pilote). */
  setRegime(kind: RadioRegime, lap: number, stops: number, untilLap?: number): void {
    this.regime = { kind, sinceLap: lap, stopsAtSet: stops, untilLap };
    this.battleClearSince = null;
  }

  /** Signale un gros choc (dégâts soudains) : calme de sécurité. */
  noteCrash(nowS: number): void {
    this.crashAt = nowS;
  }

  /** Lève les régimes arrivés à échéance. Renvoie le régime courant. */
  private expire(ctx: PolicyCtx): RadioRegime {
    const r = this.regime;
    const back = () => this.setRegime("normal", ctx.lap, ctx.pitstops);
    if (r.kind === "quiet" && r.untilLap != null && ctx.lap >= r.untilLap) back();
    else if ((r.kind === "home" || r.kind === "essential") && ctx.pitstops > r.stopsAtSet) back();
    else if (r.kind === "battle") {
      if (ctx.lap - r.sinceLap >= BATTLE_MAX_LAPS) back();
      else if (ctx.nearestGapS > BATTLE_CLEAR_GAP_S) {
        if (this.battleClearSince == null) this.battleClearSince = ctx.nowS;
        else if (ctx.nowS - this.battleClearSince >= BATTLE_CLEAR_HOLD_S) back();
      } else this.battleClearSince = null;
    }
    return this.regime.kind;
  }

  /** Filtre les candidats de la trame. Rien n'est consommé ici (voir `commit`). */
  filter(cands: Candidate[], ctx: PolicyCtx): Candidate[] {
    const regime = this.expire(ctx);
    // Fin du 1er tour vue en direct → calme de départ ; ingénieur lancé en
    // cours de course (déjà plus loin que le tour 1) → pas de calme de départ.
    if (ctx.isRace && ctx.lap >= 1 && this.lap1DoneAt == null) {
      this.lap1DoneAt = ctx.lap === 1 ? ctx.nowS : -Infinity;
    }
    return cands.filter((c) => this.allowed(c, ctx, regime));
  }

  private allowed(c: Candidate, ctx: PolicyCtx, regime: RadioRegime): boolean {
    const cls = classOf(c);
    if (cls === "safety") return true;

    // 1. Régime choisi par le pilote.
    if (regime === "quiet" || regime === "battle") return false;
    if (regime === "home" && cls !== "decision") return false;

    // 2. Phases de course.
    if (ctx.phases) {
      if (ctx.finished) return false;
      if (ctx.nowS - this.crashAt < CRASH_CALM_S) return false;
      if (ctx.nowS - this.boxAt < BOX_CALM_S && cls !== "decision") return false;
      if (ctx.inPits && !starts(c.key, PIT_LANE_OK)) return false;
      if (ctx.isRace && ctx.racing) {
        const startCalm = this.lap1DoneAt == null || ctx.nowS - this.lap1DoneAt < START_CALM_S;
        if (startCalm && !c.key.startsWith("formation")) return false;
        const endFreeze =
          (ctx.remainingS != null && ctx.remainingS <= END_FREEZE_S) ||
          (ctx.lapsLeft != null && ctx.lapsLeft <= END_FREEZE_LAPS);
        if (endFreeze && starts(c.key, STRATEGY)) return false;
      }
    }

    // 3. Budgets (course).
    if (ctx.budgets && ctx.isRace) {
      const table = regime === "essential" ? BUDGET_LAPS.essential : BUDGET_LAPS.normal;
      const every = table[cls];
      if (every != null) {
        if (!isFinite(every)) return false;
        const last = this.lastByClass.get(cls);
        if (last != null && ctx.lap - last < every) return false;
      }
      const rival = rivalOf(c.key);
      if (rival && this.rivalLap === ctx.lap && (this.rivalCount.get(rival) ?? 0) >= PER_RIVAL_PER_LAP) return false;
    } else if (regime === "essential" && cls === "comfort") {
      return false;
    }
    return true;
  }

  /** Enregistre ce qui a réellement été dit (budgets, calme après box). */
  commit(spoken: Candidate[], ctx: PolicyCtx): void {
    if (this.rivalLap !== ctx.lap) {
      this.rivalLap = ctx.lap;
      this.rivalCount.clear();
    }
    for (const c of spoken) {
      if (c.key === "pit:box") this.boxAt = ctx.nowS;
      const cls = classOf(c);
      if (cls === "situation" || cls === "comfort") this.lastByClass.set(cls, ctx.lap);
      const rival = rivalOf(c.key);
      if (rival) this.rivalCount.set(rival, (this.rivalCount.get(rival) ?? 0) + 1);
    }
  }
}
