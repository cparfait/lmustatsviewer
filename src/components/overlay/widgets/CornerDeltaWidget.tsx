/**
 * Overlay Corner Delta : écart de temps LIVE par rapport à ton meilleur tour de
 * la session, aligné par distance — grand chiffre + barre, et détail par virage
 * qui se remplit au passage de chaque apex. Moteur : `useLiveDelta`.
 */

import { Crosshair } from "lucide-react";
import { Panel, PanelHeader } from "@/components/overlay/ui";
import { formatTime } from "@/lib/utils";
import type { Tr } from "@/i18n";
import { useLiveDelta } from "./useLiveDelta";
import { useAlienTarget, type TierKey } from "./useAlienTarget";
import type { WidgetProps } from "./types";

function fmt(d: number): string {
  return `${d >= 0 ? "+" : ""}${d.toFixed(2)}`;
}

/** Libellé localisé d'un tier (paliers non sélectionnables → repli sur le brut). */
function tierLabel(t: Tr, tier: TierKey): string {
  const key: Partial<Record<TierKey, string>> = {
    alien: "config.targetAlien",
    competitive: "config.targetCompetitive",
    good: "config.targetGood",
    midpack: "config.targetMidpack",
  };
  return key[tier] ? t(key[tier]) : tier;
}

function deltaColor(d: number | null): string {
  if (d == null || d === 0) return "white";
  return d < 0 ? "#4ade80" : "#f87171";
}

export function CornerDeltaWidget({ data, content, accent, t }: WidgetProps) {
  const live = useLiveDelta(data);
  const target = useAlienTarget(data);
  const delta = live.delta;
  const ahead = delta != null && delta < 0;

  // Barre centrée : -2s..+2s.
  const clamped = Math.max(-2, Math.min(2, delta ?? 0));
  const pct = (clamped / 2) * 50; // -50%..+50% depuis le centre

  return (
    <Panel accent={accent} style={{ width: 360 }}>
      <PanelHeader
        accent={accent}
        icon={Crosshair}
        title={t("overlays.items.cornerdelta.title")}
      />
      <div className="p-3">
        {content.bar !== false && (
          <>
            <div
              className="mb-1 text-center font-mono text-2xl font-black tabular-nums"
              style={{ color: deltaColor(delta) }}
            >
              {delta == null ? "—.——" : fmt(delta)}
            </div>
            <div className="relative h-2.5 overflow-hidden rounded bg-white/10">
              <div className="absolute bottom-0 left-1/2 top-0 w-px bg-white/40" />
              {delta != null && (
                <div
                  className="absolute bottom-0 top-0"
                  style={{
                    left: pct < 0 ? `${50 + pct}%` : "50%",
                    width: `${Math.abs(pct)}%`,
                    background: ahead ? "#4ade80" : "#f87171",
                  }}
                />
              )}
            </div>
            {!live.refReady && (
              <div className="mt-1 text-center text-[10px] text-white/50">
                {t("overlays.cdNoRef")}
              </div>
            )}
          </>
        )}

        {content.target !== false && target && (
          <div className="mt-2 flex items-center justify-between rounded bg-white/5 px-2 py-1">
            <span className="text-[10px] uppercase tracking-wide text-white/55">
              🎯 {tierLabel(t, target.tier)} {formatTime(target.targetMs / 1000)}
            </span>
            {target.gapToTargetS != null && (
              <span
                className="font-mono text-[11px] font-semibold tabular-nums"
                style={{ color: target.gapToTargetS <= 0 ? "#4ade80" : "#f87171" }}
              >
                {target.gapToTargetS >= 0 ? "+" : ""}
                {target.gapToTargetS.toFixed(1)}s
              </span>
            )}
          </div>
        )}

        {content.corners !== false && live.refReady && live.corners.length > 0 && (
          <div className="mt-2 grid grid-cols-4 gap-1">
            {live.corners.slice(-8).map((c) => (
              <div key={c.n} className="rounded bg-white/5 px-1 py-0.5 text-center">
                <div className="text-[9px] uppercase tracking-wide text-white/45">
                  T{c.n}
                </div>
                <div
                  className="font-mono text-[11px] font-semibold tabular-nums"
                  style={{ color: deltaColor(c.delta) }}
                >
                  {fmt(c.delta)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
