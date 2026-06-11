/** Overlay Telemetry : vitesse, rapport, RPM, pédales, trace throttle/frein. */

import { useEffect, useRef } from "react";
import { Zap } from "lucide-react";
import { Panel, PanelHeader, VBar } from "@/components/overlay/ui";
import type { WidgetProps } from "./types";

const TRACE_LEN = 160;

function gearLabel(gear: number): string {
  if (gear < 0) return "R";
  if (gear === 0) return "N";
  return String(gear);
}

export function TelemetryWidget({ data, content, accent, t }: WidgetProps) {
  const tel = data.telemetry;

  // Buffers de trace (throttle/frein) + dots de blocage.
  const thr = useRef<number[]>([]);
  const brk = useRef<number[]>([]);
  const lock = useRef<boolean[]>([]);
  const prevGear = useRef<number>(0);
  const shiftPulse = useRef<number>(0);

  useEffect(() => {
    if (!tel) return;
    thr.current.push(tel.throttle);
    brk.current.push(tel.brake);
    // Blocage approximé : freinage marqué + faible adhérence avant.
    const lockup =
      content.lockup !== false &&
      tel.brake > 0.15 &&
      data.connected &&
      (tel.wheels?.[0]?.grip_fract ?? 1) < 0.92;
    lock.current.push(lockup);
    if (thr.current.length > TRACE_LEN) {
      thr.current.shift();
      brk.current.shift();
      lock.current.shift();
    }
    if (tel.gear !== prevGear.current) {
      shiftPulse.current = Date.now();
      prevGear.current = tel.gear;
    }
  }, [tel, content.lockup, data.connected]);

  const rpmPct = tel && tel.max_rpm > 0 ? tel.rpm / tel.max_rpm : 0;
  const redline = rpmPct > 0.93;
  const shifting =
    content.shiftAnim !== false && Date.now() - shiftPulse.current < 220;

  // Trace SVG.
  const W = 240;
  const H = 54;
  const toPath = (arr: number[]) =>
    arr
      .map((v, i) => {
        const x = (i / (TRACE_LEN - 1)) * W;
        const y = H - Math.max(0, Math.min(1, v)) * H;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <Panel accent={accent} style={{ width: 420 }}>
      <PanelHeader accent={accent} icon={Zap} title={t("overlays.items.telemetry.title")} />
      <div className="flex items-stretch gap-3 p-3">
        {/* Vitesse + rapport */}
        <div className="flex flex-col items-center justify-center px-1">
          {content.speed !== false && (
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-3xl font-bold tabular-nums leading-none">
                {tel ? Math.round(tel.speed_kmh) : "—"}
              </span>
              <span className="text-[10px] text-white/45">km/h</span>
            </div>
          )}
          {content.gear !== false && (
            <span
              className="mt-1 font-mono text-4xl font-black leading-none transition-transform"
              style={{
                color: shifting ? accent : "white",
                transform: shifting ? "scale(1.18)" : "scale(1)",
                textShadow: shifting ? `0 0 16px ${accent}` : "none",
              }}
            >
              {tel ? gearLabel(tel.gear) : "—"}
            </span>
          )}
        </div>

        {/* Pédales */}
        {content.pedals !== false && (
          <div className="flex items-end gap-1.5">
            <VBar value={tel?.throttle ?? 0} color="#22c55e" className="h-[70px]" />
            <VBar value={tel?.brake ?? 0} color="#ef4444" className="h-[70px]" />
          </div>
        )}

        {/* Trace */}
        {content.trace !== false && (
          <div className="flex flex-1 flex-col justify-center">
            <svg width={W} height={H} className="w-full">
              <rect x={0} y={0} width={W} height={H} fill="rgba(255,255,255,0.04)" rx={4} />
              <path d={toPath(thr.current)} fill="none" stroke="#22c55e" strokeWidth={1.5} />
              <path d={toPath(brk.current)} fill="none" stroke="#ef4444" strokeWidth={1.5} />
              {lock.current.map((on, i) =>
                on ? (
                  <circle
                    key={i}
                    cx={(i / (TRACE_LEN - 1)) * W}
                    cy={H - Math.max(0, Math.min(1, brk.current[i])) * H}
                    r={2}
                    fill="#facc15"
                  />
                ) : null,
              )}
            </svg>
          </div>
        )}
      </div>

      {/* Barre RPM */}
      {content.rpm !== false && (
        <div className="px-3 pb-2.5">
          <div className="relative h-2 overflow-hidden rounded bg-white/10">
            <div
              className="absolute bottom-0 left-0 top-0 rounded transition-[width] duration-75"
              style={{
                width: `${Math.min(1, rpmPct) * 100}%`,
                background: redline
                  ? "#ef4444"
                  : `linear-gradient(90deg, ${accent}, #eab308)`,
              }}
            />
          </div>
        </div>
      )}
    </Panel>
  );
}
