# Client Subsystem — Developer Integration Guide

## Introduction & Architectural Principles

The Client bounded context (`modules/client/`) provides identity, profile management, duplicate detection, search indexing, and audit activity feeds for clients across the Kinergy Platform.

This guide provides step-by-step instructions for developers building future bounded contexts (Appointments, Memberships, POS, Billing, Nutrition, Equipment Rentals) to integrate with Client capabilities cleanly and securely.

---

## The Zero Database Coupling Rule

> **CRITICAL INVARIANT:**  
> External modules **MUST NEVER** access the `clients` or `client_timeline_entries` database tables directly via Prisma, raw SQL queries, or shared database connections.
> External modules **MUST NEVER** import internal Domain Aggregates (`Client`), internal Repositories (`PrismaClientRepository`), Command Handlers, or Domain Exceptions (`ClientNotFoundException`).
>
> All synchronous cross-module interaction MUST pass exclusively through `IClientFacade` via `CLIENT_FACADE_TOKEN`.

---

## 1. Importing & Registering `ClientModule`

To interact with the Client subsystem synchronously, import `ClientModule` from `@kinergy-platform/client-domain` in your NestJS module definition.

### Module Configuration (`appointments.module.ts`)

```typescript
import { Module } from '@nestjs/common';
import { ClientModule } from '@kinergy-platform/client-domain';
import { AppointmentService } from './appointment.service';
import { AppointmentController } from './appointment.controller';

@Module({
  imports: [
    ClientModule, // Imports ClientFacade and CLIENT_FACADE_TOKEN
  ],
  controllers: [AppointmentController],
  providers: [AppointmentService],
})
export class AppointmentsModule {}
```

---

## 2. Injecting `IClientFacade`

Inject `IClientFacade` into your domain services using the `@Inject(CLIENT_FACADE_TOKEN)` custom decorator token.

### Service Implementation (`appointment.service.ts`)

```typescript
import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  IClientFacade,
  CLIENT_FACADE_TOKEN,
  ClientSummaryDto,
  ClientProfileDto,
} from '@kinergy-platform/client-domain';

@Injectable()
export class AppointmentService {
  constructor(
    @Inject(CLIENT_FACADE_TOKEN)
    private readonly clientFacade: IClientFacade,
  ) {}

  /**
   * Example 1: Verify Client is ACTIVE before booking an appointment
   */
  async createAppointment(clientId: string, serviceId: string, scheduledFor: Date) {
    const isActive = await this.clientFacade.isClientActive(clientId);
    if (!isActive) {
      throw new BadRequestException(`Client '${clientId}' is not active or does not exist.`);
    }

    // Proceed with appointment creation...
  }

  /**
   * Example 2: Retrieve lightweight ClientSummaryDto for receipts or appointment cards
   */
  async getAppointmentSummary(clientId: string) {
    const clientSummary: ClientSummaryDto | null =
      await this.clientFacade.getClientSummary(clientId);
    if (!clientSummary) {
      throw new NotFoundException(`Client '${clientId}' not found.`);
    }

    return {
      clientId: clientSummary.id,
      clientName: clientSummary.fullName,
      clientEmail: clientSummary.email,
      clientPhone: clientSummary.phone,
      referenceNumber: clientSummary.referenceNumber,
    };
  }

  /**
   * Example 3: Full-Text Client Search for auto-complete UI
   */
  async searchClientsForBooking(searchTerm: string): Promise<ClientSummaryDto[]> {
    return await this.clientFacade.searchClientsSummary(searchTerm, 10);
  }
}
```

---

## 3. Public API Reference Summary

`IClientFacade` exposes four safe, synchronous methods:

| Method                 | Parameters                      | Return Type                         | Behaviour on Missing Record                             |
| ---------------------- | ------------------------------- | ----------------------------------- | ------------------------------------------------------- |
| `getClientProfile`     | `clientId: string`              | `Promise<ClientProfileDto \| null>` | Returns `null` (never throws `ClientNotFoundException`) |
| `getClientSummary`     | `clientId: string`              | `Promise<ClientSummaryDto \| null>` | Returns `null`                                          |
| `isClientActive`       | `clientId: string`              | `Promise<boolean>`                  | Returns `false` if missing or status is `ARCHIVED`      |
| `searchClientsSummary` | `query: string, limit?: number` | `Promise<ClientSummaryDto[]>`       | Returns `[]` if no matches found                        |

---

## 4. Asynchronous Event Integration (Activity Feed Projections)

When your bounded context performs a significant business action involving a client, publish an **Integration Event**. The Client subsystem will consume this event asynchronously and project a timeline entry onto the Client's Activity Feed (`client_timeline_entries`).

### Publishing an Event from Your Module

```typescript
// In your module (e.g. Memberships)
export class MembershipPurchasedIntegrationEvent {
  readonly eventId: string = randomUUID();
  readonly schemaVersion = 1 as const;
  readonly clientId: string;
  readonly planName: string;
  readonly amountPaid: number;
  readonly occurredAt: Date = new Date();

  constructor(props: { clientId: string; planName: string; amountPaid: number }) {
    this.clientId = props.clientId;
    this.planName = props.planName;
    this.amountPaid = props.amountPaid;
  }
}

// Dispatch event via platform EventBus
await this.eventBus.publish(
  new MembershipPurchasedIntegrationEvent({
    clientId: '550e8400-e29b-41d4-a716-446655440000',
    planName: 'Gold Unlimited Annual',
    amountPaid: 1200.0,
  }),
);
```

---

## 5. Versioning & Breaking Change Management

Public DTOs (`ClientSummaryDto`, `ClientProfileDto`) and Integration Events adhere to **Semantic Versioning for Contracts**:

### Non-Breaking Changes (Additive)

- Adding a new optional field to `ClientSummaryDto` or an event payload.
- Adding a new method to `IClientFacade` with optional parameters.
- _Action:_ No `schemaVersion` increment required.

### Breaking Changes

- Removing or renaming an existing property on a DTO or Event contract.
- Changing a property data type (e.g. `string` ➔ `number`).
- _Action:_
  1. Create a new event class (e.g., `ClientCreatedIntegrationEventV2`) with `schemaVersion = 2 as const`.
  2. Maintain `ClientCreatedIntegrationEvent` (v1) concurrently during the deprecation period.
  3. Publish both event versions simultaneously until downstream consumers complete migration.
