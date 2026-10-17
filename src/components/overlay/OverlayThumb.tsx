/**
 * Vignette d'un overlay (cartes de la page Overlays) : le vrai widget, réduit pour tenir
 * dans la carte, animé sur des données d'exemple et rendu avec l'apparence choisie.
 * Une seule horloge partagée par toutes les vignettes (≈ 8 images / s), arrêtée dès
 * qu'aucune vignette n'est affichée.
 */

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useOverlaysStore } from "@/stores/overlays";
import { OVERLAY_BY_ID, type OverlayId } from "@/lib/overlays";
import type { LiveData } from "@/lib/api";
import { WIDGETS } from "./widgets";
import { lookClasses, OverlayLookContext } from "./look";
import { sampleLiveData } from "./sampleData";

const TICK_MS = 125;
/** Pas de `sampleLiveData` par image (il est calibré pour 50 ms). */
const STEP = TICK_MS / 50;

let tick = 0;
let data: LiveData = sampleLiveData(0);
let timer: ReturnType<typeof setInterval> | null = null;
const subs = new Set<() => void>();

function subscribe(cb: () => void) {
  subs.add(cb);
  if (!timer) {
    timer = setInterval(() => {
      tick += STEP;
      data = sampleLiveData(tick);
      subs.forEach((f) => f());
    }, TICK_MS);
  }
  return () => {
    subs.delete(cb);
    if (subs.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const useSampleData = () => useSyncExternalStore(subscribe, () => data);

export function OverlayThumb({
  id,
  content,
  accent,
  height = 140,
}: {
  id: OverlayId;
  content: Record<string, boolean>;
  accent?: string;
  /** Hauteur de la vignette (px) ; la largeur suit la carte. */
  height?: number;
}) {
  const { t } = useTranslation();
  const look = useOverlaysStore((s) => s.cfg.look);
  const live = useSampleData();
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ k: 0.6, w: 0, h: 0 });

  // Échelle : le widget entier tient dans la vignette (jamais agrandi).
  useLayoutEffect(() => {
    const b = box.current;
    const el = inner.current;
    if (!b || !el) return;
    const measure = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!w || !h) return;
      const k = Math.min(1, (b.clientWidth - 16) / w, (height - 16) / h);
      setFit((f) => (Math.abs(f.k - k) < 0.005 && f.w === w && f.h === h ? f : { k, w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(b);
    return () => ro.disconnect();
  }, [height]);

  const Widget = WIDGETS[id];
  const def = OVERLAY_BY_ID[id];
  return (
    <div
      ref={box}
      aria-hidden
      className="pointer-events-none relative overflow-hidden rounded-lg"
      style={{ height, background: "linear-gradient(135deg, #2a3140, #151a22)" }}
    >
      <OverlayLookContext.Provider value={look}>
        <div
          ref={inner}
          className={`absolute left-1/2 top-1/2 inline-block ${lookClasses(look)}`}
          style={{
            width: "max-content",
            transform: `translate(-50%, -50%) scale(${fit.k})`,
            // Dimensions de mise en page conservées : la mesure reste celle du widget.
            transformOrigin: "center",
          }}
        >
          <ErrorBoundary fallback={null}>
            <Widget data={live} content={content} accent={accent ?? def.accent} t={t} />
          </ErrorBoundary>
        </div>
      </OverlayLookContext.Provider>
    </div>
  );
}
