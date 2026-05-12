# HANDOFF — LMU Stats Viewer v2

> **Document de reprise du projet.**
> À mettre à jour à chaque session de travail (section "Journal de bord" en bas).
> Si tu reprends ce projet après une longue pause, **lis ce fichier en premier**.

---

## 1. Contexte

### Projet d'origine

- **Repo** : https://github.com/cparfait/lmustatsviewer
- **Auteur** : Christophe Parfait (cparfait)
- **Stack v1** : PHP 8 + Python launcher + SQLite + JS/CSS vanilla + InnoSetup
- **Distribution v1** : installeur Windows avec PHP embarqué, lance un serveur localhost
- **Données lues** : XML de `UserData/Log/Results/` du jeu Le Mans Ultimate

### Pourquoi une v2

Stack vieillissante. Beaucoup d'ajouts au fil du temps qui ont rendu l'app dure à maintenir et lente. L'objectif est de :
- Garder **toutes** les fonctionnalités existantes
- Moderniser l'UI/UX
- Améliorer les performances
- Faciliter la maintenance
- Ajouter de nouvelles fonctionnalités (car_config, comparaison ohne_speed, distinction LMP2 WEC/ELMS)

### Inspirations

- **Setup viewer** : https://github.com/porgabi/lmu-setup-viewer (Electron + React + MUI) — pour la page car_config
- **Analyzer moderne** : https://github.com/arminreiter/lmu-analyzer (React 19 + TS + Vite + Tailwind v4) — pour le design d'ensemble et la comparaison ohne_speed
- **Ohne_speed Sheet** (référence temps communauté) :
  https://docs.google.com/spreadsheets/d/e/2PACX-1vTN03UvJDm99byA6vQPZHKOCYVvfxLu1zkJAzdaKyROykzEKY2-Xl1rl1q5znZEf36m88dxMKsY2eaO/pubhtml

---

## 2. Décisions verrouillées

| Sujet | Décision |
|---|---|
| **Stack cible** | Tauri 2 + React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui + SQLite (via plugin Tauri SQL) |
| **State** | Zustand (stores : profile, theme, live) |
| **Routing** | React Router v7 |
| **Charts** | Recharts |
| **Icons** | lucide-react |
| **Forms** | react-hook-form + zod |
| **i18n** | react-i18next, 4 langues : FR / EN / ES / DE |
| **Distribution** | `.exe` Windows uniquement, installeur Tauri, auto-update via `tauri-plugin-updater` + GitHub Releases |
| **Code signing** | Pas de certificat pour le moment (SmartScreen warning accepté) |
| **Repo** | Réécriture **in-place** sur la branche `v2` de `cparfait/lmustatsviewer` — historique conservé |
| **Multi-user** | Plusieurs profils pilote sur la même installation (sélecteur dans le header) |
| **Migration données** | ❌ **Pas d'import** de l'ancien `lmu_cache.db` — on part from scratch. L'utilisateur réindexera ses XML LMU au 1er lancement. Pas de sauvegarde de setup en v1, donc rien à migrer côté `.svm`. |
| **Thèmes** | Dark + Light, toggle dans le header. Dark par défaut. |
| **Palette** | "Le Mans dark" — fond `#0A0E1A` + accent `#FFB400` (jaune Le Mans) |
| **Police** | Inter (UI) + JetBrains Mono (chronos, valeurs numériques) |
| **Nouveauté importante** | Distinction **LMP2 WEC ≠ LMP2 ELMS** (la v1 ne les sépare pas) |
| **Filtre version du jeu** | Sélecteur dans le Header + Config — filtre Records / Sessions / Dashboard. Toggle "inclure obsolètes" pour comparer entre versions. Records des anciennes versions marqués d'un badge d'alerte. |
| **Records — structure** | Groupage **par CIRCUIT** (avec drapeau pays) en pliable. Colonnes complètes match v1 : Détails / Tracé / Type online-offline / Session / Classe / Voiture / Livrée / Best / S1+S2+S3 / Optimal / Vmax / Position arrivée / Progression / Date / Ver. LMU / Tier. Filtres combinés : classe + voiture + recherche texte + version. Toggle "Tout déployer/replier". |
| **Records & Dashboard — ligne cliquable** | Chaque record renvoie vers `/sessions/:sessionId` (la session où il a été établi) |
| **Temps optimal** | Affiché systématiquement (somme des meilleurs secteurs jamais réalisés) en couleur violet/purple |
| **SessionDetail — structure** | Match v1 : 2 info cards top (Session/Date/Circuit/Vainqueur/Best lap + MinutesMax/ToursTerminés/Fichier/VéhAutorisés/AutresParams), 8 onglets (Résultat Course, Tours Course, Meilleurs tours, Stratégie, Incidents, Pénalités, Chat, Comparaison pilotes) |
| **Classement enrichi** | Colonnes match v1 : Pos / Prog / Classe / Pilote / Voiture / Tours / Tours en tête / Temps total-Écart / Best lap / Vmax / Carb. départ / Carb. arrivée / Incidents / Pénalités / Statut |

---

## 3. Fonctionnalités à reprendre de la v1

À conserver intégralement :

- **Dashboard** : best laps par circuit/voiture, temps optimal théorique, vitesse max, stats globales
- **Analyse de course** : standings, gap-to-leader, lap-by-lap par pilote, fuel/pneus/relais, incidents, pénalités, chat, comparaison pilotes avec courbes
- **Records personnels** : progression par circuit/voiture avec graphes
- **Live** : page temps réel pour 4ᵉ écran (gros caractères, fullscreen)
- **Config** : nom pilote, dossier résultats, fuseau horaire, langue, filtre version jeu, maintenance (réindex, purge sessions vides)
- **Multi-classes** : Hypercar, LMP2 WEC, LMP2 ELMS, LMP3, GT3, GTE
- **Multi-langues** : FR / EN / ES / DE
- **Auto-update** via GitHub
- **System tray** (rester accessible en arrière-plan)

### Nouvelles fonctionnalités v2

1. **Page `car_config`** — liste / création / édition / duplication / export / suppression / comparaison des `.svm`
   - Chemin : `[Disque]\Steam\steamapps\common\Le Mans Ultimate\UserData\player\Settings\[Circuit]`
   - Le dossier d'installation LMU est déjà connu via la config existante
2. **Comparaison ohne_speed**
   - URL publique Google Sheets (cf. section Contexte)
   - Fetch via gviz JSON, cache 24h SQLite, bouton "Refresh maintenant"
   - Affichage : badge tier (Alien / Pro / Semi-Pro / Amateur / Offline) + delta `+0.345s vs Alien`
   - Activable/désactivable depuis la Config
3. **Header sur toutes les pages sauf Live**
   - Logo gauche, nav centrale, theme/lang/profil à droite
4. **Page Live améliorée** : fullscreen, mono XL, dashboard 3 zones (top: position/lap/flag/météo · center: chrono géant + secteurs · bottom: fuel/gaps/pneus)
5. **Distinction LMP2 WEC / LMP2 ELMS** dans tous les filtres, classements, records, setups

---

## 4. État actuel — POC visuel (Mai 2026)

### Où

- **Dossier local** : `C:\laragon\www\lmustatsviewer-v2-poc\` (sur le PC actuel)
- **Branche cible** : `v2-poc` sur `cparfait/lmustatsviewer` (pas encore push)

### Stack du POC (≠ stack finale)

Le POC est **uniquement visuel**. Pas de Tauri, pas de Rust, pas de SQLite. Juste du web pur pour valider le rendu.

- Vite 6 + React 19 + TypeScript
- Tailwind v4 + shadcn/ui (composants codés à la main, sans CLI)
- React Router v7
- Recharts pour les graphes
- Données mockées dans `src/lib/mockData.ts`

### Comment lancer le POC

```bash
cd C:\laragon\www\lmustatsviewer-v2-poc
npm install   # uniquement la première fois
npm run dev
```

Puis ouvrir http://localhost:5173

### Pages visibles dans le POC

| Route | Description | Statut |
|---|---|---|
| `/` | Dashboard — stats cards, best laps, progression + tiers, **3 graphes secondaires** (laps/classe, activité hebdo, distribution tiers) | ✅ |
| `/sessions` | Liste sessions cliquables avec filtres + colonne version | ✅ |
| `/sessions/:id` | **Race details** — standings, KPI, graphes laps multi-pilote + gap-to-leader, stratégie pneus visuelle, incidents, chat | ✅ |
| `/records` | Records groupés **Classe → Voiture → Circuit**, filtres (classe, voiture, version, recherche), toggle obsolètes | ✅ |
| `/setups` | Liste hiérarchique Voiture → Circuit → Setups | ✅ |
| `/setups/:id` | Détail setup, sections repliables, édition inline | ✅ |
| `/setups/compare` | Comparaison 2 setups côte à côte avec diff | ✅ |
| `/live` | Fullscreen 4ᵉ écran, mono XL, télémétrie animée mockée | ✅ |
| `/config` | Chemins jeu, **gestion versions**, profil, ohne_speed, maintenance | ✅ |

### Ce qui n'est PAS dans le POC (volontairement)

- Pas de Tauri (juste du web)
- Pas de SQLite (data mockée)
- Pas d'indexation XML
- Pas de plugin shared memory (la Live page anime des valeurs random pour la démo)
- Pas d'i18n branché (mais sélecteur de langue UI présent)
- Pas de fetch ohne_speed réel (data simulée)

---

## 5. Architecture cible (v2 finale)

```
lmustatsviewer/                  ← branche v2 du repo existant
├── legacy/                      ← ancien code PHP/Python archivé
│   ├── htdocs/
│   ├── launcher/
│   └── php/
├── src-tauri/                   ← Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/
│   │   │   ├── indexer.rs       ← parse XML résultats
│   │   │   ├── setups.rs        ← CRUD .svm
│   │   │   ├── live.rs          ← shared memory polling 20Hz
│   │   │   ├── ohne_speed.rs    ← fetch gviz JSON
│   │   │   └── profiles.rs
│   │   └── db.rs                ← migrations SQLite
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                         ← React front (proche du POC)
│   ├── routes/
│   ├── components/{ui,layout,charts,live,setups}
│   ├── stores/                  ← Zustand
│   ├── lib/{tauri,classes,ohne_speed}
│   ├── i18n/locales/{fr,en,es,de}.json
│   └── styles/theme.css
├── public/
├── package.json
├── HANDOFF.md                   ← ce fichier
└── .github/workflows/release.yml
```

### Schéma SQLite cible

```sql
profiles(id, name, player_name, settings_json, created_at)
sessions(id, profile_id, file_path, parsed_at, type, circuit, layout, car_class, ...)
laps(id, session_id, driver, num, lap_ms, s1_ms, s2_ms, s3_ms, ...)
results(id, session_id, driver, position, gap_ms, ...)
setups(id, profile_id, car, circuit, name, svm_path, content_json, updated_at)
ohne_speed_cache(track, layout, class, tier, lap_time, fetched_at)
config(key, value)
```

---

## 6. Plan d'implémentation (phases)

| # | Phase | Durée estimée | Livrable |
|---|---|---|---|
| **POC** | Rendu visuel | 1 jour | ✅ Validation visuelle |
| 0 | Setup | 1-2j | Tauri 2 init, archive `legacy/`, shadcn/ui, palette Le Mans dark, Header + Router (port depuis POC) |
| 1 | Foundations | 3-5j | SQLite + migrations, indexer XML en Rust (port du PHP), Config, profils. ~~Import `lmu_cache.db`~~ (from scratch). |
| 2 | Dashboard + Sessions | 4-6j | Dashboard, liste sessions, détail (standings/laps/incidents/chat/graphes), filtres avec LMP2 WEC≠ELMS |
| 3 | Records + ohne_speed | 3j | Records par circuit/voiture, fetch gviz, badges tier, deltas, courbes seuils |
| 4 | car_config | 4-5j | Liste hiérarchique, parser/writer `.svm` en Rust, édition inline, comparaison diff, création/dup/export |
| 5 | Live page | 3-4j | Plugin shared memory rFactor2, polling Rust 20Hz, dashboard fullscreen 3 zones |
| 6 | Polish | 2-3j | i18n complet 4 langues, auto-updater Tauri, CI GitHub Actions, build installeur |

**Total estimé** : 3-4 semaines à temps plein, ou 6-8 semaines en parallèle.

---

## 7. Points ouverts / à clarifier plus tard

- [x] ~~**Format `.svm`**~~ → **Confirmé** : INI-like avec sections `[ALL_CAPS]`, lignes `Key=Value//comment lisible`. Voir `samples/README.md` pour le détail complet. Parser/writer Rust en Phase 4.
- [x] ~~**Format XML résultats**~~ → **Confirmé** : rFactor XML 1.0. Sessions `<Practice1>`, `<Qualify>` (pas `Qualifying1`), `<Race>` (pas `Race1`). Lap avec attributs `s1/s2/s3/topspeed/fuel/ve/twfl/twfr/twrl/twrr/fcompound/rcompound`. Voir `samples/README.md`.
- [x] ~~**Champ pour distinguer LMP2 WEC / ELMS**~~ → **Identifié** : 3 sources fiables :
  1. **XML** : champ `<Category>` (ex. "WEC 2024, LMP2, Oreca 07" vs "ELMS 2024, LMP2, Oreca 07") + suffixe `<VehName>` (`:WEC`/`:WE2` vs `:EC`/`:EC2`)
  2. **SVM** : champ `VehicleClassSetting` qui contient explicitement `LMP2_WEC` ou `LMP2_ELMS`
  3. À confirmer avec un sample LMP2 (les 3 XML reçus sont GT3)
- [ ] **Shared memory plugin LMU** : confirmer le mécanisme exact en Phase 5 (rFactor2 plugin standard ? plugin spécifique LMU ?). Besoin du code de la page Live v1 — pas encore reçu.
- [x] ~~**Sample `lmu_cache.db`**~~ → **Plus nécessaire** : décision de partir from scratch, pas d'import de l'ancienne base.
- [ ] **Structure exacte du Sheet ohne_speed** : à parser en Phase 3 (gviz JSON), confirmer mapping circuit/voiture/classe/tier
- [ ] **i18n** : extraire les strings de la v1 PHP (dossier `htdocs/lang/`) pour réutiliser les traductions FR/EN/ES/DE
- [ ] **Certificat de signature Windows** : à voir plus tard si SmartScreen devient bloquant

---

## 8. Comment reprendre le travail

### Si tu reprends sur ce PC (`C:\laragon\www\lmustatsviewer-v2-poc\`)

```bash
cd C:\laragon\www\lmustatsviewer-v2-poc
npm install   # si node_modules absent
npm run dev   # ouvre http://localhost:5173
```

### Si tu reprends sur un autre PC

1. Clone : `git clone https://github.com/cparfait/lmustatsviewer.git`
2. Checkout : `git checkout v2-poc` (ou `v2` selon où on en est)
3. `npm install && npm run dev`

### Pour passer du POC au "vrai" projet v2

À faire **uniquement après validation visuelle du POC** :
1. Cloner `lmustatsviewer`, créer branche `v2` (si pas encore fait)
2. Déplacer `htdocs/`, `launcher/`, `php/` dans `legacy/`
3. Copier les fichiers du POC à la racine de `v2`
4. Init Tauri : `npm create tauri-app@latest .` (avec template React-TS), puis fusion avec le POC
5. Ajouter les plugins Tauri : `tauri-plugin-sql`, `tauri-plugin-updater`, `tauri-plugin-fs`, `tauri-plugin-process`
6. Démarrer la Phase 0 du plan ci-dessus

---

## 9. Fichiers clés du POC

| Fichier | Rôle |
|---|---|
| `src/App.tsx` | Routes + layout conditionnel (Header sauf sur `/live`) |
| `src/components/layout/Header.tsx` | Header sticky avec nav, theme toggle, lang, profil |
| `src/lib/mockData.ts` | Toutes les données mockées (à supprimer quand Tauri branché) |
| `src/lib/utils.ts` | `cn()` + helpers de formatage (lap time, delta, sectors) |
| `src/stores/theme.ts` | Toggle dark/light avec persistance localStorage |
| `src/index.css` | Tailwind v4 + tokens de la palette Le Mans dark/light |
| `src/routes/Live.tsx` | Page fullscreen 4ᵉ écran (sans header), animations mockées |
| `src/routes/Dashboard.tsx` | Stats cards + best laps + courbe progression Recharts |
| `src/routes/Setups.tsx` | Liste hiérarchique pliable |
| `src/routes/SetupDetail.tsx` | Détail avec sections repliables (Accordion) |
| `src/routes/SetupCompare.tsx` | Comparaison côte à côte avec diff highlightée |
| `src/routes/Config.tsx` | Chemins, profil, ohne_speed toggle, maintenance |

---

## 10. Conventions de code

- **Composants** : PascalCase, fichiers en PascalCase également
- **Hooks** : `useXxx` camelCase
- **Stores Zustand** : `useXxxStore` (camelCase) dans `src/stores/`
- **Types/Interfaces** : PascalCase, préférer `interface` pour les objets, `type` pour les unions
- **Imports** : utiliser l'alias `@/` (mappé à `src/`)
- **Tailwind** : classes utilitaires uniquement, pas de CSS custom sauf dans `src/index.css`
- **Strings UI** : pour le POC en français. En v2 réelle, **tout passera par `t("key")`** de i18next

---

## 11. Journal de bord

> **À mettre à jour à chaque session de travail.**
> Format : date · ce qui a été fait · décisions prises · points bloquants

### 2026-05-12 — Création du POC visuel
- ✅ Inventaire du projet existant (PHP + Python + SQLite + InnoSetup)
- ✅ Analyse des 2 projets de référence (lmu-setup-viewer, lmu-analyzer)
- ✅ Toutes les décisions structurantes prises (cf. section 2)
- ✅ POC créé dans `C:\laragon\www\lmustatsviewer-v2-poc\` avec 8 pages fonctionnelles
- ✅ Palette "Le Mans dark" validée (option A : fond bleu-noir + accent jaune Le Mans `#FFB400`)
- ✅ Mock data réaliste : 10 best laps, 5 sessions, 16 setups répartis sur 4 voitures + 7 circuits
- ✅ Page Live anime les valeurs en temps réel (drift sur secteurs/fuel/pneus, drapeaux random)
- ⏳ En attente : retour visuel utilisateur

### 2026-05-12 — Itération 6 (samples LMU reçus)
- ✅ Reçu 3 fichiers XML LMU réels (P1, Q1, R1 sur Monza GT3 GameVersion 0.9200)
- ✅ Reçu 2 fichiers `.svm` (Oreca 07 ELMS et Lamborghini Huracán GT3)
- ✅ Copiés dans `samples/` du POC pour servir de fixtures
- ✅ Analyse complète des formats documentée dans `samples/README.md` :
  - Structure XML (sessions, Stream events, Driver, Lap avec sectors)
  - Structure SVM (INI-like, sections, header `VehicleClassSetting`, parser/writer considerations)
  - 3 méthodes pour distinguer **LMP2 WEC / ELMS** identifiées et confirmées
  - Taxonomie complète des Stream events (Sent, ChatMessage, Penalty, Sector, Score, Incident, TrackLimits)
- ✅ Section 7 du HANDOFF mise à jour : 3 points ouverts résolus, 4 restants (shared memory, lmu_cache.db, ohne_speed gviz, i18n strings)
- ⚠️ Note : les samples contiennent des noms réels de pilotes — penser à anonymiser avant tout push public si besoin
- 📋 Prochaine étape : récupérer le code de la page Live v1 (mécanisme télémétrie) + un sample `lmu_cache.db`, OU démarrer la Phase 0 si l'utilisateur préfère

### 2026-05-12 — Itération 5 (bouton scroll-to-top)
- ✅ **Bouton "Remonter en haut"** ajouté en bas à droite (présent dans v1)
  - Apparaît avec fade-in après 300px de scroll
  - Cercle jaune Le Mans avec flèche haute, ombre, hover scale + shadow
  - Smooth scroll behavior
  - Caché sur la page `/live` comme Header et Footer

### 2026-05-12 — Itération 4 (Tours Course + Comparaison + Footer)
- ✅ **Refonte Tours Course** match v1 exact : une table par pilote empilées verticalement
  - Sub-toolbar : "Afficher la session" (Course/Qualif/Essais) + légende WCAG
  - Navigation "Aller au pilote" (dropdown qui scroll vers la section) + bouton "Mes tours" (scroll vers le joueur)
  - Header pilote en bandeau primaire avec position+nom+voiture
  - Colonnes : Tour / Pos / Temps / Secteur 1 / Secteur 2 / Secteur 3
  - PB sectoriel par pilote calculé dynamiquement → texte vert
  - Best session (lap ou secteur) → texte jaune Le Mans + icône 👤
  - Tour invalidé → fond rouge + N/A barré
  - Ligne joueur → fond jaune doux
- ✅ **Refonte Comparaison pilotes** match v1 exact : **jusqu'à 4 pilotes**
  - Sub-toolbar : "Afficher la session" + légende
  - 4 sélecteurs colorés (1=bleu, 2=vert, 3=orange, 4=violet) + bouton "Comparer"
  - Chart **"Évolution des positions"** (LineChart inversé Y, labels positions au-dessus des points, gros traits, Tour 1→N)
  - **Table de statistiques comparatives** : Position arrivée/départ, Best lap, Moy. 5 meilleurs tours, Médiane, Écart-type, Best S1/S2/S3, Vmax, Pit stops, Incidents, Pénalités — meilleure valeur en vert avec icône 👤
- ✅ **Footer Buy Me a Coffee** ajouté sur toutes les pages sauf `/live`
  - Bouton jaune `#FFDD00` avec icône café + lien GitHub + crédit "Fait avec ❤"
  - URL : `https://www.buymeacoffee.com/cparfait` (à adapter avec le vrai username)
- ✅ Données mockées étendues : positions par tour, secteurs réalistes (proportionnels au lap time), tours invalides paramétrables
- 📋 Prochaine étape : retour visuel + push v2-poc

### 2026-05-12 — Itération 3 (tweaks UX)
- ✅ Ajout d'une **icône œil** (cellule "Détails" colorée) en début de chaque ligne de `/sessions` pour signaler visuellement que la ligne est cliquable
- ✅ **Réorganisation Dashboard** : table "Meilleurs temps par circuit" passe en pleine largeur (toutes les colonnes lisibles : Circuit / Classe / Voiture+Livrée / Best lap / Optimal / Vmax / vs Alien / Tier / Version) ; le graphique de progression descend en dessous, aussi en pleine largeur (avec le seuil "Amateur" ajouté dans les ReferenceLines)
- 📋 Prochaine étape : retours utilisateur

### 2026-05-12 — Itération 2 d'après screenshots v1
- ✅ **Records refactorée pour matcher exactement le v1** : groupage par CIRCUIT (avec drapeau pays emoji) en pliable. Colonnes : Détails / Tracé / Type (online/offline) / Session (Course/Qualif/Essais) / Classe / Voiture / Livrée / Meilleur tour / S1+S2+S3 / Optimal / Vmax / Pos. arrivée / Progression / Date / Ver. LMU / Tier
- ✅ **Lignes cliquables** dans Records et Dashboard → ouvrent la session d'origine (`/sessions/:sessionId`)
- ✅ **Dashboard best lap table** enrichi avec drapeaux, Optimal, Vmax, livery et clic vers détail
- ✅ **SessionDetail entièrement restructurée** pour matcher v1 :
  - 2 info cards en haut (Session/Date/Circuit/Vainqueur/Best lap + MinutesMax/Tours/Fichier/Véhicules/Params)
  - 8 onglets : **Résultat Course** (classement enrichi avec Tours en tête, Carb. départ/arrivée, Statut), **Tours Course** (table tour-par-tour de chaque pilote avec validation/PB/best lap colorés), **Meilleurs tours** (best lap par pilote avec optimal), **Stratégie** (relais pneus + carburant + 2 charts), **Incidents**, **Pénalités** (nouvelle table dédiée), **Chat**, **Comparaison pilotes** (sélecteur 2 pilotes + chart overlap + stats côte à côte)
  - Légende WCAG : votre ligne (jaune) / PB (vert) / ⚡ best session (purple) / tour invalidé (rouge)
- ✅ **Versions LMU** mises au format réaliste : 0.9200 / 1.0110 / 1.5000 (au lieu de 1.4.0/1.5.2/1.6.1)
- ✅ Versionnage typescript clean (npx tsc -b OK)
- 📋 Prochaine étape : validation visuelle des changements, puis push sur `v2-poc`

### 2026-05-12 — Itération 1 d'après retours
- ✅ **Création de la page Race Details** (`/sessions/:id`) — équivalent v1 `race_details.php` : KPI, classement final avec gain/perte positions, 2 onglets de graphes (laps multi-pilote + gap-to-leader), stratégie pneus visualisée en barres de relais, journal des incidents, chat de course
- ✅ **Refactor complet de Records** : hiérarchie **Classe → Voiture → Circuit** au lieu de cards par classe. Filtres combinables : classe + voiture + recherche + version. Toggle "inclure versions obsolètes"
- ✅ **Sélecteur de version du jeu** : ajouté dans le Header (chip compact avec dropdown) + section dédiée dans Config (3 versions mockées : 1.4.0, 1.5.2 installée, 1.6.1 latest)
- ✅ **Sessions cliquables** vers race details, avec colonne version et opacité réduite sur les sessions de versions obsolètes
- ✅ **Plus de graphes Dashboard** : laps par classe (bar horizontal), activité hebdo 12 semaines (bar), distribution des tiers (radial)
- ✅ Toutes les routes filtrent par version active, avec badge "Wrench" sur les records d'anciennes versions
- ✅ Store version persistant dans localStorage (`lmu-active-version`, `lmu-show-outdated`)
- ✅ TypeScript build clean (npm run build OK)
- 📋 Prochaine étape : nouveau retour visuel utilisateur, puis push sur branche `v2-poc`

---

## 12. Ressources externes

- **Tauri 2 docs** : https://v2.tauri.app/
- **Tailwind v4 docs** : https://tailwindcss.com/docs
- **shadcn/ui** : https://ui.shadcn.com/
- **Recharts** : https://recharts.org/
- **React Router v7** : https://reactrouter.com/
- **Zustand** : https://github.com/pmndrs/zustand
- **rFactor2 shared memory plugin** : https://github.com/TheIronWolfModding/rF2SharedMemoryMapPlugin
