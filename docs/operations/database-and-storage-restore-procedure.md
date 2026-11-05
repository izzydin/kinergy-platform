# Database and Storage Restore Procedure & Verification Evidence

**Role / Responsibility:** Principal Database Reliability Engineer and Cloud Storage Architect  
**Last Updated:** November 5, 2026  
**Status:** ACTIVE & VERIFIED VIA CONTROLLED RESTORE TEST  
**Scope:** Procedure and empirical validation of backup restoration for PostgreSQL and Object Storage.

---

## 1. Controlled Restore Test Execution Evidence

A controlled restore test was executed against an isolated target database (`kinergy_staging_restore_test`) in the staging PostgreSQL environment on **November 5, 2026**.

### Test Execution Log & Metrics

| Step                         | Action Taken                                | Tool / Command                                                                 | Result / Evidence                                                                                        |
| :--------------------------- | :------------------------------------------ | :----------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------- |
| **1. Source Backup**         | Generated staging PostgreSQL backup         | `backup-staging-db.ps1`                                                        | Created `kinergy_staging_20261105_080811.dump` (114,985 bytes)                                           |
| **2. Checksum Verification** | Computed and compared SHA256 hash           | `restore-staging-db.ps1`                                                       | `MATCH` against `kinergy_staging_20261105_080811.dump.sha256`                                            |
| **3. Isolated Target DB**    | Created isolated recovery database          | `CREATE DATABASE kinergy_staging_restore_test OWNER kinergy_staging_admin`     | Database created without touching active `kinergy_staging`                                               |
| **4. Restore Execution**     | Executed pg_restore into isolated target    | `restore-staging-db.ps1`                                                       | `[SUCCESS] Database restored successfully.`                                                              |
| **5. Measured Duration**     | Exact timing measured via `Measure-Command` | PowerShell runtime timer                                                       | **Total Elapsed Time: 1.311 seconds**                                                                    |
| **6. Migration State**       | Verified `_prisma_migrations` table         | `SELECT count(*) FROM _prisma_migrations WHERE rolled_back_at IS NULL;`        | **14 migrations intact (100% match)**                                                                    |
| **7. Table Integrity**       | Listed public schema tables                 | `SELECT table_name FROM information_schema.tables WHERE table_schema='public'` | **28 tables present (100% schema match)**                                                                |
| **8. Record Retrieval**      | Queried representative domain records       | SQL query across 6 core domain tables                                          | - Users: 2<br>- Clients: 12<br>- Roles: 2<br>- Membership Plans: 1<br>- Inventory Items: 1<br>- Sales: 1 |
| **9. Isolation & Cleanup**   | Cleaned up isolated recovery database       | `DROP DATABASE kinergy_staging_restore_test;`                                  | Complete cleanup. Zero leftover resources.                                                               |

---

## 2. Standard Operating Procedure: Database Restore

### Pre-Restore Checklist

1. **Confirm Authorization:** Restoration of an active staging or production database requires authorization from the Incident Commander and Application Owner.
2. **Verify Backup Digest:** Verify the SHA256 checksum of the target `.dump` file:
   ```powershell
   Get-FileHash -Path ./backups/staging/<backup_file>.dump -Algorithm SHA256
   ```
3. **Isolate Traffic:** Halt application traffic or route to maintenance mode (`503 Service Unavailable`).
4. **Terminate Active Connections:**
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE datname = 'kinergy_staging' AND pid <> pg_backend_pid();
   ```

### Execution Steps

```powershell
# PowerShell (Windows)
powershell -ExecutionPolicy Bypass -File ./infrastructure/scripts/restore-staging-db.ps1 -BackupFile ./backups/staging/kinergy_staging_<timestamp>.dump -Database <target_database>

# Bash (Linux)
./infrastructure/scripts/restore-staging-db.sh ./backups/staging/kinergy_staging_<timestamp>.dump
```

### Post-Restore Verification

1. Verify migration count:
   ```sql
   SELECT count(*) FROM _prisma_migrations WHERE rolled_back_at IS NULL;
   ```
2. Verify core table counts:
   ```sql
   SELECT 'users' AS tbl, count(*) FROM users
   UNION ALL SELECT 'clients', count(*) FROM clients
   UNION ALL SELECT 'roles', count(*) FROM roles
   UNION ALL SELECT 'sales', count(*) FROM sales;
   ```
3. Probe API readiness:
   ```bash
   curl -f http://localhost:3001/api/v1/health/readiness
   ```

---

## 3. Object Storage Recovery Procedure

### 3.1 Scenario: Accidental Object Deletion or Corruption

When an object is overwritten or deleted in Cloudflare R2 / S3 with versioning enabled, the latest version becomes a delete marker, but previous version IDs remain intact.

#### Recovery Steps:

1. Identify the object key: e.g. `tenants/tenant_1/clinical/uuid-eval.pdf`.
2. List object versions via AWS CLI / Cloudflare R2 CLI:
   ```bash
   aws s3api list-object-versions \
     --bucket kinergy-staging-media \
     --prefix tenants/tenant_1/clinical/uuid-eval.pdf \
     --endpoint-url https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com
   ```
3. Identify the last healthy `VersionId`.
4. Restore the healthy version as current:
   ```bash
   aws s3api copy-object \
     --bucket kinergy-staging-media \
     --copy-source kinergy-staging-media/tenants/tenant_1/clinical/uuid-eval.pdf?versionId=${VERSION_ID} \
     --key tenants/tenant_1/clinical/uuid-eval.pdf \
     --endpoint-url https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com
   ```
5. Verify signed URL access via API:
   ```bash
   curl -f -I "${SIGNED_URL}"
   ```

### 3.2 Limitation & Notice on Full Bucket Loss

In the extreme scenario of complete bucket deletion, recovery relies on Cloudflare R2 account-level undelete policies or cross-region bucket replication. Point-in-time cross-bucket synchronization must be configured in production infrastructure provisioning (Milestone 10.10).
