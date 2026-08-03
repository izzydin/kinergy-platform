import { SlotFinderEngine } from './slot-finder.engine';
import { ConflictDetectionService } from './conflict-detection.service';
import { SlotSearchQuery, MultiResourceSlotSearchQuery } from './dtos/slot-search-query.vo';
import { Duration } from '../value-objects/duration.vo';
import { TimeRange } from '../value-objects/time-range.vo';
import { Room } from '../room/room.aggregate';
import { RoomId } from '../room/room-id.vo';
import { RoomRepository } from '../repositories/room.repository';
import { SchedulingConflict } from '../value-objects/scheduling-conflict.vo';

describe('SlotFinderEngine', () => {
  let conflictService: jest.Mocked<ConflictDetectionService>;
  let roomRepo: jest.Mocked<RoomRepository>;
  let engine: SlotFinderEngine;

  const startDate = new Date('2026-08-03T09:00:00.000Z');
  const endDate = new Date('2026-08-03T11:00:00.000Z'); // 2-hour window
  const duration = Duration.fromMinutes(60);

  beforeEach(() => {
    conflictService = {
      detectConflicts: jest.fn().mockResolvedValue([]),
      evaluateConflicts: jest.fn().mockResolvedValue({ hasConflicts: false, conflicts: [] }),
    } as unknown as jest.Mocked<ConflictDetectionService>;

    roomRepo = {
      findById: jest.fn(),
      findAvailableRooms: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
    };

    engine = new SlotFinderEngine(conflictService, roomRepo);
  });

  describe('findNextAvailableSlot', () => {
    it('should return the earliest unconflicted slot', async () => {
      const query = new SlotSearchQuery({
        therapistId: 'therapist_1',
        roomId: 'room_1',
        duration,
        startDate,
        endDate,
        stepIntervalMinutes: 15,
      });

      const slot = await engine.findNextAvailableSlot(query);

      expect(slot).not.toBeNull();
      expect(slot?.start.toISOString()).toBe('2026-08-03T09:00:00.000Z');
      expect(slot?.end.toISOString()).toBe('2026-08-03T10:00:00.000Z');
    });

    it('should return null if all candidate slots have conflicts', async () => {
      const conflict = SchedulingConflict.create({
        conflictType: 'THERAPIST',
        conflictingEntityId: 'therapist_1',
        requestedRange: TimeRange.create(startDate, endDate),
        reason: 'Therapist unavailable',
      });

      conflictService.detectConflicts.mockResolvedValue([conflict]);

      const query = new SlotSearchQuery({
        therapistId: 'therapist_1',
        roomId: 'room_1',
        duration,
        startDate,
        endDate,
      });

      const slot = await engine.findNextAvailableSlot(query);
      expect(slot).toBeNull();
    });
  });

  describe('findAvailableSlots', () => {
    it('should return discrete candidate slots stepped by 15 minutes', async () => {
      const query = new SlotSearchQuery({
        therapistId: 'therapist_1',
        roomId: 'room_1',
        duration,
        startDate,
        endDate,
        stepIntervalMinutes: 15,
      });

      const results = await engine.findAvailableSlots(query);

      // In a 2-hour window (09:00 to 11:00) for a 60-min slot with 15-min steps:
      // Candidate starts: 09:00, 09:15, 09:30, 09:45, 10:00 (5 total slots)
      expect(results).toHaveLength(5);
      expect(results[0]?.timeRange.start.toISOString()).toBe('2026-08-03T09:00:00.000Z');
      expect(results[4]?.timeRange.start.toISOString()).toBe('2026-08-03T10:00:00.000Z');
    });
  });

  describe('findCompatibleCombinations', () => {
    it('should find matrix combinations for candidate rooms and therapists', async () => {
      const hydroRoom = Room.create({
        id: RoomId.create('hydro_1'),
        name: 'Hydro Suite',
        capacity: 4,
        features: ['hydraulic_table'],
      });
      roomRepo.findAvailableRooms.mockResolvedValue([hydroRoom]);

      const query = new MultiResourceSlotSearchQuery({
        therapistIds: ['therapist_1', 'therapist_2'],
        requiredFeatures: ['hydraulic_table'],
        requiredCapacity: 2,
        duration,
        startDate,
        endDate,
        stepIntervalMinutes: 30,
      });

      const combinations = await engine.findCompatibleCombinations(query);

      expect(combinations.length).toBeGreaterThan(0);
      expect(combinations.some((c) => c.therapistId === 'therapist_1')).toBe(true);
      expect(combinations.some((c) => c.therapistId === 'therapist_2')).toBe(true);
      expect(combinations[0]?.roomId).toBe('hydro_1');
    });
  });
});
