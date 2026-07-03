/**
 * Cible « alien » de l'overlay live : ancre la comparaison sur un rythme
 * communautaire (ohne_speed) par circuit × classe, pas seulement sur tes propres
 * tours. Réutilise `fetchBenchmarks` / `findBenchmark` déjà présents dans l'app.
 *
 * Limite assumée : ohne_speed ne fournit qu'un TEMPS au tour (pas de trace par
 * virage). On expose donc une cible absolue + ton écart — le détail par virage,
 * lui, reste self (cf. `useLiveDelta`).
 *
 * Le tier cible est choisi dans la Config (clé `overlay_target_tier`). Lu une
 * fois : la fenêtre overlay est (ré)ouverte par session, le réglage est posé
 * avant de rouler.
 */

import { useEffect, useState } from "react";
import { config, type LiveData } from "@/lib/api";
import {
  fetchBenchmarks,
  findBenchmark,
  liveClassToOhne,
  type PaceBenchmark,
} from "@/lib/ohne_speed";

const TIER_KEYS = [
  "alien",
  "competitive",
  "good",
  "midpack",
  "tailEnder",
  "offline",
] as const;
export type TierKey = (typeof TIER_KEYS)[number];

export interface AlienTarget {
  tier: TierKey;
  /** Temps cible (ms). */
  targetMs: number;
  /** Voiture la plus rapide de la classe (info). */
  fastestCar: string;
  /** Écart de ton meilleur tour de session à la cible (s) ; `null` si pas de best. */
  gapToTargetS: number | null;
}

export function useAlienTarget(data: LiveData | null): AlienTarget | null {
  const [tier, setTier] = useState<TierKey>("competitive");
  const [benchmarks, setBenchmarks] = useState<PaceBenchmark[] | null>(null);

  // Tier cible (Config). Lu une fois au montage.
  useEffect(() => {
    let alive = true;
    config
      .get("overlay_target_tier")
      .then((v) => {
        if (alive && v && (TIER_KEYS as readonly string[]).includes(v)) {
          setTier(v as TierKey);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Benchmarks ohne_speed (best-effort ; cache au niveau module).
  useEffect(() => {
    let alive = true;
    fetchBenchmarks()
      .then((b) => {
        if (alive) setBenchmarks(b);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!benchmarks || !data?.session || !data.player) return null;
  const me = data.standings.find((s) => s.is_player) ?? null;
  const ohneClass = liveClassToOhne(me?.vehicle_class ?? "");
  if (!ohneClass) return null;
  const bm = findBenchmark(benchmarks, data.session.track, ohneClass);
  if (!bm) return null;
  const targetMs = bm.racePaceMs[tier];
  if (!targetMs) return null;
  const best = data.player.best_lap_time;
  return {
    tier,
    targetMs,
    fastestCar: bm.fastestCar,
    gapToTargetS: best && best > 0 ? best - targetMs / 1000 : null,
  };
}
