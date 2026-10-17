/**
 * Vues communautaires de la page Classement (activées dans Configuration › Sessions ›
 * options du module, désactivées par défaut) :
 * - « Index voitures » : chaque voiture d'une classe, tracé par tracé, en % de la plus
 *   rapide (moyenne des 3 meilleurs pilotes de chaque voiture) ;
 * - « Effet du patch » : écart médian entre deux versions du jeu, mesuré sur les pilotes
 *   qui ont roulé le même combo avant et après ;
 * - « Rival de la semaine » : duel hebdomadaire avec un pilote de rythme proche (inscription
 *   volontaire, partage communautaire requis).
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Swords } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClassBadge } from "@/components/ClassBadge";
import { CarLogo } from "@/components/CarLogo";
import { TrackFlag } from "@/components/TrackFlag";
import {
  community,
  type CommunityCarIndex,
  type CommunityPatchEffect,
  type CommunityPublicDriver,
  type CommunityRival,
  type CommunityStatus,
} from "@/lib/api";
import { cn, formatTime } from "@/lib/utils";

/** Clé de config : onglets communautaires avancés visibles (« 1 »). */
export const INSIGHTS_KEY = "community_insights";

/** Classes présentes dans la base (liste des combos), dans un ordre stable. */
function useCommunityClasses(): string[] {
  const [classes, setClasses] = useState<string[]>([]);
  useEffect(() => {
    void community
      .get<{ combos: { car_class: string }[] }>("combos")
      .then((r) => setClasses([...new Set((r?.combos ?? []).map((c) => c.car_class))].sort()))
      .catch(() => setClasses([]));
  }, []);
  return classes;
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>;
}

function Busy() {
  return (
    <div className="flex justify-center py-8">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

const layoutName = (l: { track: string; track_course: string }) =>
  l.track_course && l.track_course !== l.track ? l.track_course : l.track;

/** Couleur d'un écart en % (100 = plus rapide). */
function pctTone(pct: number): string {
  if (pct <= 100.05) return "text-emerald-400 font-semibold";
  if (pct <= 100.5) return "text-lime-300";
  if (pct <= 101) return "text-amber-300";
  return "text-orange-400";
}

export function CarIndexTab() {
  const { t } = useTranslation();
  const classes = useCommunityClasses();
  const [cls, setCls] = useState("");
  const [data, setData] = useState<CommunityCarIndex | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!cls && classes.length) setCls(classes.includes("GT3") ? "GT3" : classes[0]);
  }, [classes, cls]);

  useEffect(() => {
    if (!cls) return;
    setBusy(true);
    setError("");
    community
      .get<CommunityCarIndex>("cars", { class: cls })
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false));
  }, [cls]);

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">{t("insights.carsTitle")}</h3>
            <p className="text-xs text-muted-foreground">{t("insights.carsDesc", { n: data?.top_n ?? 3 })}</p>
          </div>
          <Select
            value={cls}
            onValueChange={setCls}
            ariaLabel={t("leaderboard.colClass")}
            className="h-8 w-40"
            options={classes.map((c) => ({ value: c, label: c }))}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {busy ? (
          <Busy />
        ) : !data || data.cars.length === 0 ? (
          <Empty text={t("insights.carsEmpty")} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("insights.car")}</TableHead>
                  <TableHead className="text-right">{t("insights.avg")}</TableHead>
                  <TableHead className="text-right">{t("insights.worst")}</TableHead>
                  {data.layouts.map((l) => (
                    <TableHead key={`${l.track}|${l.track_course}`} className="text-right" title={`${l.track} — ${l.track_course}`}>
                      <span className="inline-flex items-center gap-1">
                        <TrackFlag track={l.track} />
                        <span className="max-w-[90px] truncate">{layoutName(l)}</span>
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.cars.map((c) => (
                  <TableRow key={c.car_model}>
                    <TableCell className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <CarLogo carName={c.car_model} className="h-4 w-auto" />
                        {c.car_model}
                      </span>
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", pctTone(c.avg_pct))}>{c.avg_pct.toFixed(2)} %</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{c.worst_pct.toFixed(2)} %</TableCell>
                    {c.cells.map((cell, i) => (
                      <TableCell
                        key={i}
                        className={cn("text-right tabular-nums", cell ? pctTone(cell.pct) : "text-muted-foreground/40")}
                        title={cell ? `${formatTime(cell.time)} · ${t("insights.drivers", { count: cell.drivers })}` : ""}
                      >
                        {cell ? `${cell.pct.toFixed(2)}` : "—"}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">{t("insights.carsNote")}</p>
      </CardContent>
    </Card>
  );
}

export function PatchTab() {
  const { t } = useTranslation();
  const classes = useCommunityClasses();
  const [cls, setCls] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<CommunityPatchEffect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setBusy(true);
    setError("");
    const q: Record<string, string> = {};
    if (cls) q.class = cls;
    if (from) q.from = from;
    if (to) q.to = to;
    community
      .get<CommunityPatchEffect>("patch", q)
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false));
  }, [cls, from, to]);

  const versions = data?.versions ?? [];
  const fmtDelta = (d: number | null) => (d == null ? "—" : `${d > 0 ? "+" : ""}${d.toFixed(3)} s`);
  const fmtPct = (p: number | null) => (p == null ? "—" : `${p > 0 ? "+" : ""}${p.toFixed(2)} %`);

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">{t("insights.patchTitle")}</h3>
            <p className="text-xs text-muted-foreground">{t("insights.patchDesc")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={from || data?.from || ""}
              onValueChange={setFrom}
              ariaLabel={t("insights.from")}
              className="h-8 w-28"
              options={versions.map((v) => ({ value: v, label: v }))}
            />
            <span className="text-muted-foreground">→</span>
            <Select
              value={to || data?.to || ""}
              onValueChange={setTo}
              ariaLabel={t("insights.to")}
              className="h-8 w-28"
              options={versions.map((v) => ({ value: v, label: v }))}
            />
            <Select
              value={cls}
              onValueChange={setCls}
              ariaLabel={t("leaderboard.colClass")}
              className="h-8 w-36"
              options={[{ value: "", label: t("insights.allClasses") }, ...classes.map((c) => ({ value: c, label: c }))]}
            />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {busy ? (
          <Busy />
        ) : !data || data.pairs === 0 ? (
          <Empty text={t("insights.patchEmpty")} />
        ) : (
          <>
            <div className="flex flex-wrap gap-6 rounded-md border border-border p-3 text-sm">
              <div>
                <p className="text-micro uppercase tracking-widest text-muted-foreground">{t("insights.median")}</p>
                <p className={cn("text-2xl font-bold tabular-nums", (data.median_delta ?? 0) <= 0 ? "text-emerald-400" : "text-orange-400")}>
                  {fmtDelta(data.median_delta)}
                </p>
                <p className="text-xs text-muted-foreground">{fmtPct(data.median_pct)}</p>
              </div>
              <div>
                <p className="text-micro uppercase tracking-widest text-muted-foreground">{t("insights.measured")}</p>
                <p className="text-2xl font-bold tabular-nums">{data.drivers}</p>
                <p className="text-xs text-muted-foreground">{t("insights.pairs", { count: data.pairs })}</p>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("insights.layout")}</TableHead>
                  <TableHead>{t("leaderboard.colClass")}</TableHead>
                  <TableHead className="text-right">{t("insights.median")}</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">{t("insights.measured")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.combos.map((c) => (
                  <TableRow key={`${c.track}|${c.track_course}|${c.car_class}`}>
                    <TableCell className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <TrackFlag track={c.track} />
                        {layoutName(c)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ClassBadge carClass={c.car_class} />
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", c.median_delta <= 0 ? "text-emerald-400" : "text-orange-400")}>
                      {fmtDelta(c.median_delta)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmtPct(c.median_pct)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", c.drivers < 3 && "text-muted-foreground")}>{c.drivers}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
        <p className="text-[11px] text-muted-foreground">{t("insights.patchNote")}</p>
      </CardContent>
    </Card>
  );
}

function driverLabel(d: CommunityPublicDriver | null, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (!d) return "—";
  return d.name ?? t("leaderboard.anonDriver", { tag: d.tag });
}

export function RivalTab() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<CommunityStatus | null>(null);
  const [data, setData] = useState<CommunityRival | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setBusy(true);
    setError("");
    community
      .rival()
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    void community.status().then(setStatus).catch(() => setStatus(null));
    load();
  }, []);

  const toggle = async (on: boolean) => {
    setSaving(true);
    setError("");
    try {
      await community.setRival(on);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const sharing = !!status?.enabled && !!status?.registered;
  const cur = data?.current ?? null;
  const verdict = useMemo(() => {
    if (!cur || cur.points == null) return t("insights.rivalNoCommon");
    return cur.points === 3 ? t("insights.rivalWinning") : cur.points === 1 ? t("insights.rivalDraw") : t("insights.rivalLosing");
  }, [cur, t]);

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Swords className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold">{t("insights.rivalTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("insights.rivalDesc")}</p>
            </div>
          </div>
          {sharing && (
            <label className="flex items-center gap-2 text-sm">
              {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {t("insights.rivalJoin")}
              <Switch checked={!!data?.opted_in} disabled={saving} onCheckedChange={(v: boolean) => void toggle(v)} />
            </label>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!sharing ? (
          <Empty text={t("insights.rivalNeedsSharing")} />
        ) : busy ? (
          <Busy />
        ) : !data?.opted_in ? (
          <Empty text={t("insights.rivalOff")} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-6 rounded-md border border-border p-3">
              <div>
                <p className="text-micro uppercase tracking-widest text-muted-foreground">
                  {t("insights.rivalWeek", { from: data.week, to: data.week_end })}
                </p>
                <p className="text-lg font-semibold">{data.rival ? driverLabel(data.rival, t) : t("insights.rivalWaiting")}</p>
              </div>
              {cur && (
                <div>
                  <p className="text-micro uppercase tracking-widest text-muted-foreground">{t("insights.rivalScore")}</p>
                  <p className="text-2xl font-bold tabular-nums">
                    {cur.wins} – {cur.losses}
                    {cur.ties > 0 && <span className="text-base text-muted-foreground"> ({t("insights.ties", { count: cur.ties })})</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{verdict}</p>
                </div>
              )}
              <div>
                <p className="text-micro uppercase tracking-widest text-muted-foreground">{t("insights.rivalPoints")}</p>
                <p className="text-2xl font-bold tabular-nums">{data.points}</p>
              </div>
            </div>
            {cur && cur.combos.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("insights.layout")}</TableHead>
                    <TableHead>{t("leaderboard.colClass")}</TableHead>
                    <TableHead className="text-right">{t("insights.mine")}</TableHead>
                    <TableHead className="text-right">{t("insights.theirs")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cur.combos.map((c) => (
                    <TableRow key={`${c.track}|${c.track_course}|${c.car_class}`}>
                      <TableCell className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <TrackFlag track={c.track} />
                          {layoutName(c)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ClassBadge carClass={c.car_class} />
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", c.mine < c.theirs && "font-semibold text-emerald-400")}>{formatTime(c.mine)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", c.theirs < c.mine && "font-semibold text-orange-400")}>{formatTime(c.theirs)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {data.history.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold">{t("insights.rivalHistory")}</p>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {data.history.map((h) => (
                    <li key={h.week} className="flex gap-3">
                      <span className="tabular-nums">{h.week}</span>
                      <span className="flex-1 truncate">{driverLabel(h.rival, t)}</span>
                      <span className="tabular-nums">
                        {h.wins} – {h.losses}
                      </span>
                      <span className="w-10 text-right tabular-nums">{h.points == null ? "—" : `+${h.points}`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        <p className="text-[11px] text-muted-foreground">{t("insights.rivalNote")}</p>
      </CardContent>
    </Card>
  );
}
