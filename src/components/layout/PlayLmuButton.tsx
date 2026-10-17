/**
 * Bouton « Jouer » de l'en-tête : lance Le Mans Ultimate (par Steam, sinon l'exe du
 * dossier détecté). Pastille verte quand le jeu tourne déjà ; rien à faire alors.
 * Backend : `launch_lmu` / `lmu_is_running` (`src-tauri/src/commands/tools.rs`).
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isTauri } from "@/lib/api";
import { useAppStore } from "@/stores/app";
import { toast, toastError } from "@/stores/dialogs";

export function PlayLmuButton() {
  const { t } = useTranslation();
  const lmuPath = useAppStore((s) => s.lmuPath);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);

  // État du jeu, relu toutes les 5 s (instantané des processus, très léger).
  useEffect(() => {
    if (!isTauri()) return;
    const poll = () => void invoke<boolean>("lmu_is_running").then(setRunning).catch(() => {});
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  if (!isTauri() || !lmuPath) return null;

  const launch = async () => {
    if (running || busy) return;
    setBusy(true);
    try {
      const how = await invoke<string>("launch_lmu", { lmuPath });
      toast(how === "running" ? t("header.lmuAlreadyRunning") : t("header.lmuLaunching"));
      if (how === "running") setRunning(true);
    } catch (e) {
      toastError(t("header.lmuLaunchError", { error: String(e) }));
    } finally {
      // Steam met quelques secondes à ouvrir le jeu : le bouton reste occupé un instant.
      setTimeout(() => setBusy(false), 8000);
    }
  };

  const label = running ? t("header.lmuRunning") : t("header.playLmu");
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => void launch()}
      disabled={busy}
      aria-label={label}
      title={label}
      className="relative"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Play className={running ? "h-4 w-4 text-emerald-500" : "h-4 w-4 fill-current text-primary"} />
      )}
      {running && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />}
    </Button>
  );
}
