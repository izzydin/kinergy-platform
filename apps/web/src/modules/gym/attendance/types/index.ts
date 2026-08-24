export enum CheckInMethod {
  MANUAL_RECEPTION = 'MANUAL_RECEPTION',
  QR_CODE = 'QR_CODE',
  RFID = 'RFID',
  BARCODE = 'BARCODE',
  BIOMETRIC = 'BIOMETRIC',
}

export enum AccessResult {
  GRANTED = 'GRANTED',
  DENIED_NO_MEMBERSHIP = 'DENIED_NO_MEMBERSHIP',
  DENIED_EXPIRED = 'DENIED_EXPIRED',
  DENIED_FROZEN = 'DENIED_FROZEN',
  DENIED_CANCELLED = 'DENIED_CANCELLED',
  DENIED_NOT_YET_ACTIVE = 'DENIED_NOT_YET_ACTIVE',
  DENIED_DUPLICATE_CHECKIN = 'DENIED_DUPLICATE_CHECKIN',
  DENIED_INACTIVE_CLIENT = 'DENIED_INACTIVE_CLIENT',
}

export enum MembershipEligibilityOutcome {
  ELIGIBLE = 'ELIGIBLE',
  GRANTED = 'GRANTED',
  EXPIRED = 'EXPIRED',
  MEMBERSHIP_EXPIRED = 'MEMBERSHIP_EXPIRED',
  FROZEN = 'FROZEN',
  MEMBERSHIP_FROZEN = 'MEMBERSHIP_FROZEN',
  NO_MEMBERSHIP = 'NO_MEMBERSHIP',
  NO_ACTIVE_MEMBERSHIP = 'NO_ACTIVE_MEMBERSHIP',
  NOT_YET_ACTIVE = 'NOT_YET_ACTIVE',
  FUTURE_START_DATE = 'FUTURE_START_DATE',
  CANCELLED = 'CANCELLED',
  MEMBERSHIP_CANCELLED = 'MEMBERSHIP_CANCELLED',
  TERMINATED = 'TERMINATED',
  INACTIVE_CLIENT = 'INACTIVE_CLIENT',
}

export interface ClientSearchResultDTO {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly status: string;
  readonly phone?: string;
}

export interface MembershipEligibilityDTO {
  readonly clientId: string;
  readonly isEligible: boolean;
  readonly outcome: string;
  readonly membershipId?: string | null;
  readonly planId?: string | null;
  readonly period?: {
    readonly startDate: string;
    readonly endDate: string;
    readonly durationDays?: number;
  } | null;
  readonly evaluatedAt: string;
  readonly reason?: string | null;
}

export interface AttendanceItemVM {
  id: string;
  clientId: string;
  membershipId: string | null;
  checkInTime: string;
  gymDay: string;
  facilityId: string;
  method: string;
  result: string;
  gateId: string | null;
  receptionistId: string | null;
  notes: string | null;
}

export type AttendanceItemDTO = AttendanceItemVM;

export interface AttendanceDailyKPIsVM {
  totalCheckIns: number;
  grantedCount: number;
  deniedCount: number;
  uniqueClientsCount: number;
}

export interface ClientAttendanceStatsVM {
  totalVisits: number;
  firstVisitAt: string | null;
  lastVisitAt: string | null;
}

export interface PaginationMetadataVM {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedAttendanceVM {
  items: AttendanceItemVM[];
  pagination: PaginationMetadataVM;
  dailySummary?: AttendanceDailyKPIsVM;
  clientStats?: ClientAttendanceStatsVM;
}

export type PaginatedAttendanceResultDTO = PaginatedAttendanceVM;

export interface RecordCheckInInputVM {
  clientId: string;
  method?: string;
  gateId?: string;
  notes?: string;
  idempotencyKey?: string;
}

export type RecordCheckInPayload = RecordCheckInInputVM;

export interface RecordCheckInResponseVM {
  isGranted: boolean;
  outcome: string;
  attendanceId: string | null;
  clientId: string;
  membershipId: string | null;
  planId: string | null;
  checkInTime: string;
  gymDay: {
    localDate: string;
    timezone: string;
    facilityId: string;
  };
  method: string;
  gateId: string | null;
  receptionistId: string | null;
  isDuplicate: boolean;
  isIdempotentReplay: boolean;
  denialReason: string | null;
}

export type RecordCheckInResultDTO = RecordCheckInResponseVM;

export interface TodayAttendanceFilterParams {
  date?: string;
  facilityId?: string;
  result?: string;
  method?: string;
  page?: number;
  limit?: number;
}
