/**
 * Suite « contexte post-course » : unités (carburant en % du réservoir, longueur de
 * piste en km, pas de limite de tours), régularité sur les tours propres, limites de
 * piste / contacts, télémétrie retrouvée pour la session, référence communautaire.
 */

import { section, eq, ok } from "../assert";
import { buildPostRaceContext, buildPlayerEventsText } from "@/lib/ai/context/postrace-context";
import { parseTelemetryFilename, pickSessionTelemetry, sessionLetter } from "@/lib/ai/context/session-telemetry";
import { summarizeCommunityReference } from "@/lib/ai/context/community-context";
import type { SessionDetail, TelemetryFileInfo } from "@/lib/api";
import { locateInLap, describeLocation, nearestCorner } from "@/lib/trackLimitsLocate";
import { trackLimitLap } from "@/lib/eventLocator";

const lap = (n: number, t: number | null, o: { valid?: boolean; used?: number; fuel?: number } = {}) => ({
  driver_name: "Cris Tof",
  lap_num: n,
  position: 1,
  lap_time: t,
  s1: t ? 39.4 : null,
  s2: t ? 66.2 : null,
  s3: t ? t - 105.6 : null,
  top_speed: 257,
  fuel: o.fuel ?? 0.7,
  fuel_used: o.used ?? 0.026,
  twfl: 0.93,
  twfr: 0.93,
  twrl: 0.96,
  twrr: 0.96,
  fcompound: "0,Medium",
  rcompound: "0,Medium",
  is_pit: false,
  is_valid: o.valid ?? true,
});

function detail(laps: ReturnType<typeof lap>[]): SessionDetail {
  return {
    session: {
      id: 1,
      event_id: 1,
      session_type: "Race",
      timestamp: 1784000000,
      track: "Circuit de Spa-Francorchamps",
      track_course: "Circuit de Spa-Francorchamps",
      track_event: "",
      setting: "",
      game_version: "1.42",
      participants: 38,
      session_laps: 2147483647,
      session_minutes: 10,
      track_length: 6981.6,
      race_time: 600,
      mech_fail_rate: 0,
      damage_mult: 100,
      fuel_mult: 1,
      tire_mult: 1,
      vehicles_allowed: "",
      filename: "",
      server_name: "",
    },
    siblings: [],
    results: [
      {
        is_player: true,
        driver_name: "Cris Tof",
        car_class: "GT3",
        unique_car_name: "BMW M4 LMGT3",
        car_type: "BMW M4 LMGT3",
        position: 26,
        class_position: 1,
        grid_pos: 30,
        class_grid_pos: 11,
        laps_count: 5,
        laps_led: 0,
        finish_status: "Finished Normally",
        pitstops: 0,
        best_lap: 146.707,
        best_lap_s1: 39.39,
        best_lap_s2: 66.237,
        best_lap_s3: 41.08,
        abs_best_s1: 39.39,
        abs_best_s2: 66.237,
        abs_best_s3: 41.08,
        optimal_lap: 146.707,
        vmax: 257.6,
        progression: 10,
        total_laps_valid: 2,
        start_fuel: 73.3,
        finish_fuel: 60.4,
        median_lap: 155.239,
        std_dev: 8.532,
        avg_best_5: 155.239,
      },
    ],
    laps,
    stream: [
      { event_type: "TrackLimits", et: 312.4, text: "2|0|1|Cris Tof|Invalid Lap Off Track" },
      { event_type: "TrackLimits", et: 320.1, text: "2|0|1|Someone|Invalid Lap Off Track" },
      { event_type: "Incident", et: 63.6, text: "Cris Tof(0) reported contact (174.97) with Immovable" },
      { event_type: "Incident", et: 70.2, text: "Other Guy(3) reported contact (40.10) with vehicle Cris Tof(0)" },
    ],
  } as unknown as SessionDetail;
}

const tFile = (filename: string, o: Partial<TelemetryFileInfo> = {}): TelemetryFileInfo => ({
  path: `C:/T/${filename}`,
  filename,
  track: "Sebring International Raceway",
  track_layout: "",
  car_name: "",
  car_model: "BMW M4 LMGT3",
  car_class: "GT3",
  session_type: "",
  driver: "",
  weather: "",
  recording_time: "",
  size_bytes: 1000,
  mtime: 0,
  best_lap: null,
  ...o,
});

export function run(): void {
  section("post-course — unités et régularité");
  const few = buildPostRaceContext(detail([lap(1, 163.771), lap(2, null, { valid: false }), lap(4, 146.707)])).text;
  ok(few.includes("Track length: 6.982 km"), "longueur en km (mètres / 1000)");
  ok(few.includes("10 min (no lap limit)"), "INT_MAX tours = pas de limite");
  ok(few.includes("start 73.3% → finish 60.4%"), "carburant en % du réservoir");
  ok(!/\d\.\dL\b/.test(few), "plus aucun « L » de litres");
  ok(few.includes("fuel 70.0% (used 2.6%)"), "niveau et conso par tour en %");
  ok(few.includes("≈ 38 laps per full tank"), "autonomie estimée");
  ok(few.includes("too few for consistency stats"), "2 tours valides : pas de régularité");
  ok(few.includes("Tyre compound(s) used: Medium"), "gomme lue");
  ok(few.includes("no recording found for this session"), "télémétrie absente signalée");
  const many = buildPostRaceContext(
    detail([lap(1, 163.7), lap(2, 147.1), lap(3, 147.3), lap(4, 146.7), lap(5, 147.0)]),
  ).text;
  ok(many.includes("Clean-lap pace (4 valid laps"), "tour de départ (> 107 %) écarté");

  section("post-course — limites de piste et contacts");
  const ev = buildPlayerEventsText(detail([]).stream, "Cris Tof");
  ok(ev.includes("Track-limit events: 1"), "seules les limites du joueur");
  ok(ev.includes("L3 at 5:12.4: Invalid Lap Off Track · points 1"), "champ Lap = tours bouclés → tour 3");
  ok(ev.includes("Contacts: 2 (1 with walls/barriers, 1 with cars"), "contacts mur / voiture");
  ok(ev.includes("with Other Guy"), "contact subi : l'autre pilote est nommé");
  eq(buildPlayerEventsText([], "Cris Tof"), "", "rien → section absente");

  section("post-course — limite de piste située dans le tour");
  eq(trackLimitLap("0"), 1, "0 tour bouclé → 1er tour");
  eq(trackLimitLap("x"), null, "champ illisible → rien");
  // Course réelle (Spa GT3, 21/07/2026) : débuts de tour lus dans le fichier.
  const spa = [
    { lap_num: 1, et: 70.48, lap_time: 163.771, s1: 52.126, s2: 70.002 },
    { lap_num: 2, et: 234.2532, lap_time: null, s1: 40.3256, s2: null },
    { lap_num: 3, et: 381.2225, lap_time: null, s1: null, s2: null },
    { lap_num: 4, et: 530.3024, lap_time: 146.707, s1: 39.3898, s2: 66.2374 },
    { lap_num: 5, et: 677.0093, lap_time: null, s1: 39.7083, s2: null },
  ];
  const ref = {
    length: 7000,
    s1: 2000,
    s2: 4500,
    corners: [
      { dist: 400, label: "T1 La Source" },
      { dist: 1400, label: "T4 Raidillon" },
      { dist: 3000, label: "T10 Pouhon" },
      { dist: 6800, label: "T19 Bus Stop" },
    ],
    bestSectors: [39.3898, 66.2374, 41.0797] as [number, number, number],
  };
  const l3 = locateInLap(409.4, spa, ref, 754.69, 3);
  eq(l3?.lap, 3, "heure 409,4 s → tour 3 (débuté à 381,2 s)");
  eq(l3?.sector, 1, "28 s dans un tour sans secteurs → S1 (secteurs du meilleur tour à l'échelle)");
  eq(l3?.corner, "T4 Raidillon", "≈ 1,4 km → Raidillon");
  ok(describeLocation(l3).startsWith("near T4 Raidillon (S1"), "texte pour le coach");
  const l4 = locateInLap(530.3 + 39.39 + 30, spa, ref, 754.69, null);
  eq(l4?.sector, 2, "30 s dans S2 du tour 4");
  eq(l4?.method, "sectors", "bornes de secteurs du tracé");
  const prof = {
    time: Array.from({ length: 30 }, (_, i) => (i * 146.7) / 29),
    dist: Array.from({ length: 30 }, (_, i) => (i * 7000) / 29),
  };
  const lp = locateInLap(530.3 + 39.39 + 30, spa, { ...ref, profile: prof }, 754.69, null);
  eq(lp?.method, "telemetry", "profil de télémétrie utilisé");
  eq(locateInLap(10, spa, ref, null, 1)?.lap, 1, "avant le 1er début de tour connu → tour du fichier");
  eq(locateInLap(409.4, spa, { length: 7000 }, 754.69, 3)?.method, "lap", "sans tracé : au prorata du tour");
  eq(locateInLap(409.4, spa, { length: 7000 }, 754.69, 3)?.corner, null, "au prorata : pas de virage nommé");
  eq(nearestCorner(ref.corners, 6990, 7000), "T19 Bus Stop", "tour fermé : la fin rejoint le début");
  const located = buildPlayerEventsText(
    [{ event_type: "TrackLimits", et: 409.4, text: "2|0.5|0.75|Cris Tof|Warning" }],
    "Cris Tof",
    (_d, et, hint) => locateInLap(et, spa, ref, 754.69, hint),
  );
  ok(located.includes("L3 at 6:49.4 — near T4 Raidillon"), "événement situé dans le texte du coach");
  ok(located.includes("ESTIMATED"), "estimation signalée au coach");

  section("post-course — télémétrie de la session");
  eq(sessionLetter("Qualify"), "Q", "Qualify → Q");
  eq(parseTelemetryFilename("Sebring International Raceway_R_2026-06-08T19_22_02Z.duckdb")?.start, Date.UTC(2026, 5, 8, 19, 22, 2) / 1000, "début UTC lu");
  const ts = Date.UTC(2026, 5, 8, 19, 1, 25) / 1000;
  const files = [
    tFile("Sebring International Raceway_Q_2026-06-08T19_05_00Z.duckdb"),
    tFile("Sebring International Raceway_R_2026-06-08T19_22_02Z.duckdb", { best_lap: 130.9 }),
    tFile("Sebring International Raceway_R_2026-06-08T19_23_48Z.duckdb", { best_lap: 128.41 }),
    tFile("Sebring International Raceway_R_2026-06-09T19_23_48Z.duckdb", { best_lap: 128.4 }),
  ];
  const pick = (car: string) =>
    pickSessionTelemetry(files, { track: "Sebring International Raceway", session_type: "Race", timestamp: ts, car, best_lap: 128.4 });
  eq(pick("BMW M4 LMGT3")?.filename, "Sebring International Raceway_R_2026-06-08T19_23_48Z.duckdb", "même course, meilleur tour le plus proche");
  eq(pick("Ferrari 296 LMGT3"), null, "autre voiture → rien");

  section("post-course — référence communautaire");
  const row = (rank: number, time: number, tag: string, car = "Porsche 911 GT3 R LMGT3") => ({
    rank,
    driver: { name: null, tag, homonym: false },
    car_model: car,
    time,
    s1: 38 + rank * 0.1,
    s2: 64 + rank * 0.2,
    s3: time - 102 - rank * 0.3,
  });
  const txt = summarizeCommunityReference({
    best: 146.707,
    mine: [39.39, 66.237, 41.08],
    car: "BMW M4 LMGT3",
    pos: { version: "1.42", drivers: 30, rank: 4, top_pct: 14, gap_best: 3.2, gap_median: -1.5 },
    rows: [row(1, 143.5, "#0001", "BMW M4 LMGT3"), row(2, 144.9, "#0002"), row(3, 146.0, "#0003"), row(4, 146.707, "#me00")],
    ownTag: "#me00",
  });
  ok(txt.includes("rank 4/30 (top 14%)"), "rang et percentile");
  ok(txt.includes("avg of the 3 driver(s) just ahead"), "palier : pilotes devant, sa ligne exclue");
  ok(/biggest: S\d/.test(txt), "secteur où gagner le plus");
  ok(txt.includes("Best with the same car (BMW M4 LMGT3): 2:23.500"), "même voiture");
}
