/**
 * Format des séances enregistrées pour le banc de rejeu (module pur, sans
 * dépendance à Tauri : utilisable par la ligne de commande).
 */

import type { LiveData } from "@/lib/api";

export interface RecordedFrame {
  /** ms depuis le début de l'enregistrement. */
  t: number;
  d: LiveData;
}

/** Trame allégée : sans le tracé ni les données lourdes qui ne servent pas au rejeu. */
export function slimFrame(d: LiveData): LiveData {
  return { ...d, track_points: [], track_dists: [], pit_lane_points: [], rest: null };
}

export function toJsonl(frames: RecordedFrame[]): string {
  return frames.map((f) => JSON.stringify(f)).join("\n");
}

export function parseJsonl(text: string): RecordedFrame[] {
  const out: RecordedFrame[] = [];
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (s) out.push(JSON.parse(s) as RecordedFrame);
  }
  return out;
}
