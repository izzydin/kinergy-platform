import {
  Payment,
  PaymentId,
  SaleId,
  Money,
  PaymentMethod,
  PaymentStatus,
  Sale,
  SaleSource,
  SaleSourceType,
  PaymentNotFoundException,
  SaleNotFoundException,
  PaymentUnauthorizedException,
  checkPaymentAuthorization,
  GetPaymentHandler,
  GetPaymentQuery,
  GetSalePaymentHistoryHandler,
  GetSalePaymentHistoryQuery,
  GetPaymentsBySaleIdHandler,
  GetPaymentsBySaleIdQuery,
  ListPaymentsHandler,
  ListPaymentsQuery,
  PaymentRepositoryPort,
  SaleRepositoryPort,
  FindPaymentsCriteria,
  FindPaymentsPagination,
  FindPaymentsSort,
} from '../../../../';

class InMemoryPaymentRepo implements PaymentRepositoryPort {
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
    const idx = this.payments.findIndex((p) => p.id.equals(payment.id));
    if (idx >= 0) {
      this.payments[idx] = payment;
    } else {
      this.payments.push(payment);
    }
  }

  async findMany(
    criteria: FindPaymentsCriteria,
    pagination: FindPaymentsPagination,
    _sort?: FindPaymentsSort,
  ): Promise<{ items: Payment[]; total: number }> {
    let filtered = [...this.payments];
    if (criteria.tenantId) {
      filtered = filtered.filter((p) => p.tenantId === criteria.tenantId);
    }
    if (criteria.saleId) {
      filtered = filtered.filter((p) => p.saleId.value === criteria.saleId);
    }
    return {
      items: filtered.slice(
        (pagination.page - 1) * pagination.limit,
        pagination.page * pagination.limit,
      ),
      total: filtered.length,
    };
  }
}

class InMemorySaleRepo implements SaleRepositoryPort {
  public store = new Map<string, Sale>();

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.store.set(sale.id.value, sale);
  }
}

function createSaleEntity(id: string, clientId: string, tenantId = 'tenant_kinergy'): Sale {
  return Sale.create({
    id: SaleId.create(id),
    tenantId,
    clientId,
    currency: 'USD',
    source: SaleSource.create(SaleSourceType.FOOD, 'order-pos'),
  });
}

function createPaymentEntity(
  id: string,
  saleId: string,
  amountCents = 2500,
  tenantId = 'tenant_kinergy',
): Payment {
  return Payment.createCompleted({
    id: PaymentId.create(id),
    tenantId,
    saleId: SaleId.create(saleId),
    method: PaymentMethod.CASH,
    amount: Money.create(amountCents / 100, 'USD'),
    reference: `REF-${id}`,
  });
}

describe('Payment Read Operations Authorization Specification (payments:read / payments.read)', () => {
  let paymentRepo: InMemoryPaymentRepo;
  let saleRepo: InMemorySaleRepo;
  let getPaymentHandler: GetPaymentHandler;
  let getSalePaymentHistoryHandler: GetSalePaymentHistoryHandler;
  let getPaymentsBySaleIdHandler: GetPaymentsBySaleIdHandler;
  let listPaymentsHandler: ListPaymentsHandler;

  const tenantId = 'tenant_kinergy';
  const clientAId = 'usr_client_alice';
  const clientBId = 'usr_client_bob';
  const saleAId = 'sale_alice_01';
  const saleBId = 'sale_bob_02';
  const paymentAId = 'pay_alice_01';
  const paymentBId = 'pay_bob_02';

  beforeEach(() => {
    paymentRepo = new InMemoryPaymentRepo();
    saleRepo = new InMemorySaleRepo();

    getPaymentHandler = new GetPaymentHandler(paymentRepo, saleRepo);
    getSalePaymentHistoryHandler = new GetSalePaymentHistoryHandler(paymentRepo, saleRepo);
    getPaymentsBySaleIdHandler = new GetPaymentsBySaleIdHandler(paymentRepo, saleRepo);
    listPaymentsHandler = new ListPaymentsHandler(paymentRepo);

    // Seed Sales
    saleRepo.store.set(saleAId, createSaleEntity(saleAId, clientAId, tenantId));
    saleRepo.store.set(saleBId, createSaleEntity(saleBId, clientBId, tenantId));

    // Seed Payments
    paymentRepo.payments.push(createPaymentEntity(paymentAId, saleAId, 2500, tenantId));
    paymentRepo.payments.push(createPaymentEntity(paymentBId, saleBId, 4500, tenantId));
  });

  describe('1. checkPaymentAuthorization: Colon-Notation & Capability Hierarchy', () => {
    it('accepts colon-notation payments:read permission', () => {
      expect(() => {
        checkPaymentAuthorization(
          {
            roles: ['Receptionist'],
            permissions: ['payments:read'],
          },
          ['payments.read'],
        );
      }).not.toThrow();
    });

    it('accepts canonical dot-notation payments.read permission', () => {
      expect(() => {
        checkPaymentAuthorization(
          {
            roles: ['Receptionist'],
            permissions: ['payments.read'],
          },
          ['payments.read'],
        );
      }).not.toThrow();
    });

    it('accepts payments:manage implying payments.read', () => {
      expect(() => {
        checkPaymentAuthorization(
          {
            roles: ['Manager'],
            permissions: ['payments:manage'],
          },
          ['payments.read'],
        );
      }).not.toThrow();
    });

    it('accepts legacy billing:read implying payments.read', () => {
      expect(() => {
        checkPaymentAuthorization(
          {
            roles: ['Manager'],
            permissions: ['billing:read'],
          },
          ['payments.read'],
        );
      }).not.toThrow();
    });

    it('accepts legacy billing:manage implying payments.read', () => {
      expect(() => {
        checkPaymentAuthorization(
          {
            roles: ['Manager'],
            permissions: ['billing:manage'],
          },
          ['payments.read'],
        );
      }).not.toThrow();
    });

    it('accepts payments:* wildcard permission', () => {
      expect(() => {
        checkPaymentAuthorization(
          {
            roles: ['Manager'],
            permissions: ['payments.*'],
          },
          ['payments.read'],
        );
      }).not.toThrow();
    });

    it('rejects caller missing payments:read or payments.read permission', () => {
      expect(() => {
        checkPaymentAuthorization(
          {
            roles: ['Receptionist'],
            permissions: ['sales:read'], // missing payments read
          },
          ['payments.read'],
        );
      }).toThrow(PaymentUnauthorizedException);
    });

    it('rejects caller with empty permissions and roles', () => {
      expect(() => {
        checkPaymentAuthorization(
          {
            roles: [],
            permissions: [],
          },
          ['payments.read'],
        );
      }).toThrow(PaymentUnauthorizedException);
    });
  });

  describe('2. GetPayment & GetPaymentById: Permission & Sale Ownership Isolation', () => {
    it('allows authorized staff with payments:read to read payment', async () => {
      const result = await getPaymentHandler.execute(
        new GetPaymentQuery({
          paymentId: paymentAId,
          tenantId,
          currentUser: {
            id: 'staff_1',
            roles: ['Receptionist'],
            permissions: ['payments:read'],
          },
        }),
      );

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.id).toBe(paymentAId);
      expect(dto.amountValue).toBe(25.0);
      expect(dto.status).toBe(PaymentStatus.COMPLETED);
    });

    it('rejects caller lacking payments.read with PaymentUnauthorizedException', async () => {
      const result = await getPaymentHandler.execute(
        new GetPaymentQuery({
          paymentId: paymentAId,
          tenantId,
          currentUser: {
            id: 'staff_1',
            roles: ['Receptionist'],
            permissions: ['inventory.read'],
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
    });

    it('allows client to read their own payment when owning the parent sale', async () => {
      const result = await getPaymentHandler.execute(
        new GetPaymentQuery({
          paymentId: paymentAId,
          tenantId,
          currentUser: {
            id: clientAId,
            roles: ['Client'],
            permissions: ['payments:read'],
          },
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().id).toBe(paymentAId);
    });

    it('prevents client from reading another client payment, returning PaymentNotFoundException (404) without leaking data', async () => {
      // Alice tries to read Bob's payment
      const result = await getPaymentHandler.execute(
        new GetPaymentQuery({
          paymentId: paymentBId,
          tenantId,
          currentUser: {
            id: clientAId,
            roles: ['Client'],
            permissions: ['payments:read'],
          },
        }),
      );

      // Must fail with not found to prevent leaking resource existence across clients
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentNotFoundException);
    });

    it('rejects cross-tenant payment retrieval with PaymentUnauthorizedException', async () => {
      const result = await getPaymentHandler.execute(
        new GetPaymentQuery({
          paymentId: paymentAId,
          tenantId: 'other_tenant',
          currentUser: {
            id: 'staff_1',
            roles: ['Receptionist'],
            permissions: ['payments:read'],
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
    });
  });

  describe('3. GetSalePaymentHistory: Prevention of Sale Access Bypass', () => {
    it('allows authorized staff with payments:read to retrieve sale payment history', async () => {
      const result = await getSalePaymentHistoryHandler.execute(
        new GetSalePaymentHistoryQuery({
          saleId: saleAId,
          tenantId,
          currentUser: {
            id: 'staff_1',
            roles: ['Receptionist'],
            permissions: ['payments:read'],
          },
        }),
      );

      expect(result.isSuccess).toBe(true);
      const history = result.getValue();
      expect(history).toHaveLength(1);
      expect(history[0]!.id).toBe(paymentAId);
      expect(history[0]!.saleId).toBe(saleAId);
    });

    it('rejects caller lacking payments.read with PaymentUnauthorizedException', async () => {
      const result = await getSalePaymentHistoryHandler.execute(
        new GetSalePaymentHistoryQuery({
          saleId: saleAId,
          tenantId,
          currentUser: {
            id: 'staff_1',
            roles: ['Receptionist'],
            permissions: ['sales.read'], // lacks payments.read
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
    });

    it('allows client to view payment history for their own sale', async () => {
      const result = await getSalePaymentHistoryHandler.execute(
        new GetSalePaymentHistoryQuery({
          saleId: saleAId,
          tenantId,
          currentUser: {
            id: clientAId,
            roles: ['Client'],
            permissions: ['payments:read'],
          },
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toHaveLength(1);
      expect(result.getValue()[0]!.id).toBe(paymentAId);
    });

    it('strictly prevents GetSalePaymentHistory from bypassing Sale access restrictions: Client cannot view another client sale payments', async () => {
      // Alice tries to retrieve payment history of Bob's sale
      const result = await getSalePaymentHistoryHandler.execute(
        new GetSalePaymentHistoryQuery({
          saleId: saleBId,
          tenantId,
          currentUser: {
            id: clientAId,
            roles: ['Client'],
            permissions: ['payments:read'],
          },
        }),
      );

      // Must fail with SaleNotFoundException (yielding 404), completely concealing existence & financial records
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
    });

    it('enforces multi-tenant isolation on parent sale: cross-tenant access returns 404', async () => {
      const result = await getSalePaymentHistoryHandler.execute(
        new GetSalePaymentHistoryQuery({
          saleId: saleAId,
          tenantId: 'tenant_other',
          currentUser: {
            id: 'staff_1',
            roles: ['Receptionist'],
            permissions: ['payments:read'],
          },
        }),
      );

      expect(result.isFailure).toBe(true);
    });
  });

  describe('4. GetPaymentsBySaleId: Sale Ownership & Boundary Restrictions', () => {
    it('allows staff with payments:read to retrieve payments by sale ID', async () => {
      const result = await getPaymentsBySaleIdHandler.execute(
        new GetPaymentsBySaleIdQuery({
          saleId: saleAId,
          tenantId,
          currentUser: {
            id: 'staff_1',
            roles: ['Receptionist'],
            permissions: ['payments:read'],
          },
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toHaveLength(1);
    });

    it('denies client querying another client sale payments, respecting Sale boundary', async () => {
      const result = await getPaymentsBySaleIdHandler.execute(
        new GetPaymentsBySaleIdQuery({
          saleId: saleBId,
          tenantId,
          currentUser: {
            id: clientAId,
            roles: ['Client'],
            permissions: ['payments:read'],
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
    });
  });

  describe('5. ListPayments: Operational Ledger Scoping & Tenant Isolation', () => {
    it('allows staff with payments:read to list payments within tenant', async () => {
      const result = await listPaymentsHandler.execute(
        new ListPaymentsQuery({
          tenantId,
          currentUser: {
            id: 'staff_1',
            tenantId,
            roles: ['Receptionist'],
            permissions: ['payments:read'],
          },
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().items).toHaveLength(2);
      expect(result.getValue().total).toBe(2);
    });

    it('rejects caller lacking payments.read with PaymentUnauthorizedException', async () => {
      const result = await listPaymentsHandler.execute(
        new ListPaymentsQuery({
          tenantId,
          currentUser: {
            id: 'staff_1',
            tenantId,
            roles: ['Receptionist'],
            permissions: ['sales.read'],
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
    });

    it('rejects cross-tenant listing attempts via enforceTenantIsolation', async () => {
      const result = await listPaymentsHandler.execute(
        new ListPaymentsQuery({
          tenantId: 'tenant_target',
          currentUser: {
            id: 'staff_1',
            tenantId: 'tenant_caller',
            roles: ['Manager'],
            permissions: ['payments:read'],
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
    });
  });
});
