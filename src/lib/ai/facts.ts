/**
 * Dossier de faits préparé **sans IA** pour une question vocale ouverte.
 *
 * Le routeur local a souvent une idée des sujets de la question (intentions
 * candidates sous le seuil, ou ambiguës). On calcule ici leurs réponses avec le
 * code de l'ingénieur — chiffres exacts — et on les donne au Coach IA comme
 * seule source des nombres : l'IA formule, elle n'invente pas. Les faits
 * indisponibles sont listés comme tels pour qu'elle le dise.
 */

import type { LiveData } from "@/lib/api";
import type { Tr } from "@/i18n";
import { answerIntent, type AnswerOpts } from "@/lib/engineer/answers";
import { RADIO_COMMANDS, type AnswerIntent } from "@/lib/engineer/router";

/** Intentions qui agissent (commandes) au lieu de répondre : jamais exécutées ici. */
const ACTIONS = new Set<AnswerIntent>(["ackBox", "stayOut", "watchCancel", "watch", "repeat", "mute"]);

export const MAX_FACTS = 3;

export function isFactIntent(i: AnswerIntent): boolean {
  return !ACTIONS.has(i) && !RADIO_COMMANDS.has(i);
}

export function factsBlock(candidates: AnswerIntent[], data: LiveData | null, t: Tr, opts: AnswerOpts): string {
  const picked = ["status" as AnswerIntent, ...candidates.filter((i) => i !== "status" && isFactIntent(i))].slice(0, MAX_FACTS + 1);
  const unknown = new Set([t("live.spNoData"), t("live.spNoSession")]);
  const lines: string[] = [];
  for (const i of picked) {
    const a = answerIntent(i, data, t, opts).trim();
    lines.push(`- ${i}: ${!a || unknown.has(a) ? "UNKNOWN (not available)" : a}`);
  }
  return [
    "## Facts computed by the app (authoritative)",
    "These answers were computed by the app from live data. They take precedence over any other figure: rephrase them naturally, never recompute or contradict them. Any other figure must come from the live data as written. If the question needs a fact marked UNKNOWN, or a figure found neither here nor in the live data, say you don't have it.",
    ...lines,
  ].join("\n");
}
