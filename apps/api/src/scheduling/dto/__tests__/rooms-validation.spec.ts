import {
  CreateRoomSchema,
  EditRoomSchema,
  ScheduleMaintenanceSchema,
  CheckRoomAvailabilitySchema,
  ListRoomsSchema,
} from '../zod-schemas';

describe('Room & Maintenance Request DTO Validation Specs', () => {
  describe('CreateRoomSchema', () => {
    it('validates a valid room creation payload', () => {
      const valid = {
        name: 'Hydrotherapy Suite 1',
        capacity: 2,
        features: ['hydrotherapy_tub', 'soundproof'],
      };
      const result = CreateRoomSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.capacity).toBe(2);
        expect(result.data.features).toHaveLength(2);
      }
    });

    it('rejects empty room name', () => {
      const invalid = {
        name: '',
        capacity: 1,
      };
      const result = CreateRoomSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects non-positive capacity', () => {
      const invalid = {
        name: 'Suite',
        capacity: 0,
      };
      const result = CreateRoomSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('EditRoomSchema', () => {
    it('validates partial updates and expectedVersion', () => {
      const valid = {
        name: 'Updated Suite',
        capacity: 3,
        expectedVersion: 1,
      };
      const result = EditRoomSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe('ScheduleMaintenanceSchema', () => {
    it('validates maintenance window parameters', () => {
      const valid = {
        startTime: '2026-09-01T12:00:00.000Z',
        endTime: '2026-09-01T14:00:00.000Z',
        reason: 'Ozone purification cycle',
        expectedVersion: 2,
      };
      const result = ScheduleMaintenanceSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects missing reason or timestamps', () => {
      const invalid = {
        startTime: '2026-09-01T12:00:00.000Z',
        endTime: '2026-09-01T14:00:00.000Z',
        reason: '',
      };
      const result = ScheduleMaintenanceSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('CheckRoomAvailabilitySchema', () => {
    it('validates availability query with required timestamps and optional filters', () => {
      const valid = {
        startTime: '2026-09-01T10:00:00.000Z',
        endTime: '2026-09-01T11:00:00.000Z',
        roomId: 'room_1',
        requiredFeatures: ['hydrotherapy_tub'],
        requiredCapacity: 2,
      };
      const result = CheckRoomAvailabilitySchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe('ListRoomsSchema', () => {
    it('validates list filter query parameters', () => {
      const valid = {
        status: 'AVAILABLE',
        features: ['tub'],
        minCapacity: 1,
      };
      const result = ListRoomsSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });
});
