import { Inject, Injectable, Optional } from '@nestjs/common';
import { ILoggerPort, LOGGER_PORT } from '../logging';
import { IAuditEvent } from './audit-event.interface';
import { IAuditEventPublisher } from './audit-event-publisher.interface';
import { AuditSeverity } from './audit-event-types';

/**
 * Infrastructure Adapter implementing IAuditEventPublisher.
 * Outputs structured JSON audit events to the centralized PlatformLogger.
 */
@Injectable()
export class LoggerAuditEventPublisher implements IAuditEventPublisher {
  constructor(@Inject(LOGGER_PORT) @Optional() private readonly logger?: ILoggerPort) {}

  async publish(event: IAuditEvent): Promise<void> {
    if (!event) {
      return;
    }

    const payload = JSON.stringify({
      id: event.eventId,
      type: event.eventType,
      category: event.category,
      timestamp: event.timestamp ? event.timestamp.toISOString() : new Date().toISOString(),
      actor: event.actor,
      target: event.target,
      outcome: event.outcome,
      severity: event.severity,
      tenantId: event.tenantId ?? null,
      metadata: event.metadata ?? {},
    });

    const message = `[AUDIT RECORD] ${event.category}:${event.eventType} | Target: ${event.target.type}(${event.target.id}) | Outcome: ${event.outcome} | Data: ${payload}`;

    switch (event.severity) {
      case AuditSeverity.CRITICAL:
      case AuditSeverity.HIGH:
        this.logger?.error(message, undefined, 'AuditEventPublisher');
        break;
      case AuditSeverity.MEDIUM:
        this.logger?.warn(message, 'AuditEventPublisher');
        break;
      case AuditSeverity.LOW:
      default:
        this.logger?.log(message, 'AuditEventPublisher');
        break;
    }
  }

  async publishBatch(events: IAuditEvent[]): Promise<void> {
    if (!events || events.length === 0) {
      return;
    }
    for (const event of events) {
      await this.publish(event);
    }
  }
}
