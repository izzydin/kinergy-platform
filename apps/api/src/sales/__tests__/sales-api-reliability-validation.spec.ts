import { HttpStatus, BadRequestException, ArgumentsHost } from '@nestjs/common';
import { Response, Request } from 'express';
import {
  Sale,
  Payment,
  Receipt,
  ReceiptNumber,
  ReceiptId,
  SaleId,
  PaymentMethod,
  SaleStatus,
  SourceReference,
  SourceType,
  SaleSourceType,
  DiscountType,
  CreateSaleHandler,
  GetSaleByIdHandler,
  AddSaleItemHandler,
  RemoveSaleItemHandler,
  ApplyOrderDiscountHandler,
  RemoveOrderDiscountHandler,
  FinalizeSaleHandler,
  CancelSaleHandler,
  CoordinateSalePaymentHandler,
  AssignSaleSourceHandler,
  CalculateSaleHandler,
  ListSalesHandler,
  RecordPaymentHandler,
  GetPaymentByIdHandler,
  GetPaymentsBySaleIdHandler,
  GetSalePaymentHistoryHandler,
  CompletePaymentHandler,
  SettlePaymentHandler,
  FailPaymentHandler,
  CancelPaymentHandler,
  IssueReceiptHandler,
  GetReceiptHandler,
  GetReceiptBySaleHandler,
  InvalidMoneyException,
  InvalidDiscountException,
  InvalidSaleItemException,
  EmptySaleException,
  SaleAlreadyFinalizedException,
  SaleOptimisticLockException,
  PaymentOptimisticLockException,
  ReceiptOptimisticLockException,
  DuplicateReceiptException,
  DuplicateSaleException,
  DuplicatePaymentReferenceException,
  InvalidSaleTransitionException,
  SaleNotFoundException,
  PaymentNotFoundException,
  ReceiptNotFoundException,
  SaleNotPayableException,
  PaymentOverpaymentException,
  PaymentUnauthorizedException,
  ReceiptUnauthorizedException,
  SaleUnauthorizedException,
  PaymentCurrencyMismatchException,
  PaymentSaleMismatchException,
  ReceiptIssuanceRejectedException,
  InvalidPaymentTransitionException,
  InvalidPaymentMethodException,
  InvalidPaymentReferenceException,
  SaleRepositoryPort,
  PaymentRepositoryPort,
  ReceiptRepositoryPort,
  FindSalesCriteria,
  FindSalesPagination,
  FindSalesSort,
  SaleSummaryDTO,
} from '@kinergy-platform/core';
import { SalesController } from '../controllers/sales.controller';
import { PaymentsController } from '../controllers/payments.controller';
import { ReceiptsController } from '../controllers/receipts.controller';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';
import { GlobalSanitizationValidationPipe } from '../../common/pipes/global-sanitization-validation.pipe';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';
import {
  CreateSaleRequestDto,
  AddSaleItemRequestDto,
  ApplySaleDiscountRequestDto,
  CancelSaleRequestDto,
  CoordinateSalePaymentRequestDto,
  AssignSaleSourceRequestDto,
  RecordPaymentRequestDto,
  IssueReceiptRequestDto,
  IssueReceiptDirectRequestDto,
} from '../dto';

// --- In-Memory Repository Fakes ---

class InMemorySaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public saveCallCount = 0;

  async save(sale: Sale): Promise<void> {
    this.saveCallCount++;
    this.store.set(sale.id.value, sale);
  }

  async findById(id: string): Promise<Sale | null> {
    return this.store.get(id) ?? null;
  }

  async findByIdAndTenantId(id: string, tenantId?: string): Promise<Sale | null> {
    const sale = this.store.get(id);
    if (!sale) return null;
    if (tenantId && sale.tenantId && sale.tenantId !== tenantId) return null;
    return sale;
  }

  async findMany(
    criteria: FindSalesCriteria,
    pagination: FindSalesPagination,
    _sort: FindSalesSort,
  ): Promise<{ items: SaleSummaryDTO[]; total: number }> {
    let sales = Array.from(this.store.values());
    if (criteria.tenantId) {
      sales = sales.filter((s) => s.tenantId === criteria.tenantId);
    }
    if (criteria.clientId) {
      sales = sales.filter((s) => s.clientId === criteria.clientId);
    }
    if (criteria.status) {
      sales = sales.filter((s) => s.status === criteria.status);
    }
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const start = (page - 1) * limit;
    const toDto = (m: { amount: number; cents: number; currency: string }) => ({
      amount: m.amount,
      cents: m.cents,
      currency: m.currency,
      formatted: m.amount.toFixed(2),
    });
    const items: SaleSummaryDTO[] = sales.slice(start, start + limit).map((s) => ({
      id: s.id.value,
      tenantId: s.tenantId,
      clientId: s.clientId,
      currency: s.currency,
      status: s.status,
      subtotal: toDto(s.subtotal),
      discountTotal: toDto(s.discountTotal),
      total: toDto(s.total),
      subtotalAmount: s.subtotal.amount,
      discountTotalAmount: s.discountTotal.amount,
      totalAmount: s.total.amount,
      itemCount: s.items.length,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));
    return { items, total: sales.length };
  }
}

class InMemoryPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public saveCallCount = 0;

  async save(payment: Payment): Promise<void> {
    this.saveCallCount++;
    this.store.set(payment.id.value, payment);
  }

  async findById(id: string): Promise<Payment | null> {
    return this.store.get(id) ?? null;
  }

  async findBySaleId(saleId: string): Promise<Payment[]> {
    return Array.from(this.store.values()).filter((p) => p.saleId.value === saleId);
  }

  async findMany(): Promise<{ items: Payment[]; total: number }> {
    return { items: Array.from(this.store.values()), total: this.store.size };
  }
}

class InMemoryReceiptRepository implements ReceiptRepositoryPort {
  public store = new Map<string, Receipt>();
  public saveCallCount = 0;

  async save(receipt: Receipt): Promise<void> {
    this.saveCallCount++;
    this.store.set(receipt.id.value, receipt);
  }

  async findById(id: ReceiptId | string): Promise<Receipt | null> {
    const key = typeof id === 'string' ? id : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Receipt | null> {
    const key = typeof saleId === 'string' ? saleId : saleId.value;
    for (const r of this.store.values()) {
      if (r.saleId.value === key) {
        return r;
      }
    }
    return null;
  }

  async findByReceiptNumber(receiptNumber: ReceiptNumber | string): Promise<Receipt | null> {
    const key = typeof receiptNumber === 'string' ? receiptNumber : receiptNumber.value;
    for (const r of this.store.values()) {
      if (r.receiptNumber.value === key) {
        return r;
      }
    }
    return null;
  }

  async getNextReceiptNumber(_tenantId: string, year: number): Promise<ReceiptNumber> {
    return ReceiptNumber.create(`REC-${year}-000001`);
  }
}

describe('Milestone 7.14 — Comprehensive API Reliability & Error Mapping Specification', () => {
  let saleRepo: InMemorySaleRepository;
  let paymentRepo: InMemoryPaymentRepository;
  let receiptRepo: InMemoryReceiptRepository;

  let salesController: SalesController;
  let paymentsController: PaymentsController;
  let receiptsController: ReceiptsController;
  let validationPipe: GlobalSanitizationValidationPipe;
  let exceptionFilter: SalesExceptionFilter;

  const validTenantId = 'tenant_prod_1';
  const managerUser: AuthenticatedUserPayload = {
    id: 'user_mgr_1',
    email: 'manager@kinergy.test',
    status: 'ACTIVE',
    tenantId: validTenantId,
    roles: ['Manager'],
    permissions: [
      'sales.create',
      'sales.read',
      'sales.cancel',
      'payments.create',
      'payments.manage',
      'payments.read',
      'receipts.manage',
      'receipts.read',
    ],
  };

  beforeEach(() => {
    saleRepo = new InMemorySaleRepository();
    paymentRepo = new InMemoryPaymentRepository();
    receiptRepo = new InMemoryReceiptRepository();

    salesController = new SalesController(
      saleRepo,
      paymentRepo,
      new CreateSaleHandler(saleRepo),
      new GetSaleByIdHandler(saleRepo),
      new AddSaleItemHandler(saleRepo),
      new RemoveSaleItemHandler(saleRepo),
      new ApplyOrderDiscountHandler(saleRepo),
      new RemoveOrderDiscountHandler(saleRepo),
      new FinalizeSaleHandler(saleRepo),
      new CancelSaleHandler(saleRepo),
      new CoordinateSalePaymentHandler(saleRepo, paymentRepo),
      new AssignSaleSourceHandler(saleRepo),
      new CalculateSaleHandler(saleRepo),
      new ListSalesHandler(saleRepo),
    );

    paymentsController = new PaymentsController(
      paymentRepo,
      saleRepo,
      new RecordPaymentHandler(paymentRepo, saleRepo),
      new GetPaymentByIdHandler(paymentRepo, saleRepo),
      new GetPaymentsBySaleIdHandler(paymentRepo, saleRepo),
      new GetSalePaymentHistoryHandler(paymentRepo, saleRepo),
      new CompletePaymentHandler(paymentRepo, saleRepo),
      new SettlePaymentHandler(paymentRepo, saleRepo),
      new FailPaymentHandler(paymentRepo, saleRepo),
      new CancelPaymentHandler(paymentRepo, saleRepo),
    );

    receiptsController = new ReceiptsController(
      receiptRepo,
      saleRepo,
      paymentRepo,
      new IssueReceiptHandler(receiptRepo, saleRepo, paymentRepo),
      new GetReceiptHandler(receiptRepo),
      new GetReceiptBySaleHandler(receiptRepo, saleRepo),
    );

    validationPipe = new GlobalSanitizationValidationPipe();
    exceptionFilter = new SalesExceptionFilter();
  });

  // =========================================================================
  // 1. PATH PARAMETER VALIDATION (REJECT EMPTY, WHITESPACE, MALFORMED)
  // =========================================================================
  describe('1. Path Parameter Validation Across Every Sales Endpoint', () => {
    it('rejects empty or whitespace id on GET /sales/:id', async () => {
      await expect(salesController.getSale('', managerUser)).rejects.toThrow(BadRequestException);
      await expect(salesController.getSale('   ', managerUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty or whitespace id on GET /sales/:id/calculate', async () => {
      await expect(salesController.calculateSale('', managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(salesController.calculateSale('   ', managerUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty or whitespace id on POST /sales/:id/source', async () => {
      const dto: AssignSaleSourceRequestDto = {
        sourceReference: {
          type: SaleSourceType.FOOD,
          referenceId: 'food_123',
        },
      };
      await expect(salesController.assignSource('', dto, managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(salesController.assignSource('   ', dto, managerUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty or whitespace id on POST /sales/:id/items', async () => {
      const dto: AddSaleItemRequestDto = {
        description: 'Protein Shake',
        quantity: 1,
        unitPriceAmount: 5.5,
      };
      await expect(salesController.addItem('', dto, managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(salesController.addItem('   ', dto, managerUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty or whitespace id and itemId on DELETE /sales/:id/items/:itemId', async () => {
      await expect(salesController.removeItem('', 'item_1', managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(salesController.removeItem('sale_1', '', managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(salesController.removeItem('sale_1', '   ', managerUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty or whitespace id on POST /sales/:id/discount', async () => {
      const dto: ApplySaleDiscountRequestDto = {
        type: DiscountType.PERCENTAGE,
        value: 10,
      };
      await expect(salesController.applyDiscount('', dto, managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(salesController.applyDiscount('   ', dto, managerUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty or whitespace id on DELETE /sales/:id/discount', async () => {
      await expect(salesController.removeDiscount('', managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(salesController.removeDiscount('   ', managerUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty or whitespace id on POST /sales/:id/finalize', async () => {
      await expect(salesController.finalizeSale('', {}, managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(salesController.finalizeSale('   ', {}, managerUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty or whitespace id on POST /sales/:id/cancel', async () => {
      const dto: CancelSaleRequestDto = { reason: 'Customer changed mind' };
      await expect(salesController.cancelSale('', dto, managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(salesController.cancelSale('   ', dto, managerUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty or whitespace id on POST /sales/:id/coordinate-payment', async () => {
      const dto: CoordinateSalePaymentRequestDto = { paymentId: 'pay_123' };
      await expect(salesController.coordinatePayment('', dto, managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(salesController.coordinatePayment('   ', dto, managerUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty or whitespace saleId on POST /sales/:saleId/payments', async () => {
      const dto: RecordPaymentRequestDto = {
        method: PaymentMethod.CASH,
        amount: 50.0,
      };
      await expect(paymentsController.recordPayment('', dto, managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(paymentsController.recordPayment('   ', dto, managerUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty or whitespace saleId on GET /sales/:saleId/payments', async () => {
      await expect(paymentsController.getPaymentsBySaleId('', managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(paymentsController.getPaymentsBySaleId('   ', managerUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty or whitespace paymentId on GET /payments/:paymentId', async () => {
      await expect(paymentsController.getPaymentById('', managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(paymentsController.getPaymentById('   ', managerUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty or whitespace saleId on GET /sales/:saleId/payments/history', async () => {
      await expect(paymentsController.getSalePaymentHistory('', managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(paymentsController.getSalePaymentHistory('   ', managerUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty or whitespace id on POST /payments/:id/complete, settle, fail, cancel', async () => {
      await expect(paymentsController.completePayment('', {}, managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(paymentsController.settlePayment('   ', {}, managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(paymentsController.failPayment('', {}, managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(paymentsController.cancelPayment('   ', {}, managerUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty or whitespace saleId on POST /sales/:saleId/receipt and GET /sales/:saleId/receipt', async () => {
      await expect(receiptsController.issueReceipt('', {}, managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(receiptsController.issueReceipt('   ', {}, managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(receiptsController.getReceiptBySale('', managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(receiptsController.getReceiptBySale('   ', managerUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty or whitespace receiptId on GET /receipts/:receiptId', async () => {
      await expect(receiptsController.getReceiptById('', managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(receiptsController.getReceiptById('   ', managerUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // =========================================================================
  // 2. QUERY PARAMETERS & DATE RANGE VALIDATION
  // =========================================================================
  describe('2. Query Parameters & Date Range Validation (GET /sales)', () => {
    it('rejects non-integer or zero/negative page number', async () => {
      await expect(
        salesController.listSales(
          { page: 0 },
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          managerUser,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        salesController.listSales(
          { page: -5 },
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          managerUser,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        salesController.listSales(
          { page: 1.5 as unknown as number },
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          managerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects limit exceeding maximum cap (100) or non-positive limit', async () => {
      await expect(
        salesController.listSales(
          { limit: 101 },
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          managerUser,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        salesController.listSales(
          { limit: 0 },
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          managerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects empty cursor query parameter', async () => {
      await expect(
        salesController.listSales(
          { cursor: '   ' },
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          managerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid date range where fromDate is after toDate', async () => {
      await expect(
        salesController.listSales(
          {
            fromDate: '2026-10-15T00:00:00.000Z',
            toDate: '2026-10-10T00:00:00.000Z',
          },
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          managerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-whitelisted sort fields', async () => {
      await expect(
        salesController.listSales(
          { sortField: 'internalSecretField' },
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          managerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unsupported sort direction', async () => {
      await expect(
        salesController.listSales(
          { sortField: 'createdAt', sortDirection: 'diagonal' },
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          managerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unsupported sale status in filter', async () => {
      await expect(
        salesController.listSales(
          { status: 'UNSUPPORTED_STATUS' },
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          managerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // 3. DTO VALIDATION & UNEXPECTED FIELD INJECTION (GlobalSanitizationValidationPipe)
  // =========================================================================
  describe('3. DTO Validation & Rejection of Unexpected Injected Fields', () => {
    it('rejects unexpected fields injected into CreateSaleRequestDto', async () => {
      const payload = {
        currency: 'USD',
        injectedStatus: 'PAID',
        maliciousSubtotal: 0,
      };
      await expect(
        validationPipe.transform(payload, { type: 'body', metatype: CreateSaleRequestDto }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects malformed currency codes in CreateSaleRequestDto', async () => {
      const payload = { currency: 'US' }; // Not 3 letters
      await expect(
        validationPipe.transform(payload, { type: 'body', metatype: CreateSaleRequestDto }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects negative unit price and extra decimals in AddSaleItemRequestDto', async () => {
      const negativePayload = {
        description: 'Water',
        quantity: 1,
        unitPriceAmount: -10,
      };
      await expect(
        validationPipe.transform(negativePayload, {
          type: 'body',
          metatype: AddSaleItemRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);

      const excessiveDecimalsPayload = {
        description: 'Water',
        quantity: 1,
        unitPriceAmount: 10.999, // Exceeds 2 decimals
      };
      await expect(
        validationPipe.transform(excessiveDecimalsPayload, {
          type: 'body',
          metatype: AddSaleItemRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unsupported discount type in ApplySaleDiscountRequestDto', async () => {
      const payload = {
        type: 'SUPER_DISCOUNT',
        value: 10,
      };
      await expect(
        validationPipe.transform(payload, { type: 'body', metatype: ApplySaleDiscountRequestDto }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects negative discount value or excessive decimal places', async () => {
      const payload = {
        type: DiscountType.PERCENTAGE,
        value: -5,
      };
      await expect(
        validationPipe.transform(payload, { type: 'body', metatype: ApplySaleDiscountRequestDto }),
      ).rejects.toThrow(BadRequestException);

      const excessiveDecimals = {
        type: DiscountType.FIXED,
        value: 5.123,
      };
      await expect(
        validationPipe.transform(excessiveDecimals, {
          type: 'body',
          metatype: ApplySaleDiscountRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects empty or whitespace reason in CancelSaleRequestDto', async () => {
      const emptyReason = { reason: '' };
      await expect(
        validationPipe.transform(emptyReason, { type: 'body', metatype: CancelSaleRequestDto }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects negative payment amount or zero amount in RecordPaymentRequestDto', async () => {
      const zeroAmount = {
        method: PaymentMethod.CASH,
        amount: 0,
      };
      await expect(
        validationPipe.transform(zeroAmount, { type: 'body', metatype: RecordPaymentRequestDto }),
      ).rejects.toThrow(BadRequestException);

      const negativeAmount = {
        method: PaymentMethod.CASH,
        amount: -25.5,
      };
      await expect(
        validationPipe.transform(negativeAmount, {
          type: 'body',
          metatype: RecordPaymentRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unexpected injected status/paidAt fields in RecordPaymentRequestDto', async () => {
      const payload = {
        method: PaymentMethod.CASH,
        amount: 50.0,
        status: 'COMPLETED',
        paidAt: new Date().toISOString(),
      };
      await expect(
        validationPipe.transform(payload, { type: 'body', metatype: RecordPaymentRequestDto }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects missing saleId in IssueReceiptDirectRequestDto', async () => {
      const missingSaleId = {};
      await expect(
        validationPipe.transform(missingSaleId, {
          type: 'body',
          metatype: IssueReceiptDirectRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unexpected financial total overrides in IssueReceiptRequestDto', async () => {
      const payload = {
        total: 100,
        subtotal: 100,
      };
      await expect(
        validationPipe.transform(payload, { type: 'body', metatype: IssueReceiptRequestDto }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // 4. PERSISTENCE IMMUTABILITY ON INVALID REQUESTS
  // =========================================================================
  describe('4. Persistence Immutability on Invalid Requests', () => {
    it('does not mutate repository state when an invalid item is added', async () => {
      const sale = Sale.create({
        tenantId: validTenantId,
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'inv_1',
        }),
      });
      await saleRepo.save(sale);
      const initialSaveCount = saleRepo.saveCallCount;

      const invalidItemDto: AddSaleItemRequestDto = {
        description: 'Test',
        quantity: -1, // Invalid
        unitPriceAmount: 10,
      };

      await expect(
        salesController.addItem(sale.id.value, invalidItemDto, managerUser),
      ).rejects.toThrow();
      expect(saleRepo.saveCallCount).toBe(initialSaveCount);
    });

    it('does not mutate repository state when duplicate or invalid payment occurs', async () => {
      const sale = Sale.create({
        tenantId: validTenantId,
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'inv_1',
        }),
      });
      await saleRepo.save(sale);
      const initialSaveCount = paymentRepo.saveCallCount;

      const invalidPaymentDto: RecordPaymentRequestDto = {
        method: PaymentMethod.CASH,
        amount: 50,
        currency: 'EUR', // Currency mismatch with USD sale
      };

      await expect(
        paymentsController.recordPayment(sale.id.value, invalidPaymentDto, managerUser),
      ).rejects.toThrow();
      expect(paymentRepo.saveCallCount).toBe(initialSaveCount);
    });
  });

  // =========================================================================
  // 5. DOMAIN ERROR MAPPING & HTTP STATUS INTEGRITY (SalesExceptionFilter)
  // =========================================================================
  describe('5. Domain Error Mapping & HTTP Status Contract (SalesExceptionFilter)', () => {
    let mockResponse: {
      status: jest.Mock;
      json: jest.Mock;
      setHeader: jest.Mock;
    };
    let mockRequest: {
      url: string;
      method: string;
      headers: Record<string, string>;
    };
    let mockHost: ArgumentsHost;

    beforeEach(() => {
      mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn().mockReturnThis(),
      };
      mockRequest = {
        url: '/api/v1/sales/sale_123',
        method: 'POST',
        headers: {
          'x-correlation-id': 'corr_reliability_789',
        },
      };
      mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse as unknown as Response,
          getRequest: () => mockRequest as unknown as Request,
          getNext: () => jest.fn(),
        }),
      } as unknown as ArgumentsHost;
    });

    it('maps validation invariants to HTTP 400 Bad Request', () => {
      const domainErrors = [
        new InvalidMoneyException('Invalid minor units'),
        new InvalidDiscountException('Discount exceeds 100%'),
        new InvalidSaleItemException('Unit price cannot be negative'),
        new PaymentCurrencyMismatchException('EUR', 'USD'),
        new PaymentSaleMismatchException('pay_1', 'sale_1', 'sale_2'),
        new InvalidPaymentMethodException('UNSUPPORTED_METHOD'),
        new InvalidPaymentReferenceException('Invalid characters in reference'),
      ];

      for (const err of domainErrors) {
        exceptionFilter.catch(err, mockHost);
        expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
        expect(mockResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: HttpStatus.BAD_REQUEST,
            error: 'Bad Request',
          }),
        );
      }
    });

    it('maps entity not found domain exceptions to HTTP 404 Not Found', () => {
      const notFoundErrors = [
        new SaleNotFoundException('sale_not_exist'),
        new PaymentNotFoundException('pay_not_exist'),
        new ReceiptNotFoundException('rec_not_exist'),
      ];

      for (const err of notFoundErrors) {
        exceptionFilter.catch(err, mockHost);
        expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
        expect(mockResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: HttpStatus.NOT_FOUND,
            error: 'Not Found',
          }),
        );
      }
    });

    it('maps cross-tenant and unprivileged domain violations to HTTP 403 Forbidden', () => {
      const forbiddenErrors = [
        new SaleUnauthorizedException('Cross-tenant sale access denied'),
        new PaymentUnauthorizedException('Tenant mismatch for payment'),
        new ReceiptUnauthorizedException('Unauthorized to read receipt'),
      ];

      for (const err of forbiddenErrors) {
        exceptionFilter.catch(err, mockHost);
        expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
        expect(mockResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: HttpStatus.FORBIDDEN,
            error: 'Forbidden',
          }),
        );
      }
    });

    it('maps concurrency collisions and duplicates to HTTP 409 Conflict', () => {
      const conflictErrors = [
        new SaleOptimisticLockException('Sale', 'sale_1', 1),
        new PaymentOptimisticLockException('pay_1', 1),
        new ReceiptOptimisticLockException('rec_1', 1),
        new DuplicateSaleException('sale_1'),
        new DuplicateReceiptException('sale_1', validTenantId),
        new DuplicatePaymentReferenceException('ref_123', 'sale_1'),
        new SaleAlreadyFinalizedException('sale_1'),
      ];

      for (const err of conflictErrors) {
        exceptionFilter.catch(err, mockHost);
        expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
        expect(mockResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: HttpStatus.CONFLICT,
            error: 'Conflict',
          }),
        );
      }
    });

    it('maps lifecycle invariant violations to HTTP 422 Unprocessable Entity', () => {
      const unprocessableErrors = [
        new EmptySaleException('Cannot finalize sale with zero line items'),
        new InvalidSaleTransitionException(
          SaleStatus.DRAFT,
          SaleStatus.PAID,
          'Cannot jump draft to paid',
        ),
        new InvalidPaymentTransitionException('COMPLETED', 'SETTLED', 'Payment already completed'),
        new SaleNotPayableException('sale_1', SaleStatus.CANCELLED),
        new PaymentOverpaymentException('150.00', '100.00', 'USD'),
        new ReceiptIssuanceRejectedException('Sale not in terminal settled state'),
      ];

      for (const err of unprocessableErrors) {
        exceptionFilter.catch(err, mockHost);
        expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
        expect(mockResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            error: 'Unprocessable Entity',
          }),
        );
      }
    });

    it('masks unexpected infrastructure and database errors with HTTP 500 without disclosing SQL or internals', () => {
      const internalDatabaseError = new Error(
        'ERROR: relation "kinergy_sales_records" does not exist at character 42\nSELECT * FROM "kinergy_sales_records" WHERE id = $1\nconnection to postgresql://postgres:secret_pass@127.0.0.1:5432 failed',
      );

      exceptionFilter.catch(internalDatabaseError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: 'An unexpected internal server error occurred.',
      });

      // Confirm correlation ID header is preserved on 500 responses
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'x-correlation-id',
        'corr_reliability_789',
      );
    });
  });
});
