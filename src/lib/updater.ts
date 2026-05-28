/**
 * Mises à jour automatiques — bridge vers le plugin Tauri `updater`.
 *
 * L'updater interroge les Releases GitHub (`latest.json`). Une nouvelle
 * version n'atteint l'utilisateur que lorsqu'une Release signée est publiée
 * (jamais sur un simple commit).
 */

import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/** Vérifie la disponibilité d'une mise à jour. `null` si à jour. */
export async function checkForUpdate(): Promise<Update | null> {
  return await check();
}

/**
 * Télécharge et installe la mise à jour, puis relance l'application.
 * `onProgress` reçoit l'avancement (0 → 1).
 */
export async function downloadAndRelaunch(
  update: Update,
  onProgress: (pct: number) => void
): Promise<void> {
  let total = 0;
  let downloaded = 0;
  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? 0;
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      if (total > 0) onProgress(Math.min(1, downloaded / total));
    } else if (event.event === "Finished") {
      onProgress(1);
    }
  });
  await relaunch();
}
