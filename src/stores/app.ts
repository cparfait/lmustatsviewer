/**
 * Store applicatif V3 (mono-profil).
 *
 * Remplace l'ancien `useProfileStore` multi-profils de la V2. La V3 ne gère
 * qu'un seul joueur : la configuration (chemin du jeu, nom du joueur) est
 * stockée en base via les commandes `config`. Aucune donnée mockée.
 */

import { create } from "zustand";
import { config, indexer, queries } from "@/lib/api";
import { setAppTimezone } from "@/lib/utils";
import { preloadStaticData } from "@/lib/staticData";
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

interface AppState {
  // Cycle de vie
  configLoaded: boolean;
  /** true quand le dossier de résultats est configuré (= onboarding fait). */
  isConfigured: boolean;

  // Configuration
  playerName: string;
  lmuPath: string;
  resultsDir: string;

  // Préférences applicatives (persistées en config)
  timezone: string;
  autoIndex: boolean;
  systemTray: boolean;
  autoUpdate: boolean;

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
  runSetup: (lmuPath: string, playerName: string) => Promise<IndexReport>;
  syncIndex: () => Promise<void>;
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
}

export const useAppStore = create<AppState>((set, get) => ({
  configLoaded: false,
  isConfigured: false,
  playerName: "",
  lmuPath: "",
  resultsDir: "",
  timezone: "",
  autoIndex: true,
  systemTray: true,
  autoUpdate: true,
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
    await preloadStaticData();
    const cfg = await config.getAll();
    const resultsDir = cfg.results_dir ?? "";
    const isConfigured = resultsDir.length > 0;
    const timezone = cfg.timezone ?? "";
    const autoIndex = cfg.auto_index !== "false";
    setAppTimezone(timezone);
    set({
      configLoaded: true,
      isConfigured,
      playerName: cfg.player_name ?? "",
      lmuPath: cfg.lmu_path ?? "",
      resultsDir,
      timezone,
      autoIndex,
      systemTray: cfg.system_tray !== "false",
      autoUpdate: cfg.auto_update !== "false",
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
  },

  runSetup: async (lmuPath, playerName) => {
    set({ indexing: true, indexReport: null });
    try {
      const report = await indexer.runSetup(lmuPath, playerName);
      await config.set("index_logic_version", INDEX_LOGIC_VERSION);
      set({
        indexReport: report,
        isConfigured: true,
        playerName,
        lmuPath,
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

  reindexAll: async () => {
    set({ indexing: true });
    try {
      const report = await indexer.reindexAll();
      set({ indexReport: report });
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
    set({ systemTray: v });
  },

  setAutoUpdate: async (v) => {
    await config.set("auto_update", v ? "true" : "false");
    set({ autoUpdate: v });
  },
}));
