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
}

export const REGIE_DEFAULT_PORT = 8790;

export const regie = {
  start: (port: number) => invoke<RegieStatus>("regie_start", { port }),
  stop: () => invoke<RegieStatus>("regie_stop"),
  status: () => invoke<RegieStatus>("regie_status"),
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
