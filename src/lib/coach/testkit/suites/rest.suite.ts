/**
 * Suite « pont REST du jeu » : garde-fous (conso, durée de séance), prévision
 * du jeu prioritaire, usure des plaquettes, perte au stand, géométrie des cartes.
 * Les formes de données reprennent les relevés réels du 15/10/2026 (Hypercar,
 * Road Atlanta, essais de 6 h).
 */

import { section, ok, eq, approx } from "../assert";
import {
  aeroDamage,
  brakePads,
  effectivePitLoss,
  enrichLive,
  gameForecast,
  garageBoundsText,
  guardPerLap,
  keepPlannedStop,
  laneLossFrom,
  PadWearTracker,
  restSessionEnd,
  restStatus,
} from "@/lib/lmuRest";
import { fromGameNodes, pickForecast } from "@/lib/engineer/forecast";
import { AlertLatch } from "@/lib/engineer/alertLatch";
import { route } from "@/lib/engineer/router";
import { coverage, mapComplete, nearestIndex, pathOfRuns, sectorOf, sectorPolylines, splitRuns } from "@/lib/trackMapGeom";
import { isSetupQuestion } from "@/lib/ai/context/records-context";
import type { LiveData, LmuRestLive, RestField, RestPitScreen, RestSessionInfo, RestVehicle, RestWeekendWeather } from "@/lib/api";

const field = <T,>(data: T | null, state: RestField<T>["state"] = "fresh"): RestField<T> => ({
  state,
  age_ms: data ? 500 : null,
  data,
});

const vehicle: RestVehicle = {
  fuel: 91,
  fuel_capacity: 115,
  brake_condition: [0.9999, 0.9999, 0.9999, 0.9999],
  tire_condition: [1, 1, 1, 1],
  suspension_damage: [0, 0, 0, 0],
  vehicle_damage: 0,
};

const pit = (o: Partial<RestPitScreen> = {}): RestPitScreen => ({
  energy_table: [],
  fuel_table: [],
  energy_per_lap: 0.0253,
  fuel_per_lap: null,
  pit_stop_length_s: 0,
  current_fuel: 91,
  max_fuel: 115,
  energy_fraction: 1,
  forecast: [18, 18, 18, 19, 20].map((t, i) => ({ rain_chance: [0, 0, 60, 80, 10][i], temperature: t, sky: 1, humidity: 55 })),
  place_in_class: 1,
  place_overall: 1,
  gap_to_class_leader_s: 0,
  gap_to_class_leader_laps: 0,
  aero_damage: 0,
  brake_wear: [0.038, 0.038, 0.032, 0.032],
  suspension_wear: [0, 0, 0, 0],
  tire_wear: [1, 1, 1, 1],
  pit_menu: [],
  ...o,
});

// Relevé réel : séance de 6 h, startEventTime 5, endEventTime 600 (piège).
const sessionInfo: RestSessionInfo = {
  session: "PRACTICE1",
  game_phase: 5,
  current_event_time: 11.4,
  start_event_time: 5,
  end_event_time: 600,
  max_time: 21600,
  maximum_laps: 4294967295,
  time_remaining_in_phase: 21594.5,
  race_completion: 0.0003,
  track_name: "Michelin Raceway Road Atlanta",
};

const rest = (o: Partial<LmuRestLive> = {}): LmuRestLive => ({
  reachable: true,
  backoff_s: 0,
  vehicle: field(vehicle),
  pit: field(pit()),
  session: field(sessionInfo),
  weather: field<RestWeekendWeather>(null, "absent"),
  garage_state: "fresh",
  ...o,
});

const live = (o: Partial<LiveData> = {}): LiveData =>
  ({
    connected: true,
    paused: false,
    telemetry: { fuel: 50, fuel_consumption: 0, fuel_laps_remaining: 0, fuel_capacity: 115 },
    player: null,
    session: { track: "Michelin Raceway Road Atlanta", session: 1, session_time: 12, end_et: 0, max_laps: 2147483647, num_vehicles: 54, track_length: 4083, game_phase: 5 },
    standings: [],
    weather: { air_temp: 18, track_temp: 25, wind_speed: 0, wind_dir_deg: 0, rain: 0, path_wetness_avg: 0, path_wetness_max: 0 },
    flags: null,
    extended: null,
    track_layout: null,
    track_points: [],
    track_dists: [],
    rest: rest(),
    ...o,
  }) as unknown as LiveData;

export function run(): void {
  section("lmuRest.guardPerLap");
  eq(guardPerLap(3.1, 3.0), { perLap: 3.1, source: "measured" }, "mesure cohérente : elle prime");
  eq(guardPerLap(6.5, 3.0), { perLap: 3.0, source: "game" }, "mesure aberrante (+117 %) : valeur du jeu");
  eq(guardPerLap(0, 3.0), { perLap: 3.0, source: "game" }, "avant toute mesure : valeur du jeu");
  eq(guardPerLap(2.9, null), { perLap: 2.9, source: "measured" }, "jeu muet : mesure seule");
  eq(guardPerLap(0, null), null, "rien : null");

  section("lmuRest.restSessionEnd (relevé réel)");
  eq(restSessionEnd(rest(), 12), 21605, "fin = startEventTime + maxTime (pas endEventTime)");
  eq(restSessionEnd(rest(), 500), null, "horloges divergentes (autre séance) : ignoré");
  eq(restSessionEnd(rest({ session: field(sessionInfo, "stale") }), 12), null, "périmé : ignoré");
  eq(restSessionEnd(rest({ session: field({ ...sessionInfo, maximum_laps: 20 }) }), 12), null, "course au tour : ignoré");
  {
    // Relevé réel 2026-10-16, course de 10 min : formation puis vert à 105 s.
    const race = { ...sessionInfo, session: "RACE1", max_time: 600, start_event_time: 0, time_remaining_in_phase: -1 };
    eq(restSessionEnd(rest({ session: field({ ...race, game_phase: 3, current_event_time: 78 }) }), 78), 678, "formation : toute la durée reste (pas 0 + maxTime)");
    eq(
      restSessionEnd(rest({ session: field({ ...race, game_phase: 5, current_event_time: 164, start_event_time: 104.9 }) }), 164),
      704.9,
      "après le vert : départ + maxTime",
    );
  }

  section("lmuRest.enrichLive");
  {
    const d = enrichLive(live({ rest: rest({ pit: field(pit({ fuel_per_lap: 3.2 })) }) }));
    eq(d.session!.end_et, 21605, "durée de séance connue sans mEndET");
    eq(d.rest_used, { fuel: "game", sessionEnd: "game" }, "sources signalées");
    approx(d.telemetry!.fuel_consumption, 3.2, 1e-9, "conso du jeu avant mesure");
    approx(d.telemetry!.fuel_laps_remaining, 50 / 3.2, 1e-9, "autonomie recalculée");
    const again = enrichLive(d);
    ok(again === d && again.telemetry!.fuel_consumption === 3.2, "idempotent");
    const quiet = enrichLive(live({ rest: null }));
    eq(quiet.rest_used, { fuel: null, sessionEnd: null }, "pont absent : rien ne change");
    eq(quiet.session!.end_et, 0, "pont absent : end_et intact");
    const shm = enrichLive(live({ session: { ...live().session!, end_et: 3600 } }));
    eq(shm.session!.end_et, 3600, "mémoire partagée prioritaire quand elle sait");
  }

  section("forecast : jeu prioritaire si cohérent");
  {
    const game = gameForecast(rest(), 1);
    ok(!!game && game.length === 5, "5 nœuds de l'écran des stands");
    const wet = [{ Humidity: 50, RainChance: 0, Sky: 0, Temperature: 18 }, { Humidity: 50, RainChance: 0, Sky: 0, Temperature: 18 }];
    eq(pickForecast(fromGameNodes(game!), wet, true, 0, 18)?.source, "game", "jeu cohérent : retenu");
    eq(pickForecast(fromGameNodes(game!), wet, true, 0, 30)?.source, "wet", "jeu incohérent (air 30 °C) : .wet validé");
    eq(pickForecast(fromGameNodes(game!), wet, false, 0, 30), null, "rien de cohérent : silence");
    eq(gameForecast(rest({ pit: field(pit(), "stale") }), 1), null, "prévision périmée : ignorée");
  }

  section("lmuRest.brakePads / PadWearTracker");
  {
    eq(brakePads(rest())?.length, 4, "brakeCondition ≈ 1 accepté (plaquettes neuves)");
    eq(brakePads(rest({ vehicle: field<RestVehicle>(null, "absent") })), null, "sans getVehicleCondition : null (wearables.brakes n'est pas une fraction)");
    const tr = new PadWearTracker();
    [1, 0.98, 0.96, 0.94].forEach((x) => tr.push(x));
    approx(tr.perLap()!, 0.02, 1e-9, "usure par tour");
    approx(tr.lapsTo(0.94)!, 42, 1e-6, "tours avant 10 %");
    tr.push(1);
    eq(tr.perLap(), null, "plaquettes changées : repart de zéro");
    // Relevé réel 2026-10-16 : 1,89 après un gros choc.
    eq(aeroDamage(rest({ pit: field(pit({ aero_damage: 1.888 })) })), 1, "dégâts aéro > 1 bornés à 100 %");
    eq(aeroDamage(rest({ pit: field(pit({ aero_damage: 0.25 })) })), 0.25, "dégâts aéro normaux");
  }

  section("AlertLatch (dégâts : pas de rafale sur le bas-côté)");
  {
    const l = new AlertLatch(5_000, 60_000);
    eq(l.update(true, 0), true, "1re annonce");
    eq(l.update(true, 1_000), false, "toujours actif : silence");
    eq(l.update(false, 2_000), false, "trame saine isolée");
    eq(l.update(true, 2_100), false, "clignotement : pas de réannonce");
    eq(l.update(null, 3_000), false, "donnée inconnue : rien");
    eq(l.update(true, 3_100), false, "inconnu ne réarme pas");
    l.update(false, 10_000);
    l.update(false, 16_000);
    eq(l.update(true, 30_000), false, "réarmé mais < 60 s depuis la dernière annonce");
    l.update(false, 61_000);
    l.update(false, 67_000);
    eq(l.update(true, 70_000), true, "vrai retour à la normale puis nouveau dégât");
    l.rearm();
    eq(l.update(true, 71_000), false, "réarmement de séance : l'écart minimal tient");
  }

  section("trackMapGeom.pathOfRuns (voie des stands en deux tronçons)");
  {
    const id = (p: [number, number]): [number, number] => p;
    const d = pathOfRuns([[0, 0], [20, 0], [40, 0], [580, 0], [600, 0]], id);
    eq((d.match(/M/g) ?? []).length, 2, "saut de 540 m : deux tronçons, pas de corde");
    eq(pathOfRuns([[0, 0], [20, 0]], id), "M0.0,0.0 L20.0,0.0", "tronçon continu");
  }

  section("router : question « plaquettes ? » (5 langues)");
  for (const [q, lang] of [
    ["plaquettes ?", "fr"],
    ["usure des plaquettes", "fr"],
    ["brake pads?", "en"],
    ["pastillas", "es"],
    ["Bremsbeläge", "de"],
    ["pastiglie", "it"],
  ] as const) {
    eq(route(q, lang).intent, "brakeWear", `« ${q} » (${lang})`);
  }
  ok(route("température des freins", "fr").intent !== "brakeWear", "température des freins ≠ usure");

  section("lmuRest.perte au stand");
  {
    eq(laneLossFrom(55, 30), 25, "temps de voie = perte − arrêt");
    eq(laneLossFrom(55, null), null, "durée d'arrêt inconnue");
    let st: number | null = null;
    for (const v of [null, 31.5, 31.5, 20, 8, 0, null]) st = keepPlannedStop(st, v);
    eq(st, 31.5, "décompte pendant le service : on garde la durée prévue en entrant");
    const d = live({ rest: rest({ pit: field(pit({ pit_stop_length_s: 41 })) }) });
    eq(effectivePitLoss(d, 50, 25), 66, "voie mesurée + arrêt prévu par le menu");
    eq(effectivePitLoss(d, 50, null), 50, "voie inconnue : perte enregistrée");
    eq(effectivePitLoss(live({ rest: null }), 50, 25), 50, "jeu muet : perte enregistrée");
  }

  section("lmuRest.restStatus / garageBoundsText");
  eq(restStatus(live()), "ok", "pont frais");
  eq(restStatus(live({ rest: rest({ reachable: false }) })), "silent", "jeu muet");
  eq(restStatus(live({ rest: null })), "off", "pas de flux");
  {
    const txt = garageBoundsText([
      { key: "VM_BRAKE_BALANCE", value: 14, min: 0, max: 45, text: "53.7:46.3" },
      { key: "VM_ANTILOCK_BRAKES", value: 0, min: 0, max: 1, text: "N/A" },
    ]);
    ok(!!txt && txt.includes("BRAKE_BALANCE: step 14 in 0–45 (53.7:46.3)"), "plage lisible");
    ok(!!txt && !txt.includes("ANTILOCK"), "réglage non ajustable omis");
  }
  ok(isSetupQuestion("je règle quoi sur l'aileron ?"), "question de réglage (FR)");
  ok(isSetupQuestion("more TC?"), "TC seul");
  ok(!isSetupQuestion("c'est absolument génial"), "« absolument » n'est pas ABS");

  section("trackMapGeom");
  {
    const full = Array.from({ length: 200 }, (_, i) => i * 20 + 10);
    eq(splitRuns(full, 4000).closed, true, "tour complet : fermé");
    const holed = full.filter((d) => d < 1000 || d > 1600);
    const r = splitRuns(holed, 4000);
    eq(r.closed, false, "trou : pas de corde");
    eq(r.runs.length, 1, "le tronçon qui passe la ligne est d'un seul tenant");
    ok(r.runs[0][1] > holed.length, "indices au-delà de n = retour au début");
    approx(coverage(holed, 4000), 0.85, 0.01, "couverture");
    eq(mapComplete(full, 4000), true, "complet");
    eq(mapComplete(holed, 4000), false, "incomplet : on ne fige pas");
    eq(sectorOf(500, [1300, 2700]), 0, "S1");
    eq(sectorOf(2000, [1300, 2700]), 1, "S2");
    eq(sectorOf(3000, [1300, 2700]), 2, "S3");
    eq(nearestIndex(full, 1305), 65, "point le plus proche d'une borne");
    const pts = full.map((d) => [d, 0] as [number, number]);
    const sp = sectorPolylines(pts, full, [1300, 2700]);
    ok(!!sp && sp[0].length > 60 && sp[2].length > 60, "trois secteurs");
    eq(sectorPolylines(pts, full, [1300]), null, "une seule borne : pas de coloration");
  }
}
