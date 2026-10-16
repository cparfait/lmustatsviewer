/**
 * Voix d'une annonce quand la voix en ligne est activée — module pur (testé par
 * `voice.suite.ts`), utilisé par la file de `voice.ts`.
 *
 * Deux portées, au choix dans la Config :
 *  - `all` (défaut) : **une seule voix** pour toute la radio. Les annonces dont le
 *    moment compte (alertes, coach par virage, « Répète ») n'attendent le service
 *    que brièvement ; le spotter n'attend jamais le réseau (audio déjà en
 *    mémoire, sinon Piper pour cette fois) ;
 *  - `info` : comportement d'origine, la voix en ligne seulement pour les infos et
 *    les réponses, Piper pour le reste (deux voix, mais aucune attente réseau sur
 *    une alerte).
 */

/** Priorités de la file vocale (copie de `VoicePriority`, sans dépendance). */
export type RoutePriority = "spotter" | "critical" | "normal" | "chatty" | "coach";

/** Portée de la voix en ligne (réglage `voice_cloud.scope`). */
export type CloudScope = "all" | "info";

/**
 * Comment la voix en ligne peut dire une annonce :
 *  - `off` : jamais, Piper ;
 *  - `memory` : seulement si son audio est déjà en mémoire (aucune attente) ;
 *  - `network` : requête au fournisseur, Piper sans réponse sous `timeoutMs`.
 */
export interface CloudRoute {
  use: "off" | "memory" | "network";
  timeoutMs: number;
}

/** Délai d'une annonce d'information ou d'une réponse (ms). */
export const CLOUD_TIMEOUT_MS = 3000;
/** Délai d'une alerte ou d'un conseil du coach en portée `all` (ms). */
export const CLOUD_FAST_TIMEOUT_MS = 1500;

/** Route d'une annonce. `cloudOk` : réponse au pilote (cf. `announceAnswer`). */
export function cloudRoute(priority: RoutePriority, cloudOk: boolean, scope: CloudScope): CloudRoute {
  if (priority === "normal" || priority === "chatty" || (priority === "critical" && cloudOk)) {
    return { use: "network", timeoutMs: CLOUD_TIMEOUT_MS };
  }
  if (scope === "info") return { use: "off", timeoutMs: 0 };
  // Un « voiture à gauche » dit une seconde trop tard est faux : jamais de réseau.
  if (priority === "spotter") return { use: "memory", timeoutMs: 0 };
  return { use: "network", timeoutMs: CLOUD_FAST_TIMEOUT_MS };
}
