//! Live timing — lecture de la mémoire partagée rFactor2 / Le Mans Ultimate.
//!
//! Les structures sont transcrites **fidèlement** depuis `rF2data.py` (la
//! référence de la V1), en `#[repr(C, packed(4))]`. On lit chaque structure
//! avec `read_unaligned` → aucun offset calculé à la main (source de bugs).

use std::collections::HashMap;
use std::fs;
use std::mem::{offset_of, size_of};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::error::AppError;

const TELEMETRY_MAP: &str = "$rFactor2SMMP_Telemetry$";
const SCORING_MAP: &str = "$rFactor2SMMP_Scoring$";
const EXTENDED_MAP: &str = "$rFactor2SMMP_Extended$";
const MAX_VEH: usize = 128;

// ═══════════════════════════════════════════════════════════════════════════
// Structures de la mémoire partagée (transcription de rF2data.py, _pack_ = 4)
// ═══════════════════════════════════════════════════════════════════════════

#[repr(C, packed(4))]
#[derive(Clone, Copy)]
struct Vec3 {
    x: f64,
    y: f64,
    z: f64,
}

#[repr(C, packed(4))]
#[derive(Clone, Copy)]
struct Wheel {
    m_suspension_deflection: f64,
    m_ride_height: f64,
    m_susp_force: f64,
    m_brake_temp: f64,
    m_brake_pressure: f64,
    m_rotation: f64,
    m_lateral_patch_vel: f64,
    m_longitudinal_patch_vel: f64,
    m_lateral_ground_vel: f64,
    m_longitudinal_ground_vel: f64,
    m_camber: f64,
    m_lateral_force: f64,
    m_longitudinal_force: f64,
    m_tire_load: f64,
    m_grip_fract: f64,
    m_pressure: f64,
    m_temperature: [f64; 3],
    m_wear: f64,
    m_terrain_name: [u8; 16],
    m_surface_type: u8,
    m_flat: u8,
    m_detached: u8,
    m_static_undeflected_radius: u8,
    m_vertical_tire_deflection: f64,
    m_wheel_y_location: f64,
    m_toe: f64,
    m_tire_carcass_temperature: f64,
    m_tire_inner_layer_temperature: [f64; 3],
    m_expansion: [u8; 24],
}

#[repr(C, packed(4))]
#[derive(Clone, Copy)]
struct VehicleTelemetry {
    m_id: i32,
    m_delta_time: f64,
    m_elapsed_time: f64,
    m_lap_number: i32,
    m_lap_start_et: f64,
    m_vehicle_name: [u8; 64],
    m_track_name: [u8; 64],
    m_pos: Vec3,
    m_local_vel: Vec3,
    m_local_accel: Vec3,
    m_ori: [Vec3; 3],
    m_local_rot: Vec3,
    m_local_rot_accel: Vec3,
    m_gear: i32,
    m_engine_rpm: f64,
    m_engine_water_temp: f64,
    m_engine_oil_temp: f64,
    m_clutch_rpm: f64,
    m_unfiltered_throttle: f64,
    m_unfiltered_brake: f64,
    m_unfiltered_steering: f64,
    m_unfiltered_clutch: f64,
    m_filtered_throttle: f64,
    m_filtered_brake: f64,
    m_filtered_steering: f64,
    m_filtered_clutch: f64,
    m_steering_shaft_torque: f64,
    m_front_3rd_deflection: f64,
    m_rear_3rd_deflection: f64,
    m_front_wing_height: f64,
    m_front_ride_height: f64,
    m_rear_ride_height: f64,
    m_drag: f64,
    m_front_downforce: f64,
    m_rear_downforce: f64,
    m_fuel: f64,
    m_engine_max_rpm: f64,
    m_scheduled_stops: u8,
    m_overheating: u8,
    m_detached: u8,
    m_headlights: u8,
    m_dent_severity: [u8; 8],
    m_last_impact_et: f64,
    m_last_impact_magnitude: f64,
    m_last_impact_pos: Vec3,
    m_engine_torque: f64,
    m_current_sector: i32,
    m_speed_limiter: u8,
    m_max_gears: u8,
    m_front_tire_compound_index: u8,
    m_rear_tire_compound_index: u8,
    m_fuel_capacity: f64,
    m_front_flap_activated: u8,
    m_rear_flap_activated: u8,
    m_rear_flap_legal_status: u8,
    m_ignition_starter: u8,
    m_front_tire_compound_name: [u8; 18],
    m_rear_tire_compound_name: [u8; 18],
    m_speed_limiter_available: u8,
    m_anti_stall_activated: u8,
    m_unused: [u8; 2],
    m_visual_steering_wheel_range: f32,
    m_rear_brake_bias: f64,
    m_turbo_boost_pressure: f64,
    m_physics_to_graphics_offset: [f32; 3],
    m_physical_steering_wheel_range: f32,
    m_expansion: [u8; 152],
    m_wheels: [Wheel; 4],
}

#[repr(C, packed(4))]
#[derive(Clone, Copy)]
struct ScoringInfo {
    m_track_name: [u8; 64],
    m_session: i32,
    m_current_et: f64,
    m_end_et: f64,
    m_max_laps: i32,
    m_lap_dist: f64,
    pointer1: [u8; 8],
    m_num_vehicles: i32,
    m_game_phase: u8,
    m_yellow_flag_state: u8,
    m_sector_flag: [u8; 3],
    m_start_light: u8,
    m_num_red_lights: u8,
    m_in_realtime: u8,
    m_player_name: [u8; 32],
    m_plr_file_name: [u8; 64],
    m_dark_cloud: f64,
    m_raining: f64,
    m_ambient_temp: f64,
    m_track_temp: f64,
    m_wind: Vec3,
    m_min_path_wetness: f64,
    m_max_path_wetness: f64,
    m_game_mode: u8,
    m_is_password_protected: u8,
    m_server_port: i16,
    m_server_public_ip: i32,
    m_max_players: i32,
    m_server_name: [u8; 32],
    m_start_et: f32,
    m_avg_path_wetness: f64,
    m_expansion: [u8; 200],
    pointer2: [u8; 8],
}

#[repr(C, packed(4))]
#[derive(Clone, Copy)]
struct VehicleScoring {
    m_id: i32,
    m_driver_name: [u8; 32],
    m_vehicle_name: [u8; 64],
    m_total_laps: i16,
    m_sector: u8,
    m_finish_status: u8,
    m_lap_dist: f64,
    m_path_lateral: f64,
    m_track_edge: f64,
    m_best_sector1: f64,
    m_best_sector2: f64,
    m_best_lap_time: f64,
    m_last_sector1: f64,
    m_last_sector2: f64,
    m_last_lap_time: f64,
    m_cur_sector1: f64,
    m_cur_sector2: f64,
    m_num_pitstops: i16,
    m_num_penalties: i16,
    m_is_player: u8,
    m_control: u8,
    m_in_pits: u8,
    m_place: u8,
    m_vehicle_class: [u8; 32],
    m_time_behind_next: f64,
    m_laps_behind_next: i32,
    m_time_behind_leader: f64,
    m_laps_behind_leader: i32,
    m_lap_start_et: f64,
    m_pos: Vec3,
    m_local_vel: Vec3,
    m_local_accel: Vec3,
    m_ori: [Vec3; 3],
    m_local_rot: Vec3,
    m_local_rot_accel: Vec3,
    m_headlights: u8,
    m_pit_state: u8,
    m_server_scored: u8,
    m_individual_phase: u8,
    m_qualification: i32,
    m_time_into_lap: f64,
    m_estimated_lap_time: f64,
    m_pit_group: [u8; 24],
    m_flag: u8,
    m_under_yellow: u8,
    m_count_lap_flag: u8,
    m_in_garage_stall: u8,
    m_upgrade_pack: [u8; 16],
    m_pit_lap_dist: f32,
    m_best_lap_sector1: f32,
    m_best_lap_sector2: f32,
    m_expansion: [u8; 48],
}

#[repr(C, packed(4))]
#[derive(Clone, Copy)]
struct PhysicsOptions {
    m_traction_control: u8,
    m_anti_lock_brakes: u8,
    m_stability_control: u8,
    m_auto_shift: u8,
    m_auto_clutch: u8,
    m_invulnerable: u8,
    m_opposite_lock: u8,
    m_steering_help: u8,
    m_braking_help: u8,
    m_spin_recovery: u8,
    m_auto_pit: u8,
    m_auto_lift: u8,
    m_auto_blip: u8,
    m_fuel_mult: u8,
    m_tire_mult: u8,
    m_mech_fail: u8,
    m_allow_pitcrew_push: u8,
    m_repeat_shifts: u8,
    m_hold_clutch: u8,
    m_auto_reverse: u8,
    m_alternate_neutral: u8,
    m_ai_control: u8,
    m_unused1: u8,
    m_unused2: u8,
    m_manual_shift_override_time: f32,
    m_auto_shift_override_time: f32,
    m_speed_sensitive_steering: f32,
    m_steer_ratio_speed: f32,
}

#[repr(C, packed(4))]
#[derive(Clone, Copy)]
struct TrackedDamage {
    m_max_impact_magnitude: f64,
    m_accumulated_impact_magnitude: f64,
}

#[repr(C, packed(4))]
#[derive(Clone, Copy)]
struct VehScoringCapture {
    m_id: i32,
    m_place: u8,
    m_is_player: u8,
    m_finish_status: u8,
}

#[repr(C, packed(4))]
#[derive(Clone, Copy)]
struct SessionTransitionCapture {
    m_game_phase: u8,
    m_session: i32,
    m_num_scoring_vehicles: i32,
    m_scoring_vehicles: [VehScoringCapture; MAX_VEH],
}

/// rF2Extended — défini jusqu'à `m_current_pit_speed_limit` (le reste inutile).
#[repr(C, packed(4))]
#[derive(Clone, Copy)]
struct Extended {
    m_version_update_begin: i32,
    m_version_update_end: i32,
    m_version: [u8; 12],
    is_64bit: u8,
    m_physics: PhysicsOptions,
    m_tracked_damages: [TrackedDamage; 512],
    m_in_realtime_fc: u8,
    m_multimedia_thread_started: u8,
    m_simulation_thread_started: u8,
    m_session_started: u8,
    m_ticks_session_started: f64,
    m_ticks_session_ended: f64,
    m_session_transition_capture: SessionTransitionCapture,
    m_displayed_message_update_capture: [u8; 128],
    m_direct_memory_access_enabled: u8,
    m_ticks_status_message_updated: f64,
    m_status_message: [u8; 128],
    m_ticks_last_history_message_updated: f64,
    m_last_history_message: [u8; 128],
    m_current_pit_speed_limit: f32,
}

// Conteneurs (jamais instanciés — uniquement pour `offset_of!`).
#[repr(C, packed(4))]
struct Telemetry {
    _begin: i32,
    _end: i32,
    _hint: i32,
    _num: i32,
    m_vehicles: [VehicleTelemetry; MAX_VEH],
}
#[repr(C, packed(4))]
struct Scoring {
    _begin: i32,
    _end: i32,
    _hint: i32,
    m_scoring_info: ScoringInfo,
    m_vehicles: [VehicleScoring; MAX_VEH],
}

// ═══════════════════════════════════════════════════════════════════════════
// Types sérialisés vers le frontend
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveWheel {
    pub temp: f32,        // carcasse °C
    pub temp3: [f32; 3],  // gauche / centre / droite °C
    pub inner_temp: f32,  // couche interne °C (moyenne)
    pub wear: f32,        // % gomme restante
    pub brake_temp: f32,  // °C (-1 si non significatif à l'arrêt)
    pub pressure: f32,    // kPa
    pub camber: f32,      // degrés
    pub grip_fract: f32,
    pub surface: u8,      // 0 sec … 6 spécial
    pub flat: bool,
    pub detached: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveTelemetry {
    pub gear: i32,
    pub max_gears: i32,
    pub rpm: f32,
    pub max_rpm: f32,
    pub speed_kmh: f32,
    pub throttle: f32,
    pub brake: f32,
    pub steering: f32,
    pub clutch: f32,
    pub fuel: f32,
    pub fuel_capacity: f32,
    pub fuel_consumption: f32,
    pub fuel_laps_remaining: f32,
    pub water_temp: f32,
    pub oil_temp: f32,
    pub engine_torque: f32,
    pub turbo_boost: f32,
    pub rear_brake_bias: f32,
    pub speed_limiter: bool,
    pub headlights: bool,
    pub overheating: bool,
    pub anti_stall: bool,
    pub front_flap: bool,
    pub rear_flap: bool,
    pub front_compound: String,
    pub rear_compound: String,
    pub g_long: f32,
    pub g_lat: f32,
    pub g_vert: f32,
    pub last_impact_magnitude: f32,
    pub damage_total: f32,
    pub damage_zones: [u8; 8],
    pub wheels: [LiveWheel; 4],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LivePlayer {
    pub driver: String,
    pub vehicle: String,
    pub position: u8,
    pub last_lap_time: f32,
    pub best_lap_time: f32,
    /// Temps écoulé sur le tour en cours (rF2 `mTimeIntoLap`). 0 si non en piste.
    pub current_lap_time: f32,
    pub last_sectors: [f32; 3],
    pub best_sectors: [f32; 3],
    pub lap_delta: f32,
    pub total_laps: i32,
    pub num_pitstops: i32,
    pub num_penalties: i32,
    pub pit_state: u8,
    pub flag: u8,
    pub finish_status: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveStanding {
    pub position: u8,
    pub class_position: u8,
    pub driver: String,
    pub vehicle_name: String,
    pub vehicle_class: String,
    pub last_lap_time: f32,
    pub best_lap_time: f32,
    pub time_behind_leader: f32,
    pub laps_behind_leader: i32,
    pub time_behind_next: f32,
    pub is_player: bool,
    pub in_pits: bool,
    pub current_sector: u8,
    pub last_s1: f32,
    pub last_s2: f32,
    pub last_s3: f32,
    pub is_class_best_lap: bool,
    pub is_class_best_s1: bool,
    pub is_class_best_s2: bool,
    pub is_class_best_s3: bool,
    pub total_laps: i32,
    pub num_pitstops: i32,
    pub num_penalties: i32,
    pub pos_x: f64,
    pub pos_z: f64,
    pub finish_status: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveSession {
    pub track: String,
    pub session: i32,
    pub session_time: f64,
    pub max_laps: i32,
    pub num_vehicles: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveWeather {
    pub air_temp: f32,
    pub track_temp: f32,
    pub wind_speed: f32,
    pub rain: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveFlags {
    pub game_phase: u8,
    pub yellow_flag_state: u8,
    pub sector_flags: [u8; 3],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveExtended {
    pub tc: u8,
    pub abs: u8,
    pub stability_control: u8,
    pub auto_shift: u8,
    pub auto_clutch: u8,
    pub fuel_mult: u8,
    pub tire_mult: u8,
    pub pit_speed_limit: f32,
    pub status_message: String,
    pub damage_max_impact: f32,
    pub damage_accum_impact: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackBounds {
    pub min_x: f64,
    pub max_x: f64,
    pub min_z: f64,
    pub max_z: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveData {
    pub connected: bool,
    pub telemetry: Option<LiveTelemetry>,
    pub player: Option<LivePlayer>,
    pub session: Option<LiveSession>,
    pub standings: Vec<LiveStanding>,
    pub weather: Option<LiveWeather>,
    pub flags: Option<LiveFlags>,
    pub extended: Option<LiveExtended>,
    pub track_layout: Option<TrackBounds>,
    pub track_points: Vec<[f64; 2]>,
}

impl Default for LiveData {
    fn default() -> Self {
        LiveData {
            connected: false,
            telemetry: None,
            player: None,
            session: None,
            standings: Vec::new(),
            weather: None,
            flags: None,
            extended: None,
            track_layout: None,
            track_points: Vec::new(),
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Lecture de la mémoire partagée
// ═══════════════════════════════════════════════════════════════════════════

#[cfg(target_os = "windows")]
fn read_shm(name: &str, size: usize) -> Option<Vec<u8>> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Memory::*;

    let wide: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        let handle =
            OpenFileMappingW(FILE_MAP_READ.0, false, PCWSTR(wide.as_ptr())).ok()?;
        let view = MapViewOfFile(handle, FILE_MAP_READ, 0, 0, size);
        if view.Value.is_null() {
            let _ = windows::Win32::Foundation::CloseHandle(handle);
            return None;
        }
        let mut buf = vec![0u8; size];
        std::ptr::copy_nonoverlapping(view.Value as *const u8, buf.as_mut_ptr(), size);
        let _ = UnmapViewOfFile(view);
        let _ = windows::Win32::Foundation::CloseHandle(handle);
        Some(buf)
    }
}

#[cfg(not(target_os = "windows"))]
fn read_shm(_name: &str, _size: usize) -> Option<Vec<u8>> {
    None
}

/// Lit une structure `T` à l'offset donné dans le buffer (lecture non alignée).
unsafe fn read_at<T: Copy>(buf: &[u8], off: usize) -> Option<T> {
    if off + size_of::<T>() > buf.len() {
        return None;
    }
    Some(std::ptr::read_unaligned(buf.as_ptr().add(off) as *const T))
}

/// Le bloc de version est cohérent (écriture terminée) ?
fn version_ok(buf: &[u8]) -> bool {
    if buf.len() < 8 {
        return false;
    }
    let begin = i32::from_le_bytes(buf[0..4].try_into().unwrap());
    let end = i32::from_le_bytes(buf[4..8].try_into().unwrap());
    begin != 0 && begin == end
}

fn c_str(bytes: &[u8]) -> String {
    let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
    String::from_utf8_lossy(&bytes[..end]).trim().to_string()
}

// ═══════════════════════════════════════════════════════════════════════════
// État de polling (consommation carburant, meilleurs secteurs, tracé)
// ═══════════════════════════════════════════════════════════════════════════

struct PollState {
    last_lap_num: i32,
    fuel_at_lap_start: f64,
    lap_fuel_history: Vec<f64>,
    best_s1: f64,
    best_s2: f64,
    best_s3: f64,
    track_key: String,
    /// Bucket lapDist (20 m) → (position moyenne, nombre de passages).
    track_buckets: HashMap<i64, ([f64; 2], u32)>,
    /// Dossier de persistance des tracés (`{appdata}/tracks/`).
    tracks_dir: Option<PathBuf>,
    track_slug: String,
    frames: u32,
    last_saved: usize,
}

impl PollState {
    fn new() -> Self {
        PollState {
            last_lap_num: 0,
            fuel_at_lap_start: 0.0,
            lap_fuel_history: Vec::new(),
            best_s1: 0.0,
            best_s2: 0.0,
            best_s3: 0.0,
            track_key: String::new(),
            track_buckets: HashMap::new(),
            tracks_dir: None,
            track_slug: String::new(),
            frames: 0,
            last_saved: 0,
        }
    }
}

/// Identifiant de fichier pour un circuit (nom normalisé).
fn track_slug(name: &str) -> String {
    let s: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    s.split('_').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("_")
}

/// Charge le tracé persistant d'un circuit (sessions précédentes).
fn load_track(dir: &Path, slug: &str) -> HashMap<i64, ([f64; 2], u32)> {
    let mut map = HashMap::new();
    let path = dir.join(format!("{slug}.json"));
    if let Ok(txt) = fs::read_to_string(&path) {
        if let Ok(v) = serde_json::from_str::<HashMap<String, [f64; 2]>>(&txt) {
            for (k, p) in v {
                if let Ok(b) = k.parse::<i64>() {
                    map.insert(b, (p, 2u32)); // marqué « complet »
                }
            }
        }
    }
    map
}

/// Sauvegarde le tracé accumulé (écriture atomique).
fn save_track(dir: &Path, slug: &str, buckets: &HashMap<i64, ([f64; 2], u32)>) {
    if buckets.len() < 30 {
        return;
    }
    let m: HashMap<String, [f64; 2]> =
        buckets.iter().map(|(k, (p, _))| (k.to_string(), *p)).collect();
    if let Ok(txt) = serde_json::to_string(&m) {
        let tmp = dir.join(format!("{slug}.json.tmp"));
        let final_path = dir.join(format!("{slug}.json"));
        if fs::write(&tmp, txt).is_ok() {
            let _ = fs::rename(&tmp, &final_path);
        }
    }
}

/// Lissage d'une boucle de points (moyenne glissante circulaire).
fn smooth_loop(pts: &[[f64; 2]], win: usize) -> Vec<[f64; 2]> {
    let n = pts.len();
    if n < 8 {
        return pts.to_vec();
    }
    (0..n)
        .map(|i| {
            let (mut sx, mut sz) = (0.0, 0.0);
            let count = 2 * win + 1;
            for w in 0..count {
                let j = (i + n + w - win) % n;
                sx += pts[j][0];
                sz += pts[j][1];
            }
            [sx / count as f64, sz / count as f64]
        })
        .collect()
}

// ═══════════════════════════════════════════════════════════════════════════
// Extraction d'un instantané complet
// ═══════════════════════════════════════════════════════════════════════════

fn extract(state: &mut PollState) -> LiveData {
    let scor_buf = match read_shm(SCORING_MAP, size_of::<Scoring>()) {
        Some(b) if version_ok(&b) => b,
        _ => return LiveData::default(),
    };
    let tele_buf = read_shm(TELEMETRY_MAP, size_of::<Telemetry>())
        .filter(|b| version_ok(b));
    let ext_buf = read_shm(EXTENDED_MAP, size_of::<Extended>())
        .filter(|b| version_ok(b));

    let scor_info: ScoringInfo =
        match unsafe { read_at(&scor_buf, offset_of!(Scoring, m_scoring_info)) } {
            Some(s) => s,
            None => return LiveData::default(),
        };
    let n = (scor_info.m_num_vehicles as usize).min(MAX_VEH);
    let current_et = scor_info.m_current_et;
    if n == 0 {
        return LiveData {
            connected: true,
            ..Default::default()
        };
    }

    let veh_scor_base = offset_of!(Scoring, m_vehicles);
    let veh_scor = |i: usize| -> Option<VehicleScoring> {
        unsafe { read_at(&scor_buf, veh_scor_base + i * size_of::<VehicleScoring>()) }
    };

    // ── Joueur (scoring) ─────────────────────────────────────────────────────
    let mut player_id: i32 = -1;
    let mut player_scor: Option<VehicleScoring> = None;
    for i in 0..n {
        if let Some(v) = veh_scor(i) {
            if v.m_is_player != 0 {
                player_id = v.m_id;
                player_scor = Some(v);
                break;
            }
        }
    }

    // ── Télémétrie du joueur ─────────────────────────────────────────────────
    let mut player_tele: Option<VehicleTelemetry> = None;
    if let (Some(buf), true) = (tele_buf.as_ref(), player_id >= 0) {
        let base = offset_of!(Telemetry, m_vehicles);
        for i in 0..MAX_VEH {
            let t: Option<VehicleTelemetry> =
                unsafe { read_at(buf, base + i * size_of::<VehicleTelemetry>()) };
            match t {
                Some(t) if t.m_id == player_id => {
                    player_tele = Some(t);
                    break;
                }
                Some(_) => {}
                None => break,
            }
        }
    }

    let track_temp = scor_info.m_track_temp;

    // ── Bloc télémétrie ──────────────────────────────────────────────────────
    let telemetry = player_tele.map(|t| {
        let speed_kmh = (t.m_local_vel.z.abs() * 3.6) as f32;

        // Consommation carburant (moyenne glissante sur 5 tours).
        let lap = t.m_lap_number;
        let fuel = t.m_fuel;
        if lap > state.last_lap_num && state.fuel_at_lap_start > 0.0 {
            let used = state.fuel_at_lap_start - fuel;
            if used > 0.5 && used < 10.0 {
                state.lap_fuel_history.push(used);
                if state.lap_fuel_history.len() > 5 {
                    state.lap_fuel_history.remove(0);
                }
            }
        }
        let in_pits = player_scor.map(|p| p.m_in_pits != 0).unwrap_or(false);
        if !in_pits {
            state.fuel_at_lap_start = fuel;
        }
        let avg_conso = if state.lap_fuel_history.is_empty() {
            0.0
        } else {
            state.lap_fuel_history.iter().sum::<f64>()
                / state.lap_fuel_history.len() as f64
        };
        let laps_left = if avg_conso > 0.0 { fuel / avg_conso } else { 0.0 };

        let wheels: [LiveWheel; 4] = std::array::from_fn(|i| {
            let w = t.m_wheels[i];
            let mut bt = w.m_brake_temp as f32;
            if speed_kmh < 1.0 && bt > (track_temp as f32 + 50.0) {
                bt = -1.0;
            }
            let temp3 = w.m_temperature;
            let inner = w.m_tire_inner_layer_temperature;
            LiveWheel {
                temp: (w.m_tire_carcass_temperature - 273.15) as f32,
                temp3: [
                    (temp3[0] - 273.15) as f32,
                    (temp3[1] - 273.15) as f32,
                    (temp3[2] - 273.15) as f32,
                ],
                inner_temp: ((inner[0] + inner[1] + inner[2]) / 3.0 - 273.15) as f32,
                wear: ((1.0 - w.m_wear) * 100.0) as f32,
                brake_temp: bt,
                pressure: w.m_pressure as f32,
                camber: w.m_camber.to_degrees() as f32,
                grip_fract: w.m_grip_fract as f32,
                surface: w.m_surface_type,
                flat: w.m_flat != 0,
                detached: w.m_detached != 0,
            }
        });

        let dent = t.m_dent_severity;
        let damage_total =
            dent.iter().map(|&d| d as f32).sum::<f32>() / 16.0 * 100.0;

        LiveTelemetry {
            gear: t.m_gear,
            max_gears: t.m_max_gears as i32,
            rpm: t.m_engine_rpm as f32,
            max_rpm: t.m_engine_max_rpm as f32,
            speed_kmh,
            throttle: t.m_unfiltered_throttle as f32,
            brake: t.m_unfiltered_brake as f32,
            steering: t.m_unfiltered_steering as f32,
            clutch: t.m_unfiltered_clutch as f32,
            fuel: fuel as f32,
            fuel_capacity: t.m_fuel_capacity as f32,
            fuel_consumption: avg_conso as f32,
            fuel_laps_remaining: laps_left as f32,
            water_temp: t.m_engine_water_temp as f32,
            oil_temp: t.m_engine_oil_temp as f32,
            engine_torque: t.m_engine_torque as f32,
            turbo_boost: t.m_turbo_boost_pressure as f32,
            rear_brake_bias: t.m_rear_brake_bias as f32,
            speed_limiter: t.m_speed_limiter != 0,
            headlights: t.m_headlights != 0,
            overheating: t.m_overheating != 0,
            anti_stall: t.m_anti_stall_activated != 0,
            front_flap: t.m_front_flap_activated != 0,
            rear_flap: t.m_rear_flap_activated != 0,
            front_compound: c_str(&t.m_front_tire_compound_name),
            rear_compound: c_str(&t.m_rear_tire_compound_name),
            g_long: t.m_local_accel.z as f32,
            g_lat: t.m_local_accel.x as f32,
            g_vert: t.m_local_accel.y as f32,
            last_impact_magnitude: t.m_last_impact_magnitude as f32,
            damage_total,
            damage_zones: dent,
            wheels,
        }
    });
    state.last_lap_num = player_tele.map(|t| t.m_lap_number).unwrap_or(0);

    // ── Joueur (bloc scoring) ────────────────────────────────────────────────
    let player = player_scor.map(|p| {
        let s1 = p.m_last_sector1;
        let s2 = if p.m_last_sector2 > 0.0 && p.m_last_sector1 > 0.0 {
            p.m_last_sector2 - p.m_last_sector1
        } else {
            0.0
        };
        let s3 = if p.m_last_lap_time > 0.0 && p.m_last_sector2 > 0.0 {
            p.m_last_lap_time - p.m_last_sector2
        } else {
            0.0
        };
        if p.m_best_lap_time <= 0.0 {
            state.best_s1 = 0.0;
            state.best_s2 = 0.0;
            state.best_s3 = 0.0;
        } else {
            if s1 > 0.0 && (state.best_s1 == 0.0 || s1 < state.best_s1) {
                state.best_s1 = s1;
            }
            if s2 > 0.0 && (state.best_s2 == 0.0 || s2 < state.best_s2) {
                state.best_s2 = s2;
            }
            if s3 > 0.0 && (state.best_s3 == 0.0 || s3 < state.best_s3) {
                state.best_s3 = s3;
            }
        }
        let est = p.m_estimated_lap_time;
        let best = p.m_best_lap_time;
        let delta = if est > 0.0 && best > 0.0 && p.m_in_pits == 0 {
            est - best
        } else {
            0.0
        };
        LivePlayer {
            driver: c_str(&p.m_driver_name),
            vehicle: c_str(&p.m_vehicle_name),
            position: p.m_place,
            last_lap_time: p.m_last_lap_time as f32,
            best_lap_time: p.m_best_lap_time as f32,
            current_lap_time: if p.m_time_into_lap > 0.0 {
                p.m_time_into_lap as f32
            } else {
                0.0
            },
            last_sectors: [s1 as f32, s2 as f32, s3 as f32],
            best_sectors: [
                state.best_s1 as f32,
                state.best_s2 as f32,
                state.best_s3 as f32,
            ],
            lap_delta: delta as f32,
            total_laps: p.m_total_laps as i32,
            num_pitstops: p.m_num_pitstops as i32,
            num_penalties: p.m_num_penalties as i32,
            pit_state: p.m_pit_state,
            flag: p.m_flag,
            finish_status: p.m_finish_status,
        }
    });

    // ── Classement complet + tracé ───────────────────────────────────────────
    // Réinitialise l'accumulation du tracé si le circuit/la session change.
    let track_name = c_str(&scor_info.m_track_name);
    let session_key = format!("{}_{}", track_name, scor_info.m_session);
    if session_key != state.track_key {
        state.track_key = session_key;
        state.track_slug = track_slug(&track_name);
        // Recharge le tracé persistant du circuit (conservé entre sessions).
        state.track_buckets = match &state.tracks_dir {
            Some(dir) => load_track(dir, &state.track_slug),
            None => HashMap::new(),
        };
        state.last_saved = state.track_buckets.len();
    }

    let mut standings: Vec<LiveStanding> = Vec::new();
    let (mut min_x, mut max_x, mut min_z, mut max_z) =
        (f64::INFINITY, f64::NEG_INFINITY, f64::INFINITY, f64::NEG_INFINITY);

    for i in 0..n {
        let v = match veh_scor(i) {
            Some(v) if v.m_place > 0 => v,
            _ => continue,
        };
        let s1 = v.m_last_sector1;
        let s2 = if v.m_last_sector2 > 0.0 {
            v.m_last_sector2 - v.m_last_sector1
        } else {
            0.0
        };
        let s3 = if v.m_last_lap_time > 0.0 && v.m_last_sector2 > 0.0 {
            v.m_last_lap_time - v.m_last_sector2
        } else {
            0.0
        };
        let pos = v.m_pos;
        min_x = min_x.min(pos.x);
        max_x = max_x.max(pos.x);
        min_z = min_z.min(pos.z);
        max_z = max_z.max(pos.z);

        // Accumulation du tracé (résolution 20 m, hors stands, moyenne 2 passages).
        let lap_dist = v.m_lap_dist;
        if lap_dist > 0.0 && v.m_in_pits == 0 {
            let bucket = (lap_dist / 20.0) as i64;
            let entry = state.track_buckets.entry(bucket).or_insert(([pos.x, pos.z], 0));
            if entry.1 < 2 {
                let c = entry.1 as f64;
                entry.0 = [
                    (entry.0[0] * c + pos.x) / (c + 1.0),
                    (entry.0[1] * c + pos.z) / (c + 1.0),
                ];
                entry.1 += 1;
            }
        }

        standings.push(LiveStanding {
            position: v.m_place,
            class_position: 0,
            driver: c_str(&v.m_driver_name),
            vehicle_name: c_str(&v.m_vehicle_name),
            vehicle_class: c_str(&v.m_vehicle_class),
            last_lap_time: v.m_last_lap_time as f32,
            best_lap_time: v.m_best_lap_time as f32,
            time_behind_leader: v.m_time_behind_leader as f32,
            laps_behind_leader: v.m_laps_behind_leader,
            time_behind_next: v.m_time_behind_next as f32,
            is_player: v.m_is_player != 0,
            in_pits: v.m_in_pits != 0,
            current_sector: v.m_sector,
            last_s1: s1 as f32,
            last_s2: s2 as f32,
            last_s3: s3 as f32,
            is_class_best_lap: false,
            is_class_best_s1: false,
            is_class_best_s2: false,
            is_class_best_s3: false,
            total_laps: v.m_total_laps as i32,
            num_pitstops: v.m_num_pitstops as i32,
            num_penalties: v.m_num_penalties as i32,
            pos_x: pos.x,
            pos_z: pos.z,
            finish_status: v.m_finish_status,
        });
    }

    // Positions par classe + records de classe.
    let classes: Vec<String> =
        standings.iter().map(|s| s.vehicle_class.clone()).collect();
    for class in classes.iter().collect::<std::collections::HashSet<_>>() {
        let mut idxs: Vec<usize> = (0..standings.len())
            .filter(|&i| &standings[i].vehicle_class == class)
            .collect();
        idxs.sort_by_key(|&i| standings[i].position);
        let best = |sel: &dyn Fn(&LiveStanding) -> f32| -> f32 {
            idxs.iter()
                .map(|&i| sel(&standings[i]))
                .filter(|&v| v > 0.0)
                .fold(f32::INFINITY, f32::min)
        };
        let bl = best(&|s| s.best_lap_time);
        let b1 = best(&|s| s.last_s1);
        let b2 = best(&|s| s.last_s2);
        let b3 = best(&|s| s.last_s3);
        for (rank, &i) in idxs.iter().enumerate() {
            let s = &mut standings[i];
            s.class_position = (rank + 1) as u8;
            s.is_class_best_lap = s.best_lap_time > 0.0 && s.best_lap_time == bl;
            s.is_class_best_s1 = s.last_s1 > 0.0 && s.last_s1 == b1;
            s.is_class_best_s2 = s.last_s2 > 0.0 && s.last_s2 == b2;
            s.is_class_best_s3 = s.last_s3 > 0.0 && s.last_s3 == b3;
        }
    }
    standings.sort_by_key(|s| s.position);

    let track_layout = if min_x.is_finite() {
        Some(TrackBounds {
            min_x,
            max_x,
            min_z,
            max_z,
        })
    } else {
        None
    };
    let mut sorted: Vec<(i64, [f64; 2])> = state
        .track_buckets
        .iter()
        .map(|(&k, &(p, _))| (k, p))
        .collect();
    sorted.sort_by_key(|(k, _)| *k);
    let raw_points: Vec<[f64; 2]> = sorted.into_iter().map(|(_, p)| p).collect();
    let track_points = smooth_loop(&raw_points, 1);

    // Persistance périodique du tracé (toutes les ~3 s, si enrichi).
    state.frames = state.frames.wrapping_add(1);
    if let Some(dir) = &state.tracks_dir {
        if state.frames % 60 == 0 && state.track_buckets.len() > state.last_saved + 10 {
            save_track(dir, &state.track_slug, &state.track_buckets);
            state.last_saved = state.track_buckets.len();
        }
    }

    // ── Extended ─────────────────────────────────────────────────────────────
    let extended = ext_buf.as_ref().and_then(|buf| {
        let physics: PhysicsOptions =
            unsafe { read_at(buf, offset_of!(Extended, m_physics))? };
        let pit_speed: f32 =
            unsafe { read_at(buf, offset_of!(Extended, m_current_pit_speed_limit))? };
        let status: [u8; 128] =
            unsafe { read_at(buf, offset_of!(Extended, m_status_message))? };
        let (dmg_max, dmg_accum) = if player_id >= 0 && (player_id as usize) < 512 {
            let off = offset_of!(Extended, m_tracked_damages)
                + (player_id as usize) * size_of::<TrackedDamage>();
            unsafe {
                read_at::<TrackedDamage>(buf, off)
                    .map(|d| {
                        (
                            d.m_max_impact_magnitude as f32,
                            d.m_accumulated_impact_magnitude as f32,
                        )
                    })
                    .unwrap_or((0.0, 0.0))
            }
        } else {
            (0.0, 0.0)
        };
        Some(LiveExtended {
            tc: physics.m_traction_control,
            abs: physics.m_anti_lock_brakes,
            stability_control: physics.m_stability_control,
            auto_shift: physics.m_auto_shift,
            auto_clutch: physics.m_auto_clutch,
            fuel_mult: physics.m_fuel_mult,
            tire_mult: physics.m_tire_mult,
            pit_speed_limit: pit_speed,
            status_message: c_str(&status),
            damage_max_impact: dmg_max,
            damage_accum_impact: dmg_accum,
        })
    });

    let wind = scor_info.m_wind;
    LiveData {
        connected: true,
        telemetry,
        player,
        session: Some(LiveSession {
            track: track_name,
            session: scor_info.m_session,
            session_time: current_et,
            max_laps: scor_info.m_max_laps,
            num_vehicles: n as i32,
        }),
        standings,
        weather: Some(LiveWeather {
            air_temp: scor_info.m_ambient_temp as f32,
            track_temp: track_temp as f32,
            wind_speed: ((wind.x * wind.x + wind.y * wind.y + wind.z * wind.z).sqrt()
                * 3.6) as f32,
            rain: scor_info.m_raining as f32,
        }),
        flags: Some(LiveFlags {
            game_phase: scor_info.m_game_phase,
            yellow_flag_state: scor_info.m_yellow_flag_state,
            sector_flags: scor_info.m_sector_flag,
        }),
        extended,
        track_layout,
        track_points,
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Commandes Tauri
// ═══════════════════════════════════════════════════════════════════════════

static LIVE_POLLING: AtomicBool = AtomicBool::new(false);
static POLL_STATE: Mutex<Option<PollState>> = Mutex::new(None);

#[tauri::command]
pub fn get_live_data() -> Result<LiveData, AppError> {
    let mut guard = POLL_STATE
        .lock()
        .map_err(|e| AppError::Internal(format!("live state lock: {e}")))?;
    let state = guard.get_or_insert_with(PollState::new);
    Ok(extract(state))
}

#[tauri::command]
pub fn is_sim_running() -> Result<bool, AppError> {
    Ok(read_shm(SCORING_MAP, 8)
        .map(|b| version_ok(&b))
        .unwrap_or(false))
}

#[tauri::command]
pub fn start_live_polling(app: AppHandle) -> Result<(), AppError> {
    if LIVE_POLLING.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    // Dossier de persistance des tracés de circuit.
    let tracks_dir = app
        .path()
        .app_data_dir()
        .ok()
        .map(|d| d.join("tracks"));
    if let Some(d) = &tracks_dir {
        let _ = fs::create_dir_all(d);
    }
    std::thread::spawn(move || {
        let mut state = PollState::new();
        state.tracks_dir = tracks_dir;
        while LIVE_POLLING.load(Ordering::SeqCst) {
            let data = extract(&mut state);
            if app.emit("live-data", &data).is_err() {
                break;
            }
            let delay = if data.connected { 50 } else { 600 };
            std::thread::sleep(Duration::from_millis(delay));
        }
        LIVE_POLLING.store(false, Ordering::SeqCst);
    });
    Ok(())
}

#[tauri::command]
pub fn stop_live_polling() -> Result<(), AppError> {
    LIVE_POLLING.store(false, Ordering::SeqCst);
    Ok(())
}
