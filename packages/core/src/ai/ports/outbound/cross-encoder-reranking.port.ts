import { RetrievedChunk } from '../../domain/models/retrieved-chunk.model';
import { RerankedChunk } from '../../domain/models/reranked-chunk.model';

export const CROSS_ENCODER_RERANKING_PORT = Symbol('ICrossEncoderRerankingPort');

export interface RerankingRequest {
  readonly query: string;
  readonly candidates: readonly RetrievedChunk[];
  readonly topK: number;
  readonly signal?: AbortSignal;
}

/**
 * Outbound Port defining the boundary for cross-encoder reranking.
 *
 * Enforces:
 * - Provider-agnostic domain contract (zero dependency on Transformers, ONNX, TEI, or Ollama).
 * - Bounded candidate processing with requested top-K output limit.
 * - Guarantees that only pre-authorized candidates reach the reranker.
 * - Reranker cannot perform database queries or introduce unauthorized documents.
 */
export interface ICrossEncoderRerankingPort {
  /**
   * Re-ranks a bounded collection of authorized candidate chunks using
   * pairwise query-chunk cross-attention.
   *
   * @param request The reranking query, bounded candidates, and cutoff topK.
   * @returns An ordered array of RerankedChunk entities sorted by reranker score descending.
   */
  rerank(request: RerankingRequest): Promise<RerankedChunk[]>;
}
