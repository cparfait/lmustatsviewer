import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import { i18nReady } from "./i18n";
import "./index.css";

// With i18next v26, init() is always async even with inline resources.
// We wait for the promise before the first render so t() always returns
// translated strings — never raw keys.
i18nReady.then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  );
});
