# Milestone 10.3 — API and Web Containerization Verification Report

**Date:** 2026-11-03  
**Status:** COMPLETE (VERIFIED & ACCEPTED)  
**Target:** Local Docker Engine / Container Runtime  
**Lead Engineer:** Principal DevOps Engineer & Senior Platform Platform Engineer

---

## 1. Executive Summary

Milestone 10.3 successfully delivered reproducible, hardened, and unprivileged production Docker container images for both the Kynergy NestJS backend API (`kinergy-api:local`) and React 18 / Vite frontend web application (`kinergy-web:local`), fulfilling all architectural requirements defined in Milestone 10.1 and the Milestone 10.2 container specification (ADR-0141).

A complete local production orchestration stack (`docker-compose.production.yml`) was deployed, executing PostgreSQL 16 Alpine, the API container, and the Web container in an isolated network (`kinergy_prod_network`). Runtime verification confirmed 100% compliance with security, routing, non-root execution, database connectivity, and healthcheck contracts.

---

## 2. Container Artifacts Delivered

| Artifact                | Repository Path                                                                                                                           | Description                                                                                                                                                                                                                              |
| :---------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Root Context Filter** | [`.dockerignore`](file:///c:/Projects/kinergy-platform/.dockerignore)                                                                     | Restricts Docker build context to essential monorepo source files, blocking `.git`, `.env*`, `node_modules`, `dist`, `tests`, `docs`, and build caches.                                                                                  |
| **API Dockerfile**      | [`infrastructure/deployment/docker/Dockerfile.api`](file:///c:/Projects/kinergy-platform/infrastructure/deployment/docker/Dockerfile.api) | 4-stage Debian Bookworm Slim container with pinned pnpm 11.17.0, native Argon2 C++ build tools, Prisma engine generation, production pruning (`--ignore-scripts`), `tini` init supervisor, and unprivileged `node` (UID 1000) execution. |
| **Web Dockerfile**      | [`infrastructure/deployment/docker/Dockerfile.web`](file:///c:/Projects/kinergy-platform/infrastructure/deployment/docker/Dockerfile.web) | 2-stage Alpine container compiling React/Vite assets, stripping development test mocks (`mockServiceWorker.js`), and deploying onto an unprivileged Nginx runner (`nginx` UID 101).                                                      |
| **Nginx Configuration** | [`infrastructure/deployment/docker/nginx.conf`](file:///c:/Projects/kinergy-platform/infrastructure/deployment/docker/nginx.conf)         | Production Nginx configuration configured for unprivileged port 8080, OWASP security headers, `/healthz` probe, SPA history fallback (`try_files $uri $uri/ /index.html`), and `/api/v1/` reverse proxy pass to the backend API.         |
| **Local Prod Compose**  | [`docker-compose.production.yml`](file:///c:/Projects/kinergy-platform/docker-compose.production.yml)                                     | Isolated 3-tier production verification orchestration linking PostgreSQL 16 (port 5435), API (port 3000), and Web (port 8080).                                                                                                           |

---

## 3. Image Sizing & Security Audit

### 3.1 Container Image Measurements

```text
REPOSITORY                    TAG          IMAGE ID        CONTAINER SIZE    COMPRESSED / DOWNLOAD
kinergy-api                   local        6c31746d36aa    988 MB            212 MB
kinergy-web                   local        abd48a89e5e5    22 MB             5.89 MB
```

- **Web Container Budget Compliance:** The web image achieved **22 MB uncompressed** (5.89 MB compressed), well under the target ceiling of 40 MB uncompressed defined in ADR-0141.
- **API Container Budget Compliance:** The API image achieved **212 MB compressed**, stripping all devDependencies (Babel, ESLint, Prettier, Jest, Supertest, Vitest, Nx devkits, TypeScript compiler) while retaining only native runtime dependencies and Prisma query engines.

### 3.2 Non-Root User & Privilege Verification

Both images enforce unprivileged execution without root privileges:

```bash
# API Non-Root Validation
$ docker run --rm kinergy-api:local whoami; docker run --rm kinergy-api:local id
node
uid=1000(node) gid=1000(node) groups=1000(node)

# Web Non-Root Validation
$ docker run --rm kinergy-web:local whoami; docker run --rm kinergy-web:local id
nginx
uid=101(nginx) gid=101(nginx) groups=101(nginx),101(nginx)
```

### 3.3 Security Invariants & Attack Surface Reduction

1. **Zero Secret Leakage:** No build arguments, environment secrets, or database URLs were baked into intermediate layers or image metadata (`.dockerignore` explicitly ignores `.env*`).
2. **Process Management (`tini`):** API container runs under `/usr/bin/tini -- node dist/apps/api/main.js`, guaranteeing proper PID 1 signal forwarding (`SIGTERM`/`SIGINT`) and zombie process reaping.
3. **No Mock Service Worker in Production Assets:** The web builder stage explicitly removes `/app/dist/apps/web/mockServiceWorker.js` before static asset promotion. Asset listing in `/usr/share/nginx/html` confirmed zero test artifacts.

---

## 4. Runtime Verification & Health Matrix

The full stack was initiated via `docker compose -f docker-compose.production.yml up -d` and subjected to the canonical verification matrix.

| Verification Item          | Target Endpoint / Command                   | Expected Behavior             | Actual Observed Result                                                   | Status   |
| :------------------------- | :------------------------------------------ | :---------------------------- | :----------------------------------------------------------------------- | :------- |
| **API Direct Health**      | `GET http://127.0.0.1:3000/api/v1/health`   | `200 OK` JSON with uptime     | `HTTP/1.1 200 OK`<br>`{"status":"ok","timestamp":"...","uptime":3300.8}` | **PASS** |
| **Web Direct Health**      | `GET http://127.0.0.1:8080/healthz`         | `200 OK` text `healthy`       | `HTTP/1.1 200 OK`<br>`healthy`                                           | **PASS** |
| **SPA HTML5 Fallback**     | `GET http://127.0.0.1:8080/gym/memberships` | `200 OK` serving `index.html` | `HTTP/1.1 200 OK`<br>`<!doctype html>...`                                | **PASS** |
| **Reverse Proxy Routing**  | `GET http://127.0.0.1:8080/api/v1/health`   | `200 OK` proxy-passed to API  | `HTTP/1.1 200 OK`<br>`{"status":"ok","timestamp":"...","uptime":3309.0}` | **PASS** |
| **PostgreSQL Persistence** | Port 5435 / Docker Bridge Network           | Prisma schema push & queries  | Synchronized schema (5435), zero connection pool exhaustion              | **PASS** |
| **Graceful Shutdown**      | `docker compose ... down`                   | SIGTERM handling & clean stop | All containers stopped & removed cleanly without force kills             | **PASS** |

---

## 5. Technical Issues Identified & Remediated During Containerization

1. **pnpm Prune Non-TTY Termination:**
   - _Problem:_ `pnpm prune --prod` in pnpm v11 failed in headless Docker build environments with `[ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY]`.
   - _Fix:_ Added `ENV CI=true` to base stage.
2. **Prisma Postinstall During Production Prune:**
   - _Problem:_ `pnpm prune --prod` executed package `postinstall: "prisma generate"` after removing devDependencies (which removed the `prisma` CLI binary).
   - _Fix:_ Added `--ignore-scripts` to the pruner stage (`pnpm prune --prod --ignore-scripts`).
3. **Workspace Module Resolution for `@kinergy-platform/core`:**
   - _Problem:_ The API runner stage experienced `ERR_MODULE_NOT_FOUND` when attempting to import from `@kinergy-platform/core/server`.
   - _Root Cause:_ `packages/core/tsconfig.lib.json` inherited `"module": "esnext"`, emitting an ESM bundle with extensionless imports, whereas `apps/api` is a CommonJS NestJS application. Additionally, `packages/core/package.json` had `"main": "./src/index.ts"`.
   - _Fix:_ Configured `"module": "commonjs"` in `packages/core/tsconfig.lib.json`, updated `packages/core/package.json` subpath exports to map `default` to `./src/index.js` and `./src/server.js`, while preserving `types` pointing to `./src/index.ts` and `./src/server.ts`. Re-verified architectural browser boundary tests (`browser-boundary.spec.ts`) passed 100%.

---

## 6. Monorepo Quality Gate Verification

All quality gates were executed across all 10 projects in the repository:

- **Prettier Code Formatting:** `pnpm format:check` — 100% PASS (all files formatted cleanly).
- **ESLint Static Analysis:** `pnpm lint` — 100% PASS across all 10 projects.
- **TypeScript Type Safety:** `pnpm typecheck` — 100% PASS (`tsc --noEmit -p tsconfig.base.json`).
- **Test Suites:** `pnpm test` — 100% PASS (500+ test suites, 9,000+ unit and integration tests passing across `api`, `web`, `core`, `ui`, and `client-domain`).
- **Production Compilation:** `pnpm build` — 100% PASS (successful build artifacts generated for all projects).

---

## 7. Conclusion & Next Milestone Recommendation

Milestone 10.3 is **COMPLETE** and verified against live container execution. The container assets provide a production-ready baseline for staging, continuous integration, and production orchestration.

**Recommendation:** Proceed to **Milestone 10.4 — CI/CD Pipeline Automation and Production Deployment Specification**.
