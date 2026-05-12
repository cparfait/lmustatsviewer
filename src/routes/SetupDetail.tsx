import { Link, useParams } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { setupDetail } from "@/lib/mockData";
import { ArrowLeft, Edit3, Copy, GitCompareArrows, Download, Minus, Plus, Trash2 } from "lucide-react";

export function SetupDetail() {
  useParams();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/setups" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
            <ArrowLeft className="h-3 w-3" /> Retour aux setups
          </Link>
          <h1 className="text-2xl font-bold tracking-tight font-mono">race_dry_v3.svm</h1>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <span>Toyota GR010 Hybrid</span>
            <span>·</span>
            <Badge variant="outline" className="text-[10px]">Hypercar</Badge>
            <span>·</span>
            <span>Le Mans · 24h Circuit</span>
            <span>·</span>
            <span className="text-xs">modifié 2026-05-10</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5"><Edit3 className="h-4 w-4" /> Éditer</Button>
          <Button variant="outline" size="sm" className="gap-1.5"><Copy className="h-4 w-4" /> Dupliquer</Button>
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link to="/setups/compare"><GitCompareArrows className="h-4 w-4" /> Comparer</Link>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-4 w-4" /> Export</Button>
          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-2">
          <Accordion type="multiple" defaultValue={["Suspension", "Aerodynamics"]} className="w-full">
            {setupDetail.map((section) => (
              <AccordionItem key={section.name} value={section.name} className="last:border-0">
                <AccordionTrigger>
                  <div className="flex items-center gap-3">
                    <span>{section.name}</span>
                    <Badge variant="secondary" className="font-mono text-[10px]">{section.params.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
                    {section.params.map((p, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between py-2 border-b border-border/40 last:border-0"
                      >
                        <span className="text-sm text-muted-foreground">{p.label}</span>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="font-mono text-sm font-medium min-w-[80px] text-right">
                            {p.value}
                            {p.unit && <span className="text-xs text-muted-foreground ml-1">{p.unit}</span>}
                          </span>
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
