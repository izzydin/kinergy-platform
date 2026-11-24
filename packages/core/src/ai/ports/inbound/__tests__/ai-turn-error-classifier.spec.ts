import { AiTurnErrorClassifier, TurnFailureCategory } from '../ai-turn-error-classifier';

describe('AiTurnErrorClassifier', () => {
  it('classifies null or undefined error as UNKNOWN_FAILURE', () => {
    const result = AiTurnErrorClassifier.classify(null);
    expect(result.category).toBe(TurnFailureCategory.UNKNOWN_FAILURE);
    expect(result.isRetryable).toBe(false);
    expect(result.errorCode).toBe('UNKNOWN_ERROR');
  });

  it('classifies AbortError and cancellation codes as CANCELLATION', () => {
    const abortErr = new Error('This operation was aborted');
    abortErr.name = 'AbortError';

    const result = AiTurnErrorClassifier.classify(abortErr);
    expect(result.category).toBe(TurnFailureCategory.CANCELLATION);
    expect(result.isRetryable).toBe(false);
    expect(result.errorCode).toBe('GENERATION_CANCELLED');
    expect(result.sanitizedErrorMessage).toBe('Turn generation was cancelled.');
  });

  it('classifies provider timeout as GENERATION_TIMEOUT and retryable', () => {
    const timeoutErr = new Error('LLM call timed out after 30000ms');
    timeoutErr.name = 'ProviderTimeoutException';

    const result = AiTurnErrorClassifier.classify(timeoutErr);
    expect(result.category).toBe(TurnFailureCategory.GENERATION_TIMEOUT);
    expect(result.isRetryable).toBe(true);
    expect(result.errorCode).toBe('GENERATION_TIMEOUT');
  });

  it('classifies worker shutdown as WORKER_SHUTDOWN and retryable', () => {
    const shutdownErr = {
      code: 'WORKER_SHUTDOWN',
      message: 'Worker received SIGTERM shutdown signal',
    };

    const result = AiTurnErrorClassifier.classify(shutdownErr);
    expect(result.category).toBe(TurnFailureCategory.WORKER_SHUTDOWN);
    expect(result.isRetryable).toBe(true);
    expect(result.errorCode).toBe('WORKER_SHUTDOWN');
  });

  it('classifies vector store or database errors as RETRIEVAL_FAILURE', () => {
    const dbErr = new Error('Failed to query vector store collection: connection closed');
    dbErr.name = 'RetrievalDatabaseException';

    const result = AiTurnErrorClassifier.classify(dbErr);
    expect(result.category).toBe(TurnFailureCategory.RETRIEVAL_FAILURE);
    expect(result.isRetryable).toBe(true);
  });

  it('sanitizes error messages containing sensitive substrings', () => {
    const sensitiveErr = new Error(
      'Database connection failed at postgres://user:secretpassword@db.internal:5432/kinergy',
    );

    const result = AiTurnErrorClassifier.classify(sensitiveErr);
    expect(result.sanitizedErrorMessage).not.toContain('secretpassword');
    expect(result.sanitizedErrorMessage).not.toContain('5432');
  });
});
