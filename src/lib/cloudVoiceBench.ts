/**
 * Banc d'écoute de la voix en ligne (module pur, testé par `radio.suite.ts`) :
 * phrases d'exemple par famille et **ce qui jouerait en course sans réseau**,
 * avec le motif. Même logique que `trySynthAndPlay` (`voice.ts`), réseau coupé :
 * une phrase « en direct » y serait demandée au fournisseur, ici Piper la dit.
 */

import { splitVariants } from "@/lib/engineer/variants";
import { assembleAllowed, CLOUD_PREP_ALERT_KEYS, CLOUD_PREP_KEYS, type CloudMode } from "@/lib/cloudVoicePrep";
import type { CloudNumbersMode } from "@/lib/cloudVoice";
import type { VoicePriority } from "@/lib/voice";

export type BenchFamily = "info" | "safety" | "spotter" | "coach" | "numbers";

export interface BenchPhrase {
  /** Suffixe sous `live.`. */
  key: string;
  priority: VoicePriority;
  /** Réponse au pilote (`announceAnswer`) : en direct malgré la priorité critique. */
  cloudOk?: boolean;
  /** Valeurs d'exemple, modifiables dans le banc (phrases chiffrées). */
  vars?: Record<string, string>;
}

/** Exemples chiffrés : carburant, écart, position, tours restants, virage… */
export const BENCH_NUMBER_PHRASES: readonly BenchPhrase[] = [
  { key: "vFuelLaps", priority: "critical", vars: { n: "3" } },
  { key: "spRivalAhead", priority: "critical", cloudOk: true, vars: { time: "2.4" } },
  { key: "vPosGain", priority: "chatty", vars: { p: "5" } },
  { key: "spLapsLeft_other", priority: "critical", vars: { count: "12" } },
  { key: "vCornerBrakeEarly", priority: "coach", vars: { n: "7", d: "10" } },
  { key: "vDeltaLoss", priority: "chatty", vars: { d: "0.4" } },
  { key: "vTimeRemaining", priority: "normal", vars: { min: "10" } },
  { key: "vBrakePads", priority: "normal", vars: { pct: "25" } },
];

/** Phrases du banc par famille (gabarits préparés par « Préparer la voix », plus les exemples chiffrés). */
export function benchFamilies(): { family: BenchFamily; phrases: BenchPhrase[] }[] {
  const spot = (k: string) => k.startsWith("vSpot");
  const coach = (k: string) => k.startsWith("vStint");
  return [
    { family: "info", phrases: CLOUD_PREP_KEYS.map((key) => ({ key, priority: "normal" as const })) },
    {
      family: "safety",
      phrases: CLOUD_PREP_ALERT_KEYS.filter((k) => !spot(k) && !coach(k)).map((key) => ({ key, priority: "critical" as const })),
    },
    { family: "spotter", phrases: CLOUD_PREP_ALERT_KEYS.filter(spot).map((key) => ({ key, priority: "spotter" as const })) },
    { family: "coach", phrases: CLOUD_PREP_ALERT_KEYS.filter(coach).map((key) => ({ key, priority: "coach" as const })) },
    { family: "numbers", phrases: BENCH_NUMBER_PHRASES.map((p) => ({ ...p, vars: { ...p.vars } })) },
  ];
}

/** Texte d'un gabarit pour le banc : 1re formulation, variables remplacées. */
export function benchText(template: string, vars: Record<string, string> = {}): string {
  const first = splitVariants(template)[0] ?? "";
  return first.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, v: string) => vars[v] ?? m);
}

/** Ce que le banc sait d'une phrase (sondé sans réseau par `voice.ts`). */
export interface BenchFacts {
  /** Voix en ligne activée et configurée. */
  cloudOn: boolean;
  mode: CloudMode;
  /** Phrase fixe (sans chiffre, courte) : préparable telle quelle. */
  fixed: boolean;
  /** Phrase fixe présente dans le cache disque. */
  wholeCached: boolean;
  /** Morceaux de l'assemblage, `null` si la phrase n'est pas assemblable. */
  segments: string[] | null;
  /** Morceaux absents du cache. */
  missing: string[];
  numbers: CloudNumbersMode;
}

export type BenchEngine = "cloud" | "assembled" | "piper";

export type BenchReason =
  | "cached" // phrase préparée, lue dans le cache
  | "assembled" // morceaux tous préparés
  | "cloudOff" // voix en ligne désactivée ou sans clé
  | "alertsLocal" // urgent + « Alertes en voix locale »
  | "notPrepared" // phrase fixe urgente pas encore préparée
  | "liveOnly" // information dite en direct : demande le réseau
  | "numbersOff" // « Annonces chiffrées » sur Piper
  | "notAssemblable" // chiffre, mais aucun gabarit reconnu (nom propre, texte libre…)
  | "segmentsMissing"; // assemblable, mais des morceaux manquent au cache

/** Ce qui jouerait en course **sans réseau**, et pourquoi. */
export function benchRoute(f: BenchFacts): { engine: BenchEngine; reason: BenchReason } {
  const piper = (reason: BenchReason) => ({ engine: "piper" as const, reason });
  if (!f.cloudOn) return piper("cloudOff");
  if (f.mode === "off") return piper("alertsLocal");
  if (f.fixed) {
    if (f.wholeCached) return { engine: "cloud", reason: "cached" };
    return piper(f.mode === "live" ? "liveOnly" : "notPrepared");
  }
  if (!assembleAllowed(f.mode, f.numbers)) return piper(f.numbers === "off" ? "numbersOff" : "liveOnly");
  if (!f.segments) return piper(f.mode === "live" ? "liveOnly" : "notAssemblable");
  if (f.missing.length) return piper("segmentsMissing");
  return { engine: "assembled", reason: "assembled" };
}
