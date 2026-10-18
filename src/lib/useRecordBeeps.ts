/**
 * Bips de record au volant (désactivés par défaut) : après chaque tour chronométré,
 * 1 bip = record perso sur ce circuit et cette classe (base locale), 2 bips = meilleur
 * tour de la séance dans la classe, 3 bips = record de la base communautaire battu.
 * Le nombre le plus élevé l'emporte. Quand les annonces vocales de l'ingénieur sont
 * actives, il le dit à la voix (phrases à variantes) au lieu des bips. Rien sur un tour de sortie des stands, un tour
 * passé par les stands ou un tour où le compteur de limites de piste a monté.
 */
import { useEffect } from "react";
import { community, isTauri, live, type LiveData } from "@/lib/api";
import { matchCombo, type ComboRef } from "@/lib/briefing";
import { FLAG_RECORD_BEEPS, useConfigFlag } from "@/lib/configFlag";
import { recordBeeps } from "@/lib/radioFx";
import { recordKey, sayLive } from "@/lib/engineer/sideCallouts";

interface LapState {
  laps: number;
  pitDuringLap: boolean;
  limits: number;
}

/** Nombre de bips d'un tour terminé (0 = aucun). Module pur, testable. */
export function beepsFor(lap: number, personalBest: number | null, classSessionBest: boolean, communityBest: number | null): 0 | 1 | 2 | 3 {
  if (!(lap > 0)) return 0;
  if (communityBest != null && lap < communityBest - 0.0005) return 3;
  if (classSessionBest) return 2;
  if (personalBest != null && lap < personalBest - 0.0005) return 1;
  return 0;
}

export function useRecordBeeps(): void {
  const enabled = useConfigFlag(FLAG_RECORD_BEEPS);

  useEffect(() => {
    if (!enabled || !isTauri()) return;
    let disposed = false;
    let polling = false;
    let off: (() => void) | null = null;
    let sessionKey = "";
    let combo: ComboRef | null = null;
    let personalBest: number | null = null;
    let communityBest: number | null = null;
    let st: LapState | null = null;

    const loadBests = async (d: LiveData) => {
      const me = d.standings.find((s) => s.is_player);
      const track = d.session?.track ?? "";
      const cls = me?.vehicle_class ?? "";
      const mine = await community.myCombos().catch(() => []);
      combo = matchCombo(mine, track, cls);
      personalBest = combo ? (mine.find((m) => m.track === combo!.track && m.track_course === combo!.track_course && m.car_class === combo!.car_class)?.best ?? null) : null;
      const pub = await community.get<{ combos: (ComboRef & { best: number })[] }>("combos").catch(() => null);
      const c = pub ? matchCombo(pub.combos, track, cls) : null;
      communityBest = c ? (pub!.combos.find((x) => x === c)?.best ?? null) : null;
    };

    const onFrame = (d: LiveData) => {
      const p = d.player;
      if (!d.connected || !d.session || !p) return;
      const me = d.standings.find((s) => s.is_player);
      const key = `${d.session.track}|${me?.vehicle_class ?? ""}|${d.session.session}`;
      if (key !== sessionKey) {
        sessionKey = key;
        st = null;
        void loadBests(d);
      }
      const limits = d.extended?.track_limits ?? 0;
      if (!st || p.total_laps < st.laps) {
        st = { laps: p.total_laps, pitDuringLap: !!me?.in_pits, limits };
        return;
      }
      if (me?.in_pits) st.pitDuringLap = true;
      if (p.total_laps > st.laps) {
        const clean = !st.pitDuringLap && limits === st.limits && !me?.in_pits;
        const lap = p.last_lap_time;
        if (clean && lap > 0) {
          const n = beepsFor(lap, personalBest, !!me?.is_class_best_lap && Math.abs((me?.best_lap_time ?? 0) - lap) < 0.001, communityBest);
          // Annonces vocales actives : l'ingénieur le dit ; sinon, les bips.
          if (n !== 0 && !sayLive(recordKey(n))) recordBeeps(n);
          if (personalBest == null || lap < personalBest) personalBest = lap;
          if (n === 3) communityBest = lap;
        }
        st = { laps: p.total_laps, pitDuringLap: false, limits };
      }
    };

    live
      .startPolling()
      .then(() => {
        polling = true;
        if (disposed) void live.stopPolling().catch(() => {});
      })
      .catch(() => {});
    void live.onData(onFrame).then((fn) => {
      if (disposed) fn();
      else off = fn;
    });
    return () => {
      disposed = true;
      if (off) off();
      if (polling) void live.stopPolling().catch(() => {});
    };
  }, [enabled]);
}
