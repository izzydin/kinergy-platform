# ADR 0042: Frontend Authentication Login Feature Architecture & Contract

- **Status:** Accepted / Active Standard
- **Date:** 2026-08-11
- **Scope:** Frontend Identity Bounded Context (`apps/web/src/modules/identity/authentication/`)
- **Target Context:** Kinergy Platform Web (`@kinergy-platform/web`)

---

## 1. Context & Problem Statement

Track A and ADR 0041 established the frontend authentication infrastructure, including `AuthProvider`, `AuthTokenStore` (in-memory access token storage), `AuthTransportManager` (401 Refresh Token Rotation single-flight queue), silent bootstrap, and session recovery.

Step B1.0 introduces the **Login Feature** as the first vertical slice of the **Identity Bounded Context** (`modules/identity/authentication/`).

Before building visual UI components in Step B1.1, the frontend must establish a rigorous architectural contract specifying:

- Strict responsibility boundaries between shared auth infrastructure and the feature slice.
- Module encapsulation via a controlled public API boundary (`index.ts`).
- Standardized credential validation using Zod schemas (`packages/validation` alignment).
- Single-responsibility state ownership across server state (TanStack Query), URL state (React Router), form state (React Hook Form), validation, auth context state (`AuthProvider`), and local UI states.
- 6 canonical UI states: Initial, Validation Error, Submitting/Loading, Authentication Error (401), Network Error (500/offline), and Successful Authentication.
- Mock Service Worker (MSW v2) endpoint parity matching backend `POST /api/v1/auth/login` contracts.

---

## 2. Responsibility Boundaries

To maintain clean architecture and prevent token handling leakage into presentation components, responsibilities are partitioned as follows:

| Layer / Module                                                  | Primary Responsibility                                                                                                                                                                                                           | FORBIDDEN Actions                                                                                                                                                                                       |
| :-------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Shared Auth Infrastructure** (`shared/auth/`, `shared/api/`)  | • In-memory access token storage (`authTokenStore`)<br>• HTTP header injection (`Authorization: Bearer`)<br>• 401 response interception & RTR single-flight refresh queue<br>• Standard mutation lifecycle & error normalization | • MUST NOT contain feature forms or login UI<br>• MUST NOT store tokens in `localStorage` or `sessionStorage`<br>• MUST NOT manage feature-specific login view states                                   |
| **Authentication Feature** (`modules/identity/authentication/`) | • Credential validation schema (`loginSchema`)<br>• Login mutation execution (`useLoginMutation`)<br>• API fetcher function (`executeLogin`)<br>• Route definition (`LoginRoute`)<br>• Login MSW mock handlers (`loginHandlers`) | • MUST NOT parse JWT tokens inside UI views<br>• MUST NOT manually manage refresh token cookies<br>• MUST NOT duplicate HTTP interceptor logic<br>• MUST NOT expose internal helpers outside `index.ts` |
| **Auth Context Provider** (`modules/auth/`)                     | • Canonical `AuthStatus` state machine<br>• Current user session context (`AuthUser`)<br>• Transitioning state to `AUTHENTICATED` via `login()` action<br>• Bootstrap lifecycle & silent refresh                                 | • MUST NOT handle login form inputs or validation errors                                                                                                                                                |

---

## 3. Canonical Login Execution Flow

```
User Enters Credentials
         │
         ▼
React Hook Form (Form State)
         │
         ▼
Zod Validation (loginSchema)
         │
         ▼
Login Mutation (useLoginMutation)
         │
         ▼
Authentication API (executeLogin)
         │
         ▼
HttpClient POST /api/v1/auth/login (skipAuth: true)
         │
         ├─────────────────────────────────────────┐
         ▼                                         ▼
   [ 200 OK Response ]                     [ Error Response ]
         │                                         │
Set Access Token in Memory                 Normalize ApiError
 (`authTokenStore.setAccessToken`)           (AuthenticationError 401,
         │                                    RateLimitError 429,
Update AuthProvider State                     ValidationError 400,
 (`auth.login()`)                             ServerError 500, NetworkError)
         │                                         │
Navigate to Target Protected Route            Render UI Error Presentation
 (`?redirect=<targetPath>` or `/dashboard`)   (Validation / Auth / Network)
```

### Flow Specifications:

1. **Input Collection & Validation**: React Hook Form manages form state and validates input against `loginSchema` (Zod).
2. **Network Request**: `executeLogin` invokes `httpClient.post<LoginResponse>('/api/v1/auth/login', credentials, { skipAuth: true })`.
3. **Token Memory Storage**: On success (`200 OK`), `executeLogin` updates `authTokenStore.setAccessToken(response.accessToken)`. HttpOnly refresh cookies are automatically saved by the browser.
4. **Auth Context Synchronization**: `useLoginMutation` calls `auth.login()` which fetches `/api/v1/auth/me` and transitions `AuthProvider` to `AUTHENTICATED`.
5. **Post-Login Redirection**: Reads the `redirect` URL search parameter from React Router (`useSearchParams`). If absent, defaults to `/dashboard`.

---

## 4. State Ownership Governance

In strict adherence to the platform's Single-Responsibility State Taxonomy:

| State Type         | Owner / Tool                            | Description                                                                  |
| :----------------- | :-------------------------------------- | :--------------------------------------------------------------------------- |
| **Server State**   | `@tanstack/react-query` (`useMutation`) | Controls network request lifecycle, submission status, and retry mechanics.  |
| **URL State**      | React Router (`useSearchParams`)        | Manages the `redirect` query parameter to preserve user intent across login. |
| **Form State**     | `react-hook-form`                       | Buffers user inputs without triggering unnecessary component re-renders.     |
| **Validation**     | `zod` (`loginSchema`)                   | Enforces schema constraints and produces typed field validation errors.      |
| **Auth State**     | `AuthProvider` context (`useAuth`)      | Governs global user authentication status (`AuthStatus` & `currentUser`).    |
| **Local UI State** | React `useState`                        | Manages local presentation toggles (e.g. password visibility toggle).        |

---

## 5. Explicit UI States Specification

The Login feature slice MUST support the following 6 discrete UI states:

1. **`INITIAL`**: Form mounted, default values populated, pristine input state.
2. **`VALIDATION_ERROR`**: Client-side Zod validation failed (e.g. invalid email format or password under 8 characters).
3. **`SUBMITTING` / `LOADING`**: Network request in flight. Form inputs and submit button disabled. Loading spinner active.
4. **`AUTHENTICATION_ERROR`**: Backend returned `401 Unauthorized`. Display generic message ("Invalid email or password").
5. **`NETWORK_ERROR`**: Backend returned `500 ServerError`, `429 RateLimitError`, or client offline. Display recoverable alert with retry option.
6. **`SUCCESS`**: Authentication succeeded, token stored, session updated. Transitioning to protected route.

---

## 6. API Contract & MSW Parity

The Login feature consumes backend contract `POST /api/v1/auth/login`:

### Request DTO (`LoginCredentials`):

```json
{
  "email": "operator@kinergy.io",
  "password": "Password123!"
}
```

### Response DTO (`LoginResponse`):

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
  "expiresIn": 900,
  "user": {
    "id": "usr-dev-123",
    "email": "operator@kinergy.io",
    "name": "Enterprise Operator",
    "roles": ["OPERATOR"],
    "permissions": ["client:read", "energy:read", "analytics:read"],
    "tenantId": "tenant_default"
  }
}
```

### MSW Handler Simulation Triggers (`X-Sim-State` Header):

- `unauthorized`: Simulates 401 Unauthorized (`Invalid email or password.`).
- `rate-limited`: Simulates 429 Too Many Requests (`ThrottlerException: Too Many Requests`).
- `validation-error`: Simulates 400 Bad Request with field validation errors.
- `network-error`: Simulates 500 Internal Server Error / Gateway outage.

---

## 7. Public API Encapsulation (`index.ts`)

To prevent tight coupling and preserve clean boundaries, external modules MUST import only from `@/modules/identity/authentication`:

```typescript
// Public API Boundary Contract
export { loginSchema } from './domain/login.schema';
export type {
  LoginCredentials,
  LoginResponse,
  LoginResult,
  LoginState,
} from './domain/login.types';
export { useLoginMutation } from './api/use-login-mutation';
export { executeLogin } from './api/login-api';
export { LoginRoute } from './routes/login-route';
export { loginHandlers } from './mocks/login-handlers';
```

Reaching directly into subfolders (`/components/*`, `/hooks/*`, `/api/*`) is strictly forbidden and enforced via ESLint boundary rules.

---

## 8. Verification Strategy

- **Validation Unit Tests**: Test Zod schema validation edge cases (empty email, invalid syntax, short password, whitespace trimming).
- **Mutation Integration Tests**: MSW-backed tests verifying token registration in `authTokenStore`, state transition in `AuthProvider`, and `redirect` route calculation.
- **Error Handling Specs**: Verify `ApiError` normalization across 401, 429, 400, and 500 responses.
- **Quality Gates**: Every step must pass `pnpm write`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm validate`.
