/**
 * Récupération de la liste des modèles d'un fournisseur, avec cache + repli.
 *
 * Stratégie (cf. SUIVI « AI Coach — Phase 1 ») :
 *   1. appel `ai_list_models` (via Rust) → filtre/normalise par le provider ;
 *   2. succès → on met en cache (`config ai_models_cache_<id>`) + on renvoie ;
 *   3. échec (hors-ligne, 401, Ollama éteint…) → cache, puis repli statique.
 * On ne renvoie jamais une liste vide qui viderait le sélecteur : on retombe
 * toujours sur `fallbackModels`.
 *
 * ⚠️ Les endpoints `/models` ne renvoient PAS les prix : la table de coûts reste
 * maintenue séparément (`cost.ts`, à venir).
 */

import { ai, config } from "../api";
import type { AIProvider, ModelInfo } from "./types";

const cacheKey = (providerId: string) => `ai_models_cache_${providerId}`;

async function readCache(providerId: string): Promise<ModelInfo[] | null> {
  try {
    const raw = await config.get(cacheKey(providerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ModelInfo[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCache(providerId: string, models: ModelInfo[]): Promise<void> {
  try {
    await config.set(cacheKey(providerId), JSON.stringify(models));
  } catch {
    // Le cache est best-effort : un échec d'écriture n'est pas bloquant.
  }
}

/** Trie par récence (récent d'abord) quand `createdAt` est disponible. */
function sortByRecency(models: ModelInfo[]): ModelInfo[] {
  return [...models].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/**
 * Liste les modèles utilisables d'un fournisseur. Ne lève jamais : renvoie au
 * pire le cache puis le repli statique.
 */
export async function fetchModels(
  provider: AIProvider,
  apiKey: string,
): Promise<ModelInfo[]> {
  if (provider.needsKey && !apiKey) {
    return (await readCache(provider.id)) ?? provider.fallbackModels;
  }
  try {
    const raw = await ai.listModels(provider.modelsUrl(apiKey), provider.buildHeaders(apiKey));
    const models = sortByRecency(provider.parseModels(raw));
    if (models.length > 0) {
      await writeCache(provider.id, models);
      return models;
    }
  } catch (e) {
    console.warn(`[ai] listModels(${provider.id}) a échoué :`, e);
  }
  return (await readCache(provider.id)) ?? provider.fallbackModels;
}
