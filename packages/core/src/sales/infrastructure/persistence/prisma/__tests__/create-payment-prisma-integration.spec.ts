import {
  PrismaClient,
  Payment as PrismaPaymentModel,
  Sale as PrismaSaleModel,
  SaleItem as PrismaSaleItemModel,
  PaymentStatus as PrismaPaymentStatus,
  SaleStatus as PrismaSaleStatus,
} from '@prisma/client';
import { CreatePaymentHandler } from '../../../../application/handlers/create-payment.handler';
import { CreatePaymentCommand } from '../../../../application/commands/create-payment.command';
import { PrismaPaymentRepository } from '../repositories/prisma-payment.repository';
import { PrismaSaleRepository } from '../repositories/prisma-sale.repository';
import { Sale } from '../../../../domain/sale.aggregate';
import { SourceReference } from '../../../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../../../domain/enums/source-type.enum';
import { Money } from '../../../../domain/value-objects/money.vo';
import { PaymentMethod } from '../../../../domain/enums/payment-method.enum';
import { PaymentStatus } from '../../../../domain/enums/payment-status.enum';
import { DeterministicClock } from '../../../../domain/shared/clock';
import { SaleNotFoundException } from '../../../../application/exceptions/sale-not-found.exception';
import { PaymentCurrencyMismatchException } from '../../../../application/exceptions/payment-currency-mismatch.exception';
import { DuplicatePaymentReferenceException } from '../../../../application/exceptions/duplicate-payment-reference.exception';
import { InvalidPaymentMethodException } from '../../../../domain/exceptions/invalid-payment-method.exception';
import { SalesApplicationResult } from '../../../../application/shared/sales-application-result';

function extractErrorMessage(result: SalesApplicationResult<unknown>): string {
  const err = result.getError();
  return err instanceof Error ? err.message : String(err);
}

/**
 * Transactional test database harness simulating PostgreSQL relational engine with Prisma.
 */
class PostgresDatabaseHarness {
  public sales = new Map<string, PrismaSaleModel>();
  public saleItems = new Map<string, PrismaSaleItemModel>();
  public payments = new Map<string, PrismaPaymentModel>();

  public failNextWith: Error | null = null;

  constructor(public readonly clock: DeterministicClock) {}

  public clear(): void {
    this.sales.clear();
    this.saleItems.clear();
    this.payments.clear();
    this.failNextWith = null;
  }

  public createClient(): PrismaClient {
    const checkFault = (): void => {
      if (this.failNextWith) {
        const err = this.failNextWith;
        this.failNextWith = null;
        throw err;
      }
    };

    const clientInstance: Record<string, unknown> = {
      $transaction: jest.fn(async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        checkFault();
        return callback(clientInstance);
      }),
      sale: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          checkFault();
          const s = this.sales.get(where.id);
          if (!s) return null;
          const items = Array.from(this.saleItems.values()).filter((i) => i.saleId === where.id);
          return { ...s, items };
        }),
        upsert: jest.fn(
          async ({
            create,
            update,
            where,
          }: {
            where: { id: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            checkFault();
            const id = where.id;
            const existing = this.sales.get(id);
            const now = this.clock.now();
            const data = {
              ...(existing ?? { createdAt: now, ...create }),
              ...update,
              updatedAt: now,
            } as PrismaSaleModel;
            this.sales.set(id, data);
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
            checkFault();
            const existing = this.sales.get(where.id);
            if (!existing || (where.version !== undefined && existing.version !== where.version)) {
              return { count: 0 };
            }
            const updated = {
              ...existing,
              ...data,
              updatedAt: this.clock.now(),
            } as PrismaSaleModel;
            this.sales.set(where.id, updated);
            return { count: 1 };
          },
        ),
      },
      saleItem: {
        findMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
          checkFault();
          return Array.from(this.saleItems.values()).filter((i) => i.saleId === where.saleId);
        }),
        deleteMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
          checkFault();
          let count = 0;
          for (const [id, item] of Array.from(this.saleItems.entries())) {
            if (item.saleId === where.saleId) {
              this.saleItems.delete(id);
              count++;
            }
          }
          return { count };
        }),
        createMany: jest.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
          checkFault();
          const now = this.clock.now();
          for (const item of data) {
            const typedItem = { createdAt: now, updatedAt: now, ...item } as PrismaSaleItemModel;
            this.saleItems.set(typedItem.id, typedItem);
          }
          return { count: data.length };
        }),
        upsert: jest.fn(
          async ({
            create,
            update,
            where,
          }: {
            where: { id: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            checkFault();
            const id = where.id;
            const existing = this.saleItems.get(id);
            const now = this.clock.now();
            const data = {
              ...(existing ?? { createdAt: now, ...create }),
              ...update,
              updatedAt: now,
            } as PrismaSaleItemModel;
            this.saleItems.set(id, data);
            return data;
          },
        ),
      },
      payment: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          checkFault();
          return this.payments.get(where.id) ?? null;
        }),
        findMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
          checkFault();
          return Array.from(this.payments.values()).filter((p) => p.saleId === where.saleId);
        }),
        upsert: jest.fn(
          async ({
            create,
            update,
            where,
          }: {
            where: { id: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            checkFault();
            const id = where.id;
            const existing = this.payments.get(id);
            const now = this.clock.now();
            const data = {
              ...(existing ?? { createdAt: now, ...create }),
              ...update,
              updatedAt: now,
            } as PrismaPaymentModel;
            this.payments.set(id, data);
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
            checkFault();
            const existing = this.payments.get(where.id);
            if (!existing || (where.version !== undefined && existing.version !== where.version)) {
              return { count: 0 };
            }
            const updated = {
              ...existing,
              ...data,
              updatedAt: this.clock.now(),
            } as PrismaPaymentModel;
            this.payments.set(where.id, updated);
            return { count: 1 };
          },
        ),
      },
    };

    return clientInstance as unknown as PrismaClient;
  }
}

describe('CreatePayment Prisma Integration Suite (Milestone 7.12)', () => {
  const tenantId = 'tenant_kinergy_wellness';
  const baseTime = new Date('2026-10-07T14:00:00.000Z');

  let clock: DeterministicClock;
  let harness: PostgresDatabaseHarness;
  let prismaClient: PrismaClient;
  let paymentRepo: PrismaPaymentRepository;
  let saleRepo: PrismaSaleRepository;
  let handler: CreatePaymentHandler;

  beforeEach(() => {
    clock = new DeterministicClock(baseTime);
    harness = new PostgresDatabaseHarness(clock);
    prismaClient = harness.createClient();
    paymentRepo = new PrismaPaymentRepository(prismaClient);
    saleRepo = new PrismaSaleRepository(prismaClient);
    handler = new CreatePaymentHandler(paymentRepo, saleRepo, clock);
  });

  const seedSaleInDatabase = async (
    total: number = 100.0,
    currency: string = 'USD',
  ): Promise<Sale> => {
    const sale = Sale.create({
      tenantId,
      currency,
      source: SourceReference.create({
        sourceType: SourceType.TREATMENT_SESSION,
        sourceId: 'session_kin_100',
      }),
    });
    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.TREATMENT_SESSION,
        sourceId: 'session_kin_100',
      }),
      description: 'Physiotherapy & Kinesiology Session',
      quantity: 1,
      unitPrice: Money.create(total, currency),
    });
    // Save initial version 1 into persistence
    await saleRepo.save(sale);

    // Finalize advances status to PENDING_PAYMENT (version 2)
    sale.finalize(clock);
    await saleRepo.save(sale);
    return sale;
  };

  // 1. Valid Payment Persistence
  describe('1. Valid Payment Persistence', () => {
    it('persists a completed CASH payment to PostgreSQL and updates Sale status to PAID in single transaction', async () => {
      const sale = await seedSaleInDatabase(100.0, 'USD');

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          currency: 'USD',
          method: PaymentMethod.CASH,
          reference: 'DRAWER-POS-01',
          tenantId,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.id).toBeDefined();
      expect(dto.saleId).toBe(sale.id.value);
      expect(dto.amountValue).toBe(100.0);
      expect(dto.status).toBe(PaymentStatus.COMPLETED);

      // Verify payment stored in Prisma harness
      const storedPayment = harness.payments.get(dto.id);
      expect(storedPayment).toBeDefined();
      expect(storedPayment!.saleId).toBe(sale.id.value);
      expect(storedPayment!.reference).toBe('DRAWER-POS-01');
      expect(storedPayment!.status).toBe(PrismaPaymentStatus.SETTLED);

      // Verify Sale status updated to PAID in Prisma harness
      const storedSale = harness.sales.get(sale.id.value);
      expect(storedSale!.status).toBe(PrismaSaleStatus.PAID);
    });

    it('persists an initial PENDING QR payment without advancing Sale status', async () => {
      const sale = await seedSaleInDatabase(100.0, 'USD');

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          currency: 'USD',
          method: PaymentMethod.QR,
          reference: 'QR-TXN-123456',
          status: PaymentStatus.PENDING,
          tenantId,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.status).toBe(PaymentStatus.PENDING);
      expect(dto.paidAt).toBeNull();

      const storedPayment = harness.payments.get(dto.id);
      expect(storedPayment!.status).toBe(PrismaPaymentStatus.PENDING);
      expect(storedPayment!.paidAt).toBeNull();

      // Sale remains PENDING_PAYMENT
      const storedSale = harness.sales.get(sale.id.value);
      expect(storedSale!.status).toBe(PrismaSaleStatus.PENDING_PAYMENT);
    });
  });

  // 2. Missing Sale Handling
  describe('2. Missing Sale Handling', () => {
    it('rejects payment creation when target Sale record is absent from database', async () => {
      const missingSaleId = '99999999-9999-4999-a999-999999999999';

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: missingSaleId,
          amount: 50.0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect(harness.payments.size).toBe(0);
    });
  });

  // 3. Domain Validation & Invariant Enforcement
  describe('3. Domain Validation & Invariant Enforcement', () => {
    it('rejects negative payment amount before reaching database', async () => {
      const sale = await seedSaleInDatabase(100.0, 'USD');

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: -50.0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(harness.payments.size).toBe(0);
    });

    it('rejects invalid payment method before reaching database', async () => {
      const sale = await seedSaleInDatabase(100.0, 'USD');

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 50.0,
          method: 'ETHEREUM',
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentMethodException);
      expect(harness.payments.size).toBe(0);
    });

    it('rejects currency mismatch between payment request and stored Sale', async () => {
      const sale = await seedSaleInDatabase(100.0, 'USD');

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 50.0,
          currency: 'EUR',
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentCurrencyMismatchException);
      expect(harness.payments.size).toBe(0);
    });

    it('rejects duplicate external payment reference for the same Sale', async () => {
      const sale = await seedSaleInDatabase(100.0, 'USD');

      const firstResult = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 40.0,
          method: PaymentMethod.QR,
          reference: 'UNIQUE-REF-001',
          tenantId,
        }),
      );
      expect(firstResult.isSuccess).toBe(true);

      const duplicateResult = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 40.0,
          method: PaymentMethod.QR,
          reference: 'UNIQUE-REF-001',
          tenantId,
        }),
      );

      expect(duplicateResult.isFailure).toBe(true);
      expect(duplicateResult.getError()).toBeInstanceOf(DuplicatePaymentReferenceException);
      expect(harness.payments.size).toBe(1);
    });
  });

  // 4. Persistence Fault Injection
  describe('4. Persistence Fault Injection', () => {
    it('recovers cleanly and returns failure when PostgreSQL transaction aborts', async () => {
      const sale = await seedSaleInDatabase(100.0, 'USD');
      harness.failNextWith = new Error(
        '57P01: terminating connection due to administrator command',
      );

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(extractErrorMessage(result)).toContain('terminating connection');
      expect(harness.payments.size).toBe(0);
    });
  });
});
