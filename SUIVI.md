# SUIVI — LMU Stats Viewer V3

> **Document de reprise du projet. À LIRE EN PREMIER.**
> Mettre à jour la section « Journal de bord » à chaque session de travail.
> Dernière mise à jour : 2026-06-08

---

## 1. Objectif

Construire la **V3** de LMU Stats Viewer :

- **Visuel + stack** = repris de la **V2** (jugée plus aboutie graphiquement).
- **Règles de calcul, d'affichage, fonctionnalités, onglets, tableaux** = repris **strictement de la V1** (référence fonctionnelle).
- Toutes les informations de V1 doivent être présentes et **calculées exactement comme en V1**.

### Sources

| Élément | Emplacement |
|---|---|
| Code V1 (PHP — référence fonctionnelle) | `C:\tmp\__DEV__\OLDLMU_Stats_Viewer_095\htdocs\` |
| **Jeu LMU installé** (fichiers réels de test) | `D:\SteamLibrary\steamapps\common\Le Mans Ultimate\` |
| → Résultats XML (180 fichiers réels) | `...\UserData\Log\Results\*.xml` |
| → Setups `.svm` (par circuit) | `...\UserData\player\Settings\[Circuit]\` |
| → Plugin shared memory (déjà installé) | `...\Plugins\rFactor2SharedMemoryMapPlugin64.dll` |
| Métadonnées V1 (changelog, mockups) | `C:\tmp\__DEV__\_LMU_V3\zz_V1\` |
| Code V2 (Tauri/React — base visuelle + technique) | `C:\tmp\__DEV__\_LMU_V3\zz_V2\` |
| **V3 (projet en cours)** | `C:\tmp\__DEV__\_LMU_V3\` (racine) |

---

## 2. Décisions verrouillées

| Sujet | Décision |
|---|---|
| **Stack** | Tauri 2 + React 19 + TypeScript + Vite 6 + Tailwind v4 + shadcn/ui + Zustand + Recharts + react-i18next + react-router v7 |
| **Backend** | **Réécrit à neuf** (Rust) à partir des règles PHP de la V1. Le backend Rust de V2 n'est PAS réutilisé tel quel — il sert de référence d'inspiration uniquement. La V1 PHP est la source de vérité. |
| **Base** | SQLite locale (rusqlite bundled). Schéma calqué sur la V1. |
| **Initialisation** | Code V2 copié à la racine `_LMU_V3\` comme point de départ visuel/technique. |
| **Périmètre** | **Toutes** les fonctionnalités V1 + 3 nouveautés V2 retenues : (1) comparaison ohne_speed, (2) distinction LMP2 WEC / LMP2 ELMS, (3) Live amélioré (shared memory rF2/LMU). |
| **NON retenu de V2** | Multi-profils — V3 reste **mono-profil** comme la V1 (un seul nom de joueur). |
| **Garage / car_config** | **Exception à la règle V1** : la gestion des configs/garage est reprise de la **V2** (plus poussée — parser/writer `.svm`, scan dossier Settings, CRUD, comparaison diff A/B). |
| **Langues** | FR / EN / ES / DE (i18n complet). |
| **Thèmes** | Dark + Light, toggle header, dark par défaut. Palette « Le Mans dark » (#0A0E1A + #FFB400). |
| **Distribution** | `.exe` Windows, installeur Tauri (NSIS), auto-update GitHub. |
| **Langue de travail** | Réponses + docs en FR ; code/variables/fichiers en anglais. |
| **Cadence** | Développement autonome jusqu'à blocage ou point de décision. |
| **Pas de données mockées** | **Aucune donnée d'exemple/simulée.** On travaille uniquement sur les données de production (vrais fichiers du jeu). Supprimer `mockData.ts`, `webMock.ts` et tous les fallbacks web du bridge IPC. Pas de « mode web » avec données simulées. Tests faits sur les fichiers réels de `D:\SteamLibrary\...`. |
| **Overlays in-game** | Système d'overlays façon « Trace HUB » via **une seule fenêtre Tauri transparente** (`label = overlay`) plein écran, always-on-top, click-through (réactivé en mode Édition). Source de vérité = config SQLite `overlays_config` ; synchro inter-fenêtres par event `overlays-config`. Réutilise le pipeline `live-data` existant. **Pas** de fenêtre par overlay (trop lourd). |

---

## 3. Règles métier extraites de la V1 (SOURCE DE VÉRITÉ)

### 3.1 Schéma SQLite (cf. `includes/db.php`)

Tables : `xml_index`, `session_classes`, `player_sessions`, `player_laps`, `db_meta`, `car_configs`.

- **xml_index** : 1 ligne / fichier XML. `filename` UNIQUE, `mtime`, `timestamp`, `track`, `track_course`, `setting`, `game_version`, `has_any_laps`, `event_id`, `indexed_at`.
- **session_classes** : classes présentes par (xml_id, session_type) — pour les filtres.
- **player_sessions** : 1 ligne / session du joueur (Practice1/Qualify/Race). Contient tous les agrégats (best_lap + secteurs, abs_best_sN + dates, optimal_lap, vmax, progression, total_laps_valid, total_lap_time, class_position, grid_pos, finish_status, pitstops, participants, car_type/class/name, unique_car_name).
- **player_laps** : tours du joueur (lap_num, lap_time, s1/s2/s3, top_speed, is_pit).
- **db_meta** : clé/valeur (ex. `player_name`).
- **car_configs** : setups voiture (nombreuses colonnes setup — cf. db.php lignes 180-233).

### 3.2 Indexation delta (cf. `includes/indexer.php`)

- Sync delta par `mtime` : seuls fichiers nouveaux/modifiés parsés ; fichiers disparus supprimés (cascade).
- Changement de joueur → `DELETE player_sessions` + reset des `mtime` (réindex complet).
- Sections parsées : `Practice1`, `Qualify`, `Race`.
- `game_version` : `_format_game_version` — split sur `.`, `major` + mineur 4 chiffres paddé droite (ex. `0.9200`).
- Normalisation classe : `Hyper` reste `Hyper` ; `LMP2 ELMS` / `LMP2_ELMS` / `LMP2 Elms` → `LMP2 ELMS` ; sinon trim.
- `unique_car_name` : `Peugeot 9x8` + catégorie `WEC YYYY` → `Peugeot 9x8 (2024/25)` si 2024/2025, sinon `... (YYYY)` ; sinon = car_type.
- `has_any_laps` = 1 si un pilote (toute section) a ≥ 1 tour.
- **Driver Swap** : section Race + `FinishStatus=DNF` + dernier tour `pit=1` ET temps > 0 → `FinishStatus = "Driver Swap"`.
- **progression** : Race + `classGridPos > 0` + `finishStatus = "Finished Normally"` → `classGridPos - classPosition`.
- **best_lap** : tour valide = `lapTime>0 ET s1>0 ET s2>0 ET s3>0`. best_lap = min lapTime parmi les valides ; on stocke ses s1/s2/s3.
- **abs_best_sN** : min de chaque secteur > 0 (tous tours), avec date = timestamp session.
- **optimal_lap** : `s1+s2+s3` des abs_best (null si un secteur manquant).
- **total_laps_valid** : nb de tours 4-chronos-valides. **total_lap_time** : somme de leurs temps.
- **vmax** : max topspeed.

### 3.3 Groupement d'événements (cf. `functions.php::compute_event_groups`)

Seuil 7200 s. Une session rejoint le groupe courant si : `event_id≠0` ET même `track` ET ( (`Multiplayer` ET `|ts - tsPremier| < 7200`) OU (`ts === tsPremier`) ). Sinon nouveau groupe, `event_id = ts`. Toute session non-Multiplayer hors timestamp identique démarre un nouveau groupe.

### 3.4 Stats globales Dashboard (cf. `queries.php::get_player_overview_stats`)

- `totalLaps` = SUM(total_laps_valid)
- `totalDrivingTime` = SUM(total_lap_time) / 3600, arrondi 1 décimale (heures)
- `bestFinish` = MIN(class_position) où Race + Multiplayer + Finished Normally ; 99 → N/A
- `bestProgression` = MAX(progression) ; -99 → N/A
- `podiums` = COUNT(Race + Finished Normally + class_position ≤ 3)
- `favoriteTrack` / `favoriteCar` = track / unique_car_name avec max SUM(total_laps_valid)

### 3.5 Formatage temps (cf. `functions.php::formatSecondsToMmSsMs`)

`m:ss.mmm` (ex. `1:23.456`). `N/A` si null / ≤ 0 / INF. Mode sans minutes : `ss.mmms`.

### 3.6 Ordre des classes

`CLASS_ORDER = Hyper(1), LMP2 ELMS(2), LMP2(3), LMP3(4), GT3(5), GTE(6)`.

### 3.7 Détails de course (cf. `functions.php::process_session_data`)

Par pilote : stints (relais), fuel départ/arrivée, usure pneus, compounds, tours en tête (`lap p=1`), best lap + best secteurs, vmax, médiane, écart-type, moyenne des 5 meilleurs tours.
- Fuel départ = `(fuel + fuelUsed) * 100` au 1er tour avec temps > 0 ; fuel arrivée = `fuel * 100` du dernier.
- Usure = `(1 - twXX) * 100` (twfl/twfr/twrl/twrr).
- Stream events : `ChatMessage`, `Penalty` (regex `Penalty given to (.+?):`), `Incident` (regex pilotes impliqués → Vehicle si 2, Other si 1).
- Tableau classement : Pos / Prog / Classe / Pilote / Voiture / Tours / Tours en tête / Temps total (écart) / Best lap / Vmax / Carb. départ / Carb. arrivée / Incidents / Pénalités / Statut.

> ⚠️ Les règles ci-dessus doivent être **réétudiées dans le PHP correspondant** avant chaque implémentation, page par page.

### 3.8 Inventaire EXACT des colonnes de tableaux V1 (à reproduire intégralement)

> ⚠️ **Règle absolue** : toutes ces colonnes, le contenu de chaque cellule et tous
> les filtres DOIVENT être présents en V3. Avant de finir une page, vérifier ici.

**Tableau « Meilleurs temps » — `index.php`** (groupé par circuit, en-têtes pliables,
case « tout déployer/replier », légende couleurs vert/or/violet) :
Détails (icône→race_details) · Records (icône→records.php) · Tracé · Type (Setting) ·
Session (badge) · Classe (badge) · [logo voiture] · Voiture · Livrée · Best lap ·
**S1 · S2 · S3** (colonnes séparées ; or si secteur record absolu) · Optimal (violet) ·
Vmax · Position arrivée · Progression · Date · Version.
Hero : Temps de conduite · Tours · Circuit favori · Voiture favorite · Meilleure
progression · Meilleur résultat en ligne · Podiums.

**Tableau « Sessions » — `sessions.php`** (striping par événement `event_id`,
toutes colonnes triables) :
Détails (icône→race_details) · Records (icône→records.php) · [drapeau] · Circuit ·
Tracé · Type (Setting) · Session (badge) · Classe (badge) · [logo] · Voiture · Livrée ·
Best lap · Départ (`P{grid}`, Race seulement) · Arrivée (`P{pos} / {participants}`,
ou statut DNF/Driver Swap) · Progression · Arrêts (pitstops) · Date · Version.
Hero : Sessions · Courses · Qualifs · Essais · Voitures · Circuits · Tracés.
Pagination : 15/25/50/100/**200** par page.

**Cellules cliquables-filtres** : dans les tableaux V1, cliquer une cellule
(circuit, tracé, voiture, classe, type, session) applique ce filtre au tableau.

**Filtres (barre de recherche)** `index.php` / `sessions.php` : Circuit · Tracé ·
Voiture · Classe · Session · Type · Version (≥, + case « cette version uniquement »)
· bouton Reset. `records.php` ajoute une **recherche texte**.

---

## 4. Inventaire des pages / fonctionnalités V1 à reproduire

| Page V1 | Route V3 | Contenu |
|---|---|---|
| `index.php` | `/` Dashboard | Stats globales, meilleurs temps par circuit/layout/voiture (+ secteurs, optimal, vmax), favoris, meilleur résultat en ligne, meilleure progression, graphes |
| `sessions.php` | `/sessions` | Liste paginée des sessions, filtres (circuit/layout/classe/voiture/type session/setting/version), lignes cliquables |
| `race_details.php` | `/sessions/:id` | 2 info-cards + 8 onglets : Résultat course, Tours course, Meilleurs tours, Stratégie, Incidents, Pénalités, Chat, Comparaison pilotes |
| `records.php` | `/records` | Records groupés par circuit (drapeau), colonnes complètes, filtres, graphe de progression |
| `car_configs.php` | `/garage` | Garage : liste/création/édition/duplication/export/suppression/comparaison des setups |
| `config.php` | `/config` | Nom joueur, dossier résultats, fuseau, langue, filtre version, maintenance (réindex, purge, vider cache) |
| `changelog.php` | `/changelog` | Notes de version |
| `live.php` (+ live2/live3) | `/live` | Live timing temps réel (shared memory), plein écran |

**Filtres** : circuit / layout / classe / voiture / type session (Essais/Qualif/Course) / type réglage (En ligne/Week-end) / version du jeu.
**Multi-classes** : Hypercar, LMP2 WEC, LMP2 ELMS, LMP3, GT3, GTE.
**Transverse** : nav header (Stats/Records/Garage/Config/Live), toggle thème, sélecteur langue 4 langues, footer Buy Me a Coffee, bouton scroll-to-top, auto-update GitHub, system tray.

---

## 5. Plan d'implémentation (phases)

| # | Phase | Statut | Livrable |
|---|---|---|---|
| 0 | Setup : copie base V2, nettoyage, fichier de suivi | ✅ Fait | Projet `_LMU_V3` initialisé |
| 1 | Backend Foundations : schéma SQLite V1, parser XML rFactor, indexer delta, config | ✅ Fait | Backend Rust compile ; indexation + config opérationnelles |
| 2 | Bridge IPC + Onboarding + Dashboard + Sessions branchés sur données réelles | ✅ Fait | Pages `/`, `/sessions`, onboarding réels — build OK |
| 3 | Race Details : onglets calqués V1 | ✅ Fait | Page `/sessions/:id` (i18n en dur → Phase 7) |
| 4 | Records + ohne_speed : records groupés, graphe progression, tiers communautaires | ✅ Fait | Page `/records` refondue en 2 niveaux |
| 5 | Garage : CRUD setups `.svm`, comparaison — **base = backend Rust V2 `setups.rs`** (plus poussé que V1) | ✅ Fait | Page `/setups` (+ `/setups/:id`, `/setups/compare`) |
| 6 | Live : shared memory rF2/LMU, plein écran | ✅ Fait | Page `/live` |
| 7 | Config + Changelog + i18n + transverse | ✅ Fait | Config, Changelog, i18n complet (4 langues) |
| 8 | Polish : auto-updater, system tray, CI, installeur | ✅ Fait | Updater signé + tray + CI tag + NSIS |
| 9 | Overlays in-game (Trace HUB) : framework + 9 overlays + mode Édition | 🟠 Itération 1 | Page `/overlays`, fenêtre transparente, 9 widgets, drag live, persistance |

### AI Coach — ✅ FAIT (2026-06-08) — fondations + live + analyse télémétrie avancée

> Build prod complet vert (`npm run build`), `cargo check` OK (défaut + `stt`). Détail
> d'implémentation : voir le journal (section 8, entrée 2026-06-08). Résumé de l'acquis :
> 6 fournisseurs + `listModels` · Config (clé chiffrée, modèle dynamique, test, on/off,
> prompt éditable par langue) · **post-race** (session + `.svm` réel + référence classe) ·
> **télémétrie** (électronique + virages + **métriques par phase** + **perte par phase** +
> Δ apex + **meilleur théorique self** + **hybride** + **style**) · **live** (snapshot + pit
> + onglet + **push-to-talk vocal `Alt+C`**) · conversation continue · **streaming** ·
> coût · stop · markdown + TTS (lecture auto phrase-par-phrase) · dictée libre (feature `stt`).
> Garde-fou de sujet (LMU/pilotage). i18n FR/EN/ES/DE.
> Restant optionnel : objet JSON strict par virage ; référence communautaire (traces alien, Phase 6).

#### AI Coach — Phase 1 (plan initial, conservé pour référence)

> Item #93. BYO-key, post-race d'abord. Voir entrée journal 2026-06-08 pour le cadrage.
> Corrections de la spec TEST_TROPHY intégrées (Anthropic `system`, appels via Rust,
> SQLite≠DuckDB, `listModels`, setup `.svm` réel).

**Backend Rust — `commands/ai.rs` (nouveau)** : proxy HTTP unique pour les 6 fournisseurs
(évite CORS + sort la clé de la WebView).
- `ai_chat(provider, url, headers, body) -> Value` (non-stream en Phase 1)
- `ai_list_models(url, headers) -> Value`
- `ai_set_key(plain)` / `ai_get_key()` — AES-256-GCM (`ring`), clé dérivée hostname+user
  (= **obfuscation**, pas vraie sécurité).
- Deps : `reqwest` (json, rustls-tls), `ring`. CSP inchangée (appels côté process Rust).

**Frontend — `src/lib/ai/`** :
- `types.ts` ; `providers/{openai-compat,anthropic,google,ollama}.ts` + `index.ts`
  (OpenAI-compat sert OpenAI/DeepSeek/Mistral) ; `models.ts` (filtre chat + tri récence
  + cache `config ai_models_cache_<p>` + fallback statique) ; `cost.ts` (`COST_MAP` par
  préfixe + fallback « inconnu ») ; `coach.ts` (`analyze`, `testConnection`).
- `AIProvider` étend la spec avec `listModels(key)` + `modelsEndpoint`.

**Cœur valeur — `src/lib/ai/context/postrace-context.ts`** : `buildPostRaceContext(sessionId)`
condense en ~600-1000 tokens : (1) résultat session (SQLite `session_detail.rs`),
(2) **setup `.svm` réel** lié (`get_setup_content` via `linked_session_id`), (3) **features**
télémétrie résumées (apex/freinage/deltas pneus — pas de dump brut), (4) référence alien
(ohne_speed). Sections manquantes **omises explicitement** (le system prompt interdit
d'inventer).

**Prompts — `src/lib/ai/prompts/{system,postrace}.ts`** : base FR/EN/ES/DE (spec §4) +
quick (300 tok) / full (1000 tok). Pas de JSON circuits (Phase 2 coupée).

**UI/store/i18n** : `stores/app.ts` (+8 props, clé via `ai_set_key`) ; carte « AI Coach »
dans `Config.tsx` (provider, clé masquée, **dropdown modèle dynamique + Rafraîchir**,
langue, max tokens, Test) ; bouton « Analyser » + panel dans `SessionDetail.tsx` ;
clés i18n dans les `.ts` (pas `.json`).

**Ordre** : 1) `ai.rs` → 2) provider OpenAI + `listModels` (valider sur clé réelle) →
3) autres providers → 4) **extracteur de contexte (valider sur vraie session avant tout
appel IA)** → 5) prompts + `analyze` → 6) UI/store/i18n.

**Hors Phase 1** : streaming SSE, mode Live + triggers + rate limiter (Ph.3), TTS coach
(Ph.4, trivial via `speak()`), comparaison tours / historique analyses (Ph.5), communauté.

---

## 6. Comment reprendre le travail

```bash
cd C:\tmp\__DEV__\_LMU_V3
npm install        # si node_modules absent
npm run dev        # mode web (http://localhost:5173)
npm run tauri:dev  # mode desktop (nécessite Rust + VS Build Tools)
```

1. Lire ce fichier `SUIVI.md` en entier.
2. Vérifier la dernière entrée du Journal de bord (section 8) → « Prochaine étape ».
3. Avant d'implémenter une page, **lire le PHP V1 correspondant** dans `OLDLMU_Stats_Viewer_095\htdocs\` et vérifier les règles de la section 3.

---

## 7. Notes / points ouverts

- `zz_V1` ne contient pas le code source PHP (seulement l'`.exe`) — la référence est `OLDLMU_Stats_Viewer_095\htdocs\`.
- `zz_V2` contient un backend Rust complet (`src-tauri/src/`) — utilisable comme référence d'inspiration, mais à réécrire/vérifier contre la V1.
- Le `.git` de `zz_V1` est verrouillé (fichiers `.lock` périmés) — non bloquant, le code est ailleurs.
- ohne_speed : CSV public Google Sheets, mapping circuits/classes, calcul tier + delta vs Alien.
- Live : plugin shared memory rF2 (`$rFactor2SMMP_Telemetry$` / `$rFactor2SMMP_Scoring$`) — l'utilisateur doit l'installer dans `<LMU>/Plugins/`.
- ~~**À faire — badge Online/Solo**~~ : **abandonné** (2026-06-03). Redondant : la distinction est déjà visible via le type de réglage « En ligne » (Multiplayer) vs « Week-end de course » (Race Weekend) affiché dans les tableaux.
- **Idée future — plugin SimHub** (pour les fans de SimHub) : proposer un **plugin SimHub** apportant les annonces vocales « ingénieur de course » (et/ou des propriétés de données) dans l'écosystème SimHub. ⚠️ Sous-projet **séparé en C#** (SimHub Plugin SDK / `IDataPlugin`), distinct du code Tauri/Rust : la logique de callouts (`useVoiceCallouts`) serait **réimplémentée** côté C# à partir de la télémétrie que SimHub fournit déjà. Indépendant de l'app principale. À planifier plus tard. Alternative plus légère côté app : fenêtre **overlay transparente always-on-top** (Tauri) au lieu d'un vrai plugin SimHub.
- **« parler au spotter » (façon CrewChief)** — **Couche 1 FAITE** (2026-06-02), **Couche 2 FAITE** (2026-06-03).
- **Télémétrie post-session — format DuckDB** (2026-06-07) : LMU écrit nativement en `.duckdb` dans `UserData/Telemetry/` quand l'utilisateur active Telemetry Recording en jeu (Settings → Controls → Gameplay). Pas de parsing binaire `.bt` nécessaire. La crate Rust `duckdb` peut lire ces fichiers directement. Structure interne : table `metadata` (key/value) + tables continues (`value` float, alignées sur `GPS Time` via rowid) + tables événementielles (`ts` + `value`). ~60 canaux à 50-100 Hz.
- **URLs officielles LMU à surveiller** (2026-06-07) : Manuel télémétrie `https://guide.lemansultimate.com/hc/en-gb/articles/14524956311695-Telemetry-Recording` — Release notes `https://guide.lemansultimate.com/hc/en-gb/categories/13278904445967-Release-Notes`. Scraper périodiquement pour détecter nouveaux circuits/voitures.
- **Phases télémétrie recommandées** (2026-06-07) : T7.1 Fondation DuckDB (crate Rust + commands Tauri) → T7.2 Graphes uPlot → T7.3 Heatmap carte 2D → T7.4 Comparaison/delta → T7.5 Export .svm → T7.6 3D ghost car.
  **Cible retenue** : *push-to-talk + reconnaissance vocale par **commandes** (grammaire fermée), avec repli touche→statut*. Le vocabulaire restreint = beaucoup plus fiable/léger/hors-ligne que la dictée libre, et plus naturel que des touches seules.
  - **Couche 1 — MVP touches (facile, sans STT)** : ✅ **implémentée** — raccourcis globaux (`tauri-plugin-global-shortcut`) **Statut · Mute · Répète** → réponse parlée via la voix Piper à partir des données Live (`live.getData()` à la demande). Modules `src/lib/spotter.ts` (constructeur de phrases) + `src/lib/useSpotter.ts` (enregistrement). Touches configurables en Config.
  - **Couche 2 — reconnaissance par commandes** : ✅ **implémentée** avec **Vosk** en sidecar (offline, grammaire fermée). Push-to-talk (`spotterKeyTalk`, défaut `Alt+T`) : maintenir → capture micro (`src/lib/mic.ts`, `getUserMedia` → PCM 16 kHz Int16), relâcher → `stt_recognize` (Rust `commands/stt.rs`, modèle caché + `Recognizer::new_with_grammar`) → `matchIntent` (`src/lib/spotterCommands.ts`) → `buildAnswer` (`src/lib/spotter.ts`) → `announce`. Repli **Statut** si reco vide/échec. Assets via `scripts/fetch-vosk.ps1` (libvosk + modèles small FR/EN/ES/DE dans `resources/stt/`, gitignorés). Indicateur d'état `stt_available` en Config.
    - ⚠️ **`vosk` est derrière une feature Cargo `stt` (OFF par défaut)** : l'app compile **sans** les assets. Pour activer la reco : fetch des assets puis `npm run tauri dev -- --features stt --config src-tauri/tauri.stt.conf.json` (l'overlay `tauri.stt.conf.json` ajoute les ressources de bundle). Sans la feature, les commandes `stt_*` n'existent pas → le frontend retombe sur le Statut.
    - **Linking Windows** : le crate lie `libvosk.lib`. Si l'archive ne fournit que la DLL, générer l'import lib (`lib /def:… /out:libvosk.lib /machine:x64`) — cf. en-tête de `fetch-vosk.ps1`.
  - **Commandes & réponses** (toutes calculables depuis `LiveData`) : **statut** · **écart** (`time_behind_next` joueur + suivant) · **carburant** (`fuel_laps_remaining`) · **pneus** (`wheels` temp/usure) · **position** (`time_behind_leader`) · **rythme** (`last_lap`/`best_lap`/`lap_delta`) · **restant** (`max_laps`/`end_et`) · **météo** (`weather`) ; + contrôle : **répète / mute**.
  - **Reste possible** : streaming continu (au lieu de batch au relâchement), variante « boutons radio » (1 touche/question), presets de phrases.

### Critique design (2026-06-05) — tâches suggérées

> Issues de l'analyse `/design-critique`. Priorité : 🔴 haute · 🟡 moyenne · 🟢 basse.

**🔴 Priorité haute (accessibilité / dette structurelle)**
1. ✅ **FAIT (2026-06-05)** — Contraste orange primaire : blanc/`#FF4A0F` = 3.37:1 (échec AA) → token foncé à `#D93B00` (≈4.6:1). Cf. journal.
2. ✅ **FAIT (2026-06-05)** — Couleurs de classe unifiées : helper `classChartColor()` dans `staticData` (basé sur `CAR_CLASS_SOLID_COLORS`), copies inline `CLASS_COLORS` supprimées de Dashboard + Profile. Cf. journal.
3. ✅ **FAIT (2026-06-05)** — Plancher typographique : les 20 `text-[9px]` (8 fichiers) passés à `text-[10px]`. Cf. journal.

**🟡 Priorité moyenne (usabilité)**
4. ✅ **FAIT (2026-06-05)** — Zones cliquables des boutons d'action icône (Dashboard) : classe commune `ACTION_BTN` (24 px, `inline-flex h-6 w-6`). Cf. journal.
5. 🟠 **PARTIEL (2026-06-05)** — `title` → `Tooltip` (helper `Tip`) sur les **boutons d'action des tableaux** Dashboard + Sessions. Reste ~50 `title=` natifs ailleurs (16 fichiers) à migrer.
6. ✅ **FAIT (2026-06-05)** — Affordance « best lap » permanente (Dashboard + Sessions) : `underline` toujours visible + `cursor-pointer`.
7. ✅ **FAIT (2026-06-05)** — `focus-visible:ring-2 ring-ring` ajouté aux `<button>` natifs des cellules (Dashboard + Sessions : actions + best lap).

**🟡 Priorité moyenne (cohérence)**
8. 🟠 **PARTIEL (2026-06-05)** — Hex inline sortis de `SessionBadge` vers des tokens `--color-session-*`. Reste la migration large palette brute → tokens (~187 usages, change les teintes → décision design requise, différée). Cf. journal.
9. ✅ **FAIT (2026-06-05)** — Émojis du hero retirés (`🏆`/`🥇`/`▲`), icônes lucide conservées. ⚠️ Déroge à la fidélité V1 (choix utilisateur explicite).
10. ⏳ Redéfinir les paddings par défaut de `Card` — `p-6` (`card.tsx:43`) systématiquement écrasé par `p-2.5`/`p-3`. *(non retenu pour l'instant — risque de régression Onboarding/Config.)*
11. ✅ **FAIT (2026-06-05)** — Échelle typo via `@utility text-nano/micro/mini` (9/10/11 px) ; 138 `text-[Npx]` migrés. Cf. journal.

**🟢 Priorité basse (raffinement)**
12. ⏳ Hiérarchiser le hero du Dashboard — différencier 1-2 stats clés au lieu de 7 cartes de poids égal (`Dashboard.tsx:302`).
13. ⏳ Adoucir l'en-tête de groupe en thème clair — jaune-700 sur `bg-primary/30` un peu « boueux » (`Dashboard.tsx:608`).
14. ⏳ Gérer le tableau 18 colonnes sous ~1200 px — masquer Vmax/Version ou sélecteur de colonnes (`Dashboard.tsx:632`).

### Propositions classées par type (2026-06-06)

> 180 propositions issues de l'audit interne + analyse de 28 projets concurrents.
> Priorité : 🔴 critique · 🟡 moyen · 🟢 niche. Statut : ✅ fait · ⏳ en attente · 🟠 partiel.
> Sources : voir section "Projets à surveiller" plus bas.

---

#### T1. Architecture & dette technique

1. ⏳ Éclater `SessionDetail.tsx` (2743 lignes) en ~8 composants par onglet.
2. ⏳ Éclater `Live.tsx` (2308 lignes) : bandeau, standings, télémétrie, carte, voice callouts.
3. ⏳ Cible : aucun fichier route > 500 lignes.
4. ⏳ Mutualiser `CLASS_ORDER` (5 copies) via `staticData.ts`.
5. ⏳ Nettoyer 28 variables mutables module-level dans les libs (invisible React DevTools).
6. ⏳ Unifier les 3 `norm()` aux defaults incohérents ("fr", "en", "en").
7. ⏳ Retirer `raw-window-handle` (inutilisé) + `staticlib` de Cargo.toml.
8. ⏳ Remplacer `chrono` (3 usages) par du formatage manuel ou `time`.
9. ⏳ Uniformiser gestion d'erreur : `xml_parser` retourne `String` → `AppError`.
10. ⏳ Ajouter codes d'erreur structurés au frontend (pas juste texte).
11. ⏳ Logger/afficher les 8 `.catch(() => {})` silencieux du frontend.
12. ⏳ Remplacer `.ok()` / `.unwrap_or_default()` silencieux backend par du logging.
13. ⏳ Définir une CSP minimale (actuellement `null`).
14. ⏳ Remplacer base64 maison (`tts.rs` + `stt.rs`) par crate `base64`.
15. ⏳ Wrapper les modèles Vosk dans `OnceLock`/`Arc` au lieu de `Box::leak`.
16. ⏳ RAII pour les handles shared memory (`live.rs`).
17. ⏳ Factory Zustand : 10 setters identiques → `createSetter(key)`.
18. ⏳ `SELECT *` → nommer les colonnes (`session_detail.rs:233`).
19. ⏳ Lecture SQL par index → lecture par nom de colonne.
20. ⏳ N+1 `recompute_event_ids` → batch UPDATE ou table temporaire.
21. ⏳ SQL dynamique `format!` → builder ou constantes string.
22. ⏳ i18n : 14 strings FR codées dur `Profile.tsx` + 5 `ohne_speed.ts` TIER_LABELS + tooltip `Dashboard.tsx:814` + chaîne graphe tours.
23. ⏳ Remplacer 10 `alert()` / 1 `prompt()` dans `Setups.tsx` → dialogs shadcn.
24. ⏳ `window.location.reload()` après suppression setup → invalidation state.
25. ⏳ Extraire 3 patterns dupliqués VoiceMessagesModal/SpotterCommandsModal (escape, CAP, draft).

---

#### T2. Tests

26. ⏳ Tests unitaires parser XML (sans chemin local hardcodé).
27. ⏳ Tests parser SVM.
28. ⏳ Tests agrégats (best_lap, optimal, progression).
29. ⏳ Refaire `smoke_index_real_data` sans `D:\SteamLibrary\…`.
30. ⏳ Tests utilitaires frontend (`formatTime`, `classChartColor`, `computeFuelToFinish`).
31. ⏳ Tests hooks critiques (`useVoiceCallouts`, `useSpotter`).

---

#### T3. Accessibilité (WCAG AA)

32. ⏳ Lignes tableau cliquables : `tabIndex={0}`, `role="button"/"link"`, `onKeyDown` (`Sessions.tsx:665`, `Dashboard.tsx:598`).
33. ⏳ Cellules filtrables focusables + `:focus-visible` (`Sessions.tsx:699-753`).
34. ⏳ Groupes pliables Dashboard → `aria-expanded`.
35. ⏳ Skip-to-content dans `App.tsx`.
36. ⏳ `aria-label` sur `<nav>`, pagination, spinners (5 occurrences).
37. ⏳ `aria-sort` sur `SortHeader` (`table.tsx`).
38. ⏳ `aria-expanded` / `aria-controls` sur boutons pliables Config + Dashboard.
39. ⏳ `role="dialog"`, `aria-modal`, focus trap sur modale confirmation Config.
40. ⏳ `role="tablist"` / `role="tab"` / `aria-selected` sur onglets Live, Setups.
41. ⏳ `role="radiogroup"` sur segmented controls Config (thème, PTT).
42. ⏳ Labels associés aux `<select>` et `<input range>` Config (6 champs).
43. ⏳ `aria-current="page"` sur pagination active.
44. ⏳ Vérifier ratio contraste `muted-foreground` / `yellow-300` / `amber-400/70` / `text-pink-400`.
45. ⏳ Ajouter `@media (prefers-reduced-motion: reduce)` pour `pulse-glow`, `flag-blink`.
46. ⏳ Compléter scrollbar CSS avec `scrollbar-width` / `scrollbar-color` (Firefox).
47. ⏳ `aria-label` + `role="img"` sur tous les Recharts + carte SVG Live.

---

#### T4. Design & UI

48. ⏳ Supprimer hex inline (`#f87171`, `#d946ef`…) → tokens CSS.
49. ⏳ Trancher `--color-success` vs `text-emerald-500` → un seul système.
50. ⏳ Supprimer émojis hero (`🏆`/`🥇`/`▲`) → icônes lucide (`Dashboard.tsx:215-237`).
51. ⏳ Redéfinir padding par défaut `Card` (`p-6` écrasé partout → `p-3`).
52. ⏳ Échelle typographique : `--text-micro: 10px`, `--text-xs: 11px` vs magic numbers.
53. ⏳ Unifier paddings tableaux (3 niveaux : `p-3` défaut, `px-1` forcé, `px-2 py-1` inline) → variant `dense`.
54. ⏳ Hiérarchiser hero Dashboard : 2 stats clés + 5 secondaires (au lieu de 7 égales).
55. ⏳ Adoucir en-tête groupe thème clair (jaune-700 sur `bg-primary/30`).
56. ⏳ Vérifier couleurs hardcodées non-adaptatives (`podiumColor`, `text-pink-400`).
57. ⏳ Tableau 18 colonnes sous 1200px → masquer colonnes ou sélecteur.
58. ⏳ Hamburger menu Header sous 768px.
59. ⏳ Dashboard : vue condensée sous 1200px (masquer Vmax/Version).
60. ⏳ Sessions : vue condensée sous 1024px.
61. ⏳ SessionDetail : 9 colonnes métriques → empiler sous `lg`.
62. ⏳ Page Live : minimum de flexibilité sous 1024px.
63. ⏳ Route 404 catch-all dans `App.tsx`.

---

#### T5. Performance

64. ⏳ `Mutex<Connection>` → `RwLock` ou connexion par thread (lectures simultanées).
65. ⏳ Polling live 50ms fixe → adaptatif (lent en menus, 50ms en course).
66. ⏳ `Vec::remove(0)` → `VecDeque` (`live.rs:855`).
67. ⏳ `build_lap` : 13 clones d'attributs → extraction unique.
68. ⏳ Désérialisation JSON complète dans `list_setups` juste pour `vehicle_class` → parser léger.
69. ⏳ Lazy loading routes lourdes via `React.lazy` (SessionDetail, Live, Setups).
70. ⏳ Mémoïser filtres calculés Dashboard/Sessions.

---

#### T6. Robustesse

71. ⏳ Timeout sur `piper.exe` (TTS) → éviter gel si crash.
72. ⏳ Nettoyage fichiers WAV temporaires Piper (pas de cleanup si crash).
73. ⏳ Logging structuré backend (crate `tracing`) — actuellement zéro logs.
74. ⏳ Migrations DB avec vérification d'erreur (pas `let _ =`).
75. ⏳ Toast/feedback après actions CRUD (Setups suppression, liaison).
76. ⏳ Error boundary React pour éviter crash total.
77. ⏳ Retry fetch ohne_speed avec backoff (actuellement un seul essai).

---

#### T7. Télémétrie & analyse de données

> Lecture des données haute fréquence (fichiers `.bt` et `.duckdb`), visualisation, comparaison.

78. ⏳ 🔴 **Télémétrie par canaux `.bt`** — Lecture binaire 60+ canaux à 50-100 Hz (throttle/brake/steering filtré+brut, G-forces, temp pneus, pressions, suspension, ride height, aéro, hybrid SoC). Graphes superposés speed+throttle+brake+steering.
79. ⏳ 🔴 **Lecteur de télémétrie DuckDB** — Exploiter les fichiers `.duckdb` de LMU pour throttle/brake/steering/speed/temps pneus à haute fréquence. Sources : alelosbrigia, underlines, lmutrace.com.
80. ⏳ 🟡 **Export MoTeC .ld** — Convertir la télémétrie LMU au format MoTeC i2 (forte demande communauté). Source : alelosbrigia.
81. 🟠 **Comparaison de tours + ghost car** — ✅ base faite (T7.4, 2026-06-07) : delta temps cumulé + superposition courbes (réalignées par distance). Reste : ghost car 3D (T7.6), comparaison inter-sessions. Sources : LMU Telemetry Lab, lmutrace.com, popometer.io.
82. ✅ **Comparaison de laps avec delta overlay** — fait (T7.4, 2026-06-07) : 2 tours superposés (réf. en pointillés) + graphe de delta style MoTeC, axe distance. Source : underlines.
83. ⏳ 🟡 **Axe distance** — Afficher la télémétrie par distance sur le tour plutôt que par temps. Source : underlines.
84. 🟠 **Segmentation automatique de piste** — ✅ base faite (2026-06-08, virages depuis brake+vitesse). — Détecter virages et lignes droites depuis les données de steering. Source : underlines.
85. 🟠 **Points de freinage suggérés** — ✅ base faite (2026-06-08 : marqueurs carte + liste virages). — Zones de freinage optimales basées sur les tours de référence. Sources : lmu-beeper-pro, LeMansUltimateCoPilot.
86. ⏳ 🟡 **Segmentation en virages auto + micro-secteurs configurables** — Détection type + difficulté des virages. Source : LeMansUltimateCoPilot.
87. 🟠 **Replay immersif** — ✅ base 2D faite (2026-06-07) : mode lecteur (timeline + play/pause + vitesse, voiture animée sur la carte 2D + valeurs en direct, `TelemetryPlayer.tsx`). Reste : replay 3D / caméra de suivi (T7.6). Source : mylmu.app.
88. ❌ **Export .svm depuis télémétrie** — **abandonné** (2026-06-07) : la télémétrie ne contient que l'électronique (ABS/TC/brake bias/mix) + carburant, **pas** le réglage mécanique/aéro (ressorts, amortisseurs, ailerons, boîte, pressions à froid). Un .svm exporté serait partiel/par défaut → redondant avec le Garage qui lit déjà les vrais setups. Source : LMU Telemetry Lab.
89. ⏳ 🟢 **Rapport de session PDF** — Export PDF d'une session complète avec graphiques. Aucun concurrent.
90. ✅ **Analyse assistée** — fait (2026-06-08) : `lib/telemetry/analysis.ts` (`analyzeLap`) → temps perdu/virage (variation du delta cumulé), écart de vitesse à l'apex vs réf, point le plus lent. Carte « Analyse » dans `TelemetryView`. Source : popometer.io.
91. ⏳ 🟢 **Comparaison avec pilotes pros** — Importer des "data packs" de référence et superposer. Source : popometer.io.
92. ✅ **Focus zones** — fait (2026-06-08) : top-3 virages par temps perdu (surlignés 🔥) + perte totale virages, dans la carte « Analyse ». Nécessite une référence. Source : popometer.io.
93. 🟠 🔴 **AI Coach** — Chatbot qui répond sur la télémétrie et les setups (LLM local ou API). Sources : mylmu.app, popometer.io. **Plan Phase 1 défini (2026-06-08)** — spec auditée (`TEST_TROPHY`), cf. section 5 « AI Coach — Phase 1 » + journal 2026-06-08. BYO-key, post-race d'abord, appels via Rust, `listModels`, contexte ancré sur le `.svm` réel.

---

#### T8. Cartes & visualisation circuit

94. ✅ **Carte 2D du circuit avec heatmap** — fait : carte GPS colorée throttle/brake/coast (`TrackMap.tsx`, SVG depuis #95), follow-cam, **curseur lié carte↔graphes** (2026-06-08). Sources : LMU Telemetry Lab, TinyPedal.
95. ✅ **Carte circuit SVG haute fidélité** — fait (2026-06-08) : `TrackMap.tsx` réécrit en SVG vectoriel (lissage Catmull‑Rom → Bézier, ruban bordure + surface, repère départ perpendiculaire), façon TinyPedal/LMU Trace. Drop‑in (props inchangées). Source : lmutrace.com, TinyPedal.
96. ⏳ 🟡 **Vue circulaire du circuit** — Carte en cercle avec graphe "gap to me" au centre. Source : Telemetry Tool.
97. ⏳ 🟢 **Carte overlay live** — Positions des voitures en temps réel sur la carte. Sources : lmutrace.com, LMUSessionTracker.
98. ⏳ 🟡 **Heatmap d'incidents sur carte** — Visualisation spatiale des zones à risque. Source : lmu-steward.
99. ⏳ 🟢 **Race history position** — Évolution de la position sur piste au fil du temps. Source : Telemetry Tool.
100. ⏳ 🟢 **Field spread** — Visualisation de l'étalement du plateau en temps relatif. Source : Telemetry Tool.

---

#### T9. Statistiques & métriques calculées

101. ✅ **Theoretical best détaillé** — fait (2026-06-08) : best des secteurs S1/S2/S3 du joueur + best théorique (somme) + gain potentiel vs meilleur tour réel, ligne détaillée dans le bandeau Perf de `SessionDetail`. Source : LMU Analyzer.
102. ✅ **Race pace calculé (IQR)** — fait (2026-06-08) : moyenne des tours de course hors aberrants (filtre IQR 1.5×) dans `playerPerf` + métrique « Rythme course » (`SessionDetail`). Source : LMU Analyzer.
103. ✅ **Consistency Score** — déjà fait : `100 - (écart-type / moyenne) × 100` dans `playerPerf.consistency` (`SessionDetail`). Source : LMU Analyzer.
104. ❌ **Data export CSV/XLSX** — **non retenu** (décision utilisateur, 2026-06-08). Source : LMU Analyzer.
105. ⏳ 🟡 **Virtual Energy / Hybrid SoC tracking** — Suivi énergie hybride tour par tour (Hypercar). Sources : LMU Telemetry Lab, mylmu.app.
106. ⏳ 🟡 **Track Limits détaillés** — Onglet dédié : heure, tour, warning points, total, resolution. Source : LMU Analyzer.
107. ⏳ 🟡 **Risk Index / Safety Score** — Score normalisé incidents/lap vs moyenne plateau. Source : lmu-steward.
108. ⏳ 🟡 **Badge sévérité session** — Étiquette Low/Medium/High basée sur incidents par pilote. Source : lmu-steward.
109. ⏳ 🟡 **Driver Profile enrichi** — Avatar + nom modifiable, stats Total/Online/Rated, activity heatmap. Sources : LMU Analyzer, mylmu.app.
110. ⏳ 🟢 **Activity heatmap / Streaks** — Calendrier GitHub-like des jours de conduite. Source : mylmu.app.
111. ⏳ 🟢 **Safety Rating badge** — Rang Bronze/Silver/Gold/Platinum. Source : LMU-RPC-Mod.
112. ⏳ 🟢 **Badge AI vs humain** — Identification visuelle des pilotes AI. Source : lmu-steward.
113. ⏳ 🟡 **Deduplication de sessions XML** — Fusion automatique des fragments quand un pilote rejoint en cours. Source : LMU Analyzer.

---

#### T10. Pneus & motorisation live

> Données temps réel depuis la shared memory (déjà lues partiellement par le backend Rust).

114. ⏳ 🟡 **Tire Strategy Visualization** — Barres colorées par stint : Soft/Medium/Hard/Wet. Source : LMU Analyzer.
115. ⏳ 🟡 **Tire Wear par coin FL/FR/RL/RR** — 4 courbes d'usure distinctes. Source : LMU Analyzer.
116. ⏳ 🟡 **Suivi pneus en course** — Compos avant/après pit, état neuf/usé. Source : LMUSessionTracker.
117. ⏳ 🟡 **Compound pneus par voiture en live** — Soft/Medium/Hard/Wet dans le standings live. Sources : goLMUSharedMemory, lmutrace.com.
118. ⏳ 🟡 **Température pneus 3 points live** — Gauche/centre/droite par roue en overlay. Sources : goLMUSharedMemory, lmutrace.com.
119. ⏳ 🟢 **Température carcasse pneu** — `mTireCarcassTemperature` + `mTireInnerLayerTemperature[3]`. Source : pyLMUSharedMemory.
120. ⏳ 🟢 **Température pneus 3 points (post-session)** — `mTemperature[3]` par roue dans les fichiers XML. Source : pyLMUSharedMemory.
121. ⏳ 🟡 **Virtual Energy fraction live** — `mVirtualEnergy` pas encore affiché dans le Live. Source : pyLMUSharedMemory.
122. ⏳ 🟡 **State of Charge (SoC) live** — `mStateOfCharge` pour Hypercar hybrides. Source : pyLMUSharedMemory.
123. ⏳ 🟢 **Electric Boost Motor state** — 0=indispo, 1=inactif, 2=propulsion, 3=régénération. Source : pyLMUSharedMemory.
124. ⏳ 🟡 **Lift & Coast progress live** — `mLiftAndCoastProgress` en overlay. Sources : pyLMUSharedMemory, lmutrace.com.
125. ⏳ 🟢 **Track Limits Steps live** — `mTrackLimitsSteps` + `mTrackLimitsStepsPerPenalty/Point`. Source : pyLMUSharedMemory.
126. ⏳ 🟡 **Température moteur live** — Eau + huile depuis la shared memory. Source : goLMUSharedMemory.
127. ⏳ 🟢 **Surface type par roue live** — `mSurfaceType` (sec/mouillé/herbe/terre/gravier/kerb). Source : pyLMUSharedMemory.
128. ⏳ 🟢 **Grip fraction par roue live** — `mGripFract` (0.0-1.0), adhérence temps réel. Source : pyLMUSharedMemory.
129. ⏳ 🟢 **Force feedback torque** — `mSteeringShaftTorque` + `FFBTorque`. Source : pyLMUSharedMemory.
130. ⏳ 🟢 **Ride height avant/arrière** — `mFrontRideHeight` / `mRearRideHeight`. Source : pyLMUSharedMemory.
131. ⏳ 🟢 **Downforce avant/arrière + drag** — `mFrontDownforce` / `mRearDownforce` / `mDrag`. Source : pyLMUSharedMemory.
132. ⏳ 🟢 **3rd spring deflection** — `mFront3rdDeflection` / `mRear3rdDeflection`. Source : pyLMUSharedMemory.
133. ⏳ 🟡 **Réglages électroniques live** — TC/ABS/Regen/MotorMap/BrakeMigration/ARB via REST API LMU. Source : LMU Electronic Bridge.
134. ⏳ 🟢 **Dommages par coin (suspension + aéro)** — `mDentSeverity[8]` + `mLastImpactMagnitude`. Source : LMU Electronic Bridge.
135. ⏳ 🟢 **Lookup tables Hypercar** — Regen kW, Motor Map kW, Brake Migration %F par modèle. Source : LMU Electronic Bridge.
136. ⏳ 🟢 **Tire compound type enum live** — `mCompoundType` + `mOptimalTemp`. Source : pyLMUSharedMemory.

---

#### T11. Stratégie & planification course

137. ⏳ 🟡 **Fuel Strategy / Pit Window** — Fenêtre de pit optimale, conso médiane, temps perdu au pit par circuit. Sources : LMU Pitwall, LMPlanner.
138. ⏳ 🟡 **Planificateur de course (stint planner)** — Durée, pilotes, temps au tour → relais auto avec pit stop. Source : LMPlanner.
139. ⏳ 🟡 **Rotation pilotes** — Attribution aux relais (A-B-C-A-B-C…) avec temps personnalisés. Source : LMPlanner.
140. ⏳ 🟡 **Calcul temps pit stop complet** — Ravitaillement + pneus + pit lane par circuit/classe. Source : LMPlanner.
141. ⏳ 🟢 **Double stint** — Option 2 relais même train de pneus (stratégie LMP2). Source : LMPlanner.
142. ⏳ 🟢 **Base de données temps pit lane par circuit** — Collecte communautaire ou mesure auto. Source : LMPlanner.
143. ⏳ 🟡 **Pit Summary par voiture** — Nombre d'arrêts, timing, pneus changés. Source : LMUSessionTracker.

---

#### T12. Stewarding & incidents

144. ⏳ 🟡 **Timeline d'incidents** — Parser tracelogs/XML : collisions, track limits, pénalités, affichage chronologique. Source : lmu-steward.
145. ⏳ 🟡 **Fault Analysis basique** — Identifier sujet (percuteur) vs secondaire (percuté) dans les collisions. Source : lmu-steward.
146. ⏳ 🟡 **Chat log de session** — Extraire et afficher le chat in-game depuis `<Stream>`. Source : lmu-steward.
147. ⏳ 🟢 **Groupement sessions par event weekend** — Practice + Qualif + Race sous une seule carte. Sources : lmu-steward, LMUTools.

---

#### T13. Spotter & race engineer avancé

> Extensions du système TTS/spotter existant.

148. ⏳ 🟡 **Analyse attack/defend** — Identifier le virage où on gagne/perd le plus vs adversaire direct. Source : CrewChiefV4.
149. ⏳ 🟡 **Messages multiclasse spécifiques** — "Voiture rapide derrière, classe différente" vs "bataille dans ta classe". Source : CrewChiefV4.
150. ⏳ 🟡 **Silence dans les virages/zones de freinage** — Retarder callouts non-critiques dans les secteurs difficiles. Source : CrewChiefV4.
151. ⏳ 🟡 **Prediction position sortie stands** — "Si tu rentres maintenant, tu ressors P8". Source : CrewChiefV4.
152. ⏳ 🟡 **Benchmark temps d'arrêt** — Temps perdu au pit (S3+S1 vs tour de ref), sauvegardé par circuit/voiture. Source : CrewChiefV4.
153. ⏳ 🟡 **Comparaison de compounds pneumatiques** — "Les tendres sont 0.8s plus rapides que les durs". Source : CrewChiefV4.
154. ⏳ 🟡 **Alerte "leader s'arrête" / "adversaire sort des stands"** — Info stratégique endurance. Source : CrewChiefV4.
155. ⏳ 🟢 **Variantes de messages (anti-répétition)** — Variantes dans les bundles i18n. Source : CrewChiefV4.
156. ⏳ 🟢 **Prediction changement météo** — "La pluie devrait arriver dans ~10 min". Source : CrewChiefV4.
157. ⏳ 🟡 **"Fuel to end" avec réserve configurable** — Réponse précise avec marge de sécurité. Source : CrewChiefV4.
158. ⏳ 🟡 **Suivi arrêts obligatoires adversaires** — Savoir qui a arrêté et qui doit encore arrêter. Source : CrewChiefV4.
159. ⏳ 🟢 **Compte à rebours emplacement stand** — "5-4-3-2-1" avant l'emplacement. Source : CrewChiefV4.
160. ⏳ 🟡 **Corner name calling** — "Incident dans le virage 1" / "Dunlop". Source : CrewChiefV4.
161. ⏳ 🟡 **Vérification/installation auto du plugin shared memory** — Détecter DLL absent et copier. Source : CrewChiefV4.

---

#### T14. Overlays in-game

> Widgets affichés par-dessus le jeu (always-on-top, click-through).

162. ⏳ 🔴 **16 widgets overlay natifs** — Dashboard, Delta, Track Map, Standings, Relative, Fuel, Tyres, Weather, Damage, Session, Endurance, Rival, Speed, Lift & Coast, Flags, Telemetry. Drag-to-position, redimensionnables. Sources : lmutrace.com, racepulse.
163. ⏳ 🔴 **Mode click-through** — L'overlay laisse passer les clics vers le jeu. Sources : racepulse, momentum-lmu.
164. ⏳ 🔴 **Fenêtre overlay séparée** — Toujours au premier plan, données essentielles ; fenêtre principale normale. Source : momentum-lmu.
165. ⏳ 🟡 **Delta-best overlay transparent** — Always-on-top avec delta temps sur le pare-brise. Source : TinyPedal.
166. ⏳ 🟡 **Standings live enrichi** — Vmax, S1/S2/S3, nombre pits, fuel%, damage%, compound, delta. Sources : go-lmu-api, LMUSessionTracker, lmutrace.com.
167. ⏳ 🟢 **Radar proximité temps réel** — Widget radar montrant les voitures autour via shared memory. Source : TinyPedal.
168. ⏳ 🟢 **Ahead telemetry** — Voir les inputs de la voiture de devant en live. Source : Telemetry Tool.
169. ⏳ 🟢 **Indicateur de ping** — Latence réseau en live. Source : LMU-Ping-Overlay.
170. ⏳ 🟢 **Combinaison Shared Memory + REST API** — Utiliser les deux sources pour des données plus fiables. Source : InFeRNoGC.

---

#### T15. Social & communauté

171. ⏳ 🟡 **Discord Rich Presence** — Afficher circuit, voiture, position, temps sur le profil Discord. Source : LMU-RPC-Mod.
172. ⏳ 🟡 **Webhook Discord** — Poster résumé de session/classement automatiquement. Sources : mylmu.app, LMU-Times-Bot.
173. ⏳ 🟡 **Rankings communautaires** — Leaderboards par classe. Source : mylmu.app.
174. ⏳ 🟢 **Teams** — Partage de données entre membres d'une équipe. Source : mylmu.app.
175. ⏳ 🟢 **Export / import setups JSON communautaire** — Partage léger sans infrastructure cloud. Source : interne.
176. ⏳ 🟢 **Sync Agent** — Tray app qui watch les dossiers Results/Telemetry et upload auto. Source : mylmu.app.
177. ⏳ 🟢 **Forward data** — Envoyer les données live à un race engineer distant. Source : Telemetry Tool.

---

#### T16. Outils & intégrations

178. ⏳ 🟢 **Bouton "Ouvrir le replay"** — Lancer LMU directement sur le replay depuis SessionDetail. Source : LMUTools.
179. ⏳ 🟢 **Analyse de trace.txt** — Détection micro-stutters, chutes physics, assets manquants. Source : lmu-toolset.
180. ⏳ 🟢 **Chemin plugins folder auto** — `mPluginsFolder` dans `LMUPathData` → détection auto du bon emplacement du DLL. Source : pyLMUSharedMemory.

---

### Projets à surveiller

> Classement par menace/opportunité pour LMU Stats Viewer V3.

**🔴 Concurrents directs (menace forte)**

| Projet | Type | Modèle | Points forts | URL |
|--------|------|--------|-------------|-----|
| **lmutrace.com** | SaaS cloud | Abonnement | 16 overlays natifs, SVG track map, lap comparison cloud, auto-upload, standings multiclasse | https://lmutrace.com |
| **mylmu.app** | SaaS cloud | Freemium | AI Coach, Sync Agent, Discord webhooks, teams, community rankings, track analytics | https://www.mylmu.app |
| **popometer.io** | SaaS cloud | Abonnement | Comparaison avec données pros, assisted analysis (apex, slowest point), overlays avec référence | https://popometer.io |
| **LMU Telemetry Lab** | Open source | Gratuit | 60+ canaux 50-100Hz, 2D/3D track map, ghost car, 27 chart types, comparaison laps | https://github.com/rabbit20031225/LMU-Telemetry-Lab |

**🟡 Compléments / Menace partielle**

| Projet | Type | Points forts | URL |
|--------|------|-------------|-----|
| **Telemetry Tool for LMU** | Desktop (Java) | Follow car, ahead telemetry, field spread, race history, forward data, 20+ jeux | https://www.overtake.gg/downloads/telemetry-tool-for-lmu.73664/ |
| **TinyPedal** | Open source (Python) | 16 widgets overlay ultra-configurables, fuel calculator, radar, Linux | https://github.com/TinyPedal/TinyPedal |
| **lmu-steward** | Open source (TS) | Incident timeline, heatmap incidents, risk index, fault analysis, filtres granulaires | https://github.com/misirlu13/lmu-steward |
| **LMUSessionTracker** | Open source (C#) | Architecture distribuée, suivi pneus, pit summary, carte live, badges pilotes | https://github.com/mbeader/LMUSessionTracker |
| **CrewChiefV4** | Open source (C#) | Spotter/race engineer avancé, milliers de samples voix, multiclasse, fuel/tire/damage | https://github.com/mrbelowski/CrewChiefV4 |
| **LMU Analyzer** | Open source | Theoretical best, consistency score, race pace, tire strategy viz, export xlsx | https://github.com/arminreiter/lmu-analyzer |
| **racepulse** | Fermé (Go/Wails) | Widgets modulaires drag-and-drop, click-through, flat map, multi-jeux | https://github.com/gAlexander77/racepulse-release |

**🟢 Inspirations secondaires**

| Projet | Points forts | URL |
|--------|-------------|-----|
| **LMU Electronic Bridge** | TC/ABS/Regen live, lookup tables Hypercar | https://github.com/nikolaiNr7/LMU-Electronic-Bridge-Release |
| **LMPlanner** | Stint planner, rotation pilotes, pit stop calc | https://github.com/juliusthyen/LMPlanner |
| **LMU Setup Viewer** | Side-by-side compare, diff highlighting | https://github.com/porgabi/lmu-setup-viewer |
| **LMU Pitwall** | Fuel calculator, Rust bridge + React/PWA | https://github.com/Swizzjack/lmu-pitwall |
| **LMUTools** | Navigateur replays, tracelog reader | https://github.com/JeGoBE8900/LMUTools |
| **lmu-toolset** | Analyse trace.txt, optimisation FFB | https://github.com/NickBelaneDev/lmu-toolset |
| **LMU-RPC-Mod** | Discord Rich Presence, safety rating badge | https://github.com/uWaazy/LMU-RPC-Mod |
| **LMU-Times-Bot** | Bot Discord leaderboard, architecture 3 tiers | https://github.com/AdamTuraj/LMU-Times-Bot |
| **goLMUSharedMemory** | Référence API complète shared memory | https://github.com/stephenhoran/goLMUSharedMemory |
| **pyLMUSharedMemory** | Mapping complet 324KB shared memory Python | https://github.com/TinyPedal/pyLMUSharedMemory |
| **go-lmu-api** | 179 endpoints REST API LMU documentés | https://github.com/snipem/go-lmu-api |
| **LMU-telemetry** | Convertisseur DuckDB → MoTeC .ld | https://github.com/alelosbrigia/LMU-telemetry |
| **LMU-Telemetry-Analyzer** | Segmentation auto piste, cache Parquet, ECharts | https://github.com/underlines/LMU-Telemetry-Analyzer |
| **lmu_settings_widget** | Presets settings graphiques, replay manager | https://github.com/tappi287/lmu_settings_widget |
| **lmu-beeper-pro** | Points de freinage overlay | https://github.com/christophersperl/lmu-beeper-pro |
| **momentum-lmu** | Double fenêtre contrôle + overlay | https://github.com/MarcoArmstrong/momentum-lmu |
| **LMU-Ping-Overlay** | Ping overlay live | https://github.com/cento789/LMU-Ping-Overlay |
| **LMU_Simple_Overlay** | Overlay minimaliste, shared memory + REST API combinés | https://github.com/InFeRNoGC/LMU_Simple_Overlay_Releases |

---

> **Priorisation par catégorie** : T1+T6 🔴 fondations → T7+T8+T14 🔴 différenciation → T9+T10+T13 🟡 valeur ajoutée → T3+T4+T5 🟡 qualité → T11+T12+T15+T16 🟢 niche.

---

## 8. Journal de bord

> Format : `### YYYY-MM-DD — Titre` puis ✅ fait / ⏳ en attente / ❌ bloqué / 📋 prochaine étape.

### 2026-06-10 — Live : débrief de secteur perdu au tour bouclé (P1 de l'audit)

- 🔍 **Constat** : `useVoiceCallouts` était déjà très complet (PB/tour bouclé, secteur amélioré, violet, delta prédictif, écarts, pluie, mécanique, carburant 3/2/1…) — la P1 « alertes edge-triggered » était en réalité quasi couverte. Le vrai manque : l'app disait *ce que vaut* le tour, jamais *où* il s'est perdu.
- ✅ **Nouvelle annonce `vSectorLost`** (« Tu laisses 0.4 dans le secteur 2 ») : au tour bouclé, compare `last_sectors` aux meilleurs secteurs perso (avant ce tour) et annonce **le pire secteur** (priorité chatty). Garde-fous : silencieux sur PB, seuil ≥ 0.3 s (bruit), plafond < 5 s (trafic/tête-à-queue), et **suspendu sur l'out-lap** (ref `debriefSkip` armée à l'arrêt effectué et à la sortie de voie des stands, consommée au tour suivant, reset au redémarrage de session).
- ✅ Enregistrée dans le **catalogue personnalisable** (`voiceMessages.ts`, groupe Secteurs, vars `s`/`d` + sample) + i18n FR/EN/ES/DE (`live.vSectorLost` + `vmWhen.vSectorLost`).
- ✅ `tsc --noEmit` + `npm run build` PASSENT.
- 📋 **Prochaine étape** : valider en piste (annonce sur un tour avec grosse perte secteur, silence sur PB et sur l'out-lap), ajuster le seuil 0.3 s si trop bavard. Puis : étendre `combo` (objectifs épinglés) au panneau télémétrie via mapping car_model ↔ unique_car_name.

### 2026-06-10 — Coach IA : objectifs structurés JSON (P3 de l'audit)

- ✅ **Sortie structurée de l'analyse complète** : le prompt « Analyse complète » (`postrace.ts`) demande désormais un bloc \`\`\`json final `{"objectives":[{title, metric, current, target}]}` (1-3 objectifs, valeurs dans la langue de la réponse, clés EN stables pour le parseur). Budget tokens 1000 → 1200.
- ✅ **Parsing + rendu en cartes** (`AICoachPanel.tsx`) : `splitObjectives()` sépare corps markdown / objectifs — bloc masqué même incomplet (streaming), JSON invalide ignoré sans casse ; nouveau composant `AssistantTurn` (corps + cartes `Target` avec `metric · current → target`).
- ✅ **Épinglage à l'objectif** : chaque carte a son bouton Pin → note compacte (`titre — métrique : actuel → cible`) persistée dans `coach_notes`, donc **vérifiable** à la session suivante (vs épingler 1500 caractères de prose). Le bouton « Garder comme objectif » global reste pour l'analyse rapide (sans JSON).
- ✅ **Garde-fou TTS** : `stripMarkdown` retire aussi un bloc \`\`\` non refermé — le JSON n'est jamais lu à voix haute pendant le stream (lecture auto phrase-par-phrase).
- ✅ i18n `coach.objectives` (FR/EN/ES/DE). `tsc --noEmit` + `npm run build` PASSENT.
- 📋 **Prochaine étape** : test réel du cycle P2+P3 (analyse complète → cartes d'objectifs → épingler → session suivante même combo → vérification par le coach). Ensuite : étendre `combo` au panneau télémétrie (mapping car_model ↔ unique_car_name), et P1 de l'audit (débrief de tour automatique déterministe + alertes edge-triggered).

### 2026-06-10 — Coach IA : mémoire longitudinale du pilote (P2 de l'audit)

- 🎯 **Le différenciateur** : le coach ne voit plus la session isolément, il connaît l'historique du pilote sur le combo et ses objectifs passés. Boucle fermée : conseil → épinglage → pratique → vérification automatique à la session suivante.
- ✅ **Historique du combo dans le contexte post-race** : nouveau `src/lib/ai/context/driver-history-context.ts` — réutilise `records::get_record_progression` (zéro nouveau code requête Rust). Injecte : PB de tous les temps + Δ du jour, nb de PB, dernières 10 sessions (date/type/best/S1-S2-S3, marqueurs PB et « this session »), et **faiblesse de secteur récurrente détectée en code** (écart moyen de chaque secteur au meilleur secteur du combo sur les sessions récentes). Section omise si le combo n'a qu'une session.
- ✅ **Objectifs épinglés persistés** : table SQLite `coach_notes` (combo = track + unique_car_name, 5 notes max/combo, élagage auto) + 3 commandes Rust dans `ai.rs` (`coach_note_add` / `coach_notes_for_combo` / `coach_note_delete`) + wrappers `ai.addNote/notesForCombo/deleteNote` dans `api.ts`.
- ✅ **UI `CoachPanel`** : nouvelle prop `combo` (fournie par le panneau post-race) ; bouton **« Garder comme objectif »** (épingle la dernière réponse, 1500 car. max) dans la modale ; liste des objectifs épinglés (date + extrait + suppression) sous le panneau ; injection automatique dans le contexte avec consigne « compare et signale progrès/régression sur chacun ». i18n FR/EN/ES/DE (`coach.pin/pinTip/notes/deleteNote`).
- ✅ `cargo check`, `tsc --noEmit`, `npm run build` PASSENT.
- 📋 **Prochaine étape** : tester le cycle complet sur données réelles (session A → épingler un objectif → ouvrir session B même combo → vérifier la section « Pinned coaching objectives » dans « Voir les données envoyées » et la vérification par le coach). Ensuite : étendre `combo` au panneau télémétrie (mapper car_model ↔ unique_car_name), et sortie JSON structurée des recommandations (P3).

### 2026-06-10 — Stratégie déterministe centralisée (`lib/strategy.ts`) + i18n erreurs coach

- ✅ **Nouveau module `src/lib/strategy.ts`** (suite de l'audit, P0 coach) : `computeStrategy()` → `StrategySnapshot` (conso L/tour, autonomie, tours restants de session, litres nécessaires/à ajouter) + `strategyToText()` (résumé EN pour le contexte IA). **Source unique de vérité** : remplace `computeFuelToFinish` (Live.tsx) et la logique inline divergente de `live-context.ts` (l'une faisait `+1` tour entamé au drapeau, l'autre non).
- ✅ **Live.tsx branché dessus** : alerte vocale « refuel », KV « Carb. pour finir » (`FuelToFinishKV` accepte le snapshot), header grand chrono — mêmes chiffres partout.
- ✅ **Contexte Coach IA live** : section « Fuel & strategy » réécrite — bloc `--- STRATEGY COMPUTER (trust these numbers...) ---` + verdict `FUEL SHORT — ADD X L` / marge ; message explicite « conso pas encore mesurée » avant 2 franchissements de ligne.
- ✅ **i18n des erreurs coach** : `friendlyError(e, t)` et `testConnection(..., t)` passent par 7 nouvelles clés `coach.err*` (FR/EN/ES/DE) — fini les messages français en dur affichés/lus à voix haute pour les utilisateurs EN/ES/DE. Appelants mis à jour (AICoachPanel, useCoachVoice, Config).
- ✅ **`askCoachVoice`** : consigne « 2 phrases max, style radio » désormais dans la langue du pilote (map `VOICE_STYLE` 4 langues, repli EN).
- ✅ Commentaires périmés du store corrigés (liste providers, clé « en clair » → chiffrée) ; fichier parasite `nul` supprimé de la racine.
- ✅ `tsc --noEmit` et `npm run build` PASSENT.
- 📋 **Prochaine étape** : valider en piste (conso après 2 passages de ligne → KV + alerte + verdict coach), puis P2 de l'audit : mémoire longitudinale du pilote (`driver-profile-context.ts` depuis SQLite + persistance des recommandations coach).

### 2026-06-10 — Audit Coach IA : 2 bugs corrigés (conso carburant + usure pneus contexte live)

- 🔍 **Audit complet du projet** (module IA, spotter, chaîne vocale, backend live) → 2 bugs réels trouvés.
- 🐛 **Conso carburant jamais calculée** (`live.rs`) : `fuel_at_lap_start` était réassigné **à chaque tick** de polling au lieu du franchissement de ligne. Au changement de tour, `used` ≈ conso d'un seul tick (~0,05 L) < filtre `> 0.5` → `lap_fuel_history` ne se remplissait jamais → `fuel_consumption` et `fuel_laps_remaining` à **0 en permanence**. Cassait en cascade : alerte vocale 3/2/1 tours, KV « tours restants », `computeFuelToFinish` (alerte refuel), intention spotter « carburant », et le verdict déterministe `FUEL SHORT` du contexte Coach IA live. ✅ **Fix** : référence posée uniquement au franchissement de ligne (1er passage arme la mesure, les suivants livrent un tour complet) ; tour avec passage aux stands ignoré ; reset de `fuel_at_lap_start` + `lap_fuel_history` au changement de session (bloc `track_key`).
- 🐛 **Usure pneus aberrante dans le contexte Coach IA live** (`live-context.ts`) : la formule V1 `(1 - wear) * 100` était appliquée à une valeur **déjà convertie en %** côté Rust → le coach recevait p.ex. `Tyre wear used: FL -7900%`. ✅ **Fix** : valeur brute utilisée, libellé `Tyre rubber remaining` aligné sur la sémantique « % gomme restante » du reste de l'app.
- ✅ `cargo check` et `tsc --noEmit` PASSENT.
- ⚠️ **Points relevés non corrigés** (audit) : instruction FR en dur dans `askCoachVoice` (coach.ts:121) et messages `friendlyError` non i18n (lus à voix haute) ; 2 estimations « tours restants » divergentes (live-context vs computeFuelToFinish) → à centraliser dans un futur `strategy.ts` ; bouton Stop du coach n'annule pas le flux côté Rust (tokens facturés) ; ambiguïté sémantique `wear` (commentaire Rust « % restante » vs formule V1 « % consommée ») à valider en jeu ; fichier parasite `nul` à la racine.
- 📋 **Prochaine étape** : valider en piste que `fuel_laps_remaining` s'alimente après 2 franchissements de ligne (alerte 3/2/1 tours + verdict FUEL SHORT du coach), puis créer `src/lib/strategy.ts` (StrategySnapshot unique : conso, autonomie, fenêtre pit, litres à ajouter) consommé par Live/overlay/spotter/coach.

### 2026-06-10 — Live : fix « usure pneus critique » parasite au lancement (debounce)

- 🐛 **Fausse alerte `vTyreWear` au démarrage d'une course** : l'alerte partait sur **une seule frame**. Au lancement, les pneus neufs (wear=100) arment `tyreSeenFresh` aussitôt, la grille/formation dépasse souvent les 6 s de `WARMUP_MS` (`warmedUp=true`), et une **frame de télémétrie corrompue** (`m_wear` ≈ 1.0 transitoire sur une roue) faisait tomber `minWear` dans (0, 20) → annonce. Intermittent (« parfois ») car dépend de tomber sur une frame parasite.
- ✅ **Fix `useVoiceCallouts` (`Live.tsx`)** : l'usure utilise désormais le même debounce temporel que la surchauffe (`sustainedAlert`) — l'usure doit rester `< 20 %` pendant **≥ 4 s** avant l'annonce. Une frame isolée ne s'accumule jamais 4 s. Nouvelle ref `tyreLow` (reset au changement de session). `tyreWarned` interdit toujours la répétition jusqu'au prochain relais.
- ✅ Build OK (`tsc -b`).
- 📋 **Prochaine étape** : valider en piste que la vraie alerte d'usure de fin de relais part toujours (~après 4 s sous 20 %) et qu'aucune fausse alerte n'apparaît plus au départ.

### 2026-06-09 — Overlays : 16 overlays + interrupteur global + opacité + profils + anti-freeze

- 🐛 **Freeze critique corrigé** : la fenêtre overlay plein écran capturait toute la
  souris (figeait l'écran). Causes & fixes :
  1. `set_ignore_cursor_events(true)` appelé AVANT `show()`/`resize` → réarmé par
     Windows à l'affichage. **Fix** : appliqué en **dernier** (après show).
  2. Pas de filet si l'application initiale ne « prend » pas. **Fix** : nouvelle
     commande `set_overlay_clickthrough` rappelée par `OverlayApp` **au montage**
     (webview prêt).
  3. Piège du mode édition (fenêtre plein écran capture tout → on ne peut plus
     cliquer pour sortir). **Fix** : bouton **« Terminer l'édition »** rendu SUR
     l'overlay (toujours cliquable).
- ✅ **Interrupteur global** (`masterEnabled`) : bouton « Affichés / Masqués » qui
  **ferme/rouvre** la fenêtre overlay sans toucher à l'état `enabled` ni aux positions
  (= aussi coupe-circuit anti-freeze).
- ✅ **Opacité générale** (`globalOpacity`) : slider, multipliée à l'opacité de chaque
  overlay (`OverlayFrame`).
- ✅ **Profils** : `saveProfile`/`loadProfile`/`deleteProfile` (snapshot overlays +
  highFps + opacité), dropdown + nom + enregistrer/supprimer dans la page.
- ✅ **+7 overlays** (total **16**) : Dashboard, Rival, Session, Endurance, Damage,
  Speed, Lift & Coast — registre + widgets + i18n FR/EN/ES/DE.
- ✅ `tsc -b`, `cargo build` et `npm run build` PASSENT. Vérifié à l'écran (grille 16,
  contrôles globaux, panneaux + mode édition OK).
- 📋 Prochaine étape : valider les valeurs live des 7 nouveaux widgets avec LMU lancé
  (notamment Damage/impact, Speed min/max, Lift&Coast TC/ABS) et ajuster les seuils.

### 2026-06-09 — Overlays in-game façon « Trace HUB » (itération 1)

- 🎯 Demande utilisateur : ajouter des overlays activables/configurables, déplaçables
  en live par-dessus le jeu (mode Édition), aussi soignés que l'app Trace HUB.
- 🔒 Décisions (validées) : **une seule fenêtre transparente** plein écran (pas une
  fenêtre par overlay) ; périmètre = framework + **9 overlays** (Telemetry, Standings,
  Relative, Fuel, Tyres, Delta, Weather, Flags, Track Map).
- ✅ **Backend** (`commands/overlay.rs`) : `open_overlay_window` (fenêtre `overlay`
  transparente, decorations off, always-on-top, skip-taskbar, dimensionnée sur le
  moniteur principal, `set_ignore_cursor_events(true)`), `close_overlay_window`,
  `set_overlay_edit_mode` (toggle click-through + émet `overlay-edit-mode`),
  `is_overlay_open`. Enregistrées dans `lib.rs`. Capability `capabilities/overlay.json`
  (`windows:["overlay"]`, `core:default`). Toute la manip fenêtre est côté Rust → la
  fenêtre `main` n'a pas besoin de droits JS supplémentaires.
- ✅ **Front** :
  - `lib/overlays.ts` (registre : id, icône, accent, position défaut, éléments) — source
    unique pour la grille **et** le rendu.
  - `stores/overlays.ts` (Zustand) : config persistée en SQLite `overlays_config`,
    synchro inter-fenêtres par event `overlays-config` (anti-écho via `SRC`), persistance
    débouncée.
  - `main.tsx` : branche sur `getCurrentWindow().label` → la fenêtre `overlay` rend
    `OverlayApp` (fond transparent, ni Header/Footer/router).
  - `components/overlay/` : `OverlayRoot` (abonnement `live-data` + lissage **High FPS**
    via rAF dans `useOverlayData`), `OverlayFrame` (drag au pointeur + chrome d'édition
    − 1.0x + ⚙), `ui.tsx` (Panel/HBar/VBar/Stat), `format.ts` (reprend `computeFuelToFinish`,
    `liveClassColor` de `Live.tsx` — parité V1), `widgets/` (9 widgets).
  - `routes/Overlays.tsx` (route `/overlays` + lien Header) : grille de cartes + panneau
    de config à onglets **Content / Appearance / Position**, boutons **High FPS** /
    **Edit Mode**, indicateur **Saved**. Ouvre/ferme la fenêtre overlay selon l'activité.
  - i18n `overlays.*` (FR/EN/ES/DE) + `nav.overlays`.
- ✅ `tsc -b` et `cargo check` PASSENT.
- 🐛 **3 bugs corrigés après test live** (la fenêtre overlay ne s'affichait pas) :
  1. **Deadlock thread principal (cause principale)** : les commandes `overlay::*`
     étaient `fn` **synchrones** → en Tauri 2 elles s'exécutent sur le thread
     principal (boucle d'événements), or elles appellent des opérations de fenêtre
     (`build`, `set_focus`, `set_ignore_cursor_events`…) qui ont besoin de cette même
     boucle → **deadlock**, gelant TOUT le backend (le `config.get` de la fenêtre
     overlay restait bloqué → `loaded` jamais vrai → rendu vide). **Fix** : commandes
     passées en **`async fn`** (tournent hors thread principal).
  2. **Fenêtre créée invisible** : `.visible(false)` + `.show()` depuis une commande
     ne met pas `WS_VISIBLE` sur Windows. **Fix** : construire la fenêtre directement
     visible (retrait de `.visible(false)`).
  3. **Auto-ouverture au démarrage** : créer la 2e webview pendant l'init du webview
     principal gelait WebView2. **Fix** : déplacée dans le montage de la page Overlays.
  + `flush()` (persistance immédiate avant ouverture) et `EMPTY_LIVE_DATA` (panneaux
    toujours visibles même sans LMU). **Vérifié visuellement** : panneau Telemetry +
    mode Édition (chrome « − 1.0x + ⚙ ») OK.
- ⚠️ Limite (comme Trace HUB) : jeu en plein écran *exclusif* peut masquer l'overlay →
  conseiller le mode **Borderless**.
- 📋 Prochaine étape : tester en réel avec LMU lancé (valeurs live + drag + persistance) ;
  ajuster l'esthétique fine des widgets ; envisager overlays supplémentaires (Dashboard,
  Rival, Session, Endurance, Damage, Speed, Lift & Coast) en itération 2.

### 2026-06-09 — Config : dossiers Résultats & Télémétrie modifiables

- 🎯 Demande utilisateur : certains joueurs relocalisent les dossiers Résultats et
  Télémétrie hors de l'installation LMU. Afficher les chemins détectés et permettre
  leur modification, comme pour le dossier d'installation.
- ✅ **Backend** :
  - `config::DetectResult` gagne `telemetry_dir` (dérivé `UserData/Telemetry`),
    renvoyé par `detect_lmu` / `inspect_lmu`.
  - `indexer::run_setup` accepte deux surcharges optionnelles `results_dir` /
    `telemetry_dir` ; vides ⇒ dérivées de `lmu_path`. Les deux sont persistées en
    config (`results_dir` existait déjà, `telemetry_dir` est nouveau).
  - `telemetry::telemetry_dir()` lit désormais la clé config `telemetry_dir` en
    priorité, repli sur la dérivation `lmu_path`.
- ✅ **Front** :
  - `api.ts` : `DetectResult.telemetry_dir` + `indexer.runSetup(lmuPath, player,
    resultsDir?, telemetryDir?)`.
  - `stores/app.ts` : nouvel état `telemetryDir`, chargé depuis la config ;
    `runSetup` propage les surcharges et relit les chemins effectifs après coup.
  - `routes/Config.tsx` : carte « Joueur & dossiers » (titre au pluriel) avec deux
    nouveaux champs éditables (Résultats, Télémétrie) + sélecteurs de dossier ;
    `handleDetect` / `handlePickFolder` repeuplent ces champs ; `confirmSave` passe
    les surcharges.
  - i18n (fr/en/es/de) : `resultsPathDesc`, `telemetryPath(/Desc)`,
    `selectResultsFolder`, `selectTelemetryFolder`, `playerAndDir(/Desc)` ajustés.
    Réutilisation des clés pré-existantes `resultsPath` / `autoDetected` (libellé FR
    passé à « Détecté automatiquement ») — doublons d'un design abandonné supprimés.
  - Indicateur « Détecté automatiquement » (✓ vert) sur **les 4 champs** (Joueur,
    Installation, Résultats, Télémétrie). Logique par instantané (`detected`) :
    le badge s'affiche tant que le champ correspond à la config établie / dernière
    auto-détection (chemins normalisés slashs/casse) et disparaît dès modification
    manuelle. La détection / le choix de dossier mettent l'instantané à jour.
  - Bouton « Détecter automatiquement » déplacé **en bas** de la carte (barre
    d'action, à gauche du bouton Enregistrer) ; retiré d'à côté du champ Installation.
- ✅ `tsc --noEmit` et `cargo check` PASSENT.
- ⚠️ Dette repérée : clés i18n mortes `gamePaths`, `gamePathsDesc`, `lmuPathHint`,
  `resultsHint`, `setupsPath`, `setupsHint` (design config abandonné) — non
  utilisées, à nettoyer un jour dans les 4 langues.
- 📋 Prochaine étape : tester en `npm run tauri:dev` avec un dossier Résultats
  déplacé (réindexation OK) et vérifier que la page Télémétrie lit bien le dossier
  surchargé.

### 2026-06-09 — Config : réorganisation des cartes (Préférences / Audio-Voix)

- 🎯 Demande utilisateur : déplacer les bascules **Indexation automatique**, **Icône
  system tray**, **Mises à jour auto** et **Niveaux de rythme ohne_speed** dans la carte
  « Apparence & langue », renommée **« Préférences »** ; et renommer l'ancienne carte
  « Préférences » (annonces vocales + spotter) en **« Audio / Voix »**.
- ✅ `src/routes/Config.tsx` : 4 `ToggleRow` déplacées sous le fuseau horaire dans la
  carte 1 (icône d'en-tête `Palette` → `Settings2`, import `Palette` retiré). Carte 2
  passe à l'icône `Volume2` et ne contient plus que annonces vocales + spotter.
- ✅ i18n (fr/en/es/de) : clés `appearance`/`appearanceDesc` remplacées par
  `audioVoice`/`audioVoiceDesc` ; `preferencesDesc` élargie (thème, langue, fuseau,
  comportement). `tsc --noEmit` PASSE.
- 📋 Prochaine étape : valider visuellement en `npm run tauri:dev` (rendu des deux
  cartes, ordre des bascules) puis poursuivre les ajustements UI éventuels.

### 2026-06-09 — Profil : bloc Activité (heatmap) + Régularité

- 🎯 Demande utilisateur : ajouter sur la page Profil une heatmap d'activité (façon
  GitHub, courses/jour) et un panneau « Régularité » (séries, taux de jours actifs,
  jour le plus chargé, plus longue période sans course).
- ❌ **SR/DR History abandonné** : la maquette vient de **mylmu.app**. Vérifié en
  inspectant les vrais XML (`D:\...\UserData\Log\Results\*R1.xml`) — **aucune balise
  SR/DR/Safety/Discipline/Rating** (seules `<LapRankIncludingDiscos>` / `<ServerScored>`
  existent). mylmu lit les mêmes XML mais les **upload sur son serveur** et y calcule une
  **métrique maison** : il nomme d'ailleurs ses courbes « Skill Rating (SR) » /
  « Discipline Rating (DR) » alors que le jeu parle de « Driver Rating » / « Safety
  Rating ». Donc valeur **non lisible localement**. **Décision utilisateur : abandonner**
  (confirmée 2 fois). Piste future possible : recalcul local maison (Elo sur positions +
  score propreté via pénalités/incidents de `stream_events`) — chiffres qui ne
  correspondraient pas à mylmu.
- ✅ Backend : nouvelle commande `get_race_activity` (`commands/queries.rs`) → liste
  légère `{ timestamp, online }` des courses du joueur (`is_player=1`,
  `session_type='Race'`), `online = setting='Multiplayer'`. Enregistrée dans `lib.rs`.
- ✅ Front : `src/components/ProfileActivity.tsx` — calcule heatmap (365 j glissants,
  colonnes hebdo lundi→dimanche) + stats régularité (série actuelle/meilleure, taux
  jours actifs, moy. courses/jour actif, jour le plus chargé, plus longue période sans
  course) à partir des **courses en ligne uniquement**. Branché dans `Profile.tsx`
  (sous le hero, via `queries.getRaceActivity()`).
- ✅ i18n : clés `profile.*` (activityTitle, racesAcrossDays, regularity*, currentStreak,
  bestStreak, activeDayRate(+Hint), avgRacesPerActiveDay, busiestDay(+Value), longestGap,
  heatmap*) ajoutées dans FR/EN/ES/DE.
- ✅ Vérifs : `tsc -b`, ESLint, `cargo check` OK.
- 📋 Prochaine étape : smoke-test visuel `npm run tauri:dev` sur les XML réels (vérifier
  les chiffres heatmap/régularité vs Sessions). Décider plus tard du sort du SR/DR.

### 2026-06-08 — Fix : repère rouge incompréhensible sur la jauge accél./frein

- 🐛 La jauge (`Gauge`) affichait un **repère de régime** = ligne **rouge** balayant tout
  l'arc selon les RPM → confondu avec le frein (même couleur) et superposé à l'arc accél.
- ✅ **Supprimé** (le régime est déjà affiché en chiffres au centre). Variables/prop
  `maxRpm`/`rpmFrac` retirées (Gauge + appel). tsc + ESLint + build OK.

### 2026-06-08 — Fix : scintillement des données en lecture

- 🐛 Le graphe de **delta** (comparaison) recevait `series` en **tableau inline** (recréé
  à chaque rendu) → en lecture (60 fps) l'effet d'init uPlot (dép. `series`) reconstruisait
  le graphe à chaque frame → scintillement.
- ✅ `deltaSeries` **mémoïsé** (deps `[compare, t]`). Les autres graphes étaient déjà
  stables. tsc + ESLint + build OK.
- 📋 Si scintillement résiduel **hors comparaison** : suspecter les transitions CSS
  (`Gauge` `transition: all 0.05s`, `TyreCard` `stroke-dasharray 0.1s`) qui redémarrent
  à 60 fps → à cibler/spécifier.

> 💡 **Idée — refonte télémétrie « panneaux drag & drop » (inspiration mylmu.app)** :
> l'utilisateur a montré MyLMU : panneaux **déplaçables / fermables**, très colorés, sur
> **tous** les canaux dispo (Tyre Data, Brakes, Suspension Travel, Engine Temps, Driver
> Smoothness, Traction Circle, Fuel, Session Laps, Weather…), barre d'onglets latérale
> pour ouvrir/fermer chaque panneau. **Gros chantier UI** (système de fenêtres flottantes
> + persistance des positions) — à planifier séparément.

### 2026-06-08 — Analyse : phase dominante de perte affichée (freinage/milieu/sortie)

- ✅ Exploitation UI de `phaseLoss` (décomposition du temps perdu par phase, ajoutée à
  `analysis.ts`) : chaque **focus zone** de la carte « Analyse » affiche un chip
  **freinage / milieu / sortie** = là où l'on perd le plus dans le virage.
- Helper `dominantPhaseKey()` + 3 clés i18n `telemetry.phase_*` ×4 langues. (Le call
  `analyzeLap` passait déjà brake/throttle → `phaseLoss` calculé ; n'était utilisé que par
  le coach.) tsc + ESLint + build OK.

### 2026-06-08 — Fix : pic d'élévation au départ (flèche/relief 3D)

- 🐛 La flèche 3D (et la ligne) montaient sur un **pic** au départ : l'anti‑pic d'élévation
  ne corrigeait que les **creux** et **sautait les extrémités** → un pic vers le haut à la
  ligne d'arrivée n'était jamais filtré (et le lissage le recopiait dans ses bords).
- ✅ **Filtre médian** (fenêtre 7) appliqué avant le lissage dans `computeElevation` →
  supprime les pics isolés haut/bas, extrémités incluses. tsc + ESLint + build OK.
  (Si un pic plus large subsiste, augmenter `r`.)

### 2026-06-08 — Ajustements : flèche 3D + zoom en mode suivi

- ✅ **Flèche 3D** trop grosse → `arrowScale` `size*0.0024`→`0.0016`, abaissée (`*0.01`).
- ✅ **Zoom molette en mode « Suivre »** : nouvel état `followZoom` (**1×**–12×) ajustable à
  la molette (avant : zoom fixe 3.5× et molette ignorée en suivi). À 1× on revoit tout le
  circuit (100%) ; la caméra est **bornée au tracé** (pas de débordement dans le vide).
  Le pan reste désactivé en suivi (caméra auto‑centrée). tsc + ESLint + build OK.

### 2026-06-08 — Fix : fond de la carte 3D (thème)

- 🐛 La carte 3D forçait une couleur de fond (`<color attach="background">`) → gris/blanc
  incohérent avec le thème.
- ✅ Canvas rendu **transparent** (`gl alpha` + `background: transparent`, suppression du
  `<color>`) → hérite du fond thématisé de la carte, comme la 2D. tsc + ESLint + build OK.

### 2026-06-08 — Lisibilité des marqueurs voiture (2D + 3D)

- ✅ **Point 2D** (`TrackMap`) : halo doré (opacité 0.28) + point plus gros (r 8→11,
  contour 2.5→3.5) → repérable même en thème clair.
- ✅ **Flèche 3D** (`Track3D`) : agrandie (scale `size*0.0013`→`0.0024`), montée plus haut
  au‑dessus du tracé, + **contour contrasté** (2e flèche ×1.35 derrière, blanche en
  thème sombre / noire en clair). tsc + ESLint + build OK. ⚠️ à confirmer en desktop.

### 2026-06-08 — Fix : tout le dashboard suit le point jaune (scrub unifié)

- 🐛 **Cause** : marqueur carte + ligne de curseur des graphes suivaient `dispIdx`
  (survol), mais **toutes les lectures de valeurs** (jauge, pneus, électronique, forces,
  carburant, en‑têtes graphes, voiture 3D, libellés temps/distance) restaient sur l'index
  de **lecture `i`** → bouger le point jaune ne mettait pas à jour les chiffres/curseurs.
- ✅ **Fix** : lectures unifiées sur `dispIdx` (`at()`, les 4 `TyreCard`, `carIndex` 3D,
  `curTime`/`curDist`, **+ la timeline** `value={dispIdx}`). → survol carte/graphe = scrub
  de tout l'écran ensemble (carte 2D/3D, graphes, dashboard, timeline) ; sans survol,
  reflète la lecture. Glisser la timeline réinitialise le survol. tsc + ESLint + build OK.

### 2026-06-08 — Fix : mode « Suivre » perturbé par le survol lié

- 🐛 **Cause** : en mode suivi, le survol de la carte appelait `onHoverPoint` → l'index
  affiché (`dispIdx`) devenait celui du curseur → la caméra se recentrait sur le curseur
  au lieu de suivre la voiture en lecture. Un `hoverIdx` figé pouvait aussi bloquer le suivi.
- ✅ **Fix** : `hoverable` désactivé quand `follow` (la carte ne capte plus le survol en
  suivi → elle suit la tête de lecture). Le toggle « Suivre » réinitialise `hoverIdx`.
  tsc + ESLint + build OK. ⚠️ à confirmer en desktop.

### 2026-06-08 — Carte 2D : zoom molette + pan (TrackMap)

- 🐛 **Manque** : depuis le passage en SVG, la carte 2D n'avait **aucun zoom libre**
  (seul le mode « Suivre » zoomait).
- ✅ **Zoom/pan manuel** ajouté à `TrackMap` (hors `plain`/`follow`) :
  - **Molette** = zoom **ancré sous le curseur** (max 12×) ; au plein cadre → reset auto.
  - **Glisser** = pan (matrice inverse figée au pointer‑down → translation stable ;
    `setPointerCapture`).
  - **Double‑clic** = réinitialise le zoom. État `manualVB` (viewBox), réinitialisé au
    changement de fichier/tour.
  - Listener `wheel` attaché **non‑passif** via ref de callback (React met `onWheel` en
    passif → `preventDefault` impossible autrement) → pas de scroll de page au zoom.
    `touch-action: none` sur la carte zoomable.
  - Coexiste avec le survol lié (`onHoverPoint`) : pendant un pan, le survol est suspendu.
- ✅ tsc + ESLint + build OK. ⚠️ Interaction (molette/glisser) à confirmer en desktop ;
  le rendu zoomé réutilise le mécanisme `viewBox` déjà validé (follow‑cam).

### 2026-06-08 — Fix : tremblement de la flèche voiture en 3D (Track3D)

- 🐛 **Cause** : l'orientation (`heading`) de la flèche était calculée sur **1 seul
  échantillon d'écart** (`carPoints[ci]` → `[ci+1]`). À ~4000 points/tour (~1 m entre
  points), l'angle était dominé par le bruit GPS → la flèche **tremblait/pivotait** sans
  cesse, et partait n'importe où à basse vitesse.
- ✅ **Fix** : cap calculé sur une **fenêtre** autour de la voiture (±4, élargie par pas
  de 4 jusqu'à ce que l'écart dépasse `size×1%`, max ±60) → direction stable, gère aussi
  la voiture lente/à l'arrêt. tsc + ESLint + build OK.
- ⚠️ À confirmer visuellement dans l'app desktop (vue 3D, en lecture).

### 2026-06-08 — Dette : éclatement de TelemetryView (tranche 1)

- ✅ **Extraction sûre** (déplacements purs, comportement inchangé) :
  - `src/lib/telemetry/format.ts` : helpers de formatage (`gearLabel`, `fmtLap`,
    `fmtNum`, `divK`).
  - `src/components/telemetry/viewParts.tsx` : sous‑composants présentationnels
    (`LapRow`, `DashCard`, `Stat`, `InfoRow`, `Elec`).
  - Séparation fonctions/composants pour rester à **0 warning** (règle react‑refresh).
- ✅ `TelemetryView.tsx` : ~1163 → **1051 lignes**. tsc + ESLint (0/0) + build OK.
- 📋 **Reste (T1 #2)** : éclater le **corps du composant** (3 colonnes ~900 lignes) en
  sous‑composants par colonne/onglet — **différé après validation desktop** (éviter de
  refactorer à l'aveugle du code non encore exécuté en réel). Idem `Live.tsx` (~2300 l.).

### 2026-06-08 — Config : 3 cartes par ligne

- ✅ Grille de la page Config passée de `lg:grid-cols-2` à
  `md:grid-cols-2 lg:grid-cols-3`. Le sous‑bloc qui empilait Maintenance + À propos
  (équilibrage 2 colonnes) **aplati** → 6 cartes = 2 lignes de 3. tsc + ESLint + build OK.
- ✅ **Pleine largeur + responsive** : retrait du `max-w-5xl` du conteneur racine de Config
  → la page remplit la largeur standard de l'app (cadre global `max-w-[1800px]` d'`App.tsx`,
  commun aux autres pages) au lieu d'être bridée à ~1024px. Grille responsive 1/2/3 colonnes.
- ⚠️ Rendu non vérifiable en mode web (la page reste sur le gate de chargement faute de
  backend Tauri) → à confirmer dans l'app desktop.

### 2026-06-08 — Analyse : assistée (#90), focus zones (#92), theoretical best (#101), race pace IQR (#102)

- ✅ **#90 Analyse assistée + #92 Focus zones** (`src/lib/telemetry/analysis.ts`,
  `analyzeLap`) :
  - **Temps perdu/gagné par virage** = variation du **delta de temps cumulé** (réaligné
    par distance, déjà calculé pour la comparaison) sur le segment du virage
    (freinage → freinage suivant). Coloré vert/rouge.
  - **Écart de vitesse à l'apex** vs réf (km/h). **Point le plus lent** du tour (clic = saut).
  - **Focus zones (#92)** : top‑3 virages par perte de temps, **surlignés 🔥** + **perte
    totale virages**. Nécessite une **référence** choisie (sinon indicateurs absolus seuls).
  - UI : la carte « Virages » de `TelemetryView` devient « **Analyse** » (clic virage =
    saut au point de freinage, comme avant). 6 clés i18n ×4 langues.
- ✅ **#101 Theoretical best détaillé** (`SessionDetail`/`playerPerf`) : best des secteurs
  S1/S2/S3 du joueur (min sur tours valides) → **best théorique** (somme) + **gain
  potentiel** vs meilleur tour réel. Ligne détaillée sous le bandeau Perf.
- ✅ **#102 Race pace IQR** : moyenne des tours de course **hors aberrants** (filtre IQR
  1.5× sur Q1/Q3) → métrique « Rythme course » (affichée pour les courses, ≥ 4 tours).
- ℹ️ **#103 Consistency Score** : constaté **déjà implémenté** (`playerPerf.consistency`).
- ✅ tsc + ESLint + `vite build` OK. 3 clés i18n `SessionDetail` ×4 langues.
- ⚠️ Non vérifiable au harnais synthétique (données réelles requises) → à valider dans
  l'app desktop sur une vraie session (+ une référence pour #90/#92).
- ❌ **Perte par virage vs ohne_speed/alien — impossible** (confirmé 2026-06-08) :
  `ohne_speed` ne fournit que des **temps agrégés** (hotlap + race pace par tier), **sans
  secteurs ni trace résolue en distance**. On ne peut donc obtenir qu'**un delta global**
  sur le temps au tour (déjà fait via `computeTier`), pas une décomposition par virage.
  La seule source valable pour une perte par virage = un **tour de référence télémétrie**
  (autre `.duckdb`), ce que #90/#92 utilisent déjà.
- ✅ **Focus zones sur la carte** (2026-06-08) : `TrackMap` `corners` accepte un flag
  `focus` → badges des focus zones en **rouge** (plus grands/gras) au lieu du style neutre.
  `TelemetryView` passe `focusRank != null` depuis `analysis.corners`. tsc + ESLint + build OK.
  (Export CSV/XLSX #104 **non retenu** — décision utilisateur.)

### 2026-06-08 — Télémétrie : curseur lié carte↔graphes (#94 terminé)

- ✅ **Survol bidirectionnel** : un état unique `hoverIdx` dans `TelemetryView`
  (`dispIdx = hoverIdx ?? i`) pilote **à la fois** le marqueur de la carte et le curseur
  de tous les graphes. Le survol (graphe **ou** carte) prime sur la tête de lecture ;
  sortie → retour à la lecture. Réinitialisé au changement de fichier/tour.
- ✅ **Graphe → carte** (`TelemetryChart`) : nouveau callback `onHoverIdx`. Émis
  **uniquement sur survol réel** — détection via `mouseenter`/`mouseleave` sur `u.over`
  (`pointerInsideRef`) + garde `settingCursorRef` autour du `setCursor` programmatique
  → pas de confusion avec le curseur piloté/synchronisé (sync uPlot inter-graphes intacte).
- ✅ **Carte → graphe** (`TrackMap`) : nouveau callback `onHoverPoint`. `onPointerMove`
  convertit les coords écran → unités `viewBox` (`getScreenCTM().inverse()` + `DOMPoint`),
  recherche le point le plus proche (seuil de distance → ignore les zones vides),
  curseur `crosshair`. Espaces d'index identiques (carte et graphes = longueur `n`).
- ✅ tsc + ESLint + `vite build` OK. ⚠️ Non vérifiable au harnais synthétique (interaction
  souris réelle requise) → à valider dans l'app desktop sur une vraie session.

### 2026-06-08 — Télémétrie : numéros de virages sur la carte SVG

- ✅ **Numéros de virages (T1, T2…) sur la carte** : nouvelle prop `corners` de
  `TrackMap` (`{ index, label }[]`). Badge rond (cercle + texte) placé à l'**apex**,
  **décalé vers l'extérieur du circuit** (perpendiculaire au tracé, côté opposé au
  centroïde) → ne chevauche pas le ruban. Affiché hors `plain`/`follow`.
- ✅ Branché dans `TelemetryView` : réutilise la **segmentation virages déjà calculée**
  (`corners` = apex + n°) → aucun nouveau calcul. Les marqueurs de freinage (points
  rouges) sont conservés en parallèle (point de freinage + apex distincts).
- ❌ **Lignes de secteurs sur la carte — écartées** : la télémétrie ne donne que les
  **durées** S1/S2/S3, pas les **distances** de coupure de secteur → les tracer
  reviendrait à inventer des positions (interdit par la règle « pas de données simulées »).
- ✅ Vérif visuelle (harnais HTML + apex synthétiques, dark/light) → placement propre,
  badges lisibles hors piste. tsc + ESLint OK. Harnais supprimé.

### 2026-06-08 — Télémétrie : carte circuit SVG haute fidélité (#95)

- 🔎 **Veille GitHub** (demande utilisateur « le plus pro et propre ») : **TinyPedal**
  (open‑source, déjà LMU/rF2) = référence — il stocke ses cartes en `.svg`, dessine un
  **ruban à deux passes** (tracé épais = bordure, puis tracé fin coloré par‑dessus),
  repères départ/secteurs **perpendiculaires** (`line_intersect_coords`), et **ne lisse
  pas** (skip de nœuds + polylignes). **LMU Trace** = même rendu SVG depuis vraies données.
  → Conclusion : les courbes douces des outils pro viennent du **rendu vectoriel**, pas
  de données en plus.
- ✅ **`TrackMap.tsx` réécrit Canvas → SVG** (drop‑in, **props identiques** → aucun
  changement d'appel dans le lecteur `TelemetryView`) :
  - **Lissage Catmull‑Rom → Bézier cubique** (`smoothPath`) sur les nœuds GPS
    sous‑échantillonnés (≈520, façon `skip_node` TinyPedal) → tracé continu sans cassure.
  - **Ruban** : 1 passe bordure (`outlineW`) + surface **colorée accél./frein/roue libre**
    par segments (heatmap conservée), ou monochrome en `plain` (mini‑carte).
  - **Repère départ/arrivée** perpendiculaire au tracé ; point de départ ; marqueurs de
    freinage ; marqueur de position doré.
  - **viewBox** : plein circuit ou fenêtre zoomée (follow‑cam). Net à tout zoom, exportable.
  - **Perf** : projection + chemins lissés **mémoïsés** ; seuls la `viewBox` et le
    marqueur bougent à 60 fps. `ResizeObserver` supprimé (le SVG gère le redimensionnement).
- ✅ **Vérif visuelle** via harnais HTML autonome + circuit synthétique (Preview) :
  dark/light, heatmap, follow‑cam, mini‑carte → rendu net et propre confirmé. Harnais supprimé.
- ✅ tsc + ESLint + `vite build` OK. #95 ✅ ; #94 follow‑cam déjà fait.
- 📋 **Pistes suivantes** : numéros de virages + lignes de secteurs sur la carte SVG
  (réutiliser la segmentation virages déjà calculée), curseur carte↔graphes lié (#94 reste).

### 2026-06-08 — Télémétrie : carte 3D (#7) — finalement faite (élévation reconstruite)

- 🔄 **Décision #6/#7 révisée** : la 3D **est faisable**. Le Lab n'a pas non plus
  `WorldPosZ` dans les fichiers — il **reconstruit l'altitude** depuis une base de
  profils de référence par circuit + la distance au tour. On a fait pareil.
- ✅ **Base d'élévation portée** : `src/lib/trackElevation.json` (extrait de
  `track_db.py` du Lab — 14 circuits + tracés, ~414 points dist→alt, **7 Ko**).
- ✅ **Algo `compute_z` porté** : `src/lib/elevation.ts` (matching circuit normalisé
  + interpolation distance→altitude + correction de boucle + lissage + anti-pic).
- ✅ **Rendu 3D** : `src/components/telemetry/Track3D.tsx` (react-three-fiber + drei,
  version **lean**) — tracé 3D coloré accél./frein/roue libre, relief, voiture animée,
  caméra orbitale. **Bascule 2D/3D** dans l'en-tête de la carte.
- ✅ **Optimisation bundle** : Track3D **lazy-loadé** (`React.lazy`) → Three.js dans
  un **chunk séparé** (918 Ko / 248 Ko gz) chargé **uniquement** si on active la 3D ;
  le bundle principal n'est pas alourdi. Deps : three + @react-three/fiber + drei.
- ✅ Build OK (chunk `Track3D` séparé) · mon code lint-clean (2 warnings restants =
  travail AI Coach en parallèle, hors périmètre).
- 📋 Relief flat-tracks (Paul Ricard ~12 m) → exagération verticale ×4 par défaut ;
  un curseur Z-scale pourrait être ajouté.

### 2026-06-08 — Télémétrie : jauge throttle/brake + follow-cam + mini-carte (#5 terminé)

- ✅ **Jauge — accélérateur/frein bien visibles** : labels colorés **THR x%** (cyan)
  et **BRK x%** (rouge) en plus des remplissages d'arc.
- ✅ **#5 follow-cam** : bouton « Suivre » → la carte 2D **zoome et recentre sur la
  voiture** (`TrackMap follow`). Marqueurs de freinage masqués en mode suivi.
- ✅ **#5 mini-carte** : aperçu plein-circuit monochrome (`TrackMap plain`) en
  surimpression coin haut-droit quand le suivi est actif, avec la position courante.
  → **#5 terminé**. Build + ESLint OK.

### 2026-06-08 — Télémétrie : jauge en arc (#1) + LAP DETAILS secteurs (#2) + virages affinés (#5)

- ✅ **#1 Jauge en arc** (`Gauge.tsx`, SVG pur) — refondue façon LMU Telemetry Lab
  pour la lisibilité : **accélérateur sur l'arc gauche (cyan), frein sur l'arc droit
  (rouge)**, petit repère de régime, et texte **centré hiérarchisé** (SPEED · vitesse ·
  KM/H · RPM · GEAR). Plus d'aiguille traversante. Les barres accél./frein séparées
  retirées (redondantes avec l'arc). `Engine Max RPM` ajouté à VIEW_CHANNELS.
- ✅ **#2 LAP DETAILS par secteur** : tableau **Tour · Réf · Δ** pour Lap + S1/S2/S3.
  Temps au tour = durée du segment (fiable) ; secteurs depuis `Current/Last Sector1/2`
  (S3 dérivé = lap − S1 − S2) ; delta coloré vert/rouge ; réf = tour de comparaison.
  (Vides sur session sans tour bouclé.)
- ✅ **#5 Segmentation virages affinée** : détection par **minima de vitesse** (lissage
  + proéminence) au lieu des seules zones de freinage → capte aussi les virages en
  levée de pied ; point de freinage = début d'appui frein avant l'apex (sinon max de
  vitesse précédent).
- ❓ **#6 carte 3D — confirmé déconseillé** : nos `.duckdb` n'ont **pas** de canal
  d'altitude (`WorldPosZ` absent, utilisé par le Lab pour son relief) + Three.js lourd.
- 📋 **Reste de #5** : follow-cam (carte qui suit la voiture) + mini-carte. Build OK.

### 2026-06-08 — Télémétrie : retrait best lap + position du tableau (demande utilisateur)

- ✅ **Suppression complète** (affichage + logique) des colonnes **Meilleur tour** et
  **Arrivée** du tableau liste télémétrie. Front : colonnes/tri/cellules retirés
  (`Telemetry.tsx`), champs `best_lap`/`finish_position` retirés du type (`api.ts`).
  Backend (`telemetry.rs`) : champs retirés de `TelemetryFileInfo` + suppression des
  helpers de correspondance de session (`SessionCand`, `player_session_candidates`,
  `parse_recording_epoch`, `match_session`) et de leur usage dans `list_telemetry_files`.
  Le **car_model/logo** (matching `veh_name`) est **conservé**. Build front + `cargo
  check` OK.

### 2026-06-08 — AI Coach (#93) : audit de la spec + plan Phase 1 corrigé

- 📋 **Origine** : spec externe `C:\tmp\__DEV__\TEST_TROPHY\AI_COACH_*.md` (4 docs).
  Concept : coach IA « ingénieur de piste » en BYO-key (Anthropic/OpenAI/Google/
  DeepSeek/Mistral/Ollama), modes **post-race** (analyse) + **live** (temps réel).
- ✅ **Faisabilité confirmée** : données Live déjà riches (`api.ts` `LiveWheel`/
  `LiveTelemetry` : temps carcasse/interne/3pts, brake_temp, pressure, wear, tc/abs,
  damage, fuel_laps_remaining, météo), TTS à priorités déjà prêt (`voice.ts speak()`),
  télémétrie DuckDB partiellement lue. → fondations présentes.
- ⚠️ **Erreurs de la spec corrigées dans le plan** : (1) Anthropic = `system`
  **top-level**, pas un message `role:"system"` ; (2) CORS — la spec suppose `fetch`
  WebView OK partout (faux, Anthropic notamment) → **router tous les appels IA par
  Rust** (`reqwest`), ce qui supprime CORS *et* sort la clé de la WebView ; (3) « base
  DuckDB » → l'index est **SQLite** (DuckDB = seulement les fichiers télémétrie) ;
  (4) IDs modèles périmés → **`listModels()`** par fournisseur (endpoints `/models`,
  `/api/tags` Ollama) + filtre chat + cache + fallback statique. ⚠️ les **prix** ne
  sont dans aucun endpoint → `COST_MAP` manuelle par préfixe + fallback « inconnu ».
- ✅ **Objection « setup advice = devinette » levée** : le parser `.svm`
  (`setups.rs parse_svm`) est générique et capture **tout** le réglage mécanique/aéro
  en clé/valeur, liable à la session (`linked_session_id`). → on peut nourrir le coach
  avec le **vrai setup** au lieu de deviner.
- 🎯 **Décisions de cadrage** : Phase 1 = **post-race seul** (le live LLM est laggy,
  démoté en débrief inter-tours plus tard) ; **JSON circuits hand-écrits coupés**
  (le LLM connaît déjà les circuits ; on n'injecte que NOS données) ; setup commenté
  dans l'analyse complète (pas de module advisor séparé) ; clé API = obfuscation
  locale assumée, pas vraie sécurité.
- 📋 **Plan Phase 1 détaillé** ci-dessous (section 5 → « AI Coach — Phase 1 »).
- ✅ **Prototype — couche provider (Google + Ollama)** posée et compile (tsc 0
  erreur, ESLint 0 warning, `cargo check` OK) :
  - Rust `commands/ai.rs` : proxy HTTP générique `ai_chat` (POST) + `ai_list_models`
    (GET), provider-agnostique (URL+headers+body construits côté TS). Dép. `reqwest`
    (rustls-tls). Enregistrés dans `lib.rs`/`mod.rs`. CSP inchangée.
  - Front `src/lib/ai/` : `types.ts` (`AIProvider`/`ModelInfo`), `providers/google.ts`
    (generateContent, systemInstruction, filtre `supportedGenerationMethods`),
    `providers/ollama.ts` (`/api/chat` stream:false, `/api/tags`), `providers/index.ts`,
    `models.ts` (`fetchModels` : filtre + tri récence + cache `config ai_models_cache_<id>`
    + repli `fallbackModels`). Namespace `ai` ajouté à `api.ts`.
  - ⚠️ Chiffrement clé (`ring`) **différé** : Phase 1 stocke via `config` comme le reste
    (TODO durcissement avant release). Coûts non couverts par `/models` → `cost.ts` à venir.
- ✅ **Carte « AI Coach » dans Config** (testable en vrai) : sélecteur fournisseur
  (Google/Ollama), clé API masquée (œil maintenu, masquée si `needsKey=false` → Ollama),
  **dropdown modèle peuplé dynamiquement via `fetchModels`** + bouton Rafraîchir,
  note « clé stockée en clair ». Store étendu (`aiProvider`/`aiApiKey`/`aiModel` +
  setters persistants `ai_*`). i18n 4 langues (9 clés `config.ai*`). tsc + ESLint OK.
- ✅ **6 providers complets** : `openai-compat.ts` (fabrique → OpenAI, DeepSeek,
  Mistral, même format `/chat/completions` + `/models`, filtre non-chat) + `anthropic.ts`
  (system **top-level**, `x-api-key`+`anthropic-version`, blocs `content[]`). Registre
  `index.ts` mis à jour (les 6 apparaissent dans le dropdown Config).
- ✅ **`coach.ts`** : `chat()` (non-stream via proxy) + `testConnection()` (appel minimal
  8 tokens → valide clé+modèle+réseau) + `friendlyError()` (mappe HTTP 401/402/429/5xx +
  erreurs réseau en messages lisibles).
- ✅ **Bouton « Tester » dans la carte Config** : lance `testConnection`, affiche
  OK (vert) / message d'erreur (rouge), désactivé sans modèle ou sans clé requise.
  2 clés i18n ajoutées (`aiTestConnection`, `aiTestOk`) ×4 langues. tsc + ESLint OK.
- ✅ **Analyse post-race branchée** (onglet « Coach IA » dans `SessionDetail`) :
  - `prompts/system.ts` (4 langues, condensé : on s'appuie sur la connaissance du modèle,
    pas de JSON circuits) + `prompts/postrace.ts` (modes **quick** 300 tok / **full**
    1000 tok, 4 langues).
  - `context/postrace-context.ts` : `buildPostRaceContext(detail)` → contexte compact
    (étiquettes EN) depuis `get_session_detail` (SQLite) : session, résultat joueur
    (best/optimal/médiane/std-dev/vmax/fuel), **référence de classe** (meilleur tour de la
    classe + écart), tableau tours (cap 40), usure pneus dernier tour. **Mode dégradé
    explicite** : sections « Not available » pour setup `.svm` + télémétrie HF.
  - `coach.ts` : `analyzePostRace()` (système + question langue + contexte → `chat`).
  - `components/AICoachPanel.tsx` : boutons Analyse rapide/complète, **aperçu du contexte
    réellement envoyé** (transparence), rendu réponse, disclaimer, garde « non configuré »
    avec lien Config. i18n namespace `coach` + `sessionDetail.tabCoach` ×4 langues. tsc + ESLint OK.
- ✅ **Résumé lisible + lecture audio** (`AICoachPanel`) : rendu **markdown léger** sans
  dépendance (titres / listes / gras / paragraphes), barre d'actions **Écouter / Arrêter**
  (TTS via `announce()` + `stripMarkdown`) et **Copier**. `voice.ts announce()` reçoit un
  `onEnd` optionnel (propagé dans les 2 chemins Web Speech + Piper) → le bouton se
  réinitialise à la fin naturelle de lecture. Coupe la voix au changement d'onglet/session.
  3 clés i18n (`listen`/`stop`/`copy`) ×4 langues. tsc + ESLint OK.
- ✅ **Toggle activer/désactiver + Coach sur la télémétrie** (retour utilisateur) :
  - Store `aiCoachEnabled` (persisté `ai_coach_enabled`, défaut true) + setter.
  - **Switch « Activer le Coach IA »** en tête de la carte Config ; corps masqué quand off.
    Désactivé → le coach **disparaît de toutes les pages**.
  - `AICoachPanel` refactoré → base `CoachPanel({ contextText })` + 2 wrappers :
    `AICoachPanel({ detail })` (post-race) et `TelemetryCoachPanel({ meta })`.
  - `context/telemetry-context.ts` : `buildTelemetryContext(meta)` → circuit/voiture/météo,
    durées de tours (+ meilleur), canaux enregistrés, sections « Not available » (tour
    complet, `.svm`). OK en mode dégradé (fichiers sans tour complet).
  - Onglet « Coach IA » dans `SessionDetail` **et** carte Coach en bas de `TelemetryView`,
    gated par `aiCoachEnabled`. 2 clés i18n (`aiCoachEnable*`) ×4 langues.
  - ℹ️ Ollama « ne marche pas » = aucun modèle installé → résolu après `ollama pull`.
  - tsc + ESLint OK.
- ✅ **Modale + question libre + garde-fou de sujet** (retour utilisateur) :
  - Résultats d'analyse désormais dans une **modale large** (`max-w-3xl`, scroll, overlay +
    Échap/clic-dehors), avec lecture audio + copie dans l'en-tête. Le panneau garde un
    bouton « Voir l'analyse » pour rouvrir.
  - **Question libre** : champ + envoi dans le panneau ET en pied de modale (suivi).
    `askCoach()` dans `coach.ts` (question + contexte session, 600 tok).
  - **Garde-fou de sujet** dans `prompts/system.ts` (4 langues) : le coach ne répond QUE sur
    LMU / sim racing / pilotage, refuse poliment le reste.
  - 5 clés i18n (`ask`/`send`/`close`/`analyzing`/`reopen`) ×4 langues. tsc + ESLint OK.
- ✅ **Prompt système éditable en Config** (retour utilisateur) : store `aiSystemPrompt`
  (persisté `ai_system_prompt`, vide = défaut). Éditeur repliable dans la carte Config :
  textarea (placeholder = défaut de la langue), boutons **Insérer le défaut / Réinitialiser /
  Enregistrer**, badge « personnalisé ». `coach.ts` `resolveSystem(lang, override)` →
  l'override non vide remplace le défaut (sinon repli multilingue) ; `analyzePostRace` +
  `askCoach` reçoivent `systemOverride` (passé par `AICoachPanel` depuis le store).
  6 clés i18n (`aiPrompt*`) ×4 langues. tsc + ESLint OK.
- ✅ **Override de prompt par langue** (retour utilisateur) : `aiSystemPrompt` (string)
  remplacé par `aiSystemPromptByLang` (map code 2 lettres → texte, persistée JSON dans
  `ai_system_prompt`, comme `voiceUriByLang`). Setter `setAISystemPrompt(lang, v)` (vide =
  retrait de l'override). L'éditeur Config agit sur la **langue active** (badge code langue
  + « personnalisé »), `AICoachPanel` résout l'override de la langue courante avant l'appel.
  Note i18n mise à jour (« s'applique à la langue active »). tsc + ESLint OK.
- ✅ **Conseils électroniques depuis la télémétrie** (retour utilisateur) : `ELEC_CHANNELS`
  + `buildElectronicsSummary(data)` (telemetry-context) → ABS / TC / TC Cut / TC Slip /
  engine map / brake bias (valeur courante + plage si variée). `TelemetryCoachPanel` charge
  ces canaux (`getChannels`, session entière) et les injecte dans le contexte. Prompt système
  (4 langues) : autorisation explicite de proposer un ajustement (valeur actuelle → direction
  → raison data).
- ✅ **Liaison `.svm`↔session dans le coach** (retour utilisateur) : `context/setup-context.ts`
  `buildSetupSummary(svm)` — whitelist (aéro, suspension, freins, électronique, diff, 4 coins),
  **valeur lisible = `comment` du `.svm`** (calé sur un vrai fichier COTA/Alpine), ignore
  `N/A`/`Non-adjustable`/`Fixed`/`Detached`. `AICoachPanel` post-race récupère le setup lié
  (`setups.getForSession` → `getContent`) et l'injecte ; `buildPostRaceContext(detail, setupSummary?)`
  ajoute la section setup et retire la ligne « not linked » si présent. tsc + ESLint OK.
- ✅ **Conversation continue (multi-tours)** : `coach.ts` `analyzePostRace`/`askCoach`
  remplacés par `converse({ history })`. `AICoachPanel` tient un **fil** (`Turn[]`) : Analyse
  rapide/complète démarre un fil neuf, les questions s'enchaînent. **Contexte injecté une seule
  fois** (1er message) ; envoi capé (1er msg + 8 derniers tours). Modale en thread (bulles user
  + markdown assistant), lecture/copie sur la dernière réponse. tsc + ESLint OK.
- ℹ️ **Analyse comparative** (`ANALYSE_COMPARATIVE_COACH_IA.md`) revue : d'accord sur
  « déterminisme = fiabilité » ; réserves : live≠post-race, redondance CrewChief, reco mock
  interdite (§2), « virages : non » inexact (déjà partiel). Repriorisation retenue ci-dessous.
- ✅ **1b — Virages dans le contexte télémétrie** : détection extraite de `TelemetryView`
  vers `src/lib/telemetry/corners.ts` (`detectCorners` + `summarizeCorners`), réutilisée par
  les deux. `TelemetryCoachPanel` charge vitesse+frein du **tour le plus rapide**, détecte les
  virages et injecte une section `## Corners (fastest lap)` (T1: brake @ x km → min y km/h).
  `buildTelemetryContext(meta, elec?, corners?)`. tsc + ESLint OK.
- ✅ **2a — Coaching live à la demande** (1re brique du mode live, sans streaming) :
  - `context/live-context.ts` `buildLiveContext(data)` → snapshot shared memory : session,
    position/écarts, chrono, **carburant + évaluation de pit déterministe** (compare
    `fuel_laps_remaining` déjà calculé vs tours restants), pneus, électronique (TC/ABS), météo.
  - `CoachPanel` refactoré : `contextText` → **`getContext()` (résolu à l'envoi) + `resetKey`**
    → snapshot **frais** à chaque question (le live ne réinitialise pas le fil à chaque tick).
    Post-race/télémétrie adaptés (resetKey = session id / chemin fichier).
  - `LiveCoachPanel` (`getContext` = `buildLiveContext(await live.getData())`, `resetKey="live"`)
    monté en **onglet « Coach IA »** de la page Live (gated). i18n `live.tabCoach` ×4. tsc + ESLint OK.
  - ℹ️ Stratégie déterministe = champs **déjà calculés** backend (`fuel_consumption`,
    `fuel_laps_remaining`) → pas de gros `StrategySnapshot` recalculé.
- ✅ **2b — Streaming SSE/NDJSON** : Rust `ai_chat_stream(streamId, url, headers, body)` —
  `reqwest` feature `stream` + `futures-util`, relaie chaque ligne du flux via l'event
  `ai-stream-<id>` (résolution de la commande = fin). Interface provider étendue :
  `streamChatUrl` (Google → `streamGenerateContent?alt=sse`), `buildBody(..., stream)`,
  **`parseStreamChunk(line)`** (OpenAI-compat `data:`+delta / Anthropic `content_block_delta` /
  Google `data:`+parts / Ollama NDJSON). `coach.ts` `converseStream({ onToken })` (listen +
  invoke, streamId unique). `CoachPanel.runTurn` affiche la réponse **token par token** (post-race,
  télémétrie, live). tsc + ESLint + `cargo check` OK.
- ✅ **Lot A (finition) + Lot B (live utilisable)** :
  - **A1 coût** : `lib/ai/cost.ts` (table tarifs par préfixe + `estimateTokens`/`estimateCost`/
    `formatCost`). Coût cumulé estimé affiché dans l'en-tête de modale (caché si tarif inconnu ;
    0 pour Ollama).
  - **A2 stop** : bouton « Stop » pendant le streaming (`cancelRef` → ignore la suite des tokens
    et fige la réponse partielle ; le flux backend se termine seul).
  - **A3 chiffrement clé** : Rust `ai_set_key`/`ai_get_key` (AES-256-GCM `ring`, clé dérivée
    machine hostname+user, nonce + hex ; **obfuscation**, pas un coffre). Migration douce de
    l'ancien `ai_api_key` en clair. Store + `api.ai.setKey/getKey` ; init lit la clé déchiffrée.
  - **B1 push-to-talk** : Rust `stt_recognize_free` (Vosk **sans grammaire**, dictée libre,
    feature `stt`) ; bouton micro dans la saisie du coach (panneau + modale), gated sur
    `stt_available`. Réutilise `mic.ts`. ⚠️ dispo uniquement en build `--features stt` ;
    précision dictée libre < grammaire fermée.
  - **B2 TTS phrase-par-phrase** : toggle « lecture auto » (casque) → lit chaque phrase complète
    au fil du stream (`speak(..., "chatty")`).
  - **B3 refresh snapshot** : couvert par design (chaque question/analyse capture un snapshot
    live frais via `getContext()` ; aperçu rechargé à l'ouverture).
  - i18n `coach.stopGen/speak/autoRead/costTip` ×4. tsc + ESLint + `cargo check` (défaut + `stt`) OK.
- ✅ **Correctifs live (retour test)** : (1) surchauffe **pneus** et (2) **freins** → logique
  « seuil tenu » (`sustainedAlert`) : pneus >115 °C tenu ≥10 s, freins >750 °C tenu ≥6 s, puis
  silence 2 min (fini le spam à chaque freinage). (3) « **dernier tour ×2** » = collision i18n
  (`vLastLap` chrono « Dernier tour, » + `vFinalLap` « Dernier tour de la course ») → chrono
  renommé « Tour bouclé, » (FR/EN/ES/DE). (4) **infos live conservées** en pause/fin de course :
  `Live()` garde le dernier instantané « en session » (`lastGood`) et rend le `Dashboard` figé
  sous un **filigrane d'état** (pause / fin / jeu fermé) au lieu de masquer la page. (5) temps
  vocaux au **millième** (`fmtLapVoice`/`lapVoice` → toFixed(3)). tsc + ESLint OK.
- ✅ **Coach IA vocal mains libres (le vrai coach live)** : raccourci global push-to-talk
  dédié `spotterKeyCoach` (défaut `Alt+C`). `useCoachVoice` (monté dans `App.tsx` à côté de
  `useSpotter`) : maintien touche → micro → `stt_recognize_free` (dictée libre) → `live.getData`
  → `buildLiveContext` → `askCoachVoice` (réponse 2 phrases, 160 tok) → `announce` (TTS). Gated
  sur Coach configuré ; repli `voiceUnclear`/`friendlyError`. Config : `ShortcutCapture` dans la
  carte Coach + i18n (`aiVoiceKey`, `coach.voiceUnclear`) ×4. tsc + ESLint OK.
  → l'onglet Coach du Live devient secondaire (pause/stands) ; le vrai usage course = la touche.
- ✅ **Comparaison d'apex dans le coach télémétrie** (piste 2) : réutilise le `analyzeLap`
  **déjà calculé par la page** (delta aligné par distance vs tour de réf.). `summarizeLapAnalysis`
  (analysis.ts) → texte EN (perte totale, zones à travailler, apex/virage + Δ vitesse + temps
  perdu, point le plus lent). `buildTelemetryContext(meta, elec?, corners?, comparison?)` ;
  `TelemetryCoachPanel` reçoit `analysis` de `TelemetryView`. N'apparaît que si un **tour de
  référence** est choisi sur la page. tsc + ESLint OK.
- ✅ **P0 — inventaire canaux** (via Python+duckdb sur vrais fichiers) : 56 continus + 42 events.
  Dispos utiles : Brake/Throttle/Steering Pos (50–100 Hz), Ground Speed, **Lap Dist** (alignement),
  **Wheel Speed (canal UNIQUE)**, SoC/Virtual Energy/Regen Rate, events **ABS** & **TC** (activations),
  G-forces. Limites : 1 seule Wheel Speed (blocage non localisable), pas de yaw direct.
  ⚙️ `get_telemetry_channels` rééchantillonne à `min(natif, maxPoints≤20000)` → **`maxPoints=20000`
  pour 1 tour ≈ natif** → calcul des métriques fines **en TS sur quasi-brut**, sans dupliquer la
  logique en Rust (décision : source unique de vérité).
- ✅ **P1 — métriques de pilotage par phase** : `lib/telemetry/lapMetrics.ts`
  (`computeLapMetrics` + `summarizeLapMetrics`) → par virage : freinage (max %, temps au pic,
  relâche, trail), entrée (vitesse, vitesse de rotation volant), milieu (corrections volant),
  sortie (remise de gaz, throttle 20→100 %), **events ABS/TC**, **blocages** (Wheel Speed vs sol),
  **hybride** (SoC/regen), **tags de style** (heuristiques prudents). Injecté dans le contexte
  coach télémétrie (canaux pleine résolution, tour le plus rapide). tsc + ESLint OK.
- ✅ **P2 — attribution du temps perdu par phase** : `analyzeLap` étendu (reçoit frein+throttle)
  → `phaseLoss { braking, mid, exit }` par virage (lecture du delta aligné aux frontières
  fin-de-frein / 1re remise de gaz). `summarizeLapAnalysis` indique la **phase dominante** sur
  les zones à travailler (« T7 +0.23s — mostly braking (65%) »). `TelemetryView` passe
  `Brake Pos`/`Throttle Pos`. Calculé uniquement avec un tour de référence. tsc + ESLint OK.
- ✅ **Référence « meilleur théorique self »** (sans données pro) : `theoreticalBest.ts`
  (`compareToBestApex` + `summarizeTheoreticalBest`) → meilleure vitesse d'apex par virage sur
  **tous les tours propres** (≤1.08× le plus rapide, cap 10), appariement par distance du point
  de freinage. `TelemetryCoachPanel` charge ces tours et injecte « Vs your theoretical best »
  dans le contexte (toujours dispo, même sans tour de réf. sélectionné). tsc + ESLint OK.
  ℹ️ Sur les « références pro » : indispo officiellement pour LMU ; nos références réalistes =
  (a) meilleur théorique self [fait], (b) ohne_speed temps/secteurs [déjà intégré], (c) import
  d'un tour externe [déjà supporté], (d) communautaire/cloud = Phase 6 (traces alien).
- ✅ **P3 — hybride avancé** (Hypercar) : `HybridAnalysis` (SoC start/end/min/max, **% déploiement**,
  **% régénération**, **% tour SoC>90 %**, regen kWh, **zones de gros freinage batterie pleine**,
  énergie virtuelle). Notes auto : « batterie haute la majorité du tour → sous-déployée », « freinage
  fort batterie pleine → regen perdue ». Gated sur classe Hyper/LMH/LMDh.
- ✅ **P4 — classification de style** : `StyleProfile { summary, traits }` (freineur agressif/prudent,
  rotation sur frein/volant, plateforme instable, remise de gaz agressive/progressive, catégorie
  proto/GT). Injecté pour que le LLM **adapte le ton** des conseils. Canaux `Virtual Energy` +
  `car_class` passés. tsc + ESLint OK.
- ✅ **Finalisation AI Coach** : **build prod complet vert** (`npm run build`, 2979 modules,
  ✓ 15.5 s — uniquement warnings de taille de chunk préexistants) + `cargo check` OK
  (défaut + `stt`). Phase marquée FAIT en section 5.
- ✅ **Base « alien » ohne_speed dans le coach** : `findBenchmark`+`computeTier` injectés dans
  le contexte **post-race** (`buildPostRaceContext(detail, setup?, alien?)`) → « ton meilleur
  X vs alien hotlap Y → +Δs (Z % alien, tier T) ». Respecte `showOhneSpeed`. ⚠️ niveau **tour
  uniquement** (ohne_speed n'a ni secteurs ni traces) → le détail par virage reste sur le
  « meilleur théorique self » / Phase 6. tsc + ESLint OK.
- ✅ **B — Import local d'un tour de référence (traces)** : bouton « Importer… » dans le
  sélecteur de comparaison de `TelemetryView` (`@tauri-apps/plugin-dialog` `open`, filtre
  `.duckdb`) → `setRefPath(chemin arbitraire)` ; option dynamique pour le fichier importé
  (hors dossier Telemetry). Le pipeline compare (`getMeta`/`getChannels` + `analyzeLap`) gère
  déjà un chemin quelconque → la **comparaison par traces + perte par phase** s'applique au
  fichier importé, et alimente le coach. i18n `telemetry.importRef[Hint]` ×4. tsc + ESLint OK.
  ℹ️ Export = le `.duckdb` de session existe déjà sur disque (partage direct) ; export
  compact 1 tour = amélioration future éventuelle.
- 📋 **Prochaine étape** : **test utilisateur** en conditions réelles (build `--features stt`
  pour le vocal) → remonter les réglages à ajuster (seuils surchauffe, latence vocale, précision
  dictée, longueur des réponses, pertinence des métriques/style). Options non engagées : objet
  JSON strict par virage ; référence communautaire « alien » (Phase 6). ⚠️ blocages non
  localisables (1 canal roue) ; causalité à nuancer côté LLM.

### 2026-06-08 — Électronique LIVE + badge source harmonisé

- ✅ **Électronique en direct** (page lecteur) : avant, l'encart montrait la valeur
  de **début de session** (fetch séparé `getChannels(..., null, 2)`, index 0). Or
  ABS/TC/TC Cut/TC Slip/Mix/Brake Bias sont des canaux **événementiels** (loggés à
  chaque changement). Désormais ils sont dans `VIEW_CHANNELS` (interpolés en escalier
  par le backend) et lus **à la tête de lecture** → l'encart **reflète les réglages
  changés en jeu** pendant la session. Fetch séparé supprimé.
- ✅ **Badge source « Jeu/App » harmonisé** : composant `SourceBadge` (pilule
  `rounded-full`, `text-micro`, contour visible) calqué sur ClassBadge/SessionBadge —
  corrige « texte trop gros » (`Badge` shadcn forçait `text-xs`) et « pas de contour ».
  Utilisé dans SetupDetail (en-tête + ligne d'info) + tableau global Setups. Build OK.

### 2026-06-08 — Télémétrie : comparaison inter-sessions (#3) + virages auto (#6)

- ✅ **#3 Comparaison inter-sessions** : le sélecteur de référence permet désormais
  de choisir **une autre session du même circuit** (pas seulement un autre tour du
  même fichier), puis un tour de cette session. Liste filtrée par `track`, libellé
  = type session · voiture · date (★ = session courante). État `refPath/refMeta` +
  fetch `getMeta`/`getChannels` sur le fichier de référence ; le réalignement par
  distance (compare) marche tel quel quelle que soit la source.
- ✅ **#6 Segmentation virages auto + points de freinage** : détection des zones de
  freinage (`Brake Pos` > 8 %, fusion des zones proches) → **point de freinage** +
  **apex** (min vitesse après). Carte « Virages » (T1, T2… · freinage @ km · vitesse
  mini), **clic = saut au point de freinage** (déplace la tête de lecture), et
  **points de freinage marqués sur la carte 2D** (`TrackMap markers`). Heuristique
  simple, recalculée par tour. i18n 4 langues.
- ℹ️ **#4 (anneau pneu coloré) déjà fait** la veille (`TyreCard`). Build + ESLint OK.

### 2026-06-08 — Télémétrie : pneus « jolis » (SVG) + zoom graphes

- ✅ **Pneus refaits façon LMU Telemetry Lab** (qui est en **SVG/React, même techno
  que nous** — pas d'autre techno) : `TyreCard.tsx` — **anneau d'usure** SVG
  (`<circle strokeDasharray={wear} 100>`, couleur HSL rouge→vert), **compound au
  centre coloré**, **température 3 points colorée** (bleu froid→rouge chaud),
  pression, temp. frein. **Bug compound corrigé** : la lettre dépend de la **classe**
  (GT3 : 0=M, pas S ; Hyper/LMP : 0=S,1=M,2=H,3=W).
- ✅ **Zoom sur les graphes** : uPlot a le zoom natif (`cursor.drag.x`) — glisser
  pour zoomer, **double-clic** pour réinitialiser. **Synchronisé entre tous les
  graphes** via un état partagé `zoom` (hook `setScale` → `onZoom` ; application
  imperative `u.setScale` avec garde anti-boucle → aucune reconstruction du graphe).
  Reset auto au changement de tour/fichier.
- ✅ Build + ESLint OK. i18n inchangé.

### 2026-06-07 — Polish : nav header + harmonisation tableau Setups

- ✅ **Header** : ordre de la nav inversé → **Live** avant **Télémétrie**
  (Profil · Records · Sessions · Setups · **Live · Télémétrie** · Config).
- ✅ **Tableau Setups harmonisé** avec les autres tables (Sessions/Telemetry) :
  les 3 tables (globale, par voiture, par circuit) utilisent désormais le composant
  `TableTitle` (au lieu d'une bannière `<div>`/`<h3>` ad hoc) ; classes d'en-tête
  redondantes retirées (`TableHeader`/`TableRow` reprennent les défauts des
  composants) ; override `font-medium` des cellules d'en-tête supprimé (→ poids
  `font-semibold` standard). Build + ESLint OK.

### 2026-06-07 — Page lecteur télémétrie dédiée (style LMU Telemetry Lab)

- ✅ **Nouvelle page plein écran `/telemetry/view`** (`routes/TelemetryView.tsx`),
  inspirée des captures de **LMU Telemetry Lab** fournies par l'utilisateur —
  **layout 3 colonnes** :
  - **Gauche — Infos session** : badge type, circuit + tracé (drapeau), voiture
    (logo + modèle + équipe + classe + pilote), météo, temp. piste (live), temps
    session, **sélecteurs Tour + Référence** (comparaison), encart **Électronique**.
  - **Centre** : **carte 2D** avec voiture animée (marqueur) + **contrôles de lecture**
    (play/pause, timeline scrub, vitesse 0,5–4×), graphe **delta** (si comparaison),
    puis graphes **Vitesse · Accél. · Frein · Direction · RPM** (axe distance),
    **curseur synchronisé à la tête de lecture**.
  - **Droite — Dashboard live** : vitesse (gros) + RPM + rapport, barres
    accél./frein, indicateur de **direction**, **4 pneus** (temp °C, usure %,
    pression kPa, gomme S/M/H/W), **carburant** (L). Tout se met à jour au fil de
    la lecture.
- ✅ **Perf** : `cursorIdx` ajouté à `TelemetryChart` (effet séparé → `setCursor`
  uniquement, **pas de reconstruction** du graphe à 60 fps) ; séries de graphes
  **mémoïsées** (stables pendant la lecture) ; `TrackMap` en 3 `Path2D`. La lecture
  à 60 fps ne re-rend que la carte + le dashboard, pas les graphes uPlot.
- ✅ **Page liste `/telemetry` = navigateur** : filtres (Circuit · Classe · Voiture ·
  Type) + **tableau trié** (style tableau Sessions : colonnes Circuit · Tracé ·
  Voiture · Classe · Session · Pilote · Météo · Date, en-têtes triables via
  `SortHeader`, lignes cliquables → lecteur `?path=…`). Ancien composant
  `TelemetryPlayer.tsx` (lecteur embarqué) **supprimé**. i18n 4 langues. Build + ESLint OK.
- ✅ **Volant qui tourne, par voiture** (rappel V1) : `SteeringWheel.tsx` pivote avec
  `Steering Pos` (convention V1 : angle = steer/100 · 180°), dans la carte
  vitesse/pilotage du lecteur + angle en °.
  - **Images de volant par voiture optimisées** : LMU Telemetry Lab (et V1) embarquent
    les **mêmes gros PNG** (~45-62 Mo, non optimisés). On les a **réencodés en WebP
    256 px** (transparence conservée) → **0,5 Mo pour 36 voitures** (~13 Ko/volant).
    Générés dans `public/steering_wheels/*.webp` via `scripts/optimize-steering-wheels.py`
    (source = PNG V1). Nom de fichier = **slug du modèle** (« BMW M4 LMGT3 » →
    `bmw-m4-lmgt3.webp`) = match direct avec notre `car_model`.
  - **Matching robuste par mots-clés** (`src/lib/steeringWheels.ts`, généré depuis
    la config V1 `includes/cars.json`) : recherche de sous-chaîne sur le nom plié
    (minuscules + accents retirés) → tolère Evo / Gibson / livrée / accents
    (« Huracán Evo 2 », « BMW M4 LMGT3 Evo », « Lexus RC F », « Valkyrie AMR »… OK).
  - Repli **SVG générique** si pas de correspondance / échec de chargement (ex.
    Toyota TR010 = typo data, ADESS AD25 = voiture 2026 sans image source).
- ✅ **Dashboard lecteur complété (toutes les données de la session)** : la colonne
  droite expose désormais tous les canaux disponibles du `.duckdb`, façon LMU
  Telemetry Lab — **Temps au tour** (tour en cours / dernier / meilleur / secteur),
  **Pneus 3 points** (G/C/D × 4 roues) + usure + pression + **temp. frein**,
  **Moteur** (eau / huile / turbo), **Hybride/Énergie** (SoC / Virtual Energy /
  régén., affiché si données présentes), **Forces & conditions** (G long/lat, FFB,
  air, vent), **Carburant**. + 2 graphes centraux ajoutés (**Rapport**, **G‑Force**).
  Canaux ajoutés à `VIEW_CHANNELS` (≈35), tout lu à l'index de lecture (peu coûteux).
  Dims vérifiées sur fichier réel (temps pneus 3 pts ×4, freins ×4, etc.). i18n 4 langues.
- ✅ **Graphes repliables (lecteur)** : chaque graphe a un bouton replier/déplier ;
  l'en-tête conserve la **valeur en direct** (mise à jour pendant la lecture) même
  replié — comme LMU Telemetry Lab.
- ✅ **Colonnes Best lap + Arrivée (tableau liste)** : reliées à la **session
  indexée** correspondante (match `veh_name` + timestamp le plus proche, fenêtre 2 h,
  `parse_recording_epoch` sur `RecordingTime`). `TelemetryFileInfo` enrichi
  (`best_lap`, `finish_position`) ; colonnes triables. « — » si pas de session liée.
- 🐛 **Fix débordement de couleur** : la `Card` du tableau (en-tête `bg-primary/15`)
  ne rognait pas ses coins arrondis → `overflow-hidden` ajouté.
- 📋 **Prochaine étape** : tester en réel sur une session à tours complets. Pistes :
  vue **3D** (toggle 2D/3D du Lab, T7.6 Three.js), gauge arc (esthétique),
  comparaison **inter-sessions/fichiers**, mini-carte de suivi.

### 2026-06-07 — T7.1 + T7.2 : Fondation télémétrie DuckDB + page Télémétrie (graphes uPlot)

- ✅ **Décision validée empiriquement** : la crate Rust `duckdb` **bundled**
  (libduckdb 1.x, compilée depuis les sources comme rusqlite) **lit directement
  les fichiers `.duckdb` écrits par LMU**. Vérifié sur un vrai fichier de
  `D:\SteamLibrary\…\UserData\Telemetry\` (test sonde temporaire → métadonnées,
  104 400 lignes `GPS Time`, canaux 4 roues `TyresTempCentre`, rééchantillonnage
  OK ; test retiré ensuite). Compile en ~2 min 30, binaire final lié OK.
- ✅ **Backend `src-tauri/src/commands/telemetry.rs`** (T7.1) — 3 commandes :
  - `list_telemetry_files` : scan `<lmu_path>/UserData/Telemetry/*.duckdb`, lit la
    table `metadata` de chaque fichier (rapide), tri par mtime décroissant ; un
    fichier corrompu/en cours d'écriture est ignoré sans casser la liste.
  - `get_telemetry_meta` : métadonnées + `channelsList` (continus) + `eventsList`
    (événementiels) + **segmentation des tours** via le compteur `Lap` du jeu
    (source autoritaire ; fallback = 1 segment = session entière) + `t0`/durée.
  - `get_telemetry_channels` : charge N canaux et les **rééchantillonne sur une
    grille temporelle commune** (1 seule requête → axe X partagé → curseur synchro
    côté UI). Axe distance dérivé du canal `Lap Dist`. Canaux continus indexés par
    `(t−t0)·f` (robuste aux fréquences non-divisibles de 100 Hz, ex. 7 Hz) ;
    canaux événementiels interpolés en escalier (`ts ≤ t`). `max_points` borne la
    résolution (défaut 4000). Sorties en `f32` pour alléger le payload.
- ✅ **Structure interne décodée** (cf. fichier réel) : `metadata` (key/value),
  `channelsList` (channelName/frequency/unit), `eventsList`, 1 table/canal continu
  (`value` ou `value1..4` par roue, échantillonnée à sa fréquence), 1 table/canal
  événementiel (`ts`+`value`). Échelles relevées : pédales 0–100 %, direction
  ±100 %, vitesse km/h (`Ground Speed`), RPM, pneus 4 roues FL/FR/RL/RR.
- ✅ **Frontend** (T7.2) :
  - `src/components/telemetry/TelemetryChart.tsx` — wrapper React **uPlot**
    (canvas, tient 10k+ points ; Recharts SVG ne suffit pas), curseur synchronisé
    entre graphes (`cursor.sync.key`), échelles Y verrouillables, thème dark/light.
  - `src/routes/Telemetry.tsx` — nouvelle page `/telemetry` : liste des
    enregistrements (sélection), en-tête infos session, sélecteur de tour, bascule
    axe **Temps / Distance**, toggles de 6 groupes de canaux (Vitesse · Pédales ·
    Direction · Régime · Temp. pneus · Usure pneus ; défaut : 3 premiers). 1 fetch
    union → tous les graphes partagent l'axe X.
  - Bridge `api.ts` (`telemetry.listFiles/getMeta/getChannels` + types), route
    `App.tsx`, entrée nav `Header.tsx`, i18n complet **4 langues** (FR/EN/ES/DE).
  - Dépendance `uplot@^1.6.32` ajoutée.
  - **Recherche/filtre des enregistrements** (façon Dashboard, option simple) :
    barre recherche texte (circuit/voiture/tracé/pilote) + menus Circuit · Classe ·
    Type de session + bouton Reset. Filtrage **côté client** (la liste est petite),
    options dérivées des fichiers chargés, clés i18n `sessions.*` réutilisées.
  - **T7.3 — Carte 2D du circuit (heatmap)** : `src/components/telemetry/TrackMap.tsx`
    (canvas) trace le tracé depuis `GPS Latitude/Longitude`, **coloré accélérateur
    (vert) / frein (rouge) / roue libre (gris)** façon lmuTrace. Projection
    équirectangulaire locale (x = (lon−lon0)·cos(lat0), y = lat−lat0, Y inversé),
    fit + ratio préservé, `devicePixelRatio` pour la netteté, `ResizeObserver`.
    Toggle « Carte » (groupe spécial, actif par défaut) ; canaux GPS+pédales
    ajoutés au fetch union. Légende 3 couleurs. i18n 4 langues. ⚠️ Origine GPS
    locale (lat≈60) → on travaille en **relatif** ; OK. NB : sur une session où la
    voiture bouge peu, le tracé est partiel (normal).
  - **T7.4 — Comparaison de tours + delta** : sélecteur « Comparer » (2ᵉ tour du
    même fichier, requiert un tour principal précis). **Sans backend** : le tour de
    référence est réaligné **par distance** sur la grille du tour principal
    (interpolation linéaire frontend, chaque tour ayant ses propres `dist[]`/`time[]`),
    superposé **en pointillés** sur tous les graphes (réutilise `g.build` → marche
    aussi pour les 4 roues). **Graphe de delta temps cumulé** (t_principal − t_réf,
    < 0 = plus rapide) en tête. Axe X forcé sur la distance en comparaison. i18n
    4 langues. Filtre **Voiture** ajouté à la recherche (couplé à la classe, vrais
    modèles). Champ de recherche texte **retiré** (choix utilisateur : menus seuls).
  - **Mode lecteur (replay 2D)** façon LMU Telemetry Lab : nouveau composant
    `TelemetryPlayer.tsx` — timeline + play/pause + vitesse (0,5/1/2/4×), la voiture
    se déplace sur la carte 2D (marqueur ambre) et un **bandeau de valeurs en direct**
    (vitesse · accél. · frein · rapport · RPM) se met à jour. État de lecture
    **isolé** dans le composant → l'animation 60 fps (rAF, avance par temps réel ×
    vitesse) **ne re-rend pas les graphes uPlot**. `TrackMap` refondu : observer monté
    1 fois + redraw via ref, tracé en 3 `Path2D` (1 stroke/couleur), marqueur de
    position. Remplace l'ancien panneau carte statique.
  - **Encart « Électronique de la session »** : badges ABS / TC / TC Cut / TC Slip /
    Mix / Brake Bias, lus depuis les canaux de réglage figés de la télémétrie
    (`ABSLevel`, `TCLevel`, `TCCut`, `TCSlipAngle`, `FuelMixtureMap`,
    `Brake Bias Rear`), 1 lecture par fichier. (Export `.svm` depuis télémétrie
    **abandonné** : la télémétrie ne contient que l'électronique + carburant, pas le
    réglage mécanique/aéro → le Garage existant reste la source des vrais setups.)
  - **Vrai modèle de voiture + logo** : la métadonnée `CarName` de la télémétrie
    n'est **pas le modèle** mais l'**équipe/livrée** (ex. `Team WRT 2026 #32:WEC`)
    → pas de logo. Fix simple & fiable : ce `CarName` = **exactement** le `veh_name`
    des résultats XML indexés, dont la ligne porte le vrai modèle (`unique_car_name`
    = `BMW M4 LMGT3`). Nouveau champ `car_model` rempli par jointure
    `CarName = results.veh_name` (carte construite en 1 requête pour la liste,
    lookup unitaire pour le détail). Repli sur le nom d'équipe si la session n'est
    pas indexée. UI : logo + modèle en principal, équipe en sous-ligne discrète.
- ✅ **Builds OK** : `cargo check` (backend) + `npm run build` (front, 10 s) +
  ESLint 0 warning sur les nouveaux fichiers.
- ✅ **Choix dépendance tranché (utilisateur, 2026-06-07)** : on **garde le crate
  `duckdb`** (haut-niveau, 100 % safe) plutôt que `libduckdb-sys` en FFI direct.
  Analyse : le moteur DuckDB (C++) est **obligatoire et dominant** (les fichiers
  *sont* du DuckDB) ; le seul surcoût évitable est `arrow` (tiré par le crate
  haut-niveau), mais le gain (~quelques Mo + temps de build) ne justifie pas ~80
  lignes d'`unsafe`. **Exe release mesuré = 27 Mo** (build `--release` OK en 5 min 35),
  acceptable. Levier d'optimisation connu si besoin un jour : passer à
  `libduckdb-sys` (API C) pour supprimer `arrow`.
- 📋 **Prochaine étape** : **tester la page en réel** (`npm run tauri:dev` → onglet
  Télémétrie) sur une session à **tours complets** (le fichier de test n'a qu'un
  segment partiel → carte + comparaison non démontrables dessus). Pistes restantes :
  T7.5 export `.svm` depuis télémétrie · comparaison **inter-fichiers/sessions**
  (actuellement même fichier seulement) · curseur carte↔graphes lié · axe distance
  pour la carte. **T7.1→T7.4 ✅ faites.**

### 2026-06-07 — Analyse approfondie LMU Telemetry Lab (rabbit20031225/LMU-Telemetry-Lab)

- ✅ **Analyse complète du code source** de LMU Telemetry Lab — 4 agents en parallèle.
- ✅ **Fichiers analysés** :
  - `backend/app/services/telemetry_service.py` (1228 lignes) — parsing DuckDB, fusion canaux, segmentation tours, self-healing.
  - `backend/app/api/endpoints.py` (1058 lignes) — 23 endpoints REST documentés.
  - `backend/app/services/setup_exporter.py` (245 lignes) — export .svm, ~155 paramètres sur 13 sections.
  - `backend/app/utils/track_db.py` (687 lignes) — 12 circuits, ~25 layouts, matching fuzzy.
  - `frontend/src/components/TelemetryChart.tsx` (1619 lignes) — uPlot, multi-canaux, zoom/cursor sync, delta.
  - `frontend/src/components/TrackMap.tsx` (1848 lignes) — carte 2D Canvas, heatmap throttle/brake/coast, PCA.
  - `frontend/src/components/TrackMap3D.tsx` (1765 lignes) — Three.js/R3F, ghost car, 3 modes caméra.
  - `frontend/src/store/telemetryStore.ts` (1996 lignes) — Zustand, ~60 propriétés, cross-session reference.
  - `frontend/src/types.ts` — interfaces TypeScript complètes.
- ✅ **Découverte clé** : LMU écrit directement en `.duckdb` dans `UserData/Telemetry/`. Pas besoin de parser du binaire `.bt`. La crate Rust `duckdb` suffit.
- ✅ **40+ canaux exploités + 20 ignorés mais disponibles** documentés (GPS, vitesse, contrôles, G-forces, suspension, pneus, électronique, carburant, etc.).
- ✅ **Stack Telemetry Lab** : Electron + React 19 + Python FastAPI + DuckDB + uPlot + Three.js/R3F + Zustand.
- ✅ **Phases d'implémentation proposées** (T7.1–T7.6) ajoutées aux recommandations.
- ✅ **2 URLs officielles LMU** à surveiller pour les mises à jour :
  - Manuel télémétrie : `https://guide.lemansultimate.com/hc/en-gb/articles/14524956311695-Telemetry-Recording`
  - Release notes : `https://guide.lemansultimate.com/hc/en-gb/categories/13278904445967-Release-Notes`
- ⏳ **Lecture des URLs officielles** : bloquée par la limite API web (reset 2026-07-01).
- 📋 **Prochaine étape** : Démarrer T7.1 — ajouter la crate `duckdb` au Cargo.toml et créer le module Rust `telemetry.rs`.

### 2026-06-07 — Analyse visuelle lmuTrace (screenshots LMUTraceHub.exe)

- ✅ **23 screenshots analysés** de l'application lmuTraceHub.exe (client desktop lmutrace.com).
- 📋 **Notes design** à retenir :
  - **Sidebar sombre** (#1a1a2e) avec icônes + labels, section active surlignée — plus pro que notre header+nav horizontal, meilleure utilisation de l'espace vertical.
  - **Carte circuit 2D avec trajectoire colorée** throttle/brake — killer feature, très lisible, les overlays in-game l'affichent aussi.
  - **Delta bar horizontale** verte/rouge sous le HUD — simple, instinctif, meilleure UX qu'un chiffre brut.
  - **Widget pneus 4 blocs** (FL/FR/RL/RR) avec badges compound colorés (S=blanc, M=jaune, H=rouge, W=bleu) + temp 3 points (I/M/O) + pression + usure%.
  - **Lap comparison** : superposition de 2 lignes sur la carte 2D avec delta coloré par section (vert=gain, rouge=perte).
  - **Palette overlays** : semi-transparents, coins arrondis, bordures subtiles cyan, très pro.
  - **Stint analysis** : graphes usure pneus par stint + fuel usage + temps tours — vue d'ensemble course.
- 📋 **Impact sur propositions** : #94 (carte 2D), #95 (SVG), #162-166 (overlays), #114-118 (pneus) confirmés comme priorités. Ajouter référence visuelle lmuTrace comme benchmark UI.

### 2026-06-06 — Réorganisation propositions + veille exhaustive

- ✅ **180 propositions réorganisées par type** (T1-T16) au lieu de par phase/vague. Regroupements thématiques : Architecture, Tests, Accessibilité, Design, Performance, Robustesse, Télémétrie, Cartes, Stats, Pneus, Stratégie, Stewarding, Spotter, Overlays, Social, Outils.
- ✅ **Liste des projets à surveiller** ajoutée (3 niveaux : 🔴 concurrents directs, 🟡 compléments, 🟢 inspirations) — 28 projets référencés avec URL.
- ✅ **Vague 2** : 17 dépôts GitHub analysés (LMUTools, lmu-steward, racepulse, LMUSessionTracker, etc.).
- ✅ **Vague 3** : 5 projets majeurs analysés — lmutrace.com, Telemetry Tool, mylmu.app, popometer.io, TinyPedal.
- 📋 **Prochaine étape** : Valider et prioriser les propositions — choisir la première vague d'implémentation.

### 2026-06-06 — Veille concurrentielle exhaustive (vagues 1-3)

- ✅ **Vague 1** : 9 projets analysés (LMU Analyzer, LMU Telemetry Lab, LeMansUltimateCoPilot, LMU Pitwall, LMU Setup Viewer, LMU Electronic Bridge, ohne_speed, MyLMU, CrewChiefV4) → propositions #78-138.
- ✅ **Total** : 180 propositions (#1-180) couvrant architecture, tests, accessibilité, design, performance, robustesse, télémétrie, cartes, stats, pneus, stratégie, stewarding, spotter, overlays, social, outils.

### 2026-06-05 — Cohérence : émojis hero, échelle typo, tokens session (#9, #11, #8p)

- ✅ **#9 émojis hero** : `▲`/`🏆`/`🥇` retirés des cartes stats Dashboard (`+N`, `PN`, `N`) ;
  les icônes lucide (`TrendingUp`/`Flag`/`Award`) portent le sens. ⚠️ Déroge à la fidélité V1
  (commentaire « valeurs EXACTEMENT comme la V1 ») — **validé explicitement par l'utilisateur**.
- ✅ **#11 échelle typo** : nouveaux `@utility text-nano/micro/mini` (9/10/11 px, **font-size
  seule** → strictement équivalent aux `text-[Npx]`, aucun couplage line-height). 138 occurrences
  migrées par sed sur 20 fichiers. `text-[15px]` (logo Header) laissé tel quel (one-off).
  Vérifié : `.text-nano/.text-micro/.text-mini` présents dans le CSS compilé.
- 🟠 **#8 tokens (partiel)** : hex/style inline de `SessionBadge` remplacés par des tokens
  `--color-session-{race,qualify,practice}(-accent)` (sur le modèle des `--color-tier-*`) +
  classes Tailwind (`text-session-race bg-session-race-accent/15 …`). Plus aucun hex dans le
  composant. Vérifié : utilitaires `session-race`/`session-race-accent` générés dans le CSS.
  **Différé** : migration globale des ~187 usages de palette brute → tokens (chaque couleur
  change de teinte, décision design par couleur requise).
- ✅ Build OK (`vite build`, 10,3 s) · ESLint 0 warning (tout `src`).
- 📋 Prochaine étape : finir #5 (migration `title→Tip`), ou lot 🟢 (#12-14), ou trancher #8 global / #10.

### 2026-06-05 — Usabilité : actions de tableau (tâches #4, #5p, #6, #7)

- ✅ **#4 zones cliquables** : classe commune `ACTION_BTN` (Dashboard) — boutons icône
  Détails/Records passés de l'icône nue 14 px à une cible `inline-flex h-6 w-6` (24 px) avec
  fond au survol (`hover:bg-primary/10` / `hover:bg-success/10`).
- ✅ **#7 focus clavier** : `focus-visible:ring-2 ring-ring` sur tous les `<button>` natifs des
  cellules (Dashboard + Sessions : Détails/Records + « best lap »). Navigation clavier visible.
- ✅ **#6 affordance « best lap »** : `underline decoration-dotted` désormais **permanent**
  (plus seulement au survol) + `cursor-pointer`, sur Dashboard et Sessions.
- 🟠 **#5 tooltips (partiel)** : `title` natifs remplacés par le helper `Tip` (Radix, déjà câblé
  via `TooltipProvider`) + `aria-label` sur les boutons d'action des tableaux Dashboard + Sessions.
  Reste ~50 `title=` ailleurs (Live, SessionDetail, Setups…) à migrer plus tard.
- ℹ️ Chaîne « Voir le graphe de tours » encore en dur (pré-existant, non i18n) — à externaliser
  avec la suite de #5.
- ✅ Build OK (`vite build`, 10,7 s) · ESLint OK.
- 📋 Prochaine étape : cohérence (#8-11) ou finir #5 (migration `title→Tip`).

### 2026-06-05 — Accessibilité : plancher typographique (tâche #3)

- 🐛 De nombreux libellés/badges en `text-[9px]` — sous le seuil de lisibilité confortable.
- ✅ **20 occurrences** (8 fichiers : `Dashboard`, `Profile`, `Sessions`, `SessionDetail`,
  `Setups`, `SetupDetail`, `LapChartModal`, `TierBadge`) relevées de `text-[9px]` → `text-[10px]`.
- ✅ Nettoyage : commentaire orphelin retiré dans `Profile.tsx` (décrivait l'ancien `CLASS_COLORS`).
- ↩️ **Régression corrigée** : le 10 px ajoutait du **scroll latéral** au tableau Sessions
  (auto-layout). Deux micro-données denses **internes au tableau** re-passées à 9 px (exemptées
  du plancher, comme les couleurs data-viz) : `TierBadge` (colonne Tier, partagé) + cellule
  Version. Largeur d'origine restaurée, gain d'accessibilité conservé partout ailleurs.
- ↩️ **Scroll Sessions (suite)** : reverts insuffisants → padding horizontal de **toutes** les
  cellules du tableau Sessions resserré `px-2` → `px-1` via sélecteur `[&_th]:px-1 [&_td]:px-1`
  sur `<Table>` (l'emporte sur les `px-2` par spécificité, sans impacter les autres pages).
  ~128 px récupérés. Scroll résolu.
- ✅ Build OK (`vite build`, 10,0 s puis 10,5 s) · ESLint OK.
- 📋 Prochaine étape : tâches usabilité (#4-7) ou cohérence (#8-11) de la critique design.

### 2026-06-05 — Design : unification des couleurs de classe (tâche #2)

- 🐛 **3 sources** de couleurs de classe : `CAR_CLASS_COLORS`/`CAR_CLASS_SOLID_COLORS`
  (`staticData`, canoniques) + 2 copies inline `CLASS_COLORS` (`Dashboard.tsx`, `Profile.tsx`)
  pour les `fill` recharts. Divergence réelle : `LMP2_ELMS` = `#60a5fa` (Dashboard) vs `#3b82f6`
  (Profile + canonique).
- ✅ **Source unique** : nouveau helper `classChartColor(carClass, fallback?)` dans
  `staticData.ts`, dérivé de `CAR_CLASS_SOLID_COLORS[x].background`.
- ✅ Copies inline supprimées : `Dashboard.tsx` (graphe « Records par classe ») et `Profile.tsx`
  (camembert sessions + barres records) utilisent désormais `classChartColor()`. Fallbacks
  d'origine préservés (`var(--color-chart-1)` / `var(--color-primary)`).
- ↪️ **Changement visuel mineur** : dans le graphe Dashboard, `LMP2_ELMS` passe de `#60a5fa` à
  `#3b82f6` (aligné sur la source canonique + Profile).
- ✅ Build OK (`vite build`, 8,6 s) · ESLint 0 warning (fichiers modifiés).
- 📋 Prochaine étape : tâche #3 (plancher typo ≥ 10-11 px).

### 2026-06-05 — Accessibilité : contraste de l'orange primaire (AA)

- 🐛 Texte blanc sur `--color-primary` `#FF4A0F` = **3.37:1** → échec WCAG AA (texte normal
  exige 4.5:1). Touchait les `Button` par défaut, `TableTitle` et `text-primary` sur fond clair.
- ✅ **Fix `index.css`** : `--color-primary`, `--color-ring` et `--color-accent-foreground`
  (clair + sombre) passés de `#FF4A0F` à **`#D93B00`** → blanc/orange ≈ **4.6:1** (AA OK),
  orange-rouge « racing » conservé. Keyframe `pulse-glow` aligné sur le nouveau ton.
- ↪️ **Volontairement conservés vifs** : `--color-tier-alien` et `--color-chart-1` (`#FF4A0F`) —
  data-viz (remplissages larges), pas de texte par-dessus, vibrance souhaitée.
- ✅ Build OK (`vite build`, 10,6 s).
- 📋 Prochaine étape : tâches #2 (unifier les couleurs de classe — 3 sources) et #3
  (plancher typo ≥ 10-11 px) de la critique design.

### 2026-06-03 (suite 22) — Live : fix « usure pneus critique » en boucle

- 🐛 `vTyreWear` se répétait en boucle : alerte à `< 20 %` mais **réarmement à `≥ 30 %`** →
  un pneu en fin de relais oscille dans la zone 20-30 % (bruit télémétrie) → fire/rearm/fire…
- ✅ **Fix `useVoiceCallouts` (`Live.tsx`)** : suppression du réarmement à 30 %. Le flag
  `tyreWarned` n'est ré-armé **que quand les pneus redeviennent frais** (`minWear ≥ 50 %`,
  détecté en même temps que `tyreSeenFresh` = passage aux stands). L'alerte ne se répète donc
  qu'après un vrai changement de pneus.
- ✅ Build OK (`tsc -b` + `vite build`), ESLint 0 warning.

### 2026-06-03 (suite 21) — Spotter : arrondi du temps restant (7:14 → « 7 » et non « 8 »)

- 🐛 Le temps restant parlé (Statut + commande Restant) utilisait `Math.ceil((end_et −
  session_time)/60)` → 7 min 14 (≈ 7,23) annoncé « 8 minutes ».
- ✅ **Fix `spotter.ts`** : `Math.ceil` → `Math.round` (au plus proche) dans `buildStatus`
  et `buildAnswer`. 7:14 → « 7 minutes restantes ». Build + lint OK.

### 2026-06-03 (suite 20) — Live : fix faux « dernière minute » au départ

- 🐛 `vLastMinute` / `vTimeRemaining` pouvaient se déclencher au départ : `session_time`/
  `end_et` peuvent rester sur des valeurs résiduelles de la session précédente au tout début
  (le warm-up 6 s ne suffit pas toujours) → `remaining = end_et - session_time` ≤ 60 fugace
  alors que `end_et > session_time` → faux « dernière minute ».
- ✅ **Fix `useVoiceCallouts` (`Live.tsx`)** : le bloc temps restant exige désormais aussi
  `player.total_laps >= 1` (cohérent avec le bloc ravitaillement). Les vraies annonces de fin
  de course arrivent toujours bien après le 1er tour → aucun impact légitime.
- ✅ Build OK (`tsc -b` + `vite build`), ESLint 0 warning.

### 2026-06-03 (suite 19) — Live : fix faux « moins d'une seconde devant » au départ

- 🐛 `vGapAhead` se déclenchait encore au départ : le bloc était gardé seulement par
  `warmedUp` (le fix `racing` n'avait été appliqué qu'au « sous attaque »). Sur la grille et
  pendant tout le 1er tour, le peloton est collé < 1 s même au vert → faux positif.
- ✅ **Fix `useVoiceCallouts` (`Live.tsx`)** : garde commune `gapsReady = warmedUp &&
  player.total_laps >= 1` pour les **deux** annonces d'écart (devant `vGapAhead` + derrière
  `vUnderAttack`). Plus rien tant qu'un tour complet n'est pas bouclé (peloton étiré) ; un
  écart < 1 s redevient alors un vrai événement.
- ✅ Build OK (`tsc -b` + `vite build`), ESLint 0 warning.

### 2026-06-03 (suite 18) — Détail course : compaction des cards « Infos pilote » / « Paramètres session »

- 🐛 Les 2 info-cards en haut de `SessionDetail` prenaient ~la moitié de la page.
- ✅ **Compaction** (`SessionDetail.tsx`) : grille `grid-cols-2 sm:grid-cols-3` →
  `grid-cols-3 sm:grid-cols-4` (moins de lignes), espacements `gap-x-4 gap-y-3` →
  `gap-x-3 gap-y-1.5`, `CardContent` `p-4` → `p-3`. `InfoBlock` : valeur en `text-xs
  leading-tight`, `mt-0.5` retiré → blocs nettement plus bas. Hauteur ~÷2.
- ✅ Build OK (`tsc -b` + `vite build`), ESLint 0 warning.

### 2026-06-03 (suite 17) — Nouvelle voiture : ADESS AD25 (LMP3)

- ✅ Ajout de **ADESS AD25** (catégorie `lmp3`) dans `public/data/cars.json`
  (keywords `["adess", "ad25"]`). JSON validé. Suite à une MAJ du jeu.
- ⏳ **Logo manquant** : déposer `public/logos/adess.png` puis ajouter
  `"adess": "adess.png"` dans la section `brands` de `cars.json`. Tant qu'absent,
  `CarLogo` n'affiche rien (pas d'image cassée).
- ✅ **Toyota « TR010 »** (constat XML : `Toyota TR010` apparue le 06-04, à côté de
  `Toyota GR010`). **Décision utilisateur : voitures distinctes** (pas une coquille, pas un
  renommage à fusionner). Nouvelle entrée catalogue `Toyota TR010` (hyper, keyword
  `"toyota tr010"`) — propre option dans le menu setup + logo/catégorie. La GR010 garde son
  seul keyword. Aucune normalisation indexeur (les 2 restent séparées en stats, voulu).
- ✅ **Ferrari 296 LMGT3 Evo** (MAJ V1.3.3, vue dans les XML du 06-04) : entrée catalogue
  séparée (gt3, keyword `"ferrari 296 evo"`), distincte de `Ferrari 296 LMGT3`. Confirmé via
  notes de patch (Evo-spec LMGT3). **Total catalogue : 36 voitures.**

### 2026-06-03 (suite 16) — Titres de tableaux en casse normale + fix menu voiture (nouveau setup)

- ✅ **Titres de tableaux non capitalisés** : `TableTitle` (barres colorées Sessions/Records)
  forçait `uppercase` alors que les titres `<h3>` de Setups sont en casse normale → incohérence.
  `uppercase` retiré des 2 variantes de `TableTitle` (le fond coloré suffit à signaler un titre).
  Les en-têtes de colonnes restent en majuscules (cohérents entre eux).
- 🐛 **Menu voiture vide dans « Nouveau setup »** : `NewSetupDialog` lit `getCachedLmuCars()`
  (sync), mais `preloadStaticData()` ne chargeait que le JSON brut sans remplir le cache mappé
  `_cachedLmuCars` (rempli uniquement par l'async `getLmuCars()`, jamais appelé) → menu toujours
  vide. **Fix `preloadStaticData`** : appelle aussi `getLmuCars()`/`getLmuCircuits()` (données
  brutes déjà en cache → pas de fetch supplémentaire) pour renseigner les caches sync.
- ✅ Build OK (`tsc -b` + `vite build`), ESLint 0 warning.

### 2026-06-03 (suite 15) — Uniformisation des tableaux (structurelle)

- ✅ **Tous les tableaux passent par les primitives shadcn** (`ui/table.tsx` :
  `Table/TableHeader/TableBody/TableHead/TableRow/TableCell`). Fin du double système
  (primitives vs `<table>` brut). `cn` = `twMerge` → les paddings denses (`px-2 py-1`)
  écrasent proprement le `p-3` par défaut → **apparence préservée**.
- ✅ **`SortHeader` partagé** : extrait de `Sessions.tsx` (local `SortHead`) vers `ui/table.tsx`
  (générique, exporté). Sessions l'importe (`SortHeader as SortHead`).
- ✅ **Migrés** : `Dashboard` (best-laps dense : colgroup/table-fixed/colSpan/teintes
  conservés, en-tête `<tbody>` → `TableHeader`), `Setups` (×3), `SetupCompare` (cellules sans
  padding → `py-2` ajouté pour garder la hauteur), `Live` (classement : **en-tête ambre**
  préservé en neutralisant les défauts dorés via `[&_tr]`/`[&_th]`), `LapChartModal` (×2 :
  en-têtes gris neutralisés ; la **table sticky** garde un `<table>` brut — le wrapper de
  `<Table>` casserait le `position: sticky` — mais utilise les sous-composants partagés).
- ✅ **Inchangés** : `Records`, `SessionDetail` (déjà sur les primitives).
- ✅ **Vérifs** : `tsc -b` + `vite build` OK, **ESLint 0 warning**. Grep : plus aucun
  `<table>/<th>/<td>` hors `ui/table.tsx` (sauf la table sticky LapChartModal, volontaire).
- 📋 **À valider visuellement** (point sensible) : Dashboard, Sessions (tri + cellules-filtres),
  Records, SessionDetail, Setups + comparaison, Live, LapChartModal — vérifier qu'aucun rendu
  ne bouge. Deltas connus négligeables : en-tête Dashboard `border-primary/40 → /30`, dark bg
  `/15 → /10` ; lignes d'en-tête désormais avec hover `bg-muted/40` (cohérent avec
  Sessions/Records).
- ✅ Point ouvert « unification des tableaux » (revue 2026-06-02) : **résolu**.

### 2026-06-03 (suite 14) — Config voix : badges d'état dans les titres + commandes en chips

- ✅ **Badges d'état déplacés dans les en-têtes de section** (visibles même replié) :
  « ✓ Piper actif » → titre « Réglages des annonces » (à droite) ; « ✓ Reconnaissance vocale
  active » → titre « Réglages du spotter ». Indicateurs internes retirés.
- ✅ **Commandes vocales plus lisibles** : la phrase muette est remplacée par des **chips**
  (un badge par commande : Statut, Écart, Carburant, Pneus, Position, Rythme, Restant, Météo,
  Répète, Silence), construites depuis `INTENTS` + labels `spotterCmd*` (forme courte avant
  la parenthèse). i18n `config.spotterCmdAvailable` (4 langues).
- ✅ **Icône Langue** : emoji 🌐 (couleurs fixes) remplacé par l'icône lucide `Globe`
  (hérite `text-muted-foreground`).
- ✅ Build OK (`tsc -b` + `vite build`), ESLint 0 warning.

### 2026-06-03 (suite 13) — Volume des annonces par défaut à 30 %

- ✅ **Défaut volume annonces = 0.3** (était 0.8) : `stores/app.ts` (état initial + fallback
  d'init), `voice.ts` (`speechVolume`), `radioFx.ts` (`masterVolume`). N'affecte que les
  installs sans `voice_volume` déjà persisté (sinon la valeur sauvegardée prime → ajuster au
  curseur). Build OK, ESLint 0 warning.

### 2026-06-03 (suite 12) — Voix FR par défaut = Pierre (upmc, locuteur 1)

- ✅ **Défaut FR = Pierre** : dans l'init du store, si aucune voix FR n'est explicitement
  choisie (`piperVoiceByLang.fr` absent), on injecte `fr_FR-upmc-medium` + locuteur `1`
  (Pierre). **Non persisté** (reste un défaut, le choix utilisateur prime) ; **repli auto
  sur `tom`** côté backend si `upmc` n'est pas installé. Nécessite donc `upmc` (fetch-piper.ps1).
- ✅ Build OK (`tsc -b` + `vite build`), ESLint 0 warning.

### 2026-06-03 (suite 11) — Voix Piper de test (script séparé hors release)

- ✅ **`scripts/fetch-piper-extra.ps1`** (NON lancé par la CI) : télécharge des voix FR
  supplémentaires **pour test local** dans `resources/tts/voices/` :
  - `fr_FR-miro-high` (HuggingFace `csukuangfj/vits-piper-fr_FR-miro-high`, locuteur unique,
    qualité high, ~63 Mo) ;
  - `fr_FR-tjiho-{tom1,tom2,next}` (`tjiho/French-tts-model-piper`) — ⚠️ **AGPL-3.0**, 3
    variantes d'un même locuteur, **test local uniquement** (à NE PAS distribuer).
- ℹ️ Garde-fou Git LFS (alerte si .onnx < 1 Mo). Aucune modif d'appli (scan dynamique du
  dossier voices/). La release officielle ne contient que les voix permissives (fetch-piper.ps1).
- ↩️ **Annulé** (même jour) : script `fetch-piper-extra.ps1` et voix de test (miro, tjiho)
  supprimés à la demande. Voix FR conservées : `tom`, `siwis`, `upmc` (Jessica/Pierre).

### 2026-06-03 (suite 10) — Config voix : liste à plat des locuteurs + section repliable

- ✅ **Locuteurs « à plat »** : plus de second menu « Locuteur ». Les voix multi-locuteur sont
  **éclatées directement dans la liste de voix** (ex. UPMC → entrées « Jessica » et « Pierre »).
  Encodage `id::speakerIndex` ; `onPiperVoiceChange` règle voix + locuteur d'un coup. Le label
  est le **(medium)** retiré côté backend (label = dataset seul).
- ✅ **Section « Annonces vocales » repliable** (comme le Spotter) : en-tête chevron
  « Réglages des annonces », repliée par défaut → Config plus compacte. i18n 4 langues
  (`config.voiceSettings`).
- ✅ Build OK (`tsc -b` + `vite build`), ESLint 0 warning.

### 2026-06-03 (suite 9) — Locuteurs nommés (menu déroulant au lieu d'un indice)

- 🐛 Le sélecteur de locuteur était un **champ numérique** (« indice 0 à 1 ») — cryptique,
  et acceptait des valeurs hors plage à l'affichage.
- ✅ **Backend `tts.rs`** : `read_meta` lit `speaker_id_map` → `PiperVoice.speakers` (noms
  ordonnés par id, vide si mono/non nommé). cargo check OK.
- ✅ **Config** : le champ numérique devient un **menu déroulant** listant les locuteurs par
  **nom** (ex. UPMC → « Jessica » / « Pierre »), repli « Locuteur N » si non nommés. Borné à
  la plage réelle. i18n 4 langues (`voiceSpeakerDesc` reformulé, `voiceSpeakerN`).
- ✅ **`fr_FR-upmc-medium` ajoutée** au script (2 locuteurs studio : Jessica id 0, Pierre id 1).
- ✅ Build OK (`tsc -b` + `vite build`), ESLint 0 warning, cargo check OK.
- 📋 `fetch-piper.ps1` (télécharge upmc) puis relancer (`npm run tauri:dev:stt`, recompile le
  backend) → voix `upmc` → menu Jessica/Pierre.

### 2026-06-03 (suite 8) — Effet radio : retour du « côté casque » (sans l'agressivité)

- ℹ️ Après le retrait de la distorsion (suite 6), l'effet manquait de grain « message au
  casque ». Rééquilibrage **sans** réintroduire le volume excessif :
  - **Bande passante voix resserrée** : highpass 300→380 Hz, lowpass 3000→2700 Hz, présence
    médium +3→+4 dB (à 1700 Hz) → timbre « comms » plus marqué (retire de l'énergie, pas de
    surcroît de volume).
  - **Lit de souffle/static réintroduit** sous la voix (`startStatic`, niveau bas 0.02,
    passe-bande ~1900 Hz + highpass 700 Hz), démarré avec la voix et coupé en fondu par
    `fadeStatic` (roger beep / interruption). C'est le principal indice « radio ».
- ✅ Build OK (`tsc -b` + `vite build`), ESLint 0 warning.
- ℹ️ Niveau du souffle réglable (`startStatic(..., 0.02)` dans `radioFx.ts`) si trop/pas assez.

### 2026-06-03 (suite 7) — Retrait définitif de MLS + fix « plus aucune voix »

- 🐛 **Plus aucune voix FR ne sortait** après avoir testé les locuteurs MLS : le réglage
  `piperSpeakerByLang` est mémorisé **par langue**, donc un `--speaker N` résiduel était
  passé aux voix **mono-locuteur** (tom/siwis) → Piper échouait (indice hors plage).
- ✅ **Fix `tts_synthesize`** : `--speaker` n'est appliqué **que si le modèle est
  multi-locuteur** (`num_speakers > 1`), avec clamp de l'indice. Un réglage résiduel est
  donc ignoré sans danger sur une voix mono-locuteur. cargo check OK.
- ✅ **MLS retiré définitivement** : ligne supprimée de `fetch-piper.ps1` + fichiers
  `fr_FR-mls-medium.onnx*` supprimés (resources + target). Voix FR restantes : `tom`, `siwis`.
- ℹ️ Le sélecteur de locuteur (suite 5) reste en place mais **dormant** (ne s'affiche que si
  une voix multi-locuteur est installée) — prêt si on en réajoute une un jour.
- 📋 **Relancer l'app** (`npm run tauri:dev:stt`) pour recompiler le backend → les voix FR
  refonctionnent.

### 2026-06-03 (suite 6) — Effet radio : voix trop forte/agressive (distorsion)

- 🐛 La voix paraissait **trop forte même en baissant le volume** : le `WaveShaper` de
  l'effet radio (`radioFx.ts`, `saturationCurve(0.35)`, k=22) **amplifiait les niveaux
  faibles** (~+15 dB) avant saturation → compression/distorsion qui maximisait le signal
  avant le gain maître. Le boost médium `+6 dB` accentuait.
- ✅ **Fix `radioVoiceChain`** : saturation **tanh douce** (`saturationCurve` réécrite,
  `drive` ≈ 1.2 — quasi transparente à bas niveau, pas de boost de volume) ; accent médium
  `+6 → +3 dB` ; léger retrait de sortie `out.gain 1 → 0.85`. La voix répond désormais
  correctement au curseur de volume et n'est plus agressive.
- ℹ️ Rappel : l'effet radio reste désactivable (Config → « Effet radio / stand ») pour une
  voix Piper 100 % propre.
- ✅ Build OK (`tsc -b` + `vite build`), ESLint 0 warning.

### 2026-06-03 (suite 5) — Piper : sélection du locuteur (modèles multi-locuteur, ex. MLS)

- ℹ️ La voix FR `mls` (LibriVox, 125 locuteurs) « marmonne » car l'app n'utilisait que le
  **locuteur 0** (médiocre). Retirée des fichiers installés ; conservée dans le script pour test.
- ✅ **Backend `tts.rs`** : `read_meta` lit `num_speakers` (`.onnx.json`), exposé par
  `tts_list_voices` (`PiperVoice.num_speakers`). `tts_synthesize` accepte `speaker_id` et
  passe `--speaker <id>` à Piper pour les modèles multi-locuteur. cargo check OK.
- ✅ **Frontend** : `voice.ts` (`preferredSpeakerByLang` + `configureVoice({ speakerByLang })`,
  `speakerId` dans l'invoke) ; store `piperSpeakerByLang` (persisté `piper_speakers`,
  `setPiperSpeaker`) ; Config : sélecteur **Locuteur** (input 0..N-1 + Test) affiché seulement
  si la voix Piper choisie est multi-locuteur (`num_speakers > 1`). i18n 4 langues
  (`config.voiceSpeaker`/`voiceSpeakerDesc`).
- ✅ Build OK (`tsc -b` + `vite build`), ESLint 0 warning, cargo check OK.
- 📋 **Pour tester** : re-`fetch-piper.ps1` (re-télécharge `mls`) → app → choisir la voix
  `fr_FR-mls-medium` → le sélecteur Locuteur apparaît → essayer des indices + ▶ pour trouver
  un bon locuteur. Si rien de convaincant, retirer la ligne `mls` du script.

### 2026-06-03 (suite 4) — Spotter : mode « Parler » hold / toggle configurable

- ✅ **Option hold/toggle** pour le push-to-talk : store `spotterPttMode` (`"hold"` défaut |
  `"toggle"`), persisté `spotter_ptt_mode`, setter `setSpotterPttMode`.
- ✅ **`useSpotter.ts`** : en mode **hold**, capture tant que la touche est tenue
  (Pressed→start, Released→stop) ; en mode **toggle**, un appui démarre, le suivant arrête
  (Released ignoré) avec **anti-rebond 500 ms** (l'OS peut ré-émettre `Pressed` si la touche
  est tenue). `pttMode` ajouté aux deps (réenregistre les raccourcis au changement).
- ✅ **Config** : sélecteur segmenté Maintenir / Bascule sous la touche PTT + description
  contextuelle. i18n 4 langues (`config.spotterPtt*`, 5 clés).
- ✅ Build OK (`tsc -b` + `vite build`), ESLint 0 erreur / 0 warning.

### 2026-06-03 (suite 3) — ESLint : résorption des 23 warnings (0 restant)

- ✅ **Imports / variables inutilisés** supprimés : `LapChartModal` (Legend, Dot, Gauge, Fuel),
  `updater` (relaunch), `Dashboard` (MapPin, COLS), `Profile` (BestLapRow), `Setups`
  (totalSetups ×2). `SessionDetail` : suppression de la fonction morte `exportCsv` (jamais appelée).
- ✅ **`any` (recharts) typés** (`LapChartModal`) : types `ChartRow` + `DotRenderProps` (payload
  tooltip + rendus `dot`) à la place des 3 `any`.
- ✅ **react-refresh/only-export-components** :
  - `button.tsx` / `badge.tsx` : `buttonVariants`/`badgeVariants` (utilisés seulement en interne)
    repassés en `const` non exportés → fichier « composant seul ».
  - `SessionBadge.tsx` : `sessionTypeLabel` (fonction non-composant) extraite dans
    `src/lib/sessionLabels.ts` ; imports recâblés (Dashboard, Sessions).
- ✅ **exhaustive-deps** : `App` (`init` ajouté aux deps, action de store stable) ; `Profile`
  (constantes `CLASS_ORDER`/`CLASS_COLORS` hissées hors composant) ; `Sessions` (`rows`) et
  `SetupDetail` (`sections`) enveloppés dans `useMemo` pour une référence stable.
- ✅ **`npm run lint` → 0 erreur, 0 warning** ; build OK (`tsc -b` + `vite build`).

### 2026-06-03 (suite 2) — Process de déploiement mis à jour (assets vocaux + feature stt)

- ℹ️ **Constat** : la CI `release.yml` ne fetchait **aucun** asset neuronal → les releases
  ne contenaient ni Piper ni Vosk (repli voix système / STT indisponible). Décision
  utilisateur : **tout embarquer** dans les releases officielles.
- ✅ **CI `release.yml`** : ajout du **cache des assets vocaux** (clé = hash des scripts de
  fetch) + steps `pwsh ./scripts/fetch-piper.ps1` et `./scripts/fetch-vosk.ps1` avant le
  build, et `args: --features stt --config src-tauri/tauri.stt.conf.json` passé à
  `tauri-action` → l'installeur officiel embarque désormais voix neuronale **et** commandes
  vocales.
- ✅ **Scripts npm** : `tauri:dev:stt` (`tauri dev --features stt`) et `tauri:build:stt`
  (`tauri build --features stt --config src-tauri/tauri.stt.conf.json`).
- ✅ **Docs** : `MAINTENANCE.md` §4 « Déploiement / Release » (procédure tag→CI, secret de
  signature, assets vocaux, feature `stt`, build local manuel) ; `README.md` section build
  (assets optionnels + `tauri:build` vs `tauri:build:stt`).
- 📋 **À vérifier au prochain tag** : que la CI windows-latest fetch bien les assets (réseau),
  que `libvosk.lib` se lie, et que l'installeur produit contient `libvosk.dll` + les 3 DLL
  MinGW à la racine + `stt/models/`.

### 2026-06-03 (suite) — Spotter Couche 2 : édition des commandes de reconnaissance

- ✅ **Liste/modification des commandes vocales** (calqué sur la perso des annonces
  `voiceMessages.ts` / `VoiceMessagesModal`) : `spotterCommands.ts` gagne un moteur
  d'overrides par langue (`initCommandOverrides`, `getPhrases`, `setCommandOverride`,
  `resetCommandOverride`, `resetAllCommandOverrides`, `isCommandOverridden`), persisté
  `spotter_commands` (JSON). `buildGrammar`/`matchIntent` utilisent désormais `getPhrases`
  (phrases perso si présentes, sinon défauts). Liste vide / identique au défaut = reset.
- ✅ **Modale `SpotterCommandsModal.tsx`** : 10 commandes, **phrases éditables** (une par
  ligne, textarea), reset par commande + tout réinitialiser, badge « modifié ». Édition de
  la **langue active**. Ouverte via un bouton dans la section Spotter (sous la touche PTT).
- ✅ **Bouton de test de reconnaissance** dans la modale : clic → capture micro
  (`mic.ts`) → `stt_recognize` sur la **grammaire courante** (brouillons commités d'abord)
  → affiche « Entendu : “…” → <commande> » ou « aucune commande reconnue » / « rien
  entendu ». Permet de valider le vocabulaire sans lancer une course. Repli message si STT
  indisponible (hors Tauri / sans feature `stt`). Micro libéré à la fermeture.
- ✅ **Store** : `initCommandOverrides(cfg.spotter_commands)` à l'init.
- ✅ **i18n** (4 langues) : `config.spotterCmd*` (titre/sous-titre/aide/reset + 10 libellés
  de commandes).
- ✅ **Build OK** (`tsc -b` + `vite build`), **ESLint 0 erreur**.

### 2026-06-03 — Spotter Couche 2 : reconnaissance vocale par commandes (push-to-talk Vosk)

- ✅ **Décisions** (validées) : moteur = **Vosk en sidecar** (offline, grammaire fermée) ;
  périmètre = **set de commandes complet**.
- ✅ **Backend** (`src-tauri/`) : dépendance `vosk = "0.3"` (Cargo.toml) + feature windows
  `Win32_System_LibraryLoader`. Nouveau module `commands/stt.rs` (calqué sur `tts.rs`) :
  `stt_available` (indicateur Config) + `stt_recognize(pcm_base64, lang, grammar)` →
  décode PCM 16 kHz Int16, modèle Vosk **caché** (`Box::leak` + `Mutex<HashMap>`),
  `Recognizer::new_with_grammar`, `final_result().single().text`. `SetDllDirectoryW` pour
  trouver `libvosk.dll` en dev. Enregistré dans `mod.rs` + `lib.rs`. `build.rs` : link-search
  vers `resources/stt/lib` + copie `libvosk.dll` à côté de l'exe de dev (chargement implicite).
  `tauri.conf.json` : `resources/stt/models` bundlé + `libvosk.dll` à la racine (prod).
  **`cargo check` OK** (vérifié avec placeholder ; 0 erreur).
- ✅ **Script `scripts/fetch-vosk.ps1`** (calqué sur `fetch-piper.ps1`) : télécharge libvosk
  Windows x64 + modèles `vosk-model-small-*` FR/EN/ES/DE → `resources/stt/` (gitignoré).
- ✅ **Frontend** : `src/lib/mic.ts` (capture `getUserMedia` + downsample 16 kHz mono Int16 +
  base64) ; `src/lib/spotterCommands.ts` (grammaire fermée par langue + `buildGrammar` +
  `matchIntent`, 10 intentions) ; `buildAnswer` ajouté à `src/lib/spotter.ts` (réutilise les
  calculs de `buildStatus` : écart, carburant, pneus, position, rythme, restant, météo) ;
  `useSpotter.ts` étendu (raccourci PTT **Pressed→capture / Released→reco→réponse**, repli
  Statut). Store : `spotterKeyTalk` (défaut `Alt+T`) persisté `spotter_key_talk`. Config :
  `ShortcutCapture` PTT + indicateur `stt_available` + liste des commandes.
- ✅ **i18n** (4 langues) : `config.spotterTalk*` (5 clés) + réponses `live.sp*` (spNoData,
  spGapLeader, spDelta, spTyres/Wear/Temp, spWeatherDry/Rain).
- ✅ **Build OK** (`tsc -b` + `vite build`), **ESLint 0 erreur** (23 warnings préexistants).
- ✅ **`vosk` mis derrière une feature Cargo `stt` (OFF par défaut)** pour ne pas casser le
  build sans les assets : dépendance `optional = true` + `[features] stt = ["dep:vosk"]`,
  module/handlers gated `#[cfg(feature = "stt")]`, `setup_vosk()` no-op si `CARGO_FEATURE_STT`
  absent, ressources de bundle STT déplacées dans un overlay `src-tauri/tauri.stt.conf.json`.
  **Vérifié** : `cargo check` (défaut) **et** `cargo check --features stt` passent tous deux.
- 📋 **Prochaine étape** : `pwsh scripts/fetch-vosk.ps1` (télécharge lib + modèles ; vérifier
  que `libvosk.lib` est présent, sinon le générer — cf. en-tête du script), puis lancer avec
  la feature : `npm run tauri dev -- --features stt --config src-tauri/tauri.stt.conf.json`, puis
  `npm run tauri:dev` → Config → activer le Spotter → vérifier « ✓ Reconnaissance vocale
  active ». En course : maintenir `Alt+T`, dire « écart / carburant / pneus / position /
  rythme / restant / météo / statut » ; relâcher sans parler → repli Statut ; « répète » /
  « silence ». Vérifier que `Alt+T` ne rentre pas en conflit avec un bind LMU et la 1ʳᵉ
  demande d'accès micro WebView2. Ajuster la grammaire (`spotterCommands.ts`) si des
  commandes sont mal reconnues. CI : exposer `resources/stt/lib` au linker pour le build release.

### 2026-06-02 (suite 19) — Live : halo vert temporaire (top départ)

- 🐛 Le halo vert restait affiché toute la phase verte (le drapeau reste « green »).
- ✅ **`FlagOverlay` (`Live.tsx`)** : le halo vert n'est plus permanent — il apparaît au
  passage au vert puis **s'estompe après `GREEN_HALO_MS` (5 s)** avec un fondu sortant
  d'1 s (état interne + `setTimeout`). Re-déclenché à chaque (re)départ (FCY → vert).
  Les drapeaux de prudence (jaune/FCY/rouge) restent clignotants tant qu'ils sont actifs.
- ✅ Build OK (`tsc -b`), ESLint propre.

### 2026-06-02 (suite 18) — Spotter : message « Statut » enrichi

- ✅ **`buildStatus` (`src/lib/spotter.ts`)** étoffé en résumé de course ordonné :
  position · (aux stands) · dernier tour · **meilleur tour** · écart devant ·
  **écart au poursuivant** · **tours/temps restants** · carburant. Chaque clause
  n'apparaît que si la donnée existe ; les écarts sont **omis aux stands**.
- ✅ **i18n** (4 langues) : `live.spBest`, `spGapBehind`, `spLapsLeft_one/_other`
  (pluriel), `spTimeLeft`, `spInPits`.
- ✅ Build OK (`tsc -b`), ESLint propre.

### 2026-06-02 (suite 17) — Live : silence des annonces position/écart/chronos aux stands

- 🐛 Annonces parasites **aux stands** (voiture ralentie / à l'arrêt → positions, écarts
  et chronos distordus) : « moins d'une seconde devant » (`vGapAhead`), « sous attaque »
  (`vUnderAttack`), mais aussi place gagnée/perdue, prise de tête, podium, écart au
  leader, chronos de tour (in-lap/out-lap) et delta prédictif.
- ✅ **Fix `useVoiceCallouts` (`Live.tsx`)** : garde unique `inPits` (`playerStanding.in_pits`)
  calculée en tête du bloc joueur, appliquée à toutes ces annonces. Aux stands → silence
  sur tout ce qui dépend de la position/du rythme ; **conservé** : drapeaux, pénalité,
  carburant, pneus froids, surchauffes/crevaison/dégâts, météo, temps restant, meilleur
  temps de la session, et annonces pit (demande/limiteur/arrêt effectué).
  - Les **baselines** (`prevPos`, `prevSector`, `prevLaps`, `prevBest`…) continuent de se
    mettre à jour pendant l'arrêt → pas de faux déclenchement à la sortie. `gapAheadWarned`/
    `underAttackWarned` réarmés aux stands.
- ✅ Build OK (`tsc -b`), ESLint propre.

### 2026-06-02 (suite 16) — Live : fix fausse annonce « place gagnée » au départ

- 🐛 **« P1, place gagnée » en partant en pole** (et autres faux positifs au départ) :
  `prevPos` n'était **pas réinitialisé** dans le bloc `sessionReset` → il gardait la
  position finale de la session précédente (ex. P5). La 1ʳᵉ frame de la nouvelle session
  (pole, P1) donnait `1 ≠ 5` → fausse « place gagnée ». De plus la grille / le tour de
  formation réordonnent les positions avant le vrai départ.
- ✅ **Fix `useVoiceCallouts` (`Live.tsx`)** :
  - `prevPos.current = player.position` ajouté au `sessionReset` (baseline = grille).
  - Annonces **place gagnée / perdue** et **entrée podium** conditionnées à `warmedUp`
    **et** `racing` (drapeau vert ou ≥ 1 tour) → plus de bruit sur la grille/formation.
  - `racing` calculé une seule fois en tête du bloc joueur (suppression du doublon).
- ✅ Build OK (`tsc -b`), ESLint propre.
- 📋 **Prochaine étape** : valider en course (départ pole → silence ; vrai dépassement
  après le vert → annonce correcte).

### 2026-06-02 (suite 15) — Spotter Couche 1 : raccourcis globaux Statut / Mute / Répète

- ✅ **Backend** : ajout du plugin `tauri-plugin-global-shortcut = "2"` (Cargo.toml),
  enregistré dans `lib.rs` ; permissions `global-shortcut:allow-register/unregister/
  unregister-all/is-registered` dans `capabilities/default.json`. `cargo check` OK.
- ✅ **Frontend** : npm `@tauri-apps/plugin-global-shortcut`. Nouveau module
  `src/lib/spotter.ts` (`buildStatus` : phrase parlée position · dernier tour · écart
  au pilote devant · autonomie carburant, n'inclut que les clauses dont la donnée
  existe). Hook `src/lib/useSpotter.ts` monté **une seule fois dans App.tsx** :
  enregistre les 3 raccourcis si l'option est active, lit la langue/`t` courants via
  refs (pas de réenregistrement), libère proprement au démontage.
  - **Statut** → `live.getData()` (lecture mémoire partagée à la demande, indépendante
    du polling) → `announce()`.
  - **Mute** → bascule `voiceAnnouncements` ; silence immédiat à la coupure (le silence
    = confirmation, évite la course avec `useVoiceCallouts` qui re-coupe), confirmation
    parlée à la réactivation.
  - **Répète** → `repeatLast()` (rejoue la dernière annonce, callout auto **ou** spotter ;
    repli sur le Statut s'il n'y a rien à répéter).
- ✅ **voice.ts** : nouvelle fonction `announce()` (interrompt tout + joue maintenant en
  critique, sans dédup — une « question » mérite une réponse immédiate), mémorisation du
  dernier texte (`lastSpokenText`) pour `repeatLast()`. `previewVoice` réécrit sur `announce`.
- ✅ **Store + Config** : prefs `spotterEnabled` + 3 accélérateurs (défauts `Alt+S/M/R`),
  persistés (`spotter_enabled`, `spotter_key_*`). Section « Spotter (raccourcis vocaux) »
  en Config avec composant `ShortcutCapture` (clic → capture de la combinaison).
- ✅ **i18n** (4 langues) : `live.sp*` (8 phrases) + `config.spotter*` (10 clés).
- ✅ Build OK (`tsc -b`, `cargo check`), ESLint 0 erreur.
- 📋 **Prochaine étape** : tester en course (`npm run tauri:dev` → Config → activer le
  Spotter → en jeu, presser Alt+S/M/R). Si concluant, étendre la **variante « boutons
  radio »** (1 touche/question : écart, carburant, pneus, position, rythme, restant,
  météo — déjà calculables depuis `LiveData`), puis attaquer la **Couche 2** (push-to-talk
  Vosk/SAPI). Vérifier que `Alt+S/M/R` n'entrent pas en conflit avec des binds LMU.

### 2026-06-02 (suite 14) — Cadrage « parler au spotter » (commandes vocales) — note SUIVI

- ✅ **Point ouvert §7 affiné** : cible retenue pour « parler au spotter » = **push-to-talk +
  reconnaissance par commandes (grammaire fermée)** avec **repli touche→statut**. Couche 1 (MVP
  touches Statut/Mute/Répète, sans STT) ; couche 2 (Vosk sidecar grammaire-contrainte, ou SAPI
  Windows). Vocabulaire + réponses mappés sur `LiveData`. **Aucun code écrit** — feuille de route
  uniquement.
- 📋 **Prochaine étape** (quand relancé) : implémenter d'abord la **Couche 1** (raccourci global
  `tauri-plugin-global-shortcut` → annonce « Statut » via voix Piper + données Live), puis évaluer
  Vosk vs SAPI pour la Couche 2.

### 2026-06-02 (suite 13) — Piper : plusieurs voix par langue (sélecteur)

- ✅ **Backend multi-voix** (`tts.rs`) : `voice_files()` scanne tous les `voices/*.onnx`,
  `read_meta()` lit langue + libellé (`dataset (quality)`) depuis `<model>.onnx.json`,
  `resolve_model(lang, voice_id)` (voix explicite → défaut `<lang>.onnx` → 1ʳᵉ de la langue).
  Nouvelle commande `tts_list_voices` ; `tts_synthesize` accepte `voice_id`. cargo check OK.
- ✅ **Frontend** : store `piperVoiceByLang` (persisté `piper_voices` JSON), `setPiperVoice`,
  `configureVoice({ piperByLang })`, `voice.ts` passe `voiceId` à l'invoke. Config : sélecteur
  de voix **conditionnel au moteur** (voix Piper installées de la langue quand moteur = Piper,
  sinon voix système). Message « aucune voix système » limité au moteur système.
- ✅ **Assets** : `fetch-piper.ps1` télécharge **9 voix** sur 4 langues — EN `ryan`/`alan`,
  FR `tom`/`gilles`(H) + `siwis`(F), ES `davefx`/`claude` (MX), DE `thorsten`/`eva_k`. Toutes
  vérifiées (codes langue + dataset OK). Ajouter une voix = 1 ligne dans le script, zéro code.
- ✅ Build OK (`tsc -b`, `cargo check`), parité i18n inchangée.
- 📋 Pour entendre : `npm run tauri:dev` → Config → Moteur Piper → sélecteur de voix
  (tom/siwis en FR, ryan/alan en EN) → ▶. Ajouter d'autres voix = lignes dans `fetch-piper.ps1`.

### 2026-06-02 (suite 12) — Volume des annonces + tutoiement FR + lot de traductions

- ✅ **Volume des annonces** : gain maître dans `radioFx.ts` (`masterGain`, `setMasterVolume`,
  `audioOutput()`) par lequel passent voix Piper + bips ; `voice.ts` `configureVoice({ volume })`
  (et `u.volume` pour la voix système). Store `voiceVolume` (0–1, défaut 0.8) persisté
  `voice_volume`. Curseur **Volume des annonces** en Config (sous Vitesse) + i18n 4 langues.
  → permet de baisser le son et l'équilibrer avec le jeu.
- ✅ **Tutoiement FR** : conversion vouvoiement → tutoiement (`vFastestYou` « Tu signes… »,
  onboarding/plugin/sessions « Vérifie / Lance / Sélectionne / ton dossier… », `you` « Toi »,
  `legendYourRow/Car` « Ta… »).
- ✅ **Lot de traductions** (oublis EN, recommandé) : FR (Dernier tour, Meilleur tour,
  Carburant, Tour/tours, Réglages voiture, Total réglages, Échauffement), ES (Reglajes del
  coche, Total reglajes, Calentamiento, En línea), DE (Begrenzer, Aufwärmen). Jargon conservé.
- ✅ Build OK (`tsc -b`), parité i18n OK (1032 clés).
- 📋 **Question ouverte** : compatibilité SimHub de la page Live (cf. réponse) — piste retenue
  possible : fenêtre **overlay transparente always-on-top** (Tauri) plutôt qu'un portage
  dashboard SimHub (techno différente).

### 2026-06-02 (suite 11) — Piper : repli silencieux en dev + indicateur d'état

- 🐛 **« Même voix Piper/Système »** = Piper jamais atteint, repli systématique. En
  dev, `resource_dir()` ne pointe pas vers `src-tauri/resources/tts` → binaire
  introuvable → repli Web Speech (silencieux).
- ✅ **Fix `piper_paths` (`tts.rs`)** : cherche d'abord les ressources bundlées,
  puis un **repli dev** `env!("CARGO_MANIFEST_DIR")/resources/tts`. Fonctionne donc
  en `tauri dev` ET en build. cargo check OK.
- ✅ **Indicateur d'état (`Config.tsx`)** : appel `tts_available(lang)` → affiche
  sous le sélecteur de moteur « ✓ Piper actif » (vert) ou « ⚠ Piper indisponible →
  repli voix système » (ambre, avec rappel : lancer tauri:dev / fetch-piper.ps1).
  i18n 4 langues (`config.voiceEngineActive/Fallback`).
- ⚠️ **Rappel** : Piper nécessite l'**app desktop** (`npm run tauri:dev`) — le
  serveur web `npm run dev` n'a pas de backend Rust → toujours repli système.
- ✅ Build OK (`tsc -b`, `cargo check`).

### 2026-06-02 (suite 10) — Config : Maintenance + À propos empilés (équilibrage colonnes)

- ✅ **Réagencement Config** (`Config.tsx`) : le bloc « À propos » (auparavant en
  pleine largeur sous la grille) est désormais **empilé sous « Maintenance »** dans
  une colonne `flex flex-col gap-4`, placée à droite de « Préférences ». La grille
  reste `lg:grid-cols-2` → la colonne droite (Maintenance + À propos) remplit la
  hauteur du bloc « Préférences » (devenu grand avec les réglages voix).
- ✅ Le **correctif warm-up** (fausses annonces « sous attaque » / « dernière
  minute » au départ) était **déjà appliqué** (cf. suite 9) — rien à refaire.
- ✅ Build OK (`tsc -b`). Changement frontend pur (HMR), aucun impact ailleurs.

### 2026-06-02 (suite 9) — Moteur TTS neuronal embarqué (Piper) + vrai filtre radio + fix départ

- ✅ **Backend Piper** (`src-tauri/src/commands/tts.rs`, sans nouvelle dépendance) :
  - `tts_synthesize(text, lang, rate)` lance `piper.exe` (ressource bundlée) via
    `std::process::Command`, texte sur stdin, WAV temporaire → **base64**.
    `length_scale = 1/rate`. `tts_available(lang)` pour le repli/UI.
  - Enregistré dans `lib.rs` ; `mod.rs` ; `tauri.conf.json` → `bundle.resources`
    ajoute `resources/tts`. base64 maison (zéro dep). **cargo check OK**.
- ✅ **Assets** : `scripts/fetch-piper.ps1` (ASCII, robuste) télécharge Piper Windows
  + voix HuggingFace (EN `en_US-ryan-medium`, FR `fr_FR-tom-medium`) dans
  `src-tauri/resources/tts/` (gitignoré). **Testé** : synthèse FR OK (RTF 0.08).
- ✅ **Pipeline audio frontend** (`src/lib/voice.ts`) refondu : file **async** jouant
  des **AudioBuffer** (Piper via `invoke` → base64 → `decodeAudioData`) avec
  abstraction `Playback` (Web Speech *ou* buffer), interruption critique
  (`source.stop()`), garde de génération (annulation pendant synthèse),
  `piperUnavailable` (anti-boucle). **Repli automatique Web Speech** si moteur
  système, hors Tauri, ou échec Piper.
- ✅ **Vrai filtre radio** (`src/lib/radioFx.ts` `radioVoiceChain`) : passe-bande
  300–3000 Hz + accent médium + saturation douce (WaveShaper), branché sur la voix
  Piper (possible car l'audio passe enfin par Web Audio). Bips/roger beep conservés.
- ✅ **Config + store** : `voiceEngine` ("piper"/"system", défaut piper), persisté
  `voice_engine`, sélecteur Moteur en Config. i18n 4 langues (`config.voiceEngine*`).
- ✅ **Fix fausses annonces au départ** : `warmedUp` étendu aux blocs **rivaux**
  (`vGapAhead`/`vUnderAttack`/`vGapLeader`) — « sous attaque » exige aussi vert OU
  ≥ 1 tour — et **temps restant** (`vTimeRemaining`/`vLastMinute`, garde
  `end_et > session_time`). Refs rivaux réinitialisées au `sessionReset`.
- ✅ Build OK (`tsc -b`, `vite build`, `cargo check`).
- 📋 **Prochaine étape** : lancer `npm run tauri:dev` (recompile le backend avec la
  commande TTS) → Config → Moteur Piper → ▶ : voix neuronale filtrée radio.
  Ajuster voix FR (`fr_FR-tom-medium`) si le timbre ne plaît pas (var en tête du
  script). ES/DE : ajouter 2 voix + relancer le fetch.

### 2026-06-02 (suite 8) — Voix par langue + mise en place d'ESLint

- ✅ **Voix de synthèse liée à la langue active** : la voix préférée est désormais mémorisée **par langue** (`voiceUriByLang`, persistée en JSON dans `voice_uri`). `voice.ts` (`preferredByLang` + `configureVoice({ voiceByLang })`, `pickVoice` indexé par langue), `stores/app.ts` (`setVoiceUri(lang, uri)` + parse JSON, ancien format string ignoré), `Config.tsx` (sélecteur sur la langue courante). Une voix FR n'est plus employée pour un texte EN. i18n `voiceVoiceDesc` précisé (4 langues). **Sans impact visuel.**
- ✅ **ESLint configuré** (config plate ESLint 9) : `eslint.config.js` (js + typescript-eslint + react-hooks + react-refresh, `any`/unused en `warn`, `_` ignoré), devDeps installées, script `npm run lint`. **0 erreur, 23 warnings** (imports/vars inutilisés, exhaustive-deps, quelques `any` recharts, 3 react-refresh UI) — informatifs, ne bloquent pas.
- ✅ Build OK (`tsc -b`).
- 📋 **Restant** : résorber les 23 warnings ESLint (sans risque visuel : surtout suppressions d'imports inutilisés) ; unification des tableaux (visuelle, en attente d'accord).

### 2026-06-02 (suite 7) — Revue de code : type `Tr` partagé (sans impact visuel)

- ✅ **Type `Tr` centralisé** dans `src/i18n/index.ts` (`export type Tr`). Suppression des définitions **dupliquées** (`Live.tsx`, `SessionDetail.tsx`) et des `t: any` (`Live.tsx`, `LapChartModal.tsx`) + directives `eslint-disable` associées. Changement **purement de typage** : aucun rendu modifié.
- ✅ Build OK (`tsc -b`).
- 📋 **Restant de la revue** : unification des tableaux (shadcn vs `<table>`) — **non fait volontairement** car change l'apparence ; ESLint ; voix liée à la langue active.

### 2026-06-02 (suite 6) — Revue de code : nettoyage « quick wins »

- ✅ **i18n « Relais » codé en dur corrigé** : `Sessions.tsx` (`FinishCell`, ajout du hook `useTranslation`) et `Dashboard.tsx` (`DashboardRow`) utilisent désormais `t("sessions.statusDriverSwap")` (clé qui existait mais n'était pas utilisée). Plus de français affiché en EN/ES/DE pour le statut « Driver Swap ».
- ✅ **Logs de debug retirés** : 6 `console.log`/`console.error` dans `ohne_speed.ts::fetchBenchmarks`.
- ✅ **Code mort supprimé** : `utils.ts` (`formatLapTime`, `formatDelta`, `formatSectorTime`, `formatDuration`, `dateFromFileName`), `voiceMessages.ts` (`isOverridden`), `radioFx.ts` (`radioEnabled`).
- ✅ **Design modales** : `SetupDetail` passe de `z-40` (= niveau du Header) à `z-50` ; opacité de fond uniformisée à `bg-black/60` (Config confirm, NewSetupDialog, SetupDetail) — cohérent avec LapChartModal/VoiceMessagesModal.
- ✅ Build OK (`tsc -b`).
- 📋 **Restant de la revue** (chantiers de fond, non traités) : unifier les deux systèmes de tableaux (shadcn `Table` vs `<table>` brut) et leurs en-têtes ; configurer ESLint ; voix de synthèse liée à la langue active ; type `Tr` partagé.

### 2026-06-02 (suite 5) — Live : priorités vocales harmonisées + bouton on/off dans le bandeau

- ✅ **Priorités revues (`useVoiceCallouts`)** selon une règle claire :
  - **critical** (interrompt) = événements soudains/sécurité : jaune/FCY/rouge, carburant bas, crevaison, roue arrachée, surchauffe freins, surchauffe moteur (flag), pénalité, gros dégâts.
  - **normal** = changements d'état importants : drapeau vert, pneus froids, **usure** (était critical), surchauffe pneus, **temp eau/huile** (était critical), états stands (demande/sortie/effectué), drapeau bleu, dernier tour, temps restant, **dernière minute** (était critical), pluie (début/fin/intensifie), ravitaillement, prise de tête, podium, sous attaque.
  - **chatty** (abandonnable) = infos/stats : positions, chronos, mi-course, meilleur temps, écarts (devant/leader), secteurs (perso/violet), delta.
  - Drapeaux : priorité **par drapeau** (vert = normal, jaune/FCY/rouge = critical) au lieu de tout en critical.
- ✅ **Bouton on/off dans le bandeau Live** (sous-composant `Dashboard`) : icône `Volume2`/`VolumeX` (avant le bouton thème), bascule `voiceAnnouncements` (store), couleur primary si actif. Tooltip `live.voiceOn`/`voiceOff`.
- ✅ **i18n** (4 langues) : `live.voiceOn` / `live.voiceOff`.
- ✅ Build OK (`tsc -b`).

### 2026-06-02 (suite 4) — Live : fausses alertes au départ de course (warm-up + reset)

- 🐛 **Annonces incohérentes au démarrage** (« usure pneus critique », etc.) : au départ (grille/formation) la télémétrie n'est pas stabilisée → seuils déclenchés à tort ; de plus plusieurs `useRef` d'alerte (`tyreSeenFresh`, `tyreWarned`, `fuelBucket`, `prevDamage`, surchauffes…) **n'étaient pas réinitialisés** entre deux courses → état périmé qui « fuit ».
- ✅ **Fix `useVoiceCallouts` (`Live.tsx`)** :
  - **Détection de (re)démarrage** `sessionReset` (1er passage, chute de `total_laps`, ou chute de `session_time`/mCurrentET) → **reset complet** de toutes les refs d'alerte télémétrie au même endroit.
  - **Warm-up** `WARMUP_MS = 6000` : les alertes de **seuil** (carburant, usure, surchauffe moteur, dégâts, pneus/freins/eau-huile, crevaison/roue) sont **suspendues 6 s** après chaque (re)démarrage, le temps que la télémétrie se stabilise.
  - Les annonces **événementielles** (drapeaux, positions, chronos, écarts) ne sont pas affectées. « Pneus froids » reste actif au départ (comportement voulu).
- ✅ Build OK (`tsc -b`).
- 📋 **Prochaine étape** : valider en course (plus de fausse « usure critique » au feu vert ; les vraies alertes arrivent après ~6 s). Ajuster `WARMUP_MS` si besoin.

### 2026-06-02 (suite 3) — Live : 21 nouvelles annonces vocales (basées plugin)

- ✅ **Vérification source** : tous les nouveaux messages reposent sur des champs **réellement alimentés par le plugin** (audit de `src-tauri/src/commands/live.rs`). En particulier, **demande d'arrêt aux stands** = `player.pit_state == 1` (enum rF2 : 1=REQUEST), déjà exposé — aucun changement backend.
- ✅ **+21 callouts dans `useVoiceCallouts` (`Live.tsx`)**, tous aux transitions/seuils avec réarmement :
  - **Rivaux** : prise de tête (`position==1`), entrée podium (P2/P3), < 1 s sur le pilote devant (`time_behind_next`), sous attaque (écart de la voiture derrière), écart au leader (par tour).
  - **Secteurs** : meilleur secteur perso (`last_sectors` vs `best_sectors`), secteur violet (`is_class_best_sN`), delta prédictif échantillonné au **changement de secteur** (`lap_delta`, |Δ|≥0.1 — bride le bruit).
  - **Pneus/mécanique** : crevaison (`wheel.flat`), roue arrachée (`wheel.detached`), surchauffe pneus (`temp>115`), freins (`brake_temp>700`), eau/huile (`water>110`/`oil>140`).
  - **Stands** : **demande d'arrêt** (`pit_state==1`), arrêt effectué (`num_pitstops`↑, réarme l'alerte ravitaillement).
  - **Course** : drapeau bleu (`player.flag==6` — ⚠️ valeur à confirmer en piste), temps restant 10/5 min + dernière minute (`end_et − session_time`).
  - **Météo/carburant** : pluie qui s'intensifie (`rain>0.5`), ravitaillement nécessaire (`computeFuelToFinish` > 0).
  - Toutes les nouvelles réfs réinitialisées sur changement de session (+ baseline au 1er passage, `prevLaps<0`).
- ✅ **Modale** : 3 nouvelles catégories (`rivals`, `sectors`, `mech`) + icônes ; les 21 messages sont **éditables/testables** (catalogue `voiceMessages.ts`).
- ✅ **i18n** (4 langues) : 21 textes `live.v*`, 3 `vmCat*`, 21 légendes `vmWhen.*`.
- ✅ Build OK (`tsc -b`).
- 📋 **Prochaine étape** : valider en course — surtout **drapeau bleu** (ajuster `BLUE_FLAG` si faux positifs/négatifs) et seuils surchauffe (pneus/freins/eau) selon les voitures. Vérifier que le delta au secteur n'est pas trop bavard (sinon le passer en priorité plus basse ou réduire la fréquence).

### 2026-06-02 (suite 2) — Live : effet « radio d'équipe / stand » sur les annonces

- ℹ️ **Contrainte** : la Web Speech API ne passe pas par le graphe Web Audio → on ne peut pas filtrer la voix TTS elle-même. Approche retenue (comme CrewChief) : **ambiance radio générée en Web Audio autour de la voix** (la voix reste normale, le cerveau associe bips + souffle = talkie).
- ✅ **Module `src/lib/radioFx.ts`** (oscillateurs + bruit blanc filtré, aucun fichier, hors-ligne) :
  - **Début de transmission** : clic de squelch (bouffée de bruit passe-bande) + **bip d'ouverture** + lit de **souffle/static** en fondu sous la voix.
  - **Fin** : **« roger beep »** double + fondu sortant du souffle.
  - `radioInterrupt()` coupe le souffle sans roger beep quand une annonce critique en interrompt une autre. `cancelRadio()` pour la coupure totale. AudioContext paresseux + `resume()` (politique autoplay).
- ✅ **`voice.ts`** : `radioStart()` juste avant `speak()`, `radioEnd()` dans le `done` (onend/onerror), `radioInterrupt()` dans la branche d'interruption, `cancelRadio()` dans `cancelSpeech()`. `previewVoice()` (bouton Tester) couvert aussi.
- ✅ **Réglage Config** : interrupteur « Effet radio / stand » sous la vitesse de parole (défaut **on**), persisté `voice_radio`, `setRadioEnabled()` à l'init et au toggle.
- ✅ **i18n** (4 langues) : `config.voiceRadio` / `voiceRadioDesc`.
- ✅ Build OK (`tsc -b`).
- 📋 **Prochaine étape** : tester à l'oreille (bouton Tester de la Config, puis en course) ; ajuster `STATIC_LEVEL` / fréquences des bips si le souffle couvre trop la voix. Approche B possible si réalisme accru voulu : TTS rendu en buffer (SAPI Rust→WAV ou API) puis passe-bande/compression/crackle sur la voix elle-même.

### 2026-06-02 (suite) — Live : modale de personnalisation des annonces vocales

- ✅ **Catalogue + moteur d'overrides `src/lib/voiceMessages.ts`** : 21 annonces réparties en 10 catégories (drapeaux, carburant, pneus, positions, chronos, incidents, stands, course, météo, meilleur temps). Chaque entrée porte ses `{{variables}}` obligatoires + valeurs d'exemple pour le test.
  - Personnalisation injectée dans i18next via `i18n.addResource("live.vXxx", …)` → les `t()` de `Live.tsx` renvoient le texte custom **sans changement de code**, interpolation comprise.
  - Overrides **persistés par langue** (`voice_overrides` JSON : `{ fr: {...} }`) pour ne jamais prononcer un texte FR dans une session EN. Édition de la **langue active uniquement** (décision). Texte vide/identique au défaut = réinitialisation.
  - API : `initVoiceOverrides` (au boot), `getMessageText`, `setMessageOverride`, `resetMessageOverride`, `resetAllOverrides`, `fillVars`, `missingVars`.
- ✅ **Modale `src/components/VoiceMessagesModal.tsx`** : liste par catégorie (icône + libellé), champ éditable par message, bouton **▶ Tester** (voix/vitesse de la config, variables remplies par des exemples), **Réinitialiser** par ligne + **Tout réinitialiser**. Badge « modifié », rappel des variables, avertissement rouge si une `{{var}}` est supprimée. Fermeture Échap / clic hors zone, persistance des brouillons à la fermeture.
- ✅ **Config** : bouton « Personnaliser » sous les réglages voix (visible si annonces activées) ouvrant la modale.
- ✅ **Store `app.ts`** : `initVoiceOverrides(cfg.voice_overrides)` à l'init.
- ✅ **i18n** (4 langues) : `live.vmTitle/vmSubtitle/vmOpen/vmTest/vmReset/vmResetAll/vmModified/vmVarMissing`, `live.vmCat*` (10 catégories), `live.vmWhen.*` (21 déclencheurs).
- ✅ Build OK (`tsc -b`).
- 📋 **Prochaine étape** : tester la modale (édition d'un message → ▶ restitue le texte custom ; vérifier qu'en course `Live.tsx` prononce bien la version personnalisée ; Réinitialiser revient au défaut). Pistes « fun » non retenues pour l'instant : presets thématiques (ingénieur F1 / copilote rallye / sarcastique), édition par langue.

### 2026-06-02 — Live : qualité des annonces vocales (timbre + diffusion + réglages)

- ✅ **Module dédié `src/lib/voice.ts`** : extraction de toute la logique vocale (auparavant locale à `Live.tsx`), partagée avec `Config.tsx`.
  - **Timbre** : `voiceScore()` privilégie les **voix neuronales** « Natural / Neural / Online » exposées par WebView2/Edge (+4), puis locale (+1, pas de latence réseau), puis masculine (+2) / non-féminine (+1). `pickVoice()` remplace `pickMaleVoice()`. On **ne dégrade plus le pitch** des voix neuronales (`pitch = 1` ; `0.92` seulement pour les voix robotiques). `volume = 1`.
  - **Diffusion** : file d'attente à **priorité + fraîcheur** (`speak(text, lang, priority)`). 3 niveaux : `critical` (drapeaux, pénalité, carburant, usure, surchauffe, dégâts) interrompt les annonces moins prioritaires en cours ; `normal` ; `chatty` (positions, chronos, mi-course, meilleur temps). Les callouts **périmés sont abandonnés** (TTL 12/7/4 s) au lieu d'empiler du retard. Dé-duplication par texte. `cancelSpeech()` / `previewVoice()`.
- ✅ **`Live.tsx`** : suppression du bloc vocal local, import depuis `@/lib/voice`, priorité annotée sur chaque appel `speak()`.
- ✅ **Réglages en Config** (`Config.tsx`) : sous le toggle « Annonces vocales », sélecteur de **voix** (option Auto + voix de la langue, tag « naturelle »), bouton **Tester** (`previewVoice`), curseur **vitesse de parole** (0.6–1.6×). Liste rechargée sur `voiceschanged` + changement de langue. Message d'aide si aucune voix installée.
- ✅ **Store `app.ts`** : `voiceUri` / `voiceRate` persistés (`voice_uri` / `voice_rate`), `configureVoice()` appelé à l'init et aux setters.
- ✅ **i18n** (4 langues) : `config.voiceVoice/voiceVoiceDesc/voiceAuto/voiceNaturalTag/voiceTest/voiceTestPhrase/voiceNoneFound/voiceRate`.
- ✅ Build OK (`tsc -b`).
- 📋 **Prochaine étape** : tester en course — vérifier qu'une voix « Natural » est bien retenue (sinon installer les voix naturelles Windows 11), que les annonces critiques coupent les bavardes, et que le bouton Tester restitue la voix/vitesse choisies.

### 2026-06-01 (suite 16) — Live : voix masculine pour les annonces

- ✅ **Voix homme** (`speak`, `src/routes/Live.tsx`) : sélection d'une voix masculine via `speechSynthesis.getVoices()` filtrée par langue, heuristique sur les noms (`MALE_VOICE_HINTS` / évite `FEMALE_VOICE_HINTS`). Cache `cachedVoices` rafraîchi sur l'événement `voiceschanged`. `u.pitch = 0.9` (légèrement plus grave). Fallback : 1ʳᵉ voix de la langue, puis 1ʳᵉ dispo.
- ✅ Build OK (`tsc -b`).
- 📋 **Note** : les voix dépendent de l'OS (Windows fournit p. ex. « Microsoft Paul » fr, « David » en). Si aucune voix homme n'est installée pour la langue, on prend la moins « féminine » disponible.

### 2026-06-01 (suite 15) — Live : fix fausse alerte usure au démarrage + annonce « pneus froids »

- 🐛 **« Usure pneus critique » au démarrage** : la télémétrie pneus n'est pas stabilisée au tout début → usure lue transitoirement basse → fausse alerte.
- ✅ **Fix `useVoiceCallouts`** : l'alerte d'usure (`vTyreWear`) ne se déclenche désormais qu'**après avoir vu des pneus neufs** (`tyreSeenFresh`, min usure ≥ 50 % observé au moins une fois). Plus de faux positif au démarrage.
- ✅ **Nouvelle annonce « pneus froids »** (`vColdTyres`) : au départ / sortie de stands, si la température min des 4 pneus (valeurs plausibles 0–250 °C) < 50 °C → « Attention, pneus froids ». Réarmée quand les pneus chauffent (≥ 65 °C), donc re-annoncée après un changement de gomme. Ref `coldWarned` (reset au changement de session).
- ✅ **i18n** (4 langues) : `live.vColdTyres`.
- ✅ Build OK (`tsc -b`).

### 2026-06-01 (suite 14) — Live : annonce vocale « limiteur » à la sortie des stands

- ✅ **Rappel limiteur en sortie de stands** (`useVoiceCallouts`, `src/routes/Live.tsx`) : à la transition `player.pit_state → 4` (sortie de la voie des stands), annonce `vPitExitLimiter`. Ref `prevPitState`.
- ✅ **i18n** (4 langues) : `live.vPitExitLimiter` (FR « Sortie des stands, attention au limiteur »).
- ✅ Build OK (`tsc -b`).

### 2026-06-01 (suite 13) — Live : annonce vocale du détenteur du meilleur temps

- ✅ **Meilleur temps de la session** (`useVoiceCallouts`, `src/routes/Live.tsx`) : à chaque amélioration du meilleur tour absolu (min des `best_lap_time` du classement), annonce du détenteur — `vFastest` (« Meilleur temps de la session par {{driver}}, {{time}} ») ou `vFastestYou` si c'est le joueur. Ref `prevFastest` (reset au changement de session). Temps parlé via `fmtLapVoice`.
- ✅ **i18n** (4 langues) : `live.vFastest`, `live.vFastestYou`.
- ✅ Build OK (`tsc -b`).

### 2026-06-01 (suite 12) — Live : annonces vocales étendues (4 catégories)

- ✅ **Toutes les annonces demandées ajoutées** dans `useVoiceCallouts` (`src/routes/Live.tsx`), aux transitions uniquement, localisées :
  - **Positions** : place gagnée (`vPosGain`) / perdue (`vPosLoss`) au changement de `player.position`.
  - **Chronos** : à chaque tour bouclé (`total_laps` ↑ + `last_lap_time > 0`) → meilleur tour perso (`vBestLap`, si `best_lap_time` amélioré) sinon dernier tour (`vLastLap`), avec temps parlé `fmtLapVoice` (`vLapTime` / `vLapTimeShort`).
  - **Pénalités & alertes** : pénalité reçue (`vPenalty`, `num_penalties` ↑), surchauffe moteur (`vOverheat`, front montant `telemetry.overheating`), dégâts importants (`vDamage`, bond `damage_total` > 10).
  - **Course & météo** : dernier tour (`vFinalLap`, `total_laps == max_laps-1`), mi-course (`vHalfway`, `== max_laps/2`) pour les courses au tour ; début de pluie (`vRainStart`) / piste sèche (`vRainStop`) sur seuil `weather.rain > 0.1`.
  - Réinitialisation des suivis (`prevBest`, pénalités, flags dernier tour/mi-course) quand une nouvelle session démarre (`total_laps` repart sous le précédent).
- ✅ **i18n** (4 langues) : 13 nouvelles clés `live.v*` (vLapTime, vLapTimeShort, vPosGain, vPosLoss, vBestLap, vLastLap, vPenalty, vFinalLap, vHalfway, vOverheat, vDamage, vRainStart, vRainStop).
- ✅ Build OK (`tsc -b`).
- 📋 **Prochaine étape** : tester en course avec annonces activées (dépassements, fin de tour, pénalité, pluie). Ajuster les seuils (dégâts > 10, pluie > 0.1) si besoin.

### 2026-06-01 (suite 11) — Live : pause re-détectée (gel mCurrentET + hystérésis)

- 🐛 **La pause ne se détectait plus** : `mInRealtime` (suite 9) ne bascule PAS à 0 lors de la pause LMU (Échap) → aucune détection. La détection par gel de `mCurrentET` (suite 7) marchait mais clignotait.
- ✅ **Fix `src-tauri/src/commands/live.rs`** : retour à la détection par gel de `mCurrentET`, mais avec **hystérésis** anti-clignotement :
  - `PollState` : `last_et`, `frozen_frames`, `move_history` (registre à décalage 16 bits des frames où mCurrentET a bougé), `paused` (sticky).
  - **Entrée pause** : 40 frames (2 s) sans évolution de mCurrentET.
  - **Sortie pause** : ≥ 3 mouvements sur les 16 dernières frames (reprise *soutenue*) — un « tic » isolé du scoring (cause du clignotement précédent) ne suffit plus à sortir de la pause.
  - Reset des compteurs dans le retour anticipé « fin de session ».
- ✅ Build OK (`cargo check`).
- 📋 **Prochaine étape** : tester Échap en solo → pause stable (sans clignotement) ; reprise → dashboard en < 1 s.

### 2026-06-01 (suite 10) — Live : fix « Tour en cours » figé (3.18) au départ

- 🐛 **« Tour en cours » affichait une valeur résiduelle (~3.18) au départ de course** : `current_lap_time` utilisait `mTimeIntoLap` (rF2), peu fiable pour le joueur et qui conserve une valeur d'une session/tour précédent.
- ✅ **Fix `src-tauri/src/commands/live.rs`** : calcul canonique `current_et − m_lap_start_et` (temps écoulé depuis le début du tour courant), avec garde `m_lap_start_et > 0 && current_et > m_lap_start_et` (→ 0 pendant grille/formation, puis chrono correct dès le départ du tour).
- ✅ Build OK (`cargo check`).

### 2026-06-01 (suite 9) — Live : fix clignotement pause (mInRealtime) + annonces vocales activables

- 🐛 **Écran pause qui clignotait** : le détecteur de gel basé sur `mCurrentET` (suite 7) oscillait — le scoring est mis à jour par rafales (~5 Hz), donc le compteur de frames figées se réinitialisait par à-coups → allers-retours pause/dashboard toutes les ~1 s.
- ✅ **Fix `src-tauri/src/commands/live.rs`** : remplacement du détecteur de staleness par `scor_info.m_in_realtime` (mInRealtime) — booléen **stable** : 1 en piste, 0 en pause/menu/monitor/replay. Garde : `if m_in_realtime == 0 { paused }`. Suppression des champs `last_et` / `stale_frames` de `PollState`. Plus de bruit → plus de clignotement. Couvre aussi le cas « session quittée sans EndSession » (on sort du temps réel).
- ✅ **Annonces vocales activables** (demande : doublon avec CrewChief sinon) :
  - **Store `src/stores/app.ts`** : `voiceAnnouncements: boolean` (défaut `false`) + `setVoiceAnnouncements`, persisté via `config.set("voice_announcements", …)`, lu `=== "true"`.
  - **Config.tsx** : nouveau `ToggleRow` (icône `Volume2`) dans Préférences.
  - **Live.tsx** : helper `speak()` (Web Speech API, langue de l'app via map BCP-47) + hook `useVoiceCallouts(data, enabled, lang, t)`. Annonce **aux transitions uniquement** : changements de drapeau (vert/jaune/FCY/rouge), seuils carburant (3/2/1 tours d'autonomie), usure pneus < 20 % (réarmé après changement ≥ 30 %). Annulé quand désactivé. Câblé dans `Live()`.
  - **i18n** (4 langues) : `config.voiceAnnounce/Desc/Tip` + phrases parlées `live.vFlagGreen/vFlagYellow/vFlagFcy/vFlagStopped/vFuelLaps/vTyreWear`.
- ✅ Build OK (`cargo check`, `tsc -b`).
- 📋 **Prochaine étape** : tester la pause (Échap solo → écran « Jeu en pause » stable, sans clignotement ; reprise → dashboard). Tester les annonces vocales activées (sortie jaune, carburant bas). NB : après le drapeau à damier, l'écran « pause/arrêté » peut apparaître (sorti du temps réel) — comportement accepté (« arrêté »).

### 2026-06-01 (suite 8) — Live : carburant « pour finir » (inspiré de lmu-pitwall)

- ✅ **Analyse comparée de [lmu-pitwall](https://github.com/Swizzjack/lmu-pitwall)** : idées retenues comme pistes (carburant pour finir, conso médiane hors outlap, écarts relatifs, trace des entrées, annonces vocales). L'utilisateur a choisi d'implémenter **le carburant « pour finir »**.
- ✅ **Backend `src-tauri/src/commands/live.rs`** : exposition de `LiveSession.end_et` (`mEndET`) pour gérer les courses au temps (endurance) en plus des courses au nombre de tours.
- ✅ **Type `src/lib/api.ts`** : `LiveSession.end_et` ajouté.
- ✅ **Frontend `src/routes/Live.tsx`** — helper `computeFuelToFinish(sc, player, tel)` :
  - tours restants = `max_laps - tours joueur` (course au tour) ; sinon estimés via `(end_et - session_time) / temps au tour` (+1 tour entamé au drapeau) pour les courses au temps ;
  - carburant nécessaire = tours restants × conso moyenne ; à ajouter = nécessaire − réservoir.
  - Composant `FuelToFinishKV` : `+X.X L` rouge (ravitaillement requis) ou `✓ X.X L` vert (surplus). Tooltip détaillé (tours restants + litres nécessaires).
  - Affiché dans le panneau Carburant (onglet Télémétrie, grille 3→4 colonnes) ET dans la vue d'ensemble (bandeau carburant).
- ✅ **i18n** (4 langues) : `live.lFuelToFinish`, `live.fuelNeededFor`.
- ✅ Build OK (`cargo check`, `tsc -b`).
- 📋 **Prochaine étape** : valider en course (au tour ET au temps). Autres pistes pitwall dispo si souhaité : conso médiane hors outlap, écarts relatifs, trace des entrées, annonces vocales.

### 2026-06-01 (suite 7) — Live : détecteur de gel (plan B) → écran « Jeu en pause ou arrêté »

- ✅ **Détecteur de gel** (`src-tauri/src/commands/live.rs`) en complément de `m_session_started` : `PollState` mémorise `last_et` + `stale_frames`. Si `mCurrentET` n'évolue plus pendant **40 frames × 50 ms = 2 s** alors qu'une session semble active → `LiveData { paused: true }`. Couvre la pause solo ET le cas où le plugin ne remet pas `m_session_started` à 0 en quittant. Seuil large car le scoring n'est rafraîchi qu'à ~5 Hz (plusieurs polls 50 ms peuvent voir la même valeur en fonctionnement normal). Compteurs remis à zéro quand la session redevient inactive.
- ✅ **Nouveau champ `LiveData.paused`** (Rust + `src/lib/api.ts`).
- ✅ **Frontend `src/routes/Live.tsx`** : nouvel `InfoScreen` kind `"paused"` (icône `PauseCircle`, accent primary) inséré entre `no-game` et `no-session` dans la logique de rendu (`if (paused) return <InfoScreen kind="paused" …>`).
- ✅ **i18n** (4 langues) : `live.infoPausedTitle` / `live.infoPausedText` (FR « Jeu en pause ou arrêté », EN/ES/DE équivalents).
- ✅ Build OK (`cargo check`, `tsc -b`).
- 📋 **Prochaine étape** : tester pause solo (Échap) → écran « Jeu en pause » après ~2 s ; reprise → retour dashboard. Et quitter une course → écran pause/arrêt si `m_session_started` ne bascule pas.

### 2026-06-01 (suite 6) — Live : fin de session fiable via Extended.m_session_started

- 🐛 **Stats toujours affichées après avoir quitté la partie** (récidive) : en revenant aux menus, LMU **fige** le buffer Scoring avec les dernières valeurs — `mCurrentET` reste > 0 et `mNumVehicles` > 0. Les gardes `n == 0 || current_et <= 0` (entrée suite 2) ne se déclenchent donc jamais → le dashboard restait visible avec des stats périmées.
- ✅ **Fix `src-tauri/src/commands/live.rs`** : détection de fin de session via la map **Extended**, champ `m_session_started`. Le plugin shared-memory met ce flag à `0` dans son callback `EndSession` (quitter une session), même quand Scoring reste figé. Lecture brute (sans filtre de version) pour ce flag ; `ext_buf` filtré `version_ok` conservé uniquement pour la lecture fine (physics/dégâts). Garde finale : `session_started == Some(0) || n == 0 || current_et <= 0.0`.
- ✅ Build OK (`cargo check`).
- 📋 **Prochaine étape** : valider en réel (course → quitter vers menu → le dashboard doit basculer sur « Aucune session » en < 1 s). Si `m_session_started` ne suffit pas sur ce build de plugin, fallback envisageable : détecteur de staleness (mCurrentET inchangé sur N frames) avec seuil tolérant à la pause offline.

### 2026-06-01 (suite 5) — Live : halo « drapeau » clignotant + bouton thème + circuit centré

- ✅ **Halo drapeau clignotant** (`src/routes/Live.tsx` — composant `FlagOverlay`) : overlay `fixed inset-0 z-50 pointer-events-none` couvrant toute la page Live (tous onglets), avec `box-shadow inset` de la couleur du drapeau en cours. Jaune / FCY (`#eab308`) et rouge/stoppé (`#ef4444`) → clignotement via nouvelle animation CSS `animate-flag-blink` (`@keyframes flag-blink`, 0.85 s). Vert (`#22c55e`) → halo discret fixe (`opacity-40`). Aucun / damier → rien. N'interfère pas avec les clics.
- ✅ **`src/index.css`** : ajout `@keyframes flag-blink` + classe `.animate-flag-blink`.
- ✅ **Bouton bascule de thème** ajouté dans le bandeau Live, juste avant « Plein écran » (icône Soleil/Lune, hook `useTheme` partagé avec le Header).
- ✅ **Circuit centré** : le bloc circuit+drapeau est désormais la section centrale du bandeau (`justify-between` 3 sections : stats gauche · circuit centre · drapeau/météo/actions droite).
- ✅ Build OK (`tsc -b`).
- 📋 **Prochaine étape** : valider en course réelle (sortie FCY/jaune/rouge déclenche bien le clignotement de la bonne couleur).

### 2026-06-01 (suite 4) — Live : circuit + drapeau dans le bandeau supérieur

- ✅ **Nom du circuit + drapeau** ajoutés en tête du bandeau supérieur du dashboard Live (`src/routes/Live.tsx`), avant le bloc Position. Utilise `<TrackFlag track={sc.track} />` (même composant que Sessions/Records/Dashboard) + le nom du circuit en gras. Bloc affiché seulement si `sc.track` est renseigné.
- ✅ **i18n** : clé `live.statTrack` ajoutée dans les 4 langues (FR « Circuit », EN « Track », ES « Circuito », DE « Strecke »).
- ✅ Build OK (`tsc -b`).

### 2026-06-01 (suite 3) — Live : couleurs du classement (cohérence app)

- ✅ **Classement Live colorisé** (`src/routes/Live.tsx` — `StandingsTable`), adapté à la palette de l'app :
  - **Colonne Classe** : `<ClassBadge>` coloré (réutilise `CAR_CLASS_COLORS` / `CAR_CLASS_LABELS`) au lieu du texte gris brut. Nouveau helper `liveClassKey()` normalise le nom de classe brut rF2 (« LMGT3 », « P2 », « LMH »…) vers la clé interne (Hypercar / LMP2_WEC / LMP3 / GT3 / GTE).
  - **Liseré gauche par classe** : chaque ligne reçoit un `box-shadow inset 3px` de la couleur de sa classe → regroupement visuel rapide en course multi-classes.
  - **Couleurs podium** : P1 or (`text-yellow-400`), P2 argent (`text-slate-300`), P3 bronze (`text-amber-600`) sur la position au général (`podiumColor()`).
  - **En-tête ambré** : `bg-amber-500/15 text-amber-700 dark:text-amber-200 border-y border-amber-500/40` — aligné sur les en-têtes de tableaux du reste de l'app (Dashboard/Sessions/Records).
  - Conserve les surlignages existants : joueur (`bg-primary/10`), stands (opacité), meilleurs tour/secteurs de classe (violet).
- ✅ Build OK (`tsc -b`).
- 📋 **Prochaine étape** : vérifier le rendu en course réelle (mapping des noms de classe rF2 — ajuster `liveClassKey()` si une classe LMU n'est pas reconnue).

### 2026-06-01 (suite 2) — Live : fin de session détectée + carte 2D plein écran sans débordement

- 🐛 **Stats encore affichées après avoir quitté une session** : suite au retrait du gate `session_time > 0` côté frontend (entrée précédente), plus rien ne masquait le dashboard quand on revenait aux menus. Les champs `begin`/véhicules restent un instant en mémoire partagée alors que la session est finie.
- ✅ **Fix `src-tauri/src/commands/live.rs`** : restauration de la règle V1 (`telemetrie_dumper.py` `_snapshot`) **à la source** : session active ⟺ `n > 0` **ET** `m_current_et > 0`. Quand on quitte une session, `mCurrentET` retombe ≤ 0 → `session = null` → le frontend (`inSession = connected && !!session`) affiche « Aucune session en cours ». Plus fidèle V1 que le gate frontend retiré.
- 🐛 **Carte 2D débordait de la page** : la racine du dashboard Live était en `min-h-screen` → la page pouvait dépasser la hauteur du viewport (scroll), la carte carrée se retrouvait coupée.
- ✅ **Fix `src/routes/Live.tsx`** : racine passée en `h-screen overflow-hidden` (vrai plein écran pour un tableau de bord live). Les onglets à contenu long défilent en interne : `min-h-0 overflow-y-auto` ajouté sur Télémétrie, Classement et Vue d'ensemble. L'onglet Carte (`flex-1 min-h-0`) occupe pile l'espace restant → la carte tient toujours sans débordement.
- ✅ Build OK (`cargo check`, `tsc -b`).
- 📋 **Prochaine étape** : tester le cycle complet (menus → course → quitter → menus) et vérifier que la carte 2D tient sur toutes tailles de fenêtre.

### 2026-06-01 (suite) — Resync auto au focus + drapeau Imola (Autodromo Enzo e Dino Ferrari)

- 🐛 **Nouvelles sessions invisibles** : la sync delta ne tournait **qu'au démarrage** de l'app (`store.init()`). Si l'app restait ouverte pendant que l'utilisateur courait plusieurs sessions dans LMU, les nouveaux XML n'étaient pas indexés → il fallait déclencher manuellement une sync depuis la page Config.
- ✅ **`src/stores/app.ts` — nouvelle action `syncQuiet()`** : sync delta silencieuse (pas de spinner `indexing`), avec garde-fous : configuré + `autoIndex` actif + pas déjà en cours + anti-rebond 8 s (`_lastQuietSync`). Ne rafraîchit le dashboard que si `added + updated + removed > 0`.
- ✅ **`src/App.tsx`** : déclenchement de `syncQuiet()` sur `window.focus` et `document.visibilitychange` (retour `visible`). Ignoré sur la route `/live`. Listeners nettoyés au démontage. L'utilisateur qui revient sur l'app après une course voit ses nouvelles sessions sans action manuelle.
- 🐛 **Pas de drapeau pour « Autodromo Enzo e Dino Ferrari »** (Imola) : le matching de drapeau cherche un mot-clé dans le nom du circuit ; le nom officiel d'Imola ne contient pas « imola ».
- ✅ **`public/data/circuits.json`** : ajout des mots-clés `"enzo e dino"` et `"dino ferrari"` → `it` (drapeau `it.png` déjà présent).
- ✅ Build OK (`tsc -b`).
- 📋 **Prochaine étape** : tester le retour de focus (courir une session dans LMU app ouverte → revenir → la session apparaît). Vérifier le drapeau Imola.

### 2026-06-01 — Polish Sessions + fix page Live (dashboard masqué en course)

- ✅ **Sessions.tsx — fin de wrapping des lignes** : `whitespace-nowrap` ajouté sur la `TableCell` du type de partie (En ligne / Week-end). Les lignes ne passent plus sur deux lignes dans ce cas.
- ✅ **TierBadge.tsx — badges plus petits** : padding réduit `px-1.5 py-0.5 text-[10px]` → `px-1 py-px text-[9px]` pour s'intégrer sans encombrement dans la colonne NIVEAU du tableau Sessions.
- 🐛 **Live — dashboard masqué malgré partie active** : la condition `inSession` dans `Live.tsx` exigeait `session.session_time > 0` (`mCurrentET` de rF2). Or ce compteur peut rester à 0 pendant les phases de grille / formation / avant le feu vert. Le Rust garantit déjà que `session != null` ⟺ `begin != 0` ET `n_vehicles > 0` — la condition supplémentaire était redondante et trop stricte.
- ✅ **Fix `src/routes/Live.tsx`** : `inSession = connected && !!session` (suppression de `session.num_vehicles > 0 && session.session_time > 0`). Le dashboard s'affiche dès qu'une session Rust est présente, quel que soit le temps écoulé.
- 📋 **Prochaine étape** : tester la page Live avec LMU ouvert (menus → doit afficher « Aucune session » ; en course → doit afficher le dashboard dès le chargement de la grille).

### 2026-05-30 — ohne_speed : fix parsing CSV + HMR Vite + intégration complète

- 🐛 **Root cause 1 — mauvais indices de colonnes** : les indices aliens/competitive/good… étaient décalés (alien lu à `[3]` = hotlap au lieu de `[4]`) → tous les benchmarks renvoyaient des temps incohérents ou nuls.
- 🐛 **Root cause 2 — détection de classe incorrecte** : l'ancienne logique joinait les 4 premières cellules pour détecter l'en-tête — toujours faux pour les lignes lettrées espacées du CSV Google Sheets (ex. `L M G T 3`).
- 🐛 **Root cause 3 — parser CSV trop naïf** : `split(",")` cassait sur les cellules entre guillemets doubles (circuits contenant une virgule).
- ✅ **Réécriture complète de `parseCSV()` dans `ohne_speed.ts`** basée sur le projet de référence [lmu-analyzer](https://github.com/arminreiter/lmu-analyzer/) :
  - Détection de classe par `line.includes('L M G T 3')`, `'L M H'`, `'G T E'`, etc.
  - Identification des lignes de données : `cols[0].includes(currentClass)`.
  - Indices corrects : hotlap `[3]`, alien `[4]`, competitive `[5]`, good `[6]`, midpack `[8]`, tailEnder `[10]`, offline `[11]`, fastestCar `[12]`, fastestLap `[13]`.
  - Parser CSV complet avec gestion des guillemets doubles et des guillemets doublés.
- 🐛 **HMR Vite — boucle d'invalidation** : `TierBadge.tsx` exportait à la fois un composant React (`TierBadge`) et une constante plain-objet (`OHNE_CLASS`) — Vite Fast Refresh rejette les fichiers avec exports mixtes.
- ✅ **Fix HMR** : `OHNE_CLASS` déplacé dans `ohne_speed.ts` (déjà un module utilitaire). `TierBadge.tsx`, `Records.tsx` et `LapChartModal.tsx` mis à jour pour importer `OHNE_CLASS` depuis `@/lib/ohne_speed`.
- ✅ **Debug logging** ajouté dans `fetchBenchmarks` (longueur CSV, premier benchmark, nb total) pour faciliter le diagnostic en dev.
- ✅ **Résultat** : badges NIVEAU (Alien / Compétitif / Bon / Peloton / Fin de peloton / Hors rythme) s'affichent correctement dans Sessions, Records et la modale LapChart.
- 📋 **Prochaine étape** : polish Sessions (wrapping lignes, taille badges) — cf. entrée 2026-06-01.

### 2026-05-29 (suite) — Live : fix "Le jeu n'est pas lancé" quand jeu en menus

- 🐛 **Root cause** : `extract()` retournait `connected: false` dès que `version_ok()` échouait (`begin==0`). Or `begin==0` est l'état normal quand le jeu est dans les menus (plugin chargé, mais aucune session active n'a encore initialisé le compteur). L'utilisateur voyait "Le jeu n'est pas lancé" même avec LMU ouvert.
- ✅ **Fix `src-tauri/src/commands/live.rs` — `extract()`** : séparation de deux cas :
  - Map inexistante (`read_shm` retourne `None`) → `connected: false` = jeu non lancé ✓
  - Map accessible mais `version_ok` échoue → `connected: true, session: null` = jeu en menus → écran "Aucune session en cours" ✓
  - Map accessible + version ok → extraction normale ✓
- ✅ **Fix `is_sim_running()`** : utilise désormais `read_shm(...).is_some()` (présence de la map = jeu lancé), sans exiger `begin!=0`.
- 📋 **Prochaine étape** : tester avec le jeu ouvert dans les menus (doit afficher "Aucune session en cours"), puis entrer en session (doit afficher le dashboard).

### 2026-05-29 — Auto-updater NSIS : correctifs race condition + hook passif

- 🐛 **Bug root cause identifié** : `relaunch()` (Tauri) redémarrait l'ancien exe **avant** que NSIS ait remplacé les fichiers. L'utilisateur se retrouvait sur l'ancienne version après « Installer et redémarrer ».
- ✅ **Fix `src/lib/updater.ts`** : `await relaunch()` remplacé par `await exit(0)`. Chaîne correcte : `downloadAndInstall` lance `installer.exe /P /R /UPDATE` en process séparé → `exit(0)` ferme l'ancienne app proprement → NSIS installe → `onInstSuccess` voit le flag `/R` → relance la nouvelle app via `nsis_tauri_utils::RunAsUser`. (Commit `baee068` sur branche V2.)
- 🐛 **Second bug : `NSIS_HOOK_POSTINSTALL` s'affichait pendant les mises à jour** : la `MessageBox` du plugin Live Timing était visible en mode passif (`/P`) car NSIS ne supprime les dialogs qu'en mode **silencieux** (`/S`), pas passif. L'utilisateur voyait une popup « Installer le plugin ? » pendant chaque auto-update.
- ✅ **Fix `src-tauri/nsis/hooks.nsi`** : toute la section plugin Steam est wrappée dans `${If} $UpdateMode <> 1` + `$PassiveMode <> 1` + `${IfNot} ${Silent}`. Le nettoyage `Delete "$INSTDIR\rFactor2SharedMemoryMapPlugin64.dll"` reste inconditionnel.
- ✅ **Pipeline release** (`release.ps1`) : fonctionnel — bump version atomique (3 fichiers), build signé, génération `latest.json` (URL avec `.` au lieu d'espaces pour GitHub Assets), tag Git annoté sur branche V2, artefacts prêts.
- ⏳ **À tester** : builder la 1.0.6 avec ces deux correctifs, publier sur GitHub, vérifier que l'update depuis 1.0.5 → 1.0.6 installe correctement et relance la nouvelle version sans dialog intempestif.
- 📋 **Prochaine étape** : lancer `.\release.ps1` → choisir Patch (1.0.6) → tester le cycle update complet.

### 2026-05-28 (suite 12) — Intégration ohne_speed : toggle config + Sessions + SessionDetail + LapChartModal

- ✅ **Composant partagé `TierBadge.tsx`** (`src/components/`) : extrait de `Records.tsx`, export `TierBadge` + `OHNE_CLASS`. `TierBadge` accepte `lapSeconds: number | null` (vs `number` en V1). `Records.tsx` mis à jour pour utiliser ce composant partagé (suppression du code dupliqué).
- ✅ **Toggle global** dans `src/stores/app.ts` : champ `showOhneSpeed: boolean` (défaut `true`) + action `setShowOhneSpeed`. Persiste via `config.set("show_ohne_speed", ...)`. Lu depuis `cfg.show_ohne_speed !== "false"` au démarrage.
- ✅ **Config.tsx** : nouveau `ToggleRow` « Niveaux de rythme ohne_speed » dans la carte Préférences. Icône `BarChart2`. Désactiver masque toutes les intégrations.
- ✅ **Sessions.tsx** : colonne « Niveau » insérée après Best Lap (visible seulement si `showOhneSpeed`). Benchmarks chargés une fois au montage. Icône `WifiOff` sur l'en-tête de colonne si hors-ligne.
- ✅ **SessionDetail.tsx** : `TierBadge` affiché dans la ligne de sous-titre de l'en-tête (après la date, à côté du nom de voiture). Icône `WifiOff` ambrée si hors-ligne. Benchmarks chargés dans `SessionView`.
- ✅ **LapChartModal.tsx** : 
  - Nouvelle série `refAlien` (chip toggleable fuchsia `#d946ef`).
  - `alienPaceSeconds` calculé depuis `findBenchmark(benchmarks, track, ohneClass, track_course)` → `bm.racePaceMs.alien / 1000`.
  - `ReferenceLine` alien `👽` ajoutée (pointillés courts, position `insideBottomRight`).
  - Entrée dans la légende compacte.
  - Message `WifiOff` ambre discret dans les chips si hors-ligne.
- ✅ **i18n** (4 langues) : clés `config.ohneSpeed`, `config.ohneSpeedDesc`, `config.ohneSpeedOffline` · `sessions.colTier` · `lapChart.refAlien`, `lapChart.legendAlien`.
- 📋 **Prochaine étape** : tester en conditions réelles (rebuild Tauri) — vérifier que les benchmarks se chargent et que les tiers s'affichent correctement pour LMGT3/Monza et LMH/Le Mans.

### 2026-05-28 — SessionDetail : trophées meilleurs tours/secteurs, tooltips colonnes, analyse sessions coop

- ✅ **Réordonnancement des onglets** : « Comparaison pilotes » déplacé après « Meilleurs tours » (ordre : Résultat → Laps → Meilleurs → Comparaison → Stratégie → Incidents → Pénalités → Chat → Track Limits).
- ✅ **En-têtes EventListTab** : tableau des incidents/pénalités/chat converti de div+ul/li vers `<Table>/<TableHeader>` shadcn → couleurs d'en-têtes identiques aux autres onglets.
- ✅ **Meilleurs secteurs dans l'onglet Tours course** : surlignage violet pour les meilleurs secteurs (S1/S2/S3) globaux de session + par pilote. Légende mise à jour (7 entrées).
- ✅ **Traduction colonnes pneus** : FL/FR/RL/RR → AVG/AVD/ARG/ARD (FR), FL/FR/RL/RR (EN), DVI/DVD/TRI/TRD (ES), VL/VR/HL/HR (DE) via clés i18n `colTireFL/FR/RL/RR`.
- ✅ **Trophées meilleurs tours/secteurs** : icône 🏆 (`Trophy` lucide, `h-3 w-3`) sur le meilleur tour global et les meilleurs secteurs globaux dans LapsTab ET BestLapsTab. Deux niveaux : global session (trophy + couleur) / personnel pilote (couleur seule, sans trophy).
- ✅ **Constante `TOL = 0.0005`** : tolérance de comparaison flottante 0,5 ms (au lieu de 0,001 = 1 ms) pour éviter les faux positifs IEEE 754 (`105.141 - 105.140 = 0.0009999…`). Corrige le bug Ryan Cullen (deux tours surlignés comme meilleur temps).
- ✅ **BestLapsTab** : logique trophée ajoutée (manquait totalement) pour best_lap et best S1/S2/S3.
- ✅ **Tooltips sur toutes les colonnes** : nouveau composant `src/components/ui/tooltip.tsx` avec `<Tip>` shortcut (`@radix-ui/react-tooltip`). `TooltipProvider` ajouté dans `App.tsx`. 24 clés i18n `sessionDetail.colXxxTip` + 10 clés `setups.*Tip` dans les 4 langues (fr/en/es/de). Appliqué sur les 6 tableaux de SessionDetail et les 3 tableaux de Setups.tsx.
- ✅ **Analyse XML « coop »** (informationnelle, aucun code) : comparaison des fichiers XML de Samuel Pitchoule (coop) vs propres fichiers online/solo. Conclusion : `<Setting>Multiplayer</Setting>` = vrai online multijoueur (tous `isPlayer=1`, `PlayerControl`, `<ServerName>`, `<ClientFuelVisible>`). `<Setting>Race Weekend</Setting>` = solo vs IA ET sessions « coop » — structure identique, aucun marqueur XML distinctif pour le coop.
- ✅ Build OK (`tsc -b`).
- 📋 **Prochaine étape** : à définir par l'utilisateur. Pistes possibles : (1) détection du type de session online/offline dans l'UI basée sur `<Setting>` ; (2) autres améliorations visuelles ou fonctionnelles.

### 2026-05-28 (suite 11) — Graphe de tours (modal LapChartModal)

- ✅ **Backend — 2 nouvelles commandes** (`src-tauri/src/commands/session_detail.rs`) :
  - `get_lap_chart_data(session_id)` → `LapChartData` : tours du joueur (lap_num, position, lap_time, s1/s2/s3, fuel, fuel_used, fcompound, is_pit, is_valid) + record perso (MIN best_lap toutes sessions même circuit+voiture) + meilleur de classe (session courante).
  - `get_chart_compare_sessions(session_id)` → `Vec<ChartCompareSession>` : sessions compatibles (même voiture + circuit, triées par best_lap, max 30).
  - Enregistrées dans `lib.rs`.
- ✅ **Frontend — types** (`src/lib/api.ts`) : `ChartLapRow`, `LapChartData`, `ChartCompareSession` + méthodes `queries.getLapChartData`, `queries.getChartCompareSessions`.
- ✅ **Composant `LapChartModal.tsx`** (`src/components/`) :
  - Modale overlay (même style SetupDetail) avec backdrop fermeture + touche Échap.
  - Séries activables via chips colorées : Temps · Position · S1 · S2 · S3 · Carburant.
  - Lignes de référence toggleables : record perso (vert ⭐) + meilleur de classe (bleu 🏆).
  - Recharts `ComposedChart` : axe Y gauche temps (formaté m:ss), axe Y droit position (inversé, affiché si série Position active).
  - Marqueurs pit stop : lignes verticales pointillées ambre.
  - Dot personnalisé : vert (valide), ambre (pit), rouge (invalide), cercle + anneau blanc pour le best lap.
  - Outliers filtrés sur l'axe Y (cap à 2,5× best pour ne pas écraser les tours normaux).
  - Comparaison : bouton dropdown → liste des sessions compatibles → superpose les temps en orange pointillé + bouton × pour retirer.
  - Tooltip riche : tour# · temps · delta vs best · S1/S2/S3 · fuel · compound · position.
  - Lien « Détail » → `/sessions/:id?tab=laps` + fermeture modale.
  - Mini-table des 5 meilleurs tours (tour#, temps, S1/S2/S3, fuel%, Δ best) avec clic → SessionDetail.
- ✅ **Dashboard** (`src/routes/Dashboard.tsx`) : cellule Best Lap cliquable (underline pointillé). `openLapChart` propagé Dashboard → DashboardGroup → DashboardRow.
- ✅ **Sessions** (`src/routes/Sessions.tsx`) : cellule Best Lap cliquable (idem). `lapChartSessionId` state local.
- ✅ **i18n** (4 langues) : namespace `lapChart.*` — 23 clés (FR/EN/ES/DE).
- ✅ Build OK (`cargo check`, `tsc -b`).
- 📋 **Prochaine étape** : tester en conditions réelles (rebuild Tauri).

### 2026-05-28 (suite 10) — Fix : `best_lap` dans `results`, pas `sessions`

- 🐛 Erreur SQL au chargement de `/setups` et `/sessions/:id` : `no such column: sess.best_lap`. La colonne `best_lap` est dans la table `results` (par pilote), pas dans `sessions`. Bug introduit dans suite 4 (best_lap dans la matrice Garage) et qui empêchait la page setup ET la page session de charger.
- ✅ **`list_setups`** : `LEFT JOIN sessions sess` → `LEFT JOIN results r ON r.session_id = s.linked_session_id AND r.is_player = 1` ; `sess.best_lap` → `r.best_lap`.
- ✅ **`scan_setups`** : `SELECT best_lap FROM sessions WHERE id = ?` → `SELECT best_lap FROM results WHERE session_id = ? AND is_player = 1 LIMIT 1`.
- ✅ Build OK (`cargo check`).

### 2026-05-28 (suite 9) — Race Details : panneau « Setup utilisé » (vue inverse)

- ✅ **Backend `get_setups_for_session`** (`src-tauri/src/commands/setups.rs`) : nouvelle commande qui retourne `Vec<SetupForSession>` = tous les setups dont `linked_session_id = ?session_id`. Type dédié `SetupForSession { id, name, car, circuit, setup_type, source, updated_at }` — inclut voiture et circuit pour affichage hors `SetupGroup`.
- ✅ Commande enregistrée dans `lib.rs`.
- ✅ **Frontend API** (`src/lib/api.ts`) : type `SetupForSession` ajouté, méthode `setups.getForSession(sessionId)`.
- ✅ **`SessionDetail.tsx` — nouveau composant `SetupUsedCard`** inséré entre les blocs Driver/Session Settings et le bandeau Performance.
  - **Si 0 setup lié** → message « Aucun setup associé » + bouton « Lier un setup ».
  - **Si 1+ setups liés** → grille de mini-cards (nom du setup, voiture, circuit, type) avec icônes : ouvrir la fiche (`ExternalLink`) et délier (`Minus`).
  - **Picker inline** : clic sur « Lier un setup » → liste de tous les setups filtrés par voiture du joueur (matching loose `normalize().includes()`). Clic sur un setup → `setupsApi.setLinkedSession(setupId, sessionId)` → rechargement automatique.
  - Les setups déjà liés sont affichés en mode désactivé avec mention « (déjà lié) ».
- ✅ State `linkedSetups` déplacé dans `SessionView` (pas `SessionDetail`) car c'est là que le JSX est rendu.
- ✅ **i18n** (4 langues) : 8 nouvelles clés (`setupUsed`, `noSetupLinked`, `linkSetup`, `pickSetupTitle`, `noSetupCandidate`, `alreadyLinked`, `openSetup`, `unlinkSetup`).
- ✅ Build OK (`cargo check`, `tsc -b`).
- ✅ **Testé en conditions réelles (2026-05-28)**.

### 2026-05-28 (suite 8) — Garage : toggle « Comparer tous les temps »

- ✅ **Paramètre backend `best_only`** ajouté à `search_sessions_for_setup` (`Option<bool>`, défaut `true`) : contrôle le filtre `rn = 1` du groupement. Quand `false`, retourne toutes les sessions individuelles (utile pour comparer les temps réalisés avec différents setups sur un même circuit). 6e param SQL (`?6 = 0 OR rn = 1`). Limit relevée à 100 pour ce mode.
- ✅ **Frontend `api.ts`** : `searchSessionsForSetup(car, circuit?, bestOnly = true)`.
- ✅ **Frontend `SetupDetail.tsx`** : nouvelle case à cocher « Comparer tous les temps » à côté de « Filtrer par circuit ». État `compareAll` (false par défaut). `handleToggleCompareAll` relance immédiatement la recherche si la liste est ouverte. Le params passé : `bestOnly = !compareAll`.
- ✅ **i18n** : 2 nouvelles clés (`compareAll`, `compareAllTip`) dans les 4 langues.
- ✅ Comportements possibles dans la modale :
  | Filtre circuit | Comparer tous | Résultat |
  |---|---|---|
  | ✓ | ✗ | 1 ligne : record voiture+circuit (défaut) |
  | ✓ | ✓ | Toutes les sessions du combo voiture+circuit |
  | ✗ | ✗ | 1 ligne par circuit unique (record de chaque) |
  | ✗ | ✓ | Toutes les sessions de cette voiture, tous circuits |
- ✅ Build OK (`cargo check`, `tsc -b`).
- ✅ **Testé en conditions réelles (2026-05-28)** : session liée affiche bien chrono, secteurs et date directement.

### 2026-05-28 (suite 7) — Garage : 1 seul meilleur tour par combo (groupement SQL)

- ✅ **Groupement par (track, track_course)** dans `search_sessions_for_setup` : le SQL utilise désormais `ROW_NUMBER() OVER (PARTITION BY track, track_course ORDER BY best_lap ASC)` puis filtre `rn = 1`. Résultat : la liste de candidates n'affiche QUE LE MEILLEUR TOUR de chaque circuit unique (au lieu des 50 sessions individuelles, souvent voisines en chrono).
- ✅ Cas d'usage :
  - **Filtre circuit actif** (défaut) : 1 seule ligne renvoyée = le record de la voiture sur ce circuit.
  - **Filtre circuit désactivé** : 1 ligne par circuit unique où le joueur a roulé avec cette voiture (la session-record de chaque circuit), triées par best_lap ascendant.
- ✅ La limite `LIMIT 50` est conservée comme garde-fou.
- ✅ Build OK (`cargo check`).
- 📋 **Prochaine étape** : vérifier visuellement sur la modale (rebuild Tauri).

### 2026-05-28 (suite 6) — Garage : toggle « Filtrer par circuit » pour diagnostic

- ✅ **Toggle « Filtrer par circuit »** ajouté dans `LinkedSessionSection` (SetupDetail) — case à cocher coché par défaut. Si décochée, la recherche se relance automatiquement sans le filtre circuit (passe `null` au backend). Permet de diagnostiquer un mismatch de noms (nom de dossier ≠ nom XML).
- ✅ **Re-search live au toggle** : `handleToggleCircuit` relance `runSearch(next)` si la liste est déjà ouverte → l'utilisateur voit immédiatement la liste élargie.
- ✅ **Lien d'aide** quand la liste est vide ET le filtre actif : « → Voir toutes les sessions de cette voiture » (cliquable, désactive le filtre et relance la recherche).
- ✅ **i18n** : 3 nouvelles clés (`filterByCircuit`, `filterByCircuitTip`, `disableCircuitFilter`) dans les 4 langues (FR / EN / ES / DE).
- ✅ Build OK (`tsc -b`).
- 📋 **Prochaine étape** : tester sur le cas McLaren Monza — si décocher fait apparaître le record, c'est un mismatch nom dossier ↔ nom XML à traiter dans le matching backend (potentiellement étendre la normalisation côté `track`/`track_course`).

### 2026-05-28 (suite 5) — Garage : recherche session liée filtrée par circuit

- ✅ **Filtrage par voiture ET circuit** dans la recherche de sessions à lier à un setup. Précédemment seule la voiture filtrait — le user voyait des sessions de tous les circuits, ce qui n'a pas de sens pour un setup voiture+circuit donné.
- ✅ **Backend `search_sessions_for_setup`** (`src-tauri/src/commands/setups.rs`) : SQL réécrit pour matcher le circuit de manière tolérante. Normalisation lowercase + suppression espaces/underscores/tirets sur `x.track` ET `x.track_course`. LIKE bidirectionnel (sql contient needle OU needle contient sql) — gère le cas où le nom du dossier (« Imola », « COTA », « Sebring »…) diffère du nom XML officiel (« Autodromo Enzo e Dino Ferrari »). 3 params SQL ajoutés (?4 pattern, ?5 needle).
- ✅ **Frontend `SetupDetail.tsx`** : `setupsApi.searchSessionsForSetup(entry.car, entry.circuit)` au lieu de `null`.
- ✅ **Frontend `NewSetupDialog.tsx`** : passe `circuit.trim() || null` (si l'utilisateur a rempli le champ circuit).
- ✅ Le commentaire obsolète « On ne filtre PAS par circuit » est remplacé par une explication du matching tolérant.
- ✅ Build OK (`cargo check`, `tsc -b`).
- ✅ **Testé en conditions réelles (2026-05-28)** : filtrage voiture+circuit fonctionnel, matching McLaren/Monza confirmé.

### 2026-05-28 (suite 4) — Garage : Best Lap dans la matrice (V1.5)

- ✅ **Backend `SetupSummary` enrichi** (`src-tauri/src/commands/setups.rs`) : ajout de `linked_session_id: Option<i64>` et `best_lap: Option<f64>` (chrono de la session liée).
- ✅ **`list_setups` — LEFT JOIN sessions** : `SELECT … sess.best_lap FROM setups s LEFT JOIN sessions sess ON sess.id = s.linked_session_id ORDER BY …`. Tuple `(SetupEntry, Option<f64>)` propagé jusqu'au `SetupSummary`.
- ✅ **`scan_setups`** : après chaque INSERT, lookup ponctuel sur `sessions WHERE id = ?` pour récupérer le `best_lap` du `linked_session_id` mémorisé (si session purgée → `None`).
- ✅ **Type frontend** (`src/lib/api.ts`) : `SetupSummary` étendu (`linked_session_id`, `best_lap`).
- ✅ **`MatrixCell` enrichie** (`src/routes/Setups.tsx`) : chaque bouton-setup de la matrice affiche désormais son chrono à droite (font mono, 10px, tabular-nums). Calcul `bestOfCell` (min des `best_lap` non-null) → marquage en `text-success` (vert) pour le meilleur setup de la cellule. Setups sans session liée affichent `—` en gris. Import `formatTime` ajouté.
- ✅ Couvre les 2 utilisations de `MatrixCell` : vue « Par voiture » (matrice circuit × type) et vue « Par circuit » (matrice voiture × type).
- ✅ Build OK (`cargo check`, `tsc -b`).
- ✅ **Testé en conditions réelles (2026-05-28)**.
- 📋 **Prochaine étape** : à définir par l'utilisateur.

### 2026-05-28 (suite 3) — Dashboard : retrait des 4 cards lifetime (gardées sur Profile)

- ✅ **Dashboard épuré** (`src/routes/Dashboard.tsx`) : suppression de la 2e rangée de 4 cards (Sessions / Temps piste / Tours piste / Distance) qui faisait doublon avec la page Profile. Suppression du `useMemo globalStats` et du JSX correspondant. Imports d'icônes nettoyés (`Clock`, `CalendarDays`, `Activity`, `Navigation`, `CheckCircle2`).
- ✅ Le Dashboard ne contient plus que les **7 cards perf** (Records / Combos / Improvement / Result / Podiums / Wins / Top10) + la barre de filtres + le tableau groupé par circuit + le graphique « Records par classe ». Les stats « lifetime » (Sessions / Temps / Tours / Distance) restent exclusivement sur **Profile** comme demandé.
- ✅ Build OK (`tsc -b`).
- 📋 **Prochaine étape** : à définir par l'utilisateur.

### 2026-05-28 (suite 2) — Profile : Distance + valides/non-valides, purge supprime les XML

- ✅ **Backend `DashboardStats` enrichi** (`src-tauri/src/commands/queries.rs`) : ajout de `total_laps_valid`, `total_laps_invalid` (compteurs séparés depuis la table `laps`) et `total_distance_km` (SUM `xml_index.track_length` sur les tours valides, converti m → km, arrondi 0,1 km).
- ✅ **Profile : 1ère rangée de 4 cards refondue** (`src/routes/Profile.tsx`) : `Sessions / Temps piste / Tours / Distance` (la card « Podiums » est déplacée dans la rangée secondaire). Nouvelle icône `Route` pour Distance (verte).
- ✅ **Sous-textes valides/non-valides** : sous chaque card principale, ligne d'info (10px, gris) : Temps « tours chronométrés », Tours « X valides · Y non valides » (le `non valides` en `text-destructive/80`), Distance « tours valides ».
- ✅ **Rangée secondaire étendue à 9 cards** (`lg:grid-cols-9`) : ajout de Podiums au début.
- ✅ **Purge supprime les fichiers XML** (`src-tauri/src/commands/indexer.rs`) — règle V1 retrouvée dans `functions.php` `_scan_empty_sessions` (`unlink($filepath)` avant `DELETE FROM xml_index`). Nouvelle logique : (1) liste des `(filename, mtime)` à purger ; (2) `std::fs::remove_file` pour chacun (échec silencieux comme V1) ; (3) `INSERT INTO purged_files` (filet de sécurité si `remove_file` échoue) ; (4) `DELETE FROM xml_index` cascade. Le `results_dir` est lu depuis la config.
- ✅ Build OK (`cargo check`, `tsc -b`).
- ✅ **Testé en conditions réelles (2026-05-28)** : la purge supprime bien les fichiers XML physiquement.
- 📋 **Prochaine étape** : à définir par l'utilisateur. La table `purged_files` introduite hier reste pertinente pour les cas où la suppression filesystem échoue (fichier verrouillé par LMU en cours d'exécution, permissions, etc.).

### 2026-05-28 (suite) — Dashboard & Profile : couleurs classes, graphiques, TrackFlag, temps piste

- ✅ **TrackFlag réactif** (`src/components/TrackFlag.tsx`) : ajout `useState` + `useEffect` pour le cas où le cache `_cachedFlagKeywords` est froid au premier rendu (page Records). Le drapeau s'affiche dès que `getCircuitFlagUrl` renvoie une URL.
- ✅ **Icônes Profile** : couleur des icônes des cartes secondaires (`ProfileHero`) alignée sur la page Sessions : `bg-primary/10 text-primary` (au lieu de `bg-muted text-muted-foreground`).
- ✅ **Records par classe — couleurs** (`Dashboard.tsx`) : graphique « Records par classe » utilise les couleurs des classes via `<Cell>` (constante `CLASS_COLORS` : Hypercar=#ef4444, LMP2 WEC=#3b82f6, LMP2 ELMS=#60a5fa, LMP3=#a855f7, GT3=#22c55e, GTE=#f97316).
- ✅ **Voitures les plus utilisées — troncature + largeur** (`Profile.tsx`) : limite de troncature étendue à 24 chars (était 16), largeur `YAxis` portée à 155 px.
- ✅ **Voitures par classe — couleurs + voir plus** (`Profile.tsx`) : graphique des voitures colore chaque barre avec la couleur de classe via `<Cell>`. Limite par défaut à 10 entrées avec bouton « voir plus » (toggle, hauteur dynamique 26 px/barre, min 200 px).
- ✅ **Temps piste « tout inclus »** (`src-tauri/src/commands/queries.rs`) : `total_driving_hours` recalculé à partir d'une requête directe sur la table `laps` (`is_valid = 1`, tous les tours avec `lap_time > 0`), indépendamment de `total_lap_time` qui n'incluait que les tours avec les 3 secteurs chronométrés. `COALESCE(SUM(r.total_lap_time), 0)` retiré du SELECT principal ; les indices de colonnes suivants mis à jour en conséquence.
- ✅ Build OK (`tsc -b`, `cargo check`).
- 📋 **Prochaine étape** : à définir par l'utilisateur.

### 2026-05-27 — SessionDetail : Track Limits, corrections Vmoy & longueur, badges pneus, colonnes tours, sévérité incidents
- ✅ **Onglet Track Limits** (nouveau) : filtrage des events `event_type="TrackLimits"`, composant `TrackLimitsTab` avec colonnes TIME/LAP/WARNING PTS/TOTAL PTS/DRIVER/RESOLUTION. N'apparaît que si au moins 1 événement track limit existe.
- ✅ **XML parser enrichi** : helpers `attrs_to_pairs()` et `track_limits_extra()` ajoutés dans `xml_parser.rs`. Pour les events TrackLimits, le champ `text` encode désormais `{Lap}|{WarningPoints}|{CurrentPoints}|{Driver}|{résolution}`. Rétrocompatibilité : ancien format (texte libre) traité en fallback côté frontend.
- ✅ **Fix Vmoy** : `track_length` est en mètres (ex : 5780.6 m = Monza). Corrigé dans `playerPerf.avgSpeed` (÷ 1000) et dans le display `fTrackLength` (÷ 1000, 3 décimales). Précédemment la vitesse calculée était ≈ 1000× trop élevée.
- ✅ **Nom de fichier XML** ajouté dans la carte SESSION SETTINGS (InfoBlock `fFile`).
- ✅ **Suppression bouton Export CSV** (onglet Résultat course) — à rajouter plus tard si souhaité.
- ✅ **Stratégie — badges pneus colorés** : `compounds.join(", ")` remplacé par une rangée de `<CompoundBadge>`. Parsing robuste du champ `fcompound` (`"0,Medium"` → `"Medium"`).
- ✅ **Onglet Tours course** : 7 colonnes ajoutées — FUEL (carburant restant %, ambre), USED (consommation/tour %, filtre valeurs aberrantes > 15%), FL/FR/RL/RR (usure pneus en % via formule V1 `(1-twX)*100`), CMPD (badge coloré). Indicateur PIT : badge compact « P » dans la cellule LAP.
- ✅ **Sévérité incidents** : `parseSeverity()` extrait le dernier nombre entre parenthèses. `SeverityBadge` : rouge ≥ 50, ambre ≥ 20, gris < 20. `EventListTab` reçoit prop `showSeverity` (activé pour les incidents uniquement).
- ✅ **Import lucide** : `Download` retiré (Export CSV supprimé), `AlertTriangle` ajouté (Track Limits + sévérité).
- ✅ Build OK (`tsc -b`, `cargo check`).
- 📋 **Prochaine étape** : tester Track Limits sur une session réelle (nécessite réindexation pour le nouveau format text enrichi) ; ajuster les seuils de sévérité si nécessaire.

### 2026-05-26 — Purge joueur + suppression complète des mocks V2
- ✅ **Purge joueur (V1 § 2 types)** : backend Rust étendu pour accepter
  `purge_type: "global" | "player"`.
  - `purge_filter_sql()` helper dans `commands/indexer.rs` :
    - `global` → `has_any_laps = 0` (comportement existant).
    - `player` → `NOT EXISTS (SELECT 1 FROM sessions s JOIN results r
      ON r.session_id = s.id WHERE s.xml_id = xml_index.id AND
      r.is_player = 1 AND r.laps_count > 0)`. Reproduit la requête PHP V1
      `_scan_empty_sessions` (`functions.php:246`) adaptée au schéma V3
      `xml_index → sessions → results`.
  - `purge_empty_sessions` et `count_empty_sessions` acceptent
    `purge_type: Option<String>` (default `"global"`).
  - Frontend : `indexer.purgeEmptySessions("global" | "player")` /
    `countEmptySessions(type)` ; store `app.ts` idem.
  - Config.tsx : 2 `ActionRow` distinctes (global / joueur), chacune avec
    son propre badge de compteur ; rafraîchissement des 2 compteurs
    après chaque purge.
  - i18n (4 langues) : `config.purgeEmptyPlayer` ajouté.
- ✅ **Suppression mocks V2** (cf. décision verrouillée §2 n°48) :
  - Fichiers supprimés : `src/lib/mockData.ts`, `src/lib/webMock.ts`,
    `src/lib/tauri.ts` (bridge V2 avec fallback web),
    `src/stores/profile.ts` (store V2 multi-profils),
    `src/stores/version.ts` (`useVersion` jamais appelé, code mort),
    `src/routes/Progression.tsx` (page V2 lisant `useProfileStore`,
    jamais alimentée en V3).
  - Route `/progression` retirée d'`App.tsx`.
  - `isTauri()` rapatrié depuis `tauri.ts` vers `api.ts` (utilisé par
    `Config.tsx` pour gater le folder picker).
  - **Plus aucune donnée mockée** dans le code source (vérifié par grep).
- ✅ Build OK (`tsc -b`, `cargo check`).
- 📋 **Prochaine étape** : à définir.

### 2026-05-26 — Fix : page Sessions cassée (imports d'icônes manquants)
- 🐛 `/sessions` ne s'affichait plus — `tsc -b` remontait 5 erreurs
  `TS2304 / TS2552` : `Route`, `Tag`, `Car`, `Globe`, `Package` utilisés dans
  les `FilterField` (lignes 435, 450, 465, 496, 512) mais absents du bloc
  d'import lucide-react. Modification en cours interrompue lors d'une
  session précédente (ajout des pictos sur les filtres jamais finalisé).
- ✅ Import complété dans `src/routes/Sessions.tsx`. Build OK (`tsc -b`).
- 📋 **Prochaine étape** : reprendre le polish UI prévu — purge joueur
  (V1 : 2 types global/player) + nettoyage code mort (cf. entrée 2026-05-21).

### 2026-05-21 — Polish UI : Config, Dashboard, Changelog, headers de tableaux
- ✅ **Version centralisée** : `version.json` à la racine = source unique. `build.rs`
  synchronise vers `Cargo.toml`, `tauri.conf.json`, `package.json`. Vite injecte
  `__APP_VERSION__` dans le frontend via `define`. Footer affiche `v{APP_VERSION}`.
- ✅ **Données statiques externalisées** (style V1) : `public/data/cars.json` et
  `circuits.json` + `preloadStaticData()` au démarrage. Plus de constantes
  hardcoded dans `staticData.ts`.
- ✅ **Page Config redesignée** : layout 1 colonne, icônes dans les cards,
  inputs avec icônes, toggles compacts, section À propos + Maintenance.
- ✅ **Changelog** : historique V1 (0.2→0.9.5) ajouté en anglais. Bouton
  « Traduire » par carte → Google Translate dans la langue courante. Pleine
  largeur. Clé i18n `changelog.translate` (4 langues).
- ✅ **Dashboard — circuits en Cards séparées** : chaque groupe circuit est une
  `<Card>` indépendante dans un flex avec `gap-3` → espacement visible sur fond
  de page, replié ou déplié. Colgroup fixe les largeurs de colonnes en pourcentages
  (`table-layout: fixed`), alignement parfait entre circuits. Responsive via
  `min-w-[1100px]` + `overflow-x-auto`.
- ✅ **Couleurs Dashboard** : titre circuit `bg-amber-500/30` (plus foncé),
  en-têtes colonnes `bg-amber-500/15` (plus clair). Delta optimal affiché
  sous le temps optimal en vert `(-X.XXXs)`. Vmax sans « km/h » + `whitespace-nowrap`.
- ✅ **Headers de tableaux unifiés** : `TableHeader`/`TableHead` (shadcn `table.tsx`)
  modifiés pour fond ambre + texte ambre partout. Sessions, Setups, SetupCompare
  nettoyés des `bg-muted/40` inline. `TableTitle` primary → `uppercase`.
- ✅ **Suppression « v3 »** du Header et du Footer (remplacé par version dynamique).
- ✅ **Compteur sessions vides** dans la Config : nouvelle commande Rust
  `count_empty_sessions`, badge affiché à côté du bouton « Purger ».
- ✅ `MAINTENANCE.md` créé (version, voitures, circuits).
- ✅ Build OK (`tsc -b`, `cargo check`).
- 📋 **Prochaine étape** : purge joueur (V1 : 2 types global/player), code mort.
- ✅ **`TableTitle.tsx`** : variantes renommées pour refléter l'intent
  (`primary` au lieu de `blue`, `highlight` au lieu de `amber`).
  - `variant="primary"` (défaut) : `bg-amber-500 text-slate-900` au lieu
    de `bg-[#0d88d6] text-white`. Texte slate-900 = lisibilité forte en
    clair comme en sombre sur l'ambre saturé.
  - `variant="highlight"` (anciennement `"amber"`) inchangé : fond blanc
    + double filet ambre + titre centré, pour la vedette Dashboard.
- ✅ **`Dashboard.tsx`** :
  - Bandeau de groupe par circuit : tous les `#0d88d6` (border, gradient,
    chevron, label, badge count) → équivalents `amber-500` /
    `amber-700 dark:amber-300` selon le contexte (bordures/bg = amber-500,
    textes = amber-700 en clair et amber-300 en sombre).
  - Ligne d'en-têtes des colonnes : `bg-[#0d88d6]/35 text-[#cfe4f7]` →
    `bg-amber-500/20 dark:bg-amber-500/15 text-amber-800
    dark:text-amber-200 border-y border-amber-500/40`. Lisibilité validée
    sur les deux thèmes.
  - Usage `TableTitle` : `variant="amber"` → `variant="highlight"`.
- ✅ **`Setups.tsx`** : 3 bandeaux inline (matrices voiture/circuit, vue
  globale) — `bg-[#0d88d6] text-white` → `bg-amber-500 text-slate-900`.
- ✅ **Plus aucun `#0d88d6` dans `src/`** (vérifié via grep). Le bleu V1
  est complètement remplacé par l'ambre — convergence palette LMU dark.
- ✅ Note : le bloc « Performance » des tableaux (Best lap + S1-S3 +
  Optimal + Vmax + Position + Prog., teinte `bg-sky-500/10` /
  `/[0.06]`) reste **inchangé** — accent secondaire intentionnel pour
  distinguer la zone Performance. À ajuster si l'utilisateur trouve le
  mélange ambre/sky discordant.
- ✅ Build OK (`tsc -b`).

### 2026-05-20 — Dashboard : titre « Meilleurs temps » ambré + en-têtes lisibles
- ✅ `TableTitle` reçoit un prop `variant?: "blue" | "amber"`. Le défaut
  reste `"blue"` (bandeau V1 historique, conservé sur Sessions / Records /
  SessionDetail). Le variant `"amber"` rend un bandeau **blanc** encadré
  d'un double filet **ambre** (#FFB400 = palette LMU dark), titre **centré**
  en uppercase. Utilisé sur le Dashboard pour « Meilleurs temps par
  circuit » → met en avant le tableau-clé de la page.
- ✅ **Ligne d'en-têtes du tableau Dashboard** : `bg-muted/40` → fond
  bleu V1 teinté (`bg-[#0d88d6]/35`) + texte clair (`text-[#cfe4f7]`,
  `font-semibold`, tracking-wide) + bordures haut/bas tintées
  (`border-[#0d88d6]/40`). Les colonnes Détails / Records / Type /
  Session / Classe / Voiture / Livrée / Meilleur tour / S1-S3 / Optimal
  / Vmax / Arrivée / Prog. / Date sont désormais nettement lisibles.
- ✅ Build OK (`tsc -b`).

### 2026-05-20 — Garage : hero compact + picto sélecteur + vue Par circuit
- ✅ **Hero voiture compacté** : padding `p-5` → `p-2.5`, logo `h-16 w-16` →
  `h-10 w-10`, titre `text-2xl` → `text-base`, label « Véhicule actif »
  retiré (le nom suffit), compteur en ligne baseline avec label discret.
  Place beaucoup moins importante visuellement — la matrice respire.
- ✅ **Picto sélecteur** : icône `Car` (lucide) à la place du label texte
  « VOITURE » dans le sélecteur de voiture. Plus visuel et compact.
- ✅ **3ème vue « Par circuit »** : nouveau bouton dans le toggle (à droite
  de « Par voiture »), icône `MapPin`.
  - Nouveau composant `CircuitView` (mirror de `CarView`) :
    sélecteur circuit (picto MapPin), hero circuit actif compact, matrice
    **voiture × type** (Qualif/Course/Autres), QuickView réutilisé via un
    `SetupGroup` virtuel construit pour le circuit actif.
  - Liste des circuits dérivée des `groups` (compteur de setups par circuit).
  - Auto-sélection du 1er circuit au switch de vue.
- ✅ Clés i18n (4 langues) : `setups.viewCircuit`, `matrixCircuitTitle`
  (« Matrice par voiture »), `matrixEmptyCircuit`.
- ✅ Build OK (`tsc -b`).

### 2026-05-20 — Fiche setup en modale V1 (overlay + header/meta/body/footer)
- ✅ **`SetupDetail.tsx` restructuré** en modale plein-écran calquée sur
  la V1 (capture utilisateur — Lamborghini Huracán LMGT3 Evo 2).
  - Nouveau composant `ModalShell` : overlay `fixed inset-0 z-40 bg-black/50`
    + carte centrée (`max-w-4xl max-h-[92vh]` en mode compact, `max-w-md`
    pour loading/not-found). Backdrop click + touche Échap → fermeture
    (navigation vers `/setups`).
  - **Header** : icône clé à molette (Wrench) dans une pastille primary,
    titre « Éditeur de setup — {voiture} » + badge source (Jeu / App) +
    sous-titre « Télémétrie & Réglages » + bouton X close.
  - **Meta bar** (grid 3 colonnes, fond muted) : Nom (lecture seule
    monospace) | Type (select) | Circuit (lecture seule). Calque exact
    du V1.
  - **Hint « lecture seule »** pour setups jeu : strip ambre fin entre
    meta et body.
  - **Body** : sidebar onglets (w-44) + panneau scrollable
    (`overflow-y-auto`, padding réduit pour densité V1).
  - **Footer** : à gauche actions secondaires (Dupliquer / Exporter /
    Comparer / icône Supprimer) ; à droite Annuler / Enregistrer (mode
    édition) ou Éditer (sinon, désactivé pour setups jeu).
- ✅ Suppression de l'ancien en-tête full-page (Link retour, gros titre,
  paragraphe meta) — remplacé par le header de modale plus compact.
- ✅ Nettoyage imports : `Card`, `CardContent`, `Link`, `ArrowLeft`
  retirés (plus utilisés).
- ✅ Clés i18n ajoutées (4 langues) : `setupDetail.modalTitle`,
  `modalSubtitle`, `nameLabel`.
- ✅ Build OK (`tsc -b`).

### 2026-05-20 — Garage : notes éditables pour tous les setups (jeu inclus)
- ✅ **Justification utilisateur** : un setup importé (trouvé sur le net,
  copié dans `Settings/`) doit pouvoir être annoté. Les notes ne sont pas
  un réglage technique mais une annotation perso.
- ✅ **Backend** : nouvelle commande `set_setup_notes(id, notes)` dédiée
  qui contourne le check `source = "game"`.
  - Lit `entry.content_json` → svm parsé.
  - Si notes vides : retire le param `Notes` de `[GENERAL]`. Sinon :
    `upsert_general_notes` (helper existant).
  - Réécrit le `.svm` + met à jour `content_json` et `updated_at` en base.
  - Câblée dans `lib.rs`.
- ✅ **Frontend** : nouveau composant `NotesInlineEditor` dans
  `SetupDetail.tsx`, indépendant du mode édition global.
  - Affichage par défaut : notes en lecture seule + bouton « Modifier les
    notes » (toujours visible, même pour les setups jeu).
  - Clic → textarea + boutons Annuler/Enregistrer. Save appelle
    `setupsApi.setNotes` puis rechargement via `onSaved`.
  - Quand le `.svm` global est en cours d'édition : l'éditeur classique
    (groupé) reprend la main, on cache `NotesInlineEditor` pour éviter le
    conflit de state.
- ✅ Clés i18n (4 langues) : `setupDetail.editNotes`. `gameReadOnlyHint`
  mis à jour pour inclure les notes dans les éléments modifiables.
- ✅ Build OK (`cargo check`, `tsc -b`).

### 2026-05-20 — Garage : clarification « lecture seule » (métadonnées éditables)
- ✅ Vérification : le lien session (`set_setup_linked_session`) et le type
  (`set_setup_type`) sont des commandes **métadonnées uniquement** (UPDATE
  d'une colonne en base, aucune écriture du `.svm`) — donc déjà autorisées
  pour les setups `source = "game"`. Seul `update_setup` (qui réécrit le
  `.svm`) est bloqué côté backend.
- ✅ Le `LinkedSessionSection` du `MetaPanel` n'a pas de check `editing`
  ni `source` — les boutons « Chercher » / sélection / X de déliaison
  fonctionnent pour tous les setups, jeu inclus.
- ✅ **Hint mis à jour** dans les 4 langues : précise maintenant que
  « les réglages .svm restent en lecture seule (duplique pour les éditer).
  Le type et le meilleur tour lié restent modifiables ». Évite la
  confusion induite par le mot « lecture seule ».
- ✅ Build OK (`tsc -b`).

### 2026-05-20 — Garage : source jeu/app + Lier session après création
- ✅ **Nouvelle colonne `setups.source TEXT NOT NULL DEFAULT 'game'`** +
  migration `ALTER TABLE` tolérante (`db.rs`). Valeurs :
  - `"game"` → trouvé sur disque (scan_setups) = créé in-game ou importé.
  - `"app"` → créé via la modale « Nouveau setup » de V3 (ou dupliqué via
    V3 — le clone devient un fichier app-managed).
- ✅ **Protection édition** : `update_setup` retourne `AppError::Unsupported`
  si `entry.source == "game"`. L'utilisateur doit dupliquer d'abord
  (le dup devient `source = "app"`).
- ✅ Backend : `SetupEntry.source` et `SetupSummary.source` propagés
  partout (`get_setup`, `list_setups`, `scan_setups` (préserve par
  `svm_path`), `create_setup` → `'app'`, `duplicate_setup` → `'app'`).
- ✅ **Frontend — badge + édition désactivée** :
  - `SetupDetail.tsx` : badge `Jeu` (ambre) ou `App` (vert) à côté du
    nom du setup ; ligne d'aide en italique sous le hero si `source ==
    "game"` ; bouton « Éditer » désactivé avec tooltip ;
    `useEffect(?edit=1)` ignoré pour les setups jeu (nettoie le param
    sans entrer en édition).
  - `Setups.tsx` (vue globale) : nouvelle colonne **Origine** entre
    Type et Modifié, avec badge ambre/vert.
- ✅ **« Lier à une session » après création** : nouvelle section
  `LinkedSessionSection` dans le `MetaPanel` de l'onglet « Temps & Notes »
  de SetupDetail.
  - Bouton « Chercher » → `setupsApi.searchSessionsForSetup(entry.car)`
    → liste scrollable de candidates.
  - Clic sur une candidate → `setupsApi.setLinkedSession` →
    rechargement de l'entry via `onLinkChanged` (prop callback).
  - Bouton X pour délier.
  - Affichage compact de la session liée (trophée + circuit + chrono +
    date) si elle figure dans les résultats de recherche ; sinon
    affichage dégradé « Session #ID — clique sur Chercher pour voir
    le détail ».
- ✅ Clés i18n (4 langues) : `setupDetail.sourceGame`, `sourceApp`,
  `gameReadOnlyHint`, `linkedSession`, `searchSession`,
  `noLinkedSession`, `noSessionsFound`, `unlinkSession`,
  `linkedSessionId` (+ interpolation `{{id}}`), `setups.sourceLabel`.
- ✅ Build OK (`cargo check`, `tsc -b`).
- 📋 **Note** : la résolution de la session liée se fait via la même
  recherche heuristique que la création. Si le matching échoue (clé
  trop éloignée), l'affichage dégradé montre l'ID brut. Une commande
  backend `get_session_summary(session_id)` dédiée pourrait être ajoutée
  plus tard pour un lookup direct, mais ce n'est pas bloquant.

### 2026-05-20 — QuickView garage : 3 champs TC (V1)
- ✅ Le QuickView affichait une seule carte « TC ». V1 en avait 3 (TC,
  TC Power Cut, TC Slip Angle). Refonte :
  - Nouveau helper `findTcParams(svm)` qui scanne les sections CONTROLS
    et ENGINE, retourne jusqu'à 3 paramètres dont la clé commence par
    « tc » ou « tractioncontrol » (insensible à la casse), dans l'ordre
    d'apparition dans le `.svm`.
  - `QuickStats.tc: string | null` remplacé par `tcParams: KeyedValue[]`.
  - Rendu dynamique : map sur `tcParams`, libellé via `paramLabel(key)`
    (utilise le mapping `src/lib/setupParams.ts`), accent ambre.
  - Fallback : si aucun TC* trouvé, une carte « TC » vide est affichée
    pour rappeler la structure.
- ✅ Build OK (`tsc -b`).

### 2026-05-20 — Chat : highlight du joueur via forme abrégée « C Tof »
- 🐛 Les messages chat du joueur n'étaient pas surlignés : LMU abrège les
  noms dans le chat (initiale du prénom + nom, ex. « Cris Tof » →
  « C Tof »). Le match `e.text.includes(playerName)` échouait donc.
- ✅ `EventListTab` (SessionDetail) calcule désormais la forme abrégée du
  nom du joueur (`parts[0][0] + " " + parts.slice(1).join(" ")`) et match
  sur les **deux formes** (complet OU abrégé). Couvre les 3 onglets
  (incidents/pénalités utilisent le complet, chat utilise l'abrégé).
- ✅ Build OK (`tsc -b`).

### 2026-05-20 — Garage : champs vides à la création + libellés lisibles + toggle inversé
- ✅ **Champs vides à la création** (style V1) : `create_setup` (backend)
  garde la **structure** du template cloné (sections + clés → l'éditeur
  affiche les champs à remplir) mais **vide les valeurs** (`param.value =
  String::new()`). Le param `Notes` de `[GENERAL]` est préservé (sera
  ré-écrit juste après si l'utilisateur a saisi des notes dans la modale).
  Résultat : l'éditeur s'ouvre avec tous les Engine Map, Fuel Capacity,
  Preload, Coast… vides — le pilote remplit ce qui l'intéresse.
- ✅ **Libellés lisibles** : nouveau module `src/lib/setupParams.ts` avec
  ~80 mappings clé brute `.svm` → libellé racing-parlance
  (« RevLimitSetting » → « Rev Limit », « DifferentialPreloadSetting » →
  « Diff Preload », « Gear2Setting » → « 2nd Gear », « SlowBumpSetting »
  → « Slow Bump », etc.). Pour toute clé inconnue, fallback `humanize`
  qui retire « Setting », sépare camelCase et lettre→chiffre.
  `SetupDetail.tsx` utilise `paramLabel(p.key)` à la place de `p.key` brut.
  La clé brute reste accessible en tooltip (title=) pour debug.
- ✅ **Toggle Garage inversé** : « Tous les setups » d'abord, « Par
  voiture » ensuite. Défaut à `view = "global"` → l'utilisateur arrive
  sur le tableau plat (vue d'index), puis bascule vers la vue voiture
  pour explorer en profondeur.
- ✅ Build OK (`cargo check`, `tsc -b`).

### 2026-05-20 — Lisibilité : gap au vainqueur + vmax 2 décimales + highlight joueur
- 🐛 Le gap au vainqueur affichait `+ 252.643s` (raw `toFixed(3)`) au lieu
  du format V1 `+ 4:12.643`. Cause : `gapLabel` dans SessionDetail utilisait
  `.toFixed(3)` directement, sans extraire les minutes.
- ✅ Nouveau helper **`formatGap(seconds)`** dans `utils.ts` (V1
  `formatSecondsToMmSsMs(..., false)`) :
  - `< 60 s` → `12.345s` (lisible pour les petits écarts)
  - `≥ 60 s` → `m:ss.mmm` (sinon « 252.643 » est illisible)
  Utilisé par `gapLabel` dans `SessionDetail.tsx`.
- ✅ **Vmax à 2 décimales** au lieu de 1 (ou arrondi entier) sur toutes les
  pages : Dashboard, Sessions, Records (vue d'ensemble + stats progression),
  SessionDetail (classement, tours, meilleurs tours, comparaison pilotes).
  6 emplacements mis à jour. `top_speed` (vmax par tour) aussi en
  `toFixed(2)`.
- ✅ **Surlignage du joueur dans les onglets Incidents / Pénalités / Chat**
  de SessionDetail. Nouveau prop `playerName` passé à `EventListTab` ;
  match substring sur `e.text` (couvre les 3 formats V1 : « PlayerName:
  message », « Penalty given to PlayerName: ... », et le nom devant `(`
  pour les incidents). Style : `bg-sky-500/10`, bordure gauche
  `border-l-2 border-sky-500`, texte `text-sky-300 font-medium`.
- ✅ Build OK (`tsc -b`).

### 2026-05-20 — Garage : refonte complète page principale (style V1)
- ✅ **Modale extraite** : `src/components/NewSetupDialog.tsx` reçoit toute
  la logique de l'ancienne modale (Nom + Type + Notes + Lier session). Le
  parent passe `lmuPath`, `groups` et reçoit l'`entry` créé via
  `onCreated` (et décide de la navigation `?edit=1`).
- ✅ **`Setups.tsx` réécrit** : nouveau layout calqué V1, vue full-width
  sans sidebar (choix utilisateur).
  - **En-tête** : titre + **toggle Vue voiture / Vue globale** + boutons
    Rescan / Comparer / Nouveau setup.
  - **Vue voiture** :
    - Sélecteur voiture (dropdown `<optgroup>` par classe, compteur de
      setups dans le label).
    - **Hero voiture active** : logo XL + nom + ClassBadge + total setups
      (V1 `car-hero`).
    - **Matrice par circuit** (2/3) : lignes = circuits, colonnes
      Qualif / Course / Autres ; chaque cellule liste les setups du
      combo en chips cliquables. Clic → sélection dans QuickView.
    - **QuickView (1/3)** : en-tête (Type + nom + circuit) + barre
      d'actions (Éditer, Ouvrir, Dupliquer, Exporter, Supprimer) ;
      corps :
      * **Électronique** : TC (ambre), ABS (rouge), Bias, Map.
      * **Pressions** : FL/FR/RL/RR (sky).
      * **Notes** (si présentes, italique).
  - **Vue globale** : tableau plat triable Classe / Voiture / Circuit /
    Setup / Type / Modifié, ligne cliquable → fiche.
- ✅ **Helpers d'extraction** : `findParam(svm, candidates)` cherche dans
  plusieurs sections/clés (LMU varie selon les voitures) ; `extractQuickStats`
  retourne les 8 stats clés + notes. Robuste aux noms de section
  différents (CONTROLS, ENGINE, BASIC, FRONTLEFT, etc.).
- ✅ **Clés i18n** (4 langues) : ~25 nouvelles clés (`viewCar`,
  `viewGlobal`, `activeCar`, `totalSetups`, `matrixTitle`, `matrixEmpty`,
  `globalTitle`, `circuit`, `class`, `setup`, `modified`,
  `quickViewEmpty`, `quickViewNoContent`, `qvElectronics`, `qvPressures`,
  `qvNotes`, `qvBias`, `qvMap`, `edit`, `open`, `duplicate`,
  `duplicateAs`, `export`, `exported`, `delete`, `confirmDelete`).
  Suppression des clés obsolètes `setups.circuits` et `setups.setup`
  (counter, plus utilisé).
- ✅ Build OK (`tsc -b`).
- 📋 **À faire (V1.5)** : colonne Best Lap dans la matrice (besoin d'un
  `JOIN setups.linked_session_id → sessions.best_lap` côté backend pour
  exposer le best_lap dans `SetupSummary`). Reporté à une session suivante.

### 2026-05-20 — Éditeur de setup : densité calquée sur la V1
- ✅ Lignes de paramètre resserrées pour matcher `.cfg-row` V1 (plus
  d'infos visibles d'un coup, lisibilité préservée) :
  - texte `text-sm` (14 px) → `text-xs` (12 px) ; commentaires `text-xs`
    → `text-[10px]`.
  - rangée `py-2 border-b` → `py-1 px-2 rounded-md` + bordure au survol
    seulement (style V1 `.cfg-row:hover`).
  - input `w-24 px-2 py-1` → `w-20 px-1.5 py-0.5`, boutons ± `h-6 w-6`
    → `h-5 w-5`.
  - en-tête de section `text-xs ... mb-2` → `text-[10px]
    tracking-[0.18em] mb-1.5` + ligne fine sous le titre (V1 `.cfg-title`
    avec `border-bottom`).
  - espacements globaux : `gap-6` entre sections → `gap-4` ; padding
    panneau `p-5` → `p-4` ; grille `gap-x-8 gap-y-1` → `gap-x-6 gap-y-0`.
- ✅ Build OK (`tsc -b`).

### 2026-05-20 — Garage : Notes plus en double dans l'onglet Châssis
- 🐛 Le paramètre `Notes` de la section `[GENERAL]` apparaissait à la fois
  dans l'onglet « Châssis » (fourre-tout via `classifyParam`) ET dans
  l'onglet « Temps & Notes » (MetaPanel le lit directement).
- ✅ `classifyParam` retourne maintenant `"meta"` pour `GENERAL.Notes` →
  le param est filtré hors de tous les autres onglets. MetaPanel
  l'affiche toujours via sa lecture directe (`generalSection.params.find`).

### 2026-05-20 — Garage : entrée en mode édition après création
- ✅ **Setups.tsx** : `navigate('/setups/{id}?edit=1')` après `create_setup`
  (au lieu de `/setups/{id}`).
- ✅ **SetupDetail.tsx** : `useSearchParams` ajouté ; nouvel effect qui,
  une fois le `.svm` chargé, détecte `?edit=1`, prépare le `draft` et
  passe `editing = true`. Le param est ensuite **retiré de l'URL** via
  `setSearchParams(next, { replace: true })` pour qu'un F5 / clic Annuler
  ne ré-active pas l'édition.
- ✅ Build OK (`tsc -b`).

### 2026-05-20 — Garage : fix 2 bugs (recherche session vide + éditeur vide)
- 🐛 **Bug 1 : « Chercher une session » renvoyait toujours vide.** Le SQL
  utilisait un préfixe `LIKE 'car%'` qui ne matchait pas si le `car_type`
  stocké en base contient des `_` (« BMW_M4_LMGT3 ») ou diffère du libellé
  choisi côté front (« Alpine A424 EVO » vs « Alpine A424 » en base).
- ✅ **Fix : matching tolérant**. Nouvelle requête avec CTE qui normalise
  des deux côtés (`LOWER(REPLACE(REPLACE(REPLACE(x, ' ', ''), '_', ''),
  '-', ''))`) et match `contains` dans les deux sens (DB contient needle
  OU needle contient DB). Couvre les variantes EVO, codes série _WEC,
  séparateurs `_`/`-`.
- 🐛 **Bug 2 : éditeur ouvert vide, rien à modifier.** Quand l'utilisateur
  créait son tout premier setup pour une voiture, `find_template_svm` ne
  trouvait aucun `.svm` de la même voiture → fallback vers `SvmFile { sections: [] }`
  → tous les onglets affichaient « Aucun paramètre ».
- ✅ **Fix : `find_template_svm` à 4 niveaux de priorité** : (1) même voiture
  + même circuit, (2) même voiture autre circuit, (3) **même classe**
  (Hyper/LMP2/GT3/…) — la structure des sections `.svm` est très similaire
  intra-classe, donc le clone est exploitable, (4) n'importe quel `.svm`
  en dernier recours. Réécriture en 2 passes : d'abord collecte tous les
  candidats avec leur car+class, puis déduit la classe cible depuis le
  1er match « même voiture » (le plus fiable), puis classe par priorité.
- ✅ Build OK (`cargo check`, `tsc -b`).

### 2026-05-20 — Live : indicateur d'arrêt au stand sur le compteur de tours
- ✅ **Nouveau composant `PitIndicator`** dans `Live.tsx`, affiché à côté
  du compteur de tours (bandeau supérieur, présent sur tous les onglets).
- ✅ **Détection du passage au stand** via `player.pit_state` (rF2) :
  - `1` (demandé) → badge ambre discret « PIT DEM. »
  - `2` (entrée pit lane) → badge ambre pulsant « PIT IN »
  - `3` (à l'arrêt dans le box) → badge rouge pulsant « AU STAND »
  - `4` (sortie pit lane) → badge vert pulsant « PIT OUT »
  - `0` → rien affiché.
- ✅ **Compteur d'arrêts** : badge `×N` (gris) toujours affiché quand
  `player.num_pitstops > 0`, avec tooltip pluralisé.
- ✅ Clés i18n ajoutées dans les 4 langues : `live.pitRequest`,
  `live.pitIn`, `live.pitStop`, `live.pitOut`, `live.pitstopsTotal`
  (pluriels via i18next `_one` / `_other`).
- ✅ Build OK (`tsc -b`). Aucune modif backend nécessaire : `pit_state` et
  `num_pitstops` sont déjà exposés par `LivePlayer`.

### 2026-05-20 — Garage : « Lier à une session » dans la modale (V1)
- ✅ **Backend** :
  - Colonne `setups.linked_session_id INTEGER` ajoutée au schéma + migration
    `ALTER TABLE` tolérante (motif standard du projet).
  - `SetupEntry` (struct Rust) reçoit `linked_session_id: Option<i64>`.
    Toutes les requêtes SELECT/INSERT (`get_setup`, `list_setups`,
    `scan_setups`, `duplicate_setup`, `create_setup`) propagent la colonne.
  - `scan_setups` préserve `linked_session_id` au rescan (HashMap par
    `svm_path`, comme `setup_type`) — l'utilisateur ne perd jamais ses liens.
  - `create_setup` accepte un nouveau paramètre `linked_session_id`.
  - 2 nouvelles commandes :
    - `search_sessions_for_setup(car, circuit?)` → renvoie jusqu'à 50
      sessions du joueur (filtre `is_player=1`, `best_lap > 0`, préfixe
      voiture sur `unique_car_name` OU `car_type`), triées par best lap
      ascendant. Le filtre circuit est optionnel et désactivé côté front
      car les noms diffèrent entre dossier Settings (« COTA ») et XML
      (« Circuit of The Americas »).
    - `set_setup_linked_session(setup_id, session_id?)` → lie/délie une
      session (`null` = délier).
  - Câblage dans `lib.rs`. `cargo check` PASSE.
- ✅ **Frontend** :
  - Types TS : `SetupEntry.linked_session_id` (number | null) ajouté ;
    nouvelle interface `SetupSessionMatch` ; nouvelles méthodes
    `setupsApi.searchSessionsForSetup` et `setupsApi.setLinkedSession` ;
    signature `setupsApi.create` étendue.
  - **Modale « Nouveau setup »** : nouvelle section « Meilleur tour lié »
    avec bouton « Chercher » (désactivé tant qu'aucune voiture n'est
    choisie). Au clic : appel `search_sessions_for_setup`, panel de
    résultats scrollable (circuit · best lap · session_type · classe ·
    date), clic → sélection. Affichage compact de la session liée
    (trophée + circuit + best lap + date) avec bouton X pour délier.
- ✅ Clés i18n (4 langues) : `linkedSession`, `searchLink`,
  `noLinkedSession`, `linkPickCarFirst`, `unlinkSession`,
  `noSessionsFound`.
- ✅ Build OK (`cargo check`, `tsc -b`).
- 📋 **Reste à faire** : afficher / éditer la session liée dans l'éditeur
  `/setups/:id` (onglet « Temps & Notes »). Aujourd'hui le lien est stocké
  mais visible uniquement à la création — pas modifiable après. Sera fait
  lors de la prochaine itération sur SetupDetail.

### 2026-05-20 — Live overview : chrono du tour en cours
- ✅ **Tour en cours ajouté au-dessus de « Dernier tour »** sur l'onglet
  « Vue d'ensemble » du Live. Affiché en `text-6xl` (un cran sous le
  dernier tour `text-8xl`), couleur primary quand actif, gris pâle sinon.
- ✅ **Backend** : `LivePlayer` reçoit un champ `current_lap_time` (f32),
  alimenté depuis `m_time_into_lap` de la struct rF2 `VehicleScoring`
  (déjà parsée). 0 si non en piste.
- ✅ Type TS `LivePlayer.current_lap_time` ajouté dans `api.ts`.
- ✅ Clés i18n `live.lCurrentLap` ajoutées (FR « Tour en cours » /
  EN Current lap / ES Vuelta actual / DE Aktuelle Runde).
- ✅ Build OK (`cargo check`, `tsc -b`).

### 2026-05-20 — Garage : création de setup remplie + Type + Notes
- 🐛 **Bug bloquant** : `create_setup` écrivait un `.svm` avec `sections:
  Vec::new()` → l'éditeur ouvrait un fichier vide (« Aucun paramètre dans
  cette catégorie » sur tous les onglets). Du coup l'utilisateur ne pouvait
  rien éditer après la création.
- ✅ **Fix : clone d'un template `.svm` existant** (backend `setups.rs`).
  Nouvelle fonction `find_template_svm` qui parcourt `Settings/` à la
  recherche d'un `.svm` de la même voiture (comparaison via
  `extract_car_name`) ; préférence au dossier circuit demandé, sinon
  n'importe quel circuit. Si rien trouvé : fallback sur le `.svm` vide
  d'avant (cas d'usage : 1er setup d'une voiture jamais utilisée).
  Le `vehicle_class` reste toujours imposé par l'appelant (le template peut
  venir d'une livrée différente).
- ✅ **Modale enrichie (style V1)** : ajout des champs **Type**
  (Qualif / Course / Autres — au lieu du « Autres » silencieux du backend)
  et **Notes pilote** (textarea, injectée dans la section `[GENERAL]
  Notes="…"` du `.svm` neuf via `upsert_general_notes`). Largeur de la
  modale passée à `max-w-lg`, Nom + Type sur 2 colonnes.
- ✅ **API** : `create_setup` (Rust) accepte deux nouveaux params optionnels
  `setup_type` et `notes` ; `setupsApi.create` (TS) idem. Le `setup_type`
  par défaut reste « Autres » si non fourni.
- ✅ Clés i18n ajoutées (4 langues) : `setups.newType`, `setups.typeQualif`,
  `setups.typeRace`, `setups.typeOther`, `setups.newNotes`,
  `setups.newNotesPlaceholder`. Description `setups.newSetupDesc` mise à
  jour (« basé sur un setup existant de la même voiture quand c'est
  possible »).
- ✅ Build OK (`cargo check`, `tsc -b`).
- 📋 **Reste à faire (demandes utilisateur reportées)** :
  - Champ « Lier à une session » (bouton chercher + résultats) — nouvelle
    commande backend `search_sessions_for_setup(car, circuit)`,
    nouvelle colonne `setups.linked_session_id`.
  - Refonte complète de l'éditeur en modale plein-écran V1 (paramètres
    setup éditables directement dans la modale de création).

### 2026-05-20 — Sessions : en-têtes alignés Dashboard + fix « Best lap » FR
- ✅ **`Sessions.tsx`** : en-têtes de colonnes harmonisés avec le Dashboard
  (`text-[10px]` au lieu de `text-xs`, `py-1` au lieu de `h-10`,
  `bg-muted/40` sur la ligne). Réglage fait dans `SortHead` (base classes) +
  les 2 `TableHead` bruts (« Détails » et la cellule de fin). twMerge gère
  proprement la surcharge des défauts shadcn (`h-10 px-3 text-xs`).
- ✅ **Fix i18n FR** : `dashboard.bestLap` valait « Best lap » → corrigé en
  « Meilleur tour » pour s'aligner sur `sessions.colBestLap` (la colonne du
  même nom dans Sessions). Les autres langues étaient déjà correctes
  (EN « Best lap », ES « Mejor vuelta », DE « Beste Runde »).
- ✅ Build OK (`tsc -b` passe).

### 2026-05-20 — Live : onglet « Vue d'ensemble » repris de la V2
- ✅ **Nouvel onglet `overview` ajouté à `Live.tsx`** (placé en premier, devient
  l'onglet par défaut) — réplique du tableau de bord plein-écran de la V2 :
  grand chrono central (dernier tour + delta ▼/▲ + meilleur tour), 3 tuiles
  SPD / GEA / RPM (point indicateur teinté selon ratio régime), bandeau
  inférieur Carburant (+ tours restants) / Écarts devant-derrière / 4 pneus
  compacts (température + usure, palette tempColor/wearColor existante).
- ✅ Écarts dérivés du classement V3 (`LiveStanding.time_behind_next` du
  joueur pour « devant » ; même champ sur la ligne `position+1` pour
  « derrière ») — la V2 utilisait `gap_ahead`, absent en V3.
- ✅ Clés i18n `live.tabOverview` ajoutées dans les 4 langues
  (FR « Vue d'ensemble » / EN Overview / ES Vista general / DE Übersicht).
- ✅ Build OK (`tsc -b` passe). Les 3 onglets existants (Télémétrie /
  Classement / Carte 2D) sont conservés tels quels.

### 2026-05-19 — UX tableaux : Performance étendue + bulles partout + filtres joueur
- ✅ **Sessions** : groupe « Performance » étendu à Best Lap + Départ + Arrivée + Prog. (colSpan 1 → 4) ; « Contexte » réduit à Arrêts + Date + Version (colSpan 6 → 3). Teinte cyan et bordures de groupe mises à jour pour les entêtes et cellules.
- ✅ **Composant partagé** `src/components/SessionBadge.tsx` (variantes Race/Qualify/Practice + `sessionTypeLabel`), utilisé dans Sessions, Dashboard (table records) et Records (historique). Texte brut de la colonne « Session » remplacé par la bulle.
- ✅ **Filtres Dashboard/Sessions** : `get_filter_options` (queries.rs) restreint `cars` et `classes` à `WHERE is_player = 1` — on n'affiche que les voitures/classes réellement pilotées par le joueur (les autres pilotes du XML sont ignorés). Le catalogue complet reste affiché sur Config / Nouveau setup.
- ✅ `cargo check` + `tsc --noEmit` passent.
- 📋 **Prochaine étape** : nettoyer le code mort (`lib/tauri.ts`, `lib/mockData.ts`, `lib/webMock.ts`, `stores/profile.ts`, `stores/version.ts`) et trancher le sort de `routes/Progression.tsx`.

### 2026-05-18 — Phase 0 : mise en place V3
- ✅ Exploration complète de V1 (PHP) et V2 (Tauri/React).
- ✅ Décisions cadrées avec l'utilisateur (cf. section 2).
- ✅ Code V2 copié à la racine `_LMU_V3\` (frontend `src/`, `public/`, `node_modules/`, configs ; `src-tauri/` sans `target/`).
- ✅ Règles métier V1 extraites de `db.php`, `indexer.php`, `queries.php`, `functions.php` → consignées section 3.
- ✅ Fichier de suivi `SUIVI.md` créé.
- 📋 **Prochaine étape** : Phase 1 — réécrire le backend Rust (`src-tauri/src/`) : schéma SQLite calqué V1, parser XML rFactor, indexer delta. Étudier `race_details.php` et `index.php` pour compléter les règles d'affichage avant Phase 2/3.

### 2026-05-18 — Correction MAJEURE : identification du joueur + Dashboard = index.php
- ❌ **Bug de fond** : l'indexeur marquait `is_player` via `d.is_player` (flag XML
  `isPlayer`) → ~3089 lignes « joueur » sur 3907 au lieu de 180. Le Dashboard
  agrégeait donc TOUS les pilotes, pas le joueur.
- ✅ **Règle V1 rétablie** : le joueur est identifié **strictement par son nom**
  (`Name === PLAYER_NAME`, cf. `indexer.php` V1). Le flag XML `isPlayer` n'est
  JAMAIS utilisé. `suggest_player_name` = nom de pilote le plus fréquent (V1).
  Smoke-test re-vérifié : joueur « Cris Tof », **player_results = 180** ✓.
- ✅ **`INDEX_LOGIC_VERSION`** ajouté (`stores/app.ts`) : au démarrage, si la base
  a été indexée avec une logique obsolète → réindexation complète automatique.
  À incrémenter à chaque changement parser/indexeur.
- ✅ **Décisions utilisateur** : (1) le Dashboard reproduit `index.php` V1 — hero +
  barre de filtres + **tableau complet des meilleurs temps groupé par circuit**
  (pas d'aperçu condensé) ; (2) le graphe « Records par classe » (V2-only) est
  conservé sur accord explicite.
- ✅ **`Dashboard.tsx` reconstruit** : hero 7 stats (formats V1 exacts — heures
  décimales « X.X h »), barre de filtres (circuit/tracé/voiture/classe/session/type),
  tableau groupé par circuit pliable (~17 colonnes : Détails, Records, Tracé, Type,
  Session, Classe, Voiture, Livrée, Best lap, S1/S2/S3, Optimal, Vmax, Position,
  Progression, Date), légende couleurs, graphe classes.
- ✅ Build OK (cargo test, tsc).

### 2026-05-18 — Phase 3 (en cours) : Détails de course
- ❌ Bug signalé : clic sur une session → « Chargement… » bloqué (SessionDetail =
  ancien code V2 appelant une commande retirée).
- ✅ **Backend `commands/session_detail.rs`** : `get_session_detail(sessionId)` →
  infos session, sessions sœurs (P/Q/R du même événement), classement (tous
  pilotes), tours, événements de flux. `cargo check` OK.
- ✅ **Fix ID** : `get_best_laps` renvoie désormais le vrai `sessions.id` (et non
  `event_id`) → navigation Dashboard → détail cohérente avec Sessions.
- ✅ **`SessionDetail.tsx` réécrit** sur `api.ts` : 2 cartes d'info, sélecteur
  Essais/Qualif/Course, 7 onglets — Résultat course (classement groupé par classe,
  Pos/Prog/Classe/Pilote/Voiture/Tours/En tête/Temps total/Best lap/Vmax/Carb.
  dép./arr./Inc./Pén./Statut), Tours course (tour par tour par pilote), Meilleurs
  tours, Stratégie (carburant/arrêts/gommes), Incidents, Pénalités, Chat.
- ✅ Build OK (cargo check, tsc, vite).
- ⏳ **Reste Phase 3b** : onglet **Comparaison pilotes** (8ᵉ onglet V1) + graphes
  (progression des tours, écart au leader) + i18n de la page (textes FR en dur
  pour l'instant) + comptage incidents/pénalités à revérifier sur vraies données.

### 2026-05-18 — Phase 3b TERMINÉE : Comparaison pilotes + graphes
- ✅ **8ᵉ onglet « Comparaison pilotes »** ajouté à `SessionDetail.tsx`, calqué
  sur `race_details.php` (vue `compare`) :
  - Sélecteur de pilotes : 4 listes déroulantes (V1 `driver1..driver4`) —
    adapté aux courses à 40+ pilotes ; pilotes triés par nom (V1 `strcasecmp`),
    couleur fixe par emplacement (palette dark V1 `#5c9ce6/#48c774/#e57373/#ffd700`).
  - Tableau de comparaison — 13 lignes V1 exactes : position arrivée/départ,
    meilleur tour, moyenne 5 meilleurs, médiane, écart-type, secteurs 1/2/3,
    vmax, arrêts, incidents, pénalités. Surlignage « meilleur de la ligne »
    (stats lower-is-better V1) + 🏆 record absolu de session (best lap/secteurs).
  - Message dédié pour les sessions d'essais (V1 `compare_prompt_practice`).
- ✅ **Graphes (Recharts)** : sélecteur Position / Temps au tour / Écart au
  leader. Position = courbe par tour, axe Y inversé (V1 `positionChart`).
  « Écart au leader » = temps cumulés de TOUS les pilotes, gap vs cumul mini.
- ✅ **Comptage incidents/pénalités corrigé** selon `functions.php` V1 :
  pénalité = regex `Penalty given to (.+?):` (pilote participant connu
  uniquement) ; incident = noms via `([a-zA-Z0-9_ .#-]+)\(`, compté seulement
  si 1 ou 2 pilotes connus impliqués. (L'ancien code comptait tout pilote nommé.)
- ✅ Build OK (`tsc -b` + `vite build`).
- ⏳ **i18n de la page** : textes FR encore en dur → reporté à la **Phase 7**
  (i18n complet 4 langues). 📋 **Prochaine étape** : Phase 4 — page `/records`.

### 2026-05-18 — Phase 5 TERMINÉE : Garage (setups .svm)
- ✅ **Backend `commands/setups.rs` réactivé** (était en dormance) et adapté au
  schéma V3 **mono-profil** : suppression de la colonne/notion `profile_id`
  (table `setups`, requêtes, structs `SetupEntry`). Le reste = logique V2
  conservée (parser/writer `.svm`, scan dossier `Settings`, CRUD, diff A/B).
- ✅ 10 commandes câblées dans `lib.rs` : `scan_setups`, `list_setups`,
  `get_setup`, `get_setup_content`, `update_setup`, `duplicate_setup`,
  `delete_setup`, `export_setup`, `compare_setups`, `create_setup`.
  `cargo check` PASSE.
- ✅ **`api.ts`** : types Garage (Svm*, SetupEntry sans `profile_id`, SetupGroup/
  Track/Summary, SetupDiff*) + objet `setups` (invoke direct, aucun mock).
- ✅ **`Setups.tsx` réécrit** sur `api.ts` + `useAppStore` (plus de
  `useProfileStore` V2) : liste groupée voiture→circuit pliable, rescan,
  dialogue « Nouveau setup », chargement cache-puis-scan.
- ✅ **`SetupDetail.tsx` réécrit** : **mode édition fonctionnel** — valeurs
  éditables (champ texte + boutons ±1 sur les valeurs numériques),
  Enregistrer → `update_setup` (réécrit le `.svm`), Annuler ; duplication,
  export, suppression.
- ✅ **`SetupCompare.tsx`** : migré sur `api.ts`, comparaison diff A/B.
- ✅ Clé i18n `setupDetail.save` ajoutée (fr/en/es/de).
- ✅ Build OK (`cargo check`, `tsc -b`, `vite build`).
- 📋 **Prochaine étape** : Phase 6 (Live) ou Phase 7 (Config + i18n), au choix
  de l'utilisateur. Records (Phase 4) toujours en attente de refonte.

### 2026-05-18 — Phase 4 TERMINÉE : Records refondus (2 niveaux)
- ✅ **Refonte validée** : la V1 (1 seul combo circuit+voiture à la fois, page
  vide au départ, colonnes cryptiques) → V3 en **2 niveaux**.
- ✅ **Backend `commands/records.rs`** : `get_records_overview` (tous les
  records, 1 ligne par combo circuit/tracé/voiture/classe — best lap, secteurs,
  optimal, vmax, date, version, nb sessions, nb améliorations) ;
  `get_record_progression` (historique d'un combo : is_pb, record du moment,
  gain par PB, meilleur de la classe aligné, stats). Câblé `mod.rs` + `lib.rs`.
- ✅ **`Records.tsx` réécrit** :
  - **Niveau 1 — « Mes records »** : tableau groupé par circuit (drapeau),
    recherche + filtre classe, badge de niveau ohne_speed par ligne.
  - **Niveau 2 — Progression** (au clic) : cartes stats, graphe Recharts
    **épuré** (courbe best lap + points 🏆 PB) avec options activables (ligne
    de record, secteurs sur 2ᵉ axe, meilleur de la classe, réf. ohne_speed) ;
    tableau session par session (colonnes explicites : 🏆, « Record du moment »,
    « Progrès −X.XXXs »), lignes → détail de session.
- ✅ **ohne_speed intégré** : `ohne_speed.ts` (CSV communautaire) — badge de
  tier (Alien/Compétitif/…) sur la vue d'ensemble + carte « niveau
  communautaire » (% du temps Alien, écart) + lignes de référence sur le
  graphe. Best-effort : si le CSV est inaccessible, dégradation silencieuse.
- ✅ Build OK (`cargo check`, `tsc -b`, `vite build`).

### 2026-05-18 — Live : onglets + carte plein écran + tracé persistant
- ✅ Page Live réorganisée en **onglets** : Télémétrie (façon V2, 2 colonnes) /
  Classement / Carte 2D — le bandeau live reste toujours visible au-dessus.
- ✅ **Carte 2D en plein écran** : occupe toute la zone de l'onglet (SVG
  `preserveAspectRatio`), cadrage calculé sur le tracé + positions voitures.
- ✅ **Tracé de circuit persistant** (backend `live.rs`) : les points accumulés
  (buckets 20 m) sont **sauvegardés par circuit** dans `{appdata}/tracks/
  {slug}.json` et **rechargés au démarrage de session** → le tracé est conservé
  pour les parties suivantes (équivalent du `_live.json` de la V1).
- ✅ Tracé amélioré (inspiré de `LMU-Telemetry-Lab`) : lissage en boucle
  (moyenne glissante circulaire), rendu 2 couches (asphalte + ligne médiane),
  pastilles voitures numérotées.
- ✅ Build OK (`cargo check`, `tsc -b`, `vite build`).

### 2026-05-18 — Live refait sur la vraie V1 (rF2data.py)
- ⚠️ La page Live ne fonctionnait pas : `live.rs` calculait les offsets binaires
  **à la main** (fragile/faux). La vraie V1 (`C:\tmp\__DEV__\lmustatsviewer\
  zOLD_V1`) lit la mémoire partagée via un dumper Python + `rF2data.py`.
- ✅ **`live.rs` entièrement réécrit** : transcription **fidèle** des structures
  de `rF2data.py` en structs Rust `#[repr(C, packed(4))]` (Vec3, Wheel,
  VehicleTelemetry, ScoringInfo, VehicleScoring, PhysicsOptions, Extended…).
  Lecture par `read_unaligned` + `offset_of!`/`size_of` → **plus aucun offset
  manuel** (correct par construction). Maps lues : Telemetry, Scoring,
  **Extended** (nouvelle). Instantané riche calqué sur `telemetrie_dumper.py` :
  télémétrie complète (gaz/frein/direction, conso carburant, moteur, turbo,
  4 roues 3 zones, dégâts, G), joueur, **classement complet** (positions de
  classe + best-in-class), météo, drapeaux, extended (TC/ABS/limiteur),
  **accumulation du tracé** du circuit (buckets 20 m).
- ✅ **`Live.tsx` refait en tableau de bord complet** : jauges vitesse/rapport/
  régime, pédales, carburant + conso, chrono (tour/secteurs/delta), grille
  4 pneus (temp 3 zones, usure, pression, freins), panneau moteur & aides,
  dégâts/incidents, **carte 2D du circuit** (tracé + positions live), tableau
  de classement complet.
- ✅ `api.ts` : types Live entièrement remis à plat.
- ✅ Build OK (`cargo check`, `tsc -b`, `vite build`).
- 📋 Note : offsets désormais corrects par construction (Rust calcule tailles/
  offsets selon `_pack_=4`). À valider en jeu avec une session LMU active.

### 2026-05-18 — Phase 6 TERMINÉE : Live timing
- ✅ **Backend `commands/live.rs` réactivé** (était en dormance) : lecture de la
  mémoire partagée rF2/LMU (`$rFactor2SMMP_Telemetry$` / `$rFactor2SMMP_Scoring$`),
  offsets binaires, polling en thread → événement Tauri `live-data`. Aucune
  dépendance base. Câblé dans `mod.rs` + `lib.rs` (`get_live_data`,
  `is_sim_running`, `start_live_polling`, `stop_live_polling`). `cargo check` OK.
- ✅ **`api.ts`** : types Live (LiveData/Telemetry/Scoring/WheelData) + objet
  `live` (commandes + abonnement `onData` à l'événement `live-data`).
- ✅ **`Live.tsx` réécrit** sur `api.ts` — **suppression de tout le mock**
  (`startMockPolling` retiré, conforme à la règle « aucune donnée simulée ») :
  abonnement à l'événement backend, état d'attente « connexion / simulateur non
  détecté » quand la mémoire partagée est absente, plein écran. Correction du
  bug d'usure pneus (le backend renvoie déjà un %, plus de ×100).
- ✅ Clés i18n `live.connecting` / `live.noSimHint` ajoutées (4 langues).
- ✅ Build OK (`cargo check`, `tsc -b`, `vite build`).
- 📋 **Prochaine étape** : Phase 7 (Changelog + i18n) ou Phase 8 (Polish).

### 2026-05-18 — Garage : fix « Setup introuvable » + noms de voitures
- 🐛 **« Setup introuvable » après création** : `handleCreate` faisait un
  rescan (qui reconstruit la table `setups` → réattribue les `id`) AVANT de
  naviguer vers l'`id` renvoyé par `create_setup`, devenu périmé. **Fix** :
  navigation directe, sans rescan.
- 🐛 **Trop de « types » de voitures** : `extract_car_name` prenait le 1ᵉʳ mot
  du `VehicleClassSetting`, dont l'ordre varie (`"ELMS2025 GT3 Mercedes_AMG_GT3"`,
  `"BMW_M4_LMGT3 GT3 WEC2024"`…) → groupes erronés (« ELMS2025 », « GT3 »…).
  **Fix** : retrait des jetons « bruit » (classe + code de série WEC/ELMS) et
  normalisation des `_` → le garage regroupe correctement par voiture.

### 2026-05-18 — Fix encodage .svm + type « Week-end » sans bulle
- 🐛 **Setups invisibles** : `scan_setups` lisait les `.svm` via
  `fs::read_to_string` (UTF-8 strict). Les fichiers du jeu sont parfois en
  Windows-1252 (ex. caractère `ÿ`) → un seul fichier mal encodé faisait
  échouer **tout** le scan atomique → 0 setup. **Fix** : lecture en octets +
  `String::from_utf8_lossy` ; un fichier illisible/non parsable est ignoré
  (skip) au lieu d'avorter le scan entier.
- ✅ Tableaux : le « Type » (En ligne / Week-end) n'est plus une bulle de
  couleur — texte simple. Clé i18n `offline` → « Week-end » (terme V1).

### 2026-05-18 — Garage : éditeur de setup riche (onglets) + lien BMC
- ✅ Lien Buy Me a Coffee corrigé → `https://buymeacoffee.com/cristof`.
- ✅ **`SetupDetail.tsx` refondu en éditeur pleine page** (décisions utilisateur :
  tous les paramètres `.svm`, page plein écran, Notes dans `.svm` / Type en base) :
  - Barre latérale d'onglets façon V1 : Moteur & Diff, Pneus & Freins,
    Suspension, Amortisseurs, Châssis, Temps & Notes.
  - **Tous** les paramètres du fichier sont affichés — classés par
    `classifyParam(section, key)` (Châssis = fourre-tout → aucune perte).
  - Mode édition : valeurs éditables + boutons ±1 ; enregistrement → `update_setup`.
  - Onglet Temps & Notes : notes pilote (champ `Notes` de la section
    `[GENERAL]` du `.svm`), type, date, chemin du fichier.
- ✅ **Backend** : colonne `setup_type` ajoutée à la table `setups` (+ migration
  `ALTER TABLE` tolérante) ; commande `set_setup_type` ; `scan_setups` préserve
  le `setup_type` (snapshot par chemin avant purge) ; `SetupEntry`/`SetupSummary`
  exposent `setup_type`.
- ✅ ~16 clés i18n `setupDetail.*` ajoutées (fr/en/es/de).
- ✅ Build OK (`cargo check`, `tsc -b`, `vite build`).

### 2026-05-18 — Garage : catalogue voitures/circuits + scan atomique
- 🐛 `scan_setups` (`DELETE` + INSERTs séparés) était racé : le double montage
  StrictMode lançait deux scans concurrents → table vidée par l'un pendant que
  l'autre lisait. **Fix** : scan en 2 temps — parcours disque puis écriture en
  **une transaction SQLite unique** (verrou tenu) → scans sérialisés, plus
  jamais d'état partiel vu par `list_setups`.
- ✅ **Catalogue LMU porté de la V1** dans `staticData.ts` : `LMU_CARS` (33
  voitures + catégorie, depuis `cars.json`) et `LMU_CIRCUITS` (depuis
  `circuits.json`) + `vehicleClassForCar()`.
- ✅ Dialogue « Nouveau setup » : la voiture et le circuit se choisissent
  désormais dans des **listes déroulantes** (voitures groupées par classe via
  `optgroup` ; circuits = catalogue LMU ∪ circuits déjà en garage). Clés i18n
  `setups.car` / `setups.selectCar` ajoutées (4 langues).

### 2026-05-19 — Phase 8 TERMINÉE : Polish (updater, tray, CI)
- ✅ **Version bump** → 3.0.0 (`Cargo.toml`, `tauri.conf.json`).
- ✅ **Auto-updater Tauri** : plugin `tauri-plugin-updater` + `process` câblés ;
  `tauri.conf.json` → `plugins.updater` (endpoint GitHub Releases + clé
  publique), `bundle.createUpdaterArtifacts: true`. Paire de clés de signature
  générée → `_lmu_updater.key` (privée, **gitignorée**) / `.key.pub` (publique,
  intégrée à la config).
- ✅ **System tray** : icône + menu (Ouvrir, Live, Configuration, Vérifier les
  MAJ, Quitter) ; clic gauche → fenêtre. Fermeture de la fenêtre → réduction
  dans le tray si la préférence `system_tray` est active.
- ✅ **Frontend** : `lib/updater.ts` (check + download + relaunch),
  `UpdateBanner` (vérif auto au démarrage si `auto_update`, bannière
  disponible/téléchargement) ; `App.tsx` écoute `tray-nav` (navigation) ;
  bouton « Vérifier les mises à jour » dans Config. Clés i18n `updater.*`
  (4 langues). Plugins JS `@tauri-apps/plugin-updater` + `plugin-process`.
- ✅ **CI** : `.github/workflows/release.yml` réécrit — déclenché **uniquement
  sur tag `v*`** (ou manuel), build NSIS + signature + Release brouillon via
  `tauri-action`.
- ✅ Build OK (`cargo check`, `tsc -b`, `vite build`).
- 📋 **À faire par l'utilisateur** : (1) ajouter le secret GitHub
  `TAURI_SIGNING_PRIVATE_KEY` = contenu de `_lmu_updater.key` ; (2) sauvegarder
  ce fichier (sa perte = updates impossibles) ; (3) confirmer le dépôt
  (`cparfait/lmustatsviewer` dans `tauri.conf.json`) ; (4) 1ʳᵉ release : tag
  `v3.0.0`. Non testable ici : `tauri build` complet + flux de mise à jour réel.

### 2026-05-19 — Lisibilité des tableaux : blocs Identité/Performance/Contexte
- ✅ Sur les 4 tableaux (Meilleurs temps, Sessions, Détails de course,
  Records vue d'ensemble + historique) : ligne d'en-têtes de **groupes**
  (Identité / Performance / Contexte), **fond teinté bleu** sur le bloc
  Performance, **séparateurs verticaux** entre blocs, **lignes alternées**
  (zebra) — surlignages joueur/PB préservés.
- ✅ Filtre de version déplacé du header vers les barres de filtres ;
  colonne « Tracé » retirée du Dashboard ; bandeaux de titres en bleu V1.
- ✅ Build OK (`tsc -b`, `vite build`).

### 2026-05-19 — Navigation : Records dans le header
- ✅ Onglet « Records » retiré du header ; l'accueil (`/`, ex-Dashboard, stats +
  meilleurs temps) est désormais l'onglet **« Records »** du header.
- ✅ La page de progression (`/records`) n'est plus dans la nav : on y accède
  via l'icône Records des tableaux (Dashboard & Sessions, déjà présente).
- ✅ La page `/records` lit les paramètres d'URL (`track/course/class/car`)
  envoyés par l'icône → ouvre directement la progression du combo cliqué.

### 2026-05-19 — Phase 7 TERMINÉE : i18n complet
- ✅ **Records, éditeur de setup, Live** entièrement internationalisés
  (~180 chaînes FR en dur → `t()`), en complément de SessionDetail.
- ✅ Namespaces i18n complétés/créés dans les 4 langues : `records.*` (+45 clés),
  `setupDetail.*` (libellés de sections `.svm`, erreurs), `live.*` (+90 clés :
  télémétrie, panneaux, classement, carte, drapeaux, écrans d'info).
- ✅ Plus aucun texte FR en dur dans les pages de l'application.
- ✅ Build OK (`tsc -b`, `vite build`).
- 📋 **Phase 7 terminée.** Prochaine étape : Phase 8 (Polish — auto-updater,
  system tray, CI, installeur) ou nettoyage du code mort V2.

### 2026-05-19 — Phase 7 : i18n de SessionDetail
- ✅ **`SessionDetail.tsx` entièrement internationalisé** : ~95 chaînes FR en
  dur remplacées par `t()` (en-tête, infos session, 8 onglets, légendes,
  en-têtes de tableaux, comparaison pilotes, graphes).
- ✅ Namespace i18n `sessionDetail.*` ajouté dans les 4 langues (fr/en/es/de),
  avec pluriels i18next (`lapsBehind_one/_other`) et interpolations.
- ✅ Build OK (`tsc -b`, `vite build`).
- ⏳ Reste i18n : Records, éditeur de setup, Live.

### 2026-05-19 — Phase 7 : page Changelog
- ✅ **Page `/changelog`** créée : notes de version en cartes (badge version +
  date, sections Ajouté/Amélioré/… avec icônes). Données dans
  `lib/changelog.ts` (entrée 3.0.0 « en développement »).
- ✅ Route câblée dans `App.tsx` + lien depuis la carte « À propos » de Config.
- ✅ Clés i18n `changelog.*` (4 langues). Build OK (`tsc -b`, `vite build`).
- ⏳ Reste Phase 7 : i18n complet des pages encore en FR en dur (SessionDetail,
  Records, éditeur de setup, Live).

### 2026-05-18 — Phase 7 (partielle) : page Config refondue
- ✅ **`Config.tsx` entièrement réécrit** (disposition 2 colonnes, décisions
  utilisateur). Plus de `useProfileStore`/`useVersion` V2 — tout sur `app.ts`.
  - **Joueur & dossier** : nom du joueur + chemin LMU (sélecteur de dossier +
    détection auto `detect_lmu`/`inspect_lmu`) ; bouton « Enregistrer &
    réindexer » → **dialogue de confirmation** puis `run_setup` (réindexation
    complète) — règle utilisateur « Confirmation puis réindex ».
  - **Apparence & langue** : thème clair/sombre, langue (4 langues),
    **fuseau horaire** (liste IANA, appliqué à l'affichage des dates).
  - **Préférences** : auto-indexation au démarrage, system tray, auto-update.
  - **Maintenance** : synchroniser (delta), réindexer, purger les sessions
    vides, vider le cache + bilan d'indexation.
  - **À propos** : version de l'app (`get_app_version`).
- ✅ **Backend** : nouvelle commande `purge_empty_sessions` (`indexer.rs`) —
  supprime les `xml_index` à `has_any_laps = 0` (cascade) dans une transaction,
  recalcule les `event_id`. Câblée dans `lib.rs`.
- ✅ **`app.ts`** : préférences persistées en config (`timezone`, `auto_index`,
  `system_tray`, `auto_update`) ; `init()` respecte `auto_index` ; actions
  `clearCache`, `purgeEmptySessions`, `setTimezone/AutoIndex/SystemTray/AutoUpdate`.
- ✅ **`utils.ts`** : `formatDateTime` tient compte du fuseau choisi
  (`setAppTimezone`, via `Intl.DateTimeFormat`).
- ✅ ~30 clés i18n `config.*` ajoutées (fr/en/es/de).
- ✅ Build OK (`cargo check`, `tsc -b`, `vite build`).
- ⚠️ Le comportement runtime de **system tray** et **auto-update** est
  persisté mais sera réellement appliqué en **Phase 8** (Polish).
- 📋 **Prochaine étape** : Changelog + i18n complet des pages encore en FR en
  dur (SessionDetail notamment), ou Phase 6 (Live) / Phase 8.

### 2026-05-18 — Phase 4 (Records) mise en attente
- ⏸️ Décision utilisateur : la page **Records** est mise en attente — une
  **refonte** est envisagée. Périmètre/maquette à cadrer avec l'utilisateur
  avant toute implémentation. Ne pas démarrer la Phase 4 tant que ce n'est pas
  défini. 📋 **Prochaine étape** : enchaîner sur une autre phase (5 Garage /
  6 Live / 7 Config), au choix de l'utilisateur.

### 2026-05-18 — Audit complétude V1 : page Sessions corrigée
- ⚠️ Retour utilisateur : toutes les infos des tableaux et filtres V1 doivent être
  reproduites. Audit du rendu HTML complet de `sessions.php` → écarts corrigés :
- ✅ Inventaire exact des colonnes V1 consigné dans **SUIVI §3.8** (référence
  obligatoire avant de finir chaque page).
- ✅ **Backend** : `get_sessions_list` accepte maintenant les **14 colonnes triables**
  de la V1 (Date, Track, TrackCourse, Setting, SessionType, Class, Car, Livery,
  BestLap, GridPos, Position, Progression, Pitstops, GameVersion) ; nouvelle commande
  `get_sessions_overview` (7 compteurs du hero).
- ✅ **`Sessions.tsx`** complété : carte hero (7 compteurs), colonne **Records**
  (icône → page Records), arrivée `P{pos} / {participants}`, en-têtes triables sur
  toutes les colonnes, **cellules cliquables-filtres** (circuit/tracé/type/session/
  classe/voiture), striping par événement, pagination 15/25/50/100/200.
- ✅ Build OK (tsc + vite). 📋 La table complète « meilleurs temps » (16 colonnes,
  groupée par circuit) = page **Records** (Phase 4) — cf. SUIVI §3.8.

### 2026-05-18 — Phase 2 TERMINÉE : frontend Dashboard + Sessions
- ✅ **`src/lib/api.ts`** créé : bridge IPC V3 propre, **sans aucun mock** —
  `invoke()` direct vers Tauri. Types alignés sur le backend (DashboardStats,
  BestLapRow, SessionListRow, SessionsPage, FilterOptions, IndexReport, DetectResult).
- ✅ **`src/stores/app.ts`** créé : store Zustand mono-profil (remplace `useProfileStore`).
  Cycle de vie `init()` (chargement config + sync delta + Dashboard), `runSetup`,
  `syncIndex`, `reindexAll`, filtre de version global.
- ✅ **Pages réécrites** sur le store/bridge V3 :
  - `App.tsx` : gate onboarding basée sur `isConfigured` (plus de multi-profils).
  - `Header.tsx` : nom du joueur (lecture seule) + sélecteur de version global.
  - `Onboarding.tsx` : flux mono-profil `detect_lmu`/`inspect_lmu` → `run_setup`.
  - `Dashboard.tsx` : stats globales V1 + tableau meilleurs tours + graphe classes.
  - `Sessions.tsx` : liste **paginée/filtrée/triée côté backend** (`get_sessions_list`).
- ✅ Helpers `utils.ts` : `formatTime` (secondes→m:ss.mmm), `formatDateTime`,
  `compareVersions`, `formatSectorSeconds`.
- ✅ Clés i18n ajoutées (fr/en/es/de) : `header.gameVersion`, `dashboard.podiums`,
  `dashboard.noData`.
- ✅ 2 erreurs TS **préexistantes** de V2 corrigées (webMock.ts, Progression.tsx).
- ✅ **Build complet OK** : `tsc -b` + `vite build` passent.
- ⚠️ État transitoire : `tauri.ts`/`mockData.ts`/`webMock.ts` encore présents car
  les pages non migrées (Records, Setups, Live, Config, SessionDetail, Progression)
  les utilisent encore. Ils seront **supprimés au fil des phases 3-7**, quand chaque
  page passera à `api.ts`/`app.ts`. `stores/profile.ts` + `stores/version.ts` idem.
- 📋 **Prochaine étape (Phase 3 — Race Details)** :
  1. Étudier `race_details.php` (V1) — 8 onglets : Résultat course, Tours course,
     Meilleurs tours, Stratégie, Incidents, Pénalités, Chat, Comparaison pilotes.
  2. Backend : `commands/session_detail.rs` — `get_session_detail(sessionId)` :
     2 info-cards + classement enrichi + tours par pilote + stints + événements stream.
  3. Réécrire `SessionDetail.tsx` sur `api.ts`.
  4. Test visuel `npm run tauri:dev` (non fait en Phase 2 — nécessite interaction GUI).

### 2026-05-18 — Phase 2 (backend) : commandes de requête + smoke-test
- ✅ **`commands/queries.rs`** créé : `get_dashboard_stats` (stats globales V1 :
  total tours, temps de conduite, meilleur résultat/progression en ligne, podiums,
  circuit/voiture favoris), `get_best_laps` (meilleurs tours groupés circuit/tracé/
  classe/voiture, secteurs absolus + optimal + vmax agrégés — règle `index.php`),
  `get_filter_options`, `get_game_versions`, `get_sessions_list` (paginée + filtrée +
  triée, règles `sessions.php`).
- ✅ Câblé dans `lib.rs` (+ `mod.rs`). `cargo check` PASSE.
- ✅ **SMOKE-TEST sur données réelles** (`cargo test smoke_index_real_data`) :
  les **180 XML réels** du jeu indexés, **0 erreur de parsing**.
  Résultat : 180 sessions, 3907 results (tous pilotes), 3089 results joueur,
  14247 laps, 1865 meilleurs tours joueur. Distinction LMP2 WEC opérationnelle.
  Agrégats best_lap / optimal / vmax cohérents.
- 📋 **Prochaine étape (Phase 2 — frontend)** :
  1. Réécrire `src/lib/tauri.ts` : supprimer mocks/fallbacks, types alignés sur
     queries.rs (DashboardStats, BestLapRow, SessionListRow, SessionsPage,
     FilterOptions, IndexReport, DetectResult). Supprimer `mockData.ts` + `webMock.ts`.
  2. Onboarding mono-profil : `detect_lmu` → confirmation → `run_setup`.
  3. Brancher `Dashboard.tsx` et `Sessions.tsx` sur les vraies données.
  4. `npm run build` (vérif TypeScript) puis test visuel `npm run tauri:dev`.

### 2026-05-18 — Décision : aucune donnée mockée
- ✅ L'utilisateur ne veut **aucune donnée d'exemple/simulée** — uniquement les
  données de production (vrais fichiers du jeu). Conséquence pour la Phase 2 :
  supprimer `mockData.ts`, `webMock.ts` et tous les fallbacks web du bridge IPC.
  Cf. §2 « Pas de données mockées ».

### 2026-05-18 — Phase 1 TERMINÉE : backend Foundations
- ✅ **`xml_parser.rs`** réécrit : extraction du header complet (`DateTime`, `TimeString`,
  `TrackEvent`, session `<Laps>`/`<Minutes>`), de tous les pilotes/tours, et des
  événements `<Stream>` (ChatMessage/Penalty/Incident/Sector/Sent + attribut `et`,
  entités XML décodées). Détection Driver Swap conservée.
- ✅ **`models.rs`** réécrit : helpers V1 — `normalize_car_class` (avec distinction
  LMP2 WEC/ELMS via `<Category>`), `compute_unique_car_name`, `format_game_version`,
  `compute_optimal_lap`, `class_order`, struct `IndexReport`.
- ✅ **`commands/indexer.rs`** réécrit : indexeur delta complet — sync par mtime,
  détection changement de joueur, insertion xml_index/sessions/results/laps/stream_events,
  pré-calcul de TOUS les agrégats V1 par pilote (best_lap 4-chronos, secteurs absolus,
  optimal, vmax, total_laps_valid/time, laps_led, progression, fuel départ/arrivée,
  médiane/écart-type/moyenne-5), `recompute_event_ids` (seuil 7200 s).
  Commandes : `run_setup`, `sync_index`, `reindex_all`, `clear_index_cache`.
- ✅ **`commands/config.rs`** créé (remplace `profiles.rs`, mono-profil) : get/set/all
  config, `detect_lmu` + `inspect_lmu` (Steam registry + libraryfolders.vdf),
  `suggest_player_name` (pilote isPlayer le plus fréquent sur 10 derniers fichiers).
- ✅ **`db.rs`**, **`lib.rs`**, **`commands/mod.rs`** recâblés. `setups.rs` / `live.rs`
  mis en dormance (réactivés Phases 5/6). `profiles.rs` supprimé.
- ✅ **`cargo check` PASSE** (59 s, 1 warning bénin : `class_order` pas encore utilisé).
- 📋 **Prochaine étape (Phase 2)** :
  1. Réécrire le bridge `src/lib/tauri.ts` : commandes config + indexer V3, types
     alignés sur le nouveau schéma. Retirer les entrées V2 obsolètes (profiles…).
     **Supprimer `mockData.ts` + `webMock.ts` et tout fallback web** : le helper
     `call()` appelle directement Tauri, sans données simulées (cf. §2 « Pas de
     données mockées »).
  2. Réécrire l'Onboarding (mono-profil : `detect_lmu` → `run_setup`).
  3. Ajouter au backend les commandes de requête Dashboard/Sessions
     (`get_dashboard_stats`, `get_best_laps`, `get_sessions_list`, `get_game_versions`)
     selon les règles V1 `queries.php` (cf. SUIVI §3.4) — à créer dans un
     `commands/queries.rs`.
  4. Brancher les pages `Dashboard.tsx` et `Sessions.tsx` sur les vraies données.
  5. Smoke-test : `npm run tauri:dev`, lancer l'indexation sur les 180 XML réels
     de `D:\SteamLibrary\...\Results`, vérifier les chiffres.

### 2026-05-18 — Phase 1 (en cours) : backend — schéma SQLite
- ✅ **Décision d'architecture** : V3 stocke **tous les pilotes** de chaque session en base
  (tables `results` + `laps`), au lieu de re-parser le XML pour les détails de course comme
  la V1. Les agrégats par pilote (best_lap, secteurs, optimal, vmax, progression, fuel,
  médiane/écart-type/moyenne 5) sont pré-calculés à l'indexation selon les règles V1.
  Avantage : détails de course instantanés, calculs centralisés une seule fois.
- ✅ **`src-tauri/src/db.rs` réécrit** : schéma SQLite mono-profil, fidèle V1 —
  tables `config`, `xml_index`, `sessions`, `results`, `laps`, `stream_events`,
  `setups` (garage V2, sans profile_id), `ohne_speed_cache`. Base créée from scratch
  (pas de migration d'ancienne base). Fichier : `%APPDATA%\...\lmu_cache.db`.
- ⚠️ **État** : le projet **ne compile plus** tant que la Phase 1 n'est pas finie —
  `models.rs`, `indexer.rs`, `profiles.rs`, les commandes et `lib.rs` référencent encore
  l'ancien schéma V2. C'est attendu pour une réécriture from-scratch.
- 📋 **Prochaine étape (reprise Phase 1)** — dans l'ordre :
  1. `xml_parser.rs` : ajouter au parser l'extraction du header complet (timestamp,
     time_string, track_event, session `<Laps>`/`<Minutes>`) et des `<Stream>` events
     (ChatMessage/Penalty/Incident/Sector/Sent avec attribut `et`).
  2. `models.rs` : redéfinir les structs sérialisables alignées sur le nouveau schéma.
  3. `indexer.rs` : réécrire l'indexeur delta — sync par mtime, normalisation classe,
     `unique_car_name`, `has_any_laps`, Driver Swap, progression, best_lap (4 chronos),
     abs_best secteurs, optimal, vmax, total_laps_valid/time, laps_led, fuel départ/arrivée,
     médiane/écart-type/avg5, `compute_event_groups` (seuil 7200 s). Cf. SUIVI §3.
  4. `profiles.rs` → renommer en `config_cmds.rs` (mono-profil) : get/set config,
     auto-détection chemin LMU (Steam + libraryfolders.vdf), `suggest_player_name`.
  5. Recâbler `lib.rs` (handlers IPC) + `src/lib/tauri.ts` (bridge front).
  6. Vérifier `cargo build` (nécessite Rust + VS Build Tools sur le PC).

### 2026-05-18 — Précisions utilisateur
- ✅ Chemin du jeu LMU fourni : `D:\SteamLibrary\steamapps\common\Le Mans Ultimate` — 180 XML de résultats réels + setups `.svm` disponibles pour le développement et les tests.
- ✅ Plugin shared memory rF2 déjà installé dans `Plugins\` → la page Live pourra être testée directement.
- ✅ **Décision** : la gestion config/garage est reprise de la **V2** (plus aboutie), pas de la V1. Backend de référence : `zz_V2\src-tauri\src\commands\setups.rs`.
