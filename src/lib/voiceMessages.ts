/**
 * Catalogue des annonces vocales Live + moteur de personnalisation.
 *
 * Les textes par défaut vivent dans les bundles i18n (`live.v*`). L'utilisateur
 * peut les **personnaliser** depuis la Config : on injecte alors le texte custom
 * dans i18next via `addResource()` — les appels `t("live.v*")` dans `Live.tsx`
 * renvoient automatiquement la version personnalisée, **interpolation comprise**.
 *
 * Périmètre (décision 2026-06-02) : édition de la **langue active uniquement**.
 * Les overrides sont néanmoins stockés par langue (`{ fr: {...}, en: {...} }`)
 * pour qu'un texte FR ne soit jamais prononcé dans une session EN.
 */

import i18n from "@/i18n";
import { config } from "@/lib/api";
import fr from "@/i18n/fr";
import en from "@/i18n/en";
import es from "@/i18n/es";
import de from "@/i18n/de";

// ── Catalogue (déclencheurs documentés via les clés `vmWhen*`) ─────────────────

export interface VoiceMsgDef {
  /** Suffixe de clé i18n sous `live.` (ex. « vFlagGreen »). */
  key: string;
  /** Placeholders obligatoires à conserver dans le texte (ex. ["n"]). */
  vars: string[];
  /** Valeurs d'exemple pour le bouton « Tester ». */
  sample?: Record<string, string | number>;
  /** Vrai si l'annonce est suivie d'un temps au tour parlé (vBestLap/vLastLap). */
  appendTime?: boolean;
}

export interface VoiceMsgGroup {
  /** Identifiant — libellé i18n `vmCat<Id>`, icône mappée dans la modale. */
  id:
    | "flags"
    | "fuel"
    | "tyres"
    | "positions"
    | "rivals"
    | "sectors"
    | "laps"
    | "incidents"
    | "mech"
    | "pits"
    | "race"
    | "weather"
    | "fastest";
  items: VoiceMsgDef[];
}

export const VOICE_MESSAGE_GROUPS: VoiceMsgGroup[] = [
  {
    id: "flags",
    items: [
      { key: "vFlagGreen", vars: [] },
      { key: "vFlagYellow", vars: [] },
      { key: "vFlagFcy", vars: [] },
      { key: "vFlagStopped", vars: [] },
    ],
  },
  {
    id: "fuel",
    items: [
      { key: "vFuelLaps", vars: ["n"], sample: { n: 3 } },
      { key: "vRefuelNeeded", vars: [] },
    ],
  },
  {
    id: "tyres",
    items: [
      { key: "vColdTyres", vars: [] },
      { key: "vTyreWear", vars: [] },
      { key: "vPuncture", vars: [] },
      { key: "vTyreOverheat", vars: [] },
    ],
  },
  {
    id: "mech",
    items: [
      { key: "vWheelDetached", vars: [] },
      { key: "vBrakeOverheat", vars: [] },
      { key: "vEngineTemp", vars: [] },
    ],
  },
  {
    id: "positions",
    items: [
      { key: "vPosGain", vars: ["p"], sample: { p: 3 } },
      { key: "vPosLoss", vars: ["p"], sample: { p: 5 } },
      { key: "vTakeLead", vars: [] },
      { key: "vPodium", vars: ["p"], sample: { p: 2 } },
    ],
  },
  {
    id: "rivals",
    items: [
      { key: "vGapAhead", vars: [] },
      { key: "vUnderAttack", vars: [] },
      { key: "vGapLeader", vars: ["time"], sample: { time: "12 secondes" } },
    ],
  },
  {
    id: "laps",
    items: [
      { key: "vBestLap", vars: [], appendTime: true },
      { key: "vLastLap", vars: [], appendTime: true },
    ],
  },
  {
    id: "sectors",
    items: [
      { key: "vBestSector", vars: ["sector"], sample: { sector: "S2" } },
      { key: "vPurpleSector", vars: [] },
      { key: "vDeltaGain", vars: ["d"], sample: { d: "0.3" } },
      { key: "vDeltaLoss", vars: ["d"], sample: { d: "0.2" } },
    ],
  },
  {
    id: "incidents",
    items: [
      { key: "vPenalty", vars: [] },
      { key: "vOverheat", vars: [] },
      { key: "vDamage", vars: [] },
    ],
  },
  {
    id: "pits",
    items: [
      { key: "vPitRequest", vars: [] },
      { key: "vPitExitLimiter", vars: [] },
      { key: "vPitDone", vars: [] },
    ],
  },
  {
    id: "race",
    items: [
      { key: "vFinalLap", vars: [] },
      { key: "vHalfway", vars: [] },
      { key: "vBlueFlag", vars: [] },
      { key: "vTimeRemaining", vars: ["min"], sample: { min: 5 } },
      { key: "vLastMinute", vars: [] },
    ],
  },
  {
    id: "weather",
    items: [
      { key: "vRainStart", vars: [] },
      { key: "vRainStop", vars: [] },
      { key: "vRainHeavier", vars: [] },
    ],
  },
  {
    id: "fastest",
    items: [
      { key: "vFastest", vars: ["driver", "time"], sample: { driver: "Martin", time: "1 minute 22.5" } },
      { key: "vFastestYou", vars: ["time"], sample: { time: "1 minute 22.5" } },
    ],
  },
];

// ── Moteur d'overrides ────────────────────────────────────────────────────────

const NS = "translation";
const SOURCES: Record<string, { live: Record<string, string> }> = {
  fr: fr as never,
  en: en as never,
  es: es as never,
  de: de as never,
};
const fullKey = (suffix: string) => `live.${suffix}`;
const norm = (lang: string) => (lang || "fr").slice(0, 2).toLowerCase();

/** lang → suffixe → texte personnalisé. */
type OverrideMap = Record<string, Record<string, string>>;
let overrides: OverrideMap = {};

/** Texte par défaut (bundle i18n) d'une annonce. */
export function defaultText(lang: string, suffix: string): string {
  const src = SOURCES[norm(lang)] ?? SOURCES.fr;
  return src?.live?.[suffix] ?? "";
}

/**
 * Charge les overrides persistés et les injecte dans i18next. À appeler une
 * fois au démarrage (après l'init i18n), depuis le store applicatif.
 */
export function initVoiceOverrides(raw?: string | null) {
  overrides = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") overrides = parsed as OverrideMap;
    } catch {
      /* JSON corrompu — on repart des défauts */
    }
  }
  for (const lng of Object.keys(overrides)) {
    for (const [suffix, text] of Object.entries(overrides[lng])) {
      i18n.addResource(lng, NS, fullKey(suffix), text);
    }
  }
}

/** Texte courant (personnalisé si présent, sinon défaut). */
export function getMessageText(lang: string, suffix: string): string {
  return overrides[norm(lang)]?.[suffix] ?? defaultText(lang, suffix);
}

async function persist() {
  for (const l of Object.keys(overrides)) {
    if (Object.keys(overrides[l]).length === 0) delete overrides[l];
  }
  await config.set("voice_overrides", JSON.stringify(overrides));
}

/**
 * Enregistre un texte personnalisé. Un texte vide ou identique au défaut
 * équivaut à une réinitialisation (on évite de stocker un override inutile ou
 * une annonce muette/cassée).
 */
export async function setMessageOverride(lang: string, suffix: string, text: string) {
  const lng = norm(lang);
  const value = text.trim();
  if (value === "" || value === defaultText(lang, suffix)) {
    if (overrides[lng]) delete overrides[lng][suffix];
    i18n.addResource(lng, NS, fullKey(suffix), defaultText(lang, suffix));
  } else {
    overrides[lng] ??= {};
    overrides[lng][suffix] = value;
    i18n.addResource(lng, NS, fullKey(suffix), value);
  }
  await persist();
}

/** Réinitialise une annonce au texte par défaut. */
export async function resetMessageOverride(lang: string, suffix: string) {
  const lng = norm(lang);
  if (overrides[lng]) delete overrides[lng][suffix];
  i18n.addResource(lng, NS, fullKey(suffix), defaultText(lang, suffix));
  await persist();
}

/** Réinitialise toutes les annonces de la langue. */
export async function resetAllOverrides(lang: string) {
  const lng = norm(lang);
  if (overrides[lng]) {
    for (const suffix of Object.keys(overrides[lng])) {
      i18n.addResource(lng, NS, fullKey(suffix), defaultText(lang, suffix));
    }
    delete overrides[lng];
  }
  await persist();
}

/** Remplit les `{{var}}` d'un texte avec des valeurs (pour la prévisualisation). */
export function fillVars(text: string, sample?: Record<string, string | number>): string {
  if (!sample) return text;
  let out = text;
  for (const [k, v] of Object.entries(sample)) {
    out = out.replace(new RegExp(`{{\\s*${k}\\s*}}`, "g"), String(v));
  }
  return out;
}

/** Variables obligatoires absentes du texte (pour avertir l'utilisateur). */
export function missingVars(text: string, def: VoiceMsgDef): string[] {
  return def.vars.filter(
    (v) => !new RegExp(`{{\\s*${v}\\s*}}`).test(text),
  );
}
