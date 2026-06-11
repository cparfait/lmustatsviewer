//! Types partagés et règles de normalisation reprises de la V1.
//!
//! Source de vérité : `includes/functions.php` et `includes/indexer.php`
//! de LMU Stats Viewer v1.

use serde::Serialize;

/// Ordre canonique des classes (V3 = V1 + distinction LMP2 WEC / ELMS).
pub fn class_order(class: &str) -> i32 {
    match class {
        "Hyper" => 1,
        "LMP2 WEC" => 2,
        "LMP2 ELMS" => 3,
        "LMP3" => 4,
        "GT3" => 5,
        "GTE" => 6,
        _ => 99,
    }
}

/// Normalise le nom de classe d'une voiture.
///
/// Règle V1 (`_normalize_car_class`) étendue : la V1 fusionnait toutes les
/// LMP2 ; la V3 distingue **LMP2 WEC** et **LMP2 ELMS** via `<Category>`.
pub fn normalize_car_class(raw: &str, category: &str) -> String {
    let raw = raw.trim();
    if raw.eq_ignore_ascii_case("Hyper") {
        return "Hyper".to_string();
    }
    let spaced = raw.replace('_', " ");
    if spaced.eq_ignore_ascii_case("LMP2 ELMS") {
        return "LMP2 ELMS".to_string();
    }
    if spaced.eq_ignore_ascii_case("LMP2 WEC") {
        return "LMP2 WEC".to_string();
    }
    if spaced.eq_ignore_ascii_case("LMP2") {
        let cat = category.to_uppercase();
        if cat.contains("ELMS") {
            return "LMP2 ELMS".to_string();
        }
        if cat.contains("WEC") {
            return "LMP2 WEC".to_string();
        }
        return "LMP2".to_string();
    }
    raw.to_string()
}

/// Nom unique de voiture — distingue les millésimes (`_compute_unique_car_name` V1).
pub fn compute_unique_car_name(car_type: &str, category: &str) -> String {
    if car_type.contains("Peugeot 9x8") {
        if let Some(year) = extract_wec_year(category) {
            let display = if year == "2024" || year == "2025" {
                "2024/25".to_string()
            } else {
                year
            };
            return format!("{car_type} ({display})");
        }
    }
    car_type.to_string()
}

fn extract_wec_year(category: &str) -> Option<String> {
    let idx = category.find("WEC ")?;
    let rest = &category[idx + 4..];
    let year: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    if year.len() == 4 {
        Some(year)
    } else {
        None
    }
}

/// Formate la version du jeu (`_format_game_version` V1) : `major.mmmm`.
pub fn format_game_version(raw: &str) -> String {
    let parts: Vec<&str> = raw.split('.').collect();
    if parts.len() > 1 {
        let major = parts[0];
        let joined: String = parts[1..].concat();
        let minor: String = joined.chars().take(4).collect();
        let minor = format!("{:0<4}", minor);
        format!("{major}.{minor}")
    } else {
        format!("{raw}.0000")
    }
}

/// Calcule le tour optimal (somme des meilleurs secteurs). `None` si incomplet.
pub fn compute_optimal_lap(s1: Option<f64>, s2: Option<f64>, s3: Option<f64>) -> Option<f64> {
    match (s1, s2, s3) {
        (Some(a), Some(b), Some(c)) => Some(a + b + c),
        _ => None,
    }
}

/// Bilan d'une opération d'indexation, renvoyé au frontend.
#[derive(Debug, Default, Clone, Serialize)]
pub struct IndexReport {
    pub added: usize,
    pub updated: usize,
    pub removed: usize,
    pub files_scanned: usize,
    pub sessions_created: usize,
    pub errors: Vec<String>,
}
