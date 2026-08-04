# Application Shell & Shared Provider Infrastructure (`apps/web/src/app/`)

- **Status:** Active / Authoritative Architecture Standard
- **Scope:** `@kinergy-platform/web` (`apps/web/src/app/`)
- **Target Application:** Kinergy Platform Application Shell & Shared Providers

---

## 1. Overview & Architectural Role

The `apps/web/src/app/` directory acts as the **Application Composition Root** and **Shared Provider Hierarchy**.

In Clean Architecture and Domain-Driven Design (DDD), the Provider Hierarchy guarantees that:

1. Every category of state (Server, UI, Ephemeral Notifications, Auth, Localization, Feature Flags, Navigation) is managed by a single-responsibility provider.
2. Cross-cutting infrastructure concerns are composed predictably without creating global singletons or service locators.
3. Feature modules (`src/modules/*`) consume shared provider contexts cleanly via custom hooks (`useAuth`, `useTheme`, `useNotification`, `useFeatureFlags`, `useLocale`).

---

## 2. Complete Provider Hierarchy & Responsibility Matrix

Providers are composed in a strict top-down order to ensure error boundaries catch lower provider failures, server state is accessible to visual and routing layers, and visual theme tokens decorate all UI elements.

### Master Provider Nesting Order

```
<RootErrorBoundaryProvider>      (1. Outermost: Catch system-critical runtime JS exceptions)
  <QueryProvider>                (2. Server State: TanStack Query client & cache reset boundaries)
    <ThemeProvider>              (3. UI Visual State: Theme mode & dark class management)
      <NotificationProvider>     (4. Ephemeral Alerts: Toast & alert notification channel)
        <AuthProvider>           (5. Identity Context: User session & permission claims placeholder)
          <LocaleProvider>       (6. Localization: i18n multi-language locale placeholder)
            <FeatureFlagProvider>(7. SaaS Feature Flags: Dynamic flag evaluation placeholder)
              <RouterProvider>   (8. Innermost: React Router browser navigation context)
                <AppRouter />    (Hybrid Router Shell & Layouts)
              </RouterProvider>
            </FeatureFlagProvider>
          </LocaleProvider>
        </AuthProvider>
      </NotificationProvider>
    </ThemeProvider>
  </QueryProvider>
</RootErrorBoundaryProvider>
```

### Provider Responsibilities Breakdown

| Provider Component              | State Category     | Primary Responsibility                                                                                                         | Hook / Contract                   | Rationale for Ordering                                                                                                                                |
| :------------------------------ | :----------------- | :----------------------------------------------------------------------------------------------------------------------------- | :-------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`RootErrorBoundaryProvider`** | Infrastructure     | Catches uncaught runtime JavaScript exceptions at application root.                                                            | `<DefaultRootErrorFallback />`    | **Outermost (Pos 1)**: Must surround all lower providers so that initialization crashes in Query, Theme, or Router components are safely intercepted. |
| **`QueryProvider`**             | Server State       | Manages TanStack `QueryClient` lifecycle, default stale times (5 min), and exponential backoff retries for 5xx/network errors. | `useQuery`, `useMutation`         | **Pos 2**: Server state must be available to all hooks and feature views below it, while remaining inside the error boundary.                         |
| **`ThemeProvider`**             | UI Visual State    | Manages visual theme mode (`'light' \| 'dark' \| 'system'`) and toggles `.dark` CSS class on `document.documentElement`.       | `useTheme()`                      | **Pos 3**: Provides visual design system HSL variables to all UI primitives rendered inside routes and toast containers.                              |
| **`NotificationProvider`**      | Ephemeral Feedback | Provides non-blocking alert context for user mutations, error banners, and success toasts.                                     | `useNotification()`, `useToast()` | **Pos 4**: Ephemeral toasts require access to Theme context for proper visual styling and need to be accessible to child routes.                      |
| **`AuthProvider`**              | Identity Context   | Infrastructure placeholder for future user session state, JWT token lifecycle, and permission claims.                          | `useAuth()`                       | **Pos 5**: Session state decorates routing decisions and view rendering without containing business login execution logic.                            |
| **`LocaleProvider`**            | Localization       | Infrastructure placeholder for future i18n multi-language translation dictionaries.                                            | `useLocale()`, `useTranslation()` | **Pos 6**: Provides translation functions `t(key)` for downstream feature component rendering.                                                        |
| **`FeatureFlagProvider`**       | SaaS Flags         | Infrastructure placeholder for dynamic SaaS tier feature flag evaluation (`ENABLE_TELEMETRY`, `ENABLE_ADVANCED_ANALYTICS`).    | `useFeatureFlags()`               | **Pos 7**: Evaluates feature toggles before routes render feature views.                                                                              |
| **`RouterProvider`**            | URL Navigation     | Wraps React Router (`BrowserRouter`) to enable route matching, deep linking, and search params.                                | `useNavigate()`, `useLocation()`  | **Innermost (Pos 8)**: Router relies on all higher-level providers when rendering route views and page transitions.                                   |

---

## 3. Scalability & Composition Guarantees

- **Composition Over Inheritance**: Functional composition helper `composeProviders([P1, P2, P3])` enforces provider nesting without deep JSX indentation.
- **Zero Global Singletons**: Every provider manages its own state instance within React lifecycle hooks, facilitating clean unit testing and test harness mocking (`@kinergy-platform/testing`).
- **No Business Logic Pollution**: Providers offer generic contracts and hooks; business logic resides exclusively within domain feature modules (`src/modules/*`).
