import { QueryHandler } from '../../shared/query-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { CheckRoomAvailabilityQuery } from '../queries/check-room-availability.query';
import { RoomAvailabilityDTO } from '../dtos/room-availability.dto';
import { RoomMapper } from '../mappers/room.mapper';
import { RoomRepository } from '../../../domain/repositories/room.repository';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import { RoomId } from '../../../domain/room/room-id.vo';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { RoomStatus } from '../../../domain/value-objects/room-status.enum';

export class CheckRoomAvailabilityHandler implements QueryHandler<
  CheckRoomAvailabilityQuery,
  ApplicationResult<RoomAvailabilityDTO>
> {
  constructor(
    private readonly roomRepository: RoomRepository,
    private readonly appointmentRepository: AppointmentRepository,
  ) {}

  public async execute(
    query: CheckRoomAvailabilityQuery,
  ): Promise<ApplicationResult<RoomAvailabilityDTO>> {
    try {
      const { input } = query;
      const start = new Date(input.startTime);
      const end = new Date(input.endTime);
      const requestedRange = TimeRange.create(start, end);

      if (input.roomId) {
        const room = await this.roomRepository.findById(RoomId.create(input.roomId));
        if (!room) {
          return ApplicationResult.fail(`Room with id '${input.roomId}' not found.`);
        }

        const conflicts: string[] = [];

        if (room.status !== RoomStatus.AVAILABLE) {
          conflicts.push(`Room is currently in '${room.status}' status and cannot be reserved.`);
        }

        if (input.requiredCapacity !== undefined && room.capacity < input.requiredCapacity) {
          conflicts.push(
            `Room capacity (${room.capacity}) is less than required capacity (${input.requiredCapacity}).`,
          );
        }

        if (input.requiredFeatures && !room.supportsFeatures(input.requiredFeatures)) {
          conflicts.push('Room does not support all requested features.');
        }

        if (room.isUnderMaintenance(requestedRange)) {
          const overlap = room.getOverlappingMaintenance(requestedRange);
          conflicts.push(
            overlap
              ? `Room has scheduled maintenance: '${overlap.reason}'.`
              : 'Room is blocked by maintenance during requested time range.',
          );
        }

        const existingAppts: Appointment[] =
          await this.appointmentRepository.findAppointmentsForRoom(
            room.id.getValue(),
            requestedRange,
          );

        const activeConflictingAppts = existingAppts.filter(
          (appt: Appointment) =>
            appt.status !== 'CANCELLED' && appt.timeRange.overlaps(requestedRange),
        );

        if (activeConflictingAppts.length > 0) {
          conflicts.push('Room is already reserved by another active appointment.');
        }

        const isAvailable = conflicts.length === 0;

        return ApplicationResult.ok({
          isAvailable,
          roomId: room.id.getValue(),
          availableRooms: isAvailable ? [RoomMapper.toDTO(room)] : [],
          conflicts,
        });
      }

      // Discover all candidate rooms available for the range and requirements
      const candidateRooms = await this.roomRepository.findAvailableRooms(
        requestedRange,
        input.requiredFeatures,
      );

      const capacityFiltered =
        input.requiredCapacity !== undefined
          ? candidateRooms.filter((r) => r.capacity >= input.requiredCapacity!)
          : candidateRooms;

      const availableRooms: typeof capacityFiltered = [];

      for (const room of capacityFiltered) {
        const existingAppts: Appointment[] =
          await this.appointmentRepository.findAppointmentsForRoom(
            room.id.getValue(),
            requestedRange,
          );

        const hasConflict = existingAppts.some(
          (appt: Appointment) =>
            appt.status !== 'CANCELLED' && appt.timeRange.overlaps(requestedRange),
        );

        if (!hasConflict) {
          availableRooms.push(room);
        }
      }

      return ApplicationResult.ok({
        isAvailable: availableRooms.length > 0,
        availableRooms: availableRooms.map((r) => RoomMapper.toDTO(r)),
        conflicts: [],
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to check room availability.';
      return ApplicationResult.fail(message);
    }
  }
}
