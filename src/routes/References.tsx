/**
 * Page « Références » : temps de référence par circuit × catégorie, issus de la
 * base communautaire OhneSpeed (déjà récupérée par `lib/ohne_speed.ts` pour les
 * badges de tier). Un tableau par classe, colonnes Quali / Fastest / Voiture +
 * paliers 100 % (Alien) → 107 % (Offline), code couleur, filtre circuit et
 * surlignage « mon niveau » (calculé depuis mes meilleurs tours en base).
 *
 * Attribution : données OhneSpeed (Peter). On ne fait que les afficher avec crédit.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ExternalLink, Target, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { TableTitle } from "@/components/TableTitle";
import { TrackFlag } from "@/components/TrackFlag";
import { queries, type BestLapRow } from "@/lib/api";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  fetchBenchmarks,
  mapTrackName,
  OHNE_CLASS,
  TIER_COLUMNS,
  type PaceBenchmark,
} from "@/lib/ohne_speed";
import type { CarClass } from "@/lib/staticData";

/** Lien public de la feuille source (crédit). */
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTN03UvJDm99byA6vQPZHKOCYVvfxLu1zkJAzdaKyROykzEKY2-Xl1rl1q5znZEf36m88dxMKsY2eaO/pubhtml";

/** Ordre + libellés d'affichage des classes (comme la source). */
const CLASS_DISPLAY: { cls: CarClass; label: string }[] = [
  { cls: "GTE", label: "GTE" },
  { cls: "GT3", label: "LMGT3" },
  { cls: "Hypercar", label: "LMH" },
  { cls: "LMP2_ELMS", label: "LMP2 ELMS" },
  { cls: "LMP2_WEC", label: "LMP2 WEC" },
  { cls: "LMP3", label: "LMP3" },
];

function fmt(ms: number): string {
  return ms > 0 ? formatTime(ms / 1000) : "—";
}

/** Largeurs fixes (px) — colonnes identiques entre tous les tableaux (alignement). */
const FIXED_COLS = [190, 60, 92, 92, 230]; // Circuit, Patch, Quali, Fastest, Voiture
const TIER_COL_W = 88;
const TABLE_MIN_W =
  FIXED_COLS.reduce((s, w) => s + w, 0) + TIER_COLUMNS.length * TIER_COL_W;

/** Modèle sans suffixe de version : "Porsche RSR (v1.23)" → "Porsche RSR". */
function carModel(name: string): string {
  const m = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? m[1].trim() : name.trim();
}
/** Version (suffixe entre parenthèses) : "Porsche RSR (v1.23)" → "v1.23". */
function carVersion(name: string): string {
  const m = name.match(/\(([^)]+)\)\s*$/);
  return m ? m[1].trim() : "";
}

/** Mon meilleur tour sur un combo + la session DB d'origine (pour la navigation). */
interface MyBest {
  best: number; // s
  track: string; // nom DB (≠ nom OhneSpeed)
  course: string;
  car_class: string;
}

export function References() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [benchmarks, setBenchmarks] = useState<PaceBenchmark[] | null>(null);
  const [bestLaps, setBestLaps] = useState<BestLapRow[]>([]);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState(""); // circuit (sélection exacte)
  const [classFilter, setClassFilter] = useState("");
  const [carFilter, setCarFilter] = useState(""); // modèle (sans version)
  const [versionFilter, setVersionFilter] = useState("");
  const [showLevel, setShowLevel] = useState(false);

  useEffect(() => {
    fetchBenchmarks()
      .then(setBenchmarks)
      .catch(() => setError(true));
    queries.getBestLaps().then(setBestLaps).catch(() => setBestLaps([]));
  }, []);

  // Mon meilleur temps par combo OhneSpeed : clé "<track>::<class>".
  const myBest = useMemo(() => {
    const m = new Map<string, MyBest>();
    for (const r of bestLaps) {
      const ot = mapTrackName(r.track, r.track_course);
      const oc = OHNE_CLASS[r.car_class];
      if (!ot || !oc || !(r.best_lap > 0)) continue;
      const k = `${ot}::${oc}`;
      const prev = m.get(k);
      if (prev == null || r.best_lap < prev.best) {
        m.set(k, {
          best: r.best_lap,
          track: r.track,
          course: r.track_course,
          car_class: r.car_class,
        });
      }
    }
    return m;
  }, [bestLaps]);

  /** Colonne de tier correspondant à mon niveau sur ce combo (100..107). */
  const tierPctOf = (bm: PaceBenchmark, best: number): number | null => {
    if (!bm.racePaceMs.alien) return null;
    const pct = ((best * 1000) / bm.racePaceMs.alien) * 100;
    return Math.min(107, Math.max(100, Math.round(pct)));
  };

  /** Ouvre la liste des sessions du combo (circuit + classe). */
  const goSessions = (my: MyBest) => {
    const q = new URLSearchParams({
      track: my.track,
      ...(my.course && my.course !== my.track ? { course: my.course } : {}),
      class: my.car_class,
    });
    navigate(`/sessions?${q}`);
  };

  const levelCount = useMemo(() => {
    if (!benchmarks) return 0;
    return benchmarks.filter((b) => myBest.has(`${b.track}::${b.carClass}`)).length;
  }, [benchmarks, myBest]);

  // Circuits distincts (restreints à la classe filtrée, si l'une est choisie).
  const circuitOptions = useMemo(() => {
    if (!benchmarks) return [];
    const set = new Set<string>();
    for (const b of benchmarks) {
      if (classFilter && b.carClass !== classFilter) continue;
      if (b.track) set.add(b.track);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [benchmarks, classFilter]);

  // Modèles de voiture distincts (sans version), restreints à la classe filtrée.
  const carOptions = useMemo(() => {
    if (!benchmarks) return [];
    const set = new Set<string>();
    for (const b of benchmarks) {
      if (classFilter && b.carClass !== classFilter) continue;
      if (b.fastestCar) set.add(carModel(b.fastestCar));
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [benchmarks, classFilter]);

  // Versions distinctes (du sheet), restreintes à la classe + au modèle filtrés.
  const versionOptions = useMemo(() => {
    if (!benchmarks) return [];
    const set = new Set<string>();
    for (const b of benchmarks) {
      if (classFilter && b.carClass !== classFilter) continue;
      if (carFilter && carModel(b.fastestCar) !== carFilter) continue;
      const v = carVersion(b.fastestCar);
      if (v) set.add(v);
    }
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [benchmarks, classFilter, carFilter]);

  return (
    <div className="flex flex-col gap-5">
      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("references.title")} <span className="text-primary">OhneSpeed</span>
        </h1>
        <p className="text-sm text-muted-foreground">{t("references.subtitle")}</p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          {t("references.source")}{" "}
          <a
            href={SHEET_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline"
          >
            {t("references.openSource")}
            <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>

      {/* Barre d'outils */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-9 min-w-[170px] rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{t("references.allCircuits")}</option>
            {circuitOptions.map((tr) => (
              <option key={tr} value={tr}>
                {tr}
              </option>
            ))}
          </select>
          <select
            value={classFilter}
            onChange={(e) => {
              setClassFilter(e.target.value);
              setCarFilter("");
              setVersionFilter("");
            }}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{t("references.allClasses")}</option>
            {CLASS_DISPLAY.map(({ cls, label }) => (
              <option key={cls} value={cls}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={carFilter}
            onChange={(e) => {
              setCarFilter(e.target.value);
              setVersionFilter("");
            }}
            className="h-9 max-w-[220px] rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{t("references.allCars")}</option>
            {carOptions.map((car) => (
              <option key={car} value={car}>
                {car}
              </option>
            ))}
          </select>
          <select
            value={versionFilter}
            onChange={(e) => setVersionFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{t("header.allVersions")}</option>
            {versionOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          {(filter || classFilter || carFilter || versionFilter) && (
            <button
              type="button"
              onClick={() => {
                setFilter("");
                setClassFilter("");
                setCarFilter("");
                setVersionFilter("");
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("references.reset")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowLevel((v) => !v)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium",
              showLevel
                ? "border-orange-500 bg-orange-500/10 text-orange-500"
                : "border-orange-500/60 text-orange-500/80 hover:bg-orange-500/10 hover:text-orange-500",
            )}
          >
            <Target className="h-4 w-4" />
            {showLevel ? `${t("references.hideLevel")} (${levelCount})` : t("references.showLevel")}
          </button>
          {/* Légende : explique l'encadré orange (= mon niveau actuel). */}
          {showLevel && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-block h-5 w-9 rounded ring-2 ring-inset ring-orange-500" />
              {t("references.legendMyTime")}
            </span>
          )}
          {/* Légende des paliers */}
          <div className="ml-auto flex flex-wrap items-center gap-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {TIER_COLUMNS.map((c) => (
              <span key={c.pct} className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                {c.pct}%
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {error && <Card className="p-6 text-sm text-muted-foreground">{t("references.error")}</Card>}
      {!benchmarks && !error && (
        <Card className="p-6 text-sm text-muted-foreground">{t("references.loading")}</Card>
      )}

      {benchmarks &&
        CLASS_DISPLAY.filter(({ cls }) => !classFilter || cls === classFilter).map(({ cls, label }) => {
          const rows = benchmarks
            .filter(
              (b) =>
                b.carClass === cls &&
                (!filter || b.track === filter) &&
                (!carFilter || carModel(b.fastestCar) === carFilter) &&
                (!versionFilter || carVersion(b.fastestCar) === versionFilter),
            )
            .sort((a, b) => a.track.localeCompare(b.track));
          if (rows.length === 0) return null;
          return (
            <Card key={cls} className="overflow-hidden">
              <TableTitle
                title={
                  <span className="inline-flex items-baseline gap-2">
                    {label}
                    <span className="text-xs font-normal opacity-80">
                      {rows.length} {t("references.circuits")}
                    </span>
                  </span>
                }
              />
              <CardContent className="p-0 overflow-x-auto">
                <Table className="table-fixed" style={{ minWidth: TABLE_MIN_W }}>
                  <colgroup>
                    {FIXED_COLS.map((w, i) => (
                      <col key={i} style={{ width: w }} />
                    ))}
                    {TIER_COLUMNS.map((c) => (
                      <col key={c.pct} style={{ width: TIER_COL_W }} />
                    ))}
                  </colgroup>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-left">{t("references.colCircuit")}</TableHead>
                      <TableHead className="text-left">{t("references.colPatch")}</TableHead>
                      <TableHead className="text-right">{t("references.colQuali")}</TableHead>
                      <TableHead className="text-right">{t("references.colFastest")}</TableHead>
                      <TableHead className="text-left">{t("references.colCar")}</TableHead>
                      {TIER_COLUMNS.map((c) => (
                        <TableHead key={c.pct} className="text-right" style={{ color: c.color }}>
                          {c.pct}%
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((bm) => {
                      const my = showLevel
                        ? myBest.get(`${bm.track}::${bm.carClass}`)
                        : undefined;
                      const myPct = my ? tierPctOf(bm, my.best) : null;
                      return (
                        <TableRow key={bm.track}>
                          <TableCell className="py-1.5 px-3">
                            <span className="flex items-center gap-2">
                              <TrackFlag track={bm.track} />
                              <span className="truncate">{bm.track}</span>
                            </span>
                          </TableCell>
                          <TableCell className="py-1.5 px-2 text-left text-xs text-muted-foreground">{bm.patch || "—"}</TableCell>
                          <TableCell className="py-1.5 px-2 text-right font-mono font-semibold tabular-nums">{fmt(bm.hotlapTimeMs)}</TableCell>
                          <TableCell className="py-1.5 px-2 text-right font-mono tabular-nums text-yellow-400">{fmt(bm.fastestLapTimeMs)}</TableCell>
                          <TableCell className="truncate py-1.5 px-3 text-xs text-muted-foreground" title={bm.fastestCar}>{bm.fastestCar || "—"}</TableCell>
                          {TIER_COLUMNS.map((c) => {
                            const ms = bm.racePaceMs[c.key];
                            const mine = myPct === c.pct && !!my;
                            return (
                              <TableCell
                                key={c.pct}
                                className={cn(
                                  "py-1.5 px-2 text-right font-mono tabular-nums",
                                  mine &&
                                    "cursor-pointer ring-2 ring-inset ring-orange-500 hover:bg-orange-500/15",
                                )}
                                style={{ color: c.color }}
                                onClick={mine ? () => goSessions(my) : undefined}
                                title={mine ? t("references.viewSessions") : undefined}
                              >
                                {fmt(ms)}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}
