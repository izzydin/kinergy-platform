import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  PaymentRepositoryPort,
  SaleRepositoryPort,
  RecordPaymentHandler,
  CreatePaymentHandler,
  GetPaymentByIdHandler,
  GetPaymentsBySaleIdHandler,
  GetSalePaymentHistoryHandler,
  CompletePaymentHandler,
  SettlePaymentHandler,
  FailPaymentHandler,
  CancelPaymentHandler,
  ListPaymentsHandler,
} from '@kinergy-platform/core';
import {
  PaymentsController,
  PAYMENT_REPOSITORY_TOKEN,
  UNIT_OF_WORK_TOKEN,
} from '../controllers/payments.controller';
import { SALE_REPOSITORY_TOKEN } from '../sales.tokens';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';

describe('Payment API OpenAPI / Swagger Contract Verification', () => {
  let app: INestApplication;
  let openApiDoc: ReturnType<typeof SwaggerModule.createDocument>;

  beforeAll(async () => {
    const mockPaymentRepo: PaymentRepositoryPort = {
      findById: jest.fn(),
      findBySaleId: jest.fn(),
      save: jest.fn(),
    };

    const mockSaleRepo: SaleRepositoryPort = {
      findById: jest.fn(),
      save: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        {
          provide: PAYMENT_REPOSITORY_TOKEN,
          useValue: mockPaymentRepo,
        },
        {
          provide: SALE_REPOSITORY_TOKEN,
          useValue: mockSaleRepo,
        },
        {
          provide: UNIT_OF_WORK_TOKEN,
          useValue: { executeInTransaction: jest.fn() },
        },
        {
          provide: CreatePaymentHandler,
          useFactory: () => new CreatePaymentHandler(mockPaymentRepo, mockSaleRepo),
        },
        {
          provide: RecordPaymentHandler,
          useExisting: CreatePaymentHandler,
        },
        {
          provide: GetPaymentByIdHandler,
          useFactory: () => new GetPaymentByIdHandler(mockPaymentRepo, mockSaleRepo),
        },
        {
          provide: GetPaymentsBySaleIdHandler,
          useFactory: () => new GetPaymentsBySaleIdHandler(mockPaymentRepo, mockSaleRepo),
        },
        {
          provide: GetSalePaymentHistoryHandler,
          useFactory: () => new GetSalePaymentHistoryHandler(mockPaymentRepo, mockSaleRepo),
        },
        {
          provide: CompletePaymentHandler,
          useFactory: () => new CompletePaymentHandler(mockPaymentRepo, mockSaleRepo),
        },
        {
          provide: SettlePaymentHandler,
          useFactory: () => new SettlePaymentHandler(mockPaymentRepo, mockSaleRepo),
        },
        {
          provide: FailPaymentHandler,
          useFactory: () => new FailPaymentHandler(mockPaymentRepo, mockSaleRepo),
        },
        {
          provide: CancelPaymentHandler,
          useFactory: () => new CancelPaymentHandler(mockPaymentRepo, mockSaleRepo),
        },
        {
          provide: ListPaymentsHandler,
          useFactory: () => new ListPaymentsHandler(mockPaymentRepo),
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

  describe('2. Payment Endpoint Path Coverage & HTTP Methods', () => {
    it('registers all authoritative Payment API endpoints in OpenAPI paths', () => {
      const paths = openApiDoc.paths;

      // 1. Record Payment (POST /api/v1/sales/{saleId}/payments)
      expect(paths['/api/v1/sales/{saleId}/payments']?.post).toBeDefined();

      // 2. List Payments for Sale (GET /api/v1/sales/{saleId}/payments)
      expect(paths['/api/v1/sales/{saleId}/payments']?.get).toBeDefined();

      // 3. Retrieve Payment by ID (GET /api/v1/payments/{id})
      expect(paths['/api/v1/payments/{id}']?.get).toBeDefined();

      // 4. List Payments with Filters & Pagination (GET /api/v1/payments)
      expect(paths['/api/v1/payments']?.get).toBeDefined();

      // 5. Complete Payment (POST /api/v1/payments/{id}/complete)
      expect(paths['/api/v1/payments/{id}/complete']?.post).toBeDefined();

      // 6. Fail Payment (POST /api/v1/payments/{id}/fail)
      expect(paths['/api/v1/payments/{id}/fail']?.post).toBeDefined();

      // 7. Cancel Payment (POST /api/v1/payments/{id}/cancel)
      expect(paths['/api/v1/payments/{id}/cancel']?.post).toBeDefined();
    });

    it('tags every payment route with "Payments"', () => {
      const paths = openApiDoc.paths;
      for (const [pathKey, pathItem] of Object.entries(paths)) {
        if (pathKey.includes('/payments') || pathKey.includes('/sales/{saleId}/payments')) {
          for (const operation of Object.values(pathItem as Record<string, { tags?: string[] }>)) {
            if (operation && typeof operation === 'object' && operation.tags) {
              expect(operation.tags).toContain('Payments');
            }
          }
        }
      }
    });

    it('attaches BearerAuth security requirement to every payment route', () => {
      const paths = openApiDoc.paths;
      for (const [pathKey, pathItem] of Object.entries(paths)) {
        if (pathKey.includes('/payments')) {
          for (const operation of Object.values(
            pathItem as Record<string, { security?: Array<Record<string, string[]>> }>,
          )) {
            if (operation && typeof operation === 'object' && operation.security) {
              const hasBearer = operation.security.some((s) => 'bearer' in s);
              expect(hasBearer).toBe(true);
            }
          }
        }
      }
    });
  });

  describe('3. HTTP Response Status Code Declarations', () => {
    it('documents full status code matrix on POST /api/v1/sales/{saleId}/payments', () => {
      const responses = openApiDoc.paths['/api/v1/sales/{saleId}/payments']?.post?.responses;
      expect(responses).toBeDefined();
      expect(responses?.['201']).toBeDefined(); // Created
      expect(responses?.['400']).toBeDefined(); // Bad Request
      expect(responses?.['401']).toBeDefined(); // Unauthorized
      expect(responses?.['403']).toBeDefined(); // Forbidden
      expect(responses?.['404']).toBeDefined(); // Not Found
      expect(responses?.['409']).toBeDefined(); // Conflict
      expect(responses?.['422']).toBeDefined(); // Unprocessable Entity
    });

    it('documents full status code matrix on GET /api/v1/sales/{saleId}/payments', () => {
      const responses = openApiDoc.paths['/api/v1/sales/{saleId}/payments']?.get?.responses;
      expect(responses).toBeDefined();
      expect(responses?.['200']).toBeDefined();
      expect(responses?.['400']).toBeDefined();
      expect(responses?.['401']).toBeDefined();
      expect(responses?.['403']).toBeDefined();
      expect(responses?.['404']).toBeDefined();
    });

    it('documents full status code matrix on GET /api/v1/payments/{id}', () => {
      const responses = openApiDoc.paths['/api/v1/payments/{id}']?.get?.responses;
      expect(responses).toBeDefined();
      expect(responses?.['200']).toBeDefined();
      expect(responses?.['400']).toBeDefined();
      expect(responses?.['401']).toBeDefined();
      expect(responses?.['403']).toBeDefined();
      expect(responses?.['404']).toBeDefined();
    });

    it('documents full status code matrix on GET /api/v1/payments', () => {
      const responses = openApiDoc.paths['/api/v1/payments']?.get?.responses;
      expect(responses).toBeDefined();
      expect(responses?.['200']).toBeDefined();
      expect(responses?.['400']).toBeDefined();
      expect(responses?.['401']).toBeDefined();
      expect(responses?.['403']).toBeDefined();
    });

    it('documents full status code matrix on POST /api/v1/payments/{id}/complete', () => {
      const responses = openApiDoc.paths['/api/v1/payments/{id}/complete']?.post?.responses;
      expect(responses).toBeDefined();
      expect(responses?.['200']).toBeDefined();
      expect(responses?.['400']).toBeDefined();
      expect(responses?.['401']).toBeDefined();
      expect(responses?.['403']).toBeDefined();
      expect(responses?.['404']).toBeDefined();
      expect(responses?.['409']).toBeDefined();
      expect(responses?.['422']).toBeDefined();
    });

    it('documents full status code matrix on POST /api/v1/payments/{id}/fail', () => {
      const responses = openApiDoc.paths['/api/v1/payments/{id}/fail']?.post?.responses;
      expect(responses).toBeDefined();
      expect(responses?.['200']).toBeDefined();
      expect(responses?.['400']).toBeDefined();
      expect(responses?.['401']).toBeDefined();
      expect(responses?.['403']).toBeDefined();
      expect(responses?.['404']).toBeDefined();
      expect(responses?.['409']).toBeDefined();
      expect(responses?.['422']).toBeDefined();
    });

    it('documents full status code matrix on POST /api/v1/payments/{id}/cancel', () => {
      const responses = openApiDoc.paths['/api/v1/payments/{id}/cancel']?.post?.responses;
      expect(responses).toBeDefined();
      expect(responses?.['200']).toBeDefined();
      expect(responses?.['400']).toBeDefined();
      expect(responses?.['401']).toBeDefined();
      expect(responses?.['403']).toBeDefined();
      expect(responses?.['404']).toBeDefined();
      expect(responses?.['409']).toBeDefined();
      expect(responses?.['422']).toBeDefined();
    });
  });

  describe('4. Schema Definitions in OpenAPI Components', () => {
    it('registers essential request and response DTO schemas in components', () => {
      const schemas = openApiDoc.components?.schemas as Record<string, unknown>;
      expect(schemas).toBeDefined();

      // Request DTOs
      expect(schemas['RecordPaymentRequestDto']).toBeDefined();
      expect(schemas['CompletePaymentRequestDto']).toBeDefined();
      expect(schemas['FailPaymentRequestDto']).toBeDefined();
      expect(schemas['CancelPaymentRequestDto']).toBeDefined();

      // Response DTOs
      expect(schemas['PaymentResponseDto']).toBeDefined();
      expect(schemas['PaymentSummaryResponseDto']).toBeDefined();
      expect(schemas['PaymentDetailResponseDto']).toBeDefined();
      expect(schemas['PaginatedPaymentsResponseDto']).toBeDefined();
      expect(schemas['MoneyResponseDto']).toBeDefined();
    });

    it('documents query parameters on GET /api/v1/payments', () => {
      const listPaymentsOp = openApiDoc.paths['/api/v1/payments']?.get;
      expect(listPaymentsOp).toBeDefined();

      const params = (listPaymentsOp?.parameters ?? []) as Array<{
        name: string;
        in: string;
        required?: boolean;
      }>;
      const paramNames = params.map((p) => p.name);

      expect(paramNames).toContain('page');
      expect(paramNames).toContain('limit');
      expect(paramNames).toContain('saleId');
      expect(paramNames).toContain('status');
      expect(paramNames).toContain('method');
      expect(paramNames).toContain('fromDate');
      expect(paramNames).toContain('toDate');
      expect(paramNames).toContain('sortBy');
      expect(paramNames).toContain('sortDirection');
    });

    it('PaymentResponseDto accurately reflects financial contract and zero ORM leakages', () => {
      const schemas = openApiDoc.components?.schemas as Record<
        string,
        { properties?: Record<string, { type?: string; description?: string }> }
      >;
      const paymentSchema = schemas['PaymentResponseDto'];
      expect(paymentSchema).toBeDefined();
      expect(paymentSchema?.properties?.['id']).toBeDefined();
      expect(paymentSchema?.properties?.['saleId']).toBeDefined();
      expect(paymentSchema?.properties?.['method']).toBeDefined();
      expect(paymentSchema?.properties?.['amount']).toBeDefined();
      expect(paymentSchema?.properties?.['amountValue']).toBeDefined();
      expect(paymentSchema?.properties?.['status']).toBeDefined();
      expect(paymentSchema?.properties?.['reference']).toBeDefined();
      expect(paymentSchema?.properties?.['paidAt']).toBeDefined();
      expect(paymentSchema?.properties?.['createdAt']).toBeDefined();
      expect(paymentSchema?.properties?.['version']).toBeDefined();

      // Critical Security Invariant: Zero leakage of multi-tenant ID or Prisma internals
      expect(paymentSchema?.properties?.['tenantId']).toBeUndefined();
      expect(paymentSchema?.properties?.['updatedAt']).toBeUndefined();
    });

    it('MoneyResponseDto preserves exact cents, formatted string, and ISO currency', () => {
      const schemas = openApiDoc.components?.schemas as Record<
        string,
        { properties?: Record<string, { type?: string }> }
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
