import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Loader2, ArrowLeft, Play, Pause, ChevronDown, ChevronUp, LocateFixed, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { TrackFlag } from "@/components/TrackFlag";
import { CarLogo } from "@/components/CarLogo";
import { ClassBadge } from "@/components/ClassBadge";
import { SessionBadge } from "@/components/SessionBadge";
import { TelemetryCoachPanel } from "@/components/AICoachPanel";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { detectCorners } from "@/lib/telemetry/corners";
import { analyzeLap } from "@/lib/telemetry/analysis";
import { useAppStore } from "@/stores/app";
import { TrackMap } from "@/components/telemetry/TrackMap";
import { SteeringWheel } from "@/components/telemetry/SteeringWheel";
import { TyreCard } from "@/components/telemetry/TyreCard";
import { Gauge } from "@/components/telemetry/Gauge";
import { computeElevation } from "@/lib/elevation";
import { reconstructTrackSurface, type TrackSurface } from "@/lib/telemetry/trackSurface";

// Vue 3D chargée à la demande (Three.js hors du bundle principal).
const Track3D = lazy(() =>
  import("@/components/telemetry/Track3D").then((m) => ({ default: m.Track3D }))
);
import {
  TelemetryChart,
  type TelemetrySeries,
} from "@/components/telemetry/TelemetryChart";
import {
  LapRow,
  DashCard,
  Stat,
  InfoRow,
  Elec,
} from "@/components/telemetry/viewParts";
import { gearLabel, fmtLap, fmtNum, divK } from "@/lib/telemetry/format";
import { telemetry } from "@/lib/api";
import type {
  TelemetryMeta,
  TelemetryChannelData,
  TelemetryFileInfo,
} from "@/lib/api";
import { useTheme } from "@/stores/theme";
import { formatGap, formatDateTime, formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { sessionTypeLabel } from "@/lib/sessionLabels";

// Tous les canaux nécessaires à la page (carte + graphes + dashboard live).
const VIEW_CHANNELS = [
  "GPS Latitude",
  "GPS Longitude",
  "Ground Speed",
  "Throttle Pos",
  "Brake Pos",
  "Clutch Pos",
  "Steering Pos",
  "Steering Shaft Torque",
  "Gear",
  "Engine RPM",
  "Engine Max RPM",
  "Fuel Level",
  "Virtual Energy",
  "SoC",
  "Regen Rate",
  "Track Temperature",
  "Ambient Temperature",
  "Wind Speed",
  "Engine Water Temp",
  "Engine Oil Temp",
  "Turbo Boost Pressure",
  "G Force Lat",
  "G Force Long",
  "G Force Vert",
  "TyresPressure",
  "TyresTempCentre",
  "TyresTempLeft",
  "TyresTempRight",
  "Tyres Wear",
  "TyresCompound",
  "Brakes Temp",
  // Temps au tour / secteurs (événementiels).
  "Current LapTime",
  "Lap Time",
  "Best LapTime",
  "Current Sector",
  "Current Sector1",
  "Current Sector2",
  "Last Sector1",
  "Last Sector2",
  "In Pits",
  // Électronique (événementiel → suit les changements faits en jeu).
  "ABSLevel",
  "TCLevel",
  "TCCut",
  "TCSlipAngle",
  "FuelMixtureMap",
  "Brake Bias Rear",
];

/** Canaux d'électronique présents dans VIEW_CHANNELS (pour l'encart). */
const ELECTRONICS_CHANNELS = [
  "ABSLevel",
  "TCLevel",
  "TCCut",
  "TCSlipAngle",
  "FuelMixtureMap",
  "Brake Bias Rear",
];

// Graphes du centre (axe distance), réutilisant TelemetryChart.
const CHART_DEFS: {
  key: string;
  ch: string;
  color: string;
  /** Couleur de la série de référence (comparaison) — contrastée dans chaque graphe. */
  refColor: string;
  scale: string;
  unit: string;
  yRange?: { min: number; max: number };
}[] = [
  { key: "speed", ch: "Ground Speed", color: "#38bdf8", refColor: "#fb7185", scale: "speed", unit: "km/h" },
  { key: "throttle", ch: "Throttle Pos", color: "#22c55e", refColor: "#f472b6", scale: "thr", unit: "%", yRange: { min: 0, max: 100 } },
  { key: "brake", ch: "Brake Pos", color: "#ef4444", refColor: "#60a5fa", scale: "brk", unit: "%", yRange: { min: 0, max: 100 } },
  { key: "steering", ch: "Steering Pos", color: "#f59e0b", refColor: "#818cf8", scale: "steer", unit: "%", yRange: { min: -100, max: 100 } },
  { key: "rpm", ch: "Engine RPM", color: "#a78bfa", refColor: "#34d399", scale: "rpm", unit: "" },
  { key: "gear", ch: "Gear", color: "#e2e8f0", refColor: "#f59e0b", scale: "gear", unit: "" },
  { key: "gforce", ch: "G Force Long", color: "#ec4899", refColor: "#38bdf8", scale: "g", unit: "G" },
];

const WHEELS = ["FL", "FR", "RL", "RR"];
const SPEEDS = [0.5, 1, 2, 4];

/** Phase où l'on perd le plus de temps dans un virage (pour le libellé UI). */
function dominantPhaseKey(
  pl: { braking: number; mid: number; exit: number } | null,
): "braking" | "mid" | "exit" | null {
  if (!pl) return null;
  const total = pl.braking + pl.mid + pl.exit;
  if (total <= 0.02) return null; // perte négligeable
  const arr: ["braking" | "mid" | "exit", number][] = [
    ["braking", pl.braking],
    ["mid", pl.mid],
    ["exit", pl.exit],
  ];
  arr.sort((a, b) => b[1] - a[1]);
  return arr[0][1] > 0 ? arr[0][0] : null;
}

export function TelemetryView() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const path = params.get("path");
  const aiCoachEnabled = useAppStore((s) => s.aiCoachEnabled);

  const [meta, setMeta] = useState<TelemetryMeta | null>(null);
  const [data, setData] = useState<TelemetryChannelData | null>(null);
  const [lap, setLap] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Comparaison (même fichier OU autre session du même circuit).
  const [files, setFiles] = useState<TelemetryFileInfo[]>([]);
  const [refPath, setRefPath] = useState<string | null>(null); // null = pas de réf.
  const [refMeta, setRefMeta] = useState<TelemetryMeta | null>(null);
  const [refLap, setRefLap] = useState<number | null>(null);
  const [refData, setRefData] = useState<TelemetryChannelData | null>(null);

  // Tête de lecture.
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  // Plage de zoom X partagée entre tous les graphes (null = plein tour).
  const [zoom, setZoom] = useState<[number, number] | null>(null);
  // Caméra de suivi sur la carte (zoom + recentrage sur la voiture).
  const [follow, setFollow] = useState(false);
  // Vue carte : 2D ou 3D (relief reconstruit).
  const [view3d, setView3d] = useState(false);
  // Superposition de la trajectoire de référence sur la carte (comparaison).
  const [showRefLine, setShowRefLine] = useState(true);
  // Surface de piste reconstruite (vraie largeur, via Path Lateral/Track Edge).
  const [showRoad, setShowRoad] = useState(true);
  const [trackSurface, setTrackSurface] = useState<TrackSurface | null>(null);
  // Survol lié carte↔graphes : index pointé (prioritaire sur la lecture).
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  // Graphes repliés (clé de graphe) ; la valeur en direct reste visible.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Import d'un fichier de référence partagé (.duckdb hors dossier Telemetry).
  // Le pipeline de comparaison (getMeta/getChannels) accepte un chemin arbitraire.
  const importRef = async () => {
    try {
      const sel = await openFileDialog({
        multiple: false,
        filters: [{ name: "Telemetry", extensions: ["duckdb"] }],
      });
      if (typeof sel === "string") setRefPath(sel);
    } catch {
      /* annulé / hors Tauri */
    }
  };

  // ── Chargements ────────────────────────────────────────────────────────────
  // Liste des enregistrements (pour la comparaison inter-sessions, même circuit).
  useEffect(() => {
    telemetry.listFiles().then(setFiles).catch(() => setFiles([]));
  }, []);

  useEffect(() => {
    if (!path) return;
    // Garde de course : si `path` change avant la réponse, on ignore le résultat
    // tardif (sinon meta/lap du fichier A écrasent l'état alors que path = B →
    // données désynchronisées, index de tour potentiellement hors borne).
    let cancelled = false;
    setMeta(null);
    setData(null);
    setRefPath(null);
    setRefMeta(null);
    setRefLap(null);
    setRefData(null);
    telemetry
      .getMeta(path)
      .then((m) => {
        if (cancelled) return;
        setMeta(m);
        // Défaut : 1er tour « roulé » si présent, sinon session entière.
        setLap(m.laps.length > 1 ? m.laps[0].lap : null);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  useEffect(() => {
    if (!path || !meta) return;
    let cancelled = false;
    telemetry
      .getChannels(path, VIEW_CHANNELS, lap, 4000)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setIdx(0);
          setHoverIdx(null);
          setPlaying(false);
          setZoom(null);
        }
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [path, meta, lap]);

  // Surface de piste reconstruite (vraie largeur) à partir du **tour le plus
  // rapide** — méthode de LMU Telemetry Lab : bords = trajectoire ± largeur via
  // les canaux `Path Lateral` / `Track Edge`. Tour découpé proprement par la
  // table `Lap` du jeu (`getChannels(lap=N)`), statique pour la session.
  useEffect(() => {
    if (!path || !meta) {
      setTrackSurface(null);
      return;
    }
    // Tour le plus rapide (hors dernier segment, toujours partiel).
    let best: { lap: number; duration: number } | null = null;
    for (let i = 0; i < meta.laps.length - 1; i++) {
      const l = meta.laps[i];
      if (l.duration > 30 && (!best || l.duration < best.duration)) {
        best = { lap: l.lap, duration: l.duration };
      }
    }
    if (!best) {
      setTrackSurface(null);
      return;
    }
    let cancelled = false;
    telemetry
      .getChannels(
        path,
        ["GPS Latitude", "GPS Longitude", "Path Lateral", "Track Edge", "In Pits"],
        best.lap,
        4000,
      )
      .then((d) => {
        if (cancelled) return;
        const ch = (name: string) =>
          d.channels.find((c) => c.name === name)?.values[0];
        const la = ch("GPS Latitude");
        const lo = ch("GPS Longitude");
        const pl = ch("Path Lateral");
        const te = ch("Track Edge");
        setTrackSurface(
          la && lo && pl && te
            ? reconstructTrackSurface(la, lo, pl, te, ch("In Pits"))
            : null,
        );
      })
      .catch(() => !cancelled && setTrackSurface(null));
    return () => {
      cancelled = true;
    };
  }, [path, meta]);

  // Métadonnées du fichier de référence (peut être un autre fichier).
  useEffect(() => {
    if (!refPath) {
      setRefMeta(null);
      setRefLap(null);
      return;
    }
    let cancelled = false;
    telemetry
      .getMeta(refPath)
      .then((m) => {
        if (cancelled) return;
        setRefMeta(m);
        // Défaut : 1er tour de la référence (≠ tour principal si même fichier).
        const first = m.laps.find((l) => !(refPath === path && l.lap === lap)) ?? m.laps[0];
        setRefLap(first ? first.lap : null);
      })
      .catch(() => !cancelled && setRefMeta(null));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refPath]);

  // Données du tour de référence (depuis le fichier de référence).
  useEffect(() => {
    if (!refPath || refLap === null) {
      setRefData(null);
      return;
    }
    let cancelled = false;
    telemetry
      .getChannels(refPath, VIEW_CHANNELS, refLap, 4000)
      .then((d) => !cancelled && setRefData(d))
      .catch(() => !cancelled && setRefData(null));
    return () => {
      cancelled = true;
    };
  }, [refPath, refLap]);

  // ── Comparaison (réalignement par distance) ──────────────────────────────────
  const compare = useMemo(() => {
    if (lap === null || !data || !refData) return null;
    const target = data.dist;
    if (target.length < 2 || refData.dist.length < 2) return null;
    const resample = (rd: number[], rv: number[]): number[] => {
      const out = new Array<number>(target.length);
      let j = 0;
      for (let k = 0; k < target.length; k++) {
        const d = target[k];
        while (j < rd.length - 1 && rd[j + 1] < d) j++;
        const d0 = rd[j];
        const d1 = rd[j + 1] ?? d0;
        const v0 = rv[j];
        const v1 = rv[j + 1] ?? v0;
        out[k] = v0 + (v1 - v0) * (d1 > d0 ? (d - d0) / (d1 - d0) : 0);
      }
      return out;
    };
    const map: Record<string, number[]> = {};
    refData.channels.forEach((c) => {
      map[c.name] = resample(refData.dist, c.values[0]);
    });
    const refTime = resample(refData.dist, refData.time);
    const delta = data.time.map((tm, k) => tm - refTime[k]);
    return { map, delta };
  }, [lap, data, refData]);

  const comparing = compare !== null;

  // Avertissement : référence d'un circuit ou d'une voiture différents → le
  // réalignement par distance n'a alors aucun sens.
  const refMismatch = useMemo<string[] | null>(() => {
    if (!meta || !refMeta) return null;
    const a = meta.info;
    const b = refMeta.info;
    const issues: string[] = [];
    if (a.track !== b.track) issues.push(t("telemetry.refDiffTrack"));
    if (a.car_class && b.car_class && a.car_class !== b.car_class) {
      issues.push(t("telemetry.refDiffClass"));
    } else {
      const carA = a.car_model || a.car_name;
      const carB = b.car_model || b.car_name;
      if (carA && carB && carA !== carB) issues.push(t("telemetry.refDiffCar"));
    }
    return issues.length ? issues : null;
  }, [meta, refMeta, t]);

  // ── Axe X (distance) + lecture ───────────────────────────────────────────────
  const chartX = useMemo(() => {
    if (!data) return [];
    return data.dist.length > 0 ? data.dist : data.time;
  }, [data]);
  const n = data?.time.length ?? 0;
  const i = Math.min(Math.max(0, Math.round(idx)), Math.max(0, n - 1));
  // Index effectif des overlays : le survol (graphe ou carte) prime sur la lecture.
  const dispIdx = hoverIdx != null && hoverIdx >= 0 && hoverIdx < n ? hoverIdx : i;

  // Boucle de lecture (rAF, temps réel × vitesse). N'affecte que `idx`.
  useEffect(() => {
    if (!playing || !data || n < 2) return;
    const dtData = data.time[1] - data.time[0] || 0.01;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dtReal = (now - last) / 1000;
      last = now;
      setIdx((prev) => {
        const next = prev + (dtReal * speed) / dtData;
        if (next >= n - 1) {
          setPlaying(false);
          return n - 1;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, n, data]);

  // ── Helpers de lecture des canaux ────────────────────────────────────────────
  const scal = (name: string): number[] =>
    data?.channels.find((c) => c.name === name)?.values[0] ?? [];
  const wheel = (name: string): number[][] =>
    data?.channels.find((c) => c.name === name)?.values ?? [];
  // Lectures de valeurs indexées sur `dispIdx` (survol prioritaire) → bouger le
  // point jaune (carte) ou survoler un graphe scrubbe TOUT le dashboard ensemble.
  const at = (arr: number[]): number | undefined => arr[dispIdx];
  const hasChan = (name: string): boolean =>
    !!data?.channels.find((c) => c.name === name);
  const elecInt = (name: string): string => {
    const v = at(scal(name));
    return v != null && isFinite(v) ? String(Math.round(v)) : "—";
  };
  const elecBB = (): string => {
    const v = at(scal("Brake Bias Rear"));
    return v != null && isFinite(v) ? `${(v * 100).toFixed(1)}%` : "—";
  };

  // ── Séries des graphes (mémoïsées → stables pendant la lecture) ───────────────
  const charts = useMemo(() => {
    if (!data) return [];
    const get = (d: TelemetryChannelData, name: string) =>
      d.channels.find((c) => c.name === name)?.values[0];
    return CHART_DEFS.map((def) => {
      const main = get(data, def.ch);
      if (!main) return null;
      const series: TelemetrySeries[] = [
        { label: def.key, values: main, color: def.color, scale: def.scale, unit: def.unit, width: 1.5 },
      ];
      if (comparing && compare && compare.map[def.ch]) {
        series.push({
          label: `${def.key} ${t("telemetry.refTag")}`,
          values: compare.map[def.ch],
          color: def.refColor,
          scale: def.scale,
          unit: def.unit,
          dash: [4, 4],
        });
      }
      return {
        key: def.key,
        ch: def.ch,
        unit: def.unit,
        title: t(`telemetry.group.${def.key}`, def.key),
        series,
        yRange: def.yRange ? { scale: def.scale, ...def.yRange } : undefined,
      };
    }).filter(Boolean) as {
      key: string;
      ch: string;
      unit: string;
      title: string;
      series: TelemetrySeries[];
      yRange?: { scale: string; min: number; max: number };
    }[];
  }, [data, comparing, compare, t]);

  // Série du graphe de delta — mémoïsée (sinon recréée à chaque frame → uPlot
  // reconstruit le graphe en boucle pendant la lecture = scintillement).
  const deltaSeries = useMemo<TelemetrySeries[]>(
    () =>
      compare
        ? [
            {
              label: t("telemetry.delta"),
              values: compare.delta,
              color: "#f59e0b",
              scale: "delta",
              unit: "s",
              width: 2,
            },
          ]
        : [],
    [compare, t],
  );

  // ── Segmentation virages auto + points de freinage (#6) ──────────────────────
  const corners = useMemo(() => {
    if (!data || lap === null) return [];
    const get = (name: string) =>
      data.channels.find((c) => c.name === name)?.values[0] ?? [];
    return detectCorners(get("Ground Speed"), get("Brake Pos"), data.dist);
  }, [data, lap]);

  // ── Analyse assistée (#90/#92) : temps perdu/virage, point lent, focus zones ──
  const analysis = useMemo(() => {
    if (!data || corners.length === 0) return null;
    const speed = data.channels.find((c) => c.name === "Ground Speed")?.values[0] ?? [];
    if (speed.length === 0) return null;
    const delta = comparing && compare ? compare.delta : null;
    const refSpeed = comparing && compare ? (compare.map["Ground Speed"] ?? null) : null;
    const brake = data.channels.find((c) => c.name === "Brake Pos")?.values[0] ?? null;
    const throttle = data.channels.find((c) => c.name === "Throttle Pos")?.values[0] ?? null;
    return analyzeLap(corners, speed, data.dist, delta, refSpeed, brake, throttle);
  }, [data, corners, comparing, compare]);

  // ── LAP DETAILS : temps + secteurs S1/S2/S3 (tour sélectionné + référence) ────
  const lapDetail = useMemo(() => {
    if (!data || lap === null) return null;
    type Sec = { lap: number | null; s1: number | null; s2: number | null; s3: number | null };
    const sectorsOf = (d: TelemetryChannelData, durFallback?: number): Sec => {
      const li = d.time.length - 1;
      const g = (name: string): number | null => {
        const v = d.channels.find((c) => c.name === name)?.values[0]?.[li];
        return v != null && isFinite(v) && v > 0 ? v : null;
      };
      const s1 = g("Current Sector1") ?? g("Last Sector1");
      const s2 = g("Current Sector2") ?? g("Last Sector2");
      const lt = g("Lap Time") ?? (durFallback && durFallback > 0 ? durFallback : null);
      const s3 = lt != null && s1 != null && s2 != null ? lt - s1 - s2 : null;
      return { lap: lt, s1, s2, s3 };
    };
    const cur = sectorsOf(data, meta?.laps.find((l) => l.lap === lap)?.duration);
    const ref =
      refData && refLap !== null
        ? sectorsOf(refData, refMeta?.laps.find((l) => l.lap === refLap)?.duration)
        : null;
    return { cur, ref };
  }, [data, lap, refData, refLap, meta, refMeta]);

  // Altitude reconstruite (m) pour la vue 3D (mémoïsée → pas à chaque frame).
  const elevation = useMemo(
    () => (data && meta ? computeElevation(data.dist, meta.info.track, meta.info.track_layout) : []),
    [data, meta]
  );

  // ── Rendu ────────────────────────────────────────────────────────────────────
  if (!path) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        {t("telemetry.noFile")}
      </div>
    );
  }
  if (error) {
    return (
      <div className="py-16 text-center text-sm text-destructive">{error}</div>
    );
  }
  if (!meta || !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const curTime = data.time[dispIdx] ?? 0;
  const totTime = data.time[n - 1] ?? 0;
  const curDist = chartX[dispIdx] ?? 0;
  const lat = scal("GPS Latitude");
  const lon = scal("GPS Longitude");
  const throttle = scal("Throttle Pos");
  const brake = scal("Brake Pos");
  const hasGps = lat.length >= 2;
  // GPS du tour de référence (même circuit) → superposition des trajectoires.
  const refScal = (name: string): number[] =>
    refData?.channels.find((c) => c.name === name)?.values[0] ?? [];
  const refLat = refScal("GPS Latitude");
  const refLon = refScal("GPS Longitude");
  const hasRefGps = comparing && showRefLine && refLat.length >= 2;
  const hasHybrid = data.channels.some(
    (c) => (c.name === "SoC" || c.name === "Virtual Energy") && (c.values[0]?.some((v) => v > 0) ?? false)
  );

  const togglePlay = () => {
    if (!playing && i >= n - 1) setIdx(0);
    setPlaying((p) => !p);
  };

  return (
    <div className="grid grid-cols-[260px_1fr_300px] gap-3 max-[1400px]:grid-cols-[220px_1fr] max-[1100px]:grid-cols-1">
      {/* ─── Colonne gauche : infos session ─── */}
      <div className="flex flex-col gap-3">
        <button
          onClick={() => navigate("/telemetry")}
          className="inline-flex items-center gap-1.5 self-start rounded-md border border-border px-2.5 py-1 text-sm text-muted-foreground hover:bg-accent/60"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("telemetry.back")}
        </button>

        <Card>
          <CardContent className="flex flex-col gap-3 p-3">
            <SessionBadge type={meta.info.session_type} />
            <div className="flex items-center gap-2">
              <TrackFlag track={meta.info.track} className="h-4 w-auto" />
              <div className="min-w-0">
                <div className="truncate font-bold">{meta.info.track}</div>
                <div className="truncate text-micro text-muted-foreground">
                  {meta.info.track_layout}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CarLogo carName={meta.info.car_model || meta.info.car_name} className="h-5 w-auto" />
              <div className="min-w-0">
                <div className="truncate font-semibold">
                  {meta.info.car_model || meta.info.car_name}
                </div>
                <div className="truncate text-micro text-muted-foreground">
                  {meta.info.car_name}
                </div>
              </div>
              <ClassBadge carClass={meta.info.car_class} />
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">{meta.info.driver}</span>
            </div>
            <InfoRow label={t("telemetry.weather")} value={meta.info.weather} />
            <InfoRow
              label={t("telemetry.trackTemp")}
              value={`${(at(scal("Track Temperature")) ?? 0).toFixed(0)} °C`}
            />
            <InfoRow
              label={t("telemetry.sessionTime")}
              value={meta.metadata["SessionTime"] ?? "—"}
            />
          </CardContent>
        </Card>

        {/* Sélecteurs de tour */}
        <Card>
          <CardContent className="flex flex-col gap-2 p-3">
            <label className="text-micro uppercase tracking-wide text-muted-foreground">
              {t("telemetry.selectLap")}
            </label>
            <select
              value={lap === null ? "" : String(lap)}
              onChange={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                setLap(v);
                // Comparaison seulement avec un tour principal précis.
                if (v === null) setRefPath(null);
              }}
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">{t("telemetry.wholeSession")}</option>
              {meta.laps.map((l) => (
                <option key={l.lap} value={l.lap}>
                  {t("telemetry.lapN", { n: l.lap })} — {formatGap(l.duration)}
                </option>
              ))}
            </select>
            {lap !== null && (
              <>
                <label className="text-micro uppercase tracking-wide text-muted-foreground">
                  {t("telemetry.compareWith")}
                </label>
                <p className="text-xs text-muted-foreground/70 -mt-1">
                  {t("telemetry.compareHelp")}
                </p>
                {/* Session de référence (même circuit — éventuellement la même) */}
                <select
                  value={refPath ?? ""}
                  onChange={(e) => setRefPath(e.target.value || null)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="">{t("telemetry.compareNone")}</option>
                  {/* Référence importée (hors dossier Telemetry) → option dédiée. */}
                  {refPath && !files.some((f) => f.path === refPath) && (
                    <option value={refPath}>
                      📄 {refPath.split(/[\\/]/).pop()}
                    </option>
                  )}
                  {files
                    .filter((f) => f.track === meta.info.track)
                    .map((f) => (
                      <option key={f.path} value={f.path}>
                        {f.path === path ? `★ ${t("telemetry.sameSession")}` : ""}
                        {f.path === path ? " · " : ""}
                        {sessionTypeLabel(f.session_type, t)} ·{" "}
                        {f.car_model || f.car_name}
                        {f.best_lap != null ? ` · ${formatTime(f.best_lap)}` : ""} ·{" "}
                        {formatDateTime(f.mtime)}
                      </option>
                    ))}
                </select>
                {/* Import d'un fichier de référence partagé (.duckdb, n'importe où) */}
                <button
                  type="button"
                  onClick={() => void importRef()}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60"
                  title={t("telemetry.importRefHint")}
                >
                  {t("telemetry.importRef")}
                </button>
                {/* Tour de référence dans le fichier choisi */}
                {refPath && refMeta && (
                  <select
                    value={refLap === null ? "" : String(refLap)}
                    onChange={(e) =>
                      setRefLap(e.target.value === "" ? null : Number(e.target.value))
                    }
                    className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                  >
                    {refMeta.laps
                      .filter((l) => !(refPath === path && l.lap === lap))
                      .map((l) => (
                        <option key={l.lap} value={l.lap}>
                          {t("telemetry.lapN", { n: l.lap })} — {formatGap(l.duration)}
                        </option>
                      ))}
                  </select>
                )}
                {refMismatch && (
                  <div className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      {t("telemetry.refMismatch")} {refMismatch.join(" · ")}
                    </span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Électronique — valeurs LIVE (suivent les changements faits en jeu) */}
        {data.channels.some((c) => ELECTRONICS_CHANNELS.includes(c.name)) && (
          <Card>
            <CardContent className="flex flex-wrap gap-1.5 p-3">
              <span className="w-full text-micro uppercase tracking-wide text-muted-foreground">
                {t("telemetry.electronics")}
              </span>
              {hasChan("ABSLevel") && <Elec l="ABS" v={elecInt("ABSLevel")} />}
              {hasChan("TCLevel") && <Elec l="TC" v={elecInt("TCLevel")} />}
              {hasChan("TCCut") && <Elec l="TC Cut" v={elecInt("TCCut")} />}
              {hasChan("TCSlipAngle") && <Elec l="TC Slip" v={elecInt("TCSlipAngle")} />}
              {hasChan("FuelMixtureMap") && <Elec l="Mix" v={elecInt("FuelMixtureMap")} />}
              {hasChan("Brake Bias Rear") && <Elec l="BB" v={elecBB()} />}
            </CardContent>
          </Card>
        )}

        {/* Coach IA — juste sous l'électronique */}
        {aiCoachEnabled && meta && (
          <Card>
            <CardContent className="p-3">
              <TelemetryCoachPanel meta={meta} analysis={analysis} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* ─── Colonne centre : carte + lecture + graphes ─── */}
      <div className="flex min-w-0 flex-col gap-3">
        <Card>
          <CardContent className="p-2">
            <div className="mb-1 flex items-center gap-2 px-1 text-micro text-muted-foreground">
              <span className="font-medium uppercase tracking-wide">{t("telemetry.group.map")}</span>
              {/* Bascule 2D / 3D */}
              <div className="ml-auto flex overflow-hidden rounded border border-border">
                <button
                  onClick={() => setView3d(false)}
                  className={cn("px-1.5 py-0.5 text-micro", !view3d ? "bg-primary text-primary-foreground" : "hover:bg-accent/60")}
                >
                  2D
                </button>
                <button
                  onClick={() => setView3d(true)}
                  className={cn("px-1.5 py-0.5 text-micro", view3d ? "bg-primary text-primary-foreground" : "hover:bg-accent/60")}
                >
                  3D
                </button>
              </div>
              {!view3d && (
                <button
                  onClick={() => {
                    setHoverIdx(null); // évite une caméra figée sur un survol périmé
                    setFollow((f) => !f);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-micro transition-colors",
                    follow
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent/60"
                  )}
                >
                  <LocateFixed className="h-3 w-3" /> {t("telemetry.follow")}
                </button>
              )}
              {/* Surface de piste (vraie largeur) — disponible en 2D et 3D */}
              {trackSurface && (
                <button
                  onClick={() => setShowRoad((s) => !s)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-micro transition-colors",
                    showRoad
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent/60"
                  )}
                  title={t("telemetry.trackSurfaceHint")}
                >
                  <span className="h-2 w-3 rounded-sm bg-slate-500/70" aria-hidden />
                  {t("telemetry.trackSurface")}
                </button>
              )}
              {/* Superposition de la trajectoire de référence (visible en comparaison) */}
              {!view3d && comparing && (
                <button
                  onClick={() => setShowRefLine((s) => !s)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-micro transition-colors",
                    showRefLine
                      ? "border-[#a855f7] bg-[#a855f7]/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent/60"
                  )}
                  title={t("telemetry.refLineHint")}
                >
                  <span className="h-0.5 w-3 rounded-full bg-[#a855f7]" aria-hidden />
                  {t("telemetry.refLine")}
                </button>
              )}
              <span className="tabular-nums">
                {t("telemetry.axisDistanceShort")}: {(curDist / 1000).toFixed(2)} km
              </span>
            </div>
            {!hasGps ? (
              <div className="py-12 text-center text-sm text-muted-foreground">GPS —</div>
            ) : view3d ? (
              <Suspense
                fallback={
                  <div className="flex items-center justify-center" style={{ height: 300 }}>
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                }
              >
                <Track3D
                  lat={lat}
                  lon={lon}
                  elevation={elevation}
                  throttle={throttle}
                  brake={brake}
                  carIndex={dispIdx}
                  trackSurface={showRoad ? trackSurface ?? undefined : undefined}
                  height={300}
                  theme={theme}
                />
              </Suspense>
            ) : (
              <div className="relative">
                <TrackMap
                  lat={lat}
                  lon={lon}
                  throttle={throttle}
                  brake={brake}
                  refLat={hasRefGps ? refLat : undefined}
                  refLon={hasRefGps ? refLon : undefined}
                  trackSurface={showRoad ? trackSurface ?? undefined : undefined}
                  markerIndex={dispIdx}
                  markers={follow ? undefined : corners.map((c) => c.brakeIdx)}
                  corners={
                    follow
                      ? undefined
                      : (analysis?.corners ?? corners).map((c) => ({
                          index: c.apexIdx,
                          label: `T${c.n}`,
                          focus: "focusRank" in c && c.focusRank != null,
                        }))
                  }
                  follow={follow}
                  onHoverPoint={setHoverIdx}
                  height={300}
                  theme={theme}
                />
                {/* Mini-carte d'aperçu (visible en mode suivi) */}
                {follow && (
                  <div className="absolute right-2 top-2 w-28 rounded-md border border-border bg-background/80 p-0.5 shadow backdrop-blur">
                    <TrackMap
                      lat={lat}
                      lon={lon}
                      throttle={throttle}
                      brake={brake}
                      markerIndex={dispIdx}
                      plain
                      height={70}
                      theme={theme}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Contrôles de lecture */}
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={togglePlay}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground hover:opacity-90"
                aria-label={playing ? t("telemetry.pause") : t("telemetry.play")}
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <span className="w-24 shrink-0 text-micro tabular-nums text-muted-foreground">
                {curTime.toFixed(1)} / {totTime.toFixed(1)} s
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(0, n - 1)}
                value={dispIdx}
                onChange={(e) => {
                  setPlaying(false);
                  setHoverIdx(null);
                  setIdx(Number(e.target.value));
                }}
                className="h-1.5 flex-1 cursor-pointer accent-primary"
                aria-label={t("telemetry.timeline")}
              />
              <div className="flex overflow-hidden rounded-md border border-border">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={cn(
                      "px-2 py-0.5 text-micro tabular-nums",
                      speed === s ? "bg-primary text-primary-foreground" : "hover:bg-accent/60"
                    )}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Graphe de delta (comparaison) */}
        {comparing && compare && (
          <Card>
            <CardContent className="p-2">
              <div className="mb-1 px-1 text-micro font-medium uppercase tracking-wide text-muted-foreground">
                {t("telemetry.deltaTitle")}
              </div>
              <TelemetryChart
                x={chartX}
                series={deltaSeries}
                xLabel={t("telemetry.axisDistanceShort")}
                height={130}
                syncKey="tlmview"
                cursorIdx={dispIdx}
                zoom={zoom}
                onZoom={setZoom}
                onHoverIdx={setHoverIdx}
                theme={theme}
              />
            </CardContent>
          </Card>
        )}

        {/* Graphes principaux (repliables, valeur live conservée) */}
        {charts.map((c) => {
          const isCollapsed = collapsed.has(c.key);
          const cur = at(scal(c.ch));
          return (
            <Card key={c.key}>
              <CardContent className="p-2">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-micro font-medium uppercase tracking-wide text-muted-foreground">
                    {c.title}
                  </span>
                  <span className="ml-auto text-sm font-semibold tabular-nums">
                    {cur != null && isFinite(cur) ? cur.toFixed(c.key === "rpm" ? 0 : 1) : "—"}
                    {c.unit && <span className="ml-0.5 text-micro text-muted-foreground">{c.unit}</span>}
                  </span>
                  <button
                    onClick={() => toggleCollapse(c.key)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent/60"
                    aria-label={c.title}
                    aria-expanded={!isCollapsed}
                  >
                    {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {!isCollapsed && (
                  <div className="mt-1">
                    <TelemetryChart
                      x={chartX}
                      series={c.series}
                      xLabel={t("telemetry.axisDistanceShort")}
                      height={160}
                      syncKey="tlmview"
                      yRange={c.yRange}
                      cursorIdx={dispIdx}
                      zoom={zoom}
                      onZoom={setZoom}
                      onHoverIdx={setHoverIdx}
                      theme={theme}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ─── Colonne droite : dashboard live ─── */}
      <div className="flex flex-col gap-3 max-[1400px]:col-span-2 max-[1400px]:grid max-[1400px]:grid-cols-2 max-[1100px]:col-span-1 max-[1100px]:grid-cols-1">
        {/* Vitesse / régime / rapport — jauge en arc */}
        <Card>
          <CardContent className="flex flex-col items-center gap-1 p-3">
            <Gauge
              speed={at(scal("Ground Speed")) ?? 0}
              rpm={at(scal("Engine RPM")) ?? 0}
              gear={gearLabel(at(scal("Gear")))}
              throttle={at(scal("Throttle Pos")) ?? 0}
              brake={at(scal("Brake Pos")) ?? 0}
              theme={theme}
            />
            {/* Volant qui tourne (style V1) */}
            <div className="mt-2 flex flex-col items-center gap-0.5">
              <SteeringWheel
                steeringPct={at(scal("Steering Pos")) ?? 0}
                car={meta.info.car_model || meta.info.car_name}
                theme={theme}
              />
              <span className="text-micro text-muted-foreground tabular-nums">
                {t("telemetry.steering")}{" "}
                {Math.round(((at(scal("Steering Pos")) ?? 0) / 100) * 180)}°
              </span>
            </div>
          </CardContent>
        </Card>

        {/* LAP DETAILS — temps + secteurs (tour vs référence) */}
        {lapDetail && (
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-micro uppercase tracking-wide text-muted-foreground">
                  {t("telemetry.lapTiming")}
                </span>
                <span className="text-micro tabular-nums text-muted-foreground">
                  {t("telemetry.currentLap")}: {fmtLap(at(scal("Current LapTime")))}
                </span>
              </div>
              <table className="mt-1.5 w-full text-sm">
                <thead>
                  <tr className="text-micro text-muted-foreground">
                    <th className="text-left font-medium" />
                    <th className="text-right font-medium">{t("telemetry.lapWord")}</th>
                    {lapDetail.ref && <th className="text-right font-medium">{t("telemetry.refCol")}</th>}
                    {lapDetail.ref && <th className="text-right font-medium">Δ</th>}
                  </tr>
                </thead>
                <tbody>
                  <LapRow label={t("telemetry.lapWord")} cur={lapDetail.cur.lap} ref={lapDetail.ref?.lap} hasRef={!!lapDetail.ref} bold />
                  <LapRow label="S1" cur={lapDetail.cur.s1} ref={lapDetail.ref?.s1} hasRef={!!lapDetail.ref} />
                  <LapRow label="S2" cur={lapDetail.cur.s2} ref={lapDetail.ref?.s2} hasRef={!!lapDetail.ref} />
                  <LapRow label="S3" cur={lapDetail.cur.s3} ref={lapDetail.ref?.s3} hasRef={!!lapDetail.ref} />
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* Pneus : 3 points (G/C/D), usure, pression, frein */}
        <Card>
          <CardContent className="p-3">
            <span className="text-micro uppercase tracking-wide text-muted-foreground">
              {t("telemetry.tyres")}
            </span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {WHEELS.map((w, wi) => (
                <TyreCard
                  key={w}
                  label={w}
                  pressure={wheel("TyresPressure")[wi]?.[dispIdx]}
                  tempL={wheel("TyresTempLeft")[wi]?.[dispIdx]}
                  tempC={wheel("TyresTempCentre")[wi]?.[dispIdx]}
                  tempR={wheel("TyresTempRight")[wi]?.[dispIdx]}
                  wear={wheel("Tyres Wear")[wi]?.[dispIdx]}
                  compoundIdx={wheel("TyresCompound")[wi]?.[dispIdx]}
                  carClass={meta.info.car_class}
                  brakeTemp={wheel("Brakes Temp")[wi]?.[dispIdx]}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Moteur */}
        <DashCard title={t("telemetry.engine")}>
          <Stat label={t("telemetry.water")} value={fmtNum(at(scal("Engine Water Temp")), 0, "°C")} />
          <Stat label={t("telemetry.oil")} value={fmtNum(at(scal("Engine Oil Temp")), 0, "°C")} />
          <Stat label={t("telemetry.turbo")} value={fmtNum(divK(at(scal("Turbo Boost Pressure"))), 0, "kPa")} />
        </DashCard>

        {/* Hybride (si présent) */}
        {hasHybrid && (
          <DashCard title={t("telemetry.hybrid")}>
            <Stat label={t("telemetry.soc")} value={fmtNum(at(scal("SoC")), 0, "%")} />
            <Stat label={t("telemetry.energy")} value={fmtNum(at(scal("Virtual Energy")), 0, "%")} />
            <Stat label={t("telemetry.regen")} value={fmtNum(at(scal("Regen Rate")), 0, "kW")} />
          </DashCard>
        )}

        {/* Forces & conditions */}
        <DashCard title={t("telemetry.forces")}>
          <Stat label="G Long" value={fmtNum(at(scal("G Force Long")), 2, "G")} />
          <Stat label="G Lat" value={fmtNum(at(scal("G Force Lat")), 2, "G")} />
          <Stat label="FFB" value={fmtNum(at(scal("Steering Shaft Torque")), 0, "Nm")} />
          <Stat label={t("telemetry.ambient")} value={fmtNum(at(scal("Ambient Temperature")), 0, "°C")} />
          <Stat label={t("telemetry.wind")} value={fmtNum(at(scal("Wind Speed")), 1, "m/s")} />
        </DashCard>

        {/* Carburant */}
        <DashCard title={t("telemetry.fuel")}>
          <Stat label={t("telemetry.fuel")} value={fmtNum(at(scal("Fuel Level")), 1, "L")} />
        </DashCard>

        {/* Analyse assistée : focus zones + temps perdu/virage + point lent (#90/#92) */}
        {analysis && analysis.corners.length > 0 && (
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-micro uppercase tracking-wide text-muted-foreground">
                  {t("telemetry.analysisTitle")} ({analysis.corners.length})
                </span>
                {analysis.totalCornerLoss != null && analysis.totalCornerLoss > 0 && (
                  <span className="text-micro tabular-nums text-muted-foreground">
                    {t("telemetry.totalLoss")} :{" "}
                    <span className="font-semibold text-red-500">
                      +{analysis.totalCornerLoss.toFixed(3)}s
                    </span>
                  </span>
                )}
              </div>

              {/* Point le plus lent */}
              {analysis.slowest && (
                <button
                  onClick={() => {
                    setPlaying(false);
                    setIdx(analysis.slowest!.idx);
                  }}
                  className="mt-1.5 flex w-full items-center justify-between rounded bg-accent/30 px-1.5 py-1 text-sm hover:bg-accent/60"
                >
                  <span className="text-micro uppercase tracking-wide text-muted-foreground">
                    {t("telemetry.slowestPoint")}
                  </span>
                  <span className="tabular-nums">
                    {analysis.slowest.speed.toFixed(0)} km/h
                    <span className="ml-1.5 text-micro text-muted-foreground">
                      @ {(analysis.slowest.dist / 1000).toFixed(2)} km
                    </span>
                  </span>
                </button>
              )}

              {/* Astuce si pas de référence */}
              {!analysis.hasRef && (
                <p className="mt-1.5 text-micro text-muted-foreground">
                  {t("telemetry.analysisNoRef")}
                </p>
              )}

              {/* Liste des virages (focus zones surlignées) */}
              <div className="mt-1.5 flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                {analysis.corners.map((c) => {
                  const phaseKey =
                    c.focusRank != null ? dominantPhaseKey(c.phaseLoss) : null;
                  return (
                  <button
                    key={c.n}
                    onClick={() => {
                      setPlaying(false);
                      setIdx(c.brakeIdx);
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent/50",
                      c.focusRank != null &&
                        "bg-red-500/10 ring-1 ring-inset ring-red-500/30",
                    )}
                    title={t("telemetry.seekBrake")}
                  >
                    <span className="flex w-9 shrink-0 items-center gap-1 font-semibold">
                      T{c.n}
                      {c.focusRank != null && (
                        <span className="text-red-500" aria-hidden>
                          🔥
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-micro text-muted-foreground tabular-nums">
                      {(c.brakeDist / 1000).toFixed(2)} km
                    </span>
                    {phaseKey && (
                      <span className="shrink-0 rounded bg-red-500/15 px-1 text-nano uppercase tracking-wide text-red-400">
                        {t(`telemetry.phase_${phaseKey}`)}
                      </span>
                    )}
                    <span className="ml-auto tabular-nums">
                      {c.minSpeed.toFixed(0)}
                      <span className="text-micro text-muted-foreground"> km/h</span>
                      {c.speedDelta != null && Math.abs(c.speedDelta) >= 0.5 && (
                        <span
                          className={cn(
                            "ml-1 text-micro",
                            c.speedDelta >= 0 ? "text-emerald-500" : "text-red-500",
                          )}
                        >
                          {c.speedDelta > 0 ? "+" : ""}
                          {c.speedDelta.toFixed(0)}
                        </span>
                      )}
                    </span>
                    {c.timeLost != null && (
                      <span
                        className={cn(
                          "w-14 shrink-0 text-right font-mono text-micro tabular-nums",
                          c.timeLost > 0.005
                            ? "text-red-500"
                            : c.timeLost < -0.005
                              ? "text-emerald-500"
                              : "text-muted-foreground",
                        )}
                      >
                        {c.timeLost > 0 ? "+" : ""}
                        {c.timeLost.toFixed(3)}
                      </span>
                    )}
                  </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}


