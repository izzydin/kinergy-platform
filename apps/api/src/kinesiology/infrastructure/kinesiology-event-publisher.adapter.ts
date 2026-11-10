import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import {
  DomainEventPublisher,
  DomainEvent,
  Clock,
  AppointmentStatus,
  TreatmentSessionCompletedEvent,
  TreatmentSessionStartedEvent,
  ITreatmentSessionRepository,
  SessionId,
} from '@kinergy-platform/core';
import { PrismaAppointmentRepository } from '@kinergy-platform/core/server';
import { KINESIOLOGY_CLOCK_TOKEN, TREATMENT_SESSION_REPOSITORY_TOKEN } from '../kinesiology.tokens';

/**
 * Event publisher adapter for Kinesiology bounded context.
 * Propagates domain events asynchronously to upstream/downstream contexts
 * (such as Scheduling appointment lifecycle synchronization) while isolating
 * primary clinical execution from downstream failures.
 * Adheres to ADR-0047, ADR-0049.
 */
@Injectable()
export class KinesiologyEventPublisherAdapter implements DomainEventPublisher {
  private readonly logger = new Logger(KinesiologyEventPublisherAdapter.name);

  constructor(
    private readonly appointmentRepo: PrismaAppointmentRepository,
    @Optional()
    @Inject(TREATMENT_SESSION_REPOSITORY_TOKEN)
    private readonly sessionRepo?: ITreatmentSessionRepository,
    @Optional()
    @Inject(KINESIOLOGY_CLOCK_TOKEN)
    private readonly clock?: Clock,
  ) {}

  public async publish(event: DomainEvent): Promise<void> {
    if (!event) return;

    try {
      if (
        event instanceof TreatmentSessionCompletedEvent ||
        event.eventName === 'TreatmentSessionCompleted'
      ) {
        const payload = (event as TreatmentSessionCompletedEvent).payload;
        if (payload?.appointmentId) {
          await this.syncAppointmentCompleted(payload.appointmentId);
        }
      } else if (
        event instanceof TreatmentSessionStartedEvent ||
        event.eventName === 'TreatmentSessionStarted'
      ) {
        const payload = (event as TreatmentSessionStartedEvent).payload;
        let appointmentId: string | undefined;
        if (this.sessionRepo && payload?.sessionId) {
          const session = await this.sessionRepo.findById(SessionId.create(payload.sessionId));
          if (session) {
            appointmentId = session.appointmentId;
          }
        }
        if (appointmentId) {
          await this.syncAppointmentStarted(appointmentId);
        }
      }
    } catch (err: unknown) {
      // Isolate event handler error so primary clinical operations are never rolled back
      this.logger.error(
        `Error publishing domain event '${event.eventName}': ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  private async syncAppointmentStarted(appointmentId: string): Promise<void> {
    try {
      const appt = await this.appointmentRepo.findById(appointmentId);
      if (!appt) {
        this.logger.warn(`Appointment '${appointmentId}' not found for start synchronization.`);
        return;
      }

      if (
        appt.status === AppointmentStatus.COMPLETED ||
        appt.status === AppointmentStatus.CANCELLED ||
        appt.status === AppointmentStatus.NO_SHOW ||
        appt.status === AppointmentStatus.IN_PROGRESS
      ) {
        return;
      }

      if (
        appt.status === AppointmentStatus.SCHEDULED ||
        appt.status === AppointmentStatus.CONFIRMED ||
        appt.status === AppointmentStatus.RESCHEDULED
      ) {
        appt.checkIn(this.clock);
        await this.appointmentRepo.save(appt);
      }

      if (appt.status === AppointmentStatus.CHECKED_IN) {
        appt.start(this.clock);
        await this.appointmentRepo.save(appt);
      }

      this.logger.log(`Synchronized Appointment '${appointmentId}' status to IN_PROGRESS.`);
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to sync appointment start for '${appointmentId}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async syncAppointmentCompleted(appointmentId: string): Promise<void> {
    try {
      const appt = await this.appointmentRepo.findById(appointmentId);
      if (!appt) {
        this.logger.warn(
          `Appointment '${appointmentId}' not found for completion synchronization.`,
        );
        return;
      }

      // Guard: already completed is an idempotent no-op
      if (appt.status === AppointmentStatus.COMPLETED) {
        return;
      }

      // Guard: cancelled or no-show cannot be transitioned to completed
      if (
        appt.status === AppointmentStatus.CANCELLED ||
        appt.status === AppointmentStatus.NO_SHOW
      ) {
        this.logger.warn(
          `Appointment '${appointmentId}' is in terminal status '${appt.status}'. Skipping completion synchronization.`,
        );
        return;
      }

      // Progressively advance through domain invariants to reach COMPLETED safely
      if (
        appt.status === AppointmentStatus.SCHEDULED ||
        appt.status === AppointmentStatus.CONFIRMED ||
        appt.status === AppointmentStatus.RESCHEDULED
      ) {
        appt.checkIn(this.clock);
        await this.appointmentRepo.save(appt);
      }

      if (appt.status === AppointmentStatus.CHECKED_IN) {
        appt.start(this.clock);
        await this.appointmentRepo.save(appt);
      }

      if (appt.status === AppointmentStatus.IN_PROGRESS) {
        appt.complete(this.clock);
        await this.appointmentRepo.save(appt);
      }

      this.logger.log(`Synchronized Appointment '${appointmentId}' status to COMPLETED.`);
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to sync appointment completion for '${appointmentId}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
