/**
 * Raccourci clavier global « Afficher / Masquer les overlays ».
 *
 * Monté une seule fois au niveau de l'app (App.tsx) → actif quelle que soit la
 * page et même quand le jeu a le focus (raccourci OS global). À l'appui, bascule
 * l'affichage (`masterEnabled`) — cache/montre tous les overlays sans toucher à
 * leur état (coché) ni à leurs positions. Idéal pour « planquer vite » en course.
 */

import { useEffect } from "react";
import { useAppStore } from "@/stores/app";
import { useOverlaysStore } from "@/stores/overlays";
import { isTauri } from "@/lib/api";

export function useOverlayShortcut() {
  const key = useAppStore((s) => s.overlayToggleKey);

  useEffect(() => {
    if (!isTauri() || !key) return;
    // Charge la config overlays pour connaître l'état courant au moment de l'appui.
    if (!useOverlaysStore.getState().loaded) void useOverlaysStore.getState().load();

    let disposed = false;
    (async () => {
      const gs = await import("@tauri-apps/plugin-global-shortcut");
      try {
        if (await gs.isRegistered(key)) await gs.unregister(key);
        await gs.register(key, (e) => {
          if (disposed || e.state !== "Pressed") return;
          const st = useOverlaysStore.getState();
          void st.setMasterEnabled(!st.cfg.masterEnabled);
        });
      } catch {
        /* accélérateur invalide ou déjà pris par une autre application */
      }
    })();

    return () => {
      disposed = true;
      void (async () => {
        try {
          const gs = await import("@tauri-apps/plugin-global-shortcut");
          await gs.unregister(key);
        } catch {
          /* déjà libéré / hors Tauri */
        }
      })();
    };
  }, [key]);
}
