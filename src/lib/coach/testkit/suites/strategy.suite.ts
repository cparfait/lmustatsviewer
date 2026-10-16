/**
 * Suite « stratégie de course » : registre des arrêts du plateau (relais,
 * prochain arrêt, arrêts restants, « le leader rentre ») et questions vocales
 * associées. Tout est pur → rejouable sans le jeu.
 */

import { section, ok, eq } from "../assert";
import type { LiveData, LiveStanding } from "@/lib/api";
import type { Tr } from "@/i18n";
import { StintRegistry, stintsOf, lapsLeftFor } from "@/lib/engineer/rivalStints";
import { route } from "@/lib/engineer/router";
import { answerIntent } from "@/lib/engineer/answers";
import { engineer } from "@/lib/engineer/state";
import { TyreWearTracker, tyreChangePlan, WetnessTrend, WarmupTracker, isWetCompound } from "@/lib/engineer/tyres";

export const st = (o: Partial<LiveStanding>): LiveStanding =>
  ({
    position: 0,
    class_position: 0,
    driver: "",
    vehicle_name: "",
    vehicle_class: "GT3",
    last_lap_time: 100,
    best_lap_time: 100,
    time_behind_leader: 0,
    laps_behind_leader: 0,
    time_behind_next: 0,
    is_player: false,
    in_pits: false,
    current_sector: 1,
    last_s1: 0,
    last_s2: 0,
    last_s3: 0,
    num_pitstops: 0,
    total_laps: 0,
    lap_dist: 0,
    pit_state: 0,
    ...o,
  }) as LiveStanding;

export const data = (standings: LiveStanding[], extra: Partial<LiveData> = {}): LiveData =>
  ({
    connected: true,
    paused: false,
    session: { track: "Spa", session: 10, session_time: 600, end_et: 6000, max_laps: 2147483647, num_vehicles: standings.length, track_length: 7000, game_phase: 5 },
    player: { driver: "Me", position: 3, total_laps: 10, best_lap_time: 100, last_lap_time: 101, last_sectors: [0, 0, 0], best_sectors: [0, 0, 0], lap_delta: 0, num_pitstops: 0, num_penalties: 0, pit_state: 0, flag: 0 },
    telemetry: null,
    weather: null,
    extended: null,
    flags: null,
    standings,
    ...extra,
  }) as unknown as LiveData;

const t = ((k: string, v?: Record<string, unknown>) => (v ? `${k}${JSON.stringify(v)}` : k)) as unknown as Tr;

/** Course simulée : le leader s'arrête aux tours 20 et 40, le joueur jamais. */
function race(reg: StintRegistry, upToLap: number, pitState = 2) {
  let ev = null;
  for (let lap = 0; lap <= upToLap; lap++) {
    const stops = lap >= 40 ? 2 : lap >= 20 ? 1 : 0;
    const inPits = lap === 20 || lap === 40;
    const d = data([
      st({ driver: "Lead", class_position: 1, position: 1, total_laps: lap, num_pitstops: stops, in_pits: inPits, pit_state: inPits ? pitState : 0 }),
      st({ driver: "Me", class_position: 3, position: 3, total_laps: lap, is_player: true }),
    ]);
    ev = reg.push(d) ?? ev;
  }
  return ev;
}

export function run(): void {
  section("strategy.stints");
  {
    const reg = new StintRegistry();
    const ev = race(reg, 45);
    const lead = reg.get("Lead")!;
    eq(lead.stopLaps, [20, 40], "tours des arrêts du leader");
    eq(stintsOf(lead), [20, 20], "relais mesurés (vu dès le départ)");
    ok(!!ev && ev.driver === "Lead" && ev.stop === 2 && ev.stintLaps === 20, "le leader rentre : 2e arrêt après 20 tours");
    const d = data([st({ driver: "Lead", class_position: 1, total_laps: 45, num_pitstops: 2 }), st({ driver: "Me", class_position: 3, is_player: true, total_laps: 45 })]);
    const e = reg.estimate(d, d.standings[0]);
    eq(e.stintLaps, 20, "relais type");
    eq(e.lapsToNext, 15, "prochain arrêt dans 15 tours");
    // Temps restant 5400 s / 100 s → 54 tours, +1 en cours = 55 ; 55 − 15 = 40 → 2 relais de 20.
    eq(lapsLeftFor(d, d.standings[0]), 55, "tours restants (course au temps)");
    eq(e.stopsLeft, 2, "arrêts restants");
  }
  {
    // Demande d'arrêt (pit_state 1) sans entrée réelle : pas d'annonce.
    const reg = new StintRegistry();
    const ev = race(reg, 21, 1);
    ok(ev === null, "pit_state 1 (demande) : pas de « leader rentre »");
  }
  {
    // Voiture vue en cours de course avec un arrêt déjà fait : 1er relais inconnu.
    const reg = new StintRegistry();
    reg.push(data([st({ driver: "Late", class_position: 1, total_laps: 30, num_pitstops: 1 }), st({ driver: "Me", is_player: true, class_position: 2 })]));
    reg.push(data([st({ driver: "Late", class_position: 1, total_laps: 52, num_pitstops: 2 }), st({ driver: "Me", is_player: true, class_position: 2 })]));
    eq(stintsOf(reg.get("Late")!), [], "relais inconnus sans deux arrêts observés");
    // Repli : relais type de la classe, mesuré sur une autre voiture.
    race(reg, 41);
    const d = data([st({ driver: "Late", class_position: 2, total_laps: 52, num_pitstops: 2 })]);
    const e = reg.estimate(d, d.standings[0]);
    ok(e.fromClass && e.stintLaps === 20, "repli sur le relais type de la classe");
  }
  {
    // Relais trop court (dégâts / splash) ignoré.
    eq(stintsOf({ driver: "x", cls: "GT3", stopLaps: [20, 21, 41], fromStart: true }), [20, 20], "relais < 3 tours ignoré");
  }

  section("strategy.tyres");
  {
    const w = new TyreWearTracker();
    for (let lap = 0; lap < 5; lap++) w.push([90 - lap * 3, 90 - lap * 2, 90 - lap, 90 - lap]);
    const per = w.perLap();
    ok(Math.abs(per[0]! - 3) < 1e-9 && Math.abs(per[1]! - 2) < 1e-9, "usure par tour par roue");
    w.push([99, 99, 99, 99]);
    eq(w.perLap(), [null, null, null, null], "pneus changés : pente réinitialisée");

    // 20 tours de relais : AVG 70 − 3×20 = 10 (falaise), AVD 70 − 40 = 30 (tient).
    const plan = tyreChangePlan([70, 70, 80, 85], [3, 2, 1, 1], 20, null);
    eq(plan.change, ["fl"], "seul l'avant gauche passe sous la falaise");
    eq(tyreChangePlan([70, 70, 80, 85], [3, 2, 1, 1], 20, 8), { change: [], toFinish: true }, "fin de course proche : rien à changer");
    eq(tyreChangePlan([30, 30, 30, 30], [1, 1, 1, 1], 20, null).change.length, 4, "quatre pneus usés");

    const wt = new WetnessTrend();
    wt.push(0, 0.05);
    wt.push(60, 0.13);
    eq(wt.call(false, 0.3), "toWets", "piste qui se mouille + pluie : pneus pluie");
    eq(wt.call(true, 0.3), null, "déjà en pneus pluie");
    const dry = new WetnessTrend();
    dry.push(0, 0.4);
    dry.push(100, 0.1);
    eq(dry.call(true, 0), "toSlicks", "piste qui sèche : slicks");
    eq(dry.call(false, 0), null, "déjà en slicks");
    ok(isWetCompound("Wet") && !isWetCompound("Medium"), "gomme pluie reconnue");
  }
  {
    // Chauffe : meilleurs S2/S3 vus = 30,5/30,2 (le 1er instantané ne boucle aucun tour) ;
    // tour de sortie S2/S3 = 33/31 (+3,3 s), tour suivant 101 vs 100 (+1 s).
    const wu = new WarmupTracker();
    const frame = (laps: number, stops: number, s2: number, s3: number, last: number, inPits = false) =>
      data([st({ driver: "A", vehicle_class: "GT3", total_laps: laps, num_pitstops: stops, last_s2: s2, last_s3: s3, last_lap_time: last, best_lap_time: 100, in_pits: inPits })]);
    wu.push(frame(5, 0, 30, 30, 100), true);
    wu.push(frame(6, 0, 30.5, 30.2, 100.7), true);
    wu.push(frame(7, 0, 31, 40, 110), true); // tour d'entrée
    wu.push(frame(7, 1, 31, 40, 110, true), true); // arrêt compté
    wu.push(frame(8, 1, 33, 31, 125), true); // tour de sortie
    const got = wu.push(frame(9, 1, 30.5, 30.5, 101), true);
    eq(got.length, 1, "une mesure de chauffe");
    ok(Math.abs(got[0].seconds - 4.3) < 1e-9, `chauffe = 3,3 s (sortie) + 1 s (tour suivant) — ${got[0]?.seconds}`);
    eq(wu.median("GT3"), null, "médiane : 2 mesures minimum");
  }

  section("strategy.voice");
  {
    eq(route("quand s'arrête le leader ?", "fr").intent, "rivalStops", "FR : quand s'arrête le leader");
    eq(route("combien d'arrêts pour la voiture devant", "fr").intent, "rivalStops", "FR : arrêts de la voiture devant");
    eq(route("combien d'arrêts", "fr").intent, "stops", "FR : mes arrêts restent « stops »");
    eq(route("when does the leader pit", "en").intent, "rivalStops", "EN");
    eq(route("cuando para el lider", "es").intent, "rivalStops", "ES");
    eq(route("wann stoppt der führende", "de").intent, "rivalStops", "DE");
    eq(route("quando si ferma il leader", "it").intent, "rivalStops", "IT");
    eq(route("quels pneus je change ?", "fr").intent, "tyreChange", "FR : quels pneus");
    eq(route("pneus pluie ou slicks", "fr").intent, "tyreChange", "FR : pluie ou slicks");
    eq(route("mes pneus", "fr").intent, "tyres", "FR : « mes pneus » reste l'état des pneus");
    eq(route("which tyres to change", "en").intent, "tyreChange", "EN : tyres");
    eq(route("wie viele reifen", "de").intent, "tyreChange", "DE : reifen");

    engineer.resetSession();
    race(engineer.stints, 45);
    const d = data([
      st({ driver: "Lead", class_position: 1, total_laps: 45, num_pitstops: 2 }),
      st({ driver: "Me", class_position: 3, is_player: true, total_laps: 45 }),
    ]);
    const txt = answerIntent("rivalStops", d, t, { pitLossSec: 60, fuelReserveLaps: 1, norm: "quand s arrete le leader" });
    ok(txt.includes("live.spRStops") && txt.includes("live.spRStint") && txt.includes("live.spRNext") && txt.includes("live.spRLeft"), `réponse complète — ${txt}`);
    engineer.resetSession();
  }
}
