import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { setupDetail } from "@/lib/mockData";
import { ArrowLeft, ArrowLeftRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function SetupCompare() {
  const totalDiffs = setupDetail.reduce(
    (acc, s) => acc + s.params.filter((p) => p.valueB !== undefined && p.valueB !== p.value).length,
    0
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/setups" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="h-3 w-3" /> Retour aux setups
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Comparaison de setups</h1>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <SetupPick label="A" name="race_dry_v3.svm" sub="Toyota GR010 · Le Mans" />
              <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />
              <SetupPick label="B" name="race_wet_v1.svm" sub="Toyota GR010 · Le Mans" />
            </div>
            <Badge variant="default" className="gap-1.5">
              <AlertTriangle className="h-3 w-3" />
              {totalDiffs} différences au total
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-2">
          <Accordion type="multiple" defaultValue={["Suspension"]} className="w-full">
            {setupDetail.map((section) => {
              const diffs = section.params.filter((p) => p.valueB !== undefined && p.valueB !== p.value).length;
              return (
                <AccordionItem key={section.name} value={section.name} className="last:border-0">
                  <AccordionTrigger>
                    <div className="flex items-center gap-3">
                      <span>{section.name}</span>
                      <Badge variant={diffs > 0 ? "default" : "secondary"} className="font-mono text-[10px]">
                        {diffs} {diffs === 1 ? "diff" : "diffs"}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="overflow-hidden rounded-md border border-border/60">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">Paramètre</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide w-32">A</th>
                            <th className="w-8"></th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide w-32">B</th>
                            <th className="w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.params.map((p, i) => {
                            const isDiff = p.valueB !== undefined && p.valueB !== p.value;
                            return (
                              <tr key={i} className={cn("border-t border-border/40", isDiff && "bg-primary/5")}>
                                <td className="px-3 py-2 text-muted-foreground">{p.label}</td>
                                <td className="px-3 py-2 font-mono text-right">
                                  {p.value}
                                  {p.unit && <span className="text-xs text-muted-foreground ml-1">{p.unit}</span>}
                                </td>
                                <td className="text-center text-muted-foreground">{isDiff ? "→" : ""}</td>
                                <td className={cn("px-3 py-2 font-mono text-right", isDiff && "text-primary font-semibold")}>
                                  {p.valueB ?? p.value}
                                  {p.unit && <span className="text-xs text-muted-foreground ml-1">{p.unit}</span>}
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
      </Card>
    </div>
  );
}

function SetupPick({ label, name, sub }: { label: string; name: string; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary font-bold">{label}</div>
      <div>
        <div className="font-mono text-sm font-medium">{name}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </div>
      <Button variant="ghost" size="sm" className="text-xs">Changer</Button>
    </div>
  );
}
