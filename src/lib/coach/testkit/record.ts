/**
 * Enregistreur de frames coach (COACH-LIVE-SPEC.md §14.1) — **format JSONL
 * rejouable**. Une frame normalisée (`CoachFrame`) par ligne : 30 min de roulage =
 * corpus rejouable à vie par le harnais (`replayEngine`).
 *
 * Partie **pure** (sérialisation / parsing / accumulation), sans I/O disque : le
 * `FrameRecorder` accumule les frames poussées par l'appelant, qui écrit ensuite
 * `toJsonl()` où il veut (fichier, presse-papier…). Le branchement live typique :
 *
 *   const rec = new FrameRecorder();
 *   const off = await live.onData((d) => { const f = frameFromLive(d); if (f) rec.push(f); });
 *   // …plus tard : écrire rec.toJsonl() sur disque.
 */

import type { CoachFrame } from "../frame";

/** Sérialise des frames en JSON Lines (une frame par ligne). */
export function serializeFramesJsonl(frames: CoachFrame[]): string {
  return frames.map((f) => JSON.stringify(f)).join("\n");
}

/** Parse un corpus JSON Lines en frames (lignes vides ignorées). */
export function parseFramesJsonl(text: string): CoachFrame[] {
  const out: CoachFrame[] = [];
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    out.push(JSON.parse(s) as CoachFrame);
  }
  return out;
}

/** Accumulateur de frames (borné) pour une capture de session. */
export class FrameRecorder {
  private frames: CoachFrame[] = [];
  /** Nombre max de frames conservées (anneau) ; 0 = illimité. */
  constructor(private readonly cap = 0) {}

  push(frame: CoachFrame): void {
    this.frames.push(frame);
    if (this.cap > 0 && this.frames.length > this.cap) this.frames.shift();
  }

  count(): number {
    return this.frames.length;
  }

  clear(): void {
    this.frames = [];
  }

  toJsonl(): string {
    return serializeFramesJsonl(this.frames);
  }
}
