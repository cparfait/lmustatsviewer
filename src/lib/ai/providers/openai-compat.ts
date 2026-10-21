/**
 * Fabrique de fournisseurs compatibles OpenAI (`/chat/completions`).
 *
 * OpenAI, DeepSeek et Mistral partagent le même format de requête/réponse et
 * le même endpoint de liste (`/models`) → un seul code paramétré par l'URL de
 * base, le nom et la liste de repli.
 */

import type { AIProvider, FreeTierInfo, ModelInfo } from "../types";

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
  [field: string]: unknown;
}
interface OAModelsResponse {
  data?: OAModel[];
}

/**
 * Exclut les modèles non conversationnels (embeddings, audio, image, filtres de
 * sécurité…). Les catalogues des hébergeurs gratuits mélangent tout : OVHcloud
 * liste ses voix (`nvr-tts-*`), ses embeddings (`bge-*`) et Stable Diffusion à
 * côté des modèles de chat.
 */
const NON_CHAT =
  /embedding|whisper|tts|dall|moderation|audio|realtime|image|vision-?embed|rerank|(?:^|\/)bge-|guard|content-safety|stable-diffusion|sdxl/i;

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
  /**
   * Coupe le raisonnement des appels courts (non-streaming : test, question
   * vocale, aiguillage, banque de phrases) via `reasoning: { effort: "none" }`
   * — paramètre propre à OpenRouter. Un modèle à raisonnement obligatoire le
   * refuse en 400 → `fallbackBody` renvoie la requête sans lui.
   */
  quickNoReasoning?: boolean;
  /**
   * Clé facultative : le fournisseur répond sans clé (offre gratuite anonyme) ;
   * `Authorization` n'est envoyé que si l'utilisateur en a saisi une.
   */
  keyOptional?: boolean;
  /** Offre gratuite permanente (étiquette « Gratuit » + précisions). */
  freeTier?: FreeTierInfo;
  /** Page de création de la clé API. */
  keyUrl?: string;
  /**
   * Filtre sur la fiche BRUTE de `/models` (champs propres au fournisseur :
   * palier gratuit, type de modèle…), appliqué avant l'exclusion non-chat.
   */
  rawModelFilter?: (m: Record<string, unknown>) => boolean;
}

export function makeOpenAICompatProvider(cfg: OpenAICompatConfig): AIProvider {
  return {
    id: cfg.id,
    name: cfg.name,
    needsKey: !cfg.keyOptional,
    ...(cfg.freeTier ? { freeTier: cfg.freeTier } : {}),
    ...(cfg.keyUrl ? { keyUrl: cfg.keyUrl } : {}),

    chatUrl: () => cfg.chatEndpoint,
    streamChatUrl: () => cfg.chatEndpoint,
    modelsUrl: () => cfg.modelsEndpoint,
    buildHeaders: (apiKey) =>
      cfg.keyOptional && !apiKey
        ? [["Content-Type", "application/json"]]
        : [
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
      ...(cfg.quickNoReasoning && !stream ? { reasoning: { effort: "none" } } : {}),
    }),

    fallbackBody: (body) => {
      if (!cfg.quickNoReasoning || !body || typeof body !== "object" || !("reasoning" in body)) {
        return null;
      }
      const { reasoning: _dropped, ...rest } = body as Record<string, unknown>;
      return rest;
    },

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
        .filter((m) => (cfg.rawModelFilter ? cfg.rawModelFilter(m) : true))
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

// Mode gratuit par défaut sur les nouveaux comptes (crédits mensuels), sans
// carte ; les requêtes gratuites peuvent entraîner les modèles (désactivable
// dans la console Mistral).
export const mistralProvider = makeOpenAICompatProvider({
  id: "mistral",
  name: "Mistral",
  freeTier: { limits: "≈ 1 req/s · crédits mensuels", mayTrain: true, eu: true, partial: true },
  keyUrl: "https://console.mistral.ai/api-keys",
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
// Raisonnement coupé sur les appels courts : certains hébergeurs de Qwen 3.5
// écrivent la réflexion DANS le texte, sans balise ouvrante ; le budget court
// s'épuisait avant le `</think>` final et le pilote lisait le brouillon anglais.
export const openrouterProvider = makeOpenAICompatProvider({
  quickNoReasoning: true,
  id: "openrouter",
  name: "OpenRouter",
  chatEndpoint: "https://openrouter.ai/api/v1/chat/completions",
  modelsEndpoint: "https://openrouter.ai/api/v1/models",
  // `openrouter/free` : routeur qui choisit lui-même un modèle gratuit disponible.
  // Offre mixte : seuls les modèles « :free » sont gratuits.
  freeTier: {
    limits: "20 req/min · 50 req/jour (modèles :free)",
    mayLog: true,
    partial: true,
    fallbackModel: "openrouter/free",
  },
  keyUrl: "https://openrouter.ai/keys",
  fallbackModels: [
    { id: "openrouter/free", label: "openrouter/free (routeur gratuit)" },
    { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super 120B (gratuit)" },
    { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B (gratuit)" },
  ],
  docsUrl: "https://openrouter.ai/models",
});
