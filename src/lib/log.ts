/**
 * Journal de l'application côté interface : la console (outils de dev) **et** le
 * fichier journal local (`applog.rs`), qui part dans le rapport de bug
 * (Configuration › Maintenance). Rien n'est envoyé nulle part.
 */

import { appLog, isTauri } from "@/lib/api";

function text(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}${e.stack ? `\n${e.stack}` : ""}`;
  try {
    return typeof e === "string" ? e : JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Erreur à garder (console + journal) ; ne lève jamais. */
export function logError(source: string, e: unknown, extra?: string): void {
  const msg = extra ? `${text(e)}\n${extra}` : text(e);
  console.error(`[${source}]`, e);
  if (isTauri()) void appLog.write("error", source, msg).catch(() => {});
}

/** Avertissement (console + journal) ; ne lève jamais. */
export function logWarn(source: string, msg: string): void {
  console.warn(`[${source}]`, msg);
  if (isTauri()) void appLog.write("warn", source, msg).catch(() => {});
}
