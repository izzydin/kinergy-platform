# Development & Testing Infrastructure (`apps/web/src/test/`)

- **Status:** Active / Authoritative Architecture Standard
- **Scope:** `@kinergy-platform/web` (`apps/web/src/test/`) and Feature Modules (`src/modules/*/`)
- **Target Application:** Kinergy Platform Web Frontend

---

## 1. Executive Summary & Infrastructure Goals

The **Development Infrastructure** provides the foundational tools, mock service worker setup, testing utilities, logger abstractions, environment validators, and debug helpers required for offline feature development and Vitest integration testing.

Core Pillars:

1. **Mock Service Worker (MSW v2)**: Intercepts network requests at the browser / node network level without modifying application transport code.
2. **Platform Logger Foundation**: Structured logging abstraction supporting `'debug' | 'info' | 'warn' | 'error'` levels with environment-aware formatting (pretty console in dev, JSON in prod).
3. **Zod Environment Validation**: Parses `import.meta.env` against `clientEnvSchema` on startup with safe fallback defaults and clear diagnostic error messages.
4. **Testing Library Bootstrap**: `renderWithProviders()` custom render helper wrapping test components in the complete shared provider hierarchy (`QueryClientProvider`, `ThemeProvider`, `NotificationProvider`, `AuthProvider`, `LocaleProvider`, `FeatureFlagProvider`, `MemoryRouter`).
5. **Zero Business Mocks**: Contains 100% reusable infrastructure. Domain feature modules (`src/modules/*`) plug into `registerHandlers()` without polluting central test code.

---

## 2. Mock Service Worker (MSW v2) Architecture

- **Browser Worker** (`src/test/mocks/browser.ts`): Configured via `setupWorker(...handlers)`. Started dynamically on dev server launch by `initMsw()` (`main.tsx`).
- **Node Test Server** (`src/test/mocks/server.ts`): Configured via `setupServer(...handlers)` for Vitest unit & integration test suites.
- **Dynamic Handler Registration**: Feature modules register domain mock handlers via `registerHandlers(handler1, handler2)`.

---

## 3. Custom Test Render Helper (`renderWithProviders`)

Use `renderWithProviders()` in unit and component integration test suites:

```tsx
import { renderWithProviders, screen } from '@/test/test-utils';
import { DashboardLayout } from '@/app/layouts';

describe('DashboardLayout', () => {
  it('renders navigation header and sidebar', () => {
    renderWithProviders(<DashboardLayout />, { initialRoute: '/' });
    expect(screen.getByText('System Operational')).toBeInDocument();
  });
});
```

---

## 4. Developer Debug Helpers (`window.__KINERGY_DEBUG__`)

In development mode (`import.meta.env.DEV`), the browser console exposes `window.__KINERGY_DEBUG__`:

- `window.__KINERGY_DEBUG__.config`: Current application configuration parameters.
- `window.__KINERGY_DEBUG__.logger`: Active logger instance.
- `window.__KINERGY_DEBUG__.queryClient`: Active TanStack QueryClient instance.
- `window.__KINERGY_DEBUG__.version`: Build version.
