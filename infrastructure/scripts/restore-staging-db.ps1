# ==============================================================================
# Kinergy Platform - Staging Database Restore Automation Script (PowerShell)
# Usage: powershell -File ./infrastructure/scripts/restore-staging-db.ps1 -BackupFile <path>
# ==============================================================================

[CmdletBinding()]
param (
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,
    [string]$HostName = $env:PGHOST,
    [string]$Port = $env:PGPORT,
    [string]$Database = $env:PGDATABASE,
    [string]$User = $env:PGUSER
)

if (-not $HostName) { $HostName = "localhost" }
if (-not $Port) { $Port = "5434" }
if (-not $Database) { $Database = "kinergy_staging" }
if (-not $User) { $User = "kinergy_staging_admin" }

if (-not (Test-Path $BackupFile)) {
    Write-Error "[ERROR] Backup file not found: $BackupFile"
    exit 1
}

# Verify checksum if present
$checksumFile = "$BackupFile.sha256"
if (Test-Path $checksumFile) {
    Write-Host "[INFO] Verifying checksum against $checksumFile..."
    $expected = (Get-Content $checksumFile).Trim().Split(" ")[0]
    $actual = (Get-FileHash -Path $BackupFile -Algorithm SHA256).Hash
    if ($expected.ToUpper() -ne $actual.ToUpper()) {
        Write-Error "[FATAL] Checksum mismatch! Expected: $expected, Actual: $actual"
        exit 1
    }
    Write-Host "[INFO] Checksum verified: MATCH."
}

Write-Host "[INFO] Restoring $BackupFile into $HostName`:$Port/$Database..."

try {
    & pg_restore --host=$HostName --port=$Port --username=$User --dbname=$Database --clean --if-exists --no-owner --no-privileges $BackupFile
    if ($LASTEXITCODE -ne 0) {
        throw "pg_restore failed with exit code $LASTEXITCODE"
    }
    Write-Host "[SUCCESS] Database restored successfully."
}
catch {
    Write-Error "[ERROR] Restore failed: $_"
    exit 1
}

