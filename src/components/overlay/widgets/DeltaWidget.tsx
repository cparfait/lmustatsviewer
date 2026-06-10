/** Overlay Delta : barre delta (vs meilleur tour) + trace throttle/frein. */

import { useEffect, useRef } from "react";
import { Triangle } from "lucide-react";
import { Panel, PanelHeader } from "@/components/overlay/ui";
import { fmtDelta } from "@/components/overlay/format";
import type { WidgetProps } from "./types";

const TRACE_LEN = 140;

export function DeltaWidget({ data, content, accent, t }: WidgetProps) {
  const delta = data.player?.lap_delta ?? 0;
  const ahead = delta < 0; // négatif = plus rapide

  const thr = useRef<number[]>([]);
  const brk = useRef<number[]>([]);
  useEffect(() => {
    const tel = data.telemetry;
    if (!tel) return;
    thr.current.push(tel.throttle);
    brk.current.push(tel.brake);
    if (thr.current.length > TRACE_LEN) {
      thr.current.shift();
      brk.current.shift();
    }
  }, [data.telemetry]);

  // Barre centrée : -2s..+2s.
  const clamped = Math.max(-2, Math.min(2, delta));
  const pct = (clamped / 2) * 50; // -50%..+50% depuis le centre

  const W = 320;
  const H = 36;
  const toPath = (arr: number[]) =>
    arr
      .map((v, i) => {
        const x = (i / (TRACE_LEN - 1)) * W;
        const y = H - Math.max(0, Math.min(1, v)) * H;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <Panel accent={accent} style={{ width: 360 }}>
      <PanelHeader accent={accent} icon={Triangle} title={t("overlays.items.delta.title")} />
      <div className="p-3">
        {content.bar !== false && (
          <>
            <div className="mb-1 text-center font-mono text-2xl font-black tabular-nums"
              style={{ color: ahead ? "#4ade80" : delta > 0 ? "#f87171" : "white" }}
            >
              {fmtDelta(delta)}
            </div>
            <div className="relative h-2.5 overflow-hidden rounded bg-white/10">
              <div className="absolute bottom-0 left-1/2 top-0 w-px bg-white/40" />
              <div
                className="absolute bottom-0 top-0"
                style={{
                  left: pct < 0 ? `${50 + pct}%` : "50%",
                  width: `${Math.abs(pct)}%`,
                  background: ahead ? "#4ade80" : "#f87171",
                }}
              />
            </div>
          </>
        )}
        {content.trace !== false && (
          <svg width={W} height={H} className="mt-2 w-full">
            <rect x={0} y={0} width={W} height={H} fill="rgba(255,255,255,0.04)" rx={4} />
            <path d={toPath(thr.current)} fill="none" stroke="#22c55e" strokeWidth={1.5} />
            <path d={toPath(brk.current)} fill="none" stroke="#ef4444" strokeWidth={1.5} />
          </svg>
        )}
      </div>
    </Panel>
  );
}
