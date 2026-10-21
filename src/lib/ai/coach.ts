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
import { languageLock, radioSystemPrompt, usesRadioPrompt, voiceUserMessage } from "./prompts/radio";
import { stripThinking, ThinkingStreamFilter } from "./thinking";
import { aiErrorKind } from "./errorKind";
import { withFreeFallback, type AiTarget } from "./freeFallback";

/**
 * Rend lisible (et traduite) une erreur de proxy (`HTTP 401: …`). `provider`
 * (facultatif) : chez un fournisseur à offre gratuite, un 429/402 vient presque
 * toujours de la limite gratuite → on la rappelle et on oriente vers un autre
 * fournisseur gratuit, au lieu d'un « réessaie » qui échouerait encore.
 */
export function friendlyError(e: unknown, t: Tr, provider?: AIProvider): string {
  const msg = errorMessage(e);
  const { kind, code } = aiErrorKind(msg);
  if ((kind === "rate" || kind === "quota") && provider?.freeTier) {
    return t("coach.errRateFree", { name: provider.name, limits: provider.freeTier.limits });
  }
  switch (kind) {
    case "model":
      return t("coach.errModel");
    case "key":
      return t("coach.errKey");
    case "quota":
      return t("coach.errQuota");
    case "rate":
      return t("coach.errRate");
    case "server":
      return t("coach.errServer", { code });
    case "network":
      return t("coach.errNetwork");
    default:
      return msg;
  }
}

/** Message brut d'une erreur (Error ou valeur rejetée par `invoke`). */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Appel chat complet (non-streaming) → texte de la réponse. Limite d'une offre
 * gratuite atteinte : rejoué chez un autre fournisseur gratuit configuré
 * (`freeFallback.ts`), sauf `noFallback` (tests de connexion : on teste CE
 * fournisseur).
 */
export async function chat(
  provider: AIProvider,
  model: string,
  apiKey: string,
  messages: AIMessage[],
  maxTokens: number,
  noFallback = false,
): Promise<string> {
  if (noFallback) return chatOnce(provider, model, apiKey, messages, maxTokens);
  return withFreeFallback({ provider, model, apiKey }, (tg) =>
    chatOnce(tg.provider, tg.model, tg.apiKey, messages, maxTokens),
  );
}

async function chatOnce(
  provider: AIProvider,
  model: string,
  apiKey: string,
  messages: AIMessage[],
  maxTokens: number,
): Promise<string> {
  const url = provider.chatUrl(model, apiKey);
  const headers = provider.buildHeaders(apiKey);
  const body = provider.buildBody(messages, model, maxTokens);
  let raw: unknown;
  try {
    raw = await ai.chat(url, headers, body);
  } catch (e) {
    // Option facultative refusée (ex. raisonnement coupé sur un modèle où il est
    // obligatoire) : une seule relance, sans elle.
    const fallback = /HTTP 400/.test(errorMessage(e)) ? provider.fallbackBody?.(body) : null;
    if (!fallback) throw e;
    raw = await ai.chat(url, headers, fallback);
  }
  return stripThinking(provider.parseResponse(raw)).trim();
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
      true,
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyError(e, t, provider) };
  }
}

/** Prompt système effectif : l'override utilisateur s'il est non vide, sinon le défaut. */
function resolveSystem(lang: string, override?: string): string {
  return override && override.trim() ? override : systemPrompt(lang);
}

/**
 * Question vocale (push-to-talk en course) : réponse **courte** façon radio
 * (2 phrases max), non-streaming, lue par TTS. Le contexte live est joint.
 *
 * `radioPrompt` (défaut) : prompt système radio dédié (`prompts/radio.ts`) au lieu du
 * prompt d'analyse ; un prompt personnalisé par l'utilisateur garde toujours la main.
 * Message : données d'abord, question ensuite, rappels en toute fin (`voiceUserMessage`) ;
 * sans le prompt radio, l'ancien message (question en tête) est gardé tel quel.
 */
export async function askCoachVoice(args: {
  provider: AIProvider;
  model: string;
  apiKey: string;
  lang: string;
  question: string;
  contextText: string;
  systemOverride?: string;
  radioPrompt?: boolean;
}): Promise<string> {
  const { provider, model, apiKey, lang, question, contextText, systemOverride } = args;
  const radio = usesRadioPrompt(systemOverride, args.radioPrompt);
  const system = radio ? radioSystemPrompt(lang) : resolveSystem(lang, systemOverride);
  const messages: AIMessage[] = [
    { role: "system", content: system },
    { role: "user", content: voiceUserMessage({ question, contextText, lang, radio }) },
  ];
  return chat(provider, model, apiKey, messages, 160);
}

/**
 * Aiguillage d'une question ambiguë : le modèle **choisit seulement** une
 * intention dans la liste fermée (identifiant), il ne répond pas. La réponse
 * reste calculée en code → aucun chiffre ne transite par le modèle, sortie de
 * quelques tokens (rapide, quasi gratuit). `null` si le modèle ne tranche pas.
 */
export async function classifyIntent(args: {
  provider: AIProvider;
  model: string;
  apiKey: string;
  question: string;
  /** Identifiant → description courte (anglais). */
  intents: Record<string, string>;
}): Promise<string | null> {
  const { provider, model, apiKey, question, intents } = args;
  const ids = Object.keys(intents);
  if (!ids.length) return null;
  const list = ids.map((id) => `- ${id}: ${intents[id]}`).join("\n");
  const messages: AIMessage[] = [
    {
      role: "system",
      content:
        "You route a race driver's radio question to exactly ONE intent id from the list. " +
        "Reply with the id only (no punctuation, no explanation), or the word none if nothing fits.",
    },
    { role: "user", content: `Intents:\n${list}\n\nQuestion: ${question.trim()}` },
  ];
  const raw = await chat(provider, model, apiKey, messages, 16);
  const word = raw.trim().split(/\s+/)[0]?.replace(/[^A-Za-z]/g, "").toLowerCase() ?? "";
  return ids.find((id) => id.toLowerCase() === word) ?? null;
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
  /**
   * Appelé en fin de flux avec la raison d'une réponse **incomplète**
   * (`max_tokens`, filtre du fournisseur, coupure réseau), ou `null` si la
   * réponse est complète. Permet de le signaler à l'utilisateur au lieu de lui
   * présenter un texte tronqué comme s'il était fini.
   */
  onTruncated?: (reason: string | null) => void;
}): Promise<string> {
  const { provider, model, apiKey, lang, history, maxTokens, systemOverride, onToken, onTruncated } =
    args;
  // Rappel de langue en toute fin du dernier message du pilote (copie : l'historique
  // affiché et sauvegardé n'est pas touché). Le contexte joint est en anglais : sans ce
  // rappel lu en dernier, un petit modèle glisse vers l'anglais.
  const tail = [...history];
  const last = tail.length - 1;
  if (last >= 0 && tail[last].role === "user") {
    tail[last] = { ...tail[last], content: `${tail[last].content}\n\n${languageLock(lang)}` };
  }
  const messages: AIMessage[] = [{ role: "system", content: resolveSystem(lang, systemOverride) }, ...tail];
  // Limite gratuite atteinte avant le moindre texte : rejoué chez un autre
  // fournisseur gratuit configuré. Une coupure en cours de flux garde le texte reçu.
  return withFreeFallback({ provider, model, apiKey }, (tg) =>
    streamOnce(tg, messages, maxTokens, onToken, onTruncated),
  );
}

async function streamOnce(
  { provider, model, apiKey }: AiTarget,
  messages: AIMessage[],
  maxTokens: number,
  onToken: (chunk: string) => void,
  onTruncated?: (reason: string | null) => void,
): Promise<string> {
  const url = provider.streamChatUrl(model, apiKey);
  const headers = provider.buildHeaders(apiKey);
  const body = provider.buildBody(messages, model, maxTokens, true);
  const streamId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now() + Math.random());

  let full = "";
  let streamError: string | null = null;
  let truncated: string | null = null;
  // Raisonnement écrit dans le texte (`<think>…</think>`) : jamais montré.
  const thinking = new ThinkingStreamFilter();
  const unlisten = await listen<string>(`ai-stream-${streamId}`, (e) => {
    const chunk = provider.parseStreamChunk(e.payload);
    if (!chunk) return;
    if (chunk.kind === "text") {
      full += chunk.text;
      const visible = thinking.push(chunk.text);
      if (visible) onToken(visible);
    } else if (chunk.kind === "error") {
      streamError = chunk.message;
    } else {
      truncated = chunk.reason;
    }
  });
  try {
    await invoke("ai_chat_stream", { streamId, url, headers, body });
  } catch (e) {
    // Coupure réseau ou délai d'inactivité en cours de flux. Si du texte est
    // déjà arrivé, on le CONSERVE : le jeter effaçait sous les yeux de
    // l'utilisateur une analyse lue à 80 %, et déjà facturée.
    if (!full) throw e;
    truncated = truncated ?? "network";
  } finally {
    unlisten();
  }
  // Erreur annoncée dans le flux (surcharge, quota) : sans texte, c'est un échec
  // franc ; avec du texte, la réponse est simplement incomplète.
  if (streamError && !stripThinking(full)) throw new Error(streamError);
  if (streamError) truncated = truncated ?? streamError;

  onTruncated?.(truncated);
  return stripThinking(full);
}
