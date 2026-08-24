/** Registre des fournisseurs d'IA disponibles. */

import type { AIProvider } from "../types";
import { googleProvider } from "./google";
import { ollamaProvider } from "./ollama";
import { anthropicProvider } from "./anthropic";
import { getCustomProviders } from "./custom";
import {
  openaiProvider,
  deepseekProvider,
  mistralProvider,
  openrouterProvider,
} from "./openai-compat";

/** Fournisseurs intégrés. Les customs (définis par l'utilisateur) s'y ajoutent. */
export const PROVIDERS: AIProvider[] = [
  openaiProvider,
  anthropicProvider,
  googleProvider,
  openrouterProvider,
  deepseekProvider,
  mistralProvider,
  ollamaProvider,
];

/** Intégrés + customs, pour les menus de sélection. */
export function allProviders(): AIProvider[] {
  return [...PROVIDERS, ...getCustomProviders()];
}

export function getProvider(id: string): AIProvider | undefined {
  return allProviders().find((p) => p.id === id);
}
