// Génère les notes de release GitHub d'une version à partir de
// `src/lib/changelog.ts`, dans les 5 langues de l'app.
//
// Format : un titre par langue (« ## 🇫🇷 Français »…) puis les sections, les
// langues séparées par « --- ». La page « Notes de version » de la vitrine
// repère ces titres et n'affiche que la langue du visiteur (repli anglais).
//
//   node scripts/release-notes.mjs            → version en développement (sinon la dernière)
//   node scripts/release-notes.mjs 1.0.9      → version donnée
//   node scripts/release-notes.mjs 1.0.9 --out notes.md

import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Charge un module TS du projet (sans dépendance) et renvoie ses exports. */
async function load(rel) {
  const res = await build({
    entryPoints: [resolve(root, rel)],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    define: { __APP_VERSION__: '"0.0.0"' },
  });
  const code = res.outputFiles[0].text;
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

const LANGS = [
  { code: "fr", title: "🇫🇷 Français" },
  { code: "en", title: "🇬🇧 English" },
  { code: "es", title: "🇪🇸 Español" },
  { code: "de", title: "🇩🇪 Deutsch" },
  { code: "it", title: "🇮🇹 Italiano" },
];
// Mêmes icônes que la page Notes de version de l'app (`routes/Changelog.tsx`).
const ICONS = { added: "✅", improved: "⬆️", fixed: "🐛", changed: "♻️", removed: "🗑️" };

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outFile = outIdx !== -1 ? args[outIdx + 1] : null;
const wanted = args.find((a, i) => !a.startsWith("--") && i !== outIdx + 1);

const { CHANGELOG, pickLang, normalizeItem } = await load("src/lib/changelog.ts");
const entry = wanted
  ? CHANGELOG.find((e) => e.version === wanted.replace(/^v/, ""))
  : CHANGELOG.find((e) => e.dev) ?? CHANGELOG[0];
if (!entry) {
  console.error(`Version introuvable dans changelog.ts : ${wanted}`);
  process.exit(1);
}

const blocks = [];
for (const { code, title } of LANGS) {
  const labels = (await load(`src/i18n/${code}.ts`)).default.changelog;
  const lines = [`## ${title}`, ""];
  for (const section of entry.sections) {
    lines.push(`### ${ICONS[section.kind] ?? ""} ${labels[section.kind] ?? section.kind}`.trim(), "");
    for (const item of section.items) {
      const { text, featured } = normalizeItem(item);
      const t = pickLang(text, code);
      lines.push(featured ? `- **${t}**` : `- ${t}`);
    }
    lines.push("");
  }
  blocks.push(lines.join("\n").trimEnd());
}

const md = blocks.join("\n\n---\n\n") + "\n";
if (outFile) {
  writeFileSync(resolve(process.cwd(), outFile), md, "utf8");
  console.error(`Notes ${entry.version} écrites dans ${outFile}`);
} else {
  process.stdout.write(md);
}
