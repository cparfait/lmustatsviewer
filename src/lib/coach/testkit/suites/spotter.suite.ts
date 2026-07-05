/**
 * Suite « spotter avancé » (T13). Teste les fonctions pures de réponse du spotter,
 * à commencer par la prédiction de position à la sortie des stands (#151).
 */

import { section, ok, eq, approx } from "../assert";
import { predictPitExit } from "@/lib/spotter";
import { computePitLoss, PitLossTracker, type PitLossSample } from "@/lib/pitLoss";
import { nearestRival, classRelation, sectorEdge, buildRivalInfo } from "@/lib/rival";
import { fuelToEnd, type StrategySnapshot } from "@/lib/strategy";
import { inCriticalZone } from "@/lib/driving";
import type { LiveData, LiveStanding } from "@/lib/api";

const mk = (standings: Partial<LiveStanding>[]): LiveData =>
  ({ standings } as unknown as LiveData);
const car = (o: Partial<LiveStanding>): Partial<LiveStanding> => ({
  is_player: false,
  position: 0,
  time_behind_leader: 0,
  laps_behind_leader: 0,
  ...o,
});

export function run(): void {
  section("spotter.predictPitExit");
  const data = mk([
    car({ is_player: true, position: 3, time_behind_leader: 10, laps_behind_leader: 0 }),
    car({ position: 4, time_behind_leader: 25, laps_behind_leader: 0 }), // 15 s derrière → dans 20 s → saute
    car({ position: 5, time_behind_leader: 40, laps_behind_leader: 0 }), // 30 s derrière → hors 20 s
    car({ position: 2, time_behind_leader: 5, laps_behind_leader: 0 }), // devant
    car({ position: 6, time_behind_leader: 12, laps_behind_leader: 1 }), // un tour derrière → ignoré
  ]);

  const p = predictPitExit(data, 20);
  ok(p !== null, "prédiction produite");
  eq(p!.currentPos, 3, "position actuelle P3");
  eq(p!.lost, 1, "une voiture passe devant (P4 à 15 s < 20 s)");
  eq(p!.newPos, 4, "nouvelle position P4");

  const p2 = predictPitExit(data, 5);
  eq(p2!.lost, 0, "faible perte au stand → personne ne saute");
  eq(p2!.newPos, 3, "garde P3");

  // Grosse perte : les deux voitures du même tour passent devant (15 s et 30 s < 35 s).
  const p3 = predictPitExit(data, 35);
  eq(p3!.lost, 2, "grosse perte → 2 voitures sautent");
  eq(p3!.newPos, 5, "nouvelle position P5");

  ok(predictPitExit(mk([car({ position: 1 })]), 20) === null, "pas de joueur → null");
  ok(predictPitExit(data, 0) === null, "perte ≤ 0 → null");

  // ── #152 benchmark temps d'arrêt ──
  section("pitLoss.computePitLoss");
  eq(computePitLoss(55, 50, 34, 29), 42, "(55-34)+(50-29) = 42");
  ok(computePitLoss(35, 30, 34, 29) === null, "perte 2 s < min → null");
  ok(computePitLoss(0, 50, 34, 29) === null, "secteur manquant → null");
  ok(computePitLoss(200, 50, 34, 29) === null, "aberrant > max → null");

  section("pitLoss.tracker");
  {
    const tr = new PitLossTracker();
    const s = (o: Partial<PitLossSample>): PitLossSample => ({
      inPits: false, totalLaps: 5, lastS1: 30, lastS3: 35, bestS1: 29, bestS3: 34, ...o,
    });
    ok(tr.push(s({})) === null, "tour normal → null");
    ok(tr.push(s({ inPits: true })) === null, "entrée stands → null");
    ok(tr.push(s({ inPits: true, totalLaps: 6, lastS3: 55 })) === null, "clôture in-lap (S3=55) → null");
    const loss = tr.push(s({ inPits: false, totalLaps: 7, lastS1: 50 }));
    ok(loss !== null, "clôture out-lap → perte mesurée");
    approx(loss!, 42, 1e-6, "perte = (55-34)+(50-29) = 42 s");
    // Sans arrêt, jamais de mesure.
    const tr2 = new PitLossTracker();
    ok(tr2.push(s({})) === null && tr2.push(s({ totalLaps: 6 })) === null, "pas d'arrêt → null");
  }

  // ── #148 attack/defend + #149 multiclasse ──
  section("rival.classRelation");
  eq(classRelation("GT3", "GT3"), "same", "même classe");
  eq(classRelation("GT3", "Hyper"), "faster", "rival Hyper = plus rapide");
  eq(classRelation("Hyper", "GT3"), "slower", "rival GT3 = plus lente");
  eq(classRelation("Foo", "Bar"), "other", "classes inconnues = other");

  section("rival.sectorEdge");
  {
    const e = sectorEdge([30, 40, 25], [31, 39, 27]); // Δ = [-1, +1, -2]
    eq(e.strong, 3, "plus fort au S3 (Δ le plus négatif)");
    eq(e.weak, 2, "plus faible au S2 (Δ le plus positif)");
    const e2 = sectorEdge([30, 40, 25], [35, 45, 30]); // partout plus rapide
    eq(e2.weak, null, "aucun secteur faible");
    ok(e2.strong !== null, "a un secteur fort");
    eq(sectorEdge([0, 0, 0], [30, 40, 25]).strong, null, "sans temps → null");
  }

  section("rival.nearestRival + buildRivalInfo");
  {
    const mkD = (standings: Partial<LiveStanding>[], player: unknown): LiveData =>
      ({ standings, player } as unknown as LiveData);
    const data = mkD(
      [
        car({ is_player: true, position: 3, vehicle_class: "GT3", time_behind_next: 2.5 }),
        car({ position: 2, vehicle_class: "GT3", time_behind_next: 5 }), // devant, 2.5 s
        car({ position: 4, vehicle_class: "Hyper", time_behind_next: 1.2, last_s1: 28, last_s2: 36, last_s3: 24 }), // derrière, 1.2 s
      ],
      { last_sectors: [30, 40, 25] },
    );
    const near = nearestRival(data, 3);
    ok(near !== null && near.side === "behind", "le plus proche = derrière (1.2 < 2.5)");
    const info = buildRivalInfo(data, 3)!;
    ok(info !== null, "info produite");
    eq(info.side, "behind", "côté derrière");
    approx(info.gap, 1.2, 1e-6, "écart 1.2 s");
    eq(info.classRel, "faster", "Hyper derrière = classe plus rapide");
    eq(info.weakSector, 2, "plus faible au S2 vs la Hyper");
    eq(info.strongSector, null, "aucun secteur plus fort vs la Hyper");
    // Personne à portée → null.
    const far = mkD([car({ is_player: true, position: 1, time_behind_next: 0 })], {});
    ok(buildRivalInfo(far, 3) === null, "aucun rival à portée → null");
  }

  // ── #157 fuel-to-end avec réserve ──
  section("strategy.fuelToEnd");
  {
    const snap = (o: Partial<StrategySnapshot>): StrategySnapshot =>
      ({ fuelPerLap: 3, fuelLapsRemaining: 5, sessionLapsLeft: 10, fuelNeeded: 30, fuelToAdd: 15, ...o } as StrategySnapshot);
    const a = fuelToEnd(snap({}), 1)!; // toAdd = 15 + 1×3 = 18
    eq(a.toAdd, 18, "toAdd avec réserve 1 tour = 18");
    ok(!a.sufficient, "pas suffisant");
    const b = fuelToEnd(snap({ fuelToAdd: -6 }), 1)!; // surplus 2 tours ; toAdd = -6+3 = -3
    ok(b.sufficient, "surplus → suffisant");
    approx(b.marginLaps, 2, 1e-6, "marge 2 tours");
    ok(fuelToEnd(snap({ sessionLapsLeft: null }), 1) === null, "tours restants inconnus → null");
    ok(fuelToEnd(snap({ fuelPerLap: 0 }), 1) === null, "conso nulle → null");
  }

  // ── #150 silence en zone de freinage/virage ──
  section("driving.inCriticalZone");
  ok(inCriticalZone(0.6, 0), "freinage appuyé → critique");
  ok(inCriticalZone(0, 0.5), "fort braquage → critique");
  ok(inCriticalZone(0, -0.5), "braquage gauche (abs) → critique");
  ok(!inCriticalZone(0.2, 0.1), "roulage calme → non critique");
}
