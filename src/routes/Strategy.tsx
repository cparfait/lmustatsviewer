import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Circle, ClipboardCheck, Moon, RotateCcw, Users, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { isTauri, live } from "@/lib/api";
import { useAppStore } from "@/stores/app";
import { usePageState } from "@/lib/usePageState";
import { GOALS, OPTIONAL, REQUIRED, emptyPrep, isDone, ready, type PrepTask } from "@/lib/racePlan/prep";
import { usePrepStore } from "@/lib/racePlan/useRacePrep";
import { clock, hm, planStints } from "@/lib/racePlan/stintPlan";
import { trackSun } from "@/lib/racePlan/sun";
import { cn } from "@/lib/utils";

/** « 1:58.4 » → 118,4 s ; « 118.4 » accepté aussi. */
function parseLap(s: string): number {
  const m = /^(\d+):(\d{1,2}(?:[.,]\d+)?)$/.exec(s.trim());
  if (m) return Number(m[1]) * 60 + Number(m[2].replace(",", "."));
  const n = Number(s.replace(",", "."));
  return isFinite(n) ? n : 0;
}

/** « 6:00 » → 6 h ; « 15:30 » → 15,5. */
function parseHm(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  const n = Number(s.replace(",", "."));
  return isFinite(n) ? n : 0;
}

function fmtLap(s: number): string {
  if (!(s > 0)) return "";
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

/**
 * Stratégie : préparation de course (programme d'essais coché tout seul) et
 * feuille de relais d'endurance (pilotes, pneus, nuit).
 */
export function Strategy() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("strategy.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("strategy.subtitle")}</p>
      </div>
      <PrepCard />
      <StintSheet />
    </div>
  );
}

function comboLabel(c: string): string {
  const [track, car] = c.split("::");
  return car ? `${track} — ${car}` : c;
}

function PrepCard() {
  const { t } = useTranslation();
  const byCombo = usePrepStore((s) => s.byCombo);
  const current = usePrepStore((s) => s.current);
  const [picked, setPicked] = usePageState("strategy.prepCombo", "");
  const combos = useMemo(() => {
    const all = new Set(Object.keys(byCombo));
    if (current) all.add(current);
    return [...all].sort();
  }, [byCombo, current]);
  const combo = picked && combos.includes(picked) ? picked : current || combos[0] || "";
  const state = byCombo[combo] ?? emptyPrep();

  const row = (task: PrepTask, optional: boolean) => {
    const done = isDone(state, task);
    const goal = GOALS[task];
    return (
      <div key={task} className="flex items-start gap-3 py-2 border-b border-border/40 last:border-0">
        {done ? <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" /> : <Circle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className={cn("text-sm font-medium", done && "text-muted-foreground")}>
            {t(`strategy.task.${task}`)}
            {optional && <span className="ml-2 text-xs font-normal text-muted-foreground">{t("strategy.optional")}</span>}
          </div>
          <div className="text-xs text-muted-foreground">{t(`strategy.taskTip.${task}`)}</div>
        </div>
        {goal > 1 && (
          <span className="text-xs tabular-nums text-muted-foreground shrink-0">
            {Math.min(state[task], goal)}/{goal}
          </span>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{t("strategy.prepTitle")}</h2>
          {combo && ready(state) && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600">{t("strategy.ready")}</span>}
          <div className="ml-auto flex items-center gap-2">
            {combos.length > 0 && (
              <Select
                value={combo}
                onValueChange={setPicked}
                className="w-72"
                ariaLabel={t("strategy.combo")}
                options={combos.map((c) => ({ value: c, label: c === current ? `● ${comboLabel(c)}` : comboLabel(c) }))}
              />
            )}
            {combo && byCombo[combo] && (
              <Button variant="outline" size="sm" onClick={() => usePrepStore.getState().clear(combo)}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                {t("strategy.restart")}
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("strategy.prepDesc")}</p>
        {!combo ? (
          <p className="text-sm text-muted-foreground">{t("strategy.prepEmpty")}</p>
        ) : (
          <div>
            {REQUIRED.map((k) => row(k, false))}
            {OPTIONAL.map((k) => row(k, true))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StintSheet() {
  const { t } = useTranslation();
  const storeLoss = useAppStore((s) => s.pitLossSeconds);
  const playerName = useAppStore((s) => s.playerName);
  const [duration, setDuration] = usePageState("strategy.duration", "6:00");
  const [start, setStart] = usePageState("strategy.start", "15:00");
  const [date, setDate] = usePageState("strategy.date", () => new Date().toISOString().slice(0, 10));
  const [track, setTrack] = usePageState("strategy.track", "");
  const [lap, setLap] = usePageState("strategy.lap", "");
  const [stintLaps, setStintLaps] = usePageState("strategy.stintLaps", "20");
  const [loss, setLoss] = usePageState("strategy.loss", "");
  const [drivers, setDrivers] = usePageState("strategy.drivers", "");
  const [mode, setMode] = usePageState<"rotate" | "balance">("strategy.mode", "rotate");
  const [perDriver, setPerDriver] = usePageState("strategy.perDriver", "2");
  const [tyreEvery, setTyreEvery] = usePageState("strategy.tyreEvery", "2");
  const [maxDrive, setMaxDrive] = usePageState("strategy.maxDrive", "");
  const [pins, setPins] = usePageState<Record<number, string>>("strategy.pins", {});
  const [filled, setFilled] = usePageState("strategy.filled", false);

  // Valeurs de départ prises dans la séance en cours (une fois).
  useEffect(() => {
    if (filled || !isTauri()) return;
    setFilled(true);
    void live
      .getData()
      .then((d) => {
        if (!d?.session) return;
        if (d.session.track) setTrack(d.session.track);
        const best = d.player?.best_lap_time ?? 0;
        if (best > 0) setLap(fmtLap(best));
        const tel = d.telemetry;
        if (tel && tel.fuel_consumption > 0 && tel.fuel_capacity > 0) setStintLaps(String(Math.floor(tel.fuel_capacity / tel.fuel_consumption)));
        if (d.session.session >= 10 && d.session.end_et > 0) setDuration(hm(d.session.end_et));
      })
      .catch(() => {});
  }, [filled, setFilled, setTrack, setLap, setStintLaps, setDuration]);

  const driverList = useMemo(() => {
    const l = drivers.split(",").map((s) => s.trim()).filter(Boolean);
    return l.length ? l : [playerName || t("strategy.driverDefault")];
  }, [drivers, playerName, t]);

  const sun = useMemo(() => (track ? trackSun(track, new Date(`${date}T12:00:00Z`)) : null), [track, date]);
  const startHour = parseHm(start);
  const plan = useMemo(
    () =>
      planStints({
        raceS: parseHm(duration) * 3600,
        startHour,
        lapS: parseLap(lap),
        stintLaps: Math.max(1, Math.floor(Number(stintLaps) || 0)),
        pitLossS: Number(loss.replace(",", ".")) || storeLoss || 0,
        drivers: driverList,
        mode,
        perDriver: Number(perDriver) || 1,
        tyreEvery: Number(tyreEvery) || 1,
        maxDriveS: maxDrive ? parseHm(maxDrive) * 3600 : null,
        sun,
        pins,
      }),
    [duration, startHour, lap, stintLaps, loss, storeLoss, driverList, mode, perDriver, tyreEvery, maxDrive, sun, pins],
  );

  const field = (label: string, el: React.ReactNode) => (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {el}
    </label>
  );
  const small = [1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }));

  return (
    <Card>
      <CardContent className="p-4 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{t("strategy.sheetTitle")}</h2>
        </div>
        <p className="text-xs text-muted-foreground">{t("strategy.sheetDesc")}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {field(t("strategy.duration"), <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="6:00" />)}
          {field(t("strategy.start"), <Input value={start} onChange={(e) => setStart(e.target.value)} placeholder="15:00" />)}
          {field(t("strategy.date"), <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />)}
          {field(t("strategy.track"), <Input value={track} onChange={(e) => setTrack(e.target.value)} placeholder="Circuit de la Sarthe" />)}
          {field(t("strategy.lap"), <Input value={lap} onChange={(e) => setLap(e.target.value)} placeholder="3:28.5" />)}
          {field(t("strategy.stintLaps"), <Input type="number" min={1} value={stintLaps} onChange={(e) => setStintLaps(e.target.value)} />)}
          {field(t("strategy.pitLoss"), <Input value={loss} onChange={(e) => setLoss(e.target.value)} placeholder={storeLoss ? String(Math.round(storeLoss)) : "60"} />)}
          {field(t("strategy.maxDrive"), <Input value={maxDrive} onChange={(e) => setMaxDrive(e.target.value)} placeholder="—" />)}
          <div className="col-span-2">
            {field(t("strategy.drivers"), <Input value={drivers} onChange={(e) => { setDrivers(e.target.value); setPins({}); }} placeholder={playerName || "Alice, Bob, Chloé"} />)}
          </div>
          {field(
            t("strategy.mode"),
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as "rotate" | "balance")}
              options={[
                { value: "rotate", label: t("strategy.modeRotate") },
                { value: "balance", label: t("strategy.modeBalance") },
              ]}
            />,
          )}
          <div className="grid grid-cols-2 gap-3">
            {field(t("strategy.perDriver"), <Select value={perDriver} onValueChange={setPerDriver} options={small} />)}
            {field(t("strategy.tyreEvery"), <Select value={tyreEvery} onValueChange={setTyreEvery} options={small} />)}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {sun
            ? t("strategy.sun", { rise: clock(sun.rise, 0), set: clock(sun.set, 0) })
            : t("strategy.sunUnknown")}
        </div>

        {!plan ? (
          <p className="text-sm text-muted-foreground">{t("strategy.sheetEmpty")}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-4 text-sm">
              <span>{t("strategy.stops", { count: plan.stops })}</span>
              {Object.entries(plan.driveS).map(([d, s]) => (
                <span key={d} className={cn(plan.overLimit.includes(d) && "text-destructive font-medium")}>
                  {d} : {hm(s)}
                  {plan.overLimit.includes(d) && ` — ${t("strategy.overLimit")}`}
                </span>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="text-left py-1.5 pr-3">#</th>
                    <th className="text-left py-1.5 pr-3">{t("strategy.colDriver")}</th>
                    <th className="text-left py-1.5 pr-3">{t("strategy.colStart")}</th>
                    <th className="text-left py-1.5 pr-3">{t("strategy.colEnd")}</th>
                    <th className="text-right py-1.5 pr-3">{t("strategy.colLaps")}</th>
                    <th className="text-center py-1.5 pr-3">{t("strategy.colTyres")}</th>
                    <th className="text-center py-1.5">{t("strategy.colNight")}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.stints.map((s) => (
                    <tr key={s.index} className={cn("border-b border-border/30", s.night && "bg-indigo-500/5")}>
                      <td className="py-1 pr-3 tabular-nums">{s.index + 1}</td>
                      <td className="py-1 pr-3">
                        {driverList.length > 1 ? (
                          <Select
                            value={s.driver}
                            onValueChange={(v) => setPins((p) => ({ ...p, [s.index]: v }))}
                            className="h-7 w-40"
                            options={driverList.map((d) => ({ value: d, label: pins[s.index] === d ? `📌 ${d}` : d }))}
                          />
                        ) : (
                          s.driver
                        )}
                      </td>
                      <td className="py-1 pr-3 tabular-nums">
                        {clock(startHour, s.startS)} <span className="text-xs text-muted-foreground">({hm(s.startS)})</span>
                      </td>
                      <td className="py-1 pr-3 tabular-nums">
                        {clock(startHour, s.endS)} <span className="text-xs text-muted-foreground">({hm(s.endS)})</span>
                      </td>
                      <td className="py-1 pr-3 text-right tabular-nums">{s.laps}</td>
                      <td className="py-1 pr-3 text-center">{s.newTyres ? <Wrench className="h-3.5 w-3.5 inline text-primary" /> : ""}</td>
                      <td className="py-1 text-center">{s.night ? <Moon className="h-3.5 w-3.5 inline text-indigo-400" /> : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {Object.keys(pins).length > 0 && (
              <Button variant="ghost" size="sm" className="self-start" onClick={() => setPins({})}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                {t("strategy.unpin")}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
