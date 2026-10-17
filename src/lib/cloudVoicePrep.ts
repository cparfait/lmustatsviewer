/**
 * « Préparer la voix » (voix en ligne, bêta) : liste des phrases fixes de
 * l'ingénieur à générer d'avance et estimation du coût. Module pur (testé par
 * `radio.suite.ts`) ; la génération elle-même est dans `cloudVoice.ts`.
 *
 * Deux familles :
 *  - l'information (`normal`, `chatty`) : dite en direct si elle n'est pas prête ;
 *  - les phrases urgentes (sécurité `critical`, spotter, coach) : la voix en ligne
 *    ne les dit **que préparées** (lecture instantanée du cache), sinon Piper —
 *    une alerte n'attend jamais le réseau. Réglage « Alertes en voix locale » :
 *    elles restent toutes sur Piper (ancien comportement), rien à préparer.
 *
 * Les annonces chiffrées s'y ajoutent par morceaux (nombres, parties fixes des
 * gabarits : `cloudVoiceSegments.ts`), recollés à la lecture.
 */

import { splitVariants } from "@/lib/engineer/variants";
import type { VoicePriority } from "@/lib/voice";
import type { CloudNumbersMode } from "@/lib/cloudVoice";

/**
 * Comment la voix en ligne traite une annonce :
 *  - `live` : en direct (requête au fournisseur si la phrase n'est pas en cache) ;
 *  - `cached` : seulement si la phrase est déjà prête (cache mémoire ou disque) ;
 *  - `off` : jamais (Piper).
 * Les réponses au pilote (`cloudOk`) passent en direct malgré leur priorité critique.
 */
export type CloudMode = "live" | "cached" | "off";

export function cloudModeFor(priority: VoicePriority, cloudOk: boolean, alertsLocal: boolean): CloudMode {
  if (priority === "normal" || priority === "chatty") return "live";
  if (priority === "critical" && cloudOk) return "live";
  return alertsLocal ? "off" : "cached";
}

/**
 * Gabarits `live.*` dits par `useRaceEngineer.ts` en priorité `normal`/`chatty`
 * et sans variable. Le test « préparation de la voix » relit le source de
 * l'ingénieur : une clé ajoutée là-bas sans être reportée ici le fait échouer.
 */
export const CLOUD_PREP_KEYS: readonly string[] = [
  "vFlagGreen",
  "vColdTyres",
  "vTyreWear",
  "vTyreOverheat",
  "vTakeLead",
  "vGapAhead",
  "vUnderAttack",
  "vBlueFlag",
  "vPurpleSector",
  "vPitRequest",
  "vPitExitLimiter",
  "vPitDone",
  "vFinalLap",
  "vHalfway",
  "vLastMinute",
  "vBatterySaturated",
  "vPostureAttack",
  "vEngineTemp",
  "vRainStart",
  "vRainStop",
  "vRainHeavier",
  "vRefuelNeeded",
  "vAskLapPref",
];

/**
 * Gabarits urgents sans variable : sécurité (`critical` dans `useRaceEngineer.ts`),
 * spotter (`SPOT_KEYS`) et conseils fixes du coach de relais (`coach/stint.ts`).
 * Préparés pour que la voix en ligne les dise sans délai ; le test « préparation
 * de la voix » vérifie que chaque gabarit critique sans variable y figure.
 */
export const CLOUD_PREP_ALERT_KEYS: readonly string[] = [
  "vFlagYellow",
  "vFlagFcy",
  "vFlagStopped",
  "vBoxBox",
  "vPuncture",
  "vWheelDetached",
  "vPenalty",
  "vDamage",
  "vOverheat",
  "vBrakeOverheat",
  "vPitLaneLimiter",
  "vLimiterForgotten",
  "vSpotLeft",
  "vSpotRight",
  "vSpotThree",
  "vSpotClear",
  "vSpotClearLeft",
  "vSpotClearRight",
  "vSpotStill",
  "vStintLiftCoast",
  "vStintOutLap",
];

/**
 * Gabarits d'information dits hors de `useRaceEngineer.ts` (records au volant,
 * repères de revue : `engineer/sideCallouts.ts`), sans variable, en priorité `normal`.
 */
export const CLOUD_PREP_EXTRA_KEYS: readonly string[] = [
  "vRecordPersonal",
  "vRecordClass",
  "vRecordCommunity",
  "vReviewMark",
];

/** Gabarits à préparer : l'information, plus les phrases urgentes sauf « alertes en voix locale ». */
export function cloudPrepKeys(alertsLocal: boolean): string[] {
  const info = [...CLOUD_PREP_KEYS, ...CLOUD_PREP_EXTRA_KEYS];
  return alertsLocal ? info : [...info, ...CLOUD_PREP_ALERT_KEYS];
}

/**
 * Morceaux des annonces chiffrées à préparer ? Oui si le réglage « Annonces
 * chiffrées » les lit pour l'information (`all`) ou pour les alertes (`alerts`,
 * sauf « Alertes en voix locale » : elles restent alors sur Piper).
 */
export function segmentsWanted(numbers: CloudNumbersMode, alertsLocal: boolean): boolean {
  return numbers === "all" || (numbers === "alerts" && !alertsLocal);
}

/**
 * Une phrase chiffrée peut-elle être assemblée dans ce mode ? Urgent (`cached`)
 * sauf réglage `off` ; information (`live`) seulement avec « tout assemblé ».
 */
export function assembleAllowed(mode: CloudMode, numbers: CloudNumbersMode): boolean {
  return numbers === "all" || (numbers === "alerts" && mode === "cached");
}

/**
 * Phrase fixe : sans chiffre (et pas un paragraphe), elle revient mot pour mot →
 * cache (mémoire pour Piper, disque pour la voix en ligne). Critère partagé avec
 * `voice.ts` : le cache préparé n'est utile que si la course le relit. Plafond
 * relevé de 70 à 160 caractères (2026-10-16) : les questions de l'ingénieur
 * (« tes chronos, tu les veux… ») se préparent aussi.
 */
export function isFixedPhrase(text: string): boolean {
  return text.length <= 160 && !/\d/.test(text);
}

/**
 * Phrases à préparer : chaque variante `A | B | C` de chaque gabarit, passée par
 * la même normalisation que `speak` (`normalize`), sans doublon, et seulement si
 * elle est fixe (sinon la course ne la chercherait pas dans le cache).
 */
export function fixedPhrases(templates: string[], normalize: (text: string) => string): string[] {
  const out = new Set<string>();
  for (const tpl of templates) {
    // Un gabarit à variable (texte personnalisé) n'est jamais dit tel quel.
    if (tpl.includes("{{")) continue;
    for (const v of splitVariants(tpl)) {
      const text = normalize(v);
      if (text && isFixedPhrase(text)) out.add(text);
    }
  }
  return [...out];
}

/**
 * Tarif public approximatif en dollars par million de caractères (relevé le
 * 2026-10-15, cf. `voice-eval/README.md`). Une estimation pour décider, pas une
 * facture : les forfaits et crédits gratuits varient d'un compte à l'autre.
 */
const USD_PER_M_CHARS: Record<string, number> = {
  openai: 15,
  "openai:tts-1-hd": 30,
  elevenlabs: 40,
  cartesia: 50,
  // Chirp 3 HD, au-delà du million de caractères gratuit par mois (tarif de mémoire,
  // page de prix non lisible le 2026-10-15 : à confirmer).
  google: 30,
};

/** Coût estimé (USD) de `chars` caractères chez `provider` avec `model`. */
export function estimateCostUsd(provider: string, model: string, chars: number): number {
  const rate = USD_PER_M_CHARS[`${provider}:${model}`] ?? USD_PER_M_CHARS[provider] ?? 50;
  return (chars * rate) / 1_000_000;
}
