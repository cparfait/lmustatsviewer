import { Link } from "react-router";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { type SetupSummary, type SetupDiffSection, setups as setupsApi } from "@/lib/api";
import { ArrowLeft, ArrowLeftRight, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function SetupCompare() {
  const { t } = useTranslation();
  const [allSetups, setAllSetups] = useState<SetupSummary[]>([]);
  const [selectedA, setSelectedA] = useState<number | null>(null);
  const [selectedB, setSelectedB] = useState<number | null>(null);
  const [diffs, setDiffs] = useState<SetupDiffSection[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    loadSetups();
  }, []);

  async function loadSetups() {
    setLoading(true);
    try {
      const data = await setupsApi.list();
      const flat = data.flatMap((g) => g.tracks.flatMap((t) => t.setups));
      setAllSetups(flat);
    } catch {
      setAllSetups([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleCompare() {
    if (!selectedA || !selectedB) return;
    setComparing(true);
    try {
      const result = await setupsApi.compare(selectedA, selectedB);
      setDiffs(result);
    } catch {
      setDiffs(null);
    } finally {
      setComparing(false);
    }
  }

  const setupName = (id: number | null) => {
    if (!id) return t("setupCompare.choose");
    return allSetups.find((s) => s.id === id)?.name ?? `#${id}`;
  };

  const totalDiffs = diffs
    ? diffs.reduce((acc, s) => acc + s.params.filter((p) => p.is_diff).length, 0)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/setups" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="h-3 w-3" /> {t("setupCompare.backToSetups")}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("setupCompare.title")}</h1>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <SetupPick
                label="A"
                name={setupName(selectedA)}
                setups={allSetups}
                selected={selectedA}
                onSelect={setSelectedA}
              />
              <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />
              <SetupPick
                label="B"
                name={setupName(selectedB)}
                setups={allSetups}
                selected={selectedB}
                onSelect={setSelectedB}
              />
            </div>
            <div className="flex items-center gap-3">
              {diffs && (
                <Badge variant="default" className="gap-1.5">
                  <AlertTriangle className="h-3 w-3" />
                  {totalDiffs === 1 ? t("setupCompare.diffs") : t("setupCompare.diffs_many")}
                </Badge>
              )}
              <Button
                size="sm"
                className="gap-1.5"
                onClick={handleCompare}
                disabled={!selectedA || !selectedB || comparing}
              >
                {comparing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("setupCompare.compare")}
              </Button>
            </div>
          </div>
        </CardHeader>

        {diffs && (
          <CardContent className="p-2">
            <Accordion type="multiple" defaultValue={diffs.filter((s) => s.params.some((p) => p.is_diff)).map((s) => s.name)} className="w-full">
              {diffs.map((section) => {
                const diffCount = section.params.filter((p) => p.is_diff).length;
                return (
                  <AccordionItem key={section.name} value={section.name} className="last:border-0">
                    <AccordionTrigger>
                      <div className="flex items-center gap-3">
                        <span>{section.name}</span>
                        <Badge variant={diffCount > 0 ? "default" : "secondary"} className="font-mono text-[10px]">
                          {diffCount} {diffCount === 1 ? t("setupCompare.diff") : t("setupCompare.diff_many")}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="overflow-hidden rounded-md border border-border/60">
                        <table className="w-full text-sm">
                          <thead className="bg-primary/15 dark:bg-primary/10">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium text-yellow-900 dark:text-yellow-100 text-xs uppercase tracking-wide">{t("setupCompare.parameter")}</th>
                              <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide w-32">A</th>
                              <th className="w-8"></th>
                              <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide w-32">B</th>
                              <th className="w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {section.params.map((p, i) => {
                              const isDiff = p.is_diff;
                              return (
                                <tr key={i} className={cn("border-t border-border/40", isDiff && "bg-primary/5")}>
                                  <td className="px-3 py-2">
                                    <span className="text-muted-foreground">{p.key}</span>
                                    {p.comment_a && (
                                      <span className="block text-xs text-muted-foreground/60">{p.comment_a}</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 font-mono text-right">
                                    {p.value_a}
                                  </td>
                                  <td className="text-center text-muted-foreground">{isDiff ? "→" : ""}</td>
                                  <td className={cn("px-3 py-2 font-mono text-right", isDiff && "text-primary font-semibold")}>
                                    {p.value_b}
                                  </td>
                                  <td className="px-2">{isDiff && <span className="text-primary text-xs">●</span>}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function SetupPick({
  label,
  name,
  setups,
  selected,
  onSelect,
}: {
  label: string;
  name: string;
  setups: SetupSummary[];
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary font-bold">
        {label}
      </div>
      <div>
        <div className="font-mono text-sm font-medium">{name}</div>
      </div>
      <select
        className="text-xs bg-muted rounded px-2 py-1 border border-border"
        value={selected ?? ""}
        onChange={(e) => onSelect(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">{t("setupCompare.choose")}</option>
        {setups.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
