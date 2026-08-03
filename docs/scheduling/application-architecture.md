# Scheduling Application Layer Architecture & CQRS Pattern

## Overview

The Application Layer inside `packages/core/src/scheduling/application` orchestrates use cases, handles commands and queries, enforces application-level validation rules, and maps domain aggregates to read DTOs.

```
                  +-----------------------------------------------+
                  |               Presentation Layer              |
                  |          (HTTP REST / GraphQL / CLI)          |
                  +-----------------------+-----------------------+
                                          |
                                          v
                  +-----------------------+-----------------------+
                  |           Application Layer Core              |
                  |                                               |
                  |  +-----------------+     +-----------------+  |
                  |  |  Command DTOs   |     |   Query DTOs    |  |
                  |  +--------+--------+     +--------+--------+  |
                  |           |                       |           |
                  |           v                       v           |
                  |  +--------+--------+     +--------+--------+  |
                  |  | Command Handler |     |  Query Handler  |  |
                  |  +--------+--------+     +--------+--------+  |
                  |           |                       |           |
                  |           +-----------+-----------+           |
                  |                       |                       |
                  |                       v                       |
                  |            [ ApplicationResult<T, E> ]        |
                  +-----------------------+-----------------------+
                                          |
                                          v
                  +-----------------------+-----------------------+
                  |               Domain Layer Core               |
                  |  (Aggregates / Value Objects / Specifications)|
                  +-----------------------------------------------+
```

---

## Directory Hierarchy

```
packages/core/src/scheduling/application/
├── appointment/
│   ├── commands/       # Command payloads (CreateAppointmentCommand, RescheduleCommand, etc.)
│   ├── queries/        # Query payloads (GetAppointmentByIdQuery, SearchSlotsQuery, etc.)
│   ├── dtos/           # Pure TypeScript read DTOs (AppointmentDTO, AppointmentNoteDTO, etc.)
│   ├── handlers/       # Command/Query handler implementations
│   └── mappers/        # Pure converters (AppointmentMapper)
├── shared/             # Base CQRS contracts (Command, CommandHandler, ApplicationResult)
└── common/             # Common cross-cutting application utilities
```

---

## Key Design Patterns & Guidelines

### 1. CQRS (Command Query Responsibility Segregation)

- **Commands**: Represent intent to mutate state. Must implement `Command` (`commandId`, `timestamp`). Handlers return `Promise<ApplicationResult<T, E>>`.
- **Queries**: Represent request to read data without side effects. Handlers fetch data directly or via CQRS read models.

### 2. Functional Error Handling (`ApplicationResult<T, E>`)

- Expected business validation errors (e.g., booking window lead-time violation, room conflict) return a `ApplicationResult.fail(error)` container rather than throwing runtime exceptions.
- Prevents standard exception control-flow overhead and guarantees explicit, typed error branches.

### 3. DTO Mapping (`AppointmentMapper`)

- `AppointmentMapper.toDTO(appointment)` converts mutable Domain Aggregate Roots into frozen read-only `AppointmentDTO` instances for Presentation consumption.
- Domain Entities are never leaked directly to external API callers.
