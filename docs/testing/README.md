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
