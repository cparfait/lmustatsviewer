//! Overlays in-game — fenêtre transparente unique, always-on-top, click-through.
//!
//! Une seule fenêtre (`label = "overlay"`) couvre le moniteur principal. Elle est
//! transparente, sans bordure et ignore les événements souris (click-through) en
//! mode normal → les clics passent au jeu. Le **mode Édition** réactive la souris
//! pour permettre de déplacer les widgets, et émet `overlay-edit-mode` vers le front.
//!
//! Toute la manipulation de fenêtre se fait ici (Rust) : la fenêtre `main` n'a donc
//! pas besoin de permissions JS supplémentaires pour créer/piloter l'overlay.
//!
//! ⚠️ Ces commandes sont **`async`** (pas `fn` sync). En Tauri 2, une commande
//! synchrone s'exécute sur le **thread principal** (la boucle d'événements) ; or
//! la création/manipulation de fenêtre (`build`, `set_focus`,
//! `set_ignore_cursor_events`…) doit passer par cette même boucle → une commande
//! sync qui les appelle **bloque le thread principal en attendant le thread
//! principal** = deadlock (tout le backend gèle). En les rendant `async`, elles
//! tournent hors du thread principal et les opérations de fenêtre s'exécutent
//! normalement.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl,
    WebviewWindowBuilder,
};

use crate::error::AppError;

const OVERLAY_LABEL: &str = "overlay";

/// État courant du mode Édition. La fenêtre overlay le **relit au boot**
/// (`get_overlay_edit_mode`) : l'event `overlay-edit-mode` émis pendant sa
/// création serait sinon perdu (webview pas encore abonné) → le premier
/// passage en édition n'était jamais appliqué.
static EDIT_MODE: AtomicBool = AtomicBool::new(false);

/// Ouvre (ou ré-affiche) la fenêtre overlay, dimensionnée sur le moniteur principal.
#[tauri::command]
pub async fn open_overlay_window(app: AppHandle) -> Result<(), AppError> {
    // Déjà ouverte → on la remet au premier plan en **click-through** (mode normal).
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = win.show();
        let _ = win.set_always_on_top(true);
        let _ = win.set_ignore_cursor_events(true);
        return Ok(());
    }

    // IMPORTANT : on construit la fenêtre **visible** (pas `.visible(false)` + `.show()`).
    // Sur Windows, construire la fenêtre cachée puis appeler `.show()` depuis un thread
    // de commande ne met PAS WS_VISIBLE → la fenêtre existe mais reste invisible.
    let win = WebviewWindowBuilder::new(
        &app,
        OVERLAY_LABEL,
        WebviewUrl::App("index.html".into()),
    )
    .title("LMU Overlay")
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(false)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .focused(false)
    .build()
    .map_err(|e| AppError::Internal(format!("création fenêtre overlay : {e}")))?;

    // Couvre tout le moniteur principal (taille + position physiques).
    if let Ok(Some(monitor)) = win.primary_monitor() {
        let size = *monitor.size();
        let pos = *monitor.position();
        let _ = win.set_position(PhysicalPosition::new(pos.x, pos.y));
        let _ = win.set_size(PhysicalSize::new(size.width, size.height));
    }

    let _ = win.set_always_on_top(true);
    let _ = win.show();
    // Click-through en DERNIER (après show/resize) : sinon Windows peut réarmer la
    // capture souris au moment de l'affichage et la fenêtre fige tout l'écran.
    let _ = win.set_ignore_cursor_events(true);
    Ok(())
}

/// Ferme la fenêtre overlay (libère le webview et son abonnement live-data).
#[tauri::command]
pub async fn close_overlay_window(app: AppHandle) -> Result<(), AppError> {
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = win.close();
    }
    // Fermer la fenêtre sort de facto du mode Édition : on synchronise l'état
    // et l'UI (bouton de la page principale).
    if EDIT_MODE.swap(false, Ordering::SeqCst) {
        let _ = app.emit("overlay-edit-mode", false);
    }
    Ok(())
}

/// Bascule le mode Édition : réactive la souris (drag) ou rétablit le click-through.
/// Émet `overlay-edit-mode` (bool) à toutes les fenêtres pour piloter l'UI.
#[tauri::command]
pub async fn set_overlay_edit_mode(app: AppHandle, editing: bool) -> Result<(), AppError> {
    EDIT_MODE.store(editing, Ordering::SeqCst);
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        // editing → la fenêtre capte la souris ; sinon → click-through.
        let _ = win.set_ignore_cursor_events(!editing);
        let _ = win.set_always_on_top(true);
        if editing {
            let _ = win.set_focus();
        }
    }
    let _ = app.emit("overlay-edit-mode", editing);
    Ok(())
}

/// Force l'état click-through de la fenêtre overlay. Rappelé par le front au
/// montage (webview prêt) pour garantir le click-through même si l'application
/// initiale au moment du `build` n'a pas pris.
#[tauri::command]
pub async fn set_overlay_clickthrough(app: AppHandle, enable: bool) -> Result<(), AppError> {
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = win.set_ignore_cursor_events(enable);
        let _ = win.set_always_on_top(true);
    }
    Ok(())
}

/// Indique si la fenêtre overlay est actuellement ouverte.
#[tauri::command]
pub async fn is_overlay_open(app: AppHandle) -> Result<bool, AppError> {
    Ok(app.get_webview_window(OVERLAY_LABEL).is_some())
}

/// État courant du mode Édition — interrogé par la fenêtre overlay à son
/// montage pour rattraper un `overlay-edit-mode` émis avant son abonnement.
#[tauri::command]
pub async fn get_overlay_edit_mode() -> Result<bool, AppError> {
    Ok(EDIT_MODE.load(Ordering::SeqCst))
}
