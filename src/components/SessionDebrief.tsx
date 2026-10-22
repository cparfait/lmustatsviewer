import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, ChevronDown, ChevronRight, CircleDot, ClipboardCheck, Crosshair, History, Repeat2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableTitle } from "@/components/TableTitle";
import { insights, isTauri, type BestSession, type SessionDetail } from "@/lib/api";
import { cn, formatDateTime, formatTime } from "@/lib/utils";
import { computeDebrief, type Debrief, type DefectFact } from "@/lib/debrief/compute";
import { debriefCards, type Confidence, type DebriefCard } from "@/lib/debrief/cards";
import { consistencyDots, progression, GREEN_S, YELLOW_S } from "@/lib/consistency";
import { FLAG_CONSISTENCY_DOTS, FLAG_EVIDENCE_CARDS, FLAG_BEST_SESSION, useConfigFlag } from "@/lib/configFlag";
import { sessionTypeLabel } from "@/lib/sessionLabels";
import { loadRecurring } from "@/lib/debrief/load";
import { MIN_RACES, type RecurringDefect } from "@/lib/debrief/recurring";

/** Écart signé en secondes (« +0.412 s »). */
const gap = (s: number) => `${s >= 0 ? "+" : ""}${s.toFixed(3)} s`;

/** Titre de bandeau orange avec icône, comme les autres cartes de la fiche session. */
function BarTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      {icon}
      {children}
    </span>
  );
}

/** Mesure compacte (étiquette en petites capitales + valeur à chasse fixe), style « Performance du joueur ». */
function Metric({ label, value, accent, sub }: { label: string; value: ReactNode; accent?: string; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-micro uppercase tracking-wide text-muted-foreground font-medium leading-tight">{label}</p>
      <p className={cn("mt-0.5 text-sm font-bold font-mono tabular-nums whitespace-nowrap", accent)}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Petite étiquette de section (« À TRAVAILLER »). */
function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-micro uppercase tracking-wide text-muted-foreground font-medium">{children}</p>;
}

/**
 * Débrief **calculé** de la session (sans IA) : résultat, arrêts, rythme, secteurs,
 * bascules de position, usure, incidents, familles de défaut, et le défaut qui revient
 * sur les dernières courses. Les mêmes chiffres sont joints à l'analyse du Coach IA.
 */
export function SessionDebrief({
  detail,
  onFocusLap,
  focusIsTelemetry = false,
}: {
  detail: SessionDetail;
  /** Aller au tour (numéro des résultats) : télémétrie liée, sinon onglet Tours. */
  onFocusLap?: (lap: number) => void;
  focusIsTelemetry?: boolean;
}) {
  const { t } = useTranslation();
  const d = useMemo(() => computeDebrief(detail), [detail]);
  const showCards = useConfigFlag(FLAG_EVIDENCE_CARDS);
  const showDots = useConfigFlag(FLAG_CONSISTENCY_DOTS);
  const showBest = useConfigFlag(FLAG_BEST_SESSION);
  const cards = useMemo(() => (d && showCards ? debriefCards(detail, d) : []), [detail, d, showCards]);
  const [rec, setRec] = useState<{ races: number; defect: RecurringDefect | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRec(null);
    loadRecurring()
      .then((r) => !cancelled && setRec(r))
      .catch(() => !cancelled && setRec({ races: 0, defect: null }));
    return () => {
      cancelled = true;
    };
  }, [detail.session.id]);

  if (!d) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">{t("debrief.noPlayer")}</CardContent>
      </Card>
    );
  }

  const famText = (f: DefectFact) => t(`debrief.fam_${f.family}`, f.facts as Record<string, unknown>);
  const status = t(`debrief.status_${d.status}`);

  return (
    <div className="space-y-3">
      {(showBest || showDots) && (
        <div className={cn("grid gap-3", showBest && showDots && "lg:grid-cols-2")}>
          {showBest && <BestSessionCard detail={detail} />}
          {showDots && <ConsistencyCard detail={detail} d={d} />}
        </div>
      )}

      <Card className="overflow-hidden">
        <TableTitle title={<BarTitle icon={<ClipboardCheck className="h-3.5 w-3.5" />}>{t("debrief.title")}</BarTitle>}>
          <span className="text-xs font-normal opacity-90">{t("debrief.subtitle")}</span>
        </TableTitle>
        <CardContent className="p-3 space-y-4 text-sm">
          <ul className="divide-y divide-border/60">
            <li className="py-1.5">
              {d.classPos != null
                ? t("debrief.result", { status, p: d.classPos, n: d.classCount ?? "?" })
                : t("debrief.resultNoPlace", { status })}
              {d.overallPos != null && d.classCount != null && d.overallPos !== d.classPos && (
                <span className="text-muted-foreground"> {t("debrief.overall", { p: d.overallPos })}</span>
              )}
              {d.placesGained != null && (
                <span className="text-muted-foreground">
                  {" · "}
                  {t("debrief.grid", { n: `${d.placesGained > 0 ? "+" : ""}${d.placesGained}`, from: d.gridClassPos })}
                </span>
              )}
            </li>
            {d.isRace && (
              <li className="py-1.5">
                {t("debrief.stops", { n: d.stops })}
                {d.topClassStops != null && <span className="text-muted-foreground"> · {t("debrief.topStops", { n: d.topClassStops })}</span>}
                {d.pitLossS != null && <span className="text-muted-foreground"> · {t("debrief.pitLoss", { s: d.pitLossS.toFixed(1) })}</span>}
              </li>
            )}
            {d.bestLap != null && (
              <li className="py-1.5">
                {t("debrief.best", { t: formatTime(d.bestLap) })}
                {d.classBestLap != null && (
                  <span className="text-muted-foreground"> · {t("debrief.classBest", { t: formatTime(d.classBestLap), gap: gap(d.bestLap - d.classBestLap) })}</span>
                )}
                {d.optimalLap != null && <span className="text-muted-foreground"> · {t("debrief.optimal", { t: formatTime(d.optimalLap) })}</span>}
              </li>
            )}
            {d.cleanLaps > 0 && d.medianLap != null && (
              <li className="py-1.5">
                {t("debrief.regularity", {
                  n: d.cleanLaps,
                  t: formatTime(d.medianLap),
                  pct: d.within05 != null ? Math.round(d.within05 * 100) : "?",
                })}
              </li>
            )}
            {d.sectorLosses.length > 0 && (
              <li className="py-1.5">
                {t("debrief.sectors")}{" "}
                <span className="font-mono tabular-nums">{d.sectorLosses.map((s) => `S${s.sector} ${s.lossS.toFixed(3)} s`).join(" · ")}</span>
              </li>
            )}
            {d.lastStintWearPct != null && <li className="py-1.5">{t("debrief.wear", { pct: d.lastStintWearPct.toFixed(2), n: d.lastStintLaps })}</li>}
            {(d.trackLimits > 0 || d.penalties > 0 || d.contacts > 0) && (
              <li className="py-1.5">{t("debrief.incidents", { l: d.trackLimits, p: d.penalties, c: d.contacts })}</li>
            )}
          </ul>

          {d.swings.length > 0 && (
            <div className="space-y-1">
              <SectionLabel>{t("debrief.swingsTitle")}</SectionLabel>
              <ul className="space-y-0.5">
                {[...d.swings]
                  .sort((a, b) => a.lap - b.lap)
                  .map((s) => (
                    <li key={s.lap} className={s.delta > 0 ? "text-emerald-600" : "text-amber-600"}>
                      {t("debrief.swing", { lap: s.lap, from: s.from, to: s.to })}
                      {s.cause && <span className="text-muted-foreground"> — {t(`debrief.cause_${s.cause}`)}</span>}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <div className="space-y-1.5">
            <SectionLabel>{t("debrief.familiesTitle")}</SectionLabel>
            {showCards && cards.length > 0 ? (
              <div className="grid gap-2 lg:grid-cols-2">
                {cards.map((c) => (
                  <EvidenceCard
                    key={c.family}
                    card={c}
                    headline={famText(d.families.find((f) => f.family === c.family)!)}
                    onFocusLap={onFocusLap}
                    focusIsTelemetry={focusIsTelemetry}
                  />
                ))}
              </div>
            ) : d.families.length ? (
              <div className="flex flex-wrap gap-1.5">
                {d.families.map((f) => (
                  <span key={f.family} className="rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-xs">
                    {famText(f)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">{t("debrief.familiesNone")}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <TableTitle title={<BarTitle icon={<Repeat2 className="h-3.5 w-3.5" />}>{t("debrief.recurringTitle")}</BarTitle>} />
        <CardContent className="p-3 text-sm">
          {rec == null ? (
            <p className="text-muted-foreground">{t("debrief.loading")}</p>
          ) : rec.defect ? (
            <p>
              {t("debrief.recurring", {
                what: t(`debrief.recurName_${rec.defect.family}`),
                occ: rec.defect.occurrences,
                n: rec.defect.races,
              })}
              {rec.defect.trend && <span className="text-muted-foreground"> · {t(`debrief.trend_${rec.defect.trend}`)}</span>}
            </p>
          ) : rec.races < MIN_RACES ? (
            <p className="text-muted-foreground">{t("debrief.recurringFew", { n: rec.races, min: MIN_RACES })}</p>
          ) : (
            <p className="text-muted-foreground">{t("debrief.recurringNone")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Pastille de confiance, au format des badges de l'en-tête de session. */
const CONF_CLS: Record<Confidence, string> = {
  high: "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  medium: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "border-border bg-muted text-muted-foreground",
};

/** Une famille de défaut : titre, confiance, explication, preuves dépliables, tour à voir. */
function EvidenceCard({
  card,
  headline,
  onFocusLap,
  focusIsTelemetry,
}: {
  card: DebriefCard;
  headline: string;
  onFocusLap?: (lap: number) => void;
  focusIsTelemetry: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border border-l-4 border-l-amber-500 bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold leading-tight">{headline}</p>
        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold", CONF_CLS[card.confidence])}>
          {t(`cards.conf_${card.confidence}`)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{t(`cards.why_${card.family}`)}</p>
      {open && (
        <ul className="list-disc space-y-0.5 rounded-md bg-muted/40 py-2 pl-7 pr-2 text-xs">
          {card.evidence.map((e, i) => (
            <li key={i}>{t(`cards.ev_${e.key}`, e.params)}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {card.evidence.length > 0 && (
          <Button size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="h-7 gap-1 px-2 text-xs">
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {open ? t("cards.hideEvidence") : t("cards.showEvidence")}
          </Button>
        )}
        {card.focusLap != null && onFocusLap && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onFocusLap(card.focusLap!)}
            className="h-7 gap-1 px-2 text-xs text-primary"
            title={focusIsTelemetry ? t("cards.focusTelemetryHint") : t("cards.focusLapsHint")}
          >
            <Crosshair className="h-3.5 w-3.5" />
            {t("cards.focusLap", { n: card.focusLap })}
          </Button>
        )}
      </div>
    </div>
  );
}

const DOT_CLS = { green: "bg-emerald-500", yellow: "bg-yellow-400", red: "bg-red-500" } as const;

/** Une pastille par tour lancé (écart au meilleur) + la phrase de progression. */
function ConsistencyCard({ detail, d }: { detail: SessionDetail; d: Debrief }) {
  const { t, i18n } = useTranslation();
  const myLaps = useMemo(() => detail.laps.filter((l) => l.driver_name === d.driver), [detail, d.driver]);
  const dots = useMemo(() => consistencyDots(myLaps), [myLaps]);
  const prog = useMemo(() => progression(myLaps), [myLaps]);
  if (!dots && !prog) return null;
  const num = (v: number) => v.toLocaleString(i18n.language);
  return (
    <Card className="overflow-hidden">
      <TableTitle title={<BarTitle icon={<CircleDot className="h-3.5 w-3.5" />}>{t("cards.dotsTitle")}</BarTitle>} />
      <CardContent className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {dots && (
            <Metric
              label={t("cards.withinLabel", { s: num(GREEN_S) })}
              value={`${dots.green} / ${dots.total}`}
              accent={dots.green === dots.total ? "text-success" : dots.green * 2 >= dots.total ? "" : "text-amber-600"}
              sub={t("cards.withinSub")}
            />
          )}
          {prog && (
            <Metric
              label={t("cards.progressLabel")}
              value={t("cards.lapN", { n: prog.bestLap })}
              accent="text-success"
              sub={
                prog.gain != null && prog.firstLap != null
                  ? t("cards.progressSub", { gain: prog.gain.toFixed(3), first: prog.firstLap })
                  : t("cards.progressSubFirst")
              }
            />
          )}
        </div>
        {dots && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5" role="list">
              {dots.dots.map((x) => (
                <div
                  key={x.lap}
                  role="listitem"
                  className="flex w-9 flex-col items-center gap-0.5 rounded-md border border-border/60 py-1"
                  title={t("cards.dotTip", { lap: x.lap, gap: x.gap.toFixed(3) })}
                >
                  <span className={cn("h-2.5 w-2.5 rounded-full", DOT_CLS[x.color])} />
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">T{x.lap}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{t("cards.dotsLegend", { g: num(GREEN_S), y: num(YELLOW_S) })}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Écart signé à la meilleure session (s) : vert si plus rapide. */
function diffAccent(cur: number | null, prev: number | null): { text: string; cls: string } {
  if (cur == null || prev == null) return { text: "—", cls: "text-muted-foreground" };
  const g = cur - prev;
  return { text: gap(g), cls: g < -0.0005 ? "text-success" : g > 0.0005 ? "text-amber-600" : "" };
}

/**
 * Meilleure autre session sur le même circuit, même tracé, même voiture : écart de
 * meilleur tour et de tour médian ; « nouveau record » si cette session la bat.
 */
function BestSessionCard({ detail }: { detail: SessionDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [prev, setPrev] = useState<BestSession | null | undefined>(undefined);
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    setPrev(undefined);
    insights
      .bestSession(detail.session.id)
      .then((p) => alive && setPrev(p))
      .catch(() => alive && setPrev(null));
    return () => {
      alive = false;
    };
  }, [detail.session.id]);
  const me = detail.results.find((r) => r.is_player);
  if (prev === undefined || !me) return null;
  const best = prev ? diffAccent(me.best_lap, prev.best_lap) : null;
  const median = prev ? diffAccent(me.median_lap, prev.median_lap) : null;
  return (
    <Card className="overflow-hidden">
      <TableTitle title={<BarTitle icon={<History className="h-3.5 w-3.5" />}>{t("cards.bestTitle")}</BarTitle>}>
        {prev && (
          <button
            type="button"
            onClick={() => navigate(`/sessions/${prev.session_id}`)}
            className="inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
          >
            {t("cards.bestWhich", { date: formatDateTime(prev.timestamp), type: sessionTypeLabel(prev.session_type, t) })}
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </TableTitle>
      <CardContent className="p-3">
        {prev == null ? (
          <p className="text-sm text-muted-foreground">{t("cards.bestNone")}</p>
        ) : (
          <div className="space-y-2">
          {me.best_lap != null && prev.best_lap != null && me.best_lap < prev.best_lap - 0.0005 && (
            <p className="inline-flex items-center gap-1 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              {t("cards.bestRecord")}
            </p>
          )}
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <Metric
              label={t("cards.prevBest")}
              value={best!.text}
              accent={best!.cls}
              sub={prev.best_lap != null ? t("cards.bestWas", { t: formatTime(prev.best_lap) }) : undefined}
            />
            <Metric
              label={t("cards.prevMedian")}
              value={median!.text}
              accent={median!.cls}
              sub={prev.median_lap != null ? t("cards.bestWas", { t: formatTime(prev.median_lap) }) : undefined}
            />
          </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
