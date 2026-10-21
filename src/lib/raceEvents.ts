/**
 * Événements de course pour les widgets de stream (Atelier, opt-in) : détectés
 * sur le flux live et relayés par le serveur de widgets (WebSocket, message
 * `{"t":"evt","name":"race-event","payload":…}`). Chaque événement n'est émis
 * qu'une fois : départ, entrée aux stands, arrêt (avec sa durée), sortie (avec
 * le temps passé dans la voie), damier, meilleur tour de la session, record perso.
 * Le détecteur est pur (testable) ; `useStreamEvents` le branche sur le flux.
 */

import { useEffect } from "react";
import { emit } from "@tauri-apps/api/event";
import { community, isTauri, live, type LiveData } from "@/lib/api";
import { matchCombo } from "@/lib/briefing";
import { FLAG_STREAM_EVENTS, useConfigFlag } from "@/lib/configFlag";

export type RaceEventKind = "start" | "pitIn" | "pitStop" | "pitOut" | "checkered" | "bestLap" | "personalBest";

export interface RaceEvent {
  kind: RaceEventKind;
  /** Heure de session (s). */
  at: number;
  /** Tour du joueur. */
  lap: number;
  /** Durée (s) : arrêt (`pitStop`) ou passage dans la voie (`pitOut`). */
  seconds?: number;
  /** Chrono (s) : `bestLap`, `personalBest`. */
  time?: number;
  /** Position (générale) : `checkered`. */
  position?: number;
}

/** États de stand rF2 (`mPitState`) : 3 = arrêté au stand. */
const PIT_STOPPED = 3;
/** Phase de jeu rF2 : 5 = drapeau vert. */
const GREEN = 5;

export class RaceEventTracker {
  private key = "";
  private phase = -1;
  private inPits: boolean | null = null;
  private pitInAt = 0;
  private stoppedAt: number | null = null;
  private finished = false;
  private best = 0;
  private laps = -1;
  /** Record perso connu pour ce combo (s), `null` si aucun. */
  personalBest: number | null = null;

  /** Événements de cette trame (souvent aucun). */
  push(d: LiveData): RaceEvent[] {
    const s = d.session;
    const p = d.player;
    if (!d.connected || !s || !p || d.paused) return [];
    const me = d.standings.find((x) => x.is_player);
    const key = `${s.track}|${s.session}|${me?.vehicle_name ?? ""}`;
    const out: RaceEvent[] = [];
    const at = s.session_time;
    const lap = p.total_laps;
    const ev = (kind: RaceEventKind, extra: Partial<RaceEvent> = {}) => out.push({ kind, at, lap, ...extra });

    if (key !== this.key) {
      // Nouvelle session : on prend l'état tel quel, sans rien annoncer.
      this.key = key;
      this.phase = s.game_phase;
      this.inPits = !!me?.in_pits;
      this.stoppedAt = null;
      this.finished = p.finish_status > 0;
      this.best = p.best_lap_time > 0 ? p.best_lap_time : 0;
      this.laps = lap;
      return [];
    }

    // Départ : passage au vert d'une course.
    if (s.session >= 10 && s.game_phase === GREEN && this.phase !== GREEN && this.phase >= 0 && this.phase < GREEN) ev("start");
    this.phase = s.game_phase;

    // Stands : entrée, arrêt (durée), sortie (temps dans la voie).
    const inPits = !!me?.in_pits;
    if (this.inPits === false && inPits) {
      this.pitInAt = at;
      ev("pitIn");
    }
    if (inPits && p.pit_state === PIT_STOPPED && this.stoppedAt == null) this.stoppedAt = at;
    if (this.stoppedAt != null && p.pit_state !== PIT_STOPPED) {
      ev("pitStop", { seconds: Math.round((at - this.stoppedAt) * 10) / 10 });
      this.stoppedAt = null;
    }
    if (this.inPits === true && !inPits) {
      ev("pitOut", { seconds: this.pitInAt > 0 ? Math.round((at - this.pitInAt) * 10) / 10 : undefined });
      this.pitInAt = 0;
    }
    this.inPits = inPits;

    // Damier : le joueur termine.
    if (!this.finished && p.finish_status > 0) {
      this.finished = true;
      ev("checkered", { position: p.position });
    }

    // Tour bouclé : meilleur tour de la session, record perso.
    if (lap > this.laps && this.laps >= 0) {
      const t = p.last_lap_time;
      if (t > 0 && p.best_lap_time > 0 && Math.abs(p.best_lap_time - t) < 0.001 && (this.best <= 0 || t < this.best - 0.0005)) {
        this.best = t;
        ev("bestLap", { time: t });
        if (this.personalBest != null && t < this.personalBest - 0.0005) {
          this.personalBest = t;
          ev("personalBest", { time: t });
        }
      }
    }
    this.laps = lap;
    return out;
  }
}

/** Branche le détecteur sur le flux live et émet `race-event` (relayé aux widgets). */
export function useStreamEvents(): void {
  const enabled = useConfigFlag(FLAG_STREAM_EVENTS);
  useEffect(() => {
    if (!enabled || !isTauri()) return;
    let disposed = false;
    let off: (() => void) | null = null;
    const tracker = new RaceEventTracker();
    let comboKey = "";

    const loadPb = async (d: LiveData) => {
      const me = d.standings.find((x) => x.is_player);
      const mine = await community.myCombos().catch(() => []);
      const c = matchCombo(mine, d.session?.track ?? "", me?.vehicle_class ?? "");
      tracker.personalBest = c ? (mine.find((m) => m.track === c.track && m.track_course === c.track_course && m.car_class === c.car_class)?.best ?? null) : null;
    };

    void (async () => {
      off = await live.onData((d) => {
        if (disposed) return;
        const me = d.standings.find((x) => x.is_player);
        const k = `${d.session?.track ?? ""}|${me?.vehicle_class ?? ""}`;
        if (d.session && k !== comboKey) {
          comboKey = k;
          void loadPb(d);
        }
        for (const e of tracker.push(d)) void emit("race-event", e);
      });
      if (disposed) off();
    })();
    return () => {
      disposed = true;
      off?.();
    };
  }, [enabled]);
}
