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
