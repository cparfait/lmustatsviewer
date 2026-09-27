#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Mise à jour du service communautaire SUR LE VPS (lancé par scripts/deploy.sh).
#
#  Usage : bash update.sh <archive.tar.gz> [dossier]
#          dossier : ~/docker/lmustatsviewer par défaut (chemin relatif = depuis le dossier personnel)
#
#  1. vérifie l'archive (compose + Dockerfile présents, aucun .env dedans) ;
#  2. met de côté la version en place : code (.releases/) + image (:previous) ;
#  3. remplace le code (le .env, les sauvegardes et la base ne sont JAMAIS touchés) ;
#  4. construit l'image — en cas d'échec, le service en place continue de tourner ;
#  5. relance l'API et attend qu'elle soit « healthy » ;
#  6. si elle ne l'est pas : retour automatique à la version précédente.
#
#  Pendant toute l'opération, le site affiche « Mise à jour en cours » (fichier
#  state/maintenance.json, lu par /api/v1/status), retiré à la fin quoi qu'il arrive.
#  Deux mises à jour simultanées sont refusées (verrou .update.lock).
#
#  La base (volume Docker `db-data`) n'est ni arrêtée ni recréée : seule l'API
#  redémarre, quelques secondes.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ARCHIVE="${1:?usage : update.sh <archive.tar.gz> [dossier]}"
DIR="${2:-$HOME/docker/lmustatsviewer}"
IMAGE="lmu-community-api"
SITE_URL="${SITE_URL:-https://lmu.cparfait.ovh}"
KEEP_RELEASES=5
# Tout ce que l'archive fournit — et donc tout ce qu'on remplace. Le reste
# (.env, backups/, .releases/) appartient au serveur.
CODE=(api shared site scripts public package.json package-lock.json docker-compose.yml
      docker-compose.local.yml README.md .env.example .dockerignore .gitattributes VERSION)

say() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗ %s\033[0m\n' "$*" >&2; }

cd "$HOME" && cd "$DIR" 2>/dev/null || { fail "dossier introuvable : $DIR"; exit 1; }
[ -f .env ] || { fail ".env absent dans $DIR (première installation : voir README.md)"; exit 1; }

# Verrou (util-linux, présent sur Debian) : deux mises à jour ne se chevauchent jamais.
if command -v flock >/dev/null; then
  exec 9>.update.lock
  flock -n 9 || { fail "une mise à jour est déjà en cours"; exit 1; }
fi

say "Vérification de l'archive"
LIST="$(tar -tzf "$ARCHIVE")"
for f in ./docker-compose.yml ./api/Dockerfile ./site/index.html; do
  grep -qxF "$f" <<<"$LIST" || { fail "archive incomplète : $f manquant"; exit 1; }
done
if grep -qE '(^|/)\.env$' <<<"$LIST"; then fail "l'archive contient un .env : refusée"; exit 1; fi
NEW_VERSION="$(tar -xzOf "$ARCHIVE" VERSION 2>/dev/null || tar -xzOf "$ARCHIVE" ./VERSION 2>/dev/null || echo inconnue)"
OLD_VERSION="$(cat VERSION 2>/dev/null || echo inconnue)"
ok "version en place : $OLD_VERSION"
ok "nouvelle version : $NEW_VERSION"

say "Bandeau « mise à jour en cours » sur le site"
mkdir -p state
printf '{"since":"%s"}
' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > state/maintenance.json
chmod 644 state/maintenance.json
trap 'rm -f "$DIR/state/maintenance.json"' EXIT
ok "affiché (retiré automatiquement à la fin)"

say "Sauvegarde de la version en place"
mkdir -p .releases
STAMP="$(date +%Y%m%d-%H%M%S)"
PREV=".releases/code-$STAMP.tar.gz"
EXISTING=()
for f in "${CODE[@]}"; do [ -e "$f" ] && EXISTING+=("$f"); done
if [ "${#EXISTING[@]}" -gt 0 ]; then
  tar -czf "$PREV" "${EXISTING[@]}"
  ok "code : $PREV"
else
  tar -czf "$PREV" --files-from /dev/null
  ok "première installation : rien à sauvegarder"
fi
if docker image inspect "$IMAGE:latest" >/dev/null 2>&1; then
  docker image tag "$IMAGE:latest" "$IMAGE:previous"
  ok "image : $IMAGE:previous"
fi
# Rotation : on garde les $KEEP_RELEASES dernières versions du code.
ls -1t .releases/code-*.tar.gz 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -f

restore_code() {
  rm -rf "${CODE[@]}"
  tar -xzf "$PREV"
}

say "Remplacement du code"
rm -rf "${CODE[@]}"
tar -xzf "$ARCHIVE"
ok "fichiers en place (.env, backups/ et base conservés)"

say "Construction de l'image"
if ! docker compose build api; then
  fail "construction en échec : retour au code précédent (le service en place n'a pas été arrêté)"
  restore_code
  exit 1
fi
ok "image construite"

say "Redémarrage de l'API"
if docker compose up -d --wait api; then
  ok "API « healthy »"
else
  fail "la nouvelle version ne démarre pas correctement : RETOUR ARRIÈRE"
  docker compose logs --tail=40 api || true
  restore_code
  if docker image inspect "$IMAGE:previous" >/dev/null 2>&1; then
    docker image tag "$IMAGE:previous" "$IMAGE:latest"
  fi
  docker compose up -d --no-build --wait api && ok "version précédente rétablie ($OLD_VERSION)"
  exit 1
fi

say "Contrôle final"
docker compose ps --format '  {{.Service}}\t{{.Status}}'
if curl -fsS -m 10 "$SITE_URL/api/v1/health" >/dev/null 2>&1; then
  ok "$SITE_URL répond"
else
  fail "le site public ne répond pas (vérifier Nginx Proxy Manager) — l'API, elle, est saine"
fi
docker image prune -f >/dev/null 2>&1 || true
printf '\n\033[32mMise à jour terminée : %s\033[0m\n' "$NEW_VERSION"
