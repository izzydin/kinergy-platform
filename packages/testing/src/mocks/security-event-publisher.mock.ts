export interface SecurityEventPayload {
  eventId: string;
  eventType: string;
  timestamp: Date;
  userId?: string | null;
  email?: string | null;
  tenantId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Mock Security Event Publisher capturing domain security events for assertions.
 */
export class MockSecurityEventPublisher {
  public publishedEvents: SecurityEventPayload[] = [];

  public async publish(event: SecurityEventPayload): Promise<void> {
    this.publishedEvents.push(event);
  }

  public clear(): void {
    this.publishedEvents = [];
  }

  public getEventsByType(eventType: string): SecurityEventPayload[] {
    return this.publishedEvents.filter((event) => event.eventType === eventType);
  }

  public hasPublishedEvent(eventType: string, userId?: string): boolean {
    return this.publishedEvents.some(
      (event) => event.eventType === eventType && (!userId || event.userId === userId),
    );
  }
}
