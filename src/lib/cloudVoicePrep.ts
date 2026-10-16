/**
 * « Préparer la voix » (voix en ligne, bêta) : liste des phrases fixes de
 * l'ingénieur à générer d'avance et estimation du coût. Module pur (testé par
 * `radio.suite.ts`) ; la génération elle-même est dans `cloudVoice.ts`.
 *
 * Seules comptent les annonces que la voix en ligne peut dire : celles que
 * l'ingénieur émet en priorité `normal` ou `chatty` (cf. `voice.ts::cloudEligible`).
 * Les alertes `critical` (drapeaux jaunes, crevaison, box…), le spotter et le
 * coach par virage restent sur Piper : les préparer serait payer pour rien.
 */

import { splitVariants } from "@/lib/engineer/variants";

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
 * Phrase fixe : courte et sans chiffre, elle revient mot pour mot → cache
 * (mémoire pour Piper, disque pour la voix en ligne). Critère partagé avec
 * `voice.ts` : le cache préparé n'est utile que si la course le relit.
 */
export function isFixedPhrase(text: string): boolean {
  return text.length <= 70 && !/\d/.test(text);
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
