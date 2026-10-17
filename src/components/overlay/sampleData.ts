/**
 * Données live d'exemple pour les aperçus d'overlays (vignettes de la page Overlays,
 * fenêtre « Apparence »). Course multiclasse sur un circuit fictif : voitures qui
 * roulent, pédales qui bougent, un record de classe en S2 toutes les ~4 s. Aucune
 * donnée réelle : tout est calculé à partir de `tick` (un pas ≈ 50 ms).
 */

import type { LiveData } from "@/lib/api";

const TRACK_LEN = 5000;
const N = 200;

/** Tracé fictif (m) : ovale déformé, assez tourmenté pour ressembler à un circuit. */
const TRACK: [number, number][] = Array.from({ length: N }, (_, i) => {
  const a = (i / N) * Math.PI * 2;
  return [Math.cos(a) * 900 + Math.cos(3 * a) * 140, Math.sin(a) * 420 + Math.sin(2 * a) * 90];
});

/** Position (x, z) à une fraction de tour, décalée latéralement de `side` mètres. */
function at(u: number, side = 0): [number, number] {
  const f = ((u % 1) + 1) % 1;
  const i = Math.floor(f * N);
  const [x0, z0] = TRACK[i];
  const [x1, z1] = TRACK[(i + 1) % N];
  const k = f * N - i;
  const x = x0 + (x1 - x0) * k;
  const z = z0 + (z1 - z0) * k;
  const len = Math.hypot(x1 - x0, z1 - z0) || 1;
  return [x + (-(z1 - z0) / len) * side, z + ((x1 - x0) / len) * side];
}

interface Car {
  driver: string;
  cls: string;
  /** Avance sur le tour (fraction) par rapport au joueur. */
  off: number;
  side?: number;
  best: number;
  me?: boolean;
}

const CARS: Car[] = [
  { driver: "A. Leclerc", cls: "Hypercar", off: 0.21, best: 208.1 },
  { driver: "M. Rossi", cls: "Hypercar", off: 0.12, best: 208.6 },
  { driver: "K. Novak", cls: "Hypercar", off: 0.004, side: 3.5, best: 209.3 },
  { driver: "J. Weber", cls: "LMP2", off: 0.03, best: 214.0 },
  { driver: "Moi", cls: "LMP2", off: 0, best: 214.3, me: true },
  { driver: "T. Laurent", cls: "LMP2", off: -0.005, best: 214.9 },
  { driver: "S. Martin", cls: "GT3", off: -0.18, best: 225.2 },
  { driver: "L. Bianchi", cls: "GT3", off: -0.3, best: 225.8 },
];

export function sampleLiveData(tick: number): LiveData {
  const u0 = 0.3 + tick * 0.0009; // ~55 s le tour à 20 pas / s : assez vif pour la vignette
  const record = Math.floor(tick / 80);
  const s2 = 40.1 - record * 0.012;
  const th = Math.max(0, Math.sin(tick / 9));
  const br = Math.max(0, -Math.sin(tick / 9));

  const classPos: Record<string, number> = {};
  const standings = CARS.map((c, i) => {
    classPos[c.cls] = (classPos[c.cls] ?? 0) + 1;
    const [x, z] = at(u0 + c.off, c.side ?? 0);
    return {
      id: i + 1,
      position: i + 1,
      class_position: classPos[c.cls],
      driver: c.driver,
      vehicle_name: c.driver,
      vehicle_class: c.cls,
      last_lap_time: c.best + 0.4,
      best_lap_time: c.best,
      time_behind_leader: i * 1.7,
      laps_behind_leader: 0,
      time_behind_next: i ? 1.7 : 0,
      is_player: !!c.me,
      in_pits: false,
      current_sector: 1,
      last_s1: 30.4,
      last_s2: s2,
      last_s3: 33.2,
      is_class_best_lap: classPos[c.cls] === 1,
      is_class_best_s1: false,
      is_class_best_s2: !!c.me,
      is_class_best_s3: false,
      total_laps: 12,
      num_pitstops: 1,
      num_penalties: 0,
      pos_x: x,
      pos_z: z,
      lap_dist: (((u0 + c.off) % 1) + 1) % 1 * TRACK_LEN,
      finish_status: 0,
    };
  });

  const wheel = (temp: number, wear: number) => ({
    temp,
    temp3: [temp - 3, temp, temp + 2],
    inner_temp: temp + 6,
    wear,
    brake_temp: 380 + br * 320,
    pressure: 168,
    camber: -2.8,
    grip_fract: br > 0.75 ? 0.85 : 1,
    surface: 0,
    flat: false,
    detached: false,
    rotation: 60,
    lat_patch_vel: 0,
    long_patch_vel: 0,
    slip: 0,
  });

  return {
    connected: true,
    paused: false,
    session: {
      track: "Sample",
      session: 10,
      session_time: 1200 + tick * 0.05,
      end_et: 3600,
      max_laps: 2147483647,
      num_vehicles: CARS.length,
      track_length: TRACK_LEN,
      game_phase: 5,
    },
    player: {
      driver: "Moi",
      vehicle: "LMP2",
      position: 5,
      last_lap_time: 214.7,
      best_lap_time: 214.3,
      current_lap_time: 80 + (tick % 2000) * 0.05,
      last_sectors: [30.52, s2, 33.08],
      best_sectors: [30.4, s2, 33.0],
      lap_delta: Math.sin(tick / 25) * 0.6,
      total_laps: 12,
      num_pitstops: 1,
      num_penalties: 0,
      pit_state: 0,
      flag: 0,
      finish_status: 0,
    },
    telemetry: {
      gear: th > 0.5 ? 5 : 3,
      max_gears: 6,
      rpm: 6500 + 2200 * th,
      max_rpm: 9000,
      speed_kmh: 160 + 110 * th,
      lap_dist: standings[4].lap_dist,
      lap_dist_est: standings[4].lap_dist,
      throttle: th,
      brake: br,
      steering: Math.sin(tick / 14) * 0.4,
      clutch: 0,
      fuel: 42.6,
      fuel_capacity: 75,
      fuel_consumption: 2.9,
      fuel_laps_remaining: 14.6,
      water_temp: 92,
      oil_temp: 104,
      engine_torque: 520,
      turbo_boost: 0,
      rear_brake_bias: 0.46,
      speed_limiter: false,
      headlights: false,
      overheating: false,
      anti_stall: false,
      g_lat: Math.sin(tick / 14) * 2.1,
      g_long: br * -2.6 + th * 0.6,
      damage_total: 0,
      last_impact_magnitude: 0,
      wheels: [wheel(88, 92), wheel(91, 90), wheel(84, 94), wheel(86, 93)],
    },
    weather: { air_temp: 22, track_temp: 31, wind_speed: 8.4, wind_dir_deg: 120, rain: 0, path_wetness_avg: 0, path_wetness_max: 0 },
    flags: { game_phase: 5, yellow_flag_state: 0, sector_flags: [0, 0, 0] },
    extended: {
      tc: 4,
      abs: 2,
      tc_max: 11,
      abs_max: 9,
      tc_slip: 3,
      tc_slip_max: 8,
      tc_cut: 5,
      tc_cut_max: 10,
      virtual_energy: 0.62,
      lift_coast: th < 0.05 && br < 0.05 ? 1 : 0,
      track_limits: 1,
      track_limits_per_penalty: 4,
      pit_speed_limit: 16.7,
      damage_accum_impact: 0,
    },
    standings,
    track_layout: null,
    track_points: TRACK,
    track_dists: TRACK.map((_, i) => (i / N) * TRACK_LEN),
    nearby: [],
    spotter_calibrated: true,
    pit_lane_points: [],
  } as unknown as LiveData;
}
