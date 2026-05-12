import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  bestLaps,
  tierColorMap,
  CAR_CLASS_LABELS,
  gameVersions,
  getCircuitInfo,
  type CarClass,
  type BestLap,
} from "@/lib/mockData";
import { formatLapTime, formatDelta, formatSectorTime, cn } from "@/lib/utils";
import {
  Trophy,
  Search,
  Filter,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  X,
  Wrench,
  Eye,
  Globe,
  Monitor,
  WifiOff,
} from "lucide-react";
import { useVersion } from "@/stores/version";

const classOptions: { value: CarClass | "all"; label: string }[] = [
  { value: "all", label: "Toutes les classes" },
  { value: "Hypercar", label: "Hypercar" },
  { value: "LMP2_WEC", label: "LMP2 WEC" },
  { value: "LMP2_ELMS", label: "LMP2 ELMS" },
  { value: "LMP3", label: "LMP3" },
  { value: "GT3", label: "GT3" },
  { value: "GTE", label: "GTE" },
];

const sessionTypeVariant = {
  Race: "default",
  Qualifying: "secondary",
  Practice: "outline",
} as const;

export function Records() {
  const navigate = useNavigate();
  const { activeId, active, showOutdated, setShowOutdated } = useVersion();
  const [classFilter, setClassFilter] = useState<CarClass | "all">("all");
  const [carFilter, setCarFilter] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const [allExpanded, setAllExpanded] = useState(true);
  const [collapsedCircuits, setCollapsedCircuits] = useState<Set<string>>(new Set());

  const availableCars = useMemo(() => {
    const cars = new Set<string>();
    bestLaps.forEach((l) => {
      if (classFilter === "all" || l.class === classFilter) cars.add(l.car);
    });
    return Array.from(cars).sort();
  }, [classFilter]);

  const filtered = useMemo(() => {
    return bestLaps.filter((l) => {
      if (!showOutdated && l.versionId !== activeId) return false;
      if (classFilter !== "all" && l.class !== classFilter) return false;
      if (carFilter !== "all" && l.car !== carFilter) return false;
      if (search && !l.track.toLowerCase().includes(search.toLowerCase()) && !l.car.toLowerCase().includes(search.toLowerCase()) && !l.livery.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [classFilter, carFilter, showOutdated, activeId, search]);

  // Grouper par circuit
  const groupedByTrack = useMemo(() => {
    const map = new Map<string, BestLap[]>();
    filtered.forEach((l) => {
      if (!map.has(l.track)) map.set(l.track, []);
      map.get(l.track)!.push(l);
    });
    // tri alphabétique des circuits
    return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  }, [filtered]);

  const toggleCircuit = (track: string) => {
    setCollapsedCircuits((prev) => {
      const next = new Set(prev);
      if (next.has(track)) next.delete(track);
      else next.add(track);
      return next;
    });
  };

  const toggleAll = () => {
    if (allExpanded) {
      setCollapsedCircuits(new Set(groupedByTrack.keys()));
      setAllExpanded(false);
    } else {
      setCollapsedCircuits(new Set());
      setAllExpanded(true);
    }
  };

  const totalRecords = filtered.length;
  const outdatedCount = bestLaps.filter((l) => l.versionId !== activeId).length;
  const activeFilters = [
    classFilter !== "all" && { type: "class", value: classOptions.find((c) => c.value === classFilter)?.label },
    carFilter !== "all" && { type: "car", value: carFilter },
  ].filter(Boolean) as { type: string; value: string }[];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight uppercase tracking-widest">Meilleurs temps par circuit / voiture</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {totalRecords} record{totalRecords > 1 ? "s" : ""}
              {" "}sur la <span className="text-foreground font-medium">v{active.label}</span>
              {" "}· comparé à <span className="text-primary">ohne_speed</span>
              {outdatedCount > 0 && !showOutdated && (
                <span className="ml-1">· {outdatedCount} masqué{outdatedCount > 1 ? "s" : ""} d'anciennes versions</span>
              )}
            </p>
          </div>
        </div>

        {/* Filter bar */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-accent/40">
                <input
                  type="checkbox"
                  checked={allExpanded}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                />
                <span className="text-xs font-medium">Tout déployer / replier</span>
              </label>

              <div className="h-5 w-px bg-border mx-1" />

              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Circuit, voiture ou livrée..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Filter className="h-3.5 w-3.5" />
                    {classFilter === "all" ? "Toutes classes" : classOptions.find((c) => c.value === classFilter)?.label}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Classe</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {classOptions.map((c) => (
                    <DropdownMenuItem key={c.value} onSelect={() => { setClassFilter(c.value); setCarFilter("all"); }}>
                      {c.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Filter className="h-3.5 w-3.5" />
                    {carFilter === "all" ? "Toutes voitures" : carFilter}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-96 overflow-y-auto">
                  <DropdownMenuLabel>Voiture</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setCarFilter("all")}>Toutes</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {availableCars.map((c) => (
                    <DropdownMenuItem key={c} onSelect={() => setCarFilter(c)}>{c}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex items-center gap-2 ml-auto pl-3 border-l border-border">
                <span className="text-xs text-muted-foreground">Inclure versions obsolètes</span>
                <Switch checked={showOutdated} onCheckedChange={setShowOutdated} />
              </div>
            </div>

            {activeFilters.length > 0 && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/60">
                <span className="text-xs text-muted-foreground">Actifs :</span>
                {activeFilters.map((f) => (
                  <Badge key={f.type} variant="default" className="gap-1 pr-1">
                    {f.value}
                    <button
                      onClick={() => f.type === "class" ? setClassFilter("all") : setCarFilter("all")}
                      className="hover:bg-primary/30 rounded p-0.5"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
                <button
                  onClick={() => { setClassFilter("all"); setCarFilter("all"); setSearch(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground ml-1"
                >
                  Tout effacer
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tables groupées par circuit */}
      {groupedByTrack.size === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Trophy className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Aucun record sur ces filtres.</p>
            {outdatedCount > 0 && !showOutdated && (
              <Button variant="link" size="sm" onClick={() => setShowOutdated(true)} className="mt-2">
                Inclure {outdatedCount} record{outdatedCount > 1 ? "s" : ""} d'anciennes versions
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {Array.from(groupedByTrack.entries()).map(([track, records]) => {
            const isCollapsed = collapsedCircuits.has(track);
            const info = getCircuitInfo(track);
            return (
              <Card key={track} className="overflow-hidden">
                {/* Header circuit */}
                <button
                  onClick={() => toggleCircuit(track)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  <span className="text-2xl leading-none">{info.flag}</span>
                  <span className="font-semibold uppercase tracking-wider text-sm">{track}</span>
                  <Badge variant="secondary" className="ml-auto bg-primary-foreground/20 text-primary-foreground border-0">
                    {records.length} record{records.length > 1 ? "s" : ""}
                  </Badge>
                </button>

                {/* Rows */}
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30">
                        <tr className="border-b border-border">
                          <th className="w-12 text-center px-2 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Détails</th>
                          <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Tracé</th>
                          <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Type</th>
                          <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Session</th>
                          <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Classe</th>
                          <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Voiture</th>
                          <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Livrée</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Meilleur tour</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium text-success">S1</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium text-success">S2</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium text-success">S3</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium text-purple">Optimal</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Vmax</th>
                          <th className="text-center px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Pos. arrivée</th>
                          <th className="text-center px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Prog.</th>
                          <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Date</th>
                          <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Ver. LMU</th>
                          <th className="text-center px-2 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Tier</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((r) => {
                          const v = gameVersions.find((gv) => gv.id === r.versionId);
                          const isOutdated = r.versionId !== activeId;
                          const optimalDelta = r.optimalMs - r.lapMs;
                          return (
                            <tr
                              key={r.id}
                              onClick={() => navigate(`/sessions/${r.sessionId}`)}
                              className={cn(
                                "border-b border-border/40 last:border-0 cursor-pointer group transition-colors",
                                "hover:bg-accent/40",
                                isOutdated && "opacity-60"
                              )}
                            >
                              <td className="text-center px-2 py-2">
                                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors mx-auto">
                                  <Eye className="h-3.5 w-3.5" />
                                </div>
                              </td>
                              <td className="px-3 py-2 font-medium text-foreground">{r.layout}</td>
                              <td className="px-3 py-2">
                                <Badge variant="outline" className="gap-1 text-[10px]">
                                  {r.type === "Online" ? <Globe className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
                                  {r.type === "Online" ? "En ligne" : "Hors ligne"}
                                </Badge>
                              </td>
                              <td className="px-3 py-2">
                                <Badge variant={sessionTypeVariant[r.sessionType]} className="text-[10px]">
                                  {r.sessionType === "Race" ? "Course" : r.sessionType === "Qualifying" ? "Qualif." : "Essais"}
                                </Badge>
                              </td>
                              <td className="px-3 py-2">
                                <Badge variant="secondary" className="text-[10px]">{CAR_CLASS_LABELS[r.class]}</Badge>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-foreground">{r.car}</td>
                              <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{r.livery}</td>
                              <td className="px-3 py-2 text-right font-mono font-bold text-foreground whitespace-nowrap">{formatLapTime(r.lapMs)}</td>
                              <td className="px-3 py-2 text-right font-mono text-success font-medium">{formatSectorTime(r.s1Ms)}<span className="text-muted-foreground text-[9px]">ss</span></td>
                              <td className="px-3 py-2 text-right font-mono text-success font-medium">{formatSectorTime(r.s2Ms)}<span className="text-muted-foreground text-[9px]">ss</span></td>
                              <td className="px-3 py-2 text-right font-mono text-success font-medium">{formatSectorTime(r.s3Ms)}<span className="text-muted-foreground text-[9px]">ss</span></td>
                              <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                                <div className="text-purple font-bold">{formatLapTime(r.optimalMs)}</div>
                                {optimalDelta < 0 && <div className="text-[10px] text-muted-foreground">({(optimalDelta / 1000).toFixed(3)}ss)</div>}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground whitespace-nowrap">{r.vMaxKmh} <span className="text-[9px]">km/h</span></td>
                              <td className="px-3 py-2 text-center font-mono">
                                {r.finishPosition === "N/A" ? <span className="text-muted-foreground/60 text-xs">N/A</span> : <span className="font-medium">{r.finishPosition.split("/")[0]}</span>}
                              </td>
                              <td className="px-3 py-2 text-center font-mono text-xs">
                                {r.progression === null ? <span className="text-muted-foreground/60">N/A</span> :
                                  r.progression > 0 ? <span className="text-success font-bold">▲ +{r.progression}</span> :
                                  r.progression < 0 ? <span className="text-destructive font-bold">▼ {r.progression}</span> :
                                  <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">{r.dateTime}</td>
                              <td className="px-3 py-2">
                                <Badge variant="outline" className={cn("font-mono text-[10px] gap-1", isOutdated && "border-destructive/40 text-destructive")} title={isOutdated ? "Record d'une version antérieure" : "Version active"}>
                                  {isOutdated && <AlertTriangle className="h-2.5 w-2.5" />}
                                  {v?.label}
                                </Badge>
                              </td>
                              <td className="px-2 py-2 text-center">
                                <Badge variant={tierColorMap[r.tier]} className="text-[10px]">{r.tier}</Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Légende */}
      <Card>
        <CardContent className="p-3 flex items-center gap-6 flex-wrap text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Légende :</span>
          <span className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded bg-success/30 border border-success" />
            Secteurs (vert = temps personnel)
          </span>
          <span className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded bg-purple/30 border border-purple" />
            Temps optimal (somme des meilleurs secteurs jamais réalisés)
          </span>
          <span className="flex items-center gap-1.5">
            <Eye className="h-3 w-3" />
            Cliquer une ligne pour voir la session d'origine
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
