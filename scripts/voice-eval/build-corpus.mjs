// Construit le corpus d'écoute (10 phrases radio × 5 langues) à partir des
// gabarits réels de l'app (src/i18n/<lang>.ts). Première variante « A | B » retenue.
import { readFileSync, writeFileSync } from "node:fs";

const KEYS = [
  ["vPitRequest", {}],
  ["vFlagYellow", {}],
  ["vBlueFlag", {}],
  ["vPuncture", {}],
  ["vFuelLaps", { n: 3 }],
  ["vGapAhead", {}],
  ["vCornerBrakeEarly", { n: 4, d: 10 }],
  ["vCornerResolved", { n: 7, d: 2 }],
  ["vStintTireFade", { n: 3 }],
  ["vCornerWorse", { n: 9 }],
];
const out = {};
for (const lang of ["fr", "en", "es", "de", "it"]) {
  const src = readFileSync(`src/i18n/${lang}.ts`, "utf8");
  out[lang] = KEYS.map(([key, vars]) => {
    const m = src.match(new RegExp(String.raw`^\s+${key}:\s*"((?:[^"\\]|\\.)*)"`, "m"));
    if (!m) throw new Error(`${lang}.${key} introuvable`);
    let s = m[1].split(" | ")[0];
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{{${k}}}`, String(v));
    return { key, text: s };
  });
}
writeFileSync(process.argv[2] ?? "scripts/voice-eval/corpus.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
