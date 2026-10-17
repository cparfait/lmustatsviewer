/**
 * Page de widget servie par le serveur local (`widget_server.rs`), ouverte hors
 * de l'app : OpenKneeboard (onglet « Web Dashboard », VR), OBS (source
 * navigateur) ou un navigateur sur un 2ᵉ écran.
 *
 * - `/?w=<id>` : un widget seul, sur fond transparent, avec le contenu et la
 *   couleur réglés dans la page Overlays (même s'il est éteint à l'écran) ;
 *   `&bg=opaque` : fond sombre (captures de fenêtre qui gèrent mal la
 *   transparence) ; `&scale=1.5` : échelle d'affichage.
 * - `/` : liste des widgets disponibles, avec leur adresse.
 *
 * Données : `lib/widgetLink.ts` (WebSocket en lecture seule). Dans OpenKneeboard,
 * la page lui donne sa taille réelle (`SetPreferredPixelSize`) pour que le
 * panneau épouse le widget.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, ExternalLink, Flag, Glasses, MonitorPlay } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useOverlaysStore, type OverlaysConfig } from "@/stores/overlays";
import { OVERLAY_BY_ID, OVERLAY_DEFS, type OverlayId } from "@/lib/overlays";
import { widgetLink } from "@/lib/widgetLink";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EMPTY_LIVE_DATA, useOverlayData } from "./useOverlayData";
import { WIDGETS } from "./widgets";

interface KneeboardApi {
  SetPreferredPixelSize?: (width: number, height: number) => unknown;
}

/** Config des overlays + langue de l'app, reçues du serveur. */
function useServedConfig(): boolean {
  const { i18n } = useTranslation();
  const applyRemote = useOverlaysStore((s) => s.applyRemote);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const offs = [
      widgetLink.onConfig((c) => applyRemote((c ?? {}) as OverlaysConfig)),
      widgetLink.onLanguage((l) => {
        if (l && l !== i18n.language) void i18n.changeLanguage(l);
      }),
      widgetLink.onStatus(setOnline),
    ];
    return () => offs.forEach((off) => off());
  }, [applyRemote, i18n]);
  return online;
}

/** Message discret quand l'app est fermée ou le serveur arrêté (après 3 s). */
function OfflineNotice({ online }: { online: boolean }) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (online) {
      setShow(false);
      return;
    }
    const id = setTimeout(() => setShow(true), 3000);
    return () => clearTimeout(id);
  }, [online]);
  if (!show) return null;
  return (
    <div className="fixed bottom-1 left-1 rounded bg-black/70 px-2 py-1 text-[11px] text-amber-300">
      {t("overlays.web.offline")}
    </div>
  );
}

function clampScale(v: string | null): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(4, Math.max(0.25, n)) : 1;
}

export function WidgetPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const params = new URLSearchParams(location.search);
  const opaque = params.get("bg") === "opaque";
  const scale = clampScale(params.get("scale"));
  const online = useServedConfig();
  const cfg = useOverlaysStore((s) => s.cfg);
  const data = useOverlayData(cfg.highFps);
  const boxRef = useRef<HTMLDivElement>(null);

  // Fond transparent (comme la fenêtre overlay), ou sombre si demandé.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const bg = opaque ? "#0b0d12" : "transparent";
    html.style.background = bg;
    body.style.background = bg;
    // `color-scheme: dark` (thème de l'app) peut faire peindre un fond sombre
    // derrière une page transparente dans les navigateurs embarqués.
    html.style.colorScheme = opaque ? "dark" : "normal";
    html.style.overflow = "hidden";
    body.classList.add("overlay-window");
  }, [opaque]);

  // Taille réelle → OpenKneeboard (le panneau VR prend la taille du widget).
  useLayoutEffect(() => {
    const el = boxRef.current;
    const kb = (window as unknown as { OpenKneeboard?: KneeboardApi }).OpenKneeboard;
    if (!el || !kb?.SetPreferredPixelSize) return;
    let last = "";
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const w = Math.ceil(r.width);
      const h = Math.ceil(r.height);
      const sig = `${w}x${h}`;
      if (w < 8 || h < 8 || sig === last) return;
      last = sig;
      try {
        void kb.SetPreferredPixelSize?.(w, h);
      } catch {
        /* ancienne version d'OpenKneeboard : taille réglée à la main */
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const def = OVERLAY_BY_ID[id as OverlayId];
  if (!def) {
    return <p className="p-4 text-sm text-white/80">{t("overlays.web.unknown", { id })}</p>;
  }
  const settings = cfg.overlays[def.id];
  const Widget = WIDGETS[def.id];

  return (
    <>
      <div
        ref={boxRef}
        className="inline-block"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          opacity: (settings?.opacity ?? 1) * cfg.globalOpacity,
          padding: opaque ? 8 : 0,
        }}
      >
        <ErrorBoundary fallback={null}>
          <Widget
            data={data ?? EMPTY_LIVE_DATA}
            content={settings?.content ?? {}}
            accent={settings?.accent ?? def.accent}
            t={t}
          />
        </ErrorBoundary>
      </div>
      <OfflineNotice online={online} />
    </>
  );
}

/**
 * `/` : liste des widgets, aux couleurs de l'app (même en-tête que la fenêtre
 * principale, mêmes cartes que la page Overlays), pour ouvrir un widget ou copier
 * son adresse.
 */
export function WidgetIndex() {
  const { t } = useTranslation();
  const online = useServedConfig();
  const [copied, setCopied] = useState("");

  const copy = (url: string) => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(url);
      setTimeout(() => setCopied((c) => (c === url ? "" : c)), 1500);
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md">
            <Flag className="h-4.5 w-4.5" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[15px] font-bold tracking-tight">LMU Stats Viewer</span>
            <span className="text-[11px] text-muted-foreground">{t("overlays.web.title")}</span>
          </div>
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              online ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-amber-500/40 bg-amber-500/10 text-amber-300",
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", online ? "bg-emerald-400" : "bg-amber-300")} />
            {online ? t("overlays.web.connected") : t("overlays.web.offline")}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-5 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("overlays.web.indexTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("overlays.web.indexDesc")}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {OVERLAY_DEFS.map((d) => {
            const Icon = d.icon;
            const url = `${location.origin}/?w=${d.id}`;
            return (
              <Card key={d.id} className="flex flex-col p-4 transition-all hover:border-foreground/20 hover:shadow-md">
                <div className="mb-3 flex items-start justify-between">
                  <div className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: `${d.accent}22`, color: d.accent }}>
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                </div>
                <div className="mb-0.5 font-semibold">{t(`overlays.items.${d.id}.title`)}</div>
                <div className="mb-3 text-xs font-medium text-muted-foreground">{t(`overlays.items.${d.id}.desc`)}</div>
                <div className="mt-auto flex items-center gap-1 border-t border-border pt-2.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" title={url}>
                    {url}
                  </span>
                  <button
                    type="button"
                    className="grid h-7 w-7 place-items-center rounded hover:bg-accent"
                    onClick={() => copy(url)}
                    title={t("overlays.web.copy")}
                    aria-label={t("overlays.web.copy")}
                  >
                    {copied === url ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  <a
                    href={url}
                    className="grid h-7 w-7 place-items-center rounded hover:bg-accent"
                    title={t("overlays.web.openHere")}
                    aria-label={t("overlays.web.openHere")}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="grid gap-4 p-4 text-xs text-muted-foreground md:grid-cols-2">
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Glasses className="h-4 w-4 text-primary" />
              {t("overlays.web.vrTitle")}
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>{t("overlays.web.vr1")}</li>
              <li>{t("overlays.web.vr2")}</li>
              <li>{t("overlays.web.vr3")}</li>
              <li>{t("overlays.web.vr4")}</li>
            </ol>
          </div>
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <MonitorPlay className="h-4 w-4 text-primary" />
              {t("overlays.web.obsTitle")}
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>{t("overlays.web.obs1")}</li>
              <li>{t("overlays.web.obs2")}</li>
              <li>{t("overlays.web.obs3")}</li>
            </ol>
          </div>
        </Card>
      </main>
    </div>
  );
}
