# SUIVI — LMU Stats Viewer V3

> **Document de reprise du projet. À LIRE EN PREMIER.**
> Mettre à jour la section « Journal de bord » à chaque session de travail.
> Dernière mise à jour : 2026-05-28 (suite 12)

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
- **À faire — badge Online/Solo** : afficher un badge ou icône « Online » vs « Solo » dans les tableaux Sessions et Dashboard, basé sur `xml_index.setting` (déjà en base). `Multiplayer` = online, `Race Weekend` = solo/coop (indistinguables). Purement visuel, aucun changement backend requis.

---

## 8. Journal de bord

> Format : `### YYYY-MM-DD — Titre` puis ✅ fait / ⏳ en attente / ❌ bloqué / 📋 prochaine étape.

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
