# Phase 2 Progress Report: Client Domain & Subsystem Implementation

This document provides a comprehensive overview of the architectural decisions, business invariants, application use cases, persistence strategy, and API endpoints delivered across **Milestones 2.1 to 2.5** within `modules/client/`.

---

## Architecture & Layer Request Flow

```mermaid
graph TD
    ClientApp["HTTP Client / External System"] -->|1. Request (PATCH /clients/:id)| Controller["ClientController (Presentation)"]
    Controller -->|2. Extract If-Match / ETag & Query DTO| Command["UpdateClientCommand (Application)"]
    Command -->|3. Execute UseCase| UseCase["UpdateClientUseCase (Application)"]
    UseCase -->|4. Find & Rehydrate| Repository["PrismaClientRepository (Infrastructure)"]
    Repository -->|5. Reconstitute Aggregate| Aggregate["Client Aggregate Root (Domain)"]
    UseCase -->|6. Duplicate Check| DupChecker["ClientDuplicateCheckerService (Domain)"]
    UseCase -->|7. Mutate State (updateDetails)| Aggregate
    Aggregate -->|8. Version Check & State Invariant Assertions| Aggregate
    UseCase -->|9. Save Mutated State| Repository
    Repository -->|10. Atomic UPDATE WHERE id & version| Database["PostgreSQL / Prisma Database"]
    UseCase -->|11. Map to ClientProfileDto| Mapper["ClientMapper (Infrastructure)"]
    Controller -->|12. Set ETag Header & Return 200 OK| ClientApp
```

---

## Milestone Summary (2.1 – 2.5)

### Milestone 2.1 — Client Domain Foundation

- **Aggregate Root:** `Client` Aggregate Root inside `modules/client/domain/aggregates/client.aggregate.ts`.
- **Value Objects:** Pure immutable Value Objects: `ClientId`, `ClientName`, `EmailAddress` (strict RFC 5322 regex format), `E164PhoneNumber` (`+\d{8,15}` normalization), `ClientReferenceNumber` (`CLI-YYYY-XXXXX`), and `NormalizedSearchName` (diacritic stripping & NFD normalization).
- **Domain Events:** `ClientCreatedEvent`, `IdentityLinkedEvent`, `ClientArchivedEvent`, and `ClientRestoredEvent`.
- **Specifications:** `CanRegisterClientSpecification`, `CanArchiveClientSpecification`, and `ClientAlreadyLinkedSpecification`.

### Milestone 2.2 — Client Registration

- **Duplicate Prevention:** `ClientDuplicateCheckerService` implementing hard duplicate checks (unique `email` or `phone`) and soft duplicate similarity detection.
- **Persistence:** `PrismaClientRepository` bi-directionally mapped via `ClientMapper`.
- **REST Endpoints:** `POST /clients` (returns `201 Created` or `409 Conflict` with potential matches) and `POST /clients/:id/link-identity`.

### Milestone 2.3 — Client Profile

- **Authoritative Representation:** `ClientProfileDto` encapsulating complete business attributes with explicit `referenceNumber` visibility.
- **Selective Identity Visibility:** Linked `identityId` exposed only when the requesting context is authorized (administrative/staff role or self client).
- **REST Endpoint:** `GET /clients/:id` with `ClientNotFoundException` mapping cleanly to HTTP `404 Not Found`.

### Milestone 2.4 — Client Search

- **Database Optimization:** Raw SQL migration enabling PostgreSQL `pg_trgm` extension and GIN trigram indexes on `normalized_search_name`, `email`, and `phone`.
- **Generic Pagination:** Reusable `PaginatedResultDto<T>` calculating `totalPages`, `hasNextPage`, and `hasPreviousPage`.
- **Application Query:** `SearchClientsUseCase` sanitizing text search and enforcing page & limit safety bounds (default limit 10, max limit 100).
- **REST Endpoint:** `GET /clients` with `SearchClientsQueryDto` query parameter validation.

### Milestone 2.5 — Client Update

- **Partial PATCH Updates:** `updateDetails` mutating only supplied fields (`name`, `email`, `phone`) and recalculating `normalizedSearchName`.
- **Archived Modification Guard:** Throwing `ArchivedClientCannotBeModifiedException` (HTTP `422 Unprocessable Entity`) if attempting to modify archived clients.
- **Optimistic Concurrency Control:** HTTP `If-Match` header and body version validation, atomic `UPDATE ... WHERE id = :id AND version = :expectedVersion` query execution, and throwing `OptimisticLockException` (HTTP `412 Precondition Failed`) on version mismatch. Response sets `ETag: "{version}"`.
- **REST Endpoint:** `PATCH /clients/:id`.

---

## Verification & Quality Assurance

- **100% Test Pass Rate:** 14 unit, integration, and performance test suites in `modules/client/` plus 55 test suites in `apps/api`.
- **Zero-Regression Standard:** Verified through full `pnpm validate` suite (formatting, linting across 9 projects, `tsc` typechecking, and project builds).
