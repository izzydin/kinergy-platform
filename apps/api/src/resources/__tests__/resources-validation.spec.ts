import { BadRequestException } from '@nestjs/common';
import { GlobalSanitizationValidationPipe } from '../../common/pipes/global-sanitization-validation.pipe';
import {
  CreateInventoryItemRequestDto,
  UpdateInventoryItemRequestDto,
  ReceiveStockRequestDto,
  SellStockRequestDto,
  ConsumeStockRequestDto,
  AdjustStockRequestDto,
  ScrapStockRequestDto,
  ListInventoryItemsQueryDto,
  CreateFixedAssetRequestDto,
  UpdateFixedAssetDetailsRequestDto,
  TransferFixedAssetLocationRequestDto,
  ChangeFixedAssetStatusRequestDto,
  UpdateFixedAssetConditionRequestDto,
  RecordAssetMaintenanceRequestDto,
  UpdateFixedAssetValuationRequestDto,
  ListFixedAssetsQueryDto,
  GetAssetHistoryQueryDto,
  GetMaintenanceHistoryQueryDto,
} from '../dto';
import {
  InventoryCategory,
  AssetCategory,
  AssetStatus,
  AssetCondition,
  AssetHistoryEventType,
} from '@kinergy-platform/core';

describe('Phase 6 Resources DTO Validation & Boundary Correctness (Milestone 6.9)', () => {
  let pipe: GlobalSanitizationValidationPipe;

  beforeEach(() => {
    pipe = new GlobalSanitizationValidationPipe();
  });

  describe('1. Consumable Inventory Request DTO Validation', () => {
    describe('CreateInventoryItemRequestDto', () => {
      it('validates a well-formed inventory product creation payload', async () => {
        const payload = {
          sku: 'PROT-WHEY-1KG',
          name: 'Whey Protein 1kg',
          description: 'Vanilla protein powder',
          category: InventoryCategory.SUPPLEMENTS,
          unitCost: 25.5,
          sellingPrice: 45.0,
          quantityOnHand: 10,
          reorderThreshold: 3,
          unitOfMeasure: 'TUB',
        };

        const result = (await pipe.transform(payload, {
          type: 'body',
          metatype: CreateInventoryItemRequestDto,
        })) as CreateInventoryItemRequestDto;

        expect(result).toBeInstanceOf(CreateInventoryItemRequestDto);
        expect(result.sku).toBe('PROT-WHEY-1KG');
        expect(result.unitCost).toBe(25.5);
      });

      it('rejects missing required fields (sku, name, category, unitCost, sellingPrice)', async () => {
        const payload = {
          description: 'Missing required fields',
        };

        await expect(
          pipe.transform(payload, {
            type: 'body',
            metatype: CreateInventoryItemRequestDto,
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects invalid inventory category enum', async () => {
        const payload = {
          sku: 'PROT-WHEY-1KG',
          name: 'Whey Protein',
          category: 'INVALID_CATEGORY',
          unitCost: 20.0,
          sellingPrice: 30.0,
        };

        await expect(
          pipe.transform(payload, {
            type: 'body',
            metatype: CreateInventoryItemRequestDto,
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects negative money inputs for unitCost and sellingPrice', async () => {
        const payload = {
          sku: 'PROT-WHEY-1KG',
          name: 'Whey Protein',
          category: InventoryCategory.SUPPLEMENTS,
          unitCost: -10.0,
          sellingPrice: -5.0,
        };

        await expect(
          pipe.transform(payload, {
            type: 'body',
            metatype: CreateInventoryItemRequestDto,
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects non-whitelisted properties under global forbidNonWhitelisted policy', async () => {
        const payload = {
          sku: 'PROT-WHEY-1KG',
          name: 'Whey Protein',
          category: InventoryCategory.SUPPLEMENTS,
          unitCost: 25.0,
          sellingPrice: 40.0,
          injectedForbiddenField: 'exploit',
        };

        await expect(
          pipe.transform(payload, {
            type: 'body',
            metatype: CreateInventoryItemRequestDto,
          }),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('UpdateInventoryItemRequestDto', () => {
      it('validates partial metadata update payload', async () => {
        const payload = {
          name: 'Updated Whey Protein',
          sellingPrice: 48.0,
          reorderThreshold: 5,
        };

        const result = (await pipe.transform(payload, {
          type: 'body',
          metatype: UpdateInventoryItemRequestDto,
        })) as UpdateInventoryItemRequestDto;

        expect(result.name).toBe('Updated Whey Protein');
        expect(result.sellingPrice).toBe(48.0);
      });
    });

    describe('Stock Mutation Operation DTOs', () => {
      it('validates ReceiveStockRequestDto with positive quantity and optional unitCost', async () => {
        const valid = {
          quantity: 24,
          unitCost: 22.5,
          supplier: 'Optimum Nutrition Ltd',
          referenceNumber: 'PO-2026-08-99',
        };

        const result = (await pipe.transform(valid, {
          type: 'body',
          metatype: ReceiveStockRequestDto,
        })) as ReceiveStockRequestDto;

        expect(result.quantity).toBe(24);
        expect(result.unitCost).toBe(22.5);
      });

      it('rejects zero or negative quantities in ReceiveStockRequestDto', async () => {
        const invalidZero = { quantity: 0 };
        const invalidNegative = { quantity: -5 };

        await expect(
          pipe.transform(invalidZero, { type: 'body', metatype: ReceiveStockRequestDto }),
        ).rejects.toThrow(BadRequestException);

        await expect(
          pipe.transform(invalidNegative, { type: 'body', metatype: ReceiveStockRequestDto }),
        ).rejects.toThrow(BadRequestException);
      });

      it('validates SellStockRequestDto with positive quantity and referenceId', async () => {
        const valid = {
          quantity: 2,
          unitPrice: 45.0,
          referenceId: 'POS-REC-2026-001',
        };

        const result = (await pipe.transform(valid, {
          type: 'body',
          metatype: SellStockRequestDto,
        })) as SellStockRequestDto;

        expect(result.quantity).toBe(2);
        expect(result.referenceId).toBe('POS-REC-2026-001');
      });

      it('validates ConsumeStockRequestDto with positive quantity and treatmentSessionId', async () => {
        const valid = {
          quantity: 1,
          treatmentSessionId: 'sess_123',
          notes: 'Used during spinal adjustment session',
        };

        const result = (await pipe.transform(valid, {
          type: 'body',
          metatype: ConsumeStockRequestDto,
        })) as ConsumeStockRequestDto;

        expect(result.quantity).toBe(1);
        expect(result.treatmentSessionId).toBe('sess_123');
      });

      it('validates AdjustStockRequestDto allowing negative or positive delta with required reason', async () => {
        const validDelta = {
          deltaQuantity: -3,
          reason: 'Count discrepancy reconciliation',
        };

        const result = (await pipe.transform(validDelta, {
          type: 'body',
          metatype: AdjustStockRequestDto,
        })) as AdjustStockRequestDto;

        expect(result.deltaQuantity).toBe(-3);
        expect(result.reason).toBe('Count discrepancy reconciliation');
      });

      it('rejects AdjustStockRequestDto when reason is too short (< 3 chars)', async () => {
        const invalid = {
          deltaQuantity: -1,
          reason: 'ok',
        };

        await expect(
          pipe.transform(invalid, { type: 'body', metatype: AdjustStockRequestDto }),
        ).rejects.toThrow(BadRequestException);
      });

      it('validates ScrapStockRequestDto with positive quantity and reason', async () => {
        const valid = {
          quantity: 2,
          reason: 'Damaged container broken seal',
        };

        const result = (await pipe.transform(valid, {
          type: 'body',
          metatype: ScrapStockRequestDto,
        })) as ScrapStockRequestDto;

        expect(result.quantity).toBe(2);
      });
    });

    describe('ListInventoryItemsQueryDto', () => {
      it('validates query parameters and transforms numeric pagination strings', async () => {
        const query = {
          search: 'Protein',
          category: InventoryCategory.SUPPLEMENTS,
          stockStatus: 'IN_STOCK',
          page: '2',
          limit: '50',
          sortBy: 'name',
          sortOrder: 'desc',
        };

        const result = (await pipe.transform(query, {
          type: 'query',
          metatype: ListInventoryItemsQueryDto,
        })) as ListInventoryItemsQueryDto;

        expect(result.page).toBe(2);
        expect(result.limit).toBe(50);
        expect(result.stockStatus).toBe('IN_STOCK');
        expect(result.sortOrder).toBe('desc');
      });

      it('rejects invalid pagination parameters (page < 1 or limit < 1)', async () => {
        const invalidPage = { page: 0 };
        const invalidLimit = { limit: -10 };

        await expect(
          pipe.transform(invalidPage, { type: 'query', metatype: ListInventoryItemsQueryDto }),
        ).rejects.toThrow(BadRequestException);

        await expect(
          pipe.transform(invalidLimit, { type: 'query', metatype: ListInventoryItemsQueryDto }),
        ).rejects.toThrow(BadRequestException);
      });
    });
  });

  describe('2. Fixed Assets Request DTO Validation', () => {
    describe('CreateFixedAssetRequestDto', () => {
      it('validates a complete fixed asset commission payload', async () => {
        const payload = {
          assetTag: 'AST-GYM-2026-001',
          name: 'Commercial Treadmill Pro T9',
          description: 'High durability motorized running machine',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: '2026-01-15T00:00:00.000Z',
          purchaseValueAmount: 6500.0,
          purchaseValueCurrency: 'USD',
          condition: AssetCondition.EXCELLENT,
          status: AssetStatus.ACTIVE,
          location: {
            facilityId: 'fac_main',
            roomId: 'room_cardio_01',
            zone: 'Cardio Deck',
            description: 'North Bay 4',
          },
          notes: 'Standard 3-year commercial warranty',
        };

        const result = (await pipe.transform(payload, {
          type: 'body',
          metatype: CreateFixedAssetRequestDto,
        })) as CreateFixedAssetRequestDto;

        expect(result.assetTag).toBe('AST-GYM-2026-001');
        expect(result.purchaseValueAmount).toBe(6500.0);
        expect(result.location.facilityId).toBe('fac_main');
      });

      it('rejects invalid date formats in purchaseDate', async () => {
        const payload = {
          assetTag: 'AST-GYM-001',
          name: 'Treadmill',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: 'not-a-valid-date',
          purchaseValueAmount: 5000,
          location: { facilityId: 'fac_main' },
        };

        await expect(
          pipe.transform(payload, {
            type: 'body',
            metatype: CreateFixedAssetRequestDto,
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects invalid AssetCondition or AssetStatus enums', async () => {
        const payload = {
          assetTag: 'AST-GYM-001',
          name: 'Treadmill',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: '2026-01-15T00:00:00.000Z',
          purchaseValueAmount: 5000,
          condition: 'SUPER_PRISTINE', // Invalid
          status: 'RUNNING', // Invalid
          location: { facilityId: 'fac_main' },
        };

        await expect(
          pipe.transform(payload, {
            type: 'body',
            metatype: CreateFixedAssetRequestDto,
          }),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('Generic Update Boundary (UpdateFixedAssetDetailsRequestDto)', () => {
      it('validates descriptive metadata update payload', async () => {
        const payload = {
          name: 'Biodex System 4 Pro (Calibrated)',
          description: 'Updated calibration profile',
          notes: 'Maintenance certified',
          reason: 'Periodic description enhancement',
        };

        const result = (await pipe.transform(payload, {
          type: 'body',
          metatype: UpdateFixedAssetDetailsRequestDto,
        })) as UpdateFixedAssetDetailsRequestDto;

        expect(result.name).toBe('Biodex System 4 Pro (Calibrated)');
      });

      it('rejects lifecycle status, condition, or location injection in generic update', async () => {
        const payload = {
          name: 'Updated Name',
          status: 'DECOMMISSIONED', // Forbidden non-whitelisted in details DTO
          condition: 'DAMAGED', // Forbidden non-whitelisted in details DTO
          location: { facilityId: 'fac_hacked' }, // Forbidden non-whitelisted in details DTO
        };

        await expect(
          pipe.transform(payload, {
            type: 'body',
            metatype: UpdateFixedAssetDetailsRequestDto,
          }),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('Explicit Lifecycle & Action DTOs', () => {
      it('validates TransferFixedAssetLocationRequestDto with nested location object', async () => {
        const payload = {
          location: {
            facilityId: 'fac_secondary',
            roomId: 'room_rehab_02',
            zone: 'Zone C',
            description: 'Physical Therapy Floor 2',
          },
          reason: 'Clinic room expansion',
        };

        const result = (await pipe.transform(payload, {
          type: 'body',
          metatype: TransferFixedAssetLocationRequestDto,
        })) as TransferFixedAssetLocationRequestDto;

        expect(result.location.facilityId).toBe('fac_secondary');
        expect(result.location.roomId).toBe('room_rehab_02');
      });

      it('validates ChangeFixedAssetStatusRequestDto with mandatory reason', async () => {
        const payload = {
          status: AssetStatus.UNDER_MAINTENANCE,
          reason: 'Scheduled quarterly hydraulic overhaul',
        };

        const result = (await pipe.transform(payload, {
          type: 'body',
          metatype: ChangeFixedAssetStatusRequestDto,
        })) as ChangeFixedAssetStatusRequestDto;

        expect(result.status).toBe(AssetStatus.UNDER_MAINTENANCE);
      });

      it('rejects ChangeFixedAssetStatusRequestDto when reason is missing or too short', async () => {
        const payload = {
          status: AssetStatus.UNDER_MAINTENANCE,
          reason: 'no',
        };

        await expect(
          pipe.transform(payload, {
            type: 'body',
            metatype: ChangeFixedAssetStatusRequestDto,
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('validates UpdateFixedAssetConditionRequestDto', async () => {
        const payload = {
          condition: AssetCondition.FAIR,
          reason: 'Normal hydraulic arm wear after 6 months',
        };

        const result = (await pipe.transform(payload, {
          type: 'body',
          metatype: UpdateFixedAssetConditionRequestDto,
        })) as UpdateFixedAssetConditionRequestDto;

        expect(result.condition).toBe(AssetCondition.FAIR);
      });

      it('validates RecordAssetMaintenanceRequestDto with serviceDate, cost, technician, and description', async () => {
        const payload = {
          serviceDate: '2026-08-30T10:00:00.000Z',
          description: 'Replaced hydraulic actuator seals and calibrated dynamometer arm',
          costAmount: 450.0,
          costCurrency: 'USD',
          performedBy: 'Biodex Certified Field Tech #88',
          updateConditionTo: AssetCondition.EXCELLENT,
          notes: 'Passed all mechanical tolerance safety tests',
        };

        const result = (await pipe.transform(payload, {
          type: 'body',
          metatype: RecordAssetMaintenanceRequestDto,
        })) as RecordAssetMaintenanceRequestDto;

        expect(result.costAmount).toBe(450.0);
        expect(result.performedBy).toBe('Biodex Certified Field Tech #88');
      });

      it('rejects RecordAssetMaintenanceRequestDto on negative cost or missing description', async () => {
        const invalidCost = {
          serviceDate: '2026-08-30T10:00:00.000Z',
          description: 'Service',
          costAmount: -100, // Invalid negative
          performedBy: 'Tech',
        };

        await expect(
          pipe.transform(invalidCost, {
            type: 'body',
            metatype: RecordAssetMaintenanceRequestDto,
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('validates UpdateFixedAssetValuationRequestDto with non-negative estimatedValueAmount', async () => {
        const payload = {
          estimatedValueAmount: 38000.0,
          currency: 'USD',
          reason: 'Annual fair market depreciation appraisal',
        };

        const result = (await pipe.transform(payload, {
          type: 'body',
          metatype: UpdateFixedAssetValuationRequestDto,
        })) as UpdateFixedAssetValuationRequestDto;

        expect(result.estimatedValueAmount).toBe(38000.0);
      });
    });

    describe('History & Query DTOs', () => {
      it('validates ListFixedAssetsQueryDto with filter criteria and pagination', async () => {
        const query = {
          search: 'Biodex',
          category: AssetCategory.THERAPY_EQUIPMENT,
          status: AssetStatus.ACTIVE,
          facilityId: 'fac_main',
          page: '1',
          limit: '20',
          sortBy: 'name',
          sortOrder: 'asc',
        };

        const result = (await pipe.transform(query, {
          type: 'query',
          metatype: ListFixedAssetsQueryDto,
        })) as ListFixedAssetsQueryDto;

        expect(result.search).toBe('Biodex');
        expect(result.category).toBe(AssetCategory.THERAPY_EQUIPMENT);
        expect(result.page).toBe(1);
      });

      it('validates GetAssetHistoryQueryDto with valid eventType and ISO date range', async () => {
        const query = {
          eventType: AssetHistoryEventType.TRANSFERRED,
          fromDate: '2026-01-01T00:00:00.000Z',
          toDate: '2026-08-31T23:59:59.000Z',
          page: '1',
          limit: '25',
          sortOrder: 'desc',
        };

        const result = (await pipe.transform(query, {
          type: 'query',
          metatype: GetAssetHistoryQueryDto,
        })) as GetAssetHistoryQueryDto;

        expect(result.eventType).toBe(AssetHistoryEventType.TRANSFERRED);
        expect(result.page).toBe(1);
        expect(result.limit).toBe(25);
      });

      it('validates GetMaintenanceHistoryQueryDto with technician filter and pagination', async () => {
        const query = {
          performedBy: 'Biodex Field Tech',
          page: '1',
          limit: '10',
          sortOrder: 'desc',
        };

        const result = (await pipe.transform(query, {
          type: 'query',
          metatype: GetMaintenanceHistoryQueryDto,
        })) as GetMaintenanceHistoryQueryDto;

        expect(result.performedBy).toBe('Biodex Field Tech');
        expect(result.page).toBe(1);
        expect(result.limit).toBe(10);
      });
    });
  });

  describe('3. Global Input Sanitization & Safety Verification', () => {
    it('trims string properties and strips control characters from inputs', async () => {
      const payload = {
        sku: '   PROT-ISO-1KG\u0000   ',
        name: '   Hydrolyzed Whey Isolate   ',
        category: InventoryCategory.SUPPLEMENTS,
        unitCost: 30.0,
        sellingPrice: 50.0,
      };

      const result = (await pipe.transform(payload, {
        type: 'body',
        metatype: CreateInventoryItemRequestDto,
      })) as CreateInventoryItemRequestDto;

      expect(result.sku).toBe('PROT-ISO-1KG');
      expect(result.name).toBe('Hydrolyzed Whey Isolate');
    });

    it('neutralizes embedded XSS script tags from notes and descriptions', async () => {
      const payload = {
        name: '<script>alert("xss")</script>Safe Name',
        description: '<script>document.cookie</script>Safe Description',
      };

      const result = (await pipe.transform(payload, {
        type: 'body',
        metatype: UpdateFixedAssetDetailsRequestDto,
      })) as UpdateFixedAssetDetailsRequestDto;

      expect(result.name).toBe('Safe Name');
      expect(result.description).toBe('Safe Description');
    });
  });
});
