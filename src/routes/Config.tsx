import { useState, useEffect, useCallback } from "react";
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
  Volume2,
  Radio,
  Globe,
  Brain,
  Cpu,
  Key,
  Eye,
  EyeOff,
  Monitor,
} from "lucide-react";
import { useAppStore } from "@/stores/app";
import { useTheme } from "@/stores/theme";
import { system, config as configApi, indexer } from "@/lib/api";
import { isTauri } from "@/lib/api";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { checkForUpdate } from "@/lib/updater";
import {
  listVoicesForLang,
  isNaturalVoice,
  previewVoice,
  speechSupported,
} from "@/lib/voice";
import { VoiceMessagesModal } from "@/components/VoiceMessagesModal";
import { SpotterCommandsModal } from "@/components/SpotterCommandsModal";
import { INTENTS } from "@/lib/spotterCommands";
import { Tip, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { PROVIDERS, getProvider } from "@/lib/ai/providers";
import { fetchModels } from "@/lib/ai/models";
import { testConnection } from "@/lib/ai/coach";
import { systemPrompt } from "@/lib/ai/prompts/system";
import type { ModelInfo } from "@/lib/ai/types";

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
  const resultsDir = useAppStore((s) => s.resultsDir);
  const telemetryDir = useAppStore((s) => s.telemetryDir);
  const timezone = useAppStore((s) => s.timezone);
  const autoIndex = useAppStore((s) => s.autoIndex);
  const systemTray = useAppStore((s) => s.systemTray);
  const autoUpdate = useAppStore((s) => s.autoUpdate);
  const showOhneSpeed = useAppStore((s) => s.showOhneSpeed);
  // Overlays in-game : raccourci global Afficher/Masquer (toggle).
  const overlayToggleKey = useAppStore((s) => s.overlayToggleKey);
  const voiceAnnouncements = useAppStore((s) => s.voiceAnnouncements);
  const voiceUriByLang = useAppStore((s) => s.voiceUriByLang);
  const voiceLangCode = (i18n.language || "fr").slice(0, 2).toLowerCase();
  const voiceUri = voiceUriByLang[voiceLangCode] ?? "";
  const piperVoiceByLang = useAppStore((s) => s.piperVoiceByLang);
  const piperVoiceCur = piperVoiceByLang[voiceLangCode] ?? "";
  const piperSpeakerByLang = useAppStore((s) => s.piperSpeakerByLang);
  const piperSpeakerCur = piperSpeakerByLang[voiceLangCode] ?? 0;
  const voiceRate = useAppStore((s) => s.voiceRate);
  const voiceVolume = useAppStore((s) => s.voiceVolume);
  const voiceRadio = useAppStore((s) => s.voiceRadio);
  const voiceEngine = useAppStore((s) => s.voiceEngine);
  const spotterEnabled = useAppStore((s) => s.spotterEnabled);
  const spotterKeyStatus = useAppStore((s) => s.spotterKeyStatus);
  const spotterKeyMute = useAppStore((s) => s.spotterKeyMute);
  const spotterKeyRepeat = useAppStore((s) => s.spotterKeyRepeat);
  const spotterKeyTalk = useAppStore((s) => s.spotterKeyTalk);
  const spotterPttMode = useAppStore((s) => s.spotterPttMode);
  const aiCoachEnabled = useAppStore((s) => s.aiCoachEnabled);
  const aiProvider = useAppStore((s) => s.aiProvider);
  const aiApiKey = useAppStore((s) => s.aiApiKey);
  const aiModel = useAppStore((s) => s.aiModel);
  const aiSystemPromptByLang = useAppStore((s) => s.aiSystemPromptByLang);
  const spotterKeyCoach = useAppStore((s) => s.spotterKeyCoach);
  const indexing = useAppStore((s) => s.indexing);
  const indexReport = useAppStore((s) => s.indexReport);

  const [draftPlayer, setDraftPlayer] = useState(playerName);
  const [draftLmu, setDraftLmu] = useState(lmuPath);
  const [draftResults, setDraftResults] = useState(resultsDir);
  const [draftTelemetry, setDraftTelemetry] = useState(telemetryDir);
  useEffect(() => setDraftPlayer(playerName), [playerName]);
  useEffect(() => setDraftLmu(lmuPath), [lmuPath]);
  useEffect(() => setDraftResults(resultsDir), [resultsDir]);
  useEffect(() => setDraftTelemetry(telemetryDir), [telemetryDir]);

  // Instantané des valeurs « détectées »/établies (config enregistrée ou dernière
  // auto-détection). Le badge « Détecté automatiquement » d'un champ s'affiche tant
  // que sa valeur correspond à cet instantané (= non modifiée manuellement).
  const [detected, setDetected] = useState({
    player: playerName,
    lmu: lmuPath,
    results: resultsDir,
    telemetry: telemetryDir,
  });
  useEffect(() => {
    setDetected({
      player: playerName,
      lmu: lmuPath,
      results: resultsDir,
      telemetry: telemetryDir,
    });
  }, [playerName, lmuPath, resultsDir, telemetryDir]);

  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [maintMsg, setMaintMsg] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState("—");
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "uptodate" | "available" | "error">("idle");
  const [emptyGlobal, setEmptyGlobal] = useState<number | null>(null);
  const [emptyPlayer, setEmptyPlayer] = useState<number | null>(null);

  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [spotterCmdModalOpen, setSpotterCmdModalOpen] = useState(false);
  const [spotterOpen, setSpotterOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);

  // AI Coach (Phase 1) : liste des modèles chargée dynamiquement via le provider.
  const [showKey, setShowKey] = useState(false);
  const [aiModels, setAiModels] = useState<ModelInfo[]>([]);
  const [aiModelsLoading, setAiModelsLoading] = useState(false);
  const aiNeedsKey = getProvider(aiProvider)?.needsKey ?? true;

  const refreshAiModels = useCallback(async () => {
    const provider = getProvider(aiProvider);
    if (!provider) return;
    setAiModelsLoading(true);
    try {
      // La clé est lue à la volée (le bouton Rafraîchir la prend en compte sans
      // recharger à chaque frappe).
      const key = useAppStore.getState().aiApiKey;
      const models = await fetchModels(provider, key);
      setAiModels(models);
      // Si le modèle courant n'est plus proposé, on sélectionne le premier.
      const cur = useAppStore.getState().aiModel;
      if (models.length > 0 && !models.some((m) => m.id === cur)) {
        await useAppStore.getState().setAIModel(models[0].id);
      }
    } finally {
      setAiModelsLoading(false);
    }
  }, [aiProvider]);

  // Recharge au changement de fournisseur (et au montage).
  useEffect(() => {
    void refreshAiModels();
  }, [refreshAiModels]);

  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  // Éditeur du prompt système (override par langue active).
  const aiPromptCur = aiSystemPromptByLang[voiceLangCode] ?? "";
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState(aiPromptCur);
  useEffect(() => setPromptDraft(aiPromptCur), [aiPromptCur]);
  // Réinitialise le résultat de test quand la config change.
  useEffect(() => {
    setAiTestResult(null);
  }, [aiProvider, aiModel, aiApiKey]);

  const handleTestAi = async () => {
    const provider = getProvider(aiProvider);
    if (!provider) return;
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const res = await testConnection(provider, aiModel, useAppStore.getState().aiApiKey, t);
      setAiTestResult(res);
    } finally {
      setAiTesting(false);
    }
  };

  // Voix disponibles pour la langue courante (rechargées au besoin : la liste
  // arrive de façon asynchrone, d'où l'écoute de `voiceschanged`).
  const [voiceList, setVoiceList] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!speechSupported()) return;
    const refresh = () => setVoiceList(listVoicesForLang(i18n.language));
    refresh();
    window.speechSynthesis.addEventListener("voiceschanged", refresh);
    return () =>
      window.speechSynthesis.removeEventListener("voiceschanged", refresh);
  }, [i18n.language]);

  // Disponibilité de Piper pour la langue active (sinon repli voix système).
  const [piperOk, setPiperOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isTauri()) {
      setPiperOk(false);
      return;
    }
    invoke<boolean>("tts_available", { lang: i18n.language })
      .then(setPiperOk)
      .catch(() => setPiperOk(false));
  }, [i18n.language]);

  // Disponibilité de la reconnaissance vocale Vosk (spotter Couche 2) pour la langue.
  const [sttOk, setSttOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isTauri()) {
      setSttOk(false);
      return;
    }
    invoke<boolean>("stt_available", { lang: i18n.language })
      .then(setSttOk)
      .catch(() => setSttOk(false));
  }, [i18n.language]);

  // Voix Piper installées (id, langue, libellé, locuteurs) — pour le sélecteur.
  type PiperVoiceInfo = {
    id: string;
    lang: string;
    label: string;
    num_speakers: number;
    speakers: string[];
  };
  const [piperVoices, setPiperVoices] = useState<PiperVoiceInfo[]>([]);
  useEffect(() => {
    if (!isTauri()) {
      setPiperVoices([]);
      return;
    }
    invoke<PiperVoiceInfo[]>("tts_list_voices")
      .then(setPiperVoices)
      .catch(() => setPiperVoices([]));
  }, [piperOk]);
  // Voix Piper sélectionnée → nb de locuteurs (pour encoder la valeur courante).
  const piperSelected = piperVoices.find((v) => v.id === piperVoiceCur);
  const piperNumSpeakers = piperSelected?.num_speakers ?? 1;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  // Options de voix « à plat » : un modèle multi-locuteur (ex. UPMC) est éclaté en
  // une entrée par locuteur (Jessica, Pierre…) directement dans la liste de voix.
  const SPK_SEP = "::";
  const piperOptions = piperVoices
    .filter((v) => v.lang === voiceLangCode)
    .flatMap((v) =>
      v.num_speakers > 1
        ? Array.from({ length: v.num_speakers }, (_, i) => ({
            value: `${v.id}${SPK_SEP}${i}`,
            label: v.speakers[i]
              ? cap(v.speakers[i])
              : `${v.label} ${t("config.voiceSpeakerN", { n: i })}`,
          }))
        : [{ value: v.id, label: v.label }],
    );
  // Valeur courante encodée (id + indice de locuteur si multi-locuteur).
  const piperVoiceValue = piperVoiceCur
    ? piperNumSpeakers > 1
      ? `${piperVoiceCur}${SPK_SEP}${piperSpeakerCur}`
      : piperVoiceCur
    : "";
  const onPiperVoiceChange = (value: string) => {
    const [id, sp] = value.split(SPK_SEP);
    void useAppStore.getState().setPiperVoice(i18n.language, id);
    void useAppStore.getState().setPiperSpeaker(i18n.language, sp ? Number(sp) : 0);
  };

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
    draftLmu.trim() !== lmuPath ||
    draftResults.trim() !== resultsDir ||
    draftTelemetry.trim() !== telemetryDir;
  const canSave =
    dirty && draftPlayer.trim() !== "" && draftLmu.trim() !== "";

  // Un champ est « détecté » tant qu'il correspond à l'instantané (chemins
  // normalisés slashs/casse pour Windows). Une modification manuelle masque le badge.
  const normPath = (p: string) =>
    p.trim().replace(/[\\/]+/g, "/").replace(/\/+$/, "").toLowerCase();
  const playerAuto =
    draftPlayer.trim() !== "" && draftPlayer.trim() === detected.player.trim();
  const lmuAuto =
    draftLmu.trim() !== "" && normPath(draftLmu) === normPath(detected.lmu);
  const resultsAuto =
    draftResults.trim() !== "" &&
    normPath(draftResults) === normPath(detected.results);
  const telemetryAuto =
    draftTelemetry.trim() !== "" &&
    normPath(draftTelemetry) === normPath(detected.telemetry);

  // Badge « Détecté automatiquement » réutilisé par les 4 champs.
  const autoBadge = (show: boolean) =>
    show ? (
      <span className="inline-flex items-center gap-1 text-mini text-success font-normal">
        <Check className="h-3 w-3" />
        {t("config.autoDetected")}
      </span>
    ) : null;

  async function handleDetect() {
    setDetecting(true);
    setDetectError(null);
    try {
      const r = await configApi.detectLmu();
      setDraftLmu(r.lmu_path);
      setDraftResults(r.results_dir);
      setDraftTelemetry(r.telemetry_dir);
      if (r.player_name) setDraftPlayer(r.player_name);
      // Tous les champs renseignés par la détection portent le badge.
      setDetected({
        player: r.player_name || detected.player,
        lmu: r.lmu_path,
        results: r.results_dir,
        telemetry: r.telemetry_dir,
      });
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
      // Choisir un nouveau dossier de jeu repropose les chemins dérivés
      // (résultats + télémétrie) ; l'utilisateur peut ensuite les ajuster.
      const r = await configApi.inspectLmu(selected);
      setDraftResults(r.results_dir);
      setDraftTelemetry(r.telemetry_dir);
      const pickedPlayer = r.player_name && !draftPlayer.trim();
      if (pickedPlayer) setDraftPlayer(r.player_name);
      // Résultats/télémétrie sont auto-dérivés du dossier choisi → ils portent le
      // badge. Le chemin du jeu, lui, a été sélectionné manuellement.
      setDetected((prev) => ({
        ...prev,
        results: r.results_dir,
        telemetry: r.telemetry_dir,
        player: pickedPlayer ? r.player_name : prev.player,
      }));
    } catch (e) {
      setDetectError(String(e));
    }
  }

  // Sélecteur de dossier générique pour les chemins résultats / télémétrie.
  async function pickDir(
    setter: (v: string) => void,
    title: string,
  ) {
    if (!isTauri()) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false, title });
    if (typeof selected === "string" && selected) setter(selected);
  }

  async function confirmSave() {
    setShowConfirm(false);
    setSaveError(null);
    try {
      await useAppStore
        .getState()
        .runSetup(
          draftLmu.trim(),
          draftPlayer.trim(),
          draftResults.trim(),
          draftTelemetry.trim(),
        );
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
    <div className="flex flex-col gap-4 w-full">
      <div>
        <h1 className="text-xl font-bold tracking-tight">
          {t("config.title")}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">{t("config.subtitle")}</p>
      </div>

      <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">

          {/* ── Joueur & dossier ──────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2 px-4 pt-4 bg-primary/[0.08] border-b border-primary/20">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary">
                  <User className="h-3.5 w-3.5" />
                </div>
                <div>
                  <CardTitle className="text-sm text-primary">
                    {t("config.playerAndDir")}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {t("config.playerAndDirDesc")}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-3 space-y-3">
              <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground/80">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                <p className="leading-snug">{t("config.autoDetectInfo")}</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  {t("config.playerNameField")}
                  {autoBadge(playerAuto)}
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
                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  {t("config.lmuPath")}
                  {autoBadge(lmuAuto)}
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
                  <Tip content={t("config.pickFolderTip")} side="top">
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0 h-8 w-8"
                      onClick={handlePickFolder}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                    </Button>
                  </Tip>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  {t("config.resultsPath")}
                  {autoBadge(resultsAuto)}
                </label>
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <Database className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={draftResults}
                      onChange={(e) => setDraftResults(e.target.value)}
                      className="font-mono text-xs pl-9 h-8"
                      placeholder=".../UserData/Log/Results"
                    />
                  </div>
                  <Tip content={t("config.pickFolderTip")} side="top">
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0 h-8 w-8"
                      onClick={() =>
                        pickDir(setDraftResults, t("config.selectResultsFolder"))
                      }
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                    </Button>
                  </Tip>
                </div>
                <p className="text-mini text-muted-foreground/70">
                  {t("config.resultsPathDesc")}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  {t("config.telemetryPath")}
                  {autoBadge(telemetryAuto)}
                </label>
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <BarChart2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={draftTelemetry}
                      onChange={(e) => setDraftTelemetry(e.target.value)}
                      className="font-mono text-xs pl-9 h-8"
                      placeholder=".../UserData/Telemetry"
                    />
                  </div>
                  <Tip content={t("config.pickFolderTip")} side="top">
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0 h-8 w-8"
                      onClick={() =>
                        pickDir(
                          setDraftTelemetry,
                          t("config.selectTelemetryFolder"),
                        )
                      }
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                    </Button>
                  </Tip>
                </div>
                <p className="text-mini text-muted-foreground/70">
                  {t("config.telemetryPathDesc")}
                </p>
              </div>

              {(detectError || saveError) && (
                <p className="text-xs text-destructive bg-destructive/5 px-2.5 py-1.5 rounded-md">
                  {detectError || saveError}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleDetect}
                  disabled={detecting || indexing}
                >
                  {detecting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                  {t("config.detect")}
                </Button>
                <div className="flex items-center gap-2 ml-auto">
                  {dirty && (
                    <span className="text-xs text-yellow-500/80 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
                      {t("config.unsavedChanges")}
                    </span>
                  )}
                  <Button
                    className="gap-1.5"
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
              </div>
            </CardContent>
          </Card>

          {/* ── Apparence & langue ────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2 px-4 pt-4 bg-primary/[0.08] border-b border-primary/20">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary">
                  <Settings2 className="h-3.5 w-3.5" />
                </div>
                <div>
                  <CardTitle className="text-sm text-primary">
                    {t("config.preferences")}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {t("config.preferencesDesc")}
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
                icon={<Globe className="h-4 w-4" />}
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
              <Separator />
              <ToggleRow
                icon={<Zap className="h-4 w-4" />}
                label={t("config.autoIndex")}
                desc={t("config.autoIndexDesc")}
                tip={t("config.autoIndexTip")}
                checked={autoIndex}
                onChange={(v) => useAppStore.getState().setAutoIndex(v)}
              />
              <Separator />
              <ToggleRow
                icon={<Settings2 className="h-4 w-4" />}
                label={t("config.systemTray")}
                desc={t("config.systemTrayDesc")}
                tip={t("config.systemTrayTip")}
                checked={systemTray}
                onChange={(v) => useAppStore.getState().setSystemTray(v)}
              />
              <Separator />
              <ToggleRow
                icon={<BarChart2 className="h-4 w-4" />}
                label={t("config.ohneSpeed")}
                desc={t("config.ohneSpeedDesc")}
                tip={t("config.ohneSpeedTip")}
                checked={showOhneSpeed}
                onChange={(v) => useAppStore.getState().setShowOhneSpeed(v)}
              />
              <Separator />
              <SettingRow
                icon={<Monitor className="h-4 w-4" />}
                label={t("config.overlayToggleKey")}
                desc={t("config.overlayToggleKeyDesc")}
              >
                <ShortcutCapture
                  label=""
                  value={overlayToggleKey || t("config.shortcutNone")}
                  onChange={(a) => useAppStore.getState().setOverlayToggleKey(a)}
                  onClear={() => useAppStore.getState().setOverlayToggleKey("")}
                />
              </SettingRow>
            </CardContent>
          </Card>

          {/* ── Audio / Voix ─────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2 px-4 pt-4 bg-primary/[0.08] border-b border-primary/20">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary">
                  <Volume2 className="h-3.5 w-3.5" />
                </div>
                <div>
                  <CardTitle className="text-sm text-primary">
                    {t("config.audioVoice")}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {t("config.audioVoiceDesc")}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-0">
              <ToggleRow
                icon={<Volume2 className="h-4 w-4" />}
                label={t("config.voiceAnnounce")}
                desc={t("config.voiceAnnounceDesc")}
                tip={t("config.voiceAnnounceTip")}
                checked={voiceAnnouncements}
                onChange={(v) => {
                  useAppStore.getState().setVoiceAnnouncements(v);
                  // Le spotter dépend des annonces vocales : on le coupe aussi.
                  if (!v && spotterEnabled)
                    useAppStore.getState().setSpotterEnabled(false);
                }}
              />
              {voiceAnnouncements && speechSupported() && (
                <div className="ml-2 border-l border-primary/10 pl-3">
                  <button
                    type="button"
                    onClick={() => setVoiceOpen((o) => !o)}
                    className="flex w-full items-center gap-1.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        voiceOpen ? "" : "-rotate-90",
                      )}
                    />
                    {t("config.voiceSettings")}
                    {voiceEngine === "piper" && (
                      <span
                        className={cn(
                          "ml-auto text-mini font-normal",
                          piperOk === false ? "text-amber-500" : "text-success",
                        )}
                      >
                        {piperOk === null
                          ? "…"
                          : piperOk
                            ? t("config.voiceEngineActive")
                            : t("config.voiceEngineFallback")}
                      </span>
                    )}
                  </button>
                  {voiceOpen && (
                  <div className="pr-1 pb-1 pt-1 space-y-3">
                  {/* Moteur de synthèse */}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="min-w-0">
                      <div className="text-sm font-medium leading-tight">
                        {t("config.voiceEngine")}
                      </div>
                      <div className="text-xs text-muted-foreground/80 mt-0.5">
                        {t("config.voiceEngineDesc")}
                      </div>
                    </div>
                    <select
                      value={voiceEngine}
                      onChange={(e) =>
                        useAppStore
                          .getState()
                          .setVoiceEngine(e.target.value === "system" ? "system" : "piper")
                      }
                      className="h-8 rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer shrink-0"
                    >
                      <option value="piper">{t("config.voiceEnginePiper")}</option>
                      <option value="system">{t("config.voiceEngineSystem")}</option>
                    </select>
                  </div>
                  {/* Voix système + bouton de test */}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="min-w-0">
                      <div className="text-sm font-medium leading-tight">
                        {t("config.voiceVoice")}
                      </div>
                      <div className="text-xs text-muted-foreground/80 mt-0.5">
                        {t("config.voiceVoiceDesc")}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {voiceEngine === "piper" ? (
                        <select
                          value={piperVoiceValue}
                          onChange={(e) => onPiperVoiceChange(e.target.value)}
                          className="h-8 max-w-[220px] rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                        >
                          <option value="">{t("config.voiceAuto")}</option>
                          {piperOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select
                          value={voiceUri}
                          onChange={(e) =>
                            useAppStore
                              .getState()
                              .setVoiceUri(i18n.language, e.target.value)
                          }
                          className="h-8 max-w-[220px] rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                        >
                          <option value="">{t("config.voiceAuto")}</option>
                          {voiceList.map((v) => (
                            <option key={v.voiceURI} value={v.voiceURI}>
                              {v.name}
                              {isNaturalVoice(v)
                                ? ` — ${t("config.voiceNaturalTag")}`
                                : ""}
                            </option>
                          ))}
                        </select>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() =>
                          previewVoice(t("config.voiceTestPhrase"), i18n.language)
                        }
                      >
                        {t("config.voiceTest")}
                      </Button>
                    </div>
                  </div>
                  {voiceEngine === "system" && voiceList.length === 0 && (
                    <div className="text-xs text-muted-foreground/70">
                      {t("config.voiceNoneFound")}
                    </div>
                  )}
                  {/* Vitesse de parole */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium leading-tight">
                      {t("config.voiceRate")}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="range"
                        min={0.6}
                        max={1.6}
                        step={0.05}
                        value={voiceRate}
                        onChange={(e) =>
                          useAppStore
                            .getState()
                            .setVoiceRate(Number(e.target.value))
                        }
                        className="w-32 accent-primary cursor-pointer"
                      />
                      <span className="text-xs tabular-nums w-10 text-right text-muted-foreground">
                        {voiceRate.toFixed(2)}×
                      </span>
                    </div>
                  </div>
                  {/* Volume des annonces */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium leading-tight">
                        {t("config.voiceVolume")}
                      </div>
                      <div className="text-xs text-muted-foreground/80 mt-0.5">
                        {t("config.voiceVolumeDesc")}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={voiceVolume}
                        onChange={(e) =>
                          useAppStore
                            .getState()
                            .setVoiceVolume(Number(e.target.value))
                        }
                        className="w-32 accent-primary cursor-pointer"
                      />
                      <span className="text-xs tabular-nums w-10 text-right text-muted-foreground">
                        {Math.round(voiceVolume * 100)}%
                      </span>
                    </div>
                  </div>
                  {/* Effet radio / talkie */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium leading-tight">
                        {t("config.voiceRadio")}
                      </div>
                      <div className="text-xs text-muted-foreground/80 mt-0.5">
                        {t("config.voiceRadioDesc")}
                      </div>
                    </div>
                    <Switch
                      checked={voiceRadio}
                      onCheckedChange={(v) =>
                        useAppStore.getState().setVoiceRadio(v)
                      }
                      className="shrink-0"
                    />
                  </div>
                  {/* Personnaliser les messages */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium leading-tight">
                        {t("live.vmTitle")}
                      </div>
                      <div className="text-xs text-muted-foreground/80 mt-0.5">
                        {t("live.vmSubtitle")}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 shrink-0"
                      onClick={() => setVoiceModalOpen(true)}
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                      {t("live.vmOpen")}
                    </Button>
                  </div>
                  </div>
                  )}
                </div>
              )}
              <Separator />
              {/* ── Spotter à la demande (raccourcis globaux) ── */}
              <ToggleRow
                icon={<Radio className="h-4 w-4" />}
                label={t("config.spotter")}
                desc={
                  voiceAnnouncements
                    ? t("config.spotterDesc")
                    : t("config.spotterNeedsVoice")
                }
                tip={t("config.spotterTip")}
                checked={spotterEnabled}
                onChange={(v) => useAppStore.getState().setSpotterEnabled(v)}
                disabled={!voiceAnnouncements}
              />
              {spotterEnabled && voiceAnnouncements && (
                <div className="ml-2 border-l border-primary/10 pl-3">
                  <button
                    type="button"
                    onClick={() => setSpotterOpen((o) => !o)}
                    className="flex w-full items-center gap-1.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        spotterOpen ? "" : "-rotate-90",
                      )}
                    />
                    {t("config.spotterSettings")}
                    <span
                      className={cn(
                        "ml-auto text-mini font-normal",
                        sttOk === false ? "text-amber-500" : "text-success",
                      )}
                    >
                      {sttOk === null
                        ? "…"
                        : sttOk
                          ? t("config.spotterTalkActive")
                          : t("config.spotterTalkFallback")}
                    </span>
                  </button>
                  {spotterOpen && (
                  <div className="pr-1 pb-1 pt-1 space-y-2">
                  <p className="text-xs text-muted-foreground/80">
                    {t("config.spotterKeyHint")}
                  </p>
                  <ShortcutCapture
                    label={t("config.spotterKeyStatus")}
                    value={spotterKeyStatus}
                    onChange={(a) =>
                      useAppStore.getState().setSpotterKey("status", a)
                    }
                    onClear={() =>
                      useAppStore.getState().setSpotterKey("status", "")
                    }
                  />
                  <ShortcutCapture
                    label={t("config.spotterKeyMute")}
                    value={spotterKeyMute}
                    onChange={(a) =>
                      useAppStore.getState().setSpotterKey("mute", a)
                    }
                    onClear={() =>
                      useAppStore.getState().setSpotterKey("mute", "")
                    }
                  />
                  <ShortcutCapture
                    label={t("config.spotterKeyRepeat")}
                    value={spotterKeyRepeat}
                    onChange={(a) =>
                      useAppStore.getState().setSpotterKey("repeat", a)
                    }
                    onClear={() =>
                      useAppStore.getState().setSpotterKey("repeat", "")
                    }
                  />

                  {/* ── Couche 2 : push-to-talk (reconnaissance par commandes) ── */}
                  <Separator className="my-1" />
                  <p className="text-xs text-muted-foreground/80">
                    {t("config.spotterTalkHint")}
                  </p>
                  <ShortcutCapture
                    label={t("config.spotterKeyTalk")}
                    value={spotterKeyTalk}
                    onChange={(a) =>
                      useAppStore.getState().setSpotterKey("talk", a)
                    }
                    onClear={() =>
                      useAppStore.getState().setSpotterKey("talk", "")
                    }
                  />
                  {/* Mode du « Parler » : maintenir (hold) ou appui/re-appui (toggle). */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-muted-foreground/80">
                      {t("config.spotterPttMode")}
                    </div>
                    <div className="flex rounded-md border border-input overflow-hidden shrink-0">
                      {(["hold", "toggle"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() =>
                            useAppStore.getState().setSpotterPttMode(m)
                          }
                          className={cn(
                            "px-2.5 py-1 text-xs transition-colors",
                            spotterPttMode === m
                              ? "bg-primary text-primary-foreground"
                              : "bg-transparent hover:bg-accent",
                          )}
                        >
                          {t(`config.spotterPtt${m === "hold" ? "Hold" : "Toggle"}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-mini text-muted-foreground/60 -mt-1">
                    {spotterPttMode === "hold"
                      ? t("config.spotterPttHoldDesc")
                      : t("config.spotterPttToggleDesc")}
                  </p>
                  {/* Commandes disponibles — bien visibles (chips) */}
                  <div className="pt-0.5">
                    <div className="text-xs text-muted-foreground/80 mb-1.5">
                      {t("config.spotterCmdAvailable")}
                    </div>
                    <div className="flex flex-wrap gap-x-1 gap-y-1 cursor-default">
                      {INTENTS.map((intent, idx) => (
                        <span key={intent} className="text-xs text-muted-foreground">
                          {t(`config.spotterCmd${cap(intent)}`).split(" (")[0]}
                          {idx < INTENTS.length - 1 && (
                            <span className="text-muted-foreground/40"> · </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => setSpotterCmdModalOpen(true)}
                  >
                    <Radio className="h-3.5 w-3.5" />
                    {t("config.spotterCmdOpen")}
                  </Button>
                  </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── AI Coach ─────────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2 px-4 pt-4 bg-primary/[0.08] border-b border-primary/20">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary">
                  <Brain className="h-3.5 w-3.5" />
                </div>
                <div>
                  <CardTitle className="text-sm text-primary flex items-center gap-1.5">
                    {t("config.aiCoach")}
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                      beta
                    </span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {t("config.aiCoachDesc")}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-0">
              {/* Activer / désactiver — masque le coach de toutes les pages. */}
              <ToggleRow
                icon={<Brain className="h-4 w-4" />}
                label={t("config.aiCoachEnable")}
                desc={t("config.aiCoachEnableDesc")}
                checked={aiCoachEnabled}
                onChange={(v) => void useAppStore.getState().setAICoachEnabled(v)}
              />
              {aiCoachEnabled && (
              <>
              <Separator />
              {/* Fournisseur */}
              <SettingRow icon={<Globe className="h-4 w-4" />} label={t("config.aiProvider")}>
                <select
                  value={aiProvider}
                  onChange={(e) =>
                    void useAppStore.getState().setAIProvider(e.target.value)
                  }
                  className="h-8 max-w-[200px] rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </SettingRow>

              {/* Clé API (masquée si le fournisseur n'en a pas besoin, ex. Ollama) */}
              {aiNeedsKey && (
                <>
                  <Separator />
                  <SettingRow icon={<Key className="h-4 w-4" />} label={t("config.aiApiKey")}>
                    <div className="relative flex items-center">
                      <Input
                        type={showKey ? "text" : "password"}
                        value={aiApiKey}
                        onChange={(e) =>
                          void useAppStore.getState().setAIApiKey(e.target.value)
                        }
                        placeholder="••••••••"
                        className="h-8 w-[220px] pr-8 text-sm"
                      />
                      <button
                        type="button"
                        onMouseDown={() => setShowKey(true)}
                        onMouseUp={() => setShowKey(false)}
                        onMouseLeave={() => setShowKey(false)}
                        aria-label={t("config.aiRevealKey")}
                        className="absolute right-2 text-muted-foreground hover:text-foreground rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {showKey ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </SettingRow>
                </>
              )}

              <Separator />
              {/* Modèle (peuplé dynamiquement via listModels) + Rafraîchir */}
              <SettingRow icon={<Cpu className="h-4 w-4" />} label={t("config.aiModel")}>
                <div className="flex items-center gap-2">
                  <select
                    value={aiModel}
                    onChange={(e) =>
                      void useAppStore.getState().setAIModel(e.target.value)
                    }
                    disabled={aiModels.length === 0}
                    className="h-8 max-w-[200px] rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer disabled:opacity-50"
                  >
                    {aiModels.length === 0 && (
                      <option value="">{t("config.aiNoModels")}</option>
                    )}
                    {aiModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <Tip content={t("config.aiRefreshModels")} side="top">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => void refreshAiModels()}
                      disabled={aiModelsLoading}
                      aria-label={t("config.aiRefreshModels")}
                    >
                      {aiModelsLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </Tip>
                </div>
              </SettingRow>

              <Separator />
              {/* Éditeur du prompt système (affinage par l'utilisateur) */}
              <div className="py-2">
                <button
                  type="button"
                  onClick={() => setPromptOpen((v) => !v)}
                  className="flex w-full items-center gap-2 text-sm font-medium"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {t("config.aiPrompt")}
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {voiceLangCode}
                  </span>
                  {aiPromptCur && (
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                      {t("config.aiPromptCustom")}
                    </span>
                  )}
                  <ChevronDown
                    className={cn(
                      "ml-auto h-4 w-4 text-muted-foreground transition-transform",
                      promptOpen && "rotate-180",
                    )}
                  />
                </button>
                {promptOpen && (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-muted-foreground/70">{t("config.aiPromptNote")}</p>
                    <textarea
                      value={promptDraft}
                      onChange={(e) => setPromptDraft(e.target.value)}
                      placeholder={systemPrompt(i18n.language)}
                      rows={8}
                      className="w-full rounded-md border border-input bg-background p-2 text-xs font-mono leading-snug focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPromptDraft(systemPrompt(i18n.language))}
                      >
                        {t("config.aiPromptDefault")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!aiPromptCur && !promptDraft}
                        onClick={() => {
                          setPromptDraft("");
                          void useAppStore.getState().setAISystemPrompt(i18n.language, "");
                        }}
                      >
                        {t("config.aiPromptReset")}
                      </Button>
                      <Button
                        size="sm"
                        disabled={promptDraft === aiPromptCur}
                        onClick={() => void useAppStore.getState().setAISystemPrompt(i18n.language, promptDraft)}
                      >
                        {t("config.aiPromptSave")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <Separator />
              {/* Coach vocal mains libres : raccourci push-to-talk global */}
              <div className="py-2 space-y-1.5">
                <ShortcutCapture
                  label={t("config.aiVoiceKey")}
                  value={spotterKeyCoach}
                  onChange={(accel) =>
                    void useAppStore.getState().setSpotterKey("coach", accel)
                  }
                  onClear={() =>
                    void useAppStore.getState().setSpotterKey("coach", "")
                  }
                />
                <p className="text-xs text-muted-foreground/70">{t("config.aiVoiceKeyDesc")}</p>
              </div>
              <Separator />
              {/* Bouton test de connexion */}
              <div className="flex items-center justify-end gap-2 py-2">
                {aiTestResult && (
                  <span
                    className={cn(
                      "text-xs truncate max-w-[180px]",
                      aiTestResult.ok ? "text-emerald-500" : "text-destructive",
                    )}
                    title={aiTestResult.ok ? t("config.aiTestOk") : aiTestResult.error}
                  >
                    {aiTestResult.ok ? t("config.aiTestOk") : aiTestResult.error}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => void handleTestAi()}
                  disabled={aiTesting || !aiModel || (aiNeedsKey && !aiApiKey)}
                >
                  {aiTesting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Zap className="h-3.5 w-3.5" />
                  )}
                  {t("config.aiTestConnection")}
                </Button>
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground/70 py-2">
                {t("config.aiKeyNote")}
              </p>
              </>
              )}
            </CardContent>
          </Card>

          {/* ── Maintenance ──────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2 px-4 pt-4 bg-primary/[0.08] border-b border-primary/20">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary">
                  <Wrench className="h-3.5 w-3.5" />
                </div>
                <div>
                  <CardTitle className="text-sm text-primary">
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
                tip={t("config.syncDeltaTip")}
                onClick={handleSync}
                disabled={indexing}
              />
              <ActionRow
                icon={<Database className="h-4 w-4" />}
                label={indexing ? t("config.indexing") : t("config.reindex")}
                tip={t("config.reindexTip")}
                onClick={handleReindex}
                disabled={indexing}
              />
              <ActionRow
                icon={<Eraser className="h-4 w-4" />}
                label={t("config.purgeEmpty")}
                tip={t("config.purgeEmptyTip")}
                badge={emptyGlobal != null && emptyGlobal > 0 ? String(emptyGlobal) : undefined}
                onClick={() => handlePurge("global")}
                disabled={indexing}
              />
              <ActionRow
                icon={<Eraser className="h-4 w-4" />}
                label={t("config.purgeEmptyPlayer")}
                tip={t("config.purgeEmptyPlayerTip")}
                badge={emptyPlayer != null && emptyPlayer > 0 ? String(emptyPlayer) : undefined}
                onClick={() => handlePurge("player")}
                disabled={indexing}
              />
              <ActionRow
                icon={<Trash2 className="h-4 w-4" />}
                label={t("config.clearCache")}
                tip={t("config.clearCacheTip")}
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
                      <div className="font-mono text-micro text-destructive/80 max-h-24 overflow-y-auto space-y-0.5 pl-[22px]">
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

          {/* À propos (empilé sous Maintenance) */}
          <Card>
            <CardHeader className="pb-2 px-4 pt-4 bg-primary/[0.08] border-b border-primary/20">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary">
                  <Info className="h-3.5 w-3.5" />
                </div>
                <CardTitle className="text-sm text-primary">{t("config.about")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              <div className="flex items-center justify-between px-2.5 py-2 rounded-md bg-muted/40">
                <span className="text-xs text-muted-foreground">{t("config.version")}</span>
                <span className="font-mono text-sm font-semibold text-primary">
                  v{appVersion}
                </span>
              </div>
              <ToggleRow
                icon={<RefreshCw className="h-4 w-4" />}
                label={t("config.autoUpdate")}
                desc={t("config.autoUpdateDesc")}
                tip={t("config.autoUpdateTip")}
                checked={autoUpdate}
                onChange={(v) => useAppStore.getState().setAutoUpdate(v)}
              />
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
          </div>{/* fin grille */}
      </div>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowConfirm(false);
          }}
        >
          <Card className="w-full max-w-md mx-4 shadow-2xl">
            <CardHeader className="pb-2 px-4 pt-4 bg-primary/[0.08] border-b border-primary/20">
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

      {voiceModalOpen && (
        <VoiceMessagesModal onClose={() => setVoiceModalOpen(false)} />
      )}
      {spotterCmdModalOpen && (
        <SpotterCommandsModal onClose={() => setSpotterCmdModalOpen(false)} />
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

/**
 * Capture d'un raccourci clavier → chaîne d'accélérateur Tauri (ex. "Alt+S").
 * Au clic, passe en mode « écoute » et capture la prochaine combinaison
 * (modificateurs + touche). Les touches modificatrices seules sont ignorées.
 */
function ShortcutCapture({
  label,
  value,
  onChange,
  onClear,
}: {
  label: string;
  value: string;
  onChange: (accel: string) => void;
  /** Si fourni, affiche une gomme qui efface le raccourci. */
  onClear?: () => void;
}) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    const key = e.key;
    if (key === "Escape") {
      setRecording(false);
      return;
    }
    // Ignore les frappes de modificateurs seuls : on attend une vraie touche.
    if (["Control", "Alt", "Shift", "Meta"].includes(key)) return;
    const mods: string[] = [];
    if (e.ctrlKey) mods.push("Control");
    if (e.altKey) mods.push("Alt");
    if (e.shiftKey) mods.push("Shift");
    if (e.metaKey) mods.push("Super");
    // Normalisation de la touche principale (lettre en majuscule, sinon brut).
    const main = key.length === 1 ? key.toUpperCase() : key;
    onChange([...mods, main].join("+"));
    setRecording(false);
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setRecording(true)}
          onBlur={() => setRecording(false)}
          onKeyDown={onKeyDown}
          className={cn(
            "h-8 min-w-[8rem] px-3 rounded-md border text-xs font-medium tabular-nums transition-colors",
            recording
              ? "border-primary text-primary animate-pulse"
              : "border-input hover:bg-muted/50",
          )}
        >
          {recording
            ? t("config.spotterRecording")
            : value || t("config.shortcutNone")}
        </button>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            aria-label={t("config.clearShortcut")}
            title={t("config.clearShortcut")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-input text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          >
            <Eraser className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  icon,
  label,
  desc,
  tip,
  checked,
  onChange,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  tip?: string;
  checked: boolean;
  onChange: (b: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-2 gap-3",
        disabled && "opacity-50",
      )}
    >
      <div className="flex items-start gap-2 min-w-0">
        <Tip content={tip ?? ""} side="right">
          <span className="text-muted-foreground cursor-help mt-0.5 shrink-0">{icon}</span>
        </Tip>
        <div className="min-w-0">
          <div className="text-sm font-medium leading-tight">{label}</div>
          <div className="text-xs text-muted-foreground/80 mt-0.5">{desc}</div>
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="shrink-0"
      />
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
  tip,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  badge?: string;
  destructive?: boolean;
  tip?: string;
}) {
  const btn = (
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
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-micro font-mono font-semibold text-muted-foreground">
          {badge}
        </span>
      )}
    </button>
  );

  if (!tip) return btn;
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs">{tip}</TooltipContent>
    </Tooltip>
  );
}
