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
