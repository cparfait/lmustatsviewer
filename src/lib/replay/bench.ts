/**
 * Banc de rejeu (module pur) : fait passer une séance enregistrée dans les
 * détecteurs de l'ingénieur, sans le jeu, et rend la chronologie de ce qu'ils
 * auraient signalé. Sert à régler seuils et annonces hors piste.
 */

import type { RecordedFrame } from "./format";
import { EventDetector } from "@/lib/liveEvents";
import { StintRegistry } from "@/lib/engineer/rivalStints";
import { WarmupTracker, WetnessTrend, TyreWearTracker, isWetCompound, wheelWear } from "@/lib/engineer/tyres";

export interface BenchLine {
  /** ms depuis le début de l'enregistrement. */
  t: number;
  source: "events" | "stints" | "warmup" | "tyres";
  text: string;
}

export interface BenchResult {
  lines: BenchLine[];
  frames: number;
  /** Durée couverte (ms). */
  durationMs: number;
}

export function mmss(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function runBench(frames: RecordedFrame[]): BenchResult {
  const ev = new EventDetector();
  const stints = new StintRegistry();
  const warm = new WarmupTracker();
  const wet = new WetnessTrend();
  const wear = new TyreWearTracker();
  const lines: BenchLine[] = [];
  let laps = -1;
  let lastCall: string | null = null;
  for (const { t, d } of frames) {
    for (const e of ev.push(d, t)) lines.push({ t, source: "events", text: `${e.kind} tour ${e.lap} à ${Math.round(e.lapDist)} m${e.detail ? ` (${e.detail})` : ""}${e.value != null ? ` [${e.value}]` : ""}` });
    const lp = stints.push(d);
    if (lp) lines.push({ t, source: "stints", text: `le leader ${lp.driver} rentre (arrêt ${lp.stop}${lp.stintLaps != null ? `, relais ${lp.stintLaps} tours` : ""})` });
    for (const m of warm.push(d, d.session?.game_phase === 5)) lines.push({ t, source: "warmup", text: `chauffe ${m.cls} : ${m.seconds.toFixed(1)} s` });
    if (d.weather && d.session) wet.push(d.session.session_time, d.weather.path_wetness_avg);
    const tel = d.telemetry;
    const call = tel ? wet.call(isWetCompound(tel.front_compound) || isWetCompound(tel.rear_compound), d.weather?.rain ?? 0) : null;
    if (call !== lastCall) {
      if (call) lines.push({ t, source: "tyres", text: call === "toWets" ? "passer en pneus pluie" : "repasser en slicks" });
      lastCall = call;
    }
    const p = d.player;
    if (p && laps >= 0 && p.total_laps > laps) {
      const w = wheelWear(tel?.wheels);
      if (w) wear.push(w);
    }
    if (p) laps = p.total_laps;
  }
  const per = wear.perLap();
  if (per.some((x) => x != null)) {
    lines.push({ t: frames[frames.length - 1]?.t ?? 0, source: "tyres", text: `usure par tour AVG/AVD/ARG/ARD : ${per.map((x) => (x == null ? "?" : x.toFixed(2))).join(" / ")} %` });
  }
  return { lines, frames: frames.length, durationMs: frames.length ? frames[frames.length - 1].t - frames[0].t : 0 };
}
