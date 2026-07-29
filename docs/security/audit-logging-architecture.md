# Audit Logging Event Infrastructure Architecture Guide

## Executive Summary

The Kinergy Platform Audit Logging Infrastructure is designed to provide reusable, strongly-typed event abstractions and publishing ports (`IAuditEventPublisher`) following Clean Architecture and Domain-Driven Design (DDD) principles. This architecture decouples application services and domain use cases from underlying persistence and telemetry infrastructure.

---

## 1. Audit Event Architecture & Data Taxonomy

Every audit record across the platform adheres to the normalized `IAuditEvent` schema.

### Core Audit Event Schema

```json
{
  "eventId": "evt_9b1deb4d-3b7d-416b-9548-52ee8c8230e5",
  "eventType": "LOGIN_SUCCEEDED",
  "category": "AUTHENTICATION",
  "timestamp": "2026-07-29T12:00:00.000Z",
  "actor": {
    "userId": "usr_12345",
    "email": "user@kinergy.com",
    "roles": ["USER"],
    "tenantId": "tenant_alpha"
  },
  "target": {
    "type": "User",
    "id": "usr_12345"
  },
  "outcome": "SUCCESS",
  "severity": "LOW",
  "tenantId": "tenant_alpha",
  "metadata": {
    "clientIp": "192.168.1.1",
    "userAgent": "Mozilla/5.0...",
    "reason": null
  }
}
```

### Event Categories & Severity Levels

| Category                  | Typical Event Types                                                                  | Severity Range       |
| :------------------------ | :----------------------------------------------------------------------------------- | :------------------- |
| `AUTHENTICATION`          | `LOGIN_SUCCEEDED`, `LOGIN_FAILED`, `LOGOUT`, `TOKEN_REFRESHED`                       | `LOW` to `MEDIUM`    |
| `IDENTITY_ADMINISTRATION` | `USER_CREATED`, `USER_UPDATED`, `USER_DEACTIVATED`, `USER_DELETED`, `PASSWORD_RESET` | `MEDIUM` to `HIGH`   |
| `AUTHORIZATION_ACCESS`    | `PERMISSION_GRANTED`, `ROLE_ASSIGNED`, `ACCESS_DENIED`                               | `MEDIUM` to `HIGH`   |
| `SYSTEM_SECURITY`         | `CONFIGURATION_CHANGED`, `SECURITY_ALERT`                                            | `HIGH` to `CRITICAL` |

---

## 2. Reusable Event Publisher Port & DI Integration

Domain modules publish audit events exclusively through the `IAuditEventPublisher` port bound to NestJS dependency injection using the `AUDIT_EVENT_PUBLISHER` symbol.

### NestJS Binding Example

```typescript
import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_EVENT_PUBLISHER,
  IAuditEventPublisher,
  AuditEventCategory,
  AuditEventType,
  AuditOutcome,
  AuditSeverity,
} from '@kinergy/platform';

@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject(AUDIT_EVENT_PUBLISHER)
    private readonly auditPublisher: IAuditEventPublisher,
  ) {}

  async execute(dto: CreateUserDto): Promise<User> {
    // ... business logic ...

    await this.auditPublisher.publish({
      eventId: randomUUID(),
      eventType: AuditEventType.USER_CREATED,
      category: AuditEventCategory.IDENTITY_ADMINISTRATION,
      timestamp: new Date(),
      actor: { userId: currentAdmin.id, email: currentAdmin.email },
      target: { type: 'User', id: newUser.id, name: newUser.email },
      outcome: AuditOutcome.SUCCESS,
      severity: AuditSeverity.MEDIUM,
      tenantId: newUser.tenantId,
    });

    return newUser;
  }
}
```

---

## 3. Security Event Hooks

To maintain loose coupling between domain events and audit transport mechanisms, `SecurityAuditHookService` acts as a security event hook adapter that intercepts identity domain events (`SecurityEvent`) and normalizes them into structured `IAuditEvent` records.

---

## 4. Clean Architecture Self-Review

| Clean Architecture Criterion              | Status     | Implementation Evidence                                                                           |
| :---------------------------------------- | :--------- | :------------------------------------------------------------------------------------------------ |
| **Dependency Inversion Principle (DIP)**  | **PASSED** | Business logic depends on `IAuditEventPublisher` interface, not concrete storage implementations. |
| **Interface Segregation Principle (ISP)** | **PASSED** | Separate, focused ports (`IAuditEventPublisher`, `ILoggerPort`, `ISecurityEventPublisher`).       |
| **Zero Infrastructure Leakage**           | **PASSED** | Audit interfaces contain zero database, HTTP, or framework-specific annotations.                  |
| **Single Responsibility Principle (SRP)** | **PASSED** | `LoggerAuditEventPublisher` is responsible solely for formatting and dispatching logs.            |
