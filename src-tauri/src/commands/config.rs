//! Commandes de configuration applicative (mono-profil) et détection du jeu.
//!
//! Remplace l'ancien système multi-profils de la V2 : V3 ne gère qu'un seul
//! joueur, comme la V1.

use std::collections::{HashMap, HashSet};
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
    /// Autres noms plausibles (le 1er = `player_name`) : liste de choix de l'assistant.
    pub player_candidates: Vec<String>,
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

    let profile = read_profile_name(&PathBuf::from(&lmu_path));
    let candidates = player_candidates(&mut xml_files, profile.as_deref());
    let player_name = candidates.first().cloned().unwrap_or_default();

    Ok(DetectResult {
        lmu_path,
        results_dir: results_dir.to_string_lossy().to_string(),
        telemetry_dir: telemetry_dir.to_string_lossy().to_string(),
        player_name,
        player_candidates: candidates,
        xml_count,
    })
}

/// Nombre de fichiers de résultats récents examinés pour deviner le joueur.
const PLAYER_SCAN_FILES: usize = 20;

/// Nom saisi dans le profil du jeu : `UserData/player/Settings.JSON`, clé
/// « Player Name » (repli « Player Nick »). Lecture tolérante (pas de parseur JSON :
/// le fichier du jeu n'est pas garanti strict).
fn read_profile_name(lmu_path: &std::path::Path) -> Option<String> {
    let path = lmu_path.join("UserData").join("player").join("Settings.JSON");
    let raw = std::fs::read(path).ok()?;
    let content = String::from_utf8_lossy(&raw);
    ["Player Name", "Player Nick"]
        .iter()
        .find_map(|k| json_string_field(&content, k))
        .filter(|n| !n.trim().is_empty())
}

/// Valeur texte de `"clé" : "valeur"` (première occurrence), sans échappements.
fn json_string_field(content: &str, key: &str) -> Option<String> {
    let at = content.find(&format!("\"{key}\""))?;
    let rest = &content[at + key.len() + 2..];
    let rest = rest.trim_start().strip_prefix(':')?.trim_start().strip_prefix('"')?;
    Some(rest[..rest.find('"')?].to_string())
}

/// Candidats au nom du joueur, le plus probable d'abord (cf. `rank_player_names`),
/// d'après les `PLAYER_SCAN_FILES` fichiers de résultats les plus récents.
fn player_candidates(xml_files: &mut [PathBuf], profile: Option<&str>) -> Vec<String> {
    xml_files.sort_by_key(|p| {
        std::cmp::Reverse(std::fs::metadata(p).and_then(|m| m.modified()).ok())
    });
    let files: Vec<Vec<(String, bool)>> = xml_files
        .iter()
        .take(PLAYER_SCAN_FILES)
        .filter_map(|path| crate::xml_parser::parse_xml_file(path).ok())
        .map(|parsed| {
            parsed
                .sessions
                .iter()
                .flat_map(|s| s.drivers.iter().map(|d| (d.name.clone(), d.is_player)))
                .collect()
        })
        .collect();
    rank_player_names(&files, profile)
}

/// Classe les noms de pilotes (un `Vec` par fichier de résultats) :
/// 1. noms marqués joueur (`isPlayer`) dans les fichiers — le nom tel que le jeu
///    l'écrit, celui qui sert à retrouver ses sessions ;
/// 2. à défaut, le nom du profil du jeu ;
/// 3. en dernier recours, présence dans le plus de fichiers (le joueur est dans
///    tous les siens).
/// Égalités : nom du profil d'abord, puis ordre alphabétique — jamais de hasard
/// (l'ancienne règle prenait un nom au hasard parmi les IA présentes partout).
fn rank_player_names(files: &[Vec<(String, bool)>], profile: Option<&str>) -> Vec<String> {
    let mut flagged: HashMap<&str, usize> = HashMap::new();
    let mut present: HashMap<&str, usize> = HashMap::new();
    for file in files {
        let mut seen: HashSet<&str> = HashSet::new();
        let mut seen_flag: HashSet<&str> = HashSet::new();
        for (name, is_player) in file {
            let name = name.trim();
            if name.is_empty() {
                continue;
            }
            if seen.insert(name) {
                *present.entry(name).or_insert(0) += 1;
            }
            if *is_player && seen_flag.insert(name) {
                *flagged.entry(name).or_insert(0) += 1;
            }
        }
    }
    let profile = profile.map(str::trim).filter(|p| !p.is_empty());
    let rank = |counts: &HashMap<&str, usize>| -> Vec<String> {
        let mut v: Vec<(&str, usize)> = counts.iter().map(|(n, c)| (*n, *c)).collect();
        v.sort_by(|a, b| {
            b.1.cmp(&a.1)
                .then_with(|| (Some(b.0) == profile).cmp(&(Some(a.0) == profile)))
                .then_with(|| a.0.cmp(b.0))
        });
        v.into_iter().map(|(n, _)| n.to_string()).collect()
    };
    let mut out: Vec<String> = Vec::new();
    let mut push = |n: String, out: &mut Vec<String>| {
        if !out.contains(&n) {
            out.push(n);
        }
    };
    for n in rank(&flagged) {
        push(n, &mut out);
    }
    if let Some(p) = profile {
        push(p.to_string(), &mut out);
    }
    // Aucun pilote marqué joueur : vrai doute → quelques noms parmi les plus présents,
    // proposés dans la liste de choix de l'assistant (le joueur y choisit le sien).
    if flagged.is_empty() {
        for n in rank(&present).into_iter().take(6) {
            push(n, &mut out);
        }
    }
    out.truncate(8);
    out
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

#[cfg(test)]
mod player_name_tests {
    use super::{json_string_field, rank_player_names};

    fn file(names: &[(&str, bool)]) -> Vec<(String, bool)> {
        names.iter().map(|(n, p)| (n.to_string(), *p)).collect()
    }

    #[test]
    fn joueur_marque_malgre_les_ia_presentes_partout() {
        // Les mêmes IA dans chaque course : à égalité de présence avec le joueur.
        let f = file(&[("Zed AI", false), ("Alpha AI", false), ("Cris Tof", true)]);
        let files = vec![f.clone(), f.clone(), f];
        assert_eq!(rank_player_names(&files, None)[0], "Cris Tof");
    }

    #[test]
    fn sans_marqueur_le_profil_du_jeu_l_emporte() {
        let f = file(&[("Zed AI", false), ("Cris Tof", false), ("Alpha AI", false)]);
        let files = vec![f.clone(), f];
        assert_eq!(rank_player_names(&files, Some("Cris Tof"))[0], "Cris Tof");
    }

    #[test]
    fn egalite_sans_indice_ordre_stable() {
        let f = file(&[("Zed AI", false), ("Alpha AI", false)]);
        let files = vec![f.clone(), f];
        for _ in 0..20 {
            assert_eq!(rank_player_names(&files, None), vec!["Alpha AI", "Zed AI"]);
        }
    }

    #[test]
    fn joueur_identifie_pas_de_liste() {
        // Marqué joueur et nom du profil identiques : un seul candidat, pas de liste.
        let f = file(&[("Cris Tof", true), ("Alpha AI", false)]);
        assert_eq!(rank_player_names(&[f], Some("Cris Tof")), vec!["Cris Tof"]);
    }

    #[test]
    fn doute_liste_de_choix() {
        // Aucun marqueur : le profil d'abord, puis les noms les plus présents, sans doublon.
        let f = file(&[("Zed AI", false), ("Cris Tof", false)]);
        assert_eq!(rank_player_names(&[f], Some("Cris Tof")), vec!["Cris Tof", "Zed AI"]);
    }

    #[test]
    fn lecture_du_profil() {
        let json = "{\n  \"DRIVER\":{\n    \"Player Name\" : \"Cris Tof\",\n    \"Player Nick\":\"CT\"\n  }\n}";
        assert_eq!(json_string_field(json, "Player Name").as_deref(), Some("Cris Tof"));
        assert_eq!(json_string_field(json, "Player Nick").as_deref(), Some("CT"));
        assert_eq!(json_string_field(json, "Absent"), None);
    }
}
