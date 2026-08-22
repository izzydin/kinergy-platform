import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { SearchAttendanceQuery } from './search-attendance.query';
import { PaginatedAttendanceResultDTO } from '../dtos/paginated-attendance.dto';
import { AttendanceItemDTO } from '../dtos/attendance-item.dto';
import { AttendanceRecordRepository } from '../../domain/repositories/attendance-record.repository';
import { AttendanceRecord } from '../../domain/attendance/attendance-record.aggregate';
import { AccessResult } from '../../domain/attendance/access-result.enum';
import { CheckInMethod } from '../../domain/attendance/check-in-method.enum';

export class SearchAttendanceHandler implements QueryHandler<
  SearchAttendanceQuery,
  ApplicationResult<PaginatedAttendanceResultDTO>
> {
  private static readonly DEFAULT_PAGE = 1;
  private static readonly DEFAULT_LIMIT = 20;
  private static readonly MAX_LIMIT = 100;

  constructor(private readonly attendanceRepository: AttendanceRecordRepository) {}

  public async execute(
    query: SearchAttendanceQuery,
  ): Promise<ApplicationResult<PaginatedAttendanceResultDTO>> {
    try {
      const { filter } = query;

      const page = Math.max(1, filter.page ?? SearchAttendanceHandler.DEFAULT_PAGE);
      const rawLimit = filter.limit ?? SearchAttendanceHandler.DEFAULT_LIMIT;
      const limit = Math.min(SearchAttendanceHandler.MAX_LIMIT, Math.max(1, rawLimit));

      let records: AttendanceRecord[];
      let total: number;

      if (this.attendanceRepository.findWithPagination) {
        const dateFrom = filter.dateFrom ? new Date(filter.dateFrom) : undefined;
        const dateTo = filter.dateTo ? new Date(filter.dateTo) : undefined;

        const res = await this.attendanceRepository.findWithPagination({
          clientId: filter.clientId?.trim(),
          gymDay: filter.gymDay?.trim(),
          dateFrom: dateFrom && !isNaN(dateFrom.getTime()) ? dateFrom : undefined,
          dateTo: dateTo && !isNaN(dateTo.getTime()) ? dateTo : undefined,
          facilityId: filter.facilityId?.trim(),
          result: filter.result as AccessResult | undefined,
          method: filter.method as CheckInMethod | undefined,
          page,
          limit,
          sortOrder: 'DESC',
        });
        records = res.records;
        total = res.total;
      } else if (filter.clientId) {
        const clientRecords = await this.attendanceRepository.findByClientId(
          filter.clientId.trim(),
        );
        records = clientRecords;
        total = records.length;
      } else if (filter.gymDay) {
        const dayRecords = await this.attendanceRepository.findByGymDay(
          filter.gymDay.trim(),
          filter.facilityId,
        );
        records = dayRecords;
        total = records.length;
      } else {
        records = [];
        total = 0;
      }

      // If in-memory fallback was used (no findWithPagination), perform in-memory pagination
      if (!this.attendanceRepository.findWithPagination) {
        records.sort((a, b) => {
          const diff = b.checkInTime.getTime() - a.checkInTime.getTime();
          if (diff !== 0) return diff;
          return a.id.value.localeCompare(b.id.value);
        });
        const startIndex = (page - 1) * limit;
        records = records.slice(startIndex, startIndex + limit);
      }

      const totalPages = Math.ceil(total / limit) || 1;

      const items: AttendanceItemDTO[] = records.map((r) => ({
        id: r.id.value,
        clientId: r.clientId,
        membershipId: r.membershipId,
        checkInTime: r.checkInTime.toISOString(),
        gymDay: r.gymDay.localDate,
        facilityId: r.gymDay.facilityId,
        method: r.method,
        result: r.result,
        gateId: r.gateId,
        receptionistId: r.receptionistId,
        notes: r.notes,
      }));

      return ApplicationResult.ok<PaginatedAttendanceResultDTO>({
        items,
        pagination: {
          page,
          limit,
          totalItems: total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
