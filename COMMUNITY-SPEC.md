# Base communautaire des meilleurs tours — Spécification v1

> Statut : **brouillon à valider, aucun code**. Rédigé le 2026-09-25 après la décision du
> mainteneur de l'héberger sur son VPS. Faits vérifiés sur la base locale réelle
> (`lmu_cache.db`) et sur le code actuel.

Objectif : les utilisateurs qui le souhaitent envoient leurs meilleurs tours ; en retour,
l'app et un **site public** montrent où chacun se situe, circuit par circuit, classe par
classe, voiture par voiture — à partir de données produites **par le jeu**, donc justes par
construction.

---

## 0. Pourquoi

- Les références actuelles sont tierces et tenues à la main : le 2026-09-25, 7 fiches de
  freinage sur 12 ont dû être retirées car elles décrivaient des tracés faux, et la feuille de
  temps de référence n'a qu'une ligne par circuit × classe (ni voiture, ni version de jeu).
- Des tours enregistrés par le jeu ne peuvent pas avoir un tracé erroné, couvrent un nouveau
  circuit dès qu'on y roule, et se déclinent par voiture et par version (BoP).
- Deux livrables : (a) le **service** de collecte et d'agrégats ; (b) le **site public**, vitrine
  du projet. Exigence du mainteneur : il doit être « super beau, sinon on n'est pas crédible ».

## 1. Principes non négociables

1. **Opt-in strict, désactivé par défaut.** Sans case cochée : zéro appel réseau.
2. **Seuls les tours du joueur** (`results.is_player = 1`). Les XML contiennent les tours de
   tous les pilotes de la session (IA et humains) : ils ne partent jamais.
3. **Minimisation** : ni nom de pilote, ni équipe, ni numéro, ni livrée, ni nom de fichier ;
   adresse IP jamais écrite en base.
4. **Nom LMU affiché, non modifiable ; anonymat au choix** (décisions mainteneur,
   2026-09-26) : dans les classements, le joueur apparaît sous **son nom de pilote tel qu'écrit
   par le jeu dans les XML** (`results.driver_name` des lignes `is_player`), pour qu'on
   reconnaisse les pilotes d'une course en ligne à l'autre. Aucun champ libre : l'app identifie
   déjà le joueur en comparant son nom de pilote au nom écrit dans chaque XML
   (`indexer.rs:551`), donc un autre nom saisi dans l'app ne correspondrait à aucun tour. S'il
   change de nom dans le jeu, le nouveau nom suit à la session suivante. Seule option : « Rester
   anonyme » (« Pilote #a3f9 ») — ne pas s'afficher n'est pas changer de nom. Côté serveur,
   l'identité technique reste un identifiant d'installation aléatoire.
   - Homonymes (deux pilotes au même nom LMU) : autorisés, distingués sur le site par un
     repère court (« Cris Tof · 2 »).
   - Usurpation : un client modifié peut forger un nom. Parade : un nom reste attaché à la
     première installation qui l'envoie ; un second envoyeur est affiché en homonyme et signalé
     à la modération.
5. **Hors ligne d'abord** : l'app fonctionne à l'identique sans le serveur ; l'envoi est
   différé, rejoué, jamais bloquant.
6. **Données du jeu uniquement** : aucune référence saisie à la main côté serveur (règle « pas
   de tracé erroné »).
7. **Aucune perte de fonctionnalité** : tant qu'un combo n'a pas assez de données, l'app garde
   la référence actuelle (ohne_speed).
8. **Reformuler honnêtement la promesse de la vitrine.** Le site actuel affiche « 0 donnée
   envoyée », « Aucun serveur, aucun compte », « Rien à saisir, rien à envoyer ». C'est vrai
   aujourd'hui (l'app ne fait que télécharger), mais **faux pour qui active le partage** : la
   fonction consiste précisément à envoyer ses tours. Dans le même lot que l'opt-in, la vitrine
   devient par exemple « 0 donnée envoyée sans votre accord », et la FAQ (« Mes données
   sont-elles envoyées quelque part ? ») répond : « Non, sauf si vous activez le partage de vos
   meilleurs tours : seuls vos temps partent, sous le nom que vous choisissez (ou
   anonymement), et vous pouvez tout effacer depuis l'app. » Sans case cochée, l'app n'envoie toujours rien ; consulter les classements reste un
   simple téléchargement d'agrégats, comme la feuille ohne_speed aujourd'hui.

## 2. Découpage en étapes

| Étape | Contenu envoyé | Ce que ça débloque | Volume |
|---|---|---|---|
| **1** | Résumé de session : meilleur tour valide + secteurs, rythme médian | Percentiles et classements par combo, par voiture, par version | ~0,5 Ko / session |
| **2** | Résumé par virage du meilleur tour (freinage, vitesse mini, entrée/sortie, pleine charge) | Repères de freinage communautaires par classe/voiture → remplacent les fiches tierces | ~2 Ko |
| **3** | Tour complet ré-échantillonné (1-2 m) | Comparaison de courbes, tour fantôme | 100-300 Ko compressé |

On ne lance l'étape N+1 que si l'étape N a trouvé son public.

## 3. Étape 1 — ce qui est envoyé

Tout existe déjà en base (`sessions`, `results`, `laps`) : aucune nouvelle capture. Sur le
poste du mainteneur : 570 tours valides hors stands, sur 219 sessions.

Unité = **résumé de session**, une par session où le joueur a au moins un tour valide.

```json
{
  "schema": 1,
  "session_key": "<sha256(install_id + nom du fichier XML)>",
  "app_version": "1.0.8",
  "game_version": "1.4200",
  "played_on": "2026-09-24",
  "session_type": "Race",
  "setting": "Multiplayer",
  "track": "Michelin Raceway Road Atlanta",
  "track_course": "Michelin Raceway Road Atlanta",
  "car_class": "GT3",
  "car_model": "Lamborghini Huracan LMGT3 Evo2",
  "driver_name": "Cris Tof",
  "aids": { "raw": "PlayerControl,TC=2,Clutch,AutoBlip", "tc": 2, "brake_help": false, "steer_help": false, "auto_shift": false },
  "best_lap": {
    "time": 98.412, "s1": 31.205, "s2": 38.902, "s3": 28.305,
    "lap_num": 7, "top_speed": 262.1, "fuel": 0.41,
    "compound_f": "Medium", "compound_r": "Medium"
  },
  "best_sectors": { "s1": 31.050, "s2": 38.800, "s3": 28.200 },
  "valid_laps": 18,
  "median_lap": 99.350,
  "wet": false,
  "has_telemetry": true
}
```

- `session_key` : clé d'idempotence non réversible. Le nom du fichier XML est stable (l'`id`
  local change à la réindexation) et n'est jamais envoyé en clair.
- `played_on` : le jour seulement. `car_model` = `unique_car_name` (modèle, sans livrée).
- **Filtre côté client** : tours `is_valid = 0`, `is_pit = 1` ou sans temps exclus ; session
  sans tour valide non envoyée.
- **Pluie** : la base n'a pas de météo ; seul indice, le composé (`Wet`) → `wet: true`, exclu
  des percentiles « sec ». Piste humide en slicks non détectable (question ouverte §12).
- `has_telemetry` : sert à mesurer, dès l'étape 1, combien de contributeurs pourraient
  alimenter l'étape 2.

## 4. Validation et anti-abus (serveur)

- **Schéma strict** (même schéma zod que l'app) ; rejet si incohérent (s1 + s2 + s3 ≠ temps à
  ± 0,05 s, vitesse de pointe absurde, version inconnue…).
- **Bornes par combo** : dès 20 pilotes, rejet sous 97 % du p1 communautaire (hors
  l'envoyeur lui-même) ; au-dessus de 130 % de la médiane : conservé mais hors percentiles
  (tours de découverte). ⏳ Borne « alien » de la feuille ohne_speed quand n < 20 : pas encore
  implémentée (lot 1 = bornes communautaires seules).
- **Idempotence** par `session_key`. Plafond par installation (ex. 200 sessions/jour) et par
  IP (limiteur en mémoire, IP jamais stockée).
- **Versions** : agrégats par version « majeure.mineure » (1.42) — la BoP déplace les temps ;
  filtre « toutes versions » en option.
- **Aides** : percentiles par défaut sans aide au freinage ni à la direction ; filtre sur le
  site.
- **Modération** : masquage d'une ligne ou d'une installation entière (silencieux), commande
  d'administration.
- **Limite assumée** : le client est ouvert, un tricheur déterminé peut forger un envoi. On
  vise l'erreur et l'abus grossier ; les médianes et percentiles résistent aux valeurs isolées.

### 4 bis. Sécurité des échanges — « on n'affiche que ce qui a été entièrement reçu »

Exigence du mainteneur (2026-09-26) : sécuriser données et échanges, résister aux coupures de
lien avec un joueur. Implémenté et testé au lot 1 :

1. **Réception complète vérifiée** : chaque `POST /sessions` porte l'en-tête
   `Content-Digest: sha-256=:<base64>:` (RFC 9530), **obligatoire**, recalculé sur le corps
   effectivement reçu. Absent, altéré ou tronqué (coupure) → `400 integrity_mismatch`, **rien
   n'est enregistré**.
2. **Tout ou rien** : un lot est écrit dans **une seule transaction** ; tant qu'elle n'est pas
   validée, aucune de ses sessions n'est visible (isolation Postgres). Une erreur pendant
   l'écriture annule le lot entier (`500`), l'app le renverra.
3. **Accusé de réception explicite** : la réponse liste `received` = clés effectivement
   présentes côté serveur (nouvelles + déjà reçues). Les rejets de validation sont listés à part
   (`rejected`, avec la raison) et ne bloquent pas le reste du lot.
4. **Renvoi idempotent** : coupure après l'écriture mais avant l'accusé → l'app renvoie, la clé
   `session_key` est reconnue (`duplicates`) et confirmée dans `received`, sans doublon. Une clé
   déjà utilisée par une autre installation est rejetée.
5. **Côté app (lot 2)** : une session ne passe à l'état « envoyée » que si sa clé figure dans
   `received` ; sinon elle reste en file et repart plus tard (backoff). La position
   communautaire d'une session n'est affichée qu'après cet accusé.
6. **Transport** : HTTPS uniquement (NPM, HSTS) ; l'app refuse toute URL `http://` et vérifie le
   certificat (`reqwest` + rustls) ; le service n'a aucun port publié.

## 5. Identité et RGPD

- **Enregistrement** au premier envoi : `POST /api/v1/register` → `install_id` (UUID v4) +
  `token` (256 bits aléatoires). Côté app, le token est rangé chiffré dans le magasin de clés
  existant (AES-GCM, même mécanisme que les clés IA) et l'envoi part du Rust (`reqwest`, comme
  `ai_chat`) : le token ne transite pas par la webview. Côté serveur : seul son hash SHA-256.
- **Base légale** : consentement (case à cocher, retrait à tout moment). Un identifiant
  pseudonyme reste une donnée personnelle → registre des traitements, page « Confidentialité »
  (4 langues) sur le site et lien dans l'app ; responsable de traitement : le mainteneur.
- **Droits** : « Supprimer mes données du serveur » (`DELETE /api/v1/me`, effacement réel, pas
  un masquage) ; export (`GET /api/v1/me`).
- **Journaux** du proxy : IP tronquées, rotation ≤ 14 jours. Hébergement dans l'UE de
  préférence (question ouverte §12).

## 6. API v1

Implémentée au lot 1 (`community/api`, détail dans `community/README.md`) :

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/v1/health` | Supervision |
| POST | `/api/v1/register` | Crée une installation → `install_id`, `token`, `tag` |
| POST | `/api/v1/sessions` | Lot de résumés (≤ 50) ; `Bearer` + `Content-Digest` obligatoires → `200 { received, accepted, duplicates, rejected }` |
| GET | `/api/v1/me` | Export de mes données |
| PATCH | `/api/v1/me` | `{ "anonymous": bool }` uniquement (le nom vient des sessions, jamais d'un champ libre) |
| DELETE | `/api/v1/me` | Effacement réel, en cascade |
| GET | `/api/v1/stats` | Chiffres globaux (pilotes, sessions, tracés, tendances 7 j) |
| GET | `/api/v1/combos` | Liste des combos (version la plus récente de chacun) |
| GET | `/api/v1/combos/detail?track=&course=&class=[&version=&aids=clean\|all&conditions=dry\|wet]` | n pilotes, `ranked` (n ≥ 20), meilleur, p1…p90, histogramme (pas 0,5 s), par voiture, versions, tours valides |
| GET | `/api/v1/combos/leaderboard?…&limit=&offset=` | Classement (rang « compétition »), pilote `{ name \| null, tag, homonym }` |
| GET | `/api/v1/combos/position?…&time=` | Rang, top %, écarts au meilleur et à la médiane d'un temps |

Les lectures publiques ne renvoient **que des agrégats** et le classement, jamais de lignes
brutes ; `Cache-Control: public, max-age=120`, CORS ouvert en lecture seule. Les routes
authentifiées sont en `no-store`. Agrégats calculés à la demande (un meilleur tour par pilote) :
les vues matérialisées ne viendront que si le volume l'exige.

## 7. Stack serveur (VPS)

**Recommandation : tout en TypeScript**, le langage du front de l'app → schémas et types
partagés (zod) entre l'app, l'API et le site, un seul langage côté serveur.

**VPS du mainteneur (confirmé le 2026-09-26)** : Docker + **Nginx Proxy Manager** déjà en
place (HTTPS Let's Encrypt géré par NPM), 8 Go de RAM **partagés avec d'autres applications**
→ aucun proxy à ajouter, empreinte mémoire bornée.

**Hébergements distincts** : la **vitrine** tourne sur un Docker **chez le mainteneur** (son
en-tête `Server: openresty` vient de ce proxy domestique, pas du VPS) et **n'est pas
déplacée**. Le service communautaire va sur le **VPS** : service public qui reçoit des envois
de toute la communauté → disponibilité, bande passante, et aucune exposition du réseau
domestique. **DNS** (zone `cparfait.ovh` chez OVH) : enregistrement **A `lmu` → IP du VPS** ;
NPM obtient ensuite le certificat. La vitrine garde son enregistrement actuel. Aucun couplage
entre les deux : la vitrine ne fait que pointer vers `lmu.cparfait.ovh`.

Docker Compose, deux services (le proxy est celui de NPM) :

- **Branchement NPM** : un **nouvel hôte** `lmu.cparfait.ovh` (certificat Let's Encrypt
  géré par NPM) → `web:3000`, qui sert le site et l'API `/api/v1`. La vitrine n'est pas touchée. Le conteneur `web` rejoint le réseau
  Docker de NPM (réseau externe) : **aucun port publié sur l'hôte**. Postgres reste sur un réseau
  interne, jamais exposé.
- **web** (Node 22) : site public en React Router v7 (mode framework, rendu serveur — la même
  bibliothèque de routage que l'app) + API `/api/v1` (Hono, dans le même process). Le rendu
  serveur donne des pages rapides, référencées et partageables (aperçus de liens).
- **Postgres 16** : agrégats calculés à la demande sur « un meilleur tour par pilote »
  (vues matérialisées rafraîchies toutes les 5-10 min seulement si le volume l'exige). Si un Postgres tourne déjà pour une autre app, une base + un rôle dédiés dedans
  suffisent (un conteneur de moins) — à voir avec le mainteneur.

Exploitation : `pg_dump` nocturne chiffré copié hors du VPS + test de restauration mensuel ;
sonde externe sur `/health` ; logs JSON.

**Ressources, bornées pour cohabiter** : `mem_limit` 256 Mo pour `web` (Node ~80-150 Mo en
charge) et 384 Mo pour Postgres, réglé en conséquence (`shared_buffers=64MB`,
`work_mem=4MB`, `max_connections=20`) → **moins de 400 Mo en tout**, soit ~5 % des 8 Go.
`restart: unless-stopped`, journaux Docker plafonnés (`max-size: 10m`). Volume de données
négligeable : 1 000 contributeurs × 15 sessions/semaine × 0,5 Ko ≈ 7,5 Mo/semaine.

Alternative écartée pour l'étape 1 : API en Rust (même langage que le backend Tauri, empreinte
mémoire minimale) — deux langages côté serveur et pas de partage direct avec le site.

Emplacement proposé : dossier `community/` de ce dépôt (`web/`, `shared/`,
`docker-compose.yml`), hors du build Tauri (question ouverte §12).

## 8. Site public — exigence « super beau »

Il doit avoir l'air d'un produit, pas d'un outil.

**Site dédié, séparé de la vitrine** (décision mainteneur, 2026-09-26). La vitrine
(`https://lmustatsviewer.cparfait.ovh/`) sert à convaincre ceux qui n'ont pas encore l'app ;
les classements s'adressent aux joueurs déjà équipés — publics différents, sites différents.
→ **sous-domaine à part : `lmu.cparfait.ovh`**, en-tête propre (Circuits · Records · Voitures ·
Classes · Rechercher un pilote · « Partager mes tours » · lien vers l'app), sans le menu
marketing. La vitrine gagne seulement un lien vers les classements. Les classements existent
**aussi dans l'app** (§9) : le site sert à consulter sans l'app et à partager des liens.

**Identité** : même famille visuelle que la vitrine (même marque), mise en page de tableau de
bord plutôt que de page marketing.
- **Palette et typo** reprises de la vitrine (`assets/css/style.css`) : fond marine `#0A0E1A` / `#0E1424` /
  `#141C31`, accent ambre `#FFB400`, rouge `#E0451C`, bleu `#5B9DFF`, vert `#35C98C`, violet
  `#A183FF`, polices Inter + JetBrains Mono (chronos), rayons 14/20 px, ombres et halo ambre,
  thème sombre par défaut avec bascule claire, largeur max 1180 px.
- **Données** = composants de l'app : couleurs de classes et de niveaux (`src/index.css`),
  visuels de voitures (`public/cars`, 37), logos, drapeaux, `ClassBadge`, `TrackFlag`,
  `CarImage`, `TierBadge`, carte SVG `TrackMap`. Extraits dans `community/shared` sans
  dépendance Tauri (lot dédié), pour que l'app et le site évoluent ensemble.
- Écart à trancher : l'app utilise un orange `#D93B00` en primaire, la vitrine un ambre
  `#FFB400`. Sur le site, l'ambre fait foi ; l'orange reste celui des niveaux.
- Le site a **sa propre feuille de style** (dérivée des mêmes tokens), pas celle de la vitrine :
  les deux évoluent indépendamment. Les maquettes chargent la feuille de la vitrine par
  commodité uniquement.

**Pages** :
1. **Accueil** : chiffres vivants (pilotes, tours, circuits), combos les plus roulés de la
   semaine, derniers records, bouton « Télécharger l'app ».
2. **Circuit** : carte du tracé, fiche (longueur, virages), onglets par classe.
3. **Combo circuit × classe** — la page phare : distribution des temps (histogramme avec
   repères p10/p50/p90), meilleurs tours, écarts par voiture, évolution par version (effet BoP).
4. **Voiture** : où elle est rapide ou lente par rapport à sa classe.
5. **Profil public** (seulement si nom public activé) : progression, circuits favoris.
6. Confidentialité, À propos, Télécharger.

Étape 2 : la carte du circuit avec les **zones de freinage communautaires**, colorées par
classe — l'effet « waouh » et la réponse visible au problème des fiches tierces.

**Partage** : une image d'aperçu générée par page (« Road Atlanta · GT3 · top 12 % »), pour que
les liens postés sur Discord ou les forums donnent envie de cliquer.

**Qualité** : 4 langues (mêmes clés i18n que l'app), mobile d'abord, Lighthouse ≥ 90
(performance, accessibilité), animations sobres, et **aucun écran vide** : un état « pas encore
assez de données » soigné, qui invite à contribuer.

**Démarche** : maquettes cliquables (accueil, circuit, combo, écran d'opt-in dans l'app)
validées par le mainteneur **avant** le code. Premières maquettes : `community/mockups/`
(site : accueil, Road Atlanta · GT3 ; app : activation, page « Classement » ; servies par la
config `mockups` de `.claude/launch.json`).

## 9. Côté app

- **Configuration → section « Communauté »** : interrupteur désactivé par défaut, texte clair
  sur ce qui part, bouton « Voir ce qui sera envoyé » (aperçu lisible du JSON), nom affiché
  (nom de pilote LMU, en lecture seule) + interrupteur « Rester anonyme », « Supprimer
  mes données du serveur », lien vers la page de confidentialité.
- **Écran d'activation — exigence RGPD** : le nom étant public par défaut, l'écran qui active
  le partage montre **en clair** « Tu apparaîtras sous le nom : *X* » et l'option « Rester
  anonyme » **sur ce même écran**, avant validation. Le RGPD (art. 25-2) interdit de rendre une
  donnée accessible au public par défaut sans action de la personne : c'est cette case, cochée
  en connaissance de cause, qui constitue l'action.
- **Invitation** : une carte unique après la mise à jour, refusable, jamais relancée.
- **Envoi** : file locale (`community_outbox` ou colonne `sent_at`) alimentée après chaque
  indexation (même point que `dataVersion`), lots en arrière-plan avec `Content-Digest`,
  reprise avec backoff ; une session n'est « envoyée » que si l'accusé `received` la cite
  (§4 bis).
  Historique : proposé séparément (case distincte), jamais envoyé d'office.
- **Page « Classement »** (nouvelle entrée du menu de l'app) : les mêmes vues que le site —
  circuits, combo circuit × classe (répartition, classement, par voiture, par version) — avec en
  plus **« vous »** placé automatiquement sur chaque combo roulé, sans rien saisir. Lecture des
  agrégats via l'API (cache local, hors ligne = dernières données connues). Style de l'app.
- **Affichage ailleurs** : Records, détail de session, badge de niveau → « Communauté : top
  32 % · 148 pilotes » à côté du niveau ohne_speed ; affiché seulement à partir de n ≥ 20
  pilotes distincts sur le combo. Un clic ouvre la page Classement du combo.
- **Partager** : depuis un record, « Partager » ouvre la page du combo sur le site dédié (lien +
  image d'aperçu).
- **URL du service** : constante, surchargeable en développement.
- Changelog + i18n ×4 à chaque lot (règles du projet).

## 10. Étape 2 — résumés par virage (aperçu)

- **Source** : la détection de virages existante (`coach_corner` : `brake_dist`, `apex_dist`,
  `vmin`, `ventry`, `vexit`, `full_throttle_dist`) appliquée au meilleur tour.
- Les `corner_uid` sont locaux → on envoie des positions en **distance au tour** (identique
  pour tous les joueurs) ; le serveur regroupe les positions et en déduit un **référentiel
  canonique des virages** par tracé — calculé, jamais saisi.
- **Sortie** : repères de freinage par classe et par voiture (médiane des 25 % les plus
  rapides), servis à l'app → remplacent les fiches tierces dans le coach, sur tous les circuits.
- Prérequis : télémétrie activée chez le contributeur → la part réelle est mesurée dès
  l'étape 1 (`has_telemetry`).

## 11. Plan de livraison

| Lot | Contenu |
|---|---|
| 0 | Validation de cette spec + maquettes ; décision inscrite en §2 de `SUIVI.md` |
| 1 | ✅ **Fait (2026-09-26)** — `community/` : compose, schéma BDD, API complète v1 (écritures + lectures), sécurité des échanges §4 bis, 22 tests, sauvegarde/restauration vérifiées, script de vérification. ⏳ Déploiement sur le VPS par le mainteneur (`community/README.md`) |
| 2 | ✅ **App faite (2026-09-26)** — `commands/community.rs` (résumés depuis la base locale, file `community_outbox`, `Content-Digest`, accusé, backoff, jeton chiffré, anonymat, suppression), Configuration → Communauté (`CommunitySettings.tsx`), envoi auto (`useCommunitySync`). Contrat validé sur base réelle (145/145) et bout en bout contre le serveur Docker. ⏳ Mise à jour de la vitrine (compteur « 0 donnée envoyée », FAQ, page Confidentialité) à faire avant la sortie publique |
| 3 | ✅ **Fait (2026-09-26)** — site servi par le même conteneur (`community/site`, HTML/CSS/JS sans framework, design des maquettes, 4 langues, CSP stricte, noms échappés) : accueil (chiffres, combos les plus roulés, grille des circuits filtrable) + page combo (répartition, position exacte d'un temps, classement paginé, par voiture, versions, partage de lien). Visuels/drapeaux de l'app via contexte Docker additionnel. ⏳ Images d'aperçu générées (OpenGraph) et rendu serveur : plus tard |
| 4 | ✅ **Page « Classement » faite (2026-09-26)** — menu entre Références et Setups, position du joueur sur chaque combo local (même sans partager), tuiles, jauge, combos sous le seuil avec progression, détail (répartition + « VOUS », autour de vous), lien vers le site. ⏳ Pastille « Communauté » dans Records / détail de session |
| 5 | Étape 2 : résumés par virage, carte des freinages communautaires |

## 12. Questions ouvertes (mainteneur)

1. **VPS** : ✅ Docker + Nginx Proxy Manager, 8 Go partagés (2026-09-26). Reste : pays
   d'hébergement (UE ?) et un Postgres déjà présent à réutiliser ?
2. ✅ **Site dédié séparé de la vitrine** + classements dans l'app (2026-09-26), sur
   **`lmu.cparfait.ovh`** (site + API `/api/v1`).
3. Code dans ce dépôt (`community/`) ou dépôt séparé ?
4. ✅ **Nom LMU affiché par défaut, non modifiable ; anonymat au choix** (2026-09-26) : nom
   tel qu'écrit par le jeu ; « Rester anonyme » → « Pilote #a3f9 », réversible. Disponible dès
   l'étape 1. Conditions : écran d'activation explicite (§9). Voir §1 point 4 (homonymes,
   usurpation).
5. Seuil d'affichage : n ≥ 20 pilotes distincts ?
6. Historique : proposer l'envoi des sessions passées ?
7. Sessions hors ligne contre l'IA : incluses (ce sont bien les tours du joueur) ?
8. Détection pluie : se contenter du composé, ou attendre une source météo fiable ?
9. ✅ **Classements ouverts à tout le monde** (2026-09-26), contributeurs ou non, dans l'app
   comme sur le site.
