/** Overlay Aides & réglages : répartition de frein, TC / TC cut / TC slip, ABS, limiteur.
 *  (Richesse/Turbo/DRS retirés : inutilisés sur LMU.) */

import { SlidersHorizontal } from "lucide-react";
import { Panel, PanelHeader } from "@/components/overlay/ui";
import type { WidgetProps } from "./types";

function Chip({
  label,
  value,
  on,
  accent,
}: {
  label: string;
  value: string;
  on: boolean;
  accent: string;
}) {
  return (
    <div
      className="flex flex-col items-center rounded-md px-1.5 py-1.5"
      style={{ background: on ? `${accent}22` : "rgba(255,255,255,0.05)" }}
    >
      <span className="text-[8px] font-medium uppercase tracking-wider text-white/45">
        {label}
      </span>
      <span
        className="font-mono text-[13px] font-bold leading-tight"
        style={{ color: on ? accent : "rgba(255,255,255,0.85)" }}
      >
        {value}
      </span>
    </div>
  );
}

/** Affiche « valeur/max » (ou « valeur » si pas de max), « — » si absent. */
function level(value?: number, max?: number): string {
  if (!value || value <= 0) return "—";
  return max && max > 0 ? `${value}/${max}` : String(value);
}

export function AidsWidget({ data, content, accent, t }: WidgetProps) {
  const tel = data.telemetry;
  const ext = data.extended;

  // Répartition de frein : `rear_brake_bias` = fraction arrière (0..1) ou déjà en %.
  // On affiche AVANT:ARRIÈRE (ex. 51.5:48.5), comme en jeu.
  const bbRaw = tel?.rear_brake_bias ?? 0;
  const bbRear = bbRaw > 1.5 ? bbRaw : bbRaw * 100;
  const bbFront = 100 - bbRear;

  return (
    <Panel accent={accent} style={{ width: 360 }}>
      <PanelHeader accent={accent} icon={SlidersHorizontal} title={t("overlays.items.aids.title")} />
      <div className="grid grid-cols-4 gap-1.5 p-2.5">
        {content.bias !== false && (
          <Chip
            label={t("overlays.elements.bias")}
            value={tel && bbRear > 0 ? `${bbFront.toFixed(1)}:${bbRear.toFixed(1)}` : "—"}
            on={!!tel && bbRear > 0}
            accent={accent}
          />
        )}
        {/* Les 3 réglages TC de LMU : à bord, power cut, slip angle. */}
        {content.tc !== false && (
          <Chip
            label="TC"
            value={level(ext?.tc, ext?.tc_max)}
            on={!!ext && ext.tc > 0}
            accent={accent}
          />
        )}
        {content.tc !== false && (
          <Chip
            label="TC CUT"
            value={level(ext?.tc_cut, ext?.tc_cut_max)}
            on={!!ext && ext.tc_cut > 0}
            accent={accent}
          />
        )}
        {content.tc !== false && (
          <Chip
            label="TC SLIP"
            value={level(ext?.tc_slip, ext?.tc_slip_max)}
            on={!!ext && ext.tc_slip > 0}
            accent={accent}
          />
        )}
        {content.abs !== false && (
          <Chip
            label="ABS"
            value={level(ext?.abs, ext?.abs_max)}
            on={!!ext && ext.abs > 0}
            accent={accent}
          />
        )}
        {content.limiter !== false && (
          <Chip
            label={t("overlays.elements.limiter")}
            value={tel?.speed_limiter ? "ON" : "OFF"}
            on={!!tel?.speed_limiter}
            accent="#f59e0b"
          />
        )}
      </div>
    </Panel>
  );
}
