# 33. Reusable Testing Platform Package Architecture

- **Status:** Accepted
- **Date:** 2026-07-27

## Context and Problem Statement

As the Kynergy monorepo expands from the Identity foundation into future business domain modules (`Employee`, `Client`, `Scheduling`, `Inventory`, `Billing`, `Kitchen`, `Nutrition`, `Payments`, `Notifications`, `Audit Logging`), duplicating authentication helpers, mock services, test factories, database reset logic, and HTTP request builders across individual modules causes architectural drift, inconsistent test quality, and maintenance overhead.

## Decision Drivers

- **Workspace Reuse**: A shared, enterprise workspace package (`packages/testing` exported as `@kinergy-platform/testing`) must serve as the single testing platform foundation across all monorepo modules.
- **Zero Business Logic**: The testing platform must contain zero business domain logic. It encapsulates test utilities, JWT factories, mock clocks/loggers, database reset handlers, request builders, and entity factories only.
- **Strict Framework Independence**: Test factories and domain assertions operate on pure TypeScript domain models without requiring NestJS application containers or live database connections for unit tests.
- **Scalable Architecture**: Standardized folder structure (`auth/`, `builders/`, `database/`, `factories/`, `fixtures/`, `assertions/`, `helpers/`, `mocks/`, `matchers/`, `utils/`).

## Decision Outcome

Chosen Option: **Shared Workspace Library `packages/testing` (`@kinergy-platform/testing`)**.

### Package Architecture Diagram

```
packages/testing/src/
├── auth/         # JwtTestFactory, SecurityContextTestMock
├── assertions/   # ResultAssertions, EntityAssertions
├── builders/     # HttpRequestBuilder
├── database/     # DatabaseTestCleaner, DatabaseSeedHelper
├── factories/    # TestFactoryBase, UserTestFactory, RoleTestFactory
├── fixtures/     # adminUserFixture, activeUserFixture, etc.
├── helpers/      # RepositoryMockFactory
├── matchers/     # customTestMatchers
├── mocks/        # MockClock, MockLogger, MockSecurityEventPublisher
├── utils/        # RandomTestData
└── index.ts      # Master Barrel Export
```

## Consequences

### Positive

- Standardized, zero-duplication testing experience across all workspace bounded contexts.
- Fast, containerless unit tests leveraging pure domain entity factories and mock platform infrastructure (`MockClock`, `MockLogger`).
- Single point of maintenance for JWT claims, security context mocks, and database cleanup routines.
- 100% unit test coverage validating the testing platform itself.
