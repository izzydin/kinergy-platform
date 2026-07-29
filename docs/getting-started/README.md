# Kinergy Platform - Developer Onboarding & Getting Started Guide

- **Status:** Active & Production-Hardened Guide
- **Target Audience:** Platform Engineers, Backend Engineers, Frontend Engineers, & Security Reviewers
- **Prerequisites:** Node.js (v20+), pnpm (v9+), Docker & Docker Compose

---

## 1. Project Overview

The **Kinergy Platform** is an enterprise energy and sustainability management system built within an **Nx Integrated Monorepo**. The platform is designed following **Clean Architecture**, **Domain-Driven Design (DDD)**, and **SOLID principles** to deliver a modular, secure, and highly testable multi-tenant SaaS application.

### Key Platform Capabilities

- **Identity & Security (IAM)**: Dual-token JWT authentication, Refresh Token Rotation (RTR), Argon2id memory-hard password hashing, zero-information-disclosure generic errors, and fine-grained RBAC/ABAC authorization.
- **Sustainability & Energy Monitoring**: High-throughput telemetry ingestion, energy asset monitoring, and carbon emission analytics.
- **Enterprise Platform Services**: Decoupled audit logging infrastructure (`IAuditEventPublisher`), AsyncLocalStorage request context propagation (`RequestContext`), and centralized Zod environment validation.

---

## 2. System Architecture & Layer Boundaries

The codebase strictly isolates business logic from external frameworks, database ORMs, and web delivery mechanisms.

```
                  ┌─────────────────────────────────────┐
                  │      Presentation / Delivery Layer  │
                  │   (Controllers, OpenAPI, UI Views)  │
                  └──────────────────┬──────────────────┘
                                     │ orchestrates
                                     ▼
                  ┌─────────────────────────────────────┐
                  │      Application Use Cases Layer    │
                  │    (Use Cases, DTOs, Ports/Interfaces)│
                  └──────────┬──────────────────▲───────┘
                             │                  │
               uses entities │                  │ implements
                             ▼                  │ interfaces
┌──────────────────────────────────────┐  ┌─────┴─────────────────────────────────┐
│            Domain Layer              │  │       Infrastructure Layer            │
│  (Entities, Value Objects, Invariants)│  │  (Prisma Repos, Argon2id, JWT, Audit) │
│      * Pure Framework-Agnostic *     │  │                                       │
└──────────────────────────────────────┘  └───────────────────────────────────────┘
```

### Architectural Layering Rules

1. **Domain Layer (`domain/`)**: Pure TypeScript entities, value objects, domain events, and domain repository interfaces. **Zero external dependencies** on NestJS, Prisma, React, or Express.
2. **Application Layer (`use-cases/`)**: Use cases orchestrate domain entities and interact with ports (interfaces). Thin orchestrators containing workflow logic.
3. **Infrastructure Layer (`infrastructure/` & `platform/`)**: Adapters implementing domain and application ports (e.g. `PrismaUserRepository`, `Argon2PasswordHasher`, `LoggerAuditEventPublisher`). Infrastructure depends on Domain/Application; the reverse is strictly prohibited.
4. **Presentation Layer (`apps/api` & `apps/web`)**: NestJS controllers and React components. Controllers are thin, performing zero business validation or direct database queries.

---

## 3. Monorepo Structure

The workspace is organized as an Nx integrated monorepo:

```
kinergy-platform/
├── apps/
│   ├── api/              # NestJS REST API Server (Port 3000)
│   └── web/              # React + Vite Web Application (Port 5173)
├── packages/
│   ├── config/           # Centralized Zod envSchema & application config
│   ├── testing/          # Reusable @kinergy/testing harness, factories & mocks
│   ├── types/            # Workspace shared TypeScript interfaces & types
│   ├── ui/               # Reusable React component library
│   ├── utils/            # Framework-agnostic utility functions
│   └── validation/       # InputSanitizer & payload validation primitives
├── docs/                 # Centralized Documentation Hub
│   ├── README.md         # Master Documentation Index
│   ├── getting-started/  # Onboarding & Getting Started Guide (This file)
│   ├── architecture/     # System Architecture & DDD Specifications
│   ├── security/         # Security Architecture & OWASP Specifications
│   ├── testing/          # Enterprise Testing Strategy & Standards
│   ├── configuration/    # Centralized Environment Variables Guide
│   ├── api/              # OpenAPI 3.0 Reference & Specifications
│   ├── adr/              # Architecture Decision Records (0001 - 0040)
│   └── glossary.md       # Ubiquitous Language & Security Glossary
├── prisma/               # PostgreSQL schema & database seed scripts
├── docker-compose.yml    # Local PostgreSQL container orchestration
└── package.json          # Root workspace scripts & pnpm dependencies
```

---

## 4. Development Workflow & Step-by-Step Setup

Follow these steps to launch the local development environment from scratch in less than 5 minutes:

### Step 1: Clone Repository & Install Dependencies

```bash
git clone https://github.com/izzydin/kinergy-platform.git
cd kinergy-platform
pnpm install
```

### Step 2: Configure Environment File

Copy the default environment configuration file:

```bash
cp .env.example .env
```

### Step 3: Launch Docker Infrastructure

Start the local PostgreSQL 16 database container:

```bash
pnpm docker:up
```

### Step 4: Run Prisma Database Migrations & Seeds

Execute database schema migrations and seed default system roles, permissions, and Owner account:

```bash
pnpm prisma:migrate:dev
pnpm prisma:seed
```

### Step 5: Launch Development Servers

Start the API and Web application servers concurrently via Nx:

```bash
pnpm dev
```

- **API Base URL:** `http://localhost:3000/api/v1`
- **Swagger Documentation:** `http://localhost:3000/api/docs`
- **Web App:** `http://localhost:5173`

---

## 5. Testing & Quality Gate Workflow

All code contributions must pass the automated quality gate pipeline before committing.

### 5.1 Running Test Suites

```bash
# Run unit tests across the API application
npx nx test api

# Run unit tests for testing workspace package
npx nx test testing

# Run tests across all workspace packages
nx run-many -t test
```

### 5.2 Executing Automated Quality Gate Pipeline

```bash
pnpm validate
```

`pnpm validate` executes the following sequence:

1. **Prettier Check** (`pnpm format:check`): Verifies code formatting standards.
2. **ESLint Audit** (`nx run-many -t lint`): Enforces linting rules across all 8 workspace projects.
3. **TypeScript Compilation Check** (`nx run-many -t typecheck`): Verifies `strict: true` type safety across all libraries.
4. **Jest Test Suite Execution** (`nx run-many -t test`): Runs all unit and integration test suites.
5. **Production Compilation Build** (`nx run-many -t build`): Verifies zero-error production build across all projects.

---

## 6. Common Command Reference

| Command                   | Action / Purpose                                                       |
| :------------------------ | :--------------------------------------------------------------------- |
| `pnpm dev`                | Starts API (`apps/api`) and Web (`apps/web`) servers concurrently      |
| `pnpm build`              | Compiles production builds for all monorepo applications and libraries |
| `pnpm validate`           | Runs full quality gate pipeline (Format, Lint, Typecheck, Test, Build) |
| `pnpm format`             | Formats all workspace files using Prettier                             |
| `pnpm format:check`       | Verifies code formatting without mutating files                        |
| `pnpm docker:up`          | Starts local PostgreSQL container in detached mode                     |
| `pnpm docker:down`        | Stops and removes local Docker containers                              |
| `pnpm prisma:generate`    | Regenerates Prisma Client TypeScript bindings                          |
| `pnpm prisma:migrate:dev` | Runs database schema migrations in development mode                    |
| `pnpm prisma:seed`        | Seeds database with permissions, roles, and default Owner account      |
| `pnpm prisma:studio`      | Opens interactive Prisma Studio database GUI (`http://localhost:5555`) |

---

## 7. Recommended Reading Order for Onboarding

To become fully productive, onboarding engineers should read documentation in the following order:

```
1. Getting Started Guide ──► 2. System Architecture ──► 3. Security Architecture
                                                                │
5. API Reference Guide  ◄── 4. Enterprise Testing Strategy ◄────┘
         │
         ▼
6. Platform Glossary ────► 7. Architectural Decision Records (ADRs)
```

1. **[Developer Onboarding Guide](file:///c:/Projects/kinergy-platform/docs/getting-started/README.md)** (This document): Local setup, commands, monorepo layout.
2. **[System Architecture Guide](file:///c:/Projects/kinergy-platform/docs/architecture/system-architecture.md)**: Layer boundaries, Clean Architecture rules, DDD patterns.
3. **[Security Architecture Specification](file:///c:/Projects/kinergy-platform/docs/security/README.md)**: Authentication, authorization, password policy, web security.
4. **[Enterprise Testing Strategy](file:///c:/Projects/kinergy-platform/docs/testing/README.md)**: `@kinergy/testing` harness, test pyramid, writing unit/integration/E2E tests.
5. **[API Reference Guide](file:///c:/Projects/kinergy-platform/docs/api/README.md)**: Endpoint catalog, Swagger UI, error envelopes.
6. **[Platform Glossary](file:///c:/Projects/kinergy-platform/docs/glossary.md)**: Ubiquitous Language, domain terminology, security acronyms.
7. **[Architectural Decision Records (ADRs)](file:///c:/Projects/kinergy-platform/docs/adr/README.md)**: Historical log of 40 technical decisions.

---

## 8. Coding Standards & Principles

- **Strict TypeScript (`strict: true`)**: The `any` type is strictly forbidden. Use explicit domain types, value objects, or `unknown`.
- **Dependency Inversion Principle (DIP)**: High-level modules must depend on abstractions (ports/interfaces), never low-level concrete implementations.
- **DTO Input Sanitization**: All incoming HTTP payloads must be sanitized via `InputSanitizer` to remove malicious XSS HTML tags before use case execution.
- **Error Handling via `Result<T>`**: Domain operations return explicit `Result.ok(value)` or `Result.fail(error)` instances rather than throwing uncontrolled exceptions.
- **Thin Controllers**: Controller handlers must only parse requests, delegate execution to application use cases, and return standard DTO envelopes.

---

## 9. Troubleshooting Common Setup Issues

### Issue 1: PostgreSQL Port Conflict (`port 5432 already in use`)

- **Cause**: A local instance of PostgreSQL is already running on port 5432.
- **Solution**: Stop local PostgreSQL service (`sudo service postgresql stop` or stop via Services MMC on Windows) or change PostgreSQL port mapping in `docker-compose.yml`.

### Issue 2: `SecurityConfigurationException: JWT_ACCESS_SECRET is required in production`

- **Cause**: Running with `NODE_ENV=production` while using default developer secret fallback.
- **Solution**: Set custom secret string $\ge 32$ characters in `.env` or set `NODE_ENV=development`.

### Issue 3: Prisma Migration Drift / Database Inconsistency

- **Cause**: Local database state is out of sync with Prisma schema changes.
- **Solution**: Reset local database cleanly:
  ```bash
  npx prisma migrate reset --force
  pnpm prisma:seed
  ```

---

## 10. Master Documentation Index Access

For deep dives into specific topics, access the master index at **[docs/README.md](file:///c:/Projects/kinergy-platform/docs/README.md)**.
