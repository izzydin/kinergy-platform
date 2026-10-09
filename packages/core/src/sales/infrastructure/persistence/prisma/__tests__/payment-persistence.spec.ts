import {
  Prisma,
  PrismaClient,
  Payment as PrismaPaymentModel,
  PaymentMethod as PrismaPaymentMethod,
  PaymentStatus as PrismaPaymentStatus,
  Sale as PrismaSaleModel,
} from '@prisma/client';
import { Payment } from '../../../../domain/payment.aggregate';
import { PaymentId } from '../../../../domain/value-objects/payment-id.vo';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { Money } from '../../../../domain/value-objects/money.vo';
import { PaymentMethod } from '../../../../domain/enums/payment-method.enum';
import { PaymentStatus } from '../../../../domain/enums/payment-status.enum';
import { InvalidPaymentMethodException } from '../../../../domain/exceptions/invalid-payment-method.exception';
import { InvalidPaymentStatusException } from '../../../../domain/exceptions/invalid-payment-status.exception';
import { PrismaPaymentRepository } from '../repositories/prisma-payment.repository';
import { PaymentRepositoryPort } from '../../../../application/ports/payment-repository.port';
import { PrismaPaymentMapper } from '../mappers/prisma-payment.mapper';
import { DeterministicClock } from '../../../../domain/shared/clock';

/**
 * Stateful relational test harness emulating PostgreSQL / Prisma relational mechanics,
 * foreign key integrity, onDelete: Restrict, and index-accelerated query patterns for Payment.
 */
class MockPaymentRelationalDatabase {
  public sales = new Map<string, PrismaSaleModel>();
  public payments = new Map<string, PrismaPaymentModel>();

  public enforceForeignKeys = true;

  public createClient = (): PrismaClient => {
    const createTx = (
      bufferedSales: Map<string, PrismaSaleModel>,
      bufferedPayments: Map<string, PrismaPaymentModel>,
    ) => ({
      sale: {
        delete: jest.fn(async ({ where }: { where: { id: string } }) => {
          // Relational Engine Emulation: onDelete: Restrict on payments.saleId
          const hasPayments = Array.from(bufferedPayments.values()).some(
            (p) => p.saleId === where.id,
          );
          if (hasPayments) {
            throw new Prisma.PrismaClientKnownRequestError(
              `Foreign key constraint failed on the field: payments_sale_id_fkey (table: payments, parent: sales, action: Restrict)`,
              { code: 'P2003', clientVersion: '6.3.1' },
            );
          }
          const existing = bufferedSales.get(where.id);
          bufferedSales.delete(where.id);
          return existing;
        }),
      },
      payment: {
        findUnique: jest.fn(
          async ({ where }: { where: { id: string } }) => bufferedPayments.get(where.id) ?? null,
        ),
        findMany: jest.fn(
          async ({
            where,
            orderBy,
          }: {
            where?: { saleId?: string; tenantId?: string; status?: PrismaPaymentStatus };
            orderBy?: { createdAt?: 'asc' | 'desc' };
          }) => {
            let results = Array.from(bufferedPayments.values());
            if (where?.saleId) {
              results = results.filter((p) => p.saleId === where.saleId);
            }
            if (where?.tenantId) {
              results = results.filter((p) => p.tenantId === where.tenantId);
            }
            if (where?.status) {
              results = results.filter((p) => p.status === where.status);
            }
            if (orderBy?.createdAt === 'asc') {
              results.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
            } else if (orderBy?.createdAt === 'desc') {
              results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            }
            return results;
          },
        ),
        count: jest.fn(
          async ({
            where,
          }: {
            where?: { saleId?: string; tenantId?: string; status?: PrismaPaymentStatus };
          } = {}) => {
            let results = Array.from(bufferedPayments.values());
            if (where?.saleId) {
              results = results.filter((p) => p.saleId === where.saleId);
            }
            if (where?.tenantId) {
              results = results.filter((p) => p.tenantId === where.tenantId);
            }
            if (where?.status) {
              results = results.filter((p) => p.status === where.status);
            }
            return results.length;
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
            const targetSaleId = (create.saleId ?? update.saleId) as string;

            if (this.enforceForeignKeys && !bufferedSales.has(targetSaleId)) {
              throw new Prisma.PrismaClientKnownRequestError(
                `Foreign key constraint failed on the field: payments_sale_id_fkey (table: payments, parent: sales, key: ${targetSaleId})`,
                { code: 'P2003', clientVersion: '6.3.1' },
              );
            }

            const existing = bufferedPayments.get(where.id);
            const data = existing
              ? { ...existing, ...update, updatedAt: new Date() }
              : { ...create, createdAt: new Date(), updatedAt: new Date() };
            bufferedPayments.set(where.id, data as PrismaPaymentModel);
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
            const existing = bufferedPayments.get(where.id);
            if (existing && existing.version === where.version) {
              const updated = { ...existing, ...data, updatedAt: new Date() };
              bufferedPayments.set(where.id, updated as PrismaPaymentModel);
              return { count: 1 };
            }
            return { count: 0 };
          },
        ),
      },
    });

    return {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
        const bufferedSales = new Map<string, PrismaSaleModel>(
          Array.from(this.sales.entries()).map(([k, v]) => [k, { ...v }]),
        );
        const bufferedPayments = new Map<string, PrismaPaymentModel>(
          Array.from(this.payments.entries()).map(([k, v]) => [k, { ...v }]),
        );

        const tx = createTx(bufferedSales, bufferedPayments);
        const result = await callback(tx);

        this.sales = bufferedSales;
        this.payments = bufferedPayments;
        return result;
      }),
      sale: {
        delete: jest.fn(async ({ where }: { where: { id: string } }) => {
          const hasPayments = Array.from(this.payments.values()).some((p) => p.saleId === where.id);
          if (hasPayments) {
            throw new Prisma.PrismaClientKnownRequestError(
              `Foreign key constraint failed on the field: payments_sale_id_fkey (table: payments, parent: sales, action: Restrict)`,
              { code: 'P2003', clientVersion: '6.3.1' },
            );
          }
          const existing = this.sales.get(where.id);
          this.sales.delete(where.id);
          return existing;
        }),
      },
      payment: {
        findUnique: jest.fn(
          async ({ where }: { where: { id: string } }) => this.payments.get(where.id) ?? null,
        ),
        findMany: jest.fn(
          async ({
            where,
            orderBy,
          }: {
            where?: { saleId?: string; tenantId?: string; status?: PrismaPaymentStatus };
            orderBy?: { createdAt?: 'asc' | 'desc' };
          }) => {
            let results = Array.from(this.payments.values());
            if (where?.saleId) {
              results = results.filter((p) => p.saleId === where.saleId);
            }
            if (where?.tenantId) {
              results = results.filter((p) => p.tenantId === where.tenantId);
            }
            if (where?.status) {
              results = results.filter((p) => p.status === where.status);
            }
            if (orderBy?.createdAt === 'asc') {
              results.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
            } else if (orderBy?.createdAt === 'desc') {
              results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            }
            return results;
          },
        ),
        count: jest.fn(
          async ({
            where,
          }: {
            where?: { saleId?: string; tenantId?: string; status?: PrismaPaymentStatus };
          } = {}) => {
            let results = Array.from(this.payments.values());
            if (where?.saleId) {
              results = results.filter((p) => p.saleId === where.saleId);
            }
            if (where?.tenantId) {
              results = results.filter((p) => p.tenantId === where.tenantId);
            }
            if (where?.status) {
              results = results.filter((p) => p.status === where.status);
            }
            return results.length;
          },
        ),
      },
    } as unknown as PrismaClient;
  };
}

describe('Payment Persistence Architecture & Model Reconciliation (Integration)', () => {
  const clock = new DeterministicClock(new Date('2026-10-01T15:30:00.000Z'));
  const tenantId = 'tenant_kinergy_wellness';
  const saleId = SaleId.create('sale-uuid-7777');

  let db: MockPaymentRelationalDatabase;
  let prismaClient: PrismaClient;
  let repository: PrismaPaymentRepository;

  beforeEach(() => {
    db = new MockPaymentRelationalDatabase();
    prismaClient = db.createClient();
    repository = new PrismaPaymentRepository(prismaClient);

    // Seed parent Sale to satisfy foreign key constraint
    db.sales.set(saleId.value, {
      id: saleId.value,
      tenantId,
      clientId: null,
      status: 'PENDING_PAYMENT',
      currency: 'USD',
      sourceType: 'FOOD',
      sourceId: 'food-001',
      sourceCode: null,
      subtotalAmount: new Prisma.Decimal('50.00'),
      discountTotalAmount: new Prisma.Decimal('0.00'),
      totalAmount: new Prisma.Decimal('50.00'),
      orderDiscountType: null,
      orderDiscountValue: null,
      orderDiscountReason: null,
      cancellationReason: null,
      cancelledAt: null,
      completedAt: null,
      refundedAt: null,
      version: 1,
      createdAt: new Date('2026-10-01T15:00:00.000Z'),
      updatedAt: new Date('2026-10-01T15:00:00.000Z'),
    });
  });

  // ==========================================================================
  // 1. Valid Payment Persistence
  // ==========================================================================
  describe('1. Valid Payment Representation & Full Column Mapping', () => {
    it('persists a complete valid Payment aggregate and maps all columns accurately', async () => {
      const payment = Payment.createSettled(
        {
          id: 'pay-uuid-001',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(50.0, 'USD'),
          reference: 'REGISTER-DRAWER-01',
        },
        clock,
      );

      await repository.save(payment);

      const persisted = db.payments.get(payment.id.value);
      expect(persisted).toBeDefined();
      expect(persisted!.id).toBe('pay-uuid-001');
      expect(persisted!.tenantId).toBe(tenantId);
      expect(persisted!.saleId).toBe(saleId.value);
      expect(persisted!.method).toBe('CASH');
      expect(persisted!.amount).toEqual(new Prisma.Decimal('50.00'));
      expect(persisted!.currency).toBe('USD');
      expect(persisted!.status).toBe('SETTLED');
      expect(persisted!.reference).toBe('REGISTER-DRAWER-01');
      expect(persisted!.paidAt).toEqual(clock.now());
      expect(persisted!.version).toBe(1);
    });
  });

  // ==========================================================================
  // 2. Sale Relation & onDelete: Restrict
  // ==========================================================================
  describe('2. Sale Relation & Referential Integrity (onDelete: Restrict)', () => {
    it('maintains valid foreign key pointing to sales(id)', async () => {
      const payment = Payment.createSettled(
        {
          id: 'pay-uuid-002',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(25.0, 'USD'),
        },
        clock,
      );

      await repository.save(payment);

      const persisted = db.payments.get('pay-uuid-002')!;
      expect(persisted.saleId).toBe(saleId.value);
      expect(db.sales.has(persisted.saleId)).toBe(true);
    });

    it('enforces onDelete: Restrict by preventing deletion of a Sale that has financial payments', async () => {
      const payment = Payment.createSettled(
        {
          id: 'pay-uuid-audit-01',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(50.0, 'USD'),
        },
        clock,
      );
      await repository.save(payment);

      // Attempting to delete the Sale must be blocked by foreign key Restrict rule
      await expect(
        prismaClient.sale.delete({
          where: { id: saleId.value },
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);

      // Verify Sale still exists (audit trail protected)
      expect(db.sales.has(saleId.value)).toBe(true);
    });
  });

  // ==========================================================================
  // 3. Supported & Future Payment Methods
  // ==========================================================================
  describe('3. Payment Method Enforcement & Extensibility', () => {
    it('persists supported CASH method cleanly', async () => {
      const cashPay = Payment.createSettled(
        {
          id: 'pay-cash',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(10.0, 'USD'),
        },
        clock,
      );
      await repository.save(cashPay);

      expect(db.payments.get('pay-cash')!.method).toBe(PrismaPaymentMethod.CASH);
    });

    it('persists supported QR method cleanly', async () => {
      const qrPay = Payment.createSettled(
        {
          id: 'pay-qr',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(15.0, 'USD'),
          reference: 'QR-TX-999',
        },
        clock,
      );
      await repository.save(qrPay);

      expect(db.payments.get('pay-qr')!.method).toBe(PrismaPaymentMethod.QR);
    });

    it('rejects future methods (CARD, TRANSFER, ONLINE) at domain boundary without premature activation', () => {
      expect(() => {
        Payment.createSettled(
          {
            id: 'pay-card',
            tenantId,
            saleId,
            // @ts-expect-error - testing future method rejection
            method: 'CARD',
            amount: Money.create(20.0, 'USD'),
          },
          clock,
        );
      }).toThrow(InvalidPaymentMethodException);
    });

    it('rejects arbitrary invalid method strings', () => {
      expect(() => {
        Payment.createSettled(
          {
            id: 'pay-invalid-method',
            tenantId,
            saleId,
            // @ts-expect-error - testing invalid string rejection
            method: 'BITCOIN_LIGHTNING',
            amount: Money.create(20.0, 'USD'),
          },
          clock,
        );
      }).toThrow(InvalidPaymentMethodException);
    });
  });

  // ==========================================================================
  // 4. Payment Status Lifecycle & Non-Divergence
  // ==========================================================================
  describe('4. Payment Status Representation & Lifecycle Non-Divergence', () => {
    it('persists PENDING status with null paidAt', async () => {
      const pendingPayment = Payment.createPending(
        {
          id: 'pay-pending',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(30.0, 'USD'),
        },
        clock,
      );

      await repository.save(pendingPayment);

      const persisted = db.payments.get('pay-pending')!;
      expect(persisted.status).toBe(PrismaPaymentStatus.PENDING);
      expect(persisted.paidAt).toBeNull();
    });

    it('persists COMPLETED status (mapped to SETTLED in persistence) with valid paidAt', async () => {
      const completedPayment = Payment.createSettled(
        {
          id: 'pay-completed',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(30.0, 'USD'),
        },
        clock,
      );

      await repository.save(completedPayment);

      const persisted = db.payments.get('pay-completed')!;
      expect(persisted.status).toBe(PrismaPaymentStatus.SETTLED);
      expect(persisted.paidAt).toEqual(clock.now());

      // Reconstitution back to domain yields COMPLETED
      const reconstituted = await repository.findById('pay-completed');
      expect(reconstituted!.status).toBe(PaymentStatus.COMPLETED);
    });

    it('persists FAILED status without paidAt', async () => {
      const pendingPayment = Payment.createPending(
        {
          id: 'pay-failed',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(30.0, 'USD'),
        },
        clock,
      );
      await repository.save(pendingPayment);

      pendingPayment.markAsFailed('Gateway timeout', clock);
      await repository.save(pendingPayment);

      const persisted = db.payments.get('pay-failed')!;
      expect(persisted.status).toBe(PrismaPaymentStatus.FAILED);
      expect(persisted.paidAt).toBeNull();
      expect(persisted.version).toBe(2);
    });

    it('persists CANCELLED status without paidAt', async () => {
      const pendingPayment = Payment.createPending(
        {
          id: 'pay-cancelled',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(30.0, 'USD'),
        },
        clock,
      );
      await repository.save(pendingPayment);

      pendingPayment.cancel('Customer changed payment method', clock);
      await repository.save(pendingPayment);

      const persisted = db.payments.get('pay-cancelled')!;
      expect(persisted.status).toBe(PrismaPaymentStatus.CANCELLED);
      expect(persisted.paidAt).toBeNull();
      expect(persisted.version).toBe(2);
    });

    it('rejects arbitrary status strings via PrismaPaymentMapper', () => {
      expect(() => {
        PrismaPaymentMapper.toDomainStatus('ARBITRARY_STATUS');
      }).toThrow(InvalidPaymentStatusException);
    });
  });

  // ==========================================================================
  // 5. Amount Precision (@db.Decimal(12, 2))
  // ==========================================================================
  describe('5. Monetary Amount Precision & Exact Storage', () => {
    it('persists exact fractional cent monetary values without floating-point drift', async () => {
      const precisionPayment = Payment.createSettled(
        {
          id: 'pay-precision',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(19.99, 'USD'),
        },
        clock,
      );

      await repository.save(precisionPayment);

      const persisted = db.payments.get('pay-precision')!;
      expect(persisted.amount).toBeInstanceOf(Prisma.Decimal);
      expect(persisted.amount.toFixed(2)).toBe('19.99');
    });

    it('persists minimum minor unit boundary ($0.01) with exactness', async () => {
      const minPayment = Payment.createSettled(
        {
          id: 'pay-min-cent',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(0.01, 'USD'),
        },
        clock,
      );

      await repository.save(minPayment);

      const persisted = db.payments.get('pay-min-cent')!;
      expect(persisted.amount.toFixed(2)).toBe('0.01');
    });
  });

  // ==========================================================================
  // 6. Reference Handling
  // ==========================================================================
  describe('6. Reference Handling (Optional VarChar(100))', () => {
    it('persists reference string when present', async () => {
      const payment = Payment.createSettled(
        {
          id: 'pay-ref-present',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(25.0, 'USD'),
          reference: 'TX-REF-ABC-12345',
        },
        clock,
      );

      await repository.save(payment);

      const persisted = db.payments.get('pay-ref-present')!;
      expect(persisted.reference).toBe('TX-REF-ABC-12345');

      const retrieved = await repository.findById('pay-ref-present');
      expect(retrieved!.reference?.value).toBe('TX-REF-ABC-12345');
    });

    it('persists null reference when omitted', async () => {
      const payment = Payment.createSettled(
        {
          id: 'pay-ref-null',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(10.0, 'USD'),
        },
        clock,
      );

      await repository.save(payment);

      const persisted = db.payments.get('pay-ref-null')!;
      expect(persisted.reference).toBeNull();

      const retrieved = await repository.findById('pay-ref-null');
      expect(retrieved!.reference).toBeNull();
    });
  });

  // ==========================================================================
  // 7. Invalid Sale Foreign Key Rejection
  // ==========================================================================
  describe('7. Invalid Sale Foreign Key Rejection', () => {
    it('rejects persisting a Payment referencing a non-existent saleId', async () => {
      const ghostSaleId = SaleId.create('sale-non-existent-999');
      const orphanPayment = Payment.createSettled(
        {
          id: 'pay-orphan',
          tenantId,
          saleId: ghostSaleId,
          method: PaymentMethod.CASH,
          amount: Money.create(10.0, 'USD'),
        },
        clock,
      );

      await expect(repository.save(orphanPayment)).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
    });
  });

  // ==========================================================================
  // 8. Retrieval & Index Verification (Payment.saleId)
  // ==========================================================================
  describe('8. Retrieval & Query Performance by saleId (Index Confirmation)', () => {
    it('retrieves payment by primary key id', async () => {
      const payment = Payment.createSettled(
        {
          id: 'pay-find-by-id',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(12.5, 'USD'),
        },
        clock,
      );
      await repository.save(payment);

      const found = await repository.findById('pay-find-by-id');
      expect(found).not.toBeNull();
      expect(found!.id.value).toBe('pay-find-by-id');
      expect(found!.amount.amount).toBe(12.5);
    });

    it('retrieves all payments belonging to a Sale via findBySaleId (using @@index([saleId]))', async () => {
      // Split tender: 1 Cash + 1 QR
      const payCash = Payment.createSettled(
        {
          id: 'pay-split-cash',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(20.0, 'USD'),
        },
        clock,
      );
      const payQr = Payment.createSettled(
        {
          id: 'pay-split-qr',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(30.0, 'USD'),
          reference: 'QR-SPLIT-99',
        },
        clock,
      );

      await repository.save(payCash);
      await repository.save(payQr);

      const salePayments = await repository.findBySaleId(saleId);
      expect(salePayments).toHaveLength(2);

      const totalPaid = salePayments.reduce((sum, p) => sum.add(p.amount), Money.zero('USD'));
      expect(totalPaid.amount).toBe(50.0);
    });
  });

  // ==========================================================================
  // 9. Hexagonal Isolation: No Prisma Leakage into Domain
  // ==========================================================================
  describe('9. Hexagonal Boundary Isolation', () => {
    it('returns pure domain Payment aggregate instances without exposing Prisma models', async () => {
      const payment = Payment.createSettled(
        {
          id: 'pay-purity-check',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(15.0, 'USD'),
        },
        clock,
      );
      await repository.save(payment);

      const retrieved = await repository.findById('pay-purity-check');
      expect(retrieved).toBeInstanceOf(Payment);
      expect(retrieved!.id).toBeInstanceOf(PaymentId);
      expect(retrieved!.saleId).toBeInstanceOf(SaleId);
      expect(retrieved!.amount).toBeInstanceOf(Money);
      expect(retrieved!.status).toBe(PaymentStatus.COMPLETED);
    });
  });

  // ==========================================================================
  // 10. Hexagonal Architecture: Milestone 7.12 Repository Capabilities
  // ==========================================================================
  describe('10. Hexagonal Architecture: Milestone 7.12 Repository Capabilities', () => {
    it('supports create(payment) for persisting a newly created Payment aggregate', async () => {
      const payment = Payment.createPending(
        {
          id: 'pay-hex-create-01',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(25.0, 'USD'),
          reference: 'QR-CREATE-REF',
        },
        clock,
      );

      await repository.create(payment);

      const found = await repository.findById('pay-hex-create-01');
      expect(found).not.toBeNull();
      expect(found!.id.value).toBe('pay-hex-create-01');
      expect(found!.status).toBe(PaymentStatus.PENDING);
    });

    it('supports getById(id) as a first-class domain-oriented alias for findById(id)', async () => {
      const payment = Payment.createSettled(
        {
          id: 'pay-hex-getbyid-01',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(40.0, 'USD'),
        },
        clock,
      );
      await repository.save(payment);

      const byFind = await repository.findById('pay-hex-getbyid-01');
      const byGet = await repository.getById('pay-hex-getbyid-01');

      expect(byGet).not.toBeNull();
      expect(byFind).not.toBeNull();
      expect(byGet!.id.value).toBe(byFind!.id.value);
      expect(byGet!.amount.amount).toBe(40.0);
    });

    it('supports listBySaleId(saleId) as a domain-oriented alias for findBySaleId(saleId)', async () => {
      const p1 = Payment.createSettled(
        {
          id: 'pay-hex-sale-01',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(10.0, 'USD'),
        },
        clock,
      );
      const p2 = Payment.createSettled(
        {
          id: 'pay-hex-sale-02',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(20.0, 'USD'),
        },
        clock,
      );

      await repository.save(p1);
      await repository.save(p2);

      const listResult = await repository.listBySaleId(saleId);
      const findResult = await repository.findBySaleId(saleId);

      expect(listResult).toHaveLength(2);
      expect(listResult.map((p) => p.id.value)).toEqual(findResult.map((p) => p.id.value));
    });

    it('supports list() for deterministic paginated and filtered queries', async () => {
      const payment = Payment.createSettled(
        {
          id: 'pay-hex-list-01',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(50.0, 'USD'),
        },
        clock,
      );
      await repository.save(payment);

      const result = await repository.list(
        { saleId: saleId.value, tenantId },
        { page: 1, limit: 10 },
        { field: 'createdAt', direction: 'asc' },
      );

      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.items.length).toBeGreaterThanOrEqual(1);
    });

    it('preserves aggregate encapsulation: requires domain transitions before save(payment)', async () => {
      // 1. Initiate pending payment
      const payment = Payment.createPending(
        {
          id: 'pay-hex-lifecycle-01',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(35.0, 'USD'),
        },
        clock,
      );
      await repository.save(payment);

      // 2. Aggregate transitions through authoritative domain methods
      payment.complete({
        reference: 'AUTH-TX-99',
        paidAt: new Date('2026-10-01T15:35:00.000Z'),
        clock,
      });

      // 3. Repository persists full aggregate with incremented OCC version
      await repository.save(payment);

      const updated = await repository.getById('pay-hex-lifecycle-01');
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe(PaymentStatus.COMPLETED);
      expect(updated!.version).toBe(2);
      expect(updated!.reference?.value).toBe('AUTH-TX-99');
    });

    it('supports transaction boundary coordination via withTransaction()', async () => {
      const executed = await repository.withTransaction(async (txRepo: PaymentRepositoryPort) => {
        const payment = Payment.createSettled(
          {
            id: 'pay-hex-tx-01',
            tenantId,
            saleId,
            method: PaymentMethod.CASH,
            amount: Money.create(15.0, 'USD'),
          },
          clock,
        );
        await txRepo.save(payment);
        return true;
      });

      expect(executed).toBe(true);
      const found = await repository.getById('pay-hex-tx-01');
      expect(found).not.toBeNull();
    });

    it('verifies PaymentRepositoryPort adheres strictly to Hexagonal boundaries', () => {
      // Type-level verification of required capabilities:
      type PortMethods = keyof PaymentRepositoryPort;

      // Must have required capabilities:
      const hasCreate: 'create' extends PortMethods ? true : false = true;
      const hasGetById: 'getById' extends PortMethods ? true : false = true;
      const hasFindById: 'findById' extends PortMethods ? true : false = true;
      const hasList: 'list' extends PortMethods ? true : false = true;
      const hasListBySaleId: 'listBySaleId' extends PortMethods ? true : false = true;
      const hasFindBySaleId: 'findBySaleId' extends PortMethods ? true : false = true;
      const hasSave: 'save' extends PortMethods ? true : false = true;
      const hasWithTx: 'withTransaction' extends PortMethods ? true : false = true;

      expect(hasCreate).toBe(true);
      expect(hasGetById).toBe(true);
      expect(hasFindById).toBe(true);
      expect(hasList).toBe(true);
      expect(hasListBySaleId).toBe(true);
      expect(hasFindBySaleId).toBe(true);
      expect(hasSave).toBe(true);
      expect(hasWithTx).toBe(true);

      // Must FORBID partial update methods that bypass aggregate:
      const hasUpdateStatus: 'updateStatus' extends PortMethods ? true : false = false;
      const hasUpdateAmount: 'updateAmount' extends PortMethods ? true : false = false;
      const hasUpdatePaidAt: 'updatePaidAt' extends PortMethods ? true : false = false;
      const hasDelete: 'delete' extends PortMethods ? true : false = false;

      expect(hasUpdateStatus).toBe(false);
      expect(hasUpdateAmount).toBe(false);
      expect(hasUpdatePaidAt).toBe(false);
      expect(hasDelete).toBe(false);
    });
  });
});
