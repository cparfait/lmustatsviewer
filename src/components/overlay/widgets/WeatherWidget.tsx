/** Overlay Weather : températures air/piste, vent, pluie. */

import { Cloud, Thermometer, Wind, Droplets } from "lucide-react";
import { Panel, PanelHeader } from "@/components/overlay/ui";
import type { WidgetProps } from "./types";

export function WeatherWidget({ data, content, accent, t }: WidgetProps) {
  const w = data.weather;

  return (
    <Panel accent={accent} style={{ width: 320 }}>
      <PanelHeader accent={accent} icon={Cloud} title={t("overlays.items.weather.title")} />
      <div className="flex flex-col gap-2 p-3 text-[12px]">
        {content.temps !== false && (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-white/60">
              <Thermometer className="h-3.5 w-3.5" /> {t("overlays.elements.air")}
            </span>
            <span className="font-mono font-semibold">{w ? `${w.air_temp.toFixed(1)}°` : "—"}</span>
          </div>
        )}
        {content.temps !== false && (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-white/60">
              <Thermometer className="h-3.5 w-3.5" /> {t("overlays.elements.track")}
            </span>
            <span className="font-mono font-semibold">{w ? `${w.track_temp.toFixed(1)}°` : "—"}</span>
          </div>
        )}
        {content.wind !== false && (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-white/60">
              <Wind className="h-3.5 w-3.5" /> {t("overlays.elements.wind")}
            </span>
            <span className="font-mono font-semibold">{w ? `${w.wind_speed.toFixed(1)} km/h` : "—"}</span>
          </div>
        )}
        {content.rain !== false && (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-white/60">
              <Droplets className="h-3.5 w-3.5" /> {t("overlays.elements.rain")}
            </span>
            <span
              className="font-mono font-semibold"
              style={{ color: w && w.rain > 0.05 ? "#60a5fa" : undefined }}
            >
              {w ? `${Math.round(w.rain * 100)}%` : "—"}
            </span>
          </div>
        )}
      </div>
    </Panel>
  );
}
