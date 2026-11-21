import { RetrievalErrorCode } from '../enums/retrieval-error-code.enum';

export abstract class RetrievalDomainException extends Error {
  public abstract readonly errorCode: RetrievalErrorCode;

  protected constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EmptyRetrievalQueryException extends RetrievalDomainException {
  public readonly errorCode = RetrievalErrorCode.EMPTY_QUERY;

  constructor(message = 'Retrieval query cannot be empty or whitespace.') {
    super(message);
  }
}

export class InvalidRetrievalQueryException extends RetrievalDomainException {
  public readonly errorCode = RetrievalErrorCode.QUERY_TOO_LONG;

  constructor(message: string, code = RetrievalErrorCode.QUERY_TOO_LONG) {
    super(message);
    (this as { errorCode: RetrievalErrorCode }).errorCode = code;
  }
}

export class InvalidSimilarityScoreException extends RetrievalDomainException {
  public readonly errorCode = RetrievalErrorCode.INVALID_SIMILARITY_SCORE;

  constructor(message: string) {
    super(message);
  }
}

export class ActiveIndexGenerationNotFoundException extends RetrievalDomainException {
  public readonly errorCode = RetrievalErrorCode.NO_ACTIVE_INDEX_GENERATION;

  constructor(tenantId: string) {
    super(`No ACTIVE vector index generation found for tenant '${tenantId}'.`);
  }
}

export class RetrievalProfileMismatchException extends RetrievalDomainException {
  public readonly errorCode = RetrievalErrorCode.PROFILE_MISMATCH;

  constructor(expectedProfileId: string, actualProfileId: string) {
    super(
      `Embedding profile mismatch in retrieval: active generation expects '${expectedProfileId}', but provider yielded '${actualProfileId}'.`,
    );
  }
}

export class RetrievalDatabaseException extends RetrievalDomainException {
  public readonly errorCode = RetrievalErrorCode.RETRIEVAL_PERSISTENCE_ERROR;

  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`Retrieval database error: ${message}`);
  }
}

export class InvalidRetrievalConfigurationException extends RetrievalDomainException {
  public readonly errorCode = RetrievalErrorCode.INVALID_RETRIEVAL_CONFIG;

  constructor(message: string) {
    super(message);
  }
}

export class InvalidMetadataFilterException extends RetrievalDomainException {
  public readonly errorCode = RetrievalErrorCode.INVALID_METADATA_FILTER;

  constructor(message: string) {
    super(`Invalid metadata filter: ${message}`);
  }
}

export class UnauthorizedRetrievalException extends RetrievalDomainException {
  public readonly errorCode = RetrievalErrorCode.RETRIEVAL_UNAUTHORIZED;

  constructor(message: string) {
    super(`Unauthorized retrieval: ${message}`);
  }
}

export class RetrievalProviderException extends RetrievalDomainException {
  public readonly errorCode: RetrievalErrorCode;

  constructor(
    message: string,
    isTimeout = false,
    public readonly cause?: unknown,
  ) {
    super(
      isTimeout
        ? `Retrieval embedding provider timeout: ${message}`
        : `Retrieval embedding provider error: ${message}`,
    );
    this.errorCode = isTimeout
      ? RetrievalErrorCode.PROVIDER_TIMEOUT
      : RetrievalErrorCode.PROVIDER_FAILURE;
  }
}
