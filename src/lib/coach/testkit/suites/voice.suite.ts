/**
 * Suite « voix » : la file d'annonces de `voice.ts` jouée pour de vrai, avec un
 * faux Tauri (Piper, voix en ligne, événements) et un faux Web Audio. Reproduit
 * le retour du 2026-10-16 (voix en ligne active) :
 *  1. **deux voix** : alertes, spotter et coach en Piper — ils passent dans la voix
 *     en ligne une fois préparés (cache, jamais d'attente réseau, `cloudModeFor`),
 *     annonces chiffrées comprises (morceaux assemblés) ;
 *  2. **doublons** : la même phrase dite deux fois quand elle revient pendant la
 *     synthèse de la première (invisible pour l'anti-doublon de la file).
 * Couvre aussi la préemption pendant une synthèse, `announce` pendant une
 * requête et le double abonnement du service coach (démarrage asynchrone).
 *
 * Asynchrone : appelée en dernier par `run.ts` (elle pose `window`).
 */

import { section, eq } from "../assert";
import { cloudModeFor } from "@/lib/cloudVoicePrep";
import { isSegmentTemplateKey } from "@/lib/cloudVoiceSegments";
import {
  announce,
  cancelSpeech,
  clearSpeechCache,
  cloudPrepTexts,
  cloudSegmentPrepTexts,
  configureVoice,
  playBench,
  prewarmSpeech,
  previewVoice,
  setCloudSegmentSource,
  speak,
} from "@/lib/voice";
import { cloudCacheMissing, cloudVoiceSnapshot, initCloudVoice, planCloudPrep, runCloudPrep, updateCloudVoice } from "@/lib/cloudVoice";
import { buildPrepList } from "@/lib/cloudVoicePrepList";
import { piperPrepSnapshot, planPiperPrep, runPiperPrep } from "@/lib/piperPrep";
import fr from "@/i18n/fr";
import { startCoachService, stopCoachService } from "@/lib/coach";
import { loadPaceTiers } from "@/lib/engineer/paceTiers";

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
/** Cache disque simulé de la voix en ligne : clé → texte. */
const cloudCache = new Map<string, string>();
/** « Préparer la voix » en cours : le faux service répond tout de suite. */
let instantCloud = false;

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
  createBuffer(_ch: number, length = 1): unknown {
    // Tampon fabriqué par l'app : seul l'assemblage des annonces chiffrées en crée un
    // qui porte de la voix (les autres sont des bruits de l'habillage radio).
    const data = new Float32Array(length);
    const buf: { tag?: string } & Record<string, unknown> = {
      getChannelData: () => data,
      copyToChannel: () => {
        buf.tag = "cloud:assemblée";
      },
      length,
      duration: 0,
      sampleRate: 48000,
      numberOfChannels: 1,
    };
    return buf;
  }
  async decodeAudioData(bytes: ArrayBuffer): Promise<unknown> {
    const tag = Buffer.from(new Uint8Array(bytes)).toString("utf8");
    // Un quart de seconde de « voix » : le recollage rogne le silence, pas le son.
    const data = new Float32Array(12000).fill(0.5);
    return { tag, length: data.length, duration: 0.25, sampleRate: 48000, numberOfChannels: 1, getChannelData: () => data };
  }
  resume() {
    return Promise.resolve();
  }
}

/** Cache disque de Piper (par voix, comme le backend) ; `piperFails` : moteur en panne. */
const piperDisk = new Set<string>();
let piperFails = false;

let nextCb = 1;
let nextEvent = 1;
/** Abonnements `live-data` actifs (service coach). */
const liveListeners = new Set<number>();
let listenGate: Deferred<void> | null = null;

async function fakeInvoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
  switch (cmd) {
    case "tts_synthesize": {
      if (piperFails) throw new Error("piper absent");
      const text = String(args.text);
      const key = typeof args.cacheKey === "string" ? `${String(args.voiceId ?? "")}|${args.cacheKey}` : "";
      if (key && piperDisk.has(key)) return enc(`piper:${text}`);
      piperCalls.push(text);
      if (key) piperDisk.add(key);
      return enc(`piper:${text}`);
    }
    case "tts_piper_cache_missing":
      return (args.keys as string[]).filter((k) => !piperDisk.has(`${String(args.voiceId ?? "")}|${k}`));
    case "tts_cloud_synthesize": {
      const body = args.body as { input?: string };
      const text = String(body?.input ?? "");
      const key = typeof args.cacheKey === "string" ? args.cacheKey : "";
      if (key && cloudCache.has(key)) return { audio: enc(`cloud:${text}`), cached: true };
      if (!instantCloud) {
        const done = deferred<void>();
        cloudRequests.push({ text, done });
        await done.promise;
      }
      if (key) cloudCache.set(key, text);
      return { audio: enc(`cloud:${text}`), cached: false };
    }
    case "tts_cloud_cache_missing":
      return (args.keys as string[]).filter((k) => !cloudCache.has(k));
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

/** « Préparer la voix » pour ces phrases (le faux service répond tout de suite). */
async function prepare(texts: string[]) {
  const { code, rate, texts: phrases } = cloudPrepTexts(texts, "fr");
  instantCloud = true;
  try {
    await runCloudPrep(await planCloudPrep(phrases, code, rate));
  } finally {
    instantCloud = false;
  }
}

/** `alertsLocal` : réglage « Alertes en voix locale » (alertes, spotter, coach en Piper). */
async function reset(alertsLocal: boolean) {
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
  cloudCache.clear();
  piperDisk.clear();
  await updateCloudVoice({ alertsLocal, numbers: "alerts" });
}

const engineOf = (tag: string) => tag.split(":")[0];

// ── Cas ──────────────────────────────────────────────────────────────────────

function routeSuite() {
  section("voix — route de la voix en ligne (pur)");
  eq(cloudModeFor("normal", false, true), "live", "alertes locales : une info passe en ligne");
  eq(cloudModeFor("critical", false, true), "off", "alertes locales : une alerte reste en Piper (ancien comportement)");
  eq(cloudModeFor("spotter", false, true), "off", "alertes locales : spotter en Piper");
  eq(cloudModeFor("coach", false, true), "off", "alertes locales : coach par virage en Piper");
  eq(cloudModeFor("critical", true, true), "live", "une réponse au pilote passe en ligne");
  eq(cloudModeFor("critical", false, false), "cached", "défaut : alerte en voix en ligne, préparée seulement");
  eq(cloudModeFor("coach", false, false), "cached", "défaut : coach préparé seulement");
  eq(cloudModeFor("spotter", false, false), "cached", "défaut : spotter jamais sur le réseau");
}

async function twoVoicesSuite() {
  section("voix — une seule voix (retour 2026-10-16)");

  // « Alertes en voix locale » (ancien comportement, gardé en réglage) : deux voix.
  await reset(true);
  speak("Drapeau jaune, attention", "fr", "critical");
  await settle();
  await endPlayback();
  speak("Pneus froids", "fr", "normal");
  await settle();
  await answerCloud("Pneus froids");
  await endPlayback();
  eq(plays.map(engineOf), ["piper", "cloud"], "alertes locales : l'alerte en Piper, l'info en ligne (deux voix, voulu)");

  // Défaut, rien de préparé : l'alerte n'attend jamais le réseau → Piper.
  await reset(false);
  speak("Drapeau jaune, attention", "fr", "critical");
  await settle();
  eq(cloudRequests.length, 0, "alerte non préparée : aucune requête au moment de parler");
  await endPlayback();
  eq(plays.map(engineOf), ["piper"], "alerte non préparée : Piper tout de suite");

  // Défaut, voix préparée : alerte, info et coach dans la même voix.
  await reset(false);
  await prepare(["Drapeau jaune, attention", "Virage quatre, freine plus tard", "Bien reçu", "Voiture à gauche"]);
  speak("Drapeau jaune, attention", "fr", "critical");
  await settle();
  await endPlayback();
  speak("Pneus froids", "fr", "normal");
  await settle();
  await answerCloud("Pneus froids");
  await endPlayback();
  speak("Virage quatre, freine plus tard", "fr", "coach");
  await settle();
  await endPlayback();
  eq(plays.map(engineOf), ["cloud", "cloud", "cloud"], "préparée : une seule voix");

  // Accusé de l'ingénieur (`announce`, critique) : même voix une fois préparé.
  plays = [];
  announce("Bien reçu", "fr");
  await settle();
  await endPlayback();
  eq(plays.map(engineOf), ["cloud"], "l'accusé « bien reçu » préparé dans la même voix");

  // « Tester » de la voix locale : Piper, même voix en ligne active.
  plays = [];
  previewVoice("Test radio", "fr", { localOnly: true });
  await settle();
  await endPlayback();
  eq(plays, ["piper:Test radio"], "le test de la voix locale reste en Piper");

  // Spotter préparé : voix en ligne tout de suite, sans requête.
  plays = [];
  await prewarmSpeech(["Voiture à gauche"], "fr");
  speak("Voiture à gauche", "fr", "spotter");
  await settle();
  eq(cloudRequests.length, 0, "spotter préparé : aucune requête au moment de parler");
  await endPlayback();
  eq(plays, ["cloud:Voiture à gauche"], "spotter préparé : voix en ligne, sans attente");

  // Spotter pas préparé : Piper, sans jamais interroger le service.
  plays = [];
  speak("Voiture à droite", "fr", "spotter");
  await settle();
  await endPlayback();
  eq(plays, ["piper:Voiture à droite"], "spotter non préparé : Piper tout de suite");
  eq(cloudRequests.length, 0, "spotter non préparé : aucune requête");

  // Annonce chiffrée urgente : recollée à partir des morceaux préparés.
  await reset(false);
  const live = (fr as unknown as { live: Record<string, unknown> }).live;
  setCloudSegmentSource(() =>
    Object.keys(live)
      .filter((k) => typeof live[k] === "string" && isSegmentTemplateKey(k))
      .map((key) => ({ key, text: live[key] as string })),
  );
  speak("Carburant : environ 2 tours restants", "fr", "critical");
  await settle();
  await endPlayback();
  eq(plays.map(engineOf), ["piper"], "chiffrée, morceaux non préparés : Piper");
  plays = [];
  await prepare(cloudSegmentPrepTexts("fr"));
  speak("Carburant : environ 3 tours restants", "fr", "critical");
  await settle();
  eq(cloudRequests.length, 0, "chiffrée : aucune requête au moment de parler");
  await endPlayback();
  eq(plays, ["cloud:assemblée"], "chiffrée, morceaux préparés : voix en ligne assemblée");

  // Accueil au circuit : recollé sans requête dès que le nom du circuit est préparé.
  const arrival = (sec: string) => `Nous voilà sur Monza. Je te connais ici : ton record avec cette voiture une minute ${sec}.`;
  plays = [];
  speak(arrival("23.4"), "fr", "chatty", undefined, { preferAssembled: true });
  await settle();
  eq(cloudRequests.length, 1, "accueil, nom du circuit non préparé : généré en ligne");
  await answerCloud("Monza");
  await endPlayback();
  await prepare(cloudSegmentPrepTexts("fr", ["Monza"]));
  plays = [];
  speak(arrival("23.5"), "fr", "chatty", undefined, { preferAssembled: true });
  await settle();
  eq(cloudRequests.length, 0, "accueil préparé : aucune requête au moment de parler");
  await endPlayback();
  eq(plays, ["cloud:assemblée"], "accueil préparé : voix en ligne recollée");
  plays = [];
  speak("On arrive sur Monza.", "fr", "chatty", undefined, { preferAssembled: true });
  await settle();
  eq(cloudRequests.length, 0, "accueil sans chiffre : aucune requête");
  await endPlayback();
  eq(plays, ["cloud:assemblée"], "accueil sans chiffre : recollé lui aussi");
  plays = [];
  speak(arrival("23.6"), "fr", "chatty");
  await settle();
  eq(cloudRequests.length, 1, "même phrase sans l'option : en direct, comme les autres informations");
  await answerCloud("Monza");
  await endPlayback();
  await updateCloudVoice({ numbers: "off" });
  plays = [];
  speak(arrival("23.7"), "fr", "chatty", undefined, { preferAssembled: true });
  await settle();
  eq(cloudRequests.length, 1, "réglage « Rien de recollé » : l'accueil part en ligne");
  await answerCloud("Monza");
  await endPlayback();

  // Banc d'écoute : la liste affichée est celle que « Préparer la voix » génère.
  const list = buildPrepList("fr", (k) => k, live, ["Monza"]);
  eq(new Set(list.all).size, list.all.length, "liste du banc : sans doublon");
  eq(list.all.includes("Monza"), true, "liste du banc : noms de circuit compris");
  eq(list.segments.every((x) => list.all.includes(x)), true, "liste du banc : tous les morceaux");
  eq(list.phrases.length > 200, true, "liste du banc : toutes les phrases fixes");
  eq(list.phrases.every((x) => list.all.includes(x)), true, "liste du banc : aucune phrase fixe oubliée");
  await prepare(list.all);
  eq((await cloudCacheMissing(list.all, list.code, list.rate)).length, 0, "liste du banc : toute préparée d'un coup");
  plays = [];
  eq(await playBench("Monza", "fr", "cloud", true), true, "morceau écouté depuis le banc");
  eq(cloudRequests.length, 0, "écoute du banc : aucune requête");
  await endPlayback();
  eq(plays, ["cloud:Monza"], "morceau du banc : lu dans le cache de la voix en ligne");

  // Préparation complète lancée par le bouton : les alertes passent en voix IA.
  await reset(true);
  const alert = cloudPrepTexts(["Voiture à gauche"], "fr");
  const runFromButton = async () => {
    instantCloud = true;
    try {
      await runCloudPrep(await planCloudPrep(alert.texts, alert.code, alert.rate), { freeLocalAlerts: true });
    } finally {
      instantCloud = false;
    }
  };
  await prepare(["Voiture à droite"]);
  eq(cloudVoiceSnapshot().settings.alertsLocal, true, "préparation hors bouton : réglage intact");
  await runFromButton();
  eq(cloudVoiceSnapshot().settings.alertsLocal, false, "tout généré : « Alertes en voix locale » coupé");
  plays = [];
  speak("Voiture à gauche", "fr", "spotter");
  await settle();
  eq(cloudRequests.length, 0, "alerte après préparation : aucune requête");
  await endPlayback();
  eq(plays, ["cloud:Voiture à gauche"], "alerte après préparation : voix IA");
  await updateCloudVoice({ alertsLocal: true });
  await runFromButton();
  eq(cloudVoiceSnapshot().settings.alertsLocal, true, "réactivé par le pilote, rien à générer : son choix tient");
  setCloudSegmentSource(null);
}

async function piperPrepSuite() {
  section("voix — phrases Piper préparées");
  await reset(false);
  const texts = ["Phrase préparée une", "Phrase préparée deux"];
  const plan = await planPiperPrep(texts, "fr");
  eq(plan.missing, texts, "rien de prêt : tout est à générer");
  eq(await runPiperPrep(plan), "done", "génération terminée");
  eq(piperCalls, texts, "chaque phrase passe une fois dans Piper");
  eq((await planPiperPrep(texts, "fr")).missing, [], "tout est prêt ensuite");

  // Nouveau lancement : mémoire vide, disque plein. La phrase part sans appeler Piper.
  clearSpeechCache();
  piperCalls = [];
  plays = [];
  speak(texts[0], "fr", "spotter");
  await settle();
  await endPlayback();
  eq(piperCalls, [], "phrase préparée : relue sur disque, sans Piper");
  eq(plays, [`piper:${texts[0]}`], "phrase préparée : bien dite");

  // Une phrase chiffrée n'est pas gardée : elle change à chaque fois.
  const size = piperDisk.size;
  speak("Carburant pour 3 tours", "fr", "spotter");
  await settle();
  await endPlayback();
  eq(piperDisk.size, size, "phrase chiffrée : pas de fichier");

  // Autre voix : ses propres phrases, et une génération lancée ne se mélange pas.
  const before = piperPrepSnapshot().outcome;
  eq(before, "done", "état de la dernière génération");
  configureVoice({ piperByLang: { fr: "autre-voix" } });
  const other = await planPiperPrep(texts, "fr");
  eq(other.missing, texts, "autre voix : tout est à générer");
  configureVoice({ piperByLang: {} });
  eq(await runPiperPrep(other), "changed", "voix changée en route : arrêt");
  eq(piperPrepSnapshot().done, 0, "voix changée : rien de généré pour l'ancienne");
  eq((await planPiperPrep(texts, "fr")).missing, [], "la voix d'origine garde ses phrases");

  // Moteur en panne : arrêt rapide, et reprise de ce qui manque.
  const more = ["Phrase a", "Phrase b", "Phrase c", "Phrase d"];
  const failing = await planPiperPrep(more, "fr");
  piperFails = true;
  eq(await runPiperPrep(failing), "paused", "Piper en panne : arrêt");
  eq(piperPrepSnapshot().failed, 2, "arrêt après deux échecs d'affilée");
  piperFails = false;
  eq((await planPiperPrep(more, "fr")).missing, more, "rien de faux gardé : tout reste à générer");
}

async function duplicateSuite() {
  section("voix — chaque annonce dite une fois");

  // La même phrase revient pendant la synthèse de la première.
  await reset(false);
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
  await reset(true);
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
  await reset(true);
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

/** `onHeard` : la question des chronos n'est marquée posée qu'entendue jusqu'au bout. */
async function heardSuite() {
  section("voix — annonce entendue jusqu'au bout");
  let heard = 0;
  const onHeard = () => heard++;

  await reset(true);
  speak("Pneus froids", "fr", "normal", undefined, { onHeard });
  await settle();
  await answerCloud("Pneus froids");
  eq(heard, 0, "en cours de lecture : pas encore");
  await endPlayback();
  eq(heard, 1, "lue jusqu'au bout : entendue");

  heard = 0;
  await reset(true);
  speak("Pneus froids", "fr", "normal", undefined, { onHeard });
  await settle();
  await answerCloud("Pneus froids");
  speak("Crevaison !", "fr", "critical");
  await settle();
  await endPlayback();
  await settle();
  eq(heard, 0, "coupée par une alerte, sans reprise : pas entendue");

  heard = 0;
  await reset(true);
  speak("Pneus froids", "fr", "normal", undefined, { onHeard, replayPrefix: "Je répète," });
  await settle();
  await answerCloud("Pneus froids");
  speak("Crevaison !", "fr", "critical");
  await settle();
  await endPlayback();
  eq(heard, 0, "coupée : pas encore entendue");
  await answerCloud("Pneus froids");
  await endPlayback();
  eq(heard, 1, "reprise jusqu'au bout : entendue");
}

/** Paliers de chrono : un échec réseau se voit (retenté), un combo inconnu non. */
async function tierLoadSuite() {
  section("paliers — échec réseau distingué d'une absence");
  const rejects = async (get: Parameters<typeof loadPaceTiers>[2]) =>
    loadPaceTiers("Spa", "GT3", get).then(
      () => false,
      () => true,
    );
  const offline = (() => Promise.reject(new Error("hors ligne"))) as NonNullable<Parameters<typeof loadPaceTiers>[2]>;
  eq(await rejects(offline), true, "réseau coupé : rejet, l'appelant retentera");
  const unknown = (() => Promise.resolve(null)) as NonNullable<Parameters<typeof loadPaceTiers>[2]>;
  eq(await loadPaceTiers("Spa", "GT3", unknown), null, "404 : une réponse, pas d'erreur");
  const combos = { combos: [{ track: "Spa", track_course: "Spa", car_class: "GT3" }] };
  const detailDown = ((route: string) => (route === "combos" ? Promise.resolve(combos) : Promise.reject(new Error("hors ligne")))) as unknown as NonNullable<
    Parameters<typeof loadPaceTiers>[2]
  >;
  eq(await rejects(detailDown), true, "combo trouvé, détail injoignable : rejet aussi");
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
  await piperPrepSuite();
  await duplicateSuite();
  await heardSuite();
  await tierLoadSuite();
  await coachServiceSuite();
  cancelSpeech();
}
