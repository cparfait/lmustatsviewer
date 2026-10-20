/**
 * Régie tablette (idée ⑪) : commandes Tauri + relance au démarrage.
 * Le serveur (lecture seule, opt-in) est dans `src-tauri/src/commands/regie.rs`.
 */

import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { config, isTauri } from "@/lib/api";

export interface RegieStatus {
  running: boolean;
  url: string;
  code: string;
  qr_svg: string;
  clients: number;
  /** Tablettes vues (plus récente d'abord). */
  devices: RegieDevice[];
}

export interface RegieDevice {
  /** Identifiant stable choisi par la tablette. */
  id: string;
  name: string;
  /** Écran affiché ("" si inconnu). */
  screen: string;
  ip: string;
  /** Secondes depuis sa dernière trame. */
  seen_s: number;
}

export const REGIE_DEFAULT_PORT = 8790;

/** Écrans de la tablette (mêmes clés que `regie.html` et `regie.rs`). */
export const REGIE_SCREENS = ["timing", "relative", "engineer", "flags", "inputs", "gear", "tyres", "map", "duel", "tv"] as const;
export type RegieScreen = (typeof REGIE_SCREENS)[number];

export const regie = {
  start: (port: number) => invoke<RegieStatus>("regie_start", { port }),
  stop: () => invoke<RegieStatus>("regie_stop"),
  status: () => invoke<RegieStatus>("regie_status"),
  /** Thème de l'app, repris par la tablette (même hors service : gardé pour le démarrage). */
  setTheme: (theme: "dark" | "light") => invoke<void>("regie_set_theme", { theme }),
  /** Affiche cet écran sur une tablette (`device`) ou sur toutes (une fois par envoi). */
  pushScreen: (screen: RegieScreen, device?: string) => invoke<void>("regie_push_screen", { screen, device: device ?? null }),
  /** Renomme une tablette (elle garde ce nom sur l'appareil). */
  renameDevice: (device: string, name: string) => invoke<void>("regie_rename_device", { device, name }),
};

/** Port valide (1024-65535), sinon le port par défaut. */
export function regiePort(v: string | null): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : REGIE_DEFAULT_PORT;
}

/** Relance la régie au démarrage de l'app si l'utilisateur l'avait activée. */
export function useRegieAutostart(): void {
  useEffect(() => {
    if (!isTauri()) return;
    void (async () => {
      const [on, port] = await Promise.all([config.get("regie_enabled"), config.get("regie_port")]);
      if (on === "1") await regie.start(regiePort(port)).catch(() => {});
    })();
  }, []);
}
