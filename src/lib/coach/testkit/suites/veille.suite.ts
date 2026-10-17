/**
 * Suite « veille 2026-10-17 » : régularité d'une séance, aides du XML, correspondance
 * live → combos de la base communautaire, bips de record, paliers communautaires.
 */

import { section, eq, approx, ok } from "../assert";
import { computeRegularity, parseAids } from "@/lib/regularity";
import { liveClassToDb, matchCombo, tierOfPct } from "@/lib/briefing";
import { beepsFor } from "@/lib/useRecordBeeps";
import { computeTier, findBenchmark, type PaceBenchmark } from "@/lib/ohne_speed";
import { marksForSession, type ReviewMark } from "@/lib/reviewMarks";

const lap = (t: number | null, s1 = 30, s2 = 30, opts: { pit?: boolean; valid?: boolean } = {}) => ({
  lap_time: t,
  s1,
  s2,
  s3: t != null ? t - s1 - s2 : null,
  is_pit: opts.pit ?? false,
  is_valid: opts.valid ?? true,
});

export function run(): void {
  section("veille — régularité");
  eq(computeRegularity([lap(90), lap(90.2)]), null, "moins de 3 tours → rien");
  const r = computeRegularity([lap(90), lap(90.2), lap(90.4), lap(91.2), lap(120), lap(89, 30, 30, { pit: true }), lap(85, 30, 30, { valid: false })]);
  ok(r != null, "régularité calculée");
  if (r) {
    eq(r.best, 90, "meilleur = 90 (tour aux stands et tour invalide exclus)");
    eq(r.laps, 4, "120 s (> 107 %) écarté");
    approx(r.within["0.3"], 0.5, 1e-9, "2 tours sur 4 à moins de 0,3 s");
    approx(r.within["1.0"], 0.75, 1e-9, "3 tours sur 4 à moins de 1 s");
    approx(r.median, 90.3, 1e-9, "médiane");
  }
  const s = computeRegularity([lap(90, 30, 30), lap(90.5, 30, 30.5), lap(91, 30, 31), lap(90.2, 30, 30.2)]);
  eq(s?.unstableSector, 2, "S2 varie le plus");
  eq(s?.stableSector, 1, "S1 ne varie pas");

  section("veille — aides du XML");
  eq(parseAids("PlayerControl,TC=2,Clutch,AutoBlip").tc, 2, "TC lu");
  eq(parseAids("PlayerControl,BrakingHelp=1").brakeHelp, true, "aide au freinage");
  eq(parseAids("").steerHelp, false, "vide → aucune aide");

  section("veille — correspondance live → base");
  eq(liveClassToDb("LMGT3")[0], "GT3", "LMGT3 → GT3");
  eq(liveClassToDb("Hypercar")[0], "Hyper", "Hypercar → Hyper");
  eq(liveClassToDb("LMP2_ELMS")[0], "LMP2 ELMS", "LMP2 ELMS");
  const combos = [
    { track: "Circuit de la Sarthe", track_course: "Circuit de la Sarthe", car_class: "GT3" },
    { track: "Circuit de la Sarthe", track_course: "Circuit de la Sarthe Mulsanne", car_class: "GT3" },
    { track: "Sebring International Raceway", track_course: "Sebring International Raceway", car_class: "LMP2 WEC" },
  ];
  eq(matchCombo(combos, "Circuit de la Sarthe Mulsanne", "LMGT3")?.track_course, "Circuit de la Sarthe Mulsanne", "tracé exact préféré");
  eq(matchCombo(combos, "Sebring International Raceway", "LMP2")?.car_class, "LMP2 WEC", "LMP2 → WEC si présent");
  eq(matchCombo(combos, "Fuji Speedway", "GT3"), null, "circuit absent → null");
  eq(tierOfPct(100.4), "Competitive", "100,4 % → Compétitif");
  eq(tierOfPct(103), "Midpack", "103 % → Peloton");

  section("veille — bips de record");
  eq(beepsFor(90, 91, false, 89), 1, "record perso seul → 1");
  eq(beepsFor(90, 91, true, 89), 2, "meilleur de la classe en séance → 2");
  eq(beepsFor(88.9, 91, true, 89), 3, "record communautaire battu → 3");
  eq(beepsFor(92, 91, false, null), 0, "rien battu → 0");
  eq(beepsFor(90, null, false, null), 0, "aucune référence → 0");

  section("veille — paliers communautaires");
  const base: PaceBenchmark = {
    track: "Sebring",
    carClass: "GT3",
    patch: "1.42",
    hotlapTimeMs: 120000,
    racePaceMs: { alien: 120000, competitive: 121200, good: 122400, pct103: 123600, midpack: 124800, pct105: 126000, tailEnder: 127200, offline: 128400 },
    fastestCar: "",
    fastestLapTimeMs: 0,
    weightedAvgMs: 120000,
    source: "community",
    gameTrack: "Sebring International Raceway",
    gameCourse: "Sebring School Circuit",
  };
  eq(findBenchmark([base], "Sebring International Raceway", "GT3", "Sebring School Circuit"), base, "appariement exact par noms du jeu");
  eq(findBenchmark([base], "Sebring International Raceway", "Hypercar", "Sebring School Circuit"), null, "autre classe → rien");
  eq(computeTier(121000, base).tier, "Competitive", "palier calculé sur la référence communautaire");

  section("veille — repères de revue");
  const m: ReviewMark = { t: 0, track: "Sebring International Raceway", sessionStart: 1_000_000, session: 10, sessionTime: 600, lap: 5, lapDist: 1200 };
  eq(marksForSession([m], "Sebring International Raceway", 1_000_500, 3600, true).length, 1, "même séance → rattaché");
  eq(marksForSession([m], "Sebring International Raceway", 1_000_500, 3600, false).length, 0, "pas une course → écarté");
  eq(marksForSession([m], "Fuji Speedway", 1_000_500, 3600, true).length, 0, "autre circuit → écarté");
}
