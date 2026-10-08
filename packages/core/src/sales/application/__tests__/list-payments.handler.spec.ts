import { ListPaymentsHandler } from '../queries/list-payments.handler';
import { ListPaymentsQuery } from '../queries/list-payments.query';
import {
  PaymentRepositoryPort,
  FindPaymentsCriteria,
  FindPaymentsPagination,
  FindPaymentsSort,
  FindPaymentsResult,
} from '../ports/payment-repository.port';
import { Payment } from '../../domain/payment.aggregate';
import { PaymentId } from '../../domain/value-objects/payment-id.vo';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { Money } from '../../domain/value-objects/money.vo';
import { PaymentReference } from '../../domain/value-objects/payment-reference.vo';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { PaymentMethod } from '../../domain/enums/payment-method.enum';
import { PaymentMapper } from '../mappers/payment.mapper';
import { PaymentDTO } from '../dtos/payment.dto';
import { InvalidPaymentQueryException } from '../exceptions/invalid-payment-query.exception';
import { PaymentUnauthorizedException } from '../exceptions/payment-unauthorized.exception';

class InMemoryPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public itemsOverride?: (Payment | PaymentDTO)[];
  public lastCriteria?: FindPaymentsCriteria;
  public lastPagination?: FindPaymentsPagination;
  public lastSort?: FindPaymentsSort;
  public throwOnFind?: Error;

  async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.store.values()).filter((p) => p.saleId.value === key);
  }

  async save(payment: Payment): Promise<void> {
    this.store.set(payment.id.value, payment);
  }

  async findMany(
    criteria: FindPaymentsCriteria,
    pagination: FindPaymentsPagination,
    sort: FindPaymentsSort,
  ): Promise<FindPaymentsResult> {
    this.lastCriteria = criteria;
    this.lastPagination = pagination;
    this.lastSort = sort;

    if (this.throwOnFind) {
      throw this.throwOnFind;
    }

    let items = this.itemsOverride
      ? [...this.itemsOverride]
      : Array.from(this.store.values()).map((p) => PaymentMapper.toDTO(p));

    // Filter criteria
    if (criteria.tenantId) {
      items = items.filter((p) => (p as PaymentDTO).tenantId === criteria.tenantId);
    }
    if (criteria.saleId) {
      items = items.filter((p) => (p as PaymentDTO).saleId === criteria.saleId);
    }
    if (criteria.status) {
      items = items.filter((p) => (p as PaymentDTO).status === criteria.status);
    }
    if (criteria.method) {
      items = items.filter((p) => (p as PaymentDTO).method === criteria.method);
    }
    if (criteria.createdAtFrom) {
      items = items.filter(
        (p) => new Date((p as PaymentDTO).createdAt).getTime() >= criteria.createdAtFrom!.getTime(),
      );
    }
    if (criteria.createdAtTo) {
      items = items.filter(
        (p) => new Date((p as PaymentDTO).createdAt).getTime() <= criteria.createdAtTo!.getTime(),
      );
    }
    if (criteria.paidAtFrom) {
      items = items.filter(
        (p) =>
          (p as PaymentDTO).paidAt !== null &&
          new Date((p as PaymentDTO).paidAt!).getTime() >= criteria.paidAtFrom!.getTime(),
      );
    }
    if (criteria.paidAtTo) {
      items = items.filter(
        (p) =>
          (p as PaymentDTO).paidAt !== null &&
          new Date((p as PaymentDTO).paidAt!).getTime() <= criteria.paidAtTo!.getTime(),
      );
    }

    // Sort with deterministic secondary sort (id asc)
    items.sort((a, b) => {
      const dtoA = a as PaymentDTO;
      const dtoB = b as PaymentDTO;
      let comparison: number;

      switch (sort.field) {
        case 'paidAt': {
          const timeA = dtoA.paidAt ? new Date(dtoA.paidAt).getTime() : 0;
          const timeB = dtoB.paidAt ? new Date(dtoB.paidAt).getTime() : 0;
          comparison = timeA - timeB;
          break;
        }
        case 'amount': {
          comparison = dtoA.amountValue - dtoB.amountValue;
          break;
        }
        case 'status': {
          comparison = dtoA.status.localeCompare(dtoB.status);
          break;
        }
        case 'createdAt':
        default: {
          const timeA = new Date(dtoA.createdAt).getTime();
          const timeB = new Date(dtoB.createdAt).getTime();
          comparison = timeA - timeB;
          break;
        }
      }

      if (comparison !== 0) {
        return sort.direction === 'desc' ? -comparison : comparison;
      }

      // Deterministic tie-breaker: id asc
      return dtoA.id.localeCompare(dtoB.id);
    });

    const total = items.length;
    const skip = (pagination.page - 1) * pagination.limit;
    const paginatedItems = items.slice(skip, skip + pagination.limit);

    return { items: paginatedItems, total };
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function createPaymentEntity(params: {
  id: string;
  tenantId?: string;
  saleId?: string;
  amount?: number;
  method?: PaymentMethod;
  status?: PaymentStatus;
  reference?: string;
  createdAt?: Date;
  paidAt?: Date | null;
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
    tenantId: params.tenantId ?? 'tenant-alpha',
    saleId: SaleId.create(params.saleId ?? 'sale-1'),
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

describe('ListPaymentsHandler Specification Suite (Application Query Architecture)', () => {
  let repository: InMemoryPaymentRepository;
  let handler: ListPaymentsHandler;

  const defaultUser = {
    userId: 'user-cashier-1',
    roles: ['Receptionist'],
    permissions: ['payments.read'],
  };

  beforeEach(() => {
    repository = new InMemoryPaymentRepository();
    handler = new ListPaymentsHandler(repository);
  });

  describe('1. Default Pagination & Deterministic Metadata', () => {
    it('should return default page 1, limit 20, sorted by createdAt desc', async () => {
      // Seed 25 payments
      for (let i = 1; i <= 25; i++) {
        const id = `payment-${String(i).padStart(3, '0')}`;
        const createdAt = new Date(`2026-10-01T10:${String(i).padStart(2, '0')}:00Z`);
        repository.store.set(
          id,
          createPaymentEntity({
            id,
            amount: 10.0 * i,
            createdAt,
          }),
        );
      }

      const result = await handler.execute(
        new ListPaymentsQuery({
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const page = result.getValue();

      expect(page.page).toBe(1);
      expect(page.limit).toBe(20);
      expect(page.total).toBe(25);
      expect(page.totalPages).toBe(2);
      expect(page.hasNextPage).toBe(true);
      expect(page.hasPreviousPage).toBe(false);
      expect(page.items).toHaveLength(20);

      // Verify default sorting: newest first (payment-025 to payment-006)
      expect(page.items[0]!.id).toBe('payment-025');
      expect(page.items[19]!.id).toBe('payment-006');

      // Verify repository was passed expected default contracts
      expect(repository.lastPagination).toEqual({ page: 1, limit: 20 });
      expect(repository.lastSort).toEqual({ field: 'createdAt', direction: 'desc' });
    });

    it('should paginate to page 2 with correct remainder and boundary flags', async () => {
      for (let i = 1; i <= 25; i++) {
        const id = `payment-${String(i).padStart(3, '0')}`;
        const createdAt = new Date(`2026-10-01T10:${String(i).padStart(2, '0')}:00Z`);
        repository.store.set(id, createPaymentEntity({ id, createdAt }));
      }

      const result = await handler.execute(
        new ListPaymentsQuery({
          page: 2,
          limit: 20,
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const page = result.getValue();

      expect(page.page).toBe(2);
      expect(page.limit).toBe(20);
      expect(page.total).toBe(25);
      expect(page.totalPages).toBe(2);
      expect(page.hasNextPage).toBe(false);
      expect(page.hasPreviousPage).toBe(true);
      expect(page.items).toHaveLength(5);
      expect(page.items[0]!.id).toBe('payment-005');
      expect(page.items[4]!.id).toBe('payment-001');
    });

    it('should respect nested pagination object convention (ADR-0132)', async () => {
      for (let i = 1; i <= 10; i++) {
        const id = `payment-${String(i).padStart(3, '0')}`;
        repository.store.set(id, createPaymentEntity({ id }));
      }

      const result = await handler.execute(
        new ListPaymentsQuery({
          pagination: { page: 2, limit: 5 },
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const page = result.getValue();
      expect(page.page).toBe(2);
      expect(page.limit).toBe(5);
      expect(page.items).toHaveLength(5);
      expect(repository.lastPagination).toEqual({ page: 2, limit: 5 });
    });

    it('should cap limit at maximum 100 to protect server resources', async () => {
      repository.store.set('payment-001', createPaymentEntity({ id: 'payment-001' }));

      const result = await handler.execute(
        new ListPaymentsQuery({
          limit: 500,
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().limit).toBe(100);
      expect(repository.lastPagination?.limit).toBe(100);
    });
  });

  describe('2. Justified Filter Capabilities', () => {
    beforeEach(() => {
      repository.store.set(
        'pay-1',
        createPaymentEntity({
          id: 'pay-1',
          saleId: 'sale-A',
          tenantId: 'tenant-1',
          method: PaymentMethod.CASH,
          status: PaymentStatus.COMPLETED,
          amount: 100,
          createdAt: new Date('2026-10-01T08:00:00Z'),
          paidAt: new Date('2026-10-01T08:05:00Z'),
        }),
      );
      repository.store.set(
        'pay-2',
        createPaymentEntity({
          id: 'pay-2',
          saleId: 'sale-A',
          tenantId: 'tenant-1',
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          amount: 50,
          createdAt: new Date('2026-10-02T09:00:00Z'),
          paidAt: null,
        }),
      );
      repository.store.set(
        'pay-3',
        createPaymentEntity({
          id: 'pay-3',
          saleId: 'sale-B',
          tenantId: 'tenant-1',
          method: PaymentMethod.CASH,
          status: PaymentStatus.FAILED,
          amount: 75,
          createdAt: new Date('2026-10-03T10:00:00Z'),
          paidAt: null,
        }),
      );
      repository.store.set(
        'pay-4',
        createPaymentEntity({
          id: 'pay-4',
          saleId: 'sale-B',
          tenantId: 'tenant-2',
          method: PaymentMethod.QR,
          status: PaymentStatus.CANCELLED,
          amount: 120,
          createdAt: new Date('2026-10-04T11:00:00Z'),
          paidAt: null,
        }),
      );
    });

    it('should filter by saleId', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          saleId: 'sale-A',
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const page = result.getValue();
      expect(page.total).toBe(2);
      expect(page.items.every((p) => p.saleId === 'sale-A')).toBe(true);
      expect(repository.lastCriteria?.saleId).toBe('sale-A');
    });

    it('should filter by status (case-insensitive string normalization)', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          status: 'pending',
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const page = result.getValue();
      expect(page.total).toBe(1);
      expect(page.items[0]!.id).toBe('pay-2');
      expect(page.items[0]!.status).toBe(PaymentStatus.PENDING);
      expect(repository.lastCriteria?.status).toBe(PaymentStatus.PENDING);
    });

    it('should filter by method (case-insensitive string normalization)', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          method: 'cash',
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const page = result.getValue();
      expect(page.total).toBe(2);
      expect(page.items.map((p) => p.id).sort()).toEqual(['pay-1', 'pay-3']);
      expect(repository.lastCriteria?.method).toBe(PaymentMethod.CASH);
    });

    it('should filter by createdAt range (createdAtFrom and createdAtTo)', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          createdAtFrom: '2026-10-02T00:00:00Z',
          createdAtTo: '2026-10-03T23:59:59Z',
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const page = result.getValue();
      expect(page.total).toBe(2);
      expect(page.items.map((p) => p.id).sort()).toEqual(['pay-2', 'pay-3']);
      expect(repository.lastCriteria?.createdAtFrom).toEqual(new Date('2026-10-02T00:00:00Z'));
      expect(repository.lastCriteria?.createdAtTo).toEqual(new Date('2026-10-03T23:59:59Z'));
    });

    it('should accept fromDate and toDate aliases for createdAt range (DataTable convention)', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          fromDate: '2026-10-01T00:00:00Z',
          toDate: '2026-10-01T23:59:59Z',
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const page = result.getValue();
      expect(page.total).toBe(1);
      expect(page.items[0]!.id).toBe('pay-1');
      expect(repository.lastCriteria?.createdAtFrom).toEqual(new Date('2026-10-01T00:00:00Z'));
    });

    it('should filter by paidAt range (paidAtFrom and paidAtTo)', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          paidAtFrom: '2026-10-01T08:00:00Z',
          paidAtTo: '2026-10-01T09:00:00Z',
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const page = result.getValue();
      expect(page.total).toBe(1);
      expect(page.items[0]!.id).toBe('pay-1');
      expect(repository.lastCriteria?.paidAtFrom).toEqual(new Date('2026-10-01T08:00:00Z'));
    });

    it('should filter by tenantId', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          tenantId: 'tenant-2',
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const page = result.getValue();
      expect(page.total).toBe(1);
      expect(page.items[0]!.id).toBe('pay-4');
      expect(repository.lastCriteria?.tenantId).toBe('tenant-2');
    });

    it('should support combining multiple filters simultaneously', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          filter: {
            saleId: 'sale-A',
            method: PaymentMethod.CASH,
            status: PaymentStatus.COMPLETED,
          },
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const page = result.getValue();
      expect(page.total).toBe(1);
      expect(page.items[0]!.id).toBe('pay-1');
    });
  });

  describe('3. Validated Sorting Dimensions', () => {
    beforeEach(() => {
      repository.store.set(
        'p-1',
        createPaymentEntity({
          id: 'p-1',
          amount: 100,
          status: PaymentStatus.COMPLETED,
          createdAt: new Date('2026-10-01T10:00:00Z'),
          paidAt: new Date('2026-10-01T10:05:00Z'),
        }),
      );
      repository.store.set(
        'p-2',
        createPaymentEntity({
          id: 'p-2',
          amount: 25,
          status: PaymentStatus.PENDING,
          createdAt: new Date('2026-10-02T10:00:00Z'),
          paidAt: null,
        }),
      );
      repository.store.set(
        'p-3',
        createPaymentEntity({
          id: 'p-3',
          amount: 250,
          status: PaymentStatus.FAILED,
          createdAt: new Date('2026-10-03T10:00:00Z'),
          paidAt: null,
        }),
      );
    });

    it('should sort by amount asc', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          sortBy: 'amount',
          sortOrder: 'asc',
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const ids = result.getValue().items.map((p) => p.id);
      expect(ids).toEqual(['p-2', 'p-1', 'p-3']); // 25, 100, 250
      expect(repository.lastSort).toEqual({ field: 'amount', direction: 'asc' });
    });

    it('should sort by amount desc', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          sortBy: 'amount',
          sortOrder: 'desc',
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const ids = result.getValue().items.map((p) => p.id);
      expect(ids).toEqual(['p-3', 'p-1', 'p-2']); // 250, 100, 25
      expect(repository.lastSort).toEqual({ field: 'amount', direction: 'desc' });
    });

    it('should sort by createdAt asc', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          sortBy: 'createdAt',
          sortOrder: 'asc',
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const ids = result.getValue().items.map((p) => p.id);
      expect(ids).toEqual(['p-1', 'p-2', 'p-3']);
      expect(repository.lastSort).toEqual({ field: 'createdAt', direction: 'asc' });
    });

    it('should sort by status asc (alphabetical)', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          sortBy: 'status',
          sortOrder: 'asc',
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const statuses = result.getValue().items.map((p) => p.status);
      expect(statuses).toEqual([
        PaymentStatus.COMPLETED,
        PaymentStatus.FAILED,
        PaymentStatus.PENDING,
      ]);
      expect(repository.lastSort).toEqual({ field: 'status', direction: 'asc' });
    });

    it('should sort by paidAt asc', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          sortBy: 'paidAt',
          sortOrder: 'desc',
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().items[0]!.id).toBe('p-1'); // p-1 has valid paidAt, others null
      expect(repository.lastSort).toEqual({ field: 'paidAt', direction: 'desc' });
    });

    it('should support sort via nested sort structure (ADR-0132)', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          sort: { field: 'amount', direction: 'asc' },
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(repository.lastSort).toEqual({ field: 'amount', direction: 'asc' });
    });
  });

  describe('4. Deterministic Ordering Guarantee', () => {
    it('should guarantee deterministic ordering with id asc tie-breaker when primary sort fields are identical', async () => {
      // 4 payments with EXACT same amount and createdAt
      const sharedDate = new Date('2026-10-01T12:00:00Z');
      repository.store.set(
        'p-delta',
        createPaymentEntity({ id: 'p-delta', amount: 50, createdAt: sharedDate }),
      );
      repository.store.set(
        'p-alpha',
        createPaymentEntity({ id: 'p-alpha', amount: 50, createdAt: sharedDate }),
      );
      repository.store.set(
        'p-charlie',
        createPaymentEntity({ id: 'p-charlie', amount: 50, createdAt: sharedDate }),
      );
      repository.store.set(
        'p-bravo',
        createPaymentEntity({ id: 'p-bravo', amount: 50, createdAt: sharedDate }),
      );

      const result = await handler.execute(
        new ListPaymentsQuery({
          sortBy: 'amount',
          sortOrder: 'asc',
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const ids = result.getValue().items.map((p) => p.id);
      // Because amounts are identical, secondary tie-breaker id asc must produce sorted order
      expect(ids).toEqual(['p-alpha', 'p-bravo', 'p-charlie', 'p-delta']);
    });
  });

  describe('5. Empty Result Contract', () => {
    it('should return empty result metadata with zero counts and negative navigation flags', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const page = result.getValue();
      expect(page.items).toEqual([]);
      expect(page.total).toBe(0);
      expect(page.totalPages).toBe(0);
      expect(page.page).toBe(1);
      expect(page.limit).toBe(20);
      expect(page.hasNextPage).toBe(false);
      expect(page.hasPreviousPage).toBe(false);
    });
  });

  describe('6. Invalid Input & Validation Error Handling', () => {
    it('should reject null or undefined query object', async () => {
      const result = await handler.execute(null as unknown as ListPaymentsQuery);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentQueryException);
    });

    it('should reject invalid page parameter (negative or zero)', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({ page: 0, currentUser: defaultUser }),
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentQueryException);
      expect((result.getError() as InvalidPaymentQueryException).code).toBe('INVALID_PAGINATION');
    });

    it('should reject non-integer page parameter', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({ page: 1.5, currentUser: defaultUser }),
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentQueryException);
    });

    it('should reject invalid limit parameter (negative or zero)', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({ limit: -5, currentUser: defaultUser }),
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentQueryException);
      expect((result.getError() as InvalidPaymentQueryException).code).toBe('INVALID_PAGINATION');
    });

    it('should reject unsupported sort field preventing arbitrary dynamic database injection', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          sortBy: 'arbitraryColumn; DROP TABLE payments;',
          currentUser: defaultUser,
        }),
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentQueryException);
      expect((result.getError() as InvalidPaymentQueryException).code).toBe('INVALID_SORT_FIELD');
    });

    it('should reject invalid sort direction', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          sortDirection: 'sideways',
          currentUser: defaultUser,
        }),
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentQueryException);
      expect((result.getError() as InvalidPaymentQueryException).code).toBe(
        'INVALID_SORT_DIRECTION',
      );
    });

    it('should reject invalid payment status filter', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          status: 'NOT_A_STATUS',
          currentUser: defaultUser,
        }),
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentQueryException);
      expect((result.getError() as InvalidPaymentQueryException).code).toBe('INVALID_FILTER');
    });

    it('should reject invalid payment method filter', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          method: 'BITCOIN',
          currentUser: defaultUser,
        }),
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentQueryException);
      expect((result.getError() as InvalidPaymentQueryException).code).toBe('INVALID_FILTER');
    });

    it('should reject malformed createdAtFrom date', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          createdAtFrom: 'not-a-date',
          currentUser: defaultUser,
        }),
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentQueryException);
      expect((result.getError() as InvalidPaymentQueryException).code).toBe('INVALID_FILTER');
    });

    it('should reject malformed createdAtTo date', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          createdAtTo: 'invalid-date',
          currentUser: defaultUser,
        }),
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentQueryException);
      expect((result.getError() as InvalidPaymentQueryException).code).toBe('INVALID_FILTER');
    });

    it('should reject when createdAtFrom is chronologically after createdAtTo', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          createdAtFrom: '2026-10-10T00:00:00Z',
          createdAtTo: '2026-10-01T00:00:00Z',
          currentUser: defaultUser,
        }),
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentQueryException);
      expect((result.getError() as InvalidPaymentQueryException).code).toBe('INVALID_FILTER');
    });

    it('should reject malformed paidAtFrom date', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          paidAtFrom: 'invalid-date',
          currentUser: defaultUser,
        }),
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentQueryException);
      expect((result.getError() as InvalidPaymentQueryException).code).toBe('INVALID_FILTER');
    });

    it('should reject malformed paidAtTo date', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          paidAtTo: 'invalid-date',
          currentUser: defaultUser,
        }),
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentQueryException);
      expect((result.getError() as InvalidPaymentQueryException).code).toBe('INVALID_FILTER');
    });

    it('should reject when paidAtFrom is chronologically after paidAtTo', async () => {
      const result = await handler.execute(
        new ListPaymentsQuery({
          paidAtFrom: '2026-10-05T00:00:00Z',
          paidAtTo: '2026-10-01T00:00:00Z',
          currentUser: defaultUser,
        }),
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentQueryException);
      expect((result.getError() as InvalidPaymentQueryException).code).toBe('INVALID_FILTER');
    });
  });

  describe('7. Security, Authorization & Decoupling', () => {
    it('should reject unauthorized caller lacking payments.read permission', async () => {
      const unauthorizedUser = {
        userId: 'unauth-user',
        roles: ['Trainer'],
        permissions: ['gym.read'],
      };

      const result = await handler.execute(
        new ListPaymentsQuery({
          currentUser: unauthorizedUser,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
    });

    it('should allow caller with billing.read permission (backward-compatibility alias)', async () => {
      const billingUser = {
        userId: 'billing-auditor',
        roles: ['Manager'],
        permissions: ['billing.read'],
      };

      const result = await handler.execute(
        new ListPaymentsQuery({
          currentUser: billingUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
    });

    it('should gracefully handle repository failures and return failure result', async () => {
      repository.throwOnFind = new Error('Database connection timeout');

      const result = await handler.execute(
        new ListPaymentsQuery({
          currentUser: defaultUser,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result.getError())).toContain('Database connection timeout');
    });

    it('should preserve aggregate decoupling by never loading complete Sale aggregate trees', async () => {
      repository.store.set(
        'pay-isolated',
        createPaymentEntity({
          id: 'pay-isolated',
          saleId: 'sale-unloaded-aggregate',
        }),
      );

      const result = await handler.execute(
        new ListPaymentsQuery({
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const item = result.getValue().items[0]!;
      // Only scalar saleId is present in PaymentDTO, keeping contexts decoupled
      expect(item.saleId).toBe('sale-unloaded-aggregate');
      expect((item as unknown as { sale?: unknown }).sale).toBeUndefined();
    });

    it('should map domain Payment instances into pure PaymentDTOs without Prisma internals', async () => {
      repository.itemsOverride = [
        createPaymentEntity({
          id: 'pay-domain-inst',
          amount: 88.5,
        }),
      ];

      const result = await handler.execute(
        new ListPaymentsQuery({
          currentUser: defaultUser,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const item = result.getValue().items[0]!;
      expect(item.id).toBe('pay-domain-inst');
      expect(item.amount.amount).toBe(88.5);
      expect(item.amount.formatted).toBe('88.50');
      expect(item.amount.cents).toBe(8850);
      expect(item.amountValue).toBe(88.5);
      // Zero Prisma.Decimal exposure
      expect(typeof item.amount.amount).toBe('number');
      expect(typeof item.amount.formatted).toBe('string');
      expect(typeof item.amount.cents).toBe('number');
      expect(typeof item.amountValue).toBe('number');
    });
  });
});
