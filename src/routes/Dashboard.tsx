import { useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useNavigate } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { TableTitle } from "@/components/TableTitle";
import { ClassBadge } from "@/components/ClassBadge";
import { CarLogo } from "@/components/CarLogo";
import { SessionBadge } from "@/components/SessionBadge";
import { sessionTypeLabel as sharedSessionTypeLabel } from "@/lib/sessionLabels";
import { getCircuitFlagUrlSync, classChartColor } from "@/lib/staticData";
import {
  cn,
  chartTooltipStyle,
  classOrder,
  formatTime,
  formatSectorSeconds,
  formatDateTime,
  compareVersions,
} from "@/lib/utils";
import {
  Route,
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  Car,
  Award,
  Loader2,
  Eye,
  BarChart3,
  ChevronDown,
  X,
  Flag,
  Tag,
  Timer,
  Globe,
  Package,
} from "lucide-react";
import { FilterField } from "@/components/FilterField";
import { LapChartModal } from "@/components/LapChartModal";
import { Tip } from "@/components/ui/tooltip";
import { useAppStore } from "@/stores/app";
import type { BestLapRow } from "@/lib/api";

/** Étiquette du type de session — délègue au composant partagé. */
const sessionTypeLabel = sharedSessionTypeLabel;

/** Étiquette du « Type » (Setting) : Multiplayer → En ligne, sinon Week-end. */
function settingLabel(s: string, t: (k: string) => string): string {
  if (s === "Multiplayer") return t("sessions.online");
  return t("sessions.offline");
}

export function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    bestLaps,
    dashboardStats,
    filterOptions,
    loading,
    selectedVersion,
    setSelectedVersion,
    versionExact,
    setVersionExact,
    gameVersions,
    showOutdated,
    setShowOutdated,
  } = useAppStore();

  // Filtres (barre de recherche `index.php` V1) — appliqués côté client.
  const [track, setTrack] = useState("");
  const [trackCourse, setTrackCourse] = useState("");
  const [carClass, setCarClass] = useState("");
  const [car, setCar] = useState("");
  const [sessionType, setSessionType] = useState("");
  const [setting, setSetting] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Modale graphe de tours
  const [lapChartSessionId, setLapChartSessionId] = useState<number | null>(null);
  const openLapChart = useCallback((id: number) => setLapChartSessionId(id), []);
  const closeLapChart = useCallback(() => setLapChartSessionId(null), []);

  // Cellules cliquables-filtres (comportement V1, aligné sur la page Sessions) :
  // cliquer une cellule Type/Session/Classe/Voiture applique ce filtre au tableau.
  const onCellFilter = useCallback(
    (field: "class" | "car" | "session" | "setting", value: string) => {
      if (!value) return;
      if (field === "class") {
        setCarClass(value);
        setCar("");
      } else if (field === "car") setCar(value);
      else if (field === "session") setSessionType(value);
      else if (field === "setting") setSetting(value);
    },
    []
  );

  const tracks = filterOptions?.tracks ?? [];
  const settings = filterOptions?.settings ?? [];
  const layouts = useMemo(() => {
    const all = (filterOptions?.layouts ?? [])
      .filter((l) => !track || l.track === track)
      .map((l) => l.layout);
    // Dédup quand aucune piste n'est choisie (un même nom de tracé peut
    // exister sur plusieurs circuits).
    return Array.from(new Set(all));
  }, [filterOptions, track]);

  // Sur le Dashboard les listes Voiture/Classe sont dérivées des records eux-mêmes :
  // on n'affiche que les voitures/classes pour lesquelles le joueur a effectivement
  // un meilleur tour enregistré (Sessions reste plus large via `is_player = 1`).
  const classes = useMemo(() => {
    const set = new Set<string>();
    for (const l of bestLaps) if (l.car_class) set.add(l.car_class);
    return Array.from(set).sort((a, b) => classOrder(a) - classOrder(b));
  }, [bestLaps]);
  const cars = useMemo(() => {
    const set = new Set<string>();
    for (const l of bestLaps) {
      if (!l.car) continue;
      if (carClass && l.car_class !== carClass) continue;
      set.add(l.car);
    }
    return Array.from(set).sort();
  }, [bestLaps, carClass]);

  // Filtrage des meilleurs tours (règle `index.php` array_filter).
  const visibleBestLaps = useMemo(() => {
    return bestLaps.filter((l) => {
      if (track && l.track !== track) return false;
      if (trackCourse && l.track_course !== trackCourse) return false;
      if (carClass && l.car_class !== carClass) return false;
      if (car && l.car !== car) return false;
      if (sessionType && l.session_type !== sessionType) return false;
      if (setting && l.setting !== setting) return false;
      if (selectedVersion) {
        if (versionExact) {
          // « Cette version uniquement » : égalité stricte (ignore le toggle obsolètes).
          if (compareVersions(l.game_version, selectedVersion) !== 0) return false;
        } else if (!showOutdated) {
          if (compareVersions(l.game_version, selectedVersion) < 0) return false;
        }
      }
      return true;
    });
  }, [
    bestLaps,
    track,
    trackCourse,
    carClass,
    car,
    sessionType,
    setting,
    selectedVersion,
    versionExact,
    showOutdated,
  ]);

  const outdatedCount = useMemo(() => {
    if (!selectedVersion) return 0;
    return bestLaps.filter(
      (l) => compareVersions(l.game_version, selectedVersion) < 0
    ).length;
  }, [bestLaps, selectedVersion]);

  // Groupage par circuit + tracé (en-têtes de groupe pliables).
  const groups = useMemo(() => {
    const map = new Map<string, BestLapRow[]>();
    for (const l of visibleBestLaps) {
      const key = `${l.track}|||${l.track_course}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    return [...map.entries()].map(([key, rows]) => {
      const [trk, course] = key.split("|||");
      return { key, track: trk, course, rows };
    });
  }, [visibleBestLaps]);

  const allCollapsed =
    groups.length > 0 && groups.every((g) => collapsed.has(g.key));

  const toggleAll = () => {
    setCollapsed(
      allCollapsed ? new Set() : new Set(groups.map((g) => g.key))
    );
  };
  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Stats performance (7 cards) — valeurs et formats EXACTEMENT comme la V1 (`index.php` hero).
  const stats = useMemo(() => {
    const ds = dashboardStats;
    if (!ds) return [];

    const laps = visibleBestLaps;
    const combos = new Set(laps.map((l) => `${l.track}|${l.car}`)).size;

    return [
      {
        label: t("dashboard.totalRecords"),
        value: String(laps.length),
        icon: Trophy,
      },
      {
        label: t("dashboard.combosExplored"),
        value: String(combos),
        icon: Route,
      },
      {
        label: t("dashboard.bestImprovement"),
        value: ds.best_progression != null ? `+${ds.best_progression}` : "N/A",
        icon: TrendingUp,
      },
      {
        label: t("dashboard.bestResult"),
        value: ds.best_finish != null ? `P${ds.best_finish}` : "N/A",
        icon: Flag,
      },
      {
        label: t("dashboard.podiums"),
        value: String(ds.podiums),
        icon: Award,
      },
      {
        label: t("dashboard.wins"),
        value: String(ds.wins),
        icon: Trophy,
      },
      {
        label: t("dashboard.top10"),
        value: String(ds.top10),
        icon: Flag,
      },
    ];
  }, [dashboardStats, visibleBestLaps, t]);

  const lapsByClass = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const bl of visibleBestLaps) {
      counts[bl.car_class] = (counts[bl.car_class] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([cls, count]) => ({
        class: cls,
        records: count,
        fill: classChartColor(cls),
      }))
      .sort((a, b) => b.records - a.records);
  }, [visibleBestLaps]);

  const hasFilters =
    !!track || !!trackCourse || !!carClass || !!car || !!sessionType || !!setting;
  const clearFilters = () => {
    setTrack("");
    setTrackCourse("");
    setCarClass("");
    setCar("");
    setSessionType("");
    setSetting("");
  };

  if (loading && !dashboardStats) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {outdatedCount > 0 && (
        <div className="flex justify-end">
          <Button
            variant={showOutdated ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowOutdated(!showOutdated)}
          >
            {t("config.includeOutdated")}
          </Button>
        </div>
      )}

      {/* Hero — 7 stats performance (index.php V1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="relative overflow-hidden">
              <CardContent className="p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-micro uppercase tracking-wide text-muted-foreground font-medium leading-tight">
                      {s.label}
                    </p>
                    <p
                      className="mt-0.5 text-sm font-bold font-mono tracking-tight truncate"
                      title={typeof s.value === "string" ? s.value : undefined}
                    >
                      {s.value}
                    </p>
                  </div>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Barre de filtres */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <FilterField
              icon={Flag}
              label={t("sessions.fCircuit")}
              value={track}
              onChange={(v) => {
                setTrack(v);
                setTrackCourse("");
              }}
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
              onChange={(v) => {
                setCarClass(v);
                setCar("");
              }}
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
                    {settingLabel(s, t)}
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
                    {versionExact ? "=" : "≥"} {v}
                  </option>
                ))}
              </FilterField>
            )}
            {gameVersions.length > 0 && selectedVersion && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  className="accent-primary h-3.5 w-3.5"
                  checked={versionExact}
                  onChange={(e) => setVersionExact(e.target.checked)}
                />
                {t("sessions.versionExact")}
              </label>
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
          </div>
        </CardContent>
      </Card>

      {/* Tableau des meilleurs temps — groupé par circuit (index.php V1) */}
      <Card className="overflow-hidden">
        <TableTitle
          title={t("dashboard.bestTimesByTrack")}
        >
          <div className="flex items-center gap-3 text-micro font-medium">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {t("dashboard.legendRecord")}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-yellow-600" />
              {t("dashboard.legendBestSector")}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-purple-600" />
              {t("dashboard.optimal")}
            </span>
          </div>
          {groups.length > 0 && (
            <button
              onClick={toggleAll}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary-foreground/15 hover:bg-primary-foreground/25 px-2.5 py-1 text-xs font-semibold transition-colors"
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  allCollapsed && "-rotate-90"
                )}
              />
              {allCollapsed
                ? t("dashboard.expandAll")
                : t("dashboard.collapseAll")}
            </button>
          )}
        </TableTitle>
      </Card>

      {groups.length === 0 && (
        <p className="text-center text-muted-foreground py-10 text-sm">
          {t("dashboard.noData")}
        </p>
      )}

      <div className="flex flex-col gap-3 -mt-1">
        {groups.map((g) => {
          const isCollapsed = collapsed.has(g.key);
          const flag = getCircuitFlagUrlSync(g.track);
          const title =
            g.course && g.course !== g.track
              ? `${g.track} — ${g.course}`
              : g.track;
          return (
            <DashboardGroup
              key={g.key}
              title={title}
              flag={flag}
              collapsed={isCollapsed}
              onToggle={() => toggleGroup(g.key)}
              rows={g.rows}
              navigate={navigate}
              t={t}
              openLapChart={openLapChart}
              onCellFilter={onCellFilter}
            />
          );
        })}
      </div>

      {/* Graphique « Records par classe » (V2, conservé sur accord utilisateur) */}
      {lapsByClass.length > 0 && (
        <Card className="overflow-hidden">
          <TableTitle title={t("dashboard.recordsByClass")} />
          <CardContent className="pt-3">
            <div className="h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={lapsByClass}
                  layout="vertical"
                  margin={{ top: 5, right: 16, left: 50, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{
                      fontSize: 10,
                      fill: "var(--color-muted-foreground)",
                    }}
                  />
                  <YAxis
                    type="category"
                    dataKey="class"
                    tick={{
                      fontSize: 10,
                      fill: "var(--color-muted-foreground)",
                    }}
                    width={80}
                  />
                  <Tooltip {...chartTooltipStyle} />
                  <Bar dataKey="records" radius={[0, 4, 4, 0]}>
                    {lapsByClass.map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill={entry.fill}
                        fillOpacity={0.65}
                        stroke={entry.fill}
                        strokeOpacity={0.85}
                        strokeWidth={1}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modale graphe de tours */}
      {lapChartSessionId != null && (
        <LapChartModal sessionId={lapChartSessionId} onClose={closeLapChart} />
      )}
    </div>
  );
}

// ── Groupe circuit + ses lignes ──────────────────────────────────────────────

function DashboardGroup({
  title,
  flag,
  collapsed,
  onToggle,
  rows,
  navigate,
  t,
  openLapChart,
  onCellFilter,
}: {
  title: string;
  flag: string | null;
  collapsed: boolean;
  onToggle: () => void;
  rows: BestLapRow[];
  navigate: (to: string) => void;
  t: (k: string) => string;
  openLapChart: (id: number) => void;
  onCellFilter: (
    field: "class" | "car" | "session" | "setting",
    value: string
  ) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div
        className="cursor-pointer group bg-primary/30 dark:bg-primary/25 hover:bg-primary/40 px-3 py-1.5 transition-colors flex items-center gap-2"
        onClick={onToggle}
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-yellow-700 dark:text-yellow-300 transition-transform",
            collapsed && "-rotate-90"
          )}
        />
        {flag && (
          <img
            src={flag}
            alt=""
            className="h-3.5 w-auto rounded-[2px] shadow-sm ring-1 ring-black/20"
          />
        )}
        <span className="text-yellow-700 dark:text-yellow-300 font-semibold text-xs uppercase tracking-[0.12em]">
          {title}
        </span>
        <span className="rounded-full bg-primary/20 px-1.5 py-0 text-micro font-bold text-yellow-700 dark:text-yellow-300 tabular-nums">
          {rows.length}
        </span>
      </div>
      {!collapsed && (
        <Table className="w-full text-xs table-fixed min-w-[1100px]">
          <colgroup>
              <col className="w-[3.5%]" />
              <col className="w-[3.5%]" />
              <col className="w-[6%]" />
              <col className="w-[5%]" />
              <col className="w-[4.5%]" />
              <col className="w-[2.5%]" />
              <col className="w-[13%]" />
              <col className="w-[10%]" />
              <col className="w-[7%]" />
              <col className="w-[4.5%]" />
              <col className="w-[4.5%]" />
              <col className="w-[4.5%]" />
              <col className="w-[7%]" />
              <col className="w-[5%]" />
              <col className="w-[4%]" />
              <col className="w-[5%]" />
              <col className="w-[6.5%]" />
              <col className="w-[9%]" />
          </colgroup>
          <TableHeader>
              <TableRow className="border-primary/40">
                <TableHead className="font-medium text-center">
                  {t("dashboard.details")}
                </TableHead>
                <TableHead className="font-medium text-center">
                  {t("sessions.colRecords")}
                </TableHead>
                <TableHead className="font-medium border-l border-border/55">
                  {t("sessions.type")}
                </TableHead>
                <TableHead className="font-medium">
                  {t("dashboard.session")}
                </TableHead>
                <TableHead className="font-medium">
                  {t("dashboard.class")}
                </TableHead>
                <TableHead className="font-medium" colSpan={2}>
                  {t("dashboard.car")}
                </TableHead>
                <TableHead className="font-medium">
                  {t("sessions.colLivery")}
                </TableHead>
                <TableHead className="font-medium text-right border-l border-border/55 bg-sky-500/10">
                  {t("dashboard.bestLap")}
                </TableHead>
                <TableHead className="font-medium text-right bg-sky-500/10">S1</TableHead>
                <TableHead className="font-medium text-right bg-sky-500/10">S2</TableHead>
                <TableHead className="font-medium text-right bg-sky-500/10">S3</TableHead>
                <TableHead className="font-medium text-right bg-sky-500/10">
                  {t("dashboard.optimal")}
                </TableHead>
                <TableHead className="font-medium text-right">
                  {t("dashboard.maxSpeed")} (km/h)
                </TableHead>
                <TableHead className="font-medium text-center border-l border-border/55">
                  {t("sessions.colFinish")}
                </TableHead>
                <TableHead className="font-medium text-center">
                  {t("sessions.colProg")}
                </TableHead>
                <TableHead className="font-medium border-l border-border/55">
                  {t("sessions.date")}
                </TableHead>
                <TableHead className="font-medium">
                  {t("dashboard.ver")}
                </TableHead>
              </TableRow>
          </TableHeader>
          <TableBody>
              {rows.map((l, i) => (
                <DashboardRow key={i} l={l} idx={i} navigate={navigate} t={t} openLapChart={openLapChart} onCellFilter={onCellFilter} />
              ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

/**
 * Bouton d'action en icône (colonnes Détails / Records) : zone cliquable
 * confortable (24 px) + état focus clavier visible. Couleur posée à part.
 */
const ACTION_BTN =
  "inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Fond teinté discret du bloc « Performance ». */
const PERF_CELL = "bg-sky-500/[0.06]";
/** Séparateur vertical entre blocs de colonnes. */
const GROUP_SEP = "border-l border-border/55";

function sectorCell(value: number | null, abs: number | null) {
  const isBest =
    value != null && abs != null && Math.abs(value - abs) < 0.001;
  return (
    <TableCell
      className={cn(
        "px-2 py-1 text-right font-mono",
        PERF_CELL,
        isBest && "text-yellow-500 font-semibold"
      )}
    >
      {value != null ? formatSectorSeconds(value) : "—"}
    </TableCell>
  );
}

function DashboardRow({
  l,
  idx,
  navigate,
  t,
  openLapChart,
  onCellFilter,
}: {
  l: BestLapRow;
  idx: number;
  navigate: (to: string) => void;
  t: (k: string) => string;
  openLapChart: (id: number) => void;
  onCellFilter: (
    field: "class" | "car" | "session" | "setting",
    value: string
  ) => void;
}) {
  const isRace = l.session_type === "Race";
  return (
    <TableRow
      className={cn(
        "border-b border-border/50 hover:bg-muted/40",
        idx % 2 === 1 && "bg-muted/25"
      )}
    >
      {/* Détails */}
      <TableCell className="px-2 py-1 text-center">
        <Tip content={t("dashboard.details")}>
          <button
            onClick={() => navigate(`/sessions/${l.session_id}`)}
            className={cn(ACTION_BTN, "text-primary hover:bg-primary/10")}
            aria-label={t("dashboard.details")}
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </Tip>
      </TableCell>
      {/* Records */}
      <TableCell className="px-2 py-1 text-center">
        <Tip content={t("sessions.colRecords")}>
          <button
            onClick={() => {
              const qs = new URLSearchParams({
                track: l.track,
                course: l.track_course,
                class: l.car_class,
                car: l.car,
              });
              navigate(`/records?${qs}`);
            }}
            className={cn(ACTION_BTN, "text-success hover:bg-success/10")}
            aria-label={t("sessions.colRecords")}
          >
            <BarChart3 className="h-3.5 w-3.5" />
          </button>
        </Tip>
      </TableCell>
      {/* Type (cliquable-filtre) */}
      <TableCell
        className={cn("px-2 py-1 whitespace-nowrap cursor-pointer hover:text-primary", GROUP_SEP)}
        onClick={() => onCellFilter("setting", l.setting)}
      >
        {settingLabel(l.setting, t)}
      </TableCell>
      {/* Session (cliquable-filtre) */}
      <TableCell
        className="px-2 py-1 cursor-pointer"
        onClick={() => onCellFilter("session", l.session_type)}
      >
        <SessionBadge type={l.session_type} />
      </TableCell>
      {/* Classe (cliquable-filtre) */}
      <TableCell
        className="px-2 py-1 cursor-pointer"
        onClick={() => onCellFilter("class", l.car_class)}
      >
        <ClassBadge carClass={l.car_class} size="sm" />
      </TableCell>
      {/* Logo + voiture (cliquable-filtre) */}
      <TableCell
        className="px-1 py-1 w-7 cursor-pointer"
        onClick={() => onCellFilter("car", l.car)}
      >
        <CarLogo
          carName={l.car}
          className="h-3.5 w-auto object-contain opacity-80"
        />
      </TableCell>
      <TableCell
        className="px-2 py-1 font-medium whitespace-nowrap cursor-pointer hover:text-primary"
        onClick={() => onCellFilter("car", l.car)}
      >
        {l.car}
      </TableCell>
      {/* Livrée (masquée si identique au nom de voiture, comme Sessions) */}
      <TableCell className="px-2 py-1 text-muted-foreground whitespace-nowrap max-w-[150px] truncate">
        {l.livery && l.livery !== l.car ? l.livery : "—"}
      </TableCell>
      {/* Best lap — clic → graphe de tours */}
      <TableCell
        className={cn(
          "px-2 py-1 text-right font-mono font-semibold text-success",
          GROUP_SEP,
          PERF_CELL
        )}
      >
        <Tip content="Voir le graphe de tours">
          <button
            className="underline decoration-dotted underline-offset-2 cursor-pointer rounded-sm hover:text-success/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => openLapChart(l.session_id)}
          >
            {formatTime(l.best_lap)}
          </button>
        </Tip>
      </TableCell>
      {/* S1 / S2 / S3 */}
      {sectorCell(l.best_lap_s1, l.abs_best_s1)}
      {sectorCell(l.best_lap_s2, l.abs_best_s2)}
      {sectorCell(l.best_lap_s3, l.abs_best_s3)}
      {/* Optimal */}
      <TableCell className={cn("px-2 py-1 text-right font-mono text-purple", PERF_CELL)}>
        {formatTime(l.optimal_lap)}
        {l.best_lap != null && l.optimal_lap != null && l.best_lap - l.optimal_lap > 0.001 && (
          <div className="text-micro text-emerald-500 font-semibold">(-{(l.best_lap - l.optimal_lap).toFixed(3)}s)</div>
        )}
      </TableCell>
      {/* Vmax */}
      <TableCell className="px-2 py-1 text-right font-mono text-muted-foreground whitespace-nowrap">
        {l.vmax != null ? `${l.vmax.toFixed(2)}` : "—"}
      </TableCell>
      {/* Position arrivée */}
      <TableCell className={cn("px-2 py-1 text-center font-mono", GROUP_SEP)}>
        {!isRace ? (
          <span className="text-muted-foreground">—</span>
        ) : l.finish_status === "Driver Swap" ? (
          <span className="text-blue-400 italic text-mini">{t("sessions.statusDriverSwap")}</span>
        ) : l.finish_status && l.finish_status !== "Finished Normally" ? (
          <span className="text-destructive italic text-mini">
            {l.finish_status}
          </span>
        ) : (
          `P${l.class_position}`
        )}
      </TableCell>
      {/* Progression */}
      <TableCell className="px-2 py-1 text-center font-mono">
        {!isRace || l.progression == null ? (
          <span className="text-muted-foreground">—</span>
        ) : l.progression > 0 ? (
          <span className="text-success inline-flex items-center gap-0.5">
            <TrendingUp className="h-3 w-3" />+{l.progression}
          </span>
        ) : l.progression < 0 ? (
          <span className="text-destructive inline-flex items-center gap-0.5">
            <TrendingDown className="h-3 w-3" />
            {l.progression}
          </span>
        ) : (
          <span className="text-muted-foreground inline-flex items-center gap-0.5">
            <Minus className="h-3 w-3" />0
          </span>
        )}
      </TableCell>
      {/* Date */}
      <TableCell className={cn("px-2 py-1 text-muted-foreground whitespace-nowrap", GROUP_SEP)}>
        {formatDateTime(l.timestamp)}
      </TableCell>
      {/* Version */}
      <TableCell className="px-2 py-1 text-muted-foreground whitespace-nowrap font-mono text-micro">
        {l.game_version || "\u2014"}
      </TableCell>
    </TableRow>
  );
}
