/**
 * Phrases fixes de Piper générées d'avance, pour la voix choisie (locuteur et vitesse
 * compris), et gardées sur disque par le backend (`tts_synthesize`, clé de cache) :
 * relues ensuite sans attendre Piper, même au premier lancement. Tout reste sur ce PC.
 * Proposé à l'installation d'une voix (`VoiceDownloads.tsx`) et dans `PiperPrepare.tsx`.
 *
 * Une phrase avec des chiffres n'est jamais générée d'avance : elle change à chaque fois.
 */

import { invoke } from "@tauri-apps/api/core";
import { buildPrepList } from "@/lib/cloudVoicePrepList";
import { piperCacheKey, piperTarget } from "@/lib/voice";
import { toastError, toastSuccess } from "@/stores/dialogs";

/** Échecs d'affilée avant d'arrêter : Piper absent ou en panne, inutile d'insister. */
const FAIL_LIMIT = 2;

export type PiperPrepOutcome = "done" | "cancelled" | "changed" | "paused";

export interface PiperPrepPlan {
  tag: string;
  lang: string;
  total: number;
  missing: string[];
}

export interface PiperPrepState {
  running: boolean;
  done: number;
  total: number;
  failed: number;
  outcome: PiperPrepOutcome | null;
}

const IDLE: PiperPrepState = { running: false, done: 0, total: 0, failed: 0, outcome: null };

let state = IDLE;
let cancel = false;
const listeners = new Set<() => void>();

function setState(next: PiperPrepState) {
  state = next;
  listeners.forEach((l) => l());
}

export function subscribePiperPrep(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function piperPrepSnapshot(): PiperPrepState {
  return state;
}

export function cancelPiperPrep() {
  cancel = true;
}

/** Ce qui fixe le rendu : si l'un change en route, la suite ne servirait plus. */
function targetTag(lang: string): string {
  const { code, voiceId, speakerId, rate } = piperTarget(lang);
  return `${code}|${voiceId ?? ""}|${speakerId ?? 0}|${rate}`;
}

/** Les phrases fixes de la langue : les mêmes que celles de la voix IA, sans ses morceaux. */
export function piperPhrases(
  lang: string,
  t: (key: string, opts: { lng: string }) => string,
  live: Record<string, unknown> | undefined,
): string[] {
  return buildPrepList(lang, t, live, []).phrases;
}

/** Ce qui reste à générer pour la voix choisie. */
export async function planPiperPrep(texts: string[], lang: string): Promise<PiperPrepPlan> {
  const { code, voiceId } = piperTarget(lang);
  const keys = await Promise.all(texts.map((text) => piperCacheKey(code, text)));
  const absent = new Set(await invoke<string[]>("tts_piper_cache_missing", { lang: code, voiceId, keys }));
  return { tag: targetTag(lang), lang, total: texts.length, missing: texts.filter((_, i) => absent.has(keys[i])) };
}

/**
 * Génère une à une les phrases absentes : Piper n'a qu'un processus, et une annonce en
 * course n'attend ainsi que la fin de la phrase en cours. Relancer reprend où on s'est arrêté.
 */
export async function runPiperPrep(plan: PiperPrepPlan): Promise<PiperPrepOutcome> {
  if (state.running) return "cancelled";
  cancel = false;
  let current: PiperPrepState = { running: true, done: 0, total: plan.missing.length, failed: 0, outcome: null };
  setState(current);
  let outcome: PiperPrepOutcome = "done";
  let streak = 0;
  for (const text of plan.missing) {
    if (cancel) outcome = "cancelled";
    else if (targetTag(plan.lang) !== plan.tag) outcome = "changed";
    else if (streak >= FAIL_LIMIT) outcome = "paused";
    if (outcome !== "done") break;
    const { code, voiceId, speakerId, rate } = piperTarget(plan.lang);
    let ok = true;
    try {
      const cacheKey = await piperCacheKey(code, text);
      await invoke<string>("tts_synthesize", { text, lang: code, voiceId, rate, speakerId, cacheKey });
    } catch {
      ok = false;
    }
    streak = ok ? 0 : streak + 1;
    current = { ...current, done: current.done + 1, failed: current.failed + (ok ? 0 : 1) };
    setState(current);
  }
  if (outcome === "done" && streak >= FAIL_LIMIT) outcome = "paused";
  setState({ ...current, running: false, outcome });
  return outcome;
}

/** Lance la génération et annonce son résultat. */
export async function preparePiperPhrases(
  plan: PiperPrepPlan,
  t: (key: string, opts?: Record<string, unknown>) => string,
): Promise<void> {
  const outcome = await runPiperPrep(plan);
  const { done, failed } = state;
  if (outcome === "done" && failed === 0) toastSuccess(t("config.piperPrepDone", { n: done }));
  else if (outcome === "done" || outcome === "paused") toastError(t("config.piperPrepFailed", { n: failed }));
  else if (outcome === "changed") toastError(t("config.piperPrepChanged"));
}
