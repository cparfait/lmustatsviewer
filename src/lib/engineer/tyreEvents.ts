/**
 * Évènements pneus et choc (module pur, horloge en paramètre).
 *
 * - **Pneus sales** : au moins deux roues sur l'herbe, la terre ou le gravier
 *   (`surface` 2/3/4) un instant, en roulant → les gommes ramassent des débris,
 *   le grip est réduit au virage suivant.
 * - **Gros blocage** : une roue bloquée nette (glissement < −0,85) pendant plus
 *   d'une demi-seconde à vitesse soutenue → risque de plat sur le pneu.
 * - **« Tu vas bien ? »** : après un choc (dégâts en hausse brutale), si la
 *   voiture reste arrêtée, l'ingénieur prend des nouvelles ; quand elle repart,
 *   il annonce qu'il surveille les dégâts.
 */

import type { LiveWheel } from "@/lib/api";

/** Surfaces rF2 qui salissent les pneus : herbe, terre, gravier. */
const DIRTY = new Set([2, 3, 4]);
const DIRT_HOLD_S = 0.4;
const DIRT_COOLDOWN_S = 20;
const DIRT_MIN_KMH = 50;

const LOCK_SLIP = -0.85;
const LOCK_HOLD_S = 0.6;
const LOCK_MIN_KMH = 80;
const LOCK_COOLDOWN_S = 60;

/** Voiture arrêtée depuis ce délai après un choc → « tu vas bien ? » (s). */
const CRASH_STOP_S = 3;
/** Le choc doit dater de moins de ce délai (s). */
const CRASH_WINDOW_S = 12;

export type TyreEvent =
  | { kind: "dirty" }
  | { kind: "lockFlatSpot"; wheel: number }
  | { kind: "crashCheck" }
  | { kind: "crashResume" };

export class TyreEventWatcher {
  private dirtSince: number | null = null;
  private lastDirt = -Infinity;
  private lockSince: (number | null)[] = [null, null, null, null];
  private lastLock = [-Infinity, -Infinity, -Infinity, -Infinity];
  private crashAt: number | null = null;
  private stoppedSince: number | null = null;
  private asked = false;

  reset() {
    this.dirtSince = null;
    this.lastDirt = -Infinity;
    this.lockSince = [null, null, null, null];
    this.lastLock = [-Infinity, -Infinity, -Infinity, -Infinity];
    this.crashAt = null;
    this.stoppedSince = null;
    this.asked = false;
  }

  /** À appeler quand l'ingénieur détecte un choc (dégâts en hausse brutale). */
  noteCrash(nowS: number) {
    this.crashAt = nowS;
    this.asked = false;
    this.stoppedSince = null;
  }

  update(nowS: number, wheels: LiveWheel[] | undefined, speedKmh: number, inPits: boolean): TyreEvent[] {
    const out: TyreEvent[] = [];
    if (!wheels || wheels.length !== 4 || inPits) {
      this.dirtSince = null;
      return out;
    }
    // Pneus sales.
    const dirty = wheels.filter((w) => DIRTY.has(w.surface)).length >= 2 && speedKmh >= DIRT_MIN_KMH;
    if (dirty) {
      this.dirtSince ??= nowS;
      if (nowS - this.dirtSince >= DIRT_HOLD_S && nowS - this.lastDirt >= DIRT_COOLDOWN_S) {
        this.lastDirt = nowS;
        out.push({ kind: "dirty" });
      }
    } else {
      this.dirtSince = null;
    }
    // Gros blocage (plat possible).
    for (let i = 0; i < 4; i++) {
      const locked = speedKmh >= LOCK_MIN_KMH && wheels[i].slip_ratio < LOCK_SLIP;
      if (!locked) {
        this.lockSince[i] = null;
        continue;
      }
      this.lockSince[i] ??= nowS;
      if (nowS - this.lockSince[i]! >= LOCK_HOLD_S && nowS - this.lastLock[i] >= LOCK_COOLDOWN_S) {
        this.lastLock[i] = nowS;
        this.lockSince[i] = null;
        out.push({ kind: "lockFlatSpot", wheel: i });
      }
    }
    // Après un choc : arrêt prolongé → « tu vas bien ? », puis reprise.
    if (this.crashAt != null) {
      if (nowS - this.crashAt > CRASH_WINDOW_S && !this.asked) {
        this.crashAt = null;
      } else if (speedKmh < 5) {
        this.stoppedSince ??= nowS;
        if (!this.asked && nowS - this.stoppedSince >= CRASH_STOP_S) {
          this.asked = true;
          out.push({ kind: "crashCheck" });
        }
      } else {
        this.stoppedSince = null;
        if (this.asked && speedKmh > 30) {
          this.asked = false;
          this.crashAt = null;
          out.push({ kind: "crashResume" });
        }
      }
    }
    return out;
  }
}
