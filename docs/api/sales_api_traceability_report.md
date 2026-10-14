# Sales API Implementation Traceability Report (Milestone 7.14)

- **Date**: 2026-10-14
- **Auditor**: Senior API Documentation Engineer
- **Status**: Complete & Verified
- **Target Module**: `apps/api/src/sales`
- **Validation Test Suite**: `apps/api/src/sales/__tests__/sales-openapi-contract.spec.ts`

---

## 1. Executive Summary

This report establishes comprehensive end-to-end traceability between the approved Milestone 7.14 Sales API specification, OpenAPI / Swagger metadata annotations, DTO contracts, authentication & authorization gates, and the actual NestJS controller and application service implementations.

Every documented route, parameter, DTO, error code, and security constraint is verified against the codebase. Zero non-existent endpoints, phantom fields, or unmapped domain models are documented.

---

## 2. Route-by-Route Traceability Matrix

| #   | Route & Method                              | Controller Method   | Guards & Permissions                                                                                                                                         | Request DTO                         | Response DTO                | Application Handler            | OpenAPI Tag | Status Codes                             |
| :-- | :------------------------------------------ | :------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------- | :-------------------------- | :----------------------------- | :---------- | :--------------------------------------- |
| 1   | `POST /api/v1/sales`                        | `createSale`        | `AuthenticationGuard`<br/>`AuthorizationGuard`<br/>`@Permissions('sales.create')`<br/>`@Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')`          | `CreateSaleRequestDto`              | `SaleResponseDto`           | `CreateSaleHandler`            | `Sales`     | `201`, `400`, `401`, `403`, `409`        |
| 2   | `GET /api/v1/sales`                         | `listSales`         | `AuthenticationGuard`<br/>`AuthorizationGuard`<br/>`@Permissions('sales.read')`<br/>`@Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff', 'Trainer')` | `ListSalesQueryDto`                 | `PaginatedSalesResponseDto` | `ListSalesHandler`             | `Sales`     | `200`, `400`, `401`, `403`               |
| 3   | `GET /api/v1/sales/:id`                     | `getSale`           | `AuthenticationGuard`<br/>`AuthorizationGuard`<br/>`@Permissions('sales.read')`<br/>`@Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff', 'Trainer')` | None (Path: `id`)                   | `SaleResponseDto`           | `GetSaleByIdHandler`           | `Sales`     | `200`, `401`, `403`, `404`               |
| 4   | `GET /api/v1/sales/:id/calculate`           | `calculateSale`     | `AuthenticationGuard`<br/>`AuthorizationGuard`<br/>`@Permissions('sales.read')`<br/>`@Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff', 'Trainer')` | None (Path: `id`)                   | `SaleTotalsResponseDto`     | `CalculateSaleHandler`         | `Sales`     | `200`, `401`, `403`, `404`               |
| 5   | `POST /api/v1/sales/:id/source`             | `assignSource`      | `AuthenticationGuard`<br/>`AuthorizationGuard`<br/>`@Permissions('sales.create')`<br/>`@Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')`          | `AssignSaleSourceRequestDto`        | `SaleResponseDto`           | `AssignSaleSourceHandler`      | `Sales`     | `200`, `400`, `401`, `403`, `404`, `409` |
| 6   | `POST /api/v1/sales/:id/items`              | `addItem`           | `AuthenticationGuard`<br/>`AuthorizationGuard`<br/>`@Permissions('sales.create')`<br/>`@Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')`          | `AddSaleItemRequestDto`             | `SaleResponseDto`           | `AddSaleItemHandler`           | `Sales`     | `200`, `400`, `401`, `403`, `404`, `409` |
| 7   | `DELETE /api/v1/sales/:id/items/:itemId`    | `removeItem`        | `AuthenticationGuard`<br/>`AuthorizationGuard`<br/>`@Permissions('sales.create')`<br/>`@Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')`          | None (Path: `id`, `itemId`)         | `SaleResponseDto`           | `RemoveSaleItemHandler`        | `Sales`     | `200`, `400`, `401`, `403`, `404`, `409` |
| 8   | `POST /api/v1/sales/:id/discount`           | `applyDiscount`     | `AuthenticationGuard`<br/>`AuthorizationGuard`<br/>`@Permissions('sales.create')`<br/>`@Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')`          | `ApplySaleDiscountRequestDto`       | `SaleResponseDto`           | `ApplyOrderDiscountHandler`    | `Sales`     | `200`, `400`, `401`, `403`, `404`, `409` |
| 9   | `DELETE /api/v1/sales/:id/discount`         | `removeDiscount`    | `AuthenticationGuard`<br/>`AuthorizationGuard`<br/>`@Permissions('sales.create')`<br/>`@Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')`          | None (Path: `id`)                   | `SaleResponseDto`           | `RemoveOrderDiscountHandler`   | `Sales`     | `200`, `401`, `403`, `404`, `409`        |
| 10  | `POST /api/v1/sales/:id/finalize`           | `finalizeSale`      | `AuthenticationGuard`<br/>`AuthorizationGuard`<br/>`@Permissions('sales.create')`<br/>`@Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')`          | `FinalizeSaleRequestDto` (Optional) | `SaleResponseDto`           | `FinalizeSaleHandler`          | `Sales`     | `200`, `400`, `401`, `403`, `404`, `422` |
| 11  | `POST /api/v1/sales/:id/cancel`             | `cancelSale`        | `AuthenticationGuard`<br/>`AuthorizationGuard`<br/>`@Permissions('sales.cancel')`<br/>`@Roles('Owner', 'Manager', 'Receptionist')`                           | `CancelSaleRequestDto`              | `SaleResponseDto`           | `CancelSaleHandler`            | `Sales`     | `200`, `400`, `401`, `403`, `404`, `422` |
| 12  | `POST /api/v1/sales/:id/coordinate-payment` | `coordinatePayment` | `AuthenticationGuard`<br/>`AuthorizationGuard`<br/>`@Permissions('sales.create', 'payments.manage')`<br/>`@Roles('Owner', 'Manager', 'Receptionist')`        | `CoordinateSalePaymentRequestDto`   | `SaleResponseDto`           | `CoordinateSalePaymentHandler` | `Sales`     | `200`, `400`, `401`, `403`, `404`, `422` |

---

## 3. Query Parameter Verification (`GET /api/v1/sales`)

| Query Parameter     | Field in `ListSalesQueryDto` | `@ApiQuery` Annotations | Validation Invariants & Transformation Rules                                     |
| :------------------ | :--------------------------- | :---------------------- | :------------------------------------------------------------------------------- |
| `page`              | `page?: number`              | Yes                     | `@IsInt()`, `@Min(1)`, `@Type(() => Number)`, Default: `1`                       |
| `limit`             | `limit?: number`             | Yes                     | `@IsInt()`, `@Min(1)`, `@Max(100)`, `@Type(() => Number)`, Default: `20`         |
| `cursor`            | `cursor?: string`            | Yes                     | `@IsString()`, `@MaxLength(255)`, Non-empty string                               |
| `q`                 | `q?: string`                 | Yes                     | `@IsString()`, `@MaxLength(255)`, Substring search                               |
| `search`            | `search?: string`            | Yes                     | `@IsString()`, `@MaxLength(255)`, Alias for `q`                                  |
| `clientId`          | `clientId?: string`          | Yes                     | `@IsString()`, `@MaxLength(255)`, Customer ID filter                             |
| `status`            | `status?: string`            | Yes                     | Validated against `SaleStatus` enum values                                       |
| `sourceType`        | `sourceType?: string`        | Yes                     | Validated against `SaleSourceType` / `SourceType`                                |
| `sourceReferenceId` | `sourceReferenceId?: string` | Yes                     | `@IsString()`, `@MaxLength(255)`                                                 |
| `fromDate`          | `fromDate?: string`          | Yes                     | `@IsISO8601()`, `@MaxLength(50)`, Must be $\le \text{toDate}$                    |
| `dateFrom`          | `dateFrom?: string`          | Yes                     | `@IsISO8601()`, `@MaxLength(50)`, Alias for `fromDate`                           |
| `toDate`            | `toDate?: string`            | Yes                     | `@IsISO8601()`, `@MaxLength(50)`, Must be $\ge \text{fromDate}$                  |
| `dateTo`            | `dateTo?: string`            | Yes                     | `@IsISO8601()`, `@MaxLength(50)`, Alias for `toDate`                             |
| `sort`              | `sort?: string`              | Yes                     | Compound format `<field>.<dir>` (e.g. `createdAt.desc`, `total.asc`)             |
| `sortField`         | `sortField?: string`         | Yes                     | `@IsIn(['createdAt', 'total', 'totalAmount', 'status'])`, Default: `'createdAt'` |
| `sortDirection`     | `sortDirection?: string`     | Yes                     | `@IsIn(['asc', 'desc'])`, Default: `'desc'`                                      |

---

## 4. DTO Schema Encapsulation & Domain Boundary Audit

| DTO Name                          | Purpose                    | Writable Fields                                                                             | Calculated / Protected Fields                                                                                                                                                                                                  | Domain / ORM Leak Check                                      |
| :-------------------------------- | :------------------------- | :------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------- |
| `CreateSaleRequestDto`            | Checkout session init      | `id`, `idempotencyKey`, `currency`, `clientId`, `sourceReference`, `items`, `orderDiscount` | `status`, `subtotal`, `total`, `discountTotal` (Forbidden)                                                                                                                                                                     | **PASS**: Zero domain/ORM types exposed                      |
| `AddSaleItemRequestDto`           | Item addition              | `description`, `quantity`, `unitPriceAmount`, `skuOrCode`, `sourceReference`, `discount`    | Calculated line totals (Forbidden)                                                                                                                                                                                             | **PASS**: Uses primitive numbers and nested DTOs             |
| `ApplySaleDiscountRequestDto`     | Discount application       | `type`, `value`, `reason`                                                                   | Subtotals, recalculated totals (Forbidden)                                                                                                                                                                                     | **PASS**: Pure input DTO                                     |
| `CancelSaleRequestDto`            | Cancellation reason        | `reason` (Mandatory, max 255)                                                               | Status, timestamp overrides (Forbidden)                                                                                                                                                                                        | **PASS**: Requires explicit justification                    |
| `CoordinateSalePaymentRequestDto` | Payment coordination       | `paymentId`                                                                                 | Balances, amounts (Forbidden)                                                                                                                                                                                                  | **PASS**: Pure correlation ID                                |
| `SaleResponseDto`                 | Aggregate read view        | None (Read-only)                                                                            | `id`, `tenantId`, `clientId`, `currency`, `status`, `sourceReference`, `subtotal`, `discountTotal`, `total`, `subtotalAmount`, `discountTotalAmount`, `totalAmount`, `itemCount`, `items`, `version`, `createdAt`, `updatedAt` | **PASS**: Fully encapsulated, structured `MoneyResponseDto`  |
| `SaleTotalsResponseDto`           | Dynamic totals calculation | None (Read-only)                                                                            | `saleId`, `currency`, `subtotal`, `discountTotal`, `total`, `subtotalAmount`, `discountTotalAmount`, `totalAmount`, `itemCount`, `orderDiscount`                                                                               | **PASS**: Completely decouples from internal `SaleTotalsDTO` |
| `PaginatedSalesResponseDto`       | Collection read view       | None (Read-only)                                                                            | `items: SaleSummaryResponseDto[]`, `total`, `page`, `limit`, `totalPages`                                                                                                                                                      | **PASS**: Standard pagination envelope                       |

---

## 5. Security & Authorization Traceability

1. **Authentication**: All 12 routes use `@UseGuards(AuthenticationGuard, AuthorizationGuard)` at the controller level.
2. **Permission Boundary**:
   - `sales.read`: Required for `GET /api/v1/sales`, `GET /api/v1/sales/:id`, `GET /api/v1/sales/:id/calculate`.
   - `sales.create`: Required for checkout initialization and `DRAFT` mutations (`POST /sales`, `POST /sales/:id/items`, `DELETE /sales/:id/items/:itemId`, `POST /sales/:id/discount`, `DELETE /sales/:id/discount`, `POST /sales/:id/source`, `POST /sales/:id/finalize`).
   - `sales.cancel`: Dedicated high-privilege permission required for `POST /sales/:id/cancel`.
   - `payments.manage` + `sales.create`: Co-required for `POST /sales/:id/coordinate-payment`.
3. **Multi-Tenant Boundary**:
   - `tenantId` is sourced strictly from verified JWT claims (`CurrentUser`).
   - Cross-tenant queries return uniform `404 Not Found` to prevent entity enumeration.

---

## 6. Automated Validation Evidence

```text
PASS apps/api/src/sales/__tests__/sales-openapi-contract.spec.ts
  Sales API OpenAPI / Swagger Contract Verification
    1. OpenAPI Document Generation & Core Metadata
      √ generates valid OpenAPI 3.0 document with title and version (2 ms)
      √ declares Bearer Authentication security scheme (1 ms)
    2. Sales Endpoint Path Coverage & HTTP Methods
      √ registers all 12 commercial sales endpoints in OpenAPI paths (1 ms)
      √ tags every sales route with "Sales" (1 ms)
    3. Query Parameters Schema Documentation on GET /api/v1/sales
      √ documents search, pagination, sort, and domain filter query parameters (1 ms)
    4. Schema Definitions in OpenAPI Components
      √ registers essential request and response DTO schemas
      √ MoneyResponseDto schema accurately documents precision, format, and integer cents (1 ms)

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
Snapshots:   0 total
```
