# Standards & Architecture Audit Report

- **Document ID:** `AUDIT-ARCH-002`
- **Milestone:** Milestone 0 — Kinergy Frontend Productization Audit
- **Auditor:** Principal Software Architect, Senior Full-Stack Engineer, QA Lead & Product Analyst
- **Date:** 2026-10-19
- **Repository:** `izzydin/kinergy-platform`
- **Execution Mode:** Autonomous, Read-Only

---

## 1. Executive Summary

This report evaluates the actual implementation of the Kinergy Platform against its authoritative architecture specifications, engineering principles, and 140+ Architectural Decision Records (ADRs).

The platform demonstrates high engineering discipline in domain modeling, financial invariants (Phase 7.24), automated testing (over 8,300 passing automated tests), and design-system token adherence. However, the audit revealed several critical architecture violations, boundary leaks, and documentation drifts that directly threaten the success of the upcoming frontend productization:

1. **Infrastructure Leak into Frontend Bundle:** The core barrel export (`packages/core/src/index.ts`) re-exports backend persistence repositories that depend on `@nestjs/common` and Prisma Client. As a result, the frontend application (`apps/web`) bundles Node.js/NestJS server code into its client-side bundle, resulting in a bloated **2.28 MB JavaScript chunk** and runtime externalization warnings.
2. **Missing Backend Module Registrations:**
   - **Kinesiology:** `TreatmentSessionsController` exists in `apps/api/src/kinesiology/controllers/treatment-sessions.controller.ts`, but no `KinesiologyModule` exists, and it is never registered in `AppModule`.
   - **Identity Admin (User Management):** Administrative use cases (`CreateUserUseCase`, `SearchUsersUseCase`, `ActivateUserUseCase`, `DeactivateUserUseCase`, `UpdateUserUseCase`) exist in `apps/api/src/platform/identity/use-cases/admin/`, but no HTTP controller (`UsersController`) exists in `apps/api`.
3. **In-Memory Persistence in Gym Module (ADR-0080 Violation):** `apps/api/src/gym/gym.module.ts` injects in-memory mock repositories (`DefaultGymMembershipRepository`, `DefaultGymPlanRepository`, `DefaultGymAttendanceRepository`) rather than the production Prisma repositories that already exist in `packages/core/src/gym/infrastructure/persistence/prisma/repositories/`.
4. **Documentation Drift (Legacy Energy/Telemetry Boilerplate):** Root frontend architectural standards (`docs/frontend/architecture.md`, `docs/frontend/principles.md`), the OpenAPI Swagger description in `apps/api/src/main.ts`, navigation items in `navigation.config.ts`, and router definitions in `app-router.tsx` reference an "Enterprise Energy & Sustainability Management System" and "Energy Telemetry", which are remnants of a starter boilerplate template rather than Kinergy's health and wellness domain.
5. **Frontend API Contract Drift in Settings:** The frontend `settings` module targets mock routes (`/settings/profile`, `/settings/security/change-password`) implemented only in MSW handlers, whereas the backend provides `/auth/me` and `/auth/change-password`.

---

## 2. Authoritative Standards Matrix

| Standard / ADR                          | Location                                                                                                                                                                                                                                                                                                                                                                                                             | Core Architectural Mandate                                                                                                                   | Frontend / Backend Implication                                                                        |     Verified Status     | Evidence & Audit Notes                                                                                                                          |
| :-------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------- | :---------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Monorepo Architecture**               | [ADR-0002](file:///c:/Projects/kinergy-platform/docs/adr/0002-nx-monorepo-clean-architecture-ddd.md), [ADR-0003](file:///c:/Projects/kinergy-platform/docs/adr/0003-nx-integrated-workspace-pnpm.md)                                                                                                                                                                                                                 | Nx integrated workspace with pnpm; strict package boundaries; clean architecture layering.                                                   | Independent build/test caching; clear dependency graphs.                                              | **Partially Compliant** | Monorepo structure conforms; however, `@kinergy-platform/core` violates boundaries by coupling domain models with NestJS/Prisma infrastructure. |
| **Backend Layering**                    | [ADR-0010](file:///c:/Projects/kinergy-platform/docs/adr/0010-backend-clean-architecture-layering.md)                                                                                                                                                                                                                                                                                                                | Strict 4-layer dependency flow: Domain -> Application -> Infrastructure -> Presentation.                                                     | Controllers depend only on use-case ports; persistence details never enter domain.                    |      **Compliant**      | Backend domain layers in `packages/core` have zero imports of NestJS or Prisma.                                                                 |
| **Prisma Relational Persistence**       | [ADR-0011](file:///c:/Projects/kinergy-platform/docs/adr/0011-prisma-orm-persistence-infrastructure.md), [ADR-0122](file:///c:/Projects/kinergy-platform/docs/adr/0122-phase-7-financial-persistence-architecture.md)                                                                                                                                                                                                | Production relational mapping in PostgreSQL via Prisma with explicit indexes and transaction boundaries.                                     | Backend modules must persist to Prisma models.                                                        | **Partially Compliant** | Sales, Resources, Clients, and IAM use Prisma. However, `GymModule` in `apps/api` wires in-memory maps instead of its Prisma repositories.      |
| **Gym Management Persistence**          | [ADR-0080](file:///c:/Projects/kinergy-platform/docs/adr/0080-gym-management-production-persistence-and-relational-mapping.md)                                                                                                                                                                                                                                                                                       | Mandates PostgreSQL persistence via `PrismaMembershipRepository`, `PrismaMembershipPlanRepository`, and `PrismaAttendanceRecordRepository`.  | Gym records must persist across application restarts.                                                 |    **NON-COMPLIANT**    | `apps/api/src/gym/gym.module.ts` instantiates `DefaultGymMembershipRepository` (in-memory Map), violating ADR-0080.                             |
| **Identity & Security Architecture**    | [ADR-0018](file:///c:/Projects/kinergy-platform/docs/adr/0018-jwt-token-infrastructure.md), [ADR-0019](file:///c:/Projects/kinergy-platform/docs/adr/0019-refresh-token-persistence-strategy.md), [ADR-0024](file:///c:/Projects/kinergy-platform/docs/adr/0024-authentication-guard-architecture.md), [ADR-0025](file:///c:/Projects/kinergy-platform/docs/adr/0025-role-and-permission-authorization-framework.md) | Dual-token JWT (in-memory access token + httpOnly refresh token with RTR); Argon2id hashing; RBAC guard framework.                           | Frontend manages tokens via `authTokenStore`; intercepts 401s; guards routes via `RequirePermission`. |      **Compliant**      | Dual-token authentication and permission resolution are fully verified in `apps/api` and `apps/web/src/shared/auth`.                            |
| **Frontend Architecture Vision**        | [`docs/frontend/architecture.md`](file:///c:/Projects/kinergy-platform/docs/frontend/architecture.md)                                                                                                                                                                                                                                                                                                                | Feature-first modular SPA; hybrid routing; 4-state UI contract; design system token adherence.                                               | Modular feature folders; co-located components, queries, and routes.                                  | **Partially Compliant** | Codebase follows feature structure, but document itself contains heavy drift (describing an "energy management" system).                        |
| **Frontend Folder Structure**           | [`docs/frontend/folder-structure.md`](file:///c:/Projects/kinergy-platform/docs/frontend/folder-structure.md)                                                                                                                                                                                                                                                                                                        | Strict directory hierarchy: `src/app/`, `src/modules/`, `src/shared/`, `src/test/`. Controlled public API exports via `index.ts`.            | Disallows deep cross-module imports. Enforces public module boundaries.                               |      **Compliant**      | Lint rules enforce public API imports. Module taxonomy matches specification.                                                                   |
| **Component Contracts & Design System** | [`docs/frontend/component-contracts.md`](file:///c:/Projects/kinergy-platform/docs/frontend/component-contracts.md), [`docs/frontend/ui-architecture.md`](file:///c:/Projects/kinergy-platform/docs/frontend/ui-architecture.md)                                                                                                                                                                                     | Design system primitives in `@kinergy-platform/ui`; Radix UI slots (`asChild`); zero ad-hoc Tailwind colors; 4-State UI contract.            | All screens must render Loading, Empty, Error, and Success states consistently.                       |      **Compliant**      | `@kinergy-platform/ui` package provides accessible primitives tested across 6 test suites and 53 unit tests.                                    |
| **CRUD & DataTable Standards**          | [`docs/frontend/crud-experience-contract.md`](file:///c:/Projects/kinergy-platform/docs/frontend/crud-experience-contract.md), [`docs/frontend/sales_url_query_contract.md`](file:///c:/Projects/kinergy-platform/docs/frontend/sales_url_query_contract.md)                                                                                                                                                         | URL-driven data table state (search, filters, sort, pagination serialized in URL search parameters).                                         | Bookmarking, browser back/forward, and shareable operational views.                                   |      **Compliant**      | Implemented cleanly in `modules/sales` (`sales-list-page.tsx`, `payment-history-page.tsx`) and `modules/identity/user-management`.              |
| **Deterministic Financial Arithmetic**  | [ADR-0108](file:///c:/Projects/kinergy-platform/docs/adr/0108-money-representation.md), [ADR-0114](file:///c:/Projects/kinergy-platform/docs/adr/0114-canonical-monetary-policy-and-sale-totals.md)                                                                                                                                                                                                                  | All monetary calculations in integer cents with Commercial Half-Up rounding; zero floating-point accumulation; PostgreSQL CHECK constraints. | Frontend and backend share exact monetary totals; zero client-side calculation drift.                 |      **Compliant**      | Enforced across `packages/core/src/sales/domain` and verified in Milestone 7.24 acceptance tests.                                               |
| **Unified Commercial Sourcing**         | [ADR-0110](file:///c:/Projects/kinergy-platform/docs/adr/0110-sale-ownership.md), [ADR-0121](file:///c:/Projects/kinergy-platform/docs/adr/0121-sale-source-references-and-commercial-origin-model.md), [ADR-0139](file:///c:/Projects/kinergy-platform/docs/adr/0139-cross-domain-commercial-integration-contract.md)                                                                                               | Sales references external domains via `SaleSource` VO without foreign key coupling or duplicate tables.                                      | Sales module displays external items while maintaining domain isolation.                              |      **Compliant**      | Verified across Kinesiology sessions, Gym memberships, and retail consumables in Phase 7.23 & 7.24.                                             |

---

## 3. Actual Monorepo Architecture & Package Inventory

### 3.1 Application Entry Points

- **Backend Application (`apps/api`):**
  - **Entry Point:** [`apps/api/src/main.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/main.ts)
  - **Framework:** NestJS 10.4.15 with Express platform
  - **Root Module:** [`apps/api/src/app.module.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/app.module.ts)
  - **Active Imported Modules:** `ConfigModule`, `PlatformModule` (imports `PrismaModule`, `IdentityModule`, `LoggingModule`, `AuditModule`, `RateLimitingModule`, `WebSecurityModule`, `ClientModule`), `SchedulingModule`, `GymModule`, `ResourcesModule`, `SalesModule`.
  - **Missing Modules:** `KinesiologyModule` (omitted from `AppModule`).

- **Frontend Application (`apps/web`):**
  - **Entry Point:** [`apps/web/src/main.tsx`](file:///c:/Projects/kinergy-platform/apps/web/src/main.tsx)
  - **HTML Host:** [`apps/web/index.html`](file:///c:/Projects/kinergy-platform/apps/web/index.html)
  - **Framework:** React 18.3.1 + Vite 5.4.11
  - **Routing:** React Router DOM 6.28.0 (Hybrid feature router in [`apps/web/src/app/routes/app-router.tsx`](file:///c:/Projects/kinergy-platform/apps/web/src/app/routes/app-router.tsx))
  - **State & Server Cache:** TanStack React Query 5.62.0
  - **Design System:** Tailwind CSS 3.4.17 + Radix UI + `@kinergy-platform/ui`

### 3.2 Shared Packages Inventory

| Package                           | Path                  | Public Export  | Layer & Responsibilities                                                           |
| :-------------------------------- | :-------------------- | :------------- | :--------------------------------------------------------------------------------- |
| `@kinergy-platform/ui`            | `packages/ui`         | `src/index.ts` | Design tokens, button, card, dialog, table, badge, skeleton, StateView primitives. |
| `@kinergy-platform/core`          | `packages/core`       | `src/index.ts` | Bounded context domain logic, aggregates, use cases, and persistence adapters.     |
| `@kinergy-platform/client-domain` | `modules/client`      | `index.ts`     | Complete Clean Architecture package for the Client Bounded Context.                |
| `@kinergy-platform/types`         | `packages/types`      | `src/index.ts` | Universal platform DTOs, pagination contracts, and response envelopes.             |
| `@kinergy-platform/utils`         | `packages/utils`      | `src/index.ts` | Pure utility functions, date formatters, and collection helpers.                   |
| `@kinergy-platform/validation`    | `packages/validation` | `src/index.ts` | Universal Zod validation schemas and sanitization routines.                        |
| `@kinergy-platform/config`        | `packages/config`     | `src/index.ts` | Centralized Zod-validated environment configuration.                               |
| `@kinergy-platform/testing`       | `packages/testing`    | `src/index.ts` | Testing fixtures, builders, mock tokens, and assertion helpers.                    |

---

## 4. Architectural Findings & Technical Debt

```mermaid
graph TD
    subgraph Frontend Bundle Bleed Issue
        WEB[apps/web] -->|Imports Types/Enums| CORE_BARREL[packages/core/src/index.ts]
        CORE_BARREL --> CORE_SCHED[packages/core/src/scheduling]
        CORE_SCHED --> REPO[Prisma Repositories]
        REPO -->|Imports| NEST[@nestjs/common]
        REPO -->|Imports| PRISMA[@prisma/client]
        NEST -.->|Vite Externalization Warning| BUNDLE[dist/apps/web - 2.28 MB]
        PRISMA -.->|Browser Fallback Warning| BUNDLE
    end
```

### Finding ARCH-001: Backend Server Infrastructure Leaked into Browser Bundle

- **Severity / Priority:** High / **P1**
- **Affected Files:**
  - [`packages/core/src/index.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/index.ts#L1-L8)
  - [`packages/core/src/scheduling/infrastructure/persistence/prisma/repositories/`](file:///c:/Projects/kinergy-platform/packages/core/src/scheduling/infrastructure/persistence/prisma/repositories/)
  - [`apps/web/src/modules/resources/inventory/routes/inventory-detail-page.tsx`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/resources/inventory/routes/inventory-detail-page.tsx#L40)
  - [`apps/web/src/modules/resources/assets/routes/asset-detail-page.tsx`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/resources/assets/routes/asset-detail-page.tsx#L34)
- **Problem Description:** `packages/core/src/index.ts` is a monolithic barrel file that re-exports all layers of `scheduling`, `kinesiology`, `gym`, `resources`, and `sales`. This includes backend infrastructure repositories that import `@nestjs/common` (e.g. `@Injectable()`) and `@prisma/client`. When frontend modules import enums (such as `InventoryCategory` or `AssetStatus`) from `@kinergy-platform/core`, Vite resolves the entire barrel file, pulling Node.js server dependencies into the client bundle.
- **Business / Engineering Impact:** Client bundle size is **2.28 MB**, causing slower page loads and emitting Vite compilation warnings (`Module "stream" has been externalized`, `Module "util" has been externalized`, `.prisma/client/index-browser`).
- **Recommended Remediation:** Split `@kinergy-platform/core` exports into clear sub-paths using package `exports` in `package.json` (e.g. `@kinergy-platform/core/domain`, `@kinergy-platform/core/types`) or move pure domain models/enums into `@kinergy-platform/types`, leaving infrastructure persistence strictly in backend-only packages.

---

### Finding ARCH-002: Kinesiology Treatment Sessions Controller Not Mounted in Backend

- **Severity / Priority:** Critical / **P0**
- **Affected Files:**
  - [`apps/api/src/kinesiology/controllers/treatment-sessions.controller.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/kinesiology/controllers/treatment-sessions.controller.ts#L73)
  - [`apps/api/src/app.module.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/app.module.ts#L14-L25)
- **Problem Description:** `TreatmentSessionsController` provides clinical treatment session endpoints (`POST /kinesiology/treatment-sessions`, `GET /kinesiology/treatment-sessions/:id`, `PATCH /kinesiology/treatment-sessions/:id/soap-notes`, etc.). However, there is no `KinesiologyModule` defined in `apps/api/src/kinesiology`, and the controller is not imported by `AppModule`.
- **Business / Engineering Impact:** At runtime, the backend API gateway returns 404 for all `/kinesiology/*` HTTP endpoints. The clinical charting feature is completely disconnected from the live backend server.
- **Recommended Remediation:** Create `apps/api/src/kinesiology/kinesiology.module.ts`, wire the clinical treatment session use cases and repositories, and register `KinesiologyModule` in `AppModule.imports`.

---

### Finding ARCH-003: User Administration Endpoints Missing in Backend HTTP Layer

- **Severity / Priority:** Critical / **P0**
- **Affected Files:**
  - [`apps/api/src/platform/identity/identity.module.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/platform/identity/identity.module.ts#L62)
  - [`apps/api/src/platform/identity/use-cases/admin/`](file:///c:/Projects/kinergy-platform/apps/api/src/platform/identity/use-cases/admin/)
  - [`apps/web/src/modules/identity/user-management/api/user-management-api.ts`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/identity/user-management/api/user-management-api.ts)
- **Problem Description:** `IdentityModule` in `apps/api` instantiates and exports `CreateUserUseCase`, `UpdateUserUseCase`, `ActivateUserUseCase`, `DeactivateUserUseCase`, and `SearchUsersUseCase`. However, `IdentityModule.controllers` contains only `AuthController`. There is no `UsersController` exposing these use cases over HTTP. The frontend `user-management` module only functions in development because MSW intercepts `/admin/users`.
- **Business / Engineering Impact:** In production (with MSW disabled), administrator user management (listing users, creating staff accounts, deactivating staff) fails with HTTP 404.
- **Recommended Remediation:** Implement `UsersController` in `apps/api/src/platform/identity/controllers/users.controller.ts` with route `@Controller('api/v1/admin/users')`, protected with `@RequirePermissions('manage:users')`, and register it in `IdentityModule.controllers`.

---

### Finding ARCH-004: Gym Management Backend Uses In-Memory Fallbacks (ADR-0080 Violation)

- **Severity / Priority:** Essential / **P1**
- **Affected Files:**
  - [`apps/api/src/gym/gym.module.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/gym/gym.module.ts#L62-L190)
  - [`packages/core/src/gym/infrastructure/persistence/prisma/repositories/`](file:///c:/Projects/kinergy-platform/packages/core/src/gym/infrastructure/persistence/prisma/repositories/)
  - [`docs/adr/0080-gym-management-production-persistence-and-relational-mapping.md`](file:///c:/Projects/kinergy-platform/docs/adr/0080-gym-management-production-persistence-and-relational-mapping.md)
- **Problem Description:** ADR-0080 explicitly specifies PostgreSQL persistence via Prisma for Gym memberships, plans, and attendance logs. The required Prisma repositories (`PrismaMembershipRepository`, `PrismaMembershipPlanRepository`, `PrismaAttendanceRecordRepository`) are fully implemented and tested in `packages/core`. However, `GymModule` in `apps/api` wires `DefaultGymMembershipRepository`, `DefaultGymPlanRepository`, and `DefaultGymAttendanceRepository`, which store data in local TypeScript `Map` and `Array` instances.
- **Business / Engineering Impact:** Any restart or deployment of `apps/api` completely wipes all gym memberships, plans, and physical ingress records.
- **Recommended Remediation:** Update `apps/api/src/gym/gym.module.ts` providers to inject the existing Prisma repository classes backed by `PrismaService`.

---

### Finding ARCH-005: Documentation & Navigation Drift (Legacy Energy/Telemetry Boilerplate)

- **Severity / Priority:** Medium / **P2**
- **Affected Files:**
  - [`docs/frontend/architecture.md`](file:///c:/Projects/kinergy-platform/docs/frontend/architecture.md#L11-L15)
  - [`docs/frontend/principles.md`](file:///c:/Projects/kinergy-platform/docs/frontend/principles.md#L25)
  - [`apps/api/src/main.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/main.ts#L39)
  - [`apps/web/src/app/routes/app-router.tsx`](file:///c:/Projects/kinergy-platform/apps/web/src/app/routes/app-router.tsx#L76-L113)
  - [`apps/web/src/app/navigation/navigation.config.ts`](file:///c:/Projects/kinergy-platform/apps/web/src/app/navigation/navigation.config.ts#L64-L91)
  - [`apps/web/src/modules/energy/`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/energy/)
  - [`apps/web/src/modules/analytics/`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/analytics/)
- **Problem Description:** Multiple documentation files and code entry points describe Kinergy as an "Enterprise Energy & Sustainability Management System" and define routes for "Energy Telemetry" (`/energy`) and "Analytics" (`/analytics`). In code, these modules are empty stubs (`export {};`) rendering `PlaceholderView`.
- **Business / Engineering Impact:** Creates confusion for engineers and stakeholders regarding the domain purpose of the platform. Pollutes the primary navigation bar with dead placeholder links.
- **Recommended Remediation:** Retire the dead `energy` and `analytics` routes and modules; update Swagger metadata in `apps/api/src/main.ts`; and reconcile the frontend documentation to reflect Kinergy's actual business domain (Health, Wellness, Gym, Kinesiology & Commercial Sales).

---

### Finding ARCH-006: Frontend Settings Module Contract Mismatch

- **Severity / Priority:** Medium / **P2**
- **Affected Files:**
  - [`apps/web/src/modules/settings/api/settings-api.ts`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/settings/api/settings-api.ts#L36-L70)
  - [`apps/api/src/platform/identity/controllers/auth.controller.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/platform/identity/controllers/auth.controller.ts#L61-L83)
- **Problem Description:** The frontend `settings` module issues HTTP requests to `/settings/profile` and `/settings/security/change-password`, which only exist in MSW handlers. The real NestJS backend exposes `/api/v1/auth/me` and `/api/v1/auth/change-password`.
- **Business / Engineering Impact:** User profile updates and self-service password changes will fail with 404 in production when MSW is disabled.
- **Recommended Remediation:** Re-target `settings-api.ts` to call `/api/v1/auth/me` and `/api/v1/auth/change-password` matching backend DTO schemas.
