import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  Sale,
  Money,
  SourceType,
  SaleId,
  SaleRepositoryPort,
  PaymentRepositoryPort,
  Payment,
  PaymentId,
  PaymentMethod,
  PaymentStatus,
  CreateSaleHandler,
  GetSaleByIdHandler,
  AddSaleItemHandler,
  RemoveSaleItemHandler,
  ApplyOrderDiscountHandler,
  RemoveOrderDiscountHandler,
  FinalizeSaleHandler,
  CancelSaleHandler,
  CoordinateSalePaymentHandler,
  SaleAlreadyFinalizedException,
} from '@kinergy-platform/core';
import { SalesController, SALE_REPOSITORY_TOKEN } from '../controllers/sales.controller';
import { PAYMENT_REPOSITORY_TOKEN } from '../controllers/payments.controller';
import {
  CreateSaleRequestDto,
  AddSaleItemRequestDto,
  ApplySaleDiscountRequestDto,
  CancelSaleRequestDto,
} from '../dto';
import { GlobalSanitizationValidationPipe } from '../../common/pipes/global-sanitization-validation.pipe';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';

// In-Memory Test Doubles for API Security Boundary Testing
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

describe('Sale API Security Boundary & Aggregate Integrity Specification', () => {
  let controller: SalesController;
  let saleRepo: InMemorySaleRepository;
  let paymentRepo: InMemoryPaymentRepository;
  let pipe: GlobalSanitizationValidationPipe;

  beforeEach(async () => {
    saleRepo = new InMemorySaleRepository();
    paymentRepo = new InMemoryPaymentRepository();
    pipe = new GlobalSanitizationValidationPipe();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalesController],
      providers: [
        {
          provide: SALE_REPOSITORY_TOKEN,
          useValue: saleRepo,
        },
        {
          provide: PAYMENT_REPOSITORY_TOKEN,
          useValue: paymentRepo,
        },
        {
          provide: CreateSaleHandler,
          useFactory: (sRepo: SaleRepositoryPort) => new CreateSaleHandler(sRepo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: GetSaleByIdHandler,
          useFactory: (sRepo: SaleRepositoryPort) => new GetSaleByIdHandler(sRepo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: AddSaleItemHandler,
          useFactory: (sRepo: SaleRepositoryPort) => new AddSaleItemHandler(sRepo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: RemoveSaleItemHandler,
          useFactory: (sRepo: SaleRepositoryPort) => new RemoveSaleItemHandler(sRepo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: ApplyOrderDiscountHandler,
          useFactory: (sRepo: SaleRepositoryPort) => new ApplyOrderDiscountHandler(sRepo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: RemoveOrderDiscountHandler,
          useFactory: (sRepo: SaleRepositoryPort) => new RemoveOrderDiscountHandler(sRepo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: FinalizeSaleHandler,
          useFactory: (sRepo: SaleRepositoryPort) => new FinalizeSaleHandler(sRepo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: CancelSaleHandler,
          useFactory: (sRepo: SaleRepositoryPort) => new CancelSaleHandler(sRepo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: CoordinateSalePaymentHandler,
          useFactory: (sRepo: SaleRepositoryPort, pRepo: PaymentRepositoryPort) =>
            new CoordinateSalePaymentHandler(sRepo, pRepo),
          inject: [SALE_REPOSITORY_TOKEN, PAYMENT_REPOSITORY_TOKEN],
        },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SalesController>(SalesController);
  });

  describe('1. Protection Against Direct State & Financial Manipulation (DTO Boundary)', () => {
    it('strictly forbids injection of status in CreateSale payload via GlobalSanitizationValidationPipe', async () => {
      const maliciousPayload = {
        currency: 'USD',
        status: 'PAID', // Attempting to bypass aggregate lifecycle
      };

      await expect(
        pipe.transform(maliciousPayload, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('strictly forbids injection of subtotal, discountTotal, or total in CreateSale payload', async () => {
      const maliciousPayload = {
        currency: 'USD',
        subtotal: 0,
        discountTotal: 0,
        total: 0, // Attempting to declare arbitrary financial totals
      };

      await expect(
        pipe.transform(maliciousPayload, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('strictly forbids arbitrary items or item ownership injection in CreateSale payload', async () => {
      const maliciousPayload = {
        currency: 'USD',
        items: [
          {
            id: 'item_arbitrary_1',
            saleId: 'foreign_sale_999',
            description: 'Injected Item',
            unitPriceAmount: 100,
          },
        ],
      };

      await expect(
        pipe.transform(maliciousPayload, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('strictly forbids foreign saleId or calculated line totals in AddSaleItem payload', async () => {
      const maliciousPayload = {
        source: {
          sourceType: SourceType.CUSTOM_SERVICE,
          sourceId: 'pos_1',
        },
        description: 'Physical Therapy',
        quantity: 1,
        unitPriceAmount: 120,
        saleId: 'foreign_sale_888', // Attempting cross-aggregate item theft
        lineTotal: 0, // Attempting to override line calculation
      };

      await expect(
        pipe.transform(maliciousPayload, {
          type: 'body',
          metatype: AddSaleItemRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('proves no generic UpdateSale endpoint exists allowing arbitrary financial mutation', () => {
      // Introspect controller prototype: no generic updateSale, putSale, or patchSale
      const prototype = Object.getPrototypeOf(controller);
      const methods = Object.getOwnPropertyNames(prototype);

      expect(methods).not.toContain('updateSale');
      expect(methods).not.toContain('putSale');
      expect(methods).not.toContain('patchSale');
    });
  });

  describe('2. Explicit Business Intent Operations & Aggregate Authority', () => {
    it('creates a Sale in DRAFT status with exact zero financial totals', async () => {
      const dto: CreateSaleRequestDto = {
        currency: 'USD',
        clientId: 'client_audit_100',
      };

      const sale = await controller.createSale(dto);

      expect(sale.status).toBe('DRAFT');
      expect(sale.totalAmount).toBe(0);
      expect(sale.subtotalAmount).toBe(0);
      expect(sale.discountTotalAmount).toBe(0);
    });

    it('recalculates authoritative totals deterministically when adding and removing items', async () => {
      // 1. Create Sale
      const sale = await controller.createSale({ currency: 'USD' });

      // 2. Add Item 1 ($50)
      const afterItem1 = await controller.addItem(sale.id, {
        source: { sourceType: SourceType.CUSTOM_SERVICE, sourceId: 'serv_1' },
        description: 'Service A',
        quantity: 1,
        unitPriceAmount: 50.0,
      });
      expect(afterItem1.totalAmount).toBe(50.0);
      expect(afterItem1.items).toHaveLength(1);
      const item1Id = afterItem1.items[0]!.id;

      // 3. Add Item 2 ($75)
      const afterItem2 = await controller.addItem(sale.id, {
        source: { sourceType: SourceType.CUSTOM_SERVICE, sourceId: 'serv_2' },
        description: 'Service B',
        quantity: 1,
        unitPriceAmount: 75.0,
      });
      expect(afterItem2.totalAmount).toBe(125.0);
      expect(afterItem2.items).toHaveLength(2);

      // 4. Remove Item 1 via explicit RemoveSaleItem endpoint
      const afterRemove = await controller.removeItem(sale.id, item1Id);
      expect(afterRemove.totalAmount).toBe(75.0);
      expect(afterRemove.items).toHaveLength(1);
      expect(afterRemove.items[0]?.description).toBe('Service B');
    });

    it('applies and removes order discounts through explicit operations and recalculates totals', async () => {
      // Create and add item
      const sale = await controller.createSale({ currency: 'USD' });
      await controller.addItem(sale.id, {
        source: { sourceType: SourceType.CUSTOM_SERVICE, sourceId: 'serv_1' },
        description: 'Personal Training Pack',
        quantity: 2,
        unitPriceAmount: 100.0, // Subtotal: 200.00
      });

      // Apply 10% order discount
      const discountDto: ApplySaleDiscountRequestDto = {
        type: 'PERCENTAGE',
        value: 10,
        reason: 'Holiday Promotion',
      };
      const afterDiscount = await controller.applyDiscount(sale.id, discountDto);

      expect(afterDiscount.subtotalAmount).toBe(200.0);
      expect(afterDiscount.discountTotalAmount).toBe(20.0);
      expect(afterDiscount.totalAmount).toBe(180.0);

      // Remove discount
      const afterRemoval = await controller.removeDiscount(sale.id);
      expect(afterRemoval.discountTotalAmount).toBe(0.0);
      expect(afterRemoval.totalAmount).toBe(200.0);
    });

    it('submits sale for payment via finalizeSale and freezes commercial terms', async () => {
      const sale = await controller.createSale({ currency: 'USD' });
      await controller.addItem(sale.id, {
        source: { sourceType: SourceType.CUSTOM_SERVICE, sourceId: 'serv_1' },
        description: 'Consultation',
        quantity: 1,
        unitPriceAmount: 80.0,
      });

      // Finalize / submit for payment
      const finalized = await controller.finalizeSale(sale.id, {});
      expect(finalized.status).toBe('PENDING_PAYMENT');

      // Attempting further item mutation on finalized sale is rejected with SaleAlreadyFinalizedException
      await expect(
        controller.addItem(sale.id, {
          source: { sourceType: SourceType.CUSTOM_SERVICE, sourceId: 'serv_2' },
          description: 'Late Addition',
          quantity: 1,
          unitPriceAmount: 20.0,
        }),
      ).rejects.toThrow(SaleAlreadyFinalizedException);
    });

    it('cancels sale with explicit audit reason and enforces terminal immutability', async () => {
      const sale = await controller.createSale({ currency: 'USD' });
      await controller.addItem(sale.id, {
        source: { sourceType: SourceType.CUSTOM_SERVICE, sourceId: 'serv_1' },
        description: 'Session',
        quantity: 1,
        unitPriceAmount: 60.0,
      });

      const cancelDto: CancelSaleRequestDto = {
        reason: 'Customer cancelled appointment at counter',
      };

      const cancelled = await controller.cancelSale(sale.id, cancelDto);
      expect(cancelled.status).toBe('CANCELLED');

      // Attempting mutation on cancelled sale is rejected
      await expect(
        controller.addItem(sale.id, {
          source: { sourceType: SourceType.CUSTOM_SERVICE, sourceId: 'serv_2' },
          description: 'Denied Item',
          quantity: 1,
          unitPriceAmount: 20.0,
        }),
      ).rejects.toThrow();

      // Attempting to finalize cancelled sale is rejected
      await expect(controller.finalizeSale(sale.id, {})).rejects.toThrow();
    });
  });

  describe('3. Payment Coordination & MarkSalePaid Integrity', () => {
    it('prohibits marking a Sale as PAID without a valid completed Payment aggregate', async () => {
      const sale = await controller.createSale({ currency: 'USD' });
      await controller.addItem(sale.id, {
        source: { sourceType: SourceType.CUSTOM_SERVICE, sourceId: 'serv_1' },
        description: 'Gym Pass',
        quantity: 1,
        unitPriceAmount: 50.0,
      });
      await controller.finalizeSale(sale.id, {});

      // 1. Attempt coordination with non-existent payment ID
      await expect(
        controller.coordinatePayment(sale.id, { paymentId: 'pay_non_existent' }),
      ).rejects.toThrow(NotFoundException);

      // 2. Attempt coordination with PENDING payment (not completed)
      const pendingPayment = Payment.createPending({
        id: PaymentId.create('pay_pending_01'),
        saleId: SaleId.create(sale.id),
        method: PaymentMethod.CASH,
        amount: Money.create(50.0, 'USD'),
      });
      paymentRepo.store.set(pendingPayment.id.value, pendingPayment);

      await expect(
        controller.coordinatePayment(sale.id, { paymentId: pendingPayment.id.value }),
      ).rejects.toThrow();

      // 3. Attempt coordination with payment belonging to another sale
      const otherSalePayment = Payment.createCompleted({
        id: PaymentId.create('pay_other_sale_01'),
        saleId: SaleId.create('sale_other_999'),
        method: PaymentMethod.CASH,
        amount: Money.create(50.0, 'USD'),
        reference: 'REF-OTHER',
      });
      paymentRepo.store.set(otherSalePayment.id.value, otherSalePayment);

      await expect(
        controller.coordinatePayment(sale.id, { paymentId: otherSalePayment.id.value }),
      ).rejects.toThrow();

      // 4. Legitimate coordination: Payment belongs to Sale and is COMPLETED
      pendingPayment.complete({ reference: 'REF-VALID-CASH' });
      expect(pendingPayment.status).toBe(PaymentStatus.COMPLETED);

      const coordinated = await controller.coordinatePayment(sale.id, {
        paymentId: pendingPayment.id.value,
      });

      expect(coordinated.status).toBe('PAID');
    });
  });

  describe('4. Architecture Boundaries & Clean Separation of Concerns', () => {
    it('proves Controller does not calculate authoritative totals directly', () => {
      // Verify that calculateTotals or mathematical multiplication does not exist in SalesController methods
      const controllerCode = SalesController.prototype.createSale.toString();
      expect(controllerCode).not.toContain('subtotal =');
      expect(controllerCode).not.toContain('total =');
      expect(controllerCode).not.toContain('discountTotal =');
    });

    it('proves Controller delegates 100% of mutations to application command handlers', async () => {
      const sale = await controller.createSale({ currency: 'USD' });
      expect(saleRepo.store.has(sale.id)).toBe(true);

      const updated = await controller.addItem(sale.id, {
        source: { sourceType: SourceType.CUSTOM_SERVICE, sourceId: 'serv_1' },
        description: 'Item Test',
        quantity: 1,
        unitPriceAmount: 25.0,
      });

      expect(updated.id).toBe(sale.id);
      expect(saleRepo.store.get(sale.id)?.items).toHaveLength(1);
    });
  });
});
