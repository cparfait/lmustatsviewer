/** Overlay Rival : voiture devant & derrière (écart + dernier tour). */

import { Swords } from "lucide-react";
import { Panel, PanelHeader } from "@/components/overlay/ui";
import { fmtLap, liveClassColor } from "@/components/overlay/format";
import type { LiveStanding } from "@/lib/api";
import type { WidgetProps } from "./types";

function Row({
  label,
  car,
  gap,
  showLast,
  t,
}: {
  label: string;
  car: LiveStanding | undefined;
  gap: number;
  showLast: boolean;
  t: WidgetProps["t"];
}) {
  const color = car ? liveClassColor(car.vehicle_class) : null;
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-12 text-[10px] uppercase tracking-wide text-white/45">{label}</span>
      <span
        className="inline-block h-3 w-1 rounded-sm"
        style={{ background: color ?? "transparent" }}
      />
      <span className="flex-1 truncate text-[12px] font-medium">
        {car ? car.driver || car.vehicle_name : "—"}
      </span>
      {showLast && (
        <span className="font-mono text-[11px] text-white/60">
          {fmtLap(car?.last_lap_time ?? 0)}
        </span>
      )}
      <span className="w-12 text-right font-mono text-[12px] font-semibold tabular-nums">
        {car && gap > 0 ? `${gap.toFixed(1)}` : "—"}
      </span>
    </div>
  );
}

export function RivalWidget({ data, content, accent, t }: WidgetProps) {
  const sorted = [...data.standings].sort((a, b) => a.position - b.position);
  const pi = sorted.findIndex((s) => s.is_player);
  const player = pi >= 0 ? sorted[pi] : undefined;
  const ahead = pi > 0 ? sorted[pi - 1] : undefined;
  const behind = pi >= 0 && pi < sorted.length - 1 ? sorted[pi + 1] : undefined;

  return (
    <Panel accent={accent} style={{ width: 380 }}>
      <PanelHeader accent={accent} icon={Swords} title={t("overlays.items.rival.title")} />
      <div className="px-3 py-1.5">
        {content.ahead !== false && (
          <Row
            label={t("overlays.elements.ahead")}
            car={ahead}
            gap={player?.time_behind_next ?? 0}
            showLast={content.lastLap !== false}
            t={t}
          />
        )}
        <div className="my-1 h-px bg-white/10" />
        {content.behind !== false && (
          <Row
            label={t("overlays.elements.behind")}
            car={behind}
            gap={behind?.time_behind_next ?? 0}
            showLast={content.lastLap !== false}
            t={t}
          />
        )}
      </div>
    </Panel>
  );
}
