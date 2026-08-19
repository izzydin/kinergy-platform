import { AccessResult } from '../../domain/attendance/access-result.enum';
import { CheckInMethod } from '../../domain/attendance/check-in-method.enum';

/**
 * Data Transfer Object representing the operational response of a check-in attempt.
 */
export interface RecordCheckInResultDTO {
  readonly isGranted: boolean;
  readonly outcome: AccessResult;
  readonly attendanceId: string | null;
  readonly clientId: string;
  readonly membershipId: string | null;
  readonly planId: string | null;
  readonly checkInTime: string; // ISO 8601 UTC
  readonly gymDay: {
    readonly localDate: string;
    readonly timezone: string;
    readonly facilityId: string;
  };
  readonly method: CheckInMethod;
  readonly gateId: string | null;
  readonly receptionistId: string | null;
  readonly isDuplicate: boolean;
  readonly isIdempotentReplay: boolean;
  readonly denialReason: string | null;
}
