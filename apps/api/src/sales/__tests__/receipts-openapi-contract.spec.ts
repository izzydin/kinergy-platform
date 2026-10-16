import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  ReceiptRepositoryPort,
  SaleRepositoryPort,
  PaymentRepositoryPort,
  IssueReceiptHandler,
  GetReceiptHandler,
  GetReceiptBySaleHandler,
} from '@kinergy-platform/core';
import { ReceiptsController, RECEIPT_REPOSITORY_TOKEN } from '../controllers/receipts.controller';
import { SALE_REPOSITORY_TOKEN, PAYMENT_REPOSITORY_TOKEN } from '../sales.tokens';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';

describe('Receipts API OpenAPI / Swagger Contract Verification', () => {
  let app: INestApplication;
  let openApiDoc: ReturnType<typeof SwaggerModule.createDocument>;

  beforeAll(async () => {
    const mockReceiptRepo: ReceiptRepositoryPort = {
      findById: jest.fn(),
      findBySaleId: jest.fn(),
      findByReceiptNumber: jest.fn(),
      save: jest.fn(),
      getNextReceiptNumber: jest.fn(),
    };

    const mockSaleRepo: SaleRepositoryPort = {
      findById: jest.fn(),
      save: jest.fn(),
    };

    const mockPaymentRepo: PaymentRepositoryPort = {
      findById: jest.fn(),
      findBySaleId: jest.fn(),
      save: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ReceiptsController],
      providers: [
        {
          provide: RECEIPT_REPOSITORY_TOKEN,
          useValue: mockReceiptRepo,
        },
        {
          provide: SALE_REPOSITORY_TOKEN,
          useValue: mockSaleRepo,
        },
        {
          provide: PAYMENT_REPOSITORY_TOKEN,
          useValue: mockPaymentRepo,
        },
        {
          provide: IssueReceiptHandler,
          useFactory: () => new IssueReceiptHandler(mockReceiptRepo, mockSaleRepo, mockPaymentRepo),
        },
        {
          provide: GetReceiptHandler,
          useFactory: () => new GetReceiptHandler(mockReceiptRepo),
        },
        {
          provide: GetReceiptBySaleHandler,
          useFactory: () => new GetReceiptBySaleHandler(mockReceiptRepo, mockSaleRepo),
        },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const config = new DocumentBuilder()
      .setTitle('Kinergy Platform API')
      .setDescription('Enterprise Energy & Sustainability Management System API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    openApiDoc = SwaggerModule.createDocument(app, config);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. Global OpenAPI Metadata & Security Scheme', () => {
    it('documents BearerAuth security requirement and scheme', () => {
      expect(openApiDoc.components?.securitySchemes).toBeDefined();
      const securitySchemes = openApiDoc.components?.securitySchemes as
        Record<string, { type: string; scheme: string }> | undefined;
      expect(securitySchemes?.['bearer']).toBeDefined();
      expect(securitySchemes?.['bearer']?.type).toBe('http');
      expect(securitySchemes?.['bearer']?.scheme).toBe('bearer');
    });

    it('documents Receipts tag grouping for receipt voucher operations', () => {
      const getReceiptOp = openApiDoc.paths['/api/v1/sales/{saleId}/receipt']?.get;
      expect(getReceiptOp).toBeDefined();
      expect(getReceiptOp?.tags).toContain('Receipts');
    });
  });

  describe('2. Route Definition: GET /api/v1/sales/{saleId}/receipt', () => {
    it('exposes GET operation with descriptive summary, description, and path parameter', () => {
      const operation = openApiDoc.paths['/api/v1/sales/{saleId}/receipt']?.get;
      expect(operation).toBeDefined();
      expect(operation?.summary).toBe('Retrieve receipt voucher associated with a commercial sale');
      expect(operation?.description).toContain('read-only query');
      expect(operation?.description).toContain('historical point-in-time snapshot');
      expect(operation?.description).toContain('receipts.read');

      const params = (operation?.parameters ?? []) as Array<{
        name: string;
        in: string;
        required?: boolean;
        description?: string;
      }>;
      const saleIdParam = params.find((p) => p.name === 'saleId');
      expect(saleIdParam).toBeDefined();
      expect(saleIdParam?.in).toBe('path');
      expect(saleIdParam?.required).toBe(true);
      expect(saleIdParam?.description).toContain('Sale identifier');
    });

    it('documents complete HTTP status code matrix (200, 400, 401, 403, 404, 500)', () => {
      const responses = openApiDoc.paths['/api/v1/sales/{saleId}/receipt']?.get?.responses;
      expect(responses).toBeDefined();

      // 200 OK
      expect(responses?.['200']).toBeDefined();
      const okResponse = responses?.['200'] as {
        description?: string;
        content?: { 'application/json'?: { schema?: { $ref?: string } } };
      };
      expect(okResponse.description).toContain('Receipt voucher resolved successfully');
      expect(okResponse.content?.['application/json']?.schema?.$ref).toContain(
        'ReceiptResponseDto',
      );

      // 400 Bad Request
      expect(responses?.['400']).toBeDefined();
      const badReq = responses?.['400'] as { description?: string };
      expect(badReq.description).toContain('Sale ID cannot be empty or whitespace');

      // 401 Unauthorized
      expect(responses?.['401']).toBeDefined();
      const unauth = responses?.['401'] as { description?: string };
      expect(unauth.description).toContain('Missing, expired, invalid, or revoked JWT');

      // 403 Forbidden
      expect(responses?.['403']).toBeDefined();
      const forbidden = responses?.['403'] as { description?: string };
      expect(forbidden.description).toContain('receipts.read');

      // 404 Not Found
      expect(responses?.['404']).toBeDefined();
      const notFound = responses?.['404'] as { description?: string };
      expect(notFound.description).toContain('Sale does not exist');
      expect(notFound.description).toContain('no receipt has been issued yet');

      // 500 Internal Server Error
      expect(responses?.['500']).toBeDefined();
      const serverErr = responses?.['500'] as { description?: string };
      expect(serverErr.description).toContain('Unexpected persistence or infrastructure failure');
    });
  });

  describe('3. Schema Definitions in OpenAPI Components', () => {
    it('registers ReceiptResponseDto and its nested snapshot schemas in components', () => {
      const schemas = openApiDoc.components?.schemas as Record<string, unknown>;
      expect(schemas).toBeDefined();

      expect(schemas['ReceiptResponseDto']).toBeDefined();
      expect(schemas['ReceiptClientSnapshotResponseDto']).toBeDefined();
      expect(schemas['ReceiptItemSnapshotResponseDto']).toBeDefined();
      expect(schemas['ReceiptPaymentSnapshotResponseDto']).toBeDefined();
      expect(schemas['MoneyResponseDto']).toBeDefined();
    });

    it('ReceiptResponseDto schema defines all canonical commercial voucher fields', () => {
      const schemas = openApiDoc.components?.schemas as Record<
        string,
        { properties?: Record<string, { type?: string; description?: string }> }
      >;
      const receiptSchema = schemas['ReceiptResponseDto'];
      expect(receiptSchema).toBeDefined();

      // Identity & Reference Fields
      expect(receiptSchema?.properties?.['id']).toBeDefined();
      expect(receiptSchema?.properties?.['tenantId']).toBeDefined();
      expect(receiptSchema?.properties?.['saleId']).toBeDefined();
      expect(receiptSchema?.properties?.['receiptNumber']).toBeDefined();
      expect(receiptSchema?.properties?.['saleReference']).toBeDefined();
      expect(receiptSchema?.properties?.['issuedAt']).toBeDefined();
      expect(receiptSchema?.properties?.['status']).toBeDefined();
      expect(receiptSchema?.properties?.['reprintCount']).toBeDefined();
      expect(receiptSchema?.properties?.['lastReprintedAt']).toBeDefined();

      // Point-in-time Snapshot Fields
      expect(receiptSchema?.properties?.['clientSnapshot']).toBeDefined();
      expect(receiptSchema?.properties?.['items']).toBeDefined();
      expect(receiptSchema?.properties?.['itemCount']).toBeDefined();
      expect(receiptSchema?.properties?.['subtotal']).toBeDefined();
      expect(receiptSchema?.properties?.['discountTotal']).toBeDefined();
      expect(receiptSchema?.properties?.['total']).toBeDefined();
      expect(receiptSchema?.properties?.['currency']).toBeDefined();
      expect(receiptSchema?.properties?.['payments']).toBeDefined();
      expect(receiptSchema?.properties?.['paymentMethod']).toBeDefined();
      expect(receiptSchema?.properties?.['paymentStatus']).toBeDefined();

      // Critical Invariant: Zero leakage of Prisma/Database internal properties
      expect(receiptSchema?.properties?.['version']).toBeUndefined();
      expect(receiptSchema?.properties?.['createdAt']).toBeUndefined();
      expect(receiptSchema?.properties?.['updatedAt']).toBeUndefined();
      expect(receiptSchema?.properties?.['deletedAt']).toBeUndefined();
    });

    it('MoneyResponseDto preserves integer cents, 2-decimal formatted string, and ISO currency', () => {
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

    it('ReceiptClientSnapshotResponseDto models customer presentation attributes', () => {
      const schemas = openApiDoc.components?.schemas as Record<
        string,
        { properties?: Record<string, { type?: string; description?: string }> }
      >;
      const clientSchema = schemas['ReceiptClientSnapshotResponseDto'];
      expect(clientSchema).toBeDefined();

      expect(clientSchema?.properties?.['clientId']).toBeDefined();
      expect(clientSchema?.properties?.['referenceNumber']).toBeDefined();
      expect(clientSchema?.properties?.['fullName']).toBeDefined();
      expect(clientSchema?.properties?.['email']).toBeDefined();
      expect(clientSchema?.properties?.['phone']).toBeDefined();
    });

    it('ReceiptItemSnapshotResponseDto models frozen checkout line items', () => {
      const schemas = openApiDoc.components?.schemas as Record<
        string,
        { properties?: Record<string, { type?: string; description?: string }> }
      >;
      const itemSchema = schemas['ReceiptItemSnapshotResponseDto'];
      expect(itemSchema).toBeDefined();

      expect(itemSchema?.properties?.['itemId']).toBeDefined();
      expect(itemSchema?.properties?.['sourceType']).toBeDefined();
      expect(itemSchema?.properties?.['sourceId']).toBeDefined();
      expect(itemSchema?.properties?.['description']).toBeDefined();
      expect(itemSchema?.properties?.['skuOrCode']).toBeDefined();
      expect(itemSchema?.properties?.['quantity']).toBeDefined();
      expect(itemSchema?.properties?.['unitPrice']).toBeDefined();
      expect(itemSchema?.properties?.['discountTotal']).toBeDefined();
      expect(itemSchema?.properties?.['subtotal']).toBeDefined();
      expect(itemSchema?.properties?.['total']).toBeDefined();
    });

    it('ReceiptPaymentSnapshotResponseDto models settled tender records', () => {
      const schemas = openApiDoc.components?.schemas as Record<
        string,
        { properties?: Record<string, { type?: string; description?: string }> }
      >;
      const paymentSchema = schemas['ReceiptPaymentSnapshotResponseDto'];
      expect(paymentSchema).toBeDefined();

      expect(paymentSchema?.properties?.['paymentId']).toBeDefined();
      expect(paymentSchema?.properties?.['method']).toBeDefined();
      expect(paymentSchema?.properties?.['amount']).toBeDefined();
      expect(paymentSchema?.properties?.['status']).toBeDefined();
      expect(paymentSchema?.properties?.['reference']).toBeDefined();
      expect(paymentSchema?.properties?.['paidAt']).toBeDefined();
    });
  });
});
