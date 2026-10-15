/**
 * « Parler à l'ingénieur » — push-to-talk global (mains libres).
 *
 * On **maintient** une touche (configurable, défaut `Alt+C`) et on parle. Au
 * relâchement : micro → STT **dictée libre** (`stt_recognize_free`, Vosk) →
 * routeur local. Les commandes radio (« on se bat », « juste l'essentiel »…),
 * les questions de course (écarts, carburant, arrêt…) et « coach-moi » sont
 * traitées **sur place, sans IA**. Seules les questions ouvertes partent au
 * **Coach IA** (LLM), s'il est activé et configuré ; sinon l'ingénieur le dit.
 *
 * Monté une seule fois (App.tsx), à côté de `useSpotter`. La touche écoute dès
 * qu'elle est définie : ingénieur et coach par virage ne dépendent pas de l'IA.
 */

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useAppStore } from "@/stores/app";
import { isTauri, live } from "@/lib/api";
import { announce, cancelSpeech, repeatLast } from "@/lib/voice";
import { startCapture, stopCapture, pcmToBase64 } from "@/lib/mic";
import { pttBeep } from "@/lib/radioFx";
import { getProvider } from "@/lib/ai/providers";
import { askCoachVoice, classifyIntent, friendlyError } from "@/lib/ai/coach";
import { buildStatus } from "@/lib/spotter";
import { route, INTENT_HELP, RADIO_COMMANDS, type AnswerIntent } from "@/lib/engineer/router";
import { answerIntent, registerWatch } from "@/lib/engineer/answers";
import { buildLiveCoachContext } from "@/lib/ai/context/records-context";
import { coachRecentDiagnostics, type RecentDiag } from "@/lib/coach";
import { toast, toastSuccess } from "@/stores/dialogs";

/**
 * Fournisseur / modèle / clé réellement utilisés par le coach **vocal**.
 *
 * Le vocal peut tourner sur un fournisseur DISTINCT de celui de l'analyse
 * (`aiVoiceProvider` non vide) : il faut alors sa propre clé et son propre
 * modèle, sans repli sur ceux de l'analyse — un modèle d'un fournisseur A n'est
 * pas valide chez B. Sinon on hérite du fournisseur d'analyse, avec le modèle
 * vocal (plus rapide) s'il est défini et le modèle d'analyse à défaut.
 *
 * Source unique : la garde de disponibilité (`ready`) et l'appel réel doivent
 * juger sur les **mêmes** identifiants, sinon le push-to-talk s'active alors que
 * l'appel partira avec un modèle vide.
 */
function resolveVoiceTarget(st: {
  aiProvider: string;
  aiModel: string;
  aiVoiceProvider: string;
  aiVoiceModel: string;
  aiProviderKeys: Record<string, string>;
}) {
  const separate = st.aiVoiceProvider !== "";
  const providerId = separate ? st.aiVoiceProvider : st.aiProvider;
  return {
    provider: getProvider(providerId),
    model: separate ? st.aiVoiceModel : st.aiVoiceModel || st.aiModel,
    // La clé est propre au fournisseur (plus de créneau analyse/vocal).
    apiKey: st.aiProviderKeys[providerId] ?? "",
  };
}

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
  const keyCoach = useAppStore((s) => s.spotterKeyCoach);
  const pttMode = useAppStore((s) => s.spotterPttMode);
  // La touche écoute dès qu'elle est définie. La configuration IA (activation,
  // fournisseur, modèle, clé) est relue au moment d'une question ouverte
  // (`aiReady`) : aucun abonnement nécessaire.

  const tRef = useRef(t);
  const langRef = useRef(i18n.language);
  tRef.current = t;
  langRef.current = i18n.language;
  const capturing = useRef(false);
  const busy = useRef(false);
  const lastToggle = useRef(0);

  useEffect(() => {
    if (!keyCoach || !isTauri()) return;
    let disposed = false;

    const onStart = async () => {
      if (capturing.current || busy.current) return;
      capturing.current = true;
      try {
        await startCapture();
        if (useAppStore.getState().pttBeeps) pttBeep("open");
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
      if (useAppStore.getState().pttBeeps) pttBeep("send");
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

        // ── Routage local d'abord (instantané, gratuit, chiffres exacts) ──
        // Une question factuelle reconnue est répondue en code ; l'IA n'est
        // appelée que pour une question ambiguë (elle choisit alors seulement
        // l'intention) ou ouverte (analyse, conseil).
        const st0 = useAppStore.getState();
        const r = route(q, lang);
        const opts = {
          pitLossSec: st0.pitLossSeconds,
          fuelReserveLaps: st0.fuelReserveLaps,
          classPositions: st0.classPositions,
          entities: r.entities,
          norm: r.norm,
        };
        const sayLocal = (text: string) => {
          if (disposed || !text) return;
          announce(text, lang);
          toastSuccess(text);
          void emit("coach-voice", { question: q, answer: text });
        };
        if (r.intent === "watch") {
          sayLocal(registerWatch(r.watch, r.entities, r.norm, data, tt));
          return;
        }
        if (r.intent === "repeat") {
          if (!repeatLast()) sayLocal(buildStatus(data, tt, useAppStore.getState().classPositions));
          return;
        }
        if (r.intent === "mute") {
          const next = !useAppStore.getState().voiceAnnouncements;
          void useAppStore.getState().setVoiceAnnouncements(next);
          if (next) announce(tt("live.spUnmuted"), lang);
          else cancelSpeech();
          return;
        }
        // Commandes (accusé, rester dehors, annuler les alertes) : toujours locales,
        // l'IA ne sait pas les exécuter. Questions factuelles : locales si le
        // réglage est actif (défaut), sinon l'IA répond comme avant.
        const control =
          r.intent === "ackBox" || r.intent === "stayOut" || r.intent === "watchCancel" || (!!r.intent && RADIO_COMMANDS.has(r.intent));
        const st = useAppStore.getState();
        const { provider: p, model, apiKey } = resolveVoiceTarget(st);
        const aiReady = st.aiCoachEnabled && !!p && !!model && (!p.needsKey || !!apiKey);
        // Sans Coach IA, toute intention reconnue est répondue en local (même si
        // le réglage « réponses sans IA » est coupé : il n'y a personne d'autre).
        if (r.intent && (control || st0.localAnswers || !aiReady)) {
          sayLocal(answerIntent(r.intent, data, tt, opts));
          return;
        }
        if (!aiReady || !p) {
          // Question ambiguë : la meilleure intention locale plutôt que rien.
          if (r.ambiguous && r.candidates.length) {
            sayLocal(answerIntent(r.candidates[0], data, tt, opts));
            return;
          }
          // Question ouverte : seul le Coach IA saurait y répondre.
          const configured = !!p && !!model && (!p.needsKey || !!apiKey);
          announce(tt(st.aiCoachEnabled && !configured ? "coach.voiceNotConfigured" : "coach.voiceNoAi"), lang);
          return;
        }
        // Accusé immédiat : l'appel IA prend 1 à 3 s, le pilote sait qu'on a entendu.
        announce(tt(`coach.voiceAck${1 + Math.floor(Math.random() * 3)}`), lang);

        if (st0.localAnswers && r.ambiguous && r.candidates.length) {
          const help: Record<string, string> = {};
          for (const id of r.candidates) if (INTENT_HELP[id]) help[id] = INTENT_HELP[id]!;
          const picked = await classifyIntent({ provider: p, model, apiKey, question: q, intents: help }).catch(
            () => null,
          );
          if (picked) {
            sayLocal(answerIntent(picked as AnswerIntent, data, tt, opts));
            return;
          }
        }

        const baseCtx = await buildLiveCoachContext(data, question);
        // « Pourquoi ? » (§12) : joint les derniers diagnostics par virage au
        // contexte → le LLM peut expliquer un callout avec ses chiffres exacts.
        const recent = recentDiagnosticsBlock();
        const ctx = recent ? `${baseCtx}\n\n${recent}` : baseCtx;
        // Cible IA relue à chaud plus haut (même résolution que la garde `ready`).
        const answer = await askCoachVoice({
          provider: p,
          model,
          apiKey,
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
  }, [keyCoach, pttMode]);
}
