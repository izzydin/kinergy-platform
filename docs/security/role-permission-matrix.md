# Platform Role & Permission Matrix Specification

- **Status:** Approved Architecture Specification (Authoritative Single Source of Truth)
- **Date:** 2026-07-29
- **Domain:** Identity & Access Management (IAM)
- **Target Specification:** `prisma/seeds/identity.seed.ts` & `apps/api/src/platform/identity/authorization`

---

## 1. Executive Summary

This document specifies the authoritative **Role-to-Permission Mapping Matrix**, **Permission Catalog Reference**, and **Authorization Naming Conventions** for the Kinergy Platform. Every permission documented here corresponds 1:1 with the seed dataset in `prisma/seeds/identity.seed.ts` and the runtime permission evaluation engines (`DefaultPermissionResolver`, `DefaultAuthorizationEvaluator`).

---

## 2. Permission Naming Conventions & Rules

Permission codes follow a standardized, hierarchical dot-separated notation:

$$\text{<module>}.\text{[resource]}.\text{<action>}$$

### Naming Standards & Action Verbs

| Action Verb | Intended Scope & Semantics                                   | Example Permission Code               |
| :---------- | :----------------------------------------------------------- | :------------------------------------ |
| `read`      | Read-only access to view or fetch resource lists and details | `users.read`, `clients.read`          |
| `write`     | Create and update mutations on a resource                    | `users.write`, `inventory.write`      |
| `create`    | Dedicated creation mutation on a resource                    | `appointments.create`                 |
| `update`    | Dedicated modification mutation on an existing resource      | `appointments.update`                 |
| `delete`    | Deactivation, cancellation, or soft-deletion of a resource   | `users.delete`, `appointments.delete` |
| `manage`    | Operational queue, order state, and full workflow control    | `kitchen.orders.manage`               |
| `export`    | Analytics extraction, CSV/PDF report download                | `reports.export`                      |

---

## 3. Seeded Permission Catalog (34 Total Permissions across 13 Modules)

The platform seeds **34 permissions** across **13 functional modules** into the PostgreSQL database (`permissions` table). Reference: [ADR-0025](../adr/0025-role-and-permission-authorization-framework.md), [ADR-0111](../adr/0111-sales-payments-authorization-and-audit.md), and [ADR-0135](../adr/0135-sales-payments-receipts-authorization-and-security.md).

| Module           | Permission Code             | Description                                                          |
| :--------------- | :-------------------------- | :------------------------------------------------------------------- |
| **Users**        | `users.read`                | View user accounts                                                   |
|                  | `users.write`               | Create and update user accounts                                      |
|                  | `users.delete`              | Deactivate or remove user accounts                                   |
| **Clients**      | `clients.read`              | View client profiles                                                 |
|                  | `clients.write`             | Create and update client profiles                                    |
|                  | `clients.delete`            | Delete client profiles                                               |
| **Appointments** | `appointments.read`         | View appointment schedules                                           |
|                  | `appointments.create`       | Schedule new appointments                                            |
|                  | `appointments.update`       | Modify existing appointments                                         |
|                  | `appointments.delete`       | Cancel or delete appointments                                        |
| **Kitchen**      | `kitchen.read`              | View kitchen orders and menu items                                   |
|                  | `kitchen.orders.manage`     | Update order status and manage kitchen queue                         |
| **Inventory**    | `inventory.read`            | View stock levels and inventory items                                |
|                  | `inventory.write`           | Update stock levels and manage inventory                             |
| **Assets**       | `assets.read`               | View fixed assets and equipment                                      |
|                  | `assets.write`              | Manage and update fixed assets                                       |
| **Billing**      | `billing.read`              | View invoices and payment history (legacy)                           |
|                  | `billing.write`             | Process payments and issue invoices (legacy)                         |
| **Sales**        | `sales.read`                | View commercial sales orders and details                             |
|                  | `sales.create`              | Create sales checkout sessions and items                             |
|                  | `sales.manage`              | Discretionary discount overrides and control                         |
|                  | `sales.cancel`              | Cancel or void commercial sale orders                                |
| **Payments**     | `payments.read`             | View payment transaction history and records                         |
|                  | `payments.create`           | Record payment tender (Cash, QR) against sale                        |
|                  | `payments.manage`           | Settle pending payments or void tender                               |
| **Receipts**     | `receipts.read`             | View and download customer receipt vouchers for settled transactions |
|                  | `receipts.manage`           | Authorize receipt reprints, issue duplicate vouchers, credit notes   |
| **Reports**      | `reports.read`              | View operational and business reports                                |
|                  | `reports.export`            | Export report data and analytics                                     |
| **Settings**     | `settings.read`             | View system configuration settings                                   |
|                  | `settings.write`            | Modify system configuration settings                                 |
| **Identity**     | `identity.roles.read`       | View system roles and permissions                                    |
|                  | `identity.roles.write`      | Manage system roles and permissions                                  |
|                  | `identity.permissions.read` | View permission catalog                                              |

---

## 4. Role $\rightarrow$ Permission Assignment Matrix

The following matrix documents the exact permissions assigned to each system role in the seeded database (`roles` and `role_permissions` tables) along with Phase 7 Sales, Payments & Receipts authorization ([ADR-0135](../adr/0135-sales-payments-receipts-authorization-and-security.md)):

| Permission Code             | Owner (System Super Admin) | Manager / Gym Manager | Trainer | Kitchen Staff | Receptionist |
| :-------------------------- | :------------------------: | :-------------------: | :-----: | :-----------: | :----------: |
| `users.read`                |             ✅             |          ✅           |   ❌    |      ❌       |      ❌      |
| `users.write`               |             ✅             |          ✅           |   ❌    |      ❌       |      ❌      |
| `users.delete`              |             ✅             |          ❌           |   ❌    |      ❌       |      ❌      |
| `clients.read`              |             ✅             |          ✅           |   ✅    |      ❌       |      ✅      |
| `clients.write`             |             ✅             |          ✅           |   ✅    |      ❌       |      ✅      |
| `clients.delete`            |             ✅             |          ❌           |   ❌    |      ❌       |      ❌      |
| `appointments.read`         |             ✅             |          ✅           |   ✅    |      ❌       |      ✅      |
| `appointments.create`       |             ✅             |          ✅           |   ✅    |      ❌       |      ✅      |
| `appointments.update`       |             ✅             |          ✅           |   ✅    |      ❌       |      ✅      |
| `appointments.delete`       |             ✅             |          ✅           |   ❌    |      ❌       |      ✅      |
| `kitchen.read`              |             ✅             |          ✅           |   ❌    |      ✅       |      ❌      |
| `kitchen.orders.manage`     |             ✅             |          ✅           |   ❌    |      ✅       |      ❌      |
| `inventory.read`            |             ✅             |          ✅           |   ❌    |      ✅       |      ❌      |
| `inventory.write`           |             ✅             |          ✅           |   ❌    |      ✅       |      ❌      |
| `billing.read` (legacy)     |             ✅             |          ✅           |   ❌    |      ❌       |      ✅      |
| `billing.write` (legacy)    |             ✅             |          ✅           |   ❌    |      ❌       |      ✅      |
| `sales.read`                |             ✅             |          ✅           |   ✅    |      ✅       |      ✅      |
| `sales.create`              |             ✅             |          ✅           |   ❌    |      ✅       |      ✅      |
| `sales.manage`              |             ✅             |          ✅           |   ❌    |      ❌       |      ❌      |
| `sales.cancel`              |             ✅             |          ✅           |   ❌    |      ❌       |      ✅      |
| `payments.read`             |             ✅             |          ✅           |   ❌    |      ❌       |      ✅      |
| `payments.create`           |             ✅             |          ✅           |   ❌    |      ✅       |      ✅      |
| `payments.manage`           |             ✅             |          ✅           |   ❌    |      ❌       |      ✅      |
| `receipts.read`             |             ✅             |          ✅           |   ✅    |      ✅       |      ✅      |
| `receipts.manage`           |             ✅             |          ✅           |   ❌    |      ❌       |      ✅      |
| `reports.read`              |             ✅             |          ✅           |   ✅    |      ❌       |      ❌      |
| `reports.export`            |             ✅             |          ✅           |   ❌    |      ❌       |      ❌      |
| `settings.read`             |             ✅             |          ✅           |   ❌    |      ❌       |      ❌      |
| `settings.write`            |             ✅             |          ❌           |   ❌    |      ❌       |      ❌      |
| `identity.roles.read`       |             ✅             |          ❌           |   ❌    |      ❌       |      ❌      |
| `identity.roles.write`      |             ✅             |          ❌           |   ❌    |      ❌       |      ❌      |
| `identity.permissions.read` |             ✅             |          ❌           |   ❌    |      ❌       |      ❌      |

### Backward Compatibility Mapping

For tokens issued during Phase 1:

- `billing.read` automatically grants `payments.read`, `sales.read`, and `receipts.read`.
- `billing.write` automatically grants `payments.create` and `sales.create`.
- `payments.manage` covers `payments.create` and `payments.read`.
- `receipts.manage` covers `receipts.read`.

---

## 5. Future Migration to Database-Managed Tenant Roles

### 5.1 Current Static Seed Baseline

Currently, permissions and system roles are populated deterministically during initialization via `seedIdentity(prisma)`. All permissions link to roles through PostgreSQL foreign keys (`role_permissions.role_id` $\rightarrow$ `roles.id` and `role_permissions.permission_id` $\rightarrow$ `permissions.id`).

### 5.2 Dynamic Tenant RBAC Migration Path

The system is architected for seamless evolution into a fully dynamic UI-managed RBAC system:

1. **System Roles (`RoleType.SYSTEM`)**:
   - `Owner`, `Trainer`, `Kitchen Staff`, `Receptionist`.
   - Immutable system roles protected against unauthorized modification or deletion by tenant administrators.

2. **Custom Tenant Roles (`RoleType.TENANT`)**:
   - Tenant administrators will create custom roles (e.g. `Shift Supervisor`, `Nutritionist`, `Junior Receptionist`) via the Admin Console (`POST /api/v1/roles`).
   - Permissions from the `permissions` table can be dynamically checked/unchecked in the UI, creating or deleting `RolePermission` join records in real time.

3. **Zero Code Changes Required**:
   - The runtime `DefaultPermissionResolver` queries effective permissions dynamically from the database (`user.role.permissions`).
   - Adding custom tenant roles or updating role permission mappings requires zero backend code deployments or guard modifications.

---

## 6. Unresolved Business Decisions & Explicit Governance Boundaries

In accordance with Kinergy's IAM least-privilege policy and [ADR-0135 Section 13](../adr/0135-sales-payments-receipts-authorization-and-security.md), four business decisions remain open and are not silently granted via broad access:

### Decision 1: Discretionary Discount Threshold & Front Desk Escalation

- **Context**: Standard point-of-sale checkout operations use `sales.create`. However, discretionary discounts $> 15\%$ or custom price overrides represent financial leak vectors requiring manager oversight (`sales.manage`).
- **Current Baseline Enforcement**: `Receptionist` is granted `sales.create` and `billing.write` but strictly denied `sales.manage`.
- **Open Product Decision**:
  - _Option A_: Fixed percentage threshold ($\le 15\%$ permitted with `sales.create`; $> 15\%$ rejected without `sales.manage`).
  - _Option B_: Flat dollar cap per order (e.g., discounts up to \$20 allowed without manager sign-off).
  - _Option C_: Zero discretionary discounts by staff; cashiers may only apply pre-configured promotional codes.
- **Interim Security Posture**: Until product management establishes a codified policy, `sales.create` allows standard promotional discounts; arbitrary price overrides and discretionary manager discounts strictly require `sales.manage` (Owner/Manager).

### Decision 2: Kitchen Staff POS Receipt Reprint Authority

- **Context**: Kitchen staff ring up counter food/beverage orders and need to give customers proof of purchase upon payment.
- **Current Baseline Enforcement**: `Kitchen Staff` is granted `receipts.read` (permitting immediate generation and printing of customer vouchers upon sale settlement), but denied `receipts.manage`.
- **Open Product Decision**: Should kitchen personnel be authorized to perform formal re-prints with monotonic reprint counters if a customer damages their voucher, or must reprint requests be directed to the front-desk Receptionist?
- **Interim Security Posture**: `receipts.manage` is withheld from `Kitchen Staff`. Only `Receptionist` and `Owner` retain voucher reprinting and duplicate note issuance.

### Decision 3: Trainer Sales Query Scoping Policy

- **Context**: Trainers need to confirm whether clients possess active paid training or kinesiology packages prior to conducting sessions.
- **Current Baseline Enforcement**: `Trainer` is granted `sales.read` and `receipts.read`, but strictly denied all mutation permissions (`sales.create`, `sales.manage`, `sales.cancel`) and all payment permissions (`payments.*`).
- **Open Product Decision**: Should `sales.read` for Trainers be physically scoped at the database/query layer exclusively to sales containing session/package line items assigned to that trainer, or are trainers permitted to view general gym facility retail orders within the tenant?
- **Interim Security Posture**: At the HTTP transport layer, `sales.read` is required. Object-level filtering in application queries scopes access to assigned client records, preventing unauthorized browsing of tenant-wide retail revenue.

### Decision 4: Client Self-Service Portal Permission Strategy

- **Context**: Future mobile and web self-service will allow gym members (clients) to inspect their own receipts and past purchases.
- **Current Baseline Enforcement**: The `Client` role has zero system permissions in `SYSTEM_ROLE_DEFINITIONS`.
- **Open Product Decision**: Should gym members receive granular role permissions (e.g., `sales.self.read`, `receipts.self.read`), or should they receive canonical `receipts.read` paired with strict ABAC ownership filters (`where: { clientId: currentUser.clientId }`)?
- **Interim Security Posture**: Clients cannot access staff endpoints. In client portal routes, strict ownership checks ensure clients can never query other members' financial records.
