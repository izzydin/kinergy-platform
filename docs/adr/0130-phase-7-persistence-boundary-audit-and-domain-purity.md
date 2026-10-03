# 0130. Phase 7 Persistence-Boundary Audit and Domain Purity Hardening

- **Status**: Accepted
- **Date**: 2026-10-03
- **Deciders**: Principal Architect, Domain Model Lead, Lead Financial Systems Engineer
- **Context**: Kinergy Platform Phase 7 (Sales & Payments — Hexagonal Architecture Persistence-Boundary Audit). The domain layer (`packages/core/src/sales/domain`) must maintain zero knowledge of database persistence technologies, Prisma Client, Prisma models, Prisma enums, and database drivers. This audit searches the repository for Prisma artifacts, classifies every occurrence, and eliminates all persistence leakage from domain entities, value objects, aggregates, and domain unit specifications.
- **Consulted ADRs**:
  - [ADR-0011: Prisma ORM Persistence Infrastructure Setup](0011-prisma-orm-persistence-infrastructure.md)
  - [ADR-0110: Sale Ownership](0110-sale-ownership.md)
  - [ADR-0115: Payment Domain Canonical Architecture](0115-payment-domain-canonical-architecture.md)
  - [ADR-0117: Receipt Domain Boundary and Document Model](0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0122: Phase 7 Financial Persistence Architecture](0122-phase-7-financial-persistence-architecture.md)
  - [ADR-0125: Phase 7 Transaction Architecture and Atomic Persistence Boundaries](0125-phase-7-transaction-architecture-and-atomic-boundaries.md)
  - [ADR-0126: Phase 7 Hexagonal Architecture Repository Reconciliation](0126-phase-7-hexagonal-architecture-repository-reconciliation.md)
  - [ADR-0129: Phase 7 Prisma Schema Architectural Review and Final Integrity Verification](0129-phase-7-prisma-schema-architectural-review.md)

---

## 1. Context and Problem Statement

In Onion / Clean / Hexagonal Architecture:

1. **The Domain Layer** (`packages/core/src/sales/domain`) represents the core enterprise business logic and aggregates. It must remain pure TypeScript, free from any ORM annotations, database dependencies, or infrastructure libraries.
2. **The Application Layer** (`packages/core/src/sales/application`) orchestrates use cases via abstract ports (`SaleRepositoryPort`, `PaymentRepositoryPort`, `ReceiptRepositoryPort`). It must never import Prisma types directly.
3. **The Infrastructure Layer** (`packages/core/src/sales/infrastructure/persistence/prisma`) adapts the domain to PostgreSQL using Prisma Client, mappers, and repository implementations.

A common anti-pattern in growing codebases is "test-level persistence leakage", where developers write tests inside `domain/__tests__` that import Prisma mappers, repositories, or `@prisma/client` types. While non-test domain files remained pure, these test-level imports blurred aggregate boundaries and violated hexagonal isolation.

---

## 2. Comprehensive Repository-Wide Prisma Artifact Inventory & Classification

All occurrences of `PrismaClient`, `Prisma.Decimal`, `@prisma/client`, Prisma enums, and Prisma model types across the repository have been classified into four architectural tiers:

```
┌────────────────────────────────────────────────────────────────────────┐
│              PERSISTENCE BOUNDARY CLASSIFICATION MATRIX                │
├──────────────────────────┬─────────────────────────────────────────────┤
│ ARCHITECTURAL TIER       │ LOCATION & APPROVED ARTIFACTS               │
├──────────────────────────┼─────────────────────────────────────────────┤
│ 1. Persistence Adapters  │ packages/core/src/sales/infrastructure/     │
│    & Mappers             │ persistence/prisma/mappers/*                │
│                          │ • PrismaSaleMapper                          │
│                          │ • PrismaSaleItemMapper                      │
│                          │ • PrismaPaymentMapper                       │
│                          │ • PrismaReceiptMapper                       │
│                          │ • PrismaMoneyMapper                         │
├──────────────────────────┼─────────────────────────────────────────────┤
│ 2. Repository Adapters   │ packages/core/src/sales/infrastructure/     │
│    & Generators          │ persistence/prisma/repositories/*           │
│                          │ • PrismaSaleRepository                      │
│                          │ • PrismaPaymentRepository                   │
│                          │ • PrismaReceiptRepository                   │
│                          │ • PrismaReceiptSequenceGenerator            │
├──────────────────────────┼─────────────────────────────────────────────┤
│ 3. Approved Integration  │ apps/api/*, apps/web/server/*, prisma/*     │
│    & Test Fixtures       │ • prisma/seed.ts & prisma/seeds/*           │
│                          │ • packages/testing/src/*                    │
│                          │ • packages/core/src/*/infrastructure/*      │
├──────────────────────────┼─────────────────────────────────────────────┤
│ 4. Domain Layer          │ packages/core/src/sales/domain/*            │
│    (STRICTLY FORBIDDEN)  │ • entities/, value-objects/, aggregates,    │
│                          │   services/, enums/, exceptions/, tests     │
│                          │ • AUDIT RESULT: ZERO PRISMA OCCURRENCES     │
└──────────────────────────┴─────────────────────────────────────────────┘
```

---

## 3. Subdomain-by-Subdomain Purity Audit

| Domain Subdomain      | Canonical Domain Path                                            | Prisma Imports Count | Purity Status |
| :-------------------- | :--------------------------------------------------------------- | :------------------: | :-----------: |
| **Sale Domain**       | `packages/core/src/sales/domain/sale.aggregate.ts`               |        **0**         | **100% Pure** |
| **SaleItem Domain**   | `packages/core/src/sales/domain/entities/sale-item.entity.ts`    |        **0**         | **100% Pure** |
| **Discount Domain**   | `packages/core/src/sales/domain/value-objects/discount.vo.ts`    |        **0**         | **100% Pure** |
| **Payment Domain**    | `packages/core/src/sales/domain/payment.aggregate.ts`            |        **0**         | **100% Pure** |
| **Receipt Domain**    | `packages/core/src/sales/domain/receipt.aggregate.ts`            |        **0**         | **100% Pure** |
| **SaleSource Domain** | `packages/core/src/sales/domain/value-objects/sale-source.vo.ts` |        **0**         | **100% Pure** |

---

## 4. Remediation of Test-Level Persistence Leakage

During this audit, four test files in `packages/core/src/sales/domain/__tests__` were identified as containing lingering Prisma infrastructure imports. Each persistence assertion was relocated to its authoritative infrastructure test suite:

1. **`sale-cancelled-immutability.spec.ts`**:
   - _Leakage_: Section 7 ("Persistence-Level Immutability Guard") imported `PrismaSaleRepository` and `PrismaClient`.
   - _Remediation_: Relocated persistence immutability assertions to [`sale-repository-aggregate-boundary.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/__tests__/sale-repository-aggregate-boundary.spec.ts). Removed all `@prisma/client` and repository imports from `domain/__tests__`.
2. **`sale-item-ownership-hardening.spec.ts`**:
   - _Leakage_: Section 7 ("Persistence Consistency & Anti-Bypass Protections") imported `PrismaSaleItemMapper` and `PrismaSaleMapper`.
   - _Remediation_: Relocated detached-item and cross-sale mapper assertions to [`sale-item-persistence.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/__tests__/sale-item-persistence.spec.ts). Removed mapper imports from `domain/__tests__`.
3. **`sale-aggregate-complete-behavioral.spec.ts`**:
   - _Leakage_: Section 8 ("Persistence & Atomicity Guarantees") imported `PrismaSaleMapper`, `PrismaSaleItemMapper`, `PrismaSaleRepository`, and `@prisma/client`.
   - _Remediation_: Relocated database total tampering detection to [`prisma-domain-full-mapping-roundtrip.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/__tests__/prisma-domain-full-mapping-roundtrip.spec.ts). Removed all Prisma imports from the behavioral test suite.
4. **`payment-status.spec.ts`**:
   - _Leakage_: Section 6 ("Persistence Boundary Conversion") imported `PrismaPaymentMapper` and `PaymentStatus as PrismaPaymentStatus`.
   - _Remediation_: Relocated bidirectional status mapper assertions to [`prisma-payment-persistence-roundtrip.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/__tests__/prisma-payment-persistence-roundtrip.spec.ts). Removed mapper and `@prisma/client` imports from `payment-status.spec.ts`.

---

## 5. Architectural Linter Verification

The automated boundary verification test in [`phase-7-3-discount-test-matrix.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/phase-7-3-discount-test-matrix.spec.ts) confirms that no file in `packages/core/src/sales/domain` imports any of the following forbidden dependencies:

- `@prisma` / `prisma`
- `@nestjs`
- `express` / `axios` / `fetch`
- foreign domain models (`gym/domain`, `kinesiology/domain`, `resources/domain`, `scheduling/domain`)

---

## 6. Verification and Impact

- **Domain Independence**: All Phase 7 domain aggregates, entities, value objects, domain services, exceptions, and unit test suites have zero coupling to Prisma or database persistence mechanisms.
- **Mapping Strategy**: Data transformation is handled strictly by explicit, bidirectional mapper functions (`PrismaSaleMapper`, `PrismaPaymentMapper`, `PrismaReceiptMapper`) residing within infrastructure.
- **Repository Isolation**: Repositories implement abstract application ports (`SaleRepositoryPort`, etc.) and encapsulate all Prisma Client interactions and transaction handling.
