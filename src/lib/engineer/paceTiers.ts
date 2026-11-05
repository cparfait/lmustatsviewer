/**
 * Paliers de chrono : le **prochain repère** du pilote, tiré des meilleurs tours de la
 * communauté sur ce circuit et dans cette classe.
 *
 * Le niveau du pilote est la place de son meilleur tour parmi les meilleurs tours de
 * la classe (un par pilote, base communautaire). Les paliers vont du plus lent au plus
 * rapide (`TIER_ORDER` : p90 → p1) ; la **cible** est le premier palier plus rapide
 * que son meilleur tour d'au moins `TIER_MARGIN_S`. Quand il en passe un, l'ingénieur
 * le dit une fois, avec le chrono du suivant. « Une fois » vaut au-delà de la séance : le
 * meilleur tour de la voiture repart de zéro à chaque session, la mémoire de l'appelant non.
 *
 * Doctrine : les paliers servent au calcul, jamais à la parole. Ni centile, ni « top
 * 10 % », ni nombre de pilotes à la radio : on dit « le prochain repère » et un chrono.
 * Une base trop mince (classement non établi, moins de `TIER_MIN_DRIVERS` pilotes) ne
 * sert pas : jamais un repère inventé.
 */

import { community } from "@/lib/api";
import type { CommunityDetail, CommunityRoute } from "@/lib/api";
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

/**
 * Paliers passés et prochain repère, d'après le meilleur tour déjà vu sur ce combo toutes
 * séances confondues (`seenBest`, `null` si aucun) : un palier déjà battu n'est ni redit
 * ni reproposé comme cible quand la séance repart de zéro.
 */
export function tierProgress(
  seenBest: number | null,
  best: number,
  tiers: PaceTier[],
): { crossed: PaceTier[]; next: PaceTier | null } {
  const ref = seenBest != null && seenBest > 0 && seenBest < best ? seenBest : best;
  return { crossed: crossedTiers(seenBest, best, tiers), next: nextTier(ref, tiers) };
}

/** Échec de chargement des paliers : combo visé et prochain essai permis. */
export interface TierRetry {
  key: string;
  at: number;
  attempts: number;
}

/** Délai avant de retenter après `attempts` échecs (ms) : 1 min, puis doublé, 10 min au plus. */
export function tierRetryDelayMs(attempts: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 600_000);
}

/** Faut-il charger les paliers de `wanted` ? Jamais à chaque trame après un échec. */
export function tierLoadDue(wanted: string, loaded: string, retry: TierRetry | null, nowMs: number): boolean {
  if (wanted === loaded) return false;
  return !retry || retry.key !== wanted || nowMs >= retry.at;
}

type CommunityGet = <T>(route: CommunityRoute, query?: Record<string, string | number>) => Promise<T | null>;

/**
 * Charge les paliers du combo courant (piste sèche), ou null (combo inconnu, base mince :
 * une réponse, à ne pas redemander). Un échec réseau **rejette** : l'appelant retentera.
 */
export async function loadPaceTiers(
  track: string,
  liveClass: string,
  get: CommunityGet = community.get,
): Promise<PaceTier[] | null> {
  const pub = await get<{ combos: ComboRef[] }>("combos");
  const c = pub ? matchCombo(pub.combos, track, liveClass) : null;
  if (!c) return null;
  const detail = await get<CommunityDetail>("combos/detail", {
    track: c.track,
    course: c.track_course,
    class: c.car_class,
    conditions: "dry",
  });
  return buildTiers(detail);
}
