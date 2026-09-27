# Service communautaire — `lmu.cparfait.ovh`

Service des classements communautaires de LMU Stats Viewer (spec : `../COMMUNITY-SPEC.md`) :
**l'API** (`/api/v1`) et **le site public** (`/`, `community/site/`) dans un même conteneur.
Node 22 + Hono + Postgres 16, en Docker Compose, derrière le **Nginx Proxy Manager du VPS**.

```
community/
  api/            service HTTP (TypeScript) + tests
  shared/         contrat d'envoi app ↔ serveur (schémas zod)
  site/           site public (HTML/CSS/JS, sans framework ; CSP stricte, 4 langues)
  scripts/        backup.sh (sauvegarde), smoke.mjs (vérification de bout en bout),
                  seed-local.mjs (données de démonstration, LOCAL uniquement),
                  serve-site.mjs (aperçu du site sans reconstruire l'image)
  mockups/        maquettes (hors déploiement)
  docker-compose.yml         pile de production (VPS)
  docker-compose.local.yml   surcharge pour tester en local
```

---

## Déploiement sur le VPS (première fois)

### 1. DNS (espace client OVH)

Zone `cparfait.ovh` → ajouter un enregistrement **A** : sous-domaine `lmu`, cible = **IP du
VPS** (et un **AAAA** si le VPS a une IPv6). La vitrine garde son enregistrement actuel.
Vérifier la propagation : `nslookup lmu.cparfait.ovh` doit renvoyer l'IP du VPS.

### 2. Récupérer le dossier sur le VPS

**Option A — archive (organisation `~/docker/<projet>/` du VPS)** : l'archive contient le
contenu de `community/` à la racine (compose compris) et `public/` à côté. Sur le PC :

```sh
tar --exclude='./node_modules' --exclude='./*/node_modules' --exclude='./backups' --exclude='./.env' \
  --exclude='./*/dist' --exclude='./mockups' -czf lmustatsviewer.tar.gz -C community . \
  -C .. public/logos public/flags public/data/cars.json public/data/circuits.json
scp -P 22222 lmustatsviewer.tar.gz debian@<IP-du-VPS>:~/docker/
```

Sur le VPS : `mkdir -p ~/docker/lmustatsviewer && tar -xzf ~/docker/lmustatsviewer.tar.gz -C ~/docker/lmustatsviewer`,
puis **`APP_PUBLIC_DIR=./public`** dans `.env` (étape 4).

**Option B — dépôt git** :

```sh
git clone https://github.com/cparfait/lmustatsviewer.git
cd lmustatsviewer/community
```

⚠️ Le build utilise aussi le dossier `public/` **de l'app** (logos des marques, drapeaux,
`cars.json`, `circuits.json`) via un contexte Docker additionnel : cloner le **dépôt entier**
(ou copier `community/` **et** `public/` côte à côte).

### 3. Façade et NPM (cloisonnement)

La pile ne partage **aucun** réseau avec les autres applications du serveur : sa façade
`web-lmustatsviewer` n'est partagée qu'avec Nginx Proxy Manager, et la base vit sur un réseau
interne sans accès à Internet. Pas de réseau `proxy` commun (tout conteneur voisin pourrait
sinon joindre l'API en clair, hors des règles du proxy).

```sh
docker network create web-lmustatsviewer
docker network connect web-lmustatsviewer npm-npm-1      # nom du conteneur NPM : docker ps
```

⚠️ `docker network connect` ne survit pas à une **recréation** du conteneur NPM (mise à jour
de l'image, `docker compose up` après modification). Pour un raccordement durable, déclarer
aussi la façade dans le compose de NPM :

```yaml
services:
  npm:
    networks: [proxy, web-lmustatsviewer]   # + les façades des autres applications
networks:
  proxy: { external: true }
  web-lmustatsviewer: { external: true }
```

### 4. Fichier `.env`

```sh
cp .env.example .env
chmod 600 .env
```

Remplir :

- `POSTGRES_PASSWORD` : lettres et chiffres uniquement, par exemple le résultat de `openssl rand -hex 24`.
- `FACADE_NETWORK` : à laisser vide (défaut `web-lmustatsviewer`).
- `APP_PUBLIC_DIR` : `./public` avec l'archive (option A) ; vide avec le dépôt (option B).

Ne jamais commiter ce fichier (il est ignoré par git).

### 5. Démarrer

```sh
docker compose up -d --build
docker compose ps          # db et api « healthy », backup « running »
docker compose logs api    # doit afficher {"listening":3000}
```

Les migrations de la base s'appliquent toutes seules au démarrage.

### 6. Nginx Proxy Manager → *Hosts* → *Proxy Hosts* → *Add Proxy Host*

| Onglet | Réglage |
|---|---|
| Details | Domain Names : `lmu.cparfait.ovh` · Scheme : `http` · Forward Hostname : **`lmustatsviewer-web`** · Forward Port : **`3000`** · *Block Common Exploits* ✓ · WebSocket inutile |
| SSL | *Request a new SSL Certificate* (Let's Encrypt) · *Force SSL* ✓ · *HTTP/2 Support* ✓ · *HSTS Enabled* ✓ |

NPM transmet déjà l'IP réelle (`X-Real-IP`), utilisée **uniquement** en mémoire par le
limiteur de débit : elle n'est jamais écrite en base ni dans les journaux.

### 7. Vérifier de bout en bout

Depuis n'importe quelle machine avec Node 18 ou plus :

```sh
node scripts/smoke.mjs https://lmu.cparfait.ovh
```

Le script crée une installation de test, envoie une session, rejoue une coupure (renvoi,
envoi tronqué, envoi sans empreinte), vérifie l'agrégat et l'export, puis **efface tout** :
aucune donnée factice ne reste en production. Attendu : `TOUT EST OK`.

### 8. Sauvegardes

Le service `backup` de la pile fait **un dump par jour** dans `./backups`
(`lmu-AAAAMMJJ-HHMMSS.dump`, format personnalisé de `pg_dump`), conservé 14 jours. Rien à
planifier.

- **Copier les sauvegardes hors du VPS** (rclone, scp vers le serveur de la maison…) : une
  sauvegarde sur le même disque ne protège pas d'une perte du VPS.
- Dump à la demande, éventuellement chiffré (`age`) : `sh scripts/backup.sh`
  (→ `backups/lmu-….sql.gz[.age]`, `BACKUP_AGE_RECIPIENT=age1…` pour chiffrer).

**Restaurer** un dump quotidien :

```sh
docker compose exec -T db createdb -U lmu lmu_restore
docker compose exec -T db pg_restore -U lmu -d lmu_restore --no-owner < backups/lmu-AAAAMMJJ-HHMMSS.dump
# contrôle, puis bascule : arrêter l'api, renommer les bases, relancer l'api
```

(Un dump `.sql.gz` de `scripts/backup.sh` se restaure avec
`gzip -dc … | docker compose exec -T db psql -U lmu -d lmu_restore -v ON_ERROR_STOP=1`.)

---

## Mise à jour

**Méthode principale — depuis GitHub, sur le VPS** (après un push sur `main`) :

```sh
bash ~/docker/lmustatsviewer/scripts/update-from-github.sh          # branche main
bash ~/docker/lmustatsviewer/scripts/update-from-github.sh v1.0.7   # un tag ou un commit
```

Le script récupère **seulement** `community/` et les visuels de l'app (`public/logos`,
`public/flags`, `public/data`) dans `.source/` (clone partiel, le code de l'app n'est jamais
téléchargé), puis lance le `scripts/update.sh` de cette version. Pendant toute l'opération,
le site affiche le bandeau **« Mise à jour en cours »** (`state/maintenance.json`, lu par
`/api/v1/status`), retiré à la fin quoi qu'il arrive. Nécessite `git` sur le VPS.

Première fois (le script n'est pas encore sur le VPS) :

```sh
curl -fsSL https://raw.githubusercontent.com/cparfait/lmustatsviewer/main/community/scripts/update-from-github.sh -o /tmp/maj.sh && bash /tmp/maj.sh
```

**En secours — depuis le PC, sans passer par GitHub** (un seul mot de passe SSH) :

```sh
community\scripts\deploy.cmd            # cmd / PowerShell
bash community/scripts/deploy.sh         # Git Bash
community\scripts\deploy.cmd --smoke    # … puis test de bout en bout en production
```

Cible dans `community/.deploy.env` (non versionné) :

```sh
DEPLOY_TARGET=debian@lmu.cparfait.ovh
DEPLOY_PORT=22222
DEPLOY_DIR=docker/lmustatsviewer     # relatif au dossier personnel du VPS
```

Déroulé : contrôles locaux (typage, tests, syntaxe du site) → archive (+ fichier `VERSION` :
date et commit) → envoi et exécution sur le VPS de `scripts/update.sh` **de la nouvelle
archive** :

1. sauvegarde de la version en place (code dans `.releases/`, 5 dernières ; image `:previous`) ;
2. remplacement du code — `.env`, `backups/` et la base ne sont jamais touchés ;
3. construction de l'image : **si elle échoue, le service en place n'est pas arrêté** et le code
   précédent est remis ;
4. redémarrage de l'API seule (la base reste en marche) et attente de la sonde de santé ;
5. **si l'API n'est pas « healthy » : retour automatique à la version précédente** (journaux affichés).

Les trois cas (réussite, API en échec, compilation en échec) ont été vérifiés sur un VPS simulé.

Version en place : `cat ~/docker/lmustatsviewer/VERSION`. Retour manuel à une version :
`tar -xzf .releases/code-AAAAMMJJ-HHMMSS.tar.gz && docker compose up -d --build api`.

Les nouvelles migrations s'appliquent au démarrage. Une migration publiée n'est jamais
modifiée (on en ajoute une).

## Administration / modération

```sh
docker compose exec api node dist/api/src/admin.js help
docker compose exec api node dist/api/src/admin.js stats
docker compose exec api node dist/api/src/admin.js homonyms
docker compose exec api node dist/api/src/admin.js hide-install <id>     # bannissement silencieux
docker compose exec api node dist/api/src/admin.js hide-session <session_key>
docker compose exec api node dist/api/src/admin.js delete-install <id>
# Données de DÉMONSTRATION (tester le site peuplé), marquées app_version = 0.0.1-demo :
docker compose exec api node dist/api/src/admin.js seed-demo          # ~870 pilotes, ~2 700 sessions
docker compose exec api node dist/api/src/admin.js purge-demo         # compte, n'efface rien
docker compose exec api node dist/api/src/admin.js purge-demo --yes   # efface la démo, et elle seule
```

---

## Sécurité des données et des échanges

- **Chiffrement du transport** : HTTPS de bout en bout, terminé par NPM (Let's Encrypt, HSTS).
  Le service n'a **aucun port publié** : il n'est joignable qu'à travers NPM.
- **Réception complète vérifiée** : chaque envoi porte une empreinte SHA-256 du corps
  (`Content-Digest`, RFC 9530), recalculée sur ce qui a réellement été reçu. Un envoi coupé
  ou tronqué est refusé en entier, sans rien enregistrer.
- **Tout ou rien** : un lot est écrit dans une seule transaction. Rien n'est visible dans
  les classements tant que tout n'est pas écrit (testé : un échec à la 2ᵉ écriture annule
  tout le lot).
- **Accusé de réception** : la réponse liste les sessions effectivement enregistrées
  (`received`). L'app ne marque « envoyé » et n'affiche la position qu'après cet accusé.
- **Renvoi sans doublon** : une coupure après l'écriture mais avant l'accusé est sans
  conséquence ; le renvoi est reconnu (`session_key`) et simplement confirmé.
- **Authentification** : jeton aléatoire de 256 bits par installation, dont seul le hash
  SHA-256 est stocké.
- **Minimisation** : ni IP, ni jeton, ni nom de fichier en base ou dans les journaux ; seuls
  les tours du joueur sont acceptés (schéma strict, champ inconnu = rejet).
- **Abus** : limites de débit par IP et par installation, quota journalier, bornes par combo
  (trop rapide = rejet, trop lent = hors classement), modération.
- **Conteneurs** : utilisateur non-root, système de fichiers en lecture seule,
  `no-new-privileges`, mémoire bornée (API 256 Mo, Postgres 384 Mo ; mesuré ≈ 70 Mo au repos).
- **Droits RGPD** : export (`GET /me`) et effacement réel (`DELETE /me`, en cascade).

## API v1 (résumé)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/v1/health` | santé |
| POST | `/api/v1/register` | crée une installation → `install_id`, `token`, `tag` |
| POST | `/api/v1/sessions` | lot de résumés (≤ 50), `Authorization: Bearer` + `Content-Digest` obligatoires → `received`, `accepted`, `duplicates`, `rejected` |
| GET / PATCH / DELETE | `/api/v1/me` | export / anonymat (`{"anonymous": true}`) / effacement |
| GET | `/api/v1/stats` | chiffres globaux |
| GET | `/api/v1/combos` | liste des combos (version la plus récente) |
| GET | `/api/v1/combos/detail?track=&course=&class=[&version=&aids=&conditions=]` | percentiles, histogramme, par voiture, versions |
| GET | `/api/v1/combos/leaderboard?…&limit=&offset=` | classement (noms au choix de chaque pilote) |
| GET | `/api/v1/combos/position?…&time=` | rang, top %, écarts d'un temps |

## Site public

Servi par le même conteneur : `/` (accueil : chiffres, puis tous les classements — une carte
repliable par circuit, une ligne par classement comme dans l'app, ou vue liste ; filtrable, sans tracé) et `/combo.html?track=&course=&class=` (répartition, position d'un temps,
classement paginé, par voiture, versions). Visuels et drapeaux = ceux de l'app (mêmes règles de
correspondance). Pages HTML en `no-cache`, `/assets` en cache 1 h ; CSP stricte (aucun script
en ligne ni tiers) ; tout nom de pilote est échappé avant affichage.

Contours des circuits (`site/assets/tracks.js`) : générés à partir de la télémétrie du jeu,
par tracé exact (un tour complet enregistré suffit) :

```sh
pip install duckdb
python scripts/tracks-from-telemetry.py "<LMU>/UserData/Telemetry" site/assets/tracks.js
```

Après toute modification du site, incrémenter le `?v=` des liens CSS/JS dans les pages HTML.

Aperçu local du site sans reconstruire l'image (lit l'API indiquée, en lecture seule) :

```sh
node scripts/serve-site.mjs                                  # API locale 127.0.0.1:3080
API=https://lmu.cparfait.ovh node scripts/serve-site.mjs     # données de production
# → http://127.0.0.1:5190
```

Voir le site peuplé en local (jamais en production — le script refuse toute autre adresse) :

```sh
node scripts/seed-local.mjs http://127.0.0.1:3080    # ~1 000 pilotes fictifs
```

## Développement

```sh
npm install          # à la racine de community/
npm test             # 23 tests sur un vrai Postgres embarqué (PGlite)
npm run typecheck
# pile complète en local :
docker network create npm_local_test
cp .env.example .env    # FACADE_NETWORK=npm_local_test + un mot de passe
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
node scripts/smoke.mjs http://127.0.0.1:3080
```
