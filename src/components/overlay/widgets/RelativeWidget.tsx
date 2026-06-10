/** Overlay Relative : voitures proches devant/derrière (écarts relatifs). */

import { ArrowUpDown } from "lucide-react";
import { Panel, PanelHeader } from "@/components/overlay/ui";
import { liveClassColor } from "@/components/overlay/format";
import type { LiveStanding } from "@/lib/api";
import type { WidgetProps } from "./types";

export function RelativeWidget({ data, content, accent, t }: WidgetProps) {
  const player = data.standings.find((s) => s.is_player);

  let rows: Array<{ s: LiveStanding; rel: number }> = [];
  if (player) {
    // Écart relatif au joueur (approx. tour de tête) : leur retard − notre retard.
    rows = data.standings.map((s) => ({
      s,
      rel: s.time_behind_leader - player.time_behind_leader,
    }));
    rows.sort((a, b) => a.rel - b.rel);
    const pi = rows.findIndex((r) => r.s.is_player);
    rows = rows.slice(Math.max(0, pi - 3), pi + 4);
  }

  return (
    <Panel accent={accent} style={{ width: 440 }}>
      <PanelHeader accent={accent} icon={ArrowUpDown} title={t("overlays.items.relative.title")} />
      <div className="px-2 py-1.5">
        {rows.length === 0 ? (
          <div className="px-2 py-3 text-center text-[11px] text-white/40">
            {t("overlays.noData")}
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <tbody>
              {rows.map(({ s, rel }) => {
                const color = content.classColors !== false ? liveClassColor(s.vehicle_class) : null;
                return (
                  <tr
                    key={s.position}
                    className="border-b border-white/5 last:border-0"
                    style={{ background: s.is_player ? `${accent}22` : "transparent" }}
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
                    <td className="max-w-[170px] truncate py-0.5 pl-1.5 font-medium">
                      {s.driver || s.vehicle_name}
                    </td>
                    {content.pitFlag !== false && s.in_pits && (
                      <td className="py-0.5 text-[9px] font-bold text-amber-400">PIT</td>
                    )}
                    {content.gaps !== false && (
                      <td
                        className="w-16 py-0.5 pr-1 text-right font-mono tabular-nums"
                        style={{ color: s.is_player ? accent : rel < 0 ? "#f87171" : "#4ade80" }}
                      >
                        {s.is_player ? "—" : `${rel > 0 ? "+" : ""}${rel.toFixed(1)}`}
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
