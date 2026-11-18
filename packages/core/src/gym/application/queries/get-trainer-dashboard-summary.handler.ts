import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetTrainerDashboardSummaryQuery } from './get-trainer-dashboard-summary.query';
import { TrainerDashboardSummaryDTO } from '../dtos/trainer-dashboard-summary.dto';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { AttendanceRecordRepository } from '../../domain/repositories/attendance-record.repository';
import { Clock } from '../../domain/shared/clock';
import { GymDay } from '../../domain/attendance/gym-day.vo';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';
import { AccessResult } from '../../domain/attendance/access-result.enum';
import { Membership } from '../../domain/membership/membership.aggregate';

/**
 * CQRS Handler projecting top-line summary KPIs for the Trainer Dashboard (Phase 5.6-D).
 *
 * Efficiently computes aggregated operational counts across authoritative Gym Management
 * repositories without loading full external aggregate graphs.
 */
export class GetTrainerDashboardSummaryHandler implements QueryHandler<
  GetTrainerDashboardSummaryQuery,
  ApplicationResult<TrainerDashboardSummaryDTO>
> {
  constructor(
    private readonly membershipRepository: MembershipRepository,
    private readonly attendanceRepository: AttendanceRecordRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(
    query: GetTrainerDashboardSummaryQuery,
  ): Promise<ApplicationResult<TrainerDashboardSummaryDTO>> {
    try {
      const { input } = query;
      if (!input.trainerId || input.trainerId.trim().length === 0) {
        return ApplicationResult.fail('Trainer ID cannot be empty.');
      }

      const trimmedTrainerId = input.trainerId.trim();
      const isFacilityWide =
        trimmedTrainerId.toUpperCase() === 'FACILITY' || trimmedTrainerId.toUpperCase() === 'ALL';

      const evalDate = input.asOfDate ? new Date(input.asOfDate) : this.clock.now();
      const horizonDays = input.horizonDays !== undefined ? Math.max(1, input.horizonDays) : 7;
      const horizonMs = horizonDays * 24 * 60 * 60 * 1000;
      const timezone = input.timezone ?? 'UTC';
      const facilityId = input.facilityId ?? 'main';

      // 1. Fetch memberships based on scope
      let memberships: Membership[] = [];
      if (isFacilityWide) {
        if (this.membershipRepository.findAll) {
          memberships = await this.membershipRepository.findAll();
        }
      } else if (this.membershipRepository.findByTrainerId) {
        memberships = await this.membershipRepository.findByTrainerId(trimmedTrainerId);
      } else {
        const all = await this.membershipRepository.findAll();
        memberships = all.filter((m) => m.trainerAssignment?.trainerId === trimmedTrainerId);
      }

      const assignedClientIds = new Set<string>();
      let activeCount = 0;
      let expiringCount = 0;
      let frozenCount = 0;

      for (const mem of memberships) {
        if (isFacilityWide) {
          if (
            mem.trainerAssignment?.trainerId &&
            mem.trainerAssignment.trainerId.trim().length > 0
          ) {
            assignedClientIds.add(mem.clientId);
          }
        } else {
          assignedClientIds.add(mem.clientId);
        }

        const isCurrentlyFrozen = mem.isCurrentlyFrozen(evalDate);
        if (isCurrentlyFrozen || mem.status === MembershipStatus.FROZEN) {
          frozenCount++;
        }

        if (mem.status === MembershipStatus.ACTIVE && !isCurrentlyFrozen) {
          activeCount++;
          const endMs = mem.period.endDate.getTime();
          const diffMs = endMs - evalDate.getTime();
          if (diffMs <= horizonMs && diffMs > 0) {
            expiringCount++;
          }
        }
      }

      // 2. Fetch today's check-ins and distinct client visits
      const gymDay = GymDay.fromUtc(evalDate, timezone, facilityId);
      const dayRecords = await this.attendanceRepository.findByGymDay(
        gymDay.toString(),
        facilityId,
      );

      let todayCheckInsCount = 0;
      let todayGrantedCheckInsCount = 0;
      const uniqueVisitingClientIds = new Set<string>();

      for (const record of dayRecords) {
        if (record.result === AccessResult.GRANTED) {
          todayGrantedCheckInsCount++;
          if (isFacilityWide || assignedClientIds.has(record.clientId)) {
            todayCheckInsCount++;
            uniqueVisitingClientIds.add(record.clientId);
          }
        }
      }

      const summaryDTO: TrainerDashboardSummaryDTO = {
        trainerId: input.trainerId,
        asOf: evalDate.toISOString(),
        horizonDays,
        totalAssignedClients: assignedClientIds.size,
        activeMembershipsCount: activeCount,
        expiringMembershipsCount: expiringCount,
        expiringSoonMembershipsCount: expiringCount,
        frozenMembershipsCount: frozenCount,
        todayCheckInsCount,
        todayGrantedCheckInsCount: isFacilityWide ? todayGrantedCheckInsCount : todayCheckInsCount,
        todayClientVisitsCount: uniqueVisitingClientIds.size,
        todayTotalCheckInsCount: dayRecords.length,
      };

      return ApplicationResult.ok(summaryDTO);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
