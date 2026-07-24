# 13. Enterprise Platform Services Infrastructure

- **Status:** Accepted
- **Date:** 2026-07-24

## Context and Problem Statement

To provide decoupled enterprise services across bounded contexts for identity, logging, and audit tracking without introducing hard dependencies on specific authentication providers or external logging SaaS tools.

## Decision Drivers

- Decoupled port interfaces (`IIdentityContext`, `ILoggerPort`, `IAuditService`) registered in NestJS dependency injection container.
- Placeholder implementations providing development defaults without external dependencies.
- Consolidating platform modules into a single `@Global()` `PlatformModule`.
- Full unit test coverage for platform services.

## Decision Outcome

Chosen Option: **Decoupled Platform Services in `apps/api/src/platform/` with NestJS Global `PlatformModule`**.

### Platform Services Breakdown

1. **Identity Platform Service (`apps/api/src/platform/identity/`)**:
   - `IIdentityContext` port symbol `IDENTITY_CONTEXT` and `IUserIdentity` interface.
   - `PlaceholderIdentityContextService`: NestJS `@Injectable()` service returning system default identity.
   - `IdentityModule`: Exports provider.
2. **Logging Platform Service (`apps/api/src/platform/logging/`)**:
   - `ILoggerPort` port symbol `LOGGER_PORT`.
   - `PlatformLoggerService`: NestJS `@Injectable()` service wrapping NestJS `Logger`.
   - `LoggingModule`: Exports provider.
3. **Audit Platform Service (`apps/api/src/platform/audit/`)**:
   - `IAuditService` port symbol `AUDIT_SERVICE` and `IAuditLogEvent` interface.
   - `PlaceholderAuditService`: NestJS `@Injectable()` service recording audit events via `ILoggerPort`.
   - `AuditModule`: Exports provider.
4. **Global Platform Module (`apps/api/src/platform/platform.module.ts`)**:
   - `@Global()` module aggregating `PrismaModule`, `IdentityModule`, `LoggingModule`, and `AuditModule`.

## Consequences

### Positive

- Cross-cutting concerns are injected via abstract interfaces (`@Inject(IDENTITY_CONTEXT)`, `@Inject(LOGGER_PORT)`, `@Inject(AUDIT_SERVICE)`).
- Easy swapping of placeholder services for production Keycloak/Auth0, Winston, or OpenTelemetry implementations in future phases.
