/**
 * Onglet « Partager » de la fiche setup (Config › Atelier › Partage de setups) :
 * publier ce setup (sur clic seulement : notes choisies ici, chemin local retiré),
 * retirer ses publications, et récupérer les setups publiés pour la même voiture
 * (enregistrés comme NOUVEAU fichier du jeu, jamais d'écrasement).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Download, Loader2, Share2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  community,
  isTauri,
  setups as setupsApi,
  type CommunitySharedSetup,
  type CommunityStatus,
  type MySharedSetup,
  type SetupEntry,
  type SetupSessionMatch,
  type SvmFile,
} from "@/lib/api";
import { carKeyOf } from "@/lib/setupNotches";
import { APP_VERSION } from "@/lib/changelog";
import { carFolderOf, importShared, isShareableCarKey, isTestBuild } from "@/lib/setupSharing";
import { baseName, safeSetupName } from "@/lib/setupVersion";
import { liveClassKey } from "@/lib/staticData";
import { cn, formatTime } from "@/lib/utils";
import { useAppStore } from "@/stores/app";
import { toastError, toastSuccess } from "@/stores/dialogs";

export function SetupSharePanel({ entry, svm }: { entry: SetupEntry; svm: SvmFile }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const lmuPath = useAppStore((s) => s.lmuPath);
  const carKey = carKeyOf(svm);
  const shareable = isShareableCarKey(carKey);
  const folder = carFolderOf(carKey);

  const [status, setStatus] = useState<CommunityStatus | null>(null);
  const [linked, setLinked] = useState<SetupSessionMatch | null>(null);
  const [name, setName] = useState(baseName(entry));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<MySharedSetup[]>([]);
  const [allTracks, setAllTracks] = useState(false);
  const [list, setList] = useState<CommunitySharedSetup[] | null>(null);
  const [listError, setListError] = useState(false);
  const [fetching, setFetching] = useState<number | null>(null);

  const canPublish = !!status?.enabled && !!status?.registered && shareable;

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    void community.status().then((s) => alive && setStatus(s)).catch(() => {});
    if (entry.linked_session_id != null)
      void setupsApi.getSessionSummary(entry.linked_session_id).then((m) => alive && setLinked(m)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [entry.linked_session_id]);

  const loadMine = useCallback(() => {
    if (!canPublish) return;
    void community
      .setupsMine()
      .then((r) => setMine(r.setups.filter((s) => carFolderOf(s.car_key) === folder)))
      .catch(() => {});
  }, [canPublish, folder]);
  useEffect(loadMine, [loadMine]);

  const loadList = useCallback(() => {
    if (!isTauri() || !shareable) return;
    setListError(false);
    void community
      .get<{ setups: CommunitySharedSetup[] }>("setups", {
        car: folder,
        ...(allTracks ? {} : { track: entry.circuit }),
        // App de développement ou bêta : les publications d'essai sont listées aussi.
        ...(isTestBuild(APP_VERSION) ? { tests: 1 } : {}),
      })
      .then((r) => setList(r?.setups ?? []))
      .catch(() => {
        setList([]);
        setListError(true);
      });
  }, [allTracks, folder, entry.circuit, shareable]);
  useEffect(loadList, [loadList]);

  const publish = async () => {
    setBusy(true);
    try {
      const r = await community.setupPublish(entry.id, {
        car_key: carKey,
        car_class: liveClassKey(svm.header.vehicle_class).slice(0, 32),
        car_model: entry.car.slice(0, 120),
        track: entry.circuit,
        name: safeSetupName(name).slice(0, 60),
        setup_type: entry.setup_type.slice(0, 20),
        notes: notes.trim().slice(0, 1000),
        best_lap: linked?.best_lap ?? null,
        game_version: linked?.game_version?.slice(0, 20) || null,
      });
      toastSuccess(t("lab.share.published", { version: r.version }));
      loadMine();
      loadList();
    } catch (e) {
      toastError(/quota/.test(String(e)) ? t("lab.share.quota") : String(e));
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async (id: number, all: boolean) => {
    try {
      await community.setupDelete(id, all);
      toastSuccess(t("lab.share.removed"));
      loadMine();
      loadList();
    } catch (e) {
      toastError(String(e));
    }
  };

  const download = async (s: CommunitySharedSetup) => {
    if (!lmuPath) {
      toastError(t("lab.share.noLmuPath"));
      return;
    }
    setFetching(s.id);
    try {
      const copy = await importShared(lmuPath, s, (who, version) => t("lab.share.lineage", { who, version }));
      toastSuccess(t("lab.share.downloaded", { name: copy.name }));
      navigate(`/setups/${copy.id}`);
    } catch (e) {
      toastError(String(e));
    } finally {
      setFetching(null);
    }
  };

  const myTag = status?.tag ?? null;
  const rows = useMemo(() => list ?? [], [list]);

  return (
    <div className="space-y-6 text-sm">
      <p className="text-xs text-muted-foreground">{t("lab.share.intro")}</p>

      {!shareable && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">{t("lab.share.noKey")}</p>}

      {/* Publier */}
      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="flex items-center gap-2 font-semibold">
          <Upload className="h-4 w-4" />
          {t("lab.share.publishTitle")}
        </h3>
        {!canPublish && shareable ? (
          <p className="text-xs text-muted-foreground">{t("lab.share.needCommunity")}</p>
        ) : (
          <>
            <label className="block space-y-1">
              <span className="text-xs font-medium">{t("lab.share.name")}</span>
              <input
                className="h-8 w-full rounded-md border bg-background px-2"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">{t("lab.share.notes")}</span>
              <textarea
                className="min-h-[64px] w-full rounded-md border bg-background p-2"
                value={notes}
                maxLength={1000}
                onChange={(e) => setNotes(e.target.value)}
              />
              <span className="text-[11px] text-muted-foreground">{t("lab.share.notesHint")}</span>
            </label>
            <p className="text-xs">
              {linked?.best_lap ? t("lab.share.bestLap", { time: formatTime(linked.best_lap) }) : t("lab.share.noBestLap")}
            </p>
            <p className="text-[11px] text-muted-foreground">{t("lab.share.sent")}</p>
            <Button size="sm" onClick={publish} disabled={busy || !safeSetupName(name).trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
              {t("lab.share.publish")}
            </Button>
          </>
        )}
        {mine.length > 0 && (
          <div className="space-y-1 border-t pt-3">
            <h4 className="text-xs font-semibold">{t("lab.share.mineTitle")}</h4>
            {mine.map((m) => (
              <div key={m.id} className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate">
                  {m.name} · v{m.version} · {m.track}
                  {m.best_lap ? ` · ${formatTime(m.best_lap)}` : ""} · {t("lab.share.downloads", { count: m.downloads })}
                  {m.test && <span className="ml-1 text-amber-600 dark:text-amber-400">· {t("lab.share.testTag")}</span>}
                </span>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void unpublish(m.id, false)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("lab.share.unpublish")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Setups de la communauté */}
      {shareable && (
        <section className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <h3 className="flex flex-1 items-center gap-2 font-semibold">
              <Download className="h-4 w-4" />
              {t("lab.share.communityTitle")}
            </h3>
            <div className="flex rounded-md border text-xs">
              {[false, true].map((all) => (
                <button
                  key={String(all)}
                  type="button"
                  onClick={() => setAllTracks(all)}
                  className={cn("px-2 py-1", allTracks === all && "bg-primary text-primary-foreground")}
                >
                  {all ? t("lab.share.allTracks") : t("lab.share.thisTrack")}
                </button>
              ))}
            </div>
          </div>
          {list == null ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : listError ? (
            <p className="text-xs text-muted-foreground">{t("lab.share.loadError")}</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("lab.share.none")}</p>
          ) : (
            <div className="divide-y">
              {rows.map((s) => {
                const own = myTag != null && s.author.tag === myTag;
                return (
                  <div key={s.id} className="flex items-start gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {s.name} <span className="text-xs text-muted-foreground">v{s.version}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t("lab.share.by", { who: own ? t("lab.share.you") : (s.author.name ?? s.author.tag) })}
                        {allTracks ? ` · ${s.track}` : ""} · {s.setup_type}
                        {s.best_lap ? ` · ${formatTime(s.best_lap)}` : ""}
                        {s.game_version ? ` · ${s.game_version}` : ""} · {t("lab.share.downloads", { count: s.downloads })}
                      </div>
                      {s.notes && <div className="mt-1 line-clamp-2 text-xs">{s.notes}</div>}
                    </div>
                    {/* Mon propre setup : déjà dans mon dossier, rien à télécharger. */}
                    {!own && (
                      <Button size="sm" variant="outline" disabled={fetching != null} onClick={() => void download(s)}>
                        {fetching === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        {t("lab.share.download")}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
