/**
 * Structured taxonomy of generation and dispatch failure categories.
 * Decouples domain operational concerns from low-level infrastructure exceptions.
 */
export enum TurnFailureCategory {
  RETRIEVAL_FAILURE = 'RETRIEVAL_FAILURE',
  CONTEXT_CONSTRUCTION_FAILURE = 'CONTEXT_CONSTRUCTION_FAILURE',
  LLM_PROVIDER_FAILURE = 'LLM_PROVIDER_FAILURE',
  GENERATION_TIMEOUT = 'GENERATION_TIMEOUT',
  DISPATCH_FAILURE = 'DISPATCH_FAILURE',
  PERSISTENCE_FAILURE = 'PERSISTENCE_FAILURE',
  CANCELLATION = 'CANCELLATION',
  WORKER_SHUTDOWN = 'WORKER_SHUTDOWN',
  VALIDATION_FAILURE = 'VALIDATION_FAILURE',
  AUTHORIZATION_FAILURE = 'AUTHORIZATION_FAILURE',
  UNKNOWN_FAILURE = 'UNKNOWN_FAILURE',
}

export interface ClassifiedTurnError {
  readonly category: TurnFailureCategory;
  readonly isRetryable: boolean;
  readonly errorCode: string;
  readonly sanitizedErrorMessage: string;
}

/**
 * Deterministic error classifier for generation turn execution, timeouts, and cancellation.
 * Ensures internal secrets, raw connection strings, or full stack traces are sanitized.
 */
export class AiTurnErrorClassifier {
  public static classify(err: unknown): ClassifiedTurnError {
    if (!err) {
      return {
        category: TurnFailureCategory.UNKNOWN_FAILURE,
        isRetryable: false,
        errorCode: 'UNKNOWN_ERROR',
        sanitizedErrorMessage: 'An unknown generation error occurred.',
      };
    }

    const errName =
      typeof err === 'object' && err !== null && 'name' in err ? String(err.name) : '';
    const errCode =
      typeof err === 'object' && err !== null && 'code' in err
        ? String(err.code)
        : typeof err === 'object' && err !== null && 'errorCode' in err
          ? String(err.errorCode)
          : '';
    const rawMessage = err instanceof Error ? err.message : String(err);

    // 1. Cancellation
    if (
      errName === 'AbortError' ||
      errCode === 'GENERATION_CANCELLED' ||
      errCode === 'EXTRACTION_CANCELLED' ||
      rawMessage.toLowerCase().includes('cancel')
    ) {
      return {
        category: TurnFailureCategory.CANCELLATION,
        isRetryable: false,
        errorCode: 'GENERATION_CANCELLED',
        sanitizedErrorMessage: 'Turn generation was cancelled.',
      };
    }

    // 2. Timeouts
    if (
      errName === 'ProviderTimeoutException' ||
      errName === 'ExtractionTimeoutException' ||
      errCode === 'PROVIDER_TIMEOUT' ||
      errCode === 'PROCESSING_TIMEOUT' ||
      rawMessage.toLowerCase().includes('timed out') ||
      rawMessage.toLowerCase().includes('timeout')
    ) {
      return {
        category: TurnFailureCategory.GENERATION_TIMEOUT,
        isRetryable: true,
        errorCode: 'GENERATION_TIMEOUT',
        sanitizedErrorMessage: 'The generation pipeline timed out waiting for provider response.',
      };
    }

    // 3. Worker Shutdown
    if (errCode === 'WORKER_SHUTDOWN' || rawMessage.toLowerCase().includes('shutdown')) {
      return {
        category: TurnFailureCategory.WORKER_SHUTDOWN,
        isRetryable: true,
        errorCode: 'WORKER_SHUTDOWN',
        sanitizedErrorMessage: 'Worker instance is shutting down; generation will be recovered.',
      };
    }

    // 4. Retrieval & Database Failures
    if (
      errName === 'RetrievalDatabaseException' ||
      errCode === 'RETRIEVAL_PERSISTENCE_ERROR' ||
      errCode === 'DATABASE_TRANSIENT_ERROR' ||
      rawMessage.toLowerCase().includes('vector store') ||
      rawMessage.toLowerCase().includes('database')
    ) {
      return {
        category: TurnFailureCategory.RETRIEVAL_FAILURE,
        isRetryable: true,
        errorCode: 'RETRIEVAL_DATABASE_ERROR',
        sanitizedErrorMessage: 'Knowledge retrieval database encountered a temporary failure.',
      };
    }

    // 5. LLM Provider Failures
    if (errName === 'ModelNotFoundException' || errCode === 'MODEL_NOT_FOUND') {
      return {
        category: TurnFailureCategory.LLM_PROVIDER_FAILURE,
        isRetryable: false, // Model missing is not transiently retryable
        errorCode: 'MODEL_NOT_FOUND',
        sanitizedErrorMessage: 'Configured LLM inference model was not found in runtime.',
      };
    }

    if (
      errName === 'ProviderUnavailableException' ||
      errCode === 'PROVIDER_UNAVAILABLE' ||
      errCode === 'RATE_LIMITED' ||
      rawMessage.toLowerCase().includes('inference runtime') ||
      rawMessage.toLowerCase().includes('ollama') ||
      rawMessage.toLowerCase().includes('connection refused')
    ) {
      return {
        category: TurnFailureCategory.LLM_PROVIDER_FAILURE,
        isRetryable: true,
        errorCode: 'LLM_PROVIDER_UNAVAILABLE',
        sanitizedErrorMessage: 'LLM inference service is temporarily unavailable.',
      };
    }

    // 6. Persistence & Finalization Failures
    if (
      errCode === 'AI_PERSISTENCE_CONFLICT' ||
      errCode === 'TRANSACTION_FAILURE' ||
      rawMessage.toLowerCase().includes('transaction')
    ) {
      return {
        category: TurnFailureCategory.PERSISTENCE_FAILURE,
        isRetryable: true,
        errorCode: 'PERSISTENCE_CONFLICT',
        sanitizedErrorMessage: 'A concurrent database conflict occurred during turn finalization.',
      };
    }

    // 7. Validation Failures (Permanent)
    if (
      errCode === 'AI_INVALID_TURN_INPUT' ||
      errCode === 'AI_INVALID_CONVERSATION_LIFECYCLE' ||
      errName === 'InvalidTurnInputError' ||
      errName === 'InvalidConversationLifecycleError'
    ) {
      return {
        category: TurnFailureCategory.VALIDATION_FAILURE,
        isRetryable: false,
        errorCode: errCode || 'VALIDATION_ERROR',
        sanitizedErrorMessage: rawMessage,
      };
    }

    // 8. Authorization & Tenant Isolation Failures (Permanent)
    if (
      errCode === 'AI_TENANT_OWNERSHIP_VIOLATION' ||
      errCode === 'AI_CONVERSATION_NOT_FOUND' ||
      errName === 'TenantOwnershipViolationError' ||
      errName === 'UnauthorizedRetrievalException'
    ) {
      return {
        category: TurnFailureCategory.AUTHORIZATION_FAILURE,
        isRetryable: false,
        errorCode: 'TENANT_ISOLATION_VIOLATION',
        sanitizedErrorMessage: 'Tenant isolation or authorization validation failed.',
      };
    }

    // Default Fallback
    return {
      category: TurnFailureCategory.UNKNOWN_FAILURE,
      isRetryable: false,
      errorCode: errCode || 'GENERATION_FAILED',
      sanitizedErrorMessage: 'An unclassified error occurred during conversation turn execution.',
    };
  }
}
