/**
 * Profil › Succès (Atelier, opt-in) : paliers bronze / argent / or calculés
 * depuis la base locale (`lib/achievements.ts`).
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Award } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { RaceActivityRow, RecordOverviewRow } from "@/lib/api";
import { evaluateAchievements, type AchievementGroup, type AchievementInput } from "@/lib/achievements";
import { FLAG_ACHIEVEMENTS, useConfigFlag } from "@/lib/configFlag";
import { cn } from "@/lib/utils";

const GROUPS: AchievementGroup[] = ["explore", "drive", "results", "records", "habits"];
const TIER_COLOR = ["text-muted-foreground/40", "text-amber-700", "text-slate-400", "text-yellow-500"];

export function AchievementsSection(props: Omit<AchievementInput, "records" | "activity"> & { records: RecordOverviewRow[]; activity: RaceActivityRow[] }) {
  const { t } = useTranslation();
  const on = useConfigFlag(FLAG_ACHIEVEMENTS);
  const states = useMemo(() => evaluateAchievements(props), [props]);
  if (!on) return null;
  const earned = states.filter((s) => s.tier > 0).length;

  return (
    <section>
      <div className="bg-primary text-primary-foreground rounded-md mb-1.5 px-4 py-1 flex items-center justify-between">
        <h2 className="text-sm font-bold tracking-tight">{t("lab.ach.title")}</h2>
        <span className="text-xs">{t("lab.ach.count", { n: earned, total: states.length })}</span>
      </div>
      <Card className="p-3 flex flex-col gap-3">
        {GROUPS.map((g) => (
          <div key={g}>
            <p className="mb-1.5 text-micro font-bold uppercase tracking-widest text-primary">{t(`lab.ach.group.${g}`)}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {states
                .filter((s) => s.def.group === g)
                .map((s) => (
                  <div key={s.def.id} className={cn("flex items-start gap-2.5 rounded-md border border-border/60 p-2", s.tier === 0 && "opacity-70")}>
                    <Award className={cn("h-6 w-6 shrink-0", TIER_COLOR[s.tier])} aria-label={t(`lab.ach.tier.${s.tier}`)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold">{t(`lab.ach.a.${s.def.id}.name`)}</span>
                        <span className="text-micro text-muted-foreground">{t(`lab.ach.tier.${s.tier}`)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t(`lab.ach.a.${s.def.id}.desc`, { n: s.next ?? s.def.tiers[2] })}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(s.progress * 100)}%` }} />
                        </div>
                        <span className="text-micro tabular-nums text-muted-foreground">
                          {s.value}
                          {s.next != null ? ` / ${s.next}` : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
        <p className="text-micro text-muted-foreground">{t("lab.ach.hint")}</p>
      </Card>
    </section>
  );
}
