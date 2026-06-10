import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, Flame } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RaceActivityRow } from "@/lib/api";

/** Nombre de jours couverts par la heatmap (1 an glissant). */
const WINDOW_DAYS = 365;

/** Début de journée locale (00:00) pour un objet Date. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Clé jour locale `AAAA-MM-JJ` à partir d'un epoch (secondes). */
function dayKeyFromEpoch(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Clé jour locale `AAAA-MM-JJ` à partir d'un objet Date. */
function dayKey(d: Date): string {
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Nombre de jours pleins entre deux dates (a < b). */
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

interface DayCell {
  date: Date;
  key: string;
  count: number;
  /** Jour postérieur à aujourd'hui (cellule de remplissage, invisible). */
  future: boolean;
}

/** Niveau d'intensité (0–4) selon le nombre de courses dans la journée. */
function level(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return 4;
}

const LEVEL_CLASS = [
  "bg-muted/50",
  "bg-emerald-500/30",
  "bg-emerald-500/55",
  "bg-emerald-500/80",
  "bg-emerald-400",
];

/**
 * Bloc « Activité » du Profil : heatmap façon GitHub (sessions jouées par jour
 * sur les 365 derniers jours) + carte « Régularité » (séries, taux de jours
 * actifs, jour le plus chargé, plus longue période sans jouer).
 *
 * Les valeurs sont dérivées de TOUTES les sessions indexées du joueur
 * (`get_race_activity` : Practice / Qualify / Race, en ligne ou non) → un jour
 * « actif » = un jour où le joueur a joué, quel que soit le type de session.
 */
export function ProfileActivity({ races }: { races: RaceActivityRow[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "fr";

  const data = useMemo(() => {
    const today = startOfDay(new Date());
    // Fenêtre glissante : 364 jours en arrière → recalée sur un lundi pour des
    // colonnes hebdomadaires alignées (lundi en haut, façon GitHub).
    const rawStart = addDays(today, -(WINDOW_DAYS - 1));
    const mondayOffset = (rawStart.getDay() + 6) % 7; // 0 = lundi … 6 = dimanche
    const gridStart = addDays(rawStart, -mondayOffset);

    // Toutes les sessions jouées (essais / qualifs / courses) → compte par jour.
    const counts = new Map<string, number>();
    let totalSessions = 0;
    for (const r of races) {
      const ts = new Date(r.timestamp * 1000);
      if (startOfDay(ts) < gridStart || startOfDay(ts) > today) continue;
      const k = dayKeyFromEpoch(r.timestamp);
      counts.set(k, (counts.get(k) ?? 0) + 1);
      totalSessions += 1;
    }

    // Liste des jours de la grille (lundi → dimanche de la semaine courante).
    const lastDow = (today.getDay() + 6) % 7;
    const gridEnd = addDays(today, 6 - lastDow); // dimanche de la semaine courante
    const cells: DayCell[] = [];
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
      const k = dayKey(d);
      cells.push({
        date: new Date(d),
        key: k,
        count: d > today ? 0 : counts.get(k) ?? 0,
        future: d > today,
      });
    }

    // Découpage en colonnes (semaines) de 7 jours.
    const weeks: DayCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }

    // ── Régularité (jours actifs sur la fenêtre) ───────────────────────────
    const activeDayKeys = Array.from(counts.keys()).sort();
    const activeDays = activeDayKeys.length;
    const keyToDate = (k: string) => {
      const [y, m, day] = k.split("-").map(Number);
      return new Date(y, m - 1, day);
    };

    // Série actuelle : jours actifs consécutifs s'achevant à la dernière course.
    // La série reste « en cours » tant qu'un jour entier ne s'est pas écoulé sans
    // course : si la dernière course date d'aujourd'hui OU d'hier, on continue de
    // compter (la journée courante n'est pas « perdue » avant son terme). Au-delà
    // d'un jour complet sans course, la série retombe à 0.
    let currentStreak = 0;
    if (activeDays > 0) {
      const lastActive = keyToDate(activeDayKeys[activeDayKeys.length - 1]);
      if (daysBetween(lastActive, today) <= 1) {
        currentStreak = 1;
        let cursor = lastActive;
        for (let i = activeDayKeys.length - 2; i >= 0; i--) {
          const prevDay = keyToDate(activeDayKeys[i]);
          if (daysBetween(prevDay, cursor) === 1) {
            currentStreak += 1;
            cursor = prevDay;
          } else break;
        }
      }
    }

    // Meilleure série : plus longue suite de jours actifs consécutifs.
    let bestStreak = 0;
    let run = 0;
    let prev: Date | null = null;
    for (const k of activeDayKeys) {
      const [y, m, day] = k.split("-").map(Number);
      const cur = new Date(y, m - 1, day);
      if (prev && daysBetween(prev, cur) === 1) run += 1;
      else run = 1;
      if (run > bestStreak) bestStreak = run;
      prev = cur;
    }

    // Jour le plus chargé.
    let busiestCount = 0;
    let busiestKey = "";
    for (const [k, c] of counts) {
      if (c > busiestCount) {
        busiestCount = c;
        busiestKey = k;
      }
    }
    let busiestDate: Date | null = null;
    if (busiestKey) {
      const [y, m, day] = busiestKey.split("-").map(Number);
      busiestDate = new Date(y, m - 1, day);
    }

    // Plus longue période sans course (en jours), bornée par la fenêtre.
    let longestGap = 0;
    if (activeDays === 0) {
      longestGap = daysBetween(gridStart, today);
    } else {
      const first = (() => {
        const [y, m, day] = activeDayKeys[0].split("-").map(Number);
        return new Date(y, m - 1, day);
      })();
      const last = (() => {
        const [y, m, day] = activeDayKeys[activeDayKeys.length - 1]
          .split("-")
          .map(Number);
        return new Date(y, m - 1, day);
      })();
      longestGap = Math.max(daysBetween(gridStart, first), daysBetween(last, today));
      let prevDate: Date | null = null;
      for (const k of activeDayKeys) {
        const [y, m, day] = k.split("-").map(Number);
        const cur = new Date(y, m - 1, day);
        if (prevDate) {
          const gap = daysBetween(prevDate, cur) - 1;
          if (gap > longestGap) longestGap = gap;
        }
        prevDate = cur;
      }
    }

    const activeRate = (activeDays / WINDOW_DAYS) * 100;
    const avgPerActive = activeDays > 0 ? totalSessions / activeDays : 0;

    return {
      weeks,
      gridStart,
      today,
      totalSessions,
      activeDays,
      currentStreak,
      bestStreak,
      busiestCount,
      busiestDate,
      longestGap,
      activeRate,
      avgPerActive,
    };
  }, [races]);

  // ── Formatteurs localisés ────────────────────────────────────────────────
  const fmtNum = (n: number, max = 0, min = 0) =>
    new Intl.NumberFormat(lang, {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    }).format(n);
  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat(lang, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(d);

  // Libellés des jours de semaine (lundi en index 0) et des mois.
  const weekdayLabels = useMemo(() => {
    const monday = new Date(2024, 0, 1); // 1ᵉʳ janvier 2024 = lundi
    const f = new Intl.DateTimeFormat(lang, { weekday: "short" });
    return [0, 1, 2, 3, 4, 5, 6].map((i) => f.format(addDays(monday, i)));
  }, [lang]);

  const monthFmt = useMemo(
    () => new Intl.DateTimeFormat(lang, { month: "short" }),
    [lang]
  );

  // Étiquettes de mois : posées sur la colonne où le mois change.
  const monthLabels = data.weeks.map((week, idx) => {
    const first = week[0].date;
    if (idx === 0) return monthFmt.format(first);
    const prevFirst = data.weeks[idx - 1][0].date;
    return first.getMonth() !== prevFirst.getMonth() ? monthFmt.format(first) : "";
  });

  if (data.totalSessions === 0) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-mini font-bold uppercase tracking-[0.15em] text-muted-foreground">
            {t("profile.activityTitle")}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground py-6 text-center">
          {t("profile.noActivity")}
        </p>
      </Card>
    );
  }

  const regularity: {
    label: string;
    value: string;
    suffix?: string;
    hint?: string;
    accent?: string;
  }[] = [
    {
      label: t("profile.currentStreak"),
      value: fmtNum(data.currentStreak),
      suffix: t("profile.days", { count: data.currentStreak }),
    },
    {
      label: t("profile.bestStreak"),
      value: fmtNum(data.bestStreak),
      suffix: t("profile.days", { count: data.bestStreak }),
      accent: "text-emerald-500",
    },
    {
      label: t("profile.activeDayRate"),
      value: fmtNum(data.activeRate, 1),
      suffix: "%",
      hint: t("profile.activeDayRateHint"),
    },
    {
      label: t("profile.avgRacesPerActiveDay"),
      value: fmtNum(data.avgPerActive, 2, 2),
    },
    {
      label: t("profile.busiestDay"),
      value: fmtNum(data.busiestCount),
      hint: data.busiestDate
        ? `${t("profile.busiestDayUnit")} · ${fmtDate(data.busiestDate)}`
        : t("profile.busiestDayUnit"),
    },
    {
      label: t("profile.longestGap"),
      value: fmtNum(data.longestGap),
      suffix: t("profile.days", { count: data.longestGap }),
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* ── ACTIVITÉ — heatmap ────────────────────────────────────────────── */}
      <Card className="lg:col-span-3 p-5 overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-mini font-bold uppercase tracking-[0.15em] text-muted-foreground">
              {t("profile.activityTitle")}
            </h2>
            <p className="mt-1.5 text-sm font-bold">
              {t("profile.racesAcrossDays", {
                races: fmtNum(data.totalSessions),
                days: fmtNum(data.activeDays),
              })}
            </p>
            <p className="text-micro text-muted-foreground mt-0.5">
              {fmtDate(data.gridStart)} — {fmtDate(data.today)}
            </p>
          </div>
          <BarChart3 className="h-4 w-4 text-emerald-500 shrink-0" />
        </div>

        <div className="mt-4 overflow-x-auto">
          <div className="inline-flex flex-col gap-1 min-w-full">
            {/* Étiquettes des mois */}
            <div className="flex gap-[3px] pl-8">
              {monthLabels.map((m, i) => (
                <div
                  key={i}
                  className="w-[11px] text-micro text-muted-foreground"
                  style={{ minWidth: 11 }}
                >
                  {m}
                </div>
              ))}
            </div>

            {/* Grille : colonne de jours (gauche) + colonnes de semaines */}
            <div className="flex gap-[3px]">
              {/* Libellés jours (lundi / mercredi / vendredi) */}
              <div className="flex flex-col gap-[3px] pr-1 w-8 shrink-0">
                {weekdayLabels.map((wd, i) => (
                  <div
                    key={i}
                    className="h-[11px] text-micro text-muted-foreground leading-[11px]"
                  >
                    {i % 2 === 0 ? wd : ""}
                  </div>
                ))}
              </div>

              {data.weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((cell) =>
                    cell.future ? (
                      <div key={cell.key} className="h-[11px] w-[11px]" />
                    ) : (
                      <div
                        key={cell.key}
                        title={t("profile.heatmapCell", {
                          count: cell.count,
                          date: fmtDate(cell.date),
                        })}
                        className={cn(
                          "h-[11px] w-[11px] rounded-[2px]",
                          LEVEL_CLASS[level(cell.count)]
                        )}
                      />
                    )
                  )}
                </div>
              ))}
            </div>

            {/* Légende Moins → Plus */}
            <div className="flex items-center justify-end gap-1.5 mt-1 text-micro text-muted-foreground">
              <span>{t("profile.heatmapLess")}</span>
              {LEVEL_CLASS.map((c, i) => (
                <span key={i} className={cn("h-[11px] w-[11px] rounded-[2px]", c)} />
              ))}
              <span>{t("profile.heatmapMore")}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* ── RÉGULARITÉ ────────────────────────────────────────────────────── */}
      <Card className="lg:col-span-2 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-mini font-bold uppercase tracking-[0.15em] text-muted-foreground">
              {t("profile.regularityTitle")}
            </h2>
            <p className="text-micro text-muted-foreground mt-1">
              {t("profile.regularitySubtitle")}
            </p>
          </div>
          <Flame className="h-4 w-4 text-amber-500 shrink-0" />
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4">
          {regularity.map((s) => (
            <div key={s.label} className="min-w-0 flex flex-col">
              <p className="text-micro uppercase tracking-wide text-muted-foreground font-semibold leading-tight min-h-[2.6em]">
                {s.label}
              </p>
              <p
                className={cn(
                  "text-2xl font-black tabular-nums leading-none",
                  s.accent
                )}
              >
                {s.value}
                {s.suffix && (
                  <span className="text-sm font-bold opacity-70 ml-0.5">
                    {s.suffix}
                  </span>
                )}
              </p>
              {s.hint && (
                <p className="mt-1 text-micro text-muted-foreground leading-tight">
                  {s.hint}
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
