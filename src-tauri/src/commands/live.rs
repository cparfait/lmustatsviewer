//! Live timing — lecture de la mémoire partagée rFactor2 / Le Mans Ultimate.
//!
//! Les structures sont transcrites **fidèlement** depuis `rF2data.py` (la
//! référence de la V1), en `#[repr(C, packed(4))]`. On lit chaque structure
//! avec `read_unaligned` → aucun offset calculé à la main (source de bugs).

use std::collections::HashMap;
use std::fs;
use std::mem::{offset_of, size_of};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::error::AppError;

const TELEMETRY_MAP: &str = "$rFactor2SMMP_Telemetry$";
const SCORING_MAP: &str = "$rFactor2SMMP_Scoring$";
const EXTENDED_MAP: &str = "$rFactor2SMMP_Extended$";
const MAX_VEH: usize = 128;

// ── Mémoire partagée NATIVE LMU (« LMU_Data ») ───────────────────────────────
// Distincte du plugin rF2 standard : c'est l'interface intégrée de LMU (header
// S397 `Support\SharedMemoryInterface`). Seule source des **maps électroniques
// embarquées** (ABS/TC réels réglés au volant), absentes du bloc rF2.
// Offsets calculés depuis le mapping officiel (cf. pyLMUSharedMemory) ; vérifiés
// par `ctypes.sizeof(LMUObjectOut) == 324820`. Lecture par offsets bruts pour
// éviter de transcrire les ~324 Ko de structures.
const LMU_DATA_MAP: &str = "LMU_Data";
const LMU_DATA_SIZE: usize = 324820; // sizeof(LMUObjectOut)
const LMU_TELEM_BASE: usize = 128464; // offset du bloc `telemetry` (LMUTelemetryData)
const LMU_PLAYER_IDX_OFF: usize = LMU_TELEM_BASE + 1; // playerVehicleIdx : u8
const LMU_PLAYER_HAS_OFF: usize = LMU_TELEM_BASE + 2; // playerHasVehicle : bool
const LMU_TELEMINFO_OFF: usize = LMU_TELEM_BASE + 4; // début de l'array telemInfo
const LMU_VEH_STRIDE: usize = 1888; // sizeof(LMUVehicleTelemetry)
// Offsets dans une LMUVehicleTelemetry (u8 sauf indication).
const LMU_OFF_TC: usize = 750;
const LMU_OFF_TC_MAX: usize = 751;
const LMU_OFF_TC_SLIP: usize = 752;
const LMU_OFF_TC_SLIP_MAX: usize = 753;
const LMU_OFF_TC_CUT: usize = 754;
const LMU_OFF_TC_CUT_MAX: usize = 755;
const LMU_OFF_ABS: usize = 756;
const LMU_OFF_ABS_MAX: usize = 757;
const LMU_OFF_MOTOR_MAP: usize = 758;
// Énergie / hybride (système WEC) :
const LMU_OFF_BATTERY: usize = 704; // mBatteryChargeFraction : f64 (0..1)
const LMU_OFF_BOOST_STATE: usize = 744; // mElectricBoostMotorState : u8 (0=off,1=inactif,2=propulsion,3=régén)
const LMU_OFF_REGEN: usize = 768; // mRegen : f32 (kW)
const LMU_OFF_SOC: usize = 772; // mStateOfCharge : f32 (%)
const LMU_OFF_VIRTUAL_ENERGY: usize = 776; // mVirtualEnergy : f32 (fraction 0..1)
// Quick-wins (mêmes struct joueur) :
const LMU_OFF_DELTA_BEST: usize = 696; // mDeltaBest : f64 (s, delta roulant au PB)
const LMU_OFF_LIFT_COAST: usize = 766; // mLiftAndCoastProgress : u8
const LMU_OFF_TRACK_LIMITS: usize = 767; // mTrackLimitsSteps : u8 (points normalisés)
const LMU_OFF_GAP_AHEAD: usize = 780; // mTimeGapCarAhead : f32 (s)
const LMU_OFF_GAP_BEHIND: usize = 784; // mTimeGapCarBehind : f32 (s)
// Seuils limites de piste : offsets ABSOLUS dans LMU_Data (bloc ScoringInfo, fixe).
const LMU_OFF_TL_PER_PENALTY: usize = 1983; // mTrackLimitsStepsPerPenalty : u8

/// Maps électroniques embarquées du joueur lues dans « LMU_Data ».
struct LmuElectronics {
    tc: u8,
    tc_max: u8,
    tc_slip: u8,
    tc_slip_max: u8,
    tc_cut: u8,
    tc_cut_max: u8,
    abs: u8,
    abs_max: u8,
    motor_map: u8,
    // Énergie / hybride
    virtual_energy: f32,
    state_of_charge: f32,
    regen: f32,
    battery_charge: f32,
    boost_state: u8,
    // Quick-wins
    delta_best: f32,
    lift_coast: u8,
    track_limits: u8,
    track_limits_per_penalty: u8,
    gap_ahead: f32,
    gap_behind: f32,
}

/// Lit les maps ABS/TC réelles du joueur depuis la mémoire native LMU.
/// Best-effort : `None` si la map n'existe pas (LMU non lancé / interface
/// désactivée) ou si le joueur n'a pas de véhicule actif.
fn read_lmu_electronics() -> Option<LmuElectronics> {
    let buf = read_shm(LMU_DATA_MAP, LMU_DATA_SIZE)?;
    let has: u8 = unsafe { read_at(&buf, LMU_PLAYER_HAS_OFF)? };
    if has == 0 {
        return None;
    }
    let idx: u8 = unsafe { read_at(&buf, LMU_PLAYER_IDX_OFF)? };
    let veh = LMU_TELEMINFO_OFF + (idx as usize) * LMU_VEH_STRIDE;
    Some(LmuElectronics {
        tc: unsafe { read_at(&buf, veh + LMU_OFF_TC)? },
        tc_max: unsafe { read_at(&buf, veh + LMU_OFF_TC_MAX)? },
        tc_slip: unsafe { read_at(&buf, veh + LMU_OFF_TC_SLIP)? },
        tc_slip_max: unsafe { read_at(&buf, veh + LMU_OFF_TC_SLIP_MAX)? },
        tc_cut: unsafe { read_at(&buf, veh + LMU_OFF_TC_CUT)? },
        tc_cut_max: unsafe { read_at(&buf, veh + LMU_OFF_TC_CUT_MAX)? },
        abs: unsafe { read_at(&buf, veh + LMU_OFF_ABS)? },
        abs_max: unsafe { read_at(&buf, veh + LMU_OFF_ABS_MAX)? },
        motor_map: unsafe { read_at(&buf, veh + LMU_OFF_MOTOR_MAP)? },
        virtual_energy: unsafe { read_at(&buf, veh + LMU_OFF_VIRTUAL_ENERGY)? },
        state_of_charge: unsafe { read_at(&buf, veh + LMU_OFF_SOC)? },
        regen: unsafe { read_at(&buf, veh + LMU_OFF_REGEN)? },
        battery_charge: unsafe {
            read_at::<f64>(&buf, veh + LMU_OFF_BATTERY)? as f32
        },
        boost_state: unsafe { read_at(&buf, veh + LMU_OFF_BOOST_STATE)? },
        delta_best: unsafe { read_at::<f64>(&buf, veh + LMU_OFF_DELTA_BEST)? as f32 },
        lift_coast: unsafe { read_at(&buf, veh + LMU_OFF_LIFT_COAST)? },
        track_limits: unsafe { read_at(&buf, veh + LMU_OFF_TRACK_LIMITS)? },
        track_limits_per_penalty: unsafe { read_at(&buf, LMU_OFF_TL_PER_PENALTY)? },
        gap_ahead: unsafe { read_at(&buf, veh + LMU_OFF_GAP_AHEAD)? },
        gap_behind: unsafe { read_at(&buf, veh + LMU_OFF_GAP_BEHIND)? },
    })
}

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
    /// Vitesse angulaire de la roue (rad/s, signée — négatif en marche avant
    /// selon la convention rF2). ~0 avec de la vitesse sol = blocage.
    pub rotation: f32,
    /// Vitesse latérale du patch de contact (m/s) — dérive/glisse latérale.
    pub lat_patch_vel: f32,
    /// Vitesse longitudinale du patch de contact (m/s). L'écart avec la
    /// vitesse sol donne le glissement long. (blocage/patinage réels — les
    /// champs `tc_*`/`abs` d'Extended ne sont que des réglages de map).
    pub long_patch_vel: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveTelemetry {
    pub gear: i32,
    pub max_gears: i32,
    pub rpm: f32,
    pub max_rpm: f32,
    pub speed_kmh: f32,
    /// Distance parcourue sur le tour courant (m) — `mLapDist` du scoring joueur.
    /// Sert à aligner deux tours par position (delta live par virage).
    pub lap_dist: f32,
    /// Distance estimée par dead-reckoning (m) : `lap_dist` extrapolé entre deux
    /// rafraîchissements du scoring (~5 Hz) via l'horodatage télémétrie. Précision
    /// ~±1 m contre ~±17 m à 300 km/h pour `lap_dist` brut. À privilégier pour
    /// toute mesure par position (coach par virage).
    pub lap_dist_est: f32,
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
    /// Fin de session (mEndET) : > 0 pour les courses au temps (endurance). */
    pub end_et: f64,
    pub max_laps: i32,
    pub num_vehicles: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveWeather {
    pub air_temp: f32,
    pub track_temp: f32,
    pub wind_speed: f32,
    /// Cap du vent en degrés (0-360, repère monde `atan2(x, z)`). Permet de
    /// distinguer vent de face/dos selon l'orientation d'un virage (coach).
    pub wind_dir_deg: f32,
    pub rain: f32,
    /// Humidité moyenne de la trajectoire (0-1, `mAvgPathWetness`). Piste
    /// évolutive : sert d'inhibiteur de diagnostic et de critère de péremption
    /// de référence.
    pub path_wetness_avg: f32,
    /// Humidité max de la trajectoire (0-1, `mMaxPathWetness`).
    pub path_wetness_max: f32,
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
    pub tc_max: u8,
    pub abs_max: u8,
    pub tc_slip: u8,
    pub tc_slip_max: u8,
    pub tc_cut: u8,
    pub tc_cut_max: u8,
    pub motor_map: u8,
    pub virtual_energy: f32,
    pub state_of_charge: f32,
    pub regen: f32,
    pub battery_charge: f32,
    pub boost_state: u8,
    pub lift_coast: u8,
    pub track_limits: u8,
    pub track_limits_per_penalty: u8,
    pub gap_ahead: f32,
    pub gap_behind: f32,
    pub stability_control: u8,
    pub auto_shift: u8,
    pub auto_clutch: u8,
    pub fuel_mult: u8,
    pub tire_mult: u8,
    pub pit_speed_limit: f32,
    pub status_message: String,
    pub damage_max_impact: f32,
    pub damage_accum_impact: f32,
    /// Build du jeu (`Extended.mVersion`, ex. "1.2.3.4"). Sert de critère de
    /// péremption des références du coach (un patch change la physique).
    pub game_version: String,
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
    /// Session en cours mais figée (jeu en pause, ou session quittée). */
    pub paused: bool,
    pub telemetry: Option<LiveTelemetry>,
    pub player: Option<LivePlayer>,
    pub session: Option<LiveSession>,
    pub standings: Vec<LiveStanding>,
    pub weather: Option<LiveWeather>,
    pub flags: Option<LiveFlags>,
    pub extended: Option<LiveExtended>,
    pub track_layout: Option<TrackBounds>,
    pub track_points: Vec<[f64; 2]>,
    /// Distance-tour (m) du centre de chaque `track_points[i]` (buckets 20 m).
    /// Permet d'associer une position de virage (lap_dist) à un point (x,z) —
    /// heatmap des pertes par virage sur le tracé.
    pub track_dists: Vec<f64>,
}

impl Default for LiveData {
    fn default() -> Self {
        LiveData {
            connected: false,
            paused: false,
            telemetry: None,
            player: None,
            session: None,
            standings: Vec::new(),
            weather: None,
            flags: None,
            extended: None,
            track_layout: None,
            track_points: Vec::new(),
            track_dists: Vec::new(),
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
    // ── Détection pause/gel (hystérésis anti-clignotement) ──
    /// Dernière valeur de mCurrentET observée.
    last_et: f64,
    /// Frames consécutives sans évolution de mCurrentET.
    frozen_frames: u32,
    /// Registre à décalage des 32 dernières frames (bit = mCurrentET a bougé).
    move_history: u32,
    /// État pause « collant » (sticky) pour éviter les oscillations.
    paused: bool,
    // ── Dead-reckoning de lap_dist ────────────────────────────────────────
    // mLapDist vient du bloc scoring, rafraîchi par rafales (~5 Hz) : à
    // 300 km/h il peut rester figé ~17 m. On extrapole entre deux updates
    // scoring avec l'horodatage télémétrie (mElapsedTime, frais à chaque
    // frame) : d̂ = ancre + v_moyenne × Δt.
    /// Valeur mLapDist scoring au moment de l'ancrage.
    dr_anchor_dist: f64,
    /// mElapsedTime (télémétrie) au moment de l'ancrage.
    dr_anchor_et: f64,
    /// Vitesse (m/s) au moment de l'ancrage (extrapolation trapézoïdale).
    dr_anchor_speed: f64,
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
            last_et: -1.0,
            frozen_frames: 0,
            move_history: 0,
            paused: false,
            dr_anchor_dist: 0.0,
            dr_anchor_et: 0.0,
            dr_anchor_speed: 0.0,
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
    // Tente de lire le buffer de scoring complet.
    let scor_buf_raw = read_shm(SCORING_MAP, size_of::<Scoring>());

    // La map n'existe pas → jeu non lancé (ou plugin absent du dossier Plugins/).
    let Some(scor_buf_raw) = scor_buf_raw else {
        return LiveData::default(); // connected: false
    };

    // La map existe → le jeu tourne (plugin chargé).
    // On distingue trois états selon les champs de version (begin/end, bytes 0-7) :
    //
    //   begin == 0           → Menus (pas de session active, données périmées ou nulles)
    //   begin != 0, begin == end → Données cohérentes (lecture pendant fenêtre stable)
    //   begin != 0, begin != end → Écriture en cours (race condition transitoire)
    //                              → on lit quand même : au pire données d'il y a 50 ms.
    //
    // NB : dans l'ancien code, begin != end déclenchait LiveData::default() (connected:false),
    //      masquant la session en cours. On supprime ce comportement.
    {
        let begin = i32::from_le_bytes(scor_buf_raw[0..4].try_into().unwrap_or([0; 4]));
        if begin == 0 {
            // Menus : session non démarrée.
            return LiveData { connected: true, ..Default::default() };
        }
        // begin != 0 → session active ou transitoire : on lit les données.
    }

    let scor_buf = scor_buf_raw;
    let tele_buf = read_shm(TELEMETRY_MAP, size_of::<Telemetry>())
        .filter(|b| version_ok(b));

    // Lecture brute de la map Extended (sans filtre de version) : sert à détecter
    // la FIN de session. Quand on quitte une session pour revenir aux menus, LMU
    // FIGE le buffer Scoring avec les dernières valeurs (mCurrentET reste > 0, les
    // véhicules restent présents) → les gardes n/current_et ne suffisent pas. Le
    // plugin, lui, met `m_session_started` à 0 dans son callback EndSession.
    let ext_raw = read_shm(EXTENDED_MAP, size_of::<Extended>());
    let session_started: Option<u8> = ext_raw
        .as_ref()
        .and_then(|b| unsafe { read_at(b, offset_of!(Extended, m_session_started)) });
    // Version cohérente requise seulement pour la lecture fine (physics, dégâts…).
    let ext_buf = ext_raw.filter(|b| version_ok(b));

    // Maps électroniques embarquées (ABS/TC réels) depuis la mémoire native LMU :
    // le bloc rF2 ci-dessus ne les contient pas (seules les aides de difficulté).
    let lmu_elec = read_lmu_electronics();

    let scor_info: ScoringInfo =
        match unsafe { read_at(&scor_buf, offset_of!(Scoring, m_scoring_info)) } {
            Some(s) => s,
            None => return LiveData { connected: true, ..Default::default() },
        };
    let n = (scor_info.m_num_vehicles as usize).min(MAX_VEH);
    let current_et = scor_info.m_current_et;
    // Session terminée si :
    //   - le plugin l'indique explicitement (m_session_started == 0), OU
    //   - plus aucun véhicule (n == 0), OU
    //   - horloge de session non démarrée (mCurrentET <= 0, règle V1).
    // → on masque le dashboard et on affiche « Aucune session en cours ».
    if session_started == Some(0) || n == 0 || current_et <= 0.0 {
        state.last_et = -1.0;
        state.frozen_frames = 0;
        state.move_history = 0;
        state.paused = false;
        return LiveData {
            connected: true,
            ..Default::default()
        };
    }

    // ── Pause / gel (mCurrentET figé) avec hystérésis anti-clignotement ───────
    // `mInRealtime` ne bascule pas à 0 lors de la pause LMU (Échap) → inutilisable.
    // On détecte donc le gel de l'horloge de session (mCurrentET). MAIS le scoring
    // est rafraîchi par rafales et peut « tiquer » isolément même en pause, ce qui
    // faisait clignoter l'écran. D'où l'hystérésis :
    //   - ENTRÉE en pause : 2 s (40 frames) sans évolution de mCurrentET.
    //   - SORTIE de pause : activité SOUTENUE (≥ 3 mouvements sur les 16 dernières
    //     frames) → une vraie reprise, pas un tic isolé.
    const ENTER_STALE: u32 = 40; // 40 × 50 ms = 2 s
    let changed = (current_et - state.last_et).abs() > 1e-6;
    if changed {
        state.last_et = current_et;
        state.frozen_frames = 0;
    } else {
        state.frozen_frames = state.frozen_frames.saturating_add(1);
    }
    state.move_history = (state.move_history << 1) | (changed as u32);
    let recent_moves = (state.move_history & 0xFFFF).count_ones();

    if state.paused {
        if recent_moves >= 3 {
            state.paused = false;
        }
    } else if state.frozen_frames >= ENTER_STALE {
        state.paused = true;
    }
    if state.paused {
        return LiveData {
            connected: true,
            paused: true,
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

        // Consommation carburant (moyenne glissante sur 5 tours). La référence
        // `fuel_at_lap_start` n'est posée qu'au franchissement de ligne : le 1er
        // passage arme la mesure, chaque passage suivant livre un tour complet.
        // Tour avec passage aux stands ignoré (limiteur + ravitaillement faussent
        // la mesure ; un ravitaillement rend de toute façon le delta négatif).
        let lap = t.m_lap_number;
        let fuel = t.m_fuel;
        if lap > state.last_lap_num {
            let in_pits = player_scor.map(|p| p.m_in_pits != 0).unwrap_or(false);
            if state.fuel_at_lap_start > 0.0 && !in_pits {
                let used = state.fuel_at_lap_start - fuel;
                if used > 0.5 && used < 10.0 {
                    state.lap_fuel_history.push(used);
                    if state.lap_fuel_history.len() > 5 {
                        state.lap_fuel_history.remove(0);
                    }
                }
            }
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
                // `m_wear` = fraction de gomme RESTANTE (1.0 = neuf) → on garde le
                // % restant tel quel. (Avant : `1 - m_wear`, inversé → pneus neufs
                // affichés à 0 % et le coach disait de les changer au départ.)
                wear: (w.m_wear * 100.0) as f32,
                brake_temp: bt,
                pressure: w.m_pressure as f32,
                camber: w.m_camber.to_degrees() as f32,
                grip_fract: w.m_grip_fract as f32,
                surface: w.m_surface_type,
                flat: w.m_flat != 0,
                detached: w.m_detached != 0,
                rotation: w.m_rotation as f32,
                lat_patch_vel: w.m_lateral_patch_vel as f32,
                long_patch_vel: w.m_longitudinal_patch_vel as f32,
            }
        });

        let dent = t.m_dent_severity;
        let damage_total =
            dent.iter().map(|&d| d as f32).sum::<f32>() / 16.0 * 100.0;

        // ── Dead-reckoning de lap_dist (cf. champs dr_* de PollState) ──────
        // Ré-ancrage dès que le scoring publie une nouvelle valeur, au wrap de
        // tour (valeur qui recule) ou à un retour en arrière du temps (restart).
        let lap_dist_raw = player_scor.map(|p| p.m_lap_dist).unwrap_or(0.0);
        let et = t.m_elapsed_time;
        let v_ms = t.m_local_vel.z.abs();
        if lap_dist_raw != state.dr_anchor_dist
            || lap_dist_raw <= 0.0
            || et < state.dr_anchor_et
        {
            state.dr_anchor_dist = lap_dist_raw;
            state.dr_anchor_et = et;
            state.dr_anchor_speed = v_ms;
        }
        let lap_dist_est = if lap_dist_raw > 0.0 && et > state.dr_anchor_et {
            // Extrapolation trapézoïdale, bornée à 0,5 s sans update scoring
            // (pause/gel : l'estimation se fige au lieu de dériver).
            let dt = (et - state.dr_anchor_et).min(0.5);
            lap_dist_raw + (state.dr_anchor_speed + v_ms) * 0.5 * dt
        } else {
            lap_dist_raw
        };

        LiveTelemetry {
            gear: t.m_gear,
            max_gears: t.m_max_gears as i32,
            rpm: t.m_engine_rpm as f32,
            max_rpm: t.m_engine_max_rpm as f32,
            speed_kmh,
            lap_dist: player_scor.map(|p| p.m_lap_dist as f32).unwrap_or(0.0),
            lap_dist_est: lap_dist_est as f32,
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
            // m_local_accel est en m/s² dans le repère local rF2/LMU
            // (x = droite, y = haut, z = ARRIÈRE). On convertit en g (÷ 9.80665)
            // et on inverse le longitudinal pour que l'accélération soit
            // positive (freinage négatif), comme attendu par l'affichage/overlay.
            g_long: (-t.m_local_accel.z / 9.80665) as f32,
            g_lat: (t.m_local_accel.x / 9.80665) as f32,
            g_vert: (t.m_local_accel.y / 9.80665) as f32,
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
        // Delta au meilleur tour : on privilégie `mDeltaBest` natif LMU (delta
        // roulant, comme le HUD en jeu) quand dispo ; sinon estimation rF2
        // (`m_estimated_lap_time − m_best_lap_time`, plus grossière).
        let est = p.m_estimated_lap_time;
        let best = p.m_best_lap_time;
        let delta = match lmu_elec.as_ref() {
            Some(e) if p.m_in_pits == 0 => e.delta_best as f64,
            _ if est > 0.0 && best > 0.0 && p.m_in_pits == 0 => est - best,
            _ => 0.0,
        };
        LivePlayer {
            driver: c_str(&p.m_driver_name),
            vehicle: c_str(&p.m_vehicle_name),
            position: p.m_place,
            last_lap_time: p.m_last_lap_time as f32,
            best_lap_time: p.m_best_lap_time as f32,
            // Temps écoulé sur le tour en cours = ET courant − ET de début de tour.
            // (mTimeIntoLap de rF2 est peu fiable pour le joueur et garde une valeur
            // résiduelle au départ ; m_lap_start_et donne le vrai chrono du tour.)
            current_lap_time: if p.m_lap_start_et > 0.0 && current_et > p.m_lap_start_et {
                (current_et - p.m_lap_start_et) as f32
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
        // Nouvelle session → la mesure de consommation repart de zéro (une
        // référence carburant de l'ancienne session fausserait le 1er tour).
        state.fuel_at_lap_start = 0.0;
        state.lap_fuel_history.clear();
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
    // Distance-tour du centre de chaque bucket (clé = lapDist/20) — alignée
    // 1:1 avec track_points (smooth_loop préserve la longueur).
    let track_dists: Vec<f64> = sorted.iter().map(|(k, _)| *k as f64 * 20.0 + 10.0).collect();
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
        let version: [u8; 12] =
            unsafe { read_at(buf, offset_of!(Extended, m_version))? };
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
            // ABS/TC = vraies maps embarquées (LMU_Data) quand dispo, sinon 0.
            // On n'utilise PLUS `physics.m_*` (aides de difficulté rF2, ≠ maps voiture).
            tc: lmu_elec.as_ref().map(|e| e.tc).unwrap_or(0),
            abs: lmu_elec.as_ref().map(|e| e.abs).unwrap_or(0),
            tc_max: lmu_elec.as_ref().map(|e| e.tc_max).unwrap_or(0),
            abs_max: lmu_elec.as_ref().map(|e| e.abs_max).unwrap_or(0),
            tc_slip: lmu_elec.as_ref().map(|e| e.tc_slip).unwrap_or(0),
            tc_slip_max: lmu_elec.as_ref().map(|e| e.tc_slip_max).unwrap_or(0),
            tc_cut: lmu_elec.as_ref().map(|e| e.tc_cut).unwrap_or(0),
            tc_cut_max: lmu_elec.as_ref().map(|e| e.tc_cut_max).unwrap_or(0),
            motor_map: lmu_elec.as_ref().map(|e| e.motor_map).unwrap_or(0),
            virtual_energy: lmu_elec.as_ref().map(|e| e.virtual_energy).unwrap_or(0.0),
            state_of_charge: lmu_elec.as_ref().map(|e| e.state_of_charge).unwrap_or(0.0),
            regen: lmu_elec.as_ref().map(|e| e.regen).unwrap_or(0.0),
            battery_charge: lmu_elec.as_ref().map(|e| e.battery_charge).unwrap_or(0.0),
            boost_state: lmu_elec.as_ref().map(|e| e.boost_state).unwrap_or(0),
            lift_coast: lmu_elec.as_ref().map(|e| e.lift_coast).unwrap_or(0),
            track_limits: lmu_elec.as_ref().map(|e| e.track_limits).unwrap_or(0),
            track_limits_per_penalty: lmu_elec
                .as_ref()
                .map(|e| e.track_limits_per_penalty)
                .unwrap_or(0),
            gap_ahead: lmu_elec.as_ref().map(|e| e.gap_ahead).unwrap_or(0.0),
            gap_behind: lmu_elec.as_ref().map(|e| e.gap_behind).unwrap_or(0.0),
            stability_control: physics.m_stability_control,
            auto_shift: physics.m_auto_shift,
            auto_clutch: physics.m_auto_clutch,
            fuel_mult: physics.m_fuel_mult,
            tire_mult: physics.m_tire_mult,
            pit_speed_limit: pit_speed,
            status_message: c_str(&status),
            damage_max_impact: dmg_max,
            damage_accum_impact: dmg_accum,
            game_version: c_str(&version),
        })
    });

    let wind = scor_info.m_wind;
    LiveData {
        connected: true,
        paused: false,
        telemetry,
        player,
        session: Some(LiveSession {
            track: track_name,
            session: scor_info.m_session,
            session_time: current_et,
            end_et: scor_info.m_end_et,
            max_laps: scor_info.m_max_laps,
            num_vehicles: n as i32,
        }),
        standings,
        weather: Some(LiveWeather {
            air_temp: scor_info.m_ambient_temp as f32,
            track_temp: track_temp as f32,
            wind_speed: ((wind.x * wind.x + wind.y * wind.y + wind.z * wind.z).sqrt()
                * 3.6) as f32,
            wind_dir_deg: ((wind.x.atan2(wind.z).to_degrees() + 360.0) % 360.0) as f32,
            rain: scor_info.m_raining as f32,
            path_wetness_avg: scor_info.m_avg_path_wetness as f32,
            path_wetness_max: scor_info.m_max_path_wetness as f32,
        }),
        flags: Some(LiveFlags {
            game_phase: scor_info.m_game_phase,
            yellow_flag_state: scor_info.m_yellow_flag_state,
            sector_flags: scor_info.m_sector_flag,
        }),
        extended,
        track_layout,
        track_points,
        track_dists,
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Commandes Tauri
// ═══════════════════════════════════════════════════════════════════════════

static LIVE_POLLING: AtomicBool = AtomicBool::new(false);
// Nombre de fenêtres qui consomment le flux `live-data` (page Live + fenêtre
// overlay). Le thread de polling est un singleton partagé par toutes les
// fenêtres : il ne doit s'arrêter que lorsque PLUS AUCUNE fenêtre ne l'utilise.
// Auparavant `stop_live_polling` coupait le thread pour tout le monde dès que la
// page Live était démontée → l'overlay in-game se figeait le reste de la course.
static LIVE_CONSUMERS: AtomicUsize = AtomicUsize::new(0);
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
    // La map de scoring n'existe que quand le jeu tourne et le plugin est chargé.
    // On n'exige plus begin!=0 : le jeu peut être dans les menus (begin==0 valide).
    Ok(read_shm(SCORING_MAP, 8).is_some())
}

#[tauri::command]
pub fn start_live_polling(app: AppHandle) -> Result<(), AppError> {
    // Un consommateur de plus (Live ou overlay). Le thread ne démarre que s'il
    // n'était pas déjà actif.
    LIVE_CONSUMERS.fetch_add(1, Ordering::SeqCst);
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
    // Un consommateur de moins. On n'arrête réellement le thread que quand le
    // compteur retombe à 0 (plus aucune fenêtre n'écoute `live-data`).
    let prev = LIVE_CONSUMERS
        .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |n| Some(n.saturating_sub(1)))
        .unwrap_or(0);
    if prev <= 1 {
        LIVE_POLLING.store(false, Ordering::SeqCst);
    }
    Ok(())
}
