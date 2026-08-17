import {
  ClientArchivedEvent,
  ClientCreatedEvent,
  ClientRestoredEvent,
  ClientUpdatedEvent,
  IdentityLinkedEvent,
} from '../../domain/events';
import { ClientTimelineEntry } from '../../domain/read-models/client-timeline-entry.entity';
import { ClientTimelineRepository } from '../../domain/repositories/client-timeline.repository';

export class ClientTimelineProjectionHandler {
  constructor(private readonly timelineRepository: ClientTimelineRepository) {}

  public async handle(event: unknown): Promise<void> {
    try {
      if (!event || typeof event !== 'object') {
        return;
      }

      if (event instanceof ClientCreatedEvent) {
        await this.timelineRepository.save(
          ClientTimelineEntry.create({
            clientId: event.clientId,
            sourceModule: 'CLIENT',
            eventType: 'CLIENT_CREATED',
            summary: 'Client account registered',
            metadata: {
              referenceNumber: event.referenceNumber,
              email: event.email,
              phone: event.phone,
            },
            occurredAt: event.occurredAt,
          }),
        );
        return;
      }

      if (event instanceof ClientUpdatedEvent) {
        await this.timelineRepository.save(
          ClientTimelineEntry.create({
            clientId: event.clientId,
            sourceModule: 'CLIENT',
            eventType: 'CLIENT_UPDATED',
            summary: 'Client details updated',
            metadata: {
              updatedFields: event.updatedFields,
            },
            occurredAt: event.occurredAt,
          }),
        );
        return;
      }

      if (event instanceof IdentityLinkedEvent) {
        await this.timelineRepository.save(
          ClientTimelineEntry.create({
            clientId: event.clientId,
            sourceModule: 'IDENTITY',
            eventType: 'IDENTITY_LINKED',
            summary: 'Authentication credentials linked',
            metadata: {
              identityId: event.identityId,
            },
            occurredAt: event.occurredAt,
          }),
        );
        return;
      }

      if (event instanceof ClientArchivedEvent) {
        await this.timelineRepository.save(
          ClientTimelineEntry.create({
            clientId: event.clientId,
            sourceModule: 'CLIENT',
            eventType: 'CLIENT_ARCHIVED',
            summary: 'Client profile archived',
            metadata: {},
            occurredAt: event.occurredAt,
          }),
        );
        return;
      }

      if (event instanceof ClientRestoredEvent) {
        await this.timelineRepository.save(
          ClientTimelineEntry.create({
            clientId: event.clientId,
            sourceModule: 'CLIENT',
            eventType: 'CLIENT_RESTORED',
            summary: 'Client profile restored',
            metadata: {},
            occurredAt: event.occurredAt,
          }),
        );
        return;
      }

      // Kinesiology: TreatmentSessionCompleted
      if (
        (event as { eventType?: string }).eventType === 'TreatmentSessionCompleted' ||
        (event as { name?: string }).name === 'TreatmentSessionCompleted'
      ) {
        const payload = (
          event as {
            payload?: {
              sessionId: string;
              clientId: string;
              therapistId: string;
              appointmentId: string;
              completedAt?: Date;
            };
            occurredAt?: Date;
          }
        ).payload;

        if (payload?.clientId && payload?.sessionId) {
          await this.timelineRepository.save(
            ClientTimelineEntry.create({
              clientId: payload.clientId,
              sourceModule: 'KINESIOLOGY',
              eventType: 'TREATMENT_SESSION_COMPLETED',
              summary: 'Kinesiology treatment session completed',
              metadata: {
                sessionId: payload.sessionId,
                therapistId: payload.therapistId,
                appointmentId: payload.appointmentId,
              },
              occurredAt:
                payload.completedAt ?? (event as { occurredAt?: Date }).occurredAt ?? new Date(),
            }),
          );
          return;
        }
      }
    } catch (error) {
      // Gracefully catch and log projection errors without throwing
      console.error('Error handling timeline projection event:', error);
    }
  }
}
