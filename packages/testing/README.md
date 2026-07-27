# @kinergy-platform/testing

## Package Purpose

`@kinergy-platform/testing` is the shared, enterprise-grade Testing Platform package for the Kynergy monorepo workspace. It provides standardized, framework-isolated testing utilities, test factories, mock services, database lifecycle handlers, HTTP request builders, custom assertions, and test fixtures for every current and future bounded context across the monorepo (`Identity`, `Employee`, `Client`, `Scheduling`, `Inventory`, `Billing`, `Kitchen`, `Nutrition`, `Payments`, `Notifications`, `Audit Logging`).

## Public API Overview

| Module       | Exported Utilities                                                      | Purpose                                                                             |
| :----------- | :---------------------------------------------------------------------- | :---------------------------------------------------------------------------------- |
| `auth`       | `JwtTestFactory`, `SecurityContextTestMock`                             | JWT token claim generation, mock security contexts, bearer token string builder.    |
| `builders`   | `HttpRequestBuilder`                                                    | Fluent HTTP request descriptor builder for integration testing.                     |
| `database`   | `IDatabaseTestCleaner`, `MockDatabaseTestCleaner`, `DatabaseSeedHelper` | Database reset handlers, table truncation helpers, role/permission seed data.       |
| `factories`  | `TestFactoryBase`, `UserTestFactory`, `RoleTestFactory`                 | Predictable entity factories with sequence counters and prop override capabilities. |
| `fixtures`   | `adminUserFixture`, `activeUserFixture`, `pendingUserFixture`, etc.     | Pre-configured static domain fixtures.                                              |
| `assertions` | `ResultAssertions`, `EntityAssertions`                                  | Domain result OK/Fail assertions and entity equality checks.                        |
| `helpers`    | `RepositoryMockFactory`                                                 | Type-safe Jest mock repository generator (`createMockRepository`).                  |
| `mocks`      | `MockClock`, `MockLogger`, `MockSecurityEventPublisher`                 | In-memory mocks for platform infrastructure services.                               |
| `matchers`   | `customTestMatchers`                                                    | Custom Jest/Vitest matchers (`toBeValidUuid`, `toBeWithinDateRange`).               |
| `utils`      | `RandomTestData`                                                        | CSPRNG random emails, UUIDs, dates, and test strings.                               |

## Usage Examples

### Unit Testing a Domain Service with Factories & Mocks

```typescript
import { UserTestFactory, MockClock, MockLogger } from '@kinergy-platform/testing';

const userFactory = new UserTestFactory();
const user = userFactory.create({ status: 'ACTIVE' });
const clock = new MockClock(new Date('2026-01-01T00:00:00.000Z'));
const logger = new MockLogger();
```

### Integration Testing with Request Builder & JWT Factory

```typescript
import { HttpRequestBuilder, JwtTestFactory } from '@kinergy-platform/testing';

const token = JwtTestFactory.createMockToken({ roles: ['ADMIN'] });
const request = new HttpRequestBuilder()
  .post('/users')
  .withBearerToken(token)
  .withBody({ email: 'new@example.com' })
  .build();
```

## Extension Guidelines

1. **New Bounded Context Integration**: When introducing a new bounded context (e.g., `Employee`), add dedicated entity factories (e.g. `EmployeeTestFactory`) in `packages/testing/src/factories/` and re-export via `src/index.ts`.
2. **Zero Business Logic**: `packages/testing` must remain 100% free of application business rules. It contains test utilities and mocks only.
