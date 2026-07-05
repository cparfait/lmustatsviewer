/**
 * Calculs de stratégie déterministes (source unique de vérité).
 *
 * Centralise l'estimation « tours restants de session » et le bilan carburant
 * pour finir, auparavant dupliqués (avec des règles divergentes) entre
 * `Live.tsx::computeFuelToFinish` et `ai/context/live-context.ts`. Consommé par
 * la page Live (KV + alertes vocales) et par le contexte du Coach IA — le LLM
 * reçoit ces chiffres calculés en code et ne doit PAS les recalculer.
 *
 * Conventions : conso = moyenne glissante 5 tours (backend `live.rs`) ; course
 * au temps = +1 tour pour le tour entamé au drapeau.
 */

import type { LiveData } from "@/lib/api";

export interface StrategySnapshot {
  /** Conso moyenne (L/tour, moyenne glissante 5 tours côté backend). */
  fuelPerLap: number;
  /** Autonomie courante en tours (carburant restant / conso). */
  fuelLapsRemaining: number;
  /** Tours restants de session (au tour ou estimés au temps) — null si inestimable. */
  sessionLapsLeft: number | null;
  /** Litres nécessaires pour finir la session — null si `sessionLapsLeft` null. */
  fuelNeeded: number | null;
  /** Litres à ajouter pour finir (négatif = marge restante) — null si inestimable. */
  fuelToAdd: number | null;
}

/**
 * Bilan stratégie depuis un snapshot live. `null` tant que la conso n'est pas
 * mesurée (< 2 franchissements de ligne) ou hors session.
 */
export function computeStrategy(
  sc: LiveData["session"],
  player: LiveData["player"],
  tel: LiveData["telemetry"],
): StrategySnapshot | null {
  if (!sc || !tel || tel.fuel_consumption <= 0) return null;

  // Tours restants : course au tour, sinon estimation au temps (+1 : tour
  // entamé au drapeau). max_laps >= 1000 = sentinelle « course au temps ».
  let sessionLapsLeft: number | null = null;
  if (sc.max_laps > 0 && sc.max_laps < 1000) {
    const left = sc.max_laps - (player?.total_laps ?? 0);
    if (left > 0) sessionLapsLeft = left;
  } else if (sc.end_et > 0 && sc.end_et > sc.session_time) {
    const lapTime =
      player && player.last_lap_time > 0
        ? player.last_lap_time
        : (player?.best_lap_time ?? 0);
    if (lapTime > 0) {
      sessionLapsLeft = Math.ceil((sc.end_et - sc.session_time) / lapTime) + 1;
    }
  }

  const fuelNeeded =
    sessionLapsLeft != null ? sessionLapsLeft * tel.fuel_consumption : null;
  return {
    fuelPerLap: tel.fuel_consumption,
    fuelLapsRemaining: tel.fuel_laps_remaining,
    sessionLapsLeft,
    fuelNeeded,
    fuelToAdd: fuelNeeded != null ? fuelNeeded - tel.fuel : null,
  };
}

/** Bilan « carburant pour finir » avec réserve (T13 #157). */
export interface FuelToEnd {
  /** Litres à ajouter pour finir **avec la réserve** ; ≤ 0 = suffisant. */
  toAdd: number;
  sufficient: boolean;
  /** Tours de marge au-delà du besoin exact (positif = surplus). */
  marginLaps: number;
}

/**
 * « Carburant pour finir » avec une **réserve** configurable (en tours), T13 #157.
 * `null` si les tours restants ou la conso ne sont pas connus.
 */
export function fuelToEnd(s: StrategySnapshot, reserveLaps: number): FuelToEnd | null {
  if (s.sessionLapsLeft == null || s.fuelToAdd == null || s.fuelPerLap <= 0) return null;
  const toAdd = s.fuelToAdd + Math.max(0, reserveLaps) * s.fuelPerLap;
  return {
    toAdd,
    sufficient: toAdd <= 0,
    marginLaps: -s.fuelToAdd / s.fuelPerLap,
  };
}

/**
 * Résumé compact (anglais) pour le contexte du Coach IA, sous le marqueur
 * `--- STRATEGY COMPUTER ---` : le prompt indique au modèle de faire confiance
 * à ces chiffres plutôt que de les déduire.
 */
export function strategyToText(s: StrategySnapshot): string {
  const lines: string[] = [];
  lines.push(
    `Avg consumption: ${s.fuelPerLap.toFixed(2)} L/lap · fuel range: ~${s.fuelLapsRemaining.toFixed(1)} laps`,
  );
  if (s.sessionLapsLeft != null) {
    lines.push(`Session laps remaining: ~${s.sessionLapsLeft}`);
  }
  if (s.fuelNeeded != null && s.fuelToAdd != null) {
    const excess = -s.fuelToAdd; // litres en trop (>0 = excédent embarqué)
    // Marge de sécurité « normale » = ~1 tour de conso (min 1 L).
    const safety = Math.max(s.fuelPerLap, 1);
    if (s.fuelToAdd > 0.05) {
      lines.push(
        `Verdict: FUEL SHORT — need ${s.fuelNeeded.toFixed(1)} L total, ADD ${s.fuelToAdd.toFixed(1)} L (or save fuel)`,
      );
    } else if (excess > safety * 2) {
      // Sur-remplissage notable : surpoids inutile → conseiller d'alléger.
      const couldDrop = excess - safety; // on garde ~1 tour de marge
      lines.push(
        `Verdict: OVER-FUELED — carrying ~${excess.toFixed(1)} L more than needed for the remaining ${s.sessionLapsLeft} laps. Recommend removing ~${couldDrop.toFixed(1)} L to save weight (keep ~1 lap safety margin). This is NOT "fine" — excess fuel = dead weight and lost lap time.`,
      );
    } else {
      lines.push(
        `Verdict: fuel sufficient to the end (healthy margin ${excess.toFixed(1)} L)`,
      );
    }
  }
  return lines.join("\n");
}
