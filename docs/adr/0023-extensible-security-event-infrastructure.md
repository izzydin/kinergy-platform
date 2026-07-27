# 23. Extensible Security Event Infrastructure

- **Status:** Accepted
- **Date:** 2026-07-27

## Context and Problem Statement

Authentication and security activity (login, logout, token rotation, replay attack detection) previously logged events directly to application log streams. For production auditability, SIEM integration, enterprise compliance, and asynchronous threat detection, authentication use cases must publish structured domain security events via a decoupled event publishing port.

## Decision Drivers

- **Clean Architecture & Hexagonal Isolation**: Authentication use cases emit security events via `ISecurityEventPublisher` (`SECURITY_EVENT_PUBLISHER`) without knowing where or how they are stored or processed.
- **Support for Multi-Destination Messaging Infrastructure**: The abstraction must support future production publishing destinations (Kafka, RabbitMQ, Azure Service Bus, AWS EventBridge, SIEM platforms, audit tables) without modifying business logic.
- **Strictly Typed Event Taxonomy**: Support `LoginSucceeded`, `LoginFailed`, `LogoutSucceeded`, `RefreshTokenRotated`, `RefreshTokenReplayDetected`, and `PasswordChanged` event payloads.

## Decision Outcome

Chosen Option: **`ISecurityEventPublisher` Application Port Interface & `LoggerSecurityEventPublisher` Structured Infrastructure Implementation**.

### Event Processing Architecture

```
┌──────────────────────────────────────┐
│ Authentication Use Cases             │
│ (Login, Logout, RefreshToken)        │
└──────────────────┬───────────────────┘
                   │ emits SecurityEvent
                   ▼
        ISecurityEventPublisher (Port)
                   │
                   ▼ bound to DI
   LoggerSecurityEventPublisher (Infrastructure)
                   │
                   ├───────────────────────────────┐
                   ▼                               ▼
       Structured JSON Console          (Future Extension: Kafka,
             & System Log                RabbitMQ, SIEM, EventBridge)
```

## Consequences

### Positive

- Complete decoupling of authentication security auditing from loggers and message brokers.
- Zero infrastructure leakage into application use cases.
- Full unit test coverage verifying security event emissions across all authentication workflows.
