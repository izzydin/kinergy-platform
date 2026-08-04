# Frontend Routing Foundation Architecture (`apps/web/src/app/routes/`)

- **Status:** Active / Authoritative Architecture Standard
- **Scope:** `apps/web/src/app/routes/` and Decentralized Feature Routers (`src/modules/*/routes/`)
- **Target Application:** `@kinergy-platform/web` (React Router v6+ in React 18)

---

## 1. Overview & Architectural Principles

The routing foundation implements the **Hybrid Feature Routing Architecture** defined in `docs/frontend/routing.md` and ADR-FE-0002.

The architecture enforces five core principles:

1. **Decentralized Route Registrations**: Central router shell delegates route path matching (`/auth/*`, `/clients/*`, `/energy/*`, `/analytics/*`) to feature sub-routers.
2. **Layered Layout Pipeline**: Route views inherit top-level layouts (`AuthLayout`, `DashboardLayout`, `MainLayout`) via nested React Router `<Outlet />` insertion points.
3. **Security Boundary Enforcement**: Public routes (`<PublicRoute />`) and protected routes (`<ProtectedRoute />`) strictly enforce authentication session evaluation and permission verification.
4. **Lazy Loading Infrastructure**: Dynamic view loading (`withLazy`, `LazyView`, `SuspenseFallback`) enforces the 4-state Loading contract to prevent layout shifts.
5. **Decentralized Module Registry**: Future feature modules register their route contracts dynamically via `moduleRegistry.register()`.

---

## 2. Component Responsibility Matrix

| Component                   | Responsibility                 | Rationale & Architectural Rule                                                                                                                                 |
| :-------------------------- | :----------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`AppRouter`**             | Central router shell.          | Orchestrates public vs. protected route groups, layout wrapping, and catch-all 404 routes.                                                                     |
| **`PublicRoute`**           | Public security guard.         | Accessible to anonymous visitors. Optionally redirects authenticated users away from `/auth/login`.                                                            |
| **`ProtectedRoute`**        | Authenticated security guard.  | Evaluates user session. Redirects unauthenticated visitors to `/auth/login?redirect=<path>`. Evaluates required permissions (`403 Forbidden` if unauthorized). |
| **`HasPermission`**         | Fine-grained element guard.    | Declaratively renders child elements matching `@RequirePermissions('client:write')`.                                                                           |
| **`moduleRegistry`**        | Decentralized route registry.  | Enables domain feature modules to register route contracts (`ModuleRouteDefinition`) without mutating central files.                                           |
| **`LazyView` / `withLazy`** | Code-splitting infrastructure. | Wraps lazy-loaded components in `<Suspense />` with a 4-state loading skeleton.                                                                                |
| **`AuthLayout`**            | Public layout shell.           | Centered glassmorphic container for login and password reset views.                                                                                            |
| **`DashboardLayout`**       | Application layout shell.      | Enterprise sidebar navigation, sticky top bar, and content outlet.                                                                                             |
| **`MainLayout`**            | Alternative layout shell.      | Full-width application wrapper for high-density telemetry views.                                                                                               |

---

## 3. Extensions to the ADR

To enhance future scalability, the implementation extends ADR-FE-0002 with two key architectural refinements:

1. **Decentralized `ModuleRouteRegistry` Pattern**:
   - Rather than hardcoding every feature module import inside `app-router.tsx`, `moduleRegistry` maintains a map of `ModuleRouteDefinition` entries (`{ id, prefix, title, isProtected, requiredPermissions, component }`).
   - Feature modules register their sub-router contract during startup, enabling modular feature flags and SaaS tier route mounting.

2. **Standardized Post-Login Redirect Pipeline**:
   - `<ProtectedRoute />` captures both `pathname` and `search` query parameters (`location.pathname + location.search`), encoding them into `?redirect=...`.
   - `<PublicRoute />` checks for `?redirect` upon successful login and redirects the user back to their original target view.
