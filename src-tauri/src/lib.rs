mod commands;
mod db;
mod error;
mod models;
pub mod xml_parser;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, WindowEvent};

pub use db::DbState;
pub use error::{AppError, AppResult};

/// Affiche et met au premier plan la fenêtre principale.
fn show_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            // Système
            commands::system::get_app_version,
            commands::system::get_platform,
            commands::system::ping,
            commands::system::check_plugin_installed,
            // Configuration + détection du jeu
            commands::config::get_config,
            commands::config::set_config,
            commands::config::get_all_config,
            commands::config::detect_lmu,
            commands::config::inspect_lmu,
            // Indexation
            commands::indexer::run_setup,
            commands::indexer::sync_index,
            commands::indexer::reindex_all,
            commands::indexer::clear_index_cache,
            commands::indexer::purge_empty_sessions,
            commands::indexer::count_empty_sessions,
            // Requêtes Dashboard / Sessions
            commands::queries::get_dashboard_stats,
            commands::queries::get_best_laps,
            commands::queries::get_filter_options,
            commands::queries::get_game_versions,
            commands::queries::get_sessions_list,
            commands::queries::get_sessions_overview,
            commands::queries::get_race_activity,
            // Détail d'une session + graphe de tours
            commands::session_detail::get_session_detail,
            commands::session_detail::get_lap_chart_data,
            commands::session_detail::get_chart_compare_sessions,
            // Garage — configurations de voiture (.svm)
            commands::setups::scan_setups,
            commands::setups::list_setups,
            commands::setups::get_setup,
            commands::setups::get_setup_content,
            commands::setups::update_setup,
            commands::setups::duplicate_setup,
            commands::setups::set_setup_type,
            commands::setups::set_setup_notes,
            commands::setups::delete_setup,
            commands::setups::export_setup,
            commands::setups::compare_setups,
            commands::setups::create_setup,
            commands::setups::search_sessions_for_setup,
            commands::setups::set_setup_linked_session,
            commands::setups::get_setups_for_session,
            commands::setups::get_session_summary,
            // Records personnels
            commands::records::get_records_overview,
            commands::records::get_record_progression,
            // Télémétrie post-session (fichiers .duckdb de LMU)
            commands::telemetry::list_telemetry_files,
            commands::telemetry::get_telemetry_meta,
            commands::telemetry::get_telemetry_channels,
            // AI Coach — proxy HTTP générique vers les fournisseurs d'IA
            commands::ai::ai_chat,
            commands::ai::ai_chat_stream,
            commands::ai::ai_list_models,
            commands::ai::ai_set_key,
            commands::ai::ai_get_key,
            commands::ai::coach_note_add,
            commands::ai::coach_notes_for_combo,
            commands::ai::coach_note_delete,
            // Live timing — shared memory rF2/LMU
            commands::live::get_live_data,
            commands::live::is_sim_running,
            commands::live::start_live_polling,
            commands::live::stop_live_polling,
            // Overlays in-game (fenêtre transparente always-on-top)
            commands::overlay::open_overlay_window,
            commands::overlay::close_overlay_window,
            commands::overlay::set_overlay_edit_mode,
            commands::overlay::set_overlay_clickthrough,
            commands::overlay::is_overlay_open,
            // Synthèse vocale neuronale (Piper)
            commands::tts::tts_synthesize,
            commands::tts::tts_available,
            commands::tts::tts_list_voices,
            // Reconnaissance vocale par commandes (Vosk, spotter Couche 2 ; feature `stt`)
            #[cfg(feature = "stt")]
            commands::stt::stt_available,
            #[cfg(feature = "stt")]
            commands::stt::stt_recognize,
            #[cfg(feature = "stt")]
            commands::stt::stt_recognize_free,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                println!("[tauri] LMU Stats Viewer v3 — dev mode");
            }

            let db_state = db::init_db(app.handle())
                .expect("Échec de l'initialisation de la base de données");
            app.manage(db_state);

            // ── System tray ───────────────────────────────────────────────
            let open_i =
                MenuItem::with_id(app, "open", "Ouvrir l'application", true, None::<&str>)?;
            let live_i = MenuItem::with_id(app, "live", "Live", true, None::<&str>)?;
            let config_i =
                MenuItem::with_id(app, "config", "Configuration", true, None::<&str>)?;
            let update_i = MenuItem::with_id(
                app,
                "update",
                "Vérifier les mises à jour",
                true,
                None::<&str>,
            )?;
            let quit_i = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(
                app,
                &[&open_i, &live_i, &config_i, &update_i, &sep, &quit_i],
            )?;

            let mut tray = TrayIconBuilder::with_id("main-tray")
                .menu(&menu)
                .tooltip("LMU Stats Viewer")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "live" => {
                        show_main(app);
                        let _ = app.emit("tray-nav", "/live");
                    }
                    "config" => {
                        show_main(app);
                        let _ = app.emit("tray-nav", "/config");
                    }
                    "update" => {
                        show_main(app);
                        let _ = app.emit("tray-check-update", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon().cloned() {
                tray = tray.icon(icon);
            }
            tray.build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Fermeture de la fenêtre principale → réduction dans le tray
            // si la préférence `system_tray` est active (défaut : oui).
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let state = window.state::<DbState>();
                    let tray_enabled = db::config_get(state.inner(), "system_tray")
                        .ok()
                        .flatten()
                        .map(|v| v != "false")
                        .unwrap_or(true);
                    if tray_enabled {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("erreur au démarrage de l'application Tauri");
}
