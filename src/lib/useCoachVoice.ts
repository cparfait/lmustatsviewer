/**
 * Coach IA vocal — push-to-talk global (le « vrai » coach live, mains libres).
 *
 * On **maintient** une touche (configurable, défaut `Alt+C`), on pose une
 * question libre (« je dois pit ? », « mes pneus tiennent ? »…). Au relâchement :
 * micro → STT **dictée libre** (`stt_recognize_free`, Vosk, feature `stt`) →
 * snapshot live (`live.getData` → `buildLiveContext`) → réponse **courte** du LLM
 * (`askCoachVoice`) lue à voix haute. Aucun écran/clavier requis.
 *
 * Monté une seule fois (App.tsx), à côté de `useSpotter`. Indépendant du spotter
 * déterministe : actif dès que le Coach IA est configuré.
 */

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/stores/app";
import { isTauri, live } from "@/lib/api";
import { announce } from "@/lib/voice";
import { startCapture, stopCapture, pcmToBase64 } from "@/lib/mic";
import { getProvider } from "@/lib/ai/providers";
import { askCoachVoice, friendlyError } from "@/lib/ai/coach";
import { buildLiveContext } from "@/lib/ai/context/live-context";

/** Retire un markdown léger pour la lecture vocale. */
function stripMd(s: string): string {
  return s
    .replace(/[*_`#>]/g, "")
    .replace(/\n{2,}/g, ". ")
    .trim();
}

export function useCoachVoice() {
  const { t, i18n } = useTranslation();
  const aiCoachEnabled = useAppStore((s) => s.aiCoachEnabled);
  const aiProvider = useAppStore((s) => s.aiProvider);
  const aiModel = useAppStore((s) => s.aiModel);
  const aiApiKey = useAppStore((s) => s.aiApiKey);
  const keyCoach = useAppStore((s) => s.spotterKeyCoach);
  const pttMode = useAppStore((s) => s.spotterPttMode);

  const provider = getProvider(aiProvider);
  const needsKey = provider?.needsKey ?? true;
  const ready =
    aiCoachEnabled && !!provider && !!aiModel && (!needsKey || !!aiApiKey);

  const tRef = useRef(t);
  const langRef = useRef(i18n.language);
  tRef.current = t;
  langRef.current = i18n.language;
  const capturing = useRef(false);
  const busy = useRef(false);
  const lastToggle = useRef(0);

  useEffect(() => {
    if (!ready || !keyCoach || !isTauri()) return;
    let disposed = false;

    const onStart = async () => {
      if (capturing.current || busy.current) return;
      capturing.current = true;
      try {
        await startCapture();
      } catch {
        capturing.current = false;
      }
    };

    const onEnd = async () => {
      if (!capturing.current) return;
      capturing.current = false;
      const tt = tRef.current;
      const lang = langRef.current;
      const pcm = stopCapture();
      if (pcm.length === 0) return;
      busy.current = true;
      try {
        const question = await invoke<string>("stt_recognize_free", {
          pcmBase64: pcmToBase64(pcm),
          lang,
        });
        if (!question.trim()) {
          announce(tt("coach.voiceUnclear"), lang);
          return;
        }
        const data = await live.getData();
        const ctx = buildLiveContext(data);
        const p = getProvider(useAppStore.getState().aiProvider);
        if (!p) return;
        const answer = await askCoachVoice({
          provider: p,
          model: useAppStore.getState().aiModel,
          apiKey: useAppStore.getState().aiApiKey,
          lang,
          question,
          contextText: ctx,
          systemOverride:
            useAppStore.getState().aiSystemPromptByLang[
              lang.slice(0, 2).toLowerCase()
            ] ?? "",
        });
        if (!disposed && answer.trim()) announce(stripMd(answer), lang);
      } catch (e) {
        announce(friendlyError(e, tRef.current), langRef.current);
      } finally {
        busy.current = false;
      }
    };

    (async () => {
      const gs = await import("@tauri-apps/plugin-global-shortcut");
      try {
        if (await gs.isRegistered(keyCoach)) await gs.unregister(keyCoach);
        await gs.register(keyCoach, (e) => {
          if (disposed) return;
          if (pttMode === "toggle") {
            if (e.state === "Pressed") {
              const now = Date.now();
              if (now - lastToggle.current < 500) return;
              lastToggle.current = now;
              if (capturing.current) void onEnd();
              else void onStart();
            }
          } else {
            if (e.state === "Pressed") void onStart();
            else if (e.state === "Released") void onEnd();
          }
        });
      } catch {
        /* accélérateur invalide / déjà pris */
      }
    })();

    return () => {
      disposed = true;
      if (capturing.current) {
        stopCapture();
        capturing.current = false;
      }
      void (async () => {
        try {
          const gs = await import("@tauri-apps/plugin-global-shortcut");
          await gs.unregister(keyCoach);
        } catch {
          /* déjà libéré / hors Tauri */
        }
      })();
    };
  }, [ready, keyCoach, pttMode]);
}
