/** Overlay Secteurs : temps par secteur (dernier vs meilleur) + tour complet & optimal. */

import { Split } from "lucide-react";
import { Panel, PanelHeader, RecordFlash } from "@/components/overlay/ui";
import { fmtSec, fmtLap, fmtDelta } from "@/components/overlay/format";
import type { WidgetProps } from "./types";
import { toneColor, useOverlayLook, type OverlayLook } from "@/components/overlay/look";

/** Couleur d'un temps selon l'écart au meilleur (vert = battu, rouge = perdu). */
function deltaColor(last: number, best: number, look: OverlayLook): string {
  if (!(last > 0) || !(best > 0)) return "rgba(255,255,255,0.85)";
  const d = last - best;
  if (d < -0.0005) return toneColor(look, "gain", "#22c55e"); // amélioré
  if (d > 0.0005) return toneColor(look, "loss", "#f87171"); // perdu
  return toneColor(look, "sessionBest", "#c4b5fd"); // égal au meilleur
}

function Row({
  label,
  last,
  best,
  showDelta,
  mono,
  classBest,
}: {
  label: string;
  last: number;
  best: number;
  showDelta: boolean;
  /** Formatage : secteur (12.345) ou tour (M:SS.mmm). */
  mono: (s: number) => string;
  /** Ce temps est le meilleur de la classe (animations de record). */
  classBest?: boolean;
}) {
  const look = useOverlayLook();
  const color = deltaColor(last, best, look);
  const record = last > 0 && best > 0 && Math.abs(last - best) < 0.0005 ? (classBest ? "sb" : "pb") : null;
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-9 text-[10px] font-bold uppercase tracking-wide text-white/50">
        {label}
      </span>
      <span className="flex-1">
        <RecordFlash value={last} kind={record} className="font-mono text-[13px] tabular-nums" style={{ color }}>
          {mono(last)}
        </RecordFlash>
      </span>
      {showDelta && (
        <span className="w-16 text-right font-mono text-[11px] tabular-nums" style={{ color }}>
          {last > 0 && best > 0 ? fmtDelta(last - best) : ""}
        </span>
      )}
    </div>
  );
}

export function SectorsWidget({ data, content, accent, t }: WidgetProps) {
  const look = useOverlayLook();
  const p = data.player;
  const last = p?.last_sectors ?? [0, 0, 0];
  const best = p?.best_sectors ?? [0, 0, 0];
  const showDelta = content.delta !== false;
  const me = data.standings.find((s) => s.is_player);
  const classBestSector = [me?.is_class_best_s1, me?.is_class_best_s2, me?.is_class_best_s3];
  const optimal = best.every((b) => b > 0) ? best[0] + best[1] + best[2] : 0;

  return (
    <Panel accent={accent} style={{ width: 320 }}>
      <PanelHeader accent={accent} icon={Split} title={t("overlays.items.sectors.title")} />
      <div className="px-3 py-1.5">
        {[0, 1, 2].map((i) => (
          <Row
            key={i}
            label={`S${i + 1}`}
            last={last[i]}
            best={best[i]}
            showDelta={showDelta}
            mono={fmtSec}
            classBest={!!classBestSector[i]}
          />
        ))}
        {(content.lap !== false || content.optimal !== false) && (
          <div className="my-1 h-px bg-white/10" />
        )}
        {content.lap !== false && (
          <Row
            label={t("overlays.elements.lap")}
            last={p?.last_lap_time ?? 0}
            best={p?.best_lap_time ?? 0}
            showDelta={showDelta}
            mono={fmtLap}
            classBest={!!me?.is_class_best_lap}
          />
        )}
        {content.optimal !== false && (
          <div className="flex items-center gap-2 py-0.5">
            <span className="w-9 text-[10px] font-bold uppercase tracking-wide text-white/50">
              {t("overlays.elements.optimal")}
            </span>
            <span
              className={`flex-1 font-mono text-[13px] tabular-nums ${look.style === "instrument" ? "" : "text-purple-300"}`}
              style={look.style === "instrument" ? { color: toneColor(look, "sessionBest", "") } : undefined}
            >
              {fmtLap(optimal)}
            </span>
            {showDelta && <span className="w-16" />}
          </div>
        )}
      </div>
    </Panel>
  );
}
