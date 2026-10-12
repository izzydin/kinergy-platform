# ADR-0136: Sales API Architecture, HTTP Contracts & Unified Commercial Ledger Specification

- **Status**: **ACCEPTED**
- **Date**: 2026-10-12
- **Deciders**: Principal API Architect, Application Security Lead, Principal Financial Domain Architect
- **Context**: Kinergy Platform Phase 7 (Commercial Sales, Payments & Receipts — Milestone 7.14: Sales API). Following the acceptance of Milestone 7.13 (Authorization & Security, ADR-0135), this ADR establishes the authoritative RESTful HTTP contract for the unified Sales ledger (`/api/v1/sales`), defining endpoint specifications, request/response DTOs, validation pipelines, monetary serialization, multi-tier error contracts, filtering, and deterministic pagination.
- **Consulted ADRs**:
  - [ADR-0010: Backend Clean Architecture Layering](0010-backend-clean-architecture-layering.md)
  - [ADR-0021: Transactional Consistency & Unit of Work Pattern](0021-transactional-consistency-unit-of-work.md)
  - [ADR-0024: Authentication Guard Architecture](0024-authentication-guard-architecture.md)
  - [ADR-0025: Role and Permission Authorization Framework](0025-role-and-permission-authorization-framework.md)
  - [ADR-0026: Reusable Security Decorators Architecture](0026-reusable-security-decorators-architecture.md)
  - [ADR-0027: Authenticated Request Context Architecture](0027-authenticated-request-context-architecture.md)
  - [ADR-0035: Global Validation and Input Sanitization Pipeline](0035-global-validation-and-input-sanitization-pipeline.md)
  - [ADR-0071: Frontend CRUD Experience Lifecycle and Composition Contract](0071-frontend-crud-experience-lifecycle-and-composition-contract.md)
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](0108-money-representation.md)
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](0110-sale-ownership.md)
  - [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](0111-sales-payments-authorization-and-audit.md)
  - [ADR-0112: Sales & Payments Bounded Context Establishment](0112-sales-bounded-context.md)
  - [ADR-0113: Item-Level Discount Domain Model, Deterministic Calculation, and Invariant Enforcement](0113-item-level-discounts.md)
  - [ADR-0114: Canonical Monetary Policy, Deterministic Arithmetic, and Sale Totals Invariant Enforcement](0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0117: Receipt Domain Boundary, Document Model, and Legal Proof-of-Purchase Invariants](0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0118: Sale Reference and Receipt Identification Strategy](0118-sale-reference-and-receipt-identification-strategy.md)
  - [ADR-0119: Sale Aggregate Boundary, Invariants, and Commercial Transaction Integrity](0119-sale-aggregate-boundary-and-invariants.md)
  - [ADR-0120: Commercial Transaction Uniqueness, Idempotency, and Exactly-One-Sale Invariant](0120-commercial-transaction-uniqueness-and-sale-idempotency.md)
  - [ADR-0121: Sale Source References and Commercial Origin Model](0121-sale-source-references-and-commercial-origin-model.md)
  - [ADR-0122: Phase 7 Financial Persistence Architecture and Relational Integrity Model](0122-phase-7-financial-persistence-architecture.md)
  - [ADR-0125: Phase 7 Transaction Architecture and Atomic Persistence Boundaries](0125-phase-7-transaction-architecture-and-atomic-boundaries.md)
  - [ADR-0131: Phase 7 Query Patterns, Index Optimization, and Relation-Loading Strategy](0131-phase-7-query-patterns-index-optimization-and-relation-loading.md)
  - [ADR-0132: Sale Application Layer Architecture, Use Case Inventory, and Orchestration Contracts](0132-sale-application-layer-architecture.md)
  - [ADR-0135: Sales, Payments & Receipts Authorization Architecture, IAM Integration & Security Boundaries](0135-sales-payments-receipts-authorization-and-security.md)

---

## 1. Context and Problem Statement

The Sales & Payments bounded context governs the commercial checkout session, line-item snapshotting, price locking, discount evaluation, and financial settlement across Kinergy's operational domains (Gym Memberships, Kinesiology Sessions, Consumable Inventory, and Facility Services).

While Milestones 7.1 through 7.12 implemented the pure domain entities, monetary value objects, persistence mapping, and application use cases, and Milestone 7.13 established strict IAM authorization and multi-tenant security boundaries, Milestone 7.14 must establish the **authoritative, production-grade HTTP REST interface** for the unified Sales ledger.

### Architectural Risks & Requirements Addressed:

1. **Protocol Decoupling vs Clean Architecture:** The presentation tier (`apps/api/src/sales`) must never contain domain financial logic, state-machine calculations, or pricing formulas. It coordinates transport deserialization, DTO validation, user context extraction, application handler delegation, and HTTP status code translation.
2. **Deterministic Monetary Serialization:** Under ADR-0108 and ADR-0114, financial numbers must never be exposed as raw floating-point numbers or database ORM `Decimal` objects. Responses must expose both structured `MoneyResponseDto` representations and flat summary floats rounded via Commercial Half-Up minor cent arithmetic.
3. **Frontend Standard Alignment:** Web tables (`@kinergy-platform/web`) adhere to a URL-driven state model (`useTableUrlState`) using free-text search `q`, compound sorting `sort=<field>.<dir>`, 1-indexed pagination (`page`, `limit`), and domain facet filters (`status`, `clientId`, `fromDate`, `toDate`). The API query contract must natively ingest, validate, and fulfill these parameters without ad-hoc controller hacks.
4. **Security & Zero Information Disclosure:** Under ADR-0135, unauthorized callers must never observe sales existence or monetary data. Multi-tenant access violations must return `404 Not Found` rather than `403 Forbidden` to prevent cross-tenant ID enumeration.

---

## 2. Global Architectural Conventions

### 2.1 Route Taxonomy & Base URI

All commercial sales routes are scoped under the global platform prefix `/api/v1` and the sales context controller `/sales`:

```http
Base Path: /api/v1/sales
```

Entity identifiers use non-empty UUID v4 strings or prefixed domain IDs (`sale_01j9876543210abcdef`, `item_01j9876543210abcdef`).

### 2.2 Security Pipeline

Every sales endpoint is guarded at the controller level:

```typescript
@ApiTags('Sales')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@UseFilters(SalesExceptionFilter)
@Controller('api/v1/sales')
export class SalesController { ... }
```

- **Authentication:** `AuthenticationGuard` validates the Bearer JWT access token and populates `@CurrentUser()`.
- **Authorization:** `AuthorizationGuard` verifies dot-notation permission tokens (`sales.create`, `sales.read`, `sales.cancel`) and role memberships.
- **Tenant Isolation:** Enforced at both the controller (`user.tenantId`) and application handler boundaries (`enforceSaleTenantIsolation`). Cross-tenant access yields `404 Not Found`.

### 2.3 Financial & Monetary Contract

1. **No Floating-Point Calculations:** Totaling, discounting, and line multiplications occur strictly inside domain aggregate logic using integer cents (`Money.cents: bigint | number`).
2. **Client Totals Ignored:** Request DTOs cannot supply order totals (`subtotal`, `discountTotal`, `total`). Any client-submitted totals are ignored; totals are strictly derived by the `Sale` aggregate root.
3. **Dual Serialization Format:** All sales responses serialize monetary amounts in two complementary formats:
   - **Structured Money:** `{ amount: number, currency: string, formatted: string, cents: number }`.
   - **Flat Summary Amounts:** `subtotalAmount: number`, `discountTotalAmount: number`, `totalAmount: number` (guaranteed non-negative, scaled to 2 decimal places).
4. **No Infrastructure Leakage:** Raw Prisma `Decimal` instances and database-specific types are intercepted and mapped to canonical DTOs before crossing the HTTP boundary.

---

## 3. Authoritative Endpoint Contracts

### 3.1 Endpoint 1: Create Commercial Sale Session

```http
POST /api/v1/sales
```

- **Purpose:** Initializes a new commercial checkout session in `DRAFT` status with exact zero monetary totals ($0.00 subtotal, discount, and total), version `1`, and locks the operating currency.
- **Permission Required:** `sales.create` (Roles: `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`).
- **Application Use Case:** `CreateSaleHandler` via `CreateSaleCommand`.
- **State Mutation:** **Yes** (Inserts new `sales` row and optional initial `sale_items` rows in PostgreSQL).
- **Aggregate Invariants Enforced:**
  - `SALE-01`: Tenant identity must be non-empty and bound at inception.
  - `SALE-02`: Cashier attribution captured from caller context (`currentUser.userId`).
  - `SALE-04`: New sale starts strictly in `DRAFT` status.
  - `SALE-06`: Single currency homogeneity; ISO-4217 code must be valid.
  - `SALE-10` / `SALE-020`: Clinical session single-active-billing invariant (partial unique index `unique_active_source_billing`).

#### Request Specification (`CreateSaleRequestDto`)

| Field             | Type     | Required | Constraints & Validation                                                                                         |
| :---------------- | :------- | :------: | :--------------------------------------------------------------------------------------------------------------- |
| `id`              | `string` |    No    | Optional client-generated UUID / transaction identifier.                                                         |
| `idempotencyKey`  | `string` |    No    | Client deduplication key (also accepted via `X-Idempotency-Key` header).                                         |
| `currency`        | `string` |    No    | 3-letter uppercase ISO-4217 code (regex: `/^[A-Z]{3}$/`). Defaults to `'USD'`.                                   |
| `clientId`        | `string` |    No    | Customer ID. If omitted, denotes anonymous retail walk-in. If provided, client must exist.                       |
| `sourceReference` | `object` |    No    | Commercial origin reference: `{ type, referenceId, referenceCode? }` or `{ sourceType, sourceId, sourceCode? }`. |
| `items`           | `array`  |    No    | Optional initial line items to attach upon creation.                                                             |
| `orderDiscount`   | `object` |    No    | Optional initial order discount `{ type: 'PERCENTAGE' \| 'FIXED', value: number, reason?: string }`.             |

#### Response Specification (`SaleResponseDto`)

- **Status Code:** `201 Created`
- **Body Schema:** Complete `SaleResponseDto` in `DRAFT` status with `subtotalAmount: 0.00`, `discountTotalAmount: 0.00`, `totalAmount: 0.00`, `version: 1`.

#### Multi-Tier Error Matrix

| HTTP Status | Error Code              | System Trigger                                                              |
| :---------: | :---------------------- | :-------------------------------------------------------------------------- |
|   **400**   | `BAD_REQUEST`           | Malformed ISO-4217 currency, empty whitespace ID, or invalid source type.   |
|   **401**   | `UNAUTHORIZED`          | Missing, expired, or invalid JWT access token.                              |
|   **403**   | `FORBIDDEN`             | Caller lacks `sales.create` permission or tenant isolation mismatch.        |
|   **404**   | `NOT_FOUND`             | Supplied `clientId` does not exist in Client Management domain.             |
|   **409**   | `CONFLICT`              | Duplicate sale for identical clinical session or idempotency key collision. |
|   **500**   | `INTERNAL_SERVER_ERROR` | Database connection or unhandled persistence failure (sanitized).           |

---

### 3.2 Endpoint 2: List Commercial Sales Ledger

```http
GET /api/v1/sales
```

- **Purpose:** Retrieves a paginated, filtered, and deterministically sorted collection of sales summary projections within the authenticated tenant boundary for cashier dashboards and financial audit.
- **Permission Required:** `sales.read` (Roles: `Owner`, `Manager`, `Receptionist`, `Trainer`, `Kitchen Staff`).
- **Application Use Case:** `ListSalesHandler` via `ListSalesQuery`.
- **State Mutation:** **No** (Zero writes, zero row locks, zero OCC version increments).
- **Aggregate Invariants Enforced:** Tenant boundary isolation (ADR-0135 §9); client role self-scoping (clients query only their own transactions).

#### Query Parameters Specification (`ListSalesQueryDto`)

| Parameter           | Type      |    Default    | Constraints & Semantic Rules                                                                                                      |
| :------------------ | :-------- | :-----------: | :-------------------------------------------------------------------------------------------------------------------------------- |
| `page`              | `integer` |      `1`      | 1-based page index. Clamped $\ge 1$.                                                                                              |
| `limit`             | `integer` |     `20`      | Items per page. Min: `1`, Max: `100`.                                                                                             |
| `q` / `search`      | `string`  |       —       | Free-text search matching `sourceCode` (case-insensitive substring) or exact `id`.                                                |
| `clientId`          | `string`  |       —       | Filters sales for specific customer. If caller has `Client` role, overridden to `currentUser.id`.                                 |
| `status`            | `string`  |       —       | Validated against `SaleStatus` enum (`DRAFT`, `PENDING_PAYMENT`, `PARTIALLY_PAID`, `PAID`, `COMPLETED`, `CANCELLED`, `REFUNDED`). |
| `sourceType`        | `string`  |       —       | Filters by origin category (`INVENTORY_ITEM`, `MEMBERSHIP_PLAN`, `TREATMENT_SESSION`, `CUSTOM_SERVICE`, `FOOD`, `DRINK`, etc.).   |
| `sourceReferenceId` | `string`  |       —       | Filters by external entity reference identifier.                                                                                  |
| `fromDate`          | `string`  |       —       | Start timestamp in ISO-8601 UTC. Evaluated as `createdAt >= fromDate`.                                                            |
| `toDate`            | `string`  |       —       | End timestamp in ISO-8601 UTC. Evaluated as `createdAt <= toDate`. Invariant: `fromDate <= toDate`.                               |
| `sort`              | `string`  |       —       | Compound frontend sort parameter: `<field>.<dir>` (e.g. `createdAt.desc`, `total.asc`, `status.desc`).                            |
| `sortField`         | `string`  | `'createdAt'` | Whitelisted sort fields: `'createdAt'`, `'total'`, `'status'`. Arbitrary fields rejected with 400.                                |
| `sortDirection`     | `string`  |   `'desc'`    | Allowed values: `'asc'`, `'desc'`.                                                                                                |

#### Sorting & Deterministic Tie-Breaking Rules

To guarantee strict pagination determinism and eliminate page drift during active checkout additions:

1. **Primary Sort:** Evaluated on the chosen `sortField` (`createdAt`, `totalAmount`, or `status`) in the specified direction.
2. **Secondary Tie-Breaker:** Fixed secondary sort on `id ASC` (`[{ [sortField]: direction }, { id: 'asc' }]`).
3. **Compound Parser:** If `sort` is supplied as `total.asc`, it takes precedence over `sortField`/`sortDirection`.

#### Out-of-Range Pagination Behavior

- If `page > totalPages` (and `total > 0`), the endpoint returns `200 OK` with `items: []`, preserving correct `total`, `page`, `limit`, `totalPages`, and `hasNextPage: false`.
- If `total === 0`, returns `items: []`, `totalPages: 0`, `hasNextPage: false`, `hasPreviousPage: false`.

#### Response Specification (`PaginatedSalesResponseDto`)

- **Status Code:** `200 OK`
- **Body Schema:**
  ```json
  {
    "items": [
      {
        "id": "sale_01j9876543210abcdef",
        "tenantId": "tenant_123",
        "clientId": "client_456",
        "currency": "USD",
        "status": "DRAFT",
        "source": {
          "type": "DRINK",
          "referenceId": "pos_terminal_1",
          "referenceCode": "REGISTER_1"
        },
        "subtotal": { "amount": 25.0, "currency": "USD", "formatted": "25.00", "cents": 2500 },
        "discountTotal": { "amount": 0.0, "currency": "USD", "formatted": "0.00", "cents": 0 },
        "total": { "amount": 25.0, "currency": "USD", "formatted": "25.00", "cents": 2500 },
        "subtotalAmount": 25.0,
        "discountTotalAmount": 0.0,
        "totalAmount": 25.0,
        "itemCount": 1,
        "createdAt": "2026-10-12T12:00:00.000Z",
        "updatedAt": "2026-10-12T12:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
  ```

#### Multi-Tier Error Matrix

| HTTP Status | Error Code               | System Trigger                                                            |
| :---------: | :----------------------- | :------------------------------------------------------------------------ |
|   **400**   | `INVALID_PAGINATION`     | `page` or `limit` is negative, zero, non-integer, or limit exceeds `100`. |
|   **400**   | `INVALID_SORT_FIELD`     | `sortField` is not in allowed whitelist (`createdAt`, `total`, `status`). |
|   **400**   | `INVALID_SORT_DIRECTION` | `sortDirection` is not `'asc'` or `'desc'`.                               |
|   **400**   | `INVALID_FILTER`         | Malformed date strings, or `fromDate > toDate`, or unknown status string. |
|   **401**   | `UNAUTHORIZED`           | Missing or invalid JWT token.                                             |
|   **403**   | `FORBIDDEN`              | Missing `sales.read` permission.                                          |

---

### 3.3 Endpoint 3: Get Commercial Sale Details

```http
GET /api/v1/sales/:id
```

- **Purpose:** Retrieves the complete authoritative commercial state of a sale order by ID, including all child line items, applied discounts, and exact monetary breakdowns.
- **Permission Required:** `sales.read` (Roles: `Owner`, `Manager`, `Receptionist`, `Trainer`, `Kitchen Staff`).
- **Application Use Case:** `GetSaleByIdHandler` via `GetSaleByIdQuery`.
- **State Mutation:** **No** (Side-effect free read projection).
- **Aggregate Invariants Enforced:** Multi-tenant boundary isolation (ADR-0135 §9: cross-tenant access returns 404).

#### Request Specification

- **Path Parameter:** `id` (`string`, required) — Unique Sale domain identifier.

#### Response Specification (`SaleResponseDto`)

- **Status Code:** `200 OK`
- **Body Schema:** Complete `SaleResponseDto` containing child `items: SaleItemResponseDto[]`, `sourceReference`, monetary totals, and lifecycle timestamps.

#### Multi-Tier Error Matrix

| HTTP Status | Error Code     | System Trigger                                        |
| :---------: | :------------- | :---------------------------------------------------- |
|   **401**   | `UNAUTHORIZED` | Missing or invalid JWT token.                         |
|   **403**   | `FORBIDDEN`    | Missing `sales.read` permission.                      |
|   **404**   | `NOT_FOUND`    | Sale does not exist or belongs to a different tenant. |

---

### 3.4 Endpoint 4: Add Line Item to Draft Sale

```http
POST /api/v1/sales/:id/items
```

- **Purpose:** Appends a snapshot catalog line item to an active `DRAFT` checkout session, snapshots the price and description, and recalculates totals deterministically.
- **Permission Required:** `sales.create` (Roles: `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`).
- **Application Use Case:** `AddSaleItemHandler` via `AddSaleItemCommand`.
- **State Mutation:** **Yes** (Inserts row into `sale_items`, updates `sales` totals, increments `version + 1`).
- **Aggregate Invariants Enforced:**
  - `SALE-08` / `ITEM-09`: Permitted strictly in `DRAFT` status (`assertDraftState()`). Departed draft throws `SaleAlreadyFinalizedException`.
  - `ITEM-02`: Quantity must be strictly positive: $0.001 \le \text{quantity} \le 999,999$ (up to 3 decimal places).
  - `ITEM-03`: Unit price snapshot must be non-negative: $\text{unitPrice} \ge 0.00$.
  - `SALE-06`: Item currency must match parent sale currency.
  - `ITEM-07`: Item discount cannot exceed line subtotal ($\text{discount} \le \text{quantity} \times \text{unitPrice}$).
  - OCC Concurrency: Update guarded by expected `version`.

#### Request Specification (`AddSaleItemRequestDto`)

| Field             | Type     | Required | Constraints & Validation                                                                              |
| :---------------- | :------- | :------: | :---------------------------------------------------------------------------------------------------- |
| `description`     | `string` |   Yes    | Non-empty human-readable product/service title.                                                       |
| `quantity`        | `number` |   Yes    | Min: `0.001`, Max: `999999`. Non-zero positive number.                                                |
| `unitPriceAmount` | `number` |   Yes    | Agreed gross unit price in major currency units. Min: `0.00`.                                         |
| `skuOrCode`       | `string` |    No    | Optional catalog SKU or service code snapshot.                                                        |
| `sourceReference` | `object` |    No    | Line item commercial origin: `{ type, referenceId, referenceCode? }`. Defaults to parent sale source. |
| `discount`        | `object` |    No    | Optional item discount: `{ type: 'PERCENTAGE' \| 'FIXED', value: number, reason?: string }`.          |

#### Response Specification (`SaleResponseDto`)

- **Status Code:** `200 OK`
- **Body Schema:** Updated `SaleResponseDto` reflecting new line item and deterministically recalculated order totals.

#### Multi-Tier Error Matrix

| HTTP Status | Error Code     | System Trigger                                                                            |
| :---------: | :------------- | :---------------------------------------------------------------------------------------- |
|   **400**   | `BAD_REQUEST`  | Negative unit price, quantity $\le 0$, or discount exceeding item subtotal.               |
|   **401**   | `UNAUTHORIZED` | Missing or invalid JWT token.                                                             |
|   **403**   | `FORBIDDEN`    | Missing `sales.create` permission.                                                        |
|   **404**   | `NOT_FOUND`    | Target sale ID does not exist in tenant.                                                  |
|   **409**   | `CONFLICT`     | Optimistic lock failure (`SaleOptimisticLockException`) or sale already departed `DRAFT`. |

---

### 3.5 Endpoint 5: Remove Line Item from Draft Sale

```http
DELETE /api/v1/sales/:id/items/:itemId
```

- **Purpose:** Removes an existing line item from a `DRAFT` checkout session, triggers authoritative financial recalculation, differentially deletes the child persistence row, and advances aggregate version.
- **Permission Required:** `sales.create` (Roles: `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`).
- **Application Use Case:** `RemoveSaleItemHandler` via `RemoveSaleItemCommand`.
- **State Mutation:** **Yes** (Deletes child row from `sale_items`, updates `sales` totals, increments `version + 1`).
- **Aggregate Invariants Enforced:**
  - `SALE-08`: Permitted strictly in `DRAFT` status (`assertDraftState()`).
  - Item existence: `itemId` must exist in parent `sale.items`.
  - Recalculates `subtotal`, `discountTotal`, and `total`.

#### Request Specification

- **Path Parameters:**
  - `id` (`string`, required) — Unique Sale ID.
  - `itemId` (`string`, required) — Unique line item ID to remove.

#### Response Specification (`SaleResponseDto`)

- **Status Code:** `200 OK`
- **Body Schema:** Updated `SaleResponseDto` reflecting item removal and revised totals.

#### Multi-Tier Error Matrix

| HTTP Status | Error Code     | System Trigger                                               |
| :---------: | :------------- | :----------------------------------------------------------- |
|   **400**   | `BAD_REQUEST`  | Item with `itemId` does not exist within the targeted sale.  |
|   **401**   | `UNAUTHORIZED` | Missing or invalid JWT token.                                |
|   **403**   | `FORBIDDEN`    | Missing `sales.create` permission.                           |
|   **404**   | `NOT_FOUND`    | Sale does not exist in tenant.                               |
|   **409**   | `CONFLICT`     | Optimistic lock failure or sale already finalized/cancelled. |

---

### 3.6 Endpoint 6: Apply Order-Level Discount

```http
POST /api/v1/sales/:id/discount
```

- **Purpose:** Applies an order-level discount (percentage or fixed nominal value) to a `DRAFT` checkout session, recomputes financial totals through integer arithmetic, and persists the agreement.
- **Permission Required:** `sales.create` (Roles: `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`).
- **Application Use Case:** `ApplyOrderDiscountHandler` via `ApplyOrderDiscountCommand`.
- **State Mutation:** **Yes** (Updates `order_discount_*` columns, recalculates totals, increments `version + 1`).
- **Aggregate Invariants Enforced:**
  - `SALE-08`: Permitted strictly in `DRAFT` status.
  - `ITEM-07` / `SALE-07`: Fixed discount cannot exceed gross subtotal ($\text{fixedDiscount} \le \text{subtotal}$). Percentage discount bounded: $0 \le \text{percentage} \le 100$.
  - Formula: $\text{total} = \max(0, \text{subtotal} - \text{discountTotal})$.

#### Request Specification (`ApplySaleDiscountRequestDto`)

| Field    | Type     | Required | Constraints & Validation                                                         |
| :------- | :------- | :------: | :------------------------------------------------------------------------------- |
| `type`   | `string` |   Yes    | Must be `'PERCENTAGE'` or `'FIXED'`. Case-insensitive.                           |
| `value`  | `number` |   Yes    | Non-negative numeric value. Scale: up to 2 decimal places. Percentage $\le 100$. |
| `reason` | `string` |    No    | Commercial justification notes (e.g. `'VIP Membership Promo'`).                  |

#### Response Specification (`SaleResponseDto`)

- **Status Code:** `200 OK`
- **Body Schema:** Updated `SaleResponseDto` with applied discount and updated `totalAmount`.

#### Multi-Tier Error Matrix

| HTTP Status | Error Code         | System Trigger                                                               |
| :---------: | :----------------- | :--------------------------------------------------------------------------- |
|   **400**   | `INVALID_DISCOUNT` | Negative value, percentage $> 100\%$, or fixed reduction exceeding subtotal. |
|   **401**   | `UNAUTHORIZED`     | Missing or invalid JWT token.                                                |
|   **403**   | `FORBIDDEN`        | Missing `sales.create` permission.                                           |
|   **404**   | `NOT_FOUND`        | Sale does not exist in tenant.                                               |
|   **409**   | `CONFLICT`         | Sale already finalized/cancelled or OCC collision.                           |

---

### 3.7 Endpoint 7: Cancel Commercial Sale

```http
POST /api/v1/sales/:id/cancel
```

- **Purpose:** Cancels an active commercial agreement in `DRAFT`, `PENDING_PAYMENT`, or `PARTIALLY_PAID` status, records an audit justification reason, permanently transitions the sale to terminal `CANCELLED` status, locks all terms, and releases single-active-billing locks.
- **Permission Required:** `sales.cancel` (Roles: `Owner`, `Manager`, `Receptionist`). Strictly denied to `Kitchen Staff` and `Trainer`.
- **Application Use Case:** `CancelSaleHandler` via `CancelSaleCommand`.
- **State Mutation:** **Yes** (Sets `status = 'CANCELLED'`, `cancellation_reason`, `cancelled_at`, increments `version + 1`).
- **Aggregate Invariants Enforced:**
  - `SALE-09`: Cancellation permitted only from `DRAFT`, `PENDING_PAYMENT`, or `PARTIALLY_PAID`.
  - Terminality: Once in `PAID`, `COMPLETED`, `REFUNDED`, or `CANCELLED`, cancellation is prohibited (`InvalidSaleTransitionException`).
  - Mandatory audit reason: `reason` must be a non-empty, non-whitespace string.

#### Request Specification (`CancelSaleRequestDto`)

| Field    | Type     | Required | Constraints & Validation                                                    |
| :------- | :------- | :------: | :-------------------------------------------------------------------------- |
| `reason` | `string` |   Yes    | Non-empty audit justification string explaining why the sale was cancelled. |

#### Response Specification (`SaleResponseDto`)

- **Status Code:** `200 OK`
- **Body Schema:** Terminal `SaleResponseDto` with `status: 'CANCELLED'`, `cancellationReason`, and `cancelledAt` timestamp.

#### Multi-Tier Error Matrix

| HTTP Status | Error Code                | System Trigger                                                                  |
| :---------: | :------------------------ | :------------------------------------------------------------------------------ |
|   **400**   | `BAD_REQUEST`             | Cancellation reason is missing, empty, or whitespace-only.                      |
|   **401**   | `UNAUTHORIZED`            | Missing or invalid JWT token.                                                   |
|   **403**   | `FORBIDDEN`               | Missing `sales.cancel` permission (e.g. Kitchen Staff attempting cancellation). |
|   **404**   | `NOT_FOUND`               | Sale does not exist in tenant.                                                  |
|   **409**   | `CONFLICT`                | Optimistic lock collision.                                                      |
|   **422**   | `INVALID_SALE_TRANSITION` | Sale is already `PAID`, `COMPLETED`, or previously `CANCELLED`.                 |

---

## 4. Complementary Existing Endpoints (Preserved in Contract)

To maintain 100% platform integrity and prevent breaking existing checkout flows, the following four existing endpoints remain active in `SalesController`:

| HTTP Method | Route                                  |             Permission             | Purpose & Role                                                                                                                        |
| :---------- | :------------------------------------- | :--------------------------------: | :------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`       | `/api/v1/sales/:id/calculate`          |            `sales.read`            | Side-effect free authoritative totals inquiry (13 canonical formulas in integer cents; zero DB writes or locks).                      |
| `POST`      | `/api/v1/sales/:id/source`             |           `sales.create`           | Explicit commercial origin assignment (`AssignSaleSourceHandler`). Permitted only in `DRAFT`.                                         |
| `POST`      | `/api/v1/sales/:id/finalize`           |           `sales.create`           | Finalizes commercial agreement from `DRAFT` to `PENDING_PAYMENT`. Enforces `SALE-05` (empty sale forbidden). Locks terms permanently. |
| `POST`      | `/api/v1/sales/:id/coordinate-payment` | `sales.create` + `payments.manage` | Coordinates verified settlement from `Payment` aggregate against the `Sale` balance.                                                  |

---

## 5. Security & Multi-Tenant Access Matrix

Following Milestone 7.13 governance ([ADR-0135](0135-sales-payments-receipts-authorization-and-security.md)):

```
┌─────────────────────────┬──────────────┬───────┬─────────┬──────────────┬───────────────┬─────────┬────────┐
│ ENDPOINT                │ PERMISSION   │ OWNER │ MANAGER │ RECEPTIONIST │ KITCHEN STAFF │ TRAINER │ CLIENT │
├─────────────────────────┼──────────────┼───────┼─────────┼──────────────┼───────────────┼─────────┼────────┤
│ POST /sales             │ sales.create │   ✓   │    ✓    │      ✓       │       ✓       │    ✗    │   ✗    │
│ GET /sales              │ sales.read   │   ✓   │    ✓    │      ✓       │       ✓       │    ✓    │ Scoped │
│ GET /sales/:id          │ sales.read   │   ✓   │    ✓    │      ✓       │       ✓       │    ✓    │ Scoped │
│ POST /sales/:id/items   │ sales.create │   ✓   │    ✓    │      ✓       │       ✓       │    ✗    │   ✗    │
│ DELETE /sales/:id/items │ sales.create │   ✓   │    ✓    │      ✓       │       ✓       │    ✗    │   ✗    │
│ POST /sales/:id/discount│ sales.create │   ✓   │    ✓    │      ✓       │       ✓       │    ✗    │   ✗    │
│ POST /sales/:id/cancel  │ sales.cancel │   ✓   │    ✓    │      ✓       │       ✗       │    ✗    │   ✗    │
└─────────────────────────┴──────────────┴───────┴─────────┴──────────────┴───────────────┴─────────┴────────┘
```

- **Segregation of Duties:** `Kitchen Staff` possesses `sales.create` to ring up café consumables, but is **strictly denied** `sales.cancel` (returns 403 Forbidden).
- **Client Scoping:** When an identity with role `Client` or `Member` queries `GET /sales` or `GET /sales/:id`, the query is automatically clamped to `clientId = currentUser.id`. Foreign sales return `404 Not Found`.

---

## 6. Implementation Traceability & Next Steps

1. **Reconciliation with Milestone 7.14 Code Tasks:**
   - Define dedicated `ListSalesQueryDto` and `PaginatedSalesResponseDto` in `apps/api/src/sales/dto`.
   - Implement `search` parameter in `PrismaSaleRepository.findMany`.
   - Update `SalesController.listSales` to consume `ListSalesQueryDto`.
2. **Quality Gates Required for Final Acceptance:**
   - 100% pass on authorization unit and integration tests.
   - 100% pass on monetary precision serialization tests.
   - Real execution of `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm validate`.
