/**
 * Outils & diagnostic : commandes Tauri + relance du lanceur au démarrage.
 * Backend : `src-tauri/src/commands/tools.rs` (surveillance de LMU toutes les
 * 3 s, lancement sans élévation, fermeture douce des seuls outils lancés par l'app).
 */

import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { config, isTauri } from "@/lib/api";

/** Clé de config (JSON) du lanceur. */
export const TOOLS_LAUNCHER_KEY = "tools_launcher";

export interface ToolEntry {
  path: string;
  /** Fermer l'outil quand LMU s'arrête (défaut : non). */
  close_with_lmu: boolean;
}

export interface LauncherConfig {
  /** Interrupteur global (défaut : désactivé). */
  enabled: boolean;
  tools: ToolEntry[];
}

export interface LauncherStatus {
  active: boolean;
  lmu_running: boolean;
  launched: { path: string; pid: number }[];
  last_error: string | null;
}

export interface KnownTool {
  id: "openkneeboard" | "simhub" | "crewchief";
  name: string;
  path: string;
}

export type DiagStatus = "ok" | "warn" | "error" | "info";

export interface DiagItem {
  id: string;
  status: DiagStatus;
  /** Valeurs brutes (chemins, numéros) ; le texte vient de l'i18n (`id` + `status`). */
  detail: string;
}

export const tools = {
  detectKnown: () => invoke<KnownTool[]>("tools_detect_known"),
  setLauncher: (cfg: LauncherConfig) => invoke<LauncherStatus>("tools_set_launcher", { config: cfg }),
  status: () => invoke<LauncherStatus>("tools_launcher_status"),
  /** `false` = l'outil était déjà ouvert (rien relancé). */
  launchNow: (path: string) => invoke<boolean>("tools_launch_now", { path }),
  diagnostic: () => invoke<DiagItem[]>("pc_diagnostic"),
};

export const EMPTY_LAUNCHER: LauncherConfig = { enabled: false, tools: [] };

/** Lecture tolérante de la config stockée (JSON abîmé → lanceur désactivé). */
export function parseLauncherConfig(raw: string | null): LauncherConfig {
  if (!raw) return EMPTY_LAUNCHER;
  try {
    const v = JSON.parse(raw) as Partial<LauncherConfig>;
    const list = Array.isArray(v.tools) ? v.tools : [];
    return {
      enabled: v.enabled === true,
      tools: list
        .filter((x): x is ToolEntry => typeof x?.path === "string" && x.path.trim() !== "")
        .map((x) => ({ path: x.path, close_with_lmu: x.close_with_lmu === true })),
    };
  } catch {
    return EMPTY_LAUNCHER;
  }
}

export async function loadLauncherConfig(): Promise<LauncherConfig> {
  return parseLauncherConfig(await config.get(TOOLS_LAUNCHER_KEY));
}

/** Enregistre la config puis l'applique au backend (démarre/arrête la surveillance). */
export async function saveLauncherConfig(cfg: LauncherConfig): Promise<LauncherStatus> {
  await config.set(TOOLS_LAUNCHER_KEY, JSON.stringify(cfg));
  return tools.setLauncher(cfg);
}

/** Relance la surveillance au démarrage de l'app si le lanceur était activé. */
export function useToolLauncher(): void {
  useEffect(() => {
    if (!isTauri()) return;
    void (async () => {
      const cfg = await loadLauncherConfig().catch(() => EMPTY_LAUNCHER);
      if (cfg.enabled) await tools.setLauncher(cfg).catch(() => {});
    })();
  }, []);
}
