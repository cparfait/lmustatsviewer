/** Overlay Dashboard : boîtes d'infos clés en grille. */

import { LayoutGrid } from "lucide-react";
import { Panel, PanelHeader, Stat } from "@/components/overlay/ui";
import { fmtLap } from "@/components/overlay/format";
import type { WidgetProps } from "./types";

export function DashboardWidget({ data, content, accent, t }: WidgetProps) {
  const p = data.player;
  const tel = data.telemetry;
  return (
    <Panel accent={accent} style={{ width: 340 }}>
      <PanelHeader accent={accent} icon={LayoutGrid} title={t("overlays.items.dashboard.title")} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-3">
        {content.position !== false && (
          <Stat label={t("overlays.elements.position")} value={p ? `P${p.position}` : "—"} />
        )}
        {content.laps !== false && (
          <Stat label={t("overlays.elements.laps")} value={p ? String(p.total_laps) : "—"} />
        )}
        {content.lastLap !== false && (
          <Stat label={t("overlays.elements.lastLap")} value={fmtLap(p?.last_lap_time ?? 0)} />
        )}
        {content.bestLap !== false && (
          <Stat label={t("overlays.elements.bestLap")} value={fmtLap(p?.best_lap_time ?? 0)} />
        )}
        {content.fuel !== false && (
          <Stat
            label={t("overlays.elements.fuel")}
            value={tel ? tel.fuel.toFixed(1) : "—"}
            unit="L"
          />
        )}
      </div>
    </Panel>
  );
}
