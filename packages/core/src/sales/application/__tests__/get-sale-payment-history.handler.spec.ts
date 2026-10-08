import { GetSalePaymentHistoryHandler } from '../queries/get-sale-payment-history.handler';
import { GetSalePaymentHistoryQuery } from '../queries/get-sale-payment-history.query';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { Payment } from '../../domain/payment.aggregate';
import { PaymentId } from '../../domain/value-objects/payment-id.vo';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { Money } from '../../domain/value-objects/money.vo';
import { PaymentReference } from '../../domain/value-objects/payment-reference.vo';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { PaymentMethod } from '../../domain/enums/payment-method.enum';
import { Sale } from '../../domain/sale.aggregate';
import { SaleSource } from '../../domain/value-objects/sale-source.vo';
import { SaleSourceType } from '../../domain/enums/sale-source-type.enum';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { PaymentUnauthorizedException } from '../exceptions/payment-unauthorized.exception';

class InMemoryPaymentRepository implements PaymentRepositoryPort {
  public payments: Payment[] = [];

  async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.payments.find((p) => p.id.value === key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return this.payments.filter((p) => p.saleId.value === key);
  }

  async save(payment: Payment): Promise<void> {
    const index = this.payments.findIndex((p) => p.id.equals(payment.id));
    if (index >= 0) {
      this.payments[index] = payment;
    } else {
      this.payments.push(payment);
    }
  }
}

class InMemorySaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.store.set(sale.id.value, sale);
  }
}

function createTestSale(id: string, tenantId = 'tenant-kinergy'): Sale {
  return Sale.create({
    id: SaleId.create(id),
    tenantId,
    clientId: 'client-1',
    currency: 'USD',
    source: SaleSource.create(SaleSourceType.FOOD, 'order-1'),
  });
}

function createTestPayment(params: {
  id: string;
  saleId: string;
  tenantId?: string;
  amount?: number;
  method?: PaymentMethod;
  status?: PaymentStatus;
  createdAt?: Date;
  paidAt?: Date | null;
  reference?: string;
}): Payment {
  const status = params.status ?? PaymentStatus.COMPLETED;
  const createdAt = params.createdAt ?? new Date('2026-10-01T10:00:00Z');
  const paidAt =
    params.paidAt !== undefined
      ? params.paidAt
      : status === PaymentStatus.COMPLETED
        ? createdAt
        : null;

  return Payment.reconstitute({
    id: PaymentId.create(params.id),
    tenantId: params.tenantId ?? 'tenant-kinergy',
    saleId: SaleId.create(params.saleId),
    method: params.method ?? PaymentMethod.CASH,
    amount: Money.create(params.amount ?? 50.0, 'USD'),
    status,
    reference: params.reference ? PaymentReference.create(params.reference) : null,
    paidAt,
    createdAt,
    updatedAt: createdAt,
    version: 1,
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

describe('GetSalePaymentHistoryHandler Specification Suite (Financial Query Architecture)', () => {
  let paymentRepo: InMemoryPaymentRepository;
  let saleRepo: InMemorySaleRepository;
  let handler: GetSalePaymentHistoryHandler;

  const tenantId = 'tenant-kinergy';
  const saleId = 'sale-target-123';
  const defaultUser = {
    userId: 'user-cashier-1',
    roles: ['Receptionist'],
    permissions: ['payments.read'],
  };

  beforeEach(() => {
    paymentRepo = new InMemoryPaymentRepository();
    saleRepo = new InMemorySaleRepository();
    handler = new GetSalePaymentHistoryHandler(paymentRepo, saleRepo);

    // Seed target sale
    saleRepo.store.set(saleId, createTestSale(saleId, tenantId));
  });

  describe('1. "History" Scope & Lifecycle State Comprehensiveness', () => {
    it('should retrieve ALL payments across all lifecycle states (PENDING, COMPLETED, FAILED, CANCELLED)', async () => {
      // In Kinergy (ADR-0115, ADR-0122 §5, ADR-0133 §5.7), history means ALL payments referencing the Sale,
      // not merely settled/completed ones.
      const p1 = createTestPayment({
        id: 'pay-001',
        saleId,
        status: PaymentStatus.FAILED,
        method: PaymentMethod.QR,
        createdAt: new Date('2026-10-01T10:00:00Z'),
        paidAt: null,
      });
      const p2 = createTestPayment({
        id: 'pay-002',
        saleId,
        status: PaymentStatus.CANCELLED,
        method: PaymentMethod.QR,
        createdAt: new Date('2026-10-01T10:05:00Z'),
        paidAt: null,
      });
      const p3 = createTestPayment({
        id: 'pay-003',
        saleId,
        status: PaymentStatus.PENDING,
        method: PaymentMethod.CASH,
        createdAt: new Date('2026-10-01T10:10:00Z'),
        paidAt: null,
      });
      const p4 = createTestPayment({
        id: 'pay-004',
        saleId,
        status: PaymentStatus.COMPLETED,
        method: PaymentMethod.CASH,
        createdAt: new Date('2026-10-01T10:15:00Z'),
        paidAt: new Date('2026-10-01T10:15:00Z'),
      });

      paymentRepo.payments.push(p1, p2, p3, p4);

      const result = await handler.execute(
        new GetSalePaymentHistoryQuery({
          saleId,
          tenantId,
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const history = result.getValue();
      expect(history).toHaveLength(4);

      // Verify presence of every lifecycle state
      const statuses = history.map((p) => p.status);
      expect(statuses).toEqual([
        PaymentStatus.FAILED,
        PaymentStatus.CANCELLED,
        PaymentStatus.PENDING,
        PaymentStatus.COMPLETED,
      ]);

      // Verify settlement timestamps: null for unsettled, valid ISO string for completed
      expect(history[0]!.paidAt).toBeNull();
      expect(history[1]!.paidAt).toBeNull();
      expect(history[2]!.paidAt).toBeNull();
      expect(history[3]!.paidAt).toBe('2026-10-01T10:15:00.000Z');
    });

    it('should return an empty array when the Sale exists but has no recorded payments', async () => {
      const result = await handler.execute(
        new GetSalePaymentHistoryQuery({
          saleId,
          tenantId,
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toEqual([]);
    });

    it('should isolate payments strictly to the requested saleId', async () => {
      const otherSaleId = 'sale-other-999';
      saleRepo.store.set(otherSaleId, createTestSale(otherSaleId, tenantId));

      paymentRepo.payments.push(
        createTestPayment({ id: 'pay-target', saleId, amount: 40 }),
        createTestPayment({ id: 'pay-unrelated', saleId: otherSaleId, amount: 90 }),
      );

      const result = await handler.execute(
        new GetSalePaymentHistoryQuery({
          saleId,
          tenantId,
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const history = result.getValue();
      expect(history).toHaveLength(1);
      expect(history[0]!.id).toBe('pay-target');
      expect(history[0]!.saleId).toBe(saleId);
    });
  });

  describe('2. Deterministic Ordering', () => {
    it('should order payments chronologically (createdAt ASC) by default', async () => {
      const p1 = createTestPayment({
        id: 'pay-mid',
        saleId,
        createdAt: new Date('2026-10-01T10:10:00Z'),
      });
      const p2 = createTestPayment({
        id: 'pay-first',
        saleId,
        createdAt: new Date('2026-10-01T10:00:00Z'),
      });
      const p3 = createTestPayment({
        id: 'pay-last',
        saleId,
        createdAt: new Date('2026-10-01T10:20:00Z'),
      });

      // Inserted in non-chronological order
      paymentRepo.payments.push(p1, p2, p3);

      const result = await handler.execute(
        new GetSalePaymentHistoryQuery({
          saleId,
          tenantId,
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const history = result.getValue();
      expect(history.map((p) => p.id)).toEqual(['pay-first', 'pay-mid', 'pay-last']);
    });

    it('should apply id ASC as deterministic tie-breaker when createdAt timestamps are identical', async () => {
      const sameTimestamp = new Date('2026-10-01T12:00:00Z');
      const pDelta = createTestPayment({ id: 'pay-delta', saleId, createdAt: sameTimestamp });
      const pAlpha = createTestPayment({ id: 'pay-alpha', saleId, createdAt: sameTimestamp });
      const pCharlie = createTestPayment({ id: 'pay-charlie', saleId, createdAt: sameTimestamp });
      const pBravo = createTestPayment({ id: 'pay-bravo', saleId, createdAt: sameTimestamp });

      paymentRepo.payments.push(pDelta, pAlpha, pCharlie, pBravo);

      const result = await handler.execute(
        new GetSalePaymentHistoryQuery({
          saleId,
          tenantId,
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const ids = result.getValue().map((p) => p.id);
      expect(ids).toEqual(['pay-alpha', 'pay-bravo', 'pay-charlie', 'pay-delta']);
    });

    it('should support reverse chronological order (order: "desc") with deterministic tie-breaker', async () => {
      const p1 = createTestPayment({
        id: 'pay-first',
        saleId,
        createdAt: new Date('2026-10-01T10:00:00Z'),
      });
      const p2 = createTestPayment({
        id: 'pay-second',
        saleId,
        createdAt: new Date('2026-10-01T10:10:00Z'),
      });
      const p3 = createTestPayment({
        id: 'pay-third',
        saleId,
        createdAt: new Date('2026-10-01T10:20:00Z'),
      });

      paymentRepo.payments.push(p1, p2, p3);

      const result = await handler.execute(
        new GetSalePaymentHistoryQuery({
          saleId,
          tenantId,
          order: 'desc',
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const ids = result.getValue().map((p) => p.id);
      expect(ids).toEqual(['pay-third', 'pay-second', 'pay-first']);
    });
  });

  describe('3. Sale Validation & Existence Conventions', () => {
    it('should fail when Sale ID is empty or only whitespace', async () => {
      const result = await handler.execute(
        new GetSalePaymentHistoryQuery({
          saleId: '   ',
          currentUser: defaultUser,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result.getError())).toContain('Sale ID cannot be empty');
    });

    it('should fail with SaleNotFoundException when the referenced Sale does not exist', async () => {
      const missingSaleId = 'sale-non-existent-404';

      const result = await handler.execute(
        new GetSalePaymentHistoryQuery({
          saleId: missingSaleId,
          tenantId,
          currentUser: defaultUser,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect(getErrorMessage(result.getError())).toContain(missingSaleId);
    });

    it('should reject null or undefined query object', async () => {
      const result = await handler.execute(null as unknown as GetSalePaymentHistoryQuery);
      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result.getError())).toContain('Query and input cannot be null');
    });
  });

  describe('4. Multi-Tenant Isolation & Authorization', () => {
    it('should reject cross-tenant access when caller tenant does not match Sale tenant', async () => {
      const alienTenantId = 'tenant-alien-gym';

      const result = await handler.execute(
        new GetSalePaymentHistoryQuery({
          saleId,
          tenantId: alienTenantId,
          currentUser: defaultUser,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
      expect(getErrorMessage(result.getError())).toContain('Cross-tenant access forbidden');
    });

    it('should filter payments matching caller tenant when tenantId is specified', async () => {
      paymentRepo.payments.push(
        createTestPayment({ id: 'p-auth-tenant', saleId, tenantId }),
        createTestPayment({ id: 'p-other-tenant', saleId, tenantId: 'other-tenant-abc' }),
      );

      const result = await handler.execute(
        new GetSalePaymentHistoryQuery({
          saleId,
          tenantId,
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const history = result.getValue();
      expect(history).toHaveLength(1);
      expect(history[0]!.id).toBe('p-auth-tenant');
    });

    it('should reject caller lacking payments.read permission', async () => {
      const unauthorizedUser = {
        userId: 'unauth-cleaner',
        roles: ['Cleaner'],
        permissions: ['cleaning.log'],
      };

      const result = await handler.execute(
        new GetSalePaymentHistoryQuery({
          saleId,
          tenantId,
          currentUser: unauthorizedUser,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
    });

    it('should accept caller with billing.read permission (backward-compatibility alias)', async () => {
      const billingAuditor = {
        userId: 'billing-auditor',
        roles: ['Manager'],
        permissions: ['billing.read'],
      };

      const result = await handler.execute(
        new GetSalePaymentHistoryQuery({
          saleId,
          tenantId,
          currentUser: billingAuditor,
        }),
      );

      expect(result.isSuccess).toBe(true);
    });
  });

  describe('5. Purity, Decoupling & Backward Compatibility', () => {
    it('should return pure PaymentDTO representation without Prisma.Decimal or ORM instances', async () => {
      paymentRepo.payments.push(
        createTestPayment({
          id: 'pay-pure',
          saleId,
          amount: 149.95,
          reference: 'POS-DRAWER-1',
          method: PaymentMethod.CASH,
          status: PaymentStatus.COMPLETED,
        }),
      );

      const result = await handler.execute(
        new GetSalePaymentHistoryQuery({
          saleId,
          tenantId,
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const item = result.getValue()[0]!;

      expect(item.id).toBe('pay-pure');
      expect(item.saleId).toBe(saleId);
      expect(item.method).toBe(PaymentMethod.CASH);
      expect(item.status).toBe(PaymentStatus.COMPLETED);
      expect(item.reference).toBe('POS-DRAWER-1');
      expect(item.amount.amount).toBe(149.95);
      expect(item.amount.formatted).toBe('149.95');
      expect(item.amount.cents).toBe(14995);
      expect(item.amountValue).toBe(149.95);

      // Verify strict types (no Prisma Decimal leakage)
      expect(typeof item.amount.amount).toBe('number');
      expect(typeof item.amount.cents).toBe('number');
      expect(typeof item.amount.formatted).toBe('string');
      expect(typeof item.amountValue).toBe('number');

      // Aggregate decoupling: does NOT embed full Sale aggregate
      expect((item as unknown as { sale?: unknown }).sale).toBeUndefined();
    });

    it('should support sortDirection as alias for order', async () => {
      paymentRepo.payments.push(createTestPayment({ id: 'pay-alias', saleId }));

      const aliasHandler = new GetSalePaymentHistoryHandler(paymentRepo, saleRepo);
      const result = await aliasHandler.execute(
        new GetSalePaymentHistoryQuery({
          saleId,
          tenantId,
          sortDirection: 'desc',
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toHaveLength(1);
      expect(result.getValue()[0]!.id).toBe('pay-alias');
    });

    it('should operate cleanly even when SaleRepository is omitted (handler constructor flexibility)', async () => {
      // Handlers constructed without saleRepository (e.g. lightweight query services)
      const standaloneHandler = new GetSalePaymentHistoryHandler(paymentRepo);
      paymentRepo.payments.push(createTestPayment({ id: 'pay-standalone', saleId }));

      const result = await standaloneHandler.execute(
        new GetSalePaymentHistoryQuery({
          saleId,
          tenantId,
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toHaveLength(1);
    });
  });
});
