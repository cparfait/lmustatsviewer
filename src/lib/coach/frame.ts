/**
 * Trame normalisée du coach par virage (COACH-LIVE-SPEC.md §4).
 *
 * Adapte un instantané `LiveData` brut (flux `live-data`, 20 Hz) en une trame
 * aux **unités homogènes** attendues par le moteur. C'est le seul point du coach
 * qui connaît le schéma `LiveData` : le moteur (`engine.ts`) ne dépend que de
 * `CoachFrame`, ce qui le rend pur et rejouable hors Tauri (tests §14).
 *
 * Normalisations appliquées (les canaux live sont des fractions/valeurs brutes) :
 * - `brake`, `throttle` : fraction [0,1] → **pourcents [0,100]** (les seuils du
 *   coach et de `detectCorners` raisonnent en %). Cf. bug d'unités §0.4.
 * - `steer` : conservé brut [-1,1] (négatif = gauche).
 * - `dist` : **`lap_dist_est`** (dead-reckoning, ~±1 m) et non `lap_dist`
 *   (scoring ~5 Hz, ~±17 m) — prérequis P0.2 pour toute mesure par position.
 */

import type { LiveData } from "@/lib/api";

/** Une trame de pilotage prête pour le moteur (unités homogènes). */
export interface CoachFrame {
  /** Combo logique (circuit × modèle de voiture) — clé de réf coach (§3.1). */
  track: string;
  carModel: string;
  carClass: string;
  gameBuild: string;

  /** Type de session rF2/LMU (`session`) — mode par défaut du coach (§8). */
  sessionNum: number;
  /** Numéro de tour (rF2 `total_laps`) — franchissement de ligne. */
  lapNum: number;
  /** Temps écoulé sur le tour courant (s) ; 0 hors piste. */
  lapTime: number;
  /** Temps du dernier tour bouclé (s). */
  lastLapTime: number;

  /** Distance curviligne sur le tour (m, dead-reckoning). */
  dist: number;
  /** Horodatage sim de la trame (s) — pas de temps réels entre trames. */
  elapsed: number;

  // ── 8 canaux du tampon (ordre fixe §3.1) ──
  speed: number; // km/h
  brake: number; // %  (0-100)
  throttle: number; // %  (0-100)
  steer: number; // [-1,1]
  gLat: number; // g
  gLong: number; // g
  gear: number;

  // ── Contexte (inhibiteurs §6 / éligibilité §3.2, exploités en P1.3/P2) ──
  connected: boolean;
  paused: boolean;
  inPits: boolean;
  gapAhead: number;
  gapBehind: number;
  /** Un drapeau jaune (FCY ou secteur local) est présent → tour non éligible réf (§3.2). */
  yellow: boolean;
  /** Pneus dans la fenêtre de fonctionnement (pas d'out-lap froid) → éligibilité réf (§3.2). */
  tiresReady: boolean;
  /** Compteur cumulé de coupures de piste (`extended.track_limits`) — delta sur fenêtre. */
  trackLimits: number;
  /** Une roue à plat ou détachée → virage muet (§6). */
  wheelFlat: boolean;
  /** Gomme restante mini des 4 roues (%) — < 30 % élargit les seuils (§6). */
  minWear: number;
  /** Map TC courante (réglage `extended.tc`) — comparée à la réf (verdicts blocage/patinage). */
  tcMap: number;
  /** Map ABS courante (réglage `extended.abs`). */
  absMap: number;
  /** Anti-calage actif → tête-à-queue probable, tour muet (§6). */
  antiStall: boolean;
  /** Magnitude du dernier impact — au-delà d'un seuil, taint (§6). */
  impact: number;
}

/** Seuil de carcasse (°C) sous lequel les pneus sont jugés hors fenêtre (out-lap froid). */
const TIRE_MIN_C = 60;

/**
 * Extrait une `CoachFrame` d'un instantané `LiveData`, ou `null` si la trame est
 * inexploitable (déconnecté, en pause, sans télémétrie/joueur).
 */
export function frameFromLive(data: LiveData | null): CoachFrame | null {
  if (!data || !data.connected || data.paused) return null;
  const tel = data.telemetry;
  const p = data.player;
  if (!tel || !p) return null;

  const me = data.standings.find((s) => s.is_player) ?? null;
  const ext = data.extended;
  const flags = data.flags;

  // Jaune = FCY global ou drapeau local sur un secteur (§3.2).
  const yellow =
    (flags?.yellow_flag_state ?? 0) > 0 ||
    (flags?.sector_flags?.some((s) => s > 0) ?? false);

  // Pneus en fenêtre : carcasse mini des 4 roues ≥ seuil. Heuristique conservatrice
  // (attrape l'out-lap froid, tolère le chaud) en attendant des fenêtres par gomme (P3).
  const tiresReady =
    tel.wheels.length === 4 && tel.wheels.every((w) => w.temp >= TIRE_MIN_C);
  const wheelFlat = tel.wheels.some((w) => w.flat || w.detached);
  const minWear = tel.wheels.length
    ? Math.min(...tel.wheels.map((w) => w.wear))
    : 100;

  return {
    track: data.session?.track ?? "",
    carModel: me?.vehicle_name ?? p.vehicle ?? "",
    carClass: me?.vehicle_class ?? "",
    gameBuild: ext?.game_version ?? "",

    sessionNum: data.session?.session ?? 0,
    lapNum: p.total_laps,
    lapTime: p.current_lap_time,
    lastLapTime: p.last_lap_time,

    dist: tel.lap_dist_est > 0 ? tel.lap_dist_est : tel.lap_dist,
    // `m_elapsed_time` n'est pas exposé côté front : on approxime l'horloge sim
    // par le temps de session, monotone à 20 Hz. Suffisant pour la fenêtre de
    // fraîcheur ; le dead-reckoning fin est déjà fait côté Rust (P0.2).
    elapsed: data.session?.session_time ?? 0,

    speed: tel.speed_kmh,
    brake: tel.brake * 100,
    throttle: tel.throttle * 100,
    steer: tel.steering,
    gLat: tel.g_lat,
    gLong: tel.g_long,
    gear: tel.gear,

    connected: data.connected,
    paused: data.paused,
    inPits: me?.in_pits ?? false,
    gapAhead: ext?.gap_ahead ?? 999,
    gapBehind: ext?.gap_behind ?? 999,
    yellow,
    tiresReady,
    trackLimits: ext?.track_limits ?? 0,
    wheelFlat,
    minWear,
    tcMap: ext?.tc ?? 0,
    absMap: ext?.abs ?? 0,
    antiStall: tel.anti_stall,
    impact: tel.last_impact_magnitude,
  };
}
