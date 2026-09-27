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
  | "pit"
  | "rival"
  | "ahead"
  | "behind"
  | "classLeader"
  | "closing"
  | "traffic"
  | "forecast"
  | "tyreTemp"
  | "brakeBias"
  | "battery"
  | "sessionBest"
  | "pitWindow"
  | "stops"
  | "ackBox"
  | "stayOut"
  | "watchCancel"
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
    pit: ["stand", "aux stands", "si je rentre", "arrêt", "si je m'arrête", "pit"],
    rival: ["rival", "bagarre", "bataille", "adversaire", "duel"],
    ahead: ["qui est devant", "voiture devant", "pilote devant"],
    behind: ["qui est derrière", "voiture derrière", "pilote derrière"],
    classLeader: ["qui mène", "qui est premier", "leader de ma classe", "premier de ma classe"],
    closing: ["je reviens", "est-ce que je reviens", "je rattrape", "il revient"],
    traffic: ["trafic", "retardataires", "quand je rattrape le trafic"],
    forecast: ["prévisions", "prévision météo", "va-t-il pleuvoir"],
    tyreTemp: ["température des pneus", "température pneus"],
    brakeBias: ["répartition", "répartition de freinage"],
    battery: ["batterie", "énergie", "hybride"],
    sessionBest: ["meilleur tour de la session", "meilleur temps de la session"],
    pitWindow: ["quand m'arrêter", "quand je m'arrête", "fenêtre d'arrêt", "jusqu'à quand"],
    stops: ["combien d'arrêts", "nombre d'arrêts"],
    ackBox: ["compris", "reçu", "bien reçu", "je rentre"],
    stayOut: ["je reste dehors", "on reste dehors"],
    watchCancel: ["annule les alertes", "oublie les alertes"],
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
    pit: ["pit", "pit stop", "if i pit", "box", "should i pit", "pit now"],
    rival: ["rival", "battle", "who am i racing", "fight", "duel"],
    ahead: ["who is ahead", "car ahead", "who's in front"],
    behind: ["who is behind", "car behind"],
    classLeader: ["who is leading", "class leader", "who is first"],
    closing: ["am i catching", "am i closing", "is he catching"],
    traffic: ["traffic", "backmarkers", "slower cars"],
    forecast: ["forecast", "weather forecast", "will it rain"],
    tyreTemp: ["tyre temperature", "tire temperature", "tyre temps"],
    brakeBias: ["brake bias", "brake balance"],
    battery: ["battery", "energy", "hybrid"],
    sessionBest: ["session best", "fastest lap", "best lap of the session"],
    pitWindow: ["when do i pit", "pit window", "when should i pit"],
    stops: ["how many stops", "number of stops"],
    ackBox: ["copy", "copy that", "understood", "roger"],
    stayOut: ["staying out", "i'm staying out", "stay out"],
    watchCancel: ["cancel alerts", "clear alerts"],
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
    pit: ["boxes", "entrar a boxes", "parada", "si entro", "pit"],
    rival: ["rival", "batalla", "pelea", "adversario", "duelo"],
    ahead: ["quién va delante", "coche de delante"],
    behind: ["quién va detrás", "coche de detrás"],
    classLeader: ["quién lidera", "quién va primero", "líder de mi clase"],
    closing: ["le estoy alcanzando", "me acerco", "se acerca"],
    traffic: ["tráfico", "doblados", "coches lentos"],
    forecast: ["pronóstico", "va a llover", "previsión"],
    tyreTemp: ["temperatura de neumáticos", "temperatura neumáticos"],
    brakeBias: ["reparto de frenada", "reparto de frenos"],
    battery: ["batería", "energía", "híbrido"],
    sessionBest: ["mejor vuelta de la sesión", "vuelta rápida"],
    pitWindow: ["cuándo paro", "ventana de parada", "cuándo entro"],
    stops: ["cuántas paradas", "número de paradas"],
    ackBox: ["entendido", "recibido", "copiado"],
    stayOut: ["me quedo fuera", "sigo en pista"],
    watchCancel: ["cancela las alertas", "borra las alertas"],
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
    pit: ["box", "boxenstopp", "wenn ich reinkomme", "boxen", "pit"],
    rival: ["rivale", "duell", "kampf", "gegner"],
    ahead: ["wer ist vor mir", "auto vor mir"],
    behind: ["wer ist hinter mir", "auto hinter mir"],
    classLeader: ["wer führt", "wer ist erster", "klassenführer"],
    closing: ["hole ich auf", "komme ich ran", "holt er auf"],
    traffic: ["verkehr", "überrundete", "langsamere autos"],
    forecast: ["vorhersage", "wettervorhersage", "wird es regnen"],
    tyreTemp: ["reifentemperatur", "temperatur der reifen"],
    brakeBias: ["bremsbalance", "bremsverteilung"],
    battery: ["batterie", "energie", "hybrid"],
    sessionBest: ["schnellste runde", "bestzeit der session"],
    pitWindow: ["wann komme ich rein", "boxenfenster", "wann muss ich rein"],
    stops: ["wie viele stopps", "anzahl der stopps"],
    ackBox: ["verstanden", "roger", "kopiert"],
    stayOut: ["ich bleibe draußen", "bleibe draußen"],
    watchCancel: ["alarme löschen", "alarme abbrechen"],
    repeat: ["wiederhole", "noch mal", "was"],
    mute: ["stumm", "ruhe", "halt den mund", "ton an"],
  },
};

/** Ordre de test : intentions spécifiques d'abord (évite qu'un mot court masque). */
const INTENT_ORDER: Intent[] = [
  "watchCancel",
  "stayOut",
  "ackBox",
  "sessionBest",
  "pitWindow",
  "stops",
  "tyreTemp",
  "forecast",
  "classLeader",
  "closing",
  "traffic",
  "battery",
  "brakeBias",
  "ahead",
  "behind",
  "remaining",
  "weather",
  "pit",
  "rival",
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
  "pit",
  "rival",
  "ahead",
  "behind",
  "classLeader",
  "closing",
  "traffic",
  "pitWindow",
  "stops",
  "forecast",
  "tyreTemp",
  "brakeBias",
  "battery",
  "sessionBest",
  "ackBox",
  "stayOut",
  "watchCancel",
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
