# Kinergy Platform - Architecture Documentation

Welcome to the technical architecture documentation for the **Kinergy Platform**. This monorepo is engineered following **Clean Architecture**, **Domain-Driven Design (DDD)**, and **SOLID principles** inside an **Nx integrated monorepo**.

---

## High-Level System Architecture

```mermaid
graph TD
    subgraph Client Layer
        WEB[React + Vite Web App<br/>apps/web]
    end

    subgraph API Gateway / Presentation Layer
        API[NestJS REST API<br/>apps/api]
    end

    subgraph Bounded Contexts Layer
        BC1[Energy Monitoring Context]
        BC2[Asset Management Context]
        BC3[Analytics Context]
    end

    subgraph Shared Domain Kernel
        KERNEL[Domain Kernel Primitives<br/>Entity, AggregateRoot, ValueObject, Result]
    end

    subgraph Enterprise Platform Layer
        PERSIST[Prisma Persistence]
        IDENT[Identity Context Service]
        LOG[Platform Logger Service]
        AUDIT[Audit Service]
    end

    subgraph Database Infrastructure
        DB[(PostgreSQL 16)]
    end

    WEB -->|HTTP / JSON| API
    API --> BC1
    API --> BC2
    API --> BC3
    BC1 --> KERNEL
    BC2 --> KERNEL
    BC3 --> KERNEL
    BC1 --> PERSIST
    BC2 --> PERSIST
    BC3 --> PERSIST
    PERSIST --> DB
    API --> IDENT
    API --> LOG
    API --> AUDIT
```

---

## Architecture Navigation

1. **[System Architecture Guide](./system-architecture.md)**
   - Clean Architecture layer boundaries (Domain, Application, Infrastructure, Presentation).
   - Monorepo directory structure mapping.
   - Request flow execution sequence diagrams.
2. **[Domain-Driven Design Strategy](./domain-driven-design.md)**
   - Tactical DDD patterns (`Entity`, `AggregateRoot`, `ValueObject`, `IDomainEvent`, `Result`).
   - Shared Domain Kernel specification.
   - Aggregate boundary isolation rules.
3. **[Bounded Contexts & Platform Layer](./bounded-contexts.md)**
   - Bounded context decoupling and context mapping.
   - Enterprise Platform Infrastructure (`Identity`, `Logging`, `Audit`, `Persistence`).
   - Cross-cutting concern dependency injection.
4. **[Architectural Patterns & Decisions](./patterns-and-decisions.md)**
   - Dependency Inversion Principle (DIP) & Port-Adapter architecture.
   - Generic Repository Pattern (`IRepository<T>`).
   - CQRS (Command Query Responsibility Segregation) decision alignment.
   - Architectural Decision Record (ADR) methodology.
5. **[Identity Bounded Context Architecture](./identity-domain-model.md)**
   - Single authoritative specification for Identity Aggregate, account lifecycle, RBAC/ABAC, Clean Architecture layering, and downstream context integration.
