/**
 * Téléchargement à la demande des modèles vocaux — voix TTS Piper (`kind="tts"`)
 * ou modèle STT Vosk (`kind="stt"`) de la langue active.
 *
 * Les modèles ne sont plus bundlés dans l'installeur (~550 Mo économisés) :
 * cette liste (Config → Audio / Voix) les installe en un clic, avec barre de
 * progression (événement `asset-progress` du backend). Rend `null` hors Tauri
 * ou si le catalogue est vide.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assets, isTauri, type AssetInfo } from "@/lib/api";
import { toastError, toastSuccess } from "@/stores/dialogs";

export function VoiceDownloads({
  kind,
  onInstalled,
}: {
  kind: "tts" | "stt";
  /** Appelé après une installation réussie (pour rafraîchir tts/stt_available). */
  onInstalled?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [catalog, setCatalog] = useState<AssetInfo[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const mounted = useRef(true);

  const refresh = () => {
    if (!isTauri()) return;
    assets
      .catalog()
      .then((c) => mounted.current && setCatalog(c))
      .catch(() => {});
  };
  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let gone = false;
    void assets.onProgress((p) => {
      if (p.kind !== kind || p.total <= 0) return;
      setPct(Math.min(100, Math.round((p.downloaded / p.total) * 100)));
    }).then((u) => {
      if (gone) u();
      else unlisten = u;
    });
    return () => {
      gone = true;
      unlisten?.();
    };
  }, [kind]);

  const lang = (i18n.language || "en").slice(0, 2).toLowerCase();
  const rows = catalog.filter((a) => a.kind === kind && a.lang === lang);
  if (!isTauri() || rows.length === 0) return null;

  const download = async (a: AssetInfo) => {
    setBusyId(a.id);
    setPct(0);
    try {
      await assets.download(kind, a.id);
      toastSuccess(t("config.assetDlDone"));
      refresh();
      onInstalled?.();
    } catch (e) {
      toastError(t("config.assetDlError", { msg: String(e) }));
    } finally {
      if (mounted.current) setBusyId(null);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium leading-tight">
        {t(kind === "tts" ? "config.assetVoicesTitle" : "config.assetSttTitle")}
      </div>
      <p className="text-xs text-muted-foreground/80">
        {t(kind === "tts" ? "config.assetVoicesHint" : "config.assetSttHint")}
      </p>
      {rows.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-3 py-0.5">
          <div className="min-w-0 text-sm">
            {kind === "tts" ? a.label : t("config.assetSttModel")}
            {a.is_default && kind === "tts" && (
              <span className="ml-1.5 text-mini text-muted-foreground">
                {t("config.assetDefaultTag")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {a.installed ? (
              <span className="flex items-center gap-1 text-xs text-success">
                <Check className="h-3.5 w-3.5" />
                {t("config.assetInstalled")}
              </span>
            ) : busyId === a.id ? (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="relative h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width]"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="tabular-nums w-9 text-right">{pct}%</span>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              </span>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5"
                disabled={busyId !== null}
                onClick={() => void download(a)}
              >
                <Download className="h-3.5 w-3.5" />
                {t("config.assetDlBtn", { size: a.size_mb })}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
