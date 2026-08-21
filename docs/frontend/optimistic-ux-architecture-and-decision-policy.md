# Optimistic UX Architecture and Decision Policy

## 1. Overview & Core Philosophy

The Kinergy Platform mutation architecture was established in Track A6 using TanStack Query, normalized notification toasts, and standard cache invalidation. This document establishes the platform-wide **Optimistic UX Architecture and Decision Policy**.

### Core Philosophy: Server Authority & Pessimistic Default

The backend database and domain aggregates remain the single source of authoritative truth.

- **Default Policy:** Mutations are **pessimistic by default** (the UI displays a pending state and updates only after backend confirmation).
- **Optimistic Exception:** An optimistic update is a temporary, client-side prediction applied to the local TanStack Query cache before server resolution. Optimistic updates must be explicitly justified by meeting all criteria in the Decision Framework.
- **Zero Financial/Operational Guesswork:** The frontend must never imply that a financially, legally, or operationally critical operation has succeeded before the backend confirms it.

---

## 2. Optimistic Mutation Decision Framework

A mutation is eligible for optimistic UI **if and only if** all six criteria are satisfied:

```
                  ┌─────────────────────────────────────┐
                  │       Mutation Proposed             │
                  └──────────────────┬──────────────────┘
                                     │
           ┌─────────────────────────▼─────────────────────────┐
           │ 1. Is the expected result completely deterministic?│
           └─────────────────────────┬─────────────────────────┘
                                     │ YES (NO → Pessimistic)
           ┌─────────────────────────▼─────────────────────────┐
           │ 2. Is affected client-side cache query key known?  │
           └─────────────────────────┬─────────────────────────┘
                                     │ YES (NO → Pessimistic)
           ┌─────────────────────────▼─────────────────────────┐
           │ 3. Can a reliable rollback snapshot be captured?   │
           └─────────────────────────┬─────────────────────────┘
                                     │ YES (NO → Pessimistic)
           ┌─────────────────────────▼─────────────────────────┐
           │ 4. Is the operation lightweight (low complexity)?  │
           └─────────────────────────┬─────────────────────────┘
                                     │ YES (NO → Pessimistic)
           ┌─────────────────────────▼─────────────────────────┐
           │ 5. Is temporary UI divergence acceptable?          │
           └─────────────────────────┬─────────────────────────┘
                                     │ YES (NO → Pessimistic)
           ┌─────────────────────────▼─────────────────────────┐
           │ 6. Is failure free of critical business/safety     │
           │    consequences (financial, medical, inventory)?   │
           └─────────────────────────┬─────────────────────────┘
                                     │ YES (NO → Pessimistic)
                                     ▼
                      ┌─────────────────────────────┐
                      │    USE OPTIMISTIC UX        │
                      └─────────────────────────────┘
```

---

## 3. Decision Matrix & Mutation Categorization

| Mutation Category                                  | Optimistic UX Permitted | Classification | Justification & Requirements                                                            |
| :------------------------------------------------- | :---------------------: | :------------- | :-------------------------------------------------------------------------------------- |
| **Status Toggles** (Active / Inactive / Suspended) |         **YES**         | Approved       | Deterministic state transition; rollback resets status badge; low blast radius.         |
| **Archive / Restore** (Soft Deletion)              |         **YES**         | Approved       | Binary state flip; rollback restores row to active list view.                           |
| **User Display / Notification Preferences**        |         **YES**         | Approved       | Pure client/user preference; immediate feedback expected; failure easily rollbacked.    |
| **Simple Metadata Edits** (Rename, Description)    |         **YES**         | Approved       | Known scalar values; rollback restores previous string fields.                          |
| **Payment & Financial Transactions**               |         **NO**          | Disallowed     | High legal/financial risk; must wait for payment gateway & ledger confirmation.         |
| **Sales & POS Order Finalization**                 |         **NO**          | Disallowed     | Requires invoice generation, tax calculation, and payment authorization.                |
| **Inventory & Stock Adjustments**                  |         **NO**          | Disallowed     | Physical goods movements require atomic warehouse lock and quantity confirmation.       |
| **Clinical Progress Notes (SOAP Notes)**           |         **NO**          | Disallowed     | Medico-legal records require server timestamping, hash locking, and audit immutability. |
| **Complex Scheduling & Double-Booking Checks**     |         **NO**          | Disallowed     | Multi-party concurrency; requires backend resource conflict matrix verification.        |
| **Multi-Step Onboarding / Wizard Workflows**       |         **NO**          | Disallowed     | Dependent cascading foreign keys and server-generated aggregate identifiers.            |

---

## 4. Rollback Requirements & TanStack Query Contract

Every optimistic mutation must adhere to the 4-step rollback lifecycle contract:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotification } from '@/shared';

export function useOptimisticToggleStatus() {
  const queryClient = useQueryClient();
  const { error: notifyError } = useNotification();

  return useMutation({
    mutationFn: (variables: { id: string; newStatus: string }) => api.updateStatus(variables),

    // 1. Cancel in-flight queries & snapshot previous state
    onMutate: async ({ id, newStatus }) => {
      await queryClient.cancelQueries({ queryKey: ['items'] });
      const previousData = queryClient.getQueryData<Item[]>(['items']);

      // 2. Optimistically update client cache
      queryClient.setQueryData<Item[]>(['items'], (old = []) =>
        old.map((item) => (item.id === id ? { ...item, status: newStatus } : item)),
      );

      // Return context with rollback snapshot
      return { previousData };
    },

    // 3. Rollback on failure & alert user
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['items'], context.previousData);
      }
      notifyError(err, 'Failed to update status. Changes have been reverted.');
    },

    // 4. Always invalidate to guarantee server reconciliation
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}
```

### Invariants for Optimistic Handlers

1. **Always cancel queries (`cancelQueries`):** Prevents background refetches from overwriting the optimistic state before the mutation resolves.
2. **Always snapshot context (`return { previousData }`):** Captures exact previous state for deterministic restoration.
3. **Always restore on error (`onError`):** Never leave the UI displaying divergent or stale optimistic data after a rejected request.
4. **Always reconcile on settlement (`onSettled`):** Invalidate target queries to reconcile client prediction with final server state.

---

## 5. Concurrency & Race Condition Safeguards

Optimistic UI introduces potential race hazards when multiple actions occur in rapid succession:

1. **Rapid Multi-Toggles (Debouncing / Disabling):**
   - Direct action triggers (e.g. quick toggle buttons) must be disabled while their specific mutation is `isPending` to prevent out-of-order execution.
2. **Concurrent Background Refetches:**
   - Calling `cancelQueries` in `onMutate` ensures that in-flight GET requests cannot clobber the optimistic cache state.
3. **Component Unmounting:**
   - TanStack Query mutation lifecycle handlers execute at the `QueryClient` level, ensuring rollback and cache reconciliation run cleanly even if the user navigates away before the server responds.

---

## 6. Authorization & Security Boundary

- **Client Optimization Only:** Optimistic UX is purely a client-side interface optimization and **never** a security or authorization mechanism.
- **Server Enforcement:** If an unauthorized user attempts an action (e.g. status toggle), the backend will return `403 Forbidden` or `401 Unauthorized`.
- **Immediate Rollback & Feedback:** The frontend will instantly roll back the optimistic state and display an authorization error alert/toast without corrupting application state.

---

## 7. Accessibility & Screen Reader Considerations

1. **ARIA State Synchronization:**
   - Toggle buttons and switches must immediately reflect `aria-checked` or `aria-pressed` based on the optimistic state.
2. **Loading Indication:**
   - Use `aria-busy="true"` on the item container during active network synchronization.
3. **Live Announcements on Failure:**
   - If an optimistic update fails and is rolled back, the resulting error toast or alert must be announced via an `aria-live="assertive"` region so assistive technologies communicate the reversion immediately.

---

## 8. Testing Standards for Optimistic Mutations

Every optimistic mutation must include automated unit/integration tests verifying the full lifecycle:

- **Test Case 1 (Optimistic Application):** Verify UI immediately updates before network promise resolves.
- **Test Case 2 (Successful Settlement):** Verify cache is synchronized with server response and invalidation occurs.
- **Test Case 3 (Rollback on Error):** Mock API rejection (`500` or `403`), verify UI state reverts to original snapshot, and error notification is triggered.
- **Test Case 4 (Cancellation of In-Flight Queries):** Verify `cancelQueries` was invoked prior to cache modification.

---

## 9. Explicit Non-Goals

- **No Global Optimistic Store:** Optimistic state is managed strictly inside TanStack Query cache; no standalone Redux/Zustand stores.
- **No Optimistic Creation with Fake IDs:** Do not generate temporary UUIDs in the client for complex relational entities unless explicitly required and verified.
- **No Unbounded Retries:** Optimistic failures must not infinitely retry in the background without user consent.
