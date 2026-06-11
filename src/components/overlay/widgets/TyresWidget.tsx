/** Overlay Tyres : temp / usure / pression / freins par roue (FL FR RL RR). */

import { CircleDot } from "lucide-react";
import { Panel, PanelHeader } from "@/components/overlay/ui";
import { wheelLabels } from "@/components/overlay/format";
import type { LiveWheel } from "@/lib/api";
import type { WidgetProps } from "./types";

/** Couleur selon la température de gomme (bleu froid → vert ok → rouge chaud). */
function tempColor(temp: number): string {
  if (temp < 60) return "#60a5fa";
  if (temp < 85) return "#4ade80";
  if (temp < 105) return "#facc15";
  return "#f87171";
}

function Tyre({
  w,
  label,
  content,
  t,
}: {
  w: LiveWheel;
  label: string;
  content: Record<string, boolean>;
  t: WidgetProps["t"];
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-md bg-white/5 px-2 py-1.5">
      <span className="text-[9px] font-bold uppercase tracking-wide text-white/40">
        {label}
      </span>
      {content.temps !== false && (
        <span className="font-mono text-sm font-bold" style={{ color: tempColor(w.temp) }}>
          {Math.round(w.temp)}°
        </span>
      )}
      {content.wear !== false && (
        <span className="font-mono text-[10px] text-white/70">{Math.round(w.wear)}%</span>
      )}
      {content.pressure !== false && (
        <span className="font-mono text-[9px] text-white/45">{w.pressure.toFixed(0)} kPa</span>
      )}
      {content.brakes !== false && w.brake_temp >= 0 && (
        <span className="font-mono text-[9px] text-orange-300/80">
          {Math.round(w.brake_temp)}° {t("overlays.elements.brakes")}
        </span>
      )}
    </div>
  );
}

export function TyresWidget({ data, content, accent, t }: WidgetProps) {
  const wheels = data.telemetry?.wheels;
  const labels = wheelLabels(t);

  return (
    <Panel accent={accent} style={{ width: 320 }}>
      <PanelHeader accent={accent} icon={CircleDot} title={t("overlays.items.tyres.title")} />
      <div className="grid grid-cols-2 gap-2 p-3">
        {wheels ? (
          wheels.map((w, i) => (
            <Tyre key={i} w={w} label={labels[i]} content={content} t={t} />
          ))
        ) : (
          <div className="col-span-2 py-3 text-center text-[11px] text-white/40">
            {t("overlays.noData")}
          </div>
        )}
      </div>
    </Panel>
  );
}
