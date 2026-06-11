/** Overlay Session : type de session, temps/tours restants. */

import { Clock } from "lucide-react";
import { Panel, PanelHeader, Stat } from "@/components/overlay/ui";
import type { WidgetProps } from "./types";

const SESSION_LABELS: Record<number, string> = {
  0: "Test",
  1: "Practice",
  2: "Qualify",
  3: "Warmup",
  4: "Race",
};

function fmtClock(s: number): string {
  if (!isFinite(s) || s <= 0) return "—:—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

export function SessionWidget({ data, content, accent, t }: WidgetProps) {
  const sc = data.session;
  const p = data.player;

  let sessionLabel = "—";
  if (sc) {
    if (sc.session >= 10) sessionLabel = "Race";
    else if (sc.session >= 5) sessionLabel = "Qualify";
    else sessionLabel = SESSION_LABELS[sc.session] ?? `S${sc.session}`;
  }

  const timeLeft = sc && sc.end_et > sc.session_time ? sc.end_et - sc.session_time : 0;
  const lapsLeft =
    sc && sc.max_laps > 0 && sc.max_laps < 1000
      ? Math.max(0, sc.max_laps - (p?.total_laps ?? 0))
      : 0;

  return (
    <Panel accent={accent} style={{ width: 320 }}>
      <PanelHeader accent={accent} icon={Clock} title={t("overlays.items.session.title")} />
      <div className="grid grid-cols-3 gap-x-3 gap-y-2 p-3">
        {content.type !== false && (
          <Stat label={t("overlays.elements.type")} value={sessionLabel} />
        )}
        {content.timeLeft !== false && (
          <Stat
            label={t("overlays.elements.timeLeft")}
            value={timeLeft > 0 ? fmtClock(timeLeft) : "—"}
          />
        )}
        {content.lapsLeft !== false && (
          <Stat
            label={t("overlays.elements.lapsLeft")}
            value={lapsLeft > 0 ? String(lapsLeft) : "—"}
          />
        )}
      </div>
    </Panel>
  );
}
