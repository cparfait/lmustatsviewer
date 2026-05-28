/**
 * TierBadge — badge de niveau ohne_speed (Alien / Compétitif / Bon / Peloton …)
 *
 * Composant partagé utilisé dans Records, Sessions, SessionDetail et LapChartModal.
 * OHNE_CLASS est exporté pour permettre la recherche de benchmark dans LapChartModal.
 */

import { cn } from "@/lib/utils";
import {
  findBenchmark,
  computeTier,
  TIER_LABELS,
  TIER_COLORS,
  type PaceBenchmark,
} from "@/lib/ohne_speed";

/** Mapping classe interne (DB) → classe ohne_speed. */
export const OHNE_CLASS: Record<string, string> = {
  Hyper: "Hypercar",
  Hypercar: "Hypercar",
  "LMP2 ELMS": "LMP2_ELMS",
  LMP2: "LMP2_WEC",
  "LMP2 WEC": "LMP2_WEC",
  LMP3: "LMP3",
  GT3: "GT3",
  GTE: "GTE",
};

/**
 * Affiche le badge de niveau ohne_speed pour un temps au tour donné.
 *
 * @param lapSeconds - Temps en secondes (format DB). null → badge masqué.
 * @param layout     - Nom de la variante de tracé (optionnel).
 */
export function TierBadge({
  benchmarks,
  track,
  layout,
  carClass,
  lapSeconds,
}: {
  benchmarks: PaceBenchmark[] | null;
  track: string;
  layout?: string;
  carClass: string;
  lapSeconds: number | null;
}) {
  const muted = <span className="text-muted-foreground/40">—</span>;
  if (!benchmarks || benchmarks.length === 0) return muted;
  if (!lapSeconds || lapSeconds <= 0) return muted;
  const ohneClass = OHNE_CLASS[carClass];
  if (!ohneClass) return muted;
  const bm = findBenchmark(benchmarks, track, ohneClass, layout);
  if (!bm) return muted;
  const { tier } = computeTier(lapSeconds * 1000, bm);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap",
        TIER_COLORS[tier]
      )}
    >
      {TIER_LABELS[tier]}
    </span>
  );
}
