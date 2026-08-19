export enum CheckInMethod {
  BARCODE = 'BARCODE',
  RFID = 'RFID',
  QR_CODE = 'QR_CODE',
  MANUAL_RECEPTION = 'MANUAL_RECEPTION',
  BIOMETRIC = 'BIOMETRIC',
}

export enum AccessResult {
  GRANTED = 'GRANTED',
  DENIED_INACTIVE_CLIENT = 'DENIED_INACTIVE_CLIENT',
  DENIED_NO_MEMBERSHIP = 'DENIED_NO_MEMBERSHIP',
  DENIED_EXPIRED = 'DENIED_EXPIRED',
  DENIED_FROZEN = 'DENIED_FROZEN',
  DENIED_LIMIT_REACHED = 'DENIED_LIMIT_REACHED',
  DENIED_DUPLICATE_CHECKIN = 'DENIED_DUPLICATE_CHECKIN',
}

export enum MembershipEligibilityOutcome {
  ELIGIBLE = 'ELIGIBLE',
  NO_MEMBERSHIP = 'NO_MEMBERSHIP',
  EXPIRED = 'EXPIRED',
  FROZEN = 'FROZEN',
  NOT_YET_ACTIVE = 'NOT_YET_ACTIVE',
  CANCELLED = 'CANCELLED',
  TERMINATED = 'TERMINATED',
  INACTIVE_CLIENT = 'INACTIVE_CLIENT',
}

export interface MembershipEligibilityPeriodDTO {
  readonly startDate: string;
  readonly endDate: string;
}

export interface MembershipEligibilityDTO {
  readonly isEligible: boolean;
  readonly outcome: MembershipEligibilityOutcome;
  readonly membershipId: string | null;
  readonly planId: string | null;
  readonly period: MembershipEligibilityPeriodDTO | null;
  readonly evaluatedAt: string;
  readonly reason: string | null;
}

export interface RecordCheckInPayload {
  readonly clientId: string;
  readonly method: CheckInMethod;
  readonly gateId?: string;
  readonly receptionistId?: string;
  readonly facilityId?: string;
  readonly idempotencyKey?: string;
  readonly notes?: string;
}

export interface RecordCheckInResultDTO {
  readonly isGranted: boolean;
  readonly outcome: AccessResult;
  readonly attendanceId: string;
  readonly clientId: string;
  readonly membershipId: string | null;
  readonly planId: string | null;
  readonly checkInTime: string;
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

export interface AttendanceItemDTO {
  readonly id: string;
  readonly clientId: string;
  readonly membershipId: string | null;
  readonly checkInTime: string;
  readonly gymDay: string;
  readonly facilityId: string;
  readonly method: CheckInMethod;
  readonly result: AccessResult;
  readonly gateId: string | null;
  readonly receptionistId: string | null;
  readonly notes: string | null;
}

export interface PaginationMetadataDTO {
  readonly page: number;
  readonly limit: number;
  readonly totalItems: number;
  readonly totalPages: number;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
}

export interface AttendanceDailyKPIsDTO {
  readonly totalCheckIns: number;
  readonly grantedCount: number;
  readonly deniedCount: number;
  readonly uniqueClientsCount: number;
}

export interface PaginatedAttendanceResultDTO {
  readonly items: AttendanceItemDTO[];
  readonly pagination: PaginationMetadataDTO;
  readonly dailySummary?: AttendanceDailyKPIsDTO;
}

export interface ClientSearchResultDTO {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly status: string;
}

export interface TodayAttendanceFilterParams {
  readonly page?: number;
  readonly limit?: number;
  readonly result?: AccessResult;
  readonly method?: CheckInMethod;
  readonly facilityId?: string;
}
