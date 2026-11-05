# Kinergy Platform — Production Operations and Runbooks

**Role / Responsibility:** Principal Site Reliability Engineer, Database Reliability Engineer, and Technical Documentation Lead  
**Last Updated:** November 5, 2026  
**Status:** COMPLETE & EMPIRICALLY VERIFIED  
**Scope:** Staging and Production Operational Procedures for Kinergy.

---

## 1. Directory Structure & Operations Navigation

This directory contains the operational runbooks, disaster recovery procedures, and maintenance specifications for the Kinergy Platform.

| Document                                                                                      | Primary Audience               | Scope / Purpose                                                                             |
| :-------------------------------------------------------------------------------------------- | :----------------------------- | :------------------------------------------------------------------------------------------ |
| **[Operational Ownership Matrix](./operational-ownership-matrix.md)**                         | Tech Lead, DevOps, DBA, SRE    | RACI matrix defining roles, authorities, and operational boundaries.                        |
| **[Environment Architecture](./environment-architecture.md)**                                 | Platform Engineers, Architects | Multi-tier topology, container ports, network traffic directions, and security firewalls.   |
| **[Deployment Runbook](./deployment-runbook.md)**                                             | DevOps, Release Engineers      | 15-step executable deployment procedure, pre-flight checks, and rollback criteria.          |
| **[Database Migration & Recovery](./database-migration-and-recovery-procedure.md)**           | DBA, Backend Engineers         | Least-privilege migration execution, expand-and-contract policy, and failure recovery.      |
| **[Backup Policy](./backup-policy.md)**                                                       | DBRE, Cloud Storage Admin      | RPO/RTO objectives, retention schedules, encryption, and object storage consistency.        |
| **[Restore Procedure & Evidence](./database-and-storage-restore-procedure.md)**               | SRE, DBA, Incident Commander   | Executable restore steps and empirical verification evidence (**1.311s restore duration**). |
| **[Rollback Strategy](./rollback-strategy.md)**                                               | DevOps, SRE                    | Reversibility matrix and procedures across Web, API, Ingress, Secrets, and Database.        |
| **[Incident Response & Troubleshooting](./incident-response-and-troubleshooting-runbook.md)** | On-Call Engineers, SRE         | 11 comprehensive runbooks for service outages, data corruption, and security incidents.     |
| **[Monitoring & Maintenance](./monitoring-and-maintenance-guide.md)**                         | SRE, Systems Administrators    | Health probes, telemetry thresholds, database vacuuming, and certificate renewal.           |

---

## 2. Empirical Verification Summary (Milestone 10.9)

In accordance with SRE golden rules ("Never document an unverified command as a proven procedure"), the following procedures were executed and verified against real staging infrastructure:

1. **Automated Staging Database Backup:**
   - Script: `powershell -File ./infrastructure/scripts/backup-staging-db.ps1`.
   - Result: Generated custom-format dump (`114,985 bytes`) and SHA256 checksum file.
   - Status: **VERIFIED PASS**.
2. **Controlled Isolated Database Restore:**
   - Script: `powershell -File ./infrastructure/scripts/restore-staging-db.ps1`.
   - Target: Isolated database `kinergy_staging_restore_test` created specifically for the test.
   - Duration: **1.311 seconds** (Measured via `Measure-Command`).
   - Validation: 14/14 Prisma migrations present, 28/28 tables restored, representative record counts verified (Users: 2, Clients: 12, Roles: 2, Plans: 1, Inventory: 1, Sales: 1).
   - Status: **VERIFIED PASS**.
3. **Health Probe Decoupling:**
   - Liveness probe (`/health/liveness`) verified to respond 200 OK with zero database overhead.
   - Readiness probe (`/health/readiness`) verified to ping PostgreSQL with 2000ms timeout and report latency.
   - Status: **VERIFIED PASS**.

---

## 3. Register of Unverified Operational Procedures

The following procedures are documented based on cloud industry best practices and architecture specifications, but **cannot be executed or verified locally** until production cloud infrastructure and third-party provider accounts are provisioned:

| Procedure ID  | Procedure Description                                                                   | Reason Execution Was Deferred                                                                             | Required Verification Gate                     |
| :------------ | :-------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------- | :--------------------------------------------- |
| **UNV-OP-01** | Production Multi-Region DNS Failover (Cloudflare Traffic Steering)                      | Requires active public domain names, live Anycast IPs, and production DNS nameservers.                    | Milestone 10.10 (Production Cutover Rehearsal) |
| **UNV-OP-02** | AWS KMS Hardware Security Module (HSM) Customer Master Key (CMK) Rotation               | Requires paid AWS account with KMS dedicated key access. Staging uses software encryption.                | Milestone 10.10                                |
| **UNV-OP-03** | Multi-Terabyte Point-in-Time Recovery from Cloud Cold Storage (Glacier / R2 Infrequent) | Staging database is ~115KB; large-scale multi-terabyte streaming cannot be simulated locally.             | Milestone 10.10 / Pre-Launch Soak              |
| **UNV-OP-04** | Live Banking QR / Card Webhook Outage Auto-Reconciliation                               | Requires live production credentials and merchant agreements with bank webhook gateways.                  | Commercial Merchant Onboarding                 |
| **UNV-OP-05** | Production Zero-Downtime Blue/Green Kubernetes Ingress Switchover                       | Local environment uses Docker Compose; Kubernetes cluster provisioning is planned for production hosting. | Production Infrastructure Provisioning         |

> [!IMPORTANT]
> All unverified procedures must be treated as **operational dependencies** and must undergo a live dry-run during Milestone 10.10 before taking production traffic.
