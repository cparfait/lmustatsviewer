/**
 * Règles pures du micro et de la voix (testées par `mic.suite.ts`) : quand ouvrir
 * le micro permanent, quand prendre les raccourcis globaux, quand prévenir le
 * pilote, quand réclamer une voix à télécharger.
 */

/**
 * Le micro permanent (moteur natif) ne s'ouvre que pour une fonction vocale
 * active : annonces vocales allumées (interrupteur global de l'ingénieur et du
 * coach) ET « Micro prêt » ou mot déclencheur. Sinon le micro reste fermé :
 * push-to-talk, dictée du coach IA et test des commandes l'ouvrent à la demande.
 */
export function micEngineWanted(s: { voice: boolean; micReady: boolean; wakeOn: boolean }): boolean {
  return s.voice && (s.micReady || s.wakeOn);
}

/**
 * Raccourcis globaux du push-to-talk : pris seulement si la voix sert. Une voix
 * allumée plus tôt dans la session les conserve : « coupe la radio » dit à la
 * touche doit pouvoir être suivi de « active le son » à la même touche.
 */
export function pttKeysWanted(voiceOn: boolean, voiceOnEarlier: boolean): boolean {
  return voiceOn || voiceOnEarlier;
}

/** Laisse passer un message une seule fois par clé, jusqu'au prochain `reset`. */
export function createOnceGate() {
  let last: string | null = null;
  return {
    pass(key: string): boolean {
      if (last === key) return false;
      last = key;
      return true;
    },
    reset() {
      last = null;
    },
  };
}

/**
 * La capture navigateur est-elle retombée sur un autre micro que celui choisi ?
 * `foundId` : micro choisi retrouvé parmi les entrées ; `openedId` : micro du flux
 * réellement ouvert (inconnu = pas de preuve de repli).
 */
export function micFellBack(wanted: string, foundId: string | null, openedId: string | undefined): boolean {
  if (!wanted.trim()) return false;
  if (!foundId) return true;
  return !!openedId && openedId !== foundId;
}

/**
 * Voix à proposer dans le bandeau « voix manquante » : aucune tant qu'une voix de
 * la langue est installée (n'importe laquelle : le moteur s'en sert, cf.
 * `resolve_model`) ; sinon la voix par défaut.
 */
export function missingVoiceRow<T extends { is_default: boolean; installed: boolean }>(rows: T[]): T | null {
  if (rows.some((a) => a.installed)) return null;
  return rows.find((a) => a.is_default) ?? rows[0] ?? null;
}
