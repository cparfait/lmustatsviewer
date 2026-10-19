/**
 * Contrôle de la réponse du coach **vocal** avant qu'elle parte à la radio (module pur).
 *
 * Le prompt dit déjà « chiffres seulement issus des données », « aucune promesse » ;
 * ce contrôle vérifie après coup ce que l'IA a réellement écrit, contre ce qu'elle a
 * réellement **reçu** (contexte + question). Motifs :
 *  - `number`  : un chiffre absent des sources (ni égal ni arrondi d'un chiffre reçu) ;
 *  - `promise` : une surveillance, une annonce, un réglage ou une mémoire promis — l'IA
 *    ne commande rien (alertes et réglages passent par les commandes locales) ;
 *  - `done`    : un réglage dit fait (« c'est fait » sur un objet de setup) ;
 *  - `language`: la réponse n'est pas dans la langue du pilote ;
 *  - `emptyAck`: un accusé nu (« Reçu. ») servi à une question, une demande ou un problème.
 *
 * `repairVoiceAnswer` garde les phrases saines quand une seule est fautive ; sinon
 * l'appelant dit un repli honnête (variantes i18n). Rien n'est jamais inventé ici.
 */

export type GuardReason = "number" | "promise" | "done" | "language" | "emptyAck";

export interface GuardVerdict {
  reason: GuardReason;
  /** Extrait fautif (chiffre, phrase). */
  detail: string;
  /** Accusé à vide sur un symptôme sans endroit : demander où dans le virage. */
  askWhere?: boolean;
}

/** Minuscules sans accents (comparaisons de mots). */
function plain(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'");
}

/** Phrases d'un texte (ponctuation finale gardée). */
export function sentences(text: string): string[] {
  return (text.match(/[^.!?…]+[.!?…]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

// ── Chiffres ────────────────────────────────────────────────────────────────

/** Nombres d'un texte en valeurs (un temps m:ss.xxx devient des secondes). */
export function numbersIn(text: string): { raw: string; value: number; decimals: number }[] {
  const out: { raw: string; value: number; decimals: number }[] = [];
  const re = /(\d+):(\d{2}(?:[.,]\d+)?)|\d+(?:[.,]\d+)?/g;
  for (const m of text.matchAll(re)) {
    if (m[1] != null) {
      const sec = m[2].replace(",", ".");
      out.push({ raw: m[0], value: Number(m[1]) * 60 + Number(sec), decimals: (sec.split(".")[1] ?? "").length });
    } else {
      const s = m[0].replace(",", ".");
      out.push({ raw: m[0], value: Number(s), decimals: (s.split(".")[1] ?? "").length });
    }
  }
  return out.filter((n) => isFinite(n.value));
}

/**
 * Le nombre de la réponse vient-il des sources ? Égal, ou arrondi à sa propre précision
 * (« 1,2 s » pour 1.234 ; « 85 % » pour 84.6), ou même chiffre au signe près. Les petits
 * entiers (0 à 3 : « deux crans », « 3 tours propres ») ne prouvent rien et passent.
 */
export function numberSupported(n: { value: number; decimals: number }, sources: number[]): boolean {
  if (n.decimals === 0 && n.value >= 0 && n.value <= 3) return true;
  const tol = 0.5 * Math.pow(10, -n.decimals) + 1e-9;
  return sources.some((s) => Math.abs(Math.abs(s) - n.value) <= tol);
}

// ── Promesses et actions ────────────────────────────────────────────────────

/** Objets de setup / stand (5 langues, sans accents). */
const OBJ =
  "(setup|reglage\\w*|aileron|aile|barre|antiroulis|ressort\\w*|amorti\\w*|carrossage|pincement|pression\\w*|pneus?|gommes?|carburant|essence|plein|tc|abs|antipatinage|repartit\\w*|frein\\w*|carto\\w*|map|ratio|wing|bar|spring\\w*|damper\\w*|camber|toe|tyres?|tires?|fuel|brake\\w*|reglaje\\w*|aleron|muelle\\w*|neumatic\\w*|combustible|gasolina|freno\\w*|flugel|feder\\w*|dampfer|sturz|reifen|kraftstoff|sprit|bremse\\w*|alettone|molle|ammortizzator\\w*|gomme|benzina|carburante|fren\\w*)";

const PROMISE: RegExp[] = [
  // FR
  new RegExp(
    "\\b(je|on) (te |t')?(previens|previendrai|previendra|signale|signalerai|signalera|surveille|surveillerai|surveillera|guette|guetterai|tiens au courant|tiendrai au courant|dirai quand|dis quand|annoncerai)\\b",
  ),
  new RegExp(`\\b(je|on) (vais|va) (te |t'|le |la |les |l')*(regler|changer|modifier|charger|enregistrer|baisser|monter|mettre|ajuster|preparer|activer|desactiver)\\b.{0,40}\\b${OBJ}\\b`),
  /\b(note|c'est note) pour (les |la )?prochaine?s? (fois|sessions?|courses?)\b|\bje m'en souviendrai\b|\bje (le |la |les )?garde en (tete|memoire)\b/,
  // EN
  /\b(i'?ll|i will|we'?ll|we will|i'?m going to) (let you know|warn you|tell you when|keep an eye|watch|monitor|keep you posted|call it out|remember)\b/,
  new RegExp(`\\b(i'?ll|i will|we'?ll|we will|i'?m going to) (adjust|change|set|load|save|lower|raise|tweak|fit)\\b.{0,40}\\b${OBJ}\\b`),
  // ES
  /\b(te avisare|te avisaremos|te aviso cuando|vigilare|te dire cuando|lo recordare|te mantendre informado)\b/,
  new RegExp(`\\b(voy a|vamos a) (ajustar|cambiar|cargar|guardar|bajar|subir|poner)\\b.{0,40}\\b${OBJ}\\b`),
  // DE
  /\b(ich (sage|melde) (dir|mich) (bescheid|wenn)|ich (behalte|werde) .{0,20}(im auge|uberwachen|merken|bescheid sagen))\b/,
  new RegExp(`\\bich (stelle|andere|lade|speichere|senke|erhohe|werde)\\b.{0,40}\\b${OBJ}\\b`),
  // IT
  /\b(ti avviso|ti avvisero|ti dico quando|ti diro quando|tengo d'occhio|terro d'occhio|me lo ricordero|ti terro aggiornato)\b/,
  new RegExp(`\\b(regolo|cambio|carico|salvo|abbasso|alzo|vado a (regolare|cambiare|caricare|salvare))\\b.{0,40}\\b${OBJ}\\b`),
];

const DONE = new RegExp(`\\b(c'est fait|c'est regle|done|sorted|hecho|listo|erledigt|fatto)\\b`);
const DONE_OBJ = new RegExp(`\\b${OBJ}\\b`);

/** La phrase promet-elle une action ou une surveillance que l'IA ne peut pas faire ? */
export function promiseIn(sentence: string): boolean {
  const s = plain(sentence);
  if (/\?\s*$/.test(sentence.trim())) return false; // une question au pilote n'engage rien
  return PROMISE.some((re) => re.test(s));
}

/** La phrase dit-elle un réglage fait (« c'est fait » sur un objet de setup) ? */
export function doneIn(sentence: string): boolean {
  const s = plain(sentence);
  if (/\?\s*$/.test(sentence.trim()) || /\b(quand|une fois|si|dis-moi|when|once|if|cuando|wenn|quando)\b/.test(s)) return false;
  return DONE.test(s) && DONE_OBJ.test(s);
}

// ── Langue ──────────────────────────────────────────────────────────────────

const STOP: Record<string, string[]> = {
  fr: ["le", "la", "les", "tu", "de", "des", "et", "est", "pas", "on", "je", "un", "une", "ce", "que", "pour", "sur", "avec", "tes", "ton", "ta", "au", "du"],
  en: ["the", "you", "your", "is", "are", "and", "to", "it", "of", "we", "on", "for", "this", "that", "with", "keep", "be", "in", "at"],
  es: ["el", "los", "las", "tu", "que", "de", "y", "es", "no", "con", "para", "por", "una", "un", "del", "al", "se", "tus", "estas"],
  de: ["der", "die", "das", "du", "und", "ist", "nicht", "mit", "auf", "fur", "ein", "eine", "dein", "deine", "wir", "zu", "im", "den"],
  it: ["il", "lo", "la", "gli", "le", "tu", "che", "di", "e", "non", "con", "per", "una", "un", "del", "al", "sei", "tuo", "tua"],
};

/** Langue la plus probable d'un texte (null si trop court pour juger). */
export function guessLang(text: string): string | null {
  const words = plain(text).split(/[^a-z']+/).filter(Boolean);
  if (words.length < 6) return null;
  let best: string | null = null;
  let bestN = 0;
  const scores: Record<string, number> = {};
  for (const [lg, list] of Object.entries(STOP)) {
    const set = new Set(list);
    const n = words.filter((w) => set.has(w)).length;
    scores[lg] = n;
    if (n > bestN) {
      best = lg;
      bestN = n;
    }
  }
  return bestN >= 3 ? best : null;
}

/** Réponse écrite dans une autre langue que celle du pilote ? */
export function wrongLanguage(answer: string, lang: string): boolean {
  const want = lang.slice(0, 2).toLowerCase();
  const got = guessLang(answer);
  if (!got || got === want) return false;
  const words = plain(answer).split(/[^a-z']+/).filter(Boolean);
  const own = words.filter((w) => new Set(STOP[want] ?? []).has(w)).length;
  const other = words.filter((w) => new Set(STOP[got]).has(w)).length;
  return other >= 3 && other >= 2 * Math.max(1, own);
}

// ── Accusé à vide ───────────────────────────────────────────────────────────

const ACK =
  /^(bien )?(recu|compris|note|entendu|d'accord|ok|okay|copy|copie|roger|noted|got it|understood|entendido|recibido|vale|verstanden|alles klar|ricevuto|capito|d'accordo)\b[\s,.!-]*(\p{L}+)?[\s.!]*$/u;
const QUESTION_START =
  /^(comment|pourquoi|combien|quel|quelle|quels|quelles|est-ce|qu'est-ce|tu peux|tu penses|tu trouves|how|why|what|which|when|where|can you|should|do you|como|por que|cuanto|cual|wie|warum|was|welche|kannst|come|perche|quanto|quale|puoi)\b/;
const DEMAND = /^(dis-moi|donne|explique|aide|coache|rappelle|tell me|give me|explain|help|dime|explica|sag mir|erklar|dimmi|spiegami)\b/;
const PROBLEM =
  /\b(sous-?vir\w*|survir\w*|glisse|chasse|bloque\w*|patine\w*|instable|tourne pas|ne freine|n'avance|panne|casse|understeer\w*|oversteer\w*|sliding|lock\w* up|unstable|wheelspin|won'?t turn|subvira\w*|sobrevira\w*|untersteu\w*|ubersteu\w*|sottoster\w*|sovraster\w*)\b/;
const WHERE = /\b(entree|milieu|sortie|apex|corde|freinage|entry|mid|exit|braking|entrada|salida|eingang|ausgang|ingresso|uscita)\b/;

/** L'accusé nu répond-il à vide (question, demande ou problème) ? */
export function emptyAck(answer: string, question: string): { empty: boolean; askWhere: boolean } {
  const a = plain(answer).trim();
  if (!ACK.test(a)) return { empty: false, askWhere: false };
  const q = plain(question).trim();
  const problem = PROBLEM.test(q);
  const empty = question.includes("?") || QUESTION_START.test(q) || DEMAND.test(q) || problem;
  return { empty, askWhere: empty && problem && !WHERE.test(q) };
}

// ── Verdict ─────────────────────────────────────────────────────────────────

export interface GuardInput {
  answer: string;
  /** Tout ce que l'IA a reçu : contexte joint + question. */
  sources: string;
  question: string;
  lang: string;
}

/** Fautes de la réponse, phrase par phrase (vide = rien à redire). */
export function sentenceFaults(sentence: string, srcNums: number[]): GuardVerdict | null {
  for (const n of numbersIn(sentence)) {
    if (!numberSupported(n, srcNums)) return { reason: "number", detail: n.raw };
  }
  if (promiseIn(sentence)) return { reason: "promise", detail: sentence };
  if (doneIn(sentence)) return { reason: "done", detail: sentence };
  return null;
}

/** Première faute de la réponse entière, ou null. */
export function checkVoiceAnswer(i: GuardInput): GuardVerdict | null {
  const ack = emptyAck(i.answer, i.question);
  if (ack.empty) return { reason: "emptyAck", detail: i.answer, askWhere: ack.askWhere };
  if (wrongLanguage(i.answer, i.lang)) return { reason: "language", detail: i.answer };
  const srcNums = numbersIn(`${i.sources}\n${i.question}`).map((n) => n.value);
  for (const s of sentences(i.answer)) {
    const f = sentenceFaults(s, srcNums);
    if (f) return f;
  }
  return null;
}

/**
 * Réponse réparée : les phrases sans faute, si au moins une reste (et que la faute
 * n'est ni la langue ni un accusé à vide). `null` = rien de sain, l'appelant dit le repli.
 */
export function repairVoiceAnswer(i: GuardInput): string | null {
  const v = checkVoiceAnswer(i);
  if (!v) return i.answer;
  if (v.reason === "language" || v.reason === "emptyAck") return null;
  const srcNums = numbersIn(`${i.sources}\n${i.question}`).map((n) => n.value);
  const kept = sentences(i.answer).filter((s) => !sentenceFaults(s, srcNums));
  const text = kept.join(" ").trim();
  return text && plain(text).replace(/[^a-z]/g, "").length >= 8 ? text : null;
}
