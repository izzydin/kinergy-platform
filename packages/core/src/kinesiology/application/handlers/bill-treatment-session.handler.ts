import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { BillTreatmentSessionCommand } from '../commands/bill-treatment-session.command';
import { ITreatmentSessionRepository } from '../../domain/repositories/treatment-session.repository';
import { SessionId } from '../../domain/treatment-session/session-id.vo';
import { SessionStatus } from '../../domain/treatment-session/session-status.enum';
import {
  IKinesiologySalesGatewayPort,
  KinesiologySaleResult,
} from '../ports/kinesiology-sales-gateway.port';
import { ISchedulingAppointmentLookupPort } from '../ports/scheduling-appointment-lookup.port';
import {
  KinesiologyFeeScheduleResolver,
  DefaultKinesiologyFeeScheduleResolver,
} from '../ports/kinesiology-fee-schedule.resolver';

/**
 * Command Handler that coordinates the commercial billing of a clinical TreatmentSession with Sales.
 * Enforces bounded context separation, single-billing invariant, client validation, and authoritative pricing.
 * Adheres strictly to ADR-0110, ADR-0121, and ADR-0139.
 */
export class BillTreatmentSessionHandler implements CommandHandler<
  BillTreatmentSessionCommand,
  ApplicationResult<KinesiologySaleResult>
> {
  private readonly feeResolver: KinesiologyFeeScheduleResolver;

  constructor(
    private readonly sessionRepository: ITreatmentSessionRepository,
    private readonly salesGateway: IKinesiologySalesGatewayPort,
    private readonly appointmentLookupPort?: ISchedulingAppointmentLookupPort,
    feeResolver?: KinesiologyFeeScheduleResolver,
  ) {
    this.feeResolver = feeResolver ?? new DefaultKinesiologyFeeScheduleResolver();
  }

  public async execute(
    command: BillTreatmentSessionCommand,
  ): Promise<ApplicationResult<KinesiologySaleResult>> {
    try {
      const { sessionId, expectedClientId, tenantId, idempotencyKey } = command.input;

      if (!sessionId || sessionId.trim().length === 0) {
        return ApplicationResult.fail('Session ID cannot be empty.');
      }

      const sessionIdentifier = SessionId.create(sessionId.trim());
      const session = await this.sessionRepository.findById(sessionIdentifier);

      if (!session) {
        return ApplicationResult.fail(`TreatmentSession with ID '${sessionId}' not found.`);
      }

      // Lifecycle Invariant: Only COMPLETED sessions are billable (ADR-0139 §3.1)
      if (session.status !== SessionStatus.COMPLETED) {
        return ApplicationResult.fail(
          `Treatment session '${sessionId}' is in '${session.status}' status. Only COMPLETED clinical sessions can be billed.`,
        );
      }

      // Client Identity Invariant: Prohibit client mismatch (ADR-0139 §5)
      if (expectedClientId && expectedClientId.trim() !== session.clientId) {
        return ApplicationResult.fail(
          `Client mismatch: Session client '${session.clientId}' does not match requested client '${expectedClientId.trim()}'.`,
        );
      }

      // Authoritative Price Resolution via Appointment Lookup
      let feeCents = 8000; // Standard clinical treatment session rate ($80.00)
      if (this.appointmentLookupPort && session.appointmentId) {
        try {
          const apptRef = await this.appointmentLookupPort.getAppointmentReference(
            session.appointmentId,
          );
          if (apptRef) {
            feeCents = this.feeResolver.getServiceFeeCents('TREATMENT');
          }
        } catch {
          feeCents = this.feeResolver.getServiceFeeCents();
        }
      }

      const unitPriceAmount = feeCents / 100;
      const currency = 'USD';
      const description = `Clinical Kinesiology Session - Therapist ${session.therapistId}`;

      // Request commercial Sale creation via Sales Gateway
      const saleResult = await this.salesGateway.createSale({
        sessionId: session.id.getValue(),
        clientId: session.clientId,
        therapistId: session.therapistId,
        appointmentId: session.appointmentId,
        unitPriceAmount,
        currency,
        tenantId,
        idempotencyKey,
        description,
      });

      return saleResult;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unexpected failure during session billing.';
      return ApplicationResult.fail(errorMessage);
    }
  }
}
