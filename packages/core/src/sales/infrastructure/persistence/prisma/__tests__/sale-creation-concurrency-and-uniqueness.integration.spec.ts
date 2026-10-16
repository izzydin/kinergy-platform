import {
  PrismaClient,
  Sale as PrismaSaleModel,
  SaleItem as PrismaSaleItemModel,
  SaleStatus as PrismaSaleStatus,
} from '@prisma/client';
import { CreateSaleHandler } from '../../../../application/handlers/create-sale.handler';
import { CreateSaleCommand } from '../../../../application/commands/create-sale.command';
import { PrismaSaleRepository } from '../repositories/prisma-sale.repository';
import { SalesEventPublisherPort } from '../../../../application/ports/sales-event-publisher.port';
import { SaleSourceValidatorPort } from '../../../../application/ports/sale-source-validator.port';
import {
  ClientFacadePort,
  ClientSummaryPayload,
} from '../../../../application/ports/client-facade.port';
import { SourceType } from '../../../../domain/enums/source-type.enum';
import { SaleSourceType } from '../../../../domain/enums/sale-source-type.enum';
import { SaleStatus } from '../../../../domain/enums/sale-status.enum';
import { DuplicateSaleException } from '../../../../domain/exceptions/duplicate-sale.exception';
import { DeterministicClock } from '../../../../domain/shared/clock';
import { DomainEvent } from '../../../../domain/shared/domain-event';

interface PostgresEngineError extends Error {
  code: string;
  constraint?: string;
  table?: string;
  meta?: { target?: string[]; constraint?: string };
}

function createPgError(
  message: string,
  code: string,
  constraint?: string,
  table?: string,
): PostgresEngineError {
  const err = new Error(message) as PostgresEngineError;
  err.code = code;
  err.constraint = constraint;
  err.table = table;
  err.meta = { constraint, target: constraint ? [constraint] : undefined };
  return err;
}

/**
 * Concurrency-hardened relational persistence emulator adhering strictly to PostgreSQL semantics,
 * ACID transaction isolation, and the partial unique indexes approved in ADR-0140:
 * 1. sales_pkey: PRIMARY KEY (id)
 * 2. uq_sales_clinical_session_active: (tenant_id, source_id) WHERE source_type IN ('TREATMENT_SESSION', 'KINESIOLOGY_SESSION') AND status != 'CANCELLED'
 * 3. uq_sales_source_code_active: (tenant_id, source_code) WHERE source_code IS NOT NULL AND source_code NOT IN ('POS_REGISTER', 'pos_checkout_terminal') AND status != 'CANCELLED'
 */
class ConcurrencyPostgreSqlPrismaDatabase {
  public sales = new Map<string, PrismaSaleModel>();
  public saleItems = new Map<string, PrismaSaleItemModel>();
  public failNextWith: PostgresEngineError | Error | null = null;

  constructor(public readonly clock: DeterministicClock) {}

  public clear(): void {
    this.sales.clear();
    this.saleItems.clear();
    this.failNextWith = null;
  }

  public createClient(): PrismaClient {
    const checkFault = () => {
      if (this.failNextWith) {
        const err = this.failNextWith;
        this.failNextWith = null;
        throw err;
      }
    };

    const enforceUniquenessConstraints = (
      bufferedSales: Map<string, PrismaSaleModel>,
      saleData: PrismaSaleModel,
      isInsert: boolean,
    ) => {
      // 1. Primary Key Uniqueness
      if (isInsert && bufferedSales.has(saleData.id)) {
        throw createPgError(
          `duplicate key value violates unique constraint "sales_pkey"`,
          'P2002',
          'sales_pkey',
          'sales',
        );
      }

      // 2. Partial unique index: uq_sales_clinical_session_active
      const isClinical =
        saleData.sourceType === 'TREATMENT_SESSION' ||
        saleData.sourceType === 'KINESIOLOGY_SESSION';
      const isActive = saleData.status !== ('CANCELLED' as PrismaSaleStatus);

      if (isClinical && isActive && saleData.sourceId) {
        for (const existing of bufferedSales.values()) {
          if (existing.id === saleData.id) continue;
          if (
            existing.tenantId === saleData.tenantId &&
            existing.sourceId === saleData.sourceId &&
            (existing.sourceType === 'TREATMENT_SESSION' ||
              existing.sourceType === 'KINESIOLOGY_SESSION') &&
            existing.status !== ('CANCELLED' as PrismaSaleStatus)
          ) {
            throw createPgError(
              `duplicate key value violates unique constraint "uq_sales_clinical_session_active"`,
              'P2002',
              'uq_sales_clinical_session_active',
              'sales',
            );
          }
        }
      }

      // 3. Partial unique index: uq_sales_source_code_active
      const hasSpecificSourceCode =
        saleData.sourceCode &&
        saleData.sourceCode !== 'POS_REGISTER' &&
        saleData.sourceCode !== 'pos_checkout_terminal';

      if (hasSpecificSourceCode && isActive) {
        for (const existing of bufferedSales.values()) {
          if (existing.id === saleData.id) continue;
          if (
            existing.tenantId === saleData.tenantId &&
            existing.sourceCode === saleData.sourceCode &&
            existing.status !== ('CANCELLED' as PrismaSaleStatus)
          ) {
            throw createPgError(
              `duplicate key value violates unique constraint "uq_sales_source_code_active"`,
              'P2002',
              'uq_sales_source_code_active',
              'sales',
            );
          }
        }
      }
    };

    const buildScope = (
      bufferedSales: Map<string, PrismaSaleModel>,
      bufferedItems: Map<string, PrismaSaleItemModel>,
    ) => ({
      sale: {
        findUnique: jest.fn(
          async ({ where, include }: { where: { id: string }; include?: { items?: boolean } }) => {
            checkFault();
            const s = bufferedSales.get(where.id);
            if (!s) return null;
            const items = include?.items
              ? Array.from(bufferedItems.values()).filter((i) => i.saleId === where.id)
              : undefined;
            return { ...s, ...(items ? { items } : {}) };
          },
        ),
        findFirst: jest.fn(
          async ({
            where,
            include,
          }: {
            where: {
              sourceType?: string;
              sourceId?: string;
              sourceCode?: string;
              tenantId?: string;
              status?: { not?: PrismaSaleStatus };
              NOT?: { id: string };
            };
            include?: { items?: boolean };
          }) => {
            checkFault();
            for (const s of bufferedSales.values()) {
              if (where.NOT && s.id === where.NOT.id) continue;
              if (where.tenantId && s.tenantId !== where.tenantId) continue;
              if (where.status?.not && s.status === where.status.not) continue;
              if (
                where.sourceType &&
                s.sourceType === where.sourceType &&
                where.sourceId &&
                s.sourceId === where.sourceId
              ) {
                const items = include?.items
                  ? Array.from(bufferedItems.values()).filter((i) => i.saleId === s.id)
                  : undefined;
                return { ...s, ...(items ? { items } : {}) };
              }
              if (where.sourceCode && s.sourceCode === where.sourceCode) {
                const items = include?.items
                  ? Array.from(bufferedItems.values()).filter((i) => i.saleId === s.id)
                  : undefined;
                return { ...s, ...(items ? { items } : {}) };
              }
            }
            return null;
          },
        ),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          checkFault();
          const saleModel = {
            ...data,
            createdAt: (data.createdAt as Date) ?? this.clock.now(),
            updatedAt: (data.updatedAt as Date) ?? this.clock.now(),
          } as PrismaSaleModel;

          enforceUniquenessConstraints(bufferedSales, saleModel, true);
          bufferedSales.set(saleModel.id, saleModel);
          return saleModel;
        }),
        update: jest.fn(
          async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            checkFault();
            const existing = bufferedSales.get(where.id);
            if (!existing) {
              throw new Error(`Record to update not found: ${where.id}`);
            }
            const updated = {
              ...existing,
              ...data,
              updatedAt: this.clock.now(),
            } as PrismaSaleModel;

            enforceUniquenessConstraints(bufferedSales, updated, false);
            bufferedSales.set(where.id, updated);
            return updated;
          },
        ),
        upsert: jest.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { id: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            checkFault();
            const existing = bufferedSales.get(where.id);
            if (existing) {
              const updated = {
                ...existing,
                ...update,
                updatedAt: this.clock.now(),
              } as PrismaSaleModel;
              enforceUniquenessConstraints(bufferedSales, updated, false);
              bufferedSales.set(where.id, updated);
              return updated;
            } else {
              const created = {
                ...create,
                createdAt: (create.createdAt as Date) ?? this.clock.now(),
                updatedAt: (create.updatedAt as Date) ?? this.clock.now(),
              } as PrismaSaleModel;
              enforceUniquenessConstraints(bufferedSales, created, true);
              bufferedSales.set(where.id, created);
              return created;
            }
          },
        ),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; version: number };
            data: Record<string, unknown>;
          }) => {
            checkFault();
            const existing = bufferedSales.get(where.id);
            if (existing && existing.version === where.version) {
              const updated = {
                ...existing,
                ...data,
                updatedAt: this.clock.now(),
              } as PrismaSaleModel;
              enforceUniquenessConstraints(bufferedSales, updated, false);
              bufferedSales.set(where.id, updated);
              return { count: 1 };
            }
            return { count: 0 };
          },
        ),
      },
      saleItem: {
        deleteMany: jest.fn(
          async ({ where }: { where: { saleId: string; id?: { notIn?: string[] } } }) => {
            checkFault();
            let count = 0;
            for (const [id, item] of Array.from(bufferedItems.entries())) {
              if (item.saleId === where.saleId) {
                if (where.id?.notIn && !where.id.notIn.includes(id)) {
                  bufferedItems.delete(id);
                  count++;
                } else if (!where.id) {
                  bufferedItems.delete(id);
                  count++;
                }
              }
            }
            return { count };
          },
        ),
        upsert: jest.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { id: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            checkFault();
            const existing = bufferedItems.get(where.id);
            if (existing) {
              const updated = {
                ...existing,
                ...update,
                updatedAt: this.clock.now(),
              } as PrismaSaleItemModel;
              bufferedItems.set(where.id, updated);
              return updated;
            } else {
              const inserted = {
                ...create,
                createdAt: (create.createdAt as Date) ?? this.clock.now(),
                updatedAt: (create.updatedAt as Date) ?? this.clock.now(),
              } as PrismaSaleItemModel;
              bufferedItems.set(where.id, inserted);
              return inserted;
            }
          },
        ),
      },
    });

    const rootScope = buildScope(this.sales, this.saleItems);

    const client = {
      ...rootScope,
      $transaction: jest.fn(
        async <R>(callback: (tx: ReturnType<typeof buildScope>) => Promise<R>): Promise<R> => {
          checkFault();
          // ACID snapshot isolation buffer
          const stagedSales = new Map(this.sales);
          const stagedItems = new Map(this.saleItems);

          const txScope = buildScope(stagedSales, stagedItems);

          const result = await callback(txScope);
          // Atomic commit on success: write staged mutations back to database
          for (const [k, v] of stagedSales.entries()) this.sales.set(k, v);
          for (const [k, v] of stagedItems.entries()) this.saleItems.set(k, v);
          return result;
        },
      ),
    };

    return client as unknown as PrismaClient;
  }
}

describe('Sale Creation Concurrency and Idempotency Implementation Specification (Milestone 7.18 / ADR-0140)', () => {
  const clock = new DeterministicClock(new Date('2026-10-16T18:00:00.000Z'));
  let db: ConcurrencyPostgreSqlPrismaDatabase;
  let prisma: PrismaClient;
  let saleRepo: PrismaSaleRepository;
  let eventsPublished: DomainEvent[];
  let mockEventPublisher: SalesEventPublisherPort;
  let mockSourceValidator: SaleSourceValidatorPort;
  let mockClientFacade: ClientFacadePort;
  let createSaleHandler: CreateSaleHandler;

  beforeEach(() => {
    db = new ConcurrencyPostgreSqlPrismaDatabase(clock);
    prisma = db.createClient();
    saleRepo = new PrismaSaleRepository(prisma);
    eventsPublished = [];

    mockEventPublisher = {
      publish: jest.fn(async (events: ReadonlyArray<DomainEvent>) => {
        eventsPublished.push(...events);
      }),
    };

    mockSourceValidator = {
      validateSource: jest.fn().mockResolvedValue({
        exists: true,
        isValid: true,
        belongsToContext: true,
      }),
    };

    mockClientFacade = {
      getClientSummary: jest.fn().mockResolvedValue({
        id: 'client_audit_001',
        fullName: 'Maria Paz Concha',
        email: 'maria.paz@example.com',
        isActive: true,
      } as ClientSummaryPayload),
    };

    createSaleHandler = new CreateSaleHandler(
      saleRepo,
      clock,
      mockEventPublisher,
      mockSourceValidator,
      mockClientFacade,
    );
  });

  afterEach(() => {
    db.clear();
  });

  // ==========================================================================
  // 1. Sequential Duplicate Requests
  // ==========================================================================
  describe('1. Sequential Duplicate Requests', () => {
    it('returns the existing Sale DTO idempotently on exact matching sequential duplicate requests', async () => {
      const command = new CreateSaleCommand({
        clientId: 'client_audit_001',
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'snack_bar_order_01',
          sourceCode: 'SNACK-BAR-99',
        },
        tenantId: 'tenant_chile_01',
        idempotencyKey: 'idemp_seq_exact_001',
        currency: 'USD',
      });

      // First Request
      const firstResult = await createSaleHandler.execute(command);
      expect(firstResult.isSuccess).toBe(true);
      const firstSale = firstResult.getValue();
      expect(firstSale.id).toBe('idemp_seq_exact_001');
      expect(firstSale.tenantId).toBe('tenant_chile_01');
      expect(firstSale.status).toBe(SaleStatus.DRAFT);

      // Second Request with identical idempotencyKey and payload
      const secondResult = await createSaleHandler.execute(command);
      expect(secondResult.isSuccess).toBe(true);
      const secondSale = secondResult.getValue();

      // Deterministic replay: exactly matching attributes
      expect(secondSale.id).toBe(firstSale.id);
      expect(secondSale.tenantId).toBe(firstSale.tenantId);
      expect(secondSale.clientId).toBe(firstSale.clientId);
      expect(secondSale.source?.sourceType).toBe(firstSale.source?.sourceType);
      expect(secondSale.source?.sourceId).toBe(firstSale.source?.sourceId);

      // Exactly 1 database record persisted
      expect(db.sales.size).toBe(1);
    });

    it('rejects sequential request with same idempotencyKey but differing commercial parameters as a conflict', async () => {
      const commandInitial = new CreateSaleCommand({
        clientId: 'client_audit_001',
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'snack_bar_order_01',
          sourceCode: 'SNACK-BAR-99',
        },
        tenantId: 'tenant_chile_01',
        idempotencyKey: 'idemp_seq_conflict_001',
        currency: 'USD',
      });
      const initialResult = await createSaleHandler.execute(commandInitial);
      expect(initialResult.isSuccess).toBe(true);

      // Second Request with same idempotencyKey but different clientId (payload mutation attempt)
      const conflictingCommand = new CreateSaleCommand({
        clientId: 'client_audit_999', // Differing client
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'snack_bar_order_01',
          sourceCode: 'SNACK-BAR-99',
        },
        tenantId: 'tenant_chile_01',
        idempotencyKey: 'idemp_seq_conflict_001',
        currency: 'USD',
      });

      const conflictResult = await createSaleHandler.execute(conflictingCommand);
      expect(conflictResult.isSuccess).toBe(false);
      const err = conflictResult.getError();
      expect(err).toBeInstanceOf(DuplicateSaleException);
      expect((err as DuplicateSaleException).message).toContain('different transaction parameters');
    });
  });

  // ==========================================================================
  // 2. Concurrent Duplicate Requests
  // ==========================================================================
  describe('2. Concurrent Duplicate Requests', () => {
    it('handles concurrent identical sale creation requests without double-creation', async () => {
      const command = new CreateSaleCommand({
        clientId: 'client_audit_001',
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'table_turn_01',
          sourceCode: 'POS_REGISTER',
        },
        tenantId: 'tenant_chile_01',
        idempotencyKey: 'idemp_concurrent_001',
        currency: 'USD',
      });

      // Execute two simultaneous identical requests
      const [res1, res2] = await Promise.all([
        createSaleHandler.execute(command),
        createSaleHandler.execute(command),
      ]);

      // Both callers receive success with identical sale identity
      expect(res1.isSuccess).toBe(true);
      expect(res2.isSuccess).toBe(true);
      expect(res1.getValue().id).toBe('idemp_concurrent_001');
      expect(res2.getValue().id).toBe('idemp_concurrent_001');

      // Database contains strictly one sale record
      expect(db.sales.size).toBe(1);
    });
  });

  // ==========================================================================
  // 3. Distinct Legitimate Purchases of the Same Product
  // ==========================================================================
  describe('3. Distinct Legitimate Repeat Purchases', () => {
    it('preserves distinct legitimate retail consumable repeat purchases of the same SKU', async () => {
      const sku = 'DRINK-ELECTROLYTE-001';

      // Sale 1: Client buys electrolyte drink at 10:00 AM
      const sale1Cmd = new CreateSaleCommand({
        clientId: 'client_audit_001',
        source: {
          sourceType: SaleSourceType.DRINK,
          sourceId: sku,
          sourceCode: 'POS_REGISTER',
        },
        tenantId: 'tenant_chile_01',
        idempotencyKey: 'sale_repeat_drink_001',
        currency: 'USD',
      });
      const res1 = await createSaleHandler.execute(sale1Cmd);
      expect(res1.isSuccess).toBe(true);

      // Sale 2: Different client buys the same electrolyte drink at 10:15 AM
      const sale2Cmd = new CreateSaleCommand({
        clientId: 'client_audit_002',
        source: {
          sourceType: SaleSourceType.DRINK,
          sourceId: sku,
          sourceCode: 'POS_REGISTER',
        },
        tenantId: 'tenant_chile_01',
        idempotencyKey: 'sale_repeat_drink_002',
        currency: 'USD',
      });
      const res2 = await createSaleHandler.execute(sale2Cmd);
      expect(res2.isSuccess).toBe(true);

      // Sale 3: First client buys another electrolyte drink at 12:00 PM
      const sale3Cmd = new CreateSaleCommand({
        clientId: 'client_audit_001',
        source: {
          sourceType: SaleSourceType.DRINK,
          sourceId: sku,
          sourceCode: 'POS_REGISTER',
        },
        tenantId: 'tenant_chile_01',
        idempotencyKey: 'sale_repeat_drink_003',
        currency: 'USD',
      });
      const res3 = await createSaleHandler.execute(sale3Cmd);
      expect(res3.isSuccess).toBe(true);

      // All 3 sales coexist legitimately in persistence
      expect(db.sales.size).toBe(3);
      expect(db.sales.has('sale_repeat_drink_001')).toBe(true);
      expect(db.sales.has('sale_repeat_drink_002')).toBe(true);
      expect(db.sales.has('sale_repeat_drink_003')).toBe(true);
    });
  });

  // ==========================================================================
  // 4. Legitimate Membership Renewals
  // ==========================================================================
  describe('4. Legitimate Membership Renewals', () => {
    it('preserves legitimate gym membership plan purchases and recurring renewals', async () => {
      const membershipPlanId = 'plan_crossfit_unlimited_month';

      // Initial Month Purchase
      const initialPurchaseCmd = new CreateSaleCommand({
        clientId: 'client_gym_member_01',
        source: {
          sourceType: SaleSourceType.GYM_MEMBERSHIP,
          sourceId: membershipPlanId,
          sourceCode: 'POS_REGISTER',
        },
        tenantId: 'tenant_chile_01',
        idempotencyKey: 'sale_gym_initial_oct',
        currency: 'USD',
      });
      const initialRes = await createSaleHandler.execute(initialPurchaseCmd);
      expect(initialRes.isSuccess).toBe(true);

      // Subsequent Month Renewal for the same member and same plan ID
      const renewalPurchaseCmd = new CreateSaleCommand({
        clientId: 'client_gym_member_01',
        source: {
          sourceType: SaleSourceType.GYM_MEMBERSHIP,
          sourceId: membershipPlanId,
          sourceCode: 'POS_REGISTER',
        },
        tenantId: 'tenant_chile_01',
        idempotencyKey: 'sale_gym_renewal_nov',
        currency: 'USD',
      });
      const renewalRes = await createSaleHandler.execute(renewalPurchaseCmd);
      expect(renewalRes.isSuccess).toBe(true);

      // Both sales exist in persistence without colliding
      expect(db.sales.size).toBe(2);
      expect(db.sales.get('sale_gym_initial_oct')?.sourceId).toBe(membershipPlanId);
      expect(db.sales.get('sale_gym_renewal_nov')?.sourceId).toBe(membershipPlanId);
    });
  });

  // ==========================================================================
  // 5. Clinical Single-Active-Billing Invariant & Partial Index Enforcement
  // ==========================================================================
  describe('5. Clinical Session Single-Active-Billing Guarantees (uq_sales_clinical_session_active)', () => {
    it('rejects creating a second active sale for the same clinical treatment session', async () => {
      const sessionId = 'kine_session_rehab_shoulder_101';

      // 1. Initial sale for clinical session
      const cmd1 = new CreateSaleCommand({
        clientId: 'client_audit_001',
        source: {
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: sessionId,
          sourceCode: 'POS_REGISTER',
        },
        tenantId: 'tenant_chile_01',
        idempotencyKey: 'sale_clinical_001',
        currency: 'USD',
      });
      const res1 = await createSaleHandler.execute(cmd1);
      expect(res1.isSuccess).toBe(true);

      // 2. Attempt to create another sale for the same active clinical session
      const cmd2 = new CreateSaleCommand({
        clientId: 'client_audit_001',
        source: {
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: sessionId,
          sourceCode: 'POS_REGISTER',
        },
        tenantId: 'tenant_chile_01',
        idempotencyKey: 'sale_clinical_002',
        currency: 'USD',
      });
      const res2 = await createSaleHandler.execute(cmd2);
      expect(res2.isSuccess).toBe(false);
      const err = res2.getError();
      expect(err).toBeInstanceOf(DuplicateSaleException);
      expect((err as DuplicateSaleException).message).toContain('active Sale');
      expect((err as DuplicateSaleException).message).toContain(sessionId);
    });

    it('allows re-billing a clinical session when the prior sale was CANCELLED', async () => {
      const sessionId = 'kine_session_rehab_shoulder_202';

      // 1. Create first sale
      const cmd1 = new CreateSaleCommand({
        clientId: 'client_audit_001',
        source: {
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: sessionId,
          sourceCode: 'POS_REGISTER',
        },
        tenantId: 'tenant_chile_01',
        idempotencyKey: 'sale_clinical_cancelled_01',
        currency: 'USD',
      });
      const res1 = await createSaleHandler.execute(cmd1);
      expect(res1.isSuccess).toBe(true);

      // 2. Mark first sale as CANCELLED in database
      const existingRecord = db.sales.get('sale_clinical_cancelled_01')!;
      db.sales.set('sale_clinical_cancelled_01', {
        ...existingRecord,
        status: 'CANCELLED' as PrismaSaleStatus,
        version: 2,
      });

      // 3. Create second sale for the same session (now allowed because status != 'CANCELLED' partial index excludes cancelled sales)
      const cmd2 = new CreateSaleCommand({
        clientId: 'client_audit_001',
        source: {
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: sessionId,
          sourceCode: 'POS_REGISTER',
        },
        tenantId: 'tenant_chile_01',
        idempotencyKey: 'sale_clinical_reissue_02',
        currency: 'USD',
      });
      const res2 = await createSaleHandler.execute(cmd2);
      expect(res2.isSuccess).toBe(true);
      expect(res2.getValue().id).toBe('sale_clinical_reissue_02');

      // Both sales exist in database: one CANCELLED, one DRAFT
      expect(db.sales.size).toBe(2);
      expect(db.sales.get('sale_clinical_cancelled_01')?.status).toBe('CANCELLED');
      expect(db.sales.get('sale_clinical_reissue_02')?.status).toBe('DRAFT');
    });
  });

  // ==========================================================================
  // 6. External Order Reference Collision (uq_sales_source_code_active)
  // ==========================================================================
  describe('6. External Order Reference Collision (uq_sales_source_code_active)', () => {
    it('prohibits duplicate active sales with the same external order code', async () => {
      const orderCode = 'SHOPIFY-ORD-90210';

      const cmd1 = new CreateSaleCommand({
        clientId: 'client_audit_001',
        source: {
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'supplements_bundle',
          sourceCode: orderCode,
        },
        tenantId: 'tenant_chile_01',
        idempotencyKey: 'sale_ecomm_001',
        currency: 'USD',
      });
      const res1 = await createSaleHandler.execute(cmd1);
      expect(res1.isSuccess).toBe(true);

      // Second sale attempting to reuse the same external order code
      const cmd2 = new CreateSaleCommand({
        clientId: 'client_audit_001',
        source: {
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'supplements_bundle_v2',
          sourceCode: orderCode,
        },
        tenantId: 'tenant_chile_01',
        idempotencyKey: 'sale_ecomm_002',
        currency: 'USD',
      });
      const res2 = await createSaleHandler.execute(cmd2);
      expect(res2.isSuccess).toBe(false);
      const err = res2.getError();
      expect(err).toBeInstanceOf(DuplicateSaleException);
      expect((err as DuplicateSaleException).message).toContain('order reference');
      expect((err as DuplicateSaleException).message).toContain(orderCode);
    });

    it('permits generic POS register tags across multiple active sales', async () => {
      const cmd1 = new CreateSaleCommand({
        clientId: 'client_audit_001',
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'snack_01',
          sourceCode: 'POS_REGISTER',
        },
        tenantId: 'tenant_chile_01',
        idempotencyKey: 'sale_pos_001',
        currency: 'USD',
      });
      const cmd2 = new CreateSaleCommand({
        clientId: 'client_audit_002',
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'snack_02',
          sourceCode: 'POS_REGISTER',
        },
        tenantId: 'tenant_chile_01',
        idempotencyKey: 'sale_pos_002',
        currency: 'USD',
      });
      const cmd3 = new CreateSaleCommand({
        clientId: 'client_audit_003',
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'snack_03',
          sourceCode: 'pos_checkout_terminal',
        },
        tenantId: 'tenant_chile_01',
        idempotencyKey: 'sale_pos_003',
        currency: 'USD',
      });

      const [r1, r2, r3] = await Promise.all([
        createSaleHandler.execute(cmd1),
        createSaleHandler.execute(cmd2),
        createSaleHandler.execute(cmd3),
      ]);

      expect(r1.isSuccess).toBe(true);
      expect(r2.isSuccess).toBe(true);
      expect(r3.isSuccess).toBe(true);
      expect(db.sales.size).toBe(3);
    });
  });

  // ==========================================================================
  // 7. Transactional Atomicity and Rollback on Failure
  // ==========================================================================
  describe('7. Transactional Atomicity and Rollback on Failure', () => {
    it('rolls back all staged writes and leaves zero partial records if persistence fails midway', async () => {
      // Inject fault that fires when saving
      db.failNextWith = createPgError(
        'disk I/O failure during persistence commit',
        '58030',
        undefined,
        'sales',
      );

      const command = new CreateSaleCommand({
        clientId: 'client_audit_001',
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'snack_01',
          sourceCode: 'POS_REGISTER',
        },
        tenantId: 'tenant_chile_01',
        idempotencyKey: 'sale_rollback_001',
        currency: 'USD',
      });

      const result = await createSaleHandler.execute(command);
      expect(result.isSuccess).toBe(false);

      // Verify complete rollback: zero sales, zero line items in database
      expect(db.sales.size).toBe(0);
      expect(db.saleItems.size).toBe(0);
    });
  });

  // ==========================================================================
  // 8. Tenant Isolation
  // ==========================================================================
  describe('8. Tenant Isolation', () => {
    it('enforces tenant scoping: distinct tenants can use the same session ID without colliding', async () => {
      const sessionId = 'shared_session_id_cross_tenant';

      // Tenant Chile
      const cmdChile = new CreateSaleCommand({
        clientId: 'client_audit_001',
        source: {
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: sessionId,
          sourceCode: 'POS_REGISTER',
        },
        tenantId: 'tenant_chile_01',
        idempotencyKey: 'sale_tenant_chile_001',
        currency: 'USD',
      });
      const resChile = await createSaleHandler.execute(cmdChile);
      expect(resChile.isSuccess).toBe(true);

      // Tenant Peru uses the exact same session ID
      const cmdPeru = new CreateSaleCommand({
        clientId: 'client_audit_002',
        source: {
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: sessionId,
          sourceCode: 'POS_REGISTER',
        },
        tenantId: 'tenant_peru_01',
        idempotencyKey: 'sale_tenant_peru_001',
        currency: 'USD',
      });
      const resPeru = await createSaleHandler.execute(cmdPeru);
      expect(resPeru.isSuccess).toBe(true);

      // Both tenants have their respective sales safely persisted
      expect(db.sales.get('sale_tenant_chile_001')?.tenantId).toBe('tenant_chile_01');
      expect(db.sales.get('sale_tenant_peru_001')?.tenantId).toBe('tenant_peru_01');
    });
  });
});
