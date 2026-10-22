/**
 * Encarts du détail d'une séance ajoutés par la veille du 2026-10-17, chacun derrière
 * son interrupteur (Configuration › Préférences › Détail des séances), désactivés par défaut :
 * - `ComparableBadge` : la séance se prête-t-elle à la comparaison (en ligne, serveur
 *   dédié, sans aide au freinage ni à la direction) ;
 * - `RegularityPanel` : régularité du joueur (écart-type, tours proches du meilleur,
 *   secteur le moins stable) ;
 * - `ReviewMarksPanel` : repères posés au volant pendant la séance.
 */
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BadgeCheck, BadgeAlert, Bookmark } from "lucide-react";
import type { LapRow, ResultRow, SessionInfo } from "@/lib/api";
import { FLAG_COMPARABLE, useConfigFlag } from "@/lib/configFlag";
import { comparability, computeRegularity } from "@/lib/regularity";
import { loadMarks, marksForSession, useMarksStore } from "@/lib/reviewMarks";
import { cn, formatTime } from "@/lib/utils";


export function ComparableBadge({ session, player }: { session: SessionInfo; player: ResultRow | null }) {
  const { t } = useTranslation();
  const on = useConfigFlag(FLAG_COMPARABLE);
  if (!on) return null;
  const c = comparability(session, player);
  const rows = [
    { ok: c.online, label: c.online ? t("extras.cmpOnline") : t("extras.cmpOffline") },
    {
      ok: c.dedicated !== false,
      label:
        c.dedicated == null
          ? t("extras.cmpServerUnknown")
          : c.dedicated
            ? t("extras.cmpDedicated", { name: session.server_name || "—" })
            : t("extras.cmpHosted"),
    },
    { ok: c.cleanAids, label: c.cleanAids ? t("extras.cmpCleanAids") : t("extras.cmpAids") },
  ];
  const Icon = c.ok ? BadgeCheck : BadgeAlert;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        c.ok
          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      )}
      title={rows.map((r) => `${r.ok ? "✓" : "✗"} ${r.label}`).join("\n") + "\n" + t("extras.cmpNote")}
    >
      <Icon className="h-3.5 w-3.5" />
      {c.ok ? t("extras.comparable") : t("extras.notComparable")}
    </span>
  );
}

function pct(v: number): string {
  return `${Math.round(v * 100)} %`;
}

/** Verdict lisible à partir de l'écart-type des tours (s). */
function verdict(std: number): { key: string; cls: string } {
  if (std < 0.4) return { key: "regVerdict1", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" };
  if (std < 0.8) return { key: "regVerdict2", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" };
  if (std < 1.5) return { key: "regVerdict3", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" };
  return { key: "regVerdict4", cls: "bg-red-500/15 text-red-700 dark:text-red-300" };
}

export function RegularityPanel({ laps }: { laps: LapRow[] }) {
  const { t } = useTranslation();
  const r = useMemo(() => computeRegularity(laps), [laps]);
  if (!r) return <p className="py-6 text-center text-sm text-muted-foreground">{t("extras.regNotEnough")}</p>;
  const v = verdict(r.stdDev);
  const stats = [
    { label: t("extras.regBest"), value: formatTime(r.best) },
    { label: t("extras.regMedian"), value: formatTime(r.median), hint: t("extras.regMedianHint") },
    { label: t("extras.regStd"), value: `± ${r.stdDev.toFixed(3)} s`, badge: v },
    { label: t("extras.regLaps"), value: String(r.laps) },
  ];
  const bands = [
    { d: "0.3", v: r.within["0.3"] },
    { d: "0.5", v: r.within["0.5"] },
    { d: "1.0", v: r.within["1.0"] },
  ];
  return (
    <div className="space-y-5">
      {/* À quoi sert l'onglet */}
      <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{t("extras.regIntro")}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-md border border-border p-3">
            <p className="text-micro uppercase tracking-widest text-muted-foreground">{s.label}</p>
            <p className="text-lg font-semibold tabular-nums">{s.value}</p>
            {s.badge && (
              <span className={cn("mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold", s.badge.cls)}>
                {t(`extras.${s.badge.key}`)}
              </span>
            )}
            {s.hint && <p className="mt-1 text-[11px] text-muted-foreground">{s.hint}</p>}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-sm font-semibold">{t("extras.regWithinTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("extras.regWithinHint")}</p>
        </div>
        {bands.map((b) => (
          <div key={b.d} className="flex items-center gap-3 text-sm">
            <span className="w-32 shrink-0 whitespace-nowrap text-muted-foreground">
              {t("extras.regWithin", { d: b.d.replace(".", ",") })}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
              {/* Largeur CSS sans espace (« 25% ») : « 25 % » est ignoré par le navigateur. */}
              <div className="h-full bg-emerald-500/70" style={{ width: `${Math.round(b.v * 100)}%` }} />
            </div>
            <span className="w-12 text-right tabular-nums">{pct(b.v)}</span>
          </div>
        ))}
      </div>

      {r.sectorStd.some((x) => x != null) && (
        <div className="space-y-2">
          <div>
            <p className="text-sm font-semibold">{t("extras.regSectors")}</p>
            <p className="text-xs text-muted-foreground">{t("extras.regSectorsHint")}</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {r.sectorStd.map((x, i) => {
              const unstable = r.unstableSector === i + 1;
              const stable = r.stableSector === i + 1;
              return (
                <div
                  key={i}
                  className={cn(
                    "rounded-md border p-3",
                    unstable ? "border-amber-500/50 bg-amber-500/5" : stable ? "border-emerald-500/50 bg-emerald-500/5" : "border-border",
                  )}
                >
                  <p className="text-micro uppercase tracking-widest text-muted-foreground">S{i + 1}</p>
                  <p className="text-base font-semibold tabular-nums">{x == null ? "—" : `± ${x.toFixed(3)} s`}</p>
                  {unstable && <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">{t("extras.regUnstable")}</p>}
                  {stable && <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">{t("extras.regStable")}</p>}
                </div>
              );
            })}
          </div>
          {r.unstableSector && <p className="text-xs text-muted-foreground">{t("extras.regWork", { n: r.unstableSector })}</p>}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">{t("extras.regNote")}</p>
    </div>
  );
}

export function ReviewMarksPanel({ session, isRace }: { session: SessionInfo; isRace: boolean }) {
  const { t } = useTranslation();
  const marks = useMarksStore((s) => s.marks);
  useEffect(() => {
    void loadMarks();
  }, []);
  const mine = useMemo(
    () =>
      marksForSession(
        marks,
        session.track,
        session.timestamp,
        session.session_minutes > 0 ? session.session_minutes * 60 : 3 * 3600,
        isRace,
      ),
    [marks, session, isRace],
  );
  if (mine.length === 0) return null;
  return (
    <div className="mb-4 rounded-lg border border-border bg-card/40 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Bookmark className="h-4 w-4 text-primary" />
        {t("extras.marksTitle", { count: mine.length })}
      </p>
      <ul className="space-y-1 text-xs">
        {mine.map((m) => (
          <li key={m.t} className="flex flex-wrap gap-x-4 tabular-nums">
            <span>{new Date(m.t).toLocaleTimeString()}</span>
            <span>{t("extras.markLap", { lap: m.lap })}</span>
            <span className="text-muted-foreground">{t("extras.markAt", { m: Math.round(m.lapDist) })}</span>
            <span className="text-muted-foreground">{t("extras.markClock", { time: formatClock(m.sessionTime) })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}
