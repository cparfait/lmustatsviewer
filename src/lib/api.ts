/**
 * Bridge IPC V3 vers le backend Rust (Tauri).
 *
 * Aucune donnée mockée : V3 fonctionne uniquement comme application Tauri et
 * lit les vraies données du jeu. Les types correspondent exactement aux
 * structures sérialisées par le backend Rust (`src-tauri/src/commands/`).
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * Détecte si on tourne dans le runtime Tauri (et non dans un navigateur seul).
 * Utile pour gater les APIs natives (plugin-dialog, fs…).
 */
export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PlatformInfo {
  os: string;
  arch: string;
  family: string;
}

/** Bilan d'une indexation (`models::IndexReport`). */
export interface IndexReport {
  added: number;
  updated: number;
  removed: number;
  files_scanned: number;
  sessions_created: number;
  errors: string[];
}

/** Résultat de la détection du jeu (`config::DetectResult`). */
export interface DetectResult {
  lmu_path: string;
  results_dir: string;
  player_name: string;
  xml_count: number;
}

/** Statistiques globales du Dashboard (`queries::DashboardStats`). */
export interface DashboardStats {
  /** Tous les tours (valides + invalides) depuis la table laps. */
  total_laps: number;
  /** Tours avec is_valid = 1 (lap_time > 0). */
  total_laps_valid: number;
  /** Tours avec is_valid = 0 (tours partiels sans temps). */
  total_laps_invalid: number;
  total_driving_hours: number;
  /** Distance totale en km (tours valides × longueur du circuit). */
  total_distance_km: number;
  total_sessions: number;
  best_finish: number | null;
  best_progression: number | null;
  podiums: number;
  wins: number;
  top10: number;
  favorite_track: string | null;
  favorite_car: string | null;
  best_finish_track: string | null;
  best_finish_car: string | null;
  best_progression_track: string | null;
  best_progression_car: string | null;
}

/** Ligne « meilleur tour » groupée (`queries::BestLapRow`). Temps en secondes. */
export interface BestLapRow {
  session_id: number; // event_id de la meilleure session
  track: string;
  track_course: string;
  car_class: string;
  car: string;
  livery: string;
  session_type: string;
  setting: string;
  connection_type: "Online" | "Offline";
  best_lap: number;
  best_lap_s1: number | null;
  best_lap_s2: number | null;
  best_lap_s3: number | null;
  abs_best_s1: number | null;
  abs_best_s2: number | null;
  abs_best_s3: number | null;
  optimal_lap: number | null;
  vmax: number | null;
  class_position: number;
  class_grid_pos: number;
  progression: number | null;
  finish_status: string;
  timestamp: number; // epoch secondes
  game_version: string;
}

export interface LayoutOption {
  track: string;
  layout: string;
}

export interface CarOption {
  car: string;
  car_class: string;
}

/** Options de filtres (`queries::FilterOptions`). */
export interface FilterOptions {
  tracks: string[];
  layouts: LayoutOption[];
  classes: string[];
  cars: CarOption[];
  session_types: string[];
  settings: string[];
  versions: string[];
}

/** Filtres de la liste des sessions (envoyés au backend, clés snake_case). */
export interface SessionFilters {
  track?: string;
  track_course?: string;
  car_class?: string;
  car?: string;
  session_type?: string;
  setting?: string;
  version?: string;
  version_exact?: boolean;
}

/** Ligne de la liste des sessions (`queries::SessionListRow`). */
export interface SessionListRow {
  session_id: number; // id interne (navigation vers le détail)
  event_id: number;
  session_type: string;
  timestamp: number;
  track: string;
  track_course: string;
  car: string;
  livery: string;
  car_class: string;
  grid_pos: number;
  class_position: number;
  progression: number | null;
  participants: number;
  pitstops: number;
  finish_status: string;
  best_lap: number | null;
  setting: string;
  game_version: string;
}

/** Page de résultats de la liste des sessions (`queries::SessionsPage`). */
export interface SessionsPage {
  rows: SessionListRow[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

/** Compteurs en-tête de la page Sessions (`queries::SessionsOverview`). */
export interface SessionsOverview {
  total: number;
  races: number;
  qualifs: number;
  practices: number;
  cars: number;
  tracks: number;
  layouts: number;
}

// ─── Détail d'une session (`session_detail`) ────────────────────────────────

export interface SessionInfo {
  id: number;
  event_id: number;
  session_type: string;
  timestamp: number;
  track: string;
  track_course: string;
  track_event: string;
  setting: string;
  game_version: string;
  participants: number;
  session_laps: number;
  session_minutes: number;
  track_length: number;
  race_time: number;
  mech_fail_rate: number;
  damage_mult: number;
  fuel_mult: number;
  tire_mult: number;
  vehicles_allowed: string;
  filename: string;
}

export interface ResultRow {
  id: number;
  driver_name: string;
  is_player: boolean;
  veh_name: string;
  car_type: string;
  car_class: string;
  unique_car_name: string;
  car_number: number;
  team_name: string;
  control_aids: string;
  position: number;
  class_position: number;
  grid_pos: number;
  class_grid_pos: number;
  laps_count: number;
  laps_led: number;
  finish_time: number | null;
  finish_status: string;
  pitstops: number;
  best_lap: number | null;
  best_lap_s1: number | null;
  best_lap_s2: number | null;
  best_lap_s3: number | null;
  abs_best_s1: number | null;
  abs_best_s2: number | null;
  abs_best_s3: number | null;
  optimal_lap: number | null;
  vmax: number | null;
  progression: number | null;
  total_laps_valid: number;
  start_fuel: number | null;
  finish_fuel: number | null;
  median_lap: number | null;
  std_dev: number | null;
  avg_best_5: number | null;
}

export interface LapRow {
  driver_name: string;
  lap_num: number;
  position: number;
  lap_time: number | null;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  top_speed: number | null;
  fuel: number | null;
  fuel_used: number | null;
  twfl: number | null;
  twfr: number | null;
  twrl: number | null;
  twrr: number | null;
  fcompound: string;
  rcompound: string;
  is_pit: boolean;
  is_valid: boolean;
}

export interface StreamEventRow {
  event_type: string;
  et: number;
  text: string;
}

export interface SiblingSession {
  id: number;
  session_type: string;
}

export interface SessionDetail {
  session: SessionInfo;
  siblings: SiblingSession[];
  results: ResultRow[];
  laps: LapRow[];
  stream: StreamEventRow[];
}

// ─── Graphe de tours (`session_detail::LapChartData`) ───────────────────────

export interface ChartLapRow {
  lap_num: number;
  position: number;
  lap_time: number | null;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  fuel: number | null;
  fuel_used: number | null;
  fcompound: string;
  is_pit: boolean;
  is_valid: boolean;
}

export interface LapChartData {
  session_id: number;
  track: string;
  track_course: string;
  session_type: string;
  timestamp: number;
  car_type: string;
  unique_car_name: string;
  car_class: string;
  laps: ChartLapRow[];
  /** Meilleur tour perso sur ce circuit + voiture (toutes sessions). */
  personal_record: number | null;
  /** Meilleur tour de la classe dans cette session. */
  class_best: number | null;
}

export interface ChartCompareSession {
  session_id: number;
  session_type: string;
  timestamp: number;
  best_lap: number | null;
  laps_count: number;
}

// ─── Garage — configurations de voiture (.svm) (`setups`) ───────────────────

export interface SvmHeader {
  vehicle_class: string;
  upgrade_setting: string;
  veh_path: string | null;
}

export interface SvmParam {
  key: string;
  value: string;
  comment: string | null;
}

export interface SvmSection {
  name: string;
  params: SvmParam[];
}

export interface SvmFile {
  header: SvmHeader;
  sections: SvmSection[];
}

/** Entrée setup (`setups::SetupEntry`) — V3 mono-profil, sans `profile_id`. */
export interface SetupEntry {
  id: number;
  car: string;
  circuit: string;
  name: string;
  svm_path: string;
  updated_at: string;
  /** Type de setup : Course / Qualif / Autres. */
  setup_type: string;
  /** `sessions.id` de la session liée (best lap de référence, V1). */
  linked_session_id: number | null;
  /** Origine : `"game"` (lecture seule) ou `"app"` (éditable). */
  source: string;
  content_json: string | null;
}

/** Session candidate à servir de référence (best lap) pour un setup. */
export interface SetupSessionMatch {
  session_id: number;
  track: string;
  track_course: string;
  session_type: string;
  setting: string;
  car_class: string;
  unique_car_name: string;
  car_type: string;
  best_lap: number | null;
  best_lap_s1: number | null;
  best_lap_s2: number | null;
  best_lap_s3: number | null;
  timestamp: number;
  game_version: string;
}

export interface SetupSummary {
  id: number;
  name: string;
  svm_path: string;
  updated_at: string;
  setup_type: string;
  /** Origine : `"game"` ou `"app"`. */
  source: string;
  /** `sessions.id` de la session liée. `null` si aucune. */
  linked_session_id: number | null;
  /** `sessions.best_lap` de la session liée (secondes). `null` si non lié. */
  best_lap: number | null;
}

export interface SetupTrack {
  name: string;
  setups: SetupSummary[];
}

/** Setup affiché dans la page Race Details (vue inverse : « quel setup pour
 *  cette session ? »). Inclut voiture + circuit pour affichage hors contexte. */
export interface SetupForSession {
  id: number;
  name: string;
  car: string;
  circuit: string;
  setup_type: string;
  source: string;
  updated_at: string;
}

export interface SetupGroup {
  car: string;
  car_class: string;
  tracks: SetupTrack[];
}

export interface SetupDiffParam {
  key: string;
  value_a: string;
  value_b: string;
  comment_a: string | null;
  comment_b: string | null;
  is_diff: boolean;
}

export interface SetupDiffSection {
  name: string;
  params: SetupDiffParam[];
}

export interface UpdateSetupPayload {
  id: number;
  sections: SvmSection[];
}

// ─── Records personnels (`records`) ─────────────────────────────────────────

/** Une ligne de la vue d'ensemble des records (`records::RecordOverviewRow`). */
export interface RecordOverviewRow {
  track: string;
  track_course: string;
  car: string;
  car_type: string;
  car_class: string;
  best_lap: number;
  best_lap_s1: number | null;
  best_lap_s2: number | null;
  best_lap_s3: number | null;
  optimal_lap: number | null;
  vmax: number | null;
  record_date: number;
  game_version: string;
  sessions_count: number;
  improvements: number;
  record_session_id: number;
}

/** Un point de la progression d'un combo (`records::ProgressionPoint`). */
export interface ProgressionPoint {
  session_id: number;
  timestamp: number;
  session_type: string;
  setting: string;
  game_version: string;
  track_course: string;
  car_type: string;
  best_lap: number;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  optimal_lap: number | null;
  vmax: number | null;
  is_pb: boolean;
  pb_at_point: number;
  gain: number | null;
  class_best: number | null;
}

export interface ProgressionStats {
  sessions_count: number;
  all_time_pb: number;
  total_gain: number | null;
  nb_pb: number;
  optimal: number | null;
  vmax: number | null;
  days_since_pb: number | null;
  total_driving_time: number;
}

export interface RecordProgression {
  points: ProgressionPoint[];
  stats: ProgressionStats;
}

/** Filtres de la progression d'un combo (clés snake_case côté backend). */
export interface ProgressionFilters {
  track: string;
  car: string;
  track_course?: string;
  car_class?: string;
  session_type?: string;
  setting?: string;
  version?: string;
  version_exact?: boolean;
}

// ─── Live timing — shared memory rF2/LMU (`live`) ───────────────────────────

export interface LiveWheel {
  temp: number; // carcasse °C
  temp3: [number, number, number]; // gauche/centre/droite °C
  inner_temp: number; // couche interne °C
  wear: number; // % gomme restante
  brake_temp: number; // °C (-1 = non significatif)
  pressure: number; // kPa
  camber: number; // degrés
  grip_fract: number;
  surface: number;
  flat: boolean;
  detached: boolean;
}

export interface LiveTelemetry {
  gear: number;
  max_gears: number;
  rpm: number;
  max_rpm: number;
  speed_kmh: number;
  throttle: number;
  brake: number;
  steering: number;
  clutch: number;
  fuel: number;
  fuel_capacity: number;
  fuel_consumption: number;
  fuel_laps_remaining: number;
  water_temp: number;
  oil_temp: number;
  engine_torque: number;
  turbo_boost: number;
  rear_brake_bias: number;
  speed_limiter: boolean;
  headlights: boolean;
  overheating: boolean;
  anti_stall: boolean;
  front_flap: boolean;
  rear_flap: boolean;
  front_compound: string;
  rear_compound: string;
  g_long: number;
  g_lat: number;
  g_vert: number;
  last_impact_magnitude: number;
  damage_total: number;
  damage_zones: number[];
  wheels: [LiveWheel, LiveWheel, LiveWheel, LiveWheel];
}

export interface LivePlayer {
  driver: string;
  vehicle: string;
  position: number;
  last_lap_time: number;
  best_lap_time: number;
  /** Temps écoulé sur le tour en cours (rF2 `mTimeIntoLap`). 0 si non en piste. */
  current_lap_time: number;
  last_sectors: [number, number, number];
  best_sectors: [number, number, number];
  lap_delta: number;
  total_laps: number;
  num_pitstops: number;
  num_penalties: number;
  pit_state: number;
  flag: number;
  finish_status: number;
}

export interface LiveStanding {
  position: number;
  class_position: number;
  driver: string;
  vehicle_name: string;
  vehicle_class: string;
  last_lap_time: number;
  best_lap_time: number;
  time_behind_leader: number;
  laps_behind_leader: number;
  time_behind_next: number;
  is_player: boolean;
  in_pits: boolean;
  current_sector: number;
  last_s1: number;
  last_s2: number;
  last_s3: number;
  is_class_best_lap: boolean;
  is_class_best_s1: boolean;
  is_class_best_s2: boolean;
  is_class_best_s3: boolean;
  total_laps: number;
  num_pitstops: number;
  num_penalties: number;
  pos_x: number;
  pos_z: number;
  finish_status: number;
}

export interface LiveSession {
  track: string;
  session: number;
  session_time: number;
  max_laps: number;
  num_vehicles: number;
}

export interface LiveWeather {
  air_temp: number;
  track_temp: number;
  wind_speed: number;
  rain: number;
}

export interface LiveFlags {
  game_phase: number;
  yellow_flag_state: number;
  sector_flags: [number, number, number];
}

export interface LiveExtended {
  tc: number;
  abs: number;
  stability_control: number;
  auto_shift: number;
  auto_clutch: number;
  fuel_mult: number;
  tire_mult: number;
  pit_speed_limit: number;
  status_message: string;
  damage_max_impact: number;
  damage_accum_impact: number;
}

export interface TrackBounds {
  min_x: number;
  max_x: number;
  min_z: number;
  max_z: number;
}

export interface LiveData {
  connected: boolean;
  telemetry: LiveTelemetry | null;
  player: LivePlayer | null;
  session: LiveSession | null;
  standings: LiveStanding[];
  weather: LiveWeather | null;
  flags: LiveFlags | null;
  extended: LiveExtended | null;
  track_layout: TrackBounds | null;
  track_points: [number, number][];
}

// ─── Commandes système ──────────────────────────────────────────────────────

export const system = {
  getAppVersion: () => invoke<string>("get_app_version"),
  getPlatform: () => invoke<PlatformInfo>("get_platform"),
  ping: (message: string) => invoke<string>("ping", { message }),
  /** Vérifie si rFactor2SharedMemoryMapPlugin64.dll est présent dans <lmuPath>/Plugins/. */
  checkPluginInstalled: (lmuPath: string) =>
    invoke<boolean>("check_plugin_installed", { lmuPath }),
};

// ─── Configuration + détection du jeu ───────────────────────────────────────

export const config = {
  get: (key: string) => invoke<string | null>("get_config", { key }),
  set: (key: string, value: string) =>
    invoke<void>("set_config", { key, value }),
  getAll: () => invoke<Record<string, string>>("get_all_config"),
  detectLmu: () => invoke<DetectResult>("detect_lmu"),
  inspectLmu: (lmuPath: string) =>
    invoke<DetectResult>("inspect_lmu", { lmuPath }),
};

// ─── Indexation ─────────────────────────────────────────────────────────────

export const indexer = {
  /** Configure chemin + joueur puis indexe tout. */
  runSetup: (lmuPath: string, playerName: string) =>
    invoke<IndexReport>("run_setup", { lmuPath, playerName }),
  /** Sync delta à partir du dossier déjà configuré. */
  syncIndex: () => invoke<IndexReport>("sync_index"),
  /** Réindexation complète. */
  reindexAll: () => invoke<IndexReport>("reindex_all"),
  /** Vide le cache d'indexation. */
  clearCache: () => invoke<void>("clear_index_cache"),
  /**
   * Purge les sessions sans aucun tour ; renvoie le nombre de XML supprimés.
   * `purgeType = "global"` (défaut) : `has_any_laps = 0` ; `"player"` : aucun
   * tour du joueur (cf. V1 `_scan_empty_sessions`).
   */
  purgeEmptySessions: (purgeType: "global" | "player" = "global") =>
    invoke<number>("purge_empty_sessions", { purgeType }),
  /** Compte les sessions sans aucun tour (selon le mode global / joueur). */
  countEmptySessions: (purgeType: "global" | "player" = "global") =>
    invoke<number>("count_empty_sessions", { purgeType }),
};

// ─── Requêtes Dashboard / Sessions ──────────────────────────────────────────

export const queries = {
  getDashboardStats: () => invoke<DashboardStats>("get_dashboard_stats"),
  getBestLaps: () => invoke<BestLapRow[]>("get_best_laps"),
  getFilterOptions: () => invoke<FilterOptions>("get_filter_options"),
  getGameVersions: () => invoke<string[]>("get_game_versions"),
  getSessionsList: (
    filters: SessionFilters,
    sortBy: string,
    sortDir: "asc" | "desc",
    page: number,
    perPage: number
  ) =>
    invoke<SessionsPage>("get_sessions_list", {
      filters,
      sortBy,
      sortDir,
      page,
      perPage,
    }),
  getSessionsOverview: () =>
    invoke<SessionsOverview>("get_sessions_overview"),
  getSessionDetail: (sessionId: number) =>
    invoke<SessionDetail>("get_session_detail", { sessionId }),
  getLapChartData: (sessionId: number) =>
    invoke<LapChartData>("get_lap_chart_data", { sessionId }),
  getChartCompareSessions: (sessionId: number) =>
    invoke<ChartCompareSession[]>("get_chart_compare_sessions", { sessionId }),
};

// ─── Records personnels ─────────────────────────────────────────────────────

export const records = {
  /** Vue d'ensemble : 1 ligne par combo circuit/voiture.
   *  `minVersion` : si fourni, seules les sessions avec `game_version >= minVersion` entrent dans le calcul.
   */
  getOverview: (minVersion?: string | null) =>
    invoke<RecordOverviewRow[]>("get_records_overview", {
      minVersion: minVersion ?? null,
    }),
  /** Progression détaillée d'un combo (historique des sessions). */
  getProgression: (filters: ProgressionFilters) =>
    invoke<RecordProgression>("get_record_progression", { filters }),
};

// ─── Garage — configurations de voiture (.svm) ──────────────────────────────

export const setups = {
  /** Scanne le dossier `Settings` du jeu et reconstruit la base des setups. */
  scan: (lmuPath: string) =>
    invoke<SetupGroup[]>("scan_setups", { lmuPath }),
  /** Liste les setups déjà en base (groupés voiture → circuit). */
  list: () => invoke<SetupGroup[]>("list_setups"),
  get: (id: number) => invoke<SetupEntry>("get_setup", { id }),
  getContent: (id: number) =>
    invoke<SvmFile>("get_setup_content", { id }),
  update: (payload: UpdateSetupPayload) =>
    invoke<void>("update_setup", { payload }),
  duplicate: (id: number, newName: string) =>
    invoke<SetupEntry>("duplicate_setup", { id, newName }),
  setType: (id: number, setupType: string) =>
    invoke<void>("set_setup_type", { id, setupType }),
  /** Met à jour les notes pilote (annotation utilisateur, tous setups). */
  setNotes: (id: number, notes: string) =>
    invoke<void>("set_setup_notes", { id, notes }),
  create: (
    lmuPath: string,
    circuit: string,
    name: string,
    vehicleClass: string,
    setupType?: string,
    notes?: string,
    linkedSessionId?: number | null
  ) =>
    invoke<SetupEntry>("create_setup", {
      lmuPath,
      circuit,
      name,
      vehicleClass,
      setupType: setupType ?? null,
      notes: notes ?? null,
      linkedSessionId: linkedSessionId ?? null,
    }),
  /** Cherche des sessions du joueur pour servir de meilleur tour lié au setup.
   *  `bestOnly` (défaut: true) : 1 seul meilleur tour par circuit unique.
   *  `bestOnly = false` : toutes les sessions (comparer tous les setups). */
  searchSessionsForSetup: (
    car: string,
    circuit?: string | null,
    bestOnly: boolean = true,
  ) =>
    invoke<SetupSessionMatch[]>("search_sessions_for_setup", {
      car,
      circuit: circuit ?? null,
      bestOnly,
    }),
  /** Lie/délie une session de référence à un setup (`null` = délier). */
  setLinkedSession: (setupId: number, sessionId: number | null) =>
    invoke<void>("set_setup_linked_session", { setupId, sessionId }),
  /** Retourne les setups liés à une session (vue inverse — page Race Details). */
  getForSession: (sessionId: number) =>
    invoke<SetupForSession[]>("get_setups_for_session", { sessionId }),
  /** Résumé d'une session par ID (lookup direct, sans matching). Utilisé pour
   *  afficher les infos de la session liée dans la modale d'édition setup. */
  getSessionSummary: (sessionId: number) =>
    invoke<SetupSessionMatch | null>("get_session_summary", { sessionId }),
  remove: (id: number, deleteFile: boolean) =>
    invoke<void>("delete_setup", { id, deleteFile }),
  export: (id: number, destPath: string) =>
    invoke<void>("export_setup", { id, destPath }),
  compare: (idA: number, idB: number) =>
    invoke<SetupDiffSection[]>("compare_setups", { idA, idB }),
};

// ─── Live timing ────────────────────────────────────────────────────────────

export const live = {
  /** Lit une fois les données de télémétrie/scoring. */
  getData: () => invoke<LiveData>("get_live_data"),
  /** Vérifie si la mémoire partagée du simulateur est disponible. */
  isSimRunning: () => invoke<boolean>("is_sim_running"),
  /** Démarre le polling backend ; les données arrivent via l'événement `live-data`. */
  startPolling: () => invoke<void>("start_live_polling"),
  /** Arrête le polling backend. */
  stopPolling: () => invoke<void>("stop_live_polling"),
  /** S'abonne aux mises à jour `live-data` poussées par le backend. */
  onData: (cb: (data: LiveData) => void): Promise<UnlistenFn> =>
    listen<LiveData>("live-data", (e) => cb(e.payload)),
};
