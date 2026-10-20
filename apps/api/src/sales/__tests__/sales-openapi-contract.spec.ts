import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  SaleRepositoryInterface,
  ListSalesHandler,
  CreateSaleHandler,
  GetSaleByIdHandler,
  AddSaleItemHandler,
  RemoveSaleItemHandler,
  ApplyOrderDiscountHandler,
  RemoveOrderDiscountHandler,
  FinalizeSaleHandler,
  CancelSaleHandler,
  AssignSaleSourceHandler,
  CalculateSaleHandler,
} from '@kinergy-platform/core';
import { SalesController } from '../controllers/sales.controller';
import { SALE_REPOSITORY_TOKEN, PAYMENT_REPOSITORY_TOKEN } from '../sales.tokens';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';

describe('Sales API OpenAPI / Swagger Contract Verification', () => {
  let app: INestApplication;
  let openApiDoc: ReturnType<typeof SwaggerModule.createDocument>;

  beforeAll(async () => {
    const mockSaleRepo: SaleRepositoryInterface = {
      findById: jest.fn(),
      save: jest.fn(),
      findMany: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SalesController],
      providers: [
        {
          provide: SALE_REPOSITORY_TOKEN,
          useValue: mockSaleRepo,
        },
        {
          provide: PAYMENT_REPOSITORY_TOKEN,
          useValue: { findById: jest.fn(), findBySaleId: jest.fn(), save: jest.fn() },
        },
        {
          provide: CreateSaleHandler,
          useFactory: (repo: SaleRepositoryInterface) => new CreateSaleHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: GetSaleByIdHandler,
          useFactory: (repo: SaleRepositoryInterface) => new GetSaleByIdHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: ListSalesHandler,
          useFactory: (repo: SaleRepositoryInterface) => new ListSalesHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: AddSaleItemHandler,
          useFactory: (repo: SaleRepositoryInterface) => new AddSaleItemHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: RemoveSaleItemHandler,
          useFactory: (repo: SaleRepositoryInterface) => new RemoveSaleItemHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: ApplyOrderDiscountHandler,
          useFactory: (repo: SaleRepositoryInterface) => new ApplyOrderDiscountHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: RemoveOrderDiscountHandler,
          useFactory: (repo: SaleRepositoryInterface) => new RemoveOrderDiscountHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: FinalizeSaleHandler,
          useFactory: (repo: SaleRepositoryInterface) => new FinalizeSaleHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: CancelSaleHandler,
          useFactory: (repo: SaleRepositoryInterface) => new CancelSaleHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: AssignSaleSourceHandler,
          useFactory: (repo: SaleRepositoryInterface) => new AssignSaleSourceHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: CalculateSaleHandler,
          useFactory: (repo: SaleRepositoryInterface) => new CalculateSaleHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();

    const swaggerConfig = new DocumentBuilder()
      .setTitle('Kinergy Platform API')
      .setDescription('Kinergy Health, Wellness, Gym, and Clinic Management Platform API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    openApiDoc = SwaggerModule.createDocument(app, swaggerConfig);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. OpenAPI Document Generation & Core Metadata', () => {
    it('generates valid OpenAPI 3.0 document with title and version', () => {
      expect(openApiDoc).toBeDefined();
      expect(openApiDoc.openapi).toMatch(/^3\./);
      expect(openApiDoc.info.title).toBe('Kinergy Platform API');
      expect(openApiDoc.info.version).toBe('1.0');
    });

    it('declares Bearer Authentication security scheme', () => {
      expect(openApiDoc.components?.securitySchemes).toBeDefined();
      const securitySchemes = openApiDoc.components?.securitySchemes as
        Record<string, { type: string; scheme: string }> | undefined;
      expect(securitySchemes?.['bearer']).toBeDefined();
      expect(securitySchemes?.['bearer']?.type).toBe('http');
      expect(securitySchemes?.['bearer']?.scheme).toBe('bearer');
    });
  });

  describe('2. Sales Endpoint Path Coverage & HTTP Methods', () => {
    it('registers all 12 commercial sales endpoints in OpenAPI paths', () => {
      const paths = openApiDoc.paths;

      // Collection endpoints
      expect(paths['/api/v1/sales']).toBeDefined();
      expect(paths['/api/v1/sales']?.post).toBeDefined(); // createSale
      expect(paths['/api/v1/sales']?.get).toBeDefined(); // listSales

      // Individual sale resource endpoints
      expect(paths['/api/v1/sales/{id}']).toBeDefined();
      expect(paths['/api/v1/sales/{id}']?.get).toBeDefined(); // getSale

      // Calculation endpoint
      expect(paths['/api/v1/sales/{id}/calculate']).toBeDefined();
      expect(paths['/api/v1/sales/{id}/calculate']?.get).toBeDefined(); // calculateSale

      // Source origin binding
      expect(paths['/api/v1/sales/{id}/source']).toBeDefined();
      expect(paths['/api/v1/sales/{id}/source']?.post).toBeDefined(); // assignSource

      // Line item management
      expect(paths['/api/v1/sales/{id}/items']).toBeDefined();
      expect(paths['/api/v1/sales/{id}/items']?.post).toBeDefined(); // addItem
      expect(paths['/api/v1/sales/{id}/items/{itemId}']).toBeDefined();
      expect(paths['/api/v1/sales/{id}/items/{itemId}']?.delete).toBeDefined(); // removeItem

      // Order discount management
      expect(paths['/api/v1/sales/{id}/discount']).toBeDefined();
      expect(paths['/api/v1/sales/{id}/discount']?.post).toBeDefined(); // applyDiscount
      expect(paths['/api/v1/sales/{id}/discount']?.delete).toBeDefined(); // removeDiscount

      // Lifecycle transitions
      expect(paths['/api/v1/sales/{id}/finalize']).toBeDefined();
      expect(paths['/api/v1/sales/{id}/finalize']?.post).toBeDefined(); // finalizeSale
      expect(paths['/api/v1/sales/{id}/cancel']).toBeDefined();
      expect(paths['/api/v1/sales/{id}/cancel']?.post).toBeDefined(); // cancelSale

      // Coordinated payment
      expect(paths['/api/v1/sales/{id}/coordinate-payment']).toBeDefined();
      expect(paths['/api/v1/sales/{id}/coordinate-payment']?.post).toBeDefined(); // coordinatePayment
    });

    it('tags every sales route with "Sales"', () => {
      const paths = openApiDoc.paths;
      for (const [pathKey, pathItem] of Object.entries(paths)) {
        if (pathKey.startsWith('/api/v1/sales')) {
          for (const operation of Object.values(pathItem as Record<string, { tags?: string[] }>)) {
            if (operation && typeof operation === 'object' && operation.tags) {
              expect(operation.tags).toContain('Sales');
            }
          }
        }
      }
    });
  });

  describe('3. Query Parameters Schema Documentation on GET /api/v1/sales', () => {
    it('documents search, pagination, sort, and domain filter query parameters', () => {
      const listSalesOp = openApiDoc.paths['/api/v1/sales']?.get;
      expect(listSalesOp).toBeDefined();

      const params = (listSalesOp?.parameters ?? []) as Array<{
        name: string;
        in: string;
        required?: boolean;
      }>;
      const paramNames = params.map((p) => p.name);

      expect(paramNames).toContain('page');
      expect(paramNames).toContain('limit');
      expect(paramNames).toContain('q');
      expect(paramNames).toContain('search');
      expect(paramNames).toContain('clientId');
      expect(paramNames).toContain('status');
      expect(paramNames).toContain('sourceType');
      expect(paramNames).toContain('sourceReferenceId');
      expect(paramNames).toContain('fromDate');
      expect(paramNames).toContain('toDate');
      expect(paramNames).toContain('dateFrom');
      expect(paramNames).toContain('dateTo');
      expect(paramNames).toContain('sort');
      expect(paramNames).toContain('sortField');
      expect(paramNames).toContain('sortDirection');
    });
  });

  describe('4. Schema Definitions in OpenAPI Components', () => {
    it('registers essential request and response DTO schemas', () => {
      const schemas = openApiDoc.components?.schemas as Record<string, unknown>;
      expect(schemas).toBeDefined();

      expect(schemas['CreateSaleRequestDto']).toBeDefined();
      expect(schemas['SaleResponseDto']).toBeDefined();
      expect(schemas['PaginatedSalesResponseDto']).toBeDefined();
      expect(schemas['SaleSummaryResponseDto']).toBeDefined();
      expect(schemas['SaleTotalsResponseDto']).toBeDefined();
      expect(schemas['AddSaleItemRequestDto']).toBeDefined();
      expect(schemas['SaleItemResponseDto']).toBeDefined();
      expect(schemas['ApplySaleDiscountRequestDto']).toBeDefined();
      expect(schemas['CancelSaleRequestDto']).toBeDefined();
      expect(schemas['CoordinateSalePaymentRequestDto']).toBeDefined();
      expect(schemas['SourceReferenceInputDto']).toBeDefined();
      expect(schemas['SaleSourceResponseDto']).toBeDefined();
      expect(schemas['MoneyResponseDto']).toBeDefined();
    });

    it('MoneyResponseDto schema accurately documents precision, format, and integer cents', () => {
      const schemas = openApiDoc.components?.schemas as Record<
        string,
        { properties?: Record<string, { type?: string; description?: string }> }
      >;
      const moneySchema = schemas['MoneyResponseDto'];
      expect(moneySchema).toBeDefined();
      expect(moneySchema?.properties?.['amount']).toBeDefined();
      expect(moneySchema?.properties?.['currency']).toBeDefined();
      expect(moneySchema?.properties?.['formatted']).toBeDefined();
      expect(moneySchema?.properties?.['cents']).toBeDefined();
    });
  });
});
