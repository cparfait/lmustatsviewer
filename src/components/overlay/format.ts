/**
 * Helpers de formatage/calcul pour les overlays.
 *
 * Logique alignée sur `routes/Live.tsx` (lui-même fidèle à la V1, *règle d'or*
 * de CLAUDE.md) : on reprend les mêmes calculs (carburant, classes, chronos)
 * pour garantir la parité d'affichage entre la page Live et les overlays.
 */

import type { LiveData } from "@/lib/api";
import type { Tr } from "@/i18n";
import { CAR_CLASS_COLORS } from "@/lib/staticData";
import { computeStrategy } from "@/lib/strategy";

/** Étiquettes de position des roues, localisées (ordre rF2 : FL, FR, RL, RR). */
export function wheelLabels(t: Tr): [string, string, string, string] {
  return [
    t("overlays.wheels.fl"),
    t("overlays.wheels.fr"),
    t("overlays.wheels.rl"),
    t("overlays.wheels.rr"),
  ];
}

/** Chrono « M:SS.mmm » (— si invalide). */
export function fmtLap(s: number): string {
  if (!s || s <= 0 || !isFinite(s)) return "—:——.———";
  // Arrondir au ms avant de répartir min/sec (évite "1:60.000", cf. formatTime).
  const totalMs = Math.round(s * 1000);
  const m = Math.floor(totalMs / 60000);
  const sec = (totalMs % 60000) / 1000;
  return `${m}:${sec.toFixed(3).padStart(6, "0")}`;
}

/** Écart signé « +1.234 » / « -0.456 ». */
export function fmtDelta(s: number): string {
  if (!isFinite(s) || s === 0) return "0.000";
  const sign = s > 0 ? "+" : "-";
  return `${sign}${Math.abs(s).toFixed(3)}`;
}

/** Secteur « 12.345 » (— si invalide). */
export function fmtSec(s: number): string {
  if (!s || s <= 0 || !isFinite(s)) return "—.———";
  return s.toFixed(3);
}

/** Normalise le nom de classe brut LMU vers la clé interne (palette commune). */
export function liveClassKey(vehicleClass: string): string {
  const c = vehicleClass.toLowerCase();
  if (c.includes("hyper") || c.includes("lmh") || c.includes("lmdh"))
    return "Hypercar";
  if (c.includes("gt3") || c.includes("lmgt3")) return "GT3";
  if (c.includes("gte")) return "GTE";
  if (c.includes("p3")) return "LMP3";
  if (c.includes("p2")) return "LMP2_WEC";
  return vehicleClass;
}

/** Couleur d'accent de la classe (ou null). */
export function liveClassColor(vehicleClass: string): string | null {
  return CAR_CLASS_COLORS[liveClassKey(vehicleClass)]?.color ?? null;
}

/**
 * Estimation « carburant pour finir ».
 * Délègue à `computeStrategy` (source unique de vérité, cf. lib/strategy.ts)
 * pour garantir la parité EXACTE avec la page Live et le Coach IA — auparavant
 * dupliquée ici et sujette à divergence. Renvoie null si non calculable.
 */
export function computeFuelToFinish(
  sc: LiveData["session"],
  player: LiveData["player"],
  tel: LiveData["telemetry"],
): { lapsLeft: number; fuelNeeded: number; fuelToAdd: number } | null {
  const s = computeStrategy(sc, player, tel);
  if (!s || s.sessionLapsLeft == null || s.fuelNeeded == null || s.fuelToAdd == null)
    return null;
  return {
    lapsLeft: s.sessionLapsLeft,
    fuelNeeded: s.fuelNeeded,
    fuelToAdd: s.fuelToAdd,
  };
}
