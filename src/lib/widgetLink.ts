/**
 * Lien navigateur ↔ serveur de widgets (`src-tauri/src/commands/widget_server.rs`).
 *
 * Une page de widget servie à `http://127.0.0.1:<port>/?w=<id>` (OpenKneeboard,
 * OBS, navigateur) n'a pas accès à l'IPC Tauri : elle reçoit tout par un
 * WebSocket en lecture seule — trames live, tracé (à part, quand il change),
 * config des overlays, langue et évènements du coach vocal.
 *
 * `onAppEvent` / `appSetting` offrent la même API dans les deux mondes : IPC
 * Tauri dans l'app, WebSocket dans une page servie. Les widgets n'ont donc pas
 * à savoir où ils sont affichés.
 */

import { listen } from "@tauri-apps/api/event";
import { config, isTauri, type LiveData } from "@/lib/api";
import { enrichLive } from "@/lib/lmuRest";

type Sub<T> = (v: T) => void;

const liveSubs = new Set<Sub<LiveData | null>>();
const cfgSubs = new Set<Sub<unknown>>();
const langSubs = new Set<Sub<string>>();
const statusSubs = new Set<Sub<boolean>>();
const eventSubs = new Map<string, Set<Sub<unknown>>>();

const state: {
  live: LiveData | null;
  track: Partial<LiveData>;
  cfg: unknown;
  lang: string;
  settings: Record<string, string>;
  connected: boolean;
} = { live: null, track: {}, cfg: null, lang: "", settings: {}, connected: false };

let started = false;
let retryMs = 1000;
let helloResolve: (() => void) | null = null;
const helloReady = new Promise<void>((r) => {
  helloResolve = r;
});

function setConnected(v: boolean) {
  if (state.connected === v) return;
  state.connected = v;
  statusSubs.forEach((cb) => cb(v));
}

function emitLive() {
  liveSubs.forEach((cb) => cb(state.live));
}

interface ServerMsg {
  t: string;
  d?: Partial<LiveData> | null;
  cfg?: unknown;
  lang?: string;
  settings?: Record<string, string> | null;
  name?: string;
  payload?: unknown;
}

function onMessage(msg: ServerMsg) {
  switch (msg.t) {
    case "hello":
      state.settings = msg.settings ?? {};
      if (msg.cfg) {
        state.cfg = msg.cfg;
        cfgSubs.forEach((cb) => cb(msg.cfg));
      }
      if (msg.lang) {
        state.lang = msg.lang;
        langSubs.forEach((cb) => cb(msg.lang!));
      }
      helloResolve?.();
      helloResolve = null;
      break;
    case "track":
      state.track = msg.d ?? {};
      if (state.live) {
        state.live = enrichLive({ ...state.live, ...state.track } as LiveData);
        emitLive();
      }
      break;
    case "live":
      state.live = msg.d ? enrichLive({ ...msg.d, ...state.track } as LiveData) : null;
      emitLive();
      break;
    case "cfg":
      state.cfg = msg.cfg;
      cfgSubs.forEach((cb) => cb(msg.cfg));
      break;
    case "lang":
      if (msg.lang) {
        state.lang = msg.lang;
        langSubs.forEach((cb) => cb(msg.lang!));
      }
      break;
    case "evt":
      if (msg.name) eventSubs.get(msg.name)?.forEach((cb) => cb(msg.payload));
      break;
  }
}

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    retryMs = 1000;
    setConnected(true);
  };
  ws.onmessage = (e) => {
    try {
      onMessage(JSON.parse(String(e.data)) as ServerMsg);
    } catch {
      /* trame illisible : ignorée */
    }
  };
  ws.onclose = () => {
    setConnected(false);
    // Reconnexion automatique (app relancée, serveur redémarré…).
    setTimeout(connect, retryMs);
    retryMs = Math.min(retryMs * 2, 5000);
  };
  ws.onerror = () => ws.close();
}

function ensure() {
  if (started || isTauri()) return;
  started = true;
  connect();
}

function subscribe<T>(set: Set<Sub<T>>, cb: Sub<T>, current?: T): () => void {
  ensure();
  set.add(cb);
  if (current !== undefined) cb(current);
  return () => {
    set.delete(cb);
  };
}

export const widgetLink = {
  /** Trames live (`null` = plus de trame récente : jeu fermé, flux arrêté). */
  onLive: (cb: Sub<LiveData | null>) => subscribe(liveSubs, cb, state.live ?? undefined),
  /** Config brute des overlays (clé `overlays_config`). */
  onConfig: (cb: Sub<unknown>) => subscribe(cfgSubs, cb, state.cfg ?? undefined),
  /** Langue de l'interface de l'app. */
  onLanguage: (cb: Sub<string>) => subscribe(langSubs, cb, state.lang || undefined),
  /** Connexion au serveur (perdue quand l'app est fermée ou le serveur arrêté). */
  onStatus: (cb: Sub<boolean>) => subscribe(statusSubs, cb, state.connected),
};

/** Évènement de l'app (`coach-voice`, `coach-corner`…), où que tourne le widget. */
export function onAppEvent<T>(name: string, cb: (payload: T) => void): Promise<() => void> {
  if (isTauri()) return listen<T>(name, (e) => cb(e.payload));
  let set = eventSubs.get(name);
  if (!set) {
    set = new Set();
    eventSubs.set(name, set);
  }
  return Promise.resolve(subscribe(set, cb as Sub<unknown>));
}

/** Réglage de l'app en lecture seule (liste blanche côté serveur hors Tauri). */
export async function appSetting(key: string): Promise<string | null> {
  if (isTauri()) return config.get(key);
  ensure();
  await Promise.race([helloReady, new Promise((r) => setTimeout(r, 3000))]);
  return state.settings[key] ?? null;
}
