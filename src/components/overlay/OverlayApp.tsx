/**
 * Racine de la fenêtre `overlay`.
 *
 * Force un fond 100 % transparent (la fenêtre Tauri est transparente + click-through)
 * et monte le moteur de rendu des overlays. Aucun Header/Footer/router.
 */

import { useEffect } from "react";
import { overlay as overlayApi } from "@/lib/api";
import { OverlayRoot } from "./OverlayRoot";

export function OverlayApp() {
  // Au montage (webview prêt), on REforce le click-through : c'est le filet de
  // sécurité contre une fenêtre overlay qui figerait toute la souris au lancement.
  // Exception : si le mode Édition a été demandé pendant la création de la
  // fenêtre (1er overlay activé), forcer le click-through annulerait le drag —
  // on aligne donc le click-through sur l'état édition courant.
  useEffect(() => {
    overlayApi
      .getEditMode()
      .then((editing) => overlayApi.setClickThrough(!editing))
      .catch(() => overlayApi.setClickThrough(true).catch(() => {}));
  }, []);

  useEffect(() => {
    // Transparence : on neutralise les fonds définis par index.css.
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlBg: html.style.background,
      bodyBg: body.style.background,
      bodyColor: body.style.color,
    };
    html.style.background = "transparent";
    body.style.background = "transparent";
    body.classList.add("overlay-window");
    return () => {
      html.style.background = prev.htmlBg;
      body.style.background = prev.bodyBg;
      body.style.color = prev.bodyColor;
      body.classList.remove("overlay-window");
    };
  }, []);

  return <OverlayRoot />;
}
