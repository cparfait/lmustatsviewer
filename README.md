# LMU Stats Viewer — v2

> **Branche `v2`** — réécriture moderne de [LMU Stats Viewer v1](https://github.com/cparfait/lmustatsviewer/tree/main) en **Tauri 2 + React 19 + Tailwind v4**.
>
> Phase actuelle : **Phase 0 (Setup) terminée** — la coquille Tauri est en place, le frontend (POC visuel) est complet. Les commandes Rust sont des stubs, à implémenter en Phase 1+.
>
> Pour le contexte projet complet et le plan de migration : **lire [`HANDOFF.md`](./HANDOFF.md)**.

![status](https://img.shields.io/badge/phase-0%20setup-FFB400) ![stack](https://img.shields.io/badge/stack-Tauri%202%20%2B%20React%2019%20%2B%20Tailwind%20v4-0A0E1A)

---

## TL;DR — Lancer le projet

### Mode web (POC visuel — pas besoin de Rust)

```bash
git clone https://github.com/cparfait/lmustatsviewer.git
cd lmustatsviewer
git checkout v2
npm install
npm run dev          # http://localhost:5173
```

### Mode desktop (Tauri — nécessite Rust)

```bash
npm run tauri:dev    # ouvre la fenêtre native, hot reload activé
```

### Build d'un installeur Windows

```bash
npm run tauri:build  # → src-tauri/target/release/bundle/{nsis,msi}/*.exe
```

---

## Prérequis

### Mode web uniquement (POC visuel)

| Outil | Version min. | Lien |
|---|---|---|
| **Node.js** | 22.x LTS (ou 20.x) | https://nodejs.org/ |
| **npm** | 10.x | livré avec Node.js |
| **Git** | 2.40+ | https://git-scm.com/download/win |

### Mode desktop / build (Tauri)

En plus de ce qui est listé ci-dessus :

| Outil | Pourquoi | Installation |
|---|---|---|
| **Rust** (`rustup`) | Compiler le backend Tauri | https://rustup.rs/ — télécharger `rustup-init.exe` et l'exécuter (toolchain par défaut MSVC stable) |
| **Visual Studio Build Tools** | Linker C++ requis par MSVC | https://visualstudio.microsoft.com/visual-cpp-build-tools/ — installer "Desktop development with C++" (~7 Go) |
| **WebView2 Runtime** | Moteur de rendu de la fenêtre Tauri | Préinstallé sur Win 11. Pour Win 10 : https://developer.microsoft.com/en-us/microsoft-edge/webview2/ |
| **Tauri CLI** | Commandes `tauri dev` / `tauri build` | Installé automatiquement via `npm install` (devDep `@tauri-apps/cli`) |

#### Vérification post-install Rust

```bash
rustup --version    # rustup 1.x.x
rustc --version     # rustc 1.8x.x (stable-x86_64-pc-windows-msvc)
cargo --version     # cargo 1.8x.x
```

> 🕐 **Temps total install Rust + VS Build Tools** : ~30 min, ~12 Go disque.

---

## Scripts npm

| Script | Description |
|---|---|
| `npm run dev` | Vite frontend uniquement, port 5173 (mode web pur, données mockées) |
| `npm run build` | Vérifie TypeScript + build prod dans `dist/` |
| `npm run preview` | Sert le build de production en local |
| `npm run tauri:dev` | Lance Vite + Tauri en mode dev (fenêtre native + HMR) |
| `npm run tauri:build` | Build production : compile Rust + frontend → installeurs `.exe` / `.msi` |
| `npm run tauri:icon <fichier.png>` | (Re)génère les icônes depuis un PNG source (idéalement 1024x1024) |

---

## Structure du projet

```
lmustatsviewer/                  ← repo, branche v2
├── HANDOFF.md                   ← Document de reprise (LIRE EN PREMIER)
├── CLAUDE.md                    ← Instructions pour assistants IA
├── README.md                    ← Ce fichier
├── package.json                 ← Frontend + scripts Tauri
├── vite.config.ts               ← Vite avec settings recommandés pour Tauri
├── tsconfig.json                ← TS config référencée
│
├── src/                         ← Frontend React 19
│   ├── App.tsx                  ← Routing + layout (Header/Footer sauf /live)
│   ├── main.tsx
│   ├── index.css                ← Tailwind v4 + tokens palette "Le Mans dark"
│   ├── routes/                  ← Pages : Dashboard, Sessions, SessionDetail,
│   │                              Records, Setups, SetupDetail, SetupCompare,
│   │                              Live, Config
│   ├── components/
│   │   ├── ui/                  ← Primitives shadcn-style
│   │   └── layout/              ← Header, Footer, ScrollToTop
│   ├── stores/                  ← theme + version active (Zustand-lite hooks)
│   └── lib/
│       ├── tauri.ts             ← Bridge IPC typé avec fallback web (NOUVEAU)
│       ├── mockData.ts          ← Données mockées (remplacées en Phase 1+)
│       └── utils.ts             ← cn() + helpers de formatage
│
├── src-tauri/                   ← Backend Rust (NOUVEAU — Phase 0)
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json          ← Config app (window, bundle, plugins)
│   ├── capabilities/
│   │   └── default.json         ← Permissions IPC
│   ├── icons/                   ← Icônes générées (32, 128, 256, 512, .ico)
│   └── src/
│       ├── main.rs              ← Entry point
│       ├── lib.rs               ← Builder Tauri + handler IPC
│       ├── error.rs             ← AppError unifié (sérialisable vers JS)
│       └── commands/
│           ├── mod.rs
│           └── system.rs        ← get_app_version, get_platform, ping
│
├── samples/                     ← Fixtures LMU (XML, .svm) — non commité (.gitignore)
│
└── .github/workflows/
    └── release.yml              ← CI : push tag v2.* → installeurs .exe + GitHub Release
```

---

## Pages disponibles (frontend)

| Route | Description |
|---|---|
| `/` | **Dashboard** — stats globales, meilleurs temps, progression Hypercar, 3 graphes secondaires |
| `/sessions` | **Sessions** — liste filtrée par version active, ligne cliquable |
| `/sessions/:id` | **Race Details** — info cards + 8 onglets (Résultat, Tours, Meilleurs tours, Stratégie, Incidents, Pénalités, Chat, Comparaison) |
| `/records` | **Records personnels** — groupage par circuit avec drapeau, toutes colonnes v1 |
| `/setups` | **Car setups** — liste hiérarchique Voiture → Circuit → Setups |
| `/setups/:id` | **Setup detail** — sections repliables, édition inline |
| `/setups/compare` | **Setup compare** — 2 setups côte à côte, diff highlightée |
| `/live` | **Live page** (fullscreen, sans Header/Footer) — dashboard 4ᵉ écran avec mock telemetry |
| `/config` | **Configuration** — chemins jeu, versions, profil, ohne_speed, maintenance |

---

## Workflow dev typique

```bash
# Mode web rapide (pas besoin de recompiler Rust)
npm run dev

# Mode Tauri (fenêtre native, hot reload sur le frontend + recompilation Rust si modif)
npm run tauri:dev

# Quand tu modifies du Rust :
# Tauri détecte le changement et recompile automatiquement (10-60s selon le diff)

# Pour tester un build de prod localement :
npm run tauri:build
# → ouvre src-tauri/target/release/bundle/nsis/LMU Stats Viewer_2.0.0_x64-setup.exe
```

---

## CI / Release

Le workflow `.github/workflows/release.yml` se déclenche **automatiquement** sur push d'un tag `v2.*` :

```bash
git tag v2.0.0
git push origin v2.0.0
```

→ GitHub Actions build sur `windows-latest`, génère installeurs NSIS + MSI, crée une **GitHub Release en brouillon** avec les binaires attachés. Tu valides et publies manuellement.

Le job `check-frontend` tourne aussi à chaque push pour vérifier que `npm run build` passe sans erreur TypeScript.

---

## Couleurs & thème

Palette **Le Mans dark** :
- Background `#0A0E1A` (bleu nuit profond)
- Primary `#FFB400` (jaune Le Mans iconique)
- Tiers ohne_speed : Alien (jaune), Pro (orange), Semi-Pro (vert), Amateur (cyan), Offline (gris)
- Toggle dark/light via le bouton ☀/🌙 du Header
- Persistance localStorage

---

## Liens

- 🐙 **Repo** : https://github.com/cparfait/lmustatsviewer
- 📋 **HANDOFF.md** : contexte complet, décisions, roadmap des phases 0→6
- ☕ **Buy me a coffee** : (bouton en footer dans l'app)
- 📦 **Tauri docs** : https://v2.tauri.app/
- 🎨 **shadcn/ui** (inspiration) : https://ui.shadcn.com/

---

## Licence

À définir (idem v1).
