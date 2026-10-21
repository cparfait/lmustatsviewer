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
  styleVoiceBuffer,
  pitwallActive,
  setRadioStyle,
  radioStyle,
  type RadioStyle,
  audioContext,
  audioOutput,
  setMasterVolume,
  MAX_VOICE_VOLUME,
} from "@/lib/radioFx";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/api";
import {
  cloudAlertsLocal,
  cloudCacheMissing,
  cloudCachedAudio,
  cloudCachedAudioMany,
  cloudNumbersMode,
  cloudSynth,
  cloudVoiceOn,
  cloudVoiceReady,
  cloudVoiceTag,
  noteCloudFallback,
} from "@/lib/cloudVoice";
import { assembleAllowed, cloudModeFor, fixedPhrases, isFixedPhrase, type CloudMode } from "@/lib/cloudVoicePrep";
import {
  assembleSegments,
  buildLexicon,
  joinPcm,
  segmentInventory,
  trimSilence,
  type SegmentEntry,
  type SegmentLexicon,
} from "@/lib/cloudVoiceSegments";
import { ttsWords } from "@/lib/ttsWords";
import type { BenchEngine, BenchFacts } from "@/lib/cloudVoiceBench";

export type VoicePriority = "spotter" | "critical" | "normal" | "chatty" | "coach";
export type VoiceEngine = "piper" | "system";

/** Code langue app (2 lettres) → BCP-47. */
export const SPEECH_LANG: Record<string, string> = {
  fr: "fr-FR",
  en: "en-GB",
  es: "es-ES",
  de: "de-DE",
  it: "it-IT",
};

/** Normalise un code langue (« fr-FR » → « fr »). */
const norm = (lang: string) => (lang || "en").slice(0, 2).toLowerCase();

// Heuristiques de nom (les libellés varient selon l'OS / le navigateur).
const NATURAL_HINTS = ["natural", "neural", "online"];
const MALE_VOICE_HINTS = [
  "paul", "claude", "david", "mark", "george", "guy", "ryan", "thomas",
  "daniel", "guillaume", "henri", "nicolas", "stefan", "conrad", "pablo",
  "jorge", "diego", "alvaro", "remy", "male", "homme", "männlich", "hombre",
  "masculin", "giuseppe", "cosimo", "benigno", "calimero", "gianni",
  "lisandro", "rinaldo", "maschile",
];
const FEMALE_VOICE_HINTS = [
  "hortense", "julie", "denise", "zira", "hazel", "susan", "linda", "aria",
  "jenny", "helena", "laura", "sabina", "elvira", "hedda", "katja", "amala",
  "vivienne", "female", "femme", "weiblich", "mujer", "féminin", "elsa",
  "isabella", "fabiola", "fiamma", "imelda", "palmira", "pierina", "femminile",
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
/**
 * Volume des annonces (0 – `MAX_VOICE_VOLUME`) — pour équilibrer avec le jeu.
 * Défaut à 100 % : le jeu couvrait les annonces avec l'ancien défaut de 30 %.
 */
let speechVolume = 1;
/** Moteur de synthèse : Piper neuronal embarqué (défaut) ou voix système. */
let engine: VoiceEngine = "piper";
/** Langues où Piper vient d'échouer (heure de l'échec) → repli direct, sans
 *  réessayer en boucle. Réessayé après `PIPER_RETRY_MS`, et tout de suite quand
 *  une voix est téléchargée/choisie : avant, l'échec valait jusqu'au redémarrage
 *  (voix téléchargée après coup → voix système quand même). */
const piperUnavailable = new Map<string, number>();
const PIPER_RETRY_MS = 30_000;
function piperDown(code: string): boolean {
  const at = piperUnavailable.get(code);
  if (at == null) return false;
  if (Date.now() - at < PIPER_RETRY_MS) return true;
  piperUnavailable.delete(code);
  return false;
}

/** Oublie les échecs Piper (voix téléchargée, supprimée ou choisie) : prochaine annonce en Piper. */
export function resetPiperAvailability() {
  piperUnavailable.clear();
}

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
    speechVolume = Math.max(0, Math.min(MAX_VOICE_VOLUME, opts.volume));
    setMasterVolume(speechVolume); // voix Piper + bips
  }
  if (opts.engine !== undefined) engine = opts.engine;
  if (opts.piperByLang !== undefined || opts.speakerByLang !== undefined || opts.engine !== undefined) resetPiperAvailability();
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

/** Options de diffusion d'une annonce (toutes facultatives). */
export interface SpeakOpts {
  /**
   * Coupée en cours de lecture par une annonce plus urgente → redite **une**
   * fois, précédée de ce préfixe (« Je répète, »), si elle est encore fraîche.
   */
  replayPrefix?: string;
  /**
   * Annonce importante : périmée dans la file sans avoir jamais été jouée →
   * remise **une** fois en file (nouvelle durée de vie), puis abandonnée.
   */
  retryIfLost?: boolean;
  /**
   * Tenue du canal (ms) : après cette annonce, aucune annonce non critique ne
   * démarre pendant ce délai (le spotter garde la parole).
   */
  holdChannelMs?: number;
  /**
   * Réponse au pilote (question posée, lecture d'une analyse) : voix en ligne en
   * direct malgré sa priorité critique (une alerte, elle, n'y passe que préparée).
   */
  cloudOk?: boolean;
  /** Voix locale seulement (bouton « Tester » de la voix Piper / système). */
  localOnly?: boolean;
}

interface QueueItem {
  text: string;
  /** Texte d'origine, avant `normalizeForTts` (reconnaissance des gabarits chiffrés). */
  raw: string;
  lang: string;
  priority: VoicePriority;
  /** Date limite (ms epoch) au-delà de laquelle l'annonce est périmée. */
  expiry: number;
  /** Durée de vie initiale (ms) — resservie pour une reprise. */
  ttl: number;
  /** Appelé à la **fin naturelle** de la lecture (pas sur interruption). */
  onEnd?: () => void;
  opts?: SpeakOpts;
  /** Déjà reprise une fois (coupure ou perte) : jamais deux. */
  retried?: boolean;
  /** Audio déjà synthétisé, gardé quand une annonce plus urgente est passée devant. */
  audio?: AudioBuffer;
  /** Requête à la voix en ligne en vol : reprise telle quelle, jamais payée deux fois. */
  cloudPending?: Promise<AudioBuffer | null>;
}

/**
 * Annonce sortie de la file dont l'audio est en cours de synthèse (Piper ou voix
 * en ligne). Elle n'est ni en file ni en lecture : sans ce suivi, l'anti-doublon
 * ne la voyait pas (même phrase dite deux fois) et une annonce plus urgente
 * attendait la fin de la requête (jusqu'à 3 s avec la voix en ligne).
 */
interface InFlight {
  item: QueueItem;
  rank: number;
}

const PRIORITY_RANK: Record<VoicePriority, number> = {
  // Spotter de proximité (« voiture à gauche ») : passe avant tout, coupe même
  // une alerte critique — c'est l'information la plus urgente à 250 km/h.
  spotter: 4,
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
  // Un « voiture à gauche » dit 2 s trop tard est faux : il périme très vite.
  spotter: 1500,
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
  /** Annonce d'origine (reprise après coupure). */
  item: QueueItem;
}

let queue: QueueItem[] = [];
let current: Playback | null = null;
/** Synthèse en cours (une seule à la fois) ; `null` dès qu'elle est annulée ou devancée. */
let inflight: InFlight | null = null;

/**
 * Remet en file l'annonce en cours de synthèse (jamais entendue : ni préfixe
 * « Je répète », ni nouvelle durée de vie). Son résultat sera ignoré à l'arrivée.
 */
function releaseInflight() {
  if (!inflight) return;
  queue.unshift(inflight.item);
  inflight = null;
}

// ── Quand ne pas entamer une phrase ──────────────────────────────────────────
// Ces gardes **retiennent** une annonce non critique dans la file (elle part dès
// que la voie est libre, ou périme) ; elles ne coupent jamais une phrase en cours,
// sauf la prise de parole du pilote. La sécurité (`critical`) passe toujours.

/** Garde « pilote occupé » posée par l'ingénieur (freinage proche, virage…). */
let busyGate: (() => boolean) | null = null;
/** Le pilote parle (push-to-talk tenu) : rien de non critique ne démarre. */
let driverTalking = false;
/** Canal tenu (spotter) jusqu'à cette date (ms epoch). */
let channelHoldUntil = 0;
/** Réessai programmé d'une annonce retenue. */
let retryTimer: ReturnType<typeof setTimeout> | null = null;
/** Reprise des annonces coupées / perdues (réglage, défaut actif). */
let replayEnabled = true;
/** Silence radio pendant que le pilote parle (réglage, défaut actif). */
let talkSilence = true;

/**
 * Pose (ou retire avec `null`) la garde « pilote occupé ». Revérifiée **juste
 * avant** chaque prise de parole non critique, pas seulement à la décision.
 */
export function setSpeechGate(gate: (() => boolean) | null) {
  busyGate = gate;
}

/** Active / coupe la reprise des annonces coupées ou perdues. */
export function setSpeechReplay(on: boolean) {
  replayEnabled = on;
}

/** Active / coupe le silence radio pendant la prise de parole du pilote. */
export function setTalkSilence(on: boolean) {
  talkSilence = on;
  if (!on) void pump();
}

/** Remet une annonce coupée en tête de sa priorité (une seule fois). */
function requeueCut(item: QueueItem) {
  if (!replayEnabled || item.retried || !item.opts?.replayPrefix) return;
  if (item.expiry <= Date.now()) return;
  queue.unshift({
    ...item,
    text: `${item.opts.replayPrefix} ${item.text}`,
    raw: `${item.opts.replayPrefix} ${item.raw}`,
    retried: true,
    expiry: Date.now() + item.ttl,
    audio: undefined, // autre texte, autre audio
    cloudPending: undefined,
  });
}

/**
 * Le pilote prend / rend la parole (push-to-talk). À la prise : l'annonce non
 * critique en cours est coupée (et reprise plus tard si elle le prévoit). Au
 * relâchement : la file repart.
 */
export function setDriverTalking(on: boolean) {
  const changed = driverTalking !== on;
  driverTalking = on;
  if (changed) for (const cb of talkListeners) cb(on);
  if (on && talkSilence && current && current.rank < PRIORITY_RANK.critical) {
    const cut = current;
    cut.end(false);
    requeueCut(cut.item);
  }
  // Annonce en cours de synthèse : elle attend que le pilote ait fini (sinon
  // elle démarrait par-dessus sa voix à l'arrivée de l'audio).
  if (on && talkSilence && inflight && inflight.rank < PRIORITY_RANK.critical) releaseInflight();
  if (!on) void pump();
}

/** Une annonce non critique peut-elle démarrer maintenant ? */
function laneFree(now: number): boolean {
  if ((talkSilence && driverTalking) || now < channelHoldUntil) return false;
  try {
    return !busyGate?.();
  } catch {
    return true; // garde en erreur : on ne bâillonne pas la radio
  }
}

/**
 * Prévient le moteur d'écoute que l'ingénieur parle (ou a fini) : le mot
 * déclencheur n'est pas cherché dans sa propre voix. Sans moteur : sans effet.
 */
function micMuted(on: boolean) {
  if (!isTauri()) return;
  invoke("voice_input_set_muted", { muted: on }).catch(() => {
    /* moteur absent : rien à faire */
  });
}

// ── Évènements de parole (son du jeu baissé, sous-titres radio) ─────────────────

/** Début ou fin d'une annonce réellement entendue. */
export interface SpeechEvent {
  type: "start" | "end";
  /** Texte affichable (avant normalisation pour la synthèse). */
  text: string;
  priority: VoicePriority;
}

const speechListeners = new Set<(e: SpeechEvent) => void>();
const talkListeners = new Set<(on: boolean) => void>();

/** S'abonne aux prises / fins de parole du pilote (push-to-talk). */
export function onDriverTalk(cb: (on: boolean) => void): () => void {
  talkListeners.add(cb);
  return () => talkListeners.delete(cb);
}

/** Une annonce est-elle en cours de lecture ? */
export function isSpeaking(): boolean {
  return current != null;
}

/** S'abonne aux débuts / fins de parole ; renvoie la fonction de désabonnement. */
export function onSpeechEvent(cb: (e: SpeechEvent) => void): () => void {
  speechListeners.add(cb);
  return () => speechListeners.delete(cb);
}

function notifySpeech(type: SpeechEvent["type"], item: QueueItem) {
  const e: SpeechEvent = { type, text: item.raw, priority: item.priority };
  for (const cb of speechListeners) {
    try {
      cb(e);
    } catch {
      /* un abonné en erreur ne coupe pas la radio */
    }
  }
}

/** Marque le canal tenu (spotter) à la prise et à la fin de parole. */
function holdChannel(item: QueueItem) {
  const ms = item.opts?.holdChannelMs;
  if (ms && ms > 0) channelHoldUntil = Math.max(channelHoldUntil, Date.now() + ms);
}
/** Dernière annonce émise (callout auto OU spotter) — pour la commande « Répète ». */
let lastSpokenText = "";
let lastSpokenRaw = "";
let lastSpokenLang = "";

function buildUtterance(text: string, lang: string): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = SPEECH_LANG[norm(lang)] ?? "en-GB";
  const voice = pickVoice(lang);
  if (voice) u.voice = voice;
  u.rate = speechRate;
  // On ne baisse le pitch que pour les voix robotiques (les neuronales sonnent
  // mieux au pitch nominal — un décalage les rend artificielles).
  u.pitch = voice && isNaturalVoice(voice) ? 1 : 0.92;
  // Web Speech ne passe pas par le graphe Web Audio : pas d'amplification
  // possible au-delà de 100 % (le boost n'existe que sur le moteur Piper).
  u.volume = Math.min(1, speechVolume);
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
    holdChannel(item);
    micMuted(false);
    notifySpeech("end", item);
  };
  const pb: Playback = { text: item.text, rank: PRIORITY_RANK[item.priority], end, item };
  holdChannel(item);
  micMuted(true);
  notifySpeech("start", item);
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
  // Profil « Radio stand » : l'habillage est déjà dans le tampon (filtre, souffle,
  // clics de squelch) → pas de chaîne de filtre ni de lit de souffle ; les bips
  // d'ouverture et de fin sont conservés.
  const pw = pitwallActive();
  const radio = radioOn() && !pw ? radioVoiceChain(ctx) : null;
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
    holdChannel(item);
    micMuted(false);
    notifySpeech("end", item);
  };
  const pb: Playback = { text: item.text, rank: PRIORITY_RANK[item.priority], end, item };
  holdChannel(item);
  micMuted(true);
  notifySpeech("start", item);
  src.onended = () => {
    end(true);
    item.onEnd?.();
    pump();
  };
  current = pb;
  radioStart(!pw);
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
  urgent = false,
): Promise<AudioBuffer | null> {
  let b64: string;
  try {
    b64 = await invoke<string>("tts_synthesize", {
      text,
      lang: code,
      voiceId: preferredPiperByLang[code] || undefined,
      rate: speechRate,
      speakerId: preferredSpeakerByLang[code] || undefined,
      // Sécurité / spotter : Piper passe en priorité normale le temps de la phrase.
      urgent: urgent || undefined,
    });
  } catch {
    piperUnavailable.set(code, Date.now()); // évite de réessayer en boucle
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
  const ctx = audioContext();
  if (!ctx) return;
  for (const raw of piperDown(code) ? [] : texts) {
    if (!raw) continue;
    // Même normalisation que `speak` : sinon la clé ne correspond jamais au
    // texte réellement dit dès qu'il contient un chiffre ou une unité.
    const text = normalizeForTts(raw, lang);
    const key = synthKey(code, text);
    if (synthCache.has(key)) continue;
    const buffer = await synthBuffer(ctx, code, text);
    if (buffer) synthCache.set(key, buffer);
    else if (piperDown(code)) break; // Piper indisponible → inutile d'insister
  }
  // Voix en ligne : les phrases déjà préparées passent en mémoire (lecture
  // instantanée au moment critique). Cache disque seulement, aucune requête.
  if (!cloudVoiceOn() || cloudAlertsLocal()) return;
  for (const raw of texts) {
    if (!raw) continue;
    const text = normalizeForTts(raw, lang);
    const cloudKey = `${cloudVoiceTag(code)}|${synthKey(code, text)}`;
    if (synthCache.has(cloudKey)) continue;
    if (!isFixedPhrase(text)) {
      // Annonce chiffrée : ses morceaux passent en mémoire (assemblage instantané ensuite).
      if (assembleFor("cached")) await assembledBuffer(ctx, code, raw);
      continue;
    }
    const buffer = await cloudCachedBuffer(ctx, code, text);
    if (buffer) synthCache.set(cloudKey, buffer);
  }
}

/** Vide le cache de pré-synthèse (changement de combo / arrêt du coach). */
export function clearSpeechCache() {
  synthCache.clear();
  fixedKeys.length = 0;
}

// Phrases fixes (drapeaux, box, spotter…) : sans chiffre et courtes, elles
// reviennent mot pour mot. On garde leur tampon nu (l'habillage radio est
// appliqué à chaque lecture) pour les rejouer sans repasser par Piper. Plafond
// bas : un tampon de 2-3 s pèse quelques centaines de Ko.
const FIXED_MAX = 60;
const fixedKeys: string[] = [];

function rememberPhrase(key: string, buffer: AudioBuffer) {
  if (synthCache.has(key)) return;
  synthCache.set(key, buffer);
  fixedKeys.push(key);
  if (fixedKeys.length > FIXED_MAX) synthCache.delete(fixedKeys.shift()!);
}

/**
 * Démarre la voix Piper de la langue sans rien dire (le moteur garde le modèle
 * chargé) : la première vraie annonce n'attend plus le chargement. Best-effort.
 */
export function warmupVoice(lang: string) {
  if (engine !== "piper" || !isTauri()) return;
  const code = norm(lang);
  invoke("tts_warmup", {
    lang: code,
    voiceId: preferredPiperByLang[code] || undefined,
    rate: speechRate,
    speakerId: preferredSpeakerByLang[code] || undefined,
  }).catch(() => {
    /* moteur absent ou commande inconnue : la première phrase sera juste plus lente */
  });
}

/**
 * Voix en ligne (option, cf. `cloudVoice.ts`) : l'information (`normal`,
 * `chatty`) et les réponses au pilote en direct ; la sécurité (`critical` :
 * drapeaux, crevaison, box…), le spotter et le coach par virage **seulement
 * préparés** (cache), car leur moment de parole est calculé sur la latence de
 * Piper : jamais d'attente réseau, Piper sinon. Une phrase chiffrée préparée
 * l'est par morceaux, recollés à la lecture (réglage « Annonces chiffrées »).
 * « Alertes en voix locale » : ces derniers restent toujours sur Piper (ancien
 * comportement).
 */
function cloudMode(item: QueueItem): CloudMode {
  return cloudModeFor(item.priority, item.opts?.cloudOk === true, cloudAlertsLocal());
}

/**
 * « Préparer la voix » : textes exacts que la course enverra à la voix en ligne
 * pour ces gabarits (variantes, normalisation de `speak`), avec la langue et la
 * vitesse qui entrent dans la clé du cache disque.
 */
export function cloudPrepTexts(templates: string[], lang: string): { code: string; rate: number; texts: string[] } {
  return { code: norm(lang), rate: speechRate, texts: fixedPhrases(templates, (s) => normalizeForTts(s, lang)) };
}

// ── Annonces chiffrées assemblées (voix en ligne, `cloudVoiceSegments.ts`) ────

/** Gabarits d'annonces de la langue (posé au démarrage, cf. `stores/app.ts`). */
let segmentSource: ((lang: string) => SegmentEntry[]) | null = null;
const lexicons = new Map<string, { sig: string; lex: SegmentLexicon }>();

/** Donne la liste des gabarits d'annonces (personnalisés compris) à reconnaître. */
export function setCloudSegmentSource(source: ((lang: string) => SegmentEntry[]) | null) {
  segmentSource = source;
  lexicons.clear();
}

/** Reconnaissance des gabarits de `code`, recompilée si un texte a été personnalisé. */
function lexiconFor(code: string): SegmentLexicon | null {
  const entries = segmentSource?.(code);
  if (!entries?.length) return null;
  const sig = entries.map((e) => e.text).join("");
  const hit = lexicons.get(code);
  if (hit?.sig === sig) return hit.lex;
  const lex = buildLexicon(code, entries, (s) => normalizeForTts(s, code));
  lexicons.set(code, { sig, lex });
  return lex;
}

/**
 * « Préparer la voix » : morceaux à enregistrer pour assembler les annonces
 * chiffrées de la langue (parties fixes des gabarits, nombres, mots de liaison).
 */
export function cloudSegmentPrepTexts(lang: string): string[] {
  const lex = lexiconFor(norm(lang));
  return lex ? segmentInventory(lex) : [];
}

/**
 * Morceaux décodés et rognés (mono, à la fréquence du contexte audio), gardés en
 * mémoire : les nombres reviennent sans cesse. Plafond : ~200 morceaux d'une
 * demi-seconde ≈ 20 Mo.
 */
const segmentPcm = new Map<string, Float32Array>();
const SEGMENT_PCM_MAX = 200;

function rememberSegment(key: string, pcm: Float32Array) {
  segmentPcm.delete(key);
  segmentPcm.set(key, pcm);
  if (segmentPcm.size > SEGMENT_PCM_MAX) segmentPcm.delete(segmentPcm.keys().next().value!);
}

/** Mono : moyenne des canaux. */
function monoOf(buf: AudioBuffer): Float32Array {
  if (buf.numberOfChannels === 1) return buf.getChannelData(0);
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) out[i] += d[i] / buf.numberOfChannels;
  }
  return out;
}

/**
 * Annonce chiffrée recollée à partir des morceaux préparés (cache mémoire puis
 * disque, **jamais le réseau**). `matched` : la phrase est assemblable (sinon
 * l'absence de tampon n'est pas un repli, seulement « pas pour ce mode »).
 */
async function assembledBuffer(
  ctx: AudioContext,
  code: string,
  raw: string,
  count = true,
): Promise<{ buffer: AudioBuffer | null; matched: boolean }> {
  const lex = lexiconFor(code);
  const segs = lex ? assembleSegments(raw, lex) : null;
  if (!segs) return { buffer: null, matched: false };
  const tag = cloudVoiceTag(code);
  const keyOf = (text: string) => `${tag}|${synthKey(code, text)}`;
  const missing = [...new Set(segs.map((s) => s.text))].filter((t) => !segmentPcm.has(keyOf(t)));
  if (missing.length) {
    const audio = await cloudCachedAudioMany(missing, code, speechRate, { count });
    if (!audio) return { buffer: null, matched: true };
    try {
      const decoded = await Promise.all(audio.map((a) => ctx.decodeAudioData(a)));
      decoded.forEach((b, i) => rememberSegment(keyOf(missing[i]), trimSilence(monoOf(b), ctx.sampleRate)));
    } catch {
      return { buffer: null, matched: true };
    }
  }
  const chunks = segs.map((s) => segmentPcm.get(keyOf(s.text)));
  if (chunks.some((c) => !c)) return { buffer: null, matched: true }; // évincé entre-temps
  const pcm = joinPcm(chunks as Float32Array[], segs.map((s) => s.pauseMs), ctx.sampleRate);
  if (pcm.length === 0) return { buffer: null, matched: true };
  const buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
  buffer.copyToChannel(pcm, 0);
  return { buffer, matched: true };
}

/** Le réglage « Annonces chiffrées » autorise-t-il l'assemblage pour ce mode ? */
function assembleFor(mode: CloudMode): boolean {
  return assembleAllowed(mode, cloudNumbersMode());
}

/** Synthèse en ligne → `AudioBuffer` décodé, ou `null` (Piper prend le relais). */
async function cloudBuffer(ctx: AudioContext, code: string, text: string): Promise<AudioBuffer | null> {
  const bytes = await cloudSynth(text, code, speechRate, { cacheable: isFixedPhrase(text) });
  if (!bytes) return null;
  try {
    return await ctx.decodeAudioData(bytes);
  } catch {
    return null;
  }
}

/** Phrase préparée (cache disque) → `AudioBuffer`, sans requête ; `null` sinon. */
async function cloudCachedBuffer(ctx: AudioContext, code: string, text: string, count = true): Promise<AudioBuffer | null> {
  const bytes = await cloudCachedAudio(text, code, speechRate, { count });
  if (!bytes) return null;
  try {
    return await ctx.decodeAudioData(bytes);
  } catch {
    return null;
  }
}

// ── Banc d'écoute (Config → Voix IA en ligne) : jamais de requête au fournisseur ──

/**
 * Ce que la course ferait de `raw` sans réseau (cf. `benchRoute`) : mode de la
 * voix en ligne, présence dans le cache disque, morceaux de l'assemblage.
 */
export async function probeCloudPlayback(
  raw: string,
  lang: string,
  priority: VoicePriority,
  cloudOk = false,
): Promise<BenchFacts & { text: string }> {
  const code = norm(lang);
  const text = normalizeForTts(raw, lang);
  const fixed = isFixedPhrase(text);
  const lex = lexiconFor(code);
  const segs = !fixed && lex ? assembleSegments(raw, lex) : null;
  const segments = segs ? [...new Set(segs.map((s) => s.text))] : null;
  const cloudOn = cloudVoiceOn();
  let wholeCached = false;
  let missing: string[] = segments ?? [];
  try {
    if (fixed) wholeCached = (await cloudCacheMissing([text], code, speechRate)).length === 0;
    if (segments) missing = await cloudCacheMissing(segments, code, speechRate);
  } catch {
    /* cache illisible : tout est considéré absent */
  }
  return {
    text,
    cloudOn,
    mode: cloudModeFor(priority, cloudOk, cloudAlertsLocal()),
    fixed,
    wholeCached,
    segments,
    missing,
    numbers: cloudNumbersMode(),
  };
}

/**
 * Banc d'écoute : joue `raw` par un seul chemin, **sans réseau** — `cloud`
 * (phrase entière du cache), `assembled` (morceaux du cache) ou `piper`.
 * Renvoie `false` si ce chemin n'a rien à jouer (phrase absente du cache…).
 * Hors consommation de course (compteur « servies par le cache » inchangé).
 */
export async function playBench(raw: string, lang: string, how: BenchEngine): Promise<boolean> {
  const ctx = audioContext();
  if (!ctx || !isTauri()) return false;
  const code = norm(lang);
  const text = normalizeForTts(raw, lang);
  let buf: AudioBuffer | null = null;
  if (how === "cloud") buf = await cloudCachedBuffer(ctx, code, text, false);
  else if (how === "assembled") buf = (await assembledBuffer(ctx, code, raw, false)).buffer;
  else buf = await synthBuffer(ctx, code, text);
  if (!buf) return false;
  cancelSpeech();
  const item: QueueItem = { text, raw, lang, priority: "normal", expiry: Date.now() + TTL.normal, ttl: TTL.normal };
  playBuffer(ctx, await styleVoiceBuffer(ctx, buf), item);
  return true;
}

/**
 * Audio en ligne de l'annonce selon son mode (`cloudModeFor`) ; `null` = Piper
 * la dira. `stale` : la synthèse a été annulée ou devancée entre-temps.
 */
async function cloudAudio(
  ctx: AudioContext,
  code: string,
  item: QueueItem,
  stale: () => boolean,
): Promise<AudioBuffer | null> {
  if (item.opts?.localOnly) return null;
  const mode = cloudMode(item);
  const cloudKey = `${cloudVoiceTag(code)}|${synthKey(code, item.text)}`;
  if (mode === "live" && cloudVoiceOn() && !isFixedPhrase(item.text) && assembleFor(mode)) {
    // Réglage « tout assemblé » : l'information chiffrée prête se lit sans requête.
    const assembled = (await assembledBuffer(ctx, code, item.raw)).buffer;
    if (assembled || stale()) return assembled;
  }
  if (mode === "live" && cloudVoiceReady()) {
    const cached = synthCache.get(cloudKey);
    if (cached) return cached;
    // Annonce reprise après être passée derrière une plus urgente : même requête.
    const pending = item.cloudPending ?? cloudBuffer(ctx, code, item.text);
    item.cloudPending = pending;
    const raw = await pending;
    if (item.cloudPending === pending) item.cloudPending = undefined;
    if (raw && isFixedPhrase(item.text)) rememberPhrase(cloudKey, raw);
    // Repli compté une fois, par la reprise qui le dit vraiment.
    if (!raw && !stale()) noteCloudFallback();
    return raw;
  }
  if (mode === "cached" && cloudVoiceOn()) {
    // Phrase urgente : mémoire (pré-chargée) puis cache disque, jamais le réseau.
    const cached = synthCache.get(cloudKey);
    if (cached) return cached;
    if (isFixedPhrase(item.text)) {
      const raw = await cloudCachedBuffer(ctx, code, item.text);
      if (raw) rememberPhrase(cloudKey, raw);
      else if (!stale()) noteCloudFallback(); // phrase fixe non préparée : Piper la dit
      return raw;
    }
    if (assembleFor(mode)) {
      // Phrase chiffrée : recollée à partir des morceaux préparés, sinon Piper.
      const res = await assembledBuffer(ctx, code, item.raw);
      if (!res.buffer && res.matched && !stale()) noteCloudFallback();
      return res.buffer;
    }
  }
  return null;
}

/**
 * Synthèse (voix en ligne ou Piper) + lecture de l'annonce `job`. Renvoie false
 * si Piper est indisponible (repli voix système). Si `job` n'est plus la
 * synthèse en cours à l'arrivée de l'audio (annulée ou devancée), rien ne joue —
 * pas même en repli ; l'audio est gardé pour la reprise.
 */
async function trySynthAndPlay(job: InFlight): Promise<boolean> {
  const item = job.item;
  if (engine !== "piper" || !isTauri()) return false;
  const code = norm(item.lang);
  const ctx = audioContext();
  if (!ctx) return false;
  const stale = () => inflight !== job;
  let raw: AudioBuffer | null = item.audio ?? null;
  if (!raw) {
    raw = await cloudAudio(ctx, code, item, stale);
    if (stale()) {
      if (raw) item.audio = raw;
      return true;
    }
  }
  if (!raw && piperDown(code)) return false;
  // Callout pré-synthétisé (P3.3) ou phrase fixe déjà dite → lecture immédiate,
  // sans appel Piper.
  const key = synthKey(code, item.text);
  if (!raw) raw = synthCache.get(key) ?? null;
  if (!raw) {
    raw = await synthBuffer(ctx, code, item.text, PRIORITY_RANK[item.priority] >= PRIORITY_RANK.critical);
    if (raw && isFixedPhrase(item.text)) rememberPhrase(key, raw);
  }
  if (stale()) {
    if (raw) item.audio = raw;
    return true;
  }
  if (!raw) return false; // Piper indisponible → repli voix système
  // Profil « Radio stand » : habillage appliqué au tampon (le cache reste nu).
  const buffer = await styleVoiceBuffer(ctx, raw);
  if (stale()) {
    item.audio = raw;
    return true;
  }
  playBuffer(ctx, buffer, item);
  return true;
}

async function pump() {
  if (current || inflight) return;
  const now = Date.now();
  // Purge des périmés. Une annonce importante qui n'a jamais pu passer (file
  // retenue, pilote occupé) a droit à une seconde chance, une seule.
  const alive: QueueItem[] = [];
  for (const it of queue) {
    if (it.expiry > now) alive.push(it);
    else if (replayEnabled && it.opts?.retryIfLost && !it.retried) {
      alive.push({ ...it, retried: true, expiry: now + it.ttl });
    }
  }
  queue = alive;
  if (queue.length === 0) return;
  // Plus haute priorité d'abord (ordre d'insertion conservé à priorité égale).
  queue.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
  // La sécurité part toujours ; le reste attend que la voie soit libre.
  const free = laneFree(now);
  const idx = queue.findIndex((it) => PRIORITY_RANK[it.priority] >= PRIORITY_RANK.critical || free);
  if (idx < 0) {
    if (!retryTimer) {
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void pump();
      }, 150);
    }
    return;
  }
  const item = queue.splice(idx, 1)[0];
  const job: InFlight = { item, rank: PRIORITY_RANK[item.priority] };
  inflight = job;
  let played = false;
  try {
    played = await trySynthAndPlay(job);
  } catch {
    /* synthèse en erreur : repli voix système */
  }
  // Annulée ou devancée pendant la synthèse : la file a déjà repris sans elle.
  if (inflight !== job) return;
  inflight = null;
  if (!played) playSpeech(item); // repli voix système
}

/**
 * Met une annonce en file. Une annonce `critical` **interrompt** une annonce en
 * cours de priorité inférieure. Les doublons (même texte déjà en file ou en
 * cours) sont ignorés pour éviter le bégaiement.
 */
/**
 * Normalise le jargon course pour la synthèse — Piper lit les formes écrites
 * telles quelles : « P13 » devient un mot déformé, « 1:42.123 » est lu avec
 * « deux-points », « km/h » avec « slash », « 0.5 » à l'anglaise en FR/ES/DE/IT.
 * On réécrit en toutes lettres, par langue. S'applique à TOUT ce qui est dit
 * (spotter, coach, test IA) — les textes affichés ne sont pas touchés.
 */
function normalizeForTts(text: string, lang: string): string {
  const w = ttsWords(lang);
  let s = text;
  // « P13 » / « T4 » collés → « P 13 » (épelé lettre puis nombre).
  s = s.replace(/\b([PT])(\d{1,2})\b/g, "$1 $2");
  // Catégories : épelées (« LMGT3 » → « L M G T 3 »). Liste fermée, pas de
  // motif générique lettres+chiffre qui abîmerait un nom propre.
  s = s.replace(/\b(LMGT3|LMP[123]|LMDh|GTE|GT3)\b/g, (m) =>
    m.toUpperCase().split("").join(" "),
  );
  // Temps au tour « 1:42.881 » → convention radio : « une 42 881 » (pas de
  // « minute » ni de « virgule » ; « une » au féminin en FR). Minute à 1
  // chiffre : un tour dure moins de 10 min — évite de réécrire une heure
  // « 14:30 ».
  // Virgules entre les blocs : sans elles, « 2 26 707 » est lu « vingt-six
  // mille sept cent sept » (séparateur de milliers).
  const minWord = (m: string) => (norm(lang) === "fr" && m === "1" ? "une" : m);
  s = s.replace(
    /\b(\d):(\d{2})\.(\d{1,3})\b/g,
    (_, m, sec, ms) => `${minWord(m)}, ${sec}, ${ms}`,
  );
  s = s.replace(/\b(\d):(\d{2})\b/g, (_, m, sec) => `${minWord(m)}, ${sec}`);
  // Écarts signés « +0.5 » / « -0.3 » (signe collé au chiffre uniquement).
  s = s.replace(/(^|\s)\+(?=\d)/g, `$1${w.plus} `);
  s = s.replace(/(^|\s)-(?=\d)/g, `$1${w.minus} `);
  // Suffixe secondes « 0.5s » / « 34s » → « 0.5 secondes » (le point est
  // traité juste après).
  s = s.replace(/\b(\d+(?:[.,]\d+)?)\s?s\b/g, `$1 ${w.seconds}`);
  // Prononciation française des gommes : « medium » est lu à l'anglaise par Piper ;
  // « médium » donne la prononciation attendue (le texte affiché n'est pas touché).
  if (norm(lang) === "fr") {
    s = s.replace(/\b([Mm])edium(s?)\b/g, (_m, c: string, pl: string) => `${c}édium${pl}`);
  }
  // Unités.
  s = s.replace(/\bkm\/h\b/gi, w.kmh);
  s = s.replace(/°\s?C\b/g, ` ${w.degrees}`);
  // Décimales restantes : « 0.5 » lu à l'anglaise hors EN → mot local. Le
  // lookahead couvre les suites « 1.0.3 » (chaque point est traité).
  if (norm(lang) !== "en") s = s.replace(/(\d)\.(?=\d)/g, `$1 ${w.decimal} `);
  return s.replace(/\s{2,}/g, " ").trim();
}

export function speak(
  text: string,
  lang: string,
  priority: VoicePriority = "normal",
  ttlMs?: number,
  opts?: SpeakOpts,
) {
  if (!text || (!speechSupported() && !isTauri())) return;
  const raw = text;
  text = normalizeForTts(text, lang);
  lastSpokenText = text;
  lastSpokenRaw = raw;
  lastSpokenLang = lang;
  // Doublon : déjà en lecture, en cours de synthèse ou en file.
  if (current?.text === text || inflight?.item.text === text) return;
  if (queue.some((it) => it.text === text)) return;
  const ttl = ttlMs !== undefined && ttlMs > 0 ? ttlMs : TTL[priority];
  queue.push({ text, raw, lang, priority, expiry: Date.now() + ttl, ttl, opts });
  if (current && PRIORITY_RANK[priority] > current.rank) {
    // Interrompt l'annonce en cours, moins prioritaire ; elle sera redite une
    // fois après (« Je répète… ») si elle le prévoit et reste fraîche.
    const cut = current;
    cut.end(false);
    requeueCut(cut.item);
  } else if (inflight && PRIORITY_RANK[priority] > inflight.rank) {
    // Plus urgente que l'annonce en cours de synthèse : elle passe devant, sans
    // attendre la réponse du service ; l'autre, jamais entendue, suit telle quelle.
    releaseInflight();
  }
  void pump();
}

/** Coupe et vide tout (désactivation des annonces, changement de session). */
export function cancelSpeech() {
  // Synthèse en vol ignorée à l'arrivée ; la file repart aussitôt (une annonce
  // posée juste après, ex. `announce`, n'attend plus la fin de la requête).
  inflight = null;
  queue = [];
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
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
export function announce(text: string, lang: string, onEnd?: () => void, opts?: SpeakOpts) {
  if (!text || (!speechSupported() && !isTauri())) {
    onEnd?.();
    return;
  }
  const raw = text;
  text = normalizeForTts(text, lang);
  lastSpokenText = text;
  lastSpokenRaw = raw;
  lastSpokenLang = lang;
  cancelSpeech();
  queue.push({
    text,
    raw,
    lang,
    priority: "critical",
    expiry: Date.now() + TTL.critical,
    ttl: TTL.critical,
    onEnd,
    opts,
  });
  void pump();
}

/**
 * Réponse au pilote (question à la radio, lecture d'une analyse du Coach IA) :
 * comme `announce`, mais peut utiliser la voix en ligne si elle est activée.
 * Ne pas l'employer pour une alerte ni pour « Répète » (qui peut rejouer une alerte).
 */
export function announceAnswer(text: string, lang: string, onEnd?: () => void) {
  announce(text, lang, onEnd, { cloudOk: true });
}

/**
 * Joue une phrase avec la voix en ligne (bouton « Tester » de la Config), sans
 * repli : renvoie la durée de la requête, ou lève l'erreur du fournisseur.
 */
export async function previewCloudVoice(text: string, lang: string): Promise<number> {
  const ctx = audioContext();
  if (!ctx) throw new Error("audio");
  const t0 = performance.now();
  const bytes = await cloudSynth(normalizeForTts(text, lang), norm(lang), speechRate, {
    cacheable: false,
    test: true,
  });
  const ms = Math.round(performance.now() - t0);
  if (!bytes) throw new Error("audio");
  const raw = await ctx.decodeAudioData(bytes);
  cancelSpeech();
  const item: QueueItem = {
    text,
    raw: text,
    lang,
    priority: "normal",
    expiry: Date.now() + TTL.normal,
    ttl: TTL.normal,
  };
  playBuffer(ctx, await styleVoiceBuffer(ctx, raw), item);
  return ms;
}

/**
 * Rejoue la dernière annonce émise (commande spotter « Répète »).
 * Renvoie `false` si rien n'a encore été dit (l'appelant peut alors donner un
 * repli, ex. le statut).
 */
export function repeatLast(): boolean {
  if (!lastSpokenText) return false;
  // Texte d'origine : la normalisation est idempotente, et l'annonce chiffrée reste reconnaissable.
  announce(lastSpokenRaw || lastSpokenText, lastSpokenLang);
  return true;
}

/**
 * Joue immédiatement une phrase (bouton « Tester » de la config). `localOnly` :
 * test de la voix locale, même quand la voix en ligne dit aussi les alertes.
 */
export function previewVoice(text: string, lang: string, opts?: { localOnly?: boolean }) {
  announce(text, lang, undefined, opts?.localOnly ? { localOnly: true } : undefined);
}

let compareTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Comparaison à l'écoute des deux profils radio : la même phrase avec le profil
 * classique, puis avec le profil « Radio stand ». Le profil choisi est restauré à
 * la fin — ou au bout de 15 s si la lecture a été interrompue. `onStep` suit la
 * lecture (profil en cours, `null` à la fin) pour l'affichage.
 */
export function compareRadioStyles(
  text: string,
  lang: string,
  onStep?: (s: RadioStyle | null) => void,
) {
  const saved = radioStyle();
  const restore = () => {
    if (compareTimer) clearTimeout(compareTimer);
    compareTimer = null;
    setRadioStyle(saved);
    onStep?.(null);
  };
  if (compareTimer) clearTimeout(compareTimer);
  compareTimer = setTimeout(restore, 15000);
  setRadioStyle("classic");
  onStep?.("classic");
  announce(text, lang, () => {
    setRadioStyle("pitwall");
    onStep?.("pitwall");
    announce(text, lang, restore);
  });
}
