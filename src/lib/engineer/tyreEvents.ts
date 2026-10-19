/**
 * Évènements pneus et choc (module pur, horloge en paramètre).
 *
 * - **Pneus sales** : au moins deux roues sur l'herbe, la terre ou le gravier
 *   (`surface` 2/3/4) un instant, en roulant → les gommes ramassent des débris,
 *   le grip est réduit au virage suivant.
 * - **Gros blocage** : une roue bloquée à vitesse soutenue → risque de plat sur le
 *   pneu. Deux réglages (`LockAlertMode`) : « strict » (défaut, roue quasi arrêtée
 *   ≥ 1 s au-dessus de 100 km/h, une seule annonce par freinage, 5 min par roue)
 *   et « sensible » (l'ancien : glissement < −0,85 pendant 0,6 s, 60 s par roue),
 *   qui parlait à chaque freinage appuyé.
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

/** Sensibilité de l'alerte de blocage (réglage de la radio). */
export type LockAlertMode = "strict" | "sensitive";

interface LockProfile {
  /** Glissement longitudinal sous lequel la roue est « bloquée » (−1 = arrêtée). */
  slip: number;
  /** Blocage tenu au moins ce temps (s). */
  holdS: number;
  minKmh: number;
  /** Silence par roue après une annonce (s). */
  wheelCooldownS: number;
  /** Silence toutes roues confondues (s) : les deux avant bloquent souvent ensemble. */
  anyCooldownS: number;
}

const LOCK_PROFILES: Record<LockAlertMode, LockProfile> = {
  strict: { slip: -0.95, holdS: 1.0, minKmh: 100, wheelCooldownS: 300, anyCooldownS: 90 },
  sensitive: { slip: -0.85, holdS: 0.6, minKmh: 80, wheelCooldownS: 60, anyCooldownS: 0 },
};

export function parseLockAlertMode(raw: string | undefined | null): LockAlertMode {
  return raw === "sensitive" ? "sensitive" : "strict";
}

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
  private lastAnyLock = -Infinity;
  private lock: LockProfile = LOCK_PROFILES.strict;
  private crashAt: number | null = null;
  private stoppedSince: number | null = null;
  private asked = false;

  reset() {
    this.dirtSince = null;
    this.lastDirt = -Infinity;
    this.lockSince = [null, null, null, null];
    this.lastLock = [-Infinity, -Infinity, -Infinity, -Infinity];
    this.lastAnyLock = -Infinity;
    this.crashAt = null;
    this.stoppedSince = null;
    this.asked = false;
  }

  setLockMode(mode: LockAlertMode) {
    this.lock = LOCK_PROFILES[mode];
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
    const lp = this.lock;
    for (let i = 0; i < 4; i++) {
      const locked = speedKmh >= lp.minKmh && wheels[i].slip_ratio < lp.slip;
      if (!locked) {
        this.lockSince[i] = null;
        continue;
      }
      this.lockSince[i] ??= nowS;
      if (
        nowS - this.lockSince[i]! >= lp.holdS &&
        nowS - this.lastLock[i] >= lp.wheelCooldownS &&
        nowS - this.lastAnyLock >= lp.anyCooldownS
      ) {
        this.lastLock[i] = nowS;
        this.lastAnyLock = nowS;
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
