# Track B — Step B3 Protected Routing Architectural Contract

**Author**: Lead Frontend Architect  
**Platform**: Kinergy Platform  
**Target Module**: `apps/web/src/modules/auth/components/protected-route.tsx`, `apps/web/src/modules/auth/components/public-route.tsx`, `apps/web/src/app/routes/`  
**Status**: APPROVED & AUTHORITATIVE

---

## 1. Architectural Objectives & Security Boundaries

This document establishes the official architectural contract for **Track B — Step B3 Protected Routing Architecture** on the Kinergy Platform frontend.

### A. Routing Security Boundary Ownership

The routing guard layer (`ProtectedRoute`, `PublicRoute`, `AppRouter`) is strictly responsible for managing client-side route navigation safety based on the authoritative authentication state machine.

- **B3 OWNS**:
  - `ProtectedRoute` component (`apps/web/src/modules/auth/components/protected-route.tsx`).
  - `PublicRoute` component (`apps/web/src/modules/auth/components/public-route.tsx`).
  - **Unauthorized (401)** handling: Redirecting unauthenticated users to `/auth/login?redirect=<safePath>`.
  - **Forbidden (403)** handling: Rendering accessible `<ForbiddenView />` for authenticated users missing authorization claims.
  - **Redirect Handling & Loop Prevention**: Safe return-url sanitization and preventing self-referential `/auth/*` redirect loops.
  - **Bootstrap Gate**: Rendering accessible loading fallbacks during session bootstrap without flashing protected content or login forms.

- **B3 DOES NOT OWN**:
  - Authentication execution (`performLogin`, `performLogout`).
  - Token transport & storage (`AuthTokenStore`, `AuthTransportManager`).
  - Refresh implementation (`performSilentRefresh`).
  - Role or permission definition and computation (`AuthUser.permissions`, `AuthUser.roles`).
  - Backend authorization policies.

---

## 2. Authentication vs. Authorization Semantic Distinction

To ensure architectural clarity across all application modules, the frontend enforces a strict separation between **Authentication** and **Authorization**:

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                   Browser URL                                    │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
                          ┌─────────────────────────────┐
                          │    <ProtectedRoute />       │
                          └──────────────┬──────────────┘
                                         │
                   Is User Authenticated? (status === 'AUTHENTICATED')
                                         │
                  ┌──────────────────────┴──────────────────────┐
                  │                                             │
             NO (401-like)                                 YES (200 OK)
                  │                                             │
                  ▼                                             ▼
       ┌──────────────────────┐                Is User Authorized for Route?
       │    UNAUTHORIZED      │                (hasPermission / hasRole)
       │                      │                                 │
       │ Redirect to          │                 ┌───────────────┴───────────────┐
       │ /auth/login?redirect │                 │                               │
       └──────────────────────┘            NO (403-like)                   YES (200 OK)
                                                │                               │
                                                ▼                               ▼
                                     ┌─────────────────────┐         ┌─────────────────────┐
                                     │      FORBIDDEN      │         │   RENDER CONTENT    │
                                     │                     │         │                     │
                                     │ Render              │         │ <Outlet /> or       │
                                     │ <ForbiddenView />   │         │ child page          │
                                     │ (NO LOGIN REDIRECT) │         └─────────────────────┘
                                     └─────────────────────┘
```

- **Authentication (401 Unauthorized)**:
  - Answers: _"Is this user authenticated?"_
  - State: `status === 'UNAUTHENTICATED'` or `currentUser === null`.
  - Action: Redirect to `/auth/login?redirect=${encodeURIComponent(currentPath)}`.
- **Authorization (403 Forbidden)**:
  - Answers: _"Is this authenticated user allowed to access this specific resource?"_
  - State: `status === 'AUTHENTICATED'` AND user lacks required role/permission.
  - Action: Render dedicated, accessible `<ForbiddenView />`. **DO NOT redirect to Login**.

---

## 3. State Machine Routing Behavior Matrix

The router layer reacts predictably to the 4 canonical `AuthStatus` states from `AuthProvider`:

| `AuthStatus` State                  | Route Guard Action                                          | Visual Presentation                                                |
| :---------------------------------- | :---------------------------------------------------------- | :----------------------------------------------------------------- |
| **`BOOTSTRAPPING`**                 | Halts route transition. Does NOT redirect to `/auth/login`. | `<SuspenseFallback label="Verifying session authentication..." />` |
| **`AUTHENTICATION_ERROR`**          | Halts route transition. Preserves local session.            | Connection failure recovery card with `retryBootstrap()` button.   |
| **`UNAUTHENTICATED`**               | Redirects to `/auth/login?redirect=<safePath>`.             | Navigates to `/auth/login`.                                        |
| **`AUTHENTICATED` (Valid)**         | Grants access to target route.                              | Renders child route via `<Outlet />` or `children`.                |
| **`AUTHENTICATED` (Missing Claim)** | Blocks route access. Does NOT redirect to Login.            | Renders accessible `<ForbiddenView />` (403 Access Denied).        |

---

## 4. Open Redirect Prevention & Return Destination Policy

### A. Redirect Sanitization Contract (`sanitizeRedirectPath`)

To prevent Open Redirect vulnerabilities (CWE-601), return destinations passed via query parameters (`?redirect=...` or `?returnTo=...`) MUST be validated prior to navigation.

```typescript
export function sanitizeRedirectPath(rawPath: string | null | undefined): string {
  if (!rawPath) return '/dashboard';
  const trimmed = rawPath.trim();
  // Must start with '/' and MUST NOT start with '//' (scheme-relative exploit prevention)
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }
  return '/dashboard';
}
```

### B. Validation Rules:

1. **Allowed**: Relative paths starting with a single slash `/` (e.g., `/clients/123`, `/energy/meters?page=2`).
2. **Rejected**: Absolute URLs (`https://evil.com`), scheme-relative URLs (`//attacker.com/exploit`), empty strings, or null/undefined values.
3. **Fallback**: Any rejected redirect parameter automatically resolves to the default authenticated dashboard (`/dashboard`).

---

## 5. Accessibility Specifications for Routing Views

All routing fallback views (`SuspenseFallback`, `ForbiddenView`, `AuthenticationError`) enforce modern accessibility standards:

- **Semantic Headings**: Main headings wrapped in `<h1>` or `<h2>` elements.
- **ARIA Live Regions**: Screen readers are notified during state transitions via `aria-live="polite"` or `role="status"`.
- **Keyboard Navigation**: All action buttons (`Retry Connection`, `Return to Dashboard`) are keyboard focusable (`tabIndex={0}`) with visible focus rings.
- **Color Contrast**: All text elements comply with WCAG 2.1 AA color contrast minimums (4.5:1 ratio).
