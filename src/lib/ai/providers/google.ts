/**
 * Fournisseur Google (Gemini) — API `generateContent`.
 *
 * Particularités vs OpenAI :
 *  - le modèle ET la clé sont dans l'URL (pas dans le corps / les en-têtes) ;
 *  - le prompt système est un champ dédié `systemInstruction` ;
 *  - le rôle "assistant" s'appelle "model" ;
 *  - la liste des modèles expose `supportedGenerationMethods` → on filtre sur
 *    ceux qui supportent réellement `generateContent`.
 */

import type { AIProvider, ModelInfo } from "../types";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiPart {
  text?: string;
}
interface GeminiContent {
  role?: string;
  parts?: GeminiPart[];
}
interface GeminiResponse {
  candidates?: { content?: GeminiContent }[];
}
interface GeminiModel {
  name?: string;
  displayName?: string;
  inputTokenLimit?: number;
  supportedGenerationMethods?: string[];
}
interface GeminiModelsResponse {
  models?: GeminiModel[];
}

export const googleProvider: AIProvider = {
  id: "google",
  name: "Google (Gemini)",
  needsKey: true,

  chatUrl: (model, apiKey) =>
    `${BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,

  streamChatUrl: (model, apiKey) =>
    `${BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,

  modelsUrl: (apiKey) => `${BASE}/models?key=${encodeURIComponent(apiKey)}`,

  buildHeaders: () => [["Content-Type", "application/json"]],

  buildBody: (messages, _model, maxTokens) => {
    // Chez Gemini, les tokens de raisonnement sont décomptés de
    // `maxOutputTokens`. Avec nos petits budgets (160 pour le vocal, 400 pour
    // l'analyse rapide), un modèle « thinking » (toute la génération 3) peut
    // tout consommer et renvoyer une réponse VIDE. On ajoute donc une marge :
    // c'est un plafond, pas une cible — la longueur reste dictée par le prompt.
    const THINKING_HEADROOM = 1024;
    const systemText = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
    return {
      ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
      contents,
      generationConfig: { maxOutputTokens: maxTokens + THINKING_HEADROOM },
    };
  },

  parseResponse: (raw) => {
    const r = raw as GeminiResponse;
    const parts = r.candidates?.[0]?.content?.parts ?? [];
    return parts
      .map((p) => p.text ?? "")
      .join("")
      .trim();
  },

  parseStreamChunk: (line) => {
    if (!line.startsWith("data:")) return null;
    try {
      const r = JSON.parse(line.slice(5).trim()) as GeminiResponse;
      const parts = r.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p) => p.text ?? "").join("");
      return text || null;
    } catch {
      return null;
    }
  },

  parseModels: (raw) => {
    const r = raw as GeminiModelsResponse;
    const models = r.models ?? [];
    return models
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map<ModelInfo>((m) => ({
        id: (m.name ?? "").replace(/^models\//, ""),
        label: m.displayName || (m.name ?? "").replace(/^models\//, ""),
        contextTokens: m.inputTokenLimit,
      }))
      .filter((m) => m.id.length > 0);
  },

  // Repli best-effort si la clé n'est pas encore saisie. À garder à jour :
  // Google retire vite les générations précédentes (les `gemini-2.5-*` renvoient
  // un 404 « no longer available to new users » pour les clés créées après
  // juillet 2026). La liste réelle vient de `/models` dès que la clé est saisie.
  fallbackModels: [
    { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash" },
    { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
    { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
  ],
  docsUrl: "https://ai.google.dev/gemini-api/docs/models",

  // Générations 1.x et 2.x : arrêtées ou en cours de retrait (les 2.5 renvoient
  // déjà 404 pour les clés récentes, arrêt annoncé au 16/10/2026).
  isRetiredModel: (id) => /^(models\/)?gemini-[012](\D|$)/i.test(id.trim()),
};
