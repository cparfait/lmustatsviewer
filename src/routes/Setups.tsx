import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Plus,
  GitCompareArrows,
  RefreshCw,
  Grid3x3,
  Table as TableIcon,
  FileText,
  Edit3,
  Copy,
  Download,
  Trash2,
  Loader2,
  Car,
  MapPin,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  setups as setupsApi,
  type SetupGroup,
  type SetupSummary,
  type SvmFile,
} from "@/lib/api";
import { useAppStore } from "@/stores/app";
import { cn, formatTime } from "@/lib/utils";
import { ClassBadge } from "@/components/ClassBadge";
import { CarLogo } from "@/components/CarLogo";
import { NewSetupDialog } from "@/components/NewSetupDialog";
import { paramLabel } from "@/lib/setupParams";

// ── Helpers : extraction des stats QuickView depuis un `.svm` ────────────────

/**
 * Cherche la valeur d'un paramètre dans la 1ʳᵉ section/clé qui matche.
 * Insensible à la casse. Renvoie la valeur brute du .svm (souvent un nombre
 * ou « (Default) »).
 */
function findParam(
  svm: SvmFile,
  candidates: { section: string; keys: string[] }[]
): string | null {
  for (const { section, keys } of candidates) {
    const sec = svm.sections.find(
      (s) => s.name.toUpperCase() === section.toUpperCase()
    );
    if (!sec) continue;
    for (const k of keys) {
      const p = sec.params.find((p) => p.key.toLowerCase() === k.toLowerCase());
      if (p) return p.value;
    }
  }
  return null;
}

/** Retire les guillemets entourant une valeur de note. */
function unquote(v: string): string {
  return v.replace(/^"(.*)"$/s, "$1");
}

/** Couple clé brute + valeur (utile pour conserver le libellé d'origine). */
interface KeyedValue {
  key: string;
  value: string;
}

/** Stats clés affichées dans le QuickView (V1 « Électronique » + Pressions). */
interface QuickStats {
  /**
   * Tous les paramètres « TC* » trouvés dans la section CONTROLS / ENGINE
   * (V1 affichait TC, TC Power Cut, TC Slip Angle — typiquement 3 champs).
   */
  tcParams: KeyedValue[];
  abs: string | null;
  brakeBias: string | null;
  engineMap: string | null;
  pressureFL: string | null;
  pressureFR: string | null;
  pressureRL: string | null;
  pressureRR: string | null;
  notes: string | null;
}

/**
 * Trouve tous les paramètres d'une section dont la clé commence par `TC` ou
 * `TractionControl` (insensible à la casse), en préservant l'ordre du fichier.
 * Renvoie au maximum 3 entrées (V1 en avait 3).
 */
function findTcParams(svm: SvmFile): KeyedValue[] {
  const out: KeyedValue[] = [];
  for (const sec of svm.sections) {
    const upper = sec.name.toUpperCase();
    if (upper !== "CONTROLS" && upper !== "ENGINE") continue;
    for (const p of sec.params) {
      const k = p.key.toLowerCase();
      const isTc =
        k.startsWith("tc") ||
        k.startsWith("tractioncontrol") ||
        k === "traction";
      if (isTc) out.push({ key: p.key, value: p.value });
      if (out.length >= 3) return out;
    }
  }
  return out;
}

function extractQuickStats(svm: SvmFile): QuickStats {
  return {
    tcParams: findTcParams(svm),
    abs: findParam(svm, [
      { section: "CONTROLS", keys: ["AntiLockBrakes", "ABS"] },
    ]),
    brakeBias: findParam(svm, [
      { section: "CONTROLS", keys: ["BrakeBias", "RearBrake"] },
      { section: "BASIC", keys: ["BrakeBias"] },
    ]),
    engineMap: findParam(svm, [
      { section: "ENGINE", keys: ["EngineMapping", "EngineMap"] },
      { section: "CONTROLS", keys: ["EngineMapping"] },
    ]),
    pressureFL: findParam(svm, [
      { section: "FRONTLEFT", keys: ["Pressure"] },
    ]),
    pressureFR: findParam(svm, [
      { section: "FRONTRIGHT", keys: ["Pressure"] },
    ]),
    pressureRL: findParam(svm, [
      { section: "REARLEFT", keys: ["Pressure"] },
    ]),
    pressureRR: findParam(svm, [
      { section: "REARRIGHT", keys: ["Pressure"] },
    ]),
    notes: (() => {
      const v = findParam(svm, [{ section: "GENERAL", keys: ["Notes"] }]);
      return v ? unquote(v) : null;
    })(),
  };
}

// ── Composant principal ─────────────────────────────────────────────────────

export function Setups() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const lmuPath = useAppStore((s) => s.lmuPath);

  const [groups, setGroups] = useState<SetupGroup[]>([]);
  const [loading, setLoading] = useState(true);
  // Défaut « Tous les setups » : c'est la vue tableau plat qui sert d'index
  // d'entrée — l'utilisateur peut ensuite basculer vers la vue par voiture
  // ou par circuit pour explorer.
  const [view, setView] = useState<"car" | "global" | "circuit">("global");
  const [activeCircuit, setActiveCircuit] = useState<string | null>(null);
  const [activeCar, setActiveCar] = useState<string | null>(null);
  const [selectedSetupId, setSelectedSetupId] = useState<number | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);

  // Scan / liste à chaque visite (le résultat dérive du disque, jamais périmé).
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    (async () => {
      try {
        const data = lmuPath
          ? await setupsApi.scan(lmuPath)
          : await setupsApi.list();
        if (!ignore) {
          setGroups(data);
          // Auto-sélection de la 1ʳᵉ voiture du garage.
          if (data.length > 0 && !activeCar) {
            setActiveCar(data[0].car);
          }
        }
      } catch {
        if (!ignore) setGroups([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lmuPath]);

  async function handleRescan() {
    if (!lmuPath) return;
    setLoading(true);
    try {
      setGroups(await setupsApi.scan(lmuPath));
    } catch {
      /* dossier indisponible */
    } finally {
      setLoading(false);
    }
  }

  // Groupe de la voiture active (ou null).
  const activeGroup = useMemo(
    () => groups.find((g) => g.car === activeCar) ?? null,
    [groups, activeCar]
  );

  // Liste des voitures sous forme d'options groupées par classe.
  const carOptions = useMemo(() => {
    const byClass: Record<string, SetupGroup[]> = {};
    for (const g of groups) {
      (byClass[g.car_class] ??= []).push(g);
    }
    return byClass;
  }, [groups]);

  // ── Rendu principal ─────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* En-tête : titre + bascule vue + actions */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("setups.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("setups.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle vues : Tous (défaut, index) / Par voiture / Par circuit. */}
          <div className="flex border border-input rounded-md overflow-hidden">
            <button
              onClick={() => setView("global")}
              className={cn(
                "h-9 px-3 text-xs font-medium flex items-center gap-1.5 transition-colors",
                view === "global"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground"
              )}
            >
              <TableIcon className="h-3.5 w-3.5" /> {t("setups.viewGlobal")}
            </button>
            <button
              onClick={() => setView("car")}
              className={cn(
                "h-9 px-3 text-xs font-medium flex items-center gap-1.5 transition-colors border-l border-input",
                view === "car"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground"
              )}
            >
              <Car className="h-3.5 w-3.5" /> {t("setups.viewCar")}
            </button>
            <button
              onClick={() => setView("circuit")}
              className={cn(
                "h-9 px-3 text-xs font-medium flex items-center gap-1.5 transition-colors border-l border-input",
                view === "circuit"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground"
              )}
            >
              <MapPin className="h-3.5 w-3.5" /> {t("setups.viewCircuit")}
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleRescan}
            disabled={loading || !lmuPath}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />{" "}
            {t("setups.rescan")}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link to="/setups/compare">
              <GitCompareArrows className="h-4 w-4" /> {t("setups.compare")}
            </Link>
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setShowNewDialog(true)}
          >
            <Plus className="h-4 w-4" /> {t("setups.newSetup")}
          </Button>
        </div>
      </div>

      {loading && groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {lmuPath ? t("setups.scanning") : t("setups.configurePath")}
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("setups.noneFound")}
          </CardContent>
        </Card>
      ) : view === "global" ? (
        <GlobalView groups={groups} navigate={navigate} />
      ) : view === "circuit" ? (
        <CircuitView
          groups={groups}
          activeCircuit={activeCircuit}
          setActiveCircuit={(c) => {
            setActiveCircuit(c);
            setSelectedSetupId(null);
          }}
          selectedSetupId={selectedSetupId}
          setSelectedSetupId={setSelectedSetupId}
          navigate={navigate}
        />
      ) : (
        <CarView
          carOptions={carOptions}
          activeCar={activeCar}
          setActiveCar={(c) => {
            setActiveCar(c);
            setSelectedSetupId(null);
          }}
          activeGroup={activeGroup}
          selectedSetupId={selectedSetupId}
          setSelectedSetupId={setSelectedSetupId}
          navigate={navigate}
        />
      )}

      {showNewDialog && (
        <NewSetupDialog
          lmuPath={lmuPath}
          groups={groups}
          onClose={() => setShowNewDialog(false)}
          onCreated={(entry) => {
            setShowNewDialog(false);
            // `?edit=1` → la fiche entre directement en mode édition (l'utilisateur
            // vient juste de créer le setup, il veut le remplir).
            navigate(`/setups/${entry.id}?edit=1`);
          }}
        />
      )}
    </div>
  );
}

// ── Vue par voiture (sélecteur + hero + matrice + QuickView) ────────────────

function CarView({
  carOptions,
  activeCar,
  setActiveCar,
  activeGroup,
  selectedSetupId,
  setSelectedSetupId,
  navigate,
}: {
  carOptions: Record<string, SetupGroup[]>;
  activeCar: string | null;
  setActiveCar: (c: string) => void;
  activeGroup: SetupGroup | null;
  selectedSetupId: number | null;
  setSelectedSetupId: (id: number | null) => void;
  navigate: (path: string) => void;
}) {
  const { t } = useTranslation();

  const totalSetups = activeGroup
    ? activeGroup.tracks.reduce((acc, tr) => acc + tr.setups.length, 0)
    : 0;

  // Matrice : 1 ligne par circuit ; 3 colonnes (Qualif/Course/Autres) contenant
  // les setups du combo. Tri par nom de circuit.
  const matrixRows = useMemo(() => {
    if (!activeGroup) return [];
    return [...activeGroup.tracks]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((tr) => {
        const byType: Record<string, SetupSummary[]> = {
          Qualif: [],
          Course: [],
          Autres: [],
        };
        for (const s of tr.setups) {
          const key = (
            ["Qualif", "Course", "Autres"].includes(s.setup_type)
              ? s.setup_type
              : "Autres"
          ) as "Qualif" | "Course" | "Autres";
          byType[key].push(s);
        }
        return { circuit: tr.name, byType };
      });
  }, [activeGroup]);

  return (
    <div className="flex flex-col gap-4">
      {/* Sélecteur voiture (groupé par classe) — picto à gauche, select étendu. */}
      <Card>
        <CardContent className="p-2.5 flex items-center gap-2.5 flex-wrap">
          <Car
            className="h-4 w-4 text-muted-foreground shrink-0"
            aria-label={t("setups.car")}
          />
          <select
            value={activeCar ?? ""}
            onChange={(e) => setActiveCar(e.target.value)}
            className="flex-1 min-w-[280px] rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{t("setups.selectCar")}</option>
            {Object.entries(carOptions).map(([cls, gs]) => (
              <optgroup key={cls} label={cls}>
                {gs.map((g) => {
                  const total = g.tracks.reduce(
                    (acc, tr) => acc + tr.setups.length,
                    0
                  );
                  return (
                    <option key={g.car} value={g.car}>
                      {g.car} ({total})
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Hero voiture active — compact (logo + nom + classe + total en
          ligne, padding réduit pour ne pas écraser la matrice). */}
      {activeGroup && (
        <Card className="overflow-hidden">
          <CardContent className="p-2.5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-md border border-border flex items-center justify-center p-1 shrink-0 bg-background/40">
                <CarLogo
                  carName={activeGroup.car}
                  className="max-h-full max-w-full object-contain opacity-90"
                />
              </div>
              <div className="min-w-0 flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold tracking-tight truncate">
                  {activeGroup.car}
                </h2>
                <ClassBadge carClass={activeGroup.car_class} size="sm" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
                {t("setups.totalSetups")}
              </span>
              <span className="text-base font-bold tabular-nums">
                {totalSetups}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Matrice + QuickView */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Matrice par circuit (2/3) */}
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="bg-primary text-primary-foreground px-4 py-1.5 flex items-center gap-2">
              <Grid3x3 className="h-3.5 w-3.5" />
              <h3 className="text-sm font-bold tracking-tight">
                {t("setups.matrixTitle")}
              </h3>
            </div>
            <CardContent className="p-0">
              {matrixRows.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {t("setups.matrixEmpty")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-primary/15 dark:bg-primary/10 border-b border-primary/30">
                      <tr className="text-[10px] uppercase tracking-wide text-yellow-900 dark:text-yellow-100">
                        <th className="text-left px-3 py-1.5 font-medium">
                          <Tip content={t("setups.circuitTip")}>{t("setups.circuit")}</Tip>
                        </th>
                        <th className="text-left px-3 py-1.5 font-medium border-l border-border/55">
                          <Tip content={t("setups.typeQualifTip")}>{t("setups.typeQualif")}</Tip>
                        </th>
                        <th className="text-left px-3 py-1.5 font-medium border-l border-border/55">
                          <Tip content={t("setups.typeRaceTip")}>{t("setups.typeRace")}</Tip>
                        </th>
                        <th className="text-left px-3 py-1.5 font-medium border-l border-border/55">
                          <Tip content={t("setups.typeOtherTip")}>{t("setups.typeOther")}</Tip>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrixRows.map((row, idx) => (
                        <tr
                          key={row.circuit}
                          className={cn(
                            "border-b border-border/40 last:border-0",
                            idx % 2 === 1 && "bg-muted/20"
                          )}
                        >
                          <td className="px-3 py-1.5 font-medium">
                            {row.circuit}
                          </td>
                          {(["Qualif", "Course", "Autres"] as const).map(
                            (type) => (
                              <td
                                key={type}
                                className="px-2 py-1.5 border-l border-border/55"
                              >
                                <MatrixCell
                                  setups={row.byType[type]}
                                  selectedId={selectedSetupId}
                                  onSelect={setSelectedSetupId}
                                />
                              </td>
                            )
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* QuickView (1/3) */}
        <div className="lg:col-span-1">
          <QuickView
            setupId={selectedSetupId}
            allSetups={activeGroup}
            navigate={navigate}
          />
        </div>
      </div>
    </div>
  );
}

/** Cellule de matrice : liste compacte de setups cliquables avec leur best lap. */
function MatrixCell({
  setups,
  selectedId,
  onSelect,
}: {
  setups: SetupSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  if (setups.length === 0) {
    return <span className="text-muted-foreground/40 text-xs">—</span>;
  }
  // Meilleur tour de la cellule (parmi les setups qui ont un best_lap).
  const bestOfCell = setups.reduce<number | null>((min, s) => {
    if (s.best_lap == null) return min;
    return min == null || s.best_lap < min ? s.best_lap : min;
  }, null);
  return (
    <div className="flex flex-col gap-1">
      {setups.map((s) => {
        const selected = s.id === selectedId;
        const isCellBest =
          s.best_lap != null &&
          bestOfCell != null &&
          Math.abs(s.best_lap - bestOfCell) < 0.0005;
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={cn(
              "text-left flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono transition-colors",
              selected
                ? "bg-primary text-primary-foreground"
                : "bg-muted/40 hover:bg-accent text-foreground"
            )}
            title={s.name}
          >
            <FileText className="h-3 w-3 shrink-0 opacity-70" />
            <span className="truncate flex-1 min-w-0">
              {s.name.replace(/\.svm$/i, "")}
            </span>
            {s.best_lap != null ? (
              <span
                className={cn(
                  "shrink-0 tabular-nums text-[10px] font-semibold",
                  selected
                    ? "text-primary-foreground/90"
                    : isCellBest
                    ? "text-success"
                    : "text-muted-foreground"
                )}
              >
                {formatTime(s.best_lap)}
              </span>
            ) : (
              <span
                className={cn(
                  "shrink-0 text-[10px] font-mono",
                  selected
                    ? "text-primary-foreground/50"
                    : "text-muted-foreground/40"
                )}
              >
                —
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── QuickView : panneau détail du setup sélectionné ─────────────────────────

function QuickView({
  setupId,
  allSetups,
  navigate,
}: {
  setupId: number | null;
  allSetups: SetupGroup | null;
  navigate: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [svm, setSvm] = useState<SvmFile | null>(null);
  const [loading, setLoading] = useState(false);

  // Trouve le résumé du setup sélectionné dans la voiture active.
  const summary = useMemo(() => {
    if (!setupId || !allSetups) return null;
    for (const tr of allSetups.tracks) {
      const s = tr.setups.find((x) => x.id === setupId);
      if (s) return { setup: s, circuit: tr.name };
    }
    return null;
  }, [setupId, allSetups]);

  // Charge le contenu .svm à chaque changement de setup sélectionné.
  useEffect(() => {
    let cancelled = false;
    if (!setupId) {
      setSvm(null);
      return;
    }
    setLoading(true);
    setupsApi
      .getContent(setupId)
      .then((s) => {
        if (!cancelled) setSvm(s);
      })
      .catch(() => {
        if (!cancelled) setSvm(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setupId]);

  const stats = useMemo(() => (svm ? extractQuickStats(svm) : null), [svm]);

  // ── États ───────────────────────────────────────────────────────────────
  if (!setupId) {
    return (
      <Card className="h-full">
        <CardContent className="py-10 px-4 flex flex-col items-center justify-center text-center gap-3 text-muted-foreground">
          <div className="h-12 w-12 rounded-xl border border-border flex items-center justify-center">
            <FileText className="h-5 w-5 opacity-50" />
          </div>
          <p className="text-xs leading-relaxed">
            {t("setups.quickViewEmpty")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* En-tête : nom + circuit + type + actions */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-0.5">
              {summary?.setup.setup_type ?? "—"}
            </p>
            <h3 className="font-mono text-sm font-bold truncate">
              {summary?.setup.name.replace(/\.svm$/i, "") ?? "—"}
            </h3>
            <p className="text-[11px] text-muted-foreground truncate">
              {summary?.circuit ?? "—"}
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => navigate(`/setups/${setupId}?edit=1`)}
              title={t("setups.edit")}
            >
              <Edit3 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => navigate(`/setups/${setupId}`)}
              title={t("setups.open")}
            >
              <FileText className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={async () => {
                if (!summary) return;
                const baseName = summary.setup.name.replace(/\.svm$/i, "");
                const newName = prompt(t("setups.duplicateAs"), `${baseName}_copy`);
                if (!newName) return;
                try {
                  const e = await setupsApi.duplicate(setupId, newName);
                  navigate(`/setups/${e.id}`);
                } catch (err) {
                  alert(String(err));
                }
              }}
              title={t("setups.duplicate")}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={async () => {
                if (!summary) return;
                try {
                  await setupsApi.export(setupId, summary.setup.name);
                  alert(t("setups.exported"));
                } catch (err) {
                  alert(String(err));
                }
              }}
              title={t("setups.export")}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={async () => {
                if (!confirm(t("setups.confirmDelete"))) return;
                try {
                  await setupsApi.remove(setupId, true);
                  // Forçage du re-scan via reset (le parent ré-affiche au prochain mount)
                  window.location.reload();
                } catch (err) {
                  alert(String(err));
                }
              }}
              title={t("setups.delete")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Corps */}
      <CardContent className="p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !stats ? (
          <p className="text-xs text-muted-foreground italic text-center py-4">
            {t("setups.quickViewNoContent")}
          </p>
        ) : (
          <>
            {/* Électronique — 3 champs TC (V1) + ABS + Bias + Map. */}
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                {t("setups.qvElectronics")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {stats.tcParams.length > 0 ? (
                  stats.tcParams.map((p) => (
                    <QvCard
                      key={p.key}
                      label={paramLabel(p.key)}
                      value={p.value || null}
                      accent="text-yellow-500"
                    />
                  ))
                ) : (
                  // Aucun param TC trouvé : on garde au moins une carte
                  // « TC » vide pour rappeler la structure.
                  <QvCard label="TC" value={null} accent="text-yellow-500" />
                )}
                <QvCard label="ABS" value={stats.abs} accent="text-rose-400" />
                <QvCard
                  label={t("setups.qvBias")}
                  value={stats.brakeBias}
                  accent="text-foreground"
                />
                <QvCard
                  label={t("setups.qvMap")}
                  value={stats.engineMap}
                  accent="text-foreground"
                />
              </div>
            </div>

            {/* Pressions pneus */}
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                {t("setups.qvPressures")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <QvCard label="FL" value={stats.pressureFL} accent="text-sky-400" center />
                <QvCard label="FR" value={stats.pressureFR} accent="text-sky-400" center />
                <QvCard label="RL" value={stats.pressureRL} accent="text-sky-400" center />
                <QvCard label="RR" value={stats.pressureRR} accent="text-sky-400" center />
              </div>
            </div>

            {/* Notes */}
            {stats.notes && stats.notes.trim() !== "" && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  {t("setups.qvNotes")}
                </p>
                <div className="rounded-md border border-border/60 bg-background/40 p-3">
                  <p className="text-xs text-muted-foreground leading-relaxed italic whitespace-pre-wrap">
                    {stats.notes}
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Mini-carte de valeur pour le QuickView (V1 `.qv-card`). */
function QvCard({
  label,
  value,
  accent,
  center,
}: {
  label: string;
  value: string | null;
  accent: string;
  center?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5",
        center && "text-center"
      )}
    >
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">
        {label}
      </p>
      <p
        className={cn(
          "font-mono text-sm font-bold tabular-nums truncate",
          value ? accent : "text-muted-foreground/40"
        )}
        title={value ?? undefined}
      >
        {value ?? "—"}
      </p>
    </div>
  );
}

// ── Vue globale : tableau plat de tous les setups ───────────────────────────

function GlobalView({
  groups,
  navigate,
}: {
  groups: SetupGroup[];
  navigate: (path: string) => void;
}) {
  const { t } = useTranslation();

  // Aplatit toute la hiérarchie (voiture → circuit → setups) en lignes.
  // Tri : ordre canonique des classes V1 (Hyper, LMP2 ELMS, LMP2 WEC, LMP2,
  // LMP3, GT3, GTE), puis voiture / circuit / nom de setup alphabétique.
  const rows = useMemo(() => {
    const CLASS_ORDER = [
      "Hypercar",
      "Hyper",
      "LMP2 ELMS",
      "LMP2_ELMS",
      "LMP2 WEC",
      "LMP2_WEC",
      "LMP2",
      "LMP3",
      "GT3",
      "GTE",
    ];
    const classRank = (c: string) => {
      const i = CLASS_ORDER.indexOf(c);
      return i === -1 ? 99 : i;
    };
    const out: {
      car: string;
      carClass: string;
      circuit: string;
      setup: SetupSummary;
    }[] = [];
    for (const g of groups) {
      for (const tr of g.tracks) {
        for (const s of tr.setups) {
          out.push({
            car: g.car,
            carClass: g.car_class,
            circuit: tr.name,
            setup: s,
          });
        }
      }
    }
    return out.sort((a, b) => {
      const byClass = classRank(a.carClass) - classRank(b.carClass);
      if (byClass !== 0) return byClass;
      const byCar = a.car.localeCompare(b.car);
      if (byCar !== 0) return byCar;
      const byCircuit = a.circuit.localeCompare(b.circuit);
      if (byCircuit !== 0) return byCircuit;
      return a.setup.name.localeCompare(b.setup.name);
    });
  }, [groups]);

  return (
    <Card className="overflow-hidden">
      <div className="bg-primary text-primary-foreground px-4 py-1.5 flex items-center gap-2">
        <TableIcon className="h-3.5 w-3.5" />
        <h3 className="text-sm font-bold tracking-tight">
          {t("setups.globalTitle")}
        </h3>
        <span className="ml-auto text-xs font-semibold">
          {rows.length} {t("setups.setups")}
        </span>
      </div>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-primary/15 dark:bg-primary/10 border-b border-primary/30">
              <tr className="text-[10px] uppercase tracking-wide text-yellow-900 dark:text-yellow-100">
                <th className="text-left px-3 py-1.5 font-medium">
                  <Tip content={t("setups.classTip")}>{t("setups.class")}</Tip>
                </th>
                <th className="px-1 py-1.5 w-7" aria-hidden />
                <th className="text-left px-2 py-1.5 font-medium">
                  <Tip content={t("setups.carTip")}>{t("setups.car")}</Tip>
                </th>
                <th className="text-left px-3 py-1.5 font-medium">
                  <Tip content={t("setups.circuitTip")}>{t("setups.circuit")}</Tip>
                </th>
                <th className="text-left px-3 py-1.5 font-medium">
                  <Tip content={t("setups.setupTip")}>{t("setups.setup")}</Tip>
                </th>
                <th className="text-left px-3 py-1.5 font-medium">
                  <Tip content={t("setups.newTypeTip")}>{t("setups.newType")}</Tip>
                </th>
                <th className="text-left px-3 py-1.5 font-medium">
                  <Tip content={t("setups.sourceLabelTip")}>{t("setups.sourceLabel")}</Tip>
                </th>
                <th className="text-right px-3 py-1.5 font-medium">
                  <Tip content={t("setups.modifiedTip")}>{t("setups.modified")}</Tip>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr
                  key={r.setup.id}
                  onClick={() => navigate(`/setups/${r.setup.id}`)}
                  className={cn(
                    "border-b border-border/40 last:border-0 cursor-pointer hover:bg-accent/40 transition-colors",
                    idx % 2 === 1 && "bg-muted/20"
                  )}
                >
                  <td className="px-3 py-1.5">
                    <ClassBadge carClass={r.carClass} size="sm" />
                  </td>
                  <td className="px-1 py-1.5 w-7">
                    <CarLogo
                      carName={r.car}
                      className="h-4 w-auto object-contain opacity-80"
                    />
                  </td>
                  <td className="px-2 py-1.5 font-medium whitespace-nowrap">
                    {r.car}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {r.circuit}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs">
                    {r.setup.name}
                  </td>
                  <td className="px-3 py-1.5 text-xs">{r.setup.setup_type}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                        r.setup.source === "game"
                          ? "bg-primary/15 text-yellow-500"
                          : "bg-emerald-500/15 text-emerald-400"
                      )}
                    >
                      {r.setup.source === "game"
                        ? t("setupDetail.sourceGame")
                        : t("setupDetail.sourceApp")}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs text-muted-foreground">
                    {r.setup.updated_at}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Vue par circuit (mirror de CarView, groupé par circuit) ─────────────────

function CircuitView({
  groups,
  activeCircuit,
  setActiveCircuit,
  selectedSetupId,
  setSelectedSetupId,
  navigate,
}: {
  groups: SetupGroup[];
  activeCircuit: string | null;
  setActiveCircuit: (c: string) => void;
  selectedSetupId: number | null;
  setSelectedSetupId: (id: number | null) => void;
  navigate: (path: string) => void;
}) {
  const { t } = useTranslation();

  // Liste de tous les circuits trouvés, avec compteur total de setups.
  const circuitsList = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of groups) {
      for (const tr of g.tracks) {
        map.set(tr.name, (map.get(tr.name) ?? 0) + tr.setups.length);
      }
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => ({ name, count }));
  }, [groups]);

  // Auto-sélection du 1er circuit si aucun n'est encore actif.
  useEffect(() => {
    if (!activeCircuit && circuitsList.length > 0) {
      setActiveCircuit(circuitsList[0].name);
    }
  }, [activeCircuit, circuitsList, setActiveCircuit]);

  // Construit la matrice « voiture × type » pour le circuit actif.
  const matrixRows = useMemo(() => {
    if (!activeCircuit) return [];
    type CarRow = {
      car: string;
      carClass: string;
      byType: Record<string, SetupSummary[]>;
    };
    const out: CarRow[] = [];
    for (const g of groups) {
      const track = g.tracks.find((tr) => tr.name === activeCircuit);
      if (!track) continue;
      const byType: Record<string, SetupSummary[]> = {
        Qualif: [],
        Course: [],
        Autres: [],
      };
      for (const s of track.setups) {
        const key = (
          ["Qualif", "Course", "Autres"].includes(s.setup_type)
            ? s.setup_type
            : "Autres"
        ) as "Qualif" | "Course" | "Autres";
        byType[key].push(s);
      }
      out.push({ car: g.car, carClass: g.car_class, byType });
    }
    return out.sort((a, b) => a.car.localeCompare(b.car));
  }, [groups, activeCircuit]);

  const totalSetups = matrixRows.reduce(
    (acc, r) =>
      acc +
      r.byType.Qualif.length +
      r.byType.Course.length +
      r.byType.Autres.length,
    0
  );

  // Setup group « virtuel » pour permettre à QuickView de retrouver le
  // résumé d'un setup sélectionné dans la matrice circuit.
  const virtualGroup = useMemo<SetupGroup | null>(() => {
    if (!activeCircuit) return null;
    const setups: SetupSummary[] = [];
    for (const g of groups) {
      const tr = g.tracks.find((t) => t.name === activeCircuit);
      if (tr) setups.push(...tr.setups);
    }
    return {
      car: activeCircuit,
      car_class: "",
      tracks: [{ name: activeCircuit, setups }],
    };
  }, [groups, activeCircuit]);

  return (
    <div className="flex flex-col gap-4">
      {/* Sélecteur circuit */}
      <Card>
        <CardContent className="p-2.5 flex items-center gap-2.5 flex-wrap">
          <MapPin
            className="h-4 w-4 text-muted-foreground shrink-0"
            aria-label={t("setups.circuit")}
          />
          <select
            value={activeCircuit ?? ""}
            onChange={(e) => setActiveCircuit(e.target.value)}
            className="flex-1 min-w-[280px] rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{t("setups.selectCircuit")}</option>
            {circuitsList.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Hero circuit actif — compact (icône + nom + total). */}
      {activeCircuit && (
        <Card className="overflow-hidden">
          <CardContent className="p-2.5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-md border border-border flex items-center justify-center p-1 shrink-0 bg-background/40">
                <MapPin className="h-5 w-5 text-muted-foreground" />
              </div>
              <h2 className="text-base font-bold tracking-tight truncate">
                {activeCircuit}
              </h2>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
                {t("setups.totalSetups")}
              </span>
              <span className="text-base font-bold tabular-nums">
                {totalSetups}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Matrice voiture × type + QuickView */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="bg-primary text-primary-foreground px-4 py-1.5 flex items-center gap-2">
              <Grid3x3 className="h-3.5 w-3.5" />
              <h3 className="text-sm font-bold tracking-tight">
                {t("setups.matrixCircuitTitle")}
              </h3>
            </div>
            <CardContent className="p-0">
              {matrixRows.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {t("setups.matrixEmptyCircuit")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-primary/15 dark:bg-primary/10 border-b border-primary/30">
                      <tr className="text-[10px] uppercase tracking-wide text-yellow-900 dark:text-yellow-100">
                        <th className="text-left px-3 py-1.5 font-medium">
                          <Tip content={t("setups.carTip")}>{t("setups.car")}</Tip>
                        </th>
                        <th className="text-left px-3 py-1.5 font-medium border-l border-border/55">
                          <Tip content={t("setups.typeQualifTip")}>{t("setups.typeQualif")}</Tip>
                        </th>
                        <th className="text-left px-3 py-1.5 font-medium border-l border-border/55">
                          <Tip content={t("setups.typeRaceTip")}>{t("setups.typeRace")}</Tip>
                        </th>
                        <th className="text-left px-3 py-1.5 font-medium border-l border-border/55">
                          <Tip content={t("setups.typeOtherTip")}>{t("setups.typeOther")}</Tip>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrixRows.map((row, idx) => (
                        <tr
                          key={row.car}
                          className={cn(
                            "border-b border-border/40 last:border-0",
                            idx % 2 === 1 && "bg-muted/20"
                          )}
                        >
                          <td className="px-3 py-1.5">
                            <span className="inline-flex items-center gap-1.5">
                              <CarLogo
                                carName={row.car}
                                className="h-4 w-auto object-contain opacity-80"
                              />
                              <span className="font-medium truncate">
                                {row.car}
                              </span>
                            </span>
                          </td>
                          {(["Qualif", "Course", "Autres"] as const).map(
                            (type) => (
                              <td
                                key={type}
                                className="px-2 py-1.5 border-l border-border/55"
                              >
                                <MatrixCell
                                  setups={row.byType[type]}
                                  selectedId={selectedSetupId}
                                  onSelect={setSelectedSetupId}
                                />
                              </td>
                            )
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* QuickView — réutilise le composant existant avec un SetupGroup
            virtuel construit pour le circuit actif. */}
        <div className="lg:col-span-1">
          <QuickView
            setupId={selectedSetupId}
            allSetups={virtualGroup}
            navigate={navigate}
          />
        </div>
      </div>
    </div>
  );
}
