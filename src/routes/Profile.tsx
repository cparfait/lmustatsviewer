import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from "recharts";
import {
  ChevronRight,
  Clock,
  Activity,
  Medal,
  Repeat,
  Flag,
  Trophy,
  Timer,
  Layers,
  Car,
  MapPin,
  Target,
  TrendingUp,
  Route,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAppStore } from "@/stores/app";
import { queries, records } from "@/lib/api";
import { formatTime, chartTooltipStyle, cn } from "@/lib/utils";
import { ClassBadge } from "@/components/ClassBadge";
import { classChartColor } from "@/lib/staticData";
import { CarLogo } from "@/components/CarLogo";
import { TrackFlag } from "@/components/TrackFlag";
import { ProfileActivity } from "@/components/ProfileActivity";
import type {
  RaceActivityRow,
  RecordOverviewRow,
  SessionsOverview,
} from "@/lib/api";

interface ProfileStats {
  totalSessions: number;
  races: number;
  practices: number;
  qualifs: number;
  totalLaps: number;          // tous tours (valides + invalides)
  totalLapsValid: number;     // is_valid = 1
  totalLapsInvalid: number;   // is_valid = 0
  drivingHours: number;
  distanceKm: number;
  wins: number;
  podiums: number;
  top10: number;
  bestFinish: number | null;
  bestProgression: number | null;
  tracksVisited: number;
  carsUsed: number;
  favoriteTrack: string | null;
  favoriteCar: string | null;
}

// Ordre des classes V1 (cf. SUIVI §3.6) — constante stable (hors composant).
const CLASS_ORDER = [
  "Hypercar",
  "Hyper",
  "LMP2 ELMS",
  "LMP2_ELMS",
  "LMP2 WEC",
  "LMP2_WEC",
  "LMP2",
  "LMP3",
  "GT3",
  "GTE",
];

export function Profile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const playerName = useAppStore((s) => s.playerName);
  const dashboardStats = useAppStore((s) => s.dashboardStats);
  const [sessionsOverview, setSessionsOverview] = useState<SessionsOverview | null>(null);
  const [recordOverview, setRecordOverview] = useState<RecordOverviewRow[]>([]);
  const [raceActivity, setRaceActivity] = useState<RaceActivityRow[]>([]);

  useEffect(() => {
    queries.getSessionsOverview().then(setSessionsOverview).catch(() => {});
    records.getOverview().then(setRecordOverview).catch(() => {});
    queries.getRaceActivity().then(setRaceActivity).catch(() => {});
  }, []);

  const stats = useMemo<ProfileStats>(() => {
    const ds = dashboardStats;
    const so = sessionsOverview;
    return {
      totalSessions: ds?.total_sessions ?? 0,
      races: so?.races ?? 0,
      practices: so?.practices ?? 0,
      qualifs: so?.qualifs ?? 0,
      totalLaps: ds?.total_laps ?? 0,
      totalLapsValid: ds?.total_laps_valid ?? 0,
      totalLapsInvalid: ds?.total_laps_invalid ?? 0,
      drivingHours: ds?.total_driving_hours ?? 0,
      distanceKm: ds?.total_distance_km ?? 0,
      wins: ds?.wins ?? 0,
      podiums: ds?.podiums ?? 0,
      top10: ds?.top10 ?? 0,
      bestFinish: ds?.best_finish ?? null,
      bestProgression: ds?.best_progression ?? null,
      tracksVisited: so?.tracks ?? 0,
      carsUsed: so?.cars ?? 0,
      favoriteTrack: ds?.favorite_track ?? null,
      favoriteCar: ds?.favorite_car ?? null,
    };
  }, [dashboardStats, sessionsOverview]);

  const bestByTrack = useMemo(() => {
    const map = new Map<string, RecordOverviewRow>();
    for (const r of recordOverview) {
      const key = `${r.track_course}|${r.car}`;
      const existing = map.get(key);
      if (!existing || r.best_lap < existing.best_lap) {
        map.set(key, r);
      }
    }
    const unique = new Map<string, RecordOverviewRow>();
    for (const r of map.values()) {
      const existing = unique.get(r.track_course);
      if (!existing || r.best_lap < existing.best_lap) {
        unique.set(r.track_course, r);
      }
    }
    return Array.from(unique.values()).sort((a, b) =>
      a.track_course.localeCompare(b.track_course)
    );
  }, [recordOverview]);

  const carsStats = useMemo(() => {
    const map = new Map<
      string,
      { car: string; carClass: string; sessions: number; tracks: Set<string> }
    >();
    for (const r of recordOverview) {
      const existing = map.get(r.car);
      if (existing) {
        existing.sessions += r.sessions_count;
        existing.tracks.add(r.track_course);
      } else {
        map.set(r.car, {
          car: r.car,
          carClass: r.car_class,
          sessions: r.sessions_count,
          tracks: new Set([r.track_course]),
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.sessions - a.sessions);
  }, [recordOverview]);

  // Voiture la plus utilisée pour chaque classe présente (par nombre de sessions).
  // Tri suivant l'ordre des classes V1 (cf. SUIVI §3.6, constante `CLASS_ORDER`).
  // Toutes les voitures groupées par classe, triées sessions desc dans chaque
  // classe. Le rendu affiche par défaut les 3 premières et un toggle dévoile
  // le reste du classement.
  const carsByClass = useMemo(() => {
    const byClass = new Map<
      string,
      { car: string; sessions: number }[]
    >();
    for (const c of carsStats) {
      const list = byClass.get(c.carClass) ?? [];
      list.push({ car: c.car, sessions: c.sessions });
      byClass.set(c.carClass, list);
    }
    return Array.from(byClass.entries())
      .map(([carClass, cars]) => ({
        carClass,
        cars: cars.sort((a, b) => b.sessions - a.sessions),
      }))
      .sort((a, b) => {
        const ia = CLASS_ORDER.indexOf(a.carClass);
        const ib = CLASS_ORDER.indexOf(b.carClass);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
  }, [carsStats]);

  // Tous les circuits, cumul des sessions toutes voitures confondues, triés desc.
  const allTracks = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of recordOverview) {
      map.set(
        r.track_course,
        (map.get(r.track_course) ?? 0) + r.sessions_count
      );
    }
    return Array.from(map.entries())
      .map(([track, sessions]) => ({ track, sessions }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [recordOverview]);

  const [expandCars, setExpandCars] = useState(false);
  const [expandTracks, setExpandTracks] = useState(false);
  const [expandCarChart, setExpandCarChart] = useState(false);

  const carsChartData = useMemo(() => {
    return carsStats.map((c) => ({
      // Étiquette tronquée pour l'axe Y, mais on garde le `car` complet
      // pour la navigation et le tooltip.
      short: c.car.length > 24 ? c.car.slice(0, 23) + "…" : c.car,
      car: c.car,
      carClass: c.carClass,
      sessions: c.sessions,
    }));
  }, [carsStats]);

  const classPieData = useMemo(() => {
    const totals = new Map<string, number>();
    for (const c of carsStats) {
      totals.set(c.carClass, (totals.get(c.carClass) ?? 0) + c.sessions);
    }
    return Array.from(totals.entries())
      .map(([name, value]) => ({
        name,
        value,
        fill: classChartColor(name, "var(--color-chart-1)"),
      }))
      .sort((a, b) => b.value - a.value);
  }, [carsStats]);

  const initial = playerName ? playerName.charAt(0).toUpperCase() : "?";

  const displayName = playerName || t("profile.unknownDriver");

  return (
    <div className="flex flex-col gap-6">
      <ProfileHero
        displayName={displayName}
        initial={initial}
        stats={stats}
      />

      <ProfileActivity races={raceActivity} />

      {carsByClass.length > 0 && (
        <section>
          <div className="bg-primary text-primary-foreground rounded-md mb-1.5 px-4 py-1 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold tracking-tight">
              {t("profile.topByClass")}
            </h2>
            <button
              type="button"
              onClick={() => setExpandCars((v) => !v)}
              className="text-mini font-bold uppercase tracking-wider hover:opacity-80 transition-opacity"
            >
              {expandCars ? t("profile.collapseAll") : t("profile.expandAll")}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {carsByClass.map((group) => {
              const visible = expandCars ? group.cars : group.cars.slice(0, 3);
              const hidden = group.cars.length - visible.length;
              return (
                <Card key={group.carClass} className="overflow-hidden">
                  <div className="px-3 py-2 border-b border-border/40 bg-muted/30 flex items-center justify-between">
                    <ClassBadge carClass={group.carClass} size="sm" />
                    <span className="text-micro text-muted-foreground font-mono">
                      {group.cars.length} {t("profile.cars")}
                    </span>
                  </div>
                  <ol className="divide-y divide-border/40">
                    {visible.map((c, i) => (
                      <li key={c.car}>
                        <Link
                          to={`/sessions?car=${encodeURIComponent(c.car)}&class=${encodeURIComponent(group.carClass)}`}
                          className="flex items-center gap-2.5 px-3 py-2 hover:bg-accent/40 transition-colors"
                          title={t("profile.viewSessionsForCar", { car: c.car })}
                        >
                          <span
                            className={cn(
                              "text-micro font-mono font-bold w-4 text-center shrink-0",
                              i === 0
                                ? "text-amber-500"
                                : "text-muted-foreground"
                            )}
                          >
                            {i + 1}
                          </span>
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                            <CarLogo carName={c.car} className="h-5 w-auto" />
                          </div>
                          <span
                            className="text-xs font-medium truncate flex-1"
                            title={c.car}
                          >
                            {c.car}
                          </span>
                          <span className="text-micro text-muted-foreground font-mono tabular-nums shrink-0">
                            {t("profile.sessionsCount", { count: c.sessions })}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                  {!expandCars && hidden > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpandCars(true)}
                      className="w-full px-3 py-1.5 text-micro font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors border-t border-border/40"
                    >
                      +{hidden} {t("profile.more")}
                    </button>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Graphiques résumé sous la grille des classes */}
          {carsStats.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
              {/* Graphique voitures — top 10 par défaut, expandable */}
              {(() => {
                const CHART_LIMIT = 10;
                const displayedData = expandCarChart
                  ? carsChartData
                  : carsChartData.slice(0, CHART_LIMIT);
                const hasMore = carsChartData.length > CHART_LIMIT;
                // 26px par barre, minimum 200px
                const chartH = Math.max(200, displayedData.length * 26);
                return (
                  <Card className="overflow-hidden">
                    <CardContent className="pt-3 px-2 pb-2">
                      <div style={{ height: chartH }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={displayedData}
                            layout="vertical"
                            margin={{ top: 0, right: 36, bottom: 0, left: 0 }}
                          >
                            <XAxis type="number" hide />
                            <YAxis
                              type="category"
                              dataKey="short"
                              width={155}
                              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip {...chartTooltipStyle} />
                            <Bar
                              dataKey="sessions"
                              radius={[0, 4, 4, 0]}
                              name={t("profile.sessions")}
                              cursor="pointer"
                              onClick={(d: { car?: string; carClass?: string }) => {
                                if (!d?.car) return;
                                navigate(
                                  `/sessions?car=${encodeURIComponent(d.car)}` +
                                    (d.carClass
                                      ? `&class=${encodeURIComponent(d.carClass)}`
                                      : "")
                                );
                              }}
                            >
                              {displayedData.map((entry, idx) => (
                                <Cell
                                  key={idx}
                                  fill={classChartColor(entry.carClass)}
                                  fillOpacity={0.65}
                                  stroke={classChartColor(entry.carClass)}
                                  strokeOpacity={0.85}
                                  strokeWidth={1}
                                />
                              ))}
                              <LabelList
                                dataKey="sessions"
                                position="right"
                                className="fill-foreground"
                                fontSize={11}
                                fontWeight={600}
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      {hasMore && (
                        <button
                          type="button"
                          onClick={() => setExpandCarChart((v) => !v)}
                          className="w-full mt-1 py-1 text-micro font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors rounded"
                        >
                          {expandCarChart
                            ? t("profile.collapseAll")
                            : `+${carsChartData.length - CHART_LIMIT} ${t("profile.more")}`}
                        </button>
                      )}
                    </CardContent>
                  </Card>
                );
              })()}

              {classPieData.length > 1 && (
                <Card className="overflow-hidden">
                  <CardContent className="pt-3 pb-2">
                    <h3 className="text-micro uppercase tracking-wider text-muted-foreground text-center mb-2">
                      {t("profile.classDistribution")}
                    </h3>
                    <div className="h-[210px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={classPieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={3}
                            dataKey="value"
                            stroke="none"
                            cursor="pointer"
                            onClick={(d: { name?: string }) => {
                              if (!d?.name) return;
                              navigate(
                                `/sessions?class=${encodeURIComponent(d.name)}`
                              );
                            }}
                          >
                            {classPieData.map((d) => (
                              <Cell
                                key={d.name}
                                fill={d.fill}
                                fillOpacity={0.65}
                                stroke={d.fill}
                                strokeOpacity={0.85}
                                strokeWidth={1.5}
                              />
                            ))}
                          </Pie>
                          <Tooltip {...chartTooltipStyle} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-1">
                      {classPieData.map((d) => (
                        <span key={d.name} className="flex items-center gap-1.5 text-micro text-muted-foreground">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
                          {d.name}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </section>
      )}

      {allTracks.length > 0 && (
        <section>
          <div className="bg-primary text-primary-foreground rounded-md mb-1.5 px-4 py-1 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold tracking-tight">
              {t("profile.topCircuits")}
            </h2>
            {allTracks.length > 3 && (
              <button
                type="button"
                onClick={() => setExpandTracks((v) => !v)}
                className="text-mini font-bold uppercase tracking-wider hover:opacity-80 transition-opacity"
              >
                {expandTracks ? t("profile.collapseAll") : t("profile.expandAll")}
              </button>
            )}
          </div>
          <Card className="overflow-hidden">
            <ol className="divide-y divide-border/40">
              {(expandTracks ? allTracks : allTracks.slice(0, 3)).map((t2, i) => (
                <li key={t2.track}>
                  <Link
                    to={`/sessions?course=${encodeURIComponent(t2.track)}`}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-accent/40 transition-colors"
                    title={t("profile.viewSessionsForTrack", { track: t2.track })}
                  >
                    <span
                      className={cn(
                        "text-xs font-mono font-bold w-5 text-center shrink-0",
                        i === 0
                          ? "text-amber-500"
                          : i < 3
                          ? "text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      #{i + 1}
                    </span>
                    <div className="flex h-7 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 overflow-hidden">
                      <TrackFlag
                        track={t2.track}
                        className="h-5 w-auto rounded-[2px]"
                      />
                    </div>
                    <span
                      className="text-sm font-medium truncate flex-1"
                      title={t2.track}
                    >
                      {t2.track}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">
                      {t("profile.sessionsCount", { count: t2.sessions })}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
            {!expandTracks && allTracks.length > 3 && (
              <button
                type="button"
                onClick={() => setExpandTracks(true)}
                className="w-full px-3 py-1.5 text-mini font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors border-t border-border/40"
              >
                +{allTracks.length - 3} {t("profile.more")}
              </button>
            )}
          </Card>
        </section>
      )}

      {bestByTrack.length > 0 && (
        <section>
          <div className="bg-primary text-primary-foreground rounded-md mb-1.5 px-4 py-1">
            <h2 className="text-sm font-bold tracking-tight">
              {t("profile.bestLapsByTrack")}
            </h2>
          </div>
          <Card className="overflow-hidden">
            <div className="divide-y divide-border/40">
              {bestByTrack.map((r) => (
                <Link
                  key={`${r.track_course}-${r.car}`}
                  to={`/records?track=${encodeURIComponent(r.track)}&car=${encodeURIComponent(r.car)}&course=${encodeURIComponent(r.track_course)}&class=${encodeURIComponent(r.car_class)}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40 transition-colors group"
                >
                  <TrackFlag track={r.track_course} className="h-4 w-auto shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {r.track_course}
                      </span>
                      <ClassBadge carClass={r.car_class} />
                    </div>
                    <div className="text-mini text-muted-foreground truncate">
                      {r.car}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono font-semibold text-primary">
                      {formatTime(r.best_lap)}
                    </div>
                    {r.optimal_lap != null && r.optimal_lap > 0 && (
                      <div className="text-micro text-muted-foreground">
                        {t("profile.optimal")}: {formatTime(r.optimal_lap)}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </Link>
              ))}
            </div>
          </Card>
        </section>
      )}

    </div>
  );
}

interface HeroProps {
  displayName: string;
  initial: string;
  stats: ProfileStats;
}

/**
 * En-tête de la page Profil — style Dashboard pilote pro.
 * Bandeau horizontal compact : avatar + nom + 4 stats inline avec
 * séparateurs verticaux, façon HUD de jeu de simu.
 */
function ProfileHero({ displayName, initial, stats }: HeroProps) {
  const heroStats: {
    icon: typeof Clock;
    label: string;
    value: number | string;
    suffix?: string;
    color: string;
    bg: string;
    glow: string;
    sublineMain?: string;
    sublineAccent?: string;
  }[] = [
    {
      icon: Activity,
      label: "Sessions",
      value: stats.totalSessions,
      color: "text-sky-500",
      bg: "bg-sky-500/10 ring-sky-500/20",
      glow: "bg-sky-500/25",
    },
    {
      icon: Clock,
      label: "Temps piste",
      value: stats.drivingHours.toFixed(1),
      suffix: "h",
      color: "text-amber-500",
      bg: "bg-amber-500/10 ring-amber-500/20",
      glow: "bg-amber-500/25",
      sublineMain: "tours chronométrés",
    },
    {
      icon: Repeat,
      label: "Tours",
      value: stats.totalLaps.toLocaleString(),
      color: "text-violet-500",
      bg: "bg-violet-500/10 ring-violet-500/20",
      glow: "bg-violet-500/25",
      sublineMain: `${stats.totalLapsValid.toLocaleString()} valides`,
      sublineAccent: `${stats.totalLapsInvalid.toLocaleString()} non valides`,
    },
    {
      icon: Route,
      label: "Distance",
      value: stats.distanceKm.toLocaleString(undefined, {
        maximumFractionDigits: 0,
      }),
      suffix: "km",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10 ring-emerald-500/20",
      glow: "bg-emerald-500/25",
      sublineMain: "tours valides",
    },
  ];

  // Stats secondaires (plus compactes) : courses / qualifs / essais / top10 /
  // meilleur résultat / meilleure progression / voitures / circuits.
  const secondaryStats: {
    icon: typeof Flag;
    label: string;
    value: string | number;
    accent?: string;
  }[] = [
    { icon: Flag, label: "Courses", value: stats.races },
    {
      icon: Medal,
      label: "Podiums",
      value: stats.podiums,
      accent: stats.podiums > 0 ? "text-success" : undefined,
    },
    {
      icon: Trophy,
      label: "Victoires",
      value: stats.wins,
      accent: stats.wins > 0 ? "text-amber-500" : undefined,
    },
    {
      icon: Target,
      label: "Top 10",
      value: stats.top10,
      accent: stats.top10 > 0 ? "text-success" : undefined,
    },
    {
      icon: Timer,
      label: "Qualifs",
      value: stats.qualifs,
    },
    { icon: Layers, label: "Essais", value: stats.practices },
    {
      icon: TrendingUp,
      label: "Meilleur résultat",
      value: stats.bestFinish && stats.bestFinish < 99 ? `P${stats.bestFinish}` : "—",
      accent:
        stats.bestFinish && stats.bestFinish <= 3
          ? "text-success"
          : undefined,
    },
    { icon: Car, label: "Voitures", value: stats.carsUsed },
    { icon: MapPin, label: "Circuits", value: stats.tracksVisited },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <div className="flex items-center gap-4 p-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground text-2xl font-black shadow-md shrink-0">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-micro uppercase tracking-[0.18em] text-muted-foreground font-medium">
              LMU Driver
            </p>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
              {displayName}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {stats.tracksVisited} circuits · {stats.carsUsed} voitures · {stats.totalSessions} sessions
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {heroStats.map((s) => (
          <Card
            key={s.label}
            className="relative overflow-hidden transition-shadow hover:shadow-lg"
          >
            {/* Halo coloré décoratif */}
            <div
              className={cn(
                "pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full blur-3xl",
                s.glow
              )}
            />
            <CardContent className="relative p-4 flex items-center gap-3">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1",
                  s.bg,
                  s.color
                )}
              >
                <s.icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-micro uppercase tracking-[0.15em] text-muted-foreground font-semibold">
                  {s.label}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-3xl font-black tabular-nums leading-none",
                    s.color
                  )}
                >
                  {s.value}
                  {s.suffix && (
                    <span className="text-lg font-bold opacity-70 ml-0.5">
                      {s.suffix}
                    </span>
                  )}
                </p>
                {(s.sublineMain || s.sublineAccent) && (
                  <p className="mt-1 text-micro text-muted-foreground font-medium leading-tight">
                    {s.sublineMain}
                    {s.sublineMain && s.sublineAccent && (
                      <span className="mx-1 opacity-60">·</span>
                    )}
                    {s.sublineAccent && (
                      <span className="text-destructive/80">
                        {s.sublineAccent}
                      </span>
                    )}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-2">
        {secondaryStats.map((s) => (
          <Card key={s.label} className="overflow-hidden">
            <CardContent className="p-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-micro uppercase tracking-wide text-muted-foreground font-semibold leading-tight">
                  {s.label}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-lg font-bold font-mono tabular-nums leading-none",
                    s.accent
                  )}
                >
                  {s.value}
                </p>
              </div>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <s.icon className="h-3.5 w-3.5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
