/**
 * Enregistrement d'un **corpus réel** de trames coach (COACH-LIVE-SPEC.md §14.1).
 *
 * Toutes les suites de test du coach tournent sur des trames de **synthèse** :
 * trois virages espacés de 550 m, freinage en créneau, volant constant, aucune
 * chicane. Elles prouvent que le code fait ce que le code dit, mais rien sur la
 * justesse des seuils face à un vrai circuit (fenêtre de 150 m, appariement
 * d'apex à 40 m, glissement de roue, dérive de vitesse de passage…).
 *
 * Ce module capture le flux `live-data` réel, normalisé par `frameFromLive`,
 * exactement comme le fait le service coach. Le fichier obtenu est rejouable
 * hors Tauri par `replayEngine` : une session enregistrée une fois devient une
 * régression permanente.
 *
 * Volontairement **hors du service coach** : enregistrer ne doit rien changer au
 * comportement du coach, et le coach ne doit pas dépendre de l'enregistreur.
 */

import { live, coachRef } from "@/lib/api";
import { frameFromLive, type CoachFrame } from "./frame";

/**
 * Plafond de trames conservées en mémoire (~2 h à 20 Hz). Au-delà, on arrête
 * d'accumuler plutôt que de laisser la mémoire filer : un corpus de 2 h dépasse
 * de toute façon largement ce dont les tests ont besoin.
 */
const MAX_FRAMES = 150_000;

/**
 * Sérialise une trame en arrondissant les flottants à 4 décimales. Les canaux
 * bruts arrivent en double précision (`0.30000000000000004`) : l'arrondi divise
 * la taille du corpus par deux environ, sans aucune perte utile — 4 décimales
 * valent le dix-millième de km/h ou de mètre.
 */
function serializeFrame(f: CoachFrame): string {
  return JSON.stringify(f, (_k, v) =>
    typeof v === "number" && Number.isFinite(v) && !Number.isInteger(v)
      ? Number(v.toFixed(4))
      : v,
  );
}

let lines: string[] = [];
let unlisten: (() => void) | null = null;
let recording = false;
let capped = false;

/** Enregistrement en cours ? */
export function isRecording(): boolean {
  return recording;
}

/** Nombre de trames capturées jusqu'ici. */
export function recordedFrames(): number {
  return lines.length;
}

/** Le plafond `MAX_FRAMES` a-t-il été atteint (capture tronquée) ? */
export function isCapped(): boolean {
  return capped;
}

/**
 * Démarre la capture. Idempotent. S'abonne au flux **brut** (pas au flux lissé
 * de l'affichage, qui fausserait les mesures). Ne démarre PAS le polling :
 * l'enregistrement se fait pendant que la page Live ou un overlay est ouvert,
 * donc pendant que quelqu'un consomme déjà le flux.
 */
export async function startCorpusRecording(): Promise<void> {
  if (recording) return;
  recording = true;
  capped = false;
  lines = [];
  const off = await live.onData((d) => {
    if (!recording || capped) return;
    const f = frameFromLive(d);
    if (!f) return; // déconnecté / en pause / sans télémétrie
    if (lines.length >= MAX_FRAMES) {
      capped = true;
      return;
    }
    lines.push(serializeFrame(f));
  });
  // Arrêt demandé pendant l'attente de l'abonnement → on se désabonne aussitôt.
  if (!recording) {
    off();
    return;
  }
  unlisten = off;
}

/**
 * Arrête la capture et écrit le corpus sur disque. Renvoie le chemin du fichier,
 * ou `null` si aucune trame n'a été capturée (jeu non lancé, page Live fermée).
 */
export async function stopCorpusRecording(name: string): Promise<string | null> {
  recording = false;
  if (unlisten) {
    unlisten();
    unlisten = null;
  }
  if (lines.length === 0) return null;
  const content = lines.join("\n");
  lines = [];
  return coachRef.saveCorpus(name, content);
}

/** Abandonne la capture en cours sans rien écrire. */
export function cancelCorpusRecording(): void {
  recording = false;
  capped = false;
  lines = [];
  if (unlisten) {
    unlisten();
    unlisten = null;
  }
}
