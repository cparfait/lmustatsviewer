/** Registre des fournisseurs d'IA disponibles. */

import type { AIProvider } from "../types";
import { googleProvider } from "./google";
import { ollamaProvider } from "./ollama";
import { anthropicProvider } from "./anthropic";
import { getCustomProviders } from "./custom";
import { FREE_PROVIDERS, zaiProvider } from "./free";
import {
  openaiProvider,
  deepseekProvider,
  mistralProvider,
  openrouterProvider,
} from "./openai-compat";

/**
 * Fournisseurs intégrés. Les customs (définis par l'utilisateur) s'y ajoutent.
 * Les fournisseurs à offre gratuite (`free.ts`) suivent les historiques : leur
 * ordre et leurs ids sont stables (clés de config `ai_provider_list`).
 */
export const PROVIDERS: AIProvider[] = [
  openaiProvider,
  anthropicProvider,
  googleProvider,
  openrouterProvider,
  deepseekProvider,
  mistralProvider,
  // Offre mixte (seuls les modèles GLM « Flash » sont gratuits) : avec les classiques.
  zaiProvider,
  ollamaProvider,
  ...FREE_PROVIDERS,
];

/** Intégrés + customs, pour les menus de sélection. */
export function allProviders(): AIProvider[] {
  return [...PROVIDERS, ...getCustomProviders()];
}

/**
 * Vrai si `modelId` fait partie des modèles connus d'un AUTRE fournisseur que
 * `providerId` (et pas des siens) : un id resté d'un ancien fournisseur.
 */
export function isForeignModel(modelId: string, providerId: string): boolean {
  const own = getProvider(providerId);
  if (own?.fallbackModels.some((m) => m.id === modelId)) return false;
  return allProviders().some((p) => p.id !== providerId && p.fallbackModels.some((m) => m.id === modelId));
}

export function getProvider(id: string): AIProvider | undefined {
  return allProviders().find((p) => p.id === id);
}
