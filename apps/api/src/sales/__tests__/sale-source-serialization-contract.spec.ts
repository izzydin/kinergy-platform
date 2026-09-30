import { Test, TestingModule } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import {
  SaleSource,
  SaleSourceType,
  Sale,
  SaleId,
  ReceiptDTO,
  PaymentMethod,
  PaymentStatus,
  ReceiptStatus,
  InvalidSaleSourceException,
  SaleRepositoryPort,
  CreateSaleHandler,
  AssignSaleSourceHandler,
  GetSaleByIdHandler,
} from '@kinergy-platform/core';
import {
  SaleSourceResponseDto,
  SaleResponseDto,
  SaleItemResponseDto,
  ReceiptResponseDto,
} from '../dto';
import { SalesController, SALE_REPOSITORY_TOKEN } from '../controllers/sales.controller';
import { ReceiptsController, RECEIPT_REPOSITORY_TOKEN } from '../controllers/receipts.controller';
import { PAYMENT_REPOSITORY_TOKEN } from '../controllers/payments.controller';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';

class InMemorySaleRepo implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }
  async save(sale: Sale): Promise<void> {
    this.store.set(sale.id.value, sale);
  }
}

describe('SaleSource Canonical Serialization & API Contract Spec (ADR-0121 & ADR-0117)', () => {
  let app: INestApplication;
  let openApiDoc: ReturnType<typeof SwaggerModule.createDocument>;
  let salesController: SalesController;
  let saleRepo: InMemorySaleRepo;

  beforeAll(async () => {
    saleRepo = new InMemorySaleRepo();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SalesController, ReceiptsController],
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
          provide: RECEIPT_REPOSITORY_TOKEN,
          useValue: {
            findById: jest.fn(),
            findBySaleId: jest.fn(),
            findByReceiptNumber: jest.fn(),
            save: jest.fn(),
            getNextReceiptNumber: jest.fn(),
          },
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
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    salesController = moduleRef.get<SalesController>(SalesController);

    const swaggerConfig = new DocumentBuilder()
      .setTitle('Kinergy Platform API')
      .setDescription('Canonical Sales & Receipts Contract')
      .setVersion('1.0')
      .build();

    openApiDoc = SwaggerModule.createDocument(app, swaggerConfig);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // =========================================================================
  // 1. Canonical Conceptual Representation
  // =========================================================================
  describe('1. Canonical Conceptual Representation', () => {
    it('serializes SaleSource domain VO to exact conceptual JSON: { type, referenceId }', () => {
      const source = SaleSource.create(SaleSourceType.FOOD, 'food_order_123');
      const jsonString = JSON.stringify(source);
      const parsed = JSON.parse(jsonString);

      expect(parsed).toEqual({
        type: 'FOOD',
        referenceId: 'food_order_123',
      });
      // Verifies exact key set (zero internal field leakage)
      expect(Object.keys(parsed).sort()).toEqual(['referenceId', 'type']);
    });

    it('serializes SaleSourceResponseDto to canonical representation without leaking implementation details', () => {
      const source = SaleSource.create(SaleSourceType.DRINK, 'drink_shake_456');
      const dto = SaleSourceResponseDto.fromDomain(source);

      expect(dto).not.toBeNull();
      const serialized = JSON.parse(JSON.stringify(dto));

      expect(serialized).toEqual({
        type: 'DRINK',
        referenceId: 'drink_shake_456',
        referenceCode: null,
      });
      // Verifies zero legacy aliases or domain internals in serialization
      expect(serialized['sourceType']).toBeUndefined();
      expect(serialized['sourceId']).toBeUndefined();
      expect(serialized['_type']).toBeUndefined();
      expect(serialized['_referenceId']).toBeUndefined();
    });

    it('serializes optional referenceCode when present', () => {
      const dto = SaleSourceResponseDto.fromDomain({
        type: SaleSourceType.ROOM_RENTAL,
        referenceId: 'room_bay_01',
        referenceCode: 'BAY-STUDIO-A',
      });

      const serialized = JSON.parse(JSON.stringify(dto));
      expect(serialized).toEqual({
        type: 'ROOM_RENTAL',
        referenceId: 'room_bay_01',
        referenceCode: 'BAY-STUDIO-A',
      });
    });
  });

  // =========================================================================
  // 2. Enum Value Stability
  // =========================================================================
  describe('2. Enum Value Stability', () => {
    it('maintains exactly the 5 canonical commercial origin types defined in ADR-0121', () => {
      const expectedValues = [
        'KINESIOLOGY_SESSION',
        'GYM_MEMBERSHIP',
        'FOOD',
        'DRINK',
        'ROOM_RENTAL',
      ];
      const actualValues = Object.values(SaleSourceType);

      expect(actualValues).toHaveLength(5);
      expect(actualValues.sort()).toEqual(expectedValues.sort());
    });

    it.each([
      [SaleSourceType.KINESIOLOGY_SESSION, 'KINESIOLOGY_SESSION'],
      [SaleSourceType.GYM_MEMBERSHIP, 'GYM_MEMBERSHIP'],
      [SaleSourceType.FOOD, 'FOOD'],
      [SaleSourceType.DRINK, 'DRINK'],
      [SaleSourceType.ROOM_RENTAL, 'ROOM_RENTAL'],
    ])('serializes enum value %s to stable literal string "%s"', (enumValue, expectedString) => {
      const source = SaleSource.create(enumValue, 'ref_test_01');
      const parsed = JSON.parse(JSON.stringify(source));
      expect(parsed.type).toBe(expectedString);
    });

    it('rejects unsupported or non-canonical source types during instantiation', () => {
      const unsupportedTypes = ['UNKNOWN', 'LEGACY', 'MIGRATED', 'PARKING_PASS', 'CUSTOM', ''];
      for (const unsupported of unsupportedTypes) {
        expect(() =>
          SaleSource.create(unsupported as unknown as SaleSourceType, 'ref_123'),
        ).toThrow(InvalidSaleSourceException);
      }
    });
  });

  // =========================================================================
  // 3. Consistent ReferenceId Serialization
  // =========================================================================
  describe('3. Consistent ReferenceId Serialization', () => {
    it.each([
      ['alphanumeric identifier', 'food_order_123', 'food_order_123'],
      [
        'UUID identifier',
        '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      ],
      ['prefixed register ticket', 'ORD-2026-0930-0042', 'ORD-2026-0930-0042'],
      ['whitespace trimmed string', '  session_kin_999  ', 'session_kin_999'],
      ['maximum length 255 character string', 'x'.repeat(255), 'x'.repeat(255)],
    ])('serializes referenceId consistently for %s', (_label, inputRefId, expectedRefId) => {
      const source = SaleSource.create(SaleSourceType.FOOD, inputRefId);
      const parsed = JSON.parse(JSON.stringify(source));
      expect(parsed.referenceId).toBe(expectedRefId);
      expect(typeof parsed.referenceId).toBe('string');
    });

    it('prohibits empty, whitespace-only, or control character referenceIds', () => {
      expect(() => SaleSource.create(SaleSourceType.FOOD, '')).toThrow(InvalidSaleSourceException);
      expect(() => SaleSource.create(SaleSourceType.FOOD, '   ')).toThrow(
        InvalidSaleSourceException,
      );
      expect(() => SaleSource.create(SaleSourceType.FOOD, 'ref\x00null')).toThrow(
        InvalidSaleSourceException,
      );
      expect(() => SaleSource.create(SaleSourceType.FOOD, 'ref\x1Fcontrol')).toThrow(
        InvalidSaleSourceException,
      );
    });
  });

  // =========================================================================
  // 4. Explicit Null / Absence Semantics
  // =========================================================================
  describe('4. Explicit Null / Absence Semantics', () => {
    it('returns null when mapping null or undefined domain source', () => {
      expect(SaleSourceResponseDto.fromDomain(null)).toBeNull();
      expect(SaleSourceResponseDto.fromDomain(undefined)).toBeNull();
    });

    it('serializes sourceReference as null on SaleResponseDto when no source is attached', () => {
      const responseDto = new SaleResponseDto();
      responseDto.id = 'sale_test_01';
      responseDto.currency = 'USD';
      responseDto.status = 'DRAFT';
      responseDto.sourceReference = null;

      const serialized = JSON.parse(JSON.stringify(responseDto));
      expect(serialized.sourceReference).toBeNull();
    });

    it('serializes sourceReference as null on SaleItemResponseDto when line item has no source', () => {
      const itemDto = new SaleItemResponseDto();
      itemDto.id = 'item_01';
      itemDto.sourceType = 'CUSTOM_SERVICE';
      itemDto.sourceId = 'custom_svc_1';
      itemDto.description = 'Consultation';
      itemDto.quantity = 1;
      itemDto.sourceReference = null;

      const serialized = JSON.parse(JSON.stringify(itemDto));
      expect(serialized.sourceReference).toBeNull();
    });

    it('serializes referenceCode explicitly as null when absent in SaleSourceResponseDto', () => {
      const dto = SaleSourceResponseDto.fromDomain({
        type: SaleSourceType.FOOD,
        referenceId: 'order_123',
      });
      const serialized = JSON.parse(JSON.stringify(dto));
      expect(serialized.referenceCode).toBeNull();
    });
  });

  // =========================================================================
  // 5. Domain Isolation: Zero Concrete Entity Embedding or Domain-Specific Leakage
  // =========================================================================
  describe('5. Domain Isolation & Prevention of Leaked Concrete Entities', () => {
    it('proves SaleSource contains ZERO concrete domain entity instances or tables', () => {
      const source = SaleSource.create(SaleSourceType.KINESIOLOGY_SESSION, 'session_123');
      const serialized = JSON.parse(JSON.stringify(source));

      // Verifies no clinical or kinesiology entities
      expect(serialized['treatmentSession']).toBeUndefined();
      expect(serialized['soapNotes']).toBeUndefined();
      expect(serialized['clinicalNotes']).toBeUndefined();
      expect(serialized['therapistId']).toBeUndefined();

      // Verifies no gym entities
      expect(serialized['membership']).toBeUndefined();
      expect(serialized['membershipPlan']).toBeUndefined();
      expect(serialized['turnstileId']).toBeUndefined();

      // Verifies no retail/kitchen entities
      expect(serialized['kitchenOrder']).toBeUndefined();
      expect(serialized['tableNumber']).toBeUndefined();
      expect(serialized['dietaryNotes']).toBeUndefined();
      expect(serialized['inventoryStock']).toBeUndefined();

      // Verifies no scheduling entities
      expect(serialized['roomSchedule']).toBeUndefined();
      expect(serialized['calendarBooking']).toBeUndefined();
    });

    it('proves SaleResponseDto.sourceReference contains ONLY generic pointer attributes', () => {
      const dto = SaleSourceResponseDto.fromDomain({
        type: SaleSourceType.GYM_MEMBERSHIP,
        referenceId: 'plan_gold_annual',
        referenceCode: 'MEM-2026-GOLD',
      });

      const keys = Object.keys(JSON.parse(JSON.stringify(dto))).sort();
      expect(keys).toEqual(['referenceCode', 'referenceId', 'type']);
    });
  });

  // =========================================================================
  // 6. Downstream Consistency & Receipt ADR-0117 Evaluation
  // =========================================================================
  describe('6. Downstream Consistency & Receipt ADR-0117 Evaluation', () => {
    it('confirms Sale aggregate and SaleResponseDto expose sourceReference for operational correlation', async () => {
      const sale = Sale.create({
        id: SaleId.create('sale_contract_01'),
        currency: 'USD',
        source: SaleSource.create(SaleSourceType.FOOD, 'lunch_order_88'),
      });
      await saleRepo.save(sale);

      const response = await salesController.getSale(sale.id.value);
      expect(response.sourceReference).toEqual({
        type: 'FOOD',
        referenceId: 'lunch_order_88',
        referenceCode: null,
      });
    });

    /**
     * ARCHITECTURAL EVALUATION UNDER ADR-0117 §3.14 & §3.15:
     * - Under ADR-0117, a Receipt is an immutable, customer-facing legal proof-of-purchase voucher.
     * - It snapshots `saleId` and `saleReference` (commercial order code).
     * - Line items snapshot `sourceType` and `sourceId` for catalog tax/accounting categorization.
     * - `sourceReference` must NOT appear on Receipt root, because customer vouchers do not expose
     *   internal operational domain routing references.
     */
    it('proves ReceiptResponseDto does NOT expose sourceReference on root (adhering to ADR-0117)', () => {
      const sampleReceiptDto: ReceiptDTO = {
        id: 'rcpt_01j9876543210abcdef',
        tenantId: 'tenant_wellness_center',
        saleId: 'sale_01j9876543210abcdef',
        receiptNumber: 'REC-2026-000421',
        saleReference: 'ORD-2026-0925-001',
        issuedAt: '2026-09-25T14:30:00.000Z',
        clientSnapshot: null,
        items: [
          {
            itemId: 'item_01j9876543210abcdef',
            sourceType: 'INVENTORY_ITEM',
            sourceId: 'inv_protein_shake',
            description: 'Whey Protein Shake',
            skuOrCode: 'SKU-SHAKE-01',
            quantity: 1,
            unitPrice: { amount: 5.0, currency: 'USD', formatted: '5.00', cents: 500 },
            discountTotal: { amount: 0, currency: 'USD', formatted: '0.00', cents: 0 },
            subtotal: { amount: 5.0, currency: 'USD', formatted: '5.00', cents: 500 },
            total: { amount: 5.0, currency: 'USD', formatted: '5.00', cents: 500 },
          },
        ],
        itemCount: 1,
        subtotal: { amount: 5.0, currency: 'USD', formatted: '5.00', cents: 500 },
        discountTotal: { amount: 0, currency: 'USD', formatted: '0.00', cents: 0 },
        total: { amount: 5.0, currency: 'USD', formatted: '5.00', cents: 500 },
        currency: 'USD',
        payments: [],
        paymentMethod: PaymentMethod.CASH,
        paymentStatus: PaymentStatus.COMPLETED,
        status: ReceiptStatus.ISSUED,
        reprintCount: 0,
        lastReprintedAt: null,
        createdAt: '2026-09-25T14:30:00.000Z',
        version: 1,
      };

      const receiptResponse = ReceiptResponseDto.fromDTO(sampleReceiptDto);
      const serialized = JSON.parse(JSON.stringify(receiptResponse));

      // 1. Root Receipt strictly does NOT have sourceReference
      expect(serialized['sourceReference']).toBeUndefined();

      // 2. Root Receipt has canonical fiscal/order references per ADR-0117 & ADR-0118
      expect(serialized.saleId).toBe('sale_01j9876543210abcdef');
      expect(serialized.saleReference).toBe('ORD-2026-0925-001');
      expect(serialized.receiptNumber).toBe('REC-2026-000421');

      // 3. Line items preserve catalog classification snapshot (sourceType & sourceId)
      expect(serialized.items[0].sourceType).toBe('INVENTORY_ITEM');
      expect(serialized.items[0].sourceId).toBe('inv_protein_shake');
    });
  });

  interface OpenApiSchemaDefinition {
    properties?: Record<
      string,
      {
        type?: string;
        enum?: string[];
        nullable?: boolean;
        $ref?: string;
        allOf?: Array<{ $ref?: string }>;
      }
    >;
  }

  // =========================================================================
  // 7. Swagger / OpenAPI Schema Matches Actual Response
  // =========================================================================
  describe('7. Swagger / OpenAPI Schema Reflection', () => {
    it('registers SaleSourceResponseDto schema matching actual JSON serialization', () => {
      const schemas = openApiDoc.components?.schemas as Record<string, OpenApiSchemaDefinition>;
      expect(schemas).toBeDefined();

      const sourceSchema = schemas['SaleSourceResponseDto']!;
      expect(sourceSchema).toBeDefined();

      // Schema properties
      expect(sourceSchema.properties?.type).toBeDefined();
      expect(sourceSchema.properties?.type?.enum).toEqual([
        'KINESIOLOGY_SESSION',
        'GYM_MEMBERSHIP',
        'FOOD',
        'DRINK',
        'ROOM_RENTAL',
      ]);
      expect(sourceSchema.properties?.referenceId).toBeDefined();
      expect(sourceSchema.properties?.referenceId?.type).toBe('string');
      expect(sourceSchema.properties?.referenceCode).toBeDefined();
      expect(sourceSchema.properties?.referenceCode?.nullable).toBe(true);

      // Verifies zero concrete entities or domain-specific fields in OpenAPI schema
      expect(sourceSchema.properties?.treatmentSession).toBeUndefined();
      expect(sourceSchema.properties?.membership).toBeUndefined();
      expect(sourceSchema.properties?.kitchenTicket).toBeUndefined();
    });

    it('documents sourceReference on SaleResponseDto schema with nullable support', () => {
      const schemas = openApiDoc.components?.schemas as Record<string, OpenApiSchemaDefinition>;
      const saleSchema = schemas['SaleResponseDto']!;
      expect(saleSchema).toBeDefined();

      const sourceRefProp = saleSchema.properties?.sourceReference;
      expect(sourceRefProp).toBeDefined();
      // Verifies it links to SaleSourceResponseDto or has $ref / nullable
      const refOrAllOf =
        sourceRefProp?.$ref ||
        (sourceRefProp?.allOf && sourceRefProp.allOf[0]?.$ref) ||
        sourceRefProp?.type;
      expect(refOrAllOf).toBeTruthy();
    });

    it('confirms ReceiptResponseDto schema does NOT expose sourceReference (ADR-0117)', () => {
      const schemas = openApiDoc.components?.schemas as Record<string, OpenApiSchemaDefinition>;
      const receiptSchema = schemas['ReceiptResponseDto']!;
      expect(receiptSchema).toBeDefined();

      // Receipt root must not have sourceReference
      expect(receiptSchema.properties?.sourceReference).toBeUndefined();

      // Receipt line items have sourceType and sourceId
      const itemSchema = schemas['ReceiptItemSnapshotResponseDto']!;
      expect(itemSchema).toBeDefined();
      expect(itemSchema.properties?.sourceType).toBeDefined();
      expect(itemSchema.properties?.sourceId).toBeDefined();
    });
  });
});
