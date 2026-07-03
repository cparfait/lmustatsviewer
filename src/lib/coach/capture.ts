/**
 * Capture d'une référence dense v2 à partir d'un tour bouclé (COACH-LIVE-SPEC.md
 * §3.1, P1.3). Module **pur** : `(CompletedLap, CaptureMeta) → CoachRefSavePayload`,
 * sans React ni Tauri, donc rejouable/testable comme le moteur (§14).
 *
 * Deux transformations :
 *  1. **Rééchantillonnage** des 8 canaux du tampon (échantillonné ~20 Hz, pas
 *     irrégulier) sur une **grille curviligne régulière** de pas `step_m` (4 m,
 *     §3.1) — c'est le schéma qu'attend le décodeur (`windows.refAt`).
 *  2. **Fenêtres `coach_corner`** : chaque virage auto-détecté devient une ligne
 *     avec un `corner_uid` déterministe (bucket d'apex) qui servira d'ancre
 *     d'identité aux tours live (appariement < 40 m côté moteur).
 *
 * L'éligibilité (§3.2) est décidée en amont par le moteur (`CompletedLap.eligibility`) ;
 * ce module ne construit la charge que pour un tour retenu.
 */

import type { CoachRefSavePayload, CoachCornerRow, LiveData } from "@/lib/api";
import { CHANNELS, assignUid, type LapBuffer, type DetectedCorner } from "./windows";
import type { CompletedLap } from "./engine";
import type { CoachFrame } from "./frame";

/** Pas de la grille dense (m) — 1 point / 4 m (§3.1). */
export const REF_STEP_M = 4;

/** Métadonnées d'une réf (§3.1) — snapshot des conditions au moment de la capture. */
export interface CaptureMeta {
  track: string;
  carModel: string;
  carClass: string;
  gameBuild: string;
  trackTemp: number;
  airTemp: number;
  /** Humidité de la trajectoire (0-1). */
  wetness: number;
  rain: number;
  compoundF: string;
  compoundR: string;
  fuelAtStart: number;
  tcMap: number;
  absMap: number;
  lapsSincePit: number;
}

/** Champ du tampon correspondant à un canal de la grille (ordre §3.1). */
function channelSeries(buf: LapBuffer, i: number): number[] {
  switch (CHANNELS[i]) {
    case "time":
      return buf.time;
    case "speed":
      return buf.speed;
    case "brake":
      return buf.brake;
    case "throttle":
      return buf.throttle;
    case "steer":
      return buf.steer;
    case "gLat":
      return buf.gLat;
    case "gLong":
      return buf.gLong;
    case "gear":
      return buf.gear;
    default:
      return buf.time;
  }
}

/**
 * Interpole une série `vals` (alignée sur `dist` monotone ↑) à la distance `d`.
 * Bornée aux extrémités (clamp) : hors du tampon, on répète le point de bord.
 */
function sampleAt(dist: number[], vals: number[], d: number): number {
  const n = dist.length;
  if (n === 0) return 0;
  if (d <= dist[0]) return vals[0];
  if (d >= dist[n - 1]) return vals[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dist[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  // `lo` = premier indice dont la distance ≥ d ; interpole [lo-1, lo].
  const i = Math.max(1, lo);
  const d0 = dist[i - 1];
  const d1 = dist[i];
  const f = d1 > d0 ? (d - d0) / (d1 - d0) : 0;
  return vals[i - 1] + (vals[i] - vals[i - 1]) * f;
}

/** Ligne `coach_corner` d'un virage détecté (cibles vitesse échantillonnées au tampon). */
function cornerRow(buf: LapBuffer, c: DetectedCorner): CoachCornerRow {
  return {
    corner_uid: assignUid(c.apexDist, []),
    n: c.n,
    entry_dist: c.entryDist,
    brake_dist: c.brakeDist,
    apex_dist: c.apexDist,
    exit_dist: c.exitDist,
    vmin: c.minSpeed,
    ventry: sampleAt(buf.dist, buf.speed, c.brakeDist),
    vexit: sampleAt(buf.dist, buf.speed, c.exitDist),
    // La sortie est déjà définie comme la reprise du plein gaz (windows.exitIndex).
    full_throttle_dist: c.exitDist,
  };
}

/**
 * Construit la charge d'enregistrement d'une réf à partir d'un tour bouclé.
 * Renvoie `null` si le tampon est trop court pour une grille exploitable.
 */
export function buildRefPayload(
  lap: CompletedLap,
  meta: CaptureMeta,
  kind: "best" | "ghost" = "best",
  stepM: number = REF_STEP_M,
): CoachRefSavePayload | null {
  const buf = lap.buf;
  const N = buf.dist.length;
  if (N < 2 || stepM <= 0) return null;
  const maxDist = buf.dist[N - 1];
  const nPoints = Math.floor(maxDist / stepM) + 1;
  if (nPoints < 2) return null;

  // Grille dense : 8 canaux à plat, `channels[c * nPoints + i]` (cf. windows.refAt).
  const channels = new Array<number>(CHANNELS.length * nPoints);
  for (let c = 0; c < CHANNELS.length; c++) {
    const series = channelSeries(buf, c);
    const base = c * nPoints;
    for (let i = 0; i < nPoints; i++) {
      channels[base + i] = sampleAt(buf.dist, series, i * stepM);
    }
  }

  const corners = lap.corners.map((c) => cornerRow(buf, c));

  const metaJson = JSON.stringify({
    trackTemp: meta.trackTemp,
    airTemp: meta.airTemp,
    wetness: meta.wetness,
    rain: meta.rain,
    compoundF: meta.compoundF,
    compoundR: meta.compoundR,
    fuelAtStart: meta.fuelAtStart,
    tcMap: meta.tcMap,
    absMap: meta.absMap,
    lapsSincePit: meta.lapsSincePit,
  });

  return {
    track: meta.track,
    car_model: meta.carModel,
    car_class: meta.carClass,
    kind,
    game_build: meta.gameBuild,
    lap_time: lap.lapTime,
    step_m: stepM,
    n_points: nPoints,
    meta_json: metaJson,
    channels,
    corners,
  };
}

/** Snapshot des conditions courantes pour les métadonnées de réf (§3.1). */
export function captureMetaFromLive(data: LiveData, frame: CoachFrame): CaptureMeta {
  const tel = data.telemetry;
  const w = data.weather;
  const me = data.standings.find((s) => s.is_player) ?? null;
  const ext = data.extended;
  return {
    track: frame.track,
    carModel: frame.carModel,
    carClass: frame.carClass,
    gameBuild: frame.gameBuild,
    trackTemp: w?.track_temp ?? 0,
    airTemp: w?.air_temp ?? 0,
    wetness: w?.path_wetness_avg ?? 0,
    rain: w?.rain ?? 0,
    compoundF: tel?.front_compound ?? "",
    compoundR: tel?.rear_compound ?? "",
    fuelAtStart: tel?.fuel ?? 0,
    tcMap: ext?.tc ?? 0,
    absMap: ext?.abs ?? 0,
    lapsSincePit: me?.num_pitstops ?? 0,
  };
}
