import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  live as liveApi,
  type LiveData,
  type LiveStanding,
  type LiveWheel,
} from "@/lib/api";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  ArrowLeft,
  Flag,
  Fuel,
  Cloud,
  Thermometer,
  Wind,
  Droplets,
  Maximize,
  WifiOff,
  Loader2,
  Gauge as GaugeIcon,
  AlertTriangle,
} from "lucide-react";

/** Fonction de traduction (typage léger pour les helpers). */
type Tr = (key: string, opts?: Record<string, unknown>) => string;

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtLap(s: number): string {
  if (!s || s <= 0 || !isFinite(s)) return "—:——.———";
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(3).padStart(6, "0")}`;
}
function fmtSec(s: number): string {
  if (!s || s <= 0 || !isFinite(s)) return "——.———";
  return s.toFixed(3);
}
function fmtGap(behind: number, lapsBehind: number, t: Tr): string {
  if (lapsBehind > 0) return t("live.gapLaps", { count: lapsBehind });
  if (behind > 0) return `+${behind.toFixed(3)}`;
  return "—";
}

/** Libellé localisé du type de session rF2 (0 test, 1-4 essais, …). */
function sessionLabel(s: number, t: Tr): string {
  if (s === 0) return t("live.sessTest");
  if (s >= 1 && s <= 4) return t("live.sessPractice");
  if (s >= 5 && s <= 8) return t("live.sessQualifying");
  if (s === 9) return t("live.sessWarmup");
  if (s >= 10) return t("live.sessRace");
  return t("live.sessSession");
}

type FlagKind = "green" | "yellow" | "fcy" | "stopped" | "over" | "none";

function flagFromPhase(phase: number, yellow: number): FlagKind {
  if (phase === 6) return "fcy";
  if (phase === 7) return "stopped";
  if (phase === 8) return "over";
  if (yellow > 0 && yellow !== 6) return "yellow";
  if (phase === 5) return "green";
  return "none";
}

function fmtClock(sec: number): string {
  if (sec <= 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const p = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

function pct(v: number, signed = false): string {
  return signed
    ? `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`
    : `${Math.round(v * 100)}%`;
}

// ── Composant racine ─────────────────────────────────────────────────────────

export function Live() {
  const [data, setData] = useState<LiveData | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    (async () => {
      try {
        unlisten = await liveApi.onData((d) => {
          if (!cancelled) setData(d);
        });
        await liveApi.startPolling();
      } catch {
        /* hors Tauri */
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
      liveApi.stopPolling().catch(() => {});
    };
  }, []);

  const connected = data?.connected ?? false;
  const session = data?.session ?? null;
  const inSession =
    connected &&
    !!session &&
    session.num_vehicles > 0 &&
    session.session_time > 0;

  if (!data && starting) return <InfoScreen kind="connecting" />;
  if (!connected) return <InfoScreen kind="no-game" />;
  if (!inSession) return <InfoScreen kind="no-session" />;

  return <Dashboard data={data!} />;
}

// ── Écran d'information (jeu non lancé / pas de session) ─────────────────────

function InfoScreen({
  kind,
}: {
  kind: "connecting" | "no-game" | "no-session";
}) {
  const { t } = useTranslation();
  const cfg = {
    connecting: {
      icon: <Loader2 className="h-12 w-12 animate-spin text-primary" />,
      title: t("live.connecting"),
      text: t("live.infoConnectingText"),
    },
    "no-game": {
      icon: <WifiOff className="h-12 w-12 text-muted-foreground" />,
      title: t("live.infoNoGameTitle"),
      text: t("live.noSimHint"),
    },
    "no-session": {
      icon: <Flag className="h-12 w-12 text-yellow-500" />,
      title: t("live.infoNoSessionTitle"),
      text: t("live.infoNoSessionText"),
    },
  }[kind];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center text-foreground gap-6 select-none">
      {cfg.icon}
      <div className="text-center max-w-md">
        <p className="text-lg font-semibold">{cfg.title}</p>
        <p className="text-sm text-muted-foreground mt-1">{cfg.text}</p>
      </div>
      <Link
        to="/"
        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {t("live.quit")}
      </Link>
    </div>
  );
}

// ── Tableau de bord ──────────────────────────────────────────────────────────

function Dashboard({ data }: { data: LiveData }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<
    "overview" | "telemetry" | "standings" | "map"
  >("overview");
  const tel = data.telemetry;
  const player = data.player;
  const sc = data.session;
  const flags = data.flags;
  const ext = data.extended;
  const weather = data.weather;

  const flag = flags
    ? flagFromPhase(flags.game_phase, flags.yellow_flag_state)
    : "none";
  const delta = player ? player.lap_delta : 0;

  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground select-none">
      {/* Bandeau supérieur */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border gap-4 flex-wrap">
        <div className="flex items-center gap-8">
          <Stat label={t("live.statPosition")}>
            <span className="text-primary">P{player?.position ?? "–"}</span>
            <span className="text-muted-foreground text-xl">
              /{sc?.num_vehicles ?? "–"}
            </span>
          </Stat>
          <Stat label={t("live.statLap")}>
            {player?.total_laps ?? "–"}
            {sc && sc.max_laps > 0 && sc.max_laps < 1000 && (
              <span className="text-muted-foreground text-xl">
                /{sc.max_laps}
              </span>
            )}
            <PitIndicator
              pitState={player?.pit_state ?? 0}
              numPitstops={player?.num_pitstops ?? 0}
            />
          </Stat>
          <Stat label={sessionLabel(sc?.session ?? -1, t)}>
            <span className="text-2xl">
              {sc ? fmtClock(sc.session_time) : "—"}
            </span>
          </Stat>
        </div>

        <div className="flex items-center gap-5 flex-wrap">
          <FlagPill flag={flag} />
          {weather && (
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5" title={t("live.wAir")}>
                <Cloud className="h-4 w-4 text-muted-foreground" />
                {weather.air_temp.toFixed(0)}°
              </span>
              <span
                className="flex items-center gap-1.5"
                title={t("live.wTrack")}
              >
                <Thermometer className="h-4 w-4 text-primary" />
                {weather.track_temp.toFixed(0)}°
              </span>
              <span
                className="flex items-center gap-1.5"
                title={t("live.wWind")}
              >
                <Wind className="h-4 w-4 text-muted-foreground" />
                {weather.wind_speed.toFixed(0)}
              </span>
              <span
                className="flex items-center gap-1.5"
                title={t("live.wRain")}
              >
                <Droplets
                  className={cn(
                    "h-4 w-4",
                    weather.rain > 0.05
                      ? "text-sky-400"
                      : "text-muted-foreground"
                  )}
                />
                {(weather.rain * 100).toFixed(0)}%
              </span>
            </div>
          )}
          <button
            onClick={() => document.documentElement.requestFullscreen?.()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60"
          >
            <Maximize className="h-3 w-3" /> {t("live.fullscreen")}
          </button>
          <Link
            to="/"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {t("live.quit")}
          </Link>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 px-4 pt-3 border-b border-border">
        {(
          [
            ["overview", t("live.tabOverview")],
            ["telemetry", t("live.tabTelemetry")],
            ["standings", t("live.tabStandings")],
            ["map", t("live.tabMap")],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() =>
              setTab(id as "overview" | "telemetry" | "standings" | "map")
            }
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-t-md transition-colors",
              tab === id
                ? "bg-card text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Onglet Vue d'ensemble — version V2 du tableau de bord */}
      {tab === "overview" && <OverviewView data={data} />}

      {/* Onglet Télémétrie */}
      {tab === "telemetry" && (
        <div className="flex-1 grid grid-cols-1 xl:grid-cols-2 gap-4 p-4">
          {/* Colonne gauche — pilotage */}
          <div className="flex flex-col gap-4">
            <Panel title={t("live.pPiloting")}>
              <div className="flex items-center justify-around">
                <div className="text-center">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t("live.lSpeed")}
                  </div>
                  <div className="font-mono text-6xl font-bold tabular-nums">
                    {tel ? Math.round(tel.speed_kmh) : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">km/h</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t("live.lGear")}
                  </div>
                  <div
                    className={cn(
                      "font-mono text-7xl font-bold leading-none",
                      tel && tel.rpm / Math.max(tel.max_rpm, 1) > 0.95
                        ? "text-destructive"
                        : tel && tel.rpm / Math.max(tel.max_rpm, 1) > 0.8
                          ? "text-yellow-500"
                          : "text-primary"
                    )}
                  >
                    {tel
                      ? tel.gear === 0
                        ? "N"
                        : tel.gear === -1
                          ? "R"
                          : tel.gear
                      : "—"}
                  </div>
                </div>
              </div>
              <RpmBar rpm={tel?.rpm ?? 0} maxRpm={tel?.max_rpm ?? 0} />
              <div className="flex gap-3 mt-1">
                <PedalBar
                  label={t("live.lBrake")}
                  value={tel?.brake ?? 0}
                  color="bg-destructive"
                />
                <PedalBar
                  label={t("live.lThrottle")}
                  value={tel?.throttle ?? 0}
                  color="bg-success"
                />
                <div className="flex-1 flex flex-col justify-end gap-1">
                  <Mini
                    label={t("live.lSteering")}
                    value={pct(tel?.steering ?? 0, true)}
                  />
                  <Mini
                    label={t("live.lClutch")}
                    value={pct(tel?.clutch ?? 0)}
                  />
                </div>
              </div>
            </Panel>

            <Panel title={t("live.pFuel")}>
              {tel && (
                <div className="flex items-center gap-5">
                  <Fuel className="h-9 w-9 text-primary shrink-0" />
                  <div className="grid grid-cols-3 gap-4 flex-1">
                    <KV
                      label={t("live.lTank")}
                      v={`${tel.fuel.toFixed(1)} L`}
                      big
                    />
                    <KV
                      label={t("live.lConsumption")}
                      v={
                        tel.fuel_consumption > 0
                          ? `${tel.fuel_consumption.toFixed(2)} L`
                          : "—"
                      }
                    />
                    <KV
                      label={t("live.lLapsRemaining")}
                      v={
                        tel.fuel_laps_remaining > 0
                          ? `~${Math.floor(tel.fuel_laps_remaining)}`
                          : "—"
                      }
                    />
                  </div>
                </div>
              )}
            </Panel>

            <Panel title={t("live.pEngine")}>
              {tel && (
                <div className="grid grid-cols-3 gap-3">
                  <KV
                    label={t("live.lWater")}
                    v={`${tel.water_temp.toFixed(0)}°C`}
                  />
                  <KV
                    label={t("live.lOil")}
                    v={`${tel.oil_temp.toFixed(0)}°C`}
                  />
                  <KV
                    label={t("live.lTorque")}
                    v={`${Math.round(tel.engine_torque)} Nm`}
                  />
                  <KV
                    label={t("live.lTurbo")}
                    v={`${(tel.turbo_boost / 1000).toFixed(0)} kPa`}
                  />
                  <KV
                    label={t("live.lBrakeBias")}
                    v={`${(tel.rear_brake_bias * 100).toFixed(0)}%`}
                  />
                  <KV
                    label={t("live.lTcAbs")}
                    v={ext ? `${ext.tc} / ${ext.abs}` : "—"}
                  />
                  <KV
                    label={t("live.lFrontTyres")}
                    v={tel.front_compound || "—"}
                  />
                  <KV
                    label={t("live.lRearTyres")}
                    v={tel.rear_compound || "—"}
                  />
                  <KV
                    label={t("live.lPitLimit")}
                    v={
                      ext && ext.pit_speed_limit > 0
                        ? `${Math.round(ext.pit_speed_limit * 3.6)} km/h`
                        : "—"
                    }
                  />
                </div>
              )}
              {tel && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <Tag on={tel.speed_limiter} label={t("live.tagLimiter")} />
                  <Tag on={tel.headlights} label={t("live.tagLights")} />
                  <Tag
                    on={tel.overheating}
                    label={t("live.tagOverheat")}
                    warn
                  />
                  <Tag on={tel.anti_stall} label={t("live.tagAntiStall")} />
                  <Tag on={tel.front_flap} label={t("live.tagFrontFlap")} />
                  <Tag on={tel.rear_flap} label={t("live.tagDrs")} />
                </div>
              )}
            </Panel>
          </div>

          {/* Colonne centrale — chrono + pneus */}
          <div className="flex flex-col gap-4">
            <Panel title={t("live.pTiming")}>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t("live.lLastLap")}
                  </div>
                  <div className="font-mono text-3xl font-bold tabular-nums">
                    {fmtLap(player?.last_lap_time ?? 0)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t("live.lBestLap")}
                  </div>
                  <div className="font-mono text-3xl font-bold tabular-nums text-primary">
                    {fmtLap(player?.best_lap_time ?? 0)}
                  </div>
                </div>
              </div>
              {delta !== 0 && (
                <div
                  className={cn(
                    "text-center font-mono text-2xl font-bold mt-1",
                    delta < 0 ? "text-success" : "text-destructive"
                  )}
                >
                  {delta < 0 ? "▼" : "▲"} {Math.abs(delta).toFixed(3)} s
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 mt-2">
                {[0, 1, 2].map((i) => {
                  const last = player?.last_sectors[i] ?? 0;
                  const best = player?.best_sectors[i] ?? 0;
                  const isBest = last > 0 && best > 0 && last <= best + 0.001;
                  return (
                    <div
                      key={i}
                      className="rounded-md bg-card border border-border px-2 py-1.5 text-center"
                    >
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        S{i + 1}
                      </div>
                      <div
                        className={cn(
                          "font-mono text-lg font-bold tabular-nums",
                          isBest && "text-purple"
                        )}
                      >
                        {fmtSec(last)}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {t("live.best")} {fmtSec(best)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel title={t("live.pTyres")}>
              {tel && (
                <div className="grid grid-cols-2 gap-3">
                  <TireBox label={t("live.tireFL")} w={tel.wheels[0]} />
                  <TireBox label={t("live.tireFR")} w={tel.wheels[1]} />
                  <TireBox label={t("live.tireRL")} w={tel.wheels[2]} />
                  <TireBox label={t("live.tireRR")} w={tel.wheels[3]} />
                </div>
              )}
            </Panel>

            <Panel title={t("live.pDamage")}>
              {tel && (
                <div className="grid grid-cols-3 gap-3">
                  <KV
                    label={t("live.lDamage")}
                    v={`${tel.damage_total.toFixed(0)}%`}
                    danger={tel.damage_total > 20}
                  />
                  <KV
                    label={t("live.lMaxImpact")}
                    v={
                      ext && ext.damage_max_impact > 0
                        ? ext.damage_max_impact.toFixed(0)
                        : "—"
                    }
                  />
                  <KV
                    label={t("live.lAccumImpact")}
                    v={
                      ext && ext.damage_accum_impact > 0
                        ? ext.damage_accum_impact.toFixed(0)
                        : "—"
                    }
                  />
                  <KV
                    label={t("live.lStops")}
                    v={String(player?.num_pitstops ?? 0)}
                  />
                  <KV
                    label={t("live.lPenalties")}
                    v={String(player?.num_penalties ?? 0)}
                    danger={(player?.num_penalties ?? 0) > 0}
                  />
                  <KV
                    label={t("live.lGForces")}
                    v={`${tel.g_long.toFixed(1)} / ${tel.g_lat.toFixed(1)}`}
                  />
                </div>
              )}
              {ext?.status_message && (
                <p className="text-xs text-muted-foreground mt-2 truncate">
                  {ext.status_message}
                </p>
              )}
            </Panel>
          </div>
        </div>
      )}

      {/* Onglet Carte 2D — plein écran */}
      {tab === "map" && (
        <div className="flex-1 min-h-0 p-4">
          <div className="h-full rounded-lg border border-border bg-card/40 p-3">
            <TrackMap data={data} />
          </div>
        </div>
      )}

      {/* Onglet Classement */}
      {tab === "standings" && (
        <div className="flex-1 p-4">
          <Panel
            title={`${t("live.tabStandings")} (${data.standings.length})`}
          >
            <StandingsTable standings={data.standings} />
          </Panel>
        </div>
      )}
    </div>
  );
}

// ── Onglet Vue d'ensemble (style V2) ─────────────────────────────────────────

/**
 * Tableau de bord « plein-écran » repris de la V2 : grand chrono central
 * (dernier tour + delta + meilleur tour), tuiles SPD / GEA / RPM, et bandeau
 * inférieur Carburant + Écarts + 4 pneus. Pensé pour être lisible à distance.
 */
function OverviewView({ data }: { data: LiveData }) {
  const { t } = useTranslation();
  const tel = data.telemetry;
  const player = data.player;
  const standings = data.standings;

  const last = player?.last_lap_time ?? 0;
  const best = player?.best_lap_time ?? 0;
  const delta = player?.lap_delta ?? 0;

  // Écarts : déduits du classement (le V3 ne fournit pas gap_ahead direct).
  // `time_behind_next` sur la ligne du joueur = écart au pilote devant.
  // L'écart au pilote derrière = `time_behind_next` du pilote en position+1.
  const playerStanding = standings.find((s) => s.is_player);
  const gapAhead = playerStanding?.time_behind_next ?? 0;
  const gapBehind =
    playerStanding != null
      ? (standings.find((s) => s.position === playerStanding.position + 1)
          ?.time_behind_next ?? 0)
      : 0;

  // Tours restants estimés (carburant restant / conso au tour).
  const fuelLaps =
    tel && tel.fuel_laps_remaining > 0 ? Math.floor(tel.fuel_laps_remaining) : 0;

  return (
    <div className="flex-1 flex flex-col">
      {/* Centre — grand chrono */}
      <div className="flex-1 flex items-center justify-center px-10 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 w-full max-w-6xl">
          {/* Tour en cours + dernier tour + delta + meilleur tour */}
          <div className="flex flex-col items-center justify-center text-center">
            <span className="text-sm uppercase tracking-[0.3em] text-muted-foreground mb-2">
              {t("live.lCurrentLap")}
            </span>
            <span
              className={cn(
                "font-mono text-6xl font-bold tracking-tighter tabular-nums",
                (player?.current_lap_time ?? 0) > 0
                  ? "text-primary"
                  : "text-muted-foreground/40"
              )}
            >
              {fmtLap(player?.current_lap_time ?? 0)}
            </span>

            <span className="mt-8 text-sm uppercase tracking-[0.3em] text-muted-foreground mb-2">
              {t("live.lLastLap")}
            </span>
            <span className="font-mono text-8xl font-bold tracking-tighter tabular-nums">
              {fmtLap(last)}
            </span>
            <span
              className={cn(
                "mt-2 font-mono text-3xl font-bold",
                delta < 0 ? "text-success" : "text-destructive"
              )}
            >
              {delta !== 0 && last > 0 ? (
                <>
                  {delta < 0 ? "▼" : "▲"} {Math.abs(delta).toFixed(3)}
                </>
              ) : null}
            </span>

            <div className="mt-12 flex flex-col items-center">
              <span className="text-sm uppercase tracking-[0.3em] text-muted-foreground mb-2">
                {t("live.lBestLap")}
              </span>
              <span className="font-mono text-5xl font-bold tracking-tight tabular-nums text-primary">
                {fmtLap(best)}
              </span>
            </div>
          </div>

          {/* SPD / GEA / RPM */}
          <div className="flex flex-col justify-center gap-5">
            <div className="flex items-center justify-between gap-6 px-5 py-3 rounded-lg bg-card border border-border">
              <div className="flex items-center gap-4">
                <span className="font-mono text-3xl font-bold text-muted-foreground w-12">
                  SPD
                </span>
                <span className="h-3 w-3 rounded-full bg-success" />
              </div>
              <span className="font-mono text-4xl font-bold tabular-nums">
                {tel ? tel.speed_kmh.toFixed(0) : "———"}{" "}
                <span className="text-lg text-muted-foreground">km/h</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-6 px-5 py-3 rounded-lg bg-card border border-border">
              <div className="flex items-center gap-4">
                <span className="font-mono text-3xl font-bold text-muted-foreground w-12">
                  GEA
                </span>
                <span className="h-3 w-3 rounded-full bg-primary" />
              </div>
              <span className="font-mono text-4xl font-bold tabular-nums">
                {tel
                  ? tel.gear === 0
                    ? "N"
                    : tel.gear === -1
                      ? "R"
                      : `${tel.gear}`
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-6 px-5 py-3 rounded-lg bg-card border border-border">
              <div className="flex items-center gap-4">
                <span className="font-mono text-3xl font-bold text-muted-foreground w-12">
                  RPM
                </span>
                <span
                  className={cn(
                    "h-3 w-3 rounded-full",
                    tel && tel.max_rpm > 0 && tel.rpm / tel.max_rpm > 0.95
                      ? "bg-destructive"
                      : tel && tel.max_rpm > 0 && tel.rpm / tel.max_rpm > 0.8
                        ? "bg-yellow-500"
                        : "bg-success"
                  )}
                />
              </div>
              <span className="font-mono text-4xl font-bold tabular-nums">
                {tel ? tel.rpm.toFixed(0) : "————"}{" "}
                <span className="text-lg text-muted-foreground">
                  / {tel ? tel.max_rpm.toFixed(0) : "———"}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bandeau inférieur — carburant + écarts + pneus */}
      <div className="border-t border-border px-10 py-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Carburant */}
        <div className="flex items-center gap-5">
          <Fuel className="h-9 w-9 text-primary" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("live.fuel")}
            </span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-4xl font-bold tabular-nums">
                {tel ? tel.fuel.toFixed(1) : "——.—"}
              </span>
              <span className="font-mono text-lg text-muted-foreground">L</span>
              {fuelLaps > 0 && (
                <span className="ml-3 font-mono text-base text-muted-foreground">
                  → ~{fuelLaps} {t("live.laps")}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Écarts devant / derrière */}
        <div className="flex items-center justify-center gap-8">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("live.ahead")}
            </span>
            <span
              className={cn(
                "font-mono text-3xl font-bold tabular-nums",
                gapAhead > 0 ? "text-success" : "text-muted-foreground"
              )}
            >
              {gapAhead > 0 ? `-${gapAhead.toFixed(3)}` : "—.———"}
            </span>
          </div>
          <div className="h-12 w-px bg-border" />
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("live.behind")}
            </span>
            <span className="font-mono text-3xl font-bold tabular-nums text-muted-foreground">
              {gapBehind > 0 ? `+${gapBehind.toFixed(3)}` : "—.———"}
            </span>
          </div>
        </div>

        {/* 4 pneus */}
        <div className="grid grid-cols-2 gap-3">
          <TireMini pos="FL" w={tel?.wheels[0]} />
          <TireMini pos="FR" w={tel?.wheels[1]} />
          <TireMini pos="RL" w={tel?.wheels[2]} />
          <TireMini pos="RR" w={tel?.wheels[3]} />
        </div>
      </div>
    </div>
  );
}

/** Pneu compact pour la vue d'ensemble : température + usure. */
function TireMini({ pos, w }: { pos: string; w?: LiveWheel }) {
  const temp = w?.temp ?? 0;
  const wear = w?.wear ?? 0;
  return (
    <div className="flex flex-col gap-0.5 px-3 py-1.5 rounded-md bg-card border border-border">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {pos}
      </span>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-mono text-xl font-bold tabular-nums",
            temp > 0 ? tempColor(temp) : ""
          )}
        >
          {temp > 0 ? `${temp.toFixed(0)}°` : "——°"}
        </span>
        <span
          className={cn(
            "font-mono text-sm tabular-nums",
            wear > 0 ? wearColor(wear) : ""
          )}
        >
          {wear > 0 ? `${Math.round(wear)}%` : "——%"}
        </span>
      </div>
    </div>
  );
}

// ── Sous-composants ──────────────────────────────────────────────────────────

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-4xl font-bold leading-none tabular-nums">
        {children}
      </span>
    </div>
  );
}

/**
 * Indicateur d'arrêt au stand affiché à côté du compteur de tours :
 *  - Badge animé quand le pilote est dans la voie des stands (entrée/stand/sortie).
 *  - Compteur d'arrêts effectués (×N) toujours visible si > 0.
 *
 * Valeurs `pit_state` (rF2) :
 *  0 = aucun · 1 = demandé · 2 = entrée pit lane · 3 = à l'arrêt
 *  4 = sortie pit lane.
 */
function PitIndicator({
  pitState,
  numPitstops,
}: {
  pitState: number;
  numPitstops: number;
}) {
  const { t } = useTranslation();

  // Configuration visuelle par état (libellé + couleur + pulsation).
  const live = (() => {
    switch (pitState) {
      case 1:
        return {
          label: t("live.pitRequest"),
          cls: "bg-yellow-500/15 text-yellow-500",
          pulse: false,
        };
      case 2:
        return {
          label: t("live.pitIn"),
          cls: "bg-primary/25 text-yellow-300",
          pulse: true,
        };
      case 3:
        return {
          label: t("live.pitStop"),
          cls: "bg-destructive/25 text-destructive",
          pulse: true,
        };
      case 4:
        return {
          label: t("live.pitOut"),
          cls: "bg-success/20 text-success",
          pulse: true,
        };
      default:
        return null;
    }
  })();

  if (!live && numPitstops <= 0) return null;

  return (
    <span className="inline-flex items-center gap-1.5 ml-2 align-middle">
      {live && (
        <span
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold tracking-widest text-[10px]",
            live.cls,
            live.pulse && "animate-pulse"
          )}
          title={live.label}
        >
          {live.label}
        </span>
      )}
      {numPitstops > 0 && (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-bold tabular-nums"
          title={t("live.pitstopsTotal", { count: numPitstops })}
        >
          ×{numPitstops}
        </span>
      )}
    </span>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/40">
      <div className="px-3 py-1.5 border-b border-border/60 text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        <GaugeIcon className="h-3 w-3" />
        {title}
      </div>
      <div className="p-3 flex flex-col gap-2">{children}</div>
    </div>
  );
}

function RpmBar({ rpm, maxRpm }: { rpm: number; maxRpm: number }) {
  const r = maxRpm > 0 ? Math.min(rpm / maxRpm, 1) : 0;
  return (
    <div className="h-2.5 rounded-full bg-muted overflow-hidden">
      <div
        className={cn(
          "h-full transition-all",
          r > 0.95 ? "bg-destructive" : r > 0.8 ? "bg-yellow-500" : "bg-success"
        )}
        style={{ width: `${r * 100}%` }}
      />
    </div>
  );
}

function PedalBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 w-14">
      <div className="h-20 w-7 rounded bg-muted overflow-hidden flex flex-col-reverse">
        <div
          className={cn("w-full transition-all", color)}
          style={{ height: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="font-mono text-xs font-bold">
        {Math.round(Math.max(0, Math.min(1, value)) * 100)}%
      </span>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded bg-card border border-border px-2 py-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="font-mono text-xs font-bold">{value}</span>
    </div>
  );
}

function KV({
  label,
  v,
  big,
  danger,
}: {
  label: string;
  v: string;
  big?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "font-mono font-bold tabular-nums",
          big ? "text-xl" : "text-sm",
          danger && "text-destructive"
        )}
      >
        {v}
      </span>
    </div>
  );
}

function Tag({
  on,
  label,
  warn,
}: {
  on: boolean;
  label: string;
  warn?: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium border",
        on
          ? warn
            ? "bg-destructive/20 text-destructive border-destructive/40"
            : "bg-success/15 text-success border-success/30"
          : "bg-muted text-muted-foreground border-border"
      )}
    >
      {label}
    </span>
  );
}

function FlagPill({ flag }: { flag: FlagKind }) {
  const { t } = useTranslation();
  const cfg: Record<FlagKind, { label: string; cls: string }> = {
    green: { label: t("live.flagGreen"), cls: "bg-success/20 text-success" },
    yellow: {
      label: t("live.flagYellow"),
      cls: "bg-yellow-500/20 text-yellow-500 animate-pulse",
    },
    fcy: {
      label: t("live.flagFcy"),
      cls: "bg-yellow-500/30 text-yellow-500 animate-pulse",
    },
    stopped: {
      label: t("live.flagStopped"),
      cls: "bg-destructive/20 text-destructive",
    },
    over: { label: t("live.flagOver"), cls: "bg-muted text-muted-foreground" },
    none: { label: "—", cls: "bg-muted text-muted-foreground" },
  };
  const c = cfg[flag];
  return (
    <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-md", c.cls)}>
      <Flag className="h-4 w-4" />
      <span className="font-mono text-xs font-bold tracking-widest">
        {c.label}
      </span>
    </div>
  );
}

function tempColor(t: number): string {
  if (t <= 0) return "text-muted-foreground";
  if (t > 110) return "text-destructive";
  if (t > 95) return "text-yellow-500";
  if (t < 70) return "text-sky-400";
  return "text-success";
}
function wearColor(w: number): string {
  if (w < 30) return "text-destructive";
  if (w < 60) return "text-yellow-500";
  return "text-foreground";
}

function TireBox({ label, w }: { label: string; w: LiveWheel }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md bg-card border border-border p-2 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {(w.flat || w.detached) && (
          <AlertTriangle className="h-3 w-3 text-destructive" />
        )}
      </div>
      <div className="flex items-baseline justify-between">
        <span className={cn("font-mono text-xl font-bold", tempColor(w.temp))}>
          {w.temp > 0 ? `${w.temp.toFixed(0)}°` : "—"}
        </span>
        <span className={cn("font-mono text-sm font-bold", wearColor(w.wear))}>
          {w.wear.toFixed(0)}%
        </span>
      </div>
      <div className="flex gap-0.5">
        {w.temp3.map((temp, i) => (
          <div
            key={i}
            className={cn(
              "flex-1 h-1.5 rounded-sm",
              temp > 110
                ? "bg-destructive"
                : temp > 95
                  ? "bg-yellow-500"
                  : temp < 70
                    ? "bg-sky-400"
                    : "bg-success"
            )}
            title={`${temp.toFixed(0)}°C`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
        <span>{w.pressure.toFixed(0)} kPa</span>
        <span>
          {t("live.tireBrake")}{" "}
          {w.brake_temp >= 0 ? `${w.brake_temp.toFixed(0)}°` : "—"}
        </span>
      </div>
    </div>
  );
}

// ── Carte 2D du circuit ──────────────────────────────────────────────────────

function TrackMap({ data }: { data: LiveData }) {
  const { t } = useTranslation();
  const pts = data.track_points;
  if (pts.length < 8) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-1 text-muted-foreground">
        <p className="text-sm">{t("live.mapAcquiring")}</p>
        <p className="text-xs">{t("live.mapPersist")}</p>
      </div>
    );
  }

  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[1]);
    maxZ = Math.max(maxZ, p[1]);
  }
  for (const s of data.standings) {
    if (s.pos_x === 0 && s.pos_z === 0) continue;
    minX = Math.min(minX, s.pos_x);
    maxX = Math.max(maxX, s.pos_x);
    minZ = Math.min(minZ, s.pos_z);
    maxZ = Math.max(maxZ, s.pos_z);
  }
  const w = maxX - minX || 1;
  const h = maxZ - minZ || 1;
  const pad = 0.08;
  const mapX = (x: number) =>
    ((x - minX) / w) * (1 - 2 * pad) * 1000 + pad * 1000;
  const mapY = (z: number) =>
    (1 - (z - minZ) / h) * (1 - 2 * pad) * 1000 + pad * 1000;

  const path = pts
    .map((p) => `${mapX(p[0]).toFixed(1)},${mapY(p[1]).toFixed(1)}`)
    .join(" ");

  return (
    <div className="w-full h-full flex items-center justify-center">
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
      >
        <polygon
          points={path}
          fill="none"
          stroke="#1c2533"
          strokeWidth={30}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polygon
          points={path}
          fill="none"
          stroke="#46597a"
          strokeWidth={3}
          strokeDasharray="3 14"
          strokeLinejoin="round"
        />
        {data.standings.map((s) => {
          if (s.pos_x === 0 && s.pos_z === 0) return null;
          return (
            <g key={s.position}>
              <circle
                cx={mapX(s.pos_x)}
                cy={mapY(s.pos_z)}
                r={s.is_player ? 20 : 13}
                fill={
                  s.is_player ? "#FFB400" : s.in_pits ? "#6b7280" : "#60a5fa"
                }
                stroke="#0A0E1A"
                strokeWidth={3}
              >
                <title>
                  P{s.position} {s.driver}
                </title>
              </circle>
              <text
                x={mapX(s.pos_x)}
                y={mapY(s.pos_z) + (s.is_player ? 7 : 5)}
                textAnchor="middle"
                fontSize={s.is_player ? 22 : 15}
                fontWeight="bold"
                fill="#0A0E1A"
              >
                {s.position}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Classement ───────────────────────────────────────────────────────────────

function StandingsTable({ standings }: { standings: LiveStanding[] }) {
  const { t } = useTranslation();
  const sectorOf = (s: LiveStanding, i: number) =>
    i === 0 ? s.last_s1 : i === 1 ? s.last_s2 : s.last_s3;
  const sectorBest = (s: LiveStanding, i: number) =>
    i === 0
      ? s.is_class_best_s1
      : i === 1
        ? s.is_class_best_s2
        : s.is_class_best_s3;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
            <th className="text-center px-2 py-1">{t("live.stPos")}</th>
            <th className="text-center px-1 py-1">{t("live.stCls")}</th>
            <th className="text-left px-2 py-1">{t("live.stDriver")}</th>
            <th className="text-left px-2 py-1">{t("live.stCar")}</th>
            <th className="text-left px-2 py-1">{t("live.stClass")}</th>
            <th className="text-right px-2 py-1">{t("live.stLast")}</th>
            <th className="text-right px-2 py-1">{t("live.stBest")}</th>
            <th className="text-right px-1.5 py-1">S1</th>
            <th className="text-right px-1.5 py-1">S2</th>
            <th className="text-right px-1.5 py-1">S3</th>
            <th className="text-right px-2 py-1">{t("live.stGap")}</th>
            <th className="text-center px-1.5 py-1">{t("live.stStops")}</th>
            <th className="text-center px-1.5 py-1">{t("live.stPen")}</th>
            <th className="text-left px-2 py-1">{t("live.stState")}</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr
              key={s.position}
              className={cn(
                "border-b border-border/40",
                s.is_player && "bg-primary/10",
                s.in_pits && "opacity-60"
              )}
            >
              <td className="text-center px-2 py-1 font-bold">{s.position}</td>
              <td className="text-center px-1 py-1 text-muted-foreground">
                {s.class_position}
              </td>
              <td
                className={cn(
                  "px-2 py-1 font-medium whitespace-nowrap",
                  s.is_player && "text-primary"
                )}
              >
                {s.driver}
              </td>
              <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">
                {s.vehicle_name}
              </td>
              <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">
                {s.vehicle_class}
              </td>
              <td className="text-right px-2 py-1 font-mono">
                {fmtLap(s.last_lap_time)}
              </td>
              <td
                className={cn(
                  "text-right px-2 py-1 font-mono",
                  s.is_class_best_lap && "text-purple font-semibold"
                )}
              >
                {fmtLap(s.best_lap_time)}
              </td>
              {[0, 1, 2].map((i) => (
                <td
                  key={i}
                  className={cn(
                    "text-right px-1.5 py-1 font-mono",
                    sectorBest(s, i) && "text-purple font-semibold"
                  )}
                >
                  {fmtSec(sectorOf(s, i))}
                </td>
              ))}
              <td className="text-right px-2 py-1 font-mono">
                {s.position === 1
                  ? "—"
                  : fmtGap(s.time_behind_leader, s.laps_behind_leader, t)}
              </td>
              <td className="text-center px-1.5 py-1">{s.num_pitstops}</td>
              <td
                className={cn(
                  "text-center px-1.5 py-1",
                  s.num_penalties > 0 && "text-destructive font-bold"
                )}
              >
                {s.num_penalties}
              </td>
              <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">
                {s.in_pits
                  ? t("live.statePit")
                  : s.finish_status === 2
                    ? "DNF"
                    : s.finish_status === 3
                      ? "DQ"
                      : s.finish_status === 1
                        ? t("live.stateFinished")
                        : t("live.stateRunning")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
