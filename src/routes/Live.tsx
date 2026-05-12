import { useEffect, useState } from "react";
import { Link } from "react-router";
import { cn, formatLapTime } from "@/lib/utils";
import { ArrowLeft, Flag, Fuel, Cloud, Thermometer, Maximize } from "lucide-react";

export function Live() {
  const [lap, setLap] = useState(14);
  const [s1, setS1] = useState(68_234);
  const [s2, setS2] = useState(72_123);
  const [s3, setS3] = useState<number | null>(null);
  const [lastLap, setLastLap] = useState(204_789);
  const [bestLap, setBestLap] = useState(204_555);
  const [fuel, setFuel] = useState(42.3);
  const [gapAhead, setGapAhead] = useState(-0.342);
  const [gapBehind, setGapBehind] = useState(1.234);
  const [tireFL, setTireFL] = useState({ temp: 92, wear: 87 });
  const [tireFR, setTireFR] = useState({ temp: 94, wear: 86 });
  const [tireRL, setTireRL] = useState({ temp: 89, wear: 91 });
  const [tireRR, setTireRR] = useState({ temp: 91, wear: 89 });
  const [trackTemp, setTrackTemp] = useState(28);
  const [airTemp, setAirTemp] = useState(22);
  const [flag, setFlag] = useState<"green" | "yellow" | "sc" | "fcy">("green");

  // Animate values for a "live" feel
  useEffect(() => {
    const id = setInterval(() => {
      const drift = (n: number, range: number) => n + (Math.random() - 0.5) * range;
      setS1((v) => Math.max(67_500, Math.min(69_500, drift(v, 80))));
      setS2((v) => Math.max(71_500, Math.min(73_500, drift(v, 80))));
      setFuel((v) => Math.max(0, v - 0.012));
      setGapAhead((v) => drift(v, 0.05));
      setGapBehind((v) => drift(v, 0.05));
      setTireFL((t) => ({ temp: Math.round(drift(t.temp, 0.6)), wear: Math.max(0, t.wear - 0.005) }));
      setTireFR((t) => ({ temp: Math.round(drift(t.temp, 0.6)), wear: Math.max(0, t.wear - 0.005) }));
      setTireRL((t) => ({ temp: Math.round(drift(t.temp, 0.6)), wear: Math.max(0, t.wear - 0.005) }));
      setTireRR((t) => ({ temp: Math.round(drift(t.temp, 0.6)), wear: Math.max(0, t.wear - 0.005) }));
    }, 200);
    return () => clearInterval(id);
  }, []);

  // Simulate full lap progress every ~12s for demo
  useEffect(() => {
    const id = setInterval(() => {
      const newS3 = 64_000 + Math.random() * 1500;
      const total = Math.round(s1 + s2 + newS3);
      setS3(Math.round(newS3));
      setTimeout(() => {
        setLastLap(total);
        if (total < bestLap) setBestLap(total);
        setLap((l) => l + 1);
        setS1(Math.round(67_500 + Math.random() * 1500));
        setS2(Math.round(71_500 + Math.random() * 1500));
        setS3(null);
      }, 1500);
    }, 12_000);
    return () => clearInterval(id);
  }, [s1, s2, bestLap]);

  // Random flag changes for demo
  useEffect(() => {
    const id = setInterval(() => {
      const flags: Array<typeof flag> = ["green", "green", "green", "yellow", "sc", "fcy"];
      setFlag(flags[Math.floor(Math.random() * flags.length)]);
      setTrackTemp((t) => Math.round(t + (Math.random() - 0.5) * 0.6));
      setAirTemp((t) => Math.round(t + (Math.random() - 0.5) * 0.4));
    }, 4500);
    return () => clearInterval(id);
  }, []);

  const delta = lastLap - bestLap;
  const fuelLaps = Math.floor((fuel / 2.6)); // approx

  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground select-none">
      {/* Top strip — position / lap / flag / weather */}
      <div className="flex items-center justify-between px-10 py-6 border-b border-border">
        <div className="flex items-center gap-12">
          <div className="flex items-baseline gap-3">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Position</span>
            <span className="font-mono text-6xl font-bold text-primary tracking-tight leading-none">P3</span>
            <span className="font-mono text-2xl text-muted-foreground">/23</span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Lap</span>
            <span className="font-mono text-6xl font-bold tracking-tight leading-none">{lap}</span>
            <span className="font-mono text-2xl text-muted-foreground">/42</span>
          </div>
        </div>

        <div className="flex items-center gap-10">
          <FlagPill flag={flag} />
          <div className="flex items-center gap-3">
            <Cloud className="h-6 w-6 text-muted-foreground" />
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Air</span>
              <span className="font-mono text-2xl font-bold">{airTemp}°C</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Thermometer className="h-6 w-6 text-primary" />
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Track</span>
              <span className="font-mono text-2xl font-bold">{trackTemp}°C</span>
            </div>
          </div>
          <Link
            to="/"
            className="ml-4 flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Quitter Live
          </Link>
        </div>
      </div>

      {/* Center — giant chrono */}
      <div className="flex-1 flex items-center justify-center px-10 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 w-full max-w-6xl">
          {/* Lap times */}
          <div className="flex flex-col items-center justify-center text-center">
            <span className="text-sm uppercase tracking-[0.3em] text-muted-foreground mb-2">Last lap</span>
            <span className="font-mono text-8xl font-bold tracking-tighter tabular-nums">{formatLapTime(lastLap)}</span>
            <span className={cn("mt-2 font-mono text-3xl font-bold", delta < 0 ? "text-success" : "text-destructive")}>
              {delta < 0 ? "▼" : "▲"} {(Math.abs(delta) / 1000).toFixed(3)}
            </span>

            <div className="mt-12 flex flex-col items-center">
              <span className="text-sm uppercase tracking-[0.3em] text-muted-foreground mb-2">Best lap</span>
              <span className="font-mono text-5xl font-bold tracking-tight tabular-nums text-primary">{formatLapTime(bestLap)}</span>
            </div>
          </div>

          {/* Sectors */}
          <div className="flex flex-col justify-center gap-5">
            <SectorRow label="S1" valueMs={s1} status="done" color="green" />
            <SectorRow label="S2" valueMs={s2} status="done" color="purple" />
            <SectorRow label="S3" valueMs={s3} status={s3 ? "done" : "live"} color="green" />
          </div>
        </div>
      </div>

      {/* Bottom strip — fuel + gaps + tires */}
      <div className="border-t border-border px-10 py-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="flex items-center gap-5">
          <Fuel className="h-9 w-9 text-primary" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Fuel</span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-4xl font-bold tabular-nums">{fuel.toFixed(1)}</span>
              <span className="font-mono text-lg text-muted-foreground">L</span>
              <span className="ml-3 font-mono text-base text-muted-foreground">→ ~{fuelLaps} laps</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-8">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Devant</span>
            <span className={cn("font-mono text-3xl font-bold tabular-nums", gapAhead < 0 ? "text-success" : "text-muted-foreground")}>
              {gapAhead.toFixed(3)}
            </span>
          </div>
          <div className="h-12 w-px bg-border" />
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Derrière</span>
            <span className="font-mono text-3xl font-bold tabular-nums text-muted-foreground">
              +{gapBehind.toFixed(3)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <TireCard pos="FL" temp={tireFL.temp} wear={tireFL.wear} />
          <TireCard pos="FR" temp={tireFR.temp} wear={tireFR.wear} />
          <TireCard pos="RL" temp={tireRL.temp} wear={tireRL.wear} />
          <TireCard pos="RR" temp={tireRR.temp} wear={tireRR.wear} />
        </div>
      </div>

      {/* Fullscreen hint */}
      <button
        onClick={() => document.documentElement.requestFullscreen?.()}
        className="fixed bottom-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
      >
        <Maximize className="h-3 w-3" /> Plein écran
      </button>
    </div>
  );
}

function FlagPill({ flag }: { flag: "green" | "yellow" | "sc" | "fcy" }) {
  const cfg = {
    green: { label: "GREEN", color: "bg-success/20 text-success" },
    yellow: { label: "YELLOW S2", color: "bg-[var(--color-tier-alien)]/20 text-[var(--color-tier-alien)] animate-pulse" },
    sc: { label: "SAFETY CAR", color: "bg-[var(--color-tier-alien)]/30 text-[var(--color-tier-alien)] animate-pulse" },
    fcy: { label: "FCY", color: "bg-destructive/20 text-destructive animate-pulse" },
  }[flag];
  return (
    <div className={cn("flex items-center gap-2 px-4 py-2 rounded-md", cfg.color)}>
      <Flag className="h-5 w-5" />
      <span className="font-mono text-sm font-bold tracking-widest">{cfg.label}</span>
    </div>
  );
}

function SectorRow({
  label,
  valueMs,
  status,
  color,
}: {
  label: string;
  valueMs: number | null;
  status: "done" | "live";
  color: "green" | "purple";
}) {
  const dotColor = color === "purple" ? "bg-purple" : "bg-success";
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-3 rounded-lg bg-card border border-border">
      <div className="flex items-center gap-4">
        <span className="font-mono text-3xl font-bold text-muted-foreground w-12">{label}</span>
        {status === "done" && valueMs ? (
          <span className={cn("h-3 w-3 rounded-full", dotColor)} />
        ) : (
          <span className="h-3 w-3 rounded-full bg-primary animate-pulse-glow" />
        )}
      </div>
      <span className="font-mono text-4xl font-bold tabular-nums">
        {valueMs ? (valueMs / 1000).toFixed(3) : "──.───"}
      </span>
    </div>
  );
}

function TireCard({ pos, temp, wear }: { pos: string; temp: number; wear: number }) {
  const tempColor = temp > 100 ? "text-destructive" : temp > 95 ? "text-[var(--color-tier-alien)]" : temp < 80 ? "text-[var(--color-tier-amateur)]" : "text-success";
  const wearColor = wear < 30 ? "text-destructive" : wear < 60 ? "text-[var(--color-tier-alien)]" : "text-foreground";
  return (
    <div className="flex flex-col gap-0.5 px-3 py-1.5 rounded-md bg-card border border-border">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{pos}</span>
      <div className="flex items-baseline gap-2">
        <span className={cn("font-mono text-xl font-bold tabular-nums", tempColor)}>{temp}°</span>
        <span className={cn("font-mono text-sm tabular-nums", wearColor)}>{Math.round(wear)}%</span>
      </div>
    </div>
  );
}
