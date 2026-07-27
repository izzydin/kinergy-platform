# 34. Enterprise Testing Strategy & Standards

- **Status:** Accepted
- **Date:** 2026-07-27
- **Authors:** Principal Software Architect & Principal Test Architect
- **Target Audience:** All Software Engineers, Security Engineers, and Quality Engineers

---

## 1. Purpose

Testing in the Kynergy Platform is treated as a **core platform capability** rather than an afterthought or isolated QA phase. As an enterprise Modular Monolith built on Clean Architecture and Domain-Driven Design (DDD), maintaining software quality, security boundaries, and architectural integrity requires a unified, repeatable testing strategy across every bounded context (`Identity`, `Employee`, `Client`, `Scheduling`, `Inventory`, `Billing`, `Kitchen`, `Nutrition`, `Payments`, `Notifications`, `Audit Logging`).

This Architectural Decision Record (ADR) establishes the single source of truth for all testing practices, patterns, frameworks, and quality gates across the repository.

---

## 2. Testing Philosophy

### 2.1 The Test Pyramid

We enforce a pragmatic Test Pyramid:

- **Unit Tests (Base / Heavy Weight ~70-80%)**: Fast, isolated, containerless tests validating pure domain logic, value objects, aggregates, domain state machines, and application use cases.
- **Integration Tests (Middle Weight ~15-20%)**: Testing boundaries between application use cases, infrastructure implementations (Prisma repositories, rate limiting guards, event publishers), and database persistence.
- **End-to-End Tests (Apex ~5-10%)**: High-level workflow verification across HTTP entry points and real database layers.

```
       / \
      / E2E \        <- 5-10% High value, broad workflow validation
     /-------\
    /  Integ  \      <- 15-20% Infrastructure ports & DB persistence
   /-----------\
  /    Unit     \    <- 70-80% Fast, containerless domain & use-case logic
 /---------------\
```

### 2.2 Shift-Left Testing & Continuous Quality Gates

Tests are executed locally during development and enforced automatically in CI pipelines via `pnpm validate`. Code cannot be merged without 100% test pass rates across all workspace projects.

### 2.3 Fast Feedback Loops

Unit tests must execute in **milliseconds** without booting NestJS dependency injection containers or PostgreSQL database connections. Mocking infrastructure ports allows developers to receive instant feedback during TDD iterations.

### 2.4 Deterministic Tests

Tests must produce identical results regardless of execution order, time zone, OS environment, or concurrency level. Randomness must be controlled using CSPRNG test seeds (`RandomTestData`).

### 2.5 Business Behavior Over Implementation Details

Tests verify **what** the system does (business outcomes, state transitions, security events emitted) rather than **how** internal private methods are structured.

---

## 3. Test Types & Responsibilities

| Test Type                      | Primary Scope                                                                             | Dependencies / Environment                                                           | Target Execution Speed  |
| :----------------------------- | :---------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- | :---------------------- |
| **Unit Tests**                 | Domain entities, value objects, state machines, application use cases.                    | 100% pure in-memory mocks (`MockClock`, `MockLogger`, `MockSecurityEventPublisher`). | $< 50$ ms per suite     |
| **Integration Tests**          | Prisma repository implementations, custom HTTP guards, rate limiters, token factories.    | Isolated PostgreSQL database container or mock unit-of-work context.                 | $< 500$ ms per suite    |
| **End-to-End (E2E) Tests**     | Complete HTTP controller flows, authentication pipelines, request context propagation.    | Fully wired NestJS testing module (`NestTestModuleBuilder`) + test database.         | $< 2$ seconds per suite |
| **Contract Tests (Future)**    | Cross-context event schemas and REST/gRPC API contracts.                                  | Pact or JSON Schema contract validators.                                             | Asynchronous CI gate    |
| **Performance Tests (Future)** | Rate limiting stress tests, Argon2id CPU/Memory load bounds, DB query latency.            | k6 / Locust load generators against staging containers.                              | Scheduled CI pipelines  |
| **Security Tests (Future)**    | Automated OWASP Top 10 dependency scanning, JWT fuzzing, RBAC authorization matrix scans. | SonarQube, Snyk, and custom security test suites.                                    | Nightly / Release gates |

---

## 4. Risk-Based Coverage Expectations

We reject arbitrary percentage mandates (e.g. "every line must have 100% coverage") in favor of **Risk-Based Coverage Expectations**:

- **Domain Layer (`100% Mandatory Coverage`)**: Pure aggregates (`User`), value objects, state machines (`UserStatusStateMachine`), and domain event contracts must have 100% branch and path coverage. Zero exceptions.
- **Application Layer (`> 95% Coverage`)**: Use cases (`LoginUseCase`, `CreateUserUseCase`, `ChangePasswordUseCase`) must cover success paths, all validation exceptions, security event publishing, and failure handling.
- **Guards & Authorization (`100% Mandatory Coverage`)**: Security guards (`AuthenticationGuard`, `AuthorizationGuard`, `CustomThrottlerGuard`) and authorization decision engines (`AuthorizationEvaluator`) require 100% path coverage for allowed and denied scenarios.
- **Infrastructure & Repositories (`> 85% Coverage`)**: Prisma repositories and secret providers must be validated against error mapping and null checks.
- **Controllers & DTOs (`> 80% Coverage`)**: Verified via E2E request context tests ensuring HTTP status code mapping and DTO validation errors.

---

## 5. Test Naming Conventions

Test case titles must be **expressive and behavior-focused**. Use `should_<expected_behavior>_when_<scenario>` style:

### Preferred Examples

- `should_create_user_when_credentials_and_roles_are_valid`
- `should_reject_login_when_password_is_invalid`
- `should_revoke_refresh_tokens_when_password_is_changed`
- `should_deny_authentication_when_user_status_is_blocked`
- `should_throw_InvalidUserStatusTransitionException_when_attempting_illegal_state_jump`

### Forbidden Examples

- ❌ `testUser`
- ❌ `loginTest`
- ❌ `checkMethod`
- ❌ `shouldWork`

---

## 6. Arrange–Act–Assert (AAA) Standard Structure

Every test must follow a clear **Arrange–Act–Assert** visual structure using blank line separators:

```typescript
it('should_reject_login_when_user_is_soft_deleted', async () => {
  // Arrange
  const user = userFactory.create({ deletedAt: new Date() });
  mockUserRepository.findByEmail.mockResolvedValue(user);

  // Act & Assert
  await expect(useCase.execute({ email: user.email, password: 'Password123!' })).rejects.toThrow(
    AccountDisabledException,
  );
  expect(mockSecurityEventPublisher.publishedEvents).toHaveLength(1);
});
```

---

## 7. Factory Pattern (`@kinergy-platform/testing`)

To prevent test setup duplication, all entity instantiation must use shared test factories derived from `TestFactoryBase`:

```typescript
import { UserTestFactory, RoleTestFactory } from '@kinergy-platform/testing';

const userFactory = new UserTestFactory();
const activeUser = userFactory.create({ status: 'ACTIVE' });
const customUser = userFactory.create({ roles: ['ADMIN'], tenantId: 'tenant_enterprise' });
```

Factories automatically generate incrementing sequences for `id` and `email` to guarantee isolation across test cases.

---

## 8. Builder Pattern (`@kinergy-platform/testing`)

For HTTP integration tests and query construction, engineers must use fluent builders:

```typescript
import { HttpRequestBuilder } from '@kinergy-platform/testing';

const request = new HttpRequestBuilder()
  .post('/auth/change-password')
  .withBearerToken(accessToken)
  .withBody({ currentPassword: 'OldPassword123!', newPassword: 'NewPassword456!' })
  .build();
```

---

## 9. Authentication Test Harness Standards

### CRITICAL RULE: Tests MUST NEVER invoke `/auth/login` to obtain access tokens for test setup.

Invoking `/auth/login` during test setup executes expensive Argon2id hashing operations ($64\text{ MB}$, $3$ iterations), slowing down test suites by orders of magnitude.

### Mandatory Pattern: Use `JwtTestFactory` & `SecurityContextTestMock`

```typescript
import { JwtTestFactory, SecurityContextTestMock } from '@kinergy-platform/testing';

// Instant containerless token generation
const mockToken = JwtTestFactory.createMockToken({
  sub: 'usr_test_123',
  roles: ['ADMIN'],
  permissions: ['write:all'],
});

// Mock request context injection
const mockReq = SecurityContextTestMock.createAuthenticatedRequest({
  sub: 'usr_test_123',
  roles: ['ADMIN'],
});
```

---

## 10. Database Lifecycle & Persistence Strategy

- **Isolated Test Database**: Integration tests run against a dedicated PostgreSQL container (`kinergy_test_db`). Never execute tests against development or production databases.
- **Cleanup Strategy**: Use `IDatabaseTestCleaner` (`MockDatabaseTestCleaner` for unit tests, Prisma truncation for integration tests) to purge table data before/after test runs.
- **Transactional Rollbacks**: Prefer running test cases inside database transaction blocks (`prisma.$transaction`) that rollback automatically upon test completion.
- **Fixtures**: Use static fixtures (`adminUserFixture`, `activeUserFixture`) for deterministic database seeding via `DatabaseSeedHelper`.

---

## 11. Mocking Philosophy

- **Mock Infrastructure Ports ONLY**: Mock external I/O, database repositories, network calls, clock providers (`MockClock`), loggers (`MockLogger`), and event publishers (`MockSecurityEventPublisher`).
- **NEVER Mock Business Rules or Domain Entities**: Do NOT mock `User`, `UserStatusStateMachine`, `PasswordPolicyService`, or domain value objects. Test domain objects with real instances.

---

## 12. Assertion Standard Style

Use clear, explicit assertions via Jest/Vitest or `@kinergy-platform/testing` assertion helpers:

```typescript
import { ResultAssertions, EntityAssertions, customTestMatchers } from '@kinergy-platform/testing';

// Functional Result assertions
const value = ResultAssertions.expectOk(domainResult);

// Entity identity comparison
EntityAssertions.expectEqualId(userA, userB);

// Custom matchers
expect(user.id).toBeValidUuid();
```

---

## 13. Shared Testing Platform Package Mandate

### MANDATORY DIRECTIVE: All future bounded contexts (`Employee`, `Client`, `Scheduling`, `Inventory`, `Billing`, `Kitchen`, `Nutrition`, `Payments`, `Notifications`, `Audit Logging`) MUST consume `@kinergy-platform/testing`.

Creating local, module-specific test helpers or duplicating JWT factories inside bounded context folders is **STRICTLY FORBIDDEN**.

---

## 14. Forbidden Anti-Patterns

1. **Duplicated Fixtures**: Redefining user JSON objects inside individual test files instead of using `@kinergy-platform/testing` fixtures/factories.
2. **Magic Values**: Hardcoding magic strings or arbitrary timestamps in tests. Use `RandomTestData` and `MockClock`.
3. **Shared Mutable State**: Modifying shared static objects between test runs. Always re-instantiate factories per test case.
4. **Order-Dependent Tests**: Test case B relying on database state left behind by Test case A.
5. **Testing Private Methods**: Testing private class methods directly. Test public behavior through the class API.
6. **Mocking Domain Behavior**: Writing `jest.fn()` mocks for domain entities or value objects.
7. **Calling `/auth/login` in Test Setup**: Making real HTTP auth calls to set up authentication headers.

---

## 15. Future Architecture & Expansion Guidance

- **Microservices & Event-Driven Testing**: When expanding to asynchronous event brokers (RabbitMQ/Kafka), publish security and domain events to in-memory event buses for assertion via `MockSecurityEventPublisher`.
- **Contract Testing**: Introduce Pact contract testing for REST and gRPC API boundaries between monorepo services and web/mobile clients.
- **Distributed System Tracing**: Inject `correlationId` into `HttpRequestBuilder` descriptors to validate distributed request tracing across future microservices.
