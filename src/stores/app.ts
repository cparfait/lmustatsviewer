/**
 * Store applicatif V3 (mono-profil).
 *
 * Remplace l'ancien `useProfileStore` multi-profils de la V2. La V3 ne gère
 * qu'un seul joueur : la configuration (chemin du jeu, nom du joueur) est
 * stockée en base via les commandes `config`. Aucune donnée mockée.
 */

import { create } from "zustand";
import { config, indexer, queries, ai, system } from "@/lib/api";
import { setAppTimezone } from "@/lib/utils";
import { preloadStaticData } from "@/lib/staticData";
import { configureVoice } from "@/lib/voice";
import { initVoiceOverrides } from "@/lib/voiceMessages";
import { initCommandOverrides } from "@/lib/spotterCommands";
import { setRadioEnabled } from "@/lib/radioFx";
import { resetRecordsDigestCache } from "@/lib/ai/context/records-context";
import type {
  BestLapRow,
  DashboardStats,
  FilterOptions,
  IndexReport,
} from "@/lib/api";

/**
 * Version de la logique d'indexation. À **incrémenter** dès que le parser ou
 * l'indexeur change de comportement : au démarrage, si la base a été indexée
 * avec une version antérieure, une réindexation complète est forcée.
 */
const INDEX_LOGIC_VERSION = "2";

/** Horodatage de la dernière sync silencieuse (anti-rebond du focus fenêtre). */
let _lastQuietSync = 0;

interface AppState {
  // Cycle de vie
  configLoaded: boolean;
  /** true quand le dossier de résultats est configuré (= onboarding fait). */
  isConfigured: boolean;

  // Configuration
  playerName: string;
  lmuPath: string;
  resultsDir: string;
  telemetryDir: string;

  // Préférences applicatives (persistées en config)
  timezone: string;
  autoIndex: boolean;
  systemTray: boolean;
  autoUpdate: boolean;
  /** Afficher les tiers ohne_speed dans Sessions, SessionDetail et LapChartModal. */
  showOhneSpeed: boolean;
  /** Rythme cible de l'overlay live (clé tier ohne_speed : alien/competitive/good/midpack). */
  overlayTargetTier: string;
  /** Modules du menu activés (clé nav → bool). Absent/true = visible. */
  menuModules: Record<string, boolean>;
  /** Annonces vocales sur la page Live (off par défaut — doublon avec CrewChief). */
  voiceAnnouncements: boolean;
  /** voiceURI de la voix système choisie par langue ("" / absent = auto). */
  voiceUriByLang: Record<string, string>;
  /** id du modèle Piper choisi par langue ("" / absent = défaut de la langue). */
  piperVoiceByLang: Record<string, string>;
  /** Locuteur Piper choisi par langue (modèles multi-locuteur type MLS). Défaut 0. */
  piperSpeakerByLang: Record<string, number>;
  /** Vitesse de parole des annonces (0.5–2, défaut 1.05). */
  voiceRate: number;
  /** Volume des annonces (0–1, défaut 0.8) — pour l'équilibrer avec le jeu. */
  voiceVolume: number;
  /** Effet radio/talkie (bips + souffle) autour des annonces (défaut on). */
  voiceRadio: boolean;
  /** Moteur de synthèse : "piper" (neuronal embarqué) ou "system" (voix OS). */
  voiceEngine: "piper" | "system";
  /** Spotter à la demande (raccourcis globaux Statut/Mute/Répète). Défaut off. */
  spotterEnabled: boolean;
  /** Accélérateur global « Statut » (format Tauri, ex. "Alt+S"). */
  spotterKeyStatus: string;
  /** Accélérateur global « Mute » (coupe/réactive les annonces). */
  spotterKeyMute: string;
  /** Accélérateur global « Répète » (rejoue la dernière annonce). */
  spotterKeyRepeat: string;
  /** Accélérateur push-to-talk « Parler » (Couche 2 : reconnaissance par commandes). */
  spotterKeyTalk: string;
  /** Accélérateur push-to-talk « Parler au Coach IA » (dictée libre → réponse LLM parlée). */
  spotterKeyCoach: string;
  /** Accélérateur global « Afficher/Masquer les overlays » ("" = désactivé). */
  overlayToggleKey: string;
  /** Mode du « Parler » : maintenir la touche (`hold`) ou appui/re-appui (`toggle`). */
  spotterPttMode: "hold" | "toggle";

  // AI Coach
  /** Coach IA activé : si false, le coach disparaît de toutes les pages. */
  aiCoachEnabled: boolean;
  /** Fournisseur d'IA : id d'un provider de `lib/ai/providers` (openai, anthropic, google, deepseek, mistral, ollama). */
  aiProvider: string;
  /** Clé API du fournisseur (vide pour Ollama). Persistée chiffrée côté backend (`ai_set_key`). */
  aiApiKey: string;
  /** id du modèle sélectionné (analyse / panneau). */
  aiModel: string;
  /** id du modèle dédié au coach VOCAL (rapide). Vide = même que `aiModel`. */
  aiVoiceModel: string;
  /** Fournisseur DISTINCT pour le coach vocal. Vide = même que `aiProvider`. */
  aiVoiceProvider: string;
  /** Clé API du fournisseur vocal (si distinct). Persistée chiffrée (`ai_set_voice_key`). */
  aiVoiceApiKey: string;
  /** Prompt système personnalisé par langue (code 2 lettres → texte ; absent = défaut). */
  aiSystemPromptByLang: Record<string, string>;

  // Données Dashboard
  dashboardStats: DashboardStats | null;
  bestLaps: BestLapRow[];
  filterOptions: FilterOptions | null;
  gameVersions: string[];

  // Filtre de version actif (Header + pages)
  selectedVersion: string | null;
  showOutdated: boolean;

  // Indexation
  indexing: boolean;
  indexReport: IndexReport | null;

  loading: boolean;

  // Actions
  init: () => Promise<void>;
  runSetup: (
    lmuPath: string,
    playerName: string,
    resultsDir?: string,
    telemetryDir?: string,
  ) => Promise<IndexReport>;
  syncIndex: () => Promise<void>;
  /** Sync delta silencieuse (focus fenêtre) : sans spinner, anti-rebond. */
  syncQuiet: () => Promise<void>;
  reindexAll: () => Promise<void>;
  clearCache: () => Promise<void>;
  purgeEmptySessions: (purgeType?: "global" | "player") => Promise<number>;
  loadDashboard: () => Promise<void>;
  setSelectedVersion: (v: string | null) => void;
  setShowOutdated: (v: boolean) => void;
  setTimezone: (tz: string) => Promise<void>;
  setAutoIndex: (v: boolean) => Promise<void>;
  setSystemTray: (v: boolean) => Promise<void>;
  setAutoUpdate: (v: boolean) => Promise<void>;
  setShowOhneSpeed: (v: boolean) => Promise<void>;
  setOverlayTargetTier: (v: string) => Promise<void>;
  setMenuModule: (key: string, value: boolean) => Promise<void>;
  setVoiceAnnouncements: (v: boolean) => Promise<void>;
  setVoiceUri: (lang: string, v: string) => Promise<void>;
  setPiperVoice: (lang: string, id: string) => Promise<void>;
  setPiperSpeaker: (lang: string, speaker: number) => Promise<void>;
  setVoiceRate: (v: number) => Promise<void>;
  setVoiceVolume: (v: number) => Promise<void>;
  setVoiceRadio: (v: boolean) => Promise<void>;
  setVoiceEngine: (v: "piper" | "system") => Promise<void>;
  setSpotterEnabled: (v: boolean) => Promise<void>;
  setSpotterKey: (
    action: "status" | "mute" | "repeat" | "talk" | "coach",
    accel: string,
  ) => Promise<void>;
  setSpotterPttMode: (mode: "hold" | "toggle") => Promise<void>;
  setOverlayToggleKey: (accel: string) => Promise<void>;
  setAICoachEnabled: (v: boolean) => Promise<void>;
  setAIProvider: (v: string) => Promise<void>;
  setAIApiKey: (v: string) => Promise<void>;
  setAIModel: (v: string) => Promise<void>;
  setAIVoiceModel: (v: string) => Promise<void>;
  setAIVoiceProvider: (v: string) => Promise<void>;
  setAIVoiceApiKey: (v: string) => Promise<void>;
  setAISystemPrompt: (lang: string, v: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  configLoaded: false,
  isConfigured: false,
  playerName: "",
  lmuPath: "",
  resultsDir: "",
  telemetryDir: "",
  timezone: "",
  autoIndex: true,
  systemTray: true,
  autoUpdate: true,
  showOhneSpeed: true,
  overlayTargetTier: "competitive",
  menuModules: {},
  voiceAnnouncements: false,
  voiceUriByLang: {},
  piperVoiceByLang: {},
  piperSpeakerByLang: {},
  voiceRate: 1.05,
  voiceVolume: 0.3,
  voiceRadio: true,
  voiceEngine: "piper",
  spotterEnabled: false,
  spotterKeyStatus: "Alt+S",
  spotterKeyMute: "Alt+M",
  spotterKeyRepeat: "Alt+R",
  spotterKeyTalk: "Alt+T",
  spotterKeyCoach: "Alt+C",
  spotterPttMode: "hold",
  overlayToggleKey: "",
  aiCoachEnabled: true,
  aiProvider: "google",
  aiApiKey: "",
  aiModel: "",
  aiVoiceModel: "",
  aiVoiceProvider: "",
  aiVoiceApiKey: "",
  aiSystemPromptByLang: {},
  dashboardStats: null,
  bestLaps: [],
  filterOptions: null,
  gameVersions: [],
  selectedVersion: null,
  showOutdated: false,
  indexing: false,
  indexReport: null,
  loading: false,

  init: async () => {
   try {
    await preloadStaticData();
    const cfg = await config.getAll();
    const resultsDir = cfg.results_dir ?? "";
    const telemetryDir = cfg.telemetry_dir ?? "";
    const isConfigured = resultsDir.length > 0;
    const timezone = cfg.timezone ?? "";
    const autoIndex = cfg.auto_index !== "false";
    // voice_uri : JSON `{ fr: "uri", en: "uri", … }` (ancien format string ignoré).
    let voiceUriByLang: Record<string, string> = {};
    try {
      const parsed = cfg.voice_uri ? JSON.parse(cfg.voice_uri) : null;
      if (parsed && typeof parsed === "object") voiceUriByLang = parsed;
    } catch {
      /* ancienne valeur (string brute) → on repart d'une map vide */
    }
    let piperVoiceByLang: Record<string, string> = {};
    try {
      const parsed = cfg.piper_voices ? JSON.parse(cfg.piper_voices) : null;
      if (parsed && typeof parsed === "object") piperVoiceByLang = parsed;
    } catch {
      /* JSON corrompu → map vide */
    }
    let piperSpeakerByLang: Record<string, number> = {};
    try {
      const parsed = cfg.piper_speakers ? JSON.parse(cfg.piper_speakers) : null;
      if (parsed && typeof parsed === "object") piperSpeakerByLang = parsed;
    } catch {
      /* JSON corrompu → map vide */
    }
    // Prompt système personnalisé par langue (JSON `{ fr: "...", en: "..." }`).
    let aiSystemPromptByLang: Record<string, string> = {};
    try {
      const parsed = cfg.ai_system_prompt ? JSON.parse(cfg.ai_system_prompt) : null;
      if (parsed && typeof parsed === "object") aiSystemPromptByLang = parsed;
    } catch {
      /* ancienne valeur (string brute) ou JSON corrompu → map vide */
    }
    // Modules du menu (clé nav → bool). Absent/true = visible.
    let menuModules: Record<string, boolean> = {};
    try {
      const parsed = cfg.menu_modules ? JSON.parse(cfg.menu_modules) : null;
      if (parsed && typeof parsed === "object") menuModules = parsed;
    } catch {
      /* JSON corrompu → tous les modules visibles */
    }
    // Voix FR par défaut = Pierre (upmc, locuteur 1) tant que l'utilisateur n'a pas
    // choisi explicitement. Non persisté (reste un défaut) ; repli auto sur `tom`
    // côté backend si `upmc` n'est pas installé.
    if (!piperVoiceByLang.fr) {
      piperVoiceByLang.fr = "fr_FR-upmc-medium";
      if (piperSpeakerByLang.fr === undefined) piperSpeakerByLang.fr = 1;
    }
    const voiceRate = Number(cfg.voice_rate) > 0 ? Number(cfg.voice_rate) : 1.05;
    const voiceVolume =
      cfg.voice_volume != null && Number(cfg.voice_volume) >= 0
        ? Math.min(1, Number(cfg.voice_volume))
        : 0.3;
    const voiceRadio = cfg.voice_radio !== "false";
    const voiceEngine = cfg.voice_engine === "system" ? "system" : "piper";
    // Clé API IA : lue déchiffrée via le backend (migration douce de l'ancien clair).
    const aiApiKey = await ai.getKey().catch(() => "");
    const aiVoiceApiKey = await ai.getVoiceKey().catch(() => "");
    configureVoice({
      voiceByLang: voiceUriByLang,
      piperByLang: piperVoiceByLang,
      speakerByLang: piperSpeakerByLang,
      rate: voiceRate,
      volume: voiceVolume,
      engine: voiceEngine,
    });
    setRadioEnabled(voiceRadio);
    initVoiceOverrides(cfg.voice_overrides);
    initCommandOverrides(cfg.spotter_commands);
    setAppTimezone(timezone);
    set({
      configLoaded: true,
      isConfigured,
      playerName: cfg.player_name ?? "",
      lmuPath: cfg.lmu_path ?? "",
      resultsDir,
      telemetryDir,
      timezone,
      autoIndex,
      systemTray: cfg.system_tray !== "false",
      autoUpdate: cfg.auto_update !== "false",
      showOhneSpeed: cfg.show_ohne_speed !== "false",
      overlayTargetTier: cfg.overlay_target_tier || "competitive",
      menuModules,
      voiceAnnouncements: cfg.voice_announcements === "true",
      voiceUriByLang,
      piperVoiceByLang,
      piperSpeakerByLang,
      voiceRate,
      voiceVolume,
      voiceRadio,
      voiceEngine,
      spotterEnabled: cfg.spotter_enabled === "true",
      spotterKeyStatus: cfg.spotter_key_status || "Alt+S",
      spotterKeyMute: cfg.spotter_key_mute || "Alt+M",
      spotterKeyRepeat: cfg.spotter_key_repeat || "Alt+R",
      spotterKeyTalk: cfg.spotter_key_talk || "Alt+T",
      spotterKeyCoach: cfg.spotter_key_coach || "Alt+C",
      overlayToggleKey: cfg.overlay_toggle_key || "",
      spotterPttMode: cfg.spotter_ptt_mode === "toggle" ? "toggle" : "hold",
      aiCoachEnabled: cfg.ai_coach_enabled !== "false",
      aiProvider: cfg.ai_provider || "google",
      aiApiKey,
      aiModel: cfg.ai_model ?? "",
      aiVoiceModel: cfg.ai_voice_model ?? "",
      aiVoiceProvider: cfg.ai_voice_provider ?? "",
      aiVoiceApiKey,
      aiSystemPromptByLang,
      selectedVersion: cfg.default_since_version ?? null,
    });
    if (isConfigured) {
      try {
        if (cfg.index_logic_version !== INDEX_LOGIC_VERSION) {
          // La base a été indexée avec une logique obsolète → reconstruction.
          await indexer.reindexAll();
          await config.set("index_logic_version", INDEX_LOGIC_VERSION);
        } else if (autoIndex) {
          // Sync delta : seuls les fichiers nouveaux/modifiés sont relus.
          await indexer.syncIndex();
        }
      } catch {
        /* dossier momentanément indisponible — on charge ce qu'on a */
      }
      await get().loadDashboard();
    }
   } catch (e) {
      // Échec IPC/DB au boot (base verrouillée, migration ratée, IPC KO) : ne
      // pas laisser l'app figée sur le spinner infini. On marque la config
      // « chargée » en mode dégradé → l'app rend l'onboarding au lieu de geler.
      console.error("[app.init] échec d'initialisation", e);
      set({ configLoaded: true, isConfigured: false });
   }
  },

  runSetup: async (lmuPath, playerName, resultsDir, telemetryDir) => {
    set({ indexing: true, indexReport: null });
    try {
      const report = await indexer.runSetup(
        lmuPath,
        playerName,
        resultsDir,
        telemetryDir,
      );
      await config.set("index_logic_version", INDEX_LOGIC_VERSION);
      // Recharge les chemins effectivement enregistrés (le backend a pu dériver
      // les valeurs par défaut quand les surcharges étaient vides).
      const cfg = await config.getAll();
      set({
        indexReport: report,
        isConfigured: true,
        playerName,
        lmuPath,
        resultsDir: cfg.results_dir ?? "",
        telemetryDir: cfg.telemetry_dir ?? "",
      });
      await get().loadDashboard();
      return report;
    } finally {
      set({ indexing: false });
    }
  },

  syncIndex: async () => {
    set({ indexing: true });
    try {
      const report = await indexer.syncIndex();
      set({ indexReport: report });
      await get().loadDashboard();
    } finally {
      set({ indexing: false });
    }
  },

  syncQuiet: async () => {
    const s = get();
    // Conditions : configuré, auto-index actif, pas déjà en cours, anti-rebond 8 s.
    if (!s.isConfigured || !s.autoIndex || s.indexing) return;
    const now = Date.now();
    if (now - _lastQuietSync < 8000) return;
    _lastQuietSync = now;
    try {
      const report = await indexer.syncIndex();
      // Ne rafraîchir le dashboard que si quelque chose a changé (évite un reload inutile).
      if (report.added + report.updated + report.removed > 0) {
        set({ indexReport: report });
        // Les records ont pu changer → invalide le cache du digest coach.
        resetRecordsDigestCache();
        await get().loadDashboard();
      }
    } catch {
      /* dossier momentanément indisponible — silencieux */
    }
  },

  reindexAll: async () => {
    set({ indexing: true });
    try {
      const report = await indexer.reindexAll();
      set({ indexReport: report });
      resetRecordsDigestCache();
      await get().loadDashboard();
    } finally {
      set({ indexing: false });
    }
  },

  loadDashboard: async () => {
    set({ loading: true });
    try {
      const [dashboardStats, bestLaps, filterOptions, gameVersions] =
        await Promise.all([
          queries.getDashboardStats(),
          queries.getBestLaps(),
          queries.getFilterOptions(),
          queries.getGameVersions(),
        ]);
      set({ dashboardStats, bestLaps, filterOptions, gameVersions });
    } finally {
      set({ loading: false });
    }
  },

  clearCache: async () => {
    await indexer.clearCache();
    set({ indexReport: null });
  },

  purgeEmptySessions: async (purgeType: "global" | "player" = "global") => {
    const removed = await indexer.purgeEmptySessions(purgeType);
    await get().loadDashboard();
    return removed;
  },

  setSelectedVersion: (v) => set({ selectedVersion: v }),
  setShowOutdated: (v) => set({ showOutdated: v }),

  setTimezone: async (tz) => {
    await config.set("timezone", tz);
    setAppTimezone(tz);
    set({ timezone: tz });
  },

  setAutoIndex: async (v) => {
    await config.set("auto_index", v ? "true" : "false");
    set({ autoIndex: v });
  },

  setSystemTray: async (v) => {
    await config.set("system_tray", v ? "true" : "false");
    // Crée/retire l'icône du tray immédiatement (sans redémarrage).
    await system.setTrayEnabled(v).catch(() => {});
    set({ systemTray: v });
  },

  setAutoUpdate: async (v) => {
    await config.set("auto_update", v ? "true" : "false");
    set({ autoUpdate: v });
  },

  setShowOhneSpeed: async (v) => {
    await config.set("show_ohne_speed", v ? "true" : "false");
    set({ showOhneSpeed: v });
  },

  setOverlayTargetTier: async (v) => {
    await config.set("overlay_target_tier", v);
    set({ overlayTargetTier: v });
  },

  setMenuModule: async (key, value) => {
    const next = { ...get().menuModules, [key]: value };
    set({ menuModules: next });
    await config.set("menu_modules", JSON.stringify(next));
  },

  setVoiceAnnouncements: async (v) => {
    await config.set("voice_announcements", v ? "true" : "false");
    set({ voiceAnnouncements: v });
  },

  setVoiceUri: async (lang, v) => {
    const code = (lang || "fr").slice(0, 2).toLowerCase();
    const map = { ...get().voiceUriByLang };
    if (v) map[code] = v;
    else delete map[code];
    configureVoice({ voiceByLang: map });
    await config.set("voice_uri", JSON.stringify(map));
    set({ voiceUriByLang: map });
  },

  setPiperVoice: async (lang, id) => {
    const code = (lang || "fr").slice(0, 2).toLowerCase();
    const map = { ...get().piperVoiceByLang };
    if (id) map[code] = id;
    else delete map[code];
    configureVoice({ piperByLang: map });
    await config.set("piper_voices", JSON.stringify(map));
    set({ piperVoiceByLang: map });
  },

  setPiperSpeaker: async (lang, speaker) => {
    const code = (lang || "fr").slice(0, 2).toLowerCase();
    const map = { ...get().piperSpeakerByLang };
    if (speaker > 0) map[code] = speaker;
    else delete map[code]; // 0 = défaut → pas besoin de stocker
    configureVoice({ speakerByLang: map });
    await config.set("piper_speakers", JSON.stringify(map));
    set({ piperSpeakerByLang: map });
  },

  setVoiceRate: async (v) => {
    configureVoice({ rate: v });
    await config.set("voice_rate", String(v));
    set({ voiceRate: v });
  },

  setVoiceVolume: async (v) => {
    configureVoice({ volume: v });
    await config.set("voice_volume", String(v));
    set({ voiceVolume: v });
  },

  setVoiceRadio: async (v) => {
    setRadioEnabled(v);
    await config.set("voice_radio", v ? "true" : "false");
    set({ voiceRadio: v });
  },

  setVoiceEngine: async (v) => {
    configureVoice({ engine: v });
    await config.set("voice_engine", v);
    set({ voiceEngine: v });
  },

  setSpotterEnabled: async (v) => {
    await config.set("spotter_enabled", v ? "true" : "false");
    set({ spotterEnabled: v });
  },

  setSpotterKey: async (action, accel) => {
    const key =
      action === "status"
        ? "spotter_key_status"
        : action === "mute"
          ? "spotter_key_mute"
          : action === "repeat"
            ? "spotter_key_repeat"
            : action === "coach"
              ? "spotter_key_coach"
              : "spotter_key_talk";
    await config.set(key, accel);
    set(
      action === "status"
        ? { spotterKeyStatus: accel }
        : action === "mute"
          ? { spotterKeyMute: accel }
          : action === "repeat"
            ? { spotterKeyRepeat: accel }
            : action === "coach"
              ? { spotterKeyCoach: accel }
              : { spotterKeyTalk: accel },
    );
  },

  setSpotterPttMode: async (mode) => {
    await config.set("spotter_ptt_mode", mode);
    set({ spotterPttMode: mode });
  },

  setOverlayToggleKey: async (accel) => {
    await config.set("overlay_toggle_key", accel);
    set({ overlayToggleKey: accel });
  },

  setAICoachEnabled: async (v) => {
    await config.set("ai_coach_enabled", v ? "true" : "false");
    set({ aiCoachEnabled: v });
  },

  setAIProvider: async (v) => {
    await config.set("ai_provider", v);
    set({ aiProvider: v });
  },

  setAIApiKey: async (v) => {
    await ai.setKey(v); // stockée chiffrée côté backend
    set({ aiApiKey: v });
  },

  setAIModel: async (v) => {
    await config.set("ai_model", v);
    set({ aiModel: v });
  },

  setAIVoiceModel: async (v) => {
    await config.set("ai_voice_model", v);
    set({ aiVoiceModel: v });
  },

  setAIVoiceProvider: async (v) => {
    await config.set("ai_voice_provider", v);
    set({ aiVoiceProvider: v });
  },

  setAIVoiceApiKey: async (v) => {
    await ai.setVoiceKey(v); // stockée chiffrée côté backend
    set({ aiVoiceApiKey: v });
  },

  setAISystemPrompt: async (lang, v) => {
    const code = (lang || "fr").slice(0, 2).toLowerCase();
    const map = { ...get().aiSystemPromptByLang };
    if (v.trim()) map[code] = v;
    else delete map[code]; // vide → on retire l'override (repli sur le défaut)
    await config.set("ai_system_prompt", JSON.stringify(map));
    set({ aiSystemPromptByLang: map });
  },
}));
