import { SlotFinderEngine } from './slot-finder.engine';
import { ConflictDetectionService } from './conflict-detection.service';
import { SlotSearchQuery, MultiResourceSlotSearchQuery } from './dtos/slot-search-query.vo';
import { Duration } from '../value-objects/duration.vo';
import { Room } from '../room/room.aggregate';
import { RoomId } from '../room/room-id.vo';
import { RoomRepository } from '../repositories/room.repository';
import { SchedulingConflict } from '../value-objects/scheduling-conflict.vo';
import { TimeRange } from '../value-objects/time-range.vo';

describe('SlotFinderEngine Stress & Edge-Case Verification', () => {
  let conflictService: jest.Mocked<ConflictDetectionService>;
  let roomRepo: jest.Mocked<RoomRepository>;
  let engine: SlotFinderEngine;

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

  describe('High-Density & Multi-Day Search Windows', () => {
    it('should calculate 96 discrete slots for a 24-hour window stepped at 15 minutes', async () => {
      const startDate = new Date('2026-08-03T00:00:00.000Z');
      const endDate = new Date('2026-08-04T00:00:00.000Z'); // 24 hours

      const query = new SlotSearchQuery({
        therapistId: 'therapist_1',
        roomId: 'room_1',
        duration: Duration.fromMinutes(15),
        startDate,
        endDate,
        stepIntervalMinutes: 15,
      });

      const slots = await engine.findAvailableSlots(query);
      expect(slots).toHaveLength(96);
    });

    it('should return empty array gracefully when zero slots are available', async () => {
      const conflict = SchedulingConflict.create({
        conflictType: 'THERAPIST',
        conflictingEntityId: 'therapist_1',
        requestedRange: TimeRange.create(
          new Date('2026-08-03T09:00:00.000Z'),
          new Date('2026-08-03T17:00:00.000Z'),
        ),
        reason: 'Therapist unavailable',
      });
      conflictService.detectConflicts.mockResolvedValue([conflict]);

      const query = new SlotSearchQuery({
        therapistId: 'therapist_1',
        roomId: 'room_1',
        duration: Duration.fromMinutes(60),
        startDate: new Date('2026-08-03T09:00:00.000Z'),
        endDate: new Date('2026-08-03T17:00:00.000Z'),
      });

      const slots = await engine.findAvailableSlots(query);
      expect(slots).toHaveLength(0);
      expect(Array.isArray(slots)).toBe(true);
    });
  });

  describe('Cross-Midnight & Timezone Shift Boundaries', () => {
    it('should correctly slice slots spanning across midnight UTC', async () => {
      const startDate = new Date('2026-08-03T23:00:00.000Z');
      const endDate = new Date('2026-08-04T02:00:00.000Z'); // 3-hour window across midnight

      const query = new SlotSearchQuery({
        therapistId: 'therapist_1',
        roomId: 'room_1',
        duration: Duration.fromMinutes(60),
        startDate,
        endDate,
        stepIntervalMinutes: 30,
      });

      const slots = await engine.findAvailableSlots(query);

      // Candidate starts: 23:00, 23:30, 00:00, 00:30, 01:00 (5 total 60-min slots)
      expect(slots).toHaveLength(5);
      expect(slots[0]?.timeRange.start.toISOString()).toBe('2026-08-03T23:00:00.000Z');
      expect(slots[2]?.timeRange.start.toISOString()).toBe('2026-08-04T00:00:00.000Z');
    });
  });

  describe('DST Daylight Savings Time Transitions', () => {
    it('should evaluate slots correctly across Spring Forward transition day', async () => {
      // 2026-03-08 is US DST Spring Forward
      const startDate = new Date('2026-03-08T01:00:00.000Z');
      const endDate = new Date('2026-03-08T05:00:00.000Z');

      const query = new SlotSearchQuery({
        therapistId: 'therapist_1',
        roomId: 'room_1',
        duration: Duration.fromMinutes(60),
        startDate,
        endDate,
        stepIntervalMinutes: 30,
      });

      const slots = await engine.findAvailableSlots(query);
      expect(slots.length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Resource Combination Matrix Stress', () => {
    it('should evaluate combinations across 2 rooms and 2 therapists', async () => {
      const room1 = Room.create({
        id: RoomId.create('room_1'),
        name: 'Suite 1',
        capacity: 2,
      });
      const room2 = Room.create({
        id: RoomId.create('room_2'),
        name: 'Suite 2',
        capacity: 2,
      });
      roomRepo.findAvailableRooms.mockResolvedValue([room1, room2]);

      const query = new MultiResourceSlotSearchQuery({
        therapistIds: ['therapist_1', 'therapist_2'],
        duration: Duration.fromMinutes(60),
        startDate: new Date('2026-08-03T09:00:00.000Z'),
        endDate: new Date('2026-08-03T11:00:00.000Z'),
        stepIntervalMinutes: 30,
      });

      const combinations = await engine.findCompatibleCombinations(query);

      // 2 rooms x 2 therapists x 3 valid slots (09:00, 09:30, 10:00) = 12 combinations
      expect(combinations).toHaveLength(12);
    });
  });
});
