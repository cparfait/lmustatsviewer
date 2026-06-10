# 🏁 LMU Stats Viewer

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.9-blue)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![Tauri](https://img.shields.io/badge/Tauri-2-24C8D8)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Langues](https://img.shields.io/badge/langues-FR%20%7C%20EN%20%7C%20ES%20%7C%20DE-green)
![Licence](https://img.shields.io/badge/licence-MIT-orange)

**L'outil tout-en-un pour [Le Mans Ultimate](https://www.lemansultimate.com/) — stats, records, setups, télémétrie, live timing, overlays in-game, spotter vocal et coach IA.**

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
- Indicateur d'arrêt aux stands, flags (vert / jaune / FCY / SC / rouge), électronique (TC/ABS)
- **Stratégie carburant calculée en continu** : consommation moyenne, autonomie, litres nécessaires pour finir
- Météo (air, piste, vent, pluie) — onglet **Coach IA** intégré
- Guide d'installation du plugin intégré si non détecté

### 📉 Télémétrie (fichiers `.duckdb` du jeu)
- Lecture native des enregistrements `UserData/Telemetry` (activer « Telemetry Recording » en jeu)
- Dashboard multi-canaux (vitesse, freins, accélérateur, direction, hybride…) avec **curseur lié carte ↔ graphes**
- **Carte 2D SVG** haute fidélité avec virages numérotés + **carte 3D** (élévation reconstruite, follow-cam)
- **Analyse par virage** : détection automatique, point de freinage, vitesse d'apex, comparaison à un tour de référence, **meilleur théorique** (best apex sur tous vos tours), métriques par phase (freinage / entrée / milieu / sortie)
- Comparaison inter-sessions, race pace, analyse assistée — le Coach IA exploite toutes ces données

### 🤖 Coach IA (clé personnelle — BYO-key)
- **6 fournisseurs au choix** : OpenAI, Anthropic (Claude), Google (Gemini), DeepSeek, Mistral, **Ollama (local, gratuit)** — liste de modèles dynamique, test de connexion, **coût estimé** par conversation
- **Analyse post-course** (rapide ou complète) ancrée sur vos données réelles : résultat, tours, secteurs, stratégie carburant, setup `.svm` lié, référence de classe et référence communautaire ohne_speed
- **Analyse télémétrie** : virages, métriques par phase, électronique (ABS / TC / engine map / brake bias)
- **Coach en course** : snapshot live + verdict carburant calculé en code, et **question vocale push-to-talk** (`Alt+C`) avec réponse courte façon radio
- **Mémoire du pilote** : historique du combo circuit/voiture (PB, tendance secteurs, faiblesse récurrente) injecté automatiquement
- **Objectifs mesurables et épinglables** : l'analyse complète produit des cibles chiffrées (valeur actuelle → cible) ; épinglez-les et le coach **vérifie votre progression** à la session suivante
- Conversation continue en **streaming**, lecture vocale phrase-par-phrase, dictée vocale, prompt système éditable par langue, clé API **chiffrée localement** (AES-256-GCM)

### 🎙️ Spotter vocal & annonces de course
- **Spotter à la demande** : raccourcis globaux (statut, répéter, muet) actifs même quand le jeu a le focus
- **Commandes vocales** (`Alt+T`, push-to-talk) : écart, carburant, pneus, position, rythme, temps restant, météo… — reconnaissance **100 % hors-ligne** (Vosk, 4 langues)
- **Annonces automatiques** : drapeaux, carburant (3/2/1 tours, ravitaillement à prévoir), pneus (froids / usure / crevaison), surchauffes, dégâts, positions, podium, sous attaque, drapeau bleu, record perso, secteur violet, **débrief du pire secteur du tour**, delta, pluie, mi-course / dernier tour…
- **Catalogue personnalisable** : modifiez le texte de chaque annonce et testez-la, par langue
- **Voix neuronale offline** (Piper) avec **effet radio** (bips + filtre), repli sur la voix système, file d'annonces à priorités

### 🎮 Overlays in-game
- **16 overlays** translucides au-dessus du jeu : relatif, chronos, pneus, carburant, météo, dégâts, rival, endurance, vitesse…
- Fenêtre unique click-through, **mode édition** par glisser-déposer, opacité globale, **profils** sauvegardés, interrupteur global

### 👤 Profil
- Heatmap d'activité (courses en ligne / hors ligne) et indicateurs de régularité

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

### ⚡ Performance & vie privée
- **Application native** — Tauri 2 + Rust, aucun serveur local, aucun navigateur requis
- **Base SQLite locale** — les sessions XML sont indexées dans `%APPDATA%\com.cparfait.lmustatsviewer\` au premier lancement
- **Télémétrie DuckDB** — lecture native des fichiers haute fréquence du jeu, sans conversion
- **Delta sync** — seuls les fichiers nouveaux ou modifiés sont parsés à chaque chargement
- **Pagination SQL** — `COUNT + LIMIT/OFFSET` ; mémoire constante quelle que soit la taille de la collection
- **Tout reste chez vous** — voix et reconnaissance vocale hors-ligne ; seules les requêtes du Coach IA partent vers le fournisseur que **vous** avez configuré (ou restent locales avec Ollama)

### 🔄 Mises à jour automatiques
Vérificateur de mise à jour intégré (signé) — téléchargement et installation en un clic depuis l'application.

---

## 🖥️ Prérequis

| Composant | Détail |
|---|---|
| Système | Windows 10 / 11 (64 bits) |
| Jeu | [Le Mans Ultimate](https://www.lemansultimate.com/) (Steam) |
| Runtime | Aucun — tout est inclus dans l'installeur |
| Live timing / overlays *(optionnel)* | Plugin `rFactor2SharedMemoryMapPlugin64.dll` dans `<LMU>/Plugins/` |
| Télémétrie *(optionnel)* | « Telemetry Recording » activé en jeu (Settings → Controls → Gameplay) |
| Coach IA *(optionnel)* | Une clé API (OpenAI, Anthropic, Google, DeepSeek, Mistral) **ou** [Ollama](https://ollama.com) en local |
| Commandes vocales *(optionnel)* | Un microphone |

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
| Répertoires | Résultats XML et enregistrements de télémétrie LMU |
| Langue | FR / EN / ES / DE |
| Thème | Clair / Sombre |
| Niveaux ohne_speed | Active/désactive les badges de niveau communautaires |
| Coach IA | Fournisseur, clé API (chiffrée), modèle, test de connexion, prompt système par langue |
| Voix & annonces | Moteur (Piper neuronal / système), voix par langue, volume, vitesse, effet radio, personnalisation des annonces |
| Spotter | Activation, raccourcis globaux (statut / muet / répéter / parler / coach), mode push-to-talk (maintenir / bascule) |
| Overlays | Sélection, opacité, profils, raccourci d'affichage |

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
    lmu_cache.db (SQLite)            ← base locale dans %APPDATA%
            │
            ▼
    Interface native (Tauri/React)   ← votre tableau de bord
```

LMU Stats Viewer lit les fichiers XML générés par le jeu après chaque session (Essais, Qualification, Course), les indexe en base SQLite locale via un delta sync, puis présente le tout dans une interface native desktop.

Trois autres sources de données complètent les résultats XML :
- **Mémoire partagée** (`rFactor2SharedMemoryMapPlugin64.dll`) → live timing, overlays, spotter et annonces vocales ;
- **Télémétrie DuckDB** (`UserData/Telemetry/*.duckdb`) → analyse par virage et Coach IA télémétrie ;
- **Setups `.svm`** (`UserData/player/Settings/`) → garage, comparaison A/B et contexte du Coach IA.

---

## 📁 Structure du projet

```
src/
├── routes/              ← pages React (Dashboard, Sessions, SessionDetail, Records,
│   │                       Setups, SetupDetail, SetupCompare, Telemetry, TelemetryView,
│   │                       Live, Overlays, Profile, Config, Changelog, Onboarding)
│   └── ...
├── components/          ← composants partagés (AICoachPanel, LapChartModal, TierBadge,
│   │                       overlay/ (widgets in-game), telemetry/ (TrackMap, Track3D…), ...)
│   └── ...
├── lib/                 ← api.ts (bridge Tauri), strategy.ts (calculs carburant/pit),
│   ├── ai/              ← Coach IA : providers (6), prompts, contextes de données
│   ├── telemetry/       ← analyse : virages, métriques par phase, meilleur théorique
│   └── ...              ← spotter, voice (file à priorités), radioFx, voiceMessages, ohne_speed
├── stores/              ← état global Zustand (app.ts, theme.ts)
└── i18n/                ← traductions (fr.ts, en.ts, es.ts, de.ts)

src-tauri/
├── src/
│   ├── commands/        ← commandes Rust : queries, indexer, setups, session_detail,
│   │                       live (shared memory), telemetry (DuckDB), ai (proxy LLM +
│   │                       objectifs), stt (Vosk), tts (Piper), overlay, records, ...
│   ├── lib.rs           ← enregistrement des commandes Tauri
│   ├── db.rs            ← schéma SQLite
│   └── xml_parser.rs    ← parser XML rFactor2
├── resources/           ← assets vocaux (modèles Vosk + voix Piper, hors git)
└── tauri.conf.json

%APPDATA%\com.cparfait.lmustatsviewer\
├── lmu_cache.db         ← base SQLite locale (générée automatiquement)
└── tracks\              ← tracés de circuits appris en live (persistés)
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

### Assets vocaux (optionnels, recommandés)
La **voix neuronale** (Piper) et les **commandes vocales** du spotter (Vosk) reposent
sur des assets lourds, **hors git**, à télécharger une fois via scripts PowerShell :
```powershell
./scripts/fetch-piper.ps1   # voix neuronale Piper (TTS)
./scripts/fetch-vosk.ps1    # modèles de reconnaissance Vosk (commandes vocales)
```
Sans ces assets, l'app fonctionne quand même : la voix retombe sur la synthèse système
et les commandes vocales sont « indisponibles » (repli sur la touche Statut).

> Les **commandes vocales** sont derrière une **feature Cargo `stt`** (désactivée par
> défaut). Pour les activer en dev : `npm run tauri:dev:stt`.

### Build de production
```bash
npm run tauri:build         # installeur NSIS (sans commandes vocales)
npm run tauri:build:stt     # installeur complet (voix neuronale + commandes vocales)
```
> `tauri:build:stt` exige d'avoir lancé `fetch-piper.ps1` **et** `fetch-vosk.ps1` au
> préalable. L'installeur est généré dans `src-tauri/target/release/bundle/`.
> La **release officielle** (CI sur tag `vX.Y.Z`) embarque automatiquement ces assets.

### Vérifications
```bash
npx tsc --noEmit        # typage TypeScript
cargo check             # compilation Rust (dans src-tauri/)
```

---

## 📝 Changelog

> Le changelog complet est disponible dans l'application (onglet **Changelog**) et sur la page [Releases](https://github.com/cparfait/lmustatsviewer/releases).

### Évolutions récentes (1.x)
- **Coach IA** multi-fournisseurs : analyses post-course / télémétrie / live, conversation en streaming, question vocale push-to-talk, mémoire du pilote (historique du combo) et objectifs épinglés vérifiés à la session suivante
- **Spotter vocal** hors-ligne (commandes Vosk 4 langues) + annonces de course automatiques personnalisables — voix neuronale Piper avec effet radio
- **Télémétrie `.duckdb`** : dashboard multi-canaux, cartes 2D/3D, analyse par virage, meilleur théorique, comparaison inter-sessions
- **Overlays in-game** : 16 widgets, mode édition par glisser-déposer, profils, opacité
- **Profil** : heatmap d'activité et indicateurs de régularité

### 1.0 — Réécriture native (V3)
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

Ce projet est sous licence MIT.

> *LMU Stats Viewer n'est pas affilié à Studio 397 ou Le Mans Ultimate.*
