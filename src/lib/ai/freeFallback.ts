/**
 * Bascule automatique entre fournisseurs gratuits : quand l'offre gratuite du
 * fournisseur actif est épuisée (HTTP 429 / 402), l'appel est rejoué chez un
 * AUTRE fournisseur gratuit que le pilote a déjà configuré, au lieu d'échouer.
 *
 * Garde-fous :
 *  - seulement si le fournisseur actif est lui-même gratuit (un 429 chez un
 *    fournisseur payant reste une erreur, comme avant) ;
 *  - seulement vers des fournisseurs configurés par le pilote (aucun envoi vers
 *    un service qu'il n'a pas ajouté) ;
 *  - jamais vers un modèle payant : une offre mixte n'est prise qu'avec son
 *    `fallbackModel` sûrement gratuit, et une clé qui déclenche la facturation
 *    (`keyBills`) n'est pas envoyée ;
 *  - réglage « Bascule » (activé par défaut) : coupé, l'erreur s'affiche comme
 *    avant.
 *
 * Le module ne lit pas le store (cycle d'imports) : le store y injecte sa
 * source (`setFreeFallbackSource`).
 */

import i18next from "i18next";
import { toast } from "@/stores/dialogs";
import { PROVIDERS, getProvider } from "./providers";
import { aiErrorKind } from "./errorKind";
import type { AIProvider } from "./types";

export interface AiTarget {
  provider: AIProvider;
  model: string;
  apiKey: string;
}

export interface FreeFallbackSource {
  enabled: boolean;
  /** Fournisseurs intégrés configurés, dans l'ordre de la page Config. */
  configured: string[];
  /** Clé par fournisseur. */
  keys: Record<string, string>;
}

let source: (() => FreeFallbackSource) | null = null;

/** Branché par le store au démarrage. */
export function setFreeFallbackSource(fn: () => FreeFallbackSource): void {
  source = fn;
}

/**
 * Vrai si l'erreur vient de la limite d'une offre gratuite. Offre mixte : seulement
 * sur un de ses modèles gratuits (`isFreeModel`) — sur un modèle payant, c'est le
 * forfait du pilote, et on ne bascule pas vers un service gratuit à son insu.
 */
export function isFreeLimitError(message: string, provider: AIProvider, model: string): boolean {
  const ft = provider.freeTier;
  if (!ft) return false;
  if (ft.partial && !ft.isFreeModel?.(model)) return false;
  const { kind } = aiErrorKind(message);
  return kind === "rate" || kind === "quota";
}

/** Vrai si le fournisseur peut être le point de départ d'une bascule. */
function canStartFallback(p: AIProvider): boolean {
  return !!p.freeTier && (!p.freeTier.partial || !!p.freeTier.isFreeModel);
}

/** Modèle sûrement gratuit pour la bascule, ou `null` (fournisseur exclu). */
export function freeFallbackModel(p: AIProvider): string | null {
  const ft = p.freeTier;
  if (!ft) return null;
  if (ft.fallbackModel) return ft.fallbackModel;
  if (ft.partial) return null;
  return p.fallbackModels[0]?.id ?? null;
}

/** Cibles de bascule (pures) : autres fournisseurs gratuits configurés et utilisables. */
export function freeFallbackTargets(currentId: string, src: FreeFallbackSource): AiTarget[] {
  if (!src.enabled) return [];
  const out: AiTarget[] = [];
  for (const p of PROVIDERS) {
    if (p.id === currentId || !src.configured.includes(p.id)) continue;
    const model = freeFallbackModel(p);
    if (!model) continue;
    const key = p.freeTier?.keyBills ? "" : (src.keys[p.id] ?? "");
    if (p.needsKey && !key) continue;
    out.push({ provider: p, model, apiKey: key });
  }
  return out;
}

/**
 * Vrai si une bascule peut avoir lieu : un fournisseur gratuit configuré ET
 * utilisable (clé présente si exigée) a au moins un relais. Sert à n'afficher
 * le réglage que lorsqu'il a un effet.
 */
export function freeRelayPossible(src: Omit<FreeFallbackSource, "enabled">): boolean {
  const full = { ...src, enabled: true };
  return src.configured.some((id) => {
    const p = getProvider(id);
    if (!p || !canStartFallback(p) || (p.needsKey && !src.keys[id])) return false;
    return freeFallbackTargets(id, full).length > 0;
  });
}

/** Cibles de bascule d'après le store (vide si la source n'est pas branchée). */
export function currentFreeFallbacks(provider: AIProvider): AiTarget[] {
  if (!source || !provider.freeTier || !getProvider(provider.id)) return [];
  return freeFallbackTargets(provider.id, source());
}

/** Prévient le pilote qu'une réponse vient d'un autre fournisseur. */
export function notifyFreeFallback(from: AIProvider, to: AiTarget): void {
  toast(i18next.t("coach.freeFallbackUsed", { from: from.name, to: to.provider.name, model: to.model }));
}

/**
 * Exécute `run` sur la cible d'origine, puis, si la limite gratuite est
 * atteinte, sur chaque autre fournisseur gratuit configuré jusqu'au premier
 * succès. L'erreur d'origine est relancée si aucune bascule n'aboutit.
 */
export async function withFreeFallback<T>(
  origin: AiTarget,
  run: (target: AiTarget) => Promise<T>,
): Promise<T> {
  try {
    return await run(origin);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!isFreeLimitError(msg, origin.provider, origin.model)) throw e;
    for (const target of currentFreeFallbacks(origin.provider)) {
      try {
        const res = await run(target);
        notifyFreeFallback(origin.provider, target);
        return res;
      } catch (e2) {
        console.warn(`[ai] bascule gratuite vers ${target.provider.id} a échoué :`, e2);
      }
    }
    throw e;
  }
}
