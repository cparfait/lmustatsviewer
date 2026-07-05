/**
 * Génération de la banque de phrases coach (COACH-LIVE-SPEC.md §10, P4.3).
 *
 * **Un seul appel batch** par combo × langue (hors chemin critique — déclenché
 * manuellement en Config, ou paresseusement au 1ᵉʳ combo). Le LLM produit, à partir
 * des virages **macro** ApexPoints (nom + tip) et du catalogue de situations
 * (`DIAG_SITUATIONS`), 2-3 variantes de formulation courtes par (virage, diagnostic)
 * — avec des **slots** littéraux (`{{d}}`, `{{n}}`) que le code remplira en live
 * (jamais le modèle, §10). Aucune donnée chiffrée réelle n'est envoyée : le modèle
 * ne fait que *tourner la phrase*.
 *
 * Le résultat est un JSON **tableau** de `PhraseEntry` (tolérant à la troncature) →
 * stocké tel quel en SQLite (`coach_phrasebank`).
 */

import { chat } from "./coach";
import type { AIProvider } from "./types";
import { DIAG_SITUATIONS, parsePhraseEntries, type PhraseEntry } from "@/lib/coach/phrasebank";
import type { MacroCorner } from "@/lib/coach";

/** Nb max de virages macro décrits au modèle (borne les tokens de sortie). */
const MAX_CORNERS = 12;
/** Budget de sortie généreux : la banque est volumineuse mais générée **une fois**. */
const GEN_MAX_TOKENS = 3000;

/** Identifiant compact et stable d'une situation pour le prompt (`code:sign`). */
const sitId = (code: string, sign: number) => `${code}:${sign}`;

const LANG_NAME: Record<string, string> = {
  fr: "French",
  en: "English",
  es: "Spanish",
  de: "German",
};

/** Consigne système : générateur de phrases radio, sortie JSON stricte. */
function genSystem(): string {
  return (
    "You are a data generator for a sim-racing driving coach. You output ONLY a JSON " +
    "array, no prose, no markdown fences. Each phrase is a short race-engineer radio " +
    "callout. You NEVER invent numbers: numeric values are literal placeholders filled " +
    "later by code."
  );
}

/**
 * Construit le prompt utilisateur : langue cible, règles de format, catalogue de
 * situations et virages macro. Demande un tableau JSON de `PhraseEntry`.
 */
export function buildPhrasebankPrompt(lang: string, corners: MacroCorner[]): string {
  const lg = lang.slice(0, 2).toLowerCase();
  const langName = LANG_NAME[lg] ?? "English";
  const picked = corners.slice(0, MAX_CORNERS);

  const situations = DIAG_SITUATIONS.map((s) => {
    const slot = s.slot ? ` Include the placeholder {{${s.slot}}} (value in ${s.unit}).` : "";
    return `- "${sitId(s.code, s.sign)}": the driver ${s.meaning}.${slot}`;
  }).join("\n");

  const cornerLines = picked
    .map((c) => {
      const tip = (c.tipFr && lg === "fr" ? c.tipFr : c.tip) || "";
      return `- n=${c.parsed.start} "${c.name}"${tip ? ` — ${tip}` : ""}`;
    })
    .join("\n");

  return [
    `Language: write ALL phrases in ${langName}.`,
    "",
    "Format rules for every phrase:",
    "- Max 8 words, one idea, race-engineer radio tone.",
    "- Use the placeholder {{n}} for the corner number when helpful.",
    "- Use {{d}} EXACTLY where a number belongs; never write a real number.",
    "- Imperative, encouraging, concrete.",
    "",
    "Situations (id: meaning):",
    situations,
    "",
    `Corners on this track (${picked.length}):`,
    cornerLines || "- (none: only generic phrases)",
    "",
    "Output a JSON array. Each element is:",
    '{"code": <code>, "sign": <sign>, "n": <turn number or null>, "texts": ["...", "..."]}',
    "where <code>/<sign> come from a situation id (e.g. \"brake-timing:1\" → code=\"brake-timing\", sign=1).",
    "Produce, in this order:",
    "1) For EACH situation id, one element with n=null (generic, 2 variants).",
    "2) For EACH corner above, for EACH situation id, one element with n=<that corner> (2 variants, may bake the corner name in).",
    "Return ONLY the JSON array.",
  ].join("\n");
}

/**
 * Récupère un tableau JSON éventuellement enrobé (fences) ou **tronqué** (budget de
 * sortie atteint). En cas de troncature, referme le tableau au dernier objet complet.
 */
export function extractJsonArray(text: string): string {
  let s = text.trim();
  // Retire d'éventuelles clôtures markdown ```json … ```.
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = s.indexOf("[");
  if (start < 0) return "[]";
  s = s.slice(start);
  const end = s.lastIndexOf("]");
  if (end > 0) return s.slice(0, end + 1);
  // Tableau non refermé (tronqué) : referme après le dernier objet complet `}`.
  const lastObj = s.lastIndexOf("}");
  return lastObj > 0 ? `${s.slice(0, lastObj + 1)}]` : "[]";
}

/** Ne garde que les entrées dont le (code, sign) correspond à une situation connue. */
function keepKnown(entries: PhraseEntry[]): PhraseEntry[] {
  const known = new Set(DIAG_SITUATIONS.map((s) => sitId(s.code, s.sign)));
  return entries.filter((e) => known.has(sitId(e.code, e.sign)));
}

/**
 * Génère la banque de phrases d'un combo × langue (§10). Un appel LLM batch, non
 * streamé. Renvoie les entrées valides (filtrées sur le catalogue). Lève si l'appel
 * échoue (l'UI affiche `friendlyError`).
 */
export async function generatePhrasebank(args: {
  provider: AIProvider;
  model: string;
  apiKey: string;
  lang: string;
  corners: MacroCorner[];
}): Promise<PhraseEntry[]> {
  const { provider, model, apiKey, lang, corners } = args;
  const raw = await chat(
    provider,
    model,
    apiKey,
    [
      { role: "system", content: genSystem() },
      { role: "user", content: buildPhrasebankPrompt(lang, corners) },
    ],
    GEN_MAX_TOKENS,
  );
  return keepKnown(parsePhraseEntries(extractJsonArray(raw)));
}
