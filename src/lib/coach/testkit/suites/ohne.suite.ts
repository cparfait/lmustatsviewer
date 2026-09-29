/**
 * Suite « ohne_speed » : correspondance tracé du jeu → ligne de la feuille, et niveau
 * d'un temps (retours joueurs : Bahrain Paddock « Alien », Sebring 103,6 % « Bon »).
 */

import { section, eq } from "../assert";
import { computeTier, mapTrackName, type PaceBenchmark } from "@/lib/ohne_speed";

const ms = (m: number, s: number) => Math.round((m * 60 + s) * 1000);

/** Sebring GT3 de la feuille (patch 1.4+) : 100 % 2:00.21 … 107 % 2:08.62. */
const SEBRING_GT3: PaceBenchmark = {
  track: "Sebring",
  carClass: "GT3",
  patch: "1.4+",
  hotlapTimeMs: ms(1, 59.61),
  racePaceMs: {
    alien: ms(2, 0.21),
    competitive: ms(2, 1.41),
    good: ms(2, 2.61),
    pct103: ms(2, 3.81),
    midpack: ms(2, 5.01),
    pct105: ms(2, 6.22),
    tailEnder: ms(2, 7.42),
    offline: ms(2, 8.62),
  },
  fastestCar: "",
  fastestLapTimeMs: 0,
  weightedAvgMs: 0,
};

export function run(): void {
  section("ohne_speed — tracés");
  eq(mapTrackName("Bahrain International Circuit", "Bahrain Paddock Circuit"), "Bahrain (paddock)", "Bahrain Paddock → sa ligne, pas le tracé WEC");
  eq(mapTrackName("Bahrain International Circuit", "Bahrain International Circuit"), "Bahrain (wec)", "Bahrain principal → WEC");
  eq(mapTrackName("Sebring International Raceway", "Sebring School Circuit"), "Sebring (school)", "Sebring School");
  eq(mapTrackName("Circuit de la Sarthe", "Circuit de la Sarthe Mulsanne"), "Circuit de la Sarthe (straight)", "Le Mans Mulsanne");
  eq(mapTrackName("Silverstone Circuit", "Silverstone Grand Prix Circuit - WEC"), "Silverstone (GP)", "Silverstone GP WEC");
  eq(mapTrackName("Circuit de Spa-Francorchamps", "Circuit de Spa-Francorchamps Endurance"), null, "Spa Endurance absent de la feuille → aucune référence");
  eq(mapTrackName("Fuji Speedway", "Tracé inconnu"), null, "tracé inconnu → aucune référence");
  eq(mapTrackName("Fuji Speedway"), "Fuji (chicane)", "sans tracé → circuit principal (comme avant)");

  section("ohne_speed — niveaux");
  eq(computeTier(ms(2, 4.556), SEBRING_GT3).tier, "Midpack", "103,6 % → Peloton (et non Bon)");
  eq(computeTier(ms(2, 0.21), SEBRING_GT3).tier, "Alien", "pile 100 % → Alien");
  eq(computeTier(ms(2, 0.5), SEBRING_GT3).tier, "Competitive", "100,2 % → Compétitif");
  eq(computeTier(ms(2, 2.61), SEBRING_GT3).tier, "Good", "pile 102 % → Bon");
  eq(computeTier(ms(2, 7.0), SEBRING_GT3).tier, "Tail-ender", "105,7 % → Fin de peloton");
  eq(computeTier(ms(2, 9.0), SEBRING_GT3).tier, "Offline", "107,3 % → Hors rythme");
}
