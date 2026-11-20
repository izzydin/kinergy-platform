import { DomainEvent } from '../shared/domain-event';

function createEventId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export class IndexGenerationCreatedEvent implements DomainEvent<{
  generationId: string;
  tenantId: string;
  generationNumber: number;
  profileId: string;
  targetChunkCount: number;
}> {
  public readonly eventId = createEventId();
  public readonly eventType = 'ai.index_generation.created';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt = new Date();
  public readonly payload: {
    generationId: string;
    tenantId: string;
    generationNumber: number;
    profileId: string;
    targetChunkCount: number;
  };

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: {
      generationId: string;
      tenantId: string;
      generationNumber: number;
      profileId: string;
      targetChunkCount: number;
    },
  ) {
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.payload = payload;
  }
}

export class IndexGenerationBuildingStartedEvent implements DomainEvent<{
  generationId: string;
  tenantId: string;
  startedAt: Date;
}> {
  public readonly eventId = createEventId();
  public readonly eventType = 'ai.index_generation.building_started';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt = new Date();
  public readonly payload: {
    generationId: string;
    tenantId: string;
    startedAt: Date;
  };

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: {
      generationId: string;
      tenantId: string;
      startedAt: Date;
    },
  ) {
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.payload = payload;
  }
}

export class IndexGenerationValidatingStartedEvent implements DomainEvent<{
  generationId: string;
  tenantId: string;
  indexedChunkCount: number;
}> {
  public readonly eventId = createEventId();
  public readonly eventType = 'ai.index_generation.validating_started';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt = new Date();
  public readonly payload: {
    generationId: string;
    tenantId: string;
    indexedChunkCount: number;
  };

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: {
      generationId: string;
      tenantId: string;
      indexedChunkCount: number;
    },
  ) {
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.payload = payload;
  }
}

export class IndexGenerationActivatedEvent implements DomainEvent<{
  generationId: string;
  tenantId: string;
  profileId: string;
  generationNumber: number;
  indexedChunkCount: number;
  activatedAt: Date;
  previousGenerationId?: string;
}> {
  public readonly eventId = createEventId();
  public readonly eventType = 'ai.index_generation.activated';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt = new Date();
  public readonly payload: {
    generationId: string;
    tenantId: string;
    profileId: string;
    generationNumber: number;
    indexedChunkCount: number;
    activatedAt: Date;
    previousGenerationId?: string;
  };

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: {
      generationId: string;
      tenantId: string;
      profileId: string;
      generationNumber: number;
      indexedChunkCount: number;
      activatedAt: Date;
      previousGenerationId?: string;
    },
  ) {
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.payload = payload;
  }
}

export class IndexGenerationRetiredEvent implements DomainEvent<{
  generationId: string;
  tenantId: string;
  retiredAt: Date;
  supersededById: string;
}> {
  public readonly eventId = createEventId();
  public readonly eventType = 'ai.index_generation.retired';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt = new Date();
  public readonly payload: {
    generationId: string;
    tenantId: string;
    retiredAt: Date;
    supersededById: string;
  };

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: {
      generationId: string;
      tenantId: string;
      retiredAt: Date;
      supersededById: string;
    },
  ) {
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.payload = payload;
  }
}

export class IndexGenerationFailedEvent implements DomainEvent<{
  generationId: string;
  tenantId: string;
  errorCode: string;
  reason: string;
  failedAt: Date;
}> {
  public readonly eventId = createEventId();
  public readonly eventType = 'ai.index_generation.failed';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt = new Date();
  public readonly payload: {
    generationId: string;
    tenantId: string;
    errorCode: string;
    reason: string;
    failedAt: Date;
  };

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: {
      generationId: string;
      tenantId: string;
      errorCode: string;
      reason: string;
      failedAt: Date;
    },
  ) {
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.payload = payload;
  }
}

export class IndexGenerationCancelledEvent implements DomainEvent<{
  generationId: string;
  tenantId: string;
  reason: string;
  cancelledAt: Date;
}> {
  public readonly eventId = createEventId();
  public readonly eventType = 'ai.index_generation.cancelled';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt = new Date();
  public readonly payload: {
    generationId: string;
    tenantId: string;
    reason: string;
    cancelledAt: Date;
  };

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: {
      generationId: string;
      tenantId: string;
      reason: string;
      cancelledAt: Date;
    },
  ) {
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.payload = payload;
  }
}

export class ChunkEmbeddingIndexedEvent implements DomainEvent<{
  embeddingId: string;
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  generationId: string;
  profileId: string;
}> {
  public readonly eventId = createEventId();
  public readonly eventType = 'ai.chunk_embedding.indexed';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt = new Date();
  public readonly payload: {
    embeddingId: string;
    chunkId: string;
    documentId: string;
    documentVersionId: string;
    generationId: string;
    profileId: string;
  };

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: {
      embeddingId: string;
      chunkId: string;
      documentId: string;
      documentVersionId: string;
      generationId: string;
      profileId: string;
    },
  ) {
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.payload = payload;
  }
}
