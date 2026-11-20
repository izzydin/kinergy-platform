import { AggregateRoot } from '../shared/aggregate-root';
import { DomainEvent } from '../shared/domain-event';
import { IngestionStatus, isTerminalIngestionStatus } from '../enums/ingestion-status.enum';
import {
  DocumentValidationException,
  IngestionJobCancellationConflictException,
  InvalidIngestionRetryException,
  InvalidStateTransitionException,
  UnauthorizedDocumentAccessException,
} from '../exceptions/knowledge-document.exceptions';
import {
  IngestionJobCreatedEvent,
  IngestionJobValidationStartedEvent,
  IngestionJobProcessingStartedEvent,
  IngestionJobIndexingStartedEvent,
  IngestionJobCompletedEvent,
  IngestionJobFailedEvent,
  IngestionJobCancelledEvent,
  IngestionJobRetriedEvent,
} from '../events/ingestion-job-events';

export interface CreateIngestionJobProps {
  id?: string;
  documentId: string;
  documentVersionId: string;
  tenantId: string;
  maxAttempts?: number;
}

export interface ReconstituteIngestionJobProps {
  id: string;
  documentId: string;
  documentVersionId: string;
  tenantId: string;
  status: IngestionStatus;
  attemptCount: number;
  maxAttempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  version: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  nextRetryAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

/**
 * IngestionJob Aggregate Root.
 * Manages the asynchronous processing, chunking, and embedding pipeline lifecycle
 * for an immutable document version without coupling to document entity state.
 */
export class IngestionJob implements AggregateRoot<string> {
  private readonly _id: string;
  private readonly _documentId: string;
  private readonly _documentVersionId: string;
  private readonly _tenantId: string;
  private _status: IngestionStatus;
  private _attemptCount: number;
  private readonly _maxAttempts: number;
  private _lastErrorCode: string | null;
  private _lastErrorMessage: string | null;
  private _version: number;
  private readonly _createdAt: Date;
  private _startedAt: Date | null;
  private _completedAt: Date | null;
  private _nextRetryAt: Date | null;
  private _cancelledAt: Date | null;
  private _cancellationReason: string | null;
  private _uncommittedEvents: DomainEvent[] = [];

  private constructor(props: {
    id: string;
    documentId: string;
    documentVersionId: string;
    tenantId: string;
    status: IngestionStatus;
    attemptCount: number;
    maxAttempts: number;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
    version: number;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    nextRetryAt: Date | null;
    cancelledAt: Date | null;
    cancellationReason: string | null;
  }) {
    this._id = props.id;
    this._documentId = props.documentId;
    this._documentVersionId = props.documentVersionId;
    this._tenantId = props.tenantId;
    this._status = props.status;
    this._attemptCount = props.attemptCount;
    this._maxAttempts = props.maxAttempts;
    this._lastErrorCode = props.lastErrorCode;
    this._lastErrorMessage = props.lastErrorMessage;
    this._version = props.version;
    this._createdAt = new Date(props.createdAt.getTime());
    this._startedAt = props.startedAt ? new Date(props.startedAt.getTime()) : null;
    this._completedAt = props.completedAt ? new Date(props.completedAt.getTime()) : null;
    this._nextRetryAt = props.nextRetryAt ? new Date(props.nextRetryAt.getTime()) : null;
    this._cancelledAt = props.cancelledAt ? new Date(props.cancelledAt.getTime()) : null;
    this._cancellationReason = props.cancellationReason;
  }

  // --- Factory Methods ---

  public static create(props: CreateIngestionJobProps): IngestionJob {
    if (!props.documentId || props.documentId.trim() === '') {
      throw new DocumentValidationException('documentId is required for IngestionJob.');
    }
    if (!props.documentVersionId || props.documentVersionId.trim() === '') {
      throw new DocumentValidationException('documentVersionId is required for IngestionJob.');
    }
    if (!props.tenantId || props.tenantId.trim() === '') {
      throw new DocumentValidationException('tenantId is required for IngestionJob.');
    }

    const maxAttempts = props.maxAttempts ?? 3;
    if (maxAttempts < 1) {
      throw new DocumentValidationException('maxAttempts must be at least 1.');
    }

    const id =
      props.id && props.id.trim() !== ''
        ? props.id.trim()
        : typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID
          ? globalThis.crypto.randomUUID()
          : `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const now = new Date();

    const job = new IngestionJob({
      id,
      documentId: props.documentId.trim(),
      documentVersionId: props.documentVersionId.trim(),
      tenantId: props.tenantId.trim(),
      status: IngestionStatus.UPLOADED,
      attemptCount: 1,
      maxAttempts,
      lastErrorCode: null,
      lastErrorMessage: null,
      version: 1,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      nextRetryAt: null,
      cancelledAt: null,
      cancellationReason: null,
    });

    job.recordEvent(
      new IngestionJobCreatedEvent(job.id, job.version, {
        jobId: job.id,
        documentId: job.documentId,
        documentVersionId: job.documentVersionId,
        tenantId: job.tenantId,
        status: job.status,
      }),
    );

    return job;
  }

  public static reconstitute(props: ReconstituteIngestionJobProps): IngestionJob {
    return new IngestionJob({
      id: props.id,
      documentId: props.documentId,
      documentVersionId: props.documentVersionId,
      tenantId: props.tenantId,
      status: props.status,
      attemptCount: props.attemptCount,
      maxAttempts: props.maxAttempts,
      lastErrorCode: props.lastErrorCode,
      lastErrorMessage: props.lastErrorMessage,
      version: props.version,
      createdAt: props.createdAt,
      startedAt: props.startedAt,
      completedAt: props.completedAt,
      nextRetryAt: props.nextRetryAt,
      cancelledAt: props.cancelledAt,
      cancellationReason: props.cancellationReason,
    });
  }

  // --- Aggregate Getters ---

  public get id(): string {
    return this._id;
  }

  public get version(): number {
    return this._version;
  }

  public get documentId(): string {
    return this._documentId;
  }

  public get documentVersionId(): string {
    return this._documentVersionId;
  }

  public get tenantId(): string {
    return this._tenantId;
  }

  public get status(): IngestionStatus {
    return this._status;
  }

  public get attemptCount(): number {
    return this._attemptCount;
  }

  public get maxAttempts(): number {
    return this._maxAttempts;
  }

  public get lastErrorCode(): string | null {
    return this._lastErrorCode;
  }

  public get lastErrorMessage(): string | null {
    return this._lastErrorMessage;
  }

  public get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  public get startedAt(): Date | null {
    return this._startedAt ? new Date(this._startedAt.getTime()) : null;
  }

  public get completedAt(): Date | null {
    return this._completedAt ? new Date(this._completedAt.getTime()) : null;
  }

  public get nextRetryAt(): Date | null {
    return this._nextRetryAt ? new Date(this._nextRetryAt.getTime()) : null;
  }

  public get cancelledAt(): Date | null {
    return this._cancelledAt ? new Date(this._cancelledAt.getTime()) : null;
  }

  public get cancellationReason(): string | null {
    return this._cancellationReason;
  }

  // --- Lifecycle State Transitions ---

  /**
   * Transition: UPLOADED -> VALIDATING
   */
  public startValidation(): void {
    if (this._status !== IngestionStatus.UPLOADED) {
      throw new InvalidStateTransitionException(
        this._status,
        IngestionStatus.VALIDATING,
        `Validation can only begin from UPLOADED state.`,
      );
    }

    this._status = IngestionStatus.VALIDATING;
    this._startedAt = this._startedAt ?? new Date();
    this._version += 1;

    this.recordEvent(
      new IngestionJobValidationStartedEvent(this._id, this._version, {
        jobId: this._id,
        documentVersionId: this._documentVersionId,
      }),
    );
  }

  /**
   * Transition: VALIDATING -> PROCESSING
   */
  public startProcessing(): void {
    if (this._status !== IngestionStatus.VALIDATING) {
      throw new InvalidStateTransitionException(
        this._status,
        IngestionStatus.PROCESSING,
        `Processing can only begin after successful VALIDATING state.`,
      );
    }

    this._status = IngestionStatus.PROCESSING;
    this._version += 1;

    this.recordEvent(
      new IngestionJobProcessingStartedEvent(this._id, this._version, {
        jobId: this._id,
        documentVersionId: this._documentVersionId,
      }),
    );
  }

  /**
   * Transition: PROCESSING -> INDEXING
   */
  public startIndexing(): void {
    if (this._status !== IngestionStatus.PROCESSING) {
      throw new InvalidStateTransitionException(
        this._status,
        IngestionStatus.INDEXING,
        `Indexing can only begin after text extraction and chunking (PROCESSING).`,
      );
    }

    this._status = IngestionStatus.INDEXING;
    this._version += 1;

    this.recordEvent(
      new IngestionJobIndexingStartedEvent(this._id, this._version, {
        jobId: this._id,
        documentVersionId: this._documentVersionId,
      }),
    );
  }

  /**
   * Transition: INDEXING -> READY
   * READY is only reached when all required processing and indexing steps have succeeded.
   */
  public markReady(): void {
    if (this._status !== IngestionStatus.INDEXING) {
      throw new InvalidStateTransitionException(
        this._status,
        IngestionStatus.READY,
        `Document can only reach READY from INDEXING after confirmed embedding completion.`,
      );
    }

    this._status = IngestionStatus.READY;
    this._completedAt = new Date();
    this._version += 1;

    this.recordEvent(
      new IngestionJobCompletedEvent(this._id, this._version, {
        jobId: this._id,
        documentVersionId: this._documentVersionId,
        completedAt: this._completedAt,
      }),
    );
  }

  /**
   * Transition: (VALIDATING | PROCESSING | INDEXING | UPLOADED) -> FAILED
   * Records failure reason and error code.
   */
  public fail(errorCode: string, errorMessage: string): void {
    if (this._status === IngestionStatus.READY) {
      throw new InvalidStateTransitionException(
        this._status,
        IngestionStatus.FAILED,
        `Cannot fail a job that is already READY.`,
      );
    }
    if (this._status === IngestionStatus.CANCELLED) {
      throw new InvalidStateTransitionException(
        this._status,
        IngestionStatus.FAILED,
        `Cannot fail a job that has been CANCELLED.`,
      );
    }
    if (!errorCode || errorCode.trim() === '') {
      throw new DocumentValidationException('Failure error code is required.');
    }
    if (!errorMessage || errorMessage.trim() === '') {
      throw new DocumentValidationException('Failure error message is required.');
    }

    this._status = IngestionStatus.FAILED;
    this._lastErrorCode = errorCode.trim();
    this._lastErrorMessage = errorMessage.trim();
    this._version += 1;

    this.recordEvent(
      new IngestionJobFailedEvent(this._id, this._version, {
        jobId: this._id,
        documentVersionId: this._documentVersionId,
        errorCode: this._lastErrorCode,
        errorMessage: this._lastErrorMessage,
        attemptCount: this._attemptCount,
      }),
    );
  }

  /**
   * Transition: (UPLOADED | VALIDATING | PROCESSING | INDEXING) -> CANCELLED
   * Explicitly cancels active execution. A cancelled job can never silently resume.
   */
  public cancel(reason?: string): void {
    if (this._status === IngestionStatus.READY) {
      throw new IngestionJobCancellationConflictException(
        `Cannot cancel an ingestion job that has already completed successfully (READY).`,
      );
    }
    if (this._status === IngestionStatus.CANCELLED) {
      throw new IngestionJobCancellationConflictException(
        `Ingestion job '${this._id}' is already cancelled.`,
      );
    }
    if (this._status === IngestionStatus.FAILED) {
      throw new InvalidStateTransitionException(
        this._status,
        IngestionStatus.CANCELLED,
        `Cannot cancel a failed ingestion job. Start a new job or retry instead.`,
      );
    }

    this._status = IngestionStatus.CANCELLED;
    this._cancelledAt = new Date();
    this._cancellationReason = reason?.trim() ?? null;
    this._version += 1;

    this.recordEvent(
      new IngestionJobCancelledEvent(this._id, this._version, {
        jobId: this._id,
        documentVersionId: this._documentVersionId,
        reason: this._cancellationReason,
        cancelledAt: this._cancelledAt,
      }),
    );
  }

  /**
   * Transition: FAILED -> VALIDATING
   * Explicit, controlled retry of a failed ingestion attempt.
   */
  public retry(retryAt?: Date): void {
    if (this._status === IngestionStatus.CANCELLED) {
      throw new InvalidIngestionRetryException(
        `A cancelled ingestion job cannot be retried. Re-upload or create a new job.`,
      );
    }
    if (this._status === IngestionStatus.READY) {
      throw new InvalidIngestionRetryException(
        `A completed ingestion job (READY) cannot be retried.`,
      );
    }
    if (this._status !== IngestionStatus.FAILED) {
      throw new InvalidIngestionRetryException(
        `Only FAILED ingestion jobs can be retried. Current status: '${this._status}'.`,
      );
    }
    if (this._attemptCount >= this._maxAttempts) {
      throw new InvalidIngestionRetryException(
        `Maximum retry attempts (${this._maxAttempts}) reached for ingestion job '${this._id}'.`,
      );
    }

    this._attemptCount += 1;
    this._status = IngestionStatus.VALIDATING;
    this._nextRetryAt = retryAt ? new Date(retryAt.getTime()) : null;
    this._lastErrorCode = null;
    this._lastErrorMessage = null;
    this._version += 1;

    this.recordEvent(
      new IngestionJobRetriedEvent(this._id, this._version, {
        jobId: this._id,
        documentVersionId: this._documentVersionId,
        newAttemptCount: this._attemptCount,
        nextRetryAt: this._nextRetryAt,
      }),
    );
  }

  // --- Operational Inquiries ---

  public isTerminal(): boolean {
    return isTerminalIngestionStatus(this._status);
  }

  public canRetry(): boolean {
    return this._status === IngestionStatus.FAILED && this._attemptCount < this._maxAttempts;
  }

  public assertTenantOwnership(tenantId: string): void {
    if (!tenantId || this._tenantId !== tenantId.trim()) {
      throw new UnauthorizedDocumentAccessException(
        `Cross-tenant job access forbidden. Expected tenant '${this._tenantId}', got '${tenantId}'.`,
      );
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
