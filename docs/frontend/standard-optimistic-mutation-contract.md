# Standard Optimistic Mutation Contract

## 1. Architectural Purpose & Contract Overview

This document details the **Standard Optimistic Mutation Contract** implemented in `apps/web/src/shared/api/mutation-pipeline.ts`. It establishes how domain feature modules (`apps/web/src/modules/<domain>`) implement approved optimistic mutations by leveraging the existing A6 mutation infrastructure without duplicating rollback, notification, or cancellation logic.

---

## 2. Standard Mutation Lifecycle Flow

A standard optimistic mutation executes through a deterministic 6-phase lifecycle:

```
                      ┌────────────────────────────────────────┐
                      │ 1. Current TanStack Query Cache Data   │
                      └───────────────────┬────────────────────┘
                                          │
                      ┌───────────────────▼────────────────────┐
                      │ 2. Cancel Relevant In-Flight Queries   │
                      │    (queryClient.cancelQueries)         │
                      └───────────────────┬────────────────────┘
                                          │
                      ┌───────────────────▼────────────────────┐
                      │ 3. Capture Snapshot of Previous State  │
                      │    (previousData = getQueryData)       │
                      └───────────────────┬────────────────────┘
                                          │
                      ┌───────────────────▼────────────────────┐
                      │ 4. Apply Optimistic Update to Cache    │
                      │    (queryClient.setQueryData)          │
                      └───────────────────┬────────────────────┘
                                          │
                      ┌───────────────────▼────────────────────┐
                      │ 5. Execute API Transport Mutation      │
                      └───────────────────┬────────────────────┘
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   ▼                                             ▼
        ┌──────────────────────┐                     ┌──────────────────────┐
        │   SUCCESS RESPONSE   │                     │    ERROR RESPONSE    │
        └──────────┬───────────┘                     └──────────┬───────────┘
                   │                                            │
        ┌──────────▼───────────┐                     ┌──────────▼───────────┐
        │ 6A. Server Response  │                     │ 6B. Rollback Cache   │
        │     Reconciliation   │                     │     to Snapshot      │
        │           ↓          │                     │          ↓           │
        │ Target Invalidation  │                     │ Dispatch Error Toast │
        │           ↓          │                     │          ↓           │
        │ Dispatch Success Toast│                    │ Target Invalidation  │
        └──────────────────────┘                     └──────────────────────┘
```

---

## 3. Developer Consumption API (`useStandardMutation`)

Feature developers do **not** write raw `cancelQueries`, `setQueryData`, rollback logic, or toast dispatchers. They supply declarative configuration to `useStandardMutation`:

```typescript
import { useStandardMutation, type OptimisticConfig } from '@/shared';
import { userManagementKeys } from '../api/user-management-keys';
import { activateUser } from '../api/user-management-api';
import type { ManagedUser, PaginatedUsersResponse } from '../domain/user.types';

export function useOptimisticActivateUserMutation() {
  return useStandardMutation<
    ManagedUser, // TData (Server Response)
    { userId: string }, // TVariables
    ApiError, // TError
    unknown, // TContext
    PaginatedUsersResponse // TQueryData (Target Cache Type)
  >({
    mutationFn: ({ userId }) => activateUser(userId),

    // Declarative Optimistic Cache Strategy
    optimistic: {
      queryKey: userManagementKeys.lists(),
      update: (currentData, { userId }) => {
        if (!currentData) return currentData;
        return {
          ...currentData,
          items: currentData.items.map((user) =>
            user.id === userId ? { ...user, status: 'ACTIVE' } : user,
          ),
        };
      },
    },

    // Success & Error Notifications
    notifications: {
      success: 'User successfully activated',
      error: 'Failed to activate user. Changes reverted.',
    },

    // Targeted Cache Invalidation
    invalidates: [userManagementKeys.all],
  });
}
```

---

## 4. Cache Safety & Invariants

1. **Targeted Query Scope:**
   - Optimistic updates must specify precise query keys (via static `QueryKey` or dynamic `(variables) => QueryKey`).
   - The mutation pipeline never mutates or invalidates unrelated cache domains.
2. **Deterministic Rollback Snapshot:**
   - In `onMutate`, the pipeline captures `queryClient.getQueryData(optimisticKey)` before calling `setQueryData`.
   - On error, `queryClient.setQueryData(context.optimisticKey, context.previousData)` restores the exact snapshot.
3. **Server Authority & Final Reconciliation:**
   - In `onSettled`, the pipeline invalidates the target query keys so that any server-computed fields (e.g. `updatedAt`, audit hashes, permissions) overwrite temporary client predictions.
4. **Duplicate Submission Protection:**
   - Buttons and action triggers must be disabled while `mutation.isPending` is true.

---

## 5. Accessibility & Error Handling Invariants

1. **Accessible State Communication:**
   - Optimistic status changes update visual badges and ARIA attributes (e.g. `aria-checked="true"`, `aria-busy="true"`).
2. **Screen Reader Error Annunciations:**
   - If a rollback occurs due to network failure, the error toast is dispatched to the global notification container with `aria-live="assertive"` so assistive technologies inform the user immediately.
