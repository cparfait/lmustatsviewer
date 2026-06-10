/** Overlay Standings : classement, écarts, couleurs de classe. */

import { List } from "lucide-react";
import { Panel, PanelHeader } from "@/components/overlay/ui";
import { fmtLap, liveClassColor } from "@/components/overlay/format";
import type { WidgetProps } from "./types";

export function StandingsWidget({ data, content, accent, t }: WidgetProps) {
  const rows = [...data.standings].sort((a, b) => a.position - b.position).slice(0, 12);

  return (
    <Panel accent={accent} style={{ width: 460 }}>
      <PanelHeader accent={accent} icon={List} title={t("overlays.items.standings.title")} />
      <div className="px-2 py-1.5">
        {rows.length === 0 ? (
          <div className="px-2 py-3 text-center text-[11px] text-white/40">
            {t("overlays.noData")}
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <tbody>
              {rows.map((s) => {
                const color = content.classColors !== false ? liveClassColor(s.vehicle_class) : null;
                return (
                  <tr
                    key={s.position}
                    className="border-b border-white/5 last:border-0"
                    style={{
                      background: s.is_player ? `${accent}22` : "transparent",
                    }}
                  >
                    <td className="w-6 py-0.5 text-center font-mono font-bold text-white/70">
                      {s.position}
                    </td>
                    <td className="w-1 py-0.5">
                      <span
                        className="inline-block h-3 w-1 rounded-sm"
                        style={{ background: color ?? "transparent" }}
                      />
                    </td>
                    <td className="max-w-[150px] truncate py-0.5 pl-1.5 font-medium">
                      {s.driver || s.vehicle_name}
                    </td>
                    {content.bestLap !== false && (
                      <td className="py-0.5 text-right font-mono text-white/70 tabular-nums">
                        {fmtLap(s.best_lap_time)}
                      </td>
                    )}
                    {content.gaps !== false && (
                      <td className="w-14 py-0.5 pr-1 text-right font-mono text-white/55 tabular-nums">
                        {s.position === 1
                          ? "—"
                          : s.laps_behind_leader > 0
                            ? `+${s.laps_behind_leader}L`
                            : `+${s.time_behind_leader.toFixed(1)}`}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}
