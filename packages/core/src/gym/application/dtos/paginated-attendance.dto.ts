import { AttendanceItemDTO } from './attendance-item.dto';

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

export interface ClientAttendanceStatsDTO {
  readonly totalVisits: number;
  readonly firstVisitAt: string | null;
  readonly lastVisitAt: string | null;
}

/**
 * Paginated response DTO for operational attendance feeds and member history.
 */
export interface PaginatedAttendanceResultDTO {
  readonly items: AttendanceItemDTO[];
  readonly pagination: PaginationMetadataDTO;
  readonly dailySummary?: AttendanceDailyKPIsDTO;
  readonly clientStats?: ClientAttendanceStatsDTO;
}
