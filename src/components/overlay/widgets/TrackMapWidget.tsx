/** Overlay Track Map : tracé du circuit (figé) + voie des stands + voitures. */

import { useEffect, useRef, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { Panel, PanelHeader } from "@/components/overlay/ui";
import { liveClassColor } from "@/components/overlay/format";
import { mapComplete, pathOfRuns, trackPaths, type Pt } from "@/lib/trackMapGeom";
import type { WidgetProps } from "./types";

const SIZE = 300;
const PAD = 16;

interface Bounds {
  min_x: number;
  max_x: number;
  min_z: number;
  max_z: number;
}
interface Outline {
  bounds: Bounds;
  /** Tronçons du tracé (un seul, fermé, quand le tour est complet). */
  paths: string[];
  /** Voie des stands (fournie par le jeu), absente sinon. */
  pit?: string;
}

/** Projette (x,z) monde → (px,py) écran selon des bornes. */
function makeProject(bounds: Bounds) {
  const w = bounds.max_x - bounds.min_x || 1;
  const h = bounds.max_z - bounds.min_z || 1;
  const scale = (SIZE - 2 * PAD) / Math.max(w, h);
  const ox = PAD + (SIZE - 2 * PAD - w * scale) / 2;
  const oz = PAD + (SIZE - 2 * PAD - h * scale) / 2;
  return (x: number, z: number): [number, number] => [
    ox + (x - bounds.min_x) * scale,
    oz + (bounds.max_z - z) * scale, // flip Z (haut de l'écran = +z)
  ];
}

function computeBounds(pts: [number, number][]): Bounds {
  let min_x = Infinity,
    max_x = -Infinity,
    min_z = Infinity,
    max_z = -Infinity;
  for (const [x, z] of pts) {
    min_x = Math.min(min_x, x);
    max_x = Math.max(max_x, x);
    min_z = Math.min(min_z, z);
    max_z = Math.max(max_z, z);
  }
  return { min_x, max_x, min_z, max_z };
}

function buildOutline(pts: Pt[], dists: number[], lapLen: number, pit: Pt[]): Outline {
  const bounds = computeBounds([...pts, ...pit]);
  const project = makeProject(bounds);
  const proj = (p: Pt): Pt => project(p[0], p[1]);
  return {
    bounds,
    paths: trackPaths(pts, dists, lapLen, proj),
    pit: pit.length >= 2 ? pathOfRuns(pit, proj) : undefined,
  };
}

// v2 : tronçons + voie des stands. L'ancien cache (`lmu_trackmap_*`) pouvait
// contenir un tracé partiel figé à tort : il est ignoré.
const cacheKey = (track: string) => `lmu_trackmap_v2_${track}`;
function loadCache(track: string): Outline | null {
  if (!track) return null;
  try {
    const raw = localStorage.getItem(cacheKey(track));
    const o = raw ? (JSON.parse(raw) as Outline) : null;
    return o && Array.isArray(o.paths) ? o : null;
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

  // Tracé FIGÉ (bornes + tronçons). On le construit pendant le 1er tour, puis on
  // le gèle et on le met en cache par circuit → carte statique, seules les
  // voitures bougent. Gel seulement quand le tour est COMPLET (≥ 95 % de la
  // longueur, sans trou) : avant, deux trames de même longueur suffisaient et un
  // tracé partiel pouvait rester figé pour de bon. Au rechargement d'un circuit
  // connu, il est figé immédiatement.
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

    const o = buildOutline(pts, dists, lapLen, pit ?? []);
    setOutline(o);

    // Gèle quand le tour est complet ET stable (plus de nouveaux points). La
    // voie des stands, si le jeu la fournit, doit être arrivée aussi.
    const complete = lapLen > 0 ? mapComplete(dists, lapLen) : pts.length >= 80;
    if (complete && pts.length === stateRef.current.len) {
      stateRef.current.frozen = true;
      saveCache(trackKey, o);
    }
    stateRef.current.len = pts.length;
  }, [pts, dists, lapLen, pit, trackKey]);

  const project = outline ? makeProject(outline.bounds) : null;
  const clamp = (v: number) => Math.max(3, Math.min(SIZE - 3, v));

  return (
    <Panel accent={accent} style={{ width: 332 }}>
      <PanelHeader accent={accent} icon={MapIcon} title={t("overlays.items.trackmap.title")} />
      <div className="p-2">
        {outline && project ? (
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            preserveAspectRatio="xMidYMid meet"
            className="aspect-square w-full"
            style={{ overflow: "hidden" }}
          >
            {outline.pit && (
              <path
                d={outline.pit}
                fill="none"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={2}
                strokeDasharray="4 3"
                strokeLinejoin="round"
              />
            )}
            {outline.paths.map((d, i) => (
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
              const [cx, cy] = project(s.pos_x, s.pos_z);
              const color =
                content.classColors !== false
                  ? liveClassColor(s.vehicle_class) ?? "#fff"
                  : "#fff";
              const isPlayer = s.is_player && content.playerHighlight !== false;
              return (
                <circle
                  key={s.position}
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
