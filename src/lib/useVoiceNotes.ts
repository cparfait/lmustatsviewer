/**
 * Notes vocales du pilote, par virage — enregistrées avec sa propre voix
 * (« freine au panneau 100 », « attention à la bosse ») et rejouées à
 * l'approche du virage, à chaque tour. Par circuit et par voiture.
 *
 * - **Virages** : détectés sur le tracé du circuit (`detectTrackCorners`, la même
 *   géométrie que les cartes), numérotés dans l'ordre du tour.
 * - **Enregistrer** : bouton du volant « Note vocale » maintenu (ou la commande
 *   « note pour ce virage », dont la phrase entière devient la note). La note va
 *   au prochain virage s'il est à moins de `NEXT_CORNER_M`, sinon au dernier passé.
 * - **Rejouer** : environ 3 s avant le virage, si la radio est libre.
 */

import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { TFunction } from "i18next";
import { isTauri, voiceNotes, type LiveData } from "@/lib/api";
import { useAppStore } from "@/stores/app";
import { announceAnswer, isSpeaking, setDriverTalking } from "@/lib/voice";
import { audioContext, audioOutput } from "@/lib/radioFx";
import { detectTrackCorners } from "@/lib/trackCorners";
import { aheadDist } from "@/lib/engineer/pitTraffic";

/** Une note va au prochain virage s'il est à moins de cette distance (m). */
export const NEXT_CORNER_M = 400;
/** Anticipation de la lecture (s avant le virage), bornée en distance. */
const LEAD_S = 3;
const LEAD_MIN_M = 120;
const LEAD_MAX_M = 450;

/** Virages du tracé (distances-tour triées). */
export function cornerDists(data: LiveData): number[] {
  return detectTrackCorners(data.track_points, data.track_dists)
    .map((c) => c.dist)
    .sort((a, b) => a - b);
}

/**
 * Virage auquel rattacher une note : le prochain s'il est proche, sinon le
 * dernier passé. Renvoie le numéro (1-based) ou null.
 */
export function cornerForNote(corners: number[], lapDist: number, lapLen: number): number | null {
  if (!corners.length) return null;
  let next = -1;
  let nextGap = Infinity;
  let prev = -1;
  let prevGap = Infinity;
  corners.forEach((d, i) => {
    const ahead = aheadDist(lapDist, d, lapLen);
    const behind = aheadDist(d, lapDist, lapLen);
    if (ahead < nextGap) {
      nextGap = ahead;
      next = i;
    }
    if (behind < prevGap) {
      prevGap = behind;
      prev = i;
    }
  });
  return (nextGap <= NEXT_CORNER_M ? next : prev) + 1;
}

/** Virage dont la note doit partir maintenant (numéro 1-based), ou null. */
export function noteDue(corners: number[], noted: Set<number>, lapDist: number, lapLen: number, speedMs: number): number | null {
  const lead = Math.min(LEAD_MAX_M, Math.max(LEAD_MIN_M, speedMs * LEAD_S));
  for (let i = 0; i < corners.length; i++) {
    if (!noted.has(i + 1)) continue;
    const ahead = aheadDist(lapDist, corners[i], lapLen);
    if (ahead > 30 && ahead <= lead) return i + 1;
  }
  return null;
}

/** Dernière trame vue (commande vocale « note pour ce virage »). */
let latest: LiveData | null = null;
let reloadNotes: (() => void) | null = null;

/** Enregistre la dernière prise de parole comme note du virage courant. */
export async function saveNoteHere(t: TFunction): Promise<string> {
  const d = latest;
  if (!d?.session || !d.player || !d.telemetry) return t("live.noteNoSession");
  const corner = cornerForNote(cornerDists(d), d.telemetry.lap_dist_est || d.telemetry.lap_dist, d.session.track_length);
  if (corner == null) return t("live.noteNoCorner");
  try {
    await voiceNotes.saveLast(d.session.track, d.player.vehicle, corner);
    reloadNotes?.();
    return t("live.noteSaved", { n: corner });
  } catch {
    return t("live.noteFailed");
  }
}

export function useVoiceNotes(data: LiveData | null, active: boolean, lang: string, t: TFunction): void {
  const enabled = useAppStore((s) => s.radioExtras.voiceNotes);
  const key = data?.session && data.player ? `${data.session.track}|${data.player.vehicle}` : "";
  const notes = useRef<Set<number>>(new Set());
  const buffers = useRef(new Map<number, AudioBuffer>());
  const corners = useRef<{ key: string; n: number; list: number[] }>({ key: "", n: 0, list: [] });
  const played = useRef(new Map<number, number>());
  const tRef = useRef(t);
  const langRef = useRef(lang);
  tRef.current = t;
  langRef.current = lang;
  latest = data;

  // Liste des notes du circuit × voiture.
  useEffect(() => {
    notes.current = new Set();
    buffers.current.clear();
    played.current.clear();
    if (!active || !key || !isTauri()) return;
    const [track, car] = key.split("|");
    const load = () =>
      void voiceNotes
        .list(track, car)
        .then((l) => {
          notes.current = new Set(l.map((x) => x.corner));
          buffers.current.clear();
        })
        .catch(() => {});
    load();
    reloadNotes = load;
    return () => {
      reloadNotes = null;
    };
  }, [active, key]);

  // Enregistrement au bouton du volant (maintenu).
  useEffect(() => {
    if (!active || !isTauri()) return;
    let off: (() => void) | null = null;
    let disposed = false;
    void listen<{ pressed: boolean }>("voice-note-ptt", async (ev) => {
      if (ev.payload.pressed) {
        setDriverTalking(true);
        await invoke("ptt_begin", { autoSend: false }).catch(() => {});
        return;
      }
      setDriverTalking(false);
      await invoke("ptt_end", { lang: langRef.current }).catch(() => null);
      announceAnswer(await saveNoteHere(tRef.current), langRef.current);
    }).then((fn) => {
      if (disposed) fn();
      else off = fn;
    });
    return () => {
      disposed = true;
      off?.();
    };
  }, [active]);

  // Lecture à l'approche des virages notés.
  useEffect(() => {
    if (!active || !enabled || !data?.session || !data.player || !data.telemetry || data.paused) return;
    if (!notes.current.size) return;
    const tel = data.telemetry;
    const len = data.session.track_length;
    if (corners.current.key !== key || corners.current.n !== data.track_points.length) {
      corners.current = { key, n: data.track_points.length, list: cornerDists(data) };
    }
    const list = corners.current.list;
    const due = noteDue(list, notes.current, tel.lap_dist_est || tel.lap_dist, len, tel.speed_kmh / 3.6);
    if (due == null || played.current.get(due) === data.player.total_laps || isSpeaking()) return;
    played.current.set(due, data.player.total_laps);
    const [track, car] = key.split("|");
    void (async () => {
      const ctx = audioContext();
      if (!ctx) return;
      let buf = buffers.current.get(due);
      if (!buf) {
        const bytes = await voiceNotes.read(track, car, due).catch(() => null);
        if (!bytes) return;
        buf = await ctx.decodeAudioData(new Uint8Array(bytes).buffer).catch(() => undefined);
        if (!buf) return;
        buffers.current.set(due, buf);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(audioOutput() ?? ctx.destination);
      src.start();
    })();
  }, [data, active, enabled, key]);
}
