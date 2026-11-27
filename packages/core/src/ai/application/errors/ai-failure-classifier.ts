import {
  AiConversationApplicationError,
  ConversationNotFoundError,
  TurnNotFoundError,
  MessageNotFoundError,
  CitationNotFoundError,
  TenantOwnershipViolationError,
  InvalidTurnInputError,
  DuplicateClientTurnPayloadMismatchError,
  TurnAlreadyInProgressError,
  InvalidConversationLifecycleError,
  InvalidMessageOperationError,
  PersistenceConflictError,
  TransactionFailureError,
  TransientTransactionFailureError,
  DocumentAccessRestrictedError,
  DocumentPreviewUnsupportedFormatError,
  DocumentFileNotFoundInStorageError,
  DocumentArchivedOrDeletedError,
  FeedbackNotFoundError,
  FeedbackTargetNotAssistantMessageError,
  MessageNotBelongingToConversationError,
  InvalidFeedbackInputError,
} from './ai-conversation-application.error';
import {
  ConversationNotFoundException,
  TurnNotFoundException,
  MessageNotFoundException,
  DuplicateEntityException,
  InvalidOwnershipException,
  InvalidConversationTurnException,
  InvalidMessageInvariantException,
  InvalidCursorException,
  ConversationPersistenceException,
} from '../../domain/exceptions/conversation.exceptions';
import {
  AiDomainException,
  LLMProviderUnavailableException,
  EmbeddingProviderUnavailableException,
  EmbeddingDimensionMismatchException,
  GenerationFailedException,
  GenerationCancelledException,
  ModelNotFoundException,
  ProviderTimeoutException,
  AiConfigurationInvalidException,
  InputTooLargeException,
  ResourceExhaustedException,
  InvalidEmbeddingRequestException,
} from '../../domain/exceptions/ai-provider.exceptions';
import {
  RetrievalDomainException,
  EmptyRetrievalQueryException,
  InvalidRetrievalQueryException,
  InvalidSimilarityScoreException,
  ActiveIndexGenerationNotFoundException,
  RetrievalProfileMismatchException,
  RetrievalDatabaseException,
  InvalidRetrievalConfigurationException,
  InvalidMetadataFilterException,
  UnauthorizedRetrievalException,
  RetrievalProviderException,
} from '../../domain/exceptions/retrieval.exceptions';
import { RetrievalErrorCode } from '../../domain/enums/retrieval-error-code.enum';
import {
  InvalidStateTransitionException,
  DocumentNotFoundException,
  DocumentVersionConflictException,
  DuplicateActiveIngestionException,
  DocumentAlreadyDeletedException,
  UnauthorizedDocumentAccessException,
  InvalidIngestionRetryException,
  IngestionJobCancellationConflictException,
  DocumentValidationException,
  UnsupportedDocumentFormatException,
  DocumentContentMismatchException,
  DocumentMalformedException,
  DocumentSizeLimitExceededException,
  DocumentSecurityRiskException,
  DuplicateDocumentVersionException,
  DuplicateDocumentContentException,
} from '../../domain/exceptions/knowledge-document.exceptions';
import {
  DocumentExtractionException,
  ExtractionTimeoutException,
  ExtractionResourceLimitExceededException,
  InvalidFormatExtractionException,
  CorruptDocumentExtractionException,
  EmptyExtractedDocumentException,
} from '../../domain/exceptions/document-extraction.exceptions';
import { FileProcessingFailureCode } from '../../domain/enums/file-processing-failure-code.enum';

/**
 * Standard failure categories for Kynergy Intelligence operations.
 * Decouples domain operational concerns from low-level infrastructure exceptions.
 */
export enum AiFailureCategory {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  PROVIDER_RATE_LIMITED = 'PROVIDER_RATE_LIMITED',
  PROVIDER_TIMEOUT = 'PROVIDER_TIMEOUT',
  RETRIEVAL_UNAVAILABLE = 'RETRIEVAL_UNAVAILABLE',
  INSUFFICIENT_KNOWLEDGE = 'INSUFFICIENT_KNOWLEDGE',
  GENERATION_FAILED = 'GENERATION_FAILED',
  STREAM_INTERRUPTED = 'STREAM_INTERRUPTED',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  INGESTION_FAILED = 'INGESTION_FAILED',
  SOURCE_UNAVAILABLE = 'SOURCE_UNAVAILABLE',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Authoritative classified failure metadata used across backend responses,
 * event dispatchers, and logging layers.
 */
export interface ClassifiedAiFailure {
  readonly category: AiFailureCategory;
  readonly code: string;
  readonly statusCode: number;
  readonly errorTitle: string;
  readonly message: string;
  readonly isRetryable: boolean;
  readonly retryAfterSeconds?: number;
  readonly details?: Record<string, unknown>;
}

/**
 * Deterministic failure classifier mapping all AI domain, application,
 * provider, and transport errors into typed, safe failure contracts.
 */
export class AiFailureClassifier {
  public static classify(exception: unknown): ClassifiedAiFailure {
    if (!exception) {
      return {
        category: AiFailureCategory.INTERNAL_ERROR,
        code: 'AI_INTERNAL_ERROR',
        statusCode: 500,
        errorTitle: 'Internal Server Error',
        message: 'An unexpected internal error occurred during AI processing.',
        isRetryable: false,
      };
    }

    // 1. Not Found & Unavailable Resources (404)
    if (
      exception instanceof ConversationNotFoundError ||
      exception instanceof TurnNotFoundError ||
      exception instanceof MessageNotFoundError ||
      exception instanceof FeedbackNotFoundError ||
      exception instanceof ConversationNotFoundException ||
      exception instanceof TurnNotFoundException ||
      exception instanceof MessageNotFoundException ||
      exception instanceof DocumentNotFoundException
    ) {
      const code =
        exception instanceof AiConversationApplicationError
          ? exception.code
          : exception instanceof AiDomainException
            ? exception.code
            : 'AI_NOT_FOUND';

      return {
        category: AiFailureCategory.RESOURCE_NOT_FOUND,
        code,
        statusCode: 404,
        errorTitle: 'Not Found',
        message: this.sanitizeErrorMessage(exception.message),
        isRetryable: false,
        details:
          exception instanceof AiConversationApplicationError ? exception.details : undefined,
      };
    }

    if (
      exception instanceof CitationNotFoundError ||
      exception instanceof DocumentFileNotFoundInStorageError ||
      exception instanceof DocumentArchivedOrDeletedError ||
      exception instanceof DocumentAlreadyDeletedException
    ) {
      const code =
        exception instanceof AiConversationApplicationError
          ? exception.code
          : exception instanceof AiDomainException
            ? exception.code
            : 'AI_SOURCE_UNAVAILABLE';

      return {
        category: AiFailureCategory.SOURCE_UNAVAILABLE,
        code,
        statusCode: 404,
        errorTitle: 'Not Found',
        message: this.sanitizeErrorMessage(exception.message),
        isRetryable: false,
        details:
          exception instanceof AiConversationApplicationError ? exception.details : undefined,
      };
    }

    if (exception instanceof ActiveIndexGenerationNotFoundException) {
      return {
        category: AiFailureCategory.RESOURCE_NOT_FOUND,
        code: exception.errorCode,
        statusCode: 404,
        errorTitle: 'Not Found',
        message: this.sanitizeErrorMessage(exception.message),
        isRetryable: false,
      };
    }

    // 2. Authentication Failures (401)
    const errName =
      typeof exception === 'object' && exception !== null && 'name' in exception
        ? String((exception as { name: unknown }).name)
        : '';

    if (
      errName === 'InvalidCredentialsException' ||
      errName === 'AccountDisabledException' ||
      errName === 'InvalidTokenException' ||
      errName === 'AuthException' ||
      errName === 'UnauthorizedException'
    ) {
      return {
        category: AiFailureCategory.UNAUTHENTICATED,
        code: AiFailureCategory.UNAUTHENTICATED,
        statusCode: 401,
        errorTitle: 'Unauthorized',
        message: 'Authentication credentials are missing or invalid.',
        isRetryable: false,
      };
    }

    // 3. Authorization & Tenant Isolation Failures (403)
    if (
      exception instanceof TenantOwnershipViolationError ||
      exception instanceof InvalidOwnershipException ||
      exception instanceof DocumentAccessRestrictedError ||
      exception instanceof UnauthorizedDocumentAccessException ||
      exception instanceof UnauthorizedRetrievalException ||
      errName === 'ForbiddenException'
    ) {
      const code =
        exception instanceof AiConversationApplicationError
          ? exception.code
          : exception instanceof RetrievalDomainException
            ? exception.errorCode
            : exception instanceof AiDomainException
              ? exception.code
              : 'FORBIDDEN';

      return {
        category: AiFailureCategory.FORBIDDEN,
        code,
        statusCode: 403,
        errorTitle: 'Forbidden',
        message:
          exception instanceof UnauthorizedDocumentAccessException
            ? 'You do not possess the required permissions or authorization for this document.'
            : this.sanitizeErrorMessage(
                exception instanceof Error
                  ? exception.message
                  : 'You do not possess the required permissions or tenant clearance for this resource.',
              ),
        isRetryable: false,
        details:
          exception instanceof AiConversationApplicationError ? exception.details : undefined,
      };
    }

    // 4. Bad Request & Validation Failures (400)
    if (
      exception instanceof InvalidFeedbackInputError ||
      exception instanceof FeedbackTargetNotAssistantMessageError ||
      exception instanceof MessageNotBelongingToConversationError ||
      exception instanceof InvalidTurnInputError ||
      exception instanceof InvalidConversationLifecycleError ||
      exception instanceof InvalidMessageOperationError ||
      exception instanceof InvalidConversationTurnException ||
      exception instanceof InvalidMessageInvariantException ||
      exception instanceof InvalidCursorException ||
      exception instanceof EmptyRetrievalQueryException ||
      exception instanceof InvalidRetrievalQueryException ||
      exception instanceof InvalidSimilarityScoreException ||
      exception instanceof InvalidRetrievalConfigurationException ||
      exception instanceof InvalidMetadataFilterException ||
      exception instanceof InvalidStateTransitionException ||
      exception instanceof InvalidIngestionRetryException ||
      exception instanceof InvalidEmbeddingRequestException
    ) {
      const code =
        exception instanceof AiConversationApplicationError
          ? exception.code
          : exception instanceof RetrievalDomainException
            ? exception.errorCode
            : exception instanceof AiDomainException
              ? exception.code
              : 'VALIDATION_ERROR';

      return {
        category: AiFailureCategory.VALIDATION_ERROR,
        code,
        statusCode: 400,
        errorTitle: 'Bad Request',
        message: this.sanitizeErrorMessage(exception.message),
        isRetryable: false,
        details:
          exception instanceof AiConversationApplicationError ? exception.details : undefined,
      };
    }

    // 4b. Document Upload & Ingestion Validation
    if (
      exception instanceof InputTooLargeException ||
      exception instanceof DocumentSizeLimitExceededException ||
      exception instanceof ExtractionResourceLimitExceededException
    ) {
      return {
        category: AiFailureCategory.VALIDATION_ERROR,
        code:
          exception instanceof ExtractionResourceLimitExceededException
            ? FileProcessingFailureCode.RESOURCE_LIMIT_EXCEEDED
            : FileProcessingFailureCode.FILE_TOO_LARGE,
        statusCode: 413,
        errorTitle: 'Payload Too Large',
        message: this.sanitizeErrorMessage(exception.message),
        isRetryable: false,
      };
    }

    if (
      exception instanceof DocumentPreviewUnsupportedFormatError ||
      exception instanceof UnsupportedDocumentFormatException
    ) {
      return {
        category: AiFailureCategory.VALIDATION_ERROR,
        code: FileProcessingFailureCode.UNSUPPORTED_FILE_TYPE,
        statusCode: 415,
        errorTitle: 'Unsupported Media Type',
        message: this.sanitizeErrorMessage(exception.message),
        isRetryable: false,
        details:
          exception instanceof DocumentPreviewUnsupportedFormatError
            ? exception.details
            : undefined,
      };
    }

    if (exception instanceof ExtractionTimeoutException) {
      return {
        category: AiFailureCategory.PROVIDER_TIMEOUT,
        code: FileProcessingFailureCode.PARSER_TIMEOUT,
        statusCode: 504,
        errorTitle: 'Gateway Timeout',
        message: 'Document extraction timed out waiting for parser completion.',
        isRetryable: true,
        retryAfterSeconds: 3,
      };
    }

    if (exception instanceof DocumentSecurityRiskException) {
      return {
        category: AiFailureCategory.UPLOAD_FAILED,
        code: FileProcessingFailureCode.MALWARE_DETECTED,
        statusCode: 400,
        errorTitle: 'Bad Request',
        message: 'Security risk detected in document: Upload rejected due to security policy.',
        isRetryable: false,
      };
    }

    if (exception instanceof DocumentContentMismatchException) {
      return {
        category: AiFailureCategory.UPLOAD_FAILED,
        code: FileProcessingFailureCode.MIME_SIGNATURE_MISMATCH,
        statusCode: 400,
        errorTitle: 'Bad Request',
        message: this.sanitizeErrorMessage(exception.message),
        isRetryable: false,
      };
    }

    if (
      exception instanceof DocumentMalformedException ||
      exception instanceof CorruptDocumentExtractionException ||
      exception instanceof InvalidFormatExtractionException
    ) {
      return {
        category: AiFailureCategory.UPLOAD_FAILED,
        code: FileProcessingFailureCode.MALFORMED_DOCUMENT,
        statusCode: 400,
        errorTitle: 'Bad Request',
        message: 'Document structure is corrupt or cannot be parsed.',
        isRetryable: false,
      };
    }

    if (exception instanceof EmptyExtractedDocumentException) {
      return {
        category: AiFailureCategory.UPLOAD_FAILED,
        code: FileProcessingFailureCode.EXTRACTION_FAILURE,
        statusCode: 400,
        errorTitle: 'Bad Request',
        message: 'Document was parsed successfully but yielded no extractable textual content.',
        isRetryable: false,
      };
    }

    if (exception instanceof DocumentExtractionException) {
      return {
        category: AiFailureCategory.UPLOAD_FAILED,
        code: FileProcessingFailureCode.EXTRACTION_FAILURE,
        statusCode: 400,
        errorTitle: 'Bad Request',
        message: 'Document extraction failed during content processing.',
        isRetryable: false,
      };
    }

    if (exception instanceof DocumentValidationException) {
      return {
        category: AiFailureCategory.UPLOAD_FAILED,
        code: exception.code || FileProcessingFailureCode.UNSUPPORTED_FILE_TYPE,
        statusCode: 400,
        errorTitle: 'Bad Request',
        message: this.sanitizeErrorMessage(exception.message),
        isRetryable: false,
      };
    }

    // 4c. Generation Cancellation (400 / Client Closed)
    if (
      exception instanceof GenerationCancelledException ||
      errName === 'AbortError' ||
      (typeof exception === 'object' &&
        exception !== null &&
        'code' in exception &&
        (exception as { code: unknown }).code === 'GENERATION_CANCELLED')
    ) {
      return {
        category: AiFailureCategory.STREAM_INTERRUPTED,
        code: 'GENERATION_CANCELLED',
        statusCode: 400,
        errorTitle: 'Bad Request',
        message: 'Generation was cancelled by client request.',
        isRetryable: false,
      };
    }

    // 5. Conflicts (409)
    if (exception instanceof TurnAlreadyInProgressError) {
      return {
        category: AiFailureCategory.CONFLICT,
        code: exception.code,
        statusCode: 409,
        errorTitle: 'Conflict',
        message: this.sanitizeErrorMessage(exception.message),
        isRetryable: true,
        retryAfterSeconds: 2,
        details: exception.details,
      };
    }

    if (
      exception instanceof DuplicateClientTurnPayloadMismatchError ||
      exception instanceof DuplicateEntityException ||
      exception instanceof PersistenceConflictError ||
      exception instanceof DuplicateDocumentContentException ||
      exception instanceof DuplicateDocumentVersionException ||
      exception instanceof DuplicateActiveIngestionException ||
      exception instanceof IngestionJobCancellationConflictException ||
      exception instanceof DocumentVersionConflictException ||
      exception instanceof RetrievalProfileMismatchException
    ) {
      const code =
        exception instanceof AiConversationApplicationError
          ? exception.code
          : exception instanceof RetrievalDomainException
            ? exception.errorCode
            : exception instanceof AiDomainException
              ? exception.code
              : 'CONFLICT';

      return {
        category: AiFailureCategory.CONFLICT,
        code,
        statusCode: 409,
        errorTitle: 'Conflict',
        message: this.sanitizeErrorMessage(exception.message),
        isRetryable: false,
        details:
          exception instanceof AiConversationApplicationError ? exception.details : undefined,
      };
    }

    // 6. Payload Too Large (413)
    if (
      exception instanceof InputTooLargeException ||
      exception instanceof DocumentSizeLimitExceededException ||
      exception instanceof ExtractionResourceLimitExceededException
    ) {
      return {
        category: AiFailureCategory.VALIDATION_ERROR,
        code:
          exception instanceof ExtractionResourceLimitExceededException
            ? FileProcessingFailureCode.RESOURCE_LIMIT_EXCEEDED
            : FileProcessingFailureCode.FILE_TOO_LARGE,
        statusCode: 413,
        errorTitle: 'Payload Too Large',
        message: this.sanitizeErrorMessage(exception.message),
        isRetryable: false,
      };
    }

    // 7. Unsupported Media Type (415)
    if (
      exception instanceof DocumentPreviewUnsupportedFormatError ||
      exception instanceof UnsupportedDocumentFormatException
    ) {
      return {
        category: AiFailureCategory.VALIDATION_ERROR,
        code: FileProcessingFailureCode.UNSUPPORTED_FILE_TYPE,
        statusCode: 415,
        errorTitle: 'Unsupported Media Type',
        message: this.sanitizeErrorMessage(exception.message),
        isRetryable: false,
        details:
          exception instanceof DocumentPreviewUnsupportedFormatError
            ? exception.details
            : undefined,
      };
    }

    // 8. Provider & Infrastructure Timeouts (504)
    if (
      exception instanceof ProviderTimeoutException ||
      exception instanceof ExtractionTimeoutException ||
      (exception instanceof RetrievalProviderException &&
        exception.errorCode === RetrievalErrorCode.PROVIDER_TIMEOUT) ||
      errName === 'GatewayTimeoutException'
    ) {
      const code =
        exception instanceof ExtractionTimeoutException
          ? FileProcessingFailureCode.PARSER_TIMEOUT
          : 'PROVIDER_TIMEOUT';
      return {
        category: AiFailureCategory.PROVIDER_TIMEOUT,
        code,
        statusCode: 504,
        errorTitle: 'Gateway Timeout',
        message:
          exception instanceof ExtractionTimeoutException
            ? 'Document extraction timed out waiting for parser completion.'
            : 'The AI inference or retrieval provider timed out waiting for a response.',
        isRetryable: true,
        retryAfterSeconds: 3,
      };
    }

    // 9. Provider Availability, Overload & Transience (503)
    if (
      exception instanceof LLMProviderUnavailableException ||
      exception instanceof EmbeddingProviderUnavailableException ||
      exception instanceof ResourceExhaustedException ||
      errName === 'ServiceUnavailableException'
    ) {
      const code = exception instanceof AiDomainException ? exception.code : 'PROVIDER_UNAVAILABLE';
      return {
        category: AiFailureCategory.PROVIDER_UNAVAILABLE,
        code,
        statusCode: 503,
        errorTitle: 'Service Unavailable',
        message: 'AI provider service is temporarily unavailable or overloaded. Please retry.',
        isRetryable: true,
        retryAfterSeconds: 2,
      };
    }

    if (exception instanceof ModelNotFoundException) {
      return {
        category: AiFailureCategory.PROVIDER_UNAVAILABLE,
        code: exception.code,
        statusCode: 503,
        errorTitle: 'Service Unavailable',
        message: this.sanitizeErrorMessage(exception.message),
        isRetryable: false,
      };
    }

    if (exception instanceof RetrievalDatabaseException) {
      return {
        category: AiFailureCategory.RETRIEVAL_UNAVAILABLE,
        code: exception.errorCode,
        statusCode: 503,
        errorTitle: 'Service Unavailable',
        message: 'Knowledge retrieval database encountered a temporary failure. Please retry.',
        isRetryable: true,
        retryAfterSeconds: 1,
      };
    }

    if (exception instanceof RetrievalProviderException) {
      return {
        category: AiFailureCategory.RETRIEVAL_UNAVAILABLE,
        code: exception.errorCode,
        statusCode: 503,
        errorTitle: 'Service Unavailable',
        message: 'Knowledge retrieval provider encountered a transient error. Please retry.',
        isRetryable: true,
        retryAfterSeconds: 2,
      };
    }

    if (exception instanceof TransientTransactionFailureError) {
      return {
        category: AiFailureCategory.INTERNAL_ERROR,
        code: exception.code,
        statusCode: 503,
        errorTitle: 'Service Unavailable',
        message:
          'Database transaction failed due to concurrent conflicts after retry attempts. Please retry shortly.',
        isRetryable: true,
        retryAfterSeconds: 1,
        details: exception.details,
      };
    }

    // 10. Persistence / Configuration / System Failures (500)
    if (
      exception instanceof TransactionFailureError ||
      exception instanceof ConversationPersistenceException ||
      exception instanceof EmbeddingDimensionMismatchException
    ) {
      const code =
        exception instanceof AiConversationApplicationError
          ? exception.code
          : exception instanceof AiDomainException
            ? exception.code
            : 'AI_PERSISTENCE_FAILURE';

      return {
        category: AiFailureCategory.INTERNAL_ERROR,
        code,
        statusCode: 500,
        errorTitle: 'Internal Server Error',
        message: 'A database persistence error occurred. Please try again.',
        isRetryable: true,
        details:
          exception instanceof AiConversationApplicationError ? exception.details : undefined,
      };
    }

    if (exception instanceof AiConfigurationInvalidException) {
      return {
        category: AiFailureCategory.INTERNAL_ERROR,
        code: exception.code,
        statusCode: 500,
        errorTitle: 'Internal Server Error',
        message: 'Internal AI subsystem configuration error.',
        isRetryable: false,
      };
    }

    if (exception instanceof GenerationFailedException) {
      return {
        category: AiFailureCategory.GENERATION_FAILED,
        code: exception.code,
        statusCode: 500,
        errorTitle: 'Internal Server Error',
        message: 'AI assistant failed to generate a complete answer.',
        isRetryable: true,
      };
    }

    // 11. Duck-typed NestJS HttpException inspection
    if (
      typeof exception === 'object' &&
      exception !== null &&
      'getStatus' in exception &&
      typeof (exception as { getStatus: unknown }).getStatus === 'function'
    ) {
      const httpEx = exception as { getStatus: () => number; getResponse: () => unknown };
      const status = httpEx.getStatus();
      const resPayload = httpEx.getResponse();
      const category = this.mapStatusToCategory(status);

      let extractedMessage = 'An HTTP error occurred.';
      let extractedError = this.mapStatusToTitle(status);
      let extractedCode = category.toString();
      let extractedDetails: Record<string, unknown> | undefined = undefined;

      if (typeof resPayload === 'object' && resPayload !== null) {
        const payloadObj = resPayload as Record<string, unknown>;
        extractedError = String(payloadObj['error'] ?? extractedError);
        extractedMessage = String(payloadObj['message'] ?? extractedMessage);
        extractedCode = String(payloadObj['code'] ?? category.toString());
        if (typeof payloadObj['details'] === 'object' && payloadObj['details'] !== null) {
          extractedDetails = payloadObj['details'] as Record<string, unknown>;
        }
      } else if (typeof resPayload === 'string') {
        extractedMessage = resPayload;
      }

      const isRetryable = status === 429 || status === 503 || status === 504;
      const retryAfterSeconds = status === 429 ? 5 : status === 503 ? 2 : undefined;

      return {
        category,
        code: extractedCode,
        statusCode: status,
        errorTitle: extractedError,
        message: this.sanitizeErrorMessage(extractedMessage),
        isRetryable,
        retryAfterSeconds,
        details: extractedDetails,
      };
    }

    // 12. Generic / Uncaught Error Fallback
    return {
      category: AiFailureCategory.INTERNAL_ERROR,
      code: 'AI_INTERNAL_ERROR',
      statusCode: 500,
      errorTitle: 'Internal Server Error',
      message: 'An unexpected error occurred during AI processing.',
      isRetryable: false,
      details: undefined,
    };
  }

  private static mapStatusToCategory(status: number): AiFailureCategory {
    if (status === 400) return AiFailureCategory.VALIDATION_ERROR;
    if (status === 401) return AiFailureCategory.UNAUTHENTICATED;
    if (status === 403) return AiFailureCategory.FORBIDDEN;
    if (status === 404) return AiFailureCategory.RESOURCE_NOT_FOUND;
    if (status === 409) return AiFailureCategory.CONFLICT;
    if (status === 429) return AiFailureCategory.RATE_LIMITED;
    if (status === 504) return AiFailureCategory.REQUEST_TIMEOUT;
    if (status === 502 || status === 503) return AiFailureCategory.PROVIDER_UNAVAILABLE;
    return AiFailureCategory.INTERNAL_ERROR;
  }

  private static mapStatusToTitle(status: number): string {
    switch (status) {
      case 400:
        return 'Bad Request';
      case 401:
        return 'Unauthorized';
      case 403:
        return 'Forbidden';
      case 404:
        return 'Not Found';
      case 409:
        return 'Conflict';
      case 413:
        return 'Payload Too Large';
      case 415:
        return 'Unsupported Media Type';
      case 429:
        return 'Too Many Requests';
      case 503:
        return 'Service Unavailable';
      case 504:
        return 'Gateway Timeout';
      default:
        return status >= 500 ? 'Internal Server Error' : 'Http Error';
    }
  }

  /**
   * Sanitizes user-facing error messages to prevent leaking stack traces,
   * database internals, Prisma schema names, SQL fragments, connection strings,
   * or file system paths.
   */
  public static sanitizeErrorMessage(message?: string): string {
    if (!message) return 'An unexpected error occurred during AI processing.';

    const sensitivePatterns = [
      /prisma/i,
      /\bSELECT\b.*?\bFROM\b/i,
      /\bINSERT\b.*?\bINTO\b/i,
      /\bUPDATE\b.*?\bSET\b/i,
      /\bDELETE\b.*?\bFROM\b/i,
      /syntaxerror/i,
      /nullpointer/i,
      /pgvector/i,
      /connection refused/i,
      /econnrefused/i,
      /stack\s*trace/i,
      /[a-zA-Z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*/g, // Windows paths
      /\/(?:[a-zA-Z0-9_-]+\/)+[a-zA-Z0-9_.-]+/g, // POSIX paths
      /Macro\.VBA\b/i,
      /EICAR\b/i,
      /Trojan\b/i,
      /Backdoor\b/i,
      /ExploitTarget\b/i,
      /Worm\b/i,
      /Ransomware\b/i,
      /mammoth/i,
      /unpdf/i,
      /pdfjs/i,
    ];

    let sanitized = message;
    for (const pattern of sensitivePatterns) {
      if (pattern.test(sanitized)) {
        if (/Macro\.VBA|EICAR|Trojan|Backdoor|ExploitTarget|Worm|Ransomware/i.test(sanitized)) {
          return 'Security risk detected in document: Upload rejected due to security policy.';
        }
        if (/mammoth|unpdf|pdfjs/i.test(sanitized)) {
          return 'Document structure is invalid or violates format specifications.';
        }
        return 'The AI subsystem encountered an unexpected internal error.';
      }
    }

    sanitized = sanitized.replace(/knowledge_base\/[a-zA-Z0-9_\-./]+/g, '[redacted_storage_key]');
    sanitized = sanitized.replace(
      /(?:token\s+)?near:\s*['"][^'"]*['"]/gi,
      "near: '[redacted_token]'",
    );

    sanitized = sanitized.replace(/\b(?:\d[ -]*?){13,19}\b/g, '****-****-****-[MASKED]');
    sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer [REDACTED]');
    sanitized = sanitized.replace(/eyJ[A-Za-z0-9\-_.]+/g, '[REDACTED_TOKEN]');
    sanitized = sanitized.replace(/(password|secret)\s*[:=]\s*\S+/gi, '$1: [REDACTED]');
    sanitized = sanitized.replace(
      /(postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"']+/gi,
      '$1://[REDACTED_DATABASE_URL]',
    );

    return sanitized;
  }
}
