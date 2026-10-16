/**
 * Choix d'une commande dans la **liste des commandes** (phrases éditables de la
 * Config) pour une prise de parole — module pur (testable sans Tauri), utilisé
 * par `ask.ts`.
 */

import { matchIntent } from "@/lib/spotterCommands";
import { RADIO_COMMANDS, type AnswerIntent } from "@/lib/engineer/router";

/** Intentions qui **agissent** (et ne se contentent pas de répondre). */
const ACTIONS = new Set<string>(["ackBox", "stayOut", "watchCancel", "watch", "mute", "repeat"]);

export function isAction(id: string): boolean {
  return ACTIONS.has(id) || RADIO_COMMANDS.has(id as AnswerIntent);
}

/**
 * Intention prise dans la liste des commandes : d'abord sur la dictée libre,
 * puis sur la reconnaissance stricte de la même prise de parole. Une question
 * longue (> 4 mots) n'y passe qu'en l'absence d'IA : sinon un mot-clé comme
 * « devant » détournerait une vraie question ouverte destinée au Coach IA.
 */
export function commandFromPhrases(free: string, strict: string, lang: string, aiReady: boolean): AnswerIntent | null {
  const words = free.trim().split(/\s+/).filter(Boolean).length;
  const short = words <= 4;
  if (free.trim() && (short || !aiReady)) {
    const m = matchIntent(free, lang);
    if (m) return m as AnswerIntent;
  }
  if (strict.trim() && (short || !aiReady)) {
    const m = matchIntent(strict, lang);
    if (m) return m as AnswerIntent;
  }
  return null;
}
