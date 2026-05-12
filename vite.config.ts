import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

// Voir https://v2.tauri.app/start/frontend/vite/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Vite recommandations pour Tauri :
  // 1. évite l'obscurcissement des logs Rust
  clearScreen: false,
  // 2. tauri attend un port fixe, à défaut sinon il l'apprend par TAURI_DEV_HOST
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      // 3. ignorer le dossier src-tauri pour ne pas redéclencher Vite
      ignored: ["**/src-tauri/**"],
    },
  },

  // Pour éviter que vite scanne node_modules de Tauri
  envPrefix: ["VITE_", "TAURI_ENV_*"],
}));
