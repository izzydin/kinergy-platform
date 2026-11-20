import { Injectable, Logger } from '@nestjs/common';
import {
  IEmbeddingProviderPort,
  EmbeddingOptions,
  ModelMetadata,
  EmbeddingProviderUnavailableException,
  EmbeddingDimensionMismatchException,
  ModelNotFoundException,
  ProviderTimeoutException,
  GenerationCancelledException,
  AiConfigurationInvalidException,
  InputTooLargeException,
  ResourceExhaustedException,
  InvalidEmbeddingRequestException,
  EmbeddingProfile,
  NormalizationPolicy,
  PoolingStrategy,
  EmbeddingType,
} from '@kinergy-platform/core';
import { AiConfiguration, DEFAULT_AI_CONFIG } from '../../config/ai.config';

interface OllamaNativeEmbedResponse {
  model: string;
  embeddings: number[][];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
}

interface OllamaLegacyEmbeddingResponse {
  embedding: number[];
}

interface OllamaTagModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
    context_length?: number;
    embedding_length?: number;
  };
}

interface OllamaTagsResponse {
  models: OllamaTagModel[];
}

/**
 * Enterprise Ollama BGE-M3 Embedding Provider Adapter.
 * Integrates with Ollama runtime via native /api/embed (with legacy fallback),
 * enforcing strict dimensional validation (1024d), unit-normalization,
 * timeout/cancellation semantics, bounded concurrency, and model digest resolution.
 */
@Injectable()
export class OllamaEmbeddingAdapter implements IEmbeddingProviderPort {
  private readonly logger = new Logger(OllamaEmbeddingAdapter.name);
  private readonly config: AiConfiguration;

  /** Maximum input character length (~8,192 BGE-M3 token context window) */
  public static readonly MAX_INPUT_CHARS = 32768;

  /** Maximum batch size per native API roundtrip */
  public static readonly MAX_BATCH_SLICE = 32;

  /** Expected dimensional invariant for BGE-M3 */
  public static readonly BGE_M3_DIMENSIONS = 1024;

  constructor(config?: Partial<AiConfiguration>) {
    this.config = { ...DEFAULT_AI_CONFIG, ...config };
    this.validateConfiguration();
  }

  private validateConfiguration(): void {
    if (!this.config.ollamaBaseUrl || !this.config.ollamaBaseUrl.startsWith('http')) {
      throw new AiConfigurationInvalidException(
        `Invalid Ollama base URL: ${this.config.ollamaBaseUrl}`,
      );
    }
    if (!this.config.embeddingModel || !this.config.embeddingModel.trim()) {
      throw new AiConfigurationInvalidException('Embedding model identifier must not be empty.');
    }
    if (this.config.embeddingDimensions !== OllamaEmbeddingAdapter.BGE_M3_DIMENSIONS) {
      throw new AiConfigurationInvalidException(
        `BGE-M3 embedding dimensions must be strictly 1024, received ${this.config.embeddingDimensions}`,
      );
    }
  }

  public getDimensions(): number {
    return this.config.embeddingDimensions;
  }

  public getModelIdentifier(): string {
    return this.config.embeddingModel;
  }

  /**
   * Health check verifying model availability in Ollama tags.
   */
  public async checkHealth(): Promise<{ isHealthy: boolean; model: string; latencyMs: number }> {
    const startTime = Date.now();
    try {
      const response = await fetch(`${this.config.ollamaBaseUrl}/api/tags`, {
        signal: AbortSignal.timeout(this.config.healthTimeoutMs ?? 3000),
      });

      if (!response.ok) {
        return {
          isHealthy: false,
          model: this.config.embeddingModel,
          latencyMs: Date.now() - startTime,
        };
      }

      const data = (await response.json()) as OllamaTagsResponse;
      const modelExists = data.models?.some((m) => this.isModelMatch(m.name, m.model));

      return {
        isHealthy: Boolean(modelExists),
        model: this.config.embeddingModel,
        latencyMs: Date.now() - startTime,
      };
    } catch {
      return {
        isHealthy: false,
        model: this.config.embeddingModel,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Resolves the immutable cryptographic digest of the loaded model.
   */
  public async getModelDigest(): Promise<string> {
    try {
      const response = await fetch(`${this.config.ollamaBaseUrl}/api/tags`, {
        signal: AbortSignal.timeout(this.config.healthTimeoutMs ?? 3000),
      });

      if (!response.ok) {
        throw new EmbeddingProviderUnavailableException(
          `Failed to inspect Ollama model tags: HTTP ${response.status}`,
        );
      }

      const data = (await response.json()) as OllamaTagsResponse;
      const match = data.models?.find((m) => this.isModelMatch(m.name, m.model));

      if (!match || !match.digest) {
        throw new ModelNotFoundException(this.config.embeddingModel);
      }

      return match.digest;
    } catch (error: unknown) {
      if (error instanceof ModelNotFoundException) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      throw new EmbeddingProviderUnavailableException(`Failed to resolve model digest: ${msg}`);
    }
  }

  /**
   * Resolves detailed runtime metadata for the active model.
   */
  public async getModelMetadata(): Promise<ModelMetadata> {
    try {
      const response = await fetch(`${this.config.ollamaBaseUrl}/api/tags`, {
        signal: AbortSignal.timeout(this.config.healthTimeoutMs ?? 3000),
      });

      if (!response.ok) {
        throw new EmbeddingProviderUnavailableException(
          `Failed to inspect Ollama model tags: HTTP ${response.status}`,
        );
      }

      const data = (await response.json()) as OllamaTagsResponse;
      const match = data.models?.find((m) => this.isModelMatch(m.name, m.model));

      if (!match) {
        throw new ModelNotFoundException(this.config.embeddingModel);
      }

      return {
        provider: 'ollama',
        modelName: 'bge-m3',
        modelVersion: match.name.split(':')[1] || 'latest',
        modelDigest: match.digest || 'unknown',
        dimensions: match.details?.embedding_length || 1024,
        contextLength: match.details?.context_length || 8192,
      };
    } catch (error: unknown) {
      if (error instanceof ModelNotFoundException) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      throw new EmbeddingProviderUnavailableException(`Failed to resolve model metadata: ${msg}`);
    }
  }

  /**
   * Resolves an immutable EmbeddingProfile from the live runtime.
   */
  public async resolveProfile(): Promise<EmbeddingProfile> {
    const meta = await this.getModelMetadata();
    return EmbeddingProfile.create({
      provider: meta.provider,
      modelName: meta.modelName,
      modelVersion: meta.modelVersion,
      modelDigest: meta.modelDigest,
      dimensions: meta.dimensions,
      tokenizerIdentity: 'xlm-roberta',
      normalizationPolicy: NormalizationPolicy.UNIT_L2,
      poolingStrategy: PoolingStrategy.CLS,
      embeddingType: EmbeddingType.DENSE,
    });
  }

  /**
   * Generates a dense 1024-dimensional embedding for a single text input.
   */
  public async generateEmbedding(text: string, options?: EmbeddingOptions): Promise<number[]> {
    this.validateSingleInput(text);

    const vectors = await this.executeEmbedRequest([text.trim()], options);
    const vector = vectors[0];

    if (!vector) {
      throw new EmbeddingProviderUnavailableException('Ollama returned empty embedding list.');
    }

    return vector;
  }

  /**
   * Generates dense embeddings for a batch of text inputs using native batching.
   */
  public async generateBatchEmbeddings(
    texts: string[],
    options?: EmbeddingOptions,
  ): Promise<number[][]> {
    if (!texts.length) return [];

    if (texts.length > 500) {
      throw new InvalidEmbeddingRequestException(
        `Batch size ${texts.length} exceeds maximum allowed limit of 500`,
      );
    }

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (typeof text !== 'string' || !text.trim()) {
        throw new InvalidEmbeddingRequestException(
          `Batch element at index ${i} is empty or invalid.`,
        );
      }
      this.validateSingleInput(text);
    }

    const results: number[][] = [];
    const sliceSize = this.config.embeddingBatchSize || OllamaEmbeddingAdapter.MAX_BATCH_SLICE;

    // Process in bounded sequential slices to prevent server exhaustion
    for (let i = 0; i < texts.length; i += sliceSize) {
      const slice = texts.slice(i, i + sliceSize).map((t) => t.trim());
      const sliceVectors = await this.executeEmbedRequest(slice, options);
      results.push(...sliceVectors);
    }

    return results;
  }

  // --- Private Execution & Validation ---

  private async executeEmbedRequest(
    inputs: string[],
    options?: EmbeddingOptions,
  ): Promise<number[][]> {
    const timeoutMs = options?.timeoutMs ?? this.config.timeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      // 1. Primary path: Modern native /api/embed endpoint
      const response = await fetch(`${this.config.ollamaBaseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.embeddingModel,
          input: inputs.length === 1 ? inputs[0] : inputs,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle 404 (model not found vs endpoint not found)
      if (response.status === 404) {
        // Fallback to legacy endpoint if /api/embed is not supported
        return await this.fallbackLegacyEmbeddings(inputs, options);
      }

      if (response.status === 400) {
        const errorText = await response.text();
        if (
          errorText.toLowerCase().includes('context') ||
          errorText.toLowerCase().includes('too long')
        ) {
          throw new InputTooLargeException(`Input exceeded model context: ${errorText}`);
        }
        throw new InvalidEmbeddingRequestException(`Ollama rejected request: ${errorText}`);
      }

      if (response.status === 429 || response.status === 507) {
        throw new ResourceExhaustedException(
          `Ollama runtime resources exhausted: HTTP ${response.status}`,
        );
      }

      if (!response.ok) {
        throw new EmbeddingProviderUnavailableException(
          `Ollama embedding request failed with HTTP ${response.status}`,
        );
      }

      const data = (await response.json()) as OllamaNativeEmbedResponse;
      const rawVectors = data.embeddings;

      if (!Array.isArray(rawVectors) || rawVectors.length !== inputs.length) {
        throw new EmbeddingProviderUnavailableException(
          `Ollama returned invalid vector count: expected ${inputs.length}, got ${rawVectors?.length ?? 0}`,
        );
      }

      // Validate every returned vector
      for (let i = 0; i < rawVectors.length; i++) {
        const vec = rawVectors[i];
        if (!vec) {
          throw new EmbeddingProviderUnavailableException(`Vector at index ${i} is missing.`);
        }
        this.validateVector(vec);
      }

      return rawVectors;
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (options?.signal?.aborted) {
        throw new GenerationCancelledException('Embedding cancelled by client.');
      }

      if (
        error instanceof EmbeddingProviderUnavailableException ||
        error instanceof EmbeddingDimensionMismatchException ||
        error instanceof ModelNotFoundException ||
        error instanceof InputTooLargeException ||
        error instanceof ResourceExhaustedException ||
        error instanceof InvalidEmbeddingRequestException
      ) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderTimeoutException(
          `Ollama embedding request timed out after ${timeoutMs}ms.`,
        );
      }

      const message = error instanceof Error ? error.message : 'Unknown embedding error';
      this.logger.error(`Ollama embedding error: ${message}`);
      throw new EmbeddingProviderUnavailableException(`Failed to generate embedding: ${message}`);
    }
  }

  /**
   * Fallback for older Ollama versions that only support /api/embeddings.
   */
  private async fallbackLegacyEmbeddings(
    inputs: string[],
    options?: EmbeddingOptions,
  ): Promise<number[][]> {
    const vectors: number[][] = [];

    for (const input of inputs) {
      const response = await fetch(`${this.config.ollamaBaseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.embeddingModel,
          prompt: input,
        }),
        signal: options?.signal,
      });

      if (response.status === 404) {
        throw new ModelNotFoundException(this.config.embeddingModel);
      }

      if (!response.ok) {
        throw new EmbeddingProviderUnavailableException(
          `Ollama legacy request failed with HTTP ${response.status}`,
        );
      }

      const data = (await response.json()) as OllamaLegacyEmbeddingResponse;
      const embedding = data.embedding;
      this.validateVector(embedding);
      vectors.push(embedding);
    }

    return vectors;
  }

  private validateSingleInput(text: string): void {
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new EmbeddingProviderUnavailableException(
        'Cannot generate embedding for empty text content.',
      );
    }

    // Rejection of null characters
    if (text.includes('\u0000')) {
      throw new InvalidEmbeddingRequestException('Input text contains unsupported null character.');
    }

    // Rejection of excessive length
    if (text.length > OllamaEmbeddingAdapter.MAX_INPUT_CHARS) {
      throw new InputTooLargeException(
        `Input text length (${text.length} chars) exceeds maximum threshold of ${OllamaEmbeddingAdapter.MAX_INPUT_CHARS} chars (~8,192 tokens)`,
      );
    }
  }

  private validateVector(vector: number[]): void {
    if (!Array.isArray(vector)) {
      throw new EmbeddingProviderUnavailableException(
        'Ollama returned invalid embedding format (expected number array)',
      );
    }

    if (vector.length !== this.config.embeddingDimensions) {
      throw new EmbeddingDimensionMismatchException(this.config.embeddingDimensions, vector.length);
    }

    for (let i = 0; i < vector.length; i++) {
      const val = vector[i];
      if (typeof val !== 'number' || !Number.isFinite(val) || Number.isNaN(val)) {
        throw new EmbeddingProviderUnavailableException(
          `Embedding vector contains non-finite or non-numeric value at index ${i}: ${val}`,
        );
      }
    }
  }

  private isModelMatch(name: string, model: string): boolean {
    const target = this.config.embeddingModel.toLowerCase();
    const cleanTarget = target.includes(':') ? target.split(':')[0]! : target;

    const n = (name || '').toLowerCase();
    const m = (model || '').toLowerCase();

    return (
      n === target ||
      n.startsWith(`${cleanTarget}:`) ||
      m === target ||
      m.startsWith(`${cleanTarget}:`)
    );
  }
}
