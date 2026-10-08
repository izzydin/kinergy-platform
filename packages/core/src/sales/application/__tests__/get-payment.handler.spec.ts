import { GetPaymentHandler, GetPaymentByIdHandler } from '../queries/get-payment.handler';
import { GetPaymentQuery, GetPaymentByIdQuery } from '../queries/get-payment.query';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { Payment } from '../../domain/payment.aggregate';
import { PaymentId } from '../../domain/value-objects/payment-id.vo';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { Money } from '../../domain/value-objects/money.vo';
import { PaymentMethod } from '../../domain/enums/payment-method.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { DeterministicClock } from '../../domain/shared/clock';
import { PaymentNotFoundException } from '../exceptions/payment-not-found.exception';
import { PaymentUnauthorizedException } from '../exceptions/payment-unauthorized.exception';

// In-Memory Test Double for PaymentRepositoryPort
class InMemoryPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public findByIdCallCount = 0;
  public saveCallCount = 0;

  async findById(id: PaymentId | string): Promise<Payment | null> {
    this.findByIdCallCount += 1;
    const key = typeof id === 'string' ? id.trim() : id.value;
    const payment = this.store.get(key);
    if (!payment) return null;
    return Payment.reconstitute({
      id: payment.id,
      tenantId: payment.tenantId,
      saleId: payment.saleId,
      method: payment.method,
      amount: payment.amount,
      status: payment.status,
      reference: payment.reference,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      version: payment.version,
    });
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.store.values()).filter((p) => p.saleId.value === key);
  }

  async save(payment: Payment): Promise<void> {
    this.saveCallCount += 1;
    this.store.set(payment.id.value, payment);
  }
}

function getErrorMessage(error: Error | string): string {
  return error instanceof Error ? error.message : error;
}

describe('GetPaymentHandler Specification Suite (Application Query Architecture)', () => {
  const tenantId = 'tenant_kinergy_wellness';
  const t0 = new Date('2026-10-01T10:00:00.000Z');
  const t1 = new Date('2026-10-01T10:30:00.000Z');

  let clock: DeterministicClock;
  let paymentRepo: InMemoryPaymentRepository;
  let handler: GetPaymentHandler;

  beforeEach(() => {
    clock = new DeterministicClock(t0);
    paymentRepo = new InMemoryPaymentRepository();
    handler = new GetPaymentHandler(paymentRepo);
  });

  describe('1. Valid Payment Retrieval & DTO Representation', () => {
    it('should successfully retrieve a COMPLETED payment with exact monetary and lifecycle representations', async () => {
      // Create settled payment
      const payment = Payment.createCompleted(
        {
          id: 'pay_settled_001',
          tenantId,
          saleId: 'sale_invoice_123',
          method: PaymentMethod.CASH,
          amount: Money.create(150.5, 'USD'),
          reference: 'POS-DRAWER-TICKET-889',
        },
        clock,
      );
      paymentRepo.store.set(payment.id.value, payment);

      const query = new GetPaymentQuery({
        paymentId: 'pay_settled_001',
        tenantId,
        currentUser: {
          id: 'cashier_1',
          roles: ['Receptionist'],
          permissions: ['payments.read'],
        },
      });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();

      // Approved application representation verification
      expect(dto.id).toBe('pay_settled_001');
      expect(dto.tenantId).toBe(tenantId);
      expect(dto.saleId).toBe('sale_invoice_123'); // scalar identifier coupling only
      expect(dto.method).toBe(PaymentMethod.CASH);
      expect(dto.status).toBe(PaymentStatus.COMPLETED);

      // Financial precision without floating point / Prisma.Decimal leakage
      expect(dto.amount).toEqual({
        amount: 150.5,
        cents: 15050,
        currency: 'USD',
        formatted: '150.50',
      });
      expect(dto.amountValue).toBe(150.5);

      // Tender reference representation
      expect(dto.reference).toBe('POS-DRAWER-TICKET-889');

      // Lifecycle timestamps
      expect(dto.paidAt).toBe(t0.toISOString());
      expect(dto.createdAt).toBe(t0.toISOString());
      expect(dto.updatedAt).toBe(t0.toISOString());
      expect(dto.version).toBe(1);

      // Zero repository write side-effects
      expect(paymentRepo.saveCallCount).toBe(0);
      expect(paymentRepo.findByIdCallCount).toBe(1);
    });

    it('should retrieve a PENDING payment with null paidAt timestamp', async () => {
      const payment = Payment.createPending(
        {
          id: 'pay_pending_002',
          tenantId,
          saleId: 'sale_invoice_456',
          method: PaymentMethod.QR,
          amount: Money.create(85.0, 'USD'),
        },
        clock,
      );
      paymentRepo.store.set(payment.id.value, payment);

      const query = new GetPaymentQuery({
        paymentId: 'pay_pending_002',
        tenantId,
      });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();

      expect(dto.id).toBe('pay_pending_002');
      expect(dto.status).toBe(PaymentStatus.PENDING);
      expect(dto.paidAt).toBeNull(); // strictly null for unsettled payment
      expect(dto.reference).toBeNull();
      expect(dto.amount.cents).toBe(8500);
    });

    it('should retrieve a FAILED payment with audit timestamps and null paidAt', async () => {
      const payment = Payment.createPending(
        {
          id: 'pay_failed_003',
          tenantId,
          saleId: 'sale_invoice_789',
          method: PaymentMethod.QR,
          amount: Money.create(200.0, 'USD'),
        },
        clock,
      );
      clock.setTime(t1);
      payment.fail('Rail decline: insufficient balance', clock);
      paymentRepo.store.set(payment.id.value, payment);

      const query = new GetPaymentQuery({
        paymentId: 'pay_failed_003',
        tenantId,
      });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();

      expect(dto.status).toBe(PaymentStatus.FAILED);
      expect(dto.paidAt).toBeNull();
      expect(dto.createdAt).toBe(t0.toISOString());
      expect(dto.updatedAt).toBe(t1.toISOString());
      expect(dto.version).toBe(2);
    });

    it('should work seamlessly via backward-compatibility alias GetPaymentByIdQuery & GetPaymentByIdHandler', async () => {
      const payment = Payment.createCompleted(
        {
          id: 'pay_alias_004',
          tenantId,
          saleId: 'sale_invoice_999',
          method: PaymentMethod.CASH,
          amount: Money.create(10.0, 'USD'),
        },
        clock,
      );
      paymentRepo.store.set(payment.id.value, payment);

      const legacyHandler = new GetPaymentByIdHandler(paymentRepo);
      const legacyQuery = new GetPaymentByIdQuery({
        paymentId: 'pay_alias_004',
        tenantId,
      });

      const result = await legacyHandler.execute(legacyQuery);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().id).toBe('pay_alias_004');
    });
  });

  describe('2. Validation & Not-Found Behavior', () => {
    it('should return PaymentNotFoundException when payment does not exist in repository', async () => {
      const query = new GetPaymentQuery({
        paymentId: 'pay_nonexistent_999',
        tenantId,
      });

      const result = await handler.execute(query);

      expect(result.isFailure).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(PaymentNotFoundException);
      expect(getErrorMessage(error)).toContain('pay_nonexistent_999');
    });

    it('should reject empty or blank payment identifier', async () => {
      const query = new GetPaymentQuery({
        paymentId: '   ',
        tenantId,
      });

      const result = await handler.execute(query);

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result.getError())).toContain(
        'Payment ID cannot be empty or whitespace',
      );
    });

    it('should reject null or undefined query input', async () => {
      const result = await handler.execute(null as unknown as GetPaymentQuery);

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result.getError())).toContain(
        'GetPayment input cannot be null or undefined',
      );
    });
  });

  describe('3. Architectural Boundaries, Isolation & Decoupling', () => {
    it('preserves aggregate boundary decoupling without eagerly loading the Sale Aggregate', async () => {
      const payment = Payment.createCompleted(
        {
          id: 'pay_decoupled_005',
          tenantId,
          saleId: 'sale_independent_111',
          method: PaymentMethod.CASH,
          amount: Money.create(50.0, 'USD'),
        },
        clock,
      );
      paymentRepo.store.set(payment.id.value, payment);

      const result = await handler.execute(
        new GetPaymentQuery({
          paymentId: 'pay_decoupled_005',
          tenantId,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();

      // Proves scalar identifier coupling: contains scalar saleId, not full Sale aggregate
      expect(dto.saleId).toBe('sale_independent_111');
      const untypedDto = dto as unknown as Record<string, unknown>;
      expect(untypedDto.sale).toBeUndefined();
      expect(untypedDto.saleSummary).toBeUndefined();
    });

    it('does NOT expose Prisma models or Prisma.Decimal in the application DTO', async () => {
      const payment = Payment.createCompleted(
        {
          id: 'pay_clean_dto_006',
          tenantId,
          saleId: 'sale_clean_222',
          method: PaymentMethod.CASH,
          amount: Money.create(75.25, 'USD'),
        },
        clock,
      );
      paymentRepo.store.set(payment.id.value, payment);

      const result = await handler.execute(
        new GetPaymentQuery({
          paymentId: 'pay_clean_dto_006',
          tenantId,
        }),
      );

      const dto = result.getValue();

      // Type inspection: amountValue is plain JavaScript number, amount.cents is integer
      expect(typeof dto.amountValue).toBe('number');
      expect(typeof dto.amount.cents).toBe('number');
      expect(Number.isInteger(dto.amount.cents)).toBe(true);
      expect(typeof dto.amount.formatted).toBe('string');
      // No Prisma or decimal prototype
      expect(dto.amount.constructor.name).toBe('Object');
    });

    it('enforces multi-tenant isolation when tenantId is specified', async () => {
      const payment = Payment.createCompleted(
        {
          id: 'pay_tenant_a_007',
          tenantId: 'tenant_wellness_center',
          saleId: 'sale_tenant_a',
          method: PaymentMethod.CASH,
          amount: Money.create(100.0, 'USD'),
        },
        clock,
      );
      paymentRepo.store.set(payment.id.value, payment);

      const result = await handler.execute(
        new GetPaymentQuery({
          paymentId: 'pay_tenant_a_007',
          tenantId: 'tenant_other_facility',
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
      expect(getErrorMessage(result.getError())).toContain('Cross-tenant access forbidden');
    });

    it('enforces authorization checks rejecting unauthorized user', async () => {
      const payment = Payment.createCompleted(
        {
          id: 'pay_secure_008',
          tenantId,
          saleId: 'sale_secure_333',
          method: PaymentMethod.CASH,
          amount: Money.create(100.0, 'USD'),
        },
        clock,
      );
      paymentRepo.store.set(payment.id.value, payment);

      const result = await handler.execute(
        new GetPaymentQuery({
          paymentId: 'pay_secure_008',
          tenantId,
          currentUser: {
            id: 'unauth_user',
            roles: ['Member'],
            permissions: ['inventory.read'], // lacks payments.read
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
    });

    it('is strictly side-effect free: zero database mutations and zero domain event emissions', async () => {
      const payment = Payment.createCompleted(
        {
          id: 'pay_pure_009',
          tenantId,
          saleId: 'sale_pure_444',
          method: PaymentMethod.CASH,
          amount: Money.create(100.0, 'USD'),
        },
        clock,
      );
      paymentRepo.store.set(payment.id.value, payment);

      // Execute query twice
      await handler.execute(new GetPaymentQuery({ paymentId: 'pay_pure_009', tenantId }));
      await handler.execute(new GetPaymentQuery({ paymentId: 'pay_pure_009', tenantId }));

      // Repository save was never called
      expect(paymentRepo.saveCallCount).toBe(0);
      // Aggregate has no uncommitted events
      const retrieved = await paymentRepo.findById('pay_pure_009');
      expect(retrieved!.getUncommittedEvents()).toHaveLength(0);
    });
  });
});
