import { TreatmentSessionCompletedEvent } from '../../domain/events/treatment-session-completed.event';
import { BillTreatmentSessionHandler } from './bill-treatment-session.handler';
import { BillTreatmentSessionCommand } from '../commands/bill-treatment-session.command';
import { ApplicationResult } from '../shared/application-result';
import { KinesiologySaleResult } from '../ports/kinesiology-sales-gateway.port';

/**
 * Event-driven Coordinator reacting to TreatmentSessionCompletedEvent
 * to trigger commercial Sale creation at the documented commercial lifecycle event.
 * Adheres strictly to ADR-0139.
 */
export class TreatmentSessionBillingCoordinator {
  constructor(private readonly billSessionHandler: BillTreatmentSessionHandler) {}

  /**
   * Handles TreatmentSessionCompletedEvent by issuing a BillTreatmentSessionCommand.
   */
  public async onSessionCompleted(
    event: TreatmentSessionCompletedEvent,
    tenantId?: string,
  ): Promise<ApplicationResult<KinesiologySaleResult>> {
    if (!event || !event.payload || !event.payload.sessionId) {
      return ApplicationResult.fail('Invalid TreatmentSessionCompletedEvent payload.');
    }

    const command = new BillTreatmentSessionCommand({
      sessionId: event.payload.sessionId,
      expectedClientId: event.payload.clientId,
      tenantId,
      idempotencyKey: `sale_session_${event.payload.sessionId}`,
    });

    return this.billSessionHandler.execute(command);
  }
}
