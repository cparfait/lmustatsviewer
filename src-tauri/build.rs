use std::fs;
use std::path::Path;

fn main() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();

    let version_json_path = root.join("version.json");
    let raw = fs::read_to_string(&version_json_path)
        .expect("version.json introuvable a la racine du projet");
    let ver: serde_json::Value =
        serde_json::from_str(&raw).expect("version.json invalide");
    let version = ver["version"]
        .as_str()
        .expect("version.json: champ 'version' manquant ou non-string");

    println!("cargo:rustc-env=APP_VERSION={version}");
    println!("cargo:rerun-if-changed={}", version_json_path.display());

    sync_json_version(&root.join("src-tauri").join("tauri.conf.json"), version);
    sync_json_version(&root.join("package.json"), version);
    sync_toml_version(
        &Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml"),
        version,
    );

    tauri_build::build()
}

fn sync_json_version(path: &Path, version: &str) {
    if !path.exists() {
        return;
    }
    let content = fs::read_to_string(path).unwrap_or_default();
    let old_line = content.lines().find(|l| l.trim().starts_with("\"version\""));
    if let Some(old) = old_line {
        let trailing_comma = old.trim().ends_with(',');
        let new_line = if trailing_comma {
            format!("  \"version\": \"{}\",", version)
        } else {
            format!("  \"version\": \"{}\"", version)
        };
        if old != new_line {
            let updated = content.replacen(old, &new_line, 1);
            let _ = fs::write(path, updated);
        }
    }
}

fn sync_toml_version(path: &Path, version: &str) {
    if !path.exists() {
        return;
    }
    let content = fs::read_to_string(path).unwrap_or_default();
    let old_line = content
        .lines()
        .find(|l| l.trim().starts_with("version") && l.trim().contains('='));
    if let Some(old) = old_line {
        let new_line = format!("version = \"{}\"", version);
        if old.trim() != new_line {
            let updated = content.replacen(old.trim(), &new_line, 1);
            let _ = fs::write(path, updated);
        }
    }
}
