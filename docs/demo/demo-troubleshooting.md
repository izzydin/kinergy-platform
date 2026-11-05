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

| Symptom Observed                                                                 | Likely Root Cause                                                  | Immediate Action                                          | Expected Recovery Time |
| :------------------------------------------------------------------------------- | :----------------------------------------------------------------- | :-------------------------------------------------------- | :--------------------: |
| `PrismaClientInitializationError: Can't reach database server at 127.0.0.1:5433` | Docker daemon paused, container stopped                            | Run `docker compose up -d postgres`                       |     $< 15$ seconds     |
| `Error: listen EADDRINUSE: address already in use :::3000`                       | Stale or zombie Node.js process on port 3000                       | Kill process via PowerShell command                       |     $< 10$ seconds     |
| `Error: listen EADDRINUSE: address already in use :::5173`                       | Orphaned Vite dev server on port 5173                              | Kill process via PowerShell command                       |     $< 10$ seconds     |
| Browser console: `Access to XMLHttpRequest blocked by CORS policy`               | Missing `CORS_ORIGINS` in `.env`                                   | Add `CORS_ORIGINS=http://localhost:5173...` & restart API |     $< 30$ seconds     |
| `401 Unauthorized` on login with demo credentials                                | Password hash mismatch or wrong password (`Demo123!`)              | Use `DemoPass123!` or run `pnpm db:seed`                  |     $< 20$ seconds     |
| Seed entity (Carlos Rivera or Protein Bar) missing                               | Seed pipeline not executed or altered                              | Run `pnpm db:seed` (idempotent upsert)                    |     $< 15$ seconds     |
| Live session interrupted or order left in invalid state                          | Rehearsal artifact or partial workflow                             | Cancel order in UI or re-run `pnpm db:seed`               |     $< 15$ seconds     |
| Terminal state prevents re-demonstrating same action                             | Completed SOAP notes or checked-in member                          | Execute disposable database reset                         |     $< 60$ seconds     |
| Browser cannot access `localhost:5173/login` during containerized demo           | Port 5173 belongs to Vite dev mode; container uses port 8080       | Navigate to `http://localhost:8080/login`                 |     $< 5$ seconds      |
| Clients module shows "Failed to load data / Failed to fetch"                     | Backend 502 exception during client hydration or 401 expired token | Inspect `logs demo-api` or re-authenticate at `/login`    |     $< 15$ seconds     |

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
  2. Clear browser LocalStorage at `http://localhost:8080` (Option B) or `http://localhost:5173` (Option A) (DevTools $\to$ Application $\to$ Clear Storage).
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

### Protocol 10: Nginx Upstream DNS Resolution Failure (`host not found in upstream "api"`)

- **Symptom:** `kinergy-demo-web` container crashes or continuously restarts with log:
  ```text
  [emerg] 1#1: host not found in upstream "api" in /etc/nginx/conf.d/default.conf:68
  nginx: [emerg] host not found in upstream "api"
  ```
- **Root Cause:**
  1. The API service in `docker-compose.demo.yml` is named `demo-api`, but the unprivileged Nginx configuration routes `/api` to `http://api:3000`. Docker internal DNS does not resolve `api` unless the service is aliased.
  2. Nginx resolves upstream hostnames statically at startup; if `demo-web` starts before `demo-api` is healthy on `kinergy-demo-network`, Nginx fails.
- **Diagnostics:**
  ```powershell
  # 1. Verify container status and health
  docker compose -f docker-compose.demo.yml ps

  # 2. Check network aliases on demo network
  docker network inspect kinergy_demo_network

  # 3. Test Nginx configuration syntax inside container
  docker exec kinergy-demo-web nginx -t
  ```
- **Recovery Procedure:**
  1. Ensure `docker-compose.demo.yml` defines the `api` alias and healthcheck dependency:
     ```yaml
     demo-api:
       networks:
         kinergy-demo-network:
           aliases:
             - api
     demo-web:
       depends_on:
         demo-api:
           condition: service_healthy
     ```
  2. Re-apply the Compose orchestration:
     ```powershell
     pnpm demo:up
     ```
  3. Verify web ingress:
     ```powershell
     curl -i http://localhost:8080/healthz
     curl -i http://localhost:8080/api/v1/health
     ```

---

### Protocol 11: Browser Connection Failure to localhost:5173 During Containerized Demo

- **Symptom:** Browser fails to load `http://localhost:5173/login` with `ERR_CONNECTION_REFUSED` while running the containerized demo (`pnpm demo:up`).
- **Root Cause:**
  Port 5173 is the port of the host-level Vite development server used only in **Option A (Hybrid Dev Stack)**. When running **Option B (Dedicated Containerized Demo Stack)** via `pnpm demo:up`, Vite is not running on the host; instead, the pre-built React SPA is served through Nginx inside the `kinergy-demo-web` container on **port 8080**.
- **Diagnostics:**
  1. Verify running containers:
     ```powershell
     docker compose -f docker-compose.demo.yml ps
     ```
  2. Probe Nginx ingress health:
     ```powershell
     curl -i http://localhost:8080/healthz
     ```
- **Recovery Procedure:**
  1. Open the browser and navigate directly to:
     ```text
     http://localhost:8080/login
     ```
  2. If running Option A (local Vite dev server) instead, ensure `pnpm dev:web` is running in a terminal before attempting to access port 5173.

---

### Protocol 12: Clients Module Data Fetch Failure (`Failed to load data`)

- **Symptom:** Opening `/clients` displays an error banner: `Failed to load data — Failed to fetch` or HTTP 502 Bad Gateway.
- **Root Cause & Diagnosis:**
  1. **Backend Unhandled Domain Exception (502)**: The API process threw an unhandled domain validation exception (e.g. `Invalid ClientId: '<id>' is not a valid UUID format`) during entity reconstitution in `ClientMapper.toDomain`, crashing the Node.js process and causing Nginx to return 502 Bad Gateway.
     - Inspect recent API error traces:
       ```powershell
       docker compose -f docker-compose.demo.yml logs --tail=100 demo-api
       ```
  2. **Authentication / Session Expiration (401)**: The browser session expired or the JWT token was invalidated.
     - Inspect Network tab in DevTools for `GET /api/v1/clients`: if 401 Unauthorized, log out and sign back in.
- **Recovery Procedure:**
  1. Verify the 3 demo containers are healthy:
     ```powershell
     docker compose -f docker-compose.demo.yml ps
     ```
  2. Test direct API health and Nginx ingress:
     ```powershell
     curl -i http://localhost:8080/api/v1/health
     ```
  3. Rebuild and restart the API container image if code changes were made:
     ```powershell
     docker compose -f docker-compose.demo.yml up -d --build demo-api
     ```
  4. Test authenticated client retrieval via PowerShell:
     ```powershell
     $login = @{ email = 'reception.demo@kinergy.platform'; password = 'DemoPass123!' } | ConvertTo-Json
     $auth = Invoke-RestMethod -Uri 'http://localhost:8080/api/v1/auth/login' -Method Post -ContentType 'application/json' -Body $login
     Invoke-RestMethod -Uri 'http://localhost:8080/api/v1/clients' -Method Get -Headers @{ Authorization = "Bearer $($auth.accessToken)" }
     ```

---

## 3. Browser & Session Hygiene Checklist

- **Use Private / Incognito Windows**: Always open the demo in a fresh Chrome Incognito or Edge InPrivate window to avoid stale cookies, cached tokens, or third-party browser extensions interfering with UI rendering.
- **Multi-Role Simulation**: Open two separate browser profiles or browsers when demonstrating role transitions (e.g. Chrome for Receptionist, Edge for Clinical Therapist) rather than repeatedly logging in and out.
- **Zoom Level**: Set browser zoom to 100% to ensure table columns, badges, and responsive drawers render at optimal proportions.
