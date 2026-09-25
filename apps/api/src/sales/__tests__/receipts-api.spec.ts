import { Test, TestingModule } from '@nestjs/testing';
import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import {
  Receipt,
  ReceiptId,
  ReceiptNumber,
  Sale,
  SaleId,
  Money,
  SourceReference,
  SourceType,
  PaymentMethod,
  PaymentStatus,
  Payment,
  PaymentId,
  PaymentReference,
  ReceiptRepositoryPort,
  SaleRepositoryPort,
  PaymentRepositoryPort,
  IssueReceiptHandler,
  GetReceiptHandler,
  GetReceiptBySaleHandler,
  SaleNotFoundException,
  ReceiptNotFoundException,
  ReceiptUnauthorizedException,
  ReceiptIssuanceRejectedException,
  DuplicateReceiptException,
  ReceiptOptimisticLockException,
  ReceiptDomainException,
  InMemoryReceiptSequenceGenerator,
} from '@kinergy-platform/core';
import { ReceiptsController, RECEIPT_REPOSITORY_TOKEN } from '../controllers/receipts.controller';
import { SALE_REPOSITORY_TOKEN } from '../controllers/sales.controller';
import { PAYMENT_REPOSITORY_TOKEN } from '../controllers/payments.controller';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';
import { IssueReceiptRequestDto, IssueReceiptDirectRequestDto, ReceiptResponseDto } from '../dto';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';

// In-Memory Test Doubles
class InMemoryReceiptRepository implements ReceiptRepositoryPort {
  public store = new Map<string, Receipt>();
  private readonly sequenceGenerator = new InMemoryReceiptSequenceGenerator();

  async findById(id: ReceiptId | string): Promise<Receipt | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Receipt | null> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    for (const receipt of this.store.values()) {
      if (receipt.saleId.value === key) {
        return receipt;
      }
    }
    return null;
  }

  async findByReceiptNumber(receiptNumber: ReceiptNumber | string): Promise<Receipt | null> {
    const key = typeof receiptNumber === 'string' ? receiptNumber.trim() : receiptNumber.value;
    for (const receipt of this.store.values()) {
      if (receipt.receiptNumber.value === key) {
        return receipt;
      }
    }
    return null;
  }

  async save(receipt: Receipt): Promise<void> {
    this.store.set(receipt.id.value, receipt);
  }

  async getNextReceiptNumber(tenantId: string, year: number): Promise<ReceiptNumber> {
    return this.sequenceGenerator.getNextReceiptNumber(tenantId, year);
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

class InMemoryPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();

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
}

describe('Receipt HTTP API Architecture, Security & Exception Spec', () => {
  const primaryTenantId = 'tenant_wellness_center';
  const rivalTenantId = 'tenant_rival_gym';

  // Personas
  const ownerUser: AuthenticatedUserPayload = {
    id: 'user_owner_01',
    email: 'owner@kinergy.com',
    status: 'ACTIVE',
    roles: ['Owner'],
    permissions: ['*'],
    tenantId: primaryTenantId,
  };

  const receptionistUser: AuthenticatedUserPayload = {
    id: 'user_frontdesk_01',
    email: 'frontdesk@kinergy.com',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['receipts.manage', 'receipts.read', 'sales.read'],
    tenantId: primaryTenantId,
  };

  const clientUser: AuthenticatedUserPayload = {
    id: 'user_client_01',
    email: 'client@example.com',
    status: 'ACTIVE',
    roles: ['Client'],
    permissions: ['receipts.read'],
    tenantId: primaryTenantId,
  };

  const otherClientUser: AuthenticatedUserPayload = {
    id: 'user_client_02',
    email: 'other_client@example.com',
    status: 'ACTIVE',
    roles: ['Client'],
    permissions: ['receipts.read'],
    tenantId: primaryTenantId,
  };

  const kitchenStaffUser: AuthenticatedUserPayload = {
    id: 'user_kitchen_01',
    email: 'kitchen@kinergy.com',
    status: 'ACTIVE',
    roles: ['Kitchen Staff'],
    permissions: [
      'kitchen.read',
      'kitchen.orders.manage',
      'sales.read',
      'sales.create',
      'payments.create',
    ],
    tenantId: primaryTenantId,
  };

  const trainerUser: AuthenticatedUserPayload = {
    id: 'user_trainer_01',
    email: 'trainer@kinergy.com',
    status: 'ACTIVE',
    roles: ['Trainer'],
    permissions: ['clients.read', 'appointments.read', 'appointments.create'],
    tenantId: primaryTenantId,
  };

  const trainerWithReadUser: AuthenticatedUserPayload = {
    id: 'user_trainer_02',
    email: 'trainer_read@kinergy.com',
    status: 'ACTIVE',
    roles: ['Trainer'],
    permissions: ['receipts.read'],
    tenantId: primaryTenantId,
  };

  const unprivilegedUser: AuthenticatedUserPayload = {
    id: 'user_visitor_01',
    email: 'visitor@example.com',
    status: 'ACTIVE',
    roles: ['Visitor'],
    permissions: [],
    tenantId: primaryTenantId,
  };

  const rivalUser: AuthenticatedUserPayload = {
    id: 'user_rival_01',
    email: 'manager@rival.com',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['receipts.manage', 'receipts.read'],
    tenantId: rivalTenantId,
  };

  let controller: ReceiptsController;
  let receiptRepo: InMemoryReceiptRepository;
  let saleRepo: InMemorySaleRepository;
  let paymentRepo: InMemoryPaymentRepository;
  let exceptionFilter: SalesExceptionFilter;

  const createSettledSale = (
    tenant: string = primaryTenantId,
    totalAmount = 120.0,
    currency = 'USD',
    clientId?: string,
  ): { sale: Sale; payment: Payment } => {
    const sale = Sale.create({
      tenantId: tenant,
      clientId,
      currency,
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_gold_monthly',
      }),
    });

    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_gold_monthly',
      }),
      description: 'Gold Membership Monthly Access',
      quantity: 1,
      unitPrice: Money.create(totalAmount, currency),
    });

    sale.finalize();

    // Settle payment directly in COMPLETED state
    const payment = Payment.createCompleted({
      saleId: sale.id,
      tenantId: tenant,
      amount: Money.create(totalAmount, currency),
      method: PaymentMethod.CASH,
      reference: PaymentReference.create('REG-DRAWER-01'),
    });

    // Mark sale as PAID
    sale.markPaid();

    saleRepo.store.set(sale.id.value, sale);
    paymentRepo.store.set(payment.id.value, payment);

    return { sale, payment };
  };

  beforeEach(async () => {
    receiptRepo = new InMemoryReceiptRepository();
    saleRepo = new InMemorySaleRepository();
    paymentRepo = new InMemoryPaymentRepository();
    exceptionFilter = new SalesExceptionFilter();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReceiptsController],
      providers: [
        {
          provide: RECEIPT_REPOSITORY_TOKEN,
          useValue: receiptRepo,
        },
        {
          provide: SALE_REPOSITORY_TOKEN,
          useValue: saleRepo,
        },
        {
          provide: PAYMENT_REPOSITORY_TOKEN,
          useValue: paymentRepo,
        },
        {
          provide: IssueReceiptHandler,
          useFactory: () => new IssueReceiptHandler(receiptRepo, saleRepo, paymentRepo),
        },
        {
          provide: GetReceiptHandler,
          useFactory: () => new GetReceiptHandler(receiptRepo),
        },
        {
          provide: GetReceiptBySaleHandler,
          useFactory: () => new GetReceiptBySaleHandler(receiptRepo, saleRepo),
        },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReceiptsController>(ReceiptsController);
  });

  // 1. Successful Issuance
  describe('1. Successful Receipt Issuance (POST /api/v1/sales/:saleId/receipt & POST /api/v1/receipts)', () => {
    it('successfully issues a receipt voucher for an already-paid sale via POST /sales/:saleId/receipt', async () => {
      const { sale, payment } = createSettledSale(primaryTenantId, 120.0, 'USD');

      const response: ReceiptResponseDto = await controller.issueReceipt(
        sale.id.value,
        { saleReference: 'ORD-2026-TEST-01' },
        receptionistUser,
      );

      expect(response).toBeDefined();
      expect(response.id).toBeDefined();
      expect(response.receiptNumber).toMatch(/^REC-\d{4}-\d{6}$/);
      expect(response.saleId).toBe(sale.id.value);
      expect(response.saleReference).toBe('ORD-2026-TEST-01');
      expect(response.tenantId).toBe(primaryTenantId);
      expect(response.status).toBe('ISSUED');
      expect(response.reprintCount).toBe(0);
      expect(response.issuedAt).toBeDefined();

      // Monetary accuracy: derived from Sale totals, no floating point error
      expect(response.total).toEqual({
        amount: 120.0,
        currency: 'USD',
        formatted: '120.00',
        cents: 12000,
      });
      expect(response.subtotal).toEqual({
        amount: 120.0,
        currency: 'USD',
        formatted: '120.00',
        cents: 12000,
      });
      expect(response.discountTotal).toEqual({
        amount: 0.0,
        currency: 'USD',
        formatted: '0.00',
        cents: 0,
      });

      // Item snapshots
      expect(response.items).toHaveLength(1);
      expect(response.items[0]?.description).toBe('Gold Membership Monthly Access');
      expect(response.items[0]?.quantity).toBe(1);
      expect(response.items[0]?.total.cents).toBe(12000);

      // Payment snapshot
      expect(response.payments).toHaveLength(1);
      expect(response.payments[0]?.method).toBe(PaymentMethod.CASH);
      expect(response.payments[0]?.status).toBe(PaymentStatus.COMPLETED);
      expect(response.payments[0]?.amount.cents).toBe(12000);
      expect(response.payments[0]?.reference).toBe(payment.reference?.value ?? null);

      // Verify persisted in repository
      const persisted = await receiptRepo.findById(response.id);
      expect(persisted).not.toBeNull();
      expect(persisted?.receiptNumber.value).toBe(response.receiptNumber);
    });

    it('successfully issues a receipt voucher via POST /receipts with saleId in body', async () => {
      const { sale } = createSettledSale(primaryTenantId, 75.5, 'USD');

      const dto: IssueReceiptDirectRequestDto = {
        saleId: sale.id.value,
      };

      const response: ReceiptResponseDto = await controller.issueReceiptDirect(
        dto,
        receptionistUser,
      );

      expect(response.id).toBeDefined();
      expect(response.saleId).toBe(sale.id.value);
      expect(response.total.formatted).toBe('75.50');
      expect(response.total.cents).toBe(7550);
    });
  });

  // 2. Unauthorized Access & Permission Checks
  describe('2. Unauthorized Access & Permission Enforcement', () => {
    it('rejects unprivileged user lacking receipts.manage permission when attempting issuance', async () => {
      const { sale } = createSettledSale(primaryTenantId, 100.0, 'USD');

      await expect(controller.issueReceipt(sale.id.value, {}, unprivilegedUser)).rejects.toThrow(
        ReceiptUnauthorizedException,
      );
    });

    it('rejects user with only receipts.read from issuing a receipt', async () => {
      const { sale } = createSettledSale(primaryTenantId, 100.0, 'USD');

      await expect(controller.issueReceipt(sale.id.value, {}, clientUser)).rejects.toThrow(
        ReceiptUnauthorizedException,
      );
    });

    it('rejects unprivileged user lacking receipts.read when querying receipt by id', async () => {
      const { sale } = createSettledSale(primaryTenantId, 100.0, 'USD');
      const receipt = await controller.issueReceipt(sale.id.value, {}, receptionistUser);

      await expect(controller.getReceiptById(receipt.id, unprivilegedUser)).rejects.toThrow(
        ReceiptUnauthorizedException,
      );
    });

    it('rejects unprivileged user lacking receipts.read when querying receipt by sale', async () => {
      const { sale } = createSettledSale(primaryTenantId, 100.0, 'USD');
      await controller.issueReceipt(sale.id.value, {}, receptionistUser);

      await expect(controller.getReceiptBySale(sale.id.value, unprivilegedUser)).rejects.toThrow(
        ReceiptUnauthorizedException,
      );
    });
  });

  // 3. Forbidden Access (Multi-Tenant Isolation)
  describe('3. Forbidden Access & Multi-Tenant Isolation', () => {
    it('rejects cross-tenant user from issuing receipt for another tenant sale', async () => {
      const { sale } = createSettledSale(primaryTenantId, 100.0, 'USD');

      await expect(controller.issueReceipt(sale.id.value, {}, rivalUser)).rejects.toThrow(
        ReceiptUnauthorizedException,
      );
    });

    it('rejects cross-tenant user from reading receipt belonging to another tenant', async () => {
      const { sale } = createSettledSale(primaryTenantId, 100.0, 'USD');
      const receipt = await controller.issueReceipt(sale.id.value, {}, receptionistUser);

      await expect(controller.getReceiptById(receipt.id, rivalUser)).rejects.toThrow(
        ReceiptUnauthorizedException,
      );
    });
  });

  // 4. Invalid Sale State Invariants
  describe('4. Invalid Sale Invariants & Error Mapping', () => {
    it('throws SaleNotFoundException when target sale does not exist', async () => {
      const nonExistentSaleId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';

      await expect(
        controller.issueReceipt(nonExistentSaleId, {}, receptionistUser),
      ).rejects.toThrow(SaleNotFoundException);
    });

    it('rejects issuance when Sale is in DRAFT status', async () => {
      const draftSale = Sale.create({
        tenantId: primaryTenantId,
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_draft',
        }),
      });
      draftSale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_draft',
        }),
        description: 'Draft item',
        quantity: 1,
        unitPrice: Money.create(50.0, 'USD'),
      });
      saleRepo.store.set(draftSale.id.value, draftSale);

      await expect(
        controller.issueReceipt(draftSale.id.value, {}, receptionistUser),
      ).rejects.toThrow(ReceiptIssuanceRejectedException);
    });

    it('rejects issuance when Sale is CANCELLED', async () => {
      const sale = Sale.create({
        tenantId: primaryTenantId,
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_cancel',
        }),
      });
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_cancel',
        }),
        description: 'Cancelled item',
        quantity: 1,
        unitPrice: Money.create(50.0, 'USD'),
      });
      sale.finalize();
      sale.cancel('Customer declined transaction');
      saleRepo.store.set(sale.id.value, sale);

      await expect(controller.issueReceipt(sale.id.value, {}, receptionistUser)).rejects.toThrow(
        ReceiptIssuanceRejectedException,
      );
    });
  });

  // 5. Invalid Payment State Invariants
  describe('5. Invalid Payment State Invariants & Error Mapping', () => {
    it('rejects issuance when Sale has zero payment records', async () => {
      const sale = Sale.create({
        tenantId: primaryTenantId,
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_nopay',
        }),
      });
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_nopay',
        }),
        description: 'Unpaid Item',
        quantity: 1,
        unitPrice: Money.create(100.0, 'USD'),
      });
      sale.finalize();
      sale.markPaid(); // Artificial transition without payment records
      saleRepo.store.set(sale.id.value, sale);

      await expect(controller.issueReceipt(sale.id.value, {}, receptionistUser)).rejects.toThrow(
        ReceiptIssuanceRejectedException,
      );
    });

    it('rejects issuance when payments are not COMPLETED (e.g. PENDING or FAILED)', async () => {
      const sale = Sale.create({
        tenantId: primaryTenantId,
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_pending',
        }),
      });
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_pending',
        }),
        description: 'Pending Item',
        quantity: 1,
        unitPrice: Money.create(100.0, 'USD'),
      });
      sale.finalize();
      sale.markPaid();

      const pendingPayment = Payment.createPending({
        saleId: sale.id,
        tenantId: primaryTenantId,
        amount: Money.create(100.0, 'USD'),
        method: PaymentMethod.QR,
        reference: PaymentReference.create('QR-PENDING-01'),
      });

      saleRepo.store.set(sale.id.value, sale);
      paymentRepo.store.set(pendingPayment.id.value, pendingPayment);

      await expect(controller.issueReceipt(sale.id.value, {}, receptionistUser)).rejects.toThrow(
        ReceiptIssuanceRejectedException,
      );
    });

    it('rejects issuance when payments do not cover the sale total (underpaid)', async () => {
      const sale = Sale.create({
        tenantId: primaryTenantId,
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_underpay',
        }),
      });
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_underpay',
        }),
        description: 'Full Item',
        quantity: 1,
        unitPrice: Money.create(100.0, 'USD'),
      });
      sale.finalize();
      sale.markPaid();

      // Only paid $60 out of $100
      const partialPayment = Payment.createCompleted({
        saleId: sale.id,
        tenantId: primaryTenantId,
        amount: Money.create(60.0, 'USD'),
        method: PaymentMethod.CASH,
      });

      saleRepo.store.set(sale.id.value, sale);
      paymentRepo.store.set(partialPayment.id.value, partialPayment);

      await expect(controller.issueReceipt(sale.id.value, {}, receptionistUser)).rejects.toThrow(
        ReceiptIssuanceRejectedException,
      );
    });
  });

  // 6. Duplicate Issuance & Concurrency Idempotency
  describe('6. Duplicate Issuance & Idempotency', () => {
    it('returns the exact existing receipt when repeated issuance is attempted (idempotency)', async () => {
      const { sale } = createSettledSale(primaryTenantId, 120.0, 'USD');

      const firstReceipt = await controller.issueReceipt(sale.id.value, {}, receptionistUser);
      const secondReceipt = await controller.issueReceipt(sale.id.value, {}, receptionistUser);

      expect(firstReceipt.id).toBe(secondReceipt.id);
      expect(firstReceipt.receiptNumber).toBe(secondReceipt.receiptNumber);
      expect(firstReceipt.total.cents).toBe(secondReceipt.total.cents);
      expect(firstReceipt.issuedAt).toBe(secondReceipt.issuedAt);

      // Verify no duplicate record was created in repository
      const allReceipts = Array.from(receiptRepo.store.values());
      expect(allReceipts).toHaveLength(1);
    });
  });

  // 7. Validation Errors & Financial Immutability
  describe('7. Validation Errors & Financial Immutability Enforcement', () => {
    it('throws BadRequestException when calling POST /receipts without saleId', async () => {
      const dto: IssueReceiptDirectRequestDto = {
        saleId: '  ',
      };

      await expect(controller.issueReceiptDirect(dto, receptionistUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when calling GET /receipts/:receiptId with empty identifier', async () => {
      await expect(controller.getReceiptById('   ', receptionistUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('verifies IssueReceiptRequestDto enforces server-side financial derivation with no client financial parameters', () => {
      const dto = new IssueReceiptRequestDto();
      const dtoKeys = Object.keys(dto);
      // The request DTO must only allow receiptId or saleReference, never monetary fields
      expect(dtoKeys).not.toContain('total');
      expect(dtoKeys).not.toContain('subtotal');
      expect(dtoKeys).not.toContain('discount');
      expect(dtoKeys).not.toContain('paymentStatus');
      expect(dtoKeys).not.toContain('paymentMethod');
      expect(dtoKeys).not.toContain('issueDate');
    });
  });

  // 8. Retrieval Operations
  describe('8. Retrieval Operations (GET /sales/:saleId/receipt & GET /receipts/:receiptId)', () => {
    it('retrieves receipt voucher by sale ID via GET /sales/:saleId/receipt', async () => {
      const { sale } = createSettledSale(primaryTenantId, 85.0, 'USD', clientUser.id);
      const issued = await controller.issueReceipt(sale.id.value, {}, receptionistUser);

      const resolved = await controller.getReceiptBySale(sale.id.value, clientUser);

      expect(resolved.id).toBe(issued.id);
      expect(resolved.receiptNumber).toBe(issued.receiptNumber);
      expect(resolved.total.formatted).toBe('85.00');
    });

    it('retrieves receipt voucher by internal UUID via GET /receipts/:receiptId', async () => {
      const { sale } = createSettledSale(primaryTenantId, 85.0, 'USD', clientUser.id);
      const issued = await controller.issueReceipt(sale.id.value, {}, receptionistUser);

      const resolved = await controller.getReceiptById(issued.id, clientUser);

      expect(resolved.id).toBe(issued.id);
      expect(resolved.receiptNumber).toBe(issued.receiptNumber);
    });

    it('retrieves receipt voucher by human-readable receipt number (REC-YYYY-XXXXXX)', async () => {
      const { sale } = createSettledSale(primaryTenantId, 85.0, 'USD', clientUser.id);
      const issued = await controller.issueReceipt(sale.id.value, {}, receptionistUser);

      const resolved = await controller.getReceiptById(issued.receiptNumber, clientUser);

      expect(resolved.id).toBe(issued.id);
      expect(resolved.receiptNumber).toBe(issued.receiptNumber);
    });

    it('throws ReceiptNotFoundException when querying non-existent receipt identifier', async () => {
      await expect(controller.getReceiptById('REC-2026-999999', clientUser)).rejects.toThrow(
        ReceiptNotFoundException,
      );
    });

    it('throws ReceiptNotFoundException when sale exists but no receipt was issued yet', async () => {
      const { sale } = createSettledSale(primaryTenantId, 50.0, 'USD', clientUser.id);

      await expect(controller.getReceiptBySale(sale.id.value, clientUser)).rejects.toThrow(
        ReceiptNotFoundException,
      );
    });
  });

  // 9. Response Serialization & Floating-Point Prevention
  describe('9. Response Serialization & Financial Precision', () => {
    it('properly serializes decimal values with zero floating point recomputations in controller layer', async () => {
      // 3 items with specific fractional amounts (e.g. 0.10, 0.20, 0.30)
      const sale = Sale.create({
        tenantId: primaryTenantId,
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'inv_multi',
        }),
      });
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'inv_1',
        }),
        description: 'Item A',
        quantity: 1,
        unitPrice: Money.create(0.1, 'USD'),
      });
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'inv_2',
        }),
        description: 'Item B',
        quantity: 1,
        unitPrice: Money.create(0.2, 'USD'),
      });
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'inv_3',
        }),
        description: 'Item C',
        quantity: 1,
        unitPrice: Money.create(0.3, 'USD'),
      });
      sale.finalize();

      const payment = Payment.createCompleted({
        saleId: sale.id,
        tenantId: primaryTenantId,
        amount: Money.create(0.6, 'USD'),
        method: PaymentMethod.CASH,
      });

      sale.markPaid();
      saleRepo.store.set(sale.id.value, sale);
      paymentRepo.store.set(payment.id.value, payment);

      const response = await controller.issueReceipt(sale.id.value, {}, receptionistUser);

      // Verify MoneyResponseDto structure: integer cents eliminate float drift
      expect(response.total.cents).toBe(60);
      expect(response.total.formatted).toBe('0.60');
      expect(response.total.amount).toBe(0.6);

      // Verify item snapshots maintain exact precision
      expect(response.items[0]?.total.cents).toBe(10);
      expect(response.items[1]?.total.cents).toBe(20);
      expect(response.items[2]?.total.cents).toBe(30);

      // Verify total is exact sum of item totals in cents
      const sumCents = response.items.reduce((acc, item) => acc + item.total.cents, 0);
      expect(sumCents).toBe(response.total.cents);
    });
  });

  // 10. SalesExceptionFilter Mapping Spec
  describe('10. SalesExceptionFilter Domain to HTTP Mapping', () => {
    let mockResponse: {
      status: jest.Mock;
      json: jest.Mock;
    };
    let mockHost: ArgumentsHost;

    beforeEach(() => {
      mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse as unknown as Response,
          getRequest: () => ({ url: '/api/v1/receipts' }),
          getNext: () => jest.fn(),
        }),
        getArgs: () => [],
        getArgByIndex: () => undefined,
        switchToRpc: () => ({ getData: () => undefined, getContext: () => undefined }),
        switchToWs: () => ({ getData: () => undefined, getClient: () => undefined }),
        getType: () => 'http',
      } as unknown as ArgumentsHost;
    });

    it('translates ReceiptNotFoundException to 404 Not Found', () => {
      const ex = new ReceiptNotFoundException('REC-2026-000001');
      exceptionFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.NOT_FOUND,
          error: 'Not Found',
        }),
      );
    });

    it('translates ReceiptUnauthorizedException to 403 Forbidden', () => {
      const ex = new ReceiptUnauthorizedException('Cross-tenant receipt access denied.');
      exceptionFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.FORBIDDEN,
          error: 'Forbidden',
        }),
      );
    });

    it('translates DuplicateReceiptException to 409 Conflict', () => {
      const ex = new DuplicateReceiptException('sale_123', 'REC-2026-000001');
      exceptionFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
        }),
      );
    });

    it('translates ReceiptOptimisticLockException to 409 Conflict', () => {
      const ex = new ReceiptOptimisticLockException('rec_123', 1);
      exceptionFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
        }),
      );
    });

    it('translates ReceiptIssuanceRejectedException to 422 Unprocessable Entity', () => {
      const ex = new ReceiptIssuanceRejectedException('Sale is not paid.');
      exceptionFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'Unprocessable Entity',
        }),
      );
    });

    it('translates ReceiptDomainException to 400 Bad Request', () => {
      const ex = new ReceiptDomainException('Invalid receipt domain operation.');
      exceptionFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
        }),
      );
    });
  });

  // 11. Security Architecture, Object-Level Ownership & Role Separation Spec
  describe('11. Security Architecture, Object-Level Ownership & Role Separation Spec', () => {
    it('allows Owner with full privileges (*) to issue and retrieve any receipt', async () => {
      const { sale } = createSettledSale(primaryTenantId, 150.0, 'USD', 'user_any_client');

      const issued = await controller.issueReceipt(sale.id.value, {}, ownerUser);
      expect(issued.id).toBeDefined();

      const retrieved = await controller.getReceiptById(issued.id, ownerUser);
      expect(retrieved.id).toBe(issued.id);
    });

    it('allows Receptionist with receipts.manage and receipts.read to issue and retrieve any receipt', async () => {
      const { sale } = createSettledSale(primaryTenantId, 95.0, 'USD', 'user_any_client');

      const issued = await controller.issueReceipt(sale.id.value, {}, receptionistUser);
      expect(issued.id).toBeDefined();

      const retrieved = await controller.getReceiptById(issued.id, receptionistUser);
      expect(retrieved.id).toBe(issued.id);
    });

    it('allows Client to retrieve their own receipt document', async () => {
      const { sale } = createSettledSale(primaryTenantId, 110.0, 'USD', clientUser.id);
      const issued = await controller.issueReceipt(sale.id.value, {}, receptionistUser);

      const resolved = await controller.getReceiptById(issued.id, clientUser);
      expect(resolved.id).toBe(issued.id);
      expect(resolved.clientSnapshot?.clientId).toBe(clientUser.id);
    });

    it('strictly forbids Client from retrieving another client receipt (Object-Level Ownership Boundary)', async () => {
      // Sale belongs to clientUser (user_client_01)
      const { sale } = createSettledSale(primaryTenantId, 110.0, 'USD', clientUser.id);
      const issued = await controller.issueReceipt(sale.id.value, {}, receptionistUser);

      // otherClientUser (user_client_02) attempts to retrieve it
      await expect(controller.getReceiptById(issued.id, otherClientUser)).rejects.toThrow(
        ReceiptUnauthorizedException,
      );
      await expect(controller.getReceiptBySale(sale.id.value, otherClientUser)).rejects.toThrow(
        ReceiptUnauthorizedException,
      );
    });

    it('forbids Client from retrieving an anonymous walk-in receipt without client assignment', async () => {
      // Anonymous checkout without clientId
      const { sale } = createSettledSale(primaryTenantId, 25.0, 'USD', undefined);
      const issued = await controller.issueReceipt(sale.id.value, {}, receptionistUser);

      // clientUser attempts to retrieve anonymous receipt
      await expect(controller.getReceiptById(issued.id, clientUser)).rejects.toThrow(
        ReceiptUnauthorizedException,
      );
    });

    it('forbids Kitchen Staff lacking receipts.manage from issuing receipts', async () => {
      const { sale } = createSettledSale(primaryTenantId, 30.0, 'USD');

      await expect(controller.issueReceipt(sale.id.value, {}, kitchenStaffUser)).rejects.toThrow(
        ReceiptUnauthorizedException,
      );
    });

    it('forbids Kitchen Staff lacking receipts.read from retrieving receipts', async () => {
      const { sale } = createSettledSale(primaryTenantId, 30.0, 'USD');
      const issued = await controller.issueReceipt(sale.id.value, {}, receptionistUser);

      await expect(controller.getReceiptById(issued.id, kitchenStaffUser)).rejects.toThrow(
        ReceiptUnauthorizedException,
      );
    });

    it('forbids Trainer lacking receipts.read from retrieving receipts', async () => {
      const { sale } = createSettledSale(primaryTenantId, 80.0, 'USD', 'client_123');
      const issued = await controller.issueReceipt(sale.id.value, {}, receptionistUser);

      await expect(controller.getReceiptById(issued.id, trainerUser)).rejects.toThrow(
        ReceiptUnauthorizedException,
      );
    });

    it('forbids Trainer lacking receipts.manage from issuing receipts', async () => {
      const { sale } = createSettledSale(primaryTenantId, 80.0, 'USD');

      await expect(controller.issueReceipt(sale.id.value, {}, trainerUser)).rejects.toThrow(
        ReceiptUnauthorizedException,
      );
    });

    it('strictly forbids Trainer even with receipts.read from viewing general facility receipts', async () => {
      const { sale } = createSettledSale(primaryTenantId, 80.0, 'USD', 'client_other');
      const issued = await controller.issueReceipt(sale.id.value, {}, receptionistUser);

      await expect(controller.getReceiptById(issued.id, trainerWithReadUser)).rejects.toThrow(
        ReceiptUnauthorizedException,
      );
    });

    it('ensures API responses do not expose sensitive cardholder data, PAN, CVV, or internal secrets', async () => {
      const { sale } = createSettledSale(primaryTenantId, 120.0, 'USD', clientUser.id);
      const issued = await controller.issueReceipt(sale.id.value, {}, receptionistUser);

      // Verify no cardholder PAN or CVV or private keys are exposed anywhere in serialized payload
      const json = JSON.stringify(issued);
      expect(json).not.toContain('pan');
      expect(json).not.toContain('cvv');
      expect(json).not.toContain('cvc');
      expect(json).not.toContain('pin');
      expect(json).not.toContain('secret');
      expect(json).not.toContain('password');

      // Verify payment details only expose non-toxic reference
      expect(issued.payments[0]?.reference).toBe('REG-DRAWER-01');
      expect(issued.payments[0]?.method).toBe(PaymentMethod.CASH);
    });
  });
});
