/**
 * Store des overlays in-game.
 *
 * Partagé entre la fenêtre `main` (page de gestion) et la fenêtre `overlay`
 * (rendu). Comme ce sont deux contextes JS distincts, l'état n'est pas partagé
 * en mémoire : la **source de vérité est la config SQLite** (clé `overlays_config`),
 * et toute mutation est rediffusée via l'event Tauri `overlays-config` (qui touche
 * toutes les fenêtres). Chaque fenêtre applique l'état reçu de façon idempotente
 * et ignore ses propres échos (champ `src`).
 */

import { create } from "zustand";
import { emit } from "@tauri-apps/api/event";
import { config, overlay as overlayApi } from "@/lib/api";
import { OVERLAY_DEFS, type OverlayId } from "@/lib/overlays";

const CONFIG_KEY = "overlays_config";
/** Identifiant unique de cette fenêtre (anti-écho des broadcasts). */
const SRC = Math.random().toString(36).slice(2);

export interface OverlaySettings {
  enabled: boolean;
  x: number;
  y: number;
  /** 0.5 → 2.0 */
  scale: number;
  /** 0 → 1 */
  opacity: number;
  /** Éléments de contenu activés (clé → bool). */
  content: Record<string, boolean>;
}

/** Données sauvegardées dans un profil (tout sauf la liste des profils). */
export interface OverlayProfile {
  overlays: Record<string, OverlaySettings>;
  highFps: boolean;
  globalOpacity: number;
}

export interface OverlaysConfig {
  overlays: Record<string, OverlaySettings>;
  highFps: boolean;
  /** Interrupteur global : masque/ferme tous les overlays sans perdre leur état. */
  masterEnabled: boolean;
  /** Opacité générale (0 → 1), multipliée à l'opacité de chaque overlay. */
  globalOpacity: number;
  /** Profils nommés. */
  profiles: Record<string, OverlayProfile>;
  /** Profil actif ("" = aucun). */
  activeProfile: string;
}

/** Construit la config par défaut depuis le registre. */
function defaults(): OverlaysConfig {
  const overlays: Record<string, OverlaySettings> = {};
  for (const def of OVERLAY_DEFS) {
    overlays[def.id] = {
      enabled: false,
      x: def.defaultX,
      y: def.defaultY,
      scale: 1,
      opacity: 0.95,
      content: Object.fromEntries(
        def.elements.map((e) => [e.key, e.default ?? true]),
      ),
    };
  }
  return {
    overlays,
    highFps: true,
    masterEnabled: true,
    globalOpacity: 1,
    profiles: {},
    activeProfile: "",
  };
}

/** Fusionne les réglages d'un overlay stockés avec les défauts. */
function mergeOverlays(
  stored: Record<string, Partial<OverlaySettings>> | undefined,
  base: Record<string, OverlaySettings>,
): Record<string, OverlaySettings> {
  const out: Record<string, OverlaySettings> = {};
  for (const def of OVERLAY_DEFS) {
    const d = base[def.id];
    const s = stored?.[def.id];
    out[def.id] = {
      enabled: s?.enabled ?? d.enabled,
      x: s?.x ?? d.x,
      y: s?.y ?? d.y,
      scale: s?.scale ?? d.scale,
      opacity: s?.opacity ?? d.opacity,
      content: { ...d.content, ...(s?.content ?? {}) },
    };
  }
  return out;
}

/** Fusionne la config stockée avec les défauts (gère ajout d'overlays/éléments). */
function merge(stored: Partial<OverlaysConfig> | null): OverlaysConfig {
  const base = defaults();
  if (!stored) return base;
  return {
    overlays: mergeOverlays(stored.overlays, base.overlays),
    highFps: stored.highFps ?? base.highFps,
    masterEnabled: stored.masterEnabled ?? base.masterEnabled,
    globalOpacity: stored.globalOpacity ?? base.globalOpacity,
    profiles: stored.profiles ?? {},
    activeProfile: stored.activeProfile ?? "",
  };
}

// Persistance débouncée (évite d'écrire en base à chaque pixel de drag).
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(cfg: OverlaysConfig, markSaved: () => void) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persistNow(cfg).then(markSaved).catch(() => {});
  }, 250);
}

/** Persistance immédiate (SQLite + broadcast). Annule un éventuel debounce en cours. */
async function persistNow(cfg: OverlaysConfig): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await config.set(CONFIG_KEY, JSON.stringify(cfg));
  await emit("overlays-config", { src: SRC, cfg });
}

interface OverlaysStore {
  cfg: OverlaysConfig;
  loaded: boolean;
  /** true quand la dernière mutation a été persistée. */
  saved: boolean;
  editMode: boolean;

  load: () => Promise<void>;
  toggleOverlay: (id: OverlayId, on?: boolean) => void;
  /** Active ou désactive TOUS les overlays d'un coup. */
  setAllEnabled: (v: boolean) => Promise<void>;
  updateSettings: (id: OverlayId, patch: Partial<OverlaySettings>) => void;
  updateContent: (id: OverlayId, key: string, value: boolean) => void;
  setHighFps: (v: boolean) => void;
  setEditMode: (v: boolean) => Promise<void>;
  /** Met à jour l'état édition local uniquement (réception event, pas de backend). */
  applyEditMode: (v: boolean) => void;
  /** Interrupteur global : ferme/ouvre la fenêtre overlay (conserve l'état). */
  setMasterEnabled: (v: boolean) => Promise<void>;
  setGlobalOpacity: (v: number) => void;
  /** Profils. */
  saveProfile: (name: string) => void;
  /** Crée un profil neuf (réglages par défaut) avec uniquement les overlays
   *  de `enabledIds` activés, puis l'active immédiatement. Liste vide → profil
   *  vierge (tous désactivés). Renvoie `true` si au moins un overlay est actif. */
  createEmptyProfile: (name: string, enabledIds?: OverlayId[]) => Promise<boolean>;
  loadProfile: (name: string) => Promise<void>;
  deleteProfile: (name: string) => void;
  /** Applique une config reçue d'une autre fenêtre (pas de re-broadcast). */
  applyRemote: (cfg: OverlaysConfig) => void;
  /** Force la persistance immédiate (avant d'ouvrir la fenêtre overlay). */
  flush: () => Promise<void>;
  /** Compteur d'overlays activés. */
  activeCount: () => number;
}

function mutate(
  set: (fn: (s: OverlaysStore) => Partial<OverlaysStore>) => void,
  _get: () => OverlaysStore,
  next: OverlaysConfig,
) {
  set(() => ({ cfg: next, saved: false }));
  schedulePersist(next, () => set(() => ({ saved: true })));
}

export const useOverlaysStore = create<OverlaysStore>((set, get) => ({
  cfg: defaults(),
  loaded: false,
  saved: true,
  editMode: false,

  load: async () => {
    let stored: Partial<OverlaysConfig> | null = null;
    try {
      const raw = await config.get(CONFIG_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch {
      stored = null;
    }
    set(() => ({ cfg: merge(stored), loaded: true, saved: true }));
  },

  toggleOverlay: (id, on) => {
    const cfg = get().cfg;
    const cur = cfg.overlays[id];
    mutate(set, get, {
      ...cfg,
      overlays: { ...cfg.overlays, [id]: { ...cur, enabled: on ?? !cur.enabled } },
    });
  },

  setAllEnabled: async (v) => {
    const cfg = get().cfg;
    const overlays: Record<string, OverlaySettings> = {};
    for (const [id, o] of Object.entries(cfg.overlays)) {
      overlays[id] = { ...o, enabled: v };
    }
    const next = { ...cfg, overlays };
    set(() => ({ cfg: next, saved: false }));
    // Persiste immédiatement avant d'ouvrir (la fenêtre overlay lit la config au boot).
    await persistNow(next);
    set(() => ({ saved: true }));
    try {
      if (v && next.masterEnabled) await overlayApi.open();
      else if (!v) await overlayApi.close();
    } catch {
      /* ignore */
    }
  },

  updateSettings: (id, patch) => {
    const cfg = get().cfg;
    mutate(set, get, {
      ...cfg,
      overlays: { ...cfg.overlays, [id]: { ...cfg.overlays[id], ...patch } },
    });
  },

  updateContent: (id, key, value) => {
    const cfg = get().cfg;
    const cur = cfg.overlays[id];
    mutate(set, get, {
      ...cfg,
      overlays: {
        ...cfg.overlays,
        [id]: { ...cur, content: { ...cur.content, [key]: value } },
      },
    });
  },

  setHighFps: (v) => mutate(set, get, { ...get().cfg, highFps: v }),

  setEditMode: async (v) => {
    set(() => ({ editMode: v }));
    try {
      await overlayApi.setEditMode(v);
    } catch {
      /* la fenêtre overlay n'est peut-être pas ouverte */
    }
  },

  setMasterEnabled: async (v) => {
    const next = { ...get().cfg, masterEnabled: v };
    set(() => ({ cfg: next, saved: false }));
    // Persiste IMMÉDIATEMENT (pas en différé) : la fenêtre overlay relit la config
    // en SQLite au boot, donc `masterEnabled` doit être écrit AVANT de l'ouvrir,
    // sinon elle démarre avec l'ancienne valeur et ne rend rien.
    await persistNow(next);
    set(() => ({ saved: true }));
    try {
      if (v) await overlayApi.open();
      else await overlayApi.close();
    } catch {
      /* ignore */
    }
  },

  setGlobalOpacity: (v) =>
    mutate(set, get, { ...get().cfg, globalOpacity: v }),

  saveProfile: (name) => {
    const cfg = get().cfg;
    const profile: OverlayProfile = {
      overlays: cfg.overlays,
      highFps: cfg.highFps,
      globalOpacity: cfg.globalOpacity,
    };
    mutate(set, get, {
      ...cfg,
      profiles: { ...cfg.profiles, [name]: profile },
      activeProfile: name,
    });
  },

  createEmptyProfile: async (name, enabledIds = []) => {
    const cfg = get().cfg;
    // Base 100 % défauts (positions/échelles d'origine) puis on active la sélection.
    const blank = defaults().overlays;
    for (const id of enabledIds) {
      if (blank[id]) blank[id] = { ...blank[id], enabled: true };
    }
    const hasActive = enabledIds.length > 0;
    const profile: OverlayProfile = {
      overlays: blank,
      highFps: cfg.highFps,
      globalOpacity: cfg.globalOpacity,
    };
    const next: OverlaysConfig = {
      ...cfg,
      overlays: blank,
      // Un profil avec overlays doit être visible (sinon rien ne s'affiche).
      masterEnabled: hasActive ? true : cfg.masterEnabled,
      profiles: { ...cfg.profiles, [name]: profile },
      activeProfile: name,
    };
    set(() => ({ cfg: next, saved: false }));
    await persistNow(next);
    set(() => ({ saved: true }));
    if (!hasActive) {
      // Aucun overlay actif → on libère la fenêtre overlay.
      try {
        await overlayApi.close();
      } catch {
        /* ignore */
      }
    }
    return hasActive;
  },

  loadProfile: async (name) => {
    const cfg = get().cfg;
    const p = cfg.profiles[name];
    if (!p) return;
    const base = defaults().overlays;
    const next: OverlaysConfig = {
      ...cfg,
      overlays: mergeOverlays(p.overlays, base),
      highFps: p.highFps ?? cfg.highFps,
      globalOpacity: p.globalOpacity ?? cfg.globalOpacity,
      activeProfile: name,
    };
    // Persiste immédiatement avant de (ré)ouvrir → la fenêtre overlay lit le bon état.
    set(() => ({ cfg: next, saved: false }));
    await persistNow(next);
    set(() => ({ saved: true }));
    try {
      if (next.masterEnabled) await overlayApi.open();
    } catch {
      /* ignore */
    }
  },

  deleteProfile: (name) => {
    const cfg = get().cfg;
    const profiles = { ...cfg.profiles };
    delete profiles[name];
    mutate(set, get, {
      ...cfg,
      profiles,
      activeProfile: cfg.activeProfile === name ? "" : cfg.activeProfile,
    });
  },

  applyEditMode: (v) => set(() => ({ editMode: v })),

  applyRemote: (cfg) => set(() => ({ cfg: merge(cfg), loaded: true })),

  flush: async () => {
    await persistNow(get().cfg);
    set(() => ({ saved: true }));
  },

  activeCount: () =>
    Object.values(get().cfg.overlays).filter((o) => o.enabled).length,
}));

/** Identifiant de source — exposé pour filtrer les échos côté listeners. */
export const OVERLAYS_SRC = SRC;
