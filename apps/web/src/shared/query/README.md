# TanStack Query Foundation & Caching Strategy (`apps/web/src/shared/query/`)

- **Status:** Active / Authoritative Architecture Standard
- **Scope:** `@kinergy-platform/web` (`apps/web/src/shared/query/`) and Feature Modules (`src/modules/*/api/`)
- **Target Technology:** TanStack Query v5 (`@tanstack/react-query`)

---

## 1. Overview & Core Principles

The **TanStack Query Foundation** provides the authoritative server state infrastructure for the Kinergy Platform frontend (`apps/web`).

It is governed by four core principles:

1. **Single-Responsibility Server State**: Asynchronous API data originates exclusively from TanStack Query cache. Server data MUST NEVER be copied into React `useState` or Context.
2. **Hierarchical Query Key Factories**: Query keys follow strict domain key factories (`createQueryKeyFactory('domain')`) to prevent key collisions and guarantee deterministic cache invalidation.
3. **Optimistic Updates & Deterministic Rollback**: Mutations update query cache optimistically, capturing snapshot context to perform automatic rollbacks on network failures (`executeOptimisticUpdate`, `rollbackOptimisticUpdate`).
4. **AppError Normalization**: Network failures are parsed and converted into domain-level `AppError` subclasses (`ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `ServerError`).

---

## 2. Query Conventions

All query hooks co-located inside feature modules (`src/modules/<domain>/api/`) MUST enforce the following conventions:

### A. Default Options & Lifetime Configuration

- **Default `staleTime`**: `1000 * 60 * 5` (5 minutes). Data remains fresh for 5 minutes before refetching on mount.
- **Default `gcTime`**: `1000 * 60 * 10` (10 minutes). Unused cache entries are garbage-collected after 10 minutes.
- **`refetchOnWindowFocus`**: `false` by default to prevent unexpected network refetching while user toggles tabs.
- **`refetchOnReconnect`**: `true` to ensure stale data updates automatically when network connectivity restores.

### B. Hierarchical Query Key Factory Pattern

Every feature module MUST define a query key factory file (`src/modules/<domain>/api/query-keys.ts`):

```typescript
import { createQueryKeyFactory } from '@/shared/query';

export const clientKeys = createQueryKeyFactory<ClientFilters, string>('clients');
// Generates:
// clientKeys.all              => ['clients']
// clientKeys.lists()          => ['clients', 'list']
// clientKeys.list(filters)    => ['clients', 'list', { filters }]
// clientKeys.details()        => ['clients', 'detail']
// clientKeys.detail(id)       => ['clients', 'detail', id]
```

### C. Co-Located Query Hook Example

```typescript
import { useQuery } from '@tanstack/react-query';
import { clientKeys } from './query-keys';

export const useClientQuery = (id: string) => {
  return useQuery({
    queryKey: clientKeys.detail(id),
    queryFn: async () => fetchClientById(id),
    enabled: Boolean(id),
  });
};
```

---

## 3. Mutation Conventions

Mutations modify server resources and manage cache synchronization using a 3-phase lifecycle:

### A. Non-Idempotent Retry Policy

- Mutations are **non-idempotent by default** (`retry: false`). Automatic retries are disabled to prevent duplicate side-effects (e.g. creating duplicate records).

### B. 3-Phase Optimistic Mutation Lifecycle

1. **`onMutate`**:
   - Cancel outgoing refetches using `queryClient.cancelQueries({ queryKey })`.
   - Execute `executeOptimisticUpdate(queryClient, queryKey, updater)` to snapshot previous state and apply optimistic cache data immediately.
2. **`onError`**:
   - Execute `rollbackOptimisticUpdate(queryClient, context)` to restore cache snapshot state.
   - Display ephemeral notification toast (`toast.error()`).
3. **`onSettled`**:
   - Invalidate query keys using `queryClient.invalidateQueries({ queryKey })` to ensure final server synchronization.

---

## 4. Cache Ownership & Decoupling Governance

1. **Domain Isolation**: Each feature module (`src/modules/client/`) exclusively owns its query cache namespace (`['clients']`).
2. **Forbidden Cross-Module Mutations**: A feature module MUST NEVER directly mutate or invalidate another feature module's query keys.
3. **Page Level Orchestration**: Cross-domain cache invalidations or multi-context queries occur only at top-level Page Orchestration components (`src/app/routes/`).
