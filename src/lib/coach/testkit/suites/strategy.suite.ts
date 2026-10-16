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

  section("strategy.voice");
  {
    eq(route("quand s'arrête le leader ?", "fr").intent, "rivalStops", "FR : quand s'arrête le leader");
    eq(route("combien d'arrêts pour la voiture devant", "fr").intent, "rivalStops", "FR : arrêts de la voiture devant");
    eq(route("combien d'arrêts", "fr").intent, "stops", "FR : mes arrêts restent « stops »");
    eq(route("when does the leader pit", "en").intent, "rivalStops", "EN");
    eq(route("cuando para el lider", "es").intent, "rivalStops", "ES");
    eq(route("wann stoppt der führende", "de").intent, "rivalStops", "DE");
    eq(route("quando si ferma il leader", "it").intent, "rivalStops", "IT");

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
