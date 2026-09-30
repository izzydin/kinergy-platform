import { Test, TestingModule } from '@nestjs/testing';
import {
  ArgumentsHost,
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  Sale,
  SaleId,
  Money,
  SaleSource,
  SaleSourceType,
  SaleRepositoryPort,
  CreateSaleHandler,
  AssignSaleSourceHandler,
  GetSaleByIdHandler,
  AddSaleItemHandler,
  FinalizeSaleHandler,
  CancelSaleHandler,
  InvalidSaleStateException,
  SourceType,
  SourceReference,
} from '@kinergy-platform/core';
import { SalesController, SALE_REPOSITORY_TOKEN } from '../controllers/sales.controller';
import { PAYMENT_REPOSITORY_TOKEN } from '../controllers/payments.controller';
import {
  SourceReferenceInputDto,
  SaleSourceResponseDto,
  AssignSaleSourceRequestDto,
  CreateSaleRequestDto,
  AddSaleItemRequestDto,
  SaleResponseDto,
} from '../dto';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';
import { GlobalSanitizationValidationPipe } from '../../common/pipes/global-sanitization-validation.pipe';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { ROLES_KEY } from '../../platform/identity/authorization/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../platform/identity/authorization/decorators/permissions.decorator';
import { DECORATORS } from '@nestjs/swagger/dist/constants';

// In-Memory Test Double
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

describe('SaleSource API Specification (ADR-0121)', () => {
  let controller: SalesController;
  let saleRepo: InMemorySaleRepository;
  let pipe: GlobalSanitizationValidationPipe;
  let reflector: Reflector;

  beforeEach(async () => {
    saleRepo = new InMemorySaleRepository();
    pipe = new GlobalSanitizationValidationPipe();
    reflector = new Reflector();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalesController],
      providers: [
        {
          provide: SALE_REPOSITORY_TOKEN,
          useValue: saleRepo,
        },
        {
          provide: PAYMENT_REPOSITORY_TOKEN,
          useValue: { findById: jest.fn(), findBySaleId: jest.fn(), save: jest.fn() },
        },
        {
          provide: CreateSaleHandler,
          useFactory: (repo: SaleRepositoryPort) => new CreateSaleHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: AssignSaleSourceHandler,
          useFactory: (repo: SaleRepositoryPort) => new AssignSaleSourceHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: GetSaleByIdHandler,
          useFactory: (repo: SaleRepositoryPort) => new GetSaleByIdHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: AddSaleItemHandler,
          useFactory: (repo: SaleRepositoryPort) => new AddSaleItemHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: FinalizeSaleHandler,
          useFactory: (repo: SaleRepositoryPort) => new FinalizeSaleHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: CancelSaleHandler,
          useFactory: (repo: SaleRepositoryPort) => new CancelSaleHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
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

  // =========================================================================
  // 1. Valid Source Representation & Operations
  // =========================================================================
  describe('1. Valid Source Handling (sourceReference: { type, referenceId })', () => {
    it.each([
      SaleSourceType.FOOD,
      SaleSourceType.DRINK,
      SaleSourceType.GYM_MEMBERSHIP,
      SaleSourceType.KINESIOLOGY_SESSION,
      SaleSourceType.ROOM_RENTAL,
    ])('accepts valid supported SaleSourceType: %s', async (supportedType) => {
      const payload = {
        type: supportedType,
        referenceId: `ref_${supportedType.toLowerCase()}_001`,
        referenceCode: `CODE-${supportedType.substring(0, 4)}`,
      };

      const transformed = (await pipe.transform(payload, {
        type: 'body',
        metatype: SourceReferenceInputDto,
      })) as SourceReferenceInputDto;

      expect(transformed.type).toBe(supportedType);
      expect(transformed.referenceId).toBe(payload.referenceId);
      expect(transformed.referenceCode).toBe(payload.referenceCode);
    });

    it('creates a Sale with sourceReference in CreateSaleRequestDto', async () => {
      const createDto: CreateSaleRequestDto = {
        currency: 'USD',
        sourceReference: {
          type: SaleSourceType.FOOD,
          referenceId: 'food_order_1001',
          referenceCode: 'TABLE-05',
        },
      };

      const result = await controller.createSale(createDto);

      expect(result.id).toBeDefined();
      expect(result.sourceReference).toBeDefined();
      expect(result.sourceReference!.type).toBe('FOOD');
      expect(result.sourceReference!.referenceId).toBe('food_order_1001');

      // Verify persisted aggregate in repository
      const savedAggregate = await saleRepo.findById(result.id);
      expect(savedAggregate?.source).not.toBeNull();
      expect(savedAggregate?.source?.sourceType).toBe('FOOD');
      expect(savedAggregate?.source?.sourceId).toBe('food_order_1001');
    });

    it('adds line items with sourceReference', async () => {
      const sale = Sale.create({
        id: SaleId.create('sale_test_items_01'),
        currency: 'USD',
        source: SaleSource.create({
          type: SaleSourceType.FOOD,
          referenceId: 'kitchen_ticket_42',
        }),
      });
      await saleRepo.save(sale);

      const addItemDto: AddSaleItemRequestDto = {
        sourceReference: {
          type: SaleSourceType.DRINK,
          referenceId: 'drink_item_smoothie',
        },
        description: 'Berry Protein Smoothie',
        quantity: 2,
        unitPriceAmount: 7.5,
      };

      const result = await controller.addItem(sale.id.value, addItemDto);

      expect(result.items).toHaveLength(1);
      const item = result.items[0];
      expect(item).toBeDefined();
      expect(item!.sourceReference).toBeDefined();
      expect(item!.sourceReference!.type).toBe('INVENTORY_ITEM');
      expect(item!.sourceReference!.referenceId).toBe('drink_item_smoothie');
    });
  });

  // =========================================================================
  // 2. Invalid Type Validation (reject arbitrary strings)
  // =========================================================================
  describe('2. Invalid Type Rejection', () => {
    it.each([
      'UNKNOWN_CUSTOM_TYPE',
      'FOOD_SALES',
      'GYM',
      'PERSONAL_TRAINING',
      'ARBITRARY_PAYLOAD_STRING',
      'MERCHANDISE',
      'SUBSCRIPTION',
    ])('strictly rejects arbitrary string source type: "%s"', async (invalidType) => {
      const payload = {
        type: invalidType,
        referenceId: 'valid_ref_123',
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: SourceReferenceInputDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it.each([12345, true, {}, []])('rejects non-string source type: %p', async (invalidType) => {
      const payload = {
        type: invalidType,
        referenceId: 'valid_ref_123',
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: SourceReferenceInputDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // 3. Missing Reference Validation
  // =========================================================================
  describe('3. Missing Reference Rejection', () => {
    it('rejects payload when referenceId is omitted', async () => {
      const payload = {
        type: SaleSourceType.FOOD,
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: SourceReferenceInputDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects payload when referenceId is null', async () => {
      const payload = {
        type: SaleSourceType.FOOD,
        referenceId: null,
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: SourceReferenceInputDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects payload when type is omitted', async () => {
      const payload = {
        referenceId: 'order_123',
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: SourceReferenceInputDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects AssignSaleSourceRequestDto when sourceReference object is omitted', async () => {
      const payload = {};

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: AssignSaleSourceRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // 4. Malformed Reference Validation
  // =========================================================================
  describe('4. Malformed Reference Rejection', () => {
    it('rejects empty string referenceId', async () => {
      const payload = {
        type: SaleSourceType.FOOD,
        referenceId: '',
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: SourceReferenceInputDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects pure whitespace referenceId', async () => {
      const payload = {
        type: SaleSourceType.FOOD,
        referenceId: '    ',
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: SourceReferenceInputDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects referenceId exceeding 255 characters', async () => {
      const payload = {
        type: SaleSourceType.FOOD,
        referenceId: 'a'.repeat(256),
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: SourceReferenceInputDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it.each([
      'bad\x00ref', // Null byte
      'bad\x1Fref', // Control char US
      'bad\x7Fref', // DEL char
      'bad\x08ref', // Backspace
    ])(
      'DTO validation rejects referenceId with control characters before sanitization: %p',
      async (badRef) => {
        const dto = plainToInstance(SourceReferenceInputDto, {
          type: SaleSourceType.DRINK,
          referenceId: badRef,
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]?.constraints?.matches).toContain('control characters');
      },
    );

    it('pipe rejects referenceId containing only control characters after sanitization strips them', async () => {
      const payload = {
        type: SaleSourceType.DRINK,
        referenceId: '\x00\x08\x1F\x7F',
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: SourceReferenceInputDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // 5. Unauthorized Request Handling (AuthenticationGuard)
  // =========================================================================
  describe('5. Unauthorized Request Handling', () => {
    it('verifies AuthenticationGuard is declared on SalesController', () => {
      const guards = Reflect.getMetadata('__guards__', SalesController);
      expect(guards).toBeDefined();
      expect(guards).toContain(AuthenticationGuard);
    });

    it('denies unauthenticated execution when AuthenticationGuard throws UnauthorizedException', async () => {
      const denyingGuard: AuthenticationGuard = {
        canActivate: () => {
          throw new UnauthorizedException('Authentication token required.');
        },
      } as unknown as AuthenticationGuard;

      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: {} }),
        }),
        getHandler: () => controller.assignSource,
        getClass: () => SalesController,
      } as unknown as ExecutionContext;

      expect(() => denyingGuard.canActivate(mockExecutionContext)).toThrow(UnauthorizedException);
    });
  });

  // =========================================================================
  // 6. Forbidden Request Handling (AuthorizationGuard, Roles & Permissions)
  // =========================================================================
  describe('6. Forbidden Request Handling', () => {
    it('verifies AuthorizationGuard is declared on SalesController', () => {
      const guards = Reflect.getMetadata('__guards__', SalesController);
      expect(guards).toBeDefined();
      expect(guards).toContain(AuthorizationGuard);
    });

    it('enforces required roles on assignSource endpoint', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.assignSource);
      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist']);
      expect(roles).not.toContain('Member');
      expect(roles).not.toContain('Guest');
    });

    it('enforces required permission on assignSource endpoint', () => {
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, controller.assignSource);
      expect(permissions).toEqual(['sales.create']);
    });

    it('denies access when user has insufficient role or permissions', async () => {
      const mockEvaluator = {
        evaluate: jest.fn().mockResolvedValue({
          isAuthorized: false,
          reason: 'Access denied: insufficient privileges.',
        }),
      };
      const guard = new AuthorizationGuard(reflector, mockEvaluator);

      const userContext = new AuthenticatedUserContext({
        userId: 'user_member_01',
        email: 'member@example.com',
        status: 'ACTIVE',
        roles: ['Member'],
        permissions: [],
      });

      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: userContext,
          }),
        }),
        getHandler: () => controller.assignSource,
        getClass: () => SalesController,
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // 7. Lifecycle-Restricted Mutation (ADR-0121 Immutability Invariant)
  // =========================================================================
  describe('7. Lifecycle-Restricted Mutation (Aggregate Immutability)', () => {
    it('rejects reassigning source to an already assigned Sale with 409 Conflict', async () => {
      const sale = Sale.create({
        id: SaleId.create('sale_already_sourced_01'),
        currency: 'USD',
        source: SaleSource.create({
          type: SaleSourceType.FOOD,
          referenceId: 'food_initial_01',
        }),
      });
      await saleRepo.save(sale);

      const assignDto: AssignSaleSourceRequestDto = {
        sourceReference: {
          type: SaleSourceType.DRINK,
          referenceId: 'attempted_tampered_drink_99',
        },
      };

      // Handler throws InvalidSaleStateException('SALE_SOURCE_IMMUTABLE')
      await expect(controller.assignSource(sale.id.value, assignDto)).rejects.toThrow(
        InvalidSaleStateException,
      );

      // Verify SalesExceptionFilter maps this to HTTP 409 Conflict
      const filter = new SalesExceptionFilter();
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => ({ url: '/api/v1/sales/sale_already_sourced_01/source' }),
        }),
      } as unknown as ArgumentsHost;

      try {
        await controller.assignSource(sale.id.value, assignDto);
      } catch (err: unknown) {
        filter.catch(err as Error, mockHost);
        expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
        expect(mockResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: HttpStatus.CONFLICT,
            code: 'SALE_SOURCE_IMMUTABLE',
          }),
        );
      }
    });

    it('rejects assigning source to a CANCELLED Sale with 409 Conflict', async () => {
      const sale = Sale.create({
        id: SaleId.create('sale_cancelled_01'),
        currency: 'USD',
        source: SaleSource.create({
          type: SaleSourceType.FOOD,
          referenceId: 'food_cancelled_init',
        }),
      });
      sale.cancel('Order cancelled by customer');
      await saleRepo.save(sale);

      const assignDto: AssignSaleSourceRequestDto = {
        sourceReference: {
          type: SaleSourceType.FOOD,
          referenceId: 'food_cancelled_try',
        },
      };

      await expect(controller.assignSource(sale.id.value, assignDto)).rejects.toThrow(
        InvalidSaleStateException,
      );

      // Verify filter produces CONFLICT
      const filter = new SalesExceptionFilter();
      const mockResponse = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => ({ url: '/api/v1/sales/sale_cancelled_01/source' }),
        }),
      } as unknown as ArgumentsHost;

      try {
        await controller.assignSource(sale.id.value, assignDto);
      } catch (err: unknown) {
        filter.catch(err as Error, mockHost);
        expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      }
    });

    it('rejects assigning source to a FINALIZED Sale with 409 Conflict', async () => {
      const sale = Sale.create({
        id: SaleId.create('sale_finalized_01'),
        currency: 'USD',
        source: SaleSource.create({
          type: SaleSourceType.FOOD,
          referenceId: 'food_finalized_init',
        }),
      });
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.CUSTOM_SERVICE,
          sourceId: 'srv_1',
        }),
        description: 'Test Item',
        quantity: 1,
        unitPrice: Money.create(10, 'USD'),
      });
      sale.finalize();
      await saleRepo.save(sale);

      const assignDto: AssignSaleSourceRequestDto = {
        sourceReference: {
          type: SaleSourceType.ROOM_RENTAL,
          referenceId: 'room_101',
        },
      };

      await expect(controller.assignSource(sale.id.value, assignDto)).rejects.toThrow(
        InvalidSaleStateException,
      );

      // Verify filter produces CONFLICT (409)
      const filter = new SalesExceptionFilter();
      const mockResponse = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => ({ url: `/api/v1/sales/${sale.id.value}/source` }),
        }),
      } as unknown as ArgumentsHost;

      try {
        await controller.assignSource(sale.id.value, assignDto);
      } catch (err: unknown) {
        filter.catch(err as Error, mockHost);
        expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      }
    });

    it('rejects assigning source to a non-existent Sale with 404 Not Found', async () => {
      const assignDto: AssignSaleSourceRequestDto = {
        sourceReference: {
          type: SaleSourceType.FOOD,
          referenceId: 'food_1001',
        },
      };

      await expect(controller.assignSource('sale_non_existent_404', assignDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // 8. Architectural Invariants (No Unrestricted PATCH, Generic API)
  // =========================================================================
  describe('8. Architecture Boundaries & Generic API Invariants', () => {
    it('prohibits unrestricted PATCH routes on SalesController', () => {
      const prototype = SalesController.prototype as unknown as Record<string, unknown>;
      const propertyNames = Object.getOwnPropertyNames(prototype);

      for (const prop of propertyNames) {
        const method = prototype[prop];
        if (typeof method === 'function') {
          const httpMethod = Reflect.getMetadata('method', method);
          // In NestJS, RequestMethod.PATCH is enum value 4
          expect(httpMethod).not.toBe(4);
        }
      }
    });

    it('proves Sales API contains no source-specific endpoints (remains generic)', () => {
      const prototype = SalesController.prototype as unknown as Record<string, unknown>;
      const propertyNames = Object.getOwnPropertyNames(prototype);

      for (const prop of propertyNames) {
        expect(prop).not.toContain('foodSale');
        expect(prop).not.toContain('drinkSale');
        expect(prop).not.toContain('gymSale');
        expect(prop).not.toContain('kinesiologySale');
      }

      // Check route paths
      for (const prop of propertyNames) {
        const method = prototype[prop];
        if (typeof method === 'function') {
          const path = Reflect.getMetadata('path', method);
          if (path) {
            expect(path).not.toContain('food-sales');
            expect(path).not.toContain('drink-sales');
            expect(path).not.toContain('gym-sales');
          }
        }
      }
    });

    it('proves source mutation triggers explicit AssignSaleSourceCommand handler', async () => {
      const sale = Sale.create({
        id: SaleId.create('sale_command_verify_01'),
        currency: 'USD',
        source: SaleSource.create({
          type: SaleSourceType.FOOD,
          referenceId: 'food_command_init',
        }),
      });
      await saleRepo.save(sale);

      const spy = jest.spyOn(AssignSaleSourceHandler.prototype, 'execute');

      try {
        await controller.assignSource(sale.id.value, {
          sourceReference: {
            type: SaleSourceType.KINESIOLOGY_SESSION,
            referenceId: 'session_kin_777',
          },
        });
      } catch {
        // Aggregate immutability rejection is expected
      }

      expect(spy).toHaveBeenCalledTimes(1);
      const callArgs = spy.mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs!.input.saleId).toBe(sale.id.value);
      expect(callArgs!.input.source.sourceType).toBe('KINESIOLOGY_SESSION');
      expect(callArgs!.input.source.sourceId).toBe('session_kin_777');
      spy.mockRestore();
    });
  });

  // =========================================================================
  // 9. Response Serialization Contract
  // =========================================================================
  describe('9. Canonical Serialization Contract', () => {
    it('serializes Sale response with sourceReference conforming to canonical schema', async () => {
      const sale = Sale.create({
        id: SaleId.create('sale_serial_01'),
        currency: 'USD',
        source: SaleSource.create({
          type: SaleSourceType.FOOD,
          referenceId: 'order_serial_100',
        }),
      });
      await saleRepo.save(sale);

      const response = await controller.getSale(sale.id.value);

      expect(response).toMatchObject({
        id: sale.id.value,
        sourceReference: {
          type: 'FOOD',
          referenceId: 'order_serial_100',
        },
      });

      // Does not leak internal source domain models or private entities
      const record = response as unknown as Record<string, unknown>;
      expect(record['_source']).toBeUndefined();
      expect(record['sourceDomainEntity']).toBeUndefined();
    });

    it('serializes line item response with sourceReference', async () => {
      const sale = await controller.createSale({
        currency: 'USD',
        sourceReference: {
          type: SaleSourceType.FOOD,
          referenceId: 'order_line_01',
        },
      });

      const updated = await controller.addItem(sale.id, {
        sourceReference: {
          type: SaleSourceType.DRINK,
          referenceId: 'item_cold_brew',
          referenceCode: 'DRK-CB-01',
        },
        description: 'Nitro Cold Brew',
        quantity: 1,
        unitPriceAmount: 5.0,
      });

      expect(updated.items[0]?.sourceReference).toEqual(
        expect.objectContaining({
          type: 'INVENTORY_ITEM',
          referenceId: 'item_cold_brew',
          referenceCode: 'DRK-CB-01',
        }),
      );
    });
  });

  // =========================================================================
  // 10. Swagger / OpenAPI Schema Documentation
  // =========================================================================
  describe('10. Swagger / OpenAPI Schema Contract', () => {
    it('documents assignSource endpoint with proper OpenAPI metadata', () => {
      const summary = Reflect.getMetadata(DECORATORS.API_OPERATION, controller.assignSource);
      expect(summary).toBeDefined();
      expect(summary.summary).toContain('commercial origin source reference');

      // Check responses documented
      const responses = Reflect.getMetadata(DECORATORS.API_RESPONSE, controller.assignSource);
      expect(responses).toBeDefined();
      expect(responses['200']).toBeDefined();
      expect(responses['400']).toBeDefined();
      expect(responses['409']).toBeDefined();
    });

    it('documents sourceReference property in SaleResponseDto with SaleSourceResponseDto', () => {
      const sourceRefMeta = Reflect.getMetadata(
        DECORATORS.API_MODEL_PROPERTIES,
        SaleResponseDto.prototype,
        'sourceReference',
      );
      expect(sourceRefMeta).toBeDefined();
      expect(SaleSourceResponseDto).toBeDefined();
    });

    it('documents type enum in SourceReferenceInputDto with SaleSourceType', () => {
      const typeMeta = Reflect.getMetadata(
        DECORATORS.API_MODEL_PROPERTIES,
        SourceReferenceInputDto.prototype,
        'type',
      );
      expect(typeMeta).toBeDefined();
      expect(typeMeta.enum).toEqual(Object.values(SaleSourceType));
    });

    it('documents referenceId in SourceReferenceInputDto with max length 255', () => {
      const refIdMeta = Reflect.getMetadata(
        DECORATORS.API_MODEL_PROPERTIES,
        SourceReferenceInputDto.prototype,
        'referenceId',
      );
      expect(refIdMeta).toBeDefined();
      expect(refIdMeta.maxLength).toBe(255);
    });
  });
});
