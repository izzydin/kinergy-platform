import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  CreateFixedAssetHandler,
  UpdateFixedAssetDetailsHandler,
  TransferFixedAssetLocationHandler,
  ChangeFixedAssetStatusHandler,
  UpdateFixedAssetConditionHandler,
  RecordAssetMaintenanceHandler,
  UpdateFixedAssetValuationHandler,
  GetFixedAssetByIdHandler,
  GetFixedAssetByTagHandler,
  ListFixedAssetsHandler,
  GetAssetHistoryHandler,
  GetMaintenanceHistoryHandler,
  GetAssetValueHandler,
  GetFixedAssetValuationSummaryHandler,
  ResourcesApplicationResult,
  AssetCategory,
  AssetStatus,
  AssetCondition,
  AssetHistoryEventType,
  FixedAssetDTO,
  AssetMaintenanceRecordDTO,
  AssetHistoryEventDTO,
  AssetValuationDTO,
  FixedAssetValuationSummaryDTO,
} from '@kinergy-platform/core';
import { FixedAssetsController } from '../controllers/fixed-assets.controller';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import {
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

describe('FixedAssetsController HTTP Contracts (Milestone 6.9)', () => {
  let controller: FixedAssetsController;

  let createHandler: jest.Mocked<CreateFixedAssetHandler>;
  let updateDetailsHandler: jest.Mocked<UpdateFixedAssetDetailsHandler>;
  let transferHandler: jest.Mocked<TransferFixedAssetLocationHandler>;
  let statusHandler: jest.Mocked<ChangeFixedAssetStatusHandler>;
  let conditionHandler: jest.Mocked<UpdateFixedAssetConditionHandler>;
  let maintenanceHandler: jest.Mocked<RecordAssetMaintenanceHandler>;
  let valuationHandler: jest.Mocked<UpdateFixedAssetValuationHandler>;
  let getByIdHandler: jest.Mocked<GetFixedAssetByIdHandler>;
  let getByTagHandler: jest.Mocked<GetFixedAssetByTagHandler>;
  let listHandler: jest.Mocked<ListFixedAssetsHandler>;
  let historyHandler: jest.Mocked<GetAssetHistoryHandler>;
  let maintenanceHistoryHandler: jest.Mocked<GetMaintenanceHistoryHandler>;
  let assetValueHandler: jest.Mocked<GetAssetValueHandler>;
  let valuationSummaryHandler: jest.Mocked<GetFixedAssetValuationSummaryHandler>;

  const mockUser = new AuthenticatedUserContext({
    userId: 'usr_admin_01',
    email: 'admin@kinergy.platform',
    status: 'ACTIVE',
    roles: ['ADMIN'],
    permissions: ['assets.read', 'assets.write', 'billing.read'],
    tenantId: 'tenant_main',
  });

  const mockAssetDTO: FixedAssetDTO = {
    id: 'ast_123',
    tenantId: 'tenant_main',
    assetTag: 'AST-KNE-2026-001',
    name: 'Biodex System 4 Pro Isokinetic Dynamometer',
    description: 'Multi-joint testing and rehabilitation system',
    category: AssetCategory.THERAPY_EQUIPMENT,
    status: AssetStatus.ACTIVE,
    condition: AssetCondition.EXCELLENT,
    purchaseDate: new Date('2026-01-15T00:00:00.000Z'),
    purchaseValueAmount: 45000.0,
    purchaseValueCurrency: 'USD',
    currentEstimatedValueAmount: 45000.0,
    currentEstimatedValueCurrency: 'USD',
    location: {
      facilityId: 'fac_main',
      roomId: 'room_rehab_01',
      zone: 'Zone A',
      description: 'Physical Therapy Suite 1',
      formatted: 'fac_main / room_rehab_01 (Zone A)',
    },
    historyEventsCount: 0,
    maintenanceRecordsCount: 0,
    version: 1,
    createdAt: new Date('2026-01-15T00:00:00.000Z'),
    updatedAt: new Date('2026-01-15T00:00:00.000Z'),
  };

  beforeEach(() => {
    createHandler = { execute: jest.fn() } as unknown as jest.Mocked<CreateFixedAssetHandler>;
    updateDetailsHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateFixedAssetDetailsHandler>;
    transferHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<TransferFixedAssetLocationHandler>;
    statusHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ChangeFixedAssetStatusHandler>;
    conditionHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateFixedAssetConditionHandler>;
    maintenanceHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<RecordAssetMaintenanceHandler>;
    valuationHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateFixedAssetValuationHandler>;
    getByIdHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetFixedAssetByIdHandler>;
    getByTagHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetFixedAssetByTagHandler>;
    listHandler = { execute: jest.fn() } as unknown as jest.Mocked<ListFixedAssetsHandler>;
    historyHandler = { execute: jest.fn() } as unknown as jest.Mocked<GetAssetHistoryHandler>;
    maintenanceHistoryHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetMaintenanceHistoryHandler>;
    assetValueHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetAssetValueHandler>;
    valuationSummaryHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetFixedAssetValuationSummaryHandler>;

    controller = new FixedAssetsController(
      createHandler,
      updateDetailsHandler,
      transferHandler,
      statusHandler,
      conditionHandler,
      maintenanceHandler,
      valuationHandler,
      getByIdHandler,
      getByTagHandler,
      listHandler,
      historyHandler,
      maintenanceHistoryHandler,
      assetValueHandler,
      valuationSummaryHandler,
    );
  });

  describe('1. Static Taxonomy & Categories', () => {
    it('returns code-defined fixed asset category taxonomy metadata', () => {
      const categories = controller.getCategories();
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBe(6);
      expect(categories.find((c) => c.code === AssetCategory.GYM_EQUIPMENT)).toEqual({
        code: AssetCategory.GYM_EQUIPMENT,
        displayName: 'Gym Equipment',
        description: expect.any(String),
        requiresMaintenance: true,
        defaultInspectionIntervalDays: 90,
      });
    });
  });

  describe('2. Fixed Asset Registration & Retrieval Contracts', () => {
    it('creates a new fixed asset and maps DTO to CreateFixedAssetCommand', async () => {
      const dto: CreateFixedAssetRequestDto = {
        assetTag: 'AST-KNE-2026-001',
        name: 'Biodex System 4 Pro Isokinetic Dynamometer',
        description: 'Multi-joint testing and rehabilitation system',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseDate: '2026-01-15T00:00:00.000Z',
        purchaseValueAmount: 45000.0,
        purchaseValueCurrency: 'USD',
        condition: AssetCondition.EXCELLENT,
        status: AssetStatus.ACTIVE,
        location: {
          facilityId: 'fac_main',
          roomId: 'room_rehab_01',
          zone: 'Zone A',
          description: 'Physical Therapy Suite 1',
        },
      };

      createHandler.execute.mockResolvedValueOnce(ResourcesApplicationResult.ok(mockAssetDTO));

      const result = await controller.createAsset(dto, mockUser);
      expect(result).toEqual(mockAssetDTO);
      expect(createHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            assetTag: 'AST-KNE-2026-001',
            name: 'Biodex System 4 Pro Isokinetic Dynamometer',
            category: AssetCategory.THERAPY_EQUIPMENT,
            actorId: 'usr_admin_01',
          }),
        }),
      );
    });

    it('retrieves asset by ID and throws NotFoundException when missing', async () => {
      getByIdHandler.execute.mockResolvedValueOnce(ResourcesApplicationResult.ok(mockAssetDTO));
      const res = await controller.getAsset('ast_123', mockUser);
      expect(res).toEqual(mockAssetDTO);

      getByIdHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.fail("Fixed asset with ID 'ast_999' not found."),
      );
      await expect(controller.getAsset('ast_999', mockUser)).rejects.toThrow(NotFoundException);
    });

    it('retrieves asset by hardware barcode/RFID asset tag via GET /tag/:tag', async () => {
      getByTagHandler.execute.mockResolvedValueOnce(ResourcesApplicationResult.ok(mockAssetDTO));
      const res = await controller.getAssetByTag('AST-KNE-2026-001', mockUser);
      expect(res.assetTag).toBe('AST-KNE-2026-001');

      getByTagHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.fail("Fixed asset with asset tag 'INVALID-TAG' was not found."),
      );
      await expect(controller.getAssetByTag('INVALID-TAG', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('3. Query, Filtering, Search & Pagination Contracts', () => {
    it('lists assets with multi-criteria filtering, location filter, and pagination metadata', async () => {
      const queryDto: ListFixedAssetsQueryDto = {
        search: 'Biodex',
        category: AssetCategory.THERAPY_EQUIPMENT,
        status: AssetStatus.ACTIVE,
        condition: AssetCondition.EXCELLENT,
        facilityId: 'fac_main',
        roomId: 'room_rehab_01',
        includeDecommissioned: false,
        page: 1,
        limit: 20,
        sortBy: 'name',
        sortOrder: 'asc',
      };

      const paginatedResult = {
        items: [mockAssetDTO],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      };

      listHandler.execute.mockResolvedValueOnce(ResourcesApplicationResult.ok(paginatedResult));

      const res = await controller.listAssets(queryDto, mockUser);
      expect(res.items).toHaveLength(1);
      expect(res.total).toBe(1);
      expect(res.page).toBe(1);
      expect(res.limit).toBe(20);
      expect(listHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            filter: expect.objectContaining({
              search: 'Biodex',
              category: AssetCategory.THERAPY_EQUIPMENT,
              facilityId: 'fac_main',
              roomId: 'room_rehab_01',
            }),
          }),
        }),
      );
    });
  });

  describe('4. Generic Update Boundary Contracts', () => {
    it('updates only descriptive metadata and notes, preserving state machine and location boundaries', async () => {
      const updateDto: UpdateFixedAssetDetailsRequestDto = {
        name: 'Biodex System 4 Pro (Calibrated)',
        description: 'Updated calibration profile',
        notes: 'Monthly maintenance certified',
        reason: 'Periodic description enhancement',
      };

      updateDetailsHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          ...mockAssetDTO,
          name: 'Biodex System 4 Pro (Calibrated)',
        }),
      );

      const res = await controller.updateDetails('ast_123', updateDto, mockUser);
      expect(res.name).toBe('Biodex System 4 Pro (Calibrated)');
      expect(updateDetailsHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            id: 'ast_123',
            name: 'Biodex System 4 Pro (Calibrated)',
            actorId: 'usr_admin_01',
          }),
        }),
      );
    });
  });

  describe('5. Explicit Lifecycle & State Mutation Contracts', () => {
    it('transfers asset physical location via POST :id/transfer', async () => {
      const transferDto: TransferFixedAssetLocationRequestDto = {
        location: {
          facilityId: 'fac_secondary',
          roomId: 'room_gym_02',
          zone: 'Zone B',
          description: 'Rehabilitation Floor 2',
        },
        reason: 'Departmental relocation',
      };

      transferHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          ...mockAssetDTO,
          location: {
            ...transferDto.location,
            formatted: 'fac_secondary / room_gym_02',
          },
        }),
      );

      const res = await controller.transferLocation('ast_123', transferDto, mockUser);
      expect(res.location.facilityId).toBe('fac_secondary');
      expect(res.location.roomId).toBe('room_gym_02');
    });

    it('throws BadRequestException on invalid transfer (e.g. decommissioned asset)', async () => {
      const transferDto: TransferFixedAssetLocationRequestDto = {
        location: { facilityId: 'fac_main', roomId: 'room_01' },
      };

      transferHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.fail('Cannot transfer decommissioned asset.'),
      );

      await expect(controller.transferLocation('ast_123', transferDto, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('transitions lifecycle status via POST :id/status and enforces state machine', async () => {
      const statusDto: ChangeFixedAssetStatusRequestDto = {
        status: AssetStatus.UNDER_MAINTENANCE,
        reason: 'Scheduled quarterly hydraulic calibration',
      };

      statusHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          ...mockAssetDTO,
          status: AssetStatus.UNDER_MAINTENANCE,
        }),
      );

      const res = await controller.changeStatus('ast_123', statusDto, mockUser);
      expect(res.status).toBe(AssetStatus.UNDER_MAINTENANCE);
    });

    it('throws BadRequestException when state machine rejects invalid status transition', async () => {
      const statusDto: ChangeFixedAssetStatusRequestDto = {
        status: AssetStatus.ACTIVE,
        reason: 'Attempting invalid transition from SOLD',
      };

      statusHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.fail(
          'Invalid state transition: Cannot transition from SOLD to ACTIVE.',
        ),
      );

      await expect(controller.changeStatus('ast_123', statusDto, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('updates physical condition rating via POST :id/condition', async () => {
      const conditionDto: UpdateFixedAssetConditionRequestDto = {
        condition: AssetCondition.GOOD,
        reason: 'Normal wear after 6 months of clinic usage',
      };

      conditionHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          ...mockAssetDTO,
          condition: AssetCondition.GOOD,
        }),
      );

      const res = await controller.changeCondition('ast_123', conditionDto, mockUser);
      expect(res.condition).toBe(AssetCondition.GOOD);
    });

    it('records servicing work order via POST :id/maintenance', async () => {
      const maintenanceDto: RecordAssetMaintenanceRequestDto = {
        serviceDate: '2026-08-30T10:00:00.000Z',
        description: 'Replaced hydraulic actuator seals and calibrated dynamometer arm',
        costAmount: 450.0,
        costCurrency: 'USD',
        performedBy: 'Biodex Certified Field Tech #88',
        updateConditionTo: AssetCondition.EXCELLENT,
        notes: 'Passed all mechanical tolerance safety tests',
      };

      const mockMaintenanceDTO: AssetMaintenanceRecordDTO = {
        id: 'maint_001',
        assetId: 'ast_123',
        serviceDate: new Date('2026-08-30T10:00:00.000Z'),
        description: 'Replaced hydraulic actuator seals and calibrated dynamometer arm',
        costAmount: 450.0,
        costCurrency: 'USD',
        performedBy: 'Biodex Certified Field Tech #88',
        notes: 'Passed all mechanical tolerance safety tests',
        recordedByUserId: 'usr_admin_01',
        createdAt: new Date('2026-08-30T10:00:00.000Z'),
      };

      maintenanceHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok(mockMaintenanceDTO),
      );

      const res = await controller.recordMaintenance('ast_123', maintenanceDto, mockUser);
      expect(res.performedBy).toBe('Biodex Certified Field Tech #88');
      expect(res.costAmount).toBe(450.0);
    });

    it('records asset appraisal revaluation via POST :id/valuation', async () => {
      const valuationDto: UpdateFixedAssetValuationRequestDto = {
        estimatedValueAmount: 38000.0,
        currency: 'USD',
        reason: 'Annual fair market depreciation appraisal',
      };

      valuationHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          ...mockAssetDTO,
          currentEstimatedValueAmount: 38000.0,
        }),
      );

      const res = await controller.updateValuation('ast_123', valuationDto, mockUser);
      expect(res.id).toBe('ast_123');
    });
  });

  describe('6. History & Financial Valuation Queries', () => {
    it('retrieves chronological asset lifecycle audit events via GET :id/history', async () => {
      const queryDto: GetAssetHistoryQueryDto = {
        eventType: AssetHistoryEventType.TRANSFERRED,
        page: 1,
        limit: 20,
      };

      const mockHistoryEvent: AssetHistoryEventDTO = {
        id: 'evt_001',
        assetId: 'ast_123',
        eventType: AssetHistoryEventType.TRANSFERRED,
        description: 'Transferred to Room 02',
        recordedByUserId: 'usr_admin_01',
        recordedAt: new Date('2026-08-30T10:00:00.000Z'),
      };

      historyHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          items: [mockHistoryEvent],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        }),
      );

      const res = await controller.getAssetHistory('ast_123', queryDto, mockUser);
      expect(res.items).toHaveLength(1);
      expect(res.items[0]?.eventType).toBe(AssetHistoryEventType.TRANSFERRED);
    });

    it('retrieves servicing work orders via GET :id/maintenance', async () => {
      const queryDto: GetMaintenanceHistoryQueryDto = {
        page: 1,
        limit: 20,
      };

      const mockRecord: AssetMaintenanceRecordDTO = {
        id: 'maint_001',
        assetId: 'ast_123',
        serviceDate: new Date('2026-08-30T10:00:00.000Z'),
        description: 'Hydraulic overhaul',
        costAmount: 450.0,
        costCurrency: 'USD',
        performedBy: 'Biodex Field Tech',
        recordedByUserId: 'usr_admin_01',
        createdAt: new Date('2026-08-30T10:00:00.000Z'),
      };

      maintenanceHistoryHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          items: [mockRecord],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        }),
      );

      const res = await controller.getMaintenanceHistory('ast_123', queryDto, mockUser);
      expect(res.items).toHaveLength(1);
      expect(res.items[0]?.performedBy).toBe('Biodex Field Tech');
    });

    it('retrieves single asset valuation details via GET :id/valuation', async () => {
      const valResult: AssetValuationDTO = {
        assetId: 'ast_123',
        assetTag: 'AST-KNE-2026-001',
        name: 'Biodex System 4 Pro',
        category: AssetCategory.THERAPY_EQUIPMENT,
        status: AssetStatus.ACTIVE,
        condition: AssetCondition.EXCELLENT,
        purchaseDate: new Date('2026-01-15T00:00:00.000Z'),
        purchaseValueAmount: 45000.0,
        purchaseValueCurrency: 'USD',
        currentEstimatedValueAmount: 38000.0,
        currentEstimatedValueCurrency: 'USD',
        lastValuationDate: new Date('2026-08-30T00:00:00.000Z'),
      };

      assetValueHandler.execute.mockResolvedValueOnce(ResourcesApplicationResult.ok(valResult));

      const res = await controller.getAssetValue('ast_123', mockUser);
      expect(res.assetId).toBe('ast_123');
      expect(res.purchaseValueAmount).toBe(45000.0);
      expect(res.currentEstimatedValueAmount).toBe(38000.0);
    });

    it('retrieves fixed asset estate valuation summary via GET /valuation/summary', async () => {
      const summaryResult: FixedAssetValuationSummaryDTO = {
        totalAssetCount: 15,
        activeAssetCount: 14,
        totalCarryingValueAmount: 185000.0,
        totalPurchaseValueAmount: 220000.0,
        currency: 'USD',
        calculatedAt: '2026-08-31T15:00:00.000Z',
        breakdownByCategory: {},
        breakdownByStatus: {},
        breakdownByCondition: {},
      };

      valuationSummaryHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok(summaryResult),
      );

      const res = await controller.getValuationSummary(mockUser);
      expect(res.totalAssetCount).toBe(15);
      expect(res.activeAssetCount).toBe(14);
      expect(res.totalCarryingValueAmount).toBe(185000.0);
      expect(res.currency).toBe('USD');
    });
  });
});
