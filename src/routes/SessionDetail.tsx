import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableTitle } from "@/components/TableTitle";
import { ClassBadge } from "@/components/ClassBadge";
import { Tip } from "@/components/ui/tooltip";
import { CarLogo } from "@/components/CarLogo";
import { TrackFlag } from "@/components/TrackFlag";
import {
  cn,
  classOrder,
  formatTime,
  formatGap,
  formatSectorSeconds,
  formatDateTime,
} from "@/lib/utils";
import {
  ArrowLeft,
  Loader2,
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  Crosshair,
  Gauge,
  User,
  Settings2,
  AlertTriangle,
  Wrench,
  ExternalLink,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend as ChartLegend,
  ResponsiveContainer,
} from "recharts";
import { queries, setups as setupsApi } from "@/lib/api";
import type {
  SessionDetail as SessionDetailData,
  ResultRow,
  LapRow,
  SetupForSession,
} from "@/lib/api";

/** Fonction de traduction (typage léger pour les helpers). */
type Tr = (key: string, opts?: Record<string, unknown>) => string;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Légende de couleurs réutilisable (V1 : légendes WCAG des tableaux). */
function Legend({
  items,
}: {
  items: { className?: string; icon?: ReactNode; label: string }[];
}) {
  return (
    <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1">
          {i.icon ?? (
            <span
              className={cn("h-2.5 w-2.5 rounded-sm shrink-0", i.className)}
            />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Libellé localisé d'un type de session. */
function sessionTypeLabel(type: string, t: Tr): string {
  if (type === "Race") return t("sessionDetail.typeRace");
  if (type.startsWith("Qualif")) return t("sessionDetail.typeQualify");
  if (type.startsWith("Practice")) return t("sessionDetail.typePractice");
  return type;
}

/**
 * Parse les événements de flux pour compter incidents/pénalités par pilote.
 * Règles strictes de la V1 (`functions.php::process_session_data`).
 */
function buildSummaries(
  stream: SessionDetailData["stream"],
  driverNames: Set<string>
) {
  const incidents = new Map<string, number>();
  const penalties = new Map<string, number>();
  for (const ev of stream) {
    if (ev.event_type === "Penalty") {
      const m = ev.text.match(/Penalty given to (.+?):/);
      if (m) {
        const d = m[1].trim();
        if (driverNames.has(d))
          penalties.set(d, (penalties.get(d) ?? 0) + 1);
      }
    } else if (ev.event_type === "Incident") {
      const involved = [...ev.text.matchAll(/([a-zA-Z0-9_ .#-]+)\(/g)].map(
        (x) => x[1].trim()
      );
      if (involved.length === 1 || involved.length === 2) {
        for (const d of involved) {
          if (driverNames.has(d))
            incidents.set(d, (incidents.get(d) ?? 0) + 1);
        }
      }
    }
  }
  return { incidents, penalties };
}

/** Couleurs des pilotes comparés (palette « dark » de la V1). */
const COMPARE_COLORS = ["#5c9ce6", "#48c774", "#e57373", "#ffd700"];

// ── Composant ────────────────────────────────────────────────────────────────

export function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [data, setData] = useState<SessionDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    queries
      .getSessionDetail(Number(id))
      .then((d) => setData(d))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <p className="text-muted-foreground">
          {error ?? t("sessionDetail.notFound")}
        </p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> {t("sessionDetail.back")}
        </Button>
      </div>
    );
  }

  return <SessionView data={data} />;
}

function SessionView({ data }: { data: SessionDetailData }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { session, siblings, results, laps, stream } = data;
  const isRace = session.session_type === "Race";
  // Setups associés à cette session (vue inverse de SetupDetail). Rechargé
  // après chaque lien/délier pour refléter l'état serveur.
  const [linkedSetups, setLinkedSetups] = useState<SetupForSession[]>([]);
  useEffect(() => {
    setupsApi
      .getForSession(session.id)
      .then(setLinkedSetups)
      .catch(() => setLinkedSetups([]));
  }, [session.id]);

  const driverNames = useMemo(
    () => new Set(results.map((r) => r.driver_name)),
    [results]
  );
  const { incidents, penalties } = useMemo(
    () => buildSummaries(stream, driverNames),
    [stream, driverNames]
  );

  const winner = results.find((r) => r.position === 1) ?? results[0];
  const maxLaps = useMemo(
    () => results.reduce((m, r) => Math.max(m, r.laps_count), 0),
    [results]
  );
  const lapsByDriver = useMemo(() => {
    const map = new Map<string, LapRow[]>();
    for (const l of laps) {
      if (!map.has(l.driver_name)) map.set(l.driver_name, []);
      map.get(l.driver_name)!.push(l);
    }
    return map;
  }, [laps]);

  const incidentEvents = stream.filter((e) => e.event_type === "Incident");
  const penaltyEvents = stream.filter((e) => e.event_type === "Penalty");
  const chatEvents = stream.filter((e) => e.event_type === "ChatMessage");
  const trackLimitEvents = stream.filter((e) => e.event_type === "TrackLimits");

  // Nom du joueur (depuis la ligne is_player) — utilisé pour surligner les
  // events de flux qui le mentionnent (incidents/pénalités/chat).
  const playerName = useMemo(
    () => results.find((r) => r.is_player)?.driver_name ?? "",
    [results]
  );

  // Ligne du joueur (résultat) et ses tours — base du bandeau « Performance
  // joueur » et du bloc d'infos pilote (DRIVER INFO).
  const playerResult = useMemo(
    () => results.find((r) => r.is_player) ?? null,
    [results]
  );
  // Classes uniques présentes dans cette session (multi-classes : LMP2 + GT3
  // par exemple). Triées suivant l'ordre canonique V1 (Hyper → LMP2 → GT3 …).
  const sessionClasses = useMemo(() => {
    const set = new Set<string>();
    for (const r of results) {
      if (r.car_class) set.add(r.car_class);
    }
    return Array.from(set).sort(
      (a, b) => classOrder(a) - classOrder(b),
    );
  }, [results]);
  const playerLaps = useMemo(
    () =>
      playerResult ? (lapsByDriver.get(playerResult.driver_name) ?? []) : [],
    [lapsByDriver, playerResult]
  );

  // Agrégats du joueur : meilleur tour, pire tour, moyenne, médiane, std dev,
  // consistency %, vmax, vitesse moyenne, conso essence par tour.
  const playerPerf = useMemo(() => {
    if (!playerResult) return null;
    const valid = playerLaps.filter(
      (l) => l.lap_time != null && l.lap_time > 0 && !l.is_pit
    );
    if (valid.length === 0) return null;
    const times = valid.map((l) => l.lap_time!);
    const sum = times.reduce((a, b) => a + b, 0);
    const avg = sum / times.length;
    const worst = Math.max(...times);
    const stdDev = playerResult.std_dev ?? 0;
    // Consistency = 100 - (CV %). Plus la dispersion est faible, plus c'est haut.
    const consistency =
      avg > 0 ? Math.max(0, Math.min(100, 100 - (stdDev / avg) * 100)) : 0;
    // Vitesse moyenne = distance / temps. track_length en mètres → diviser par 1000.
    const distanceKm = (session.track_length / 1000) * valid.length;
    const avgSpeed = sum > 0 ? distanceKm / (sum / 3600) : 0;
    // Conso : fuel_used est une fraction 0..1 ; on l'exprime en % du réservoir.
    const fuelUsed = valid
      .map((l) => l.fuel_used)
      .filter((v): v is number => v != null);
    const fuelPerLap =
      fuelUsed.length > 0
        ? (fuelUsed.reduce((a, b) => a + b, 0) / fuelUsed.length) * 100
        : null;
    return {
      bestLap: playerResult.best_lap,
      worstLap: worst,
      avgLap: avg,
      medianLap: playerResult.median_lap,
      stdDev,
      consistency,
      topSpeed: playerResult.vmax,
      avgSpeed,
      fuelPerLap,
    };
  }, [playerResult, playerLaps, session.track_length]);

  return (
    <div className="flex flex-col gap-5">
      {/* En-tête — Badge type session + circuit en grand + classe + sous-ligne */}
      <div className="flex items-start gap-3 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(-1)}
          className="mt-1 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <TrackFlag
              track={session.track_course || session.track}
              className="h-6 w-auto rounded-[2px] ring-1 ring-black/10 shrink-0"
            />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">
              {session.track_course || session.track}
            </h1>
          </div>
          {playerResult && (
            <div className="flex items-center gap-1.5 mt-1.5 text-sm font-mono text-foreground/80 flex-wrap">
              <CarLogo
                carName={playerResult.unique_car_name || playerResult.car_type}
                className="h-4 w-auto object-contain opacity-80"
              />
              <span className="font-semibold">
                {playerResult.unique_car_name || playerResult.car_type}
              </span>
              {playerResult.car_number > 0 && (
                <span className="text-muted-foreground">
                  · #{playerResult.car_number}
                </span>
              )}
              <span className="text-muted-foreground">
                · {formatDateTime(session.timestamp)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* DRIVER INFO (joueur) + SESSION SETTINGS (générale) côte à côte */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bloc joueur */}
        <Card className="overflow-hidden">
          <TableTitle
            title={
              <span className="inline-flex items-center gap-2">
                <User className="h-3.5 w-3.5" />
                {t("sessionDetail.driverInfo")}
              </span>
            }
          />
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
              {playerResult ? (
                <>
                  <InfoBlock
                    label={t("sessionDetail.fTeam")}
                    value={playerResult.team_name || "—"}
                  />
                  <InfoBlock
                    label={t("sessionDetail.fStatus")}
                    value={playerResult.finish_status || "—"}
                    accent={
                      playerResult.finish_status === "Finished Normally"
                    }
                  />
                  <InfoBlock
                    label={t("sessionDetail.fPosition")}
                    value={
                      playerResult.position > 0
                        ? `P${playerResult.position} / ${session.participants}`
                        : "—"
                    }
                    accent
                  />
                  <InfoBlock
                    label={t("sessionDetail.fGrid")}
                    value={
                      playerResult.grid_pos > 0
                        ? `P${playerResult.grid_pos}`
                        : "—"
                    }
                  />
                  <InfoBlock
                    label={t("sessionDetail.fGain")}
                    value={
                      playerResult.progression != null
                        ? (playerResult.progression > 0 ? "+" : "") +
                          playerResult.progression
                        : "—"
                    }
                    accent={
                      playerResult.progression != null &&
                      playerResult.progression > 0
                    }
                    negative={
                      playerResult.progression != null &&
                      playerResult.progression < 0
                    }
                  />
                  <InfoBlock
                    label={t("sessionDetail.fClassPos")}
                    value={
                      playerResult.class_position > 0
                        ? `P${playerResult.class_position}`
                        : "—"
                    }
                  />
                  <InfoBlock
                    label={t("sessionDetail.fCarNumber")}
                    value={
                      playerResult.car_number > 0
                        ? `#${playerResult.car_number}`
                        : "—"
                    }
                  />
                  <InfoBlock
                    label={t("sessionDetail.fPitstops")}
                    value={String(playerResult.pitstops)}
                  />
                  <InfoBlock
                    label={t("sessionDetail.fAids")}
                    value={playerResult.control_aids || "—"}
                    mono
                  />
                  {/* Setup utilisé — intégré aux infos pilote (vue inverse
                      de la liaison setup ↔ session). col-span-full pour
                      occuper toute la ligne sous les InfoBlocks. */}
                  <div className="col-span-full mt-1">
                    <SetupUsedInline
                      sessionId={session.id}
                      linkedSetups={linkedSetups}
                      playerCar={playerResult.unique_car_name ?? null}
                      navigate={navigate}
                      onChanged={() => {
                        setupsApi
                          .getForSession(session.id)
                          .then(setLinkedSetups)
                          .catch(() => {});
                      }}
                      t={t}
                    />
                  </div>
                </>
              ) : (
                <div className="col-span-full text-xs text-muted-foreground italic">
                  {t("sessionDetail.noPlayerInSession")}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bloc session */}
        <Card className="overflow-hidden">
          <TableTitle
            title={
              <span className="inline-flex items-center gap-2">
                <Settings2 className="h-3.5 w-3.5" />
                {t("sessionDetail.sessionSettings")}
              </span>
            }
          />
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
              {/* Classes présentes dans la session (multi-classes possible). */}
              <div className="min-w-0 col-span-2 sm:col-span-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  {sessionClasses.length > 1
                    ? t("sessionDetail.fClasses")
                    : t("sessionDetail.fClass")}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {sessionClasses.length === 0 ? (
                    <span className="text-muted-foreground text-xs">—</span>
                  ) : (
                    sessionClasses.map((cls) => (
                      <ClassBadge
                        key={cls}
                        carClass={cls}
                        solid={cls === playerResult?.car_class}
                      />
                    ))
                  )}
                </div>
              </div>
              <InfoBlock
                label={t("sessionDetail.fTrack")}
                value={session.track_course || session.track}
              />
              <InfoBlock
                label={t("sessionDetail.fTrackLength")}
                value={
                  session.track_length > 0
                    ? `${(session.track_length / 1000).toFixed(3)} km`
                    : "—"
                }
              />
              <InfoBlock
                label={t("sessionDetail.fTimeLimit")}
                value={
                  session.session_minutes > 0
                    ? t("sessionDetail.minutes", {
                        count: session.session_minutes,
                      })
                    : "—"
                }
              />
              <InfoBlock
                label={t("sessionDetail.fLapLimit")}
                value={
                  session.session_laps > 0 && session.session_laps < 1_000_000
                    ? t("sessionDetail.lapsCount", {
                        count: session.session_laps,
                      })
                    : "∞"
                }
              />
              <InfoBlock
                label={t("sessionDetail.fType")}
                value={
                  session.setting === "Multiplayer"
                    ? t("sessionDetail.online")
                    : session.setting
                }
              />
              <InfoBlock
                label={t("sessionDetail.fDrivers")}
                value={String(session.participants)}
              />
              <InfoBlock
                label={t("sessionDetail.fDamage")}
                value={
                  session.damage_mult > 0
                    ? `${session.damage_mult}%`
                    : "—"
                }
              />
              <InfoBlock
                label={t("sessionDetail.fVersion")}
                value={session.game_version}
              />
              <InfoBlock
                label={t("sessionDetail.fWinner")}
                value={winner ? winner.driver_name : "—"}
              />
              <InfoBlock
                label={t("sessionDetail.fFile")}
                value={session.filename}
                mono
              />
              {/* Sessions du weekend — si plusieurs sessions sœurs (Practice /
                  Qualify / Race d'un même évènement), on affiche un sélecteur
                  toggle pour naviguer entre elles. Sinon, juste un badge type
                  de session. Placé en bas de la grille (auparavant en haut). */}
              <div className="min-w-0 col-span-full">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  {siblings.length > 1
                    ? t("sessionDetail.fSessionsWeekend")
                    : t("sessionDetail.fSessionType")}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {siblings.length > 1 ? (
                    siblings.map((s) => (
                      <Button
                        key={s.id}
                        size="sm"
                        variant={s.id === session.id ? "default" : "outline"}
                        onClick={() => navigate(`/sessions/${s.id}`)}
                        className="h-6 px-2 text-[11px] font-semibold"
                      >
                        {sessionTypeLabel(s.session_type, t)}
                      </Button>
                    ))
                  ) : (
                    <Badge
                      variant={isRace ? "default" : "outline"}
                      className="text-[11px] font-bold uppercase tracking-wide"
                    >
                      {sessionTypeLabel(session.session_type, t)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bandeau Performance — joueur uniquement */}
      {playerPerf && (
        <Card className="overflow-hidden">
          <TableTitle
            title={
              <span className="inline-flex items-center gap-2">
                <Gauge className="h-3.5 w-3.5" />
                {t("sessionDetail.playerPerformance")}
              </span>
            }
          />
          <CardContent className="p-3">
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-x-3 gap-y-2">
              <PerfMetric
                label={t("sessionDetail.mBest")}
                value={formatTime(playerPerf.bestLap)}
                accent="text-success"
              />
              <PerfMetric
                label={t("sessionDetail.mWorst")}
                value={formatTime(playerPerf.worstLap)}
              />
              <PerfMetric
                label={t("sessionDetail.mAverage")}
                value={formatTime(playerPerf.avgLap)}
              />
              <PerfMetric
                label={t("sessionDetail.mMedian")}
                value={formatTime(playerPerf.medianLap)}
              />
              <PerfMetric
                label={t("sessionDetail.mStdDev")}
                value={`${playerPerf.stdDev.toFixed(3)}s`}
              />
              <PerfMetric
                label={t("sessionDetail.mConsistency")}
                value={`${playerPerf.consistency.toFixed(1)}%`}
                accent="text-amber-500"
              />
              <PerfMetric
                label={t("sessionDetail.mTopSpeed")}
                value={
                  playerPerf.topSpeed != null
                    ? `${playerPerf.topSpeed.toFixed(2)} km/h`
                    : "—"
                }
                accent="text-amber-500"
              />
              <PerfMetric
                label={t("sessionDetail.mAvgSpeed")}
                value={`${playerPerf.avgSpeed.toFixed(1)} km/h`}
              />
              <PerfMetric
                label={t("sessionDetail.mFuelPerLap")}
                value={
                  playerPerf.fuelPerLap != null
                    ? `${playerPerf.fuelPerLap.toFixed(2)}%`
                    : "—"
                }
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Onglets */}
      <Tabs defaultValue="result">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="result">
            {t("sessionDetail.tabResult")}
          </TabsTrigger>
          <TabsTrigger value="laps">{t("sessionDetail.tabLaps")}</TabsTrigger>
          <TabsTrigger value="best">{t("sessionDetail.tabBest")}</TabsTrigger>
          <TabsTrigger value="compare">
            {t("sessionDetail.tabCompare")}
          </TabsTrigger>
          <TabsTrigger value="strategy">
            {t("sessionDetail.tabStrategy")}
          </TabsTrigger>
          <TabsTrigger value="incidents">
            {t("sessionDetail.tabIncidents")} ({incidentEvents.length})
          </TabsTrigger>
          <TabsTrigger value="penalties">
            {t("sessionDetail.tabPenalties")} ({penaltyEvents.length})
          </TabsTrigger>
          <TabsTrigger value="chat">
            {t("sessionDetail.tabChat")} ({chatEvents.length})
          </TabsTrigger>
          {trackLimitEvents.length > 0 && (
            <TabsTrigger value="tracklimits">
              {t("sessionDetail.tabTrackLimits")} ({trackLimitEvents.length})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="result">
          <ClassificationTab
            results={results}
            isRace={isRace}
            maxLaps={maxLaps}
            winnerFinish={winner?.finish_time ?? null}
            incidents={incidents}
            penalties={penalties}
            lapsByDriver={lapsByDriver}
            playerResult={playerResult}
            participants={session.participants}
          />
        </TabsContent>

        <TabsContent value="laps">
          <LapsTab results={results} lapsByDriver={lapsByDriver} />
        </TabsContent>

        <TabsContent value="best">
          <BestLapsTab results={results} />
        </TabsContent>

        <TabsContent value="compare">
          <ComparisonTab
            results={results}
            lapsByDriver={lapsByDriver}
            isPractice={session.session_type.startsWith("Practice")}
            incidents={incidents}
            penalties={penalties}
          />
        </TabsContent>

        <TabsContent value="strategy">
          <StrategyTab results={results} lapsByDriver={lapsByDriver} />
        </TabsContent>

        <TabsContent value="incidents">
          <EventListTab
            events={incidentEvents}
            empty={t("sessionDetail.noIncidents")}
            playerName={playerName}
            showSeverity
          />
        </TabsContent>

        <TabsContent value="penalties">
          <EventListTab
            events={penaltyEvents}
            empty={t("sessionDetail.noPenalties")}
            playerName={playerName}
          />
        </TabsContent>

        <TabsContent value="chat">
          <EventListTab
            events={chatEvents}
            empty={t("sessionDetail.noMessages")}
            playerName={playerName}
          />
        </TabsContent>

        <TabsContent value="tracklimits">
          <TrackLimitsTab events={trackLimitEvents} playerName={playerName} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoBlock({
  label,
  value,
  mono,
  accent,
  negative,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </p>
      <p
        title={value}
        className={cn(
          "mt-0.5 font-semibold truncate",
          mono && "font-mono text-xs font-normal",
          accent && "text-success font-mono",
          negative && "text-destructive font-mono"
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** Métrique compacte pour le bandeau « Performance joueur ». */
function PerfMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-medium leading-tight">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-sm font-bold font-mono tabular-nums whitespace-nowrap",
          accent
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ── Onglet : Classement ──────────────────────────────────────────────────────

/**
 * Pastille de gomme dominante d'un pilote — Soft / Medium / Hard / Wet /
 * Intermediate. Code couleur calqué sur les compounds LMU/rF2.
 */
function CompoundBadge({ code }: { code: string | null }) {
  if (!code) return <span className="text-muted-foreground/40">—</span>;
  // Première lettre majuscule (S/M/H/W/I) — robuste aux variantes
  // ("Soft"/"soft"/"S"/"S1"…).
  const letter = code.trim().charAt(0).toUpperCase();
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    S: { bg: "bg-rose-500", fg: "text-white", label: "S" },
    M: { bg: "bg-amber-500", fg: "text-slate-900", label: "M" },
    H: { bg: "bg-slate-700 dark:bg-slate-300", fg: "text-white dark:text-slate-900", label: "H" },
    W: { bg: "bg-sky-500", fg: "text-white", label: "W" },
    I: { bg: "bg-emerald-500", fg: "text-white", label: "I" },
  };
  const def = map[letter] ?? {
    bg: "bg-muted",
    fg: "text-muted-foreground",
    label: letter || "?",
  };
  return (
    <span
      title={code}
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
        def.bg,
        def.fg
      )}
    >
      {def.label}
    </span>
  );
}

function ProgBadge({ value }: { value: number | null }) {
  if (value == null)
    return <span className="text-muted-foreground">N/A</span>;
  if (value > 0)
    return (
      <span className="text-success inline-flex items-center gap-0.5">
        <TrendingUp className="h-3 w-3" />+{value}
      </span>
    );
  if (value < 0)
    return (
      <span className="text-destructive inline-flex items-center gap-0.5">
        <TrendingDown className="h-3 w-3" />
        {value}
      </span>
    );
  return (
    <span className="text-muted-foreground inline-flex items-center gap-0.5">
      <Minus className="h-3 w-3" />0
    </span>
  );
}

function ClassificationTab({
  results,
  isRace,
  maxLaps,
  winnerFinish,
  incidents,
  penalties,
  lapsByDriver,
  playerResult,
  participants,
}: {
  results: ResultRow[];
  isRace: boolean;
  maxLaps: number;
  winnerFinish: number | null;
  incidents: Map<string, number>;
  penalties: Map<string, number>;
  lapsByDriver: Map<string, LapRow[]>;
  playerResult: ResultRow | null;
  participants: number;
}) {
  const { t } = useTranslation();

  const gapLabel = (r: ResultRow): string => {
    if (!isRace || r.finish_status !== "Finished Normally") return "—";
    if (r.position === 1) return formatTime(r.finish_time);
    const lapsBehind = maxLaps - r.laps_count;
    if (lapsBehind > 0)
      return t("sessionDetail.lapsBehind", { count: lapsBehind });
    if (winnerFinish != null && r.finish_time != null) {
      // Format V1 : `+12.345s` pour les petits écarts, `+m:ss.mmm` au-delà
      // (sinon « 252.643 » est illisible). Cf. `formatGap` dans utils.ts.
      return `+ ${formatGap(r.finish_time - winnerFinish)}`;
    }
    return "—";
  };

  const groups = useMemo(() => {
    if (!isRace) return [{ cls: "", rows: results }];
    const map = new Map<string, ResultRow[]>();
    for (const r of results) {
      if (!map.has(r.car_class)) map.set(r.car_class, []);
      map.get(r.car_class)!.push(r);
    }
    return [...map.entries()]
      .sort((a, b) => classOrder(a[0]) - classOrder(b[0]))
      .map(([cls, rows]) => ({
        cls,
        rows: [...rows].sort((x, y) => x.class_position - y.class_position),
      }));
  }, [results, isRace]);

  const bestOverall = results.reduce<number | null>(
    (m, r) =>
      r.best_lap != null && (m == null || r.best_lap < m) ? r.best_lap : m,
    null
  );
  const vmaxOverall = results.reduce((m, r) => Math.max(m, r.vmax ?? 0), 0);

  // Compound pneu dominant par pilote (le plus utilisé sur ses tours valides).
  // LMU expose `fcompound` / `rcompound` par tour ; on prend le compound avant
  // (le plus impactant pour le rythme).
  // Compound dominant par pilote (le plus fréquent). Le champ XML fcompound
  // est au format "0,Medium" — on extrait la partie après la virgule.
  const compoundByDriver = useMemo(() => {
    const out = new Map<string, string>();
    for (const [name, laps] of lapsByDriver) {
      const counts = new Map<string, number>();
      for (const l of laps) {
        if (l.fcompound) {
          const parts = l.fcompound.split(",");
          const cmpd = parts.length > 1 ? parts[1] : parts[0];
          if (cmpd) counts.set(cmpd, (counts.get(cmpd) ?? 0) + 1);
        }
      }
      if (counts.size > 0) {
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
        out.set(name, top);
      }
    }
    return out;
  }, [lapsByDriver]);

  // Export CSV du classement : génère un blob côté front et déclenche le DL.
  function exportCsv() {
    const header = [
      "Pos",
      "ClassPos",
      "Driver",
      "Team",
      "Car",
      "Class",
      "BestLap",
      "Laps",
      "Pits",
      "Status",
    ];
    const escape = (v: string) =>
      /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const rows = results.map((r) =>
      [
        String(r.position),
        String(r.class_position),
        r.driver_name,
        r.team_name || "",
        r.unique_car_name || r.car_type || "",
        r.car_class || "",
        r.best_lap != null ? formatTime(r.best_lap) : "",
        String(r.laps_count),
        String(r.pitstops),
        r.finish_status || "",
      ].map(escape).join(",")
    );
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "session_classification.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="px-1 flex items-center justify-between gap-3 flex-wrap">
        <Legend
          items={[
            { className: "bg-sky-500", label: t("sessionDetail.legendYourRow") },
            {
              icon: <Trophy className="h-3 w-3 text-yellow-500" />,
              label: t("sessionDetail.legendSessionBest"),
            },
            { className: "bg-primary", label: t("sessionDetail.legendVmax") },
          ]}
        />
        <div className="flex items-center gap-3 ml-auto">
          {playerResult && playerResult.class_position > 0 && (
            <span className="text-xs font-semibold text-sky-500 inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              {t("sessionDetail.you")} : P{playerResult.class_position}
              {participants > 0 && <span> / {participants}</span>}
            </span>
          )}
        </div>
      </div>
      {groups.map((g) => (
        <Card key={g.cls || "all"} className="overflow-hidden">
          <TableTitle
            title={
              g.cls ? (
                <span className="inline-flex items-center gap-2">
                  <ClassBadge carClass={g.cls} solid />{" "}
                  {t("sessionDetail.classification")}
                </span>
              ) : (
                t("sessionDetail.classification")
              )
            }
          />
          <CardContent className="p-0 overflow-x-auto">
            <Table className="text-xs [&_tbody_td:nth-child(n+6):nth-child(-n+10)]:bg-sky-500/[0.06] [&_tbody_td:nth-child(3)]:border-l [&_tbody_td:nth-child(3)]:border-border/55 [&_tbody_td:nth-child(6)]:border-l [&_tbody_td:nth-child(6)]:border-border/55 [&_tbody_td:nth-child(11)]:border-l [&_tbody_td:nth-child(11)]:border-border/55">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">
                    <Tip content={t("sessionDetail.colPosTip")}>{t("sessionDetail.colPos")}</Tip>
                  </TableHead>
                  <TableHead className="text-center">
                    <Tip content={t("sessionDetail.colProgTip")}>{t("sessionDetail.colProg")}</Tip>
                  </TableHead>
                  <TableHead className="border-l border-border/55">
                    {t("sessionDetail.colClass")}
                  </TableHead>
                  <TableHead>{t("sessionDetail.colDriver")}</TableHead>
                  <TableHead>{t("sessionDetail.colCar")}</TableHead>
                  <TableHead className="text-center border-l border-border/55 bg-sky-500/10">
                    {t("sessionDetail.colLaps")}
                  </TableHead>
                  <TableHead className="text-center bg-sky-500/10">
                    <Tip content={t("sessionDetail.colLedTip")}>{t("sessionDetail.colLed")}</Tip>
                  </TableHead>
                  <TableHead className="text-right bg-sky-500/10">
                    {t("sessionDetail.colTotalTime")}
                  </TableHead>
                  <TableHead className="text-right bg-sky-500/10">
                    <Tip content={t("sessionDetail.colBestLapTip")}>{t("sessionDetail.colBestLap")}</Tip>
                  </TableHead>
                  <TableHead className="text-right bg-sky-500/10">
                    <Tip content={t("sessionDetail.colVmaxTip")}>{t("sessionDetail.colVmax")}</Tip>
                  </TableHead>
                  <TableHead className="text-right border-l border-border/55">
                    <Tip content={t("sessionDetail.colFuelStartLong")}>{t("sessionDetail.colFuelStart")}</Tip>
                  </TableHead>
                  <TableHead className="text-right">
                    <Tip content={t("sessionDetail.colFuelEndLong")}>{t("sessionDetail.colFuelEnd")}</Tip>
                  </TableHead>
                  <TableHead className="text-center">
                    <Tip content={t("sessionDetail.colIncTip")}>{t("sessionDetail.colInc")}</Tip>
                  </TableHead>
                  <TableHead className="text-center">
                    <Tip content={t("sessionDetail.colPenTip")}>{t("sessionDetail.colPen")}</Tip>
                  </TableHead>
                  <TableHead className="text-center">
                    <Tip content={t("sessionDetail.colCompoundTip")}>{t("sessionDetail.compound")}</Tip>
                  </TableHead>
                  <TableHead>{t("sessionDetail.colStatus")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.rows.map((r, i) => {
                  const pos = isRace ? r.class_position : r.position;
                  const isBest =
                    r.best_lap != null &&
                    bestOverall != null &&
                    Math.abs(r.best_lap - bestOverall) < 0.001;
                  const isVmax =
                    r.vmax != null &&
                    vmaxOverall > 0 &&
                    Math.abs(r.vmax - vmaxOverall) < 0.01;
                  return (
                    <TableRow
                      key={r.id}
                      className={cn(
                        r.is_player
                          ? "bg-sky-500/15"
                          : i % 2 === 1 && "bg-muted/20"
                      )}
                    >
                      <TableCell className="text-center font-bold">
                        {pos <= 3 && isRace ? (
                          <span className="inline-flex items-center gap-1">
                            <Trophy
                              className={cn(
                                "h-3.5 w-3.5",
                                pos === 1 && "text-yellow-500",
                                pos === 2 && "text-slate-400",
                                pos === 3 && "text-yellow-700"
                              )}
                            />
                            {pos}
                          </span>
                        ) : (
                          pos
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {isRace &&
                        (isRace ? r.class_grid_pos : r.grid_pos) > 0 &&
                        r.finish_status === "Finished Normally" ? (
                          <ProgBadge
                            value={
                              (isRace ? r.class_grid_pos : r.grid_pos) - pos
                            }
                          />
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <ClassBadge carClass={r.car_class} size="sm" />
                      </TableCell>
                      <TableCell
                        className={cn(
                          "font-medium whitespace-nowrap",
                          r.is_player && "text-sky-400"
                        )}
                      >
                        {r.driver_name}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <CarLogo
                            carName={r.car_type}
                            className="h-3.5 w-auto object-contain opacity-80"
                          />
                          <span className="whitespace-nowrap">
                            {r.car_type}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {r.laps_count}
                      </TableCell>
                      <TableCell className="text-center">
                        {r.laps_led || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono whitespace-nowrap">
                        {gapLabel(r)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono",
                          isBest && "text-yellow-500 font-semibold"
                        )}
                      >
                        {isBest && "🏆 "}
                        {formatTime(r.best_lap)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono",
                          isVmax && "text-primary font-semibold"
                        )}
                      >
                        {r.vmax != null ? `${r.vmax.toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {r.start_fuel != null
                          ? `${r.start_fuel.toFixed(1)}%`
                          : "N/A"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {r.finish_fuel != null
                          ? `${r.finish_fuel.toFixed(1)}%`
                          : "N/A"}
                      </TableCell>
                      <TableCell className="text-center">
                        {incidents.get(r.driver_name) ?? 0}
                      </TableCell>
                      <TableCell className="text-center">
                        {penalties.get(r.driver_name) ?? 0}
                      </TableCell>
                      <TableCell className="text-center">
                        <CompoundBadge
                          code={compoundByDriver.get(r.driver_name) ?? null}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.finish_status}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Onglet : Tours course ────────────────────────────────────────────────────

function LapsTab({
  results,
  lapsByDriver,
}: {
  results: ResultRow[];
  lapsByDriver: Map<string, LapRow[]>;
}) {
  const { t } = useTranslation();
  const TOL = 0.0005; // tolérance flottants : 0.5 ms (évite les faux positifs à 1 ms)
  const driversWithLaps = results.filter(
    (r) => (lapsByDriver.get(r.driver_name)?.length ?? 0) > 0
  );
  const player = driversWithLaps.find((r) => r.is_player);

  // ── Meilleurs absolus toutes voitures confondues ──────────────────────────
  const allLaps = driversWithLaps.flatMap(
    (r) => lapsByDriver.get(r.driver_name) ?? []
  );
  const overallBestLap = allLaps.reduce<number | null>(
    (min, l) =>
      l.lap_time != null && l.is_valid && (min == null || l.lap_time < min)
        ? l.lap_time
        : min,
    null
  );
  const overallBestS1 = allLaps.reduce<number | null>(
    (min, l) => (l.s1 != null && (min == null || l.s1 < min) ? l.s1 : min),
    null
  );
  const overallBestS2 = allLaps.reduce<number | null>(
    (min, l) => (l.s2 != null && (min == null || l.s2 < min) ? l.s2 : min),
    null
  );
  const overallBestS3 = allLaps.reduce<number | null>(
    (min, l) => (l.s3 != null && (min == null || l.s3 < min) ? l.s3 : min),
    null
  );

  const scrollToDriver = (resultId: number) => {
    document
      .getElementById(`laps-${resultId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 flex-wrap sticky top-14 z-10 bg-background/95 backdrop-blur py-2">
        {player && (
          <Button size="sm" onClick={() => scrollToDriver(player.id)}>
            <Crosshair className="h-3.5 w-3.5 mr-1.5" />
            {t("sessionDetail.myLaps")}
          </Button>
        )}
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) scrollToDriver(Number(e.target.value));
          }}
          className="h-9 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">{t("sessionDetail.goToDriver")}</option>
          {driversWithLaps.map((r) => (
            <option key={r.id} value={r.id}>
              {r.driver_name}
            </option>
          ))}
        </select>
        <div className="ml-auto">
          <Legend
            items={[
              {
                icon: <Trophy className="h-3 w-3 text-yellow-500 shrink-0" />,
                label: t("sessionDetail.legendBestLap"),
              },
              {
                className: "bg-yellow-500",
                label: t("sessionDetail.legendBestLapDriver"),
              },
              {
                icon: <Trophy className="h-3 w-3 text-purple-400 shrink-0" />,
                label: t("sessionDetail.legendBestSector"),
              },
              {
                className: "bg-purple-400",
                label: t("sessionDetail.legendBestSectorDriver"),
              },
              {
                className: "bg-destructive/40",
                label: t("sessionDetail.legendInvalid"),
              },
              { className: "bg-muted", label: t("sessionDetail.legendPit") },
              {
                className: "bg-sky-500",
                label: t("sessionDetail.legendYourCar"),
              },
            ]}
          />
        </div>
      </div>

      {driversWithLaps.map((r) => {
        const dl = lapsByDriver.get(r.driver_name) ?? [];

        // Meilleurs personnels du pilote (pour la couleur sans coupe)
        const driverBestLap = dl.reduce<number | null>(
          (min, l) =>
            l.lap_time != null && l.is_valid && (min == null || l.lap_time < min)
              ? l.lap_time
              : min,
          null
        );
        const driverBestS1 = dl.reduce<number | null>(
          (min, l) => (l.s1 != null && (min == null || l.s1 < min) ? l.s1 : min),
          null
        );
        const driverBestS2 = dl.reduce<number | null>(
          (min, l) => (l.s2 != null && (min == null || l.s2 < min) ? l.s2 : min),
          null
        );
        const driverBestS3 = dl.reduce<number | null>(
          (min, l) => (l.s3 != null && (min == null || l.s3 < min) ? l.s3 : min),
          null
        );

        return (
          <Card
            key={r.id}
            id={`laps-${r.id}`}
            className={cn(
              "overflow-hidden scroll-mt-28",
              r.is_player && "ring-1 ring-sky-500"
            )}
          >
            <TableTitle
              title={
                <span className="inline-flex items-center gap-2">
                  <ClassBadge carClass={r.car_class} solid />
                  {r.driver_name} — {r.car_type}
                </span>
              }
            />
            <CardContent className="p-0 overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center w-10">
                      {t("sessionDetail.colLap")}
                    </TableHead>
                    <TableHead className="text-center w-8">
                      <Tip content={t("sessionDetail.colPosTip")}>{t("sessionDetail.colPos")}</Tip>
                    </TableHead>
                    <TableHead className="text-right">
                      <Tip content={t("sessionDetail.colTimeTip")}>{t("sessionDetail.colTime")}</Tip>
                    </TableHead>
                    <TableHead className="text-right">
                      <Tip content={t("sessionDetail.colS1Tip")}>S1</Tip>
                    </TableHead>
                    <TableHead className="text-right">
                      <Tip content={t("sessionDetail.colS2Tip")}>S2</Tip>
                    </TableHead>
                    <TableHead className="text-right">
                      <Tip content={t("sessionDetail.colS3Tip")}>S3</Tip>
                    </TableHead>
                    <TableHead className="text-right">
                      <Tip content={t("sessionDetail.colVmaxTip")}>{t("sessionDetail.colVmax")}</Tip>
                    </TableHead>
                    <TableHead className="text-right text-amber-500">
                      <Tip content={t("sessionDetail.colFuelTip")}>{t("sessionDetail.colFuel")}</Tip>
                    </TableHead>
                    <TableHead className="text-right text-amber-500">
                      <Tip content={t("sessionDetail.colUsedTip")}>{t("sessionDetail.colUsed")}</Tip>
                    </TableHead>
                    <TableHead className="text-right text-sky-400">
                      <Tip content={t("live.tireFL")}>{t("sessionDetail.colTireFL")}</Tip>
                    </TableHead>
                    <TableHead className="text-right text-sky-400">
                      <Tip content={t("live.tireFR")}>{t("sessionDetail.colTireFR")}</Tip>
                    </TableHead>
                    <TableHead className="text-right text-sky-400">
                      <Tip content={t("live.tireRL")}>{t("sessionDetail.colTireRL")}</Tip>
                    </TableHead>
                    <TableHead className="text-right text-sky-400">
                      <Tip content={t("live.tireRR")}>{t("sessionDetail.colTireRR")}</Tip>
                    </TableHead>
                    <TableHead className="text-center">
                      <Tip content={t("sessionDetail.colCmpdTip")}>{t("sessionDetail.colCmpd")}</Tip>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dl.map((l) => {
                    // Meilleur absolu (coupe + couleur)
                    const isBest =
                      l.lap_time != null && l.is_valid &&
                      overallBestLap != null &&
                      Math.abs(l.lap_time - overallBestLap) < TOL;
                    const isBestS1 =
                      l.s1 != null && overallBestS1 != null &&
                      Math.abs(l.s1 - overallBestS1) < TOL;
                    const isBestS2 =
                      l.s2 != null && overallBestS2 != null &&
                      Math.abs(l.s2 - overallBestS2) < TOL;
                    const isBestS3 =
                      l.s3 != null && overallBestS3 != null &&
                      Math.abs(l.s3 - overallBestS3) < TOL;
                    // Meilleur personnel du pilote (couleur seule, sans coupe)
                    const isDriverBest =
                      !isBest &&
                      l.lap_time != null && l.is_valid &&
                      driverBestLap != null &&
                      Math.abs(l.lap_time - driverBestLap) < TOL;
                    const isDriverBestS1 =
                      !isBestS1 && l.s1 != null && driverBestS1 != null &&
                      Math.abs(l.s1 - driverBestS1) < TOL;
                    const isDriverBestS2 =
                      !isBestS2 && l.s2 != null && driverBestS2 != null &&
                      Math.abs(l.s2 - driverBestS2) < TOL;
                    const isDriverBestS3 =
                      !isBestS3 && l.s3 != null && driverBestS3 != null &&
                      Math.abs(l.s3 - driverBestS3) < TOL;
                    // Compound : "0,Medium" → "Medium"
                    const cmpd = l.fcompound
                      ? (() => {
                          const p = l.fcompound.split(",");
                          return p.length > 1 ? p[1] : p[0];
                        })()
                      : null;
                    // Usure pneu en % : (1 - condition) * 100
                    const tw = (v: number | null) =>
                      v != null ? `${((1 - v) * 100).toFixed(1)}` : "—";
                    // Carburant utilisé ce tour : positif = consommé, négatif = rechargé au stand
                    const fuelUsedDisplay = (v: number | null) => {
                      if (v == null) return "—";
                      if (v < -0.001) return <span className="text-success text-[9px]">+PIT</span>;
                      if (v > 0.15) return "—"; // outlap avec réservoir plein — valeur aberrante
                      return `${(v * 100).toFixed(1)}%`;
                    };
                    return (
                      <TableRow
                        key={l.lap_num}
                        className={cn(
                          !l.is_valid && "bg-destructive/10",
                          l.is_pit && "bg-muted/40"
                        )}
                      >
                        <TableCell className="text-center font-mono">
                          {l.lap_num}
                          {l.is_pit && (
                            <span className="text-[9px] bg-muted text-muted-foreground rounded px-0.5 ml-1">
                              P
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {l.position || "—"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-mono",
                            (isBest || isDriverBest) && "text-yellow-500 font-semibold",
                            !l.is_valid && "text-destructive line-through"
                          )}
                        >
                          <span className="inline-flex items-center justify-end gap-0.5">
                            {isBest && <Trophy className="h-3 w-3 shrink-0" />}
                            {l.lap_time != null ? formatTime(l.lap_time) : "N/A"}
                          </span>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-mono",
                            (isBestS1 || isDriverBestS1) && "text-purple-400 font-semibold"
                          )}
                        >
                          <span className="inline-flex items-center justify-end gap-0.5">
                            {isBestS1 && <Trophy className="h-2.5 w-2.5 shrink-0" />}
                            {formatSectorSeconds(l.s1)}
                          </span>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-mono",
                            (isBestS2 || isDriverBestS2) && "text-purple-400 font-semibold"
                          )}
                        >
                          <span className="inline-flex items-center justify-end gap-0.5">
                            {isBestS2 && <Trophy className="h-2.5 w-2.5 shrink-0" />}
                            {formatSectorSeconds(l.s2)}
                          </span>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-mono",
                            (isBestS3 || isDriverBestS3) && "text-purple-400 font-semibold"
                          )}
                        >
                          <span className="inline-flex items-center justify-end gap-0.5">
                            {isBestS3 && <Trophy className="h-2.5 w-2.5 shrink-0" />}
                            {formatSectorSeconds(l.s3)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {l.top_speed != null
                            ? l.top_speed.toFixed(1)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-amber-500">
                          {l.fuel != null
                            ? `${(l.fuel * 100).toFixed(1)}%`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-amber-400/80">
                          {fuelUsedDisplay(l.fuel_used)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-[11px]">
                          {tw(l.twfl)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-[11px]">
                          {tw(l.twfr)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-[11px]">
                          {tw(l.twrl)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-[11px]">
                          {tw(l.twrr)}
                        </TableCell>
                        <TableCell className="text-center">
                          <CompoundBadge code={cmpd} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Onglet : Meilleurs tours ─────────────────────────────────────────────────

function BestLapsTab({ results }: { results: ResultRow[] }) {
  const { t } = useTranslation();
  const sorted = [...results]
    .filter((r) => r.best_lap != null)
    .sort((a, b) => (a.best_lap ?? 0) - (b.best_lap ?? 0));

  // Meilleurs absolus de la session (pour les coupes)
  const TOL = 0.0005; // tolérance flottants : 0.5 ms
  const bestLap = sorted[0]?.best_lap ?? null;
  const bestS1 = sorted.reduce<number | null>(
    (m, r) => (r.best_lap_s1 != null && (m == null || r.best_lap_s1 < m) ? r.best_lap_s1 : m),
    null
  );
  const bestS2 = sorted.reduce<number | null>(
    (m, r) => (r.best_lap_s2 != null && (m == null || r.best_lap_s2 < m) ? r.best_lap_s2 : m),
    null
  );
  const bestS3 = sorted.reduce<number | null>(
    (m, r) => (r.best_lap_s3 != null && (m == null || r.best_lap_s3 < m) ? r.best_lap_s3 : m),
    null
  );

  return (
    <Card className="overflow-hidden">
      <TableTitle title={t("sessionDetail.bestLapsTitle")} />
      <CardContent className="p-0 overflow-x-auto">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="text-center">#</TableHead>
              <TableHead>{t("sessionDetail.colDriver")}</TableHead>
              <TableHead>{t("sessionDetail.colClass")}</TableHead>
              <TableHead className="text-right">
                <Tip content={t("sessionDetail.colBestLapTip")}>{t("sessionDetail.colBestLap")}</Tip>
              </TableHead>
              <TableHead className="text-right">
                <Tip content={t("sessionDetail.colS1Tip")}>S1</Tip>
              </TableHead>
              <TableHead className="text-right">
                <Tip content={t("sessionDetail.colS2Tip")}>S2</Tip>
              </TableHead>
              <TableHead className="text-right">
                <Tip content={t("sessionDetail.colS3Tip")}>S3</Tip>
              </TableHead>
              <TableHead className="text-right">
                <Tip content={t("sessionDetail.colOptimalTip")}>{t("sessionDetail.colOptimal")}</Tip>
              </TableHead>
              <TableHead className="text-right">
                <Tip content={t("sessionDetail.colVmaxTip")}>{t("sessionDetail.colVmax")}</Tip>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r, i) => {
              const isBest   = r.best_lap    != null && bestLap != null && Math.abs(r.best_lap    - bestLap) < TOL;
              const isBestS1 = r.best_lap_s1 != null && bestS1  != null && Math.abs(r.best_lap_s1 - bestS1)  < TOL;
              const isBestS2 = r.best_lap_s2 != null && bestS2  != null && Math.abs(r.best_lap_s2 - bestS2)  < TOL;
              const isBestS3 = r.best_lap_s3 != null && bestS3  != null && Math.abs(r.best_lap_s3 - bestS3)  < TOL;
              return (
                <TableRow
                  key={r.id}
                  className={cn(r.is_player && "bg-sky-500/15")}
                >
                  <TableCell className="text-center font-bold">
                    {i + 1}
                  </TableCell>
                  <TableCell
                    className={cn("font-medium", r.is_player && "text-sky-400")}
                  >
                    {r.driver_name}
                  </TableCell>
                  <TableCell>
                    <ClassBadge carClass={r.car_class} size="sm" />
                  </TableCell>
                  <TableCell className={cn("text-right font-mono font-semibold", isBest && "text-yellow-500")}>
                    <span className="inline-flex items-center justify-end gap-0.5">
                      {isBest && <Trophy className="h-3 w-3 shrink-0" />}
                      {formatTime(r.best_lap)}
                    </span>
                  </TableCell>
                  <TableCell className={cn("text-right font-mono", isBestS1 && "text-purple-400 font-semibold")}>
                    <span className="inline-flex items-center justify-end gap-0.5">
                      {isBestS1 && <Trophy className="h-2.5 w-2.5 shrink-0" />}
                      {formatSectorSeconds(r.best_lap_s1)}
                    </span>
                  </TableCell>
                  <TableCell className={cn("text-right font-mono", isBestS2 && "text-purple-400 font-semibold")}>
                    <span className="inline-flex items-center justify-end gap-0.5">
                      {isBestS2 && <Trophy className="h-2.5 w-2.5 shrink-0" />}
                      {formatSectorSeconds(r.best_lap_s2)}
                    </span>
                  </TableCell>
                  <TableCell className={cn("text-right font-mono", isBestS3 && "text-purple-400 font-semibold")}>
                    <span className="inline-flex items-center justify-end gap-0.5">
                      {isBestS3 && <Trophy className="h-2.5 w-2.5 shrink-0" />}
                      {formatSectorSeconds(r.best_lap_s3)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-purple">
                    {formatTime(r.optimal_lap)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {r.vmax != null ? r.vmax.toFixed(2) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Onglet : Stratégie ───────────────────────────────────────────────────────

function StrategyTab({
  results,
  lapsByDriver,
}: {
  results: ResultRow[];
  lapsByDriver: Map<string, LapRow[]>;
}) {
  const { t } = useTranslation();
  return (
    <Card className="overflow-hidden">
      <TableTitle title={t("sessionDetail.strategyTitle")} />
      <CardContent className="p-0 overflow-x-auto">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>{t("sessionDetail.colDriver")}</TableHead>
              <TableHead>{t("sessionDetail.colClass")}</TableHead>
              <TableHead className="text-center">
                <Tip content={t("sessionDetail.colStopsTip")}>{t("sessionDetail.colStops")}</Tip>
              </TableHead>
              <TableHead className="text-right">
                <Tip content={t("sessionDetail.colFuelTip")}>{t("sessionDetail.colFuelStartLong")}</Tip>
              </TableHead>
              <TableHead className="text-right">
                <Tip content={t("sessionDetail.colFuelTip")}>{t("sessionDetail.colFuelEndLong")}</Tip>
              </TableHead>
              <TableHead>
                <Tip content={t("sessionDetail.colCompoundsTip")}>{t("sessionDetail.colCompounds")}</Tip>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((r) => {
              const dl = lapsByDriver.get(r.driver_name) ?? [];
              // Déduplique les compounds utilisés dans l'ordre d'apparition.
              // fcompound = "0,Medium" → prendre la partie après la virgule.
              const compounds = [
                ...new Set(
                  dl
                    .map((l) => {
                      const parts = l.fcompound.split(",");
                      return parts.length > 1 ? parts[1] : parts[0];
                    })
                    .filter((c) => c && c !== "")
                ),
              ];
              return (
                <TableRow
                  key={r.id}
                  className={cn(r.is_player && "bg-sky-500/15")}
                >
                  <TableCell
                    className={cn(
                      "font-medium",
                      r.is_player && "text-sky-400"
                    )}
                  >
                    {r.driver_name}
                  </TableCell>
                  <TableCell>
                    <ClassBadge carClass={r.car_class} size="sm" />
                  </TableCell>
                  <TableCell className="text-center">{r.pitstops}</TableCell>
                  <TableCell className="text-right font-mono">
                    {r.start_fuel != null
                      ? `${r.start_fuel.toFixed(1)}%`
                      : "N/A"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.finish_fuel != null
                      ? `${r.finish_fuel.toFixed(1)}%`
                      : "N/A"}
                  </TableCell>
                  <TableCell>
                    {compounds.length > 0 ? (
                      <div className="flex items-center gap-1">
                        {compounds.map((c, i) => (
                          <CompoundBadge key={i} code={c} />
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Onglet : liste d'événements (incidents / pénalités / chat) ───────────────

/** Extrait le score de sévérité d'un incident (dernier nombre entre parenthèses). */
function parseSeverity(text: string): number | null {
  const matches = [...text.matchAll(/\((\d+\.?\d*)\)/g)];
  if (matches.length === 0) return null;
  const val = parseFloat(matches[matches.length - 1][1]);
  return isNaN(val) ? null : val;
}

/** Badge de sévérité : faible / moyen / élevé selon le score LMU. */
function SeverityBadge({ score }: { score: number | null }) {
  if (score == null)
    return <span className="text-muted-foreground/50 text-[10px]">—</span>;
  if (score >= 50)
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-destructive">
        <AlertTriangle className="h-3 w-3" />
        {score.toFixed(0)}
      </span>
    );
  if (score >= 20)
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-500">
        <AlertTriangle className="h-3 w-3" />
        {score.toFixed(0)}
      </span>
    );
  return (
    <span className="text-[10px] text-muted-foreground font-mono">
      {score.toFixed(0)}
    </span>
  );
}

function EventListTab({
  events,
  empty,
  playerName,
  showSeverity = false,
}: {
  events: SessionDetailData["stream"];
  empty: string;
  /** Nom du joueur — surligne les events qui le mentionnent. Vide = pas de highlight. */
  playerName: string;
  /** Affiche la colonne de sévérité (incidents uniquement). */
  showSeverity?: boolean;
}) {
  const { t } = useTranslation();

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          {empty}
        </CardContent>
      </Card>
    );
  }

  // Le chat LMU utilise une forme abrégée du nom : initiale du prénom + nom
  // (« Cris Tof » → « C Tof »). On ajoute cette variante pour matcher les
  // messages du joueur, en plus du nom complet (incidents/pénalités).
  const shortName = (() => {
    const parts = playerName.trim().split(/\s+/);
    if (parts.length < 2 || !parts[0]) return "";
    return `${parts[0][0]} ${parts.slice(1).join(" ")}`;
  })();

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">
                <Tip content={t("sessionDetail.colTimeTip")}>{t("sessionDetail.colTime")}</Tip>
              </TableHead>
              {showSeverity && (
                <TableHead className="w-16">
                  <Tip content={t("sessionDetail.colSeverityTip")}>{t("sessionDetail.colSeverity")}</Tip>
                </TableHead>
              )}
              <TableHead>{t("sessionDetail.colDescription")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e, i) => {
              // Implication du joueur : nom complet (incidents/pénalités, V1
              // regex) OU forme abrégée « C Tof » (chat LMU). Match substring
              // — couvre les 3 formats.
              const isPlayer =
                playerName !== "" &&
                (e.text.includes(playerName) ||
                  (shortName !== "" && e.text.includes(shortName)));
              const severity = showSeverity ? parseSeverity(e.text) : null;
              return (
                <TableRow
                  key={i}
                  className={cn(isPlayer && "bg-sky-500/10 border-l-2 border-sky-500")}
                >
                  <TableCell className="font-mono text-muted-foreground align-top">
                    {Math.floor(e.et / 60)}:
                    {Math.floor(e.et % 60)
                      .toString()
                      .padStart(2, "0")}
                  </TableCell>
                  {showSeverity && (
                    <TableCell className="align-top">
                      <SeverityBadge score={severity} />
                    </TableCell>
                  )}
                  <TableCell
                    className={cn(
                      "text-sm",
                      isPlayer && "font-medium text-sky-300"
                    )}
                  >
                    {e.text}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Onglet : Limites de piste ─────────────────────────────────────────────────

/** Données parsées d'un événement TrackLimits enrichi. */
interface TrackLimitRow {
  et: number;
  lap: number | null;
  warningPts: number | null;
  totalPts: number | null;
  driver: string | null;
  resolution: string;
}

/** Parse un événement TrackLimits depuis le champ `text` stocké en base.
 *  Nouveau format (après réindexation) : `{Lap}|{WP}|{CP}|{Driver}|{Resolution}`
 *  Ancien format (avant) : texte libre (ex. "No Further Action").
 */
function parseTrackLimitEvent(ev: SessionDetailData["stream"][number]): TrackLimitRow {
  const pipeIdx = ev.text.indexOf("|");
  if (pipeIdx !== -1) {
    const parts = ev.text.split("|");
    if (parts.length >= 5) {
      return {
        et: ev.et,
        lap: parseInt(parts[0]) ?? null,
        warningPts: parseFloat(parts[1]) || null,
        totalPts: parseFloat(parts[2]) || null,
        driver: parts[3] || null,
        resolution: parts.slice(4).join("|"),
      };
    }
  }
  // Ancien format sans structure
  return {
    et: ev.et,
    lap: null,
    warningPts: null,
    totalPts: null,
    driver: null,
    resolution: ev.text,
  };
}

function TrackLimitsTab({
  events,
  playerName,
}: {
  events: SessionDetailData["stream"];
  playerName: string;
}) {
  const { t } = useTranslation();

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          {t("sessionDetail.noTrackLimits")}
        </CardContent>
      </Card>
    );
  }

  const rows = events.map(parseTrackLimitEvent);
  const hasStructured = rows.some((r) => r.lap !== null);

  return (
    <Card className="overflow-hidden">
      <TableTitle
        title={
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t("sessionDetail.trackLimitsTitle")} ({events.length})
          </span>
        }
      />
      <CardContent className="p-0 overflow-x-auto">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>
                <Tip content={t("sessionDetail.colTimeTip")}>{t("sessionDetail.colTime")}</Tip>
              </TableHead>
              {hasStructured && (
                <>
                  <TableHead className="text-center">
                    {t("sessionDetail.colLap")}
                  </TableHead>
                  <TableHead className="text-right text-amber-500">
                    <Tip content={t("sessionDetail.colWarningPtsTip")}>{t("sessionDetail.colWarningPts")}</Tip>
                  </TableHead>
                  <TableHead className="text-right text-amber-500">
                    <Tip content={t("sessionDetail.colTotalPtsTip")}>{t("sessionDetail.colTotalPts")}</Tip>
                  </TableHead>
                  <TableHead>{t("sessionDetail.colDriver")}</TableHead>
                </>
              )}
              <TableHead>
                <Tip content={t("sessionDetail.colResolutionTip")}>{t("sessionDetail.colResolution")}</Tip>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => {
              const isPlayer =
                playerName !== "" &&
                r.driver !== null &&
                r.driver.includes(playerName.split(" ")[0] ?? "");
              const isCut = r.resolution.toLowerCase().includes("cut") ||
                r.resolution.toLowerCase().includes("invalid");
              return (
                <TableRow
                  key={i}
                  className={cn(
                    isPlayer && "bg-sky-500/10",
                    isCut && "bg-amber-500/5"
                  )}
                >
                  {/* Heure — format mm:ss.mmm */}
                  <TableCell className="font-mono text-muted-foreground">
                    {Math.floor(r.et / 60)}:
                    {(r.et % 60).toFixed(3).padStart(6, "0")}
                  </TableCell>
                  {hasStructured && (
                    <>
                      <TableCell className="text-center font-mono">
                        {r.lap ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-amber-500">
                        {r.warningPts != null ? r.warningPts.toFixed(2) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-amber-500">
                        {r.totalPts != null ? r.totalPts.toFixed(2) : "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "font-medium whitespace-nowrap",
                          isPlayer && "text-sky-400"
                        )}
                      >
                        {r.driver || "—"}
                      </TableCell>
                    </>
                  )}
                  <TableCell
                    className={cn(
                      isCut && "text-amber-500 font-medium"
                    )}
                  >
                    {r.resolution || "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Onglet : Comparaison pilotes ─────────────────────────────────────────────

type CompareStat = {
  key: string;
  label: string;
  value: (r: ResultRow) => number;
  render: (r: ResultRow) => string;
  lowerBetter?: boolean;
  overallBest?: number;
};

function ComparisonTab({
  results,
  lapsByDriver,
  isPractice,
  incidents,
  penalties,
}: {
  results: ResultRow[];
  lapsByDriver: Map<string, LapRow[]>;
  isPractice: boolean;
  incidents: Map<string, number>;
  penalties: Map<string, number>;
}) {
  const { t } = useTranslation();
  const [slots, setSlots] = useState<string[]>(() => {
    const player = results.find((r) => r.is_player);
    return [player?.driver_name ?? "", "", "", ""];
  });
  const [chartMode, setChartMode] = useState<"position" | "lap" | "gap">(
    "position"
  );
  const selected = useMemo(
    () => [...new Set(slots.filter((s) => s !== ""))],
    [slots]
  );

  const sortedDrivers = useMemo(
    () =>
      [...results].sort((a, b) =>
        a.driver_name.toLowerCase().localeCompare(b.driver_name.toLowerCase())
      ),
    [results]
  );

  const overall = useMemo(() => {
    const min = (vals: (number | null)[]) => {
      const v = vals.filter((x): x is number => x != null && x > 0);
      return v.length ? Math.min(...v) : Infinity;
    };
    return {
      bestLap: min(results.map((r) => r.best_lap)),
      s1: min(results.map((r) => r.abs_best_s1)),
      s2: min(results.map((r) => r.abs_best_s2)),
      s3: min(results.map((r) => r.abs_best_s3)),
    };
  }, [results]);

  const maxLaps = useMemo(
    () => results.reduce((m, r) => Math.max(m, r.laps_count), 0),
    [results]
  );

  const cumulByDriver = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const [d, laps] of lapsByDriver) {
      const cumul: number[] = [];
      let sum = 0;
      for (const l of laps) {
        sum += l.lap_time ?? 0;
        cumul.push(sum);
      }
      map.set(d, cumul);
    }
    return map;
  }, [lapsByDriver]);

  const colorOf = (name: string) =>
    COMPARE_COLORS[slots.indexOf(name)] ?? COMPARE_COLORS[0];

  const setSlot = (index: number, name: string) => {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = name;
      return next;
    });
  };

  const chartData = useMemo(() => {
    const rows: Record<string, number | null>[] = [];
    for (let i = 0; i < maxLaps; i++) {
      let leader = Infinity;
      for (const cumul of cumulByDriver.values()) {
        if (cumul[i] != null) leader = Math.min(leader, cumul[i]);
      }
      const row: Record<string, number | null> = { lap: i + 1 };
      for (const d of selected) {
        const laps = lapsByDriver.get(d) ?? [];
        const lap = laps[i];
        if (chartMode === "position") {
          row[d] = lap && lap.position > 0 ? lap.position : null;
        } else if (chartMode === "lap") {
          row[d] = lap?.lap_time ?? null;
        } else {
          const cumul = cumulByDriver.get(d);
          row[d] =
            cumul && cumul[i] != null && leader !== Infinity
              ? Number((cumul[i] - leader).toFixed(3))
              : null;
        }
      }
      rows.push(row);
    }
    return rows;
  }, [maxLaps, selected, chartMode, lapsByDriver, cumulByDriver]);

  if (isPractice) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          {t("sessionDetail.compareNoPractice")}
        </CardContent>
      </Card>
    );
  }

  const selectedResults = selected
    .map((name) => results.find((r) => r.driver_name === name))
    .filter((r): r is ResultRow => r != null);

  const stats: CompareStat[] = [
    {
      key: "finish_pos",
      label: t("sessionDetail.statFinishPos"),
      lowerBetter: true,
      value: (r) => (r.position > 0 ? r.position : Infinity),
      render: (r) => (r.position > 0 ? String(r.position) : "N/A"),
    },
    {
      key: "start_pos",
      label: t("sessionDetail.statStartPos"),
      lowerBetter: true,
      value: (r) => (r.grid_pos > 0 ? r.grid_pos : Infinity),
      render: (r) => (r.grid_pos > 0 ? String(r.grid_pos) : "N/A"),
    },
    {
      key: "best_lap",
      label: t("sessionDetail.statBestLap"),
      lowerBetter: true,
      overallBest: overall.bestLap,
      value: (r) => r.best_lap ?? Infinity,
      render: (r) => formatTime(r.best_lap),
    },
    {
      key: "avg_best_5",
      label: t("sessionDetail.statAvg5"),
      value: (r) => r.avg_best_5 ?? Infinity,
      render: (r) => formatTime(r.avg_best_5),
    },
    {
      key: "median_lap",
      label: t("sessionDetail.statMedian"),
      value: (r) => r.median_lap ?? Infinity,
      render: (r) => formatTime(r.median_lap),
    },
    {
      key: "std_dev",
      label: t("sessionDetail.statStdDev"),
      value: (r) => r.std_dev ?? Infinity,
      render: (r) =>
        r.std_dev != null ? `${r.std_dev.toFixed(3)}s` : "N/A",
    },
    {
      key: "best_s1",
      label: t("sessionDetail.statBestS1"),
      lowerBetter: true,
      overallBest: overall.s1,
      value: (r) => r.best_lap_s1 ?? Infinity,
      render: (r) =>
        r.best_lap_s1 != null
          ? `${formatSectorSeconds(r.best_lap_s1)}s`
          : "N/A",
    },
    {
      key: "best_s2",
      label: t("sessionDetail.statBestS2"),
      lowerBetter: true,
      overallBest: overall.s2,
      value: (r) => r.best_lap_s2 ?? Infinity,
      render: (r) =>
        r.best_lap_s2 != null
          ? `${formatSectorSeconds(r.best_lap_s2)}s`
          : "N/A",
    },
    {
      key: "best_s3",
      label: t("sessionDetail.statBestS3"),
      lowerBetter: true,
      overallBest: overall.s3,
      value: (r) => r.best_lap_s3 ?? Infinity,
      render: (r) =>
        r.best_lap_s3 != null
          ? `${formatSectorSeconds(r.best_lap_s3)}s`
          : "N/A",
    },
    {
      key: "vmax",
      label: t("sessionDetail.statVmax"),
      value: (r) => r.vmax ?? 0,
      render: (r) =>
        r.vmax != null ? `${r.vmax.toFixed(2)} km/h` : "N/A",
    },
    {
      key: "pitstops",
      label: t("sessionDetail.statPitstops"),
      value: (r) => r.pitstops,
      render: (r) => String(r.pitstops),
    },
    {
      key: "incidents",
      label: t("sessionDetail.statIncidents"),
      value: (r) => incidents.get(r.driver_name) ?? 0,
      render: (r) => String(incidents.get(r.driver_name) ?? 0),
    },
    {
      key: "penalties",
      label: t("sessionDetail.statPenalties"),
      value: (r) => penalties.get(r.driver_name) ?? 0,
      render: (r) => String(penalties.get(r.driver_name) ?? 0),
    },
  ];

  const chartTitle =
    chartMode === "position"
      ? t("sessionDetail.chartPosition")
      : chartMode === "lap"
        ? t("sessionDetail.chartLap")
        : t("sessionDetail.chartGap");

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <TableTitle title={t("sessionDetail.compareTitle")} />
        <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {slots.map((value, i) => (
            <div key={i} className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                <span
                  className="inline-block h-2 w-2 rounded-sm mr-1.5 align-middle"
                  style={{ backgroundColor: COMPARE_COLORS[i] }}
                />
                {t("sessionDetail.driverN", { n: i + 1 })}
              </label>
              <select
                value={value}
                onChange={(e) => setSlot(i, e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">{t("sessionDetail.none")}</option>
                {sortedDrivers.map((r) => {
                  const takenElsewhere =
                    r.driver_name !== value &&
                    slots.includes(r.driver_name);
                  return (
                    <option
                      key={r.id}
                      value={r.driver_name}
                      disabled={takenElsewhere}
                    >
                      {r.driver_name}
                      {takenElsewhere
                        ? ` ${t("sessionDetail.alreadyChosen")}`
                        : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          ))}
        </CardContent>
      </Card>

      {selected.length < 2 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("sessionDetail.selectTwo")}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <TableTitle
              title={
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span>{chartTitle}</span>
                  <div className="flex gap-1">
                    {(
                      [
                        ["position", t("sessionDetail.modePosition")],
                        ["lap", t("sessionDetail.modeLap")],
                        ["gap", t("sessionDetail.modeGap")],
                      ] as const
                    ).map(([mode, label]) => (
                      <Button
                        key={mode}
                        size="sm"
                        variant={chartMode === mode ? "default" : "outline"}
                        onClick={() => setChartMode(mode)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              }
            />
            <CardContent className="p-4">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-border"
                  />
                  <XAxis
                    dataKey="lap"
                    tick={{ fontSize: 11 }}
                    label={{
                      value: t("sessionDetail.axisLap"),
                      position: "insideBottom",
                      offset: -4,
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    reversed={chartMode === "position"}
                    allowDecimals={false}
                    domain={
                      chartMode === "position"
                        ? [1, "dataMax"]
                        : ["auto", "auto"]
                    }
                    tickFormatter={(v: number) =>
                      chartMode === "position"
                        ? String(v)
                        : chartMode === "gap"
                          ? `+${v}s`
                          : formatTime(v)
                    }
                    width={chartMode === "lap" ? 64 : 44}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                    }}
                    formatter={(v: number) =>
                      chartMode === "position"
                        ? `P${v}`
                        : chartMode === "gap"
                          ? `+${v}s`
                          : formatTime(v)
                    }
                    labelFormatter={(l) =>
                      t("sessionDetail.tooltipLap", { n: l })
                    }
                  />
                  <ChartLegend wrapperStyle={{ fontSize: 12 }} />
                  {selected.map((d) => (
                    <Line
                      key={d}
                      type="monotone"
                      dataKey={d}
                      stroke={colorOf(d)}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <TableTitle title={t("sessionDetail.compareDetail")} />
            <CardContent className="p-0 overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("sessionDetail.statistic")}</TableHead>
                    {selectedResults.map((r) => (
                      <TableHead
                        key={r.id}
                        className="text-center font-bold"
                        style={{ color: colorOf(r.driver_name) }}
                      >
                        {r.driver_name}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.map((stat) => {
                    const vals = selectedResults.map((r) => stat.value(r));
                    const bestVal = stat.lowerBetter
                      ? Math.min(...vals)
                      : null;
                    return (
                      <TableRow key={stat.key}>
                        <TableCell className="font-medium bg-muted/40">
                          {stat.label}
                        </TableCell>
                        {selectedResults.map((r, i) => {
                          const v = vals[i];
                          const isBestRow =
                            bestVal != null &&
                            v !== Infinity &&
                            Math.abs(v - bestVal) < 0.0001;
                          const isOverall =
                            stat.overallBest != null &&
                            v !== Infinity &&
                            Math.abs(v - stat.overallBest) < 0.0001;
                          return (
                            <TableCell
                              key={r.id}
                              className={cn(
                                "text-center font-mono",
                                isBestRow && "text-yellow-500 font-semibold",
                                isOverall && "text-yellow-500 font-semibold"
                              )}
                            >
                              {isOverall && "🏆 "}
                              {stat.render(r)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Setup utilisé : intégré à la card « Infos pilote » ─────────────────────

/**
 * Section inline (sans Card wrapper) affichée en fin de grille « Infos
 * pilote » (col-span-full). Liste les setups dont `linked_session_id =
 * sessionId` (relation inverse de SetupDetail) et permet de lier un setup
 * existant via un picker déplié sous le label.
 */
function SetupUsedInline({
  sessionId,
  linkedSetups,
  playerCar,
  navigate,
  onChanged,
  t,
}: {
  sessionId: number;
  linkedSetups: SetupForSession[];
  playerCar: string | null;
  navigate: (to: string) => void;
  onChanged: () => void;
  t: Tr;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [candidates, setCandidates] = useState<SetupForSession[]>([]);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ouvre le picker : on charge tous les setups, on filtre par voiture du
  // joueur (matching tolérant côté frontend). Les setups déjà liés à
  // d'autres sessions sont affichés en mode dégradé (info contextuelle).
  async function handleOpenPicker() {
    setPickerLoading(true);
    setError(null);
    setEmptyMessage(null);
    try {
      const groups = await setupsApi.list();
      const all: SetupForSession[] = [];
      for (const g of groups) {
        for (const tr of g.tracks) {
          for (const s of tr.setups) {
            all.push({
              id: s.id,
              name: s.name,
              car: g.car,
              circuit: tr.name,
              setup_type: s.setup_type,
              source: s.source,
              updated_at: s.updated_at,
            });
          }
        }
      }
      // Filtrage par voiture du joueur si disponible (matching loose).
      const normalize = (s: string) =>
        s.toLowerCase().replace(/[\s_-]/g, "");
      const filtered = playerCar
        ? all.filter((s) => {
            const a = normalize(s.car);
            const b = normalize(playerCar);
            return a.includes(b) || b.includes(a);
          })
        : all;
      if (filtered.length === 0) {
        // Pas de candidats → on n'ouvre pas le picker (sinon panneau vide
        // avec un titre inutile) ; on affiche juste un message inline.
        setCandidates([]);
        setPickerOpen(false);
        setEmptyMessage(t("sessionDetail.noSetupCandidate"));
      } else {
        setCandidates(filtered);
        setPickerOpen(true);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setPickerLoading(false);
    }
  }

  async function handleLink(setupId: number) {
    setError(null);
    try {
      await setupsApi.setLinkedSession(setupId, sessionId);
      setPickerOpen(false);
      onChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleUnlink(setupId: number) {
    setError(null);
    try {
      await setupsApi.setLinkedSession(setupId, null);
      onChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="pt-3 border-t border-border/40">
      {/* En-tête : label + bouton d'action (style discret, fond neutre). */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          <Wrench className="h-3 w-3" />
          {t("sessionDetail.setupUsed")}
        </span>
        <button
          type="button"
          onClick={handleOpenPicker}
          disabled={pickerLoading}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 hover:bg-accent hover:border-primary/40 disabled:opacity-50 px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors"
        >
          {pickerLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Wrench className="h-3 w-3" />
          )}
          {t("sessionDetail.linkSetup")}
        </button>
      </div>

      {linkedSetups.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">
          {t("sessionDetail.noSetupLinked")}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {linkedSetups.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5"
            >
              <Wrench className="h-3 w-3 text-primary shrink-0" />
              <button
                type="button"
                onClick={() => navigate(`/setups/${s.id}`)}
                className="flex-1 min-w-0 text-left text-xs group"
                title={t("sessionDetail.openSetup")}
              >
                <p className="font-medium truncate group-hover:text-primary transition-colors leading-tight">
                  {s.name.replace(/\.svm$/i, "")}
                </p>
                <p className="text-muted-foreground text-[10px] truncate leading-tight">
                  {s.car} · {s.circuit} · {s.setup_type}
                </p>
              </button>
              <button
                type="button"
                onClick={() => navigate(`/setups/${s.id}`)}
                className="text-muted-foreground hover:text-primary p-0.5"
                title={t("sessionDetail.openSetup")}
              >
                <ExternalLink className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => handleUnlink(s.id)}
                className="text-muted-foreground hover:text-destructive p-0.5"
                title={t("sessionDetail.unlinkSetup")}
              >
                <Minus className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Message inline si aucun candidat (au lieu d'ouvrir un picker vide). */}
      {emptyMessage && !pickerOpen && (
        <p className="text-xs italic text-muted-foreground mt-2">
          {emptyMessage}
        </p>
      )}

      {/* Picker de setup — n'apparaît que si des candidats ont été trouvés. */}
      {pickerOpen && candidates.length > 0 && (
        <div className="mt-2 rounded-md border border-border bg-background/60">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
              {t("sessionDetail.pickSetupTitle")}
              {playerCar ? ` — ${playerCar}` : ""}
            </span>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              ×
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {candidates.map((s) => {
              const alreadyLinked = linkedSetups.some((l) => l.id === s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={alreadyLinked}
                  onClick={() => handleLink(s.id)}
                  className={cn(
                    "w-full text-left text-xs px-3 py-2 border-b border-border/40 last:border-0 transition-colors",
                    alreadyLinked
                      ? "bg-primary/5 text-muted-foreground cursor-not-allowed"
                      : "hover:bg-accent/60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">
                      {s.name.replace(/\.svm$/i, "")}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {s.setup_type}
                    </span>
                  </div>
                  <div className="text-muted-foreground text-[10px] truncate mt-0.5">
                    {s.car} · {s.circuit}
                    {alreadyLinked && (
                      <span className="ml-2 text-primary font-semibold">
                        {t("sessionDetail.alreadyLinked")}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive mt-2">{error}</p>
      )}
    </div>
  );
}
