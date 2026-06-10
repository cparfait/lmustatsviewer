/** Overlay Track Map : tracé du circuit (figé) + position des voitures. */

import { useEffect, useRef, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { Panel, PanelHeader } from "@/components/overlay/ui";
import { liveClassColor } from "@/components/overlay/format";
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
  path: string;
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

function buildPath(pts: [number, number][], bounds: Bounds): string {
  const project = makeProject(bounds);
  return (
    pts
      .map(([x, z], i) => {
        const [px, py] = project(x, z);
        return `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`;
      })
      .join(" ") + " Z"
  );
}

const cacheKey = (track: string) => `lmu_trackmap_${track}`;
function loadCache(track: string): Outline | null {
  if (!track) return null;
  try {
    const raw = localStorage.getItem(cacheKey(track));
    return raw ? (JSON.parse(raw) as Outline) : null;
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
  const pts = data.track_points as [number, number][];
  const trackKey = data.session?.track ?? "";

  // Tracé FIGÉ (bornes + path). On le construit pendant le 1er tour, puis on le
  // gèle et on le met en cache par circuit → carte statique, seules les voitures
  // bougent. Au rechargement d'un circuit connu, il est figé immédiatement.
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

    const bounds = computeBounds(pts);
    setOutline({ bounds, path: buildPath(pts, bounds) });

    // Gèle quand le tracé est assez complet ET stable (plus de nouveaux points).
    if (pts.length >= 80 && pts.length === stateRef.current.len) {
      stateRef.current.frozen = true;
      saveCache(trackKey, { bounds, path: buildPath(pts, bounds) });
    }
    stateRef.current.len = pts.length;
  }, [pts, trackKey]);

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
            <path
              d={outline.path}
              fill="none"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth={3}
              strokeLinejoin="round"
            />
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
