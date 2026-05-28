import { useState, useEffect } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FolderOpen,
  RefreshCw,
  Trash2,
  Search,
  Save,
  Sun,
  Moon,
  Loader2,
  Eraser,
  AlertTriangle,
  User,
  HardDrive,
  Palette,
  Settings2,
  Wrench,
  Info,
  ChevronRight,
  FileText,
  Database,
  Zap,
  Check,
  ChevronDown,
  BarChart2,
} from "lucide-react";
import { useAppStore } from "@/stores/app";
import { useTheme } from "@/stores/theme";
import { system, config as configApi, indexer } from "@/lib/api";
import { isTauri } from "@/lib/api";
import { cn } from "@/lib/utils";
import { checkForUpdate } from "@/lib/updater";

const LANGUAGES = [
  { code: "fr", label: "Français", flag: "/flags/fr.png" },
  { code: "en", label: "English", flag: "/flags/gb.png" },
  { code: "es", label: "Español", flag: "/flags/es.png" },
  { code: "de", label: "Deutsch", flag: "/flags/de.png" },
];

const TIMEZONES: string[] = (() => {
  try {
    return Intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
})();

export function Config() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();

  const playerName = useAppStore((s) => s.playerName);
  const lmuPath = useAppStore((s) => s.lmuPath);
  const timezone = useAppStore((s) => s.timezone);
  const autoIndex = useAppStore((s) => s.autoIndex);
  const systemTray = useAppStore((s) => s.systemTray);
  const autoUpdate = useAppStore((s) => s.autoUpdate);
  const showOhneSpeed = useAppStore((s) => s.showOhneSpeed);
  const indexing = useAppStore((s) => s.indexing);
  const indexReport = useAppStore((s) => s.indexReport);

  const [draftPlayer, setDraftPlayer] = useState(playerName);
  const [draftLmu, setDraftLmu] = useState(lmuPath);
  useEffect(() => setDraftPlayer(playerName), [playerName]);
  useEffect(() => setDraftLmu(lmuPath), [lmuPath]);

  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [maintMsg, setMaintMsg] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState("—");
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "uptodate" | "available" | "error">("idle");
  const [emptyGlobal, setEmptyGlobal] = useState<number | null>(null);
  const [emptyPlayer, setEmptyPlayer] = useState<number | null>(null);

  const refreshEmptyCounts = () => {
    indexer.countEmptySessions("global").then(setEmptyGlobal).catch(() => {});
    indexer.countEmptySessions("player").then(setEmptyPlayer).catch(() => {});
  };

  useEffect(() => {
    system.getAppVersion().then(setAppVersion).catch(() => {});
    refreshEmptyCounts();
  }, []);

  const dirty =
    draftPlayer.trim() !== playerName ||
    draftLmu.trim() !== lmuPath;
  const canSave =
    dirty && draftPlayer.trim() !== "" && draftLmu.trim() !== "";

  async function handleDetect() {
    setDetecting(true);
    setDetectError(null);
    try {
      const r = await configApi.detectLmu();
      setDraftLmu(r.lmu_path);
      if (r.player_name) setDraftPlayer(r.player_name);
    } catch (e) {
      setDetectError(String(e));
    } finally {
      setDetecting(false);
    }
  }

  async function handlePickFolder() {
    if (!isTauri()) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: true,
      multiple: false,
      title: t("config.selectLmuFolder"),
    });
    if (typeof selected !== "string" || !selected) return;
    setDraftLmu(selected);
    setDetectError(null);
    try {
      const r = await configApi.inspectLmu(selected);
      if (r.player_name && !draftPlayer.trim()) setDraftPlayer(r.player_name);
    } catch (e) {
      setDetectError(String(e));
    }
  }

  async function confirmSave() {
    setShowConfirm(false);
    setSaveError(null);
    try {
      await useAppStore
        .getState()
        .runSetup(draftLmu.trim(), draftPlayer.trim());
      setMaintMsg(t("config.saveDone"));
    } catch (e) {
      setSaveError(String(e));
    }
  }

  async function handleReindex() {
    setMaintMsg(null);
    await useAppStore.getState().reindexAll();
    setMaintMsg(t("config.reindexDone"));
  }
  async function handleSync() {
    setMaintMsg(null);
    await useAppStore.getState().syncIndex();
    setMaintMsg(t("config.syncDone"));
  }
  async function handleClearCache() {
    setMaintMsg(null);
    await useAppStore.getState().clearCache();
    setMaintMsg(t("config.cacheCleared"));
  }
  async function handlePurge(purgeType: "global" | "player") {
    setMaintMsg(null);
    const removed = await useAppStore.getState().purgeEmptySessions(purgeType);
    setMaintMsg(t("config.purgeDone", { count: removed }));
    refreshEmptyCounts();
  }

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight">
          {t("config.title")}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">{t("config.subtitle")}</p>
      </div>

      <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

          {/* ── Joueur & dossier ──────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary">
                  <User className="h-3.5 w-3.5" />
                </div>
                <div>
                  <CardTitle className="text-sm">
                    {t("config.playerAndDir")}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {t("config.playerAndDirDesc")}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground/80">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                <p className="leading-snug">{t("config.autoDetectInfo")}</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  {t("config.playerNameField")}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={draftPlayer}
                    onChange={(e) => setDraftPlayer(e.target.value)}
                    placeholder="Cris Tof"
                    className="pl-9 h-8 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  {t("config.lmuPath")}
                </label>
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <HardDrive className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={draftLmu}
                      onChange={(e) => setDraftLmu(e.target.value)}
                      className="font-mono text-xs pl-9 h-8"
                      placeholder="D:/SteamLibrary/steamapps/common/Le Mans Ultimate"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0 h-8 w-8"
                    onClick={handlePickFolder}
                    title={t("config.selectLmuFolder")}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0 h-8 w-8"
                    onClick={handleDetect}
                    disabled={detecting}
                    title={t("config.detect")}
                  >
                    {detecting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Search className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              {(detectError || saveError) && (
                <p className="text-xs text-destructive bg-destructive/5 px-2.5 py-1.5 rounded-md">
                  {detectError || saveError}
                </p>
              )}

              <div className="flex items-center justify-between">
                {dirty && (
                  <span className="text-xs text-yellow-500/80 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
                    {t("config.unsavedChanges")}
                  </span>
                )}
                <Button
                  className={cn("gap-1.5 ml-auto", !dirty && "ml-auto")}
                  disabled={!canSave || indexing}
                  onClick={() => {
                    setSaveError(null);
                    setShowConfirm(true);
                  }}
                >
                  {indexing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {t("config.saveAndReindex")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── Apparence & langue ────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary">
                  <Palette className="h-3.5 w-3.5" />
                </div>
                <div>
                  <CardTitle className="text-sm">
                    {t("config.appearance")}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {t("config.appearanceDesc")}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-0">
              <SettingRow
                icon={<Sun className="h-4 w-4" />}
                label={t("config.theme")}
              >
                <div className="flex gap-1">
                  <button
                    onClick={() => setTheme("light")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border",
                      theme === "light"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-transparent text-muted-foreground border-border hover:bg-muted/50"
                    )}
                  >
                    <Sun className="h-3.5 w-3.5" />
                    {t("config.themeLight")}
                  </button>
                  <button
                    onClick={() => setTheme("dark")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border",
                      theme === "dark"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-transparent text-muted-foreground border-border hover:bg-muted/50"
                    )}
                  >
                    <Moon className="h-3.5 w-3.5" />
                    {t("config.themeDark")}
                  </button>
                </div>
              </SettingRow>
              <Separator />
              <SettingRow
                icon={<span className="text-sm">🌐</span>}
                label={t("config.language")}
              >
                {(() => {
                  const current =
                    LANGUAGES.find((l) =>
                      i18n.language?.startsWith(l.code)
                    ) ?? LANGUAGES[0];
                  return (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 min-w-[140px] justify-between gap-2 font-normal"
                        >
                          <span className="flex items-center gap-2">
                            <img
                              src={current.flag}
                              alt={current.code}
                              className="h-3.5 w-auto rounded-[2px]"
                            />
                            {current.label}
                          </span>
                          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[160px]">
                        {LANGUAGES.map((l) => (
                          <DropdownMenuItem
                            key={l.code}
                            onSelect={() => i18n.changeLanguage(l.code)}
                            className="gap-2 cursor-pointer"
                          >
                            <img
                              src={l.flag}
                              alt={l.code}
                              className="h-3.5 w-auto rounded-[2px]"
                            />
                            {l.label}
                            {current.code === l.code && (
                              <Check className="h-3.5 w-3.5 ml-auto text-primary" />
                            )}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                })()}
              </SettingRow>
              <Separator />
              <SettingRow
                icon={<span className="text-sm">🕐</span>}
                label={t("config.timezone")}
                desc={t("config.timezoneDesc")}
              >
                <select
                  value={timezone}
                  onChange={(e) =>
                    useAppStore.getState().setTimezone(e.target.value)
                  }
                  className="h-8 max-w-[200px] rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                >
                  <option value="">{t("config.timezoneSystem")}</option>
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </SettingRow>
            </CardContent>
          </Card>

          {/* ── Préférences ──────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary">
                  <Settings2 className="h-3.5 w-3.5" />
                </div>
                <div>
                  <CardTitle className="text-sm">
                    {t("config.preferences")}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {t("config.preferencesDesc")}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-0">
              <ToggleRow
                icon={<Zap className="h-4 w-4" />}
                label={t("config.autoIndex")}
                desc={t("config.autoIndexDesc")}
                checked={autoIndex}
                onChange={(v) => useAppStore.getState().setAutoIndex(v)}
              />
              <Separator />
              <ToggleRow
                icon={<Settings2 className="h-4 w-4" />}
                label={t("config.systemTray")}
                desc={t("config.systemTrayDesc")}
                checked={systemTray}
                onChange={(v) => useAppStore.getState().setSystemTray(v)}
              />
              <Separator />
              <ToggleRow
                icon={<RefreshCw className="h-4 w-4" />}
                label={t("config.autoUpdate")}
                desc={t("config.autoUpdateDesc")}
                checked={autoUpdate}
                onChange={(v) => useAppStore.getState().setAutoUpdate(v)}
              />
              <Separator />
              <ToggleRow
                icon={<BarChart2 className="h-4 w-4" />}
                label={t("config.ohneSpeed")}
                desc={t("config.ohneSpeedDesc")}
                checked={showOhneSpeed}
                onChange={(v) => useAppStore.getState().setShowOhneSpeed(v)}
              />
            </CardContent>
          </Card>

          {/* ── Maintenance ──────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary">
                  <Wrench className="h-3.5 w-3.5" />
                </div>
                <div>
                  <CardTitle className="text-sm">
                    {t("config.maintenance")}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {t("config.maintenanceDesc")}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-1">
              <ActionRow
                icon={<RefreshCw className={cn("h-4 w-4", indexing && "animate-spin")} />}
                label={t("config.syncDelta")}
                onClick={handleSync}
                disabled={indexing}
              />
              <ActionRow
                icon={<Database className="h-4 w-4" />}
                label={indexing ? t("config.indexing") : t("config.reindex")}
                onClick={handleReindex}
                disabled={indexing}
              />
              <ActionRow
                icon={<Eraser className="h-4 w-4" />}
                label={t("config.purgeEmpty")}
                badge={emptyGlobal != null && emptyGlobal > 0 ? String(emptyGlobal) : undefined}
                onClick={() => handlePurge("global")}
                disabled={indexing}
              />
              <ActionRow
                icon={<Eraser className="h-4 w-4" />}
                label={t("config.purgeEmptyPlayer")}
                badge={emptyPlayer != null && emptyPlayer > 0 ? String(emptyPlayer) : undefined}
                onClick={() => handlePurge("player")}
                disabled={indexing}
              />
              <ActionRow
                icon={<Trash2 className="h-4 w-4" />}
                label={t("config.clearCache")}
                onClick={handleClearCache}
                disabled={indexing}
                destructive
              />

              {maintMsg && (
                <div className="text-xs text-success bg-success/5 px-2.5 py-1.5 rounded-md mt-0.5">
                  {maintMsg}
                </div>
              )}

              {indexReport && (
                <div className="text-xs text-muted-foreground px-2.5 py-2 bg-muted/30 rounded-md space-y-1 mt-0.5">
                  <div className="flex items-center gap-1.5">
                    <Database className="h-3 w-3" />
                    <span>
                      {t("config.filesScanned", {
                        count: indexReport.files_scanned,
                      })}
                    </span>
                  </div>
                  <div className="pl-[22px] space-x-2">
                    <span>{t("config.filesAdded", { count: indexReport.added })}</span>
                    <span>{t("config.filesUpdated", { count: indexReport.updated })}</span>
                    <span>{t("config.filesRemoved", { count: indexReport.removed })}</span>
                  </div>
                  <div className="pl-[22px]">
                    {t("config.sessionsCreated", {
                      count: indexReport.sessions_created,
                    })}
                  </div>
                  {indexReport.errors.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-destructive">
                        {t("config.errors", {
                          count: indexReport.errors.length,
                        })}
                      </div>
                      <div className="font-mono text-[10px] text-destructive/80 max-h-24 overflow-y-auto space-y-0.5 pl-[22px]">
                        {indexReport.errors.slice(0, 5).map((e, i) => (
                          <div key={i} className="truncate">
                            {e}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          </div>{/* fin grille 2×2 */}

          {/* ── À propos — pleine largeur ──────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary">
                  <Info className="h-3.5 w-3.5" />
                </div>
                <CardTitle className="text-sm">{t("config.about")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              <div className="flex items-center justify-between px-2.5 py-2 rounded-md bg-muted/40">
                <span className="text-xs text-muted-foreground">{t("config.version")}</span>
                <span className="font-mono text-sm font-semibold text-primary">
                  v{appVersion}
                </span>
              </div>
              <Link
                to="/changelog"
                className="flex items-center justify-between px-2.5 py-2 rounded-md bg-muted/40 hover:bg-muted/60 transition-colors group"
              >
                <span className="flex items-center gap-1.5 text-sm">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  {t("changelog.title")}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-1.5 h-8 text-xs"
                disabled={updateStatus === "checking"}
                onClick={async () => {
                  setUpdateStatus("checking");
                  try {
                    const upd = await checkForUpdate();
                    if (upd) {
                      setUpdateStatus("available");
                      import("@tauri-apps/api/event").then(({ emit }) =>
                        emit("tray-check-update")
                      );
                    } else {
                      setUpdateStatus("uptodate");
                      setTimeout(() => setUpdateStatus("idle"), 5000);
                    }
                  } catch {
                    setUpdateStatus("error");
                    setTimeout(() => setUpdateStatus("idle"), 5000);
                  }
                }}
              >
                {updateStatus === "checking"
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
                {t("updater.checkButton")}
              </Button>
              {updateStatus === "uptodate" && (
                <p className="flex items-center gap-1.5 px-1 text-xs text-success">
                  <Check className="h-3 w-3" />
                  {t("updater.upToDate")}
                </p>
              )}
              {updateStatus === "error" && (
                <p className="flex items-center gap-1.5 px-1 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  {t("updater.error")}
                </p>
              )}
            </CardContent>
          </Card>
      </div>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowConfirm(false);
          }}
        >
          <Card className="w-full max-w-md mx-4 shadow-2xl">
            <CardHeader className="pb-2 px-4 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary">
                  <AlertTriangle className="h-3.5 w-3.5" />
                </div>
                {t("config.reindexConfirmTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("config.reindexConfirmText")}
              </p>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowConfirm(false)}
                >
                  {t("config.cancel")}
                </Button>
                <Button size="sm" className="gap-1.5" onClick={confirmSave}>
                  <Save className="h-3.5 w-3.5" />
                  {t("config.confirm")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function SettingRow({
  icon,
  label,
  desc,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <div>
          <div className="text-sm font-medium">{label}</div>
          {desc && (
            <div className="text-xs text-muted-foreground/70">{desc}</div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  icon,
  label,
  desc,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  checked: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground/70">{desc}</div>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
  disabled,
  badge,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  badge?: string;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-sm transition-colors",
        destructive
          ? "text-destructive hover:bg-destructive/5"
          : "text-foreground hover:bg-muted/50",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span className={cn(destructive ? "text-destructive/70" : "text-muted-foreground")}>
        {icon}
      </span>
      {label}
      {badge && (
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono font-semibold text-muted-foreground">
          {badge}
        </span>
      )}
    </button>
  );
}
