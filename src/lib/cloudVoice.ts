/**
 * Voix en ligne avec la clé de l'utilisateur — **option désactivée par défaut**.
 *
 * Piper reste le moteur de secours : la voix en ligne dit l'information et les
 * réponses au pilote en direct, et les phrases urgentes (drapeaux, crevaison,
 * spotter, coach) **seulement préparées** — lues dans le cache, jamais en attente
 * du réseau (cf. `cloudModeFor`, réglage « Alertes en voix locale » pour l'ancien
 * comportement). Les annonces chiffrées sont assemblées à partir de morceaux
 * préparés (nombres, parties fixes : `cloudVoiceSegments.ts`, réglage « Annonces
 * chiffrées »). Toute erreur ou lenteur repasse sur Piper pour la phrase
 * concernée. Après deux échecs d'affilée, la voix en ligne est mise en pause une
 * minute (réseau coupé, quota épuisé…) pour ne pas ajouter un délai à chaque annonce.
 *
 * Réglages : `voice_cloud` (JSON, non secret). Clé : chiffrée côté Rust par
 * fournisseur (`ai_key_enc_tts-<fournisseur>`), comme les clés d'IA.
 * Consommation du mois : `voice_cloud_usage` (caractères envoyés, phrases servies
 * par le cache, replis sur Piper).
 */

import { invoke } from "@tauri-apps/api/core";
import { ai, config, isTauri } from "@/lib/api";
import {
  getCloudVoiceProvider,
  providerDefaultVoice,
  type CloudVoiceOption,
  type CloudVoiceProviderId,
} from "@/lib/cloudVoiceProviders";

export interface CloudVoiceSettings {
  enabled: boolean;
  provider: CloudVoiceProviderId;
  /** Vide = modèle par défaut du fournisseur. */
  model: string;
  /** Voix saisie pour toutes les langues (ancien réglage) ; vide = voix par défaut. */
  voice: string;
  /** Voix choisie par langue (code 2 lettres), prioritaire sur `voice`. */
  voiceByLang: Record<string, string>;
  /** Alertes, spotter et coach toujours dits par Piper (ancien comportement). */
  alertsLocal: boolean;
  /**
   * Annonces chiffrées assemblées à partir de morceaux préparés (`cloudVoiceSegments.ts`) :
   * `alerts` = alertes, spotter et coach ; `all` = aussi l'information (sans requête
   * quand tout est prêt) ; `off` = jamais (ancien comportement : Piper pour l'urgent).
   */
  numbers: CloudNumbersMode;
}

export type CloudNumbersMode = "alerts" | "all" | "off";

export interface CloudVoiceUsage {
  /** Mois courant (`AAAA-MM`) : remis à zéro au changement de mois. */
  month: string;
  /** Caractères réellement envoyés (facturables). */
  chars: number;
  requests: number;
  /** Phrases fixes servies par le cache disque (gratuites, instantanées). */
  cacheHits: number;
  /** Phrases dites par Piper faute de réponse (erreur, délai, pause). */
  fallbacks: number;
}

export interface CloudVoiceSnapshot {
  settings: CloudVoiceSettings;
  hasKey: boolean;
  usage: CloudVoiceUsage;
  /** Dernière erreur (affichée dans la Config), vide si la dernière requête a réussi. */
  lastError: string;
  /** « Préparer la voix » : en cours ou dernier résultat (null = jamais lancé). */
  prep: CloudPrepState | null;
}

const DEFAULTS: CloudVoiceSettings = {
  enabled: false,
  provider: "openai",
  model: "",
  voice: "",
  voiceByLang: {},
  alertsLocal: false,
  numbers: "alerts",
};
/** Délai d'une annonce en course : au-delà, Piper parle à la place. */
const RADIO_TIMEOUT_MS = 3000;
const FAIL_LIMIT = 2;
const PAUSE_MS = 60_000;

const month = () => new Date().toISOString().slice(0, 7);
const freshUsage = (): CloudVoiceUsage => ({ month: month(), chars: 0, requests: 0, cacheHits: 0, fallbacks: 0 });
const keyId = (p: CloudVoiceProviderId) => `tts-${p}`;

let settings: CloudVoiceSettings = { ...DEFAULTS };
let apiKey = "";
let usage = freshUsage();
let lastError = "";
let failures = 0;
let pausedUntil = 0;
let prep: CloudPrepState | null = null;
let prepCancel = false;

// ── Abonnement React (useSyncExternalStore) ─────────────────────────────────

const listeners = new Set<() => void>();
let snapshot: CloudVoiceSnapshot = { settings, hasKey: false, usage, lastError, prep: null };

function emit() {
  snapshot = { settings, hasKey: apiKey !== "", usage, lastError, prep };
  listeners.forEach((l) => l());
}

export function subscribeCloudVoice(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function cloudVoiceSnapshot(): CloudVoiceSnapshot {
  return snapshot;
}

// ── Réglages ─────────────────────────────────────────────────────────────────

/** Chargement au démarrage (cf. `stores/app.ts`). */
export async function initCloudVoice(raw?: string | null, rawUsage?: string | null) {
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") {
      settings = {
        enabled: parsed.enabled === true,
        provider: getCloudVoiceProvider(String(parsed.provider ?? "")).id,
        model: typeof parsed.model === "string" ? parsed.model : "",
        voice: typeof parsed.voice === "string" ? parsed.voice : "",
        voiceByLang:
          parsed.voiceByLang && typeof parsed.voiceByLang === "object"
            ? Object.fromEntries(
                Object.entries(parsed.voiceByLang as Record<string, unknown>).filter(
                  (e): e is [string, string] => typeof e[1] === "string",
                ),
              )
            : {},
        // `scope: "info"` : réglage d'une version de développement (infos seulement) = alertes en voix locale.
        alertsLocal: parsed.alertsLocal === true || parsed.scope === "info",
        numbers: parsed.numbers === "all" || parsed.numbers === "off" ? parsed.numbers : "alerts",
      };
    }
  } catch {
    settings = { ...DEFAULTS };
  }
  // Ancien champ « voix pour toutes les langues » → choix par langue (même rendu,
  // mais visible et modifiable langue par langue dans la Config).
  if (settings.voice.trim() && Object.keys(settings.voiceByLang).length === 0) {
    const v = settings.voice.trim();
    settings = { ...settings, voice: "", voiceByLang: { fr: v, en: v, es: v, de: v, it: v } };
  }
  try {
    const u = rawUsage ? JSON.parse(rawUsage) : null;
    if (u && u.month === month()) usage = { ...freshUsage(), ...u };
  } catch {
    /* compteur illisible → repart de zéro */
  }
  apiKey = isTauri() ? await ai.getProviderKey(keyId(settings.provider)).catch(() => "") : "";
  emit();
}

function resetPause() {
  failures = 0;
  pausedUntil = 0;
  lastError = "";
}

export async function updateCloudVoice(patch: Partial<CloudVoiceSettings>) {
  const providerChanged = patch.provider !== undefined && patch.provider !== settings.provider;
  settings = { ...settings, ...patch };
  if (providerChanged) {
    // Modèle et voix sont propres à chaque fournisseur.
    if (patch.model === undefined) settings.model = "";
    if (patch.voice === undefined) settings.voice = "";
    if (patch.voiceByLang === undefined) settings.voiceByLang = {};
    apiKey = await ai.getProviderKey(keyId(settings.provider)).catch(() => "");
  }
  resetPause();
  emit();
  await config.set("voice_cloud", JSON.stringify(settings));
}

export async function setCloudVoiceKey(value: string) {
  apiKey = value.trim();
  resetPause();
  emit();
  await ai.setProviderKey(keyId(settings.provider), apiKey);
}

export function effectiveModel(): string {
  return settings.model.trim() || getCloudVoiceProvider(settings.provider).defaultModel;
}

const langCode = (lang?: string) => (lang ?? "").slice(0, 2).toLowerCase();

/**
 * Voix utilisée pour `lang` : celle choisie pour cette langue, sinon celle saisie
 * pour toutes les langues, sinon la voix par défaut du fournisseur pour la langue.
 */
export function effectiveVoice(lang?: string): string {
  return (
    settings.voiceByLang[langCode(lang)]?.trim() ||
    settings.voice.trim() ||
    providerDefaultVoice(getCloudVoiceProvider(settings.provider), lang)
  );
}

/** Choisit la voix d'une langue (vide = revenir à la voix par défaut). */
export async function setCloudVoiceFor(lang: string, voice: string) {
  const code = langCode(lang);
  const voiceByLang = { ...settings.voiceByLang };
  if (voice.trim()) voiceByLang[code] = voice.trim();
  else delete voiceByLang[code];
  await updateCloudVoice({ voiceByLang });
}

/**
 * Voix proposées par le fournisseur pour `lang` (catalogue fixe ou API, 10 pages
 * de 100 au plus) : **seulement celles de la langue** quand le fournisseur le
 * précise (sinon toutes), triées par nom (ordre du fournisseur conservé à égalité
 * de nom — Google met ses voix Chirp 3 HD en tête).
 */
export async function listCloudVoices(lang: string): Promise<CloudVoiceOption[]> {
  const provider = getCloudVoiceProvider(settings.provider);
  if (provider.staticVoices) return provider.staticVoices;
  if (!provider.listVoices || !apiKey) return [];
  const code = langCode(lang);
  const seen = new Map<string, CloudVoiceOption>();
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const req = provider.listVoices.page({ key: apiKey, lang: code, cursor });
    const raw = await invoke<unknown>("tts_cloud_get_json", { url: req.url, headers: req.headers });
    const { voices, next } = provider.listVoices.parse(raw, code);
    for (const v of voices) if (!seen.has(v.id)) seen.set(v.id, v);
    if (!next || next === cursor) break;
    cursor = next;
  }
  const all = [...seen.values()];
  const mine = all.filter((v) => v.match);
  const list = mine.length ? mine : all;
  return provider.id === "google" ? list : list.sort((a, b) => a.label.localeCompare(b.label));
}

/** Vrai si la voix en ligne doit être essayée maintenant (activée, configurée, pas en pause). */
export function cloudVoiceReady(): boolean {
  return (
    settings.enabled && apiKey !== "" && effectiveVoice() !== "" && isTauri() && Date.now() >= pausedUntil
  );
}

/**
 * Voix en ligne utilisable **depuis le cache** (activée et configurée), même en
 * pause après des échecs réseau : une phrase préparée se lit sans réseau.
 */
export function cloudVoiceOn(): boolean {
  return settings.enabled && apiKey !== "" && effectiveVoice() !== "" && isTauri();
}

/** Réglage « Alertes en voix locale » : alertes, spotter et coach restent sur Piper. */
export function cloudAlertsLocal(): boolean {
  return settings.alertsLocal;
}

/** Réglage « Annonces chiffrées » (assemblage depuis le cache). */
export function cloudNumbersMode(): CloudNumbersMode {
  return settings.numbers;
}

/** Identité du rendu (cache mémoire de `voice.ts`) : change avec le fournisseur, le modèle ou la voix. */
export function cloudVoiceTag(lang?: string): string {
  return `cloud:${settings.provider}:${effectiveModel()}:${effectiveVoice(lang)}`;
}

// ── Consommation ─────────────────────────────────────────────────────────────

let usageTimer: ReturnType<typeof setTimeout> | null = null;

function bumpUsage(patch: Partial<Omit<CloudVoiceUsage, "month">>) {
  if (usage.month !== month()) usage = freshUsage();
  usage = {
    ...usage,
    chars: usage.chars + (patch.chars ?? 0),
    requests: usage.requests + (patch.requests ?? 0),
    cacheHits: usage.cacheHits + (patch.cacheHits ?? 0),
    fallbacks: usage.fallbacks + (patch.fallbacks ?? 0),
  };
  emit();
  if (!usageTimer) {
    usageTimer = setTimeout(() => {
      usageTimer = null;
      config.set("voice_cloud_usage", JSON.stringify(usage)).catch(() => {});
    }, 5000);
  }
}

/** Piper a parlé à la place de la voix en ligne (appelé par `voice.ts`). */
export function noteCloudFallback() {
  bumpUsage({ fallbacks: 1 });
}

// ── Synthèse ─────────────────────────────────────────────────────────────────

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Clé du cache disque d'une phrase fixe : fournisseur, modèle, voix, langue,
 * vitesse et texte. Changer l'un d'eux donne une autre clé — l'ancien audio
 * n'est plus jamais relu (« Vider le cache » libère la place).
 */
function cacheKeyFor(text: string, lang: string, rate: number): Promise<string> {
  return sha256Hex(`${settings.provider}|${effectiveModel()}|${effectiveVoice(lang)}|${lang}|${rate}|${text}`);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Message d'erreur court, sans la clé (le Rust n'inclut jamais la requête). */
function shortError(e: unknown): string {
  const s = typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e);
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
}

/**
 * Synthétise `text` en ligne. Renvoie le fichier audio (à décoder par Web Audio)
 * ou `null` en cas d'échec — l'appelant parle alors avec Piper.
 * `cacheable` : phrase fixe → cache disque (gratuite et instantanée ensuite).
 * `test` : bouton « Tester » (délai long, ignore la pause, remonte l'erreur).
 */
export async function cloudSynth(
  text: string,
  lang: string,
  rate: number,
  opts: { cacheable: boolean; test?: boolean; timeoutMs?: number },
): Promise<ArrayBuffer | null> {
  if (!opts.test && !cloudVoiceReady()) return null;
  const provider = getCloudVoiceProvider(settings.provider);
  const model = effectiveModel();
  const voice = effectiveVoice(lang);
  const req = provider.build({ text, lang, model, voice, rate, key: apiKey });
  const cacheKey = opts.cacheable ? await cacheKeyFor(text, lang, rate) : undefined;
  try {
    const res = await invoke<{ audio: string; cached: boolean }>("tts_cloud_synthesize", {
      url: req.url,
      headers: req.headers,
      body: req.body,
      cacheKey,
      timeoutMs: opts.timeoutMs ?? (opts.test ? 15000 : RADIO_TIMEOUT_MS),
    });
    if (res.cached) bumpUsage({ cacheHits: 1 });
    else bumpUsage({ chars: text.length, requests: 1 });
    failures = 0;
    if (lastError) {
      lastError = "";
      emit();
    }
    const bytes = base64ToArrayBuffer(res.audio);
    return provider.decodeAudio ? provider.decodeAudio(bytes) : bytes;
  } catch (e) {
    lastError = shortError(e);
    failures += 1;
    if (!opts.test && failures >= FAIL_LIMIT) {
      pausedUntil = Date.now() + PAUSE_MS;
      failures = 0;
    }
    emit();
    if (opts.test) throw new Error(lastError);
    return null;
  }
}

/** Relit une phrase présente dans le cache disque (le Rust ne touche pas au réseau). */
async function readCached(text: string, lang: string, rate: number, cacheKey: string): Promise<ArrayBuffer> {
  const provider = getCloudVoiceProvider(settings.provider);
  const req = provider.build({ text, lang, model: effectiveModel(), voice: effectiveVoice(lang), rate, key: apiKey });
  const res = await invoke<{ audio: string; cached: boolean }>("tts_cloud_synthesize", {
    url: req.url,
    headers: req.headers,
    body: req.body,
    cacheKey,
    timeoutMs: RADIO_TIMEOUT_MS,
  });
  if (!res.cached) bumpUsage({ chars: text.length, requests: 1 }); // effacée entre-temps
  const bytes = base64ToArrayBuffer(res.audio);
  return provider.decodeAudio ? provider.decodeAudio(bytes) : bytes;
}

/**
 * Phrase déjà prête dans le cache disque (« Préparer la voix » ou déjà dite) :
 * fichier audio, ou `null` si absente. **Aucune requête** au fournisseur — sert
 * aux phrases urgentes, qui ne doivent jamais attendre le réseau.
 */
export async function cloudCachedAudio(
  text: string,
  lang: string,
  rate: number,
  opts?: { count?: boolean },
): Promise<ArrayBuffer | null> {
  const all = await cloudCachedAudioMany([text], lang, rate, opts);
  return all ? all[0] : null;
}

/**
 * Plusieurs phrases du cache disque d'un coup (morceaux d'une annonce chiffrée) :
 * toutes, dans l'ordre, ou `null` s'il en manque une — vérifié **avant** de rien
 * relire, et sans jamais interroger le fournisseur. Compte un seul « servi par le
 * cache » (`count: false` : écoute du banc, hors consommation de course).
 */
export async function cloudCachedAudioMany(
  texts: string[],
  lang: string,
  rate: number,
  opts?: { count?: boolean },
): Promise<ArrayBuffer[] | null> {
  if (!cloudVoiceOn() || texts.length === 0) return null;
  try {
    const keys = await Promise.all(texts.map((t) => cacheKeyFor(t, lang, rate)));
    const missing = await invoke<string[]>("tts_cloud_cache_missing", { keys });
    if (missing.length) return null;
    const audio = await Promise.all(texts.map((t, i) => readCached(t, lang, rate, keys[i])));
    if (opts?.count !== false) bumpUsage({ cacheHits: 1 });
    return audio;
  } catch {
    return null;
  }
}

/**
 * Phrases absentes du cache disque de la voix en ligne actuelle (banc d'écoute) :
 * toutes hors application de bureau. Local uniquement, aucune requête.
 */
export async function cloudCacheMissing(texts: string[], lang: string, rate: number): Promise<string[]> {
  if (!isTauri() || texts.length === 0) return [...texts];
  const keys = await Promise.all(texts.map((t) => cacheKeyFor(t, lang, rate)));
  const absent = new Set(await invoke<string[]>("tts_cloud_cache_missing", { keys }));
  return texts.filter((_, i) => absent.has(keys[i]));
}

/** Vide le cache disque des phrases fixes. Renvoie le nombre de fichiers supprimés. */
export async function clearCloudVoiceCache(): Promise<number> {
  const n = await invoke<number>("tts_cloud_cache_clear");
  prep = null;
  emit();
  return n;
}

// ── « Préparer la voix » : phrases fixes générées d'avance ───────────────────

/** Ce que coûterait la préparation, calculé sans rien envoyer. */
export interface CloudPrepPlan {
  /** Identité du rendu (fournisseur, modèle, voix, langue, vitesse) : périmé si elle change. */
  tag: string;
  lang: string;
  rate: number;
  /** Phrases fixes de la langue (toutes variantes). */
  total: number;
  /** Phrases absentes du cache disque : les seules envoyées. */
  missing: string[];
  /** Caractères facturables (phrases absentes). */
  chars: number;
}

export type CloudPrepOutcome = "done" | "cancelled" | "paused" | "changed";

export interface CloudPrepState {
  running: boolean;
  tag: string;
  done: number;
  total: number;
  failed: number;
  outcome: CloudPrepOutcome | null;
}

/** Délai d'une phrase pendant la préparation (hors course : on peut attendre). */
const PREP_TIMEOUT_MS = 15000;
/** Requêtes simultanées pendant la préparation (reste sous les limites de débit courantes). */
const PREP_CONCURRENCY = 3;

function setPrep(next: CloudPrepState | null) {
  prep = next;
  emit();
}

export function cloudPrepState(): CloudPrepState | null {
  return prep;
}

/** Identité d'une préparation : la voix en ligne (`cloudVoiceTag`) + langue + vitesse. */
export function cloudPrepTag(lang: string, rate: number): string {
  return `${cloudVoiceTag(lang)}|${lang}|${rate}`;
}

/**
 * Prépare le devis : quelles phrases manquent au cache disque pour la voix en
 * ligne actuelle. Local uniquement (aucune requête au fournisseur).
 */
export async function planCloudPrep(texts: string[], lang: string, rate: number): Promise<CloudPrepPlan> {
  const tag = cloudPrepTag(lang, rate);
  const keys = await Promise.all(texts.map((t) => cacheKeyFor(t, lang, rate)));
  const absent = new Set(await invoke<string[]>("tts_cloud_cache_missing", { keys }));
  const missing = texts.filter((_, i) => absent.has(keys[i]));
  return { tag, lang, rate, total: texts.length, missing, chars: missing.reduce((n, t) => n + t.length, 0) };
}

/** Arrête la préparation en cours après la phrase en vol. */
export function cancelCloudPrep() {
  prepCancel = true;
}

/**
 * Génère une à une les phrases absentes du cache (lancé par un clic). S'arrête
 * sur annulation, sur la pause après échecs (réseau, quota : inutile d'insister)
 * ou si fournisseur, modèle, voix, langue ou vitesse changent en route (la
 * suite serait rangée sous une autre voix que celle du devis affiché).
 */
export async function runCloudPrep(plan: CloudPrepPlan): Promise<CloudPrepOutcome> {
  if (prep?.running) return "cancelled";
  prepCancel = false;
  let state: CloudPrepState = { running: true, tag: plan.tag, done: 0, total: plan.missing.length, failed: 0, outcome: null };
  setPrep(state);
  let outcome: CloudPrepOutcome = "done";
  let next = 0;
  // Quelques requêtes en parallèle : les morceaux des annonces chiffrées se comptent
  // par centaines, une à une la préparation durerait plusieurs minutes.
  const worker = async () => {
    while (next < plan.missing.length) {
      if (prepCancel) outcome = "cancelled";
      else if (cloudPrepTag(plan.lang, plan.rate) !== plan.tag) outcome = "changed";
      else if (Date.now() < pausedUntil) outcome = "paused";
      else if (!cloudVoiceReady()) outcome = "cancelled"; // désactivée ou clé retirée en route
      if (outcome !== "done") return;
      const text = plan.missing[next++];
      const audio = await cloudSynth(text, plan.lang, plan.rate, { cacheable: true, timeoutMs: PREP_TIMEOUT_MS });
      state = { ...state, done: state.done + 1, failed: state.failed + (audio ? 0 : 1) };
      setPrep(state);
    }
  };
  await Promise.all(Array.from({ length: PREP_CONCURRENCY }, worker));
  // Pause déclenchée par le dernier échec : à signaler, même en fin de liste.
  if (outcome === "done" && state.failed > 0 && Date.now() < pausedUntil) outcome = "paused";
  setPrep({ ...state, running: false, outcome });
  return outcome;
}
