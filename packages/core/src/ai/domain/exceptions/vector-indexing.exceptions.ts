import { AiDomainException } from './ai-provider.exceptions';

export class EmbeddingValidationException extends AiDomainException {
  public readonly errorCode: string;
  public readonly metadata?: Record<string, unknown>;

  constructor(
    message: string,
    errorCode = 'EMBEDDING_VALIDATION_ERROR',
    metadata?: Record<string, unknown>,
  ) {
    super(message, errorCode);
    this.errorCode = errorCode;
    this.metadata = metadata;
  }
}

export class InvalidIndexGenerationTransitionException extends AiDomainException {
  constructor(fromState: string, toState: string, reason?: string) {
    const detail = reason ? ` Reason: ${reason}` : '';
    super(
      `Invalid index generation state transition from '${fromState}' to '${toState}'.${detail}`,
      'INVALID_INDEX_GENERATION_TRANSITION',
    );
  }
}

export class IncompatibleEmbeddingProfileException extends AiDomainException {
  constructor(message: string) {
    super(message, 'INCOMPATIBLE_EMBEDDING_PROFILE');
  }
}

export class DuplicateActiveIndexGenerationException extends AiDomainException {
  constructor(tenantId: string, activeGenerationId: string) {
    super(
      `An active index generation '${activeGenerationId}' already exists for tenant '${tenantId}'. Cannot activate multiple generations concurrently.`,
      'DUPLICATE_ACTIVE_INDEX_GENERATION',
    );
  }
}

export class IndexGenerationNotFoundException extends AiDomainException {
  constructor(generationId: string) {
    super(`Index generation '${generationId}' was not found.`, 'INDEX_GENERATION_NOT_FOUND');
  }
}

export class VectorIndexingJobException extends AiDomainException {
  constructor(message: string, code = 'VECTOR_INDEXING_JOB_ERROR') {
    super(message, code);
  }
}

export class IncompleteIndexGenerationException extends AiDomainException {
  public readonly generationId: string;
  public readonly missingReasons: readonly string[];

  constructor(generationId: string, missingReasons: readonly string[]) {
    super(
      `Index generation '${generationId}' failed completeness validation: ${missingReasons.join('; ')}`,
      'INCOMPLETE_INDEX_GENERATION',
    );
    this.generationId = generationId;
    this.missingReasons = missingReasons;
  }
}

export class IndexingJobAlreadyRunningException extends AiDomainException {
  constructor(jobId: string, scope: string, scopeId: string) {
    super(
      `Indexing job '${jobId}' for scope '${scope}' (${scopeId}) is already running.`,
      'INDEXING_JOB_ALREADY_RUNNING',
    );
  }
}

export class StaleWorkerConflictException extends AiDomainException {
  constructor(message = 'Stale worker detected; generation or job state has evolved.') {
    super(message, 'STALE_WORKER_CONFLICT');
  }
}

export class IndexGenerationIneligibleException extends AiDomainException {
  constructor(generationId: string, status: string, reason?: string) {
    const detail = reason ? ` Reason: ${reason}` : '';
    super(
      `Index generation '${generationId}' with status '${status}' is not eligible to receive vector embeddings.${detail}`,
      'GENERATION_INELIGIBLE',
    );
  }
}
