# Identity Bounded Context Unit Testing Guide

- **Target Bounded Context:** `platform/identity`
- **Testing Engine:** Jest / `@kinergy-platform/testing`
- **Scope:** Unit Tests, Domain Invariants, Edge Case Matrices

---

## 1. Overview & Philosophy

The unit testing strategy for the Identity bounded context is designed around **pure domain behavior verification, containerless speed, and strict infrastructure isolation**.

All unit test suites mock I/O boundaries (`IUserRepository`, `IPasswordHasher`, `ISecurityEventPublisher`, `ILoggerPort`, `IClock`) while instantiating pure domain entities (`User`), value objects, and domain services (`UserStatusStateMachine`, `PasswordPolicyService`) directly.

---

## 2. Reusable Testing Conventions for Future Modules

### 2.1 Single-Line Authentication Harness

```typescript
import { auth, createOwner, createTrainer } from '@kinergy-platform/testing';

// Containerless header injection
const request = auth(createOwner()).get('/users').build();
```

### 2.2 Domain Entity Unit Testing

```typescript
import { UserTestFactory, EntityAssertions } from '@kinergy-platform/testing';
import { User, UserStatus } from '../user.entity';

const factory = new UserTestFactory();
const user = new User(factory.create({ status: UserStatus.ACTIVE }));
```

---

## 3. Comprehensive Edge Case Matrix Tested

| Component                    | Tested Edge Cases                                                                                                     | Validation Result |
| :--------------------------- | :-------------------------------------------------------------------------------------------------------------------- | :---------------- |
| **`User` Aggregate Root**    | Soft-deleted immutability, invalid password hash changes, token version incrementing, session revocation.             | **100% PASS**     |
| **`UserStatusStateMachine`** | Illegal state transitions (e.g. `BLOCKED` $\rightarrow$ `INACTIVE`), authentication eligibility filtering.            | **100% PASS**     |
| **`LoginUseCase`**           | Unknown email, invalid password, `PENDING` status rejection, `INACTIVE` status rejection, `BLOCKED` status rejection. | **100% PASS**     |
| **`ChangePasswordUseCase`**  | Incorrect current password, identical password reuse, complexity policy failures, token revocation.                   | **100% PASS**     |
| **`ResetPasswordUseCase`**   | Admin-initiated CSPRNG temporary password generation, mandatory password change on login.                             | **100% PASS**     |
| **`RefreshTokenService`**    | Expired tokens, revoked family tokens, replay attack detection & security alert generation.                           | **100% PASS**     |
| **`AuthorizationGuard`**     | Role evaluation, permission checking, public route bypassing (`@Public`), request context extraction.                 | **100% PASS**     |
| **`User Administration`**    | Duplicate email creation, soft deletion, filtering inactive users in pagination search.                               | **100% PASS**     |
