/**
 * Suite « radio » : quand parler (freinages appris, pilote occupé), qui a le
 * droit de parler (régimes, phases, budgets), anti-redite, variantes et prénom,
 * spotter de proximité, coach rigoureux (verdict mesuré) et commandes vocales.
 * Tout est pur (horloge passée en paramètre) → rejouable sans le jeu.
 */

import { section, ok, eq, approx } from "../assert";
import { BrakeMap, driverBusy, QUIET_BEFORE_BRAKE_M } from "@/lib/engineer/focus";
import { RadioPolicy, classOf, rivalOf, type PolicyCtx } from "@/lib/engineer/policy";
import { RadioArbiter, TEXT_REPEAT_LAPS, type Candidate } from "@/lib/engineer/arbiter";
import { VariantPicker, NameDoser, splitVariants, NAME_GAP_S } from "@/lib/engineer/variants";
import { ProximitySpotter, occupiedSides } from "@/lib/engineer/proximity";
import { route } from "@/lib/engineer/router";
import { commandFromPhrases, isAction } from "@/lib/engineer/commandPick";
import { CLOUD_PREP_KEYS, CLOUD_PREP_SAFETY_KEYS, estimateCostUsd, fixedPhrases, isFixedPhrase } from "@/lib/cloudVoicePrep";
import fr from "@/i18n/fr";
import en from "@/i18n/en";
import es from "@/i18n/es";
import de from "@/i18n/de";
import it from "@/i18n/it";
import { readFileSync } from "node:fs";
import {
  createCoachVoiceState,
  observeCorner,
  stepCoachVoice,
  judgeTip,
  welch,
  policyFor,
  type CoachDiagnostic,
  type DiagResult,
} from "@/lib/coach";

const c = (key: string, prio: Candidate["prio"], o: Partial<Candidate> = {}): Candidate => ({
  key,
  text: key,
  prio,
  ...o,
});

const ctx = (o: Partial<PolicyCtx> = {}): PolicyCtx => ({
  nowS: 1000,
  lap: 10,
  isRace: true,
  racing: true,
  inPits: false,
  finished: false,
  remainingS: 3600,
  lapsLeft: null,
  pitstops: 0,
  nearestGapS: Infinity,
  phases: true,
  budgets: true,
  ...o,
});

function focusSuite() {
  section("radio — freinages appris + pilote occupé");
  const m = new BrakeMap();
  const L = 5000;
  // Tour 1 : attaque de pédale à 1200 m → vu une fois, pas encore « connu ».
  m.push(1190, 0, 1, 250, L);
  m.push(1200, 0.6, 1, 250, L);
  eq(m.known().length, 0, "un seul tour : pas encore connu");
  // Tour 2 : même freinage à 1215 m (fusionné), puis relâche.
  m.push(1210, 0, 2, 250, L);
  m.push(1215, 0.7, 2, 250, L);
  eq(m.known().length, 1, "vu sur 2 tours : freinage connu");
  ok(Math.abs(m.known()[0] - 1207.5) < 1, "point recalé sur la moyenne");
  ok(Math.abs(m.distToNext(1000, L) - 207.5) < 1, "distance au prochain freinage");
  // Bouclage : depuis 4900 m, le prochain freinage est au tour suivant.
  ok(Math.abs(m.distToNext(4900, L) - (L - 4900 + 1207.5)) < 1, "bouclage du tour");
  // Appui à basse vitesse (stands) : ignoré.
  m.push(3000, 0, 2, 40, L);
  m.push(3010, 0.8, 2, 40, L);
  eq(m.known().length, 1, "appui lent ignoré");

  const snap = { brake: 0, steer: 0, distToBrake: 500, at: 1000 };
  ok(!driverBusy(snap, 1100), "ligne droite loin du freinage : libre");
  ok(driverBusy({ ...snap, distToBrake: QUIET_BEFORE_BRAKE_M - 1 }, 1100), "< 200 m du freinage : occupé");
  ok(driverBusy({ ...snap, brake: 0.2 }, 1100), "frein > 0,15 : occupé");
  ok(driverBusy({ ...snap, steer: -0.35 }, 1100), "volant > 0,30 : occupé");
  ok(!driverBusy({ ...snap, brake: 0.9 }, 3000), "télémétrie figée > 1 s : garde levée");
  ok(!driverBusy(null, 0), "aucune donnée : libre");
}

function policySuite() {
  section("radio — politique : familles, régimes, phases, budgets");
  eq(classOf(c("flag:yellow", "critical")), "safety", "critique = sécurité");
  eq(classOf(c("traffic:pack", "normal")), "safety", "trafic = sécurité");
  eq(classOf(c("pos:change", "chatty")), "situation", "position = situation");
  eq(classOf(c("group:lap", "chatty")), "comfort", "point de tour = confort");
  eq(classOf(c("pit:open", "normal")), "decision", "fenêtre = décision");
  eq(classOf(c("unknown:key", "normal")), "decision", "clé inconnue = décision (jamais bridée)");
  eq(rivalOf("closing:ahead:Jean Dupont"), "Jean Dupont", "rival d'un rapprochement");
  eq(rivalOf("rivalpit:Bob:2"), "Bob", "rival d'un arrêt");
  eq(rivalOf("pos:change"), null, "pas de rival");

  // Régimes.
  let p = new RadioPolicy();
  p.setRegime("battle", 10, 0);
  const mixed = [c("flag:yellow", "critical"), c("pos:change", "chatty"), c("pit:open", "normal")];
  eq(p.filter(mixed, ctx({ nearestGapS: 1 })).map((x) => x.key).join(","), "flag:yellow", "bagarre : sécurité seule");
  // Fin de bagarre : voisins > 3 s pendant 8 s.
  p.filter([], ctx({ nowS: 1000, nearestGapS: 5 }));
  p.filter([], ctx({ nowS: 1009, nearestGapS: 5 }));
  eq(p.regime.kind, "normal", "bagarre levée quand les voisins s'éloignent");

  p = new RadioPolicy();
  p.setRegime("home", 10, 1);
  eq(p.filter(mixed, ctx({ pitstops: 1 })).map((x) => x.key).join(","), "flag:yellow,pit:open", "ramener : sécurité + décisions");
  p.filter([], ctx({ pitstops: 2 }));
  eq(p.regime.kind, "normal", "ramener levé au prochain arrêt");

  p = new RadioPolicy();
  p.setRegime("quiet", 10, 0, 12);
  eq(p.filter(mixed, ctx({ lap: 11 })).length, 1, "tais-toi jusqu'au tour 12 : sécurité seule");
  p.filter([], ctx({ lap: 12 }));
  eq(p.regime.kind, "normal", "silence levé au tour 12");

  // Phases.
  p = new RadioPolicy();
  eq(p.filter([c("pos:change", "chatty")], ctx({ lap: 0 })).length, 0, "départ : pas de position au 1er tour");
  eq(p.filter([c("formation", "normal")], ctx({ lap: 0, racing: false })).length, 1, "briefing de formation autorisé");
  p.filter([], ctx({ lap: 1, nowS: 100 }));
  eq(p.filter([c("pos:change", "chatty")], ctx({ lap: 1, nowS: 110 })).length, 0, "moins de 20 s après le tour 1 : silence");
  eq(p.filter([c("pos:change", "chatty")], ctx({ lap: 1, nowS: 125 })).length, 1, "après 20 s : on parle");
  eq(p.filter([c("pos:change", "chatty")], ctx({ inPits: true })).length, 0, "stands : pas de position");
  eq(p.filter([c("pit:done", "normal")], ctx({ inPits: true })).length, 1, "stands : messages de stand");
  eq(p.filter([c("pit:open", "normal")], ctx({ remainingS: 600 })).length, 0, "20 dernières minutes : stratégie gelée");
  eq(p.filter([c("pit:box", "critical")], ctx({ remainingS: 600 })).length, 1, "le box critique reste");
  eq(p.filter([c("pos:change", "chatty")], ctx({ finished: true })).length, 0, "après le damier : silence");
  p.noteCrash(2000);
  eq(p.filter([c("pit:open", "normal")], ctx({ nowS: 2010 })).length, 0, "après un choc : sécurité seule");
  eq(p.filter([c("pit:open", "normal")], ctx({ nowS: 2040 })).length, 1, "30 s plus tard : retour");
  p.commit([c("pit:box", "critical")], ctx({ nowS: 3000 }));
  eq(p.filter([c("pos:change", "chatty")], ctx({ nowS: 3005 })).length, 0, "après un box : calme");
  eq(p.filter([c("pit:open", "normal")], ctx({ nowS: 3005 })).length, 1, "… sauf les décisions");
  eq(p.filter([c("pos:change", "chatty")], ctx({ phases: false, lap: 0 })).length, 1, "phases coupées : comportement historique");

  // Budgets.
  p = new RadioPolicy();
  const k = ctx({ lap: 20, nowS: 5000 });
  p.commit([c("pos:change", "chatty")], k);
  eq(p.filter([c("gap:ahead", "chatty")], k).length, 0, "situation : une fois par tour");
  eq(p.filter([c("gap:ahead", "chatty")], ctx({ lap: 21, nowS: 5100 })).length, 1, "tour suivant : de nouveau");
  p.commit([c("group:lap", "chatty")], k);
  eq(p.filter([c("lap:time", "chatty")], ctx({ lap: 22, nowS: 5200 })).length, 0, "confort : pas avant 3 tours");
  eq(p.filter([c("lap:time", "chatty")], ctx({ lap: 23, nowS: 5300 })).length, 1, "confort : au 3e tour");
  p.commit([c("closing:ahead:Bob", "normal"), c("opening:ahead:Bob", "chatty")], ctx({ lap: 30, nowS: 6000 }));
  eq(p.filter([c("rivalpit:Bob:1", "normal")], ctx({ lap: 30, nowS: 6001 })).length, 0, "2 messages max par rival et par tour");
  eq(p.filter([c("rivalpit:Bob:1", "normal")], ctx({ lap: 31, nowS: 6100 })).length, 1, "rival : budget remis à zéro au tour suivant");
  eq(p.filter([c("pos:change", "chatty")], ctx({ budgets: false, lap: 20, nowS: 5000 })).length, 1, "budgets coupés : historique");
  p.setRegime("essential", 40, 0);
  eq(p.filter([c("fastest", "chatty")], ctx({ lap: 50, nowS: 9000 })).length, 0, "essentiel : plus de confort");
}

function arbiterSuite() {
  section("radio — anti-redite (texte, A-B-A)");
  const a = new RadioArbiter();
  a.textRepeatLaps = TEXT_REPEAT_LAPS;
  const rain = (txt: string) => ({ key: "weather:rain", text: txt, prio: "normal" as const });
  eq(a.decide([rain("La pluie arrive")], 0, 1).spoken.length, 1, "A dit");
  eq(a.decide([rain("La pluie s'arrête")], 100, 2).spoken.length, 1, "B dit");
  const r = a.decide([rain("La pluie arrive")], 200, 3);
  eq(r.spoken.length, 0, "A redit 2 tours plus tard : bloqué");
  eq(r.rejected[0]?.reason, "repeat", "motif : redite");
  eq(a.decide([rain("La pluie arrive")], 300, 6).spoken.length, 1, "après 5 tours : de nouveau permis");
  eq(a.decide([c("flag:yellow", "critical")], 400, 7).spoken.length, 1, "sécurité 1");
  eq(a.decide([c("flag:yellow", "critical")], 401, 7).spoken.length, 1, "la sécurité n'est jamais bridée par la redite");
  const off = new RadioArbiter();
  off.decide([rain("La pluie arrive")], 0, 1);
  eq(off.decide([rain("La pluie arrive")], 100, 2).spoken.length, 1, "anti-redite coupé : historique");
}

function variantsSuite() {
  section("radio — variantes + prénom");
  eq(splitVariants("A | B |  C ").join("/"), "A/B/C", "découpe des variantes");
  eq(splitVariants("Sans variante").length, 1, "gabarit simple");
  const v = new VariantPicker(1);
  const said = [0, 1, 2, 3].map(() => v.pick("k", "A | B | C"));
  eq(said.join(""), "BCAB", "rotation depuis le départ tiré, sans répétition consécutive");
  eq(v.pick("simple", "Texte"), "Texte", "texte simple inchangé");

  const n = new NameDoser();
  const always = () => 0;
  eq(n.apply("Cris", "formation", "Briefing", 0, always), "Cris, Briefing", "départ : prénom dit");
  eq(n.apply("Cris", "race:final", "Dernier tour", NAME_GAP_S + 1, always), "Dernier tour", "jamais deux phrases de suite");
  eq(n.apply("Cris", null, "Autre", NAME_GAP_S + 2, always), "Autre", "phrase neutre");
  eq(n.apply("Cris", "race:final", "Dernier tour", NAME_GAP_S + 3, always), "Cris, Dernier tour", "ensuite, de nouveau permis");
  eq(n.apply("Cris", "pos:lead", "En tête", NAME_GAP_S + 10, always), "En tête", "pas avant 210 s");
  eq(n.apply("", "formation", "Briefing", 9999, always), "Briefing", "sans prénom : jamais");
}

function proximitySuite() {
  section("radio — spotter de proximité");
  const none = { left: false, right: false };
  ok(occupiedSides([{ lat: -2.5, lon: 1, dv: 0 }], none).left, "voiture à gauche");
  ok(occupiedSides([{ lat: 2.5, lon: -4, dv: 0 }], none).right, "voiture à droite, un peu derrière");
  ok(!occupiedSides([{ lat: 0.3, lon: 3, dv: 0 }], none).right, "juste devant (même ligne) : pas à côté");
  ok(!occupiedSides([{ lat: 2.5, lon: 8, dv: 0 }], none).right, "trop loin devant");
  ok(!occupiedSides([{ lat: 2.5, lon: 0, dv: 20 }], none).right, "passe en éclair : ignorée");
  ok(occupiedSides([{ lat: 2.5, lon: 5.2, dv: 0 }], { left: false, right: true }).right, "hystérésis de sortie");

  const s = new ProximitySpotter();
  const L = [{ lat: -2.5, lon: 0, dv: 0 }];
  eq(s.update(L, 50, false, 0), null, "non calibré : muet");
  eq(s.update(L, 50, true, 1), null, "1re trame : on attend la confirmation");
  eq(s.update(L, 50, true, 1.05), "left", "2e trame : voiture à gauche");
  const both = [...L, { lat: 2.4, lon: 1, dv: 0 }];
  s.update(both, 50, true, 2);
  eq(s.update(both, 50, true, 2.05), "three", "trois de front");
  s.update(L, 50, true, 3);
  eq(s.update(L, 50, true, 3.05), "clearRight", "la droite se libère");
  eq(s.update(L, 50, true, 8.1), "still", "rappel « toujours là »");
  s.update([], 50, true, 9);
  eq(s.update([], 50, true, 9.05), "clear", "libre");
  eq(s.update(L, 5, true, 10), null, "à l'arrêt : muet");
}

const diag = (lap: number, uid = "c3", n = 3): CoachDiagnostic =>
  ({
    code: "brake-timing",
    corner_uid: uid,
    n,
    lapNum: lap,
    magnitude: 20,
    sign: 1,
    unit: "m",
    relative: false,
  }) as unknown as CoachDiagnostic;

const diagnostic = (d: CoachDiagnostic): DiagResult => ({ kind: "diagnostic", diag: d }) as unknown as DiagResult;
const none = { kind: "none" } as unknown as DiagResult;
const calm = (t: number) => ({ throttle: 100, speed: 200, dist: 0, elapsed: t });

function rigorSuite() {
  section("radio — coach rigoureux (verdict mesuré)");
  ok(judgeTip([0.4, 0.5, 0.45], [0.1]) === null, "pas assez de passages après : pas de verdict");
  eq(judgeTip([0.4, 0.5, 0.45, 0.42], [0.1, 0.12, 0.08]), "better", "net progrès : mieux");
  eq(judgeTip([0.1, 0.12, 0.08], [0.4, 0.5, 0.45]), "worse", "net recul : pire");
  eq(judgeTip([0.3, 0.32, 0.29], [0.31, 0.3, 0.3]), null, "pas encore d'écart : on attend");
  eq(judgeTip([0.3, 0.32, 0.29], [0.31, 0.3, 0.3, 0.29, 0.32, 0.31]), "unchanged", "6 passages sans écart : inchangé");
  ok(welch([0.4, 0.5], [0.1, 0.1]).diff < 0, "diff négative = plus rapide après");

  const practice = policyFor("practice");
  const run = (before: number[], after: number[]) => {
    const st = createCoachVoiceState();
    st.rigor = true;
    let t = 0;
    let lap = 1;
    // Passages mesurés propres (la base « avant »), puis le passage fautif
    // confirmé par le moteur → conseil dit dans la fenêtre calme.
    for (const dt of before) {
      observeCorner(st, { corner_uid: "c3", n: 3, lapNum: lap++, dtVsRef: dt }, none, (t += 10), practice);
    }
    observeCorner(st, { corner_uid: "c3", n: 3, lapNum: lap, dtVsRef: before[0] }, diagnostic(diag(lap)), (t += 10), practice);
    lap++;
    const tip = stepCoachVoice(st, calm(t), [], 0);
    const outs = [];
    for (const dt of after) {
      observeCorner(st, { corner_uid: "c3", n: 3, lapNum: lap++, dtVsRef: dt }, none, (t += 10), practice);
      const m = stepCoachVoice(st, calm(t), [], 0);
      if (m) outs.push(m);
    }
    return { st, tip, outs };
  };
  const better = run([0.4, 0.45, 0.5], [0.05, 0.06, 0.04]);
  ok(!!better.tip, "conseil dit");
  ok(!!better.tip?.follow, "1re fois : annonce de la vérification");
  ok(better.outs.some((m) => m.kind === "resolved"), "progrès mesuré → « c'est mieux »");

  const worse = run([0.1, 0.12, 0.08], [0.5, 0.55, 0.6]);
  ok(worse.outs.some((m) => m.kind === "worse"), "recul mesuré → « oublie mon conseil »");
  ok(worse.st.closed.has("c3"), "virage clos pour la séance");
  // Un nouveau défaut sur un virage clos ne relance pas de conseil.
  observeCorner(worse.st, { corner_uid: "c3", n: 3, lapNum: 99, dtVsRef: 0.5 }, diagnostic(diag(99)), 9999, practice);
  ok(!worse.st.pending, "virage clos : plus de conseil");

  // Historique (rigueur coupée) : deux passages propres → « voilà, c'est ça ».
  const st = createCoachVoiceState();
  let t = 0;
  observeCorner(st, { corner_uid: "c3", n: 3, lapNum: 1, dtVsRef: 0.4 }, diagnostic(diag(1)), (t += 10), practice);
  stepCoachVoice(st, calm(t), [], 0);
  observeCorner(st, { corner_uid: "c3", n: 3, lapNum: 2, dtVsRef: 0.3 }, none, (t += 10), practice);
  observeCorner(st, { corner_uid: "c3", n: 3, lapNum: 3, dtVsRef: 0.3 }, none, (t += 10), practice);
  const legacy = stepCoachVoice(st, calm(t), [], 0);
  eq(legacy?.kind, "resolved", "rigueur coupée : comportement historique");
}

function commandsSuite() {
  section("radio — commandes vocales");
  eq(route("on se bat", "fr").intent, "radioBattle", "FR : on se bat");
  eq(route("juste l'essentiel", "fr").intent, "radioEssential", "FR : juste l'essentiel");
  const q = route("tais-toi jusqu'au tour 12", "fr");
  eq(q.intent, "radioQuiet", "FR : tais-toi jusqu'au tour N");
  eq(q.entities.lap, 12, "FR : tour lu");
  eq(route("tais toi", "fr").intent, "mute", "« tais-toi » seul = coupure totale (inchangé)");
  eq(route("on ramène la voiture", "fr").intent, "radioHome", "FR : on ramène la voiture");
  eq(route("tu peux reparler", "fr").intent, "radioNormal", "FR : reprise");
  eq(route("coach moi", "fr").intent, "coachMe", "FR : coach-moi");
  // Sans IA utilisable : une supposition même sous le seuil, sans changer la décision.
  const sure = route("combien d'essence", "fr");
  eq(sure.guess, sure.intent, "supposition = intention quand elle est sûre");
  const judged = route("tu penses que les pneus vont tenir", "fr");
  eq(judged.intent, null, "question de jugement : toujours laissée à l'IA");
  ok(judged.guess !== null, "… mais une supposition locale existe pour le cas sans IA");
  eq(route("raconte-moi une blague", "fr").guess, null, "rien de reconnu : aucune supposition");
  // Liste des commandes (phrases éditables) : dictée libre puis stricte.
  eq(commandFromPhrases("carburant", "", "fr", true), "fuel", "phrase courte de la liste, même avec IA");
  eq(commandFromPhrases("bla bla", "carburant", "fr", true), "fuel", "secours : la lecture stricte trouve la commande");
  eq(commandFromPhrases("est-ce que tu penses que celui de devant va craquer", "", "fr", true), null, "question longue → laissée à l'IA");
  ok(commandFromPhrases("est-ce que tu penses que celui de devant va craquer", "", "fr", false) !== null, "… mais sans IA, la liste répond");
  ok(isAction("radioBattle") && isAction("mute") && !isAction("fuel"), "commandes qui agissent repérées");
  eq(route("où est-ce que je perds du temps", "fr").intent, "whereLose", "FR : où je perds");
  eq(route("quiet until lap 20", "en").entities.lap, 20, "EN : lap read");
  eq(route("just the essentials", "en").intent, "radioEssential", "EN : essentials");
  eq(route("where am i losing time", "en").intent, "whereLose", "EN : where am I losing");
  eq(route("solo lo esencial", "es").intent, "radioEssential", "ES");
  eq(route("wo verliere ich zeit", "de").intent, "whereLose", "DE");
  eq(route("silenzio radio", "it").intent, "radioQuiet", "IT");
  eq(route("ma bagarre", "fr").intent, "rival", "« ma bagarre » reste une question sur le rival");
}

// ── « Préparer la voix » (voix en ligne) ────────────────────────────────────

function cloudPrepSuite() {
  section("radio — préparer la voix en ligne");
  // Priorité de chaque gabarit sans variable dit par l'ingénieur, relue dans le
  // source : la 1re priorité littérale qui suit `t("live.vX")` dans l'instruction.
  const src = readFileSync("src/lib/engineer/useRaceEngineer.ts", "utf8");
  const prios = new Map<string, Set<string>>();
  for (const m of src.matchAll(/t\("live\.(v\w+)"\)/g)) {
    const rest = src.slice(m.index! + m[0].length);
    const end = rest.search(/;|\},/);
    const stmt = end < 0 ? rest : rest.slice(0, end);
    const p = /"(spotter|critical|normal|chatty|coach)"/.exec(stmt)?.[1] ?? "?";
    if (!prios.has(m[1])) prios.set(m[1], new Set());
    prios.get(m[1])!.add(p);
  }
  const cloudOnly = (k: string) => [...(prios.get(k) ?? [])].every((p) => p === "normal" || p === "chatty");
  for (const k of CLOUD_PREP_KEYS) {
    ok(prios.has(k), `${k} est dit par l'ingénieur`);
    ok(cloudOnly(k), `${k} jamais en critical/spotter/coach (vu : ${[...(prios.get(k) ?? [])].join(",")})`);
  }
  for (const [k] of prios) {
    if (cloudOnly(k)) ok(CLOUD_PREP_KEYS.includes(k), `${k} (normal/chatty, sans variable) est préparé`);
  }
  for (const k of ["vFlagYellow", "vPuncture", "vBoxBox", "vPenalty", "vSpotLeft", "vCornerWatching"]) {
    ok(!CLOUD_PREP_KEYS.includes(k), `${k} (sécurité, spotter ou coach) n'est pas préparé`);
  }
  // Portée « toutes les annonces » (une seule voix) : alertes fixes + spotter.
  const spotKeys = new Set([...src.matchAll(/"live\.(vSpot\w+)"/g)].map((m) => m[1]));
  const criticalOnly = (k: string) => [...(prios.get(k) ?? [])].every((p) => p === "critical");
  for (const k of CLOUD_PREP_SAFETY_KEYS) {
    ok(spotKeys.has(k) || (prios.has(k) && criticalOnly(k)), `${k} : alerte critique ou phrase du spotter`);
    ok(!CLOUD_PREP_KEYS.includes(k), `${k} : pas en double avec les infos`);
  }
  for (const [k] of prios) {
    if (criticalOnly(k)) ok(CLOUD_PREP_SAFETY_KEYS.includes(k), `${k} (critique, sans variable) est préparé en portée « toutes »`);
  }
  for (const k of spotKeys) ok(CLOUD_PREP_SAFETY_KEYS.includes(k), `${k} (spotter) est préparé en portée « toutes »`);
  ok(!CLOUD_PREP_SAFETY_KEYS.includes("vCornerWatching"), "le coach par virage (chiffré) n'est pas préparé");

  // Toutes les variantes, sans doublon ; jamais un gabarit à variable ni un chiffre.
  eq(
    fixedPhrases(["Box | Box | Rentre au stand", "Écart {{d}}", "Tour 3 | Dernier tour"], (s) => s),
    ["Box", "Rentre au stand", "Dernier tour"],
    "variantes découpées, doublons, variables et chiffres écartés",
  );
  eq(fixedPhrases(["a | b"], (s) => s.toUpperCase()), ["A", "B"], "normalisation appliquée à chaque variante");
  const bundles = { fr, en, es, de, it } as unknown as Record<string, { live: Record<string, string> }>;
  for (const [lang, b] of Object.entries(bundles)) {
    const safety = CLOUD_PREP_SAFETY_KEYS.map((k) => b.live[k]);
    ok(safety.every((x) => typeof x === "string" && x.length > 0), `${lang} : chaque alerte / phrase du spotter existe`);
    ok(fixedPhrases(safety, (s) => s).every((p) => isFixedPhrase(p)), `${lang} : alertes et spotter en phrases fixes`);
    const tpls = CLOUD_PREP_KEYS.map((k) => b.live[k]);
    ok(tpls.every((x) => typeof x === "string" && x.length > 0), `${lang} : chaque gabarit existe`);
    const phrases = fixedPhrases(tpls, (s) => s);
    ok(phrases.length >= CLOUD_PREP_KEYS.length, `${lang} : au moins une phrase par gabarit (${phrases.length})`);
    ok(phrases.every((p) => isFixedPhrase(p) && !p.includes("|")), `${lang} : phrases fixes, une variante chacune`);
  }

  approx(estimateCostUsd("openai", "gpt-4o-mini-tts", 1_000_000), 15, 1e-9, "OpenAI ≈ 15 $/M caractères");
  approx(estimateCostUsd("openai", "tts-1-hd", 1_000_000), 30, 1e-9, "tts-1-hd plus cher");
  approx(estimateCostUsd("inconnu", "", 2_000), 0.1, 1e-9, "fournisseur inconnu : tarif prudent");
}

export function run() {
  focusSuite();
  policySuite();
  arbiterSuite();
  variantsSuite();
  proximitySuite();
  rigorSuite();
  commandsSuite();
  cloudPrepSuite();
}
