import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetDailyAttendanceQuery } from './get-daily-attendance.query';
import {
  PaginatedAttendanceResultDTO,
  AttendanceDailyKPIsDTO,
} from '../dtos/paginated-attendance.dto';
import { AttendanceItemDTO } from '../dtos/attendance-item.dto';
import { AttendanceRecordRepository } from '../../domain/repositories/attendance-record.repository';
import { Clock } from '../../domain/shared/clock';
import { GymDay } from '../../domain/attendance/gym-day.vo';
import { AttendanceRecord } from '../../domain/attendance/attendance-record.aggregate';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

/**
 * CQRS Query Handler retrieving the operational daily attendance log and daily KPIs.
 */
export class GetDailyAttendanceHandler implements QueryHandler<
  GetDailyAttendanceQuery,
  ApplicationResult<PaginatedAttendanceResultDTO>
> {
  constructor(
    private readonly attendanceRepository: AttendanceRecordRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(
    query: GetDailyAttendanceQuery,
  ): Promise<ApplicationResult<PaginatedAttendanceResultDTO>> {
    try {
      const { input } = query;
      const facilityId = input.facilityId?.trim() || 'main';
      const timezone = this.clock.timezone();

      // Resolve business date
      let targetGymDay: string;
      if (input.date?.trim()) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date.trim())) {
          return ApplicationResult.fail(
            `Invalid date format '${input.date}'. Expected YYYY-MM-DD.`,
          );
        }
        targetGymDay = input.date.trim();
      } else {
        const now = this.clock.now();
        targetGymDay = GymDay.fromUtc(now, timezone, facilityId).localDate;
      }

      // Safe pagination clamping
      const rawPage = input.page ?? DEFAULT_PAGE;
      const rawLimit = input.limit ?? DEFAULT_LIMIT;
      const page = Math.max(DEFAULT_PAGE, Math.floor(rawPage));
      const limit = Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.floor(rawLimit)));
      const sortOrder = input.sortOrder === 'ASC' ? 'ASC' : 'DESC';

      let items: AttendanceRecord[];
      let totalItems: number;
      let dailyKPIs: AttendanceDailyKPIsDTO;

      // Build client-id filter set for Trainer Dashboard scoping
      const clientIdFilter =
        input.assignedClientIds && input.assignedClientIds.length > 0
          ? new Set(input.assignedClientIds)
          : null;

      if (this.attendanceRepository.findWithPagination) {
        const paginatedResult = await this.attendanceRepository.findWithPagination({
          gymDay: targetGymDay,
          facilityId,
          result: input.result,
          method: input.method,
          page,
          limit,
          sortOrder,
        });
        items = clientIdFilter
          ? paginatedResult.records.filter((r) => clientIdFilter.has(r.clientId))
          : paginatedResult.records;
        totalItems = clientIdFilter ? items.length : paginatedResult.total;

        if (this.attendanceRepository.getDailyKPIs) {
          const kpis = await this.attendanceRepository.getDailyKPIs(targetGymDay, facilityId);
          dailyKPIs = {
            totalCheckIns: kpis.totalCheckIns,
            grantedCount: kpis.grantedCount,
            deniedCount: kpis.deniedCount,
            uniqueClientsCount: kpis.uniqueClientsCount,
          };
        } else {
          dailyKPIs = await this.computeKPIsFromDayRecords(targetGymDay, facilityId);
        }
      } else {
        // Fallback using findByGymDay
        const allDayRecords = await this.attendanceRepository.findByGymDay(
          targetGymDay,
          facilityId,
        );

        let filtered = allDayRecords;
        if (clientIdFilter) {
          filtered = filtered.filter((r) => clientIdFilter.has(r.clientId));
        }
        if (input.result) {
          filtered = filtered.filter((r) => r.result === input.result);
        }
        if (input.method) {
          filtered = filtered.filter((r) => r.method === input.method);
        }

        filtered.sort((a, b) => {
          const diff = a.checkInTime.getTime() - b.checkInTime.getTime();
          return sortOrder === 'ASC' ? diff : -diff;
        });

        totalItems = filtered.length;
        const startIndex = (page - 1) * limit;
        items = filtered.slice(startIndex, startIndex + limit);

        dailyKPIs = {
          totalCheckIns: allDayRecords.length,
          grantedCount: allDayRecords.filter((r) => r.isGranted()).length,
          deniedCount: allDayRecords.filter((r) => !r.isGranted()).length,
          uniqueClientsCount: new Set(
            allDayRecords.filter((r) => r.isGranted()).map((r) => r.clientId),
          ).size,
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
        dailySummary: dailyKPIs,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown query error';
      return ApplicationResult.fail(`Failed to retrieve daily attendance: ${message}`);
    }
  }

  private async computeKPIsFromDayRecords(
    gymDay: string,
    facilityId: string,
  ): Promise<AttendanceDailyKPIsDTO> {
    const allRecords = await this.attendanceRepository.findByGymDay(gymDay, facilityId);
    return {
      totalCheckIns: allRecords.length,
      grantedCount: allRecords.filter((r) => r.isGranted()).length,
      deniedCount: allRecords.filter((r) => !r.isGranted()).length,
      uniqueClientsCount: new Set(allRecords.filter((r) => r.isGranted()).map((r) => r.clientId))
        .size,
    };
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
