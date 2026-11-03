# ==============================================================================
# Kinergy Platform - Staging Database Backup Automation Script (PowerShell)
# Usage: powershell -File ./infrastructure/scripts/backup-staging-db.ps1
# ==============================================================================

[CmdletBinding()]
param (
    [string]$BackupDir = "./backups/staging",
    [int]$RetentionDays = 7,
    [string]$HostName = $env:PGHOST,
    [string]$Port = $env:PGPORT,
    [string]$Database = $env:PGDATABASE,
    [string]$User = $env:PGUSER
)

if (-not $HostName) { $HostName = "localhost" }
if (-not $Port) { $Port = "5434" }
if (-not $Database) { $Database = "kinergy_staging" }
if (-not $User) { $User = "kinergy_staging_admin" }

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = Join-Path $BackupDir "kinergy_staging_$timestamp.dump"

Write-Host "[INFO] Starting Kinergy Staging PostgreSQL backup to $backupFile..."

# Execute pg_dump
try {
    & pg_dump --host=$HostName --port=$Port --username=$User --dbname=$Database --format=custom --blobs --file=$backupFile
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump failed with exit code $LASTEXITCODE"
    }

    # Generate SHA256 checksum
    $hash = Get-FileHash -Path $backupFile -Algorithm SHA256
    "$($hash.Hash)  $((Get-Item $backupFile).Name)" | Out-File -FilePath "$backupFile.sha256" -Encoding ascii

    $size = (Get-Item $backupFile).Length
    Write-Host "[SUCCESS] Staging backup completed successfully. Size: $size bytes"

    # Enforce retention policy
    $cutoff = (Get-Date).AddDays(-$RetentionDays)
    Get-ChildItem -Path $BackupDir -Filter "kinergy_staging_*.dump*" | Where-Object { $_.LastWriteTime -lt $cutoff } | Remove-Item -Force
    Write-Host "[INFO] Retention cleanup complete."
}
catch {
    Write-Error "[ERROR] Backup failed: $_"
    exit 1
}

