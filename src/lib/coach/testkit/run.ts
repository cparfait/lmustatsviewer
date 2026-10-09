/**
 * Point d'entrée des tests coach (COACH-LIVE-SPEC.md §14). Exécuté par
 * `scripts/run-coach-tests.mjs` (esbuild + node). Ajouter une suite = l'importer
 * ici et appeler son `run()` avant `report()`.
 */

import { report } from "./assert";
import { run as runPure } from "./suites/pure.suite";
import { run as runCoach } from "./suites/coach.suite";
import { run as runSpotter } from "./suites/spotter.suite";
import { run as runEngineer } from "./suites/engineer.suite";
import { run as runOhne } from "./suites/ohne.suite";
import { run as runFeedback } from "./suites/feedback.suite";

runPure();
runCoach();
runSpotter();
runEngineer();
runOhne();
runFeedback();
report();
