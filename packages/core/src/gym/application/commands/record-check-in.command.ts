import { CheckInMethod } from '../../domain/attendance/check-in-method.enum';

export interface RecordCheckInInput {
  readonly clientId: string;
  readonly method: CheckInMethod;
  readonly gateId?: string | null;
  readonly receptionistId?: string | null;
  readonly notes?: string | null;
  readonly facilityId?: string | null;
  readonly timezone?: string | null;
  readonly idempotencyKey?: string | null;
  readonly asOf?: Date | null;
}

/**
 * CQRS Command to record a physical or operational gym check-in admission.
 */
export class RecordCheckInCommand {
  constructor(public readonly input: RecordCheckInInput) {}
}
