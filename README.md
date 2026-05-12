# LMU Stats Viewer — v2 (POC visuel)

> **POC visuel uniquement.** Pas de Tauri/Rust à ce stade, pas de SQLite, pas d'accès aux fichiers du jeu. Toutes les données affichées sont **mockées** (`src/lib/mockData.ts`). Le but : valider le rendu UI/UX avant l'implémentation du backend natif.
>
> Pour le contexte complet du projet et le plan de migration : **lire [`HANDOFF.md`](./HANDOFF.md)**.

![status](https://img.shields.io/badge/status-POC-FFB400) ![stack](https://img.shields.io/badge/stack-Vite%20%2B%20React%2019%20%2B%20Tailwind%20v4-0A0E1A)

---

## Démarrage rapide

```bash
git clone https://github.com/cparfait/lmustatsviewer.git
cd lmustatsviewer
git checkout v2
npm install
npm run dev
```

Puis ouvrir **http://localhost:5173** dans le navigateur.

---

## Prérequis

### Pour le POC (cette branche)

| Outil | Version min. | Installation |
|---|---|---|
| **Node.js** | 22.x LTS (ou 20.x) | https://nodejs.org/ — installeur officiel Windows |
| **npm** | 10.x | livré avec Node.js |
| **Git** | 2.40+ | https://git-scm.com/download/win |

Vérifie ton install :

```bash
node --version    # v22.x.x
npm --version     # 10.x.x
git --version     # 2.x.x
```

### Pour la future v2 finale (Tauri — Phase 0+)

Quand on attaquera l'intégration Tauri (cf. `HANDOFF.md` § 6 — Phases), il faudra **en plus** :

| Outil | Pourquoi | Installation |
|---|---|---|
| **Rust** (rustup) | Backend natif Tauri | https://rustup.rs/ → télécharger `rustup-init.exe` et exécuter |
| **Visual Studio Build Tools** | Compiler le code natif Windows (Rust en a besoin) | https://visualstudio.microsoft.com/visual-cpp-build-tools/ → cocher "Desktop development with C++" (~7 Go) |
| **WebView2 Runtime** | Moteur de rendu Tauri | Préinstallé sur Windows 11 et Windows 10 récents. Vérif : https://developer.microsoft.com/en-us/microsoft-edge/webview2/ |
| **Tauri CLI** | Commandes `tauri dev` / `tauri build` | Installé via `cargo install tauri-cli --version "^2.0.0"` après Rust |

**Vérification post-install** :

```bash
rustup --version    # rustup 1.x.x
rustc --version     # rustc 1.8x.x
cargo --version     # cargo 1.8x.x
```

> Note : l'installation de Rust + VS Build Tools représente ~10-15 Go d'espace disque. Compter 30 min d'installation totale.

---

## Scripts npm disponibles

```bash
npm run dev       # Lance Vite en mode dev (HMR, port 5173)
npm run build     # Vérifie TypeScript + build production dans dist/
npm run preview   # Sert le build de production en local pour test
```

---

## Structure du projet

```
lmustatsviewer/
├── HANDOFF.md             ← Document de reprise (LIRE EN PREMIER)
├── CLAUDE.md              ← Instructions pour assistants IA
├── README.md              ← Ce fichier
├── samples/               ← Fixtures LMU (XML, .svm) — non commité (cf. .gitignore)
├── src/
│   ├── App.tsx            ← Routes + layout (Header + Footer sauf /live)
│   ├── main.tsx
│   ├── index.css          ← Tailwind v4 + tokens palette "Le Mans dark"
│   ├── routes/            ← Pages : Dashboard, Sessions, SessionDetail,
│   │                        Records, Setups, SetupDetail, SetupCompare,
│   │                        Live, Config
│   ├── components/
│   │   ├── ui/            ← Primitives shadcn-style (Button, Card, Badge, Table, ...)
│   │   └── layout/        ← Header, Footer, ScrollToTop
│   ├── stores/            ← Zustand-lite : theme, version active
│   └── lib/
│       ├── mockData.ts    ← TOUTES les données mockées (à remplacer en Phase 1+)
│       └── utils.ts       ← cn() + helpers de formatage (lap time, delta, secteurs)
├── public/
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tailwind config        ← géré via @tailwindcss/vite + tokens dans index.css
```

---

## Pages disponibles

| Route | Description |
|---|---|
| `/` | **Dashboard** — stats globales, meilleurs temps par circuit, progression Hypercar, graphes secondaires |
| `/sessions` | **Sessions** — liste filtrée par version active, cliquable vers détail |
| `/sessions/:id` | **Race Details** — info cards, classement enrichi, 8 onglets (Résultat, Tours, Meilleurs tours, Stratégie, Incidents, Pénalités, Chat, Comparaison pilotes) |
| `/records` | **Records personnels** — groupage par circuit avec drapeau, toutes les colonnes du v1 |
| `/setups` | **Car setups** — liste hiérarchique Voiture → Circuit → Setups |
| `/setups/:id` | **Setup detail** — sections repliables, édition inline |
| `/setups/compare` | **Setup compare** — comparaison 2 setups côte à côte, diff highlightée |
| `/live` | **Live page** (fullscreen, sans header/footer) — dashboard 4ᵉ écran avec mock telemetry animée |
| `/config` | **Configuration** — chemins jeu, versions, profil, ohne_speed, maintenance |

---

## Couleurs & thème

Palette **Le Mans dark** :
- Background `#0A0E1A` (bleu nuit profond)
- Primary `#FFB400` (jaune Le Mans iconique)
- Tiers : Alien (jaune), Pro (orange), Semi-Pro (vert), Amateur (cyan), Offline (gris)
- Toggle dark/light via le bouton ☀/🌙 du Header
- Persistance localStorage

---

## Stack technique du POC

- **Vite 6** + **React 19** + **TypeScript 5.7**
- **Tailwind v4** (config CSS-first via `@tailwindcss/vite`)
- **shadcn-style** UI primitives codées à la main (Button, Card, Badge, Table, Accordion, Tabs, DropdownMenu, Switch, Input, Separator)
- **React Router v7** pour le routing client
- **Recharts** pour les graphiques (LineChart, AreaChart, BarChart, RadialBar)
- **lucide-react** pour les icônes
- **Zustand-lite** (hooks custom) pour theme + version active

---

## Liens

- 🐙 Repo : https://github.com/cparfait/lmustatsviewer
- 📋 HANDOFF.md : contexte complet et roadmap
- ☕ Buy me a coffee : (bouton en footer dans l'app)

---

## Licence

À définir (idem v1).
