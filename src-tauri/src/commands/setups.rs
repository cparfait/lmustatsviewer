//! Garage — gestion des configurations de voiture (.svm).
//!
//! Repris de la V2 (exception à la règle « V1 = source de vérité » : la V2 est
//! plus aboutie pour le garage). Adapté au schéma V3 **mono-profil** : la table
//! `setups` n'a plus de colonne `profile_id`.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::{get_conn, DbState};
use crate::error::AppError;

// ─── Types partagés ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SvmHeader {
    pub vehicle_class: String,
    pub upgrade_setting: String,
    pub veh_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SvmSection {
    pub name: String,
    pub params: Vec<SvmParam>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SvmParam {
    pub key: String,
    pub value: String,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SvmFile {
    pub header: SvmHeader,
    pub sections: Vec<SvmSection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupEntry {
    pub id: i64,
    pub car: String,
    pub circuit: String,
    pub name: String,
    pub svm_path: String,
    pub updated_at: String,
    /// Type de setup (Course / Qualif / Autres). Métadonnée stockée en base.
    pub setup_type: String,
    /// `sessions.id` de la session de référence (best lap lié au setup, V1).
    /// `None` si aucune session liée.
    pub linked_session_id: Option<i64>,
    /// Origine : `"game"` (sur disque, lecture seule) ou `"app"` (créé via V3).
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupGroup {
    pub car: String,
    pub car_class: String,
    pub tracks: Vec<SetupTrack>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupTrack {
    pub name: String,
    pub setups: Vec<SetupSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupSummary {
    pub id: i64,
    pub name: String,
    pub svm_path: String,
    pub updated_at: String,
    pub setup_type: String,
    /// Origine : `"game"` ou `"app"` (cf. `SetupEntry.source`).
    pub source: String,
    /// `sessions.id` de la session liée (best lap de référence). `None` si aucune.
    pub linked_session_id: Option<i64>,
    /// `sessions.best_lap` de la session liée (en secondes). `None` si non lié.
    pub best_lap: Option<f64>,
}

// ─── Parser SVM ──────────────────────────────────────────────────────────────

pub fn parse_svm(content: &str) -> Result<SvmFile, AppError> {
    let mut header_vehicle_class = String::new();
    let mut header_upgrade = String::new();
    let mut header_veh: Option<String> = None;
    let mut sections: Vec<SvmSection> = Vec::new();
    let mut current_section: Option<SvmSection> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.is_empty() {
            continue;
        }

        if trimmed.starts_with("VehicleClassSetting=") {
            header_vehicle_class = trimmed
                .strip_prefix("VehicleClassSetting=")
                .unwrap_or("")
                .trim_matches('"')
                .to_string();
            continue;
        }

        if trimmed.starts_with("UpgradeSetting=") {
            header_upgrade = trimmed
                .strip_prefix("UpgradeSetting=")
                .unwrap_or("")
                .to_string();
            continue;
        }

        if trimmed.starts_with("//VEH=") {
            header_veh = Some(
                trimmed
                    .strip_prefix("//VEH=")
                    .unwrap_or("")
                    .to_string(),
            );
            continue;
        }

        if trimmed.starts_with("//") {
            continue;
        }

        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            if let Some(sec) = current_section.take() {
                sections.push(sec);
            }
            let name = trimmed
                .trim_start_matches('[')
                .trim_end_matches(']')
                .to_string();
            current_section = Some(SvmSection {
                name,
                params: Vec::new(),
            });
            continue;
        }

        if let Some(ref mut sec) = current_section {
            if let Some((key, rest)) = trimmed.split_once('=') {
                let (value, comment) = if let Some((val, cmt)) = rest.split_once("//") {
                    (val.to_string(), Some(cmt.to_string()))
                } else {
                    (rest.to_string(), None)
                };
                sec.params.push(SvmParam {
                    key: key.trim().to_string(),
                    value: value.trim().to_string(),
                    comment,
                });
            }
        }
    }

    if let Some(sec) = current_section.take() {
        sections.push(sec);
    }

    Ok(SvmFile {
        header: SvmHeader {
            vehicle_class: header_vehicle_class,
            upgrade_setting: header_upgrade,
            veh_path: header_veh,
        },
        sections,
    })
}

pub fn write_svm(file: &SvmFile) -> String {
    let mut out = String::new();

    out.push_str(&format!(
        "VehicleClassSetting=\"{}\"\n",
        file.header.vehicle_class
    ));
    out.push_str(&format!(
        "UpgradeSetting={}\n",
        file.header.upgrade_setting
    ));
    if let Some(ref veh) = file.header.veh_path {
        out.push_str(&format!("//VEH={}\n", veh));
    }
    out.push_str("//Note: settings commented out if using the default\n\n");

    for section in &file.sections {
        out.push_str(&format!("[{}]\n", section.name));
        for param in &section.params {
            if let Some(ref comment) = param.comment {
                out.push_str(&format!("{}={}//{}\n", param.key, param.value, comment));
            } else {
                out.push_str(&format!("{}={}\n", param.key, param.value));
            }
        }
        out.push('\n');
    }

    out
}

fn extract_car_class(vehicle_class: &str) -> String {
    let lower = vehicle_class.to_lowercase();
    if lower.contains("hypercar") || lower.contains("hybrid") {
        return "Hypercar".to_string();
    }
    if lower.contains("lmp3") {
        return "LMP3".to_string();
    }
    if lower.contains("gte") {
        return "GTE".to_string();
    }
    if lower.contains("gt3") || lower.contains("lmgt3") {
        return "GT3".to_string();
    }
    if lower.contains("lmp2") {
        if lower.contains("elms") {
            return "LMP2_ELMS".to_string();
        }
        return "LMP2_WEC".to_string();
    }
    "Unknown".to_string()
}

/// Indique si un jeton du `VehicleClassSetting` est du « bruit » : nom de
/// classe ou code de série/année (l'ordre des jetons varie selon les fichiers).
fn is_class_noise(token: &str) -> bool {
    let low = token.to_lowercase();
    if matches!(
        low.as_str(),
        "hypercar" | "lmh" | "lmdh" | "gt3" | "gte" | "lmgt3" | "lmp1"
            | "lmp2" | "lmp3" | "wec" | "elms"
    ) {
        return true;
    }
    // Codes de série : « wec2025 », « elms2024 »…
    for prefix in ["wec", "elms"] {
        if let Some(rest) = low.strip_prefix(prefix) {
            if !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit()) {
                return true;
            }
        }
    }
    false
}

/// Extrait le nom de la voiture depuis le `VehicleClassSetting`.
///
/// Ce champ mélange voiture, classe et code de série dans un ordre variable
/// (ex. `"ELMS2025 GT3 Mercedes_AMG_GT3"`, `"BMW_M4_LMGT3 GT3 WEC2024"`). On
/// retire les jetons « bruit » et on normalise les `_` pour ne garder que la
/// voiture — sinon le garage affiche des groupes erronés et bien trop nombreux.
fn extract_car_name(vehicle_class: &str) -> String {
    let normalized = vehicle_class.replace('_', " ");
    let kept: Vec<&str> = normalized
        .split_whitespace()
        .filter(|tok| !is_class_noise(tok))
        .collect();
    if kept.is_empty() {
        return "Unknown".to_string();
    }
    kept.join(" ")
}

// ─── Scan dossier Settings ───────────────────────────────────────────────────

/// Un setup `.svm` lu sur le disque, prêt à être inséré en base.
struct ScannedSetup {
    car: String,
    car_class: String,
    circuit: String,
    file_name: String,
    svm_path: String,
    content_json: String,
    updated_at: String,
}

#[tauri::command]
pub fn scan_setups(lmu_path: String, db: State<'_, DbState>) -> Result<Vec<SetupGroup>, AppError> {
    let settings_dir = PathBuf::from(&lmu_path)
        .join("UserData")
        .join("player")
        .join("Settings");

    if !settings_dir.is_dir() {
        return Err(AppError::NotFound(format!(
            "Dossier Settings introuvable: {}",
            settings_dir.display()
        )));
    }

    // 1) Parcours du disque — aucun accès base ici.
    let mut scanned: Vec<ScannedSetup> = Vec::new();

    for circuit_entry in fs::read_dir(&settings_dir).map_err(|e| AppError::Io(e))? {
        let circuit_entry = circuit_entry.map_err(|e| AppError::Io(e))?;
        if !circuit_entry.file_type().map_err(|e| AppError::Io(e))?.is_dir() {
            continue;
        }

        let circuit_name = circuit_entry.file_name().to_string_lossy().to_string();
        let circuit_path = circuit_entry.path();

        for svm_entry in fs::read_dir(&circuit_path).map_err(|e| AppError::Io(e))? {
            let svm_entry = svm_entry.map_err(|e| AppError::Io(e))?;
            let file_name = svm_entry.file_name();
            let file_name_str = file_name.to_string_lossy().to_string();

            if !file_name_str.to_lowercase().ends_with(".svm") {
                continue;
            }

            let svm_path = svm_entry.path();

            // Les `.svm` du jeu peuvent être encodés en Windows-1252 (Latin-1) :
            // lecture en octets + décodage permissif pour ne PAS faire échouer
            // tout le scan à cause d'un seul fichier mal encodé.
            let bytes = match fs::read(&svm_path) {
                Ok(b) => b,
                Err(_) => continue,
            };
            let content = String::from_utf8_lossy(&bytes);
            let parsed = match parse_svm(&content) {
                Ok(p) => p,
                Err(_) => continue,
            };

            let metadata = fs::metadata(&svm_path).map_err(|e| AppError::Io(e))?;
            let modified = metadata.modified().map_err(|e| AppError::Io(e))?;
            let datetime: chrono::DateTime<chrono::Local> = modified.into();

            scanned.push(ScannedSetup {
                car: extract_car_name(&parsed.header.vehicle_class),
                car_class: extract_car_class(&parsed.header.vehicle_class),
                circuit: circuit_name.clone(),
                file_name: file_name_str,
                svm_path: svm_path.to_string_lossy().to_string(),
                content_json: serde_json::to_string(&parsed)
                    .map_err(|e| AppError::Internal(format!("serialize svm: {e}")))?,
                updated_at: datetime.format("%Y-%m-%d %H:%M:%S").to_string(),
            });
        }
    }

    // 2) Écriture en base dans UNE transaction (atomique) — le verrou est tenu
    //    pendant toute l'opération : deux scans concurrents se sérialisent et
    //    `list_setups` ne voit jamais d'état partiel (DELETE sans les INSERT).
    let mut conn = get_conn(&db)?;

    // Métadonnées propres à la base (`setup_type`, `linked_session_id`,
    // `source`) mémorisées par chemin `.svm` AVANT de purger la table —
    // sinon on perdrait la distinction app/jeu et les sessions liées au
    // rescan.
    type SavedMeta = (String, Option<i64>, String); // (setup_type, linked, source)
    let mut existing_meta: std::collections::HashMap<String, SavedMeta> =
        std::collections::HashMap::new();
    {
        let mut stmt = conn
            .prepare("SELECT svm_path, setup_type, linked_session_id, source FROM setups")
            .map_err(|e| AppError::Database(format!("scan_setups meta: {e}")))?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<i64>>(2)?,
                    r.get::<_, String>(3)?,
                ))
            })
            .map_err(|e| AppError::Database(format!("scan_setups meta: {e}")))?;
        for row in rows {
            let (path, ty, linked, src) =
                row.map_err(|e| AppError::Database(format!("scan_setups meta: {e}")))?;
            existing_meta.insert(path, (ty, linked, src));
        }
    }

    let tx = conn
        .transaction()
        .map_err(|e| AppError::Database(format!("scan_setups tx: {e}")))?;
    tx.execute("DELETE FROM setups", [])
        .map_err(|e| AppError::Database(format!("scan_setups delete old: {e}")))?;

    let mut groups: BTreeMap<String, SetupGroup> = BTreeMap::new();

    for s in &scanned {
        // Si le `.svm` était déjà en base : on récupère ses métadonnées
        // (type/lien/source). Si c'est un nouveau fichier découvert sur
        // disque : source = "game" par défaut (créé in-game ou importé).
        let (setup_type, linked_session_id, source) = existing_meta
            .get(&s.svm_path)
            .cloned()
            .unwrap_or_else(|| ("Autres".to_string(), None, "game".to_string()));
        tx.execute(
            "INSERT INTO setups (car, circuit, name, svm_path, content_json, updated_at, setup_type, linked_session_id, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![&s.car, &s.circuit, &s.file_name, &s.svm_path, &s.content_json, &s.updated_at, &setup_type, &linked_session_id, &source],
        )
        .map_err(|e| AppError::Database(format!("scan_setups insert: {e}")))?;
        let setup_id = tx.last_insert_rowid();

        // best_lap de la session liée (None si aucune session ou session purgée).
        // `best_lap` est dans `results` (par pilote) — on prend la ligne joueur.
        let best_lap: Option<f64> = match linked_session_id {
            Some(sid) => tx
                .query_row(
                    "SELECT best_lap FROM results
                     WHERE session_id = ?1 AND is_player = 1 LIMIT 1",
                    params![sid],
                    |row| row.get::<_, Option<f64>>(0),
                )
                .unwrap_or(None),
            None => None,
        };

        let group = groups.entry(s.car.clone()).or_insert_with(|| SetupGroup {
            car: s.car.clone(),
            car_class: s.car_class.clone(),
            tracks: Vec::new(),
        });

        let summary = SetupSummary {
            id: setup_id,
            name: s.file_name.clone(),
            svm_path: s.svm_path.clone(),
            updated_at: s.updated_at.clone(),
            setup_type,
            source,
            linked_session_id,
            best_lap,
        };

        if let Some(track) = group.tracks.iter_mut().find(|t| t.name == s.circuit) {
            track.setups.push(summary);
        } else {
            group.tracks.push(SetupTrack {
                name: s.circuit.clone(),
                setups: vec![summary],
            });
        }
    }

    tx.commit()
        .map_err(|e| AppError::Database(format!("scan_setups commit: {e}")))?;

    Ok(groups.into_values().collect())
}

// ─── Lecture setup ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_setup(id: i64, db: State<'_, DbState>) -> Result<SetupEntry, AppError> {
    let conn = get_conn(&db)?;
    let row = conn
        .query_row(
            "SELECT id, car, circuit, name, svm_path, content_json, updated_at, setup_type, linked_session_id, source FROM setups WHERE id = ?1",
            params![id],
            |row| {
                Ok(SetupEntry {
                    id: row.get("id")?,
                    car: row.get("car")?,
                    circuit: row.get("circuit")?,
                    name: row.get("name")?,
                    svm_path: row.get("svm_path")?,
                    content_json: row.get("content_json")?,
                    updated_at: row.get("updated_at")?,
                    setup_type: row.get("setup_type")?,
                    linked_session_id: row.get("linked_session_id")?,
                    source: row.get("source")?,
                })
            },
        )
        .optional()
        .map_err(|e| AppError::Database(format!("get_setup: {e}")))?;

    row.ok_or_else(|| AppError::NotFound(format!("Setup {} non trouvé", id)))
}

#[tauri::command]
pub fn get_setup_content(id: i64, db: State<'_, DbState>) -> Result<SvmFile, AppError> {
    let entry = get_setup(id, db)?;

    let content_json = entry
        .content_json
        .ok_or_else(|| AppError::NotFound(format!("Pas de contenu JSON pour le setup {}", id)))?;

    let svm: SvmFile = serde_json::from_str(&content_json)
        .map_err(|e| AppError::Parse(format!("deserialize svm: {e}")))?;

    Ok(svm)
}

// ─── Mise à jour setup ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct UpdateSetupPayload {
    pub id: i64,
    pub sections: Vec<SvmSection>,
}

#[tauri::command]
pub fn update_setup(payload: UpdateSetupPayload, db: State<'_, DbState>) -> Result<(), AppError> {
    let entry = get_setup(payload.id, db.clone())?;

    // Protection : on refuse d'écraser un `.svm` venu du jeu (source = "game").
    // L'utilisateur doit d'abord dupliquer le setup s'il veut le modifier.
    // Évite les corruptions de fichiers du jeu pendant que V3 mûrit.
    if entry.source == "game" {
        return Err(AppError::Unsupported(
            "Ce setup vient du jeu : duplique-le d'abord pour l'éditer.".to_string(),
        ));
    }

    let content_json = entry.content_json.ok_or_else(|| {
        AppError::NotFound(format!("Pas de contenu JSON pour le setup {}", payload.id))
    })?;
    let mut svm: SvmFile = serde_json::from_str(&content_json)
        .map_err(|e| AppError::Parse(format!("deserialize svm: {e}")))?;

    for updated_section in &payload.sections {
        if let Some(sec) = svm.sections.iter_mut().find(|s| s.name == updated_section.name) {
            for updated_param in &updated_section.params {
                if let Some(param) = sec.params.iter_mut().find(|p| p.key == updated_param.key) {
                    param.value = updated_param.value.clone();
                }
            }
        }
    }

    let new_content = write_svm(&svm);

    fs::write(&entry.svm_path, &new_content).map_err(|e| AppError::Io(e))?;

    let new_json = serde_json::to_string(&svm)
        .map_err(|e| AppError::Internal(format!("serialize svm: {e}")))?;

    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let conn = get_conn(&db)?;
    conn.execute(
        "UPDATE setups SET content_json = ?1, updated_at = ?2 WHERE id = ?3",
        params![&new_json, &now, payload.id],
    )
    .map_err(|e| AppError::Database(format!("update_setup: {e}")))?;

    Ok(())
}

// ─── Duplication ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn duplicate_setup(
    id: i64,
    new_name: String,
    db: State<'_, DbState>,
) -> Result<SetupEntry, AppError> {
    let entry = get_setup(id, db.clone())?;

    let content_json = entry.content_json.ok_or_else(|| {
        AppError::NotFound(format!("Pas de contenu JSON pour le setup {}", id))
    })?;
    let svm: SvmFile = serde_json::from_str(&content_json)
        .map_err(|e| AppError::Parse(format!("deserialize svm: {e}")))?;

    let new_file_name = if new_name.to_lowercase().ends_with(".svm") {
        new_name
    } else {
        format!("{}.svm", new_name)
    };

    let svm_dir = Path::new(&entry.svm_path)
        .parent()
        .ok_or_else(|| AppError::Internal("Pas de dossier parent".to_string()))?;
    let new_svm_path = svm_dir.join(&new_file_name);

    let new_content = write_svm(&svm);
    fs::write(&new_svm_path, &new_content).map_err(|e| AppError::Io(e))?;

    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let conn = get_conn(&db)?;
    conn.execute(
        "INSERT INTO setups (car, circuit, name, svm_path, content_json, updated_at, setup_type, linked_session_id, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'app')",
        params![
            entry.car,
            entry.circuit,
            new_file_name,
            new_svm_path.to_string_lossy().to_string(),
            &content_json,
            &now,
            &entry.setup_type,
            // Duplication = on copie aussi la session de référence.
            &entry.linked_session_id,
        ],
    )
    .map_err(|e| AppError::Database(format!("duplicate_setup insert: {e}")))?;

    let new_id = conn.last_insert_rowid();

    Ok(SetupEntry {
        id: new_id,
        car: entry.car,
        circuit: entry.circuit,
        name: new_file_name,
        svm_path: new_svm_path.to_string_lossy().to_string(),
        content_json: Some(content_json),
        updated_at: now,
        setup_type: entry.setup_type,
        linked_session_id: entry.linked_session_id,
        // Duplication via V3 → l'enfant est un fichier géré par l'app
        // (modifiable même si l'original venait du jeu).
        source: "app".to_string(),
    })
}

/// Met à jour le type d'un setup (Course / Qualif / Autres).
#[tauri::command]
pub fn set_setup_type(
    id: i64,
    setup_type: String,
    db: State<'_, DbState>,
) -> Result<(), AppError> {
    let conn = get_conn(&db)?;
    conn.execute(
        "UPDATE setups SET setup_type = ?1 WHERE id = ?2",
        params![&setup_type, id],
    )
    .map_err(|e| AppError::Database(format!("set_setup_type: {e}")))?;
    Ok(())
}

/// Met à jour uniquement le paramètre `Notes` de la section `[GENERAL]` du
/// `.svm`. Délibérément découplé de `update_setup` : les notes sont une
/// annotation utilisateur légitime même sur un fichier importé du jeu —
/// on contourne donc le check `source = "game"`.
#[tauri::command]
pub fn set_setup_notes(
    id: i64,
    notes: String,
    db: State<'_, DbState>,
) -> Result<(), AppError> {
    let entry = get_setup(id, db.clone())?;

    let content_json = entry.content_json.ok_or_else(|| {
        AppError::NotFound(format!("Pas de contenu JSON pour le setup {}", id))
    })?;
    let mut svm: SvmFile = serde_json::from_str(&content_json)
        .map_err(|e| AppError::Parse(format!("deserialize svm: {e}")))?;

    // Notes vides → on retire le param Notes au lieu de stocker une chaîne
    // vide (cohérent avec l'absence de notes côté affichage).
    if notes.trim().is_empty() {
        if let Some(sec) = svm
            .sections
            .iter_mut()
            .find(|s| s.name.eq_ignore_ascii_case("GENERAL"))
        {
            sec.params.retain(|p| !p.key.eq_ignore_ascii_case("Notes"));
        }
    } else {
        upsert_general_notes(&mut svm, &notes);
    }

    let new_content = write_svm(&svm);
    fs::write(&entry.svm_path, &new_content).map_err(|e| AppError::Io(e))?;

    let new_json = serde_json::to_string(&svm)
        .map_err(|e| AppError::Internal(format!("serialize svm: {e}")))?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let conn = get_conn(&db)?;
    conn.execute(
        "UPDATE setups SET content_json = ?1, updated_at = ?2 WHERE id = ?3",
        params![&new_json, &now, id],
    )
    .map_err(|e| AppError::Database(format!("set_setup_notes: {e}")))?;

    Ok(())
}

// ─── Suppression ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn delete_setup(id: i64, delete_file: bool, db: State<'_, DbState>) -> Result<(), AppError> {
    let entry = get_setup(id, db.clone())?;

    if delete_file {
        let path = Path::new(&entry.svm_path);
        if path.exists() {
            fs::remove_file(path).map_err(|e| AppError::Io(e))?;
        }
    }

    let conn = get_conn(&db)?;
    conn.execute("DELETE FROM setups WHERE id = ?1", params![id])
        .map_err(|e| AppError::Database(format!("delete_setup: {e}")))?;

    Ok(())
}

// ─── Export ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn export_setup(id: i64, dest_path: String, db: State<'_, DbState>) -> Result<(), AppError> {
    let entry = get_setup(id, db)?;

    let content_json = entry.content_json.ok_or_else(|| {
        AppError::NotFound(format!("Pas de contenu JSON pour le setup {}", id))
    })?;
    let svm: SvmFile = serde_json::from_str(&content_json)
        .map_err(|e| AppError::Parse(format!("deserialize svm: {e}")))?;

    let content = write_svm(&svm);
    fs::write(&dest_path, content).map_err(|e| AppError::Io(e))?;

    Ok(())
}

// ─── Comparaison ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupDiffSection {
    pub name: String,
    pub params: Vec<SetupDiffParam>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupDiffParam {
    pub key: String,
    pub value_a: String,
    pub value_b: String,
    pub comment_a: Option<String>,
    pub comment_b: Option<String>,
    pub is_diff: bool,
}

#[tauri::command]
pub fn compare_setups(
    id_a: i64,
    id_b: i64,
    db: State<'_, DbState>,
) -> Result<Vec<SetupDiffSection>, AppError> {
    let svm_a = get_setup_content(id_a, db.clone())?;
    let svm_b = get_setup_content(id_b, db)?;

    let mut result: Vec<SetupDiffSection> = Vec::new();

    let all_section_names: Vec<String> = svm_a
        .sections
        .iter()
        .chain(svm_b.sections.iter())
        .map(|s| s.name.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    let mut names_sorted = all_section_names;
    names_sorted.sort();

    for name in names_sorted {
        let sec_a = svm_a.sections.iter().find(|s| s.name == name);
        let sec_b = svm_b.sections.iter().find(|s| s.name == name);

        let mut all_keys: std::collections::HashSet<String> = std::collections::HashSet::new();
        if let Some(s) = sec_a {
            for p in &s.params {
                all_keys.insert(p.key.clone());
            }
        }
        if let Some(s) = sec_b {
            for p in &s.params {
                all_keys.insert(p.key.clone());
            }
        }

        let mut keys_sorted: Vec<String> = all_keys.into_iter().collect();
        keys_sorted.sort();

        let mut diff_params: Vec<SetupDiffParam> = Vec::new();
        for key in keys_sorted {
            let pa = sec_a.and_then(|s| s.params.iter().find(|p| p.key == key));
            let pb = sec_b.and_then(|s| s.params.iter().find(|p| p.key == key));

            let val_a = pa.map(|p| p.value.clone()).unwrap_or_default();
            let val_b = pb.map(|p| p.value.clone()).unwrap_or_default();
            let cmt_a = pa.and_then(|p| p.comment.clone());
            let cmt_b = pb.and_then(|p| p.comment.clone());

            diff_params.push(SetupDiffParam {
                key,
                value_a: val_a,
                value_b: val_b,
                comment_a: cmt_a,
                comment_b: cmt_b,
                is_diff: pa.map(|p| p.value.clone()) != pb.map(|p| p.value.clone()),
            });
        }

        result.push(SetupDiffSection {
            name,
            params: diff_params,
        });
    }

    Ok(result)
}

// ─── Création d'un setup vierge ──────────────────────────────────────────────

#[tauri::command]
pub fn create_setup(
    lmu_path: String,
    circuit: String,
    name: String,
    vehicle_class: String,
    setup_type: Option<String>,
    notes: Option<String>,
    linked_session_id: Option<i64>,
    db: State<'_, DbState>,
) -> Result<SetupEntry, AppError> {
    let file_name = if name.to_lowercase().ends_with(".svm") {
        name.clone()
    } else {
        format!("{}.svm", name)
    };

    let settings_dir = PathBuf::from(&lmu_path)
        .join("UserData")
        .join("player")
        .join("Settings");
    let circuit_dir = settings_dir.join(&circuit);

    fs::create_dir_all(&circuit_dir).map_err(|e| AppError::Io(e))?;

    let svm_path = circuit_dir.join(&file_name);

    // Clone d'un `.svm` existant de la même voiture pour servir de template :
    // sinon le nouveau fichier serait vide et l'éditeur afficherait
    // « Aucun paramètre dans cette catégorie » dans tous les onglets.
    // Priorité aux templates du même dossier circuit, puis n'importe lequel.
    let target_car = extract_car_name(&vehicle_class);
    let mut svm = find_template_svm(&settings_dir, &target_car, &circuit)
        .unwrap_or_else(|| SvmFile {
            header: SvmHeader {
                vehicle_class: vehicle_class.clone(),
                upgrade_setting: String::new(),
                veh_path: None,
            },
            sections: Vec::new(),
        });

    // Toujours imposer le vehicle_class demandé par l'appelant (le template
    // pourrait venir d'une livrée différente).
    svm.header.vehicle_class = vehicle_class.clone();

    // V1 comportement : à la création, on garde la STRUCTURE des sections /
    // paramètres du template (pour que l'éditeur affiche les champs à remplir)
    // mais on VIDE les valeurs — l'utilisateur ne veut pas hériter des
    // réglages d'une autre voiture.
    for section in svm.sections.iter_mut() {
        // Exception : on préserve les champs « Notes » et identifiants de la
        // section [GENERAL] (sinon on perdrait les notes injectées juste après
        // pour un setup créé sans template).
        let is_general = section.name.eq_ignore_ascii_case("GENERAL");
        for param in section.params.iter_mut() {
            if is_general && param.key.eq_ignore_ascii_case("Notes") {
                continue; // sera mis à jour ci-dessous si `notes` fourni
            }
            param.value = String::new();
        }
    }

    // Notes pilote : insérées dans la section [GENERAL] du .svm.
    if let Some(notes_value) = notes.as_ref().filter(|s| !s.trim().is_empty()) {
        upsert_general_notes(&mut svm, notes_value);
    }

    let content = write_svm(&svm);
    fs::write(&svm_path, &content).map_err(|e| AppError::Io(e))?;

    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let car = extract_car_name(&vehicle_class);
    let content_json = serde_json::to_string(&svm)
        .map_err(|e| AppError::Internal(format!("serialize svm: {e}")))?;

    let final_type = setup_type
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("Autres")
        .to_string();

    let conn = get_conn(&db)?;
    conn.execute(
        "INSERT INTO setups (car, circuit, name, svm_path, content_json, updated_at, setup_type, linked_session_id, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'app')",
        params![&car, &circuit, &file_name, svm_path.to_string_lossy().to_string(), &content_json, &now, &final_type, &linked_session_id],
    ).map_err(|e| AppError::Database(format!("create_setup insert: {e}")))?;

    let new_id = conn.last_insert_rowid();

    Ok(SetupEntry {
        id: new_id,
        car,
        circuit,
        name: file_name,
        svm_path: svm_path.to_string_lossy().to_string(),
        content_json: Some(content_json),
        updated_at: now,
        setup_type: final_type,
        linked_session_id,
        source: "app".to_string(),
    })
}

/// Cherche un `.svm` existant dans `Settings/` à utiliser comme squelette
/// pour le nouveau setup. Priorité :
///   1. Même voiture + même circuit (cas idéal — vrais réglages pour le combo).
///   2. Même voiture, n'importe quel circuit.
///   3. Même **classe** (Hyper / LMP2 / GT3…), n'importe quel circuit
///      — fallback indispensable quand l'utilisateur crée son tout premier
///      setup pour une voiture donnée. Sans ça, l'éditeur s'ouvre vide
///      (« Aucun paramètre dans cette catégorie »).
fn find_template_svm(
    settings_dir: &std::path::Path,
    target_car: &str,
    preferred_circuit: &str,
) -> Option<SvmFile> {
    if !settings_dir.is_dir() {
        return None;
    }

    // Reconstitue la classe cible à partir du vehicle_class du futur setup.
    // On utilise la classe extraite côté appelant en ré-extrayant ici sur la
    // base du nom de voiture cible n'est PAS fiable : `extract_car_class`
    // a besoin du `vehicle_class` complet. On va donc déduire la classe à
    // partir du 1er match « même voiture » trouvé OU on accepte n'importe
    // quel .svm comme dernier recours.
    let mut same_car_any_circuit: Option<SvmFile> = None;
    let mut same_class: Option<SvmFile> = None;
    let mut any_template: Option<SvmFile> = None;

    let circuits = match fs::read_dir(settings_dir) {
        Ok(it) => it,
        Err(_) => return None,
    };

    // Première passe : collecte tous les .svm avec leur (car_name, car_class).
    // On itère deux fois pour pouvoir d'abord déterminer la classe cible
    // (depuis un .svm de la même voiture), puis chercher des same-class.
    let mut all_candidates: Vec<(SvmFile, String, String, bool)> = Vec::new();
    for circuit_entry in circuits.flatten() {
        if !circuit_entry.path().is_dir() {
            continue;
        }
        let circuit_name = circuit_entry.file_name().to_string_lossy().to_string();
        let in_preferred = circuit_name == preferred_circuit;

        let svms = match fs::read_dir(circuit_entry.path()) {
            Ok(it) => it,
            Err(_) => continue,
        };
        for svm_entry in svms.flatten() {
            let file_name = svm_entry.file_name().to_string_lossy().to_string();
            if !file_name.to_lowercase().ends_with(".svm") {
                continue;
            }
            let bytes = match fs::read(svm_entry.path()) {
                Ok(b) => b,
                Err(_) => continue,
            };
            let content = String::from_utf8_lossy(&bytes);
            let parsed = match parse_svm(&content) {
                Ok(p) => p,
                Err(_) => continue,
            };
            let car_name = extract_car_name(&parsed.header.vehicle_class);
            let car_class = extract_car_class(&parsed.header.vehicle_class);
            all_candidates.push((parsed, car_name, car_class, in_preferred));
        }
    }

    // Détermine la classe cible : prend le 1er match « même voiture » si
    // disponible (le plus fiable), sinon "Unknown" (= pas de filtre classe).
    let target_class = all_candidates
        .iter()
        .find(|(_, car, _, _)| car == target_car)
        .map(|(_, _, class, _)| class.clone())
        .unwrap_or_else(|| "Unknown".to_string());

    // Deuxième passe : classement par priorité.
    for (svm, car_name, car_class, in_preferred) in all_candidates {
        if car_name == target_car {
            if in_preferred {
                return Some(svm); // priorité 1
            }
            if same_car_any_circuit.is_none() {
                same_car_any_circuit = Some(svm); // priorité 2
                continue;
            }
        } else if car_class == target_class && target_class != "Unknown" {
            if same_class.is_none() {
                same_class = Some(svm); // priorité 3
                continue;
            }
        } else if any_template.is_none() {
            any_template = Some(svm); // dernier recours
        }
    }

    same_car_any_circuit.or(same_class).or(any_template)
}

/// Ajoute (ou met à jour) le paramètre `Notes` de la section `[GENERAL]`.
/// La valeur est entourée de guillemets (convention `.svm`).
fn upsert_general_notes(svm: &mut SvmFile, notes: &str) {
    let quoted = format!("\"{}\"", notes.replace('"', "\\\""));
    let section = svm
        .sections
        .iter_mut()
        .find(|s| s.name.eq_ignore_ascii_case("GENERAL"));
    if let Some(sec) = section {
        if let Some(p) = sec
            .params
            .iter_mut()
            .find(|p| p.key.eq_ignore_ascii_case("Notes"))
        {
            p.value = quoted;
        } else {
            sec.params.push(SvmParam {
                key: "Notes".to_string(),
                value: quoted,
                comment: None,
            });
        }
    } else {
        // Insère [GENERAL] en tête pour que la section soit toujours présente.
        svm.sections.insert(
            0,
            SvmSection {
                name: "GENERAL".to_string(),
                params: vec![SvmParam {
                    key: "Notes".to_string(),
                    value: quoted,
                    comment: None,
                }],
            },
        );
    }
}

// ─── Liste setups depuis la DB ───────────────────────────────────────────────

#[tauri::command]
pub fn list_setups(db: State<'_, DbState>) -> Result<Vec<SetupGroup>, AppError> {
    let conn = get_conn(&db)?;

    // LEFT JOIN sur la session liée (`linked_session_id`) pour récupérer le
    // `best_lap` du setup quand celui-ci est rattaché à une session (matrice
    // Garage : on peut afficher le chrono à côté du nom du setup).
    //
    // Note : `best_lap` est dans `results` (par pilote), pas dans `sessions`.
    // On joint donc `results` filtrée sur le joueur (`is_player = 1`).
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.car, s.circuit, s.name, s.svm_path, s.content_json,
                    s.updated_at, s.setup_type, s.linked_session_id, s.source,
                    r.best_lap
             FROM setups s
             LEFT JOIN results r
                    ON r.session_id = s.linked_session_id
                   AND r.is_player = 1
             ORDER BY s.car, s.circuit, s.name",
        )
        .map_err(|e| AppError::Database(format!("list_setups prepare: {e}")))?;

    // Tuple : (entrée brute, best_lap éventuel de la session liée).
    let rows = stmt
        .query_map([], |row| {
            Ok((
                SetupEntry {
                    id: row.get("id")?,
                    car: row.get("car")?,
                    circuit: row.get("circuit")?,
                    name: row.get("name")?,
                    svm_path: row.get("svm_path")?,
                    content_json: row.get("content_json")?,
                    updated_at: row.get("updated_at")?,
                    setup_type: row.get("setup_type")?,
                    linked_session_id: row.get("linked_session_id")?,
                    source: row.get("source")?,
                },
                row.get::<_, Option<f64>>("best_lap")?,
            ))
        })
        .map_err(|e| AppError::Database(format!("list_setups query: {e}")))?;

    let entries: Vec<(SetupEntry, Option<f64>)> = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::Database(format!("list_setups collect: {e}")))?;

    let mut groups_map: BTreeMap<String, SetupGroup> = BTreeMap::new();

    for (entry, best_lap) in &entries {
        let car_class = entry
            .content_json
            .as_ref()
            .and_then(|json| serde_json::from_str::<SvmFile>(json).ok())
            .map(|svm| extract_car_class(&svm.header.vehicle_class))
            .unwrap_or_else(|| "Unknown".to_string());

        let group = groups_map.entry(entry.car.clone()).or_insert_with(|| SetupGroup {
            car: entry.car.clone(),
            car_class: car_class.clone(),
            tracks: Vec::new(),
        });

        let summary = SetupSummary {
            id: entry.id,
            name: entry.name.clone(),
            svm_path: entry.svm_path.clone(),
            updated_at: entry.updated_at.clone(),
            setup_type: entry.setup_type.clone(),
            source: entry.source.clone(),
            linked_session_id: entry.linked_session_id,
            best_lap: *best_lap,
        };

        if let Some(track) = group.tracks.iter_mut().find(|t| t.name == entry.circuit) {
            track.setups.push(summary);
        } else {
            group.tracks.push(SetupTrack {
                name: entry.circuit.clone(),
                setups: vec![summary],
            });
        }
    }

    Ok(groups_map.into_values().collect())
}

// ─── Lien setup → session (best lap de référence, style V1) ─────────────────

/// Résumé d'une session candidate à servir de « meilleur tour lié » à un setup.
/// Renvoyé par `search_sessions_for_setup` pour alimenter le sélecteur côté UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupSessionMatch {
    pub session_id: i64,
    pub track: String,
    pub track_course: String,
    pub session_type: String,
    pub setting: String,
    pub car_class: String,
    pub unique_car_name: String,
    pub car_type: String,
    pub best_lap: Option<f64>,
    /// Secteurs du meilleur tour — pour afficher le détail dans la modale
    /// (« MEILLEUR TOUR LIÉ »).
    pub best_lap_s1: Option<f64>,
    pub best_lap_s2: Option<f64>,
    pub best_lap_s3: Option<f64>,
    pub timestamp: i64,
    pub game_version: String,
}

/// Cherche les sessions du joueur qui pourraient servir de référence pour le
/// setup en cours d'édition. Filtre approximatif sur la voiture (préfixe sur
/// `unique_car_name` ou `car_type`) ; l'utilisateur précise ensuite via la
/// liste qui affiche aussi circuit + date + best lap. Si `circuit` est fourni,
/// applique aussi le filtre exact `sessions.track = ?circuit`. Tri par best
/// lap ascendant, limite raisonnable.
/// `best_only` : si `true` (défaut), 1 seul meilleur tour par combo
/// (track, track_course). Si `false`, toutes les sessions (utile pour
/// comparer les temps réalisés avec différents setups sur un même circuit).
#[tauri::command]
pub fn search_sessions_for_setup(
    car: String,
    circuit: Option<String>,
    best_only: Option<bool>,
    db: State<'_, DbState>,
) -> Result<Vec<SetupSessionMatch>, AppError> {
    let best_only = best_only.unwrap_or(true);
    // Matching tolérant : on compare en lowercase ET sans espaces des deux
    // côtés. Le `car_type` du XML peut être avec ou sans espaces (« BMW M4 »,
    // « BMW_M4_LMGT3 », « Toyota GR010 Hybrid », …). On veut quand même
    // matcher quand l'utilisateur choisit « Toyota GR010 Hybrid » dans
    // l'inventaire LMU statique du front.
    let needle_loose = car.to_lowercase().replace([' ', '_', '-'], "");
    let contains_pat = format!("%{}%", needle_loose);

    // Matching circuit tolérant : `setup.circuit` est un NOM DE DOSSIER du jeu
    // (« Imola », « COTA », « Sebring »…) qui peut différer du `sessions.track`
    // (nom XML officiel, ex. « Autodromo Enzo e Dino Ferrari ») mais correspond
    // souvent au `sessions.track_course`. On normalise et on matche dans les
    // deux sens contre `track` ET `track_course`.
    let circuit_loose: Option<String> = circuit
        .as_deref()
        .map(|c| c.to_lowercase().replace([' ', '_', '-'], ""));
    let circuit_pat: Option<String> = circuit_loose.as_ref().map(|c| format!("%{c}%"));

    let conn = get_conn(&db)?;

    // SQL : matching « contient » dans les deux sens (sql contient needle OU
    // needle contient sql), après strippage des séparateurs côté SQL via
    // REPLACE imbriqués. Filtre circuit optionnel (?2/?4/?5 IS NULL ou match).
    //
    // GROUPAGE : on ne renvoie QUE LE MEILLEUR TOUR par combo
    // (track, track_course). Sinon l'utilisateur verrait 50 sessions Mercedes
    // sur Monza avec des chronos voisins — bruit pour choisir un « meilleur
    // tour lié ». Window function `ROW_NUMBER() OVER (PARTITION BY … ORDER BY
    // best_lap ASC)` puis filtre `rn = 1`.
    let sql = "
        WITH normalized AS (
            SELECT s.id AS session_id, x.track, x.track_course, s.session_type, x.setting,
                   r.car_class, r.unique_car_name, r.car_type, r.best_lap,
                   r.best_lap_s1, r.best_lap_s2, r.best_lap_s3,
                   x.timestamp, x.game_version,
                   LOWER(REPLACE(REPLACE(REPLACE(r.unique_car_name, ' ', ''), '_', ''), '-', '')) AS norm_unique,
                   LOWER(REPLACE(REPLACE(REPLACE(r.car_type, ' ', ''), '_', ''), '-', ''))        AS norm_type,
                   LOWER(REPLACE(REPLACE(REPLACE(x.track,        ' ', ''), '_', ''), '-', ''))    AS norm_track,
                   LOWER(REPLACE(REPLACE(REPLACE(x.track_course, ' ', ''), '_', ''), '-', ''))    AS norm_course
              FROM results r
              JOIN sessions s   ON s.id = r.session_id
              JOIN xml_index x  ON x.id = s.xml_id
             WHERE r.is_player = 1
               AND r.best_lap IS NOT NULL AND r.best_lap > 0
               AND (
                    ?2 IS NULL
                 OR norm_course LIKE ?4
                 OR norm_track  LIKE ?4
                 OR ?5 LIKE '%' || norm_course || '%'
                 OR ?5 LIKE '%' || norm_track  || '%'
               )
        ),
        filtered AS (
            SELECT session_id, track, track_course, session_type, setting,
                   car_class, unique_car_name, car_type, best_lap,
                   best_lap_s1, best_lap_s2, best_lap_s3,
                   timestamp, game_version,
                   ROW_NUMBER() OVER (
                       PARTITION BY track, track_course
                       ORDER BY best_lap ASC
                   ) AS rn
              FROM normalized
             WHERE norm_unique LIKE ?1
                OR norm_type   LIKE ?1
                -- Sens inverse : le car_type stocké peut être plus court que le
                -- libellé choisi (ex. DB = « Alpine A424 », front = « Alpine A424 EVO »).
                OR ?3 LIKE '%' || norm_unique || '%'
                OR ?3 LIKE '%' || norm_type   || '%'
        )
        SELECT session_id, track, track_course, session_type, setting,
               car_class, unique_car_name, car_type, best_lap,
               best_lap_s1, best_lap_s2, best_lap_s3,
               timestamp, game_version
          FROM filtered
         WHERE (?6 = 0 OR rn = 1)
         ORDER BY best_lap ASC
         LIMIT 100";

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| AppError::Database(format!("search_sessions_for_setup prepare: {e}")))?;

    let circuit_param: Option<&str> = circuit.as_deref();
    let circuit_pat_param: Option<&str> = circuit_pat.as_deref();
    let circuit_loose_param: Option<&str> = circuit_loose.as_deref();
    let best_only_flag: i64 = if best_only { 1 } else { 0 };
    let rows = stmt
        .query_map(
            params![
                &contains_pat,
                circuit_param,
                &needle_loose,
                circuit_pat_param,
                circuit_loose_param,
                best_only_flag,
            ],
            |row| {
            Ok(SetupSessionMatch {
                session_id: row.get("session_id")?,
                track: row.get("track")?,
                track_course: row.get("track_course")?,
                session_type: row.get("session_type")?,
                setting: row.get("setting")?,
                car_class: row.get("car_class")?,
                unique_car_name: row.get("unique_car_name")?,
                car_type: row.get("car_type")?,
                best_lap: row.get("best_lap")?,
                best_lap_s1: row.get("best_lap_s1")?,
                best_lap_s2: row.get("best_lap_s2")?,
                best_lap_s3: row.get("best_lap_s3")?,
                timestamp: row.get("timestamp")?,
                game_version: row.get("game_version")?,
            })
        })
        .map_err(|e| AppError::Database(format!("search_sessions_for_setup query: {e}")))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::Database(format!("search_sessions_for_setup collect: {e}")))
}

/// Retourne le résumé d'une session par son ID (lookup direct, sans matching
/// heuristique). Utilisé pour afficher le détail de la session liée à un setup
/// dans la modale d'édition. Renvoie `None` si la session n'existe plus.
#[tauri::command]
pub fn get_session_summary(
    session_id: i64,
    db: State<'_, DbState>,
) -> Result<Option<SetupSessionMatch>, AppError> {
    let conn = get_conn(&db)?;
    let sql = "
        SELECT s.id AS session_id, x.track, x.track_course, s.session_type, x.setting,
               r.car_class, r.unique_car_name, r.car_type, r.best_lap,
               r.best_lap_s1, r.best_lap_s2, r.best_lap_s3,
               x.timestamp, x.game_version
          FROM sessions s
          JOIN xml_index x ON x.id = s.xml_id
          JOIN results r   ON r.session_id = s.id AND r.is_player = 1
         WHERE s.id = ?1
         LIMIT 1";
    let result = conn.query_row(sql, params![session_id], |row| {
        Ok(SetupSessionMatch {
            session_id: row.get("session_id")?,
            track: row.get("track")?,
            track_course: row.get("track_course")?,
            session_type: row.get("session_type")?,
            setting: row.get("setting")?,
            car_class: row.get("car_class")?,
            unique_car_name: row.get("unique_car_name")?,
            car_type: row.get("car_type")?,
            best_lap: row.get("best_lap")?,
            best_lap_s1: row.get("best_lap_s1")?,
            best_lap_s2: row.get("best_lap_s2")?,
            best_lap_s3: row.get("best_lap_s3")?,
            timestamp: row.get("timestamp")?,
            game_version: row.get("game_version")?,
        })
    });
    match result {
        Ok(s) => Ok(Some(s)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(format!("get_session_summary: {e}"))),
    }
}

/// Met à jour (ou efface, si `session_id = None`) la session liée à un setup.
#[tauri::command]
pub fn set_setup_linked_session(
    setup_id: i64,
    session_id: Option<i64>,
    db: State<'_, DbState>,
) -> Result<(), AppError> {
    let conn = get_conn(&db)?;
    conn.execute(
        "UPDATE setups SET linked_session_id = ?1 WHERE id = ?2",
        params![&session_id, setup_id],
    )
    .map_err(|e| AppError::Database(format!("set_setup_linked_session: {e}")))?;
    Ok(())
}

// ─── Setups liés à une session (vue inverse, page Race Details) ──────────────

/// Résumé d'un setup affiché dans la page Race Details pour indiquer quel(s)
/// setup(s) a/ont été utilisé(s) lors d'une session. Inclut voiture et circuit
/// pour permettre l'affichage hors contexte (sans `SetupGroup` parent).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupForSession {
    pub id: i64,
    pub name: String,
    pub car: String,
    pub circuit: String,
    pub setup_type: String,
    /// Origine : `"game"` ou `"app"`.
    pub source: String,
    pub updated_at: String,
}

/// Retourne tous les setups dont `linked_session_id = ?session_id`. Vide si
/// aucun setup n'est associé à la session (cas par défaut).
#[tauri::command]
pub fn get_setups_for_session(
    session_id: i64,
    db: State<'_, DbState>,
) -> Result<Vec<SetupForSession>, AppError> {
    let conn = get_conn(&db)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, car, circuit, name, setup_type, source, updated_at
             FROM setups
             WHERE linked_session_id = ?1
             ORDER BY car, circuit, name",
        )
        .map_err(|e| AppError::Database(format!("get_setups_for_session prepare: {e}")))?;

    let rows = stmt
        .query_map(params![session_id], |row| {
            Ok(SetupForSession {
                id: row.get(0)?,
                car: row.get(1)?,
                circuit: row.get(2)?,
                name: row.get(3)?,
                setup_type: row.get(4)?,
                source: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| AppError::Database(format!("get_setups_for_session query: {e}")))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::Database(format!("get_setups_for_session collect: {e}")))
}
