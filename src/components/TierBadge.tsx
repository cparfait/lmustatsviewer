/**
 * TierBadge — badge de niveau ohne_speed (Alien / Compétitif / Bon / Peloton …)
 *
 * Composant partagé utilisé dans Records, Sessions, SessionDetail et LapChartModal.
 * OHNE_CLASS est défini dans ohne_speed.ts et utilisé par Records, LapChartModal, etc.
 */

import { cn } from "@/lib/utils";
import {
  findBenchmark,
  computeTier,
  TIER_LABELS,
  TIER_COLORS,
  OHNE_CLASS,
  type PaceBenchmark,
} from "@/lib/ohne_speed";


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
        // 9 px assumé : micro-pastille de donnée dense (colonne Tier des tableaux),
        // exemptée du plancher 10 px pour ne pas élargir la grille Sessions.
        "inline-flex items-center rounded-full border px-1 py-px text-nano font-medium whitespace-nowrap",
        TIER_COLORS[tier]
      )}
    >
      {TIER_LABELS[tier]}
    </span>
  );
}
