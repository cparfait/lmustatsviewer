/**
 * Noms de virage autorisés pour le coach vocal (module pur).
 *
 * Deux sources fiables, déjà filtrées par la règle « jamais un tracé qui ne colle pas
 * au jeu » : la table officielle (`data/cornerNames.ts`, numéros + noms) et les noms du
 * guide de freinage pour les tracés vérifiés (`braking-guide-data.ts` ; ses numéros sont
 * décalés, seuls les noms servent). La liste jointe à l'IA est **fermée** : sans liste,
 * le prompt radio interdit de nommer un virage.
 *
 * La phrase du pilote vient d'une dictée : on reconnaît aussi les **façons de dire**
 * (« la parabolique », « les Porsche », « le bus stop ») et un nom **déformé** par la
 * reconnaissance vocale (« théâtre rouge » → Tertre Rouge), par une clé phonétique
 * grossière et une ressemblance ≥ 0,85 sur une fenêtre de mots de même longueur.
 * Un nom ambigu (« Lesmo » tout court) n'est pas tranché à la place du pilote.
 */

import { CORNER_TABLE, type CornerTable } from "@/data/cornerNames";
import { cornerTableFor } from "@/lib/trackCorners";
import { BRAKING_GUIDE } from "./braking-guide-data";
import { matchBrakingTrackId } from "./braking-guide";

/** Minuscules, sans accents, ponctuation → espaces. */
export function plain(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Noms de virage du circuit (ordre du tour, sans doublon), avec le numéro officiel
 * quand la table officielle le donne (« La Source (T1) », « Raidillon (T3-4) »).
 */
export function trackCornerNames(track: string, course = "", table: CornerTable[] = CORNER_TABLE): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (name: string) => {
    const k = plain(name.replace(/\s*\(T[^)]*\)$/, ""));
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(name);
  };
  const fiche = cornerTableFor(course || track, table) ?? (course ? cornerTableFor(track, table) : null);
  if (fiche) {
    // Numéros consécutifs d'un même nom regroupés (« Raidillon (T3-4) »).
    const groups: { name: string; nums: string[] }[] = [];
    for (const c of fiche.corners) {
      if (!c.name) continue;
      const last = groups[groups.length - 1];
      if (last && last.name === c.name) last.nums.push(c.n);
      else groups.push({ name: c.name, nums: [c.n] });
    }
    for (const g of groups) {
      const n = g.nums.length > 1 ? `${g.nums[0]}-${g.nums[g.nums.length - 1]}` : g.nums[0];
      add(`${g.name} (T${n})`);
    }
  }
  const id = matchBrakingTrackId(track, course);
  const guide = id ? BRAKING_GUIDE.find((t) => t.id === id) : null;
  for (const c of guide?.corners ?? []) {
    // « Turn 5 », « Turn 2 (blind crest) » : un numéro, pas un nom.
    if (/^turns? \d/i.test(c.name)) continue;
    add(c.name);
  }
  return out;
}

/**
 * Façons de dire un virage à la radio → nom de la liste (circuit identifié par un
 * fragment de son nom normalisé). La cible doit exister dans `trackCornerNames`.
 */
const ALIASES: { track: string[]; forms: [string, string][] }[] = [
  {
    track: ["monza"],
    forms: [
      ["parabolique", "Parabolica (Alboreto)"],
      ["parabolica", "Parabolica (Alboreto)"],
      ["alboreto", "Curva Alboreto"],
      ["premiere chicane", "Prima Variante"],
      ["first chicane", "Prima Variante"],
      ["rettifilo", "Variante del Rettifilo"],
      ["deuxieme chicane", "Variante della Roggia"],
      ["second chicane", "Variante della Roggia"],
      ["roggia", "Variante della Roggia"],
      ["ascari", "Variante Ascari"],
      ["lesmo un", "Lesmo 1"],
      ["lesmo 1", "Lesmo 1"],
      ["first lesmo", "Lesmo 1"],
      ["lesmo deux", "Lesmo 2"],
      ["lesmo 2", "Lesmo 2"],
      ["second lesmo", "Lesmo 2"],
      ["biassono", "Curva Biassono"],
    ],
  },
  {
    track: ["mans", "sarthe"],
    forms: [
      ["virages porsche", "Porsche Curves"],
      ["les porsche", "Porsche Curves"],
      ["porsche curves", "Porsche Curves"],
      ["dunlop", "Dunlop Chicane"],
      ["chicane ford", "Ford Chicane"],
      ["ford chicane", "Ford Chicane"],
      ["les esses", "Esses"],
      ["tertre rouge", "Tertre Rouge"],
      ["indianapolis", "Indianapolis"],
      ["indy", "Indianapolis"],
      ["arnage", "Arnage"],
      ["virage de mulsanne", "Mulsanne Corner"],
      ["mulsanne corner", "Mulsanne Corner"],
      ["premiere chicane des hunaudieres", "Mulsanne Chicane 1"],
      ["deuxieme chicane des hunaudieres", "Mulsanne Chicane 2"],
    ],
  },
  {
    track: ["spa", "francorchamps"],
    forms: [
      ["bus stop", "Bus Stop Chicane"],
      ["la source", "La Source"],
      ["eau rouge", "Eau Rouge"],
      ["raidillon", "Raidillon"],
      ["les combes", "Les Combes"],
      ["pouhon", "Pouhon"],
      ["blanchimont", "Blanchimont"],
      ["stavelot", "Stavelot"],
      ["bruxelles", "Bruxelles"],
      ["malmedy", "Malmedy"],
      ["campus", "Campus"],
      ["fagnes", "Fagnes"],
    ],
  },
  {
    track: ["imola", "dino ferrari"],
    forms: [
      ["tamburello", "Tamburello"],
      ["villeneuve", "Villeneuve"],
      ["tosa", "Tosa"],
      ["piratella", "Piratella"],
      ["acque minerali", "Acque Minerali"],
      ["variante alta", "Variante Alta"],
      ["rivazza", "Rivazza 1 & 2"],
    ],
  },
];

/** Noms qui ne désignent pas un virage précis : le pilote doit dire lequel. */
const AMBIGUOUS: Record<string, string> = { lesmo: "Lesmo 1 / Lesmo 2" };

/** Mots de tous les jours trop proches d'un nom (« un grand sous-virage »). */
const COMMON = new Set(["grande", "grand", "source", "chicane", "virage", "curva", "turn", "corner"]);

/** Clé phonétique grossière (française surtout : lettres muettes, doubles, « ai » = « e »). */
export function phonetic(s: string): string {
  let t = plain(s);
  const rules: [RegExp, string][] = [
    [/eau|au/g, "o"],
    [/ai|ei|ey|et\b|er\b|ez\b/g, "e"],
    [/ph/g, "f"],
    [/qu|ck|c(?=[aou])|k/g, "k"],
    [/c(?=[eiy])/g, "s"],
    [/th/g, "t"],
    [/ou/g, "u"],
    [/y/g, "i"],
    [/h/g, ""],
    [/([a-z])\1+/g, "$1"],
    [/([a-z]{3,})[estxd]\b/g, "$1"],
  ];
  for (const [re, rep] of rules) t = t.replace(re, rep);
  return t.replace(/\s+/g, " ").trim();
}

/** Ressemblance 0..1 (1 − distance d'édition / longueur max). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return 0;
  const d = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return 1 - d[n] / Math.max(m, n);
}

export interface CornerMatch {
  /** Mots du pilote reconnus. */
  heard: string;
  /** Nom de la liste (ou « A / B » si ambigu). */
  name: string;
  how: "exact" | "alias" | "sound" | "ambiguous";
}

/** Nom de liste sans le numéro final (« La Source (T1) » → « La Source »). */
function bare(name: string): string {
  return name.replace(/\s*\(T[^)]*\)$/, "");
}

/**
 * Virages que la phrase du pilote désigne, sur la liste du circuit. Ordre : façon de
 * dire, nom exact, nom ambigu, puis ressemblance phonétique (≥ `threshold`).
 */
export function matchCorners(text: string, track: string, names: string[], threshold = 0.85): CornerMatch[] {
  const q = ` ${plain(text)} `;
  const out: CornerMatch[] = [];
  const taken = new Set<string>();
  const push = (m: CornerMatch) => {
    if (taken.has(m.name)) return;
    taken.add(m.name);
    out.push(m);
  };
  const byBare = new Map(names.map((n) => [plain(bare(n)), n]));
  const t = plain(track);
  for (const a of ALIASES) {
    if (!a.track.some((f) => t.includes(f))) continue;
    for (const [form, target] of a.forms) {
      const full = names.find((n) => bare(n) === target || n === target);
      if (full && q.includes(` ${form} `)) push({ heard: form, name: full, how: "alias" });
    }
  }
  for (const [k, n] of byBare)
    if (k.length >= 4 && !COMMON.has(k) && q.includes(` ${k} `)) push({ heard: k, name: n, how: "exact" });
  for (const [word, both] of Object.entries(AMBIGUOUS)) {
    if (q.includes(` ${word} `) && !out.some((m) => plain(m.name).startsWith(word)))
      if (names.some((n) => plain(n).startsWith(word))) push({ heard: word, name: both, how: "ambiguous" });
  }
  if (out.length) return out;
  // Nom déformé par la dictée : fenêtre de mots de même longueur que le nom.
  const words = plain(text).split(" ").filter(Boolean);
  for (const [k, n] of byBare) {
    const size = k.split(" ").length;
    const key = phonetic(k);
    if (key.replace(/ /g, "").length < 5 || COMMON.has(k)) continue;
    for (let i = 0; i + size <= words.length; i++) {
      const win = words.slice(i, i + size).join(" ");
      if (COMMON.has(win)) continue;
      if (similarity(phonetic(win), key) >= threshold) {
        push({ heard: win, name: n, how: "sound" });
        break;
      }
    }
  }
  return out;
}

/**
 * Bloc joint au coach vocal : la liste fermée des noms, et ce que la phrase du pilote
 * désigne. Vide si le circuit n'a pas de liste fiable (le prompt interdit alors tout nom).
 */
export function cornerNamesBlock(track: string, course: string, question: string): string {
  const names = trackCornerNames(track, course);
  if (!names.length) return "";
  const lines = [
    "## Corners of this track (the ONLY corner names you may use)",
    names.join(" · "),
  ];
  const hits = question ? matchCorners(question, `${track} ${course}`, names) : [];
  for (const h of hits) {
    lines.push(
      h.how === "ambiguous"
        ? `The driver said "${h.heard}" without saying which one (${h.name}): ask which one.`
        : `The driver's words "${h.heard}" mean: ${h.name}.`,
    );
  }
  return lines.join("\n");
}
