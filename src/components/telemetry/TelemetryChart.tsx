import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

/** Une courbe à tracer. `values` doit avoir la même longueur que `x`. */
export interface TelemetrySeries {
  label: string;
  values: (number | null)[];
  color: string;
  /** Identifiant d'échelle Y partagée (ex. "pct", "speed"). Défaut : label. */
  scale?: string;
  unit?: string;
  /** Trait pointillé (ex. tour de comparaison). */
  dash?: number[];
  width?: number;
}

interface TelemetryChartProps {
  /** Axe X partagé (temps en s ou distance en m). */
  x: number[];
  series: TelemetrySeries[];
  /** Libellé de l'axe X. */
  xLabel?: string;
  height?: number;
  /** Clé de synchronisation du curseur entre plusieurs graphes. */
  syncKey?: string;
  /** Verrouille une échelle Y à un intervalle fixe (ex. inputs 0–100 %). */
  yRange?: { scale: string; min: number; max: number };
  /** Index de la tête de lecture (mode lecteur) → curseur vertical piloté. */
  cursorIdx?: number;
  /** Plage de zoom X partagée [min, max] (unités de `x`) ; `null` = plein. */
  zoom?: [number, number] | null;
  /** Notifie un zoom utilisateur (glisser) ou un reset (double-clic → null). */
  onZoom?: (range: [number, number] | null) => void;
  /**
   * Survol souris → index de donnée le plus proche (`null` à la sortie).
   * Émis **uniquement** sur survol réel (pas sur curseur piloté/synchronisé)
   * → permet de lier le curseur des graphes à la carte du circuit.
   */
  onHoverIdx?: (idx: number | null) => void;
  theme: "dark" | "light";
}

/**
 * Wrapper React minimal autour d'uPlot (canvas, performant sur 10k+ points).
 * Recharts (SVG) ne tient pas la charge de la télémétrie haute fréquence.
 */
export function TelemetryChart({
  x,
  series,
  xLabel,
  height = 200,
  syncKey,
  yRange,
  cursorIdx,
  zoom,
  onZoom,
  onHoverIdx,
  theme,
}: TelemetryChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  // `onZoom` lu via ref → pas besoin de reconstruire le graphe quand il change.
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;
  const onHoverIdxRef = useRef(onHoverIdx);
  onHoverIdxRef.current = onHoverIdx;
  // Garde anti-boucle : true pendant qu'on applique un zoom programmatique.
  const applyingZoomRef = useRef(false);
  // Curseur piloté (lecture/sync) → true pour ne PAS le confondre avec un survol.
  const settingCursorRef = useRef(false);
  // Souris réellement au-dessus de CE graphe (≠ curseur synchronisé).
  const pointerInsideRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const axisColor = theme === "dark" ? "#9ca3af" : "#4b5563";
    const gridColor =
      theme === "dark" ? "rgba(148,163,184,0.12)" : "rgba(71,85,105,0.12)";

    const data: uPlot.AlignedData = [
      x,
      ...series.map((s) => s.values as (number | null)[]),
    ];

    // Échelles Y : une par `scale` distinct. Avec verrou optionnel.
    const scaleKeys = new Set<string>();
    series.forEach((s) => scaleKeys.add(s.scale ?? s.label));

    const scales: uPlot.Scales = { x: { time: false } };
    scaleKeys.forEach((k) => {
      scales[k] =
        yRange && yRange.scale === k
          ? { range: [yRange.min, yRange.max] }
          : {};
    });

    const axes: uPlot.Axis[] = [
      {
        stroke: axisColor,
        grid: { stroke: gridColor, width: 1 },
        ticks: { stroke: gridColor, width: 1 },
        label: xLabel,
        labelSize: xLabel ? 24 : 0,
        font: "11px ui-sans-serif, system-ui, sans-serif",
        labelFont: "11px ui-sans-serif, system-ui, sans-serif",
      },
    ];
    // Un seul axe Y visible (le premier scale) — les autres restent implicites.
    const firstScale = [...scaleKeys][0];
    axes.push({
      scale: firstScale,
      stroke: axisColor,
      grid: { stroke: gridColor, width: 1 },
      ticks: { stroke: gridColor, width: 1 },
      font: "11px ui-sans-serif, system-ui, sans-serif",
      size: 48,
    });

    const opts: uPlot.Options = {
      width: el.clientWidth || 600,
      height,
      scales,
      axes,
      legend: { show: true, live: true },
      cursor: {
        sync: syncKey ? { key: syncKey } : undefined,
        focus: { prox: 30 },
        points: { size: 5 },
        // Glisser horizontalement pour zoomer ; double-clic = reset (défaut uPlot).
        drag: { x: true, y: false },
      },
      hooks: {
        setScale: [
          (u: uPlot) => {
            if (applyingZoomRef.current || !onZoomRef.current) return;
            const sx = u.scales.x;
            if (sx.min == null || sx.max == null || x.length < 2) return;
            const span = x[x.length - 1] - x[0] || 1;
            const eps = span * 0.005;
            const full = sx.min <= x[0] + eps && sx.max >= x[x.length - 1] - eps;
            onZoomRef.current(full ? null : [sx.min, sx.max]);
          },
        ],
        setCursor: [
          (u: uPlot) => {
            // Survol réel uniquement (pas curseur piloté/synchronisé).
            if (
              !pointerInsideRef.current ||
              settingCursorRef.current ||
              !onHoverIdxRef.current
            )
              return;
            const idx = u.cursor.idx;
            onHoverIdxRef.current(idx == null ? null : idx);
          },
        ],
      },
      series: [
        { label: xLabel ?? "x" },
        ...series.map((s) => ({
          label: s.label,
          stroke: s.color,
          width: s.width ?? 1.5,
          scale: s.scale ?? s.label,
          dash: s.dash,
          points: { show: false },
          value: (_u: uPlot, v: number | null) =>
            v == null ? "—" : `${v.toFixed(1)}${s.unit ? " " + s.unit : ""}`,
        })),
      ],
    };

    const plot = new uPlot(opts, data, el);
    plotRef.current = plot;

    // Survol réel : ne marquer le pointeur que sur CE graphe.
    const over = plot.over;
    const onEnter = () => {
      pointerInsideRef.current = true;
    };
    const onLeave = () => {
      pointerInsideRef.current = false;
      onHoverIdxRef.current?.(null);
    };
    over.addEventListener("mouseenter", onEnter);
    over.addEventListener("mouseleave", onLeave);

    const ro = new ResizeObserver(() => {
      plot.setSize({ width: el.clientWidth || 600, height });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      over.removeEventListener("mouseenter", onEnter);
      over.removeEventListener("mouseleave", onLeave);
      plot.destroy();
      plotRef.current = null;
    };
    // Recréation complète quand la donnée/config change : sûr et suffisant ici
    // (les fichiers/tours ne changent pas à 60 fps).
  }, [x, series, xLabel, height, syncKey, yRange, theme]);

  // Curseur piloté par la tête de lecture (effet séparé → ne reconstruit PAS le
  // graphe ; juste un déplacement de curseur, peu coûteux à 60 fps).
  useEffect(() => {
    const u = plotRef.current;
    if (!u || cursorIdx == null || cursorIdx < 0 || x.length === 0) return;
    const i = Math.min(x.length - 1, Math.max(0, Math.round(cursorIdx)));
    const left = u.valToPos(x[i], "x");
    const top = (u.over?.offsetHeight ?? 0) / 2;
    // Marque le déplacement comme programmatique → n'émet pas de survol.
    settingCursorRef.current = true;
    u.setCursor({ left, top });
    settingCursorRef.current = false;
  }, [cursorIdx, x]);

  // Applique la plage de zoom partagée (effet séparé → pas de reconstruction).
  useEffect(() => {
    const u = plotRef.current;
    if (!u || x.length < 2) return;
    applyingZoomRef.current = true;
    if (zoom) u.setScale("x", { min: zoom[0], max: zoom[1] });
    else u.setScale("x", { min: x[0], max: x[x.length - 1] });
    applyingZoomRef.current = false;
  }, [zoom, x]);

  return <div ref={containerRef} className="w-full" />;
}
