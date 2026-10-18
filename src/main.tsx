import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { OverlayApp } from "./components/overlay/OverlayApp";
import { WidgetIndex, WidgetPage } from "./components/overlay/WidgetPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { isTauri } from "./lib/api";
import { i18nReady } from "./i18n";
import "./index.css";

// Détecte la fenêtre courante : la fenêtre `overlay` (transparente, créée par le
// backend) charge le même bundle mais rend uniquement les overlays — sans Header,
// Footer, router ni les hooks globaux de l'app principale.
function currentWindowLabel(): string {
  try {
    return getCurrentWindow().label;
  } catch {
    return "main";
  }
}

// With i18next v26, init() is always async even with inline resources.
// We wait for the promise before the first render so t() always returns
// translated strings — never raw keys.
i18nReady.then(() => {
  const root = createRoot(document.getElementById("root")!);
  if (!isTauri()) {
    // Hors de l'app : page servie par le serveur de widgets (VR OpenKneeboard,
    // OBS, navigateur) — un widget seul (`?w=<id>`) ou la liste des widgets.
    const w = new URLSearchParams(location.search).get("w");
    root.render(
      <StrictMode>
        <ErrorBoundary fallback={null}>{w ? <WidgetPage id={w} /> : <WidgetIndex />}</ErrorBoundary>
      </StrictMode>,
    );
  } else if (currentWindowLabel() === "overlay") {
    // Filet de sécurité : un crash de rendu ne doit pas laisser la fenêtre
    // overlay transparente et gelée pendant toute la course. Repli = rien
    // (`null`) plutôt que la carte plein écran de l'app principale.
    root.render(
      <StrictMode>
        <ErrorBoundary fallback={null}>
          <OverlayApp />
        </ErrorBoundary>
      </StrictMode>,
    );
  } else {
    root.render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    );
  }
});
