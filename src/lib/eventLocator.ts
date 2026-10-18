/**
 * Localisateur d'événements d'une session (page Détail + Coach IA) : rassemble ce qui
 * sert à situer une limite de piste dans le tour — heures de début des tours de chaque
 * pilote, tracé connu du circuit (bornes de secteurs, virages officiels), profil d'un
 * tour de télémétrie de la session s'il existe. Calcul : `trackLimitsLocate.ts`.
 */

import { tracks } from "@/lib/api";
import type { SessionDetail } from "@/lib/api";
import { officialCornerLabels } from "@/lib/trackCorners";
import { loadSessionLapProfile } from "@/lib/ai/context/session-telemetry";
import { locateInLap, type EventLocation, type LapTiming, type LocateRef } from "@/lib/trackLimitsLocate";

export type EventLocator = (driver: string, et: number, lapHint: number | null) => EventLocation | null;

/** Champ `Lap` d'un `<TrackLimits>` (tours bouclés) → numéro du tour en cours. */
export function trackLimitLap(raw: string | undefined): number | null {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n + 1 : null;
}

export async function loadEventLocator(detail: SessionDetail): Promise<EventLocator> {
  const s = detail.session;
  const course = s.track_course || s.track;
  const [outline, profile] = await Promise.all([
    tracks
      .outline(course)
      .then((o) => o ?? (s.track && s.track !== course ? tracks.outline(s.track) : null))
      .catch(() => null),
    loadSessionLapProfile(detail).catch(() => null),
  ]);

  const length = s.track_length > 0 ? s.track_length : outline ? outline.dists[outline.dists.length - 1] + 10 : 0;
  let corners: LocateRef["corners"];
  if (outline) {
    const labels = officialCornerLabels(course, outline.points, outline.dists);
    corners = labels
      .map((l) => ({ dist: outline.dists[l.idx], label: `T${l.n}${l.name ? ` ${l.name}` : ""}` }))
      .sort((a, b) => a.dist - b.dist);
  }

  const lapsBy = new Map<string, LapTiming[]>();
  for (const l of detail.laps) {
    const arr = lapsBy.get(l.driver_name) ?? [];
    arr.push(l);
    lapsBy.set(l.driver_name, arr);
  }
  const resultBy = new Map(detail.results.map((r) => [r.driver_name, r]));

  return (driver, et, lapHint) => {
    const r = resultBy.get(driver);
    const best: [number, number, number] | null =
      r?.best_lap_s1 && r.best_lap_s2 && r.best_lap_s3 ? [r.best_lap_s1, r.best_lap_s2, r.best_lap_s3] : null;
    return locateInLap(
      et,
      lapsBy.get(driver) ?? [],
      { length, s1: outline?.s1, s2: outline?.s2, corners, profile, bestSectors: best },
      r?.finish_time ?? null,
      lapHint,
    );
  };
}
