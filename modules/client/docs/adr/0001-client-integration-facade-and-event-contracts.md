# ADR 0001: Client Integration Facade & Versioned Event Contracts

## Status

Accepted

## Context

As the Kinergy Platform expands across multiple domain bounded contexts—including Appointments, Memberships, Point of Sale (POS), Billing, Nutrition, and Equipment Rentals—these external modules require access to Client identity, status, and summary information.

Previously, in early development phases, modules could theoretically import internal application components or inspect database models directly. However, allowing direct database access across bounded contexts breaks domain encapsulation, introduces tight coupling to internal database schemas (`clients`, `client_timeline_entries`), exposes internal domain exceptions, and prevents independent schema evolution or database partitioning.

We need a formal integration architecture that enforces:

1. **Strict Database & Domain Isolation:** No external module may query Client tables or consume internal Aggregate Roots directly.
2. **Single Point of Synchronous Entry:** A strongly-typed, secure, and versioned public facade (`ClientFacade`).
3. **Asynchronous Integration & Decoupled Activity Feed:** Immutable, versioned integration event contracts for cross-module event distribution and read-model timeline projections.

## Decision

We establish the following architectural invariants and integration mechanisms for the Client bounded context:

### 1. Public API Facade (`IClientFacade` & `ClientFacade`)

- **Single Synchronous Point of Entry:** All synchronous cross-module queries MUST pass through `ClientFacade` implementing `IClientFacade` (bound via `CLIENT_FACADE_TOKEN`).
- **Strict Boundary Export:** The module index (`modules/client/index.ts`) exports ONLY the public facade, public interface, public DTOs (`ClientSummaryDto`, `ClientProfileDto`), and Integration Event contracts. Internal domain aggregates, Prisma repositories, command handlers, and private exceptions are unexported.
- **Exception Swallowing & Boundary Mapping:** `ClientFacade` intercepts internal exceptions (e.g., `ClientNotFoundException`) and returns safe fallbacks (`null` or `false`) to ensure internal domain exception types never cross module boundaries.

### 2. Versioned Integration Event Contracts

- Domain events within the Client context (`ClientCreatedEvent`, `ClientArchivedEvent`, etc.) remain private to the Client bounded context.
- Cross-module integration events are published as distinct, immutable contract classes under `modules/client/public/events/`:
  - `ClientCreatedIntegrationEvent` (v1)
  - `ClientArchivedIntegrationEvent` (v1)
  - `ClientRestoredIntegrationEvent` (v1)
  - `IdentityLinkedIntegrationEvent` (v1)
- Each event contract includes an immutable envelope featuring a unique `eventId` (UUID), `schemaVersion = 1 as const`, and an `occurredAt` timestamp.

### 3. Asynchronous Read-Model Activity Feed Projection

- Cross-module actions (e.g., an appointment scheduled in the Appointments context, a membership purchased in the Memberships context) project asynchronously onto the Client Activity Feed (`client_timeline_entries` read model).
- External contexts publish integration events; the Client context's projection handlers consume these events and append timeline entries without mutating or locking write-model aggregates.

### 4. Schema Versioning and Compatibility Policy

- **Additive Changes (Non-Breaking):** Adding optional properties to DTOs or event payloads does not require incrementing `schemaVersion`.
- **Breaking Changes:** Removing fields, renaming fields, or altering field data types requires introducing a new event contract (e.g., `ClientCreatedIntegrationEventV2`) with `schemaVersion = 2 as const`. Consuming modules are given a deprecation migration period before support for earlier versions is retired.

## Consequences

### Positive

- **Complete Database Isolation:** The `clients` and `client_timeline_entries` database tables can be refactored, migrated, or moved to a dedicated database instance without impacting external modules.
- **Reduced Coupling:** External bounded contexts depend only on stable public DTOs and interfaces.
- **Improved Security & Resilience:** Internal domain exceptions are not exposed to external callers, eliminating information leakage and unhandled domain errors across boundaries.
- **Scalable Event-Driven Architecture:** Timeline entries are populated asynchronously without blocking write transactions.

### Negative / Trade-offs

- **Indirection:** Synchronous calls require an extra mapping step from domain aggregates/DTOs to `ClientSummaryDto`.
- **Dual Event Definition:** Requires maintaining distinct internal domain events and public integration event contracts.

## Compliance & Enforcement

- **Automated Architecture Tests:** Enforced via `modules/client/__tests__/architecture.spec.ts`, which verifies that `index.ts` does not export internal symbols and that public DTOs do not leak private domain attributes.
- **Continuous Integration Quality Gate:** Enforced via `pnpm validate` (linting, typechecking, architecture specs, and builds).
