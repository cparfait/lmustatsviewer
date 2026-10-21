import { Link } from "react-router";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { type SetupGroup, type SetupDiffSection, setups as setupsApi } from "@/lib/api";
import { ArrowLeft, ArrowLeftRight, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClassBadge } from "@/components/ClassBadge";
import { CarLogo } from "@/components/CarLogo";
import { SetupCompareAiPanel } from "@/components/SetupCompareAiPanel";
import { SetupPicker } from "@/components/SetupPicker";
import { SetupCompareRulesPanel } from "@/components/SetupCompareRulesPanel";
import { SetupMixBar } from "@/components/SetupMixBar";
import { diffIds, pickId } from "@/lib/setupMix";

// ── Helpers ──────────────────────────────────────────────────────────────────

function findSetupInfo(groups: SetupGroup[], id: number | null) {
  if (!id) return null;
  for (const g of groups) {
    for (const track of g.tracks) {
      const s = track.setups.find((s) => s.id === id);
      if (s) return { setup: s, car: g.car, car_class: g.car_class, circuit: track.name };
    }
  }
  return null;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function SetupCompare() {
  const { t } = useTranslation();
  const [allGroups, setAllGroups] = useState<SetupGroup[]>([]);
  const [selectedA, setSelectedA] = useState<number | null>(null);
  const [selectedB, setSelectedB] = useState<number | null>(null);
  const [diffs, setDiffs] = useState<SetupDiffSection[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  // Réglages pris de B pour un setup mixte (vidés à chaque nouvelle comparaison).
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => setPicked(new Set()), [diffs]);
  const pick = (ids: string[], fromB: boolean) =>
    setPicked((cur) => {
      const n = new Set(cur);
      for (const id of ids) {
        if (fromB) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  useEffect(() => { loadSetups(); }, []);

  async function loadSetups() {
    setLoading(true);
    try {
      const data = await setupsApi.list();
      setAllGroups(
        [...data].sort((a, b) => {
          const cls = a.car_class.localeCompare(b.car_class);
          return cls !== 0 ? cls : a.car.localeCompare(b.car);
        })
      );
    } catch {
      setAllGroups([]);
    } finally {
      setLoading(false);
    }
  }

  async function runCompare(a: number, b: number) {
    setComparing(true);
    try {
      setDiffs(await setupsApi.compare(a, b));
    } catch {
      setDiffs(null);
    } finally {
      setComparing(false);
    }
  }

  async function handleCompare() {
    if (!selectedA || !selectedB) return;
    await runCompare(selectedA, selectedB);
  }

  // Inverser A et B : si une comparaison est affichée, elle est refaite aussitôt
  // dans l'autre sens (plutôt que d'effacer le résultat).
  function handleSwap() {
    const a = selectedB;
    const b = selectedA;
    setSelectedA(a);
    setSelectedB(b);
    if (diffs && a && b) void runCompare(a, b);
    else setDiffs(null);
  }

  const totalDiffs = diffs
    ? diffs.reduce((acc, s) => acc + s.params.filter((p) => p.is_diff).length, 0)
    : 0;

  const infoA = findSetupInfo(allGroups, selectedA);
  const infoB = findSetupInfo(allGroups, selectedB);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* En-tête */}
      <div>
        <Link to="/setups" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="h-3 w-3" /> {t("setupCompare.backToSetups")}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("setupCompare.title")}</h1>
      </div>

      {/* Sélecteur A / B */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            {/* Setup A */}
            <SetupPicker
              side="A"
              groups={allGroups}
              selected={selectedA}
              other={infoB}
              onSelect={(id) => { setSelectedA(id); setDiffs(null); }}
            />

            {/* Bouton swap central */}
            <div className="flex flex-col items-center gap-1 pt-4 shrink-0">
              <button
                onClick={handleSwap}
                disabled={!selectedA && !selectedB}
                title={t("setupCompare.swap")}
                aria-label={t("setupCompare.swap")}
                className="p-2 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </button>
            </div>

            {/* Setup B */}
            <SetupPicker
              side="B"
              groups={allGroups}
              selected={selectedB}
              other={infoA}
              onSelect={(id) => { setSelectedB(id); setDiffs(null); }}
            />
          </div>

          {/* Barre d'action */}
          <div className="flex items-center justify-end gap-3 mt-5 pt-4 border-t border-border/60">
            {diffs && (
              <Badge variant="default" className="gap-1.5">
                <AlertTriangle className="h-3 w-3" />
                {totalDiffs} {totalDiffs === 1 ? t("setupCompare.diffs") : t("setupCompare.diffs_many")}
              </Badge>
            )}
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleCompare}
              disabled={!selectedA || !selectedB || comparing}
            >
              {comparing
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ArrowLeftRight className="h-4 w-4" />}
              {t("setupCompare.compare")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Analyse IA des écarts (seulement si le Coach IA est configuré) : en tête. */}
      {diffs && infoA && infoB && selectedA && selectedB && (
        <SetupCompareAiPanel
          idA={selectedA}
          idB={selectedB}
          diffs={diffs}
          a={{ name: infoA.setup.name, car: infoA.car, carClass: infoA.car_class, circuit: infoA.circuit, setupType: infoA.setup.setup_type, bestLap: infoA.setup.best_lap }}
          b={{ name: infoB.setup.name, car: infoB.car, carClass: infoB.car_class, circuit: infoB.circuit, setupType: infoB.setup.setup_type, bestLap: infoB.setup.best_lap }}
        />
      )}

      {/* Analyse détaillée par règles de dynamique (toujours, sans IA). */}
      {diffs && infoA && infoB && (
        <SetupCompareRulesPanel diffs={diffs} a={{ car: infoA.car, circuit: infoA.circuit }} b={{ car: infoB.car, circuit: infoB.circuit }} />
      )}

      {/* Résultats diff */}
      {diffs && (
        <Card>
          {/* Résumé visuel A vs B */}
          <div className="px-4 pt-4 pb-2 flex items-center gap-4 border-b border-border/60">
            <SetupChip info={infoA} label="A" />
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground shrink-0" />
            <SetupChip info={infoB} label="B" />
          </div>

          <CardContent className="p-2">
            <Accordion
              type="multiple"
              defaultValue={diffs.filter((s) => s.params.some((p) => p.is_diff)).map((s) => s.name)}
              className="w-full"
            >
              {diffs.map((section) => {
                const diffCount = section.params.filter((p) => p.is_diff).length;
                return (
                  <AccordionItem key={section.name} value={section.name} className="last:border-0">
                    <AccordionTrigger>
                      <div className="flex items-center gap-3">
                        <span>{section.name}</span>
                        <Badge
                          variant={diffCount > 0 ? "default" : "secondary"}
                          className="font-mono text-micro"
                        >
                          {diffCount} {diffCount === 1 ? t("setupCompare.diff") : t("setupCompare.diff_many")}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      {diffCount > 0 && (
                        <div className="mb-1.5 flex justify-end gap-1.5 text-xs">
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => pick(diffIds(section), false)}>
                            {t("setupCompare.allA")}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => pick(diffIds(section), true)}>
                            {t("setupCompare.allB")}
                          </Button>
                        </div>
                      )}
                      <div className="overflow-hidden rounded-md border border-border/60">
                        <Table className="w-full text-sm">
                          <TableHeader className="bg-primary/15 dark:bg-primary/10">
                            <TableRow>
                              <TableHead className="text-left px-3 py-2 font-medium text-yellow-900 dark:text-yellow-100 text-xs uppercase tracking-wide">
                                {t("setupCompare.parameter")}
                              </TableHead>
                              <TableHead className="text-right px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide w-32">A</TableHead>
                              <TableHead className="w-8" />
                              <TableHead className="text-right px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide w-32">B</TableHead>
                              <TableHead className="w-8" />
                              <TableHead className="px-2 py-2 text-center font-medium text-muted-foreground text-xs uppercase tracking-wide w-24">
                                {t("setupCompare.keep")}
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {section.params.map((p, i) => (
                              <TableRow key={i} className={cn("border-t border-border/40", p.is_diff && "bg-primary/5")}>
                                <TableCell className="px-3 py-2">
                                  <span className="text-muted-foreground">{p.key}</span>
                                  {p.comment_a && (
                                    <span className="block text-xs text-muted-foreground/60">{p.comment_a}</span>
                                  )}
                                </TableCell>
                                <TableCell className="px-3 py-2 font-mono text-right">{p.value_a}</TableCell>
                                <TableCell className="px-1 py-2 text-center text-muted-foreground">{p.is_diff ? "→" : ""}</TableCell>
                                <TableCell className={cn("px-3 py-2 font-mono text-right", p.is_diff && "text-primary font-semibold")}>
                                  {p.value_b}
                                </TableCell>
                                <TableCell className="px-2 py-2">{p.is_diff && <span className="text-primary text-xs">●</span>}</TableCell>
                                <TableCell className="px-2 py-1.5 text-center">
                                  {p.is_diff && (
                                    <div className="inline-flex overflow-hidden rounded-md border border-border text-xs font-bold" role="group" aria-label={t("setupCompare.keep")}>
                                      {(["A", "B"] as const).map((side) => {
                                        const on = picked.has(pickId(section.name, p.key)) === (side === "B");
                                        return (
                                          <button
                                            key={side}
                                            type="button"
                                            aria-pressed={on}
                                            onClick={() => pick([pickId(section.name, p.key)], side === "B")}
                                            className={cn("px-2 py-0.5 transition-colors", on ? (side === "A" ? "bg-primary/20 text-primary" : "bg-sky-500/20 text-sky-600") : "text-muted-foreground hover:bg-accent/60")}
                                          >
                                            {side}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* Setup mixte : copie de A avec les réglages pris de B. */}
      {diffs && selectedA && selectedB && (
        <SetupMixBar idA={selectedA} idB={selectedB} diffs={diffs} picked={picked} sameCar={!!infoA && !!infoB && infoA.car === infoB.car} circuits={allGroups.flatMap((g) => g.tracks.map((tr) => tr.name))} />
      )}
    </div>
  );
}

// ── Chip résumé (dans la barre de résultats) ─────────────────────────────────

function SetupChip({
  info,
  label,
}: {
  info: ReturnType<typeof findSetupInfo>;
  label: string;
}) {
  if (!info) return null;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded text-micro font-bold",
        label === "A" ? "bg-primary/20 text-primary" : "bg-sky-500/20 text-sky-400"
      )}>
        {label}
      </span>
      <CarLogo carName={info.car} className="h-3.5 w-auto object-contain opacity-80 shrink-0" />
      <ClassBadge carClass={info.car_class} solid />
      <span className="text-xs font-mono font-medium truncate">{info.setup.name}</span>
    </div>
  );
}
