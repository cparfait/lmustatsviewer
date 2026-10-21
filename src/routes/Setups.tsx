import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Plus,
  GitCompareArrows,
  RefreshCw,
  Table as TableIcon,
  FileText,
  Edit3,
  Copy,
  Download,
  Trash2,
  Loader2,
  Car,
  MapPin,
  Search,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { TableTitle } from "@/components/TableTitle";
import { SourceBadge } from "@/components/SourceBadge";
import {
  setups as setupsApi,
  type SetupGroup,
  type SetupSummary,
  type SvmFile,
} from "@/lib/api";
import { useAppStore } from "@/stores/app";
import { cn, formatTime } from "@/lib/utils";
import { usePageState } from "@/lib/usePageState";
import {
  confirmDialog,
  promptDialog,
  toastError,
  toastSuccess,
} from "@/stores/dialogs";
import { ClassBadge } from "@/components/ClassBadge";
import { CarLogo } from "@/components/CarLogo";
import { CarImage } from "@/components/CarImage";
import { TrackFlag } from "@/components/TrackFlag";
import { NewSetupDialog } from "@/components/NewSetupDialog";
import { keyFigures, notesOf, perCorner } from "@/lib/setupView";

/** Libellé traduit d'un type de setup (valeurs en base : Course / Qualif / Autres). */
function typeLabel(type: string, t: (k: string) => string): string {
  if (type === "Course") return t("setupDetail.typeRace");
  if (type === "Qualif") return t("setupDetail.typeQualif");
  return t("setupDetail.typeOther");
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
  const [view, setView] = usePageState<"car" | "global" | "circuit">("setups.view", "global");
  const [activeCircuit, setActiveCircuit] = usePageState<string | null>("setups.circuit", null);
  const [activeCar, setActiveCar] = usePageState<string | null>("setups.car", null);
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
          // Auto-sélection de la 1ʳᵉ voiture du garage (aussi si la voiture
          // retenue de la visite précédente n'y est plus).
          if (data.length > 0 && !data.some((g) => g.car === activeCar)) {
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

  // Après une suppression : la liste vient de la base (pas besoin de rescanner
  // le disque) et la sélection disparue est oubliée.
  async function afterDelete() {
    setSelectedSetupId(null);
    try {
      setGroups(await setupsApi.list());
    } catch {
      /* liste indisponible : l'ancienne reste affichée */
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
          onDeleted={afterDelete}
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
          onDeleted={afterDelete}
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

// ── Vues par voiture / par circuit : liste à gauche, cartes au centre, fiche à droite ──

const TYPE_ORDER = ["Qualif", "Course", "Autres"] as const;
type SetupKind = (typeof TYPE_ORDER)[number];
const kindOf = (s: SetupSummary): SetupKind => (TYPE_ORDER.includes(s.setup_type as SetupKind) ? (s.setup_type as SetupKind) : "Autres");

/** Étiquette de type colorée (Qualif / Course / Autres). */
function KindTag({ kind, active }: { kind: SetupKind; active?: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "w-14 shrink-0 rounded px-1 py-px text-center text-micro font-bold uppercase tracking-wide",
        active
          ? "bg-primary-foreground/20 text-primary-foreground"
          : kind === "Qualif"
            ? "bg-violet-500/15 text-violet-600 dark:text-violet-300"
            : kind === "Course"
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground",
      )}
    >
      {typeLabel(kind, t)}
    </span>
  );
}

/** Colonne de gauche : recherche + liste cliquable (voitures par classe, ou circuits). */
function SideList({
  sections,
  activeKey,
  onPick,
  placeholder,
}: {
  sections: { title?: ReactNode; items: { key: string; label: ReactNode; text: string; count: number }[] }[];
  activeKey: string | null;
  onPick: (key: string) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = sections
    .map((s) => ({ ...s, items: s.items.filter((it) => !q || it.text.toLowerCase().includes(q)) }))
    .filter((s) => s.items.length > 0);
  return (
    <Card className="overflow-hidden lg:sticky lg:top-3">
      <div className="border-b border-border/60 p-2">
        <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </div>
      <div className="max-h-[70vh] overflow-y-auto py-1">
        {shown.map((s, i) => (
          <div key={i} className="pb-1">
            {s.title && <div className="px-3 pb-1 pt-2">{s.title}</div>}
            {s.items.map((it) => {
              const on = it.key === activeKey;
              return (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => onPick(it.key)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
                    on ? "bg-primary text-primary-foreground" : "hover:bg-accent/50",
                  )}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2 truncate">{it.label}</span>
                  <span className={cn("shrink-0 rounded-full px-1.5 text-micro font-semibold tabular-nums", on ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground")}>
                    {it.count}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Carte d'un combo (un circuit pour la vue voiture, une voiture pour la vue circuit). */
function ComboCard({
  header,
  setups,
  selectedId,
  onSelect,
}: {
  header: ReactNode;
  setups: SetupSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const sorted = [...setups].sort((a, b) => TYPE_ORDER.indexOf(kindOf(a)) - TYPE_ORDER.indexOf(kindOf(b)) || a.name.localeCompare(b.name));
  // Meilleur tour de la carte (parmi les setups qui ont un best_lap).
  const best = setups.reduce<number | null>((m, s) => (s.best_lap == null ? m : m == null || s.best_lap < m ? s.best_lap : m), null);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-2">
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-sm font-semibold">{header}</span>
        <span className="shrink-0 rounded-full bg-background px-1.5 text-micro font-semibold tabular-nums text-muted-foreground">{setups.length}</span>
      </div>
      <div className="flex flex-col gap-0.5 p-1.5">
        {sorted.map((s) => {
          const on = s.id === selectedId;
          const isBest = s.best_lap != null && best != null && Math.abs(s.best_lap - best) < 0.0005;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              title={s.name}
              className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors", on ? "bg-primary text-primary-foreground" : "hover:bg-accent/60")}
            >
              <KindTag kind={kindOf(s)} active={on} />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{s.name.replace(/\.svm$/i, "")}</span>
              {s.best_lap != null && (
                <span className={cn("shrink-0 font-mono text-micro font-semibold tabular-nums", on ? "text-primary-foreground/90" : isBest ? "text-success" : "text-muted-foreground")}>
                  {formatTime(s.best_lap)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/** Bandeau de la sélection : repère devant le nom (drapeau), nom, compteurs, visuel à droite. */
function Hero({ visual, lead, title, badge, setups, other, otherKey }: { visual?: ReactNode; lead?: ReactNode; title: string; badge?: ReactNode; setups: number; other: number; otherKey: string }) {
  const { t } = useTranslation();
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {lead}
            <h2 className="truncate text-lg font-bold">{title}</h2>
            {badge}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("setups.countSetups", { count: setups })} · {t(otherKey, { count: other })}
          </p>
        </div>
        {visual}
      </CardContent>
    </Card>
  );
}

/** Grille : liste | cartes | fiche rapide. */
function BrowseLayout({ side, main, quick }: { side: ReactNode; main: ReactNode; quick: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] 2xl:grid-cols-[16rem_minmax(0,1fr)_24rem]">
      {side}
      <div className="flex min-w-0 flex-col gap-4">{main}</div>
      {/* Une seule fiche : sous les cartes, ou en 3ᵉ colonne sur grand écran. */}
      <div className="min-w-0 lg:col-start-2 2xl:sticky 2xl:top-3 2xl:col-start-3 2xl:row-start-1">{quick}</div>
    </div>
  );
}

function CarView({
  carOptions,
  activeCar,
  setActiveCar,
  activeGroup,
  selectedSetupId,
  setSelectedSetupId,
  navigate,
  onDeleted,
}: {
  onDeleted: () => void;
  carOptions: Record<string, SetupGroup[]>;
  activeCar: string | null;
  setActiveCar: (c: string) => void;
  activeGroup: SetupGroup | null;
  selectedSetupId: number | null;
  setSelectedSetupId: (id: number | null) => void;
  navigate: (path: string) => void;
}) {
  const { t } = useTranslation();
  const sections = Object.entries(carOptions).map(([cls, gs]) => ({
    title: <ClassBadge carClass={cls} solid />,
    items: [...gs]
      .sort((a, b) => a.car.localeCompare(b.car))
      .map((g) => ({
        key: g.car,
        text: `${g.car} ${cls}`,
        count: g.tracks.reduce((n, tr) => n + tr.setups.length, 0),
        label: (
          <>
            <CarLogo carName={g.car} className="h-4 w-5 shrink-0 object-contain opacity-80" />
            <span className="truncate">{g.car}</span>
          </>
        ),
      })),
  }));
  const tracks = activeGroup ? [...activeGroup.tracks].sort((a, b) => a.name.localeCompare(b.name)) : [];
  const total = tracks.reduce((n, tr) => n + tr.setups.length, 0);

  return (
    <BrowseLayout
      side={<SideList sections={sections} activeKey={activeCar} onPick={setActiveCar} placeholder={t("setups.searchCar")} />}
      main={
        <>
          {activeGroup && (
            <Hero
              title={activeGroup.car}
              badge={<ClassBadge carClass={activeGroup.car_class} solid />}
              setups={total}
              other={tracks.length}
              otherKey="setups.countCircuits"
              visual={
                <CarImage
                  carName={activeGroup.car}
                  className="h-16 w-auto max-w-[260px] shrink-0 object-contain [mask-image:linear-gradient(to_right,transparent,black_18%)]"
                />
              }
            />
          )}
          {tracks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">{t("setups.matrixEmpty")}</CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {tracks.map((tr) => (
                <ComboCard
                  key={tr.name}
                  header={
                    <>
                      <TrackFlag track={tr.name} />
                      <span className="truncate">{tr.name}</span>
                    </>
                  }
                  setups={tr.setups}
                  selectedId={selectedSetupId}
                  onSelect={setSelectedSetupId}
                />
              ))}
            </div>
          )}
        </>
      }
      quick={<QuickView setupId={selectedSetupId} allSetups={activeGroup} navigate={navigate} onDeleted={onDeleted} />}
    />
  );
}

// ── QuickView : panneau détail du setup sélectionné ─────────────────────────

function QuickView({
  setupId,
  allSetups,
  navigate,
  onDeleted,
}: {
  setupId: number | null;
  allSetups: SetupGroup | null;
  navigate: (path: string) => void;
  /** Après suppression : la liste se recharge, sans relancer l'application. */
  onDeleted: () => void;
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

  const figures = useMemo(() => (svm ? keyFigures(svm) : null), [svm]);
  const corners = useMemo(
    () =>
      svm
        ? {
            pressure: perCorner(svm, /^PressureSetting$/),
            camber: perCorner(svm, /^CamberSetting$/),
            ride: perCorner(svm, /^RideHeightSetting$/),
          }
        : null,
    [svm],
  );
  const notes = useMemo(() => (svm ? notesOf(svm) : null), [svm]);

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
            <p className="text-micro uppercase tracking-widest text-muted-foreground font-bold mb-0.5">
              {summary ? typeLabel(summary.setup.setup_type, t) : "—"}
            </p>
            <h3 className="font-mono text-sm font-bold truncate">
              {summary?.setup.name.replace(/\.svm$/i, "") ?? "—"}
            </h3>
            <p className="text-mini text-muted-foreground truncate">
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
                const newName = await promptDialog({
                  message: t("setups.duplicateAs"),
                  defaultValue: `${baseName}_copy`,
                });
                if (!newName) return;
                try {
                  const e = await setupsApi.duplicate(setupId, newName);
                  navigate(`/setups/${e.id}`);
                } catch (err) {
                  toastError(String(err));
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
                  // On passait ici le simple NOM du setup comme chemin : le
                  // fichier atterrissait dans le dossier courant du processus
                  // (souvent `C:\Program Files\...`), donc introuvable pour
                  // l'utilisateur — ou refusé faute de droits. On demande
                  // maintenant la destination via la boîte de dialogue système.
                  const { save } = await import("@tauri-apps/plugin-dialog");
                  const dest = await save({
                    defaultPath: summary.setup.name,
                    filters: [{ name: "Setup LMU", extensions: ["svm"] }],
                  });
                  if (!dest) return; // export annulé par l'utilisateur
                  await setupsApi.export(setupId, dest);
                  toastSuccess(t("setups.exported"));
                } catch (err) {
                  toastError(String(err));
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
                const ok = await confirmDialog({
                  message: t("setups.confirmDelete"),
                  destructive: true,
                  confirmLabel: t("setups.delete"),
                });
                if (!ok) return;
                try {
                  await setupsApi.remove(setupId, true);
                  onDeleted();
                } catch (err) {
                  toastError(String(err));
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
        ) : !figures || !corners ? (
          <p className="text-xs text-muted-foreground italic text-center py-4">
            {t("setups.quickViewNoContent")}
          </p>
        ) : (
          <>
            {/* Chiffres clés : la valeur affichée au garage, seulement ce que la voiture règle. */}
            <div>
              <p className="text-micro font-bold uppercase tracking-widest text-muted-foreground mb-2">
                {t("setups.qvKey")}
              </p>
              {figures.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">{t("setups.qvNoKey")}</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {figures.map((f) => (
                    <QvCard key={f.id} label={t(`setups.key.${f.id}`)} value={f.value} accent="text-foreground" />
                  ))}
                </div>
              )}
            </div>

            {/* Par roue : pression, carrossage, hauteur (seulement les lignes connues). */}
            {(["pressure", "camber", "ride"] as const).map((k) => {
              const c = corners[k];
              if (!c.FL && !c.FR && !c.RL && !c.RR) return null;
              return (
                <div key={k}>
                  <p className="text-micro font-bold uppercase tracking-widest text-muted-foreground mb-2">
                    {t(`setups.corner.${k}`)}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["FL", "FR", "RL", "RR"] as const).map((w) => (
                      <QvCard key={w} label={w} value={c[w]} accent="text-sky-500" center />
                    ))}
                  </div>
                </div>
              );
            })}

            {notes && (
              <div>
                <p className="text-micro font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  {t("setups.qvNotes")}
                </p>
                <div className="rounded-md border border-border/60 bg-background/40 p-3">
                  <p className="text-xs text-muted-foreground leading-relaxed italic whitespace-pre-wrap">{notes}</p>
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
      <p className="text-micro font-bold uppercase tracking-wider text-muted-foreground mb-0.5">
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
  const [query, setQuery] = usePageState("setups.query", "");
  const [type, setType] = usePageState<string>("setups.type", "");

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
    const q = query.trim().toLowerCase();
    return out
      .filter((r) => !type || r.setup.setup_type === type)
      .filter((r) => !q || `${r.car} ${r.circuit} ${r.setup.name}`.toLowerCase().includes(q))
      .sort((a, b) => {
      const byClass = classRank(a.carClass) - classRank(b.carClass);
      if (byClass !== 0) return byClass;
      const byCar = a.car.localeCompare(b.car);
      if (byCar !== 0) return byCar;
      const byCircuit = a.circuit.localeCompare(b.circuit);
      if (byCircuit !== 0) return byCircuit;
      return a.setup.name.localeCompare(b.setup.name);
    });
  }, [groups, query, type]);

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardContent className="p-2.5 flex items-center gap-2.5 flex-wrap">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("setups.searchPlaceholder")}
            aria-label={t("setups.searchPlaceholder")}
            className="h-9 min-w-[220px] flex-1 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Select
            value={type}
            onValueChange={setType}
            ariaLabel={t("setups.newType")}
            className="w-44 px-3"
            options={[
              { value: "", label: t("setups.allTypes") },
              { value: "Course", label: t("setupDetail.typeRace") },
              { value: "Qualif", label: t("setupDetail.typeQualif") },
              { value: "Autres", label: t("setupDetail.typeOther") },
            ]}
          />
        </CardContent>
      </Card>
    <Card className="overflow-hidden">
      <TableTitle
        title={
          <span className="inline-flex items-center gap-2">
            <TableIcon className="h-3.5 w-3.5" /> {t("setups.globalTitle")}
          </span>
        }
      >
        <span className="text-xs font-semibold">
          {rows.length} {t("setups.setups")}
        </span>
      </TableTitle>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table className="w-full text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="px-3 py-1.5">
                  <Tip content={t("setups.classTip")}>{t("setups.class")}</Tip>
                </TableHead>
                <TableHead className="px-1 py-1.5 w-7" aria-hidden />
                <TableHead className="px-2 py-1.5">
                  <Tip content={t("setups.carTip")}>{t("setups.car")}</Tip>
                </TableHead>
                <TableHead className="px-3 py-1.5">
                  <Tip content={t("setups.circuitTip")}>{t("setups.circuit")}</Tip>
                </TableHead>
                <TableHead className="px-3 py-1.5">
                  <Tip content={t("setups.setupTip")}>{t("setups.setup")}</Tip>
                </TableHead>
                <TableHead className="px-3 py-1.5">
                  <Tip content={t("setups.newTypeTip")}>{t("setups.newType")}</Tip>
                </TableHead>
                <TableHead className="px-3 py-1.5 text-right">
                  <Tip content={t("setups.bestLapTip")}>{t("setups.bestLap")}</Tip>
                </TableHead>
                <TableHead className="px-3 py-1.5">
                  <Tip content={t("setups.sourceLabelTip")}>{t("setups.sourceLabel")}</Tip>
                </TableHead>
                <TableHead className="px-3 py-1.5">
                  <Tip content={t("setups.modifiedTip")}>{t("setups.modified")}</Tip>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, idx) => (
                <TableRow
                  key={r.setup.id}
                  onClick={() => navigate(`/setups/${r.setup.id}`)}
                  className={cn(
                    "border-b border-border/40 last:border-0 cursor-pointer hover:bg-accent/40 transition-colors",
                    idx % 2 === 1 && "bg-muted/20"
                  )}
                >
                  <TableCell className="px-3 py-1.5">
                    <ClassBadge carClass={r.carClass} size="sm" />
                  </TableCell>
                  <TableCell className="px-1 py-1.5 w-7">
                    <CarLogo
                      carName={r.car}
                      className="h-3.5 w-auto object-contain opacity-80"
                    />
                  </TableCell>
                  <TableCell className="px-2 py-1.5 font-medium whitespace-nowrap">
                    {r.car}
                  </TableCell>
                  <TableCell className="px-3 py-1.5 text-muted-foreground">
                    {r.circuit}
                  </TableCell>
                  <TableCell className="px-3 py-1.5 font-mono text-xs">
                    {r.setup.name.replace(/\.svm$/i, "")}
                  </TableCell>
                  <TableCell className="px-3 py-1.5 text-xs">{typeLabel(r.setup.setup_type, t)}</TableCell>
                  <TableCell className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                    {r.setup.best_lap != null ? formatTime(r.setup.best_lap) : <span className="text-muted-foreground/40">—</span>}
                  </TableCell>
                  <TableCell className="px-3 py-1.5">
                    <SourceBadge source={r.setup.source} />
                  </TableCell>
                  <TableCell className="px-3 py-1.5 text-right text-xs text-muted-foreground">
                    {r.setup.updated_at}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("setups.noMatch")}</p>
          )}
        </div>
      </CardContent>
    </Card>
    </div>
  );
}

// ── Vue par circuit (miroir de CarView, une carte par voiture) ───────────────

function CircuitView({
  groups,
  activeCircuit,
  setActiveCircuit,
  selectedSetupId,
  setSelectedSetupId,
  navigate,
  onDeleted,
}: {
  onDeleted: () => void;
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

  // Auto-sélection du 1er circuit si aucun n'est actif (ou si celui retenu de la
  // visite précédente n'a plus de setup).
  useEffect(() => {
    if (circuitsList.length > 0 && !circuitsList.some((c) => c.name === activeCircuit)) {
      setActiveCircuit(circuitsList[0].name);
    }
  }, [activeCircuit, circuitsList, setActiveCircuit]);

  // Voitures ayant des setups sur le circuit actif.
  const cars = useMemo(() => {
    if (!activeCircuit) return [];
    return groups
      .map((g) => ({ g, track: g.tracks.find((tr) => tr.name === activeCircuit) }))
      .filter((x): x is { g: SetupGroup; track: SetupGroup["tracks"][number] } => !!x.track)
      .sort((a, b) => a.g.car.localeCompare(b.g.car));
  }, [groups, activeCircuit]);

  // Setup group « virtuel » pour permettre à QuickView de retrouver le
  // résumé d'un setup sélectionné dans les cartes du circuit.
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

  const sections = [
    {
      items: circuitsList.map((c) => ({
        key: c.name,
        text: c.name,
        count: c.count,
        label: (
          <>
            <TrackFlag track={c.name} />
            <span className="truncate">{c.name}</span>
          </>
        ),
      })),
    },
  ];
  const total = cars.reduce((n, x) => n + x.track.setups.length, 0);

  return (
    <BrowseLayout
      side={<SideList sections={sections} activeKey={activeCircuit} onPick={setActiveCircuit} placeholder={t("setups.searchCircuit")} />}
      main={
        <>
          {activeCircuit && (
            <Hero
              title={activeCircuit}
              setups={total}
              other={cars.length}
              otherKey="setups.countCars"
              lead={<TrackFlag track={activeCircuit} className="h-4 w-auto shrink-0 rounded-[2px] ring-1 ring-black/10" />}
            />
          )}
          {cars.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">{t("setups.matrixEmptyCircuit")}</CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {cars.map(({ g, track }) => (
                <ComboCard
                  key={g.car}
                  header={
                    <>
                      <CarLogo carName={g.car} className="h-4 w-5 shrink-0 object-contain opacity-80" />
                      <span className="truncate">{g.car}</span>
                      <ClassBadge carClass={g.car_class} solid />
                    </>
                  }
                  setups={track.setups}
                  selectedId={selectedSetupId}
                  onSelect={setSelectedSetupId}
                />
              ))}
            </div>
          )}
        </>
      }
      quick={<QuickView setupId={selectedSetupId} allSetups={virtualGroup} navigate={navigate} onDeleted={onDeleted} />}
    />
  );
}
