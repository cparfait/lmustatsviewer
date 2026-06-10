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
      generationConfig: { maxOutputTokens: maxTokens },
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

  // Repli best-effort si la clé n'est pas encore saisie. À garder à jour.
  fallbackModels: [
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],
};
