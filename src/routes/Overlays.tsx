/**
 * Page de gestion des overlays in-game (façon « Trace HUB »).
 *
 * Grille d'overlays activables + panneau de configuration (Content / Appearance /
 * Position) + bouton Mode Édition (ouvre la fenêtre overlay et active le drag).
 * Toute la persistance/synchro est gérée par `useOverlaysStore`.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import {
  ChevronLeft,
  Check,
  PencilRuler,
  Gauge,
  Eye,
  EyeOff,
  Save,
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
  const applyRemote = useOverlaysStore((s) => s.applyRemote);
  const applyEditMode = useOverlaysStore((s) => s.applyEditMode);
  const saveProfile = useOverlaysStore((s) => s.saveProfile);
  const createEmptyProfile = useOverlaysStore((s) => s.createEmptyProfile);
  const loadProfile = useOverlaysStore((s) => s.loadProfile);
  const deleteProfile = useOverlaysStore((s) => s.deleteProfile);
  const flush = useOverlaysStore((s) => s.flush);

  const [selected, setSelected] = useState<OverlayId | null>(null);
  const [profileName, setProfileName] = useState("");

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

  useEffect(() => {
    // Charge la config puis ré-ouvre la fenêtre overlay si des overlays sont actifs
    // (ouverture faite ici, app déjà chargée — et non au démarrage où créer une
    // 2e webview pendant l'init du webview principal peut bloquer sur Windows).
    load().then(() => {
      const enabled = Object.values(
        useOverlaysStore.getState().cfg.overlays,
      ).some((o) => o.enabled);
      if (enabled) overlayApi.open().catch(() => {});
    });
    const unlisteners: Array<() => void> = [];
    listen<OverlayId>("overlay-open-config", (e) => setSelected(e.payload)).then(
      (fn) => unlisteners.push(fn),
    );
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
  }, [load, applyRemote, applyEditMode]);

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
      await overlayApi.open().catch(() => {});
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
    if (next) await overlayApi.open().catch(() => {});
    await setEditMode(next);
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
          onClick={() => setSelected(null)}
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
          <Save className="h-4 w-4 text-muted-foreground" />
          {/* Sélection d'un profil → charge + pré-remplit le nom (pour ré-enregistrer).
              La dernière entrée crée un profil VIERGE (tous les overlays désactivés) :
              le select étant contrôlé (value = activeProfile), un prompt annulé
              re-rend automatiquement la sélection courante. */}
          <select
            value={cfg.activeProfile}
            onChange={(e) => {
              const name = e.target.value;
              if (name === "__create__") {
                const newName = prompt(t("overlays.profileNamePrompt"))?.trim();
                if (newName) {
                  createEmptyProfile(newName);
                  setProfileName(newName);
                }
                return;
              }
              if (name) {
                loadProfile(name);
                setProfileName(name);
              } else {
                setProfileName("");
              }
            }}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">{t("overlays.profileNone")}</option>
            {Object.keys(cfg.profiles).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value="__create__">{t("overlays.profileNew")}</option>
          </select>
          <input
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder={t("overlays.profilePlaceholder")}
            className="h-8 w-36 rounded-md border border-border bg-background px-2 text-sm"
          />
          {/* Bouton UNIQUE : crée le profil ou écrase celui du même nom.
              Le champ est vidé après coup (le profil créé reste visible dans
              le select) — plus lisible pour enchaîner les créations. */}
          <Button
            size="sm"
            disabled={!profileName.trim()}
            className="gap-1.5 bg-emerald-600 text-white shadow hover:bg-emerald-500"
            onClick={() => {
              saveProfile(profileName.trim());
              setProfileName("");
            }}
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
              onClick={() => setSelected(def.id)}
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
              <div className="mb-3 line-clamp-2 text-xs text-muted-foreground">
                {t(`overlays.items.${def.id}.desc`)}
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
    </div>
  );
}
