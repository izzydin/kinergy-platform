import { EmbeddingProfile } from '../../domain/value-objects/embedding-profile.vo';

export interface EmbeddingOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ModelMetadata {
  provider: string;
  modelName: string;
  modelVersion: string;
  modelDigest: string;
  dimensions: number;
  contextLength?: number;
}

export interface IEmbeddingProviderPort {
  generateEmbedding(text: string, options?: EmbeddingOptions): Promise<number[]>;
  generateBatchEmbeddings(texts: string[], options?: EmbeddingOptions): Promise<number[][]>;
  getDimensions(): number; // Strictly returns 1024 for BGE-M3
  getModelIdentifier(): string;
  getModelDigest?(): Promise<string>;
  getModelMetadata?(): Promise<ModelMetadata>;
  resolveProfile?(): Promise<EmbeddingProfile>;
  checkHealth?(): Promise<{ isHealthy: boolean; model: string; latencyMs: number }>;
}
