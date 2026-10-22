/**
 * Objectifs de la semaine (option « Objectifs de la semaine », désactivée par défaut) :
 * courses disputées, podiums en classe et tours valides depuis lundi 0 h, face aux
 * cibles réglées dans la Configuration. Se met à jour quand une cible change ou quand
 * de nouveaux résultats sont indexés (`refreshKey`).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { config, insights, isTauri, type WeeklyProgress } from "@/lib/api";
import { FLAG_WEEKLY_GOALS, useConfigFlag } from "@/lib/configFlag";
import { GOAL_DEFAULTS, GOAL_KEYS, goalRatio, parseGoal, weekStart, type GoalKind } from "@/lib/weeklyGoals";
import { GOALS_EVENT } from "@/components/AnalysisExtrasSettings";
import { cn } from "@/lib/utils";

export function WeeklyGoalsCard({ refreshKey }: { refreshKey?: unknown }) {
  const { t } = useTranslation();
  const on = useConfigFlag(FLAG_WEEKLY_GOALS);
  const [progress, setProgress] = useState<WeeklyProgress | null>(null);
  const [targets, setTargets] = useState<Record<GoalKind, number>>(GOAL_DEFAULTS);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener(GOALS_EVENT, bump);
    return () => window.removeEventListener(GOALS_EVENT, bump);
  }, []);

  useEffect(() => {
    if (!on || !isTauri()) return;
    let alive = true;
    void insights
      .weeklyProgress(weekStart())
      .then((p) => alive && setProgress(p))
      .catch(() => alive && setProgress(null));
    for (const k of Object.keys(GOAL_KEYS) as GoalKind[]) {
      void config.get(GOAL_KEYS[k]).then((v) => alive && setTargets((o) => ({ ...o, [k]: parseGoal(k, v) })));
    }
    return () => {
      alive = false;
    };
  }, [on, tick, refreshKey]);

  if (!on || !progress) return null;
  const goals = (Object.keys(GOAL_KEYS) as GoalKind[]).filter((k) => targets[k] > 0);
  if (goals.length === 0) return null;
  return (
    <Card>
      <CardContent className="p-3">
        <div className="mb-2 flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">{t("news.goalsCard")}</span>
          <span className="text-xs text-muted-foreground">{t("news.goalsSince")}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {goals.map((k) => {
            const done = progress[k];
            const r = goalRatio(done, targets[k]);
            return (
              <div key={k} className="space-y-1">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-muted-foreground">{t(`news.goal_${k}`)}</span>
                  <span className={cn("font-semibold tabular-nums", r >= 1 && "text-emerald-600")}>
                    {done} / {targets[k]}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-muted">
                  <div className={cn("h-full", r >= 1 ? "bg-emerald-500" : "bg-primary/70")} style={{ width: `${Math.round(r * 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
