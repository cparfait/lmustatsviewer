/**
 * Spotter — raccourcis directs (sans parler).
 *
 * Statut / Mute / Répète → réponse parlée immédiate. L'ancienne touche « Parler »
 * (push-to-talk sur la liste des commandes) est désormais une **seconde touche de
 * l'ingénieur** (`useCoachVoice`) : même prise de parole, même réponse, avec la
 * reconnaissance stricte de la liste des commandes en secours (ou seule, réglage).
 *
 * Monté une seule fois au niveau de l'app (App.tsx) pour rester actif quelle que
 * soit la page. Les raccourcis ne sont enregistrés que si l'option est activée.
 */

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/stores/app";
import { isTauri, live } from "@/lib/api";
import { announce, announceAnswer, repeatLast, cancelSpeech } from "@/lib/voice";
import { buildStatus } from "@/lib/spotter";

export function useSpotter() {
  const { t, i18n } = useTranslation();
  const enabled = useAppStore((s) => s.spotterEnabled);
  const keyStatus = useAppStore((s) => s.spotterKeyStatus);
  const keyMute = useAppStore((s) => s.spotterKeyMute);
  const keyRepeat = useAppStore((s) => s.spotterKeyRepeat);

  // Refs « vivantes » : les handlers sont enregistrés une seule fois mais doivent
  // lire la langue / les traductions courantes sans réenregistrer les raccourcis.
  const tRef = useRef(t);
  const langRef = useRef(i18n.language);
  tRef.current = t;
  langRef.current = i18n.language;

  useEffect(() => {
    if (!enabled || !isTauri()) return;
    let disposed = false;

    const onStatus = async () => {
      const tt = tRef.current;
      const lang = langRef.current;
      try {
        const data = await live.getData();
        // Point de course demandé par le pilote : une réponse → voix IA si active.
        announceAnswer(buildStatus(data, tt, useAppStore.getState().classPositions), lang);
      } catch {
        announce(tt("live.spNoSession"), lang);
      }
    };
    const onMute = () => {
      const tt = tRef.current;
      const lang = langRef.current;
      const next = !useAppStore.getState().voiceAnnouncements;
      void useAppStore.getState().setVoiceAnnouncements(next);
      // À la coupure : silence immédiat (le silence EST la confirmation, et sur
      // la page Live `useVoiceCallouts` re-coupe de toute façon à la désactivation).
      // À la réactivation : confirmation parlée (qui survit, pas de cancel).
      if (next) announce(tt("live.spUnmuted"), lang);
      else cancelSpeech();
    };
    const onRepeat = () => {
      if (!repeatLast()) onStatus(); // rien à répéter → repli sur le statut
    };

    // accel → handler « Pressed » (un même accélérateur en double est écrasé).
    const pressMap: Record<string, () => void> = {};
    if (keyStatus) pressMap[keyStatus] = onStatus;
    if (keyMute) pressMap[keyMute] = onMute;
    if (keyRepeat) pressMap[keyRepeat] = onRepeat;
    const accels = [...Object.keys(pressMap)];

    (async () => {
      const gs = await import("@tauri-apps/plugin-global-shortcut");
      for (const accel of accels) {
        try {
          // Libère le raccourci s'il traîne d'un montage précédent (HMR, etc.).
          if (await gs.isRegistered(accel)) await gs.unregister(accel);
          await gs.register(accel, (e) => {
            if (disposed) return;
            if (e.state === "Pressed") pressMap[accel]?.();
          });
        } catch {
          /* accélérateur invalide ou déjà pris par une autre application */
        }
      }
    })();

    return () => {
      disposed = true;
      void (async () => {
        try {
          const gs = await import("@tauri-apps/plugin-global-shortcut");
          for (const accel of accels) {
            try {
              await gs.unregister(accel);
            } catch {
              /* déjà libéré */
            }
          }
        } catch {
          /* hors Tauri */
        }
      })();
    };
  }, [enabled, keyStatus, keyMute, keyRepeat]);
}
