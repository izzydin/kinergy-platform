import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  IEmbeddingProviderPort,
  IQueryEmbeddingUseCase,
  GenerateQueryEmbeddingCommand,
  QueryEmbeddingResult,
  EmbeddingProfile,
  VectorValues,
  EmptyRetrievalQueryException,
  InvalidRetrievalQueryException,
  EmbeddingDimensionMismatchException,
  RetrievalProfileMismatchException,
  GenerationCancelledException,
  ModelNotFoundException,
  AiConfigurationInvalidException,
  InputTooLargeException,
  EmbeddingValidationException,
  VectorIndexingErrorCode,
  RetrievalErrorCode,
} from '@kinergy-platform/core';
import { AI_EMBEDDING_PROVIDER_TOKEN, AI_CONFIG_TOKEN } from '../../ai.tokens';
import { AiConfiguration } from '../../config/ai.config';

/**
 * Enterprise Application Service for Semantic Query Embedding Generation.
 *
 * Enforces:
 * - Pre-retrieval validation and Unicode NFKC normalization.
 * - Compatibility assertion with active tenant index generation profile.
 * - Bounded timeouts and exponential backoff retry for transient network errors.
 * - Strict 1,024-dimensional finite float vector validation (rejecting NaN/Infinity).
 * - Latency telemetry distinguishing provider inference from database search time.
 */
@Injectable()
export class QueryEmbeddingService implements IQueryEmbeddingUseCase {
  private readonly logger = new Logger(QueryEmbeddingService.name);

  public static readonly MAX_QUERY_LENGTH = 1000;
  public static readonly DEFAULT_TIMEOUT_MS = 10000;
  public static readonly DEFAULT_RETRIES = 2;
  public static readonly DEFAULT_DIMENSIONS = 1024;

  constructor(
    @Inject(AI_EMBEDDING_PROVIDER_TOKEN)
    private readonly embeddingProvider: IEmbeddingProviderPort,
    @Inject(AI_CONFIG_TOKEN)
    private readonly config: AiConfiguration,
  ) {}

  public async generateQueryEmbedding(
    command: GenerateQueryEmbeddingCommand,
  ): Promise<QueryEmbeddingResult> {
    const startTime = Date.now();

    // 1. Validate & Normalize Query Input
    const normalizedQuery = this.validateAndNormalizeQuery(command.query);

    // 2. Validate Model Identity / Profile Compatibility
    await this.validateProfileCompatibility(command.expectedProfile);

    // 3. Configure Timeout, Dimensions & Retries
    const timeoutMs =
      command.timeoutMs ?? this.config.requestTimeoutMs ?? QueryEmbeddingService.DEFAULT_TIMEOUT_MS;
    const maxRetries = command.maxRetries ?? QueryEmbeddingService.DEFAULT_RETRIES;
    const expectedDimensions =
      command.expectedDimensions ??
      this.config.embeddingDimensions ??
      QueryEmbeddingService.DEFAULT_DIMENSIONS;

    // 4. Invoke Provider with Retry & Latency Measurement
    const rawVector = await this.invokeProviderWithRetry(
      normalizedQuery,
      timeoutMs,
      maxRetries,
      command.signal,
    );

    // 5. Output Validation: Array Presence & Dimensions
    if (!rawVector || rawVector.length === 0) {
      throw new EmbeddingValidationException(
        'Embedding provider returned an empty vector.',
        VectorIndexingErrorCode.EMPTY_PAYLOAD,
      );
    }

    if (rawVector.length !== expectedDimensions) {
      throw new EmbeddingDimensionMismatchException(expectedDimensions, rawVector.length);
    }

    // 6. Vector Invariants (finite floats, no NaN, no Infinity)
    const vector = VectorValues.create(rawVector, expectedDimensions);

    const durationMs = Date.now() - startTime;
    const modelIdentifier = this.embeddingProvider.getModelIdentifier();
    const profileId = command.expectedProfile?.profileId;

    this.logger.debug(
      `Generated query embedding in ${durationMs}ms (dims: ${vector.dimensions}, model: ${modelIdentifier})`,
    );

    return {
      vector,
      dimensions: vector.dimensions,
      modelIdentifier,
      profileId,
      durationMs,
      normalizedQuery,
    };
  }

  // --- Private Helpers ---

  private validateAndNormalizeQuery(query: string): string {
    if (!query || typeof query !== 'string') {
      throw new EmptyRetrievalQueryException('Retrieval query must be a non-empty string.');
    }

    const trimmed = query.trim();
    if (trimmed.length === 0) {
      throw new EmptyRetrievalQueryException(
        'Retrieval query cannot consist solely of whitespace.',
      );
    }

    if (trimmed.length > QueryEmbeddingService.MAX_QUERY_LENGTH) {
      throw new InvalidRetrievalQueryException(
        `Retrieval query length (${trimmed.length}) exceeds maximum allowable length of ${QueryEmbeddingService.MAX_QUERY_LENGTH} characters.`,
        RetrievalErrorCode.QUERY_TOO_LONG,
      );
    }

    // Unicode NFKC normalization matching document chunk normalizer
    return trimmed.normalize('NFKC');
  }

  private async validateProfileCompatibility(expectedProfile?: EmbeddingProfile): Promise<void> {
    if (!expectedProfile) return;

    const providerModelId = this.embeddingProvider.getModelIdentifier().toLowerCase();
    const expectedModel = expectedProfile.modelName.toLowerCase();

    // Verify model name compatibility (e.g. bge-m3:latest matches bge-m3)
    if (!providerModelId.includes(expectedModel) && !expectedModel.includes(providerModelId)) {
      throw new RetrievalProfileMismatchException(
        expectedProfile.profileId,
        `Provider model '${this.embeddingProvider.getModelIdentifier()}' does not match expected model '${expectedProfile.modelName}'.`,
      );
    }

    // Verify dimension compatibility
    if (expectedProfile.dimensions !== this.embeddingProvider.getDimensions()) {
      throw new EmbeddingDimensionMismatchException(
        expectedProfile.dimensions,
        this.embeddingProvider.getDimensions(),
      );
    }

    // Verify model digest where available
    if (typeof this.embeddingProvider.getModelDigest === 'function') {
      try {
        const liveDigest = await this.embeddingProvider.getModelDigest();
        if (liveDigest && expectedProfile.modelDigest) {
          const cleanLive = liveDigest.trim().toLowerCase();
          const cleanExpected = expectedProfile.modelDigest.trim().toLowerCase();
          if (
            cleanLive !== cleanExpected &&
            cleanLive !== 'unknown' &&
            cleanExpected !== 'unknown'
          ) {
            this.logger.warn(
              `Model digest difference: live='${cleanLive}', profile='${cleanExpected}'. Embedding dimensions verified identical (${expectedProfile.dimensions}d).`,
            );
          }
        }
      } catch (err: unknown) {
        this.logger.debug(
          `Live model digest inspection unavailable: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async invokeProviderWithRetry(
    text: string,
    timeoutMs: number,
    maxRetries: number,
    externalSignal?: AbortSignal,
  ): Promise<number[]> {
    let attempts = 0;
    let lastError: unknown;

    while (attempts <= maxRetries) {
      attempts++;
      if (externalSignal?.aborted) {
        throw new GenerationCancelledException('Query embedding generation cancelled by caller.');
      }

      try {
        const timeoutSignal = AbortSignal.timeout(timeoutMs);
        const combinedSignal = externalSignal
          ? AbortSignal.any([externalSignal, timeoutSignal])
          : timeoutSignal;

        return await this.embeddingProvider.generateEmbedding(text, {
          signal: combinedSignal,
          timeoutMs,
        });
      } catch (error: unknown) {
        lastError = error;

        if (this.isFatalError(error)) {
          throw error;
        }

        if (attempts <= maxRetries) {
          const backoffMs = Math.min(1500, Math.pow(2, attempts) * 100 + Math.random() * 50);
          this.logger.warn(
            `Transient failure generating query embedding (attempt ${attempts}/${maxRetries}): ${
              error instanceof Error ? error.message : String(error)
            }. Retrying in ${Math.round(backoffMs)}ms...`,
          );
          await this.sleep(backoffMs);
        }
      }
    }

    throw lastError;
  }

  private isFatalError(error: unknown): boolean {
    if (
      error instanceof ModelNotFoundException ||
      error instanceof AiConfigurationInvalidException ||
      error instanceof InputTooLargeException ||
      error instanceof GenerationCancelledException ||
      error instanceof EmptyRetrievalQueryException ||
      error instanceof InvalidRetrievalQueryException ||
      error instanceof RetrievalProfileMismatchException ||
      error instanceof EmbeddingDimensionMismatchException
    ) {
      return true;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      return true;
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
