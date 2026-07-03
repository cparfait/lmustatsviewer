//! Commandes système basiques : version, plateforme, ping.
//!
//! Sert principalement à valider que le bridge IPC fonctionne, et à exposer
//! quelques infos statiques au frontend.

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct PlatformInfo {
    pub os: String,
    pub arch: String,
    pub family: String,
}

#[tauri::command]
pub fn get_app_version() -> String {
    env!("APP_VERSION").to_string()
}

#[tauri::command]
pub fn get_platform() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        family: std::env::consts::FAMILY.to_string(),
    }
}

/// Echo simple pour tester le bridge IPC depuis le frontend.
#[tauri::command]
pub fn ping(message: String) -> String {
    format!("pong: {message}")
}

/// Active ou désactive l'icône du system tray à chaud.
///
/// `enabled = true`  → (re)construit l'icône et son menu.
/// `enabled = false` → retire l'icône du tray.
///
/// La persistance de la préférence (`system_tray`) est gérée côté frontend via
/// `set_config` ; cette commande ne touche qu'à l'icône elle-même.
#[tauri::command]
pub fn set_tray_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if enabled {
        crate::build_tray(&app).map_err(|e| e.to_string())
    } else {
        app.remove_tray_by_id("main-tray");
        Ok(())
    }
}

/// Vérifie si le plugin shared memory rF2 est installé dans le dossier Plugins de LMU.
/// Retourne `false` si `lmu_path` est vide ou si le DLL est absent.
#[tauri::command]
pub fn check_plugin_installed(lmu_path: String) -> bool {
    if lmu_path.is_empty() {
        return false;
    }
    std::path::Path::new(&lmu_path)
        .join("Plugins")
        .join("rFactor2SharedMemoryMapPlugin64.dll")
        .exists()
}
