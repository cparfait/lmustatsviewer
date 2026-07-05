# Guide de maintenance — LMU Stats Viewer

> Procédures pour les modifications courantes de l'application.

---

## 1. Changer la version de l'application

**Un seul fichier à modifier : `version.json` à la racine du projet.**

```json
{
  "version": "1.2.0"
}
```

La version est automatiquement synchronisée dans les 3 autres fichiers au prochain build :

| Fichier | Mécanisme |
|---|---|
| `version.json` | **Source unique** — c'est le seul fichier à éditer |
| `src-tauri/Cargo.toml` | Sync par `build.rs` au `cargo check/build` |
| `src-tauri/tauri.conf.json` | Sync par `build.rs` au `cargo check/build` |
| `package.json` | Sync par `build.rs` au `cargo check/build` |
| `src/lib/changelog.ts` | Lit `__APP_VERSION__` injecté par Vite (`vite.config.ts`) |

Le backend Rust expose la version via `get_app_version()` → `env!("APP_VERSION")`
qui est injectée par le build script. Elle s'affiche dans la page Config.

### Pour le changelog

La première entrée du changelog utilise automatiquement la version de `version.json`
via `APP_VERSION`. Pour une nouvelle release, ajouter une nouvelle entrée dans
`src/lib/changelog.ts` avec `version: APP_VERSION` et `dev: false`.

---

## 2. Ajouter une voiture

> Exemple : ajout d'une nouvelle Hypercar « Bugatti Bolide ».
> **Tout se passe dans `public/data/cars.json`** — pas besoin de modifier le code TypeScript.

### 2.1 Catalogue de voitures — `public/data/cars.json`

Ajouter une entrée dans le tableau `"cars"` :

```json
{
  "modelName": "Bugatti Bolide",
  "category": "hyper",
  "keywords": ["bugatti bolide", "bugatti"]
}
```

- **`modelName`** : nom affiché dans l'interface. Doit correspondre au nom du véhicule dans le jeu.
- **`category`** : `"hyper"` | `"lmp2"` | `"lmp3"` | `"gt3"` | `"gte"`.
- **`keywords`** : mots-clés (lowercase) pour matcher le `vehicleName` des fichiers XML.

### 2.2 Logo de la marque — `public/data/cars.json` (section `"brands"`)

1. Placer l'image PNG dans `public/logos/bugatti.png` (minuscules, pas d'espaces).
2. Ajouter le mapping dans la section `"brands"` du même fichier JSON :

```json
"brands": {
  "bugatti": "bugatti.png"
}
```

Le logo sera automatiquement affiché dans les tableaux (Dashboard, Sessions, etc.)
et dans le Garage, grâce au matching par mot-clé.

### 2.3 (Optionnel) Nouvelle classe

Si la voiture introduit une **nouvelle classe** (très rare), il faut aussi modifier :
- `src/lib/staticData.ts` : type `CarClass` + `CAR_CLASS_LABELS` + `CAR_CLASS_COLORS`
- `src-tauri/src/models.rs` : fonction `class_order()` et `normalize_car_class()`

Si la voiture utilise une classe existante (hyper, gt3...), **rien à faire**.

### 2.4 (Optionnel) Backend Rust — `src-tauri/src/models.rs`

Si la voiture nécessite un traitement spécial pour `compute_unique_car_name()`
(comme la Peugeot 9X8 qui distingue les millésimes), ajouter la logique dans cette
fonction. Sinon, rien à faire.

### Checklist voiture

| Étape | Fichier | Action |
|---|---|---|
| Catalogue | `public/data/cars.json` → `"cars"` | Ajouter `{ modelName, category, keywords }` |
| Logo image | `public/logos/bugatti.png` | Placer le fichier image |
| Mapping logo | `public/data/cars.json` → `"brands"` | Ajouter `"bugatti": "bugatti.png"` |
| Nouvelle classe ? | `staticData.ts` + `models.rs` | Seulement si classe inédite |

---

## 3. Ajouter un circuit

> Exemple : ajout de « Silverstone ».
> **Tout se passe dans `public/data/circuits.json`** — pas besoin de modifier le code TypeScript.

### 3.1 Catalogue de circuits — `public/data/circuits.json`

Ajouter le nom dans le tableau `"circuits"` :

```json
"circuits": [
  "Sebring",
  "...",
  "Silverstone"
]
```

Le nom doit correspondre **exactement** à celui qui apparaît dans les fichiers XML
de résultats du jeu (champ `<TrackEvent>` ou attribut `track`).

### 3.2 Drapeau du pays — `public/data/circuits.json` (section `"flags"`)

1. Placer l'image du drapeau dans `public/flags/gb.png` (code ISO 3166-1 alpha-2
   en minuscules). Le fichier existe peut-être déjà.
2. Ajouter le mot-clé de détection dans la section `"flags"` du même fichier JSON :

```json
"flags": {
  "silverstone": "gb"
}
```

Le système fonctionne par mot-clé : le nom du circuit (en minuscules) est comparé
aux mots-clés. Si « silverstone » est trouvé, le drapeau `gb.png` est utilisé.
Pour un circuit multi-layouts (ex. « Silverstone GP », « Silverstone National »),
un seul mot-clé suffit.

### 3.3 (Optionnel) ohne_speed — `src/lib/ohne_speed.ts`

Si le circuit est supporté par le tableau communautaire ohne_speed, les données
sont récupérées automatiquement via le CSV Google Sheets. Sinon, le système
dégrade silencieusement (pas de tier affiché). Rien à faire dans le code.

### Checklist circuit

| Étape | Fichier | Action |
|---|---|---|
| Catalogue | `public/data/circuits.json` → `"circuits"` | Ajouter le nom exact |
| Drapeau image | `public/flags/gb.png` | Placer le fichier (si pas déjà là) |
| Mot-clé drapeau | `public/data/circuits.json` → `"flags"` | Ajouter `"silverstone": "gb"` |

---

## 4. Déploiement / Release

### 4.1 Vue d'ensemble

La distribution se fait par **installeur Windows `.exe` (NSIS)** + **auto-update** signé
(clé Ed25519). Une release **n'atteint les utilisateurs que sur un tag `vX.Y.Z`** poussé
sur GitHub — les commits ordinaires ne déclenchent rien.

```
Bump version.json → commit → tag vX.Y.Z → push tag
        └─► CI (.github/workflows/release.yml) sur windows-latest :
              1. npm ci
              2. fetch-piper.ps1  (voix neuronale)
              3. fetch-vosk.ps1   (modèles de reconnaissance)
              4. tauri build   (STT inclus d'office ; voix/modèles NON bundlés)
              5. signe + crée une GitHub Release (draft)
```

### 4.2 Procédure de release

1. **Bumper la version** : éditer `version.json` (cf. §1) — synchro auto des autres fichiers.
2. **Changelog** : ajouter une entrée dans `src/lib/changelog.ts` (`version: APP_VERSION`, `dev: false`).
3. **Commit** les deux fichiers.
4. **Taguer puis pousser** :
   ```bash
   git tag v1.2.0
   git push origin v1.2.0
   ```
5. La CI construit l'installeur complet et crée une **Release en brouillon** : la relire,
   puis la **publier** depuis l'onglet Releases de GitHub.

> **Secret requis** (Settings → Secrets → Actions) : `TAURI_SIGNING_PRIVATE_KEY`
> = contenu de `_lmu_updater.key` (clé générée sans mot de passe). Indispensable pour
> que l'auto-update fonctionne — ne jamais committer la clé privée.

### 4.3 Assets vocaux (lourds, hors git)

La voix neuronale (Piper) et les commandes vocales (Vosk) reposent sur des binaires/modèles
**gitignorés** (`resources/tts/`, `resources/stt/`). Ils sont récupérés par script :

| Script | Contenu | Cible |
|---|---|---|
| `scripts/fetch-piper.ps1` | binaire Piper + voix `.onnx` | `src-tauri/resources/tts/` |
| `scripts/fetch-vosk.ps1` | `libvosk` (dll/lib/dll MinGW) + modèles small | `src-tauri/resources/stt/` |

En CI ils sont **mis en cache** (clé = hash des deux scripts) ; les scripts sautent les
fichiers déjà présents, donc un cache hit est quasi instantané. Pour ajouter une voix ou
une langue, éditer la liste en tête du script concerné (1 ligne) puis relancer.

### 4.4 STT (commandes vocales) — inclus d'office

`vosk` est une **dépendance Cargo standard** : le STT fait partie de tout build
(`npm run tauri:build` / `tauri:dev`). Les assets natifs (`scripts/fetch-vosk.ps1`)
sont donc **requis pour compiler**. En revanche, les **modèles par langue ne sont
plus bundlés** : l'app les télécharge à la demande (Config → Audio / Voix, cf.
`src-tauri/src/commands/assets.rs`), comme les voix Piper.

- Le bundle (`tauri.conf.json`) embarque les DLL natives (`libvosk.dll` + dépendances
  MinGW `libgcc`/`libstdc++`/`libwinpthread`) **à côté de l'exe** (chargement implicite
  au démarrage), plus le moteur Piper (`tts/piper`). Ni voix `.onnx`, ni modèles Vosk.
- **Linking Windows** : le crate lie `libvosk.lib` ; `build.rs` ajoute `resources/stt/lib`
  au chemin du linker et copie les DLL à côté du binaire de dev. Si l'archive Vosk ne fournit
  pas `libvosk.lib`, la générer (cf. en-tête de `fetch-vosk.ps1`).
- Les modèles téléchargés atterrissent dans `%APPDATA%/com.cparfait.lmustatsviewer/stt/models/<code>`
  (voix : `…/tts/voices`).

### 4.5 Build local manuel (sans CI)

```powershell
# 1. (une fois) récupérer les assets vocaux (requis pour compiler : libvosk + moteur Piper)
./scripts/fetch-piper.ps1
./scripts/fetch-vosk.ps1
# 2. installeur
npm run tauri:build
# → src-tauri/target/release/bundle/nsis/*.exe
```
La signature de l'auto-update nécessite la variable d'env `TAURI_SIGNING_PRIVATE_KEY`
(et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""`) — sinon l'installeur est produit mais non signé.
