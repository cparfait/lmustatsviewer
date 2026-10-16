/**
 * Enregistreur de séance pour le banc de rejeu (⑱).
 *
 * Les trames live sont allégées (le tracé, la voie des stands et l'instantané
 * REST ne changent presque pas et pèsent lourd) et échantillonnées à 2 Hz :
 * ~1 Mo par quart d'heure. Le fichier JSON Lines se rejoue hors piste avec
 * `npm run replay -- <fichier>` (détecteurs de l'ingénieur, sans le jeu).
 */

import { create } from "zustand";
import { live, queries } from "@/lib/api";
import { slimFrame, toJsonl, type RecordedFrame } from "./format";

/** Une trame par … ms au plus. */
export const RECORD_EVERY_MS = 500;
/** Plafond : 8 h à 2 Hz. */
export const RECORD_MAX_FRAMES = 57600;

interface RecorderState {
  recording: boolean;
  frames: number;
}

export const useRecorderStore = create<RecorderState>(() => ({ recording: false, frames: 0 }));

let buffer: RecordedFrame[] = [];
let off: (() => void) | null = null;
let t0 = 0;
let lastAt = -Infinity;

export async function startRecording(): Promise<void> {
  if (off) return;
  buffer = [];
  t0 = Date.now();
  lastAt = -Infinity;
  useRecorderStore.setState({ recording: true, frames: 0 });
  off = await live.onData((d) => {
    const now = Date.now();
    if (now - lastAt < RECORD_EVERY_MS || !d.connected) return;
    lastAt = now;
    buffer.push({ t: now - t0, d: slimFrame(d) });
    if (buffer.length > RECORD_MAX_FRAMES) buffer.shift();
    if (buffer.length % 20 === 0) useRecorderStore.setState({ frames: buffer.length });
  });
}

export function stopRecording(): void {
  off?.();
  off = null;
  useRecorderStore.setState({ recording: false, frames: buffer.length });
}

/** Enregistre la capture au chemin choisi ; renvoie false si annulé. */
export async function saveRecording(): Promise<boolean> {
  if (!buffer.length) return false;
  const { save } = await import("@tauri-apps/plugin-dialog");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const dest = await save({ defaultPath: `seance-${stamp}.jsonl`, filters: [{ name: "JSON Lines", extensions: ["jsonl"] }] });
  if (!dest) return false;
  await queries.saveText(dest, toJsonl(buffer));
  return true;
}
