# SUIVI — LMU Stats Viewer V3

> **Document de reprise du projet. À LIRE EN PREMIER.**
> Mettre à jour la section « Journal de bord » à chaque session de travail.
> Dernière mise à jour : 2026-07-07 (**Audit pré-V1.0 + corrections + nettoyage final** — MAJEUR & MINEUR traités, 84 clés + 20 exports morts retirés ; tout vert : build/cargo/eslint 0/121 tests/i18n 1736×4)

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
| **Thèmes** | Dark + Light, toggle header. Palette « Le Mans dark » (#0A0E1A + #FFB400). **Défaut = Light** depuis la préparation « public large » (clé `lmu-theme-v2`, cf. `stores/theme.ts`) ; l'ancien défaut Dark est conservé comme thème au choix. *(Màj 2026-07-06 — supersède « dark par défaut ».)* |
| **Distribution** | `.exe` Windows, installeur Tauri (NSIS), auto-update GitHub. |
| **Langue de travail** | Réponses + docs en FR ; code/variables/fichiers en anglais. |
| **Cadence** | Développement autonome jusqu'à blocage ou point de décision. |
| **Pas de données mockées** | **Aucune donnée d'exemple/simulée.** On travaille uniquement sur les données de production (vrais fichiers du jeu). Supprimer `mockData.ts`, `webMock.ts` et tous les fallbacks web du bridge IPC. Pas de « mode web » avec données simulées. Tests faits sur les fichiers réels de `D:\SteamLibrary\...`. |
| **Overlays in-game** | 🔒 **Figé (2026-07-03)** — la fonctionnalité **existe et est livrée en l'état** (fonctionne en borderless), mais **plus développée** (cf. journal : limite plein écran exclusif + redondance SimHub/TinyPedal). *(Archi : fenêtre Tauri transparente unique `label = overlay`, always-on-top, click-through, config SQLite `overlays_config`, event `overlays-config`, pipeline `live-data`.)* |

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
> **Màj 2026-07-06** : en V3, les 4 premières stats (Temps de conduite, Tours,
> Circuit favori, Voiture favorite) vivent sur la page **/profile** (layout V3
> assumé) ; le Dashboard porte des compteurs de portée (Records, Combos,
> Progression, Meilleur résultat en ligne, Podiums, Victoires, Top 10). Les
> valeurs restent calculées côté Rust (`get_dashboard_stats`), Temps de conduite
> et Tours désormais conformes §3.4 (tours 4-chronos).

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
| 9 | Overlays in-game (Trace HUB) : framework + 9 overlays + mode Édition | 🔒 **Figé (2026-07-03)** | **Fonctionnel et livré en l'état** (page `/overlays`, fenêtre transparente, 9 widgets, drag, persistance ; marche en borderless). Développement **arrêté** (plus de widgets ni de correctif plein écran) — cf. journal. |

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
- **Idée future — intégration leaderboard en ligne (mysimrace)** (2026-06-21) : **l'option qui manque au projet**. mysimrace.com propose un connecteur (basé sur le plugin rF2 standard) qui envoie automatiquement les chronos à chaque tour et alimente des classements communautaires en ligne. Piste : permettre à la V3 d'**envoyer/afficher** les temps du joueur sur mysimrace (ou un leaderboard équivalent) — la dimension « communautaire/compétitive » absente aujourd'hui. À étudier : API mysimrace (auth par nom + mot de passe vue dans le connecteur), envoi des chronos depuis la base SQLite ou le pipeline live, affichage d'un onglet « Classement en ligne ». ⚠️ Dépend d'une API tierce (mysimrace) — vérifier disponibilité/CGU avant. Cf. liste « Projets à surveiller ».
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

### Évolution Coach IA — passer de « analyste » à « entraîneur » (2026-06-22)

> Inspiration : étude de l'app trophi.ai (Unity + backend cloud). Trophi structure tout son coaching autour de **Drills** + **Skill Trees** + **Practice Mode** (trace expert superposée, feedback par mécanique). Notre approche reste **offline-first** (pas de cloud), mais on peut s'inspirer fortement de leur structuration.

#### P1 — Scores de mécaniques par virage (priorité haute)

Ajouter dans `lapMetrics.ts` / `CornerMetrics` :

- `brakeControlScore` (0-100) — régularité de la rampe de freinage (écart-type pente `brake[k+1]-brake[k]` de `brakeIdx` à `peakIdx`)
- `trailBrakingScore` (0-100) — intensité chevauchement frein↔volant entre `peakIdx` et `apexIdx` (actuellement on a juste le booléen `trail` lapMetrics.ts:124)
- `overlapPct` — % du virage avec `brake>5 && throttle>5` simultanément (**métrique clé Trophi** `GetUniversityBrakeThrottleOverlap`, non détectée actuellement)
- `throttleApplicationScore` (0-100) — pente remise des gaz (normalisation de `throttle0to100Ms` déjà calculé lapMetrics.ts:154)
- `trackUsageScore` (0-100) — distance à la ligne médiane. **Nécessite canal `TrackEdge`** : vérifier s'il est exposé par la shared memory LMU. Fallback : `steerCorrections` comme proxy.
- Fusionner `apexSpeedDeltaVsBest` (déjà calculé par `theoreticalBest.ts:compareToBestApex`) dans le `CornerMetrics` pour l'affichage.

Ajouter ligne synthétique dans `summarizeLapMetrics` (lapMetrics.ts:303) pour alimenter le LLM.

**Effort** : ~150 lignes dans `lapMetrics.ts`, 0 nouveau fichier.

#### P2 — Heatmap scores sur trace télémétrie (priorité haute)

Dans `TelemetryView.tsx` : barre colorée par virage (rouge→jaune→vert selon score agrégé P1). Nouveau composant `CornerScoreBar` (~80 lignes), insertion sous graphe existant. Tooltip au hover : "T7 — brake ctrl 78, overlap 5%, throttle 82".

**Effort** : 1 composant + modif mineure `TelemetryView.tsx`.

#### P3 — Détection flags d'erreurs (priorité moyenne)

Générer ces flags dans `cornerMetrics()` :

| Flag | Condition | Icône |
|---|---|---|
| `early_brake` | `brakeIdx` démarre >50m avant point théorique (cf. `trackKnowledge.ts` / ApexPoints) | ⚠️ |
| `overlap` | `overlapPct > 10%` (cf. P1) | ⚠️ |
| `abs_burst` | `absEvents >= 2` (déjà calculé lapMetrics.ts:186) | 🛡️ |
| `tc_burst` | `tcEvents >= 2` (déjà calculé lapMetrics.ts:187) | 🛡️ |
| `understeer_mid` | `steerCorrections > 3` && vitesse apex faible vs best | 🔄 |
| `late_throttle` | `throttleReopenDist` > 30m après apex | ⏱️ |

Affichage : badges discrets dans la table de virages + transmis au LLM dans `summarizeLapMetrics`.

**Effort** : ~50 lignes de heuristiques + intégration UI.

#### P4 — Prompt coach structuré "entraîneur" (priorité moyenne)

Enrichir `telemetry-context.ts:113` (`metricsText`) avec un paragraphe "Mechanics breakdown" nommant les 8 catégories Trophi :

```
## Mechanics breakdown (per-lap average scores)
- Brake control: 78/100 (weakest corner: T3, 42)
- Trail braking: detected on 6/12 corners (50%)
- Brake/throttle overlap: 3 occurrences (T3, T9, T12) ← mistake
- Finding brake points: within ±10m of reference on 10/12 corners
- Min corner speed: -3 km/h vs personal best on T7
- Throttle application: 82/100 (fast reopen)
- Track usage: N/A (no track-edge channel)
```

Réécrire `system.ts` pour posture entraîneur :
- 1 chose bien faite (encouragement ancré sur les données)
- 1 priorité d'amélioration (la plus impactante, avec métrique précise)
- 1 objectif chiffré pour la prochaine session (réaliste, basé sur best self)
- 1 drill suggéré (focus sur un seul point)
- Règle : **jamais plus de 3 conseils** par analyse.

**Effort** : ~30 lignes `summarizeLapMetrics` + ajustement `system.ts`.

#### P5 — Plan d'entraînement persistant (priorité haute, différenciant)

Nouveau concept : le **Plan d'entraînement** (inspiré Practice Mode Trophi mais offline).

**Tables SQLite** (migration `records.rs`) :

```sql
CREATE TABLE training_plans (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  track TEXT NOT NULL,
  car TEXT NOT NULL,
  objectives TEXT NOT NULL,   -- JSON: TrainingObjective[]
  status TEXT NOT NULL,       -- 'active' | 'completed' | 'abandoned'
  updated_at INTEGER NOT NULL
);
CREATE TABLE training_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id TEXT NOT NULL,
  session_file TEXT NOT NULL,
  evaluated_at INTEGER NOT NULL,
  results TEXT NOT NULL,      -- JSON: results par objectif
  best_lap_ms INTEGER,
  FOREIGN KEY (plan_id) REFERENCES training_plans(id)
);
```

**Structure TypeScript** :
```typescript
interface TrainingObjective {
  type: "apex_speed" | "brake_point" | "no_overlap" | "trail_braking" | "throttle_reopen";
  cornerN?: number;        // virage précis ou null = tout le tour
  target: number;
  tolerance: number;
  rationale: string;       // "ton best est 102, tu vises 100 pour commencer"
}
interface TrainingPlan {
  id: string;
  createdAt: number;
  track: string;
  car: string;
  objectives: TrainingObjective[];
  status: "active" | "completed" | "abandoned";
}
```

**Source des objectifs** : déduits automatiquement des faiblesses détectées par P1 (scores mécaniques). Le coach IA propose 1-3 objectifs prioritaires dans son analyse, l'utilisateur valide via bouton "👍 Je prends cet objectif".

**Effort** : 1 migration + store Zustand `trainingPlan.ts` + enrichissement prompt système.

#### P6 — Boucle d'évaluation automatique session-par-session (priorité haute)

**Comportement** :
1. Ouverture nouvelle session télémétrie → détecter `TrainingPlan` actif pour combo track+car
2. Si oui → **évaluer automatiquement** les objectifs sur le meilleur tour
3. Afficher en haut de `TelemetryView` / `AICoachPanel` :
   - "🎯 Objectif T7 ≥ 100 km/h : **RÉUSSI** (101 km/h) ✅"
   - "🎯 Objectif 0 overlap T3 : **ÉCHEC** (2 occurrences) — on réessaie"
4. Mettre à jour le plan + persister dans `training_history`

**Hook** : branche sur l'ouverture de session existante dans `Telemetry.tsx`.
**Nouveau module** : `objective-evaluator.ts` — prend `LapMetrics` + `TrainingObjective[]` → résultats (succès/échec + marge).
**Nouveau composant** : `ObjectiveBanner` affiché en haut de `TelemetryView`.

**Effort** : ~150 lignes + 1 composant UI.

#### P7 — Mémoire & progression (priorité moyenne)

Le coach reçoit en contexte : "Sur les 5 dernières sessions sur ce combo, ton apex T7 est passé de 94 → 99 → 101 km/h. **Tu progresses sur T7** (+7 km/h en 5 sorties). Objectif suivant : stabiliser T3."

**Implémentation** :
- Contexte IA dédié `progress-context.ts` (agrège l'historique)
- Section "Progression" dans `Profile.tsx` ou route `/training` : courbe d'évolution des objectifs sur les N dernières sessions

**Effort** : ~150 lignes + 1 graphe.

#### P8 — Drills ciblés (priorité basse, différenciant)

Inspiré des "University drills" de Trophi mais sans mini-jeu (on reste dans la vraie piste). Le coach propose des **protocoles de session** :

- "Drill Trail Braking : 10 tours concentrés sur T3-T4. Ignore le chrono. But : garder 15% de frein jusqu'à l'apex."
- "Drill Trajectoire : 5 tours en rouvant tôt à l'apex de T9."

Affiché comme **briefing pré-session** dans `AICoachPanel`. Bouton "Suggère-moi un drill pour la prochaine session".

**Effort** : ~80 lignes (surtout textuel/prompt).

#### P9 — Calibration pédale frein (priorité très basse)

Inspiré `BrakeCalibrated` / `CalibratedMax/Min` Trophi. Utile **uniquement** si canal `BrakePressureRaw` (physique) distinct du `Brake` (%) gameplay exposé par shared memory LMU. Si dispo : Min/Max pédale sur session + linéarisation rampe. Sinon : sauter.

**Effort** : 1 modal + ~100 lignes.

#### Synthèse priorité entraînement

| # | Tâche | Effort | Gain coaching |
|---|---|---|---|
| P1 | Scores mécaniques | 150 lignes | Énorme |
| P2 | Heatmap virages | 80 lignes | Énorme |
| P3 | Flags d'erreurs | 50 lignes | Moyen |
| P4 | Prompt structuré | 30 lignes | Moyen |
| P5 | Plans d'entraînement | 250 lignes + migration | Énorme |
| P6 | Évaluation auto | 150 lignes + UI | Énorme (boucle magique) |
| P7 | Mémoire progression | 150 lignes | Moyen |
| P8 | Drills | 80 lignes | Faible mais différenciant |
| P9 | Calibration pédale | 100 lignes | Marginal |

**Recommandation séquence** :
- **Bloc analytique** : P1 → P4 → P2 → P3 (scores + affichage + prompt)
- **Bloc entraîneur** : P5 → P6 → P7 → P8 (objectifs + boucle + mémoire + drills)
- P9 uniquement si `BrakePressureRaw` est exposé.

**Décision ouverte** : mode unique entraîneur (avec analyse à la demande dans le chat) vs toggle analyste/entraîneur ? Recommandation : **mode unique entraîneur**, le LLM s'adapte si on lui dit "just analyse this lap".

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
23. ✅ **FAIT (2026-06-21)** — `alert()`/`prompt()`/`confirm()` natifs de `Setups.tsx` + `SetupDetail.tsx` (13) → store `stores/dialogs.ts` (toasts + `confirmDialog`/`promptDialog` promesses) rendu par `DialogHost.tsx`. i18n `config.confirm`/`cancel` réutilisés.
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
63. ✅ **FAIT (2026-06-21)** — Route 404 catch-all dans `App.tsx` (`NotFound.tsx` + `<Route path="*">`).

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
76. ✅ **FAIT (2026-06-21)** — Error boundary React (`ErrorBoundary.tsx`) autour des `<Routes>` → plus d'écran blanc, Header/Footer préservés.
77. ⏳ Retry fetch ohne_speed avec backoff (actuellement un seul essai).

---

#### T7. Télémétrie & analyse de données

> Lecture des données haute fréquence (fichiers `.bt` et `.duckdb`), visualisation, comparaison.

> **📊 Statut réel (mise au propre 2026-07-03) : T7 ≈ 70 % FAIT.** Le lecteur DuckDB, la
> comparaison de tours + delta, l'analyse assistée, les focus zones, la segmentation de
> piste, les points de freinage et le replay 2D sont livrés ; l'AI Coach + le **coach par
> virage P0→P5** (métriques/virage, diagnostics, heatmap des pertes P5.1, inputs/virage P5.2)
> ont massivement étendu l'analyse. **Restant réel** : export MoTeC `.ld` (#80), rapport PDF
> (#89), comparaison données pros (#91), ghost 3D (#81 reste). #78 (`.bt` binaire) = sans
> objet (on lit le `.duckdb`).

78. ❌ **Télémétrie par canaux `.bt`** — **sans objet** : LMU écrit nativement en `.duckdb`, lu directement (pas de parsing binaire `.bt` requis). Remplacé par #79.
79. ✅ **Lecteur de télémétrie DuckDB** — **fait** : `TelemetryView`/`Telemetry` lisent les `.duckdb` via `telemetry.getChannels` (throttle/brake/steering/speed/temps pneus HF). Sources : alelosbrigia, underlines, lmutrace.com.
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
93. ✅ **AI Coach** — **fait + massivement étendu** : chatbot post-race/télémétrie/live (BYO-key, appels via Rust, contexte `.svm` réel) **+ Coach par virage P0→P5** (mesure, diagnostics, restitution vocale, apprentissage, extensions stint/risque/classe/ghost, tests §14). Cf. sections 5 « AI Coach » + spec `COACH-LIVE-SPEC.md`. Sources : mylmu.app, popometer.io.

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

> **📊 Statut réel (mise au propre 2026-07-03) : surtout À FAIRE.** Le spotter actuel répond
> déjà (statut/écart/carburant/pneus/position/rythme/restant/météo/répète/mute) et le coach
> couvre le per-corner + lift&coast + risque. **Déjà couvert dans T13** : variantes anti-
> répétition (#155, via phrasebank P4.3 + perso `voiceMessages`), fuel-to-end (#157, partiel
> `strategy.ts`), corner naming (#160, partiel). **Le reste = vrai travail neuf** (attack/
> defend, multiclasse, prédictions stands, benchmark arrêt, compounds…). **✅ FAIT
> (2026-07-03)** : #151 **prédiction position sortie stands** (commande vocale « Stand »).

148. ✅ **Analyse attack/defend** — **fait (2026-07-03)** : commande vocale « Rival » → `sectorEdge` compare tes secteurs au rival le plus proche → « plus fort au secteur 1, plus faible au secteur 3 ». (Par secteur, pas par virage — pas de télémétrie rival.) Source : CrewChiefV4.
149. ✅ **Messages multiclasse spécifiques** — **fait (2026-07-03)** : `classRelation` dans la commande « Rival » → « dans ta classe » vs « classe plus rapide, laisse passer » / « plus lente ». Source : CrewChiefV4.
150. ✅ **Silence dans les virages/zones de freinage** — **fait (2026-07-03)** : `inCriticalZone` (frein > 0,5 ou braquage > 0,4) ; les callouts **non-critiques** de `useVoiceCallouts` sont différés (rejoués à la sortie de zone, péremption 4 s), la sécurité (`critical`) passe toujours. Source : CrewChiefV4.
151. ✅ **Prediction position sortie stands** — **fait (2026-07-03)** : commande vocale « Stand » → `predictPitExit` (les voitures du même tour, à moins de `pitLossSeconds` derrière, passent devant) → « Si tu rentres maintenant, tu ressors P8 ». Perte au stand configurable (Config → Spotter). Source : CrewChiefV4.
152. ✅ **Benchmark temps d'arrêt** — **fait (2026-07-03)** : `PitLossTracker` mesure auto la perte (S3 in-lap + S1 out-lap − meilleurs secteurs), sauvegardée par combo (`pit_loss_map`) et injectée dans `pitLossSeconds` → affine #151. Hook `usePitLoss` (App). Source : CrewChiefV4.
153. ⏳ 🟡 **Comparaison de compounds pneumatiques** — "Les tendres sont 0.8s plus rapides que les durs". Source : CrewChiefV4.
154. ⏳ 🟡 **Alerte "leader s'arrête" / "adversaire sort des stands"** — Info stratégique endurance. Source : CrewChiefV4.
155. ✅ **Variantes de messages (anti-répétition)** — **fait** : banque de phrases LLM à slots (P4.3) + personnalisation `voiceMessages` (rotation des variantes). Source : CrewChiefV4.
156. ⏳ 🟢 **Prediction changement météo** — "La pluie devrait arriver dans ~10 min". Source : CrewChiefV4.
157. ✅ **"Fuel to end" avec réserve configurable** — **fait (2026-07-03)** : `fuelToEnd(strategy, reserveLaps)` + commande vocale « Carburant » enrichie (« il te faut X litres de plus » / « assez, marge N tours ») ; réserve réglable (`fuelReserveLaps`, Config → Spotter). Source : CrewChiefV4.
158. ⏳ 🟡 **Suivi arrêts obligatoires adversaires** — Savoir qui a arrêté et qui doit encore arrêter. Source : CrewChiefV4.
159. ⏳ 🟢 **Compte à rebours emplacement stand** — "5-4-3-2-1" avant l'emplacement. Source : CrewChiefV4.
160. 🟠 **Corner name calling** — base : le coach par virage nomme déjà les virages par n° + noms ApexPoints. Reste : l'associer aux **incidents** ("Incident dans le virage 1"). Source : CrewChiefV4.
161. ✅ **Vérification/installation auto du plugin shared memory** — **fait (2026-07-03)** : commande Rust `install_plugin` (copie le DLL bundlé dans `<lmu>/Plugins/`) + bouton « Installer automatiquement » dans le guide plugin (`Live.tsx`), **après confirmation explicite** (écriture dans le dossier du jeu). Repli sur le guide manuel. Source : CrewChiefV4.

---

#### T14. Overlays in-game

> Widgets affichés par-dessus le jeu (always-on-top, click-through).

> **📊 Statut réel (mise au propre 2026-07-03) : base FAITE (Phase 9), reste 🔒 FIGÉ.** La
> **Phase 9** a déjà livré : fenêtre transparente always-on-top (#164), **click-through** (#163),
> drag-to-position + persistance, et **9 des 16 widgets** (#162). ⚠️ **Décision 2026-07-03 :
> overlays FIGÉS** (limite plein écran exclusif + redondance SimHub/TinyPedal) → l'**expansion
> ci-dessous n'est PAS prévue** (7 widgets de plus, radar #167, ahead telemetry #168, ping #169,
> standings enrichi #166, delta transparent #165, combi SHM+REST #170). À ignorer pour la V1.0.

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
| **mysimrace** | **Leaderboard en ligne** — connecteur (plugin rF2 standard) qui envoie tes chronos à chaque tour vers mysimrace.com + classements communautaires. Piste d'**intégration leaderboard** (l'option qui manque au projet). | https://mysimrace.com |

---

> **Priorisation par catégorie** : T1+T6 🔴 fondations → T7+T8+T14 🔴 différenciation → T9+T10+T13 🟡 valeur ajoutée → T3+T4+T5 🟡 qualité → T11+T12+T15+T16 🟢 niche.

---

## 8. Journal de bord

> Format : `### YYYY-MM-DD — Titre` puis ✅ fait / ⏳ en attente / ❌ bloqué / 📋 prochaine étape.

### 2026-07-07 — Nettoyage final pré-V1.0 (bugs mineurs + cohérence + code mort)

Traitement du reliquat MINEUR de l'audit. **Tout vert** : `cargo check` OK, `npm run build` OK, ESLint 0 sur tout le diff, `npm test` 121/121, parité i18n **1736 clés ×4**.

**Bugs mineurs** :
- ✅ Dates Records respectent le fuseau : nouveau `formatDateShort` (utils.ts) remplace le `fmtDateShort` local qui ignorait le fuseau configuré.
- ✅ 6 libellés en dur → `t()` : ScrollToTop (aria + title, **visible**), Header/Live « Toggle theme », TrackMap, OverlayFrame (Réduire/Agrandir/Configurer). +6 clés i18n (`header.toggleTheme/scrollTop`, `telemetry.trackMapAria`, `overlays.scaleDown/scaleUp/configure`) ×4. `useTranslation` ajouté à ScrollToTop/TrackMap/OverlayFrame (la fenêtre overlay a bien le contexte i18n via OverlayRoot).
- ✅ Garde collision `event_id` : `session_detail` filtre les sessions sœurs par `event_id` **ET** `track` (deux circuits au même timestamp ne mélangent plus leurs sessions).

**Cohérence de présentation** :
- ✅ Dashboard : `N/A` → « — » sur Arrivée/Progression hors course (aligné Sessions) ; livrée masquée si = nom voiture ; secteurs sans suffixe « s » (aligné Records) ; ordre colonnes **Date · Version** (aligné Sessions/§3.8).
- ✅ Unité **km/h** ajoutée aux en-têtes Vmax (Dashboard + Records + stat card Records).

**Code mort** :
- ✅ **84 clés i18n mortes** supprimées dans les 4 langues (détection conservatrice : familles dynamiques `telemetry.group.*`/`phase_*` etc. préservées ; suppression par ligne exacte à leaf unique ; parité re-vérifiée). Inclut les 5 clés hero orphelinées par la refonte du hero Sessions.
- ✅ **20 exports morts** retirés : 13 accesseurs lecture-seule de `coach/service.ts` (coachState/Macro/Objectives/Progression/DriverLevel/DrillActive/DrillCounts/StintActive/RiskActive/MappedMacro/HasPhraseBank + onDiagnostic/onRefCaptured), `ai/coach.ts::converse`, `ohne_speed::clearBenchmarkCache`, `staticData::{invalidateStaticDataCache,tierColorMap}`, `drill::isDrillTarget`, `phrasebank::{isPhraseBankEmpty,situationFor}`. (Déjà tree-shakés du bundle ; gain = propreté du source. Tests coach 121/121 inchangés.)

- ✅ **Reliquat traité (même jour)** :
  - **4 clés i18n ambiguës** restantes supprimées (vérifiées mortes : `dashboard.outdatedHidden`, `records.outdatedHidden`, `records.activeVersion`, `config.activeVersion` — 0 réf) → i18n **1736 ×4** (après ajout des 4 clés de la colonne Type ci-dessous).
  - **Classification incidents Vehicle/Other (§3.7)** implémentée : colonne « Type » dans l'onglet Incidents (`sessionDetail.tsx`) — ≥ 2 pilotes impliqués → « Voitures », 1 → « Individuel » (comptage filtré par `driverNames`, sans compter les scores de sévérité). +4 clés i18n (`colType`, `colTypeTip`, `typeVehicle`, `typeOther`) ×4.
  - **Alias route `/config-v2`** supprimé (`App.tsx`) — plus aucun lien ne le référençait.
- ✅ **Points « à confronter au PHP V1 » — clos sans action** : `format_game_version` multi-segments et fuel « dernier tour ». **Règle d'or** (CLAUDE.md) : la migration est terminée, **la V3 fait foi** et la V1 PHP n'est plus une référence → le comportement V3 actuel est authoritatif. Aucune divergence à corriger.
- 📋 **Prochaine étape** : test en conditions réelles (poste vierge) — case « version uniquement », cellules cliquables Dashboard, deep-link `?tab=`, colonne Type des incidents. **Audit fonctionnel pré-V1.0 : entièrement traité.**

### 2026-07-06 — Corrections d'audit appliquées (pré-V1.0)

Traitement des constats de l'audit du jour. **Tout vert** après coup : `cargo check` OK, `npm run build` OK, ESLint 0 sur tous les fichiers touchés, `npm test` 121/121, parité i18n stricte **1814 clés ×4**.

**Backend Rust** :
- ✅ Dashboard `totalLaps`/`totalDrivingTime`/distance valide → lus depuis les agrégats `results` (SUM `total_laps_valid`/`total_lap_time`), **conformes §3.4** et cohérents avec les favoris. `total_laps` = tous tours (enrichissement V3), `total_laps_valid` = 4-chronos. (`queries.rs`)
- ✅ Garde `class_position ≥ 1` sur podiums/top5/top10/best_finish (global + online + offline) : une position 0 fantôme (balise XML absente) ne compte plus. (`queries.rs`)
- ✅ Ordre de classe : `LMP2` nu = 3 (famille LMP2, avant LMP3) au lieu de 99 après GTE ; `models.rs::class_order` **et** le CASE SQL de tri (`queries.rs`) synchronisés.
- ✅ `purged_files` désormais vidé au changement de joueur (`indexer.rs`).
- ✅ Records : `get_records_overview(min_version, version_exact)` — filtre `=` si exact (`records.rs`).

**i18n / frontend** :
- ✅ 2 clés affichées brutes corrigées : `common.close` → `coach.close` (HelpModal), `sessions.colDate` → `sessions.date` (Telemetry).
- ✅ Pluriel `sessions.filteredCount` : suffixe v3 `_plural` → `_one`/`_other` (i18next v26) ×4.
- ✅ Regex incidents : `[a-zA-Z0-9…]` → `[\p{L}…]/u` (noms accentués comptés). (`SessionDetail.tsx`)
- ✅ +4 clés (`sessions.heroCars/heroTracks/heroLayouts` + `sessions.versionExact`) ×4.

**UI (4 des 5 MAJEUR livrés ; le 5ᵉ = hero Dashboard, acté comme layout /profile §3.8)** :
- ✅ Hero **Sessions** conforme §3.8 (Sessions·Courses·Qualifs·Essais·Voitures·Circuits·Tracés) via `get_sessions_overview` → **fin des stats calculées sur la page paginée** (plus de chiffres « carrière » qui changeaient à chaque page).
- ✅ **Dashboard** : cellules Type/Session/Classe/Voiture **cliquables-filtres** (comme Sessions).
- ✅ **SessionDetail** : deep-link `?tab=` honoré (état déplacé dans `SessionView`, là où sont les onglets). Le lien `?tab=laps` de `LapChartModal` ouvre enfin l'onglet Tours.
- ✅ **Case « cette version uniquement »** (§3.8, était non branchée) : flag store `versionExact` + case à cocher sur Sessions/Dashboard/Records, filtre `=` (backend pour Sessions/Records, client pour Dashboard). N'apparaît que si une version est sélectionnée.

**Repo** :
- ✅ `.gitignore` : `src-tauri/resources/**/*_bak/` (~800 Mo de sauvegardes voix/modèles ne risquent plus un commit accidentel).

**Doc** : §2 (thème défaut = Light, supersède « dark par défaut ») et §3.8 (hero Dashboard → /profile) mis en accord avec le code.

- ⏳ **Reste (non bloquant V1.0, cf. audit)** : ~153 clés i18n mortes + ~20 exports morts (nettoyage cosmétique) ; cohérences mineures N/A vs « — », Vmax sans unité, ordre Date/Version, secteurs avec/sans « s » ; dates Records hors fuseau (`fmtDateShort`) ; classification incidents Vehicle/Other (§3.7) non affichée ; alias route `/config-v2` ; divergences à confronter au PHP V1 (`format_game_version` multi-segments, fuel « dernier tour »).
- 📋 **Prochaine étape** : décider du nettoyage des clés/exports morts (script de purge) ; passer les 6 aria-labels en dur par `t()` ; harmoniser N/A/« — » et unités.

### 2026-07-06 — Audit fonctionnel complet pré-V1.0 (5 axes, en parallèle)

Audit avant lancement V1.0 : calculs métier Rust vs règles §3, pont IPC, code mort, i18n, conformité UI vs §3.8/§4. Builds verts au moment de l'audit : tests 121/121, `npm run build` OK, `cargo check` OK.

- ✅ **Sain** : pont IPC parfait (87 commandes Rust = 87 enregistrées = 87 appelées, 0 orphelin, events tous appariés) ; aucune donnée mockée ; 0 TODO/FIXME/console.log de debug ; aucun fichier/route mort ; parité i18n stricte 1810 clés ×4 langues ; formatage temps conforme §3.5 ; sentinelles 99/−99 proprement remplacées par NULL.
- ❌ **MAJEUR calculs** : Dashboard `totalLaps`/`totalDrivingTime` calculés sur `laps.is_valid` (= lap_time>0 seul) au lieu des tours 4-chronos (règle §3.4) → deux définitions de « tour valide » coexistent (queries.rs:209-233 vs indexer.rs:645).
- ❌ **MAJEUR UI** (5) : cellules cliquables-filtres absentes du Dashboard (§3.8) ; case « cette version uniquement » jamais branchée (backend `version_exact` prêt, aucune UI) ; stats hero de Sessions calculées sur la page paginée courante (trompeur) ; hero Dashboard ≠ §3.8 (Temps de conduite/Tours/favoris déplacés sur /profile sans MAJ du SUIVI) ; deep-link `?tab=laps` de LapChartModal ignoré par SessionDetail.
- ❌ **i18n** : 2 clés utilisées non définies (`common.close` HelpModal.tsx:79, `sessions.colDate` Telemetry.tsx:279 — affichent la clé brute) ; `sessions.filteredCount_plural` en suffixe v3 ignoré par i18next v26 (→ `_one`/`_other`) ; 153 clés mortes ; 6 aria-labels en dur.
- ⚠️ **Risque repo** : `voices_bak/` (516 Mo) + `models_bak/` (282 Mo) sous `src-tauri/resources/` NON couverts par `.gitignore` → ~800 Mo committables par accident. Supprimer ou ignorer avant release.
- ⚠️ **Mineurs notables** : classe `LMP2` nue triée à 99 (après GTE) ; `purged_files` non purgé au changement de joueur ; incidents front sans classification Vehicle/Other + regex sans accents (SessionDetail.tsx:118) ; podiums/bestFinish sans garde `class_position ≥ 1` ; N/A vs « — » incohérents Dashboard/Sessions ; thème par défaut light ≠ §2 « dark par défaut » (choix récent non documenté) ; ~20 exports morts (13 accesseurs `coach/service.ts`) ; dates Records hors fuseau configuré (`fmtDateShort`).
- 📋 **Prochaine étape** : corriger dans l'ordre — (1) `.gitignore` `*_bak`, (2) les 2 clés i18n cassées + pluriel `filteredCount`, (3) unification « tour valide » Dashboard, (4) les 5 MAJEUR UI (ou acter les déplacements hero/profile dans §3.8), puis nettoyage mineurs.

### 2026-07-05 — Préparation public large : robustesse, Config V1 supprimée, visite guidée + aide

Suite de l'audit du jour, décisions utilisateur : diffusion **publique large**, Config V2 validée (après vérif de parité), onboarding complet.

- ✅ **Robustesse** : `indexer.rs` — l'`unwrap()` sur `path.file_name()` (chemin de prod, crash possible au premier scan) remplacé par un `continue` défensif. Le second `unwrap()` signalé (l.827) était dans `#[cfg(test)]` → non concerné. `cargo check` OK.
- ✅ **Parité Config V1 → V2 vérifiée puis comblée** : 7 fonctions manquaient en V2 (toggles coach Drill/Stint/Risque/Phrasebank + boutons Générer/Vider, import ghost `.duckdb`/`.ld`, Perte au stand, Réserve carburant) → toutes portées dans `ConfigV2.tsx` (section Audio/Voix + Spotter). **`Config.tsx` (V1, 2312 l.) supprimée** ; `/config` et `/config-v2` pointent tous deux sur la V2 (aucun lien cassé) ; menu Header → `/config`.
- ✅ **Visite guidée** (`src/components/GuidedTour.tsx` + `stores/tour.ts`) : 9 étapes expliquant tout (stats, références, garage, live+plugin, télémétrie+recording, spotter+raccourcis, coach par virage/IA, overlays, aide). Lancée automatiquement à la fin de l'onboarding (`Onboarding.tsx:handleFinish`), navigation clavier ←/→/Échap, rendue globalement dans `App.tsx`.
- ✅ **Modale d'aide** (`src/components/HelpModal.tsx`) : icône « ? » dans le Header → raccourcis globaux (valeurs réelles du store, « non défini » si vide), prérequis par fonction (plugin shared memory, Telemetry Recording, voix à télécharger, clé API optionnelle), bouton « Revoir la visite guidée », liens Changelog/Discord.
- ✅ **i18n** : +68 clés (`tour.*` 47, `help.*` 21) ×4 langues → parité stricte maintenue (extract_keys OK).
- ✅ Vérifs : `tsc` 0 erreur, ESLint (1 warning préexistant Profile.tsx), 121/121 tests coach, `npm run build` OK, `cargo check` OK.
- ✅ **Correctif d'audit (même jour)** : P5.3/P5.4 ne sont **pas** des stubs — vérification ligne à ligne : logique complète (`stint.ts` dérive vmin/lift & coast/out-lap, `risk.ts` coupures/cible de classe), branchée dans `service.ts` (y c. `classBestSectors()` l.600), 5 clés vocales ×4 langues présentes. L'audit du matin s'était trompé (les `return null` sont le chemin nominal « rien à signaler »). Seule réserve réelle : pas de suite de tests dédiée ni de validation en roulage.
- 📋 **Prochaine étape** : tester la visite guidée en conditions réelles (poste vierge) ; valider P5.3/P5.4 en roulage + suite de tests dédiée ; supprimer le warning `Trophy` de Profile.tsx.

### 2026-07-05 — STT obligatoire dans tout build (fin de la feature Cargo `stt`)

Décision utilisateur : les commandes vocales font partie de l'app de base ; seuls les
modèles par langue restent téléchargeables (déjà en place via `assets.rs`).

- ✅ **Cargo** : `vosk` devient une dépendance standard ; feature `stt` supprimée (`Cargo.toml`, `build.rs` sans early-return, plus aucun `#[cfg(feature = "stt")]` dans `mod.rs`/`lib.rs`/`assets.rs` — le catalogue propose toujours les 4 modèles Vosk). Conséquence : `fetch-vosk.ps1` (libvosk) est **requis pour compiler**.
- ✅ **Bundle unifié** : les 4 DLL Vosk rejoignent `tauri.conf.json` ; `tauri.stt.conf.json` supprimé ; scripts npm `tauri:dev:stt`/`tauri:build:stt` supprimés (le build standard fait tout) ; CI `release.yml` sans `args`.
- ✅ **Textes/docs dépoussiérés** : clé i18n `config.spotterCmdTestUnavailable` (×4) pointe vers le téléchargement en Config (plus vers `tauri:dev:stt`) ; commentaires `AICoachPanel`/`SpotterCommandsModal`/`useCoachVoice`/`VoiceDownloads`/`stt.rs` ; README §assets vocaux + build ; MAINTENANCE §4.1/4.4/4.5 ; RELEASE A.3/A.4 ; hint de `fetch-vosk.ps1`.
- ✅ Vérifs : **`cargo build` complet** (link libvosk OK), `tsc + vite build`, ESLint, 121/121 tests, i18n 1788 clés ×4.
- ✅ **Poids mesuré** : installeur complet (STT inclus) = **44 Mo** au lieu de 650 (−93 %) — build local `npm run tauri:build` OK. Le « Error … no private key » en fin de build = signature updater sautée faute de `TAURI_SIGNING_PRIVATE_KEY` (normal hors `release.ps1`/CI, qui la fournissent).
- ✅ **Modale d'intro aux annonces vocales** (retour utilisateur) : à l'activation du toggle « Annonces vocales », si la voix neuronale de la langue manque, `VoiceIntroModal` (pattern `AiCoachHelpModal`) explique ce qui parle (alertes/coach/spotter), pourquoi la voix se télécharge (~60 Mo, une fois, hors-ligne ensuite), le repli voix Windows, et embarque `VoiceDownloads` (liste + progression). Note sur le modèle STT séparé (proposé à l'activation du spotter). 5 clés `voiceIntro*` ×4 langues.
- ✅ **Clarification coach vs IA** (retour utilisateur : « les 4 options Coach, c'est pas de l'IA ? ») : intertitre « Coach de pilotage (automatique) » + description (déterministe/hors-ligne, seule « Phrases variées » appelle l'IA une fois) au-dessus des 4 toggles dans Config V2 ; libellés raccourcis (`coachDrill` → « Mode Drill », etc. — le préfixe « Coach — » disparaît) ; `aiCoachDesc` précise « questions libres à un LLM, indépendant du coach automatique ». 2 clés `coachSectionTitle`/`coachSectionDesc` ×4 langues.
- ✅ **UX retouchée** (retour utilisateur : téléchargement pas intuitif, enterré dans la section repliée) : `VoiceDownloads` gagne un `variant="banner"` — bandeau ambré affiché **directement dans la page** Config → Audio / Voix (sous le toggle Annonces pour la voix, sous le toggle Spotter pour le modèle Vosk), avec bouton « Télécharger (61 Mo) » + progression intégrés ; disparaît une fois installé. Le badge `voiceEngineFallback` (qui débordait) est raccourci (« ⚠ repli voix système ») ; 2 nouvelles clés i18n `assetVoiceMissing`/`assetSttMissing` (×4).
- 📋 **Prochaine étape** : test E2E d'un téléchargement de voix + modèle Vosk sur poste « vierge » (installer le .exe, ou en dev renommer `resources/tts/voices` et `resources/stt/models`) ; item changelog « installeur allégé (650 → 44 Mo), voix téléchargeables ».

### 2026-07-05 — Voix TTS/STT téléchargées à la demande (installeur 650 Mo → ~100 Mo attendu)

Implémentation du plan validé (cf. entrée d'analyse du même jour) :

- ✅ **Backend** : nouveau `src-tauri/src/commands/assets.rs` — catalogue des 9 voix Piper (URLs HuggingFace figées sur le commit `e21c7de8`, SHA-256 vérifiés au téléchargement via `ring`) + 4 modèles Vosk (zips alphacephei, extraits avec aplatissement du dossier racine via crate `zip`, garde anti path-traversal). Commandes `assets_catalog` / `asset_download` (async, progression via l'événement `asset-progress`, garde anti double téléchargement, écriture `.part` puis rename). Cible : `app_data_dir/tts/voices` et `app_data_dir/stt/models/<code>`.
- ✅ **Résolution** : `tts_bases()` / `stt_bases()` scannent `app_data_dir` en premier → les modèles téléchargés sont vus par `tts_available`/`tts_list_voices`/`stt_available` sans autre changement. Les modèles STT ne sont proposés au catalogue que si la feature `stt` est compilée.
- ✅ **Bundle** : `tauri.conf.json` n'embarque plus que `resources/tts/piper` (moteur, ~38 Mo) ; `tauri.stt.conf.json` garde les DLL Vosk mais plus les modèles. Les exécutables restent bundlés (télécharger un .exe au runtime = risque antivirus) ; seuls des fichiers de données sont téléchargés.
- ✅ **Frontend** : composant `VoiceDownloads` (Config V2 → Audio / Voix : voix de la langue active avec bouton « Télécharger (61 Mo) », barre de progression, toasts ; idem modèle Vosk sous le spotter). Rafraîchit `tts/stt_available` après installation (`assetsVersion`). Invite unique dans Live si annonces actives + voix Piper manquante (`live.voiceDlHint`). Groupe `assets` dans `api.ts`.
- ✅ **i18n** : 11 clés `config.asset*` + `live.voiceDlHint` + reformulation `config.voiceEngineFallback` — FR/EN/ES/DE équilibrés (1788 clés partout, extract_keys OK).
- ✅ Vérifs : `cargo check` (avec et sans `--features stt`), `tsc + vite build`, ESLint, 121/121 tests coach.
- 📋 **Prochaine étape** : builder l'installeur (`release.ps1`) pour mesurer le gain réel ; tester un téléchargement de bout en bout (renommer temporairement `src-tauri/resources/tts/voices` pour simuler un poste vierge) ; prévoir l'item changelog « installeur allégé, voix téléchargeables » ; si HuggingFace/alphacephei posent problème un jour, basculer les URLs du manifeste vers des assets d'une release GitHub dédiée.

### 2026-07-05 — Vérification changelog 1.0.0 + posts d'annonce forum (FR/EN)

**Contexte** : préparation de l'annonce publique de la v1.0 (passage 0.9.4 → 1.0.x) sur les forums LMU. Audit de l'entrée changelog 1.0.0 (`src/lib/changelog.ts`) contre l'état réel du code (routes, `overlays.ts`, README).

- ✅ **Changelog 1.0.0 complété** (2 items joueur manquants, ×4 langues) : **ingénieur de course vocal / spotter** (annonces automatiques + commandes vocales offline Vosk + catalogue personnalisable — l'item « Live voice coaching » ne couvrait que le push-to-talk coach) et **page Profil** (heatmap d'activité + régularité).
- ✅ **README corrigé** : « 16 overlays » → **23** (compte réel de `OverlayId` dans `src/lib/overlays.ts` ; le « 20+ » du changelog était correct).
- ✅ **Posts d'annonce v1.0 rédigés** (FR + EN) pour les forums LMU — ton « pilote débutant + codeur débutant, seul avec l'aide de l'IA », remis dans la conversation (non versionnés).
- 📋 **Prochaine étape** : penser à une entrée changelog pour la prochaine release (les travaux en cours — coach par virage P2/P3/P4, MoTeC, pit loss, rival — ne sont pas couverts par l'entrée 1.0.0).

### 2026-07-05 — Documentation de release + ajout de données (`RELEASE.md`)

**Livré** : nouveau fichier **`RELEASE.md`** à la racine, doc opérationnelle vérifiée contre
le code, en deux parties :
- **A. Sortir une version** : `version.json` (source unique ; `build.rs` synchronise
  package.json/Cargo.toml/tauri.conf.json + injecte `APP_VERSION`) ; procédure = bump →
  commit → `git tag vX.Y.Z` → push (déclenche `.github/workflows/release.yml` : fetch
  Piper/Vosk → build `--features stt` → **release brouillon** signée + `latest.json`) →
  publier ; secrets (`TAURI_SIGNING_PRIVATE_KEY` = `_lmu_updater.key`) ; build local
  (`tauri:build` vs `:stt`, sortie `target/release/bundle/nsis/…setup.exe`) ; auto-update
  (endpoint GitHub `latest.json` + pubkey) ; checklist.
- **B. Ajouter des données/assets** : voiture (`public/data/cars.json`), circuit
  (`public/data/circuits.json`), logo (`public/logos/`), image voiture (`public/cars/`,
  slug `.webp/.png/.svg`, scripts `process_cars*.py` / `gen-car-placeholders.mjs`), volant
  (`public/steering_wheels/` + `src/lib/steeringWheels.ts`, `optimize-steering-wheels.py`),
  drapeau (`public/flags/<iso>.png`), élévation (`trackElevation.json`), version de jeu
  (auto-détectée) + tableau récap « quel fichier pour quoi ».

**📋 Prochaine étape** : prêt pour la V1.0 (cf. checklist §A.6 de `RELEASE.md`).

### 2026-07-05 — Analyse : sortir les voix TTS/STT de l'installeur (lecture seule, aucun code modifié)

Question : l'installeur pèse 650 Mo — proposer les voix en option et les télécharger au premier lancement ?

- ✅ **Diagnostic** : ~890 Mo de ressources bundlées = TTS Piper 553 Mo (moteur 38 Mo + **9 voix .onnx ≈ 516 Mo**, 4 langues) + STT Vosk ~335 Mo (4 modèles ≈ 282 Mo + DLL ≈ 53 Mo). Un utilisateur n'a besoin que d'1 langue (~61 Mo TTS + ~66 Mo Vosk) → ~85 % du poids est inutile pour chacun.
- ✅ **Faisable et recommandé** : téléchargement **in-app au premier usage** (pas une option NSIS). Le code s'y prête déjà : `tts.rs` scanne des dossiers candidats (`tts_bases()`) → ajouter `app_data_dir` est trivial ; le repli voix navigateur existe déjà si les fichiers manquent ; `scripts/fetch-piper.ps1` contient déjà les URL HuggingFace. Bonus majeur : les MàJ auto (updater) ne repousseront plus 650 Mo à chaque version.
- ✅ **Garder bundlés** : `piper.exe` + espeak-ng-data (38 Mo) et les DLL Vosk (53 Mo) — télécharger des exécutables au runtime = risque antivirus/SmartScreen ; seuls les modèles `.onnx`/Vosk (données) sont téléchargés. Installeur cible ≈ 100 Mo.
- 📋 **Prochaine étape** (si validé) : héberger les modèles en assets d'une release GitHub dédiée (URLs stables + SHA-256) ; commande Rust de téléchargement avec progression ; ajouter `app_data_dir` aux bases TTS/STT ; UI Config « Télécharger la voix (61 Mo) » par langue + invite au premier lancement.

### 2026-07-05 — Audit complet de l'application (lecture seule, aucun code modifié)

Tour d'horizon en profondeur (frontend/UX, coach/spotter, backend Rust, i18n, chantier en cours) à la demande de l'utilisateur, en vue de l'adoption par d'autres joueurs. Constats principaux :

- ✅ **i18n exemplaire** : 1777 clés strictement identiques FR/EN/ES/DE ; 178 clés vocales à parité. Seules 9 strings en dur (aria-labels/titles, dont 7 en FR : `ScrollToTop.tsx`, `OverlayFrame.tsx`, `TrackMap.tsx:534`, `SetupCompare.tsx:352`).
- ✅ **Tests verts** : 121/121 (`npm test`), tsc/eslint/build/cargo check OK. Chantier coach P0→P4 + P5.5 quasi complet ; **P5.3 (stint) et P5.4 (risque) = stubs** (~40 %, logique métier manquante).
- ❌ **Découvrabilité** : `/changelog` n'est accessible que via un lien dans Config (aucune entrée Header/Footer) ; `/records` absente du menu (le libellé « records » du menu pointe `/`) ; 6 raccourcis globaux (Alt+S/M/R/T/C/O) documentés nulle part hors Config ; entrée « Références » disparaît silencieusement si ohne_speed OFF.
- ❌ **Robustesse backend** : `indexer.rs:273` et `:827` (`unwrap()` sur chemin/read_dir → crash si dossier résultats invalide) ; erreurs HTTP IA remontées en string (`ai.rs:183`, 401/429/5xx indistinguables) ; parseur MoTeC `.ld` (`motec.rs`) jamais validé sur fichier réel.
- ⚠️ **Dette** : Config.tsx (2312 l.) + ConfigV2.tsx (2113 l.) coexistent ; ~3000 insertions non commitées (monolithe) ; `driving.ts` = stub inutilisé ; pas de corpus d'or annoté pour le coach (spec §14 point 6).
- Rapport détaillé + recommandations d'adoption livrés en conversation (session du 2026-07-05).

✅ **Suite immédiate (même session)** : lien « Notes de version » ajouté au Footer (`Footer.tsx`, clé i18n `changelog.title` existante ×4) → le Changelog est désormais découvrable ; commit + push de tout le chantier en cours (demande utilisateur).

📋 **Prochaine étape** : corriger les 2 `unwrap()` d'`indexer.rs`, ajouter une modale « Raccourcis clavier », finir ou masquer P5.3/P5.4 (toggles sans effet).

### 2026-07-03 — T13 #157 (fuel-to-end) + #161 (install plugin) + #150 (silence en freinage)

**Trois items T13, choix utilisateur** (#161 « en prévenant l'utilisateur » = pas d'install silencieuse).

**#157 — « Carburant pour finir » avec réserve** :
- ✅ **`strategy.ts`** : `fuelToEnd(snapshot, reserveLaps)` (litres à ajouter avec réserve, suffisant ?, marge en tours) + type `FuelToEnd`.
- ✅ **`spotter.ts`** : `case "fuel"` enrichi (`computeStrategy` + `fuelToEnd`) → « il te faut X L de plus » / « assez, marge N tours » ; repli sur l'autonomie brute. Param `fuelReserveLaps` sur `buildAnswer`.
- ✅ **Store** `fuelReserveLaps` (clé `fuel_reserve_laps`, défaut 1) + **Config** (champ, section Spotter) + `useSpotter` le passe. **i18n ×4** (`spFuelShort`/`spFuelToEnd`/`config.fuelReserve*`).

**#161 — Installation auto du plugin (avec confirmation)** :
- ✅ **Rust `install_plugin(lmu_path, app)`** (`system.rs`) : résout le **DLL bundlé** (ressource Tauri) → copie dans `<lmu>/Plugins/` (créé au besoin). Enregistré `lib.rs`. `cargo check` ✅.
- ✅ **`api.ts`** `system.installPlugin` + **`Live.tsx`** : bouton « Installer automatiquement » en tête du `PluginInstallGuide`, **`confirmDialog` avant** toute écriture (dossier du jeu), toast succès/échec, repli sur le guide manuel. **i18n ×4** (`pluginInstallAuto/AutoConfirm/Ok/Err`).

**#150 — Silence en zone de freinage/virage** :
- ✅ **`driving.ts`** : `inCriticalZone(brake, steer)` (frein > 0,5 **ou** braquage > 0,4).
- ✅ **`Live.tsx` `useVoiceCallouts`** : import `speak as rawSpeak` + wrapper local `speak` — les callouts **non-critiques** sont mis en file en zone critique et **rejoués à la sortie** (péremption 4 s) ; les `critical` (drapeaux, pénalités, dégâts, carburant) passent toujours.

**✅ Validé** : **`npm test` = 121/121** (+10 : `fuelToEnd`, `inCriticalZone`), `tsc -b` ✅, `eslint` ✅,
`cargo check` ✅, `npm run build` ✅.

**⚠️ Réserves** : #157 réserve globale (pas par circuit). #161 nécessite le **dossier LMU connu**
(sinon bouton masqué → guide manuel) et un **rebuild** pour que `install_plugin` existe ; écriture
dans le dossier du jeu **uniquement après confirmation**. #150 seuils frein/braquage à confirmer
en piste ; les commandes vocales du spotter restent immédiates (seuls les callouts **auto** sont différés).

**📋 Prochaine étape** : T13 quasi épuisé (reste #153 compounds, #156 météo, #159 compte à rebours,
#160 incidents — plus spécialisés). Sinon autre thème (T9 stats, T11 stratégie) ou pause.

### 2026-07-03 — T13 #148 (attack/defend) + #149 (multiclasse) : commande vocale « Rival »

**Contexte** : les deux items portent sur le **rival le plus proche** → livrés ensemble via
une commande spotter « Rival » (choix utilisateur : #148 + #149, pas #154/#158).

**Livré** :
- ✅ **`rival.ts` (pur, testé)** : `nearestRival` (voiture la plus proche devant/derrière dans
  3 s) ; `classRelation` (#149 : `same`/`faster`/`slower`/`other`, via `classOrder` de `utils.ts`
  — pas de 6ᵉ copie) ; `sectorEdge` (#148 : compare tes `last_sectors` aux secteurs du rival →
  secteur le plus fort/faible) ; `buildRivalInfo` (synthèse).
- ✅ **Commande spotter `rival`** : intention + grammaire ×4 (« rival », « bagarre », « battle »,
  « duel »…) + `case "rival"` dans `buildAnswer` assemblant côté/écart + classe + forces secteur.
- ✅ **i18n ×4** : `live.spRival*` (8 clés) + `config.spotterCmdRival` + `spotterTalkCommands`.
- ✅ **Validé** : **`npm test` = 111/111** (+17 : `classRelation`, `sectorEdge` fort/faible/vide,
  `nearestRival`/`buildRivalInfo` côté+classe+secteur+aucun-rival), `tsc -b` ✅, `eslint` ✅,
  `npm run build` ✅.

**⚠️ Réserve** : #148 compare **par secteur** (S1/S2/S3), pas par virage (pas de télémétrie du
rival exposée) ; faster/slower ne s'affiche que si les deux classes sont dans `classOrder`
(sinon « autre classe »). Commande vocale → nécessite le build STT.

**📋 Prochaine étape** : T13 quasi épuisé côté « faisable sans télémétrie rival ». Restant utile :
#150 (silence dans les virages), #156 (prédiction météo), #159 (compte à rebours emplacement).
Sinon autres thèmes (T9 stats, T11 stratégie) ou pause.

### 2026-07-03 — T13 #152 : **benchmark automatique du temps d'arrêt** (affine #151)

**Contexte** : complément de #151. Au lieu d'une perte au stand estimée à la main, on la
**mesure automatiquement** à chaque arrêt et on l'applique par circuit×voiture.

**Livré** :
- ✅ **`pitLoss.ts` (pur, testé)** : `computePitLoss(inLapS3, outLapS1, refS3, refS1)` = surplus
  du S3 d'entrée + du S1 de sortie vs meilleurs secteurs (filtré 5–120 s) ; `PitLossTracker`
  (machine à états : entrée stands → clôture in-lap [saisit S3] → clôture out-lap [saisit S1] →
  perte) alimenté par instantané/trame.
- ✅ **`usePitLoss.ts`** (monté App) : abonné `live.onData`, alimente le tracker, **enregistre**
  la perte mesurée par combo + **applique** la perte connue au changement de combo. Toast à la mesure.
- ✅ **Store** : `pitLossByCombo` (persisté `pit_loss_map`) + `recordPitLoss`/`applyPitLossForCombo` ;
  la mesure met à jour `pitLossSeconds` → **#151 utilise la vraie valeur**.
- ✅ **i18n ×4** : `live.pitLossMeasured` + `config.pitLossDesc` (mention « mesuré automatiquement »).
- ✅ **Validé** : **`npm test` = 94/94** (10 nouvelles : `computePitLoss` bornes + `PitLossTracker`
  séquence d'arrêt complète / sans arrêt), `tsc -b` ✅, `eslint` ✅, `npm run build` ✅.

**⚠️ Réserve** : l'attribution S3/S1 suppose l'entrée pit en fin de tour et la sortie en début
de tour suivant (cas standard LMU) ; un box très en amont/aval pourrait décaler la mesure — le
filtre 5–120 s écarte les valeurs aberrantes. Passif : ne mesure que quand le flux live tourne.

**📋 Prochaine étape** : autres briques T13 — #149 messages multiclasse, #148 attack/defend,
ou #154/#158 (suivi des arrêts adverses).

### 2026-07-03 — Backlog remis au propre + **T13 #151 (prédiction position sortie stands)**

**1) Mise au propre du suivi** (T7/T13/T14) : le backlog surestimait le « restant ».
Bannières de statut ajoutées + marqueurs corrigés :
- **T7 (Télémétrie)** ≈ **70 % FAIT** — #79 lecteur DuckDB ✅, #93 AI Coach ✅ (+ coach P0→P5).
  Restant réel : export MoTeC (#80), PDF (#89), comparaison pros (#91), ghost 3D. #78 `.bt` sans objet.
- **T13 (Spotter avancé)** = surtout à faire ; déjà couvert : #155 variantes ✅, #157/#160 partiels.
- **T14 (Overlays)** = base **faite par la Phase 9** (figée) ; l'expansion (radar, ping…) reste parquée.

**2) T13 #151 — Prédiction de position à la sortie des stands** (première brique T13) :
- ✅ **`spotter.ts`** : fonction **pure** `predictPitExit(data, pitLossSec)` — les voitures **du
  même tour** dont l'écart derrière est `< pitLossSec` passent devant → `{currentPos, newPos, lost}`.
  Nouveau `case "pit"` dans `buildAnswer` (param `pitLossSec`, défaut 25).
- ✅ **`spotterCommands.ts`** : intention **`pit`** + grammaire ×4 langues (« stand », « pit »,
  « boxes », « box ») + ordres de matching/affichage.
- ✅ **`useSpotter.ts`** : passe `pitLossSeconds` (store) à `buildAnswer`.
- ✅ **Store** `pitLossSeconds` (clé `pit_loss_seconds`, défaut 25) + **Config** : champ numérique
  (section Spotter) + libellé commande `spotterCmdPit`.
- ✅ **i18n ×4** : `live.spPitExit`/`spPitKeep`, `config.spotterCmdPit`, `config.pitLoss`/`pitLossDesc`,
  + `spotterTalkCommands` mis à jour.
- ✅ **Validé** : **`npm test` = 84/84** (10 assertions `predictPitExit` : sauts même tour, filtrage
  lapped, perte faible/forte, pas de joueur→null), `tsc -b` ✅, `eslint` ✅, `npm run build` ✅.

**⚠️ Réserve** : `pitLossSeconds` est un **estimé global configurable** (défaut 25 s) — la vraie
perte varie par circuit ; la mesure auto (#152 benchmark temps d'arrêt) l'affinera plus tard. La
commande vocale « Stand » nécessite le **build STT** (`tauri:build:stt`) comme les autres commandes
push-to-talk ; sans STT, seules les touches Statut/Mute/Répète répondent.

**📋 Prochaine étape** : autres briques T13 au choix — #152 benchmark temps d'arrêt (affine #151),
#149 messages multiclasse, ou #148 attack/defend.

### 2026-07-03 — Décision : **Phase 9 (Overlays in-game) figée** (conservée, non développée)

**Décision (utilisateur)** : on **arrête de développer** la Phase 9. ⚠️ Précision importante :
les overlays **existent déjà, fonctionnent et sont livrés en l'état** (page `/overlays`,
fenêtre transparente, 9 widgets, drag, persistance ; opérationnels en **borderless**). On ne
les **retire pas** — on **cesse de les finir/enrichir** (« Itération 1 » stoppée). Statut =
**figé**, pas « supprimé ».

**Motifs** :
1. **Limite technique de l'approche** : une fenêtre Tauri transparente always-on-top ne
   s'affiche **que si LMU tourne en borderless/fenêtré**, pas en **plein écran exclusif**
   (mode courant). Overlayer le plein écran exclusif exigerait une injection/hook DirectX
   — hors de portée de l'archi Tauri (ce serait un sous-projet distinct).
2. **Redondance** : terrain déjà couvert par SimHub / TinyPedal / Racelab, que beaucoup de
   pilotes utilisent déjà. Peu de valeur à refaire un énième widget delta/pneus.

**Conséquences** : le **plan principal (phases 0→8) est considéré comme complet** pour la
V1.0 ; la Phase 9 n'est plus un pré-requis. L'alternative « plugin SimHub » (§7, sous-projet
C# séparé) reste l'idée de repli si le besoin d'overlay in-game revient plus tard.

**📋 Prochaine étape** : app **livrable** (phases 0→8 + coach P0→P5 + tests §14). Restant =
backlog **optionnel** T1→T16 (le plus rentable : responsive T3/T4, tests T2, télémétrie/stats
T7/T9) + validation terrain du coach. Aucun chantier obligatoire pour la V1.0.

### 2026-07-03 — Coach par virage : §14 — **infra de test commitée** (`npm test`)

**Contexte** : après P5, choix de **boucler le coach par §14** (« tests sans rouler »).
Objectif : transformer les smoke tests jetables (esbuild+node one-offs) en **suite de
régression permanente**, commitée et exécutable, sans framework lourd.

**Livré** (`src/lib/coach/testkit/`) :
- ✅ **`assert.ts`** : micro-lib d'assertions (compteurs partagés + `report()` code de sortie).
- ✅ **`replay.ts` (§14.2)** : harnais de rejeu du **module pur** — `replayEngine(frames, ref?)`
  passe des `CoachFrame` dans `stepCoach` et récolte les événements (corner-passed, lap-completed…) ;
  `refFromLapFrames` bâtit une réf `ghost` depuis le 1ᵉʳ tour auto-détecté (`buildRefPayload`).
- ✅ **`synth.ts` (§14.3)** : fixtures déterministes — `synthMeasurement` (mesure alignée sur
  sa réf, mutée champ par champ) ; `synthSession(nLaps)` (frames 20 Hz d'un circuit à virages,
  profil trapézoïdal + rampes de frein) ; mutations `noiseSpeed`/`duplicateFrames`/`shiftByOne`.
- ✅ **`record.ts` (§14.1)** : format **JSONL rejouable** (`serializeFramesJsonl`/`parseFramesJsonl`
  + `FrameRecorder` borné). Le branchement live (`live.onData → frameFromLive → rec.push`) +
  l'écriture disque restent une petite couche applicative à ajouter (non validable hors app).
- ✅ **Suites** : `pure.suite.ts` (consolide P5.1 heatmap, P5.3 stint, P5.4 risque, P5.5 ghost
  duckdb+ld) ; `coach.suite.ts` (**diagnostics §14.3** : décalage franc → 1 brake-timing au 2ᵉ
  passage, calibration < 3 → muet, inhibiteurs, sous-seuil ; **rejeu §14.2** : détection de
  virages + mesures avec réf ; **property tests §14.4** : bruit σ=0.5, frames dupliquées, shift
  → détection conservée ; round-trip JSONL).
- ✅ **Runner** `scripts/run-coach-tests.mjs` (esbuild bundle `run.ts` → node ; alias `@/` via
  tsconfig) + scripts **`npm test`** / `npm run test:coach`.
- ✅ **Validé** : **`npm test` = 74/74** ✅, `tsc -b` ✅, `eslint` ✅, `npm run build` ✅
  (le testkit n'est pas bundlé dans l'app — non importé par le code applicatif).

**Non fait (volontaire)** : §14.5 (abstraire `read_shm` Rust derrière un trait — refactor
backend, faible valeur immédiate) ; §14.6 **corpus d'or** (nécessite de **vrais**
enregistrements annotés — l'`record.ts` fournit le format, la capture live reste à câbler).

**📋 Prochaine étape** : coach **complet** (P0→P5 + infra de test §14). Options restantes :
plans d'entraînement persistants (trophi §7 P5→P7), câblage capture live du recorder (→
corpus d'or §14.6), ou reprendre **Phase 9 Overlays** (plan principal, 🟠 Itération 1).

### 2026-07-03 — Coach par virage : P5.5 ghost — **support des DEUX formats** (`.duckdb` + `.ld`)

**Décision (choix utilisateur)** : garder **les deux** voies d'import ghost —
`.duckdb` (principale, format natif de l'app) **et** `.ld` MoTeC (secondaire, pour les
tours exportés depuis MoTeC i2). Le `.ld` avait été retiré à l'étape précédente ; il est
réintégré comme option, en plus du `.duckdb`.

**Livré** :
- ✅ **Rust `commands/motec.rs` réintégré** (parser `.ld` + commande `coach_parse_ld`,
  ré-enregistrée `mod.rs`/`lib.rs`) + `LdChannel`/`coachRef.parseLd` (`api.ts`). `cargo check` ✅.
- ✅ **`ghost.ts` unifié** : cœur commun `saveGhostFromBuffer` (buffer → `detectAllCorners`
  → `buildRefPayload(kind:"ghost")` → save) partagé par **deux constructeurs de tampon** :
  `buildLapBufferFromChannels` (`.duckdb`, canaux nommés) et `buildLapBufferFromLd` (`.ld`,
  résolution de noms + ré-échantillonnage + normalisation unités). Trois entrées :
  `importGhostFromDuckdb`, `importGhostFromLd`, et **`importGhost(path)`** qui **dispatche
  selon l'extension** (`.ld` → MoTeC, sinon `.duckdb`).
- ✅ **Config** : le dialog accepte **`duckdb` + `ld`** ; appel `importGhost` ; **i18n ×4**
  décrivant les deux formats (`.duckdb` recommandé, `.ld` MoTeC optionnel).
- ✅ **Validé** : `tsc -b` ✅, `eslint` ✅, `cargo check` ✅, `npm run build` ✅, +
  **smoke test déterministe** (esbuild+node, **18 assertions**) couvrant **les deux voies**
  (`.duckdb` : rebase distance, frein %/gaz fraction→%, volant∈[-1,1], canal absent→0,
  no-speed→null, `pickBestLap` ; `.ld` : `resolveChannel`, frein fraction→80 %, gLat
  m/s²→g, lapTime, distance intégrée, m/s→km/h, no-speed→null).

**⚠️ Réserve** : seule la voie **`.ld`** garde la réserve « **parser binaire à valider
sur un vrai fichier** » (rebuild backend requis pour cette voie). La voie **`.duckdb`**
est entièrement validée et sans rebuild. En pratique, privilégier `.duckdb` ; `.ld` est
un bonus pour les utilisateurs MoTeC.

### 2026-07-03 — Coach par virage : P5.5 **pivoté vers `.duckdb`** (correction du format ghost)

**Motif** : l'app **n'utilise pas** le `.ld` MoTeC — sa télémétrie native est le
**`.duckdb`** (`UserData/Telemetry/`, lu partout via `telemetry.getChannels`). L'import
ghost initial (`.ld`, cf. entrée précédente) lisait donc un **format étranger** au flux
de données réel, non validable ici. Corrigé : le ghost s'importe désormais depuis un
**`.duckdb`** (un bon tour à soi d'une autre session, ou un tour de référence partagé) —
le même format que le reste de l'app.

**Livré** :
- ✅ **Supprimé** : `commands/motec.rs` (parser binaire), sa commande `coach_parse_ld`
  (retirée de `lib.rs`/`mod.rs`), le type `LdChannel` + `coachRef.parseLd` (`api.ts`).
  **Plus aucun code Rust ajouté par P5.5** → `cargo check` ✅ (le seul reste Rust de P5.5
  est l'`ORDER BY` ghost > best de `coach_ref_load`, conservé — toujours pertinent).
- ✅ **`ghost.ts` réécrit** : `buildLapBufferFromChannels(TelemetryChannelData)` (canaux
  `.duckdb` `Ground Speed`/`Brake Pos`/… → tampon 8-canaux ; distance rebasée à 0 ;
  frein/gaz normalisés en % ; volant → [-1,1] ; g/gear passthrough) ; `pickBestLap(meta)`
  (tour le plus rapide du fichier) ; `importGhostFromDuckdb(path, combo)` (getMeta →
  getChannels → tampon → `detectAllCorners` → `buildRefPayload(kind:"ghost")` → save).
- ✅ **Config** : dialog `.duckdb` (au lieu de `.ld`), `importGhostFromDuckdb` ; **i18n ×4**
  mis à jour (« tour de référence », `.duckdb`, plus de mention MoTeC/`.ld`).
- ✅ **Validé** : `tsc -b` ✅, `eslint` ✅, `cargo check` ✅, `npm run build` ✅, +
  **smoke test déterministe** (esbuild+node, **18 assertions**) : `buildLapBufferFromChannels`
  (distance rebasée, lapTime = span, frein % passthrough, gaz fraction→%, volant∈[-1,1] plein
  échelle, gLat passthrough, canal absent→zéros, vitesse nulle→null, tour court→null) ;
  `pickBestLap` (plus rapide, ignore durée 0, vide→null).

**✅ Résultat** : P5.5 est maintenant **entièrement validable et collé au workflow réel**.
Plus de réserve « parser binaire non testé » ni de rebuild backend requis pour l'import
ghost (le seul rebuild restant concerne les tables coach des phases P4). Reste la
validation terrain (importer un vrai `.duckdb` en session et vérifier la réf ghost).

### 2026-07-03 — Coach par virage : P5.5 (ghost `.ld` MoTeC) implémenté — **Phase P5 terminée**

**Contexte** : dernier sous-item de P5. Import d'un tour « alien » MoTeC `.ld` comme
**référence coach de meilleur rang** (§2.2/§3.4). Architecture : **Rust parse le binaire
en canaux bruts** ; **TS réutilise le pipeline existant** (`detectAllCorners` +
`buildRefPayload(kind:"ghost")`) → zéro logique de format dupliquée, et la seule partie
non validable ici (le parsing binaire) est isolée. `buildRefPayload` acceptait déjà
`kind:"ghost"`.

**Livré** :
- ✅ **Backend Rust (rebuild requis)** : module `commands/motec.rs` — `parse_ld(&[u8])`
  (liste chaînée de canaux : offsets documentés `meta_ptr`@0x08, `data_ptr`/`n`/`freq`/
  `scale`/`dec`/`shift`, décodage int16/int32 mis à l'échelle + float16/float32, défensif
  bornes + garde anti-boucle) + commande `coach_parse_ld(path) -> Vec<LdChannel>`,
  enregistrée dans `lib.rs`. `cargo check` ✅.
- ✅ **`coach_ref_load`** : `ORDER BY` explicite **ghost > best > stale** (§3.4), puis
  `lap_time` — un ghost importé prime désormais sur le best du joueur.
- ✅ **`ghost.ts` (pur + orchestration, §14)** : `resolveChannel` (mapping noms de canaux
  par priorité, insensible casse) ; `buildLapBufferFromLd` (vitesse = canal maître →
  grille temporelle ; ré-échantillonnage linéaire des autres canaux ; **normalisation
  unités** : m/s→km/h, frein/gaz fraction→%, volant→[-1,1], accel m/s²→g ; distance =
  canal dédié monotone sinon intégration de la vitesse) ; `importGhostFromLd` (parse →
  buffer → `detectAllCorners` → `buildRefPayload(kind:"ghost")` → `coachRef.save`).
- ✅ **`api.ts`** : type `LdChannel` + `coachRef.parseLd(path)`.
- ✅ **Config UI** : ligne « Coach — importer un ghost (.ld) » (icône Upload, gated
  annonces) → dialog `.ld` sur le **combo actif** (`coachComboInfo()`, repli toast si aucun)
  → import + toast (virages + temps). + **i18n ×4** (`config.coachGhost*`/`ghost*`).
- ✅ **Validé** : `cargo check` ✅, `tsc -b` ✅, `eslint` ✅, `npm run build` ✅, +
  **smoke test déterministe** (esbuild+node, **19 assertions**) : `resolveChannel`
  (exact/priorité/miss) ; `buildLapBufferFromLd` (no-speed→null, longueur, lapTime, km/h,
  frein fraction→80 %, gaz %, volant∈[-1,1], distance intégrée, gear arrondi, m/s→km/h,
  canal distance rebasé, gLat m/s²→g).

**⚠️ Réserve majeure** : le **parsing binaire `.ld` n'a PAS été validé sur un vrai
fichier** (aucun `.ld` disponible dans cet environnement, app Tauri non lancée). Les
offsets et la mise à l'échelle suivent le format MoTeC documenté (réf. « ldparser »)
mais peuvent nécessiter un ajustement localisé (formule de scale, `mul` non appliqué,
dtype float16) au premier test réel. **Tout le reste** (mapping canaux→buffer, détection
virages, construction/priorité de la réf ghost, UI) **est validé** (smoke test + build).
Le mapping des noms de canaux est heuristique (LMU/rF2/MoTeC varient) — `resolveChannel`
couvre les noms usuels, à compléter si un export utilise d'autres libellés.

**📋 Prochaine étape** : **Phase P5 (Extensions) terminée** — P5.1 heatmap des pertes,
P5.2 inputs par virage, P5.3 coaching de stint, P5.4 risque + cible classe, P5.5 ghost
`.ld`. **Rebuild `npm run tauri:build:stt` requis** (nouveau code Rust `motec.rs`).
**Validation terrain à faire** : ghost `.ld` sur un vrai fichier + essai en session des
canaux stint/risque/cible-classe. Le plan Coach par virage (P0→P5) est **complet**.

### 2026-07-03 — Coach par virage : P5.3 (coaching de stint) + P5.4 (risque + cible classe) implémentés

**Contexte** : suite de P5. Deux extensions **entièrement frontend** (canaux coach
indépendants du diagnostic par virage), modélisées sur le pattern P4.2/Drill (module
**pur** + câblage service + hook + toggle Config + i18n ×4). Aucun code Rust touché →
pas de rebuild requis. Nouveaux codes widget `CoachMsgKind` (le widget applique l'accent
par défaut aux codes non stylés).

**P5.3 — Coaching de stint (§12 P2, différenciateur)** — livré :
- ✅ **`stint.ts` (pur, rejouable §14)** : `StintState` (`vmin`/virage du relais courant) ;
  `recordStintCorner` (dérive confirmée = médiane début vs médiane récente > max(2 km/h,
  2 %), **une alerte par virage et par stint**) ; `fuelAdvice` (lift & coast si FUEL SHORT
  + haute charge, cooldown 3 tours) ; `takeOutLapAdvice` (prudence pneus froids, 1×/sortie) ;
  `resetStint({outLap})`.
- ✅ **`service.ts`** : état `stint`/`stintActive` ; `recordStintCorner` sur `corner-passed` ;
  `computeStrategy(lastData)` chaque trame → `fuelAdvice` ; **front de sortie des stands**
  (`lastInPits && !inPits`) → `resetStint({outLap:true})` + `takeOutLapAdvice` ; reset au
  combo/start/stop ; `onCoachStint`/`setStintMode`/`coachStintActive`.
- ✅ **Hook `useCornerCoach`** : abonnement `onCoachStint` → speak `coach` + widget
  `coach-corner` (code = `adv.kind`) ; effet `setStintMode` reflétant le toggle.
- ✅ **Store `coachStint`** (clé `coach_stint`) + **Config ToggleRow** (icône Fuel, gated
  annonces) + **i18n ×4** (`vStintTireFade`/`vStintLiftCoast`/`vStintOutLap` + libellés
  éditeur + `config.coachStint*`) + enregistrement `voiceMessages` (groupe `corners`).
- ✅ **Smoke test déterministe** (esbuild+node, **24 assertions**) : dérive (tainted/vmin≤0
  null, stable null, drift au 4ᵉ passage = 10 km/h, 1×/virage, virages indépendants) ;
  lift & coast (gates + cooldown 3 tours) ; out-lap (consommé 1×) ; reset.

**P5.4 — Risque (track_limits) + cible de classe (§12 P3)** — livré :
- ✅ **`risk.ts` (pur, rejouable §14)** : `recordTrackLimit` (compteur cumulé amorcé au 1ᵉʳ
  appel, delta attribué au **dernier virage franchi** via `noteCorner` ; alerte « pas
  rentable » à ≥ 3 coupures/virage, 1×) ; `classTargetAdvice` (secteur où l'écart aux
  **meilleurs secteurs de la classe présente en session** est le plus grand ≥ 0,15 s,
  cooldown 5 tours) ; `resetRisk`.
- ✅ **`service.ts`** : `noteRiskCorner` sur `corner-passed` ; `recordTrackLimit(frame.trackLimits)`
  chaque trame ; helper `classBestSectors()` (min positif `last_sN` des standings de la
  classe du joueur, hors joueur) + `classTargetAdvice` sur `lap-completed` (vs `player.best_sectors`) ;
  `onCoachRisk`/`setRiskMode`/`coachRiskActive` ; reset combo/start/stop.
- ✅ **Hook + Store `coachRisk`** (clé `coach_risk`) + **Config ToggleRow** (icône ShieldAlert)
  + **i18n ×4** (`vRiskLimits`/`vClassTarget` + libellés + `config.coachRisk*`) + `voiceMessages`.
- ✅ **Smoke test déterministe** (esbuild+node, **16 assertions**) : amorçage compteur,
  attribution au dernier virage, alerte au 3ᵉ hit + 1×, reset delta<0 ignoré, virage
  `tainted` non attribué ; cible classe (pire secteur, écart 0,30 s, cooldown, secteurs
  nuls ignorés, sous-seuil null) ; reset.

**✅ Validé** : `tsc -b` ✅, `eslint` ✅, `npm run build` ✅ (P5.3+P5.4). **Aucun code Rust
touché → pas de rebuild requis.**

**⚠️ Réserves** : messages délivrés à des **moments intrinsèquement calmes** (sortie de
virage, ligne droite haute charge, franchissement de ligne) plutôt que via la machinerie
complète de fenêtre de délivrance (§1) — simple et robuste ; priorité `coach` (ne coupe
jamais le spotter). Attribution des coupures = **dernier virage franchi** (heuristique :
coupures en sortie) ; pas de position piste exacte. Cible de classe = `last_sN` des
standings (meilleurs secteurs récents des rivaux) — pas les secteurs théoriques absolus.
Stint et risque tournent **indépendamment** du Drill (chevauchement possible mais alertes
rares + cooldowns). Le « lift & coast » exige une conso mesurée (`computeStrategy` null en
début de session). Non branché en panneau Live dédié (widget overlay `cornercoach` partagé).

**📋 Prochaine étape** : **P5.5** — ghost `.ld` MoTeC comme référence coach (parser binaire
Rust + `kind='ghost'` + import UI). **Rebuild `npm run tauri:build:stt` requis** (code Rust).
⚠️ Parsing binaire à **valider sur un vrai fichier `.ld`** (non disponible dans cet env).

### 2026-07-03 — Coach par virage : P5.1 (heatmap des pertes) + P5.2 (inputs par virage) implémentés

**Contexte** : démarrage de la **phase P5** (extensions, spec §12/§13). Choix utilisateur :
« tout » → les 5 sous-items enchaînés. Cartographie préalable (4 agents) : découverte
que **plusieurs prérequis annoncés sont déjà acquis** — `track_points`+`track_dists`
(lap_dist par point) exposés en live, `analysis.ts` calcule déjà `timeLost`/virage, la
table `coach_ref` supporte déjà `kind='ghost'`. Frontend pur pour P5.1/P5.2 (0 code Rust).

**P5.1 — Heatmap des pertes (§12)** — livré :
- ✅ **`analysis.ts` (pur)** : `lossColor(loss)` (dégradé vert→jaune→rouge, plafond
  0,25 s ; `null`/≤0 gérés) + `lapLossHeatColors(analysis, n)` (couleur par index de
  trace, colorée par virage du point de freinage au virage suivant ; `null` sans réf.).
- ✅ **`TrackMap.tsx`** : prop `heatColors?: (string|null)[]` qui, si fournie, remplace
  la coloration accél./frein/coast dans `stateOf` (ajoutée aux deps du memo `paths`).
- ✅ **`TelemetryView.tsx`** : état `mapLoss` + memo `lossHeat` + bouton toggle « Pertes »
  (gated sur `analysis.hasRef`) avec swatch dégradé + légende à niveau/perte ; branché
  `heatColors={mapLoss ? lossHeat : undefined}`.
- ✅ **i18n ×4** : `telemetry.lossHeat/lossHeatHint/lossLegendOk/lossLegendBad`.
- ✅ **Smoke test déterministe** (esbuild+node, **21 assertions**) : `lossColor` (bornes,
  clamp, hex valides, jaune médian), `lapLossHeatColors` (longueur, coloration par
  segment, gain→vert, hors-virage→null, sans réf.→null).

**P5.2 — Inputs superposés par virage (§12)** — livré (réutilise l'existant) :
- ✅ **`TelemetryView.tsx`** : helper pur module `cornerZoomWindow(dist, brakeIdx, apexIdx)`
  (fenêtre [freinage−40 m ; apex+150 m]) ; état `focusCorner` ; **barre de chips T1..Tn**
  (+ « Tout » reset) au-dessus des graphes qui `setZoom` sur la fenêtre du virage (zoom X
  partagé par tous les uPlot) ; zones à travailler teintées rouge ; wrapper `onChartZoom`
  (zoom par glisser efface la sélection) ; **deep-link `?corner=N`** (effet une-fois qui
  zoome à l'ouverture) ; **clic sur un virage de « Analyse assistée » → zoome les graphes**
  (en plus de déplacer la tête de lecture).
- ✅ **i18n ×4** : `telemetry.cornerZoom/cornerZoomAll/cornerZoomFocus/cornerZoomSeek`.

**✅ Validé** : `tsc -b` ✅, `eslint` ✅, `npm run build` ✅ (P5.1+P5.2). **Aucun code Rust
touché → pas de rebuild requis.**

**⚠️ Réserves** : la heatmap et les chips virages exigent une **référence** (comparaison
active) pour être pertinentes — sans réf., `lossHeat=null` (bouton masqué) et les chips
zooment mais sans coloration de perte. Le deep-link `?corner=N` cible la vue télémétrie
locale ; brancher un lien depuis le **rapport de session live** (page Live, P4.1) reste à
faire (le coach live n'a pas le chemin `.duckdb`). Chips gated sur `data.dist.length>0`
(axe distance) — en axe temps pur, pas de chips.

**📋 Prochaine étape** : **P5.3** — coaching de stint (dérive Vmin/virage au fil du relais
+ lift&coast si FUEL SHORT), puis **P5.4** (risque track_limits + cible classe) et **P5.5**
(ghost `.ld` MoTeC — rebuild requis). Cf. entrées suivantes.

### 2026-07-03 — Coach par virage : P4.3 (banque de phrases LLM à slots + « pourquoi ? » vocal) implémenté

**Contexte** : fin de la phase P4. Deux briques indépendantes de la spec : (1) §10
**banque de phrases LLM à slots** — sortir la formulation des gabarits déterministes
sans jamais mettre un appel LLM sur le chemin critique (« la latence est LE
problème », §10) ; (2) §12 **« pourquoi ? » vocal** — après un callout, `Alt+C`
« pourquoi ? » répond avec le diagnostic chiffré du virage.

**Décisions (validées)** :
- Banque **par (virage, diagnostic)** clé (code, sign, n° macro | générique). Les
  chiffres réels **ne transitent jamais par le modèle** : le LLM ne produit que des
  gabarits à slots (`{{d}}` mètres/km·h⁻¹, `{{n}}` virage) remplis **en code** au
  franchissement → garantie mécanique du « le LLM ne recalcule rien » (§10).
- **Un seul appel batch** par combo circuit×voiture **× langue**, déclenché au
  changement de combo (mode actif) ou à la demande (Config). Cache SQLite ;
  invalidation par `ref_key = classe#{virages macro}` (la réf change les *chiffres*,
  remplis en code, pas la *formulation* → pas de régénération au moindre best).
- Repli **toujours** sur le gabarit i18n déterministe (mode off, virage non couvert,
  slot vide, génération échouée) — le coach ne se tait jamais faute de banque.
- « pourquoi ? » = **enrichissement du PTT existant** (`useCoachVoice`, `Alt+C`) : pas
  de nouveau raccourci ni de détection d'intention. Les N derniers diagnostics sont
  injectés au contexte live → le LLM peut expliquer un callout avec ses chiffres.

**Livré** :
- ✅ **Backend (Rust, rebuild requis)** : table `coach_phrasebank` (`db.rs`, PK
  combo×langue, `ref_key` + `variants` JSON opaque) + 3 commandes `commands/coach.rs`
  (`coach_phrasebank_load`/`_save` upsert/`_clear`), enregistrées dans `lib.rs`.
  `cargo check` ✅.
- ✅ **`phrasebank.ts` (pur, rejouable §14)** : catalogue `DIAG_SITUATIONS` (10
  situations = 9 diagnostics, `brake-timing` dédoublé par sens) ; `buildPhraseBank`
  (index (code,sign,n)) ; `resolvePhrase` (préférence **spécifique** virage →
  **générique**, **rotation** des variantes, `fillSlots`, slot non substitué →
  `null`) ; `phrasebankRefKey` ; `parse`/`serialize` tolérants ; `isDiagCode`.
- ✅ **`ai/phrasebank-gen.ts`** : `buildPhrasebankPrompt` (langue + règles radio +
  situations + virages macro nom/tip) → **1 appel batch** ; `extractJsonArray`
  (tolère fences markdown **et troncature** = referme au dernier objet complet) ;
  `generatePhrasebank` filtre sur le catalogue.
- ✅ **`coachPhrasebank.ts` (orchestration)** : `applyOrGeneratePhrasebank` (cache
  SQLite compatible → sinon génère+persiste si Coach IA configuré → sinon repli) +
  `clearPhrasebankForCurrentCombo`. Anti-doublon (combo×langue×refKey).
- ✅ **`service.ts`** : état banque + `uidToMacroN` (recalculé au combo/à la charge
  de réf) + `setCoachPhraseBank`/`resolveCoachPhrase`/`coachComboInfo` ; anneau
  `recentDiags` (6) + `coachRecentDiagnostics` (§12). Reset au combo/start/stop.
- ✅ **Hook `useCornerCoach`** : `resolveCoachPhrase(msg) ?? t(live.…)` dans les
  handlers speak **et** verdict de drill (le widget porte le même texte + magnitude
  exacte) ; effet dédié (gated `coachPhrasebank`) qui charge/génère au `combo-changed`.
- ✅ **Hook `useCoachVoice`** : bloc « Recent per-corner coaching » (diagnostics
  chiffrés récents) joint au contexte du PTT → « pourquoi ? » répond avec les chiffres.
- ✅ **Store + Config** : `coachPhrasebank` (clé `coach_phrasebank`) + `setCoachPhrasebank` ;
  **ToggleRow** « Coach — phrases variées (IA) » + boutons Générer/Effacer (gated).
- ✅ **i18n ×4** : `config.coachPhrasebank*` + `phrasebankGenerate/Clear/GenOk/GenErr/NoCombo/Cleared`.
- ✅ **Validé** : `cargo check` ✅, `tsc -b` ✅, `eslint` ✅, `npm run build` ✅, +
  **smoke test déterministe** (esbuild + node, **36 assertions**) : `fillSlots`/slots
  manquants, `situationFor`/`isDiagCode`, `buildPhraseBank` (entrées vides ignorées),
  `resolvePhrase` (spécifique>générique, rotation, slot manquant→null, code absent→null),
  `phrasebankRefKey` (tri/ignore null/sensible à la classe), parse/serialize tolérants,
  `extractJsonArray` (fences + **troncature**).

**⚠️ Réserves** : la génération est **automatique** au changement de combo quand le
mode est actif (comportement §10 « à l'activation du mode sur un combo ») → 1 appel
LLM par nouveau combo tant qu'aucune banque compatible n'est en cache ; best-effort
(échec = repli i18n silencieux). La banque est **par langue** : changer de langue
régénère au combo suivant (effet re-déclenché sur `lang`, mais pas re-généré pour le
combo courant tant qu'il ne change pas). Le **seuil abaissé** en Drill (§11, réserve
P4.2) reste non câblé. « pourquoi ? » n'a **pas** de détection d'intention dédiée : le
contexte des diagnostics récents est joint à **toute** question PTT (léger, utile).
Pas de branchement panneau complet page Live. Les tips ApexPoints nourrissent le
prompt de génération mais **pas** de transcript vidéo injecté (matière §10 optionnelle).

**📋 Prochaine étape** : **Phase P4 terminée**. Suite au choix — **P5** (ghost `.ld`,
coaching de stint, heatmap des pertes, inputs par virage, coaching du risque) ou **T**
(infra de test sans rouler §14 : enregistreur de frames JSONL + rejeu). Rappel :
**rebuild `npm run tauri:build:stt`** requis (nouvelle table Rust `coach_phrasebank`).

### 2026-07-03 — Coach par virage : P4.2 (mode Drill : entraînement ciblé + toggle Config) implémenté

**Contexte** : suite de P4.1. Le **mode Drill** (§8/§11) transforme le coach en
*entraîneur ciblé* : sur 1-2 virages-chantiers **seulement**, le budget nominal
(3 msg/tour) saute et le coach donne un retour à **chaque** passage — repère « ton
virage » avant, verdict + compteur de réussites après ; silence partout ailleurs.
**Décision (validée)** : sélection des virages = **auto** (les *objectifs* chroniques
déjà calculés par P4.1, §11 « le coach propose »), activée par un simple **toggle
Config** ; pas de sélecteur manuel (= P7, différé). Le coach reste headless.

**Livré** — module **pur** + câblage service (aucun backend touché cette fois) :
- ✅ **`drill.ts` (pur, rejouable §14)** : compteurs par virage (série/réussites/total,
  `setDrillTargets` **conserve** les compteurs des virages toujours ciblés) ·
  `buildDrillPredictTargets` (ancre chaque virage à sa fenêtre dense → `PredictiveTarget`
  `vDrillNext`) · `recordDrillPass` (muet → non compté ; propre → `vDrillClean` puis
  `vDrillStreak` avec compteur ; fautif → série cassée + verdict = le diagnostic chiffré,
  réutilise `voiceKeyForDiag`).
- ✅ **`predictive.ts`** : `stepPredictive(..., fadeMax=Infinity)` — le Drill répète le
  repère à **chaque** tour (pas de fade, contrairement à la Découverte).
- ✅ **`service.ts`** : état Drill + `setDrillMode(active)` (corners = objectifs) ·
  `runDiagnostic` court-circuite la pédagogie nominale et route vers `recordDrillPass` ·
  ordonnanceur prédictif Drill dédié (`drillPredict`, réutilise les canaux `onCoachPredict`/
  `onPredictTargets` = pré-synthèse TTS gratuite) · reset combo/start/stop · listener
  `onCoachDrillVerdict` + getters `coachDrillActive`/`coachDrillCounts`. L'historique
  (progression P4.1) continue d'accumuler pendant le drill.
- ✅ **Hook `useCornerCoach`** : prononce le verdict (priorité `coach`, miroir widget —
  propre = vert « validé », fautif = accent + détail chiffré) ; effet dédié qui reflète
  l'interrupteur Config dans `setDrillMode` (actif seulement si la voix l'est).
- ✅ **Store + Config** : `coachDrill` (clé `coach_drill`) + `setCoachDrill` ; **ToggleRow**
  « Coach — mode Drill » dans la carte Audio/Voix (gated sur les annonces).
- ✅ **i18n ×4** : `vDrillNext`/`vDrillClean`/`vDrillStreak` (+ `vmWhen` + registre
  `voiceMessages` groupe `corners`, personnalisables) + `config.coachDrill*`.
- ✅ **Validé** : `tsc -b` ✅, `eslint` ✅, `npm run build` ✅, + **smoke test déterministe**
  (esbuild + node, **24 assertions**) : `setDrillTargets` (borne 2, conservation/oubli/init),
  `recordDrillPass` (hors-cible/muet null, clean→streak, streak c=2, fautif→diagnostic +
  détail chiffré + reset série, total/made), `buildDrillPredictTargets` (ancrage brakeDist,
  tri, cible sans fenêtre ignorée).

**⚠️ Réserves** : le « seuil abaissé » sur les virages drillés (§11) n'est **pas** câblé
— le drill donne un feedback **systématique** (chaque passage) mais garde les seuils
nominaux du diagnostic ; abaisser le seuil par virage exigerait un flag jusqu'à
`diagnoseCorner` (reserve P4.3/P5). Sans **objectifs** chargés (combo neuf, aucun
historique), le drill s'active mais n'a **aucune cible** tant qu'une session n'a pas
alimenté `corner_history` → repli silencieux (pas de faux repère). Sélecteur **manuel**
de virages = non fait (décision : auto ; UI dédiée = P7). Callout « ton virage » sans
marqueur de panneau (générique) — l'enrichissement ApexPoints (`vDrillNext` + marker) est
possible mais non retenu ici. Pas de branchement panneau complet page Live (idem P4.1).

**📋 Prochaine étape** : **P4.3** — **banque de phrases LLM à slots** (§10 : un seul appel
batch par combo, variantes par (virage, diagnostic), slots `{delta}/{vmin}/{ref}` remplis
en code → zéro appel sur le chemin critique) + **« pourquoi ? » vocal** (`Alt+C` après un
callout → le LLM répond avec le diagnostic chiffré + les N derniers `corner-passed`, §12).
Rappel : **rebuild `npm run tauri:build:stt`** toujours requis (backend P4.1 : table
`corner_history` + commandes `coach_history_*`) — P4.2 n'a touché **aucun** code Rust.

### 2026-07-03 — Coach par virage : P4.1 (apprentissage : objectifs + rapport 1+1+1 + corner_history + rappel) implémenté

**Contexte** : début de la phase P4 (apprentissage §11). Fermer la boucle **conseil →
pratique → rapport → objectif** : mémoriser la progression **par virage** d'une session
à l'autre, débriefer au retour aux stands (« 1+1+1 »), et **rappeler** le chantier au
prochain roulage sur le combo. Premier morceau de P4 (Drill = P4.2, banque LLM = P4.3).

**Livré** :
- ✅ **Backend (Rust, rebuild requis)** : table `corner_history` (`db.rs`, une ligne par
  virage × session : `passes`, `median_dt`, `iqr_dt`, `success_rate`, `best_dt`,
  `session_at` commun au débrief) + 2 commandes `commands/coach.rs` — `coach_history_upsert`
  (batch, `session_at` = horloge mur, **purge 30 sessions/combo**) et `coach_history_load`
  (trié `session_at` ↑). Enregistrées dans `lib.rs` ; wrappers + type `CornerHistoryRow`
  dans `api.ts` (`coachRef.historyUpsert/historyLoad`). `cargo check` ✅.
- ✅ **`history.ts` (pur, rejouable §14)** : accumulateur de session (`recordPass`,
  `passFromResult` = ne compte que les passages **avec réf, non muets**), résumé par
  virage (`summarizeSession` : **pace** = Δt médian, **constance** = IQR, **taux de
  réussite** = % `none`, ≥ 3 passages sinon bruit) → `toHistoryRows` ; agrégation
  inter-sessions `buildProgression` (dernière valeur + **tendance** = pente OLS du Δt
  médian sur 5 sessions). Stats robustes (`median`/`iqr` par quantiles interpolés/`slope`).
- ✅ **`report.ts` (pur)** : `buildSessionReport` = rapport **« 1+1+1 »** (progrès =
  plus gros gain vs dernière session persistée · chantier = pire virage restant, pace vs
  **constance** si IQR domine · cap = prochain palier ohne_speed), `buildRecall` (chantier
  du dernier passage), `pickObjectives` (1-2 faiblesses chroniques structurées), `nextCapMs`
  (palier de temps juste sous le best). Δt négatif (réf courte/périmée) jamais compté faiblesse.
- ✅ **`service.ts`** : accumule les passages au diagnostic ; **débrief au front d'entrée
  aux stands** (`inPits` ↑, ≥ 6 passages) → résume + persiste + émet le rapport ; flush
  **silencieux** au `combo-changed`/stop (ne perd rien) ; charge l'historique au combo
  (`buildProgression`/`pickObjectives`/`buildRecall`) → **rappel** au 1ᵉʳ virage (1×/combo) ;
  cap calculé des benchmarks ohne_speed + `formatTime`. Listeners `onCoachReport`/`onCoachRecall`,
  getters `coachProgression`/`coachObjectives`.
- ✅ **Hook `useCornerCoach`** : prononce le rapport d'un bloc (TTL 15 s) + rappel (priorité
  `coach`) et miroir widget (`coach-corner`, codes `report`/`recall`). **Widget** : `report`
  ambre / `recall` violet ; pastille `T{n}` masquée quand le cap n'a pas de virage.
- ✅ **i18n ×4** : `vReportProgress`/`vReportChantierPace`/`vReportChantierConsistency`/
  `vReportCap`/`vRecallChantier` (+ `vmWhen`) + registre `voiceMessages` (groupe `corners`,
  personnalisables). Équilibré (10 occurrences × 4).
- ✅ **Validé** : `cargo check` ✅, `tsc -b` ✅, `eslint` ✅, `npm run build` ✅, +
  **smoke test déterministe** (esbuild + node, **48 assertions**) : stats (median/iqr/slope),
  éligibilité (`passFromResult` : muted/tainted/no-ref → null, none → succès), résumé
  (MIN_PASSES, médiane/IQR/taux/best), progression (regroupement, tendance < 0, prev/1-point),
  rapport (progrès 0.5→0.2 = 3 dixièmes + 8/10, chantier pace vs constance, ordre 1+1+1),
  rappel (pire virage / null vide), objectifs (rang + métrique), `nextCapMs` (4 cas).

**⚠️ Réserves** : le rapport se déclenche au **retour stand** (front `inPits`), pas sur un
vrai signal « fin de session » (LMU n'en expose pas de propre) — un pilote qui quitte via
menu sans passer par les stands déclenche le flush **silencieux** au `combo-changed`/stop
(persisté, non parlé). Deux relais dans la même session comparent au **même** historique
pré-session (la progression n'est rechargée qu'au combo suivant) → un progrès peut être
re-annoncé au 2ᵉ arrêt (mineur). Les **objectifs structurés** (`pickObjectives`) sont exposés
(getter) mais la seule **délivrance** P4.1 est le rappel vocal ; une UI dédiée (page
Progression/`/training`) = P7 du plan trophi (différé). Rappel = pas d'horloge mur dans le
service (déterminisme) ; l'âge des sessions vient de `session_at` backend. Pas de branchement
sur le **panneau complet** page Live (§11) — miroir widget in-game seulement pour l'instant.

**📋 Prochaine étape** : **P4.2** — mode **Drill** (l'utilisateur choisit 1-2 virages, budget
levé, feedback à **chaque** passage : callout prédictif « ton virage » + verdict après +
compteur de réussites, silence ailleurs). **Rebuild `npm run tauri:build:stt` requis** avant
test live (table `corner_history` + commandes ajoutées).

### 2026-07-03 — Coach par virage : P3.3 (mode Découverte prédictif + pré-synthèse TTS) implémenté

**Contexte** : dernière brique de la phase P3. En **Découverte** (pas de réf joueur →
le moteur mute tout diagnostic §5), remplacer le « silence radio » de la v1 par des
**callouts prédictifs** ApexPoints prononcés *avant* le freinage — le moment où le
pilote a le plus besoin d'aide (§8).

**Livré** :
- ✅ **`predictive.ts` (pur, rejouable §14)** : `voiceKeyForMacro` (repère parlé →
  clé i18n `vPredict*` + vars, gabarit choisi selon marqueur/rapport connus) ·
  `buildPredictiveTargets` (chaque virage macro **apparié** à une fenêtre reçoit le
  `brakeDist` **absolu** de cette fenêtre — jamais le marqueur, position de panneau
  sans coordonnée piste §3.3) · `windowsFromDetected` (Découverte pure : fenêtres
  bâties des virages **auto-détectés** du tour, UID stable via `assignUid`) ·
  `stepPredictive` (déclenche la **prochaine** zone à `brakeDist − v·(TTS 2,2 s +
  2 s)`, un callout/virage/tour, **fade** après 3 émissions §8).
- ✅ **Pré-synthèse TTS** (`voice.ts`) : Piper étant asynchrone (~100-300 ms),
  synthétiser au déclenchement raterait la fenêtre « ≥ 2 s avant ». `prewarmSpeech`
  synthétise+décode les textes fixes au (re)calcul des cibles et met en cache
  l'`AudioBuffer` (réutilisable) ; `trySynthAndPlay` rejoue le cache → **zéro
  latence** ; `clearSpeechCache` à l'arrêt/combo.
- ✅ **`mode.ts`** : `ModePolicy.predictive` (true **seulement** en Découverte ;
  jamais de prédictif permanent quand une réf existe — dépendance §8).
- ✅ **`service.ts`** : `refreshPredictiveTargets` au `lap-completed` (Découverte
  pure : fenêtres détectées → mapping macro → cibles, ne remplace que par une
  géométrie **plus complète**) ; `stepPredictive` par trame gardé sur `state.ref ===
  null` ; abonnements `onCoachPredict` (parler) + `onPredictTargets` (pré-synthèse).
- ✅ **`useCornerCoach.ts`** : prononce le callout (priorité `coach`), émet le widget
  (`coach-corner` code `predict`) ; localise+`prewarmSpeech` à la pose des cibles.
- ✅ **Widget `CornerCoachWidget`** : code `predict` stylé bleu « repère à venir ».
- ✅ **i18n ×4** : `vPredictBrakeGear/Brake/Gear/Name` (+ `vmWhen` + registre
  `voiceMessages` groupe `corners`, personnalisables).
- ✅ **Validé** : `tsc -b` ✅, `eslint` ✅, `npm run build` ✅, i18n équilibré (8×4),
  + **smoke test déterministe** (esbuild + node, **22 assertions**) : sélection de
  gabarit, cibles ancrées/triées (brakeDist = fenêtre ≠ marqueur), `windowsFromDetected`
  (UID réutilisé < 40 m / forgé sinon), ordonnanceur (fenêtre de déclenchement,
  1×/tour, fade 3 tours, pit/vitesse basse muets, première zone seulement).

**⚠️ Réserves** : la Découverte pure ne délivre **pas de callout au 1ᵉʳ tour** (aucune
coordonnée piste a priori : les fenêtres viennent des virages détectés du tour
précédent → callouts dès le tour 2). Le `brakeDist` des fenêtres détectées est celui
**du pilote** (pas un idéal) — suffisant pour ancrer un repère parlé, jamais un delta.
`markerM`/`gearN` **anglais** des noms ApexPoints (proper nouns, non traduits). Le
mode **Drill** (feedback à chaque passage, prédictif « ton virage ») reste **P4.2**
(retombe sur la politique nominale, `predictive:false`). Escalade prédictive (un
chantier qui résiste à 3 correctifs, §8) non câblée (P4). Durée TTS toujours estimée
forfaitairement 2,2 s (pas de mesure réelle avant synthèse).

**📋 Prochaine étape** : **P4** — apprentissage : objectifs structurés + rapport
1+1+1 + `corner_history` (mémoire chronique inter-sessions), mode **Drill** (virages
choisis, budget levé, prédictif + verdict + compteur de réussites), banque de phrases
LLM à slots (0 appel sur le chemin critique) + « pourquoi ? » vocal (Alt+C après un
callout → le LLM répond avec le diagnostic chiffré + extrait transcript).

### 2026-07-03 — Coach par virage : P3.2 (niveau auto-calibré + réf courte + péremption) implémenté

**Contexte** : suite de P3.1. Trois briques de fiabilité (§3.3, §7) : le coach cesse
de raisonner avec un niveau pilote figé et une réf dense supposée éternellement valide.

**Livré** — trois modules **purs** (rejouables §14) + câblage service :
- ✅ **`calibration.ts`** — `driverLevelFromPercent` (§7 : `< 102 %` rapide / `102–107 %`
  intermédiaire / `> 107 %` débutant, bornes au palier favorable) + `calibrateDriverLevel(bestMs, alienMs)`.
  Calibration sur le **meilleur tour propre** (potentiel réel, monotone → pas de va-et-vient de palier).
- ✅ **`shortref.ts`** — anneau des 3 derniers passages **propres** par `corner_uid`,
  `shortRefTargets` = **médiane** par champ (robuste à un aberrant), `null` sous 2 passages.
  Ne peut exister que si le moteur produit des `corner-passed` → jamais en Découverte pure.
- ✅ **`staleness.ts`** — `refFreshness(refMeta, current, kind)` → `fresh | indicative` si
  build ≠ / |trackTemp| > 8 °C / |wetness| > 0.1 / composé ≠ / `kind = stale`. Comparaisons
  gardées sur données présentes (pas de fausse péremption si build/composé inconnu).
- ✅ **`diagnostics.ts`** — `computeHits` scindé en `thresholds` (échelle = réf dense, même
  périmée) + `paceHits(targets)` + `baseHits` (binaire/constance, indépendants de la cible).
  Politique de réf (§3.3) : **frais** → cible dense mais retenue **seulement si confirmée aussi
  sur la réf courte** (« sur les deux réfs ») ; **indicatif** → cible **courte** seule, deltas
  **relatifs** (`relative`), sinon silence (préférer se taire §15). Champ `relative` sur le diagnostic.
- ✅ **`voice.ts` + i18n ×4** — variantes « que d'habitude » (`vCornerBrakeEarly/LateUsual`,
  `vCornerOverSlowUsual`) choisies quand `relative` ; registre `voiceMessages` (personnalisables).
- ✅ **`service.ts`** — fetch benchmarks (best-effort), résolution alien paresseuse par combo
  (`liveClassToOhne` exporté d'`ohne_speed`, réutilisé par `useAlienTarget`), re-calibration au
  tour propre éligible ; `refMode` calculé par trame (méta réf vs conditions live) + réf courte du
  virage passés à `diagnoseCorner`, `updateShortRef` **après** (habitude = passages antérieurs).
  Reset au start/stop/combo. `setDriverLevel` **épingle** (override manuel, coupe l'auto-calibration).
- ✅ **Validé** : `tsc -b` ✅, `eslint` ✅, `npm run build` ✅, + **smoke test déterministe**
  (esbuild + node, **34 assertions**) : calibration (bornes 101/102/107/107.01 + gardes), réf courte
  (médiane 2/3, fenêtre glissante, tainted ignoré), péremption (build/temp ±8/wetness/compound/stale/inconnu),
  diagnostic (confirmation sur les deux réfs : émet si confirme, **silence si l'habitude contredit** ;
  indicatif + short → **relatif** ; indicatif sans short → silence ; calibration < 3 → silence).

**⚠️ Réserves** : la confirmation « sur les deux réfs » en mode frais **masque volontairement**
un écart *systématique* vs le best qui est devenu ton habitude (anti-nag §15 ; le best reste
aspiratif via l'analyse IA post-course). Calibration niveau sur le **meilleur** tour (un tour
aspiré éligible pourrait sur-classer — atténué par le critère `gap_ahead > 2 s` de l'éligibilité).
Péremption **âge > 60 jours** (re-calibration proposée §3.3) non implémentée (nécessite horloge
mur — nicety UI, hors chemin critique). Normalisation carburant (§3.3, ~0,03 s/tour/L) non faite.
Mapping classe ohne_speed ELMS/WEC indiscernable en live (WEC par défaut) — sans effet sur le palier.

**📋 Prochaine étape** : **P3.3** — mode **Découverte prédictif** : consommer `coachMacro`/
`coachMappedMacro` (posés en P3.1) pour émettre des callouts ApexPoints **avant** le freinage
(déclenchement à `brakeDist − v × (durée_TTS + 2 s)`, §8), **pré-synthétisés** au chargement du
combo (Piper asynchrone) ; s'estompent au fil des tours ; réservés Découverte/Drill/escalade (§8).

### 2026-07-03 — Coach par virage : P3.1 (mapping ApexPoints + corrections par circuit) implémenté

**Contexte** : début de la phase P3 (références enrichies). Transformer le guide **macro** ApexPoints (`braking-guide-data.ts` — repères de freinage par panneau, 6-10 zones/circuit, jamais tous les virages) en source *structurée* pour le coach : parsée, **corrigée** (anomalies vérifiées §0.7), enrichie, et **mappée sur les fenêtres de la réf dense** — matière des callouts prédictifs (§8, câblés en P3.3).

**Livré** — nouveau module **pur** `src/lib/coach/apex.ts` (rejouable/testable §14) :
- ✅ **Parsing des numéros** : `parseCornerNumber` (regex `^T(\d+)([A-Z])?(-T(\d+))?$`) → `{start, end, suffix}`. Gère `T5`, `T10A` (suffixe, Road Atlanta), `T2-T9`/`T20-T26` (plages → **fenêtres composites**). Rejette les libellés non conformes et les plages inversées.
- ✅ **Parseurs de champs** : `parseMarkerMeters` (« 150m board » → 150, mais **jamais** une coordonnée piste §3.3), `parseSpeedRange` (« 320→100 km/h » → {entry, apex}), `parseGearNumber` (« 3rd » → 3), `hasTrailBraking` (mot-clé `trail` §5#8).
- ✅ **Table de correction par circuit** `CIRCUIT_CORRECTIONS` (**embarquée, obligatoire — pas un filet**, §4.2/§15) : **COTA** — `T6` (listé *après* la plage `T2-T9` qui l'englobe) **replié** en détail de la fenêtre composite, pas une fenêtre ordinale ; **Sebring** — fichier non trié (`T17` avant `T16`), **ordre physique rétabli** (`order` explicite). `validateCorrections()` = **table de validation** : échoue si un `number` cité n'existe pas, si `order` ne couvre pas exactement les virages non repliés, ou si un numéro devient non parsable → garde-fou contre la dérive des données.
- ✅ **Réf macro enrichie** : `guideMacroCorners(trackId, classId)` (corrigée + triée + parsée, fallback classe → `hypercar` §0.7) et `macroForCombo({track, carClass})` (réutilise `matchBrakingTrackId`/`matchBrakingClass` du coach IA).
- ✅ **Mapping ordinal** `mapMacroToWindows(corners, windows)` : alignement **monotone** sur position normalisée (n°/n°max ↔ apexDist/apexMax) — les marqueurs n'ayant **pas** de coordonnée piste (§3.3), seul l'*ordre* est aligné, pas des distances absolues. Borne de capacité (réserve une fenêtre par virage restant) → jamais de virage échoué quand `#virages ≤ #fenêtres`, aucune réutilisation. Sans réf (Découverte) → toutes ancres `null`.
- ✅ **Branchement service** (`service.ts`) : réf macro résolue au `combo-changed` (via `frame.carClass`), remappée sur les fenêtres à chaque charge de réf (`loadRefFor`). Getters `coachMacro()` / `coachMappedMacro()` pour P3.3. Réinitialisée au start/stop.
- ✅ **Validé** : `tsc -b` ✅, `eslint` ✅, + **smoke test déterministe** (rejeu bundlé esbuild, 30 assertions) : parsing (6 cas), 5 parseurs de champs, `validateCorrections` = [] (table synchrone), COTA (T6 hors séquence + replié composite, séquence `T1,T2-T9,T11,T12,T15,T19-T20`), Sebring (ordre `…,T16,T17`), enrichissement Dunlop (150/320→100/3ᵉ/trail/composite), fallback classe inconnue, `macroForCombo` (match + circuit non couvert → []), mapping monotone `[0,1,2,3,4,5]` sans réutilisation, Découverte (null).

**⚠️ Réserves** : le mapping macro→fenêtres est une **heuristique ordinale documentée** (n° de virage ↔ apexDist normalisés) — les panneaux ApexPoints n'ayant pas de coordonnée piste, on ne peut aligner que l'ordre ; suffisant pour ancrer un callout prédictif à une fenêtre (récupérer son `brakeDist`), jamais pour un delta absolu (§3.4.3). La **Découverte pure** (pas de réf → pas de fenêtre) délivrera les callouts sur les virages détectés à la volée, pas via ce mapping (P3.3). Getters `coachMacro`/`coachMappedMacro` posés mais **non encore consommés** (aucun callout émis — c'est P3.3). Corrections limitées à COTA/Sebring (seules anomalies vérifiées dans les données ; `validateCorrections` protège l'ajout d'autres). Table de fenêtres pneus (§2.2) et péremption/réf courte (§3.3) = suite de P3.

**📋 Prochaine étape** : **P3.2** — niveau pilote **auto-calibré** par les benchmarks ohne_speed (Débutant > 107 % / Intermédiaire / Rapide < 102 %, §7) remplaçant le `driverLevel` figé `intermediate` du service, + **réf courte** (médiane glissante 3 derniers tours propres) et **péremption** (build/temp/wetness/compound → deltas relatifs seulement, §3.3).

### 2026-07-03 — Coach par virage : P2.4 (modes par session + pédagogie) implémenté

**Contexte** : suite de P2.3 — passer d'un coach qui **annonce des fautes** à un coach qui **coache un humain** (§1) : un seul chantier à la fois, feedback qui s'espace, fermeture de boucle sur les réussites — et un comportement adapté au **type de session** (§8). Dernière brique de la phase P2 (P0+P1+P2 = premier coach utile).

**Livré** :
- ✅ **`coach/mode.ts` (pur)** : `CoachMode` (5 modes §8) + `modeFromSession(sessionNum, hasRef)` (0 = test, 1-4 practice, 5-8 qualif, 9 warm-up, 10+ course ; sans réf → découverte) + `policyFor(mode)` → `ModePolicy` (`live`, `budgetPerLap`, `escalationOnly`, `positive`, `degressive`). **Practice** = nominal (focus + dégressif + positif, budget 3) ; **Course** = silence sauf erreur répétée coûteuse ≥ 3× (budget 1, sans focus/positif) ; **Qualif** = muet en roulage.
- ✅ **Pédagogie dans `voice.ts`** : `pushCoachVoice` (P2.2, diagnostics seuls) remplacé par **`observeCorner`** appelé à **chaque** clôture de virage (fautif / propre / muet) →
  - **Focus collant §1.3** : le 1ᵉʳ diagnostic non-binaire confirmé devient le **virage-chantier** ; les diagnostics d'**autres** virages sont ignorés (pas de zapping) ; même virage + nouvelle cause = reformulation (compteurs remis à zéro) ; chantier libéré après **résolution** ou **5 tours** sans résolution. Les binaires (blocage/patinage) restent prononcés **hors focus** (sécurité).
  - **Dégressif §1.5** : `degressiveGap(spokenCount)` = 0,0 (systématique) → 1 (1/2) → 2 (1/3) → ∞ (silence, on attend la validation).
  - **Renforcement positif §1.4** : sur **2 passages propres** consécutifs du chantier déjà commenté → `queuePositive` (dixièmes repris = worstΔt − Δt courant) → `vCornerResolved` (avec gain) ou `vCornerClean` (générique). Passe par la **même fenêtre de délivrance** (§1.1) et compte dans le budget.
- ✅ **`frame.ts`** : ajout `sessionNum` (depuis `LiveSession.session`) — seul canal du mode.
- ✅ **`service.ts`** : calcule la `ModePolicy` par trame (`modeFromSession(frame.sessionNum, state.ref !== null)`) et route **tout** verdict (diagnostic/none/muted) vers `observeCorner`.
- ✅ **Widget** : `CoachCornerEvent` gagne `positive` + `code` élargi (`resolved`/`clean`) ; `CornerCoachWidget` stylise le positif en **vert** (`#34d399`). `coachCornerEvent(msg, text)` (au lieu de `msg.diag`).
- ✅ **i18n ×4** + registre `voiceMessages` (groupe `corners`) : `vCornerResolved` ({{n}},{{d}}) + `vCornerClean` ({{n}}) + libellés `vmWhen`.
- ✅ **Validé** : `tsc -b` ✅.

**⚠️ Réserves** : **Qualif** = simple silence en roulage — le coaching sur l'**out-lap** (§8 « Tour annulé au 3… ») nécessite un pipeline de débrief différé = **P4**. **Découverte** ne fait rien en P2.4 (le moteur mute déjà tout sans réf ; callouts prédictifs = P3.3). **Drill** = P4.2 (retombe sur la politique nominale). Sélection du chantier = **1ᵉʳ diagnostic confirmé** (pas de score Δt×chronicité×faisabilité inter-virages : le flux est séquentiel, on ne voit pas tous les virages d'un tour à la fois) — approximation raisonnable, à affiner avec la mémoire chronique (P4). `spokenCount` incrémenté à la **mise en file** (engagement) et non à la parole effective → un message abandonné pour péremption (§1.1) compte quand même comme « dit » (rare, fenêtre généralement atteinte). Pas de tests automatisés (pas de runner configuré ; infra de rejeu = tâche **T**).

**📋 Prochaine étape** : **P3.1** — mapping ApexPoints + **table de correction par circuit** (chevauchement COTA, ordre Sebring — obligatoire, pas un filet), en enrichissant la réf *macro* et en préparant les callouts prédictifs (§4.2/§8).

### 2026-07-03 — Coach par virage : P2.3 (widget overlay chiffré) implémenté

**Contexte** : suite de P2.2 — donner un **miroir visuel** au conseil parlé dans le HUD in-game, avec le **détail chiffré exact** que la voix n'énonce pas (§1.2 : la voix arrondit « radio » à un seul chiffre).

**Livré** :
- ✅ **Type + builder purs** (`coach/voice.ts`) : `CoachCornerEvent` ({`text`, `corner`, `code`, `magnitude` **exacte non arrondie**, `unit`, `sign`}) + `coachCornerEvent(diag, text)` — source de vérité unique partagée émetteur ↔ widget (rejouable §14, aucune dépendance React/Tauri).
- ✅ **Émission** (`useCornerCoach`) : à la délivrance vocale (`onCoachSpeak`, donc **au bon moment** §1 et déjà anti-spam §9), `emit("coach-corner", coachCornerEvent(msg.diag, text))` en plus du `speak`. Le widget ne montre donc que ce qui est **prononcé** (mêmes gating/fenêtre que la voix).
- ✅ **Widget `CornerCoachWidget`** (calqué sur `CoachWidget`) : écoute `coach-corner`, affiche badge `T{virage}` + le texte du conseil + le **détail chiffré exact** (`magnitude`+`unit`, masqué si unité vide comme lockup/wheelspin) ; effacement **15 s**. Enregistré partout : `OverlayId` + `OVERLAY_DEFS` (icône `Waypoints`, accent `#a855f7`) + `WIDGETS` (les défauts du store `overlays` en découlent automatiquement).
- ✅ **i18n ×4** — `overlays.items.cornercoach.{title,desc,tip}` + `overlays.elements.cornerCoachIdle` (FR/EN/ES/DE, équilibrés).
- ✅ **Validé** : `tsc -b` ✅, `eslint` ✅, i18n équilibré (4×4), + **smoke test déterministe** (rejeu bundlé esbuild) : le builder préserve la magnitude exacte (14.3 m alors que la voix dirait « 15 m »), n'expose pas d'unité pour un blocage, mappe correctement `corner/unit/sign`.

**⚠️ Réserves** : le widget est **couplé à la voix** (émission dans `onCoachSpeak`) → muet quand `voiceAnnouncements` est coupé, et n'affiche pas les diagnostics filtrés par l'anti-spam/la fenêtre (choix volontaire : miroir du parlé). Un canal « écrit seul » (afficher sans parler) serait un ajout P2.4 si voulu. `magnitude` formatée point décimal (`toFixed`, comme les autres widgets) — pas de virgule FR.

**📋 Prochaine étape** : **P2.4** — modes par session (Course/Qualif/Practice/Drill/Découverte) + pédagogie (focus collant §1.3, renforcement positif ≥ 1:2 §1.4, dégressif §1.5), en pilotant le gating/la formulation du coach vocal et du widget.

### 2026-07-03 — Coach par virage : P2.2 (restitution vocale) implémenté

**Contexte** : suite de P2.1 — transformer les verdicts `onDiagnostic` en **conseils parlés**, au bon moment (§1) et sans spam (§9). Pas de widget chiffré (P2.3) ni modes/pédagogie (P2.4).

**Livré** :
- ✅ **Priorité vocale `coach`** (`voice.ts`) : nouveau rang dans `VoicePriority` (= `chatty`, rang 1 → ne coupe **jamais** le spotter `normal`/`critical`, §9) + TTL court dédié (5 s) + paramètre `ttlMs` optionnel sur `speak()` (l'expiration fine est pilotée en amont par la fenêtre de délivrance, pas par un TTL fixe).
- ✅ **`coach/voice.ts`** — module **pur** (types seuls, rejouable §14) : **formateur** `voiceKeyForDiag` (9 diagnostics → clé i18n `live.vCorner*` + variables, format radio « Virage — verbe — **1 chiffre** » §1.2 ; `brake-timing` scindé en `BrakeEarly`/`BrakeLate` selon le sens ; arrondis radio 5 m / 1 km/h) + **ordonnanceur** `pushCoachVoice`/`stepCoachVoice` : **fenêtre de délivrance** §1.1 (gaz > 90 % **et** temps avant prochain freinage ≥ TTS≈2,2 s + 1,5 s, borne = `windows[nextWin].brakeDist`) + **fraîcheur** (abandon > 8 s → report débrief) + **anti-spam** §9 (état porteur : clé `corner_uid × code`, **focus** = 1 conseil en vol, budget **3/tour**, pas de répétition < 2 tours sauf aggravation ×1,25). Horloge = `frame.elapsed` sim (pas `Date.now()`).
- ✅ **`service.ts`** — l'état voix (`CoachVoiceState`) réinitialisé au `combo-changed`/start/stop ; au `corner-passed` diagnostiqué, `pushCoachVoice` ; **tick par trame** `stepCoachVoice` (après le pas moteur → `nextWin` pointe le prochain virage) qui relaie via le nouveau `onCoachSpeak`.
- ✅ **`voiceMessages.ts` + i18n ×4** — groupe **`corners`** (10 gabarits) éditable/testable dans la modale d'annonces (icône `Waypoints`, `vmCatCorners`, `vmWhen` documentés) → conseils personnalisables comme les annonces existantes.
- ✅ **`useCornerCoach`** (monté dans `App.tsx` à côté de `useSpotter`/`useCoachVoice`) : démarre le **service coach autonome**, gate sur `voiceAnnouncements` (interrupteur vocal global), formate via `t("live.<suffix>", vars)` et prononce en priorité `coach`. **1ʳᵉ activation réelle du service coach** (P1.2→P2.1 n'étaient que des modules purs non branchés).
- ✅ **Validé** : `tsc -b` ✅, `eslint` ✅, i18n équilibré (20 occurrences `vCorner` × 4 langues), + **smoke test déterministe** (rejeu bundlé esbuild) : formateur des 9 codes + arrondis ; délivrance (gaz 50 % → muet, freinage proche → muet, fenêtre calme → parlé) ; fraîcheur (> 8 s → abandon) ; budget (3/5 délivrés) + focus (2ᵉ refusé) ; anti-répétition (stable → refusé, aggravation → re-parlé).

**⚠️ Réserves** : TTS estimé forfaitairement à 2,2 s (pas de mesure réelle de durée avant synthèse) ; gating unique sur `voiceAnnouncements` (pas encore de mode Course/Qualif/Practice ni de canal coach mutable séparément — P2.4) ; formulation collante/positive/dégressive (§1.3-1.5) non implémentée (P2.4) ; niveau pilote figé `intermediate` (P3.2).

**📋 Prochaine étape** : **P2.3** — widget overlay `cornercoach` : event Tauri `coach-corner` ({texte, virage, delta, **détail chiffré** que la voix ne dit pas, §1.2}) émis depuis le service/hook, composant `FC<WidgetProps>` (id `OverlayId` + `OVERLAY_DEFS` + `WIDGETS` + i18n ×4), effacement 15 s (calqué sur `CoachWidget`).

### 2026-07-03 — Coach par virage : P2.1 (moteur de diagnostic) implémenté

**Contexte** : suite de P1.3 — transformer les `corner-passed` du moteur en **une cause dominante** par virage, filtrée (inhibiteurs §6) et confirmée (seuils §7). Pas de voix ni widget (P2.2/P2.3).

**Livré** :
- ✅ **Mesure enrichie** (`engine.ts`) : `CornerMeasurement` porte désormais les **cibles de réf** projetées dans la fenêtre (`refBrakeDist/refVmin/refVentry/refVexit/refFullThrottleDist/refGLatMax/refBrakeReleaseDist/refCornerTime`, échantillonnées via `refValueAt`), les **faits de pilotage** manquants (`brakeReleaseDist` pour le trail, proxies `lockupProxy`/`wheelspinProxy` — frein fort + décél. faible / plein gaz + accél. faible, sans slip au tampon), et un **contexte d'inhibiteurs par fenêtre** (`CornerContext` : gap devant/derrière, jaune, coupures, crevaison, usure, tête-à-queue, impact, maps TC/ABS). Le taint reste **par fenêtre** (§6) : un dépassement en T1 ne mute pas T9. Un **tampon de contexte parallèle** (non persisté, hors réf) est agrégé sur `[i0,i1]`.
- ✅ **`frame.ts`** — la `CoachFrame` expose les signaux §6 (`trackLimits, wheelFlat, minWear, tcMap, absMap, antiStall, impact`), seul point qui connaît `LiveData`.
- ✅ **`diagnostics.ts`** — moteur **pur** `(measurement, state, config) → diagnostic | muted | none`. Les 9 diagnostics §5 avec **priorité** (binaire blocage/patinage → **constance avant pace** → pace) ; **inhibiteurs** §6 → `muted` motivé ; **seuils adaptatifs** §7 : plancher relatif (`max(0,15 s ; 8 % t_virage)`, `max(5 km/h ; 4 % Vmin)`…) **+ 2σ** pilote (anneau par `corner_uid`), **hystérésis 2σ armement / 1σ extinction**, **confirmation sur 2 passages** (sauf binaire), élargissement pneus usés (< 30 %), **calibration ≥ 3 tours**, gating par **niveau** (pas de trail au débutant). Subtilité clé : la base σ de pace n'accumule **que les passages sous seuil** (un écart armé ne gonfle pas sa propre dispersion, sinon la confirmation retombe sous 2σ) ; `dtHist` reste complet pour la constance.
- ✅ **`service.ts`** — au `corner-passed`, applique `diagnoseCorner` (niveau, `validLaps`, maps TC/ABS lues des méta de la réf) et relaie via `onDiagnostic`. Anneaux σ réinitialisés au `combo-changed`. `setDriverLevel` (auto-calibration = P3.2).
- ✅ **Validé** : `tsc -b` ✅, `eslint` ✅, + **smoke test déterministe** (rejeu bundlé esbuild) : réf bâtie d'un tour propre → 6 tours propres bruités **silencieux**, 2 tours « frein ~50 m tard » → **brake-timing** confirmé (sign +, ~40 m) au 2ᵉ passage, trafic devant (`gap < 1,5 s`) → **muted traffic-ahead**.

**⚠️ Réserves** : proxies blocage/patinage **grossiers** (pas de canal slip au tampon 8 canaux → à affiner quand `long/lat_patch_vel` seront bufferisés) ; seuil d'impact `IMPACT_MUTE` à calibrer sur données réelles ; niveau pilote figé `intermediate` jusqu'à P3.2.

**📋 Prochaine étape** : **P2.2** — voix : priorité `coach` dédiée + fenêtre de délivrance (§1) + gabarits `voiceMessages` (groupe `corners`) ×4 langues, en consommant les verdicts `onDiagnostic`.

### 2026-07-03 — Coach par virage : P1.3 (capture/éligibilité réf v2) implémenté

**Contexte** : suite de P1.2 — transformer un tour bouclé éligible en **référence dense v2** persistée (§3.1/§3.2 de `COACH-LIVE-SPEC.md`).

**Livré** :
- ✅ **Éligibilité dans le moteur** (`frame.ts` + `engine.ts`) : la `CoachFrame` porte désormais `yellow` (FCY **ou** drapeau secteur) et `tiresReady` (carcasse mini des 4 roues ≥ 60 °C — heuristique conservatrice qui attrape l'out-lap froid, tolère le chaud, en attendant des fenêtres par gomme en P3). Le moteur **accumule** sur tout le tour `lapMinGap`/`lapYellow`/`lapTiresOk` (trames en piste), et attache un verdict `LapEligibility` détaillé au `lap-completed` : `eligible = clean ∧ gapOk (gap_ahead > 2 s) ∧ noYellow ∧ tiresOk`. Chaque critère reste exposé (futur message « non retenu : trafic »). Déterminisme/rejouabilité préservés (§14).
- ✅ **`capture.ts`** — module **pur** `(CompletedLap, CaptureMeta) → CoachRefSavePayload` : rééchantillonne les 8 canaux du tampon (~20 Hz, pas irrégulier) sur la **grille curviligne régulière 4 m** (schéma `channels[c·n_points + i]` attendu par `windows.refAt`), et bâtit les fenêtres `coach_corner` (une par virage auto-détecté ; `corner_uid` déterministe par bucket d'apex = ancre d'identité des tours live). Interpolation bornée (clamp) aux extrémités. `captureMetaFromLive` snapshotte les conditions (temps piste/air, wetness, gommes, fuel, tc/abs, pit).
- ✅ **`service.ts`** — au `lap-completed` **éligible** qui bat le meilleur temps enregistré de la session (et plus rapide que la réf courante, sauf si `stale`), construit la charge et l'**enregistre** via `coachRef.save` (purge backend 3/combo, déjà en place P1.1 → **aucun rebuild Rust**), puis recharge la réf pour réaligner les fenêtres. Nouveau hook `onRefCaptured`. Le moteur reste pur : toute l'I/O vit dans le service.
- ✅ **Validé** : `tsc -b` ✅, `eslint` ✅, + **smoke test déterministe** (rejeu bundlé esbuild) : tour propre → éligible + payload `n_points=299`, `channels` plat 8×n, canal time croissant, `corner_uid` déterministe ; 4 variantes inéligibles vérifiées (jaune / aspiration `gap<2 s` / pneus froids / pit).

**📋 Prochaine étape** : **P2.1** — 9 diagnostics (dont constance) + table d'inhibiteurs (§6) + seuils adaptatifs 2σ / hystérésis / confirmation sur 2 passages, en consommant les `corner-passed` du moteur.

### 2026-07-03 — Coach par virage : P1.2 (moteur de mesure) implémenté

**Contexte** : suite de la spec `COACH-LIVE-SPEC.md` — P1.2 = le cœur, le moteur de mesure par virage.

**Livré** — nouveau module `src/lib/coach/` (4 fichiers) :
- ✅ **`frame.ts`** — `CoachFrame` + `frameFromLive(LiveData)` : seul point qui connaît le schéma `LiveData`. Normalise les unités (frein/gaz fraction [0,1] → **%**, cf. bug §0.4), utilise **`lap_dist_est`** (dead-reckoning P0.2). Le moteur ne dépend que de `CoachFrame` → pur et rejouable hors Tauri.
- ✅ **`windows.ts`** — fenêtres curvilignes `[brakeDist−150 m ; exitDist]` : `windowsFromRef` (projection depuis la réf dense, décodage grille `step_m`), `detectAllCorners` (freinage via `detectCorners` **+ détecteur gLat** pour les virages à fond > 1 g soutenu > 1 s), `assignUid` (identité stable par appariement apexDist < 40 m, déterministe — pas d'aléa).
- ✅ **`engine.ts`** — moteur **pur** `stepCoach(state, frame) → (state, events)` : tampon 8 canaux du tour, clôture de fenêtre à la **sortie** (pas apex−12 m), mesure vs réf (point de freinage interpolé sous-trame, Vmin, Ventry/exit, gLatMax, plein-gaz, **Δt fenêtre vs réf**). Événements `corner-passed` / `lap-completed` (tour complet + virages auto-détectés = matière de la réf P1.3) / `lap-reset` / `combo-changed`. État muté en place (déterminisme préservé, évite O(n²)).
- ✅ **`service.ts`** — service autonome abonné au flux **`live-data` brut** (pas le High FPS lissé), gère la charge async de la réf au `combo-changed` (`coachRef.load` → `setCoachRef`), relaie les événements aux abonnés.
- ✅ **Validé** : `tsc -b` ✅, `eslint` ✅, + **test de fumée déterministe** (rejeu d'un tour synthétique avec réf → 1 `combo-changed`, 1 `corner-passed` mesuré correctement, 1 `lap-completed`). Pas de diagnostic/inhibiteur/voix ici (P2).

**📋 Prochaine étape** : **P1.3** — capture/éligibilité de la réf v2 en session (tour propre + `gap_ahead > 2 s` + pas de jaune + pneus en fenêtre) : consommer les `lap-completed` du moteur pour construire une `CoachRefSavePayload` (8 canaux rééchantillonnés à 4 m + fenêtres `coach_corner`) et l'enregistrer via `coachRef.save`. Rebuild `npm run tauri:build:stt` si backend touché.

### 2026-07-03 — Coach par virage : spec v2 approfondie + P0/P1.1 implémentés

**Contexte** : décision de développer le « coach live par virage » **avant la sortie de la V1.0** (périmètre choisi : tout, P0 → P5). Spec de référence : `COACH-LIVE-SPEC.md` à la racine.

**Spec approfondie (v2)** — vérifiée ligne par ligne contre le code par 8 agents (5 audits + 3 critiques : pédagogie, ingénierie, complétude vs Trophi/Track Titan/VRS). Corrections factuelles majeures vs v1 :
- Le flux n'est **pas 50 Hz mais 20 Hz** (`live.rs:1440`), et `lap_dist` vient du bloc scoring (~5 Hz par rafales) → jusqu'à ~17 m entre points à 300 km/h.
- `tc_slip`/`tc_cut`/`abs` = **réglages de map** (u8), pas des événements d'activation.
- La réf `useLiveDelta` ne stocke **ni point de freinage ni Vmin ni aucun canal** ; `brakeDist`/`minSpeed` de `detectCorners` sont jetés.
- **Bug bloquant** : `detectCorners` attend des % mais le live pousse `brake ∈ [0,1]` → point de freinage live structurellement faux.
- Transcripts vidéo : **0 nom de virage** (pas « parfois faux »), aucun timestamp.
- Nouveautés spec : principes de coaching (fenêtrage cognitif, focus collant, renforcement positif, dégressif), 5 modes par session (Course/Qualif/Practice/Drill/Découverte), seuils adaptatifs 2σ, banque de phrases LLM à slots (0 appel sur le chemin critique), boucle d'apprentissage (objectifs → rapport 1+1+1), plan en 6 phases + tests sans rouler.

**Suivi** : 18 tâches créées (P0 → P5 + infra de test). **5 terminées**, toutes validées (cargo ✅, tsc ✅, eslint ✅, build ✅).

- ✅ **P0.1 — Bug d'unités frein** : `useLiveDelta.ts` convertit `tel.brake × 100` avant `detectCorners` ; unité documentée dans `corners.ts`. Corrige aussi le widget Corner Delta existant.
- ✅ **P0.2 — Dead-reckoning distance** (`live.rs`) : nouveau champ `LiveTelemetry.lap_dist_est` = `lap_dist` extrapolé (trapézoïdal, borné 0,5 s) via `m_elapsed_time`. ~±1 m vs ~±17 m. `lap_dist` inchangé (zéro régression). Champs `dr_*` ajoutés à `PollState`.
- ✅ **P0.3 — Exports backend** : `LiveWeather.{wind_dir_deg, path_wetness_avg, path_wetness_max}`, `LiveWheel.{rotation, lat_patch_vel, long_patch_vel}` (vrais signaux blocage/patinage), `LiveExtended.game_version` (péremption réfs), `LiveData.track_dists` (distance-tour alignée à `track_points`, pour heatmap). Types `api.ts` + `OverlayRoot.tsx` à jour.
- ✅ **P1.1 — Persistance réf v2** : 3 tables SQLite (`db.rs`) — `coach_ref` (8 canaux Float32 en BLOB, clé **par voiture** pas par classe, métadonnées build/météo/fuel), `coach_corner` (fenêtres curvilignes + `corner_uid` stable), `coach_stats` (dispersion 2σ). Nouveau module `commands/coach.rs` : 5 commandes (`coach_ref_save` avec purge 3/combo, `coach_ref_load` priorité best/ghost puis stale, `coach_ref_mark_stale`, `coach_stats_for_combo/upsert`) enregistrées dans `lib.rs`. Wrappers typés + interfaces dans `api.ts` (`coachRef`).

**⏳ Reste (13 tâches)** :
- **P1.2** (prochaine) — Moteur coach : module TS **pur** `(frame, state) → (state, events)` hors React, abonné à `live-data` brut (pas le flux High FPS lissé) ; tampon 8 canaux, fenêtres curvilignes `[brakeDist−150 m ; exitDist]`, `corner_uid` stable (appariement apexDist < 40 m), détecteur gLat pour virages à fond, événement `corner-passed`.
- ✅ **P1.3** — Capture/éligibilité réf v2 en session (tour propre + gap_ahead > 2 s + pas de jaune + pneus en fenêtre) : `LapEligibility` accumulée dans le moteur + `capture.ts` (rééchantillonnage 4 m + fenêtres `coach_corner`) + enregistrement `coachRef.save` dans le service (2026-07-03).
- ✅ **P2.1** — Moteur de diagnostic pur `diagnostics.ts` : 9 diagnostics §5 (priorité binaire → constance → pace) + inhibiteurs §6 par fenêtre (`CornerContext`) + seuils adaptatifs 2σ / hystérésis 2σ↑/1σ↓ / confirmation 2 passages / calibration ≥ 3 tours / gating niveau. Mesure enrichie (cibles réf + proxies) dans `engine.ts` ; relais `onDiagnostic` dans le service (2026-07-03).
- ✅ **P2.2** — Voix : priorité `coach` dédiée + ttl custom + fenêtre de délivrance (`coach/voice.ts`) + gabarits `voiceMessages` (groupe `corners`) ×4 langues + hook `useCornerCoach` (2026-07-03).
- ✅ **P2.3** — Widget overlay `cornercoach` : event `coach-corner` émis par `useCornerCoach` à la délivrance vocale ({texte, virage, code, magnitude **exacte**, unité, sens}) ; composant + registre (`OverlayId`/`OVERLAY_DEFS`/`WIDGETS`) + i18n ×4 ; effacement 15 s (2026-07-03).
- ✅ **P2.4** — Modes par session (`coach/mode.ts` : Practice nominal / Course = erreur répétée ≥ 3× / Qualif = muet en roulage) + pédagogie dans `voice.ts` (`observeCorner` sur **chaque** clôture de virage) : focus collant §1.3 (un chantier, tenu ≤ 5 tours, pas de zapping), dégressif §1.5 (systématique → 1/2 → 1/3 → silence), renforcement positif §1.4 (résolution sur 2 passages propres → `vCornerResolved`/`vCornerClean`, widget vert). i18n ×4 + registre `voiceMessages` (2026-07-03).
- ✅ **P3.1** — Mapping ApexPoints (`apex.ts` : parsing `T2-T9`/`T10A`, table de correction COTA/Sebring embarquée + `validateCorrections`, réf macro enrichie, mapping ordinal monotone → fenêtres) + branchement service (getters `coachMacro`/`coachMappedMacro`) (2026-07-03).
- ✅ **P3.2** — Niveau pilote **auto-calibré** ohne_speed (`calibration.ts`) + **réf courte** médiane glissante 3 tours propres (`shortref.ts`) + **péremption** build/temp/wetness/compound (`staleness.ts`) ; `diagnostics.ts` : cible dense **confirmée sur les deux réfs** en frais / cible **courte relative** (« que d'habitude ») si périmée ; câblage service (2026-07-03).
- ✅ **P3.3** — Mode Découverte prédictif (`predictive.ts` : cibles ApexPoints ancrées aux fenêtres auto-détectées + ordonnanceur `brakeDist − v·(TTS+2 s)` + fade 3 tours) ; pré-synthèse TTS (`prewarmSpeech`/cache `voice.ts`) ; `mode.ts` `predictive` en Découverte ; câblage service (`onCoachPredict`/`onPredictTargets`) + hook + widget (code `predict`) + i18n ×4 (2026-07-03).
- ✅ **P4.1** — Apprentissage : table `corner_history` (backend) + modules purs `history.ts` (agrégation session : Δt médian/IQR/taux de réussite + progression/tendance) & `report.ts` (rapport « 1+1+1 », rappel inter-sessions, objectifs, cap ohne_speed) ; câblage service (débrief au retour stand, rappel au 1ᵉʳ virage, persistance) + hook + widget (codes `report`/`recall`) + i18n ×4 (2026-07-03).
- ✅ **P4.2** — Mode **Drill** (module pur `drill.ts` : compteurs par virage + verdict propre/série/diagnostic + cibles « ton virage » ancrées aux fenêtres) ; `stepPredictive` `fadeMax=Infinity` ; câblage service (`setDrillMode` = objectifs auto, court-circuit pédagogie, ordonnanceur dédié, `onCoachDrillVerdict`) + hook + toggle Config `coachDrill` + i18n ×4. Aucun code Rust touché (2026-07-03).
- ✅ **P4.3** — Banque de phrases LLM à slots (`phrasebank.ts` pur + `ai/phrasebank-gen.ts` + orchestration `coachPhrasebank.ts` + backend `coach_phrasebank_*`) : 1 appel batch/combo×langue, variantes par (virage, diagnostic), slots `{{d}}`/`{{n}}` remplis en code → 0 latence/coût en roulage, hors-ligne après génération. + « pourquoi ? » vocal (§12) : anneau des N derniers diagnostics injecté au contexte du PTT `Alt+C`. Toggle Config `coachPhrasebank` + bouton Générer/Effacer + i18n ×4 (2026-07-03).
- **P5** — Ghost `.ld` · coaching de stint · heatmap · inputs/virage · risque.
- **T** — Infra de test sans rouler (enregistreur de frames JSONL, rejeu ×1000, fixtures, corpus d'or).

**📋 Prochaine étape** : **Phase P4 terminée** (P4.1 apprentissage + P4.2 Drill + P4.3 banque LLM/« pourquoi ? »). Suite = **P5** (extensions : ghost `.ld`, coaching de stint, heatmap des pertes, inputs par virage, coaching du risque) ou **T** (infra de test sans rouler §14). Rappel : **rebuild `npm run tauri:build:stt` nécessaire** (backend Rust : table `coach_phrasebank` P4.3 + `corner_history` P4.1).

### 2026-06-22 — Étude trophi.ai + plan évolution coach IA

- ✅ **Analyse de trophi.ai** (app commerciale installée localement) : comprend l'architecture de coaching IA du concurrent. App Unity + launcher .NET + IPC gRPC + backend cloud. Plugin LMU dédié (`trophiai_LMUPlugin_x64.dll`). Analyse IA **côté serveur** (pas d'LLM local). Catalogue structurant de 8 mécaniques (`GetUniversity*`).
- 📋 **Plan complet pour passer le coach IA de « analyste » à « entraîneur »** rédigé en §7 (9 sous-sections P1→P9) : scores mécaniques par virage, heatmap, flags d'erreurs, prompt structuré, plans d'entraînement persistants, boucle d'évaluation auto, mémoire de progression, drills ciblés, calibration pédale.
- 📋 **Prochaine étape** — en cas de reprise : démarrer par le **bloc analytique** (P1→P4→P2→P3) puis le **bloc entraîneur** (P5→P6→P7→P8). Décision ouverte : mode unique entraîneur vs toggle (recommandation : mode unique).

### 2026-06-22 — Télémétrie : trajectoires superposées + temps au tour dans les listes

- ✅ **Superposition de la trajectoire de référence sur la carte** (façon LMU Telemetry Lab). `TrackMap` accepte désormais `refLat`/`refLon` (tour de comparaison) ; les paramètres de projection GPS→écran (`lat0/lon0/cosLat/minX/minY/scale/pad`) sont conservés dans `geom.proj` pour projeter la 2ᵉ trajectoire dans le **même repère absolu** → superposition exacte, l'écart de ligne devient visible au zoom molette. Rendu : liseré sombre + trait violet pointillé (`#a855f7`) par-dessus le ruban accel/frein.
- ✅ **Toggle « Trajectoire réf. »** dans l'en-tête carte de `TelemetryView` (visible en mode comparaison 2D, actif par défaut) + extraction du GPS de `refData`.
- ✅ **Vraie surface de piste reconstruite (sans comparaison)** — demande : « voir ma trajectoire sur la piste », puis « la piste et la trajectoire sont deux choses différentes » → vraie piste, pas l'enveloppe de mes tours.
  - **Investigation** : les fichiers de piste du jeu (`Installed/Locations/*/**.mas`) sont **chiffrés/signés par Studio 397** (entête non‑rFactor2, ~41 % d'octets imprimables, `.mft` avec signatures) → AIW/bords **non extractibles**. Impasse.
  - **Méthode reprise de LMU Telemetry Lab** (source lue dans `C:\tmp\__DEV__\LMU-Telemetry-Lab-1.3.1`, `frontend/src/components/TrackMap.tsx` → `processGeometry`) : bords = trajectoire GPS du **tour le plus rapide** décalée le long de la normale, via les canaux télémétrie `Path Lateral` (offset latéral, m) et `Track Edge` (demi‑largeur, m). `bord = voiture + normale·(±W + L)`, normales lissées (fen. 8), largeurs lissées (fen. 25).
  - **Signe de `Path Lateral` validé empiriquement** : axe central reconstruit avec `+L` vs `−L` sur 6 tours Spa → dispersion inter‑tours **0,91 m (+L)** contre 2,31 m (−L) → `+L` correct (= convention LMU Telemetry Lab ; mon 1ᵉʳ jet `−L` était inversé).
  - **Validé visuellement** (proto Python) : tracé complet de Spa, largeur médiane **10,4 m**, ruban propre suivant la ligne.
  - Module `src/lib/telemetry/trackSurface.ts` (`reconstructTrackSurface`). `TrackMap` : prop `trackSurface` (bords lat/lon → polygone plein gris + liseré, ligne accel/frein par‑dessus). Tour le plus rapide chargé via `getChannels(lap=N)` (découpage fiable par la table `Lap`), statique pour la session. Toggle « Piste » (actif par défaut). `projectLine()`/`projectPts()` factorisés (réf + piste partagent la projection du tour courant).
  - **Épaisseur de ligne proportionnelle** : sur grand circuit, 1 m ≈ 0,45 u (Spa) → l'ancienne ligne fixe (9 u) était plus large que la piste (~4,5 u). `surfacePath` calcule la largeur médiane projetée et fixe `lineW = 20 % de la largeur` (plancher 0,8, plafond 9) → corde lisible dans les virages.
  - **Vue 3D** (`Track3D`) : même `trackSurface` → maillage `BufferGeometry` entre bords gauche/droit, altitude de chaque sommet reprise du point de trajectoire le plus proche (dévers ignoré), matériau gris sous la ligne. Toggle « Piste » désormais visible en 2D **et** 3D. Maillage libéré (`dispose`) au changement de fichier.
- ✅ **Meilleur temps au tour exposé par fichier** : nouveau champ `best_lap: Option<f64>` sur `TelemetryFileInfo` (Rust), calculé via `best_lap_time()` = min des durées de tours en excluant le dernier segment (partiel) + plancher 20 s. Renseigné dans `list_telemetry_files` (segmentation légère table `Lap` + bornes GPS) et `get_telemetry_meta`.
- ✅ **Temps affichés côté front** : nouvelle colonne triable « Meilleur tour » dans le tableau général `Telemetry.tsx` ; meilleur tour ajouté à chaque option du sélecteur de comparaison dans `TelemetryView` (avant : seulement la date). i18n `telemetry.bestLap` / `refLine` / `refLineHint` (FR/EN/ES/DE).
- ✅ `tsc` et `cargo check` propres.
- 📋 **Prochaine étape** : envisager de colorer la trajectoire principale selon le delta temps (vert/rouge) en plus de la superposition, et vérifier le coût de `list_telemetry_files` sur un gros dossier Telemetry (segmentation par fichier ajoutée).

### 2026-06-21 — Audit pré-production + correctifs bloqueurs

- ✅ **Audit complet avant diffusion communauté**. État sain : `tsc`/ESLint propres, build front OK, i18n FR/EN/ES/DE parfaitement équilibré (0 clé manquante), updater configuré (endpoint + pubkey), détection Steam robuste (registre + `libraryfolders.vdf` + scan A→Z), clé API coach chiffrée, aucun secret commité, 21 widgets overlay tous enregistrés et cohérents, aucun TODO/FIXME en suspens.
- ✅ **ErrorBoundary global** (T6.76 → fait) : `src/components/ErrorBoundary.tsx` (composant classe, lit i18n via l'instance). Enveloppe les `<Routes>` dans `App.tsx` → un crash de page n'affiche plus d'écran blanc (Header/Footer restent navigables) ; boutons Réessayer / Tableau de bord + détails techniques copiables. i18n `errorBoundary.*` (4 langues).
- ✅ **Route 404 catch-all** (T4.63 → fait) : `src/routes/NotFound.tsx` + `<Route path="*">` dans `App.tsx`. i18n `notFound.*` (4 langues).
- ✅ **2 panics `NaN` corrigés** : `queries.rs:336` et `indexer.rs:700` — `partial_cmp(...).unwrap()` → `unwrap_or(Ordering::Equal)` (un temps `NaN` issu d'un XML corrompu ne plante plus le tri backend).
- ✅ `tsc`, ESLint et `cargo check` propres.
- 📋 **Prochaine étape** : migrer les 13 `alert()`/`prompt()`/`confirm()` natifs de `Setups.tsx`/`SetupDetail.tsx` vers dialogs shadcn (T1.23), puis envisager le code-splitting `React.lazy` des routes lourdes (T5.69, bundle JS principal à 2,1 Mo). Restent ouverts pour plus tard : CSP non définie (T1.13), 27 `.catch(()=>{})` silencieux côté front (toasts).

### 2026-06-21 — ABS/TC live : lecture de la mémoire native LMU (`LMU_Data`)

- ✅ **Source trouvée et vérifiée** : LMU expose une mémoire partagée **native** (`LMU_Data`, interface intégrée S397 `Support\SharedMemoryInterface`, ~324 Ko), distincte du plugin rF2 standard. Elle contient les **vraies maps embarquées** : `mABS`/`mABSMax`, `mTC`/`mTCMax`/`mTCSlip`/`mTCCut`, `mMotorMap`, regen/SoC… (cf. `pyLMUSharedMemory` de TinyPedal). Pas de plugin tiers requis.
- ✅ **Implémentation** (`live.rs`) : `read_lmu_electronics()` ouvre `LMU_Data`, lit `playerHasVehicle`/`playerVehicleIdx`, puis le véhicule du joueur. **Offsets calculés depuis la struct officielle via Python/ctypes** (zéro transcription : `sizeof(LMUObjectOut)==324820` confirmé) → base telemetry `128464`, stride `1888`, `mTC`@750, `mABS`@756, etc. Lecture par offsets bruts (pas de port des 324 Ko de structures).
- ✅ `LiveExtended` enrichi : `tc`/`abs` viennent **désormais de `LMU_Data`** (plus de `mPhysics` rF2) + nouveaux `tc_max`/`abs_max`/`motor_map`. Overlay **Aids** affiche `valeur/max` (ex. ABS 9/9). Coach : ligne « In-car electronics maps » **re-branchée** avec les vraies valeurs (si >0).
- ✅ **VALIDÉ EN LIVE** (2026-06-21) : l'utilisateur a confirmé — overlay Aids affiche `ABS 6/9` et `TC 7/11`, identiques au setup en jeu (ABS 6, TC à bord 7). Offsets corrects, nom de map `LMU_Data` OK, interface native active par défaut. 🎯
- ✅ **3 réglages TC ajoutés** (retour utilisateur : LMU en a 3) : `mTCCut` (@754) et `mTCSlip` (@752) + leurs max → champs `tc_cut`/`tc_slip`/`tc_cut_max`/`tc_slip_max` (Rust+TS). Overlay Aids affiche désormais **TC · TC CUT · TC SLIP · ABS** (+ Bias, Limiteur). Coach : ligne électronique enrichie (3 TC).
- ✅ **Nettoyage éléments rF2 inutiles sur LMU** : overlay Aids — retiré **Richesse** (fuelMix), **Turbo** (=pression atmo, pas de turbo), **DRS** (inutilisé). Onglet Télémétrie Live — retiré **Turbo**, tag **DRS**, tag **Volet AV**. Clés i18n orphelines `lTurbo`/`tagDrs`/`tagFrontFlap` supprimées des 4 langues (équilibre vérifié). Anti-stall conservé (vrai système LMU).
- 📋 Bonus dispo dans la même struct (cf. « Opportunités LMU_Data » section 7).

### 2026-06-21 — Page Profil : 5 stats ajoutées

- ✅ Backend `DashboardStats` (`queries.rs`) enrichi : `races_total`, `races_finished`, `dnf` (finish_status='DNF'), `fastest_laps` (courses où le joueur a le meilleur tour de SA classe, sous-requête MIN par classe/session), `avg_progression` (AVG progression sur courses finies). + type TS.
- ✅ Profil affiche désormais : **Abandons (DNF)**, **% courses finies**, **Tours complétés** (total_laps), **Meilleurs tours**, **Progression moy.** (+/- places). Icônes Ban/CheckCircle2/Repeat/Zap/ArrowUpDown.
- ✅ **i18n Profil complet (T1.22 soldé)** : toute la page Profil migrée vers `t()` (FR/EN/ES/DE) — stats principales (Sessions/Temps piste/Tours/Distance + sous-libellés), 14 stats secondaires, en-tête « LMU Driver ». ~23 clés `profile.stat*` + `driverLabel`, `t` ajouté au sous-composant `ProfileHero`. Plus aucun libellé FR en dur ; i18n équilibré.
- ✅ `cargo check`, `tsc`, ESLint propres.

### 2026-06-21 — Coach IA : optimisations Axes 1-2-3

- ✅ **Axe 1 — digest records conditionnel + cache** : `buildLiveCoachContext(data, question?)` ne joint le digest de tous les records **que si la question est historique** (`isHistoricalQuestion`, multilingue) → contexte vocal/Live léger pour les questions courantes. Digest **caché** (1 appel SQLite, réutilisé), invalidé après sync/réindex (`resetRecordsDigestCache` dans `app.ts`). **Post-course + comparaison inchangés** (historique toujours inclus via leur propre contexte). Question passée via `getContext(question)` (panneau + vocal).
- ✅ **Axe 2 — verdicts déterministes pneus/freins** : `lib/ai/insights.ts::buildTyreInsights` pré-calcule en code (indépendant de la voiture) : balance de température (avant/arrière → sur/sous-virage, gauche/droite, pneu le plus chaud), **gonflage** déduit du profil de bande (centre vs bords), usure (pneu le plus usé), balance de freins av/ar. Injecté dans le contexte live sous « Computed insights (trust these) » — même principe que le STRATEGY COMPUTER. Le LLM ne fait que **formuler** (anti-hallucination).
- ✅ **Axe 3 — lexique LMU dans le prompt système** (4 langues) : énergie virtuelle = jauge de relais carbu+hybride (≠ litres), 3 réglages TC (intervention/power cut/slip angle), track limits = points avant pénalité, hybride = part de la perf/stratégie → interprétation correcte des données.
- ✅ **Correctif TC** : le coach conseillait « baisse les 3 TC à 4 » (valeur unique, illogique). Prompt renforcé (4 langues) : les 3 TC sont **indépendants**, rôle de chacun explicité, consigne de conseiller **séparément** (direction+raison par paramètre, pas de valeur unique, chiffre seulement si justifié et dans la plage). **+ « TC = Traction Control » explicité** dans le prompt ET dans les données du contexte live (le modèle ne reconnaissait pas l'abréviation « TC »).
- ✅ `tsc`, ESLint propres.
- ✅ **Axe 4 — modèle dédié vocal** : nouveau réglage `aiVoiceModel` (store + `ai_voice_model`), 2e sélecteur en Config (« Modèle vocal », défaut « = modèle d'analyse »). `useCoachVoice` utilise `aiVoiceModel || aiModel` ; panneau/post-course gardent `aiModel`. → modèle rapide pour le vocal en course, puissant pour l'analyse. i18n 4 langues.
- ✅ **Axe 5 — texte STT reconnu affiché** : `useCoachVoice` toaste la **question reconnue** (« 🎤 … ») dès la transcription → l'utilisateur voit si la dictée a mal compris ; la **réponse** est aussi affichée (toast succès, en plus du TTS). Réutilise le système de toasts. (Limite : toasts dans la fenêtre principale, pas dans l'overlay in-game.)
- ✅ **Axe 6 — mémoire de progression** : `driver-history-context` ajoute un verdict **déterministe** de tendance (improving / plateau / regressing) — moyenne des 3 dernières sessions vs 3 précédentes + jours depuis le PB. Donne au coach (post-course) une « mémoire » de la trajectoire du pilote sur le combo, en plus de la faiblesse de secteur récurrente déjà présente. (Complète les « pinned coaching objectives » manuels existants.)
- ✅ **Coach IA : Axes 1→6 terminés.** `tsc`/ESLint propres.
- ✅ **Overlay Coach IA in-game** : nouveau widget `CoachWidget` (id `coach`) affichant la question vocale reconnue (🎤) + la réponse du coach dans le HUD, effacé 15 s après. Diffusion via event `coach-voice` émis par `useCoachVoice` (question puis réponse), reçu par la fenêtre overlay. Opt-in (page Overlays). Complète l'Axe 5 côté in-game (les toasts restent pour la fenêtre principale). i18n `items.coach` + `elements.coachIdle` (4 langues). Le message au repos affiche la **touche push-to-talk configurée** (lue via `config.get("spotter_key_coach")`, interpolée `{{key}}`) → l'utilisateur voit quelle touche maintenir.

### 2026-06-21 — Conclusion plugin rF2 (REQUIS) + fix menu hors session

- ✅ **Plugin rF2 = INDISPENSABLE, migration abandonnée** : test live de l'utilisateur — sans `rFactor2SharedMemoryMapPlugin64.dll`, l'overlay Aides affiche « — » partout → **`LMU_Data` n'est plus alimenté**. Le DLL (version adaptée LMU) écrit **les deux** : les maps `$rFactor2SMMP_*$` ET le bloc natif `LMU_Data`. On **garde l'architecture** (3 maps rF2 + LMU_Data) ; le tuto d'installation du plugin **reste pertinent**. Ne pas re-poser la question.
- ℹ️ **ABS/TC/brake bias = « — » hors piste, normal** : ces champs n'existent que pendant une session sur piste (télémétrie voiture). En menus/garage → « — ». Pas un bug, pas besoin de relancer l'app.
- ✅ **Fix menu bloqué hors session** : le **Dashboard figé** (données d'une session passée + voile « aucune session ») n'avait pas de menu → navigation bloquée. Ajout du `<Header />` **au-dessus du voile** (z-50 > z-40) quand `overlay` actif (figé/pause/fin). Session active = immersif sans menu (inchangé). Complète le fix précédent sur l'`InfoScreen`.

### 2026-06-21 — 4 quick-wins LMU_Data + widget Session retiré + fixes Live

- ✅ **Widget Session retiré** (choix utilisateur, redondant) : registre, def overlay, type, fichier, i18n (items.session + elements.type/timeLeft) supprimés. Créneau libéré → Limites de piste.
- ✅ **#1 Delta « live » au PB** : `lap_delta` vient désormais de `mDeltaBest`@696 (delta roulant natif LMU, comme le HUD) quand dispo, sinon repli sur l'estimation rF2. → overlay Delta + vue d'ensemble précis.
- ✅ **#2 Lift & Coast réel** : `mLiftAndCoastProgress`@766 → valeur officielle affichée dans LiftCoastWidget (repli heuristique sinon).
- ✅ **#3 Overlay « Limites de piste »** (NOUVEAU) : `mTrackLimitsSteps`@767 + seuil `mTrackLimitsStepsPerPenalty`@1983 (abs, bloc ScoringInfo) → `TrackLimitsWidget` (points/seuil, barre vert→jaune→rouge ≥85 %). Coach : section « Track limits » avec alerte ≥60 %. i18n `items.tracklimits` + `elements.beforePenalty` (4 langues).
- ✅ **#4 Écarts à fréquence télémétrie** : `mTimeGapCarAhead`@780 / `mTimeGapCarBehind`@784 → vue d'ensemble utilise ces gaps lissés (repli classement rF2 ~5 Hz sinon).
- ✅ Champs ajoutés à `LiveExtended` (Rust+TS) : `lift_coast`, `track_limits`, `track_limits_per_penalty`, `gap_ahead`, `gap_behind`. Tous lus dans la même struct joueur que ABS/TC.
- ✅ Fixes Live précédents : menu accessible sur écrans d'info (Header), **usure pneus corrigée** (`m_wear*100`, neuf=100 %), coach **sur-remplissage** carburant, brake bias **AV:AR** 1 décimale.
- ✅ `cargo check`, `tsc`, ESLint, i18n équilibré.
- ⚠️ **À TESTER EN LIVE** : delta roulant (doit bouger en continu), L&C, overlay Limites de piste (activer dans Overlays — position du créneau Session), écarts plus fluides. Valider les 4 d'un coup.

### 2026-06-21 — Énergie virtuelle / hybride (LMU_Data) + brake bias 3 décimales

- ✅ **Page Setup vérifiée** (à la demande, via screenshots du jeu) : `setupParams.ts` couvre bien tous les paramètres montrés — Slow/Fast Bump/Rebound, Anti-Roll Bar (av/ar), Toe/Pincement, Steering Lock, Spring Rate, Ride Height, Brake Bias/Migration, Third Spring, etc. La page lit le `.svm` réel et affiche tout avec libellés FR. RAS.
- ✅ **Brake bias en 3 décimales** (retour utilisateur) : overlay Aids + onglet Télémétrie passent `toFixed(0)` → `toFixed(3)` (ex. `48.500%`) → on voit la migration de frein en live.
- ✅ **Énergie virtuelle & hybride implémentés** (option A) : lecture `mVirtualEnergy`(@776), `mStateOfCharge`(@772), `mRegen`(@768), `mBatteryChargeFraction`(@704→f32), `mElectricBoostMotorState`(@744) dans `read_lmu_electronics`. Nouveaux champs `LiveExtended` (Rust+TS). **Overlay Fuel** : Stat « Énergie virt. » (xx.x %) affiché **uniquement si voiture hybride** (>0). **Coach** : section « Hybrid / virtual energy » (énergie restante %, SoC %, regen kW, état hybride deploying/regenerating). i18n `overlays.elements.virtualEnergy` (4 langues).
- ✅ `cargo check`, `tsc`, ESLint, i18n équilibré.
- ⚠️ **À TESTER EN LIVE** : valeurs énergie virtuelle / SoC / regen sur une Hypercar (LMH/LMDh). Sur GT3 (non-hybride) la section reste masquée (=0), normal.
- 📋 Suite possible (mêmes offsets, déjà connus) : alerte limites de piste (`mTrackLimitsSteps`@767), lift & coast (`mLiftAndCoastProgress`@766).

### 2026-06-21 — Opportunités futures de la mémoire native `LMU_Data`

> La struct complète (`LMUVehicleTelemetry`/`LMUVehicleScoring`/`LMUScoringInfo`, cf. pyLMUSharedMemory) expose **bien plus** que le rF2 standard. Tout se branche comme l'ABS/TC (offset via Python/ctypes + wiring + test live). Priorisé par valeur communauté :

- 🔴 **Énergie virtuelle & hybride** (LE différenciateur WEC) : `mVirtualEnergy` (@776, énergie restante = vraie métrique de relais combinant carbu+hybride), `mStateOfCharge` (@772), `mBatteryChargeFraction`, `mRegen` (@768, kW), `mElectricBoostMotorState`/`Torque`/`RPM`/`Temperature`. → overlay/coach « énergie restante → X tours », gestion déploiement/récup, calcul de relais basé énergie (pas litres).
- 🔴 **Alerte limites de piste** : `mTrackLimitsSteps` + seuils `mTrackLimitsStepsPerPenalty`/`PerPoint` (ScoringInfo). → overlay « track limits 2/3 avant pénalité » live. Rapide à faire.
- 🟡 **Lift & coast** : `mLiftAndCoastProgress` → coaching éco-conduite/énergie.
- 🟡 **Pneus/freins détaillés** (par roue, absents du rF2) : `mBrakeTemp`, `mBrakePressure`, `mTireCarcassTemperature`, `mTemperature` (3 pts int/centre/ext), `mPressure` (à chaud), `mGripFract`, `mRideHeight`, `mCamber`, `mToe`. → overlay pneus enrichi, alertes « freins froids »/« surchauffe avant-G », pressions à chaud.
- 🟡 **Écarts & conditions fins** : `mTimeGapCarAhead/Behind` (fréquence télémétrie), `mTrackGripLevel` (green→saturated), `mCloudCoverage`, `mAvgPathWetness`, `mTimeOfDay`, `mSessionTimeRemaining` ; `mFuelFraction` **par voiture** (scoring → estimer carbu/fenêtre d'arrêt des rivaux).
- 📋 Ordre conseillé : (1) énergie virtuelle/hybride → (2) limites de piste → (3) pneus/freins.

### 2026-06-21 — Bug coach « TC/ABS 0 » : mauvais champ (aides rF2 ≠ maps voiture)

- ⚠️ **Diagnostic** : le coach annonçait « TC 0 · ABS 0 » alors que l'utilisateur a ABS 9 / TC 5. Les valeurs `extended.tc/abs` viennent de `Extended.mPhysics` (`live.rs:1184`) = **aides de pilotage rF2** (réglage de difficulté, 0 = off), **pas** les maps ABS/TC **électroniques** de la voiture LMU (réglables au volant). La télémétrie rF2 standard lue par le plugin n'expose pas ces maps embarquées → toujours 0 si les aides rF2 sont off. Même source pour l'overlay Aids (affiche « — » si 0, donc moins trompeur).
- ✅ **Correctif** : `live-context.ts` n'envoie plus `tc/abs` au coach (bloc « Electronics (adjustable) » retiré) → fini les affirmations fausses. Commentaire explicatif laissé. `tsc`/ESLint propres.
- 📋 Reste ouvert : trouver si LMU expose réellement les maps ABS/TC embarquées quelque part (sinon non récupérable). Overlay Aids : à relabel/retirer si jugé trompeur (montre « — » actuellement).
- ℹ️ **Coach live sur la page Live** : possible — onglet « Coach » présent (`Live.tsx:1225`), affiché **uniquement si `aiCoachEnabled`** (Config). Le coach vocal push-to-talk marche en parallèle partout.

### 2026-06-21 — Live & Coach : 4 améliorations

- ✅ **Coach live → accès à tout l'historique** : le coach (vocal `useCoachVoice` + onglet Coach `LiveCoachPanel`) ne voyait que la session courante (« pas de temps sur cette session »). Nouveau `lib/ai/context/records-context.ts` : `buildRecordsDigest()` (résumé compact de `records.getOverview()` = best lap/combo, trié par classe/circuit) + `buildLiveCoachContext(data)` = contexte live + digest records. Le coach répond désormais à « mon meilleur temps à Spa en Mercedes ? » pour n'importe quel combo.
- ✅ **Filtres de classe sur le classement Live** (`StandingsTable`) : barre de boutons par classe présente (ordre canonique, `ClassBadge` solid, multi-sélection ; ensemble vide = toutes). Lien « Toutes les classes » pour réinitialiser. Affiché seulement si >1 classe.
- ✅ **Position dans la vue d'ensemble** (`OverviewView`) : bloc position en haut du chrono — **P{classe}** en grand (couleur de classe) + badge classe + **P{général} au général**. Distinction position de classe / position globale.
- ✅ i18n `live.overall` + `live.filterAllClasses` (4 langues ; `live.position` réutilisé). `tsc`, ESLint, `vite build` propres.

### 2026-06-21 — Logos de marques : ADESS manquant + Ford à mettre à jour

- ✅ **Audit logos** (`public/logos/` vs `cars.json` brands, logique de match réelle = strip espaces/`-`/`_` des 2 côtés) : seule marque sans logo = **ADESS** (LMP3 ADESS AD25). `acura → acura.png` = référence morte (aucune voiture Acura, inoffensive).
- ✅ **ADESS** : placeholder wordmark rouge généré (`public/logos/adess.png`, Arial Bold, lisible clair+sombre) + mapping `"adess": "adess.png"` ajouté dans `cars.json`. Remplaçable par le vrai logo.
- ✅ **Ford → « Ford Racing »** + **ADESS réel** (2026-06-21) : l'utilisateur a fourni les 2 logos (blanc sur fond coloré). Traités (rognage marge uniforme + resize h≈84) et installés : `ford.png` (badge bleu Ford Racing) remplace l'ovale ; `adess.png` (badge noir, texte blanc) remplace le placeholder rouge. Fond conservé volontairement (logo blanc monochrome → invisible sur thème clair si transparent ; le badge reste lisible clair+sombre).

### 2026-06-21 — Vrais rendus voitures (lot 2 : 24 captures, identifiées à la vue)

- ✅ Captures fournies **sans nom** → identification visuelle (livrée/logos/forme) de chacune, puis mapping timestamp→slug (`scripts/process_cars_mapped.py`), même pipeline rembg.
- ✅ **24 modèles installés** → **32/36** voitures ont désormais un vrai rendu. Restent **4 silhouettes** : `aston-martin-vantage-amr-gte`, `chevrolet-corvette-c8-r-gte` (GTE non fournies), `bmw-m4-lmgt3-evo`, `ferrari-296-lmgt3-evo` (variantes Evo — image base dispo, duplication possible).
- ✅ **LMP3 confirmés par l'utilisateur** (2026-06-21) : #12→`duqueine-d09`, #4→`ginetta-g61-lt-p325-evo`, #8→`ligier-js-p325`.
- ✅ **Variantes Evo comblées** (2026-06-21, choix utilisateur) : `bmw-m4-lmgt3-evo` et `ferrari-296-lmgt3-evo` réutilisent le PNG de la version de base (visuellement identiques).
- ✅ **2 GTE finales** (2026-06-21) : 1er essai = livrées GT3 par erreur (badge « LM GT3 » détecté au zoom → écarté) ; 2e essai correct via le badge « AM » (catégorie GTE Am, absente du LMGT3) : `aston-martin-vantage-amr-gte` (#25 orange) + `chevrolet-corvette-c8-r-gte` (#33 jaune). → **36/36 vrais rendus, 0 silhouette.**
- 📋 Astuce d'identification : distinguer GTE de GT3 par le badge de classe en jeu (« AM » doré = GTE ; « LM GT3 » = LMGT3).
- ✅ **Peugeot confirmé** (2026-06-21) : lot 1 = la plus récente (2026) = `peugeot-9x8-evo` ; #93 = la plus ancienne = `peugeot-9x8`. Attribution correcte, pas de permutation.
- 📋 Fournir les 4 manquantes ou valider la duplication base→Evo pour BMW/Ferrari.

### 2026-06-21 — Vrais rendus voitures (lot 1 : 8 Hypercars)

- ✅ **Pipeline de traitement** : `scripts/process_cars.py` — détourage IA (`rembg`, modèle `isnet-general-use`, alpha matting) → rognage sur contenu → marge 1,5 % → resize largeur 700 px → PNG transparent. Entrée `_incoming_cars/*`, sortie `_incoming_cars/out/`. `rembg`+`onnxruntime` installés (Python 3.10, modèle ~179 Mo dans `~/.u2net/`).
- ✅ **8 Hypercars traitées et installées** dans `public/cars/` (captures garage fond studio sombre fournies par l'utilisateur) : alpine-a424, aston-martin-valkyrie-amr-lmh, bmw-m-hybrid-v8 (remplace l'ancien PNG), cadillac-v-series-r, ferrari-499p, genesis-gmr-001, peugeot-9x8-evo, toyota-tr010. Détourage propre (roues intactes, ailerons fins préservés). Les 7 `.svg` placeholders correspondants supprimés (le PNG prime).
- ✅ Reste **28 silhouettes** SVG pour les modèles non encore fournis (LMP/GT/GTE + 6 hypercars manquantes). `_incoming_cars/` vidé, prêt pour le prochain lot.
- 📋 Léger résidu sombre au-dessus de la Ferrari (aileron) — retouche possible. 📋 Fournir les lots suivants → relancer `python scripts/process_cars.py` puis copier `out/*.png` dans `public/cars/`.

### 2026-06-21 — Placeholders silhouettes pour les images de voitures

- ✅ **Constat** : `public/cars/` ne contenait qu'1 image (`bmw-m-hybrid-v8.png`) sur 36 modèles → menu Setups visuellement « troué ». Les vrais rendus sont sous copyright (non fournis).
- ✅ **Repli SVG** : `CarImage.tsx` essaie désormais `.webp` → `.png` → **`.svg`** (un `.svg` placeholder s'affiche tant que le vrai rendu n'est pas déposé ; le rendu réel prime ensuite).
- ✅ **35 silhouettes générées** par `scripts/gen-car-placeholders.mjs` (idempotent, n'écrase pas un rendu réel) : forme « proto » (Hyper/LMP) ou « gt » (GT3/GTE), teintée par couleur de classe (`CAR_CLASS_SOLID_COLORS` : Hyper #ef4444, LMP2 #3b82f6, LMP3 #a855f7, GT3 #22c55e, GTE #f97316). `README` du dossier mis à jour.
- ✅ `tsc` propre. 📋 Remplacer les `.svg` par de vrais rendus au fil de l'eau ; relancer le script si LMU ajoute des voitures.

### 2026-06-21 — Toasts sur les CRUD silencieux (T6.75 / partiel T1.11)

- ✅ **Tri des 27 `.catch(() => {})`** : la plupart sont des lectures en tâche de fond (préchargements, comptes, overview) ou des internes de la **fenêtre overlay** (qui n'a pas de `DialogHost` → un toast n'y apparaîtrait pas) → laissés tels quels à dessein. Ciblé uniquement les **écritures déclenchées par l'utilisateur** sans aucun feedback.
- ✅ **Config — maintenance** (`handleReindex`/`handleSync`/`handleClearCache`/`handlePurge`) : ces 4 actions affichaient un message de succès mais **n'avaient aucun `try/catch`** → un échec = promesse rejetée non gérée + zéro retour utilisateur. Ajout `try/catch` + `toastError("config.maintError : …")`. Nouveau libellé i18n `config.maintError` (4 langues).
- ✅ **Overlays — ouverture de la fenêtre** : les 5 `overlayApi.open().catch(() => {})` déclenchés par l'utilisateur (activer un overlay, mode édition, retour, création de profil, ré-ouverture au chargement) routés via un helper `openOverlay()` (`useCallback`) qui toaste `overlays.openError` en cas d'échec. Sinon : on active un overlay et rien n'apparaît, sans explication. Nouveau libellé i18n `overlays.openError` (4 langues).
- ✅ i18n FR/EN/ES/DE toujours équilibré (0 clé manquante). `tsc`, ESLint, `vite build` propres.
- 📋 **Non retenu** : toggle tray (`stores/app.ts` `setTrayEnabled`) — toggle de réglage mineur, pas une vraie opération de données ; les internes overlay (pas de host de toast). Reste backlog : code-splitting `React.lazy` (T5.69), CSP (T1.13).

### 2026-06-21 — Migration des dialogs natifs → toasts/modales (T1.23)

- ✅ **Nouveau système de dialogs** : `src/stores/dialogs.ts` (Zustand) expose une API impérative drop-in — `toast()`/`toastError()`/`toastSuccess()` (notifications transitoires auto-dismiss 4 s) + `confirmDialog()` → `Promise<boolean>` + `promptDialog()` → `Promise<string|null>`. Rendu par `src/components/DialogHost.tsx` (monté une fois dans `App`, hors conditions `isLive`/onboarding).
- ✅ **DialogHost** suit le pattern maison « backdrop + Card » (comme `NewSetupDialog`) : toasts bottom-right empilés avec icône par variante ; modales confirm/prompt avec `role="dialog"`/`aria-modal`, fermeture Échap + clic backdrop, focus auto + sélection sur le prompt, Entrée pour valider, bouton désactivé si vide, variante `destructive` pour les suppressions.
- ✅ **13 appels natifs migrés** : `SetupDetail.tsx` (5 `alert` → `toastError`/`toastSuccess`, 1 `confirm` → `confirmDialog` destructif) et `Setups.tsx` (3 `alert` → toasts, 1 `prompt` → `promptDialog`, 1 `confirm` → `confirmDialog` destructif). La suppression dans `SetupDetail` réutilise désormais le vrai message `setups.confirmDelete` (au lieu de l'ancien `setupDetail.deleted` = « Suppression confirmée », trompeur).
- ✅ Plus aucun `alert/prompt/confirm` natif dans `src/`. `tsc`, ESLint et `vite build` propres.
- 📋 **Prochaine étape** : code-splitting `React.lazy` des routes lourdes (T5.69) ; brancher des toasts sur les autres actions CRUD silencieuses (T6.75) ; définir la CSP (T1.13).
---

### Entrées antérieures au 21/06/2026 — archivées

Le journal des phases de migration V3 et des fonctionnalités livrées avant le 21/06/2026
(du 18/05 au 17/06, ~220 entrées) a été déplacé dans **`SUIVI-ARCHIVE.md`** pour garder
ce fichier lisible d'un bloc. Aucune information perdue — s'y référer pour l'historique complet.
