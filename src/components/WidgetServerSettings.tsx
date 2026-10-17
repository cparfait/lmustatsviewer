/**
 * Widgets par adresse locale (page Overlays) : chaque widget s'ouvre seul dans
 * OpenKneeboard (VR), OBS ou un navigateur du même PC.
 *
 * Désactivé par défaut. Le serveur n'écoute que sur 127.0.0.1 et en lecture
 * seule (`src-tauri/src/commands/widget_server.rs`). `useWidgetServerAutostart`
 * (`lib/widgetServer.ts`, monté dans App) le relance au démarrage s'il était
 * activé. Le contenu et la couleur de chaque widget suivent ses réglages de la
 * page Overlays.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, ExternalLink, Glasses, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { config, isTauri } from "@/lib/api";
import { OVERLAY_DEFS } from "@/lib/overlays";
import {
  widgetServer,
  widgetServerPort,
  widgetUrl,
  openExternal,
  OPENKNEEBOARD_URL,
  WIDGET_SERVER_DEFAULT_PORT,
  WIDGET_SERVER_ENABLED_KEY,
  WIDGET_SERVER_PORT_KEY,
  type WidgetServerStatus,
} from "@/lib/widgetServer";

const SCALES = [1, 1.25, 1.5, 2];

export function WidgetServerSettings() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<WidgetServerStatus | null>(null);
  const [port, setPort] = useState(String(WIDGET_SERVER_DEFAULT_PORT));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [opaque, setOpaque] = useState(false);
  const [scale, setScale] = useState(1);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!isTauri()) return;
    void config.get(WIDGET_SERVER_PORT_KEY).then((p) => setPort(String(widgetServerPort(p))));
    const poll = () => void widgetServer.status().then(setStatus).catch(() => {});
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  const toggle = async (on: boolean) => {
    setBusy(true);
    setError("");
    try {
      const p = widgetServerPort(port);
      await config.set(WIDGET_SERVER_ENABLED_KEY, on ? "1" : "0");
      await config.set(WIDGET_SERVER_PORT_KEY, String(p));
      setStatus(on ? await widgetServer.start(p) : await widgetServer.stop());
    } catch (e) {
      setError(String(e));
      await config.set(WIDGET_SERVER_ENABLED_KEY, "0").catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const copy = (url: string) => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(url);
      setTimeout(() => setCopied((c) => (c === url ? "" : c)), 1500);
    });
  };

  const open = (url: string) => {
    void import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(url)).catch(() => {});
  };

  const running = status?.running ?? false;

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-start gap-3">
        <Glasses className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="space-y-1">
          <h3 className="font-semibold">{t("overlays.web.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("overlays.web.desc")}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border p-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{t("overlays.web.enable")}</p>
          <p className="text-xs text-muted-foreground">{t("overlays.web.enableHint")}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted-foreground" htmlFor="widget-port">
            {t("overlays.web.port")}
          </label>
          <Input
            id="widget-port"
            className="w-24 font-mono"
            inputMode="numeric"
            value={port}
            disabled={running || busy}
            onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))}
          />
          {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Switch checked={running} disabled={busy} onCheckedChange={(v: boolean) => void toggle(v)} />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{t("overlays.web.error", { error })}</p>}

      {running && status && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="font-mono">{status.url}</span>
            <span className="text-xs text-muted-foreground">
              {t("overlays.web.clients", { count: status.clients })}
            </span>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={opaque} onCheckedChange={(v: boolean) => setOpaque(v)} />
              <span title={t("overlays.web.opaqueHint")}>{t("overlays.web.opaque")}</span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              {t("overlays.web.scale")}
              <Select
                value={String(scale)}
                onValueChange={(v) => setScale(Number(v))}
                ariaLabel={t("overlays.web.scale")}
                className="h-8 w-24 px-2.5 text-xs"
                options={SCALES.map((s) => ({ value: String(s), label: `${s}×` }))}
              />
            </label>
          </div>
          <ul className="grid grid-cols-1 gap-1.5 lg:grid-cols-2">
            {OVERLAY_DEFS.map((def) => {
              const url = widgetUrl(status.url, def.id, { opaque, scale });
              return (
                <li key={def.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: def.accent }} />
                  <span className="w-32 shrink-0 truncate text-sm">{t(`overlays.items.${def.id}.title`)}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground" title={url}>
                    {url}
                  </span>
                  <button
                    type="button"
                    className="grid h-7 w-7 place-items-center rounded hover:bg-accent"
                    onClick={() => copy(url)}
                    aria-label={t("overlays.web.copy")}
                    title={t("overlays.web.copy")}
                  >
                    {copied === url ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    className="grid h-7 w-7 place-items-center rounded hover:bg-accent"
                    onClick={() => open(url)}
                    aria-label={t("overlays.web.open")}
                    title={t("overlays.web.open")}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="grid gap-4 text-xs text-muted-foreground md:grid-cols-2">
        <div className="space-y-1">
          <p className="font-semibold text-foreground">{t("overlays.web.vrTitle")}</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              {t("overlays.web.vr1")}{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => openExternal(OPENKNEEBOARD_URL)}>
                {t("overlays.web.okbDownload")}
              </button>
            </li>
            <li>{t("overlays.web.vr2")}</li>
            <li>{t("overlays.web.vr3")}</li>
            <li>{t("overlays.web.vr4")}</li>
          </ol>
          <p>{t("overlays.web.vrUac")}</p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-foreground">{t("overlays.web.obsTitle")}</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>{t("overlays.web.obs1")}</li>
            <li>{t("overlays.web.obs2")}</li>
            <li>{t("overlays.web.obs3")}</li>
          </ol>
        </div>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>{t("overlays.web.noteSettings")}</li>
        <li>{t("overlays.web.noteLocal")}</li>
      </ul>
    </Card>
  );
}
