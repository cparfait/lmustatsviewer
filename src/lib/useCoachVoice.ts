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
 * Monté une seule fois (App.tsx), à côté de `useSpotter`. Ingénieur et coach par
 * virage ne dépendent pas de l'IA, mais de la voix : sans annonces vocales, le
 * micro reste fermé et les touches restent libres (`voicePolicy.ts`).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "@/stores/app";
import { isTauri } from "@/lib/api";
import { announceAnswer, setDriverTalking } from "@/lib/voice";
import { notifyMicFallback, resetMicFallback, startCapture, stopCapture, pcmToBase64 } from "@/lib/mic";
import { pttBeep } from "@/lib/radioFx";
import { friendlyError } from "@/lib/ai/coach";
import { askEngineer, radioLine } from "@/lib/engineer/ask";
import { buildGrammar } from "@/lib/spotterCommands";
import { createOnceGate, micEngineWanted, pttKeysWanted } from "@/lib/voicePolicy";
import { toast, toastError } from "@/stores/dialogs";

/** Micro permanent impossible à ouvrir : dit une fois par micro choisi, pas à chaque essai. */
const micErrorGate = createOnceGate();
/** Délai entre deux essais d'ouverture du micro permanent après un échec (ms). */
const MIC_RETRY_MS = 15_000;
/** Modèle vocal absent pour le mot déclencheur : dit une fois par langue. */
const wakeModelGate = createOnceGate();

export function useCoachVoice() {
  const { t, i18n } = useTranslation();
  const keyCoach = useAppStore((s) => s.spotterKeyCoach);
  const keyTalk = useAppStore((s) => s.spotterKeyTalk);
  const pttMode = useAppStore((s) => s.spotterPttMode);
  const pttWheel = useAppStore((s) => s.pttWheel);
  const voiceOn = useAppStore((s) => s.voiceAnnouncements);
  const micReady = useAppStore((s) => s.micReady);
  const wakeOn = useAppStore((s) => s.wakeWordEnabled);
  const wakeWord = useAppStore((s) => s.wakeWord);
  const micDevice = useAppStore((s) => s.micDevice);
  const lang = i18n.language;
  // La configuration IA (activation, fournisseur, modèle, clé) est relue au moment
  // d'une question ouverte (`aiReady`) : aucun abonnement nécessaire.

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
  /** Appui / relâchement, branché par l'effet des événements, lu par les raccourcis. */
  const onPressRef = useRef<((pressed: boolean) => void) | null>(null);
  /** La voix a été allumée pendant cette session (cf. `pttKeysWanted`). */
  const voiceSeen = useRef(false);
  voiceSeen.current ||= voiceOn;
  const keysOn = pttKeysWanted(voiceOn, voiceSeen.current);
  const engineOn = micEngineWanted({ voice: voiceOn, micReady, wakeOn });
  /** Échec d'ouverture du micro permanent : relance l'effet du moteur après un délai. */
  const [micRetry, setMicRetry] = useState(0);
  const micFailed = useRef(false);

  // Abandonne la capture en cours (rien n'est dicté).
  const cancelCapture = useCallback(() => {
    if (!capturing.current) return;
    if (viaEngine.current) {
      invoke("ptt_cancel").catch(() => {});
      setDriverTalking(false);
    } else stopCapture();
    capturing.current = false;
  }, []);

  // Événements du moteur : abonnés avant son démarrage (effet suivant), pour ne
  // pas manquer une erreur émise juste après l'ouverture du micro.
  useEffect(() => {
    if (!isTauri()) return;
    const offs = [
      // Micro perdu en cours de route (débranché) : le moteur rouvre seul, on prévient.
      listen<{ kind: string; name: string; wanted: string }>("voice-input-device", (e) => {
        const { kind, name, wanted } = e.payload ?? { kind: "", name: "", wanted: "" };
        const tt = tRef.current;
        if (kind === "none") toast(tt("config.micDeviceNone"));
        else if (kind === "fallback") notifyMicFallback(wanted, name);
        else if (kind === "reconnected") {
          resetMicFallback();
          toast(tt("config.micDeviceReconnected", { name }));
        }
      }),
      // Mot déclencheur sans modèle vocal : la touche marche, mais le mot resterait muet.
      listen("voice-input-error", () => {
        if (wakeModelGate.pass(langRef.current)) toast(tRef.current("config.wakeWordModelMissing"));
      }),
    ];
    return () => {
      for (const off of offs) void off.then((f) => f()).catch(() => {});
    };
  }, []);

  // ── Moteur d'écoute natif : micro prêt (pré-enregistrement) et/ou mot ──────
  useEffect(() => {
    if (!isTauri()) return;
    if (!engineOn) {
      invoke("voice_input_stop").catch(() => {});
      return;
    }
    const word = wakeOn ? wakeWord.trim() || t("live.wakeWordDefault") : null;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Changer de micro relance le moteur à chaud (clé différente côté Rust).
    invoke<{ name: string; fallback: boolean; restarted: boolean }>("voice_input_start", {
      lang,
      wakeWord: word,
      device: micDevice || null,
    })
      .then((r) => {
        // Micro branché après un échec : on dit qu'il est revenu.
        if (micFailed.current && alive) toast(t("config.micDeviceReconnected", { name: r.name }));
        micFailed.current = false;
        micErrorGate.reset();
        if (r.fallback) notifyMicFallback(micDevice, r.name);
        else resetMicFallback();
      })
      .catch(() => {
        // Micro indisponible : la touche retombe sur la capture à l'appui. Le
        // détail (non traduit) va au journal, côté Rust.
        micFailed.current = true;
        if (micErrorGate.pass(micDevice)) toast(t("config.micEngineError"));
        // Nouvel essai discret : le micro peut être branché plus tard.
        if (alive) timer = setTimeout(() => setMicRetry((n) => n + 1), MIC_RETRY_MS);
      });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [engineOn, wakeOn, wakeWord, micDevice, lang, t, micRetry]);
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
    /**
     * Une prise de parole (touche, bouton de volant, mot déclencheur) : logique
     * commune `askEngineer` (local d'abord, liste des commandes, puis IA).
     * `strict` = lecture stricte de la même capture (liste des commandes).
     */
    const answerQuestion = async (question: string, strict?: string, confidence?: number | null) => {
      busy.current = true;
      try {
        await askEngineer(question, {
          lang: langRef.current,
          t: tRef.current,
          strict,
          confidence,
          disposed: () => disposed,
        });
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
      // Double lecture de la même capture : dictée libre + liste des commandes
      // (grammaire fermée, celle de la Config) ; `askEngineer` choisit.
      const grammar = buildGrammar(lang);
      let free = "";
      let strict = "";
      let confidence: number | null = null;
      try {
        if (viaEngine.current) {
          setDriverTalking(false);
          const res = await invoke<{ free: string; strict: string; confidence?: number | null } | null>(
            "ptt_end_dual",
            { lang, grammar },
          );
          if (res == null) return;
          free = res.free;
          strict = res.strict;
          confidence = res.confidence ?? null;
        } else {
          const pcm = stopCapture();
          if (pcm.length === 0) return;
          const pcmBase64 = pcmToBase64(pcm);
          free = await invoke<string>("stt_recognize_free", { pcmBase64, lang });
          strict = await invoke<string>("stt_recognize", { pcmBase64, lang, grammar }).catch(() => "");
        }
      } catch (e) {
        // Capture ou reconnaissance en échec : le détail à l'écran, « pas
        // compris » (court, à variantes) à la radio.
        toastError(friendlyError(e, tRef.current));
        announceAnswer(radioLine(tRef.current, "coach.voiceUnclear"), lang);
        return;
      }
      await answerQuestion(free, strict, confidence);
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
    onPressRef.current = onPress;

    return () => {
      disposed = true;
      onPressRef.current = null;
      for (const off of offs) void off.then((f) => f()).catch(() => {});
      cancelCapture();
    };
  }, [cancelCapture]);

  // Touche principale + seconde touche facultative (l'ancienne touche « Parler »
  // du spotter) : même prise de parole, même réponse. Effet séparé : prendre ou
  // rendre les touches ne doit pas interrompre une réponse en cours (« active le
  // son » dit au bouton de volant les fait revenir).
  useEffect(() => {
    if (!isTauri() || !keysOn) return;
    const keys = [...new Set([keyCoach, keyTalk].filter(Boolean))];
    if (!keys.length) return;
    let gone = false;
    void (async () => {
      const gs = await import("@tauri-apps/plugin-global-shortcut");
      for (const key of keys) {
        if (gone) return;
        try {
          if (await gs.isRegistered(key)) await gs.unregister(key);
          await gs.register(key, (e) => {
            if (e.state === "Pressed") onPressRef.current?.(true);
            else if (e.state === "Released") onPressRef.current?.(false);
          });
        } catch {
          /* accélérateur invalide / déjà pris */
        }
      }
    })();
    return () => {
      gone = true;
      // Touche changée pendant un appui : son relâchement n'arrivera jamais.
      cancelCapture();
      void (async () => {
        try {
          const gs = await import("@tauri-apps/plugin-global-shortcut");
          for (const key of keys) await gs.unregister(key).catch(() => {});
        } catch {
          /* déjà libéré / hors Tauri */
        }
      })();
    };
  }, [keysOn, keyCoach, keyTalk, cancelCapture]);
}
