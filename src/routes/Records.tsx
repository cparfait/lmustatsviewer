import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableTitle } from "@/components/TableTitle";
import { TrackFlag } from "@/components/TrackFlag";
import { CarLogo } from "@/components/CarLogo";
import { ClassBadge } from "@/components/ClassBadge";
import { SessionBadge } from "@/components/SessionBadge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend as ChartLegend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import {
  ArrowLeft,
  Loader2,
  Trophy,
  Search,
  BarChart3,
  TrendingDown,
  ExternalLink,
} from "lucide-react";
import {
  cn,
  formatTime,
  formatSectorSeconds,
  formatDateTime,
  formatDateShort,
} from "@/lib/utils";
import { records as recordsApi } from "@/lib/api";
import type { RecordOverviewRow, RecordProgression } from "@/lib/api";
import { useAppStore } from "@/stores/app";
import {
  fetchBenchmarks,
  findBenchmark,
  computeTier,
  TIER_LABELS,
  TIER_COLORS,
  OHNE_CLASS,
  type PaceBenchmark,
} from "@/lib/ohne_speed";
import { TierBadge } from "@/components/TierBadge";

interface Combo {
  track: string;
  trackCourse: string;
  car: string;
  carClass: string;
  recordSessionId?: number; // session du meilleur temps actuel
}

// ── Composant racine ─────────────────────────────────────────────────────────

export function Records() {
  // Combo éventuellement transmis par l'icône Records des tableaux
  // (Dashboard / Sessions) via `?track=&course=&class=&car=`.
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<RecordOverviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filtre de version global (partagé avec Sessions / Dashboard).
  const { selectedVersion, setSelectedVersion, versionExact, setVersionExact, gameVersions } =
    useAppStore((s) => ({
      selectedVersion: s.selectedVersion,
      setSelectedVersion: s.setSelectedVersion,
      versionExact: s.versionExact,
      setVersionExact: s.setVersionExact,
      gameVersions: s.gameVersions,
    }));

  // Sélection initiale provenant d'un deep link (Dashboard / Sessions) → on
  // garde l'info pour que le bouton « retour » revienne à la page d'origine
  // (`navigate(-1)`) plutôt que sur l'Overview interne — la liste des records
  // est désormais portée par le Dashboard.
  const initialFromUrl = (() => {
    const track = params.get("track");
    const car = params.get("car");
    if (track && car) {
      return {
        track,
        trackCourse: params.get("course") ?? "",
        car,
        carClass: params.get("class") ?? "",
      } as Combo;
    }
    return null;
  })();
  const [selected, setSelected] = useState<Combo | null>(initialFromUrl);
  const [openedFromUrl, setOpenedFromUrl] = useState<boolean>(
    initialFromUrl !== null
  );

  const handleBack = () => {
    if (openedFromUrl) {
      navigate(-1);
      return;
    }
    setSelected(null);
  };
  const handleSelect = (combo: Combo) => {
    setOpenedFromUrl(false);
    setSelected(combo);
  };
  // Référentiel communautaire ohne_speed (chargé une fois, best-effort).
  const [benchmarks, setBenchmarks] = useState<PaceBenchmark[] | null>(null);

  // Rechargement de l'overview quand le filtre de version change.
  useEffect(() => {
    setOverview(null);
    setError(null);
    recordsApi
      .getOverview(selectedVersion, selectedVersion ? versionExact : false)
      .then(setOverview)
      .catch((e) => setError(String(e)));
  }, [selectedVersion, versionExact]);

  useEffect(() => {
    fetchBenchmarks()
      .then(setBenchmarks)
      .catch(() => setBenchmarks([])); // hors-ligne → pas de tiers
  }, []);

  if (error) {
    return <p className="text-muted-foreground py-10 text-center">{error}</p>;
  }
  if (!overview) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (selected) {
    return (
      <Progression
        combo={selected}
        benchmarks={benchmarks}
        onBack={handleBack}
      />
    );
  }

  return (
    <Overview
      rows={overview}
      benchmarks={benchmarks}
      onSelect={handleSelect}
      selectedVersion={selectedVersion}
      setSelectedVersion={setSelectedVersion}
      versionExact={versionExact}
      setVersionExact={setVersionExact}
      gameVersions={gameVersions}
    />
  );
}

// ── Vue d'ensemble ───────────────────────────────────────────────────────────

function Overview({
  rows,
  benchmarks,
  onSelect,
  selectedVersion,
  setSelectedVersion,
  versionExact,
  setVersionExact,
  gameVersions,
}: {
  rows: RecordOverviewRow[];
  benchmarks: PaceBenchmark[] | null;
  onSelect: (c: Combo) => void;
  selectedVersion: string | null;
  setSelectedVersion: (v: string | null) => void;
  versionExact: boolean;
  setVersionExact: (v: boolean) => void;
  gameVersions: string[];
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("");

  const classes = useMemo(
    () => [...new Set(rows.map((r) => r.car_class))].sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (classFilter && r.car_class !== classFilter) return false;
      if (!q) return true;
      return (
        r.track.toLowerCase().includes(q) ||
        r.track_course.toLowerCase().includes(q) ||
        r.car.toLowerCase().includes(q)
      );
    });
  }, [rows, query, classFilter]);

  const groups = useMemo(() => {
    const map = new Map<string, RecordOverviewRow[]>();
    for (const r of filtered) {
      if (!map.has(r.track)) map.set(r.track, []);
      map.get(r.track)!.push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("records.mvTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("records.mvDesc")}</p>
      </div>

      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("records.mvSearch")}
              className="pl-8"
            />
          </div>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{t("records.mvAllClasses")}</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {gameVersions.length > 0 && (
            <select
              value={selectedVersion ?? ""}
              onChange={(e) => setSelectedVersion(e.target.value || null)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">{t("header.allVersions")}</option>
              {gameVersions.map((v) => (
                <option key={v} value={v}>
                  {versionExact ? "=" : "≥"} {v}
                </option>
              ))}
            </select>
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
        </CardContent>
      </Card>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("records.mvEmpty")}
          </CardContent>
        </Card>
      ) : (
        groups.map(([track, list]) => (
          <Card key={track} className="overflow-hidden">
            <TableTitle
              title={
                <span className="inline-flex items-center gap-2">
                  <TrackFlag
                    track={track}
                    className="h-4 w-auto rounded-[2px]"
                  />
                  {track}
                  <span className="text-muted-foreground font-normal text-xs">
                    ({list.length})
                  </span>
                </span>
              }
            />
            <CardContent className="p-0 overflow-x-auto">
              <Table className="text-xs [&_tbody_td:nth-child(n+4):nth-child(-n+9)]:bg-sky-500/[0.06] [&_tbody_td:nth-child(4)]:border-l [&_tbody_td:nth-child(4)]:border-border/55 [&_tbody_td:nth-child(10)]:border-l [&_tbody_td:nth-child(10)]:border-border/55">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("records.hTrack")}</TableHead>
                    <TableHead>{t("records.hCar")}</TableHead>
                    <TableHead>{t("records.hClass")}</TableHead>
                    <TableHead className="text-right border-l border-border/55 bg-sky-500/10">
                      {t("records.hBestLap")}
                    </TableHead>
                    <TableHead className="text-right bg-sky-500/10">S1</TableHead>
                    <TableHead className="text-right bg-sky-500/10">S2</TableHead>
                    <TableHead className="text-right bg-sky-500/10">S3</TableHead>
                    <TableHead className="text-right bg-sky-500/10">
                      {t("records.hOptimal")}
                    </TableHead>
                    <TableHead className="text-right bg-sky-500/10">
                      {t("records.hVmax")} (km/h)
                    </TableHead>
                    <TableHead className="border-l border-border/55">
                      {t("records.hLevel")}
                    </TableHead>
                    <TableHead className="text-center">
                      {t("records.hSessions")}
                    </TableHead>
                    <TableHead className="text-center">
                      {t("records.hImprovements")}
                    </TableHead>
                    <TableHead>{t("records.hDate")}</TableHead>
                    <TableHead>{t("records.hVersion")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((r, i) => (
                    <TableRow
                      key={`${r.track_course}|${r.car}|${r.car_class}`}
                      className={cn(
                        "cursor-pointer hover:bg-accent/50",
                        i % 2 === 1 && "bg-muted/20"
                      )}
                      onClick={() =>
                        onSelect({
                          track: r.track,
                          trackCourse: r.track_course,
                          car: r.car,
                          carClass: r.car_class,
                          recordSessionId: r.record_session_id,
                        })
                      }
                    >
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {r.track_course && r.track_course !== r.track
                          ? r.track_course
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <CarLogo
                            carName={r.car_type}
                            className="h-3.5 w-auto object-contain opacity-80"
                          />
                          <span className="whitespace-nowrap">{r.car}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ClassBadge carClass={r.car_class} size="sm" />
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-success">
                        {formatTime(r.best_lap)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatSectorSeconds(r.best_lap_s1)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatSectorSeconds(r.best_lap_s2)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatSectorSeconds(r.best_lap_s3)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-purple">
                        {formatTime(r.optimal_lap)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {r.vmax != null ? r.vmax.toFixed(2) : "—"}
                      </TableCell>
                      <TableCell>
                        <TierBadge
                          benchmarks={benchmarks}
                          track={r.track}
                          layout={r.track_course}
                          carClass={r.car_class}
                          lapSeconds={r.best_lap}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <button
                          className="font-mono tabular-nums hover:text-primary hover:underline underline-offset-2 transition-colors"
                          title={t("records.viewSessions")}
                          onClick={(e) => {
                            e.stopPropagation();
                            const q = new URLSearchParams({
                              track: r.track,
                              ...(r.track_course && r.track_course !== r.track
                                ? { course: r.track_course }
                                : {}),
                              car: r.car,
                            });
                            navigate(`/sessions?${q}`);
                          }}
                        >
                          {r.sessions_count}
                        </button>
                      </TableCell>
                      <TableCell className="text-center">
                        {r.improvements}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateShort(r.record_date)}
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">
                        {r.game_version}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// ── Vue progression ──────────────────────────────────────────────────────────

function Progression({
  combo,
  benchmarks,
  onBack,
}: {
  combo: Combo;
  benchmarks: PaceBenchmark[] | null;
  onBack: () => void;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [data, setData] = useState<RecordProgression | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showPbLine, setShowPbLine] = useState(true);
  const [showSectors, setShowSectors] = useState(false);
  const [showClass, setShowClass] = useState(false);
  const [showOhne, setShowOhne] = useState(false);

  useEffect(() => {
    setData(null);
    setError(null);
    recordsApi
      .getProgression({
        track: combo.track,
        car: combo.car,
        track_course: combo.trackCourse || undefined,
        car_class: combo.carClass || undefined,
      })
      .then(setData)
      .catch((e) => setError(String(e)));
  }, [combo]);

  const bm = useMemo(() => {
    if (!benchmarks || benchmarks.length === 0) return null;
    const ohneClass = OHNE_CLASS[combo.carClass];
    if (!ohneClass) return null;
    return findBenchmark(benchmarks, combo.track, ohneClass, combo.trackCourse);
  }, [benchmarks, combo]);

  const chartData = useMemo(
    () =>
      (data?.points ?? []).map((p, i) => ({
        i,
        date: formatDateShort(p.timestamp),
        best: Number(p.best_lap.toFixed(3)),
        pb: Number(p.pb_at_point.toFixed(3)),
        s1: p.s1,
        s2: p.s2,
        s3: p.s3,
        classBest: p.class_best,
        isPb: p.is_pb,
      })),
    [data]
  );

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <Button variant="outline" size="sm" onClick={onBack} className="w-fit">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> {t("records.back")}
        </Button>
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const { stats, points } = data;
  const tierInfo =
    bm && stats.all_time_pb > 0
      ? computeTier(stats.all_time_pb * 1000, bm)
      : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> {t("records.pBack")}
        </Button>
        <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
          <TrackFlag track={combo.track} className="h-5 w-auto rounded-[2px]" />
          {combo.track}
          {combo.trackCourse && combo.trackCourse !== combo.track && (
            <span className="text-muted-foreground font-normal text-lg">
              — {combo.trackCourse}
            </span>
          )}
        </h1>
        <span className="inline-flex items-center gap-1.5">
          <CarLogo
            carName={points[0]?.car_type ?? ""}
            className="h-4 w-auto object-contain opacity-80 shrink-0"
          />
          <span className="font-medium">{combo.car}</span>
          <ClassBadge carClass={combo.carClass} size="sm" />
        </span>
        {combo.recordSessionId && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto gap-1.5 text-muted-foreground hover:text-primary text-xs"
            onClick={() => navigate(`/sessions/${combo.recordSessionId}`)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("records.goToSession")}
          </Button>
        )}
      </div>

      {/* Cartes stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          label={t("records.sBestLap")}
          value={formatTime(stats.all_time_pb)}
          accent
        />
        <StatCard
          label={t("records.sTotalGain")}
          value={
            stats.total_gain != null
              ? `−${formatSectorSeconds(stats.total_gain)}s`
              : "—"
          }
        />
        <StatCard
          label={t("records.sRecordsBeaten")}
          value={String(stats.nb_pb)}
        />
        <StatCard
          label={t("records.sOptimal")}
          value={formatTime(stats.optimal)}
        />
        <StatCard
          label={`${t("records.sVmax")} (km/h)`}
          value={stats.vmax != null ? stats.vmax.toFixed(2) : "—"}
        />
        <StatCard
          label={t("records.sLastRecord")}
          value={
            stats.days_since_pb == null
              ? "—"
              : stats.days_since_pb === 0
                ? t("records.today")
                : stats.days_since_pb === 1
                  ? t("records.yesterday")
                  : t("records.daysAgo", { count: stats.days_since_pb })
          }
        />
      </div>

      {/* Niveau communautaire ohne_speed */}
      {tierInfo && bm && (
        <Card>
          <CardContent className="p-4 flex items-center gap-4 flex-wrap">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("records.tierTitle")}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold",
                TIER_COLORS[tierInfo.tier]
              )}
            >
              {TIER_LABELS[tierInfo.tier]}
            </span>
            <span className="text-sm text-muted-foreground">
              {t("records.tierDetail", {
                percent: tierInfo.percent.toFixed(1),
                delta:
                  (tierInfo.deltaMs >= 0 ? "+" : "") +
                  (tierInfo.deltaMs / 1000).toFixed(3),
              })}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Graphe de progression */}
      {points.length > 1 ? (
        <Card className="overflow-hidden">
          <TableTitle
            title={
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="inline-flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> {t("records.progTitle")}
                </span>
                <div className="flex items-center gap-3 text-mini font-normal">
                  <ChartToggle
                    label={t("records.togRecordLine")}
                    checked={showPbLine}
                    onChange={setShowPbLine}
                  />
                  <ChartToggle
                    label={t("records.togSectors")}
                    checked={showSectors}
                    onChange={setShowSectors}
                  />
                  <ChartToggle
                    label={t("records.togClassBest")}
                    checked={showClass}
                    onChange={setShowClass}
                  />
                  {bm && (
                    <ChartToggle
                      label={t("records.togOhne")}
                      checked={showOhne}
                      onChange={setShowOhne}
                    />
                  )}
                </div>
              </div>
            }
          />
          <CardContent className="p-4">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis
                  yAxisId="lap"
                  tick={{ fontSize: 11 }}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => formatTime(v)}
                  width={62}
                />
                {showSectors && (
                  <YAxis
                    yAxisId="sec"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    domain={["auto", "auto"]}
                    tickFormatter={(v: number) => v.toFixed(1)}
                    width={44}
                  />
                )}
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                  }}
                  formatter={(v: number, name: string) =>
                    name === "S1" || name === "S2" || name === "S3"
                      ? [`${v.toFixed(3)}s`, name]
                      : [formatTime(v), name]
                  }
                />
                <ChartLegend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  yAxisId="lap"
                  type="monotone"
                  dataKey="best"
                  name={t("records.hBestLap")}
                  stroke="#FFB400"
                  strokeWidth={2}
                  dot={(props: {
                    cx?: number;
                    cy?: number;
                    payload?: { i: number; isPb: boolean };
                  }) => {
                    const { cx, cy, payload } = props;
                    const pb = payload?.isPb;
                    return (
                      <circle
                        key={`d-${payload?.i}`}
                        cx={cx}
                        cy={cy}
                        r={pb ? 4 : 2}
                        fill="#FFB400"
                        stroke={pb ? "#0A0E1A" : "none"}
                        strokeWidth={pb ? 1 : 0}
                      />
                    );
                  }}
                />
                {showPbLine && (
                  <Line
                    yAxisId="lap"
                    type="stepAfter"
                    dataKey="pb"
                    name={t("records.serieRecord")}
                    stroke="#4ade80"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                  />
                )}
                {showClass && (
                  <Line
                    yAxisId="lap"
                    type="monotone"
                    dataKey="classBest"
                    name={t("records.togClassBest")}
                    stroke="#60a5fa"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                )}
                {showSectors && (
                  <>
                    <Line
                      yAxisId="sec"
                      type="monotone"
                      dataKey="s1"
                      name="S1"
                      stroke="#c084fc"
                      strokeWidth={1}
                      dot={false}
                      connectNulls
                    />
                    <Line
                      yAxisId="sec"
                      type="monotone"
                      dataKey="s2"
                      name="S2"
                      stroke="#e57373"
                      strokeWidth={1}
                      dot={false}
                      connectNulls
                    />
                    <Line
                      yAxisId="sec"
                      type="monotone"
                      dataKey="s3"
                      name="S3"
                      stroke="#48c774"
                      strokeWidth={1}
                      dot={false}
                      connectNulls
                    />
                  </>
                )}
                {showOhne && bm && (
                  <>
                    <ReferenceLine
                      yAxisId="lap"
                      y={bm.racePaceMs.alien / 1000}
                      stroke="#a855f7"
                      strokeDasharray="2 2"
                      label={{
                        value: t("records.refAlien"),
                        fontSize: 10,
                        fill: "#a855f7",
                        position: "insideTopRight",
                      }}
                    />
                    <ReferenceLine
                      yAxisId="lap"
                      y={bm.racePaceMs.good / 1000}
                      stroke="#48c774"
                      strokeDasharray="2 2"
                      label={{
                        value: t("records.refGood"),
                        fontSize: 10,
                        fill: "#48c774",
                        position: "insideTopRight",
                      }}
                    />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            {t("records.singleSession")}
          </CardContent>
        </Card>
      )}

      {/* Historique des sessions */}
      <Card className="overflow-hidden">
        <TableTitle title={t("records.historyTitle")} />
        <CardContent className="p-0 overflow-x-auto">
          <Table className="text-xs [&_tbody_td:nth-child(n+4):nth-child(-n+8)]:bg-sky-500/[0.06] [&_tbody_td:nth-child(4)]:border-l [&_tbody_td:nth-child(4)]:border-border/55 [&_tbody_td:nth-child(9)]:border-l [&_tbody_td:nth-child(9)]:border-border/55">
            <TableHeader>
              <TableRow>
                <TableHead>{t("records.hDate")}</TableHead>
                <TableHead>{t("records.hSession")}</TableHead>
                <TableHead>{t("records.hType")}</TableHead>
                <TableHead className="text-right border-l border-border/55 bg-sky-500/10">
                  {t("records.hBestLap")}
                </TableHead>
                <TableHead className="text-right bg-sky-500/10">S1</TableHead>
                <TableHead className="text-right bg-sky-500/10">S2</TableHead>
                <TableHead className="text-right bg-sky-500/10">S3</TableHead>
                <TableHead className="text-right bg-sky-500/10">
                  {t("records.hOptimal")}
                </TableHead>
                <TableHead className="text-center border-l border-border/55">
                  {t("records.hRecordCol")}
                </TableHead>
                <TableHead className="text-right">
                  {t("records.hRecordAt")}
                </TableHead>
                <TableHead className="text-right">
                  {t("records.hProgress")}
                </TableHead>
                <TableHead>{t("records.hVersion")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...points].reverse().map((p, i) => (
                <TableRow
                  key={p.session_id}
                  className={cn(
                    "cursor-pointer hover:bg-accent/50",
                    p.is_pb
                      ? "bg-success/10"
                      : i % 2 === 1 && "bg-muted/20"
                  )}
                  onClick={() => navigate(`/sessions/${p.session_id}`)}
                >
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(p.timestamp)}
                  </TableCell>
                  <TableCell>
                    <SessionBadge type={p.session_type} />
                  </TableCell>
                  <TableCell>
                    {p.setting === "Multiplayer"
                      ? t("records.online")
                      : t("records.weekend")}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono",
                      p.is_pb && "text-success font-semibold"
                    )}
                  >
                    {formatTime(p.best_lap)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatSectorSeconds(p.s1)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatSectorSeconds(p.s2)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatSectorSeconds(p.s3)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-purple">
                    {formatTime(p.optimal_lap)}
                  </TableCell>
                  <TableCell className="text-center">
                    {p.is_pb && (
                      <Trophy className="h-3.5 w-3.5 text-yellow-500 inline" />
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {formatTime(p.pb_at_point)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-success">
                    {p.gain != null ? (
                      <span className="inline-flex items-center gap-0.5 justify-end">
                        <TrendingDown className="h-3 w-3" />−
                        {formatSectorSeconds(p.gain)}s
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {p.game_version}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-micro uppercase tracking-wide text-muted-foreground font-medium">
          {label}
        </p>
        <p
          className={cn(
            "mt-0.5 font-mono font-bold text-lg",
            accent && "text-success"
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function ChartToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 cursor-pointer text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-primary"
      />
      {label}
    </label>
  );
}
