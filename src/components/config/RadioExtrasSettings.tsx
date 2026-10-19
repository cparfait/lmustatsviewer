/**
 * Réglages de la passe « annonces de course » (Configuration › Voix et
 * Maintenance) : préréglages de radio, familles d'annonces, pressions,
 * cohabitation, spotter fin, son (sortie audio, son du jeu baissé), boutons du
 * volant par action, captures brutes et rapport de bug.
 *
 * Mêmes briques visuelles que `ConfigV2.tsx` (lignes encadrées, sections
 * repliables) pour rester homogène avec le reste de la page.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertTriangle,
  ChevronDown,
  CircleDot,
  Disc3,
  Eraser,
  FileArchive,
  Gamepad2,
  Gauge,
  Headphones,
  Layers,
  Loader2,
  Play,
  Radio,
  Square,
  Users,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app";
import { appLog, gameAudio, isTauri, live, type DuckStatus, type ShmStatus, type WheelBinding } from "@/lib/api";
import { listOutputDevices } from "@/lib/useRadioAudio";
import { RADIO_EXTRAS, WHEEL_ACTIONS, type RadioPreset, type WheelAction } from "@/lib/radioSettings";
import { convertPressure, type PressureUnit } from "@/lib/engineer/pressures";
import type { LockAlertMode } from "@/lib/engineer/tyreEvents";
import { DEFAULT_SPOTTER, sanitizeTuning } from "@/lib/engineer/proximity";
import { toast, toastError, toastSuccess } from "@/stores/dialogs";

// ── Briques visuelles (identiques à ConfigV2) ────────────────────────────────

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-2 p-3 text-left"
      >
        <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-primary transition-transform", !open && "-rotate-90")} />
        <div className="min-w-0">
          <div className="font-semibold">{title}</div>
          {desc && <div className="text-xs text-muted-foreground">{desc}</div>}
        </div>
      </button>
      {open && <div className="space-y-2 px-3 pb-3">{children}</div>}
    </div>
  );
}

function Row({
  icon,
  label,
  desc,
  tip,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  desc?: string;
  tip?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <Tip content={tip ?? ""} side="right">
          <span className="mt-0.5 shrink-0 cursor-help text-primary">{icon}</span>
        </Tip>
        <div className="min-w-0 space-y-0.5">
          <div className="text-sm font-medium leading-tight">{label}</div>
          {desc && <div className="text-xs text-muted-foreground">{desc}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Toggle(props: {
  icon: React.ReactNode;
  label: string;
  desc?: string;
  tip?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Row icon={props.icon} label={props.label} desc={props.desc} tip={props.tip}>
      <Switch checked={props.checked} onCheckedChange={props.onChange} className="shrink-0" />
    </Row>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex shrink-0 overflow-hidden rounded-md border border-input">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "px-2.5 py-1 text-xs transition-colors",
            value === o.value ? "bg-primary text-primary-foreground" : "bg-transparent hover:bg-accent",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Voix › Annonces : préréglages, familles, pressions, cohabitation ────────

export function RadioPresetAndExtras() {
  const { t } = useTranslation();
  const preset = useAppStore((s) => s.radioPreset);
  const extras = useAppStore((s) => s.radioExtras);
  const coexist = useAppStore((s) => s.coexistMode);
  const unit = useAppStore((s) => s.pressureUnit);
  const lockMode = useAppStore((s) => s.lockAlertMode);
  const st = useAppStore.getState;
  return (
    <>
      <Section title={t("config.radioPresetTitle")} desc={t("config.radioPresetDesc")}>
        <Row icon={<Layers className="h-4 w-4" />} label={t("config.radioPreset")} tip={t("config.radioPresetTip")}>
          <Segmented<RadioPreset>
            value={preset}
            onChange={(p) => void st().applyRadioPreset(p)}
            options={(["custom", "sprint", "endurance", "online"] as const).map((p) => ({
              value: p,
              label: t(`config.radioPreset_${p}`),
            }))}
          />
        </Row>
      </Section>
      <Section title={t("config.radioExtrasTitle")} desc={t("config.radioExtrasDesc")}>
        {RADIO_EXTRAS.map((k) => (
          <Toggle
            key={k}
            icon={<Radio className="h-4 w-4" />}
            label={t(`config.extra_${k}`)}
            desc={t(`config.extra_${k}Desc`)}
            checked={extras[k]}
            onChange={(v) => void st().setRadioExtra(k, v)}
          />
        ))}
        {extras.tyreEvents && (
          <Row icon={<Disc3 className="h-4 w-4" />} label={t("config.lockAlert")} desc={t("config.lockAlertDesc")}>
            <Segmented<LockAlertMode>
              value={lockMode}
              onChange={(m) => void st().setLockAlertMode(m)}
              options={(["strict", "sensitive"] as const).map((m) => ({ value: m, label: t(`config.lockAlert_${m}`) }))}
            />
          </Row>
        )}
        <Row icon={<Gauge className="h-4 w-4" />} label={t("config.pressureUnit")} desc={t("config.pressureUnitDesc")}>
          <Segmented<PressureUnit>
            value={unit}
            onChange={(u) => void st().setPressureUnit(u)}
            options={(["kPa", "bar", "psi"] as const).map((u) => ({ value: u, label: u }))}
          />
        </Row>
        <PressureWindowsEditor />
        <Toggle
          icon={<Users className="h-4 w-4" />}
          label={t("config.coexistMode")}
          desc={t("config.coexistModeDesc")}
          tip={t("config.coexistModeTip")}
          checked={coexist}
          onChange={(v) => void st().setCoexistMode(v)}
        />
      </Section>
    </>
  );
}

/** Fenêtres de pression à chaud par classe (saisie dans l'unité choisie). */
function PressureWindowsEditor() {
  const { t } = useTranslation();
  const windows = useAppStore((s) => s.pressureWindows);
  const unit = useAppStore((s) => s.pressureUnit);
  const [cls, setCls] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const toKpa = (v: number) => (unit === "bar" ? v * 100 : unit === "psi" ? v / 0.145038 : v);
  const fmt = (kpa: number) => {
    const v = convertPressure(kpa, unit);
    return unit === "kPa" ? String(Math.round(v)) : v.toFixed(unit === "bar" ? 2 : 1);
  };
  const add = () => {
    const a = Number(min.replace(",", "."));
    const b = Number(max.replace(",", "."));
    if (!cls.trim() || !(a > 0) || !(b > a)) {
      toastError(t("config.pressureWindowInvalid"));
      return;
    }
    void useAppStore.getState().setPressureWindows({ ...windows, [cls.trim()]: { min: toKpa(a), max: toKpa(b) } });
    setCls("");
    setMin("");
    setMax("");
  };
  const remove = (k: string) => {
    const next = { ...windows };
    delete next[k];
    void useAppStore.getState().setPressureWindows(next);
  };
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="text-sm font-medium">{t("config.pressureWindows")}</div>
      <div className="text-xs text-muted-foreground">{t("config.pressureWindowsDesc")}</div>
      {Object.entries(windows).map(([k, w]) => (
        <div key={k} className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium">{k}</span>
          <span className="tabular-nums text-muted-foreground">
            {fmt(w.min)} – {fmt(w.max)} {unit}
          </span>
          <Button size="sm" variant="ghost" onClick={() => remove(k)} title={t("config.pressureWindowRemove")}>
            <Eraser className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        <Input className="h-8 w-28 text-xs" placeholder={t("config.pressureWindowClass")} value={cls} onChange={(e) => setCls(e.target.value)} />
        <Input className="h-8 w-20 text-xs" placeholder={t("config.pressureWindowMin")} value={min} onChange={(e) => setMin(e.target.value)} />
        <Input className="h-8 w-20 text-xs" placeholder={t("config.pressureWindowMax")} value={max} onChange={(e) => setMax(e.target.value)} />
        <Button size="sm" variant="outline" onClick={add}>
          {t("config.pressureWindowAdd")}
        </Button>
      </div>
    </div>
  );
}

// ── Voix › Annonces : spotter fin ────────────────────────────────────────────

export function SpotterTuningRows() {
  const { t } = useTranslation();
  const tuning = useAppStore((s) => s.spotterTuning);
  const set = (patch: Partial<typeof tuning>) => void useAppStore.getState().setSpotterTuning(sanitizeTuning({ ...tuning, ...patch }));
  const num = (key: keyof typeof tuning, step: number, label: string, desc: string) => (
    <Row icon={<CircleDot className="h-4 w-4" />} label={label} desc={desc}>
      <Input
        type="number"
        step={step}
        className="h-8 w-20 text-xs tabular-nums"
        value={tuning[key]}
        onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<typeof tuning>)}
      />
    </Row>
  );
  return (
    <div className="space-y-2">
      {num("carLength", 0.1, t("config.spotterCarLength"), t("config.spotterCarLengthDesc"))}
      {num("clearFrames", 1, t("config.spotterClearFrames"), t("config.spotterClearFramesDesc"))}
      {num("stillEveryS", 1, t("config.spotterStillEvery"), t("config.spotterStillEveryDesc"))}
      {num("minSpeedKmh", 5, t("config.spotterMinSpeed"), t("config.spotterMinSpeedDesc"))}
      <Button size="sm" variant="ghost" onClick={() => void useAppStore.getState().setSpotterTuning(DEFAULT_SPOTTER)}>
        {t("config.spotterTuningReset")}
      </Button>
    </div>
  );
}

// ── Voix › Son : sortie audio, son du jeu baissé ─────────────────────────────

export function RadioSoundRows() {
  const { t } = useTranslation();
  const device = useAppStore((s) => s.radioOutputDevice);
  const ducking = useAppStore((s) => s.gameDucking);
  const level = useAppStore((s) => s.gameDuckLevel);
  const [devices, setDevices] = useState<{ id: string; label: string }[]>([]);
  const [status, setStatus] = useState<DuckStatus | null>(null);
  useEffect(() => {
    void listOutputDevices().then(setDevices).catch(() => setDevices([]));
  }, []);
  useEffect(() => {
    if (!ducking || !isTauri()) return;
    void gameAudio.status().then(setStatus).catch(() => setStatus(null));
  }, [ducking]);
  const options = [
    { value: "", label: t("config.radioOutputDefault") },
    ...devices.map((d) => ({ value: d.label, label: d.label })),
    ...(device && !devices.some((d) => d.label === device) ? [{ value: device, label: `${device} (${t("config.radioOutputAbsent")})` }] : []),
  ];
  return (
    <div className="space-y-2">
      <Row icon={<Headphones className="h-4 w-4" />} label={t("config.radioOutput")} desc={t("config.radioOutputDesc")}>
        <Select
          value={device}
          onValueChange={(v) => void useAppStore.getState().setRadioOutputDevice(v)}
          options={options}
          className="h-8 w-56 text-xs"
        />
      </Row>
      <Toggle
        icon={<Volume2 className="h-4 w-4" />}
        label={t("config.gameDucking")}
        desc={t("config.gameDuckingDesc")}
        tip={t("config.gameDuckingTip")}
        checked={ducking}
        onChange={(v) => void useAppStore.getState().setGameDucking(v)}
      />
      {ducking && (
        <Row
          icon={<Volume2 className="h-4 w-4" />}
          label={t("config.gameDuckLevel", { pct: Math.round(level * 100) })}
          desc={
            status
              ? status.game_sessions > 0
                ? t("config.gameDuckFound")
                : t("config.gameDuckNotFound")
              : undefined
          }
        >
          <input
            type="range"
            min={20}
            max={95}
            step={5}
            value={Math.round(level * 100)}
            onChange={(e) => void useAppStore.getState().setGameDuckLevel(Number(e.target.value) / 100)}
            className="w-40 accent-primary"
          />
        </Row>
      )}
    </div>
  );
}

// ── Voix › Parler : boutons du volant par action ─────────────────────────────

export function WheelActionsRows() {
  const { t } = useTranslation();
  const actions = useAppStore((s) => s.wheelActions);
  const [capturing, setCapturing] = useState<WheelAction | null>(null);
  const capture = async (a: WheelAction) => {
    setCapturing(a);
    try {
      const b = await invoke<WheelBinding | null>("wheel_capture", { timeoutMs: 10000 });
      if (b) await useAppStore.getState().setWheelAction(a, b);
      else toast(t("config.wheelButtonNone"));
    } catch {
      toast(t("config.wheelButtonNone"));
    } finally {
      setCapturing(null);
    }
  };
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground/70">{t("config.wheelActionsDesc")}</p>
      {WHEEL_ACTIONS.map((a) => (
        <div key={a} className="flex items-center justify-between gap-3 py-1.5">
          <div className="flex min-w-0 items-start gap-2">
            <Gamepad2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="text-sm font-medium leading-tight">{t(`config.wheelAction_${a}`)}</div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground/80">
                {capturing === a ? t("config.wheelButtonWaiting") : actions[a]?.label || t("config.wheelButtonUnset")}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" variant="outline" disabled={capturing != null} onClick={() => void capture(a)}>
              {capturing === a ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("config.wheelButtonCapture")}
            </Button>
            {actions[a] && capturing == null && (
              <Button
                size="sm"
                variant="ghost"
                title={t("config.wheelButtonClear")}
                onClick={() => void useAppStore.getState().setWheelAction(a, null)}
              >
                <Eraser className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Maintenance : captures brutes et rapport de bug ──────────────────────────

export function DiagnosticsRows() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ShmStatus | null>(null);
  const [replayPath, setReplayPath] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => void live.captureStatus().then(setStatus).catch(() => {});
  useEffect(() => {
    if (!isTauri()) return;
    refresh();
    const id = setInterval(refresh, 1000);
    return () => clearInterval(id);
  }, []);
  const report = async (withReplay: boolean) => {
    setBusy(true);
    try {
      const path = await appLog.exportReport(withReplay);
      toastSuccess(t("config.reportDone", { path }));
      const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
      await revealItemInDir(path).catch(() => {});
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <Row
        icon={<FileArchive className="h-4 w-4" />}
        label={t("config.reportExport")}
        desc={t("config.reportExportDesc")}
        tip={t("config.reportExportTip")}
      >
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void report(false)}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("config.reportExportButton")}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void report(true)}>
            {t("config.reportExportWithCapture")}
          </Button>
        </div>
      </Row>
      <Row icon={<Disc3 className="h-4 w-4" />} label={t("config.captureTitle")} desc={t("config.captureDesc")}>
        {status?.recording ? (
          <Button size="sm" variant="outline" onClick={() => void live.recordStop().then(refresh)}>
            <Square className="mr-1 h-3.5 w-3.5" />
            {t("config.captureStop", { s: Math.round(status.recording_s) })}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => void live.recordStart().then(refresh).catch((e) => toastError(String(e)))}>
            <Disc3 className="mr-1 h-3.5 w-3.5" />
            {t("config.captureStart")}
          </Button>
        )}
      </Row>
      {status?.last_capture && <p className="px-1 text-xs text-muted-foreground">{t("config.captureLast", { path: status.last_capture })}</p>}
      <Row icon={<Play className="h-4 w-4" />} label={t("config.replayTitle")} desc={t("config.replayDesc")}>
        {status?.replaying ? (
          <Button size="sm" variant="outline" onClick={() => void live.replayStop().then(refresh)}>
            <Square className="mr-1 h-3.5 w-3.5" />
            {t("config.replayStop")}
          </Button>
        ) : (
          <div className="flex shrink-0 gap-1.5">
            <Input
              className="h-8 w-56 text-xs"
              placeholder={status?.last_capture ?? t("config.replayPath")}
              value={replayPath}
              onChange={(e) => setReplayPath(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void live
                  .replayStart(replayPath || status?.last_capture || "")
                  .then(refresh)
                  .catch((e) => toastError(String(e)))
              }
            >
              {t("config.replayStart")}
            </Button>
          </div>
        )}
      </Row>
      {status?.error && (
        <p className="flex items-center gap-1.5 px-1 text-xs text-destructive">
          <AlertTriangle className="h-3 w-3" />
          {status.error}
        </p>
      )}
    </div>
  );
}
