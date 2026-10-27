import { KinesiologySourceValidatorAdapter } from '../kinesiology-source-validator.adapter';
import { GymSourceValidatorAdapter } from '../gym-source-validator.adapter';
import { ResourcesSourceValidatorAdapter } from '../resources-source-validator.adapter';
import { SchedulingRoomSourceValidatorAdapter } from '../scheduling-room-source-validator.adapter';
import { CompositeSaleSourceValidatorAdapter } from '../composite-sale-source-validator.adapter';
import {
  GetTreatmentSessionByIdHandler,
  GetMembershipPlanByIdHandler,
  GetInventoryItemByIdHandler,
  GetRoomHandler,
  SessionStatus,
  SaleSourceType,
  RoomStatus,
  TreatmentSessionDTO,
  MembershipPlanDTO,
  InventoryItemDTO,
  RoomDTO,
} from '@kinergy-platform/core';

function successResult<T, R = unknown>(value: T): R {
  return {
    isSuccess: true,
    isFailure: false,
    getValue: () => value,
    getError: () => undefined,
  } as unknown as R;
}

function failureResult<R = unknown>(error: string): R {
  return {
    isSuccess: false,
    isFailure: true,
    getValue: () => {
      throw new Error('No value');
    },
    getError: () => error,
  } as unknown as R;
}

describe('Source Validation Hexagonal Adapters (ADR-0139)', () => {
  describe('1. KinesiologySourceValidatorAdapter', () => {
    let mockGetSessionHandler: jest.Mocked<GetTreatmentSessionByIdHandler>;
    let adapter: KinesiologySourceValidatorAdapter;

    const baseSession: TreatmentSessionDTO = {
      id: 'sess_100',
      version: 2,
      status: SessionStatus.COMPLETED,
      clientId: 'client_pt_123',
      therapistId: 'therapist_dr_smith',
      appointmentId: 'appt_999',
      notes: { subjective: 'Pain resolved' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    beforeEach(() => {
      mockGetSessionHandler = {
        execute: jest.fn(),
      } as unknown as jest.Mocked<GetTreatmentSessionByIdHandler>;

      adapter = new KinesiologySourceValidatorAdapter(mockGetSessionHandler);
    });

    it('should successfully validate a COMPLETED treatment session and map authoritative details', async () => {
      mockGetSessionHandler.execute.mockResolvedValueOnce(successResult(baseSession));

      const result = await adapter.validate({
        sourceType: SaleSourceType.KINESIOLOGY_SESSION,
        sourceId: 'sess_100',
      });

      expect(result.isValid).toBe(true);
      expect(result.exists).toBe(true);
      expect(result.belongsToContext).toBe(true);
      expect(result.actualContext).toBe('kinesiology');
      expect(result.commercialDetails).toEqual({
        clientId: 'client_pt_123',
        unitPriceCents: 8000,
        currency: 'USD',
        description: 'Clinical Kinesiology Session - Therapist therapist_dr_smith',
        skuOrCode: 'appt_999',
        version: 2,
      });
    });

    it('should reject a session that is still IN_PROGRESS (not billable)', async () => {
      const inProgressSession: TreatmentSessionDTO = {
        ...baseSession,
        status: SessionStatus.IN_PROGRESS,
      };
      mockGetSessionHandler.execute.mockResolvedValueOnce(successResult(inProgressSession));

      const result = await adapter.validate({
        sourceType: SaleSourceType.KINESIOLOGY_SESSION,
        sourceId: 'sess_100',
      });

      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(true);
      expect(result.errorMessage).toContain('IN_PROGRESS');
      expect(result.errorMessage).toContain('Only COMPLETED clinical sessions can be billed');
    });

    it('should reject a session that was CANCELLED', async () => {
      const cancelledSession: TreatmentSessionDTO = {
        ...baseSession,
        status: SessionStatus.CANCELLED,
      };
      mockGetSessionHandler.execute.mockResolvedValueOnce(successResult(cancelledSession));

      const result = await adapter.validate({
        sourceType: SaleSourceType.KINESIOLOGY_SESSION,
        sourceId: 'sess_100',
      });

      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(true);
      expect(result.errorMessage).toContain('CANCELLED');
    });

    it('should report non-existent session when query handler returns failure', async () => {
      mockGetSessionHandler.execute.mockResolvedValueOnce(
        failureResult("TreatmentSession with ID 'sess_missing' not found."),
      );

      const result = await adapter.validate({
        sourceType: SaleSourceType.KINESIOLOGY_SESSION,
        sourceId: 'sess_missing',
      });

      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.errorMessage).toContain('not found');
    });

    it('should reject empty sourceId without invoking handler', async () => {
      const result = await adapter.validate({
        sourceType: SaleSourceType.KINESIOLOGY_SESSION,
        sourceId: '   ',
      });

      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.errorMessage).toContain('cannot be empty');
      expect(mockGetSessionHandler.execute).not.toHaveBeenCalled();
    });

    it('should reject foreign source types that do not belong to Kinesiology', async () => {
      const result = await adapter.validate({
        sourceType: SaleSourceType.FOOD,
        sourceId: 'item_123',
      });

      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.belongsToContext).toBe(false);
    });

    it('should catch unexpected handler throws and preserve error transparency without swallowing into not found', async () => {
      mockGetSessionHandler.execute.mockRejectedValueOnce(
        new Error('PostgreSQL database connection timeout'),
      );

      const result = await adapter.validate({
        sourceType: SaleSourceType.KINESIOLOGY_SESSION,
        sourceId: 'sess_100',
      });

      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.errorMessage).toContain('PostgreSQL database connection timeout');
    });

    it('should return error when query handler is not configured', async () => {
      const unconfiguredAdapter = new KinesiologySourceValidatorAdapter(undefined);
      const result = await unconfiguredAdapter.validate({
        sourceType: SaleSourceType.KINESIOLOGY_SESSION,
        sourceId: 'sess_100',
      });

      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.errorMessage).toContain('not configured');
    });
  });

  describe('2. GymSourceValidatorAdapter', () => {
    let mockGetPlanHandler: jest.Mocked<GetMembershipPlanByIdHandler>;
    let adapter: GymSourceValidatorAdapter;

    const basePlan: MembershipPlanDTO = {
      id: 'plan_gold_01',
      code: 'GOLD_ANNUAL',
      name: 'Gold Annual Access',
      durationInDays: 365,
      priceAmount: 899.99,
      priceCurrency: 'USD',
      status: 'ACTIVE',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    beforeEach(() => {
      mockGetPlanHandler = {
        execute: jest.fn(),
      } as unknown as jest.Mocked<GetMembershipPlanByIdHandler>;

      adapter = new GymSourceValidatorAdapter(mockGetPlanHandler);
    });

    it('should successfully validate an ACTIVE membership plan and convert price to integer cents', async () => {
      mockGetPlanHandler.execute.mockResolvedValueOnce(successResult(basePlan));

      const result = await adapter.validate({
        sourceType: SaleSourceType.GYM_MEMBERSHIP,
        sourceId: 'plan_gold_01',
      });

      expect(result.isValid).toBe(true);
      expect(result.exists).toBe(true);
      expect(result.commercialDetails).toEqual({
        unitPriceCents: 89999, // $899.99 = 89999 cents
        currency: 'USD',
        description: 'Gym Membership - Gold Annual Access',
        skuOrCode: 'GOLD_ANNUAL',
        version: 1,
      });
    });

    it('should reject a DRAFT or ARCHIVED membership plan', async () => {
      const archivedPlan: MembershipPlanDTO = {
        ...basePlan,
        status: 'ARCHIVED',
      };
      mockGetPlanHandler.execute.mockResolvedValueOnce(successResult(archivedPlan));

      const result = await adapter.validate({
        sourceType: SaleSourceType.GYM_MEMBERSHIP,
        sourceId: 'plan_gold_01',
      });

      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(true);
      expect(result.errorMessage).toContain('ARCHIVED');
      expect(result.errorMessage).toContain('Only ACTIVE plans can be sold');
    });

    it('should report non-existent plan when query handler fails', async () => {
      mockGetPlanHandler.execute.mockResolvedValueOnce(
        failureResult("Membership plan with ID 'plan_missing' not found."),
      );

      const result = await adapter.validate({
        sourceType: SaleSourceType.GYM_MEMBERSHIP,
        sourceId: 'plan_missing',
      });

      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.errorMessage).toContain('not found');
    });

    it('should return error when query handler is not configured', async () => {
      const unconfiguredAdapter = new GymSourceValidatorAdapter(undefined);
      const result = await unconfiguredAdapter.validate({
        sourceType: SaleSourceType.GYM_MEMBERSHIP,
        sourceId: 'plan_01',
      });

      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.errorMessage).toContain('not configured');
    });
  });

  describe('3. ResourcesSourceValidatorAdapter', () => {
    let mockGetItemHandler: jest.Mocked<GetInventoryItemByIdHandler>;
    let adapter: ResourcesSourceValidatorAdapter;

    const baseItem: InventoryItemDTO = {
      id: 'inv_item_bar_01',
      sku: 'BAR-PROT-CHOC',
      name: 'Chocolate Protein Bar',
      category: 'HEALTHY_MEALS',
      unit: 'UNITS',
      minimumStock: 10,
      quantityOnHand: 45,
      purchaseCostAmount: 1.5,
      purchaseCostCurrency: 'USD',
      sellingPriceAmount: 3.5,
      sellingPriceCurrency: 'USD',
      status: 'ACTIVE',
      version: 4,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    beforeEach(() => {
      mockGetItemHandler = {
        execute: jest.fn(),
      } as unknown as jest.Mocked<GetInventoryItemByIdHandler>;

      adapter = new ResourcesSourceValidatorAdapter(mockGetItemHandler);
    });

    it('should successfully validate an ACTIVE food item with sufficient stock', async () => {
      mockGetItemHandler.execute.mockResolvedValueOnce(successResult(baseItem));

      const result = await adapter.validate({
        sourceType: SaleSourceType.FOOD,
        sourceId: 'inv_item_bar_01',
        requestedQuantity: 2,
      });

      expect(result.isValid).toBe(true);
      expect(result.exists).toBe(true);
      expect(result.commercialDetails).toEqual({
        unitPriceCents: 350, // $3.50 = 350 cents
        currency: 'USD',
        description: 'Chocolate Protein Bar',
        skuOrCode: 'BAR-PROT-CHOC',
        version: 4,
      });
    });

    it('should reject checkout when requested quantity exceeds quantity on hand', async () => {
      mockGetItemHandler.execute.mockResolvedValueOnce(successResult(baseItem));

      const result = await adapter.validate({
        sourceType: SaleSourceType.FOOD,
        sourceId: 'inv_item_bar_01',
        requestedQuantity: 50, // Available is 45
      });

      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(true);
      expect(result.errorMessage).toContain('Insufficient stock');
      expect(result.errorMessage).toContain('Available: 45, Requested: 50');
    });

    it('should reject an INACTIVE inventory item', async () => {
      const inactiveItem: InventoryItemDTO = {
        ...baseItem,
        status: 'INACTIVE',
      };
      mockGetItemHandler.execute.mockResolvedValueOnce(successResult(inactiveItem));

      const result = await adapter.validate({
        sourceType: SaleSourceType.DRINK,
        sourceId: 'inv_item_bar_01',
      });

      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(true);
      expect(result.errorMessage).toContain('INACTIVE');
      expect(result.errorMessage).toContain('Only ACTIVE items can be sold');
    });

    it('should return error when query handler is not configured', async () => {
      const unconfiguredAdapter = new ResourcesSourceValidatorAdapter(undefined);
      const result = await unconfiguredAdapter.validate({
        sourceType: SaleSourceType.FOOD,
        sourceId: 'inv_item_01',
      });

      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.errorMessage).toContain('not configured');
    });
  });

  describe('4. SchedulingRoomSourceValidatorAdapter', () => {
    let mockGetRoomHandler: jest.Mocked<GetRoomHandler>;
    let adapter: SchedulingRoomSourceValidatorAdapter;

    const baseRoom: RoomDTO = {
      id: 'room_101',
      name: 'Studio A - Movement Lab',
      capacity: 15,
      status: RoomStatus.AVAILABLE,
      resourceType: 'ROOM',
      features: ['mirrors', 'sound_system'],
      maintenanceWindows: [],
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    beforeEach(() => {
      mockGetRoomHandler = {
        execute: jest.fn(),
      } as unknown as jest.Mocked<GetRoomHandler>;

      adapter = new SchedulingRoomSourceValidatorAdapter(mockGetRoomHandler);
    });

    it('should successfully validate an AVAILABLE room and map authoritative details', async () => {
      mockGetRoomHandler.execute.mockResolvedValueOnce(successResult(baseRoom));

      const result = await adapter.validate({
        sourceType: SaleSourceType.ROOM_RENTAL,
        sourceId: 'room_101',
      });

      expect(result.isValid).toBe(true);
      expect(result.exists).toBe(true);
      expect(result.belongsToContext).toBe(true);
      expect(result.actualContext).toBe('scheduling');
      expect(result.commercialDetails).toEqual({
        unitPriceCents: 6000,
        currency: 'USD',
        description: 'Room Rental - Studio A - Movement Lab (Capacity: 15)',
        skuOrCode: 'room_101',
        version: 1,
      });
    });

    it('should reject a room that is currently in MAINTENANCE status', async () => {
      const maintenanceRoom: RoomDTO = {
        ...baseRoom,
        status: RoomStatus.MAINTENANCE,
        maintenanceReason: 'HVAC repair',
      };
      mockGetRoomHandler.execute.mockResolvedValueOnce(successResult(maintenanceRoom));

      const result = await adapter.validate({
        sourceType: SaleSourceType.ROOM_RENTAL,
        sourceId: 'room_101',
      });

      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(true);
      expect(result.errorMessage).toContain('currently under maintenance and cannot be rented');
    });

    it('should reject a room that is UNAVAILABLE', async () => {
      const unavailableRoom: RoomDTO = {
        ...baseRoom,
        status: RoomStatus.UNAVAILABLE,
      };
      mockGetRoomHandler.execute.mockResolvedValueOnce(successResult(unavailableRoom));

      const result = await adapter.validate({
        sourceType: SaleSourceType.ROOM_RENTAL,
        sourceId: 'room_101',
      });

      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(true);
      expect(result.errorMessage).toContain('cannot be rented');
    });

    it('should return not found when room does not exist', async () => {
      mockGetRoomHandler.execute.mockResolvedValueOnce(
        failureResult("Room with id 'non_existent_room' not found."),
      );

      const result = await adapter.validate({
        sourceType: SaleSourceType.ROOM_RENTAL,
        sourceId: 'non_existent_room',
      });

      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.errorMessage).toContain('not found');
    });

    it('should reject empty room ID', async () => {
      const result = await adapter.validate({
        sourceType: SaleSourceType.ROOM_RENTAL,
        sourceId: '   ',
      });

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('cannot be empty');
    });

    it('should reject unmanaged source types', async () => {
      const result = await adapter.validate({
        sourceType: SaleSourceType.FOOD,
        sourceId: 'room_1',
      });

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('not managed by Scheduling');
    });
  });

  describe('5. CompositeSaleSourceValidatorAdapter', () => {
    let kinesiologyAdapter: KinesiologySourceValidatorAdapter;
    let gymAdapter: GymSourceValidatorAdapter;
    let resourcesAdapter: ResourcesSourceValidatorAdapter;
    let schedulingRoomAdapter: SchedulingRoomSourceValidatorAdapter;
    let composite: CompositeSaleSourceValidatorAdapter;

    beforeEach(() => {
      kinesiologyAdapter = {
        validate: jest.fn().mockResolvedValue({ isValid: true, exists: true }),
      } as unknown as KinesiologySourceValidatorAdapter;

      gymAdapter = {
        validate: jest.fn().mockResolvedValue({ isValid: true, exists: true }),
      } as unknown as GymSourceValidatorAdapter;

      resourcesAdapter = {
        validate: jest.fn().mockResolvedValue({ isValid: true, exists: true }),
      } as unknown as ResourcesSourceValidatorAdapter;

      schedulingRoomAdapter = {
        validate: jest.fn().mockResolvedValue({
          isValid: true,
          exists: true,
          belongsToContext: true,
          actualContext: 'scheduling',
          commercialDetails: {
            unitPriceCents: 6000,
            currency: 'USD',
            description: 'Room Rental - Studio A',
            skuOrCode: 'room_1',
          },
        }),
      } as unknown as SchedulingRoomSourceValidatorAdapter;

      composite = new CompositeSaleSourceValidatorAdapter(
        kinesiologyAdapter,
        gymAdapter,
        resourcesAdapter,
        schedulingRoomAdapter,
      );
    });

    it('should route KINESIOLOGY_SESSION to kinesiologyAdapter', async () => {
      await composite.validateSource({
        sourceType: SaleSourceType.KINESIOLOGY_SESSION,
        sourceId: 'sess_1',
      });

      expect(kinesiologyAdapter.validate).toHaveBeenCalledWith(
        expect.objectContaining({ sourceType: SaleSourceType.KINESIOLOGY_SESSION }),
      );
      expect(gymAdapter.validate).not.toHaveBeenCalled();
      expect(resourcesAdapter.validate).not.toHaveBeenCalled();
      expect(schedulingRoomAdapter.validate).not.toHaveBeenCalled();
    });

    it('should route GYM_MEMBERSHIP to gymAdapter', async () => {
      await composite.validateSource({
        sourceType: SaleSourceType.GYM_MEMBERSHIP,
        sourceId: 'plan_1',
      });

      expect(gymAdapter.validate).toHaveBeenCalledWith(
        expect.objectContaining({ sourceType: SaleSourceType.GYM_MEMBERSHIP }),
      );
      expect(kinesiologyAdapter.validate).not.toHaveBeenCalled();
    });

    it('should route FOOD and DRINK to resourcesAdapter', async () => {
      await composite.validateSource({
        sourceType: SaleSourceType.FOOD,
        sourceId: 'bar_1',
      });
      await composite.validateSource({
        sourceType: SaleSourceType.DRINK,
        sourceId: 'water_1',
      });

      expect(resourcesAdapter.validate).toHaveBeenCalledTimes(2);
    });

    it('should route ROOM_RENTAL to schedulingRoomAdapter', async () => {
      const result = await composite.validateSource({
        sourceType: SaleSourceType.ROOM_RENTAL,
        sourceId: 'room_studio_a',
      });

      expect(schedulingRoomAdapter.validate).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: SaleSourceType.ROOM_RENTAL,
          sourceId: 'room_studio_a',
        }),
      );
      expect(result.isValid).toBe(true);
      expect(result.commercialDetails?.unitPriceCents).toBe(6000);
    });

    it('should reject unsupported source types', async () => {
      const result = await composite.validateSource({
        sourceType: 'UNKNOWN_TYPE',
        sourceId: 'unknown_1',
      });

      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.errorMessage).toContain('Unsupported source type');
    });

    it('should report when a domain validator adapter is not configured', async () => {
      const emptyComposite = new CompositeSaleSourceValidatorAdapter();

      const kineResult = await emptyComposite.validateSource({
        sourceType: SaleSourceType.KINESIOLOGY_SESSION,
        sourceId: 'sess_1',
      });
      expect(kineResult.isValid).toBe(false);
      expect(kineResult.errorMessage).toContain('Kinesiology validator adapter is not configured');

      const gymResult = await emptyComposite.validateSource({
        sourceType: SaleSourceType.GYM_MEMBERSHIP,
        sourceId: 'plan_1',
      });
      expect(gymResult.isValid).toBe(false);
      expect(gymResult.errorMessage).toContain('Gym validator adapter is not configured');

      const resResult = await emptyComposite.validateSource({
        sourceType: SaleSourceType.FOOD,
        sourceId: 'item_1',
      });
      expect(resResult.isValid).toBe(false);
      expect(resResult.errorMessage).toContain('Resources validator adapter is not configured');

      const roomResult = await emptyComposite.validateSource({
        sourceType: SaleSourceType.ROOM_RENTAL,
        sourceId: 'room_1',
      });
      expect(roomResult.isValid).toBe(false);
      expect(roomResult.errorMessage).toContain(
        'Scheduling room validator adapter is not configured',
      );
    });

    it('should reject invalid input without sourceId or sourceType', async () => {
      const result = await composite.validateSource({
        sourceType: '',
        sourceId: '',
      });
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('sourceType and sourceId are required');
    });
  });
});
