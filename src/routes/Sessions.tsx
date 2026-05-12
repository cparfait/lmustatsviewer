import { useNavigate } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { sessions, CAR_CLASS_LABELS, gameVersions } from "@/lib/mockData";
import { formatLapTime, cn } from "@/lib/utils";
import { Search, Filter, Calendar, ChevronRight, Wrench, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVersion } from "@/stores/version";

const typeVariant: Record<string, "default" | "secondary" | "outline"> = {
  Race: "default",
  Qualifying: "secondary",
  Practice: "outline",
};

export function Sessions() {
  const navigate = useNavigate();
  const { activeId, showOutdated } = useVersion();

  const filtered = sessions.filter((s) => showOutdated || s.versionId === activeId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sessions</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} sessions sur la version active
            {!showOutdated && <span className="text-xs"> · masquer le filtre depuis le header pour voir les anciennes</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Chercher un circuit..." className="pl-8 w-64" />
          </div>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Filter className="h-4 w-4" /> Filtres
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Calendar className="h-4 w-4" /> Période
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14 text-center">Détails</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Circuit</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead>Voiture</TableHead>
                <TableHead className="text-right">Tours</TableHead>
                <TableHead className="text-right">Best lap</TableHead>
                <TableHead className="text-right">Position</TableHead>
                <TableHead className="w-12">Version</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => {
                const v = gameVersions.find((gv) => gv.id === s.versionId);
                const isOutdated = s.versionId !== activeId;
                return (
                  <TableRow
                    key={s.id}
                    onClick={() => navigate(`/sessions/${s.id}`)}
                    className={cn("cursor-pointer group", isOutdated && "opacity-60")}
                  >
                    <TableCell className="text-center">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors mx-auto" title="Voir le détail de la session">
                        <Eye className="h-3.5 w-3.5" />
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.date}</TableCell>
                    <TableCell>
                      <Badge variant={typeVariant[s.type]}>{s.type}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {s.track} <span className="text-xs text-muted-foreground">{s.layout}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{CAR_CLASS_LABELS[s.class]}</TableCell>
                    <TableCell className="text-sm">{s.car}</TableCell>
                    <TableCell className="text-right font-mono">{s.laps}</TableCell>
                    <TableCell className="text-right font-mono font-medium">{formatLapTime(s.bestLapMs)}</TableCell>
                    <TableCell className="text-right font-mono">{s.position}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("font-mono text-[10px] gap-1", isOutdated && "border-destructive/40 text-destructive")}>
                        {isOutdated && <Wrench className="h-2.5 w-2.5" />}
                        v{v?.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
