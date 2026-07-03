/**
 * TierBadge — badge de niveau ohne_speed (Alien / Compétitif / Bon / Peloton …)
 *
 * Composant partagé utilisé dans Records, Sessions, SessionDetail et LapChartModal.
 * OHNE_CLASS est défini dans ohne_speed.ts et utilisé par Records, LapChartModal, etc.
 */

import { cn } from "@/lib/utils";
import { BADGE_BASE } from "./badgeBase";
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
    <span className={cn(BADGE_BASE, TIER_COLORS[tier])}>
      {TIER_LABELS[tier]}
    </span>
  );
}
