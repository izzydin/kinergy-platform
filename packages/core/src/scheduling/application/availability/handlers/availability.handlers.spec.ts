import { CheckConflictHandler } from './check-conflict.handler';
import { FindAvailableSlotsHandler } from './find-available-slots.handler';
import { FindResourceCombinationsHandler } from './find-resource-combinations.handler';

import { CheckConflictQuery } from '../queries/check-conflict.query';
import { FindAvailableSlotsQuery } from '../queries/find-available-slots.query';
import { FindResourceCombinationsQuery } from '../queries/find-resource-combinations.query';

import { ConflictDetectionService } from '../../../domain/services/conflict-detection.service';
import { SlotFinderEngine } from '../../../domain/services/slot-finder.engine';
import {
  AvailableSlotResult,
  ResourceCombinationSlot,
} from '../../../domain/services/dtos/available-slot-result.vo';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { SchedulingConflict } from '../../../domain/value-objects/scheduling-conflict.vo';
import { TestClock } from '../../../domain/shared/clock';

describe('Availability Application Query Handlers', () => {
  const clock = new TestClock(new Date('2026-08-03T08:00:00.000Z'));
  const startDate = new Date('2026-08-03T09:00:00.000Z');
  const endDate = new Date('2026-08-03T11:00:00.000Z');

  describe('CheckConflictHandler', () => {
    let conflictService: jest.Mocked<ConflictDetectionService>;
    let handler: CheckConflictHandler;

    beforeEach(() => {
      conflictService = {
        detectConflicts: jest.fn().mockResolvedValue([]),
        evaluateConflicts: jest.fn().mockResolvedValue({ hasConflicts: false, conflicts: [] }),
      } as unknown as jest.Mocked<ConflictDetectionService>;

      handler = new CheckConflictHandler(conflictService);
    });

    it('should return hasConflict: false when no conflicts are detected', async () => {
      const query = new CheckConflictQuery({
        therapistId: 'therapist_1',
        roomId: 'room_1',
        clientId: 'client_1',
        startTime: startDate,
        endTime: endDate,
      });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().hasConflict).toBe(false);
      expect(result.getValue().conflicts).toHaveLength(0);
    });

    it('should return hasConflict: true when conflicts are detected', async () => {
      const conflict = SchedulingConflict.create({
        conflictType: 'THERAPIST',
        conflictingEntityId: 'therapist_1',
        requestedRange: TimeRange.create(startDate, endDate),
        reason: 'Therapist is on vacation',
      });
      conflictService.detectConflicts.mockResolvedValue([conflict]);

      const query = new CheckConflictQuery({
        therapistId: 'therapist_1',
        roomId: 'room_1',
        clientId: 'client_1',
        startTime: startDate,
        endTime: endDate,
      });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().hasConflict).toBe(true);
      expect(result.getValue().conflicts[0]?.reason).toContain('vacation');
    });
  });

  describe('FindAvailableSlotsHandler', () => {
    let slotEngine: jest.Mocked<SlotFinderEngine>;
    let handler: FindAvailableSlotsHandler;

    beforeEach(() => {
      slotEngine = {
        findAvailableSlots: jest.fn().mockResolvedValue([]),
        findNextAvailableSlot: jest.fn().mockResolvedValue(null),
        findCompatibleCombinations: jest.fn().mockResolvedValue([]),
      } as unknown as jest.Mocked<SlotFinderEngine>;

      handler = new FindAvailableSlotsHandler(slotEngine, clock);
    });

    it('should return available slot DTOs for valid queries', async () => {
      const range = TimeRange.create(startDate, new Date('2026-08-03T10:00:00.000Z'));
      slotEngine.findAvailableSlots.mockResolvedValue([
        new AvailableSlotResult({
          timeRange: range,
          therapistId: 'therapist_1',
          roomId: 'room_1',
        }),
      ]);

      const query = new FindAvailableSlotsQuery({
        therapistId: 'therapist_1',
        roomId: 'room_1',
        durationMinutes: 60,
        startDate,
        endDate,
      });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const dtos = result.getValue();
      expect(dtos).toHaveLength(1);
      expect(dtos[0]?.startTime).toBe('2026-08-03T09:00:00.000Z');
      expect(dtos[0]?.endTime).toBe('2026-08-03T10:00:00.000Z');
    });

    it('should filter out past start dates relative to clock.now()', async () => {
      const pastStart = new Date('2026-08-03T06:00:00.000Z'); // Clock is 08:00

      const query = new FindAvailableSlotsQuery({
        therapistId: 'therapist_1',
        roomId: 'room_1',
        durationMinutes: 60,
        startDate: pastStart,
        endDate,
      });

      await handler.execute(query);

      const calls = slotEngine.findAvailableSlots.mock.calls;
      const firstCall = calls[0];
      expect(firstCall).toBeDefined();
      if (firstCall && firstCall[0]) {
        expect(firstCall[0].startDate.toISOString()).toBe('2026-08-03T08:00:00.000Z');
      }
    });
  });

  describe('FindResourceCombinationsHandler', () => {
    let slotEngine: jest.Mocked<SlotFinderEngine>;
    let handler: FindResourceCombinationsHandler;

    beforeEach(() => {
      slotEngine = {
        findAvailableSlots: jest.fn().mockResolvedValue([]),
        findNextAvailableSlot: jest.fn().mockResolvedValue(null),
        findCompatibleCombinations: jest.fn().mockResolvedValue([]),
      } as unknown as jest.Mocked<SlotFinderEngine>;

      handler = new FindResourceCombinationsHandler(slotEngine, clock);
    });

    it('should return resource combination DTOs', async () => {
      const range = TimeRange.create(startDate, new Date('2026-08-03T10:00:00.000Z'));
      slotEngine.findCompatibleCombinations.mockResolvedValue([
        new ResourceCombinationSlot({
          timeRange: range,
          therapistId: 'therapist_1',
          roomId: 'room_1',
        }),
      ]);

      const query = new FindResourceCombinationsQuery({
        therapistIds: ['therapist_1'],
        durationMinutes: 60,
        startDate,
        endDate,
      });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const combinations = result.getValue();
      expect(combinations).toHaveLength(1);
      expect(combinations[0]?.therapistId).toBe('therapist_1');
      expect(combinations[0]?.roomId).toBe('room_1');
    });
  });
});
