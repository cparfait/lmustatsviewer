/** Overlay Fuel : carburant restant, conso, tours restants, à ajouter. */

import { Fuel } from "lucide-react";
import { Panel, PanelHeader, Stat } from "@/components/overlay/ui";
import { computeFuelToFinish } from "@/components/overlay/format";
import type { WidgetProps } from "./types";

export function FuelWidget({ data, content, accent, t }: WidgetProps) {
  const tel = data.telemetry;
  const calc = computeFuelToFinish(data.session, data.player, tel);

  return (
    <Panel accent={accent} style={{ width: 320 }}>
      <PanelHeader accent={accent} icon={Fuel} title={t("overlays.items.fuel.title")} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-3">
        <Stat
          label={t("overlays.elements.fuel")}
          value={tel ? tel.fuel.toFixed(1) : "—"}
          unit="L"
        />
        {content.consumption !== false && (
          <Stat
            label={t("overlays.elements.consumption")}
            value={tel && tel.fuel_consumption > 0 ? tel.fuel_consumption.toFixed(2) : "—"}
            unit="L/lap"
          />
        )}
        {content.lapsLeft !== false && (
          <Stat
            label={t("overlays.elements.lapsLeft")}
            value={tel && tel.fuel_laps_remaining > 0 ? tel.fuel_laps_remaining.toFixed(1) : "—"}
          />
        )}
        {content.toAdd !== false && (
          <Stat
            label={t("overlays.elements.toAdd")}
            value={calc ? (calc.fuelToAdd > 0 ? `+${calc.fuelToAdd.toFixed(1)}` : "OK") : "—"}
            unit={calc && calc.fuelToAdd > 0 ? "L" : undefined}
            color={calc ? (calc.fuelToAdd > 0 ? "#f87171" : "#4ade80") : undefined}
          />
        )}
      </div>
    </Panel>
  );
}
