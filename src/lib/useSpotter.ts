/**
 * Spotter — Couches 1 & 2 (raccourcis globaux).
 *
 * **Couche 1** : raccourcis « one-shot » Statut / Mute / Répète → réponse parlée
 * immédiate via la voix Piper.
 *
 * **Couche 2 (push-to-talk)** : on **maintient** une touche, on pose une question
 * parlée (« écart ? », « carburant ? »…), au relâchement le micro est capté,
 * downsamplé puis envoyé à Vosk (`stt_recognize`) avec la **grammaire fermée** de
 * la langue. Le texte reconnu est mappé sur une intention → réponse construite
 * depuis les données Live (`buildAnswer`). Reco vide / échec → repli **Statut**.
 *
 * Monté une seule fois au niveau de l'app (App.tsx) pour rester actif quelle que
 * soit la page. Les raccourcis ne sont enregistrés que si l'option est activée.
 */

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/stores/app";
import { isTauri, live } from "@/lib/api";
import { announce, repeatLast, cancelSpeech } from "@/lib/voice";
import { buildStatus, buildAnswer } from "@/lib/spotter";
import { buildGrammar, matchIntent } from "@/lib/spotterCommands";
import { startCapture, stopCapture, pcmToBase64 } from "@/lib/mic";

export function useSpotter() {
  const { t, i18n } = useTranslation();
  const enabled = useAppStore((s) => s.spotterEnabled);
  const keyStatus = useAppStore((s) => s.spotterKeyStatus);
  const keyMute = useAppStore((s) => s.spotterKeyMute);
  const keyRepeat = useAppStore((s) => s.spotterKeyRepeat);
  const keyTalk = useAppStore((s) => s.spotterKeyTalk);
  const pttMode = useAppStore((s) => s.spotterPttMode);

  // Refs « vivantes » : les handlers sont enregistrés une seule fois mais doivent
  // lire la langue / les traductions courantes sans réenregistrer les raccourcis.
  const tRef = useRef(t);
  const langRef = useRef(i18n.language);
  tRef.current = t;
  langRef.current = i18n.language;
  // Capture micro en cours (push-to-talk) — évite double start / release orphelin.
  const capturing = useRef(false);
  // Anti-rebond du mode toggle (l'OS peut ré-émettre « Pressed » si la touche est tenue).
  const lastToggle = useRef(0);

  useEffect(() => {
    if (!enabled || !isTauri()) return;
    let disposed = false;

    const onStatus = async () => {
      const tt = tRef.current;
      const lang = langRef.current;
      try {
        const data = await live.getData();
        announce(buildStatus(data, tt), lang);
      } catch {
        announce(tt("live.spNoSession"), lang);
      }
    };
    const onMute = () => {
      const tt = tRef.current;
      const lang = langRef.current;
      const next = !useAppStore.getState().voiceAnnouncements;
      void useAppStore.getState().setVoiceAnnouncements(next);
      // À la coupure : silence immédiat (le silence EST la confirmation, et sur
      // la page Live `useVoiceCallouts` re-coupe de toute façon à la désactivation).
      // À la réactivation : confirmation parlée (qui survit, pas de cancel).
      if (next) announce(tt("live.spUnmuted"), lang);
      else cancelSpeech();
    };
    const onRepeat = () => {
      if (!repeatLast()) onStatus(); // rien à répéter → repli sur le statut
    };

    // Push-to-talk : début de capture (touche enfoncée).
    const onTalkStart = async () => {
      if (capturing.current) return;
      capturing.current = true;
      try {
        await startCapture();
      } catch {
        // Micro indisponible / refusé → on annule, le relâchement fera le repli.
        capturing.current = false;
      }
    };
    // Push-to-talk : fin de capture (touche relâchée) → reconnaissance + réponse.
    const onTalkEnd = async () => {
      if (!capturing.current) return;
      capturing.current = false;
      const tt = tRef.current;
      const lang = langRef.current;
      const pcm = stopCapture();
      let data = null;
      try {
        data = await live.getData();
      } catch {
        /* pas de session → repli statut plus bas */
      }
      // Pas d'audio capté → repli direct sur le statut.
      if (pcm.length === 0) {
        announce(buildStatus(data, tt), lang);
        return;
      }
      try {
        const text = await invoke<string>("stt_recognize", {
          pcmBase64: pcmToBase64(pcm),
          lang,
          grammar: buildGrammar(lang),
        });
        const intent = matchIntent(text, lang);
        if (intent === "repeat") {
          if (!repeatLast()) announce(buildStatus(data, tt), lang);
        } else if (intent === "mute") {
          onMute();
        } else if (intent) {
          announce(buildAnswer(intent, data, tt), lang);
        } else {
          // Commande non reconnue → repli statut (filet de sécurité §7 SUIVI).
          announce(buildStatus(data, tt), lang);
        }
      } catch {
        announce(buildStatus(data, tt), lang);
      }
    };

    // accel → handler « Pressed » (un même accélérateur en double est écrasé).
    const pressMap: Record<string, () => void> = {};
    if (keyStatus) pressMap[keyStatus] = onStatus;
    if (keyMute) pressMap[keyMute] = onMute;
    if (keyRepeat) pressMap[keyRepeat] = onRepeat;
    // Le push-to-talk écoute les DEUX états (enfoncé → capture, relâché → reco).
    const accels = [...Object.keys(pressMap)];
    if (keyTalk && !accels.includes(keyTalk)) accels.push(keyTalk);

    (async () => {
      const gs = await import("@tauri-apps/plugin-global-shortcut");
      for (const accel of accels) {
        try {
          // Libère le raccourci s'il traîne d'un montage précédent (HMR, etc.).
          if (await gs.isRegistered(accel)) await gs.unregister(accel);
          await gs.register(accel, (e) => {
            if (disposed) return;
            if (accel === keyTalk) {
              if (pttMode === "toggle") {
                // Toggle : un appui démarre, l'appui suivant arrête (Released ignoré).
                if (e.state === "Pressed") {
                  const now = Date.now();
                  if (now - lastToggle.current < 500) return; // anti auto-répétition
                  lastToggle.current = now;
                  if (capturing.current) void onTalkEnd();
                  else void onTalkStart();
                }
              } else {
                // Hold : capture tant que la touche est maintenue.
                if (e.state === "Pressed") void onTalkStart();
                else if (e.state === "Released") void onTalkEnd();
              }
              return;
            }
            if (e.state === "Pressed") pressMap[accel]?.();
          });
        } catch {
          /* accélérateur invalide ou déjà pris par une autre application */
        }
      }
    })();

    return () => {
      disposed = true;
      if (capturing.current) {
        stopCapture(); // libère le micro si on démonte pendant une capture
        capturing.current = false;
      }
      void (async () => {
        try {
          const gs = await import("@tauri-apps/plugin-global-shortcut");
          for (const accel of accels) {
            try {
              await gs.unregister(accel);
            } catch {
              /* déjà libéré */
            }
          }
        } catch {
          /* hors Tauri */
        }
      })();
    };
  }, [enabled, keyStatus, keyMute, keyRepeat, keyTalk, pttMode]);
}
