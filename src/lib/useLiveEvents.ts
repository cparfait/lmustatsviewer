/**
 * Événements de piste en direct, mémorisés (`live_events`, 1 500 au plus) pour
 * la carte des incidents et les temps forts des sessions. Monté une fois
 * (App.tsx) ; ne travaille que si le jeu tourne.
 */

import { useEffect } from "react";
import { create } from "zustand";
import { config, isTauri, live, type LiveData } from "@/lib/api";
import { EventDetector, type LiveEvent } from "@/lib/liveEvents";

const KEY = "live_events";
export const MAX_EVENTS = 1500;

interface EventsStore {
  events: LiveEvent[];
  loaded: boolean;
  add: (evs: LiveEvent[]) => void;
  clearTrack: (track: string) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(events: LiveEvent[]): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void config.set(KEY, JSON.stringify(events)).catch(() => {}), 2000);
}

export const useEventsStore = create<EventsStore>((set, get) => ({
  events: [],
  loaded: false,
  add: (evs) => {
    const events = [...get().events, ...evs].slice(-MAX_EVENTS);
    set({ events });
    scheduleSave(events);
  },
  clearTrack: (track) => {
    const events = get().events.filter((e) => e.track !== track);
    set({ events });
    scheduleSave(events);
  },
}));

/** Charge les événements mémorisés (une fois). */
export async function loadEvents(): Promise<void> {
  if (useEventsStore.getState().loaded || !isTauri()) return;
  const raw = await config.get(KEY).catch(() => null);
  try {
    useEventsStore.setState({ events: JSON.parse(raw || "[]") as LiveEvent[], loaded: true });
  } catch {
    useEventsStore.setState({ loaded: true });
  }
}

export function useLiveEvents(): void {
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let off: (() => void) | null = null;
    const det = new EventDetector();
    let session = "";
    void (async () => {
      await loadEvents();
      off = await live.onData((d: LiveData) => {
        if (disposed || !d.session) return;
        // Nouvelle séance (circuit, type, ou temps qui repart) : détecteur remis à zéro.
        const key = `${d.session.track}|${d.session.session}|${Math.floor(Date.now() / 1000 - d.session.session_time) >> 6}`;
        if (key !== session) {
          session = key;
          det.reset();
        }
        const evs = det.push(d, Date.now());
        if (evs.length) useEventsStore.getState().add(evs);
      });
    })();
    return () => {
      disposed = true;
      off?.();
    };
  }, []);
}
