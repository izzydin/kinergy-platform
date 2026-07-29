# 0039. Reusable Audit Logging Event Infrastructure Architecture

- **Status**: Accepted
- **Date**: 2026-07-29
- **Deciders**: Principal Security Architect, Platform Core Architecture Team

## Context & Problem Statement

As the Kinergy Platform expands across multiple domain modules (Identity, User Administration, Sustainability Analytics), tracking state changes and security events requires a unified, decoupled audit logging infrastructure. Directly coupling domain use cases or application services to specific database tables, SIEM platforms, or messaging buses creates tight coupling and violates Clean Architecture.

## Decision Drivers

1. **Clean Architecture & Boundary Decoupling**: Domain and application modules must publish structured audit events through pure abstract ports (`IAuditEventPublisher`) without depending on infrastructure adapters.
2. **Standardized Event Taxonomy**: Enforce a unified event schema (`IAuditEvent`) across all platform subsystems covering actor, target, action type, outcome, severity, and tenant scope.
3. **Security Event Hooks**: Provide reusable hook infrastructure (`SecurityAuditHookService`) that maps security domain events (`SecurityEvent`) automatically into normalized audit records.
4. **No Premature Persistence**: Focus purely on reusable event abstractions, ports, and logger/in-memory adapters without premature storage, dashboard, or analytics implementations.

## Decision Outcome

Chosen Architecture: **Decoupled Event Publisher Port & Extensible Event Abstraction**.

### Architectural Structure

```
Application / Security Use Cases
            │
            ▼
    [IAuditEventPublisher] (Abstract Port Interface)
            │
    ┌───────┴────────────────────────┐
    ▼                                ▼
[LoggerAuditEventPublisher]   [Future Adapters: DB/SIEM/Kafka]
    │
    ▼
[PlatformLogger]
```

1. **Core Abstractions**:
   - `IAuditEvent`: Normalized audit event contract containing `eventId`, `eventType`, `category`, `timestamp`, `actor`, `target`, `outcome`, `severity`, `tenantId`, and `metadata`.
   - `IAuditEventPublisher`: Abstract port interface providing `publish(event)` and `publishBatch(events)`. Bound via NestJS `AUDIT_EVENT_PUBLISHER` symbol.
2. **Infrastructure Adapters**:
   - `LoggerAuditEventPublisher`: Production-ready adapter that formats `IAuditEvent` payloads into structured JSON logs emitted via `ILoggerPort`.
3. **Security Event Hooks**:
   - `SecurityAuditHookService`: Reusable event hook mapping identity domain events (`LoginSucceeded`, `LoginFailed`, `RefreshTokenReplayDetected`) into `IAuditEvent` records.

## Consequences

### Positive

- **Complete Decoupling**: Future modules can publish audit events through `IAuditEventPublisher` without depending on storage implementations.
- **Unified Security Taxonomy**: Standardized audit severity and outcome schema across the platform.
- **Zero Premature Overhead**: Avoids complex database schema or analytics overhead until required.

### Negative

- Direct audit event querying in database format is postponed until persistence adapters are provisioned in future milestones.
