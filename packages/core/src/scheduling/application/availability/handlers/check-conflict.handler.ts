import { QueryHandler } from '../../shared/query-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { CheckConflictQuery } from '../queries/check-conflict.query';
import { ConflictCheckResponseDTO } from '../dtos/slot-response.dto';
import { ConflictDetectionService } from '../../../domain/services/conflict-detection.service';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { AppointmentType } from '../../../domain/value-objects/appointment-type.vo';

/**
 * Query Handler for CheckConflictQuery providing quick pre-validation conflict evaluations.
 */
export class CheckConflictHandler implements QueryHandler<
  CheckConflictQuery,
  ApplicationResult<ConflictCheckResponseDTO>
> {
  constructor(private readonly conflictService: ConflictDetectionService) {}

  public async execute(
    query: CheckConflictQuery,
  ): Promise<ApplicationResult<ConflictCheckResponseDTO>> {
    try {
      const { input } = query;
      const requestedRange = TimeRange.create(input.startTime, input.endTime);
      const appointmentType = input.appointmentType
        ? AppointmentType.create(input.appointmentType)
        : undefined;

      const conflicts = await this.conflictService.detectConflicts({
        therapistId: input.therapistId,
        roomId: input.roomId,
        clientId: input.clientId,
        requestedRange,
        appointmentType,
        ignoreAppointmentId: input.ignoreAppointmentId,
      });

      const response: ConflictCheckResponseDTO = {
        hasConflict: conflicts.length > 0,
        conflicts: conflicts.map((c) => ({
          category: c.category,
          conflictingEntityId: c.conflictingEntityId,
          reason: c.reason,
        })),
      };

      return ApplicationResult.ok(response);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to evaluate conflict check.';
      return ApplicationResult.fail(errorMsg);
    }
  }
}
