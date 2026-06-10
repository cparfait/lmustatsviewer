/**
 * Moteur de rendu de la fenêtre overlay.
 *
 * Charge la config, s'abonne aux events de synchro (`overlays-config`) et de mode
 * Édition (`overlay-edit-mode`), branche le flux live-data et rend chaque overlay
 * activé dans son cadre déplaçable.
 */

import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { useOverlaysStore, OVERLAYS_SRC, type OverlaysConfig } from "@/stores/overlays";
import { OVERLAY_DEFS } from "@/lib/overlays";
import { overlay as overlayApi, type LiveData } from "@/lib/api";
import { useOverlayData } from "./useOverlayData";
import { OverlayFrame } from "./OverlayFrame";
import { WIDGETS } from "./widgets";

/** Instantané vide : les widgets s'affichent (placeholders « — ») même hors jeu. */
const EMPTY_LIVE_DATA: LiveData = {
  connected: false,
  paused: false,
  telemetry: null,
  player: null,
  session: null,
  standings: [],
  weather: null,
  flags: null,
  extended: null,
  track_layout: null,
  track_points: [],
};

export function OverlayRoot() {
  const { t } = useTranslation();
  const cfg = useOverlaysStore((s) => s.cfg);
  const loaded = useOverlaysStore((s) => s.loaded);
  const load = useOverlaysStore((s) => s.load);
  const applyRemote = useOverlaysStore((s) => s.applyRemote);
  const [editMode, setEditMode] = useState(false);

  const data = useOverlayData(cfg.highFps);

  // Chargement initial + abonnements de synchro.
  useEffect(() => {
    load();
    const unlisteners: Array<() => void> = [];
    listen<{ src: string; cfg: OverlaysConfig }>("overlays-config", (e) => {
      if (e.payload.src !== OVERLAYS_SRC) applyRemote(e.payload.cfg);
    }).then((fn) => unlisteners.push(fn));
    listen<boolean>("overlay-edit-mode", (e) => setEditMode(e.payload)).then((fn) =>
      unlisteners.push(fn),
    );
    return () => unlisteners.forEach((fn) => fn());
  }, [load, applyRemote]);

  if (!loaded) return null;
  // Interrupteur global OFF → on ne rend rien (la fenêtre reste click-through).
  if (!cfg.masterEnabled) return null;

  const live = data ?? EMPTY_LIVE_DATA;

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Sortie de secours : en mode édition la fenêtre plein écran capture toute
          la souris (on ne peut plus cliquer la fenêtre principale) → ce bouton,
          rendu SUR l'overlay, garantit qu'on peut toujours quitter l'édition. */}
      {editMode && (
        <button
          type="button"
          onClick={() => {
            setEditMode(false);
            overlayApi.setEditMode(false).catch(() => {});
          }}
          style={{ pointerEvents: "auto" }}
          className="fixed left-1/2 top-3 z-[100000] -translate-x-1/2 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-black shadow-lg hover:bg-emerald-400"
        >
          <Check className="h-4 w-4" />
          {t("overlays.exitEdit")}
        </button>
      )}
      {OVERLAY_DEFS.map((def) => {
        const settings = cfg.overlays[def.id];
        if (!settings?.enabled) return null;
        const Widget = WIDGETS[def.id];
        return (
          <OverlayFrame
            key={def.id}
            id={def.id}
            settings={settings}
            editMode={editMode}
            globalOpacity={cfg.globalOpacity}
          >
            <Widget
              data={live}
              content={settings.content}
              accent={def.accent}
              t={t}
            />
          </OverlayFrame>
        );
      })}
    </div>
  );
}
