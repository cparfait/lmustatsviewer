//! Micro accordé d'office aux pages de l'app elle-même.
//!
//! Sans ça, WebView2 affiche sa propre demande (« http://tauri.localhost souhaite
//! utiliser vos microphones »), peu explicite, dès que l'app ouvre le micro
//! (push-to-talk, Coach IA) ou lit le nom des sorties audio (« Sortie audio de la
//! radio »). On accorde **seulement le micro**, et **seulement** aux pages servies
//! par l'app (protocole de prod, serveur Vite en dev) : une page tierce (iframe,
//! lien) garde la demande habituelle. Les réglages de confidentialité de Windows
//! (accès au micro) s'appliquent toujours.

use tauri::Manager;

/// Origines des pages de l'app en production (protocole personnalisé).
const APP_ORIGINS: &[&str] = &["http://tauri.localhost", "https://tauri.localhost"];

/// Vrai si `uri` est une page de l'app : protocole de prod, ou serveur de dev
/// (`dev_origin`, versions de développement seulement). Origine exacte, pas un
/// simple préfixe : `http://tauri.localhost.exemple.com` ne passe pas.
fn is_app_page(uri: &str, dev_origin: Option<&str>) -> bool {
    APP_ORIGINS.iter().copied().chain(dev_origin).any(|o| {
        uri.strip_prefix(o)
            .is_some_and(|rest| rest.is_empty() || rest.starts_with('/') || rest.starts_with('?') || rest.starts_with('#'))
    })
}

/// Origine du serveur de dev réellement utilisé (`build.devUrl`, y compris quand
/// `tauri dev --config` la change : port 5175 d'une instance parallèle…). `None`
/// dans une version installée : seules les pages `tauri.localhost` y passent.
fn dev_origin(win: &tauri::WebviewWindow) -> Option<String> {
    if !cfg!(debug_assertions) {
        return None;
    }
    win.config().build.dev_url.as_ref().map(|u| u.origin().ascii_serialization())
}

/// Branche l'autorisation sur la WebView de `win` (fenêtre principale, overlay).
pub fn allow_app_microphone(win: &tauri::WebviewWindow) {
    let label = win.label().to_string();
    let dev = dev_origin(win);
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
            let handler = PermissionRequestedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else { return Ok(()) };
                let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                args.PermissionKind(&mut kind)?;
                if kind != COREWEBVIEW2_PERMISSION_KIND_MICROPHONE {
                    return Ok(());
                }
                let mut uri = windows_core::PWSTR::null();
                args.Uri(&mut uri)?;
                if is_app_page(&webview2_com::take_pwstr(uri), dev.as_deref()) {
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
        assert!(is_app_page("http://tauri.localhost/", None));
        assert!(is_app_page("http://tauri.localhost/config?cat=voice", None));
        assert!(is_app_page("https://tauri.localhost", None));
        assert!(!is_app_page("http://tauri.localhost.exemple.com/", None));
        assert!(!is_app_page("http://127.0.0.1:8791/?w=radio", None));
        assert!(!is_app_page("https://exemple.com/", None));
        // Version installée : aucun serveur de dev accepté.
        assert!(!is_app_page("http://localhost:5173/live", None));
    }

    #[test]
    fn dev_server_is_the_configured_one() {
        // Port par défaut (tauri.conf.json) comme port changé par `tauri dev --config`.
        assert!(is_app_page("http://localhost:5173/live", Some("http://localhost:5173")));
        assert!(is_app_page("http://localhost:5175/config?cat=coach", Some("http://localhost:5175")));
        assert!(!is_app_page("http://localhost:5173/", Some("http://localhost:5175")));
        assert!(!is_app_page("http://localhost:51750/", Some("http://localhost:5175")));
        assert!(!is_app_page("http://localhost:5175.exemple.com/", Some("http://localhost:5175")));
    }
}
