# Kinergy Platform

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue)
![Architecture](https://img.shields.io/badge/Architecture-Clean%20%2F%20DDD-green)
![Monorepo](https://img.shields.io/badge/Monorepo-Nx-blueviolet)

Welcome to the **Kinergy Platform** repository. Kinergy Platform is an enterprise energy and sustainability management system built with an Nx monorepo architecture adhering to **Clean Architecture**, **Domain-Driven Design (DDD)**, and **SOLID** principles.

---

## 🏛️ Architecture Overview

The repository is structured to separate concerns cleanly across domain, application, infrastructure, and presentation layers.

```
                  ┌─────────────────────────────────────┐
                  │      Presentation Layer             │
                  │   (Apps, Controllers, UI Views)     │
                  └──────────────────┬──────────────────┘
                                     │ orchestrates
                                     ▼
                  ┌─────────────────────────────────────┐
                  │      Application Layer              │
                  │    (Use Cases, DTOs, Ports)         │
                  └──────────┬──────────────────▲───────┘
                             │                  │
               uses entities │                  │ implements
                             ▼                  │ interfaces
┌──────────────────────────────────────┐  ┌─────┴─────────────────────────────────┐
│            Domain Layer              │  │       Infrastructure Layer            │
│  (Entities, Value Objects, Rules)    │  │  (DB Repos, External APIs, Adapters)  │
│      * Framework Agnostic *          │  │                                       │
└──────────────────────────────────────┘  └───────────────────────────────────────┘
```

### Core Design Principles

1. **Framework-Agnostic Domain:** Core business rules reside in the domain layer without external framework dependencies (NestJS, React, TypeORM, etc.).
2. **Dependency Inversion:** Infrastructure adapters implement interfaces defined by the Domain and Application layers. Infrastructure depends on domain, never the reverse.
3. **Strict TypeScript & No `any`:** `strict: true` is enforced across all libraries. The `any` type is strictly forbidden.
4. **Composition over Inheritance:** High modularity through functional composition and explicit interface contracts.
5. **Thin Controllers:** Controllers only orchestrate incoming HTTP/gRPC requests by dispatching execution to application use cases.

---

## 📁 Repository Structure

```
kinergy-platform/
├── .github/              # GitHub templates, CI actions, and CODEOWNERS
│   └── CODEOWNERS        # Repository ownership mappings
├── apps/                 # Monorepo applications (Frontend, API services, Workers)
├── libs/                 # Domain modules and shared libraries
│   ├── domain/           # Core domain models and business logic libraries
│   ├── application/      # Application use cases and port definitions
│   ├── infrastructure/   # Database repositories and external integrations
│   └── shared/           # Cross-cutting utilities and shared types
├── docs/                 # Platform documentation
│   └── adr/              # Architecture Decision Records
│       ├── README.md
│       ├── 0001-record-architecture-decisions.md
│       └── 0002-nx-monorepo-clean-architecture-ddd.md
├── .gitignore            # Git ignore definitions
├── CHANGELOG.md          # Release history and unreleased changes
├── CONTRIBUTING.md       # Engineering standards & contribution process
├── LICENSE               # MIT License
├── README.md             # Project overview and entry point
└── SECURITY.md           # Security policy & vulnerability reporting
```

---

## 📖 Architectural Decision Records (ADRs)

Key architectural decisions are documented under [`docs/adr/`](file:///c:/Projects/kinergy-platform/docs/adr/):

- [ADR 0001: Record Architecture Decisions](file:///c:/Projects/kinergy-platform/docs/adr/0001-record-architecture-decisions.md)
- [ADR 0002: Nx Monorepo Architecture with Clean Architecture and Domain-Driven Design](file:///c:/Projects/kinergy-platform/docs/adr/0002-nx-monorepo-clean-architecture-ddd.md)

---

## 🤝 Contributing & Engineering Standards

Please read [`CONTRIBUTING.md`](file:///c:/Projects/kinergy-platform/CONTRIBUTING.md) for detailed guidelines on:
- Domain-Driven Design conventions
- Clean Architecture layer boundaries
- Strict TypeScript rules
- Commit message formatting (Conventional Commits)
- Unit testing requirements

---

## 🛡️ Security

For security vulnerabilities and reporting guidelines, see [`SECURITY.md`](file:///c:/Projects/kinergy-platform/SECURITY.md).

---

## 📄 License

This project is licensed under the MIT License - see the [`LICENSE`](file:///c:/Projects/kinergy-platform/LICENSE) file for details.
