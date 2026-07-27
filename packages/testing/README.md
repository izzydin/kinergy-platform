# @kinergy-platform/testing

## Package Purpose

`@kinergy-platform/testing` is the shared, enterprise-grade Testing Platform package for the Kynergy monorepo workspace. It provides standardized, framework-isolated testing utilities, persona test factories, containerless authentication harnesses, mock infrastructure services, database lifecycle handlers, HTTP request builders, custom assertions, and test fixtures for every current and future bounded context across the monorepo (`Identity`, `Employee`, `Client`, `Scheduling`, `Inventory`, `Billing`, `Kitchen`, `Nutrition`, `Payments`, `Notifications`, `Audit Logging`).

---

## Public API Overview

| Module           | Exported Utilities                                                                                                                             | Purpose                                                                                            |
| :--------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------- |
| **`auth`**       | `auth()`, `AuthenticatedRequestBuilder`, `JwtTestFactory`, `AuthContextBuilder`, `SecurityContextTestMock`                                     | Containerless `auth(user)` request harness, signed JWT generation, auth context building.          |
| **`factories`**  | `createOwner()`, `createTrainer()`, `createReceptionist()`, `createKitchenStaff()`, `createClientUser()`, `UserTestFactory`, `RoleTestFactory` | Deterministic persona entity factories with sequence counters and prop overrides.                  |
| **`builders`**   | `HttpRequestBuilder`                                                                                                                           | Fluent HTTP request descriptor builder for integration testing.                                    |
| **`database`**   | `IDatabaseTestCleaner`, `MockDatabaseTestCleaner`, `DatabaseSeedHelper`                                                                        | Database reset handlers, table truncation helpers, role/permission seed data.                      |
| **`fixtures`**   | `adminUserFixture`, `activeUserFixture`, `pendingUserFixture`, `blockedUserFixture`                                                            | Pre-configured static domain fixtures.                                                             |
| **`assertions`** | `AuthAssertions`, `ResultAssertions`, `EntityAssertions`                                                                                       | HTTP auth status assertions (`expectAuthenticated`, `expectForbidden`), Result OK/Fail assertions. |
| **`helpers`**    | `RepositoryMockFactory`                                                                                                                        | Type-safe Jest mock repository generator (`createMockRepository`).                                 |
| **`mocks`**      | `MockClock`, `MockLogger`, `MockSecurityEventPublisher`                                                                                        | In-memory mocks for platform infrastructure services.                                              |
| **`matchers`**   | `customTestMatchers`                                                                                                                           | Custom Jest/Vitest matchers (`toBeValidUuid`, `toBeWithinDateRange`).                              |
| **`utils`**      | `RandomTestData`                                                                                                                               | CSPRNG random emails, UUIDs, dates, and test strings.                                              |

---

## Usage Examples

### 1. Single-Line Containerless Authentication Test Harness (`auth(user)`)

> **CRITICAL ARCHITECTURAL RULE**: Tests MUST NEVER perform HTTP requests to `POST /auth/login` for test setup. Use `auth(user)` for instant, zero-overhead test authentication.

```typescript
import { auth, createOwner, createTrainer, createReceptionist } from '@kinergy-platform/testing';

// Owner Request
const owner = createOwner();
const ownerRequest = auth(owner).get('/clients').build();

// Trainer Request
const trainer = createTrainer();
const trainerRequest = auth(trainer).post('/workouts').withBody({ name: 'HIIT' }).build();

// Receptionist Request
const receptionist = createReceptionist();
const receptionistHeaders = auth(receptionist).headers();
```

### 2. Custom Persona Overrides & Factories

```typescript
import { createTrainer, createClientUser } from '@kinergy-platform/testing';

const trainer = createTrainer({ email: 'lead.trainer@kinergy.local', tenantId: 'tenant_custom' });
const client = createClientUser({ status: 'PENDING' });
```

### 3. Unit Testing a Domain Service with Factories & Mocks

```typescript
import { UserTestFactory, MockClock, MockLogger } from '@kinergy-platform/testing';

const userFactory = new UserTestFactory();
const user = userFactory.create({ status: 'ACTIVE' });
const clock = new MockClock(new Date('2026-01-01T00:00:00.000Z'));
const logger = new MockLogger();
```

---

## Extension Guidelines for Future Bounded Contexts

1. **New Bounded Context Integration**: When introducing a new bounded context (e.g., `Inventory`), add dedicated domain factories (e.g. `InventoryItemTestFactory`) in `packages/testing/src/factories/` and re-export via `src/index.ts`.
2. **Zero Business Logic**: `packages/testing` must remain 100% free of application business rules. It contains test utilities and mocks only.
