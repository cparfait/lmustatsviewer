//! Micro accordé d'office aux pages de l'app elle-même.
//!
//! Sans ça, WebView2 affiche sa propre demande (« http://tauri.localhost souhaite
//! utiliser vos microphones »), peu explicite, dès que l'app ouvre le micro
//! (push-to-talk, Coach IA) ou lit le nom des sorties audio (« Sortie audio de la
//! radio »). On accorde **seulement le micro**, et **seulement** aux pages servies
//! par l'app (protocole de prod, serveur Vite en dev) : une page tierce (iframe,
//! lien) garde la demande habituelle. Les réglages de confidentialité de Windows
//! (accès au micro) s'appliquent toujours.

/// Origines des pages de l'app : protocole personnalisé (prod) et serveur Vite (dev).
const APP_ORIGINS: &[&str] = &["http://tauri.localhost", "https://tauri.localhost", "http://localhost:5173"];

/// Vrai si `uri` est une page de l'app (origine exacte, pas un simple préfixe :
/// `http://tauri.localhost.exemple.com` ne passe pas).
fn is_app_page(uri: &str) -> bool {
    APP_ORIGINS.iter().any(|o| {
        uri.strip_prefix(o)
            .is_some_and(|rest| rest.is_empty() || rest.starts_with('/') || rest.starts_with('?') || rest.starts_with('#'))
    })
}

/// Branche l'autorisation sur la WebView de `win` (fenêtre principale, overlay).
pub fn allow_app_microphone(win: &tauri::WebviewWindow) {
    let label = win.label().to_string();
    let res = win.with_webview(move |wv| {
        #[cfg(windows)]
        unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::{
                COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
                COREWEBVIEW2_PERMISSION_STATE_ALLOW,
            };
            use webview2_com::PermissionRequestedEventHandler;

            let core = match wv.controller().CoreWebView2() {
                Ok(c) => c,
                Err(e) => {
                    crate::app_warn!("micro : WebView « {label} » inaccessible : {e}");
                    return;
                }
            };
            let handler = PermissionRequestedEventHandler::create(Box::new(|_, args| {
                let Some(args) = args else { return Ok(()) };
                let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                args.PermissionKind(&mut kind)?;
                if kind != COREWEBVIEW2_PERMISSION_KIND_MICROPHONE {
                    return Ok(());
                }
                let mut uri = windows_core::PWSTR::null();
                args.Uri(&mut uri)?;
                if is_app_page(&webview2_com::take_pwstr(uri)) {
                    args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                }
                Ok(())
            }));
            let mut token = 0;
            if let Err(e) = core.add_PermissionRequested(&handler, &mut token) {
                crate::app_warn!("micro : autorisation non branchée sur « {label} » : {e}");
            }
        }
    });
    if let Err(e) = res {
        crate::app_warn!("micro : WebView « {} » : {e}", win.label());
    }
}

#[cfg(test)]
mod tests {
    use super::is_app_page;

    #[test]
    fn app_pages_only() {
        assert!(is_app_page("http://tauri.localhost/"));
        assert!(is_app_page("http://tauri.localhost/config?cat=voice"));
        assert!(is_app_page("https://tauri.localhost"));
        assert!(is_app_page("http://localhost:5173/live"));
        assert!(!is_app_page("http://tauri.localhost.exemple.com/"));
        assert!(!is_app_page("http://localhost:51730/"));
        assert!(!is_app_page("http://127.0.0.1:8791/?w=radio"));
        assert!(!is_app_page("https://exemple.com/"));
    }
}
