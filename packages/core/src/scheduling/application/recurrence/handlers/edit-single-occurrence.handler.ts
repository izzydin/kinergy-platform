import { CommandHandler } from '../../shared/command-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { EditSingleOccurrenceCommand } from '../commands/edit-single-occurrence.command';
import { AppointmentDTO } from '../../appointment/dtos/appointment.dto';
import { AppointmentMapper } from '../../appointment/mappers/appointment.mapper';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { RecurrenceSeriesRepository } from '../../../domain/repositories/recurrence-series.repository';
import { ConflictDetectionService } from '../../../domain/services/conflict-detection.service';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { Clock, SystemClock } from '../../../domain/shared/clock';

export class EditSingleOccurrenceHandler implements CommandHandler<
  EditSingleOccurrenceCommand,
  ApplicationResult<AppointmentDTO>
> {
  constructor(
    private readonly appointmentRepository: AppointmentRepository,
    private readonly recurrenceSeriesRepository: RecurrenceSeriesRepository,
    private readonly conflictDetectionService: ConflictDetectionService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  public async execute(
    command: EditSingleOccurrenceCommand,
  ): Promise<ApplicationResult<AppointmentDTO>> {
    try {
      const { appointmentId, startTime, endTime, therapistId, roomId, notes, reason } =
        command.input;

      const appointment = await this.appointmentRepository.findById(appointmentId);
      if (!appointment) {
        return ApplicationResult.fail(`Appointment '${appointmentId}' was not found.`);
      }

      // 1. Detach from parent series to ensure independent aggregate lifecycle
      const seriesId = appointment.seriesId;
      const occurrenceIndex = appointment.occurrenceIndex;

      appointment.detachFromSeries(this.clock);

      // 2. Record MODIFIED exception on parent series so recurrence generation never overwrites it
      if (seriesId && occurrenceIndex !== undefined) {
        const series = await this.recurrenceSeriesRepository.findById(seriesId);
        if (series) {
          series.recordModifiedException(
            occurrenceIndex,
            appointment.timeRange.start,
            reason ?? 'Single occurrence manually edited',
            this.clock,
          );
          await this.recurrenceSeriesRepository.save(series);
        }
      }

      // 3. Apply Rescheduling / Resource Reassignment
      if (startTime) {
        const start = new Date(startTime);
        const end = endTime
          ? new Date(endTime)
          : new Date(start.getTime() + appointment.timeRange.duration().toMilliseconds());

        const newRange = TimeRange.create(start, end);

        const targetTherapistId = therapistId ?? appointment.therapistId;
        const targetRoomId = roomId ?? appointment.roomId;

        const conflicts = await this.conflictDetectionService.detectConflicts({
          therapistId: targetTherapistId,
          roomId: targetRoomId,
          clientId: appointment.clientId,
          requestedRange: newRange,
          appointmentType: appointment.type,
          excludeAppointmentId: appointment.id.getValue(),
        });

        if (conflicts.length > 0) {
          return ApplicationResult.fail(
            `Cannot reschedule occurrence due to conflict: ${conflicts.map((c) => c.reason).join(', ')}`,
          );
        }

        appointment.reschedule(newRange, this.clock);
      }

      if (therapistId && therapistId !== appointment.therapistId) {
        appointment.assignTherapist(therapistId, this.clock);
      }

      if (roomId && roomId !== appointment.roomId) {
        appointment.assignRoom(roomId, this.clock);
      }

      if (notes) {
        appointment.addNote('system', notes, this.clock);
      }

      await this.appointmentRepository.save(appointment);

      return ApplicationResult.ok(AppointmentMapper.toDTO(appointment));
    } catch (error) {
      return ApplicationResult.fail(
        error instanceof Error ? error.message : 'Unexpected error editing single occurrence.',
      );
    }
  }
}
