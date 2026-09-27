#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Mise à jour du site communautaire DEPUIS GITHUB — à lancer SUR LE VPS.
#
#      bash ~/docker/lmustatsviewer/scripts/update-from-github.sh          # branche main
#      bash ~/docker/lmustatsviewer/scripts/update-from-github.sh v1.0.7   # un tag / un commit
#
#  1. récupère sur GitHub SEULEMENT ce qui sert au site : community/ et les visuels
#     de l'app (public/logos, public/flags, public/data) — pas le code de l'app ;
#  2. en fait une archive (+ VERSION : commit et date) ;
#  3. lance le scripts/update.sh DE CETTE VERSION : bandeau « mise à jour en cours »
#     sur le site, sauvegarde, construction, redémarrage, retour arrière si échec.
#
#  Variables : LMU_DIR (défaut ~/docker/lmustatsviewer), LMU_REPO (dépôt GitHub).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
# Jamais d'arrêt muet : toute commande en échec est signalée avec sa ligne.
trap 'echo "✗ échec ligne $LINENO : $BASH_COMMAND" >&2' ERR

REF="${1:-main}"
DIR="${LMU_DIR:-$HOME/docker/lmustatsviewer}"
REPO="${LMU_REPO:-https://github.com/cparfait/lmustatsviewer.git}"
SRC="$DIR/.source"

say() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }

command -v git >/dev/null || { echo "git est nécessaire : sudo apt install git" >&2; exit 1; }
[ -d "$DIR" ] || { echo "dossier de déploiement introuvable : $DIR" >&2; exit 1; }

say "Récupération sur GitHub ($REF)"
if [ ! -d "$SRC/.git" ]; then
  # Clone partiel : l'historique sans le contenu des fichiers, puis seulement les
  # dossiers utiles au site (le code de l'app n'est jamais téléchargé).
  git clone --quiet --filter=blob:none --no-checkout "$REPO" "$SRC"
  git -C "$SRC" sparse-checkout set community public/logos public/flags public/data
fi
# --force : un tag supprimé puis recréé sur GitHub (republication) remplace l'ancien ;
# sans lui, git refuse — et --quiet masquait ce refus (arrêt sans message).
git -C "$SRC" fetch --quiet --force --tags origin "$REF"
git -C "$SRC" -c advice.detachedHead=false checkout --quiet --force FETCH_HEAD
COMMIT="$(git -C "$SRC" log -1 --format='%h %cd' --date=format:'%Y-%m-%d %H:%M')"
echo "  $COMMIT"

say "Préparation de la version"
mkdir -p "$DIR/.releases"
ARCHIVE="$DIR/.releases/incoming.tar.gz"
printf '%s (%s)\n' "$COMMIT" "$REF" > "$SRC/VERSION"
tar --exclude='./mockups' --exclude='./node_modules' --exclude='./.env' \
    -czf "$ARCHIVE" \
    -C "$SRC/community" . \
    -C "$SRC" public/logos public/flags public/data/cars.json public/data/circuits.json VERSION
echo "  $(du -h "$ARCHIVE" | cut -f1)"

# Le script de mise à jour de CETTE version (toujours le plus récent). `exec` : ce
# fichier-ci peut être remplacé pendant l'opération sans risque.
exec bash "$SRC/community/scripts/update.sh" "$ARCHIVE" "$DIR"
