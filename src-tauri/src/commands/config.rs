//! Commandes de configuration applicative (mono-profil) et détection du jeu.
//!
//! Remplace l'ancien système multi-profils de la V2 : V3 ne gère qu'un seul
//! joueur, comme la V1.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::Serialize;
use tauri::State;

use crate::db::{self, get_conn, DbState};
use crate::error::AppError;

// ===========================================================================
// Config clé/valeur
// ===========================================================================

#[tauri::command]
pub fn get_config(key: String, db: State<'_, DbState>) -> Result<Option<String>, AppError> {
    db::config_get(&db, &key)
}

#[tauri::command]
pub fn set_config(key: String, value: String, db: State<'_, DbState>) -> Result<(), AppError> {
    db::config_set(&db, &key, &value)
}

/// Renvoie toute la configuration sous forme de dictionnaire.
#[tauri::command]
pub fn get_all_config(db: State<'_, DbState>) -> Result<HashMap<String, String>, AppError> {
    let conn = get_conn(&db)?;
    let mut stmt = conn
        .prepare("SELECT key, value FROM config")
        .map_err(|e| AppError::Database(format!("get_all_config prepare: {e}")))?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| AppError::Database(format!("get_all_config query: {e}")))?;
    let mut map = HashMap::new();
    for row in rows.flatten() {
        map.insert(row.0, row.1);
    }
    Ok(map)
}

// ===========================================================================
// Détection du jeu LMU
// ===========================================================================

#[derive(Debug, Clone, Serialize)]
pub struct DetectResult {
    pub lmu_path: String,
    pub results_dir: String,
    pub telemetry_dir: String,
    pub player_name: String,
    pub xml_count: usize,
}

/// Détecte automatiquement l'installation LMU + le nom du joueur.
#[tauri::command]
pub fn detect_lmu() -> Result<DetectResult, AppError> {
    let lmu_path = internal_detect_lmu_path()
        .ok_or_else(|| AppError::NotFound("Installation LMU introuvable".into()))?;
    inspect_lmu_path(lmu_path)
}

/// Inspecte un chemin LMU fourni manuellement (dossier Results + joueur).
#[tauri::command]
pub fn inspect_lmu(lmu_path: String) -> Result<DetectResult, AppError> {
    inspect_lmu_path(lmu_path)
}

fn inspect_lmu_path(lmu_path: String) -> Result<DetectResult, AppError> {
    let results_dir = PathBuf::from(&lmu_path)
        .join("UserData")
        .join("Log")
        .join("Results");
    if !results_dir.is_dir() {
        return Err(AppError::NotFound(format!(
            "Dossier Results introuvable : {}",
            results_dir.display()
        )));
    }

    // Dossier télémétrie dérivé (peut ne pas exister si l'enregistrement n'a
    // jamais été activé — on renvoie quand même le chemin attendu, modifiable).
    let telemetry_dir = PathBuf::from(&lmu_path)
        .join("UserData")
        .join("Telemetry");

    let mut xml_files: Vec<PathBuf> = std::fs::read_dir(&results_dir)
        .map_err(AppError::Io)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && p.extension()
                    .map(|x| x.eq_ignore_ascii_case("xml"))
                    .unwrap_or(false)
        })
        .collect();
    let xml_count = xml_files.len();

    let player_name = suggest_player_name(&mut xml_files);

    Ok(DetectResult {
        lmu_path,
        results_dir: results_dir.to_string_lossy().to_string(),
        telemetry_dir: telemetry_dir.to_string_lossy().to_string(),
        player_name,
        xml_count,
    })
}

/// Devine le nom du joueur : nom de pilote **le plus fréquent** dans les
/// 10 fichiers les plus récents (règle V1 `suggestPlayerName`).
///
/// On ne se fie PAS au flag XML `isPlayer` (non fiable). Le joueur est dans
/// 100 % de ses propres fichiers de résultats → c'est le nom le plus fréquent.
fn suggest_player_name(xml_files: &mut [PathBuf]) -> String {
    xml_files.sort_by_key(|p| {
        std::cmp::Reverse(std::fs::metadata(p).and_then(|m| m.modified()).ok())
    });

    let mut counts: HashMap<String, usize> = HashMap::new();
    for path in xml_files.iter().take(10) {
        if let Ok(parsed) = crate::xml_parser::parse_xml_file(path) {
            for session in &parsed.sessions {
                for d in &session.drivers {
                    if !d.name.is_empty() {
                        *counts.entry(d.name.clone()).or_insert(0) += 1;
                    }
                }
            }
        }
    }

    counts
        .into_iter()
        .max_by_key(|(_, c)| *c)
        .map(|(name, _)| name)
        .unwrap_or_default()
}

// ===========================================================================
// Détection du chemin Steam / LMU
// ===========================================================================

fn internal_detect_lmu_path() -> Option<String> {
    let lmu_relative = PathBuf::from("steamapps")
        .join("common")
        .join("Le Mans Ultimate");
    let results_relative = PathBuf::from("UserData").join("Log").join("Results");

    for steam_lib in collect_steam_library_dirs() {
        let lmu_dir = steam_lib.join(&lmu_relative);
        if lmu_dir.join(&results_relative).is_dir() {
            return Some(lmu_dir.to_string_lossy().to_string());
        }
    }
    None
}

fn collect_steam_library_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();

    if let Some(steam_install) = read_steam_install_path_from_registry() {
        dirs.push(steam_install.clone());
        let vdf = steam_install.join("steamapps").join("libraryfolders.vdf");
        if let Ok(content) = std::fs::read_to_string(&vdf) {
            for line in content.lines() {
                let trimmed = line.trim();
                if let Some(rest) = trimmed.strip_prefix("\"path\"") {
                    let path_str = rest
                        .trim()
                        .trim_matches('"')
                        .trim()
                        .trim_matches('"')
                        .replace("\\\\", "\\");
                    let p = PathBuf::from(&path_str);
                    if p.is_dir() && !dirs.contains(&p) {
                        dirs.push(p);
                    }
                }
            }
        }
    }

    let fallbacks = [
        r"C:\Program Files (x86)\Steam",
        r"D:\Steam",
        r"D:\SteamLibrary",
        r"E:\Steam",
        r"E:\SteamLibrary",
    ];
    for fb in fallbacks {
        let p = PathBuf::from(fb);
        if p.is_dir() && !dirs.contains(&p) {
            dirs.push(p);
        }
    }

    for letter in b'A'..=b'Z' {
        let drive = PathBuf::from(format!("{}:\\", letter as char));
        if !drive.is_dir() {
            continue;
        }
        for name in ["Steam", "SteamLibrary"] {
            let p = drive.join(name);
            if p.is_dir() && !dirs.contains(&p) {
                dirs.push(p);
            }
        }
    }

    dirs
}

#[cfg(target_os = "windows")]
fn read_steam_install_path_from_registry() -> Option<PathBuf> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    /// Évite la fenêtre console noire de `reg.exe` (vol de focus en jeu).
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let queries = [
        (r"HKLM\SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath"),
        (r"HKCU\SOFTWARE\Valve\Steam", "SteamPath"),
    ];
    for (key, value) in queries {
        if let Ok(output) = Command::new("reg")
            .args(["query", key, "/v", value])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if let Some(idx) = line.find("REG_SZ") {
                    let path = line[idx + 6..].trim();
                    let p = PathBuf::from(path);
                    if p.is_dir() {
                        return Some(p);
                    }
                }
            }
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn read_steam_install_path_from_registry() -> Option<PathBuf> {
    None
}
