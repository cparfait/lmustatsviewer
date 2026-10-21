/**
 * Comparaison de setups › Analyse détaillée par règles de dynamique (toujours
 * visible, sans IA) : bilan par phase, « A pour… / B pour… », puis chaque écart
 * avec son effet, rangé par thème (`lib/setupCompareRules.ts`).
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowDown, ArrowUp, Calculator, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { SetupDiffSection } from "@/lib/api";
import { AXIS_PHASE, THEMES, TREND_STRONG, compareByRules, isNeutralRule, type Axis, type RuleChange } from "@/lib/setupCompareRules";

/** Règles dont l'explication existe déjà pour les profils (`lab.profiles.why.*`). */
const PROFILE_WHY = new Set(["frontArb", "rearArb", "frontWing", "rearWing", "rearBrake", "diffPower", "diffCoast", "diffPreload", "tc", "frontSprings", "rearSprings", "frontRide", "rearRide"]);

export interface RulesSide {
  car: string;
  circuit: string;
}

export function SetupCompareRulesPanel({ diffs, a, b }: { diffs: SetupDiffSection[]; a: RulesSide; b: RulesSide }) {
  const { t } = useTranslation();
  const r = useMemo(() => compareByRules(diffs), [diffs]);

  const name = (c: Pick<RuleChange, "id" | "variant">) => t(`lab.cmp.name.${c.id}`) + (c.variant ? ` · ${t(`lab.cmp.variant.${c.variant}`, { defaultValue: c.variant })}` : "");
  // Sans sens mesurable, ou règle descriptive : texte « modifié » de la règle.
  const effect = (c: RuleChange) => {
    if (c.dir === 0 || isNeutralRule(c.id)) return t(`lab.cmp.fx.${c.id}.changed`, { defaultValue: t("lab.cmp.fx.generic") });
    const way = c.dir > 0 ? "up" : "down";
    return PROFILE_WHY.has(c.id) ? t(`lab.profiles.why.${c.id}.${way}`) : t(`lab.cmp.fx.${c.id}.${way}`);
  };
  const phases = (c: RuleChange) => [...new Set((Object.keys(c.effects) as Axis[]).map((ax) => AXIS_PHASE[ax]).filter(Boolean))] as string[];
  const traits = (sign: 1 | -1) =>
    r.preferB.map((p) => t(`lab.cmp.trait.${p.axis}.${p.sign * sign > 0 ? "pos" : "neg"}`)).join(", ");
  const byNames = (ids: string[]) => ids.slice(0, 4).map((id) => t(`lab.cmp.name.${id}`)).join(", ");
  const total = r.changes.length + r.others.length;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 text-sm">
        <div>
          <p className="inline-flex items-center gap-1.5 font-semibold">
            <Calculator className="h-4 w-4 text-primary" />
            {t("lab.cmp.title")}
          </p>
          <p className="text-xs text-muted-foreground">{t("lab.cmp.intro")}</p>
        </div>

        {(a.circuit !== b.circuit || a.car !== b.car) && (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            {a.car !== b.car ? t("lab.cmp.diffCars", { a: a.car, b: b.car }) : t("lab.cmp.diffTracks", { a: a.circuit, b: b.circuit })}
          </p>
        )}

        {total === 0 ? (
          <p className="text-muted-foreground">{t("lab.cmp.none")}</p>
        ) : (
          <>
            {/* Bilan : ce que B change par rapport à A */}
            <section>
              <h4 className="mb-1 text-micro font-bold uppercase tracking-wide text-primary">{t("lab.cmp.summaryTitle")}</h4>
              {r.trends.length === 0 ? (
                <p className="text-muted-foreground">{t("lab.cmp.noTrend")}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {r.trends.map((tr) => (
                    <li key={tr.axis} className="flex items-start gap-2">
                      {tr.score > 0 ? <ArrowUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> : <ArrowDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" />}
                      <span>
                        <strong>B</strong> {t(`lab.cmp.axis.${tr.axis}.${tr.score > 0 ? "pos" : "neg"}`)}
                        {Math.abs(tr.score) >= TREND_STRONG && (
                          <span className="ml-1.5 rounded bg-primary/15 px-1.5 text-micro font-semibold uppercase tracking-wide text-primary">{t("lab.cmp.strong")}</span>
                        )}
                        <span className="text-xs text-muted-foreground"> — {t("lab.cmp.via", { list: byNames(tr.by) })}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {r.preferB.length > 0 && (
              <section className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div className="rounded-md border border-border/60 p-2">
                  <span className="mr-1.5 rounded bg-primary/15 px-1.5 font-bold text-primary">A</span>
                  {t("lab.cmp.choose", { traits: traits(-1) })}
                </div>
                <div className="rounded-md border border-border/60 p-2">
                  <span className="mr-1.5 rounded bg-sky-500/15 px-1.5 font-bold text-sky-600">B</span>
                  {t("lab.cmp.choose", { traits: traits(1) })}
                </div>
              </section>
            )}

            {/* Détail par thème */}
            <section className="flex flex-col gap-3">
              <h4 className="text-micro font-bold uppercase tracking-wide text-primary">{t("lab.cmp.detailTitle", { count: r.changes.length })}</h4>
              {THEMES.filter((th) => r.changes.some((c) => c.theme === th)).map((th) => (
                <div key={th}>
                  <p className="mb-1 text-xs font-semibold">{t(`lab.cmp.theme.${th}`)}</p>
                  <ul className="flex flex-col gap-1.5">
                    {r.changes
                      .filter((c) => c.theme === th)
                      .map((c, i) => (
                        <li key={`${c.key}${i}`} className="rounded-md border border-border/50 p-2">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                            <span className="inline-flex items-center gap-1.5 font-medium" title={c.key}>
                              {c.dir > 0 ? <ArrowUp className="h-3.5 w-3.5 text-primary" /> : c.dir < 0 ? <ArrowDown className="h-3.5 w-3.5 text-sky-600" /> : <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
                              {name(c)}
                            </span>
                            <span className="font-mono text-xs tabular-nums">
                              {c.a} → {c.b}
                              {c.steps ? <span className="text-muted-foreground"> ({t("lab.cmp.steps", { count: c.steps })})</span> : null}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{effect(c)}</p>
                          {phases(c).length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {phases(c).map((ph) => (
                                <span key={ph} className="rounded bg-muted px-1.5 py-0.5 text-micro uppercase tracking-wide">
                                  {ph === "fast" ? t("lab.cmp.fast") : t(`lab.plates.phase.${ph}`)}
                                </span>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </section>

            {r.others.length > 0 && (
              <section>
                <h4 className="mb-1 text-micro font-bold uppercase tracking-wide text-primary">{t("lab.cmp.otherTitle")}</h4>
                <ul className="flex flex-col gap-0.5 text-xs">
                  {r.others.map((o, i) => (
                    <li key={`${o.section}${o.key}${i}`} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">
                        [{o.section}] {o.key}
                      </span>
                      <span className="font-mono">
                        {o.a} → {o.b}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
