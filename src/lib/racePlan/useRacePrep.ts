/**
 * Programme d'essais : suivi en direct, mémorisé par circuit × voiture
 * (`race_prep_map`). Monté une seule fois (App.tsx), passif : il ne travaille
 * qu'aux passages de ligne et aux sorties de stands.
 */

import { useEffect } from "react";
import { create } from "zustand";
import { config, isTauri, live, type LiveData } from "@/lib/api";
import { useAppStore } from "@/stores/app";
import { engineer } from "@/lib/engineer/state";
import { TyreWearTracker, wheelWear } from "@/lib/engineer/tyres";
import { emptyPrep, PrepTracker, type PrepState } from "./prep";

interface PrepStore {
  byCombo: Record<string, PrepState>;
  /** Combo en cours (`circuit::voiture`), "" hors séance. */
  current: string;
  set: (combo: string, s: PrepState) => void;
  /** Efface la progression d'un combo (recommencer la préparation). */
  clear: (combo: string) => void;
}

const KEY = "race_prep_map";

function save(map: Record<string, PrepState>): void {
  void config.set(KEY, JSON.stringify(map)).catch(() => {});
}

export const usePrepStore = create<PrepStore>((set, get) => ({
  byCombo: {},
  current: "",
  set: (combo, s) => {
    const byCombo = { ...get().byCombo, [combo]: s };
    set({ byCombo });
    save(byCombo);
  },
  clear: (combo) => {
    const byCombo = { ...get().byCombo };
    delete byCombo[combo];
    set({ byCombo });
    save(byCombo);
  },
}));

export function useRacePrep(): void {
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let off: (() => void) | null = null;
    const tracker = new PrepTracker();
    const wear = new TyreWearTracker();
    let combo = "";
    let laps = -1;

    void (async () => {
      const raw = await config.get(KEY).catch(() => null);
      try {
        usePrepStore.setState({ byCombo: JSON.parse(raw || "{}") as Record<string, PrepState> });
      } catch {
        /* carte illisible : on repart de zéro */
      }
      off = await live.onData((d: LiveData) => {
        if (disposed) return;
        const me = d.standings.find((s) => s.is_player);
        const p = d.player;
        const track = d.session?.track ?? "";
        if (!me || !p || !track) return;
        const car = me.vehicle_name || p.vehicle || "";
        const c = car ? `${track}::${car}` : "";
        if (c !== combo) {
          combo = c;
          tracker.reset();
          wear.reset();
          laps = -1;
          usePrepStore.setState({ current: c });
        }
        if (!combo) return;
        if (laps >= 0 && p.total_laps > laps) {
          const w = wheelWear(d.telemetry?.wheels);
          if (w) wear.push(w);
        }
        laps = p.total_laps;
        const store = usePrepStore.getState();
        const state = store.byCombo[combo] ?? emptyPrep();
        const cls = me.vehicle_class;
        const next = tracker.push(d, state, {
          pitLossKnown: useAppStore.getState().pitLossByCombo[combo] != null,
          warmupKnown: engineer.warmup.median(cls) != null || engineer.warmupPrior[`${track}::${cls}`] != null,
          wearKnown: wear.perLap().some((x) => x != null),
        });
        if (next) store.set(combo, next);
      });
    })();

    return () => {
      disposed = true;
      off?.();
    };
  }, []);
}
