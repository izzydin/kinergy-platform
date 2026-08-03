import { TimeRange } from '../value-objects/time-range.vo';
import { SlotSearchQuery, MultiResourceSlotSearchQuery } from './dtos/slot-search-query.vo';
import { AvailableSlotResult, ResourceCombinationSlot } from './dtos/available-slot-result.vo';
import { ConflictDetectionService } from './conflict-detection.service';
import { RoomRepository } from '../repositories/room.repository';

/**
 * Principal High-Performance Slot Finder Engine domain service.
 * Computes open, unconflicted booking slots using discrete time-grid slicing,
 * turnaround buffers, and 4D matrix conflict evaluations.
 */
export class SlotFinderEngine {
  constructor(
    private readonly conflictService: ConflictDetectionService,
    private readonly roomRepo: RoomRepository,
  ) {}

  /**
   * Fast-path execution returning the earliest single valid slot within the search window.
   */
  public async findNextAvailableSlot(query: SlotSearchQuery): Promise<TimeRange | null> {
    const slots = await this.findAvailableSlots(query);
    const firstSlot = slots[0];
    return firstSlot ? firstSlot.timeRange : null;
  }

  /**
   * Returns all viable unconflicted slots within a date range for a specific therapist and room.
   */
  public async findAvailableSlots(query: SlotSearchQuery): Promise<AvailableSlotResult[]> {
    const availableSlots: AvailableSlotResult[] = [];
    const slotMs = query.duration.toMilliseconds();
    const stepMs = query.stepIntervalMinutes * 60 * 1000;

    if (slotMs <= 0 || query.startDate.getTime() >= query.endDate.getTime()) {
      return availableSlots;
    }

    let currentStartMs = query.startDate.getTime();
    const endMs = query.endDate.getTime();

    while (currentStartMs + slotMs <= endMs) {
      const candidateStart = new Date(currentStartMs);
      const candidateEnd = new Date(currentStartMs + slotMs);

      try {
        const candidateRange = TimeRange.create(candidateStart, candidateEnd);

        const conflicts = await this.conflictService.detectConflicts({
          therapistId: query.therapistId,
          roomId: query.roomId,
          clientId: query.clientId ?? '',
          requestedRange: candidateRange,
          appointmentType: query.appointmentType,
        });

        if (conflicts.length === 0) {
          availableSlots.push(
            new AvailableSlotResult({
              timeRange: candidateRange,
              therapistId: query.therapistId,
              roomId: query.roomId,
            }),
          );
        }
      } catch {
        // Skip invalid boundaries
      }

      currentStartMs += stepMs;
    }

    return availableSlots;
  }

  /**
   * Discovers valid [Therapist, Room, TimeRange] matrix combinations given flexible criteria.
   */
  public async findCompatibleCombinations(
    query: MultiResourceSlotSearchQuery,
  ): Promise<ResourceCombinationSlot[]> {
    const combinations: ResourceCombinationSlot[] = [];
    const searchRange = TimeRange.create(query.startDate, query.endDate);

    // 1. Resolve candidate rooms
    const availableRooms = await this.roomRepo.findAvailableRooms(
      searchRange,
      query.requiredFeatures,
    );
    const candidateRooms = availableRooms.filter((r) => {
      if (query.roomIds && !query.roomIds.includes(r.id.toString())) return false;
      if (query.requiredCapacity && r.capacity < query.requiredCapacity) return false;
      return true;
    });

    if (candidateRooms.length === 0) {
      return combinations;
    }

    // 2. Resolve candidate therapist IDs
    const candidateTherapistIds: string[] = query.therapistIds ?? [];

    // 3. For each room & therapist combination, find unconflicted slots
    for (const room of candidateRooms) {
      for (const therapistId of candidateTherapistIds) {
        const singleQuery = new SlotSearchQuery({
          therapistId,
          roomId: room.id.toString(),
          clientId: query.clientId,
          duration: query.duration,
          startDate: query.startDate,
          endDate: query.endDate,
          appointmentType: query.appointmentType,
          stepIntervalMinutes: query.stepIntervalMinutes,
        });

        const slots = await this.findAvailableSlots(singleQuery);
        for (const slot of slots) {
          combinations.push(
            new ResourceCombinationSlot({
              timeRange: slot.timeRange,
              therapistId,
              roomId: room.id.toString(),
            }),
          );
        }
      }
    }

    return combinations;
  }
}
