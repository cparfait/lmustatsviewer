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
    env!("CARGO_PKG_VERSION").to_string()
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
