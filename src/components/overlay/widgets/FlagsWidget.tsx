/** Overlay Flags : drapeaux jaunes globaux + par secteur. */

import { Flag } from "lucide-react";
import { Panel, PanelHeader } from "@/components/overlay/ui";
import type { WidgetProps } from "./types";

export function FlagsWidget({ data, content, accent, t }: WidgetProps) {
  const f = data.flags;
  const fcy = (f?.yellow_flag_state ?? 0) > 0;
  const playerFlag = data.player?.flag ?? 0; // 0 none, 6 blue (rF2), etc.
  const blue = playerFlag === 6;

  let bannerColor = "#22c55e";
  let bannerLabel = t("overlays.flags.green");
  if (fcy) {
    bannerColor = "#facc15";
    bannerLabel = t("overlays.flags.yellow");
  } else if (blue) {
    bannerColor = "#3b82f6";
    bannerLabel = t("overlays.flags.blue");
  }

  return (
    <Panel accent={accent} style={{ width: 280 }}>
      <PanelHeader accent={accent} icon={Flag} title={t("overlays.items.flags.title")} />
      <div className="p-3">
        <div
          className="rounded-md py-2 text-center text-sm font-bold uppercase tracking-wider text-black"
          style={{ background: bannerColor, boxShadow: `0 0 14px ${bannerColor}99` }}
        >
          {bannerLabel}
        </div>
        {content.sectors !== false && f && (
          <div className="mt-2 flex gap-1.5">
            {f.sector_flags.map((sf, i) => (
              <div
                key={i}
                className="flex-1 rounded py-1 text-center text-[10px] font-semibold"
                style={{
                  background: sf > 0 ? "#facc15" : "rgba(255,255,255,0.08)",
                  color: sf > 0 ? "#000" : "rgba(255,255,255,0.5)",
                }}
              >
                S{i + 1}
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
