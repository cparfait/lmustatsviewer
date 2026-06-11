import { Link } from "react-router";
import { useState, useEffect, useRef } from "react";
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
import { ArrowLeft, ArrowLeftRight, AlertTriangle, Loader2, ChevronDown, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClassBadge } from "@/components/ClassBadge";
import { CarLogo } from "@/components/CarLogo";
import { CAR_CLASS_COLORS } from "@/lib/staticData";

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

  async function handleCompare() {
    if (!selectedA || !selectedB) return;
    setComparing(true);
    try {
      setDiffs(await setupsApi.compare(selectedA, selectedB));
    } catch {
      setDiffs(null);
    } finally {
      setComparing(false);
    }
  }

  function handleSwap() {
    setSelectedA(selectedB);
    setSelectedB(selectedA);
    setDiffs(null);
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
            <SetupPick
              label="A"
              groups={allGroups}
              selected={selectedA}
              onSelect={(id) => { setSelectedA(id); setDiffs(null); }}
            />

            {/* Bouton swap central */}
            <div className="flex flex-col items-center gap-1 pt-8 shrink-0">
              <button
                onClick={handleSwap}
                disabled={!selectedA && !selectedB}
                title={t("setupCompare.compare")}
                className="p-2 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </button>
            </div>

            {/* Setup B */}
            <SetupPick
              label="B"
              groups={allGroups}
              selected={selectedB}
              onSelect={(id) => { setSelectedB(id); setDiffs(null); }}
            />
          </div>

          {/* Barre d'action */}
          <div className="flex items-center justify-end gap-3 mt-5 pt-4 border-t border-border/60">
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
              {comparing
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ArrowLeftRight className="h-4 w-4" />}
              {t("setupCompare.compare")}
            </Button>
          </div>
        </CardContent>
      </Card>

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
      <ClassBadge carClass={info.car_class} size="sm" />
      <span className="text-xs font-mono font-medium truncate">{info.setup.name}</span>
    </div>
  );
}

// ── Sélecteur custom ─────────────────────────────────────────────────────────

function SetupPick({
  label,
  groups,
  selected,
  onSelect,
}: {
  label: string;
  groups: SetupGroup[];
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const info = findSetupInfo(groups, selected);
  const clsColor = info ? CAR_CLASS_COLORS[info.car_class]?.color : undefined;

  // Fermeture sur clic extérieur
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Fermeture sur Échap
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const isA = label === "A";

  return (
    <div className="flex-1 flex flex-col gap-3 min-w-0" ref={containerRef}>

      {/* Aperçu du setup sélectionné */}
      <div className={cn(
        "rounded-xl border p-3 flex items-center gap-3 min-h-[72px] transition-colors",
        info
          ? "border-border bg-card/60"
          : "border-dashed border-border/50 bg-muted/20"
      )}>
        {/* Badge A / B */}
        <div className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-bold text-base",
          isA
            ? "bg-primary/20 text-primary border border-primary/30"
            : "bg-sky-500/20 text-sky-400 border border-sky-500/30"
        )}>
          {label}
        </div>

        {info ? (
          <>
            {/* Infos setup */}
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <CarLogo
                carName={info.car}
                className="h-5 w-auto object-contain opacity-80 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold font-mono truncate leading-tight">
                  {info.setup.name}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <ClassBadge carClass={info.car_class} size="sm" />
                  <span className="text-xs text-muted-foreground truncate">{info.car}</span>
                  {info.circuit && (
                    <span className="text-micro text-muted-foreground/60 truncate">· {info.circuit}</span>
                  )}
                </div>
              </div>
            </div>
            {/* Effacer */}
            <button
              onClick={() => onSelect(null)}
              className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Effacer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground/60 italic">{t("setupCompare.choose")}</p>
        )}
      </div>

      {/* Bouton d'ouverture du dropdown */}
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors",
            open
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border bg-background hover:border-primary/50 hover:bg-accent/30 text-muted-foreground hover:text-foreground"
          )}
        >
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-150", open && "rotate-180")} />
          <span className="flex-1 text-left truncate text-xs">
            {info ? info.setup.name : t("setupCompare.choose")}
          </span>
          {info && clsColor && (
            <span className="text-micro font-bold shrink-0" style={{ color: clsColor }}>
              {info.car_class}
            </span>
          )}
        </button>

        {/* Dropdown panel */}
        {open && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
            <div className="max-h-80 overflow-y-auto">

              {/* Option vide */}
              <button
                onClick={() => { onSelect(null); setOpen(false); }}
                className="w-full px-4 py-2 text-xs text-muted-foreground hover:bg-muted/60 text-left italic transition-colors"
              >
                — {t("setupCompare.choose")}
              </button>

              {groups.map((g) => {
                const setups = g.tracks
                  .flatMap((tr) => tr.setups)
                  .sort((a, b) => a.name.localeCompare(b.name));
                if (setups.length === 0) return null;
                const color = CAR_CLASS_COLORS[g.car_class]?.color ?? "#888";

                return (
                  <div key={g.car}>
                    {/* En-tête classe + voiture */}
                    <div
                      className="px-3 py-1.5 flex items-center gap-2 bg-muted/50 border-t border-border/40"
                      style={{ borderLeftWidth: 3, borderLeftColor: color, borderLeftStyle: "solid" }}
                    >
                      <span className="text-micro font-bold uppercase tracking-widest shrink-0" style={{ color }}>
                        {g.car_class}
                      </span>
                      <span className="text-muted-foreground/50 text-micro">·</span>
                      <CarLogo carName={g.car} className="h-3.5 w-auto object-contain opacity-70 shrink-0" />
                      <span className="text-xs font-medium truncate text-foreground/80">{g.car}</span>
                    </div>

                    {/* Items setups */}
                    {setups.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { onSelect(s.id); setOpen(false); }}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-5 py-2 text-sm text-left transition-colors",
                          selected === s.id
                            ? "bg-primary/15 text-primary"
                            : "hover:bg-primary/8 hover:text-foreground text-foreground/80"
                        )}
                      >
                        <FileText className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          selected === s.id ? "text-primary" : "text-muted-foreground"
                        )} />
                        <span className="font-mono text-xs truncate flex-1">{s.name}</span>
                        {s.setup_type && s.setup_type !== "Autres" && (
                          <span className="text-micro text-muted-foreground shrink-0 ml-auto">
                            {s.setup_type}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
