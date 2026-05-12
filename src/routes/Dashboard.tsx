import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
  BarChart,
  Bar,
  RadialBarChart,
  RadialBar,
  Legend,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  bestLaps,
  globalStats,
  progressionLeMans,
  tierLines,
  CAR_CLASS_LABELS,
  tierColorMap,
  lapsByClass,
  weeklyActivity,
  gameVersions,
  getCircuitInfo,
} from "@/lib/mockData";
import { formatLapTime, formatDelta, formatSectorTime, cn } from "@/lib/utils";
import { TrendingUp, Clock, Route, Trophy, ArrowRight, Wrench, Eye } from "lucide-react";
import { useVersion } from "@/stores/version";
import { Link, useNavigate } from "react-router";

const icons = [Clock, Route, TrendingUp, Trophy];

export function Dashboard() {
  const navigate = useNavigate();
  const { activeId, active, showOutdated } = useVersion();

  const visibleBestLaps = bestLaps.filter((l) => showOutdated || l.versionId === activeId);
  const outdatedCount = bestLaps.length - bestLaps.filter((l) => l.versionId === activeId).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Vue d'ensemble sur <span className="text-foreground font-medium">v{active.label}</span>
            {!showOutdated && outdatedCount > 0 && (
              <span className="ml-1 text-xs">· {outdatedCount} records d'anciennes versions masqués</span>
            )}
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {globalStats.map((s, i) => {
          const Icon = icons[i];
          return (
            <Card key={s.label} className="relative overflow-hidden">
              <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-primary/5 blur-2xl -translate-y-8 translate-x-8" />
              <CardContent className="p-5 relative">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{s.label}</p>
                    <p className="mt-2 text-3xl font-bold font-mono tracking-tight">{s.value}</p>
                    {s.hint && <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>}
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Best laps — full width pour montrer toutes les colonnes */}
      <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Meilleurs temps par circuit</CardTitle>
              <CardDescription>
                {visibleBestLaps.length} records · classement par best lap · clic pour voir la session
              </CardDescription>
            </div>
            <Link to="/records" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              Tout voir <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Circuit</TableHead>
                  <TableHead>Classe</TableHead>
                  <TableHead>Voiture</TableHead>
                  <TableHead className="text-right">Best lap</TableHead>
                  <TableHead className="text-right text-purple">Optimal</TableHead>
                  <TableHead className="text-right">Vmax</TableHead>
                  <TableHead className="text-right">vs Alien</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="w-14">Ver.</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleBestLaps.slice(0, 8).map((l) => {
                  const v = gameVersions.find((gv) => gv.id === l.versionId);
                  const isOutdated = l.versionId !== activeId;
                  const info = getCircuitInfo(l.track);
                  return (
                    <TableRow
                      key={l.id}
                      onClick={() => navigate(`/sessions/${l.sessionId}`)}
                      className={cn("cursor-pointer group", isOutdated && "opacity-60")}
                    >
                      <TableCell className="font-medium">
                        <span className="mr-2">{info.flag}</span>
                        {l.track}
                        <span className="text-xs text-muted-foreground ml-1.5">{l.layout}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{CAR_CLASS_LABELS[l.class]}</TableCell>
                      <TableCell className="text-sm">
                        {l.car}
                        <div className="text-[10px] text-muted-foreground">{l.livery}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">{formatLapTime(l.lapMs)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-purple">{formatLapTime(l.optimalMs)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">{l.vMaxKmh}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {l.vsAlienMs === 0 ? "—" : formatDelta(l.vsAlienMs)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={tierColorMap[l.tier]}>{l.tier}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("font-mono text-[9px] gap-1", isOutdated && "border-destructive/40 text-destructive")}>
                          {isOutdated && <Wrench className="h-2.5 w-2.5" />}
                          {v?.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Eye className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

      {/* Progression chart — full width, dessous le tableau */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Progression — Le Mans Hypercar</CardTitle>
          <CardDescription>30 dernières sessions avec seuils ohne_speed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={progressionLeMans} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="session" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                <YAxis
                  domain={[203_000, 222_000]}
                  tickFormatter={(v) => formatLapTime(v)}
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  width={70}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(v: number) => formatLapTime(v)}
                />
                <ReferenceLine y={tierLines.Alien} stroke="var(--color-tier-alien)" strokeDasharray="4 4" label={{ value: "Alien", position: "right", fill: "var(--color-tier-alien)", fontSize: 10 }} />
                <ReferenceLine y={tierLines.Pro} stroke="var(--color-tier-pro)" strokeDasharray="4 4" label={{ value: "Pro", position: "right", fill: "var(--color-tier-pro)", fontSize: 10 }} />
                <ReferenceLine y={tierLines["Semi-Pro"]} stroke="var(--color-tier-semi)" strokeDasharray="4 4" label={{ value: "Semi", position: "right", fill: "var(--color-tier-semi)", fontSize: 10 }} />
                <ReferenceLine y={tierLines.Amateur} stroke="var(--color-tier-amateur)" strokeDasharray="4 4" label={{ value: "Amateur", position: "right", fill: "var(--color-tier-amateur)", fontSize: 10 }} />
                <Line type="monotone" dataKey="lapMs" stroke="var(--color-primary)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--color-primary)" }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Secondary charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tours par classe</CardTitle>
            <CardDescription>Répartition lifetime</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lapsByClass} layout="vertical" margin={{ top: 5, right: 16, left: 50, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                  <YAxis type="category" dataKey="class" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} width={70} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
                  />
                  <Bar dataKey="laps" radius={[0, 4, 4, 0]} fill="var(--color-primary)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Activité hebdomadaire</CardTitle>
            <CardDescription>Tours sur 12 dernières semaines</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyActivity} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
                  />
                  <Bar dataKey="laps" radius={[4, 4, 0, 0]} fill="var(--color-chart-2)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Distribution des tiers</CardTitle>
            <CardDescription>Tes records vs ohne_speed</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  innerRadius="30%"
                  outerRadius="100%"
                  data={tierDistribution(visibleBestLaps)}
                  startAngle={90}
                  endAngle={-270}
                >
                  <RadialBar background dataKey="count" cornerRadius={6} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
                  />
                  <Legend
                    iconSize={10}
                    layout="vertical"
                    verticalAlign="middle"
                    align="right"
                    wrapperStyle={{ fontSize: 11 }}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function tierDistribution(laps: typeof bestLaps) {
  const counts: Record<string, number> = { Alien: 0, Pro: 0, "Semi-Pro": 0, Amateur: 0, Offline: 0 };
  laps.forEach((l) => { counts[l.tier]++; });
  const palette: Record<string, string> = {
    Alien: "var(--color-tier-alien)",
    Pro: "var(--color-tier-pro)",
    "Semi-Pro": "var(--color-tier-semi)",
    Amateur: "var(--color-tier-amateur)",
    Offline: "var(--color-tier-offline)",
  };
  return Object.entries(counts)
    .filter(([, c]) => c > 0)
    .map(([name, count]) => ({ name, count, fill: palette[name] }));
}
