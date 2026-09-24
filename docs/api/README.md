# Kinergy Platform - OpenAPI 3.0 Reference & API Specification

- **Status:** Active & Production-Hardened Specification
- **Base Route Prefix:** `/api/v1`
- **Interactive Documentation URL:** `http://localhost:3000/api/docs` (Swagger UI)
- **Security Scheme:** HTTP Bearer Token (`Bearer <JWT>`)

---

## 1. Overview & Swagger Configuration

The Kinergy Platform API is structured following RESTful principles, Clean Architecture, and Domain-Driven Design (DDD). The interactive OpenAPI 3.0 documentation is auto-generated during application bootstrap via `@nestjs/swagger` (`DocumentBuilder` in `apps/api/src/main.ts`).

```
http://localhost:3000/api/docs
```

- **Title**: Kinergy Platform API
- **Description**: Enterprise Energy & Sustainability Management System API
- **Version**: 1.0
- **Security Scheme**: `bearerAuth` (JWT Access Token)

---

## 2. Standard Response Envelopes & Error Structures

### 2.1 Success Response (`200 OK` / `201 Created`)

All successful API operations return a standardized `Result<T>` envelope:

```json
{
  "success": true,
  "data": {
    "id": "usr_9b1deb4d-3b7d-416b-9548-52ee8c8230e5",
    "email": "operator@kinergy.com",
    "roles": ["OPERATOR"],
    "status": "ACTIVE"
  },
  "error": null,
  "timestamp": "2026-07-29T12:00:00.000Z"
}
```

### 2.2 Generic Authentication Failure (`401 Unauthorized`)

Public authentication failures (`/auth/login`, `/auth/refresh`) return generic uninformative error messages to prevent account harvesting:

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Invalid email or password.",
  "timestamp": "2026-07-29T12:00:00.000Z",
  "path": "/api/v1/auth/login"
}
```

### 2.3 Validation Failure (`400 Bad Request`)

Payload validation failures triggered by `GlobalSanitizationValidationPipe` or Zod schemas return formatted field validation issues:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": [
    "email must be a valid email address",
    "password must be at least 12 characters long"
  ],
  "timestamp": "2026-07-29T12:00:00.000Z",
  "path": "/api/v1/users"
}
```

### 2.4 Authorization Failure (`403 Forbidden`)

Triggered by `AuthorizationGuard` when the authenticated identity lacks required roles or permissions:

```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Access Denied: Insufficient permission 'users.write'. Required: ['users.write'].",
  "timestamp": "2026-07-29T12:00:00.000Z",
  "path": "/api/v1/users"
}
```

### 2.5 Transport Rate Limit Failure (`429 Too Many Requests`)

Triggered by `@nestjs/throttler` custom guards when rate limits are exceeded:

```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "ThrottlerException: Too Many Requests",
  "timestamp": "2026-07-29T12:00:00.000Z",
  "path": "/api/v1/auth/login"
}
```

---

## 3. Comprehensive Endpoint Catalog

### 3.1 Health Check (`/health`)

| HTTP Method | Route     | Protection  | Summary & Description                                                               | Expected Status Codes |
| :---------- | :-------- | :---------- | :---------------------------------------------------------------------------------- | :-------------------- |
| `GET`       | `/health` | `@Public()` | **Get Health Status**: Returns system health status, timestamp, and process uptime. | `200 OK`              |

### 3.2 Authentication Module (`/auth`)

| HTTP Method | Route           | Protection                                 | Permission Required | Summary & Description                                                                                                                                                                               | Expected Status Codes                                                             |
| :---------- | :-------------- | :----------------------------------------- | :------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------- |
| `POST`      | `/auth/login`   | `@Public()`, `@LoginThrottle()`            | None                | **Authenticate User**: Validates user credentials, executes constant-time dummy Argon2id check on missing users, checks account lifecycle state, and returns JWT Access Token + Refresh Token pair. | `200 OK`<br/>`400 Bad Request`<br/>`401 Unauthorized`<br/>`429 Too Many Requests` |
| `POST`      | `/auth/refresh` | `@Public()`, `@RefreshThrottle()`          | None                | **Refresh Token Pair**: Consumes active Refresh Token, evaluates sliding-window rotation (RTR), checks for family reuse/replay attacks, and returns new TokenPair.                                  | `200 OK`<br/>`400 Bad Request`<br/>`401 Unauthorized`<br/>`429 Too Many Requests` |
| `POST`      | `/auth/logout`  | `AuthenticationGuard`, `@LogoutThrottle()` | Authenticated       | **User Logout**: Revokes current Refresh Token family in database and clears HTTP-Only session cookies.                                                                                             | `200 OK`<br/>`401 Unauthorized`                                                   |
| `GET`       | `/auth/me`      | `AuthenticationGuard`, `@MeThrottle()`     | Authenticated       | **Get Current User Context**: Returns authenticated user identity context (`userId`, `email`, `roles`, `permissions`, `tenantId`).                                                                  | `200 OK`<br/>`401 Unauthorized`                                                   |

### 3.3 Identity & User Management Module (`/users`)

| HTTP Method | Route                   | Protection                                  | Permission Required | Summary & Description                                                                                                                             | Expected Status Codes                                                                         |
| :---------- | :---------------------- | :------------------------------------------ | :------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------- |
| `POST`      | `/users`                | `AuthenticationGuard`, `AuthorizationGuard` | `users.write`       | **Create User Account**: Onboards new user record in target tenant. Validates password complexity (`PasswordPolicyService`) and email uniqueness. | `201 Created`<br/>`400 Bad Request`<br/>`401 Unauthorized`<br/>`403 Forbidden`                |
| `GET`       | `/users`                | `AuthenticationGuard`, `AuthorizationGuard` | `users.read`        | **Search & Paginate Users**: Returns paginated user directory filtered by status, role, or email search string.                                   | `200 OK`<br/>`401 Unauthorized`<br/>`403 Forbidden`                                           |
| `GET`       | `/users/:id`            | `AuthenticationGuard`, `AuthorizationGuard` | `users.read`        | **Get User by ID**: Retrieves single user identity aggregate details by unique user ID.                                                           | `200 OK`<br/>`401 Unauthorized`<br/>`403 Forbidden`<br/>`404 Not Found`                       |
| `PATCH`     | `/users/:id`            | `AuthenticationGuard`, `AuthorizationGuard` | `users.write`       | **Update User**: Updates user roles, email, or tenant context bindings.                                                                           | `200 OK`<br/>`400 Bad Request`<br/>`401 Unauthorized`<br/>`403 Forbidden`<br/>`404 Not Found` |
| `POST`      | `/users/:id/activate`   | `AuthenticationGuard`, `AuthorizationGuard` | `users.write`       | **Activate User Account**: Executes state transition to `ACTIVE` status via `UserStatusStateMachine`.                                             | `200 OK`<br/>`400 Bad Request`<br/>`401 Unauthorized`<br/>`403 Forbidden`<br/>`404 Not Found` |
| `POST`      | `/users/:id/deactivate` | `AuthenticationGuard`, `AuthorizationGuard` | `users.delete`      | **Deactivate User Account**: Executes state transition to `DEACTIVATED` status, invalidating all refresh tokens.                                  | `200 OK`<br/>`401 Unauthorized`<br/>`403 Forbidden`<br/>`404 Not Found`                       |
| `DELETE`    | `/users/:id`            | `AuthenticationGuard`, `AuthorizationGuard` | `users.delete`      | **Soft Delete User**: Soft deletes user record (`status = DELETED`, sets `deletedAt`), invalidating token version.                                | `200 OK`<br/>`401 Unauthorized`<br/>`403 Forbidden`<br/>`404 Not Found`                       |

### 3.4 Sales & Payments Module (`/api/v1/sales`)

The Sales API provides deterministic point-of-sale checkout sessions, item snapshots, item-level discounts, and finalized commercial totals. All monetary values are serialized according to the **Milestone 7.4 Monetary Policy** ([ADR-0114](file:///c:/Projects/kinergy-platform/docs/adr/0114-canonical-monetary-policy-and-sale-totals.md)), guaranteeing zero floating-point drift.

| HTTP Method | Route                        | Protection                                  | Permission Required | Summary & Description                                                                                                                                            | Expected Status Codes                                                                              |
| :---------- | :--------------------------- | :------------------------------------------ | :------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------- |
| `POST`      | `/api/v1/sales`              | `AuthenticationGuard`, `AuthorizationGuard` | `sales.create`      | **Create Sale**: Initializes a new commercial checkout session in `DRAFT` status with exact zero totals (`$0.00`).                                               | `201 Created`<br/>`400 Bad Request`<br/>`401 Unauthorized`<br/>`403 Forbidden`                     |
| `GET`       | `/api/v1/sales/:id`          | `AuthenticationGuard`, `AuthorizationGuard` | `sales.read`        | **Get Sale by ID**: Returns complete sale aggregate representation with line items, structured `MoneyResponseDto` totals, and flat summary projections.          | `200 OK`<br/>`401 Unauthorized`<br/>`403 Forbidden`<br/>`404 Not Found`                            |
| `POST`      | `/api/v1/sales/:id/items`    | `AuthenticationGuard`, `AuthorizationGuard` | `sales.create`      | **Add Sale Item**: Adds a line item with optional fixed or percentage discount. Recomputes order subtotal, discountTotal, and total deterministically in domain. | `201 Created`<br/>`400 Bad Request`<br/>`401 Unauthorized`<br/>`403 Forbidden`<br/>`404 Not Found` |
| `POST`      | `/api/v1/sales/:id/finalize` | `AuthenticationGuard`, `AuthorizationGuard` | `sales.create`      | **Finalize Sale**: Permanently freezes commercial terms and transitions status from `DRAFT` to `PENDING_PAYMENT`. Rejects empty sales (`EMPTY_SALE`).            | `200 OK`<br/>`400 Bad Request`<br/>`401 Unauthorized`<br/>`403 Forbidden`<br/>`404 Not Found`      |

#### Monetary API Response Structure (`MoneyResponseDto`)

All monetary totals (`subtotal`, `discountTotal`, `total`) and item pricing (`unitPrice`, `subtotal`, `discountTotal`, `total`) serialize as structured `MoneyResponseDto` objects alongside flat read properties:

```json
{
  "id": "sale_01j9876543210abcdef",
  "currency": "USD",
  "status": "DRAFT",
  "subtotal": {
    "amount": 99.98,
    "currency": "USD",
    "formatted": "99.98",
    "cents": 9998
  },
  "discountTotal": {
    "amount": 15.0,
    "currency": "USD",
    "formatted": "15.00",
    "cents": 1500
  },
  "total": {
    "amount": 84.98,
    "currency": "USD",
    "formatted": "84.98",
    "cents": 8498
  },
  "subtotalAmount": 99.98,
  "discountTotalAmount": 15.0,
  "totalAmount": 84.98,
  "itemCount": 1,
  "items": [
    {
      "id": "item_01j9877890123abcdef",
      "description": "Premium Whey Protein Isolate (1.5 kg)",
      "skuOrCode": "RET-PROT-001",
      "quantity": 2,
      "unitPrice": {
        "amount": 49.99,
        "currency": "USD",
        "formatted": "49.99",
        "cents": 4999
      },
      "subtotal": {
        "amount": 99.98,
        "currency": "USD",
        "formatted": "99.98",
        "cents": 9998
      },
      "discountTotal": {
        "amount": 15.0,
        "currency": "USD",
        "formatted": "15.00",
        "cents": 1500
      },
      "total": {
        "amount": 84.98,
        "currency": "USD",
        "formatted": "84.98",
        "cents": 8498
      },
      "discount": {
        "type": "PERCENTAGE",
        "value": 15,
        "reason": "VIP Member 15% Promotion"
      }
    }
  ],
  "version": 2,
  "createdAt": "2026-09-18T16:00:00.000Z",
  "updatedAt": "2026-09-18T16:05:00.000Z"
}
```

---

### 3.5 Payments Module (`/api/v1/sales/:saleId/payments` & `/api/v1/payments`)

The Payments API provides autonomous financial settlement operations for commercial sale orders, supporting cash counter payments, asynchronous QR dynamic codes, multi-tender split settlement, and pending tender cancellation.

All monetary amounts strictly adhere to the **Phase 7.4 Monetary Policy** ([ADR-0108](../adr/0108-money-representation.md), [ADR-0114](../adr/0114-canonical-monetary-policy-and-sale-totals.md), [ADR-0115](../adr/0115-payment-domain-canonical-architecture.md)).

```text
Sale = commercial transaction / amount owed

Payment = money paid toward a Sale

> Payment does not replace or recalculate Sale totals.
```

#### Endpoints Catalog

| HTTP Method | Route                            | Protection                                  | Permission Required                  | Allowed Roles                                       | Summary & Description                                                                                                                 | Expected Status Codes                                                                                             |
| :---------- | :------------------------------- | :------------------------------------------ | :----------------------------------- | :-------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------- |
| `POST`      | `/api/v1/sales/:saleId/payments` | `AuthenticationGuard`, `AuthorizationGuard` | `payments.create`                    | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff` | **Record Payment Tender**: Records cash or QR payment against a finalized sale order in `PENDING_PAYMENT` or `PARTIALLY_PAID` status. | `201 Created`<br/>`400 Bad Request`<br/>`403 Forbidden`<br/>`404 Not Found`<br/>`422 Unprocessable Entity`        |
| `GET`       | `/api/v1/sales/:saleId/payments` | `AuthenticationGuard`, `AuthorizationGuard` | `payments.read`                      | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff` | **List Sale Payments**: Returns chronological payment transactions settling a given sale.                                             | `200 OK`<br/>`401 Unauthorized`<br/>`403 Forbidden`<br/>`404 Not Found`                                           |
| `GET`       | `/api/v1/payments/:paymentId`    | `AuthenticationGuard`, `AuthorizationGuard` | `payments.read`                      | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff` | **Get Payment by ID**: Retrieves individual payment transaction details by unique payment ID.                                         | `200 OK`<br/>`401 Unauthorized`<br/>`403 Forbidden`<br/>`404 Not Found`                                           |
| `POST`      | `/api/v1/payments/:id/complete`  | `AuthenticationGuard`, `AuthorizationGuard` | `payments.create`, `payments.manage` | `Owner`, `Manager`, `Receptionist`                  | **Complete Payment**: Transitions a `PENDING` payment to `COMPLETED`, records `paidAt` timestamp, and advances Sale balance.          | `200 OK`<br/>`400 Bad Request`<br/>`403 Forbidden`<br/>`404 Not Found`<br/>`409 Conflict`<br/>`422 Unprocessable` |
| `POST`      | `/api/v1/payments/:id/fail`      | `AuthenticationGuard`, `AuthorizationGuard` | `payments.create`, `payments.manage` | `Owner`, `Manager`, `Receptionist`                  | **Fail Payment**: Transitions a `PENDING` payment to terminal `FAILED` status with audit reason.                                      | `200 OK`<br/>`400 Bad Request`<br/>`403 Forbidden`<br/>`404 Not Found`<br/>`409 Conflict`<br/>`422 Unprocessable` |
| `POST`      | `/api/v1/payments/:id/cancel`    | `AuthenticationGuard`, `AuthorizationGuard` | `payments.manage`                    | `Owner`, `Manager`, `Receptionist`                  | **Cancel Pending Tender**: Voids a `PENDING` payment transaction. Completed payments are permanently immutable.                       | `200 OK`<br/>`400 Bad Request`<br/>`403 Forbidden`<br/>`404 Not Found`<br/>`409 Conflict`<br/>`422 Unprocessable` |
| `POST`      | `/api/v1/payments/:id/settle`    | `AuthenticationGuard`, `AuthorizationGuard` | `payments.create`, `payments.manage` | `Owner`, `Manager`, `Receptionist`                  | **Settle Payment (Alias)**: Canonical alias for `/complete`, transitioning `PENDING` to `COMPLETED`/`SETTLED`.                        | `200 OK`<br/>`400 Bad Request`<br/>`403 Forbidden`<br/>`404 Not Found`<br/>`409 Conflict`<br/>`422 Unprocessable` |

#### Request Schemas

> **Critical Rule**: Client request DTOs strictly prohibit sending `status`, `paidAt`, or `createdAt`. Every state transition is executed exclusively through explicit lifecycle endpoints. Any client-supplied `status` is stripped and ignored.

##### 1. `RecordPaymentRequestDto` (`POST /api/v1/sales/:saleId/payments`)

```json
{
  "method": "CASH",
  "amount": 49.99,
  "currency": "USD",
  "reference": "DRAWER-01-RECEIPT-99"
}
```

- **`method`** (string, required): Supported tender method: `CASH` or `QR`.
- **`amount`** (number, required): Major currency units ($> 0$, max 2 decimal places).
- **`currency`** (string, optional): 3-letter uppercase ISO-4217 code (default `"USD"`). Must match parent `Sale` currency.
- **`reference`** (string, optional): External correlation or cash drawer audit trace (max 100 characters; alphanumeric and `#-_/.: `; no credit card PANs).

##### 2. `CompletePaymentRequestDto` / `SettlePaymentRequestDto` (`POST /api/v1/payments/:id/complete`, `POST /api/v1/payments/:id/settle`)

```json
{
  "reference": "QR-CONFIRMED-TRACE-12345",
  "paidAt": "2026-09-24T12:00:00.000Z"
}
```

- **`reference`** (string, optional): Provider settlement confirmation trace (max 100 characters).
- **`paidAt`** (string, optional): ISO-8601 UTC timestamp of actual fund clearance (defaults to server clock time).

##### 3. `FailPaymentRequestDto` (`POST /api/v1/payments/:id/fail`)

```json
{
  "reason": "Payment gateway rejected transaction: insufficient funds"
}
```

- **`reason`** (string, optional): Decline justification or gateway error code (max 255 characters).

##### 4. `CancelPaymentRequestDto` (`POST /api/v1/payments/:id/cancel`)

```json
{
  "reason": "Customer opted to tender cash instead"
}
```

- **`reason`** (string, optional): Operator justification for voiding pending tender (max 255 characters).

#### Response Schema (`PaymentResponseDto`)

```json
{
  "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "saleId": "f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c",
  "method": "CASH",
  "amount": {
    "amount": 49.99,
    "currency": "USD",
    "formatted": "49.99",
    "cents": 4999
  },
  "amountValue": 49.99,
  "status": "COMPLETED",
  "reference": "DRAWER-01-RECEIPT-99",
  "paidAt": "2026-09-24T10:00:00.000Z",
  "createdAt": "2026-09-24T10:00:00.000Z",
  "version": 1
}
```

- **`method` values**: Supported: `CASH`, `QR`. (Room left for future `CARD`, `TRANSFER`, `ONLINE`).
- **`status` values**: Exact 4 states: `PENDING`, `COMPLETED` (or `SETTLED`), `FAILED`, `CANCELLED`.
- **`amount` structure**: Canonical `MoneyResponseDto` providing `amount` (float), `currency` (ISO-4217), `formatted` (2-decimal string), and `cents` (safe integer).
- **`amountValue`**: Direct decimal scalar for simplified frontend binding.
- **`paidAt`**: ISO-8601 UTC timestamp populated strictly when `status == COMPLETED`, or `null` for non-completed states.
- **`version`**: OCC integer version counter ($\ge 1$).

---

## 4. HTTP Status Code Reference

| Status Code                | Meaning           | System Trigger & Cause                                                                          |
| :------------------------- | :---------------- | :---------------------------------------------------------------------------------------------- |
| `200 OK`                   | Request Succeeded | Read or mutation operation completed cleanly.                                                   |
| `201 Created`              | Resource Created  | New entity successfully persisted in database.                                                  |
| `400 Bad Request`          | Validation Error  | Payload failed Zod or validation pipe rules, or invalid tender method.                          |
| `401 Unauthorized`         | AuthN Failure     | Missing/invalid Bearer token, expired JWT, or invalid login credentials.                        |
| `403 Forbidden`            | AuthZ Failure     | Authenticated identity lacks required role or permission code, or cross-tenant access.          |
| `404 Not Found`            | Resource Missing  | Requested entity ID (Sale or Payment) does not exist in target tenant scope.                    |
| `409 Conflict`             | OCC Conflict      | Optimistic Concurrency Control collision (`PaymentOptimisticLockException`); state was mutated. |
| `422 Unprocessable Entity` | Domain Rule Error | Operation rejected by business rules (Sale not payable, invalid state transition, overpayment). |
| `429 Too Many Requests`    | Rate Limited      | Request count exceeded rate limit sliding window.                                               |
| `500 Internal Error`       | Server Failure    | Uncaught exception logged to platform telemetry.                                                |
