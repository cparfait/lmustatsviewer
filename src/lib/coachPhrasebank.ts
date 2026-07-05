/**
 * Orchestration de la banque de phrases LLM à slots (COACH-LIVE-SPEC.md §10, P4.3).
 *
 * Fait le pont entre le **service coach** (pur, sans I/O : `coachComboInfo` /
 * `setCoachPhraseBank`), le **stockage SQLite** (`coachRef.phrasebank*`) et la
 * **génération LLM** (`ai/phrasebank-gen`). Un seul appel batch par combo × langue,
 * **hors chemin critique** : au 1ᵉʳ combo (via le hook) ou à la demande (Config).
 *
 * Politique : (1) charger la banque persistée si son `ref_key` est compatible →
 * zéro coût, hors-ligne ; (2) sinon, si le Coach IA est configuré, générer + persister ;
 * (3) sinon, ne rien faire (repli i18n déterministe). Toujours **best-effort** : un
 * échec laisse le coach sur ses gabarits déterministes.
 */

import { coachRef } from "@/lib/api";
import {
  coachComboInfo,
  setCoachPhraseBank,
  parsePhraseEntries,
  serializePhraseEntries,
} from "@/lib/coach";
import { generatePhrasebank } from "@/lib/ai/phrasebank-gen";
import { getProvider } from "@/lib/ai/providers";
import { useAppStore } from "@/stores/app";

/** Résultat d'une tentative d'application/génération de banque. */
export type PhrasebankOutcome = "cached" | "generated" | "skipped" | "no-combo" | "error";

const norm = (lang: string) => (lang || "fr").slice(0, 2).toLowerCase();

/** Combo × langue × réf déjà appliqué (anti-doublon) + génération en vol. */
let appliedKey = "";
let busyKey = "";

/** Le Coach IA est-il configuré pour générer (fournisseur + modèle + clé) ? */
function aiReady(): boolean {
  const st = useAppStore.getState();
  if (!st.aiCoachEnabled) return false;
  const p = getProvider(st.aiProvider);
  if (!p || !st.aiModel) return false;
  return !p.needsKey || !!st.aiApiKey;
}

/**
 * Applique la banque du combo courant (charge, ou génère si `force`/absente).
 * `force` = régénération explicite (bouton Config) : ignore le cache et régénère.
 * Réinitialise la banque du service si le combo n'a pas de banque utilisable.
 */
export async function applyOrGeneratePhrasebank(
  lang: string,
  opts: { force?: boolean } = {},
): Promise<PhrasebankOutcome> {
  const info = coachComboInfo();
  if (!info.track || !info.carModel) return "no-combo";
  const lg = norm(lang);
  const key = `${info.track}::${info.carModel}::${lg}::${info.refKey}`;
  if (!opts.force && key === appliedKey) return "cached";
  if (busyKey === key && !opts.force) return "skipped";
  busyKey = key;
  try {
    // 1) Cache SQLite (sauf régénération forcée).
    if (!opts.force) {
      const cached = await coachRef.phrasebankLoad(info.track, info.carModel, lg);
      if (cached && cached.ref_key === info.refKey) {
        const entries = parsePhraseEntries(cached.variants);
        if (entries.length) {
          setCoachPhraseBank(entries);
          appliedKey = key;
          return "cached";
        }
      }
    }
    // 2) Génération (best-effort — nécessite un Coach IA configuré).
    if (!aiReady()) {
      if (!opts.force) return "skipped";
      throw new Error("ai-not-configured");
    }
    const st = useAppStore.getState();
    const provider = getProvider(st.aiProvider)!;
    const entries = await generatePhrasebank({
      provider,
      model: st.aiModel,
      apiKey: st.aiApiKey,
      lang: lg,
      corners: info.macro,
    });
    if (!entries.length) throw new Error("empty-generation");
    setCoachPhraseBank(entries);
    appliedKey = key;
    await coachRef
      .phrasebankSave({
        track: info.track,
        carModel: info.carModel,
        lang: lg,
        classId: info.carClass,
        refKey: info.refKey,
        variants: serializePhraseEntries(entries),
      })
      .catch(() => {
        /* écriture best-effort : la banque reste active en mémoire cette session */
      });
    return "generated";
  } catch {
    return "error";
  } finally {
    if (busyKey === key) busyKey = "";
  }
}

/** Efface la banque du service + du stockage pour le combo courant (Config). */
export async function clearPhrasebankForCurrentCombo(): Promise<void> {
  const info = coachComboInfo();
  setCoachPhraseBank(null);
  appliedKey = "";
  if (info.track && info.carModel) {
    await coachRef.phrasebankClear(info.track, info.carModel).catch(() => {});
  }
}

/** Réinitialise l'état d'application (au démontage / coupure du mode). */
export function resetPhrasebankApplied(): void {
  appliedKey = "";
}
