/**
 * Annonces de l'ingénieur déclenchées hors de `useRaceEngineer` (records au volant,
 * repères de revue). Quand les annonces vocales sont actives (même règle que
 * `RaceEngineerHost` : interrupteur « Annonces vocales », partout ou page Live),
 * une phrase à variantes est dite ; sinon l'appelant garde son bip.
 *
 * Ces gabarits sans variable sont aussi préparés par « Préparer la voix »
 * (`CLOUD_PREP_EXTRA_KEYS` dans `cloudVoicePrep.ts`).
 */
import i18n from "@/i18n";
import { useAppStore } from "@/stores/app";
import { speak } from "@/lib/voice";
import { VariantPicker } from "@/lib/engineer/variants";

/** Gabarits `live.*` dits par ce module. */
export const SIDE_CALLOUT_KEYS = ["vRecordPersonal", "vRecordClass", "vRecordCommunity", "vReviewMark"] as const;
export type SideCalloutKey = (typeof SIDE_CALLOUT_KEYS)[number];

const picker = new VariantPicker();

/** Les annonces vocales de l'ingénieur sont-elles actives en ce moment ? */
export function engineerVoiceActive(): boolean {
  const s = useAppStore.getState();
  const onLive = typeof window !== "undefined" && window.location.pathname.startsWith("/live");
  return s.voiceAnnouncements && (s.announceEverywhere || onLive);
}

/**
 * Dit le gabarit si la voix est active ; renvoie `false` sinon (l'appelant joue
 * alors son bip). Les variantes « A | B | C » tournent sans redite.
 */
export function sayLive(key: SideCalloutKey): boolean {
  if (!engineerVoiceActive()) return false;
  const lang = i18n.language || "fr";
  const text = picker.pick(key, i18n.t(`live.${key}`));
  if (!text) return false;
  speak(text, lang, "normal");
  return true;
}

/** Gabarit d'un nombre de bips de record (1 perso, 2 classe en séance, 3 communauté). */
export function recordKey(count: 1 | 2 | 3): SideCalloutKey {
  return count === 3 ? "vRecordCommunity" : count === 2 ? "vRecordClass" : "vRecordPersonal";
}
