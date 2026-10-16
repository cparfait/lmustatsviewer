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
  cloudCachedAudio,
  cloudSynth,
  cloudVoiceOn,
  cloudVoiceReady,
  cloudVoiceTag,
  noteCloudFallback,
} from "@/lib/cloudVoice";
import { cloudModeFor, fixedPhrases, isFixedPhrase, type CloudMode } from "@/lib/cloudVoicePrep";

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
    speechVolume = Math.max(0, Math.min(MAX_VOICE_VOLUME, opts.volume));
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
}

interface QueueItem {
  text: string;
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
    retried: true,
    expiry: Date.now() + item.ttl,
  });
}

/**
 * Le pilote prend / rend la parole (push-to-talk). À la prise : l'annonce non
 * critique en cours est coupée (et reprise plus tard si elle le prévoit). Au
 * relâchement : la file repart.
 */
export function setDriverTalking(on: boolean) {
  driverTalking = on;
  if (on && talkSilence && current && current.rank < PRIORITY_RANK.critical) {
    const cut = current;
    cut.end(false);
    requeueCut(cut.item);
  }
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

/** Marque le canal tenu (spotter) à la prise et à la fin de parole. */
function holdChannel(item: QueueItem) {
  const ms = item.opts?.holdChannelMs;
  if (ms && ms > 0) channelHoldUntil = Math.max(channelHoldUntil, Date.now() + ms);
}
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
  };
  const pb: Playback = { text: item.text, rank: PRIORITY_RANK[item.priority], end, item };
  holdChannel(item);
  micMuted(true);
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
  };
  const pb: Playback = { text: item.text, rank: PRIORITY_RANK[item.priority], end, item };
  holdChannel(item);
  micMuted(true);
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
  const ctx = audioContext();
  if (!ctx) return;
  for (const raw of piperUnavailable.has(code) ? [] : texts) {
    if (!raw) continue;
    // Même normalisation que `speak` : sinon la clé ne correspond jamais au
    // texte réellement dit dès qu'il contient un chiffre ou une unité.
    const text = normalizeForTts(raw, lang);
    const key = synthKey(code, text);
    if (synthCache.has(key)) continue;
    const buffer = await synthBuffer(ctx, code, text);
    if (buffer) synthCache.set(key, buffer);
    else if (piperUnavailable.has(code)) break; // Piper indisponible → inutile d'insister
  }
  // Voix en ligne : les phrases déjà préparées passent en mémoire (lecture
  // instantanée au moment critique). Cache disque seulement, aucune requête.
  if (!cloudVoiceOn() || cloudAlertsLocal()) return;
  for (const raw of texts) {
    if (!raw) continue;
    const text = normalizeForTts(raw, lang);
    const cloudKey = `${cloudVoiceTag(code)}|${synthKey(code, text)}`;
    if (!isFixedPhrase(text) || synthCache.has(cloudKey)) continue;
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
 * Piper : jamais d'attente réseau, Piper sinon. « Alertes en voix locale » :
 * ces derniers restent toujours sur Piper (ancien comportement).
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
async function cloudCachedBuffer(ctx: AudioContext, code: string, text: string): Promise<AudioBuffer | null> {
  const bytes = await cloudCachedAudio(text, code, speechRate);
  if (!bytes) return null;
  try {
    return await ctx.decodeAudioData(bytes);
  } catch {
    return null;
  }
}

/** Tente la synthèse Piper + lecture. Renvoie false si indisponible/échec. */
async function trySynthAndPlay(item: QueueItem): Promise<boolean> {
  if (engine !== "piper" || !isTauri()) return false;
  const code = norm(item.lang);
  const ctx = audioContext();
  if (!ctx) return false;
  const g = generation;
  let raw: AudioBuffer | null = null;
  const mode = cloudMode(item);
  if (mode === "live" && cloudVoiceReady()) {
    const cloudKey = `${cloudVoiceTag(code)}|${synthKey(code, item.text)}`;
    raw = synthCache.get(cloudKey) ?? null;
    if (!raw) {
      raw = await cloudBuffer(ctx, code, item.text);
      if (raw && isFixedPhrase(item.text)) rememberPhrase(cloudKey, raw);
      if (!raw) noteCloudFallback();
    }
    if (g !== generation) return true; // annulé pendant la requête
  } else if (mode === "cached" && cloudVoiceOn()) {
    // Phrase urgente : mémoire (pré-chargée) puis cache disque, jamais le réseau.
    const cloudKey = `${cloudVoiceTag(code)}|${synthKey(code, item.text)}`;
    raw = synthCache.get(cloudKey) ?? null;
    if (!raw && isFixedPhrase(item.text)) {
      raw = await cloudCachedBuffer(ctx, code, item.text);
      if (raw) rememberPhrase(cloudKey, raw);
      else noteCloudFallback(); // phrase fixe non préparée : Piper la dit
    }
    if (g !== generation) return true;
  }
  if (!raw && piperUnavailable.has(code)) return false;
  // Callout pré-synthétisé (P3.3) ou phrase fixe déjà dite → lecture immédiate,
  // sans appel Piper.
  const key = synthKey(code, item.text);
  if (!raw) raw = synthCache.get(key) ?? null;
  if (!raw) {
    raw = await synthBuffer(ctx, code, item.text);
    if (raw && isFixedPhrase(item.text)) rememberPhrase(key, raw);
  }
  if (!raw) return false; // Piper indisponible → repli voix système
  // Annulé entre-temps (`cancelSpeech`) : rien ne joue — pas même en repli.
  if (g !== generation) return true;
  // Profil « Radio stand » : habillage appliqué au tampon (le cache reste nu).
  const buffer = await styleVoiceBuffer(ctx, raw);
  if (g !== generation) return true;
  playBuffer(ctx, buffer, item);
  return true;
}

async function pump() {
  if (current || busy) return;
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
/** Mots de liaison pour la normalisation TTS, par langue. */
const TTS_WORDS: Record<
  string,
  { decimal: string; seconds: string; kmh: string; plus: string; minus: string; degrees: string }
> = {
  fr: { decimal: "virgule", seconds: "secondes", kmh: "kilomètres heure", plus: "plus", minus: "moins", degrees: "degrés" },
  en: { decimal: "point", seconds: "seconds", kmh: "kilometers per hour", plus: "plus", minus: "minus", degrees: "degrees" },
  es: { decimal: "coma", seconds: "segundos", kmh: "kilómetros por hora", plus: "más", minus: "menos", degrees: "grados" },
  de: { decimal: "Komma", seconds: "Sekunden", kmh: "Kilometer pro Stunde", plus: "plus", minus: "minus", degrees: "Grad" },
  it: { decimal: "virgola", seconds: "secondi", kmh: "chilometri orari", plus: "più", minus: "meno", degrees: "gradi" },
};

/**
 * Normalise le jargon course pour la synthèse — Piper lit les formes écrites
 * telles quelles : « P13 » devient un mot déformé, « 1:42.123 » est lu avec
 * « deux-points », « km/h » avec « slash », « 0.5 » à l'anglaise en FR/ES/DE/IT.
 * On réécrit en toutes lettres, par langue. S'applique à TOUT ce qui est dit
 * (spotter, coach, test IA) — les textes affichés ne sont pas touchés.
 */
function normalizeForTts(text: string, lang: string): string {
  const w = TTS_WORDS[norm(lang)] ?? TTS_WORDS.en;
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
  text = normalizeForTts(text, lang);
  lastSpokenText = text;
  lastSpokenLang = lang;
  if (current?.text === text) return;
  if (queue.some((it) => it.text === text)) return;
  const ttl = ttlMs !== undefined && ttlMs > 0 ? ttlMs : TTL[priority];
  queue.push({ text, lang, priority, expiry: Date.now() + ttl, ttl, opts });
  if (current && PRIORITY_RANK[priority] > current.rank) {
    // Interrompt l'annonce en cours, moins prioritaire ; elle sera redite une
    // fois après (« Je répète… ») si elle le prévoit et reste fraîche.
    const cut = current;
    cut.end(false);
    requeueCut(cut.item);
  }
  void pump();
}

/** Coupe et vide tout (désactivation des annonces, changement de session). */
export function cancelSpeech() {
  generation++; // invalide toute synthèse Piper en vol
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
  text = normalizeForTts(text, lang);
  lastSpokenText = text;
  lastSpokenLang = lang;
  cancelSpeech();
  queue.push({
    text,
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
  announce(lastSpokenText, lastSpokenLang);
  return true;
}

/** Joue immédiatement une phrase (bouton « Tester » de la config). */
export function previewVoice(text: string, lang: string) {
  announce(text, lang);
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
