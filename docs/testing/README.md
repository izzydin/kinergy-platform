# Kinergy Platform - Enterprise Testing Guide & Quality Standards

- **Status:** Accepted Architecture Specification (Authoritative Single Source of Truth)
- **ADR Reference:** [ADR 0034: Enterprise Testing Strategy and Standards](file:///c:/Projects/kinergy-platform/docs/adr/0034-enterprise-testing-strategy-and-standards.md) & [ADR 0033](file:///c:/Projects/kinergy-platform/docs/adr/0033-reusable-testing-platform-package-architecture.md)
- **Testing Engine:** Jest / `@kinergy/testing`
- **Scope:** Unit Tests, Integration Tests, End-to-End (E2E) Tests, Quality Gates

---

## 1. Overview & Testing Pyramid

The Kinergy Platform testing architecture is engineered around **pure domain behavior verification, containerless speed, strict state isolation, and automated quality gates**.

```
           ▲
          / \
         /   \      E2E Tests (NestJS / Supertest)
        / E2E \     - Complete HTTP Pipeline, Auth Guards, Rate Limits
       /-------\
      / Integr. \   Integration Tests (Prisma ORM / Postgres)
     /-----------\  - DB Repositories, Unit of Work, State Transitions
    /  Unit Tests \ Unit Tests (Pure Domain Kernel & Use Cases)
   /---------------\- Mocked I/O, Instant Execution, 100% Deterministic
```

### Key Principles

1. **Containerless & Deterministic Execution**: Unit tests execute in pure Node.js memory without external database or Docker dependencies.
2. **Zero Flaky Tests**: Tests must avoid arbitrary `setTimeout()` sleeps; use `MockClock` for time manipulations.
3. **AAA Pattern (Arrange-Act-Assert)**: Every test suite follows structured setup, execution, and verification steps.

---

## 2. Reusable Testing Platform (`@kinergy/testing`)

All workspace projects consume the centralized `@kinergy/testing` package (`packages/testing`) to eliminate boilerplate setup.

### 2.1 Authentication Test Harness

Quickly mock JWT tokens, claims, and security contexts:

```typescript
import { JwtTestFactory, SecurityContextTestMock } from '@kinergy/testing';

// 1. Generate strongly typed mock JWT claims
const claims = JwtTestFactory.createClaims({
  sub: 'usr_operator_101',
  roles: ['OPERATOR'],
  permissions: ['assets.read', 'assets.update'],
});

// 2. Generate signed mock JWT string
const bearerToken = JwtTestFactory.createMockToken(claims);

// 3. Create mock authenticated HTTP request object
const req = SecurityContextTestMock.createAuthenticatedRequest({
  sub: 'usr_operator_101',
  roles: ['OPERATOR'],
});
```

### 2.2 Entity & Test Data Factories

Factories generate valid test entities with automatic sequence IDs and customizable overrides:

```typescript
import { UserTestFactory, RoleTestFactory } from '@kinergy/testing';

const userFactory = new UserTestFactory();
const roleFactory = new RoleTestFactory();

// Generate default active user entity
const user1 = userFactory.create();

// Generate custom role with overrides
const customRole = roleFactory.create({
  name: 'KITCHEN_MANAGER',
  description: 'Kitchen Operations Manager',
});
```

### 2.3 Fluent HTTP Request Builder

Build request descriptors cleanly for controller and use case tests:

```typescript
import { HttpRequestBuilder } from '@kinergy/testing';

const req = new HttpRequestBuilder()
  .post('/auth/login')
  .withHeader('x-tenant-id', 'tenant_alpha')
  .withBearerToken('mock_jwt_token_string')
  .withBody({ email: 'operator@kinergy.com', password: 'SecurePassword123!' })
  .build();
```

### 2.4 Domain & Result Assertions

Type-safe assertions for `Result<T>` envelopes and domain entity equality:

```typescript
import { ResultAssertions, EntityAssertions } from '@kinergy/testing';

// Unwraps Result.ok value safely or fails test with informative message
const data = ResultAssertions.expectOk(result);

// Unwraps Result.fail error message
const errorMessage = ResultAssertions.expectFail(result);

// Compares entity identity by ID
EntityAssertions.expectEqualId(userA, userB);
```

### 2.5 Database Reset & Cleaning

Isolate test state between integration test runs:

```typescript
import { MockDatabaseTestCleaner, DatabaseSeedHelper } from '@kinergy/testing';

const cleaner = new MockDatabaseTestCleaner();
await cleaner.cleanAll(); // Truncates all tables idempotently

const roles = DatabaseSeedHelper.getStandardRoles(); // Fetches standard seed roles
```

---

## 3. Practical Code Examples

### 3.1 Writing Unit Tests (Domain Entity & Use Case)

Unit tests verify pure business logic using mocked dependencies and `MockClock`.

```typescript
import { User, UserStatus } from '../domain/user.entity';
import { UserTestFactory, MockClock, ResultAssertions } from '@kinergy/testing';

describe('User Aggregate Root (Unit Test)', () => {
  let userFactory: UserTestFactory;
  let clock: MockClock;

  beforeEach(() => {
    userFactory = new UserTestFactory();
    clock = new MockClock(new Date('2026-07-29T12:00:00.000Z'));
  });

  it('should allow authentication when user is ACTIVE and not locked', () => {
    // Arrange
    const userProps = userFactory.create({ status: UserStatus.ACTIVE });
    const user = new User(userProps);

    // Act & Assert
    expect(user.canAuthenticate()).toBe(true);
  });

  it('should reject authentication when account is BLOCKED', () => {
    // Arrange
    const userProps = userFactory.create({ status: UserStatus.BLOCKED });
    const user = new User(userProps);

    // Act & Assert
    expect(user.canAuthenticate()).toBe(false);
  });
});
```

---

### 3.2 Writing Integration Tests (Repository & Prisma Persistence)

Integration tests execute against a real or mocked PostgreSQL store to verify relational mapping and query filters.

```typescript
import { PrismaUserRepository } from '../persistence/prisma-user.repository';
import { UserTestFactory, RepositoryMockFactory } from '@kinergy/testing';

describe('PrismaUserRepository (Integration Test)', () => {
  let mockRepo: ReturnType<typeof RepositoryMockFactory.createMockRepository>;
  let userFactory: UserTestFactory;

  beforeEach(() => {
    mockRepo = RepositoryMockFactory.createMockRepository();
    userFactory = new UserTestFactory();
  });

  it('should find user by email and return active domain entity', async () => {
    // Arrange
    const testUser = userFactory.create({ email: 'operator@kinergy.com' });
    mockRepo.findByEmail.mockResolvedValue(testUser);

    // Act
    const result = await mockRepo.findByEmail('operator@kinergy.com');

    // Assert
    expect(result).toBeDefined();
    expect(result.email).toBe('operator@kinergy.com');
  });
});
```

---

### 3.3 Writing End-to-End (E2E) Tests (NestJS & Supertest)

E2E tests verify the complete HTTP request pipeline, including `AuthenticationGuard`, `GlobalSanitizationValidationPipe`, and route handlers.

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { JwtTestFactory } from '@kinergy/testing';

describe('Authentication Subsystem (E2E Test)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/login - should return 401 Unauthorized with generic message on invalid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'nonexistent@kinergy.com',
        password: 'WrongPassword123!',
      })
      .expect(401);

    expect(response.body.message).toBe('Invalid email or password.');
  });
});
```

---

### 3.4 Monetary Precision & Financial Safety Net Testing (Milestone 7.4)

Financial calculations in Kinergy require **100% deterministic arithmetic** and complete absence of binary floating-point drift (IEEE 754). The platform enforces a specialized two-tier safety net:

#### 1. Precision & Rounding Verification (`monetary-precision-safety-net.spec.ts`)

- **IEEE-754 Pitfall Proofs**: Proves that known binary float pitfalls evaluate without error:
  - `0.1 + 0.2 === $0.30` (not `0.30000000000000004`)
  - `0.7 + 0.1 === $0.80` (not `0.7999999999999999`)
  - `1.00 - 0.90 === $0.10` (not `0.09999999999999998`)
  - `0.29 * 100 === 2900` cents (not `28.999999999999996`)
- **Commercial Half-Up Rounding Boundary Proofs**: Asserts midpoint rounding behavior:
  - `$0.005 -> $0.01` (rounds up)
  - `$0.0049 -> $0.00` (rounds down)
  - `$0.0051 -> $0.01` (rounds up)
- **Mathematical Determinism**: Executes 1,000 repeated calculations over heterogeneous item baskets, verifying bit-for-bit identical cent values and formatted strings across all iterations.
- **Reconstitution Integrity Law**: Rehydrates sales with deliberately corrupted totals (1 cent off), proving that `Sale.reconstitute()` strictly throws `InvalidSaleStateException`.

#### 2. Static Anti-Pattern Tests (`sales-monetary-anti-patterns.spec.ts`)

Automated source-code AST inspection enforcing architectural non-negotiables:

- **Domain Purity**: Asserts that `packages/core/src/sales/domain` contains zero imports of `@prisma/client`, `@nestjs/*`, or database infrastructure.
- **Prohibition of Float Conversions**: Verifies that domain files never invoke `.toNumber()` or `Number(money)`.
- **Integer Cent Division Restrictions**: Confirms that `Math.floor` or division is strictly constrained to cent conversions (`cents / 100`).
- **Currency Isolation**: Asserts that cross-currency arithmetic throws `InvalidMoneyException`.

---

### 3.5 Payment Domain & Multi-Tender Safety Net Testing (Milestone 7.5)

Phase 7.5 enforces financial correctness, state machine determinism, repository boundary isolation, and authorization hardening through a **52-test safety net across 11 key dimensions**:

#### 1. Core Domain QA Safety Net (`phase-7-5-payment-qa-safety-net.spec.ts`)

- **Dimension 1: Payment Creation & Invariant Validation**: Validates UUID formats, strictly positive amounts ($> 0$), non-negative amounts, rejection of negative/zero/NaN values, and instant settlement for `CASH` vs deferred pending for `QR`.
- **Dimension 2: Complete State Machine & Transition Matrix**: Exhaustively verifies every valid transition (`PENDING` $\to$ `SETTLED`, `FAILED`, `CANCELLED`) and asserts that transitions from terminal states (`SETTLED`, `FAILED`, `CANCELLED`) strictly throw `InvalidPaymentTransitionException`.
- **Dimension 3: Monetary Precision & Zero Float Drift**: Reuses Phase 7.4 `Money` value object; confirms exact cent precision across large-value tenders ($\$9,999,999.99$) and confirms zero IEEE-754 drift.
- **Dimension 4: Independence from Sale Totals**: Confirms that `Payment` operations NEVER modify or recalculate `Sale.subtotal`, `Sale.discountTotal`, or `Sale.total`.
- **Dimension 5: Repository Port Abstraction**: Asserts that domain and application layers depend strictly on `PaymentRepositoryPort` and `SaleRepositoryPort` abstractions, with zero direct Prisma coupling.
- **Dimension 6: Multi-Tender & Split Settlement**: Verifies split payments ($1 \text{ Sale} \to N \text{ Payments}$) where partial tenders advance `Sale.status` from `PENDING_PAYMENT` $\to$ `PARTIALLY_PAID` $\to$ `PAID`.
- **Dimension 7: Idempotency & Concurrency Defenses**: Proves that repeat settlement invocations fail gracefully and OCC version numbers advance monotonically.
- **Dimension 8: RBAC & Permissions**: Asserts that users lacking `payments.create`, `payments.read`, or `payments.manage` are rejected with `PaymentUnauthorizedException`. Verifies backward compatibility with `billing.write` and `billing.read`.
- **Dimension 9: Multi-Tenant Organization Isolation**: Validates cross-tenant boundaries; commands attempting to settle a Sale belonging to another tenant are strictly rejected.
- **Dimension 10: Reference Sanitization & PCI Defenses**: Asserts that `PaymentReference` permits valid alphanumeric register tags and gateway traces while eagerly rejecting credit card Primary Account Numbers (PANs; 13–19 consecutive digits).
- **Dimension 11: Failure Atomicity**: Verifies that failed payment attempts leave the target `Sale` completely unmutated.

#### 2. Presentation & API Controller Safety Net (`payments-qa-safety-net.spec.ts`)

- **Route Execution**: Verifies `POST /api/v1/sales/:saleId/payments`, `GET /api/v1/sales/:saleId/payments`, `GET /api/v1/payments/:id`, `POST /api/v1/payments/:id/settle`, and `POST /api/v1/payments/:id/cancel`.
- **Monetary Serialization**: Asserts that API responses serialize `MoneyResponseDto` with exact `cents`, `formatted` strings, and ISO-4217 currency.
- **Error Filter Mapping**: Verifies that `SalesExceptionFilter` maps domain exceptions to HTTP 400, 403, 404, and 422 cleanly.

---

### 3.6 Authoritative Payment State Machine & Lifecycle QA Suite (Milestone 7.6)

Milestone 7.6 delivers mathematical proof that invalid Payment state transitions are impossible through supported application paths, documented by [ADR-0116](../adr/0116-payment-state-machine-and-lifecycle-specification.md):

#### 1. Exhaustive Domain Lifecycle QA Matrix (`payment-lifecycle-qa-matrix.spec.ts` — 33 tests)

- **16-Cell Exhaustive Transition Matrix**: Tests every source/target combination ($4 \times 4 = 16$). Asserts that exactly 3 transitions (`PENDING` $\to$ `COMPLETED`, `FAILED`, `CANCELLED`) succeed, and all 13 other transitions throw typed `InvalidPaymentTransitionException`.
- **Mutation Safety & Invariant Protection**: Proves that attempting any invalid transition leaves all aggregate properties (`status`, `paidAt`, `amount`, `version`, domain events) completely unmutated.
- **Timestamp Coupling**: Verifies that `paidAt` is strictly `null` in `PENDING`, `FAILED`, and `CANCELLED`, and populated strictly upon entering `COMPLETED` ($\ge$ `createdAt`).
- **Deterministic Idempotency**: Proves that repeating a transition command on a terminal or already-transitioned payment is deterministically rejected with `InvalidPaymentTransitionException` (never a silent no-op).
- **Optimistic Concurrency Control (OCC)**: Proves that `Payment.version` increments monotonically on every transition, preventing lost updates during concurrent requests.
- **Phase 7.4 Regression Immunity**: Verifies that the payment aggregate respects canonical `Money` integer arithmetic and never recalculates or modifies parent `Sale` totals.

#### 2. API Lifecycle & Client Bypass QA Suite (`payments-lifecycle-api-qa.spec.ts` — 17 tests)

- **Explicit Lifecycle Endpoints**: Directly tests `POST /api/v1/payments/:id/complete`, `POST /api/v1/payments/:id/fail`, `POST /api/v1/payments/:id/cancel`, and alias `POST /api/v1/payments/:id/settle`.
- **Client Bypass Immunity**: Proves that clients cannot pass arbitrary `status`, `paidAt`, or `createdAt` fields in request bodies; status transitions can only be triggered via domain lifecycle methods.
- **HTTP Error Mapping**:
  - `404 Not Found`: Target payment does not exist in tenant scope.
  - `403 Forbidden`: User lacks required permission (`payments.create` or `payments.manage`).
  - `409 Conflict`: OCC concurrency collision (`PaymentOptimisticLockException`).
  - `422 Unprocessable Entity`: Prohibited state machine transition (`InvalidPaymentTransitionException`).

---

## 4. Test Execution & Quality Gate Pipeline

Run all test suites using workspace commands:

```bash
# 1. Run unit tests for API application
npx nx test api

# 2. Run unit tests for testing package
npx nx test testing

# 3. Execute complete automated quality gate (Lint, Typecheck, Tests, Build)
pnpm validate
```

---

## 5. Related Testing Specifications

- **[Integration Testing Strategy](file:///c:/Projects/kinergy-platform/docs/testing/integration-testing-strategy.md)**: Multi-layer workflow verification and state isolation rules.
- **[End-to-End Testing Strategy](file:///c:/Projects/kinergy-platform/docs/testing/e2e-testing-strategy.md)**: Complete HTTP pipeline testing with NestJS and Supertest.
- **[Technical Quality Report](file:///c:/Projects/kinergy-platform/docs/testing/technical-quality-report.md)**: Automated quality gate metrics and 100% test pass verification.
