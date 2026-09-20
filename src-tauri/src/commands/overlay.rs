//! Overlays in-game — fenêtre transparente unique, always-on-top, click-through.
//!
//! Une seule fenêtre (`label = "overlay"`) couvre **tous les écrans** (le bureau
//! virtuel, cf. `virtual_desktop_bounds`) et non le seul moniteur principal : un
//! widget peut ainsi être glissé sur n'importe quel écran. Elle est
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

/// Rectangle englobant **tous** les moniteurs (bureau virtuel), en pixels physiques.
///
/// Sous Windows, le moniteur principal est toujours à `(0,0)` : un écran placé à sa
/// gauche ou au-dessus a donc des coordonnées **négatives**, et l'origine renvoyée
/// ici peut l'être aussi. C'est cette origine que `get_overlay_origin` traduit pour
/// le front, afin que les positions déjà enregistrées (relatives à l'écran
/// principal) restent valables.
///
/// `None` si aucun moniteur n'est énumérable → l'appelant laisse alors la fenêtre
/// où le système l'a mise plutôt que de la placer n'importe où.
fn virtual_desktop_bounds(
    win: &tauri::WebviewWindow,
) -> Option<(PhysicalPosition<i32>, PhysicalSize<u32>)> {
    let monitors = win.available_monitors().ok()?;
    let (mut min_x, mut min_y) = (i32::MAX, i32::MAX);
    let (mut max_x, mut max_y) = (i32::MIN, i32::MIN);
    for m in &monitors {
        let (p, s) = (m.position(), m.size());
        min_x = min_x.min(p.x);
        min_y = min_y.min(p.y);
        max_x = max_x.max(p.x + s.width as i32);
        max_y = max_y.max(p.y + s.height as i32);
    }
    if min_x > max_x || min_y > max_y {
        return None; // liste vide
    }
    Some((
        PhysicalPosition::new(min_x, min_y),
        PhysicalSize::new((max_x - min_x) as u32, (max_y - min_y) as u32),
    ))
}

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

    // Couvre TOUS les écrans (taille + position physiques). Se limiter au moniteur
    // principal enfermait les widgets dessus : on ne pouvait pas en déposer un sur
    // un second écran, cas courant en simracing.
    if let Some((pos, size)) = virtual_desktop_bounds(&win) {
        let _ = win.set_position(pos);
        let _ = win.set_size(size);
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

/// Rectangle de l'écran **principal** dans la fenêtre overlay, en pixels **CSS**.
#[derive(serde::Serialize)]
pub struct OverlayOrigin {
    pub x: f64,
    pub y: f64,
    /// Taille de l'écran principal — sert à centrer ce qui doit l'être sur LUI
    /// (le message du mode Édition) et non au milieu du bureau virtuel.
    /// `0` si l'écran principal n'est pas identifiable → le front retombe sur
    /// un centrage relatif à la fenêtre.
    pub w: f64,
    pub h: f64,
    /// Chaque écran, dans le repère de la fenêtre (px CSS). Sert à peindre le
    /// voile du mode Édition **écran par écran** : un seul voile plein cadre
    /// n'est plus peint en entier au-delà d'environ 8192 px de large (limite de
    /// texture du compositeur) — mesuré sur un bureau de 10240 px.
    pub screens: Vec<OverlayScreen>,
}

/// Un écran dans le repère de la fenêtre overlay (px CSS).
#[derive(serde::Serialize)]
pub struct OverlayScreen {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    /// **Numéro Windows** de l'écran, celui des Paramètres d'affichage (bouton
    /// « Identifier »). Extrait du nom système `\\.\DISPLAYn`.
    ///
    /// Surtout pas un index calculé de notre côté : les numéros Windows ne sont
    /// ni contigus ni ordonnés par position (un écran déconnecté garde le sien —
    /// relevé sur un poste : écrans 1, 3 et 4 connectés, le 2 absent). Numéroter
    /// nous-mêmes afficherait donc un numéro que l'utilisateur ne reconnaîtrait
    /// pas. `None` si le nom n'a pas la forme attendue → le front n'affiche alors
    /// aucun numéro plutôt qu'un numéro faux.
    pub number: Option<u32>,
}

/// Numéro Windows depuis un nom de moniteur (`\\.\DISPLAY3` → `3`).
fn display_number(name: Option<String>) -> Option<u32> {
    let n = name?;
    let digits: String = n.chars().skip_while(|c| !c.is_ascii_digit()).collect();
    digits.parse().ok()
}

/// Décalage à appliquer aux positions enregistrées des widgets.
///
/// Depuis que la fenêtre couvre tout le bureau virtuel, son coin haut-gauche n'est
/// plus celui de l'écran principal : un écran à gauche du principal décale l'origine
/// vers les x négatifs. Les positions des widgets restant enregistrées **relatives à
/// l'écran principal** (aucune migration de config, les dispositions existantes ne
/// bougent pas), le front décale simplement tout le calque de widgets de cette
/// valeur. Un widget déposé sur l'écran de gauche a donc un x négatif, ce qui est
/// exactement ce qu'on veut.
///
/// Renvoie `(0,0)` si la fenêtre n'est pas ouverte ou si les moniteurs ne sont pas
/// énumérables : on retombe alors sur l'ancien comportement, sans rien casser.
#[tauri::command]
pub async fn get_overlay_origin(app: AppHandle) -> Result<OverlayOrigin, AppError> {
    let zero = OverlayOrigin { x: 0.0, y: 0.0, w: 0.0, h: 0.0, screens: Vec::new() };
    let Some(win) = app.get_webview_window(OVERLAY_LABEL) else {
        return Ok(zero);
    };
    let Some((pos, _)) = virtual_desktop_bounds(&win) else {
        return Ok(zero);
    };
    // Les moniteurs sont en pixels physiques, le front raisonne en pixels CSS.
    let scale = win.scale_factor().unwrap_or(1.0).max(0.1);
    let (w, h) = match win.primary_monitor() {
        Ok(Some(m)) => {
            let s = *m.size();
            (s.width as f64 / scale, s.height as f64 / scale)
        }
        _ => (0.0, 0.0),
    };
    let screens = win
        .available_monitors()
        .map(|ms| {
            ms.iter()
                .map(|m| {
                    let (mp, ms_) = (m.position(), m.size());
                    OverlayScreen {
                        x: (mp.x - pos.x) as f64 / scale,
                        y: (mp.y - pos.y) as f64 / scale,
                        w: ms_.width as f64 / scale,
                        h: ms_.height as f64 / scale,
                        number: display_number(m.name().cloned()),
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(OverlayOrigin {
        x: -(pos.x as f64) / scale,
        y: -(pos.y as f64) / scale,
        w,
        h,
        screens,
    })
}

/// Recalcule taille et position de la fenêtre overlay sur le bureau virtuel courant.
///
/// Appelée quand la disposition des écrans change pendant que l'app tourne. Sans
/// ça la fenêtre garde les dimensions de son ouverture : les widgets — dont le
/// bouton de sortie du mode Édition — peuvent alors tomber hors de tout écran,
/// et comme le mode Édition capture la souris, on se retrouve coincé.
#[tauri::command]
pub async fn refresh_overlay_bounds(app: AppHandle) -> Result<(), AppError> {
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        if let Some((pos, size)) = virtual_desktop_bounds(&win) {
            let _ = win.set_position(pos);
            let _ = win.set_size(size);
        }
        // Redimensionner réarme la capture souris côté Windows (même raison que
        // le click-through appliqué en dernier à l'ouverture). Sans ce rappel,
        // un recalage en plein mode Édition rendait la fenêtre click-through :
        // les clics traversaient et plus aucun widget n'était déplaçable.
        let editing = EDIT_MODE.load(Ordering::SeqCst);
        let _ = win.set_ignore_cursor_events(!editing);
        let _ = win.set_always_on_top(true);
    }
    Ok(())
}

/// Écrans actifs en pixels CSS, **relatifs à l'écran principal** — donc dans le
/// même repère que les positions enregistrées des widgets, directement comparable.
///
/// Sert à la page Overlays pour indiquer sur quel écran se trouve chaque overlay
/// actif. Volontairement indépendant de la fenêtre overlay : n'importe quelle
/// fenêtre sait énumérer les moniteurs, et l'information doit s'afficher même
/// overlay fermé.
#[tauri::command]
pub async fn get_overlay_screens(app: AppHandle) -> Result<Vec<OverlayScreen>, AppError> {
    let Some(win) = app
        .get_webview_window(OVERLAY_LABEL)
        .or_else(|| app.get_webview_window("main"))
    else {
        return Ok(Vec::new());
    };
    let scale = win.scale_factor().unwrap_or(1.0).max(0.1);
    Ok(win
        .available_monitors()
        .map(|ms| {
            ms.iter()
                .map(|m| {
                    // L'écran principal est à (0,0) en coordonnées physiques :
                    // diviser par l'échelle suffit à passer en px CSS.
                    let (mp, sz) = (m.position(), m.size());
                    OverlayScreen {
                        x: mp.x as f64 / scale,
                        y: mp.y as f64 / scale,
                        w: sz.width as f64 / scale,
                        h: sz.height as f64 / scale,
                        number: display_number(m.name().cloned()),
                    }
                })
                .collect()
        })
        .unwrap_or_default())
}
