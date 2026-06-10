/** Overlay Endurance : suivi de relais (stint), chronos, position. */

import { useEffect, useRef } from "react";
import { Timer } from "lucide-react";
import { Panel, PanelHeader, Stat } from "@/components/overlay/ui";
import { fmtLap } from "@/components/overlay/format";
import type { WidgetProps } from "./types";

export function EnduranceWidget({ data, content, accent, t }: WidgetProps) {
  const p = data.player;

  // Suivi du relais : tours depuis le dernier passage aux stands.
  const lapAtPit = useRef(0);
  const lastPitCount = useRef(p?.num_pitstops ?? 0);
  useEffect(() => {
    if (!p) return;
    if (p.num_pitstops !== lastPitCount.current) {
      lastPitCount.current = p.num_pitstops;
      lapAtPit.current = p.total_laps;
    }
  }, [p]);

  const stintLaps = p ? Math.max(0, p.total_laps - lapAtPit.current) : 0;

  return (
    <Panel accent={accent} style={{ width: 320 }}>
      <PanelHeader accent={accent} icon={Timer} title={t("overlays.items.endurance.title")} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-3">
        {content.stint !== false && (
          <Stat label={t("overlays.elements.stint")} value={String(stintLaps)} />
        )}
        {content.position !== false && (
          <Stat label={t("overlays.elements.position")} value={p ? `P${p.position}` : "—"} />
        )}
        {content.lapTimes !== false && (
          <Stat label={t("overlays.elements.lastLap")} value={fmtLap(p?.last_lap_time ?? 0)} />
        )}
        {content.lapTimes !== false && (
          <Stat label={t("overlays.elements.bestLap")} value={fmtLap(p?.best_lap_time ?? 0)} />
        )}
      </div>
      <div className="px-3 pb-2 text-[10px] text-white/40">
        {t("overlays.elements.pitstops")}: {p?.num_pitstops ?? 0}
      </div>
    </Panel>
  );
}
