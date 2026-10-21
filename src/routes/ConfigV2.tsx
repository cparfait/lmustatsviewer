/**
 * Page de configuration — PROPOSITION V2 (aperçu complet).
 *
 * MÊME contenu et MÊMES réglages que `Config.tsx` (route `/config`), mais
 * réorganisés en navigation latérale par catégories au lieu de 7 cartes
 * accordéon empilées. Branchée sur le vrai store — 100 % fonctionnelle.
 *
 * NE remplace PAS `Config.tsx` (route `/config` inchangée). Logique dupliquée
 * volontairement pour ne rien casser avant la publication de la V1.0 ; le jour
 * où la V2 est adoptée, on supprime l'ancienne page et la duplication disparaît.
 */

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
/** Entre deux réglages encadrés : un espacement plutôt qu'un trait. */
const Separator = (_: { className?: string }) => <div className="h-2" aria-hidden />;
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MENU_MODULE_KEYS } from "@/components/layout/Header";
import { ReplayBenchPanel } from "@/components/ReplayBenchPanel";
import { RegieSettings } from "@/components/RegieSettings";
import { ToolsSettings } from "@/components/ToolsSettings";
import { InsightsToggle, TierSourceSelect } from "@/components/ClassementOptions";
import { LabSettings } from "@/components/LabSettings";
import { RecordAnnounceSetting, ReviewMarksSetting, SessionDetailSettings } from "@/components/AnalysisExtrasSettings";
import {
  FolderOpen,
  RefreshCw,
  Square,
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
  Sparkles,
  Check,
  ChevronDown,
  BarChart2,
  Volume2,
  Radio,
  Globe,
  Brain,
  Cpu,
  Monitor,
  LayoutGrid,
  Heart,
  ExternalLink,
  HelpCircle,
  Target,
  Fuel,
  ShieldAlert,
  MessagesSquare,
  Disc,
  Upload,
  Users,
  Tablet,
  Hammer,
  Trophy,
  Ear,
  Flag,
  Gauge,
  Repeat,
  Timer,
  ArrowLeftRight,
  Scale,
  Mic,
  AudioLines,
  Gamepad2,
  MessageCircleQuestion,
  MapPin,
  PenLine,
  BatteryCharging,
  Film,
  Pencil,
  FlaskConical,
} from "lucide-react";
import { useAppStore } from "@/stores/app";
import { DictationEngine, VoiceDownloads } from "@/components/VoiceDownloads";
import { RADIO_STYLES, toRadioStyle } from "@/lib/radioFx";
import { useTheme } from "@/stores/theme";
import { system, config as configApi, indexer, queries } from "@/lib/api";
import { isTauri, type WheelBinding } from "@/lib/api";
import { toast, toastSuccess, toastError } from "@/stores/dialogs";
import {
  applyOrGeneratePhrasebank,
  clearPhrasebankForCurrentCombo,
} from "@/lib/coachPhrasebank";
import { importGhost, coachComboInfo } from "@/lib/coach";
import {
  startCorpusRecording,
  stopCorpusRecording,
  recordedFrames,
  isRecording,
} from "@/lib/coach/recorder";
import { invoke } from "@tauri-apps/api/core";
import { cn, formatTime } from "@/lib/utils";
import { checkForUpdate } from "@/lib/updater";
import {
  listVoicesForLang,
  isNaturalVoice,
  previewVoice,
  announceAnswer,
  speechSupported,
} from "@/lib/voice";
import { MAX_VOICE_VOLUME, pttBeep } from "@/lib/radioFx";
import { VoiceMessagesModal } from "@/components/VoiceMessagesModal";
import { VoiceIntroModal } from "@/components/VoiceIntroModal";
import { SpotterCommandsModal } from "@/components/SpotterCommandsModal";
import { INTENTS } from "@/lib/spotterCommands";
import { Tip, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  DiagnosticsRows,
  RadioPresetAndExtras,
  RadioSoundRows,
  SpotterTuningRows,
  WheelActionsRows,
} from "@/components/config/RadioExtrasSettings";
import { getProvider, isForeignModel } from "@/lib/ai/providers";
import { fetchModels } from "@/lib/ai/models";
import { testConnection, chat, friendlyError } from "@/lib/ai/coach";
import { systemPrompt } from "@/lib/ai/prompts/system";
import type { ModelInfo } from "@/lib/ai/types";
import { AiModelPicker } from "@/components/AiModelPicker";
import { AiProvidersPanel } from "@/components/AiProvidersPanel";
import { FREE_LIST_URL } from "@/lib/ai/providers/free";
import { CloudVoiceSettings } from "@/components/CloudVoiceSettings";
import { CloudVoiceGuide } from "@/components/CloudVoiceGuide";
import { EngineerTester } from "@/components/EngineerTester";
import { VoiceCoachConfig } from "@/components/VoiceCoachConfig";
import { AiCoachHelpModal } from "@/components/AiCoachHelpModal";
import { CommunitySettings } from "@/components/CommunitySettings";

/** Clé effective d'un fournisseur : propre au custom, sinon créneau global. */
function aiEffectiveKey(id: string): string {
  return useAppStore.getState().aiProviderKeys[id] ?? "";
}

const LANGUAGES = [
  { code: "fr", label: "Français", flag: "/flags/fr.png" },
  { code: "en", label: "English", flag: "/flags/gb.png" },
  { code: "es", label: "Español", flag: "/flags/es.png" },
  { code: "de", label: "Deutsch", flag: "/flags/de.png" },
  { code: "it", label: "Italiano", flag: "/flags/it.png" },
];

/** Crédits — sources de données / inspirations utilisées par l'app. */
const CREDIT_SOURCES: { name: string; roleKey: string; url?: string }[] = [
  {
    name: "ApexPoints",
    roleKey: "creditBraking",
    url: "https://apex-brake-flow.base44.app/",
  },
  {
    name: "Unleashed Drivers",
    roleKey: "creditVideos",
    url: "https://www.youtube.com/playlist?list=PLk_3Ekb3fRQgMjnknAxq5ZGiT3sUOyFA7",
  },
  {
    name: "HYMO Academy",
    roleKey: "creditVideos",
    url: "https://www.youtube.com/@HYMOAcademy",
  },
  {
    name: "GO Setups",
    roleKey: "creditVideos",
    url: "https://www.youtube.com/@gosetups",
  },
  {
    name: "OhneSpeed",
    roleKey: "creditPace",
    url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTN03UvJDm99byA6vQPZHKOCYVvfxLu1zkJAzdaKyROykzEKY2-Xl1rl1q5znZEf36m88dxMKsY2eaO/pubhtml?gid=1766901750&single=true",
  },
  {
    name: "awesome-free-llm-apis (mnfst)",
    roleKey: "creditFreeAi",
    url: FREE_LIST_URL,
  },
];

const TIMEZONES: string[] = (() => {
  try {
    return Intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
})();

type CatId =
  | "profile"
  | "display"
  | "voice"
  | "coach"
  | "lab"
  | "community"
  | "regie"
  | "tools"
  | "maintenance"
  | "credits";

const SIDEBAR: { id: CatId; icon: typeof User; labelKey: string }[] = [
  { id: "profile", icon: User, labelKey: "config.playerAndDir" },
  { id: "display", icon: Settings2, labelKey: "config.preferences" },
  { id: "voice", icon: Volume2, labelKey: "config.audioVoice" },
  { id: "coach", icon: Brain, labelKey: "config.aiCoach" },
  { id: "lab", icon: FlaskConical, labelKey: "lab.settings.title" },
  { id: "community", icon: Users, labelKey: "config.community" },
  { id: "regie", icon: Tablet, labelKey: "config.regieNav" },
  { id: "tools", icon: Hammer, labelKey: "config.toolsNav" },
  { id: "maintenance", icon: Wrench, labelKey: "config.maintenance" },
  { id: "credits", icon: Heart, labelKey: "config.credits" },
];

export function ConfigV2() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();

  // Catégorie ouvrable par lien direct (`/config?cat=community`).
  const [cat, setCat] = useState<CatId>(() => {
    const wanted = new URLSearchParams(window.location.search).get("cat");
    return SIDEBAR.find((c) => c.id === wanted)?.id ?? "profile";
  });

  const playerName = useAppStore((s) => s.playerName);
  const lmuPath = useAppStore((s) => s.lmuPath);
  const resultsDir = useAppStore((s) => s.resultsDir);
  const telemetryDir = useAppStore((s) => s.telemetryDir);
  const timezone = useAppStore((s) => s.timezone);
  const autoIndex = useAppStore((s) => s.autoIndex);
  const restPollOffTrack = useAppStore((s) => s.restPollOffTrack);
  const systemTray = useAppStore((s) => s.systemTray);
  const autoUpdate = useAppStore((s) => s.autoUpdate);
  const launchIntro = useAppStore((s) => s.launchIntro);
  const whatsNew = useAppStore((s) => s.whatsNew);
  const showOhneSpeed = useAppStore((s) => s.showOhneSpeed);
  const mapIncidents = useAppStore((s) => s.mapIncidents);
  const mapNorthUp = useAppStore((s) => s.mapNorthUp);
  const gameWrites = useAppStore((s) => s.gameWrites);
  const pitAutoEnergy = useAppStore((s) => s.pitAutoEnergy);
  const overlayTargetTier = useAppStore((s) => s.overlayTargetTier);
  const menuModules = useAppStore((s) => s.menuModules);
  const overlayToggleKey = useAppStore((s) => s.overlayToggleKey);
  const voiceAnnouncements = useAppStore((s) => s.voiceAnnouncements);
  const coachDrill = useAppStore((s) => s.coachDrill);
  const coachStint = useAppStore((s) => s.coachStint);
  const coachRisk = useAppStore((s) => s.coachRisk);
  const coachPhrasebank = useAppStore((s) => s.coachPhrasebank);
  const pitLossSeconds = useAppStore((s) => s.pitLossSeconds);
  const fuelReserveLaps = useAppStore((s) => s.fuelReserveLaps);
  const [pbBusy, setPbBusy] = useState(false);
  const [ghostBusy, setGhostBusy] = useState(false);
  // Enregistrement de corpus (§14.1) : `recBusy` reflète l'état du module,
  // qui survit au démontage de la page — on peut lancer la capture puis aller
  // rouler, l'enregistrement continue.
  const [recBusy, setRecBusy] = useState(isRecording);
  const [recFrames, setRecFrames] = useState(0);
  // Compteur de trames pendant la capture. Le module accumule hors de React ;
  // une sonde à 1 Hz suffit largement pour un retour visuel.
  useEffect(() => {
    if (!recBusy) return;
    const id = setInterval(() => setRecFrames(recordedFrames()), 1000);
    return () => clearInterval(id);
  }, [recBusy]);
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
  const aiProviderList = useAppStore((s) => s.aiProviderList);
  const aiCustomProviders = useAppStore((s) => s.aiCustomProviders);
  // Aucun fournisseur ajouté : on n'affiche ni fournisseur actif ni modèle
  // (l'ancienne valeur par défaut « Google » laissait croire que c'était prêt).
  const noAiProvider = aiProviderList.length === 0 && aiCustomProviders.length === 0;
  const aiActiveKey = useAppStore((s) => s.aiProviderKeys[s.aiProvider] ?? "");
  const aiModel = useAppStore((s) => s.aiModel);
  const aiSystemPromptByLang = useAppStore((s) => s.aiSystemPromptByLang);
  const spotterKeyCoach = useAppStore((s) => s.spotterKeyCoach);
  const radioMode = useAppStore((s) => s.radioMode);
  const localAnswers = useAppStore((s) => s.localAnswers);
  const aiVoiceRadioPrompt = useAppStore((s) => s.aiVoiceRadioPrompt);
  const aiVoiceGuard = useAppStore((s) => s.aiVoiceGuard);
  const sttConfirmUnsure = useAppStore((s) => s.sttConfirmUnsure);
  const debriefRadio = useAppStore((s) => s.debriefRadio);
  const trackRecallRadio = useAppStore((s) => s.trackRecallRadio);
  const paceOutlookRadio = useAppStore((s) => s.paceOutlookRadio);
  const pttRecognition = useAppStore((s) => s.pttRecognition);
  const announceEverywhere = useAppStore((s) => s.announceEverywhere);
  const classPositions = useAppStore((s) => s.classPositions);
  const radioQuietZones = useAppStore((s) => s.radioQuietZones);
  const radioPhases = useAppStore((s) => s.radioPhases);
  const radioBudgets = useAppStore((s) => s.radioBudgets);
  const radioAskPrefs = useAppStore((s) => s.radioAskPrefs);
  const radioReplay = useAppStore((s) => s.radioReplay);
  const voiceLapPrecision = useAppStore((s) => s.voiceLapPrecision);
  const proximitySpotter = useAppStore((s) => s.proximitySpotter);
  const coachRigor = useAppStore((s) => s.coachRigor);
  const micReady = useAppStore((s) => s.micReady);
  const wakeWordEnabled = useAppStore((s) => s.wakeWordEnabled);
  const radioStyleSetting = useAppStore((s) => s.radioStyle);
  const pttBeeps = useAppStore((s) => s.pttBeeps);
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
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "checking" | "uptodate" | "available" | "error"
  >("idle");
  const [emptyGlobal, setEmptyGlobal] = useState<number | null>(null);
  const [emptyPlayer, setEmptyPlayer] = useState<number | null>(null);

  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [cloudGuideOpen, setCloudGuideOpen] = useState(false);
  // Modale d'intro aux annonces vocales (explication + téléchargement de la
  // voix de la langue) — ouverte à l'activation du toggle si la voix manque.
  const [voiceIntroOpen, setVoiceIntroOpen] = useState(false);
  const [spotterCmdModalOpen, setSpotterCmdModalOpen] = useState(false);
  const [aiHelpOpen, setAiHelpOpen] = useState(false);
  /** Sous-onglet d'« Audio / Voix » (remplace le dépliant « Réglages des annonces »). */
  const [voiceTab, setVoiceTab] = useState<"voice" | "announces" | "radio" | "coach">("voice");

  const [aiModels, setAiModels] = useState<ModelInfo[]>([]);
  const [aiModelsLoading, setAiModelsLoading] = useState(false);
  const aiProviderDef = getProvider(aiProvider);
  /** Clé exigée pour appeler (grise le bouton Tester si absente). */
  const aiNeedsKey = aiProviderDef?.needsKey ?? true;

  const refreshAiModels = useCallback(async () => {
    const provider = getProvider(aiProvider);
    if (!provider) return;
    setAiModelsLoading(true);
    try {
      const models = await fetchModels(provider, aiEffectiveKey(aiProvider));
      // Réponse arrivée après un changement de fournisseur : la liste (et l'amorçage)
      // de l'ancien fournisseur ne doivent pas atterrir chez le nouveau — c'est ainsi
      // qu'un modèle Gemini se retrouvait choisi avec Ollama.
      if (useAppStore.getState().aiProvider !== provider.id) return;
      setAiModels(models);
      // Modèle enregistré qui appartient visiblement à un AUTRE fournisseur (dans ses
      // modèles connus, absent de la liste de celui-ci) : état hérité du bug ci-dessus,
      // on le remet à zéro pour ré-amorcer.
      const current = useAppStore.getState().aiModel;
      if (current && !models.some((m) => m.id === current) && isForeignModel(current, provider.id)) {
        await useAppStore.getState().setAIModel("");
      }
      // Amorçage SEULEMENT si aucun modèle n'est encore choisi. On ne remplace
      // jamais une valeur existante : l'endpoint `/models` est incomplet chez
      // plusieurs fournisseurs (modèle tout juste sorti, id saisi à la main,
      // repli statique hors ligne) — écraser reviendrait à effacer en silence
      // le choix du pilote à chaque ouverture de la page.
      if (models.length > 0 && !useAppStore.getState().aiModel) {
        // On saute les modèles en cours de retrait : Google liste encore les
        // Gemini 2.5 pour les clés anciennes alors qu'ils sont condamnés —
        // amorcer dessus déclencherait l'alerte « modèle retiré » d'entrée.
        const seed = models.find((m) => !provider.isRetiredModel?.(m.id)) ?? models[0];
        await useAppStore.getState().setAIModel(seed.id);
      }
    } finally {
      setAiModelsLoading(false);
    }
  }, [aiProvider]);

  useEffect(() => {
    void refreshAiModels();
  }, [refreshAiModels]);

  // Coach vocal héritant du fournisseur d'analyse : reset du modèle vocal
  // périmé au changement de fournisseur (fournisseur vocal distinct = intact).
  const prevProviderRef = useRef(aiProvider);
  useEffect(() => {
    if (prevProviderRef.current !== aiProvider) {
      prevProviderRef.current = aiProvider;
      const st = useAppStore.getState();
      if (st.aiVoiceProvider === "" && st.aiVoiceModel)
        void st.setAIVoiceModel("");
    }
  }, [aiProvider]);

  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{
    ok: boolean;
    error?: string;
  } | null>(null);

  const aiPromptCur = aiSystemPromptByLang[voiceLangCode] ?? "";
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState(aiPromptCur);
  useEffect(() => setPromptDraft(aiPromptCur), [aiPromptCur]);
  useEffect(() => {
    setAiTestResult(null);
  }, [aiProvider, aiModel, aiActiveKey]);

  const handleTestAi = async () => {
    const provider = getProvider(aiProvider);
    if (!provider) return;
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const res = await testConnection(provider, aiModel, aiEffectiveKey(aiProvider), t);
      setAiTestResult(res);
    } finally {
      setAiTesting(false);
    }
  };

  // « Tester l'IA » : au-delà du ping de connexion, un vrai tour de chauffe —
  // le modèle reçoit les stats RÉELLES du pilote (dernière course, voiture
  // fétiche, circuit favori) et doit en faire un mot d'ingénieur radio. Prouve
  // toute la chaîne (clé, modèle, contexte, langue) avec un résultat parlant.
  const [aiFunTesting, setAiFunTesting] = useState(false);
  const [aiFunResult, setAiFunResult] = useState<{ text?: string; error?: string } | null>(
    null,
  );
  useEffect(() => {
    setAiFunResult(null);
  }, [aiProvider, aiModel, aiActiveKey]);

  const handleTestAiFun = async () => {
    const provider = getProvider(aiProvider);
    if (!provider) return;
    setAiFunTesting(true);
    setAiFunResult(null);
    try {
      const st = useAppStore.getState();
      const stats =
        st.dashboardStats ?? (await queries.getDashboardStats().catch(() => null));
      const page = await queries
        .getSessionsList({ session_type: "Race" }, "Date", "desc", 1, 1)
        .catch(() => null);
      const last = page?.rows[0];
      const facts: string[] = [];
      if (st.playerName) facts.push(`Driver name: ${st.playerName}`);
      if (last) {
        facts.push(
          `Last race: ${last.track} (${last.car}, ${last.car_class}) — finished P${last.class_position}` +
            (last.best_lap ? `, best lap ${formatTime(last.best_lap)}` : "") +
            ` — ${new Date(last.timestamp * 1000).toLocaleDateString()}`,
        );
      }
      if (stats?.favorite_car) facts.push(`Most used car: ${stats.favorite_car}`);
      if (stats?.favorite_track) facts.push(`Favourite track: ${stats.favorite_track}`);
      if (stats) {
        facts.push(
          `Career: ${stats.total_sessions} sessions, ${Math.round(stats.total_driving_hours)} h driven, ${stats.wins} wins, ${stats.podiums} podiums`,
        );
      }
      if (facts.length === 0) {
        setAiFunResult({ error: t("config.aiTestFunNoData") });
        return;
      }
      const text = await chat(
        provider,
        aiModel,
        aiEffectiveKey(aiProvider),
        [
          {
            role: "system",
            content:
              "You are the driver's race engineer in the sim-racing app LMU Stats Viewer. Friendly radio tone, no markdown.",
          },
          {
            role: "user",
            content:
              `Driver data:\n${facts.join("\n")}\n\n` +
              `In ${i18n.language.startsWith("fr") ? "French" : i18n.language.startsWith("es") ? "Spanish" : i18n.language.startsWith("de") ? "German" : i18n.language.startsWith("it") ? "Italian" : "English"}, greet the driver by name and give a short, warm 2-3 sentence radio message using these facts (last race, favourite car and track). No lists, no headings.`,
          },
        ],
        300,
        true,
      );
      const clean = text.trim().replace(/[*_`#>]/g, "");
      if (clean) {
        setAiFunResult({ text: clean });
        // Lecture par la voix du coach (même chaîne radio que les annonces en
        // course) : le test valide aussi le TTS. Réponse au pilote → voix IA en
        // ligne si elle est activée (Piper en secours), comme en course.
        announceAnswer(clean, i18n.language);
      } else {
        setAiFunResult({ error: t("coach.errNetwork") });
      }
    } catch (e) {
      setAiFunResult({ error: friendlyError(e, t, aiProviderDef) });
    } finally {
      setAiFunTesting(false);
    }
  };

  const [voiceList, setVoiceList] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!speechSupported()) return;
    const refresh = () => setVoiceList(listVoicesForLang(i18n.language));
    refresh();
    window.speechSynthesis.addEventListener("voiceschanged", refresh);
    return () =>
      window.speechSynthesis.removeEventListener("voiceschanged", refresh);
  }, [i18n.language]);

  // Incrémenté après chaque téléchargement de modèle vocal (VoiceDownloads)
  // pour re-tester tts/stt_available et recharger la liste des voix.
  const [assetsVersion, setAssetsVersion] = useState(0);

  const [piperOk, setPiperOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isTauri()) {
      setPiperOk(false);
      return;
    }
    invoke<boolean>("tts_available", { lang: i18n.language })
      .then(setPiperOk)
      .catch(() => setPiperOk(false));
  }, [i18n.language, assetsVersion]);

  const [sttOk, setSttOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isTauri()) {
      setSttOk(false);
      return;
    }
    invoke<boolean>("stt_available", { lang: i18n.language })
      .then(setSttOk)
      .catch(() => setSttOk(false));
  }, [i18n.language, assetsVersion]);

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
  }, [piperOk, assetsVersion]);
  const piperSelected = piperVoices.find((v) => v.id === piperVoiceCur);
  const piperNumSpeakers = piperSelected?.num_speakers ?? 1;
  const cap = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);
  const SPK_SEP = "::";
  const piperOptions = piperVoices
    .filter((v) => v.lang === voiceLangCode)
    .flatMap((v) =>
      v.num_speakers > 1
        ? Array.from({ length: v.num_speakers }, (_, i) => ({
            voiceId: v.id,
            value: `${v.id}${SPK_SEP}${i}`,
            // Affichés sous leur voix dans la liste (« UPMC » › « Jessica », « Pierre »).
            label: v.speakers[i]
              ? cap(v.speakers[i])
              : `${v.label} ${t("config.voiceSpeakerN", { n: i })}`,
          }))
        : [{ voiceId: v.id, value: v.id, label: v.label }],
    );
  const piperVoiceValue = piperVoiceCur
    ? piperNumSpeakers > 1
      ? `${piperVoiceCur}${SPK_SEP}${piperSpeakerCur}`
      : piperVoiceCur
    : "";
  const onPiperVoiceChange = (value: string) => {
    const [id, sp] = value.split(SPK_SEP);
    void useAppStore.getState().setPiperVoice(i18n.language, id);
    void useAppStore
      .getState()
      .setPiperSpeaker(i18n.language, sp ? Number(sp) : 0);
  };
  /** Choisit la voix puis joue la phrase d'essai (liste des voix neuronales). */
  const testPiperVoice = (value: string) => {
    onPiperVoiceChange(value);
    setTimeout(() => previewVoice(t("config.voiceTestPhrase"), i18n.language, { localOnly: true }), 150);
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
  const canSave = dirty && draftPlayer.trim() !== "" && draftLmu.trim() !== "";

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

  const autoBadge = (show: boolean) =>
    show ? (
      <span title={t("config.autoDetected")}>
        <Check className="h-3 w-3 text-success" />
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
      const r = await configApi.inspectLmu(selected);
      setDraftResults(r.results_dir);
      setDraftTelemetry(r.telemetry_dir);
      const pickedPlayer = r.player_name && !draftPlayer.trim();
      if (pickedPlayer) setDraftPlayer(r.player_name);
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

  async function pickDir(setter: (v: string) => void, title: string) {
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
    try {
      await useAppStore.getState().reindexAll();
      setMaintMsg(t("config.reindexDone"));
    } catch (e) {
      toastError(`${t("config.maintError")} : ${e}`);
    }
  }
  async function handleSync() {
    setMaintMsg(null);
    try {
      await useAppStore.getState().syncIndex();
      setMaintMsg(t("config.syncDone"));
    } catch (e) {
      toastError(`${t("config.maintError")} : ${e}`);
    }
  }
  async function handleClearCache() {
    setMaintMsg(null);
    try {
      await useAppStore.getState().clearCache();
      setMaintMsg(t("config.cacheCleared"));
    } catch (e) {
      toastError(`${t("config.maintError")} : ${e}`);
    }
  }
  async function handlePurge(purgeType: "global" | "player") {
    setMaintMsg(null);
    try {
      const removed = await useAppStore
        .getState()
        .purgeEmptySessions(purgeType);
      setMaintMsg(t("config.purgeDone", { count: removed }));
      refreshEmptyCounts();
    } catch (e) {
      toastError(`${t("config.maintError")} : ${e}`);
    }
  }

  const active = SIDEBAR.find((c) => c.id === cat)!;

  return (
    <div className="flex flex-col gap-4 w-full max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t("config.title")}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{t("config.subtitle")}</p>
      </div>

      <Card className="overflow-hidden">
        <div className="flex min-h-[520px] flex-col sm:flex-row">
          {/* Navigation latérale */}
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/60 bg-primary/5 p-2 sm:w-56 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
            {SIDEBAR.map((c) => {
              const Icon = c.icon;
              const on = c.id === cat;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCat(c.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm font-semibold transition-colors whitespace-nowrap sm:whitespace-normal",
                    on
                      ? "border-primary/30 bg-primary/[0.12] text-primary"
                      : "border-transparent text-primary/70 hover:bg-primary/10 hover:text-primary",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                      on ? "bg-primary/10 text-primary" : "text-primary/70",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {t(c.labelKey)}
                </button>
              );
            })}
          </nav>

          {/* Contenu de la catégorie active */}
          <section className="min-w-0 flex-1 p-5">
            <div className="w-full">
            <div className="mb-4 flex items-center gap-2">
              <active.icon className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">{t(active.labelKey)}</h2>
            </div>

            {/* ── Profil & dossiers ── */}
            {cat === "profile" && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground/80">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                  <p className="leading-snug">
                    {t("config.autoDetectInfo")}{" "}
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <Check className="h-3 w-3 text-success" />
                      {t("config.autoDetectLegend")}
                    </span>
                  </p>
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
                          pickDir(setDraftTelemetry, t("config.selectTelemetryFolder"))
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
              </div>
            )}

            {/* ── Affichage & menu (modules + apparence/langue) ── */}
            {cat === "display" && (
              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 font-semibold">
                    {t("config.preferences")}
                  </h3>
                  <SettingRow icon={<Sun className="h-4 w-4" />} label={t("config.theme")} tip={t("config.themeTip")}>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setTheme("light")}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border",
                          theme === "light"
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-transparent text-muted-foreground border-border hover:bg-muted/50",
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
                            : "bg-transparent text-muted-foreground border-border hover:bg-muted/50",
                        )}
                      >
                        <Moon className="h-3.5 w-3.5" />
                        {t("config.themeDark")}
                      </button>
                    </div>
                  </SettingRow>
                  <Separator />
                  <SettingRow icon={<Globe className="h-4 w-4" />} label={t("config.language")} tip={t("config.languageTip")}>
                    {(() => {
                      const current =
                        LANGUAGES.find((l) => i18n.language?.startsWith(l.code)) ??
                        LANGUAGES[0];
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
                    tip={t("config.timezoneTip")}
                  >
                    <Select
                      value={timezone}
                      onValueChange={(v) => useAppStore.getState().setTimezone(v)}
                      ariaLabel={t("config.timezone")}
                      className="h-8 max-w-[200px] px-2.5"
                      options={[
                        { value: "", label: t("config.timezoneSystem") },
                        ...TIMEZONES.map((tz) => ({ value: tz, label: tz })),
                      ]}
                    />
                  </SettingRow>
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
                    icon={<Film className="h-4 w-4" />}
                    label={t("config.launchIntro")}
                    desc={t("config.launchIntroDesc")}
                    tip={t("config.launchIntroTip")}
                    checked={launchIntro}
                    onChange={(v) => useAppStore.getState().setLaunchIntro(v)}
                  />
                  <Separator />
                  <ToggleRow
                    icon={<Sparkles className="h-4 w-4" />}
                    label={t("config.whatsNew")}
                    desc={t("config.whatsNewDesc")}
                    tip={t("config.whatsNewTip")}
                    checked={whatsNew}
                    onChange={(v) => useAppStore.getState().setWhatsNew(v)}
                  />
                </div>

                <CollapsibleSection
                  id="menuModules"
                  title={t("config.menuModules")}
                  desc={t("config.menuModulesDesc")}
                >
                  {MENU_MODULE_KEYS.map((key, i) => (
                    <Fragment key={key}>
                      {i > 0 && <Separator />}
                      <ToggleRow
                        icon={<LayoutGrid className="h-4 w-4" />}
                        label={t(`nav.${key}`)}
                        tip={t("config.menuModuleTip")}
                        checked={menuModules[key] !== false}
                        onChange={(v) =>
                          useAppStore.getState().setMenuModule(key, v)
                        }
                      />
                      {key === "overlays" && (
                        <Disclosure title={t("config.moduleOptions")}>
                          <SettingRow
                            icon={<Monitor className="h-4 w-4" />}
                            label={t("config.overlayToggleKey")}
                            desc={t("config.overlayToggleKeyDesc")}
                          >
                            <ShortcutCapture
                              label=""
                              value={overlayToggleKey || t("config.shortcutNone")}
                              onChange={(a) =>
                                useAppStore.getState().setOverlayToggleKey(a)
                              }
                              onClear={() =>
                                useAppStore.getState().setOverlayToggleKey("")
                              }
                            />
                          </SettingRow>
                        </Disclosure>
                      )}
                      {key === "live" && (
                        <Disclosure title={t("config.moduleOptions")}>
                          <ToggleRow
                            icon={<MapPin className="h-4 w-4" />}
                            label={t("config.mapIncidents")}
                            tip={t("config.mapIncidentsTip")}
                            checked={mapIncidents}
                            onChange={(v) => void useAppStore.getState().setMapIncidents(v)}
                          />
                          <ToggleRow
                            icon={<MapPin className="h-4 w-4" />}
                            label={t("config.mapNorthUp")}
                            tip={t("config.mapNorthUpTip")}
                            checked={mapNorthUp}
                            onChange={(v) => void useAppStore.getState().setMapNorthUp(v)}
                          />
                          <ToggleRow
                            icon={<PenLine className="h-4 w-4" />}
                            label={t("config.gameWrites")}
                            tip={t("config.gameWritesTip")}
                            checked={gameWrites}
                            onChange={(v) => void useAppStore.getState().setGameWrites(v)}
                          />
                          <ToggleRow
                            icon={<BatteryCharging className="h-4 w-4" />}
                            label={t("config.pitAutoEnergy")}
                            tip={t("config.pitAutoEnergyTip")}
                            checked={pitAutoEnergy}
                            disabled={!gameWrites}
                            onChange={(v) => void useAppStore.getState().setPitAutoEnergy(v)}
                          />
                        </Disclosure>
                      )}
                      {key === "sessions" && (
                        <>
                          <Separator />
                          <ToggleRow
                            icon={<BarChart2 className="h-4 w-4" />}
                            label={t("nav.references")}
                            tip={t("config.referencesTip")}
                            checked={showOhneSpeed}
                            onChange={(v) =>
                              useAppStore.getState().setShowOhneSpeed(v)
                            }
                          />
                          <Disclosure title={t("config.moduleOptions")}>
                            <div>
                              <div className="text-xs font-medium">
                                {t("config.ohneSpeed")}
                              </div>
                              <p className="text-[11px] leading-snug text-muted-foreground">
                                {t("config.ohneSpeedDesc")}
                              </p>
                            </div>
                            <TierSourceSelect />
                            <InsightsToggle />
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-xs font-medium">
                                  {t("config.overlayTarget")}
                                </div>
                                <Select
                                  value={overlayTargetTier}
                                  onValueChange={(v) =>
                                    useAppStore.getState().setOverlayTargetTier(v)
                                  }
                                  ariaLabel={t("config.overlayTarget")}
                                  className="h-8 max-w-[180px]"
                                  options={[
                                    { value: "alien", label: t("config.targetAlien") },
                                    {
                                      value: "competitive",
                                      label: t("config.targetCompetitive"),
                                    },
                                    { value: "good", label: t("config.targetGood") },
                                    { value: "midpack", label: t("config.targetMidpack") },
                                  ]}
                                />
                              </div>
                              <p className="text-[11px] leading-snug text-muted-foreground">
                                {t("config.overlayTargetDesc")}
                              </p>
                            </div>
                          </Disclosure>
                        </>
                      )}
                    </Fragment>
                  ))}
                  <Separator />
                  <p className="px-1 pt-2 text-xs text-muted-foreground">
                    {t("config.menuModulesNote")}
                  </p>
                </CollapsibleSection>
              </div>
            )}

            {cat === "display" && (
              <div className="mt-4">
                <SessionDetailSettings />
              </div>
            )}

            {/* ── Voix & audio ── */}
            {cat === "voice" && (
              <div>
                <ToggleRow
                  icon={<Volume2 className="h-4 w-4" />}
                  label={t("config.voiceAnnounce")}
                  desc={t("config.voiceAnnounceDesc")}
                  tip={t("config.voiceAnnounceTip")}
                  checked={voiceAnnouncements}
                  onChange={(v) => {
                    useAppStore.getState().setVoiceAnnouncements(v);
                    if (!v && spotterEnabled)
                      useAppStore.getState().setSpotterEnabled(false);
                    // À l'activation, si la voix neuronale de la langue manque :
                    // modale d'explication + proposition de téléchargement.
                    if (v && isTauri() && voiceEngine === "piper" && piperOk === false)
                      setVoiceIntroOpen(true);
                  }}
                />
                {/* Bandeau bien visible (rien à déplier) tant que la voix
                    neuronale de la langue n'est pas téléchargée. */}
                {voiceAnnouncements && voiceEngine === "piper" && (
                  <VoiceDownloads
                    kind="tts"
                    variant="banner"
                    onInstalled={() => setAssetsVersion((v) => v + 1)}
                  />
                )}
                {/* Sous-onglets d'« Audio / Voix » (la page était devenue trop longue). */}
                {voiceAnnouncements && (
                <div className="flex flex-wrap gap-1 border-b border-border/50 pb-2 pt-1" role="tablist">
                  {(
                    [
                      ["voice", "config.voiceTabVoice"],
                      ["announces", "config.voiceTabAnnounces"],
                      ["radio", "config.voiceTabRadio"],
                      ["coach", "config.voiceTabCoach"],
                    ] as const
                  ).map(([id, key]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={voiceTab === id}
                      onClick={() => setVoiceTab(id)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                        voiceTab === id
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>
                )}
                {/* Records au volant : marche aussi sans annonces vocales (bips). */}
                {voiceTab === "announces" && voiceAnnouncements && (
                  <div className="py-2">
                    <RecordAnnounceSetting />
                  </div>
                )}
                {voiceTab === "announces" && voiceAnnouncements && (
                  <div className="pb-2">
      <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
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
          <Pencil className="h-3.5 w-3.5" />
          {t("live.vmOpen")}
        </Button>
      </div>
                  </div>
                )}
                {!voiceAnnouncements && (
                  <div className="space-y-2 py-2">
                    <p className="text-xs text-muted-foreground">{t("config.voiceOffHint")}</p>
                    <RecordAnnounceSetting />
                    <ReviewMarksSetting />
                  </div>
                )}
                {/* Onglet « Voix » : moteur, voix IA en ligne, voix, vitesse, volume,
                    effet radio, bips, téléchargements, personnalisation. */}
                {voiceTab === "voice" && voiceAnnouncements && speechSupported() && (
                  <div>
                    {voiceEngine === "piper" && (
                      <div className="flex justify-end">
                        <span
                          className={cn(
                            "text-mini",
                            piperOk === false ? "text-amber-500" : "text-success",
                          )}
                        >
                          {piperOk === null
                            ? "…"
                            : piperOk
                              ? t("config.voiceEngineActive")
                              : t("config.voiceEngineFallback")}
                        </span>
                      </div>
                    )}
                    {(
                      <div className="pr-1 pb-1 pt-1 space-y-2">
                        <CollapsibleSection id="voiceLocal" title={t("cloudGuide.localTitle")} defaultOpen>
                        <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium leading-tight">
                              {t("config.voiceEngine")}
                            </div>
                            {/* Une ligne par moteur (nom en gras), puis le repli. */}
                            <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                              <p>
                                <strong className="font-semibold text-foreground">Piper</strong> : {t("config.voiceEnginePiperDesc")}
                              </p>
                              <p>
                                <strong className="font-semibold text-foreground">{t("config.voiceEngineSystemShort")}</strong> : {t("config.voiceEngineSystemDesc")}
                              </p>
                              <p className="pt-1 text-muted-foreground/80">{t("config.voiceEngineAutoFallback")}</p>
                            </div>
                          </div>
                          <Select
                            value={voiceEngine}
                            onValueChange={(v) =>
                              useAppStore
                                .getState()
                                .setVoiceEngine(v === "system" ? "system" : "piper")
                            }
                            ariaLabel={t("config.voiceEngine")}
                            className="h-8 shrink-0 px-2.5"
                            options={[
                              { value: "piper", label: t("config.voiceEnginePiper") },
                              { value: "system", label: t("config.voiceEngineSystem") },
                            ]}
                          />
                        </div>
                        {voiceEngine === "piper" && (
                          <>
                            <div className="rounded-md border border-border p-3"><VoiceDownloads
                              kind="tts"
                              onInstalled={() => setAssetsVersion((v) => v + 1)}
                              pick={{
                                options: piperOptions,
                                value: piperVoiceValue,
                                onSelect: onPiperVoiceChange,
                                onTest: testPiperVoice,
                              }}
                            /></div>
                          </>
                        )}
                        {voiceEngine === "system" && (
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium leading-tight">
                              {t("config.voiceVoice")}
                            </div>
                            <div className="text-xs text-muted-foreground/80 mt-0.5">
                              {t("config.voiceVoiceDesc")}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                              <Select
                                value={voiceUri}
                                onValueChange={(v) =>
                                  useAppStore.getState().setVoiceUri(i18n.language, v)
                                }
                                ariaLabel={t("config.voiceVoice")}
                                className="h-8 max-w-[220px] px-2.5"
                                options={[
                                  { value: "", label: t("config.voiceAuto") },
                                  ...voiceList.map((v) => ({
                                    value: v.voiceURI,
                                    label:
                                      v.name +
                                      (isNaturalVoice(v)
                                        ? ` — ${t("config.voiceNaturalTag")}`
                                        : ""),
                                  })),
                                ]}
                              />
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={() =>
                                previewVoice(
                                  t("config.voiceTestPhrase"),
                                  i18n.language,
                                  { localOnly: true },
                                )
                              }
                            >
                              {t("config.voiceTest")}
                            </Button>
                          </div>
                        </div>
                        )}
                        {voiceEngine === "system" && voiceList.length === 0 && (
                          <div className="text-xs text-muted-foreground/70">
                            {t("config.voiceNoneFound")}
                          </div>
                        )}
                        </div>
                        </CollapsibleSection>
                        {/* Voix en ligne avec la clé de l'utilisateur (bêta, désactivée par défaut). */}
                        {voiceEngine === "piper" && isTauri() && (
                          <CollapsibleSection
                            id="voiceCloud"
                            title={t("cloudGuide.cloudTitle")}
                            defaultOpen
                            action={
                              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setCloudGuideOpen(true)}>
                                <HelpCircle className="h-3.5 w-3.5" />
                                {t("cloudGuide.button")}
                              </Button>
                            }
                          >
                            <CloudVoiceSettings />
                          </CollapsibleSection>
                        )}
                        <CollapsibleSection id="voiceSound" title={t("config.voiceGroupSound")} defaultOpen>
                        <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
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
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
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
                              max={MAX_VOICE_VOLUME}
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
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
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
                        {/* Profil de l'effet radio + comparaison à l'écoute (A puis B). */}
                        {voiceRadio && (
                          <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium leading-tight">
                                {t("config.radioStyle")}
                              </div>
                              <div className="text-xs text-muted-foreground/80 mt-0.5">
                                {voiceEngine === "piper"
                                  ? t("config.radioStyleDesc")
                                  : t("config.radioStylePiperOnly")}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Select
                                value={radioStyleSetting}
                                onValueChange={(v) => void useAppStore.getState().setRadioStyleSetting(toRadioStyle(v))}
                                ariaLabel={t("config.radioStyle")}
                                className="h-8 w-48 px-2.5 text-xs"
                                options={RADIO_STYLES.map((rs) => ({ value: rs, label: t(`config.radioStyle_${rs}`) }))}
                              />
                              {/* Joue une phrase avec le profil choisi, dans la voix active (Piper ou IA). */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => previewVoice(t("config.radioCompareSample"), i18n.language)}
                              >
                                {t("config.voiceTest")}
                              </Button>
                            </div>
                          </div>
                        )}
                        <RadioSoundRows />
                        </div>
                        </CollapsibleSection>
                      </div>
                    )}
                  </div>
                )}
                {/* Réglages des annonces regroupés en sections repliables (chaque réglage
                    garde l'ancien comportement accessible : décoché = comme avant). */}
                {voiceTab === "announces" && voiceAnnouncements && (
                  <div className="space-y-2 pt-1">
                    <CollapsibleSection id="announceGroupWhen" title={t("config.announceGroupWhen")} desc={t("config.announceGroupWhenDesc")}>
                      <div className="space-y-2">
<div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <Tip content={t("config.radioModeTip")} side="right">
                        <span className="text-primary cursor-help mt-0.5 shrink-0">
                          <Radio className="h-4 w-4" />
                        </span>
                      </Tip>
                      <div className="min-w-0">
                        <div className="text-sm font-medium leading-tight">
                          {t("config.radioMode")}
                        </div>
                        <div className="text-xs text-muted-foreground/80 mt-0.5">
                          {radioMode === "engineer"
                            ? t("config.radioModeEngineerDesc")
                            : t("config.radioModeFullDesc")}
                        </div>
                      </div>
                    </div>
                    <div className="flex rounded-md border border-input overflow-hidden shrink-0">
                      {(["engineer", "full"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => void useAppStore.getState().setRadioMode(m)}
                          className={cn(
                            "px-2.5 py-1 text-xs transition-colors",
                            radioMode === m
                              ? "bg-primary text-primary-foreground"
                              : "bg-transparent hover:bg-accent",
                          )}
                        >
                          {t(m === "engineer" ? "config.radioModeEngineer" : "config.radioModeFull")}
                        </button>
                      ))}
                    </div>
                  </div>
<ToggleRow
                    icon={<Monitor className="h-4 w-4" />}
                    label={t("config.announceEverywhere")}
                    desc={t("config.announceEverywhereDesc")}
                    tip={t("config.announceEverywhereTip")}
                    checked={announceEverywhere}
                    onChange={(v) => void useAppStore.getState().setAnnounceEverywhere(v)}
                  />
<ToggleRow
                      icon={<Ear className="h-4 w-4" />}
                      label={t("config.radioQuietZones")}
                      desc={t("config.radioQuietZonesDesc")}
                      tip={t("config.radioQuietZonesTip")}
                      checked={radioQuietZones}
                      onChange={(v) => void useAppStore.getState().setRadioQuietZones(v)}
                    />
<ToggleRow
                      icon={<Flag className="h-4 w-4" />}
                      label={t("config.radioPhases")}
                      desc={t("config.radioPhasesDesc")}
                      tip={t("config.radioPhasesTip")}
                      checked={radioPhases}
                      onChange={(v) => void useAppStore.getState().setRadioPhases(v)}
                      disabled={radioMode === "full"}
                    />
<ToggleRow
                      icon={<Gauge className="h-4 w-4" />}
                      label={t("config.radioBudgets")}
                      desc={t("config.radioBudgetsDesc")}
                      tip={t("config.radioBudgetsTip")}
                      checked={radioBudgets}
                      onChange={(v) => void useAppStore.getState().setRadioBudgets(v)}
                      disabled={radioMode === "full"}
                    />
<ToggleRow
                      icon={<Repeat className="h-4 w-4" />}
                      label={t("config.radioReplay")}
                      desc={t("config.radioReplayDesc")}
                      tip={t("config.radioReplayTip")}
                      checked={radioReplay}
                      onChange={(v) => void useAppStore.getState().setRadioReplay(v)}
                    />
<ToggleRow
                      icon={<Flag className="h-4 w-4" />}
                      label={t("config.debriefRadio")}
                      desc={t("config.debriefRadioDesc")}
                      tip={t("config.debriefRadioTip")}
                      checked={debriefRadio}
                      onChange={(v) => void useAppStore.getState().setDebriefRadio(v)}
                    />
<ToggleRow
                      icon={<MapPin className="h-4 w-4" />}
                      label={t("config.trackRecallRadio")}
                      desc={t("config.trackRecallRadioDesc")}
                      tip={t("config.trackRecallRadioTip")}
                      checked={trackRecallRadio}
                      onChange={(v) => void useAppStore.getState().setTrackRecallRadio(v)}
                    />
<ToggleRow
                      icon={<Gauge className="h-4 w-4" />}
                      label={t("config.paceOutlookRadio")}
                      desc={t("config.paceOutlookRadioDesc")}
                      tip={t("config.paceOutlookRadioTip")}
                      checked={paceOutlookRadio}
                      onChange={(v) => void useAppStore.getState().setPaceOutlookRadio(v)}
                    />
<ToggleRow
                      icon={<MessageCircleQuestion className="h-4 w-4" />}
                      label={t("config.radioAskPrefs")}
                      desc={t("config.radioAskPrefsDesc")}
                      tip={t("config.radioAskPrefsTip")}
                      checked={radioAskPrefs}
                      onChange={(v) => void useAppStore.getState().setRadioAskPrefs(v)}
                      disabled={radioMode === "full"}
                    />
                      </div>
                    </CollapsibleSection>
                    <CollapsibleSection id="announceGroupWhat" title={t("config.announceGroupWhat")} desc={t("config.announceGroupWhatDesc")}>
                      <div className="space-y-2">
<ToggleRow
                    icon={<Trophy className="h-4 w-4" />}
                    label={t("config.classPositions")}
                    desc={t("config.classPositionsDesc")}
                    tip={t("config.classPositionsTip")}
                    checked={classPositions}
                    onChange={(v) => void useAppStore.getState().setClassPositions(v)}
                  />
<div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                      <div className="flex items-start gap-2 min-w-0">
                        <Tip content={t("config.voiceLapPrecisionTip")} side="right">
                          <span className="text-primary cursor-help mt-0.5 shrink-0">
                            <Timer className="h-4 w-4" />
                          </span>
                        </Tip>
                        <div className="min-w-0">
                          <div className="text-sm font-medium leading-tight">
                            {t("config.voiceLapPrecision")}
                          </div>
                          <div className="text-xs text-muted-foreground/80 mt-0.5">
                            {t("config.voiceLapPrecisionDesc")}
                          </div>
                        </div>
                      </div>
                      <div className="flex rounded-md border border-input overflow-hidden shrink-0">
                        {(["tenth", "ms"] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => void useAppStore.getState().setVoiceLapPrecision(m)}
                            className={cn(
                              "px-2.5 py-1 text-xs transition-colors",
                              voiceLapPrecision === m
                                ? "bg-primary text-primary-foreground"
                                : "bg-transparent hover:bg-accent",
                            )}
                          >
                            {t(m === "tenth" ? "config.voiceLapTenth" : "config.voiceLapMs")}
                          </button>
                        ))}
                      </div>
                    </div>
                    <DriverNameRow />
                      </div>
                    </CollapsibleSection>
                    <CollapsibleSection id="announceGroupSpotter" title={t("config.announceGroupSpotter")} desc={t("config.announceGroupSpotterDesc")}>
                      <div className="space-y-2">
<ToggleRow
                      icon={<ArrowLeftRight className="h-4 w-4" />}
                      label={t("config.proximitySpotter")}
                      desc={t("config.proximitySpotterDesc")}
                      tip={t("config.proximitySpotterTip")}
                      checked={proximitySpotter}
                      onChange={(v) => void useAppStore.getState().setProximitySpotter(v)}
                    />
                    {proximitySpotter && <SpotterTuningRows />}
                      </div>
                    </CollapsibleSection>
                    <RadioPresetAndExtras />
                  </div>
                )}
                {/* « Parler à l'ingénieur » : push-to-talk indépendant de l'IA
                    (commandes radio, questions de course, « coach-moi » en local ;
                    l'IA ne reçoit que les questions ouvertes). */}
                {/* Onglet « Parler à l'ingénieur » (fusion ingénieur + spotter) :
                    une seule logique de réponse (`askEngineer`), une liste de
                    commandes commune, des raccourcis directs sans parler. */}
                {voiceTab === "radio" && voiceAnnouncements && (
                  <div className="space-y-2 py-2">
                    {/* 0. Reconnaissance vocale : en tête et ouverte (demande du 19/10) —
                        modèle Vosk de la langue + moteur de la dictée libre (Parakeet). */}
                    <CollapsibleSection id="radioSecStt" title={t("config.radioSecStt")} defaultOpen>
                      <div className="space-y-3">
                      <div className="flex items-center justify-end">
                        <span className={cn("text-mini", sttOk === false ? "text-amber-500" : "text-success")}>
                          {sttOk === null
                            ? "…"
                            : sttOk
                              ? t("config.spotterTalkActive")
                              : t("config.spotterTalkFallback")}
                        </span>
                      </div>
                      <DictationEngine />
                      <VoiceDownloads kind="stt" onInstalled={() => setAssetsVersion((v) => v + 1)} />
                      </div>
                    </CollapsibleSection>

                    {/* 1. Parler */}
                    <CollapsibleSection id="radioSecTalk" title={t("config.radioSecTalk")} defaultOpen>
                      <div className="space-y-2">
                      <p className="text-xs text-muted-foreground/70">{t("config.engineerKeyDesc")}</p>
                      <ShortcutCapture
                        label={t("config.engineerKey")}
                        value={spotterKeyCoach}
                        onChange={(accel) => void useAppStore.getState().setSpotterKey("coach", accel)}
                        onClear={() => void useAppStore.getState().setSpotterKey("coach", "")}
                      />
                      <ShortcutCapture
                        label={t("config.engineerKey2")}
                        value={spotterKeyTalk}
                        onChange={(a) => useAppStore.getState().setSpotterKey("talk", a)}
                        onClear={() => useAppStore.getState().setSpotterKey("talk", "")}
                      />
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-muted-foreground/80">{t("config.spotterPttMode")}</div>
                        <div className="flex rounded-md border border-input overflow-hidden shrink-0">
                          {(["hold", "toggle"] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => useAppStore.getState().setSpotterPttMode(m)}
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
                        {spotterPttMode === "hold" ? t("config.spotterPttHoldDesc") : t("config.spotterPttToggleDesc")}
                      </p>
                      <WheelButtonRow />
                      {isTauri() && <MicDeviceRow />}
                      <ToggleRow
                        icon={<Mic className="h-4 w-4" />}
                        label={t("config.micReady")}
                        desc={t("config.micReadyDesc")}
                        tip={t("config.micReadyTip")}
                        checked={micReady}
                        onChange={(v) => void useAppStore.getState().setMicReady(v)}
                      />
                      <ToggleRow
                        icon={<AudioLines className="h-4 w-4" />}
                        label={t("config.wakeWord")}
                        desc={t("config.wakeWordDesc")}
                        tip={t("config.wakeWordTip")}
                        checked={wakeWordEnabled}
                        onChange={(v) => void useAppStore.getState().setWakeWordEnabled(v)}
                      />
                      {wakeWordEnabled && <WakeWordRow />}
                      <div className="flex items-center justify-between gap-3 py-1">
                        <div className="min-w-0">
                          <div className="text-sm font-medium leading-tight">{t("config.pttRecognition")}</div>
                          <div className="text-xs text-muted-foreground/80 mt-0.5">
                            {pttRecognition === "dual"
                              ? t("config.pttRecognitionDualDesc")
                              : t("config.pttRecognitionStrictDesc")}
                          </div>
                        </div>
                        <div className="flex rounded-md border border-input overflow-hidden shrink-0">
                          {(["dual", "strict"] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => void useAppStore.getState().setPttRecognition(m)}
                              className={cn(
                                "px-2.5 py-1 text-xs transition-colors",
                                pttRecognition === m
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-transparent hover:bg-accent",
                              )}
                            >
                              {t(m === "dual" ? "config.pttRecognitionDual" : "config.pttRecognitionStrict")}
                            </button>
                          ))}
                        </div>
                      </div>
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <div className="min-w-0">
        <div className="text-sm font-medium leading-tight">
          {t("config.pttBeeps")}
        </div>
        <div className="text-xs text-muted-foreground/80 mt-0.5">
          {t("config.pttBeepsDesc")}
        </div>
      </div>
      <Switch
        checked={pttBeeps}
        onCheckedChange={(v) => {
          void useAppStore.getState().setPttBeeps(v);
          if (v) {
            pttBeep("open");
            setTimeout(() => pttBeep("send"), 450);
          }
        }}
        className="shrink-0"
      />
    </div>
                      </div>
                    </CollapsibleSection>

                    {/* 2. Tester (avec / sans IA) */}
                    <CollapsibleSection id="radioSecTest" title={t("config.radioSecTest")}>
                      <div className="space-y-2">
                      <EngineerTester />
                      </div>
                    </CollapsibleSection>

                    {/* 3. Raccourcis sans parler (Statut / Mute / Répète) */}
                    <CollapsibleSection id="radioSecDirect" title={t("config.radioSecDirect")}>
                      <div className="space-y-2">
                      <ToggleRow
                        icon={<Radio className="h-4 w-4" />}
                        label={t("config.directKeys")}
                        desc={voiceAnnouncements ? t("config.directKeysDesc") : t("config.spotterNeedsVoice")}
                        tip={t("config.spotterTip")}
                        checked={spotterEnabled}
                        onChange={(v) => useAppStore.getState().setSpotterEnabled(v)}
                        disabled={!voiceAnnouncements}
                      />
                      {spotterEnabled && voiceAnnouncements && (
                        <div className="space-y-2 pl-6">
                          <p className="text-xs text-muted-foreground/80">{t("config.spotterKeyHint")}</p>
                          <ShortcutCapture
                            label={t("config.spotterKeyStatus")}
                            value={spotterKeyStatus}
                            onChange={(a) => useAppStore.getState().setSpotterKey("status", a)}
                            onClear={() => useAppStore.getState().setSpotterKey("status", "")}
                          />
                          <ShortcutCapture
                            label={t("config.spotterKeyMute")}
                            value={spotterKeyMute}
                            onChange={(a) => useAppStore.getState().setSpotterKey("mute", a)}
                            onClear={() => useAppStore.getState().setSpotterKey("mute", "")}
                          />
                          <ShortcutCapture
                            label={t("config.spotterKeyRepeat")}
                            value={spotterKeyRepeat}
                            onChange={(a) => useAppStore.getState().setSpotterKey("repeat", a)}
                            onClear={() => useAppStore.getState().setSpotterKey("repeat", "")}
                          />
                        </div>
                      )}
                      <WheelActionsRows />
                      <ReviewMarksSetting />
                      </div>
                    </CollapsibleSection>


                    {/* 4. Commandes reconnues (liste commune, modifiable) */}
                    <CollapsibleSection id="radioSecCommands" title={t("config.radioSecCommands")}>
                      <div className="space-y-2">
                      <ToggleRow
                        icon={<Zap className="h-4 w-4" />}
                        label={t("config.localAnswers")}
                        desc={t("config.localAnswersDesc")}
                        tip={t("config.localAnswersTip")}
                        checked={localAnswers}
                        onChange={(v) => void useAppStore.getState().setLocalAnswers(v)}
                      />
                      <ToggleRow
                        icon={<Radio className="h-4 w-4" />}
                        label={t("config.aiVoiceRadioPrompt")}
                        desc={t("config.aiVoiceRadioPromptDesc")}
                        tip={t("config.aiVoiceRadioPromptTip")}
                        checked={aiVoiceRadioPrompt}
                        onChange={(v) => void useAppStore.getState().setAiVoiceRadioPrompt(v)}
                      />
                      <ToggleRow
                        icon={<ShieldAlert className="h-4 w-4" />}
                        label={t("config.aiVoiceGuard")}
                        desc={t("config.aiVoiceGuardDesc")}
                        tip={t("config.aiVoiceGuardTip")}
                        checked={aiVoiceGuard}
                        onChange={(v) => void useAppStore.getState().setAiVoiceGuard(v)}
                      />
                      <ToggleRow
                        icon={<Mic className="h-4 w-4" />}
                        label={t("config.sttConfirmUnsure")}
                        desc={t("config.sttConfirmUnsureDesc")}
                        tip={t("config.sttConfirmUnsureTip")}
                        checked={sttConfirmUnsure}
                        onChange={(v) => void useAppStore.getState().setSttConfirmUnsure(v)}
                      />
                      <p className="text-xs text-muted-foreground/80">{t("config.radioSecCommandsDesc")}</p>
                      <div className="flex flex-wrap gap-x-1 gap-y-1 cursor-default">
                        {INTENTS.map((intent, idx) => (
                          <span key={intent} className="text-xs text-muted-foreground">
                            {t(`config.spotterCmd${cap(intent)}`).split(" (")[0]}
                            {idx < INTENTS.length - 1 && <span className="text-muted-foreground/40"> · </span>}
                          </span>
                        ))}
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
                    </CollapsibleSection>

                    {/* 5. Calculs utilisés par les réponses */}
                    <CollapsibleSection id="radioSecCalc" title={t("config.radioSecCalc")}>
                      <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground/80">{t("config.pitLoss")}</div>
                          <p className="text-mini text-muted-foreground/60">{t("config.pitLossDesc")}</p>
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={120}
                          step={1}
                          value={pitLossSeconds}
                          onChange={(e) => void useAppStore.getState().setPitLossSeconds(Number(e.target.value))}
                          className="h-8 w-16 shrink-0 rounded-md border border-input bg-transparent px-2 text-sm tabular-nums"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground/80">{t("config.fuelReserve")}</div>
                          <p className="text-mini text-muted-foreground/60">{t("config.fuelReserveDesc")}</p>
                        </div>
                        <input
                          type="number"
                          min={0}
                          max={5}
                          step={0.5}
                          value={fuelReserveLaps}
                          onChange={(e) => void useAppStore.getState().setFuelReserveLaps(Number(e.target.value))}
                          className="h-8 w-16 shrink-0 rounded-md border border-input bg-transparent px-2 text-sm tabular-nums"
                        />
                      </div>
                      </div>
                    </CollapsibleSection>

                  </div>
                )}
                {/* Coach par virage — modes avancés (mêmes réglages que Config V1,
                    gated sur les annonces vocales). Intertitre pour distinguer ce
                    coach déterministe du Coach IA (onglet dédié, LLM). */}
                {voiceTab === "coach" && voiceAnnouncements && (
                  <div className="space-y-2">
                    <div className="pt-2">
                      <div className="text-sm font-semibold">
                        {t("config.coachSectionTitle")}
                      </div>
                      <p className="mt-0.5 mb-1 text-xs text-muted-foreground/80">
                        {t("config.coachSectionDesc")}
                      </p>
                    </div>
                    <CollapsibleSection id="coachGroupDrive" title={t("config.coachGroupDrive")} desc={t("config.coachGroupDriveDesc")} defaultOpen>
                      <div className="space-y-2">
                    <ToggleRow
                      icon={<Scale className="h-4 w-4" />}
                      label={t("config.coachRigor")}
                      desc={t("config.coachRigorDesc")}
                      tip={t("config.coachRigorTip")}
                      checked={coachRigor}
                      onChange={(v) => void useAppStore.getState().setCoachRigor(v)}
                    />
                    <ToggleRow
                      icon={<Target className="h-4 w-4" />}
                      label={t("config.coachDrill")}
                      desc={t("config.coachDrillDesc")}
                      tip={t("config.coachDrillTip")}
                      checked={coachDrill}
                      onChange={(v) => void useAppStore.getState().setCoachDrill(v)}
                    />
                    <ToggleRow
                      icon={<Fuel className="h-4 w-4" />}
                      label={t("config.coachStint")}
                      desc={t("config.coachStintDesc")}
                      tip={t("config.coachStintTip")}
                      checked={coachStint}
                      onChange={(v) => void useAppStore.getState().setCoachStint(v)}
                    />
                    <ToggleRow
                      icon={<ShieldAlert className="h-4 w-4" />}
                      label={t("config.coachRisk")}
                      desc={t("config.coachRiskDesc")}
                      tip={t("config.coachRiskTip")}
                      checked={coachRisk}
                      onChange={(v) => void useAppStore.getState().setCoachRisk(v)}
                    />
                      </div>
                    </CollapsibleSection>
                    <CollapsibleSection id="coachGroupPhrases" title={t("config.coachGroupPhrases")} desc={t("config.coachGroupPhrasesDesc")}>
                      <div className="space-y-2">
                    <ToggleRow
                      icon={<MessagesSquare className="h-4 w-4" />}
                      label={t("config.coachPhrasebank")}
                      desc={t("config.coachPhrasebankDesc")}
                      tip={t("config.coachPhrasebankTip")}
                      checked={coachPhrasebank}
                      onChange={(v) =>
                        void useAppStore.getState().setCoachPhrasebank(v)
                      }
                    />
                    {coachPhrasebank && (
                      <div className="ml-2 flex flex-wrap items-center gap-2 border-l border-primary/10 pl-3 py-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pbBusy}
                          onClick={async () => {
                            setPbBusy(true);
                            try {
                              const r = await applyOrGeneratePhrasebank(
                                i18n.language,
                                { force: true },
                              );
                              if (r === "generated")
                                toastSuccess(t("config.phrasebankGenOk"));
                              else if (r === "no-combo")
                                toast(t("config.phrasebankNoCombo"));
                              else toastError(t("config.phrasebankGenErr"));
                            } finally {
                              setPbBusy(false);
                            }
                          }}
                        >
                          {pbBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          {t("config.phrasebankGenerate")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pbBusy}
                          onClick={async () => {
                            await clearPhrasebankForCurrentCombo();
                            toast(t("config.phrasebankCleared"));
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t("config.phrasebankClear")}
                        </Button>
                      </div>
                    )}
                      </div>
                    </CollapsibleSection>
                    <CollapsibleSection id="coachGroupTools" title={t("config.coachGroupTools")} desc={t("config.coachGroupToolsDesc")}>
                      <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <Tip content={t("config.coachGhostTip")} side="right">
                          <span className="mt-0.5 shrink-0 cursor-help text-primary">
                            <Upload className="h-4 w-4" />
                          </span>
                        </Tip>
                        <div className="min-w-0">
                          <div className="text-sm font-medium leading-tight">
                            {t("config.coachGhost")}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground/80">
                            {t("config.coachGhostDesc")}
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={ghostBusy}
                        onClick={async () => {
                          const combo = coachComboInfo();
                          if (!combo.track || !combo.carModel) {
                            toast(t("config.ghostNoCombo"));
                            return;
                          }
                          const { open } = await import(
                            "@tauri-apps/plugin-dialog"
                          );
                          const sel = await open({
                            multiple: false,
                            filters: [
                              { name: "Ghost lap", extensions: ["duckdb", "ld"] },
                            ],
                          });
                          if (!sel || typeof sel !== "string") return;
                          setGhostBusy(true);
                          try {
                            const r = await importGhost(sel, {
                              track: combo.track,
                              carModel: combo.carModel,
                              carClass: combo.carClass,
                            });
                            toastSuccess(
                              t("config.ghostImportOk", {
                                corners: r.corners,
                                time: r.lapTime.toFixed(1),
                              }),
                            );
                          } catch {
                            toastError(t("config.ghostImportErr"));
                          } finally {
                            setGhostBusy(false);
                          }
                        }}
                      >
                        {ghostBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload className="h-3.5 w-3.5" />
                        )}
                        {t("config.ghostImport")}
                      </Button>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <Tip content={t("config.coachRecordTip")} side="right">
                          <span className="mt-0.5 shrink-0 cursor-help text-primary">
                            <Disc className="h-4 w-4" />
                          </span>
                        </Tip>
                        <div className="min-w-0">
                          <div className="text-sm font-medium leading-tight">
                            {t("config.coachRecord")}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground/80">
                            {recBusy
                              ? t("config.coachRecordRunning", { n: recFrames })
                              : t("config.coachRecordDesc")}
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={recBusy ? "destructive" : "outline"}
                        onClick={async () => {
                          if (recBusy) {
                            const combo = coachComboInfo();
                            const label =
                              `${combo.track || "session"}-${combo.carModel || ""}`.trim();
                            try {
                              const path = await stopCorpusRecording(label);
                              setRecBusy(false);
                              setRecFrames(0);
                              if (path) toastSuccess(t("config.coachRecordSaved", { path }));
                              else toast(t("config.coachRecordEmpty"));
                            } catch (e) {
                              setRecBusy(false);
                              setRecFrames(0);
                              toastError(String(e));
                            }
                            return;
                          }
                          await startCorpusRecording();
                          setRecBusy(true);
                        }}
                      >
                        {recBusy ? (
                          <Square className="h-3.5 w-3.5" />
                        ) : (
                          <Disc className="h-3.5 w-3.5" />
                        )}
                        {recBusy
                          ? t("config.coachRecordStop")
                          : t("config.coachRecordStart")}
                      </Button>
                    </div>
                      </div>
                    </CollapsibleSection>
                  </div>
                )}
              </div>
            )}

            {/* ── Coach IA ── */}
            {cat === "coach" && (
              <div>
                <div className="mb-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setAiHelpOpen(true)}
                    aria-label={t("config.aiHelpAria")}
                    title={t("config.aiHelpTitle")}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                    {t("config.aiHelpTitle")}
                  </button>
                </div>
                <ToggleRow
                  icon={<Brain className="h-4 w-4" />}
                  label={t("config.aiCoachEnable")}
                  desc={t("config.aiCoachEnableDesc")}
                  tip={t("config.aiCoachDesc")}
                  checked={aiCoachEnabled}
                  onChange={(v) => void useAppStore.getState().setAICoachEnabled(v)}
                />
                {aiCoachEnabled && (
                  <>
                    <Separator />
                    {/* Cartes des fournisseurs configurés (clé par carte), façon harness. */}
                    <AiProvidersPanel />

                    <Separator />
                    <SettingRow icon={<Globe className="h-4 w-4" />} label={t("config.aiProviderActive")} tip={t("config.aiProviderTip")}>
                      <Select
                        value={noAiProvider ? "" : aiProvider}
                        onValueChange={(v) => void useAppStore.getState().setAIProvider(v)}
                        ariaLabel={t("config.aiProviderActive")}
                        placeholder={t("config.aiNoProvider")}
                        className="h-8 max-w-[200px] px-2.5"
                        // Seuls les fournisseurs CONFIGURÉS sont sélectionnables. La
                        // valeur active hors liste (état hérité) reste affichée.
                        options={[
                          ...(aiProvider &&
                          !noAiProvider &&
                          !aiProviderList.includes(aiProvider) &&
                          !aiCustomProviders.some((d) => d.id === aiProvider)
                            ? [
                                {
                                  value: aiProvider,
                                  label: getProvider(aiProvider)?.name ?? aiProvider,
                                },
                              ]
                            : []),
                          ...aiProviderList.map((id) => ({
                            value: id,
                            label: getProvider(id)?.name ?? id,
                          })),
                          ...aiCustomProviders.map((d) => ({
                            value: d.id,
                            label: d.name || d.baseUrl,
                          })),
                        ]}
                      />
                    </SettingRow>

                    {noAiProvider && (
                      <>
                        <Separator />
                        <p className="py-2 text-xs text-muted-foreground">{t("config.aiNoProviderHint")}</p>
                      </>
                    )}
                    {!noAiProvider && (
                    <>
                    <Separator />
                    <SettingRow icon={<Cpu className="h-4 w-4" />} label={t("config.aiModel")} tip={t("config.aiModelTip")}>
                      <AiModelPicker
                        provider={getProvider(aiProvider)}
                        models={aiModels}
                        loading={aiModelsLoading}
                        value={aiModel}
                        onChange={(v) => void useAppStore.getState().setAIModel(v)}
                        onRefresh={() => void refreshAiModels()}
                      />
                    </SettingRow>

                    <VoiceCoachConfig />
                    </>
                    )}

                    <Separator />
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
                          <p className="text-xs text-muted-foreground/70">
                            {t("config.aiPromptNote")}
                          </p>
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
                              onClick={() =>
                                setPromptDraft(systemPrompt(i18n.language))
                              }
                            >
                              {t("config.aiPromptDefault")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!aiPromptCur && !promptDraft}
                              onClick={() => {
                                setPromptDraft("");
                                void useAppStore
                                  .getState()
                                  .setAISystemPrompt(i18n.language, "");
                              }}
                            >
                              {t("config.aiPromptReset")}
                            </Button>
                            <Button
                              size="sm"
                              disabled={promptDraft === aiPromptCur}
                              onClick={() =>
                                void useAppStore
                                  .getState()
                                  .setAISystemPrompt(i18n.language, promptDraft)
                              }
                            >
                              {t("config.aiPromptSave")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                    <Separator />
                    <div className="py-2 space-y-1.5">
                      <p className="text-xs text-muted-foreground/70">
                        {t("config.aiVoiceKeyMoved")}
                      </p>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-end gap-2 py-2">
                      {aiTestResult && (
                        <span
                          className={cn(
                            "text-xs truncate max-w-[180px]",
                            aiTestResult.ok
                              ? "text-emerald-500"
                              : "text-destructive",
                          )}
                          title={
                            aiTestResult.ok
                              ? t("config.aiTestOk")
                              : aiTestResult.error
                          }
                        >
                          {aiTestResult.ok
                            ? t("config.aiTestOk")
                            : aiTestResult.error}
                        </span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => void handleTestAi()}
                        disabled={aiTesting || !aiModel || (aiNeedsKey && !aiActiveKey)}
                      >
                        {aiTesting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Zap className="h-3.5 w-3.5" />
                        )}
                        {t("config.aiTestConnection")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => void handleTestAiFun()}
                        disabled={aiFunTesting || !aiModel || (aiNeedsKey && !aiActiveKey)}
                      >
                        {aiFunTesting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        {t("config.aiTestFun")}
                      </Button>
                    </div>
                    {aiFunResult && (
                      <div
                        className={cn(
                          "mb-2 rounded-md border px-3 py-2 text-sm leading-snug",
                          aiFunResult.text
                            ? "border-primary/30 bg-primary/5"
                            : "border-destructive/40 text-destructive",
                        )}
                      >
                        {aiFunResult.text ?? aiFunResult.error}
                      </div>
                    )}
                    <Separator />
                    <p className="text-xs text-muted-foreground/70 py-2">
                      {t("config.aiKeyNote")}
                    </p>
                  </>
                )}
              </div>
            )}

            {/* ── Maintenance (+ version / mises à jour) ── */}
            {cat === "maintenance" && (
              <div className="space-y-1">
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
                  icon={<Radio className="h-4 w-4" />}
                  label={t("config.restPollOffTrack")}
                  desc={t("config.restPollOffTrackDesc")}
                  tip={t("config.restPollOffTrackTip")}
                  checked={restPollOffTrack}
                  onChange={(v) => useAppStore.getState().setRestPollOffTrack(v)}
                />
                <Separator />
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
                  badge={
                    emptyGlobal != null && emptyGlobal > 0
                      ? String(emptyGlobal)
                      : undefined
                  }
                  onClick={() => handlePurge("global")}
                  disabled={indexing}
                />
                <ActionRow
                  icon={<Eraser className="h-4 w-4" />}
                  label={t("config.purgeEmptyPlayer")}
                  tip={t("config.purgeEmptyPlayerTip")}
                  badge={
                    emptyPlayer != null && emptyPlayer > 0
                      ? String(emptyPlayer)
                      : undefined
                  }
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
                      <span>
                        {t("config.filesUpdated", { count: indexReport.updated })}
                      </span>
                      <span>
                        {t("config.filesRemoved", { count: indexReport.removed })}
                      </span>
                    </div>
                    <div className="pl-[22px]">
                      {t("config.sessionsCreated", {
                        count: indexReport.sessions_created,
                      })}
                    </div>
                    {indexReport.errors.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-destructive">
                          {t("config.errors", { count: indexReport.errors.length })}
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

                <Separator />
                <div className="flex items-center justify-between px-2.5 py-2 rounded-md bg-muted/40">
                  <span className="text-xs text-muted-foreground">
                    {t("config.version")}
                  </span>
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
                          emit("tray-check-update"),
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
                  {updateStatus === "checking" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
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
                <Separator />
                <CollapsibleSection id="diagTitle" title={t("config.diagTitle")} desc={t("config.diagDesc")}>
                  <DiagnosticsRows />
                </CollapsibleSection>
                {/* Outils réservés au développement (banc de rejeu de l'ingénieur) : repliés. */}
                <CollapsibleSection id="devTools" title={t("config.devTools")} desc={t("config.devToolsDesc")}>
                  <ReplayBenchPanel />
                </CollapsibleSection>
              </div>
            )}

            {/* ── Atelier (outils de setup et d'analyse, opt-in) ── */}
            {cat === "lab" && <LabSettings />}

            {/* ── Communauté (partage des meilleurs tours, opt-in) ── */}
            {cat === "community" && <CommunitySettings />}

            {/* ── Régie tablette (lecture seule, opt-in) ── */}
            {cat === "regie" && <RegieSettings />}

            {/* ── Outils & diagnostic (lanceur opt-in, diagnostic en lecture seule) ── */}
            {cat === "tools" && <ToolsSettings />}

            {/* ── Crédits ── */}
            {cat === "credits" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground/80">
                  {t("config.creditsDesc")}
                </p>
                {CREDIT_SOURCES.map((c) => (
                  <CreditRow
                    key={c.name}
                    name={c.name}
                    role={t(`config.${c.roleKey}`)}
                    url={c.url}
                  />
                ))}
                <p className="px-1 pt-1 text-[11px] leading-snug text-muted-foreground/70">
                  {t("config.creditsNote")}
                </p>
              </div>
            )}
            </div>
          </section>
        </div>
      </Card>

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

      {cloudGuideOpen && <CloudVoiceGuide onClose={() => setCloudGuideOpen(false)} />}
      {voiceModalOpen && (
        <VoiceMessagesModal onClose={() => setVoiceModalOpen(false)} />
      )}
      {voiceIntroOpen && (
        <VoiceIntroModal
          onClose={() => setVoiceIntroOpen(false)}
          onInstalled={() => setAssetsVersion((v) => v + 1)}
        />
      )}
      {spotterCmdModalOpen && (
        <SpotterCommandsModal onClose={() => setSpotterCmdModalOpen(false)} />
      )}
      {aiHelpOpen && <AiCoachHelpModal onClose={() => setAiHelpOpen(false)} />}
    </div>
  );
}

/** Ligne de crédit : nom (lien optionnel) + rôle. */
function CreditRow({
  name,
  role,
  url,
}: {
  name: string;
  role: string;
  url?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:text-primary hover:underline"
        >
          {name}
          <ExternalLink className="h-3 w-3 opacity-60" />
        </a>
      ) : (
        <span className="font-medium">{name}</span>
      )}
      <span className="text-right text-xs text-muted-foreground">{role}</span>
    </div>
  );
}

function SettingRow({
  icon,
  label,
  desc,
  tip,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  desc?: string;
  tip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {tip ? (
          <Tip content={tip} side="right">
            <span className="mt-0.5 shrink-0 cursor-help text-primary">{icon}</span>
          </Tip>
        ) : (
          <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
        )}
        <div className="min-w-0 space-y-0.5">
          <div className="text-sm font-medium">{label}</div>
          {desc && <div className="text-xs text-muted-foreground">{desc}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

/** Capture d'un raccourci clavier → chaîne d'accélérateur Tauri (ex. "Alt+S"). */
function ShortcutCapture({
  label,
  value,
  onChange,
  onClear,
}: {
  label: string;
  value: string;
  onChange: (accel: string) => void;
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
    if (["Control", "Alt", "Shift", "Meta"].includes(key)) return;
    const mods: string[] = [];
    if (e.ctrlKey) mods.push("Control");
    if (e.altKey) mods.push("Alt");
    if (e.shiftKey) mods.push("Shift");
    if (e.metaKey) mods.push("Super");
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

/** Sections repliées / ouvertes par l'utilisateur, retenues sur ce PC (clé = `id`). */
const SECTION_OPEN_KEY = "lmu-config-sections";
function readSectionsOpen(): Record<string, boolean> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SECTION_OPEN_KEY) ?? "{}");
    return v && typeof v === "object" ? (v as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** Bloc à titre repliable (ex. « Modules du menu »). Avec un `id`, l'état choisi
 *  (ouvert / replié) est retenu d'une visite à l'autre ; `defaultOpen` sert tant que
 *  l'utilisateur n'a rien choisi. `action` : bouton placé à droite du titre. */
function CollapsibleSection({
  id,
  title,
  desc,
  action,
  defaultOpen = false,
  children,
}: {
  id?: string;
  title: string;
  desc?: string;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(() => {
    const saved = id ? readSectionsOpen()[id] : undefined;
    return typeof saved === "boolean" ? saved : defaultOpen;
  });
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!id) return;
    try {
      localStorage.setItem(SECTION_OPEN_KEY, JSON.stringify({ ...readSectionsOpen(), [id]: next }));
    } catch {
      /* stockage indisponible : l'état vaut pour cette visite */
    }
  };
  return (
    <div className="rounded-md border border-border">
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-primary transition-transform", !open && "-rotate-90")} />
          <div className="min-w-0">
            <div className="font-semibold">{title}</div>
            {desc && <div className="text-xs text-muted-foreground">{desc}</div>}
          </div>
        </button>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function Disclosure({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ml-7 mb-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-orange-500 hover:bg-orange-500/10 hover:text-orange-400"
      >
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")}
        />
        {title}
      </button>
      {open && (
        <div className="space-y-2.5 px-2 pb-2 pt-1">{children}</div>
      )}
    </div>
  );
}

/**
 * Bouton de volant du push-to-talk : « Capter » attend l'appui (10 s) sur
 * n'importe quel volant / boîtier, lu en arrière-plan (le jeu garde le focus).
 */
function WheelButtonRow() {
  const { t } = useTranslation();
  const binding = useAppStore((s) => s.pttWheel);
  const [capturing, setCapturing] = useState(false);
  const [failed, setFailed] = useState(false);
  const capture = async () => {
    setCapturing(true);
    setFailed(false);
    try {
      const b = await invoke<WheelBinding | null>("wheel_capture", { timeoutMs: 10000 });
      if (b) await useAppStore.getState().setPttWheel(b);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setCapturing(false);
    }
  };
  return (
    <div className="flex items-center justify-between py-2 gap-3">
      <div className="flex items-start gap-2 min-w-0">
        <Tip content={t("config.wheelButtonTip")} side="right">
          <span className="text-muted-foreground cursor-help mt-0.5 shrink-0">
            <Gamepad2 className="h-4 w-4" />
          </span>
        </Tip>
        <div className="min-w-0">
          <div className="text-sm font-medium leading-tight">{t("config.wheelButton")}</div>
          <div className="text-xs text-muted-foreground/80 mt-0.5 truncate">
            {capturing
              ? t("config.wheelButtonWaiting")
              : failed
                ? t("config.wheelButtonNone")
                : binding?.label || t("config.wheelButtonUnset")}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button size="sm" variant="outline" disabled={capturing} onClick={() => void capture()}>
          {capturing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("config.wheelButtonCapture")}
        </Button>
        {binding && !capturing && (
          <Button
            size="sm"
            variant="ghost"
            title={t("config.wheelButtonClear")}
            onClick={() => void useAppStore.getState().setPttWheel(null)}
          >
            <Eraser className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Micro proposé par le moteur d'écoute (nom Windows). */
interface MicDeviceInfo {
  name: string;
  is_default: boolean;
}

/**
 * Micro de l'ingénieur (écoute continue, push-to-talk, dictée) : « Micro par
 * défaut de Windows » en premier (= comportement historique), puis les entrées
 * vues par Windows. Un micro choisi mais débranché reste affiché (repli sur le
 * défaut tant qu'il manque). Vumètre en dessous.
 */
function MicDeviceRow() {
  const { t } = useTranslation();
  const saved = useAppStore((s) => s.micDevice);
  const [devices, setDevices] = useState<MicDeviceInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setDevices(await invoke<MicDeviceInfo[]>("voice_input_devices"));
    } catch {
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const list = devices ?? [];
  const options = [
    { value: "", label: t("config.micDeviceDefault") },
    ...list.map((d) => ({
      value: d.name,
      label: d.is_default ? `${d.name} · ${t("config.micDeviceIsDefault")}` : d.name,
    })),
    ...(saved && devices && !list.some((d) => d.name === saved)
      ? [{ value: saved, label: t("config.micDeviceAbsent", { name: saved }) }]
      : []),
  ];
  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Tip content={t("config.micDeviceTip")} side="right">
            <span className="text-muted-foreground cursor-help mt-0.5 shrink-0">
              <Mic className="h-4 w-4" />
            </span>
          </Tip>
          <div className="min-w-0">
            <div className="text-sm font-medium leading-tight">{t("config.micDevice")}</div>
            <div className="text-xs text-muted-foreground/80 mt-0.5">{t("config.micDeviceDesc")}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Select
            value={saved}
            onValueChange={(v) => void useAppStore.getState().setMicDevice(v)}
            ariaLabel={t("config.micDevice")}
            className="h-8 w-56 px-2.5"
            options={options}
          />
          <Tip content={t("config.micDeviceRefresh")}>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label={t("config.micDeviceRefresh")}
              onClick={() => void refresh()}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
          </Tip>
        </div>
      </div>
      <MicLevelMeter />
    </div>
  );
}

/**
 * Vumètre du micro qui écoute (moteur natif) et son nom. Le moteur ne tourne
 * qu'avec « Micro prêt » ou le mot déclencheur : sinon, une ligne d'aide.
 */
function MicLevelMeter() {
  const { t } = useTranslation();
  const [st, setSt] = useState<{ device: string; fallback: boolean; level: number } | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const tick = () => {
      invoke<{ device: string; fallback: boolean; level: number } | null>("voice_input_status")
        .then((s) => alive && setSt(s))
        .catch(() => alive && setSt(null));
    };
    tick();
    const id = window.setInterval(tick, 120);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  if (st === undefined) return null;
  if (st === null) {
    return <p className="text-mini text-muted-foreground/60 pl-6 mt-1">{t("config.micLevelOff")}</p>;
  }
  // Racine carrée : la voix normale remplit la moitié de la barre, pas un dixième.
  const pct = Math.min(100, Math.round(Math.sqrt(st.level) * 100));
  const label = !st.device
    ? t("config.micDeviceNone")
    : st.fallback
      ? t("config.micInUseFallback", { name: st.device })
      : t("config.micInUse", { name: st.device });
  return (
    <div className="flex items-center gap-2 pl-6 mt-1.5">
      <div
        className="h-1.5 w-40 shrink-0 rounded-full bg-muted overflow-hidden"
        role="meter"
        aria-label={t("config.micLevel")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-100", pct >= 95 ? "bg-destructive" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn("text-mini truncate", st.fallback || !st.device ? "text-amber-500" : "text-muted-foreground/70")}>
        {label}
      </span>
    </div>
  );
}

/** Mot déclencheur (bêta) : vide = mot par défaut de la langue. */
function WakeWordRow() {
  const { t } = useTranslation();
  const saved = useAppStore((s) => s.wakeWord);
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const commit = () => {
    if (draft.trim() !== saved) void useAppStore.getState().setWakeWord(draft);
  };
  return (
    <div className="flex items-center justify-between py-1 pl-6 gap-3">
      <div className="text-xs text-muted-foreground/80">{t("config.wakeWordPhrase")}</div>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        placeholder={t("live.wakeWordDefault")}
        maxLength={30}
        className="h-8 w-36 text-sm shrink-0"
      />
    </div>
  );
}

/**
 * Prénom dit à la radio (avec parcimonie : départ, dernier tour, prise de tête,
 * record). Vide = jamais. Enregistré à la sortie du champ.
 */
function DriverNameRow() {
  const { t, i18n } = useTranslation();
  const saved = useAppStore((s) => s.radioDriverName);
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const commit = () => {
    if (draft.trim() !== saved) void useAppStore.getState().setRadioDriverName(draft);
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <div className="flex items-start gap-2 min-w-0">
        <Tip content={t("config.radioDriverNameTip")} side="right">
          <span className="text-primary cursor-help mt-0.5 shrink-0">
            <User className="h-4 w-4" />
          </span>
        </Tip>
        <div className="min-w-0">
          <div className="text-sm font-medium leading-tight">{t("config.radioDriverName")}</div>
          <div className="text-xs text-muted-foreground/80 mt-0.5">{t("config.radioDriverNameDesc")}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          placeholder={t("config.radioDriverNamePlaceholder")}
          maxLength={40}
          className="h-8 w-36 text-sm"
        />
        {/* Écoute : le prénom tel que l'ingénieur le dit (« Cris, … »), avec la voix
            des annonces d'information (voix IA en ligne si elle est active). */}
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={!draft.trim()}
          onClick={() => {
            commit();
            announceAnswer(t("config.radioDriverNameTestPhrase", { name: draft.trim() }), i18n.language);
          }}
        >
          {t("config.voiceTest")}
        </Button>
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
  desc?: string;
  tip?: string;
  checked: boolean;
  onChange: (b: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-md border border-border p-3",
        disabled && "opacity-50",
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <Tip content={tip ?? ""} side="right">
          <span className="mt-0.5 shrink-0 cursor-help text-primary">
            {icon}
          </span>
        </Tip>
        <div className="min-w-0 space-y-0.5">
          <div className="text-sm font-medium leading-tight">{label}</div>
          {desc && (
            <div className="text-xs text-muted-foreground">{desc}</div>
          )}
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
        "flex items-center gap-2 w-full px-2.5 py-2 rounded-md border text-sm transition-colors",
        destructive
          ? "border-destructive/30 text-destructive hover:bg-destructive/10"
          : "border-border bg-muted/30 text-foreground hover:bg-muted/70",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <span
        className={cn(destructive ? "text-destructive/70" : "text-muted-foreground")}
      >
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
      <TooltipContent side="right" className="max-w-xs">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}
