#!/bin/sh
# Sauvegarde de la base (à planifier chaque nuit via crontab, cf. README.md).
# Usage : scripts/backup.sh            → backups/lmu-AAAAMMJJ-HHMMSS.sql.gz
# Variables : BACKUP_DIR (défaut ./backups), BACKUP_KEEP_DAYS (défaut 14),
#             BACKUP_AGE_RECIPIENT (clé publique age : chiffre la sauvegarde si défini).
set -eu
cd "$(dirname "$0")/.."
DEST="${BACKUP_DIR:-./backups}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$DEST"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$DEST/lmu-$STAMP.sql.gz"
docker compose exec -T db pg_dump -U lmu -d lmu --no-owner | gzip -9 > "$OUT.tmp"
# Une sauvegarde vide ou tronquée ne doit jamais remplacer une bonne.
if [ ! -s "$OUT.tmp" ] || ! gzip -t "$OUT.tmp"; then
  rm -f "$OUT.tmp"; echo "ÉCHEC : sauvegarde vide ou corrompue" >&2; exit 1
fi
if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
  age -r "$BACKUP_AGE_RECIPIENT" -o "$OUT.age" "$OUT.tmp" && rm -f "$OUT.tmp"
  OUT="$OUT.age"
else
  mv "$OUT.tmp" "$OUT"
fi
find "$DEST" -name 'lmu-*.sql.gz*' -mtime +"$KEEP" -delete
echo "$OUT"
