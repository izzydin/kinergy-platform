import { EmbeddingProfile } from '../../domain/value-objects/embedding-profile.vo';
import { VectorValues } from '../../domain/value-objects/vector-values.vo';

export const QUERY_EMBEDDING_USE_CASE_PORT = Symbol('IQueryEmbeddingUseCase');

/**
 * Command payload for generating a validated semantic query embedding.
 */
export interface GenerateQueryEmbeddingCommand {
  readonly query: string;
  readonly expectedProfile?: EmbeddingProfile;
  readonly expectedDimensions?: number;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
}

/**
 * Result of query embedding generation, capturing vector values,
 * verified profile metadata, and inference latency telemetry.
 */
export interface QueryEmbeddingResult {
  readonly vector: VectorValues;
  readonly dimensions: number;
  readonly modelIdentifier: string;
  readonly profileId?: string;
  readonly durationMs: number;
  readonly normalizedQuery: string;
}

/**
 * Inbound Port / Application contract for semantic query vector generation.
 * Enforces pre-retrieval validation, normalization, and model compatibility.
 */
export interface IQueryEmbeddingUseCase {
  generateQueryEmbedding(command: GenerateQueryEmbeddingCommand): Promise<QueryEmbeddingResult>;
}
