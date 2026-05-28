# 🏁 LMU Stats Viewer

<div align="center">

![Version](https://img.shields.io/badge/version-3.0.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![Tauri](https://img.shields.io/badge/Tauri-2-24C8D8)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Langues](https://img.shields.io/badge/langues-FR%20%7C%20EN%20%7C%20ES%20%7C%20DE-green)
![Licence](https://img.shields.io/badge/licence-MIT-orange)

**Un outil de statistiques pour [Le Mans Ultimate](https://www.lemansultimate.com/) — suivez vos meilleurs temps, résultats de course, setups et progression.**

[📥 Télécharger](https://github.com/cparfait/lmustatsviewer/releases) · [🐛 Signaler un bug](https://github.com/cparfait/lmustatsviewer/issues) · [💬 Discord](https://discord.gg/G9ng9GdvSU)

</div>

---

## ✨ Fonctionnalités

### 📊 Tableau de bord
- **Meilleurs temps** par circuit, layout et voiture — avec détail des secteurs (S1 / S2 / S3)
- **Temps optimal** (meilleur temps théorique en combinant vos meilleurs secteurs)
- **Vitesse maximale** (V-max) par session
- **Statistiques globales** : temps de conduite total, tours effectués, circuit et voiture favoris
- **Meilleur résultat en ligne** et meilleure progression (grille → arrivée)
- Graphique de répartition des records par classe

### 🏎️ Support multi-classes
Toutes les classes de Le Mans Ultimate sont supportées :
`Hypercar` · `LMP2 WEC` · `LMP2 ELMS` · `LMP3` · `GT3` · `GTE`

### 📋 Détails de course
- Classement par session et par classe avec écart au leader
- Détail tour par tour pour chaque pilote — carburant, usure pneus, secteurs, composés
- Analyse des relais, stratégie carburant (% départ → % arrivée), pneumatiques et usure
- Incidents, pénalités et log de chat avec surlignage du joueur
- **Comparaison de pilotes** — superposition des courbes de temps
- **Graphique de tours interactif** — temps, position, secteurs, carburant, ligne alien ohne_speed
- **Track Limits** — tableau des dépassements de limites de piste par pilote

### 📈 Records personnels
- Records groupés par circuit avec drapeaux
- Graphique de progression : évolution du meilleur tour dans le temps
- **Intégration ohne_speed** : badges de niveau (Alien / Expert / Avancé / Intermédiaire / Débutant) calculés à partir des références communautaires

### 🔧 Gestion des setups
- **Scan automatique** du dossier `Settings` de LMU — tous vos `.svm` en un coup d'œil
- Vues **Par voiture**, **Par circuit** et **Tous les setups**
- **Matrice circuit × type** (Qualif / Course / Autres) avec chrono de la session liée
- **Éditeur de setup** : paramètres lisibles, édition inline, notes personnelles
- **Comparaison A / B** — diff complet section par section avec mise en évidence des différences
- Lier un setup à une session de résultats pour retrouver le contexte chrono
- Création, duplication, export et suppression

### 🔴 Live timing
- Tableau de bord temps réel via le plugin mémoire partagée rF2/LMU
- Vue d'ensemble (chrono, delta, SPD/GEA/RPM), télémétrie complète, classement, carte 2D
- Indicateur d'arrêt aux stands, flags (vert / jaune / FCY / SC / rouge)
- Météo (air, piste, vent, pluie)
- Guide d'installation du plugin intégré si non détecté

### 🔍 Filtres
- Circuit / Layout / Classe / Voiture
- Type de session (Essais / Qualification / Course)
- Type de réglage (En ligne / Week-end de course)
- Filtre par version du jeu

### 🌐 Langues disponibles
| 🇫🇷 Français | 🇬🇧 English | 🇪🇸 Español | 🇩🇪 Deutsch |
|---|---|---|---|
| ✅ | ✅ | ✅ | ✅ |

### 🎨 Thèmes
Mode clair et mode sombre — bascule en un clic, mémorisé entre les sessions.
Palette « Le Mans dark » : `#0A0E1A` (fond) + `#FFB400` (ambre accent).

### ⚡ Performance
- **Application native** — Tauri 2 + Rust, aucun serveur local, aucun navigateur requis
- **Base SQLite locale** — les sessions XML sont indexées dans `%APPDATA%\com.cparfait.lmustatsviewer\` au premier lancement
- **Delta sync** — seuls les fichiers nouveaux ou modifiés sont parsés à chaque chargement
- **Pagination SQL** — `COUNT + LIMIT/OFFSET` ; mémoire constante quelle que soit la taille de la collection

### 🔄 Mises à jour automatiques
Vérificateur de mise à jour intégré (signé) — téléchargement et installation en un clic depuis l'application.

---

## 🖥️ Prérequis

| Composant | Détail |
|---|---|
| Système | Windows 10 / 11 (64 bits) |
| Jeu | [Le Mans Ultimate](https://www.lemansultimate.com/) (Steam) |
| Runtime | Aucun — tout est inclus dans l'installeur |
| Live timing *(optionnel)* | Plugin `rFactor2SharedMemoryMapPlugin64.dll` dans `<LMU>/Plugins/` |

---

## 📥 Installation

1. Rendez-vous sur la page [**Releases**](https://github.com/cparfait/lmustatsviewer/releases)
2. Téléchargez le dernier `LMU_Stats_Viewer_x.x.x_x64-setup.exe`
3. Lancez l'installeur
4. Double-cliquez sur **LMU Stats Viewer** depuis le bureau ou le menu Démarrer

Au premier lancement, l'application détecte automatiquement le dossier de résultats LMU et vous invite à renseigner votre nom de joueur.

> 💡 Les fichiers de résultats se trouvent généralement ici :
> `D:\SteamLibrary\steamapps\common\Le Mans Ultimate\UserData\Log\Results`
> Le chemin est détecté automatiquement et peut être modifié dans la **Configuration**.

> 🔴 Pour le **Live timing**, installez `rFactor2SharedMemoryMapPlugin64.dll` dans `<LMU>\Plugins\`.
> Un guide d'installation s'affiche directement dans l'application si le plugin est absent.

---

## ⚙️ Configuration

Cliquez sur ⚙️ dans l'en-tête de l'application.

| Paramètre | Description |
|---|---|
| Nom du joueur | Votre pseudo en jeu (utilisé pour mettre vos tours en évidence) |
| Répertoire des résultats | Chemin vers les fichiers XML de résultats LMU |
| Langue | FR / EN / ES / DE |
| Thème | Clair / Sombre |
| Niveaux ohne_speed | Active/désactive les badges de niveau communautaires |

### Maintenance
- **Réindexer la base** — reconstruit la base SQLite à partir de tous les fichiers XML
- **Purger les sessions vides (global)** — supprime les XML sans aucun tour enregistré
- **Purger les sessions vides (joueur)** — supprime les XML où le joueur n'a pas de tour
- **Vider le cache** — force une relecture complète au prochain chargement

---

## 🗂️ Fonctionnement

```
Le Mans Ultimate
    └── UserData/Log/Results/*.xml   ← fichiers de résultats (XML)
            │
            ▼
    LMU Stats Viewer — indexeur delta (Rust)
            │   parse uniquement les fichiers nouveaux/modifiés
            ▼
    lmu_stats.db (SQLite)            ← base locale dans %APPDATA%
            │
            ▼
    Interface native (Tauri/React)   ← votre tableau de bord
```

LMU Stats Viewer lit les fichiers XML générés par le jeu après chaque session (Essais, Qualification, Course), les indexe en base SQLite locale via un delta sync, puis présente le tout dans une interface native desktop.

---

## 📁 Structure du projet

```
src/
├── routes/              ← pages React (Dashboard, Sessions, SessionDetail,
│   │                       Records, Setups, SetupCompare, Live, Config, Changelog)
│   └── ...
├── components/          ← composants partagés (TierBadge, LapChartModal,
│   │                       CarLogo, TrackFlag, ClassBadge, ...)
│   └── ...
├── lib/                 ← API Tauri (api.ts), ohne_speed, utils, setupParams
├── stores/              ← état global Zustand (app.ts)
└── i18n/                ← traductions (fr.ts, en.ts, es.ts, de.ts)

src-tauri/
├── src/
│   ├── commands/        ← commandes Rust (queries, indexer, setups, session_detail, ...)
│   ├── lib.rs           ← enregistrement des commandes Tauri
│   └── xml_parser.rs    ← parser XML rFactor2
└── tauri.conf.json

%APPDATA%\com.cparfait.lmustatsviewer\
└── lmu_stats.db         ← base SQLite locale (générée automatiquement)
```

---

## 🛠️ Compiler depuis les sources

### Prérequis
- [Node.js 20+](https://nodejs.org)
- [Rust stable](https://rustup.rs/) + cible `x86_64-pc-windows-msvc`
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (C++ workload)
- [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (inclus Windows 11, sinon à installer)

### Développement
```bash
npm install
npm run tauri:dev       # application native avec hot-reload
npm run dev             # interface seule (http://localhost:5173, sans backend Rust)
```

### Build de production
```bash
npm run tauri:build     # génère l'installeur NSIS dans src-tauri/target/release/bundle/
```

### Vérifications
```bash
npx tsc --noEmit        # typage TypeScript
cargo check             # compilation Rust (dans src-tauri/)
```

---

## 📝 Changelog

> Le changelog complet est disponible dans [CHANGELOG.md](CHANGELOG.md) et dans l'application (onglet Changelog).

### v3.0.0
- Réécriture complète en application native (Tauri 2 + React 19 + Rust)
- Toutes les fonctionnalités de la V1 reproduites fidèlement
- Nouveau : Garage/Setups — scan `.svm`, éditeur, comparaison A/B, lien session
- Nouveau : Graphique de tours interactif (LapChartModal) avec comparaison de sessions
- Nouveau : Intégration ohne_speed — badges de niveau dans Sessions, Records, SessionDetail, graphiques
- Nouveau : Live timing amélioré — télémétrie complète, carte 2D, vue d'ensemble plein écran
- Nouveau : Track Limits dans les détails de course
- Nouveau : Trophées meilleurs tours/secteurs avec tolérance IEEE 754
- Amélioration : distinction LMP2 WEC / LMP2 ELMS
- Amélioration : auto-updater signé (clé Ed25519)

---

## 🤝 Contribuer

Les contributions, rapports de bugs et suggestions sont les bienvenus !
N'hésitez pas à ouvrir une [issue](https://github.com/cparfait/lmustatsviewer/issues) ou à soumettre une pull request.

💬 Rejoignez aussi la communauté sur **[Discord](https://discord.gg/G9ng9GdvSU)**.

---

## 👤 Auteur

**Cris Tof**
Fait avec ❤️ pour la communauté Le Mans Ultimate.

Si l'outil vous est utile, vous pouvez me remercier avec un café ☕

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-cristof-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/cristof)

---

## 📄 Licence

Ce projet est sous licence [MIT](LICENSE).

> *LMU Stats Viewer n'est pas affilié à Studio 397 ou Le Mans Ultimate.*
