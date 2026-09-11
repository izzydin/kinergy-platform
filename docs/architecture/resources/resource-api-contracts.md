# Resources API Contracts & Validation Architecture Specification

**Status**: Approved & Active  
**Milestone**: Phase 6.9 — Backend API Layer  
**Domain**: Resources Management (Consumable Inventory & Fixed Assets)  
**Author**: Principal Backend Engineer & API Boundary Reviewer  
**Governing Documents**:

- [**ADR-0099: Explicit Sub-Resource State Mutation Endpoints vs. Generic PATCH**](./adr/0099-explicit-subresource-state-mutation-endpoints-vs-generic-patch.md)
- [**Backend API Architecture Baseline**](./backend-api-baseline.md)
- [**Consumable Inventory API Contracts**](./inventory-api-contracts.md)
- [**Fixed Asset API Contracts**](./fixed-asset-api-contracts.md)

---

## 1. Request DTO Strategy

The Kinergy platform enforces a strict boundary between untrusted HTTP transport payloads and internal domain objects:

```
[Untrusted HTTP Payload]
          │
          ▼
[InputSanitizer] ─────────► (Trims whitespace, strips control chars, neutralizes XSS)
          │
          ▼
[GlobalSanitizationValidationPipe] ──► (class-validator + class-transformer whitelist)
          │
          ▼
[Normalized Request DTO]
          │
          ▼
[Controller] ─────────────► [CQRS Command / Query] ──► [Application Domain Layer]
```

### 1.1 Explicit Action DTOs vs. Generic PATCH Metadata DTOs

In accordance with [**ADR-0099**](./adr/0099-explicit-subresource-state-mutation-endpoints-vs-generic-patch.md):

- **Generic Update DTOs** (`UpdateInventoryItemRequestDto`, `UpdateFixedAssetDetailsRequestDto`) are strictly restricted to descriptive and commercial metadata (`name`, `description`, `notes`, `sellingPrice`, `reorderThreshold`).
- **State and Physical Quantities are Immutable in Generic Update**:
  - Inventory `quantityOnHand` **cannot** be passed to `UpdateInventoryItemRequestDto`.
  - Fixed asset `status`, `condition`, `location`, and `estimatedValue` **cannot** be passed to `UpdateFixedAssetDetailsRequestDto`.
  - The `forbidNonWhitelisted: true` pipe configuration automatically rejects any attempt to inject state fields into generic PATCH routes with HTTP `400 Bad Request`.
- **Dedicated Sub-Resource Action DTOs**:
  - Inventory: `ReceiveStockRequestDto`, `SellStockRequestDto`, `ConsumeStockRequestDto`, `ScrapStockRequestDto`, `AdjustStockRequestDto`.
  - Fixed Assets: `TransferFixedAssetLocationRequestDto`, `ChangeFixedAssetStatusRequestDto`, `UpdateFixedAssetConditionRequestDto`, `RecordAssetMaintenanceRequestDto`, `UpdateFixedAssetValuationRequestDto`.

---

## 2. Response DTO Strategy

To eliminate security risks and protect domain encapsulation:

1. **Zero Database Model Leakage**:
   - Prisma ORM models, table column names, and raw database tuples are strictly confined to the persistence repository layer.
   - Controllers only emit strongly-typed Response DTOs.
2. **Zero Decimal Internal Object Leakage**:
   - Domain `Decimal` value objects are converted to standard IEEE-754 numbers in response DTOs (`unitCost`, `sellingPrice`, `purchaseValueAmount`, `currentEstimatedValueAmount`, `totalValueAmount`).
3. **Audit & Tenant Isolation**:
   - Internal technical audit columns and multi-tenant partition IDs are omitted from public DTOs unless explicitly authorized.

---

## 3. Validation Architecture

Kinergy uses a unified, enterprise-grade validation stack built on NestJS `ValidationPipe`, `class-validator`, `class-transformer`, and the platform `InputSanitizer`:

### Global Validation Pipe Configuration (`GlobalSanitizationValidationPipe`):

- **Whitelist Enforcement (`whitelist: true`)**: Strips non-decorated properties.
- **Strict Property Forbiddance (`forbidNonWhitelisted: true`)**: Throws `BadRequestException` if any unexpected property is present in the request body.
- **Implicit Type Conversion (`transform: true`, `enableImplicitConversion: true`)**: Automatically casts string numbers in query parameters (`page=2`, `limit=50`) into TypeScript `number` primitives.
- **Payload Pre-Sanitization (`InputSanitizer.sanitize(value)`)**:
  - Trims leading/trailing whitespace across all string fields.
  - Strips null byte and ASCII control characters (`\u0000`).
  - Neutralizes embedded HTML/XSS `<script>` injection vectors before validation execution.

---

## 4. Query Normalization & Filter Conventions

All list and query endpoints follow standardized query DTO conventions:

| Query Parameter | Type     | Validation Decorators                      | Default Value      | Description                                                    |
| :-------------- | :------- | :----------------------------------------- | :----------------- | :------------------------------------------------------------- |
| `search`        | `string` | `@IsOptional()`, `@IsString()`             | `undefined`        | Fuzzy keyword matching across name, SKU, tag, and description. |
| `category`      | `enum`   | `@IsOptional()`, `@IsEnum(CategoryEnum)`   | `undefined`        | Bounded category enum filter.                                  |
| `status`        | `enum`   | `@IsOptional()`, `@IsEnum(StatusEnum)`     | `undefined`        | Lifecycle state filter.                                        |
| `condition`     | `enum`   | `@IsOptional()`, `@IsEnum(AssetCondition)` | `undefined`        | Physical condition rating filter.                              |
| `facilityId`    | `string` | `@IsOptional()`, `@IsString()`             | `undefined`        | Physical facility partition filter.                            |
| `roomId`        | `string` | `@IsOptional()`, `@IsString()`             | `undefined`        | Specific room partition filter.                                |
| `page`          | `number` | `@IsOptional()`, `@IsInt()`, `@Min(1)`     | `1`                | 1-indexed page number.                                         |
| `limit`         | `number` | `@IsOptional()`, `@IsInt()`, `@Min(1)`     | `20`               | Page size limit (maximum 100).                                 |
| `sortBy`        | `string` | `@IsOptional()`, `@IsString()`             | Contextual         | Whitelisted sort column.                                       |
| `sortOrder`     | `string` | `@IsOptional()`, `@IsString()`             | `'asc'` / `'desc'` | Sort direction.                                                |

---

## 5. Money & Numeric Decimal Representation

In accordance with Phase 6 financial and valuation rules:

1. **Request Payloads**:
   - Clients supply monetary amounts as standard positive decimals (e.g., `25.50`, `45000.00`).
   - Structural validation enforces `@IsNumber()` and `@Min(0)` to prevent negative prices.
2. **Domain Conversion**:
   - When command handlers process monetary amounts, they instantiate immutable `Money` or `Decimal` value objects to ensure precision arithmetic and avoid IEEE-754 floating-point inaccuracies.
3. **Response Payloads**:
   - Monetary values are formatted as standard decimal numbers in response DTOs with corresponding currency codes (`purchaseValueAmount`, `purchaseValueCurrency`).

---

## 6. Standardized Pagination Response Envelope

All paginated collection queries return a deterministic envelope conforming to the platform standard:

```typescript
export class PaginatedResponseDto<T> {
  @ApiProperty()
  items: T[];

  @ApiProperty({ description: 'Total count of records matching criteria', example: 42 })
  total: number;

  @ApiProperty({ description: 'Current 1-indexed page number', example: 1 })
  page: number;

  @ApiProperty({ description: 'Page size limit applied', example: 20 })
  limit: number;

  @ApiProperty({ description: 'Total number of pages available', example: 3 })
  totalPages: number;

  @ApiProperty({ description: 'Whether a subsequent page exists', example: true })
  hasNextPage: boolean;

  @ApiProperty({ description: 'Whether a preceding page exists', example: false })
  hasPreviousPage: boolean;
}
```

---

## 7. HTTP Method Semantics: PATCH vs. PUT

Kinergy adheres to consistent RESTful HTTP verb semantics across all bounded contexts:

- **`PATCH /api/v1/resources/.../:id`**: Used exclusively for **partial updates** to descriptive metadata. Omitting a field retains its existing value.
- **`POST /api/v1/resources/.../:id/<action>`**: Used for **explicit domain state transitions and operations** (`receive`, `sell`, `consume`, `scrap`, `adjust`, `transfer`, `status`, `condition`, `maintenance`, `valuation`).
- **`PUT` is NOT used** for arbitrary entity replacement to prevent accidental erasure of optimistic locking versions, audit trails, and domain invariants.

---

## 8. Validation vs. Domain Invariant Boundaries

| Layer                                          | Responsibility                                                                                                                          | Examples                                                                                                                           | HTTP Status on Failure                               |
| :--------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------- |
| **DTO Pipe (Boundary Validation)**             | Syntactic correctness, required fields, string lengths, enum membership, numeric boundaries, non-negative inputs, XSS sanitization.     | `sku` is missing; `unitCost` is negative; `category` is invalid; unknown field injected.                                           | `400 Bad Request`                                    |
| **Application & Domain (Business Invariants)** | Semantic correctness, state machine rules, balance sufficiency, optimistic concurrency control (OCC), uniqueness, relational existence. | Stock cannot become negative (`[INV-INV-2]`); Cannot transfer sold asset (`[AST-INV-2]`); SKU duplicate collision (`[INV-INV-1]`). | `400 Bad Request` / `404 Not Found` / `409 Conflict` |

---

## 9. Verification & Automated Test Evidence

The validation architecture and DTO boundary behavior are verified by automated tests in [`apps/api/src/resources/__tests__/resources-validation.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/resources/__tests__/resources-validation.spec.ts):

- **32/32 tests passing** covering required fields, enum validation, numeric transformations, pagination boundaries, forbidden field rejections, XSS sanitization, and date formatting.

---

## 10. Cross-Domain API Contracts & Integration Boundaries (Milestone 6.16)

Following the Milestone 6.16 cross-domain architecture decisions, the following contract boundaries are formally established across Resource, Client, Scheduling, and Commercial APIs:

### 10.1 Client References: Minimal Scalar Identifiers

- When a resource operation or log references a client (e.g., equipment assignment or sale/order attribution), the API transport contracts accept and emit **strictly scalar domain identifiers** (`clientId: string`).
- **No Embedded Client Aggregates**: APIs never embed full Client profiles (such as medical histories, demographics, or billing addresses) inside Resource responses. Clients are retrieved independently via `/api/v1/clients/{id}` by the presentation layer or API gateway.

### 10.2 Scheduling References: Minimal Location Footprints

- When a Fixed Asset references a physical room or facility, `AssetLocationDto` exposes only the contextual coordinates required for operational tracking:
  ```typescript
  export class AssetLocationDto {
    facilityId!: string;
    roomId?: string;
    zone?: string;
    description?: string;
  }
  ```
- **No Embedded Scheduling Aggregates**: Fixed Asset responses never embed full Scheduling `Room` aggregates, appointment rosters, therapist calendars, or booking rules.

### 10.3 Inventory ↔ Sales Boundary: In-Process Application Port vs. HTTP Overhead

- Sales and Inventory reside within the same modular backend deployment.
- **No Self-Looping HTTP Calls**: In accordance with Kinergy modular monolith principles, a future Sales module or third-party order consumer must **NOT** make localhost HTTP requests (`POST /api/v1/resources/inventory/:id/sell`) to mutate stock.
- Instead, internal backend modules invoke the in-process capability port:
  `InventoryStockDecrementPort.sellStock(params: DecrementStockParams)`.
- The HTTP endpoint `POST /api/v1/resources/inventory/:id/sell` is strictly reserved for authenticated frontend staff manually recording point-of-sale transactions at a reception or front desk.

### 10.4 IAM Authorization Consistency

- All Resource endpoints enforce server-side authentication (`AuthenticationGuard`) and role/permission authorization (`AuthorizationGuard`).
- Resource endpoints use unified Phase 1 IAM permissions:
  - Inventory read: `inventory.read`
  - Inventory write: `inventory.write`
  - Fixed Asset read: `assets.read`
  - Fixed Asset write: `assets.write`
  - Valuation read: Dual composition requiring `inventory.read` / `assets.read` AND `billing.read`.
