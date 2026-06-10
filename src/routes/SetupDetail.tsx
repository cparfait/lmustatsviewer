import { useParams, useNavigate, useSearchParams } from "react-router";
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/SourceBadge";
import {
  setups as setupsApi,
  type SetupEntry,
  type SetupSessionMatch,
  type SvmFile,
  type SvmSection,
} from "@/lib/api";
import {
  Check,
  Edit3,
  Copy,
  GitCompareArrows,
  Download,
  Minus,
  Plus,
  Trash2,
  Loader2,
  Save,
  Search,
  Trophy,
  Wrench,
  X,
  Cog,
  CircleDot,
  ArrowUpDown,
  SlidersHorizontal,
  Ruler,
  StickyNote,
} from "lucide-react";
import { cn, formatTime, formatDateTime } from "@/lib/utils";
import { paramLabel } from "@/lib/setupParams";

// ── Onglets de l'éditeur (regroupement logique des sections SVM) ─────────────

type TabId =
  | "drivetrain"
  | "wheels"
  | "suspension"
  | "dampers"
  | "chassis"
  | "meta";

const TABS: { id: TabId; icon: typeof Cog; labelKey: string }[] = [
  { id: "drivetrain", icon: Cog, labelKey: "setupDetail.tabDrivetrain" },
  { id: "wheels", icon: CircleDot, labelKey: "setupDetail.tabWheels" },
  { id: "suspension", icon: ArrowUpDown, labelKey: "setupDetail.tabSuspension" },
  { id: "dampers", icon: SlidersHorizontal, labelKey: "setupDetail.tabDampers" },
  { id: "chassis", icon: Ruler, labelKey: "setupDetail.tabChassis" },
  { id: "meta", icon: StickyNote, labelKey: "setupDetail.tabMeta" },
];

/** Clé i18n des libellés de sections brutes du `.svm`. */
const SECTION_LABEL_KEYS: Record<string, string> = {
  GENERAL: "setupDetail.secGeneral",
  ENGINE: "setupDetail.secEngine",
  DRIVELINE: "setupDetail.secDriveline",
  CONTROLS: "setupDetail.secControls",
  SUSPENSION: "setupDetail.secSuspension",
  FRONTLEFT: "setupDetail.secFrontLeft",
  FRONTRIGHT: "setupDetail.secFrontRight",
  REARLEFT: "setupDetail.secRearLeft",
  REARRIGHT: "setupDetail.secRearRight",
  FRONTWING: "setupDetail.secFrontWing",
  REARWING: "setupDetail.secRearWing",
  BODYAERO: "setupDetail.secBodyAero",
  LEFTFENDER: "setupDetail.secLeftFender",
  RIGHTFENDER: "setupDetail.secRightFender",
  BASIC: "setupDetail.secBasic",
};

/** Libellé localisé d'une section `.svm` (le nom brut sert de repli). */
const sectionLabel = (
  name: string,
  t: (k: string) => string
): string => {
  const key = SECTION_LABEL_KEYS[name.toUpperCase()];
  return key ? t(key) : name;
};

/**
 * Classe un paramètre `.svm` dans un onglet. Tout paramètre est classé
 * (l'onglet « Châssis » sert de fourre-tout) → aucune donnée perdue.
 */
function classifyParam(section: string, key: string): TabId {
  const s = section.toUpperCase();
  const k = key.toLowerCase();
  // `Notes` de [GENERAL] est rendu par l'onglet « Temps & Notes »
  // (MetaPanel le lit directement). On l'exclut des autres onglets pour
  // éviter le doublon — sinon il apparaissait dans « Châssis » (fourre-tout).
  if (s === "GENERAL" && k === "notes") return "meta";
  if (s === "ENGINE" || s === "DRIVELINE" || s === "CONTROLS") {
    return "drivetrain";
  }
  if (s === "SUSPENSION") {
    if (/bump|rebound/.test(k)) return "dampers";
    if (/antisway/.test(k)) return "chassis";
    return "suspension";
  }
  if (
    s === "FRONTLEFT" ||
    s === "FRONTRIGHT" ||
    s === "REARLEFT" ||
    s === "REARRIGHT"
  ) {
    if (/bump|rebound/.test(k)) return "dampers";
    if (/spring|rideheight|packer|tender/.test(k)) return "suspension";
    return "wheels";
  }
  return "chassis";
}

/** Incrémente une valeur numérique. Si le champ est vide ou non numérique
 *  (« (Default) »…), on part de 0 : un clic +/− pose directement une valeur
 *  sans obliger l'utilisateur à la taper au clavier. */
function bump(value: string, delta: number): string {
  const num = Number(value);
  if (value.trim() === "" || Number.isNaN(num)) return String(delta);
  const next = num + delta;
  const decimals = value.includes(".") ? value.split(".")[1].length : 0;
  return next.toFixed(decimals);
}

/** Retire les guillemets entourant une valeur de note. */
const unquote = (v: string) => v.replace(/^"(.*)"$/s, "$1");

export function SetupDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // `?edit=1` après une création → on entre directement en mode édition
  // (UX V1 : la modale « Nouveau setup » servait déjà d'éditeur). Le param
  // est consommé une fois puis retiré de l'URL pour qu'un F5 ne ré-entre pas
  // en édition après que l'utilisateur ait cliqué sur Annuler.
  const [searchParams, setSearchParams] = useSearchParams();
  const autoEditRequested = searchParams.get("edit") === "1";

  const [entry, setEntry] = useState<SetupEntry | null>(null);
  const [svm, setSvm] = useState<SvmFile | null>(null);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<TabId>("drivetrain");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SvmSection[]>([]);
  const [saving, setSaving] = useState(false);
  // Confirmation visuelle transitoire après une sauvegarde réussie.
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadSetup(Number(id));
  }, [id]);

  // Une fois le svm chargé : si la création a demandé `?edit=1`, on passe
  // automatiquement en édition et on nettoie le param de l'URL.
  // Exception : les setups venant du jeu sont en lecture seule — on ignore
  // alors le param `edit=1`, le bouton « Éditer » est de toute façon désactivé.
  useEffect(() => {
    if (!svm || !autoEditRequested) return;
    if (entry?.source === "game") {
      const next = new URLSearchParams(searchParams);
      next.delete("edit");
      setSearchParams(next, { replace: true });
      return;
    }
    setDraft(structuredClone(svm.sections));
    setEditing(true);
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
  }, [svm, autoEditRequested, entry, searchParams, setSearchParams]);

  async function loadSetup(setupId: number) {
    setLoading(true);
    setEditing(false);
    try {
      const e = await setupsApi.get(setupId);
      setEntry(e);
      setSvm(await setupsApi.getContent(setupId));
    } catch {
      setEntry(null);
      setSvm(null);
    } finally {
      setLoading(false);
    }
  }

  function startEdit() {
    if (!svm) return;
    setDraft(structuredClone(svm.sections));
    setEditing(true);
  }

  function setParamValue(section: string, key: string, value: string) {
    setDraft((prev) =>
      prev.map((s) =>
        s.name !== section
          ? s
          : {
              ...s,
              params: s.params.map((p) =>
                p.key === key ? { ...p, value } : p
              ),
            }
      )
    );
  }

  async function handleSave() {
    if (!entry) return;
    setSaving(true);
    try {
      await setupsApi.update({ id: entry.id, sections: draft });
      await loadSetup(entry.id);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (e) {
      alert(`${t("setupDetail.errSave")} : ${e}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleTypeChange(newType: string) {
    if (!entry) return;
    try {
      await setupsApi.setType(entry.id, newType);
      setEntry({ ...entry, setup_type: newType });
    } catch (e) {
      alert(`${t("setupDetail.errGeneric")} : ${e}`);
    }
  }

  async function handleDuplicate() {
    if (!entry) return;
    const baseName = entry.name.replace(/\.svm$/i, "");
    try {
      const dup = await setupsApi.duplicate(entry.id, `${baseName}_copy`);
      navigate(`/setups/${dup.id}`);
    } catch (e) {
      alert(`${t("setupDetail.errDuplicate")} : ${e}`);
    }
  }

  async function handleDelete() {
    if (!entry) return;
    if (!confirm(t("setupDetail.deleted"))) return;
    try {
      await setupsApi.remove(entry.id, true);
      navigate("/setups");
    } catch (e) {
      alert(`${t("setupDetail.errDelete")} : ${e}`);
    }
  }

  async function handleExport() {
    if (!entry) return;
    try {
      await setupsApi.export(entry.id, entry.name);
      alert(t("setupDetail.exported"));
    } catch (e) {
      alert(`${t("setupDetail.errExport")} : ${e}`);
    }
  }

  // Mémoïsé pour une référence stable (dépendance des useMemo ci-dessous).
  const sections = useMemo(
    () => (editing ? draft : (svm?.sections ?? [])),
    [editing, draft, svm]
  );

  // Sections (avec leurs paramètres) appartenant à l'onglet actif.
  const tabSections = useMemo(() => {
    if (activeTab === "meta") return [];
    return sections
      .map((s) => ({
        name: s.name,
        params: s.params.filter(
          (p) => classifyParam(s.name, p.key) === activeTab
        ),
      }))
      .filter((s) => s.params.length > 0);
  }, [sections, activeTab]);

  // Paramètre « Notes » de la section [GENERAL].
  const generalSection = sections.find(
    (s) => s.name.toUpperCase() === "GENERAL"
  );
  const notesParam = generalSection?.params.find(
    (p) => p.key.toLowerCase() === "notes"
  );

  // Fermeture de la modale : retour à la liste des setups. `navigate(-1)`
  // peut sortir de l'app si l'utilisateur a deep-linké, donc on cible la
  // route /setups explicitement.
  const closeModal = () => navigate("/setups");

  if (loading) {
    return (
      <ModalShell onClose={closeModal}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ModalShell>
    );
  }

  if (!entry || !svm) {
    return (
      <ModalShell onClose={closeModal}>
        <div className="p-8 flex flex-col items-center gap-3">
          <p className="text-muted-foreground">{t("setupDetail.notFound")}</p>
          <Button variant="outline" size="sm" onClick={closeModal}>
            {t("setupDetail.backToSetups")}
          </Button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={closeModal} compact>
      {/* En-tête — icône + titre + sous-titre + bouton fermer (style V1) */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background/60 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-md border border-border flex items-center justify-center bg-primary/10 shrink-0">
            <Wrench className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold tracking-tight flex items-center gap-2 flex-wrap leading-tight">
              <span className="truncate">
                {t("setupDetail.modalTitle")} — {entry.car}
              </span>
              <SourceBadge source={entry.source} />
            </h2>
            <p className="text-micro text-muted-foreground">
              {t("setupDetail.modalSubtitle")}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={closeModal}
          title={t("config.cancel")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Meta bar — Nom (lecture seule) / Type (select) / Circuit (lecture seule) */}
      <div className="px-5 py-3 border-b border-border bg-muted/30 grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
        <div>
          <label className="block text-micro font-bold tracking-[0.15em] uppercase text-muted-foreground mb-1">
            {t("setupDetail.nameLabel")}
          </label>
          <div className="h-9 px-3 flex items-center rounded-md border border-input bg-background/50 font-mono text-sm truncate">
            {entry.name.replace(/\.svm$/i, "")}
          </div>
        </div>
        <div>
          <label className="block text-micro font-bold tracking-[0.15em] uppercase text-muted-foreground mb-1">
            {t("setupDetail.type")}
          </label>
          <select
            value={entry.setup_type}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="Course">{t("setupDetail.typeRace")}</option>
            <option value="Qualif">{t("setupDetail.typeQualif")}</option>
            <option value="Autres">{t("setupDetail.typeOther")}</option>
          </select>
        </div>
        <div>
          <label className="block text-micro font-bold tracking-[0.15em] uppercase text-muted-foreground mb-1">
            {t("setups.circuit")}
          </label>
          <div className="h-9 px-3 flex items-center rounded-md border border-input bg-background/50 text-sm truncate">
            {entry.circuit}
          </div>
        </div>
      </div>

      {/* Hint « lecture seule » pour les setups jeu */}
      {entry.source === "game" && (
        <p className="px-5 py-1.5 text-mini text-primary italic bg-primary/5 border-b border-border/60 shrink-0">
          {t("setupDetail.gameReadOnlyHint")}
        </p>
      )}

      {/* Body : sidebar onglets + panneau (flex-1, overflow contrôlé) */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <nav className="w-44 shrink-0 border-r border-border/60 p-2 flex flex-col gap-0.5 overflow-y-auto bg-background/40">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2.5 rounded-md text-sm whitespace-nowrap transition-colors text-left",
                    activeTab === tab.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {t(tab.labelKey)}
                </button>
              );
            })}
          </nav>

          {/* Panneau — padding réduit V1 + scroll vertical interne (le body
              parent est `overflow-hidden` pour épingler header/footer). */}
          <div className="flex-1 p-4 min-w-0 overflow-y-auto">
            {activeTab === "meta" ? (
              <MetaPanel
                entry={entry}
                notesValue={notesParam ? unquote(notesParam.value) : null}
                editing={editing}
                onNotesChange={(v) =>
                  notesParam &&
                  setParamValue(generalSection!.name, notesParam.key, `"${v}"`)
                }
                onLinkChanged={() => loadSetup(entry.id)}
              />
            ) : tabSections.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {t("setupDetail.noParams")}
              </p>
            ) : (
              // Densité calquée sur la V1 (`.cfg-row` ~8px padding, ~12px
              // texte) : plus d'infos par écran sans dégrader la lisibilité.
              <div className="flex flex-col gap-4">
                {tabSections.map((section) => (
                  <div key={section.name}>
                    <h3 className="text-micro font-bold uppercase tracking-[0.18em] text-primary mb-1.5 pb-1 border-b border-primary/15">
                      {sectionLabel(section.name, t)}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0">
                      {section.params.map((p) => (
                        <div
                          key={p.key}
                          className="flex items-center justify-between gap-2 px-2 py-1 rounded-md border border-transparent hover:border-border/60 hover:bg-accent/30 transition-colors"
                        >
                          <div className="flex flex-col min-w-0">
                            <span
                              className="text-xs truncate"
                              title={p.key}
                            >
                              {paramLabel(p.key)}
                            </span>
                            {p.comment && (
                              <span className="text-micro text-muted-foreground truncate">
                                {p.comment}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {editing ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5"
                                  onClick={() =>
                                    setParamValue(
                                      section.name,
                                      p.key,
                                      bump(p.value, -1)
                                    )
                                  }
                                >
                                  <Minus className="h-2.5 w-2.5" />
                                </Button>
                                <input
                                  value={p.value}
                                  onChange={(e) =>
                                    setParamValue(
                                      section.name,
                                      p.key,
                                      e.target.value
                                    )
                                  }
                                  className="w-20 rounded border border-input bg-background px-1.5 py-0.5 font-mono text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5"
                                  onClick={() =>
                                    setParamValue(
                                      section.name,
                                      p.key,
                                      bump(p.value, 1)
                                    )
                                  }
                                >
                                  <Plus className="h-2.5 w-2.5" />
                                </Button>
                              </>
                            ) : (
                              <span className="font-mono text-xs font-medium min-w-[64px] text-right">
                                {p.value}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      {/* Footer : actions secondaires (Dupliquer/Exporter/Comparer/Supprimer)
          à gauche, sauvegarde/édition à droite — style V1. */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-background/60 shrink-0 gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 text-xs"
            onClick={handleDuplicate}
          >
            <Copy className="h-3.5 w-3.5" /> {t("setupDetail.duplicate")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 text-xs"
            onClick={handleExport}
          >
            <Download className="h-3.5 w-3.5" /> {t("setupDetail.export")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 text-xs"
            onClick={() => navigate("/setups/compare")}
          >
            <GitCompareArrows className="h-3.5 w-3.5" />{" "}
            {t("setupDetail.compare")}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
            title={t("setups.delete")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          {savedFlash && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500">
              <Check className="h-3.5 w-3.5" /> {t("setupDetail.saved")}
            </span>
          )}
          {editing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                {t("config.cancel")}
              </Button>
              <Button
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {t("setupDetail.save")}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={startEdit}
              disabled={entry.source === "game"}
              title={
                entry.source === "game"
                  ? t("setupDetail.gameReadOnlyHint")
                  : undefined
              }
            >
              <Edit3 className="h-3.5 w-3.5" /> {t("setupDetail.edit")}
            </Button>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

/**
 * Wrapper de la modale d'édition de setup : overlay sombre + carte centrée
 * (max-w-4xl, max-h-[92vh]). Clic backdrop / Échap → `onClose`.
 */
function ModalShell({
  children,
  onClose,
  compact,
}: {
  children: React.ReactNode;
  onClose: () => void;
  /** Mode plein avec sidebar/footer : 4xl + 92vh. Sinon dialogue minimal. */
  compact?: boolean;
}) {
  // Esc → fermeture.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "w-full bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col",
          compact ? "max-w-4xl max-h-[92vh]" : "max-w-md"
        )}
      >
        {children}
      </div>
    </div>
  );
}

// ── Onglet « Temps & Notes » ─────────────────────────────────────────────────

function MetaPanel({
  entry,
  notesValue,
  editing,
  onNotesChange,
  onLinkChanged,
}: {
  entry: SetupEntry;
  notesValue: string | null;
  editing: boolean;
  onNotesChange: (v: string) => void;
  /** Appelé après une modif du lien session (set/unset) → reload côté parent. */
  onLinkChanged: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* Notes : éditables indépendamment du mode édition du `.svm` (même pour
          les setups venant du jeu — c'est de l'annotation utilisateur, pas
          du réglage technique). Quand le `.svm` global est en cours d'édition,
          on déléguue à onNotesChange (sauvegarde groupée). Sinon, édition
          inline avec save direct via `set_setup_notes`. */}
      {editing ? (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-2">
            {t("setupDetail.notes")}
          </h3>
          {notesValue != null ? (
            <textarea
              value={notesValue}
              onChange={(e) => onNotesChange(e.target.value)}
              rows={5}
              placeholder={t("setupDetail.notesPlaceholder")}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
          ) : (
            <p className="text-xs text-muted-foreground italic">
              {t("setupDetail.noNotesField")}
            </p>
          )}
        </div>
      ) : (
        <NotesInlineEditor
          entry={entry}
          notesValue={notesValue}
          onSaved={onLinkChanged /* reload entry */}
        />
      )}

      {/* Lien vers une session de référence (best lap) — V1 */}
      <LinkedSessionSection entry={entry} onChanged={onLinkChanged} />

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-2">
          {t("setupDetail.fileInfo")}
        </h3>
        <div className="text-sm space-y-1.5">
          <InfoLine label={t("setupDetail.type")}>
            <Badge variant="outline">{entry.setup_type}</Badge>
          </InfoLine>
          <InfoLine label={t("setups.sourceLabel")}>
            <SourceBadge source={entry.source} />
          </InfoLine>
          <InfoLine label={t("setupDetail.modified")}>
            {entry.updated_at}
          </InfoLine>
          <InfoLine label={t("setupDetail.fileLabel")}>
            <span className="font-mono text-xs break-all">
              {entry.svm_path}
            </span>
          </InfoLine>
        </div>
      </div>
    </div>
  );
}

/**
 * Édition inline des notes, indépendante du flag `editing` du `.svm`.
 * Permet d'annoter même un setup venu du jeu ou importé (annotation
 * utilisateur, sans rapport avec les valeurs techniques du fichier).
 * Sauvegarde via `set_setup_notes` (commande dédiée qui contourne le
 * check `source = "game"`).
 */
function NotesInlineEditor({
  entry,
  notesValue,
  onSaved,
}: {
  entry: SetupEntry;
  notesValue: string | null;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const display = notesValue ?? "";

  function startEdit() {
    setDraft(display);
    setEditing(true);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await setupsApi.setNotes(entry.id, draft);
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEditing(false);
    setDraft("");
    setError(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
          {t("setupDetail.notes")}
        </h3>
        {!editing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={startEdit}
          >
            <Edit3 className="h-3 w-3" /> {t("setupDetail.editNotes")}
          </Button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            placeholder={t("setupDetail.notesPlaceholder")}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={saving}
            >
              <X className="h-3.5 w-3.5 mr-1" /> {t("config.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1" />
              )}
              {t("setupDetail.save")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap">
          {display.trim() !== "" ? (
            display
          ) : (
            <span className="text-muted-foreground italic">
              {t("setupDetail.noNotes")}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Section « Meilleur tour lié » de l'éditeur de setup (équivalent V1
 * `best_lap_session_id` du modale). Permet de :
 *  - voir la session actuellement liée (track + chrono + date) si elle existe.
 *  - chercher des sessions candidates pour le combo voiture du setup.
 *  - lier ou délier en un clic.
 */
function LinkedSessionSection({
  entry,
  onChanged,
}: {
  entry: SetupEntry;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [results, setResults] = useState<SetupSessionMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Filtre circuit : coché par défaut (proposer uniquement le combo
  // voiture+circuit du setup, qui est le cas normal). Si le matching échoue
  // (nom de dossier ≠ nom XML, ex. anciennes versions du jeu), décocher pour
  // voir toutes les sessions de la voiture.
  const [filterByCircuit, setFilterByCircuit] = useState(true);
  // Mode comparaison : décoché par défaut → 1 seul meilleur tour par circuit.
  // Coché : toutes les sessions (chaque tentative avec un setup différent),
  // utile pour comparer les chronos sur un même circuit.
  const [compareAll, setCompareAll] = useState(false);
  // Détail de la session liée — chargé directement par ID (lookup backend)
  // dès que `entry.linked_session_id` change. Évite le mode dégradé qui ne
  // montrait que l'ID brut tant que la recherche n'avait pas tourné.
  const [directLinkedSummary, setDirectLinkedSummary] =
    useState<SetupSessionMatch | null>(null);

  useEffect(() => {
    if (!entry.linked_session_id) {
      setDirectLinkedSummary(null);
      return;
    }
    setupsApi
      .getSessionSummary(entry.linked_session_id)
      .then((s) => setDirectLinkedSummary(s))
      .catch(() => setDirectLinkedSummary(null));
  }, [entry.linked_session_id]);

  // On préfère le lookup direct, mais on retombe sur le résultat de recherche
  // si jamais le direct échoue (session purgée par exemple → toujours null).
  const linkedSummary =
    directLinkedSummary ??
    (entry.linked_session_id
      ? results.find((r) => r.session_id === entry.linked_session_id) ?? null
      : null);

  async function runSearch(withCircuit: boolean, allSessions: boolean) {
    setSearching(true);
    setError(null);
    try {
      const circuit = withCircuit ? entry.circuit : null;
      const rows = await setupsApi.searchSessionsForSetup(
        entry.car,
        circuit,
        !allSessions, // bestOnly = !compareAll
      );
      setResults(rows);
      setSearchOpen(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setSearching(false);
    }
  }

  async function handleSearch() {
    await runSearch(filterByCircuit, compareAll);
  }

  // Toggle live : si la liste est ouverte, on relance la recherche
  // immédiatement avec le nouveau filtre.
  async function handleToggleCircuit() {
    const next = !filterByCircuit;
    setFilterByCircuit(next);
    if (searchOpen) {
      await runSearch(next, compareAll);
    }
  }

  async function handleToggleCompareAll() {
    const next = !compareAll;
    setCompareAll(next);
    if (searchOpen) {
      await runSearch(filterByCircuit, next);
    }
  }

  async function handleLink(sessionId: number | null) {
    setError(null);
    try {
      await setupsApi.setLinkedSession(entry.id, sessionId);
      setSearchOpen(false);
      onChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
          {t("setupDetail.linkedSession")}
        </h3>
        <div className="flex items-center gap-3 flex-wrap">
          <label
            className="flex items-center gap-1.5 text-mini text-muted-foreground cursor-pointer select-none"
            title={t("setupDetail.filterByCircuitTip")}
          >
            <input
              type="checkbox"
              checked={filterByCircuit}
              onChange={handleToggleCircuit}
              className="h-3 w-3 cursor-pointer accent-primary"
            />
            {t("setupDetail.filterByCircuit")}
          </label>
          <label
            className="flex items-center gap-1.5 text-mini text-muted-foreground cursor-pointer select-none"
            title={t("setupDetail.compareAllTip")}
          >
            <input
              type="checkbox"
              checked={compareAll}
              onChange={handleToggleCompareAll}
              className="h-3 w-3 cursor-pointer accent-primary"
            />
            {t("setupDetail.compareAll")}
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleSearch}
            disabled={searching}
          >
            {searching ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Search className="h-3 w-3" />
            )}
            {t("setupDetail.searchSession")}
          </Button>
        </div>
      </div>

      {/* Affichage de la session liée actuellement (si déjà cherchée et trouvée). */}
      {entry.linked_session_id == null ? (
        <p className="text-xs italic text-muted-foreground">
          {t("setupDetail.noLinkedSession")}
        </p>
      ) : linkedSummary ? (
        <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <Trophy className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 text-xs">
                {/* Ligne 1 : circuit + tracé */}
                <p className="font-semibold truncate">
                  {linkedSummary.track}
                  {linkedSummary.track_course &&
                    linkedSummary.track_course !== linkedSummary.track &&
                    ` · ${linkedSummary.track_course}`}
                </p>
                {/* Ligne 2 : chrono + date + session */}
                <p className="text-muted-foreground font-mono mt-0.5">
                  <span className="text-success font-semibold">
                    {formatTime(linkedSummary.best_lap ?? 0)}
                  </span>
                  <span> · {formatDateTime(linkedSummary.timestamp)}</span>
                  <span> · {linkedSummary.session_type}</span>
                </p>
                {/* Ligne 3 : secteurs S1 / S2 / S3 si dispos */}
                {(linkedSummary.best_lap_s1 != null ||
                  linkedSummary.best_lap_s2 != null ||
                  linkedSummary.best_lap_s3 != null) && (
                  <p className="text-muted-foreground font-mono mt-0.5 text-mini">
                    <span>S1: </span>
                    <span className="text-foreground/90">
                      {linkedSummary.best_lap_s1 != null
                        ? `${linkedSummary.best_lap_s1.toFixed(3)}s`
                        : "—"}
                    </span>
                    <span> · S2: </span>
                    <span className="text-foreground/90">
                      {linkedSummary.best_lap_s2 != null
                        ? `${linkedSummary.best_lap_s2.toFixed(3)}s`
                        : "—"}
                    </span>
                    <span> · S3: </span>
                    <span className="text-foreground/90">
                      {linkedSummary.best_lap_s3 != null
                        ? `${linkedSummary.best_lap_s3.toFixed(3)}s`
                        : "—"}
                    </span>
                  </p>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => handleLink(null)}
              title={t("setupDetail.unlinkSession")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/40 px-3 py-2">
          <p className="text-xs text-muted-foreground">
            {t("setupDetail.linkedSessionId", { id: entry.linked_session_id })}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => handleLink(null)}
            title={t("setupDetail.unlinkSession")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Liste des résultats — affichée après un clic sur Chercher. */}
      {searchOpen && results.length > 0 && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border bg-background/60">
          {results.map((r) => {
            const selected = r.session_id === entry.linked_session_id;
            return (
              <button
                key={r.session_id}
                type="button"
                onClick={() => handleLink(r.session_id)}
                className={cn(
                  "w-full text-left text-xs px-3 py-2 border-b border-border/40 last:border-0 hover:bg-accent/60 transition-colors",
                  selected && "bg-primary/10"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">
                    {r.track}
                    {r.track_course && ` · ${r.track_course}`}
                  </span>
                  <span className="font-mono text-success shrink-0">
                    {formatTime(r.best_lap ?? 0)}
                  </span>
                </div>
                <div className="text-muted-foreground mt-0.5 flex gap-2">
                  <span>{r.session_type}</span>
                  <span>·</span>
                  <span>{r.car_class}</span>
                  <span>·</span>
                  <span>{formatDateTime(r.timestamp)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {searchOpen && results.length === 0 && !searching && (
        <div className="mt-2">
          <p className="text-xs italic text-muted-foreground">
            {t("setupDetail.noSessionsFound")}
          </p>
          {filterByCircuit && (
            <button
              type="button"
              onClick={handleToggleCircuit}
              className="text-xs text-primary hover:underline mt-1"
            >
              {t("setupDetail.disableCircuitFilter")}
            </button>
          )}
        </div>
      )}
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
    </div>
  );
}

function InfoLine({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}
