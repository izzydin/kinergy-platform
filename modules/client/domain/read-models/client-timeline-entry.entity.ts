import { randomUUID } from 'crypto';

export interface ClientTimelineEntryProps {
  id?: string;
  clientId: string;
  sourceModule: string;
  eventType: string;
  summary: string;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

export class ClientTimelineEntry {
  public readonly id: string;
  public readonly clientId: string;
  public readonly sourceModule: string;
  public readonly eventType: string;
  public readonly summary: string;
  public readonly metadata: Record<string, unknown>;
  public readonly occurredAt: Date;

  constructor(props: ClientTimelineEntryProps) {
    this.id = props.id ?? randomUUID();
    this.clientId = props.clientId;
    this.sourceModule = props.sourceModule;
    this.eventType = props.eventType;
    this.summary = props.summary;
    this.metadata = props.metadata ?? {};
    this.occurredAt = props.occurredAt ?? new Date();
  }

  public static create(props: ClientTimelineEntryProps): ClientTimelineEntry {
    return new ClientTimelineEntry(props);
  }
}
