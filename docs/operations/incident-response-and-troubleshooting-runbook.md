# Incident Response and Troubleshooting Runbook

**Role / Responsibility:** Principal Site Reliability Engineer and Incident Commander  
**Last Updated:** November 5, 2026  
**Status:** ACTIVE & APPROVED  
**Scope:** Triage, Escalation, and Recovery Procedures for Production Incidents.

---

## 1. Incident Severity Definitions & Escalation Matrix

| Severity Level       | Definition                                                                                                | Target Response (MTTD) | Target Recovery (MTTR) | Notification Scope                                 |
| :------------------- | :-------------------------------------------------------------------------------------------------------- | :--------------------- | :--------------------- | :------------------------------------------------- |
| **SEV-1 (Critical)** | Core service down (API or DB unreachable, complete inability to log in or process payments).              | < 5 Minutes            | < 30 Minutes           | Incident Commander, Tech Lead, DBA, Business Owner |
| **SEV-2 (Major)**    | Major feature degraded (e.g. appointment booking failing, media upload failing, partial 500 error spike). | < 15 Minutes           | < 2 Hours              | On-call SRE, DevOps, Domain Tech Lead              |
| **SEV-3 (Minor)**    | Non-blocking degradation (e.g. background reporting delay, UI cosmetic glitch, slow read query).          | < 1 Hour               | < 1 Business Day       | Engineering Team                                   |

---

## 2. Troubleshooting Procedures by Incident Scenario

---

### Scenario 1: API Unavailable (HTTP 502 Bad Gateway / 503 Service Unavailable)

- **Symptoms:** Reverse proxy returns 502/503. Ingress liveness fails. Users unable to load dashboard data.
- **Verification:**
  1. Inspect API container status: `docker ps -f name=api` (check for restart loop).
  2. Inspect container logs: `docker logs --tail 100 kinergy-staging-api`.
  3. Probe API directly: `curl -I http://localhost:3001/api/v1/health/liveness`.
- **Safe Immediate Actions:**
  - If process exited due to memory exhaustion (OOM), restart container: `docker restart kinergy-staging-api`.
  - If failing readiness probe due to database timeout, proceed to Scenario 3 (Database Unavailable).
- **Recovery Steps:**
  - If regression caused by recent deployment, trigger **API Image Rollback** immediately.
- **Post-Incident Checks:** Verify `/api/v1/health/readiness` returns HTTP 200 with database latency < 50ms.

---

### Scenario 2: Web Application Unavailable (Blank Page / Asset 404)

- **Symptoms:** Browser shows blank white screen or 404 on `index-*.js` or `index-*.css`.
- **Verification:**
  1. Inspect browser console for MIME type or bundle 404 errors.
  2. Inspect Nginx container: `docker logs kinergy-staging-web`.
  3. Verify static asset folder exists inside container: `docker exec kinergy-staging-web ls -la /usr/share/nginx/html/assets`.
- **Safe Immediate Actions:**
  - Revert web container to previous working tag.
  - Purge edge CDN cache.
- **Recovery Steps:** Ensure build pipeline generates matching hashes and Nginx SPA fallback directive (`try_files $uri $uri/ /index.html`) is active.
- **Post-Incident Checks:** Load web application in private/incognito window across multiple desktop and mobile viewports.

---

### Scenario 3: Database Unavailable (Connection Refused / Pool Exhausted)

- **Symptoms:** API readiness probe returns 503 (`"database": "unavailable"`). API logs report `Can't reach database server at postgres:5432` or `PrismaClientInitializationError`.
- **Verification:**
  1. Inspect PostgreSQL container: `docker ps -f name=postgres`.
  2. Check PostgreSQL system logs: `docker logs --tail 100 kinergy-staging-postgres`.
  3. Check active connection count:
     ```sql
     SELECT count(*), state FROM pg_stat_activity GROUP BY state;
     ```
- **Safe Immediate Actions:**
  - If PostgreSQL container stopped, start it: `docker start kinergy-staging-postgres`.
  - If connection pool exhausted, terminate idle lingering connections:
    ```sql
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE state = 'idle' AND state_change < current_timestamp - INTERVAL '5 minutes';
    ```
- **Recovery Steps:** Increase `connection_limit` in Prisma `DATABASE_URL` or scale PgBouncer connection pooler.
- **Post-Incident Checks:** Verify `SELECT 1` latency < 10ms from within the API container.

---

### Scenario 4: Object Storage Unavailable (R2 Timeouts / Presigned URL Failures)

- **Symptoms:** Media uploads fail with 503 Service Unavailable. Client profile photos or clinical documents fail to display.
- **Verification:**
  1. Check Cloudflare status page for R2 service disruptions.
  2. Test R2 endpoint reachability: `curl -I https://${ACCOUNT_ID}.r2.cloudflarestorage.com`.
  3. Inspect API logs for AWS SDK S3 error codes (`RequestTimeout`, `InvalidAccessKeyId`).
- **Safe Immediate Actions:**
  - If Cloudflare R2 credentials expired or rotated incorrectly, re-inject valid `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.
- **Recovery Steps:** If persistent upstream provider outage occurs, configure API to fall back to secondary bucket or degraded mode (disabling file uploads while preserving text clinical records).
- **Post-Incident Checks:** Upload a synthetic test file via `POST /api/v1/storage/upload` and verify signed URL resolution.

---

### Scenario 5: Authentication Failure / Widespread User Logouts

- **Symptoms:** All users receive HTTP 401 Unauthorized despite entering valid credentials.
- **Verification:**
  1. Verify whether failure occurs on `/auth/login` (credential check) or protected routes (token validation).
  2. Inspect API logs for `JsonWebTokenError: invalid signature` or `TokenExpiredError`.
  3. Check system clock on host and API container: `docker exec kinergy-staging-api date`.
- **Safe Immediate Actions:**
  - If clock drift detected (> 30 seconds drift causes instant token expiration), synchronize host NTP: `w32tm /resync` or `chronyc makestep`.
  - If `JWT_ACCESS_SECRET` was unintentionally rotated without a grace period, re-inject previous secret.
- **Recovery Steps:** Restart API containers once secrets or NTP are corrected.
- **Post-Incident Checks:** Authenticate with synthetic user `reception@kinergy.test` and verify JWT validation across protected endpoints.

---

### Scenario 6: Excessive HTTP 500 Error Rates

- **Symptoms:** Monitoring alerts trigger on > 1% 5xx error rate over 3 minutes.
- **Verification:**
  1. Inspect aggregated error logs in `GlobalExceptionFilter`:
     ```bash
     docker logs --tail 200 kinergy-staging-api | grep "GlobalExceptionFilter"
     ```
  2. Identify specific endpoint throwing 500 errors (e.g. `/api/v1/sales` vs `/api/v1/clinical`).
- **Safe Immediate Actions:**
  - If isolated to a specific module due to recent release, hotfix or roll back release.
  - If caused by database lock contention, inspect blocked queries:
    ```sql
    SELECT pid, usename, query, state, age(clock_timestamp(), query_start)
    FROM pg_stat_activity
    WHERE state != 'idle' AND age(clock_timestamp(), query_start) > INTERVAL '5 seconds';
    ```
- **Recovery Steps:** Terminate blocking query: `SELECT pg_cancel_backend(pid);`.
- **Post-Incident Checks:** Ensure error rate drops back below 0.1%.

---

### Scenario 7: Failed Deployment (Container CrashLoopBackOff)

- **Symptoms:** Deployment pipeline fails. New API container continuously restarts and never transitions to healthy.
- **Verification:**
  1. Check exit code: `docker inspect kinergy-staging-api --format='{{.State.ExitCode}}'`.
  2. Inspect startup logs:
     ```bash
     docker logs kinergy-staging-api
     ```
  3. Look for configuration validation failure (`SecurityConfigurationException` or `ZodError` from `env.validation.ts`).
- **Safe Immediate Actions:**
  - Common cause: `DATABASE_URL` pointing to localhost in production mode (`SEC-03`), or `JWT_ACCESS_SECRET` shorter than 32 characters.
  - Correct the environment configuration in secret store.
- **Recovery Steps:** Roll back to previous container image until configuration is validated.
- **Post-Incident Checks:** Verify container uptime > 5 minutes without restarting.

---

### Scenario 8: Database Migration Failure

- **Symptoms:** CI/CD deployment halts at `prisma migrate deploy`. Staging or production database schema locked or in partial state.
- **Verification:**
  1. Check Prisma status:
     ```bash
     pnpm prisma migrate status
     ```
  2. Identify failed migration name and SQL error message.
- **Safe Immediate Actions:**
  - **DO NOT** execute manual un-tracked `ALTER TABLE` or `DROP TABLE` queries directly.
  - Inspect if migration locked on table:
    ```sql
    SELECT pid, relation::regclass, mode, granted FROM pg_locks WHERE NOT granted;
    ```
- **Recovery Steps:**
  - If failed cleanly without altering tables, mark rolled back: `pnpm prisma migrate resolve --rolled-back "<migration_name>"`.
  - Fix migration SQL script, test in isolated DB, and re-run.
  - If data corruption occurred, initiate Database Restore Runbook.
- **Post-Incident Checks:** Verify `pnpm prisma migrate status` reports `Database schema is up to date!`.

---

### Scenario 9: Data Integrity Incident (Conflicting Records / Corrupted Balances)

- **Symptoms:** Double-booking detected for same therapist/room, or sale inventory count does not match stock movements.
- **Verification:**
  1. Run domain integrity queries (e.g. find overlapping appointments):
     ```sql
     SELECT a1.id, a2.id, a1.therapist_id, a1.start_time, a1.end_time
     FROM appointments a1
     JOIN appointments a2 ON a1.therapist_id = a2.therapist_id AND a1.id <> a2.id
     WHERE a1.start_time < a2.end_time AND a1.end_time > a2.start_time;
     ```
- **Safe Immediate Actions:**
  - Restrict access to affected domain sub-resource if active transactions are worsening the corruption.
- **Recovery Steps:**
  - Apply idempotent reconciliation script within a single transaction.
  - Add missing unique index or database check constraint to permanently prevent recurrence.
- **Post-Incident Checks:** Re-run acceptance tests covering the affected aggregate.

---

### Scenario 10: Suspected Credential Exposure (JWT / DB Password Leak)

- **Symptoms:** Secret leaked in git commit, exposed in public logs, or unauthorized administrative action detected.
- **Verification:**
  1. Determine exact compromised secret: `DATABASE_URL`, `JWT_SECRET`, or `R2_SECRET_KEY`.
- **Safe Immediate Actions:**
  - **Immediate DB Password Rotation:**
    ```sql
    ALTER USER kinergy_app WITH PASSWORD '<new_secure_random_password>';
    ```
    Update secret in secret manager and restart API containers.
  - **Immediate JWT Secret Invalidation:**
    Rotate `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. This immediately revokes all active attacker and user tokens.
  - **Immediate Cloudflare R2 Key Revocation:**
    Delete compromised token in Cloudflare Dashboard; generate new access credentials.
- **Recovery Steps:** Perform security audit of access logs for unauthorized actions during exposure window.
- **Post-Incident Checks:** Verify all services connect successfully with new credentials and revoked credentials fail.

---

### Scenario 11: Backup or Restore Failure

- **Symptoms:** Automated backup script reports exit code 1. Checksum verification fails.
- **Verification:**
  1. Check disk space on backup mount: `df -h` or `Get-PSDrive`.
  2. Inspect backup log: `cat backups/staging/backup.log`.
- **Safe Immediate Actions:**
  - If disk full, purge backups older than retention window (7 days).
  - If `pg_dump` failed due to lock timeout or missing utility, execute backup via containerized fallback (`docker exec kinergy-staging-postgres pg_dump ...`).
- **Recovery Steps:** Re-run backup script manually and verify `.dump` and `.sha256` integrity.
- **Post-Incident Checks:** Verify backup file size > 50KB and checksum verification passes.
