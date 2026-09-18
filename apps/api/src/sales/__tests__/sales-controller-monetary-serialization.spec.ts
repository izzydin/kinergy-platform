import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { Response } from 'express';
import {
  Sale,
  Money,
  SourceReference,
  SourceType,
  SaleId,
  SaleRepositoryInterface,
  InvalidMoneyException,
  InvalidDiscountException,
  EmptySaleException,
  SaleAlreadyFinalizedException,
  SaleOptimisticLockException,
} from '@kinergy-platform/core';
import { SalesController, SALE_REPOSITORY_TOKEN } from '../controllers/sales.controller';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';
import { CreateSaleRequestDto, AddSaleItemRequestDto } from '../dto';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';

class InMemorySaleRepository implements SaleRepositoryInterface {
  private readonly items = new Map<string, Sale>();

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id : id.value;
    return this.items.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.items.set(sale.id.value, sale);
  }
}

describe('SalesController Monetary API Representation & Exception Spec', () => {
  let controller: SalesController;
  let repository: InMemorySaleRepository;
  let exceptionFilter: SalesExceptionFilter;

  beforeEach(async () => {
    repository = new InMemorySaleRepository();
    exceptionFilter = new SalesExceptionFilter();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalesController],
      providers: [
        {
          provide: SALE_REPOSITORY_TOKEN,
          useValue: repository,
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

  describe('Monetary Value Serialization on Create & Query', () => {
    it('creates a new draft sale with exact zero monetary totals across structured and flat fields', async () => {
      const dto: CreateSaleRequestDto = {
        currency: 'USD',
        clientId: 'client_vip_1',
      };

      const response = await controller.createSale(dto);

      expect(response.currency).toBe('USD');
      expect(response.clientId).toBe('client_vip_1');
      expect(response.status).toBe('DRAFT');

      // Structured Money serialization
      expect(response.subtotal).toEqual({
        amount: 0,
        currency: 'USD',
        formatted: '0.00',
        cents: 0,
      });
      expect(response.discountTotal).toEqual({
        amount: 0,
        currency: 'USD',
        formatted: '0.00',
        cents: 0,
      });
      expect(response.total).toEqual({
        amount: 0,
        currency: 'USD',
        formatted: '0.00',
        cents: 0,
      });

      // Flat summary read projections
      expect(response.subtotalAmount).toBe(0);
      expect(response.discountTotalAmount).toBe(0);
      expect(response.totalAmount).toBe(0);
      expect(response.itemCount).toBe(0);
      expect(response.items).toEqual([]);
    });

    it('retrieves an existing sale by ID with exact monetary fidelity', async () => {
      const sale = Sale.create({
        currency: 'EUR',
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_1',
        }),
      });
      await repository.save(sale);

      const response = await controller.getSale(sale.id.value);

      expect(response.id).toBe(sale.id.value);
      expect(response.currency).toBe('EUR');
      expect(response.subtotal.currency).toBe('EUR');
      expect(response.total.currency).toBe('EUR');
    });

    it('throws 404 NotFoundException when querying a non-existent sale ID', async () => {
      await expect(controller.getSale('non_existent_sale_id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('Item Calculations and Monetary Total Aggregation', () => {
    it('serializes subtotal, discountTotal, and total with exact Commercial Half-Up rounding', async () => {
      const sale = Sale.create({
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'inv_100',
        }),
      });
      await repository.save(sale);

      // Add item: 2.5 units @ $19.99/unit
      // 2.5 * 19.99 = 49.975 -> Half-Up rounds to $49.98 (cents: 4998)
      // 10% discount on $49.98 = $4.998 -> Half-Up rounds to $5.00 (cents: 500)
      // Net line total = $49.98 - $5.00 = $44.98 (cents: 4498)
      const addItemDto: AddSaleItemRequestDto = {
        source: {
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'inv_100',
          sourceCode: 'WHEY_VANILLA',
        },
        description: 'Whey Protein Tub (2.5 kg)',
        quantity: 2.5,
        unitPriceAmount: 19.99,
        discount: {
          type: 'PERCENTAGE',
          value: 10,
          reason: '10% Member Concession',
        },
      };

      const response = await controller.addItem(sale.id.value, addItemDto);

      expect(response.itemCount).toBe(1);
      const item = response.items[0]!;

      // Item level monetary serialization
      expect(item.unitPrice).toEqual({
        amount: 19.99,
        currency: 'USD',
        formatted: '19.99',
        cents: 1999,
      });
      expect(item.unitPriceAmount).toBe(19.99);

      expect(item.subtotal).toEqual({
        amount: 49.98,
        currency: 'USD',
        formatted: '49.98',
        cents: 4998,
      });
      expect(item.subtotalAmount).toBe(49.98);

      expect(item.discountTotal).toEqual({
        amount: 5.0,
        currency: 'USD',
        formatted: '5.00',
        cents: 500,
      });
      expect(item.discountTotalAmount).toBe(5.0);

      expect(item.total).toEqual({
        amount: 44.98,
        currency: 'USD',
        formatted: '44.98',
        cents: 4498,
      });
      expect(item.totalAmount).toBe(44.98);

      // Order level aggregate monetary serialization
      expect(response.subtotal).toEqual({
        amount: 49.98,
        currency: 'USD',
        formatted: '49.98',
        cents: 4998,
      });
      expect(response.subtotalAmount).toBe(49.98);

      expect(response.discountTotal).toEqual({
        amount: 5.0,
        currency: 'USD',
        formatted: '5.00',
        cents: 500,
      });
      expect(response.discountTotalAmount).toBe(5.0);

      expect(response.total).toEqual({
        amount: 44.98,
        currency: 'USD',
        formatted: '44.98',
        cents: 4498,
      });
      expect(response.totalAmount).toBe(44.98);

      // Verify domain value -> API response identity
      const persistedSale = await repository.findById(sale.id.value);
      expect(persistedSale?.subtotal.cents).toBe(response.subtotal.cents);
      expect(persistedSale?.discountTotal.cents).toBe(response.discountTotal.cents);
      expect(persistedSale?.total.cents).toBe(response.total.cents);
    });

    it('locks monetary terms permanently upon finalization', async () => {
      const sale = Sale.create({
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'inv_1',
        }),
      });
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'inv_1',
        }),
        description: 'T-Shirt',
        quantity: 1,
        unitPrice: Money.create(25.0, 'USD'),
      });
      await repository.save(sale);

      const finalized = await controller.finalizeSale(sale.id.value, {});
      expect(finalized.status).toBe('PENDING_PAYMENT');

      // Attempting to add an item after finalization must throw SaleAlreadyFinalizedException
      await expect(
        controller.addItem(sale.id.value, {
          source: {
            sourceType: SourceType.INVENTORY_ITEM,
            sourceId: 'inv_2',
          },
          description: 'Socks',
          quantity: 1,
          unitPriceAmount: 10,
        }),
      ).rejects.toThrow(SaleAlreadyFinalizedException);
    });
  });

  describe('SalesExceptionFilter Invariant Error Translations', () => {
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
          getRequest: () => ({ url: '/api/v1/sales' }) as unknown,
          getNext: () => jest.fn(),
        }),
        getArgs: () => [],
        getArgByIndex: () => undefined,
        switchToRpc: () => ({ getData: () => undefined, getContext: () => undefined }),
        switchToWs: () => ({ getData: () => undefined, getClient: () => undefined }),
        getType: () => 'http',
      } as unknown as ArgumentsHost;
    });

    it('translates InvalidMoneyException to 400 Bad Request with code INVALID_MONEY', () => {
      const ex = new InvalidMoneyException('Monetary amount cannot be negative.');
      exceptionFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          code: 'INVALID_MONEY',
        }),
      );
    });

    it('translates InvalidDiscountException to 400 Bad Request with code INVALID_DISCOUNT', () => {
      const ex = new InvalidDiscountException('Discount exceeds subtotal.');
      exceptionFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          code: 'INVALID_DISCOUNT',
        }),
      );
    });

    it('translates EmptySaleException to 422 Unprocessable Entity with code EMPTY_SALE', () => {
      const ex = new EmptySaleException('Cannot finalize sale with zero items.');
      exceptionFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'Unprocessable Entity',
          code: 'EMPTY_SALE',
        }),
      );
    });

    it('translates SaleAlreadyFinalizedException to 409 Conflict with code SALE_ALREADY_FINALIZED', () => {
      const ex = new SaleAlreadyFinalizedException('PENDING_PAYMENT');
      exceptionFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'SALE_ALREADY_FINALIZED',
        }),
      );
    });

    it('translates SaleOptimisticLockException to 409 Conflict with code SALE_OPTIMISTIC_LOCK_FAILED', () => {
      const ex = new SaleOptimisticLockException('Sale', 'sale_1', 1);
      exceptionFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'OPTIMISTIC_LOCK_ERROR',
        }),
      );
    });
  });
});
