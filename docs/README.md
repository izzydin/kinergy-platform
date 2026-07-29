# Kinergy Platform - Master Documentation Index

Welcome to the centralized documentation hub for the **Kinergy Platform**. This platform is engineered following **Clean Architecture**, **Domain-Driven Design (DDD)**, and **SOLID principles** within an **Nx Integrated Monorepo**.

---

## 📚 Documentation Map

```
docs/
├── getting-started/      ◄── Onboarding, Local Setup & Quick Start
├── architecture/         ◄── System Overview, C4 Models, Clean Architecture & DDD
├── security/             ◄── OWASP Specifications, Auth, Tokens, Web Security & Audit
├── testing/              ◄── Quality Gates, Harnesses, Unit, Integration & E2E Testing
├── configuration/        ◄── Centralized Zod Environment Variables & Secrets Reference
├── api/                  ◄── OpenAPI / Swagger Docs, Envelope Schemas & Routes
├── adr/                  ◄── Architectural Decision Records (0001 - 0040)
└── glossary.md           ◄── Ubiquitous Language, Security Acronyms & Terminology
```

---

## 🚀 Quick Navigation

### 1. Developer Onboarding & Local Setup

- **[Getting Started Guide](file:///c:/Projects/kinergy-platform/docs/getting-started/README.md)**: Dependencies, local Docker container execution, database seeding, and development server launch.
- **[Platform Glossary](file:///c:/Projects/kinergy-platform/docs/glossary.md)**: Definitions for domain concepts, security acronyms, and technical terminology.

### 2. Architecture & Design

- **[System Architecture Guide](file:///c:/Projects/kinergy-platform/docs/architecture/system-architecture.md)**: Layer boundaries (Domain, Application, Infrastructure, Presentation) and request execution sequence diagrams.
- **[Domain-Driven Design Strategy](file:///c:/Projects/kinergy-platform/docs/architecture/domain-driven-design.md)**: Shared Kernel primitives (`Entity`, `ValueObject`, `Result`), aggregate boundaries, and domain rules.
- **[Bounded Contexts](file:///c:/Projects/kinergy-platform/docs/architecture/bounded-contexts.md)**: Identity, User Management, and Sustainability context maps.

### 3. Security Infrastructure

- **[Security Architecture Index](file:///c:/Projects/kinergy-platform/docs/security/README.md)**: Overview of platform security controls.
- **[Authentication Specification](file:///c:/Projects/kinergy-platform/docs/security/authentication.md)**: Dual-token JWT architecture, Refresh Token Rotation (RTR), generic error handling, and Argon2id timing attack defenses.
- **[Authorization Framework](file:///c:/Projects/kinergy-platform/docs/security/authorization.md)**: RBAC/ABAC authorization engine, `@RequirePermissions()` decorators, and permission resolution.
- **[Password Policy](file:///c:/Projects/kinergy-platform/docs/security/password-policy.md)**: Hardened Argon2id parameters, complexity validation, reuse prevention, and CSPRNG temporary password resets.
- **[Web Security, CORS & Helmet](file:///c:/Projects/kinergy-platform/docs/security/web-security-cors-and-headers.md)**: Production Helmet options, OWASP security headers, and environment-driven CORS.
- **[Audit Logging Architecture](file:///c:/Projects/kinergy-platform/docs/security/audit-logging-architecture.md)**: `IAuditEventPublisher` port, `LoggerAuditEventPublisher` adapter, and `SecurityAuditHookService`.

### 4. Testing & Quality Gates

- **[Enterprise Testing Strategy](file:///c:/Projects/kinergy-platform/docs/testing/README.md)**: Testing philosophy, `@kinergy/testing` harness usage, and edge case matrix.
- **[Integration Testing Strategy](file:///c:/Projects/kinergy-platform/docs/testing/integration-testing-strategy.md)**: Multi-layer workflow verification and state isolation guidelines.
- **[End-to-End (E2E) Testing Strategy](file:///c:/Projects/kinergy-platform/docs/testing/e2e-testing-strategy.md)**: Complete HTTP pipeline testing with NestJS and Supertest.
- **[Technical Quality Report](file:///c:/Projects/kinergy-platform/docs/testing/technical-quality-report.md)**: Automated quality gate metrics and 100% test pass verification.

### 5. Environment Configuration & API Reference

- **[Environment Configuration Guide](file:///c:/Projects/kinergy-platform/docs/configuration/README.md)**: Zod `envSchema` variable reference, required secrets, and production fail-fast rules.
- **[API Reference Guide](file:///c:/Projects/kinergy-platform/docs/api/README.md)**: OpenAPI / Swagger setup (`/api/docs`), standard response envelopes (`Result<T>`), and endpoint catalog.

### 6. Architectural Decision Records (ADRs)

- **[ADR Directory Index](file:///c:/Projects/kinergy-platform/docs/adr/README.md)**: Complete log of 40 Architectural Decision Records documenting all major platform design choices.
