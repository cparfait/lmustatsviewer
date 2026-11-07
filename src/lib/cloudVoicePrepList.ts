/**
 * Liste exacte de ce que « Préparer la voix » génère : phrases fixes et morceaux des
 * annonces chiffrées. Partagée par le devis (`CloudVoicePrepare.tsx`) et le banc
 * d'écoute, qui montre donc bien tout ce qui est généré.
 */

import { useEffect, useState } from "react";
import { isTauri, queries } from "@/lib/api";
import {
  CLOUD_PREP_ANSWER_KEYS,
  CLOUD_PREP_WHEEL_KEYS,
  WHEEL_VOICE_KEYS,
  cloudPrepKeys,
  spokenFixedKeys,
  wheelTemplates,
} from "@/lib/cloudVoicePrep";
import { arrivalTrackNames } from "@/lib/engineer/trackRecall";
import { getMessageText } from "@/lib/voiceMessages";
import { cloudPrepTexts, cloudSegmentPrepTexts } from "@/lib/voice";

export interface CloudPrepList {
  code: string;
  rate: number;
  /** Phrases fixes, dites entières. */
  phrases: string[];
  /** Morceaux des annonces chiffrées (nombres, parties fixes, noms de circuit). */
  segments: string[];
  /** Les deux, sans doublon : ce qui est réellement généré. */
  all: string[];
}

export function buildPrepList(
  lang: string,
  t: (key: string, opts: { lng: string }) => string,
  live: Record<string, unknown> | undefined,
  trackNames: string[],
): CloudPrepList {
  const { code, rate, texts: phrases } = cloudPrepTexts(
    [
      // Toutes les phrases fixes de l'ingénieur (listes + tout le bundle `live`).
      ...[...new Set([...cloudPrepKeys(), ...spokenFixedKeys(live)])].map((k) => getMessageText(lang, k)),
      // Crevaison / roue arrachée nommées : une version par roue.
      ...CLOUD_PREP_WHEEL_KEYS.flatMap((k) =>
        wheelTemplates(
          getMessageText(lang, k),
          WHEEL_VOICE_KEYS.map((w) => t(`live.wheelVoice.${w}`, { lng: lang })),
        ),
      ),
      // Réponses de l'ingénieur quand on lui parle (accusé, « pas compris »…).
      ...CLOUD_PREP_ANSWER_KEYS.map((k) => t(k, { lng: lang })),
    ],
    lang,
  );
  // Annonces chiffrées : leurs morceaux sont toujours préparés, avec les noms de circuit de l'accueil.
  const segments = cloudSegmentPrepTexts(lang, trackNames);
  return { code, rate, phrases, segments, all: [...new Set([...phrases, ...segments])] };
}

/** Noms de circuit dits par l'accueil : les circuits connus, plus ceux déjà roulés. */
export function usePrepTrackNames(): string[] {
  const [names, setNames] = useState(() => arrivalTrackNames([]));
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    queries
      .getBestLaps()
      .then((rows) => {
        if (alive) setNames(arrivalTrackNames(rows));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return names;
}
