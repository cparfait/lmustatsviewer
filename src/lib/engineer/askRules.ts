/**
 * Règles pures de la question vocale (testées seules) : relances bornées du coach IA et
 * dictée trop incertaine pour partir à l'IA.
 */

/** Échange récent avec le coach vocal (question, réponse, relance ?). */
export interface Exchange {
  q: string;
  a: string;
  at: number;
  clarify: boolean;
}

/** Fenêtre du fil radio et des échanges joints à la question (ms). */
export const THREAD_MS = 3 * 60_000;
/** Relances de suite au-delà desquelles l'IA ne redemande plus (meilleure lecture). */
export const CLARIFY_MAX = 2;
/** Confiance de dictée sous laquelle on fait répéter plutôt que d'interroger l'IA. */
export const STT_UNSURE_CONF = 0.55;

/** Une réponse qui demande de répéter ou de préciser (question courte au pilote). */
export function isClarification(answer: string): boolean {
  const a = answer.trim();
  return a.endsWith("?") && a.split(/\s+/).length <= 18;
}

/** Relances consécutives de l'IA dans la fenêtre (la plus récente d'abord). */
export function clarifyStreak(list: Exchange[], now = Date.now()): number {
  let n = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (now - list[i].at > THREAD_MS || !list[i].clarify) break;
    n++;
  }
  return n;
}

/** La dictée libre est-elle trop incertaine pour partir à l'IA ? (≥ 3 mots, mesure connue) */
export function sttUnsure(text: string, confidence: number | null | undefined, threshold = STT_UNSURE_CONF): boolean {
  if (confidence == null || !isFinite(confidence)) return false;
  if (text.trim().split(/\s+/).length < 3) return false;
  return confidence < threshold;
}
