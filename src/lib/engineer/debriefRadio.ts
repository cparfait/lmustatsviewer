/**
 * Bilan dit à la radio au drapeau à damier (module pur, sans IA).
 *
 * La **première phrase porte le résultat** (la radio peut couper après elle) : victoire
 * ou podium célébrés, sinon « P5 sur 12 en classe ». Place absente ou nulle → phrase sans
 * place (jamais une place inventée). Suivent, courts : places gagnées depuis le départ
 * (seulement si la grille a été vue), meilleur tour et arrêts. Abandon et
 * disqualification : une phrase sans chiffres.
 *
 * Chaque morceau a ses variantes (« A | B ») : `pick` en tire une par morceau avant
 * l'assemblage (une phrase assemblée ne se découpe plus en variantes).
 */

import type { Tr } from "@/i18n";

export interface ChequeredInput {
  /** `finish_status` du jeu : 1 arrivée, 2 abandon, 3 disqualification. */
  status: number;
  classPos: number | null;
  classCount: number | null;
  /** Place en classe vue sur la grille (null si le départ n'a pas été vu). */
  startClassPos: number | null;
  bestLap: number | null;
  stops: number;
}

export type Pick = (key: string, text: string) => string;

/** Faux abandon : délai avant de relire `UserData/Saves` quand rien n'a été trouvé (ms). */
export const SAVE_RETRY_MS = 5000;
/** Après un (re)démarrage ou un rechargement, délai avant de croire que la course roule (ms). */
export const RACE_SEEN_GRACE_MS = 6000;
/** Saut de l'horloge de session d'une trame à l'autre : une sauvegarde rechargée (s). */
export const RELOAD_JUMP_S = 30;

/**
 * Verdict d'une lecture de `UserData/Saves` quand le jeu dit « abandon » : sauvegarde
 * non marquée abandon = on se tait ; rien trouvé (ou erreur) à la première lecture = on
 * relit (le jeu peut écrire le fichier juste après), puis on croit le jeu.
 */
export function saveVerdict(save: { retired?: boolean | null } | null, attempt: number): "save" | "dnf" | "retry" {
  if (save) return save.retired === true ? "dnf" : "save";
  return attempt < 1 ? "retry" : "dnf";
}

/** Vitesse au-delà de laquelle la voiture roule vraiment (km/h). */
export const DNF_ROLLING_KMH = 20;
/** Marge après le passage en « abandon » : la dernière trame peut encore porter de la vitesse (ms). */
export const DNF_ROLLING_AFTER_MS = 1500;

/**
 * Le jeu dit « abandon » mais la voiture roule encore : une course rechargée, pas un
 * abandon. Un vrai abandon renvoie le joueur au garage ou à l'écran de fin.
 */
export function dnfStillDriving(sinceMs: number, nowMs: number, speedKmh: number): boolean {
  return nowMs - sinceMs >= DNF_ROLLING_AFTER_MS && speedKmh > DNF_ROLLING_KMH;
}

/** L'horloge de session a sauté en avant : rechargement (reculer, c'est déjà un redémarrage). */
export function clockJumped(prevS: number, nowS: number): boolean {
  return prevS > 0 && nowS - prevS > RELOAD_JUMP_S;
}

/**
 * « La course a été vue rouler » : condition du bilan au damier et de l'abandon. Recharger
 * une sauvegarde fait passer le jeu en « abandon » juste après la remise à zéro : le
 * rechargement ne compte donc pas comme une course vue, il faut qu'elle roule au-delà du délai.
 */
export class RaceSeen {
  seen = false;
  private from = 0;

  restart(nowMs: number): void {
    this.seen = false;
    this.from = nowMs + RACE_SEEN_GRACE_MS;
  }

  /** `running` : course, au moins un tour bouclé, aucun statut de fin. */
  frame(nowMs: number, running: boolean): void {
    if (running && nowMs >= this.from) this.seen = true;
  }
}

export function chequeredPhrase(i: ChequeredInput, t: Tr, lapVoice: (s: number) => string, pick: Pick): string {
  const say = (key: string, vars?: Record<string, unknown>) => pick(key, t(key, vars));
  if (i.status === 2) return say("live.vDebriefDnf");
  if (i.status === 3) return say("live.vDebriefDq");
  const p = i.classPos != null && i.classPos > 0 ? i.classPos : null;
  const parts: string[] = [];
  if (p === 1) parts.push(say("live.vDebriefWin"));
  else if (p != null && p <= 3) parts.push(say("live.vDebriefPodium", { p }));
  else if (p != null && i.classCount) parts.push(say("live.vDebriefClass", { p, n: i.classCount }));
  else parts.push(say("live.vDebriefNoPlace"));
  if (p != null && i.startClassPos != null && i.startClassPos > 0) {
    const g = i.startClassPos - p;
    if (g === 1) parts.push(say("live.vDebriefGain1"));
    else if (g > 1) parts.push(say("live.vDebriefGain", { n: g }));
    else if (g === -1) parts.push(say("live.vDebriefLost1"));
    else if (g < -1) parts.push(say("live.vDebriefLost", { n: -g }));
  }
  const best = i.bestLap && i.bestLap > 0 ? lapVoice(i.bestLap) : "";
  if (best && i.stops > 0)
    parts.push(say(i.stops === 1 ? "live.vDebriefBestStop1" : "live.vDebriefBestStops", { time: best, n: i.stops }));
  else if (best) parts.push(say("live.vDebriefBest", { time: best }));
  parts.push(say("live.vDebriefEnd"));
  return parts.join(" ");
}
