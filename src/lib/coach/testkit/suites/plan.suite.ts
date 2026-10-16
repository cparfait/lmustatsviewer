/**
 * Suite « préparation et feuille de relais » : soleil sur les circuits, plan
 * des relais (rotation, équilibrage, épinglage, pneus, nuit) et programme
 * d'essais coché tout seul.
 */

import { section, ok, eq, approx } from "../assert";
import type { CareerRace, LiveData, SvmFile } from "@/lib/api";
import { EventDetector, eventsForSession } from "@/lib/liveEvents";
import { chooseEnergy, energyItem, energyNeed, energyOptions } from "@/lib/pitMenu";
import { parseJsonl, slimFrame, toJsonl, type RecordedFrame } from "@/lib/replay/format";
import { mmss, runBench } from "@/lib/replay/bench";
import { filterRaces, highlights, matchRounds, recurring, standings, summarize, titleMath, type Championship } from "@/lib/career";
import { recommend, applyStep, nextVersionName } from "@/lib/setupAssistant";
import { trackSun, trackGeo, isNight } from "@/lib/racePlan/sun";
import { planStints, clock, hm, type PlanInput } from "@/lib/racePlan/stintPlan";
import { PrepTracker, emptyPrep, ready, isDone, type PrepState } from "@/lib/racePlan/prep";

const base: PlanInput = {
  raceS: 3600,
  startHour: 15,
  lapS: 100,
  stintLaps: 10,
  pitLossS: 50,
  drivers: ["A", "B"],
  mode: "rotate",
  perDriver: 1,
  tyreEvery: 2,
  maxDriveS: null,
  sun: null,
};

export function run(): void {
  section("plan.sun");
  {
    ok(trackGeo("Circuit de la Sarthe") != null && trackGeo("Autodromo Enzo e Dino Ferrari") != null, "circuits reconnus");
    eq(trackGeo("Nürburgring"), null, "circuit inconnu");
    // Le Mans mi-juin (heure d'été) : lever ≈ 6 h 05, coucher ≈ 22 h 05.
    const june = trackSun("Circuit de la Sarthe", new Date("2026-06-15T12:00:00Z"))!;
    ok(Math.abs(june.rise - 6.08) < 0.25 && Math.abs(june.set - 22.08) < 0.25, `Le Mans en juin — ${june.rise.toFixed(2)} / ${june.set.toFixed(2)}`);
    // Bahreïn fin novembre (pas d'heure d'été) : coucher ≈ 16 h 45.
    const bah = trackSun("Bahrain International Circuit", new Date("2026-11-28T12:00:00Z"))!;
    ok(Math.abs(bah.set - 16.75) < 0.25, `Bahreïn en novembre — ${bah.set.toFixed(2)}`);
    ok(isNight(23, june) && !isNight(12, june) && isNight(26, june), "nuit / jour (heures > 24 comprises)");
  }

  section("plan.stints");
  {
    const p = planStints(base)!;
    eq(p.stints.map((s) => [s.startS, s.endS]), [[0, 1000], [1050, 2050], [2100, 3100], [3150, 3600]], "relais + perte au stand");
    eq(p.stops, 3, "3 arrêts");
    eq(p.stints[3].laps, 5, "dernier relais : jusqu'au premier passage après le temps");
    ok(p.stints[3].last && !p.stints[2].last, "dernier relais marqué");
    eq(p.stints.map((s) => s.driver), ["A", "B", "A", "B"], "rotation stricte");
    eq(p.stints.map((s) => s.newTyres), [false, false, true, false], "pneus tous les 2 relais");
    eq(planStints({ ...base, perDriver: 2 })!.stints.map((s) => s.driver), ["A", "A", "B", "B"], "doubles relais");
    eq(planStints({ ...base, pins: { 1: "A" } })!.stints[1].driver, "A", "relais épinglé");
    const bal = planStints({ ...base, mode: "balance", perDriver: 2, drivers: ["A", "B", "C"] })!;
    eq(bal.stints.map((s) => s.driver), ["A", "B", "C", "A"], "équilibrage : le moins chargé");
    const lim = planStints({ ...base, maxDriveS: 1500 })!;
    eq(lim.overLimit, ["A"], "temps de volant maximal dépassé signalé");
    const night = planStints({ ...base, startHour: 21, sun: { rise: 6, set: 21.4 } })!;
    // 21:00-21:16 avant le coucher (21:24) ; 21:17-21:34 à cheval, surtout de nuit ; ensuite nuit.
    eq(night.stints.map((s) => s.night), [false, true, true, true], "relais de nuit (plus de la moitié)");
    eq(planStints({ ...base, lapS: 0 }), null, "saisie incomplète : pas de plan");
    eq(clock(23.5, 3600), "00:30", "horloge qui passe minuit");
    eq(hm(7380), "2:03", "durée h:mm");
  }

  section("setup.assistant");
  {
    const p = (key: string, value: string, comment: string | null = null) => ({ key, value, comment });
    const svm: SvmFile = {
      header: { vehicle_class: "GT3", upgrade_setting: "", veh_path: null },
      sections: [
        { name: "SUSPENSION", params: [p("FrontAntiSwaySetting", "4", "120 N/mm"), p("RearAntiSwaySetting", "0", "Detached"), p("FrontWingSetting", "2", "N/A")] },
        { name: "CONTROLS", params: [p("RearBrakeSetting", "30", "53.0:47.0")] },
        { name: "DRIVELINE", params: [p("DiffCoastSetting", "5")] },
        { name: "FRONTLEFT", params: [p("SpringSetting", "7")] },
        { name: "FRONTRIGHT", params: [p("SpringSetting", "7")] },
      ],
    };
    const r = recommend(svm, "understeer", "entry", "slow");
    eq(r.map((x) => [x.lever, x.dir]), [["frontArb", -1], ["diffCoast", -1], ["rearBrake", 1]], "sous-virage entrée lent : chaîne ordonnée, 3 au plus");
    eq(recommend(svm, "understeer", "entry", "fast").map((x) => x.lever).includes("frontWing"), false, "aileron figé (N/A) écarté");
    const ov = recommend(svm, "oversteer", "mid", "slow");
    ok(ov[ov.length - 1].lever === "rearArb" && ov[ov.length - 1].atLimit, "barre AR déjà à 0 : en butée, rangée en dernier");
    const withBounds = recommend(svm, "understeer", "mid", "slow", [{ key: "VM_FRONT_ANTISWAY", value: 4, min: 0, max: 8, text: "120 N/mm" }]);
    eq(withBounds[0].max, 8, "borne du jeu reprise (pont REST)");
    const springs = recommend(svm, "understeer", "entry", "slow", null, 4).find((x) => x.lever === "frontSprings")!;
    eq(applyStep(svm, springs), [
      { name: "FRONTLEFT", params: [{ key: "SpringSetting", value: "6", comment: null }] },
      { name: "FRONTRIGHT", params: [{ key: "SpringSetting", value: "6", comment: null }] },
    ], "un cran sur les deux roues de l'essieu");
    eq(nextVersionName("Spa course V3"), "Spa course V4", "version suivante");
    eq(nextVersionName("Spa course"), "Spa course V2", "première version");
  }

  section("career");
  {
    const r = (i: number, o: Partial<CareerRace>): CareerRace => ({
      session_id: i, timestamp: Date.UTC(2026, 0, i) / 1000, track: "Spa", track_course: "Spa", online: true, car: "Oreca", car_class: "LMP2",
      position: 5, class_position: 3, grid_pos: 6, class_grid_pos: 4, class_size: 11, finish_status: "Finished Normally", best_lap: 130, laps: 30, pitstops: 1, vmax: 290, ...o,
    });
    const races = [r(1, { class_position: 1, class_grid_pos: 3 }), r(2, { class_position: 5, class_grid_pos: 2 }), r(3, { finish_status: "DNF" }), r(4, { online: false })];
    const s = summarize(races);
    ok(s.races === 4 && s.wins === 1 && s.podiums === 2, "victoires et podiums (courses terminées seulement)");
    approx(s.finishRate, 0.75, 1e-9, "taux d'arrivée");
    approx(s.gainedPerRace!, (2 + -3 + 1) / 3, 1e-9, "places gagnées en classe par course terminée");
    eq(s.best?.session_id, 1, "meilleur résultat");
    eq(filterRaces(races, { online: "offline", cls: "", from: null, to: null }).length, 1, "filtre hors ligne");
    eq(highlights(races)[0].kind, "win", "temps fort : la victoire d'abord");
    eq(recurring(races), null, "moins de 5 courses : pas de défaut récurrent");
    const dnfs = [1, 2, 3, 4, 5].map((i) => r(i, { finish_status: i <= 2 ? "DNF" : "Finished Normally" }));
    eq(recurring(dnfs)?.kind, "dnf", "40 % d'abandons : défaut récurrent");

    const champ: Championship = { id: "1", name: "x", cls: "LMP2", scoring: "wec", rounds: [{ track: "spa", date: "2026-01-03" }, { track: "Monza", date: "2026-06-01" }] };
    const m = matchRounds(champ, races);
    ok(m[0]?.session_id === 2 || m[0]?.session_id === 3 || m[0]?.session_id === 4, "manche rattachée à ±7 jours (la plus proche)");
    eq(m[1], null, "manche pas encore courue");
    const rows = standings(champ, [
      { session_id: 1, driver_name: "Me", class_position: 2, finish_status: "Finished Normally", is_player: true },
      { session_id: 1, driver_name: "Max", class_position: 1, finish_status: "Finished Normally", is_player: false },
      { session_id: 1, driver_name: "Bob", class_position: 3, finish_status: "DNF", is_player: false },
    ]);
    eq(rows.map((x) => [x.driver, x.points]), [["Max", 25], ["Me", 18], ["Bob", 0]], "barème WEC, abandon sans points");
    eq(titleMath(rows, 1, "wec"), { kind: "chasing", leader: "Max", gap: 7, remaining: 1 }, "ce qu'il me faut");
    eq(titleMath(rows, 0, "wec")?.kind, "out", "plus de manche : titre hors de portée");
  }

  section("live.events");
  {
    const det = new EventDetector();
    const surf = (n: number) => [0, 1, 2, 3].map((i) => ({ surface: i < n ? 2 : 0 }));
    const frame = (o: { impact?: number; limits?: number; off?: number; cls?: number; laps?: number; phase?: number; near?: { lat: number; lon: number }[] }) =>
      ({
        connected: true,
        paused: false,
        session: { track: "Spa", session: 10, session_time: 100, end_et: 3600, max_laps: 0, num_vehicles: 3, track_length: 7000, game_phase: o.phase ?? 5 },
        player: { total_laps: o.laps ?? 2 },
        telemetry: { last_impact_magnitude: o.impact ?? 0, wheels: surf(o.off ?? 0) },
        extended: { track_limits: o.limits ?? 0 },
        nearby: o.near ?? [],
        standings: [
          { driver: "Me", is_player: true, in_pits: false, vehicle_class: "GT3", class_position: o.cls ?? 3, total_laps: o.laps ?? 2, lap_dist: 1234 },
          { driver: "Bob", is_player: false, in_pits: false, vehicle_class: "GT3", class_position: (o.cls ?? 3) === 2 ? 3 : 2, total_laps: 2, lap_dist: 1200 },
          { driver: "Ann", is_player: false, in_pits: false, vehicle_class: "GT3", class_position: (o.cls ?? 3) === 3 ? 4 : 1, total_laps: 2, lap_dist: 1100 },
        ],
      }) as unknown as LiveData;
    eq(det.push(frame({}), 0).length, 0, "première trame : rien");
    eq(det.push(frame({ impact: 2500 }), 100).map((e) => [e.kind, e.lapDist]), [["contact", 1234]], "contact placé sur le tour");
    eq(det.push(frame({ impact: 2500, limits: 1 }), 200).map((e) => e.kind), ["trackLimits"], "limites de piste");
    eq(det.push(frame({ off: 2 }), 300).length, 0, "sortie : pas avant 0,5 s");
    eq(det.push(frame({ off: 2 }), 900).map((e) => e.kind), ["offTrack"], "sortie confirmée");
    const ov = det.push(frame({ cls: 2 }), 1000);
    eq(ov.map((e) => [e.kind, e.detail]), [["overtake", "Bob"]], "dépassement sur la voiture désormais derrière");
    for (let i = 0; i < 4; i++) det.push(frame({ cls: 2, near: [{ lat: 2, lon: 1 }] }), 2000 + i * 100);
    ok(det.push(frame({ cls: 2, near: [{ lat: 2, lon: 1 }] }), 2600).length === 0, "roue dans roue : une seule annonce");

    const st2 = new EventDetector();
    st2.push(frame({ cls: 6, laps: 0, phase: 3 }), 0);
    const s1 = st2.push(frame({ cls: 2, laps: 1 }), 1000);
    ok(s1.some((e) => e.kind === "start" && e.value === 4), "départ : 4 places gagnées");

    const evs = [{ kind: "contact", t: 0, track: "Spa", sessionStart: 1000, session: 10, lap: 3, lapDist: 10 }] as const;
    eq(eventsForSession([...evs], "Spa-Francorchamps", 1500, 3600, true).length, 1, "rattachement par circuit (inclusion)");
    eq(eventsForSession([...evs], "Spa", 9000, 3600, true).length, 0, "trop loin dans le temps");
    eq(eventsForSession([...evs], "Spa", 1500, 3600, false).length, 0, "autre type de séance");
  }

  section("pit.menu");
  {
    const menu = [
      { name: "VIRTUAL ENERGY:", current: 0, options: ["No Change", "40% 8.1 laps", "50% 10.1 laps", "60% (12.1 laps)", "100% 20.2 laps"] },
      { name: "TIRES:", current: 0, options: ["No Change", "Medium"] },
    ];
    const item = energyItem(menu)!;
    eq(energyOptions(item).map((o) => [o.index, o.frac]), [[1, 0.4], [2, 0.5], [3, 0.6], [4, 1]], "options lues au pourcentage");
    approx(energyNeed(9, 0.05)!, 0.475, 1e-9, "besoin : 9 tours + ½ à 5 %/tour");
    eq(chooseEnergy(energyOptions(item), 0.475)?.index, 2, "plus petite option qui couvre (50 %)");
    eq(chooseEnergy(energyOptions(item), 1)?.index, 4, "plein");
    eq(energyNeed(30, 0.05), 1, "plus d'un relais : le plein");
    eq(energyItem([menu[1]]), null, "voiture sans énergie virtuelle");
  }

  section("replay.bench");
  {
    const fr = (t: number, laps: number, impact: number) =>
      ({
        t,
        d: {
          connected: true, paused: false,
          session: { track: "Spa", session: 10, session_time: t / 1000, end_et: 3600, max_laps: 0, num_vehicles: 1, track_length: 7000, game_phase: 5 },
          player: { total_laps: laps },
          telemetry: { last_impact_magnitude: impact, wheels: [], front_compound: "Medium", rear_compound: "Medium" },
          extended: { track_limits: 0 },
          weather: { path_wetness_avg: 0, rain: 0 },
          standings: [{ driver: "Me", is_player: true, in_pits: false, vehicle_class: "GT3", class_position: 2, total_laps: laps, lap_dist: 800, num_pitstops: 0 }],
        },
      }) as unknown as RecordedFrame;
    const frames = [fr(0, 1, 0), fr(500, 1, 0), fr(1000, 1, 3000), fr(1500, 2, 3000)];
    const text = toJsonl(frames);
    eq(parseJsonl(text).length, 4, "aller-retour JSON Lines");
    const r = runBench(parseJsonl(text));
    ok(r.lines.some((l) => l.source === "events" && l.text.startsWith("contact")), `contact retrouvé au rejeu — ${JSON.stringify(r.lines)}`);
    eq(r.durationMs, 1500, "durée couverte");
    eq(mmss(61000), "01:01", "horodatage mm:ss");
    eq(slimFrame({ track_points: [[1, 2]], track_dists: [1], rest: {} } as unknown as LiveData).track_points, [], "trame allégée");
  }

  section("plan.prep");
  {
    const tr = new PrepTracker();
    let state: PrepState = emptyPrep();
    const frame = (laps: number, last: number, o: { inPits?: boolean; stops?: number; fuel?: number; wet?: number } = {}) =>
      ({
        connected: true,
        paused: false,
        session: { track: "Spa", session: 1, session_time: 0, end_et: 0, max_laps: 0, num_vehicles: 1, track_length: 7000, game_phase: 5 },
        player: { total_laps: laps, last_lap_time: last, best_lap_time: 100, num_pitstops: o.stops ?? 0 },
        telemetry: { fuel: o.fuel ?? 90, fuel_capacity: 100, fuel_consumption: 3 },
        weather: { path_wetness_avg: o.wet ?? 0 },
        standings: [{ is_player: true, in_pits: o.inPits ?? false, vehicle_class: "GT3" }],
      }) as unknown as LiveData;
    const push = (d: LiveData, x = { pitLossKnown: false, warmupKnown: false, wearKnown: false }) => {
      state = tr.push(d, state, x) ?? state;
    };
    push(frame(0, 0, { inPits: true }));
    push(frame(0, 0, { fuel: 90 })); // sortie des stands, plein à 90 %
    push(frame(1, 130)); // tour de sortie : pas propre
    eq(state.pace, 0, "tour de sortie ignoré");
    for (let l = 2; l <= 4; l++) push(frame(l, 101));
    eq(state.pace, 3, "3 tours propres");
    ok(isDone(state, "pace") && isDone(state, "fuel") && isDone(state, "fullTank"), "rythme, conso, plein faits");
    push(frame(5, 110)); // tour lent : relais long remis à zéro
    eq(state.longRun, 3, "relais long : meilleur série gardée");
    ok(!ready(state), "perte au stand et usure manquent");
    push(frame(5, 110), { pitLossKnown: true, warmupKnown: false, wearKnown: true });
    ok(ready(state), "prêt une fois perte au stand et usure connues");
  }
}
