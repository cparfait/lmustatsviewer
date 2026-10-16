// Banc de rejeu : rejoue une séance enregistrée (Config › Maintenance › Banc de
// rejeu) dans les détecteurs de l'ingénieur, sans le jeu.
// Usage : npm run replay -- <seance.jsonl>

import { build } from "esbuild";
import { rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, ".replay-bench.cjs");
const file = process.argv[2];
if (!file) {
  console.error("Usage : npm run replay -- <seance.jsonl>");
  process.exit(2);
}

await build({
  entryPoints: [resolve(root, "src/lib/replay/cli.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: out,
  logLevel: "warning",
  tsconfig: resolve(root, "tsconfig.json"),
});

let code = 0;
try {
  execFileSync("node", [out, resolve(file)], { stdio: "inherit" });
} catch (e) {
  code = e.status ?? 1;
} finally {
  rmSync(out, { force: true });
}
process.exit(code);
