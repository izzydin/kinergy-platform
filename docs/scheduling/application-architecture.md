# Scheduling Application Layer Architecture & CQRS Pattern

## Executive Summary

The Application Layer inside `packages/core/src/scheduling/application` orchestrates use cases, handles commands and queries, enforces application-level validation rules, and maps domain aggregates to read DTOs using CQRS and the Result pattern.

---

## Table of Contents

- [CQRS Overview Diagram](#cqrs-overview-diagram)
- [Directory Hierarchy](#directory-hierarchy)
- [Key Design Patterns & Guidelines](#key-design-patterns--guidelines)

---

## CQRS Overview Diagram

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
                  |            [ ApplicationResult<T> ]           |
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
├── availability/       # Availability & Slot Discovery queries, DTOs, and handlers
├── shared/             # Base CQRS contracts (Command, CommandHandler, ApplicationResult)
└── common/             # Common cross-cutting application utilities
```

---

## Key Design Patterns & Guidelines

### 1. CQRS (Command Query Responsibility Segregation)

- **Commands**: Represent intent to mutate state. Must implement `Command` (`commandId`, `timestamp`). Handlers return `Promise<ApplicationResult<T>>`.
- **Queries**: Represent request to read data without side effects. Handlers return `Promise<ApplicationResult<T>>`.

### 2. Functional Error Handling (`ApplicationResult<T>`)

- Business validation errors return an `ApplicationResult.fail(error)` container rather than throwing runtime exceptions.
- Guarantees explicit, typed error handling across application handlers.

### 3. DTO Mapping (`AppointmentMapper`)

- `AppointmentMapper.toDTO(appointment)` converts mutable Domain Aggregate Roots into frozen read-only `AppointmentDTO` instances for Presentation consumption.
- Domain Entities are never leaked directly to external API callers.
