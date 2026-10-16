/**
 * Mots de liaison de la synthèse vocale, par langue (module pur) : partagés par
 * la normalisation de `voice.ts` (« 0.5 » → « 0 virgule 5 ») et par l'assemblage
 * des annonces chiffrées (`cloudVoiceSegments.ts`), qui doivent dire la même chose.
 */

export interface TtsWords {
  decimal: string;
  seconds: string;
  kmh: string;
  plus: string;
  minus: string;
  degrees: string;
}

export const TTS_WORDS: Record<string, TtsWords> = {
  fr: { decimal: "virgule", seconds: "secondes", kmh: "kilomètres heure", plus: "plus", minus: "moins", degrees: "degrés" },
  en: { decimal: "point", seconds: "seconds", kmh: "kilometers per hour", plus: "plus", minus: "minus", degrees: "degrees" },
  es: { decimal: "coma", seconds: "segundos", kmh: "kilómetros por hora", plus: "más", minus: "menos", degrees: "grados" },
  de: { decimal: "Komma", seconds: "Sekunden", kmh: "Kilometer pro Stunde", plus: "plus", minus: "minus", degrees: "Grad" },
  it: { decimal: "virgola", seconds: "secondi", kmh: "chilometri orari", plus: "più", minus: "meno", degrees: "gradi" },
};

/** Mots de liaison de `lang` (code 2 lettres ou BCP-47), anglais par défaut. */
export function ttsWords(lang: string): TtsWords {
  return TTS_WORDS[(lang || "en").slice(0, 2).toLowerCase()] ?? TTS_WORDS.en;
}
