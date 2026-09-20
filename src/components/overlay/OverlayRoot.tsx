/**
 * Moteur de rendu de la fenêtre overlay.
 *
 * Charge la config, s'abonne aux events de synchro (`overlays-config`) et de mode
 * Édition (`overlay-edit-mode`), branche le flux live-data et rend chaque overlay
 * activé dans son cadre déplaçable.
 */

import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { useOverlaysStore, OVERLAYS_SRC, type OverlaysConfig } from "@/stores/overlays";
import { OVERLAY_DEFS } from "@/lib/overlays";
import { overlay as overlayApi, type LiveData } from "@/lib/api";
import { useOverlayData } from "./useOverlayData";
import { OverlayFrame } from "./OverlayFrame";
import { WIDGETS } from "./widgets";
import { ErrorBoundary } from "@/components/ErrorBoundary";

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
  track_dists: [],
};

export function OverlayRoot() {
  const { t } = useTranslation();
  const cfg = useOverlaysStore((s) => s.cfg);
  const loaded = useOverlaysStore((s) => s.loaded);
  const load = useOverlaysStore((s) => s.load);
  const applyRemote = useOverlaysStore((s) => s.applyRemote);
  const [editMode, setEditMode] = useState(false);
  // La fenêtre couvre tous les écrans ; son origine est le coin haut-gauche du
  // bureau virtuel, pas celui de l'écran principal. Les positions des widgets
  // restant relatives à l'écran principal, on décale tout le calque d'autant.
  const [origin, setOrigin] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    screens: { x: number; y: number; w: number; h: number }[];
  }>({ x: 0, y: 0, w: 0, h: 0, screens: [] });

  const data = useOverlayData(cfg.highFps);

  // Chargement initial + abonnements de synchro.
  useEffect(() => {
    load();
    // Rattrapage : si le mode Édition a été activé AVANT que ce webview ne soit
    // abonné (cas du 1er overlay activé : open() puis setEditMode(true) pendant
    // le boot de la fenêtre), l'event est perdu → on relit l'état au backend.
    overlayApi.getEditMode().then(setEditMode).catch(() => {});
    // Échec (ancien backend, moniteurs non énumérables) → (0,0), soit exactement
    // l'ancien comportement « tout sur l'écran principal ».
    overlayApi.getOrigin().then(setOrigin).catch(() => {});
    const unlisteners: Array<() => void> = [];
    listen<{ src: string; cfg: OverlaysConfig }>("overlays-config", (e) => {
      if (e.payload.src !== OVERLAYS_SRC) applyRemote(e.payload.cfg);
    }).then((fn) => unlisteners.push(fn));
    listen<boolean>("overlay-edit-mode", (e) => setEditMode(e.payload)).then((fn) =>
      unlisteners.push(fn),
    );
    return () => unlisteners.forEach((fn) => fn());
  }, [load, applyRemote]);

  // Échap sort du mode Édition, quoi qu'il arrive. Filet de sécurité : en
  // édition la fenêtre capture toute la souris sur tous les écrans — si le
  // bouton « Terminer » se retrouve hors champ (disposition changée juste
  // après), la souris ne permettrait plus d'en sortir.
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setEditMode(false);
      overlayApi.setEditMode(false).catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode]);

  // Surveillance de la disposition des écrans. Rien dans Tauri ne prévient
  // qu'un écran a été déplacé, débranché ou rallumé : on compare donc la liste
  // périodiquement. Au moindre changement, la fenêtre est recalée sur le
  // nouveau bureau virtuel et le sauvetage des widgets hors écran rejoué.
  useEffect(() => {
    let prev = "";
    let stop = false;
    const tick = async () => {
      try {
        // Signature basée sur la géométrie ABSOLUE des écrans (repère de
        // l'écran principal) : elle ne bouge pas quand on redimensionne la
        // fenêtre, sinon le recalage se déclencherait en boucle.
        const sig = JSON.stringify(await overlayApi.getScreens());
        if (stop || sig === prev) return;
        const first = prev === "";
        prev = sig;
        if (first) return; // premier passage : on ne fait qu'enregistrer l'état
        await overlayApi.refreshBounds();
        const next = await overlayApi.getOrigin();
        if (stop) return;
        rescuedRef.current = false;
        setOrigin(next);
      } catch {
        /* fenêtre en cours de fermeture, backend occupé : on retentera */
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 4000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  // Rattrapage : un widget dont la position ne tombe sur AUCUN écran actif est
  // invisible — écran débranché, éteint, ou disposition réarrangée dans Windows.
  // Il n'est alors plus récupérable à la souris puisqu'on ne peut pas l'attraper.
  // On le ramène donc à sa position par défaut, sur l'écran principal. Ne touche
  // que les widgets déjà invisibles : aucune disposition visible n'est modifiée.
  const rescuedRef = useRef(false);
  useEffect(() => {
    if (!loaded || rescuedRef.current || origin.screens.length === 0) return;
    rescuedRef.current = true;
    const { cfg: c, updateSettings, flush } = useOverlaysStore.getState();
    let moved = false;
    for (const def of OVERLAY_DEFS) {
      const s = c.overlays[def.id];
      if (!s?.enabled) continue;
      // Position du widget dans le repère de la fenêtre (les coordonnées
      // enregistrées sont relatives à l'écran principal).
      const px = s.x + origin.x;
      const py = s.y + origin.y;
      const visible = origin.screens.some(
        (sc) => px >= sc.x && px < sc.x + sc.w && py >= sc.y && py < sc.y + sc.h,
      );
      if (visible) continue;
      updateSettings(def.id, { x: def.defaultX, y: def.defaultY });
      moved = true;
    }
    if (moved) flush().catch(() => {});
  }, [loaded, origin]);

  if (!loaded) return null;
  // Interrupteur global OFF → on ne rend rien (la fenêtre reste click-through).
  if (!cfg.masterEnabled) return null;

  const live = data ?? EMPTY_LIVE_DATA;

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Mode édition : voile sombre légèrement flouté sur tout l'écran pour
          faire ressortir les overlays au premier plan + explication centrale.
          `pointer-events: none` → ne gêne ni le drag ni le bouton Valider. */}
      {editMode && (
        <>
          {/* Un voile PAR ÉCRAN, et non un seul plein cadre : au-delà d'environ
              8192 px de large, le compositeur ne peint plus la surface en entier
              (bureau de 10240 px → le voile s'arrêtait au premier écran). Repli
              plein cadre si la liste des écrans n'est pas disponible. */}
          {origin.screens.length > 0 ? (
            origin.screens.map((s, i) => (
              <div
                key={i}
                className="pointer-events-none fixed bg-black/45"
                style={{ left: s.x, top: s.y, width: s.w, height: s.h }}
              />
            ))
          ) : (
            <div className="pointer-events-none fixed inset-0 bg-black/45" />
          )}
          {/* Bloc central : explication + bouton Terminer en dessous.
              La fenêtre plein écran capture toute la souris → le bouton,
              rendu ici sur l'overlay, garantit qu'on peut quitter l'édition. */}
          {/* Centré sur l'ÉCRAN PRINCIPAL, pas sur la fenêtre : celle-ci couvre
              tous les écrans, son milieu tomberait donc entre deux moniteurs.
              Repli sur le centre de la fenêtre si l'écran n'est pas mesurable. */}
          <div
            style={{
              left: origin.w > 0 ? origin.x + origin.w / 2 : "50%",
              top: origin.h > 0 ? origin.y + origin.h / 2 : "50%",
            }}
            className="fixed z-[99999] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-4 rounded-xl border border-white/15 bg-black/70 px-8 py-6 text-center shadow-2xl backdrop-blur"
          >
            <span className="pointer-events-none text-sm font-bold uppercase tracking-[0.25em] text-emerald-400">
              {t("overlays.editHintTitle")}
            </span>
            <span className="pointer-events-none max-w-md text-sm leading-relaxed text-white/85">
              {t("overlays.editHintText")}
            </span>
            <button
              type="button"
              onClick={() => {
                setEditMode(false);
                overlayApi.setEditMode(false).catch(() => {});
              }}
              className="mt-1 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-black shadow-lg hover:bg-emerald-400"
            >
              <Check className="h-4 w-4" />
              {t("overlays.exitEdit")}
            </button>
          </div>
        </>
      )}
      {/* Calque des widgets, ancré sur l'écran principal : leurs coordonnées
          (0,0 = coin haut-gauche de l'écran principal) restent inchangées, et un
          widget glissé sur un écran à gauche prend simplement un x négatif. */}
      <div className="absolute" style={{ left: origin.x, top: origin.y }}>
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
            {/* Isolation par widget : un widget qui plante disparaît (repli
                `null`) sans emporter les autres overlays ni geler la fenêtre. */}
            <ErrorBoundary fallback={null}>
              <Widget
                data={live}
                content={settings.content}
                accent={settings.accent ?? def.accent}
                t={t}
              />
            </ErrorBoundary>
          </OverlayFrame>
        );
      })}
      </div>
    </div>
  );
}
