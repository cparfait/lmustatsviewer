#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Mise en ligne du service communautaire, DEPUIS LE PC (Git Bash).
#
#      bash community/scripts/deploy.sh            contrôles + mise en ligne
#      bash community/scripts/deploy.sh --smoke    … puis test de bout en bout en prod
#      bash community/scripts/deploy.sh --no-tests sans les contrôles locaux (déconseillé)
#
#  1. contrôles locaux : typage + tests du serveur, syntaxe du site ;
#  2. archive : contenu de community/ + visuels de l'app (public/), fichier VERSION ;
#  3. envoi et mise à jour en UNE connexion SSH (un seul mot de passe) : le VPS
#     exécute le scripts/update.sh DE LA NOUVELLE archive (sauvegarde de la version
#     en place, construction, redémarrage, retour arrière automatique si échec).
#
#  Cible SSH : community/.deploy.env (non versionné), par exemple
#      DEPLOY_TARGET=debian@lmu.cparfait.ovh
#      DEPLOY_PORT=22222
#      DEPLOY_DIR=docker/lmustatsviewer     (relatif au dossier personnel du VPS, sans « ~ »)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"   # community/
ROOT="$(cd "$HERE/.." && pwd)"             # racine du dépôt
SMOKE=0
TESTS=1
for a in "$@"; do
  case "$a" in
    --smoke) SMOKE=1 ;;
    --no-tests) TESTS=0 ;;
    *) echo "option inconnue : $a" >&2; exit 2 ;;
  esac
done

# shellcheck disable=SC1091
[ -f "$HERE/.deploy.env" ] && . "$HERE/.deploy.env"
: "${DEPLOY_TARGET:?DEPLOY_TARGET à définir dans community/.deploy.env (ex. debian@lmu.cparfait.ovh)}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_DIR="${DEPLOY_DIR:-docker/lmustatsviewer}"
SITE_URL="${SITE_URL:-https://lmu.cparfait.ovh}"

say() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }

cd "$HERE"
if [ "$TESTS" = 1 ]; then
  say "Contrôles locaux"
  npm run --silent typecheck
  npm test --silent 2>&1 | grep -E '^ℹ (pass|fail)'
  for f in site/assets/*.js; do node --check "$f"; done
  echo "  site : syntaxe OK"
fi

# Version affichée par le serveur : commit + « modifié » si le dossier n'est pas propre.
REV="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo sans-git)"
if [ -n "$(git -C "$ROOT" status --porcelain -- community public 2>/dev/null)" ]; then REV="$REV+modifié"; fi
VERSION="$(date +%Y-%m-%d_%H%M) $REV"

say "Archive ($VERSION)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
printf '%s\n' "$VERSION" > "$TMP/VERSION"
tar --exclude='./node_modules' --exclude='./*/node_modules' --exclude='./backups' \
    --exclude='./.env' --exclude='./.deploy.env' --exclude='./*/dist' --exclude='./mockups' \
    --exclude='./.releases' --exclude='./state' --exclude='./.source' \
    -czf "$TMP/release.tar.gz" \
    -C "$HERE" . \
    -C "$ROOT" public/logos public/flags public/data/cars.json public/data/circuits.json \
    -C "$TMP" VERSION
echo "  $(du -h "$TMP/release.tar.gz" | cut -f1)"

say "Envoi et mise à jour sur $DEPLOY_TARGET"
# Le VPS reçoit l'archive sur l'entrée standard, puis exécute le update.sh qu'elle
# contient (toujours la version à jour du script).
ssh -p "$DEPLOY_PORT" "$DEPLOY_TARGET" "
  set -e
  f=\$(mktemp); u=\$(mktemp)
  trap 'rm -f \"\$f\" \"\$u\"' EXIT
  cat > \"\$f\"
  tar -xzOf \"\$f\" ./scripts/update.sh > \"\$u\"
  bash \"\$u\" \"\$f\" \"$DEPLOY_DIR\"
" < "$TMP/release.tar.gz"

if [ "$SMOKE" = 1 ]; then
  say "Test de bout en bout ($SITE_URL)"
  node "$HERE/scripts/smoke.mjs" "$SITE_URL"
fi
