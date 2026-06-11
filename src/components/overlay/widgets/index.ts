import type { FC } from "react";
import type { OverlayId } from "@/lib/overlays";
import type { WidgetProps } from "./types";
import { TelemetryWidget } from "./TelemetryWidget";
import { StandingsWidget } from "./StandingsWidget";
import { RelativeWidget } from "./RelativeWidget";
import { FuelWidget } from "./FuelWidget";
import { TyresWidget } from "./TyresWidget";
import { DeltaWidget } from "./DeltaWidget";
import { WeatherWidget } from "./WeatherWidget";
import { FlagsWidget } from "./FlagsWidget";
import { TrackMapWidget } from "./TrackMapWidget";
import { DashboardWidget } from "./DashboardWidget";
import { RivalWidget } from "./RivalWidget";
import { SessionWidget } from "./SessionWidget";
import { EnduranceWidget } from "./EnduranceWidget";
import { DamageWidget } from "./DamageWidget";
import { SpeedWidget } from "./SpeedWidget";
import { LiftCoastWidget } from "./LiftCoastWidget";

export const WIDGETS: Record<OverlayId, FC<WidgetProps>> = {
  telemetry: TelemetryWidget,
  standings: StandingsWidget,
  relative: RelativeWidget,
  fuel: FuelWidget,
  tyres: TyresWidget,
  delta: DeltaWidget,
  weather: WeatherWidget,
  flags: FlagsWidget,
  trackmap: TrackMapWidget,
  dashboard: DashboardWidget,
  rival: RivalWidget,
  session: SessionWidget,
  endurance: EnduranceWidget,
  damage: DamageWidget,
  speed: SpeedWidget,
  liftcoast: LiftCoastWidget,
};
