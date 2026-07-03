/**
 * « Connaissance circuit » unifiée pour le Coach IA.
 *
 * Couple les DEUX sources de référence d'un combo (circuit × classe) en une
 * seule rubrique injectée dans le prompt :
 *  - repères de freinage chiffrés (ApexPoints, via `braking-guide.ts`) ;
 *  - guide vidéo + transcription virage par virage (Unleashed Drivers, via
 *    `video-guides.ts`).
 *
 * Les deux décrivent les MÊMES virages : le coach doit les croiser (les chiffres
 * d'ApexPoints + les explications de la vidéo) plutôt que de les traiter
 * séparément. Renvoie "" si aucune source ne couvre le combo.
 */

import { buildBrakingGuideText } from "./braking-guide";
import { buildVideoGuideText } from "./video-guides";

export function buildTrackKnowledgeText(args: {
  track: string;
  trackCourse?: string;
  carClass: string;
  lang?: string;
}): string {
  const braking = buildBrakingGuideText(args);
  const video = buildVideoGuideText({
    track: args.track,
    trackCourse: args.trackCourse,
    carClass: args.carClass,
  });

  const parts = [braking, video].filter((s) => s.trim());
  if (parts.length === 0) return "";

  const head =
    "# Track knowledge (reference — cross-check both sources below; they cover the same corners)";
  return [head, ...parts].join("\n\n");
}
