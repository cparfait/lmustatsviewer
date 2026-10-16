/**
 * Entrée en ligne de commande du banc de rejeu : `npm run replay -- <fichier.jsonl>`.
 * Lit une séance enregistrée (Config › Maintenance › Banc de rejeu) et imprime
 * la chronologie des détecteurs.
 */

import { readFileSync } from "node:fs";
import { parseJsonl } from "./format";
import { mmss, runBench } from "./bench";

const file = process.argv[2];
if (!file) {
  console.error("Usage : npm run replay -- <seance.jsonl>");
  process.exit(2);
}
const frames = parseJsonl(readFileSync(file, "utf-8"));
const r = runBench(frames);
console.log(`${r.frames} trames, ${mmss(r.durationMs)} de séance`);
for (const l of r.lines) console.log(`${mmss(l.t)}  [${l.source}] ${l.text}`);
if (!r.lines.length) console.log("Aucun événement détecté.");
