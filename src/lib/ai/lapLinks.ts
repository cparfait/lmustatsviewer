/**
 * Temps au tour cliquables dans les réponses du Coach IA.
 *
 * Le contexte envoyé au coach liste des temps tirés de sessions connues (PB du
 * combo, historique récent, record de chaque voiture sur le circuit). On garde
 * ici, pour chacun, la session d'origine : quand la réponse recopie un de ces
 * temps **à l'identique** (même format `formatTime`), il devient un lien vers
 * cette session. Un temps porté par deux sessions différentes est ambigu → pas
 * de lien (mieux vaut aucun lien qu'un lien faux).
 */

import { formatTime } from "../utils";

export interface LapLink {
  sessionId: number;
  /** Infobulle : de quelle session il s'agit (date, type, voiture). */
  hint: string;
}

/** Temps formaté → session ; `null` = temps ambigu (plusieurs sessions). */
export type LapLinks = Map<string, LapLink | null>;

export function addLapLink(links: LapLinks, seconds: number, sessionId: number, hint: string): void {
  if (!(seconds > 0) || !sessionId) return;
  const key = formatTime(seconds);
  const prev = links.get(key);
  if (prev === undefined) links.set(key, { sessionId, hint });
  else if (prev && prev.sessionId !== sessionId) links.set(key, null);
}

/** Temps au tour tel que l'écrit `formatTime` (ex. `2:26.707`, `59.812` exclu). */
const LAP_TIME = /(\d{1,2}:\d{2}\.\d{3})/g;

/**
 * Découpe un texte en morceaux : texte brut, ou temps relié à une session.
 * Sans lien connu, le temps reste du texte.
 */
export function splitLapTimes(
  text: string,
  links: LapLinks | undefined,
): Array<string | { time: string; link: LapLink }> {
  if (!links || links.size === 0) return [text];
  const out: Array<string | { time: string; link: LapLink }> = [];
  let last = 0;
  for (const m of text.matchAll(LAP_TIME)) {
    const link = links.get(m[1]);
    if (!link) continue;
    // Pas un morceau d'un nombre plus long (`12:26.7071`, `x2:26.707`).
    const before = text[m.index - 1];
    const after = text[m.index + m[1].length];
    if ((before && /[\d:.]/.test(before)) || (after && /\d/.test(after))) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ time: m[1], link });
    last = m.index + m[1].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
