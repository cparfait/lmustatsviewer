/**
 * Bridge IPC vers le backend Rust (Tauri).
 *
 * Le POC tourne aussi bien dans un navigateur (sans Tauri) que dans Tauri.
 * Quand on est hors Tauri, on retourne des **fallbacks mockés** plutôt que
 * de planter, pour que le développement frontend reste fluide.
 *
 * Tous les appels IPC passent ici → typage centralisé + fallback unique.
 */

// Détection du contexte Tauri.
// Tauri 2 expose `window.__TAURI_INTERNALS__` en runtime.
export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// Chargement paresseux du module @tauri-apps/api (évite l'erreur en mode web pur).
async function getInvoke() {
  if (!isTauri()) return null;
  const mod = await import("@tauri-apps/api/core");
  return mod.invoke;
}

/**
 * Appel d'une commande Tauri avec fallback web.
 * @param cmd nom de la commande (snake_case côté Rust)
 * @param args arguments nommés
 * @param webFallback valeur à retourner si on tourne hors Tauri
 */
export async function call<T>(
  cmd: string,
  args: Record<string, unknown> | undefined,
  webFallback: T | (() => T | Promise<T>)
): Promise<T> {
  const invoke = await getInvoke();
  if (invoke) {
    return invoke<T>(cmd, args);
  }
  // hors Tauri → fallback
  return typeof webFallback === "function"
    ? await (webFallback as () => T | Promise<T>)()
    : webFallback;
}

// ─── Commandes System ──────────────────────────────────────────────────────

export interface PlatformInfo {
  os: string;
  arch: string;
  family: string;
}

export const system = {
  getAppVersion: () =>
    call<string>("get_app_version", undefined, "2.0.0-poc-web"),

  getPlatform: () =>
    call<PlatformInfo>("get_platform", undefined, {
      os: "web",
      arch: "wasm",
      family: "web",
    }),

  ping: (message: string) =>
    call<string>("ping", { message }, `pong: ${message} (web fallback)`),
};

// ─── Commandes à implémenter dans les prochaines phases ─────────────────────
//
// Phase 1 :
// export const profiles = { ... }
// export const indexer  = { ... }
// export const config   = { ... }
//
// Phase 3 :
// export const ohneSpeed = { ... }
//
// Phase 4 :
// export const setups = { ... }
//
// Phase 5 :
// export const live = { ... }
