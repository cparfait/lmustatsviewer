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

/** `/` : liste des widgets, pour copier une adresse depuis un navigateur. */
export function WidgetIndex() {
  const { t } = useTranslation();
  useServedConfig();
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-xl font-bold">{t("overlays.web.indexTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("overlays.web.indexDesc")}</p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {OVERLAY_DEFS.map((d) => {
          const href = `/?w=${d.id}`;
          return (
            <li key={d.id} className="rounded-md border border-border p-3">
              <a className="font-semibold hover:underline" href={href} style={{ color: d.accent }}>
                {t(`overlays.items.${d.id}.title`)}
              </a>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {location.origin}
                {href}
              </p>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
