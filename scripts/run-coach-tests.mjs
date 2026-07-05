// Runner des tests du coach par virage (COACH-LIVE-SPEC.md §14).
// Bundle l'entrée `testkit/run.ts` avec esbuild (résout l'alias `@/` via tsconfig)
// puis l'exécute sous node. Aucun framework de test — assertions maison.

import { build } from "esbuild";
import { rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = resolve(root, "src/lib/coach/testkit/run.ts");
const out = resolve(root, ".coach-tests.cjs");

await build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: out,
  logLevel: "warning",
  // esbuild lit `compilerOptions.paths` du tsconfig → l'alias `@/*` est résolu.
  tsconfig: resolve(root, "tsconfig.json"),
});

let code = 0;
try {
  execFileSync("node", [out], { stdio: "inherit" });
} catch (e) {
  code = e.status ?? 1;
} finally {
  rmSync(out, { force: true });
}
process.exit(code);
