#!/usr/bin/env bash
# ==============================================================================
# Kinergy Platform - Staging Database Backup Automation Script
# Usage: ./infrastructure/scripts/backup-staging-db.sh
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups/staging}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILENAME="kinergy_staging_${TIMESTAMP}.dump"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILENAME}"

mkdir -p "${BACKUP_DIR}"

echo "[INFO] [$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting Kinergy Staging PostgreSQL backup..."

# Ensure required connection variables or defaults
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5434}"
PGDATABASE="${PGDATABASE:-kinergy_staging}"
PGUSER="${PGUSER:-kinergy_staging_admin}"

if [ -z "${PGPASSWORD:-}" ]; then
  echo "[WARN] PGPASSWORD is not exported in environment; pg_dump may prompt for password or rely on ~/.pgpass."
fi

# Execute pg_dump with custom compressed archive format (-Fc)
echo "[INFO] Exporting schema and data from ${PGHOST}:${PGPORT}/${PGDATABASE} to ${BACKUP_PATH}..."
pg_dump \
  --host="${PGHOST}" \
  --port="${PGPORT}" \
  --username="${PGUSER}" \
  --dbname="${PGDATABASE}" \
  --format=custom \
  --blobs \
  --verbose \
  --file="${BACKUP_PATH}"

# Generate SHA256 Checksum for integrity verification
if command -v sha256sum > /dev/null 2>&1; then
  sha256sum "${BACKUP_PATH}" > "${BACKUP_PATH}.sha256"
  echo "[INFO] Checksum generated: ${BACKUP_PATH}.sha256"
elif command -v shasum > /dev/null 2>&1; then
  shasum -a 256 "${BACKUP_PATH}" > "${BACKUP_PATH}.sha256"
  echo "[INFO] Checksum generated: ${BACKUP_PATH}.sha256"
fi

BACKUP_SIZE=$(ls -lh "${BACKUP_PATH}" | awk '{print $5}')
echo "[SUCCESS] Staging backup completed successfully. Size: ${BACKUP_SIZE}"

# Enforce retention policy (prune backups older than RETENTION_DAYS)
echo "[INFO] Applying backup retention policy (${RETENTION_DAYS} days)..."
find "${BACKUP_DIR}" -type f -name "kinergy_staging_*.dump*" -mtime +"${RETENTION_DAYS}" -exec rm -f {} \;
echo "[INFO] Retention cleanup finished."

