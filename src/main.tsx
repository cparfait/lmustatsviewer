import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { OverlayApp } from "./components/overlay/OverlayApp";
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
  if (currentWindowLabel() === "overlay") {
    root.render(
      <StrictMode>
        <OverlayApp />
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
