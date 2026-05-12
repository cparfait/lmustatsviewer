import { useState } from "react";
import { Link } from "react-router";
import { ChevronRight, ChevronDown, FileText, MoreHorizontal, Plus, GitCompareArrows } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { setups, CAR_CLASS_LABELS } from "@/lib/mockData";
import { cn } from "@/lib/utils";

export function Setups() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ "0": true, "0-0": true });

  const toggle = (key: string) =>
    setExpanded((e) => ({ ...e, [key]: !e[key] }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Car setups</h1>
          <p className="text-sm text-muted-foreground">
            Scan automatique du dossier <code className="text-xs px-1.5 py-0.5 rounded bg-muted text-foreground">UserData/player/Settings/</code>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link to="/setups/compare">
              <GitCompareArrows className="h-4 w-4" /> Comparer
            </Link>
          </Button>
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> Nouveau setup
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-2">
          {setups.map((group, gi) => {
            const carKey = `${gi}`;
            const totalSetups = group.tracks.reduce((acc, t) => acc + t.setups.length, 0);
            return (
              <div key={carKey} className="border-b border-border/60 last:border-0">
                <button
                  onClick={() => toggle(carKey)}
                  className="w-full flex items-center gap-2 py-2.5 px-3 hover:bg-accent/60 rounded-md transition-colors"
                >
                  {expanded[carKey] ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <span className="font-medium">{group.car}</span>
                  <Badge variant="outline" className="text-[10px] uppercase">{CAR_CLASS_LABELS[group.class]}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {group.tracks.length} circuit{group.tracks.length > 1 ? "s" : ""} · {totalSetups} setup{totalSetups > 1 ? "s" : ""}
                  </span>
                </button>

                {expanded[carKey] && (
                  <div className="ml-6 mb-2">
                    {group.tracks.map((track, ti) => {
                      const trackKey = `${gi}-${ti}`;
                      return (
                        <div key={trackKey}>
                          <button
                            onClick={() => toggle(trackKey)}
                            className="w-full flex items-center gap-2 py-2 px-3 hover:bg-accent/40 rounded-md transition-colors text-sm"
                          >
                            {expanded[trackKey] ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                            <span className="font-medium text-muted-foreground">{track.name}</span>
                            <span className="text-xs text-muted-foreground/70">({track.setups.length})</span>
                          </button>

                          {expanded[trackKey] && (
                            <div className="ml-6">
                              {track.setups.map((s) => (
                                <Link
                                  key={s.id}
                                  to={`/setups/${s.id}`}
                                  className={cn(
                                    "group flex items-center gap-3 py-2 px-3 rounded-md text-sm",
                                    "hover:bg-accent/60 transition-colors"
                                  )}
                                >
                                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="font-mono">{s.name}</span>
                                  <span className="text-xs text-muted-foreground ml-auto group-hover:opacity-0 transition-opacity">
                                    modifié il y a {s.modifiedAgo}
                                  </span>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
