# Bounded Contexts & Platform Infrastructure Layer

## Bounded Context Isolation

In Domain-Driven Design, a **Bounded Context** is an explicit boundary within which a domain model applies. Every bounded context in the Kinergy Platform maintains its own models, application use cases, and persistence mappings to prevent context bleed.

```mermaid
graph TD
    subgraph Kinergy Platform Monorepo
        subgraph Energy Monitoring Context
            EM_DOM[Domain Models]
            EM_UC[Use Cases]
            EM_REPO[Prisma Repositories]
        end

        subgraph Asset Management Context
            AM_DOM[Domain Models]
            AM_UC[Use Cases]
            AM_REPO[Prisma Repositories]
        end

        subgraph Enterprise Platform Layer
            PLAT_PRISMA[Prisma Module]
            PLAT_IDENT[Identity Module]
            PLAT_LOG[Logging Module]
            PLAT_AUDIT[Audit Module]
        end
    end

    EM_REPO --> PLAT_PRISMA
    AM_REPO --> PLAT_PRISMA
    EM_UC --> PLAT_IDENT
    EM_UC --> PLAT_LOG
    EM_UC --> PLAT_AUDIT
```

---

## Enterprise Platform Layer Architecture

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
   - Implementation: `PlaceholderIdentityContextService` returning system default user context.
   - Decoupled interface allows zero-friction replacement with Auth0/Keycloak/OIDC providers in future phases.
2. **Logging Platform Service (`apps/api/src/platform/logging/`)**:
   - Interface: `ILoggerPort` (`LOGGER_PORT` symbol).
   - Implementation: `PlatformLoggerService` wrapping NestJS `Logger`.
3. **Audit Platform Service (`apps/api/src/platform/audit/`)**:
   - Interface: `IAuditService` (`AUDIT_SERVICE` symbol).
   - Implementation: `PlaceholderAuditService` recording structured audit log events (`IAuditLogEvent`) via `ILoggerPort`.
4. **Persistence Platform Service (`apps/api/src/platform/persistence/prisma/`)**:
   - Service: `PrismaService` extending `PrismaClient` with `OnModuleInit` (`$connect()`) and `OnModuleDestroy` (`$disconnect()`).
   - Module: Global `PrismaModule`.
