# Operational Ownership Matrix

**Role / Responsibility:** Principal Site Reliability Engineer, Database Reliability Engineer, and Technical Documentation Lead  
**Last Updated:** November 5, 2026  
**Status:** ACTIVE & APPROVED  
**Scope:** Kinergy Platform (API, Web, Database, Object Storage, Ingress, Security, and Incident Management).

---

## 1. Purpose & Principles

This Operational Ownership Matrix defines the explicit operational roles, accountabilities, and approval boundaries across the lifecycle of the Kinergy Platform.

Operational accountability follows the **RACI** model:

- **R - Responsible:** The role that executes the task or procedure.
- **A - Accountable:** The single individual or role with decision and sign-off authority.
- **C - Consulted:** Subject matter experts providing input prior to execution.
- **I - Informed:** Stakeholders kept updated on status and outcomes.

---

## 2. Operational Roles

1. **Application Owner (Tech Lead / Principal Architect):**  
   Accountable for application code health, business logic integrity, architectural compliance, release approval, and hotfix authorization.
2. **Platform / DevOps Engineer:**  
   Responsible for container build/push pipelines, Docker compose / container orchestration, Nginx reverse proxy, network ingress, and compute infrastructure.
3. **Database Reliability Engineer / DBA:**  
   Accountable for PostgreSQL schema migrations, least-privilege role management, connection pooling, automated backups, restore drills, and query performance.
4. **Cloud Storage Administrator:**  
   Responsible for Cloudflare R2 / S3 storage bucket configuration, tenant isolation policies, presigned URL lifespan, and lifecycle management.
5. **Security / DevSecOps Engineer:**  
   Accountable for secret management, vulnerability triage, TLS/HTTPS configuration, RBAC invariants, and security compliance verification.
6. **Site Reliability Engineer (SRE) / Incident Commander:**  
   Responsible for 24/7 uptime monitoring, alert triage, incident response coordination, post-mortem leadership, and disaster recovery execution.
7. **Business Owner (Clinic Director / General Manager):**  
   Accountable for final business acceptance, maintenance window approval, data governance policies, and customer communication during outages.

---

## 3. RACI Ownership Matrix

| Operational Area                   | Specific Procedure / Task              | Responsible (R)     | Accountable (A)    | Consulted (C)      | Informed (I)      |
| :--------------------------------- | :------------------------------------- | :------------------ | :----------------- | :----------------- | :---------------- |
| **Application Deployment**         | Staging Deployment                     | DevOps              | Application Owner  | DBA, SRE           | Business Owner    |
|                                    | Production Deployment Execution        | DevOps              | Application Owner  | SRE, DBA           | Business Owner    |
|                                    | Emergency Hotfix Deployment            | DevOps / Tech Lead  | Application Owner  | SRE                | Business Owner    |
|                                    | Rollback Execution                     | DevOps / SRE        | Incident Commander | Application Owner  | Business Owner    |
| **Database Administration**        | Staging Schema Migrations              | DevOps / Developer  | DBA                | Application Owner  | -                 |
|                                    | Production Schema Migrations           | DBA                 | DBA                | Application Owner  | SRE, DevOps       |
|                                    | PostgreSQL Role & Privilege Grants     | DBA                 | Security Engineer  | Application Owner  | DevOps            |
|                                    | Database Performance & Indexing        | DBA                 | DBA                | Application Owner  | SRE               |
| **Object Storage**                 | Bucket Provisioning & Configuration    | Cloud Storage Admin | Platform Owner     | Security Engineer  | Application Owner |
|                                    | Storage Quota & Lifecycle Rules        | Cloud Storage Admin | Platform Owner     | DBA                | Business Owner    |
|                                    | Storage Incident Recovery              | Cloud Storage Admin | Incident Commander | Application Owner  | SRE               |
| **Secret Management**              | JWT / Secret Key Generation            | Security Engineer   | Security Engineer  | Application Owner  | DevOps            |
|                                    | Production Secret Injection & Rotation | Security Engineer   | Platform Owner     | Application Owner  | SRE               |
|                                    | Suspected Secret Compromise Response   | Security Engineer   | Incident Commander | Application Owner  | Business Owner    |
| **Monitoring & Incident Response** | Uptime Alert Triage & Response         | SRE (On-Call)       | Incident Commander | DevOps, DBA        | Application Owner |
|                                    | Incident Post-Mortem                   | SRE                 | Incident Commander | All Engineers      | Business Owner    |
| **Backup & Recovery**              | Daily Database Backup Validation       | DBA                 | DBA                | SRE                | DevOps            |
|                                    | Periodic Restore Drill Execution       | DBA                 | SRE                | Application Owner  | Business Owner    |
|                                    | Disaster Recovery Cutover              | Incident Commander  | Platform Owner     | DBA, DevOps        | Business Owner    |
| **Security Maintenance**           | Dependency Vulnerability Audits        | Security Engineer   | Application Owner  | DevOps             | Tech Lead         |
|                                    | TLS Certificate Management             | DevOps              | Security Engineer  | SRE                | Application Owner |
| **Business Acceptance**            | Staging User Acceptance Testing        | Business Owner      | Business Owner     | Application Owner  | All Stakeholders  |
|                                    | Maintenance Window Authorization       | Business Owner      | Business Owner     | Incident Commander | All Stakeholders  |

---

## 4. Operational Boundaries & Delegation Rules

1. **Production Migrations Require DBA Sign-Off:**  
   No database migration may be executed against production without prior review by the DBA and an automated backup created immediately prior to execution.
2. **Reversible vs Irreversible Operations:**
   - Reversible operations (e.g. rolling back a stateless container image) may be executed autonomously by the on-call SRE or DevOps engineer.
   - Irreversible operations (e.g. restoring a database snapshot, dropping a table, purging storage) require joint authorization from the Incident Commander and Application Owner.
3. **Separation of Staging and Production Credentials:**  
   No engineering role retains persistent production database credentials on local developer workstations. Production access is governed strictly through ephemeral bastion sessions or CI/CD runner service accounts.
