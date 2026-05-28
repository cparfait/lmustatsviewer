import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import type { Update } from "@tauri-apps/plugin-updater";
import { checkForUpdate, downloadAndRelaunch } from "@/lib/updater";
import { useAppStore } from "@/stores/app";
import { Button } from "@/components/ui/button";
import { Download, Loader2, CheckCircle2, AlertTriangle, X } from "lucide-react";

type State =
  | { k: "hidden" }
  | { k: "checking" }
  | { k: "uptodate" }
  | { k: "available"; update: Update }
  | { k: "downloading"; pct: number }
  | { k: "error" };

/**
 * Bannière de mise à jour — vérifie au démarrage (si la préférence
 * `auto_update` est active) et sur demande (menu du system tray / page Config,
 * via l'événement `tray-check-update`).
 */
export function UpdateBanner() {
  const { t } = useTranslation();
  const [state, setState] = useState<State>({ k: "hidden" });

  async function doCheck(manual: boolean) {
    setState({ k: "checking" });
    try {
      const upd = await checkForUpdate();
      if (upd) setState({ k: "available", update: upd });
      else setState({ k: manual ? "uptodate" : "hidden" });
    } catch {
      setState({ k: manual ? "error" : "hidden" });
    }
  }

  // Vérification automatique au démarrage (après le chargement de la config).
  useEffect(() => {
    const id = setTimeout(() => {
      if (useAppStore.getState().autoUpdate) doCheck(false);
    }, 3000);
    return () => clearTimeout(id);
  }, []);

  // Vérification manuelle (tray / Config).
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen("tray-check-update", () => doCheck(true)).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Disparition auto des messages transitoires.
  useEffect(() => {
    if (state.k === "uptodate" || state.k === "error") {
      const id = setTimeout(() => setState({ k: "hidden" }), 6000);
      return () => clearTimeout(id);
    }
  }, [state.k]);

  if (state.k === "hidden") return null;

  async function install(update: Update) {
    setState({ k: "downloading", pct: 0 });
    try {
      await downloadAndRelaunch(update, (pct) =>
        setState({ k: "downloading", pct })
      );
    } catch {
      setState({ k: "error" });
    }
  }

  return (
    <div className="border-b border-primary/30 bg-primary/10">
      <div className="mx-auto max-w-[1800px] px-4 py-2 flex items-center gap-3 text-sm">
        {state.k === "checking" && (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>{t("updater.checking")}</span>
          </>
        )}

        {state.k === "uptodate" && (
          <>
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span>{t("updater.upToDate")}</span>
          </>
        )}

        {state.k === "error" && (
          <>
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span>{t("updater.error")}</span>
          </>
        )}

        {state.k === "available" && (
          <>
            <Download className="h-4 w-4 text-primary" />
            <span className="font-medium">
              {t("updater.available", { version: state.update.version })}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => install(state.update)}
                className="gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                {t("updater.install")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setState({ k: "hidden" })}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {state.k === "downloading" && (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>
              {t("updater.downloading", {
                pct: Math.round(state.pct * 100),
              })}
            </span>
            <div className="ml-auto h-1.5 w-48 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${state.pct * 100}%` }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
