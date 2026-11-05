# Monitoring, Alerting, and Maintenance Guide

**Role / Responsibility:** Principal Site Reliability Engineer and Systems Administrator  
**Last Updated:** November 5, 2026  
**Status:** ACTIVE & APPROVED  
**Scope:** Telemetry, Health Metrics, Alert Thresholds, and Routine Maintenance Procedures.

---

## 1. Operational Telemetry & Health Probes

Kinergy provides decoupled, multi-tier health endpoints to ensure high availability and prevent cascading reboot loops.

### Health Probes Matrix

| Endpoint                           | Target Component       | Mechanism                                          | Expected Output                                          | Orchestration Role                  |
| :--------------------------------- | :--------------------- | :------------------------------------------------- | :------------------------------------------------------- | :---------------------------------- |
| **`GET /healthz`**                 | Nginx Ingress          | Local static response in Nginx                     | `200 "healthy\n"`                                        | Ingress Controller Liveness         |
| **`GET /api/v1/health/liveness`**  | NestJS Node.js Process | In-memory event loop & memory check (0 DB queries) | `200 {"status":"ok","uptime":...}`                       | Pod/Container Liveness (K8s/Docker) |
| **`GET /api/v1/health/readiness`** | PostgreSQL Dependency  | Executes `SELECT 1` with 2000ms timeout            | `200 {"status":"ok","database":"ready","latencyMs":...}` | Traffic Routing / Ingress Readiness |
| **`GET /api/v1/health`**           | General Health         | Aggregated Node + DB status                        | `200` (OK) or `503` (Degraded)                           | Operations Dashboard                |

---

## 2. Metric Thresholds & Alerting Rules

All alert thresholds are derived from empirical baseline performance measured during acceptance testing and load profiles.

| Metric                     | Measurement Scope                  | Warning Threshold   | Critical Threshold                | Justification & Action                                                                              |
| :------------------------- | :--------------------------------- | :------------------ | :-------------------------------- | :-------------------------------------------------------------------------------------------------- |
| **API Readiness**          | `/health/readiness`                | 1 probe failure     | 3 consecutive failures (over 30s) | Isolates container from receiving traffic; prevents serving 500 errors to clients.                  |
| **API Latency (p95)**      | HTTP Response Time                 | > 500ms over 5 min  | > 1,500ms over 3 min              | Baseline measured at < 45ms. Indicates unindexed query or high connection contention.               |
| **HTTP 5xx Error Rate**    | % of total requests                | > 0.5% over 5 min   | > 2.0% over 2 min                 | SRE on-call paged. Check `GlobalExceptionFilter` logs for unhandled errors.                         |
| **DB Connection Pool**     | Active / Max connections           | > 70% pool capacity | > 85% pool capacity               | Default pool is 10 connections. High usage indicates connection leaks or long-running transactions. |
| **DB Query Latency**       | `SELECT 1` ping latency            | > 50ms              | > 200ms                           | Baseline measured at 1-3ms. Indicates disk I/O bottleneck or CPU throttling.                        |
| **Disk Utilization**       | PostgreSQL volume & backup disk    | > 75% full          | > 85% full                        | Running out of disk halts WAL writes and crashes PostgreSQL (`PANIC: could not write to file`).     |
| **Backup Recency**         | Time since last successful `.dump` | > 26 hours          | > 36 hours                        | Daily backup failed or missed schedule. Requires immediate DBA investigation.                       |
| **TLS Certificate Expiry** | Days until HTTPS cert expires      | < 30 days remaining | < 7 days remaining                | Let's Encrypt auto-renews at 30 days. Alert indicates ACME DNS/HTTP challenge failure.              |

---

## 3. Routine Maintenance Procedures

### 3.1 Database Maintenance (Weekly / Off-Peak)

Execute during off-peak hours (Sundays 03:00 UTC):

1. **Analyze Schema Statistics:**
   ```sql
   ANALYZE VERBOSE;
   ```
2. **Inspect Bloat and Index Health:**
   ```sql
   SELECT schemaname, relname, n_dead_tup, n_live_tup,
          round(n_dead_tup * 100.0 / nullif(n_live_tup + n_dead_tup, 0), 2) as dead_ratio
   FROM pg_stat_user_tables
   WHERE n_dead_tup > 1000
   ORDER BY dead_ratio DESC;
   ```
3. **Vacuum Dead Tuples:** Auto-vacuum is enabled by default in PostgreSQL 16. If dead ratio exceeds 20% on high-churn tables (`appointments`, `stock_movements`), trigger targeted vacuum:
   ```sql
   VACUUM ANALYZE appointments;
   ```

### 3.2 Certificate Renewal Verification (Monthly)

1. In production (Cloudflare Edge / Let's Encrypt), verify certificate validity:
   ```bash
   echo | openssl s_client -servername kinergy.app -connect kinergy.app:443 2>/dev/null | openssl x509 -noout -dates
   ```
2. If cert validity < 14 days and automatic renewal has not triggered, force renewal:
   ```bash
   certbot renew --force-renewal
   ```

### 3.3 Dependency Vulnerability & Security Updates (Monthly)

1. Run automated vulnerability scan:
   ```bash
   pnpm audit --prod
   ```
2. For patch updates to core libraries:
   ```bash
   pnpm update --depth 1
   pnpm validate
   ```
3. Rebuild base Docker images (`node:20-alpine`, `postgres:16-alpine`, `nginx:alpine`) to ingest upstream Alpine Linux security fixes.
