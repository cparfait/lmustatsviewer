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
import { emit, listen } from "@tauri-apps/api/event";
import { useAppStore } from "@/stores/app";
import { isTauri, live } from "@/lib/api";
import { effectivePitLoss } from "@/lib/lmuRest";
import { announce, cancelSpeech, repeatLast, setDriverTalking } from "@/lib/voice";
import { startCapture, stopCapture, pcmToBase64 } from "@/lib/mic";
import { pttBeep } from "@/lib/radioFx";
import { getProvider } from "@/lib/ai/providers";
import { askCoachVoice, classifyIntent, friendlyError } from "@/lib/ai/coach";
import { buildStatus } from "@/lib/spotter";
import { route, INTENT_HELP, RADIO_COMMANDS, type AnswerIntent } from "@/lib/engineer/router";
import { answerIntent, registerWatch } from "@/lib/engineer/answers";
import { factsBlock } from "@/lib/ai/facts";
import { radioCard } from "@/lib/ai/knowledge/engineering-cards";
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
  const pttWheel = useAppStore((s) => s.pttWheel);
  const micReady = useAppStore((s) => s.micReady);
  const wakeOn = useAppStore((s) => s.wakeWordEnabled);
  const wakeWord = useAppStore((s) => s.wakeWord);
  const lang = i18n.language;
  // La touche écoute dès qu'elle est définie. La configuration IA (activation,
  // fournisseur, modèle, clé) est relue au moment d'une question ouverte
  // (`aiReady`) : aucun abonnement nécessaire.

  const tRef = useRef(t);
  const langRef = useRef(i18n.language);
  tRef.current = t;
  langRef.current = i18n.language;
  const capturing = useRef(false);
  /** La capture en cours passe par le moteur natif (sinon : capture navigateur). */
  const viaEngine = useRef(false);
  const busy = useRef(false);
  const lastToggle = useRef(0);
  const pttModeRef = useRef(pttMode);
  pttModeRef.current = pttMode;

  // ── Moteur d'écoute natif : micro prêt (pré-enregistrement) et/ou mot ──────
  useEffect(() => {
    if (!isTauri()) return;
    if (!micReady && !wakeOn) {
      invoke("voice_input_stop").catch(() => {});
      return;
    }
    const word = wakeOn ? wakeWord.trim() || t("live.wakeWordDefault") : null;
    invoke("voice_input_start", { lang, wakeWord: word }).catch((e) => {
      // Micro indisponible : la touche retombe sur la capture à l'appui.
      toast(`${t("config.micEngineError")} ${String(e)}`);
    });
  }, [micReady, wakeOn, wakeWord, lang, t]);
  useEffect(
    () => () => {
      if (isTauri()) invoke("voice_input_stop").catch(() => {});
    },
    [],
  );

  // ── Bouton de volant : surveillance en arrière-plan (côté Rust) ────────────
  useEffect(() => {
    if (!isTauri()) return;
    invoke("wheel_watch", { binding: pttWheel }).catch(() => {
      /* lecture des boutons indisponible : la touche reste utilisable */
    });
    return () => {
      invoke("wheel_watch", { binding: null }).catch(() => {});
    };
  }, [pttWheel]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;

    /**
     * Une question dictée (touche, bouton de volant ou mot déclencheur) :
     * routeur local d'abord, l'IA seulement pour une question ouverte.
     */
    const answerQuestion = async (question: string) => {
      const tt = tRef.current;
      const lang = langRef.current;
      busy.current = true;
      try {
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
          pitLossSec: effectivePitLoss(data, st0.pitLossSeconds, st0.pitLaneLoss),
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
        // Commandes (accusé, rester dehors, annuler les alertes, régimes radio) :
        // toujours locales, l'IA ne sait pas les exécuter. Questions factuelles :
        // locales si le réglage est actif (défaut), sinon l'IA répond comme avant.
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
          // Question ouverte : une fiche de savoir sûre suffit parfois (sous-virage,
          // pluie, pneus froids…) ; les fiches incertaines ne sont jamais dites.
          const card = radioCard(r.norm, lang);
          if (card) {
            sayLocal(card);
            return;
          }
          // Sinon : seul le Coach IA saurait y répondre.
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
        // Faits calculés par l'app : seule source des chiffres de la réponse (les
        // fiches de savoir sont déjà jointes par `buildLiveCoachContext`).
        const facts = factsBlock(r.candidates, data, tt, opts);
        const ctx = [baseCtx, facts, recent].filter(Boolean).join("\n\n");
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

    const onStart = async () => {
      if (capturing.current || busy.current) return;
      capturing.current = true;
      try {
        // Moteur natif prêt : la capture reprend les 0,5 s d'avant l'appui
        // (premier mot jamais coupé) ; sinon capture navigateur, comme avant.
        viaEngine.current = await invoke<boolean>("ptt_begin", {
          autoSend: pttModeRef.current === "toggle",
        }).catch(() => false);
        if (viaEngine.current) setDriverTalking(true);
        else await startCapture();
        if (useAppStore.getState().pttBeeps) pttBeep("open");
      } catch {
        capturing.current = false;
      }
    };

    const onEnd = async () => {
      if (!capturing.current) return;
      capturing.current = false;
      const lang = langRef.current;
      if (useAppStore.getState().pttBeeps) pttBeep("send");
      let question: string;
      try {
        if (viaEngine.current) {
          setDriverTalking(false);
          const text = await invoke<string | null>("ptt_end", { lang });
          if (text == null) return;
          question = text;
        } else {
          const pcm = stopCapture();
          if (pcm.length === 0) return;
          question = await invoke<string>("stt_recognize_free", { pcmBase64: pcmToBase64(pcm), lang });
        }
      } catch (e) {
        announce(friendlyError(e, tRef.current), lang);
        return;
      }
      await answerQuestion(question);
    };

    /** Appui / relâchement (touche ou bouton de volant), selon le mode. */
    const onPress = (pressed: boolean) => {
      if (disposed) return;
      if (pttModeRef.current === "toggle") {
        if (!pressed) return;
        const now = Date.now();
        if (now - lastToggle.current < 500) return;
        lastToggle.current = now;
        if (capturing.current) void onEnd();
        else void onStart();
      } else if (pressed) void onStart();
      else void onEnd();
    };

    const offs: Promise<() => void>[] = [
      // Bouton de volant (lu en arrière-plan côté Rust).
      listen<{ pressed: boolean }>("ptt-wheel", (e) => onPress(!!e.payload?.pressed)),
      // Mode bascule : la phrase est finie (silence) → envoi automatique.
      listen("ptt-silence", () => {
        if (capturing.current && viaEngine.current) void onEnd();
      }),
      // Mot déclencheur (bêta) : bip d'ouverture, la radio se tait…
      listen("wake-word", () => {
        if (disposed || capturing.current || busy.current) return;
        setDriverTalking(true);
        if (useAppStore.getState().pttBeeps) pttBeep("open");
      }),
      // … puis la phrase dictée arrive (mot retiré).
      listen<{ text: string }>("wake-utterance", (e) => {
        if (disposed) return;
        setDriverTalking(false);
        if (busy.current || capturing.current) return;
        if (useAppStore.getState().pttBeeps) pttBeep("send");
        void answerQuestion(e.payload?.text ?? "");
      }),
      listen("wake-timeout", () => setDriverTalking(false)),
    ];

    if (keyCoach) {
      (async () => {
        const gs = await import("@tauri-apps/plugin-global-shortcut");
        try {
          if (await gs.isRegistered(keyCoach)) await gs.unregister(keyCoach);
          await gs.register(keyCoach, (e) => {
            if (e.state === "Pressed") onPress(true);
            else if (e.state === "Released") onPress(false);
          });
        } catch {
          /* accélérateur invalide / déjà pris */
        }
      })();
    }

    return () => {
      disposed = true;
      for (const off of offs) void off.then((f) => f()).catch(() => {});
      if (capturing.current) {
        if (viaEngine.current) {
          invoke("ptt_cancel").catch(() => {});
          setDriverTalking(false);
        } else stopCapture();
        capturing.current = false;
      }
      if (keyCoach) {
        void (async () => {
          try {
            const gs = await import("@tauri-apps/plugin-global-shortcut");
            await gs.unregister(keyCoach);
          } catch {
            /* déjà libéré / hors Tauri */
          }
        })();
      }
    };
  }, [keyCoach]);
}
