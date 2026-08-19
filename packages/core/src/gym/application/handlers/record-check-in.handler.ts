import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { RecordCheckInCommand } from '../commands/record-check-in.command';
import { RecordCheckInResultDTO } from '../dtos/record-check-in-result.dto';
import { AttendanceRecordRepository } from '../../domain/repositories/attendance-record.repository';
import { MembershipEligibilityPort } from '../ports/membership-eligibility.port';
import { GymEventPublisherPort } from '../ports/gym-event-publisher.port';
import { Clock } from '../../domain/shared/clock';
import { AttendanceRecord } from '../../domain/attendance/attendance-record.aggregate';
import { AccessResult } from '../../domain/attendance/access-result.enum';
import { CheckInMethod } from '../../domain/attendance/check-in-method.enum';
import { GymDay } from '../../domain/attendance/gym-day.vo';
import { MembershipEligibilityOutcome } from '../dtos/membership-eligibility-outcome.enum';

interface IdempotencyEntry {
  readonly result: RecordCheckInResultDTO;
  readonly recordedAt: number;
}

/**
 * Use case handler orchestrating the complete gym admission check-in workflow.
 *
 * Operational Flow:
 * 1. Validate request parameters.
 * 2. Evaluate Idempotency: Check if request with identical idempotencyKey was previously processed.
 * 3. Evaluate Membership Eligibility: Delegate to MembershipEligibilityPort (ADR-0065).
 * 4. Record and persist denied attempt if ineligible (audit trail).
 * 5. Enforce Anti-Passback & Rapid Re-scan Duplicate Policy: Verify no granted entries within cooldown window.
 * 6. Record and persist GRANTED attendance event.
 * 7. Publish domain events via outbox / publisher.
 * 8. Return structured operational diagnostic response.
 */
export class RecordCheckInHandler implements CommandHandler<
  RecordCheckInCommand,
  ApplicationResult<RecordCheckInResultDTO>
> {
  public static readonly DEFAULT_ANTI_PASSBACK_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly IDEMPOTENCY_TTL_MS = 10 * 60 * 1000; // 10 minutes cache TTL

  private readonly antiPassbackCooldownMs: number;
  private readonly idempotencyCache = new Map<string, IdempotencyEntry>();

  constructor(
    private readonly attendanceRepository: AttendanceRecordRepository,
    private readonly membershipEligibilityPort: MembershipEligibilityPort,
    private readonly clock: Clock,
    private readonly eventPublisher?: GymEventPublisherPort,
    antiPassbackCooldownMs?: number,
  ) {
    this.antiPassbackCooldownMs =
      antiPassbackCooldownMs ?? RecordCheckInHandler.DEFAULT_ANTI_PASSBACK_COOLDOWN_MS;
  }

  public async execute(
    command: RecordCheckInCommand,
  ): Promise<ApplicationResult<RecordCheckInResultDTO>> {
    try {
      const { input } = command;

      // 1. Basic input integrity check
      const clientId = input.clientId?.trim();
      if (!clientId) {
        return ApplicationResult.fail('Client ID is required.');
      }

      if (!input.method || !Object.values(CheckInMethod).includes(input.method)) {
        return ApplicationResult.fail(`Invalid check-in method: '${input.method}'.`);
      }

      const now = input.asOf ? new Date(input.asOf.getTime()) : this.clock.now();
      const facilityId = input.facilityId?.trim() || 'main';
      const timezone = input.timezone?.trim() || this.clock.timezone();
      const gymDay = GymDay.fromUtc(now, timezone, facilityId);

      // 2. Idempotency verification
      const idempotencyKey = input.idempotencyKey?.trim();
      if (idempotencyKey) {
        this.pruneExpiredIdempotency();
        const cached = this.idempotencyCache.get(idempotencyKey);
        if (cached) {
          return ApplicationResult.ok<RecordCheckInResultDTO>({
            ...cached.result,
            isIdempotentReplay: true,
          });
        }
      }

      // 3. Evaluate Membership Eligibility (Cross-Context Port)
      const eligibility = await this.membershipEligibilityPort.evaluateEligibility(clientId, now);

      // 4. Handle Ineligible Client / Membership
      if (!eligibility.isEligible) {
        const deniedResult = this.mapOutcomeToAccessResult(eligibility.outcome);
        const deniedRecord = AttendanceRecord.record(
          {
            clientId,
            membershipId: null,
            checkInTime: now,
            gymDay,
            method: input.method,
            result: deniedResult,
            gateId: input.gateId,
            receptionistId: input.receptionistId,
            notes: eligibility.reason,
          },
          this.clock,
        );

        await this.attendanceRepository.append(deniedRecord);
        await this.publishEvents(deniedRecord);

        const responseDTO: RecordCheckInResultDTO = {
          isGranted: false,
          outcome: deniedResult,
          attendanceId: deniedRecord.id.value,
          clientId,
          membershipId: eligibility.membershipId,
          planId: eligibility.planId,
          checkInTime: now.toISOString(),
          gymDay: gymDay.getValue(),
          method: input.method,
          gateId: input.gateId ?? null,
          receptionistId: input.receptionistId ?? null,
          isDuplicate: false,
          isIdempotentReplay: false,
          denialReason: eligibility.reason,
        };

        if (idempotencyKey) {
          this.cacheIdempotentResult(idempotencyKey, responseDTO);
        }

        return ApplicationResult.ok<RecordCheckInResultDTO>(responseDTO);
      }

      // 5. Anti-Passback & Rapid Re-scan Duplicate Check
      const cooldownSince = new Date(now.getTime() - this.antiPassbackCooldownMs);
      const recentRecords = await this.attendanceRepository.findRecentByClientId(
        clientId,
        cooldownSince,
      );

      const recentGranted = recentRecords.find((r) => r.isGranted());
      if (recentGranted) {
        const duplicateReason = `Duplicate check-in detected within anti-passback cooldown window (${this.antiPassbackCooldownMs / 1000}s). Previous entry at ${recentGranted.checkInTime.toISOString()}.`;

        const duplicateDeniedRecord = AttendanceRecord.record(
          {
            clientId,
            membershipId: null,
            checkInTime: now,
            gymDay,
            method: input.method,
            result: AccessResult.DENIED_DUPLICATE_CHECKIN,
            gateId: input.gateId,
            receptionistId: input.receptionistId,
            notes: duplicateReason,
          },
          this.clock,
        );

        await this.attendanceRepository.append(duplicateDeniedRecord);
        await this.publishEvents(duplicateDeniedRecord);

        const responseDTO: RecordCheckInResultDTO = {
          isGranted: false,
          outcome: AccessResult.DENIED_DUPLICATE_CHECKIN,
          attendanceId: duplicateDeniedRecord.id.value,
          clientId,
          membershipId: eligibility.membershipId,
          planId: eligibility.planId,
          checkInTime: now.toISOString(),
          gymDay: gymDay.getValue(),
          method: input.method,
          gateId: input.gateId ?? null,
          receptionistId: input.receptionistId ?? null,
          isDuplicate: true,
          isIdempotentReplay: false,
          denialReason: duplicateReason,
        };

        if (idempotencyKey) {
          this.cacheIdempotentResult(idempotencyKey, responseDTO);
        }

        return ApplicationResult.ok<RecordCheckInResultDTO>(responseDTO);
      }

      // 6. Record and Persist Successful Admission
      const grantedRecord = AttendanceRecord.record(
        {
          clientId,
          membershipId: eligibility.membershipId!,
          checkInTime: now,
          gymDay,
          method: input.method,
          result: AccessResult.GRANTED,
          gateId: input.gateId,
          receptionistId: input.receptionistId,
          notes: input.notes,
        },
        this.clock,
      );

      await this.attendanceRepository.append(grantedRecord);
      await this.publishEvents(grantedRecord);

      const responseDTO: RecordCheckInResultDTO = {
        isGranted: true,
        outcome: AccessResult.GRANTED,
        attendanceId: grantedRecord.id.value,
        clientId,
        membershipId: eligibility.membershipId,
        planId: eligibility.planId,
        checkInTime: now.toISOString(),
        gymDay: gymDay.getValue(),
        method: input.method,
        gateId: input.gateId ?? null,
        receptionistId: input.receptionistId ?? null,
        isDuplicate: false,
        isIdempotentReplay: false,
        denialReason: null,
      };

      if (idempotencyKey) {
        this.cacheIdempotentResult(idempotencyKey, responseDTO);
      }

      return ApplicationResult.ok<RecordCheckInResultDTO>(responseDTO);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown check-in error';
      return ApplicationResult.fail(`Failed to record check-in: ${message}`);
    }
  }

  private mapOutcomeToAccessResult(outcome: MembershipEligibilityOutcome): AccessResult {
    switch (outcome) {
      case MembershipEligibilityOutcome.INACTIVE_CLIENT:
        return AccessResult.DENIED_INACTIVE_CLIENT;
      case MembershipEligibilityOutcome.NO_MEMBERSHIP:
        return AccessResult.DENIED_NO_MEMBERSHIP;
      case MembershipEligibilityOutcome.EXPIRED:
        return AccessResult.DENIED_EXPIRED;
      case MembershipEligibilityOutcome.FROZEN:
        return AccessResult.DENIED_FROZEN;
      case MembershipEligibilityOutcome.NOT_YET_ACTIVE:
      case MembershipEligibilityOutcome.CANCELLED:
      case MembershipEligibilityOutcome.TERMINATED:
      default:
        return AccessResult.DENIED_NO_MEMBERSHIP;
    }
  }

  private async publishEvents(record: AttendanceRecord): Promise<void> {
    if (!this.eventPublisher) {
      return;
    }
    const events = record.getUncommittedEvents();
    if (events.length > 0) {
      await this.eventPublisher.publish(events);
      record.clearEvents();
    }
  }

  private cacheIdempotentResult(key: string, result: RecordCheckInResultDTO): void {
    this.idempotencyCache.set(key, {
      result,
      recordedAt: Date.now(),
    });
  }

  private pruneExpiredIdempotency(): void {
    const now = Date.now();
    for (const [key, entry] of this.idempotencyCache.entries()) {
      if (now - entry.recordedAt > RecordCheckInHandler.IDEMPOTENCY_TTL_MS) {
        this.idempotencyCache.delete(key);
      }
    }
  }
}
