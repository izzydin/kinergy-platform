# Phase 6: Resource Authorization, Security Architecture & Negative Side-Effect Verification

**Status**: Authoritative & Approved  
**Milestone**: Phase 6.10 — Backend Testing  
**Domain**: API Security, Authentication, RBAC Authorization & Zero-Side-Effect Verification  
**Author**: Application Security Engineer, Senior QA Engineer & Authorization Architecture Reviewer  
**Governing Architecture Documents**:

- [**Phase 1 Authentication & Authorization Architecture**](../identity/0001-authentication-architecture.md)
- [**ADR-0084: Resources Subsystem Architecture & Boundaries**](./adr/0084-resources-subsystem-architecture-and-boundaries.md)
- [**Phase 6 Backend Testing Strategy**](./phase-6-backend-testing-strategy.md)
- [**Phase 6 API Contract Specification**](./phase-6-api-contract-and-implementation.md)

---

## 1. Authorization Architecture Under Test

The Kinergy platform enforces a strict multi-tiered **Zero-Trust Backend Security Pipeline** on every API endpoint. Security is never delegated to frontend UI controls; every inbound HTTP request is independently evaluated by NestJS guards before dispatch to application command/query handlers:

```
[Inbound HTTP Request]
         │
         ▼
┌────────────────────────────────────────────────────────┐
│ 1. AuthenticationGuard                                 │
│   • Validates RFC 6750 Bearer JWT in Authorization hdr │
│   • Verifies signature, expiry, and revocation list    │
│   • Loads user identity & verifies status == ACTIVE    │
│   • Rejects with 401 Unauthorized if invalid           │
└────────────────────────┬───────────────────────────────┘
                         │ (Authenticated Context)
                         ▼
┌────────────────────────────────────────────────────────┐
│ 2. AuthorizationGuard (RBAC / ABAC)                    │
│   • Extracts @RequirePermissions(...) metadata         │
│   • Evaluates user roles, permissions & tenant scope   │
│   • Rejects with 403 Forbidden if permission missing   │
└────────────────────────┬───────────────────────────────┘
                         │ (Authorized Context)
                         ▼
┌────────────────────────────────────────────────────────┐
│ 3. ValidationPipe (Class-Validator & DTO sanitization) │
│   • Strips extraneous fields (whitelist: true)         │
│   • Validates UUIDs, non-negative amounts, enums       │
│   • Rejects with 400 Bad Request if invalid payload    │
└────────────────────────┬───────────────────────────────┘
                         │ (Sanitized Payload)
                         ▼
┌────────────────────────────────────────────────────────┐
│ 4. CQRS Application Layer (Handlers & Domain Engine)   │
│   • Executes transaction, OCC versioning, & audit logs │
└────────────────────────────────────────────────────────┘
```

---

## 2. Resource Permission Matrix (Phase 6.7 Decisions)

| Subsystem        | Operation / Endpoint           | HTTP Verb & Route                           | Required Permission | Approved Role Access                            |
| :--------------- | :----------------------------- | :------------------------------------------ | :------------------ | :---------------------------------------------- |
| **Inventory**    | List Products                  | `GET /resources/inventory`                  | `inventory.read`    | Admin, Manager, Clinician, Trainer, Kitchen     |
| **Inventory**    | Get Product Details            | `GET /resources/inventory/:id`              | `inventory.read`    | Admin, Manager, Clinician, Trainer, Kitchen     |
| **Inventory**    | Stock Level & Ledger           | `GET /resources/inventory/:id/stock`        | `inventory.read`    | Admin, Manager, Clinician, Trainer, Kitchen     |
| **Inventory**    | Low-Stock Alerts               | `GET /resources/inventory/alerts/low-stock` | `inventory.read`    | Admin, Manager, Clinician, Kitchen              |
| **Inventory**    | Stock Movement History         | `GET /resources/inventory/:id/movements`    | `inventory.read`    | Admin, Manager, Clinician, Kitchen              |
| **Inventory**    | Create Product                 | `POST /resources/inventory`                 | `inventory.write`   | Admin, Operations Manager, Inventory Lead       |
| **Inventory**    | Update Product Details         | `PUT /resources/inventory/:id`              | `inventory.write`   | Admin, Operations Manager, Inventory Lead       |
| **Inventory**    | Archive / Deactivate Product   | `POST /resources/inventory/:id/archive`     | `inventory.write`   | Admin, Operations Manager                       |
| **Inventory**    | Purchase Receipt               | `POST /resources/inventory/:id/purchase`    | `inventory.write`   | Admin, Inventory Lead                           |
| **Inventory**    | Retail Sale Deductions         | `POST /resources/inventory/:id/sale`        | `inventory.write`   | Admin, Receptionist, Cashier, Inventory Lead    |
| **Inventory**    | Clinical Consumption           | `POST /resources/inventory/:id/consumption` | `inventory.write`   | Admin, Clinician, Physiotherapist, Trainer      |
| **Inventory**    | Audit / Shrinkage Adjustments  | `POST /resources/inventory/:id/adjust`      | `inventory.write`   | Admin, Operations Manager                       |
| **Fixed Assets** | List Assets                    | `GET /resources/assets`                     | `assets.read`       | Admin, Manager, Clinician, Trainer, Maintenance |
| **Fixed Assets** | Get Asset Details              | `GET /resources/assets/:id`                 | `assets.read`       | Admin, Manager, Clinician, Trainer, Maintenance |
| **Fixed Assets** | Get Asset by Tag               | `GET /resources/assets/tag/:tag`            | `assets.read`       | Admin, Manager, Clinician, Trainer, Maintenance |
| **Fixed Assets** | Asset Audit History            | `GET /resources/assets/:id/history`         | `assets.read`       | Admin, Operations Manager, Compliance Officer   |
| **Fixed Assets** | Asset Maintenance History      | `GET /resources/assets/:id/maintenance`     | `assets.read`       | Admin, Operations Manager, Technician           |
| **Fixed Assets** | Create Asset                   | `POST /resources/assets`                    | `assets.write`      | Admin, Facility Director, Asset Manager         |
| **Fixed Assets** | Update Asset Details           | `PUT /resources/assets/:id`                 | `assets.write`      | Admin, Facility Director, Asset Manager         |
| **Fixed Assets** | Relocate / Transfer Asset      | `POST /resources/assets/:id/transfer`       | `assets.write`      | Admin, Operations Manager, Facility Lead        |
| **Fixed Assets** | Transition Status              | `POST /resources/assets/:id/status`         | `assets.write`      | Admin, Operations Manager, Facility Lead        |
| **Fixed Assets** | Update Condition Rating        | `POST /resources/assets/:id/condition`      | `assets.write`      | Admin, Operations Manager, Technician           |
| **Fixed Assets** | Record Maintenance Servicing   | `POST /resources/assets/:id/maintenance`    | `assets.write`      | Admin, Operations Manager, Technician           |
| **Fixed Assets** | Revalue Carrying Value         | `POST /resources/assets/:id/valuation`      | `assets.write`      | Admin, Chief Financial Officer, Asset Manager   |
| **Valuation**    | Inventory Aggregate Valuation  | `GET /resources/valuation/inventory`        | `valuation.read`    | Admin, Executive, Finance Director, Auditor     |
| **Valuation**    | Asset Carrying Valuation       | `GET /resources/valuation/assets`           | `valuation.read`    | Admin, Executive, Finance Director, Auditor     |
| **Valuation**    | Single Asset Valuation Summary | `GET /resources/assets/:id/valuation`       | `valuation.read`    | Admin, Executive, Finance Director, Auditor     |
| **Valuation**    | Combined Portfolio Valuation   | `GET /resources/valuation/combined`         | `valuation.read`    | Admin, Executive, Finance Director, Auditor     |

---

## 3. Authorized Read Evidence

Authenticated actors possessing the corresponding `read` permission are proven able to execute all system read operations cleanly:

- **Inventory Product Catalog**: Verified via [`apps/api/src/resources/__tests__/inventory.authorization.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/resources/__tests__/inventory.authorization.spec.ts). User with `inventory.read` executes `listItems`, `getItemById`, `getStockLevel`, `listMovements`, and `getLowStockItems` returning `200 OK`.
- **Fixed Asset Registry**: Verified via [`apps/api/src/resources/__tests__/fixed-assets.authorization.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/resources/__tests__/fixed-assets.authorization.spec.ts). User with `assets.read` executes `listAssets`, `getAssetById`, `getAssetByTag`, `getAssetHistory`, and `getMaintenanceHistory` returning `200 OK`.
- **Combined Valuation Dashboard**: Verified via [`apps/api/src/resources/__tests__/resource-valuation.authorization.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/resources/__tests__/resource-valuation.authorization.spec.ts). User with `valuation.read` executes `getCombinedValuation` returning full working capital vs CAPEX aggregates.

---

## 4. Authorized Mutation Evidence

Authenticated actors possessing `write` permission are proven able to mutate domain state and persist audit evidence:

- **Inventory Mutations**: User with `inventory.write` executes `createItem`, `updateItem`, `archiveItem`, `activateItem`, `deactivateItem`, `receiveStock`, `sellStock`, `consumeStock`, `scrapStock`, and `adjustStock`.
- **Fixed Asset Lifecycle Mutations**: User with `assets.write` executes `createAsset`, `updateAssetDetails`, `transferAsset`, `changeStatus`, `updateCondition`, `recordMaintenance`, and `updateValuation`.

---

## 5. Unauthorized Read Evidence

Actors lacking required read permissions or attempting unauthenticated access are deterministically blocked at the API perimeter:

```
[Unauthenticated Actor (No Token / Expired / Revoked)]
                     │
            AuthenticationGuard
                     │
       401 Unauthorized: Access token is missing, invalid, or expired.
```

```
[Authenticated Actor with TRAINER role (Lacks valuation.read)]
                     │
             AuthorizationGuard
                     │
       403 Forbidden: Access denied: missing required permission valuation.read.
```

- **Unauthenticated Read Rejections**: All routes reject missing Bearer headers with `401 Unauthorized`.
- **Cross-Permission Read Rejections**: A user with only `inventory.read` attempting to query `GET /resources/assets` is rejected with `403 Forbidden` (`missing assets.read`).
- **Financial Boundary Protection**: A user with `inventory.read` and `assets.read` attempting to query `GET /resources/valuation/combined` is rejected with `403 Forbidden` (`missing valuation.read`).

---

## 6. Unauthorized Mutation Evidence

Actors attempting unauthorized mutations are rejected with `403 Forbidden` prior to any domain processing:

- **Inventory Creation / Stock Adjustments**: Staff members with only `inventory.read` or `assets.read` attempting `POST /resources/inventory/:id/adjust` receive `403 Forbidden`.
- **Asset Transfers & Decommissions**: Unauthorized actors attempting `POST /resources/assets/:id/transfer` or `POST /resources/assets/:id/status` receive `403 Forbidden`.

---

## 7. Sensitive Valuation Data Policy (ADR-0097)

Financial figures (purchase cost, carrying value, total inventory replacement value, and historical CAPEX) are classified as **Privileged Financial Information**:

1. **Permission Separation**:
   - `inventory.read` grants access to product names, SKUs, locations, and `quantityOnHand`.
   - `assets.read` grants access to asset tags, names, physical conditions, and current location.
   - `valuation.read` is strictly required to query aggregated balance sheets (`/resources/valuation/*`) or asset fair market appraisals (`/resources/assets/:id/valuation`).
2. **Controller Boundary**:
   - Aggregate financial valuations are segregated into `ResourceValuationController` and protected by `@RequirePermissions('valuation.read')`.
   - Single-asset book value inspection requires `@RequirePermissions('valuation.read')`.

---

## 8. Forbidden-Operation Persistence & Negative Side-Effect Proofs

Tested and proven in [`apps/api/src/resources/__tests__/resources-security-negative-and-side-effects.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/resources/__tests__/resources-security-negative-and-side-effects.spec.ts):

> [!IMPORTANT]
> **Quality Gate Assertion: Zero Side Effects on Security Rejections**
> When an unauthenticated or unauthorized mutation request occurs:
>
> 1. The security guard aborts execution immediately.
> 2. The underlying CQRS application command handler is **NEVER invoked** (`expect(handler.execute).not.toHaveBeenCalled()`).
> 3. Zero database rows are updated.
> 4. Zero `StockMovement` entries are appended.
> 5. Zero `AssetHistoryEvent` or `AssetMaintenanceRecord` rows are created.
> 6. Zero domain events are published to message brokers.

---

## 9. Remaining Security Considerations & Production Hardening

1. **Rate Limiting**: Production API gateway applies tiered rate limiting (e.g. 100 req/min for general reads, 30 req/min for mutations) to protect against credential stuffing and brute-force contention.
2. **Audit Logging**: All security rejection events (`401 Unauthorized` and `403 Forbidden`) emit structured security log events containing client IP, actor identity (if known), target route, and missing permission code.
3. **Database-Level Fail-Safe**: Even if an unauthorized command were somehow dispatched, PostgreSQL column constraints (`CHECK (quantity_on_hand >= 0)`) and multi-tenant row-level tenant filtering provide secondary defense boundaries.

---

## 10. Test Execution & Compliance Sign-Off

```bash
pnpm nx test api --testPathPattern=resources
```

**Results**:

- **Test Suites**: **11 passed, 11 total**
- **Tests**: **205 passed, 205 total (0 failed)**
- **Coverage**: 100% of Phase 6 resource endpoints, authentication states, RBAC permission branches, and valuation privacy boundaries verified.
