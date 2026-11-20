import { Injectable, Inject, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  IEmbeddingProviderPort,
  DocumentChunk,
  DocumentEmbedding,
  EmbeddingProfile,
  EmbeddingValidationException,
  GenerationCancelledException,
  ProviderTimeoutException,
  ResourceExhaustedException,
  EmbeddingProviderUnavailableException,
  VectorIndexingErrorCode,
} from '@kinergy-platform/core';
import { AI_EMBEDDING_PROVIDER_TOKEN, AI_CONFIG_TOKEN } from '../ai.tokens';
import { AiConfiguration } from '../config/ai.config';

export interface GenerateEmbeddingsOptions {
  readonly tenantId: string;
  readonly documentId: string;
  readonly documentVersionId: string;
  readonly generationId: string;
  readonly profile: EmbeddingProfile;
  readonly chunks: readonly DocumentChunk[];
  readonly batchSize?: number;
  readonly maxRetries?: number;
  readonly isCancelled?: () => Promise<boolean>;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: EmbeddingPipelineProgress) => Promise<void> | void;
}

export interface EmbeddingPipelineProgress {
  readonly chunksRequested: number;
  readonly chunksEmbedded: number;
  readonly failedChunks: number;
  readonly currentBatch: number;
  readonly totalBatches: number;
  readonly percentComplete: number;
}

export interface FailedChunkEmbedding {
  readonly chunkId: string;
  readonly sequence: number;
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly retryAttempts: number;
  readonly permanent: boolean;
}

export interface EmbeddingPipelineResult {
  readonly documentId: string;
  readonly documentVersionId: string;
  readonly generationId: string;
  readonly profileId: string;
  readonly totalChunksRequested: number;
  readonly successfulEmbeddings: readonly DocumentEmbedding[];
  readonly failedChunks: readonly FailedChunkEmbedding[];
  readonly batchCount: number;
  readonly totalDurationMs: number;
  readonly totalTokensProcessed: number;
  readonly retryCount: number;
}

/**
 * Service that orchestrates reliable, bounded, retryable embedding generation
 * for immutable AI-04 DocumentChunk entities using the approved BGE-M3 runtime.
 *
 * Enforces strict separation between vector generation and downstream vector persistence.
 */
@Injectable()
export class EmbeddingGenerationPipelineService {
  private readonly logger = new Logger(EmbeddingGenerationPipelineService.name);

  constructor(
    @Inject(AI_EMBEDDING_PROVIDER_TOKEN)
    private readonly embeddingProvider: IEmbeddingProviderPort,
    @Inject(AI_CONFIG_TOKEN)
    private readonly config: AiConfiguration,
  ) {}

  /**
   * Executes the embedding generation pipeline over a set of validated chunks.
   */
  public async generateEmbeddings(
    options: GenerateEmbeddingsOptions,
  ): Promise<EmbeddingPipelineResult> {
    const startTime = Date.now();
    const { documentId, documentVersionId, generationId, profile, chunks } = options;

    const maxRetries = options.maxRetries ?? 3;
    const batchSize = Math.max(1, options.batchSize ?? this.config.embeddingBatchSize ?? 16);

    // 1. Validate Input Source Integrity
    this.validateSourceChunks(chunks, documentId, documentVersionId);

    if (chunks.length === 0) {
      return {
        documentId,
        documentVersionId,
        generationId,
        profileId: profile.profileId,
        totalChunksRequested: 0,
        successfulEmbeddings: [],
        failedChunks: [],
        batchCount: 0,
        totalDurationMs: Date.now() - startTime,
        totalTokensProcessed: 0,
        retryCount: 0,
      };
    }

    const totalBatches = Math.ceil(chunks.length / batchSize);
    const successfulEmbeddings: DocumentEmbedding[] = [];
    const failedChunks: FailedChunkEmbedding[] = [];
    let totalTokensProcessed = 0;
    let totalRetries = 0;

    // 2. Bounded Sequential Batch Processing
    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      await this.checkCancellation(options);

      const startOffset = batchIdx * batchSize;
      const batchChunks = chunks.slice(startOffset, startOffset + batchSize);

      let batchSuccess = false;
      let batchAttempts = 0;
      let lastBatchError: unknown = null;

      // Transient Retry Loop for the Batch
      while (!batchSuccess && batchAttempts <= maxRetries) {
        await this.checkCancellation(options);
        batchAttempts++;

        try {
          const texts = batchChunks.map((c) => c.content);
          const vectors = await this.embeddingProvider.generateBatchEmbeddings(texts, {
            signal: options.signal,
            timeoutMs: this.config.timeoutMs,
          });

          if (vectors.length !== batchChunks.length) {
            throw new EmbeddingValidationException(
              `Provider returned ${vectors.length} vectors for batch of ${batchChunks.length} chunks`,
              VectorIndexingErrorCode.DIMENSION_MISMATCH,
            );
          }

          // Build validated DocumentEmbedding entities
          for (let i = 0; i < batchChunks.length; i++) {
            const chunk = batchChunks[i]!;
            const vector = vectors[i]!;
            const contentFingerprint = this.calculateProcessingFingerprint(chunk, profile);

            const embedding = DocumentEmbedding.create({
              chunkId: chunk.id,
              documentId,
              documentVersionId,
              indexGenerationId: generationId,
              profile,
              vector,
              contentFingerprint,
            });

            successfulEmbeddings.push(embedding);
            totalTokensProcessed += chunk.tokenCount;
          }

          batchSuccess = true;
        } catch (error: unknown) {
          lastBatchError = error;
          totalRetries++;

          if (this.isFatalError(error, options)) {
            // Non-retryable error: break out of batch retry loop to fallback
            break;
          }

          if (batchAttempts <= maxRetries) {
            const backoffMs = Math.min(2000, Math.pow(2, batchAttempts) * 150 + Math.random() * 50);
            this.logger.warn(
              `Transient error in batch ${batchIdx + 1}/${totalBatches} (attempt ${batchAttempts}/${maxRetries}): ${this.getErrorMessage(error)}. Backing off ${Math.round(backoffMs)}ms...`,
            );
            await this.sleep(backoffMs);
          }
        }
      }

      // 3. Partial Failure Isolation: If whole batch failed, process items individually
      if (!batchSuccess) {
        this.logger.warn(
          `Batch ${batchIdx + 1} failed after ${batchAttempts} attempts: ${this.getErrorMessage(lastBatchError)}. Falling back to individual chunk processing to isolate failing items...`,
        );

        for (const chunk of batchChunks) {
          await this.checkCancellation(options);
          try {
            const vector = await this.embeddingProvider.generateEmbedding(chunk.content, {
              signal: options.signal,
              timeoutMs: this.config.timeoutMs,
            });

            const contentFingerprint = this.calculateProcessingFingerprint(chunk, profile);
            const embedding = DocumentEmbedding.create({
              chunkId: chunk.id,
              documentId,
              documentVersionId,
              indexGenerationId: generationId,
              profile,
              vector,
              contentFingerprint,
            });

            successfulEmbeddings.push(embedding);
            totalTokensProcessed += chunk.tokenCount;
          } catch (itemError: unknown) {
            const errorCode = this.classifyErrorCode(itemError);
            const errorMessage = this.getErrorMessage(itemError);
            const permanent = this.isPermanentError(itemError);

            failedChunks.push({
              chunkId: chunk.id.value,
              sequence: chunk.sequence,
              errorCode,
              errorMessage,
              retryAttempts: batchAttempts,
              permanent,
            });
          }
        }
      }

      // Progress reporting
      if (options.onProgress) {
        const progress: EmbeddingPipelineProgress = {
          chunksRequested: chunks.length,
          chunksEmbedded: successfulEmbeddings.length,
          failedChunks: failedChunks.length,
          currentBatch: batchIdx + 1,
          totalBatches,
          percentComplete: Math.round(((batchIdx + 1) / totalBatches) * 100),
        };
        await options.onProgress(progress);
      }
    }

    const totalDurationMs = Date.now() - startTime;
    this.logger.log(
      `Embedding pipeline completed for doc ${documentId} (v: ${documentVersionId}): ${successfulEmbeddings.length}/${chunks.length} succeeded, ${failedChunks.length} failed in ${totalDurationMs}ms (${totalBatches} batches, ${totalRetries} retries).`,
    );

    return {
      documentId,
      documentVersionId,
      generationId,
      profileId: profile.profileId,
      totalChunksRequested: chunks.length,
      successfulEmbeddings,
      failedChunks,
      batchCount: totalBatches,
      totalDurationMs,
      totalTokensProcessed,
      retryCount: totalRetries,
    };
  }

  /**
   * Generates a deterministic SHA-256 fingerprint binding chunk content, sequence,
   * document version, and embedding profile identity.
   */
  public calculateProcessingFingerprint(chunk: DocumentChunk, profile: EmbeddingProfile): string {
    const contentHash = createHash('sha256').update(chunk.content).digest('hex');
    const canonicalPayload = [
      `chunkId=${chunk.id.value}`,
      `sequence=${chunk.sequence}`,
      `versionId=${chunk.documentVersionId}`,
      `profileId=${profile.profileId}`,
      `contentSha256=${contentHash}`,
    ].join('|');

    return createHash('sha256').update(canonicalPayload).digest('hex');
  }

  // --- Private Validation & Helpers ---

  private validateSourceChunks(
    chunks: readonly DocumentChunk[],
    documentId: string,
    documentVersionId: string,
  ): void {
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]!;

      if (!c.id || !c.id.value) {
        throw new EmbeddingValidationException(
          `Chunk at index ${i} lacks a valid ChunkId`,
          VectorIndexingErrorCode.CHUNK_NOT_FOUND,
        );
      }

      if (c.documentId !== documentId) {
        throw new EmbeddingValidationException(
          `Chunk ${c.id.value} documentId '${c.documentId}' does not match expected documentId '${documentId}'`,
          VectorIndexingErrorCode.INVALID_PROFILE,
        );
      }

      if (c.documentVersionId !== documentVersionId) {
        throw new EmbeddingValidationException(
          `Chunk ${c.id.value} documentVersionId '${c.documentVersionId}' does not match expected versionId '${documentVersionId}'`,
          VectorIndexingErrorCode.INVALID_PROFILE,
        );
      }

      if (!c.content || !c.content.trim()) {
        throw new EmbeddingValidationException(
          `Chunk ${c.id.value} has empty text content`,
          VectorIndexingErrorCode.EMPTY_PAYLOAD,
        );
      }

      if (!Number.isInteger(c.sequence) || c.sequence < 0) {
        throw new EmbeddingValidationException(
          `Chunk ${c.id.value} sequence must be non-negative integer, received ${c.sequence}`,
          VectorIndexingErrorCode.INVALID_PROFILE,
        );
      }

      if (!c.provenance || !c.provenance.checksum) {
        throw new EmbeddingValidationException(
          `Chunk ${c.id.value} lacks valid provenance metadata checksum`,
          VectorIndexingErrorCode.INVALID_PROFILE,
        );
      }
    }
  }

  private async checkCancellation(options: GenerateEmbeddingsOptions): Promise<void> {
    if (options.signal?.aborted) {
      throw new GenerationCancelledException('Embedding generation pipeline cancelled by signal.');
    }
    if (options.isCancelled) {
      const cancelled = await options.isCancelled();
      if (cancelled) {
        throw new GenerationCancelledException(
          'Embedding generation pipeline cancelled cooperatively.',
        );
      }
    }
  }

  private isFatalError(error: unknown, options: GenerateEmbeddingsOptions): boolean {
    if (options.signal?.aborted || error instanceof GenerationCancelledException) {
      throw error;
    }
    // Dimension mismatches or bad requests are non-retryable for the whole batch
    return (
      error instanceof EmbeddingValidationException ||
      (error instanceof Error && error.message.includes('dimension'))
    );
  }

  private isPermanentError(error: unknown): boolean {
    if (
      error instanceof EmbeddingValidationException ||
      error instanceof GenerationCancelledException
    ) {
      return true;
    }
    const msg = this.getErrorMessage(error).toLowerCase();
    return msg.includes('too large') || msg.includes('dimension') || msg.includes('unsupported');
  }

  private classifyErrorCode(error: unknown): string {
    if (error instanceof ProviderTimeoutException) return VectorIndexingErrorCode.TIMEOUT;
    if (error instanceof GenerationCancelledException) return VectorIndexingErrorCode.CANCELLED;
    if (error instanceof ResourceExhaustedException)
      return VectorIndexingErrorCode.RESOURCE_EXHAUSTED;
    if (error instanceof EmbeddingValidationException)
      return VectorIndexingErrorCode.DIMENSION_MISMATCH;
    if (error instanceof EmbeddingProviderUnavailableException)
      return VectorIndexingErrorCode.MODEL_UNAVAILABLE;
    return VectorIndexingErrorCode.UNCLASSIFIED;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
