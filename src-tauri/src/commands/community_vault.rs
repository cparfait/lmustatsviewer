//! Coffre Windows de l'identité communautaire (Gestionnaire d'identifications).
//!
//! Le jeton est aussi rangé ici, en plus de la base locale : il survit à la
//! désinstallation de l'app et à l'effacement de son dossier de données. Réactiver le
//! partage reprend alors la MÊME installation (même repère) au lieu d'en créer une
//! nouvelle, et « Supprimer mes données » peut encore atteindre le serveur.
//! Chiffré par Windows pour la session de l'utilisateur ; propre à ce PC.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct VaultEntry {
    /// Serveur de l'installation : une entrée n'est reprise que pour le même serveur.
    pub server: String,
    pub install_id: String,
    pub tag: String,
    pub token: String,
}

#[cfg(not(test))]
const TARGET: &str = "LMUStatsViewer/community";
/// Les tests n'écrivent jamais dans l'entrée réelle du joueur.
#[cfg(test)]
const TARGET: &str = "LMUStatsViewer/community-test";

#[cfg(windows)]
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
pub fn save(entry: &VaultEntry) -> bool {
    use windows::core::PWSTR;
    use windows::Win32::Security::Credentials::{CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC};
    let Ok(mut blob) = serde_json::to_vec(entry) else { return false };
    let mut target = wide(TARGET);
    let mut user = wide("LMU Stats Viewer");
    let cred = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: PWSTR(target.as_mut_ptr()),
        CredentialBlobSize: blob.len() as u32,
        CredentialBlob: blob.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        UserName: PWSTR(user.as_mut_ptr()),
        ..Default::default()
    };
    // SAFETY : tous les pointeurs restent valides pendant l'appel (tampons locaux).
    unsafe { CredWriteW(&cred, 0).is_ok() }
}

#[cfg(windows)]
pub fn load() -> Option<VaultEntry> {
    use windows::core::PCWSTR;
    use windows::Win32::Security::Credentials::{CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC};
    let target = wide(TARGET);
    let mut p: *mut CREDENTIALW = std::ptr::null_mut();
    // SAFETY : `p` est alloué par Windows et libéré par `CredFree` après copie du blob.
    unsafe {
        CredReadW(PCWSTR(target.as_ptr()), CRED_TYPE_GENERIC, 0, &mut p).ok()?;
        let c = &*p;
        let bytes = if c.CredentialBlob.is_null() {
            Vec::new()
        } else {
            std::slice::from_raw_parts(c.CredentialBlob, c.CredentialBlobSize as usize).to_vec()
        };
        CredFree(p as *const core::ffi::c_void);
        serde_json::from_slice(&bytes).ok()
    }
}

#[cfg(windows)]
pub fn clear() {
    use windows::core::PCWSTR;
    use windows::Win32::Security::Credentials::{CredDeleteW, CRED_TYPE_GENERIC};
    let target = wide(TARGET);
    // SAFETY : chaîne terminée par zéro, valide pendant l'appel. Absente = rien à faire.
    unsafe {
        let _ = CredDeleteW(PCWSTR(target.as_ptr()), CRED_TYPE_GENERIC, 0);
    }
}

#[cfg(not(windows))]
pub fn save(_entry: &VaultEntry) -> bool {
    false
}
#[cfg(not(windows))]
pub fn load() -> Option<VaultEntry> {
    None
}
#[cfg(not(windows))]
pub fn clear() {}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn aller_retour_puis_effacement() {
        let e = VaultEntry {
            server: "https://lmu.test".into(),
            install_id: "8a9bfad8-c61c-4c59-9395-5fe91731f379".into(),
            tag: "#d3c7".into(),
            token: "t".repeat(43),
        };
        clear();
        assert_eq!(load(), None);
        assert!(save(&e));
        assert_eq!(load(), Some(e));
        clear();
        assert_eq!(load(), None);
    }
}
