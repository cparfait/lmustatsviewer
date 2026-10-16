/**
 * Annonces chiffrées de la voix en ligne, **assemblées** à partir de morceaux
 * enregistrés une fois (module pur, testé par `radio.suite.ts`).
 *
 * Une phrase avec un chiffre (« Carburant : environ 2 tours restants ») n'est
 * jamais la même d'une course à l'autre : impossible de la préparer telle
 * quelle. On la reconnaît donc parmi les gabarits d'annonces (personnalisés
 * compris), on la découpe en parties fixes (« Carburant : environ », « tours
 * restants ») et en nombres dits en toutes lettres (« deux »), et chaque morceau
 * est lu dans le cache disque de la voix en ligne (« Préparer la voix »). La
 * lecture recolle les morceaux (`joinPcm`) : sans réseau, donc sans délai.
 *
 * Non assemblable (→ Piper, ou en direct pour l'information) : noms propres et
 * textes libres (pilote, classe, repère…), nombres au-delà de 999, ordinaux
 * collés (« 3ᵉ »), et toute phrase qu'aucun gabarit ne reconnaît.
 */

import { splitVariants } from "@/lib/engineer/variants";
import { ttsWords } from "@/lib/ttsWords";

// ── Nombres en toutes lettres ────────────────────────────────────────────────

/**
 * Accord du nombre avec le nom qui suit : `plain` = nombre seul (« P un »,
 * « eins »), `masc` / `fem` = devant un nom (« un tour », « une minute »,
 * « una vuelta », « eine Runde »). Ne change que les nombres finissant par 1.
 */
export type NumForm = "plain" | "masc" | "fem";

const FR_U = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
];
const FR_T = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

function fr99(n: number, form: NumForm): string {
  const one = form === "fem" ? "une" : "un";
  if (n < 20) return n === 1 ? one : FR_U[n];
  if (n < 70) {
    const t = FR_T[Math.floor(n / 10)];
    const u = n % 10;
    return u === 0 ? t : u === 1 ? `${t}-et-${one}` : `${t}-${FR_U[u]}`;
  }
  if (n < 80) return n === 71 ? "soixante-et-onze" : `soixante-${FR_U[n - 60]}`;
  const u = n - 80;
  return u === 0 ? "quatre-vingts" : `quatre-vingt-${u === 1 ? one : FR_U[u]}`;
}

const EN_U = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const EN_T = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function en99(n: number): string {
  if (n < 20) return EN_U[n];
  const u = n % 10;
  return u === 0 ? EN_T[Math.floor(n / 10)] : `${EN_T[Math.floor(n / 10)]}-${EN_U[u]}`;
}

const ES_U = [
  "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
  "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve",
  "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete",
  "veintiocho", "veintinueve",
];
const ES_T = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const ES_ONE: Record<NumForm, string> = { plain: "uno", masc: "un", fem: "una" };

function es99(n: number, form: NumForm): string {
  if (n === 1) return ES_ONE[form];
  if (n === 21) return form === "masc" ? "veintiún" : form === "fem" ? "veintiuna" : "veintiuno";
  if (n < 30) return ES_U[n];
  const u = n % 10;
  const t = ES_T[Math.floor(n / 10)];
  return u === 0 ? t : `${t} y ${u === 1 ? ES_ONE[form] : ES_U[u]}`;
}

const IT_U = [
  "zero", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove",
  "dieci", "undici", "dodici", "tredici", "quattordici", "quindici", "sedici", "diciassette", "diciotto", "diciannove",
];
const IT_T = ["", "", "venti", "trenta", "quaranta", "cinquanta", "sessanta", "settanta", "ottanta", "novanta"];
const IT_ONE: Record<NumForm, string> = { plain: "uno", masc: "un", fem: "una" };

function it99(n: number, form: NumForm): string {
  if (n === 1) return IT_ONE[form];
  if (n < 20) return IT_U[n];
  const u = n % 10;
  const t = IT_T[Math.floor(n / 10)];
  if (u === 0) return t;
  // Élision devant « uno » / « otto » (ventuno, trentotto) ; « tré » accentué en fin de mot.
  const base = u === 1 || u === 8 ? t.slice(0, -1) : t;
  return `${base}${u === 3 ? "tré" : u === 1 && form === "fem" ? "una" : IT_U[u]}`;
}

const DE_U = [
  "null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun",
  "zehn", "elf", "zwölf", "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn",
];
const DE_T = ["", "", "zwanzig", "dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"];
const DE_ONE: Record<NumForm, string> = { plain: "eins", masc: "ein", fem: "eine" };

function de99(n: number, form: NumForm): string {
  if (n === 1) return DE_ONE[form];
  if (n < 20) return DE_U[n];
  const u = n % 10;
  const t = DE_T[Math.floor(n / 10)];
  return u === 0 ? t : `${u === 1 ? "ein" : DE_U[u]}und${t}`;
}

const code2 = (lang: string) => (lang || "en").slice(0, 2).toLowerCase();

function words99(n: number, lang: string, form: NumForm): string {
  switch (code2(lang)) {
    case "fr":
      return fr99(n, form);
    case "es":
      return es99(n, form);
    case "it":
      return it99(n, form);
    case "de":
      return de99(n, form);
    default:
      return en99(n);
  }
}

const ES_H_MASC = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

/** Centaines (`h` de 1 à 9) ; `exact` : rien ne suit (« deux cents » / « deux cent trois »). */
function hundredsWord(h: number, exact: boolean, lang: string, form: NumForm): string {
  switch (code2(lang)) {
    case "fr":
      return h === 1 ? "cent" : `${FR_U[h]} cent${exact ? "s" : ""}`;
    case "es":
      if (h === 1) return exact ? "cien" : "ciento";
      return form === "fem" ? ES_H_MASC[h].replace(/os$/, "as") : ES_H_MASC[h];
    case "it":
      return h === 1 ? "cento" : `${IT_U[h]}cento`;
    case "de":
      return h === 1 ? "hundert" : `${DE_U[h]}hundert`;
    default:
      return `${EN_U[h]} hundred${exact ? "" : " and"}`;
  }
}

/**
 * Entier de 0 à 999 en morceaux à dire (« 203 » → « deux cent », « trois ») ;
 * `null` au-delà (pas assemblable : Piper le dira).
 */
export function numberSegments(n: number, lang: string, form: NumForm = "plain"): string[] | null {
  if (!Number.isInteger(n) || n < 0 || n > 999) return null;
  if (n < 100) return [words99(n, lang, form)];
  const h = Math.floor(n / 100);
  const r = n % 100;
  const head = hundredsWord(h, r === 0, lang, form);
  return r === 0 ? [head] : [head, words99(r, lang, form)];
}

/** « 0.4 » d'un seul morceau (« zéro virgule quatre ») : les écarts les plus fréquents. */
function shortDecimal(i: number, j: number, lang: string): string {
  return `${words99(i, lang, "plain")} ${ttsWords(lang).decimal} ${words99(j, lang, "plain")}`;
}

/**
 * Partie après la virgule : chiffre par chiffre en anglais et en allemand
 * (« point four five »), sinon zéros de tête puis nombre (« virgule zéro cinq »,
 * « virgule quatre cent cinquante-six »), comme la voix le lirait d'un bloc.
 */
function fractionSegments(frac: string, lang: string, digitByDigit: boolean): string[] | null {
  if (digitByDigit) return [...frac].map((d) => words99(Number(d), lang, "plain"));
  const out: string[] = [];
  let i = 0;
  while (i < frac.length - 1 && frac[i] === "0") {
    out.push(words99(0, lang, "plain"));
    i++;
  }
  const rest = numberSegments(Number(frac.slice(i)), lang);
  return rest ? [...out, ...rest] : null;
}

const NUMBER_RE = /^([+-])?(\d{1,3})(?:[.,](\d{1,3}))?(\s?s)?$/;
const CHRONO_RE = /^(\d):(\d{2})(?:\.(\d{1,3}))?$/;

/** Silence entre deux morceaux (ms) : dans un nombre, entre deux mots, à une ponctuation. */
export const PAUSE_TIGHT_MS = 20;
export const PAUSE_WORD_MS = 50;
export const PAUSE_PHRASE_MS = 170;

export interface Segment {
  /** Texte du morceau, sans chiffre (clé du cache disque). */
  text: string;
  /** Silence avant ce morceau (ms). */
  pauseMs: number;
}

const seg = (texts: string[], first: number, inner = PAUSE_TIGHT_MS): Segment[] =>
  texts.map((text, i) => ({ text, pauseMs: i === 0 ? first : inner }));

/**
 * Valeur chiffrée brute d'une variable (« 3 », « 0.4 », « +1.2s », « 1:42.881 »)
 * en morceaux, ou `null` si elle n'est pas un nombre qu'on sait dire.
 */
export function valueSegments(raw: string, lang: string, form: NumForm = "plain"): Segment[] | null {
  const v = raw.trim();
  const w = ttsWords(lang);
  const chrono = CHRONO_RE.exec(v);
  if (chrono) {
    // Convention radio de `normalizeForTts` : « une, 42, 881 » (minute au féminin en FR).
    const min = numberSegments(Number(chrono[1]), lang, code2(lang) === "fr" ? "fem" : "plain");
    const sec = numberSegments(Number(chrono[2]), lang);
    const ms = chrono[3] ? fractionSegments(chrono[3], lang, false) : [];
    if (!min || !sec || !ms) return null;
    return [...seg(min, 0), ...seg(sec, PAUSE_PHRASE_MS), ...(ms.length ? seg(ms, PAUSE_PHRASE_MS) : [])];
  }
  const m = NUMBER_RE.exec(v);
  if (!m) return null;
  const [, sign, intStr, frac, secs] = m;
  const n = Number(intStr);
  const out: string[] = [];
  if (sign) out.push(sign === "+" ? w.plus : w.minus);
  if (frac === undefined) {
    const ints = numberSegments(n, lang, sign ? "plain" : form);
    if (!ints) return null;
    out.push(...ints);
  } else if (n < 10 && frac.length === 1) {
    out.push(shortDecimal(n, Number(frac), lang));
  } else {
    const ints = numberSegments(n, lang);
    const fr = fractionSegments(frac, lang, code2(lang) === "en" || code2(lang) === "de");
    if (!ints || !fr) return null;
    out.push(...ints, w.decimal, ...fr);
  }
  if (secs) out.push(w.seconds);
  return seg(out, 0);
}

/** Noms qui imposent l'accord du nombre qui les précède, par langue. */
const NOUN_GENDER: Record<string, { fem?: RegExp; masc?: RegExp }> = {
  fr: { fem: /^(minutes?|secondes?|fois|coupures?|alertes?|heures?|places?|voitures?)$/i },
  es: {
    fem: /^(vueltas?|décimas?|paradas?|alertas?|seguidas|salidas?|veces|vez|horas?|curvas?|posici(ón|ones))$/i,
    masc: /^(segundos?|grados?|por|metros?|minutos?|litros?|coches?|puestos?)$/i,
  },
  it: {
    fem: /^(volte|volta|soste?|ore|ora|curve?|posizion[ei])$/i,
    masc: /^(gir[io]|second[io]|grad[io]|per|metr[io]|decim[io]|minut[io]|litr[io]|tagli|taglio|avvis[io])$/i,
  },
  de: {
    fem: /^(runden?|sekunden?|minuten?|kurven?|stunden?)$/i,
    masc: /^(grad|prozent|meter|zehntel|liter|stopps?|alarme?|mal|platz)$/i,
  },
};

/** Accord d'un nombre suivi de `after` (texte fixe du gabarit après la variable). */
export function formBefore(after: string, lang: string): NumForm {
  const word = /^\s*([\p{L}]+)/u.exec(after)?.[1];
  const g = NOUN_GENDER[code2(lang)];
  if (!word || !g) return "plain";
  if (g.fem?.test(word)) return "fem";
  if (g.masc?.test(word)) return "masc";
  return "plain";
}

// ── Gabarits ─────────────────────────────────────────────────────────────────

/** Variables jamais assemblables : noms propres et textes libres. */
export const FREE_TEXT_VARS: ReadonlySet<string> = new Set([
  "name",
  "driver",
  "cls",
  "what",
  "wheels",
  "marker",
  "sector",
  "car",
  "no",
]);

/**
 * Gabarits sans variable qui servent **de valeur** à une autre annonce
 * (« dans moins d'un tour », « une » de « une minute ») ou de préfixe
 * (« Je répète : ») : ajoutés aux morceaux à préparer.
 */
export const SEGMENT_PHRASE_KEYS: readonly string[] = [
  "vMinOne",
  "vRepeatPrefix",
  "inLessMinute",
  "inLessLap",
  "inOneLap",
];

/** Clés d'annonce reconnues : `live.v*` (ingénieur, coach), `live.sp*` (réponses), `live.in*` (délais). */
export function isSegmentTemplateKey(key: string): boolean {
  return /^(v|sp|in)[A-Z]/.test(key);
}

export interface SegmentEntry {
  /** Suffixe sous `live.` (ex. « vFuelLaps »). */
  key: string;
  /** Texte effectif (personnalisé ou par défaut), variantes `A | B` comprises. */
  text: string;
}

const PLACEHOLDER_RE = /\{\{\s*(\w+)\s*\}\}/g;
const EDGE_PUNCT_RE = /^[\s,.;:!?—–-]+|[\s,.;:!?—–-]+$/g;
const PUNCT_RE = /[,.;:!?—–]/;

const stripEdges = (s: string) => s.replace(EDGE_PUNCT_RE, "");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");

interface CompiledVariant {
  key: string;
  re: RegExp;
  /** Textes fixes autour des variables (`slots.length + 1`). */
  fixed: string[];
  slots: string[];
  /** Accord de chaque variable selon le mot qui la suit. */
  forms: NumForm[];
  /** Préfixe littéral (filtre rapide avant l'expression régulière). */
  head: string;
}

export interface SegmentLexicon {
  lang: string;
  normalize: (text: string) => string;
  variants: CompiledVariant[];
  /** Phrases fixes connues (gabarits sans variable), normalisées, sans ponctuation de bord. */
  known: Set<string>;
  /** Morceaux des phrases-valeurs (`SEGMENT_PHRASE_KEYS`). */
  phraseSegments: string[];
}

function compileVariant(key: string, variant: string): CompiledVariant | null {
  const v = variant.replace(/[\s,.;:!?]+$/, "");
  const fixed: string[] = [];
  const slots: string[] = [];
  let last = 0;
  for (const m of v.matchAll(PLACEHOLDER_RE)) {
    fixed.push(v.slice(last, m.index));
    slots.push(m[1]);
    last = m.index! + m[0].length;
  }
  fixed.push(v.slice(last));
  if (slots.length === 0) return null;
  if (slots.some((s) => FREE_TEXT_VARS.has(s))) return null;
  for (let i = 1; i < fixed.length; i++) {
    // Deux variables collées : découpe ambiguë. Lettre collée après : ordinal (« 3ᵉ »).
    if (i < fixed.length - 1 && fixed[i] === "") return null;
    if (/^\p{L}/u.test(fixed[i])) return null;
  }
  const re = new RegExp(`^${fixed.map(escapeRe).join("(.+?)")}$`, "u");
  return { key, re, fixed, slots, forms: [], head: fixed[0] };
}

/**
 * Prépare la reconnaissance des annonces d'une langue. `normalize` : la même
 * normalisation que la voix (`normalizeForTts`) — un morceau doit être le texte
 * exact rangé dans le cache.
 */
export function buildLexicon(lang: string, entries: SegmentEntry[], normalize: (text: string) => string): SegmentLexicon {
  const variants: CompiledVariant[] = [];
  const known = new Set<string>();
  const phraseSegments: string[] = [];
  for (const { key, text } of entries) {
    for (const variant of splitVariants(text)) {
      if (!variant.includes("{{")) {
        const k = stripEdges(normalize(variant));
        if (!k) continue;
        known.add(k);
        if (SEGMENT_PHRASE_KEYS.includes(key) && !/\d/.test(k)) phraseSegments.push(k);
        continue;
      }
      const cv = compileVariant(key, variant);
      if (!cv) continue;
      cv.forms = cv.slots.map((_, i) => formBefore(cv.fixed[i + 1], lang));
      variants.push(cv);
    }
  }
  return { lang, normalize, variants, known, phraseSegments };
}

/** Silence que demande un bord de texte fixe : ponctuation, simple blanc ou rien. */
const edgePause = (edge: string) => (!edge ? 0 : PUNCT_RE.test(edge) ? PAUSE_PHRASE_MS : PAUSE_WORD_MS);

/**
 * Texte fixe d'un gabarit → morceau (normalisé, sans ponctuation de bord).
 * Renvoie le silence à placer avant le morceau suivant.
 */
function pushFixed(out: Segment[], fixed: string, lex: SegmentLexicon, pending: number): number {
  const lead = /^[\s,.;:!?—–-]*/.exec(fixed)![0];
  const tail = /[\s,.;:!?—–-]*$/.exec(fixed)![0];
  const core = stripEdges(lex.normalize(fixed));
  if (!core) return Math.max(pending, edgePause(fixed));
  out.push({ text: core, pauseMs: Math.max(pending, edgePause(lead)) });
  return edgePause(tail);
}

/** Ajoute des morceaux en reportant le silence en attente sur le premier. */
function pushAll(out: Segment[], segs: Segment[], pending: number) {
  segs.forEach((s, i) => out.push(i === 0 ? { ...s, pauseMs: Math.max(pending, s.pauseMs) } : s));
}

const MAX_DEPTH = 2;

/** Un passage de texte (phrase entière, fragment ou valeur de variable) en morceaux. */
function matchSpan(span: string, lex: SegmentLexicon, depth: number, memo: Map<string, Segment[] | null>): Segment[] | null {
  const s = stripEdges(span);
  if (!s) return null;
  const memoKey = `${depth}|${s}`;
  if (memo.has(memoKey)) return memo.get(memoKey)!;
  let result: Segment[] | null = null;
  if (!/\d/.test(s)) {
    const k = stripEdges(lex.normalize(s));
    if (lex.known.has(k)) result = [{ text: k, pauseMs: 0 }];
  } else {
    for (const cv of lex.variants) {
      if (cv.head && !s.startsWith(cv.head.trimStart())) continue;
      const m = cv.re.exec(s);
      if (!m) continue;
      const out: Segment[] = [];
      let pending = 0;
      let okAll = true;
      for (let i = 0; i < cv.slots.length && okAll; i++) {
        pending = pushFixed(out, cv.fixed[i], lex, pending);
        const value = m[i + 1];
        const segs =
          valueSegments(value, lex.lang, cv.forms[i]) ??
          (depth < MAX_DEPTH ? matchSpan(value, lex, depth + 1, memo) : null);
        if (!segs) okAll = false;
        else {
          pushAll(out, segs, pending || (out.length ? PAUSE_WORD_MS : 0));
          pending = 0;
        }
      }
      if (!okAll) continue;
      pushFixed(out, cv.fixed[cv.fixed.length - 1], lex, pending);
      if (out.length) out[0] = { ...out[0], pauseMs: 0 };
      result = out;
      break;
    }
  }
  memo.set(memoKey, result);
  return result;
}

/**
 * Couvre `text` par une suite de passages reconnus, coupée aux frontières
 * données (DP, le moins de morceaux possible) : une annonce fusionnée
 * (« P3, place gagnée, Tu gagnes 0.4 »), précédée du prénom ou de « Je répète : ».
 */
function cover(text: string, cuts: number[], lex: SegmentLexicon, memo: Map<string, Segment[] | null>): Segment[] | null {
  const bounds = [0, ...cuts, text.length];
  const n = bounds.length - 1;
  const best: (Segment[] | null)[] = Array(n + 1).fill(null);
  best[n] = [];
  for (let i = n - 1; i >= 0; i--) {
    for (let j = i + 1; j <= n; j++) {
      const rest = best[j];
      if (!rest) continue;
      const head = matchSpan(text.slice(bounds[i], bounds[j]), lex, 0, memo);
      if (!head) continue;
      const last = text.slice(bounds[i], bounds[j]).trimEnd().slice(-1);
      const joined = [...head];
      if (rest.length) joined.push({ ...rest[0], pauseMs: PUNCT_RE.test(last) ? PAUSE_PHRASE_MS : PAUSE_WORD_MS }, ...rest.slice(1));
      if (!best[i] || joined.length < best[i]!.length) best[i] = joined;
    }
  }
  return best[0];
}

/** Frontières après une ponctuation suivie d'un blanc (fin de fragment). */
function punctCuts(text: string): number[] {
  return [...text.matchAll(/[,.;:!?—–]\s+/g)].map((m) => m.index! + m[0].length);
}

/** Frontières à chaque blanc (texte collé : « Meilleur tour une minute 23.4 »). */
function wordCuts(text: string): number[] {
  return [...text.matchAll(/\s+/g)].map((m) => m.index! + m[0].length);
}

/**
 * Découpe une annonce **brute** (avant normalisation) en morceaux à lire dans
 * le cache, ou `null` si elle n'est pas assemblable. Ne regarde jamais le cache :
 * l'appelant vérifie que chaque morceau y est.
 */
export function assembleSegments(raw: string, lex: SegmentLexicon): Segment[] | null {
  const text = raw.trim();
  if (!text || !/\d/.test(text)) return null;
  const memo = new Map<string, Segment[] | null>();
  const whole = matchSpan(text, lex, 0, memo);
  if (whole) return whole;
  const byPunct = cover(text, punctCuts(text), lex, memo);
  if (byPunct) return byPunct;
  const words = wordCuts(text);
  return words.length <= 24 ? cover(text, words, lex, memo) : null;
}

/**
 * Tous les morceaux à préparer pour la langue : parties fixes des gabarits
 * assemblables, phrases-valeurs, nombres de 0 à 999 (accords compris),
 * décimaux courts (« zéro virgule quatre ») et mots de liaison. Sans doublon.
 */
export function segmentInventory(lex: SegmentLexicon): string[] {
  const out = new Set<string>();
  for (const cv of lex.variants) {
    for (const f of cv.fixed) {
      const core = stripEdges(lex.normalize(f));
      if (core) out.add(core);
    }
  }
  for (const p of lex.phraseSegments) out.add(p);
  const forms: NumForm[] = ["plain", "masc", "fem"];
  for (let n = 0; n < 100; n++) for (const f of forms) out.add(words99(n, lex.lang, f));
  for (let h = 1; h <= 9; h++)
    for (const exact of [true, false]) for (const f of forms) out.add(hundredsWord(h, exact, lex.lang, f));
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) out.add(shortDecimal(i, j, lex.lang));
  const w = ttsWords(lex.lang);
  for (const word of [w.decimal, w.plus, w.minus, w.seconds]) out.add(word);
  return [...out];
}

// ── Recollage audio ──────────────────────────────────────────────────────────

/**
 * Retire le silence de tête et de queue d'un morceau (la voix en ligne en met
 * autour de chaque phrase), en gardant `padMs` de marge. Renvoie une vue.
 */
export function trimSilence(x: Float32Array, sampleRate: number, threshold = 0.006, padMs = 12): Float32Array {
  let a = 0;
  while (a < x.length && Math.abs(x[a]) < threshold) a++;
  let b = x.length - 1;
  while (b > a && Math.abs(x[b]) < threshold) b--;
  if (a >= x.length) return x.subarray(0, 0);
  const pad = Math.round((padMs * sampleRate) / 1000);
  return x.subarray(Math.max(0, a - pad), Math.min(x.length, b + 1 + pad));
}

/**
 * Recolle des morceaux mono : `pausesMs[i]` de silence avant le morceau `i`,
 * fondu de `fadeMs` à chaque bord (pas de clic au raccord).
 */
export function joinPcm(
  chunks: Float32Array[],
  pausesMs: number[],
  sampleRate: number,
  fadeMs = 6,
): Float32Array<ArrayBuffer> {
  const gaps = chunks.map((_, i) => (i === 0 ? 0 : Math.round(((pausesMs[i] ?? 0) * sampleRate) / 1000)));
  const total = chunks.reduce((n, c, i) => n + c.length + gaps[i], 0);
  const out = new Float32Array(total);
  const fade = Math.max(1, Math.round((fadeMs * sampleRate) / 1000));
  let pos = 0;
  chunks.forEach((c, i) => {
    pos += gaps[i];
    const f = Math.min(fade, Math.floor(c.length / 2));
    for (let k = 0; k < c.length; k++) {
      let g = 1;
      if (k < f) g = k / f;
      else if (k >= c.length - f) g = (c.length - 1 - k) / f;
      out[pos + k] = c[k] * g;
    }
    pos += c.length;
  });
  return out;
}
