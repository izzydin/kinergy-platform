# Track B — Step B5.0: User Management Integration Architecture Contract

## Overview & Architectural Scope

This document defines the formal architectural contract for the **User Management Module** (`modules/identity/user-management`), establishing state ownership, route boundaries, API conventions, domain constraints, authorization rules, and testing strategies prior to UI implementation.

The User Management module follows the **Feature-First Architecture** defined in **ADR-001** and **ADR-003**, consuming shared infrastructure from **A6**, authentication context from **B2**, and protected routing boundaries from **B3**.

---

## 1. Module Boundary & Public API

The User Management module resides at:
`apps/web/src/modules/identity/user-management/`

```text
apps/web/src/modules/identity/user-management/
├── api/
│   ├── user-management-api.ts          # Pure HTTP transport functions (shared/api/http-client)
│   └── user-management-queries.ts      # TanStack Query custom hooks (useUsersQuery, useActivateUserMutation, etc.)
├── components/                         # Presentation-only UI components
│   ├── user-status-badge.tsx           # Semantic status indicator (Active, Inactive, Pending)
│   ├── user-list-table.tsx             # Accessible list/table view for user records
│   ├── user-filter-bar.tsx             # Search input & status/role filter controls
│   └── user-form-dialog.tsx            # Create/Edit user modal dialog
├── domain/                             # Pure domain types & status state definitions
│   └── user.types.ts
├── hooks/                              # Module-local UI & URL state hooks
│   └── use-user-filters.ts             # URL search params sync hook
├── mocks/                              # MSW mock request handlers for isolated testing
│   └── user-management-handlers.ts
├── routes/                             # React Router sub-router & page view boundaries
│   ├── user-management-router.tsx      # Module sub-router component
│   ├── user-list-page.tsx              # Primary list & filtering page view
│   └── user-detail-page.tsx            # User detail & action page view
├── schemas/                            # Zod validation schemas
│   └── user-form.schema.ts
└── index.ts                            # Canonical Public API export boundary
```

### Public API Strict Enforcements

- **Forbidden**: Importing internal module paths from external modules (e.g. `import { UserForm } from '../../identity/user-management/components/user-form'`).
- **Allowed**: Only imports directly from the module entry point:
  `import { UserManagementSubRouter } from '@/modules/identity/user-management';`

---

## 2. Route Strategy & Integration

The module registers its protected route contract with the central `moduleRegistry`:

```typescript
moduleRegistry.register({
  id: 'user-management',
  prefix: '/admin/users',
  title: 'User Management',
  isProtected: true,
  requiredPermissions: ['manage:users'],
  component: UserManagementSubRouter,
});
```

### Route Hierarchy

```text
Protected Routes (DashboardLayout)
└── /admin/users/*
    ├── /admin/users             -> UserListPage (List, Search, Filter, Pagination)
    └── /admin/users/:userId     -> UserDetailPage (User Details, History, Domain Actions)
```

Centralized route helper functions in `user-management.routes.ts` prevent hardcoded path strings throughout the component tree.

---

## 3. State Ownership Matrix

The project's strict state ownership rules apply across the module:

| State Type         | Mechanism                                | Responsibilities                                                                                                                        |
| :----------------- | :--------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| **Server State**   | TanStack Query (`@tanstack/react-query`) | Asynchronous user list fetching, caching, cache invalidation (`userManagementKeys.all`), optimistic updates, mutation execution.        |
| **URL State**      | React Router (`useSearchParams`)         | Search query (`q`), page index (`page`), page size (`limit`), status filter (`status`), role filter (`role`). Bookmarkable & shareable. |
| **Local UI State** | React (`useState`, `useReducer`)         | Dialog visibility (`isCreateDialogOpen`), active drawer selection, transient toggle states.                                             |
| **Form State**     | React Hook Form (`react-hook-form`)      | Uncontrolled input registration, dirty state, submission tracking, validation error states.                                             |
| **Validation**     | Zod (`zod`)                              | Declarative schema validation for user creation & modification payloads.                                                                |

_No secondary state management libraries (Redux, Zustand, Recoil) are permitted._

---

## 4. User Domain Boundary & Semantic Schema

The Identity User entity represents **authentication & authorization identity only**. Business domain profile data is strictly excluded.

### Permitted User Entity Fields

- `id` (string - CUID/UUID)
- `email` (string - RFC 5322 compliant)
- `name` (string - display name)
- `status` (`'ACTIVE' | 'INACTIVE' | 'PENDING' | 'BLOCKED'`)
- `roles` (readonly string[] - e.g. `['ADMIN', 'OPERATOR', 'MEMBER']`)
- `permissions` (readonly string[] - e.g. `['manage:users', 'client:read']`)
- `tenantId` (string - multi-tenant identifier)
- `createdAt` (ISO 8601 string)
- `updatedAt` (ISO 8601 string)
- `lastLoginAt` (ISO 8601 string | null)

### Explicitly Excluded Fields

- ❌ Phone numbers
- ❌ Employee / HR profile fields
- ❌ Trainer / Kinesiology profile fields
- ❌ Client health data or clinical records
- ❌ Billing / payment metadata

---

## 5. Domain Mutation Strategy

User status transitions are **explicit semantic domain operations**, not generic field updates.

### API Transport Contract

- **Search & List**: `GET /api/v1/admin/users?q=...&page=1&limit=10&status=ACTIVE`
- **User Details**: `GET /api/v1/admin/users/:userId`
- **Create User**: `POST /api/v1/admin/users`
- **Update User**: `PUT /api/v1/admin/users/:userId`
- **Activate User**: `POST /api/v1/admin/users/:userId/activate` (Semantic Domain Mutation)
- **Deactivate User**: `POST /api/v1/admin/users/:userId/deactivate` (Semantic Domain Mutation)
- **Reset Password**: `POST /api/v1/admin/users/:userId/reset-password`

### Mutation Lifecycle Safeguards

1. **Invocation**: Executed via custom TanStack Query mutation hooks (`useActivateUserMutation()`, `useDeactivateUserMutation()`).
2. **Side Effects**: On success, invalidates `userManagementKeys.all` and emits feedback via `useNotification().showToast()`.
3. **Error Handling**: Catches `ApiError` instances (400, 401, 403, 409) and displays clear inline or toast alerts.

---

## 6. 4-State UI Contract (Loading, Error, Empty, Populated)

Every view in the module adheres to the 4-State UI Contract established in **A5 / A6**:

1. **Loading State**: Displays table row skeletons (`<Skeleton className="..." />`) maintaining exact layout dimensions without cumulative layout shifts.
2. **Error State**: Displays `<StateView variant="error">` or inline `<Alert variant="destructive">` with retry button (`retry()`).
3. **Empty State**: Displays `<StateView variant="empty">` with clear guidance ("No user accounts found matching your filter criteria. Try resetting filters or invite a new user.").
4. **Populated State**: Displays lightweight accessible table listing users with pagination controls, status badges, and action dropdowns.

---

## 7. Authorization & UX Security Boundary

- **UX Controls (Frontend)**: Uses `useAuth().hasPermission('manage:users')` or `useAuth().hasRole('ADMIN')` to conditionally show/hide or disable user creation buttons and status toggle actions.
- **Security Boundary (Backend)**: NestJS `@Permissions('manage:users')` and `@Roles('ADMIN')` enforced by `AuthorizationGuard` on API endpoints remain the sole true security boundary. Hidden UI elements are treated purely as user experience enhancements.

---

## 8. Testing Strategy

- **MSW Mock Handlers**: Defined in `modules/identity/user-management/mocks/user-management-handlers.ts` mocking `GET /api/v1/admin/users`, `POST /activate`, `POST /deactivate`, `POST /users`.
- **Component Tests**: Unit test suites verifying `UserStatusBadge`, `UserFilterBar`, and `UserFormDialog` rendering and ARIA compliance.
- **Integration Test Suite**: Complete user journey tests covering user list rendering, URL query param sync, user creation, status activation/deactivation, and 403 Forbidden handling.

---

## 9. B5 Step Implementation Sequence

```text
Step B5.0: User Management Architecture Review & Contract (COMPLETE)
    ↓
Step B5.1: User Management Data Layer (Types, Zod Schemas, API Client, TanStack Query Hooks, MSW Handlers)
    ↓
Step B5.2: User Management List & Filtering View (Lightweight Table, Pagination, URL Search Params)
    ↓
Step B5.3: User Creation & Edit Dialog Forms (React Hook Form, Zod Validation, Error Handling)
    ↓
Step B5.4: User Activation & Deactivation Domain Actions (Semantic Mutations, Toast Feedback)
    ↓
Step B5.5: E2E Integration Test Suite & Final Quality Gates Validation
```
