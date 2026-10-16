/**
 * Événements de piste détectés en direct (module pur).
 *
 * Deux usages : la carte des incidents (où je touche, où je coupe, où je sors,
 * circuit par circuit) et les temps forts d'une course (dépassements, places
 * perdues, roue dans roue, départ), rattachés ensuite à la session indexée.
 * Que des faits observés, avec des seuils simples :
 *  - choc : nouvel impact ≥ `CONTACT_MIN` ;
 *  - limites de piste : le compteur du jeu monte ;
 *  - sortie : ≥ 2 roues sur herbe, terre ou gravier pendant 0,5 s ;
 *  - dépassement / place perdue : position de classe qui change, les deux en piste ;
 *  - roue dans roue : une voiture à côté (latéral 1,2-4 m, ≤ 5 m en long) 4 trames de suite ;
 *  - départ : ≥ 3 places gagnées ou perdues au premier tour.
 */

import type { LiveData } from "@/lib/api";

export type EventKind = "contact" | "trackLimits" | "offTrack" | "overtake" | "lostPlace" | "wheelToWheel" | "start";

/** Incidents (carte) vs temps forts (course). */
export const INCIDENT_KINDS: EventKind[] = ["contact", "trackLimits", "offTrack"];

export interface LiveEvent {
  kind: EventKind;
  /** Horodatage (ms). */
  t: number;
  track: string;
  /** Début estimé de la séance (s, epoch) : sert à retrouver la session indexée. */
  sessionStart: number;
  /** Type de séance rF2 (10+ = course). */
  session: number;
  lap: number;
  lapDist: number;
  /** Pilote concerné (dépassement, roue dans roue), ou places (départ). */
  detail?: string;
  value?: number;
}

export const CONTACT_MIN = 1500;
const OFF_SURFACES = new Set([2, 3, 4]);
const OFF_HOLD_MS = 500;
const COOLDOWN_MS: Partial<Record<EventKind, number>> = { contact: 3000, offTrack: 5000, wheelToWheel: 60000 };
const W2W_FRAMES = 4;
export const START_PLACES = 3;

export class EventDetector {
  private impact = -1;
  private limits = -1;
  private offSince = 0;
  private classPos = 0;
  private gridPos = 0;
  private laps = -1;
  private w2w = 0;
  private last = new Map<EventKind, number>();

  reset(): void {
    this.impact = -1;
    this.limits = -1;
    this.offSince = 0;
    this.classPos = 0;
    this.gridPos = 0;
    this.laps = -1;
    this.w2w = 0;
    this.last.clear();
  }

  push(d: LiveData, nowMs: number): LiveEvent[] {
    const me = d.standings.find((s) => s.is_player);
    const sc = d.session;
    const tel = d.telemetry;
    if (!me || !sc || !d.player || d.paused) return [];
    const out: LiveEvent[] = [];
    const isRace = sc.session >= 10;
    const green = sc.game_phase === 5;
    const emit = (kind: EventKind, extra: Partial<LiveEvent> = {}) => {
      const cd = COOLDOWN_MS[kind] ?? 0;
      if (nowMs - (this.last.get(kind) ?? -Infinity) < cd) return;
      this.last.set(kind, nowMs);
      out.push({ kind, t: nowMs, track: sc.track, sessionStart: Math.round(nowMs / 1000 - sc.session_time), session: sc.session, lap: me.total_laps + 1, lapDist: me.lap_dist, ...extra });
    };

    // Choc.
    const imp = tel?.last_impact_magnitude ?? 0;
    if (this.impact >= 0 && imp !== this.impact && imp >= CONTACT_MIN && !me.in_pits) emit("contact", { value: Math.round(imp) });
    this.impact = imp;

    // Limites de piste.
    const lim = d.extended?.track_limits ?? -1;
    if (this.limits >= 0 && lim > this.limits) emit("trackLimits", { value: lim });
    this.limits = lim;

    // Sortie de piste.
    const off = (tel?.wheels ?? []).filter((w) => OFF_SURFACES.has(w.surface)).length >= 2 && !me.in_pits;
    if (off) {
      if (!this.offSince) this.offSince = nowMs;
      else if (nowMs - this.offSince >= OFF_HOLD_MS) emit("offTrack");
    } else this.offSince = 0;

    // Course : positions, départ, roue dans roue.
    if (isRace) {
      if (sc.game_phase <= 4 && me.class_position > 0) this.gridPos = me.class_position;
      const prev = this.classPos;
      if (green && prev > 0 && me.class_position > 0 && me.class_position !== prev && !me.in_pits && me.total_laps >= 1) {
        const other = d.standings.find(
          (s) => s.vehicle_class === me.vehicle_class && s.class_position === (me.class_position < prev ? me.class_position + 1 : me.class_position - 1),
        );
        if (other && !other.in_pits) emit(me.class_position < prev ? "overtake" : "lostPlace", { detail: other.driver, value: me.class_position });
      }
      this.classPos = me.class_position;
      if (this.laps === 0 && me.total_laps === 1 && this.gridPos > 0) {
        const gained = this.gridPos - me.class_position;
        if (Math.abs(gained) >= START_PLACES) emit("start", { value: gained });
      }
      const side = (d.nearby ?? []).some((c) => Math.abs(c.lat) >= 1.2 && Math.abs(c.lat) <= 4 && Math.abs(c.lon) <= 5);
      this.w2w = side && green ? this.w2w + 1 : 0;
      if (this.w2w === W2W_FRAMES) emit("wheelToWheel");
    }
    this.laps = me.total_laps;
    return out;
  }
}

/**
 * Événements d'une session indexée : même circuit, même type de séance, et
 * début de séance proche de l'horodatage du fichier résultats (à la durée de
 * la séance + 15 min près : l'horodatage du jeu peut marquer le début ou la fin).
 */
export function eventsForSession(events: LiveEvent[], track: string, startEpoch: number, durationS: number, isRace: boolean): LiveEvent[] {
  const t = track.toLowerCase();
  const tol = Math.max(0, durationS) + 900;
  return events.filter(
    (e) =>
      (e.session >= 10) === isRace &&
      Math.abs(e.sessionStart - startEpoch) <= tol &&
      (e.track.toLowerCase().includes(t) || t.includes(e.track.toLowerCase())),
  );
}
