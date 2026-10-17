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
