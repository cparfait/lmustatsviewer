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
import {
  CLOUD_PREP_ALERT_KEYS,
  CLOUD_PREP_KEYS,
  cloudModeFor,
  cloudPrepKeys,
  estimateCostUsd,
  fixedPhrases,
  isFixedPhrase,
  segmentsWanted,
} from "@/lib/cloudVoicePrep";
import {
  assembleSegments,
  buildLexicon,
  formBefore,
  isSegmentTemplateKey,
  joinPcm,
  numberSegments,
  segmentInventory,
  trimSilence,
  valueSegments,
  type SegmentEntry,
} from "@/lib/cloudVoiceSegments";
import { benchFamilies, benchRoute, benchText, type BenchFacts } from "@/lib/cloudVoiceBench";
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

// Gabarits livrés à variantes : chaque formulation garde les mêmes {{variables}}
// (sinon une annonce sur trois perd son chiffre), dans les 5 langues ; les
// réflexes (spotter, drapeaux jaune/rouge/FCY) restent une phrase unique.
function variantTemplatesSuite() {
  section("radio — gabarits à variantes (5 langues)");
  const bundles = { fr, en, es, de, it } as unknown as Record<string, { live: Record<string, unknown> }>;
  const varsOf = (s: string) => [...new Set([...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))].sort().join(",");
  const reflex = (k: string) => k.startsWith("vSpot") || ["vFlagYellow", "vFlagFcy", "vFlagStopped"].includes(k);
  const withVariants: Record<string, Set<string>> = {};
  for (const [lang, b] of Object.entries(bundles)) {
    const keys = new Set<string>();
    for (const [key, text] of Object.entries(b.live)) {
      if (!/^v[A-Z]/.test(key) || typeof text !== "string") continue;
      const v = splitVariants(text);
      if (v.length < 2) continue;
      keys.add(key);
      const ref = varsOf(v[0]);
      const odd = v.filter((x) => varsOf(x) !== ref);
      eq(odd, [], `${lang} ${key} : mêmes variables dans chaque variante (${ref || "aucune"})`);
      ok(v.length <= 3, `${lang} ${key} : au plus 3 variantes`);
      ok(!reflex(key), `${lang} ${key} : réflexe sans variante`);
    }
    for (const k of ["vBoxBox", "vPuncture"]) ok(splitVariants(String(b.live[k])).length <= 2, `${lang} ${k} : 2 variantes au plus`);
    ok(keys.size >= 40, `${lang} : au moins 40 gabarits à variantes (${keys.size})`);
    withVariants[lang] = keys;
  }
  const ref = [...withVariants.fr].sort().join(",");
  for (const lang of ["en", "es", "de", "it"]) {
    eq([...withVariants[lang]].sort().join(","), ref, `${lang} : mêmes gabarits à variantes qu'en français`);
  }
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
    ok(!CLOUD_PREP_KEYS.includes(k), `${k} (sécurité, spotter ou coach) hors de la liste « information »`);
  }

  // Phrases urgentes : chaque gabarit critique/spotter sans variable est préparé
  // (la voix en ligne ne les dit que depuis le cache), et seulement eux.
  for (const [k, ps] of prios) {
    if ([...ps].some((p) => p === "critical" || p === "spotter")) {
      ok(CLOUD_PREP_ALERT_KEYS.includes(k), `${k} (urgent, sans variable) est dans les phrases urgentes`);
    }
  }
  for (const m of src.matchAll(/"live\.(vSpot\w+)"/g)) {
    ok(CLOUD_PREP_ALERT_KEYS.includes(m[1]), `spotter ${m[1]} préparé`);
  }
  ok(CLOUD_PREP_ALERT_KEYS.every((k) => !CLOUD_PREP_KEYS.includes(k)), "aucune clé dans les deux listes");
  eq(cloudPrepKeys(true), [...CLOUD_PREP_KEYS], "alertes en voix locale : seulement l'information");
  eq(cloudPrepKeys(false).length, CLOUD_PREP_KEYS.length + CLOUD_PREP_ALERT_KEYS.length, "sinon : information + urgentes");

  // Voix en ligne : en direct pour l'information et les réponses, depuis le cache
  // pour l'urgent, jamais pour l'urgent avec « alertes en voix locale ».
  eq(cloudModeFor("normal", false, false), "live", "information : en direct");
  eq(cloudModeFor("chatty", false, true), "live", "bavard : en direct, même alertes locales");
  eq(cloudModeFor("critical", true, true), "live", "réponse au pilote : en direct");
  for (const p of ["critical", "spotter", "coach"] as const) {
    eq(cloudModeFor(p, false, false), "cached", `${p} : seulement préparé`);
    eq(cloudModeFor(p, false, true), "off", `${p} : Piper (alertes en voix locale)`);
  }
  eq(cloudModeFor("spotter", true, false), "cached", "le spotter n'attend jamais le réseau");

  // Toutes les variantes, sans doublon ; jamais un gabarit à variable ni un chiffre.
  eq(
    fixedPhrases(["Box | Box | Rentre au stand", "Écart {{d}}", "Tour 3 | Dernier tour"], (s) => s),
    ["Box", "Rentre au stand", "Dernier tour"],
    "variantes découpées, doublons, variables et chiffres écartés",
  );
  eq(fixedPhrases(["a | b"], (s) => s.toUpperCase()), ["A", "B"], "normalisation appliquée à chaque variante");
  const bundles = { fr, en, es, de, it } as unknown as Record<string, { live: Record<string, string> }>;
  for (const [lang, b] of Object.entries(bundles)) {
    const tpls = CLOUD_PREP_KEYS.map((k) => b.live[k]);
    ok(tpls.every((x) => typeof x === "string" && x.length > 0), `${lang} : chaque gabarit existe`);
    const phrases = fixedPhrases(tpls, (s) => s);
    ok(phrases.length >= CLOUD_PREP_KEYS.length, `${lang} : au moins une phrase par gabarit (${phrases.length})`);
    ok(phrases.every((p) => isFixedPhrase(p) && !p.includes("|")), `${lang} : phrases fixes, une variante chacune`);
    const alerts = CLOUD_PREP_ALERT_KEYS.map((k) => b.live[k]);
    ok(alerts.every((x) => typeof x === "string" && x.length > 0 && !x.includes("{{")), `${lang} : chaque gabarit urgent existe, sans variable`);
    const alertPhrases = fixedPhrases(alerts, (s) => s);
    ok(alertPhrases.length >= CLOUD_PREP_ALERT_KEYS.length, `${lang} : au moins une phrase urgente par gabarit (${alertPhrases.length})`);
  }

  approx(estimateCostUsd("openai", "gpt-4o-mini-tts", 1_000_000), 15, 1e-9, "OpenAI ≈ 15 $/M caractères");
  approx(estimateCostUsd("openai", "tts-1-hd", 1_000_000), 30, 1e-9, "tts-1-hd plus cher");
  approx(estimateCostUsd("inconnu", "", 2_000), 0.1, 1e-9, "fournisseur inconnu : tarif prudent");
}

// ── Annonces chiffrées assemblées (voix en ligne) ───────────────────────────

function cloudSegmentsSuite() {
  section("radio — annonces chiffrées assemblées");
  const n = (v: number, lang: string, form?: "plain" | "masc" | "fem") => numberSegments(v, lang, form);

  // Nombres en toutes lettres, accords compris.
  eq(n(1, "fr", "fem"), ["une"], "FR : une minute");
  eq(n(21, "fr", "fem"), ["vingt-et-une"], "FR : vingt-et-une");
  eq(n(71, "fr"), ["soixante-et-onze"], "FR : soixante-et-onze");
  eq(n(80, "fr"), ["quatre-vingts"], "FR : quatre-vingts");
  eq(n(81, "fr", "fem"), ["quatre-vingt-une"], "FR : quatre-vingt-une");
  eq(n(99, "fr"), ["quatre-vingt-dix-neuf"], "FR : quatre-vingt-dix-neuf");
  eq(n(200, "fr"), ["deux cents"], "FR : deux cents");
  eq(n(201, "fr"), ["deux cent", "un"], "FR : deux cent un");
  eq(n(42, "en"), ["forty-two"], "EN : forty-two");
  eq(n(105, "en"), ["one hundred and", "five"], "EN : one hundred and five");
  eq(n(1, "es", "masc"), ["un"], "ES : un segundo");
  eq(n(21, "es", "fem"), ["veintiuna"], "ES : veintiuna vueltas");
  eq(n(35, "es"), ["treinta y cinco"], "ES : treinta y cinco");
  eq(n(100, "es"), ["cien"], "ES : cien");
  eq(n(101, "es"), ["ciento", "uno"], "ES : ciento uno");
  eq(n(200, "es", "fem"), ["doscientas"], "ES : doscientas vueltas");
  eq(n(1, "de"), ["eins"], "DE : eins");
  eq(n(1, "de", "fem"), ["eine"], "DE : eine Runde");
  eq(n(21, "de"), ["einundzwanzig"], "DE : einundzwanzig");
  eq(n(97, "de"), ["siebenundneunzig"], "DE : siebenundneunzig");
  eq(n(21, "it"), ["ventuno"], "IT : ventuno");
  eq(n(28, "it"), ["ventotto"], "IT : ventotto");
  eq(n(23, "it"), ["ventitré"], "IT : ventitré");
  eq(n(1, "it", "masc"), ["un"], "IT : un giro");
  eq(n(1000, "fr"), null, "au-delà de 999 : pas assemblable");
  eq(formBefore(" tours restants", "fr"), "plain", "FR : tours → un");
  eq(formBefore(" minutes restantes", "fr"), "fem", "FR : minutes → une");
  eq(formBefore(" vueltas", "es"), "fem", "ES : vueltas → una");
  eq(formBefore(" segundos", "es"), "masc", "ES : segundos → un");
  eq(formBefore(" Runden", "de"), "fem", "DE : Runden → eine");
  eq(formBefore(", place", "fr"), "plain", "ponctuation : nombre seul");

  // Valeurs chiffrées : décimaux, signes, secondes, chronos.
  const texts = (v: string, lang: string) => valueSegments(v, lang)?.map((x) => x.text) ?? null;
  eq(texts("0.4", "fr"), ["zéro virgule quatre"], "écart court d'un seul morceau");
  eq(texts("12.3", "fr"), ["douze", "virgule", "trois"], "décimal composé");
  eq(texts("23.456", "en"), ["twenty-three", "point", "four", "five", "six"], "EN : décimales chiffre par chiffre");
  eq(texts("23.456", "fr"), ["vingt-trois", "virgule", "quatre cent", "cinquante-six"], "FR : décimales en nombre");
  eq(texts("0.05", "it"), ["zero", "virgola", "zero", "cinque"], "zéro de tête conservé");
  eq(texts("+1.2s", "fr"), ["plus", "un virgule deux", "secondes"], "signe et secondes");
  eq(texts("1:42.881", "fr"), ["une", "quarante-deux", "huit cent", "quatre-vingt-un"], "chrono : une, 42, 881");
  eq(texts("Hypercar", "fr"), null, "texte libre : pas un nombre");

  // Reconnaissance des annonces (gabarits réels, FR) et découpe.
  const entries = (b: { live: Record<string, unknown> }): SegmentEntry[] =>
    Object.keys(b.live)
      .filter((k) => typeof b.live[k] === "string" && isSegmentTemplateKey(k))
      .map((key) => ({ key, text: b.live[key] as string }));
  const frLex = buildLexicon("fr", entries(fr as never), (s) => s);
  const say = (text: string) => assembleSegments(text, frLex)?.map((x) => x.text) ?? null;
  eq(say("Carburant : environ 2 tours restants"), ["Carburant : environ", "deux", "tours restants"], "carburant");
  eq(say("Bien joué, tu passes P21"), ["Bien joué, tu passes P", "vingt-et-un"], "position (variante)");
  eq(say("P3, place gagnée"), ["P", "trois", "place gagnée"], "position (1re variante)");
  eq(say("Tu gagnes 0.4"), ["Tu gagnes", "zéro virgule quatre"], "écart au tour");
  eq(say("12 tours restants"), ["douze", "tours restants"], "tours restants (réponse)");
  eq(say("1 tour restant"), ["un", "tour restant"], "tours restants (singulier)");
  eq(
    say("Écart au leader : une minute 23.4"),
    ["Écart au leader", "une", "minute", "vingt-trois", "virgule", "quatre"],
    "chrono imbriqué (vLapTime dans vGapLeader)",
  );
  eq(
    say("Pluie probable, 40 pour cent, dans environ 5 minutes"),
    ["Pluie probable", "quarante", "pour cent", "dans environ", "cinq", "minutes"],
    "délai imbriqué (inMinutes)",
  );
  eq(
    say("Je répète : P3, place gagnée, Tu gagnes 0.4"),
    ["Je répète", "P", "trois", "place gagnée", "Tu gagnes", "zéro virgule quatre"],
    "annonce fusionnée, reprise après coupure",
  );
  eq(say("Tu reprends 0.4 au tour sur Dupont, sur lui dans environ 3 tours"), null, "nom propre : Piper");
  eq(say("Drapeau jaune, attention"), null, "phrase sans chiffre : chemin des phrases fixes");
  eq(say("Il fait 3 fois rien"), null, "phrase inconnue : Piper");
  const pauses = assembleSegments("P3, place gagnée", frLex)!.map((x) => x.pauseMs);
  ok(pauses[0] === 0 && pauses[2] > pauses[1], `silence plus long à la virgule (${pauses.join(",")})`);

  // Gabarit personnalisé : reconnu tel que l'utilisateur l'a écrit ; ordinal collé refusé.
  const custom = buildLexicon(
    "fr",
    [
      { key: "vFuelLaps", text: "Essence : {{n}} tours" },
      { key: "vX", text: "Rapport {{gear}}ᵉ" },
    ],
    (s) => s,
  );
  eq(assembleSegments("Essence : 2 tours", custom)?.map((x) => x.text) ?? null, ["Essence", "deux", "tours"], "gabarit personnalisé");
  eq(assembleSegments("Rapport 3ᵉ", custom), null, "ordinal collé : pas assemblable");

  // Couverture, 5 langues : chaque gabarit chiffré sans nom propre se dit avec
  // des morceaux tous présents dans l'inventaire à préparer.
  const bundles = { fr, en, es, de, it } as unknown as Record<string, { live: Record<string, string> }>;
  const sample: Record<string, string> = { d: "0.4", time: "12.3", sec: "23.456" };
  const freeVar = /\{\{\s*(name|driver|cls|what|wheels|marker|sector|car|no)\s*\}\}/;
  for (const [lang, b] of Object.entries(bundles)) {
    const list = entries(b);
    const lex = buildLexicon(lang, list, (s) => s);
    const inv = new Set(segmentInventory(lex));
    ok(inv.size > 200 && inv.size < 700, `${lang} : inventaire raisonnable (${inv.size} morceaux)`);
    const chars = [...inv].reduce((k, x) => k + x.length, 0);
    ok(chars < 10_000, `${lang} : préparation bon marché (${chars} caractères)`);
    ok([...inv].every((x) => x && !/\d/.test(x) && !x.includes("{{") && !x.includes("|")), `${lang} : morceaux sans chiffre ni variable`);
    const when = b.live.inLaps.replace(/\{\{\s*n\s*\}\}/, "2");
    let covered = 0;
    const keys = new Set<string>();
    for (const { key, text } of list) {
      for (const variant of splitVariants(text)) {
        if (!variant.includes("{{") || freeVar.test(variant)) continue;
        if (/\}\}\p{L}/u.test(variant)) continue; // ordinal collé
        const filled = variant.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, v: string) => (v === "when" ? when : (sample[v] ?? "3")));
        const segs = assembleSegments(filled, lex);
        ok(segs !== null, `${lang} ${key} : « ${filled} » assemblable`);
        if (!segs) continue;
        const absent = segs.map((x) => x.text).filter((x) => !inv.has(x) && !lex.known.has(x));
        eq(absent, [], `${lang} ${key} : morceaux tous préparés`);
        covered++;
        keys.add(key);
      }
    }
    ok(covered >= 60, `${lang} : au moins 60 formulations chiffrées couvertes (${covered})`);
    const must = ["vFuelLaps", "vPosGain", "vPosLoss", "vPodium", "vDeltaGain", "vDeltaLoss", "vGapLeader", "vSectorLost"];
    for (const k of [...must, "vTimeRemaining", "spLapsLeft_other", "vCornerBrakeEarly"]) {
      ok(keys.has(k), `${lang} : ${k} couvert`);
    }
  }

  // Réglage : morceaux à préparer selon « Annonces chiffrées » et « Alertes en voix locale ».
  eq(segmentsWanted("alerts", false), true, "alertes assemblées : morceaux préparés");
  eq(segmentsWanted("alerts", true), false, "alertes en voix locale : rien à assembler");
  eq(segmentsWanted("all", true), true, "tout assemblé : l'information en a besoin");
  eq(segmentsWanted("off", false), false, "ancien comportement : rien à préparer");

  // Recollage : silence rogné, pause insérée, fondu aux bords.
  const sr = 1000;
  const tone = new Float32Array(300);
  for (let i = 100; i < 200; i++) tone[i] = 0.5;
  eq(trimSilence(tone, sr, 0.01, 10).length, 120, "silence rogné, marge gardée");
  const joined = joinPcm([new Float32Array(50).fill(1), new Float32Array(50).fill(1)], [0, 30], sr, 5);
  eq(joined.length, 130, "pause de 30 ms entre deux morceaux");
  ok(joined[0] === 0 && joined[49] === 0 && joined[25] === 1, "fondu aux bords, plein au milieu");
  ok(joined.slice(50, 80).every((x) => x === 0), "silence au raccord");
}

// ── Banc d'écoute de la voix en ligne ───────────────────────────────────────

function cloudBenchSuite() {
  section("radio — banc d'écoute de la voix IA");
  const base: BenchFacts = {
    cloudOn: true,
    mode: "cached",
    fixed: true,
    wholeCached: true,
    segments: null,
    missing: [],
    numbers: "alerts",
  };
  const r = (o: Partial<BenchFacts>) => benchRoute({ ...base, ...o });
  eq(r({}), { engine: "cloud", reason: "cached" }, "alerte préparée : voix IA du cache");
  eq(r({ cloudOn: false }), { engine: "piper", reason: "cloudOff" }, "voix IA coupée : Piper");
  eq(r({ mode: "off" }), { engine: "piper", reason: "alertsLocal" }, "alertes en voix locale : Piper");
  eq(r({ wholeCached: false }), { engine: "piper", reason: "notPrepared" }, "alerte non préparée : Piper");
  eq(r({ mode: "live", wholeCached: false }), { engine: "piper", reason: "liveOnly" }, "information non préparée : réseau, donc Piper");
  const num = { fixed: false, wholeCached: false, segments: ["deux", "tours"] };
  eq(r(num), { engine: "assembled", reason: "assembled" }, "chiffrée, morceaux prêts : assemblée");
  eq(r({ ...num, missing: ["deux"] }), { engine: "piper", reason: "segmentsMissing" }, "morceau manquant : Piper");
  eq(r({ ...num, numbers: "off" }), { engine: "piper", reason: "numbersOff" }, "annonces chiffrées sur Piper");
  eq(r({ ...num, mode: "live" }), { engine: "piper", reason: "liveOnly" }, "information chiffrée en réglage alertes : en direct");
  eq(r({ ...num, mode: "live", numbers: "all" }), { engine: "assembled", reason: "assembled" }, "tout assemblé : l'information aussi");
  eq(r({ ...num, segments: null }), { engine: "piper", reason: "notAssemblable" }, "nom propre : pas assemblable");
  eq(r({ ...num, mode: "off", numbers: "all" }), { engine: "piper", reason: "alertsLocal" }, "alertes en voix locale l'emportent");

  eq(benchText("Box | Rentre", {}), "Box", "1re formulation");
  eq(benchText("Carburant : {{n}} tours", { n: "3" }), "Carburant : 3 tours", "variables remplacées");
  eq(benchText("Écart {{d}}", {}), "Écart {{d}}", "variable sans valeur laissée visible");

  // Familles : chaque phrase existe dans les 5 langues ; les exemples chiffrés s'assemblent partout.
  const fams = benchFamilies();
  eq(fams.map((f) => f.family), ["info", "safety", "spotter", "coach", "numbers"], "5 familles");
  ok(fams.every((f) => f.phrases.length > 0), "aucune famille vide");
  eq(fams.find((f) => f.family === "spotter")!.phrases.every((p) => p.priority === "spotter"), true, "spotter en priorité spotter");
  const bundles = { fr, en, es, de, it } as unknown as Record<string, { live: Record<string, string> }>;
  for (const [lang, b] of Object.entries(bundles)) {
    const lex = buildLexicon(
      lang,
      Object.keys(b.live)
        .filter((k) => typeof b.live[k] === "string" && isSegmentTemplateKey(k))
        .map((key) => ({ key, text: b.live[key] })),
      (s) => s,
    );
    for (const f of fams) {
      for (const p of f.phrases) {
        const tpl = b.live[p.key];
        ok(typeof tpl === "string" && tpl.length > 0, `${lang} ${p.key} existe`);
        if (f.family !== "numbers" || typeof tpl !== "string") continue;
        const text = benchText(tpl, p.vars);
        ok(!text.includes("{{"), `${lang} ${p.key} : toutes les variables ont un exemple`);
        ok(assembleSegments(text, lex) !== null, `${lang} ${p.key} : « ${text} » assemblable`);
      }
    }
  }
}

export function run() {
  focusSuite();
  policySuite();
  arbiterSuite();
  variantsSuite();
  variantTemplatesSuite();
  proximitySuite();
  rigorSuite();
  commandsSuite();
  cloudPrepSuite();
  cloudSegmentsSuite();
  cloudBenchSuite();
}
