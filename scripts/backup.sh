#!/usr/bin/env bash
# backup.sh — Dead Letter Diary database backup
# IMPORTANT: This script DELIBERATELY excludes the shards schema.
# The shards schema contains server_shards — the cryptographic key material
# whose deletion is the wipe event. Backing it up defeats the security guarantee.
set -euo pipefail

DB_NAME="${POSTGRES_DB:-deadletter}"
DB_USER="${POSTGRES_USER:-deadletter}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/deadletter_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "Dead Letter Diary — database backup"
echo "WARNING: Server shards are NOT included in this backup by design."
echo "Backing up to: $BACKUP_FILE"

PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --exclude-schema=shards \
  --no-password \
  | gzip > "$BACKUP_FILE"

echo "Backup complete: $BACKUP_FILE"
echo "REMINDER: Server shards excluded — wipe guarantee intact."
