/** Overlay Lift & Coast : barre LED accél/coast/frein + indicateurs TC/ABS. */

import { Activity } from "lucide-react";
import { Panel, PanelHeader } from "@/components/overlay/ui";
import type { WidgetProps } from "./types";

export function LiftCoastWidget({ data, content, accent, t }: WidgetProps) {
  const tel = data.telemetry;
  const ext = data.extended;
  const thr = tel?.throttle ?? 0;
  const brk = tel?.brake ?? 0;
  const coasting = thr < 0.05 && brk < 0.05;

  // Barre LED : 20 segments. Throttle (vert) à droite, frein (rouge) à gauche,
  // coast (jaune) au centre.
  const SEG = 20;
  const segs = Array.from({ length: SEG }, (_, i) => {
    const pos = i / (SEG - 1); // 0..1
    let on = false;
    let color = "rgba(255,255,255,0.08)";
    if (thr > 0.05 && pos >= 0.5 && pos - 0.5 <= thr / 2) {
      on = true;
      color = "#22c55e";
    } else if (brk > 0.05 && pos < 0.5 && 0.5 - pos <= brk / 2) {
      on = true;
      color = "#ef4444";
    } else if (coasting && Math.abs(pos - 0.5) < 0.06) {
      on = true;
      color = "#facc15";
    }
    return { color: on ? color : "rgba(255,255,255,0.08)" };
  });

  return (
    <Panel accent={accent} style={{ width: 340 }}>
      <PanelHeader accent={accent} icon={Activity} title={t("overlays.items.liftcoast.title")} />
      <div className="p-3">
        {content.ledBar !== false && (
          <div className="flex items-center gap-[3px]">
            {segs.map((s, i) => (
              <div
                key={i}
                className="h-4 flex-1 rounded-[2px]"
                style={{ background: s.color }}
              />
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between text-[11px]">
          {content.tc !== false && (
            <span
              className="rounded px-2 py-0.5 font-semibold"
              style={{
                background: ext && ext.tc > 0 ? "#16a34a" : "rgba(255,255,255,0.08)",
                color: ext && ext.tc > 0 ? "#000" : "rgba(255,255,255,0.5)",
              }}
            >
              TC {ext && ext.tc > 0 ? ext.tc : "—"}
            </span>
          )}
          {coasting && (
            <span className="font-semibold text-yellow-400">
              {t("overlays.elements.coast")}
            </span>
          )}
          {content.abs !== false && (
            <span
              className="rounded px-2 py-0.5 font-semibold"
              style={{
                background: ext && ext.abs > 0 ? "#16a34a" : "rgba(255,255,255,0.08)",
                color: ext && ext.abs > 0 ? "#000" : "rgba(255,255,255,0.5)",
              }}
            >
              ABS {ext && ext.abs > 0 ? ext.abs : "—"}
            </span>
          )}
        </div>
      </div>
    </Panel>
  );
}
