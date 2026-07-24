# Architectural Patterns & Design Decisions

This document details core architectural patterns applied across the Kinergy Platform monorepo.

---

## 1. Dependency Inversion Principle (DIP)

High-level domain and application use cases **never depend directly** on low-level infrastructure details (database ORMs, external APIs, logger frameworks). Instead, both depend on abstract **interface ports**.

```mermaid
graph TD
    subgraph Application Layer
        UC[CreateResourceUseCase]
        PORT[IRepository Interface]
    end

    subgraph Infrastructure Layer
        ADAPTER[PrismaResourceRepository]
        DB[(PostgreSQL)]
    end

    UC --> PORT
    ADAPTER -.->|Implements| PORT
    ADAPTER --> DB
```

---

## 2. Generic Repository Pattern

Repositories encapsulate the logic required to access domain aggregates. The application layer consumes generic repository port interfaces (`IRepository<T>`), allowing infrastructure adapters to fulfill persistence operations transparently.

```mermaid
classDiagram
    class IRepository~T~ {
        <<interface>>
        +findById(id: string): Promise~T | null~
        +findAll(): Promise~T[]~
        +save(entity: T): Promise~void~
        +delete(id: string): Promise~void~
    }

    class PrismaRepository~T~ {
        -prismaService: PrismaService
        +findById(id: string): Promise~T | null~
        +findAll(): Promise~T[]~
        +save(entity: T): Promise~void~
        +delete(id: string): Promise~void~
    }

    PrismaRepository ..|> IRepository
```

---

## 3. CQRS (Command Query Responsibility Segregation) Alignment

The architecture prepares for **Command Query Responsibility Segregation (CQRS)** by separating mutation state flows (Commands) from read-only data fetching (Queries).

```mermaid
graph LR
    subgraph Write Path - Commands
        CMD[Command Request] --> CMD_UC[Command UseCase]
        CMD_UC --> AGG[Aggregate Root]
        AGG --> REPO[Repository Save]
        REPO --> DB_WRITE[(PostgreSQL Write)]
    end

    subgraph Read Path - Queries
        QRY[Query Request] --> QRY_UC[Query UseCase]
        QRY_UC --> DTO[Read DTO Projection]
        DTO --> DB_READ[(PostgreSQL Read)]
    end
```

### Rationale

- **Commands**: Alter domain state, enforce business invariants through Aggregate Roots, record domain events, and return `Result<void, E>`.
- **Queries**: Bypasses heavy domain entity instantiation for fast read-only projections, returning optimized DTO payloads.

---

## 4. Architectural Decision Records (ADR) Methodology

Every significant architectural, framework, or structural decision in the Kinergy Platform is recorded as a numbered markdown document in `docs/adr/`.

### ADR Workflow

1. **Identify Decision**: When introducing structural changes or tool choices.
2. **Author ADR**: Create `docs/adr/NNNN-title.md` detailing Context, Decision Drivers, Outcome, and Consequences.
3. **Register Index**: Append to the ADR index table in `docs/adr/README.md`.
