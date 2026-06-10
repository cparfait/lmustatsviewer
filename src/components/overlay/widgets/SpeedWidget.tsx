/** Overlay Speed : Vmax (bout de ligne droite) & Vmin (corde), vitesse actuelle. */

import { useEffect, useRef } from "react";
import { TrendingUp } from "lucide-react";
import { Panel, PanelHeader, Stat } from "@/components/overlay/ui";
import type { WidgetProps } from "./types";

export function SpeedWidget({ data, content, accent, t }: WidgetProps) {
  const tel = data.telemetry;
  const speed = tel?.speed_kmh ?? 0;

  // Max sur le tour + min hors arrêt (réinitialisés au passage des stands / tour).
  const maxRef = useRef(0);
  const minRef = useRef(Infinity);
  const lapRef = useRef(0);

  useEffect(() => {
    if (!tel || !data.player) return;
    // Reset au changement de tour.
    if (data.player.total_laps !== lapRef.current) {
      lapRef.current = data.player.total_laps;
      maxRef.current = 0;
      minRef.current = Infinity;
    }
    if (speed > maxRef.current) maxRef.current = speed;
    if (speed > 20 && speed < minRef.current) minRef.current = speed;
  }, [tel, data.player, speed]);

  const minVal = isFinite(minRef.current) ? minRef.current : 0;

  return (
    <Panel accent={accent} style={{ width: 320 }}>
      <PanelHeader accent={accent} icon={TrendingUp} title={t("overlays.items.speed.title")} />
      <div className="grid grid-cols-3 gap-x-3 gap-y-2 p-3">
        {content.topSpeed !== false && (
          <Stat
            label={t("overlays.elements.topSpeed")}
            value={maxRef.current > 0 ? Math.round(maxRef.current).toString() : "—"}
            unit="km/h"
            color="#4ade80"
          />
        )}
        {content.minSpeed !== false && (
          <Stat
            label={t("overlays.elements.minSpeed")}
            value={minVal > 0 ? Math.round(minVal).toString() : "—"}
            unit="km/h"
            color="#f87171"
          />
        )}
        {content.current !== false && (
          <Stat
            label={t("overlays.elements.current")}
            value={Math.round(speed).toString()}
            unit="km/h"
          />
        )}
      </div>
    </Panel>
  );
}
