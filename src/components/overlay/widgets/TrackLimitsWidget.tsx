/** Overlay Limites de piste : points accumulés avant pénalité (mémoire native LMU). */

import { AlertTriangle } from "lucide-react";
import { Panel, PanelHeader } from "@/components/overlay/ui";
import type { WidgetProps } from "./types";

export function TrackLimitsWidget({ data, accent, t }: WidgetProps) {
  const ext = data.extended;
  const steps = ext?.track_limits ?? 0;
  const max = ext?.track_limits_per_penalty ?? 0;
  const enforced = max > 0;
  const frac = enforced ? Math.min(1, steps / max) : 0;
  // Vert → jaune (≥60 %) → rouge (≥85 %, proche de la pénalité).
  const color = !enforced
    ? "rgba(255,255,255,0.4)"
    : frac >= 0.85
      ? "#ef4444"
      : frac >= 0.6
        ? "#facc15"
        : "#22c55e";

  return (
    <Panel accent={accent} style={{ width: 300 }}>
      <PanelHeader
        accent={accent}
        icon={AlertTriangle}
        title={t("overlays.items.tracklimits.title")}
      />
      <div className="p-3">
        <div className="flex items-end justify-between">
          <span className="text-[10px] uppercase tracking-wider text-white/45">
            {t("overlays.elements.beforePenalty")}
          </span>
          <span className="font-mono text-[18px] font-bold" style={{ color }}>
            {enforced ? `${steps}/${max}` : "—"}
          </span>
        </div>
        {enforced && (
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{ width: `${frac * 100}%`, background: color }}
            />
          </div>
        )}
      </div>
    </Panel>
  );
}
