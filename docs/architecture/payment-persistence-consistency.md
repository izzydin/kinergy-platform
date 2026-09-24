# Architecture Specification: Payment Persistence Consistency & Concurrency Invariants

## 1. Domain vs Persistence Boundary

In accordance with Domain-Driven Design (DDD) and Clean Architecture principles, the responsibility boundary between the domain model and persistence layer is strictly enforced:

| Dimension                  | Domain Responsibility                                                                                                  | Persistence (Repository & Mapper) Responsibility                                                                                              |
| :------------------------- | :--------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lifecycle Validity**     | Decides whether a transition (`PENDING` $\rightarrow$ `COMPLETED`, `PENDING` $\rightarrow$ `FAILED`, etc.) is valid.   | **None**. Must NOT inspect or validate state transitions. Must never decide if a transition is allowed.                                       |
| **Invariant Enforcement**  | Ensures monetary constraints, terminal state immutability, `paidAt` alignment, and timestamp sequencing.               | Reconstitutes aggregates via `Payment.reconstitute()`. If raw DB data violates invariants, reconstitution fails immediately.                  |
| **State Mutation**         | Aggregate methods (`complete()`, `fail()`, `cancel()`) are the sole vehicle for state mutations. Increments `version`. | `save()` accepts pure domain aggregates, maps to persistence shape, and executes atomic writes. Exposes no arbitrary status mutation methods. |
| **Concurrency Invariants** | Tracks aggregate internal `version`.                                                                                   | Executes atomic conditional updates against the database column: `WHERE id = :id AND version = :priorVersion`.                                |

Prisma and database drivers remain pure infrastructure. The domain layer contains zero `@prisma/client` or ORM dependencies.

---

## 2. Status Persistence Mapping

Persistence mapping is isolated in [`PrismaPaymentMapper`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/mappers/prisma-payment.mapper.ts):

- **Domain States (Canonical)**:
  - `PaymentStatus.PENDING = 'PENDING'`
  - `PaymentStatus.COMPLETED = 'COMPLETED'`
  - `PaymentStatus.FAILED = 'FAILED'`
  - `PaymentStatus.CANCELLED = 'CANCELLED'`
- **Persistence States (PostgreSQL Enum)**:
  - `PENDING` $\leftrightarrow$ `PaymentStatus.PENDING`
  - `SETTLED` $\leftrightarrow$ `PaymentStatus.COMPLETED` (Semantic reconciliation per ADR-0116; financial clearing equals domain completion)
  - `FAILED` $\leftrightarrow$ `PaymentStatus.FAILED`
  - `CANCELLED` $\leftrightarrow$ `PaymentStatus.CANCELLED`

Any unexpected, unmapped, or corrupted status string retrieved from PostgreSQL triggers an immediate [`InvalidPaymentStatusException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-payment-status.exception.ts) during reconstitution, protecting application consumers from invalid states.

---

## 3. Concurrency Mechanism & Consistency Guarantee

### 3.1 Mechanism Choice: Optimistic Concurrency Control (OCC)

We evaluated five candidate concurrency mechanisms:

1. **Pessimistic Row Locking (`SELECT FOR UPDATE`)**: Unnecessary overhead; holds database transactions open across application logic; increases connection pool contention under load.
2. **Distributed Locks (e.g. Redis Redlock)**: High operational complexity; introduces an external single point of failure; disproportionate for single-record lifecycle transitions.
3. **Database Trigger / Stored Procedures**: Blurs domain boundary by leaking lifecycle orchestration into the database engine.
4. **Unconditional Upsert / Last-Write-Wins**: Violates financial consistency; silently overwrites completed payments if concurrent cancel requests race.
5. **Optimistic Concurrency Control (OCC) via Version Field (Selected)**: The smallest, most robust mechanism compatible with the current architecture. Guarantees that concurrent writes detect conflicting updates without distributed infrastructure.

### 3.2 Consistency Guarantee

- **Guarantee**: **First-Committed-Wins with Stale Write Rejection**.
- **Isolation Level**: Read Committed with atomic row-level conditional update (`UPDATE payments SET ... WHERE id = :id AND version = :expectedPriorVersion`).
- **Atomic Mutation Rule**:
  - Initial creation (`version = 1`): Checks whether the payment already exists in the database with `version > 1`. If it has already progressed, any stale `version = 1` overwrite is strictly rejected with [`PaymentOptimisticLockException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/optimistic-lock.exception.ts).
  - Lifecycle transition (`version = N > 1`): The repository executes:
    ```sql
    UPDATE payments
    SET status = :status, paid_at = :paidAt, version = :version, updated_at = :updatedAt
    WHERE id = :id AND version = (:version - 1);
    ```
    If `affected_rows == 0`, a concurrent worker has already modified or transitioned the record. The transaction immediately rolls back and throws [`PaymentOptimisticLockException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/optimistic-lock.exception.ts) (which inherits from [`SaleOptimisticLockException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/optimistic-lock.exception.ts)).
  - HTTP Translation: Caught by [`SalesExceptionFilter`](file:///c:/Projects/kinergy-platform/apps/api/src/sales/filters/sales-exception.filter.ts) and translated to RFC-compliant HTTP `409 Conflict`.

### 3.3 Concurrent Transition Race Scenario

Consider two application requests arriving simultaneously for a `PENDING` payment ($v_1$):

```text
Database: Payment(id: P1, status: PENDING, version: 1)

Thread A: Loads P1 (v1, PENDING)
Thread B: Loads P1 (v1, PENDING)

Thread A: payment.complete() -> status: COMPLETED, version: 2
Thread B: payment.cancel()   -> status: CANCELLED, version: 2

Thread A: repo.save() -> UPDATE WHERE id = 'P1' AND version = 1
          Rows affected: 1. Committed!
          Database: Payment(id: P1, status: SETTLED, version: 2)

Thread B: repo.save() -> UPDATE WHERE id = 'P1' AND version = 1
          Rows affected: 0. Conflict detected!
          Throws: PaymentOptimisticLockException (409 Conflict)
          Rollback! Request B CANNOT overwrite Request A's completed state.

Thread B (Client Retry):
          Thread B re-reads P1 from DB -> status: COMPLETED (v2).
          Thread B attempts payment.cancel() on COMPLETED aggregate.
          Domain State Machine: InvalidPaymentTransitionException:
          "Cannot transition payment from 'COMPLETED' to 'CANCELLED'".
          Forbidden transition blocked before reaching persistence.
```

---

## 4. Schema & Migration Audit

An audit of [`prisma/schema.prisma`](file:///c:/Projects/kinergy-platform/prisma/schema.prisma) and existing migration [`20260921000000_add_payments_domain_persistence`](file:///c:/Projects/kinergy-platform/prisma/migrations/20260921000000_add_payments_domain_persistence/migration.sql) reveals:

- Column `version INTEGER NOT NULL DEFAULT 1` is **already present** in the `payments` table.
- Column `paid_at TIMESTAMP(3)` is **already present** in the `payments` table.
- Column `status "PaymentStatus" NOT NULL DEFAULT 'SETTLED'` is **already present**.
- Foreign key `payments_sale_id_fkey` restricts orphan payments.
- Secondary indexes `payments_status_idx` and `payments_tenant_id_status_idx` support high-performance filtered queries.

**Conclusion**: No database schema change or new SQL migration is required. The PostgreSQL table schema already possesses the necessary primitive fields for OCC and lifecycle persistence.
