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

    setup_vosk();

    tauri_build::build()
}

/// Expose la lib native `libvosk` au linker et copie la DLL à côté du binaire de
/// dev (chargement implicite → la DLL doit être trouvable au démarrage du process).
/// Les assets sont fetchés par `scripts/fetch-vosk.ps1` dans `resources/stt/lib/`.
/// No-op si la feature `stt` n'est pas activée (l'app compile sans les assets Vosk).
fn setup_vosk() {
    if std::env::var("CARGO_FEATURE_STT").is_err() {
        return;
    }
    let lib_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("stt")
        .join("lib");
    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    println!("cargo:rerun-if-changed={}", lib_dir.display());

    // Copie TOUTES les DLL (libvosk.dll + ses dépendances MinGW : libgcc, libstdc++,
    // libwinpthread) dans le dossier de profil (target/<profile>/) pour le dev. Elles
    // doivent être à côté de l'exe car libvosk.dll est chargée au démarrage du process
    // (lien implicite) et résout ses propres dépendances à ce moment-là.
    #[cfg(target_os = "windows")]
    {
        if let Ok(out) = std::env::var("OUT_DIR") {
            // OUT_DIR = target/<profile>/build/<pkg>/out → remonter à target/<profile>.
            if let Some(profile_dir) = Path::new(&out).ancestors().nth(3) {
                if let Ok(rd) = fs::read_dir(&lib_dir) {
                    for e in rd.flatten() {
                        let p = e.path();
                        if p.extension().and_then(|x| x.to_str()) == Some("dll") {
                            if let Some(name) = p.file_name() {
                                let _ = fs::copy(&p, profile_dir.join(name));
                            }
                        }
                    }
                }
            }
        }
    }
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
