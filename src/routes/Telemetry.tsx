import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Gauge, FileWarning, Flag, Tag, Car, Timer, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FilterField } from "@/components/FilterField";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  SortHeader,
} from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { TrackFlag } from "@/components/TrackFlag";
import { CarLogo } from "@/components/CarLogo";
import { ClassBadge } from "@/components/ClassBadge";
import { SessionBadge } from "@/components/SessionBadge";
import { sessionTypeLabel } from "@/lib/sessionLabels";
import { isTauri, telemetry } from "@/lib/api";
import type { TelemetryFileInfo, TelemetryFolderStatus } from "@/lib/api";
import { FLAG_OFFICIAL_LAPS, FLAG_TELEM_DIAG, useConfigFlag } from "@/lib/configFlag";
import { sessionTypeFromFile } from "@/lib/ai/context/session-telemetry";
import { usePageState, useChangeEffect } from "@/lib/usePageState";
import { formatDateTime, formatTime } from "@/lib/utils";
import { TelemetryLoading } from "@/components/telemetry/TelemetryLoading";

const PAGE_SIZE_KEY = "telemetry-page-size";

/**
 * Navigateur des enregistrements de télémétrie (`.duckdb`). Filtrage côté client
 * (façon Dashboard) ; un clic ouvre la page lecteur `/telemetry/view`.
 */
/** En dessous, un enregistrement sans tour complet est un fragment (s). */
const FRAGMENT_MAX_S = 120;

/** Aucun tour complet et court (durée inconnue = fragment seulement si aucun tour). */
function isFragment(f: TelemetryFileInfo): boolean {
  return f.best_lap == null && (f.duration_s == null || f.duration_s < FRAGMENT_MAX_S);
}

export function Telemetry() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [rawFiles, setFiles] = useState<TelemetryFileInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Options (désactivées par défaut) : type de session lu dans le nom du fichier quand
  // les métadonnées sont muettes, meilleur tour au chrono officiel du jeu.
  const diagOn = useConfigFlag(FLAG_TELEM_DIAG);
  const officialOn = useConfigFlag(FLAG_OFFICIAL_LAPS);
  const files = useMemo(
    () =>
      rawFiles?.map((f) => ({
        ...f,
        session_type: diagOn ? sessionTypeFromFile(f) : f.session_type,
        // Chronos officiels présents : seul un tour complet (3 secteurs) compte ; un
        // tour de sortie des stands chronométré n'en fait pas un enregistrement utile.
        best_lap: officialOn && f.lap_times.length > 0 ? f.best_game_lap : f.best_lap,
      })) ?? null,
    [rawFiles, diagOn, officialOn],
  );
  // Diagnostic du dossier quand la liste est vide (option).
  const [folder, setFolder] = useState<TelemetryFolderStatus | null>(null);
  useEffect(() => {
    if (!diagOn || !isTauri() || (rawFiles && rawFiles.length > 0)) return;
    telemetry
      .folderStatus()
      .then(setFolder)
      .catch(() => setFolder(null));
  }, [diagOn, rawFiles]);

  const [fTrack, setFTrack] = usePageState("telemetry.track", "");
  const [fClass, setFClass] = usePageState("telemetry.class", "");
  const [fCar, setFCar] = usePageState("telemetry.car", "");
  const [fSession, setFSession] = usePageState("telemetry.session", "");
  // Fragments (aucun tour complet ET moins de 2 min : sortie du garage, retour au
  // stand…) : masqués par défaut, une case les réaffiche. Un long enregistrement
  // sans passage sur la ligne reste visible (il contient de vraies données).
  const [hideNoLap, setHideNoLap] = usePageState("telemetry.hideNoLap", true);

  type SortKey =
    | "track"
    | "layout"
    | "car"
    | "class"
    | "session"
    | "driver"
    | "bestlap"
    | "date";
  const [sortBy, setSortBy] = usePageState<SortKey>("telemetry.sortBy", "date");
  const [sortDir, setSortDir] = usePageState<"asc" | "desc">("telemetry.sortDir", "desc");
  const onSort = (k: SortKey) => {
    if (k === sortBy) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(k);
      setSortDir("asc");
    }
    setPage(1);
  };

  // Pagination (côté client, façon Sessions)
  const [page, setPage] = usePageState("telemetry.page", 1);
  const [perPage, setPerPage] = useState(() => {
    const s = localStorage.getItem(PAGE_SIZE_KEY);
    return s ? Number(s) : 25;
  });
  const handlePerPage = (s: number) => {
    localStorage.setItem(PAGE_SIZE_KEY, String(s));
    setPerPage(s);
    setPage(1);
  };

  /** Nom de voiture affiché/filtré : vrai modèle si connu, sinon équipe/livrée. */
  const carLabel = (f: TelemetryFileInfo) => f.car_model || f.car_name;

  useEffect(() => {
    telemetry
      .listFiles()
      .then(setFiles)
      .catch((e) => setError(String(e)));
  }, []);

  const options = useMemo(() => {
    const tracks = new Set<string>();
    const classes = new Set<string>();
    const cars = new Set<string>();
    const sessionsT = new Set<string>();
    (files ?? []).forEach((f) => {
      if (f.track) tracks.add(f.track);
      if (f.car_class) classes.add(f.car_class);
      if (f.session_type) sessionsT.add(f.session_type);
      if (!fClass || f.car_class === fClass) {
        const c = carLabel(f);
        if (c) cars.add(c);
      }
    });
    return {
      tracks: [...tracks].sort(),
      classes: [...classes].sort(),
      cars: [...cars].sort(),
      sessions: [...sessionsT].sort(),
    };
  }, [files, fClass]);

  const filteredFiles = useMemo(() => {
    return (files ?? []).filter((f) => {
      if (hideNoLap && isFragment(f)) return false;
      if (fTrack && f.track !== fTrack) return false;
      if (fClass && f.car_class !== fClass) return false;
      if (fCar && carLabel(f) !== fCar) return false;
      if (fSession && f.session_type !== fSession) return false;
      return true;
    });
  }, [files, fTrack, fClass, fCar, fSession, hideNoLap]);
  const noLapCount = useMemo(() => (files ?? []).filter(isFragment).length, [files]);

  useChangeEffect(() => {
    setPage(1);
  }, [fTrack, fClass, fCar, fSession, hideNoLap]);

  const sortedFiles = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (f: TelemetryFileInfo): string | number => {
      switch (sortBy) {
        case "track": return f.track;
        case "layout": return f.track_layout;
        case "car": return carLabel(f);
        case "class": return f.car_class;
        case "session": return f.session_type;
        case "driver": return f.driver;
        // Sans temps → rejeté en fin de tri (valeur sentinelle).
        case "bestlap": return f.best_lap ?? Number.POSITIVE_INFINITY;
        case "date": return f.mtime;
      }
    };
    return [...filteredFiles].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [filteredFiles, sortBy, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sortedFiles.length / perPage));
  const safePage = Math.min(page, pageCount);
  const pagedFiles = useMemo(
    () => sortedFiles.slice((safePage - 1) * perPage, safePage * perPage),
    [sortedFiles, safePage, perPage]
  );

  const hasFilters = !!(fTrack || fClass || fCar || fSession);
  const clearFilters = () => {
    setFTrack("");
    setFClass("");
    setFCar("");
    setFSession("");
  };

  const open = (f: TelemetryFileInfo) =>
    navigate(`/telemetry/view?path=${encodeURIComponent(f.path)}`);

  // ── Rendu ────────────────────────────────────────────────────────────────────
  if (files === null) {
    return (
      <TelemetryLoading what="list" />
    );
  }

  if (files.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <FileWarning className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <h1 className="mb-2 text-xl font-bold">{t("telemetry.title")}</h1>
        <p className="mb-4 text-sm text-muted-foreground">{t("telemetry.emptyHelp")}</p>
        {diagOn && folder && (
          <div className="mx-auto mb-4 max-w-xl space-y-1 rounded-md border border-border bg-muted/30 p-3 text-left text-xs">
            <p className="font-semibold">{t("news.diagTitleShort")}</p>
            {!folder.lmu_path_set && !folder.overridden ? (
              <p className="text-amber-700 dark:text-amber-300">{t("news.diagNoPath")}</p>
            ) : (
              <>
                <p className="break-all font-mono text-muted-foreground">
                  {folder.dir}
                  {folder.overridden && <span className="ml-1 font-sans">({t("news.diagOverride")})</span>}
                </p>
                {!folder.exists ? (
                  <p className="text-amber-700 dark:text-amber-300">{t("news.diagMissing")}</p>
                ) : folder.duckdb_count === 0 ? (
                  <p className="text-amber-700 dark:text-amber-300">{t("news.diagEmpty")}</p>
                ) : (
                  <p className="text-amber-700 dark:text-amber-300">{t("news.diagUnreadable", { n: folder.duckdb_count })}</p>
                )}
                {folder.wal_count > 0 && <p className="text-muted-foreground">{t("news.diagWal", { n: folder.wal_count })}</p>}
              </>
            )}
          </div>
        )}
        <a
          href="https://guide.lemansultimate.com/hc/en-gb/articles/14524956311695-Telemetry-Recording"
          target="_blank"
          rel="noreferrer"
          className="text-sm text-primary underline"
        >
          {t("telemetry.emptyLink")}
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Gauge className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold">{t("telemetry.title")}</h1>
        <span className="text-sm text-muted-foreground">
          {t("telemetry.fileCount", { count: filteredFiles.length })}
        </span>
      </div>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="p-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* Barre de filtres */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <FilterField
              icon={Flag}
              label={t("sessions.fCircuit")}
              value={fTrack}
              onChange={setFTrack}
              options={[
                { value: "", label: t("sessions.allTracks") },
                ...options.tracks.map((tr) => ({ value: tr, label: tr })),
              ]}
            />
            <FilterField
              icon={Tag}
              label={t("sessions.fClass")}
              value={fClass}
              onChange={(v) => {
                setFClass(v);
                setFCar("");
              }}
              options={[
                { value: "", label: t("sessions.allClasses") },
                ...options.classes.map((c) => ({ value: c, label: c })),
              ]}
            />
            <FilterField
              icon={Car}
              label={t("sessions.fCar")}
              value={fCar}
              onChange={setFCar}
              className="max-w-[260px]"
              options={[
                { value: "", label: t("sessions.allCars") },
                ...options.cars.map((c) => ({ value: c, label: c })),
              ]}
            />
            <FilterField
              icon={Timer}
              label={t("sessions.fSession")}
              value={fSession}
              onChange={setFSession}
              options={[
                { value: "", label: t("sessions.allTypes") },
                ...options.sessions.map((st) => ({
                  value: st,
                  label: sessionTypeLabel(st, t),
                })),
              ]}
            />
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" />
                {t("sessions.clearFilters")}
              </Button>
            )}
            {noLapCount > 0 && (
              <label
                className="ml-auto flex cursor-pointer select-none items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground"
                title={t("telemetry.hideNoLapTip")}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={hideNoLap}
                  onChange={(e) => setHideNoLap(e.target.checked)}
                />
                {t("telemetry.hideNoLap", { count: noLapCount })}
              </label>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tableau des enregistrements (style tableau Sessions) */}
      {sortedFiles.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-muted-foreground">{t("sessions.noResults")}</p>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <Table className="[&_th]:px-2 [&_td]:px-2">
              <TableHeader>
                <TableRow>
                  <SortHeader col="track" label={t("sessions.fCircuit")} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHeader col="layout" label={t("sessions.fLayout")} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHeader col="car" label={t("sessions.fCar")} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHeader col="class" label={t("sessions.fClass")} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHeader col="session" label={t("sessions.fSession")} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHeader col="driver" label={t("telemetry.driver")} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <TableHead className="h-auto py-1 text-micro whitespace-nowrap">{t("telemetry.weather")}</TableHead>
                  <SortHeader col="bestlap" label={t("telemetry.bestLap")} sortBy={sortBy} sortDir={sortDir} onSort={onSort} className="text-right" />
                  <SortHeader col="date" label={t("sessions.date")} sortBy={sortBy} sortDir={sortDir} onSort={onSort} className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedFiles.map((f) => (
                  <TableRow
                    key={f.path}
                    onClick={() => open(f)}
                    className="cursor-pointer text-xs"
                  >
                    <TableCell className="py-1.5 font-medium">
                      <span className="flex items-center gap-1.5">
                        <TrackFlag track={f.track} className="h-3.5 w-auto" />
                        <span className="truncate">{f.track}</span>
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 text-muted-foreground whitespace-nowrap">
                      {f.track_layout}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <span className="flex items-center gap-1.5">
                        <CarLogo carName={f.car_model || f.car_name} className="h-4 w-auto" />
                        <span className="truncate">{f.car_model || f.car_name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <ClassBadge carClass={f.car_class} />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <SessionBadge type={f.session_type} />
                    </TableCell>
                    <TableCell className="py-1.5 text-muted-foreground whitespace-nowrap">
                      {f.driver}
                    </TableCell>
                    <TableCell className="py-1.5 text-muted-foreground whitespace-nowrap max-w-[160px] truncate">
                      {f.weather}
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums whitespace-nowrap font-medium">
                      {f.best_lap != null ? formatTime(f.best_lap) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="py-1.5 text-right text-muted-foreground whitespace-nowrap">
                      {formatDateTime(f.mtime)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="border-t border-border px-4 py-3">
              <Pagination
                page={safePage}
                pageCount={pageCount}
                onPageChange={setPage}
                pageSize={perPage}
                onPageSizeChange={handlePerPage}
                total={sortedFiles.length}
                pageSizeOptions={[15, 25, 50, 100, 200]}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
