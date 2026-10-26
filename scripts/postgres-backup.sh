#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${DATABASE_URL:?DATABASE_URL required}"
mkdir -p /backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="/backups/plot-${stamp}.dump"
trap 'rm -f "$archive.tmp"' EXIT
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-acl --file="$archive.tmp"
pg_restore --list "$archive.tmp" >/dev/null
mv "$archive.tmp" "$archive"
find /backups -name 'plot-*.dump' -type f -mtime +7 -delete
printf 'Plot backup completed: %s bytes\n' "$(wc -c < "$archive")"

if [ "${PLOT_VERIFY_RESTORE:-0}" = "1" ]; then
  restore_name="plot_restore_${stamp,,}"
  restore_url="${DATABASE_URL%/*}/${restore_name}"
  createdb --maintenance-db="$DATABASE_URL" "$restore_name"
  trap 'dropdb --maintenance-db="$DATABASE_URL" --if-exists "$restore_name" >/dev/null' EXIT
  pg_restore --exit-on-error --no-owner --no-acl --dbname="$restore_url" "$archive"
  rows=$(psql "$restore_url" -X -v ON_ERROR_STOP=1 -tAc 'SELECT count(*) FROM plot_private.documents')
  printf 'Restore verified: %s application aggregates\n' "$rows"
  dropdb --maintenance-db="$DATABASE_URL" "$restore_name"
  trap - EXIT
fi
