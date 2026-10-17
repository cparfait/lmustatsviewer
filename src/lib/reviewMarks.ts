/**
 * Repères de revue : un appui sur un bouton du volant (ou un raccourci clavier)
 * pendant une séance marque « ce moment » (incident à revoir, endroit où l'on a perdu
 * du temps…). Mémorisés en config (`review_marks`, 500 au plus) avec le circuit et le
 * début estimé de la séance, puis rattachés à la session indexée comme les
 * évènements live (`eventsForSession`). Désactivé par défaut.
 */
import { useEffect, useState } from "react";
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { config, isTauri, live, type LiveData, type WheelBinding } from "@/lib/api";
import { FLAG_REVIEW_MARKS, useConfigFlag } from "@/lib/configFlag";
import { pttBeep } from "@/lib/radioFx";

const KEY = "review_marks";
export const MAX_MARKS = 500;
/** Raccourci clavier (accélérateur Tauri) et bouton du volant (JSON `WheelBinding`). */
export const MARK_KEY_KEY = "review_mark_key";
export const MARK_WHEEL_KEY = "review_mark_wheel";

export interface ReviewMark {
  /** Horodatage (ms). */
  t: number;
  track: string;
  /** Début estimé de la séance (s, epoch). */
  sessionStart: number;
  /** Type de séance rF2 (10+ = course). */
  session: number;
  /** Temps de séance au moment du repère (s). */
  sessionTime: number;
  lap: number;
  lapDist: number;
}

interface MarksStore {
  marks: ReviewMark[];
  loaded: boolean;
  add: (m: ReviewMark) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useMarksStore = create<MarksStore>((set, get) => ({
  marks: [],
  loaded: false,
  add: (m) => {
    const marks = [...get().marks, m].slice(-MAX_MARKS);
    set({ marks });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void config.set(KEY, JSON.stringify(marks)).catch(() => {}), 500);
  },
}));

export async function loadMarks(): Promise<void> {
  if (useMarksStore.getState().loaded || !isTauri()) return;
  const raw = await config.get(KEY).catch(() => null);
  try {
    useMarksStore.setState({ marks: JSON.parse(raw || "[]") as ReviewMark[], loaded: true });
  } catch {
    useMarksStore.setState({ loaded: true });
  }
}

/** Repère à partir d'une trame live ; `null` hors séance. */
export function markFromLive(d: LiveData, nowMs: number): ReviewMark | null {
  if (!d.connected || !d.session || !d.player) return null;
  const st = d.session.session_time ?? 0;
  return {
    t: nowMs,
    track: d.session.track,
    sessionStart: Math.round(nowMs / 1000 - st),
    session: d.session.session,
    sessionTime: st,
    lap: (d.player.total_laps ?? 0) + 1,
    lapDist: d.telemetry?.lap_dist ?? 0,
  };
}

/** Repères d'une séance indexée (même rapprochement que les évènements live). */
export function marksForSession(marks: ReviewMark[], track: string, startEpoch: number, durationS: number, isRace: boolean): ReviewMark[] {
  const tr = track.toLowerCase();
  const tol = Math.max(0, durationS) + 900;
  return marks.filter(
    (m) =>
      (m.session >= 10) === isRace &&
      Math.abs(m.sessionStart - startEpoch) <= tol &&
      (m.track.toLowerCase().includes(tr) || tr.includes(m.track.toLowerCase())),
  );
}

/** Pose un repère maintenant (lecture ponctuelle du live). Bip court si posé. */
async function markNow(): Promise<void> {
  await loadMarks();
  const d = await live.getData().catch(() => null);
  const m = d ? markFromLive(d, Date.now()) : null;
  if (!m) return;
  useMarksStore.getState().add(m);
  pttBeep("send");
}

/** Évènement fenêtre : raccourci ou bouton du volant modifié dans la Configuration. */
export const MARK_BINDINGS_EVENT = "lmusv:review-mark-bindings";

/** Monté dans App : raccourci clavier + bouton du volant, si l'option est active. */
export function useReviewMarks(): void {
  const enabled = useConfigFlag(FLAG_REVIEW_MARKS);
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const bump = () => setRev((r) => r + 1);
    window.addEventListener(MARK_BINDINGS_EVENT, bump);
    return () => window.removeEventListener(MARK_BINDINGS_EVENT, bump);
  }, []);

  useEffect(() => {
    if (!enabled || !isTauri()) return;
    let disposed = false;
    const cleanups: (() => void)[] = [];
    void (async () => {
      const [accel, wheelRaw] = await Promise.all([config.get(MARK_KEY_KEY), config.get(MARK_WHEEL_KEY)]);
      if (disposed) return;
      if (accel) {
        const gs = await import("@tauri-apps/plugin-global-shortcut");
        try {
          if (await gs.isRegistered(accel)) await gs.unregister(accel);
          await gs.register(accel, (e) => {
            if (e.state === "Pressed") void markNow();
          });
          cleanups.push(() => void gs.unregister(accel).catch(() => {}));
        } catch {
          /* raccourci déjà pris par une autre application */
        }
      }
      let binding: WheelBinding | null = null;
      try {
        binding = wheelRaw ? (JSON.parse(wheelRaw) as WheelBinding) : null;
      } catch {
        binding = null;
      }
      if (binding) {
        await invoke("wheel_watch_mark", { binding }).catch(() => {});
        const off = await listen<{ pressed: boolean }>("wheel-mark", (e) => {
          if (e.payload.pressed) void markNow();
        });
        cleanups.push(off, () => void invoke("wheel_watch_mark", { binding: null }).catch(() => {}));
      }
      if (disposed) cleanups.forEach((c) => c());
    })();
    return () => {
      disposed = true;
      cleanups.forEach((c) => c());
    };
  }, [enabled, rev]);
}
