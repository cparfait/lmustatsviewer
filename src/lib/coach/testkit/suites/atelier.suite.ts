/**
 * Suite « Atelier » (veille du 2026-10-20) : table des crans, audit IA,
 * profils, lecture d'un setup pour l'affichage, sonde d'équilibre (bilan au
 * box), découpe radio, événements de course, vigie de la plateforme, succès.
 */

import { section, eq, ok } from "../assert";
import type { LabLap, LiveData, RaceActivityRow, RecordOverviewRow, SetupEntry, SvmFile } from "@/lib/api";
import { learnFromRest, learnFromSvm, resolveIndex, topIndex, withResolvedIndices, type NotchTable } from "@/lib/setupNotches";
import { leverState, restTop, unknownLevers } from "@/lib/setupAssistant";
import { auditLevers, parseAuditReply } from "@/lib/setupAudit";
import { planProfile, profileForStyle } from "@/lib/setupProfiles";
import { countFixed, displayOf, indexOf, isFixedParam, keyFigures, notesOf } from "@/lib/setupView";
import { analyzeBalance, carMatches, circuitMatches, type ProbeLap, type ProbeSample } from "@/lib/balanceProbe";
import { pickComboSetup } from "@/lib/useBoxDebrief";
import { radioWindowOpen, splitRadio } from "@/lib/engineer/radioSplit";
import { RaceEventTracker } from "@/lib/raceEvents";
import { platformWatch } from "@/lib/platformWatch";
import { evaluateAchievements, longestWeekStreak } from "@/lib/achievements";
import lab from "@/i18n/lab";
import fr from "@/i18n/fr";
import en from "@/i18n/en";
import es from "@/i18n/es";
import de from "@/i18n/de";
import it from "@/i18n/it";

const p = (key: string, value: string, comment: string | null = null) => ({ key, value, comment });
const VEH = "C:\\LMU\\Installed\\Vehicles\\Ferrari_499P\\1.21\\499P.veh";

function svmOf(sections: SvmFile["sections"], veh = VEH, notes = ""): SvmFile {
  return {
    header: { vehicle_class: "Ferrari 499P Hypercar", upgrade_setting: "", veh_path: veh },
    sections: [{ name: "GENERAL", params: notes ? [p("Notes", `"${notes}"`)] : [] }, ...sections],
  };
}

function notches(): void {
  section("atelier — table des crans");
  const a = svmOf([
    { name: "REARWING", params: [p("RWSetting", "4", "5.0 deg")] },
    { name: "SUSPENSION", params: [p("FrontAntiSwaySetting", "3", "Detached")] },
  ]);
  const b = svmOf([{ name: "REARWING", params: [p("RWSetting", "6", "6.0 deg")] }]);
  const table: NotchTable = {};
  eq(learnFromSvm(table, a) + learnFromSvm(table, b), 3, "couples (index, affichage) appris sur deux fichiers");
  eq(learnFromSvm(table, b), 0, "rien de neuf la deuxième fois");
  const e = table["REARWING.RWSetting"];
  eq(resolveIndex(e, "6.0 deg"), 6, "correspondance exacte");
  eq(resolveIndex(e, "7.0 deg"), 8, "graduation régulière (0,5° par cran)");
  eq(resolveIndex(e, "7.0 mm"), null, "autre unité : on ne devine pas");
  eq(resolveIndex(e, "7.2 deg"), null, "hors graduation : on ne devine pas");
  const dflt = svmOf([{ name: "REARWING", params: [p("RWSetting", "", "5.5 deg")] }]);
  const r = withResolvedIndices(dflt, table);
  eq(r.svm.sections[1].params[0].value, "5", "réglage « par défaut » : index retrouvé");
  ok(r.inferred.has("REARWING.RWSetting"), "signalé comme retrouvé");
  eq(indexOf(dflt.sections[1].params[0]), null, "le fichier d'origine n'est pas modifié");

  section("atelier — bornes du jeu");
  const bounds = [
    { key: "VM_REAR_WING", value: 4, min: 0, max: 12, text: "5.0 deg" },
    { key: "VM_FRONT_ANTISWAY", value: 3, min: 0, max: 8, text: "Detached" },
  ];
  const t2: NotchTable = {};
  ok(learnFromRest(t2, bounds, a), "deux accords, aucun désaccord : appris");
  eq(topIndex(t2["REARWING.RWSetting"]), 11, "12 crans : index 0 à 11");
  const other = [
    { key: "VM_REAR_WING", value: 4, min: 0, max: 12, text: "9.0 deg" },
    { key: "VM_FRONT_ANTISWAY", value: 3, min: 0, max: 8, text: "Detached" },
  ];
  ok(!learnFromRest({}, other, a), "même index, autre texte : c'est une autre voiture, refusé");
  ok(!learnFromRest({}, [bounds[0]], a), "un seul accord : refusé");
  eq(restTop({ key: "x", value: 0, min: 0, max: 8, text: "" }), 7, "maxValue = nombre de crans → index max 7");
  const ls = leverState(dflt, "rearWing", null, table);
  eq([ls.values[0]?.index, ls.inferred], [5, true], "l'assistant voit l'aileron resté par défaut");
  eq(unknownLevers(dflt), ["rearWing"], "sans table : aileron présent mais cran inconnu (pas « non réglable »)");
  eq(unknownLevers(dflt, table), [], "avec la table : plus rien d'inconnu");
  eq(unknownLevers(svmOf([{ name: "CONTROLS", params: [p("TractionControlMapSetting", "", "N/A")] }])), [], "réglage figé : pas inconnu");
}

function audit(): void {
  section("atelier — audit IA (réponse validée)");
  const svm = svmOf([
    { name: "SUSPENSION", params: [p("FrontAntiSwaySetting", "0", "Detached"), p("RearAntiSwaySetting", "3", "60 N/mm")] },
    { name: "CONTROLS", params: [p("RearBrakeSetting", "20", "54.0:46.0"), p("TractionControlMapSetting", "5", "5")] },
  ]);
  const levers = auditLevers(svm, [{ key: "VM_REAR_ANTISWAY", value: 3, min: 0, max: 4, text: "60 N/mm" }]);
  ok(levers.some((l) => l.lever === "rearArb") && levers.some((l) => l.lever === "tc"), "réglages présents listés");
  const raw =
    'Voici :\n```json\n{"summary":"Arrière nerveux","changes":[' +
    '{"lever":"frontArb","dir":-1,"steps":1,"reason":"déjà à 0"},' +
    '{"lever":"rearArb","dir":1,"steps":2,"reason":"butée"},' +
    '{"lever":"rearArb","dir":-1,"steps":1,"reason":"calmer l\'arrière"},' +
    '{"lever":"rearArb","dir":-1,"steps":1,"reason":"doublon"},' +
    '{"lever":"magic","dir":1,"steps":1,"reason":"inconnu"},' +
    '{"lever":"tc","dir":1,"steps":3,"reason":"trop de crans"},' +
    '{"lever":"rearBrake","dir":-1,"steps":1,"reason":"freinage stable"},' +
    '{"lever":"tc","dir":1,"steps":1,"reason":"motricité"}]}\n```';
  const r = parseAuditReply(raw, levers);
  eq(r?.summary, "Arrière nerveux", "JSON entouré de texte lu");
  eq(r?.changes.map((c) => `${c.lever}${c.dir > 0 ? "+" : "-"}${c.steps}`), ["rearArb-1", "rearBrake-1", "tc+1"], "butées, doublon, inconnu et 3 crans écartés ; 3 au plus");
  eq(parseAuditReply("pas de JSON", levers), null, "réponse illisible → null");
}

function profiles(): void {
  section("atelier — profils");
  const svm = svmOf([
    { name: "REARWING", params: [p("RWSetting", "10", "9.0 deg")] },
    { name: "SUSPENSION", params: [p("RearAntiSwaySetting", "1", "40 N/mm"), p("FrontAntiSwaySetting", "2", "80 N/mm")] },
    { name: "CONTROLS", params: [p("TractionControlMapSetting", "8", "8"), p("RearBrakeSetting", "0", "56.0:44.0")] },
  ]);
  const bounds = [
    { key: "VM_REAR_WING", value: 10, min: 0, max: 12, text: "9.0 deg" },
    { key: "TRACTION_CONTROL", value: 8, min: 0, max: 10, text: "8" },
  ];
  const plan = planProfile(svm, "beginner", false, bounds);
  const by = (l: string) => plan.find((c) => c.lever === l);
  eq([by("rearArb")?.wanted, by("rearArb")?.applied], [-2, -1], "barre AR à 1 : descendue d'un seul cran (butée 0)");
  eq(by("rearBrake")?.applied, 0, "répartition déjà à 0 : rien");
  eq(by("tc")?.applied, 1, "TC 8 sur 0..9 : +1 au lieu de +3");
  const wet = planProfile(svm, "stable", true, bounds);
  eq(wet.find((c) => c.lever === "rearWing")?.wanted, 4, "pluie cumulée au profil (1 + 3)");
  eq(wet.find((c) => c.lever === "rearWing")?.applied, 1, "bornée à l'index 11");
  eq(profileForStyle("aggressive"), "qualif", "style agressif → Qualif");
}

function view(): void {
  section("atelier — lecture du setup");
  const svm = svmOf(
    [
      { name: "CONTROLS", params: [p("RearBrakeSetting", "30", "53.0:47.0"), p("TractionControlMapSetting", "", "6"), p("AntilockBrakeSystemMapSetting", "0", "N/A")] },
      { name: "REARWING", params: [p("RWSetting", "", "7.0 deg")] },
      { name: "FRONTLEFT", params: [p("CamberSetting", "10", "Fixed")] },
    ],
    VEH,
    "Bonne base",
  );
  eq(keyFigures(svm).map((f) => `${f.id}=${f.value}`), ["brakeBias=53.0:47.0", "tc=6", "rearWing=7.0 deg"], "vraies clés LMU, valeur du garage, réglage figé écarté");
  ok(isFixedParam(p("X", "0", "N/A")) && isFixedParam(p("X", "0", "Non-adjustable")), "réglages figés reconnus");
  eq(countFixed(svm), 2, "deux réglages figés");
  eq(displayOf(p("X", "4", null)), "4", "sans texte : valeur brute");
  eq(notesOf(svm), "Bonne base", "notes sans guillemets");
}

/** Tour synthétique : 3 virages (500 m lent, 1500 m rapide, 2500 m lent). */
function synthLap(frontEntryAt500: number): ProbeLap {
  const s: ProbeSample[] = [];
  for (let d = 0; d < 3000; d += 5) {
    const c = [500, 1500, 2500].find((x) => d >= x && d < x + 100);
    if (c == null) {
      s.push({ dist: d, speed: 250, throttle: 1, brake: 0, front: 0.2, rear: 0.2 });
      continue;
    }
    const k = d - c;
    const vMin = c === 1500 ? 200 : 90;
    const speed = vMin + Math.abs(k - 50) * 1.5;
    const before = k < 50;
    const front = c === 500 && before ? frontEntryAt500 : 2.5;
    s.push({ dist: d, speed, throttle: before ? 0 : k < 70 ? 0.3 : 0.8, brake: before ? 0.6 : 0, front, rear: 2.5 });
  }
  return { samples: s };
}

function balance(): void {
  section("atelier — sonde d'équilibre (bilan au box)");
  const r = analyzeBalance([synthLap(5), synthLap(4.8), synthLap(5.2)]);
  eq(r.laps, 3, "3 tours exploités");
  eq(r.worst && [r.worst.symptom, r.worst.phase, r.worst.regime, Math.round(r.worst.dist / 10) * 10], ["understeer", "entry", "slow", 550], "sous-virage à l'entrée du virage lent (apex à 550 m)");
  eq(analyzeBalance([synthLap(2.5), synthLap(2.5)]).worst, null, "voiture homogène : rien à corriger");
  eq(analyzeBalance([synthLap(5)]).worst, null, "un seul tour : pas de verdict");
  ok(circuitMatches("Sebring", "Sebring International Raceway"), "dossier circuit retrouvé dans le nom du circuit");
  ok(!circuitMatches("Monza", "Sebring International Raceway"), "autre circuit refusé");
  ok(carMatches("Ferrari 499P", ["AF Corse 499P #50"]), "modèle reconnu dans la livrée");
  ok(!carMatches("Porsche 963", ["AF Corse 499P #50"]), "autre voiture refusée");
  const entry = (id: number, car: string, circuit: string) => ({ id, car, circuit }) as SetupEntry;
  eq(pickComboSetup([entry(1, "Porsche 963", "Sebring"), entry(2, "Ferrari 499P", "Sebring"), entry(3, "Ferrari 499P", "Monza")], "Sebring International Raceway", ["AF Corse 499P #50"])?.id, 2, "dernier setup de la voiture sur ce circuit");
}

function radio(): void {
  section("atelier — réponse radio découpée");
  const text = "Ton pneu avant gauche chauffe trop. Réduis l'attaque en entrée de la chicane. Sur la ligne droite suivante, déplace la répartition d'un cran vers l'arrière ! Et garde ce rythme jusqu'au relais.";
  const parts = splitRadio(text, 80);
  ok(parts.length >= 3, "plusieurs morceaux");
  eq(parts.join(" "), text, "texte inchangé une fois recollé");
  ok(parts.every((x) => /[.!?]$/.test(x)), "coupé aux fins de phrase");
  const long = "a".repeat(200) + ".";
  eq(splitRadio(long, 80), [long], "une phrase trop longue reste entière");
  const tel = (o: Partial<LiveData["telemetry"]>) => ({ connected: true, paused: false, standings: [], telemetry: { speed_kmh: 250, throttle: 1, brake: 0, steering: 0, ...o } }) as unknown as LiveData;
  ok(radioWindowOpen(tel({})), "pleine charge, volant droit : ligne droite");
  ok(!radioWindowOpen(tel({ brake: 0.8 })), "au freinage : on attend");
  ok(radioWindowOpen(tel({ speed_kmh: 10, brake: 1 })), "à l'arrêt : tout de suite");
}

function events(): void {
  section("atelier — événements de course (widgets)");
  const tr = new RaceEventTracker();
  const frame = (o: { t: number; phase?: number; inPits?: boolean; pit?: number; laps?: number; last?: number; best?: number; finish?: number }) =>
    ({
      connected: true,
      paused: false,
      session: { track: "Spa", session: 10, game_phase: o.phase ?? 5, session_time: o.t },
      player: { total_laps: o.laps ?? 0, pit_state: o.pit ?? 0, finish_status: o.finish ?? 0, last_lap_time: o.last ?? 0, best_lap_time: o.best ?? 0, position: 3 },
      standings: [{ is_player: true, in_pits: o.inPits ?? false, vehicle_name: "Car" }],
    }) as unknown as LiveData;
  const kinds = (f: LiveData) => tr.push(f).map((e) => e.kind + (e.seconds != null ? `:${e.seconds}` : "") + (e.time != null ? `:${e.time}` : ""));
  eq(kinds(frame({ t: 0, phase: 4 })), [], "première trame : état pris sans rien dire");
  eq(kinds(frame({ t: 1, phase: 5 })), ["start"], "départ au vert");
  eq(kinds(frame({ t: 120, laps: 1, last: 119, best: 119 })), ["bestLap:119"], "meilleur tour de la session");
  tr.personalBest = 118;
  eq(kinds(frame({ t: 238, laps: 2, last: 117.5, best: 117.5 })), ["bestLap:117.5", "personalBest:117.5"], "record perso battu");
  eq(kinds(frame({ t: 300, laps: 2, inPits: true })), ["pitIn"], "entrée aux stands");
  kinds(frame({ t: 310, laps: 2, inPits: true, pit: 3 }));
  eq(kinds(frame({ t: 335.5, laps: 2, inPits: true, pit: 4 })), ["pitStop:25.5"], "arrêt avec sa durée");
  eq(kinds(frame({ t: 345, laps: 2 })), ["pitOut:45"], "sortie avec le temps dans la voie");
  eq(kinds(frame({ t: 400, laps: 3, last: 125, best: 117.5, finish: 1 })), ["checkered"], "damier, tour lent sans annonce");
  eq(kinds(frame({ t: 401, laps: 3, finish: 1 })), [], "chaque événement une seule fois");
}

function platform(): void {
  section("atelier — vigie de la plateforme");
  const lap = (n: number, duration: number, rear3rd: number, clean = true): LabLap => ({
    lap: n,
    start: n * 100,
    duration,
    clean,
    in_pits: false,
    abs_s: 0,
    tc_s: 0,
    front_3rd_max: 0.09,
    rear_3rd_max: rear3rd,
    ride_min: [0.02, 0.02, 0.02, 0.02],
    brake_front_max: 0.45,
    brake_rear_max: 0.42,
    lat_g_max: 1.9,
  });
  const w = platformWatch([lap(1, 101, 0.1), lap(2, 100, 0.1), lap(3, 101.5, 0.101), lap(4, 102, 0.099), lap(5, 101, 0.13), lap(6, 90, 0.2, false)]);
  eq(w.bestLap, 2, "référence = meilleur tour propre");
  eq(w.flags.map((f) => `${f.lap}:${f.metric}`), ["5:rear3rd"], "seul l'écart net au-dessus du bruit est signalé");
  eq(platformWatch([lap(1, 100, 0.1), lap(2, 101, 0.2)]).bestLap, null, "moins de 3 tours propres : rien");
}

function achievements(): void {
  section("atelier — succès");
  const day = 86400;
  const act = (d: number): RaceActivityRow => ({ timestamp: 1_700_000_000 + d * day, online: false });
  eq(longestWeekStreak([act(0), act(1), act(7), act(14), act(35)]), 3, "3 semaines de suite");
  const rec = (track: string, car: string, cls: string, sessions: number, improvements: number) =>
    ({ track, car, car_class: cls, sessions_count: sessions, improvements }) as RecordOverviewRow;
  const st = evaluateAchievements({
    totalLaps: 1200,
    totalLapsValid: 1100,
    drivingHours: 12.5,
    distanceKm: 900,
    races: 9,
    podiums: 1,
    wins: 0,
    onlineWins: 0,
    records: [rec("Spa", "499P", "Hypercar", 12, 8), rec("Monza", "499P", "Hypercar", 3, 3), rec("Spa", "M4", "GT3", 2, 1)],
    activity: [act(0), act(7)],
  });
  const g = (id: string) => st.find((s) => s.def.id === id)!;
  eq([g("laps").tier, g("laps").next], [2, 5000], "1200 tours : argent, or à 5000");
  eq(g("cleanRate").value, 91, "91 % de tours valides");
  eq(g("improvements").tier, 1, "12 records battus : bronze");
  eq(g("specialist").value, 1, "un combo roulé 10 sessions ou plus");
  eq([g("wins").tier, g("wins").progress], [0, 0], "aucune victoire");
}

function i18nKeys(): void {
  section("atelier — textes");
  const locales = { fr, en, es, de, it } as Record<string, Record<string, unknown>>;
  const keys = ["setups.qvKey", "setups.key.brakeBias", "setups.corner.ride", "setupDetail.notch", "setupDetail.showFixed_other", "setupAssistant.inferredHint"];
  const get = (o: unknown, k: string) => k.split(".").reduce<unknown>((a, x) => (a as Record<string, unknown> | undefined)?.[x], o);
  for (const [l, o] of Object.entries(locales)) ok(keys.every((k) => typeof get(o, k) === "string"), `clés de la page Setups présentes (${l})`);
  ok(Object.keys(lab).length === 5, "Atelier traduit en 5 langues (parité vérifiée par le typage)");
  ok(!/séance/i.test(JSON.stringify(lab.fr)), "« session », jamais « séance »");
}

export function run(): void {
  notches();
  audit();
  profiles();
  view();
  balance();
  radio();
  events();
  platform();
  achievements();
  i18nKeys();
}
