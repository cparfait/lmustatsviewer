/**
 * Page de gestion des overlays in-game (façon « Trace HUB »).
 *
 * Grille d'overlays activables + panneau de configuration (Content / Appearance /
 * Position) + bouton Mode Édition (ouvre la fenêtre overlay et active le drag).
 * Toute la persistance/synchro est gérée par `useOverlaysStore`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ChevronLeft,
  Check,
  PencilRuler,
  Gauge,
  Eye,
  EyeOff,
  Save,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { overlay as overlayApi } from "@/lib/api";
import { toastError } from "@/stores/dialogs";
import { useAppStore } from "@/stores/app";
import { OVERLAY_DEFS, OVERLAY_BY_ID, type OverlayId } from "@/lib/overlays";
import {
  useOverlaysStore,
  OVERLAYS_SRC,
  type OverlaysConfig,
} from "@/stores/overlays";

/** Slider stylé (range + valeur). */
function Slider({
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer accent-primary"
      />
      <span className="w-12 text-right font-mono text-xs tabular-nums text-muted-foreground">
        {format(value)}
      </span>
    </div>
  );
}

export function Overlays() {
  const { t } = useTranslation();
  const cfg = useOverlaysStore((s) => s.cfg);
  const loaded = useOverlaysStore((s) => s.loaded);
  const saved = useOverlaysStore((s) => s.saved);
  const editMode = useOverlaysStore((s) => s.editMode);
  const load = useOverlaysStore((s) => s.load);
  const toggleOverlay = useOverlaysStore((s) => s.toggleOverlay);
  const updateSettings = useOverlaysStore((s) => s.updateSettings);
  const updateContent = useOverlaysStore((s) => s.updateContent);
  const setHighFps = useOverlaysStore((s) => s.setHighFps);
  const setEditMode = useOverlaysStore((s) => s.setEditMode);
  const setAllEnabled = useOverlaysStore((s) => s.setAllEnabled);
  const setMasterEnabled = useOverlaysStore((s) => s.setMasterEnabled);
  const setGlobalOpacity = useOverlaysStore((s) => s.setGlobalOpacity);
  const overlayTargetTier = useAppStore((s) => s.overlayTargetTier);
  const applyRemote = useOverlaysStore((s) => s.applyRemote);
  const applyEditMode = useOverlaysStore((s) => s.applyEditMode);
  const saveProfile = useOverlaysStore((s) => s.saveProfile);
  const createEmptyProfile = useOverlaysStore((s) => s.createEmptyProfile);
  const loadProfile = useOverlaysStore((s) => s.loadProfile);
  const deleteProfile = useOverlaysStore((s) => s.deleteProfile);
  const flush = useOverlaysStore((s) => s.flush);

  const [selected, setSelected] = useState<OverlayId | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  // Mémorise qu'on a ouvert la config depuis le mode Édition (clic ⚙) afin d'y
  // revenir automatiquement au retour, sans avoir à recliquer « Mode Édition ».
  const returnToEditRef = useRef(false);

  // Indicateur « Enregistré » transitoire : n'apparaît qu'au moment d'une
  // sauvegarde (flanc false→true de `saved`), puis disparaît au bout de ~1,8 s.
  const [savedFlash, setSavedFlash] = useState(false);
  const prevSavedRef = useRef(saved);
  useEffect(() => {
    if (!prevSavedRef.current && saved) {
      setSavedFlash(true);
      const id = setTimeout(() => setSavedFlash(false), 1800);
      prevSavedRef.current = saved;
      return () => clearTimeout(id);
    }
    prevSavedRef.current = saved;
  }, [saved]);

  // Ouverture de la fenêtre overlay avec retour utilisateur en cas d'échec
  // (sinon : on active un overlay et rien n'apparaît, sans explication).
  const openOverlay = useCallback(
    () => overlayApi.open().catch(() => toastError(t("overlays.openError"))),
    [t],
  );

  useEffect(() => {
    // Charge la config puis ré-ouvre la fenêtre overlay si des overlays sont actifs
    // (ouverture faite ici, app déjà chargée — et non au démarrage où créer une
    // 2e webview pendant l'init du webview principal peut bloquer sur Windows).
    load().then(() => {
      const enabled = Object.values(
        useOverlaysStore.getState().cfg.overlays,
      ).some((o) => o.enabled);
      if (enabled) openOverlay();
    });
    const unlisteners: Array<() => void> = [];
    listen<OverlayId>("overlay-open-config", (e) => {
      setSelected(e.payload);
      // Ouvert via le ⚙ → on était en édition : on y reviendra au retour.
      returnToEditRef.current = true;
      // Le panneau de config est rendu dans la fenêtre `main`, qui est DERRIÈRE la
      // fenêtre overlay (always-on-top). On sort donc du mode Édition (retire le
      // voile + rend l'overlay click-through) et on ramène la fenêtre principale
      // au premier plan — sinon la config reste cachée sous l'overlay, inaccessible.
      setEditMode(false);
      const w = getCurrentWindow();
      w.unminimize().catch(() => {});
      w.setFocus().catch(() => {});
    }).then((fn) => unlisteners.push(fn));
    // Synchro depuis la fenêtre overlay : quand on déplace un widget en mode
    // édition, la fenêtre overlay diffuse les nouvelles positions — la page doit
    // les appliquer, sinon « Mettre à jour » / activer un overlay ré-enregistrerait
    // d'anciennes positions et écraserait la disposition.
    listen<{ src: string; cfg: OverlaysConfig }>("overlays-config", (e) => {
      if (e.payload.src !== OVERLAYS_SRC) applyRemote(e.payload.cfg);
    }).then((fn) => unlisteners.push(fn));
    // Synchro du mode édition (ex. bouton « Terminer l'édition » sur l'overlay) →
    // le bouton « Mode Édition » de la page repasse en OFF.
    listen<boolean>("overlay-edit-mode", (e) => applyEditMode(e.payload)).then(
      (fn) => unlisteners.push(fn),
    );
    return () => unlisteners.forEach((fn) => fn());
  }, [load, applyRemote, applyEditMode, setEditMode, openOverlay]);

  const activeCount = Object.values(cfg.overlays).filter((o) => o.enabled).length;

  const handleToggle = async (id: OverlayId) => {
    const willEnable = !cfg.overlays[id].enabled;
    toggleOverlay(id, willEnable);
    const nextCount = activeCount + (willEnable ? 1 : -1);
    // Persiste AVANT d'ouvrir la fenêtre : elle lit la config en SQLite au boot,
    // donc l'écriture doit être faite avant (sinon elle démarre avec l'overlay off).
    await flush();
    if (willEnable) {
      // Ajouter un overlay → l'afficher et passer en mode édition pour le positionner.
      if (!cfg.masterEnabled) await setMasterEnabled(true);
      await openOverlay();
      await setEditMode(true);
    } else if (nextCount <= 0 && !editMode) {
      await overlayApi.close().catch(() => {});
    }
  };

  const handleEditMode = async () => {
    const next = !editMode;
    await flush();
    // Le mode édition implique d'afficher les overlays.
    if (next && !cfg.masterEnabled) await setMasterEnabled(true);
    if (next) await openOverlay();
    await setEditMode(next);
  };

  // Retour depuis le panneau de config vers la grille. Si on y était entré via le
  // ⚙ (donc depuis l'édition), on réactive le mode Édition pour continuer à
  // positionner sans avoir à recliquer « Mode Édition ».
  const handleBack = async () => {
    setSelected(null);
    if (!returnToEditRef.current) return;
    returnToEditRef.current = false;
    if (!cfg.masterEnabled) await setMasterEnabled(true);
    await openOverlay();
    await setEditMode(true);
  };

  // Création d'un profil depuis la modale : on crée le profil avec les overlays
  // cochés, puis — s'il y en a — on ouvre la fenêtre overlay et on bascule en
  // mode édition pour les positionner directement.
  const handleCreateProfile = async (name: string, enabledIds: OverlayId[]) => {
    const hasActive = await createEmptyProfile(name, enabledIds);
    setShowCreate(false);
    if (hasActive) {
      await openOverlay();
      await setEditMode(true);
    }
  };

  if (!loaded) return null;

  // ── Panneau de configuration d'un overlay ─────────────────────────────────
  if (selected) {
    const def = OVERLAY_BY_ID[selected];
    const s = cfg.overlays[selected];
    const Icon = def.icon;
    return (
      <div className="mx-auto max-w-3xl">
        <button
          onClick={handleBack}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> {t("overlays.back")}
        </button>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="flex items-center gap-3">
              <div
                className="grid h-10 w-10 place-items-center rounded-lg"
                style={{ background: `${def.accent}22`, color: def.accent }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold">
                  {t(`overlays.items.${selected}.title`)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t(`overlays.items.${selected}.desc`)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {s.enabled ? t("overlays.active") : t("overlays.inactive")}
              </span>
              <Switch
                checked={s.enabled}
                onCheckedChange={() => handleToggle(selected)}
              />
            </div>
          </div>

          <Tabs defaultValue="content" className="p-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="content">{t("overlays.tabs.content")}</TabsTrigger>
              <TabsTrigger value="appearance">
                {t("overlays.tabs.appearance")}
              </TabsTrigger>
              <TabsTrigger value="position">{t("overlays.tabs.position")}</TabsTrigger>
            </TabsList>

            {/* Content */}
            <TabsContent value="content" className="space-y-1">
              {def.elements.map((el) => (
                <label
                  key={el.key}
                  className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-2.5 hover:bg-accent/50"
                >
                  <span className="text-sm font-medium">
                    {t(`overlays.elements.${el.key}`)}
                  </span>
                  <Switch
                    checked={s.content[el.key] !== false}
                    onCheckedChange={(v) => updateContent(selected, el.key, v)}
                  />
                </label>
              ))}
              {selected === "cornerdelta" && s.content.target !== false && (
                <div className="mt-2 space-y-1.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
                  <div className="text-xs font-medium">
                    {t("overlays.targetLevel")}
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {t("overlays.targetLevelHint")}
                  </p>
                  <select
                    value={overlayTargetTier}
                    onChange={(e) =>
                      useAppStore.getState().setOverlayTargetTier(e.target.value)
                    }
                    className="h-8 w-full cursor-pointer rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="alien">{t("config.targetAlien")}</option>
                    <option value="competitive">{t("config.targetCompetitive")}</option>
                    <option value="good">{t("config.targetGood")}</option>
                    <option value="midpack">{t("config.targetMidpack")}</option>
                  </select>
                </div>
              )}
            </TabsContent>

            {/* Appearance */}
            <TabsContent value="appearance" className="space-y-5 pt-2">
              <div className="space-y-2">
                <div className="text-sm font-medium">{t("overlays.opacity")}</div>
                <Slider
                  value={s.opacity}
                  min={0.2}
                  max={1}
                  step={0.05}
                  onChange={(v) => updateSettings(selected, { opacity: v })}
                  format={(v) => `${Math.round(v * 100)}%`}
                />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">{t("overlays.scale")}</div>
                <Slider
                  value={s.scale}
                  min={0.5}
                  max={2}
                  step={0.05}
                  onChange={(v) => updateSettings(selected, { scale: v })}
                  format={(v) => `${Math.round(v * 100)}%`}
                />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">{t("overlays.color")}</div>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={s.accent ?? def.accent}
                    onChange={(e) =>
                      updateSettings(selected, { accent: e.target.value })
                    }
                    className="h-8 w-14 cursor-pointer rounded-md border border-border bg-background p-0.5"
                    aria-label={t("overlays.color")}
                  />
                  <span className="font-mono text-xs text-muted-foreground">
                    {(s.accent ?? def.accent).toUpperCase()}
                  </span>
                  {(s.accent ?? def.accent).toLowerCase() !==
                    def.accent.toLowerCase() && (
                    <button
                      type="button"
                      onClick={() => updateSettings(selected, { accent: def.accent })}
                      className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      {t("overlays.colorReset")}
                    </button>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Position */}
            <TabsContent value="position" className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                {(["x", "y"] as const).map((axis) => (
                  <div key={axis} className="space-y-1.5">
                    <div className="text-sm font-medium uppercase">{axis}</div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={Math.round(s[axis])}
                        onChange={(e) =>
                          updateSettings(selected, { [axis]: Number(e.target.value) })
                        }
                        className="w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm"
                      />
                      <span className="text-xs text-muted-foreground">px</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("overlays.positionHint")}
              </p>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    );
  }

  // ── Grille des overlays ────────────────────────────────────────────────────
  return (
    <div>
      {/* Barre d'actions */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{t("overlays.title")}</h1>
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {t("overlays.activeCount", { count: activeCount })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {savedFlash && (
            <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-emerald-500 transition-opacity">
              <Check className="h-3.5 w-3.5" /> {t("overlays.saved")}
            </span>
          )}
          {/* Tout activer / Tout désactiver : bascule l'état ON/OFF de tous les overlays. */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setAllEnabled(activeCount === 0)}
          >
            {activeCount > 0 ? (
              <ToggleRight className="h-4 w-4 text-emerald-500" />
            ) : (
              <ToggleLeft className="h-4 w-4" />
            )}
            {activeCount > 0 ? t("overlays.disableAll") : t("overlays.enableAll")}
          </Button>
          {/* Affichage : cache/montre tout sans changer l'état (coché) ni les positions. */}
          <Button
            variant={cfg.masterEnabled ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setMasterEnabled(!cfg.masterEnabled)}
          >
            {cfg.masterEnabled ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
            {cfg.masterEnabled ? t("overlays.shown") : t("overlays.hidden")}
          </Button>
          <Button
            variant={cfg.highFps ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setHighFps(!cfg.highFps)}
          >
            <Gauge className="h-4 w-4" />
            {t("overlays.highFps")} {cfg.highFps ? "ON" : "OFF"}
          </Button>
          <Button
            variant={editMode ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={handleEditMode}
          >
            <PencilRuler className="h-4 w-4" />
            {editMode ? t("overlays.editModeOn") : t("overlays.editMode")}
          </Button>
        </div>
      </div>

      {/* Ligne secondaire : opacité générale + profils */}
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-border bg-card/40 px-4 py-3">
        <div className="flex min-w-[240px] flex-1 items-center gap-3">
          <span className="whitespace-nowrap text-sm font-medium text-muted-foreground">
            {t("overlays.globalOpacity")}
          </span>
          <Slider
            value={cfg.globalOpacity}
            min={0.2}
            max={1}
            step={0.05}
            onChange={setGlobalOpacity}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Bouton « + » : ouvre la modale de création d'un nouveau profil. */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setShowCreate(true)}
            aria-label={t("overlays.profileNew")}
            title={t("overlays.profileNew")}
          >
            <Plus className="h-4 w-4" />
          </Button>
          {/* Sélection d'un profil → le charge (le bouton ci-contre le ré-enregistre). */}
          <select
            value={cfg.activeProfile}
            onChange={(e) => {
              const name = e.target.value;
              if (name) loadProfile(name);
            }}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">{t("overlays.profileNone")}</option>
            {Object.keys(cfg.profiles).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {/* Ré-enregistre l'état courant dans le profil actif (désactivé si aucun).
              La création d'un nouveau profil passe désormais par le bouton « + ». */}
          <Button
            size="sm"
            disabled={!cfg.activeProfile}
            className="gap-1.5"
            onClick={() => saveProfile(cfg.activeProfile)}
          >
            <Save className="h-4 w-4" />
            {t("overlays.profileSave")}
          </Button>
          {cfg.activeProfile && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => deleteProfile(cfg.activeProfile)}
              aria-label={t("overlays.profileDelete")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {OVERLAY_DEFS.map((def) => {
          const s = cfg.overlays[def.id];
          const Icon = def.icon;
          return (
            <Card
              key={def.id}
              onClick={() => {
                // Ouverture via une carte (hors édition) → pas de retour auto en édition.
                returnToEditRef.current = false;
                setSelected(def.id);
              }}
              className={cn(
                "cursor-pointer p-4 transition-all hover:border-foreground/20 hover:shadow-md",
                s.enabled && "ring-1",
              )}
              style={s.enabled ? { boxShadow: `0 0 0 1px ${def.accent}66` } : undefined}
            >
              <div className="mb-3 flex items-start justify-between">
                <div
                  className="grid h-9 w-9 place-items-center rounded-lg"
                  style={{ background: `${def.accent}22`, color: def.accent }}
                >
                  <Icon className="h-4.5 w-4.5" />
                </div>
              </div>
              <div className="mb-0.5 font-semibold">
                {t(`overlays.items.${def.id}.title`)}
              </div>
              <div className="text-xs font-medium text-muted-foreground">
                {t(`overlays.items.${def.id}.desc`)}
              </div>
              <div className="mb-3 mt-1 text-[11px] leading-snug text-muted-foreground/70">
                {t(`overlays.items.${def.id}.tip`)}
              </div>
              <div
                className="flex items-center justify-between border-t border-border pt-2.5"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {s.enabled ? t("overlays.active") : t("overlays.inactive")}
                </span>
                <Switch
                  checked={s.enabled}
                  onCheckedChange={() => handleToggle(def.id)}
                />
              </div>
            </Card>
          );
        })}
      </div>

      {showCreate && (
        <CreateProfileModal
          existing={Object.keys(cfg.profiles)}
          onCancel={() => setShowCreate(false)}
          onCreate={handleCreateProfile}
        />
      )}
    </div>
  );
}

/**
 * Modale « Nouveau profil » aux couleurs du site : champ nom + liste des
 * overlays à activer (cases à cocher). À la validation, le profil est créé
 * et on bascule en mode édition pour placer les overlays choisis.
 */
function CreateProfileModal({
  existing,
  onCancel,
  onCreate,
}: {
  existing: string[];
  onCancel: () => void;
  onCreate: (name: string, enabledIds: OverlayId[]) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<OverlayId>>(new Set());

  const togglePick = (id: OverlayId) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const trimmed = name.trim();
  const duplicate = existing.includes(trimmed);
  const canCreate = trimmed.length > 0 && !duplicate;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <Card
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border p-4">
          <h2 className="text-lg font-bold">{t("overlays.createTitle")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("overlays.createDesc")}
          </p>
        </div>

        <div className="space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("overlays.createName")}</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("overlays.profilePlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCreate)
                  onCreate(trimmed, [...picked]);
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            {duplicate && (
              <p className="text-xs text-destructive">
                {t("overlays.createDuplicate")}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {t("overlays.createPick")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("overlays.activeCount", { count: picked.size })}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {OVERLAY_DEFS.map((def) => {
                const Icon = def.icon;
                const on = picked.has(def.id);
                return (
                  <button
                    key={def.id}
                    type="button"
                    onClick={() => togglePick(def.id)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                      on
                        ? "border-transparent bg-accent"
                        : "border-border hover:bg-accent/50",
                    )}
                    style={on ? { boxShadow: `0 0 0 1px ${def.accent}88` } : undefined}
                  >
                    <div
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-md"
                      style={{ background: `${def.accent}22`, color: def.accent }}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {t(`overlays.items.${def.id}.title`)}
                    </span>
                    {on && <Check className="h-4 w-4 shrink-0 text-emerald-500" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border p-4">
          <Button variant="outline" size="sm" onClick={onCancel}>
            {t("overlays.createCancel")}
          </Button>
          <Button
            size="sm"
            disabled={!canCreate}
            className="gap-1.5 bg-emerald-600 text-white shadow hover:bg-emerald-500"
            onClick={() => onCreate(trimmed, [...picked])}
          >
            <Check className="h-4 w-4" />
            {picked.size > 0
              ? t("overlays.createAndEdit")
              : t("overlays.createConfirm")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
