# Bounded Contexts & Platform Architecture

## 1. Bounded Context Isolation

In Domain-Driven Design, a **Bounded Context** is an explicit boundary within which a domain model applies. Every bounded context in the Kinergy Platform maintains its own models, application use cases, and persistence mappings to prevent context bleed.

```mermaid
graph TD
    subgraph Kinergy Platform Monorepo
        subgraph "Identity Context (apps/api/src/platform/identity)"
            IAM_DOM[User / Role / Permission]
            IAM_UC[Auth & Admin Use Cases]
            IAM_REPO[Prisma User Repositories]
        end

        subgraph "Client Management Context (modules/client)"
            CLT_DOM[Client Aggregate Root]
            CLT_UC[Registration & Profile Use Cases]
            CLT_FACADE[ClientFacade / IClientFacade]
            CLT_REPO[Prisma Client Repositories]
        end

        subgraph "Scheduling Context (packages/core/src/scheduling)"
            SCHED_DOM[Appointment / Recurrence / Room]
            SCHED_UC[Booking & Conflict Resolution Use Cases]
            SCHED_REPO[Prisma Scheduling Repositories]
        end

        subgraph "Kinesiology Context (packages/core/src/kinesiology)"
            KIN_DOM[TreatmentSession / SOAP Notes]
            KIN_UC[Clinical Care Documentation Use Cases]
            KIN_REPO[Prisma Kinesiology Repositories]
        end

        subgraph "Gym Management Context (packages/core/src/gym)"
            GYM_DOM[Membership / Plan / Attendance]
            GYM_UC[Membership Lifecycle & Check-In Use Cases]
            GYM_REPO[Prisma Gym Repositories]
        end

        subgraph "Enterprise Platform Layer"
            PLAT_PRISMA[Prisma Module]
            PLAT_LOG[Logging Module]
            PLAT_AUDIT[Audit Module]
        end
    end

    IAM_REPO --> PLAT_PRISMA
    CLT_REPO --> PLAT_PRISMA
    SCHED_REPO --> PLAT_PRISMA
    KIN_REPO --> PLAT_PRISMA
    GYM_REPO --> PLAT_PRISMA

    GYM_UC -->|Synchronous Status Query| CLT_FACADE
    KIN_UC -->|Correlation Port Query| SCHED_UC
    GYM_UC -.->|Async Timeline Events| CLT_UC
    KIN_UC -.->|Async Timeline Events| CLT_UC
```

---

## 2. Bounded Context Catalog & Specifications

| Bounded Context       | Package / Directory               | Core Aggregates                                    | Specification Document                                                     |
| :-------------------- | :-------------------------------- | :------------------------------------------------- | :------------------------------------------------------------------------- |
| **Identity (IAM)**    | `apps/api/src/platform/identity/` | `User`, `Role`, `Permission`, `RefreshToken`       | [Identity Domain Model](./identity-domain-model.md)                        |
| **Client Management** | `modules/client/`                 | `Client`, `ClientTimelineEntry`                    | [Client Subsystem Architecture](../../modules/client/docs/ARCHITECTURE.md) |
| **Scheduling**        | `packages/core/src/scheduling/`   | `Appointment`, `RecurrenceSeries`, `Room`          | [Scheduling Architecture](../scheduling/architecture.md)                   |
| **Kinesiology**       | `packages/core/src/kinesiology/`  | `TreatmentSession`, `SessionNotes` (SOAP)          | [Kinesiology Specification](./contexts/kinesiology.md)                     |
| **Gym Management**    | `packages/core/src/gym/`          | `Membership`, `MembershipPlan`, `AttendanceRecord` | [Gym Specification](./contexts/gym.md)                                     |

---

## 3. Enterprise Platform Layer Architecture

The **Platform Layer** (`apps/api/src/platform/`) provides enterprise cross-cutting infrastructure services to bounded contexts through NestJS dependency injection.

```mermaid
graph BT
    subgraph Platform Services
        IDENT[Identity Service<br/>PlaceholderIdentityContextService]
        LOG[Logger Service<br/>PlatformLoggerService]
        AUDIT[Audit Service<br/>PlaceholderAuditService]
        PRISMA[Persistence Service<br/>PrismaService]
    end

    subgraph Interface Ports
        IIDENT[IIdentityContext]
        ILOG[ILoggerPort]
        IAUDIT[IAuditService]
    end

    subgraph Global NestJS Module
        PM[PlatformModule]
    end

    IDENT -.->|Implements| IIDENT
    LOG -.->|Implements| ILOG
    AUDIT -.->|Implements| IAUDIT

    PM --> IDENT
    PM --> LOG
    PM --> AUDIT
    PM --> PRISMA
```

### Platform Service Specifications

1. **Identity Platform Service (`apps/api/src/platform/identity/`)**:
   - Interface: `IIdentityContext` (`IDENTITY_CONTEXT` symbol).
   - Implementation: `PlaceholderIdentityContextService` returning authenticated user context (`ReqUser`).
2. **Logging Platform Service (`apps/api/src/platform/logging/`)**:
   - Interface: `ILoggerPort` (`LOGGER_PORT` symbol).
   - Implementation: `PlatformLoggerService` wrapping NestJS `Logger`.
3. **Audit Platform Service (`apps/api/src/platform/audit/`)**:
   - Interface: `IAuditService` (`AUDIT_SERVICE` symbol).
   - Implementation: `PlaceholderAuditService` recording structured audit log events (`IAuditLogEvent`) via `ILoggerPort`.
4. **Persistence Platform Service (`apps/api/src/platform/persistence/prisma/`)**:
   - Service: `PrismaService` extending `PrismaClient` with `OnModuleInit` (`$connect()`) and `OnModuleDestroy` (`$disconnect()`).
   - Module: Global `PrismaModule`.
