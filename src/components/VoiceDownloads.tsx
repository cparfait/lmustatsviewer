/**
 * Téléchargement à la demande des modèles vocaux — voix TTS Piper (`kind="tts"`)
 * ou modèle STT Vosk (`kind="stt"`) de la langue active.
 *
 * Les modèles ne sont plus bundlés dans l'installeur (~550 Mo économisés) ;
 * deux rendus (Config → Audio / Voix) :
 * - `variant="banner"` : bandeau d'alerte bien visible avec le bouton de
 *   téléchargement du modèle par défaut — affiché directement dans la page
 *   (rien à déplier), disparaît une fois le modèle installé ;
 * - `variant="list"` (défaut) : liste complète des modèles de la langue
 *   (voix alternatives incluses) dans les réglages dépliés.
 *
 * Progression via l'événement `asset-progress` du backend. Rend `null` hors
 * Tauri ou si le catalogue est vide.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Download, Loader2, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assets, isTauri, type AssetInfo } from "@/lib/api";
import { confirmDialog, toastError, toastSuccess } from "@/stores/dialogs";

/** Choix de la voix Piper dans la liste (voix installées, une ligne par locuteur). */
export interface PiperPick {
  options: { voiceId: string; value: string; label: string }[];
  /** Valeur choisie (`""` = aucune choisie : la voix par défaut de la langue). */
  value: string;
  onSelect: (value: string) => void;
  /** Sélectionne la voix puis joue une phrase d'essai. */
  onTest: (value: string) => void;
}

export function VoiceDownloads({
  kind,
  variant = "list",
  onInstalled,
  pick,
}: {
  kind: "tts" | "stt";
  variant?: "banner" | "list";
  /** Appelé après une installation réussie (pour rafraîchir tts/stt_available). */
  onInstalled?: () => void;
  /** Voix TTS : choisir et écouter directement dans la liste. */
  pick?: PiperPick;
}) {
  const { t, i18n } = useTranslation();
  const [catalog, setCatalog] = useState<AssetInfo[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const mounted = useRef(true);

  /** Supprime un modèle téléchargé, après confirmation (place disque récupérée). */
  const remove = async (a: AssetInfo) => {
    const name = kind === "tts" ? a.label : t("config.assetSttModel");
    const ok = await confirmDialog({
      title: t("config.assetDeleteTitle", { name }),
      message: t("config.assetDeleteMsg", { size: a.size_mb }),
      confirmLabel: t("config.assetDelete"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await assets.remove(kind, a.id);
      toastSuccess(t("config.assetDeleted", { name }));
      refresh();
      onInstalled?.();
    } catch (e) {
      const code = String(e);
      toastError(
        code.includes("in_use")
          ? t("config.assetDeleteInUse")
          : code.includes("not_downloaded")
            ? t("config.assetDeleteBundled")
            : t("config.assetDeleteError", { error: code }),
      );
    }
  };

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

  const progressBar = (
    <span className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
      <span className="relative h-1.5 w-28 overflow-hidden rounded-full bg-muted">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="tabular-nums w-9 text-right">{pct}%</span>
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
    </span>
  );

  const downloadButton = (a: AssetInfo) => (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1.5 shrink-0"
      disabled={busyId !== null}
      onClick={() => void download(a)}
    >
      <Download className="h-3.5 w-3.5" />
      {t("config.assetDlBtn", { size: a.size_mb })}
    </Button>
  );

  if (variant === "banner") {
    // Modèle « principal » de la langue : la voix par défaut (TTS) / le modèle
    // unique (STT). Une fois installé, le bandeau disparaît (la liste complète
    // reste accessible dans les réglages dépliés).
    const main = rows.find((a) => a.is_default) ?? rows[0];
    if (!main || main.installed) return null;
    return (
      <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <span className="text-xs leading-snug">
            {t(
              kind === "tts"
                ? "config.assetVoiceMissing"
                : "config.assetSttMissing",
            )}
          </span>
        </div>
        {busyId === main.id ? progressBar : downloadButton(main)}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium leading-tight">
        {t(kind === "tts" ? "config.assetVoicesTitle" : "config.assetSttTitle")}
      </div>
      <p className="text-xs text-muted-foreground/80">
        {t(kind === "tts" ? "config.assetVoicesHint" : "config.assetSttHint")}
      </p>
      {rows.map((a) => {
        // Voix installée : un choix par locuteur (UPMC = Jessica et Pierre).
        const speakers = pick && a.installed ? pick.options.filter((o) => o.voiceId === a.id) : [];
        const single = speakers.length === 1 ? speakers[0] : null;
        return (
        <div key={a.id}>
        <div className="flex items-center justify-between gap-3 py-0.5">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            {single && pick && <Radio checked={pick.value === single.value} onClick={() => pick.onSelect(single.value)} />}
            {kind === "tts" ? a.label : t("config.assetSttModel")}
            {a.is_default && kind === "tts" && (
              <span className="ml-1.5 text-mini text-muted-foreground">
                {t("config.assetDefaultTag")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {single && pick && <TestButton onClick={() => pick.onTest(single.value)} />}
            {a.installed ? (
              <>
                <span className="flex items-center gap-1 text-xs text-success">
                  <Check className="h-3.5 w-3.5" />
                  {t("config.assetInstalled")}
                </span>
                {a.deletable && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  aria-label={t("config.assetDelete")}
                  title={t("config.assetDelete")}
                  onClick={() => void remove(a)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                )}
              </>
            ) : busyId === a.id ? (
              progressBar
            ) : (
              downloadButton(a)
            )}
          </div>
        </div>
        {speakers.length > 1 && pick && (
          <div className="ml-4 border-l border-border pl-3">
            {speakers.map((o) => (
              <PickRow
                key={o.value}
                label={o.label}
                selected={pick.value === o.value}
                onSelect={() => pick.onSelect(o.value)}
                onTest={() => pick.onTest(o.value)}
              />
            ))}
          </div>
        )}
        </div>
        );
      })}
    </div>
  );
}

/** Bouton radio de choix de voix. */
function Radio({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-primary"
    >
      {checked && <span className="h-2 w-2 rounded-full bg-primary" />}
    </button>
  );
}

function TestButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onClick}>
      <Play className="h-3 w-3" />
      {t("config.voiceTest")}
    </Button>
  );
}

/** Ligne de choix seule (Automatique, locuteurs d'une voix à plusieurs voix). */
function PickRow({
  label,
  hint,
  selected,
  onSelect,
  onTest,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onSelect: () => void;
  onTest: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <Radio checked={selected} onClick={onSelect} />
        <span>{label}</span>
        {hint && <span className="text-mini text-muted-foreground">{hint}</span>}
      </div>
      <TestButton onClick={onTest} />
    </div>
  );
}
