import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { BadRequestException, NotFoundException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { Response } from 'express';
import {
  Sale,
  SaleId,
  SaleItem,
  SaleItemId,
  SaleSource,
  SaleSourceType,
  Money,
  Discount,
  SaleRepositoryInterface,
  AddSaleItemHandler,
  RemoveSaleItemHandler,
  AddSaleItemCommand,
  InvalidSaleStateException,
  SaleNotFoundException,
  SaleUnauthorizedException,
  SaleAlreadyFinalizedException,
  InvalidDiscountException,
  FindSalesCriteria,
  FindSalesPagination,
  FindSalesSort,
  FindSalesResult,
  MoneyMapper,
} from '@kinergy-platform/core';
import { SalesController } from '../controllers/sales.controller';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';
import { SALE_REPOSITORY_TOKEN, PAYMENT_REPOSITORY_TOKEN } from '../sales.tokens';
import { AddSaleItemRequestDto } from '../dto/add-sale-item-request.dto';
import { GlobalSanitizationValidationPipe } from '../../common/pipes/global-sanitization-validation.pipe';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { ROLES_KEY } from '../../platform/identity/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../platform/identity/decorators/permissions.decorator';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';

class InMemorySaleRepository implements SaleRepositoryInterface {
  public readonly items = new Map<string, Sale>();

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.items.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.items.set(sale.id.value, sale);
  }

  async findMany(
    criteria: FindSalesCriteria,
    pagination: FindSalesPagination,
    _sort: FindSalesSort,
  ): Promise<FindSalesResult> {
    let sales = Array.from(this.items.values());
    if (criteria.tenantId) {
      sales = sales.filter((s) => s.tenantId === criteria.tenantId);
    }
    const total = sales.length;
    const startIndex = (pagination.page - 1) * pagination.limit;
    const pageItems = sales.slice(startIndex, startIndex + pagination.limit).map((s) => {
      const subtotalDto = MoneyMapper.toDTO(s.subtotal);
      const discountTotalDto = MoneyMapper.toDTO(s.discountTotal);
      const totalDto = MoneyMapper.toDTO(s.total);

      return {
        id: s.id.value,
        tenantId: s.tenantId,
        clientId: s.clientId,
        currency: s.currency,
        status: s.status,
        source: {
          sourceType: s.source.sourceType,
          sourceId: s.source.sourceId,
          sourceCode: s.source.sourceCode,
          type: s.source.sourceType,
          referenceId: s.source.sourceId,
          referenceCode: s.source.sourceCode,
        },
        subtotal: subtotalDto,
        discountTotal: discountTotalDto,
        total: totalDto,
        subtotalAmount: subtotalDto.amount,
        discountTotalAmount: discountTotalDto.amount,
        totalAmount: totalDto.amount,
        itemCount: s.itemCount,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      };
    });

    return {
      items: pageItems,
      total,
    };
  }
}

describe('Sales Items API Contract Specification (POST & DELETE /sales/:id/items)', () => {
  let controller: SalesController;
  let repository: InMemorySaleRepository;
  let addSaleItemHandler: AddSaleItemHandler;
  let removeSaleItemHandler: RemoveSaleItemHandler;
  let pipe: GlobalSanitizationValidationPipe;
  let reflector: Reflector;
  let exceptionFilter: SalesExceptionFilter;

  const validCashierUser: AuthenticatedUserPayload = {
    id: 'user_cashier_01',
    email: 'cashier@kinergy.com',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['sales.create', 'sales.read'],
    tenantId: 'tenant_main',
  };

  const createDraftSale = async (id: string, currency = 'USD'): Promise<Sale> => {
    const sale = Sale.create({
      id: SaleId.create(id),
      tenantId: 'tenant_main',
      clientId: 'client_123',
      currency,
      source: SaleSource.create(SaleSourceType.FOOD, 'terminal_101'),
    });
    await repository.save(sale);
    return sale;
  };

  beforeEach(async () => {
    repository = new InMemorySaleRepository();
    addSaleItemHandler = new AddSaleItemHandler(repository);
    removeSaleItemHandler = new RemoveSaleItemHandler(repository);
    pipe = new GlobalSanitizationValidationPipe();
    reflector = new Reflector();
    exceptionFilter = new SalesExceptionFilter();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalesController],
      providers: [
        {
          provide: SALE_REPOSITORY_TOKEN,
          useValue: repository,
        },
        {
          provide: PAYMENT_REPOSITORY_TOKEN,
          useValue: { findById: jest.fn(), findBySaleId: jest.fn(), save: jest.fn() },
        },
        {
          provide: AddSaleItemHandler,
          useValue: addSaleItemHandler,
        },
        {
          provide: RemoveSaleItemHandler,
          useValue: removeSaleItemHandler,
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

  describe('1. Valid Item Addition (POST /sales/:id/items)', () => {
    it('successfully adds an item with full details and recalculates totals', async () => {
      const sale = await createDraftSale('sale_draft_01');

      const payload = {
        description: 'Whey Protein Isolate 1kg',
        skuOrCode: 'PROT-ISO-1KG',
        quantity: 2,
        unitPriceAmount: 45.0,
        sourceReference: {
          type: SaleSourceType.FOOD,
          referenceId: 'inv_protein_001',
        },
      };

      const transformed = (await pipe.transform(payload, {
        type: 'body',
        metatype: AddSaleItemRequestDto,
      })) as AddSaleItemRequestDto;

      const result = await controller.addItem(sale.id.value, transformed, validCashierUser);

      expect(result.id).toBe(sale.id.value);
      expect(result.items).toHaveLength(1);
      const addedItem = result.items[0]!;
      expect(addedItem.description).toBe('Whey Protein Isolate 1kg');
      expect(addedItem.skuOrCode).toBe('PROT-ISO-1KG');
      expect(addedItem.quantity).toBe(2);
      expect(addedItem.unitPriceAmount).toBe(45.0);
      expect(addedItem.subtotalAmount).toBe(90.0);
      expect(addedItem.totalAmount).toBe(90.0);

      // Order totals
      expect(result.subtotalAmount).toBe(90.0);
      expect(result.discountTotalAmount).toBe(0.0);
      expect(result.totalAmount).toBe(90.0);
    });

    it('inherits parent Sale source reference when sourceReference is omitted', async () => {
      const sale = await createDraftSale('sale_draft_inherit');

      const payload = {
        description: 'Recovery Drink',
        quantity: 1,
        unitPriceAmount: 5.5,
      };

      const transformed = (await pipe.transform(payload, {
        type: 'body',
        metatype: AddSaleItemRequestDto,
      })) as AddSaleItemRequestDto;

      const result = await controller.addItem(sale.id.value, transformed, validCashierUser);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.sourceReference?.type).toBe(SaleSourceType.FOOD);
      expect(result.items[0]?.sourceReference?.referenceId).toBe('terminal_101');
    });

    it('applies line-item discount and recalculates net line totals deterministically', async () => {
      const sale = await createDraftSale('sale_draft_discount');

      const payload = {
        description: 'Personal Training Session 60m',
        quantity: 1,
        unitPriceAmount: 80.0,
        discount: {
          type: 'PERCENTAGE',
          value: 25,
          reason: 'First Session Promo',
        },
      };

      const transformed = (await pipe.transform(payload, {
        type: 'body',
        metatype: AddSaleItemRequestDto,
      })) as AddSaleItemRequestDto;

      const result = await controller.addItem(sale.id.value, transformed, validCashierUser);

      const item = result.items[0]!;
      expect(item.subtotalAmount).toBe(80.0);
      expect(item.discountTotalAmount).toBe(20.0);
      expect(item.totalAmount).toBe(60.0);

      expect(result.subtotalAmount).toBe(80.0);
      expect(result.discountTotalAmount).toBe(20.0);
      expect(result.totalAmount).toBe(60.0);
    });

    it('accumulates multiple line items and recalculates totals correctly', async () => {
      const sale = await createDraftSale('sale_draft_multi');

      await controller.addItem(
        sale.id.value,
        {
          description: 'Item 1',
          quantity: 2,
          unitPriceAmount: 10.0, // 20.00
        },
        validCashierUser,
      );

      const afterSecond = await controller.addItem(
        sale.id.value,
        {
          description: 'Item 2',
          quantity: 1,
          unitPriceAmount: 30.0, // 30.00
        },
        validCashierUser,
      );

      expect(afterSecond.items).toHaveLength(2);
      expect(afterSecond.subtotalAmount).toBe(50.0);
      expect(afterSecond.totalAmount).toBe(50.0);
    });
  });

  describe('2. Invalid Quantity and Monetary Inputs Rejection', () => {
    it('rejects zero or negative quantity at DTO validation boundary', async () => {
      const invalidQuantities = [0, -1, -0.5];

      for (const qty of invalidQuantities) {
        await expect(
          pipe.transform(
            {
              description: 'Item',
              quantity: qty,
              unitPriceAmount: 10,
            },
            {
              type: 'body',
              metatype: AddSaleItemRequestDto,
            },
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('rejects quantity exceeding maximum boundary (999999)', async () => {
      await expect(
        pipe.transform(
          {
            description: 'Item',
            quantity: 1000000,
            unitPriceAmount: 10,
          },
          {
            type: 'body',
            metatype: AddSaleItemRequestDto,
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects negative unit price at DTO validation boundary', async () => {
      await expect(
        pipe.transform(
          {
            description: 'Item',
            quantity: 1,
            unitPriceAmount: -15.0,
          },
          {
            type: 'body',
            metatype: AddSaleItemRequestDto,
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects empty or whitespace-only description', async () => {
      await expect(
        pipe.transform(
          {
            description: '   ',
            quantity: 1,
            unitPriceAmount: 10.0,
          },
          {
            type: 'body',
            metatype: AddSaleItemRequestDto,
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects line discount exceeding line subtotal via domain invariant', async () => {
      const sale = await createDraftSale('sale_draft_excess_disc');

      const payload = {
        description: 'Energy Bar',
        quantity: 1,
        unitPriceAmount: 3.0,
        discount: {
          type: 'FIXED',
          value: 10.0, // Fixed discount $10 > subtotal $3
          reason: 'Excessive coupon',
        },
      };

      let thrownError: unknown;
      try {
        await controller.addItem(sale.id.value, payload, validCashierUser);
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(InvalidDiscountException);

      // Verify SalesExceptionFilter translates to HTTP 400 Bad Request
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
      } as unknown as Response;
      const mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => ({ headers: {}, method: 'POST', url: `/sales/${sale.id.value}/items` }),
        }),
      } as unknown as ArgumentsHost;

      exceptionFilter.catch(thrownError, mockHost);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          code: 'INVALID_DISCOUNT',
        }),
      );
    });

    it('strictly forbids injection of calculated line totals in request payload', async () => {
      const calculatedFields = [
        { subtotal: 100 },
        { subtotalAmount: 100 },
        { discountTotal: 20 },
        { discountTotalAmount: 20 },
        { total: 80 },
        { totalAmount: 80 },
        { lineTotal: 80 },
      ];

      for (const field of calculatedFields) {
        await expect(
          pipe.transform(
            {
              description: 'Item',
              quantity: 1,
              unitPriceAmount: 10,
              ...field,
            },
            {
              type: 'body',
              metatype: AddSaleItemRequestDto,
            },
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });
  });

  describe('3. Unknown Sale or Item Handling', () => {
    it('returns NotFoundException (404) when adding an item to non-existent Sale', async () => {
      await expect(
        controller.addItem(
          'sale_non_existent_404',
          {
            description: 'Item',
            quantity: 1,
            unitPriceAmount: 10,
          },
          validCashierUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns NotFoundException (404) when removing an item from non-existent Sale', async () => {
      await expect(
        controller.removeItem('sale_non_existent_404', 'item_123', validCashierUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns NotFoundException (404) when removing non-existent item from existing Sale', async () => {
      const sale = await createDraftSale('sale_draft_exist');

      await expect(
        controller.removeItem(sale.id.value, 'item_non_existent_999', validCashierUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects empty or whitespace sale or item identifiers with BadRequestException (400)', async () => {
      await expect(
        controller.addItem(
          '   ',
          { description: 'Item', quantity: 1, unitPriceAmount: 10 },
          validCashierUser,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(controller.removeItem('   ', 'item_1', validCashierUser)).rejects.toThrow(
        BadRequestException,
      );

      await expect(controller.removeItem('sale_1', '   ', validCashierUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('4. Item Ownership and Cross-Sale Attachment Protection', () => {
    it('strictly forbids client from passing saleId in AddSaleItem request body', async () => {
      const maliciousPayload = {
        saleId: 'foreign_sale_888', // Attempting to attach to foreign sale
        description: 'Cross Sale Item',
        quantity: 1,
        unitPriceAmount: 25,
      };

      await expect(
        pipe.transform(maliciousPayload, {
          type: 'body',
          metatype: AddSaleItemRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('prevents removing an item from a Sale merely because its identifier is known', async () => {
      // Sale A owns Item A1
      const saleA = await createDraftSale('sale_alpha');
      const resA = await controller.addItem(
        saleA.id.value,
        { description: 'Alpha Item', quantity: 1, unitPriceAmount: 50 },
        validCashierUser,
      );
      const itemAId = resA.items[0]!.id;

      // Sale B owns Item B1
      const saleB = await createDraftSale('sale_beta');
      await controller.addItem(
        saleB.id.value,
        { description: 'Beta Item', quantity: 1, unitPriceAmount: 30 },
        validCashierUser,
      );

      // Caller knows itemAId and attempts to delete it via Sale B
      await expect(
        controller.removeItem(saleB.id.value, itemAId, validCashierUser),
      ).rejects.toThrow(NotFoundException);

      // Verify Item A1 remains safely attached to Sale A with unchanged totals
      const retrievedA = await repository.findById(saleA.id.value);
      expect(retrievedA?.items).toHaveLength(1);
      expect(retrievedA?.total.amount).toBe(50.0);
    });

    it('enforces aggregate boundary: rejects attaching an item belonging to another Sale', () => {
      const sale1 = Sale.create({
        id: SaleId.create('sale_parent_01'),
        tenantId: 'tenant_main',
        source: SaleSource.create(SaleSourceType.FOOD, 't1'),
      });

      const sale2 = Sale.create({
        id: SaleId.create('sale_foreign_02'),
        tenantId: 'tenant_main',
        source: SaleSource.create(SaleSourceType.FOOD, 't2'),
      });

      const itemBelongingToSale2 = SaleItem.create({
        id: SaleItemId.create('item_foreign_99'),
        saleId: sale2.id,
        source: sale2.source,
        description: 'Foreign Product',
        quantity: 1,
        unitPrice: Money.create(20, 'USD'),
      });

      // Attempting to attach itemBelongingToSale2 to sale1 must throw CROSS_SALE_ITEM_ATTACHMENT_PROHIBITED
      expect(() => {
        sale1.addItem(itemBelongingToSale2);
      }).toThrow(InvalidSaleStateException);

      try {
        sale1.addItem(itemBelongingToSale2);
      } catch (err: unknown) {
        expect((err as InvalidSaleStateException).code).toBe(
          'CROSS_SALE_ITEM_ATTACHMENT_PROHIBITED',
        );
      }
    });
  });

  describe('5. Mutation of Cancelled or Immutable Sale Protection', () => {
    it('rejects adding an item to a CANCELLED sale with 409 Conflict', async () => {
      const sale = await createDraftSale('sale_cancelled_01');
      sale.cancel('Customer abandoned order');
      await repository.save(sale);

      let thrownError: unknown;
      try {
        await controller.addItem(
          sale.id.value,
          {
            description: 'Post-Cancellation Item',
            quantity: 1,
            unitPriceAmount: 15,
          },
          validCashierUser,
        );
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(SaleAlreadyFinalizedException);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
      } as unknown as Response;
      const mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => ({ headers: {}, method: 'POST', url: `/sales/${sale.id.value}/items` }),
        }),
      } as unknown as ArgumentsHost;

      exceptionFilter.catch(thrownError, mockHost);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'SALE_ALREADY_FINALIZED',
        }),
      );
    });

    it('rejects removing an item from a CANCELLED sale with 409 Conflict', async () => {
      const sale = await createDraftSale('sale_cancelled_remove');
      const added = await controller.addItem(
        sale.id.value,
        {
          description: 'Item to remove',
          quantity: 1,
          unitPriceAmount: 20,
        },
        validCashierUser,
      );
      const itemId = added.items[0]!.id;

      // Cancel the sale
      const loaded = await repository.findById(sale.id.value);
      loaded?.cancel('Order cancelled');
      await repository.save(loaded!);

      let thrownError: unknown;
      try {
        await controller.removeItem(sale.id.value, itemId, validCashierUser);
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(SaleAlreadyFinalizedException);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
      } as unknown as Response;
      const mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => ({
            headers: {},
            method: 'DELETE',
            url: `/sales/${sale.id.value}/items/${itemId}`,
          }),
        }),
      } as unknown as ArgumentsHost;

      exceptionFilter.catch(thrownError, mockHost);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'SALE_ALREADY_FINALIZED',
        }),
      );
    });

    it('rejects adding an item to a finalized sale in PENDING_PAYMENT status with 409 Conflict', async () => {
      const sale = await createDraftSale('sale_finalized_01');
      await controller.addItem(
        sale.id.value,
        { description: 'Initial Item', quantity: 1, unitPriceAmount: 20 },
        validCashierUser,
      );

      // Transition out of DRAFT to PENDING_PAYMENT
      const loaded = await repository.findById(sale.id.value);
      loaded?.finalize();
      await repository.save(loaded!);

      let thrownError: unknown;
      try {
        await controller.addItem(
          sale.id.value,
          { description: 'New Item after finalize', quantity: 1, unitPriceAmount: 10 },
          validCashierUser,
        );
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(SaleAlreadyFinalizedException);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
      } as unknown as Response;
      const mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => ({ headers: {}, method: 'POST', url: `/sales/${sale.id.value}/items` }),
        }),
      } as unknown as ArgumentsHost;

      exceptionFilter.catch(thrownError, mockHost);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'SALE_ALREADY_FINALIZED',
        }),
      );
    });
  });

  describe('6. Authorization and Tenant Isolation Enforcement', () => {
    it('declares required roles and permissions metadata on addItem and removeItem', () => {
      const addPermissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        SalesController.prototype.addItem,
      );
      expect(addPermissions).toContain('sales.create');

      const addRoles = reflector.get<string[]>(ROLES_KEY, SalesController.prototype.addItem);
      expect(addRoles).toEqual(
        expect.arrayContaining(['Owner', 'Manager', 'Receptionist', 'Kitchen Staff']),
      );

      const removePermissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        SalesController.prototype.removeItem,
      );
      expect(removePermissions).toContain('sales.create');

      const removeRoles = reflector.get<string[]>(ROLES_KEY, SalesController.prototype.removeItem);
      expect(removeRoles).toEqual(
        expect.arrayContaining(['Owner', 'Manager', 'Receptionist', 'Kitchen Staff']),
      );
    });

    it('rejects addItem when user lacks sales.create permission at application layer', async () => {
      const sale = await createDraftSale('sale_unauth_add');

      const unauthorizedUser: AuthenticatedUserPayload = {
        id: 'user_read_only',
        email: 'reader@example.com',
        status: 'ACTIVE',
        roles: ['Trainer'],
        permissions: ['sales.read'], // Missing sales.create
        tenantId: 'tenant_main',
      };

      await expect(
        controller.addItem(
          sale.id.value,
          { description: 'Protein Shake', quantity: 1, unitPriceAmount: 6 },
          unauthorizedUser,
        ),
      ).rejects.toThrow(SaleUnauthorizedException);
    });

    it('rejects removeItem when user lacks sales.create permission at application layer', async () => {
      const sale = await createDraftSale('sale_unauth_rem');
      const added = await controller.addItem(
        sale.id.value,
        { description: 'Item', quantity: 1, unitPriceAmount: 10 },
        validCashierUser,
      );
      const itemId = added.items[0]!.id;

      const unauthorizedUser: AuthenticatedUserPayload = {
        id: 'user_read_only',
        email: 'reader@example.com',
        status: 'ACTIVE',
        roles: ['Trainer'],
        permissions: ['sales.read'],
        tenantId: 'tenant_main',
      };

      await expect(controller.removeItem(sale.id.value, itemId, unauthorizedUser)).rejects.toThrow(
        SaleUnauthorizedException,
      );
    });

    it('enforces multi-tenant boundary isolation: returns 404 on cross-tenant access', async () => {
      const sale = await createDraftSale('sale_tenant_isolation');

      const crossTenantUser: AuthenticatedUserPayload = {
        id: 'user_other_tenant',
        email: 'other@tenant.com',
        status: 'ACTIVE',
        roles: ['Manager'],
        permissions: ['sales.create'],
        tenantId: 'tenant_other_facility', // Different tenant
      };

      // Cross-tenant access returns SaleNotFoundException (yielding 404) to avoid resource existence disclosure
      const command = new AddSaleItemCommand({
        saleId: sale.id.value,
        tenantId: 'tenant_other_facility',
        currentUser: {
          id: crossTenantUser.id,
          roles: crossTenantUser.roles,
          permissions: crossTenantUser.permissions,
          tenantId: crossTenantUser.tenantId,
        },
        description: 'Item',
        quantity: 1,
        unitPriceAmount: 10,
      });

      const result = await addSaleItemHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
    });
  });

  describe('7. Authoritative Domain Financial Recalculation & Zero Items Invariant', () => {
    it('preserves the rule that a DRAFT Sale may have zero items after removing all items', async () => {
      const sale = await createDraftSale('sale_zero_items');

      // Add item
      const added = await controller.addItem(
        sale.id.value,
        { description: 'Only Item', quantity: 1, unitPriceAmount: 25.0 },
        validCashierUser,
      );
      expect(added.items).toHaveLength(1);
      expect(added.totalAmount).toBe(25.0);
      const itemId = added.items[0]!.id;

      // Remove the only item
      const removed = await controller.removeItem(sale.id.value, itemId, validCashierUser);

      // Sale remains validly in DRAFT status with 0 items and exact zero monetary totals
      expect(removed.items).toHaveLength(0);
      expect(removed.itemCount).toBe(0);
      expect(removed.subtotalAmount).toBe(0);
      expect(removed.discountTotalAmount).toBe(0);
      expect(removed.totalAmount).toBe(0);
      expect(removed.status).toBe('DRAFT');

      const persisted = await repository.findById(sale.id.value);
      expect(persisted?.items).toHaveLength(0);
      expect(persisted?.total.amount).toBe(0);
    });

    it('correctly recalculates order-level discount when items are added and removed', async () => {
      const sale = await createDraftSale('sale_order_discount_recalc');
      // Set 10% order discount on sale
      sale.applyOrderDiscount(Discount.percentage(10, 'Seasonal'));
      await repository.save(sale);

      // Add Item 1 ($100) -> Subtotal: $100, Discount: $10, Total: $90
      const after1 = await controller.addItem(
        sale.id.value,
        { description: 'Item 1', quantity: 1, unitPriceAmount: 100.0 },
        validCashierUser,
      );
      expect(after1.subtotalAmount).toBe(100.0);
      expect(after1.discountTotalAmount).toBe(10.0);
      expect(after1.totalAmount).toBe(90.0);
      const item1Id = after1.items[0]!.id;

      // Add Item 2 ($100) -> Subtotal: $200, Discount: $20, Total: $180
      const after2 = await controller.addItem(
        sale.id.value,
        { description: 'Item 2', quantity: 1, unitPriceAmount: 100.0 },
        validCashierUser,
      );
      expect(after2.subtotalAmount).toBe(200.0);
      expect(after2.discountTotalAmount).toBe(20.0);
      expect(after2.totalAmount).toBe(180.0);

      // Remove Item 1 -> Subtotal: $100, Discount: $10, Total: $90
      const afterRemove = await controller.removeItem(sale.id.value, item1Id, validCashierUser);
      expect(afterRemove.subtotalAmount).toBe(100.0);
      expect(afterRemove.discountTotalAmount).toBe(10.0);
      expect(afterRemove.totalAmount).toBe(90.0);
    });
  });

  describe('8. Atomicity and Non-Partial Persistence', () => {
    it('does not partially persist when adding item fails domain validation', async () => {
      const sale = await createDraftSale('sale_atomicity_test');

      // Attempt to add item with excessive discount
      let thrownError: unknown;
      try {
        await controller.addItem(
          sale.id.value,
          {
            description: 'Item with Bad Discount',
            quantity: 1,
            unitPriceAmount: 10.0,
            discount: {
              type: 'FIXED',
              value: 50.0, // Invalid: exceeds subtotal
            },
          },
          validCashierUser,
        );
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(InvalidDiscountException);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
      } as unknown as Response;
      const mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => ({ headers: {}, method: 'POST', url: `/sales/${sale.id.value}/items` }),
        }),
      } as unknown as ArgumentsHost;

      exceptionFilter.catch(thrownError, mockHost);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);

      // Verify repository remains completely untouched
      const checked = await repository.findById(sale.id.value);
      expect(checked?.items).toHaveLength(0);
      expect(checked?.total.amount).toBe(0);
    });
  });
});
