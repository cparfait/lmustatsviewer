/**
 * Helpers de formatage de la page lecteur de télémétrie. Purs (pas de JSX) →
 * isolés des composants pour respecter la règle react-refresh.
 */

import { formatTime } from "@/lib/utils";

/** Libellé de rapport de boîte : N (neutre), R (marche arrière), n° sinon. */
export function gearLabel(g: number | undefined): string {
  if (g == null || !isFinite(g)) return "—";
  const r = Math.round(g);
  return r === 0 ? "N" : r < 0 ? "R" : String(r);
}

/** Formate une durée de tour/secteur (s → m:ss.mmm) ; « — » si ≤ 0. */
export function fmtLap(v: number | undefined): string {
  if (v == null || !isFinite(v) || v <= 0) return "—";
  return formatTime(v);
}

/** Formate un nombre + unité ; « — » si absent. */
export function fmtNum(v: number | undefined, dec: number, unit: string): string {
  if (v == null || !isFinite(v)) return "—";
  return `${v.toFixed(dec)} ${unit}`.trim();
}

/** Pa → kPa (pression turbo). */
export function divK(v: number | undefined): number | undefined {
  return v == null ? undefined : v / 1000;
}
