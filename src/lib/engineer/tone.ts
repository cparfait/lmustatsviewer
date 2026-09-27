/**
 * Arbitre de ton « pousse / gère » (module pur + état partagé).
 *
 * Sans lui, chaque émetteur décide seul de l'intensité : le coach dit « tu as du
 * grip en réserve » pendant que le carburant demande de lever le pied, ou qu'un
 * pneu surchauffe. Ici on calcule UN niveau par instant, que tous les émetteurs
 * d'encouragement consultent : un « pousse » qui contredirait une contrainte
 * physique n'est pas dit (le message de contrainte, lui, part toujours).
 *
 *  - `prudent` : une contrainte dure (mécanique, carburant/énergie critique,
 *    batterie critique, pneus en surchauffe) ou molle (piste mouillée, pneus
 *    usés) commande de gérer ;
 *  - `attaque` : rien ne contraint et la course le demande (bagarre dans la
 *    classe, dernier cinquième de course) ;
 *  - `normal` sinon.
 *
 * Hystérésis : passer à `prudent` est immédiat (la contrainte gagne toujours) ;
 * en sortir, ou basculer entre `normal` et `attaque`, exige que le nouveau niveau
 * soit tenu `TONE_HOLD_S` secondes (anti yo-yo). Au moindre doute : `normal`.
 */

export type Tone = "prudent" | "normal" | "attaque";

/** Durée de tenue avant d'adopter un niveau moins contraint (s). */
export const TONE_HOLD_S = 30;
/** Début de course où l'on assure (fraction). */
export const PHASE_START = 0.15;
/** Fin de course où l'on peut lâcher les chevaux (fraction). */
export const PHASE_END = 0.8;
/** Gomme restante (%) sous laquelle on ménage. */
export const TYRES_LOW_PCT = 25;
/** Humidité de trajectoire (0-1) au-delà de laquelle on est prudent. */
export const WET_PATH = 0.2;
/** Écart (s) à un rival de même classe qui vaut « bagarre ». */
export const BATTLE_GAP_S = 3;

export interface ToneInputs {
  /** Souci mécanique (surchauffe moteur, crevaison, roue, gros dégât récent). */
  mech: boolean;
  /** Carburant / énergie critique (≤ ~1,5 tour d'autonomie). */
  fuelCritical: boolean;
  batteryCritical: boolean;
  /** Pneus en surchauffe tenue. */
  tyreOverheat: boolean;
  /** Humidité moyenne de trajectoire (0-1). */
  pathWetness: number;
  /** Gomme restante mini (%) — 100 si inconnue. */
  minWear: number;
  /** Rival de même classe à ≤ `BATTLE_GAP_S` (devant ou derrière). */
  battle: boolean;
  /** Avancement de la course (0-1), null si inconnu ou hors course. */
  raceFraction: number | null;
  isRace: boolean;
}

/** Niveau voulu à cet instant, sans hystérésis. */
export function desiredTone(i: ToneInputs): Tone {
  if (i.mech || i.fuelCritical || i.batteryCritical || i.tyreOverheat) return "prudent";
  if (i.pathWetness > WET_PATH || (i.minWear > 0 && i.minWear < TYRES_LOW_PCT)) return "prudent";
  if (!i.isRace) return "normal";
  if (i.battle) return "attaque";
  if (i.raceFraction != null && i.raceFraction >= PHASE_END) return "attaque";
  return "normal";
}

export class ToneArbiter {
  level: Tone = "normal";
  private candidate: Tone = "normal";
  private candidateSince = 0;

  reset(): void {
    this.level = "normal";
    this.candidate = "normal";
    this.candidateSince = 0;
  }

  update(i: ToneInputs, nowS: number): Tone {
    const want = desiredTone(i);
    if (want === "prudent") {
      this.level = "prudent";
      this.candidate = "prudent";
      this.candidateSince = nowS;
      return this.level;
    }
    if (want === this.level) {
      this.candidate = want;
      return this.level;
    }
    if (want !== this.candidate) {
      this.candidate = want;
      this.candidateSince = nowS;
    }
    if (nowS - this.candidateSince >= TONE_HOLD_S) this.level = want;
    return this.level;
  }
}

// ── État partagé (lu par le coach par virage, hors de la page Live) ──────────

let shared: Tone = "normal";

/** Publie le niveau courant (appelé par la boucle des annonces live). */
export function setSharedTone(t: Tone): void {
  shared = t;
}

/** Niveau courant ; `normal` tant que personne ne l'a calculé (fail-open). */
export function getSharedTone(): Tone {
  return shared;
}

/**
 * Gabarits d'annonce qui poussent à attaquer : tus quand le ton est `prudent`.
 * (Coach par virage : grip non exploité, trop lent à l'apex, remise des gaz
 * tardive ; cible de classe.)
 */
export const PUSH_SUFFIXES = new Set([
  "vCornerGripUnused",
  "vCornerOverSlow",
  "vCornerOverSlowUsual",
  "vCornerLateThrottle",
  "vClassTarget",
]);
