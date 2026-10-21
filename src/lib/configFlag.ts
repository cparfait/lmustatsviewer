/**
 * Interrupteurs simples (« 1 » / absent) stockés en config, relus à chaud : un réglage
 * changé dans la Configuration prévient les composants et hooks déjà montés (évènement
 * fenêtre `lmusv:config-flag`). Toutes ces options sont désactivées par défaut.
 */
import { useEffect, useState } from "react";
import { config, isTauri } from "@/lib/api";

const EVENT = "lmusv:config-flag";

/** Écrit l'interrupteur et prévient les abonnés de la fenêtre. */
export async function setConfigFlag(key: string, on: boolean): Promise<void> {
  await config.set(key, on ? "1" : "0");
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { key, on } }));
}

/** Valeur courante d'un interrupteur (false tant qu'elle n'est pas lue). */
export function useConfigFlag(key: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    void config
      .get(key)
      .then((v) => alive && setOn(v === "1"))
      .catch(() => {});
    const onChange = (e: Event) => {
      const d = (e as CustomEvent<{ key: string; on: boolean }>).detail;
      if (d?.key === key) setOn(d.on);
    };
    window.addEventListener(EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, onChange);
    };
  }, [key]);
  return on;
}

/** Clés des nouveautés d'analyse (veille 2026-10-17), toutes désactivées par défaut. */
export const FLAG_REGULARITY = "session_regularity";
export const FLAG_COMPARABLE = "comparable_tags";
export const FLAG_RECORD_BEEPS = "record_beeps";
export const FLAG_REVIEW_MARKS = "review_marks_enabled";

/**
 * Atelier setup et analyses (veille du 2026-10-20), toutes désactivées par défaut
 * (Config › Atelier).
 */
export const FLAG_SETUP_AUDIT = "lab_setup_audit";
export const FLAG_BOX_DEBRIEF = "lab_box_debrief";
export const FLAG_SETUP_PROFILES = "lab_setup_profiles";
export const FLAG_AIDS_ZONES = "lab_aids_zones";
export const FLAG_PLATFORM_WATCH = "lab_platform_watch";
export const FLAG_FIXED_SETUP = "lab_fixed_setup";
export const FLAG_DRIVER_STYLE = "lab_driver_style";
export const FLAG_SETUP_PLATES = "lab_setup_plates";
export const FLAG_SETUP_SHARING = "lab_setup_sharing";
export const FLAG_RADIO_SPLIT = "lab_radio_split";
export const FLAG_STREAM_EVENTS = "lab_stream_events";
export const FLAG_ACHIEVEMENTS = "lab_achievements";

/** Lecture ponctuelle d'un interrupteur (hors composant React). */
export async function readConfigFlag(key: string): Promise<boolean> {
  if (!isTauri()) return false;
  return (await config.get(key).catch(() => null)) === "1";
}
