import { QueryHandler } from '../../shared/query-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { CalendarReadRepository } from '../repositories/calendar-read.repository';
import { RoomCalendarDTO } from '../dtos/room-calendar.dto';
import { GetRoomCalendarQuery } from '../queries/get-room-calendar.query';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { RoomRepository } from '../../../domain/repositories/room.repository';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { CalendarGridMapper } from '../mappers/calendar-grid.mapper';
import { Clock, SystemClock } from '../../../domain/shared/clock';

/**
 * CQRS Query Handler retrieving room operational calendar.
 * Highlights room utilization, capacity bounds, maintenance blocks, equipment features, and occupancy.
 */
export class GetRoomCalendarHandler implements QueryHandler<
  GetRoomCalendarQuery,
  ApplicationResult<RoomCalendarDTO>
> {
  constructor(
    private readonly calendarReadRepository?: CalendarReadRepository,
    private readonly appointmentRepository?: AppointmentRepository,
    private readonly roomRepository?: RoomRepository,
    _clock: Clock = new SystemClock(),
  ) {}

  public async execute(query: GetRoomCalendarQuery): Promise<ApplicationResult<RoomCalendarDTO>> {
    try {
      const { input } = query;
      const startDate =
        typeof input.startTime === 'string' ? new Date(input.startTime) : input.startTime;
      const endDate = typeof input.endTime === 'string' ? new Date(input.endTime) : input.endTime;

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return ApplicationResult.fail('Invalid time range provided for room calendar query.');
      }

      // Delegate to read repository if present
      if (this.calendarReadRepository) {
        const dto = await this.calendarReadRepository.getRoomCalendar(
          input.roomId,
          startDate,
          endDate,
        );
        return ApplicationResult.ok(dto);
      }

      if (!this.appointmentRepository) {
        return ApplicationResult.fail(
          'AppointmentRepository is required when CalendarReadRepository is omitted.',
        );
      }

      const range = TimeRange.create(startDate, endDate);

      // Fetch appointments assigned to room
      const appointments = await this.appointmentRepository.findAppointmentsForRoom(
        input.roomId,
        range,
      );

      const mappedAppointments = appointments.map((appt) =>
        CalendarGridMapper.mapAppointmentToSlot(appt),
      );

      // Fetch room entity details if room repository is present
      let roomName = `Room ${input.roomId}`;
      let status: RoomCalendarDTO['status'] = 'AVAILABLE';
      let capacity = 1;
      let features: string[] = [];
      let maintenanceReason: string | undefined = undefined;

      if (this.roomRepository) {
        const room = await this.roomRepository.findById(input.roomId);
        if (room) {
          roomName = room.name;
          status = room.status as RoomCalendarDTO['status'];
          capacity = room.capacity;
          features = Array.from(room.features);
          maintenanceReason = room.maintenanceReason;
        }
      }

      const roomCalendar: RoomCalendarDTO = {
        roomId: input.roomId,
        roomName,
        status,
        capacity,
        features,
        maintenanceReason,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        appointments: mappedAppointments,
      };

      return ApplicationResult.ok(roomCalendar);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
