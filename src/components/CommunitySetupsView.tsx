/**
 * Page Setups, vue « Communauté » (Config › Atelier › Partage de setups) : les setups
 * publiés par les pilotes, toutes voitures, avec filtres classe / voiture / circuit et
 * téléchargement direct dans le jeu (NOUVEAU fichier, jamais d'écrasement). Lecture
 * publique : pas besoin de partager soi-même pour consulter et télécharger.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FolderOpen, Loader2, Search, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableTitle } from "@/components/TableTitle";
import { ClassBadge } from "@/components/ClassBadge";
import { CarLogo } from "@/components/CarLogo";
import { community, isTauri, setups as setupsApi, type CommunitySharedSetup, type SetupEntry } from "@/lib/api";
import { APP_VERSION } from "@/lib/changelog";
import { importShared, isTestBuild, sharedKey } from "@/lib/setupSharing";
import { usePageState } from "@/lib/usePageState";
import { cn, formatTime } from "@/lib/utils";
import { toastError, toastSuccess } from "@/stores/dialogs";

interface Facets {
  since: string;
  cars: { car_folder: string; car_model: string; car_class: string; n: number }[];
  tracks: { track: string; n: number }[];
}

export function CommunitySetupsView({ lmuPath, onImported }: { lmuPath: string; onImported: (e: SetupEntry) => void }) {
  const { t } = useTranslation();
  const [facets, setFacets] = useState<Facets | null>(null);
  const [rows, setRows] = useState<CommunitySharedSetup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [cls, setCls] = usePageState("setups.community.class", "");
  const [car, setCar] = usePageState("setups.community.car", "");
  const [track, setTrack] = usePageState("setups.community.track", "");
  const [query, setQuery] = usePageState("setups.community.query", "");
  const [fetching, setFetching] = useState<number | null>(null);
  // Mon repère : mes propres setups s'ouvrent, ils ne se téléchargent pas.
  const [myTag, setMyTag] = useState<string | null>(null);
  // App de développement ou bêta : les publications d'essai sont listées aussi.
  const tests: Record<string, number> = isTestBuild(APP_VERSION) ? { tests: 1 } : {};

  useEffect(() => {
    if (!isTauri()) return;
    void community
      .status()
      .then((st) => setMyTag(st.registered ? st.tag : null))
      .catch(() => {});
    void community
      .get<Facets>("setups/facets", tests)
      .then((f) => setFacets(f))
      .catch(() => setFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    setRows(null);
    setFailed(false);
    void community
      .get<{ setups: CommunitySharedSetup[] }>("setups", {
        ...tests,
        ...(car ? { car } : {}),
        ...(track ? { track } : {}),
        ...(cls ? { class: cls } : {}),
      })
      .then((r) => alive && setRows(r?.setups ?? []))
      .catch(() => {
        if (!alive) return;
        setRows([]);
        setFailed(true);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [car, track, cls]);

  const classes = useMemo(() => [...new Set((facets?.cars ?? []).map((c) => c.car_class))].sort(), [facets]);
  const cars = useMemo(() => (facets?.cars ?? []).filter((c) => !cls || c.car_class === cls), [facets, cls]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter(
      (s) => !q || `${s.name} ${s.car_model} ${s.track} ${s.author.name ?? s.author.tag} ${s.notes}`.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const download = async (s: CommunitySharedSetup) => {
    if (!lmuPath) {
      toastError(t("lab.share.noLmuPath"));
      return;
    }
    setFetching(s.id);
    try {
      const copy = await importShared(lmuPath, s, (who, version) => t("lab.share.lineage", { who, version }));
      toastSuccess(t("lab.share.downloaded", { name: copy.name }));
      onImported(copy);
    } catch (e) {
      toastError(String(e));
    } finally {
      setFetching(null);
    }
  };

  /** Mon setup publié : ouvre l'original (même circuit, même nom) au lieu d'en créer une copie. */
  const openOwn = async (s: CommunitySharedSetup) => {
    const local = (await setupsApi.entries(null, s.track).catch(() => [])).find(
      (e) => sharedKey(e.circuit, e.name) === sharedKey(s.track, s.name),
    );
    if (local) onImported(local);
    else toastError(t("lab.share.ownNotFound"));
  };

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardContent className="p-2.5 flex items-center gap-2.5 flex-wrap">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("lab.share.searchPlaceholder")}
            aria-label={t("lab.share.searchPlaceholder")}
            className="h-9 min-w-[220px] flex-1 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Select
            value={cls}
            onValueChange={(v) => {
              setCls(v);
              setCar("");
            }}
            ariaLabel={t("setups.class")}
            className="w-36 px-3"
            options={[{ value: "", label: t("lab.share.allClasses") }, ...classes.map((c) => ({ value: c, label: c }))]}
          />
          <Select
            value={car}
            onValueChange={setCar}
            ariaLabel={t("setups.car")}
            className="w-56 px-3"
            options={[{ value: "", label: t("lab.share.allCars") }, ...cars.map((c) => ({ value: c.car_folder, label: c.car_model }))]}
          />
          <Select
            value={track}
            onValueChange={setTrack}
            ariaLabel={t("setups.circuit")}
            className="w-44 px-3"
            options={[{ value: "", label: t("lab.share.allTracks") }, ...(facets?.tracks ?? []).map((x) => ({ value: x.track, label: x.track }))]}
          />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <TableTitle
          title={
            <span className="inline-flex items-center gap-2">
              <Users className="h-3.5 w-3.5" /> {t("lab.share.communityTitle")}
            </span>
          }
        >
          <span className="text-xs font-semibold">
            {shown.length} {t("setups.setups")}
          </span>
        </TableTitle>
        <CardContent className="p-0">
          {rows == null ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : failed ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("lab.share.loadError")}</p>
          ) : shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{rows.length ? t("setups.noMatch") : t("lab.share.none")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3 py-1.5">{t("setups.class")}</TableHead>
                    <TableHead className="px-1 py-1.5 w-7" aria-hidden />
                    <TableHead className="px-2 py-1.5">{t("setups.car")}</TableHead>
                    <TableHead className="px-3 py-1.5">{t("setups.circuit")}</TableHead>
                    <TableHead className="px-3 py-1.5">{t("setups.setup")}</TableHead>
                    <TableHead className="px-3 py-1.5">{t("lab.share.author")}</TableHead>
                    <TableHead className="px-3 py-1.5 text-right">{t("setups.bestLap")}</TableHead>
                    <TableHead className="px-3 py-1.5 text-right">{t("lab.share.downloadsCol")}</TableHead>
                    <TableHead className="px-3 py-1.5" aria-hidden />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((s, idx) => (
                    <TableRow key={s.id} className={cn("border-b border-border/40 last:border-0", idx % 2 === 1 && "bg-muted/20")}>
                      <TableCell className="px-3 py-1.5">
                        <ClassBadge carClass={s.car_class} size="sm" />
                      </TableCell>
                      <TableCell className="px-1 py-1.5 w-7">
                        <CarLogo carName={s.car_model} className="h-3.5 w-auto object-contain opacity-80" />
                      </TableCell>
                      <TableCell className="px-2 py-1.5 font-medium whitespace-nowrap">{s.car_model}</TableCell>
                      <TableCell className="px-3 py-1.5 text-muted-foreground">{s.track}</TableCell>
                      <TableCell className="px-3 py-1.5">
                        <div className="font-mono text-xs">
                          {s.name} <span className="text-muted-foreground">v{s.version}</span>
                        </div>
                        {s.notes && <div className="max-w-[360px] truncate text-[11px] text-muted-foreground" title={s.notes}>{s.notes}</div>}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-xs whitespace-nowrap">
                        {myTag && s.author.tag === myTag ? (
                          <span className="font-semibold text-primary">{t("lab.share.you")}</span>
                        ) : (
                          (s.author.name ?? s.author.tag)
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                        {s.best_lap != null ? formatTime(s.best_lap) : <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-right text-xs tabular-nums">{s.downloads}</TableCell>
                      <TableCell className="px-3 py-1.5 text-right">
                        {myTag && s.author.tag === myTag ? (
                          <Button size="sm" variant="ghost" className="h-7 gap-1.5" onClick={() => void openOwn(s)} title={t("lab.share.ownTip")}>
                            <FolderOpen className="h-3.5 w-3.5" />
                            {t("lab.share.open")}
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7 gap-1.5" disabled={fetching != null} onClick={() => void download(s)}>
                            {fetching === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            {t("lab.share.download")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">{t("lab.share.communityHint")}</p>
    </div>
  );
}
