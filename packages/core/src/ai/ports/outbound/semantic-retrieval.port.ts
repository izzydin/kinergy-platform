import { RetrievalQuery } from '../../domain/value-objects/retrieval-query.vo';
import { RetrievedChunk } from '../../domain/models/retrieved-chunk.model';

export const SEMANTIC_RETRIEVAL_PORT = Symbol('ISemanticRetrievalPort');

/**
 * Outbound Port defining the persistence boundary for authorized, tenant-isolated
 * semantic vector retrieval.
 *
 * Keeps PostgreSQL, pgvector, and relational JOIN logic strictly encapsulated
 * within infrastructure adapters.
 */
export interface ISemanticRetrievalPort {
  /**
   * Executes an authorized vector similarity search using cosine distance,
   * joining document and chunk metadata in a single relational query.
   *
   * Invariants:
   * - Must enforce `tenantId` in SQL before ranking and LIMIT.
   * - Must exclude soft-deleted documents (`deleted_at IS NULL`).
   * - Must filter by allowed `visibility_scope`s.
   * - Must order by cosine distance ASC and enforce `LIMIT topK`.
   */
  search(queryVector: readonly number[], query: RetrievalQuery): Promise<RetrievedChunk[]>;

  /**
   * Returns the count of chunks meeting the search criteria and minimum similarity.
   */
  countMatches(queryVector: readonly number[], query: RetrievalQuery): Promise<number>;
}
