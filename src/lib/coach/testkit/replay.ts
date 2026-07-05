/**
 * Harnais de rejeu du moteur coach (COACH-LIVE-SPEC.md §14.2). Rejoue une suite de
 * `CoachFrame` dans le **module pur** `(frame, state) → (state, events)` et récolte
 * les événements émis (clôtures de virage, tours bouclés…). Aucune I/O, donc
 * rejouable ×1000 et assertable exactement.
 */

import {
  createCoachState,
  setCoachRef,
  stepCoach,
  type CoachEvent,
  type CoachEngineState,
  type CornerMeasurement,
  type CompletedLap,
} from "../engine";
import { buildRefPayload } from "../capture";
import type { CoachFrame } from "../frame";
import type { CoachRef } from "@/lib/api";

/** Résultat d'un rejeu : tous les événements, et les vues filtrées usuelles. */
export interface ReplayResult {
  events: CoachEvent[];
  measurements: CornerMeasurement[];
  laps: CompletedLap[];
  state: CoachEngineState;
}

/**
 * Rejoue `frames` dans un moteur neuf. Si `ref` est fourni, il est injecté juste
 * après le `combo-changed` initial (comme le fait le service async) → les fenêtres
 * sont projetées et des `corner-passed` sont émis.
 */
export function replayEngine(frames: CoachFrame[], ref?: CoachRef | null): ReplayResult {
  const state = createCoachState();
  const events: CoachEvent[] = [];
  for (const f of frames) {
    const r = stepCoach(state, f);
    for (const e of r.events) {
      events.push(e);
      if (e.type === "combo-changed" && ref) setCoachRef(state, ref);
    }
  }
  const measurements = events
    .filter((e): e is Extract<CoachEvent, { type: "corner-passed" }> => e.type === "corner-passed")
    .map((e) => e.measurement);
  const laps = events
    .filter((e): e is Extract<CoachEvent, { type: "lap-completed" }> => e.type === "lap-completed")
    .map((e) => e.lap);
  return { events, measurements, laps, state };
}

/**
 * Construit une réf dense `kind: "ghost"` à partir du **premier tour bouclé** d'un
 * rejeu sans réf (les virages viennent de l'auto-détection). `null` si aucun tour
 * n'est bouclé ou si le tampon est trop court.
 */
export function refFromLapFrames(frames: CoachFrame[]): CoachRef | null {
  const { laps } = replayEngine(frames);
  const lap = laps.find((l) => l.corners.length > 0 && l.buf.dist.length > 4);
  if (!lap) return null;
  const payload = buildRefPayload(
    lap,
    {
      track: "TestTrack",
      carModel: "TestCar",
      carClass: "Hyper",
      gameBuild: "1.0",
      trackTemp: 0,
      airTemp: 0,
      wetness: 0,
      rain: 0,
      compoundF: "",
      compoundR: "",
      fuelAtStart: 0,
      tcMap: 1,
      absMap: 1,
      lapsSincePit: 0,
    },
    "ghost",
  );
  if (!payload) return null;
  return { id: 1, created_at: 0, ...payload };
}
