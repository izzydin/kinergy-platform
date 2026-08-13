import { QueryHandler } from '../../shared/query-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { CalendarReadRepository } from '../repositories/calendar-read.repository';
import { TherapistCalendarDTO, TherapistTimeBlockDTO } from '../dtos/therapist-calendar.dto';
import { GetTherapistCalendarQuery } from '../queries/get-therapist-calendar.query';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { TherapistScheduleRepository } from '../../../domain/repositories/therapist-schedule.repository';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { CalendarGridMapper } from '../mappers/calendar-grid.mapper';
import { Clock, SystemClock } from '../../../domain/shared/clock';

/**
 * CQRS Query Handler retrieving dedicated therapist operational calendar.
 * Merges working shifts, break periods, vacations, overrides, and assigned bookings.
 */
export class GetTherapistCalendarHandler implements QueryHandler<
  GetTherapistCalendarQuery,
  ApplicationResult<TherapistCalendarDTO>
> {
  constructor(
    private readonly calendarReadRepository?: CalendarReadRepository,
    private readonly appointmentRepository?: AppointmentRepository,
    private readonly scheduleRepository?: TherapistScheduleRepository,
    _clock: Clock = new SystemClock(),
  ) {}

  public async execute(
    query: GetTherapistCalendarQuery,
  ): Promise<ApplicationResult<TherapistCalendarDTO>> {
    try {
      const { input } = query;
      const startDate =
        typeof input.startTime === 'string' ? new Date(input.startTime) : input.startTime;
      const endDate = typeof input.endTime === 'string' ? new Date(input.endTime) : input.endTime;

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return ApplicationResult.fail('Invalid time range provided for therapist calendar query.');
      }

      // Delegate to read repository if present
      if (this.calendarReadRepository) {
        const dto = await this.calendarReadRepository.getTherapistCalendar(
          input.therapistId,
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

      // Fetch appointments assigned to therapist
      const appointments = await this.appointmentRepository.findAppointmentsForTherapist(
        input.therapistId,
        range,
      );

      const mappedAppointments = appointments.map((appt) =>
        CalendarGridMapper.mapAppointmentToSlot(appt),
      );

      // Fetch therapist schedule rules if schedule repository is present
      const workingHoursBlocks: TherapistTimeBlockDTO[] = [];
      const breakBlocks: TherapistTimeBlockDTO[] = [];
      const vacationBlocks: TherapistTimeBlockDTO[] = [];
      const overrideBlocks: TherapistTimeBlockDTO[] = [];

      if (this.scheduleRepository) {
        const schedule = await this.scheduleRepository.findByTherapistId(input.therapistId);
        if (schedule) {
          // Map working hours
          for (const wh of schedule.workingHours) {
            workingHoursBlocks.push({
              startTime: `${wh.startMinute}m`,
              endTime: `${wh.endMinute}m`,
              type: 'WORKING_HOURS',
              label: `Day ${wh.dayOfWeek}`,
            });
          }

          // Map breaks
          for (const b of schedule.breaks) {
            const props = b.getValue();
            breakBlocks.push({
              startTime: props.timeRange
                ? props.timeRange.start.toISOString()
                : `${props.startMinute}m`,
              endTime: props.timeRange ? props.timeRange.end.toISOString() : `${props.endMinute}m`,
              type: 'BREAK',
              label: b.title || 'Scheduled Break',
            });
          }

          // Map vacations
          for (const v of schedule.vacations) {
            vacationBlocks.push({
              startTime: v.timeRange.start.toISOString(),
              endTime: v.timeRange.end.toISOString(),
              type: 'VACATION',
              label: v.title || 'Therapist Vacation',
            });
          }

          // Map overrides
          for (const o of schedule.overrides) {
            overrideBlocks.push({
              startTime: o.timeRange.start.toISOString(),
              endTime: o.timeRange.end.toISOString(),
              type: 'OVERRIDE',
              label: o.reason || o.type,
            });
          }
        }
      }

      const therapistCalendar: TherapistCalendarDTO = {
        therapistId: input.therapistId,
        therapistName: `Therapist ${input.therapistId}`,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        workingHours: workingHoursBlocks,
        breaks: breakBlocks,
        vacations: vacationBlocks,
        overrides: overrideBlocks,
        appointments: mappedAppointments,
      };

      return ApplicationResult.ok(therapistCalendar);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
