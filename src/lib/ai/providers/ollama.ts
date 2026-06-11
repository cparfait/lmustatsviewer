/**
 * Fournisseur Ollama (local, hors-ligne) — `http://localhost:11434`.
 *
 * Aucune clé. La liste des modèles (`/api/tags`) = les modèles réellement
 * téléchargés par l'utilisateur (`ollama pull …`) → pas de repli statique
 * pertinent. En Phase 1 on appelle `/api/chat` avec `stream:false` : la réponse
 * est un JSON unique (le NDJSON du streaming sera géré en Phase 3).
 */

import type { AIProvider, ModelInfo } from "../types";

const BASE = "http://localhost:11434";

interface OllamaChatResponse {
  message?: { content?: string };
}
interface OllamaTag {
  name?: string;
  model?: string;
}
interface OllamaTagsResponse {
  models?: OllamaTag[];
}

export const ollamaProvider: AIProvider = {
  id: "ollama",
  name: "Ollama (local)",
  needsKey: false,

  chatUrl: () => `${BASE}/api/chat`,
  streamChatUrl: () => `${BASE}/api/chat`,
  modelsUrl: () => `${BASE}/api/tags`,
  buildHeaders: () => [["Content-Type", "application/json"]],

  buildBody: (messages, model, maxTokens, stream = false) => ({
    model,
    messages, // Ollama accepte le rôle "system" tel quel.
    stream,
    options: { num_predict: maxTokens },
  }),

  parseResponse: (raw) => {
    const r = raw as OllamaChatResponse;
    return (r.message?.content ?? "").trim();
  },

  parseStreamChunk: (line) => {
    // NDJSON : chaque ligne est un objet complet { message: { content }, done }.
    try {
      const c = JSON.parse(line) as OllamaChatResponse;
      return c.message?.content ?? null;
    } catch {
      return null;
    }
  },

  parseModels: (raw) => {
    const r = raw as OllamaTagsResponse;
    return (r.models ?? [])
      .map<ModelInfo>((m) => ({
        id: m.name ?? m.model ?? "",
        label: m.name ?? m.model ?? "",
      }))
      .filter((m) => m.id.length > 0);
  },

  // Dépend de ce que l'utilisateur a installé localement → pas de repli figé.
  fallbackModels: [],
};
