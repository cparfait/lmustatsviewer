/** Registre des fournisseurs d'IA disponibles. */

import type { AIProvider } from "../types";
import { googleProvider } from "./google";
import { ollamaProvider } from "./ollama";
import { anthropicProvider } from "./anthropic";
import { openaiProvider, deepseekProvider, mistralProvider } from "./openai-compat";

export const PROVIDERS: AIProvider[] = [
  openaiProvider,
  anthropicProvider,
  googleProvider,
  deepseekProvider,
  mistralProvider,
  ollamaProvider,
];

export function getProvider(id: string): AIProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
