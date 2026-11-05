# Kinergy Platform — MVP Demonstration Troubleshooting & Fast Recovery Guide

**Document ID:** `DOC-TRB-011`  
**Milestone:** 11.2 — Professional MVP Demo Documentation  
**Version:** `1.0.0`  
**Status:** **ACTIVE**  
**Document Ownership:** Platform Operations Lead, Presenter Lead, Senior QA Engineer  
**Last Verified Date:** 2026-11-05  
**Companion Manuals:** [MVP Demo Guide](../development/mvp-demo-environment-guide.md), [Readiness Checklist](demo-readiness-checklist.md)

---

## 1. Fast Incident Triage Matrix

During live presentations or stakeholder rehearsals, operational incidents must be diagnosed and resolved rapidly. Use the diagnostic matrix below:

| Symptom Observed                                                                 | Likely Root Cause                                     | Immediate Action                                          | Expected Recovery Time |
| :------------------------------------------------------------------------------- | :---------------------------------------------------- | :-------------------------------------------------------- | :--------------------: |
| `PrismaClientInitializationError: Can't reach database server at 127.0.0.1:5433` | Docker daemon paused, container stopped               | Run `docker compose up -d postgres`                       |     $< 15$ seconds     |
| `Error: listen EADDRINUSE: address already in use :::3000`                       | Stale or zombie Node.js process on port 3000          | Kill process via PowerShell command                       |     $< 10$ seconds     |
| `Error: listen EADDRINUSE: address already in use :::5173`                       | Orphaned Vite dev server on port 5173                 | Kill process via PowerShell command                       |     $< 10$ seconds     |
| Browser console: `Access to XMLHttpRequest blocked by CORS policy`               | Missing `CORS_ORIGINS` in `.env`                      | Add `CORS_ORIGINS=http://localhost:5173...` & restart API |     $< 30$ seconds     |
| `401 Unauthorized` on login with demo credentials                                | Password hash mismatch or wrong password (`Demo123!`) | Use `DemoPass123!` or run `pnpm db:seed`                  |     $< 20$ seconds     |
| Seed entity (Carlos Rivera or Protein Bar) missing                               | Seed pipeline not executed or altered                 | Run `pnpm db:seed` (idempotent upsert)                    |     $< 15$ seconds     |
| Live session interrupted or order left in invalid state                          | Rehearsal artifact or partial workflow                | Cancel order in UI or re-run `pnpm db:seed`               |     $< 15$ seconds     |
| Terminal state prevents re-demonstrating same action                             | Completed SOAP notes or checked-in member             | Execute disposable database reset                         |     $< 60$ seconds     |

---

## 2. Detailed Recovery Protocols

### Protocol 1: PostgreSQL Database Unavailable

- **Diagnostic Command:**
  ```powershell
  & "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -h 127.0.0.1 -p 5433
  ```
- **Recovery Steps:**
  1. Inspect container status:
     ```powershell
     docker ps -a --filter name=kinergy-postgres
     ```
  2. Start container if stopped:
     ```powershell
     docker compose up -d postgres
     ```
  3. If Docker Desktop reports daemon not running, launch Docker Desktop from the Windows Start menu, wait 20 seconds, and retry.
  4. Test readiness again. Once `accepting connections` is returned, restart the backend API.

---

### Protocol 2: Port Collision on Port 3000 (Backend API)

- **Root Cause:** A previously terminated `pnpm dev:api` session left an orphaned Node process holding TCP port 3000.
- **Recovery Command:**
  ```powershell
  # Find and terminate process holding port 3000
  $processId = (Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue).OwningProcess
  if ($processId) { Stop-Process -Id $processId -Force }

  # Clear Nx cache and restart API
  npx nx reset
  pnpm dev:api
  ```

---

### Protocol 3: Port Collision on Port 5173 (Frontend Web App)

- **Root Cause:** A running Vite process is occupying port 5173.
- **Recovery Command:**
  ```powershell
  # Find and terminate process holding port 5173
  $processId = (Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue).OwningProcess
  if ($processId) { Stop-Process -Id $processId -Force }

  # Remove Vite local cache if needed and restart
  Remove-Item -Recurse -Force apps/web/node_modules/.vite -ErrorAction SilentlyContinue
  pnpm dev:web
  ```

---

### Protocol 4: Browser CORS Preflight Rejection

- **Root Cause:** The backend API defaults `CORS_ORIGINS` to `http://localhost:4200` when omitted from `.env`. The Vite frontend runs on `http://localhost:5173`.
- **Recovery Steps:**
  1. Open `.env` and verify the `CORS_ORIGINS` variable:
     ```ini
     CORS_ORIGINS=http://localhost:5173,http://localhost:4200,http://localhost:8080
     CORS_ALLOW_CREDENTIALS=true
     ```
  2. Save `.env`.
  3. Restart the backend API (`Ctrl + C` in Terminal 1, then `pnpm dev:api`).

---

### Protocol 5: Authentication & Demo Credential Rejection

- **Root Cause:** Using `Demo123!` instead of `DemoPass123!`, or JWT secret mismatch.
- **Authoritative Credentials:**
  - Receptionist: `reception.demo@kinergy.platform` / `DemoPass123!`
  - Clinical Therapist: `therapist.demo@kinergy.platform` / `DemoPass123!`
  - Inventory Staff: `inventory.demo@kinergy.platform` / `DemoPass123!`
  - Platform Owner: `owner@kinergy.platform` / `OwnerPassword123!`
- **Recovery Steps:**
  1. Re-seed identity accounts:
     ```powershell
     pnpm db:seed
     ```
  2. Clear browser LocalStorage at `http://localhost:5173` (DevTools $\to$ Application $\to$ Clear Storage).
  3. Log in with `DemoPass123!`.

---

### Protocol 6: Non-Destructive Demo Baseline Restoration

- **Use Case:** A previous test run completed a clinical session or checked in a client, and the presenter needs to return to the original clean state without dropping database tables.
- **Recovery Command:**
  ```powershell
  # Executes idempotent upserts across all entities
  pnpm db:seed
  ```
- **What this does:**
  - Re-asserts baseline inventory stock quantities (Protein Bar: 42, Electrolyte Drink: 36, Tape: 3).
  - Re-activates client status and membership links.
  - Re-synchronizes standard demo passwords.

---

### Protocol 7: Complete Disposable Database Reset (Rehearsal Cleanup)

- **Use Case:** Live presentation rehearsal produced numerous test orders and check-ins that clutter the UI, and a pristine database is required before the client meeting.

> [!CAUTION]
> **Data Loss Warning:** This command completely destroys the local demo database volume on port 5433. Never execute against staging or production databases.

- **Recovery Protocol:**
  ```powershell
  # 1. Stop and remove persistent database volume
  docker compose down -v

  # 2. Start clean PostgreSQL container
  docker compose up -d postgres

  # 3. Wait for database readiness (5 seconds)
  Start-Sleep -Seconds 5
  & "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -h 127.0.0.1 -p 5433

  # 4. Apply all 14 migrations
  pnpm prisma:migrate:deploy

  # 5. Seed baseline demo fixtures
  pnpm db:seed
  ```
- **Expected Result:** Database is returned to a 100% clean baseline in under 45 seconds.

---

### Protocol 8: Containerized Demo Stack Triage (`docker-compose.demo.yml`)

- **Use Case:** When running the fully containerized demo stack (`pnpm demo:up`), diagnose container state, view logs, or rebuild images.
- **Diagnostics & Recovery:**
  ```powershell
  # 1. View live logs across all 3 containers
  docker compose -f docker-compose.demo.yml logs -f

  # 2. View specific service logs (e.g. API)
  docker compose -f docker-compose.demo.yml logs -f demo-api

  # 3. Check container health status
  docker compose -f docker-compose.demo.yml ps

  # 4. Rebuild containers after code adjustments
  docker compose -f docker-compose.demo.yml up -d --build

  # 5. Clean disposable reset of container stack and volumes
  pnpm demo:reset
  pnpm demo:up
  pnpm prisma:migrate:deploy
  pnpm db:seed
  ```

---

### Protocol 9: Inventory & Financial Failure Recovery

During live POS or inventory demonstrations, simulated negative scenarios or operational errors must be recovered without losing context:

1. **Recovering from Failed / Declined Payments**:
   - If a QR payment is marked `FAILED` or declined by external bank authorization:
     - The failed payment record is retained in the payment history for auditability.
     - The parent Sale status remains in `PENDING_PAYMENT` (or `PARTIALLY_PAID`).
     - Click **Record Payment** to retry with another tender method (e.g., Cash) or re-attempt QR tender with an updated merchant reference.
2. **Recovering from Insufficient Stock Overdraft**:
   - If POS checkout fails with `HTTP 422 (Insufficient stock on hand)`:
     - The cart is preserved; no partial stock is deducted.
     - In another tab (as Inventory Staff), navigate to `/resources/inventory` and click **Receive Stock** on the item to replenish inventory.
     - Switch back to POS and click **Create Order** again. Checkout will succeed immediately.
3. **Recovering from Concurrency Conflicts / Duplicate Submissions**:
   - If a `409 Conflict` banner appears due to concurrent submission or double-clicking:
     - The UI form preserves all entered data.
     - Click **Refresh Status** or close the collision alert; the backend guarantees that exactly one order or payment was persisted without balance corruption.
4. **Cancelled Orders & Terminal State Isolation**:
   - If an order in `PENDING_PAYMENT` is accidentally cancelled:
     - Cancelled orders are terminal and read-only.
     - Click **New Sale** (`/sales/new`) to quickly generate a fresh order; previous stock and payment history remain intact and uncorrupted.

---

## 3. Browser & Session Hygiene Checklist

- **Use Private / Incognito Windows**: Always open the demo in a fresh Chrome Incognito or Edge InPrivate window to avoid stale cookies, cached tokens, or third-party browser extensions interfering with UI rendering.
- **Multi-Role Simulation**: Open two separate browser profiles or browsers when demonstrating role transitions (e.g. Chrome for Receptionist, Edge for Clinical Therapist) rather than repeatedly logging in and out.
- **Zoom Level**: Set browser zoom to 100% to ensure table columns, badges, and responsive drawers render at optimal proportions.
