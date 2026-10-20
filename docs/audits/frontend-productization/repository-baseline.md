# Repository Baseline Audit Report

- **Document ID:** `AUDIT-BASE-001`
- **Milestone:** Milestone 0 — Kinergy Frontend Productization Audit
- **Auditor:** Principal Software Architect, Senior Full-Stack Engineer, QA Lead & Product Analyst
- **Date:** 2026-10-19
- **Repository:** `izzydin/kinergy-platform`
- **Execution Mode:** Autonomous, Read-Only

---

## 1. Executive Summary

This report establishes the verified, evidence-backed repository baseline of the `kinergy-platform` monorepo prior to commencing the frontend productization initiative. Every finding in this document has been directly executed and confirmed against the physical repository on disk.

The repository is currently at commit `6b85269f93fb193463cff840e42edef50e55f01e` on branch `main`. The working tree is completely clean (`nothing to commit, working tree clean`). All pre-existing commits and workspace files are strictly preserved.

A full dry run of the automated quality gate pipeline (`pnpm validate`) was executed in the local environment and passed **100% cleanly (exit code 0)**, validating that all code formatting, linting rules, TypeScript strict compilation, automated test suites (8,312 automated tests), and production compilation bundles are in a healthy, passing state.

---

## 2. Git State & Working Tree

| Attribute                     | Verified Value                                                                                                                                                                                                                                                                                                                                                                                                                                       | Evidence                                                        |
| :---------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------- |
| **Current Branch**            | `main`                                                                                                                                                                                                                                                                                                                                                                                                                                               | `git status` -> `On branch main`, up to date with `origin/main` |
| **Current Commit HEAD**       | `6b85269f93fb193463cff840e42edef50e55f01e`                                                                                                                                                                                                                                                                                                                                                                                                           | `git rev-parse HEAD`                                            |
| **Working Tree Status**       | Clean (0 modified, 0 untracked, 0 staged)                                                                                                                                                                                                                                                                                                                                                                                                            | `git status` -> `nothing to commit, working tree clean`         |
| **Latest Git Log Entries**    | `6b85269 docs(architecture): update security authorization matrix evidence`<br>`c1c447f docs(architecture): update cross-domain ownership traceability in acceptance matrix`<br>`4eb9a1e test(sales): add receipt records verification suite and update acceptance matrix`<br>`a918e35 test(payments): add cash and qr lifecycle verification suite for phase 7.24`<br>`442acfe test(sales): add owner operations verification suite for phase 7.24` | `git log -n 5 --oneline`                                        |
| **Pre-existing User Changes** | None. Pristine working tree.                                                                                                                                                                                                                                                                                                                                                                                                                         | Confirmed via `git status`                                      |

---

## 3. Toolchain & Environment Matrix

| Tool / Runtime       | Required / Configured Version                  | Verified Active Version                                   | Status             |
| :------------------- | :--------------------------------------------- | :-------------------------------------------------------- | :----------------- |
| **Operating System** | Windows (PowerShell Shell)                     | Windows 11 / Windows Server                               | Verified           |
| **Node.js**          | `>= 20.x` (`.nvmrc`: `20`)                     | `v24.12.0`                                                | Verified           |
| **Package Manager**  | `pnpm@11.17.0` (`package.json#packageManager`) | `11.17.0`                                                 | Verified           |
| **Nx Build System**  | `^20.4.0`                                      | `20.4.0`                                                  | Verified           |
| **TypeScript**       | `~5.7.3`                                       | `5.7.3`                                                   | Verified           |
| **Database Engine**  | PostgreSQL 16 (`docker-compose.yml`)           | Docker daemon inactive; mocks/in-memory unit tests active | Partially Verified |
| **ORM / Migrations** | Prisma `^6.3.1`                                | `6.3.1`                                                   | Verified           |

---

## 4. Monorepo & Workspace Architecture

The workspace is configured as an **Nx Integrated Monorepo** managed by **pnpm workspaces** (`pnpm-workspace.yaml`).

### Workspace Package Topology

```yaml
packages:
  - 'apps/*'
  - 'libs/*'
  - 'libs/*/*'
  - 'packages/*'
  - 'modules/*'
  - 'modules/*/*'
```

### Monorepo Structure

```
kinergy-platform/
├── apps/
│   ├── api/                   # NestJS 10 Modular Monolith backend application
│   └── web/                   # React 18 + Vite 5 + TailwindCSS frontend application
├── libs/                      # Empty placeholder (.gitkeep)
├── modules/
│   └── client/                # Standalone Client Bounded Context (@kinergy-platform/client-domain)
├── packages/
│   ├── config/                # Centralized environment variable validation (Zod)
│   ├── core/                  # Domain entities, aggregates, CQRS handlers, and persistence adapters
│   ├── testing/               # Shared test utilities, builder harnesses, and fixtures
│   ├── types/                 # Universal TypeScript types and interfaces
│   ├── ui/                    # Design system components, Radix UI primitives, tokens
│   ├── utils/                 # Pure domain and application utility helpers
│   └── validation/            # Universal input validation rules and schemas
├── prisma/
│   ├── schema.prisma          # PostgreSQL relational schema (27 domain models)
│   ├── migrations/            # Historical relational database migrations
│   └── seed.ts                # Master database seed script
└── docs/                      # Centralized platform documentation and ADRs
```

---

## 5. Quality Gate Execution & Verification Results

All primary read-only quality-gate scripts declared in `package.json` were executed to verify platform health.

| Command                      | Target / Scope                      | Purpose                                           | Exit Code |  Result  | Evidence / Details                                                                                                       |
| :--------------------------- | :---------------------------------- | :------------------------------------------------ | :-------: | :------: | :----------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`          | Entire repository                   | Prettier code style validation                    |   **0**   | **PASS** | `All matched files use Prettier code style!`                                                                             |
| `pnpm lint`                  | 10 projects (`nx run-many -t lint`) | ESLint static code analysis                       |   **0**   | **PASS** | 10/10 projects passed: `validation`, `testing`, `config`, `client-domain`, `types`, `utils`, `core`, `ui`, `api`, `web`. |
| `pnpm typecheck`             | Root `tsconfig.base.json`           | Strict TypeScript compiler check (`noEmit`)       |   **0**   | **PASS** | Zero type errors across all packages and apps.                                                                           |
| `pnpm nx test core`          | `packages/core`                     | Core domain & application test suites             |   **0**   | **PASS** | 290 test suites passed, 4,550 tests passed (0 failures).                                                                 |
| `pnpm nx test client-domain` | `modules/client`                    | Client domain, use case, & persistence tests      |   **0**   | **PASS** | 22 test suites passed, 160 tests passed (0 failures).                                                                    |
| `pnpm nx test ui`            | `packages/ui`                       | Design system component contracts & DOM tests     |   **0**   | **PASS** | 6 test suites passed, 53 tests passed (0 failures).                                                                      |
| `pnpm nx test web`           | `apps/web`                          | Frontend components, hooks, & integration tests   |   **0**   | **PASS** | 141 test suites passed, 1,450 tests passed (0 failures).                                                                 |
| `pnpm nx test api`           | `apps/api`                          | Backend controllers, guards, filters, & use cases |   **0**   | **PASS** | 144 test suites passed, 2,099 tests passed (0 failures).                                                                 |
| `pnpm nx build api`          | `apps/api`                          | Backend TypeScript build compilation              |   **0**   | **PASS** | Successfully compiled to `dist/apps/api`.                                                                                |
| `pnpm nx build web`          | `apps/web`                          | Frontend Vite production compilation              |   **0**   | **PASS** | Successfully built into `dist/apps/web` (see build warnings note).                                                       |
| **`pnpm validate`**          | **Full CI Pipeline**                | **Format + Lint + Typecheck + Test + Build**      |   **0**   | **PASS** | **All 5 sequential stages passed cleanly end-to-end.**                                                                   |

### Verified Test Suite Volume

- **Total Test Suites Executed:** 603 suites
- **Total Unit & Integration Tests Passed:** **8,312 tests**
- **Test Failures:** 0
- **Test Skips:** 0

---

## 6. Environmental Limitations & Safety Classifications

### 6.1 Docker & Database Services

- **Status:** Docker Desktop was not running during the baseline inspection (`failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`).
- **Impact:** Live PostgreSQL database on port `5433` (`DATABASE_URL=postgresql://kinergy_user:kinergy_secure_pass@127.0.0.1:5433/kinergy_dev?schema=public`) was unavailable for live runtime execution.
- **Test Isolation Assessment:** Unit and integration test suites in `core`, `client-domain`, `web`, and `api` utilize in-memory doubles, repository mocks, MSW v2, or SQLite/isolated harnesses. They executed cleanly without an active Docker daemon.
- **Safety Rule:** Live database migrations (`pnpm prisma:migrate`), database seedings (`pnpm prisma:seed`), and schema mutations must remain blocked during this read-only audit milestone.

### 6.2 Safe vs. Unsafe Commands Catalog

| Command                                    | Classification        | Assessment & Rationale                                   |
| :----------------------------------------- | :-------------------- | :------------------------------------------------------- |
| `pnpm format:check`                        | **SAFE**              | Read-only Prettier check. Does not mutate tracked files. |
| `pnpm format` / `pnpm write`               | **UNSAFE / MUTATING** | Modifies files on disk. Prohibited in Milestone 0.       |
| `pnpm lint`                                | **SAFE**              | Read-only lint analysis.                                 |
| `pnpm typecheck`                           | **SAFE**              | Read-only `tsc --noEmit`.                                |
| `pnpm test` / `nx test <project>`          | **SAFE**              | Runs automated tests in-memory. Non-mutating.            |
| `pnpm build` / `nx build <project>`        | **SAFE**              | Generates build artifacts in `dist/` (gitignored).       |
| `pnpm validate`                            | **SAFE**              | Sequential read-only pipeline.                           |
| `pnpm prisma:migrate`                      | **FORBIDDEN**         | Mutates database schemas and migration files.            |
| `pnpm prisma:seed`                         | **FORBIDDEN**         | Mutates database data.                                   |
| `git checkout` / `git clean` / `git reset` | **FORBIDDEN**         | Can destroy working tree state.                          |

---

## 7. Baseline Anomalies & Initial Technical Observations

1. **Frontend Production Bundle Size & Infrastructure Leak:**
   During `nx build web`, Vite emitted warnings regarding:
   - Externalization of Node.js built-ins (`stream`, `util`) imported by `@nestjs/common`.
   - Dynamic import of `.prisma/client/index-browser`.
   - Dist chunk `dist/apps/web/assets/index-CdiGBfKD.js` is **2,280.21 kB (2.28 MB)** minified (`515.85 kB` gzip).
   - **Root Cause:** `@kinergy-platform/core`'s barrel export (`packages/core/src/index.ts`) re-exports scheduling infrastructure repositories that import `@nestjs/common` and Prisma Client. When `apps/web` imports enums or types from `@kinergy-platform/core`, Vite pulls in backend infrastructure adapters. This is an architectural boundary violation.

2. **React Router Future Flag Warnings:**
   During `nx test web`, console warnings were logged regarding upcoming React Router v7 future flags (`v7_startTransition`, `v7_relativeSplatPath`). The app is currently on `react-router-dom@6.28.0`.

---

## 8. Preserved Modifications Statement

At the time of this audit, the working tree contained zero unstaged, staged, or untracked changes. No application source code, configuration files, test scripts, or Git histories were altered. This document and its sibling audit reports in `docs/audits/frontend-productization/` represent the only files created.
