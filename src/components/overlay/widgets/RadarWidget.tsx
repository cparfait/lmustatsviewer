/** Overlay Radar : radar de proximité (anti-collision) autour de la voiture. */

import { useEffect, useRef } from "react";
import { Radar } from "lucide-react";
import { Panel, PanelHeader } from "@/components/overlay/ui";
import { liveClassColor } from "@/components/overlay/format";
import type { WidgetProps } from "./types";

const SIZE = 200; // côté du radar (px)
const RANGE_M = 70; // portée du centre au bord (mètres)
const DANGER_LAT = 2.4; // m : largeur latérale « côte à côte »
const DANGER_LONG = 5.5; // m : recouvrement longitudinal d'une voiture

export function RadarWidget({ data, content, accent, t }: WidgetProps) {
  const me = data.standings.find((s) => s.is_player);
  const meX = me?.pos_x ?? null;
  const meZ = me?.pos_z ?? null;

  // Cap (heading) estimé : la mémoire partagée n'expose pas l'orientation, on
  // la déduit du vecteur déplacement du joueur entre deux trames (lissé en EMA).
  // Tant qu'on roule, « devant » pointe vers le haut du radar.
  const headRef = useRef({ x: 0, z: 0, fx: 0, fz: 1, init: false });
  useEffect(() => {
    if (meX == null || meZ == null) return;
    const h = headRef.current;
    if (h.init) {
      const dx = meX - h.x;
      const dz = meZ - h.z;
      const mv = Math.hypot(dx, dz);
      if (mv > 0.3) {
        const a = 0.3;
        h.fx = h.fx * (1 - a) + (dx / mv) * a;
        h.fz = h.fz * (1 - a) + (dz / mv) * a;
      }
    }
    h.x = meX;
    h.z = meZ;
    h.init = true;
  }, [meX, meZ]);

  const c = SIZE / 2;
  const scale = (SIZE / 2) / RANGE_M;

  // Repère écran « nord-haut » : screen0 = (x, −z), avant du joueur F0 = (fx, −fz).
  const f0x = headRef.current.fx;
  const f0y = -headRef.current.fz;
  const fl = Math.hypot(f0x, f0y) || 1;
  const fux = f0x / fl;
  const fuy = f0y / fl;
  // Droite-écran = avant tourné 90° horaire (y vers le bas) : R0 = (−Fy, Fx).
  const rux = -fuy;
  const ruy = fux;

  type Blip = { x: number; y: number; color: string; danger: boolean };
  const blips: Blip[] = [];
  let dangerLeft = false;
  let dangerRight = false;

  if (meX != null && meZ != null) {
    for (const s of data.standings) {
      if (s.is_player) continue;
      const tx = s.pos_x - meX;
      const ty = -(s.pos_z - meZ);
      const along = tx * fux + ty * fuy; // m devant (+) / derrière (−)
      const right = tx * rux + ty * ruy; // m à droite (+) / gauche (−)
      if (Math.hypot(along, right) > RANGE_M) continue;
      const danger =
        Math.abs(right) < DANGER_LAT && Math.abs(along) < DANGER_LONG;
      if (danger) {
        if (right >= 0) dangerRight = true;
        else dangerLeft = true;
      }
      blips.push({
        x: c + right * scale,
        y: c - along * scale,
        color:
          content.classColors !== false
            ? liveClassColor(s.vehicle_class) ?? "#e5e7eb"
            : "#e5e7eb",
        danger,
      });
    }
  }

  const warn = content.warning !== false;

  return (
    <Panel accent={accent} style={{ width: SIZE + 8 }}>
      <PanelHeader accent={accent} icon={Radar} title={t("overlays.items.radar.title")} />
      <div className="p-1">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="aspect-square w-full">
          <circle cx={c} cy={c} r={SIZE / 2 - 2} fill="rgba(255,255,255,0.03)" stroke={`${accent}40`} strokeWidth={1} />
          <circle cx={c} cy={c} r={SIZE / 4} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
          <line x1={c} y1={6} x2={c} y2={SIZE - 6} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          <line x1={6} y1={c} x2={SIZE - 6} y2={c} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />

          {warn && dangerLeft && (
            <rect x={2} y={c - 26} width={5} height={52} rx={2} fill="#ef4444" />
          )}
          {warn && dangerRight && (
            <rect x={SIZE - 7} y={c - 26} width={5} height={52} rx={2} fill="#ef4444" />
          )}

          {/* Joueur : triangle pointant vers le haut. */}
          <polygon
            points={`${c},${c - 9} ${c - 6},${c + 7} ${c + 6},${c + 7}`}
            fill={accent}
            stroke="#000"
            strokeWidth={0.5}
          />

          {blips.map((b, i) => (
            <rect
              key={i}
              x={b.x - 3.5}
              y={b.y - 5}
              width={7}
              height={10}
              rx={2}
              fill={b.danger ? "#ef4444" : b.color}
              stroke="rgba(0,0,0,0.6)"
              strokeWidth={0.5}
            />
          ))}
        </svg>
      </div>
    </Panel>
  );
}
