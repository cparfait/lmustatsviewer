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
import { setRadioEnabled, MAX_VOICE_VOLUME } from "@/lib/radioFx";
import { resetRecordsDigestCache } from "@/lib/ai/context/records-context";
import {
  setCustomProviders,
  newCustomProviderId,
  type CustomProviderDef,
} from "@/lib/ai/providers/custom";
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
  /**
   * L'utilisateur a choisi d'entrer dans l'app sans configurer (pas le jeu
   * installé, découverte de l'outil…). **Volontairement non persisté** : au
   * prochain lancement, si rien n'est renseigné, l'onboarding est reproposé.
   */
  onboardingSkipped: boolean;

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
  /** Coach par virage — mode Drill (§8/§11) : entraînement ciblé sur les virages-chantiers. */
  coachDrill: boolean;
  /** Coach par virage — coaching de stint (§12) : dérive pneus, lift & coast, out-lap. */
  coachStint: boolean;
  /** Coach par virage — coaching du risque + cible de classe (§12) : track_limits + secteurs. */
  coachRisk: boolean;
  /** Coach par virage — banque de phrases LLM à slots (§10) : formulation variée pré-générée. */
  coachPhrasebank: boolean;
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
  /** Perte estimée au stand (s) — base de la prédiction « sortie stands » du spotter (T13 #151). */
  pitLossSeconds: number;
  /** Pertes au stand **mesurées** par combo `track::car` (T13 #152) — persistées. */
  pitLossByCombo: Record<string, number>;
  /** Réserve carburant (tours) ajoutée au « carburant pour finir » du spotter (T13 #157). */
  fuelReserveLaps: number;

  // AI Coach
  /** Coach IA activé : si false, le coach disparaît de toutes les pages. */
  aiCoachEnabled: boolean;
  /** Fournisseur d'IA ACTIF (analyse) : id d'un provider configuré. */
  aiProvider: string;
  /**
   * Fournisseurs intégrés CONFIGURÉS par l'utilisateur (ids de `PROVIDERS`,
   * façon deepseek-harness : on « ajoute » un fournisseur avec sa clé, il
   * apparaît en carte et devient sélectionnable). Les customs sont à part
   * (`aiCustomProviders`).
   */
  aiProviderList: string[];
  /** id du modèle sélectionné (analyse / panneau). */
  aiModel: string;
  /** id du modèle dédié au coach VOCAL (rapide). Vide = même que `aiModel`. */
  aiVoiceModel: string;
  /** Fournisseurs personnalisés (OpenAI-compatibles) définis par l'utilisateur. */
  aiCustomProviders: CustomProviderDef[];
  /**
   * Clé API PAR fournisseur (intégré comme custom), chiffrée côté backend
   * (`ai_set_provider_key`). Remplace les anciens créneaux globaux
   * analyse/vocal, migrés au premier chargement.
   */
  aiProviderKeys: Record<string, string>;
  /** Fournisseur DISTINCT pour le coach vocal. Vide = même que `aiProvider`. */
  aiVoiceProvider: string;
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
  /** « Cette version uniquement » : filtre `=` au lieu de `>=` (spec §3.8). */
  versionExact: boolean;

  // Indexation
  indexing: boolean;
  indexReport: IndexReport | null;
  /**
   * Compteur incremente a chaque fois que l'index change (session ajoutee,
   * modifiee ou retiree). Les pages qui lisent la base l'incluent dans les
   * dependances de leur chargement : sans ca, une session couru pendant que
   * l'app tourne etait bien indexee au retour du focus, mais les listes
   * continuaient d'afficher l'etat precedent jusqu'a un changement de filtre.
   */
  dataVersion: number;

  loading: boolean;

  // Actions
  init: () => Promise<void>;
  /** Entre dans l'app sans configuration (le temps de la session seulement). */
  skipOnboarding: () => void;
  /** Rouvre l'assistant de configuration depuis la bannière. */
  resumeOnboarding: () => void;
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
  setVersionExact: (v: boolean) => void;
  setTimezone: (tz: string) => Promise<void>;
  setAutoIndex: (v: boolean) => Promise<void>;
  setSystemTray: (v: boolean) => Promise<void>;
  setAutoUpdate: (v: boolean) => Promise<void>;
  setShowOhneSpeed: (v: boolean) => Promise<void>;
  setOverlayTargetTier: (v: string) => Promise<void>;
  setMenuModule: (key: string, value: boolean) => Promise<void>;
  setVoiceAnnouncements: (v: boolean) => Promise<void>;
  setCoachDrill: (v: boolean) => Promise<void>;
  setCoachStint: (v: boolean) => Promise<void>;
  setCoachRisk: (v: boolean) => Promise<void>;
  setCoachPhrasebank: (v: boolean) => Promise<void>;
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
  setPitLossSeconds: (v: number) => Promise<void>;
  /** Enregistre une perte au stand mesurée (T13 #152) pour un combo + l'applique. */
  recordPitLoss: (combo: string, seconds: number) => Promise<void>;
  /** Applique la perte mesurée d'un combo à `pitLossSeconds` si connue (T13 #152). */
  applyPitLossForCombo: (combo: string) => void;
  setFuelReserveLaps: (v: number) => Promise<void>;
  setOverlayToggleKey: (accel: string) => Promise<void>;
  setAICoachEnabled: (v: boolean) => Promise<void>;
  setAIProvider: (v: string) => Promise<void>;
  /** Ajoute un fournisseur INTÉGRÉ à la liste configurée (avec sa clé). */
  addProvider: (id: string, apiKey: string) => Promise<void>;
  /** Retire un fournisseur intégré de la liste (efface sa clé). */
  removeProvider: (id: string) => Promise<void>;
  /** Interne : bascule actif/vocal après suppression d'un fournisseur. */
  onProviderRemoved: (id: string) => Promise<void>;
  addCustomProvider: (name: string, baseUrl: string, apiKey: string) => Promise<string>;
  updateCustomProvider: (id: string, name: string, baseUrl: string) => Promise<void>;
  removeCustomProvider: (id: string) => Promise<void>;
  /** Clé API d'un fournisseur (intégré ou custom), chiffrée côté backend. */
  setProviderKey: (id: string, key: string) => Promise<void>;
  setAIModel: (v: string) => Promise<void>;
  setAIVoiceModel: (v: string) => Promise<void>;
  setAIVoiceProvider: (v: string) => Promise<void>;
  setAISystemPrompt: (lang: string, v: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  configLoaded: false,
  isConfigured: false,
  onboardingSkipped: false,
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
  coachDrill: false,
  coachStint: false,
  coachRisk: false,
  coachPhrasebank: false,
  voiceUriByLang: {},
  piperVoiceByLang: {},
  piperSpeakerByLang: {},
  voiceRate: 1.05,
  voiceVolume: 1,
  voiceRadio: true,
  voiceEngine: "piper",
  spotterEnabled: false,
  spotterKeyStatus: "Alt+S",
  spotterKeyMute: "Alt+M",
  spotterKeyRepeat: "Alt+R",
  spotterKeyTalk: "Alt+T",
  spotterKeyCoach: "Alt+C",
  spotterPttMode: "hold",
  pitLossSeconds: 25,
  pitLossByCombo: {},
  fuelReserveLaps: 1,
  overlayToggleKey: "",
  aiCoachEnabled: true,
  aiProvider: "google",
  aiCustomProviders: [],
  aiProviderList: [],
  aiProviderKeys: {},
  aiModel: "",
  aiVoiceModel: "",
  aiVoiceProvider: "",
  aiSystemPromptByLang: {},
  dashboardStats: null,
  bestLaps: [],
  filterOptions: null,
  gameVersions: [],
  selectedVersion: null,
  showOutdated: false,
  versionExact: false,
  indexing: false,
  indexReport: null,
  dataVersion: 0,
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
        ? Math.min(MAX_VOICE_VOLUME, Number(cfg.voice_volume))
        : 1;
    const voiceRadio = cfg.voice_radio !== "false";
    const voiceEngine = cfg.voice_engine === "system" ? "system" : "piper";
    // Fournisseurs custom : définitions (JSON non secret) + clé chiffrée chacun.
    const aiCustomProviders: CustomProviderDef[] = (() => {
      try {
        const parsed = JSON.parse(cfg.ai_custom_providers || "[]");
        return Array.isArray(parsed)
          ? parsed.filter(
              (d): d is CustomProviderDef =>
                d && typeof d.id === "string" && typeof d.baseUrl === "string",
            )
          : [];
      } catch {
        return [];
      }
    })();
    setCustomProviders(aiCustomProviders); // injecte dans le registre (hors store)
    // Liste des fournisseurs intégrés configurés (cartes façon harness).
    let aiProviderList: string[] = (() => {
      try {
        const parsed = JSON.parse(cfg.ai_provider_list || "[]");
        return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
      } catch {
        return [];
      }
    })();
    // Migration depuis les créneaux globaux (≤ 1.0.2) : la clé « analyse »
    // devient celle du fournisseur actif, la clé « vocal » celle du fournisseur
    // vocal. La liste démarre avec ces fournisseurs → rien ne casse à la mise à
    // jour. Les anciens créneaux ne sont plus lus ensuite (mais pas effacés :
    // un retour arrière de version doit retrouver ses clés).
    if (!cfg.ai_provider_list) {
      const active = cfg.ai_provider || "google";
      aiProviderList = [active];
      const legacyKey = await ai.getKey().catch(() => "");
      if (legacyKey) await ai.setProviderKey(active, legacyKey).catch(() => {});
      const voiceP = cfg.ai_voice_provider ?? "";
      if (voiceP && voiceP !== active) {
        if (!aiProviderList.includes(voiceP)) aiProviderList.push(voiceP);
        const legacyVoiceKey = await ai.getVoiceKey().catch(() => "");
        if (legacyVoiceKey) await ai.setProviderKey(voiceP, legacyVoiceKey).catch(() => {});
      }
      await config.set("ai_provider_list", JSON.stringify(aiProviderList)).catch(() => {});
    }
    // Clé par fournisseur (intégrés configurés + customs), déchiffrées côté Rust.
    const aiProviderKeys: Record<string, string> = {};
    for (const id of [...aiProviderList, ...aiCustomProviders.map((d) => d.id)]) {
      aiProviderKeys[id] = await ai.getProviderKey(id).catch(() => "");
    }
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
      coachDrill: cfg.coach_drill === "true",
      coachStint: cfg.coach_stint === "true",
      coachRisk: cfg.coach_risk === "true",
      coachPhrasebank: cfg.coach_phrasebank === "true",
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
      pitLossSeconds: Number(cfg.pit_loss_seconds) > 0 ? Number(cfg.pit_loss_seconds) : 25,
      pitLossByCombo: ((): Record<string, number> => {
        try {
          const m = JSON.parse(cfg.pit_loss_map || "{}");
          return m && typeof m === "object" ? (m as Record<string, number>) : {};
        } catch {
          return {};
        }
      })(),
      fuelReserveLaps: Number.isFinite(Number(cfg.fuel_reserve_laps)) && Number(cfg.fuel_reserve_laps) >= 0
        ? Number(cfg.fuel_reserve_laps)
        : 1,
      aiCoachEnabled: cfg.ai_coach_enabled !== "false",
      aiProvider: cfg.ai_provider || "google",
      aiProviderList,
      aiCustomProviders,
      aiProviderKeys,
      aiModel: cfg.ai_model ?? "",
      aiVoiceModel: cfg.ai_voice_model ?? "",
      aiVoiceProvider: cfg.ai_voice_provider ?? "",
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

  skipOnboarding: () => set({ onboardingSkipped: true }),

  resumeOnboarding: () => set({ onboardingSkipped: false }),

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
        dataVersion: get().dataVersion + 1,
        isConfigured: true,
        onboardingSkipped: false,
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
      set({ indexReport: report, dataVersion: get().dataVersion + 1 });
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
        set({ indexReport: report, dataVersion: get().dataVersion + 1 });
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
      set({ indexReport: report, dataVersion: get().dataVersion + 1 });
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
  setVersionExact: (v) => set({ versionExact: v }),

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

  setCoachDrill: async (v) => {
    await config.set("coach_drill", v ? "true" : "false");
    set({ coachDrill: v });
  },

  setCoachStint: async (v) => {
    await config.set("coach_stint", v ? "true" : "false");
    set({ coachStint: v });
  },

  setCoachRisk: async (v) => {
    await config.set("coach_risk", v ? "true" : "false");
    set({ coachRisk: v });
  },

  setCoachPhrasebank: async (v) => {
    await config.set("coach_phrasebank", v ? "true" : "false");
    set({ coachPhrasebank: v });
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

  setPitLossSeconds: async (v) => {
    const n = Number.isFinite(v) && v > 0 ? Math.round(v) : 25;
    await config.set("pit_loss_seconds", String(n));
    set({ pitLossSeconds: n });
  },

  recordPitLoss: async (combo, seconds) => {
    const n = Math.round(seconds);
    const map = { ...get().pitLossByCombo, [combo]: n };
    await config.set("pit_loss_map", JSON.stringify(map));
    await config.set("pit_loss_seconds", String(n));
    set({ pitLossByCombo: map, pitLossSeconds: n });
  },

  applyPitLossForCombo: (combo) => {
    const v = get().pitLossByCombo[combo];
    if (v && v > 0 && v !== get().pitLossSeconds) set({ pitLossSeconds: v });
  },

  setFuelReserveLaps: async (v) => {
    const n = Number.isFinite(v) && v >= 0 ? Math.round(v * 2) / 2 : 1; // pas de 0.5 tour
    await config.set("fuel_reserve_laps", String(n));
    set({ fuelReserveLaps: n });
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
    const changed = v !== get().aiProvider;
    await config.set("ai_provider", v);
    set({ aiProvider: v });
    // Un id de modèle n'a de sens que chez SON fournisseur : en changer remet
    // le modèle à zéro (le sondage `/models` ré-amorce ensuite). Sans ça, le
    // modèle de l'ancien fournisseur restait affiché — et échouait au 1er appel.
    if (changed && get().aiModel) {
      await config.set("ai_model", "");
      set({ aiModel: "" });
    }
  },

  addProvider: async (id, apiKey) => {
    const list = get().aiProviderList.includes(id)
      ? get().aiProviderList
      : [...get().aiProviderList, id];
    await config.set("ai_provider_list", JSON.stringify(list));
    if (apiKey) await ai.setProviderKey(id, apiKey);
    set({
      aiProviderList: list,
      aiProviderKeys: { ...get().aiProviderKeys, [id]: apiKey },
    });
  },

  removeProvider: async (id) => {
    const list = get().aiProviderList.filter((x) => x !== id);
    await config.set("ai_provider_list", JSON.stringify(list));
    await ai.setProviderKey(id, "").catch(() => {}); // efface la clé chiffrée
    const keys = { ...get().aiProviderKeys };
    delete keys[id];
    set({ aiProviderList: list, aiProviderKeys: keys });
    await get().onProviderRemoved(id);
  },

  addCustomProvider: async (name, baseUrl, apiKey) => {
    const def: CustomProviderDef = { id: newCustomProviderId(), name, baseUrl };
    const defs = [...get().aiCustomProviders, def];
    await config.set("ai_custom_providers", JSON.stringify(defs));
    if (apiKey) await ai.setProviderKey(def.id, apiKey);
    setCustomProviders(defs);
    set({
      aiCustomProviders: defs,
      aiProviderKeys: { ...get().aiProviderKeys, [def.id]: apiKey },
    });
    return def.id;
  },

  updateCustomProvider: async (id, name, baseUrl) => {
    const defs = get().aiCustomProviders.map((d) =>
      d.id === id ? { ...d, name, baseUrl } : d,
    );
    await config.set("ai_custom_providers", JSON.stringify(defs));
    setCustomProviders(defs);
    set({ aiCustomProviders: defs });
  },

  removeCustomProvider: async (id) => {
    const defs = get().aiCustomProviders.filter((d) => d.id !== id);
    await config.set("ai_custom_providers", JSON.stringify(defs));
    await ai.setProviderKey(id, "").catch(() => {}); // efface la clé chiffrée
    setCustomProviders(defs);
    const keys = { ...get().aiProviderKeys };
    delete keys[id];
    set({ aiCustomProviders: defs, aiProviderKeys: keys });
    await get().onProviderRemoved(id);
  },

  /** Après suppression d'un fournisseur : bascule l'actif/vocal s'il l'utilisait. */
  onProviderRemoved: async (id: string) => {
    if (get().aiProvider === id) {
      const first = get().aiProviderList[0] ?? get().aiCustomProviders[0]?.id ?? "";
      await config.set("ai_provider", first);
      await config.set("ai_model", "");
      set({ aiProvider: first, aiModel: "" });
    }
    if (get().aiVoiceProvider === id) {
      await config.set("ai_voice_provider", "");
      await config.set("ai_voice_model", "");
      set({ aiVoiceProvider: "", aiVoiceModel: "" });
    }
  },

  setProviderKey: async (id, key) => {
    await ai.setProviderKey(id, key); // chiffrée côté backend
    set({ aiProviderKeys: { ...get().aiProviderKeys, [id]: key } });
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

  setAISystemPrompt: async (lang, v) => {
    const code = (lang || "fr").slice(0, 2).toLowerCase();
    const map = { ...get().aiSystemPromptByLang };
    if (v.trim()) map[code] = v;
    else delete map[code]; // vide → on retire l'override (repli sur le défaut)
    await config.set("ai_system_prompt", JSON.stringify(map));
    set({ aiSystemPromptByLang: map });
  },
}));
