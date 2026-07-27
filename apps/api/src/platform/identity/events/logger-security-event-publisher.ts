import { Injectable, Logger } from '@nestjs/common';
import { ISecurityEventPublisher } from './security-event-publisher.interface';
import { SecurityEvent } from './security-event.interface';

/**
 * Infrastructure implementation of ISecurityEventPublisher.
 * Outputs structured JSON security events to the application logger.
 * Ready for future extension/delegation to message brokers (Kafka, RabbitMQ, EventBridge) or SIEM platforms.
 */
@Injectable()
export class LoggerSecurityEventPublisher implements ISecurityEventPublisher {
  private readonly logger = new Logger('SecurityEventPublisher');

  async publish(event: SecurityEvent): Promise<void> {
    const formattedPayload = {
      eventId: event.eventId,
      type: event.eventType,
      timestamp: event.timestamp.toISOString(),
      userId: event.userId ?? null,
      email: event.email ?? null,
      tenantId: event.tenantId ?? null,
      metadata: event.metadata ?? {},
    };

    if (event.eventType === 'RefreshTokenReplayDetected' || event.eventType === 'LoginFailed') {
      this.logger.warn(
        `[SECURITY EVENT REJECTED/ALERT] ${event.eventType}: ${JSON.stringify(formattedPayload)}`,
      );
    } else {
      this.logger.log(
        `[SECURITY EVENT PUBLISHED] ${event.eventType}: ${JSON.stringify(formattedPayload)}`,
      );
    }
  }
}
