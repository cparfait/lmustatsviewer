# RELEASE — Sortir une version & ajouter des données

> Documentation opérationnelle de **LMU Stats Viewer V3**.
> Deux parties : **(A) sortir une version** (build `.exe` + release GitHub + auto-update),
> **(B) ajouter des données/assets** (voiture, circuit, image, volant, logo, drapeau…).
> Tous les chemins sont relatifs à la racine du projet.

## Sommaire

- [A. Sortir une version](#a--sortir-une-version)
  - [A.0 Prérequis (à faire une seule fois)](#a0-prérequis-à-faire-une-seule-fois)
  - [A.1 Le numéro de version](#a1-le-numéro-de-version)
  - [A.2 Procédure de release (recommandée : GitHub Actions)](#a2-procédure-de-release-recommandée--github-actions)
  - [A.3 Ce que fait la CI](#a3-ce-que-fait-la-ci-githubworkflowsreleaseyml)
  - [A.4 Build local (optionnel / dépannage)](#a4-build-local-optionnel--dépannage)
  - [A.5 Auto-update : comment ça marche](#a5-auto-update--comment-ça-marche)
  - [A.6 Checklist de release](#a6-checklist-de-release)
- [B. Ajouter des données & assets](#b--ajouter-des-données--assets)
  - [B.1 Ajouter une voiture](#b1-ajouter-une-voiture)
  - [B.2 Ajouter un circuit](#b2-ajouter-un-circuit)
  - [B.3 Ajouter un logo de marque](#b3-ajouter-un-logo-de-marque)
  - [B.4 Ajouter une image de voiture](#b4-ajouter-une-image-de-voiture-rendu)
  - [B.5 Ajouter une image de volant](#b5-ajouter-une-image-de-volant)
  - [B.6 Ajouter un drapeau de circuit](#b6-ajouter-un-drapeau-de-circuit)
  - [B.7 Version de jeu (rien à faire)](#b7-version-de-jeu-rien-à-faire)
  - [B.8 Tableau récapitulatif « quel fichier pour quoi »](#b8-tableau-récapitulatif--quel-fichier-pour-quoi-)

---

# A — Sortir une version

## A.0 Prérequis (à faire une seule fois)

Ces éléments sont déjà en place sur le projet ; à vérifier seulement en cas de nouveau
poste ou de nouveau dépôt.

### Secrets GitHub (Settings → Secrets and variables → Actions)

| Secret | Valeur |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | **Contenu intégral** du fichier `_lmu_updater.key` (clé privée de signature de l'updater). |
| `GITHUB_TOKEN` | Fourni automatiquement par GitHub Actions (rien à créer). |

> Le mot de passe de la clé est **vide** — il est écrit en dur dans le workflow
> (`TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ""`), aucun secret à ajouter pour ça.

### Clés de signature (à conserver précieusement, hors dépôt)

- `_lmu_updater.key` — clé **privée** (⚠️ **jamais** commitée ; gitignorée).
- `_lmu_updater.key.pub` — clé **publique** ; sa valeur base64 est recopiée dans
  `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.

> **Perdre `_lmu_updater.key` = ne plus pouvoir signer de mises à jour** que les clients
> existants accepteront. Sauvegarde-la (gestionnaire de mots de passe / coffre).

### Outils

- **Node.js 22** + **Rust stable** + **VS Build Tools** (uniquement pour un build **local**).
- Un build via GitHub Actions ne demande **rien** en local (tout tourne sur le runner Windows).

---

## A.1 Le numéro de version

**Une seule source de vérité : `version.json` à la racine.**

`version.json` porte **deux** numéros, et les deux doivent être bumpés :

```json
{
  "version": "1.0.1",
  "latest_version": "1.0.1"
}
```

- `version` → build Tauri V3 (lu par `build.rs`).
- `latest_version` → vérificateur de mise à jour de l'ancienne V1 PHP, qui lit ce
  fichier sur `raw.githubusercontent.com/.../main/version.json`. L'oublier fait
  silencieusement afficher « Application à jour » aux installations V1.

Le script `src-tauri/build.rs` s'exécute avant chaque compilation et, à partir de
`version.json` :

1. injecte la variable d'environnement `APP_VERSION` (lue par `get_app_version()` côté Rust) ;
2. **synchronise** `package.json`, `src-tauri/Cargo.toml` et `src-tauri/tauri.conf.json`.

> ⚠️ **Un bump ne prend effet qu'au build SUIVANT — et les fichiers dérivés doivent être commités.**
> Cargo lit `Cargo.toml` **avant** d'exécuter `build.rs` : le build qui suit un bump propage
> la nouvelle version dans les trois fichiers, mais compile encore l'**ancienne**.
> Sur un checkout propre — c'est-à-dire en CI — un `Cargo.toml` resté à l'ancienne version
> produit donc un installeur à l'ancien numéro sous un tag neuf, **sans aucune erreur**.
>
> Procédure sûre après avoir édité `version.json` :
> ```bash
> cd src-tauri && cargo check   # propage + met Cargo.lock à jour
> ```
> puis commiter `version.json`, `package.json`, `src-tauri/tauri.conf.json`,
> `src-tauri/Cargo.toml` **et** `src-tauri/Cargo.lock` avant de taguer.
> `release.ps1` fait déjà tout ça (l. 127-155) — c'est la voie recommandée.

Format recommandé : **SemVer** (`MAJEUR.MINEUR.CORRECTIF`).

---

## A.2 Procédure de release (recommandée : GitHub Actions)

La release est **entièrement automatisée** par un push de tag `v*`.

```bash
# 1. Bumper la version
#    → éditer version.json : "1.0.0" → "1.1.0"

# 2. Commiter
git add version.json
git commit -m "chore: release v1.1.0"

# 3. Créer le tag (le "v" est obligatoire : le workflow écoute "v*")
git tag v1.1.0

# 4. Pousser le commit ET le tag
git push origin main
git push origin v1.1.0
```

Le push du tag **déclenche** le workflow. À la fin, une **release GitHub en brouillon**
est créée avec l'installeur signé + `latest.json`.

> ⏱️ **Compter ~25 min, pas 10.** Mesuré sur la v1.0.2 : **24 min**, dont l'essentiel
> dans l'étape « Build, sign & release ». Un bump de version modifie `Cargo.toml`, ce qui
> invalide une partie du cache Cargo ; or `duckdb` est en feature **`bundled`** et
> recompile alors tout son C++ sur le runner. Une release enchaîne donc quasi
> systématiquement le cas « cache froid » — c'est normal, pas un blocage. Ne pas
> s'inquiéter tant que les étapes en amont (checkout, `npm ci`, fetch Piper/Vosk) sont
> vertes et que « Build, sign & release » est toujours `in_progress`.

**Publier :** GitHub → *Releases* → ouvrir le brouillon `v1.1.0` → rédiger les notes de
version → **Publish release**.

> Tant que la release est en **brouillon**, aucun client ne la voit. La publication est
> l'acte final qui rend la mise à jour disponible.

**Alternative :** l'onglet *Actions* → workflow *Release* → **Run workflow** (`workflow_dispatch`)
permet un déclenchement manuel sans tag.

---

## A.3 Ce que fait la CI (`.github/workflows/release.yml`)

- **Déclencheur** : `push` d'un tag `v*`, ou `workflow_dispatch` (manuel).
- **Runner** : `windows-latest`, Node 22, Rust stable.
- **Cache** : registre Cargo + `target/`, et les **assets voix** (Piper/Vosk) — un cache
  hit rend les fetch quasi instantanés.
- **Étapes** :
  1. `npm ci`
  2. `./scripts/fetch-piper.ps1` — télécharge le moteur TTS **Piper** + voix FR/EN/ES/DE dans `src-tauri/resources/tts/`.
  3. `./scripts/fetch-vosk.ps1` — télécharge la lib **Vosk** + modèles STT FR/EN/ES/DE dans `src-tauri/resources/stt/`.
  4. Action Tauri officielle avec :
     ```
     tagName: <tag>          releaseName: "LMU Stats Viewer <tag>"
     releaseDraft: true      prerelease: false
     ```
     → compile (STT inclus d'office), **signe** l'installeur, génère `latest.json`,
     crée la **release brouillon** et y **uploade** les assets.
- **Secrets utilisés** : `TAURI_SIGNING_PRIVATE_KEY`, `GITHUB_TOKEN`.

> Le STT (commandes vocales) fait partie de **tout** build ; en revanche les voix
> Piper et les modèles Vosk **ne sont plus bundlés** — l'app les télécharge à la
> demande (Config → Audio / Voix). L'installeur reste donc léger.

---

## A.4 Build local (optionnel / dépannage)

Utile pour tester un installeur sans passer par la CI.

### Une seule variante

`npm run tauri:build` — STT inclus d'office (identique à la release officielle).
Nécessite les assets Piper **et** Vosk en local (libvosk est liée à la compilation ;
le moteur Piper est bundlé). Les voix/modèles ne sont pas bundlés : l'app les
télécharge à la demande.

### Avant un build, récupérer les assets (une fois)

```powershell
powershell -ExecutionPolicy Bypass -File scripts/fetch-piper.ps1
powershell -ExecutionPolicy Bypass -File scripts/fetch-vosk.ps1
```

Ces scripts sont **idempotents** (ils sautent ce qui est déjà présent) et écrivent dans
`src-tauri/resources/tts/` et `src-tauri/resources/stt/` (dossiers **gitignorés**).

### Où atterrit l'installeur

```
src-tauri/target/release/bundle/nsis/LMU Stats Viewer_<version>_x64-setup.exe
```

Cet installeur NSIS embarque, via `src-tauri/nsis/hooks.nsi`, une **proposition
d'installation du plugin Live Timing** (`rFactor2SharedMemoryMapPlugin64.dll`) dans le
dossier `Plugins` de LMU (détecté par le registre Steam).

> ⚠️ Un build **local** signera l'installeur **seulement** si `TAURI_SIGNING_PRIVATE_KEY`
> et son mot de passe sont exportés dans l'environnement. Sinon l'`.exe` se construit mais
> sans `latest.json` signé — suffisant pour un test d'install, pas pour l'auto-update.

---

## A.5 Auto-update : comment ça marche

- **Endpoint** (dans `tauri.conf.json`) :
  `https://github.com/cparfait/lmustatsviewer/releases/latest/download/latest.json`
- Au démarrage (si l'option *mises à jour auto* est active) et à la demande (tray / Config),
  le front (`src/lib/updater.ts` + `src/components/UpdateBanner.tsx`) télécharge `latest.json`,
  **vérifie la signature** avec la clé publique embarquée, et propose « Télécharger et installer ».
- `latest.json` et la signature sont générés **automatiquement** par le build
  (`bundle.createUpdaterArtifacts: true`) et uploadés sur la release.

**Conséquence pratique :** il suffit de **publier** la release brouillon pour que les
utilisateurs voient la mise à jour au prochain lancement. Rien à héberger à la main.

---

## A.6 Checklist de release

- [ ] Code prêt : `npm test` ✅, `npm run build` ✅, `cargo check` ✅ (dans `src-tauri`).
- [ ] `version.json` bumpé (SemVer).
- [ ] Commit + `git tag vX.Y.Z` + `git push` du commit **et** du tag.
- [ ] Workflow *Release* vert (Actions).
- [ ] Release **brouillon** vérifiée : présence de l'`.exe` **et** de `latest.json`.
- [ ] Notes de version rédigées → **Publish release**.
- [ ] (Facultatif) Tester l'auto-update depuis une version précédente installée.

---

# B — Ajouter des données & assets

> La plupart des données « catalogue » vivent dans **`public/data/`** (JSON) et les images
> dans **`public/`** (servies telles quelles). Le **matching est tolérant** : il normalise
> les noms (minuscules, sans accents) et cherche des **mots-clés en sous-chaîne**. Il faut
> donc surtout fournir des **keywords** qui apparaissent dans le nom LMU réel.

## B.1 Ajouter une voiture

**Fichier catalogue : `public/data/cars.json`.**

```jsonc
{
  "cars": [
    { "modelName": "Alpine A424", "category": "hyper", "keywords": ["alpine a424"] }
    // …ajouter la nouvelle voiture ici
  ],
  "classes": { "hyper": {…}, "lmp2": {…}, "lmp3": {…}, "gte": {…}, "gt3": {…}, "_default": {…} },
  "brands":  { "alpine": "alpine.png", "acura": "acura.png", … }
}
```

**Champs d'une voiture :**

| Champ | Rôle |
|---|---|
| `modelName` | Nom affiché (doit correspondre au nom LMU). |
| `category` | Classe de jeu : `hyper` \| `lmp2` \| `lmp3` \| `gt3` \| `gte`. |
| `keywords` | Mots-clés **en minuscules** cherchés dans le `vehicleName` des XML (matching image/logo/volant). |

**Étapes :**

1. Ajouter l'entrée dans `cars[]` (avec les bons `keywords`).
2. **Logo de marque** : si la marque est nouvelle → [B.3](#b3-ajouter-un-logo-de-marque).
3. **Image de la voiture** (facultatif mais recommandé) → [B.4](#b4-ajouter-une-image-de-voiture-rendu).
   Sans image réelle, un **placeholder SVG** teinté par classe est utilisé.
4. **Volant** (facultatif, page Télémétrie) → [B.5](#b5-ajouter-une-image-de-volant).

> **Cas particulier — Peugeot 9X8 :** seule voiture à `unique_car_name` dynamique. Le
> backend (`src-tauri/src/models.rs`) lit l'année `WEC YYYY` de la session et affiche
> `Peugeot 9x8 (2024/25)` pour 2024/2025, sinon `(YYYY)`. Aucune autre voiture n'a ce
> traitement — rien à faire pour les autres.

## B.2 Ajouter un circuit

**Fichier catalogue : `public/data/circuits.json`.**

```jsonc
{
  "circuits": ["Sebring", "Spa-Francorchamps", "Le Mans", … ],
  "aliases":  { "Autodromo Nazionale Monza": "monza", "Autodromo Nazionale di Monza": "monza" },
  "flags":    { "sarthe": "fr", "mans": "fr", "monza": "it", … }
}
```

**Étapes :**

1. Ajouter le **nom exact** (tel qu'il apparaît dans les XML LMU) dans `circuits[]`.
2. **Drapeau** : ajouter `"<mot-clé>": "<code ISO 2 lettres>"` dans `flags{}`
   (ex. `"nurburgring": "de"`), puis fournir `public/flags/<code>.png` si le code est nouveau
   → [B.6](#b6-ajouter-un-drapeau-de-circuit).
3. **Alias** (facultatif) : si le circuit apparaît sous plusieurs noms XML, mapper chaque
   nom vers un slug commun dans `aliases{}`.
4. **Profil d'élévation** (facultatif, vue 3D télémétrie) : ajouter le circuit dans
   `src/lib/trackElevation.json` sous forme de points `[distance_m, altitude_m]` par layout.
   Sans profil, la vue 3D reste plate (aucune erreur).

> **ohne_speed & guide de freinage :** rien à faire manuellement. Les **tiers de performance**
> (`src/lib/ohne_speed.ts`, CSV communautaire) et le **guide ApexPoints**
> (`src/lib/ai/knowledge/braking-guide-data.ts`) s'appliquent automatiquement **si** le
> circuit y est couvert ; sinon la fonctionnalité se désactive proprement pour ce circuit.

## B.3 Ajouter un logo de marque

- **Image** : `public/logos/<mot-clé>.png` (PNG, fond transparent, logo seul).
- **Mapping** : `public/data/cars.json` → section `brands` : `"<mot-clé>": "<fichier>.png"`.
- Le matching (`CarLogo.tsx`) normalise le nom de la voiture et cherche le `<mot-clé>` en
  sous-chaîne. Ajoute au besoin des `keywords` à la voiture (dans `cars[]`) pour fiabiliser
  la reconnaissance (ex. `"mustang"` → logo Ford).

## B.4 Ajouter une image de voiture (rendu)

- **Dossier** : `public/cars/`.
- **Nom de fichier = slug** : nom normalisé, minuscules, espaces → tirets
  (ex. `Peugeot 9X8 EVO` → `peugeot-9x8-evo`).
- **Ordre de recherche** (composant `CarImage.tsx`) : `<slug>.webp` → `<slug>.png` → `<slug>.svg`.
- **Format conseillé** : **`.webp`** (ou `.png`), **fond transparent**, vue latérale, ~600–800 px de large.

**Deux façons de produire l'image :**

1. **Manuel** : détourer/exporter en `.webp` transparent et déposer `public/cars/<slug>.webp`.
2. **Batch (optionnel, Python)** : `scripts/process_cars.py` (détourage IA `rembg` + rognage +
   redimensionnement, depuis `_incoming_cars/`) ; `scripts/process_cars_mapped.py` (variante
   avec table de renommage). Dépendances lourdes (`PIL`, `rembg`) — usage local.

**Placeholders SVG** : `node scripts/gen-car-placeholders.mjs` génère une silhouette teintée
par classe pour les voitures sans image réelle. Il **n'écrase jamais** un `.webp`/`.png`
existant.

## B.5 Ajouter une image de volant

- **Dossier** : `public/steering_wheels/` (**WebP** optimisé, ~256×256).
- **Mapping voiture → volant** : `src/lib/steeringWheels.ts` → tableau `STEERING_WHEEL_MAP`
  (`{ keywords: [...], wheel: "<slug>" }`).
- **Composant** : `src/components/telemetry/SteeringWheel.tsx` (repli SVG générique animé si
  aucune image).

**Étapes :**

1. Produire `public/steering_wheels/<slug>.webp` — soit via
   `python scripts/optimize-steering-wheels.py [dossier_png_source]` (PNG → WebP 256×256 q82),
   soit à la main (ex. `magick input.png -resize 256x256 -quality 82 output.webp`).
2. Ajouter l'entrée de mapping dans `STEERING_WHEEL_MAP` avec des `keywords` qui matchent le
   nom de la voiture.

## B.6 Ajouter un drapeau de circuit

- **Image** : `public/flags/<code>.png` où `<code>` est le **code pays ISO 3166-1 alpha-2**
  (`fr`, `it`, `de`, `jp`, `us`, `be`…).
- **Mapping** : `public/data/circuits.json` → section `flags` : `"<mot-clé circuit>": "<code>"`.
- Réutilise un drapeau existant si le pays est déjà présent (pas besoin de recréer `fr.png`).

## B.7 Version de jeu (rien à faire)

Les versions de jeu (`game_version`) sont **auto-détectées** depuis les XML LMU et normalisées
par `format_game_version()` (`src-tauri/src/models.rs`) : split sur `.`, majeur + mineur
paddé sur 4 chiffres (ex. `0.92` → `0.9200`). Elles apparaissent **automatiquement** dans le
filtre de version (Config). **Aucune liste manuelle à maintenir** lors d'une nouvelle version
de LMU : réindexe simplement tes résultats et la version sort d'elle-même.

## B.8 Tableau récapitulatif « quel fichier pour quoi »

| Ajout | Fichier(s) à éditer / créer | Format |
|---|---|---|
| **Voiture** (catalogue) | `public/data/cars.json` → `cars[]` | JSON `{modelName, category, keywords[]}` |
| **Logo de marque** | `public/logos/<clé>.png` + `cars.json` → `brands{}` | PNG transparent |
| **Image de voiture** | `public/cars/<slug>.webp` (ou `.png`) | WebP/PNG transparent, vue latérale |
| **Volant** | `public/steering_wheels/<slug>.webp` + `src/lib/steeringWheels.ts` | WebP 256×256 |
| **Circuit** (catalogue) | `public/data/circuits.json` → `circuits[]` (+ `aliases{}`) | JSON |
| **Drapeau** | `public/flags/<code>.png` + `circuits.json` → `flags{}` | PNG, code ISO 2 lettres |
| **Élévation** (opt.) | `src/lib/trackElevation.json` | JSON `[dist_m, alt_m][]` par layout |
| **Version de jeu** | — | Auto-détectée (rien à faire) |

> Après un ajout de **données JSON / images**, un simple rechargement de l'app suffit
> (`npm run tauri:dev`). Un ajout touchant du **code TypeScript** (`steeringWheels.ts`,
> `trackElevation.json` importé) est pris au rebuild du front. Pense à `npm run build` pour
> valider avant de commiter.
