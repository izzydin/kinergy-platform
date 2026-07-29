# ADR 0002: Client Domain Foundation, Identity Decoupling, Optimistic Concurrency & E.164 Normalization

- **Status:** Accepted
- **Date:** 2026-07-29
- **Deciders:** Lead Architect, Senior Platform Engineer

---

## 1. Context & Problem Statement

In enterprise multi-tenant SaaS platforms, mixing user authentication credentials (`User` / `Identity`) with business profile domain entities (`Client` / `Customer`) leads to tight coupling, security risks, and rigidity when managing walk-in clients, staff-created records, or multi-user corporate accounts.

We require a pure, framework-agnostic domain layer for Client management inside `modules/client/domain/` that enforces:

1. Complete decoupling of Identity (`User`) from Business Profile (`Client`).
2. Optimistic concurrency control via aggregate state versioning.
3. Strict E.164 phone number validation and normalization.
4. An event-driven foundation for audit trails and read-model timeline projections.

---

## 2. Decision Drivers

- **Domain Purity**: Domain layer must remain 100% pure TypeScript with zero framework, HTTP, or database ORM dependencies.
- **Identity Decoupling**: Walk-in or staff-created clients must exist independently without forcing an authentication `User` account.
- **Concurrency Safety**: High-concurrency operations must prevent lost updates using aggregate root versioning.
- **Data Quality & Searchability**: Phone numbers must be normalized to standard E.164 format (`+[country][digits]`) and names normalized for accent-insensitive search.

---

## 3. Considered Options

- **Option 1**: Combine `User` and `Client` into a single unified database table and domain entity.
- **Option 2**: Decouple `User` and `Client` aggregates, enforcing optional `identityId: string | null`, aggregate versioning counter (`version`), E.164 normalization, and domain event emissions.

---

## 4. Decision Outcome

**Chosen Option:** **Option 2**. We establish `Client` as a standalone Aggregate Root inside `modules/client/domain/`.

### Key Architectural Invariants

1. **Identity Decoupling**:
   - `Client` maintains an optional `identityId: string | null`.
   - Walk-in clients created by staff initialized with `identityId = null`.
   - `linkIdentity(identityId)` allows linking authentication credentials at a later date, throwing `ClientAlreadyLinkedException` if previously linked.

2. **Optimistic Concurrency Control**:
   - `Client` aggregate maintains a mandatory `version: number` counter, initialized to `1` upon registration.
   - Every state mutation (`linkIdentity`, `archive`, `restore`) increments `version` by 1 and updates `updatedAt`.
   - Persistence layers evaluate `WHERE id = :id AND version = :expectedVersion` to reject concurrent updates.

3. **E.164 Phone Normalization & Searchability**:
   - Phone numbers are validated and normalized via `E164PhoneNumber` Value Object to `+\d{8,15}` standard format.
   - Search queries use `NormalizedSearchName` to strip diacritics/accents (NFD normalization) and collapse casing.

4. **Event-Driven Timeline Strategy**:
   - Aggregate mutations emit read-only domain events (`ClientCreatedEvent`, `IdentityLinkedEvent`, `ClientArchivedEvent`, `ClientRestoredEvent`).
   - Domain events support future asynchronous read-model projections (e.g. client interaction timeline, audit logging).

---

## 5. Consequences

### Positive

- Framework-agnostic pure domain model testable in Node.js memory in milliseconds.
- High data integrity with zero phone number formatting variations across tenants.
- Complete isolation of authentication domain concerns from business client profiles.

### Negative / Trade-Offs

- Requires mapping domain entities to/from persistence DTOs at repository infrastructure layer boundaries.

---

## 6. References

- [Client Domain Specification](file:///c:/Projects/kinergy-platform/modules/client/domain/index.ts)
- [ADR 0010: Backend Clean Architecture & Layering Structure](file:///c:/Projects/kinergy-platform/docs/adr/0010-backend-clean-architecture-layering.md)
- [ADR 0030: User Administration & Identity Boundary Architecture](file:///c:/Projects/kinergy-platform/docs/adr/0030-user-administration-identity-boundary-architecture.md)
