/**
 * Point d'entrée des tests coach (COACH-LIVE-SPEC.md §14). Exécuté par
 * `scripts/run-coach-tests.mjs` (esbuild + node). Ajouter une suite = l'importer
 * ici et appeler son `run()` avant `report()`. Les suites asynchrones (faux
 * environnement Tauri) passent en dernier.
 */

import { report } from "./assert";
import { run as runPure } from "./suites/pure.suite";
import { run as runCoach } from "./suites/coach.suite";
import { run as runSpotter } from "./suites/spotter.suite";
import { run as runEngineer } from "./suites/engineer.suite";
import { run as runOhne } from "./suites/ohne.suite";
import { run as runFeedback } from "./suites/feedback.suite";
import { run as runRadio } from "./suites/radio.suite";
import { run as runRest } from "./suites/rest.suite";
import { run as runMaps } from "./suites/maps.suite";
import { run as runStrategy } from "./suites/strategy.suite";
import { run as runPlan } from "./suites/plan.suite";
import { run as runVoice } from "./suites/voice.suite";
import { run as runVeille } from "./suites/veille.suite";
import { run as runRace } from "./suites/race.suite";
import { run as runPostRace } from "./suites/postrace.suite";
import { run as runWhatsNew } from "./suites/whatsnew.suite";
import { run as runCoachVoice } from "./suites/coachvoice.suite";
import { run as runAnalysis } from "./suites/analysis.suite";
import { run as runFreeAi } from "./suites/freeai.suite";
import { run as runAtelier } from "./suites/atelier.suite";

runPure();
runCoach();
runSpotter();
runEngineer();
runOhne();
runFeedback();
runRadio();
runRest();
runMaps();
runStrategy();
runPlan();
runRace();
runPostRace();
runWhatsNew();
runCoachVoice();
runAnalysis();
runAtelier();
void (async () => {
  await runVoice();
  await runFreeAi();
  runVeille();
  report();
  // Minuteries de fond des modules (compteur de la voix en ligne) : inutile d'attendre.
  process.exit(0);
})();
