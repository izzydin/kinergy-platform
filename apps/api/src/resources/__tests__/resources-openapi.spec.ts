import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import { ResourcesModule } from '../resources.module';
import { PlatformModule } from '../../platform/platform.module';
import { ConfigModule } from '@nestjs/config';
import { appConfig, databaseConfig } from '../../config';

describe('Phase 6 Resources OpenAPI / Swagger Contract Verification (Milestone 6.9)', () => {
  let app: INestApplication;
  let openApiDoc: ReturnType<typeof SwaggerModule.createDocument>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [appConfig, databaseConfig],
        }),
        PlatformModule,
        ResourcesModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();

    const config = new DocumentBuilder()
      .setTitle('Kinergy Platform API')
      .setDescription('Resources Management OpenAPI Specification')
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

  describe('1. OpenAPI Document Generation & Core Metadata', () => {
    it('generates valid OpenAPI 3.0 document without errors', () => {
      expect(openApiDoc).toBeDefined();
      expect(openApiDoc.openapi).toMatch(/^3\./);
      expect(openApiDoc.info.title).toBe('Kinergy Platform API');
    });

    it('registers Resources API tags', () => {
      const paths = Object.values(openApiDoc.paths);
      const allTags = new Set<string>();

      paths.forEach((pathItem) => {
        Object.values(pathItem).forEach((operation) => {
          const op = operation as { tags?: string[] } | undefined;
          if (op?.tags) {
            op.tags.forEach((tag: string) => allTags.add(tag));
          }
        });
      });

      expect(allTags.has('Resources - Consumable Inventory')).toBe(true);
      expect(allTags.has('Resources - Fixed Assets')).toBe(true);
      expect(allTags.has('Resources - Valuation')).toBe(true);
      expect(allTags.has('Resources - Overview')).toBe(true);
    });
  });

  describe('2. Consumable Inventory Endpoint Coverage', () => {
    const expectedInventoryEndpoints = [
      '/api/v1/resources/inventory/categories',
      '/api/v1/resources/inventory',
      '/api/v1/resources/inventory/low-stock',
      '/api/v1/resources/inventory/valuation',
      '/api/v1/resources/inventory/{id}',
      '/api/v1/resources/inventory/{id}/stock-level',
      '/api/v1/resources/inventory/{id}/movements',
      '/api/v1/resources/inventory/{id}/receive',
      '/api/v1/resources/inventory/{id}/sell',
      '/api/v1/resources/inventory/{id}/consume',
      '/api/v1/resources/inventory/{id}/scrap',
      '/api/v1/resources/inventory/{id}/adjust',
      '/api/v1/resources/inventory/{id}/archive',
      '/api/v1/resources/inventory/{id}/activate',
      '/api/v1/resources/inventory/{id}/deactivate',
    ];

    it.each(expectedInventoryEndpoints)(
      'documents inventory endpoint %s in OpenAPI paths',
      (endpointPath) => {
        expect(openApiDoc.paths[endpointPath]).toBeDefined();
      },
    );
  });

  describe('3. Fixed Asset Endpoint Coverage', () => {
    const expectedAssetEndpoints = [
      '/api/v1/resources/assets/categories',
      '/api/v1/resources/assets/tag/{tag}',
      '/api/v1/resources/assets',
      '/api/v1/resources/assets/valuation/summary',
      '/api/v1/resources/assets/{id}',
      '/api/v1/resources/assets/{id}/transfer',
      '/api/v1/resources/assets/{id}/status',
      '/api/v1/resources/assets/{id}/condition',
      '/api/v1/resources/assets/{id}/maintenance',
      '/api/v1/resources/assets/{id}/valuation',
      '/api/v1/resources/assets/{id}/history',
    ];

    it.each(expectedAssetEndpoints)(
      'documents fixed asset endpoint %s in OpenAPI paths',
      (endpointPath) => {
        expect(openApiDoc.paths[endpointPath]).toBeDefined();
      },
    );
  });

  describe('4. Cross-Domain Valuation Endpoint Coverage', () => {
    it('documents combined resource valuation endpoint /api/v1/resources/valuation/summary', () => {
      const pathItem = openApiDoc.paths['/api/v1/resources/valuation/summary'];
      expect(pathItem).toBeDefined();
      expect(pathItem?.get).toBeDefined();
      expect(pathItem?.get?.summary).toBe('Get combined cross-domain resource valuation summary');
    });
  });

  describe('5. Resource Overview Endpoint Coverage', () => {
    it('documents resource overview endpoint /api/v1/resources/overview', () => {
      const pathItem = openApiDoc.paths['/api/v1/resources/overview'];
      expect(pathItem).toBeDefined();
      expect(pathItem?.get).toBeDefined();
      expect(pathItem?.get?.summary).toBe('Get enterprise resource overview dashboard metrics');
    });
  });

  describe('6. Schema Registration & Security', () => {
    it('registers essential Request & Response schemas in OpenAPI components', () => {
      const schemas = openApiDoc.components?.schemas;
      expect(schemas).toBeDefined();

      // Inventory Schemas
      expect(schemas?.['CreateInventoryItemRequestDto']).toBeDefined();
      expect(schemas?.['InventoryItemResponseDto']).toBeDefined();
      expect(schemas?.['PaginatedInventoryResponseDto']).toBeDefined();
      expect(schemas?.['InventoryValuationResponseDto']).toBeDefined();

      // Fixed Asset Schemas
      expect(schemas?.['CreateFixedAssetRequestDto']).toBeDefined();
      expect(schemas?.['FixedAssetResponseDto']).toBeDefined();
      expect(schemas?.['PaginatedFixedAssetResponseDto']).toBeDefined();
      expect(schemas?.['FixedAssetValuationSummaryResponseDto']).toBeDefined();

      // Valuation Summary Schema
      expect(schemas?.['ResourceValuationSummaryResponseDto']).toBeDefined();

      // Overview Response Schema
      expect(schemas?.['ResourceOverviewResponseDto']).toBeDefined();
    });

    it('documents BearerAuth security requirement on protected operations', () => {
      const paths = Object.values(openApiDoc.paths);
      paths.forEach((pathItem) => {
        Object.values(pathItem).forEach((operation) => {
          const op = operation as { security?: Array<Record<string, unknown>> } | undefined;
          if (op?.security) {
            const hasBearer = op.security.some((sec) => 'bearer' in sec);
            expect(hasBearer).toBe(true);
          }
        });
      });
    });
  });
});
