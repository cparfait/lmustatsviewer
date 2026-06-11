/**
 * Estimation best-effort du coût d'un appel IA (USD).
 *
 * ⚠️ Les endpoints `/models` ne renvoient PAS les prix → table à maintenir à la
 * main, par préfixe d'id de modèle. Tarif inconnu → `null` (l'UI n'affiche rien).
 * Le streaming ne fournit pas toujours le décompte exact de tokens : on estime
 * depuis la longueur du texte (≈ chars / 4 en anglais, / 3.5 sinon).
 */

export interface TokenCost {
  /** USD par 1M tokens en entrée. */
  input: number;
  /** USD par 1M tokens en sortie. */
  output: number;
}

// Prix indicatifs $/1M tokens (à actualiser). Ordre : le plus spécifique d'abord.
const COSTS: { match: RegExp; cost: TokenCost }[] = [
  // OpenAI
  { match: /^gpt-4\.1-nano/i, cost: { input: 0.1, output: 0.4 } },
  { match: /^gpt-4\.1-mini/i, cost: { input: 0.4, output: 1.6 } },
  { match: /^gpt-4\.1/i, cost: { input: 2.0, output: 8.0 } },
  { match: /^o4-mini/i, cost: { input: 1.1, output: 4.4 } },
  { match: /^o3/i, cost: { input: 2.0, output: 8.0 } },
  { match: /^gpt-4o-mini/i, cost: { input: 0.15, output: 0.6 } },
  { match: /^gpt-4o/i, cost: { input: 2.5, output: 10.0 } },
  // Anthropic
  { match: /haiku/i, cost: { input: 0.8, output: 4.0 } },
  { match: /sonnet/i, cost: { input: 3.0, output: 15.0 } },
  { match: /opus/i, cost: { input: 15.0, output: 75.0 } },
  // Google
  { match: /flash/i, cost: { input: 0.15, output: 0.6 } },
  { match: /gemini.*pro/i, cost: { input: 1.25, output: 10.0 } },
  // DeepSeek
  { match: /^deepseek-chat/i, cost: { input: 0.27, output: 1.1 } },
  { match: /^deepseek-reasoner/i, cost: { input: 0.55, output: 2.19 } },
  // Mistral
  { match: /mistral-large/i, cost: { input: 2.0, output: 6.0 } },
  { match: /mistral-medium/i, cost: { input: 0.7, output: 2.1 } },
  { match: /codestral/i, cost: { input: 0.3, output: 0.9 } },
];

export function estimateTokens(text: string, lang: string): number {
  const perTok = lang.slice(0, 2).toLowerCase() === "en" ? 4 : 3.5;
  return Math.ceil(text.length / perTok);
}

/** Coût estimé en USD. `0` pour Ollama (local), `null` si tarif inconnu. */
export function estimateCost(
  providerId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  if (providerId === "ollama") return 0;
  const entry = COSTS.find((c) => c.match.test(model));
  if (!entry) return null;
  return (inputTokens * entry.cost.input + outputTokens * entry.cost.output) / 1_000_000;
}

export function formatCost(usd: number): string {
  if (usd <= 0) return "$0";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
}
