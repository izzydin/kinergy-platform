import { AggregateRoot } from '../shared/aggregate-root';
import { DomainEvent } from '../shared/domain-event';
import { IndexGenerationId } from '../value-objects/index-generation-id.vo';
import { EmbeddingProfile } from '../value-objects/embedding-profile.vo';
import {
  IndexGenerationStatus,
  isValidIndexGenerationTransition,
  isTerminalIndexGenerationStatus,
} from '../enums/index-generation-status.enum';
import { InvalidIndexGenerationTransitionException } from '../exceptions/vector-indexing.exceptions';
import {
  IndexGenerationCreatedEvent,
  IndexGenerationBuildingStartedEvent,
  IndexGenerationValidatingStartedEvent,
  IndexGenerationActivatedEvent,
  IndexGenerationRetiredEvent,
  IndexGenerationFailedEvent,
  IndexGenerationCancelledEvent,
} from '../events/index-generation-events';

export interface CreateIndexGenerationProps {
  id?: IndexGenerationId | string;
  tenantId: string;
  generationNumber: number;
  profile: EmbeddingProfile;
  targetChunkCount?: number;
}

export interface ReconstituteIndexGenerationProps {
  id: string;
  tenantId: string;
  generationNumber: number;
  profile: EmbeddingProfile;
  status: IndexGenerationStatus;
  targetChunkCount: number;
  indexedChunkCount: number;
  failedChunkCount: number;
  version: number;
  createdAt: Date;
  startedAt: Date | null;
  validatedAt: Date | null;
  activatedAt: Date | null;
  retiredAt: Date | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
  errorCode: string | null;
  failureReason: string | null;
  cancellationReason: string | null;
}

/**
 * IndexGeneration Aggregate Root.
 * Manages the lifecycle of a versioned vector search index for a tenant.
 * Enforces single active generation invariant, immutable profile binding,
 * and zero-downtime atomic promotion and retirement.
 */
export class IndexGeneration implements AggregateRoot<IndexGenerationId> {
  private readonly _id: IndexGenerationId;
  private readonly _tenantId: string;
  private readonly _generationNumber: number;
  private readonly _profile: EmbeddingProfile;
  private _status: IndexGenerationStatus;
  private _targetChunkCount: number;
  private _indexedChunkCount: number;
  private _failedChunkCount: number;
  private _version: number;
  private readonly _createdAt: Date;
  private _startedAt: Date | null;
  private _validatedAt: Date | null;
  private _activatedAt: Date | null;
  private _retiredAt: Date | null;
  private _failedAt: Date | null;
  private _cancelledAt: Date | null;
  private _errorCode: string | null;
  private _failureReason: string | null;
  private _cancellationReason: string | null;

  private readonly _uncommittedEvents: DomainEvent[] = [];

  private constructor(props: {
    id: IndexGenerationId;
    tenantId: string;
    generationNumber: number;
    profile: EmbeddingProfile;
    status: IndexGenerationStatus;
    targetChunkCount: number;
    indexedChunkCount: number;
    failedChunkCount: number;
    version: number;
    createdAt: Date;
    startedAt: Date | null;
    validatedAt: Date | null;
    activatedAt: Date | null;
    retiredAt: Date | null;
    failedAt: Date | null;
    cancelledAt: Date | null;
    errorCode: string | null;
    failureReason: string | null;
    cancellationReason: string | null;
  }) {
    this._id = props.id;
    this._tenantId = props.tenantId;
    this._generationNumber = props.generationNumber;
    this._profile = props.profile;
    this._status = props.status;
    this._targetChunkCount = props.targetChunkCount;
    this._indexedChunkCount = props.indexedChunkCount;
    this._failedChunkCount = props.failedChunkCount;
    this._version = props.version;
    this._createdAt = props.createdAt;
    this._startedAt = props.startedAt;
    this._validatedAt = props.validatedAt;
    this._activatedAt = props.activatedAt;
    this._retiredAt = props.retiredAt;
    this._failedAt = props.failedAt;
    this._cancelledAt = props.cancelledAt;
    this._errorCode = props.errorCode;
    this._failureReason = props.failureReason;
    this._cancellationReason = props.cancellationReason;
  }

  // --- AggregateRoot Getters ---
  public get id(): IndexGenerationId {
    return this._id;
  }

  public get version(): number {
    return this._version;
  }

  public get tenantId(): string {
    return this._tenantId;
  }

  public get generationNumber(): number {
    return this._generationNumber;
  }

  public get profile(): EmbeddingProfile {
    return this._profile;
  }

  public get status(): IndexGenerationStatus {
    return this._status;
  }

  public get targetChunkCount(): number {
    return this._targetChunkCount;
  }

  public get indexedChunkCount(): number {
    return this._indexedChunkCount;
  }

  public get failedChunkCount(): number {
    return this._failedChunkCount;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }

  public get startedAt(): Date | null {
    return this._startedAt;
  }

  public get validatedAt(): Date | null {
    return this._validatedAt;
  }

  public get activatedAt(): Date | null {
    return this._activatedAt;
  }

  public get retiredAt(): Date | null {
    return this._retiredAt;
  }

  public get failedAt(): Date | null {
    return this._failedAt;
  }

  public get cancelledAt(): Date | null {
    return this._cancelledAt;
  }

  public get errorCode(): string | null {
    return this._errorCode;
  }

  public get failureReason(): string | null {
    return this._failureReason;
  }

  public get cancellationReason(): string | null {
    return this._cancellationReason;
  }

  public get isTerminal(): boolean {
    return isTerminalIndexGenerationStatus(this._status);
  }

  public get isActive(): boolean {
    return this._status === IndexGenerationStatus.ACTIVE;
  }

  // --- Factory Method ---
  public static create(props: CreateIndexGenerationProps): IndexGeneration {
    const id =
      props.id instanceof IndexGenerationId ? props.id : IndexGenerationId.create(props.id);

    if (!props.tenantId || props.tenantId.trim() === '') {
      throw new InvalidIndexGenerationTransitionException(
        IndexGenerationStatus.DRAFT,
        IndexGenerationStatus.DRAFT,
        'tenantId cannot be empty',
      );
    }

    if (props.generationNumber < 1) {
      throw new InvalidIndexGenerationTransitionException(
        IndexGenerationStatus.DRAFT,
        IndexGenerationStatus.DRAFT,
        'generationNumber must be a positive integer >= 1',
      );
    }

    const generation = new IndexGeneration({
      id,
      tenantId: props.tenantId.trim(),
      generationNumber: props.generationNumber,
      profile: props.profile,
      status: IndexGenerationStatus.DRAFT,
      targetChunkCount: props.targetChunkCount ?? 0,
      indexedChunkCount: 0,
      failedChunkCount: 0,
      version: 1,
      createdAt: new Date(),
      startedAt: null,
      validatedAt: null,
      activatedAt: null,
      retiredAt: null,
      failedAt: null,
      cancelledAt: null,
      errorCode: null,
      failureReason: null,
      cancellationReason: null,
    });

    generation.addEvent(
      new IndexGenerationCreatedEvent(id.value, generation.version, {
        generationId: id.value,
        tenantId: generation.tenantId,
        generationNumber: generation.generationNumber,
        profileId: generation.profile.profileId,
        targetChunkCount: generation.targetChunkCount,
      }),
    );

    return generation;
  }

  // --- Lifecycle Transitions ---

  public startBuilding(): void {
    this.assertValidTransition(IndexGenerationStatus.BUILDING);
    this._status = IndexGenerationStatus.BUILDING;
    this._startedAt = new Date();
    this.incrementVersion();

    this.addEvent(
      new IndexGenerationBuildingStartedEvent(this._id.value, this._version, {
        generationId: this._id.value,
        tenantId: this._tenantId,
        startedAt: this._startedAt,
      }),
    );
  }

  public recordProgress(indexedDelta: number, failedDelta = 0): void {
    if (this._status !== IndexGenerationStatus.BUILDING) {
      throw new InvalidIndexGenerationTransitionException(
        this._status,
        this._status,
        `Cannot record progress when index generation is in status ${this._status}`,
      );
    }
    if (indexedDelta > 0) {
      this._indexedChunkCount += indexedDelta;
    }
    if (failedDelta > 0) {
      this._failedChunkCount += failedDelta;
    }
    this.incrementVersion();
  }

  public setTargetChunkCount(count: number): void {
    if (
      this._status !== IndexGenerationStatus.DRAFT &&
      this._status !== IndexGenerationStatus.BUILDING
    ) {
      throw new InvalidIndexGenerationTransitionException(
        this._status,
        this._status,
        `Cannot adjust target chunk count when status is ${this._status}`,
      );
    }
    this._targetChunkCount = Math.max(0, count);
    this.incrementVersion();
  }

  public startValidation(): void {
    this.assertValidTransition(IndexGenerationStatus.VALIDATING);
    if (this._indexedChunkCount === 0) {
      throw new InvalidIndexGenerationTransitionException(
        this._status,
        IndexGenerationStatus.VALIDATING,
        'Cannot validate an index generation with 0 indexed chunks',
      );
    }

    this._status = IndexGenerationStatus.VALIDATING;
    this._validatedAt = new Date();
    this.incrementVersion();

    this.addEvent(
      new IndexGenerationValidatingStartedEvent(this._id.value, this._version, {
        generationId: this._id.value,
        tenantId: this._tenantId,
        indexedChunkCount: this._indexedChunkCount,
      }),
    );
  }

  /**
   * Promotes this generation to ACTIVE status.
   * Atomically supersedes any existing active generation for this tenant.
   */
  public activate(previousGenerationId?: string): void {
    this.assertValidTransition(IndexGenerationStatus.ACTIVE);
    if (this._indexedChunkCount === 0) {
      throw new InvalidIndexGenerationTransitionException(
        this._status,
        IndexGenerationStatus.ACTIVE,
        'Cannot activate an index generation with 0 indexed chunks',
      );
    }

    this._status = IndexGenerationStatus.ACTIVE;
    this._activatedAt = new Date();
    this.incrementVersion();

    this.addEvent(
      new IndexGenerationActivatedEvent(this._id.value, this._version, {
        generationId: this._id.value,
        tenantId: this._tenantId,
        profileId: this._profile.profileId,
        generationNumber: this._generationNumber,
        indexedChunkCount: this._indexedChunkCount,
        activatedAt: this._activatedAt,
        previousGenerationId,
      }),
    );
  }

  /**
   * Retires this generation when superseded by a newer active generation.
   */
  public retire(supersededById: string): void {
    this.assertValidTransition(IndexGenerationStatus.RETIRED);
    this._status = IndexGenerationStatus.RETIRED;
    this._retiredAt = new Date();
    this.incrementVersion();

    this.addEvent(
      new IndexGenerationRetiredEvent(this._id.value, this._version, {
        generationId: this._id.value,
        tenantId: this._tenantId,
        retiredAt: this._retiredAt,
        supersededById,
      }),
    );
  }

  /**
   * Rolls back a previously retired generation to ACTIVE status without regenerating embeddings.
   */
  public rollback(): void {
    this.assertValidTransition(IndexGenerationStatus.ACTIVE);
    if (this._status !== IndexGenerationStatus.RETIRED) {
      throw new InvalidIndexGenerationTransitionException(
        this._status,
        IndexGenerationStatus.ACTIVE,
        `Cannot rollback a generation that is not in RETIRED status (current: ${this._status})`,
      );
    }
    this._status = IndexGenerationStatus.ACTIVE;
    this._activatedAt = new Date();
    this.incrementVersion();
  }

  public fail(errorCode: string, reason: string): void {
    this.assertValidTransition(IndexGenerationStatus.FAILED);
    this._status = IndexGenerationStatus.FAILED;
    this._errorCode = errorCode;
    this._failureReason = reason;
    this._failedAt = new Date();
    this.incrementVersion();

    this.addEvent(
      new IndexGenerationFailedEvent(this._id.value, this._version, {
        generationId: this._id.value,
        tenantId: this._tenantId,
        errorCode,
        reason,
        failedAt: this._failedAt,
      }),
    );
  }

  public cancel(reason: string): void {
    this.assertValidTransition(IndexGenerationStatus.CANCELLED);
    this._status = IndexGenerationStatus.CANCELLED;
    this._cancellationReason = reason;
    this._cancelledAt = new Date();
    this.incrementVersion();

    this.addEvent(
      new IndexGenerationCancelledEvent(this._id.value, this._version, {
        generationId: this._id.value,
        tenantId: this._tenantId,
        reason,
        cancelledAt: this._cancelledAt,
      }),
    );
  }

  // --- Aggregate Event Management ---

  public getUncommittedEvents(): ReadonlyArray<DomainEvent> {
    return Object.freeze([...this._uncommittedEvents]);
  }

  public clearEvents(): void {
    this._uncommittedEvents.length = 0;
  }

  private addEvent(event: DomainEvent): void {
    this._uncommittedEvents.push(event);
  }

  private incrementVersion(): void {
    this._version += 1;
  }

  private assertValidTransition(targetStatus: IndexGenerationStatus): void {
    if (!isValidIndexGenerationTransition(this._status, targetStatus)) {
      throw new InvalidIndexGenerationTransitionException(
        this._status,
        targetStatus,
        `Illegal transition from ${this._status} to ${targetStatus}`,
      );
    }
  }

  // --- Reconstitution ---

  public static reconstitute(props: ReconstituteIndexGenerationProps): IndexGeneration {
    return new IndexGeneration({
      id: IndexGenerationId.fromString(props.id),
      tenantId: props.tenantId,
      generationNumber: props.generationNumber,
      profile: props.profile,
      status: props.status,
      targetChunkCount: props.targetChunkCount,
      indexedChunkCount: props.indexedChunkCount,
      failedChunkCount: props.failedChunkCount,
      version: props.version,
      createdAt: props.createdAt,
      startedAt: props.startedAt,
      validatedAt: props.validatedAt,
      activatedAt: props.activatedAt,
      retiredAt: props.retiredAt,
      failedAt: props.failedAt,
      cancelledAt: props.cancelledAt,
      errorCode: props.errorCode,
      failureReason: props.failureReason,
      cancellationReason: props.cancellationReason,
    });
  }
}
