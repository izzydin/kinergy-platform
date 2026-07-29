# Enterprise Testing Strategy & Quality Gate Guide

- **Status:** Accepted
- **Engine:** Jest / Vitest / `@kinergy/testing`
- **Scope:** Unit Tests, Integration Tests, End-to-End (E2E) Tests, Quality Gates

---

## 1. Overview & Philosophy

The Kinergy Platform testing architecture is designed around **pure domain behavior verification, containerless speed, strict infrastructure isolation, and automated quality gates**.

We implement a three-tiered testing strategy:

```
           ▲
          / \
         /   \      E2E Tests (Supertest / Fastify)
        / E2E \     - Complete API Endpoint Workflows & Auth Guards
       /-------\
      / Integr. \   Integration Tests (Prisma / Testcontainers)
     /-----------\  - DB Persistence, Transactions, & Subsystems
    /  Unit Tests \ Unit Tests (Pure Domain Kernel)
   /---------------\- Mocked I/O, Instant Execution, 100% Deterministic
```

---

## 2. Reusable Testing Platform (`@kinergy/testing`)

All test suites leverage the shared `@kinergy/testing` workspace package to eliminate boilerplate code.

### 2.1 Single-Line Authentication Test Harness

```typescript
import { auth, createOwner, createTrainer } from '@kinergy/testing';

// Inject authenticated identity context cleanly into test requests
const request = auth(createOwner()).get('/api/v1/users').build();
```

### 2.2 Domain Entity Testing & Assertions

```typescript
import { UserTestFactory, EntityAssertions } from '@kinergy/testing';
import { User, UserStatus } from '../user.entity';

const factory = new UserTestFactory();
const user = new User(factory.create({ status: UserStatus.ACTIVE }));
```

---

## 3. Comprehensive Subsystem Edge Case Matrix

| Component                       | Tested Edge Cases                                                                                                                | Validation Result |
| :------------------------------ | :------------------------------------------------------------------------------------------------------------------------------- | :---------------- |
| **`User` Aggregate Root**       | Soft-deleted immutability, invalid password hash changes, token version incrementing, session revocation.                        | **100% PASS**     |
| **`UserStatusStateMachine`**    | Illegal state transitions (e.g. `BLOCKED` $\rightarrow$ `INACTIVE`), authentication eligibility filtering.                       | **100% PASS**     |
| **`LoginUseCase`**              | Unknown email, invalid password, `PENDING` status rejection, `INACTIVE` status rejection, timing attack constant-time execution. | **100% PASS**     |
| **`ChangePasswordUseCase`**     | Incorrect current password, identical password reuse, complexity policy failures, token revocation.                              | **100% PASS**     |
| **`ResetPasswordUseCase`**      | Admin-initiated CSPRNG temporary password generation, mandatory password change flag.                                            | **100% PASS**     |
| **`RefreshTokenService`**       | Expired tokens, revoked family tokens, replay attack detection & security alert generation.                                      | **100% PASS**     |
| **`AuthorizationGuard`**        | Role evaluation, permission checking, public route bypassing (`@Public()`), request context extraction.                          | **100% PASS**     |
| **`LoggerAuditEventPublisher`** | Structured JSON formatting, low/medium/high/critical severity dispatch.                                                          | **100% PASS**     |
| **`SecurityAuditHookService`**  | Conversion of domain security events into normalized `IAuditEvent` structures.                                                   | **100% PASS**     |

---

## 4. Test Execution & Quality Gate Pipeline

Run all test suites and quality gate validations using pnpm scripts:

```bash
# Run unit and integration tests across the API app
npx nx test api

# Execute complete workspace validation (Prettier, ESLint, Typecheck, Tests, Builds)
pnpm validate
```

---

## 5. Related Testing Specifications

- [Integration Testing Strategy](file:///c:/Projects/kinergy-platform/docs/testing/integration-testing-strategy.md)
- [End-to-End Testing Strategy](file:///c:/Projects/kinergy-platform/docs/testing/e2e-testing-strategy.md)
- [Technical Quality Report](file:///c:/Projects/kinergy-platform/docs/testing/technical-quality-report.md)
