/**
 * Serveur de widgets (VR OpenKneeboard, OBS, 2ᵉ écran) : commandes Tauri,
 * relance au démarrage et synchro de la langue. Le serveur (127.0.0.1 seul,
 * lecture seule, désactivé par défaut) est dans
 * `src-tauri/src/commands/widget_server.rs` ; les pages servies utilisent
 * `lib/widgetLink.ts`.
 */

import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { config, isTauri } from "@/lib/api";

export interface WidgetServerStatus {
  running: boolean;
  port: number;
  url: string;
  clients: number;
}

export const WIDGET_SERVER_DEFAULT_PORT = 8791;
/** Site officiel d'OpenKneeboard (téléchargement), nécessaire pour la VR. */
export const OPENKNEEBOARD_URL = "https://openkneeboard.com/";

/** Ouvre une adresse dans le navigateur par défaut (app) ou un nouvel onglet (page servie). */
export function openExternal(url: string): void {
  if (!isTauri()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  void import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(url)).catch(() => {});
}
export const WIDGET_SERVER_ENABLED_KEY = "widget_server_enabled";
export const WIDGET_SERVER_PORT_KEY = "widget_server_port";

export const widgetServer = {
  start: (port: number) => invoke<WidgetServerStatus>("widget_server_start", { port }),
  stop: () => invoke<WidgetServerStatus>("widget_server_stop"),
  status: () => invoke<WidgetServerStatus>("widget_server_status"),
  setLanguage: (lang: string) => invoke<void>("widget_server_set_language", { lang }),
};

/** Port valide (1024-65535), sinon le port par défaut. */
export function widgetServerPort(v: string | null): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : WIDGET_SERVER_DEFAULT_PORT;
}

export interface WidgetUrlOptions {
  /** Fond sombre opaque (capture de fenêtre qui gère mal la transparence). */
  opaque?: boolean;
  /** Échelle d'affichage (1 = taille de l'overlay écran). */
  scale?: number;
}

/** Adresse d'un widget servi seul. */
export function widgetUrl(base: string, id: string, opts: WidgetUrlOptions = {}): string {
  const q = new URLSearchParams({ w: id });
  if (opts.opaque) q.set("bg", "opaque");
  if (opts.scale && opts.scale !== 1) q.set("scale", String(opts.scale));
  return `${base}/?${q.toString()}`;
}

/**
 * Monté dans App : relance le serveur si l'utilisateur l'avait activé et
 * transmet la langue de l'interface (les pages servies ne la connaissent pas).
 */
export function useWidgetServerAutostart(): void {
  const { i18n } = useTranslation();
  useEffect(() => {
    if (!isTauri()) return;
    void (async () => {
      const [on, port] = await Promise.all([
        config.get(WIDGET_SERVER_ENABLED_KEY),
        config.get(WIDGET_SERVER_PORT_KEY),
      ]);
      if (on === "1") await widgetServer.start(widgetServerPort(port)).catch(() => {});
    })();
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    void widgetServer.setLanguage(i18n.language).catch(() => {});
  }, [i18n.language]);
}
