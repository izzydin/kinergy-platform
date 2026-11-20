import { AggregateRoot } from '../shared/aggregate-root';
import { DomainEvent } from '../shared/domain-event';
import { DocumentId } from '../value-objects/document-id.vo';
import { DocumentChecksum } from '../value-objects/document-checksum.vo';
import { VisibilityScope } from '../enums/visibility-scope.enum';
import { DocumentVersion, CreateDocumentVersionProps } from './document-version.entity';
import {
  DocumentAlreadyDeletedException,
  DocumentValidationException,
  DuplicateDocumentVersionException,
  UnauthorizedDocumentAccessException,
} from '../exceptions/knowledge-document.exceptions';
import {
  KnowledgeDocumentCreatedEvent,
  DocumentVersionAddedEvent,
  KnowledgeDocumentUpdatedEvent,
  KnowledgeDocumentDeletedEvent,
  KnowledgeDocumentRestoredEvent,
} from '../events/document-events';

export interface CreateKnowledgeDocumentProps {
  id?: DocumentId | string;
  title: string;
  description?: string | null;
  tenantId: string;
  uploadedBy: string;
  visibilityScope?: VisibilityScope;
  initialVersion?: Omit<
    CreateDocumentVersionProps,
    'documentId' | 'versionNumber' | 'uploadedBy'
  > & {
    uploadedBy?: string;
  };
}

export interface ReconstituteKnowledgeDocumentProps {
  id: DocumentId | string;
  title: string;
  description?: string | null;
  tenantId: string;
  uploadedBy: string;
  visibilityScope: VisibilityScope;
  currentVersionId: string | null;
  version: number;
  versions: DocumentVersion[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export interface AddDocumentVersionProps {
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  checksum: DocumentChecksum | string;
  storageKey: string;
  language?: string;
  uploadedBy?: string;
  id?: string;
}

/**
 * KnowledgeDocument Aggregate Root.
 * Represents the logical container, metadata, ownership, and version lineage of an enterprise document.
 */
export class KnowledgeDocument implements AggregateRoot<DocumentId> {
  private readonly _id: DocumentId;
  private _title: string;
  private _description: string | null;
  private readonly _tenantId: string;
  private readonly _uploadedBy: string;
  private _visibilityScope: VisibilityScope;
  private _currentVersionId: string | null;
  private _version: number;
  private readonly _versions: DocumentVersion[] = [];
  private readonly _createdAt: Date;
  private _updatedAt: Date;
  private _deletedAt: Date | null;
  private _uncommittedEvents: DomainEvent[] = [];

  private constructor(props: {
    id: DocumentId;
    title: string;
    description: string | null;
    tenantId: string;
    uploadedBy: string;
    visibilityScope: VisibilityScope;
    currentVersionId: string | null;
    version: number;
    versions: DocumentVersion[];
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }) {
    this._id = props.id;
    this._title = props.title;
    this._description = props.description;
    this._tenantId = props.tenantId;
    this._uploadedBy = props.uploadedBy;
    this._visibilityScope = props.visibilityScope;
    this._currentVersionId = props.currentVersionId;
    this._version = props.version;
    this._versions = [...props.versions];
    this._createdAt = new Date(props.createdAt.getTime());
    this._updatedAt = new Date(props.updatedAt.getTime());
    this._deletedAt = props.deletedAt ? new Date(props.deletedAt.getTime()) : null;
  }

  // --- Factory Methods ---

  public static create(props: CreateKnowledgeDocumentProps): KnowledgeDocument {
    if (!props.title || props.title.trim() === '') {
      throw new DocumentValidationException('Document title cannot be empty.');
    }
    if (!props.tenantId || props.tenantId.trim() === '') {
      throw new DocumentValidationException('Tenant identity is required for KnowledgeDocument.');
    }
    if (!props.uploadedBy || props.uploadedBy.trim() === '') {
      throw new DocumentValidationException('Uploader identity is required for KnowledgeDocument.');
    }

    const docId = props.id instanceof DocumentId ? props.id : DocumentId.create(props.id);

    const now = new Date();
    const visibilityScope = props.visibilityScope ?? VisibilityScope.ALL_STAFF;

    const doc = new KnowledgeDocument({
      id: docId,
      title: props.title.trim(),
      description: props.description?.trim() ?? null,
      tenantId: props.tenantId.trim(),
      uploadedBy: props.uploadedBy.trim(),
      visibilityScope,
      currentVersionId: null,
      version: 1,
      versions: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    doc.recordEvent(
      new KnowledgeDocumentCreatedEvent(doc.id.value, doc.version, {
        documentId: doc.id.value,
        tenantId: doc.tenantId,
        title: doc.title,
        uploadedBy: doc.uploadedBy,
        visibilityScope: doc.visibilityScope,
      }),
    );

    if (props.initialVersion) {
      doc.addVersion({
        ...props.initialVersion,
        uploadedBy: props.initialVersion.uploadedBy ?? props.uploadedBy,
      });
    }

    return doc;
  }

  public static reconstitute(props: ReconstituteKnowledgeDocumentProps): KnowledgeDocument {
    const docId = props.id instanceof DocumentId ? props.id : DocumentId.create(props.id);

    return new KnowledgeDocument({
      id: docId,
      title: props.title,
      description: props.description ?? null,
      tenantId: props.tenantId,
      uploadedBy: props.uploadedBy,
      visibilityScope: props.visibilityScope,
      currentVersionId: props.currentVersionId,
      version: props.version,
      versions: props.versions,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
      deletedAt: props.deletedAt ?? null,
    });
  }

  // --- Aggregate Root Getters ---

  public get id(): DocumentId {
    return this._id;
  }

  public get version(): number {
    return this._version;
  }

  public get title(): string {
    return this._title;
  }

  public get description(): string | null {
    return this._description;
  }

  public get tenantId(): string {
    return this._tenantId;
  }

  public get uploadedBy(): string {
    return this._uploadedBy;
  }

  public get visibilityScope(): VisibilityScope {
    return this._visibilityScope;
  }

  public get currentVersionId(): string | null {
    return this._currentVersionId;
  }

  public get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  public get updatedAt(): Date {
    return new Date(this._updatedAt.getTime());
  }

  public get deletedAt(): Date | null {
    return this._deletedAt ? new Date(this._deletedAt.getTime()) : null;
  }

  public isDeleted(): boolean {
    return this._deletedAt !== null;
  }

  // --- Domain Behaviors ---

  /**
   * Adds an immutable document version to this aggregate.
   * Guarantees sequential version numbering and duplicate checksum detection.
   */
  public addVersion(props: AddDocumentVersionProps): DocumentVersion {
    this.assertNotDeleted();

    const checksumVal =
      props.checksum instanceof DocumentChecksum
        ? props.checksum.value
        : DocumentChecksum.create(props.checksum).value;

    // Invariant: Check duplicate checksum within existing versions
    const existing = this._versions.find((v) => v.checksum === checksumVal);
    if (existing) {
      throw new DuplicateDocumentVersionException(checksumVal, existing.versionNumber);
    }

    const nextVersionNumber = this._versions.length + 1;

    const newVersion = DocumentVersion.create({
      id: props.id,
      documentId: this._id.value,
      versionNumber: nextVersionNumber,
      originalFileName: props.originalFileName,
      mimeType: props.mimeType,
      fileSize: props.fileSize,
      checksum: checksumVal,
      storageKey: props.storageKey,
      language: props.language,
      uploadedBy: props.uploadedBy ?? this._uploadedBy,
    });

    this._versions.push(newVersion);
    this._currentVersionId = newVersion.id;
    this._version += 1;
    this._updatedAt = new Date();

    this.recordEvent(
      new DocumentVersionAddedEvent(this._id.value, this._version, {
        documentId: this._id.value,
        versionId: newVersion.id,
        versionNumber: newVersion.versionNumber,
        checksum: newVersion.checksum,
        storageKey: newVersion.storageKey,
        fileSize: newVersion.fileSize,
        mimeType: newVersion.mimeType,
        uploadedBy: newVersion.uploadedBy,
      }),
    );

    return newVersion;
  }

  /**
   * Updates human-readable document metadata.
   */
  public updateMetadata(title: string, description?: string | null): void {
    this.assertNotDeleted();
    if (!title || title.trim() === '') {
      throw new DocumentValidationException('Updated document title cannot be empty.');
    }

    this._title = title.trim();
    this._description =
      description !== undefined ? (description?.trim() ?? null) : this._description;
    this._version += 1;
    this._updatedAt = new Date();

    this.recordEvent(
      new KnowledgeDocumentUpdatedEvent(this._id.value, this._version, {
        documentId: this._id.value,
        title: this._title,
        description: this._description,
      }),
    );
  }

  /**
   * Modifies the document's visibility access scope.
   */
  public changeVisibilityScope(newScope: VisibilityScope): void {
    this.assertNotDeleted();
    this._visibilityScope = newScope;
    this._version += 1;
    this._updatedAt = new Date();
  }

  /**
   * Soft-deletes the document aggregate, preserving immutable version history.
   */
  public softDelete(deletedBy: string): void {
    if (this.isDeleted()) {
      throw new DocumentAlreadyDeletedException(this._id.value);
    }
    if (!deletedBy || deletedBy.trim() === '') {
      throw new DocumentValidationException(
        'Deleter identity is required to soft-delete a document.',
      );
    }

    this._deletedAt = new Date();
    this._version += 1;
    this._updatedAt = new Date();

    this.recordEvent(
      new KnowledgeDocumentDeletedEvent(this._id.value, this._version, {
        documentId: this._id.value,
        deletedBy: deletedBy.trim(),
        deletedAt: this._deletedAt,
      }),
    );
  }

  /**
   * Restores a previously soft-deleted document.
   */
  public restore(): void {
    if (!this.isDeleted()) {
      throw new DocumentValidationException(`Document '${this._id.value}' is not deleted.`);
    }

    this._deletedAt = null;
    this._version += 1;
    this._updatedAt = new Date();

    this.recordEvent(
      new KnowledgeDocumentRestoredEvent(this._id.value, this._version, {
        documentId: this._id.value,
      }),
    );
  }

  // --- Version Queries ---

  public getVersion(versionNumber: number): DocumentVersion | undefined {
    return this._versions.find((v) => v.versionNumber === versionNumber);
  }

  public getVersionById(versionId: string): DocumentVersion | undefined {
    return this._versions.find((v) => v.id === versionId);
  }

  public getCurrentVersion(): DocumentVersion | undefined {
    if (!this._currentVersionId) {
      return this._versions.length > 0 ? this._versions[this._versions.length - 1] : undefined;
    }
    return this._versions.find((v) => v.id === this._currentVersionId);
  }

  public getAllVersions(): ReadonlyArray<DocumentVersion> {
    return Object.freeze([...this._versions]);
  }

  // --- Ownership & Boundary Enforcement ---

  public assertTenantOwnership(tenantId: string): void {
    if (!tenantId || this._tenantId !== tenantId.trim()) {
      throw new UnauthorizedDocumentAccessException(
        `Cross-tenant access forbidden. Expected tenant '${this._tenantId}', got '${tenantId}'.`,
      );
    }
  }

  private assertNotDeleted(): void {
    if (this.isDeleted()) {
      throw new DocumentAlreadyDeletedException(this._id.value);
    }
  }

  // --- Event Handling ---

  private recordEvent(event: DomainEvent): void {
    this._uncommittedEvents.push(event);
  }

  public getUncommittedEvents(): ReadonlyArray<DomainEvent> {
    return Object.freeze([...this._uncommittedEvents]);
  }

  public clearEvents(): void {
    this._uncommittedEvents = [];
  }
}
