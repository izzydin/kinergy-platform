# Identity Integration Testing Strategy & Architecture

- **Author:** Principal Quality Engineer
- **Target Subsystem:** `platform/identity`
- **Scope:** End-to-End Component Collaboration (Application Use Cases $\rightarrow$ Domain $\rightarrow$ Persistence $\rightarrow$ Authorization $\rightarrow$ Password Management)

---

## 1. Overview & Strategy

Integration testing in the Kynergy platform validates the **seamless collaboration** between all Clean Architecture layers within a bounded context.

Unlike isolated unit tests that verify single classes or functions, integration test suites validate complete end-to-end user workflows:

1. **User Administration CRUD & Search Indexing**: Account creation, role updates, deactivation, search filters, and soft-delete immutability.
2. **Argon2id Authentication & Token Rotation Lifecycle**: Real memory-hard password verification, access/refresh token signing, refresh token rotation, replay attack detection, and logout session purging.
3. **Password Management**: Secure user password changes, admin-initiated CSPRNG temporary password generation, token version incrementing, and event publishing.
4. **Authorization Engine**: Role evaluation, permission resolution, wildcard permission checks, and decorator context propagation.

---

## 2. Integration Test Workflows & Edge Cases Validated

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    IDENTITY INTEGRATION WORKFLOWS                       │
│                                                                         │
│  ┌─────────────────────────┐           ┌─────────────────────────────┐  │
│  │   ADMINISTRATION CRUD   │           │    AUTHENTICATION ENGINE    │  │
│  │ - Create / Update / Search│         │ - Real Argon2id Verification│  │
│  │ - Activate / Deactivate │ ────────► │ - Token Rotation & Replay   │  │
│  │ - Soft Delete           │           │ - Multi-Device Logout       │  │
│  └─────────────────────────┘           └──────────────┬──────────────┘  │
│                                                       │                 │
│                                                       ▼                 │
│  ┌─────────────────────────┐           ┌─────────────────────────────┐  │
│  │   PASSWORD MANAGEMENT   │           │     AUTHORIZATION ENGINE      │  │
│  │ - User Password Change  │           │ - DefaultPermissionResolver │  │
│  │ - CSPRNG Temp Reset     │           │ - DefaultAuthorizationEval  │  │
│  └─────────────────────────┘           └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

| Workflow                                  | Integrated Components                                                                                                                                                | Verification Outcome                                                                                                     |
| :---------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| **Workflow 1: User Administration**       | `CreateUserUseCase`, `UpdateUserUseCase`, `DeactivateUserUseCase`, `DeleteUserUseCase`, `SearchUsersUseCase`, `InMemoryUserRepository`.                              | **PASSED**: Validated email search, role changes, deactivation, and soft delete index filtering.                         |
| **Workflow 2: Authentication & Rotation** | `LoginUseCase`, `RefreshTokenUseCase`, `LogoutUseCase`, `Argon2PasswordHasher`, `JwtTokenFactory`, `Sha256TokenHasher`, `AccessTokenService`, `RefreshTokenService`. | **PASSED**: Validated real Argon2id password verification, sliding-window token rotation, and session purging on logout. |
| **Workflow 3: Password Management**       | `ChangePasswordUseCase`, `ResetPasswordUseCase`, `TemporaryPasswordGeneratorService`, `PasswordPolicyService`.                                                       | **PASSED**: Validated CSPRNG temporary password generation, password complexity checks, and security event publishing.   |
| **Workflow 4: Authorization Engine**      | `DefaultAuthorizationEvaluator`, `DefaultPermissionResolver`, `@kinergy/testing` persona fixtures (`createOwner`, `createTrainer`).                                  | **PASSED**: Validated wildcard role permission resolution and RBAC access rule evaluation.                               |

---

## 3. Database & Fixture Lifecycle Guidelines

1. **Deterministic State Reset**: Integration test suites must wipe repository state (`clear()`) inside `beforeEach()` blocks to prevent cross-test contamination.
2. **Containerless Testing Harness**: Use `@kinergy/testing` persona factories (`createOwner`, `createTrainer`, `createReceptionist`) to generate deterministic test data without invoking HTTP login endpoints.
3. **External Dependencies Only**: Internal application services, domain state machines, and repositories interact naturally. Only external I/O (loggers, telemetry events, email notification queues) are mocked via `MockLogger` and `MockSecurityEventPublisher`.
