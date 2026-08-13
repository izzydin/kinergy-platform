import { QueryHandler } from '../../shared/query-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { Clock, SystemClock } from '../../../domain/shared/clock';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { CalendarSlotDTO } from '../dtos/calendar-slot.dto';
import { CalendarGridMapper } from '../mappers/calendar-grid.mapper';
import { GetTodaysAppointmentsQuery } from '../queries/get-todays-appointments.query';

/**
 * CQRS Query Handler retrieving light list of today's appointments for quick reception scanning.
 * Uses injected Clock to determine today's date boundary without mutating state.
 */
export class GetTodaysAppointmentsHandler implements QueryHandler<
  GetTodaysAppointmentsQuery,
  ApplicationResult<CalendarSlotDTO[]>
> {
  constructor(
    private readonly appointmentRepository: AppointmentRepository,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  public async execute(
    query: GetTodaysAppointmentsQuery,
  ): Promise<ApplicationResult<CalendarSlotDTO[]>> {
    try {
      const { input } = query;

      // Normalize operational day start to 00:00:00.000 using Clock
      const todayStart = this.clock.today();
      const year = todayStart.getUTCFullYear();
      const month = todayStart.getUTCMonth();
      const day = todayStart.getUTCDate();

      const dayEnd = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
      const range = TimeRange.create(todayStart, dayEnd);

      // Fetch appointments for today's range
      const appointments = await this.appointmentRepository.findAppointmentsByRange(range, {
        therapistId: input.therapistId,
        roomId: input.roomId,
        clientId: input.clientId,
      });

      // Pure mapping into CalendarSlotDTOs
      const rawSlots = CalendarGridMapper.mapGridSlots({
        date: todayStart,
        appointments,
        therapistId: input.therapistId,
        roomId: input.roomId,
      });

      // Tag operational status using real-time clock.now()
      const nowMs = this.clock.now().getTime();
      const slots: CalendarSlotDTO[] = rawSlots.map((slot) => {
        const startMs = new Date(slot.startTime).getTime();
        const endMs = new Date(slot.endTime).getTime();

        let operationalStatus: 'PAST' | 'CURRENT_NOW' | 'UPCOMING';
        if (endMs <= nowMs) {
          operationalStatus = 'PAST';
        } else if (startMs <= nowMs && nowMs < endMs) {
          operationalStatus = 'CURRENT_NOW';
        } else {
          operationalStatus = 'UPCOMING';
        }

        return {
          ...slot,
          operationalStatus,
        };
      });

      return ApplicationResult.ok(slots);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
