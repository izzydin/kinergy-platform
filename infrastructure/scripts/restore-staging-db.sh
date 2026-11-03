#!/usr/bin/env bash
# ==============================================================================
# Kinergy Platform - Staging Database Restore Automation Script
# Usage: ./infrastructure/scripts/restore-staging-db.sh <backup_file_path>
# ==============================================================================

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <path_to_backup_dump_file>"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "[ERROR] Backup file does not exist: ${BACKUP_FILE}"
  exit 1
fi

# Verify SHA256 Checksum if file exists
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
if [ -f "${CHECKSUM_FILE}" ]; then
  echo "[INFO] Verifying backup checksum..."
  if command -v sha256sum > /dev/null 2>&1; then
    sha256sum -c "${CHECKSUM_FILE}"
  elif command -v shasum > /dev/null 2>&1; then
    shasum -a 256 -c "${CHECKSUM_FILE}"
  fi
  echo "[INFO] Checksum verified."
else
  echo "[WARN] No checksum file found at ${CHECKSUM_FILE}. Proceeding with caution."
fi

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5434}"
PGDATABASE="${PGDATABASE:-kinergy_staging}"
PGUSER="${PGUSER:-kinergy_staging_admin}"

echo "[INFO] [$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Restoring ${BACKUP_FILE} to ${PGHOST}:${PGPORT}/${PGDATABASE}..."

# Execute pg_restore into database
pg_restore \
  --host="${PGHOST}" \
  --port="${PGPORT}" \
  --username="${PGUSER}" \
  --dbname="${PGDATABASE}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --verbose \
  "${BACKUP_FILE}"

echo "[SUCCESS] Staging database restored successfully."

