import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  SortHeader as SortHead,
} from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { TableTitle } from "@/components/TableTitle";
import { ClassBadge } from "@/components/ClassBadge";
import { SessionBadge } from "@/components/SessionBadge";
import { sessionTypeLabel } from "@/lib/sessionLabels";
import { TrackFlag } from "@/components/TrackFlag";
import { CarLogo } from "@/components/CarLogo";
import { cn, formatTime, formatDateTime } from "@/lib/utils";
import {
  ChevronRight,
  Eye,
  BarChart3,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  Trophy,
  Flag,
  Timer,
  Layers,
  Medal,
  Target,
  BarChart3 as BarChartIcon,
  CircleOff,
  Route,
  Tag,
  Car,
  Globe,
  Package,
  WifiOff,
} from "lucide-react";
import { FilterField } from "@/components/FilterField";
import { LapChartModal } from "@/components/LapChartModal";
import { TierBadge } from "@/components/TierBadge";
import { Tip } from "@/components/ui/tooltip";
import { fetchBenchmarks, type PaceBenchmark } from "@/lib/ohne_speed";
import { useAppStore } from "@/stores/app";
import { queries } from "@/lib/api";
import type {
  SessionListRow,
  SessionsPage,
  SessionsOverview,
} from "@/lib/api";

const PAGE_SIZE_KEY = "sessions-page-size";

/** Colonnes triables — clés reconnues par le backend (V1 `columnMap`). */
type SortKey =
  | "Date"
  | "Track"
  | "TrackCourse"
  | "Setting"
  | "SessionType"
  | "Class"
  | "Car"
  | "Livery"
  | "BestLap"
  | "GridPos"
  | "Position"
  | "Progression"
  | "Pitstops"
  | "GameVersion";

function ProgCell({ row }: { row: SessionListRow }) {
  if (row.session_type !== "Race" || row.progression == null) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  const d = row.progression;
  if (d > 0)
    return (
      <span className="text-success flex items-center gap-0.5 font-mono text-xs font-semibold justify-center">
        <TrendingUp className="h-3 w-3" />+{d}
      </span>
    );
  if (d < 0)
    return (
      <span className="text-destructive flex items-center gap-0.5 font-mono text-xs font-semibold justify-center">
        <TrendingDown className="h-3 w-3" />
        {d}
      </span>
    );
  return (
    <span className="text-muted-foreground flex items-center gap-0.5 font-mono text-xs justify-center">
      <Minus className="h-3 w-3" />0
    </span>
  );
}

/** Arrivée : P{pos} / {participants} (Race terminé), ou statut (V1). */
function FinishCell({ row }: { row: SessionListRow }) {
  const { t } = useTranslation();
  if (row.session_type !== "Race") {
    return <span className="text-muted-foreground">—</span>;
  }
  if (row.finish_status === "Finished Normally") {
    return (
      <span className="font-mono text-sm">
        <strong>P{row.class_position}</strong>
        {row.participants > 0 && (
          <span className="text-xs text-muted-foreground font-normal">
            {" "}
            / {row.participants}
          </span>
        )}
      </span>
    );
  }
  if (row.finish_status === "Driver Swap") {
    return (
      <span className="text-blue-400 text-xs font-medium italic">{t("sessions.statusDriverSwap")}</span>
    );
  }
  return (
    <span className="text-destructive text-xs font-medium italic">
      {row.finish_status || "DNF"}
    </span>
  );
}

export function Sessions() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { filterOptions, selectedVersion, setSelectedVersion, gameVersions, showOhneSpeed } =
    useAppStore();

  // Benchmarks ohne_speed (chargés une fois, best-effort).
  const [benchmarks, setBenchmarks] = useState<PaceBenchmark[] | null>(null);
  const [ohneOffline, setOhneOffline] = useState(false);
  useEffect(() => {
    if (!showOhneSpeed) return;
    fetchBenchmarks()
      .then((bm) => { setBenchmarks(bm); setOhneOffline(false); })
      .catch(() => { setBenchmarks([]); setOhneOffline(true); });
  }, [showOhneSpeed]);

  // Filtres — pré-remplis depuis l'URL (lien profond depuis Profile / Records).
  // Lecture une seule fois au montage ; les changements internes ne sont pas
  // resynchronisés dans l'URL pour éviter une boucle navigate ↔ state.
  const [track, setTrack] = useState(() => searchParams.get("track") ?? "");
  const [trackCourse, setTrackCourse] = useState(
    () => searchParams.get("course") ?? ""
  );
  const [carClass, setCarClass] = useState(
    () => searchParams.get("class") ?? ""
  );
  const [car, setCar] = useState(() => searchParams.get("car") ?? "");
  const [sessionType, setSessionType] = useState(
    () => searchParams.get("session_type") ?? ""
  );
  const [setting, setSetting] = useState(
    () => searchParams.get("setting") ?? ""
  );

  // Tri + pagination
  const [sortBy, setSortBy] = useState<SortKey>("Date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() => {
    const s = localStorage.getItem(PAGE_SIZE_KEY);
    return s ? Number(s) : 25;
  });

  const [data, setData] = useState<SessionsPage | null>(null);
  const [overview, setOverview] = useState<SessionsOverview | null>(null);
  const [loading, setLoading] = useState(false);

  // Modale graphe de tours
  const [lapChartSessionId, setLapChartSessionId] = useState<number | null>(null);

  // Listes de filtres (cascade circuit→tracé, classe→voiture).
  const tracks = filterOptions?.tracks ?? [];
  const classes = filterOptions?.classes ?? [];
  const settings = filterOptions?.settings ?? [];
  const layouts = useMemo(() => {
    const all = (filterOptions?.layouts ?? [])
      .filter((l) => !track || l.track === track)
      .map((l) => l.layout);
    return Array.from(new Set(all));
  }, [filterOptions, track]);
  const cars = useMemo(
    () =>
      (filterOptions?.cars ?? [])
        .filter((c) => !carClass || c.car_class === carClass)
        .map((c) => c.car),
    [filterOptions, carClass]
  );

  useEffect(() => {
    queries.getSessionsOverview().then(setOverview).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await queries.getSessionsList(
        {
          track: track || undefined,
          track_course: trackCourse || undefined,
          car_class: carClass || undefined,
          car: car || undefined,
          session_type: sessionType || undefined,
          setting: setting || undefined,
          version: selectedVersion || undefined,
        },
        sortBy,
        sortDir,
        page,
        perPage
      );
      setData(result);
    } catch (e) {
      // Échec backend (base verrouillée, filtre invalide…) : on trace au lieu de
      // laisser une promesse rejetée non gérée. La liste garde son état précédent.
      console.error("[Sessions] chargement de la liste échoué", e);
    } finally {
      setLoading(false);
    }
  }, [
    track,
    trackCourse,
    carClass,
    car,
    sessionType,
    setting,
    selectedVersion,
    sortBy,
    sortDir,
    page,
    perPage,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => setTrackCourse(""), [track]);
  useEffect(() => setCar(""), [carClass]);
  useEffect(() => {
    setPage(1);
  }, [track, trackCourse, carClass, car, sessionType, setting, selectedVersion]);

  const handleSort = (key: SortKey) => {
    if (key === sortBy) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(key === "Date" ? "desc" : "asc");
    }
    setPage(1);
  };

  const handlePerPage = (s: number) => {
    localStorage.setItem(PAGE_SIZE_KEY, String(s));
    setPerPage(s);
    setPage(1);
  };

  const hasFilters =
    !!track ||
    !!trackCourse ||
    !!carClass ||
    !!car ||
    !!sessionType ||
    !!setting;

  const clearFilters = () => {
    setTrack("");
    setTrackCourse("");
    setCarClass("");
    setCar("");
    setSessionType("");
    setSetting("");
  };

  /** Clic sur une cellule = filtre rapide (cellules cliquables V1). */
  const cellFilter =
    (setter: (v: string) => void, value: string) =>
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setter(value);
    };

  // Mémoïsé pour une référence stable (dépendance des useMemo ci-dessous).
  const rows = useMemo(() => data?.rows ?? [], [data]);

  // Striping par événement (event_id) — sessions d'un même événement groupées.
  const groupParity = useMemo(() => {
    const map = new Map<number, number>();
    let prev: number | null = null;
    let parity = 0;
    rows.forEach((r) => {
      if (r.event_id !== prev) {
        parity ^= 1;
        prev = r.event_id;
      }
      map.set(r.session_id, parity);
    });
    return map;
  }, [rows]);

  const raceStats = useMemo(() => {
    const races = rows.filter(
      (r) => r.session_type === "Race" && r.class_position > 0
    );
    const podiums = races.filter((r) => r.class_position <= 3).length;
    const top5 = races.filter((r) => r.class_position <= 5).length;
    const top10 = races.filter((r) => r.class_position <= 10).length;
    const avgPos =
      races.length > 0
        ? (
            races.reduce((s, r) => s + r.class_position, 0) / races.length
          ).toFixed(1)
        : "—";
    // DNF = course non terminée. Le statut « terminé » est la chaîne exacte
    // "Finished Normally" (cf. FinishCell, Dashboard, SessionDetail) ; un
    // « Driver Swap » n'est pas un abandon. Les anciennes valeurs "Finished" /
    // "None" n'existent pas dans les données → toutes les courses finies
    // étaient comptées comme DNF.
    const dnfs = rows.filter(
      (r) =>
        r.session_type === "Race" &&
        r.finish_status &&
        r.finish_status !== "Finished Normally" &&
        r.finish_status !== "Driver Swap"
    ).length;
    return { podiums, top5, top10, avgPos, dnfs };
  }, [rows]);

  const sortProps = { sortBy, sortDir, onSort: handleSort };

  const heroTiles = overview
    ? [
        { icon: Trophy, value: overview.total, label: t("sessions.heroTotal") },
        { icon: Flag, value: overview.races, label: t("sessions.heroRaces") },
        { icon: Timer, value: overview.qualifs, label: t("sessions.heroQuals") },
        {
          icon: Layers,
          value: overview.practices,
          label: t("sessions.heroPractice"),
        },
        {
          icon: Medal,
          value: raceStats.podiums,
          label: t("sessions.heroPodiums"),
          accent: "text-success",
        },
        {
          icon: Target,
          value: raceStats.top5,
          label: t("sessions.heroTop5"),
        },
        {
          icon: BarChartIcon,
          value: raceStats.top10,
          label: t("sessions.heroTop10"),
        },
        {
          icon: TrendingUp,
          value: raceStats.avgPos,
          label: t("sessions.heroAvgPos"),
        },
        {
          icon: CircleOff,
          value: raceStats.dnfs,
          label: t("sessions.heroDnf"),
          accent: raceStats.dnfs > 0 ? "text-destructive" : undefined,
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      {/* Hero — compteurs (même format que les 7 stats du Dashboard) */}
      {heroTiles.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">
          {heroTiles.map(({ icon: Icon, value, label, accent }) => (
            <Card key={label} className="relative overflow-hidden">
              <CardContent className="p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-micro uppercase tracking-wide text-muted-foreground font-medium leading-tight">
                      {label}
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 text-sm font-bold font-mono tracking-tight truncate",
                        accent
                      )}
                      title={String(value)}
                    >
                      {value}
                    </p>
                  </div>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filtres */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <FilterField
              icon={Flag}
              label={t("sessions.fCircuit")}
              value={track}
              onChange={setTrack}
            >
              <option value="">{t("sessions.allTracks")}</option>
              {tracks.map((tr) => (
                <option key={tr} value={tr}>
                  {tr}
                </option>
              ))}
            </FilterField>

            {layouts.length > 0 && (
              <FilterField
                icon={Route}
                label={t("sessions.fLayout")}
                value={trackCourse}
                onChange={setTrackCourse}
              >
                <option value="">{t("sessions.allLayouts")}</option>
                {layouts.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </FilterField>
            )}

            <FilterField
              icon={Tag}
              label={t("sessions.fClass")}
              value={carClass}
              onChange={setCarClass}
            >
              <option value="">{t("sessions.allClasses")}</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </FilterField>

            {cars.length > 0 && (
              <FilterField
                icon={Car}
                label={t("sessions.fCar")}
                value={car}
                onChange={setCar}
                className="max-w-[260px]"
              >
                <option value="">{t("sessions.allCars")}</option>
                {cars.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </FilterField>
            )}

            <FilterField
              icon={Timer}
              label={t("sessions.fSession")}
              value={sessionType}
              onChange={setSessionType}
            >
              <option value="">{t("sessions.allTypes")}</option>
              {(filterOptions?.session_types ?? []).map((st) => (
                <option key={st} value={st}>
                  {sessionTypeLabel(st, t)}
                </option>
              ))}
            </FilterField>

            {settings.length > 1 && (
              <FilterField
                icon={Globe}
                label={t("sessions.fMode")}
                value={setting}
                onChange={setSetting}
              >
                <option value="">{t("sessions.allSettings")}</option>
                {settings.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </FilterField>
            )}

            {gameVersions.length > 0 && (
              <FilterField
                icon={Package}
                label={t("sessions.fVersion")}
                value={selectedVersion ?? ""}
                onChange={(v) => setSelectedVersion(v || null)}
              >
                <option value="">{t("header.allVersions")}</option>
                {gameVersions.map((v) => (
                  <option key={v} value={v}>
                    ≥ {v}
                  </option>
                ))}
              </FilterField>
            )}

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-1 text-xs text-muted-foreground"
                onClick={clearFilters}
              >
                <X className="h-3.5 w-3.5" /> {t("sessions.clearFilters")}
              </Button>
            )}

            {loading && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <TableTitle title={t("sessions.title")}>
          <span className="text-xs font-semibold">
            {t("sessions.filteredCount", { count: data?.total ?? 0 })}
          </span>
        </TableTitle>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {/* Tableau très dense (~16 colonnes) : on resserre le padding
                horizontal de toutes ses cellules pour éviter le scroll latéral.
                Le sélecteur `[&_th]/[&_td]` l'emporte (spécificité classe+élément)
                sur les `px-2` posés sur chaque cellule. */}
            <Table className="[&_th]:px-1 [&_td]:px-1">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-auto py-1 text-micro w-20 text-center px-2">
                    {t("sessions.colDetails")}
                  </TableHead>
                  <SortHead
                    col="Track"
                    label={t("sessions.circuit")}
                    {...sortProps}
                    className="px-2 border-l border-border/55"
                  />
                  <SortHead
                    col="TrackCourse"
                    label={t("records.colLayout")}
                    {...sortProps}
                    className="px-2"
                  />
                  <SortHead
                    col="Setting"
                    label={t("sessions.type")}
                    {...sortProps}
                    className="px-2"
                  />
                  <SortHead
                    col="SessionType"
                    label={t("sessions.details")}
                    {...sortProps}
                    className="px-2"
                  />
                  <SortHead
                    col="Class"
                    label={t("sessions.class")}
                    {...sortProps}
                    className="px-2"
                  />
                  <SortHead
                    col="Car"
                    label={t("sessions.colCar")}
                    {...sortProps}
                    className="px-2"
                  />
                  <SortHead
                    col="Livery"
                    label={t("sessions.colLivery")}
                    {...sortProps}
                    className="px-2"
                  />
                  <SortHead
                    col="BestLap"
                    label={t("sessions.colBestLap")}
                    {...sortProps}
                    className="px-2 border-l border-border/55 bg-sky-500/10"
                  />
                  {showOhneSpeed && (
                    <TableHead className="h-auto py-1 text-micro px-2 bg-sky-500/10 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        {t("sessions.colTier")}
                        {ohneOffline && (
                          <span title={t("config.ohneSpeedOffline")}>
                            <WifiOff className="h-3 w-3 text-amber-400" />
                          </span>
                        )}
                      </span>
                    </TableHead>
                  )}
                  <SortHead
                    col="GridPos"
                    label={t("sessions.colStart")}
                    {...sortProps}
                    className="text-center px-2 bg-sky-500/10"
                  />
                  <SortHead
                    col="Position"
                    label={t("sessions.colFinish")}
                    {...sortProps}
                    className="text-center px-2 bg-sky-500/10"
                  />
                  <SortHead
                    col="Progression"
                    label={t("sessions.colProg")}
                    {...sortProps}
                    className="text-center px-2 bg-sky-500/10"
                  />
                  <SortHead
                    col="Pitstops"
                    label={t("sessions.colPits")}
                    {...sortProps}
                    className="text-center px-2 border-l border-border/55"
                  />
                  <SortHead
                    col="Date"
                    label={t("sessions.date")}
                    {...sortProps}
                    className="px-2"
                  />
                  <SortHead
                    col="GameVersion"
                    label={t("sessions.colVersion")}
                    {...sortProps}
                    className="px-2"
                  />
                  <TableHead className="h-auto py-1 text-micro w-6 px-1" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => {
                  const online = s.setting === "Multiplayer";
                  const stripe = groupParity.get(s.session_id) === 1;
                  return (
                    <TableRow
                      key={s.session_id}
                      onClick={() => navigate(`/sessions/${s.session_id}`)}
                      className={cn(
                        "cursor-pointer group text-xs",
                        stripe && "bg-muted/30"
                      )}
                    >
                      {/* Détails + Records */}
                      <TableCell className="px-2 py-1.5">
                        <div className="flex items-center gap-1 justify-center">
                          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                            <Eye className="h-3 w-3" />
                          </div>
                          <Tip content={t("sessions.colRecords")}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const qs = new URLSearchParams({
                                  track: s.track,
                                  course: s.track_course,
                                  class: s.car_class,
                                  car: s.car,
                                });
                                navigate(`/records?${qs}`);
                              }}
                              className="flex h-5 w-5 items-center justify-center rounded-md bg-success/10 text-success hover:bg-success hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={t("sessions.colRecords")}
                            >
                              <BarChart3 className="h-3 w-3" />
                            </button>
                          </Tip>
                        </div>
                      </TableCell>

                      {/* Circuit (cliquable-filtre) */}
                      <TableCell
                        className="font-medium px-2 py-1.5 hover:text-primary border-l border-border/55"
                        onClick={cellFilter(setTrack, s.track)}
                      >
                        <div className="flex items-center gap-1.5">
                          <TrackFlag
                            track={s.track}
                            className="h-3 w-auto rounded-[2px] shrink-0"
                          />
                          <span className="whitespace-nowrap">{s.track}</span>
                        </div>
                      </TableCell>

                      {/* Tracé (cliquable-filtre) */}
                      <TableCell
                        className="px-2 py-1.5 text-muted-foreground whitespace-nowrap hover:text-primary"
                        onClick={
                          s.track_course
                            ? cellFilter(setTrackCourse, s.track_course)
                            : undefined
                        }
                      >
                        {s.track_course && s.track_course !== s.track ? (
                          s.track_course
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </TableCell>

                      {/* Type online/offline (cliquable-filtre) */}
                      <TableCell
                        className="px-2 py-1.5 whitespace-nowrap"
                        onClick={cellFilter(setSetting, s.setting)}
                      >
                        <span className="text-xs">
                          {online
                            ? t("sessions.online")
                            : t("sessions.offline")}
                        </span>
                      </TableCell>

                      {/* Session (cliquable-filtre) */}
                      <TableCell
                        className="px-2 py-1.5"
                        onClick={cellFilter(setSessionType, s.session_type)}
                      >
                        <SessionBadge type={s.session_type} />
                      </TableCell>

                      {/* Classe (cliquable-filtre) */}
                      <TableCell
                        className="px-2 py-1.5"
                        onClick={cellFilter(setCarClass, s.car_class)}
                      >
                        <ClassBadge carClass={s.car_class} size="sm" />
                      </TableCell>

                      {/* Voiture (cliquable-filtre) */}
                      <TableCell
                        className="px-2 py-1.5 hover:text-primary"
                        onClick={cellFilter(setCar, s.car)}
                      >
                        <div className="flex items-center gap-1.5">
                          <CarLogo
                            carName={s.car}
                            className="h-3.5 w-auto object-contain opacity-80 shrink-0"
                          />
                          <span className="font-medium whitespace-nowrap">
                            {s.car}
                          </span>
                        </div>
                      </TableCell>

                      {/* Livrée */}
                      <TableCell className="px-2 py-1.5 text-muted-foreground whitespace-nowrap max-w-[160px]">
                        <span className="truncate block">
                          {s.livery && s.livery !== s.car ? (
                            s.livery
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </span>
                      </TableCell>

                      {/* Meilleur tour — clic → graphe de tours */}
                      <TableCell className="text-right font-mono px-2 py-1.5 whitespace-nowrap border-l border-border/55 bg-sky-500/[0.06]">
                        {s.best_lap ? (
                          <Tip content="Voir le graphe de tours">
                            <button
                              className="text-success font-semibold underline decoration-dotted underline-offset-2 cursor-pointer rounded-sm hover:text-success/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLapChartSessionId(s.session_id);
                              }}
                            >
                              {formatTime(s.best_lap)}
                            </button>
                          </Tip>
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </TableCell>

                      {/* Tier ohne_speed */}
                      {showOhneSpeed && (
                        <TableCell className="px-2 py-1.5 bg-sky-500/[0.06]">
                          <TierBadge
                            benchmarks={benchmarks}
                            track={s.track}
                            layout={s.track_course}
                            carClass={s.car_class}
                            lapSeconds={s.best_lap}
                          />
                        </TableCell>
                      )}

                      {/* Départ */}
                      <TableCell className="text-center font-mono px-2 py-1.5 bg-sky-500/[0.06]">
                        {s.session_type === "Race" && s.grid_pos > 0 ? (
                          `P${s.grid_pos}`
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Arrivée */}
                      <TableCell className="text-center px-2 py-1.5 bg-sky-500/[0.06]">
                        <FinishCell row={s} />
                      </TableCell>

                      {/* Progression */}
                      <TableCell className="text-center px-2 py-1.5 bg-sky-500/[0.06]">
                        <ProgCell row={s} />
                      </TableCell>

                      {/* Arrêts */}
                      <TableCell className="text-center font-mono px-2 py-1.5 border-l border-border/55">
                        {s.pitstops > 0 ? (
                          s.pitstops
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Date */}
                      <TableCell className="font-mono px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                        {formatDateTime(s.timestamp)}
                      </TableCell>

                      {/* Version */}
                      <TableCell className="px-2 py-1.5">
                        <span className="font-mono text-nano text-muted-foreground">
                          {s.game_version}
                        </span>
                      </TableCell>

                      <TableCell className="px-1 py-1.5">
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                      </TableCell>
                    </TableRow>
                  );
                })}

                {rows.length === 0 && !loading && (
                  <TableRow>
                    <TableCell
                      colSpan={showOhneSpeed ? 17 : 16}
                      className="py-12 text-center text-sm text-muted-foreground"
                    >
                      {t("sessions.noResults")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="border-t border-border px-4 py-3">
            <Pagination
              page={data?.page ?? 1}
              pageCount={data?.total_pages ?? 1}
              onPageChange={setPage}
              pageSize={perPage}
              onPageSizeChange={handlePerPage}
              total={data?.total ?? 0}
              pageSizeOptions={[15, 25, 50, 100, 200]}
            />
          </div>
        </CardContent>
      </Card>

      {/* Modale graphe de tours */}
      {lapChartSessionId != null && (
        <LapChartModal
          sessionId={lapChartSessionId}
          onClose={() => setLapChartSessionId(null)}
        />
      )}
    </div>
  );
}
