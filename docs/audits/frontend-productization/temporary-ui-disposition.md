# Temporary Test UI Disposition & Removal Strategy

- **Document ID:** `AUDIT-TEMP-003`
- **Milestone:** Milestone 0 — Kinergy Frontend Productization Audit
- **Auditor:** Principal Software Architect, Senior Full-Stack Engineer, QA Lead & Product Analyst
- **Date:** 2026-10-19
- **Repository:** `izzydin/kinergy-platform`
- **Execution Mode:** Autonomous, Read-Only

---

## 1. Executive Summary

During early platform development phases (specifically Milestones A5.2 through A6.8), the frontend incorporated test-oriented screens, simulation panels, interactive 4-state buttons, hardcoded mock metrics, and development debug hooks. These elements enabled developers to verify the UI design system primitives, error boundaries, and optimistic mutations before backend APIs were finalized.

This audit establishes a complete, evidence-based inventory of all temporary test UI code across the application, classifies every component into four deterministic categories (A, B, C, D), analyzes removal dependencies and regression risks, and defines how to transition verification into automated test harnesses rather than leaving test scaffolding in production navigation.

**Critical Policy:** Under Milestone 0 constraints, **zero code has been deleted or renamed**. This document provides the authoritative blueprint for executing removals in subsequent productization milestones.

---

## 2. Temporary UI Entry Points in the Application

The test UI currently interfaces with the application at six distinct architectural injection points:

```mermaid
graph TD
    subgraph Test UI Entry Points
        EP1[apps/web/src/main.tsx] -->|Imports| MSW_INIT[initMsw]
        EP1 -->|Imports| DBG_INIT[initDebugHelpers]
        EP2[navigation.config.ts] -->|Registers Sidebar Item| NAV_ITEM[dashboard-ui-states: UI States & A6 Showcase]
        EP2 -->|Registers Stubs| NAV_STUBS[energy: Energy Telemetry / analytics: Analytics]
        EP3[app-router.tsx] -->|Mounts Sub-Routers| ROUTE_STUBS[EnergySubRouter / AnalyticsSubRouter / /shell]
        EP4[dashboard.router.tsx] -->|Exposes Route| ROUTE_STATES[/dashboard/ui-states / /dashboard/metrics]
        EP5[dashboard-overview-page.tsx] -->|Renders| SIM_CTRL[4-State Simulation Controller Button Panel]
        EP6[handlers.ts] -->|Provides Mock API| MSW_ENDPOINTS[/api/v1/test/mutation-success / /api/v1/test/auth-failure]
    end
```

1. **Bootstrap Lifecycle (`apps/web/src/main.tsx`):** Unconditionally imports and calls `initMsw()` and `initDebugHelpers()` on every startup.
2. **Primary Navigation (`apps/web/src/app/navigation/navigation.config.ts`):** Exposes `dashboard-ui-states` ("UI States & A6 Showcase") directly in the main sidebar under the `overview` section, alongside dead links for `energy` and `analytics`.
3. **App Router Shell (`apps/web/src/app/routes/app-router.tsx`):** Contains `PlaceholderView` routes for `/clients`, `/clients/:clientId`, `/auth/reset-password`, `/shell`, and stub routers for `EnergySubRouter` and `AnalyticsSubRouter`.
4. **Dashboard Sub-Router (`apps/web/src/modules/dashboard/routes/dashboard.router.tsx`):** Exposes `/dashboard/ui-states` and `/dashboard/metrics`.
5. **Dashboard Overview View (`apps/web/src/modules/dashboard/routes/dashboard-overview-page.tsx`):** Features an interactive "4-State UI Simulation Controller" card that intercepts component states and renders a "Step A5.2 Validation" badge.
6. **MSW Transport Mocks (`apps/web/src/test/mocks/handlers.ts`):** Exposes synthetic test endpoints (`/api/v1/test/mutation-success`, `/api/v1/test/mutation-failure`, `/api/v1/test/auth-failure`).

---

## 3. Comprehensive Code Classification

### Category A: Temporary-Only Code (Strong Removal Candidates)

These files and code blocks exist solely for development-phase scaffolding, visual playgrounds, or obsolete templates. They have no place in a production commercial platform.

| Item ID | Exact Path                                                                                                                                                                                              | Description & Purpose                                                                                                            | References & Consumers                                                                                           | Removal Risk                      | Verification Before Deletion                                                               |
| :------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------- | :-------------------------------- | :----------------------------------------------------------------------------------------- |
| **A-1** | [`apps/web/src/modules/dashboard/routes/dashboard-ui-states-page.tsx`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/dashboard/routes/dashboard-ui-states-page.tsx)                         | "Milestone A5.6 Validation Screen". Dedicated test route exercising simulated states and embedding the A6 infrastructure panel.  | Referenced in `dashboard.router.tsx`, `navigation.config.ts`, and tested in `dashboard-ui-states-page.spec.tsx`. | Low. Pure validation view.        | Move state-validation assertions into dedicated `@kinergy-platform/testing` harness tests. |
| **A-2** | [`apps/web/src/modules/dashboard/components/infrastructure-integration-panel.tsx`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/dashboard/components/infrastructure-integration-panel.tsx) | "Step A6.8 Infrastructure Showcase". Contains crash trigger buttons, mock mutation triggers, 401 simulators, and toast triggers. | Embedded solely in `dashboard-ui-states-page.tsx`. Tested in `infrastructure-integration-panel.spec.tsx`.        | Low. Scaffolding component.       | Ensure standard mutation and error boundary unit tests in `shared/api` cover all behavior. |
| **A-3** | [`apps/web/src/modules/dashboard/routes/dashboard-metrics-page.tsx`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/dashboard/routes/dashboard-metrics-page.tsx)                             | Hardcoded sub-route view displaying "Telemetry Throughput: 48.2k msg/sec" and "14.2 ms".                                         | Referenced in `dashboard.router.tsx` and linked from `dashboard-overview-page.tsx`.                              | Low. Completely static mock data. | Remove route registration and link from overview page.                                     |
| **A-4** | [`apps/web/src/shared/debug/debug-helper.ts`](file:///c:/Projects/kinergy-platform/apps/web/src/shared/debug/debug-helper.ts)                                                                           | Attaches `window.__KINERGY_DEBUG__` containing internal logger, config, and queryClient.                                         | Called in `main.tsx`.                                                                                            | Low. Dev-only convenience.        | Check no E2E tests rely on `window.__KINERGY_DEBUG__`.                                     |
| **A-5** | [`apps/web/src/modules/energy/`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/energy/)                                                                                                     | Empty stub module (`export {};`) from legacy energy boilerplate.                                                                 | Referenced in `app-router.tsx` and `navigation.config.ts`.                                                       | None. Dead code.                  | Verify no feature imports `modules/energy`.                                                |
| **A-6** | [`apps/web/src/modules/analytics/`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/analytics/)                                                                                               | Empty stub module (`export {};`) from legacy energy boilerplate.                                                                 | Referenced in `app-router.tsx` and `navigation.config.ts`.                                                       | None. Dead code.                  | Verify no feature imports `modules/analytics`.                                             |
| **A-7** | `dashboard-ui-states` navigation item in [`navigation.config.ts`](file:///c:/Projects/kinergy-platform/apps/web/src/app/navigation/navigation.config.ts#L37-L43)                                        | Navigation entry with icon `TestTube` linking to `/dashboard/ui-states`.                                                         | Consumed by `NavigationProvider` and sidebar.                                                                    | None. Test scaffolding link.      | Remove from array.                                                                         |
| **A-8** | Synthetic test endpoints in [`apps/web/src/test/mocks/handlers.ts`](file:///c:/Projects/kinergy-platform/apps/web/src/test/mocks/handlers.ts#L25-L51)                                                   | Handlers for `/api/v1/test/mutation-success`, `/api/v1/test/mutation-failure`, `/api/v1/test/auth-failure`.                      | Consumed solely by `InfrastructureIntegrationPanel`.                                                             | Low.                              | Remove once `InfrastructureIntegrationPanel` is retired.                                   |

---

### Category B: Reusable Production Code (Must Be Retained)

These files provide essential architectural infrastructure, UI primitives, and foundational patterns that must be preserved and utilized across all production feature modules.

| Item ID | Exact Path                                                                                                                          | Description & Production Value                                                                                                                          |
| :------ | :---------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **B-1** | [`packages/ui/src/`](file:///c:/Projects/kinergy-platform/packages/ui/src/)                                                         | Design system library: `Button`, `Card`, `Badge`, `StateView`, `Skeleton`, `Dialog`, `Table`, `Input`, `Form`. Fully accessible Radix-based primitives. |
| **B-2** | [`apps/web/src/shared/api/`](file:///c:/Projects/kinergy-platform/apps/web/src/shared/api/)                                         | Centralized `httpClient`, `useStandardMutation`, error normalization, and standard query configuration.                                                 |
| **B-3** | [`apps/web/src/shared/auth/`](file:///c:/Projects/kinergy-platform/apps/web/src/shared/auth/)                                       | `authTokenStore` (in-memory token lifecycle), `auth-transport.ts` (Bearer header injection & 401 refresh interception), `redirect-utils.ts`.            |
| **B-4** | [`apps/web/src/app/layouts/`](file:///c:/Projects/kinergy-platform/apps/web/src/app/layouts/)                                       | `DashboardLayout`, `AuthLayout`, `MainLayout`, top navigation, breadcrumbs, and sidebar components.                                                     |
| **B-5** | [`apps/web/src/app/routes/permission-guard.tsx`](file:///c:/Projects/kinergy-platform/apps/web/src/app/routes/permission-guard.tsx) | `RequirePermission` component enforcing RBAC/permission scoping on routes and sub-trees.                                                                |
| **B-6** | [`apps/web/src/shared/ui/slots/`](file:///c:/Projects/kinergy-platform/apps/web/src/shared/ui/slots/)                               | Slot injection framework (`SlotInject`, `SlotOutlet`) allowing child views to project action buttons into the parent shell header.                      |
| **B-7** | Feature Modules: `sales`, `resources`, `gym`, `client`, `identity`                                                                  | Real domain modules implementing business features, forms, and API integrations.                                                                        |

---

### Category C: Mixed Files (Requiring Careful Separation)

These files contain a mix of production-grade architectural code and temporary test scaffolding. They require surgical refactoring rather than wholesale deletion.

| Item ID | Exact Path                                                                                                                                                                    | Production Code to Retain                                                                                                                        | Scaffolding Code to Remove                                                                                                                                           | Separation Strategy                                                                                                                                                                                                               |
| :------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C-1** | [`apps/web/src/modules/dashboard/routes/dashboard-overview-page.tsx`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/dashboard/routes/dashboard-overview-page.tsx) | Header structure, slot injection, responsive grid layout, card containers.                                                                       | `simulationState` state hook (`useState`), `4-State UI Simulation Controller` card, `Step A5.2 Validation` badge, `UI States & A6 Showcase` link button.             | Replace `simulationState` with real operational query hooks (`useDashboardSummaryQuery` or domain-specific overview queries). Render genuine business operational summaries (active memberships, today's schedule, sales totals). |
| **C-2** | [`apps/web/src/modules/dashboard/api/dashboard-queries.ts`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/dashboard/api/dashboard-queries.ts)                     | Real query hooks (`useDashboardMetricsQuery`, `useDashboardStatusQuery`, `useDashboardActivitiesQuery`) and query key factory (`dashboardKeys`). | In-memory mock data (`MOCK_METRICS`, `MOCK_STATUS`, `MOCK_ACTIVITIES`) and simulation hooks (`useDashboardMetrics`, `useDashboardStatus`, `useDashboardActivities`). | Remove simulated hooks; wire the real query hooks to production backend endpoints once defined.                                                                                                                                   |
| **C-3** | [`apps/web/src/app/routes/app-router.tsx`](file:///c:/Projects/kinergy-platform/apps/web/src/app/routes/app-router.tsx)                                                       | Core hybrid router, layout wrapping, authentication boundaries, dynamic module delegation.                                                       | `EnergySubRouter`, `AnalyticsSubRouter`, `PlaceholderView` routes for `/clients` and `/auth/reset-password`, `/shell` playground route.                              | Replace `PlaceholderView` entries with real feature screens as modules are productized. Delete `EnergySubRouter` and `AnalyticsSubRouter`.                                                                                        |
| **C-4** | [`apps/web/src/main.tsx`](file:///c:/Projects/kinergy-platform/apps/web/src/main.tsx)                                                                                         | Application bootstrap, config resolution, auth transport setup, React DOM mount.                                                                 | Unconditional `await initMsw()` and `initDebugHelpers()`.                                                                                                            | Wrap `initMsw()` in an explicit environment check (`import.meta.env.VITE_ENABLE_MSW === 'true'`) so production builds do not pull MSW service workers. Conditionally gate debug helpers to development builds.                    |
| **C-5** | [`apps/web/src/app/navigation/navigation.config.ts`](file:///c:/Projects/kinergy-platform/apps/web/src/app/navigation/navigation.config.ts)                                   | Authoritative navigation structure, icons, permission mappings, sorting order.                                                                   | `dashboard-ui-states`, `energy`, `analytics` navigation items.                                                                                                       | Remove temporary and dead items; register production modules (Kinesiology, Gym, Reception).                                                                                                                                       |

---

### Category D: Uncertain Code Requiring Verification

| Item ID | Path 1                                                                                                      | Path 2                                                                                                              | Conflict / Uncertainty                                                                                                                                                                                                                                                                                                               | Verification Required                                                                                                                                                                                                      |
| :------ | :---------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-1** | [`apps/web/src/modules/attendance/`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/attendance/) | [`apps/web/src/modules/gym/attendance/`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/gym/attendance/) | Two separate implementations of Gym Attendance & Reception exist side by side. `modules/attendance` is registered at `/attendance`. `modules/gym/attendance` is nested at `/gym/attendance/*`. `modules/gym/attendance` features URL-sync filters (`useAttendanceFilters`) and history dialogs, while `modules/attendance` is older. | Verify whether any other feature or test still imports from `modules/attendance`. If `modules/gym/attendance` provides strict feature superset, consolidate into `modules/gym/attendance` and retire `modules/attendance`. |

---

## 4. Preservation of Test Functionality

The temporary UI currently serves a valuable function: validating that components adhere to the **4-State UI Contract** (Loading, Empty, Error, Success).

To ensure that removing the visual test pages does not degrade test coverage:

1. **Retain Component-Level Test Suites:** The tests in `dashboard-ui-states-page.spec.tsx` and `infrastructure-integration-panel.spec.tsx` prove that `@kinergy-platform/ui`'s `StateView` primitive correctly renders loading skeletons, error alerts with retry callbacks, empty states with CTA buttons, and populated data views.
2. **Move into Component Test Harnesses:** Rather than rendering a visual route at `/dashboard/ui-states`, relocate these test scenarios into `packages/ui/src/__tests__/state-view.spec.tsx` or `@kinergy-platform/testing`.
3. **Automated MSW Contract Proofs:** Retain MSW integration tests (`mock-backend-transport.spec.ts`) in the Vitest test runner. They run in Node.js via `server.ts` during CI without requiring a live browser screen or production navigation entry.

---

## 5. Deletion & Refactoring Safe-Execution Checklist

When executing removals in Milestone 2:

- [ ] Confirm no production route references `/dashboard/ui-states` or `/dashboard/metrics`.
- [ ] Confirm no unit or E2E tests break upon removing the `dashboard-ui-states` navigation item.
- [ ] Update `dashboard-overview-page.tsx` to remove simulation controls and validation badges.
- [ ] Ensure `initMsw()` is strictly conditional on `VITE_ENABLE_MSW === 'true'`.
- [ ] Remove `apps/web/src/modules/energy` and `apps/web/src/modules/analytics`.
- [ ] Re-run `pnpm validate` to prove zero regressions.
