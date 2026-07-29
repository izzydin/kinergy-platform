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

## 3. Seeded Permission Catalog (22 Total Permissions)

The platform seeds **22 permissions** across **9 functional modules** into the PostgreSQL database (`permissions` table).

| Module           | Permission Code             | Description                                  |
| :--------------- | :-------------------------- | :------------------------------------------- |
| **Users**        | `users.read`                | View user accounts                           |
|                  | `users.write`               | Create and update user accounts              |
|                  | `users.delete`              | Deactivate or remove user accounts           |
| **Clients**      | `clients.read`              | View client profiles                         |
|                  | `clients.write`             | Create and update client profiles            |
|                  | `clients.delete`            | Delete client profiles                       |
| **Appointments** | `appointments.read`         | View appointment schedules                   |
|                  | `appointments.create`       | Schedule new appointments                    |
|                  | `appointments.update`       | Modify existing appointments                 |
|                  | `appointments.delete`       | Cancel or delete appointments                |
| **Kitchen**      | `kitchen.read`              | View kitchen orders and menu items           |
|                  | `kitchen.orders.manage`     | Update order status and manage kitchen queue |
| **Inventory**    | `inventory.read`            | View stock levels and inventory items        |
|                  | `inventory.write`           | Update stock levels and manage inventory     |
| **Billing**      | `billing.read`              | View invoices and payment history            |
|                  | `billing.write`             | Process payments and issue invoices          |
| **Reports**      | `reports.read`              | View operational and business reports        |
|                  | `reports.export`            | Export report data and analytics             |
| **Settings**     | `settings.read`             | View system configuration settings           |
|                  | `settings.write`            | Modify system configuration settings         |
| **Identity**     | `identity.roles.read`       | View system roles and permissions            |
|                  | `identity.roles.write`      | Manage system roles and permissions          |
|                  | `identity.permissions.read` | View permission catalog                      |

---

## 4. Role $\rightarrow$ Permission Assignment Matrix

The following matrix documents the exact permissions assigned to each system role in the seeded database (`roles` and `role_permissions` tables).

| Permission Code                | Owner (System Super Admin) |  Trainer   | Kitchen Staff | Receptionist |
| :----------------------------- | :------------------------: | :--------: | :-----------: | :----------: |
| `users.read`                   |             ✅             |     ❌     |      ❌       |      ❌      |
| `users.write`                  |             ✅             |     ❌     |      ❌       |      ❌      |
| `users.delete`                 |             ✅             |     ❌     |      ❌       |      ❌      |
| `clients.read`                 |             ✅             |     ✅     |      ❌       |      ✅      |
| `clients.write`                |             ✅             |     ✅     |      ❌       |      ✅      |
| `clients.delete`               |             ✅             |     ❌     |      ❌       |      ❌      |
| `appointments.read`            |             ✅             |     ✅     |      ❌       |      ✅      |
| `appointments.create`          |             ✅             |     ✅     |      ❌       |      ✅      |
| `appointments.update`          |             ✅             |     ✅     |      ❌       |      ✅      |
| `appointments.delete`          |             ✅             |     ❌     |      ❌       |      ✅      |
| `kitchen.read`                 |             ✅             |     ❌     |      ✅       |      ❌      |
| `kitchen.orders.manage`        |             ✅             |     ❌     |      ✅       |      ❌      |
| `inventory.read`               |             ✅             |     ❌     |      ✅       |      ❌      |
| `inventory.write`              |             ✅             |     ❌     |      ✅       |      ❌      |
| `billing.read`                 |             ✅             |     ❌     |      ❌       |      ✅      |
| `billing.write`                |             ✅             |     ❌     |      ❌       |      ✅      |
| `reports.read`                 |             ✅             |     ✅     |      ❌       |      ❌      |
| `reports.export`               |             ✅             |     ❌     |      ❌       |      ❌      |
| `settings.read`                |             ✅             |     ❌     |      ❌       |      ❌      |
| `settings.write`               |             ✅             |     ❌     |      ❌       |      ❌      |
| `identity.roles.read`          |             ✅             |     ❌     |      ❌       |      ❌      |
| `identity.roles.write`         |             ✅             |     ❌     |      ❌       |      ❌      |
| `identity.permissions.read`    |             ✅             |     ❌     |      ❌       |      ❌      |
| **Total Permissions Assigned** |        **22 / 22**         | **6 / 22** |  **4 / 22**   |  **8 / 22**  |

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
