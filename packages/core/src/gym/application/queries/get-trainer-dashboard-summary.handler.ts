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

      const evalDate = input.asOfDate ? new Date(input.asOfDate) : this.clock.now();
      const horizonDays = input.horizonDays !== undefined ? Math.max(1, input.horizonDays) : 7;
      const horizonMs = horizonDays * 24 * 60 * 60 * 1000;
      const timezone = input.timezone ?? 'UTC';
      const facilityId = input.facilityId ?? 'main';

      // 1. Fetch assigned memberships
      let memberships: Membership[] = [];
      if (this.membershipRepository.findByTrainerId) {
        memberships = await this.membershipRepository.findByTrainerId(input.trainerId.trim());
      } else {
        const all = await this.membershipRepository.findAll();
        memberships = all.filter((m) => m.trainerAssignment?.trainerId === input.trainerId.trim());
      }

      const assignedClientIds = new Set<string>();
      let activeCount = 0;
      let expiringCount = 0;
      let frozenCount = 0;

      for (const mem of memberships) {
        assignedClientIds.add(mem.clientId);

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

      // 2. Fetch today's check-ins for assigned clients
      let todayCheckInsCount = 0;
      if (assignedClientIds.size > 0) {
        const gymDay = GymDay.fromUtc(evalDate, timezone, facilityId);
        const dayRecords = await this.attendanceRepository.findByGymDay(
          gymDay.toString(),
          facilityId,
        );
        for (const record of dayRecords) {
          if (record.result === AccessResult.GRANTED && assignedClientIds.has(record.clientId)) {
            todayCheckInsCount++;
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
        frozenMembershipsCount: frozenCount,
        todayCheckInsCount,
      };

      return ApplicationResult.ok(summaryDTO);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
