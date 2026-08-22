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

export interface RecordCheckInInputVM {
  clientId: string;
  method?: string;
  gateId?: string;
  notes?: string;
  idempotencyKey?: string;
}

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
