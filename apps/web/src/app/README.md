# Application Shell & Composition Root Architecture (`apps/web/src/app/`)

- **Status:** Active / Authoritative Architecture Standard
- **Scope:** `@kinergy-platform/web` (`apps/web/src/app/`)
- **Target Application:** Kinergy Platform Application Shell

---

## 1. Overview & Architectural Role

The `apps/web/src/app/` directory acts as the **Application Composition Root** for the Kinergy Platform web application.

In Clean Architecture and Domain-Driven Design (DDD), the Composition Root is the unique location in the application where:

1. Architectural dependencies, configuration objects, and global providers are composed together.
2. Cross-cutting infrastructure concerns (Error Boundaries, Query Clients, Theme Context, Router Shells) are wired into a cohesive React component tree.
3. Feature modules (`src/modules/*`) are mounted into the root navigation shell without tightly coupling individual features to one another.

---

## 2. Provider Ordering & Responsibility Matrix

To prevent circular dependencies, state pollution, and cascading re-renders, providers are composed in a strict top-down order.

### Provider Hierarchy Tree

```
<RootErrorBoundaryProvider>      (1. Outermost: System-critical JS crash prevention)
  <QueryProvider>                (2. Server State: TanStack Query client & cache reset)
    <ThemeProvider>              (3. UI Theme State: HSL tokens & dark mode class)
      <ToastProvider>            (4. Ephemeral Alerts: Toast notification channel)
        <RouterProvider>         (5. Innermost: Browser navigation & route matching)
          <AppRouter />          (Hybrid Router Shell & Layouts)
        </RouterProvider>
      </ToastProvider>
    </ThemeProvider>
  </QueryProvider>
</RootErrorBoundaryProvider>
```

### Provider Responsibilities Breakdown

| Provider Component              | Architectural Layer | Primary Responsibility                                                                                                                                                         | Rationale for Ordering                                                                                                                                                                      |
| :------------------------------ | :------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`RootErrorBoundaryProvider`** | Infrastructure      | Catches uncaught runtime JavaScript exceptions at application root.                                                                                                            | **Outermost (Position 1)**: Must surround all lower providers so that initialization crashes in Query, Theme, or Router components are safely intercepted without crashing the browser tab. |
| **`QueryProvider`**             | Server State        | Manages TanStack Query `QueryClient` lifecycle, default stale times (5 min), and exponential backoff retries for 5xx/network errors. Integrates `<QueryErrorResetBoundary />`. | **Position 2**: Server state must be available to all custom hooks and feature views below it, while remaining inside the error boundary.                                                   |
| **`ThemeProvider`**             | UI Visual State     | Manages theme mode (`'light' \| 'dark' \| 'system'`) and toggles CSS class on `document.documentElement`.                                                                      | **Position 3**: Provides visual design system HSL variables to all UI primitives rendered inside routes and toast containers.                                                               |
| **`ToastProvider`**             | Ephemeral Feedback  | Provides non-blocking alert context (`useToast()`) for user mutations, error banners, and success messages.                                                                    | **Position 4**: Ephemeral toasts require access to Theme context for proper visual styling and need to be accessible to child routes.                                                       |
| **`RouterProvider`**            | URL Navigation      | Wraps React Router (`BrowserRouter`) to enable route matching, deep linking, and search params.                                                                                | **Innermost (Position 5)**: Router relies on all higher-level providers (Query, Theme, Toast) when rendering route views and page transitions.                                              |

---

## 3. Composition Principles

- **Composition Over Inheritance**: Providers are composed functionally using React tree nesting and the `composeProviders` helper utility rather than deep inheritance chains.
- **No Global Singletons / Service Locators**: Query Client instances and Theme state are managed via React state hooks and Context providers, ensuring clean test isolation and zero cross-request pollution.
- **Feature Isolation**: Business modules (`src/modules/*`) are consumed strictly via their public API contracts (`index.ts`) without exposing internal implementation details to the app shell.
