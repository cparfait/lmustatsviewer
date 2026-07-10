/**
 * Service de coaching IA : appels chat via le proxy Rust + test de connexion.
 *
 * Phase 1 : non-streaming. Le streaming SSE/NDJSON arrivera avec le mode Live.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ai } from "../api";
import type { Tr } from "../../i18n";
import type { AIMessage, AIProvider } from "./types";
import { systemPrompt } from "./prompts/system";

/** Rend lisible (et traduite) une erreur de proxy (`HTTP 401: …`). */
export function friendlyError(e: unknown, t: Tr): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = /HTTP (\d{3})/.exec(msg);
  if (m) {
    const code = m[1];
    if (code === "401" || code === "403") return t("coach.errKey");
    if (code === "402") return t("coach.errQuota");
    if (code === "429") return t("coach.errRate");
    if (code.startsWith("5")) return t("coach.errServer", { code });
  }
  if (/error sending request|connect|dns|timed out|timeout/i.test(msg)) {
    return t("coach.errNetwork");
  }
  return msg;
}

/** Appel chat complet (non-streaming) → texte de la réponse. */
export async function chat(
  provider: AIProvider,
  model: string,
  apiKey: string,
  messages: AIMessage[],
  maxTokens: number,
): Promise<string> {
  const raw = await ai.chat(
    provider.chatUrl(model, apiKey),
    provider.buildHeaders(apiKey),
    provider.buildBody(messages, model, maxTokens),
  );
  return provider.parseResponse(raw);
}

/**
 * Teste la connexion : un appel chat minimal (8 tokens). Valide à la fois la
 * clé, le modèle et l'accès réseau — plus probant qu'un simple `listModels`.
 */
export async function testConnection(
  provider: AIProvider,
  model: string,
  apiKey: string,
  t: Tr,
): Promise<{ ok: boolean; error?: string }> {
  if (!model) return { ok: false, error: t("coach.errNoModel") };
  if (provider.needsKey && !apiKey) return { ok: false, error: t("coach.errNoKey") };
  try {
    // Un appel qui aboutit (HTTP 2xx, modèle valide, clé acceptée) suffit à
    // valider la connexion — même si la sortie est vide (modèles « thinking »,
    // budget court). On ne juge donc pas le contenu, seulement l'absence d'erreur.
    await chat(
      provider,
      model,
      apiKey,
      [{ role: "user", content: "Reply with the single word: OK" }],
      16,
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyError(e, t) };
  }
}

/** Prompt système effectif : l'override utilisateur s'il est non vide, sinon le défaut. */
function resolveSystem(lang: string, override?: string): string {
  return override && override.trim() ? override : systemPrompt(lang);
}

/** Consigne de brièveté radio jointe à la question vocale, dans la langue du pilote. */
const VOICE_STYLE: Record<string, string> = {
  fr: "(Réponds en 2 phrases maximum, style ingénieur radio, à voix haute.)",
  en: "(Answer in 2 sentences max, race-engineer radio style, spoken aloud.)",
  es: "(Responde en 2 frases como máximo, estilo ingeniero de radio, en voz alta.)",
  de: "(Antworte in maximal 2 Sätzen, im Funkstil eines Renningenieurs, laut gesprochen.)",
};

/**
 * Question vocale (push-to-talk en course) : réponse **courte** façon radio
 * (2 phrases max), non-streaming, lue par TTS. Le contexte live est joint.
 */
export async function askCoachVoice(args: {
  provider: AIProvider;
  model: string;
  apiKey: string;
  lang: string;
  question: string;
  contextText: string;
  systemOverride?: string;
}): Promise<string> {
  const { provider, model, apiKey, lang, question, contextText, systemOverride } = args;
  const style = VOICE_STYLE[lang.slice(0, 2).toLowerCase()] ?? VOICE_STYLE.en;
  const messages: AIMessage[] = [
    { role: "system", content: resolveSystem(lang, systemOverride) },
    {
      role: "user",
      content: `${question.trim()}\n\n${style}\n\n--- Live data ---\n${contextText}`,
    },
  ];
  return chat(provider, model, apiKey, messages, 160);
}

/**
 * Conversation en **streaming** : relaie les tokens via `onToken` au fur et à
 * mesure (events Tauri émis par `ai_chat_stream`). Renvoie le texte complet.
 */
export async function converseStream(args: {
  provider: AIProvider;
  model: string;
  apiKey: string;
  lang: string;
  history: AIMessage[];
  maxTokens: number;
  systemOverride?: string;
  onToken: (chunk: string) => void;
}): Promise<string> {
  const { provider, model, apiKey, lang, history, maxTokens, systemOverride, onToken } = args;
  const messages: AIMessage[] = [
    { role: "system", content: resolveSystem(lang, systemOverride) },
    ...history,
  ];
  const url = provider.streamChatUrl(model, apiKey);
  const headers = provider.buildHeaders(apiKey);
  const body = provider.buildBody(messages, model, maxTokens, true);
  const streamId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now() + Math.random());

  let full = "";
  const unlisten = await listen<string>(`ai-stream-${streamId}`, (e) => {
    const text = provider.parseStreamChunk(e.payload);
    if (text) {
      full += text;
      onToken(text);
    }
  });
  try {
    await invoke("ai_chat_stream", { streamId, url, headers, body });
  } finally {
    unlisten();
  }
  return full;
}
