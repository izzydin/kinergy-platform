import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  Sale,
  SaleId,
  SaleSourceType,
  SaleRepositoryInterface,
  CreateSaleHandler,
  CreateSaleCommand,
  InvalidSaleSourceException,
  SaleNotFoundException,
  SaleUnauthorizedException,
  ClientFacadePort,
  ClientSummaryPayload,
  FindSalesCriteria,
  FindSalesPagination,
  FindSalesSort,
  FindSalesResult,
  MoneyMapper,
} from '@kinergy-platform/core';
import { SalesController } from '../controllers/sales.controller';
import { SALE_REPOSITORY_TOKEN, PAYMENT_REPOSITORY_TOKEN } from '../sales.tokens';
import { CreateSaleRequestDto } from '../dto/create-sale-request.dto';
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

  async findBySourceReference(
    sourceType: string,
    sourceId: string,
    tenantId?: string,
  ): Promise<Sale | null> {
    for (const sale of this.items.values()) {
      if (
        sale.source.sourceType === sourceType &&
        sale.source.sourceId === sourceId &&
        (!tenantId || sale.tenantId === tenantId) &&
        sale.status !== 'CANCELLED'
      ) {
        return sale;
      }
    }
    return null;
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

class MockClientFacade implements ClientFacadePort {
  private readonly clients = new Map<string, ClientSummaryPayload>([
    [
      'client_existing_123',
      {
        id: 'client_existing_123',
        fullName: 'Jane Doe',
        email: 'jane@example.com',
      },
    ],
  ]);

  async getClientSummary(clientId: string): Promise<ClientSummaryPayload | null> {
    return this.clients.get(clientId) ?? null;
  }
}

describe('POST /sales Contract Specification (Milestone 7.14)', () => {
  let controller: SalesController;
  let repository: InMemorySaleRepository;
  let clientFacade: MockClientFacade;
  let createSaleHandler: CreateSaleHandler;
  let pipe: GlobalSanitizationValidationPipe;
  let reflector: Reflector;

  const validCashierUser: AuthenticatedUserPayload = {
    id: 'user_cashier_01',
    email: 'cashier@kinergy.com',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['sales.create', 'sales.read'],
    tenantId: 'tenant_main',
  };

  beforeEach(async () => {
    repository = new InMemorySaleRepository();
    clientFacade = new MockClientFacade();
    createSaleHandler = new CreateSaleHandler(
      repository,
      undefined,
      undefined,
      undefined,
      clientFacade,
    );
    pipe = new GlobalSanitizationValidationPipe();
    reflector = new Reflector();

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
          provide: CreateSaleHandler,
          useValue: createSaleHandler,
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

  describe('1. Valid Creation Contract', () => {
    it('creates an anonymous walk-in sale when source and client are omitted', async () => {
      const payload = {
        currency: 'USD',
      };

      const transformed = (await pipe.transform(payload, {
        type: 'body',
        metatype: CreateSaleRequestDto,
      })) as CreateSaleRequestDto;

      const result = await controller.createSale(transformed, undefined, validCashierUser);

      expect(result.id).toBeDefined();
      expect(result.status).toBe('DRAFT');
      expect(result.currency).toBe('USD');
      expect(result.version).toBe(1);
      expect(result.subtotalAmount).toBe(0);
      expect(result.discountTotalAmount).toBe(0);
      expect(result.totalAmount).toBe(0);
      expect(result.items).toEqual([]);
      expect(result.clientId).toBeFalsy();
      expect(result.sourceReference).not.toBeNull();
      expect(result.sourceReference?.type).toBe(SaleSourceType.DRINK);
      expect(result.sourceReference?.referenceId).toBe('pos_checkout_terminal');

      const saved = await repository.findById(result.id);
      expect(saved).not.toBeNull();
      expect(saved?.status).toBe('DRAFT');
    });

    it('creates a sale with identified client and explicit generic sourceReference', async () => {
      const payload = {
        clientId: 'client_existing_123',
        currency: 'USD',
        sourceReference: {
          type: SaleSourceType.FOOD,
          referenceId: 'order_food_999',
          referenceCode: 'TABLE-12',
        },
      };

      const transformed = (await pipe.transform(payload, {
        type: 'body',
        metatype: CreateSaleRequestDto,
      })) as CreateSaleRequestDto;

      const result = await controller.createSale(transformed, undefined, validCashierUser);

      expect(result.clientId).toBe('client_existing_123');
      expect(result.sourceReference?.type).toBe(SaleSourceType.FOOD);
      expect(result.sourceReference?.referenceId).toBe('order_food_999');
      expect(result.sourceReference?.referenceCode).toBe('TABLE-12');
    });

    it('creates a sale with initial items and order discount, computing authoritative totals', async () => {
      const payload = {
        currency: 'USD',
        items: [
          {
            description: 'Protein Shake (Banana)',
            quantity: 2,
            unitPriceAmount: 5.0,
          },
        ],
        orderDiscount: {
          type: 'PERCENTAGE',
          value: 10,
          reason: 'Grand Opening',
        },
      };

      const transformed = (await pipe.transform(payload, {
        type: 'body',
        metatype: CreateSaleRequestDto,
      })) as CreateSaleRequestDto;

      const result = await controller.createSale(transformed, undefined, validCashierUser);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.description).toBe('Protein Shake (Banana)');
      expect(result.subtotalAmount).toBe(10.0);
      expect(result.discountTotalAmount).toBe(1.0);
      expect(result.totalAmount).toBe(9.0);
    });

    it('accepts client-supplied id and idempotencyKey and supports idempotent replay', async () => {
      const customId = 'sale_custom_01j987';
      const idemKey = 'idem_key_unique_001';

      const payload = {
        id: customId,
        idempotencyKey: idemKey,
        currency: 'USD',
        sourceReference: {
          type: SaleSourceType.ROOM_RENTAL,
          referenceId: 'room_studio_a',
        },
      };

      const transformed = (await pipe.transform(payload, {
        type: 'body',
        metatype: CreateSaleRequestDto,
      })) as CreateSaleRequestDto;

      const firstResult = await controller.createSale(transformed, undefined, validCashierUser);
      expect(firstResult.id).toBe(customId);

      // Replaying identical request with matching idempotency key must succeed idempotently
      const replayResult = await controller.createSale(transformed, undefined, validCashierUser);
      expect(replayResult.id).toBe(customId);
      expect(replayResult.status).toBe('DRAFT');
    });
  });

  describe('2. Missing Required Fields Rejection', () => {
    it('rejects sourceReference when type is omitted', async () => {
      const payload = {
        sourceReference: {
          referenceId: 'ref_123',
        },
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects sourceReference when referenceId is omitted', async () => {
      const payload = {
        sourceReference: {
          type: SaleSourceType.FOOD,
        },
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects line item when required fields (description, quantity, unitPriceAmount) are missing', async () => {
      const missingDesc = {
        items: [{ quantity: 1, unitPriceAmount: 10 }],
      };
      await expect(
        pipe.transform(missingDesc, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);

      const missingQty = {
        items: [{ description: 'Item A', unitPriceAmount: 10 }],
      };
      await expect(
        pipe.transform(missingQty, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);

      const missingPrice = {
        items: [{ description: 'Item A', quantity: 1 }],
      };
      await expect(
        pipe.transform(missingPrice, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects orderDiscount when required fields (type, value) are missing', async () => {
      const missingType = {
        orderDiscount: { value: 10 },
      };
      await expect(
        pipe.transform(missingType, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);

      const missingVal = {
        orderDiscount: { type: 'PERCENTAGE' },
      };
      await expect(
        pipe.transform(missingVal, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Invalid Identifiers and Source Types Rejection', () => {
    it('rejects whitespace-only id', async () => {
      const payload = {
        id: '   ',
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects whitespace-only clientId', async () => {
      const payload = {
        clientId: '   ',
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects whitespace-only referenceId in sourceReference', async () => {
      const payload = {
        sourceReference: {
          type: SaleSourceType.FOOD,
          referenceId: '   ',
        },
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unsupported source type at DTO boundary', async () => {
      const payload = {
        sourceReference: {
          type: 'UNSUPPORTED_CUSTOM_SOURCE',
          referenceId: 'ref_123',
        },
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('enforces application boundary source validation when invalid source is passed directly to command', async () => {
      const rawInvalidTypeDto = {
        sourceReference: {
          type: 'UNKNOWN_TYPE_RAW' as unknown as SaleSourceType,
          referenceId: 'ref_raw_01',
        },
      } as CreateSaleRequestDto;

      await expect(
        controller.createSale(rawInvalidTypeDto, undefined, validCashierUser),
      ).rejects.toThrow(InvalidSaleSourceException);
    });
  });

  describe('4. Invalid Currency and Unsupported Values Rejection', () => {
    it('rejects malformed ISO-4217 currency strings', async () => {
      const invalidCurrencies = ['US', 'dollars', '123', 'usd', 'USDT', ''];

      for (const cur of invalidCurrencies) {
        await expect(
          pipe.transform(
            { currency: cur },
            {
              type: 'body',
              metatype: CreateSaleRequestDto,
            },
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('rejects negative or zero item quantity', async () => {
      const payload = {
        items: [
          {
            description: 'Item',
            quantity: 0,
            unitPriceAmount: 10,
          },
        ],
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects negative unitPriceAmount', async () => {
      const payload = {
        items: [
          {
            description: 'Item',
            quantity: 1,
            unitPriceAmount: -5,
          },
        ],
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects negative discount value', async () => {
      const payload = {
        orderDiscount: {
          type: 'PERCENTAGE',
          value: -15,
        },
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('5. Calculated Financial Fields Injection Prevention', () => {
    it('strictly forbids injection of subtotal in CreateSale payload', async () => {
      const payload = {
        subtotal: 100.0,
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('strictly forbids injection of discountTotal in CreateSale payload', async () => {
      const payload = {
        discountTotal: 50.0,
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('strictly forbids injection of total or totalAmount in CreateSale payload', async () => {
      const payload1 = { total: 200.0 };
      await expect(
        pipe.transform(payload1, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);

      const payload2 = { totalAmount: 200.0 };
      await expect(
        pipe.transform(payload2, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);

      const payload3 = { subtotalAmount: 100.0, discountTotalAmount: 10.0 };
      await expect(
        pipe.transform(payload3, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('strictly forbids injection of calculated lineTotal in item payload', async () => {
      const payload = {
        items: [
          {
            description: 'Item',
            quantity: 1,
            unitPriceAmount: 20,
            lineTotal: 0,
          },
        ],
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: CreateSaleRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('6. Lifecycle Status and Payment/Receipt Injection Prevention', () => {
    it('strictly forbids client from specifying privileged lifecycle status', async () => {
      const statuses = ['PAID', 'COMPLETED', 'CANCELLED', 'PENDING_PAYMENT', 'DRAFT'];

      for (const st of statuses) {
        await expect(
          pipe.transform(
            { status: st },
            {
              type: 'body',
              metatype: CreateSaleRequestDto,
            },
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('strictly forbids injection of Payment fields in CreateSale request', async () => {
      const paymentInjections = [
        { paymentId: 'pay_12345' },
        { paymentStatus: 'COMPLETED' },
        { paymentMethod: 'CASH' },
        { payment: { amount: 50 } },
        { payments: [] },
      ];

      for (const inj of paymentInjections) {
        await expect(
          pipe.transform(inj, {
            type: 'body',
            metatype: CreateSaleRequestDto,
          }),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('strictly forbids injection of Receipt fields in CreateSale request', async () => {
      const receiptInjections = [
        { receiptId: 'rcpt_12345' },
        { receiptNumber: 'REC-2026-0001' },
        { receiptStatus: 'ISSUED' },
        { receipt: { taxAmount: 5 } },
        { receipts: [] },
      ];

      for (const inj of receiptInjections) {
        await expect(
          pipe.transform(inj, {
            type: 'body',
            metatype: CreateSaleRequestDto,
          }),
        ).rejects.toThrow(BadRequestException);
      }
    });
  });

  describe('7. Authorization and Tenant Isolation Enforcement', () => {
    it('declares AuthenticationGuard and AuthorizationGuard at controller level', () => {
      const guards = Reflect.getMetadata('__guards__', SalesController);
      expect(guards).toBeDefined();
      expect(guards).toContain(AuthenticationGuard);
      expect(guards).toContain(AuthorizationGuard);
    });

    it('binds sales.create permission and authorized roles to createSale endpoint', () => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        SalesController.prototype.createSale,
      );
      expect(permissions).toContain('sales.create');

      const roles = reflector.get<string[]>(ROLES_KEY, SalesController.prototype.createSale);
      expect(roles).toEqual(
        expect.arrayContaining(['Owner', 'Manager', 'Receptionist', 'Kitchen Staff']),
      );
      expect(roles).not.toContain('Client');
    });

    it('rejects creation when caller lacks sales.create permission at application layer', async () => {
      const unauthorizedUser: AuthenticatedUserPayload = {
        id: 'user_unauthorized',
        email: 'user@example.com',
        status: 'ACTIVE',
        roles: ['Client'],
        permissions: ['sales.read'], // Missing sales.create
        tenantId: 'tenant_main',
      };

      await expect(
        controller.createSale({ currency: 'USD' }, undefined, unauthorizedUser),
      ).rejects.toThrow(SaleUnauthorizedException);
    });

    it('rejects cross-tenant creation attempt violating tenant boundary isolation', async () => {
      const userTenantA: AuthenticatedUserPayload = {
        id: 'user_tenant_a',
        email: 'a@example.com',
        status: 'ACTIVE',
        roles: ['Manager'],
        permissions: ['sales.create'],
        tenantId: 'tenant_a',
      };

      const command = new CreateSaleCommand({
        currency: 'USD',
        tenantId: 'tenant_b', // Cross-tenant spoofing attempt
        currentUser: {
          id: userTenantA.id,
          roles: userTenantA.roles,
          permissions: userTenantA.permissions,
          tenantId: userTenantA.tenantId,
        },
      });

      const result = await createSaleHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
    });
  });

  describe('8. Existing Sale Invariants Enforcement', () => {
    it('always initializes aggregate root strictly in DRAFT status with version 1', async () => {
      const result = await controller.createSale({ currency: 'USD' }, undefined, validCashierUser);

      expect(result.status).toBe('DRAFT');
      expect(result.version).toBe(1);

      const saved = await repository.findById(result.id);
      expect(saved?.status).toBe('DRAFT');
      expect(saved?.version).toBe(1);
    });

    it('enforces single-active-billing invariant: rejects duplicate active checkout on clinical session', async () => {
      const clinicalPayload = {
        currency: 'USD',
        sourceReference: {
          type: SaleSourceType.KINESIOLOGY_SESSION,
          referenceId: 'kinesiology_session_101',
        },
      };

      const first = await controller.createSale(clinicalPayload, undefined, validCashierUser);
      expect(first.id).toBeDefined();

      // Second checkout attempt on same clinical session must fail with ConflictException (409)
      await expect(
        controller.createSale(clinicalPayload, undefined, validCashierUser),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects duplicate sale ID collision with conflicting transaction parameters', async () => {
      const duplicateId = 'sale_idem_collision_01';

      await controller.createSale(
        {
          id: duplicateId,
          currency: 'USD',
          sourceReference: {
            type: SaleSourceType.FOOD,
            referenceId: 'food_1',
          },
        },
        undefined,
        validCashierUser,
      );

      // Attempting to reuse same ID with different source or currency yields ConflictException (409)
      await expect(
        controller.createSale(
          {
            id: duplicateId,
            currency: 'EUR', // conflicting currency
            sourceReference: {
              type: SaleSourceType.FOOD,
              referenceId: 'food_1',
            },
          },
          undefined,
          validCashierUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects non-existent client ID with NotFoundException (404)', async () => {
      const unknownClientPayload = {
        clientId: 'client_non_existent_404',
        currency: 'USD',
      };

      await expect(
        controller.createSale(unknownClientPayload, undefined, validCashierUser),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
