/**
 * Réponse radio longue découpée (Atelier, opt-in) : une réponse du Coach IA
 * trop longue est coupée aux frontières de phrase, sans réécrire le texte ; le
 * premier morceau part tout de suite, les suivants un par ligne droite (pleine
 * charge, sans frein, volant droit) — ou aussitôt si la voiture est arrêtée ou
 * aux stands. Au-delà de `MAX_WAIT_MS` sans ligne droite, le morceau part quand
 * même. Une nouvelle réponse annule les morceaux en attente de la précédente.
 */

import { live, type LiveData } from "@/lib/api";
import { announceAnswer } from "@/lib/voice";

/** Longueur (caractères) au-delà de laquelle une réponse est découpée. */
export const SPLIT_OVER = 180;
/** Longueur visée d'un morceau. */
export const CHUNK_MAX = 140;
export const MAX_WAIT_MS = 20000;

/**
 * Découpe aux frontières de phrase (. ! ? … suivis d'un espace), en regroupant
 * les phrases courtes jusqu'à `max` caractères. Une phrase plus longue que
 * `max` reste entière (jamais coupée au milieu). Le texte n'est pas modifié :
 * la concaténation des morceaux (séparés d'un espace) redonne l'original.
 */
export function splitRadio(text: string, max = CHUNK_MAX): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?…]+(?:[.!?…]+|$)(?:["»”)]*)?/g)?.map((s) => s.trim()).filter(Boolean) ?? [clean];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && cur.length + 1 + s.length > max) {
      out.push(cur);
      cur = s;
    } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out;
}

/** La voiture est-elle en ligne droite (ou à l'arrêt / aux stands) ? */
export function radioWindowOpen(d: LiveData | null): boolean {
  const t = d?.telemetry;
  const me = d?.standings.find((s) => s.is_player);
  if (!d?.connected || !t || d.paused || me?.in_pits || t.speed_kmh < 30) return true;
  return t.throttle >= 0.9 && t.brake < 0.05 && Math.abs(t.steering) < 0.06 && t.speed_kmh > 100;
}

let generation = 0;

/**
 * Dit `text` en morceaux si il est long, sinon d'un bloc. `gone()` = la
 * demande a été abandonnée (fenêtre fermée…).
 */
export function deliverRadio(text: string, lang: string, gone: () => boolean = () => false): void {
  const chunks = text.length > SPLIT_OVER ? splitRadio(text) : [text];
  const gen = ++generation;
  const stale = () => gen !== generation || gone();
  let i = 0;
  let off: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Attente en cours : une souscription résolue après coup se désabonne. */
  let waitId = 0;

  const stop = () => {
    waitId++;
    off?.();
    off = null;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const sayNext = () => {
    stop();
    if (stale() || i >= chunks.length) return;
    const chunk = chunks[i++];
    announceAnswer(chunk, lang, () => {
      if (i < chunks.length) waitWindow();
    });
  };

  const waitWindow = () => {
    if (stale()) return;
    const w = waitId;
    timer = setTimeout(sayNext, MAX_WAIT_MS);
    void live
      .onData((d) => {
        if (w !== waitId) return;
        if (stale()) return stop();
        if (radioWindowOpen(d)) sayNext();
      })
      .then((u) => {
        if (stale() || w !== waitId) u();
        else off = u;
      })
      .catch(() => {});
  };

  sayNext();
}
