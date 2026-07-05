/**
 * Point d'entrée des tests coach (COACH-LIVE-SPEC.md §14). Exécuté par
 * `scripts/run-coach-tests.mjs` (esbuild + node). Ajouter une suite = l'importer
 * ici et appeler son `run()` avant `report()`.
 */

import { report } from "./assert";
import { run as runPure } from "./suites/pure.suite";
import { run as runCoach } from "./suites/coach.suite";
import { run as runSpotter } from "./suites/spotter.suite";

runPure();
runCoach();
runSpotter();
report();
