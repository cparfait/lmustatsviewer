/**
 * Trafic multiclasse sur la piste (module pur).
 *
 * L'ordre de course ne dit pas qui est physiquement devant : une GT3 à un tour
 * est « derrière » au classement mais juste devant le capot d'une Hypercar. On
 * travaille donc sur la **distance-tour** (`lap_dist`) de chaque voiture,
 * convertie en secondes au rythme du joueur.
 *
 *  - **Paquet anticipé** : les voitures de classe plus lente devant, projetées
 *    sur `HORIZON_LAPS` tours avec l'écart de rythme (meilleurs tours ; à défaut
 *    `PACE_GAIN_PER_RANK_S` par écart de classe). Un paquet = au moins
 *    `PACK_MIN` voitures rattrapées dans une même fenêtre de `PACK_SPREAD_S`.
 *  - **Plus rapide derrière** : la voiture de classe plus rapide la plus proche
 *    derrière, dans `FASTER_PREVIEW_S` — préavis avant le drapeau bleu.
 */

import type { LiveData, LiveStanding } from "@/lib/api";
import { classRelation, type ClassRel } from "@/lib/rival";

export const HORIZON_LAPS = 3;
export const PACK_MIN = 3;
export const PACK_SPREAD_S = 5;
export const FASTER_PREVIEW_S = 12;
/** Gain de rythme supposé par écart de classe quand les chronos manquent (s/tour). */
export const PACE_GAIN_PER_RANK_S = 5;
/** Rapprochement mini crédible (s/tour). */
export const MIN_CLOSING_S = 0.05;

export interface OnTrackCar {
  standing: LiveStanding;
  rel: ClassRel;
  /** Temps de piste jusqu'à elle, devant (s). */
  aheadS: number;
  /** Temps de piste depuis elle, derrière (s). */
  behindS: number;
}

export interface TrafficPack {
  count: number;
  /** Classe majoritaire (brute). */
  cls: string;
  /** Tours avant d'atteindre la première voiture du paquet (≥ 0). */
  laps: number;
}

const refLap = (s: LiveStanding) => (s.best_lap_time > 0 ? s.best_lap_time : s.last_lap_time > 0 ? s.last_lap_time : 0);

/** Voitures en piste avec leur écart physique au joueur (s). Vide si non calculable. */
export function onTrack(data: LiveData, myRefLapS: number): OnTrackCar[] {
  const L = data.session?.track_length ?? 0;
  const me = data.standings.find((s) => s.is_player);
  if (!me || L <= 0 || myRefLapS <= 0 || !(me.lap_dist >= 0)) return [];
  const out: OnTrackCar[] = [];
  for (const s of data.standings) {
    if (s.is_player || s.in_pits || !(s.lap_dist >= 0)) continue;
    const d = (((s.lap_dist - me.lap_dist) % L) + L) % L;
    out.push({
      standing: s,
      rel: classRelation(me.vehicle_class, s.vehicle_class),
      aheadS: (d / L) * myRefLapS,
      behindS: ((L - d) / L) * myRefLapS,
    });
  }
  return out;
}

/** Rapprochement (s/tour) sur une voiture plus lente, ou null si inconnu. */
export function closingOn(car: OnTrackCar, myRefLapS: number, rankGap: number): number {
  const theirs = refLap(car.standing);
  if (theirs > 0) return theirs - myRefLapS;
  return PACE_GAIN_PER_RANK_S * Math.max(1, rankGap);
}

/**
 * Prochain paquet de voitures plus lentes rattrapé dans l'horizon, ou null.
 * `rankGap(cls)` = écart de rang de classe (≥ 1) pour le repli sans chrono.
 */
export function slowerPackAhead(
  cars: OnTrackCar[],
  myRefLapS: number,
  rankGap: (cls: string) => number,
): TrafficPack | null {
  const reach = cars
    .filter((c) => c.rel === "slower")
    .map((c) => {
      const rate = closingOn(c, myRefLapS, rankGap(c.standing.vehicle_class));
      return { c, laps: rate >= MIN_CLOSING_S ? c.aheadS / rate : Infinity };
    })
    .filter((x) => x.laps <= HORIZON_LAPS)
    .sort((a, b) => a.c.aheadS - b.c.aheadS);
  if (reach.length < PACK_MIN) return null;
  // Première fenêtre de PACK_SPREAD_S (temps de piste) qui contient ≥ PACK_MIN voitures.
  for (let i = 0; i + PACK_MIN - 1 < reach.length; i++) {
    const start = reach[i].c.aheadS;
    const members = reach.filter((x) => x.c.aheadS >= start && x.c.aheadS - start <= PACK_SPREAD_S);
    if (members.length >= PACK_MIN) {
      const counts = new Map<string, number>();
      for (const m of members) {
        const k = m.c.standing.vehicle_class;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const cls = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return { count: members.length, cls, laps: Math.max(0, reach[i].laps) };
    }
  }
  return null;
}

/** Voiture plus lente la plus proche devant (pour la question « trafic »). */
export function nextSlowerAhead(cars: OnTrackCar[]): OnTrackCar | null {
  const slower = cars.filter((c) => c.rel === "slower").sort((a, b) => a.aheadS - b.aheadS);
  return slower[0] ?? null;
}

/** Voiture de classe plus rapide la plus proche derrière, dans le préavis. */
export function fasterBehind(cars: OnTrackCar[], previewS = FASTER_PREVIEW_S): OnTrackCar | null {
  const c = cars
    .filter((x) => x.rel === "faster" && x.behindS > 0 && x.behindS <= previewS)
    .sort((a, b) => a.behindS - b.behindS);
  return c[0] ?? null;
}
