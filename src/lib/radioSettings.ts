/**
 * Réglages de la radio ajoutés avec la passe « annonces de course » (module pur) :
 * familles d'annonces activables une à une, boutons du volant par action,
 * préréglages de radio, fenêtres de pression. Types, valeurs par défaut et
 * lecture tolérante des valeurs stockées (JSON dans la table `config`).
 */

import type { WheelBinding } from "@/lib/api";
import type { PressureUnit, PressureWindow } from "@/lib/engineer/pressures";
import { sanitizeTuning, type SpotterTuning } from "@/lib/engineer/proximity";

/** Familles d'annonces ajoutées (toutes actives par défaut : information pure). */
export const RADIO_EXTRAS = [
  "safetyCar",
  "penaltyDetail",
  "trackLimits",
  "gameWarnings",
  "pressure",
  "pitTraffic",
  "endgame",
  "tyreEvents",
  "crashCheck",
  "cornerNames",
  "rivalNames",
  "classGaps",
  "voiceNotes",
] as const;
export type RadioExtra = (typeof RADIO_EXTRAS)[number];

export const DEFAULT_EXTRAS: Record<RadioExtra, boolean> = Object.fromEntries(
  RADIO_EXTRAS.map((k) => [k, true]),
) as Record<RadioExtra, boolean>;

export function parseExtras(raw: string | undefined | null): Record<RadioExtra, boolean> {
  const out = { ...DEFAULT_EXTRAS };
  try {
    const v = JSON.parse(raw || "{}") as Record<string, unknown>;
    for (const k of RADIO_EXTRAS) if (typeof v[k] === "boolean") out[k] = v[k] as boolean;
  } catch {
    /* valeur abîmée : défauts */
  }
  return out;
}

/** Actions qu'on peut lier à un bouton du volant (en plus du push-to-talk). */
export const WHEEL_ACTIONS = ["mute", "repeat", "status", "volumeUp", "volumeDown", "spotter", "ackBox", "voiceNote"] as const;
export type WheelAction = (typeof WHEEL_ACTIONS)[number];

export function parseWheelActions(raw: string | undefined | null): Partial<Record<WheelAction, WheelBinding>> {
  const out: Partial<Record<WheelAction, WheelBinding>> = {};
  try {
    const v = JSON.parse(raw || "{}") as Record<string, unknown>;
    for (const a of WHEEL_ACTIONS) {
      const b = v[a] as WheelBinding | undefined;
      if (b && typeof b === "object" && typeof b.kind === "string") out[a] = b;
    }
  } catch {
    /* valeur abîmée : aucune liaison */
  }
  return out;
}

export function parseSpotterTuning(raw: string | undefined | null): SpotterTuning {
  try {
    return sanitizeTuning(JSON.parse(raw || "{}") as Partial<SpotterTuning>);
  } catch {
    return sanitizeTuning(null);
  }
}

export function parsePressureUnit(raw: string | undefined | null): PressureUnit {
  return raw === "bar" || raw === "psi" ? raw : "kPa";
}

/** Fenêtres de pression à chaud par classe (kPa). */
export function parsePressureWindows(raw: string | undefined | null): Record<string, PressureWindow> {
  const out: Record<string, PressureWindow> = {};
  try {
    const v = JSON.parse(raw || "{}") as Record<string, { min?: unknown; max?: unknown }>;
    for (const [cls, w] of Object.entries(v)) {
      const min = Number(w?.min);
      const max = Number(w?.max);
      if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > min) out[cls] = { min, max };
    }
  } catch {
    /* valeur abîmée : aucune fenêtre */
  }
  return out;
}

/**
 * Préréglages de radio : un clic règle d'un coup débit, phases, budgets, spotter
 * et familles d'annonces. « Personnalisé » = réglages laissés tels quels.
 */
export type RadioPreset = "custom" | "sprint" | "endurance" | "online";

export interface PresetValues {
  radioMode: "engineer" | "full";
  radioPhases: boolean;
  radioBudgets: boolean;
  proximitySpotter: boolean;
  extras: Partial<Record<RadioExtra, boolean>>;
}

export const RADIO_PRESETS: Record<Exclude<RadioPreset, "custom">, PresetValues> = {
  // Course courte : spotter, fin de course, peu de stratégie.
  sprint: {
    radioMode: "engineer",
    radioPhases: true,
    radioBudgets: true,
    proximitySpotter: true,
    extras: { endgame: true, pitTraffic: false, pressure: true, tyreEvents: true },
  },
  // Endurance : stratégie, trafic aux stands, réveil, moins de bavardage.
  endurance: {
    radioMode: "engineer",
    radioPhases: true,
    radioBudgets: true,
    proximitySpotter: true,
    extras: { endgame: false, pitTraffic: true, pressure: true, tyreEvents: true, safetyCar: true },
  },
  // En ligne : tout, avec le spotter et les avertissements du jeu.
  online: {
    radioMode: "engineer",
    radioPhases: true,
    radioBudgets: true,
    proximitySpotter: true,
    extras: { endgame: true, pitTraffic: true, gameWarnings: true, trackLimits: true, safetyCar: true },
  },
};

export function parsePreset(raw: string | undefined | null): RadioPreset {
  return raw === "sprint" || raw === "endurance" || raw === "online" ? raw : "custom";
}
