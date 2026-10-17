/**
 * Widgets par adresse locale (page Overlays) : chaque widget s'ouvre seul dans
 * OpenKneeboard (VR), OBS ou un navigateur du même PC.
 *
 * Présenté en trois étapes : ① activer, ② choisir où l'afficher (OBS ou 2ᵉ écran,
 * chacun avec son mode d'emploi), ③ choisir le widget et copier SON adresse. La VR a
 * son propre mode (bouton « VR » de la page Overlays) : la carte y renvoie. La liste de
 * toutes les adresses et le port restent dans « Plus d'options ».
 *
 * Désactivé par défaut. Le serveur n'écoute que sur 127.0.0.1 et en lecture
 * seule (`src-tauri/src/commands/widget_server.rs`). `useWidgetServerAutostart`
 * (`lib/widgetServer.ts`, monté dans App) le relance au démarrage s'il était
 * activé. Le contenu et la couleur de chaque widget suivent ses réglages de la
 * page Overlays.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Copy, ExternalLink, Glasses, Loader2, MonitorUp, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { config, isTauri } from "@/lib/api";
import { OVERLAY_DEFS, type OverlayId } from "@/lib/overlays";
import { cn } from "@/lib/utils";
import { useOverlaysStore } from "@/stores/overlays";
import {
  widgetServer,
  widgetServerPort,
  widgetUrl,
  WIDGET_SERVER_DEFAULT_PORT,
  WIDGET_SERVER_ENABLED_KEY,
  WIDGET_SERVER_PORT_KEY,
  type WidgetServerStatus,
} from "@/lib/widgetServer";

const SCALES = [1, 1.25, 1.5, 2];

/** Destinations proposées : chacune a son mode d'emploi. */
type Target = "obs" | "screen";
const TARGETS: { id: Target; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "obs", icon: Radio },
  { id: "screen", icon: MonitorUp },
];

/** Étape numérotée de la carte. */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-md border border-border p-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium">{title}</p>
        {children}
      </div>
    </div>
  );
}

export function WidgetServerSettings({ onVrMode }: { onVrMode?: () => void }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<WidgetServerStatus | null>(null);
  const [port, setPort] = useState(String(WIDGET_SERVER_DEFAULT_PORT));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [opaque, setOpaque] = useState(false);
  const [scale, setScale] = useState(1);
  const [copied, setCopied] = useState("");
  // Carte repliée par défaut : seuls le titre et « à quoi ça sert » sont visibles.
  const [expanded, setExpanded] = useState(false);
  const [target, setTarget] = useState<Target>("obs");
  // Widget proposé d'abord : un de ceux affichés à l'écran, sinon le classement.
  const overlays = useOverlaysStore((s) => s.cfg.overlays);
  const [widget, setWidget] = useState<OverlayId>(
    () => OVERLAY_DEFS.find((d) => overlays[d.id]?.enabled)?.id ?? "standings",
  );

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

  // Sur un 2ᵉ écran (navigateur), un fond transparent s'affiche en blanc : fond opaque proposé.
  const pickTarget = (id: Target) => {
    setTarget(id);
    setOpaque(id === "screen");
  };

  // Widgets affichés à l'écran en tête de liste.
  const widgetOptions = [...OVERLAY_DEFS]
    .sort((a, b) => Number(!!overlays[b.id]?.enabled) - Number(!!overlays[a.id]?.enabled))
    .map((d) => ({
      value: d.id,
      label: overlays[d.id]?.enabled
        ? `${t(`overlays.items.${d.id}.title`)} · ${t("overlays.web.shownNow")}`
        : t(`overlays.items.${d.id}.title`),
    }));

  const running = status?.running ?? false;
  const url = status ? widgetUrl(status.url, widget, { opaque, scale }) : "";

  return (
    <Card className="space-y-4 p-4">
      <button
        type="button"
        className="flex w-full items-start gap-3 text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <Glasses className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="flex flex-wrap items-center gap-2 font-semibold">
            {t("overlays.web.title")}
            {running && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600">
                {t("overlays.web.active")}
              </span>
            )}
          </h3>
          <p className="text-sm text-muted-foreground">{t("overlays.web.desc")}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
          {expanded ? t("overlays.web.hide") : t("overlays.web.show")}
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </span>
      </button>

      {expanded && (
        <div className="space-y-3">
          {/* La VR a son propre mode (bouton « VR » en haut de la page). */}
          {onVrMode && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
              <span className="flex items-center gap-2 text-sm">
                <Glasses className="h-4 w-4 shrink-0 text-primary" />
                {t("overlays.web.vrHint")}
              </span>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={onVrMode}>
                <Glasses className="h-4 w-4" />
                {t("overlays.web.vrGo")}
              </Button>
            </div>
          )}
          {/* ① Activer */}
          <Step n={1} title={t("overlays.web.step1")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{t("overlays.web.enableHint")}</p>
              <div className="flex items-center gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <Switch checked={running} disabled={busy} onCheckedChange={(v: boolean) => void toggle(v)} />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{t("overlays.web.error", { error })}</p>}
          </Step>

          {/* ② Où l'afficher */}
          <Step n={2} title={t("overlays.web.step2")}>
            <div className="flex flex-wrap gap-2">
              {TARGETS.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => pickTarget(id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
                    target === id
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-border hover:bg-accent",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t(`overlays.web.target_${id}`)}
                </button>
              ))}
            </div>
            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              {target === "obs" && (
                <ol className="list-decimal space-y-1 pl-5">
                  <li>{t("overlays.web.obs1")}</li>
                  <li>{t("overlays.web.obs2")}</li>
                  <li>{t("overlays.web.obs3")}</li>
                </ol>
              )}
              {target === "screen" && (
                <ol className="list-decimal space-y-1 pl-5">
                  <li>{t("overlays.web.screen1")}</li>
                  <li>{t("overlays.web.screen2")}</li>
                </ol>
              )}
            </div>
          </Step>

          {/* ③ Quel widget : une seule adresse, à copier ou à ouvrir */}
          <Step n={3} title={t("overlays.web.step3")}>
            {!running || !status ? (
              <p className="text-xs text-muted-foreground">{t("overlays.web.enableFirst")}</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={widget}
                    onValueChange={(v) => setWidget(v as OverlayId)}
                    ariaLabel={t("overlays.web.widget")}
                    className="h-9 w-60 px-2.5"
                    options={widgetOptions}
                  />
                  <span
                    className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-2.5 py-2 font-mono text-xs"
                    title={url}
                  >
                    {url}
                  </span>
                  <Button size="sm" className="gap-1.5" onClick={() => copy(url)}>
                    {copied === url ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied === url ? t("overlays.web.copied") : t("overlays.web.copyAddress")}
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => open(url)}>
                    <ExternalLink className="h-4 w-4" />
                    {t("overlays.web.open")}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                  <label className="flex items-center gap-2">
                    {t("overlays.web.scale")}
                    <Select
                      value={String(scale)}
                      onValueChange={(v) => setScale(Number(v))}
                      ariaLabel={t("overlays.web.scale")}
                      className="h-8 w-24 px-2.5 text-xs"
                      options={SCALES.map((s) => ({ value: String(s), label: `${s}×` }))}
                    />
                  </label>
                  <label className="flex items-center gap-2" title={t("overlays.web.opaqueHint")}>
                    <Switch checked={opaque} onCheckedChange={(v: boolean) => setOpaque(v)} />
                    {t("overlays.web.opaque")}
                  </label>
                  <span className="text-muted-foreground">{t("overlays.web.clients", { count: status.clients })}</span>
                </div>
              </>
            )}
          </Step>

          {/* Pour aller plus loin : toutes les adresses d'un coup, port, notes. */}
          <details className="rounded-md border border-border px-3 py-2">
            <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground">
              {t("overlays.web.more")}
            </summary>
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="text-muted-foreground" htmlFor="widget-port">
                  {t("overlays.web.port")}
                </label>
                <Input
                  id="widget-port"
                  className="h-8 w-24 font-mono"
                  inputMode="numeric"
                  value={port}
                  disabled={running || busy}
                  onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))}
                />
                <span className="text-muted-foreground">{t("overlays.web.portHint")}</span>
              </div>
              {running && status && (
                <ul className="grid grid-cols-1 gap-1.5 lg:grid-cols-2">
                  {OVERLAY_DEFS.map((def) => {
                    const u = widgetUrl(status.url, def.id, { opaque, scale });
                    return (
                      <li key={def.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: def.accent }} />
                        <span className="w-32 shrink-0 truncate text-xs">{t(`overlays.items.${def.id}.title`)}</span>
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" title={u}>
                          {u}
                        </span>
                        <button
                          type="button"
                          className="grid h-7 w-7 place-items-center rounded hover:bg-accent"
                          onClick={() => copy(u)}
                          aria-label={t("overlays.web.copy")}
                          title={t("overlays.web.copy")}
                        >
                          {copied === u ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          className="grid h-7 w-7 place-items-center rounded hover:bg-accent"
                          onClick={() => open(u)}
                          aria-label={t("overlays.web.open")}
                          title={t("overlays.web.open")}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                <li>{t("overlays.web.noteSettings")}</li>
                <li>{t("overlays.web.noteLocal")}</li>
              </ul>
            </div>
          </details>
        </div>
      )}
    </Card>
  );
}
