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
  done?: boolean;
  done_reason?: string;
  error?: string;
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

  // Marge « thinking » comme chez Google/OpenAI-compat : vérifié en local,
  // gemma4:12b dépense un budget court en champ `thinking` et renvoie un
  // `content` vide (done_reason: length). Plafond, pas cible.
  buildBody: (messages, model, maxTokens, stream = false) => ({
    model,
    messages, // Ollama accepte le rôle "system" tel quel.
    stream,
    options: { num_predict: maxTokens + 1024 },
  }),

  parseResponse: (raw) => {
    const r = raw as OllamaChatResponse;
    return (r.message?.content ?? "").trim();
  },

  parseStreamChunk: (line) => {
    // NDJSON : chaque ligne est un objet complet { message: { content }, done }.
    try {
      const c = JSON.parse(line) as OllamaChatResponse;
      if (c.error) return { kind: "error", message: c.error };
      const text = c.message?.content;
      if (text) return { kind: "text", text };
      // `done_reason: "length"` = budget de sortie épuisé, réponse tronquée.
      if (c.done && c.done_reason && c.done_reason !== "stop") {
        return { kind: "stop", reason: c.done_reason };
      }
      return null;
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
  docsUrl: "https://ollama.com/library",
};
