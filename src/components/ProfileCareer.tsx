import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Award, CalendarRange, Flag, ImageDown, Plus, Trash2, Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { config, isTauri, queries, type CareerRace, type ClassResult } from "@/lib/api";
import { useAppStore } from "@/stores/app";
import { usePageState } from "@/lib/usePageState";
import { formatTime, cn } from "@/lib/utils";
import { toastError, toastSuccess } from "@/stores/dialogs";
import {
  filterRaces,
  highlights,
  matchRounds,
  recurring,
  standings,
  summarize,
  titleMath,
  type Championship,
  type OnlineFilter,
  type Scoring,
} from "@/lib/career";
import { canvasPng, drawWrapped } from "@/lib/wrappedCard";

const CHAMP_KEY = "championships";
const fmtDate = (ts: number, lang: string) => new Date(ts * 1000).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" });

/**
 * Section « Saison » de la page Profil (ex-page Carrière) : ce que le bilan du
 * Profil ne montre pas — temps forts, défaut récurrent, progression (5 premières
 * courses contre 5 dernières), carte récap à partager et championnats suivis.
 * Les filtres année / en ligne / classe cadrent les temps forts et la carte récap.
 */
export function ProfileCareer() {
  const { t, i18n } = useTranslation();
  const [races, setRaces] = useState<CareerRace[] | null>(null);
  const [online, setOnline] = usePageState<OnlineFilter>("career.online", "all");
  const [cls, setCls] = usePageState("career.cls", "");
  const [year, setYear] = usePageState("career.year", String(new Date().getFullYear()));

  useEffect(() => {
    if (!isTauri()) {
      setRaces([]);
      return;
    }
    void queries.getCareerRaces().then(setRaces).catch(() => setRaces([]));
  }, []);

  const years = useMemo(() => [...new Set((races ?? []).map((r) => new Date(r.timestamp * 1000).getFullYear()))].sort((a, b) => b - a), [races]);
  const classes = useMemo(() => [...new Set((races ?? []).map((r) => r.car_class))].sort(), [races]);
  const period = useMemo(() => {
    if (year === "all") return { from: null, to: null };
    const y = Number(year);
    return { from: Date.UTC(y, 0, 1) / 1000, to: Date.UTC(y + 1, 0, 1) / 1000 - 1 };
  }, [year]);
  const list = useMemo(() => filterRaces(races ?? [], { online, cls, ...period }), [races, online, cls, period]);
  const sum = useMemo(() => summarize(list), [list]);
  const hl = useMemo(() => highlights(list), [list]);
  const rec = useMemo(() => recurring(list), [list]);

  const lang = i18n.language;
  const pct = (x: number) => `${Math.round(x * 100)} %`;

  if (races == null) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="bg-primary text-primary-foreground rounded-md px-4 py-1 flex items-center gap-2">
        <CalendarRange className="h-4 w-4 opacity-90" />
        <h2 className="text-sm font-bold tracking-tight">{t("career.title")}</h2>
        <span className="text-mini opacity-80 truncate hidden sm:inline">{t("career.subtitle")}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={year}
          onValueChange={setYear}
          className="w-32"
          ariaLabel={t("career.year")}
          options={[{ value: "all", label: t("career.allTime") }, ...years.map((y) => ({ value: String(y), label: String(y) }))]}
        />
        <Select
          value={online}
          onValueChange={(v) => setOnline(v as OnlineFilter)}
          className="w-36"
          options={[
            { value: "all", label: t("career.all") },
            { value: "online", label: t("career.online") },
            { value: "offline", label: t("career.offline") },
          ]}
        />
        <Select value={cls} onValueChange={setCls} className="w-36" options={[{ value: "", label: t("career.allClasses") }, ...classes.map((c) => ({ value: c, label: c }))]} />
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">{t("career.empty")}</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          <Card>
            <CardContent className="p-4 flex flex-col gap-2">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Award className="h-5 w-5 text-primary" />
                {t("career.highlights")}
              </h3>
              {hl.length === 0 && <p className="text-sm text-muted-foreground">{t("career.noHighlights")}</p>}
              {hl.map((h) => (
                <p key={`${h.kind}-${h.race.session_id}`} className="text-sm">
                  {t(`career.hl.${h.kind}`, {
                    track: h.race.track,
                    pos: h.race.class_position,
                    cls: h.race.car_class,
                    date: fmtDate(h.race.timestamp, lang),
                    laps: h.race.laps,
                    places: h.kind === "mostGained" ? h.places : 0,
                  })}
                </p>
              ))}
              <p className="text-sm mt-2">
                <span className="font-medium">{t("career.progress")} </span>
                {sum.progress ? (
                  <>
                    <span className="tabular-nums">
                      {sum.progress.after < sum.progress.before ? "↗" : sum.progress.after > sum.progress.before ? "↘" : "→"}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {t("career.progressSub", { before: pct(1 - sum.progress.before), after: pct(1 - sum.progress.after) })}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">{t("career.progressNeed")}</span>
                )}
              </p>
              {rec && (
                <p className="text-sm text-amber-600">
                  {t(`career.rec.${rec.kind}`, { pct: pct(rec.share) })}
                </p>
              )}
            </CardContent>
          </Card>
          <WrappedCard summary={sum} year={year} list={list} />
        </div>
      )}

      <Championships races={races} />
    </section>
  );
}

function WrappedCard({ summary, year, list }: { summary: ReturnType<typeof summarize>; year: string; list: CareerRace[] }) {
  const { t } = useTranslation();
  const playerName = useAppStore((s) => s.playerName);
  const ref = useRef<HTMLCanvasElement>(null);
  const bestLap = useMemo(() => {
    let b: CareerRace | null = null;
    for (const r of list) if (r.best_lap && (!b || (r.class_position > 0 && r.class_position < (b.class_position || 99)))) b = r;
    return b;
  }, [list]);

  useEffect(() => {
    if (!ref.current) return;
    drawWrapped(ref.current, {
      title: year === "all" ? t("career.wrapTitleAll") : t("career.wrapTitle", { year }),
      subtitle: playerName || t("strategy.driverDefault"),
      tiles: [
        { label: t("career.races"), value: String(summary.races), sub: t("career.tracks", { count: summary.tracks }) },
        { label: t("career.winsPodiums"), value: `${summary.wins} / ${summary.podiums}` },
        { label: t("career.best"), value: summary.best ? `P${summary.best.class_position}` : "—", sub: summary.best?.track },
        { label: t("career.finishRate"), value: `${Math.round(summary.finishRate * 100)}%` },
        {
          label: t("career.gained"),
          value: summary.gainedPerRace == null ? "—" : `${summary.gainedPerRace > 0 ? "+" : ""}${summary.gainedPerRace.toFixed(1)}`,
          sub: t("career.gainedSub"),
        },
        { label: t("career.bestLap"), value: bestLap?.best_lap ? formatTime(bestLap.best_lap) : "—", sub: bestLap?.track },
      ],
      footer: "LMU Stats Viewer",
    });
  }, [summary, year, playerName, bestLap, t]);

  const save = async () => {
    if (!ref.current) return;
    try {
      const { save: pick } = await import("@tauri-apps/plugin-dialog");
      const dest = await pick({ defaultPath: `lmu-${year}.png`, filters: [{ name: "PNG", extensions: ["png"] }] });
      if (!dest) return;
      await queries.saveImage(dest, await canvasPng(ref.current));
      toastSuccess(t("career.saved"));
    } catch (e) {
      toastError(String(e));
    }
  };

  return (
    <Card>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <ImageDown className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">{t("career.wrapped")}</h3>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => void save()} disabled={summary.races < 3}>
            {t("career.saveImage")}
          </Button>
        </div>
        {summary.races < 3 ? (
          <p className="text-sm text-muted-foreground">{t("career.wrapNeed")}</p>
        ) : (
          <canvas ref={ref} className="w-full max-w-sm rounded-lg border border-border/60 self-center" />
        )}
      </CardContent>
    </Card>
  );
}

function Championships({ races }: { races: CareerRace[] }) {
  const { t, i18n } = useTranslation();
  const [champs, setChamps] = useState<Championship[]>([]);
  const [open, setOpen] = usePageState("career.champ", "");
  const [results, setResults] = useState<ClassResult[]>([]);

  useEffect(() => {
    if (!isTauri()) return;
    void config.get(CHAMP_KEY).then((raw) => {
      try {
        setChamps(JSON.parse(raw || "[]") as Championship[]);
      } catch {
        setChamps([]);
      }
    });
  }, []);
  const persist = (next: Championship[]) => {
    setChamps(next);
    void config.set(CHAMP_KEY, JSON.stringify(next)).catch(() => {});
  };

  const c = champs.find((x) => x.id === open) ?? champs[0] ?? null;
  const matched = useMemo(() => (c ? matchRounds(c, races) : []), [c, races]);
  useEffect(() => {
    const ids = matched.filter((r): r is CareerRace => !!r).map((r) => r.session_id);
    if (!c || !ids.length || !isTauri()) {
      setResults([]);
      return;
    }
    void queries.getClassResults(ids, c.cls).then(setResults).catch(() => setResults([]));
  }, [c, matched]);
  const rows = useMemo(() => (c ? standings(c, results) : []), [c, results]);
  const remaining = matched.filter((m) => !m).length;
  const tm = c ? titleMath(rows, remaining, c.scoring) : null;

  const add = () => {
    const id = String(Date.now());
    const cls = races[races.length - 1]?.car_class ?? "";
    persist([...champs, { id, name: t("career.newChamp"), cls, scoring: "wec", rounds: [] }]);
    setOpen(id);
  };
  const update = (patch: Partial<Championship>) => c && persist(champs.map((x) => (x.id === c.id ? { ...x, ...patch } : x)));

  return (
    <Card>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold mr-auto">{t("career.champs")}</h3>
          {champs.length > 0 && (
            <Select value={c?.id ?? ""} onValueChange={setOpen} className="w-56" options={champs.map((x) => ({ value: x.id, label: x.name }))} />
          )}
          <Button size="sm" variant="outline" onClick={add}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t("career.addChamp")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("career.champDesc")}</p>
        {c && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input value={c.name} onChange={(e) => update({ name: e.target.value })} aria-label={t("career.champName")} />
              <Input value={c.cls} onChange={(e) => update({ cls: e.target.value })} placeholder="LMP2" aria-label={t("career.champClass")} />
              <Select
                value={c.scoring}
                onValueChange={(v) => update({ scoring: v as Scoring })}
                options={[
                  { value: "wec", label: t("career.scoringWec") },
                  { value: "top10", label: t("career.scoringTop10") },
                ]}
              />
              <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => persist(champs.filter((x) => x.id !== c.id))}>
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                {t("career.deleteChamp")}
              </Button>
            </div>
            <div className="flex flex-col gap-1">
              {c.rounds.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Flag className={cn("h-3.5 w-3.5", matched[i] ? "text-emerald-500" : "text-muted-foreground")} />
                  <Input className="h-8 w-56" value={r.track} onChange={(e) => update({ rounds: c.rounds.map((x, j) => (j === i ? { ...x, track: e.target.value } : x)) })} placeholder={t("career.roundTrack")} />
                  <Input className="h-8 w-40" type="date" value={r.date} onChange={(e) => update({ rounds: c.rounds.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })} />
                  <span className="text-xs text-muted-foreground">
                    {matched[i] ? t("career.roundDone", { pos: matched[i]!.class_position, date: fmtDate(matched[i]!.timestamp, i18n.language) }) : t("career.roundTodo")}
                  </span>
                  <Button size="icon" variant="ghost" className="h-7 w-7 ml-auto" onClick={() => update({ rounds: c.rounds.filter((_, j) => j !== i) })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" className="self-start" onClick={() => update({ rounds: [...c.rounds, { track: "", date: new Date().toISOString().slice(0, 10) }] })}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t("career.addRound")}
              </Button>
            </div>
            {rows.length > 0 && (
              <table className="w-full text-sm max-w-xl">
                <tbody>
                  {rows.slice(0, 10).map((r, i) => (
                    <tr key={r.driver} className={cn("border-b border-border/30", r.isPlayer && "font-semibold text-primary")}>
                      <td className="py-1 pr-3 w-8 tabular-nums">{i + 1}</td>
                      <td className="py-1 pr-3">{r.driver}</td>
                      <td className="py-1 text-right tabular-nums">{r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tm && (
              <p className="text-sm">
                {tm.kind === "leading"
                  ? t(tm.secured ? "career.titleSecured" : "career.titleLeading", { n: tm.margin })
                  : tm.kind === "out"
                    ? t("career.titleOut", { leader: tm.leader, n: tm.gap })
                    : t("career.titleChasing", { leader: tm.leader, n: tm.gap, count: tm.remaining })}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
