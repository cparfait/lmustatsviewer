/**
 * Suite « voix » : la file d'annonces de `voice.ts` jouée pour de vrai, avec un
 * faux Tauri (Piper, voix en ligne, événements) et un faux Web Audio. Reproduit
 * le retour du 2026-10-16 (voix en ligne active) :
 *  1. **deux voix** : une partie des annonces en voix en ligne, le reste en Piper ;
 *  2. **doublons** : la même phrase dite deux fois quand elle revient pendant la
 *     synthèse de la première (invisible pour l'anti-doublon de la file).
 * Couvre aussi la préemption pendant une synthèse, `announce` pendant une
 * requête et le double abonnement du service coach (démarrage asynchrone).
 *
 * Asynchrone : appelée en dernier par `run.ts` (elle pose `window`).
 */

import { section, ok, eq } from "../assert";
import { cloudRoute, CLOUD_FAST_TIMEOUT_MS, CLOUD_TIMEOUT_MS } from "@/lib/voiceRoute";
import { announce, cancelSpeech, clearSpeechCache, prewarmSpeech, previewVoice, speak } from "@/lib/voice";
import { initCloudVoice, updateCloudVoice } from "@/lib/cloudVoice";
import { startCoachService, stopCoachService } from "@/lib/coach";

// ── Faux environnement ───────────────────────────────────────────────────────

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const enc = (s: string) => Buffer.from(s, "utf8").toString("base64");

/** Nœud Web Audio universel : toute propriété / tout appel renvoie un nœud. */
function anyNode(): unknown {
  const store = new Map<PropertyKey, unknown>();
  return new Proxy(function () {}, {
    get(_t, k) {
      if (k === "then" || typeof k === "symbol") return undefined;
      if (!store.has(k)) store.set(k, anyNode());
      return store.get(k);
    },
    set(_t, k, v) {
      store.set(k, v);
      return true;
    },
    apply: () => anyNode(),
  });
}

interface FakeSource {
  buffer: { tag?: string } | null;
  onended: (() => void) | null;
}

/** Lectures de voix, dans l'ordre (`piper:<texte>` ou `cloud:<texte>`). */
let plays: string[] = [];
let lastSource: FakeSource | null = null;
/** Requêtes à la voix en ligne en attente de réponse (le test les libère). */
let cloudRequests: { text: string; done: Deferred<void> }[] = [];
let piperCalls: string[] = [];

class FakeAudioContext {
  currentTime = 0;
  sampleRate = 48000;
  state = "running";
  destination = anyNode();
  constructor() {
    return new Proxy(this, {
      get: (t, k) => (k in t ? (t as unknown as Record<PropertyKey, unknown>)[k] : anyNode()),
    });
  }
  createBufferSource(): unknown {
    const src: FakeSource & Record<string, unknown> = {
      buffer: null,
      onended: null,
      connect: () => anyNode(),
      disconnect: () => {},
      stop: () => {},
      start: () => {
        // Les tampons de bruit de l'habillage radio n'ont pas d'étiquette.
        if (src.buffer?.tag) {
          plays.push(src.buffer.tag);
          lastSource = src;
        }
      },
    };
    return src;
  }
  createBuffer(): unknown {
    return { getChannelData: () => new Float32Array(1), length: 1, duration: 0, sampleRate: 48000 };
  }
  async decodeAudioData(bytes: ArrayBuffer): Promise<unknown> {
    const tag = Buffer.from(new Uint8Array(bytes)).toString("utf8");
    return { tag, length: 1, duration: 1, sampleRate: 48000, numberOfChannels: 1, getChannelData: () => new Float32Array(1) };
  }
  resume() {
    return Promise.resolve();
  }
}

let nextCb = 1;
let nextEvent = 1;
/** Abonnements `live-data` actifs (service coach). */
const liveListeners = new Set<number>();
let listenGate: Deferred<void> | null = null;

async function fakeInvoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
  switch (cmd) {
    case "tts_synthesize":
      piperCalls.push(String(args.text));
      return enc(`piper:${String(args.text)}`);
    case "tts_cloud_synthesize": {
      const body = args.body as { input?: string };
      const text = String(body?.input ?? "");
      const done = deferred<void>();
      cloudRequests.push({ text, done });
      await done.promise;
      return { audio: enc(`cloud:${text}`), cached: false };
    }
    case "ai_get_provider_key":
      return "sk-test";
    case "plugin:event|listen": {
      const id = nextEvent++;
      if (listenGate) await listenGate.promise;
      if (args.event === "live-data") liveListeners.add(id);
      return id;
    }
    default:
      return null;
  }
}

function installFakes() {
  const w = {
    __TAURI_INTERNALS__: { invoke: fakeInvoke, transformCallback: () => nextCb++ },
    __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: (_e: string, id: number) => liveListeners.delete(id) },
    AudioContext: FakeAudioContext,
  };
  (globalThis as unknown as { window: unknown }).window = w;
}

/** Laisse filer les promesses et minuteries en attente. */
async function settle() {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
}

/** Fin naturelle de la lecture en cours. */
async function endPlayback() {
  const src = lastSource;
  lastSource = null;
  src?.onended?.();
  await settle();
}

/** Répond à la requête en ligne en attente pour `text` (la plus ancienne). */
async function answerCloud(text: string) {
  const i = cloudRequests.findIndex((r) => r.text.includes(text));
  if (i >= 0) cloudRequests.splice(i, 1)[0].done.resolve();
  await settle();
}

async function reset(scope: "all" | "info") {
  cancelSpeech();
  clearSpeechCache();
  await settle();
  // Requêtes d'un cas précédent : libérées (résultat ignoré).
  for (const r of cloudRequests) r.done.resolve();
  await settle();
  cloudRequests = [];
  plays = [];
  piperCalls = [];
  lastSource = null;
  await updateCloudVoice({ scope });
}

const engineOf = (tag: string) => tag.split(":")[0];

// ── Cas ──────────────────────────────────────────────────────────────────────

function routeSuite() {
  section("voix — route de la voix en ligne (pur)");
  eq(cloudRoute("normal", false, "info"), { use: "network", timeoutMs: CLOUD_TIMEOUT_MS }, "info : une info passe en ligne");
  eq(cloudRoute("critical", false, "info").use, "off", "info : une alerte reste en Piper (comportement d'origine)");
  eq(cloudRoute("spotter", false, "info").use, "off", "info : spotter en Piper");
  eq(cloudRoute("coach", false, "info").use, "off", "info : coach par virage en Piper");
  eq(cloudRoute("critical", true, "info").use, "network", "info : une réponse au pilote passe en ligne");
  eq(cloudRoute("critical", false, "all"), { use: "network", timeoutMs: CLOUD_FAST_TIMEOUT_MS }, "toutes : alerte en ligne, attente courte");
  eq(cloudRoute("coach", false, "all").timeoutMs, CLOUD_FAST_TIMEOUT_MS, "toutes : coach en ligne, attente courte");
  eq(cloudRoute("spotter", false, "all").use, "memory", "toutes : spotter jamais sur le réseau");
  ok(CLOUD_FAST_TIMEOUT_MS < CLOUD_TIMEOUT_MS && CLOUD_FAST_TIMEOUT_MS >= 1000, "attente courte bornée (le relais Rust plafonne à 1 s minimum)");
}

async function twoVoicesSuite() {
  section("voix — une seule voix (retour 2026-10-16)");

  // Portée « infos » (ancien comportement, gardé en réglage) : deux voix.
  await reset("info");
  speak("Drapeau jaune, attention", "fr", "critical");
  await settle();
  await endPlayback();
  speak("Pneus froids", "fr", "normal");
  await settle();
  await answerCloud("Pneus froids");
  await endPlayback();
  eq(plays.map(engineOf), ["piper", "cloud"], "infos : l'alerte en Piper, l'info en ligne (deux voix, voulu)");

  // Portée « toutes » (défaut) : alerte, info et coach dans la même voix.
  await reset("all");
  speak("Drapeau jaune, attention", "fr", "critical");
  await settle();
  await answerCloud("Drapeau jaune");
  await endPlayback();
  speak("Pneus froids", "fr", "normal");
  await settle();
  await answerCloud("Pneus froids");
  await endPlayback();
  speak("Virage quatre, freine plus tard", "fr", "coach");
  await settle();
  await answerCloud("Virage quatre");
  await endPlayback();
  eq(plays.map(engineOf), ["cloud", "cloud", "cloud"], "toutes : une seule voix");

  // Accusé de l'ingénieur (`announce`, critique) : même voix que la réponse.
  plays = [];
  announce("Bien reçu", "fr");
  await settle();
  await answerCloud("Bien reçu");
  await endPlayback();
  eq(plays.map(engineOf), ["cloud"], "toutes : l'accusé « bien reçu » dans la même voix");

  // « Tester » de la voix locale : Piper, même en portée « toutes ».
  plays = [];
  previewVoice("Test radio", "fr", { localOnly: true });
  await settle();
  await endPlayback();
  eq(plays, ["piper:Test radio"], "le test de la voix locale reste en Piper");

  // Spotter : jamais d'attente réseau. Préparé → voix en ligne tout de suite.
  await reset("all");
  const prep = prewarmSpeech(["Voiture à gauche"], "fr");
  await settle();
  await answerCloud("Voiture à gauche");
  await prep;
  plays = [];
  speak("Voiture à gauche", "fr", "spotter");
  await settle();
  eq(cloudRequests.length, 0, "spotter préparé : aucune requête au moment de parler");
  await endPlayback();
  eq(plays, ["cloud:Voiture à gauche"], "spotter préparé : voix en ligne, sans attente");

  // Spotter pas préparé : Piper cette fois (pas d'attente), la voix en ligne ensuite.
  await reset("all");
  speak("Voiture à droite", "fr", "spotter");
  await settle();
  eq(plays, ["piper:Voiture à droite"], "spotter non préparé : Piper tout de suite");
  await endPlayback();
  await answerCloud("Voiture à droite"); // remplissage en arrière-plan
  speak("Voiture à droite", "fr", "spotter");
  await settle();
  await endPlayback();
  eq(plays.map(engineOf), ["piper", "cloud"], "spotter : voix en ligne dès la fois suivante");
}

async function duplicateSuite() {
  section("voix — chaque annonce dite une fois");

  // La même phrase revient pendant la synthèse de la première.
  await reset("all");
  speak("Écart devant, une seconde", "fr", "normal");
  await settle();
  speak("Écart devant, une seconde", "fr", "normal");
  await settle();
  eq(cloudRequests.length, 1, "une seule requête pour la phrase en double");
  await answerCloud("Écart devant");
  await endPlayback();
  await settle();
  await endPlayback();
  eq(plays.length, 1, "phrase revenue pendant sa synthèse : dite une fois");

  // Alerte pendant la synthèse d'une info : elle passe devant, l'info suit une
  // fois, sans « Je répète » (jamais entendue) ni seconde requête payée.
  await reset("info");
  speak("Pneus froids", "fr", "normal", undefined, { replayPrefix: "Je répète," });
  await settle();
  speak("Crevaison !", "fr", "critical");
  await settle();
  eq(plays, ["piper:Crevaison !"], "l'alerte n'attend pas la réponse du service");
  await answerCloud("Pneus froids");
  eq(plays.length, 1, "l'info devancée ne démarre pas par-dessus l'alerte");
  await endPlayback();
  eq(plays, ["piper:Crevaison !", "cloud:Pneus froids"], "puis l'info, une seule fois, sans « Je répète »");
  eq(cloudRequests.length, 0, "aucune seconde requête pour l'info devancée");
  await endPlayback();

  // `announce` pendant une requête : dite tout de suite, l'ancienne jamais.
  await reset("info");
  speak("Pneus froids", "fr", "normal");
  await settle();
  announce("Statut : P3", "fr");
  await settle();
  eq(plays, ["piper:Statut : P 3"], "announce ne reste plus bloquée derrière la requête annulée");
  await answerCloud("Pneus froids");
  await endPlayback();
  await settle();
  eq(plays.length, 1, "la requête annulée ne joue jamais");
}

async function coachServiceSuite() {
  section("voix — service coach abonné une seule fois");
  const savedFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error("hors ligne"))) as typeof fetch;
  try {
    // Arrêt + redémarrage pendant l'abonnement (StrictMode, Mute aller-retour).
    listenGate = deferred<void>();
    const a = startCoachService();
    stopCoachService();
    const b = startCoachService();
    listenGate.resolve();
    listenGate = null;
    await Promise.all([a, b]);
    await settle();
    eq(liveListeners.size, 1, "démarrer / arrêter / redémarrer : un seul abonnement au flux live");
    stopCoachService();
    await settle();
    eq(liveListeners.size, 0, "arrêt : plus aucun abonnement");

    // Arrêt pendant l'abonnement : rien ne reste.
    listenGate = deferred<void>();
    const c = startCoachService();
    stopCoachService();
    listenGate.resolve();
    listenGate = null;
    await c;
    await settle();
    eq(liveListeners.size, 0, "arrêté pendant l'abonnement : aucun abonnement fantôme");
  } finally {
    globalThis.fetch = savedFetch;
  }
}

export async function run() {
  routeSuite();
  installFakes();
  await initCloudVoice(JSON.stringify({ enabled: true, provider: "openai", voice: "ash" }));
  await twoVoicesSuite();
  await duplicateSuite();
  await coachServiceSuite();
  cancelSpeech();
}
