/** Overlay G-Force : cercle de friction (accélérations long./lat.) + pic + commandes. */

import { useEffect, useRef } from "react";
import { Orbit } from "lucide-react";
import { Panel, PanelHeader, Stat, VBar } from "@/components/overlay/ui";
import type { WidgetProps } from "./types";

const SIZE = 160;
const PAD = 12;
const R = SIZE / 2 - PAD;
const G_MAX = 3; // ±3 g pleine échelle

export function GForceWidget({ data, content, accent, t }: WidgetProps) {
  const tel = data.telemetry;
  const gLat = tel?.g_lat ?? 0;
  const gLon = tel?.g_long ?? 0;
  const mag = Math.hypot(gLat, gLon);

  // Pic de g sur le tour courant (réinitialisé au passage de tour, comme Speed).
  const peakRef = useRef(0);
  const lapRef = useRef(0);
  useEffect(() => {
    if (!data.player) return;
    if (data.player.total_laps !== lapRef.current) {
      lapRef.current = data.player.total_laps;
      peakRef.current = 0;
    }
    if (mag > peakRef.current) peakRef.current = mag;
  }, [data.player, mag]);

  const c = SIZE / 2;
  const clampG = (g: number) => Math.max(-G_MAX, Math.min(G_MAX, g));
  const dotX = c + (clampG(gLat) / G_MAX) * R;
  const dotY = c - (clampG(gLon) / G_MAX) * R; // accélération (+) vers le haut
  const peakR = (Math.min(peakRef.current, G_MAX) / G_MAX) * R;

  return (
    <Panel accent={accent} style={{ width: SIZE + 16 }}>
      <PanelHeader accent={accent} icon={Orbit} title={t("overlays.items.gforce.title")} />
      <div className="p-2">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="aspect-square w-full">
          <circle cx={c} cy={c} r={R} fill="rgba(255,255,255,0.03)" stroke={`${accent}55`} strokeWidth={1} />
          <circle cx={c} cy={c} r={R * (2 / 3)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
          <circle cx={c} cy={c} r={R / 3} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
          <line x1={c} y1={c - R} x2={c} y2={c + R} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
          <line x1={c - R} y1={c} x2={c + R} y2={c} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />

          {content.peak !== false && peakR > 1 && (
            <circle cx={c} cy={c} r={peakR} fill="none" stroke="#fbbf24" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
          )}

          <line x1={c} y1={c} x2={dotX} y2={dotY} stroke={accent} strokeWidth={1.5} opacity={0.5} />
          <circle cx={dotX} cy={dotY} r={5} fill={accent} stroke="#000" strokeWidth={0.5} />
        </svg>

        {content.values !== false && (
          <div className="mt-2 grid grid-cols-3 gap-x-2">
            <Stat label="LAT" value={`${Math.abs(gLat).toFixed(1)}`} unit="g" />
            <Stat label="LON" value={`${Math.abs(gLon).toFixed(1)}`} unit="g" />
            <Stat label={t("overlays.elements.peak")} value={`${peakRef.current.toFixed(1)}`} unit="g" color="#fbbf24" />
          </div>
        )}

        {content.inputs !== false && (
          <div className="mt-2 flex items-end gap-1.5">
            <VBar value={tel?.throttle ?? 0} color="#22c55e" className="h-8" />
            <VBar value={tel?.brake ?? 0} color="#ef4444" className="h-8" />
            <div className="relative ml-1 h-2 flex-1 self-center overflow-hidden rounded bg-white/10">
              <div
                className="absolute top-0 h-full w-1.5 rounded bg-white"
                style={{
                  left: `calc(${50 + Math.max(-1, Math.min(1, tel?.steering ?? 0)) * 50}% - 3px)`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
