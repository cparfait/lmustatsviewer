import { useMemo, useState } from "react";
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
import { TableTitle } from "@/components/TableTitle";
import { ClassBadge } from "@/components/ClassBadge";
import { CarLogo } from "@/components/CarLogo";
import {
  SessionBadge,
  sessionTypeLabel as sharedSessionTypeLabel,
} from "@/components/SessionBadge";
import { getCircuitFlagUrlSync } from "@/lib/staticData";
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
  MapPin,
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
      if (selectedVersion && !showOutdated) {
        if (compareVersions(l.game_version, selectedVersion) < 0) return false;
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
        value: ds.best_progression != null ? `▲ +${ds.best_progression}` : "N/A",
        icon: TrendingUp,
      },
      {
        label: t("dashboard.bestResult"),
        value: ds.best_finish != null ? `🏆 P${ds.best_finish}` : "N/A",
        icon: Flag,
      },
      {
        label: t("dashboard.podiums"),
        value: `🥇 ${ds.podiums}`,
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

  const CLASS_COLORS: Record<string, string> = {
    Hypercar: "#ef4444",
    Hyper:    "#ef4444",
    "LMP2 WEC":  "#3b82f6",
    LMP2_WEC:    "#3b82f6",
    "LMP2 ELMS": "#60a5fa",
    LMP2_ELMS:   "#60a5fa",
    LMP2:        "#3b82f6",
    LMP3:        "#a855f7",
    GT3:         "#22c55e",
    GTE:         "#f97316",
  };

  const lapsByClass = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const bl of visibleBestLaps) {
      counts[bl.car_class] = (counts[bl.car_class] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([cls, count]) => ({
        class: cls,
        records: count,
        fill: CLASS_COLORS[cls] ?? "var(--color-primary)",
      }))
      .sort((a, b) => b.records - a.records);
  }, [visibleBestLaps]); // eslint-disable-line react-hooks/exhaustive-deps

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
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-medium leading-tight">
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
          </div>
          <span className="text-xs text-muted-foreground">
            {t("dashboard.recordsCount", { count: visibleBestLaps.length })}
          </span>
        </CardContent>
      </Card>

      {/* Tableau des meilleurs temps — groupé par circuit (index.php V1) */}
      <Card className="overflow-hidden">
        <TableTitle
          title={t("dashboard.bestTimesByTrack")}
        >
          <div className="flex items-center gap-3 text-[10px] font-medium">
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
    </div>
  );
}

// ── Groupe circuit + ses lignes ──────────────────────────────────────────────

const COLS = 18;

function DashboardGroup({
  title,
  flag,
  collapsed,
  onToggle,
  rows,
  navigate,
  t,
}: {
  title: string;
  flag: string | null;
  collapsed: boolean;
  onToggle: () => void;
  rows: BestLapRow[];
  navigate: (to: string) => void;
  t: (k: string) => string;
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
        <span className="rounded-full bg-primary/20 px-1.5 py-0 text-[9px] font-bold text-yellow-700 dark:text-yellow-300 tabular-nums">
          {rows.length}
        </span>
      </div>
      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs table-fixed min-w-[1100px]">
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
            <tbody>
              <tr className="text-[10px] uppercase tracking-wide text-yellow-900 dark:text-yellow-100 bg-primary/15 border-b border-primary/40 font-semibold">
                <th className="px-2 py-1 font-medium text-center">
                  {t("dashboard.details")}
                </th>
                <th className="px-2 py-1 font-medium text-center">
                  {t("sessions.colRecords")}
                </th>
                <th className="px-2 py-1 font-medium text-left border-l border-border/55">
                  {t("sessions.type")}
                </th>
                <th className="px-2 py-1 font-medium text-left">
                  {t("dashboard.session")}
                </th>
                <th className="px-2 py-1 font-medium text-left">
                  {t("dashboard.class")}
                </th>
                <th className="px-2 py-1 font-medium text-left" colSpan={2}>
                  {t("dashboard.car")}
                </th>
                <th className="px-2 py-1 font-medium text-left">
                  {t("sessions.colLivery")}
                </th>
                <th className="px-2 py-1 font-medium text-right border-l border-border/55 bg-sky-500/10">
                  {t("dashboard.bestLap")}
                </th>
                <th className="px-2 py-1 font-medium text-right bg-sky-500/10">S1</th>
                <th className="px-2 py-1 font-medium text-right bg-sky-500/10">S2</th>
                <th className="px-2 py-1 font-medium text-right bg-sky-500/10">S3</th>
                <th className="px-2 py-1 font-medium text-right bg-sky-500/10">
                  {t("dashboard.optimal")}
                </th>
                <th className="px-2 py-1 font-medium text-right">
                  {t("dashboard.maxSpeed")}
                </th>
                <th className="px-2 py-1 font-medium text-center border-l border-border/55">
                  {t("sessions.colFinish")}
                </th>
                <th className="px-2 py-1 font-medium text-center">
                  {t("sessions.colProg")}
                </th>
                <th className="px-2 py-1 font-medium text-left border-l border-border/55">
                  {t("dashboard.ver")}
                </th>
                <th className="px-2 py-1 font-medium text-left">
                  {t("sessions.date")}
                </th>
              </tr>
              {rows.map((l, i) => (
                <DashboardRow key={i} l={l} idx={i} navigate={navigate} t={t} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Fond teinté discret du bloc « Performance ». */
const PERF_CELL = "bg-sky-500/[0.06]";
/** Séparateur vertical entre blocs de colonnes. */
const GROUP_SEP = "border-l border-border/55";

function sectorCell(value: number | null, abs: number | null) {
  const isBest =
    value != null && abs != null && Math.abs(value - abs) < 0.001;
  return (
    <td
      className={cn(
        "px-2 py-1 text-right font-mono",
        PERF_CELL,
        isBest && "text-yellow-500 font-semibold"
      )}
    >
      {value != null ? `${formatSectorSeconds(value)}s` : "—"}
    </td>
  );
}

function DashboardRow({
  l,
  idx,
  navigate,
  t,
}: {
  l: BestLapRow;
  idx: number;
  navigate: (to: string) => void;
  t: (k: string) => string;
}) {
  const isRace = l.session_type === "Race";
  return (
    <tr
      className={cn(
        "border-b border-border/50 hover:bg-muted/40",
        idx % 2 === 1 && "bg-muted/25"
      )}
    >
      {/* Détails */}
      <td className="px-2 py-1 text-center">
        <button
          onClick={() => navigate(`/sessions/${l.session_id}`)}
          className="text-primary hover:opacity-70"
          title={t("dashboard.details")}
        >
          <Eye className="h-3.5 w-3.5 inline" />
        </button>
      </td>
      {/* Records */}
      <td className="px-2 py-1 text-center">
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
          className="text-success hover:opacity-70"
          title={t("sessions.colRecords")}
        >
          <BarChart3 className="h-3.5 w-3.5 inline" />
        </button>
      </td>
      {/* Type */}
      <td className={cn("px-2 py-1 whitespace-nowrap", GROUP_SEP)}>
        {settingLabel(l.setting, t)}
      </td>
      {/* Session */}
      <td className="px-2 py-1">
        <SessionBadge type={l.session_type} />
      </td>
      {/* Classe */}
      <td className="px-2 py-1">
        <ClassBadge carClass={l.car_class} size="sm" />
      </td>
      {/* Logo + voiture */}
      <td className="px-1 py-1 w-7">
        <CarLogo
          carName={l.car}
          className="h-3.5 w-auto object-contain opacity-80"
        />
      </td>
      <td className="px-2 py-1 font-medium whitespace-nowrap">{l.car}</td>
      {/* Livrée */}
      <td className="px-2 py-1 text-muted-foreground whitespace-nowrap max-w-[150px] truncate">
        {l.livery || "—"}
      </td>
      {/* Best lap */}
      <td
        className={cn(
          "px-2 py-1 text-right font-mono font-semibold text-success",
          GROUP_SEP,
          PERF_CELL
        )}
      >
        {formatTime(l.best_lap)}
      </td>
      {/* S1 / S2 / S3 */}
      {sectorCell(l.best_lap_s1, l.abs_best_s1)}
      {sectorCell(l.best_lap_s2, l.abs_best_s2)}
      {sectorCell(l.best_lap_s3, l.abs_best_s3)}
      {/* Optimal */}
      <td className={cn("px-2 py-1 text-right font-mono text-purple", PERF_CELL)}>
        {formatTime(l.optimal_lap)}
        {l.best_lap != null && l.optimal_lap != null && l.best_lap - l.optimal_lap > 0.001 && (
          <div className="text-[9px] text-emerald-500 font-semibold">(-{(l.best_lap - l.optimal_lap).toFixed(3)}s)</div>
        )}
      </td>
      {/* Vmax */}
      <td className="px-2 py-1 text-right font-mono text-muted-foreground whitespace-nowrap">
        {l.vmax != null ? `${l.vmax.toFixed(2)}` : "—"}
      </td>
      {/* Position arrivée */}
      <td className={cn("px-2 py-1 text-center font-mono", GROUP_SEP)}>
        {!isRace ? (
          <span className="text-muted-foreground">N/A</span>
        ) : l.finish_status === "Driver Swap" ? (
          <span className="text-blue-400 italic text-[11px]">Relais</span>
        ) : l.finish_status && l.finish_status !== "Finished Normally" ? (
          <span className="text-destructive italic text-[11px]">
            {l.finish_status}
          </span>
        ) : (
          `P${l.class_position}`
        )}
      </td>
      {/* Progression */}
      <td className="px-2 py-1 text-center font-mono">
        {!isRace || l.progression == null ? (
          <span className="text-muted-foreground">N/A</span>
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
      </td>
      {/* Version */}
      <td className={cn("px-2 py-1 text-muted-foreground whitespace-nowrap font-mono text-[10px]", GROUP_SEP)}>
        {l.game_version || "\u2014"}
      </td>
      {/* Date */}
      <td className="px-2 py-1 text-muted-foreground whitespace-nowrap">
        {formatDateTime(l.timestamp)}
      </td>
    </tr>
  );
}
