import { Injectable, Logger } from '@nestjs/common';
import {
  IEmbeddingProviderPort,
  EmbeddingOptions,
  EmbeddingProviderUnavailableException,
  EmbeddingDimensionMismatchException,
  ModelNotFoundException,
  ProviderTimeoutException,
  GenerationCancelledException,
  AiConfigurationInvalidException,
} from '@kinergy-platform/core';
import { AiConfiguration, DEFAULT_AI_CONFIG } from '../../config/ai.config';

interface OllamaEmbeddingResponse {
  embedding: number[];
}

interface OllamaTagModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
}

interface OllamaTagsResponse {
  models: OllamaTagModel[];
}

@Injectable()
export class OllamaEmbeddingAdapter implements IEmbeddingProviderPort {
  private readonly logger = new Logger(OllamaEmbeddingAdapter.name);
  private readonly config: AiConfiguration;
  private readonly batchSize = 16;

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
    if (this.config.embeddingDimensions !== 1024) {
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

  public async checkHealth(): Promise<{ isHealthy: boolean; model: string; latencyMs: number }> {
    const startTime = Date.now();
    try {
      const response = await fetch(`${this.config.ollamaBaseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) {
        return {
          isHealthy: false,
          model: this.config.embeddingModel,
          latencyMs: Date.now() - startTime,
        };
      }

      const data = (await response.json()) as OllamaTagsResponse;
      const modelExists = data.models?.some(
        (m) =>
          m.name === this.config.embeddingModel ||
          m.name.startsWith(`${this.config.embeddingModel}:`) ||
          m.model === this.config.embeddingModel,
      );

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

  public async generateEmbedding(text: string, options?: EmbeddingOptions): Promise<number[]> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new EmbeddingProviderUnavailableException(
        'Cannot generate embedding for empty text content.',
      );
    }

    const timeoutMs = this.config.timeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(`${this.config.ollamaBaseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.embeddingModel,
          prompt: trimmed,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 404) {
        throw new ModelNotFoundException(this.config.embeddingModel);
      }

      if (!response.ok) {
        throw new EmbeddingProviderUnavailableException(
          `Ollama embedding request failed with HTTP ${response.status}`,
        );
      }

      const data = (await response.json()) as OllamaEmbeddingResponse;
      const embedding = data.embedding;

      if (!Array.isArray(embedding)) {
        throw new EmbeddingProviderUnavailableException(
          'Ollama returned invalid embedding format (expected number array)',
        );
      }

      if (embedding.length !== this.config.embeddingDimensions) {
        throw new EmbeddingDimensionMismatchException(
          this.config.embeddingDimensions,
          embedding.length,
        );
      }

      const hasInvalidNumbers = embedding.some(
        (val) => typeof val !== 'number' || !Number.isFinite(val),
      );
      if (hasInvalidNumbers) {
        throw new EmbeddingProviderUnavailableException(
          'Embedding vector contains non-finite or non-numeric values.',
        );
      }

      return embedding;
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (options?.signal?.aborted) {
        throw new GenerationCancelledException('Embedding cancelled by client.');
      }

      if (
        error instanceof EmbeddingProviderUnavailableException ||
        error instanceof EmbeddingDimensionMismatchException ||
        error instanceof ModelNotFoundException
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

  public async generateBatchEmbeddings(
    texts: string[],
    options?: EmbeddingOptions,
  ): Promise<number[][]> {
    if (!texts.length) {
      return [];
    }

    const results: number[][] = [];

    // Process in batches of 16 to avoid GPU VRAM thrashing
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const chunk = texts.slice(i, i + this.batchSize);
      const batchPromises = chunk.map((text) => this.generateEmbedding(text, options));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }
}
