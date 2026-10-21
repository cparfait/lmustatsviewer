/**
 * Fournisseur, modèle et clé de l'analyse (Coach IA de la page), lus dans le
 * store : pour les appels IA faits hors du panneau du Coach (audit du setup…).
 * `null` si le Coach IA est coupé ou incomplet (pas de modèle, clé manquante).
 */

import { useAppStore } from "@/stores/app";
import { getProvider } from "./providers";
import type { AIProvider } from "./types";

export interface AnalysisTarget {
  provider: AIProvider;
  model: string;
  apiKey: string;
}

export function analysisTarget(): AnalysisTarget | null {
  const st = useAppStore.getState();
  if (!st.aiCoachEnabled) return null;
  const provider = getProvider(st.aiProvider);
  const apiKey = st.aiProviderKeys[st.aiProvider] ?? "";
  if (!provider || !st.aiModel || (provider.needsKey && !apiKey)) return null;
  return { provider, model: st.aiModel, apiKey };
}

/** Même chose, réactif (composants). */
export function useAnalysisReady(): boolean {
  const enabled = useAppStore((s) => s.aiCoachEnabled);
  const providerId = useAppStore((s) => s.aiProvider);
  const model = useAppStore((s) => s.aiModel);
  const keys = useAppStore((s) => s.aiProviderKeys);
  const p = getProvider(providerId);
  return enabled && !!p && !!model && (!p.needsKey || !!keys[providerId]);
}
