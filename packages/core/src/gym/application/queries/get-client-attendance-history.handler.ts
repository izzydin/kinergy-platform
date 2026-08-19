import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetClientAttendanceHistoryQuery } from './get-client-attendance-history.query';
import {
  PaginatedAttendanceResultDTO,
  ClientAttendanceStatsDTO,
} from '../dtos/paginated-attendance.dto';
import { AttendanceItemDTO } from '../dtos/attendance-item.dto';
import { AttendanceRecordRepository } from '../../domain/repositories/attendance-record.repository';
import { AttendanceRecord } from '../../domain/attendance/attendance-record.aggregate';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

/**
 * CQRS Query Handler retrieving a client's chronological attendance history and visit KPIs.
 */
export class GetClientAttendanceHistoryHandler implements QueryHandler<
  GetClientAttendanceHistoryQuery,
  ApplicationResult<PaginatedAttendanceResultDTO>
> {
  constructor(private readonly attendanceRepository: AttendanceRecordRepository) {}

  public async execute(
    query: GetClientAttendanceHistoryQuery,
  ): Promise<ApplicationResult<PaginatedAttendanceResultDTO>> {
    try {
      const { input } = query;
      const clientId = input.clientId?.trim();
      if (!clientId) {
        return ApplicationResult.fail('Client ID is required.');
      }

      // Safe pagination clamping
      const rawPage = input.page ?? DEFAULT_PAGE;
      const rawLimit = input.limit ?? DEFAULT_LIMIT;
      const page = Math.max(DEFAULT_PAGE, Math.floor(rawPage));
      const limit = Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.floor(rawLimit)));
      const sortOrder = input.sortOrder === 'ASC' ? 'ASC' : 'DESC';

      // Parse date filters
      let fromDate: Date | undefined;
      let toDate: Date | undefined;

      if (input.dateFrom) {
        fromDate = typeof input.dateFrom === 'string' ? new Date(input.dateFrom) : input.dateFrom;
        if (isNaN(fromDate.getTime())) {
          return ApplicationResult.fail(`Invalid dateFrom: '${input.dateFrom}'.`);
        }
      }

      if (input.dateTo) {
        toDate = typeof input.dateTo === 'string' ? new Date(input.dateTo) : input.dateTo;
        if (isNaN(toDate.getTime())) {
          return ApplicationResult.fail(`Invalid dateTo: '${input.dateTo}'.`);
        }
      }

      if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
        return ApplicationResult.fail('dateFrom cannot be later than dateTo.');
      }

      let items: AttendanceRecord[];
      let totalItems: number;
      let clientStats: ClientAttendanceStatsDTO;

      if (this.attendanceRepository.findWithPagination) {
        const paginatedResult = await this.attendanceRepository.findWithPagination({
          clientId,
          dateFrom: fromDate,
          dateTo: toDate,
          result: input.result,
          page,
          limit,
          sortOrder,
        });
        items = paginatedResult.records;
        totalItems = paginatedResult.total;

        // Compute client stats
        const allClientRecords = await this.attendanceRepository.findByClientId(clientId);
        const grantedRecords = allClientRecords.filter((r) => r.isGranted());
        clientStats = {
          totalVisits: grantedRecords.length,
          firstVisitAt:
            grantedRecords.length > 0
              ? grantedRecords[grantedRecords.length - 1]!.checkInTime.toISOString()
              : null,
          lastVisitAt:
            grantedRecords.length > 0 ? grantedRecords[0]!.checkInTime.toISOString() : null,
        };
      } else {
        const allClientRecords = await this.attendanceRepository.findByClientId(clientId);

        let filtered = allClientRecords;
        if (fromDate) {
          filtered = filtered.filter((r) => r.checkInTime.getTime() >= fromDate!.getTime());
        }
        if (toDate) {
          filtered = filtered.filter((r) => r.checkInTime.getTime() <= toDate!.getTime());
        }
        if (input.result) {
          filtered = filtered.filter((r) => r.result === input.result);
        }

        filtered.sort((a, b) => {
          const diff = a.checkInTime.getTime() - b.checkInTime.getTime();
          return sortOrder === 'ASC' ? diff : -diff;
        });

        totalItems = filtered.length;
        const startIndex = (page - 1) * limit;
        items = filtered.slice(startIndex, startIndex + limit);

        const grantedRecords = allClientRecords.filter((r) => r.isGranted());
        clientStats = {
          totalVisits: grantedRecords.length,
          firstVisitAt:
            grantedRecords.length > 0
              ? grantedRecords[grantedRecords.length - 1]!.checkInTime.toISOString()
              : null,
          lastVisitAt:
            grantedRecords.length > 0 ? grantedRecords[0]!.checkInTime.toISOString() : null,
        };
      }

      const totalPages = Math.max(1, Math.ceil(totalItems / limit));
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      const itemDTOs: AttendanceItemDTO[] = items.map((r) => this.mapToDTO(r));

      return ApplicationResult.ok<PaginatedAttendanceResultDTO>({
        items: itemDTOs,
        pagination: {
          page,
          limit,
          totalItems,
          totalPages,
          hasNextPage,
          hasPreviousPage,
        },
        clientStats,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown query error';
      return ApplicationResult.fail(`Failed to retrieve client attendance history: ${message}`);
    }
  }

  private mapToDTO(record: AttendanceRecord): AttendanceItemDTO {
    return {
      id: record.id.value,
      clientId: record.clientId,
      membershipId: record.membershipId,
      checkInTime: record.checkInTime.toISOString(),
      gymDay: record.gymDay.localDate,
      facilityId: record.gymDay.facilityId,
      method: record.method,
      result: record.result,
      gateId: record.gateId,
      receptionistId: record.receptionistId,
      notes: record.notes,
    };
  }
}
