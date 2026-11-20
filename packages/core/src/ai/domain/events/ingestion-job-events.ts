import { DomainEvent } from '../shared/domain-event';
import { IngestionStatus } from '../enums/ingestion-status.enum';

function createEventId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export class IngestionJobCreatedEvent implements DomainEvent<{
  jobId: string;
  documentId: string;
  documentVersionId: string;
  tenantId: string;
  status: IngestionStatus;
}> {
  public readonly eventId = createEventId();
  public readonly eventType = 'ai.ingestion_job.created';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt = new Date();
  public readonly payload: {
    jobId: string;
    documentId: string;
    documentVersionId: string;
    tenantId: string;
    status: IngestionStatus;
  };

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: {
      jobId: string;
      documentId: string;
      documentVersionId: string;
      tenantId: string;
      status: IngestionStatus;
    },
  ) {
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.payload = payload;
  }
}

export class IngestionJobValidationStartedEvent implements DomainEvent<{
  jobId: string;
  documentVersionId: string;
}> {
  public readonly eventId = createEventId();
  public readonly eventType = 'ai.ingestion_job.validation_started';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt = new Date();
  public readonly payload: { jobId: string; documentVersionId: string };

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: { jobId: string; documentVersionId: string },
  ) {
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.payload = payload;
  }
}

export class IngestionJobProcessingStartedEvent implements DomainEvent<{
  jobId: string;
  documentVersionId: string;
}> {
  public readonly eventId = createEventId();
  public readonly eventType = 'ai.ingestion_job.processing_started';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt = new Date();
  public readonly payload: { jobId: string; documentVersionId: string };

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: { jobId: string; documentVersionId: string },
  ) {
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.payload = payload;
  }
}

export class IngestionJobIndexingStartedEvent implements DomainEvent<{
  jobId: string;
  documentVersionId: string;
}> {
  public readonly eventId = createEventId();
  public readonly eventType = 'ai.ingestion_job.indexing_started';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt = new Date();
  public readonly payload: { jobId: string; documentVersionId: string };

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: { jobId: string; documentVersionId: string },
  ) {
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.payload = payload;
  }
}

export class IngestionJobCompletedEvent implements DomainEvent<{
  jobId: string;
  documentVersionId: string;
  completedAt: Date;
}> {
  public readonly eventId = createEventId();
  public readonly eventType = 'ai.ingestion_job.completed';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt = new Date();
  public readonly payload: { jobId: string; documentVersionId: string; completedAt: Date };

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: { jobId: string; documentVersionId: string; completedAt: Date },
  ) {
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.payload = payload;
  }
}

export class IngestionJobFailedEvent implements DomainEvent<{
  jobId: string;
  documentVersionId: string;
  errorCode: string;
  errorMessage: string;
  attemptCount: number;
}> {
  public readonly eventId = createEventId();
  public readonly eventType = 'ai.ingestion_job.failed';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt = new Date();
  public readonly payload: {
    jobId: string;
    documentVersionId: string;
    errorCode: string;
    errorMessage: string;
    attemptCount: number;
  };

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: {
      jobId: string;
      documentVersionId: string;
      errorCode: string;
      errorMessage: string;
      attemptCount: number;
    },
  ) {
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.payload = payload;
  }
}

export class IngestionJobCancelledEvent implements DomainEvent<{
  jobId: string;
  documentVersionId: string;
  reason: string | null;
  cancelledAt: Date;
}> {
  public readonly eventId = createEventId();
  public readonly eventType = 'ai.ingestion_job.cancelled';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt = new Date();
  public readonly payload: {
    jobId: string;
    documentVersionId: string;
    reason: string | null;
    cancelledAt: Date;
  };

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: {
      jobId: string;
      documentVersionId: string;
      reason: string | null;
      cancelledAt: Date;
    },
  ) {
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.payload = payload;
  }
}

export class IngestionJobRetriedEvent implements DomainEvent<{
  jobId: string;
  documentVersionId: string;
  newAttemptCount: number;
  nextRetryAt: Date | null;
}> {
  public readonly eventId = createEventId();
  public readonly eventType = 'ai.ingestion_job.retried';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt = new Date();
  public readonly payload: {
    jobId: string;
    documentVersionId: string;
    newAttemptCount: number;
    nextRetryAt: Date | null;
  };

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: {
      jobId: string;
      documentVersionId: string;
      newAttemptCount: number;
      nextRetryAt: Date | null;
    },
  ) {
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.payload = payload;
  }
}
