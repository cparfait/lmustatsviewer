/**
 * Benchmark automatique du temps perdu au stand (T13 #152).
 *
 * Abonné au flux `live-data`, il alimente un `PitLossTracker` : à chaque arrêt, la
 * perte mesurée (S3 in-lap + S1 out-lap vs meilleurs secteurs) est **enregistrée
 * par combo circuit×voiture** et devient l'estimation `pitLossSeconds` utilisée par
 * la prédiction de position à la sortie des stands (#151). Au changement de combo,
 * la perte mesurée connue est ré-appliquée.
 *
 * Monté une seule fois (App.tsx). Passif et léger : ne fait un vrai travail qu'aux
 * clôtures de tour autour d'un arrêt.
 */

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/stores/app";
import { isTauri, live, type LiveData } from "@/lib/api";
import { PitLossTracker } from "@/lib/pitLoss";
import { toast } from "@/stores/dialogs";

export function usePitLoss() {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const tracker = new PitLossTracker();
    let lastCombo = "";
    let off: (() => void) | null = null;

    void (async () => {
      off = await live.onData((data: LiveData) => {
        if (disposed) return;
        const me = data.standings.find((s) => s.is_player);
        const p = data.player;
        if (!me || !p) return;

        const track = data.session?.track ?? "";
        const carModel = me.vehicle_name || p.vehicle || "";
        const combo = track && carModel ? `${track}::${carModel}` : "";

        // Nouveau combo → applique la perte mesurée connue + réarme le détecteur.
        if (combo && combo !== lastCombo) {
          lastCombo = combo;
          useAppStore.getState().applyPitLossForCombo(combo);
          tracker.reset();
        }

        const loss = tracker.push({
          inPits: me.in_pits,
          totalLaps: p.total_laps,
          lastS1: p.last_sectors?.[0] ?? 0,
          lastS3: p.last_sectors?.[2] ?? 0,
          bestS1: p.best_sectors?.[0] ?? 0,
          bestS3: p.best_sectors?.[2] ?? 0,
        });

        if (loss != null && combo) {
          void useAppStore.getState().recordPitLoss(combo, loss);
          toast(tRef.current("live.pitLossMeasured", { s: Math.round(loss) }));
        }
      });
    })();

    return () => {
      disposed = true;
      off?.();
    };
  }, []);
}
