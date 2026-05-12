//! LMU Stats Viewer v2 — backend Tauri
//!
//! Architecture des commandes :
//! - `commands::system`     : infos système (version app, OS, etc.)
//! - `commands::indexer`    : parser XML des résultats LMU (Phase 1)
//! - `commands::setups`     : CRUD `.svm` (Phase 4)
//! - `commands::live`       : shared memory rFactor2 (Phase 5)
//! - `commands::ohne_speed` : fetch gviz Google Sheets (Phase 3)
//! - `commands::profiles`   : gestion multi-pilote (Phase 1)

mod commands;
mod error;

pub use error::{AppError, AppResult};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::system::get_app_version,
            commands::system::get_platform,
            commands::system::ping,
        ])
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                println!("[tauri] LMU Stats Viewer v2 — dev mode");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
