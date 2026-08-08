/**
 * Fabrique de fournisseurs compatibles OpenAI (`/chat/completions`).
 *
 * OpenAI, DeepSeek et Mistral partagent le même format de requête/réponse et
 * le même endpoint de liste (`/models`) → un seul code paramétré par l'URL de
 * base, le nom et la liste de repli.
 */

import type { AIProvider, ModelInfo } from "../types";

interface OAChatResponse {
  choices?: { message?: { content?: string } }[];
}
interface OAStreamChunk {
  choices?: { delta?: { content?: string } }[];
}
interface OAModel {
  id?: string;
  created?: number;
}
interface OAModelsResponse {
  data?: OAModel[];
}

/** Exclut les modèles non conversationnels (embeddings, audio, image…). */
const NON_CHAT = /embedding|whisper|tts|dall|moderation|audio|realtime|image|vision-?embed|rerank/i;

interface OpenAICompatConfig {
  id: string;
  name: string;
  chatEndpoint: string;
  modelsEndpoint: string;
  fallbackModels: ModelInfo[];
  /** Lien vers la doc des modèles du fournisseur. */
  docsUrl: string;
  /** Filtre optionnel des id de modèles (en plus de l'exclusion non-chat). */
  modelFilter?: (id: string) => boolean;
}

export function makeOpenAICompatProvider(cfg: OpenAICompatConfig): AIProvider {
  return {
    id: cfg.id,
    name: cfg.name,
    needsKey: true,

    chatUrl: () => cfg.chatEndpoint,
    streamChatUrl: () => cfg.chatEndpoint,
    modelsUrl: () => cfg.modelsEndpoint,
    buildHeaders: (apiKey) => [
      ["Content-Type", "application/json"],
      ["Authorization", `Bearer ${apiKey}`],
    ],

    buildBody: (messages, model, maxTokens, stream = false) => ({
      model,
      messages, // rôles system/user/assistant acceptés tels quels
      max_tokens: maxTokens,
      stream,
    }),

    parseResponse: (raw) => {
      const r = raw as OAChatResponse;
      return (r.choices?.[0]?.message?.content ?? "").trim();
    },

    parseStreamChunk: (line) => {
      if (!line.startsWith("data:")) return null;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return null;
      try {
        const c = JSON.parse(payload) as OAStreamChunk;
        return c.choices?.[0]?.delta?.content ?? null;
      } catch {
        return null;
      }
    },

    parseModels: (raw) => {
      const r = raw as OAModelsResponse;
      return (r.data ?? [])
        .map((m) => m.id ?? "")
        .filter((id) => id.length > 0 && !NON_CHAT.test(id))
        .filter((id) => (cfg.modelFilter ? cfg.modelFilter(id) : true))
        .map<ModelInfo>((id) => {
          const created = (r.data ?? []).find((m) => m.id === id)?.created;
          return { id, label: id, createdAt: created };
        });
    },

    fallbackModels: cfg.fallbackModels,
    docsUrl: cfg.docsUrl,
  } satisfies AIProvider;
}

export const openaiProvider = makeOpenAICompatProvider({
  id: "openai",
  name: "OpenAI (GPT)",
  chatEndpoint: "https://api.openai.com/v1/chat/completions",
  modelsEndpoint: "https://api.openai.com/v1/models",
  // Garde uniquement les familles conversationnelles connues (la liste réelle
  // vient de l'API ; ceci n'est que le repli hors-ligne).
  modelFilter: (id) => /^(gpt-|o\d|chatgpt)/i.test(id),
  fallbackModels: [
    { id: "gpt-4.1-mini", label: "gpt-4.1-mini" },
    { id: "gpt-4.1", label: "gpt-4.1" },
    { id: "o4-mini", label: "o4-mini" },
  ],
  docsUrl: "https://platform.openai.com/docs/models",
});

export const deepseekProvider = makeOpenAICompatProvider({
  id: "deepseek",
  name: "DeepSeek",
  chatEndpoint: "https://api.deepseek.com/chat/completions",
  modelsEndpoint: "https://api.deepseek.com/models",
  fallbackModels: [
    { id: "deepseek-chat", label: "deepseek-chat (V3)" },
    { id: "deepseek-reasoner", label: "deepseek-reasoner (R1)" },
  ],
  docsUrl: "https://api-docs.deepseek.com/quick_start/pricing",
});

export const mistralProvider = makeOpenAICompatProvider({
  id: "mistral",
  name: "Mistral",
  chatEndpoint: "https://api.mistral.ai/v1/chat/completions",
  modelsEndpoint: "https://api.mistral.ai/v1/models",
  fallbackModels: [
    { id: "mistral-large-latest", label: "Mistral Large" },
    { id: "mistral-medium-latest", label: "Mistral Medium" },
  ],
  docsUrl: "https://docs.mistral.ai/getting-started/models/models_overview/",
});

// OpenRouter : passerelle vers des centaines de modèles (dont des gratuits,
// suffixés « :free »). API compatible OpenAI. Les ids sont préfixés du vendeur
// (`anthropic/claude-…`, `deepseek/…`) — à recopier depuis openrouter.ai/models.
export const openrouterProvider = makeOpenAICompatProvider({
  id: "openrouter",
  name: "OpenRouter",
  chatEndpoint: "https://openrouter.ai/api/v1/chat/completions",
  modelsEndpoint: "https://openrouter.ai/api/v1/models",
  fallbackModels: [
    {
      id: "meta-llama/llama-3.3-70b-instruct:free",
      label: "Llama 3.3 70B (gratuit)",
    },
    {
      id: "deepseek/deepseek-chat-v3-0324:free",
      label: "DeepSeek V3 (gratuit)",
    },
  ],
  docsUrl: "https://openrouter.ai/models",
});
