# Resources API Testing, External Contract & Security Specification

**Status**: Approved & Active  
**Milestone**: Phase 6.9 — Backend API Layer  
**Domain**: Resources Management (Consumable Inventory & Fixed Assets)  
**Author**: Senior QA Architect, API Test Engineer, Security Tester & Kinergy Backend Reviewer  
**Governing Documents**:

- [**Resources Public HTTP API Surface**](./resource-api-surface.md)
- [**Resources API Contracts & Validation**](./resource-api-contracts.md)
- [**Resources HTTP Controller Architecture**](./resource-controller-architecture.md)
- [**Resources API Query Conventions**](./resource-api-query-conventions.md)
- [**Resources Management OpenAPI Specification**](./resource-api-documentation.md)

---

## 1. Testing Strategy & Test Suite Architecture

The Phase 6 HTTP API testing strategy proves that the platform behaves correctly as an external contract across all layers of the stack:

```
┌─────────────────────────────────────────────────────────────┐
│                    API Testing Strategy                     │
├─────────────────────────────────────────────────────────────┤
│ 1. OpenAPI 3.0 Contract Generation (resources-openapi.spec) │
│ 2. DTO & Boundary Sanitization (resources-validation.spec)  │
│ 3. RBAC & Security Negative Testing (*.authorization.spec)  │
│ 4. Controller Contracts (*-api.contract.spec)               │
│ 5. Query & DataTable Consistency (*-query-consistency.spec) │
│ 6. End-to-End External Lifecycles (*-contract.e2e.spec)     │
└─────────────────────────────────────────────────────────────┘
```

The 11 automated test suites in [`apps/api/src/resources/__tests__/`](file:///c:/Projects/kinergy-platform/apps/api/src/resources/__tests__/) provide **205 automated tests** with 100% pass rate.

---

## 2. Consumable Inventory API Test Matrix

| Area          | Test Scenario                         | Verified Behavior                                                     | Test Suite                                             |
| :------------ | :------------------------------------ | :-------------------------------------------------------------------- | :----------------------------------------------------- |
| **Products**  | Create authorized product             | Creates item with status `ACTIVE`, returns `201 Created` DTO.         | `inventory-api.contract.spec.ts`                       |
| **Products**  | Create unauthorized request           | Rejects missing/invalid JWT with `401 Unauthorized`.                  | `inventory.authorization.spec.ts`                      |
| **Products**  | Get existing product                  | Returns strongly-typed `InventoryItemResponseDto`.                    | `inventory-api.contract.spec.ts`                       |
| **Products**  | Get missing product                   | Throws `NotFoundException` mapped to standardized `404` envelope.     | `inventory-api.contract.spec.ts`                       |
| **Products**  | Search & multi-facet filters          | Combined `search + category + stockStatus` filtering in CQRS handler. | `resources-query-consistency.spec.ts`                  |
| **Products**  | Pagination & Sorting                  | 1-based pagination, bounded page limits, deterministic `name asc`.    | `resources-query-consistency.spec.ts`                  |
| **Products**  | Generic update (`PATCH`)              | Modifies descriptive metadata; blocks stock quantity injections.      | `resources-security-negative-and-side-effects.spec.ts` |
| **Products**  | Archival & lifecycle transitions      | Transitions status to `ARCHIVED`, `ACTIVE`, and `INACTIVE`.           | `resources-external-api-contract.e2e.spec.ts`          |
| **Stock**     | PO stock receipt (`RECEIPT`)          | Adds quantity, records unit cost, creates ledger movement.            | `resources-external-api-contract.e2e.spec.ts`          |
| **Stock**     | POS retail sale (`SALE`)              | Deducts quantity, records selling price, creates sale movement.       | `resources-external-api-contract.e2e.spec.ts`          |
| **Stock**     | Treatment consumption (`CONSUMPTION`) | Deducts stock allocated to clinical treatment session ID.             | `resources-external-api-contract.e2e.spec.ts`          |
| **Stock**     | Count adjustment (`ADJUSTMENT`)       | Positive/negative reconciliation delta with mandatory reason.         | `resources-validation.spec.ts`                         |
| **Stock**     | Insufficient stock deduction          | Throws `BadRequestException` (`[INV-INV-2]`); balance unchanged.      | `resources-external-api-contract.e2e.spec.ts`          |
| **Stock**     | Invalid zero/negative inputs          | Structural validation pipe rejects with `400 Bad Request`.            | `resources-validation.spec.ts`                         |
| **Reporting** | Low stock trigger & alert             | Correctly evaluates `quantityOnHand <= reorderThreshold`.             | `resources-external-api-contract.e2e.spec.ts`          |
| **Reporting** | Inventory valuation                   | Calculates total working capital at FIFO/weighted cost.               | `inventory-api.contract.spec.ts`                       |

---

## 3. Fixed Asset API Test Matrix

| Area            | Test Scenario                        | Verified Behavior                                                       | Test Suite                                             |
| :-------------- | :----------------------------------- | :---------------------------------------------------------------------- | :----------------------------------------------------- |
| **Assets**      | Commission & register asset          | Returns `201 Created` with initialized `ACTIVE` status and location.    | `fixed-assets-api.contract.spec.ts`                    |
| **Assets**      | Hardware scanner lookup (`tag/:tag`) | Retrieves asset by barcode/RFID tag with instant indexing.              | `fixed-assets-api.contract.spec.ts`                    |
| **Assets**      | Search & multi-facet filtering       | Combined `search + category + status + condition + facility + room`.    | `resources-query-consistency.spec.ts`                  |
| **Assets**      | Generic update (`PATCH`)             | Modifies name and description; rejects status/location injection.       | `resources-security-negative-and-side-effects.spec.ts` |
| **Transfer**    | Physical relocation (`/transfer`)    | Updates location, records transfer actor and timestamp.                 | `resources-external-api-contract.e2e.spec.ts`          |
| **Transfer**    | Terminal state rejection             | Cannot relocate decommissioned or sold assets (`[AST-INV-2]`).          | `resources-security-negative-and-side-effects.spec.ts` |
| **Status**      | State machine transitions            | Validates allowed transitions (`ACTIVE` <-> `UNDER_MAINTENANCE`, etc.). | `fixed-assets-api.contract.spec.ts`                    |
| **Status**      | Terminal state invariant             | Rejecting resurrection from `SOLD` or `RETIRED` (`[AST-INV-1]`).        | `resources-external-api-contract.e2e.spec.ts`          |
| **Condition**   | Physical condition scoring           | Updates rating from `NEW` down to `DAMAGED` or `UNUSABLE`.              | `fixed-assets-api.contract.spec.ts`                    |
| **Maintenance** | Service record creation              | Logs repair description, technician, cost, and updates condition.       | `resources-external-api-contract.e2e.spec.ts`          |
| **Valuation**   | Appraisal valuation update           | Records updated carrying book value with appraisal audit notes.         | `resources-external-api-contract.e2e.spec.ts`          |
| **History**     | Audit event ledger (`/history`)      | Returns paginated immutable history events (`TRANSFERRED`, etc.).       | `resources-query-consistency.spec.ts`                  |
| **History**     | Servicing records (`/maintenance`)   | Returns paginated servicing records with cost and technician.           | `resources-query-consistency.spec.ts`                  |
| **Valuation**   | Cross-domain combined summary        | Composes inventory working capital and asset carrying value.            | `resource-valuation-api.contract.spec.ts`              |

---

## 4. Authentication & Authorization Security Coverage

- **Authentication Guard**: Unauthenticated requests missing JWT tokens are rejected with `401 Unauthorized`.
- **Role & Permission Boundary Matrix**:
  - `inventory.read` / `assets.read`: Granted to `ADMIN`, `SUPER_ADMIN`, `OWNER`, `STAFF`, `TRAINER`, `THERAPIST`.
  - `inventory.write` / `assets.write`: Restricted to `ADMIN`, `SUPER_ADMIN`, `OWNER`, `STAFF`. Users with read-only roles (e.g. `MEMBER`) receive `403 Forbidden`.
  - `billing.read`: Required in addition to domain read permissions for accessing financial valuation summaries (`/valuation/summary`).

---

## 5. Lifecycle Security & Negative Bypass Resistance

In accordance with [**ADR-0099**](./adr/0099-explicit-subresource-state-mutation-endpoints-vs-generic-patch.md), negative attack tests verify that clients cannot bypass domain state machine rules:

1. **Attempting to inject `quantityOnHand` into `PATCH /inventory/:id`**: Automatically rejected by `forbidNonWhitelisted: true` with `400 Bad Request`.
2. **Attempting to inject `status`, `condition`, `location`, or `estimatedValue` into `PATCH /assets/:id`**: Automatically rejected by `forbidNonWhitelisted: true` with `400 Bad Request`.
3. **Attempting to transfer a sold or retired asset**: Rejected by domain aggregate invariant `[AST-INV-2]`.
4. **Attempting to resurrect a sold asset back to active**: Rejected by domain aggregate invariant `[AST-INV-1]`.
5. **Attempting to sell stock below zero**: Rejected by domain aggregate invariant `[INV-INV-2]`.

---

## 6. Contract Serialization & Decimal Representation

- **Monetary Inputs/Outputs**: Serialized as standard IEEE-754 numbers (`unitCost`, `sellingPrice`, `purchaseValueAmount`, `currentEstimatedValueAmount`), avoiding internal Decimal object leakage.
- **Dates**: Serialized consistently as ISO-8601 strings (`2026-08-31T12:00:00.000Z`).
- **Internal Audit / Tenant Leakage**: Technical database columns and multi-tenant keys are suppressed from public response DTOs.

---

## 7. OpenAPI Consistency Coverage

- **Automated OpenAPI Verification**: Verified by [`resources-openapi.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/resources/__tests__/resources-openapi.spec.ts) (**31/31 tests passing**).
- **100% Path Coverage**: All 27 inventory, fixed asset, and cross-domain valuation endpoints are registered and documented in Swagger.
- **Security Schemes**: Bearer authentication requirements are bound across all protected operations.

---

## 8. Remaining Risks & Mitigation

| Risk Description                                          | Severity | Platform Mitigation                                                                                                                                                         |
| :-------------------------------------------------------- | :------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High-concurrency POS checkouts causing race conditions.   | Low      | Optimistic Concurrency Control (`version` column) and atomic database transactions in CQRS handlers.                                                                        |
| Malformed input / XSS payload injection in service notes. | Low      | Platform `InputSanitizer` runs in `GlobalSanitizationValidationPipe` before validation.                                                                                     |
| Inadvertent state bypass in frontend table edits.         | Zero     | Enforced at the architectural layer via dedicated sub-resource action endpoints ([ADR-0099](./adr/0099-explicit-subresource-state-mutation-endpoints-vs-generic-patch.md)). |
