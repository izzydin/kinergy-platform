import {
  AiFailureClassifier,
  AiFailureCategory,
  ConversationNotFoundError,
  TurnNotFoundError,
  MessageNotFoundError,
  InvalidTurnInputError,
  DuplicateClientTurnPayloadMismatchError,
  TurnAlreadyInProgressError,
  TenantOwnershipViolationError,
  TransientTransactionFailureError,
  TransactionFailureError,
  EmptyRetrievalQueryException,
  UnauthorizedRetrievalException,
  ProviderTimeoutException,
  LLMProviderUnavailableException,
  EmbeddingProviderUnavailableException,
  RetrievalDatabaseException,
  DocumentNotFoundException,
  RetrievalErrorCode,
} from '../../../index';

describe('AI-09.8-ER.02 — AiFailureClassifier Domain & Infrastructure Classification', () => {
  describe('Domain & Conversation Errors', () => {
    it('classifies ConversationNotFoundError as RESOURCE_NOT_FOUND (404, non-retryable)', () => {
      const err = new ConversationNotFoundError('conv_123', 'tenant_abc');
      const classified = AiFailureClassifier.classify(err);

      expect(classified.category).toBe(AiFailureCategory.RESOURCE_NOT_FOUND);
      expect(classified.statusCode).toBe(404);
      expect(classified.code).toBe('AI_CONVERSATION_NOT_FOUND');
      expect(classified.isRetryable).toBe(false);
      expect(classified.retryAfterSeconds).toBeUndefined();
      expect(classified.message).toContain('conv_123');
    });

    it('classifies TurnNotFoundError and MessageNotFoundError as RESOURCE_NOT_FOUND', () => {
      const turnErr = new TurnNotFoundError('turn_456');
      const turnClassified = AiFailureClassifier.classify(turnErr);
      expect(turnClassified.category).toBe(AiFailureCategory.RESOURCE_NOT_FOUND);
      expect(turnClassified.statusCode).toBe(404);
      expect(turnClassified.code).toBe('AI_TURN_NOT_FOUND');

      const msgErr = new MessageNotFoundError('msg_789');
      const msgClassified = AiFailureClassifier.classify(msgErr);
      expect(msgClassified.category).toBe(AiFailureCategory.RESOURCE_NOT_FOUND);
      expect(msgClassified.statusCode).toBe(404);
      expect(msgClassified.code).toBe('AI_MESSAGE_NOT_FOUND');
    });

    it('classifies DocumentNotFoundException as RESOURCE_NOT_FOUND', () => {
      const docErr = new DocumentNotFoundException('doc_123');
      const classified = AiFailureClassifier.classify(docErr);
      expect(classified.category).toBe(AiFailureCategory.RESOURCE_NOT_FOUND);
      expect(classified.statusCode).toBe(404);
      expect(classified.code).toBe('DOCUMENT_NOT_FOUND');
      expect(classified.isRetryable).toBe(false);
    });

    it('classifies TurnAlreadyInProgressError as CONFLICT (409, retryable with retry-after)', () => {
      const err = new TurnAlreadyInProgressError('conv_123', 'turn_active');
      const classified = AiFailureClassifier.classify(err);

      expect(classified.category).toBe(AiFailureCategory.CONFLICT);
      expect(classified.statusCode).toBe(409);
      expect(classified.code).toBe('AI_TURN_ALREADY_IN_PROGRESS');
      expect(classified.isRetryable).toBe(true);
      expect(classified.retryAfterSeconds).toBe(2);
    });

    it('classifies DuplicateClientTurnPayloadMismatchError as CONFLICT (409, non-retryable)', () => {
      const err = new DuplicateClientTurnPayloadMismatchError('turn_abc', 'hash_1', 'hash_2');
      const classified = AiFailureClassifier.classify(err);

      expect(classified.category).toBe(AiFailureCategory.CONFLICT);
      expect(classified.statusCode).toBe(409);
      expect(classified.code).toBe('AI_CLIENT_TURN_PAYLOAD_MISMATCH');
      expect(classified.isRetryable).toBe(false);
      expect(classified.retryAfterSeconds).toBeUndefined();
    });

    it('classifies InvalidTurnInputError as VALIDATION_ERROR (400, non-retryable)', () => {
      const err = new InvalidTurnInputError('userPrompt', 'Prompt cannot be empty');
      const classified = AiFailureClassifier.classify(err);

      expect(classified.category).toBe(AiFailureCategory.VALIDATION_ERROR);
      expect(classified.statusCode).toBe(400);
      expect(classified.code).toBe('AI_INVALID_TURN_INPUT');
      expect(classified.isRetryable).toBe(false);
    });

    it('classifies TenantOwnershipViolationError as FORBIDDEN (403, non-retryable)', () => {
      const err = new TenantOwnershipViolationError('conv_123', 'tenant_a', 'tenant_b');
      const classified = AiFailureClassifier.classify(err);

      expect(classified.category).toBe(AiFailureCategory.FORBIDDEN);
      expect(classified.statusCode).toBe(403);
      expect(classified.code).toBe('AI_TENANT_OWNERSHIP_VIOLATION');
      expect(classified.isRetryable).toBe(false);
    });

    it('classifies TransientTransactionFailureError as INTERNAL_ERROR (503, retryable)', () => {
      const err = new TransientTransactionFailureError(
        'saveTurn',
        new Error('Deadlock detected'),
        3,
      );
      const classified = AiFailureClassifier.classify(err);

      expect(classified.category).toBe(AiFailureCategory.INTERNAL_ERROR);
      expect(classified.statusCode).toBe(503);
      expect(classified.code).toBe('AI_TRANSIENT_TRANSACTION_FAILURE');
      expect(classified.isRetryable).toBe(true);
      expect(classified.retryAfterSeconds).toBe(1);
    });

    it('classifies TransactionFailureError as INTERNAL_ERROR (500, retryable)', () => {
      const err = new TransactionFailureError(
        'saveTurn',
        new Error('Fatal database constraint violated'),
      );
      const classified = AiFailureClassifier.classify(err);

      expect(classified.category).toBe(AiFailureCategory.INTERNAL_ERROR);
      expect(classified.statusCode).toBe(500);
      expect(classified.code).toBe('AI_TRANSACTION_FAILURE');
      expect(classified.isRetryable).toBe(true);
    });
  });

  describe('Retrieval & Provider Exceptions', () => {
    it('classifies EmptyRetrievalQueryException as VALIDATION_ERROR (400, non-retryable)', () => {
      const err = new EmptyRetrievalQueryException();
      const classified = AiFailureClassifier.classify(err);

      expect(classified.category).toBe(AiFailureCategory.VALIDATION_ERROR);
      expect(classified.statusCode).toBe(400);
      expect(classified.code).toBe(RetrievalErrorCode.EMPTY_QUERY);
      expect(classified.isRetryable).toBe(false);
    });

    it('classifies UnauthorizedRetrievalException as FORBIDDEN (403, non-retryable)', () => {
      const err = new UnauthorizedRetrievalException('Tenant mismatch on retrieval');
      const classified = AiFailureClassifier.classify(err);

      expect(classified.category).toBe(AiFailureCategory.FORBIDDEN);
      expect(classified.statusCode).toBe(403);
      expect(classified.code).toBe(RetrievalErrorCode.RETRIEVAL_UNAUTHORIZED);
      expect(classified.isRetryable).toBe(false);
    });

    it('classifies ProviderTimeoutException as PROVIDER_TIMEOUT (504, retryable)', () => {
      const err = new ProviderTimeoutException('gemini-1.5-pro timed out');
      const classified = AiFailureClassifier.classify(err);

      expect(classified.category).toBe(AiFailureCategory.PROVIDER_TIMEOUT);
      expect(classified.statusCode).toBe(504);
      expect(classified.code).toBe('PROVIDER_TIMEOUT');
      expect(classified.isRetryable).toBe(true);
      expect(classified.retryAfterSeconds).toBe(3);
    });

    it('classifies LLMProviderUnavailableException as PROVIDER_UNAVAILABLE (503, retryable)', () => {
      const err = new LLMProviderUnavailableException('Gemini service connection refused');
      const classified = AiFailureClassifier.classify(err);

      expect(classified.category).toBe(AiFailureCategory.PROVIDER_UNAVAILABLE);
      expect(classified.statusCode).toBe(503);
      expect(classified.code).toBe('LLM_PROVIDER_UNAVAILABLE');
      expect(classified.isRetryable).toBe(true);
      expect(classified.retryAfterSeconds).toBe(2);
    });

    it('classifies EmbeddingProviderUnavailableException as PROVIDER_UNAVAILABLE (503, retryable)', () => {
      const err = new EmbeddingProviderUnavailableException('Embedding model endpoint unreachable');
      const classified = AiFailureClassifier.classify(err);

      expect(classified.category).toBe(AiFailureCategory.PROVIDER_UNAVAILABLE);
      expect(classified.statusCode).toBe(503);
      expect(classified.code).toBe('EMBEDDING_PROVIDER_UNAVAILABLE');
      expect(classified.isRetryable).toBe(true);
      expect(classified.retryAfterSeconds).toBe(2);
    });

    it('classifies RetrievalDatabaseException as RETRIEVAL_UNAVAILABLE (503, retryable)', () => {
      const err = new RetrievalDatabaseException('Vector store cluster unavailable');
      const classified = AiFailureClassifier.classify(err);

      expect(classified.category).toBe(AiFailureCategory.RETRIEVAL_UNAVAILABLE);
      expect(classified.statusCode).toBe(503);
      expect(classified.code).toBe(RetrievalErrorCode.RETRIEVAL_PERSISTENCE_ERROR);
      expect(classified.isRetryable).toBe(true);
      expect(classified.retryAfterSeconds).toBe(1);
    });
  });

  describe('Message Sanitization & Information Scrubbing', () => {
    it('sanitizes SQL queries and database error messages', () => {
      const sqlError = new Error(
        'SELECT * FROM "users" WHERE "password" = \'secret123\' failed with syntax error',
      );
      const classified = AiFailureClassifier.classify(sqlError);

      expect(classified.message).toBe('An unexpected error occurred during AI processing.');
      expect(classified.message).not.toContain('SELECT');
      expect(classified.message).not.toContain('secret123');
    });

    it('sanitizes Prisma client exception text', () => {
      const prismaError = new Error(
        'PrismaClientKnownRequestError: Unique constraint failed on the fields: (`id`)',
      );
      const classified = AiFailureClassifier.classify(prismaError);

      expect(classified.message).toBe('An unexpected error occurred during AI processing.');
      expect(classified.message).not.toContain('Prisma');
    });

    it('redacts Windows and Unix absolute file paths', () => {
      const message =
        'Failed to load file at C:\\Projects\\secrets\\credentials.json during bootstrap';
      const sanitized = AiFailureClassifier.sanitizeErrorMessage(message);

      expect(sanitized).toBe('The AI subsystem encountered an unexpected internal error.');
      expect(sanitized).not.toContain('C:\\Projects');
    });

    it('redacts Bearer tokens and passwords', () => {
      const message =
        'Auth failure with Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and password: mysecretpassword';
      const sanitized = AiFailureClassifier.sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('mysecretpassword');
      expect(sanitized).toContain('password: [REDACTED]');
      expect(sanitized).toContain('Bearer [REDACTED]');
    });

    it('allows safe, user-facing error descriptions to pass through', () => {
      const message = 'The requested turn identifier does not exist.';
      const sanitized = AiFailureClassifier.sanitizeErrorMessage(message);

      expect(sanitized).toBe('The requested turn identifier does not exist.');
    });
  });
});
