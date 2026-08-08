/**
 * Fournisseur Anthropic (Claude) — endpoint `/v1/messages`.
 *
 * Particularités vs OpenAI (corrigées par rapport à la spec d'origine) :
 *  - le prompt système est un champ **top-level `system`** (PAS un message de
 *    rôle "system" dans `messages`) ;
 *  - en-têtes `x-api-key` + `anthropic-version` (pas de `Authorization: Bearer`) ;
 *  - la réponse est un tableau de blocs `content[]` (on concatène les blocs texte).
 *
 * Aucun header CORS spécial : l'appel part du backend Rust (reqwest), donc pas de
 * `anthropic-dangerous-direct-browser-access`.
 */

import type { AIProvider, ModelInfo } from "../types";

const VERSION = "2023-06-01";

interface ClaudeContentBlock {
  type?: string;
  text?: string;
}
interface ClaudeResponse {
  content?: ClaudeContentBlock[];
}
interface ClaudeModel {
  id?: string;
  display_name?: string;
  created_at?: string;
}
interface ClaudeModelsResponse {
  data?: ClaudeModel[];
}

export const anthropicProvider: AIProvider = {
  id: "anthropic",
  name: "Anthropic (Claude)",
  needsKey: true,

  chatUrl: () => "https://api.anthropic.com/v1/messages",
  streamChatUrl: () => "https://api.anthropic.com/v1/messages",
  modelsUrl: () => "https://api.anthropic.com/v1/models",
  buildHeaders: (apiKey) => [
    ["Content-Type", "application/json"],
    ["x-api-key", apiKey],
    ["anthropic-version", VERSION],
  ],

  buildBody: (messages, model, maxTokens, stream = false) => {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const convo = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));
    return {
      model,
      max_tokens: maxTokens,
      stream,
      ...(system ? { system } : {}),
      messages: convo,
    };
  },

  parseResponse: (raw) => {
    const r = raw as ClaudeResponse;
    return (r.content ?? [])
      .filter((b) => b.type === "text" || b.text != null)
      .map((b) => b.text ?? "")
      .join("")
      .trim();
  },

  parseStreamChunk: (line) => {
    // SSE Anthropic : lignes `event: ...` (ignorées) + `data: {...}`.
    if (!line.startsWith("data:")) return null;
    try {
      const ev = JSON.parse(line.slice(5).trim()) as {
        type?: string;
        delta?: { text?: string };
      };
      return ev.type === "content_block_delta" ? (ev.delta?.text ?? null) : null;
    } catch {
      return null;
    }
  },

  parseModels: (raw) => {
    const r = raw as ClaudeModelsResponse;
    return (r.data ?? [])
      .map<ModelInfo>((m) => ({
        id: m.id ?? "",
        label: m.display_name || (m.id ?? ""),
        createdAt: m.created_at ? Date.parse(m.created_at) / 1000 : undefined,
      }))
      .filter((m) => m.id.length > 0);
  },

  // Repli best-effort (la liste réelle vient de l'API quand la clé est valide).
  // Génération courante (2026-08) : Opus 5 remplace Opus 4.8 au même tarif.
  // Ordre = du plus capable au plus rapide/économique.
  fallbackModels: [
    { id: "claude-opus-5", label: "Claude Opus 5" },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  ],
  docsUrl: "https://docs.claude.com/en/docs/about-claude/models/overview",
};
