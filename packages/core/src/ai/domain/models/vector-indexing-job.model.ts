import { IndexGenerationId } from '../value-objects/index-generation-id.vo';
import { VectorIndexingErrorCode } from '../enums/vector-indexing-error-code.enum';
import { VectorIndexingJobException } from '../exceptions/vector-indexing.exceptions';

export enum VectorIndexingScope {
  DOCUMENT = 'DOCUMENT',
  DOCUMENT_VERSION = 'DOCUMENT_VERSION',
  INDEX_GENERATION = 'INDEX_GENERATION',
  REINDEX_ALL = 'REINDEX_ALL',
}

export enum VectorIndexingJobStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface CreateVectorIndexingJobProps {
  id?: string;
  tenantId: string;
  scope: VectorIndexingScope;
  scopeId: string;
  generationId: IndexGenerationId | string;
  profileId: string;
  batchSize?: number;
  totalChunks?: number;
  maxAttempts?: number;
}

export interface ReconstituteVectorIndexingJobProps {
  id: string;
  tenantId: string;
  scope: VectorIndexingScope;
  scopeId: string;
  generationId: string;
  profileId: string;
  status: VectorIndexingJobStatus;
  batchSize: number;
  totalChunks: number;
  processedChunks: number;
  failedChunks: number;
  currentBatchNumber: number;
  attemptCount: number;
  maxAttempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
}

/**
 * VectorIndexingJob Model.
 * Manages tracking, bounded batching, durable progress, and retries for vector indexing tasks
 * across document, version, and generation scopes.
 */
export class VectorIndexingJob {
  private readonly _id: string;
  private readonly _tenantId: string;
  private readonly _scope: VectorIndexingScope;
  private readonly _scopeId: string;
  private readonly _generationId: IndexGenerationId;
  private readonly _profileId: string;
  private _status: VectorIndexingJobStatus;
  private readonly _batchSize: number;
  private _totalChunks: number;
  private _processedChunks: number;
  private _failedChunks: number;
  private _currentBatchNumber: number;
  private _attemptCount: number;
  private readonly _maxAttempts: number;
  private _lastErrorCode: string | null;
  private _lastErrorMessage: string | null;
  private readonly _createdAt: Date;
  private _startedAt: Date | null;
  private _completedAt: Date | null;
  private _failedAt: Date | null;
  private _cancelledAt: Date | null;

  private constructor(props: {
    id: string;
    tenantId: string;
    scope: VectorIndexingScope;
    scopeId: string;
    generationId: IndexGenerationId;
    profileId: string;
    status: VectorIndexingJobStatus;
    batchSize: number;
    totalChunks: number;
    processedChunks: number;
    failedChunks: number;
    currentBatchNumber: number;
    attemptCount: number;
    maxAttempts: number;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    failedAt: Date | null;
    cancelledAt: Date | null;
  }) {
    this._id = props.id;
    this._tenantId = props.tenantId;
    this._scope = props.scope;
    this._scopeId = props.scopeId;
    this._generationId = props.generationId;
    this._profileId = props.profileId;
    this._status = props.status;
    this._batchSize = props.batchSize;
    this._totalChunks = props.totalChunks;
    this._processedChunks = props.processedChunks;
    this._failedChunks = props.failedChunks;
    this._currentBatchNumber = props.currentBatchNumber;
    this._attemptCount = props.attemptCount;
    this._maxAttempts = props.maxAttempts;
    this._lastErrorCode = props.lastErrorCode;
    this._lastErrorMessage = props.lastErrorMessage;
    this._createdAt = props.createdAt;
    this._startedAt = props.startedAt;
    this._completedAt = props.completedAt;
    this._failedAt = props.failedAt;
    this._cancelledAt = props.cancelledAt;
  }

  // --- Getters ---
  public get id(): string {
    return this._id;
  }

  public get tenantId(): string {
    return this._tenantId;
  }

  public get scope(): VectorIndexingScope {
    return this._scope;
  }

  public get scopeId(): string {
    return this._scopeId;
  }

  public get generationId(): IndexGenerationId {
    return this._generationId;
  }

  public get profileId(): string {
    return this._profileId;
  }

  public get status(): VectorIndexingJobStatus {
    return this._status;
  }

  public get batchSize(): number {
    return this._batchSize;
  }

  public get totalChunks(): number {
    return this._totalChunks;
  }

  public get processedChunks(): number {
    return this._processedChunks;
  }

  public get failedChunks(): number {
    return this._failedChunks;
  }

  public get currentBatchNumber(): number {
    return this._currentBatchNumber;
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
    return this._createdAt;
  }

  public get startedAt(): Date | null {
    return this._startedAt;
  }

  public get completedAt(): Date | null {
    return this._completedAt;
  }

  public get failedAt(): Date | null {
    return this._failedAt;
  }

  public get cancelledAt(): Date | null {
    return this._cancelledAt;
  }

  public get progressPercentage(): number {
    if (this._totalChunks <= 0) return 0;
    return Math.min(
      100,
      Math.round(((this._processedChunks + this._failedChunks) / this._totalChunks) * 100),
    );
  }

  // --- Factory Method ---
  public static create(props: CreateVectorIndexingJobProps): VectorIndexingJob {
    const id =
      props.id ||
      (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `vij_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
    const generationId =
      props.generationId instanceof IndexGenerationId
        ? props.generationId
        : IndexGenerationId.fromString(props.generationId);

    if (!props.tenantId || props.tenantId.trim() === '') {
      throw new VectorIndexingJobException(
        'tenantId cannot be empty',
        VectorIndexingErrorCode.EMPTY_PAYLOAD,
      );
    }
    if (!props.scopeId || props.scopeId.trim() === '') {
      throw new VectorIndexingJobException(
        'scopeId cannot be empty',
        VectorIndexingErrorCode.EMPTY_PAYLOAD,
      );
    }
    if (!props.profileId || props.profileId.trim() === '') {
      throw new VectorIndexingJobException(
        'profileId cannot be empty',
        VectorIndexingErrorCode.EMPTY_PAYLOAD,
      );
    }

    return new VectorIndexingJob({
      id,
      tenantId: props.tenantId.trim(),
      scope: props.scope,
      scopeId: props.scopeId.trim(),
      generationId,
      profileId: props.profileId.trim(),
      status: VectorIndexingJobStatus.PENDING,
      batchSize: props.batchSize ?? 16,
      totalChunks: props.totalChunks ?? 0,
      processedChunks: 0,
      failedChunks: 0,
      currentBatchNumber: 0,
      attemptCount: 0,
      maxAttempts: props.maxAttempts ?? 3,
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      failedAt: null,
      cancelledAt: null,
    });
  }

  // --- State Transitions & Progress ---

  public start(): void {
    if (this._status !== VectorIndexingJobStatus.PENDING) {
      throw new VectorIndexingJobException(
        `Cannot start indexing job in status ${this._status}`,
        VectorIndexingErrorCode.PERSISTENCE_ERROR,
      );
    }
    this._status = VectorIndexingJobStatus.RUNNING;
    this._startedAt = new Date();
    this._attemptCount += 1;
  }

  public recordBatchSuccess(batchCount: number): void {
    if (this._status !== VectorIndexingJobStatus.RUNNING) {
      throw new VectorIndexingJobException(
        `Cannot record batch success when job is in status ${this._status}`,
        VectorIndexingErrorCode.PERSISTENCE_ERROR,
      );
    }
    this._processedChunks += batchCount;
    this._currentBatchNumber += 1;

    if (this._totalChunks > 0 && this._processedChunks + this._failedChunks >= this._totalChunks) {
      this._status = VectorIndexingJobStatus.COMPLETED;
      this._completedAt = new Date();
    }
  }

  public recordBatchFailure(failedCount: number, errorCode: string, errorMessage: string): void {
    this._failedChunks += failedCount;
    this._lastErrorCode = errorCode;
    this._lastErrorMessage = errorMessage;
    this._currentBatchNumber += 1;

    if (this._attemptCount >= this._maxAttempts) {
      this._status = VectorIndexingJobStatus.FAILED;
      this._failedAt = new Date();
    }
  }

  public complete(): void {
    if (this._status !== VectorIndexingJobStatus.RUNNING) {
      throw new VectorIndexingJobException(
        `Cannot complete indexing job from status ${this._status}`,
        VectorIndexingErrorCode.PERSISTENCE_ERROR,
      );
    }
    this._status = VectorIndexingJobStatus.COMPLETED;
    this._completedAt = new Date();
  }

  public fail(errorCode: string, errorMessage: string): void {
    this._status = VectorIndexingJobStatus.FAILED;
    this._lastErrorCode = errorCode;
    this._lastErrorMessage = errorMessage;
    this._failedAt = new Date();
  }

  public cancel(reason: string): void {
    this._status = VectorIndexingJobStatus.CANCELLED;
    this._lastErrorMessage = reason;
    this._cancelledAt = new Date();
  }

  public setTotalChunks(total: number): void {
    this._totalChunks = Math.max(0, total);
  }

  public resetForRetry(): boolean {
    if (this._attemptCount >= this._maxAttempts) {
      this._status = VectorIndexingJobStatus.FAILED;
      this._failedAt = new Date();
      return false;
    }
    this._status = VectorIndexingJobStatus.PENDING;
    this._startedAt = null;
    return true;
  }

  // --- Reconstitution ---
  public static reconstitute(props: ReconstituteVectorIndexingJobProps): VectorIndexingJob {
    return new VectorIndexingJob({
      id: props.id,
      tenantId: props.tenantId,
      scope: props.scope,
      scopeId: props.scopeId,
      generationId: IndexGenerationId.fromString(props.generationId),
      profileId: props.profileId,
      status: props.status,
      batchSize: props.batchSize,
      totalChunks: props.totalChunks,
      processedChunks: props.processedChunks,
      failedChunks: props.failedChunks,
      currentBatchNumber: props.currentBatchNumber,
      attemptCount: props.attemptCount,
      maxAttempts: props.maxAttempts,
      lastErrorCode: props.lastErrorCode,
      lastErrorMessage: props.lastErrorMessage,
      createdAt: props.createdAt,
      startedAt: props.startedAt,
      completedAt: props.completedAt,
      failedAt: props.failedAt,
      cancelledAt: props.cancelledAt,
    });
  }
}
