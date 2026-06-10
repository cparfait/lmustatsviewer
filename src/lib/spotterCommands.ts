/**
 * Spotter Couche 2 — grammaire fermée + mapping intentions.
 *
 * Le vocabulaire reconnu vit **ici** (proche du moteur Vosk), par langue. Chaque
 * intention a une liste de phrases/synonymes courts ; `buildGrammar` en fait la
 * liste plate passée à Vosk (qui contraint sa sortie à ce vocabulaire), et
 * `matchIntent` retrouve l'intention depuis le texte reconnu.
 *
 * L'utilisateur peut **lister/modifier** ces phrases depuis la Config : les
 * overrides sont persistés par langue (`spotter_commands` JSON) et fusionnés
 * par-dessus les défauts (`getPhrases`). Édition de la langue active uniquement.
 *
 * Les **réponses** correspondantes sont construites dans `spotter.ts::buildAnswer`
 * à partir de `LiveData`. `repeat`/`mute` sont des commandes de contrôle gérées
 * directement par le hook (`useSpotter`).
 */

import { config } from "@/lib/api";

export type Intent =
  | "status"
  | "gap"
  | "fuel"
  | "tyres"
  | "position"
  | "pace"
  | "remaining"
  | "weather"
  | "repeat"
  | "mute";

/** Phrases reconnues par intention, pour chaque langue (codes 2 lettres). */
const GRAMMAR: Record<string, Record<Intent, string[]>> = {
  fr: {
    status: ["statut", "résumé", "situation", "point", "où j'en suis"],
    gap: ["écart", "quel écart", "gap", "devant", "derrière"],
    fuel: ["carburant", "essence", "fuel", "combien d'essence", "autonomie"],
    tyres: ["pneus", "gommes", "état des pneus", "usure"],
    position: ["position", "quelle position", "classement", "leader"],
    pace: ["rythme", "mon rythme", "dernier tour", "meilleur tour", "chrono"],
    remaining: ["restant", "combien de tours", "temps restant", "il reste"],
    weather: ["météo", "pluie", "temps", "température"],
    repeat: ["répète", "répéter", "redis", "quoi"],
    mute: ["silence", "tais-toi", "mute", "coupe", "active le son"],
  },
  en: {
    status: ["status", "summary", "where am i", "situation"],
    gap: ["gap", "what's the gap", "ahead", "behind"],
    fuel: ["fuel", "how much fuel", "petrol", "range"],
    tyres: ["tyres", "tires", "tyre", "wear", "tyre status"],
    position: ["position", "what position", "standings", "leader"],
    pace: ["pace", "my pace", "last lap", "best lap", "lap time"],
    remaining: ["remaining", "how many laps", "time left", "laps left"],
    weather: ["weather", "rain", "temperature", "is it raining"],
    repeat: ["repeat", "say again", "what", "again"],
    mute: ["mute", "quiet", "shut up", "silence", "unmute"],
  },
  es: {
    status: ["estado", "resumen", "situación", "dónde estoy"],
    gap: ["diferencia", "distancia", "delante", "detrás"],
    fuel: ["combustible", "gasolina", "cuánto combustible", "autonomía"],
    tyres: ["neumáticos", "gomas", "desgaste", "estado neumáticos"],
    position: ["posición", "qué posición", "clasificación", "líder"],
    pace: ["ritmo", "mi ritmo", "última vuelta", "mejor vuelta", "tiempo"],
    remaining: ["restante", "cuántas vueltas", "tiempo restante", "quedan"],
    weather: ["clima", "lluvia", "tiempo", "temperatura"],
    repeat: ["repite", "repetir", "otra vez", "qué"],
    mute: ["silencio", "cállate", "calla", "activa el sonido"],
  },
  de: {
    status: ["status", "zusammenfassung", "lage", "wo stehe ich"],
    gap: ["abstand", "lücke", "vorne", "hinten"],
    fuel: ["sprit", "benzin", "kraftstoff", "wie viel sprit", "reichweite"],
    tyres: ["reifen", "verschleiß", "reifenstatus"],
    position: ["position", "welche position", "platzierung", "führung"],
    pace: ["tempo", "mein tempo", "letzte runde", "beste runde", "rundenzeit"],
    remaining: ["restlich", "wie viele runden", "restzeit", "verbleibend"],
    weather: ["wetter", "regen", "temperatur"],
    repeat: ["wiederhole", "noch mal", "was"],
    mute: ["stumm", "ruhe", "halt den mund", "ton an"],
  },
};

/** Ordre de test : intentions spécifiques d'abord (évite qu'un mot court masque). */
const INTENT_ORDER: Intent[] = [
  "remaining",
  "weather",
  "position",
  "tyres",
  "fuel",
  "pace",
  "gap",
  "repeat",
  "mute",
  "status",
];

/** Ordre d'affichage dans l'UI (du plus utile au contrôle). */
export const INTENTS: Intent[] = [
  "status",
  "gap",
  "fuel",
  "tyres",
  "position",
  "pace",
  "remaining",
  "weather",
  "repeat",
  "mute",
];

const norm = (lang: string) => (lang || "en").slice(0, 2).toLowerCase();

function defaultTable(lang: string): Record<Intent, string[]> {
  return GRAMMAR[norm(lang)] ?? GRAMMAR.en;
}

// ── Moteur d'overrides (phrases personnalisées par langue) ────────────────────

/** lang → intention → phrases personnalisées (remplacent les défauts). */
type OverrideMap = Record<string, Partial<Record<Intent, string[]>>>;
let overrides: OverrideMap = {};

/** Normalise une liste de phrases : trim, minuscule, sans vides, dédupliquée. */
function clean(phrases: string[]): string[] {
  const seen = new Set<string>();
  for (const p of phrases) {
    const v = p.trim().toLowerCase();
    if (v) seen.add(v);
  }
  return [...seen];
}

/** Vrai si deux listes de phrases sont équivalentes (même ensemble). */
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

/** Phrases par défaut (bundle) d'une commande. */
export function defaultPhrases(lang: string, intent: Intent): string[] {
  return defaultTable(lang)[intent] ?? [];
}

/** Phrases courantes (personnalisées si présentes, sinon défaut). */
export function getPhrases(lang: string, intent: Intent): string[] {
  const ov = overrides[norm(lang)]?.[intent];
  return ov && ov.length ? ov : defaultPhrases(lang, intent);
}

/** Charge les overrides persistés. À appeler une fois au démarrage (store). */
export function initCommandOverrides(raw?: string | null) {
  overrides = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") overrides = parsed as OverrideMap;
    } catch {
      /* JSON corrompu — on repart des défauts */
    }
  }
}

async function persist() {
  for (const l of Object.keys(overrides)) {
    if (Object.keys(overrides[l]).length === 0) delete overrides[l];
  }
  await config.set("spotter_commands", JSON.stringify(overrides));
}

/**
 * Enregistre des phrases personnalisées pour une commande. Une liste vide ou
 * équivalente au défaut équivaut à une réinitialisation (évite une grammaire
 * trouée ou un override inutile).
 */
export async function setCommandOverride(
  lang: string,
  intent: Intent,
  phrases: string[],
) {
  const lng = norm(lang);
  const value = clean(phrases);
  if (value.length === 0 || sameSet(value, defaultPhrases(lang, intent))) {
    if (overrides[lng]) delete overrides[lng][intent];
  } else {
    overrides[lng] ??= {};
    overrides[lng][intent] = value;
  }
  await persist();
}

/** Réinitialise une commande à ses phrases par défaut. */
export async function resetCommandOverride(lang: string, intent: Intent) {
  const lng = norm(lang);
  if (overrides[lng]) delete overrides[lng][intent];
  await persist();
}

/** Réinitialise toutes les commandes de la langue. */
export async function resetAllCommandOverrides(lang: string) {
  delete overrides[norm(lang)];
  await persist();
}

/** Vrai si la commande a été personnalisée pour la langue. */
export function isCommandOverridden(lang: string, intent: Intent): boolean {
  const ov = overrides[norm(lang)]?.[intent];
  return !!ov && ov.length > 0;
}

// ── Grammaire + matching (utilisent les phrases courantes) ────────────────────

/** Liste plate de toutes les phrases d'une langue (grammaire passée à Vosk). */
export function buildGrammar(lang: string): string[] {
  const set = new Set<string>();
  for (const intent of INTENTS) {
    for (const p of getPhrases(lang, intent)) set.add(p.toLowerCase());
  }
  return [...set];
}

/** Texte reconnu → intention (null si rien ne correspond). */
export function matchIntent(text: string, lang: string): Intent | null {
  const hay = text.trim().toLowerCase();
  if (!hay) return null;
  // 1) Correspondance exacte (le texte EST une phrase connue).
  for (const intent of INTENT_ORDER) {
    if (getPhrases(lang, intent).some((p) => p === hay)) return intent;
  }
  // 2) Inclusion (la phrase apparaît dans le texte reconnu).
  for (const intent of INTENT_ORDER) {
    if (getPhrases(lang, intent).some((p) => hay.includes(p))) return intent;
  }
  return null;
}
