/**
 * Analyse IA d'une comparaison de setups (page Comparaison, quand le Coach IA est
 * configuré). Module pur : construit les messages à partir des différences déjà
 * calculées par l'app (`compare_setups`). L'IA explique ce que changent les
 * écarts sur le comportement et quand préférer A ou B ; elle ne propose aucun
 * chiffre nouveau et ne modifie rien.
 */

import type { AIMessage } from "@/lib/ai/types";
import type { SetupDiffSection } from "@/lib/api";
import { formatTime } from "@/lib/utils";
import { compareByRules, isNeutralRule } from "@/lib/setupCompareRules";
import lab from "@/i18n/lab";

export interface CompareSide {
  name: string;
  car: string;
  carClass: string;
  circuit: string;
  setupType: string;
  /** Meilleur tour de la session liée (s), si une session est liée. */
  bestLap: number | null;
  notes: string | null;
}

/** Au-delà, la liste est tronquée (le reste est résumé par un compte). Un vrai
 *  `.svm` a ~165 réglages : tous les écarts passent. */
export const MAX_DIFF_LINES = 200;

/** « full » : chaque écart expliqué ; « short » : synthèse de 250 mots (ancien mode). */
export type CompareDetail = "full" | "short";

const LANG_NAME: Record<string, string> = { fr: "French", en: "English", es: "Spanish", de: "German", it: "Italian" };

/** Valeur lisible : le texte du garage s'il existe, avec l'index brut entre parenthèses. */
export function shownValue(value: string, comment: string | null): string {
  const c = (comment ?? "").trim();
  const v = value.trim();
  if (!c) return v || "(default)";
  if (!v) return `${c} (default notch)`;
  return c === v ? c : `${c} (index ${v})`;
}

/** Lignes « [SECTION] Clé : A → B » des seuls réglages qui diffèrent. */
export function diffLines(diffs: SetupDiffSection[]): { lines: string[]; total: number } {
  const lines: string[] = [];
  let total = 0;
  for (const s of diffs)
    for (const p of s.params) {
      if (!p.is_diff) continue;
      // Même index des deux côtés : seul le texte change (langue du jeu à la sauvegarde,
      // « Détaché » / « Detached ») — ce n'est pas un écart de réglage.
      if (p.value_a.trim() !== "" && p.value_a.trim() === p.value_b.trim()) continue;
      total++;
      if (lines.length < MAX_DIFF_LINES) lines.push(`[${s.name}] ${p.key}: A = ${shownValue(p.value_a, p.comment_a)} → B = ${shownValue(p.value_b, p.comment_b)}`);
    }
  return { lines, total };
}

/**
 * Lecture de l'app par règles de dynamique (anglais) : sens et effet de chaque
 * écart mesurable, puis tendances nettes. Donnée à l'IA comme référence, pour
 * qu'elle ne contredise pas le sens d'un réglage (ex. répartition vers l'arrière).
 */
export function ruleFactsText(diffs: SetupDiffSection[]): string {
  const r = compareByRules(diffs);
  const en = lab.en as unknown as {
    cmp: { name: Record<string, string>; fx: Record<string, Record<string, string>>; axis: Record<string, Record<string, string>> };
    profiles: { why: Record<string, Record<string, string>> };
  };
  const lines = r.changes
    .filter((c) => c.dir !== 0 && !isNeutralRule(c.id))
    .map((c) => {
      const way = c.dir > 0 ? "up" : "down";
      const fx = en.profiles.why[c.id]?.[way] ?? en.cmp.fx[c.id]?.[way] ?? "";
      return `- ${en.cmp.name[c.id] ?? c.id}: ${c.a} → ${c.b}. ${fx}`;
    });
  const trends = r.trends.map((tr) => `- B ${en.cmp.axis[tr.axis]?.[tr.score > 0 ? "pos" : "neg"] ?? tr.axis} (score ${tr.score > 0 ? "+" : ""}${tr.score})`);
  if (!lines.length && !trends.length) return "";
  return [
    "App rule-based reading (vehicle dynamics; AUTHORITATIVE for the direction of each change, B compared with A):",
    ...lines,
    trends.length ? "Net tendencies of B compared with A:" : "",
    ...trends,
  ]
    .filter(Boolean)
    .join("\n");
}

function side(label: string, x: CompareSide): string {
  return [
    `Setup ${label}: "${x.name.replace(/\.svm$/i, "")}" — car ${x.car} (${x.carClass}), track folder ${x.circuit}, type ${x.setupType || "?"}`,
    x.bestLap != null && x.bestLap > 0 ? `  best lap of the linked session: ${formatTime(x.bestLap)}` : "  no linked session (no lap time known)",
    x.notes ? `  driver notes: ${x.notes.slice(0, 300)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCompareMessages(args: { a: CompareSide; b: CompareSide; diffs: SetupDiffSection[]; lang: string; style?: string; detail?: CompareDetail }): AIMessage[] {
  const { a, b, diffs, lang, style, detail = "full" } = args;
  const lng = LANG_NAME[lang.slice(0, 2)] ?? "English";
  const { lines, total } = diffLines(diffs);
  const system =
    "You are a race engineer for Le Mans Ultimate. The driver compares two car setups (A and B). " +
    "Explain what the differences do to the car's behaviour, grouped by theme (aero, mechanical balance, " +
    "brakes, differential, electronics, tyres, ride height, gearing, fuel/energy), per corner phase when relevant " +
    "(braking, entry, mid-corner, exit, straights). Then say when to prefer A and when to prefer B. " +
    "Use ONLY the values given: never invent numbers, never claim a lap time that is not given. In LMU files the " +
    "index increases with stiffness, wing angle, locking, ride height and aid level, and RearBrakeSetting increases toward the REAR. " +
    "If the two setups are for different tracks or cars, say first that the comparison is limited. " +
    "When an 'App rule-based reading' is given, follow it for the direction and effect of each change and never contradict it; " +
    "your job is to group, explain and conclude. " +
    (detail === "full"
      ? "Cover EVERY setting listed as different, each at least once (one short bullet: the change, its effect, the corner phase), " +
        "grouped by theme; group very similar changes (e.g. the four dampers of one axle) in one bullet. " +
        "Format: Markdown — a two-sentence summary, then '## ' headings per theme (in the target language) with bullet points, " +
        "then a '## ' heading on when to prefer A and when to prefer B. At most 700 words. "
      : "Format: short Markdown — a one-sentence summary, then a few '## ' headings (in the target language) with " +
        "bullet points, at most 250 words. ") +
    "No setup advice beyond these two files. Follow-up questions from the driver are about these two setups: answer them briefly, same rules. " +
    `Write in ${lng}.`;
  const user = [
    side("A", a),
    side("B", b),
    style ? `Driver preference: ${style}` : "",
    ruleFactsText(diffs),
    total === 0
      ? "The two setups are identical (no setting differs)."
      : `Settings that differ (${total}${total > lines.length ? `, first ${lines.length} shown` : ""}):\n${lines.join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
