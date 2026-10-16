import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Award, CalendarRange } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { isTauri, queries, type CareerRace } from "@/lib/api";
import { usePageState } from "@/lib/usePageState";
import { filterRaces, highlights, recurring, summarize, type OnlineFilter } from "@/lib/career";

const fmtDate = (ts: number, lang: string) => new Date(ts * 1000).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" });

/**
 * Section « Saison » de la page Profil (ex-page Carrière) : ce que le bilan du
 * Profil ne montre pas — temps forts, défaut récurrent, progression (5 premières
 * courses contre 5 dernières). Les filtres année / en ligne / classe cadrent la
 * période. (Carte récap et championnats retirés du Profil le 2026-10-16, à la
 * demande du mainteneur ; leur logique reste dans `lib/career.ts` et `lib/wrappedCard.ts`.)
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
      {/* Largeur au contenu, comme les filtres des autres pages (rien de tronqué). */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={year}
          onValueChange={setYear}
          ariaLabel={t("career.year")}
          options={[{ value: "all", label: t("career.allTime") }, ...years.map((y) => ({ value: String(y), label: String(y) }))]}
        />
        <Select
          value={online}
          onValueChange={(v) => setOnline(v as OnlineFilter)}
          ariaLabel={t("career.all")}
          options={[
            { value: "all", label: t("career.all") },
            { value: "online", label: t("career.online") },
            { value: "offline", label: t("career.offline") },
          ]}
        />
        <Select value={cls} onValueChange={setCls} ariaLabel={t("career.allClasses")} options={[{ value: "", label: t("career.allClasses") }, ...classes.map((c) => ({ value: c, label: c }))]} />
      </div>

      {list.length === 0 ? (
        <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">{t("career.empty")}</CardContent>
        </Card>
      ) : (
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
      )}
    </section>
  );
}

