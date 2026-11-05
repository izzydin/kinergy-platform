# Kinergy Platform — MVP Demonstration Pre-Flight Readiness Checklist

**Document ID:** `DOC-CHK-011`  
**Milestone:** 11.2 — Professional MVP Demo Documentation  
**Version:** `1.0.0`  
**Status:** **ACTIVE**  
**Document Ownership:** QA Lead, Platform Operations Lead, Presenter Lead  
**Last Verified Date:** 2026-11-05  
**Companion Manual:** [MVP Demo Environment Guide](../development/mvp-demo-environment-guide.md)

---

## 1. Purpose & Verification Protocol

This checklist governs the formal "Go / No-Go" verification protocol executed prior to any business-facing or stakeholder demonstration of the **Kinergy Platform**. Every gate must be signed off by the presenter and platform engineer before starting the demonstration.

---

## 2. Four-Phase Verification Gates

### Phase 1: Host Runtime & Environment Configuration

|  #  | Check Item               | Verification Command / Target                      | Pass Criteria                                   | Sign-Off |
| :-: | :----------------------- | :------------------------------------------------- | :---------------------------------------------- | :------: |
| 1.1 | **Node.js Runtime**      | `node -v`                                          | Version $\ge 20.12.0$ (Host active: `v24.12.0`) |   [ ]    |
| 1.2 | **pnpm Package Manager** | `pnpm -v`                                          | Version $\ge 10.0.0$ (Host active: `v11.17.0`)  |   [ ]    |
| 1.3 | **Environment File**     | `Test-Path .env`                                   | File exists at workspace root                   |   [ ]    |
| 1.4 | **CORS Configuration**   | `Get-Content .env \| Select-String "CORS_ORIGINS"` | Contains `http://localhost:5173`                |   [ ]    |
| 1.5 | **JWT Secrets Length**   | `Get-Content .env \| Select-String "JWT_"`         | Access & Refresh secrets $\ge 32$ characters    |   [ ]    |
| 1.6 | **Port Configuration**   | `Get-Content .env \| Select-String "PORT"`         | `PORT=3000`, `POSTGRES_PORT=5433` (or 5432)     |   [ ]    |

---

### Phase 2: Database Persistence & Fixtures

|  #  | Check Item                   | Verification Command / Target                                                | Pass Criteria                                                             | Sign-Off |
| :-: | :--------------------------- | :--------------------------------------------------------------------------- | :------------------------------------------------------------------------ | :------: |
| 2.1 | **PostgreSQL Service**       | `& "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -h 127.0.0.1 -p 5433` | Returns `accepting connections`                                           |   [ ]    |
| 2.2 | **Prisma Migration State**   | `pnpm prisma:migrate:status`                                                 | All 14 migrations applied, schema in sync                                 |   [ ]    |
| 2.3 | **Prisma Client Sync**       | `pnpm prisma:generate`                                                       | Client generated successfully                                             |   [ ]    |
| 2.4 | **Baseline Fixture Seeding** | `pnpm db:seed`                                                               | Exits with code 0; summary confirms users, plans, rooms, inventory seeded |   [ ]    |
| 2.5 | **Database User Accounts**   | Check user count in seed summary                                             | 4 staff personas + default Owner initialized                              |   [ ]    |

---

### Phase 3: Application Health & Network Connectivity

|  #  | Check Item               | Verification Command / Target              | Pass Criteria                                            | Sign-Off |
| :-: | :----------------------- | :----------------------------------------- | :------------------------------------------------------- | :------: |
| 3.1 | **Backend API Startup**  | `pnpm dev:api` (Terminal 1)                | Listens on `http://localhost:3000/api/v1` without errors |   [ ]    |
| 3.2 | **API Health Probe**     | `curl http://localhost:3000/api/v1/health` | HTTP 200, `{"status":"ok"}`                              |   [ ]    |
| 3.3 | **OpenAPI Swagger Spec** | Browser: `http://localhost:3000/api/docs`  | Swagger UI loads all domain endpoints                    |   [ ]    |
| 3.4 | **Frontend SPA Startup** | `pnpm dev:web` (Terminal 2)                | Listens on `http://localhost:5173`                       |   [ ]    |
| 3.5 | **SPA Root Route**       | Browser: `http://localhost:5173`           | Login page renders with clean browser console            |   [ ]    |
| 3.6 | **Browser CORS Check**   | Inspect Network tab during login           | No CORS preflight or header rejections                   |   [ ]    |

---

### Phase 4: Presenter Journey Dry-Run (5-Minute Smoke Test)

|  #  | Check Item                      | Verification Action                                           | Pass Criteria                                     | Sign-Off |
| :-: | :------------------------------ | :------------------------------------------------------------ | :------------------------------------------------ | :------: |
| 4.1 | **Receptionist Authentication** | Sign in as `reception.demo@kinergy.platform` / `DemoPass123!` | Successfully navigates to dashboard               |   [ ]    |
| 4.2 | **Client Profile Lookup**       | Search for Carlos Rivera (`CLI-2026-00003`)                   | Profile renders with timeline history             |   [ ]    |
| 4.3 | **Turnstile Access Check**      | Check in John Smith (`CLI-2026-00002`) at `/gym/attendance`   | Green `GRANTED` badge displayed                   |   [ ]    |
| 4.4 | **Therapist Authentication**    | Sign in as `therapist.demo@kinergy.platform` / `DemoPass123!` | Successfully navigates to clinical sessions       |   [ ]    |
| 4.5 | **Clinical Encounter Lookup**   | Open completed session for Jane Doe (`CLI-2026-00001`)        | SOAP notes display locked read-only view          |   [ ]    |
| 4.6 | **Inventory Stock Check**       | Open `/resources/inventory/low-stock`                         | Kinesiology Tape (`SKU-CLIN-BAND-01`) alert shown |   [ ]    |
| 4.7 | **Sales Order & Payment**       | Verify `/sales` order list renders previous settled sales     | Order history and receipt buttons active          |   [ ]    |

---

## 3. Demonstration Decision Gate

```
[ ] GO          All 24 verification items signed off. Environment is ready for stakeholder demonstration.
[ ] NO-GO       One or more blockers detected. Refer to demo-troubleshooting.md for recovery protocol.
```

**Evaluator Signature:** ___________________________  
**Date & Time:** ___________________________________  
**Evaluation Target:** Presenter Laptop / Controlled Evaluation Room
