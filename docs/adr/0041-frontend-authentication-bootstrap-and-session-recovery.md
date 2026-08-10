# ADR 0041: Frontend Authentication Bootstrap & Session Recovery Architecture

- **Status:** Accepted / Active Standard
- **Date:** 2026-08-10
- **Scope:** Frontend Application Architecture (`apps/web/src/modules/auth`, `apps/web/src/shared/auth`)
- **Target Context:** Kinergy Platform Web (`@kinergy-platform/web`)

---

## 1. Context & Problem Statement

Phase 1 backend architecture establishes a secure token-based authentication system using:

- Short-lived JWT Access Tokens (transmitted via HTTP `Authorization: Bearer <token>` headers).
- Long-lived Refresh Tokens (transmitted via HttpOnly, Secure, SameSite cookies).
- Refresh Token Rotation (RTR) with reuse detection.
- Fine-grained Role-Based Access Control (RBAC) and permission guards.

Track A established frontend transport mechanics (`authTokenStore` for in-memory token storage, `AuthTransportManager` for single-flight 401 refresh queuing, and `httpClient`).

Before implementing the Login UI or user management features in Track B, the frontend must establish a clear architectural boundary between **Shared Transport Infrastructure** and **Authentication Feature Domain**, enforcing an explicit canonical authentication state machine, application bootstrap lifecycle, session recovery, and protected route guard behaviors.

---

## 2. Architectural Boundaries & Responsibility Separation

To prevent tight coupling and token handling leakage across UI components, the architecture enforces a strict 3-tier boundary:

| Layer                      | Component Scope                | Responsibilities                                                                                                                                                                                                                                                                     | Forbidden Actions                                                                                                                                                           |
| :------------------------- | :----------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shared Infrastructure**  | `shared/auth/`, `shared/api/`  | • In-memory access token storage (`authTokenStore`)<br>• HTTP header injection (`Authorization: Bearer`)<br>• 401 response interception & refresh request queuing<br>• `X-Retry-Attempt: 1` header loop prevention<br>• Normalized HTTP error transport                              | • MUST NOT store tokens in `localStorage` or `sessionStorage`<br>• MUST NOT contain business authentication state<br>• MUST NOT manage login UI or user profile view models |
| **Authentication Feature** | `modules/auth/`                | • Canonical `AuthStatus` state machine<br>• Bootstrap lifecycle & silent refresh execution<br>• Session recovery (F5 / page reload)<br>• Current user profile domain state (`UserSession`)<br>• Login & logout state transitions<br>• Permission checks (`hasPermission`, `hasRole`) | • MUST NOT access or parse JWT tokens in UI components<br>• MUST NOT duplicate HTTP transport interception<br>• MUST NOT expose raw tokens to React views                   |
| **UI Presentation**        | `app/routes/`, View Components | • Form rendering & user interaction<br>• Protected/Public route layout wrapping<br>• Rendering loading skeletons during `BOOTSTRAPPING`<br>• Rendering access denied UI (`ForbiddenView`)                                                                                            | • MUST NOT read, write, or inspect access/refresh tokens directly<br>• MUST NOT execute direct fetch calls to auth endpoints                                                |

---

## 3. Canonical Authentication State Model

The frontend authentication state is governed by an explicit state machine represented by the `AuthStatus` type. Scattered boolean flags (e.g. `isLoggedIn`, `isLoading`, `hasToken`) are forbidden as primary state representations.

```typescript
export type AuthStatus =
  | 'BOOTSTRAPPING' // Application startup: silent refresh & session recovery in progress
  | 'AUTHENTICATED' // Active session confirmed: valid token in memory, user profile loaded
  | 'UNAUTHENTICATED' // No active session: refresh failed or logged out. Ready for login
  | 'AUTHENTICATION_ERROR'; // Network/gateway failure during bootstrap: allows manual retry
```

### Derived Properties & Convenience Getters

From the canonical `AuthStatus` state, the `AuthContextState` exposes convenience getters:

- `isAuthenticated`: `status === 'AUTHENTICATED'`
- `isBootstrapping`: `status === 'BOOTSTRAPPING'`
- `isUnauthenticated`: `status === 'UNAUTHENTICATED'`

---

## 4. Application Bootstrap & Session Recovery Sequence

When the application mounts (`main.tsx` / `AppProvider`), authentication state immediately enters `BOOTSTRAPPING`.

```
[ Application Mounts (main.tsx / AppProvider) ]
                       │
                       ▼
          status = 'BOOTSTRAPPING'
                       │
                       ▼
      Execute Silent Refresh (POST /api/v1/auth/refresh)
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
  [ Refresh OK (200) ]        [ Refresh Fail (401/403) ]
         │                           │
Set Access Token in Memory   Clear Memory Token
 (`authTokenStore`)          (`authTokenStore.clearSession()`)
         │                           │
Fetch User Profile (`/auth/me`)  Transition to 'UNAUTHENTICATED'
         │                           │
Transition to 'AUTHENTICATED'   Redirect to /auth/login (Protected Routes)
```

### Session Recovery Scenarios

1. **Page Reload (F5) / Browser Restart**:
   - Access tokens are cleared from memory upon window unmount.
   - Upon remount, `AuthProvider` enters `BOOTSTRAPPING` and executes `POST /api/v1/auth/refresh`.
   - The browser automatically attaches the `HttpOnly` refresh token cookie.
   - On 200 OK, the new access token is stored in `authTokenStore`, current user profile is fetched (`GET /api/v1/auth/me`), and state transitions to `AUTHENTICATED` seamlessly.

2. **Expired Access Token (401 Response During Active Session)**:
   - `AuthTransportManager` intercepts the 401 response and pauses concurrent HTTP requests.
   - Executes single-flight refresh request (`POST /api/v1/auth/refresh`).
   - On success, updates `authTokenStore` and retries the original request with `X-Retry-Attempt: 1`.

3. **Revoked / Expired Refresh Token**:
   - `POST /api/v1/auth/refresh` returns 401 Unauthorized.
   - `AuthTransportManager` calls `authTokenStore.clearSession()`.
   - `AuthProvider` transitions state to `UNAUTHENTICATED`.
   - Protected route guards redirect user to `/auth/login?redirect=<targetPath>`.

4. **Temporary Network Error During Bootstrap**:
   - If `POST /api/v1/auth/refresh` fails due to a `NetworkError` (offline / gateway disconnect):
   - `AuthProvider` transitions state to `AUTHENTICATION_ERROR`.
   - Renders a connection recovery fallback with a **"Retry Connection"** action (`retryBootstrap()`).
   - Prevents treating offline network blips as credential revocation.

---

## 5. Protected Route & Guard Architecture

Protected routes (`<ProtectedRoute />`) enforce security boundaries based on `AuthStatus`:

| `AuthStatus`               | Protected Route Behavior                                                                                                                     | Render Output                                                      |
| :------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------- |
| **`BOOTSTRAPPING`**        | • Pauses route evaluation.<br>• **DOES NOT REDIRECT** to `/auth/login`.<br>• Prevents premature redirect loops.                              | `<SuspenseFallback label="Verifying session authentication..." />` |
| **`AUTHENTICATION_ERROR`** | • Displays connection recovery card.<br>• Offers manual `retryBootstrap()` trigger.                                                          | `<StateView state="error" onRetry={retryBootstrap} />`             |
| **`UNAUTHENTICATED`**      | • Preserves target path in `?redirect` query param.<br>• Redirects to login entry point.                                                     | `<Navigate to="/auth/login?redirect=..." replace />`               |
| **`AUTHENTICATED`**        | • Validates required permissions & roles.<br>• Renders protected view if authorized.<br>• Renders `<ForbiddenView />` (403) if unauthorized. | `<Outlet />` or `<ForbiddenView />`                                |

---

## 6. Security & Storage Compliance

1. **Zero Persistent Storage for Tokens**:
   - Access tokens exist **ONLY** in `AuthTokenStore` (in-memory variable).
   - `localStorage` and `sessionStorage` are strictly forbidden for JWT or session credentials.

2. **HttpOnly Cookie Protection**:
   - Refresh tokens are managed exclusively by the browser via HttpOnly, Secure, SameSite cookies.
   - JavaScript code has zero access to read or inspect refresh token bytes.

3. **Redaction in Log Telemetry**:
   - `PlatformLogger` redacts `Authorization`, `Bearer`, `refreshToken`, and `password` fields across all log outputs.

---

## 7. Consequences & Verification

- **Positive**:
  - Provides a rock-solid, production-ready authentication foundation for Track B feature modules (Login form, User Management, RBAC screens).
  - Eliminates premature login redirects and F5 session loss.
  - Prevents token handling duplication across UI views.
- **Verification**:
  - Verified by 100% unit and integration test coverage (`auth-bootstrap-and-recovery.spec.tsx`).
