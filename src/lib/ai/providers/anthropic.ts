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

/** Marge de tokens pour la réflexion du modèle (cf. `buildBody`). */
const THINKING_HEADROOM = 1024;

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
      // Un tour assistant VIDE fait échouer l'API en 400 (« text content blocks
      // must be non-empty »). Cela arrivait dès qu'une réponse revenait vide :
      // le tour vide était conservé dans le fil, et TOUTES les questions
      // suivantes échouaient avec un message brut incompréhensible.
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }));
    return {
      model,
      // Même marge « thinking » que Google / OpenAI-compat / Ollama : sur les
      // modèles à réflexion adaptative, les tokens de raisonnement sont
      // décomptés de `max_tokens`. Avec nos petits budgets (160 pour le vocal,
      // 400 pour l'analyse rapide), la réflexion consommait tout et la réponse
      // revenait VIDE. Plafond, pas cible : la longueur reste dictée par le prompt.
      max_tokens: maxTokens + THINKING_HEADROOM,
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
        delta?: { text?: string; stop_reason?: string };
        error?: { type?: string; message?: string };
      };
      if (ev.type === "content_block_delta") {
        const text = ev.delta?.text;
        return text ? { kind: "text", text } : null;
      }
      // Erreur émise EN COURS de flux (surcharge, quota) : le corps HTTP est
      // un 200, donc rien d'autre ne la signalerait.
      if (ev.type === "error" && ev.error) {
        return {
          kind: "error",
          message: ev.error.message ?? ev.error.type ?? "erreur du fournisseur",
        };
      }
      // Fin anticipée : budget de sortie épuisé (souvent la réflexion du modèle).
      if (ev.type === "message_delta" && ev.delta?.stop_reason === "max_tokens") {
        return { kind: "stop", reason: "max_tokens" };
      }
      return null;
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
