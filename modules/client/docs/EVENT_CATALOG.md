# Client Subsystem — Integration Event Catalog

## Architectural Overview

The Client bounded context communicates with the rest of the Kinergy Platform via **Integration Events**. Unlike internal Domain Events (which are private to the `modules/client/` domain boundary), Integration Events represent formal, versioned, public contracts designed for cross-module distribution and event-driven architecture.

### Key Event Principles

1. **Strict Immutability:** All properties on integration events are declared `readonly` and cannot be modified after instantiation.
2. **Standardized Envelope:** Every event carries a common header envelope:
   - `eventId`: Unique UUID string identifying the specific event message instance.
   - `schemaVersion`: Literal version number (e.g. `1 as const`) indicating payload structure.
   - `occurredAt`: UTC ISO `Date` timestamp indicating when the domain event occurred.
3. **Schema Compatibility:** Backward-compatible payload additions do not increment `schemaVersion`. Breaking field removals or schema modifications result in a major version increment (e.g. `v2`).

---

## Published Integration Events

The Client context publishes the following integration events to communicate state transitions to downstream bounded contexts.

### 1. `ClientCreatedIntegrationEvent` (Version 1)

- **Description:** Emitted immediately after a new client profile is successfully registered within the platform.
- **Trigger Condition:** Successful execution of `RegisterClientUseCase`.
- **Target Consumers:**
  - **Memberships Module:** Provisions default client membership eligibility or introductory offers.
  - **POS & Billing Modules:** Creates client customer record in point-of-sale and invoicing subsystems.
  - **CRM & Notifications Subsystem:** Sends welcome emails/SMS communications.
  - **Audit Logging Subsystem:** Records client creation security audit trace.

#### TypeScript Interface Definition

```typescript
export class ClientCreatedIntegrationEvent {
  readonly eventId: string;
  readonly schemaVersion: 1 = 1;
  readonly clientId: string;
  readonly referenceNumber: string;
  readonly email: string;
  readonly phone: string;
  readonly occurredAt: Date;
}
```

#### JSON Schema (v1)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ClientCreatedIntegrationEvent",
  "type": "object",
  "properties": {
    "eventId": { "type": "string", "format": "uuid" },
    "schemaVersion": { "type": "integer", "enum": [1] },
    "clientId": { "type": "string", "format": "uuid" },
    "referenceNumber": { "type": "string", "pattern": "^CLI-\\d{4}-\\d{5}$" },
    "email": { "type": "string", "format": "email" },
    "phone": { "type": "string" },
    "occurredAt": { "type": "string", "format": "date-time" }
  },
  "required": [
    "eventId",
    "schemaVersion",
    "clientId",
    "referenceNumber",
    "email",
    "phone",
    "occurredAt"
  ],
  "additionalProperties": false
}
```

---

### 2. `ClientArchivedIntegrationEvent` (Version 1)

- **Description:** Emitted when an active client profile is soft-deleted (archived).
- **Trigger Condition:** Successful execution of `ArchiveClientUseCase`.
- **Target Consumers:**
  - **Appointments Module:** Cancels upcoming scheduled appointments for the archived client.
  - **Memberships Module:** Suspends active memberships and recurring billing schedules.
  - **POS Subsystem:** Blocks new point-of-sale transactions for the archived account.
  - **Client Activity Feed:** Appends `CLIENT_ARCHIVED` entry to timeline.

#### TypeScript Interface Definition

```typescript
export class ClientArchivedIntegrationEvent {
  readonly eventId: string;
  readonly schemaVersion: 1 = 1;
  readonly clientId: string;
  readonly occurredAt: Date;
}
```

#### JSON Schema (v1)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ClientArchivedIntegrationEvent",
  "type": "object",
  "properties": {
    "eventId": { "type": "string", "format": "uuid" },
    "schemaVersion": { "type": "integer", "enum": [1] },
    "clientId": { "type": "string", "format": "uuid" },
    "occurredAt": { "type": "string", "format": "date-time" }
  },
  "required": ["eventId", "schemaVersion", "clientId", "occurredAt"],
  "additionalProperties": false
}
```

---

### 3. `ClientRestoredIntegrationEvent` (Version 1)

- **Description:** Emitted when a previously archived client profile is reactivated (`ARCHIVED` ➔ `ACTIVE`).
- **Trigger Condition:** Successful execution of `RestoreClientUseCase`.
- **Target Consumers:**
  - **Memberships Module:** Re-enables suspended membership privileges.
  - **POS Subsystem:** Unblocks point-of-sale customer purchasing.
  - **Client Activity Feed:** Appends `CLIENT_RESTORED` entry to timeline.

#### TypeScript Interface Definition

```typescript
export class ClientRestoredIntegrationEvent {
  readonly eventId: string;
  readonly schemaVersion: 1 = 1;
  readonly clientId: string;
  readonly occurredAt: Date;
}
```

#### JSON Schema (v1)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ClientRestoredIntegrationEvent",
  "type": "object",
  "properties": {
    "eventId": { "type": "string", "format": "uuid" },
    "schemaVersion": { "type": "integer", "enum": [1] },
    "clientId": { "type": "string", "format": "uuid" },
    "occurredAt": { "type": "string", "format": "date-time" }
  },
  "required": ["eventId", "schemaVersion", "clientId", "occurredAt"],
  "additionalProperties": false
}
```

---

### 4. `IdentityLinkedIntegrationEvent` (Version 1)

- **Description:** Emitted when an authentication identity (`identityId`) is linked to a client profile.
- **Trigger Condition:** Successful execution of `LinkIdentityToClientUseCase`.
- **Target Consumers:**
  - **Identity & Access Management (IAM):** Updates authorization context mappings.
  - **Client Portal & Mobile App:** Grants self-service access to client profile data.
  - **Client Activity Feed:** Appends `IDENTITY_LINKED` entry to timeline.

#### TypeScript Interface Definition

```typescript
export class IdentityLinkedIntegrationEvent {
  readonly eventId: string;
  readonly schemaVersion: 1 = 1;
  readonly clientId: string;
  readonly identityId: string;
  readonly occurredAt: Date;
}
```

#### JSON Schema (v1)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "IdentityLinkedIntegrationEvent",
  "type": "object",
  "properties": {
    "eventId": { "type": "string", "format": "uuid" },
    "schemaVersion": { "type": "integer", "enum": [1] },
    "clientId": { "type": "string", "format": "uuid" },
    "identityId": { "type": "string", "format": "uuid" },
    "occurredAt": { "type": "string", "format": "date-time" }
  },
  "required": ["eventId", "schemaVersion", "clientId", "identityId", "occurredAt"],
  "additionalProperties": false
}
```

---

## Consumed External Events (Activity Feed Projections)

The Client context's Activity Feed read model (`client_timeline_entries`) subscribes to integration events published by external bounded contexts to maintain a unified activity history for each client profile.

### 1. `AppointmentScheduledIntegrationEvent`

- **Source Module:** Appointments Bounded Context (`modules/appointments`)
- **Trigger Condition:** Client books an appointment.
- **Timeline Entry Mapping:**
  - `eventType`: `"APPOINTMENT_SCHEDULED"`
  - `summary`: `"Scheduled appointment: {serviceName} with {providerName}"`
  - `metadata`: `{ "appointmentId": "...", "scheduledFor": "..." }`

### 2. `MembershipPurchasedIntegrationEvent`

- **Source Module:** Memberships Bounded Context (`modules/memberships`)
- **Trigger Condition:** Client purchases or renews a membership plan.
- **Timeline Entry Mapping:**
  - `eventType`: `"MEMBERSHIP_PURCHASED"`
  - `summary`: `"Purchased membership plan: {planName}"`
  - `metadata`: `{ "membershipId": "...", "planId": "...", "expiresAt": "..." }`

### 3. `PosOrderCompletedIntegrationEvent`

- **Source Module:** Point of Sale Bounded Context (`modules/pos`)
- **Trigger Condition:** Retail purchase completed at POS checkout.
- **Timeline Entry Mapping:**
  - `eventType`: `"POS_ORDER_COMPLETED"`
  - `summary`: `"Completed POS purchase of {itemCount} items (${totalAmount})"`
  - `metadata`: `{ "orderId": "...", "totalAmount": 49.99, "currency": "USD" }`

### 4. `BillingInvoicePaidIntegrationEvent`

- **Source Module:** Billing & Invoicing Bounded Context (`modules/billing`)
- **Trigger Condition:** Invoice successfully paid.
- **Timeline Entry Mapping:**
  - `eventType`: `"INVOICE_PAID"`
  - `summary`: `"Paid invoice #{invoiceNumber} (${amount})"`
  - `metadata`: `{ "invoiceId": "...", "invoiceNumber": "INV-2026-00123", "amount": 120.00 }`
