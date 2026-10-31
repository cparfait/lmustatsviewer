/**
 * Paliers de chrono : le **prochain repère** du pilote, tiré des meilleurs tours de la
 * communauté sur ce circuit et dans cette classe.
 *
 * Le niveau du pilote est la place de son meilleur tour parmi les meilleurs tours de
 * la classe (un par pilote, base communautaire). Les paliers vont du plus lent au plus
 * rapide (`TIER_ORDER` : p90 → p1) ; la **cible** est le premier palier plus rapide
 * que son meilleur tour d'au moins `TIER_MARGIN_S`. Quand il en passe un, l'ingénieur
 * le dit une fois, avec le chrono du suivant.
 *
 * Doctrine : les paliers servent au calcul, jamais à la parole. Ni centile, ni « top
 * 10 % », ni nombre de pilotes à la radio : on dit « le prochain repère » et un chrono.
 * Une base trop mince (classement non établi, moins de `TIER_MIN_DRIVERS` pilotes) ne
 * sert pas : jamais un repère inventé.
 */

import { community } from "@/lib/api";
import type { CommunityDetail } from "@/lib/api";
import { matchCombo, type ComboRef } from "@/lib/briefing";

/** Du plus lent au plus rapide. */
export const TIER_ORDER = ["p90", "p75", "p50", "p25", "p10", "p5", "p1"] as const;
export type TierKey = (typeof TIER_ORDER)[number];
/** Marge minimale entre le meilleur tour et le palier visé (s). */
export const TIER_MARGIN_S = 0.1;
/** Pilotes minimum dans la base pour que les paliers servent. */
export const TIER_MIN_DRIVERS = 10;

export interface PaceTier {
  key: TierKey;
  timeS: number;
}

/** Paliers utilisables d'un détail de combo, du plus lent au plus rapide ; null si trop mince. */
export function buildTiers(detail: Pick<CommunityDetail, "ranked" | "drivers" | "percentiles"> | null): PaceTier[] | null {
  if (!detail || !detail.ranked || detail.drivers < TIER_MIN_DRIVERS) return null;
  const out: PaceTier[] = [];
  let prev = Infinity;
  for (const key of TIER_ORDER) {
    const v = Number(detail.percentiles?.[key]);
    // Un palier doit être strictement plus rapide que le précédent (base cohérente).
    if (!(v > 0) || !isFinite(v) || v >= prev) continue;
    out.push({ key, timeS: v });
    prev = v;
  }
  return out.length ? out : null;
}

/** Le prochain repère : premier palier plus rapide que `bestS` d'au moins la marge, ou null (au sommet). */
export function nextTier(bestS: number, tiers: PaceTier[], marginS = TIER_MARGIN_S): PaceTier | null {
  if (!(bestS > 0)) return tiers[0] ?? null;
  return tiers.find((x) => x.timeS < bestS - marginS) ?? null;
}

/** Paliers franchis en passant de `prevBestS` à `newBestS` (vide sans meilleur tour d'avant). */
export function crossedTiers(prevBestS: number | null, newBestS: number, tiers: PaceTier[]): PaceTier[] {
  if (prevBestS == null || !(prevBestS > 0) || !(newBestS > 0) || newBestS >= prevBestS) return [];
  return tiers.filter((x) => prevBestS >= x.timeS && newBestS < x.timeS);
}

/** Charge les paliers du combo courant (piste sèche), ou null (hors ligne, combo inconnu, base mince). */
export async function loadPaceTiers(track: string, liveClass: string): Promise<PaceTier[] | null> {
  const pub = await community.get<{ combos: ComboRef[] }>("combos").catch(() => null);
  const c = pub ? matchCombo(pub.combos, track, liveClass) : null;
  if (!c) return null;
  const detail = await community
    .get<CommunityDetail>("combos/detail", { track: c.track, course: c.track_course, class: c.car_class, conditions: "dry" })
    .catch(() => null);
  return buildTiers(detail);
}
