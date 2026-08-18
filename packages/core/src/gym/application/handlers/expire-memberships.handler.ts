import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { ExpireMembershipsCommand } from '../commands/expire-memberships.command';
import {
  ExpireMembershipsResultDTO,
  ExpiredMembershipDetailDTO,
  FailedMembershipDetailDTO,
} from '../dtos/expire-memberships-result.dto';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { GymEventPublisherPort } from '../ports/gym-event-publisher.port';
import { GymLoggerPort } from '../ports/gym-logger.port';
import { Clock } from '../../domain/shared/clock';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';

/**
 * Use case handler orchestrating the batch reconciliation and materialization of expired memberships.
 *
 * Responsibilities:
 * 1. Identifies candidate memberships whose validity period has elapsed (as of evaluation timestamp).
 * 2. Enforces pure domain lifecycle transition (membership.expire(clock)) for each eligible candidate.
 * 3. Atomically persists each state transition to prevent multi-item cascade failures.
 * 4. Publishes MembershipExpiredEvent domain events once transition is durably saved.
 * 5. Provides failure isolation (single failed record does not halt execution of remaining batch).
 * 6. Emits structured observability logs and returns execution metrics.
 */
export class ExpireMembershipsHandler implements CommandHandler<
  ExpireMembershipsCommand,
  ApplicationResult<ExpireMembershipsResultDTO>
> {
  private static readonly DEFAULT_BATCH_SIZE = 500;

  constructor(
    private readonly membershipRepository: MembershipRepository,
    private readonly clock: Clock,
    private readonly eventPublisher?: GymEventPublisherPort,
    private readonly logger?: GymLoggerPort,
  ) {}

  public async execute(
    command: ExpireMembershipsCommand,
  ): Promise<ApplicationResult<ExpireMembershipsResultDTO>> {
    const startTime = Date.now();

    try {
      const { input } = command;

      // 1. Resolve evaluation timestamp
      let asOf: Date;
      if (input.asOfDate) {
        asOf = input.asOfDate instanceof Date ? input.asOfDate : new Date(input.asOfDate);
        if (isNaN(asOf.getTime())) {
          return ApplicationResult.fail(`Invalid asOfDate '${String(input.asOfDate)}'.`);
        }
      } else {
        asOf = this.clock.now();
      }

      // 2. Resolve batch limit
      const batchSize =
        input.batchSize !== undefined && input.batchSize > 0
          ? input.batchSize
          : ExpireMembershipsHandler.DEFAULT_BATCH_SIZE;

      const dryRun = input.dryRun ?? false;

      this.logger?.info('Starting automatic membership expiration processing', {
        asOf: asOf.toISOString(),
        batchSize,
        dryRun,
      });

      // 3. Query candidate memberships
      const candidates = await this.membershipRepository.findExpiringCandidates(asOf, batchSize);

      const expiredDetails: ExpiredMembershipDetailDTO[] = [];
      const failedDetails: FailedMembershipDetailDTO[] = [];
      let processedCount = 0;
      let expiredCount = 0;
      let skippedCount = 0;
      let failedCount = 0;

      // 4. Process each candidate with fault isolation
      for (const membership of candidates) {
        processedCount++;

        // Filter: Must be in ACTIVE or FROZEN status
        if (
          membership.status !== MembershipStatus.ACTIVE &&
          membership.status !== MembershipStatus.FROZEN
        ) {
          skippedCount++;
          continue;
        }

        // Filter: Must not currently be valid according to half-open interval [startDate, endDate)
        if (membership.period.isCurrent(asOf)) {
          skippedCount++;
          continue;
        }

        if (dryRun) {
          expiredDetails.push({
            membershipId: membership.id.value,
            clientId: membership.clientId,
            previousStatus: membership.status,
            expiredAt: asOf.toISOString(),
          });
          expiredCount++;
          continue;
        }

        try {
          const previousStatus = membership.status;

          // Domain Transition
          membership.expire(this.clock);

          // Atomic Persistence
          await this.membershipRepository.save(membership);

          // Domain Event Publication
          if (this.eventPublisher) {
            const events = membership.getUncommittedEvents();
            if (events.length > 0) {
              await this.eventPublisher.publish(events);
              membership.clearEvents();
            }
          }

          expiredDetails.push({
            membershipId: membership.id.value,
            clientId: membership.clientId,
            previousStatus,
            expiredAt: asOf.toISOString(),
          });
          expiredCount++;
        } catch (err: unknown) {
          failedCount++;
          const errorMessage = err instanceof Error ? err.message : String(err);
          failedDetails.push({
            membershipId: membership.id.value,
            error: errorMessage,
          });

          this.logger?.error(
            `Failed to expire membership '${membership.id.value}': ${errorMessage}`,
            err instanceof Error ? err.stack : undefined,
            { membershipId: membership.id.value, clientId: membership.clientId },
          );
        }
      }

      const durationMs = Date.now() - startTime;

      this.logger?.info('Completed automatic membership expiration processing', {
        asOf: asOf.toISOString(),
        processedCount,
        expiredCount,
        skippedCount,
        failedCount,
        durationMs,
        dryRun,
      });

      const resultDTO: ExpireMembershipsResultDTO = {
        processedCount,
        expiredCount,
        skippedCount,
        failedCount,
        durationMs,
        dryRun,
        expired: expiredDetails,
        errors: failedDetails,
      };

      return ApplicationResult.ok(resultDTO);
    } catch (globalErr: unknown) {
      const message = globalErr instanceof Error ? globalErr.message : String(globalErr);
      this.logger?.error(`Fatal error during membership expiration processing: ${message}`);
      return ApplicationResult.fail(message);
    }
  }
}
