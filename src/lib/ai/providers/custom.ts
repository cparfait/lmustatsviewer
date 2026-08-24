/**
 * Fournisseurs personnalisés : n'importe quels services compatibles OpenAI,
 * ajoutés par l'utilisateur avec un nom et une URL de base (Groq, xAI,
 * Together, LM Studio, vLLM, passerelle d'entreprise…). Gestion en cartes dans
 * la page Config, plusieurs entrées possibles — inspiré du gestionnaire de
 * fournisseurs de deepseek-harness.
 *
 * Les définitions vivent dans la config (`ai_custom_providers`, JSON) et la clé
 * API de chacun est chiffrée côté Rust (`ai_set_provider_key`). Le store les
 * injecte ici via `setCustomProviders` — les providers restent hors du store
 * (sinon cycle d'imports store → contexte IA → store).
 */

import type { AIProvider } from "../types";
import { makeOpenAICompatProvider } from "./openai-compat";

/** Définition persistée (partie non secrète — la clé est chiffrée à part). */
export interface CustomProviderDef {
  /** Id stable, config-safe (`custom-xxxxxxxx`). */
  id: string;
  /** Nom affiché dans les menus (choisi par l'utilisateur). */
  name: string;
  /** Racine de l'API compatible OpenAI, ex. `https://api.groq.com/openai/v1`. */
  baseUrl: string;
}

/** Fabrique un id config-safe (validé côté Rust : alphanum + tirets). */
export function newCustomProviderId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10);
  return `custom-${rand}`;
}

function buildProvider(def: CustomProviderDef): AIProvider {
  const base = def.baseUrl.trim().replace(/\/+$/, "");
  const inner = makeOpenAICompatProvider({
    id: def.id,
    name: def.name || "OpenAI-compatible",
    chatEndpoint: `${base}/chat/completions`,
    modelsEndpoint: `${base}/models`,
    fallbackModels: [],
    docsUrl: "",
  });
  return {
    ...inner,
    // Beaucoup de cibles locales (LM Studio, vLLM…) n'exigent pas de clé : on
    // ne bloque pas dessus, et l'Authorization n'est envoyée que si clé.
    needsKey: false,
    custom: true,
    buildHeaders: (apiKey) => [
      ["Content-Type", "application/json"],
      ...(apiKey ? ([["Authorization", `Bearer ${apiKey}`]] as [string, string][]) : []),
    ],
  };
}

let providers: AIProvider[] = [];

/** Reconstruit les providers custom à partir des définitions (appelé par le store). */
export function setCustomProviders(defs: CustomProviderDef[]): void {
  providers = defs.map(buildProvider);
}

export function getCustomProviders(): AIProvider[] {
  return providers;
}
