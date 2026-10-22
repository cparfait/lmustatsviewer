/**
 * Carte « Guide vidéo » de l'onglet Coach du détail de session (à côté du
 * Coach IA) : le tour commenté du circuit pour la catégorie du pilote, avec une
 * vignette compacte au lieu d'un petit lien en pied du Coach IA. Sans guide
 * référencé pour le combo, la carte le dit et propose une recherche YouTube.
 *
 * Le lecteur YouTube n'est pas intégré : la CSP de l'app n'autorise aucun
 * `frame-src` externe. On affiche la vignette (img-src https autorisé) et on
 * ouvre la vidéo dans le navigateur.
 */

import { useTranslation } from "react-i18next";
import { ExternalLink, Play, Search, VideoOff, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TableTitle } from "@/components/TableTitle";

/** Identifiant YouTube d'une URL (`watch?v=`, `youtu.be/`, `embed/`). */
export function youtubeId(url: string): string | null {
  const m = /(?:[?&]v=|youtu\.be\/|\/embed\/|\/shorts\/)([\w-]{11})/.exec(url);
  return m ? m[1] : null;
}

function openExternal(url: string) {
  void import("@tauri-apps/plugin-opener")
    .then(({ openUrl }) => openUrl(url))
    .catch(() => window.open(url, "_blank"));
}

export function VideoGuideCard({
  guide,
  track,
  carClass,
}: {
  guide: { title: string; url: string; channel: string } | null;
  track: string;
  carClass: string;
}) {
  const { t } = useTranslation();

  const header = (
    <TableTitle
      title={
        <span className="inline-flex items-center gap-2">
          <Youtube className="h-3.5 w-3.5" />
          {t("coach.videoGuide")}
        </span>
      }
    />
  );

  if (!guide) {
    const search = () =>
      openExternal(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(
          `Le Mans Ultimate ${track} ${carClass} lap guide`,
        )}`,
      );
    return (
      <Card className="flex h-full flex-col overflow-hidden">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <VideoOff className="h-6 w-6" />
          </span>
          <p className="max-w-sm text-sm text-muted-foreground">
            {t("sessionDetail.videoNone", { track, cls: carClass || "—" })}
          </p>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={search}>
            <Search className="h-3.5 w-3.5" />
            {t("sessionDetail.videoSearch")}
            <ExternalLink className="h-3 w-3 opacity-60" />
          </Button>
        </div>
      </Card>
    );
  }

  const id = youtubeId(guide.url);
  const watch = () => openExternal(guide.url);

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      {header}
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
        <button
          type="button"
          onClick={watch}
          className="group relative aspect-video w-full shrink-0 overflow-hidden rounded-lg border border-border bg-muted sm:w-[300px]"
          aria-label={t("sessionDetail.videoWatch")}
        >
          {id ? (
            <img
              src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <Youtube className="absolute inset-0 m-auto h-10 w-10 text-red-500/60" />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/25">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-transform group-hover:scale-110">
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            </span>
          </span>
        </button>

        <div className="min-w-0 space-y-2.5">
          <div>
            <div className="font-semibold leading-tight">{guide.title}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{guide.channel}</div>
          </div>
          <p className="text-sm text-muted-foreground">{t("sessionDetail.videoIntro", { track })}</p>
          <Button onClick={watch} size="sm" className="gap-1.5">
            <Youtube className="h-4 w-4" />
            {t("sessionDetail.videoWatch")}
            <ExternalLink className="h-3.5 w-3.5 opacity-70" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
