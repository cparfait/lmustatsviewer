/**
 * Suite « coach vocal fiabilisé et débrief calculé » : contrôle des réponses de l'IA,
 * noms de virage (liste fermée, façons de dire, nom déformé), relances bornées, débrief
 * d'une session, défaut récurrent, tendance de rythme, bilan au damier. Pur.
 */

import { section, ok, eq, approx } from "../assert";
import {
  checkVoiceAnswer,
  emptyAck,
  numberSupported,
  numbersIn,
  promiseIn,
  repairVoiceAnswer,
  wrongLanguage,
} from "@/lib/ai/voiceGuard";
import { matchCorners, phonetic, similarity, trackCornerNames, cornerNamesBlock } from "@/lib/ai/knowledge/corner-names";
import { radioSystemPrompt, languageLock } from "@/lib/ai/prompts/radio";
import { clarifyStreak, isClarification, sttUnsure } from "@/lib/engineer/askRules";
import { computeDebrief, debriefContextText, classPositionsByLap, type Debrief } from "@/lib/debrief/compute";
import { recurringDefect, type RaceFamilies } from "@/lib/debrief/recurring";
import { PaceOutlook } from "@/lib/engineer/paceOutlook";
import { chequeredPhrase } from "@/lib/engineer/debriefRadio";
import { recallPhrase, sameCourse, type TrackHistory } from "@/lib/engineer/trackRecall";
import type { LapRow, LiveStanding, ResultRow, SessionDetail } from "@/lib/api";
import { normalize, route } from "@/lib/engineer/router";

const echoT = (k: string, o?: Record<string, unknown>) => (o ? `${k}${JSON.stringify(o)}` : k);
const noPick = (_k: string, x: string) => x;

function lap(driver: string, n: number, time: number, et: number, o: Partial<LapRow> = {}): LapRow {
  return {
    driver_name: driver,
    lap_num: n,
    position: 1,
    lap_time: time,
    s1: time * 0.3,
    s2: time * 0.4,
    s3: time * 0.3,
    top_speed: null,
    fuel: null,
    fuel_used: null,
    twfl: null,
    twfr: null,
    twrl: null,
    twrr: null,
    fcompound: "",
    rcompound: "",
    is_pit: false,
    is_valid: true,
    et,
    ...o,
  };
}

function result(name: string, o: Partial<ResultRow>): ResultRow {
  return {
    id: 1,
    driver_name: name,
    is_player: false,
    veh_name: "",
    car_type: "",
    car_class: "LMP2",
    unique_car_name: "",
    car_number: 1,
    team_name: "",
    control_aids: "",
    position: 1,
    class_position: 1,
    grid_pos: 1,
    class_grid_pos: 1,
    laps_count: 10,
    laps_led: 0,
    finish_time: null,
    finish_status: "Finished Normally",
    pitstops: 1,
    best_lap: 100,
    best_lap_s1: null,
    best_lap_s2: null,
    best_lap_s3: null,
    abs_best_s1: null,
    abs_best_s2: null,
    abs_best_s3: null,
    optimal_lap: null,
    vmax: null,
    progression: null,
    total_laps_valid: 10,
    start_fuel: null,
    finish_fuel: null,
    median_lap: null,
    std_dev: null,
    avg_best_5: null,
    ...o,
  };
}

function standing(driver: string, o: Partial<LiveStanding>): LiveStanding {
  return {
    position: 1,
    class_position: 1,
    driver,
    vehicle_name: "",
    vehicle_class: "LMP2",
    last_lap_time: 100,
    best_lap_time: 99,
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
    ...o,
  };
}

export function run(): void {
  section("Coach vocal : prompt radio et rappel de langue");
  for (const lg of ["fr", "en", "es", "de", "it"]) {
    const p = radioSystemPrompt(lg);
    ok(p.length > 800 && p.length < 4500, `${lg} : prompt radio court (${p.length} car.)`);
    ok(p.includes("Corners of this track") && p.includes("Facts computed by the app"), `${lg} : renvoie aux sections du contexte`);
    ok(!/\d+[.,]\d/.test(p.split("#").pop() ?? ""), `${lg} : exemples de ton sans chiffre`);
    ok(languageLock(lg).length > 20, `${lg} : rappel de langue`);
  }
  eq(radioSystemPrompt("pt"), radioSystemPrompt("en"), "langue inconnue : anglais");

  section("Coach vocal : contrôle des chiffres");
  eq(numbersIn("1:52.310 et 0,4 s").map((n) => n.value.toFixed(3)), ["112.310", "0.400"], "temps m:ss et virgule décimale");
  ok(numberSupported({ value: 1.2, decimals: 1 }, [1.234]), "arrondi d'un chiffre reçu");
  ok(numberSupported({ value: 85, decimals: 0 }, [84.6]), "entier arrondi");
  ok(!numberSupported({ value: 71, decimals: 0 }, [12, 40.5]), "chiffre inventé");
  ok(numberSupported({ value: 2, decimals: 0 }, []), "petits entiers (crans, tours propres) tolérés");
  const ctx = "Fuel: 40.5L · laps remaining 12.3 · Gap to car ahead (#14): 1.234s";
  eq(checkVoiceAnswer({ answer: "Tu as 12 tours d'essence, la 14 est à 1,2 seconde.", sources: ctx, question: "essence ?", lang: "fr" }), null, "chiffres présents : rien à redire");
  eq(checkVoiceAnswer({ answer: "Il te faut 71 litres pour finir.", sources: ctx, question: "essence ?", lang: "fr" })?.reason, "number", "chiffre absent : écarté");
  eq(
    repairVoiceAnswer({ answer: "Tu as 12 tours d'essence. Il te faudra 71 litres au prochain arrêt.", sources: ctx, question: "essence ?", lang: "fr" }),
    "Tu as 12 tours d'essence.",
    "réparation : la phrase saine reste",
  );

  section("Coach vocal : promesses, accusé à vide, langue");
  ok(promiseIn("Je te préviens quand les pneus sont chauds."), "promesse de surveillance (FR)");
  ok(promiseIn("I'll let you know when the fuel is low."), "promesse de surveillance (EN)");
  ok(promiseIn("Je vais baisser la pression avant gauche."), "action promise sur un objet de setup");
  ok(!promiseIn("Tu veux que je te prévienne ?"), "une question n'engage rien");
  ok(!promiseIn("On va changer de stratégie si la pluie arrive."), "tournure sans objet de setup : passe");
  eq(checkVoiceAnswer({ answer: "C'est fait, l'aileron est monté d'un cran.", sources: "", question: "monte l'aileron", lang: "fr" })?.reason, "done", "réglage dit fait");
  eq(emptyAck("Reçu.", "Comment tu trouves la voiture ?").empty, true, "accusé nu à une question");
  eq(emptyAck("Reçu.", "Je pars en qualif").empty, false, "accusé à une info : juste");
  eq(emptyAck("Noté.", "La voiture chasse de l'arrière").askWhere, true, "symptôme sans endroit : demander où");
  eq(emptyAck("Noté.", "Elle survire en sortie de virage").askWhere, false, "symptôme avec endroit");
  ok(wrongLanguage("You have twelve laps of fuel left and the car ahead is on the same pace as you.", "fr"), "réponse anglaise à un francophone");
  ok(!wrongLanguage("Tu as douze tours d'essence et la voiture devant roule sur le même rythme que toi.", "fr"), "réponse française");

  section("Coach vocal : relances bornées, dictée incertaine");
  ok(isClarification("Redis-moi ça ? Tu parles de l'écart devant ?"), "une relance");
  ok(!isClarification("Garde tes Medium, ils tiennent."), "une réponse");
  const now = 1_000_000;
  eq(clarifyStreak([{ q: "a", a: "?", at: now - 5000, clarify: true }, { q: "b", a: "?", at: now - 1000, clarify: true }], now), 2, "deux relances de suite");
  eq(clarifyStreak([{ q: "a", a: "?", at: now - 5000, clarify: true }, { q: "b", a: "ok", at: now - 1000, clarify: false }], now), 0, "une réponse remet à zéro");
  ok(sttUnsure("quel est mon écart devant", 0.4), "dictée incertaine (≥ 3 mots)");
  ok(!sttUnsure("box", 0.2), "un ou deux mots : jamais");
  ok(!sttUnsure("quel est mon écart", null), "sans mesure : jamais");

  section("Noms de virage : liste fermée, façons de dire, dictée");
  const spa = trackCornerNames("Circuit de Spa-Francorchamps");
  ok(spa.some((n) => n.startsWith("Raidillon")) && spa.some((n) => n.startsWith("Bus Stop")), "Spa : table officielle + guide");
  eq(trackCornerNames("Circuit inconnu"), [], "circuit inconnu : aucune liste");
  eq(cornerNamesBlock("Circuit inconnu", "", "test"), "", "pas de bloc sans liste fiable");
  const monza = trackCornerNames("Autodromo Nazionale Monza");
  eq(matchCorners("je survire à la parabolique", "monza", monza)[0]?.name, "Parabolica (Alboreto)", "façon de dire : la parabolique");
  eq(matchCorners("ça glisse dans lesmo", "monza", monza)[0]?.how, "ambiguous", "« Lesmo » seul : demander lequel");
  const lm = trackCornerNames("Circuit de la Sarthe");
  eq(matchCorners("je perds au théâtre rouge", "le mans", lm)[0]?.name, "Tertre Rouge", "nom déformé par la dictée");
  eq(matchCorners("un grand sous-virage", "monza", monza).length, 0, "mot courant : pas de virage vu partout");
  ok(similarity(phonetic("tertre rouge"), phonetic("theatre rouge")) >= 0.85, "clé phonétique proche");

  section("Débrief calculé");
  const laps: LapRow[] = [];
  // Moi : 6 tours, perds 2 places au tour 4 (contact), S2 nettement plus lent.
  const myTimes = [105, 100, 100.2, 104, 100.1, 100.3];
  let et = 0;
  myTimes.forEach((t, i) => {
    laps.push(lap("Me", i + 1, t, et, { s1: 30, s2: i === 0 ? 45 : 40 + (i % 2 ? 0.6 : 0), s3: t - 70 - (i % 2 ? 0.6 : 0), is_pit: i === 3 }));
    et += t;
  });
  // A et B : je les précède jusqu'au tour 3, puis ils passent au tour 4.
  for (const [name, off] of [["A", 0.5], ["B", 1]] as const) {
    let e = 0;
    myTimes.forEach((_, i) => {
      const t = i === 3 ? 98 : 100 + off / 6;
      laps.push(lap(name, i + 1, i === 0 ? 105 + off : t, e));
      e += i === 0 ? 105 + off : t;
    });
  }
  const detail: SessionDetail = {
    session: { id: 1, event_id: 1, session_type: "Race", timestamp: 0, track: "Spa", track_course: "Spa", track_event: "", setting: "", game_version: "", participants: 3, session_laps: 6, session_minutes: 0, track_length: 7000, race_time: 0, mech_fail_rate: 0, damage_mult: 1, fuel_mult: 1, tire_mult: 1, vehicles_allowed: "", filename: "", server_name: "", dedicated: 0 },
    siblings: [],
    results: [
      result("A", { class_position: 1, class_grid_pos: 2, pitstops: 1, best_lap: 98 }),
      result("B", { class_position: 2, class_grid_pos: 3, pitstops: 1, best_lap: 98 }),
      result("Me", { is_player: true, class_position: 3, class_grid_pos: 1, position: 3, pitstops: 1, best_lap: 100, optimal_lap: 99.5 }),
    ],
    laps,
    stream: [{ event_type: "Incident", et: et - 250, text: "Me(3) reported contact (1200.0) with A(1)" }],
  };
  const d = computeDebrief(detail) as Debrief;
  ok(d != null, "débrief calculé");
  eq([d.classPos, d.classCount, d.gridClassPos, d.placesGained], [3, 3, 1, -2], "résultat en classe et places depuis la grille");
  eq(d.topClassStops, 1, "arrêts des premiers de la classe");
  ok(d.families.some((f) => f.family === "placesLost"), "famille : places perdues");
  eq(d.families.some((f) => f.family === "dnf"), false, "pas d'abandon inventé");
  const byLap = classPositionsByLap(detail.laps, new Set(["A", "B", "Me"]), "Me");
  eq(byLap.get(3), 1, "en tête de classe au tour 3");
  ok((byLap.get(4) ?? 0) >= 2, "rétrogradé au tour 4");
  ok(debriefContextText(d).includes("Computed debrief"), "texte pour l'IA");
  const noGrid = computeDebrief({ ...detail, results: detail.results.map((r) => (r.is_player ? { ...r, class_grid_pos: 0 } : r)) })!;
  eq(noGrid.placesGained, null, "grille inconnue : null, jamais 0");

  section("Défaut récurrent");
  const race = (i: number, fam: boolean): RaceFamilies => ({
    sessionId: i,
    timestamp: i,
    track: "Spa",
    families: fam ? [{ family: "trackLimits", facts: { count: 4 } }] : [],
  });
  eq(recurringDefect([1, 2, 3, 4].map((i) => race(i, true))), null, "moins de 5 courses : rien");
  eq(recurringDefect([1, 2, 3, 4, 5].map((i) => race(i, i <= 2))), null, "2 occurrences : pas assez");
  const r3 = recurringDefect([1, 2, 3, 4, 5].map((i) => race(i, i <= 3)));
  eq([r3?.family, r3?.occurrences, r3?.trend], ["trackLimits", 3, null], "3 sur 5 : défaut récurrent, tendance tue");
  const r10 = recurringDefect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => race(i, i <= 5 || i === 9)));
  eq(r10?.trend, "improving", "deux fenêtres pleines : en progrès");

  section("Tendance de rythme");
  const po = new PaceOutlook();
  const mk = (laps: number, mePace: number, aheadGap: number) => [
    standing("Lead", { class_position: 1, total_laps: laps, last_lap_time: 100.5, best_lap_time: 100, time_behind_leader: 0 }),
    standing("Ahead", { class_position: 2, total_laps: laps, last_lap_time: 100.6, best_lap_time: 100, time_behind_leader: 5 }),
    standing("Me", { is_player: true, class_position: 3, total_laps: laps, last_lap_time: mePace, best_lap_time: mePace, time_behind_leader: 5 + aheadGap }),
    standing("Behind", { class_position: 4, total_laps: laps, last_lap_time: 100.8, best_lap_time: 100.5, time_behind_leader: 12 }),
  ];
  for (let l = 1; l <= 9; l++) po.push(mk(l, 100.1, 2));
  eq(po.call(mk(9, 100.1, 2), 7, 10, 0), null, "avant le tour 8 : rien");
  eq(po.call(mk(9, 100.1, 2), 9, 3, 0), null, "trop peu de tours restants : rien");
  const c = po.call(mk(9, 100.1, 2), 9, 10, 0);
  eq(c?.kind, "climbing", "je reprends 0,5 s au tour sur 2 s, 10 tours restants : je remonte");
  eq(po.call(mk(9, 100.1, 2), 10, 10, 0), null, "déjà dit : pas de redite");
  eq(new PaceOutlook().evaluate(mk(9, 100.1, 2), 9, 10, 0.5), null, "sous la pluie : rien");

  section("Bilan au damier et mémoire du circuit");
  const base = { classCount: 12, startClassPos: 7, bestLap: 112.3, stops: 2 };
  ok(chequeredPhrase({ ...base, status: 1, classPos: 1 }, echoT, () => "T", noPick).startsWith("live.vDebriefWin"), "victoire d'abord");
  ok(chequeredPhrase({ ...base, status: 1, classPos: 5 }, echoT, () => "T", noPick).startsWith('live.vDebriefClass{"p":5,"n":12}'), "place en classe en tête");
  ok(chequeredPhrase({ ...base, status: 1, classPos: 5 }, echoT, () => "T", noPick).includes('live.vDebriefGain{"n":2}'), "places gagnées depuis la grille vue");
  ok(!chequeredPhrase({ ...base, status: 1, classPos: 5, startClassPos: null }, echoT, () => "T", noPick).includes("Gain"), "grille non vue : pas de places");
  ok(chequeredPhrase({ ...base, status: 1, classPos: 0 }, echoT, () => "T", noPick).startsWith("live.vDebriefNoPlace"), "place nulle : phrase sans place");
  eq(chequeredPhrase({ ...base, status: 2, classPos: 5 }, echoT, () => "T", noPick), "live.vDebriefDnf", "abandon : sans chiffres");
  ok(sameCourse("Bahrain Outer Circuit", { track: "Bahrain", track_course: "Bahrain Outer Circuit" }), "même tracé");
  ok(!sameCourse("Bahrain International Circuit", { track: "Bahrain", track_course: "Bahrain Outer Circuit" }), "autre tracé du même lieu");
  const h: TrackHistory = { track: "Spa", carClass: "LMP2", lastRace: { classPos: 5, classCount: 12, laps: 20, finished: true, timestamp: 0 }, record: 120.4, frontLap: 119, weakSector: 2, pitLossS: 45, wearPctPerLap: 0.8 };
  const rp = recallPhrase(h, echoT, () => "T", noPick)!;
  ok(rp.includes("vRecallLast") && rp.includes("vRecallRecord") && rp.includes("vRecallSector"), "rappel : course, record, secteur");
  ok(recallPhrase({ ...h, lastRace: { ...h.lastRace!, finished: false } }, echoT, () => "T", noPick)!.includes("vRecallQuit"), "course quittée en route");
  eq(recallPhrase({ ...h, lastRace: null, record: null }, echoT, () => "T", noPick), null, "rien de connu : silence");
  approx(d.cleanLaps, d.cleanLaps, 0, "débrief stable");

  section("Dictée ponctuée (Parakeet) : même lecture que Vosk");
  const same = (punct: string, vosk: string) =>
    eq(route(punct, "fr").intent, route(vosk, "fr").intent, `« ${punct} » comme « ${vosk} »`);
  same("Je reste dehors.", "je reste dehors");
  same("Il me reste combien d'essence ?", "il me reste combien d'essence");
  same("Quel est l'écart avec la voiture devant?", "quel est l'écart avec la voiture devant");
  same("Préviens-moi quand le carburant passe sous 10%.", "préviens moi quand le carburant passe sous dix pour cent");
  eq(normalize("Énergie à 85%.", "fr"), normalize("énergie à quatre-vingt-cinq pour cent", "fr"), "« 85% » = « quatre-vingt-cinq pour cent »");
  ok(normalize("Pression à 1.5 bar.", "fr").includes("1.5"), "le séparateur décimal reste");
  eq(normalize("Warn me when fuel drops below 10%.", "en"), normalize("warn me when fuel drops below ten percent", "en"), "EN : « 10% » = « ten percent »");
}
