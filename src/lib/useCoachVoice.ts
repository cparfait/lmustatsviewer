/**
 * Coach IA vocal — push-to-talk global (le « vrai » coach live, mains libres).
 *
 * On **maintient** une touche (configurable, défaut `Alt+C`), on pose une
 * question libre (« je dois pit ? », « mes pneus tiennent ? »…). Au relâchement :
 * micro → STT **dictée libre** (`stt_recognize_free`, Vosk, modèle téléchargé) →
 * snapshot live (`live.getData` → `buildLiveContext`) → réponse **courte** du LLM
 * (`askCoachVoice`) lue à voix haute. Aucun écran/clavier requis.
 *
 * Monté une seule fois (App.tsx), à côté de `useSpotter`. Indépendant du spotter
 * déterministe : actif dès que le Coach IA est configuré.
 */

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useAppStore } from "@/stores/app";
import { isTauri, live } from "@/lib/api";
import { announce } from "@/lib/voice";
import { startCapture, stopCapture, pcmToBase64 } from "@/lib/mic";
import { getProvider } from "@/lib/ai/providers";
import { askCoachVoice, friendlyError } from "@/lib/ai/coach";
import { buildLiveCoachContext } from "@/lib/ai/context/records-context";
import { coachRecentDiagnostics, type RecentDiag } from "@/lib/coach";
import { toast, toastSuccess } from "@/stores/dialogs";

/** Retire un markdown léger pour la lecture vocale. */
function stripMd(s: string): string {
  return s
    .replace(/[*_`#>]/g, "")
    .replace(/\n{2,}/g, ". ")
    .trim();
}

/** Formule un diagnostic récent en une ligne neutre (matière du « pourquoi ? », §12). */
function diagLine(d: RecentDiag): string {
  const m = Math.round(d.magnitude);
  const t = `T${d.n}`;
  switch (d.code) {
    case "lockup":
      return `${t}: brake lockup on entry`;
    case "wheelspin":
      return `${t}: wheelspin on exit`;
    case "consistency":
      return `${t}: inconsistent braking point`;
    case "brake-timing":
      return d.sign >= 0 ? `${t}: braking ${m} m too late` : `${t}: braking ${m} m too early`;
    case "over-slow":
      return `${t}: ${m} km/h too slow at apex`;
    case "entry-too-fast":
      return `${t}: entering too fast, exit compromised`;
    case "late-throttle":
      return `${t}: ${m} m late back to full throttle`;
    case "grip-unused":
      return `${t}: available grip not fully used`;
    case "no-trail":
      return `${t}: brake released too early (no trail braking)`;
    default:
      return `${t}: ${d.code}`;
  }
}

/**
 * Bloc de contexte « coaching récent par virage » injecté avant l'appel LLM (§12) :
 * permet de répondre à un « pourquoi ? » posé après un callout, à partir des N
 * derniers diagnostics chiffrés du coach par virage. Vide si aucun.
 */
function recentDiagnosticsBlock(): string {
  const diags = coachRecentDiagnostics();
  if (diags.length === 0) return "";
  const lines = diags.map((d) => `- ${diagLine(d)} (lap ${d.lapNum})`).join("\n");
  return `--- Recent per-corner coaching (oldest first; use it to answer "why?") ---\n${lines}`;
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
        // Affiche la question reconnue (Axe 5) → l'utilisateur voit si la dictée
        // a mal compris. Toast (fenêtre principale) + event vers l'overlay in-game.
        const q = question.trim();
        toast(`🎤 ${q}`);
        void emit("coach-voice", { question: q, answer: null });
        const data = await live.getData();
        const baseCtx = await buildLiveCoachContext(data, question);
        // « Pourquoi ? » (§12) : joint les derniers diagnostics par virage au
        // contexte → le LLM peut expliquer un callout avec ses chiffres exacts.
        const recent = recentDiagnosticsBlock();
        const ctx = recent ? `${baseCtx}\n\n${recent}` : baseCtx;
        const st = useAppStore.getState();
        // Coach vocal : fournisseur DISTINCT si configuré, sinon celui de
        // l'analyse. Avec un fournisseur distinct → sa propre clé + son modèle ;
        // sinon modèle vocal (rapide) si défini, à défaut le modèle d'analyse.
        const separateVoice = st.aiVoiceProvider !== "";
        const p = getProvider(separateVoice ? st.aiVoiceProvider : st.aiProvider);
        if (!p) return;
        const answer = await askCoachVoice({
          provider: p,
          model: separateVoice ? st.aiVoiceModel : st.aiVoiceModel || st.aiModel,
          apiKey: separateVoice ? st.aiVoiceApiKey : st.aiApiKey,
          lang,
          question,
          contextText: ctx,
          systemOverride:
            useAppStore.getState().aiSystemPromptByLang[
              lang.slice(0, 2).toLowerCase()
            ] ?? "",
        });
        if (!disposed && answer.trim()) {
          const clean = stripMd(answer);
          announce(clean, lang);
          toastSuccess(clean); // Axe 5 : la réponse reste lisible à l'écran.
          void emit("coach-voice", { question: q, answer: clean }); // overlay
        }
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
