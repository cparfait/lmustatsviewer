/** Overlay Track Map : tracé du circuit (figé) + voie des stands + voitures. */

import { useEffect, useRef, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { Panel, PanelHeader } from "@/components/overlay/ui";
import { liveClassColor } from "@/components/overlay/format";
import { config, isTauri } from "@/lib/api";
import { fitTransform, mapComplete, pathOfRuns, trackPaths, type Pt } from "@/lib/trackMapGeom";
import type { WidgetProps } from "./types";

const SIZE = 300;

/** Tracé figé, en coordonnées du monde : la projection est recalculée à l'affichage. */
interface Outline {
  pts: Pt[];
  dists: number[];
  lapLen: number;
  /** Voie des stands (fournie par le jeu), vide sinon. */
  pit: Pt[];
}

// v3 : tracé en coordonnées du monde (orientation commune appliquée à
// l'affichage). Les caches v2 (chemins déjà projetés, sans rotation) sont ignorés.
const cacheKey = (track: string) => `lmu_trackmap_v3_${track}`;
function loadCache(track: string): Outline | null {
  if (!track) return null;
  try {
    const raw = localStorage.getItem(cacheKey(track));
    const o = raw ? (JSON.parse(raw) as Outline) : null;
    return o && Array.isArray(o.pts) && Array.isArray(o.dists) ? o : null;
  } catch {
    return null;
  }
}
function saveCache(track: string, o: Outline) {
  if (!track) return;
  try {
    localStorage.setItem(cacheKey(track), JSON.stringify(o));
  } catch {
    /* quota / indisponible : ignore */
  }
}

export function TrackMapWidget({ data, content, accent, t }: WidgetProps) {
  const pts = data.track_points as Pt[];
  const dists = data.track_dists;
  const lapLen = data.session?.track_length ?? 0;
  const pit = data.pit_lane_points as Pt[] | undefined;
  const trackKey = data.session?.track ?? "";

  // Orientation commune (Configuration › options Live) ; la fenêtre overlay a
  // son propre contexte : relue dans la configuration.
  const [northUp, setNorthUp] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    void config.get("map_north_up").then((v) => setNorthUp(v === "true")).catch(() => {});
  }, []);

  // Tracé FIGÉ. On le construit pendant le 1er tour, puis on le gèle et on le
  // met en cache par circuit → carte statique, seules les voitures bougent. Gel
  // seulement quand le tour est COMPLET (≥ 95 % de la longueur, sans trou).
  // Au rechargement d'un circuit connu, il est figé immédiatement.
  const [outline, setOutline] = useState<Outline | null>(null);
  const stateRef = useRef<{ track: string; len: number; frozen: boolean }>({
    track: "",
    len: 0,
    frozen: false,
  });

  useEffect(() => {
    const st = stateRef.current;

    // Changement de circuit → reset + tentative de cache.
    if (trackKey !== st.track) {
      const cached = loadCache(trackKey);
      stateRef.current = { track: trackKey, len: 0, frozen: !!cached };
      setOutline(cached);
      if (cached) return;
    }
    if (stateRef.current.frozen || pts.length < 2) return;

    const o: Outline = { pts, dists, lapLen, pit: pit ?? [] };
    setOutline(o);

    // Gèle quand le tour est complet ET stable (plus de nouveaux points).
    const complete = lapLen > 0 ? mapComplete(dists, lapLen) : pts.length >= 80;
    if (complete && pts.length === stateRef.current.len) {
      stateRef.current.frozen = true;
      saveCache(trackKey, o);
    }
    stateRef.current.len = pts.length;
  }, [pts, dists, lapLen, pit, trackKey]);

  const view = outline
    ? fitTransform(outline.pts, [...outline.pts, ...outline.pit], {
        mode: northUp ? "north" : "auto",
        width: SIZE,
        height: SIZE,
        pad: 0.05,
      })
    : null;
  const clamp = (v: number) => Math.max(3, Math.min(SIZE - 3, v));
  const paths = outline && view ? trackPaths(outline.pts, outline.dists, outline.lapLen, view.project) : [];
  const pitPath = outline && view && outline.pit.length >= 2 ? pathOfRuns(outline.pit, view.project) : null;

  return (
    <Panel accent={accent} style={{ width: 332 }}>
      <PanelHeader accent={accent} icon={MapIcon} title={t("overlays.items.trackmap.title")} />
      <div className="p-2">
        {outline && view ? (
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            preserveAspectRatio="xMidYMid meet"
            className="aspect-square w-full"
            style={{ overflow: "hidden" }}
          >
            {pitPath && (
              <path
                d={pitPath}
                fill="none"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={2}
                strokeDasharray="4 3"
                strokeLinejoin="round"
              />
            )}
            {paths.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="rgba(255,255,255,0.35)"
                strokeWidth={3}
                strokeLinejoin="round"
              />
            ))}
            {data.standings.map((s) => {
              const [cx, cy] = view.project([s.pos_x, s.pos_z]);
              const color =
                content.classColors !== false
                  ? liveClassColor(s.vehicle_class) ?? "#fff"
                  : "#fff";
              const isPlayer = s.is_player && content.playerHighlight !== false;
              return (
                <circle
                  key={s.id || s.position}
                  cx={clamp(cx)}
                  cy={clamp(cy)}
                  r={isPlayer ? 5 : 3.5}
                  fill={isPlayer ? accent : color}
                  stroke={isPlayer ? "#fff" : "rgba(0,0,0,0.5)"}
                  strokeWidth={isPlayer ? 1.5 : 0.5}
                />
              );
            })}
          </svg>
        ) : (
          <div className="grid h-[200px] place-items-center text-[11px] text-white/40">
            {t("overlays.trackmap.building")}
          </div>
        )}
      </div>
    </Panel>
  );
}
