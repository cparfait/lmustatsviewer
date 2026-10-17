/**
 * Ce que l'ingénieur dit à la radio quand une réponse échoue (module pur).
 *
 * Le message détaillé (modèle retiré, clé refusée, quota…) reste à l'écran ;
 * la radio dit une phrase courte. Pour une cause que le pilote doit corriger
 * lui-même (modèle, clé), un rappel est dit **une fois** : redit seulement
 * après une réponse réussie du coach (`hinted` vidé par l'appelant).
 */

import type { AiErrorKind } from "@/lib/ai/errorKind";

/** Causes qui méritent un rappel vocal, avec leur clé i18n. */
export const RADIO_HINT_KEYS: Partial<Record<AiErrorKind, string>> = {
  model: "coach.voiceHintModel",
  key: "coach.voiceHintKey",
};

/** Clé i18n de la phrase radio pour une erreur du coach IA ; note le rappel dit. */
export function radioErrorKey(kind: AiErrorKind, hinted: Set<AiErrorKind>): string {
  const hint = RADIO_HINT_KEYS[kind];
  if (hint && !hinted.has(kind)) {
    hinted.add(kind);
    return hint;
  }
  return "coach.voiceUnavailable";
}
