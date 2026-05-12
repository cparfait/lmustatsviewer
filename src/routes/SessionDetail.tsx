import { Link, useParams } from "react-router";
import { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { raceDetailMock, gameVersions, getCircuitInfo } from "@/lib/mockData";
import { formatLapTime, formatSectorTime, cn } from "@/lib/utils";
import {
  ArrowLeft,
  AlertTriangle,
  MessageSquare,
  Wrench,
  Activity,
  ChevronRight,
  Trophy,
  Zap,
  GitCompareArrows,
  ShieldAlert,
  Flag,
  User,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
  LabelList,
} from "recharts";

const DRIVER_COLORS: Record<string, string> = {
  "Hugo Lebrun": "#FFB400",
  "Cédric (vous)": "#00C896",
  "Marco Rossi": "#A855F7",
  "Anna Müller": "#38BDF8",
  "James Carter": "#F97316",
};

const COMPOUND_COLORS = {
  "Slick Soft": "bg-destructive/70 text-destructive-foreground",
  "Slick Medium": "bg-[var(--color-tier-alien)]/70 text-foreground",
  "Slick Hard": "bg-[var(--color-tier-offline)]/70 text-foreground",
  Wet: "bg-[var(--color-tier-amateur)]/70 text-foreground",
};

const INCIDENT_VARIANT = {
  Contact: "destructive",
  Spin: "default",
  "Off-track": "secondary",
  Damage: "destructive",
  Penalty: "default",
} as const;

const PENALTY_VARIANT = {
  "Drive-Through": "destructive",
  "Stop & Go": "destructive",
  "Time +5s": "default",
  "Time +10s": "default",
  DSQ: "destructive",
  Avertissement: "secondary",
} as const;

export function SessionDetail() {
  useParams();
  const r = raceDetailMock;
  const v = gameVersions.find((gv) => gv.id === r.versionId)!;
  const info = getCircuitInfo(r.track);
  const player = r.drivers.find((d) => d.isPlayer)!;

  return (
    <div className="flex flex-col gap-5">
      {/* Top breadcrumb */}
      <div>
        <Link to="/sessions" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Retour à la liste
        </Link>
      </div>

      {/* Title block */}
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-primary">
          <span className="mr-3 text-4xl align-middle">{info.flag}</span>
          {r.track} — {r.type === "Race" ? "Course" : r.type === "Qualifying" ? "Qualification" : "Essais"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{r.dateTime}</p>
      </div>

      {/* Two info cards top — comme v1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                <InfoRow label="SESSION" value={
                  <Badge variant="default" className="text-[10px]">{r.type === "Race" ? "Course" : r.type === "Qualifying" ? "Qualification" : "Essais"}</Badge>
                } />
                <InfoRow label="DATE" value={<span className="font-mono text-xs">{r.dateTime}</span>} />
                <InfoRow label="CIRCUIT" value={<span>{info.flag} {r.track}</span>} />
                <InfoRow label="VAINQUEUR" value={<span className="font-medium">{r.winner}</span>} />
                <InfoRow label="MEILLEUR TOUR" value={
                  <span className="font-mono">
                    <span className="font-medium">{r.fastestLapDriver}</span>
                    <span className="text-primary ml-2 font-bold">({formatLapTime(r.fastestLapMs)})</span>
                  </span>
                } isLast />
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                <InfoRow label="MINUTES MAX" value={<span className="font-mono">{r.minutesMax}</span>} />
                <InfoRow label="TOURS TERMINÉS" value={<span className="font-mono">{r.lapsCompleted}</span>} />
                <InfoRow label="FICHIER" value={<span className="font-mono text-[11px] text-muted-foreground">{r.fileName}</span>} />
                <InfoRow label="VÉHICULES AUTORISÉS" value={<Badge variant="secondary" className="text-[10px]">{r.vehiclesAllowed}</Badge>} />
                <InfoRow label="AUTRES PARAMÈTRES" value={<span className="font-mono text-[11px] text-muted-foreground">{r.otherParams}</span>} isLast />
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Version banner */}
      <div className="flex items-center justify-between bg-muted/40 rounded-md px-4 py-2 border border-border/60">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Wrench className="h-3.5 w-3.5" />
          Cette session a été disputée sur la version <span className="font-mono text-foreground font-medium mx-1">v{v.label}</span>
          du jeu — build {v.build} ({v.releasedAt})
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">v{v.label}</Badge>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="result">
        <TabsList className="flex-wrap h-auto justify-start">
          <TabsTrigger value="result" className="gap-1.5"><Trophy className="h-3.5 w-3.5" />Résultat Course</TabsTrigger>
          <TabsTrigger value="laps" className="gap-1.5"><Activity className="h-3.5 w-3.5" />Tours Course</TabsTrigger>
          <TabsTrigger value="best" className="gap-1.5"><Zap className="h-3.5 w-3.5" />Meilleurs tours</TabsTrigger>
          <TabsTrigger value="strategy" className="gap-1.5"><Wrench className="h-3.5 w-3.5" />Stratégie</TabsTrigger>
          <TabsTrigger value="incidents" className="gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />Incidents</TabsTrigger>
          <TabsTrigger value="penalties" className="gap-1.5"><ShieldAlert className="h-3.5 w-3.5" />Pénalités</TabsTrigger>
          <TabsTrigger value="chat" className="gap-1.5"><MessageSquare className="h-3.5 w-3.5" />Chat</TabsTrigger>
          <TabsTrigger value="compare" className="gap-1.5"><GitCompareArrows className="h-3.5 w-3.5" />Comparaison pilotes</TabsTrigger>
        </TabsList>

        {/* ────────────────────────── Résultat Course ────────────────────────── */}
        <TabsContent value="result">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base uppercase tracking-wider">Classement général</CardTitle>
                <CardDescription>{r.drivers.length} pilotes sur {r.fieldSize} terminés</CardDescription>
              </div>
              <LapsLegend />
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr className="border-b border-border">
                      <th className="text-center px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Pos</th>
                      <th className="text-center px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Prog.</th>
                      <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Classe</th>
                      <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Pilote</th>
                      <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Voiture</th>
                      <th className="text-center px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Tours</th>
                      <th className="text-center px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Tours en tête</th>
                      <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Temps total / Écart</th>
                      <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Meilleur tour</th>
                      <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Vmax</th>
                      <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Carb. départ</th>
                      <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Carb. arrivée</th>
                      <th className="text-center px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Incidents</th>
                      <th className="text-center px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Pénalités</th>
                      <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.drivers.map((d) => {
                      const delta = d.startPosition - d.finishPosition;
                      const isFastest = d.bestLapMs === r.fastestLapMs;
                      return (
                        <tr key={d.name} className={cn("border-b border-border/40 hover:bg-accent/20 transition-colors", d.isPlayer && "bg-[var(--color-tier-alien)]/10")}>
                          <td className="px-3 py-2.5 text-center">
                            <PodiumIcon pos={d.finishPosition} />
                          </td>
                          <td className="px-3 py-2.5 text-center font-mono text-xs">
                            {delta > 0 ? <span className="text-success font-bold">▲+{delta}</span> :
                              delta < 0 ? <span className="text-destructive font-bold">▼{Math.abs(delta)}</span> :
                              <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-2.5"><Badge variant="secondary" className="text-[10px]">{d.class}</Badge></td>
                          <td className={cn("px-3 py-2.5 font-medium", d.isPlayer && "text-primary")}>
                            {d.name}
                            {d.isPlayer && <Badge variant="default" className="ml-2 text-[9px]">VOUS</Badge>}
                          </td>
                          <td className="px-3 py-2.5 text-sm text-muted-foreground whitespace-nowrap">{d.car}</td>
                          <td className="px-3 py-2.5 text-center font-mono">{d.totalLaps}</td>
                          <td className="px-3 py-2.5 text-center font-mono">{d.lapsLed}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                            {d.totalRaceTime}
                          </td>
                          <td className={cn("px-3 py-2.5 text-right font-mono font-medium whitespace-nowrap", isFastest && "text-purple")}>
                            {isFastest && <span className="text-[9px] mr-1">⚡</span>}
                            {formatLapTime(d.bestLapMs)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">{d.vMaxKmh} km/h</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">{d.fuelStartPct.toFixed(1)}%</td>
                          <td className={cn("px-3 py-2.5 text-right font-mono text-xs", d.fuelEndPct < 10 ? "text-destructive" : "text-muted-foreground")}>
                            {d.fuelEndPct.toFixed(1)}%
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {d.incidents === 0 ? <span className="text-muted-foreground">—</span> : <span className="font-mono font-bold text-destructive">{d.incidents}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {d.penalties === 0 ? <span className="text-muted-foreground">—</span> : <span className="font-mono font-bold text-[var(--color-tier-alien)]">{d.penalties}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            {d.status === "Terminé Normalement" ? <span className="text-success">Terminé Normalement</span> :
                              d.status.startsWith("DNF") ? <span className="text-destructive">{d.status}</span> :
                              <span className="text-muted-foreground">{d.status}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ────────────────────────── Tours Course ────────────────────────── */}
        <TabsContent value="laps">
          <LapsByDriver race={r} />
        </TabsContent>

        {/* ────────────────────────── Meilleurs tours ────────────────────────── */}
        <TabsContent value="best">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base uppercase tracking-wider">Meilleurs tours par pilote</CardTitle>
              <CardDescription>Best lap, meilleurs secteurs et temps optimal théorique</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr className="border-b border-border">
                    <th className="text-center px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Pos</th>
                    <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Pilote</th>
                    <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Best lap</th>
                    <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Au tour</th>
                    <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium text-success">S1</th>
                    <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium text-success">S2</th>
                    <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium text-success">S3</th>
                    <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium text-purple">Optimal</th>
                    <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Vmax</th>
                  </tr>
                </thead>
                <tbody>
                  {r.drivers
                    .slice()
                    .sort((a, b) => a.bestLapMs - b.bestLapMs)
                    .map((d, i) => {
                      const isFastest = i === 0;
                      const validLaps = r.driverLaps.find((dl) => dl.driver === d.name)?.laps.filter(l => l.valid) ?? [];
                      const bestLap = validLaps.reduce((min, l) => l.time < min.time ? l : min, validLaps[0]);
                      const bestLapNum = bestLap?.lap ?? "—";
                      // Mock sectors with slight variation
                      const baseS1 = 35_000 + (i * 200);
                      const baseS2 = 56_000 + (i * 250);
                      const baseS3 = 46_000 + (i * 180);
                      const optimal = baseS1 + baseS2 + baseS3 - 200;
                      return (
                        <tr key={d.name} className={cn("border-b border-border/40", d.isPlayer && "bg-[var(--color-tier-alien)]/10")}>
                          <td className="px-3 py-2 text-center font-mono font-bold">{i + 1}</td>
                          <td className={cn("px-3 py-2 font-medium", d.isPlayer && "text-primary")}>
                            {d.name}
                            {d.isPlayer && <Badge variant="default" className="ml-2 text-[9px]">VOUS</Badge>}
                          </td>
                          <td className={cn("px-3 py-2 text-right font-mono font-bold", isFastest && "text-purple")}>
                            {isFastest && "⚡ "}
                            {formatLapTime(d.bestLapMs)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">L{bestLapNum}</td>
                          <td className="px-3 py-2 text-right font-mono text-success">{formatSectorTime(baseS1)}</td>
                          <td className="px-3 py-2 text-right font-mono text-success">{formatSectorTime(baseS2)}</td>
                          <td className="px-3 py-2 text-right font-mono text-success">{formatSectorTime(baseS3)}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-purple">{formatLapTime(optimal)}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">{d.vMaxKmh} km/h</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ────────────────────────── Stratégie pneus ────────────────────────── */}
        <TabsContent value="strategy">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base uppercase tracking-wider">Stratégie pneus</CardTitle>
                <CardDescription>Relais et composés par pilote</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Array.from(new Set(r.stints.map((s) => s.driver))).map((driver) => {
                    const driverStints = r.stints.filter((s) => s.driver === driver);
                    return (
                      <div key={driver} className="flex items-center gap-3">
                        <span className={cn("text-sm w-36 truncate", driver === "Cédric (vous)" && "text-primary font-medium")}>{driver}</span>
                        <div className="flex-1 flex h-7 rounded overflow-hidden bg-muted">
                          {driverStints.map((s, i) => {
                            const width = ((s.endLap - s.startLap + 1) / r.laps) * 100;
                            return (
                              <div
                                key={i}
                                className={cn("flex items-center justify-center text-[10px] font-mono font-medium border-r border-background last:border-r-0", COMPOUND_COLORS[s.compound])}
                                style={{ width: `${width}%` }}
                                title={`${s.compound} · L${s.startLap}-${s.endLap}`}
                              >
                                L{s.startLap}-{s.endLap}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 mt-6 pt-4 border-t border-border/60 text-xs flex-wrap">
                  <span className="text-muted-foreground">Légende :</span>
                  {Object.entries(COMPOUND_COLORS).map(([name, cls]) => (
                    <div key={name} className="flex items-center gap-1.5">
                      <div className={cn("h-3 w-3 rounded", cls)} />
                      <span>{name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base uppercase tracking-wider">Carburant par pilote</CardTitle>
                <CardDescription>Départ → arrivée (en %)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {r.drivers.map((d) => {
                    const consumed = d.fuelStartPct - d.fuelEndPct;
                    return (
                      <div key={d.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className={cn(d.isPlayer && "text-primary font-medium")}>{d.name}</span>
                          <span className="font-mono text-muted-foreground">{d.fuelStartPct.toFixed(1)}% → {d.fuelEndPct.toFixed(1)}% <span className="text-foreground">({consumed.toFixed(1)} L)</span></span>
                        </div>
                        <div className="h-2 bg-muted rounded overflow-hidden flex">
                          <div className="bg-success/30" style={{ width: `${d.fuelEndPct}%` }} />
                          <div className="bg-primary/40" style={{ width: `${consumed}%` }} />
                          <div className="bg-muted-foreground/20 flex-1" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Lap times chart in strategy too */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Temps au tour</CardTitle>
                <CardDescription>Pic des relais visibles aux pit stops</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={r.laptimes} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="lap" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                      <YAxis
                        domain={[135_000, 175_000]}
                        tickFormatter={(v) => formatLapTime(v)}
                        tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                        width={60}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
                        formatter={(v: number) => formatLapTime(v)}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {Object.entries(DRIVER_COLORS).map(([name, color]) => (
                        <Line key={name} type="monotone" dataKey={name} stroke={color} strokeWidth={name === "Cédric (vous)" ? 2.5 : 1.5} dot={false} activeDot={{ r: 4 }} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Gap au leader</CardTitle>
                <CardDescription>Évolution position par position</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={r.gapToLeader} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="lap" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                      <YAxis tickFormatter={(v) => "+" + (v / 1000).toFixed(0) + "s"} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} width={50} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
                        formatter={(v: number) => "+" + (v / 1000).toFixed(2) + "s"}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area type="monotone" dataKey="Cédric (vous)" stroke="#00C896" fill="#00C896" fillOpacity={0.25} strokeWidth={2.5} />
                      <Area type="monotone" dataKey="Marco Rossi" stroke="#A855F7" fill="#A855F7" fillOpacity={0.15} strokeWidth={1.5} />
                      <Area type="monotone" dataKey="Anna Müller" stroke="#38BDF8" fill="#38BDF8" fillOpacity={0.15} strokeWidth={1.5} />
                      <Area type="monotone" dataKey="James Carter" stroke="#F97316" fill="#F97316" fillOpacity={0.15} strokeWidth={1.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ────────────────────────── Incidents ────────────────────────── */}
        <TabsContent value="incidents">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base uppercase tracking-wider">Journal des incidents</CardTitle>
              <CardDescription>{r.incidents.length} évènements sur {r.laps} tours</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {r.incidents.map((inc, i) => (
                <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-accent/40 transition-colors">
                  <span className="font-mono text-xs text-muted-foreground w-12">L{inc.lap}</span>
                  <Badge variant={INCIDENT_VARIANT[inc.type]} className="w-24 justify-center">{inc.type}</Badge>
                  <span className="text-sm font-medium w-40 text-muted-foreground">{inc.driver}</span>
                  <span className="text-sm flex-1">{inc.description}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ────────────────────────── Pénalités ────────────────────────── */}
        <TabsContent value="penalties">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base uppercase tracking-wider">Pénalités infligées</CardTitle>
              <CardDescription>{r.penalties.length} pénalité{r.penalties.length > 1 ? "s" : ""} sur la course</CardDescription>
            </CardHeader>
            <CardContent>
              {r.penalties.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">Aucune pénalité infligée</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Tour</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Pilote</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Type</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Raison</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.penalties.map((p, i) => (
                      <tr key={i} className="border-b border-border/40">
                        <td className="px-3 py-2 font-mono text-xs">L{p.lap}</td>
                        <td className="px-3 py-2 font-medium">{p.driver}</td>
                        <td className="px-3 py-2"><Badge variant={PENALTY_VARIANT[p.type]}>{p.type}</Badge></td>
                        <td className="px-3 py-2 text-muted-foreground">{p.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ────────────────────────── Chat ────────────────────────── */}
        <TabsContent value="chat">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base uppercase tracking-wider">Chat de course</CardTitle>
              <CardDescription>{r.chat.length} messages</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 font-mono text-sm">
              {r.chat.map((m, i) => (
                <div key={i} className={cn("flex items-start gap-3 py-1.5 px-3 rounded-md", m.system && "bg-primary/5")}>
                  <span className="text-xs text-muted-foreground w-20 shrink-0">{m.time}</span>
                  <span className={cn("font-medium shrink-0 w-32 truncate", m.system ? "text-primary" : m.author === "Cédric (vous)" ? "text-success" : "text-foreground")}>
                    {m.author}
                  </span>
                  <span className={cn("flex-1", m.system && "text-primary italic")}>{m.text}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ────────────────────────── Comparaison pilotes ────────────────────────── */}
        <TabsContent value="compare">
          <DriverComparison race={r} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({ label, value, isLast }: { label: string; value: React.ReactNode; isLast?: boolean }) {
  return (
    <tr className={cn(!isLast && "border-b border-border/60")}>
      <td className="px-4 py-2.5 bg-muted/30 text-[11px] uppercase tracking-wider font-medium text-muted-foreground w-48">{label}</td>
      <td className="px-4 py-2.5 text-foreground">{value}</td>
    </tr>
  );
}

function PodiumIcon({ pos }: { pos: number }) {
  if (pos === 1) return <Trophy className="h-5 w-5 mx-auto text-[var(--color-tier-alien)]" fill="currentColor" />;
  if (pos === 2) return <Trophy className="h-5 w-5 mx-auto text-[var(--color-tier-offline)]" fill="currentColor" />;
  if (pos === 3) return <Trophy className="h-5 w-5 mx-auto text-orange-400" fill="currentColor" />;
  return <span className="font-mono font-bold text-muted-foreground">P{pos}</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono font-medium">{value}</div>
    </div>
  );
}

// ─── Tours Course : une table par pilote ────────────────────────────────────
type RaceData = typeof import("@/lib/mockData").raceDetailMock;

function LapsByDriver({ race }: { race: RaceData }) {
  const [sessionFilter, setSessionFilter] = useState("Course");
  const [scrollTarget, setScrollTarget] = useState("");
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Calcul des PBs par pilote + sessionBest
  const analysis = useMemo(() => {
    const result: Record<string, {
      bestLap: number; bestS1: number; bestS2: number; bestS3: number;
      bestLapNum: number;
    }> = {};

    let sessionBestLap = Infinity, sessionBestS1 = Infinity, sessionBestS2 = Infinity, sessionBestS3 = Infinity;
    let sessionBestLapDriver = "", sessionBestS1Driver = "", sessionBestS2Driver = "", sessionBestS3Driver = "";

    race.driverLaps.forEach((dl) => {
      let bL = Infinity, bS1 = Infinity, bS2 = Infinity, bS3 = Infinity, bLapNum = 0;
      dl.laps.forEach((l) => {
        if (!l.valid) return;
        if (l.time < bL) { bL = l.time; bLapNum = l.lap; }
        if (l.s1 < bS1) bS1 = l.s1;
        if (l.s2 < bS2) bS2 = l.s2;
        if (l.s3 < bS3) bS3 = l.s3;
      });
      result[dl.driver] = { bestLap: bL, bestS1: bS1, bestS2: bS2, bestS3: bS3, bestLapNum: bLapNum };

      if (bL < sessionBestLap) { sessionBestLap = bL; sessionBestLapDriver = dl.driver; }
      if (bS1 < sessionBestS1) { sessionBestS1 = bS1; sessionBestS1Driver = dl.driver; }
      if (bS2 < sessionBestS2) { sessionBestS2 = bS2; sessionBestS2Driver = dl.driver; }
      if (bS3 < sessionBestS3) { sessionBestS3 = bS3; sessionBestS3Driver = dl.driver; }
    });

    return { result, sessionBestLap, sessionBestS1, sessionBestS2, sessionBestS3, sessionBestLapDriver, sessionBestS1Driver, sessionBestS2Driver, sessionBestS3Driver };
  }, [race]);

  // Trier par finish position
  const sortedDrivers = useMemo(() =>
    [...race.driverLaps].sort((a, b) => {
      const da = race.drivers.find((d) => d.name === a.driver);
      const db = race.drivers.find((d) => d.name === b.driver);
      return (da?.finishPosition ?? 99) - (db?.finishPosition ?? 99);
    }),
    [race]
  );

  const scrollToDriver = (driver: string) => {
    const el = sectionRefs.current[driver];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setScrollTarget(driver);
  };

  const playerDriver = race.drivers.find((d) => d.isPlayer);

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-toolbar */}
      <Card>
        <CardContent className="p-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">Afficher la session :</span>
            <select
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
              className="h-8 px-2 rounded-md border border-border bg-background text-xs"
            >
              <option value="Course">Course</option>
              <option value="Qualifying">Qualification</option>
              <option value="Practice">Essais</option>
            </select>
          </div>
          <LapsLegend />
        </CardContent>
      </Card>

      {/* Navigation pilote */}
      <Card>
        <CardContent className="p-3 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium">Aller au pilote :</span>
          <select
            value={scrollTarget}
            onChange={(e) => scrollToDriver(e.target.value)}
            className="h-8 px-2 rounded-md border border-border bg-background text-xs min-w-[200px]"
          >
            <option value="">— Sélectionner un pilote —</option>
            {sortedDrivers.map((dl) => (
              <option key={dl.driver} value={dl.driver}>{dl.driver}</option>
            ))}
          </select>
          {playerDriver && (
            <Button
              variant="default"
              size="sm"
              onClick={() => scrollToDriver(playerDriver.name)}
              className="h-8 gap-1.5"
            >
              <User className="h-3.5 w-3.5" /> Mes tours
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Une table par pilote */}
      {sortedDrivers.map((dl) => {
        const driver = race.drivers.find((d) => d.name === dl.driver);
        if (!driver) return null;
        const a = analysis.result[dl.driver];
        const isPlayer = !!driver.isPlayer;

        return (
          <div
            key={dl.driver}
            ref={(el) => { sectionRefs.current[dl.driver] = el; }}
            className="scroll-mt-20"
          >
            <Card className="overflow-hidden">
              {/* Header pilote */}
              <div className="bg-primary text-primary-foreground px-4 py-2.5 flex items-center gap-3">
                <span className="font-mono font-bold text-base">{driver.finishPosition}.</span>
                <span className="font-semibold uppercase tracking-wider">{dl.driver}</span>
                {isPlayer && <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground border-0 text-[10px]">VOUS</Badge>}
                <span className="ml-auto text-xs text-primary-foreground/80 font-mono">{driver.car}</span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/60">
                    <tr>
                      <th className="text-center px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Tour</th>
                      <th className="text-center px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Pos</th>
                      <th className="text-center px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Temps</th>
                      <th className="text-center px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Secteur 1</th>
                      <th className="text-center px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Secteur 2</th>
                      <th className="text-center px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Secteur 3</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dl.laps.map((lap) => {
                      const invalid = !lap.valid;
                      const isLapPB = lap.valid && lap.time === a.bestLap;
                      const isS1PB = lap.valid && lap.s1 === a.bestS1;
                      const isS2PB = lap.valid && lap.s2 === a.bestS2;
                      const isS3PB = lap.valid && lap.s3 === a.bestS3;
                      const isSessionBestLap = lap.valid && lap.time === analysis.sessionBestLap && dl.driver === analysis.sessionBestLapDriver;
                      const isSessionBestS1 = lap.valid && lap.s1 === analysis.sessionBestS1 && dl.driver === analysis.sessionBestS1Driver;
                      const isSessionBestS2 = lap.valid && lap.s2 === analysis.sessionBestS2 && dl.driver === analysis.sessionBestS2Driver;
                      const isSessionBestS3 = lap.valid && lap.s3 === analysis.sessionBestS3 && dl.driver === analysis.sessionBestS3Driver;

                      return (
                        <tr
                          key={lap.lap}
                          className={cn(
                            "border-b border-border/40 last:border-0 transition-colors",
                            invalid && "bg-destructive/10",
                            isPlayer && !invalid && "bg-[var(--color-tier-alien)]/8 hover:bg-[var(--color-tier-alien)]/15",
                            !isPlayer && !invalid && "hover:bg-accent/40"
                          )}
                        >
                          <td className={cn("px-3 py-2 text-center font-mono text-sm", invalid ? "text-destructive" : isPlayer ? "text-primary" : "text-primary/90")}>
                            {lap.lap}
                          </td>
                          <td className="px-3 py-2 text-center font-mono">
                            {invalid ? <span className="text-destructive/70">{lap.position}</span> : lap.position}
                          </td>
                          <td className={cn(
                            "px-3 py-2 text-center font-mono",
                            invalid && "text-destructive",
                            isSessionBestLap && "text-[var(--color-tier-alien)] font-bold",
                            isLapPB && !isSessionBestLap && "text-success font-bold",
                          )}>
                            {invalid ? (
                              <span className="line-through opacity-60">{formatLapTime(lap.time)}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5">
                                {isSessionBestLap && <span title="Meilleur tour de la session">👤</span>}
                                {formatLapTime(lap.time)}
                                {isLapPB && !isSessionBestLap && <span className="text-[9px] bg-success/15 text-success px-1 rounded">PB</span>}
                              </span>
                            )}
                          </td>
                          {invalid ? (
                            <>
                              <td className="px-3 py-2 text-center font-mono text-destructive/70">N/A</td>
                              <td className="px-3 py-2 text-center font-mono text-destructive/70">N/A</td>
                              <td className="px-3 py-2 text-center font-mono text-destructive/70">N/A</td>
                            </>
                          ) : (
                            <>
                              <SectorCell ms={lap.s1} isPB={isS1PB} isSessionBest={isSessionBestS1} />
                              <SectorCell ms={lap.s2} isPB={isS2PB} isSessionBest={isSessionBestS2} />
                              <SectorCell ms={lap.s3} isPB={isS3PB} isSessionBest={isSessionBestS3} />
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        );
      })}
    </div>
  );
}

function SectorCell({ ms, isPB, isSessionBest }: { ms: number; isPB: boolean; isSessionBest: boolean }) {
  return (
    <td className={cn(
      "px-3 py-2 text-center font-mono",
      isSessionBest && "text-[var(--color-tier-alien)] font-bold",
      isPB && !isSessionBest && "text-success font-bold",
    )}>
      <span className="inline-flex items-center gap-1">
        {isSessionBest && <span title="Meilleur secteur de la session">👤</span>}
        {formatSectorTime(ms)}<span className="text-muted-foreground text-[9px]">s</span>
      </span>
    </td>
  );
}

// ─── Comparaison pilotes : jusqu'à 4 pilotes ────────────────────────────────
const COMPARE_COLORS = ["#3B82F6", "#10B981", "#F97316", "#A855F7"];

function DriverComparison({ race }: { race: RaceData }) {
  const [sessionFilter, setSessionFilter] = useState("Course");
  const [pilots, setPilots] = useState<(string | "")[]>([race.drivers[1]?.name ?? "", race.drivers[2]?.name ?? "", "", ""]);

  const setPilot = (i: number, name: string) => {
    setPilots((arr) => arr.map((p, idx) => (idx === i ? name : p)));
  };

  const selected = pilots.filter((p) => p) as string[];
  const allDrivers = race.drivers.map((d) => d.name);

  // Build positions chart data
  const positionsData = useMemo(() => {
    return Array.from({ length: race.laps }, (_, i) => {
      const lap = i + 1;
      const row: Record<string, number | string> = { lap: `Tour ${lap}` };
      selected.forEach((name) => {
        const dl = race.driverLaps.find((d) => d.driver === name);
        const lapData = dl?.laps.find((l) => l.lap === lap);
        if (lapData) row[name] = lapData.position;
      });
      return row;
    });
  }, [selected, race]);

  // Stats per pilot
  const stats = useMemo(() => {
    return selected.map((name) => {
      const driver = race.drivers.find((d) => d.name === name);
      const dl = race.driverLaps.find((d) => d.driver === name);
      if (!driver || !dl) return null;

      const validLaps = dl.laps.filter((l) => l.valid);
      const sortedTimes = [...validLaps].sort((a, b) => a.time - b.time);
      const best5 = sortedTimes.slice(0, 5).map((l) => l.time);
      const avgBest5 = best5.length > 0 ? best5.reduce((s, t) => s + t, 0) / best5.length : 0;

      const sortedAsc = [...validLaps].sort((a, b) => a.time - b.time);
      const median = sortedAsc.length > 0 ? sortedAsc[Math.floor(sortedAsc.length / 2)].time : 0;

      const mean = validLaps.length > 0 ? validLaps.reduce((s, l) => s + l.time, 0) / validLaps.length : 0;
      const variance = validLaps.length > 0 ? validLaps.reduce((s, l) => s + (l.time - mean) ** 2, 0) / validLaps.length : 0;
      const stdDev = Math.sqrt(variance);

      const bestS1 = validLaps.length > 0 ? Math.min(...validLaps.map((l) => l.s1)) : 0;
      const bestS2 = validLaps.length > 0 ? Math.min(...validLaps.map((l) => l.s2)) : 0;
      const bestS3 = validLaps.length > 0 ? Math.min(...validLaps.map((l) => l.s3)) : 0;

      return {
        name,
        finishPos: driver.finishPosition,
        startPos: driver.startPosition,
        bestLap: driver.bestLapMs,
        avgBest5,
        median,
        stdDev,
        bestS1, bestS2, bestS3,
        vMax: driver.vMaxKmh,
        pits: driver.pitStops,
        incidents: driver.incidents,
        penalties: driver.penalties,
      };
    }).filter(Boolean) as NonNullable<ReturnType<typeof Object>>[];
  }, [selected, race]);

  // Quel est le best parmi les sélectionnés (pour highlight vert) ?
  const bestOf = (key: string, lower: boolean = true) => {
    if (stats.length === 0) return null;
    const values = stats.map((s: any) => s[key]).filter((v: any) => typeof v === "number");
    return lower ? Math.min(...values) : Math.max(...values);
  };

  const minPos = bestOf("finishPos");
  const minStartPos = bestOf("startPos");
  const minBest = bestOf("bestLap");
  const minAvg = bestOf("avgBest5");
  const minMedian = bestOf("median");
  const minStdDev = bestOf("stdDev");
  const minS1 = bestOf("bestS1");
  const minS2 = bestOf("bestS2");
  const minS3 = bestOf("bestS3");
  const maxVmax = bestOf("vMax", false);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar haut */}
      <Card>
        <CardContent className="p-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">Afficher la session :</span>
            <select value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)} className="h-8 px-2 rounded-md border border-border bg-background text-xs">
              <option value="Course">Course</option>
              <option value="Qualifying">Qualification</option>
              <option value="Practice">Essais</option>
            </select>
          </div>
          <LapsLegend />
        </CardContent>
      </Card>

      {/* Sélection des pilotes */}
      <Card>
        <CardContent className="p-3 flex items-center gap-3 flex-wrap">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs font-medium">Pilote {i + 1}</span>
              <select
                value={pilots[i]}
                onChange={(e) => setPilot(i, e.target.value)}
                className="h-8 px-2 rounded-md border border-border bg-background text-xs min-w-[180px]"
                style={{ borderLeftWidth: 3, borderLeftColor: pilots[i] ? COMPARE_COLORS[i] : "var(--color-border)" }}
              >
                <option value="">Sélectionner un pilote</option>
                {allDrivers.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          ))}
          <Button size="sm" className="h-8 ml-auto">Comparer</Button>
        </CardContent>
      </Card>

      {/* Titre */}
      <h2 className="text-xl font-bold tracking-wider uppercase text-center text-primary">Comparaison des pilotes</h2>

      {selected.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            Sélectionne au moins un pilote pour démarrer la comparaison.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Évolution des positions */}
          <Card>
            <CardHeader className="pb-3 text-center">
              <CardTitle className="text-sm font-medium text-muted-foreground">Évolution des positions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[500px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={positionsData} margin={{ top: 20, right: 40, left: 30, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="lap" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} label={{ value: "Tour", position: "insideBottom", offset: -10, fill: "var(--color-muted-foreground)", fontSize: 12 }} />
                    <YAxis
                      reversed
                      domain={[1, "dataMax + 1"]}
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                      label={{ value: "Position", angle: -90, position: "insideLeft", fill: "var(--color-muted-foreground)", fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
                      formatter={(v: number) => `P${v}`}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="top" iconType="rect" />
                    {selected.map((name, i) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={COMPARE_COLORS[i]}
                        strokeWidth={2.5}
                        dot={{ r: 5, fill: COMPARE_COLORS[i] }}
                        activeDot={{ r: 7 }}
                      >
                        <LabelList
                          dataKey={name}
                          position="top"
                          fill={COMPARE_COLORS[i]}
                          fontSize={10}
                          fontWeight={700}
                          offset={8}
                          formatter={(v: any) => v ? String(v) : ""}
                        />
                      </Line>
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Statistiques comparatives */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr className="border-b border-border">
                      <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Statistique</th>
                      {stats.map((s: any, i: number) => (
                        <th
                          key={s.name}
                          className="text-center px-3 py-2 text-[11px] uppercase tracking-wider font-bold"
                          style={{ color: COMPARE_COLORS[i] }}
                        >
                          {s.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <StatRow label="Position d'arrivée" bestIdx={stats.findIndex((s: any) => s.finishPos === minPos)} stats={stats} render={(s: any) => `P${s.finishPos}`} />
                    <StatRow label="Position de départ" bestIdx={stats.findIndex((s: any) => s.startPos === minStartPos)} stats={stats} render={(s: any) => `P${s.startPos}`} />
                    <StatRow label="Meilleur Tour" bestIdx={stats.findIndex((s: any) => s.bestLap === minBest)} stats={stats} render={(s: any) => formatLapTime(s.bestLap)} mono />
                    <StatRow label="Moy. 5 meilleurs tours" bestIdx={stats.findIndex((s: any) => s.avgBest5 === minAvg)} stats={stats} render={(s: any) => formatLapTime(Math.round(s.avgBest5))} mono />
                    <StatRow label="Temps au tour médian" bestIdx={stats.findIndex((s: any) => s.median === minMedian)} stats={stats} render={(s: any) => formatLapTime(s.median)} mono />
                    <StatRow label="Écart-type" bestIdx={stats.findIndex((s: any) => s.stdDev === minStdDev)} stats={stats} render={(s: any) => `${(s.stdDev / 1000).toFixed(3)}s`} mono />
                    <StatRow label="Meilleur Secteur 1" bestIdx={stats.findIndex((s: any) => s.bestS1 === minS1)} stats={stats} render={(s: any) => `${formatSectorTime(s.bestS1)}ss`} mono icon="👤" />
                    <StatRow label="Meilleur Secteur 2" bestIdx={stats.findIndex((s: any) => s.bestS2 === minS2)} stats={stats} render={(s: any) => `${formatSectorTime(s.bestS2)}ss`} mono />
                    <StatRow label="Meilleur Secteur 3" bestIdx={stats.findIndex((s: any) => s.bestS3 === minS3)} stats={stats} render={(s: any) => `${formatSectorTime(s.bestS3)}ss`} mono />
                    <StatRow label="Vitesse Maximale" bestIdx={stats.findIndex((s: any) => s.vMax === maxVmax)} stats={stats} render={(s: any) => `${s.vMax} km/h`} mono />
                    <StatRow label="Arrêts aux stands" bestIdx={-1} stats={stats} render={(s: any) => String(s.pits)} mono />
                    <StatRow label="Incidents" bestIdx={-1} stats={stats} render={(s: any) => String(s.incidents)} mono />
                    <StatRow label="Pénalités" bestIdx={-1} stats={stats} render={(s: any) => String(s.penalties)} mono />
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatRow({ label, stats, bestIdx, render, mono, icon }: { label: string; stats: any[]; bestIdx: number; render: (s: any) => string; mono?: boolean; icon?: string }) {
  return (
    <tr className="border-b border-border/40 last:border-0">
      <td className="px-3 py-2 font-medium text-foreground bg-muted/20">{label}</td>
      {stats.map((s, i) => {
        const isBest = i === bestIdx && bestIdx >= 0;
        return (
          <td
            key={s.name}
            className={cn(
              "px-3 py-2 text-center",
              mono && "font-mono",
              isBest && "bg-success/15 text-success font-bold"
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              {isBest && icon && <span>{icon}</span>}
              {render(s)}
            </span>
          </td>
        );
      })}
    </tr>
  );
}

function LapsLegend() {
  return (
    <div className="flex items-center gap-4 flex-wrap text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">Légende :</span>
      <span className="flex items-center gap-1.5">
        <div className="h-3 w-3 rounded bg-[var(--color-tier-alien)]/30 border border-[var(--color-tier-alien)]" />
        Votre ligne
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold text-success">PB</span>
        Record personnel pilote
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-[10px]">⚡</span>
        Meilleur tour/secteur session
      </span>
      <span className="flex items-center gap-1.5">
        <div className="h-3 w-3 rounded bg-destructive/30 border border-destructive" />
        Tour invalidé
      </span>
    </div>
  );
}
