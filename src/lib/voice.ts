/**
 * Synthèse vocale (Web Speech API) pour les annonces de la page Live.
 *
 * Deux axes de qualité :
 *  - **Timbre** : on privilégie les voix neuronales « Natural » exposées par
 *    WebView2/Edge (nettement meilleures que les voix SAPI robotiques), puis une
 *    voix masculine selon une heuristique de nom. On ne dégrade plus le `pitch`
 *    des voix neuronales.
 *  - **Diffusion** : file d'attente à **priorité + fraîcheur**. Une annonce
 *    critique (drapeau, pénalité, carburant) interrompt une annonce bavarde en
 *    cours ; les callouts périmés (chronos en retard) sont **abandonnés** plutôt
 *    qu'empilés — en course, une info en retard est pire que pas d'info.
 */

import {
  radioStart,
  radioEnd,
  radioInterrupt,
  cancelRadio,
  radioOn,
  radioVoiceChain,
  audioContext,
  audioOutput,
  setMasterVolume,
} from "@/lib/radioFx";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/api";

export type VoicePriority = "critical" | "normal" | "chatty" | "coach";
export type VoiceEngine = "piper" | "system";

/** Code langue app (2 lettres) → BCP-47. */
export const SPEECH_LANG: Record<string, string> = {
  fr: "fr-FR",
  en: "en-GB",
  es: "es-ES",
  de: "de-DE",
};

/** Normalise un code langue (« fr-FR » → « fr »). */
const norm = (lang: string) => (lang || "en").slice(0, 2).toLowerCase();

// Heuristiques de nom (les libellés varient selon l'OS / le navigateur).
const NATURAL_HINTS = ["natural", "neural", "online"];
const MALE_VOICE_HINTS = [
  "paul", "claude", "david", "mark", "george", "guy", "ryan", "thomas",
  "daniel", "guillaume", "henri", "nicolas", "stefan", "conrad", "pablo",
  "jorge", "diego", "alvaro", "remy", "male", "homme", "männlich", "hombre",
  "masculin",
];
const FEMALE_VOICE_HINTS = [
  "hortense", "julie", "denise", "zira", "hazel", "susan", "linda", "aria",
  "jenny", "helena", "laura", "sabina", "elvira", "hedda", "katja", "amala",
  "vivienne", "female", "femme", "weiblich", "mujer", "féminin",
];

let cachedVoices: SpeechSynthesisVoice[] = [];
function refreshVoices() {
  if (speechSupported()) cachedVoices = window.speechSynthesis.getVoices();
}
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  refreshVoices();
  window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
}

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Toutes les voix installées (rafraîchies si le cache est vide). */
export function listVoices(): SpeechSynthesisVoice[] {
  if (cachedVoices.length === 0) refreshVoices();
  return cachedVoices;
}

/** Voix disponibles pour une langue (vide si aucune). */
export function listVoicesForLang(lang: string): SpeechSynthesisVoice[] {
  const prefix = norm(lang);
  return listVoices().filter((v) => v.lang.toLowerCase().startsWith(prefix));
}

/** Vrai si la voix est une voix neuronale « Natural / Neural / Online ». */
export function isNaturalVoice(v: SpeechSynthesisVoice): boolean {
  const n = v.name.toLowerCase();
  return NATURAL_HINTS.some((h) => n.includes(h));
}

/**
 * Score de préférence d'une voix :
 *  - neuronale (+4) — gros gain de timbre ;
 *  - locale (+1) — pas de latence réseau, préférable en course ;
 *  - masculine (+2) sinon non-féminine (+1).
 */
function voiceScore(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  let s = 0;
  if (NATURAL_HINTS.some((h) => n.includes(h))) s += 4;
  if (v.localService) s += 1;
  if (MALE_VOICE_HINTS.some((h) => n.includes(h))) s += 2;
  else if (!FEMALE_VOICE_HINTS.some((h) => n.includes(h))) s += 1;
  return s;
}

// Préférences utilisateur (alimentées depuis la config applicative).
// La voix préférée est mémorisée **par langue** (code 2 lettres) : une voix FR
// ne doit pas être employée pour prononcer un texte EN.
let preferredByLang: Record<string, string> = {};
/** Voix Piper choisie par langue (id de modèle) — "" = défaut de la langue. */
let preferredPiperByLang: Record<string, string> = {};
/** Locuteur choisi par langue (modèles multi-locuteur, ex. MLS) — 0 par défaut. */
let preferredSpeakerByLang: Record<string, number> = {};
let speechRate = 1.05;
/** Volume des annonces (0–1) — pour baisser le son et l'équilibrer avec le jeu. */
let speechVolume = 0.3;
/** Moteur de synthèse : Piper neuronal embarqué (défaut) ou voix système. */
let engine: VoiceEngine = "piper";
/** Langues où Piper a échoué/est absent → on n'y retente pas (repli direct). */
const piperUnavailable = new Set<string>();

/** Applique les préférences utilisateur (voix par langue, vitesse, volume, moteur). */
export function configureVoice(opts: {
  voiceByLang?: Record<string, string>;
  piperByLang?: Record<string, string>;
  speakerByLang?: Record<string, number>;
  rate?: number;
  volume?: number;
  engine?: VoiceEngine;
}) {
  if (opts.voiceByLang !== undefined) preferredByLang = opts.voiceByLang;
  if (opts.piperByLang !== undefined) preferredPiperByLang = opts.piperByLang;
  if (opts.speakerByLang !== undefined) preferredSpeakerByLang = opts.speakerByLang;
  if (opts.rate !== undefined && opts.rate > 0) speechRate = opts.rate;
  if (opts.volume !== undefined) {
    speechVolume = Math.max(0, Math.min(1, opts.volume));
    setMasterVolume(speechVolume); // voix Piper + bips
  }
  if (opts.engine !== undefined) engine = opts.engine;
}

/**
 * Voix retenue pour une langue : la voix préférée de l'utilisateur **pour cette
 * langue** si elle est disponible, sinon la meilleure selon `voiceScore` parmi
 * les voix de la langue.
 */
export function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const all = listVoices();
  const preferred = preferredByLang[norm(lang)];
  if (preferred) {
    const chosen = all.find((v) => v.voiceURI === preferred);
    if (chosen) return chosen;
  }
  const pool = listVoicesForLang(lang);
  const candidates = pool.length ? pool : all;
  if (candidates.length === 0) return null;
  return candidates.reduce((best, v) => (voiceScore(v) > voiceScore(best) ? v : best));
}

// ── File à priorité + fraîcheur ───────────────────────────────────────────────

interface QueueItem {
  text: string;
  lang: string;
  priority: VoicePriority;
  /** Date limite (ms epoch) au-delà de laquelle l'annonce est périmée. */
  expiry: number;
  /** Appelé à la **fin naturelle** de la lecture (pas sur interruption). */
  onEnd?: () => void;
}

const PRIORITY_RANK: Record<VoicePriority, number> = {
  critical: 3,
  normal: 2,
  chatty: 1,
  // Le coach par virage ne coupe **jamais** le spotter (§9) : même rang que
  // `chatty` (une condition d'interruption stricte `>` le laisse toujours passer
  // après une annonce en cours). Sa fraîcheur est pilotée en amont par la fenêtre
  // de délivrance (§1), pas par ce rang.
  coach: 1,
};

/** Durée de vie d'une annonce selon sa priorité (ms). */
const TTL: Record<VoicePriority, number> = {
  critical: 12000,
  normal: 7000,
  chatty: 4000,
  // Le conseil coach est **périssable** : décidé « frais » au moment de parler
  // (fenêtre de délivrance §1), il ne doit pas traîner dans la file s'il n'a pas
  // pu être joué tout de suite. TTL court par défaut, surchargeable via `speak`.
  coach: 5000,
};

/**
 * Lecture en cours, abstraite : Web Speech *ou* AudioBuffer (Piper).
 * `end(roger)` arrête proprement (idempotent) ; `roger=true` joue le roger beep
 * (fin normale), `false` coupe sans (interruption).
 */
interface Playback {
  text: string;
  rank: number;
  end: (roger: boolean) => void;
}

let queue: QueueItem[] = [];
let current: Playback | null = null;
/** Dernière annonce émise (callout auto OU spotter) — pour la commande « Répète ». */
let lastSpokenText = "";
let lastSpokenLang = "";
/** Synthèse Piper en cours (fenêtre asynchrone) — bloque un second pump. */
let busy = false;
/** Génération : incrémentée à chaque annulation pour ignorer une synthèse périmée. */
let generation = 0;

function buildUtterance(text: string, lang: string): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = SPEECH_LANG[norm(lang)] ?? "en-GB";
  const voice = pickVoice(lang);
  if (voice) u.voice = voice;
  u.rate = speechRate;
  // On ne baisse le pitch que pour les voix robotiques (les neuronales sonnent
  // mieux au pitch nominal — un décalage les rend artificielles).
  u.pitch = voice && isNaturalVoice(voice) ? 1 : 0.92;
  u.volume = speechVolume;
  return u;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Lecture via Web Speech (repli ou moteur « système »). */
function playSpeech(item: QueueItem) {
  if (!speechSupported()) {
    pump();
    return;
  }
  const u = buildUtterance(item.text, item.lang);
  let done = false;
  const end = (roger: boolean) => {
    if (done) return;
    done = true;
    u.onend = null;
    u.onerror = null;
    if (current === pb) current = null;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* no-op */
    }
    if (roger) radioEnd();
    else radioInterrupt();
  };
  const pb: Playback = { text: item.text, rank: PRIORITY_RANK[item.priority], end };
  u.onend = () => {
    end(true);
    item.onEnd?.();
    pump();
  };
  u.onerror = () => {
    end(true);
    item.onEnd?.();
    pump();
  };
  current = pb;
  radioStart();
  window.speechSynthesis.speak(u);
}

/** Lecture d'un AudioBuffer (Piper), filtré radio si activé. */
function playBuffer(ctx: AudioContext, buffer: AudioBuffer, item: QueueItem) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const out = audioOutput() ?? ctx.destination; // gain maître (volume) → destination
  const radio = radioOn() ? radioVoiceChain(ctx) : null;
  if (radio) {
    src.connect(radio.input);
    radio.output.connect(out);
  } else {
    src.connect(out);
  }
  let done = false;
  const end = (roger: boolean) => {
    if (done) return;
    done = true;
    src.onended = null;
    try {
      src.stop();
    } catch {
      /* déjà arrêté */
    }
    if (current === pb) current = null;
    if (roger) radioEnd();
    else radioInterrupt();
  };
  const pb: Playback = { text: item.text, rank: PRIORITY_RANK[item.priority], end };
  src.onended = () => {
    end(true);
    item.onEnd?.();
    pump();
  };
  current = pb;
  radioStart();
  // Démarre après le bip d'ouverture (~130 ms) pour l'enchaînement « bip → voix ».
  src.start(ctx.currentTime + 0.13);
}

// ── Pré-synthèse (callouts prédictifs coach, COACH-LIVE-SPEC.md §8, P3.3) ──────
// Piper est asynchrone (~100-300 ms) : synthétiser au moment du déclenchement
// prédictif raterait la fenêtre « ≥ 2 s avant le freinage ». On pré-synthétise les
// textes fixes au chargement du combo et on rejoue l'`AudioBuffer` décodé (un
// `AudioBuffer` est réutilisable via plusieurs `BufferSource`).
const synthCache = new Map<string, AudioBuffer>();

/** Clé de cache : dépend du texte **et** des paramètres qui changent le rendu. */
function synthKey(code: string, text: string): string {
  const voice = preferredPiperByLang[code] || "";
  const speaker = preferredSpeakerByLang[code] || 0;
  return `${code}|${voice}|${speaker}|${speechRate}|${text}`;
}

/** Synthétise un texte via Piper et renvoie l'`AudioBuffer` décodé (ou `null`). */
async function synthBuffer(
  ctx: AudioContext,
  code: string,
  text: string,
): Promise<AudioBuffer | null> {
  let b64: string;
  try {
    b64 = await invoke<string>("tts_synthesize", {
      text,
      lang: code,
      voiceId: preferredPiperByLang[code] || undefined,
      rate: speechRate,
      speakerId: preferredSpeakerByLang[code] || undefined,
    });
  } catch {
    piperUnavailable.add(code); // évite de réessayer en boucle
    return null;
  }
  if (!b64) return null;
  try {
    return await ctx.decodeAudioData(base64ToArrayBuffer(b64));
  } catch {
    return null;
  }
}

/**
 * Pré-synthétise une liste de textes fixes (callouts prédictifs) pour une langue,
 * best-effort. À appeler au chargement du combo (P3.3) : les callouts joueront
 * ensuite sans latence de synthèse. Ne fait rien hors Piper/Tauri.
 */
export async function prewarmSpeech(texts: string[], lang: string): Promise<void> {
  if (engine !== "piper" || !isTauri()) return;
  const code = norm(lang);
  if (piperUnavailable.has(code)) return;
  const ctx = audioContext();
  if (!ctx) return;
  for (const text of texts) {
    if (!text) continue;
    const key = synthKey(code, text);
    if (synthCache.has(key)) continue;
    const buffer = await synthBuffer(ctx, code, text);
    if (buffer) synthCache.set(key, buffer);
    else if (piperUnavailable.has(code)) return; // Piper indisponible → inutile d'insister
  }
}

/** Vide le cache de pré-synthèse (changement de combo / arrêt du coach). */
export function clearSpeechCache() {
  synthCache.clear();
}

/** Tente la synthèse Piper + lecture. Renvoie false si indisponible/échec. */
async function trySynthAndPlay(item: QueueItem): Promise<boolean> {
  if (engine !== "piper" || !isTauri()) return false;
  const code = norm(item.lang);
  if (piperUnavailable.has(code)) return false;
  const ctx = audioContext();
  if (!ctx) return false;
  const g = generation;
  // Callout pré-synthétisé (P3.3) → lecture immédiate, sans appel Piper.
  const cached = synthCache.get(synthKey(code, item.text));
  if (cached) {
    if (g !== generation) return false;
    playBuffer(ctx, cached, item);
    return true;
  }
  const buffer = await synthBuffer(ctx, code, item.text);
  if (!buffer || g !== generation) return false; // annulé / indisponible entre-temps
  playBuffer(ctx, buffer, item);
  return true;
}

async function pump() {
  if (current || busy) return;
  const now = Date.now();
  queue = queue.filter((it) => it.expiry > now); // purge des périmés
  if (queue.length === 0) return;
  // Plus haute priorité d'abord (ordre d'insertion conservé à priorité égale).
  queue.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
  const item = queue.shift()!;
  busy = true;
  try {
    const played = await trySynthAndPlay(item);
    if (!played) playSpeech(item); // repli voix système
  } finally {
    busy = false;
  }
}

/**
 * Met une annonce en file. Une annonce `critical` **interrompt** une annonce en
 * cours de priorité inférieure. Les doublons (même texte déjà en file ou en
 * cours) sont ignorés pour éviter le bégaiement.
 */
export function speak(
  text: string,
  lang: string,
  priority: VoicePriority = "normal",
  ttlMs?: number,
) {
  if (!text || (!speechSupported() && !isTauri())) return;
  lastSpokenText = text;
  lastSpokenLang = lang;
  if (current?.text === text) return;
  if (queue.some((it) => it.text === text)) return;
  const ttl = ttlMs !== undefined && ttlMs > 0 ? ttlMs : TTL[priority];
  queue.push({ text, lang, priority, expiry: Date.now() + ttl });
  if (current && PRIORITY_RANK[priority] > current.rank) {
    current.end(false); // interrompt l'annonce en cours, moins prioritaire
  }
  void pump();
}

/** Coupe et vide tout (désactivation des annonces, changement de session). */
export function cancelSpeech() {
  generation++; // invalide toute synthèse Piper en vol
  queue = [];
  if (current) current.end(false);
  current = null;
  if (speechSupported()) window.speechSynthesis.cancel();
  cancelRadio();
}

/**
 * Annonce **à la demande** : interrompt tout et joue immédiatement (priorité
 * critique). Utilisée par le spotter (raccourci global Statut / Répète) où une
 * réponse différée ou dédupliquée n'aurait pas de sens — l'utilisateur vient de
 * « poser une question », on répond tout de suite, même si c'est le même texte.
 */
export function announce(text: string, lang: string, onEnd?: () => void) {
  if (!text || (!speechSupported() && !isTauri())) {
    onEnd?.();
    return;
  }
  lastSpokenText = text;
  lastSpokenLang = lang;
  cancelSpeech();
  queue.push({
    text,
    lang,
    priority: "critical",
    expiry: Date.now() + TTL.critical,
    onEnd,
  });
  void pump();
}

/**
 * Rejoue la dernière annonce émise (commande spotter « Répète »).
 * Renvoie `false` si rien n'a encore été dit (l'appelant peut alors donner un
 * repli, ex. le statut).
 */
export function repeatLast(): boolean {
  if (!lastSpokenText) return false;
  announce(lastSpokenText, lastSpokenLang);
  return true;
}

/** Joue immédiatement une phrase (bouton « Tester » de la config). */
export function previewVoice(text: string, lang: string) {
  announce(text, lang);
}
