/**
 * Suite « annonces de course » : centre de messages du jeu, pénalités, limites de
 * piste, pressions, neutralisations (ordre figé), stands (box partagé, sortie),
 * fin de course, pneus sales / blocages / choc, menu des stands à la voix, réveil,
 * cohabitation, noms de virages, spotter réglable, notes vocales.
 * Tout est pur (horloge passée en paramètre) → rejouable sans le jeu.
 */

import { section, ok, eq, approx } from "../assert";
import type { LiveRules, LiveStanding, LiveWheel, PitMenuItem } from "@/lib/api";
import { GameMessageTracker, parseGameMessage } from "@/lib/engineer/gameMessages";
import { PenaltyTracker, TYPE_WAIT_S } from "@/lib/engineer/penalties";
import { PressureWatcher, convertPressure, formatPressure, outOfWindow } from "@/lib/engineer/pressures";
import { FrozenOrderTracker, frozenState } from "@/lib/engineer/frozenOrder";
import { PitTrafficWatcher, aheadDist } from "@/lib/engineer/pitTraffic";
import { EndgameWatcher, expectedFinish, pushWindowLaps } from "@/lib/engineer/endgame";
import { TyreEventWatcher } from "@/lib/engineer/tyreEvents";
import { amountFrom, describeMenu, leadingNumber, planPitCommand } from "@/lib/engineer/pitVoice";
import { parsePitCommand, route } from "@/lib/engineer/router";
import { AlarmClock, parseAlarm } from "@/lib/engineer/alarm";
import { coexistFilter, overlapsOtherEngineer } from "@/lib/engineer/coexist";
import { apexFromUid, nearestCorner, spokenCorner } from "@/lib/engineer/cornerVoice";
import { cornerTableFor } from "@/lib/trackCorners";
import { ProximitySpotter, occupiedSides, sanitizeTuning, DEFAULT_SPOTTER } from "@/lib/engineer/proximity";
import { parseExtras, parsePressureWindows, parseSpotterTuning, parseWheelActions, DEFAULT_EXTRAS } from "@/lib/radioSettings";
import { cornerForNote, noteDue } from "@/lib/useVoiceNotes";
import type { Candidate } from "@/lib/engineer/arbiter";
import type { Tr } from "@/i18n";

const st = (o: Partial<LiveStanding>): LiveStanding =>
  ({
    position: 1,
    class_position: 1,
    driver: "",
    vehicle_name: "",
    vehicle_class: "GT3",
    last_lap_time: 0,
    best_lap_time: 0,
    time_behind_leader: 0,
    laps_behind_leader: 0,
    time_behind_next: 0,
    is_player: false,
    in_pits: false,
    current_sector: 1,
    last_s1: 0,
    last_s2: 0,
    last_s3: 0,
    is_class_best_lap: false,
    is_class_best_s1: false,
    is_class_best_s2: false,
    is_class_best_s3: false,
    total_laps: 10,
    num_pitstops: 0,
    num_penalties: 0,
    pos_x: 0,
    pos_z: 0,
    finish_status: 0,
    lap_dist: 0,
    pit_state: 0,
    id: 0,
    ...o,
  }) as LiveStanding;

const wheel = (o: Partial<LiveWheel>): LiveWheel =>
  ({
    temp: 80,
    temp3: [80, 80, 80],
    inner_temp: 80,
    wear: 90,
    brake_temp: 400,
    pressure: 180,
    camber: -3,
    grip_fract: 1,
    surface: 0,
    flat: false,
    detached: false,
    rotation: 0,
    lat_patch_vel: 0,
    long_patch_vel: 0,
    slip_ratio: 0,
    ...o,
  }) as LiveWheel;

function messages() {
  section("course — centre de messages du jeu");
  eq(parseGameMessage("Stop/Go Penalty: Cut Track"), { kind: "penalty", type: "stopGo", cause: "cutTrack" }, "stop & go coupure");
  eq(parseGameMessage("Drive-Thru Penalty: Speeding In Pitlane"), { kind: "penalty", type: "driveThrough", cause: "pitSpeeding" }, "drive-through stands");
  eq(parseGameMessage("Drive-Thru Penalty: Ignored Blue Flags"), { kind: "penalty", type: "driveThrough", cause: "blueIgnored" }, "drapeaux bleus");
  eq(parseGameMessage("Stop/Go Penalty: Illegally Passed Before Green"), { kind: "penalty", type: "stopGo", cause: "passBeforeGreen" }, "dépassement avant vert");
  eq(parseGameMessage("Stop/Go Penalty: Something New"), { kind: "penalty", type: "stopGo", cause: "other" }, "cause inconnue → other");
  eq(parseGameMessage("Wrong Way"), { kind: "warning", warning: "wrongWay" }, "mauvais sens");
  eq(parseGameMessage("Headlights Are Now Required"), { kind: "warning", warning: "headlights" }, "phares");
  eq(parseGameMessage("Blue Flag Warning: Move over soon or be penalized"), { kind: "warning", warning: "blueWarning" }, "bleu avant pénalité");
  eq(parseGameMessage("Warning: One Lap To Serve Drive-Thru Penalty"), { kind: "warning", warning: "oneLapDriveThrough" }, "un tour pour purger");
  eq(parseGameMessage("Disqualified: Ignored Stop/Go Penalty"), { kind: "dq", cause: "ignoredStopGo" }, "disqualification");
  eq(parseGameMessage("Crew Is Ready For Pitstop"), { kind: "warning", warning: "crewReady" }, "équipe prête");
  eq(parseGameMessage("Welcome to the server"), null, "message inconnu ignoré");
  eq(parseGameMessage(""), null, "vide");

  const g = new GameMessageTracker();
  eq(g.push("Wrong Way", 10), null, "1er message vu (séance précédente) ignoré");
  eq(g.push("Wrong Way", 10), null, "même texte, même horodatage : rien");
  eq(g.push("Wrong Way", 11), { kind: "warning", warning: "wrongWay" }, "même texte, nouvel horodatage : nouvel évènement");
  eq(g.push("Stop/Go Penalty: Cut Track", 12)?.kind, "penalty", "nouveau message");
}

function penalties() {
  section("course — pénalités");
  const p = new PenaltyTracker();
  eq(p.update(0, 0, null), [], "1re trame : base");
  // Message typé avant la hausse du compteur.
  eq(p.update(1, 0, parseGameMessage("Stop/Go Penalty: Cut Track")), [], "message seul : en attente de la hausse");
  eq(p.update(1.5, 1, null), [{ kind: "penalty", type: "stopGo", cause: "cutTrack" }], "hausse juste après : typée");
  // Hausse puis message.
  eq(p.update(10, 2, null), [], "hausse sans message : attente");
  eq(p.update(10.5, 2, parseGameMessage("Drive-Thru Penalty: False Start")), [{ kind: "penalty", type: "driveThrough", cause: "falseStart" }], "message dans le délai : typée");
  // Hausse sans message → générique après le délai.
  p.update(20, 3, null);
  eq(p.update(20 + TYPE_WAIT_S + 0.01, 3, null), [{ kind: "penalty", type: null, cause: null }], "sans message : annonce générique");
  eq(p.update(30, 2, null), [{ kind: "served" }], "baisse du compteur : purgée");
  eq(p.outstanding, 2, "pénalités en cours");
  eq(p.lastTyped, { type: "driveThrough", cause: "falseStart" }, "dernière typée");

  section("course — limites de piste");
  const q = new PenaltyTracker();
  eq(q.trackLimits(0, 4), null, "1re valeur : base");
  eq(q.trackLimits(1, 4), { kind: "trackLimits", count: 1, max: 4, last: false }, "1 sur 4");
  eq(q.trackLimits(1, 4), null, "inchangé : rien");
  eq(q.trackLimits(3, 4), { kind: "trackLimits", count: 3, max: 4, last: true }, "3 sur 4 : la prochaine coûte");
  eq(q.trackLimits(0, 4), null, "remise à zéro : rien");
  eq(q.trackLimits(2, 0), null, "seuil inconnu : rien");
}

function pressures() {
  section("course — pressions");
  eq(formatPressure(185, "kPa"), "185", "kPa entier");
  eq(formatPressure(185, "bar"), "1.85", "bar au centième");
  eq(formatPressure(185, "psi"), "26.8", "psi au dixième");
  approx(convertPressure(100, "psi"), 14.5, 0.01, "conversion psi");
  const w = new PressureWatcher();
  const four = (fl: number) => [wheel({ pressure: fl }), wheel({ pressure: 180 }), wheel({ pressure: 175 }), wheel({ pressure: 175 })];
  for (let i = 0; i < 4; i++) eq(w.frame(i, four(155), 150), [], `perte non encore tenue (${i} s)`);
  eq(w.frame(5, four(155), 150), [0], "perte avant gauche tenue 5 s");
  eq(w.frame(6, four(155), 150), [], "dite une seule fois");
  w.frame(7, four(178), 150);
  for (let i = 8; i < 13; i++) w.frame(i, four(150), 150);
  eq(w.frame(13, four(150), 150), [0], "réarmée après retour à la normale");
  eq(w.frame(30, four(150), 30), [], "lent : pas de jugement");
  eq(w.frame(31, [wheel({ pressure: 100, flat: true }), wheel({}), wheel({}), wheel({})], 150), [], "crevaison franche ignorée ici");

  eq(outOfWindow([190, 175, 160, 170], { min: 165, max: 185 }), [{ wheel: 0, off: 5 }, { wheel: 2, off: -5 }], "hors fenêtre signé");
  const v = new PressureWatcher();
  for (let i = 0; i < 20; i++) v.frame(i, four(200), 150);
  eq(v.lap({ min: 170, max: 190 }), null, "1er tour : chauffe");
  for (let i = 0; i < 20; i++) v.frame(i, four(200), 150);
  eq(v.lap({ min: 170, max: 190 })?.map((x) => x.wheel), [0], "2e tour : bilan (avant gauche trop haute)");
  for (let i = 0; i < 20; i++) v.frame(i, four(200), 150);
  eq(v.lap({ min: 170, max: 190 }), null, "une fois par relais");
  v.resetStint();
  for (let i = 0; i < 20; i++) v.frame(i, four(180), 150);
  v.lap({ min: 170, max: 190 });
  for (let i = 0; i < 20; i++) v.frame(i, four(180), 150);
  eq(v.lap({ min: 170, max: 190 }), [], "nouveau relais : tout dans la fenêtre");
  eq(new PressureWatcher().lap(null), null, "sans fenêtre : rien");
}

function frozen() {
  section("course — ordre figé et voiture de sécurité");
  const rules = (o: Partial<LiveRules>): LiveRules => ({
    stage: 4,
    pole_column: 0,
    safety_car_exists: true,
    safety_car_active: true,
    safety_car_laps: 1,
    safety_car_lap_dist: 1000,
    safety_car_speed: 30,
    pit_lane_start_dist: 0,
    yellow_flag_state: 0,
    yellow_flag_laps: 0,
    message: "",
    player_message: "",
    participants: [],
    ...o,
  });
  const standings = [
    st({ id: 1, driver: "Leader", is_player: false, total_laps: 5, lap_dist: 900 }),
    st({ id: 2, driver: "Moi", is_player: true, total_laps: 5, lap_dist: 700 }),
    st({ id: 3, driver: "Derrière", total_laps: 5, lap_dist: 600 }),
  ];
  const caution = rules({
    participants: [
      { id: 1, place: 1, relative_laps: 0, column: 0, position_assignment: 0, pits_open: false },
      { id: 2, place: 2, relative_laps: 0, column: 2, position_assignment: 1, pits_open: false },
      { id: 3, place: 3, relative_laps: 0, column: 0, position_assignment: 2, pits_open: false },
    ],
  });
  const s = frozenState({ rules: caution, standings, trackLength: 5000, yellowState: 2 });
  eq(s?.target, { kind: "car", id: 1, name: "Leader" }, "neutralisation : file unique, suivre la place précédente");
  eq(s?.column, null, "file unique : pas de colonne");
  eq(s?.gapM, 200, "écart à la cible");
  eq(frozenState({ rules: rules({ stage: 2, participants: caution.participants }), standings, trackLength: 5000, yellowState: 0 }), null, "course normale : rien");

  const formation = rules({
    stage: 1,
    participants: [
      { id: 1, place: 1, relative_laps: 0, column: 0, position_assignment: 0, pits_open: false },
      { id: 3, place: 2, relative_laps: 0, column: 2, position_assignment: 0, pits_open: false },
      { id: 2, place: 3, relative_laps: 0, column: 0, position_assignment: 1, pits_open: false },
    ],
  });
  const f = frozenState({ rules: formation, standings, trackLength: 5000, yellowState: 0 });
  eq(f?.target, { kind: "car", id: 1, name: "Leader" }, "formation : même colonne");
  eq(f?.column, "left", "colonne de gauche");
  eq(f?.slot, 2, "place 2 dans la colonne");

  const lead = rules({
    participants: [{ id: 2, place: 1, relative_laps: 0, column: 0, position_assignment: 0, pits_open: false }],
  });
  eq(frozenState({ rules: lead, standings, trackLength: 5000, yellowState: 2 })?.target, { kind: "sc" }, "en tête : la voiture de sécurité");

  const tr = new FrozenOrderTracker();
  const inp = (o: { rules: LiveRules; yellow: number; standings?: LiveStanding[] }) => ({
    rules: o.rules,
    standings: o.standings ?? standings,
    trackLength: 5000,
    yellowState: o.yellow,
  });
  const k = (evs: { kind: string }[]) => evs.map((e) => e.kind);
  eq(k(tr.update(0, inp({ rules: caution, yellow: 1 }))), ["scOut"], "voiture de sécurité en piste");
  eq(k(tr.update(1, inp({ rules: caution, yellow: 2 }))), ["pitsClosed"], "stands fermés");
  eq(k(tr.update(3.5, inp({ rules: caution, yellow: 2 }))), ["follow"], "cible tenue 2 s : « suis Leader »");
  eq(k(tr.update(4, inp({ rules: caution, yellow: 2 }))), [], "pas de redite");
  // Le joueur est devant sa cible → « laisse passer ».
  const ahead = standings.map((x) => (x.is_player ? { ...x, lap_dist: 950 } : x));
  tr.update(10, inp({ rules: caution, yellow: 2, standings: ahead }));
  eq(k(tr.update(12.5, inp({ rules: caution, yellow: 2, standings: ahead }))), ["allowPass"], "devant la cible : laisse passer");
  eq(k(tr.update(13, inp({ rules: caution, yellow: 5 }))), ["scIn"], "dernier tour de la voiture de sécurité");
  eq(k(tr.update(14, inp({ rules: rules({ stage: 2, safety_car_active: false }), yellow: 6 }))), ["restart"], "relance");
}

function pitTraffic() {
  section("course — box partagé et sortie des stands");
  eq(aheadDist(4900, 100, 5000), 200, "distance en avant à travers la ligne");
  eq(aheadDist(100, 4900, 5000), 4800, "et dans l'autre sens");
  const w = new PitTrafficWatcher();
  const frame = (t: number, me: Partial<LiveStanding>, mate: Partial<LiveStanding>, others: Partial<LiveStanding>[] = []) =>
    w.update(t, [st({ driver: "Moi", is_player: true, ...me }), st({ driver: "Equipier", ...mate }), ...others.map((o) => st(o))], 5000);
  // Le joueur s'arrête au box (4300 m), puis ressort à 4600 m.
  frame(0, { in_pits: true, pit_state: 2, lap_dist: 4250 }, { lap_dist: 2000 });
  frame(1, { in_pits: true, pit_state: 3, lap_dist: 4300 }, { lap_dist: 2050 });
  frame(2, { in_pits: true, pit_state: 4, lap_dist: 4500 }, { lap_dist: 2100 });
  frame(3, { in_pits: false, pit_state: 0, lap_dist: 4600 }, { lap_dist: 2150 });
  eq(w.box, 4300, "box du joueur appris");
  approx(w.exit ?? 0, 4600, 1, "sortie des stands apprise");
  // L'équipier s'arrête au même box.
  frame(10, { lap_dist: 1000 }, { in_pits: true, pit_state: 2, lap_dist: 4250 });
  frame(11, { lap_dist: 1050 }, { in_pits: true, pit_state: 3, lap_dist: 4301 });
  eq(w.boxSharers, ["Equipier"], "partage du box repéré");
  // Le joueur demande l'arrêt pendant que l'équipier est au box.
  const ev = frame(12, { lap_dist: 1100, pit_state: 1 }, { in_pits: true, pit_state: 3, lap_dist: 4301 });
  eq(ev, [{ kind: "boxOccupied", driver: "Equipier" }], "box occupé");
  // Le joueur ressort, une voiture arrive à 150 m de la sortie à 60 m/s.
  frame(20, { in_pits: true, pit_state: 3, lap_dist: 4300 }, { lap_dist: 2000 }, [{ driver: "Rapide", lap_dist: 4350 }]);
  const exitEv = frame(21, { in_pits: true, pit_state: 4, lap_dist: 4500 }, { lap_dist: 2000 }, [{ driver: "Rapide", lap_dist: 4410 }]);
  eq(exitEv, [{ kind: "exitTraffic", driver: "Rapide" }], "voiture qui arrive à la sortie");
  // En piste, le joueur approche de la sortie ; un rival en sort.
  const w2 = new PitTrafficWatcher();
  const f2 = (t: number, me: number, rival: Partial<LiveStanding>) =>
    w2.update(t, [st({ driver: "Moi", is_player: true, lap_dist: me }), st({ driver: "Rival", ...rival })], 5000);
  f2(0, 100, { in_pits: true, pit_state: 4, lap_dist: 590 });
  f2(1, 200, { in_pits: false, lap_dist: 600 }); // sortie apprise à 600 m
  // Autre voiture, vue pour la 1re fois dans la voie : vitesse encore inconnue.
  const g2 = (t: number, me: number, d: number) =>
    w2.update(t, [st({ driver: "Moi", is_player: true, lap_dist: me }), st({ driver: "Rival2", in_pits: true, pit_state: 4, lap_dist: d })], 5000);
  eq(g2(50, 300, 500), [], "vitesse du rival inconnue : on attend");
  eq(g2(51, 320, 520), [{ kind: "rivalExiting", driver: "Rival2" }], "rival qui sort devant");
  eq(g2(52, 340, 540), [], "une seule fois");
}

function endgame() {
  section("course — fin de course");
  eq(pushWindowLaps(13600), 1, "Le Mans : dernier tour");
  eq(pushWindowLaps(4000), 4, "circuit court : 4 tours");
  const field = [
    st({ driver: "Devant", class_position: 1, time_behind_leader: 0, last_lap_time: 101, best_lap_time: 100.5 }),
    st({ driver: "Moi", is_player: true, class_position: 2, time_behind_leader: 1.2, last_lap_time: 100.4, best_lap_time: 100.2 }),
    st({ driver: "Derriere", class_position: 3, time_behind_leader: 1.9, last_lap_time: 99.9, best_lap_time: 99.8 }),
  ];
  const w = new EndgameWatcher();
  eq(w.update(field, 10, 4000), [], "trop tôt");
  const calls = w.update(field, 3, 4000).map((c) => c.kind);
  eq(calls, ["attack", "defend"], "attaque possible et menace derrière");
  eq(w.update(field, 2, 4000), [], "une fois par course");
  const fin = expectedFinish(
    [
      st({ driver: "A", class_position: 1, total_laps: 20, lap_dist: 0, last_lap_time: 101, best_lap_time: 101 }),
      st({ driver: "Moi", is_player: true, class_position: 2, total_laps: 20, lap_dist: -50, last_lap_time: 99, best_lap_time: 99 }),
    ],
    4000,
    { remainingS: 1800 },
  );
  eq(fin, { pos: 1, of: 2 }, "plus rapide : finit devant");
}

function tyreEvents() {
  section("course — pneus sales, blocage, choc");
  const w = new TyreEventWatcher();
  const dirty = [wheel({ surface: 2 }), wheel({ surface: 3 }), wheel({}), wheel({})];
  eq(w.update(0, dirty, 120, false), [], "pas encore tenu");
  eq(w.update(0.5, dirty, 120, false), [{ kind: "dirty" }], "pneus sales");
  eq(w.update(0.6, dirty, 120, false), [], "anti-radotage");
  const lock = [wheel({ slip_ratio: -0.95 }), wheel({}), wheel({}), wheel({})];
  w.update(1, lock, 150, false);
  eq(w.update(1.7, lock, 150, false), [{ kind: "lockFlatSpot", wheel: 0 }], "gros blocage avant gauche");
  w.noteCrash(10);
  eq(w.update(10.5, undefined, 0, false), [], "sans roues : rien");
  w.update(11, [wheel({}), wheel({}), wheel({}), wheel({})], 2, false);
  eq(w.update(14.1, [wheel({}), wheel({}), wheel({}), wheel({})], 2, false), [{ kind: "crashCheck" }], "arrêté après un choc");
  eq(w.update(16, [wheel({}), wheel({}), wheel({}), wheel({})], 40, false), [{ kind: "crashResume" }], "reprise");
}

function pitVoice() {
  section("course — menu des stands à la voix");
  const menu: PitMenuItem[] = [
    { name: "VIRTUAL ENERGY:", current: 0, options: ["No Change", "40% 8.1 laps", "60% 12.1 laps", "100% 20.2 laps"] },
    { name: "TIRES:", current: 0, options: ["No Change", "Medium", "Hard", "Wet"] },
    { name: "DAMAGE:", current: 0, options: ["Do Not Repair", "Repair Body", "Repair All"] },
    { name: "STOP/GO", current: 0, options: ["NO", "YES"] },
  ];
  eq(planPitCommand("pitFuelEnd", menu, { energyNeed: 0.55 }), { changes: [{ name: "VIRTUAL ENERGY:", index: 2, label: "60% 12.1 laps" }] }, "énergie pour finir : 60 %");
  eq(planPitCommand("pitEnergy", menu, { amount: 85 }), { changes: [{ name: "VIRTUAL ENERGY:", index: 3, label: "100% 20.2 laps" }] }, "énergie 85 → 100 %");
  eq(planPitCommand("pitTyresAll", menu, { compound: "Hard" }), { changes: [{ name: "TIRES:", index: 2, label: "Hard" }] }, "4 pneus, gomme montée");
  eq(planPitCommand("pitTyresNone", menu), { changes: [{ name: "TIRES:", index: 0, label: "No Change" }] }, "pas de pneus");
  eq(planPitCommand("pitWet", menu), { changes: [{ name: "TIRES:", index: 3, label: "Wet" }] }, "pneus pluie");
  eq(planPitCommand("pitDry", menu, { compound: "Wet" }), { changes: [{ name: "TIRES:", index: 1, label: "Medium" }] }, "slicks depuis la pluie : medium");
  eq(planPitCommand("pitRepairAll", menu), { changes: [{ name: "DAMAGE:", index: 2, label: "Repair All" }] }, "répare tout");
  eq(planPitCommand("pitRepairBody", menu), { changes: [{ name: "DAMAGE:", index: 1, label: "Repair Body" }] }, "carrosserie");
  eq(planPitCommand("pitRepairNone", menu), { changes: [{ name: "DAMAGE:", index: 0, label: "Do Not Repair" }] }, "rien");
  eq(planPitCommand("pitServePenalty", menu), { changes: [{ name: "STOP/GO", index: 1, label: "YES" }] }, "purger la pénalité");
  eq(planPitCommand("pitFuelAdd", menu, { amount: 20 }), { error: "noItem" }, "pas d'élément carburant");
  eq(planPitCommand("pitTyresFront", [], {}), { error: "noData" }, "menu vide");

  const fuelMenu: PitMenuItem[] = [
    { name: "FUEL:", current: 0, options: ["+ 0.0L", "+ 10.0L", "+ 20.0L", "+ 30.0L"] },
    { name: "F TIRES:", current: 0, options: ["No Change", "Soft", "Medium"] },
    { name: "R TIRES:", current: 0, options: ["No Change", "Soft", "Medium"] },
  ];
  eq(planPitCommand("pitFuelAdd", fuelMenu, { amount: 15 }), { changes: [{ name: "FUEL:", index: 2, label: "+ 20.0L" }] }, "relatif : +15 → +20");
  eq(planPitCommand("pitFuelEnd", fuelMenu, { fuelNeedL: 25, fuelNow: 10 }), { changes: [{ name: "FUEL:", index: 3, label: "+ 30.0L" }] }, "relatif : besoin 25 L");
  eq(planPitCommand("pitTyresFront", fuelMenu, { compound: "Medium" }), { changes: [{ name: "F TIRES:", index: 2, label: "Medium" }] }, "avant seulement");
  const abs: PitMenuItem[] = [{ name: "FUEL:", current: 0, options: ["40l/18 laps", "60l/27 laps", "80l/37 laps"] }];
  eq(planPitCommand("pitFuelEnd", abs, { fuelNeedL: 30, fuelNow: 20 }), { changes: [{ name: "FUEL:", index: 1, label: "60l/27 laps" }] }, "absolu : niveau = bord + besoin");
  eq(leadingNumber("75l/37 laps"), 75, "nombre en tête");
  eq(amountFrom("ajoute 20 litres"), 20, "quantité citée");
  eq(amountFrom("energie a 85 pour cent"), 85, "pourcentage cité");
  const t = ((k: string, o?: Record<string, unknown>) => `${k}:${o?.v ?? ""}`) as unknown as Tr;
  ok(describeMenu(menu, t as never).includes("live.pitPlanEnergy:No Change"), "plan d'arrêt lu");

  section("course — commandes vocales du stand (routeur)");
  eq(parsePitCommand("plein jusqu a la fin", "fr"), "pitFuelEnd", "FR plein jusqu'à la fin");
  eq(parsePitCommand("ajoute 20 litres", "fr"), "pitFuelAdd", "FR ajoute 20 litres");
  eq(parsePitCommand("change les quatre pneus", "fr"), "pitTyresAll", "FR quatre pneus");
  eq(parsePitCommand("mets des pneus pluie", "fr"), "pitWet", "FR pneus pluie");
  eq(parsePitCommand("repare tout", "fr"), "pitRepairAll", "FR répare tout");
  eq(parsePitCommand("purge la penalite", "fr"), "pitServePenalty", "FR purge la pénalité");
  eq(parsePitCommand("j ai purge ma penalite", "fr"), null, "FR question : jamais une commande");
  eq(parsePitCommand("faut il changer les pneus", "fr"), null, "FR question pneus : pas une commande");
  eq(parsePitCommand("fuel to the end", "en"), "pitFuelEnd", "EN fuel to the end");
  eq(parsePitCommand("change all four tyres", "en"), "pitTyresAll", "EN four tyres");
  eq(parsePitCommand("do i need new tyres", "en"), null, "EN question");
  eq(parsePitCommand("repara todo", "es"), "pitRepairAll", "ES repara todo");
  eq(parsePitCommand("alles reparieren", "de"), "pitRepairAll", "DE alles reparieren");
  eq(parsePitCommand("ripara tutto", "it"), "pitRepairAll", "IT ripara tutto");
  eq(route("ajoute 20 litres", "fr").intent, "pitFuelAdd", "routé en commande");
  eq(route("quelles sont mes pressions", "fr").intent, "pressures", "FR pressions");
  eq(route("what are my pressures", "en").intent, "pressures", "EN pressures");
  eq(route("est ce que j ai une penalite", "fr").intent, "penaltyStatus", "FR pénalité ?");
  eq(route("where will i finish", "en").intent, "finishPosition", "EN finish");
  eq(route("reveille moi a 14 h 30", "fr").intent, "alarm", "FR réveil");
  eq(route("note pour ce virage freine au panneau 100", "fr").intent, "voiceNote", "FR note vocale");
  eq(route("combien d essence", "fr").intent, "fuel", "question carburant inchangée");
}

function alarm() {
  section("course — réveil radio");
  const now = new Date(2026, 9, 18, 14, 0, 0).getTime();
  eq(parseAlarm("dans 20 minutes", now)?.at, now + 20 * 60_000, "dans 20 minutes");
  eq(parseAlarm("in 2 hours", now)?.at, now + 2 * 3_600_000, "in 2 hours");
  eq(new Date(parseAlarm("reveille moi a 14 h 30", now)!.at).getHours(), 14, "à 14 h 30 : heure");
  eq(new Date(parseAlarm("reveille moi a 14 h 30", now)!.at).getMinutes(), 30, "à 14 h 30 : minutes");
  ok(parseAlarm("reveille moi a 9 h", now)!.at > now, "heure passée : demain");
  eq(parseAlarm("reveille moi", now), null, "sans heure");
  const c = new AlarmClock();
  c.add({ at: now + 1000, label: "a" });
  c.add({ at: now + 1500, label: "doublon" });
  eq(c.pending.length, 1, "doublon ignoré");
  eq(c.due(now), [], "pas encore");
  eq(c.due(now + 2000).map((a) => a.label), ["a"], "échue");
  eq(c.pending.length, 0, "retirée");
}

function coexistAndCorners() {
  section("course — cohabitation");
  const c = (key: string): Candidate => ({ key, text: key, prio: "normal" });
  const cands = [c("flag:yellow"), c("pit:box"), c("forecast:soon"), c("gap:ahead"), c("battery:critical"), c("sc:out")];
  eq(coexistFilter(cands, false).length, 6, "inactif : tout passe");
  eq(coexistFilter(cands, true).map((x) => x.key), ["pit:box", "forecast:soon", "battery:critical"], "actif : stratégie, météo, batterie gardées");
  ok(overlapsOtherEngineer("penalty"), "pénalités en doublon");

  section("course — noms de virages");
  eq(apexFromUid("c1234"), 1234, "sommet depuis l'identifiant");
  eq(apexFromUid("x"), null, "identifiant inconnu");
  const list = [
    { dist: 300, n: "1", name: "La Source" },
    { dist: 4950, n: "19", name: null },
  ];
  eq(nearestCorner(list, 340, 5000)?.n, "1", "repère le plus proche");
  eq(nearestCorner(list, 20, 5000)?.n, "19", "à travers la ligne");
  eq(nearestCorner(list, 2000, 5000), null, "trop loin : rien");
  eq(spokenCorner(list[0]), "1, La Source", "numéro et nom");
  eq(spokenCorner(list[1]), "19", "numéro seul");
  // Bug relevé en comparant aux repères d'un autre outil : « carlos pace »
  // contient « spa » → Interlagos prenait la fiche de Spa.
  ok(cornerTableFor("Autodromo Jose Carlos Pace")?.match.includes("interlagos") ?? false, "Interlagos : sa propre fiche");
  ok(cornerTableFor("Circuit de Spa-Francorchamps")?.match.includes("francorchamps") ?? false, "Spa : toujours la sienne");
  eq(cornerTableFor("Circuit de la Sarthe"), null, "Le Mans : pas de fiche (numérotation non officielle)");
}

function spotterAndSettings() {
  section("course — spotter réglable");
  const car = { lat: -2.5, lon: 4.8, dv: 0 };
  eq(occupiedSides([car], { left: false, right: false }).left, false, "4,8 m devant : hors chevauchement (référence)");
  eq(occupiedSides([car], { left: false, right: false }, 5.0).left, true, "voiture longue : chevauchement");
  const s = new ProximitySpotter({ ...DEFAULT_SPOTTER, clearFrames: 4 });
  const side = [{ lat: -2.5, lon: 0, dv: 0 }];
  s.update(side, 40, true, 0);
  eq(s.update(side, 40, true, 0.05), "left", "voiture à gauche après 2 trames");
  s.update([], 40, true, 0.1);
  s.update([], 40, true, 0.15);
  eq(s.update([], 40, true, 0.2), null, "« libre » retardé (3 trames < 4)");
  eq(s.update([], 40, true, 0.25), "clear", "« libre » à la 4e trame");
  eq(sanitizeTuning({ carLength: 99, clearFrames: 0, stillEveryS: 1, minSpeedKmh: 500 }), { carLength: 6, clearFrames: 1, stillEveryS: 2, minSpeedKmh: 120 }, "bornes");

  section("course — réglages stockés");
  eq(parseExtras(null), DEFAULT_EXTRAS, "défauts");
  eq(parseExtras('{"pressure":false,"x":true}').pressure, false, "valeur lue");
  eq(parseExtras("{abîmé").pressure, true, "JSON abîmé : défauts");
  eq(parsePressureWindows('{"GT3":{"min":170,"max":190},"bad":{"min":200,"max":100}}'), { GT3: { min: 170, max: 190 } }, "fenêtres valides seulement");
  eq(parseSpotterTuning('{"carLength":5}').carLength, 5, "réglage spotter");
  eq(parseWheelActions('{"mute":{"kind":"winmm","joy":0,"button":3,"label":"B3"},"bad":1}'), { mute: { kind: "winmm", joy: 0, button: 3, label: "B3" } }, "liaisons de volant");

  section("course — notes vocales");
  const corners = [300, 1200, 3000];
  eq(cornerForNote(corners, 1000, 4000), 2, "prochain virage proche");
  eq(cornerForNote(corners, 1500, 4000), 2, "sinon le dernier passé");
  eq(cornerForNote([], 0, 4000), null, "sans virage");
  eq(noteDue(corners, new Set([2]), 1000, 4000, 70), 2, "note due ~3 s avant");
  eq(noteDue(corners, new Set([2]), 600, 4000, 70), null, "trop tôt");
  eq(noteDue(corners, new Set([3]), 1000, 4000, 70), null, "virage sans note");
}

export function run(): void {
  messages();
  penalties();
  pressures();
  frozen();
  pitTraffic();
  endgame();
  tyreEvents();
  pitVoice();
  alarm();
  coexistAndCorners();
  spotterAndSettings();
}
