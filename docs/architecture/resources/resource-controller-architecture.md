# Resources HTTP Controller Architecture & Adapter Layer Baseline

**Status**: Approved & Active  
**Milestone**: Phase 6.9 — Backend API Layer  
**Domain**: Resources Management (Consumable Inventory, Fixed Assets, Cross-Domain Valuation)  
**Author**: Principal NestJS Engineer & API Boundary Reviewer  
**Governing Documents**:

- [**ADR-0099: Explicit Sub-Resource State Mutation Endpoints vs. Generic PATCH**](./adr/0099-explicit-subresource-state-mutation-endpoints-vs-generic-patch.md)
- [**ADR-0098: Cross-Domain Valuation Query Handler Composition**](./adr/0098-cross-domain-valuation-query-handler-composition.md)
- [**Resources API Contracts & Validation**](./resource-api-contracts.md)
- [**Backend API Architecture Baseline**](./backend-api-baseline.md)

---

## 1. Mandatory Request Pipeline Flow

The Kinergy HTTP adapter layer strictly enforces the mandatory pipeline flow for every request:

```
[HTTP Request]
       │
       ▼
[Route Resolution] (NestJS Controller Routing: /api/v1/resources/...)
       │
       ▼
[AuthenticationGuard] (Validates Access JWT & extracts AuthenticatedUserContext)
       │
       ▼
[AuthorizationGuard] (Evaluates @Permissions and @Roles metadata against UserContext)
       │
       ▼
[GlobalSanitizationValidationPipe] (InputSanitizer + class-validator strict whitelist)
       │
       ▼
[Controller Action] (Builds CQRS Command / Query with validated DTO & actor ID)
       │
       ▼
[Application Use Case / Query Handler] (Executes domain logic & business rules)
       │
       ▼
[Domain Result] (ResourcesApplicationResult.ok / fail)
       │
       ▼
[Response Mapping] (Serializes strongly-typed DTO, casts Decimals, envelopes pagination)
       │
       ▼
[HTTP Response] (200 OK / 201 Created / Standardized Exception Envelope)
```

---

## 2. Controller Responsibility & Clean Boundary Invariants

The three Resources controllers ([`InventoryController`](file:///c:/Projects/kinergy-platform/apps/api/src/resources/controllers/inventory.controller.ts), [`FixedAssetsController`](file:///c:/Projects/kinergy-platform/apps/api/src/resources/controllers/fixed-assets.controller.ts), [`ResourceValuationController`](file:///c:/Projects/kinergy-platform/apps/api/src/resources/controllers/resource-valuation.controller.ts)) strictly adhere to the following boundary rules:

### 2.1 Permitted Responsibilities:

1. **HTTP Parameter & Body Binding**: Access validated, sanitized DTOs and route parameters.
2. **Actor Context Extraction**: Extract authenticated `user.userId` and `user.tenantId` via `@CurrentUser()`.
3. **CQRS Dispatch**: Instantiate and dispatch domain Command/Query objects to dedicated application handlers.
4. **Response Shaping**: Return strongly-typed Response DTOs adhering to OpenAPI schemas.
5. **Exception Propagation**: Throw standard NestJS HTTP exceptions (`NotFoundException`, `BadRequestException`) for domain failures, which are intercepted by `GlobalExceptionFilter`.

### 2.2 Strict Prohibitions (Zero Business Logic in Controllers):

- **NO Direct Database / Prisma Access**: All data access is encapsulated behind repository interfaces and CQRS handlers.
- **NO Stock Arithmetic**: Stock on hand, delta arithmetic, and low-stock comparisons are strictly calculated in domain aggregates.
- **NO Inventory Movement Generation**: Ledger movements are created exclusively by domain aggregates and persistence repositories.
- **NO Transition Tables**: State machine lifecycle rules (`ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`) reside solely in the domain core.
- **NO History Construction**: Audit event logs are emitted by domain aggregates and handled by application ports.
- **NO Valuation Arithmetic**: Asset carrying value, inventory working capital, and cross-domain balance sheets are computed by dedicated valuation handlers.
- **NO Manual Permission Checks in Controller Body**: Declarative `@Permissions()` and `@Roles()` decorators are evaluated by `AuthorizationGuard`.

---

## 3. Controller & Route Registry

All controllers are registered under the global prefix `api/v1/resources`:

```
api/v1/resources/
├── inventory/                  (InventoryController)
│   ├── categories              GET (Static code-defined taxonomy)
│   ├──                         GET, POST
│   ├── low-stock               GET
│   ├── valuation               GET
│   └── :id/
│       ├──                     GET, PATCH
│       ├── stock-level         GET
│       ├── movements           GET
│       ├── receive             POST (Replenishment PO receipt)
│       ├── sell                POST (POS retail deduction)
│       ├── consume             POST (Clinical treatment consumption)
│       ├── scrap               POST (Damaged disposal)
│       ├── adjust              POST (Count variance reconciliation)
│       ├── archive             POST
│       ├── activate            POST
│       └── deactivate          POST
│
├── assets/                     (FixedAssetsController)
│   ├── categories              GET (Static code-defined taxonomy)
│   ├── tag/:tag                GET (Barcode / RFID scanner lookup)
│   ├──                         GET, POST
│   ├── valuation/summary       GET
│   └── :id/
│       ├──                     GET, PATCH
│       ├── transfer            POST (Physical location relocation)
│       ├── status              POST (State machine transition)
│       ├── condition           POST (Condition rating update)
│       ├── maintenance         POST, GET
│       ├── valuation           POST, GET
│       └── history             GET (Immutable lifecycle audit log)
│
└── valuation/                  (ResourceValuationController)
    └── summary                 GET (Combined cross-domain balance sheet)
```

---

## 4. Architectural Review & Audit Checklist

| Review Area                  | Verification Finding                                                                                                                  | Compliance Status  |
| :--------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ | :----------------- |
| **Business Logic Leakage**   | 0 instances of stock calculation, state transition logic, or movement construction found in controllers.                              | **100% Compliant** |
| **Persistence Leakage**      | 0 PrismaClient or raw SQL calls in controllers. All access mediated by CQRS handlers.                                                 | **100% Compliant** |
| **Duplicated Validation**    | Boundary validation handled by `GlobalSanitizationValidationPipe`; business invariants handled in domain aggregates.                  | **100% Compliant** |
| **Duplicated Authorization** | All routes protected by declarative `@Permissions()` and `@Roles()` evaluated by `AuthorizationGuard`.                                | **100% Compliant** |
| **Duplicated Error Mapping** | All errors handled consistently through standard NestJS exceptions and `GlobalExceptionFilter`.                                       | **100% Compliant** |
| **Valuation Calculations**   | Calculations strictly performed by `GetInventoryValuationHandler`, `GetAssetValueHandler`, and `GetCombinedResourceValuationHandler`. | **100% Compliant** |

---

## 5. Verification & Test Evidence

The controller architecture and adapter layer are verified by 8 automated test suites (**155 passing tests**):

1. `apps/api/src/resources/__tests__/inventory-api.contract.spec.ts` (18 tests)
2. `apps/api/src/resources/__tests__/fixed-assets-api.contract.spec.ts` (17 tests)
3. `apps/api/src/resources/__tests__/resource-valuation-api.contract.spec.ts` (3 tests)
4. `apps/api/src/resources/__tests__/inventory.authorization.spec.ts` (22 tests)
5. `apps/api/src/resources/__tests__/fixed-assets.authorization.spec.ts` (23 tests)
6. `apps/api/src/resources/__tests__/resource-valuation.authorization.spec.ts` (10 tests)
7. `apps/api/src/resources/__tests__/resources-security-negative-and-side-effects.spec.ts` (30 tests)
8. `apps/api/src/resources/__tests__/resources-validation.spec.ts` (32 tests)
