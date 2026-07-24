# Contributing to Kinergy Platform

Thank you for your interest in contributing to the **Kinergy Platform**! We welcome contributions that adhere to our architectural standards and quality requirements.

---

## 1. Architectural & Engineering Standards

The Kinergy Platform follows strict engineering guidelines to maintain high maintainability, testability, and long-term scalability across an Nx monorepo.

### 🏛️ Clean Architecture & Domain-Driven Design (DDD)

1. **Domain Layer (Framework-Agnostic)**
   - Contains Domain Entities, Value Objects, Domain Events, and Repository Interfaces.
   - **MUST be completely framework-agnostic** (no imports from Express, NestJS, React, database ORMs, etc.).
   - Contains core business rules and logic.

2. **Application Layer**
   - Contains Use Cases, Application Services, DTOs, and Port Interfaces.
   - Orchestrates domain entities to fulfill application use cases.
   - Contains application workflow logic (no raw infrastructure details).

3. **Infrastructure Layer**
   - Implements ports/interfaces defined by Domain and Application layers (e.g., database repositories, external API clients, messaging adapters).
   - **Infrastructure depends on Domain/Application, NEVER the reverse.**

4. **Presentation / Delivery Layer (Controllers, UI)**
   - Controllers and UI components **only orchestrate requests** and delegate execution to Application Use Cases.
   - Controllers must be thin and perform zero business validation or state mutation logic.

### 📐 Design Principles & Coding Guidelines

- **SOLID Principles:** Enforce Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, and Dependency Inversion across all libraries.
- **Composition over Inheritance:** Prefer functional composition and interface implementation over class inheritance hierarchies.
- **Strict TypeScript:**
  - `strict: true` must be enabled across all projects.
  - **NEVER use `any`.** Use `unknown`, generics, or explicit domain/value types.
  - Avoid type assertions (`as Type`) unless strictly necessary and documented.
- **Dependency Injection (DI):**
  - All application services and infrastructure adapters must be injected via interfaces/tokens rather than instantiating dependencies directly.
- **Granular Components:** Prefer small, focused classes and single-purpose pure functions.
- **Barrel Exports:** Expose public APIs of libraries using clean `index.ts` barrel exports. Keep internal implementation details private to the library scope.

---

## 2. Development Workflow & Git Practices

### Branching Strategy

- Default Branch: `main`
- Feature Branches: `feature/<short-description>` or `feat/<short-description>`
- Bug Fix Branches: `fix/<short-description>`
- Architecture/Docs Branches: `docs/<short-description>` or `refactor/<short-description>`

### Commit Conventions (Conventional Commits)

All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat(domain-energy): add energy telemetry value object`
- `fix(infra-db): resolve connection pool timeout`
- `docs(adr): document module boundary rules`
- `test(app-telemetry): add unit tests for process telemetry use case`

---

## 3. Testing & Verification Requirements

- **Domain Logic:** 100% unit test coverage required for domain entities, value objects, and domain services.
- **Quality Checks:** All PRs must pass:
  - Type checking (`tsc --noEmit`)
  - Linting rules
  - Automated unit test suite execution
  - Successful workspace build

---

## 4. Architecture Decision Records (ADRs)

If your contribution introduces an architectural change, new module dependency boundary, or core technology adoption:

1. Create a new ADR in [docs/adr/](file:///c:/Projects/kinergy-platform/docs/adr/) following the established format.
2. Link the new ADR in your Pull Request description for reviewer evaluation.
