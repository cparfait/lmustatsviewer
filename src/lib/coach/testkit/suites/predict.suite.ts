/**
 * Tests des apports de la passe du 2026-10-31 : préavis de trafic prédit, faux abandon
 * après une sauvegarde (logique côté Rust, testée là-bas), arrondis de la parole,
 * niveau de présence du coach, carnet des questions et paliers de chrono.
 */

import { section, ok, eq, approx } from "../assert";
import { TrafficPredictor, fasterContact, carKey, READY_COVERAGE } from "@/lib/engineer/trafficPredict";
import type { OnTrackCar } from "@/lib/engineer/traffic";
import type { LiveStanding } from "@/lib/api";
import { applyPresence, effectivePresence, parsePresence, DISCREET_GAP_LAPS } from "@/lib/coach/presence";
import { policyFor } from "@/lib/coach/mode";
import { QuestionBook, questionOfKey, resolveShortAnswer, wheelAckApplies } from "@/lib/engineer/questions";
import { route } from "@/lib/engineer/router";
import { buildTiers, nextTier, crossedTiers, tierProgress, tierLoadDue, tierRetryDelayMs } from "@/lib/engineer/paceTiers";
import { sayMeters, sayKmh, saySeconds, sayLap, sayLapTarget } from "@/lib/engineer/rounding";

const L = 1000;
/** Vitesse (m/s) de chaque classe le long du tour : un virage lent entre 400 et 500 m. */
const speed = (cls: string, d: number) => {
  const x = ((d % L) + L) % L;
  const corner = x >= 400 && x < 500;
  return cls === "Hypercar" ? (corner ? 30 : 70) : corner ? 28 : 50;
};

/** Fait rouler des voitures `seconds` secondes à leur profil (×pace) et nourrit le prédicteur. */
function drive(
  p: TrafficPredictor,
  cars: { key: string; cls: string; dist: number; pace: number }[],
  seconds: number,
  dt = 0.1,
) {
  for (let t = 0; t <= seconds; t += dt) {
    p.push(t, L, cars.map((c) => ({ key: c.key, cls: c.cls, dist: ((c.dist % L) + L) % L, inPits: false })));
    for (const c of cars) c.dist += speed(c.cls, c.dist) * c.pace * dt;
  }
}

/** Temps de contact « vrai », par intégration fine. */
function truth(meCls: string, meDist: number, gap: number, mePace = 1, chPace = 1): number {
  let a = meDist;
  let b = meDist - gap;
  for (let t = 0.01; t < 600; t += 0.01) {
    a += speed(meCls, a) * mePace * 0.01;
    b += speed("Hypercar", b) * chPace * 0.01;
    if (b >= a) return t;
  }
  return Infinity;
}

function standing(over: Partial<LiveStanding>): LiveStanding {
  return {
    position: 1, class_position: 1, driver: "X", vehicle_name: "", vehicle_class: "GT3",
    last_lap_time: 0, best_lap_time: 0, time_behind_leader: 0, laps_behind_leader: 0, time_behind_next: 0,
    is_player: false, in_pits: false, current_sector: 0, last_s1: 0, last_s2: 0, last_s3: 0,
    is_class_best_lap: false, is_class_best_s1: false, is_class_best_s2: false, is_class_best_s3: false,
    total_laps: 0, num_pitstops: 0, num_penalties: 0, pos_x: 0, pos_z: 0, finish_status: 0, lap_dist: 0,
    ...over,
  };
}

function trafficPredict(): void {
  section("trafficPredict.learning");
  const p = new TrafficPredictor();
  ok(!p.ready("GT3"), "rien appris : pas prêt");
  const fleet = [
    { key: "#1", cls: "GT3", dist: 0, pace: 1 },
    { key: "#2", cls: "GT3", dist: 500, pace: 1 },
    { key: "#3", cls: "Hypercar", dist: 250, pace: 1 },
    { key: "#4", cls: "Hypercar", dist: 750, pace: 1 },
  ];
  drive(p, fleet, 40);
  ok(p.coverage("GT3") >= READY_COVERAGE && p.ready("Hypercar"), "40 s de roulage : profils prêts");
  approx(p.speedAt("GT3", 100), 50, 1, "GT3 en ligne droite ≈ 50 m/s");
  approx(p.speedAt("Hypercar", 450), 30, 2, "Hypercar dans le virage ≈ 30 m/s");

  section("trafficPredict.contact");
  const gap = 300;
  const f = p.contact({ key: "#1", cls: "GT3", dist: 100 }, { key: "#3", cls: "Hypercar" }, gap);
  ok(f != null, "contact trouvé");
  const want = truth("GT3", 100, gap);
  approx(f!.inS, want, 1, "temps avant contact ≈ intégration fine");
  // L'ancienne formule (écart ÷ vitesse de rapprochement en ligne droite) se trompe ici.
  const naive = gap / (70 - 50);
  ok(Math.abs(naive - want) > 2, "le virage lent change le résultat de « écart ÷ rapprochement »");
  ok(f!.atDist >= 0 && f!.atDist < L, "endroit du contact dans le tour");
  eq(p.contact({ key: "#1", cls: "GT3", dist: 0 }, { key: "#3", cls: "Hypercar" }, 5000, 30), null, "hors horizon : null");

  section("trafficPredict.pace");
  const q = new TrafficPredictor();
  const slowHyper = [
    { key: "#1", cls: "GT3", dist: 0, pace: 1 },
    { key: "#2", cls: "GT3", dist: 500, pace: 1 },
    { key: "#3", cls: "Hypercar", dist: 250, pace: 1 },
    { key: "#9", cls: "Hypercar", dist: 750, pace: 0.9 },
  ];
  drive(q, slowHyper, 60);
  ok(q.pace("#9") < 0.97, "une Hypercar lente a un facteur de rythme < 1");
  const fast = q.contact({ key: "#1", cls: "GT3", dist: 100 }, { key: "#3", cls: "Hypercar" }, gap)!;
  const slow = q.contact({ key: "#1", cls: "GT3", dist: 100 }, { key: "#9", cls: "Hypercar" }, gap)!;
  ok(slow.inS > fast.inS, "la plus lente des rapides arrive plus tard");

  section("trafficPredict.fasterContact");
  eq(carKey({ id: 7, driver: "A" }), "#7", "clé = id du jeu");
  eq(carKey({ driver: "A" }), "A", "clé = nom sans id");
  const me = standing({ id: 1, driver: "Moi", is_player: true, lap_dist: 100 });
  const hyper: OnTrackCar = {
    standing: standing({ id: 3, driver: "H", vehicle_class: "Hypercar" }),
    rel: "faster",
    aheadS: 14,
    behindS: 6,
  };
  const myRef = 25; // s/tour
  const r = fasterContact(p, [hyper], me, myRef, L);
  ok(r.state === "contact", "profils prêts : un contact prédit");
  if (r.state === "contact") approx(r.inS, truth("GT3", 100, (6 / myRef) * L), 1, "écart de piste converti en mètres");
  eq(fasterContact(new TrafficPredictor(), [hyper], me, myRef, L).state, "learning", "profils absents : learning");
  eq(fasterContact(p, [{ ...hyper, behindS: 200 }], me, myRef, L, 90).state, "none", "trop loin derrière : none");
  eq(fasterContact(p, [{ ...hyper, rel: "slower" }], me, myRef, L).state, "none", "classe plus lente ignorée");

  section("trafficPredict.reset");
  p.push(0, 2000, []);
  ok(!p.ready("GT3"), "autre longueur de tour : tout est réappris");
}

function rounding(): void {
  section("rounding.on");
  eq(sayMeters(12, true), 10, "12 m → 10 m");
  eq(sayMeters(37, true), 40, "37 m → 40 m");
  eq(sayMeters(3, true), 5, "jamais zéro : 5 m");
  eq(sayKmh(3.4, true), 3, "petit écart de vitesse : au km/h");
  eq(sayKmh(13, true), 15, "13 km/h → 15");
  eq(saySeconds(0.234, 2, true), "0.2", "écart au dixième");
  eq(sayLap(102.881, true), "1:42.9", "chrono au dixième");
  eq(sayLap(59.96, true), "1:00.0", "59,96 s → 1:00.0");
  eq(sayLapTarget(102.881, true), "1:42.8", "objectif « sous X » : vers le bas, jamais déjà battu");
  eq(sayLapTarget(102.8, true), "1:42.8", "objectif déjà au dixième : inchangé");
  eq(sayLapTarget(102.881, false), "1:42.881", "objectif, arrondis coupés : millièmes");
  section("rounding.off");
  eq(sayMeters(37, false), 35, "coupé : pas de 5 m");
  eq(sayKmh(13, false), 13, "coupé : au km/h");
  eq(saySeconds(0.234, 2, false), "0.23", "coupé : centièmes");
  eq(sayLap(102.881, false), "1:42.881", "coupé : millièmes");
}

function presence(): void {
  section("presence.effective");
  eq(parsePresence("bogus"), "normal", "valeur inconnue : normal");
  eq(effectivePresence("discreet", 3, []), "discreet", "choix fixe respecté");
  eq(effectivePresence("auto", 1.4, []), "present", "loin de l'objectif : présent");
  eq(effectivePresence("auto", 0.3, []), "discreet", "près de l'objectif : discret");
  eq(effectivePresence("auto", 0.7, []), "normal", "entre les deux : normal");
  eq(effectivePresence("auto", null, []), "normal", "écart inconnu : normal (jamais inventé)");
  eq(effectivePresence("auto", 0.3, [100, 100.8, 100.2]), "present", "tours irréguliers : présent");
  section("presence.policy");
  const practice = policyFor("practice");
  eq(applyPresence(practice, "normal"), practice, "normal : politique inchangée");
  eq(applyPresence(practice, "present").budgetPerLap, 4, "présent : un conseil de plus par tour");
  eq(applyPresence(practice, "present").degressive, false, "présent : pas de dégressivité");
  const d = applyPresence(practice, "discreet");
  eq(d.budgetPerLap, 1, "discret : un conseil par tour au plus");
  eq(d.minLapsBetween, DISCREET_GAP_LAPS, "discret : espacé de 4 tours");
  const q = policyFor("qualify");
  eq(applyPresence(q, "present"), q, "qualif : silence en tour lancé conservé");
  eq(applyPresence(policyFor("race"), "present").escalationOnly, true, "course : seulement l'erreur répétée");
}

function questions(): void {
  section("questions.wheelAck");
  ok(!wheelAckApplies(null, false), "bouton du volant sans fenêtre annoncée : ne coupe aucun rappel");
  ok(wheelAckApplies(null, true), "fenêtre annoncée : accusé");
  ok(wheelAckApplies("pitCall", false), "appel au box ouvert : accusé");
  ok(!wheelAckApplies("lapPref", false), "question des chronos seule : aucun rappel à couper");
  ok(wheelAckApplies("lapPref", true), "le bouton nomme le box : la question des chronos ne le détourne pas");

  section("questions.book");
  const b = new QuestionBook();
  eq(b.latest(0), null, "carnet vide");
  b.open("pitCall", 10);
  b.open("lapPref", 20);
  eq(b.latest(25)?.kind, "lapPref", "la dernière question dite l'emporte");
  ok(b.isOpen("pitCall", 25), "l'autre reste ouverte");
  eq(b.latest(80)?.kind, "pitCall", "lapPref expirée (45 s) : on retombe sur la fenêtre d'arrêt");
  eq(b.latest(200), null, "tout a expiré");
  b.open("lapPref", 300);
  b.close("lapPref");
  eq(b.latest(301), null, "fermée");
  eq(questionOfKey("pit:closing"), "pitCall", "annonce de fenêtre = question");
  eq(questionOfKey("prefs:ask"), "lapPref", "question des chronos");
  eq(questionOfKey("lap:time"), null, "chrono : pas une question");

  section("questions.resolve");
  eq(resolveShortAnswer("ack", "lapPref", true), "askAgain", "« ok » à la question des chronos : on la repose");
  eq(resolveShortAnswer("ack", "pitCall", true), "ackPit", "« ok » après la fenêtre : accusé (comme avant)");
  eq(resolveShortAnswer("no", "pitCall", true), "stayOut", "« non » après la fenêtre : on reste dehors");
  eq(resolveShortAnswer("ack", null, true), "ackPit", "aucune question, fenêtre annoncée : comme avant");
  eq(resolveShortAnswer("ack", null, false), "received", "aucune question ni fenêtre : simple reçu (ne tait plus les rappels)");
  eq(resolveShortAnswer("yes", null, true), "received", "« oui » seul ne décide rien");

  section("questions.router");
  eq(route("oui", "fr").intent, "yes", "FR oui");
  eq(route("non", "fr").intent, "no", "FR non");
  eq(route("non je reste", "fr").intent, "stayOut", "« non je reste » garde son intention");
  eq(route("yes", "en").intent, "yes", "EN yes");
  eq(route("nein", "de").intent, "no", "DE nein");
  eq(route("sì", "it").intent, "yes", "IT sì");
  eq(route("no", "es").intent, "no", "ES no");
}

function tiers(): void {
  section("paceTiers.build");
  const pct = { p1: 100.0, p5: 100.6, p10: 101.0, p25: 101.9, p50: 103.0, p75: 104.5, p90: 106.0 };
  eq(buildTiers({ ranked: false, drivers: 40, percentiles: pct }), null, "classement non établi : aucun repère");
  eq(buildTiers({ ranked: true, drivers: 6, percentiles: pct }), null, "base trop mince : aucun repère");
  const t = buildTiers({ ranked: true, drivers: 40, percentiles: pct })!;
  eq(t.map((x) => x.key), ["p90", "p75", "p50", "p25", "p10", "p5", "p1"], "du plus lent au plus rapide");
  const odd = buildTiers({ ranked: true, drivers: 40, percentiles: { ...pct, p25: 103.5 } })!;
  ok(!odd.some((x) => x.key === "p25"), "un palier incohérent (plus lent que le précédent) est écarté");

  section("paceTiers.next");
  eq(nextTier(105, t)?.key, "p75", "105 s : le prochain repère est p75 (104,5)");
  eq(nextTier(104.55, t)?.key, "p50", "à 5 centièmes de p75 : la marge le saute");
  eq(nextTier(99.5, t), null, "au sommet : aucun repère");
  section("paceTiers.crossed");
  eq(crossedTiers(104.8, 102.5, t).map((x) => x.key), ["p75", "p50"], "deux repères passés d'un coup");
  eq(crossedTiers(null, 102.5, t), [], "premier tour : rien de passé");
  eq(crossedTiers(102.5, 102.6, t), [], "pas d'amélioration : rien");
  section("paceTiers.memory");
  eq(tierProgress(102.5, 102.8, t).crossed, [], "nouvelle séance, repères déjà passés : rien de redit");
  eq(tierProgress(102.5, 102.8, t).next?.key, "p25", "la cible part du meilleur tour déjà vu");
  eq(tierProgress(102.5, 101.5, t).crossed.map((x) => x.key), ["p25"], "un repère vraiment nouveau : dit");
  eq(tierProgress(null, 102.5, t).crossed, [], "premier tour vu : rien de passé");
  section("paceTiers.retry");
  ok(!tierLoadDue("a", "a", null, 0), "déjà chargé : rien");
  ok(tierLoadDue("a", "", null, 0), "jamais chargé : on charge");
  const failed = { key: "a", at: 60_000, attempts: 1 };
  ok(!tierLoadDue("a", "", failed, 1000), "après un échec : pas à chaque trame");
  ok(tierLoadDue("a", "", failed, 60_000), "délai écoulé : nouvel essai");
  ok(tierLoadDue("b", "", failed, 1000), "autre combo : pas de délai");
  eq([tierRetryDelayMs(1), tierRetryDelayMs(2), tierRetryDelayMs(9)], [60_000, 120_000, 600_000], "essais de plus en plus espacés, plafonnés");
}

export function run(): void {
  trafficPredict();
  rounding();
  presence();
  questions();
  tiers();
}
