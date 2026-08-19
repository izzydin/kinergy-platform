import { AccessResult } from '../../domain/attendance/access-result.enum';
import { CheckInMethod } from '../../domain/attendance/check-in-method.enum';

/**
 * Read Model DTO representing a single attendance log entry.
 */
export interface AttendanceItemDTO {
  readonly id: string;
  readonly clientId: string;
  readonly membershipId: string | null;
  readonly checkInTime: string; // ISO 8601 UTC
  readonly gymDay: string; // YYYY-MM-DD
  readonly facilityId: string;
  readonly method: CheckInMethod;
  readonly result: AccessResult;
  readonly gateId: string | null;
  readonly receptionistId: string | null;
  readonly notes: string | null;
}
