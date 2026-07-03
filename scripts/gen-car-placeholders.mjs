// Génère des silhouettes SVG de repli pour les voitures sans rendu réel.
// Forme « proto » (Hyper/LMP) ou « gt » (GT3/GTE), teintée par couleur de classe.
// Idempotent : n'écrase PAS un fichier .webp/.png réel ni un .svg déjà présent.
import { writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "cars");

const COLORS = {
  hyper: "#ef4444",
  lmp2: "#3b82f6",
  lmp3: "#a855f7",
  gt3: "#22c55e",
  gte: "#f97316",
};

// slug → [shape, classKey]
const CARS = {
  // Hypercar (proto, rouge)
  "alpine-a424": ["proto", "hyper"],
  "aston-martin-valkyrie-amr-lmh": ["proto", "hyper"],
  "cadillac-v-series-r": ["proto", "hyper"],
  "ferrari-499p": ["proto", "hyper"],
  "genesis-gmr-001": ["proto", "hyper"],
  "glickenhaus-007-lmh": ["proto", "hyper"],
  "isotta-fraschini-tipo-6-c": ["proto", "hyper"],
  "lamborghini-sc63": ["proto", "hyper"],
  "peugeot-9x8": ["proto", "hyper"],
  "peugeot-9x8-evo": ["proto", "hyper"],
  "porsche-963": ["proto", "hyper"],
  "toyota-gr010-hybrid": ["proto", "hyper"],
  "toyota-tr010": ["proto", "hyper"],
  "vanwall-vandervell-680": ["proto", "hyper"],
  // LMP2 (proto, bleu)
  "oreca-07-gibson": ["proto", "lmp2"],
  // LMP3 (proto, violet)
  "adess-ad25": ["proto", "lmp3"],
  "duqueine-d09": ["proto", "lmp3"],
  "ginetta-g61-lt-p325-evo": ["proto", "lmp3"],
  "ligier-js-p325": ["proto", "lmp3"],
  // GT3 (gt, vert)
  "aston-martin-vantage-amr-lmgt3-evo": ["gt", "gt3"],
  "bmw-m4-lmgt3": ["gt", "gt3"],
  "bmw-m4-lmgt3-evo": ["gt", "gt3"],
  "chevrolet-corvette-z06-lmgt3-r": ["gt", "gt3"],
  "ferrari-296-lmgt3": ["gt", "gt3"],
  "ferrari-296-lmgt3-evo": ["gt", "gt3"],
  "ford-mustang-lmgt3": ["gt", "gt3"],
  "lamborghini-huracan-lmgt3-evo-2": ["gt", "gt3"],
  "lexus-rc-f-lmgt3": ["gt", "gt3"],
  "mclaren-720s-lmgt3-evo": ["gt", "gt3"],
  "mercedes-amg-lmgt3": ["gt", "gt3"],
  "porsche-911-gt3-r-lmgt3": ["gt", "gt3"],
  // GTE (gt, orange)
  "aston-martin-vantage-amr-gte": ["gt", "gte"],
  "chevrolet-corvette-c8-r-gte": ["gt", "gte"],
  "ferrari-488-gte-evo": ["gt", "gte"],
  "porsche-911-rsr-19": ["gt", "gte"],
};

const WHEELS = `
  <g>
    <circle cx="198" cy="252" r="60" fill="#161b27"/>
    <circle cx="198" cy="252" r="29" fill="#39414f"/>
    <circle cx="198" cy="252" r="11" fill="#161b27"/>
    <circle cx="606" cy="252" r="60" fill="#161b27"/>
    <circle cx="606" cy="252" r="29" fill="#39414f"/>
    <circle cx="606" cy="252" r="11" fill="#161b27"/>
  </g>`;

function protoSvg(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 330" role="img" aria-label="placeholder">
  <ellipse cx="402" cy="318" rx="338" ry="12" fill="#000" opacity="0.12"/>
  <!-- aileron arrière -->
  <rect x="690" y="150" width="98" height="13" rx="6" fill="${color}"/>
  <rect x="694" y="150" width="11" height="52" rx="3" fill="${color}"/>
  <!-- carrosserie proto -->
  <path fill="${color}" d="M48 268 L80 235
    C122 205 170 196 216 196
    C252 154 314 136 388 135
    C452 135 500 151 520 184
    C590 181 668 182 716 198
    L762 212 L756 268 Z"/>
  <!-- verrière -->
  <path fill="#000" opacity="0.22" d="M300 158 C350 142 432 142 486 160 L470 184 C430 172 360 172 326 184 Z"/>
  ${WHEELS}
</svg>
`;
}

function gtSvg(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 330" role="img" aria-label="placeholder">
  <ellipse cx="402" cy="318" rx="338" ry="12" fill="#000" opacity="0.12"/>
  <!-- aileron arrière -->
  <rect x="676" y="166" width="110" height="13" rx="6" fill="${color}"/>
  <rect x="700" y="166" width="11" height="54" rx="3" fill="${color}"/>
  <!-- carrosserie GT -->
  <path fill="${color}" d="M42 272 L64 246
    C96 236 152 232 200 230
    L256 192 C312 172 470 172 522 192 L566 232
    C642 232 722 236 766 250 L770 272 Z"/>
  <!-- vitrage -->
  <path fill="#000" opacity="0.22" d="M262 198 L300 178 L470 178 L508 198 Z"/>
  <!-- bas de caisse -->
  <rect x="120" y="262" width="560" height="12" rx="4" fill="#000" opacity="0.18"/>
  ${WHEELS}
</svg>
`;
}

let written = 0;
let skipped = 0;
for (const [slug, [shape, cls]] of Object.entries(CARS)) {
  // Ne pas écraser un vrai rendu déjà fourni.
  if (existsSync(join(DIR, `${slug}.webp`)) || existsSync(join(DIR, `${slug}.png`))) {
    skipped++;
    continue;
  }
  const color = COLORS[cls];
  const svg = shape === "proto" ? protoSvg(color) : gtSvg(color);
  writeFileSync(join(DIR, `${slug}.svg`), svg, "utf8");
  written++;
}
console.log(`SVG écrits : ${written} — ignorés (rendu réel présent) : ${skipped}`);
