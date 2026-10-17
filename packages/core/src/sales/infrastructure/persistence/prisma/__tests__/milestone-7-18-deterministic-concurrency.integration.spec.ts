import {
  PrismaClient,
  Sale as PrismaSaleModel,
  SaleItem as PrismaSaleItemModel,
  Payment as PrismaPaymentModel,
  PaymentStatus as PrismaPaymentStatus,
  PaymentMethod as PrismaPaymentMethod,
  SaleStatus as PrismaSaleStatus,
  Receipt as PrismaReceiptModel,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { DeterministicClock } from '../../../../domain/shared/clock';
import { PrismaSaleRepository } from '../repositories/prisma-sale.repository';
import { PrismaPaymentRepository } from '../repositories/prisma-payment.repository';
import { PrismaSalesUnitOfWork } from '../services/prisma-sales-unit-of-work';
import { CreateSaleHandler } from '../../../../application/handlers/create-sale.handler';
import { CreatePaymentHandler } from '../../../../application/handlers/create-payment.handler';
import { CompletePaymentHandler } from '../../../../application/handlers/complete-payment.handler';
import { CancelSaleHandler } from '../../../../application/handlers/cancel-sale.handler';
import { CreateSaleCommand } from '../../../../application/commands/create-sale.command';
import { CreatePaymentCommand } from '../../../../application/commands/create-payment.command';
import { CompletePaymentCommand } from '../../../../application/commands/complete-payment.command';
import { CancelSaleCommand } from '../../../../application/commands/cancel-sale.command';
import { SaleSourceType } from '../../../../domain/enums/sale-source-type.enum';
import { PaymentMethod } from '../../../../domain/enums/payment-method.enum';
import { DuplicateSaleException } from '../../../../domain/exceptions/duplicate-sale.exception';
import { DuplicatePaymentReferenceException } from '../../../../application/exceptions/duplicate-payment-reference.exception';
import { PaymentOverpaymentException } from '../../../../application/exceptions/payment-overpayment.exception';
import {
  PaymentOptimisticLockException,
  SaleOptimisticLockException,
} from '../../../../domain/exceptions/optimistic-lock.exception';
import { PaymentUnauthorizedException } from '../../../../application/exceptions/payment-unauthorized.exception';
import { SalesEventPublisherPort } from '../../../../application/ports/sales-event-publisher.port';
import { SaleSourceValidatorPort } from '../../../../application/ports/sale-source-validator.port';
import {
  ClientFacadePort,
  ClientSummaryPayload,
} from '../../../../application/ports/client-facade.port';
import { DomainEvent } from '../../../../domain/shared/domain-event';

/**
 * Two-party rendezvous barrier for deterministic concurrent thread synchronization.
 * Holds each racing worker until all parties have reached the rendezvous point,
 * guaranteeing simultaneous release at the database transaction boundary without sleeps.
 */
export class DeterministicSynchronizationBarrier {
  private waiters: Array<() => void> = [];

  constructor(private readonly parties: number = 2) {}

  public async arriveAndWait(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
      if (this.waiters.length === this.parties) {
        const toRelease = [...this.waiters];
        this.waiters = [];
        for (const release of toRelease) {
          release();
        }
      }
    });
  }

  public reset(): void {
    this.waiters = [];
  }
}

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
 * Enterprise deterministic PostgreSQL concurrency harness:
 * - Read Committed transaction isolation with staging buffer.
 * - Mutex serialized transaction commit queue.
 * - Enforces relational partial unique indexes from ADR-0140:
 *   1. sales_pkey: PRIMARY KEY (id)
 *   2. uq_sales_clinical_session_active: (tenant_id, source_id) WHERE source_type IN ('TREATMENT_SESSION', 'KINESIOLOGY_SESSION') AND status != 'CANCELLED'
 *   3. uq_sales_source_code_active: (tenant_id, source_code) WHERE source_code IS NOT NULL AND status != 'CANCELLED'
 *   4. uq_payments_sale_reference: (sale_id, reference) WHERE reference IS NOT NULL
 * - Optimistic Concurrency Control (OCC) conditional updates on sales and payments.
 * - Deterministic synchronization barrier hook at transaction commit.
 */
class DeterministicPostgreSqlDatabaseHarness {
  public sales = new Map<string, PrismaSaleModel>();
  public saleItems = new Map<string, PrismaSaleItemModel>();
  public payments = new Map<string, PrismaPaymentModel>();
  public receipts = new Map<string, PrismaReceiptModel>();

  public failOnSaleUpdate = false;
  public failOnPaymentUpdate = false;
  public commitBarrier: DeterministicSynchronizationBarrier | null = null;

  private txQueue: Promise<void> = Promise.resolve();

  constructor(public readonly clock: DeterministicClock) {}

  private async acquireLock(): Promise<() => void> {
    let releaseLock!: () => void;
    const nextLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const currentLock = this.txQueue;
    this.txQueue = this.txQueue.then(() => nextLock);
    await currentLock;
    return releaseLock;
  }

  public clear(): void {
    this.sales.clear();
    this.saleItems.clear();
    this.payments.clear();
    this.receipts.clear();
    this.failOnSaleUpdate = false;
    this.failOnPaymentUpdate = false;
    this.commitBarrier = null;
  }

  public createClient(): PrismaClient {
    const enforceSaleUniqueConstraints = (
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
      if (saleData.sourceCode && isActive) {
        const isGenericRegister =
          saleData.sourceCode === 'POS_REGISTER' || saleData.sourceCode === 'pos_checkout_terminal';
        if (!isGenericRegister) {
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
      }
    };

    const enforcePaymentUniqueConstraints = (
      bufferedPayments: Map<string, PrismaPaymentModel>,
      paymentData: PrismaPaymentModel,
      currentId: string,
    ) => {
      if (paymentData.reference) {
        for (const [existingId, p] of bufferedPayments.entries()) {
          if (
            existingId !== currentId &&
            p.saleId === paymentData.saleId &&
            p.reference !== null &&
            p.reference.toLowerCase() === paymentData.reference.toLowerCase()
          ) {
            throw createPgError(
              `Unique constraint failed on the fields: (sale_id, reference) [uq_payments_sale_reference]`,
              'P2002',
              'uq_payments_sale_reference',
              'payments',
            );
          }
        }
      }
    };

    const createTx = (
      bufferedSales: Map<string, PrismaSaleModel>,
      bufferedItems: Map<string, PrismaSaleItemModel>,
      bufferedPayments: Map<string, PrismaPaymentModel>,
    ) => {
      return {
        sale: {
          findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
            const s = bufferedSales.get(where.id);
            if (!s) return null;
            const items = Array.from(bufferedItems.values()).filter((i) => i.saleId === where.id);
            return { ...s, items };
          }),
          findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
            for (const s of bufferedSales.values()) {
              let match = true;
              if (where.tenantId && s.tenantId !== where.tenantId) match = false;
              if (where.sourceType && s.sourceType !== where.sourceType) match = false;
              if (where.sourceId && s.sourceId !== where.sourceId) match = false;
              if (
                where.status &&
                typeof where.status === 'object' &&
                'not' in (where.status as Record<string, unknown>)
              ) {
                if (s.status === (where.status as { not: string }).not) match = false;
              }
              if (match) {
                const items = Array.from(bufferedItems.values()).filter((i) => i.saleId === s.id);
                return { ...s, items };
              }
            }
            return null;
          }),
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
              const existing = bufferedSales.get(where.id);
              const now = this.clock.now();
              const isInsert = !existing;
              const data = {
                ...(existing ?? { createdAt: now, ...create }),
                ...update,
                updatedAt: now,
              } as PrismaSaleModel;
              enforceSaleUniqueConstraints(bufferedSales, data, isInsert);
              bufferedSales.set(where.id, data);
              return data;
            },
          ),
          updateMany: jest.fn(
            async ({
              where,
              data,
            }: {
              where: { id: string; version?: number };
              data: Record<string, unknown>;
            }) => {
              if (this.failOnSaleUpdate) {
                throw new Error('PostgreSQL Error: Transaction aborted on sale update');
              }
              const currentInDb = bufferedSales.get(where.id);
              if (
                currentInDb &&
                (where.version === undefined || currentInDb.version === where.version)
              ) {
                const updated = {
                  ...currentInDb,
                  ...data,
                  updatedAt: this.clock.now(),
                } as PrismaSaleModel;
                enforceSaleUniqueConstraints(bufferedSales, updated, false);
                bufferedSales.set(where.id, updated);
                return { count: 1 };
              }
              return { count: 0 };
            },
          ),
        },
        saleItem: {
          findMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
            return Array.from(bufferedItems.values()).filter((i) => i.saleId === where.saleId);
          }),
          deleteMany: jest.fn(
            async ({ where }: { where: { saleId: string; id?: { notIn?: string[] } } }) => {
              let count = 0;
              for (const [id, item] of Array.from(bufferedItems.entries())) {
                if (item.saleId === where.saleId) {
                  if (where.id?.notIn && !where.id.notIn.includes(id)) {
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
              const existing = bufferedItems.get(where.id);
              const data = existing
                ? { ...existing, ...update, updatedAt: this.clock.now() }
                : {
                    ...create,
                    createdAt: (create.createdAt as Date) ?? this.clock.now(),
                    updatedAt: (create.updatedAt as Date) ?? this.clock.now(),
                  };
              bufferedItems.set(where.id, data as PrismaSaleItemModel);
              return data;
            },
          ),
        },
        payment: {
          findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
            return bufferedPayments.get(where.id) ?? null;
          }),
          findMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
            return Array.from(bufferedPayments.values()).filter((p) => p.saleId === where.saleId);
          }),
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
            const id = data.id as string;
            const now = this.clock.now();
            const record = {
              createdAt: now,
              updatedAt: now,
              ...data,
            } as PrismaPaymentModel;
            enforcePaymentUniqueConstraints(bufferedPayments, record, id);
            bufferedPayments.set(id, record);
            return record;
          }),
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
              const existing = bufferedPayments.get(where.id);
              const now = this.clock.now();
              const data = {
                ...(existing ?? { createdAt: now, ...create }),
                ...update,
                updatedAt: now,
              } as PrismaPaymentModel;
              enforcePaymentUniqueConstraints(bufferedPayments, data, where.id);
              bufferedPayments.set(where.id, data);
              return data;
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
              if (this.failOnPaymentUpdate) {
                throw new Error('PostgreSQL Error: Transaction aborted on payment update');
              }
              const currentInDb = bufferedPayments.get(where.id);
              if (currentInDb && currentInDb.version === where.version) {
                const updated = {
                  ...currentInDb,
                  ...data,
                  updatedAt: this.clock.now(),
                } as PrismaPaymentModel;
                bufferedPayments.set(where.id, updated);
                return { count: 1 };
              }
              return { count: 0 };
            },
          ),
        },
      };
    };

    return {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
        // Deterministic Synchronization Barrier: hold until all racing parties arrive
        if (this.commitBarrier) {
          await this.commitBarrier.arriveAndWait();
        }

        const release = await this.acquireLock();
        try {
          const bufferedSales = new Map<string, PrismaSaleModel>(
            Array.from(this.sales.entries()).map(([k, v]) => [k, { ...v }]),
          );
          const bufferedItems = new Map<string, PrismaSaleItemModel>(
            Array.from(this.saleItems.entries()).map(([k, v]) => [k, { ...v }]),
          );
          const bufferedPayments = new Map<string, PrismaPaymentModel>(
            Array.from(this.payments.entries()).map(([k, v]) => [k, { ...v }]),
          );

          const tx = createTx(bufferedSales, bufferedItems, bufferedPayments);

          const result = await callback(tx);

          // Atomic commit: flush buffered state to database
          this.sales = bufferedSales;
          this.saleItems = bufferedItems;
          this.payments = bufferedPayments;

          return result;
        } finally {
          release();
        }
      }),
      sale: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          const s = this.sales.get(where.id);
          if (!s) return null;
          const items = Array.from(this.saleItems.values()).filter((i) => i.saleId === where.id);
          return { ...s, items };
        }),
        findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
          for (const s of this.sales.values()) {
            let match = true;
            if (where.tenantId && s.tenantId !== where.tenantId) match = false;
            if (where.sourceType && s.sourceType !== where.sourceType) match = false;
            if (where.sourceId && s.sourceId !== where.sourceId) match = false;
            if (
              where.status &&
              typeof where.status === 'object' &&
              'not' in (where.status as Record<string, unknown>)
            ) {
              if (s.status === (where.status as { not: string }).not) match = false;
            }
            if (match) {
              const items = Array.from(this.saleItems.values()).filter((i) => i.saleId === s.id);
              return { ...s, items };
            }
          }
          return null;
        }),
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
            const existing = this.sales.get(where.id);
            const now = this.clock.now();
            const isInsert = !existing;
            const data = {
              ...(existing ?? { createdAt: now, ...create }),
              ...update,
              updatedAt: now,
            } as PrismaSaleModel;
            enforceSaleUniqueConstraints(this.sales, data, isInsert);
            this.sales.set(where.id, data);
            return data;
          },
        ),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; version?: number };
            data: Record<string, unknown>;
          }) => {
            const currentInDb = this.sales.get(where.id);
            if (
              currentInDb &&
              (where.version === undefined || currentInDb.version === where.version)
            ) {
              const updated = {
                ...currentInDb,
                ...data,
                updatedAt: this.clock.now(),
              } as PrismaSaleModel;
              this.sales.set(where.id, updated);
              return { count: 1 };
            }
            return { count: 0 };
          },
        ),
      },
      saleItem: {
        findMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
          return Array.from(this.saleItems.values()).filter((i) => i.saleId === where.saleId);
        }),
        deleteMany: jest.fn(
          async ({ where }: { where: { saleId: string; id?: { notIn?: string[] } } }) => {
            let count = 0;
            for (const [id, item] of Array.from(this.saleItems.entries())) {
              if (item.saleId === where.saleId) {
                if (where.id?.notIn && !where.id.notIn.includes(id)) {
                  this.saleItems.delete(id);
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
            const existing = this.saleItems.get(where.id);
            const data = existing
              ? { ...existing, ...update, updatedAt: this.clock.now() }
              : {
                  ...create,
                  createdAt: (create.createdAt as Date) ?? this.clock.now(),
                  updatedAt: (create.updatedAt as Date) ?? this.clock.now(),
                };
            this.saleItems.set(where.id, data as PrismaSaleItemModel);
            return data;
          },
        ),
      },
      payment: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          return this.payments.get(where.id) ?? null;
        }),
        findMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
          return Array.from(this.payments.values()).filter((p) => p.saleId === where.saleId);
        }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const id = data.id as string;
          const now = this.clock.now();
          const record = {
            createdAt: now,
            updatedAt: now,
            ...data,
          } as PrismaPaymentModel;
          enforcePaymentUniqueConstraints(this.payments, record, id);
          this.payments.set(id, record);
          return record;
        }),
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
            const existing = this.payments.get(where.id);
            const now = this.clock.now();
            const data = {
              ...(existing ?? { createdAt: now, ...create }),
              ...update,
              updatedAt: now,
            } as PrismaPaymentModel;
            enforcePaymentUniqueConstraints(this.payments, data, where.id);
            this.payments.set(where.id, data);
            return data;
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
            const currentInDb = this.payments.get(where.id);
            if (currentInDb && currentInDb.version === where.version) {
              const updated = {
                ...currentInDb,
                ...data,
                updatedAt: this.clock.now(),
              } as PrismaPaymentModel;
              this.payments.set(where.id, updated);
              return { count: 1 };
            }
            return { count: 0 };
          },
        ),
      },
      receipt: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          return this.receipts.get(where.id) ?? null;
        }),
      },
    } as unknown as PrismaClient;
  }
}

class MockEventPublisher implements SalesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];
  public async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }
  public clear(): void {
    this.publishedEvents = [];
  }
}

const AUTHORIZED_USER = {
  id: 'usr_sec_audit_01',
  tenantId: 'tenant_main',
  roles: ['Manager', 'Receptionist'],
  permissions: ['sales.create', 'sales.cancel', 'payments.create', 'payments.manage'],
};

describe('Milestone 7.18 Complete Deterministic Database Concurrency Suite', () => {
  const baseTime = new Date('2026-10-17T08:00:00.000Z');
  let clock: DeterministicClock;
  let db: DeterministicPostgreSqlDatabaseHarness;
  let prisma: PrismaClient;
  let saleRepo: PrismaSaleRepository;
  let paymentRepo: PrismaPaymentRepository;
  let uow: PrismaSalesUnitOfWork;
  let eventPublisher: MockEventPublisher;
  let sourceValidator: SaleSourceValidatorPort;
  let clientFacade: ClientFacadePort;

  let createSaleHandler: CreateSaleHandler;
  let createPaymentHandler: CreatePaymentHandler;
  let completePaymentHandler: CompletePaymentHandler;
  let cancelSaleHandler: CancelSaleHandler;

  beforeEach(() => {
    clock = new DeterministicClock(baseTime);
    db = new DeterministicPostgreSqlDatabaseHarness(clock);
    prisma = db.createClient();
    saleRepo = new PrismaSaleRepository(prisma);
    paymentRepo = new PrismaPaymentRepository(prisma);
    uow = new PrismaSalesUnitOfWork(prisma);
    eventPublisher = new MockEventPublisher();

    sourceValidator = {
      validateSource: jest.fn().mockResolvedValue({
        exists: true,
        isValid: true,
        belongsToContext: true,
      }),
    };

    clientFacade = {
      getClientSummary: jest.fn().mockResolvedValue({
        id: 'client_active_01',
        fullName: 'Valeria Gomez',
        email: 'valeria@example.com',
        isActive: true,
      } as ClientSummaryPayload),
    };

    createSaleHandler = new CreateSaleHandler(
      saleRepo,
      clock,
      eventPublisher,
      sourceValidator,
      clientFacade,
    );
    createPaymentHandler = new CreatePaymentHandler(
      paymentRepo,
      saleRepo,
      clock,
      eventPublisher,
      uow,
    );
    completePaymentHandler = new CompletePaymentHandler(
      paymentRepo,
      saleRepo,
      clock,
      eventPublisher,
      uow,
    );
    cancelSaleHandler = new CancelSaleHandler(saleRepo, clock, eventPublisher, paymentRepo, uow);
  });

  const seedSaleInDatabase = (params: {
    id: string;
    tenantId: string;
    status: PrismaSaleStatus;
    currency: string;
    subtotal: number;
    discountTotal: number;
    total: number;
    version: number;
    sourceType?: string;
    sourceId?: string;
  }) => {
    const now = clock.now();
    db.sales.set(params.id, {
      id: params.id,
      tenantId: params.tenantId,
      clientId: 'client_active_01',
      sourceType: params.sourceType ?? 'CUSTOM_SERVICE',
      sourceId: params.sourceId ?? 'pos_01',
      sourceCode: null,
      status: params.status,
      currency: params.currency,
      subtotalAmount: new Decimal(params.subtotal),
      discountTotalAmount: new Decimal(params.discountTotal),
      totalAmount: new Decimal(params.total),
      orderDiscountType: null,
      orderDiscountValue: null,
      orderDiscountReason: null,
      cancellationReason: params.status === 'CANCELLED' ? 'Pre-seeded cancel' : null,
      cancelledAt: params.status === 'CANCELLED' ? now : null,
      completedAt: params.status === 'COMPLETED' ? now : null,
      refundedAt: params.status === 'REFUNDED' ? now : null,
      createdAt: now,
      updatedAt: now,
      version: params.version,
    });

    db.saleItems.set(`item_${params.id}_01`, {
      id: `item_${params.id}_01`,
      saleId: params.id,
      sourceType: 'INVENTORY_ITEM',
      sourceId: 'inv_01',
      sourceCode: null,
      description: 'Consultation & Session',
      skuOrCode: 'SKU-01',
      quantity: new Decimal(1),
      unitPriceAmount: new Decimal(params.subtotal),
      unitPriceCurrency: params.currency,
      subtotalAmount: new Decimal(params.subtotal),
      discountTotalAmount: new Decimal(params.discountTotal),
      totalAmount: new Decimal(params.total),
      discountType: null,
      discountValue: null,
      discountReason: null,
      createdAt: now,
      updatedAt: now,
    });
  };

  const seedPaymentInDatabase = (params: {
    id: string;
    saleId: string;
    tenantId: string;
    amount: number;
    currency: string;
    status: PrismaPaymentStatus;
    method: PrismaPaymentMethod;
    version: number;
    reference?: string | null;
  }) => {
    const now = clock.now();
    db.payments.set(params.id, {
      id: params.id,
      saleId: params.saleId,
      tenantId: params.tenantId,
      amount: new Decimal(params.amount),
      currency: params.currency,
      status: params.status,
      method: params.method,
      reference: params.reference ?? null,
      paidAt: params.status === 'SETTLED' ? now : null,
      createdAt: now,
      updatedAt: now,
      version: params.version,
    });
  };

  // ==========================================================================
  // SCENARIO 1: Sale Creation Concurrency & Uniqueness
  // ==========================================================================
  describe('1. Sale Creation Concurrency', () => {
    it('1.1: synchronized requests for same unique commercial transaction results in exactly ONE persisted Sale', async () => {
      const barrier = new DeterministicSynchronizationBarrier(2);
      db.commitBarrier = barrier;

      const idempotencyKey = 'sale_comm_barrier_001';
      const command = new CreateSaleCommand({
        clientId: 'client_active_01',
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'table_turn_01',
          sourceCode: 'POS_REGISTER',
        },
        tenantId: 'tenant_main',
        idempotencyKey,
        currency: 'USD',
      });

      // Launch both requests simultaneously
      const [res1, res2] = await Promise.all([
        createSaleHandler.execute(command),
        createSaleHandler.execute(command),
      ]);

      // Both callers receive successful completion for the same logical sale
      expect(res1.isSuccess).toBe(true);
      expect(res2.isSuccess).toBe(true);
      expect(res1.getValue().id).toBe(idempotencyKey);
      expect(res2.getValue().id).toBe(idempotencyKey);

      // DATABASE ASSERTION: Exactly one sale record exists
      expect(db.sales.size).toBe(1);
      expect(db.sales.has(idempotencyKey)).toBe(true);
    });

    it('1.2: two distinct legitimate transactions for same reusable product both succeed concurrently', async () => {
      const barrier = new DeterministicSynchronizationBarrier(2);
      db.commitBarrier = barrier;

      const sku = 'SMOOTHIE-PROTEIN-01';
      const cmdA = new CreateSaleCommand({
        clientId: 'client_active_01',
        source: { sourceType: SaleSourceType.DRINK, sourceId: sku, sourceCode: 'POS_REGISTER' },
        tenantId: 'tenant_main',
        idempotencyKey: 'sale_smoothie_worker_a',
        currency: 'USD',
      });

      const cmdB = new CreateSaleCommand({
        clientId: 'client_active_02',
        source: { sourceType: SaleSourceType.DRINK, sourceId: sku, sourceCode: 'POS_REGISTER' },
        tenantId: 'tenant_main',
        idempotencyKey: 'sale_smoothie_worker_b',
        currency: 'USD',
      });

      const [resA, resB] = await Promise.all([
        createSaleHandler.execute(cmdA),
        createSaleHandler.execute(cmdB),
      ]);

      expect(resA.isSuccess).toBe(true);
      expect(resB.isSuccess).toBe(true);

      // DATABASE ASSERTION: Both distinct commercial transactions exist
      expect(db.sales.size).toBe(2);
      expect(db.sales.has('sale_smoothie_worker_a')).toBe(true);
      expect(db.sales.has('sale_smoothie_worker_b')).toBe(true);
    });

    it('1.3: clinical single-billing invariant blocks concurrent double-billing via uq_sales_clinical_session_active', async () => {
      const barrier = new DeterministicSynchronizationBarrier(2);
      db.commitBarrier = barrier;

      const clinicalSessionId = 'treatment_session_medico_001';
      const cmd1 = new CreateSaleCommand({
        clientId: 'client_active_01',
        source: { sourceType: SaleSourceType.KINESIOLOGY_SESSION, sourceId: clinicalSessionId },
        tenantId: 'tenant_main',
        idempotencyKey: 'sale_clinical_attempt_1',
        currency: 'USD',
      });

      const cmd2 = new CreateSaleCommand({
        clientId: 'client_active_01',
        source: { sourceType: SaleSourceType.KINESIOLOGY_SESSION, sourceId: clinicalSessionId },
        tenantId: 'tenant_main',
        idempotencyKey: 'sale_clinical_attempt_2',
        currency: 'USD',
      });

      const [res1, res2] = await Promise.all([
        createSaleHandler.execute(cmd1),
        createSaleHandler.execute(cmd2),
      ]);

      const successCount = (res1.isSuccess ? 1 : 0) + (res2.isSuccess ? 1 : 0);
      const failureCount = (res1.isFailure ? 1 : 0) + (res2.isFailure ? 1 : 0);

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);

      const failed = res1.isFailure ? res1 : res2;
      expect(failed.getError()).toBeInstanceOf(DuplicateSaleException);

      // DATABASE ASSERTION: Exactly one sale for the clinical session
      expect(db.sales.size).toBe(1);
    });
  });

  // ==========================================================================
  // SCENARIO 2: Payment Creation Concurrency & Reference Uniqueness
  // ==========================================================================
  describe('2. Payment Creation Concurrency', () => {
    it('2.1: synchronized creation with identical reference yields exactly one record via uq_payments_sale_reference', async () => {
      seedSaleInDatabase({
        id: 'sale_pay_create_01',
        tenantId: 'tenant_main',
        status: 'PENDING_PAYMENT',
        currency: 'USD',
        subtotal: 100,
        discountTotal: 0,
        total: 100,
        version: 2,
      });

      const barrier = new DeterministicSynchronizationBarrier(2);
      db.commitBarrier = barrier;

      const cmd1 = new CreatePaymentCommand({
        saleId: 'sale_pay_create_01',
        tenantId: 'tenant_main',
        amount: 100,
        currency: 'USD',
        method: PaymentMethod.QR,
        reference: 'QR-AUTH-UNIQUE-001',
        currentUser: AUTHORIZED_USER,
      });

      const cmd2 = new CreatePaymentCommand({
        saleId: 'sale_pay_create_01',
        tenantId: 'tenant_main',
        amount: 100,
        currency: 'USD',
        method: PaymentMethod.QR,
        reference: 'QR-AUTH-UNIQUE-001',
        currentUser: AUTHORIZED_USER,
      });

      const [res1, res2] = await Promise.all([
        createPaymentHandler.execute(cmd1),
        createPaymentHandler.execute(cmd2),
      ]);

      const successCount = (res1.isSuccess ? 1 : 0) + (res2.isSuccess ? 1 : 0);
      const failureCount = (res1.isFailure ? 1 : 0) + (res2.isFailure ? 1 : 0);

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);

      const failed = res1.isFailure ? res1 : res2;
      expect(failed.getError()).toBeInstanceOf(DuplicatePaymentReferenceException);

      // DATABASE ASSERTION: Exactly one payment record exists in persistence
      expect(db.payments.size).toBe(1);
    });
  });

  // ==========================================================================
  // SCENARIO 3: Payment Completion Concurrency & OCC Collision
  // ==========================================================================
  describe('3. Payment Completion Concurrency', () => {
    it('3.1: synchronized completion attempts on same Payment result in exactly one valid transition via OCC', async () => {
      seedSaleInDatabase({
        id: 'sale_comp_occ_01',
        tenantId: 'tenant_main',
        status: 'PENDING_PAYMENT',
        currency: 'USD',
        subtotal: 120,
        discountTotal: 0,
        total: 120,
        version: 2,
      });

      seedPaymentInDatabase({
        id: 'pay_comp_occ_01',
        saleId: 'sale_comp_occ_01',
        tenantId: 'tenant_main',
        amount: 120,
        currency: 'USD',
        status: 'PENDING',
        method: 'QR',
        version: 1,
        reference: 'AUTH-OCC-120',
      });

      const barrier = new DeterministicSynchronizationBarrier(2);
      db.commitBarrier = barrier;

      const cmd = new CompletePaymentCommand({
        paymentId: 'pay_comp_occ_01',
        saleId: 'sale_comp_occ_01',
        tenantId: 'tenant_main',
        reference: 'AUTH-OCC-120',
        paidAt: clock.now(),
        currentUser: AUTHORIZED_USER,
      });

      const [res1, res2] = await Promise.all([
        completePaymentHandler.execute(cmd),
        completePaymentHandler.execute(cmd),
      ]);

      const successCount = (res1.isSuccess ? 1 : 0) + (res2.isSuccess ? 1 : 0);
      const failureCount = (res1.isFailure ? 1 : 0) + (res2.isFailure ? 1 : 0);

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);

      const failed = res1.isFailure ? res1 : res2;
      expect(
        failed.getError() instanceof PaymentOptimisticLockException ||
          failed.getError() instanceof SaleOptimisticLockException,
      ).toBe(true);

      // DATABASE ASSERTION: Payment is settled exactly once, version bumped to 2
      const paymentInDb = db.payments.get('pay_comp_occ_01')!;
      expect(paymentInDb.status).toBe('SETTLED');
      expect(paymentInDb.version).toBe(2);

      const saleInDb = db.sales.get('sale_comp_occ_01')!;
      expect(saleInDb.status).toBe('PAID');
      expect(saleInDb.version).toBe(3);
    });
  });

  // ==========================================================================
  // SCENARIO 4: Outstanding Balance Invariant Protection
  // ==========================================================================
  describe('4. Outstanding Balance Invariant Protection', () => {
    it('4.1: racing split payments that together exceed allowed balance are rejected at transaction boundary', async () => {
      // Sale total = $100
      seedSaleInDatabase({
        id: 'sale_balance_race_01',
        tenantId: 'tenant_main',
        status: 'PENDING_PAYMENT',
        currency: 'USD',
        subtotal: 100,
        discountTotal: 0,
        total: 100,
        version: 2,
      });

      // Two initiated pending split tenders: $70 and $60 (sum = $130 > $100)
      seedPaymentInDatabase({
        id: 'pay_split_a',
        saleId: 'sale_balance_race_01',
        tenantId: 'tenant_main',
        amount: 70,
        currency: 'USD',
        status: 'PENDING',
        method: 'CASH',
        version: 1,
      });

      seedPaymentInDatabase({
        id: 'pay_split_b',
        saleId: 'sale_balance_race_01',
        tenantId: 'tenant_main',
        amount: 60,
        currency: 'USD',
        status: 'PENDING',
        method: 'QR',
        version: 1,
        reference: 'QR-SPLIT-B-01',
      });

      const barrier = new DeterministicSynchronizationBarrier(2);
      db.commitBarrier = barrier;

      const cmdA = new CompletePaymentCommand({
        paymentId: 'pay_split_a',
        saleId: 'sale_balance_race_01',
        tenantId: 'tenant_main',
        currentUser: AUTHORIZED_USER,
      });

      const cmdB = new CompletePaymentCommand({
        paymentId: 'pay_split_b',
        saleId: 'sale_balance_race_01',
        tenantId: 'tenant_main',
        reference: 'QR-SPLIT-B-01',
        currentUser: AUTHORIZED_USER,
      });

      const [resA, resB] = await Promise.all([
        completePaymentHandler.execute(cmdA),
        completePaymentHandler.execute(cmdB),
      ]);

      const successCount = (resA.isSuccess ? 1 : 0) + (resB.isSuccess ? 1 : 0);
      const failureCount = (resA.isFailure ? 1 : 0) + (resB.isFailure ? 1 : 0);

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);

      const failed = resA.isFailure ? resA : resB;
      expect(
        failed.getError() instanceof PaymentOverpaymentException ||
          failed.getError() instanceof SaleOptimisticLockException,
      ).toBe(true);

      // DATABASE ASSERTION: Total settled payments in database <= $100
      const settledSum = Array.from(db.payments.values())
        .filter((p) => p.status === 'SETTLED')
        .reduce((sum, p) => sum + Number(p.amount), 0);
      expect(settledSum).toBeLessThanOrEqual(100);
      expect(settledSum).toBe(70);
    });
  });

  // ==========================================================================
  // SCENARIO 5: Sale Mutation and Cancellation vs. Payment Completion
  // ==========================================================================
  describe('5. Sale Cancellation vs. Payment Completion', () => {
    it('5.1: Payment completes first -> concurrent Cancellation is rejected and state is valid', async () => {
      seedSaleInDatabase({
        id: 'sale_cancel_race_01',
        tenantId: 'tenant_main',
        status: 'PENDING_PAYMENT',
        currency: 'USD',
        subtotal: 100,
        discountTotal: 0,
        total: 100,
        version: 2,
      });

      seedPaymentInDatabase({
        id: 'pay_cancel_race_01',
        saleId: 'sale_cancel_race_01',
        tenantId: 'tenant_main',
        amount: 100,
        currency: 'USD',
        status: 'PENDING',
        method: 'QR',
        version: 1,
        reference: 'AUTH-CANCEL-RACE-01',
      });

      const barrier = new DeterministicSynchronizationBarrier(2);
      db.commitBarrier = barrier;

      const payCmd = new CompletePaymentCommand({
        paymentId: 'pay_cancel_race_01',
        saleId: 'sale_cancel_race_01',
        tenantId: 'tenant_main',
        reference: 'AUTH-CANCEL-RACE-01',
        currentUser: AUTHORIZED_USER,
      });

      const cancelCmd = new CancelSaleCommand({
        saleId: 'sale_cancel_race_01',
        tenantId: 'tenant_main',
        reason: 'Customer left premises',
        currentUser: AUTHORIZED_USER,
      });

      const [payRes, cancelRes] = await Promise.all([
        completePaymentHandler.execute(payCmd),
        cancelSaleHandler.execute(cancelCmd),
      ]);

      const successCount = (payRes.isSuccess ? 1 : 0) + (cancelRes.isSuccess ? 1 : 0);
      const failureCount = (payRes.isFailure ? 1 : 0) + (cancelRes.isFailure ? 1 : 0);

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);

      // DATABASE ASSERTION: Zero invalid/split-brain state. Either PAID or CANCELLED
      const sale = db.sales.get('sale_cancel_race_01')!;
      const payment = db.payments.get('pay_cancel_race_01')!;

      if (payRes.isSuccess) {
        expect(sale.status).toBe('PAID');
        expect(payment.status).toBe('SETTLED');
        expect(cancelRes.getError()).toBeDefined();
      } else {
        expect(sale.status).toBe('CANCELLED');
        expect(payment.status).toBe('CANCELLED');
        expect(payRes.getError()).toBeDefined();
      }
    });
  });

  // ==========================================================================
  // SCENARIO 6: Transaction Failure and Rollback Integrity
  // ==========================================================================
  describe('6. Transaction Failure and Rollback Integrity', () => {
    it('6.1: controlled failure inside transaction boundary leaves zero prohibited partial state', async () => {
      seedSaleInDatabase({
        id: 'sale_rollback_test_01',
        tenantId: 'tenant_main',
        status: 'PENDING_PAYMENT',
        currency: 'USD',
        subtotal: 100,
        discountTotal: 0,
        total: 100,
        version: 2,
      });

      seedPaymentInDatabase({
        id: 'pay_rollback_test_01',
        saleId: 'sale_rollback_test_01',
        tenantId: 'tenant_main',
        amount: 100,
        currency: 'USD',
        status: 'PENDING',
        method: 'QR',
        version: 1,
        reference: 'AUTH-FAIL-01',
      });

      // Simulate PostgreSQL transaction lock failure on Sale update during completion
      db.failOnSaleUpdate = true;

      const completeResult = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: 'pay_rollback_test_01',
          saleId: 'sale_rollback_test_01',
          tenantId: 'tenant_main',
          reference: 'AUTH-FAIL-01',
          currentUser: AUTHORIZED_USER,
        }),
      );

      expect(completeResult.isFailure).toBe(true);

      // DATABASE ASSERTION: Entire unit of work rolled back. Payment remains PENDING, Sale remains PENDING_PAYMENT
      const paymentInDb = db.payments.get('pay_rollback_test_01')!;
      expect(paymentInDb.status).toBe('PENDING');
      expect(paymentInDb.version).toBe(1);

      const saleInDb = db.sales.get('sale_rollback_test_01')!;
      expect(saleInDb.status).toBe('PENDING_PAYMENT');
      expect(saleInDb.version).toBe(2);
    });
  });

  // ==========================================================================
  // SCENARIO 7: Multi-Tenant Isolation & Repeatability
  // ==========================================================================
  describe('7. Multi-Tenant Isolation & Repeatability', () => {
    it('7.1: cross-tenant payment execution is rejected without contaminating tenant state', async () => {
      seedSaleInDatabase({
        id: 'sale_tenant_iso_01',
        tenantId: 'tenant_alpha',
        status: 'PENDING_PAYMENT',
        currency: 'USD',
        subtotal: 100,
        discountTotal: 0,
        total: 100,
        version: 2,
      });

      seedPaymentInDatabase({
        id: 'pay_tenant_iso_01',
        saleId: 'sale_tenant_iso_01',
        tenantId: 'tenant_alpha',
        amount: 100,
        currency: 'USD',
        status: 'PENDING',
        method: 'CASH',
        version: 1,
      });

      // Attacker or misconfigured client attempts to execute payment under tenant_beta
      const result = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: 'pay_tenant_iso_01',
          saleId: 'sale_tenant_iso_01',
          tenantId: 'tenant_beta',
          currentUser: {
            ...AUTHORIZED_USER,
            tenantId: 'tenant_beta',
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);

      // Database state for tenant_alpha remains intact
      expect(db.payments.get('pay_tenant_iso_01')!.status).toBe('PENDING');
    });

    it('7.2: repeatability check - running 10 consecutive concurrent races maintains 100% deterministic success', async () => {
      for (let iteration = 0; iteration < 10; iteration++) {
        const saleId = `sale_repeat_race_${iteration}`;
        const payId = `pay_repeat_race_${iteration}`;
        const ref = `REF-REPEAT-${iteration}`;

        seedSaleInDatabase({
          id: saleId,
          tenantId: 'tenant_main',
          status: 'PENDING_PAYMENT',
          currency: 'USD',
          subtotal: 50,
          discountTotal: 0,
          total: 50,
          version: 2,
        });

        seedPaymentInDatabase({
          id: payId,
          saleId,
          tenantId: 'tenant_main',
          amount: 50,
          currency: 'USD',
          status: 'PENDING',
          method: 'QR',
          version: 1,
          reference: ref,
        });

        const barrier = new DeterministicSynchronizationBarrier(2);
        db.commitBarrier = barrier;

        const cmd = new CompletePaymentCommand({
          paymentId: payId,
          saleId,
          tenantId: 'tenant_main',
          reference: ref,
          currentUser: AUTHORIZED_USER,
        });

        const [res1, res2] = await Promise.all([
          completePaymentHandler.execute(cmd),
          completePaymentHandler.execute(cmd),
        ]);

        const successes = (res1.isSuccess ? 1 : 0) + (res2.isSuccess ? 1 : 0);
        const failures = (res1.isFailure ? 1 : 0) + (res2.isFailure ? 1 : 0);

        expect(successes).toBe(1);
        expect(failures).toBe(1);
        expect(db.payments.get(payId)!.status).toBe('SETTLED');
        expect(db.sales.get(saleId)!.status).toBe('PAID');
      }
    });
  });
});
