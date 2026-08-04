# Layout Architecture (`apps/web/src/app/layouts/`)

- **Status:** Active / Authoritative Architecture Standard
- **Scope:** `@kinergy-platform/web` (`apps/web/src/app/layouts/`)
- **Target Application:** Layout Composition Infrastructure & Routing Containers

---

## 1. Overview & Core Responsibilities

The `apps/web/src/app/layouts/` directory defines the **Layout Shell Architecture** for the Kinergy Platform frontend.

Layouts in Clean Architecture operate strictly as **Structural Composition Wrappers**:

1. **Composition Only**: Responsible exclusively for grid positioning, responsive viewports, sidebar collapses, and container padding.
2. **Zero Business Logic**: Layouts MUST NOT contain domain data fetching, state mutations, or business business rules.
3. **Zero Security Execution**: Authentication and authorization checks are enforced by higher-level route guards (`<ProtectedRoute />`, `<PublicRoute />`), NOT by layout components.
4. **Zero Feature-Specific Imports**: Layouts render dynamic feature content via React Router `<Outlet />` or explicit extension props.

---

## 2. Layout Catalog & Responsibilities

| Layout Component      | Visual / Structural Scope     | Primary Responsibilities                                                                                  | Standard Extension Points                                                      |
| :-------------------- | :---------------------------- | :-------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| **`DashboardLayout`** | Authenticated Workspace Shell | Responsive collapsible sidebar, sticky top header bar, breadcrumb slot, main content container.           | `navigationItems`, `headerExtra`, `breadcrumbs`, `sidebarFooter`, `<Outlet />` |
| **`AuthLayout`**      | Public Authentication Shell   | Centered glassmorphic container with backdrop blur for unauthenticated workflows (Login, Password Reset). | `header`, `footer`, `<Outlet />`                                               |
| **`BlankLayout`**     | Minimal / Full-Bleed Viewport | Minimal unadorned container for full-screen dashboards, embeddable widgets, or print views.               | `children`, `<Outlet />`                                                       |
| **`MainLayout`**      | Alternative Full-Width Shell  | Header navigation bar and content container for full-width landing pages or administrative toolings.      | `children`, `<Outlet />`                                                       |

---

## 3. Composition Strategy & Extension Points

### Stable Extension Points

Future domain feature modules (`src/modules/*`) plug into application layouts using two stable mechanisms:

#### A. Route Outlet Delegation (`<Outlet />`)

Route sub-trees render nested view components directly inside the layout's `<main>` outlet container without modifying layout source code.

#### B. Component Slot Props

Layouts accept explicit React node props to customize header widgets, breadcrumb trails, and navigation items dynamically:

```tsx
<DashboardLayout
  breadcrumbs={<ClientBreadcrumbs clientId={id} />}
  headerExtra={<UserAvatarMenu user={session.user} />}
  sidebarFooter={<SystemStatusIndicator />}
>
  <ClientProfileView />
</DashboardLayout>
```

---

## 4. Governance & Rules

- **Rule 1**: Never import feature domain hooks (`useClient`, `useTelemetry`) inside layout files.
- **Rule 2**: Keep layouts purely responsive using Tailwind CSS flex/grid primitives (`flex-col`, `md:flex-row`, `w-64`).
- **Rule 3**: All interactive layout controls (e.g. sidebar toggle) must remain local to component state (`useState`).
