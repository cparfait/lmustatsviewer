/**
 * LapChartModal — graphe de tours d'une session.
 *
 * Fonctionnalités :
 *  - Séries activables : Temps au tour · Position · S1/S2/S3 · Carburant
 *  - Lignes de référence : record perso + meilleur de classe
 *  - Tooltip riche (lap#, temps, delta, S1/S2/S3, fuel, compound)
 *  - Marqueurs pit stop (lignes verticales)
 *  - Clic sur un point → SessionDetail onglet Laps
 *  - Comparaison avec une autre session (même voiture + circuit)
 *  - Mini-table des 5 meilleurs tours sous le graphe
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
  Dot,
} from "recharts";
import {
  X,
  TrendingUp,
  GitCompare,
  Trophy,
  Gauge,
  Fuel,
  ExternalLink,
  ChevronDown,
  Loader2,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SessionBadge } from "@/components/SessionBadge";
import { queries } from "@/lib/api";
import type { LapChartData, ChartLapRow, ChartCompareSession } from "@/lib/api";
import { formatTime, formatDateTime, cn } from "@/lib/utils";
import { fetchBenchmarks, findBenchmark, type PaceBenchmark } from "@/lib/ohne_speed";
import { OHNE_CLASS } from "@/components/TierBadge";
import { useAppStore } from "@/stores/app";

// ── Couleurs des séries ───────────────────────────────────────────────────────

const COLOR_LAP = "#22c55e";      // vert — temps au tour
const COLOR_LAP_PIT = "#f59e0b";  // ambre — tour pit
const COLOR_LAP_INV = "#ef4444";  // rouge — tour invalide
const COLOR_POS = "#06b6d4";      // cyan — position
const COLOR_S1 = "#f59e0b";       // ambre — S1
const COLOR_S2 = "#3b82f6";       // bleu — S2
const COLOR_S3 = "#a855f7";       // violet — S3
const COLOR_FUEL = "#14b8a6";     // teal — carburant
const COLOR_REF_PERSO = "#22c55e";
const COLOR_REF_CLASS = "#3b82f6";
const COLOR_REF_ALIEN = "#d946ef"; // fuchsia — référence communautaire ohne_speed
const COLOR_COMPARE = "#f97316";  // orange — session comparaison

// ── Formatage Y-axis temps ───────────────────────────────────────────────────

function fmtYAxis(v: number): string {
  if (!v || v <= 0) return "";
  const m = Math.floor(v / 60);
  const s = v - m * 60;
  return m > 0 ? `${m}:${s.toFixed(1).padStart(4, "0")}` : `${s.toFixed(1)}`;
}

// ── Tooltip personnalisé ─────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  bestLap,
  t,
}: {
  active?: boolean;
  payload?: any[];
  bestLap: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  if (!active || !payload?.length) return null;
  const lap: ChartLapRow & { _compare?: boolean } = payload[0]?.payload;
  if (!lap) return null;

  const delta =
    lap.lap_time != null && bestLap != null && lap.lap_time > bestLap
      ? lap.lap_time - bestLap
      : null;

  return (
    <div className="bg-card border border-border rounded-lg shadow-xl p-3 text-xs min-w-[180px]">
      <div className="flex items-center gap-2 mb-2 font-semibold text-sm">
        <span className="text-muted-foreground">{t("lapChart.lap")} {lap.lap_num}</span>
        {lap.is_pit && (
          <Badge variant="outline" className="text-amber-400 border-amber-400/40 text-[9px] px-1 py-0">
            PIT
          </Badge>
        )}
        {!lap.is_valid && !lap.is_pit && (
          <Badge variant="outline" className="text-destructive border-destructive/40 text-[9px] px-1 py-0">
            INV.
          </Badge>
        )}
        {lap._compare && (
          <Badge variant="outline" className="text-orange-400 border-orange-400/40 text-[9px] px-1 py-0">
            CMP
          </Badge>
        )}
      </div>

      {lap.lap_time != null && (
        <div className="flex justify-between gap-4 mb-1">
          <span className="text-muted-foreground">{t("lapChart.time")}</span>
          <span className="font-mono font-semibold text-success">
            {formatTime(lap.lap_time)}
            {delta != null && (
              <span className="text-destructive ml-1">(+{delta.toFixed(3)}s)</span>
            )}
          </span>
        </div>
      )}

      {(lap.s1 != null || lap.s2 != null || lap.s3 != null) && (
        <div className="flex justify-between gap-4 mb-1">
          <span className="text-muted-foreground">S1 / S2 / S3</span>
          <span className="font-mono tabular-nums">
            <span className="text-amber-400">{lap.s1?.toFixed(3) ?? "—"}</span>
            {" / "}
            <span className="text-blue-400">{lap.s2?.toFixed(3) ?? "—"}</span>
            {" / "}
            <span className="text-purple-400">{lap.s3?.toFixed(3) ?? "—"}</span>
          </span>
        </div>
      )}

      {lap.fuel != null && (
        <div className="flex justify-between gap-4 mb-1">
          <span className="text-muted-foreground">{t("lapChart.fuel")}</span>
          <span className="font-mono">{(lap.fuel * 100).toFixed(1)}%</span>
        </div>
      )}

      {lap.fuel_used != null && lap.fuel_used > 0 && lap.fuel_used < 15 && (
        <div className="flex justify-between gap-4 mb-1">
          <span className="text-muted-foreground">{t("lapChart.fuelUsed")}</span>
          <span className="font-mono">{(lap.fuel_used * 100).toFixed(2)}%/tour</span>
        </div>
      )}

      {lap.fcompound && (
        <div className="flex justify-between gap-4 mb-1">
          <span className="text-muted-foreground">{t("lapChart.compound")}</span>
          <span>{lap.fcompound.replace(/^\d+,/, "")}</span>
        </div>
      )}

      {lap.position > 0 && (
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{t("lapChart.position")}</span>
          <span className="font-semibold">P{lap.position}</span>
        </div>
      )}
    </div>
  );
}

// ── Chip de série ─────────────────────────────────────────────────────────────

function SeriesChip({
  active,
  color,
  label,
  onClick,
}: {
  active: boolean;
  color: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border",
        active
          ? "border-transparent text-white"
          : "bg-transparent border-border text-muted-foreground hover:text-foreground"
      )}
      style={active ? { backgroundColor: color + "cc" } : {}}
    >
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: active ? "white" : color }}
      />
      {label}
    </button>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

interface LapChartModalProps {
  sessionId: number;
  onClose: () => void;
}

export function LapChartModal({ sessionId, onClose }: LapChartModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Données
  const [data, setData] = useState<LapChartData | null>(null);
  const [compareData, setCompareData] = useState<LapChartData | null>(null);
  const [compareCandidates, setCompareCandidates] = useState<ChartCompareSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI
  const [showComparePicker, setShowComparePicker] = useState(false);
  const [loadingCompare, setLoadingCompare] = useState(false);

  // Préférence globale ohne_speed
  const showOhneSpeed = useAppStore((s) => s.showOhneSpeed);

  // Benchmarks ohne_speed
  const [benchmarks, setBenchmarks] = useState<PaceBenchmark[] | null>(null);
  const [ohneOffline, setOhneOffline] = useState(false);

  // Séries actives
  const [showTime, setShowTime] = useState(true);
  const [showPos, setShowPos] = useState(false);
  const [showS1, setShowS1] = useState(false);
  const [showS2, setShowS2] = useState(false);
  const [showS3, setShowS3] = useState(false);
  const [showFuel, setShowFuel] = useState(false);
  // Références
  const [showPersonalRecord, setShowPersonalRecord] = useState(true);
  const [showClassBest, setShowClassBest] = useState(true);
  const [showAlienRef, setShowAlienRef] = useState(true);

  const overlayRef = useRef<HTMLDivElement>(null);

  // Chargement données session
  useEffect(() => {
    setLoading(true);
    queries
      .getLapChartData(sessionId)
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [sessionId]);

  // Chargement benchmarks ohne_speed (best-effort)
  useEffect(() => {
    if (!showOhneSpeed) return;
    fetchBenchmarks()
      .then((bm) => { setBenchmarks(bm); setOhneOffline(false); })
      .catch(() => { setBenchmarks([]); setOhneOffline(true); });
  }, [showOhneSpeed]);

  // Fermeture Échap
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Chargement des candidats à la comparaison
  const handleOpenComparePicker = useCallback(async () => {
    if (compareCandidates.length === 0) {
      const list = await queries.getChartCompareSessions(sessionId);
      setCompareCandidates(list);
    }
    setShowComparePicker((v) => !v);
  }, [sessionId, compareCandidates.length]);

  const handleSelectCompare = useCallback(
    async (compareSessionId: number) => {
      setShowComparePicker(false);
      setLoadingCompare(true);
      try {
        const d = await queries.getLapChartData(compareSessionId);
        setCompareData(d);
      } finally {
        setLoadingCompare(false);
      }
    },
    []
  );

  // ── Dérivations ────────────────────────────────────────────────────────────

  const bestLap = data
    ? Math.min(
        ...data.laps
          .filter((l) => l.is_valid && l.lap_time != null && l.lap_time > 0)
          .map((l) => l.lap_time!)
      )
    : null;

  const bestLapCompare = compareData
    ? Math.min(
        ...compareData.laps
          .filter((l) => l.is_valid && l.lap_time != null && l.lap_time > 0)
          .map((l) => l.lap_time!)
      )
    : null;

  // Top 5 tours valides
  const top5 = data
    ? [...data.laps]
        .filter((l) => l.is_valid && l.lap_time != null && l.lap_time > 0)
        .sort((a, b) => a.lap_time! - b.lap_time!)
        .slice(0, 5)
    : [];

  // Données du graphe — union des numéros de tours des deux sessions
  const chartData = (() => {
    if (!data) return [];
    const mainMap = new Map(data.laps.map((l) => [l.lap_num, l]));
    const cmpMap = compareData
      ? new Map(compareData.laps.map((l) => [l.lap_num, l]))
      : new Map<number, ChartLapRow>();
    const allNums = new Set([
      ...data.laps.map((l) => l.lap_num),
      ...(compareData?.laps.map((l) => l.lap_num) ?? []),
    ]);
    return Array.from(allNums)
      .sort((a, b) => a - b)
      .map((n) => {
        const lap = mainMap.get(n);
        const cmp = cmpMap.get(n);
        return {
          lap_num: n,
          lap_time: lap?.lap_time ?? null,
          s1: lap?.s1 ?? null,
          s2: lap?.s2 ?? null,
          s3: lap?.s3 ?? null,
          fuel: lap?.fuel ?? null,
          fuel_used: lap?.fuel_used ?? null,
          fcompound: lap?.fcompound ?? "",
          is_pit: lap?.is_pit ?? false,
          is_valid: lap?.is_valid ?? false,
          position: lap?.position ?? 0,
          lap_time_compare: cmp?.lap_time ?? null,
          is_pit_compare: cmp?.is_pit ?? false,
          is_valid_compare: cmp?.is_valid ?? false,
        };
      });
  })();

  // Référence alien ohne_speed (null si non disponible ou option désactivée)
  const alienPaceSeconds = (() => {
    if (!showOhneSpeed || !data || !benchmarks || benchmarks.length === 0) return null;
    const ohneClass = OHNE_CLASS[data.car_class];
    if (!ohneClass) return null;
    const bm = findBenchmark(benchmarks, data.track, ohneClass, data.track_course || undefined);
    if (!bm) return null;
    return bm.racePaceMs.alien / 1000;
  })();

  // Plage Y — inclure les deux séries, exclure outliers > 2.5× best
  const allValidTimes = [
    ...(data?.laps.filter((l) => l.lap_time != null && l.lap_time > 0).map((l) => l.lap_time!) ?? []),
    ...(compareData?.laps.filter((l) => l.lap_time != null && l.lap_time > 0).map((l) => l.lap_time!) ?? []),
  ];
  const minTime = allValidTimes.length ? Math.min(...allValidTimes) : 60;
  const maxTime = allValidTimes.length
    ? Math.min(Math.max(...allValidTimes), minTime * 2.5)
    : 120;
  const yPad = (maxTime - minTime) * 0.08;

  // ── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 rounded-lg p-2">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="font-semibold text-sm leading-tight">
                {data ? `${data.track}${data.track_course ? ` — ${data.track_course}` : ""}` : t("lapChart.title")}
              </div>
              {data && (
                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                  <SessionBadge type={data.session_type} />
                  <span>{data.unique_car_name}</span>
                  <span>·</span>
                  <span>{formatDateTime(data.timestamp)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Bouton comparer */}
            {data && (
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={handleOpenComparePicker}
                  disabled={loadingCompare}
                >
                  {loadingCompare ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <GitCompare className="h-3 w-3" />
                  )}
                  {compareData
                    ? t("lapChart.comparing")
                    : t("lapChart.compare")}
                  {compareData && (
                    <span
                      className="ml-1 text-destructive cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCompareData(null);
                        setShowComparePicker(false);
                      }}
                    >
                      ×
                    </span>
                  )}
                  <ChevronDown className="h-3 w-3" />
                </Button>

                {showComparePicker && (
                  <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-xl z-10 min-w-[280px] max-h-60 overflow-y-auto">
                    {compareCandidates.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-3">
                        {t("lapChart.noCompareSession")}
                      </p>
                    ) : (
                      compareCandidates.map((s) => (
                        <button
                          key={s.session_id}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-muted/60 flex items-center justify-between gap-3"
                          onClick={() => handleSelectCompare(s.session_id)}
                        >
                          <span className="flex items-center gap-2">
                            <SessionBadge type={s.session_type} />
                            <span className="text-muted-foreground">
                              {formatDateTime(s.timestamp)}
                            </span>
                          </span>
                          <span className="font-mono font-semibold text-success">
                            {s.best_lap ? formatTime(s.best_lap) : "—"}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Lien vers SessionDetail */}
            {data && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => {
                  navigate(`/sessions/${sessionId}?tab=laps`);
                  onClose();
                }}
              >
                <ExternalLink className="h-3 w-3" />
                {t("lapChart.openDetail")}
              </Button>
            )}

            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── Corps ── */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>{t("lapChart.loading")}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-16 text-destructive text-sm">
              {error}
            </div>
          )}

          {data && !loading && (
            <>
              {/* ── Contrôles séries ── */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium mr-1">
                  {t("lapChart.series")} :
                </span>
                <SeriesChip active={showTime} color={COLOR_LAP} label={t("lapChart.seriesTime")} onClick={() => setShowTime((v) => !v)} />
                <SeriesChip active={showPos} color={COLOR_POS} label={t("lapChart.seriesPos")} onClick={() => setShowPos((v) => !v)} />
                <SeriesChip active={showS1} color={COLOR_S1} label="S1" onClick={() => setShowS1((v) => !v)} />
                <SeriesChip active={showS2} color={COLOR_S2} label="S2" onClick={() => setShowS2((v) => !v)} />
                <SeriesChip active={showS3} color={COLOR_S3} label="S3" onClick={() => setShowS3((v) => !v)} />
                <SeriesChip active={showFuel} color={COLOR_FUEL} label={t("lapChart.seriesFuel")} onClick={() => setShowFuel((v) => !v)} />
                <span className="text-border mx-1">|</span>
                <SeriesChip active={showPersonalRecord} color={COLOR_REF_PERSO} label={t("lapChart.refPersonal")} onClick={() => setShowPersonalRecord((v) => !v)} />
                <SeriesChip active={showClassBest} color={COLOR_REF_CLASS} label={t("lapChart.refClass")} onClick={() => setShowClassBest((v) => !v)} />
                {showOhneSpeed && alienPaceSeconds != null && (
                  <SeriesChip active={showAlienRef} color={COLOR_REF_ALIEN} label={t("lapChart.refAlien")} onClick={() => setShowAlienRef((v) => !v)} />
                )}
                {showOhneSpeed && ohneOffline && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] text-amber-400/80"
                    title={t("config.ohneSpeedOffline")}
                  >
                    <WifiOff className="h-3 w-3" />
                    ohne_speed
                  </span>
                )}
              </div>

              {/* ── Graphe ── */}
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 8, right: showPos ? 48 : 8, bottom: 4, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />

                    <XAxis
                      dataKey="lap_num"
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      tickLine={false}
                      label={{ value: t("lapChart.xAxisLabel"), position: "insideBottom", fontSize: 10, fill: "var(--muted-foreground)", dy: 8 }}
                    />

                    {/* Y gauche — temps */}
                    <YAxis
                      yAxisId="time"
                      tickFormatter={fmtYAxis}
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      tickLine={false}
                      axisLine={false}
                      domain={[minTime - yPad, maxTime + yPad]}
                      reversed
                      width={52}
                    />

                    {/* Y droite — position */}
                    {showPos && (
                      <YAxis
                        yAxisId="pos"
                        orientation="right"
                        tick={{ fontSize: 10, fill: COLOR_POS }}
                        tickLine={false}
                        axisLine={false}
                        domain={["dataMin", "dataMax"]}
                        reversed
                        width={30}
                        tickFormatter={(v) => `P${v}`}
                      />
                    )}

                    <Tooltip
                      content={<ChartTooltip bestLap={bestLap} t={t} />}
                      cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
                    />

                    {/* Lignes verticales pit stops */}
                    {data.laps
                      .filter((l) => l.is_pit)
                      .map((l) => (
                        <ReferenceLine
                          key={`pit-${l.lap_num}`}
                          yAxisId="time"
                          x={l.lap_num}
                          stroke={COLOR_LAP_PIT}
                          strokeDasharray="4 2"
                          strokeOpacity={0.5}
                          strokeWidth={1}
                        />
                      ))}

                    {/* Ligne de référence record perso */}
                    {showPersonalRecord && data.personal_record != null && (
                      <ReferenceLine
                        yAxisId="time"
                        y={data.personal_record}
                        stroke={COLOR_REF_PERSO}
                        strokeDasharray="6 3"
                        strokeWidth={1.5}
                        label={{
                          value: `⭐ ${formatTime(data.personal_record)}`,
                          position: "insideTopRight",
                          fontSize: 10,
                          fill: COLOR_REF_PERSO,
                        }}
                      />
                    )}

                    {/* Ligne de référence meilleur de classe */}
                    {showClassBest && data.class_best != null && (
                      <ReferenceLine
                        yAxisId="time"
                        y={data.class_best}
                        stroke={COLOR_REF_CLASS}
                        strokeDasharray="6 3"
                        strokeWidth={1.5}
                        label={{
                          value: `🏆 ${formatTime(data.class_best)}`,
                          position: "insideTopLeft",
                          fontSize: 10,
                          fill: COLOR_REF_CLASS,
                        }}
                      />
                    )}

                    {/* Ligne de référence Alien pace (ohne_speed) */}
                    {showOhneSpeed && showAlienRef && alienPaceSeconds != null && (
                      <ReferenceLine
                        yAxisId="time"
                        y={alienPaceSeconds}
                        stroke={COLOR_REF_ALIEN}
                        strokeDasharray="3 2"
                        strokeWidth={1.5}
                        label={{
                          value: `👽 ${formatTime(alienPaceSeconds)}`,
                          position: "insideBottomRight",
                          fontSize: 10,
                          fill: COLOR_REF_ALIEN,
                        }}
                      />
                    )}

                    {/* Fuel (Area) */}
                    {showFuel && (
                      <Area
                        yAxisId="time"
                        type="monotone"
                        dataKey="fuel"
                        stroke={COLOR_FUEL}
                        fill={COLOR_FUEL}
                        fillOpacity={0.08}
                        strokeWidth={1}
                        dot={false}
                        connectNulls
                      />
                    )}

                    {/* Temps au tour — série principale */}
                    {showTime && (
                      <Line
                        yAxisId="time"
                        type="monotone"
                        dataKey="lap_time"
                        stroke={COLOR_LAP}
                        strokeWidth={2}
                        dot={(props: any) => {
                          const lap: ChartLapRow = props.payload;
                          if (lap.lap_time == null) return <g key={props.key} />;
                          const isB = bestLap != null && Math.abs(lap.lap_time - bestLap) < 0.001;
                          const col = lap.is_pit
                            ? COLOR_LAP_PIT
                            : !lap.is_valid
                            ? COLOR_LAP_INV
                            : isB
                            ? COLOR_LAP
                            : COLOR_LAP;
                          return (
                            <circle
                              key={props.key}
                              cx={props.cx}
                              cy={props.cy}
                              r={isB ? 5 : 3}
                              fill={col}
                              stroke={isB ? "white" : col}
                              strokeWidth={isB ? 1.5 : 0}
                              opacity={lap.is_valid ? 1 : 0.45}
                            />
                          );
                        }}
                        activeDot={{ r: 5 }}
                        connectNulls={false}
                      />
                    )}

                    {/* Session comparaison */}
                    {compareData && showTime && (
                      <Line
                        yAxisId="time"
                        type="monotone"
                        dataKey="lap_time_compare"
                        stroke={COLOR_COMPARE}
                        strokeWidth={2}
                        strokeDasharray="6 3"
                        dot={(props: any) => {
                          const d = props.payload;
                          if (d.lap_time_compare == null) return <g key={props.key} />;
                          const isBest = bestLapCompare != null && Math.abs(d.lap_time_compare - bestLapCompare) < 0.001;
                          return (
                            <circle
                              key={props.key}
                              cx={props.cx}
                              cy={props.cy}
                              r={isBest ? 5 : 3}
                              fill={d.is_pit_compare ? COLOR_LAP_PIT : COLOR_COMPARE}
                              stroke={isBest ? "white" : COLOR_COMPARE}
                              strokeWidth={isBest ? 1.5 : 0}
                              opacity={d.is_valid_compare ? 1 : 0.4}
                            />
                          );
                        }}
                        activeDot={{ r: 5 }}
                        connectNulls={false}
                      />
                    )}

                    {/* S1 / S2 / S3 */}
                    {showS1 && (
                      <Line yAxisId="time" type="monotone" dataKey="s1" stroke={COLOR_S1} strokeWidth={1} dot={false} connectNulls />
                    )}
                    {showS2 && (
                      <Line yAxisId="time" type="monotone" dataKey="s2" stroke={COLOR_S2} strokeWidth={1} dot={false} connectNulls />
                    )}
                    {showS3 && (
                      <Line yAxisId="time" type="monotone" dataKey="s3" stroke={COLOR_S3} strokeWidth={1} dot={false} connectNulls />
                    )}

                    {/* Position en course */}
                    {showPos && (
                      <Line
                        yAxisId="pos"
                        type="monotone"
                        dataKey="position"
                        stroke={COLOR_POS}
                        strokeWidth={1.5}
                        dot={false}
                        connectNulls
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* ── Légende compact ── */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                {/* Session principale */}
                <span className="flex items-center gap-1.5">
                  <span className="w-6 h-0 inline-block border-t-2 border-success" />
                  <span className="font-medium text-foreground">{data.unique_car_name}</span>
                  <span>·</span>
                  <span><SessionBadge type={data.session_type} /></span>
                  <span>·</span>
                  <span>{formatDateTime(data.timestamp)}</span>
                </span>
                {/* Session comparaison */}
                {compareData && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-6 h-0 inline-block border-t-2 border-dashed border-orange-400" />
                    <span className="font-medium" style={{ color: COLOR_COMPARE }}>{compareData.unique_car_name}</span>
                    <span>·</span>
                    <span><SessionBadge type={compareData.session_type} /></span>
                    <span>·</span>
                    <span>{formatDateTime(compareData.timestamp)}</span>
                  </span>
                )}
                {/* Références */}
                {data.personal_record != null && showPersonalRecord && (
                  <span className="flex items-center gap-1">
                    <span className="text-success">⭐</span>
                    {t("lapChart.legendPersonalRecord")} : {formatTime(data.personal_record)}
                  </span>
                )}
                {data.class_best != null && showClassBest && (
                  <span className="flex items-center gap-1">
                    <span>🏆</span>
                    {t("lapChart.legendClassBest")} : {formatTime(data.class_best)}
                  </span>
                )}
                {showOhneSpeed && showAlienRef && alienPaceSeconds != null && (
                  <span className="flex items-center gap-1">
                    <span>👽</span>
                    <span style={{ color: COLOR_REF_ALIEN }}>{t("lapChart.legendAlien")}</span>
                    {" : "}{formatTime(alienPaceSeconds)}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
                  {t("lapChart.legendPit")}
                </span>
              </div>

              {/* ── Récap comparaison côte-à-côte ── */}
              {compareData && bestLap != null && bestLapCompare != null && (() => {
                const delta = bestLapCompare - bestLap;
                const mainFaster = delta > 0;
                return (
                  <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
                    {/* Session A */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-3 h-0 inline-block border-t-2 border-success" />
                        <span className="font-semibold text-foreground truncate">{data.unique_car_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Best</span>
                        <span className="font-mono font-semibold text-success">{formatTime(bestLap)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tours</span>
                        <span>{data.laps.filter(l => l.is_valid).length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Date</span>
                        <span>{formatDateTime(data.timestamp)}</span>
                      </div>
                    </div>
                    {/* Delta central */}
                    <div className="flex flex-col items-center justify-center border-x border-border/60 gap-1">
                      <span className="text-muted-foreground text-[10px] uppercase tracking-wide">{t("lapChart.delta")}</span>
                      <span className={cn(
                        "font-mono font-bold text-base",
                        mainFaster ? "text-success" : "text-destructive"
                      )}>
                        {mainFaster ? "−" : "+"}{Math.abs(delta).toFixed(3)}s
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {mainFaster ? `${data.unique_car_name.split(" ")[0]} +rapide` : `${compareData.unique_car_name.split(" ")[0]} +rapide`}
                      </span>
                    </div>
                    {/* Session B */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-3 h-0 inline-block border-t-2 border-dashed border-orange-400" />
                        <span className="font-semibold truncate" style={{ color: COLOR_COMPARE }}>{compareData.unique_car_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Best</span>
                        <span className="font-mono font-semibold" style={{ color: COLOR_COMPARE }}>{formatTime(bestLapCompare)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tours</span>
                        <span>{compareData.laps.filter(l => l.is_valid).length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Date</span>
                        <span>{formatDateTime(compareData.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── Mini-table top 5 (mode normal) / lap-by-lap (mode comparaison) ── */}
              {compareData ? (
                /* Tableau lap-by-lap avec delta */
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <GitCompare className="h-3.5 w-3.5 text-orange-400" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("lapChart.compareLapByLap")}
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded border border-border/60">
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 bg-card z-10">
                        <tr className="text-muted-foreground text-[10px] uppercase tracking-wide border-b border-border/60">
                          <th className="py-1 px-2 text-left">{t("lapChart.lap")}</th>
                          <th className="py-1 px-2 text-right" style={{ color: COLOR_LAP }}>Session A</th>
                          <th className="py-1 px-2 text-right" style={{ color: COLOR_COMPARE }}>Session B</th>
                          <th className="py-1 px-2 text-right text-muted-foreground">Δ (A−B)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chartData
                          .filter((d) => d.lap_time != null || d.lap_time_compare != null)
                          .map((d) => {
                            const delta =
                              d.lap_time != null && d.lap_time_compare != null
                                ? d.lap_time - d.lap_time_compare
                                : null;
                            return (
                              <tr key={d.lap_num} className="border-t border-border/30 hover:bg-muted/40">
                                <td className="py-0.5 px-2 font-medium">
                                  {d.lap_num}
                                  {d.is_pit && <span className="ml-1 text-amber-400 text-[9px]">P</span>}
                                </td>
                                <td className="py-0.5 px-2 text-right font-mono text-success">
                                  {d.lap_time != null ? formatTime(d.lap_time) : <span className="text-muted-foreground/40">—</span>}
                                </td>
                                <td className="py-0.5 px-2 text-right font-mono" style={{ color: COLOR_COMPARE }}>
                                  {d.lap_time_compare != null ? formatTime(d.lap_time_compare) : <span className="text-muted-foreground/40">—</span>}
                                </td>
                                <td className={cn(
                                  "py-0.5 px-2 text-right font-mono font-semibold",
                                  delta == null ? "text-muted-foreground/40" :
                                  delta < 0 ? "text-success" : "text-destructive"
                                )}>
                                  {delta != null
                                    ? `${delta < 0 ? "−" : "+"}${Math.abs(delta).toFixed(3)}s`
                                    : "—"}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : top5.length > 0 && (
                /* Top 5 mode normal */
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("lapChart.top5Title")}
                    </span>
                  </div>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="text-muted-foreground text-[10px] uppercase tracking-wide">
                        <th className="py-1 px-2 text-left">#</th>
                        <th className="py-1 px-2 text-left">{t("lapChart.lap")}</th>
                        <th className="py-1 px-2 text-right">{t("lapChart.time")}</th>
                        <th className="py-1 px-2 text-right">S1</th>
                        <th className="py-1 px-2 text-right">S2</th>
                        <th className="py-1 px-2 text-right">S3</th>
                        <th className="py-1 px-2 text-right">{t("lapChart.fuel")}</th>
                        <th className="py-1 px-2 text-right">Δ Best</th>
                      </tr>
                    </thead>
                    <tbody>
                      {top5.map((lap, i) => {
                        const isBest = i === 0;
                        const delta = !isBest && bestLap != null ? lap.lap_time! - bestLap : null;
                        return (
                          <tr
                            key={lap.lap_num}
                            className={cn(
                              "border-t border-border/40 cursor-pointer hover:bg-muted/50 transition-colors",
                              isBest && "bg-success/5"
                            )}
                            onClick={() => { navigate(`/sessions/${sessionId}?tab=laps`); onClose(); }}
                          >
                            <td className="py-1 px-2">
                              {isBest && <Trophy className="h-3 w-3 text-amber-400 inline" />}
                            </td>
                            <td className="py-1 px-2 font-medium">{lap.lap_num}</td>
                            <td className="py-1 px-2 text-right font-mono font-semibold text-success">{formatTime(lap.lap_time)}</td>
                            <td className="py-1 px-2 text-right font-mono text-amber-400">{lap.s1?.toFixed(3) ?? "—"}</td>
                            <td className="py-1 px-2 text-right font-mono text-blue-400">{lap.s2?.toFixed(3) ?? "—"}</td>
                            <td className="py-1 px-2 text-right font-mono text-purple-400">{lap.s3?.toFixed(3) ?? "—"}</td>
                            <td className="py-1 px-2 text-right text-muted-foreground">
                              {lap.fuel != null ? `${(lap.fuel * 100).toFixed(0)}%` : "—"}
                            </td>
                            <td className="py-1 px-2 text-right font-mono text-muted-foreground">
                              {delta != null ? `+${delta.toFixed(3)}s` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
