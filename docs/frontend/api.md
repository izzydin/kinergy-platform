# Frontend API Architecture & Data Fetching Strategy

- **Status:** Active / Authoritative Standard
- **Scope:** `@kinergy-platform/web` (`apps/web/src/`) and Shared Packages (`packages/*`)
- **Target Application:** Kinergy Platform Web Frontend

---

## 1. Executive Summary & Core API Philosophy

The Kinergy Platform frontend (`apps/web`) interacts with backend microservices via a structured, type-safe **API Integration Architecture**.

To maintain clean architecture, strict module boundaries, and high performance, the frontend API layer is governed by six core tenets:

1. **Centralized Transport Abstraction**: All network requests pass through an HTTP transport client (`shared/api/http-client.ts`) that manages authorization headers, tenant context, generic error handling, and 401 token refresh interceptors.
2. **Co-located Feature Queries**: Feature modules co-locate their TanStack Query API hooks inside `src/modules/<domain>/api/`.
3. **Hierarchical Query Key Factories**: Every domain defines a Query Key Factory (`clientKeys`, `energyKeys`) ensuring type-safe cache invalidation without key collisions.
4. **Boundary Deserialization & Zod Validation**: Raw API payloads are parsed at the transport edge using Zod schemas (`packages/validation`) and converted into clean frontend ViewModels via pure mapper functions.
5. **Optimistic Updates & Deterministic Rollback**: State mutations update TanStack Query caches optimistically, capturing snapshot context to perform seamless rollbacks on network failures.
6. **Strict Feature Decoupling**: Feature modules NEVER import API hooks or query keys from other feature modules. Cross-domain data integration occurs at page orchestration boundaries.

---

## 2. API Transport Layer (`shared/api/http-client.ts`)

All network requests flow through the standardized `HttpClient` class (`shared/api/http-client.ts`) wrapping native browser `fetch`:

```mermaid
graph TD
    subgraph Feature Module Hook
        HOOK[useClientDetailsQuery]
    end

    subgraph Shared Transport Layer - shared/api/http-client.ts
        HTTP[HttpClient Abstraction]
        AUTH_INT[Auth Token Interceptor<br/>Bearer Token Injection]
        TENANT_INT[Tenant Context Interceptor<br/>X-Tenant-ID Header]
        ERROR_MAP[Error Normalization Engine<br/>normalizeApiError Engine]
        REFRESH[401 Refresh Token Engine<br/>RTR Token Rotation]
    end

    subgraph Backend Microservices
        API[Backend REST API /api/v1/*]
    end

    HOOK --> HTTP
    HTTP --> AUTH_INT
    AUTH_INT --> TENANT_INT
    TENANT_INT --> API
    API -->|HTTP 401 Unauthorized| REFRESH
    REFRESH -->|Refresh JWT & Retry| HTTP
    API -->|HTTP Error Status| ERROR_MAP
```

### Transport Responsibilities

- **Base URL & Path Prefixing**: Resolves target endpoints relative to `getAppConfig().apiBaseUrl` (defaults to `/api/v1`).
- **Typed HTTP Method Wrappers**: Exposes `get<T>`, `post<T>`, `put<T>`, `patch<T>`, and `delete<T>`.
- **JSON Serialization & Deserialization**: Automatically sets `Content-Type: application/json` on request payloads, parses JSON responses, and handles `204 No Content` gracefully.
- **Authorization Header Injection**: Pluggable `setAuthTokenGetter` automatically attaches `Authorization: Bearer <accessToken>` unless `skipAuth: true` is set.
- **Tenant Context Injection**: Pluggable `setTenantIdGetter` automatically attaches `X-Tenant-ID: <tenantId>`.
- **Request Cancellation**: Accepts `options.signal` (`AbortSignal`), normalizing `AbortError` into `RequestCanceledError`.
- **Pluggable Interceptor Pipeline**: Supports registering `addRequestInterceptor` and `addResponseInterceptor` handlers.

### Authentication Transport Architecture (`shared/auth`)

Shared authentication transport infrastructure (`shared/auth/`) handles credential injection, silent Refresh Token Rotation (RTR), 401 interception, and session state events:

- **In-Memory Token Store (`AuthTokenStore`)**:
  - Access tokens are stored **exclusively in memory** (`let accessToken: string | null = null`) to eliminate XSS exfiltration risks.
  - Access tokens are NEVER stored in `localStorage`, `sessionStorage`, or unencrypted cookies.
  - Tokens are never logged to console, telemetry, or diagnostic dumps.
  - Exposes `subscribe(listener)` emitting `login`, `logout`, and `unauthorized` session state events.
- **Concurrency-Safe Refresh Engine (`AuthTransportManager`)**:
  - Intercepts HTTP `401 Unauthorized` responses on `HttpClient`.
  - Queues concurrent failing requests onto a **single shared refresh promise** (`acquireRefreshedToken()`), preventing refresh storms against `/api/v1/auth/refresh`.
  - Retried requests carry `X-Retry-Attempt: 1` headers to enforce a strict single-attempt limit and prevent infinite retry loops.
  - If silent refresh fails (401/403/network error), `clearSession()` is invoked, `unauthorized` event is emitted, and normalized `AuthenticationError` is thrown to transition the app to unauthenticated state.
- **Zero-UI Transport Boundary**:
  - Transport layer contains zero login screens, forms, user management logic, or JWT decoding.
  - Feature components remain completely agnostic of authentication transport mechanics.

### Logger Infrastructure Architecture (`shared/logger`)

Structured, environment-aware logging abstraction (`shared/logger/platform-logger.ts`) for frontend infrastructure and feature modules:

- **Log Levels & Environment Thresholds**:
  - Supports `debug`, `info`, `warn`, and `error` log levels with priority hierarchy.
  - Automatically configures minimum thresholds based on runtime environment (`isDev`: `debug`, `isProd`: `info`, `isTest`: `warn`).
  - Supports global threshold override via `PlatformLogger.setMinLevel('silent' | 'debug' | 'info' | 'warn' | 'error')`.
- **Sensitive Data Protection & Redaction**:
  - Automatically redacts sensitive metadata fields (`password`, `token`, `authorization`, `secret`, `bearer`, `credential`, `jwt`, `api_key`, `ssn`) with `'[REDACTED]'`.
  - Redacts inline Bearer tokens in string values (`Bearer [REDACTED]`).
  - Sanitizes nested metadata objects recursively.
- **Pluggable Log Sink Architecture (`LogSink`)**:
  - `ConsoleSink` formats human-readable timestamps in development and outputs structured JSON lines in production.
  - Exposes `PlatformLogger.addSink(sink)` and `setSinks()` allowing seamless integration of production telemetry or error reporting providers (e.g. Sentry/Datadog) without modifying feature code.
- **Usage Governance**:
  - Direct `console.log`, `console.warn`, or `console.error` calls in production application code are strictly prohibited in favor of `logger` or `logger.withContext('ModuleName')`.

### Notification Infrastructure Architecture (`app/providers/notification-provider.tsx`)

Centralized user feedback and notification abstraction binding application state to Design System UI primitives:

- **Public API Boundary**:
  - React hook: `useNotification()` exposing `success()`, `error()`, `warning()`, `info()`, `dismiss()`, `clearAll()`.
  - Imperative service: `notificationService` / `notify` allowing infrastructure modules (e.g. mutation handlers or transport interceptors) to trigger notifications outside React component render trees.
- **Design System Toast Integration**:
  - Consumes presentational primitives (`Toast`, `ToastViewport`, `ToastTitle`, `ToastDescription`, `ToastClose`) directly from `@kinergy-platform/ui`.
  - Feature modules and infrastructure remain completely decoupled from Toast UI implementation details.
- **Normalized Error Message Sanitization (`formatNotificationError`)**:
  - Maps `ApiError` subclasses (`ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `RateLimitError`, `ServerError`) into user-friendly titles and descriptions.
  - Sanitizes raw server errors, ensuring stack traces, database details, and internal exceptions are NEVER exposed in UI toasts.

### Error Boundary & Recovery Architecture (`shared/ui/error-boundary.tsx`)

Production-ready React error boundary strategy catching uncaught rendering exceptions without unmounting the Application Shell:

- **Boundary Hierarchy**:
  - **Root-level Error Boundary (`RootErrorBoundaryProvider`)**: Top-level composition root boundary preventing application process unmount on unhandled crashes.
  - **Module-level Error Boundary (`ErrorBoundary`)**: Layout slot / feature module boundary (`<ErrorBoundary name={module.title}>`) isolating feature rendering crashes to content regions while preserving Application Shell navigation.
- **Smart Error Recovery**:
  - Component Retry (`resetErrorBoundary()`): Resets local boundary state to attempt re-rendering children.
  - Route Navigation (`Return to Dashboard`): Navigates user back to `/dashboard` without forcing blind hard page reloads.
  - Hard Refresh: Secondary resort button on root-level boundary.
- **Infrastructure Integrations**:
  - **Logger**: Logs uncaught exceptions with `componentStack` and boundary metadata via `PlatformLogger`.
  - **Notifications**: Triggers `notificationService.error()` to notify users of trapped rendering exceptions.
  - **Design System UI**: Fallback views consume `@kinergy-platform/ui` (`Card`, `Alert`, `Button`) primitives.
- **Boundary Governance & Non-Scope**:
  - Traps ONLY uncaught React rendering crashes.
  - Normal API errors, form validations, expected mutation failures, and 401 auth failures are handled by transport/query infrastructure and MUST NOT trigger error boundaries.
  - Stack traces are rendered in collapsible developer diagnostics in development mode (`isDev`), and strictly hidden in production mode (`isProd`).

### Standard Mutation Pipeline Architecture (`shared/api/mutation-pipeline.ts`)

Standardized mutation abstraction (`useStandardMutation`) encapsulating the full mutation lifecycle for feature modules:

- **Lifecycle Pipeline**:
  - `onMutate`: Performs opt-in optimistic cache updates and snapshots previous state for rollback.
  - `mutationFn`: Executes API transport call, automatically normalizing raw errors via `normalizeApiError()`.
  - `onSuccess`: Invalidates target query keys (`invalidates`), dispatches success toast notification via `notificationService`, and invokes user callback.
  - `onError`: Restores previous snapshot on optimistic failure, invalidates affected keys to force cache re-sync, dispatches error toast notification (suppressed for `RequestCanceledError`), and invokes user error recovery callback.
- **Opt-In Optimistic Updates**:
  - Configured via `optimistic: { queryKey, update }`.
  - Cancels outgoing queries for target key prior to snapshotting to eliminate race conditions.
- **Query Key & Toast Strategy**:
  - Feature modules own their domain query keys; zero business query keys exist in shared infrastructure.
  - Custom user-facing success/error toast messages or message functions are fully supported while preventing duplicate notifications.

### Normalized Error Hierarchy Model

All HTTP failures, validation errors, network drops, and cancellations are mapped via `normalizeApiError()` into typed `ApiError` subclasses matching NestJS `ApiExceptionFilter` contracts:

| Error Subclass             | Status Code | Error Code (`code`)     | Recoverable | Description                                                                       |
| :------------------------- | :---------- | :---------------------- | :---------- | :-------------------------------------------------------------------------------- |
| **`ValidationError`**      | 400         | `VALIDATION_ERROR`      | `true`      | Validation failure; includes field-level `details: Record<string, string[]>` map. |
| **`AuthenticationError`**  | 401         | `UNAUTHORIZED`          | `true`      | Unauthenticated session or expired token. Triggers RTR refresh flow.              |
| **`AuthorizationError`**   | 403         | `FORBIDDEN`             | `false`     | Insufficient permissions for requested resource. Flow-terminating.                |
| **`NotFoundError`**        | 404         | `NOT_FOUND`             | `false`     | Resource does not exist on backend server.                                        |
| **`ConflictError`**        | 409         | `CONFLICT`              | `true`      | Resource state conflict (e.g. duplicate key or concurrency clash).                |
| **`RateLimitError`**       | 429         | `RATE_LIMITED`          | `true`      | Request rate limit exceeded; includes optional `retryAfterSeconds`.               |
| **`ServerError`**          | 500         | `INTERNAL_SERVER_ERROR` | `true`      | Unexpected server-side failure or malformed non-JSON HTML response.               |
| **`NetworkError`**         | 0           | `NETWORK_ERROR`         | `true`      | Device offline, DNS resolution failure, or CORS network connection drop.          |
| **`RequestCanceledError`** | 0           | `REQUEST_CANCELED`      | `true`      | Request explicitly canceled by component unmount or user via `AbortSignal`.       |

### Usage Boundaries & Forbidden Patterns

- **Usage Boundary**: Feature modules MUST access network endpoints exclusively through their co-located `api/` directory functions using `httpClient`.
- **Forbidden Usage Patterns**:
  1. **Direct `window.fetch` or `axios`**: Hand-rolled fetch calls outside `shared/api/http-client.ts` are strictly prohibited.
  2. **React Coupling**: `HttpClient` MUST NOT import or depend on React hooks, Context, or component lifecycles.
  3. **TanStack Query Coupling**: `HttpClient` MUST NOT depend on `@tanstack/react-query` or QueryClient instances.
  4. **Domain Business Logic**: `HttpClient` is pure transport infrastructure and MUST NOT contain domain rules or business logic.

---

## 3. TanStack Query Conventions & Query Key Factory Pattern

TanStack Query (`@tanstack/react-query`) is the sole server state engine. To avoid query key collision across feature modules, every domain defines a formal **Query Key Factory**.

### Query Key Factory Structure

```typescript
// Location: apps/web/src/modules/client/api/client-query-keys.ts
export const clientKeys = {
  all: ['clients'] as const,
  lists: () => [...clientKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...clientKeys.lists(), { filters }] as const,
  details: () => [...clientKeys.all, 'detail'] as const,
  detail: (id: string) => [...clientKeys.details(), id] as const,
  timeline: (id: string) => [...clientKeys.detail(id), 'timeline'] as const,
};
```

### Co-Located Query Hook Example

```typescript
// Location: apps/web/src/modules/client/api/use-client-details-query.ts
import { useQuery } from '@tanstack/react-query';
import { httpClient } from '@/shared/api/http-client';
import { clientKeys } from './client-query-keys';
import { clientSchema } from '@kinergy-platform/validation';
import { mapClientDtoToViewModel, ClientViewModel } from '../mappers/client.mapper';

export const useClientDetailsQuery = (clientId: string) => {
  return useQuery<ClientViewModel, ApiError>({
    queryKey: clientKeys.detail(clientId),
    queryFn: async () => {
      const rawData = await httpClient.get(`/clients/${clientId}`);
      const validatedDto = clientSchema.parse(rawData);
      return mapClientDtoToViewModel(validatedDto);
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: Boolean(clientId),
  });
};
```

---

## 4. Mutation Strategy, Optimistic Updates & Rollback

Mutations modify server data and immediately synchronize local query caches using optimistic UI updates or targeted cache invalidation.

```mermaid
sequenceDiagram
    autonumber
    actor User as User Action
    participant Hook as useUpdateClientMutation
    participant Cache as TanStack Query Cache
    participant API as Backend REST API

    User->>Hook: Submit Update ("John Doe")
    Hook->>Cache: 1. cancelQueries(['clients', 'detail', '123'])
    Hook->>Cache: 2. Snapshot Previous Cache State
    Hook->>Cache: 3. Set Optimistic Cache Data ("John Doe")
    Hook->>User: Render Optimistic UI Immediately
    Hook->>API: 4. HTTP PATCH /api/v1/clients/123

    alt Mutation Succeeds
        API-->>Hook: 200 OK (Updated DTO)
        Hook->>Cache: 5. invalidateQueries(['clients', 'detail', '123'])
    else Mutation Fails (Network Error / 500)
        API-->>Hook: 500 Internal Server Error
        Hook->>Cache: 5. Rollback Cache to Snapshot State
        Hook->>User: Display Notification Toast Error Alert
    end
```

### Optimistic Mutation Hook Implementation

```typescript
// Location: apps/web/src/modules/client/api/use-update-client-mutation.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { httpClient } from '@/shared/api/http-client';
import { clientKeys } from './client-query-keys';
import { useToast } from '@/shared/hooks/use-toast';
import { ClientViewModel } from '../mappers/client.mapper';

export const useUpdateClientMutation = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateClientInput }) => {
      return httpClient.patch(`/clients/${id}`, data);
    },
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: clientKeys.detail(id) });

      // Snapshot previous value
      const previousClient = queryClient.getQueryData<ClientViewModel>(clientKeys.detail(id));

      // Optimistically update cache
      if (previousClient) {
        queryClient.setQueryData<ClientViewModel>(clientKeys.detail(id), {
          ...previousClient,
          ...data,
        });
      }

      return { previousClient };
    },
    onError: (err, { id }, context) => {
      // Rollback to previous state on error
      if (context?.previousClient) {
        queryClient.setQueryData(clientKeys.detail(id), context.previousClient);
      }
      toast.error('Failed to update client profile. Changes rolled back.');
    },
    onSettled: (_, __, { id }) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(id) });
    },
  });
};
```

---

## 5. DTO Mapping, Boundary Deserialization & Error Handling

### 1. Transport Boundary Zod Validation

Raw API responses from the network are parsed at the edge using Zod schemas (`packages/validation`). If a backend deployment introduces an unexpected breaking schema change, Zod parsing catches it at the boundary before corrupting component states.

### 2. DTO to ViewModel Mapping

Backend DTOs are mapped into UI-focused ViewModels to decouple component code from backend schema changes:

- Converts ISO string timestamps (`2026-08-04T10:00:00Z`) into formatted display strings (`"Aug 4, 2026"`).
- Combines separate fields (`firstName`, `lastName`) into display helpers (`fullName`).

### 3. Unified Domain Error Mapping

Raw HTTP errors are caught by `http-client.ts` and transformed into structured `ApiError` domain models:

```typescript
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

---

## 6. Mock Service Worker (MSW) Strategy

To enable offline feature development, visual prototyping, and rapid unit/integration testing without backend microservice dependencies, the platform uses **Mock Service Worker (MSW v2)**.

- **MSW Handlers**: Co-located mock handlers in `src/test/mocks/handlers.ts` intercept HTTP requests at the browser network level using Service Workers.
- **Testing Integration**: Vitest tests wrap components in `QueryClientProvider` while MSW handlers mock backend responses without network calls.

```typescript
// Location: apps/web/src/test/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/v1/clients/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      name: 'Acme Energy Solutions',
      status: 'ACTIVE',
      createdAt: '2026-01-15T08:00:00Z',
    });
  }),
];
```

---

## 7. Future API Versioning & BFF Compatibility

### 1. Path-Based Versioning Strategy

- API endpoints are prefixed with version segments (`/api/v1/clients`, `/api/v2/clients`).
- When backend APIs increment versions, `shared/api/http-client.ts` or specific query function endpoints update smoothly without refactoring domain components.

### 2. Backend-For-Frontend (BFF) Readiness

- As dashboard views require complex multi-domain aggregates (e.g., combining Client Profile + Energy Consumption + Billing Invoices), a dedicated BFF layer (GraphQL or Read-Optimized REST Aggregator) can be introduced.
- The Query Key Factory and ViewModel mapper architecture ensures that components consume aggregated BFF ViewModels seamlessly without component rewrite.

---

## 8. Feature Module API Interaction & Decoupling Rules

Feature modules MUST remain strictly decoupled:

```mermaid
graph TD
    subgraph Feature Module A - src/modules/client
        CLIENT_HOOK[useClientDetailsQuery]
    end

    subgraph Feature Module B - src/modules/energy
        ENERGY_HOOK[useEnergyMetricsQuery]
    end

    subgraph FORBIDDEN DIRECT CROSS-MODULE IMPORT
        ENERGY_HOOK -.->|FORBIDDEN IMPORT| CLIENT_HOOK
    end

    subgraph CORRECT PAGE ORCHESTRATION LAYER - src/app/pages
        PAGE[ClientEnergyDashboardPage Orchestrator]
        PAGE --> CLIENT_HOOK
        PAGE --> ENERGY_HOOK
    end
```

### Mandatory Decoupling Rules

1. **Forbidden Direct Imports**: `src/modules/energy` MUST NEVER import query hooks or query keys from `src/modules/client`.
2. **Page Orchestration**: When a dashboard view requires data from both `Client` and `Energy` contexts, the top-level Page component (`src/app/pages/client-energy-dashboard-page.tsx`) invokes both hooks and passes required data down as primitive props.
3. **Shared Contracts**: Common types and validation schemas belong in workspace packages (`packages/types`, `packages/validation`).

---

## 9. Architectural Decision Records (ADR Style)

---

### [ADR-FE-0017] Centralized Transport Layer with Automatic Auth Interceptors

- **Decision**: Centralize all HTTP network communication in `shared/api/http-client.ts` with automatic `Bearer` token injection, `X-Tenant-ID` header binding, and 401 refresh token retries.
- **Context**: Duplicating `fetch` or `axios` setups across feature modules leads to inconsistent error handling and security vulnerabilities.
- **Rationale**: A unified transport layer guarantees consistent header injection, security token refresh, and unified error mapping across all features.
- **Consequences**: Direct use of native `window.fetch` or un-configured `axios` is strictly prohibited.
- **Future Evolution**: Supports adding client-side telemetry tracking and request duration metrics to HTTP headers.

---

### [ADR-FE-0018] Hierarchical Query Key Factory Governance

- **Decision**: Standardize all TanStack Query keys using domain-level Query Key Factories (`clientKeys`, `energyKeys`).
- **Context**: Hardcoded string array query keys (`['clients', id]`) cause typos, duplicate keys, and broken cache invalidation.
- **Rationale**: Query Key Factories enforce strict TypeScript typing and hierarchical cache management (`invalidateQueries({ queryKey: clientKeys.all })`).
- **Consequences**: Requires creating a `query-keys.ts` file in every feature module's `api/` directory.
- **Future Evolution**: Enables automated query key documentation generation.

---

### [ADR-FE-0019] Transport Boundary Zod Validation & ViewModel Mapping

- **Decision**: Validate raw API response payloads using Zod schemas at the transport edge and transform them into frontend ViewModels via pure mappers.
- **Context**: Backend DTO changes can cause silent runtime UI crashes if un-validated raw API objects are used directly in component views.
- **Rationale**: Boundary Zod parsing catches invalid API payloads immediately, while ViewModel mappers insulate UI components from backend schema refactoring.
- **Consequences**: Requires defining Zod schemas and mapper functions for API integrations.
- **Future Evolution**: Enables sharing Zod schemas between NestJS backend DTO validators and Vite frontend parsers via `packages/validation`.

---

### [ADR-FE-0020] Network Level API Mocking with Mock Service Worker (MSW)

- **Decision**: Adopt Mock Service Worker (MSW v2) as the platform standard for API mocking during unit/integration testing and offline development.
- **Context**: Mocking fetch calls via Jest/Vitest spy functions leads to brittle test setups and leaks transport implementation details.
- **Rationale**: MSW intercepts requests at the browser/node network layer, providing authentic REST API responses without modifying application transport code.
- **Consequences**: Test suites configure MSW handlers instead of mocking HTTP client modules.
- **Future Evolution**: MSW handlers can be shared with Storybook component documentation.

---

### [ADR-FE-0029] Shared Runtime Infrastructure & Standard Mutation Pipeline

- **Decision**: Standardize all async mutations on `useStandardMutation` and centralize transport interceptors inside `HttpClient` and `AuthTokenStore`.
- **Context**: Unifying HTTP transport headers, 401 RTR token refresh queues, error normalization, toast alerts, and optimistic updates prevents divergent feature implementations.
- **Rationale**:
  - **Single Transport Core**: `HttpClient` wraps native fetch with `Authorization` bearer token and `X-Tenant-ID` header injection.
  - **Concurrency-Safe RTR**: Intercepts 401 responses and queues concurrent failing requests during single refresh token execution to `/api/v1/auth/refresh`.
  - **Standard Mutation Pipeline**: `useStandardMutation` unifies error normalization (`normalizeQueryError`), toast notifications (`useNotification`), query cache invalidation (`queryClient.invalidateQueries`), and opt-in 3-phase optimistic updates (`executeOptimisticUpdate` / `rollbackOptimisticUpdate`).
  - **Opt-In Optimistic Safety**: Optimistic updates are explicitly opt-in (`isOptimistic: true`), requiring safe predictability before mutating cache.
- **Responsibilities**:
  - `shared/api`: Owns `HttpClient` transport adapter and authentication transport support.
  - `shared/query`: Owns `useStandardMutation` lifecycle pipeline and error normalizer.
  - Feature Modules: Consume `useStandardMutation` and `HttpClient` without custom fetch or mutation boilerplate.
- **Consequences**: Direct `fetch` calls and manual mutation handling in feature modules are superseded by `HttpClient` and `useStandardMutation`.

---

## 10. Cross-References & Related Documentation

- [Frontend Architecture Vision](./architecture.md)
- [Frontend Engineering Principles](./principles.md)
- [Frontend Folder Structure & Architectural Boundaries](./folder-structure.md)
- [Frontend Routing Architecture & Navigation Strategy](./routing.md)
- [Frontend State Management Architecture & State Governance](./state-management.md)
- [Frontend UI Architecture & Design System Strategy](./ui-architecture.md)
- [Frontend Testing Strategy & Quality Assurance Architecture](./testing.md)
- [Frontend Error Handling Strategy & Fault Tolerance Architecture](./error-handling.md)
- [Frontend Technical Glossary](./glossary.md)
- [Master Platform Documentation Index](../README.md)
