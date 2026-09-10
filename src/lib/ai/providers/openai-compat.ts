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
  choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
  /** Certaines passerelles renvoient une erreur dans un corps HTTP 200. */
  error?: { message?: string; type?: string };
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

/** Marge pour les tokens de raisonnement (cf. commentaire de `buildBody`). */
const THINKING_HEADROOM = 1024;

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
  /**
   * Nom du champ de plafond de sortie. OpenAI a déprécié `max_tokens` : les
   * modèles de raisonnement (o-séries, GPT-5.x) le REJETTENT en 400
   * `unsupported_parameter` — alors que `max_completion_tokens` est accepté par
   * tous les modèles OpenAI actuels. Les autres fournisseurs compatibles
   * (DeepSeek, Mistral, OpenRouter, passerelles locales) ne connaissent pas
   * forcément le nouveau nom → `max_tokens` reste le défaut.
   */
  maxTokensField?: "max_tokens" | "max_completion_tokens";
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

    // Même marge que chez Google : les modèles de raisonnement (o-séries,
    // GPT-5.x, deepseek-reasoner, gemma "thinking" local…) décomptent leurs
    // tokens de réflexion du plafond de sortie. Vérifié en local : gemma4:12b
    // via Ollama dépense tout un budget de 16 tokens en `reasoning` et renvoie
    // un `content` VIDE (finish_reason: length). Plafond, pas cible : la
    // longueur de la réponse reste dictée par le prompt.
    buildBody: (messages, model, maxTokens, stream = false) => ({
      model,
      messages, // rôles system/user/assistant acceptés tels quels
      [cfg.maxTokensField ?? "max_tokens"]: maxTokens + THINKING_HEADROOM,
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
        // Plusieurs passerelles (OpenRouter, DeepSeek…) renvoient un objet
        // d'erreur DANS un corps HTTP 200 : sans ce test, le flux se terminait
        // sur une réponse vide et sans aucune explication.
        if (c.error) {
          return { kind: "error", message: c.error.message ?? "erreur du fournisseur" };
        }
        const choice = c.choices?.[0];
        const text = choice?.delta?.content;
        if (text) return { kind: "text", text };
        // Fin anticipée : plafond de sortie atteint, ou filtrage du fournisseur.
        const finish = choice?.finish_reason;
        if (finish && finish !== "stop") return { kind: "stop", reason: finish };
        return null;
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
    { id: "gpt-5-mini", label: "gpt-5-mini" },
    { id: "gpt-5.2", label: "gpt-5.2" },
    { id: "gpt-5.5", label: "gpt-5.5" },
  ],
  docsUrl: "https://platform.openai.com/docs/models",
  maxTokensField: "max_completion_tokens",
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
