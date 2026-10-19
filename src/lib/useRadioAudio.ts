/**
 * Audio de la radio, monté une fois au niveau de l'app (App.tsx) :
 *
 *  - **sortie audio** : la radio va sur le périphérique choisi (Configuration),
 *    retrouvé par son libellé (les identifiants changent d'un démarrage à l'autre) ;
 *  - **son du jeu baissé** (opt-in) pendant que l'ingénieur parle et pendant que le
 *    pilote parle (push-to-talk), rendu après un court délai ;
 *  - **sous-titres** : chaque annonce entendue est diffusée (`radio-subtitle`) au
 *    widget d'overlay « Radio » ;
 *  - **boutons du volant** liés à une action (sourdine, répète, volume…) ;
 *  - **cohabitation** : détection d'un autre ingénieur radio lancé.
 */

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { emit, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { gameAudio, isTauri, live } from "@/lib/api";
import { useAppStore } from "@/stores/app";
import { announceAnswer, cancelSpeech, onDriverTalk, onSpeechEvent, repeatLast } from "@/lib/voice";
import { setOutputDevice } from "@/lib/radioFx";
import { buildStatus } from "@/lib/spotter";
import { engineer } from "@/lib/engineer/state";
import { WHEEL_ACTIONS } from "@/lib/radioSettings";
import { toast } from "@/stores/dialogs";

/** Délai avant de rendre le son du jeu après la dernière phrase (ms). */
const UNDUCK_DELAY_MS = 450;
/** Pas de volume des boutons du volant. */
const VOLUME_STEP = 0.1;

/** Charge d'un sous-titre radio (widget « Radio »). */
export interface RadioSubtitle {
  text: string;
  priority: string;
  at: number;
}

/** Sorties audio connues du navigateur intégré (libellés lisibles si possible). */
export async function listOutputDevices(): Promise<{ id: string; label: string }[]> {
  const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  if (!md?.enumerateDevices) return [];
  let devices = (await md.enumerateDevices()).filter((d) => d.kind === "audiooutput");
  // Sans autorisation micro, les libellés sont vides : une demande brève les
  // débloque (le flux est fermé aussitôt).
  if (devices.length && devices.every((d) => !d.label) && md.getUserMedia) {
    try {
      const s = await md.getUserMedia({ audio: true });
      s.getTracks().forEach((tr) => tr.stop());
      devices = (await md.enumerateDevices()).filter((d) => d.kind === "audiooutput");
    } catch {
      /* refusé : libellés génériques */
    }
  }
  return devices
    .filter((d) => d.deviceId !== "default" && d.deviceId !== "communications")
    .map((d, i) => ({ id: d.deviceId, label: d.label || `#${i + 1}` }));
}

/** Applique la sortie choisie (par libellé) ; `false` si elle est introuvable. */
export async function applyOutputDevice(label: string): Promise<boolean> {
  if (!label) {
    await setOutputDevice("");
    return true;
  }
  const dev = (await listOutputDevices()).find((d) => d.label === label);
  if (!dev) {
    await setOutputDevice("");
    return false;
  }
  return setOutputDevice(dev.id);
}

export function useRadioAudio(): void {
  const { t, i18n } = useTranslation();
  const tRef = useRef(t);
  const langRef = useRef(i18n.language);
  tRef.current = t;
  langRef.current = i18n.language;
  const outputDevice = useAppStore((s) => s.radioOutputDevice);
  const ducking = useAppStore((s) => s.gameDucking);
  const duckLevel = useAppStore((s) => s.gameDuckLevel);
  const wheelActions = useAppStore((s) => s.wheelActions);
  const coexist = useAppStore((s) => s.coexistMode);

  // Sortie audio.
  useEffect(() => {
    void applyOutputDevice(outputDevice).then((ok) => {
      if (!ok && outputDevice) toast(tRef.current("config.radioOutputMissing", { name: outputDevice }));
    });
  }, [outputDevice]);

  // Sous-titres : toujours diffusés (le widget est l'opt-in).
  useEffect(() => {
    if (!isTauri()) return;
    return onSpeechEvent((e) => {
      if (e.type !== "start") return;
      const sub: RadioSubtitle = { text: e.text, priority: e.priority, at: Date.now() };
      void emit("radio-subtitle", sub);
    });
  }, []);

  // Son du jeu baissé pendant la radio et pendant que le pilote parle.
  useEffect(() => {
    if (!isTauri() || !ducking) return;
    let speaking = 0;
    let talking = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sync = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (speaking > 0 || talking) {
        void gameAudio.duck(duckLevel).catch(() => {});
      } else {
        timer = setTimeout(() => void gameAudio.unduck().catch(() => {}), UNDUCK_DELAY_MS);
      }
    };
    const offSpeech = onSpeechEvent((e) => {
      speaking = Math.max(0, speaking + (e.type === "start" ? 1 : -1));
      sync();
    });
    const offTalk = onDriverTalk((on) => {
      talking = on;
      sync();
    });
    return () => {
      offSpeech();
      offTalk();
      if (timer) clearTimeout(timer);
      void gameAudio.unduck().catch(() => {});
    };
  }, [ducking, duckLevel]);

  // Boutons du volant liés à une action.
  useEffect(() => {
    if (!isTauri()) return;
    const bindings = WHEEL_ACTIONS.filter((a) => wheelActions[a]).map((a) => [a, wheelActions[a]!] as const);
    void invoke("wheel_watch_actions", { bindings }).catch(() => {});
    let off: (() => void) | null = null;
    let disposed = false;
    void listen<{ action: string; pressed: boolean }>("wheel-action", (ev) => {
      if (!ev.payload.pressed) {
        if (ev.payload.action === "voiceNote") void emit("voice-note-ptt", { pressed: false });
        return;
      }
      void runWheelAction(ev.payload.action, tRef.current, langRef.current);
    }).then((fn) => {
      if (disposed) fn();
      else off = fn;
    });
    return () => {
      disposed = true;
      off?.();
      void invoke("wheel_watch_actions", { bindings: [] }).catch(() => {});
    };
  }, [wheelActions]);

  // Cohabitation : un autre ingénieur radio tourne-t-il ? (toutes les 10 s)
  useEffect(() => {
    if (!isTauri() || !coexist) {
      engineer.otherEngineer = false;
      return;
    }
    const check = () =>
      void invoke<boolean>("other_engineer_running")
        .then((on) => {
          engineer.otherEngineer = on;
        })
        .catch(() => {});
    check();
    const id = setInterval(check, 10_000);
    return () => {
      clearInterval(id);
      engineer.otherEngineer = false;
    };
  }, [coexist]);
}

/** Exécute l'action d'un bouton du volant. */
async function runWheelAction(action: string, t: ReturnType<typeof useTranslation>["t"], lang: string) {
  const st = useAppStore.getState();
  switch (action) {
    case "mute": {
      const next = !st.voiceAnnouncements;
      await st.setVoiceAnnouncements(next);
      if (next) announceAnswer(t("live.spUnmuted"), lang);
      else cancelSpeech();
      return;
    }
    case "repeat":
      if (!repeatLast()) announceAnswer(buildStatus(await live.getData().catch(() => null), t, st.classPositions), lang);
      return;
    case "status":
      announceAnswer(buildStatus(await live.getData().catch(() => null), t, st.classPositions), lang);
      return;
    case "volumeUp":
    case "volumeDown": {
      const v = Math.round((st.voiceVolume + (action === "volumeUp" ? VOLUME_STEP : -VOLUME_STEP)) * 100) / 100;
      await st.setVoiceVolume(v);
      announceAnswer(t("live.spVolume", { pct: Math.round(useAppStore.getState().voiceVolume * 100) }), lang);
      return;
    }
    case "spotter": {
      const next = !st.proximitySpotter;
      await st.setProximitySpotter(next);
      announceAnswer(t(next ? "live.spSpotterOn" : "live.spSpotterOff"), lang);
      return;
    }
    case "ackBox": {
      const d = await live.getData().catch(() => null);
      if (d?.player) engineer.pit.ack(d.player.total_laps);
      announceAnswer(t("live.spAck"), lang);
      return;
    }
    case "voiceNote":
      void emit("voice-note-ptt", { pressed: true });
      return;
  }
}
