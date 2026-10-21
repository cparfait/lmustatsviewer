/**
 * Vigie de la plateforme (Atelier, opt-in) — module pur. Chaque tour propre est
 * comparé au **meilleur tour** du fichier sur six mesures (3ᵉ élément AV/AR,
 * hauteur mini, effort de frein AV/AR, G latéral maxi). Le bruit d'une mesure =
 * écart médian des tours au meilleur tour ; un tour n'est signalé que si son
 * écart dépasse ce bruit de 25 % ET vaut au moins 10 % de la valeur de
 * référence. Constat seulement, jamais de prescription.
 */

import type { LabLap } from "@/lib/api";

export type PlatformMetric = "front3rd" | "rear3rd" | "rideMin" | "brakeFront" | "brakeRear" | "latG";
export const PLATFORM_METRICS: PlatformMetric[] = ["front3rd", "rear3rd", "rideMin", "brakeFront", "brakeRear", "latG"];

export const NOISE_MARGIN = 1.25;
export const MIN_REL = 0.1;

export interface PlatformFlag {
  lap: number;
  metric: PlatformMetric;
  value: number;
  ref: number;
  /** Écart relatif signé (0,15 = +15 %). */
  rel: number;
}

export function metricOf(l: LabLap, m: PlatformMetric): number | null {
  switch (m) {
    case "front3rd":
      return l.front_3rd_max;
    case "rear3rd":
      return l.rear_3rd_max;
    case "rideMin": {
      const v = l.ride_min.filter((x): x is number => x != null);
      return v.length ? Math.min(...v) : null;
    }
    case "brakeFront":
      return l.brake_front_max;
    case "brakeRear":
      return l.brake_rear_max;
    case "latG":
      return l.lat_g_max;
  }
}

function median(v: number[]): number {
  const a = [...v].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function platformWatch(laps: LabLap[]): { bestLap: number | null; flags: PlatformFlag[] } {
  const clean = laps.filter((l) => l.clean && l.duration > 0);
  if (clean.length < 3) return { bestLap: null, flags: [] };
  const best = clean.reduce((a, b) => (b.duration < a.duration ? b : a));
  const flags: PlatformFlag[] = [];
  for (const m of PLATFORM_METRICS) {
    const ref = metricOf(best, m);
    if (ref == null || ref === 0) continue;
    const others = clean.filter((l) => l !== best).map((l) => ({ l, v: metricOf(l, m) })).filter((x): x is { l: LabLap; v: number } => x.v != null);
    if (others.length < 2) continue;
    const noise = median(others.map((x) => Math.abs(x.v - ref)));
    for (const { l, v } of others) {
      const d = Math.abs(v - ref);
      if (d > noise * NOISE_MARGIN && d >= Math.abs(ref) * MIN_REL) flags.push({ lap: l.lap, metric: m, value: v, ref, rel: (v - ref) / Math.abs(ref) });
    }
  }
  flags.sort((a, b) => a.lap - b.lap || Math.abs(b.rel) - Math.abs(a.rel));
  return { bestLap: best.lap, flags };
}
