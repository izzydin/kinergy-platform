import { DomainEvent } from '../shared/domain-event';
import { VisibilityScope } from '../enums/visibility-scope.enum';

function createEventId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export class KnowledgeDocumentCreatedEvent implements DomainEvent<{
  documentId: string;
  tenantId: string;
  title: string;
  uploadedBy: string;
  visibilityScope: VisibilityScope;
}> {
  public readonly eventId = createEventId();
  public readonly eventType = 'ai.knowledge_document.created';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt = new Date();
  public readonly payload: {
    documentId: string;
    tenantId: string;
    title: string;
    uploadedBy: string;
    visibilityScope: VisibilityScope;
  };

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: {
      documentId: string;
      tenantId: string;
      title: string;
      uploadedBy: string;
      visibilityScope: VisibilityScope;
    },
  ) {
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.payload = payload;
  }
}

export class DocumentVersionAddedEvent implements DomainEvent<{
  documentId: string;
  versionId: string;
  versionNumber: number;
  checksum: string;
  storageKey: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
}> {
  public readonly eventId = createEventId();
  public readonly eventType = 'ai.knowledge_document.version_added';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt = new Date();
  public readonly payload: {
    documentId: string;
    versionId: string;
    versionNumber: number;
    checksum: string;
    storageKey: string;
    fileSize: number;
    mimeType: string;
    uploadedBy: string;
  };

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: {
      documentId: string;
      versionId: string;
      versionNumber: number;
      checksum: string;
      storageKey: string;
      fileSize: number;
      mimeType: string;
      uploadedBy: string;
    },
  ) {
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.payload = payload;
  }
}

export class KnowledgeDocumentUpdatedEvent implements DomainEvent<{
  documentId: string;
  title: string;
  description: string | null;
}> {
  public readonly eventId = createEventId();
  public readonly eventType = 'ai.knowledge_document.updated';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt = new Date();
  public readonly payload: {
    documentId: string;
    title: string;
    description: string | null;
  };

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: {
      documentId: string;
      title: string;
      description: string | null;
    },
  ) {
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.payload = payload;
  }
}

export class KnowledgeDocumentDeletedEvent implements DomainEvent<{
  documentId: string;
  deletedBy: string;
  deletedAt: Date;
}> {
  public readonly eventId = createEventId();
  public readonly eventType = 'ai.knowledge_document.deleted';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt = new Date();
  public readonly payload: {
    documentId: string;
    deletedBy: string;
    deletedAt: Date;
  };

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: {
      documentId: string;
      deletedBy: string;
      deletedAt: Date;
    },
  ) {
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.payload = payload;
  }
}

export class KnowledgeDocumentRestoredEvent implements DomainEvent<{
  documentId: string;
}> {
  public readonly eventId = createEventId();
  public readonly eventType = 'ai.knowledge_document.restored';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt = new Date();
  public readonly payload: {
    documentId: string;
  };

  constructor(aggregateId: string, aggregateVersion: number, payload: { documentId: string }) {
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.payload = payload;
  }
}
